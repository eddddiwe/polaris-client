export type LoaderType = 'vanilla' | 'fabric'
export type InstanceKind = 'game' | 'server'
export type PerfProfileId = 'competitive' | 'balanced' | 'quality'
export type JvmPresetId = 'aikar' | 'low-latency' | 'zgc' | 'custom'
export type ModSource = 'performance' | 'qol' | 'hud' | 'shaders' | 'server' | 'modpack' | 'manual'
export type ModSortIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
export type WallpaperPreset = 'none' | 'aurora' | 'nebula' | 'starfield' | 'grid' | 'custom'
export type CosmeticKind = 'badge' | 'cape'
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface JavaInfo {
  path: string
  major: number
  version: string
  vendor: string
  source: string
  recommended?: boolean
}

export interface HardwareInfo {
  cpu: string
  threads: number
  physicalCores: number
  ramGb: number
  gpu: string
  gpuVendor: string
  os: string
  arch: string
  tier: 'entry' | 'mainstream' | 'high' | 'enthusiast'
  recommendedMemoryMb: number
  java: JavaInfo[]
  detectedAt: number
}

export interface InstanceConfig {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  kind?: InstanceKind
  createdAt: number
  lastPlayed?: number
  playtimeMs: number
  javaPath?: string
  memoryMb: number
  perfProfile: PerfProfileId
  jvmPreset: JvmPresetId
  customJvmArgs: string
  width: number
  height: number
  fullscreen: boolean
  extraGameArgs: string
  packs: string[]
  autoUpdate: boolean
  accent: string
  notes: string
  icon?: string
  port?: number
  eulaAccepted?: boolean
  modpack?: ModpackRef
}

export interface InstanceSummary extends InstanceConfig {
  modCount: number
  running: boolean
  installed: boolean
  diskBytes: number
}

export interface InstalledMod {
  projectId: string
  slug: string
  name: string
  versionId: string
  versionNumber: string
  filename: string
  size: number
  sha1?: string
  enabled: boolean
  source: ModSource
  iconUrl?: string
  hasUpdate?: boolean
  installedAt: number
}

export interface ModpackRef {
  projectId: string
  slug: string
  name: string
  versionId: string
  versionNumber: string
  filesTotal: number
  filesInstalled: number
}

export interface ModSearchFilters {
  sort?: ModSortIndex
  categories?: string[]
}

export interface ModCategory {
  name: string
  icon?: string
  header?: boolean
}

export interface ModGalleryImage {
  url: string
  featured: boolean
  title?: string
  created?: string
}

export interface ModDetail {
  projectId: string
  slug: string
  title: string
  description: string
  body: string
  iconUrl?: string
  color?: number | null
  gallery: ModGalleryImage[]
  downloads: number
  follows: number
  categories: string[]
  additionalCategories: string[]
  license: string
  projectType: 'mod' | 'modpack' | string
  clientSide: string
  serverSide: string
  published: string
  updated: string
  gameVersions: string[]
  links: { source?: string; issues?: string; wiki?: string; discord?: string }
}

export interface ModVersionEntry {
  id: string
  name: string
  versionNumber: string
  versionType: 'release' | 'beta' | 'alpha'
  gameVersions: string[]
  loaders: string[]
  datePublished: string
  downloads: number
  changelog: string
  filename: string
  size: number
  dependencies: { projectId: string | null; type: string }[]
}

export interface ModUpdateInfo {
  projectId: string
  slug: string
  name: string
  iconUrl?: string
  currentVersionNumber: string
  newVersionNumber: string
  newVersionId: string
}

export interface Account {
  id: string
  type: 'offline' | 'microsoft'
  name: string
  uuid: string
  active: boolean
    // tokens never cross the IPC boundary
  skinUrl?: string
}

export interface Settings {
  dataDir: string
  javaPath: string
  memoryMb: number
  msClientId: string
  closeLauncherOnPlay: boolean
  lowerLauncherPriority: boolean
  pauseUiDuringGame: boolean
  autoUpdateMods: boolean
  showSnapshots: boolean
  accent: string
  reduceMotion: boolean
  mirrorVanillaCache: boolean
  /** Built-in wallpaper scene, or `custom` for a remote GIF/WebP/MP4. */
  wallpaper: WallpaperPreset
  wallpaperUrl: string
  /** 0–90: dark overlay strength. */
  wallpaperDim: number
  /** 0–30: blur radius in CSS pixels. */
  wallpaperBlur: number
  wallpaperMotion: boolean
  ownedCosmetics: string[]
  equippedBadge: string
  equippedCape: string
  shards: number
  /** Total playtime already converted into shards. */
  shardsClaimedMs: number
}

