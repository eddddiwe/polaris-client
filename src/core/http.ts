import { createHash, type Hash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { copyOrLink, ensureDir, hashFile } from './fsutil'
import { Logger } from './logger'

export const USER_AGENT = 'PolarisClient/0.1.0 (open-source Minecraft launcher)'

export interface DownloadItem {
  url: string
  dest: string
  sha1?: string
  sha512?: string
  size?: number
  mirror?: string
  label?: string
  optional?: boolean
  /** Reject non-HTTPS, loopback, private, link-local and metadata hosts. */
  strictSource?: boolean
  /** Hard streaming limit, even if the server omits or lies about length. */
  maxBytes?: number
}

export interface DownloadProgress {
  current: number
  total: number
  filesDone: number
  filesTotal: number
  detail: string
}

export interface DownloadFileOptions {
  timeoutMs?: number
  /** Exact byte size published by the release API. */
  expectedSize?: number
  /** SHA-256 digest published by the release API. */
  sha256?: string
}

export type ProgressFn = (progress: DownloadProgress) => void

export class Downloader {
  private active = 0
  private readonly fileDownloads = new Map<string, Promise<number>>()

  constructor(
    private readonly concurrency: number,
    private readonly logger: Logger
  ) {}

  async fetchJson<T>(url: string, init?: RequestInit, retries = 3): Promise<T> {
    const response = await this.request(url, init, retries)
    return (await response.json()) as T
  }

  async fetchText(url: string, retries = 3): Promise<string> {
    const response = await this.request(url, undefined, retries)
    return await response.text()
  }

  private async request(
    url: string,
    init?: RequestInit,
    retries = 3,
    timeoutMs = 60_000,
    allowStatuses: number[] = [],
    strictSource = false
  ): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let current = url
        for (let hop = 0; hop < 6; hop++) {
          if (strictSource) await assertPublicHttpsUrl(current)
          const response = await fetch(current, {
            ...init,
            headers: {
              'User-Agent': USER_AGENT,
              ...(init?.headers ?? {})
            },
            redirect: strictSource ? 'manual' : 'follow',
            signal: AbortSignal.timeout(timeoutMs)
          })
          if (strictSource && [301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location')
            if (!location) throw new Error(`Redirect without a Location header: ${current}`)
            const next = new URL(location, current)
            if (next.protocol !== 'https:') throw new Error('Refusing a non-HTTPS redirect')
            current = next.toString()
            continue
          }
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after') ?? '2')
            await delay(Math.min(30, retryAfter) * 1000)
            break
          }
          if (!response.ok && !allowStatuses.includes(response.status)) {
            throw new Error(`HTTP ${response.status} for ${current}`)
          }
          return response
        }
        if (attempt === retries) throw new Error('Too many redirects')
      } catch (error) {
        lastError = error
        if (attempt < retries) await delay(400 * attempt)
      }
    }
    throw new Error(`Request failed after ${retries} attempts: ${url} (${String(lastError)})`)
  }

  async downloadAll(items: DownloadItem[], onProgress?: ProgressFn): Promise<{ downloaded: number; reused: number }> {
    const unique = dedupeByDest(items)
    const total = unique.reduce((sum, item) => sum + (item.size ?? 0), 0)
    let completedBytes = 0
    let filesDone = 0
    let downloaded = 0
    let reused = 0
    const startedAt = Date.now()

    const report = (detail: string) => {
      if (!onProgress) return
      const elapsed = Math.max(1, Date.now() - startedAt)
      const rate = completedBytes / (elapsed / 1000)
      onProgress({
        current: completedBytes,
        total,
        filesDone,
        filesTotal: unique.length,
        detail: `${detail} · ${(rate / 1024 / 1024).toFixed(1)} MB/s`
      })
    }

    let next = 0
    const worker = async (): Promise<void> => {
      while (next < unique.length) {
        const item = unique[next++]
        const result = await this.downloadOne(item)
        if (result === 'reused') reused++
        else downloaded++
        completedBytes += item.size ?? 0
        filesDone++
        report(`${filesDone}/${unique.length} files`)
      }
    }

    report('Preparing downloads')
    await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, () => worker()))
    return { downloaded, reused }
  }

  /**
   * Download a single file, following redirects. Used for the installer,
   * which GitHub serves through a redirect to its release-asset CDN.
   *
   * A stable `.part` file lets an interrupted download resume with an HTTP
   * Range request. Concurrent calls for the same destination share one
   * promise, so they cannot truncate each other's partial file. Final rename
   * is retried because antivirus scanners briefly lock fresh executables.
   */
  downloadFile(
    url: string,
    dest: string,
    options: DownloadFileOptions | number = {}
  ): Promise<number> {
    const key = dest.toLowerCase()
    const existing = this.fileDownloads.get(key)
    if (existing) return existing
    const run = this.downloadFileResumable(url, dest, options).finally(() => {
      this.fileDownloads.delete(key)
    })
    this.fileDownloads.set(key, run)
    return run
  }

  private async downloadFileResumable(
    url: string,
    dest: string,
    options: DownloadFileOptions | number
  ): Promise<number> {
    const opts = typeof options === 'number' ? { timeoutMs: options } : options
    const timeoutMs = opts.timeoutMs ?? 10 * 60_000
    await ensureDir(dirname(dest))
    const partial = `${dest}.part`

    let offset = (await stat(partial).catch(() => null))?.size ?? 0
    if (opts.expectedSize && opts.expectedSize > 0) {
      if (offset === opts.expectedSize) {
        return await this.finalizeDownload(partial, dest, opts)
      }
      if (offset > opts.expectedSize) {
        await rm(partial, { force: true })
        offset = 0
      }
    }

    let response = await this.request(
      url,
      offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : undefined,
      3,
      timeoutMs,
      [416]
    )
    if (offset > 0 && response.status === 206) {
      this.logger.info('Resuming download', { url, offset })
    }

    if (response.status === 416) {
      await rm(partial, { force: true })
      offset = 0
      response = await this.request(url, undefined, 3, timeoutMs)
    }

    if (!response.body) throw new Error('Empty response body')

    const contentRange = response.headers.get('content-range') ?? ''
    const resumed =
      offset > 0 &&
      response.status === 206 &&
      (!contentRange || contentRange.startsWith(`bytes ${offset}-`))

    if (offset > 0 && !resumed) {
      // The server ignored the range and sent the whole file again.
      await rm(partial, { force: true })
      offset = 0
    }

    const declared = Number(response.headers.get('content-length') ?? 0)
    const expected =
      opts.expectedSize && opts.expectedSize > 0
        ? opts.expectedSize
        : declared > 0
          ? resumed
            ? offset + declared
            : declared
          : 0

    const hasher = opts.sha256 && offset === 0 ? createHash('sha256') : null
    const sink = createWriteStream(partial, { flags: resumed ? 'a' : 'w' })
    const source = Readable.fromWeb(response.body as never)
    if (hasher) {
      await pipeline(source, digestTap([hasher]), sink)
    } else {
      await pipeline(source, sink)
    }

    const written = (await stat(partial)).size
    if (expected > 0 && written !== expected) {
      // A short file may be resumed; an oversized one cannot be trusted.
      if (written > expected) await rm(partial, { force: true })
      throw new Error(`Incomplete download: expected ${expected} bytes, received ${written}`)
    }

    return await this.finalizeDownload(partial, dest, opts, hasher?.digest('hex'))
  }

  private async finalizeDownload(
    partial: string,
    dest: string,
    opts: { expectedSize?: number; sha256?: string },
    digest?: string
  ): Promise<number> {
    const written = (await stat(partial)).size
    if (opts.expectedSize && opts.expectedSize > 0 && written !== opts.expectedSize) {
      throw new Error(`Incomplete download: expected ${opts.expectedSize} bytes, received ${written}`)
    }
    if (opts.sha256) {
      const actual = digest ?? (await hashFile(partial, 'sha256'))
      if (actual.toLowerCase() !== opts.sha256.toLowerCase()) {
        await rm(partial, { force: true })
        throw new Error('Downloaded installer failed its SHA-256 check')
      }
    }
    await replaceFile(partial, dest)
    return written
  }

  private async downloadOne(item: DownloadItem): Promise<'downloaded' | 'reused'> {
    if (await this.isValid(item.dest, item.sha1, item.sha512)) return 'reused'

    if (item.mirror && (await this.isValid(item.mirror, item.sha1, item.sha512))) {
      await ensureDir(dirname(item.dest))
      await copyOrLink(item.mirror, item.dest)
      return 'reused'
    }

    const tmp = `${item.dest}.part`
    try {
      const response = await this.request(
        item.url,
        undefined,
        3,
        60_000,
        [],
        Boolean(item.strictSource)
      )
      await ensureDir(dirname(item.dest))
      if (!response.body) throw new Error('Empty response body')
      const sha1 = item.sha1 ? createHash('sha1') : null
      const sha512 = item.sha512 ? createHash('sha512') : null
      const hashers = [sha1, sha512].filter((hasher): hasher is Hash => hasher !== null)
      const source = Readable.fromWeb(response.body as never)
      const sink = createWriteStream(tmp)
      const limit = item.maxBytes && item.maxBytes > 0 ? byteLimit(item.maxBytes, item.label ?? item.url) : null
      if (hashers.length && limit) {
        await pipeline(source, digestTap(hashers), limit, sink)
      } else if (hashers.length) {
        await pipeline(source, digestTap(hashers), sink)
      } else if (limit) {
        await pipeline(source, limit, sink)
      } else {
        await pipeline(source, sink)
      }
      const written = (await stat(tmp)).size
      if (item.size && written !== item.size) {
        throw new Error(`Incomplete download: expected ${item.size} bytes, received ${written}`)
      }
      if (sha1) {
        const digest = sha1.digest('hex')
        if (digest.toLowerCase() !== item.sha1?.toLowerCase()) {
          throw new Error(`Checksum mismatch for ${item.label ?? item.url}`)
        }
      }
      if (sha512) {
        const digest = sha512.digest('hex')
        if (digest.toLowerCase() !== item.sha512?.toLowerCase()) {
          throw new Error(`SHA-512 mismatch for ${item.label ?? item.url}`)
        }
      }
      await rm(item.dest, { force: true })
      await rename(tmp, item.dest)
      return 'downloaded'
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      if (item.optional) {
        this.logger.warn(`Optional download failed: ${item.url}`, String(error))
        return 'reused'
      }
      throw error
    }
  }

  private async isValid(path: string, sha1?: string, sha512?: string): Promise<boolean> {
    try {
      const s = await stat(path)
      if (s.size <= 0) return false
      // Re-verify on every reuse. A same-user process can modify the cache,
      // and a corrupted jar must never be loaded just because it exists.
      if (sha1) {
        const digest = await hashFile(path, 'sha1')
        if (digest.toLowerCase() !== sha1.toLowerCase()) return false
      }
      if (sha512) {
        const digest = await hashFile(path, 'sha512')
        if (digest.toLowerCase() !== sha512.toLowerCase()) return false
      }
      return true
    } catch {
      return false
    }
  }
}

