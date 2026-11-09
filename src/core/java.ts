import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { ensureDir } from './fsutil'
import { access, readdir, rename, rm, stat } from 'node:fs/promises'
import { createWriteStream, constants } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { JavaInfo } from '../shared/types'
import { assertPublicHttpsUrl } from './http'
import { assertSafeZip, JAVA_ZIP_LIMITS } from './zipSafe'

const execFileAsync = promisify(execFile)
const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function normalizePath(path: string): string {
  return isWindows ? path.toLowerCase() : path
}

function javaHomeFromExecutable(executable: string): string {
  // <home>/bin/javaw.exe -> <home>; /usr/bin/java -> /usr; /usr/lib/jvm/temurin/bin/java -> /usr/lib/jvm/temurin
  return executable.replace(/[\\/]bin[\\/](java|javaw)(\.exe)?$/i, '')
}

async function isJavaExecutable(path: string): Promise<boolean> {
  const name = basename(path).toLowerCase()
  if (name !== 'java' && name !== 'java.exe' && name !== 'javaw.exe') return false
  // A directory can be named `java` (`C:\Program Files\Java`, `/opt/java`);
  // only a regular file can be spawned. This keeps those roots walkable.
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function locateJavaHome(home: string): Promise<string | null> {
  // A custom path can point directly at a java/javaw binary.
  if (await isJavaExecutable(home)) return home

  const names = isWindows ? ['javaw.exe', 'java.exe'] : ['java']
  for (const name of names) {
    const candidate = join(home, 'bin', name)
    if (await exists(candidate)) return candidate
  }
  return null
}

async function walkForJavaHomes(root: string, depth: number, out: Set<string>, seenDirs = new Set<string>()): Promise<void> {
  if (depth < 0 || out.size > 40) return
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  if (seenDirs.has(normalizePath(root))) return
  seenDirs.add(normalizePath(root))

  const direct = await locateJavaHome(root)
  if (direct) {
    out.add(javaHomeFromExecutable(direct))
    return
  }
  for (const entry of entries) {
    const child = join(root, entry)

    // Check every direct child for a bin/java, even when its folder is named
    // after a version (SDKMAN's 21.0.5-tem, Gradle's jdks, etc.).
    const nested = await locateJavaHome(child)
    if (nested) {
      out.add(javaHomeFromExecutable(nested))
      continue
    }

    // macOS JDKs unpack as *.jdk/Contents/Home.
    if (/\.jdk$/i.test(entry)) {
      const mac = await locateJavaHome(join(child, 'Contents', 'Home'))
      if (mac) {
        out.add(javaHomeFromExecutable(mac))
        continue
      }
    }

    if (!/jdk|jre|java|runtime|temurin|corretto|zulu|liberica|semeru|openjdk|graal/i.test(entry)) continue
    await walkForJavaHomes(child, depth - 1, out, seenDirs)
  }
}

async function pathCandidates(): Promise<string[]> {
  const results: string[] = []
  const names = isWindows ? ['javaw.exe', 'java.exe'] : ['java']
  const pathEntries = (process.env.PATH ?? '').split(delimiter)
  for (const rawEntry of pathEntries) {
    if (!rawEntry) continue
    // Windows PATH entries are sometimes quoted.
    const entry = rawEntry.replace(/^"(.*)"$/, '$1')
    for (const name of names) {
      const candidate = join(entry, name)
      if (await exists(candidate)) {
        results.push(candidate)
        break
      }
    }
  }
  return results
}

function platformRoots(): string[] {
  if (isWindows) {
    return [
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files\\Semeru',
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Eclipse Adoptium') : '',
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Java') : '',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium') : '',
      process.env.APPDATA ? join(process.env.APPDATA, '.minecraft', 'runtime') : '',
      process.env.USERPROFILE ? join(process.env.USERPROFILE, '.jdks') : '',
      process.env.USERPROFILE ? join(process.env.USERPROFILE, '.gradle', 'jdks') : '',
      process.env.USERPROFILE ? join(process.env.USERPROFILE, '.sdkman', 'candidates', 'java') : '',
      join('C:', 'Program Files', 'Android', 'Android Studio', 'jbr')
    ]
  }

  const home = homedir()
  const roots = [
    '/usr/lib/jvm',
    '/usr/lib64/jvm',
    '/usr/java',
    '/opt/java',
    '/opt/jdk',
    home ? join(home, '.sdkman', 'candidates', 'java') : '',
    home ? join(home, '.jdks') : '',
    home ? join(home, '.gradle', 'jdks') : '',
    home ? join(home, '.local', 'share', 'minecraft', 'runtime') : ''
  ]

  if (isMac) {
    roots.push(
      '/Library/Java/JavaVirtualMachines',
      '/System/Library/Java/JavaVirtualMachines',
      home ? join(home, 'Library', 'Java', 'JavaVirtualMachines') : ''
    )
  }
  return roots
}

