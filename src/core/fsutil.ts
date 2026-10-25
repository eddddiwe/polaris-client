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

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rename(tmp, path)
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = `${path}.tmp`
  await writeFile(tmp, value, 'utf8')
  await rename(tmp, path)
}

export async function copyOrLink(source: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  try {
    await link(source, dest)
  } catch {
    await copyFile(source, dest)
  }
}

export async function moveIntoPlace(tmp: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  await rm(dest, { force: true })
  await rename(tmp, dest)
}

export async function safeFilename(name: string, fallback = 'mod.jar'): Promise<string> {
  const clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return clean.length > 0 ? clean : fallback
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