export async function sha512Of(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function dedupeByDest(items: DownloadItem[]): DownloadItem[] {
  const seen = new Map<string, DownloadItem>()
  for (const item of items) {
    const key = item.dest.toLowerCase()
    const existing = seen.get(key)
    const existingStrength = Number(Boolean(existing?.sha512)) * 2 + Number(Boolean(existing?.sha1))
    const nextStrength = Number(Boolean(item.sha512)) * 2 + Number(Boolean(item.sha1))
    if (!existing || nextStrength > existingStrength) seen.set(key, item)
  }
  return [...seen.values()]
}

function digestTap(hashers: Hash[]): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      for (const hasher of hashers) hasher.update(chunk)
      callback(null, chunk)
    }
  })
}

function byteLimit(maxBytes: number, label: string): Transform {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) {
        callback(new Error(`Download exceeded ${maxBytes} bytes: ${label}`))
        return
      }
      callback(null, chunk)
    }
  })
}

/**
 * Require a public HTTPS URL. This blocks loopback, private, link-local,
 * carrier-grade NAT and cloud metadata endpoints before a request is made.
 * Redirect targets are checked again by Downloader.request.
 */
export async function assertPublicHttpsUrl(value: string): Promise<void> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid download URL')
  }
  if (url.protocol !== 'https:') throw new Error('Downloads must use HTTPS')
  if (url.username || url.password) throw new Error('Download URL must not contain credentials')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Download host is not public')
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Download host is private or reserved')
    return
  }
  const records = await lookup(host, { all: true, verbatim: true })
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Download host resolves to a private or reserved address')
  }
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const parts = address.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true
    }
    const [a, b] = parts
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 0 && parts[2] === 2) ||
      (a === 198 && b === 51 && parts[2] === 100) ||
      (a === 203 && b === 0 && parts[2] === 113) ||
      a >= 224
    )
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff')
    ) {
      return true
    }
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }
  return true
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Move a finished download into place. Windows refuses a rename while an
 * antivirus scanner or a previous installer still holds the destination, so
 * retry briefly instead of failing the whole update.
 */
async function replaceFile(tmp: string, dest: string): Promise<void> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await rm(dest, { force: true })
      await rename(tmp, dest)
      return
    } catch (error) {
      if (attempt === 6) throw error
      await delay(250 * attempt)
    }
  }
}

export function assetUrl(hash: string): string {
  return `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export { join }
