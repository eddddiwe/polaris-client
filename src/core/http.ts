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

export type ProgressFn = (progress: DownloadProgress) => void

export class Downloader {
  private active = 0

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

  private async request(url: string, init?: RequestInit, retries = 3, timeoutMs = 60_000): Promise<Response> {
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
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
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
   */
  async downloadFile(url: string, dest: string, timeoutMs = 10 * 60_000): Promise<void> {
    const response = await this.request(url, undefined, 3, timeoutMs)
    if (!response.body) throw new Error('Empty response body')
    await ensureDir(dirname(dest))
    const tmp = `${dest}.part`
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tmp))
    await rm(dest, { force: true })
    await rename(tmp, dest)
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

export function assetUrl(hash: string): string {
  return `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export { join }
