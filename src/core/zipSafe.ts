import AdmZip from 'adm-zip'

export interface ZipLimits {
  maxEntries: number
  maxEntryBytes: number
  maxTotalBytes: number
}

export const MODPACK_ZIP_LIMITS: ZipLimits = {
  maxEntries: 20_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024 * 1024
}

export const JAVA_ZIP_LIMITS: ZipLimits = {
  maxEntries: 50_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024
}

/**
 * Reject duplicate names, traversal/absolute paths, drive letters, NTFS
 * alternate data streams and declared sizes over the limit. `adm-zip`
 * sanitizes extraction targets, but validating first makes archive attacks
 * fail before any bytes are written.
 */
export function assertSafeZip(zip: AdmZip, label: string, limits: ZipLimits): AdmZip.IZipEntry[] {
  const entries = zip.getEntries()
  if (entries.length > limits.maxEntries) {
    throw new Error(`${label} contains too many files`)
  }
  const seen = new Set<string>()
  let total = 0
  for (const entry of entries) {
    const name = String(entry.entryName || '').replace(/\\/g, '/')
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
      throw new Error(`${label} contains an unsafe path`)
    }
    const pathName = entry.isDirectory && name.endsWith('/') ? name.slice(0, -1) : name
    const segments = pathName.split('/')
    if (
      segments.some(
        (segment) =>
          segment === '' ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':') ||
          /[.\s]$/.test(segment)
      )
    ) {
      throw new Error(`${label} contains an unsafe path`)
    }
    if (entry.isDirectory) continue
    const key = name.toLowerCase()
    if (seen.has(key)) throw new Error(`${label} contains duplicate entry names`)
    seen.add(key)
    const size = Number(entry.header?.size) || 0
    if (size < 0 || size > limits.maxEntryBytes) {
      throw new Error(`${label} contains an oversized file`)
    }
    total += size
    if (total > limits.maxTotalBytes) {
      throw new Error(`${label} expands beyond the size limit`)
    }
  }
  return entries
}

export function readZipText(
  entry: AdmZip.IZipEntry,
  label: string,
  maxBytes = 8 * 1024 * 1024
): string {
  return readZipEntry(entry, maxBytes, label).toString('utf8')
}

export function readZipEntry(
  entry: AdmZip.IZipEntry,
  maxBytes: number,
  label: string
): Buffer {
  if ((Number(entry.header?.size) || 0) > maxBytes) {
    throw new Error(`${label} is too large`)
  }
  const data = entry.getData()
  // Declared sizes can lie (including a zero declared size). Enforce the
  // limit again on the bytes that were actually produced.
  if (data.length > maxBytes) throw new Error(`${label} is too large`)
  return data
}
