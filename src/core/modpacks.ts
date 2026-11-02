import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import AdmZip from 'adm-zip'
import type {
  InstanceConfig,
  InstalledMod,
  LoaderType,
  ModpackRef
} from '../shared/types'
import type { Paths } from './paths'
import { assertPublicHttpsUrl, type Downloader, type DownloadItem } from './http'
import type { Logger } from './logger'
import type { ProgressHub } from './events'
import type { ModrinthClient, ModrinthVersion } from './modrinth'
import { pickVersion, primaryFileAny } from './modrinth'
import { ensureDir, safeFilename } from './fsutil'
import {
  assertSafeZip,
  MODPACK_ZIP_LIMITS,
  readZipEntry,
  readZipText
} from './zipSafe'

const MAX_MODPACK_ARCHIVE_BYTES = 1024 * 1024 * 1024
const MAX_MODPACK_FILE_BYTES = 512 * 1024 * 1024
const MAX_OVERRIDE_BYTES = 256 * 1024 * 1024
const MAX_MODPACK_TOTAL_FILES = 4096

/** modrinth.index.json inside an .mrpack archive. */
export interface MrpackIndex {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: {
    path: string
    hashes?: { sha1?: string; sha512?: string }
    env?: { client?: string; server?: string }
    downloads?: string[]
    fileSize?: number
  }[]
  dependencies?: Record<string, string>
}

export interface MrpackPlan {
  name: string
  packVersion: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  files: {
    path: string
    url: string
    sha1?: string
    sha512?: string
    size?: number
    optional: boolean
  }[]
}

/**
 * Pure parse/validate step: turns the raw index JSON into an install plan for a
 * client instance. Throws on unsupported formats so the UI gets clear errors.
 */
export function parseMrpackIndex(raw: string, fallbackGameVersion?: string): MrpackPlan {
  let index: MrpackIndex
  try {
    index = JSON.parse(raw.replace(/^\uFEFF/, '')) as MrpackIndex
  } catch {
    throw new Error('modrinth.index.json is not valid JSON')
  }
  if (index.game !== 'minecraft') throw new Error('Only Minecraft modpacks are supported')
  if (index.formatVersion !== 1) throw new Error(`Unsupported mrpack format version ${index.formatVersion}`)

  const dependencies = index.dependencies ?? {}
  const minecraft = cleanDependency(dependencies.minecraft) ?? fallbackGameVersion
  if (!minecraft) throw new Error('This modpack does not declare a Minecraft version')

  const loaderVersion = cleanDependency(dependencies['fabric-loader'])
  let loader: LoaderType = 'vanilla'
  if (loaderVersion) loader = 'fabric'
  else if (dependencies['quilt-loader'] || dependencies.forge || dependencies['neo-forge'] || dependencies.neoforge) {
    throw new Error('Only Fabric modpacks are supported in this release (Quilt/Forge packs were rejected)')
  }

  if ((index.files ?? []).length > MAX_MODPACK_TOTAL_FILES) {
    throw new Error('Modpack declares too many files')
  }
  const files = (index.files ?? []).flatMap((file) => {
    const env = file.env?.client ?? 'required'
    if (env === 'unsupported') return []
    const url = file.downloads?.[0]
    if (!url) return []
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`Modpack file ${file.path} has an invalid download URL`)
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`Modpack file ${file.path} must be downloaded over HTTPS`)
    }
    const path = normalizeArchivePath(file.path)
    if (!path) throw new Error(`Modpack contains an unsafe file path: ${file.path}`)
    const sha1 = cleanHash(file.hashes?.sha1, 40)
    const sha512 = cleanHash(file.hashes?.sha512, 128)
    if (!sha1 && !sha512) {
      throw new Error(`Modpack file ${file.path} is missing a SHA-1 or SHA-512 checksum`)
    }
    if (file.fileSize && (!Number.isFinite(file.fileSize) || file.fileSize > MAX_MODPACK_FILE_BYTES)) {
      throw new Error(`Modpack file ${file.path} is too large`)
    }
    return [
      {
        path,
        url,
        sha1,
        sha512,
        size: file.fileSize,
        optional: env === 'optional'
      }
    ]
  })

  return {
    name: index.name ?? 'Modpack',
    packVersion: index.versionId ?? '0',
    mcVersion: minecraft,
    loader,
    loaderVersion: loaderVersion ?? undefined,
    files
  }
}

function cleanHash(value: string | undefined, length: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const hash = value.trim().toLowerCase()
  return hash.length === length && /^[0-9a-f]+$/.test(hash) ? hash : undefined
}