export async function detectJavaHomes(extraPaths: string[] = []): Promise<string[]> {
  const homes = new Set<string>()
  const roots = [
    process.env.JAVA_HOME ?? '',
    process.env.JDK_HOME ?? '',
    ...platformRoots(),
    ...extraPaths
  ].filter(Boolean)

  for (const root of roots) {
    const executable = await locateJavaHome(root)
    if (executable) {
      homes.add(javaHomeFromExecutable(executable))
      continue
    }
    await walkForJavaHomes(root, 4, homes)
  }
  for (const executable of await pathCandidates()) {
    homes.add(javaHomeFromExecutable(executable))
  }
  return [...homes]
}

function parseMajor(version: string): number {
  if (version.startsWith('1.')) return Number(version.split('.')[1] ?? 0)
  return Number(version.split(/[._+-]/)[0] ?? 0)
}

function inferVersionFromPath(home: string): { major: number; version: string } | null {
  const match = home.match(/(?:jdk|jre|java|zulu|corretto|liberica|semeru|openjdk)[- _]?(\d+(?:\.\d+)*)/i)
  if (!match) return null
  return { version: match[1], major: parseMajor(match[1]) }
}

interface InspectCacheEntry {
  signature: string
  info: JavaInfo
}

// Reuse the result of spawning `java -version` until the binary itself changes.
// A reinstall or update rewrites the file, so mtime/ctime/size no longer match.
const inspectCache = new Map<string, InspectCacheEntry>()
const INSPECT_CACHE_LIMIT = 64
const INSPECT_CONCURRENCY = 4

