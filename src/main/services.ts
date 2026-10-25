import { EventEmitter } from 'node:events'
import os from 'node:os'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type {
  AccountSnapshot,
  Bootstrap,
  CosmeticSnapshot,
  CreateFromPackInput,
  CreateInstanceInput,
  GameUiApplyResult,
  GameUiOptions,
  GameUiSnapshot,
  HardwareInfo,
  InstanceConfig,
  InstanceDetail,
  InstanceSummary,
  InstalledMod,
  JavaInfo,
  JvmPresetId,
  LaunchState,
  ModCategory,
  ModDetail,
  ModInstallResult,
  ModSearchFilters,
  ModSearchResult,
  ModUpdateInfo,
  ModUpdateResult,
  ModVersionEntry,
  PackApplyResult,
  PackModStatus,
  PerfApplyResult,
  PerfPlan,
  PerfProfileId,
  PerfScanResult,
  Settings,
  ShardClaimResult,
  UpdateInfo,
  VersionSummary
} from '../shared/types'
import { createPaths, resolveRoot } from '../core/paths'
import { Logger } from '../core/logger'
import { Downloader } from '../core/http'
import { ProgressHub } from '../core/events'
import { MojangMeta } from '../core/mojang'
import { AssetManager } from '../core/assets'
import { FabricMeta } from '../core/fabric'
import { Installer } from '../core/install'
import { AccountStore, offlineAccount, type StoredAccount } from '../core/accounts'
import { AuthService } from '../core/auth'
import { SettingsStore } from '../core/settings'
import { InstanceStore } from '../core/instances'
import { ModrinthClient, mapVersionEntry, type ModrinthVersion } from '../core/modrinth'
import { ModsService } from '../core/mods'
import { ModpackService } from '../core/modpacks'
import { ServerService } from '../core/server'
import { LaunchService } from '../core/launch'
import { PACKS, packById } from '../core/packs'
import { detectHardware, makePlan, applyOptions, readGameUi, writeGameUi } from '../core/performance'
import { CosmeticsService } from '../core/cosmetics'
import { scanJava, inspectJava } from '../core/java'
import { ensureDir } from '../core/fsutil'

export class AppServices extends EventEmitter {
  readonly paths = createPaths(resolveRoot())
  readonly logger = new Logger(join(this.paths.root, 'logs'))
  readonly progress = new ProgressHub()
  readonly settingsStore = new SettingsStore(this.paths.settings, this.paths.root)
  readonly cosmetics = new CosmeticsService(this.settingsStore)
  readonly accounts = new AccountStore(this.paths.accounts)
  readonly instances: InstanceStore
  readonly downloader: Downloader
  readonly mojang: MojangMeta
  readonly assets: AssetManager
  readonly fabric: FabricMeta
  readonly installer: Installer
  readonly auth: AuthService
  readonly modrinth: ModrinthClient
  readonly mods: ModsService
  readonly modpacks: ModpackService
  readonly server: ServerService
  readonly launcher: LaunchService

  hardware: HardwareInfo
  java: JavaInfo[] = []
  latestVersion?: string
  ready: Promise<void>
  private initialized = false

