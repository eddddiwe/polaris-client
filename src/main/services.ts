import { EventEmitter } from 'node:events'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { app, shell } from 'electron'
import type {
  AccountSnapshot,
  Bootstrap,
  ChatMessage,
  CosmeticSnapshot,
  CreateFromPackInput,
  CreateInstanceInput,
  GameUiApplyResult,
  GameUiOptions,
  GameUiSnapshot,
  HardwareInfo,
  InstallUpdateResult,
  InstanceConfig,
  InstanceDetail,
  InstanceSummary,
  InstalledMod,
  JavaInfo,
  JvmPresetId,
  LaunchState,
  LoaderType,
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
import { SafeStorageCipher } from './safeStorageCipher'
import { resetUpdateTask } from './updateTask'
import { AuthService } from '../core/auth'
import { SettingsStore } from '../core/settings'
import { InstanceStore } from '../core/instances'
import { ensureServersDat } from '../core/nbt'
import { ModrinthClient, mapVersionEntry, type ModrinthVersion } from '../core/modrinth'
import { ModsService } from '../core/mods'
import { ModpackService, safeOverridePath, parseMrpackIndex } from '../core/modpacks'
import {
  assertSafeZip,
  MODPACK_ZIP_LIMITS,
  readZipEntry,
  readZipText
} from '../core/zipSafe'
import { ensureDir, hashFile, pathExists } from '../core/fsutil'
import { ServerService } from '../core/server'
import { LaunchService } from '../core/launch'
import { PACKS, packById } from '../core/packs'
import { detectHardware, warmHardwareProbe, makePlan, applyOptions, readGameUi, writeGameUi } from '../core/performance'
import { CosmeticsService } from '../core/cosmetics'
import { FriendStore } from '../core/friends'
import { ChatService } from '../core/chat'
import { ShardGrantService } from '../core/shards'
import { scanJava, inspectJava, downloadJava } from '../core/java'

export class AppServices extends EventEmitter {
  readonly paths = createPaths(resolveRoot())
  readonly logger = new Logger(join(this.paths.root, 'logs'))
  readonly progress = new ProgressHub()
  readonly settingsStore = new SettingsStore(this.paths.settings, this.paths.root)
  readonly cosmetics = new CosmeticsService(this.settingsStore)
  readonly friends = new FriendStore(join(this.paths.root, 'friends.json'))
  readonly chat = new ChatService()
  readonly shardGrants = new ShardGrantService()
  readonly accounts = new AccountStore(this.paths.accounts, new SafeStorageCipher())
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
  private updateInFlight: Promise<InstallUpdateResult> | null = null
  private shardSync: Promise<void> | null = null
  private shardSyncAccount: string | null = null
  private shardSyncAgain = false
  private shardTimer?: NodeJS.Timeout

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
      this.chat,
      this.friends,
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
    this.chat.on('message', (message) => this.emit('chat-message', message))
    this.chat.on('typing', (typing) => this.emit('chat-typing', typing))
    this.chat.on('state', (state) => this.emit('chat-state', state))
    this.launcher.onState((state) => this.emit('launch-state', state))

    this.ready = this.initialize()
  }

  private async initialize(): Promise<void> {
    // The data root, settings and accounts are required for every operation.
    // Keep `ready` rejected when they fail: bootstrap() awaits it, so the
    // renderer shows its fatal-start screen instead of treating an empty,
    // half-initialized client as healthy.
    let settings: Settings = this.settingsStore.get()
    try {
      // Create directories in parallel
      await Promise.all([
        ...[
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
        ].map((dir) => ensureDir(dir))
      ])
      // Load settings and accounts in parallel
      const [loaded] = await Promise.all([
        this.settingsStore.load(),
        this.accounts.load(),
        this.friends.load()
      ])
      settings = loaded
      // Apply the persisted in-game chat choice before any instance sync.
      this.instances.setChatModEnabled(settings.inGameChat !== false)
      this.logger.info('Polaris starting', { version: app.getVersion(), dataDir: this.paths.root })
      void this.syncShardGrants()
      this.shardTimer = setInterval(() => void this.syncShardGrants(), 15_000)
    } catch (error) {
      this.logger.error('Initialization failed', String(error))
      throw error
    }

    // Java and GPU detection are best effort: the launcher remains usable
    // without a runtime (Settings -> Java can rescan), so a failed scan keeps
    // the fallback hardware rather than failing startup.
    try {
      // Start the GPU probe now; the Java scan below runs while it is in flight.
      warmHardwareProbe()
      // Scan Java (needed for hardware detection) in parallel with latest release
      const [java] = await Promise.all([
        scanJava(settings.javaPath ? [settings.javaPath] : []),
        this.mojang.latestRelease().then((v) => { this.latestVersion = v }).catch(() => undefined)
      ])
      this.java = java
      this.hardware = await detectHardware(this.java)
      this.initialized = true
      this.logger.info('Hardware detected', {
        cpu: this.hardware.cpu,
        gpu: this.hardware.gpu,
        tier: this.hardware.tier,
        java: this.java.map((j) => j.version)
      })
    } catch (error) {
      this.logger.warn('Environment detection failed; using fallback hardware', String(error))
    }
  }

  /** Apply pending shard adjustments once, then acknowledge them. */
  private syncShardGrants(): Promise<void> {
    const account = this.accounts.activeStored()
    if (!account?.friendCode || !account.friendSecret) return Promise.resolve()
    if (this.shardSync) {
      if (this.shardSyncAccount !== account.id) this.shardSyncAgain = true
      return this.shardSync
    }
    const run = this.performShardSync()
      .catch((error) => {
        this.logger.warn('Could not apply queued shard adjustments', String(error))
      })
      .finally(() => {
        this.shardSync = null
        this.shardSyncAccount = null
        if (this.shardSyncAgain) {
          this.shardSyncAgain = false
          void this.syncShardGrants()
        }
      })
    this.shardSync = run
    this.shardSyncAccount = account.id
    return run
  }

  private async performShardSync(): Promise<void> {
    const account = this.accounts.activeStored()
    if (!account?.friendCode || !account.friendSecret) return
    const auth = { code: account.friendCode, secret: account.friendSecret }
    const grants = await this.shardGrants.pending(auth)
    if (grants === null) {
      this.logger.warn('Could not read queued shard adjustments')
      return
    }
    if (!grants.length) return
    const ackIds: string[] = []
    let appliedCount = 0
    for (const grant of grants) {
      if (this.settingsStore.get().appliedShardGrants.includes(grant.id)) {
        ackIds.push(grant.id)
        continue
      }
      const applied = await this.cosmetics.applyGrant(grant.id, grant.delta)
      if (applied !== 0) appliedCount += 1
      ackIds.push(grant.id)
    }
    const acknowledged = await this.shardGrants.ack(auth, ackIds)
    if (!acknowledged) {
      this.logger.warn('Could not acknowledge shard adjustments; they will retry next launch')
    }
    if (appliedCount > 0) this.emit('shards-changed', { count: appliedCount })
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
    // Ensure all existing instances have the CobbleClash server in servers.dat (background)
    void this.ensureServersDatForAll()
    const settings = this.settingsStore.get()
    const instances = await this.instances.list((id) => this.launcher.isRunning(id))
    const active = this.accounts.activeStored()
    // Check for updates in background - don't block bootstrap
    const updateInfoPromise = this.checkForUpdates().catch(() => ({
      hasUpdate: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      downloadUrl: '',
      publishedAt: new Date().toISOString()
    }))
    const updateInfo = await updateInfoPromise
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

  private async ensureServersDatForAll(): Promise<void> {
    try {
      const instanceIds = await this.instances.listIds()
      for (const id of instanceIds) {
        try {
          await ensureServersDat(this.paths.instances + '/' + id)
        } catch {
          // Ignore errors for individual instances
        }
      }
    } catch {
      // Ignore errors
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
    const isModded = input.loader === 'fabric'
    const baseMemory = this.hardware.recommendedMemoryMb
    const memory = isModded ? Math.min(32768, Math.max(baseMemory, 6144)) : baseMemory
    const config = await this.instances.create(input, this.settingsStore.get(), {
      memoryMb: memory
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
    this.hardware = await detectHardware(this.java, { refreshGpu: true })
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
    void this.syncShardGrants()
    return this.accountSnapshot()
  }

  async removeAccount(id: string): Promise<AccountSnapshot> {
    await this.accounts.remove(id)
    return this.accountSnapshot()
  }

  async beginMicrosoftLogin(): Promise<import('../shared/types').DeviceCodeInfo> {
    const clientId = this.settingsStore.get().msClientId || '09aa1d05-9369-4725-bdb8-a46e54149e71'
    return await this.auth.beginDeviceLogin(clientId, {
      onDeviceCode: (info) => this.emit('device-code', info),
      onAccount: (account) => {
        void this.syncShardGrants()
        this.emit('account-changed', this.accountSnapshot())
      },
      onError: (message) => this.emit('account-error', message)
    })
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const updated = await this.settingsStore.update(patch)
    if (Object.prototype.hasOwnProperty.call(patch, 'inGameChat')) {
      this.instances.setChatModEnabled(updated.inGameChat !== false)
      // Apply the removal or reinstall before returning to the UI.
      try {
        await this.instances.list((id) => this.launcher.isRunning(id))
      } catch {
        // Instance sync is best effort; the setting is already persisted.
      }
    }
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

  async downloadJava(major: number, onProgress?: (progress: any) => void): Promise<JavaInfo[]> {
    const { downloadJava } = await import('../core/java')
    const dest = join(this.paths.java, `temurin-${major}`)
    const javaPath = await downloadJava(major, dest, onProgress)
    await this.settingsStore.update({ javaPath })
    this.java = await scanJava([javaPath])
    this.hardware = { ...this.hardware, java: this.java }
    return this.java
  }

  chatStart(): void {
    const account = this.accounts.activeStored()
    if (!account?.friendCode || !account.friendSecret) {
      this.chat.stop()
      return
    }
    this.chat.start({ code: account.friendCode, secret: account.friendSecret })
  }

  chatStop(): void {
    this.chat.stop()
  }

  async chatHistory(friendCode: string): Promise<ChatMessage[]> {
    return await this.chat.history(friendCode)
  }

  async chatSend(friendCode: string, text: string): Promise<ChatMessage> {
    return await this.chat.send(friendCode, text)
  }

  async chatTyping(friendCode: string): Promise<void> {
    await this.chat.typing(friendCode)
  }

  async activeAccountForLaunch(): Promise<StoredAccount | undefined> {
    return this.accounts.activeStored()
  }

  async listMods(instanceId: string): Promise<InstalledMod[]> {
    return await this.mods.list(await this.instances.get(instanceId))
  }

  async fabricLoaders(mcVersion: string): Promise<{ version: string; stable: boolean }[]> {
    const loaders = await this.fabric.loaders(mcVersion)
    return loaders.map((entry) => ({
      version: entry.loader.version,
      stable: entry.loader.stable
    }))
  }

  async fabricEnsure(mcVersion: string, preferredLoader?: string): Promise<{ versionId: string; loaderVersion: string }> {
    const install = await this.fabric.ensure(mcVersion, preferredLoader)
    return { versionId: install.versionId, loaderVersion: install.loaderVersion }
  }

  /**
   * Check GitHub releases for a newer version.
   *
   * GitHub is the trust anchor, not the Polaris Worker. The Worker could be
   * compromised or misconfigured, so it cannot be allowed to name both the
   * installer URL and the hash the launcher verifies.
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion()
    const repo = 'eddddiwe/polaris-client'
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Polaris-Client' },
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
      const data = await res.json()
      const latestVersion = String(data.tag_name || '').replace(/^v/, '')
      if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new Error('GitHub release has no valid version tag')
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0
      if (!hasUpdate) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion,
          releaseNotes: data.body ?? undefined,
          downloadUrl: '',
          publishedAt: data.published_at ?? new Date().toISOString()
        }
      }

      const expectedName = `Polaris-Setup-${latestVersion}.exe`
      const asset = (data.assets ?? []).find((entry: any) => entry.name === expectedName)
      const digest = typeof asset?.digest === 'string' ? asset.digest.replace(/^sha256:/i, '').toLowerCase() : ''
      if (!asset || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error(`Release v${latestVersion} has no SHA-256 digest on its installer asset`)
      }
      const downloadUrl = String(asset.browser_download_url || '')
      if (!isTrustedReleaseAsset(downloadUrl, latestVersion)) {
        throw new Error('GitHub returned an unexpected installer URL')
      }
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes: data.body ?? undefined,
        downloadUrl,
        downloadSize: Number(asset.size) || undefined,
        downloadSha256: digest,
        publishedAt: data.published_at ?? new Date().toISOString()
      }
    } catch (err) {
      this.logger.warn('Update check failed closed', err)
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        downloadUrl: '',
        publishedAt: new Date().toISOString()
      }
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

  /**
   * Download and hand off to the platform installer.
   *
   * Repeated clicks share one in-flight operation: the old implementation
   * downloaded every click to the same temp file, so concurrent download,
   * rename and spawn attempts deleted or locked each other (`EBUSY`, `EPERM`,
   * and `.part` rename failures) and no installer ever ran.
   */
  installUpdate(): Promise<InstallUpdateResult> {
    if (this.updateInFlight) return this.updateInFlight
    const run = this.performInstallUpdate().finally(() => {
      this.updateInFlight = null
    })
    this.updateInFlight = run
    return run
  }

  private async performInstallUpdate(): Promise<InstallUpdateResult> {
    const info = await this.checkForUpdates()
    if (!info.hasUpdate) {
      return { status: 'up-to-date', version: info.latestVersion }
    }
    if (!info.downloadUrl || !info.downloadSha256) {
      return { status: 'unavailable', version: info.latestVersion }
    }

    const installerPath = await this.downloadInstaller(info)
    this.logger.info('Update downloaded; starting installer handoff', {
      version: info.latestVersion,
      installerPath
    })

    if (process.platform === 'win32') {
      await this.launchWindowsInstaller(installerPath, info.downloadSha256)
    } else {
      // macOS DMG / Linux AppImage: let the desktop open the downloaded file.
      const openError = await shell.openPath(installerPath)
      if (openError) {
        throw new Error(`Could not open the installer: ${openError}`)
      }
    }

    // Give the IPC reply time to reach the renderer, then hand the app over
    // to the installer. The helper waits for this process to exit before it
    // touches the installation directory.
    setTimeout(() => {
      app.quit()
      setTimeout(() => app.exit(0), 2000)
    }, 400)

    return { status: 'installing', version: info.latestVersion, installerPath }
  }

  /**
   * Download the installer into the Polaris data directory (not %TEMP%),
   * verify its published size/SHA-256, and reuse an intact previous download.
   * A per-attempt filename means a locked stale installer can never block a
   * fresh update.
   */
  private async downloadInstaller(info: UpdateInfo): Promise<string> {
    if (!info.downloadSha256 || !/^[0-9a-f]{64}$/i.test(info.downloadSha256)) {
      throw new Error('Refusing to download an installer without a published SHA-256')
    }
    const dir = join(this.paths.downloads, 'updates')
    await ensureDir(dir)

    const rawName = info.downloadUrl.split('/').pop()?.split('?')[0] || `Polaris-Setup-${info.latestVersion}.exe`
    const name = rawName.replace(/[^A-Za-z0-9._-]/g, '_')
    const canonical = join(dir, name)

    if (await this.installerIsUsable(canonical, info)) {
      this.logger.info('Reusing verified installer download', { installerPath: canonical })
      return canonical
    }

    // Stable destination lets the downloader resume an interrupted installer.
    const written = await this.downloader.downloadFile(info.downloadUrl, canonical, {
      expectedSize: info.downloadSize,
      sha256: info.downloadSha256
    })
    if (written < 1_000_000) {
      throw new Error(`Downloaded installer is unexpectedly small (${written} bytes)`)
    }
    if (!(await this.installerIsUsable(canonical, info))) {
      throw new Error('Installer failed its post-download SHA-256 verification')
    }
    return canonical
  }

  private async installerIsUsable(path: string, info: UpdateInfo): Promise<boolean> {
    try {
      if (!info.downloadSha256 || !/^[0-9a-f]{64}$/i.test(info.downloadSha256)) return false
      const file = await stat(path)
      if (file.size < 1_000_000) return false
      if (info.downloadSize && file.size !== info.downloadSize) return false
      const digest = await hashFile(path, 'sha256')
      return digest.toLowerCase() === info.downloadSha256.toLowerCase()
    } catch {
      return false
    }
  }

  /**
   * Hand off to a one-shot Windows scheduled task. A detached child process
   * is killed with Electron on this platform, so Task Scheduler is used to
   * run the helper independently of the launcher.
   *
   * The helper is a static, packaged script. It re-verifies the installer
   * SHA-256 and holds a read-only handle for the whole install, so replacing
   * the file between the launcher's check and execution fails.
   */
  private async launchWindowsInstaller(installerPath: string, sha256: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/i.test(sha256)) {
      throw new Error('Refusing to launch an installer without a valid SHA-256')
    }
    const appExe = app.isPackaged ? app.getPath('exe') : ''
    const taskName = 'PolarisClientUpdate'
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'update-helper.ps1')
      : join(app.getAppPath(), 'resources', 'update-helper.ps1')
    if (!(await pathExists(helperPath))) {
      throw new Error('The packaged update helper is missing; reinstall Polaris Client')
    }
    const logPath = join(this.paths.logs, 'update-helper.log')
    const tempDir = await mkdtemp(join(os.tmpdir(), 'polaris-update-'))
    const taskXmlPath = join(tempDir, 'task.xml')

    const helperArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      helperPath,
      '-Installer',
      installerPath,
      '-Sha256',
      sha256.toLowerCase(),
      '-ParentPid',
      String(process.pid),
      '-AppExe',
      appExe,
      '-LogPath',
      logPath,
      '-TaskXml',
      taskXmlPath
    ]
    const commandLine = helperArgs.map((arg) => `"${arg}"`).join(' ')
    const xml = buildUpdateTaskXml(commandLine)
    await writeFile(
      taskXmlPath,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')])
    )

    try {
      // `/Create /F` replaces the task definition but does not stop an
      // already running helper. With IgnoreNew, `/Run` would then report
      // success without starting this attempt, and the old helper's cleanup
      // would delete the new registration. Clear the stale instance first.
      await resetUpdateTask(
        (command, args, timeoutMs) => this.runProcess(command, args, timeoutMs),
        taskName
      )

      const created = await this.runProcess('schtasks.exe', [
        '/Create',
        '/TN',
        taskName,
        '/XML',
        taskXmlPath,
        '/F'
      ])
      if (created !== 0) {
        this.logger.warn('Could not register the update helper task; opening the verified installer directly', {
          code: created
        })
        await this.openVerifiedInstaller(installerPath, sha256)
        return
      }

      const started = await this.runProcess('schtasks.exe', ['/Run', '/TN', taskName])
      if (started !== 0) {
        this.logger.warn('Could not start the update helper task; opening the verified installer directly', {
          code: started
        })
        // A task registered but never started would otherwise stay behind
        // forever because the helper that normally deletes it never ran.
        await this.runProcess('schtasks.exe', ['/Delete', '/TN', taskName, '/F'])
        await this.openVerifiedInstaller(installerPath, sha256)
        return
      }

      this.logger.info('Update helper task started', { taskName, helperPath, logPath })
    } finally {
      // The task has already read its XML. Do not leave predictable update
      // files in the user's data directory.
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /**
   * Open the already-verified installer without Task Scheduler. Re-check the
   * digest immediately before ShellExecute so a replaced file is still
   * refused, and surface ShellExecute failures instead of quitting the
   * launcher while nothing is installing.
   */
  private async openVerifiedInstaller(installerPath: string, sha256: string): Promise<void> {
    if ((await hashFile(installerPath, 'sha256')).toLowerCase() !== sha256.toLowerCase()) {
      throw new Error('Installer changed after verification; refusing to run it')
    }
    const error = await shell.openPath(installerPath)
    if (error) {
      throw new Error(`Could not open the installer: ${error}`)
    }
  }

  private runProcess(command: string, args: string[], timeoutMs = 60_000): Promise<number> {
    return new Promise((resolve) => {
      let settled = false
      let timer: NodeJS.Timeout
      const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' })
      const finish = (code: number): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(code)
      }
      timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // already gone
        }
        finish(-1)
      }, timeoutMs)
      child.once('error', () => finish(-1))
      child.once('exit', (code) => finish(code ?? -1))
    })
  }

  /** Import a local .mrpack file: parse manifest, create instance, return summary. */
  async importMrpack(): Promise<InstanceSummary> {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Modpack Files', extensions: ['mrpack'] }]
    })
    if (!result.filePaths?.[0]) throw new Error('No file selected')

    const archive = await stat(result.filePaths[0])
    if (archive.size <= 0 || archive.size > 1024 * 1024 * 1024) {
      throw new Error('Modpack archive is too large')
    }
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(await readFile(result.filePaths[0]))
    assertSafeZip(zip, 'Modpack archive', MODPACK_ZIP_LIMITS)

    // Try Modrinth format first (modrinth.index.json)
    const modrinthEntry = zip.getEntry('modrinth.index.json')
    if (modrinthEntry) {
      const plan = parseMrpackIndex(readZipText(modrinthEntry, 'modrinth.index.json'))
      const config = await this.instances.create(
        {
          name: plan.name || 'Imported Modpack',
          mcVersion: plan.mcVersion,
          loader: plan.loader,
          kind: 'game',
          packs: []
        },
        this.settingsStore.get(),
        { memoryMb: this.hardware.recommendedMemoryMb }
      )
      if (plan.loaderVersion) {
        await this.instances.update(config.id, { loaderVersion: plan.loaderVersion })
      }

      // Populate: download mods + extract overrides
      const populated = await this.modpacks.populate(config, result.filePaths[0], plan, { includeOptional: false })
      await this.instances.update(config.id, {
        modpack: {
          projectId: 'local',
          slug: 'local',
          name: plan.name,
          versionId: plan.packVersion,
          versionNumber: plan.packVersion,
          filesTotal: plan.files.length,
          filesInstalled: populated.filesInstalled
        },
        packs: []
      })
      return await this.summarize(await this.instances.get(config.id))
    }

    // Fall back to CurseForge format (manifest.json)
    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) throw new Error('Invalid .mrpack: missing manifest.json or modrinth.index.json')

    const manifest = JSON.parse(readZipText(manifestEntry, 'manifest.json'))
    const modCount = manifest.mods ? manifest.mods.length : 0
    const modNames = manifest.mods?.map((m: any) => m.name).join(', ') || 'unknown'
    const mcVersion = String(manifest.mc_version || '').trim()
    if (!mcVersion) {
      throw new Error('This modpack manifest does not declare a Minecraft version')
    }

    const config = await this.instances.create(
      {
        name: manifest.name || 'Imported Modpack',
        mcVersion,
        loader: (manifest.loaders?.[0] || 'fabric') as LoaderType,
        kind: 'game',
        packs: []
      },
      this.settingsStore.get(),
      { memoryMb: this.hardware.recommendedMemoryMb }
    )

    // Extract overrides if present
    const instanceDir = join(this.paths.instances, config.id)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const target =
        safeOverridePath(instanceDir, entry.entryName, 'overrides/') ??
        safeOverridePath(instanceDir, entry.entryName, 'client-overrides/')
      if (!target) continue
      await ensureDir(dirname(target))
      await writeFile(target, readZipEntry(entry, 256 * 1024 * 1024, entry.entryName))
    }

    return await this.summarize(await this.instances.get(config.id))
  }
}

/** One-shot per-user task that runs the update helper outside the app. */
function buildUpdateTaskXml(args: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Polaris Client update helper</Description>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${xmlEscape(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

function isTrustedReleaseAsset(value: string, version: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname ===
        `/eddddiwe/polaris-client/releases/download/v${version}/Polaris-Setup-${version}.exe`
    )
  } catch {
    return false
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