async function binarySignature(path: string): Promise<string | null> {
  try {
    const info = await stat(path)
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`
  } catch {
    return null
  }
}

export async function inspectJava(home: string, source = 'detected'): Promise<JavaInfo | null> {
  // detectJavaHomes yields three layouts: <home>/bin/java, a PATH shim's
  // executable (Oracle java8path/javapath, Chocolatey) because it has no
  // `bin` segment to strip, and a flat directory holding java[.exe] directly.
  // Accept all of them instead of dropping runtimes whose layout is not `<home>/bin`.
  const homeIsExecutable = await isJavaExecutable(home)
  const dirs = homeIsExecutable ? [dirname(home)] : [join(home, 'bin'), home]
  let binDir = dirs[0]
  let executable = ''
  for (const dir of dirs) {
    for (const name of isWindows ? ['java.exe', 'javaw.exe'] : ['java']) {
      const candidate = join(dir, name)
      if (await exists(candidate)) {
        binDir = dir
        executable = candidate
        break
      }
    }
    if (executable) break
  }
  if (!executable) return null
  const javaw = isWindows ? join(binDir, 'javaw.exe') : ''

  const cacheKey = normalizePath(executable)
  const signature = await binarySignature(executable)
  const cached = signature ? inspectCache.get(cacheKey) : undefined
  if (cached && cached.signature === signature) {
    const path = isWindows && javaw && (await exists(javaw)) ? javaw : executable
    return { ...cached.info, path, source }
  }

  let version = ''
  let vendor = ''
  let spawned = false
  try {
    const { stderr, stdout } = await execFileAsync(executable, ['-XshowSettings:properties', '-version'], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    spawned = true
    const output = `${stdout}\n${stderr}`
    version = output.match(/java\.version\s*=\s*([^\s]+)/)?.[1] ?? ''
    vendor = output.match(/java\.vendor\s*=\s*([^\r\n]+)/)?.[1]?.trim() ?? ''
  } catch {
    // javaw often has no console; fall back to path parsing
  }
  if (!version) {
    const inferred = inferVersionFromPath(homeIsExecutable ? dirname(home) : home)
    if (!inferred) return null
    version = inferred.version
  }
  const major = parseMajor(version)
  if (!major || major < 6) return null
  const info: JavaInfo = {
    path: isWindows && (await exists(javaw)) ? javaw : executable,
    major,
    version,
    vendor: vendor || 'Unknown',
    source
  }
  // Only cache real spawns: a transient timeout should be retried on rescan.
  if (spawned && signature) {
    if (inspectCache.size >= INSPECT_CACHE_LIMIT) {
      const oldest = inspectCache.keys().next().value
      if (oldest !== undefined) inspectCache.delete(oldest)
    }
    inspectCache.set(cacheKey, { signature, info })
  }
  return info
}

/** Inspect homes with a small worker pool so scans do not serialize JVM startups. */
async function inspectHomes(homes: string[]): Promise<(JavaInfo | null)[]> {
  const results: (JavaInfo | null)[] = new Array(homes.length).fill(null)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < homes.length) {
      const index = next++
      results[index] = await inspectJava(homes[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(INSPECT_CONCURRENCY, homes.length) }, worker))
  return results
}

export async function scanJava(extraPaths: string[] = []): Promise<JavaInfo[]> {
  const homes = await detectJavaHomes(extraPaths)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const home of homes) {
    const key = normalizePath(home)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(home)
  }
  const results = (await inspectHomes(unique)).filter((info): info is JavaInfo => info !== null)
  return results.sort((a, b) => b.major - a.major || b.version.localeCompare(a.version))
}

export function selectJava(java: JavaInfo[], requiredMajor: number, override?: string): JavaInfo {
  if (override) {
    const found = java.find((entry) => normalizePath(entry.path) === normalizePath(override))
    // A manually selected runtime wins when it satisfies the version. If it
    // is too old, ignore it and auto-pick a compatible runtime instead of
    // failing the launch.
    if (found && found.major >= requiredMajor) return found
  }
  const exact = java.filter((entry) => entry.major === requiredMajor).sort((a, b) => a.version.localeCompare(b.version))
  if (exact.length) return exact[0]
  const newer = java
    .filter((entry) => entry.major > requiredMajor)
    .sort((a, b) => a.major - b.major || a.version.localeCompare(b.version))
  if (newer.length) return newer[0]
  throw new Error(
    `No compatible Java runtime found. Minecraft ${requiredMajor} needs Java ${requiredMajor}. Install Temurin ${requiredMajor} and rescan.`
  )
}

export async function javaVersionOf(path: string): Promise<JavaInfo | null> {
  const home = javaHomeFromExecutable(path)
  return inspectJava(home, 'custom')
}

export interface JavaDownloadProgress {
  stage: string
  percent: number
  message: string
}

/**
 * Download and install Eclipse Temurin Java runtime.
 * @param major Major Java version (e.g., 21)
 * @param destination Directory to extract Java to
 * @param onProgress Progress callback
 */
/** Determine the required Java major version for a given Minecraft version. */
export function requiredJavaMajor(mcVersion: string): number {
  const parts = mcVersion.split('.').map(Number)
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  // Minecraft 1.20.5+ requires Java 21
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21
  // Minecraft 1.18+ requires Java 17
  if (minor >= 18) return 17
  // Minecraft 1.17 requires Java 16
  if (minor === 17) return 16
  // Older versions need Java 8
  return 8
}

interface AdoptiumAsset {
  binary?: {
    package?: {
      checksum?: string
      name?: string
      size?: number
      link?: string
    }
  }
}

export function javaArchiveExtension(platform: NodeJS.Platform = process.platform): 'zip' | 'tar.gz' {
  return platform === 'win32' ? 'zip' : 'tar.gz'
}

/** Locate the runtime root inside an extracted Temurin archive (handles macOS bundles). */
export async function extractedJavaHome(root: string): Promise<string | null> {
  const candidates = [root]
  for (const entry of await readdir(root).catch(() => [] as string[])) {
    candidates.push(join(root, entry))
    candidates.push(join(root, entry, 'Contents', 'Home'))
  }
  for (const home of candidates) {
    const executable = await locateJavaHome(home)
    if (executable) return javaHomeFromExecutable(executable)
  }
  return null
}

/**
 * Extract through a staging directory so a failed, corrupt or interrupted
 * extraction never leaves a half-written runtime in the final location, and
 * only return a path that actually contains a java executable.
 */
export async function installJavaArchive(
  archivePath: string,
  destination: string,
  onProgress?: (progress: JavaDownloadProgress) => void
): Promise<string> {
  const staging = `${destination}.tmp`
  await ensureDir(destination)
  await rm(staging, { recursive: true, force: true })
  try {
    if (archivePath.endsWith('.zip')) {
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(archivePath)
      const files = assertSafeZip(zip, 'Java runtime archive', JAVA_ZIP_LIMITS).filter(
        (entry) => !entry.isDirectory
      )
      for (const [index, entry] of files.entries()) {
        zip.extractEntryTo(entry, staging, true, true)
        onProgress?.({
          stage: 'extracting',
          percent: 85 + Math.round(((index + 1) / Math.max(1, files.length)) * 15),
          message: `Extracting... ${index + 1}/${files.length}`
        })
      }
    } else {
      // Linux and macOS ship tar.gz; the platform tar preserves the
      // executable bit on bin/java and both targets include it.
      await execFileAsync('tar', ['-xzf', archivePath, '-C', staging], {
        timeout: 5 * 60_000,
        maxBuffer: 1024 * 1024
      })
    }
    const home = await extractedJavaHome(staging)
    if (!home) throw new Error('Java runtime archive did not contain a usable java executable')
    if (home === staging) {
      await rm(destination, { recursive: true, force: true })
      await rename(staging, destination)
      return destination
    }
    const target = join(destination, basename(home))
    await rm(target, { recursive: true, force: true })
    await rename(home, target)
    return target
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Concurrent installs to one destination would share the temp archive and
// staging directory, so callers share the in-flight install instead.
const javaInstalls = new Map<string, Promise<string>>()

export function downloadJava(
  major: number,
  destination: string,
  onProgress?: (progress: JavaDownloadProgress) => void
): Promise<string> {
  // The renderer supplies this value; keep it from escaping the Java directory
  // through `temurin-<major>` or the staging path.
  if (!Number.isInteger(major) || major < 6 || major > 40) {
    return Promise.reject(new Error('Unsupported Java major version'))
  }
  const key = `${normalizePath(destination)}:${major}`
  const task =
    javaInstalls.get(key) ??
    downloadJavaUnlocked(major, destination, onProgress).finally(() => javaInstalls.delete(key))
  javaInstalls.set(key, task)
  return task
}

async function downloadJavaUnlocked(
  major: number,
  destination: string,
  onProgress?: (progress: JavaDownloadProgress) => void
): Promise<string> {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  const metadataUrl = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`

  onProgress?.({ stage: 'downloading', percent: 0, message: 'Fetching Java runtime...' })

  const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(15_000) })
  if (!metadataResponse.ok) throw new Error(`Failed to query Java metadata: ${metadataResponse.status}`)
  const assets = (await metadataResponse.json()) as AdoptiumAsset[]
  const pkg = assets?.[0]?.binary?.package
  const link = String(pkg?.link || '')
  const checksum = String(pkg?.checksum || '').toLowerCase()
  const expectedSize = Number(pkg?.size) || 0
  if (!link || !/^[0-9a-f]{64}$/.test(checksum) || expectedSize < 1_000_000) {
    throw new Error('Java release metadata is missing a SHA-256 or size')
  }
  if (expectedSize > 512 * 1024 * 1024) throw new Error('Java runtime archive is unexpectedly large')
  await assertPublicHttpsUrl(link)

  const response = await fetch(link, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok) throw new Error(`Failed to download Java: ${response.status}`)
  if (!response.body) throw new Error('Empty Java download response')

  const extension = javaArchiveExtension()
  const tempArchive = join(destination, `java-${major}.${extension}`)
  await ensureDir(destination)
  const hash = createHash('sha256')
  let downloaded = 0
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length
      if (downloaded > expectedSize) {
        callback(new Error('Java download exceeded its published size'))
        return
      }
      hash.update(chunk)
      if (downloaded % (1024 * 1024) < chunk.length) {
        onProgress?.({
          stage: 'downloading',
          percent: Math.min(80, Math.round((downloaded / expectedSize) * 80)),
          message: `Downloading... ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(expectedSize / 1024 / 1024)}MB`
        })
      }
      callback(null, chunk)
    }
  })

  try {
    await pipeline(Readable.fromWeb(response.body as never), verifier, createWriteStream(tempArchive))
    if (downloaded !== expectedSize) {
      throw new Error(`Incomplete Java download: expected ${expectedSize} bytes, received ${downloaded}`)
    }
    if (hash.digest('hex') !== checksum) {
      throw new Error('Java runtime failed its SHA-256 verification')
    }
  } catch (error) {
    await rm(tempArchive, { force: true }).catch(() => undefined)
    throw error
  }

  onProgress?.({ stage: 'extracting', percent: 85, message: 'Extracting Java runtime...' })
  try {
    const archive = await stat(tempArchive)
    if (archive.size > 512 * 1024 * 1024) throw new Error('Java runtime archive is too large')
    const javaPath = await installJavaArchive(tempArchive, destination, onProgress)
    onProgress?.({ stage: 'done', percent: 100, message: 'Java runtime installed' })
    return javaPath
  } finally {
    await rm(tempArchive, { force: true }).catch(() => undefined)
  }
}