  constructor() {
    super()
    this.instances = new InstanceStore(this.paths)
    this.downloader = new Downloader(12, this.logger.child('http'))
    this.mojang = new MojangMeta(this.paths, this.downloader, this.logger.child('mojang'))
    this.assets = new AssetManager(this.paths, this.downloader)
    this.fabric = new FabricMeta(this.paths, this.downloader)
    this.installer = new Installer(
      this.paths,
      this.downloader,
      this.mojang,
      this.fabric,
      this.assets,
      this.progress,
      this.logger.child('installer')
    )
    this.auth = new AuthService(this.accounts, this.logger.child('auth'))
    this.modrinth = new ModrinthClient(this.downloader, this.logger.child('modrinth'))
    this.mods = new ModsService(this.paths, this.downloader, this.modrinth, this.logger.child('mods'))
    this.modpacks = new ModpackService(this.paths, this.downloader, this.modrinth, this.progress, this.logger.child('modpacks'))
    this.server = new ServerService(
      this.paths,
      this.downloader,
      this.mojang,
      this.fabric,
      this.progress,
      this.logger.child('server')
    )
    this.launcher = new LaunchService(
      this.paths,
      this.installer,
      this.accounts,
      this.auth,
      this.logger.child('launch'),
      {
        onStarted: (instanceId, pid) => this.emit('game-started', { instanceId, pid }),
        onExit: (instanceId, code, playtimeMs) => this.handleGameExit(instanceId, code, playtimeMs),
        onLog: (instanceId, lines) => this.emit('game-log', { instanceId, lines })
      }
    )
    this.hardware = fallbackHardware()

    this.progress.on((event) => {
      this.emit('progress', event)
    })
    this.launcher.onState((state) => this.emit('launch-state', state))

    this.ready = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      for (const dir of [
        this.paths.instances,
        this.paths.versions,
        this.paths.libraries,
        this.paths.meta,
        `${this.paths.assets}/indexes`,
        `${this.paths.assets}/objects`,
        this.paths.java,
        this.paths.cache,
        this.paths.logs,
        this.paths.downloads
      ]) {
        await ensureDir(dir)
      }
      const settings = await this.settingsStore.load()
      await this.accounts.load()
      this.logger.info('Polaris starting', { version: app.getVersion(), dataDir: this.paths.root })

      this.java = await scanJava(settings.javaPath ? [settings.javaPath] : [])
      this.hardware = await detectHardware(this.java)
      this.latestVersion = await this.mojang.latestRelease().catch(() => undefined)
      this.initialized = true
      this.logger.info('Hardware detected', {
        cpu: this.hardware.cpu,
        gpu: this.hardware.gpu,
        tier: this.hardware.tier,
        java: this.java.map((j) => j.version)
      })
    } catch (error) {
      this.logger.error('Initialization failed', String(error))
    }
  }

  private async handleGameExit(instanceId: string, code: number | null, playtimeMs: number): Promise<void> {
    try {
      const instance = await this.instances.get(instanceId)
      await this.instances.update(instanceId, {
        lastPlayed: Date.now(),
        playtimeMs: instance.playtimeMs + playtimeMs
      })
    } catch (error) {
      this.logger.warn('Could not persist playtime', String(error))
    }
    this.emit('game-exited', { instanceId, code, playtimeMs })
  }

  async bootstrap(): Promise<Bootstrap> {
    await this.ready
    const settings = this.settingsStore.get()
    const instances = await this.instances.list((id) => this.launcher.isRunning(id))
    const active = this.accounts.activeStored()
    const updateInfo = await this.checkForUpdates()
    return {
      appVersion: app.getVersion(),
      settings,
      instances,
      accounts: this.accounts.list(),
      activeAccountId: active?.id ?? null,
      hardware: this.hardware,
      launch: this.launcher.getState(),
      java: this.java,
      dataDir: this.paths.root,
      packs: PACKS,
      latestVersion: this.latestVersion,
      updateInfo
    }
  }

  accountSnapshot(): AccountSnapshot {
    return {
      accounts: this.accounts.list(),
      activeAccountId: this.accounts.activeStored()?.id ?? null
    }
  }

  async listVersions(includeSnapshots: boolean): Promise<VersionSummary[]> {
    await this.ready
    return await this.mojang.listVersions(includeSnapshots)
  }

  async instanceDetail(id: string): Promise<InstanceDetail> {
    const instance = await this.instances.get(id)
    return {
      instance,
      mods: await this.mods.list(instance),
      installed: await this.instances.isInstalled(instance)
    }
  }

  async createInstance(input: CreateInstanceInput): Promise<InstanceSummary> {
    const config = await this.instances.create(input, this.settingsStore.get(), {
      memoryMb: this.hardware.recommendedMemoryMb
    })
    return await this.summarize(config)
  }

  async updateInstance(id: string, patch: Partial<InstanceConfig>): Promise<InstanceSummary> {
    const config = await this.instances.update(id, patch)
    return await this.summarize(config)
  }

  async summarize(config: InstanceConfig): Promise<InstanceSummary> {
    const list = await this.instances.list((id) => this.launcher.isRunning(id))
    return (
      list.find((item) => item.id === config.id) ?? {
        ...config,
        modCount: 0,
        running: false,
        installed: false,
        diskBytes: 0
      }
    )
  }

  async launch(id: string): Promise<LaunchState> {
    const instance = await this.instances.get(id)
    try {
      if (instance.kind === 'server') {
        const { state, loaderVersion } = await this.launcher.launchServer(
          instance,
          this.settingsStore.get(),
          this.java,
          this.server
        )
        if (instance.loader === 'fabric' && loaderVersion && loaderVersion !== instance.loaderVersion) {
          await this.instances.update(id, { loaderVersion }).catch(() => undefined)
        }
        return state
      }
      return await this.launcher.launch(instance, this.settingsStore.get(), this.java)
    } finally {
      // The installer resolves the Fabric loader during launch; persist it so
      // the instance list can report an accurate installed state.
      if (instance.loader === 'fabric' && instance.loaderVersion) {
        const stored = await this.instances.get(id).catch(() => undefined)
        if (stored && stored.loaderVersion !== instance.loaderVersion) {
          await this.instances.update(id, { loaderVersion: instance.loaderVersion }).catch(() => undefined)
        }
      }
    }
  }

  async searchMods(
    query: string,
    type: 'mod' | 'modpack',
    instanceId: string | null,
    offset = 0,
    filters: ModSearchFilters = {}
  ): Promise<ModSearchResult> {
    let loader: string | undefined
    let gameVersion: string | undefined
    if (instanceId) {
      const instance = await this.instances.get(instanceId)
      if (instance.loader === 'fabric') loader = 'fabric'
      gameVersion = instance.mcVersion
    }
    const result = await this.modrinth.search(query, {
      type,
      loader,
      gameVersion,
      categories: filters.categories,
      sort: filters.sort,
      offset,
      limit: 24
    })
    return { hits: result.hits, total: result.total }
  }

  async installMod(instanceId: string, ref: string): Promise<ModInstallResult> {
    const instance = await this.instances.get(instanceId)
    const existing = (await this.mods.list(instance)).find((mod) => mod.projectId === ref || mod.slug === ref)
    return await this.mods.install(instance, ref, existing?.source ?? 'manual')
  }

  async modDetail(ref: string): Promise<ModDetail> {
    return await this.modrinth.projectDetail(ref)
  }

  /** Release list for the detail modal, narrowed to the instance when one is given. */
  async modVersions(ref: string, instanceId: string | null): Promise<ModVersionEntry[]> {
    const project = await this.modrinth.project(ref)
    const instance = instanceId ? await this.instances.get(instanceId) : null
    const versions = await this.modrinth.versions(
      project.id,
      instance?.loader === 'fabric' ? 'fabric' : '',
      instance?.mcVersion ?? ''
    )
    return versions.slice(0, 60).map(mapVersionEntry)
  }

  async installModVersion(instanceId: string, versionId: string): Promise<ModInstallResult> {
    const instance = await this.instances.get(instanceId)
    return await this.mods.installExact(instance, versionId, 'manual')
  }

  async checkModUpdates(instanceId: string): Promise<ModUpdateInfo[]> {
    return await this.mods.checkUpdates(await this.instances.get(instanceId))
  }

  /** Re-check, then install the pinned versions. Returns both diff and outcome. */
  async updateMods(instanceId: string, projectIds?: string[]): Promise<ModUpdateResult> {
    const instance = await this.instances.get(instanceId)
    const detected = await this.mods.checkUpdates(instance)
    const updates = projectIds?.length
      ? detected.filter((update) => projectIds.includes(update.projectId))
      : detected
    if (updates.length === 0) {
      return {
        updates: [],
        result: { installed: [], skipped: [], unsupported: [], failed: [], dependencies: [] }
      }
    }
    const result = await this.mods.applyUpdates(instance, updates)
    return { updates, result }
  }

  async modCategories(type: 'mod' | 'modpack' = 'mod'): Promise<ModCategory[]> {
    return await this.modrinth.categories(type)
  }

  /**
   * CurseForge-style modpack install: create an instance matching the pack
   * manifest, then download required (optionally optional) files and overrides.
   */
  async createInstanceFromPack(input: CreateFromPackInput): Promise<InstanceSummary> {
    const prepared = await this.modpacks.plan(input.packRef)
    if (prepared.plan.loader !== 'fabric') {
      throw new Error('Only Fabric modpacks are supported in this release.')
    }
    const config = await this.instances.create(
      {
        name: input.name?.trim() || prepared.plan.name,
        mcVersion: prepared.plan.mcVersion,
        loader: prepared.plan.loader,
        kind: 'game',
        memoryMb: input.memoryMb,
        packs: []
      },
      this.settingsStore.get(),
      { memoryMb: this.hardware.recommendedMemoryMb }
    )
    if (prepared.plan.loaderVersion) {
      await this.instances.update(config.id, { loaderVersion: prepared.plan.loaderVersion })
    }
    const populated = await this.modpacks.populate(config, prepared.archivePath, prepared.plan, {
      includeOptional: Boolean(input.includeOptional)
    })
    await this.instances.update(config.id, {
      modpack: {
        projectId: prepared.projectId,
        slug: prepared.slug,
        name: prepared.title,
        versionId: prepared.version.id,
        versionNumber: prepared.version.version_number,
        filesTotal: prepared.plan.files.length,
        filesInstalled: populated.filesInstalled
      },
      packs: []
    })
    return await this.summarize(await this.instances.get(config.id))
  }

  async applyPack(instanceId: string, packId: string): Promise<PackApplyResult> {
    const pack = packById(packId)
    if (!pack) throw new Error(`Unknown pack: ${packId}`)
    const instance = await this.instances.get(instanceId)
    const result = await this.mods.applyPack(instance, pack, { gpuVendor: this.hardware.gpuVendor })
    if (!instance.packs.includes(packId)) {
      await this.instances.update(instanceId, { packs: [...instance.packs, packId] })
    }
    return result
  }

  async packStatus(instanceId: string, packId: string): Promise<PackModStatus[]> {
    const pack = packById(packId)
    if (!pack) throw new Error(`Unknown pack: ${packId}`)
    const instance = await this.instances.get(instanceId)
    return await this.mods.packStatus(instance, pack, { gpuVendor: this.hardware.gpuVendor })
  }

  async planPerformance(
    instanceId: string,
    profile: PerfProfileId,
    memoryMb?: number,
    preset?: JvmPresetId
  ): Promise<PerfPlan> {
    const instance = await this.instances.get(instanceId)
    return makePlan(profile, this.hardware, memoryMb ?? instance.memoryMb, preset)
  }

  async applyPerformance(
    instanceId: string,
    profile: PerfProfileId,
    memoryMb?: number,
    preset?: JvmPresetId
  ): Promise<PerfApplyResult> {
    const instance = await this.instances.get(instanceId)
    if (this.launcher.isRunning(instanceId)) throw new Error('Close Minecraft before applying video settings.')
    const plan = makePlan(profile, this.hardware, memoryMb ?? instance.memoryMb, preset)
    let changed = 0
    let backup: string | undefined
    if (instance.kind !== 'server') {
      const applied = await applyOptions(join(this.paths.instances, instanceId), plan.options)
      changed = applied.changed
      backup = applied.backup
    }
    await this.instances.update(instanceId, {
      perfProfile: profile,
      memoryMb: plan.memoryMb,
      jvmPreset: plan.jvmPreset
    })
    return { plan, changed, backup }
  }

  /** Send one console line to the running dedicated server. */
  async serverCommand(instanceId: string, command: string): Promise<void> {
    const instance = await this.instances.get(instanceId)
    if (instance.kind !== 'server') throw new Error('This instance is not a dedicated server.')
    this.launcher.sendCommand(command)
  }

  async getGameUi(instanceId: string): Promise<GameUiSnapshot> {
    const instance = await this.instances.get(instanceId)
    if (instance.kind === 'server') throw new Error('Dedicated servers do not have an in-game interface.')
    return await readGameUi(join(this.paths.instances, instanceId))
  }

  async applyGameUi(instanceId: string, values: Partial<GameUiOptions>): Promise<GameUiApplyResult> {
    const instance = await this.instances.get(instanceId)
    if (instance.kind === 'server') throw new Error('Dedicated servers do not have an in-game interface.')
    if (this.launcher.isRunning(instanceId)) throw new Error('Close Minecraft before changing interface options.')
    return await writeGameUi(join(this.paths.instances, instanceId), values)
  }

  private async trackedPlaytime(): Promise<number> {
    const list = await this.instances.list((id) => this.launcher.isRunning(id))
    return list.reduce((total, instance) => total + Math.max(0, instance.playtimeMs), 0)
  }

  async cosmeticsSnapshot(): Promise<CosmeticSnapshot> {
    return this.cosmetics.snapshot(await this.trackedPlaytime())
  }

  async buyCosmetic(id: string): Promise<CosmeticSnapshot> {
    await this.cosmetics.buy(id)
    return await this.cosmeticsSnapshot()
  }

  async equipCosmetic(id: string): Promise<CosmeticSnapshot> {
    await this.cosmetics.equip(id)
    return await this.cosmeticsSnapshot()
  }

  async claimShards(): Promise<ShardClaimResult> {
    const granted = await this.cosmetics.claim(await this.trackedPlaytime())
    return { granted, snapshot: await this.cosmeticsSnapshot() }
  }

  async scanPerformance(): Promise<PerfScanResult> {
    this.java = await scanJava(this.settingsStore.get().javaPath ? [this.settingsStore.get().javaPath] : [])
    this.hardware = await detectHardware(this.java)
    return { hardware: this.hardware, java: this.java }
  }

  async addOffline(name: string): Promise<AccountSnapshot> {
    const clean = name.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) throw new Error('Username must be 3–16 characters: letters, numbers or underscore.')
    await this.accounts.add(offlineAccount(clean))
    return this.accountSnapshot()
  }

  async setActiveAccount(id: string): Promise<AccountSnapshot> {
    await this.accounts.setActive(id)
    return this.accountSnapshot()
  }

  async removeAccount(id: string): Promise<AccountSnapshot> {
    await this.accounts.remove(id)
    return this.accountSnapshot()
  }

  async beginMicrosoftLogin(): Promise<import('../shared/types').DeviceCodeInfo> {
    return await this.auth.beginDeviceLogin(this.settingsStore.get().msClientId, {
      onDeviceCode: (info) => this.emit('device-code', info),
      onAccount: (account) => this.emit('account-changed', this.accountSnapshot()),
      onError: (message) => this.emit('account-error', message)
    })
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const updated = await this.settingsStore.update(patch)
    if (Object.prototype.hasOwnProperty.call(patch, 'javaPath')) {
      this.java = await scanJava(updated.javaPath ? [updated.javaPath] : [])
      this.hardware = { ...this.hardware, java: this.java }
    }
    return updated
  }

  async setJavaPath(path: string): Promise<JavaInfo[]> {
    const info = await inspectJava(path.replace(/[\\/]bin[\\/](java|javaw)(\.exe)?$/i, ''), 'custom')
    if (!info) throw new Error('That file is not a usable Java runtime.')
    await this.settingsStore.update({ javaPath: info.path })
    this.java = await scanJava([info.path])
    this.hardware = { ...this.hardware, java: this.java }
    return this.java
  }

  async rescanJava(): Promise<JavaInfo[]> {
    this.java = await scanJava(this.settingsStore.get().javaPath ? [this.settingsStore.get().javaPath] : [])
    this.hardware = { ...this.hardware, java: this.java }
    return this.java
  }

  async activeAccountForLaunch(): Promise<StoredAccount | undefined> {
    return this.accounts.activeStored()
  }

  async listMods(instanceId: string): Promise<InstalledMod[]> {
    return await this.mods.list(await this.instances.get(instanceId))
  }

  /** Check GitHub releases for a newer version. */
  async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion()
    const repo = 'eddddiwe/polaris-client'
    const url = `https://api.github.com/repos/${repo}/releases/latest`
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Polaris-Client' }
      })
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
      const data = await res.json()
      const latestVersion = data.tag_name?.replace(/^v/, '') ?? '0.0.0'
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0
      const asset = data.assets?.find((a: any) => a.name === 'Polaris-Setup.exe') || data.assets?.[0]
      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseNotes: data.body ?? undefined,
        downloadUrl: asset?.browser_download_url ?? `https://github.com/${repo}/releases/latest`,
        publishedAt: data.published_at ?? new Date().toISOString()
      }
    } catch (err) {
      this.logger.warn('Update check failed', err)
      return { hasUpdate: false, currentVersion, latestVersion: currentVersion, downloadUrl: '', publishedAt: new Date().toISOString() }
    }
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0
      const nb = pb[i] ?? 0
      if (na !== nb) return na - nb
    }
    return 0
  }

  /** Open the download page for the latest release. */
  async installUpdate(): Promise<void> {
    const info = await this.checkForUpdates()
    if (info.hasUpdate && info.downloadUrl) {
      await shell.openExternal(info.downloadUrl)
    }
  }
}

function fallbackHardware(): HardwareInfo {
  const cpus = os.cpus()
  const threads = cpus.length || 4
  const ramGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  return {
    cpu: cpus[0]?.model?.trim() ?? 'Unknown CPU',
    threads,
    physicalCores: Math.max(1, Math.round(threads / 2)),
    ramGb,
    gpu: 'Detecting…',
    gpuVendor: 'Unknown',
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    tier: 'mainstream',
    recommendedMemoryMb: 4096,
    java: [],
    detectedAt: Date.now()
  }
}
