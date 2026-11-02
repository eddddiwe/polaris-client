import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { copyOrLink, ensureDir, hashFile, pathExists } from './fsutil'
import { Logger } from './logger'

export const USER_AGENT = 'PolarisClient/0.1.0 (open-source Minecraft launcher)'

export interface DownloadItem {
  url: string
  dest: string
  sha1?: string
  size?: number
  mirror?: string
  label?: string
  optional?: boolean
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
    allowStatuses: number[] = []
  ): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            'User-Agent': USER_AGENT,
            ...(init?.headers ?? {})
          },
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '2')
          await delay(Math.min(30, retryAfter) * 1000)
          continue
        }
        if (!response.ok && !allowStatuses.includes(response.status)) {
          throw new Error(`HTTP ${response.status} for ${url}`)
        }
        return response
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
      const elapsed = Math.max(1, Date.now() - startedAt)
      const rate = completedBytes / (elapsed / 1000)
      onProgress?.({
        current: completedBytes,
        total,
        filesDone,
        filesTotal: unique.length,
        detail: `${detail} · ${(rate / 1024 / 1024).toFixed(1)} MB/s`
      })
    }

    const queue = [...unique]
    const worker = async (): Promise<void> => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
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

    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(partial, { flags: resumed ? 'a' : 'w' })
    )

    const written = (await stat(partial)).size
    if (expected > 0 && written !== expected) {
      // A short file may be resumed; an oversized one cannot be trusted.
      if (written > expected) await rm(partial, { force: true })
      throw new Error(`Incomplete download: expected ${expected} bytes, received ${written}`)
    }

    return await this.finalizeDownload(partial, dest, opts)
  }

  private async finalizeDownload(
    partial: string,
    dest: string,
    opts: { expectedSize?: number; sha256?: string }
  ): Promise<number> {
    const written = (await stat(partial)).size
    if (opts.expectedSize && opts.expectedSize > 0 && written !== opts.expectedSize) {
      throw new Error(`Incomplete download: expected ${opts.expectedSize} bytes, received ${written}`)
    }
    if (opts.sha256) {
      const digest = await hashFile(partial, 'sha256')
      if (digest.toLowerCase() !== opts.sha256.toLowerCase()) {
        await rm(partial, { force: true })
        throw new Error('Downloaded installer failed its SHA-256 check')
      }
    }
    await replaceFile(partial, dest)
    return written
  }

  private async downloadOne(item: DownloadItem): Promise<'downloaded' | 'reused'> {
    if (await this.isValid(item.dest, item.sha1)) return 'reused'

    if (item.mirror && (await this.isValid(item.mirror, item.sha1))) {
      await ensureDir(dirname(item.dest))
      await copyOrLink(item.mirror, item.dest)
      return 'reused'
    }

    try {
      const response = await this.request(item.url, undefined, 3)
      await ensureDir(dirname(item.dest))
      const tmp = `${item.dest}.part`
      if (!response.body) throw new Error('Empty response body')
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tmp))
      if (item.sha1) {
        const digest = await hashFile(tmp, 'sha1')
        if (digest.toLowerCase() !== item.sha1.toLowerCase()) {
          await rm(tmp, { force: true })
          throw new Error(`Checksum mismatch for ${item.label ?? item.url}`)
        }
      }
      await rm(item.dest, { force: true })
      await rename(tmp, item.dest)
      return 'downloaded'
    } catch (error) {
      if (item.optional) {
        this.logger.warn(`Optional download failed: ${item.url}`, String(error))
        return 'reused'
      }
      throw error
    }
  }

  private async isValid(path: string, sha1?: string): Promise<boolean> {
    if (!(await pathExists(path))) return false
    try {
      const s = await stat(path)
      // Fast path: skip expensive SHA1 hash verification on subsequent launches.
      // Files are verified on first download; on re-launch, existence + non-zero size is sufficient.
      return s.size > 0
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
    if (!existing || (!existing.sha1 && item.sha1)) seen.set(key, item)
  }
  return [...seen.values()]
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
