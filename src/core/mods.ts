import { readdir, rename, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'
import type {
  InstanceConfig,
  InstalledMod,
  ModInstallResult,
  ModSource,
  ModUpdateInfo,
  PackApplyResult,
  PackDefinition,
  PackMod,
  PackModStatus
} from '../shared/types'
import type { Paths } from './paths'
import type { Downloader } from './http'
import type { Logger } from './logger'
import type { ModrinthClient, ModrinthProject, ModrinthVersion } from './modrinth'
import { pickVersion, primaryFile } from './modrinth'
import { hashFile, pathExists, readJson, safeFilename, writeJson } from './fsutil'

interface ModIndexFile {
  version: 1
  mods: InstalledMod[]
}

type OutcomeStatus = 'installed' | 'skipped' | 'unsupported' | 'failed'

interface Outcome {
  status: OutcomeStatus
  project: ModrinthProject
  version?: ModrinthVersion
  dependency: boolean
  error?: string
}

/** Hardware context used to gate pack members (e.g. Nvidium needs an NVIDIA GPU). */
export interface PackContext {
  gpuVendor: string
}

/** Pure gate: decides whether a pack member applies to this machine. */
export function evaluatePackMod(mod: PackMod, gpuVendor: string): { ok: boolean; reason?: string } {
  if (mod.requires === 'nvidia' && !/nvidia/i.test(gpuVendor)) {
    return { ok: false, reason: 'Skipped — requires an NVIDIA GPU' }
  }
  return { ok: true }
}

const SOURCE_ORDER: Record<ModSource, number> = {
  performance: 0,
  qol: 1,
  hud: 2,
  shaders: 3,
  server: 4,
  modpack: 5,
  manual: 6
}

export class ModsService {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader,
    private readonly modrinth: ModrinthClient,
    private readonly logger: Logger
  ) {}

  modsDir(instance: InstanceConfig): string {
    return join(this.paths.instances, instance.id, 'mods')
  }

  private indexPath(instance: InstanceConfig): string {
    return join(this.modsDir(instance), '.polaris-index.json')
  }

  private async loadIndex(instance: InstanceConfig): Promise<InstalledMod[]> {
    const file = await readJson<ModIndexFile | null>(this.indexPath(instance), null)
    return file?.mods ?? []
  }

  private async saveIndex(instance: InstanceConfig, mods: InstalledMod[]): Promise<void> {
    await writeJson(this.indexPath(instance), { version: 1, mods } satisfies ModIndexFile)
  }

  async list(instance: InstanceConfig): Promise<InstalledMod[]> {
    const index = await this.loadIndex(instance)
    let files: string[] = []
    try {
      files = await readdir(this.modsDir(instance))
    } catch {
      return []
    }
    const byFilename = new Map(index.map((mod) => [mod.filename.toLowerCase(), mod]))
    const result: InstalledMod[] = []
    const used = new Set<string>()

    for (const mod of index) {
      const enabledFile = mod.filename
      const disabledFile = `${mod.filename}.disabled`
      const hasEnabled = files.includes(enabledFile)
      const hasDisabled = files.includes(disabledFile)
      if (!hasEnabled && !hasDisabled) continue
      used.add(hasEnabled ? enabledFile : disabledFile)
      result.push({ ...mod, enabled: hasEnabled })
    }

    for (const file of files) {
      if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) continue
      if (used.has(file)) continue
      const base = file.endsWith('.disabled') ? file.slice(0, -'.disabled'.length) : file
      const existing = byFilename.get(base.toLowerCase())
      if (existing && result.some((mod) => mod.projectId === existing.projectId)) continue
      result.push({
        projectId: '',
        slug: '',
        name: prettify(base),
        versionId: '',
        versionNumber: '',
        filename: base,
        size: 0,
        enabled: file.endsWith('.jar'),
        source: 'manual',
        installedAt: 0
      })
    }

    return result.sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.name.localeCompare(b.name))
  }

  async install(instance: InstanceConfig, ref: string, source: ModSource = 'manual'): Promise<ModInstallResult> {
    const outcomes = await this.installInternal(instance, ref, source, new Set())
    return aggregate(outcomes)
  }

  /** Install one exact Modrinth version by its version id (used by updates). */
  async installExact(instance: InstanceConfig, versionId: string, source: ModSource = 'manual'): Promise<ModInstallResult> {
    const outcomes = await this.installInternal(instance, versionId, source, new Set(), versionId)
    return aggregate(outcomes)
  }

  async applyPack(instance: InstanceConfig, pack: PackDefinition, context: PackContext): Promise<PackApplyResult> {
    const source = packSource(pack)
    const visited = new Set<string>()
    const outcomes: Outcome[] = []
    const statuses: PackModStatus[] = []

    for (const packMod of pack.mods) {
      const gate = evaluatePackMod(packMod, context.gpuVendor)
      if (!gate.ok) {
        statuses.push({ slug: packMod.slug, name: packMod.name, note: packMod.note, state: 'unsupported', error: gate.reason })
        continue
      }
      let primary: Outcome
      try {
        const results = await this.installInternal(instance, packMod.slug, source, visited)
        primary = results[0]
        outcomes.push(...results)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        primary = {
          status: 'failed',
          project: {
            id: '',
            slug: packMod.slug,
            title: packMod.name,
            description: '',
            downloads: 0,
            categories: [],
            project_type: 'mod'
          },
          dependency: false,
          error: message
        }
        outcomes.push(primary)
      }
      statuses.push({
        slug: packMod.slug,
        name: primary.project.title || packMod.name,
        note: packMod.note,
        state:
          primary.status === 'installed'
            ? 'installed'
            : primary.status === 'skipped'
              ? 'already'
              : primary.status === 'unsupported'
                ? 'unsupported'
                : 'failed',
        versionNumber: primary.version?.version_number,
        projectId: primary.project.id,
        error: primary.error
      })
    }

    return { result: aggregate(outcomes), statuses }
  }

  private async installInternal(
    instance: InstanceConfig,
    ref: string,
    source: ModSource,
    visited: Set<string>,
    pinnedVersionId?: string
  ): Promise<Outcome[]> {
    if (instance.loader !== 'fabric') throw new Error('Mods require a Fabric instance.')

    let project: ModrinthProject
    let version: ModrinthVersion | undefined
    if (pinnedVersionId) {
      version = await this.modrinth.versionById(pinnedVersionId)
      project = await this.modrinth.project(version.project_id)
      if (project.project_type !== 'mod') {
        return [{ status: 'unsupported', project, version, dependency: false, error: 'Not a mod project' }]
      }
    } else {
      project = await this.modrinth.project(ref)
      if (visited.has(project.id)) {
        return [{ status: 'skipped', project, dependency: false }]
      }
      if (project.project_type !== 'mod') {
        return [{ status: 'unsupported', project, dependency: false, error: 'Not a mod project' }]
      }
      const versions = await this.modrinth.versions(project.id, 'fabric', instance.mcVersion)
      version = pickVersion(versions)
    }

    if (visited.has(project.id) && pinnedVersionId) {
      return [{ status: 'skipped', project, version, dependency: false }]
    }
    visited.add(project.id)

    if (!version) {
      return [{ status: 'unsupported', project, dependency: false }]
    }
    const file = primaryFile(version)
    if (!file) {
      return [{ status: 'failed', project, version, dependency: false, error: 'No downloadable JAR in release' }]
    }

    const index = await this.loadIndex(instance)
    const existing = index.find((mod) => mod.projectId === project.id)
    // A disabled mod is stored as <name>.jar.disabled. The index keeps the base
    // filename, so check the disk rather than trusting the index's enabled flag.
    const existingBase = existing ? join(this.modsDir(instance), existing.filename) : null
    const existsEnabled = existingBase ? await pathExists(existingBase) : false
    const existsDisabled = existingBase ? await pathExists(`${existingBase}.disabled`) : false
    if (existing && existing.versionId === version.id && (existsEnabled || existsDisabled)) {
      return [{ status: 'skipped', project, version, dependency: false }]
    }
    const wasDisabled = Boolean(existingBase && !existsEnabled && existsDisabled)

    const filename = await safeFilename(file.filename, `${project.slug}.jar`)
    const dest = join(this.modsDir(instance), filename)
    await this.downloader.downloadAll([
      {
        url: file.url,
        dest,
        sha1: file.hashes.sha1,
        size: file.size,
        label: `${project.title} ${version.version_number}`
      }
    ])
    if (wasDisabled) await rename(dest, `${dest}.disabled`)

    if (existing && existing.filename !== filename) {
      await this.deleteFile(instance, existing)
    }
    const entry: InstalledMod = {
      projectId: project.id,
      slug: project.slug,
      name: project.title,
      versionId: version.id,
      versionNumber: version.version_number,
      filename,
      size: file.size,
      sha1: file.hashes.sha1,
      enabled: !wasDisabled,
      source,
      iconUrl: project.icon_url,
      installedAt: Date.now()
    }
    const nextIndex = index.filter((mod) => mod.projectId !== project.id)
    nextIndex.push(entry)
    await this.saveIndex(instance, nextIndex)

    const outcomes: Outcome[] = [{ status: 'installed', project, version, dependency: false }]
    for (const dependency of version.dependencies.filter((dep) => dep.dependency_type === 'required' && dep.project_id)) {
      try {
        const installed = await this.installInternal(instance, dependency.project_id as string, source, visited)
        for (const child of installed) outcomes.push({ ...child, dependency: true })
      } catch (error) {
        this.logger.warn(`Dependency failed for ${project.slug}`, String(error))
        outcomes.push({
          status: 'failed',
          project: { ...project, title: dependency.file_name ?? 'Dependency' },
          dependency: true,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return outcomes
  }

  async toggle(instance: InstanceConfig, filename: string): Promise<void> {
    if (basename(filename) !== filename) throw new Error('Invalid mod filename')
    const index = await this.loadIndex(instance)
    const entry = index.find((mod) => mod.filename === filename || mod.projectId === filename)
    if (!entry) throw new Error('Mod not found')
    const enabled = join(this.modsDir(instance), entry.filename)
    const disabled = `${enabled}.disabled`
    if (await pathExists(enabled)) {
      await rename(enabled, disabled)
    } else if (await pathExists(disabled)) {
      await rename(disabled, enabled)
    }
    entry.enabled = !entry.enabled
    await this.saveIndex(instance, index)
  }

  async remove(instance: InstanceConfig, identifier: string): Promise<void> {
    if (basename(identifier) !== identifier) throw new Error('Invalid mod identifier')
    const index = await this.loadIndex(instance)
    const entry = index.find((mod) => mod.filename === identifier || mod.projectId === identifier)
    if (entry) {
      await this.deleteFile(instance, entry)
      await this.saveIndex(instance, index.filter((mod) => mod !== entry))
      return
    }
    const file = join(this.modsDir(instance), identifier)
    await rm(file, { force: true })
    await rm(`${file}.disabled`, { force: true })
  }

  /**
   * One batch request to Modrinth resolves every installed file's sha1 to the
   * newest matching version. Missing hashes are computed from disk once and
   * persisted back into the index so later checks stay cheap.
   */
  async checkUpdates(instance: InstanceConfig): Promise<ModUpdateInfo[]> {
    const mods = await this.list(instance)
    const tracked = mods.filter((mod) => mod.projectId && mod.versionId)
    if (tracked.length === 0) return []

    const resolved: { mod: InstalledMod; sha1: string }[] = []
    const backfill: { projectId: string; sha1: string }[] = []
    for (const mod of tracked) {
      let sha1 = mod.sha1
      if (!sha1) {
        sha1 = await this.computeSha1(instance, mod)
        if (sha1) backfill.push({ projectId: mod.projectId, sha1 })
      }
      if (sha1) resolved.push({ mod, sha1 })
    }
    if (backfill.length > 0) await this.persistHashes(instance, backfill)
    if (resolved.length === 0) return []

    const hashes = [...new Set(resolved.map((entry) => entry.sha1))]
    const updates = await this.modrinth.updatesForHashes(hashes, ['fabric'], [instance.mcVersion])
    const bySha = new Map(resolved.map((entry) => [entry.sha1, entry.mod]))
    const seen = new Set<string>()
    const result: ModUpdateInfo[] = []
    for (const [sha, version] of Object.entries(updates)) {
      const mod = bySha.get(sha)
      if (!mod || version.id === mod.versionId || seen.has(mod.projectId)) continue
      seen.add(mod.projectId)
      result.push({
        projectId: mod.projectId,
        slug: mod.slug,
        name: mod.name,
        iconUrl: mod.iconUrl,
        currentVersionNumber: mod.versionNumber,
        newVersionNumber: version.version_number,
        newVersionId: version.id
      })
    }
    return result
  }

  /** Apply a set of detected updates by installing each pinned new version. */
  async applyUpdates(instance: InstanceConfig, updates: ModUpdateInfo[]): Promise<ModInstallResult> {
    const index = await this.loadIndex(instance)
    const sourceByProject = new Map(index.map((mod) => [mod.projectId, mod.source]))
    const outcomes: Outcome[] = []
    for (const update of updates) {
      try {
        const results = await this.installInternal(
          instance,
          update.newVersionId,
          sourceByProject.get(update.projectId) ?? 'manual',
          new Set(),
          update.newVersionId
        )
        outcomes.push(...results)
      } catch (error) {
        this.logger.warn(`Update failed for ${update.slug}`, String(error))
        outcomes.push({
          status: 'failed',
          project: { id: update.projectId, slug: update.slug, title: update.name, description: '', downloads: 0, categories: [], project_type: 'mod' },
          dependency: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return aggregate(outcomes)
  }

  private async computeSha1(instance: InstanceConfig, mod: InstalledMod): Promise<string | undefined> {
    const base = join(this.modsDir(instance), mod.filename)
    for (const candidate of [base, `${base}.disabled`]) {
      if (await pathExists(candidate)) {
        try {
          return await hashFile(candidate, 'sha1')
        } catch {
          return undefined
        }
      }
    }
    return undefined
  }

  private async persistHashes(instance: InstanceConfig, backfill: { projectId: string; sha1: string }[]): Promise<void> {
    const index = await this.loadIndex(instance)
    let changed = false
    for (const entry of backfill) {
      const mod = index.find((item) => item.projectId === entry.projectId)
      if (mod && !mod.sha1) {
        mod.sha1 = entry.sha1
        changed = true
      }
    }
    if (changed) await this.saveIndex(instance, index)
  }

  private async deleteFile(instance: InstanceConfig, mod: InstalledMod): Promise<void> {
    const file = join(this.modsDir(instance), mod.filename)
    await rm(file, { force: true })
    await rm(`${file}.disabled`, { force: true })
  }

  async packStatus(instance: InstanceConfig, pack: PackDefinition, context: PackContext): Promise<PackModStatus[]> {
    const installed = await this.list(instance)
    const bySlug = new Map(installed.map((mod) => [mod.slug, mod]))
    const statuses: PackModStatus[] = []

    const queue = [...pack.mods]
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (;;) {
        const mod = queue.shift()
        if (!mod) return
        const gate = evaluatePackMod(mod, context.gpuVendor)
        if (!gate.ok) {
          statuses.push({ slug: mod.slug, name: mod.name, note: mod.note, state: 'unsupported', error: gate.reason })
          continue
        }
        const already = bySlug.get(mod.slug)
        if (already) {
          statuses.push({
            slug: mod.slug,
            name: mod.name,
            note: mod.note,
            state: 'installed',
            versionNumber: already.versionNumber,
            projectId: already.projectId
          })
          continue
        }
        try {
          const project = await this.modrinth.project(mod.slug)
          const versions = await this.modrinth.versions(project.id, 'fabric', instance.mcVersion)
          const latest = pickVersion(versions)
          statuses.push({
            slug: mod.slug,
            name: mod.name,
            note: mod.note,
            state: latest ? 'available' : 'unsupported',
            versionNumber: latest?.version_number,
            projectId: project.id
          })
        } catch {
          statuses.push({
            slug: mod.slug,
            name: mod.name,
            note: mod.note,
            state: 'unsupported'
          })
        }
      }
    })
    await Promise.all(workers)
    const order = new Map(pack.mods.map((mod, index) => [mod.slug, index]))
    return statuses.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
  }
}

/** The instance object is passed straight through; kept as a helper for clarity. */
function index0(instance: InstanceConfig): InstanceConfig {
  return instance
}

function packSource(pack: PackDefinition): ModSource {
  const id = pack.id as ModSource
  return id === 'performance' || id === 'qol' || id === 'hud' || id === 'shaders' || id === 'server' ? id : 'manual'
}

function aggregate(outcomes: Outcome[]): ModInstallResult {
  if (outcomes.length === 0) {
    return { installed: [], skipped: [], unsupported: [], failed: [], dependencies: [] }
  }
  const primary = outcomes[0]
  const dependencies = outcomes.filter((outcome) => outcome.dependency && outcome.status === 'installed').map((o) => o.project.title)
  const result: ModInstallResult = {
    installed: outcomes.filter((o) => !o.dependency && o.status === 'installed').map((o) => o.project.title),
    skipped: outcomes.filter((o) => !o.dependency && o.status === 'skipped').map((o) => o.project.title),
    unsupported: outcomes.filter((o) => !o.dependency && o.status === 'unsupported').map((o) => o.project.title),
    failed: outcomes
      .filter((o) => !o.dependency && o.status === 'failed')
      .map((o) => ({ name: o.project.title, error: o.error ?? 'Unknown error' })),
    dependencies
  }
  if (primary?.status === 'unsupported' && result.unsupported.length === 0) result.unsupported.push(primary.project.title)
  return result
}

function prettify(filename: string): string {
  return filename
    .replace(/\.jar$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
