import type {
  AccountSnapshot,
  Bootstrap,
  CosmeticSnapshot,
  CreateFromPackInput,
  CreateInstanceInput,
  DeviceCodeInfo,
  GameUiApplyResult,
  GameUiOptions,
  GameUiSnapshot,
  InstanceConfig,
  InstanceDetail,
  InstanceSummary,
  InstalledMod,
  JavaInfo,
  JvmPresetId,
  LaunchState,
  LogChunk,
  ModCategory,
  ModDetail,
  ModInstallResult,
  ModSearchFilters,
  ModSearchResult,
  ModUpdateInfo,
  ModUpdateResult,
  ModVersionEntry,
  ModrinthSearchHit,
  PackApplyResult,
  PackModStatus,
  PerfApplyResult,
  PerfPlan,
  PerfProfileId,
  PerfScanResult,
  ProgressEvent,
  Settings,
  ShardClaimResult,
  UpdateInfo,
  VersionSummary
} from './types'

export interface PolarisAPI {
  platform: NodeJS.Platform
  bootstrap(): Promise<Bootstrap>
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'show'): Promise<void>
  openExternal(url: string): Promise<void>
  openRootFolder(): Promise<void>
  openInstanceFolder(id: string): Promise<void>
  openLogsFolder(id: string): Promise<void>

  versions(includeSnapshots: boolean): Promise<VersionSummary[]>
  fabricLoaders(mcVersion: string): Promise<{ version: string; stable: boolean }[]>
  fabricEnsure(mcVersion: string, preferredLoader?: string): Promise<{ versionId: string; loaderVersion: string }>
  getInstance(id: string): Promise<InstanceDetail>
  createInstance(input: CreateInstanceInput): Promise<InstanceSummary>
  updateInstance(id: string, patch: Partial<InstanceConfig>): Promise<InstanceSummary>
  deleteInstance(id: string): Promise<void>

  launch(id: string): Promise<LaunchState>
  stop(): Promise<void>
  tailLogs(id: string, lines?: number): Promise<string[]>

  listMods(id: string): Promise<InstalledMod[]>
  searchMods(
    query: string,
    type: 'mod' | 'modpack',
    instanceId: string | null,
    offset?: number,
    filters?: ModSearchFilters
  ): Promise<ModSearchResult>
  installMod(instanceId: string, ref: string): Promise<ModInstallResult>
  removeMod(instanceId: string, identifier: string): Promise<void>
  toggleMod(instanceId: string, filename: string): Promise<void>
  /** Installed files that have a newer compatible version on Modrinth. */
  modUpdates(instanceId: string): Promise<ModUpdateInfo[]>
  updateMods(instanceId: string, projectIds?: string[]): Promise<ModUpdateResult>
  modDetail(ref: string): Promise<ModDetail>
  modVersions(ref: string, instanceId: string | null): Promise<ModVersionEntry[]>
  installModVersion(instanceId: string, versionId: string): Promise<ModInstallResult>
  modCategories(type?: 'mod' | 'modpack'): Promise<ModCategory[]>

  packStatus(instanceId: string, packId: string): Promise<PackModStatus[]>
  applyPack(instanceId: string, packId: string): Promise<PackApplyResult>
  createInstanceFromPack(input: CreateFromPackInput): Promise<InstanceSummary>

  scanPerformance(): Promise<PerfScanResult>
  planPerformance(
    instanceId: string,
    profile: PerfProfileId,
    memoryMb?: number,
    preset?: JvmPresetId
  ): Promise<PerfPlan>
  applyPerformance(
    instanceId: string,
    profile: PerfProfileId,
    memoryMb?: number,
    preset?: JvmPresetId
  ): Promise<PerfApplyResult>

  serverCommand(instanceId: string, command: string): Promise<void>
  gameUi(instanceId: string): Promise<GameUiSnapshot>
  applyGameUi(instanceId: string, values: Partial<GameUiOptions>): Promise<GameUiApplyResult>

  cosmetics(): Promise<CosmeticSnapshot>
  buyCosmetic(id: string): Promise<CosmeticSnapshot>
  equipCosmetic(id: string): Promise<CosmeticSnapshot>
  claimShards(): Promise<ShardClaimResult>

  addOfflineAccount(name: string): Promise<AccountSnapshot>
  removeAccount(id: string): Promise<AccountSnapshot>
  setActiveAccount(id: string): Promise<AccountSnapshot>
  microsoftLogin(): Promise<DeviceCodeInfo>

  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseJava(): Promise<{ path: string; java: JavaInfo[] }>
  rescanJava(): Promise<JavaInfo[]>
  settingsSnapshot(): Promise<Settings>
  checkForUpdates(): Promise<UpdateInfo>
  installUpdate(): Promise<void>
  importMrpack(): Promise<InstanceSummary>

  onProgress(cb: (event: ProgressEvent) => void): () => void
  onLaunchState(cb: (state: LaunchState) => void): () => void
  onGameLog(cb: (chunk: LogChunk) => void): () => void
  onGameState(cb: (state: { running: boolean; instanceId: string | null }) => void): () => void
  onAccountChanged(cb: (snapshot: AccountSnapshot) => void): () => void
  onAccountError(cb: (message: string) => void): () => void
  onDeviceCode(cb: (info: DeviceCodeInfo) => void): () => void
}

export type { ModrinthSearchHit }