/** "1.21.4", ">=1.21" or "~1.20.1" → exact version when unambiguous, else null. */
export function cleanDependency(spec: string | undefined): string | null {
  if (!spec) return null
  const trimmed = spec.trim()
  if (/^[0-9][A-Za-z0-9._-]*$/.test(trimmed)) return trimmed
  return null
}

/**
 * Zip-entry path → safe absolute destination inside the instance directory.
 * Returns null for traversal attempts, absolute paths and empty segments.
 */
export function safeOverridePath(instanceDir: string, entryName: string, prefix: string): string | null {
  const normalized = entryName.replace(/\\/g, '/')
  if (!normalized.startsWith(prefix)) return null
  const relative = normalized.slice(prefix.length).replace(/^\/+/, '')
  if (!relative || relative.endsWith('/')) return null
  if (
    relative
      .split('/')
      .some(
        (segment) =>
          segment === '' ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':') ||
          /[.\s]$/.test(segment)
      )
  ) {
    return null
  }
  const root = resolve(instanceDir)
  const target = resolve(root, relative)
  if (!target.toLowerCase().startsWith((root + sep).toLowerCase())) return null
  return target
}

/**
 * Normalizes an archive-relative path (modrinth.index files[].path).
 * Rejects absolute paths, drive letters and traversal segments.
 */
export function normalizeArchivePath(input: string): string | null {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return null
  if (/^[A-Za-z]:/.test(normalized)) return null
  const segments = normalized.split('/')
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
    return null
  }
  return normalized
}

export interface ModpackInstallResult {
  instance: InstanceConfig
  modpack: ModpackRef
  filesInstalled: number
  filesSkipped: number
  overridesExtracted: number
}