export interface CosmeticItem {
  id: string
  name: string
  kind: CosmeticKind
  tagline: string
  rarity: CosmeticRarity
  price: number
  /** Small vector glyph drawn inside the badge. */
  glyph?: string
  colors: [string, string]
  /** Cape artwork pattern; unused for badges. */
  pattern?: string
}

export interface CosmeticSnapshot {
  items: CosmeticItem[]
  owned: string[]
  equippedBadge: string
  equippedCape: string
  shards: number
  claimable: number
  totalPlaytimeMs: number
}

export interface ShardClaimResult {
  granted: number
  snapshot: CosmeticSnapshot
}

export interface GameUiOptions {
  guiScale: number
  fov: number
  gamma: number
  chatOpacity: number
  chatScale: number
  screenEffectScale: number
  attackIndicator: number
}

export interface GameUiSnapshot {
  values: GameUiOptions
  source: 'options.txt' | 'defaults'
}

export interface GameUiApplyResult {
  values: GameUiOptions
  changed: number
  backup?: string
}

export interface VersionSummary {
  id: string
  type: string
  releaseTime: string
}

export interface PackMod {
  slug: string
  name: string
  note: string
  /** Hardware gate: pack apply skips the mod with an explanatory note when unmet. */
  requires?: 'nvidia'
}

export interface PackDefinition {
  id: string
  name: string
  tagline: string
  description: string
  color: string
  recommended: boolean
  /** Which instance kinds this pack is offered for. Defaults to 'client'. */
  target?: 'client' | 'server'
  mods: PackMod[]
}

export interface PackModStatus {
  slug: string
  name: string
  note: string
  state: 'installed' | 'available' | 'unsupported' | 'already' | 'failed'
  versionNumber?: string
  projectId?: string
  error?: string
}

export interface PackApplyResult {
  result: ModInstallResult
  statuses: PackModStatus[]
}

export interface PackStatus {
  packId: string
  name: string
  installed: number
  total: number
  mods: PackModStatus[]
}

export interface LaunchState {
  instanceId: string | null
  status: 'idle' | 'preparing' | 'running' | 'exited' | 'crashed'
  pid?: number
  startedAt?: number
  exitCode?: number | null
  message?: string
}

export interface ProgressEvent {
  taskId: string
  label: string
  detail: string
  current: number
  total: number
  done: boolean
  error?: string
}

export interface Bootstrap {
  appVersion: string
  settings: Settings
  instances: InstanceSummary[]
  accounts: Account[]
  activeAccountId: string | null
  hardware: HardwareInfo
  launch: LaunchState
  java: JavaInfo[]
  dataDir: string
  packs: PackDefinition[]
  latestVersion?: string
}

export interface PerfPlan {
  profile: PerfProfileId
  memoryMb: number
  jvmPreset: JvmPresetId
  jvmArgs: string[]
  options: Record<string, string>
  notes: string[]
  score: number
}

export interface ModrinthSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  downloads: number
  follows?: number
  author?: string
  categories: string[]
  displayCategories?: string[]
  projectType: string
  versions: string[]
  license?: string
  clientSide?: string
  serverSide?: string
  dateModified?: string
  color?: number | null
  featuredGallery?: string
}

export interface LogChunk {
  instanceId: string
  lines: string[]
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  message: string
}

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader: LoaderType
  kind?: InstanceKind
  memoryMb?: number
  perfProfile?: PerfProfileId
  packs?: string[]
  port?: number
  eulaAccepted?: boolean
  icon?: string
}

export interface CreateFromPackInput {
  packRef: string
  name?: string
  memoryMb?: number
  includeOptional?: boolean
}

export interface ModUpdateResult {
  updates: ModUpdateInfo[]
  result: ModInstallResult
}

export interface ModInstallResult {
  installed: string[]
  skipped: string[]
  unsupported: string[]
  failed: { name: string; error: string }[]
  dependencies: string[]
}

export interface InstanceDetail {
  instance: InstanceConfig
  mods: InstalledMod[]
  installed: boolean
}

export interface AccountSnapshot {
  accounts: Account[]
  activeAccountId: string | null
}

export interface PerfScanResult {
  hardware: HardwareInfo
  java: JavaInfo[]
}

export interface PerfApplyResult {
  plan: PerfPlan
  changed: number
  backup?: string
}

export interface ModSearchResult {
  hits: ModrinthSearchHit[]
  total: number
}
