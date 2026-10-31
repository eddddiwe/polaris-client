import { join } from 'node:path'
import { rm, writeFile, readFile, stat } from 'node:fs/promises'
import AdmZip from 'adm-zip'
import type { DownloadItem, Downloader } from './http'
import { ProgressHub } from './events'
import { Logger } from './logger'
import type { Paths } from './paths'
import type { InstanceConfig, Settings } from '../shared/types'
import { MojangMeta } from './mojang'
import { vanillaMinecraftRoot } from './vanilla'
import { FabricMeta } from './fabric'
import { AssetManager } from './assets'
import { defaultFeatures, rulesAllow, createRuleContext } from './rules'
import {
  mergeVersions,
  requiredJavaMajor,
  resolveLibraryArtifacts,
  type Library,
  type ResolvedArtifact,
  type VersionJson
} from './version'
import { parseMaven } from './maven'
import { ensureDir, pathExists, assertSafeSegment } from './fsutil'

export interface NativeEntry {
  path: string
  exclude?: string[]
}

export interface InstalledGame {
  versionId: string
  baseVersionId: string
  version: VersionJson
  jarPath: string
  classpath: string[]
  natives: NativeEntry[]
  assetIndexId: string
  javaMajor: number
}

export class Installer {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader,
    private readonly mojang: MojangMeta,
    private readonly fabric: FabricMeta,
    private readonly assets: AssetManager,
    private readonly progress: ProgressHub,
    private readonly logger: Logger
  ) {}

  /** Try to load a cached InstalledGame from disk. Returns null if cache is missing or stale. */
  async tryLoadCache(instance: InstanceConfig, instanceDir: string): Promise<InstalledGame | null> {
    const cachePath = join(instanceDir, '.install-cache.json')
    if (!(await pathExists(cachePath))) return null
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8')) as InstalledGame
      // Verify mc version matches
      if (cached.baseVersionId !== instance.mcVersion) return null
      // Verify loader matches
      if (instance.loader === 'fabric' && !cached.versionId.includes('fabric')) return null
      // Verify all files exist in parallel (fast check)
      const allPaths = [cached.jarPath, ...cached.classpath]
      const checks = await Promise.all(allPaths.map(async (p) => {
        try {
          const s = await stat(p)
          return s.size > 0
        } catch {
          return false
        }
      }))
      if (!checks.every(Boolean)) return null
      return cached
    } catch {
      return null
    }
  }

  /** Save the InstalledGame result to disk for fast re-launch. */
  async saveCache(instance: InstanceConfig, instanceDir: string, installed: InstalledGame): Promise<void> {
    try {
      await writeFile(join(instanceDir, '.install-cache.json'), JSON.stringify(installed))
    } catch {
      // Cache write is best-effort
    }
  }

  /** Pre-compute JVM args and cache them alongside the install result. */
  async precomputeArgs(instance: InstanceConfig, instanceDir: string, installed: InstalledGame, settings: Settings, javaMajor: number): Promise<string[]> {
    // Build and cache the JVM tuning args (account-independent)
    const { buildJvmFlags, JVM_FLAGS_VERSION } = await import('./performance')
    const tuning = buildJvmFlags(instance.memoryMb, instance.jvmPreset, instance.customJvmArgs, javaMajor)
    try {
      await writeFile(
        join(instanceDir, '.args-cache.json'),
        JSON.stringify({
          flagsVersion: JVM_FLAGS_VERSION,
          memoryMb: instance.memoryMb,
          jvmPreset: instance.jvmPreset,
          customJvmArgs: instance.customJvmArgs,
          javaMajor,
          jvmTuning: tuning,
          computedAt: Date.now()
        })
      )
    } catch { /* best-effort */ }
    return tuning
  }

  /**
   * Load pre-computed JVM args when the cache is fresh and still matches the
   * instance settings and Java runtime. Any mismatch rebuilds the flags, so a
   * fix to the flag builder (or a memory/preset change) takes effect on the
   * very next launch instead of reusing crash-causing cache entries.
   */
  async loadCachedArgs(instanceDir: string, instance?: InstanceConfig, javaMajor?: number): Promise<string[] | null> {
    const cachePath = join(instanceDir, '.args-cache.json')
    if (!(await pathExists(cachePath))) return null
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'))
      if (Date.now() - cached.computedAt > 3600000) return null // stale after 1 hour
      const { JVM_FLAGS_VERSION } = await import('./performance')
      if (cached.flagsVersion !== JVM_FLAGS_VERSION) return null
      if (instance) {
        if (cached.memoryMb !== instance.memoryMb) return null
        if (cached.jvmPreset !== instance.jvmPreset) return null
        if ((cached.customJvmArgs ?? '') !== (instance.customJvmArgs ?? '')) return null
        if (javaMajor !== undefined && cached.javaMajor !== javaMajor) return null
      }
      return Array.isArray(cached.jvmTuning) ? cached.jvmTuning : null
    } catch {
      return null
    }
  }

  async install(instance: InstanceConfig, opts: { mirrorCache: boolean }): Promise<InstalledGame> {
    assertSafeSegment(instance.mcVersion, 'Minecraft version')
    if (instance.loaderVersion) assertSafeSegment(instance.loaderVersion, 'Fabric loader version')
    const taskId = `install:${instance.id}`
    const label = `Installing ${instance.name}`
    this.progress.start(taskId, label)

    try {
      const base = await this.mojang.fetchVersionJson(instance.mcVersion)
      this.progress.emit({
        taskId,
        label,
        detail: `Fetching Minecraft ${instance.mcVersion}`,
        current: 0,
        total: 1,
        done: false
      })
      const jarPath = await this.mojang.downloadClient(base, opts.mirrorCache)

      let version = base
      let versionId = base.id
      if (instance.loader === 'fabric') {
        this.progress.emit({
          taskId,
          label,
          detail: 'Resolving Fabric loader',
          current: 0,
          total: 1,
          done: false
        })
        const fabric = await this.fabric.ensure(instance.mcVersion, instance.loaderVersion)
        versionId = fabric.versionId
        version = mergeVersions(fabric.profile, base)
        instance.loaderVersion = fabric.loaderVersion
      }

      const assetIndexId = await this.assets.ensureAssets(version, opts.mirrorCache, (p) => {
        this.progress.emit({
          taskId,
          label,
          detail: `Assets · ${p.filesDone}/${p.filesTotal} · ${p.detail}`,
          current: p.current,
          total: p.total,
          done: false
        })
      })

      const { classpath, natives } = await this.ensureLibraries(version, taskId, label, opts.mirrorCache)
      classpath.push(jarPath)

      this.progress.done(taskId, label, 'Ready to launch')
      return {
        versionId,
        baseVersionId: base.id,
        version,
        jarPath,
        classpath,
        natives,
        assetIndexId,
        javaMajor: requiredJavaMajor(version)
      }
    } catch (error) {
      this.logger.error('Install failed', String(error))
      this.progress.fail(taskId, label, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  private async ensureLibraries(
    version: VersionJson,
    taskId: string,
    label: string,
    mirrorCache: boolean
  ): Promise<{ classpath: string[]; natives: NativeEntry[] }> {
    const features = defaultFeatures()
    const ctx = createRuleContext(features)
    const items: DownloadItem[] = []
    const classpath: string[] = []
    const natives: NativeEntry[] = []
    const seen = new Set<string>()

    for (const library of version.libraries ?? []) {
      if (!rulesAllow(library.rules, ctx)) continue
      const artifacts = resolveLibraryArtifacts(library, ctx.osName, ctx.arch)
      for (const artifact of artifacts) {
        const dest = join(this.paths.libraries, artifact.relativePath)
        if (!seen.has(dest.toLowerCase())) {
          seen.add(dest.toLowerCase())
          items.push({
            url: artifact.url,
            dest,
            sha1: artifact.sha1,
            size: artifact.size,
            label: library.name,
            mirror: mirrorCache ? join(vanillaCache(), 'libraries', artifact.relativePath) : undefined
          })
        }
        if (artifact.extract) {
          natives.push({ path: dest, exclude: artifact.exclude })
        } else {
          classpath.push(dest)
        }
      }
      if (items.length > 0 && items.length % 40 === 0) {
        this.progress.emit({
          taskId,
          label,
          detail: `Resolving libraries · ${items.length}`,
          current: 0,
          total: 1,
          done: false
        })
      }
    }

    await this.downloader.downloadAll(items, (p) => {
      this.progress.emit({
        taskId,
        label,
        detail: `Libraries · ${p.filesDone}/${p.filesTotal} · ${p.detail}`,
        current: p.current,
        total: p.total,
        done: false
      })
    })

    return { classpath, natives }
  }

  async extractNatives(natives: NativeEntry[], destination: string): Promise<void> {
    await rm(destination, { recursive: true, force: true })
    await ensureDir(destination)
    for (const entry of natives) {
      if (!(await pathExists(entry.path))) continue
      const zip = new AdmZip(entry.path)
      for (const zipEntry of zip.getEntries()) {
        if (zipEntry.isDirectory) continue
        const name = zipEntry.entryName.replace(/\\/g, '/')
        if (name.startsWith('META-INF/')) continue
        if (entry.exclude?.some((exclude) => name.startsWith(exclude))) continue
        const normalized = name.replace(/\.\./g, '')
        const target = join(destination, normalized)
        if (!target.toLowerCase().startsWith(destination.toLowerCase())) continue
        await ensureDir(join(target, '..'))
        await zip.extractEntryTo(zipEntry, destination, true, true)
      }
    }
  }
}

function vanillaCache(): string {
  return vanillaMinecraftRoot()
}

export function libraryKey(library: Library): string | null {
  try {
    const parsed = parseMaven(library.name)
    return `${parsed.group}:${parsed.artifact}`
  } catch {
    return null
  }
}

export function nativeArtifactPaths(artifacts: ResolvedArtifact[]): string[] {
  return artifacts.filter((artifact) => artifact.extract).map((artifact) => artifact.relativePath)
}
