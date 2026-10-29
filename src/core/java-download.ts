import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureDir, pathExists } from './fsutil'
import type { JavaInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

const RUNTIME_MANIFEST_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a75b9c8b7c3f2422553692b6bd2/all.json'

interface RuntimeEntry {
  version: { name: string; released: string }
  manifest: { url: string; sha1: string; size: number }
  binary: { url: string; sha1: string; size: number }
}

interface RuntimeManifest {
  [platform: string]: {
    [runtimeName: string]: RuntimeEntry[]
  }
}

function platformKey(): string {
  if (process.platform === 'win32') return 'windows-x64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return 'linux'
}

function runtimeNameForMajor(major: number): string {
  if (major >= 21) return 'java-runtime-gamma'
  if (major >= 17) return 'java-runtime-beta'
  if (major >= 16) return 'java-runtime-alpha'
  return 'jre-legacy'
}

export async function downloadJavaRuntime(
  major: number,
  javaDir: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  // Fetch manifest
  const res = await fetch(RUNTIME_MANIFEST_URL)
  if (!res.ok) throw new Error(`Failed to fetch Java runtime manifest: ${res.status}`)
  const manifest = (await res.json()) as RuntimeManifest

  const platform = platformKey()
  const runtimeName = runtimeNameForMajor(major)
  const entries = manifest[platform]?.[runtimeName]
  if (!entries || entries.length === 0) {
    throw new Error(`No Java ${major} runtime available for ${platform}`)
  }

  // Pick the latest entry
  const entry = entries[entries.length - 1]
  const binary = entry.binary

  const destDir = join(javaDir, `java-${major}`)
  await ensureDir(destDir)
  const archivePath = join(javaDir, `java-${major}.tar.gz`)

  // Download binary
  const response = await fetch(binary.url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  const total = binary.size
  let downloaded = 0
  const fileStream = createWriteStream(archivePath)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(value)
    downloaded += value.length
    onProgress?.(downloaded, total)
  }
  fileStream.close()

  // Extract (tar.gz on Linux/Mac, zip on Windows)
  // Use tar/7z or node libraries
  if (process.platform === 'win32') {
    // Windows: use PowerShell Expand-Archive or 7z
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(destDir, true)
  } else {
    // Linux/Mac: use tar
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir], { timeout: 120000 })
  }

  // Find the java home (might be nested)
  const { readdir } = await import('node:fs/promises')
  let javaHome = destDir
  try {
    const entries = await readdir(destDir)
    if (entries.length === 1) {
      const nested = join(destDir, entries[0])
      const binDir = join(nested, 'bin')
      if (await pathExists(join(binDir, process.platform === 'win32' ? 'java.exe' : 'java'))) {
        javaHome = nested
      }
    }
  } catch { /* use destDir */ }

  // Cleanup archive
  await rm(archivePath, { force: true })

  return javaHome
}

export async function listAvailableJavaVersions(): Promise<number[]> {
  try {
    const res = await fetch(RUNTIME_MANIFEST_URL)
    if (!res.ok) return []
    const manifest = (await res.json()) as RuntimeManifest
    const platform = platformKey()
    const runtimes = manifest[platform] ?? {}
    const versions = new Set<number>()
    for (const name of Object.keys(runtimes)) {
      const match = name.match(/java-runtime-(\w+)/)
      if (match) {
        // Map runtime names to versions
        if (name.includes('gamma')) versions.add(21)
        else if (name.includes('beta')) versions.add(17)
        else if (name.includes('alpha')) versions.add(16)
        else if (name.includes('legacy')) versions.add(8)
      }
    }
    return [...versions].sort((a, b) => b - a)
  } catch {
    return []
  }
}
