import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, basename, extname, join } from 'node:path'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function hashFile(path: string, algorithm: 'sha1' | 'sha256' | 'sha512'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    // Windows editors may save UTF-8 with a BOM. JSON.parse rejects the BOM,
    // which would make a valid instance or settings file look corrupt.
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw.replace(/^\uFEFF/, '')) as T
  } catch {
    return fallback
  }
}

const writeQueues = new Map<string, Promise<void>>()
let atomicTempSeq = 0

/**
 * Serialize writers per destination and give each one its own temp file.
 * Windows rejects concurrent renames to the same target with EPERM, and a
 * shared `${path}.tmp` lets one save truncate or rename another's payload, so
 * a save can reject with ENOENT after writing bytes that overwrite the winner.
 * Queueing also keeps the last call, rather than the last completion, on disk.
 */
async function writeFileAtomic(path: string, value: string): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve()
  const pending = previous.catch(() => undefined).then(async () => {
    await ensureDir(dirname(path))
    const tmp = `${path}.${process.pid}-${atomicTempSeq++}.tmp`
    try {
      await writeFile(tmp, value, 'utf8')
      await rename(tmp, path)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw error
    }
  })
  writeQueues.set(path, pending)
  try {
    await pending
  } finally {
    if (writeQueues.get(path) === pending) writeQueues.delete(path)
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value, null, 2))
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await writeFileAtomic(path, value)
}

export async function copyOrLink(source: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  try {
    await link(source, dest)
    return
  } catch {
    // Cross-device links are unsupported; fall back to a staged copy.
  }
  // Copy to a unique sibling and rename only after it is complete. A kill
  // mid-copy must never publish a truncated file at `dest`: the install cache
  // only checks that classpath files exist and are non-empty, so a partial
  // library there would be accepted on every later launch. The unique name
  // also avoids colliding with the downloader's `${dest}.part`.
  const partial = `${dest}.${process.pid}-${atomicTempSeq++}.part`
  try {
    await copyFile(source, partial)
    await rename(partial, dest)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function moveIntoPlace(tmp: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  await rm(dest, { force: true })
  await rename(tmp, dest)
}

export async function safeFilename(name: string, fallback = 'mod.jar'): Promise<string> {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[.\s]+$/g, '')
  if (!clean || clean === '.' || clean === '..') return fallback
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(clean)) return fallback
  if (clean.length > 180) {
    const dot = clean.lastIndexOf('.')
    const ext = dot > 0 && clean.length - dot <= 12 ? clean.slice(dot) : ''
    return clean.slice(0, 180 - ext.length) + ext
  }
  return clean
}

export function assertSafeSegment(value: string, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export function isSafeSegment(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    try {
      const info = await stat(full)
      if (info.isDirectory()) total += await dirSize(full)
      else total += info.size
    } catch {
      // ignore racing deletions
    }
  }
  return total
}

export function jarStem(filename: string): string {
  const ext = extname(filename)
  return ext === '.jar' ? basename(filename, ext) : basename(filename)
}

export function friendlyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base} (${i})`)) i++
  return `${base} (${i})`
}

export { createWriteStream }
export { join, basename, dirname, extname }
