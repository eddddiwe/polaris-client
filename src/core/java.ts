import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { ensureDir } from './fsutil'
import { access, readdir, rm, stat } from 'node:fs/promises'
import { createWriteStream, constants } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
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
  return exists(path)
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

export async function inspectJava(home: string, source = 'detected'): Promise<JavaInfo | null> {
  const binDir = join(home, 'bin')
  const java = join(binDir, isWindows ? 'java.exe' : 'java')
  const javaw = isWindows ? join(binDir, 'javaw.exe') : ''
  const executable = (await exists(java)) ? java : javaw
  if (!executable || !(await exists(executable))) return null

  let version = ''
  let vendor = ''
  try {
    const { stderr, stdout } = await execFileAsync(executable, ['-XshowSettings:properties', '-version'], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    const output = `${stdout}\n${stderr}`
    version = output.match(/java\.version\s*=\s*([^\s]+)/)?.[1] ?? ''
    vendor = output.match(/java\.vendor\s*=\s*([^\r\n]+)/)?.[1]?.trim() ?? ''
  } catch {
    // javaw often has no console; fall back to path parsing
  }
  if (!version) {
    const inferred = inferVersionFromPath(home)
    if (!inferred) return null
    version = inferred.version
  }
  const major = parseMajor(version)
  if (!major || major < 6) return null
  return {
    path: isWindows && (await exists(javaw)) ? javaw : executable,
    major,
    version,
    vendor: vendor || 'Unknown',
    source
  }
}

export async function scanJava(extraPaths: string[] = []): Promise<JavaInfo[]> {
  const homes = await detectJavaHomes(extraPaths)
  const results: JavaInfo[] = []
  const seen = new Set<string>()
  for (const home of homes) {
    const key = normalizePath(home)
    if (seen.has(key)) continue
    seen.add(key)
    const info = await inspectJava(home)
    if (info) results.push(info)
  }
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

export async function downloadJava(
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

  const tempZip = join(destination, `java-${major}.zip`)
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
    await pipeline(Readable.fromWeb(response.body as never), verifier, createWriteStream(tempZip))
    if (downloaded !== expectedSize) {
      throw new Error(`Incomplete Java download: expected ${expectedSize} bytes, received ${downloaded}`)
    }
    if (hash.digest('hex') !== checksum) {
      throw new Error('Java runtime failed its SHA-256 verification')
    }
  } catch (error) {
    await rm(tempZip, { force: true }).catch(() => undefined)
    throw error
  }

  onProgress?.({ stage: 'extracting', percent: 85, message: 'Extracting Java runtime...' })
  try {
    const archive = await stat(tempZip)
    if (archive.size > 512 * 1024 * 1024) throw new Error('Java runtime archive is too large')
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(tempZip)
    const entries = assertSafeZip(zip, 'Java runtime archive', JAVA_ZIP_LIMITS)
    let extracted = 0
    const total = entries.filter((entry) => !entry.isDirectory).length
    for (const entry of entries) {
      if (entry.isDirectory) continue
      zip.extractEntryTo(entry, destination, true, true)
      extracted++
      onProgress?.({
        stage: 'extracting',
        percent: 85 + Math.round((extracted / Math.max(1, total)) * 15),
        message: `Extracting... ${extracted}/${total}`
      })
    }
  } finally {
    await rm(tempZip, { force: true }).catch(() => undefined)
  }

  const entries = await readdir(destination)
  const javaHome = entries.find((entry) => /jdk|jre|java/i.test(entry))
  const javaPath = javaHome ? join(destination, javaHome) : destination

  onProgress?.({ stage: 'done', percent: 100, message: 'Java runtime installed' })
  return javaPath
}