export class ModpackService {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader,
    private readonly modrinth: ModrinthClient,
    private readonly progress: ProgressHub,
    private readonly logger: Logger
  ) {}

  /** Newest preferred pack version (release first, like mod installs). */
  async choosePackVersion(projectId: string): Promise<ModrinthVersion | undefined> {
    const versions = await this.modrinth.versions(projectId, '', '')
    return pickVersion(versions)
  }

  async plan(ref: string): Promise<{ projectId: string; slug: string; title: string; version: ModrinthVersion; plan: MrpackPlan; archivePath: string }> {
    const project = await this.modrinth.project(ref)
    if (project.project_type !== 'modpack') throw new Error(`${project.title} is not a modpack`)
    const version = await this.choosePackVersion(project.id)
    if (!version) throw new Error(`${project.title} has no downloadable releases`)
    const file = primaryFileAny(version)
    if (!file || !file.filename.endsWith('.mrpack')) throw new Error(`${project.title} has no .mrpack file`)
    const archivePath = join(this.paths.downloads, await safeFilename(file.filename, 'pack.mrpack'))
    await this.downloader.downloadAll([
      {
        url: file.url,
        dest: archivePath,
        sha1: file.hashes.sha1,
        sha512: file.hashes.sha512,
        size: file.size,
        // Fall back to the server's declared size only if it is sane.
        maxBytes: file.size && file.size > 0 ? file.size : MAX_MODPACK_ARCHIVE_BYTES,
        strictSource: true,
        label: `${project.title} ${version.version_number}`
      }
    ])
    const archive = await stat(archivePath)
    if (archive.size <= 0 || archive.size > MAX_MODPACK_ARCHIVE_BYTES) {
      throw new Error('Downloaded modpack archive is too large')
    }
    const zip = new AdmZip(await readFile(archivePath))
    assertSafeZip(zip, 'Modpack archive', MODPACK_ZIP_LIMITS)
    const indexEntry = zip.getEntry('modrinth.index.json')
    if (!indexEntry) throw new Error('Archive is missing modrinth.index.json')
    const plan = parseMrpackIndex(readZipText(indexEntry, 'modrinth.index.json'), version.game_versions[0])
    return { projectId: project.id, slug: project.slug, title: project.title, version, plan, archivePath }
  }

  /**
   * Extract overrides and download every client-required file into an already
   * created instance directory. Builds a best-effort Polaris mod index so the
   * installed mods show metadata instead of raw filenames.
   */
  async populate(
    instance: InstanceConfig,
    archivePath: string,
    plan: MrpackPlan,
    opts: { includeOptional: boolean }
  ): Promise<{ filesInstalled: number; filesSkipped: number; overridesExtracted: number }> {
    const instanceDir = join(this.paths.instances, instance.id)
    await ensureDir(instanceDir)

    const archive = await stat(archivePath)
    if (archive.size <= 0 || archive.size > MAX_MODPACK_ARCHIVE_BYTES) {
      throw new Error('Modpack archive is too large')
    }
    const zip = new AdmZip(await readFile(archivePath))
    assertSafeZip(zip, 'Modpack archive', MODPACK_ZIP_LIMITS)
    let overridesExtracted = 0
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const target =
        safeOverridePath(instanceDir, entry.entryName, 'overrides/') ??
        safeOverridePath(instanceDir, entry.entryName, 'client-overrides/')
      if (!target) continue
      await ensureDir(dirname(target))
      await writeFile(target, readZipEntry(entry, MAX_OVERRIDE_BYTES, entry.entryName))
      overridesExtracted++
    }

    const wanted = plan.files.filter((file) => !file.optional || opts.includeOptional)
    const skipped = plan.files.length - wanted.length
    const instanceRoot = resolve(instanceDir)
    const items: DownloadItem[] = []
    const checkedOrigins = new Set<string>()
    for (const file of wanted) {
      const dest = resolve(instanceRoot, file.path)
      if (!dest.toLowerCase().startsWith(instanceRoot.toLowerCase() + sep)) continue
      const origin = new URL(file.url).origin
      if (!checkedOrigins.has(origin)) {
        await assertPublicHttpsUrl(file.url)
        checkedOrigins.add(origin)
      }
      items.push({
        url: file.url,
        dest,
        sha1: file.sha1,
        sha512: file.sha512,
        size: file.size,
        maxBytes: file.size && file.size > 0 ? file.size : MAX_MODPACK_FILE_BYTES,
        strictSource: true,
        label: file.path
      })
    }

    const taskId = `modpack:${instance.id}`
    const label = `Installing ${plan.name}`
    this.progress.start(taskId, label)
    try {
      await this.downloader.downloadAll(items, (p) => {
        this.progress.emit({
          taskId,
          label,
          detail: `Files · ${p.filesDone}/${p.filesTotal} · ${p.detail}`,
          current: p.current,
          total: p.total,
          done: false
        })
      })
      this.progress.done(taskId, label, `${wanted.length} files installed`)
    } catch (error) {
      this.progress.fail(taskId, label, error instanceof Error ? error.message : String(error))
      throw error
    }

    await this.buildModIndex(instance, wanted)
    return { filesInstalled: wanted.length, filesSkipped: skipped, overridesExtracted }
  }

  /** Map downloaded jars under mods/ back to Modrinth projects by sha1. */
  private async buildModIndex(
    instance: InstanceConfig,
    files: { path: string; sha1?: string }[]
  ): Promise<void> {
    const instanceDir = join(this.paths.instances, instance.id)
    const modFiles = files.filter((file) => /^mods\//.test(file.path.replace(/\\/g, '/')) && file.path.endsWith('.jar'))
    const hashes = modFiles.flatMap((file) => (file.sha1 ? [file.sha1] : []))
    if (hashes.length === 0) return

    let byHash: Record<string, ModrinthVersion> = {}
    let projects = new Map<string, { slug: string; title: string; icon?: string }>()
    try {
      byHash = await this.modrinth.versionsByHashes(hashes)
      const ids = [...new Set(Object.values(byHash).map((version) => version.project_id))]
      const fetched = await this.modrinth.projects(ids)
      projects = new Map(fetched.map((project) => [project.id, { slug: project.slug, title: project.title, icon: project.icon_url }]))
    } catch (error) {
      this.logger.warn('Could not resolve modpack jars to Modrinth projects', String(error))
    }

    const mods: InstalledMod[] = []
    for (const file of modFiles) {
      const filename = file.path.replace(/\\/g, '/').slice('mods/'.length)
      const version = file.sha1 ? byHash[file.sha1] : undefined
      const project = version ? projects.get(version.project_id) : undefined
      mods.push({
        projectId: version?.project_id ?? '',
        slug: project?.slug ?? '',
        name: project?.title ?? filename.replace(/\.jar$/i, ''),
        versionId: version?.id ?? '',
        versionNumber: version?.version_number ?? '',
        filename,
        size: 0,
        sha1: file.sha1,
        enabled: true,
        source: 'modpack',
        iconUrl: project?.icon,
        installedAt: Date.now()
      })
    }
    await ensureDir(join(instanceDir, 'mods'))
    await writeFile(
      join(instanceDir, 'mods', '.polaris-index.json'),
      JSON.stringify({ version: 1, mods }, null, 2),
      'utf8'
    )
  }
}
