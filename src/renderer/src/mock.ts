import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AccountSnapshot,
  Bootstrap,
  CosmeticSnapshot,
  CreateFromPackInput,
  CreateInstanceInput,
  DeviceCodeInfo,
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
  ModUpdateInfo,
  ModUpdateResult,
  ModVersionEntry,
  ModSearchResult,
  ModrinthSearchHit,
  PackApplyResult,
  PackModStatus,
  PerfApplyResult,
  PerfPlan,
  PerfProfileId,
  PerfScanResult,
  Settings,
  ShardClaimResult,
  VersionSummary
} from '@shared/types'
import { PACKS } from '@shared/packs'
import { COSMETICS, cosmeticById, shardsForPlaytime } from '@shared/cosmetics'

const java: JavaInfo[] = [
  {
    path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.4.101-hotspot\\bin\\javaw.exe',
    major: 25,
    version: '25.0.4.1',
    vendor: 'Eclipse Adoptium',
    source: 'detected',
    recommended: true
  },
  {
    path: 'C:\\Program Files\\Java\\jdk-21.0.7\\bin\\javaw.exe',
    major: 21,
    version: '21.0.7',
    vendor: 'Oracle Corporation',
    source: 'detected'
  }
]

const hardware: HardwareInfo = {
  cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor',
  threads: 16,
  physicalCores: 8,
  ramGb: 24,
  gpu: 'NVIDIA GeForce RTX 3070 Ti',
  gpuVendor: 'NVIDIA',
  os: 'Windows 11 10.0.26100',
  arch: 'x64',
  tier: 'high',
  recommendedMemoryMb: 6144,
  java,
  detectedAt: Date.now()
}

const now = Date.now()

function mod(
  projectId: string,
  slug: string,
  name: string,
  versionNumber: string,
  source: InstalledMod['source'],
  enabled = true
): InstalledMod {
  return {
    projectId,
    slug,
    name,
    versionId: `${projectId}-${versionNumber}`,
    versionNumber,
    filename: `${slug}-${versionNumber}.jar`,
    size: 480_000,
    enabled,
    source,
    installedAt: now - 86400000
  }
}

const sampleMods: InstalledMod[] = [
  mod('P7dR8mSH', 'fabric-api', 'Fabric API', '0.164.0+26.3', 'performance'),
  mod('AANobbMI', 'sodium', 'Sodium', 'mc26.3-0.9.3-beta.1', 'performance'),
  mod('gvQqBUqZ', 'lithium', 'Lithium', 'mc26.3-0.26.2', 'performance'),
  mod('uXXizFIs', 'ferrite-core', 'FerriteCore', '9.0.0', 'performance'),
  mod('NNAgCjsB', 'entityculling', 'Entity Culling', '1.11.3', 'performance'),
  mod('5ZwdcRci', 'immediatelyfast', 'ImmediatelyFast', '1.17.1+26.3', 'performance'),
  mod('mOgUt4GM', 'modmenu', 'Mod Menu', '21.0.0', 'qol'),
  mod('w7ThoJFB', 'zoomify', 'Zoomify', '2.17.0+mc26.3', 'qol'),
  mod('2M01OLQq', 'shulkerboxtooltip', 'Shulker Box Tooltip', '5.4.2+26.3', 'qol', false)
]

const baseInstance = (
  id: string,
  name: string,
  mcVersion: string,
  loader: 'vanilla' | 'fabric',
  accent: string,
  memoryMb: number,
  packs: string[],
  mods: number,
  lastPlayed: number
): InstanceSummary => ({
  id,
  name,
  mcVersion,
  loader,
  loaderVersion: loader === 'fabric' ? '0.19.5' : undefined,
  createdAt: now - 86400000 * 14,
  lastPlayed,
  playtimeMs: 7_260_000,
  memoryMb,
  perfProfile: 'balanced',
  jvmPreset: 'aikar',
  customJvmArgs: '',
  width: 1280,
  height: 720,
  fullscreen: false,
  extraGameArgs: '',
  packs,
  autoUpdate: false,
  accent,
  notes: '',
  modCount: mods,
  running: false,
  installed: true,
  diskBytes: 412_000_000
})

let instances: InstanceSummary[] = [
  baseInstance('astra-7f3a1c', 'Astra', '26.3', 'fabric', '#8b5cf6', 8192, ['performance', 'qol'], 9, now - 3600_000),
  baseInstance('crimson-91be20', 'Crimson', '1.21.10', 'fabric', '#fb7185', 4096, ['performance', 'hud'], 8, now - 86400000 * 3),
  baseInstance('vanilla-2c8811', 'Vanilla', '26.3', 'vanilla', '#22d3ee', 4096, [], 0, 0),
  {
    ...baseInstance('survival-4d2e11', 'Survival Server', '1.21.10', 'fabric', '#34d399', 6144, ['server'], 6, now - 86400000 * 6),
    kind: 'server',
    port: 25565,
    eulaAccepted: true,
    icon: '🌲',
    playtimeMs: 0
  }
]

let accounts: AccountSnapshot = {
  accounts: [{ id: 'offline:steve', type: 'offline', name: 'Steve', uuid: '8667ba71-b85a-4004-af54-457a9734eed7', active: true }],
  activeAccountId: 'offline:steve'
}

let settings: Settings = {
  dataDir: 'C:\\Users\\you\\AppData\\Roaming\\Polaris',
  javaPath: java[0].path,
  memoryMb: 8192,
  msClientId: '',
  closeLauncherOnPlay: true,
  lowerLauncherPriority: true,
  pauseUiDuringGame: true,
  autoUpdateMods: false,
  showSnapshots: false,
  accent: '#8b5cf6',
  reduceMotion: false,
  mirrorVanillaCache: true,
  wallpaper: 'aurora',
  wallpaperUrl: '',
  wallpaperDim: 50,
  wallpaperBlur: 0,
  wallpaperMotion: true,
  ownedCosmetics: ['badge-north', 'badge-comet', 'badge-aurora', 'cape-classic', 'cape-aurora'],
  equippedBadge: 'badge-aurora',
  equippedCape: 'cape-aurora',
  shards: 780,
  shardsClaimedMs: 0
}

let mockGameUi: GameUiOptions = {
  guiScale: 2,
  fov: 80,
  gamma: 0.5,
  chatOpacity: 1,
  chatScale: 1,
  screenEffectScale: 1,
  attackIndicator: 1
}

function playtimeTotal(): number {
  return instances.reduce((total, instance) => total + instance.playtimeMs, 0)
}

function cosmeticSnapshot(): CosmeticSnapshot {
  const total = playtimeTotal()
  return {
    items: COSMETICS,
    owned: [...settings.ownedCosmetics],
    equippedBadge: settings.equippedBadge,
    equippedCape: settings.equippedCape,
    shards: settings.shards,
    claimable: Math.max(0, shardsForPlaytime(total) - shardsForPlaytime(settings.shardsClaimedMs)),
    totalPlaytimeMs: total
  }
}

const versions: VersionSummary[] = [
  { id: '26.3', type: 'release', releaseTime: '2026-09-15T11:23:02+00:00' },
  { id: '26.2', type: 'release', releaseTime: '2026-08-18T10:00:00+00:00' },
  { id: '26.1.1', type: 'release', releaseTime: '2026-07-20T10:00:00+00:00' },
  { id: '1.21.10', type: 'release', releaseTime: '2026-02-10T10:00:00+00:00' },
  { id: '1.21.8', type: 'release', releaseTime: '2025-12-02T10:00:00+00:00' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' }
]

const discoverMods: ModrinthSearchHit[] = [
  {
    projectId: 'AANobbMI',
    slug: 'sodium',
    title: 'Sodium',
    description: 'A modern rendering engine that dramatically improves frame rates and reduces micro-stutter.',
    downloads: 92_000_000,
    categories: ['optimization'],
    projectType: 'mod',
    versions: ['26.3', '26.2', '1.21.10']
  },
  {
    projectId: 'gvQqBUqZ',
    slug: 'lithium',
    title: 'Lithium',
    description: 'Game logic optimizations for physics, mob AI, block ticking and more.',
    downloads: 74_800_000,
    categories: ['optimization'],
    projectType: 'mod',
    versions: ['26.3', '26.2']
  },
  {
    projectId: 'NNAgCjsB',
    slug: 'entityculling',
    title: 'Entity Culling',
    description: 'Skips rendering entities and block entities that cannot be seen.',
    downloads: 28_000_000,
    categories: ['optimization'],
    projectType: 'mod',
    versions: ['26.3', '26.2', '1.21.10']
  },
  {
    projectId: '5ZwdcRci',
    slug: 'immediatelyfast',
    title: 'ImmediatelyFast',
    description: 'Speeds up immediate-mode rendering for HUD, text, maps and item icons.',
    downloads: 21_000_000,
    categories: ['optimization'],
    projectType: 'mod',
    versions: ['26.3', '26.2']
  },
  {
    projectId: 'w7ThoJFB',
    slug: 'zoomify',
    title: 'Zoomify',
    description: 'A smooth, configurable zoom mod with a clean settings screen.',
    downloads: 15_000_000,
    categories: ['utility'],
    projectType: 'mod',
    versions: ['26.3', '26.2']
  },
  {
    projectId: 'mOgUt4GM',
    slug: 'modmenu',
    title: 'Mod Menu',
    description: 'Browse installed mods and open their configuration screens.',
    downloads: 64_000_000,
    categories: ['management'],
    projectType: 'mod',
    versions: ['26.3', '26.2']
  },
  {
    projectId: '9eGKb6K1',
    slug: 'simple-voice-chat',
    title: 'Simple Voice Chat',
    description: 'Proximity voice chat for servers, with a built-in voice activation menu.',
    downloads: 41_000_000,
    categories: ['social'],
    projectType: 'mod',
    versions: ['26.3']
  },
  {
    projectId: '1IjD5062',
    slug: 'continuity',
    title: 'Continuity',
    description: 'Connected textures and emissive block support for Fabric.',
    downloads: 12_000_000,
    categories: ['decoration'],
    projectType: 'mod',
    versions: ['26.3', '26.2']
  }
]

function detailFor(id: string): InstanceDetail {
  const instance = instances.find((item) => item.id === id)
  if (!instance) throw new Error('Instance not found')
  return {
    instance,
    mods: sampleMods.slice(0, instance.modCount),
    installed: instance.installed
  }
}

/* ── Discover fixtures ─────────────────────────────────────────────── */

const discoverPacks: ModrinthSearchHit[] = [
  {
    projectId: '1KVo5zza',
    slug: 'fabulously-optimized',
    title: 'Fabulously Optimized',
    description: 'A lightweight, Sodium-based pack that keeps vanilla gameplay and adds the whole performance stack.',
    downloads: 48_200_000,
    follows: 9_800,
    author: 'robotkoer',
    categories: ['lightweight', 'optimization'],
    projectType: 'modpack',
    versions: ['26.3', '1.21.10'],
    license: 'CC-BY-4.0',
    dateModified: '2026-10-02T09:00:00Z'
  },
  {
    projectId: '4HVtG6r5',
    slug: 'adrenaline',
    title: 'Adrenaline',
    description: 'A focused optimization pack for low-end and mid-range machines. No content additions.',
    downloads: 6_400_000,
    follows: 1_240,
    author: 'Someone',
    categories: ['optimization', 'lightweight'],
    projectType: 'modpack',
    versions: ['26.3'],
    license: 'MIT',
    dateModified: '2026-09-21T18:30:00Z'
  },
  {
    projectId: '8b3K2nQp',
    slug: 'simply-optimized',
    title: 'Simply Optimized',
    description: 'Vanilla plus the proven Fabric performance mods, tuned for stable frame times.',
    downloads: 12_900_000,
    follows: 3_100,
    author: 'Blue',
    categories: ['optimization'],
    projectType: 'modpack',
    versions: ['26.3', '26.2', '1.21.10'],
    license: 'LGPL-3.0',
    dateModified: '2026-09-30T12:15:00Z'
  },
  {
    projectId: 'Xa3vQ9Lm',
    slug: 'cobblemon',
    title: 'Cobblemon',
    description: 'A creature-collection modpack built around Cobblemon, quests and a hand-tuned world.',
    downloads: 21_500_000,
    follows: 4_700,
    author: 'Cobblemon Team',
    categories: ['adventure', 'mobs'],
    projectType: 'modpack',
    versions: ['1.21.10', '1.20.1'],
    license: 'MPL-2.0',
    dateModified: '2026-08-14T16:40:00Z'
  }
]

const modCategories: ModCategory[] = [
  { name: 'optimization' },
  { name: 'adventure' },
  { name: 'decoration' },
  { name: 'utility' },
  { name: 'library' },
  { name: 'management' },
  { name: 'social' },
  { name: 'worldgen' },
  { name: 'technology' },
  { name: 'equipment' },
  { name: 'magic' },
  { name: 'storage' },
  { name: 'food' },
  { name: 'mobs' },
  { name: 'transportation' },
  { name: 'cursed' }
]

const packCategories: ModCategory[] = [
  { name: 'adventure' },
  { name: 'combat' },
  { name: 'optimization' },
  { name: 'technology' },
  { name: 'magic' },
  { name: 'quests' },
  { name: 'kitchen-sink' },
  { name: 'lightweight' },
  { name: 'multiplayer' },
  { name: 'challenging' }
]

function gradientImage(from: string, to: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><circle cx="780" cy="130" r="210" fill="rgba(255,255,255,0.09)"/><circle cx="160" cy="430" r="150" fill="rgba(0,0,0,0.14)"/><text x="48" y="486" font-family="Segoe UI, sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,0.94)">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function findHit(ref: string): ModrinthSearchHit {
  return (
    [...discoverMods, ...discoverPacks].find(
      (item) => item.projectId === ref || item.slug === ref || item.title.toLowerCase() === ref.toLowerCase()
    ) ?? discoverMods[0]
  )
}

function detailForProject(ref: string): ModDetail {
  const hit = findHit(ref)
  const isPack = hit.projectType === 'modpack'
  return {
    projectId: hit.projectId,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    body: [
      `# ${hit.title}`,
      '',
      hit.description,
      '',
      '## Why people install it',
      '',
      '- Keeps vanilla behaviour while removing wasted work',
      '- Drop-in compatible with the rest of the stack',
      '- Actively maintained against the latest Minecraft releases',
      '',
      '## Configuration',
      '',
      'The default preset is tuned for a wide range of hardware. Power users can open the config screen:',
      '',
      '```json',
      '{"quality": "high", "maxFps": 144, "reducedMotion": false}',
      '```',
      '',
      '> Back up your world before changing render settings on an existing save.',
      '',
      '## Links',
      '',
      `- [Source code](${isPack ? 'https://github.com/example/pack' : 'https://github.com/example/mod'})`,
      '- [Issue tracker](https://github.com/example/issues)',
      '',
      '---',
      '',
      '_Tested with Fabric on Minecraft 1.21 and newer._'
    ].join('\n'),
    iconUrl: hit.iconUrl,
    color: hit.color ?? 0x7c5cff,
    gallery: [
      { url: gradientImage('#312e81', '#7c3aed', `${hit.title} — overview`), featured: true, title: 'Overview' },
      { url: gradientImage('#0f766e', '#22d3ee', 'In-game settings'), featured: false, title: 'Settings screen' },
      { url: gradientImage('#7c2d12', '#f59e0b', 'Performance comparison'), featured: false, title: 'Frame times' }
    ],
    downloads: hit.downloads,
    follows: hit.follows ?? 0,
    categories: hit.categories,
    additionalCategories: isPack ? ['fabric'] : [],
    license: hit.license ?? 'MIT',
    projectType: hit.projectType,
    clientSide: hit.clientSide ?? 'required',
    serverSide: hit.serverSide ?? 'optional',
    published: '2024-05-02T12:00:00Z',
    updated: hit.dateModified ?? '2026-10-01T12:00:00Z',
    gameVersions: hit.versions,
    links: {
      source: 'https://github.com/example/project',
      issues: 'https://github.com/example/project/issues',
      wiki: 'https://example.com/wiki',
      discord: 'https://discord.gg/example'
    }
  }
}

function versionsForProject(ref: string): ModVersionEntry[] {
  const hit = findHit(ref)
  const types: ModVersionEntry['versionType'][] = ['release', 'release', 'beta', 'release', 'alpha', 'release', 'release', 'beta']
  return types.map((type, index) => ({
    id: `${hit.projectId}-v${8 - index}`,
    name: index === 0 ? 'Latest build' : `Build ${8 - index}`,
    versionNumber: hit.slug === 'sodium' ? `mc26.3-0.9.${3 + index}` : `1.${4 - Math.floor(index / 3)}.${8 - index}`,
    versionType: type,
    gameVersions: hit.versions,
    loaders: ['fabric'],
    datePublished: new Date(now - index * 86400000 * 9).toISOString(),
    downloads: Math.round(hit.downloads / (8 + index * 3)),
    changelog: [
      `### Changes in ${hit.slug}`,
      '',
      '- Fixed a crash when reloading resources with shaders enabled',
      '- Reduced per-frame allocations in the chunk renderer',
      index % 2 === 0 ? '- Added a config option for HUD frame pacing' : '- Updated translations',
      '',
      '### Fixes',
      '',
      '- Compatible with the latest Fabric loader',
      '- Restored behaviour on integrated GPUs'
    ].join('\n'),
    filename: `${hit.slug}-${8 - index}.jar`,
    size: 420_000 + index * 1_500,
    dependencies: [
      { projectId: 'P7dR8mSH', type: 'required' },
      { projectId: 'AANobbMI', type: 'optional' }
    ]
  }))
}

const mockUpdateVersions: Record<string, string> = {
  'fabric-api': '0.165.0+26.3',
  sodium: 'mc26.3-0.9.4',
  lithium: 'mc26.3-0.27.0',
  'ferrite-core': '9.1.0',
  entityculling: '1.11.4',
  immediatelyfast: '1.17.2+26.3'
}

function updatesForInstance(instanceId: string): ModUpdateInfo[] {
  const instance = instances.find((item) => item.id === instanceId)
  if (!instance) return []
  const tracked = sampleMods
    .slice(0, instance.modCount)
    .filter((item) => item.projectId && item.versionId && mockUpdateVersions[item.slug])
  return tracked.slice(0, 2).map((item) => ({
    projectId: item.projectId!,
    slug: item.slug,
    name: item.name,
    iconUrl: item.iconUrl,
    currentVersionNumber: item.versionNumber,
    newVersionNumber: mockUpdateVersions[item.slug],
    newVersionId: `${item.projectId}-update-${mockUpdateVersions[item.slug]}`
  }))
}

const emptyInstallResult = (): ModInstallResult => ({
  installed: [],
  skipped: [],
  unsupported: [],
  failed: [],
  dependencies: []
})

const planFor = (profile: PerfProfileId, memoryMb: number, preset?: JvmPresetId): PerfPlan => {
  const jvmPreset: JvmPresetId = preset ?? (profile === 'competitive' ? 'low-latency' : 'aikar')
  const g1Args = [
    `-Xms${memoryMb}M`,
    `-Xmx${memoryMb}M`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1'
  ]
  const jvmArgs =
    jvmPreset === 'zgc'
      ? [`-Xms${memoryMb}M`, `-Xmx${memoryMb}M`, '-XX:+UseZGC', '-XX:+ZGenerational', '-XX:+AlwaysPreTouch', '-XX:+DisableExplicitGC']
      : jvmPreset === 'low-latency'
        ? g1Args.map((arg) => (arg.startsWith('-XX:MaxGCPauseMillis') ? '-XX:MaxGCPauseMillis=50' : arg))
        : jvmPreset === 'custom'
          ? [`-Xms${memoryMb}M`, `-Xmx${memoryMb}M`, '-XX:+UseG1GC']
          : g1Args
  const options: Record<string, Record<string, string>> = {
    competitive: {
      renderDistance: '10',
      simulationDistance: '6',
      maxFps: '260',
      enableVsync: 'false',
      graphicsMode: '0',
      particles: '2',
      entityShadows: 'false',
      biomeBlendRadius: '0',
      mipmapLevels: '2',
      ao: 'true'
    },
    balanced: {
      renderDistance: '14',
      simulationDistance: '8',
      maxFps: '144',
      enableVsync: 'false',
      graphicsMode: '1',
      particles: '1',
      entityShadows: 'true',
      biomeBlendRadius: '2',
      mipmapLevels: '4',
      ao: 'true'
    },
    quality: {
      renderDistance: '18',
      simulationDistance: '10',
      maxFps: '120',
      enableVsync: 'false',
      graphicsMode: '1',
      particles: '0',
      entityShadows: 'true',
      biomeBlendRadius: '3',
      mipmapLevels: '4',
      ao: 'true'
    }
  }
  return {
    profile,
    memoryMb,
    jvmPreset,
    jvmArgs,
    options: options[profile],
    notes: [
      'High-tier GPU detected — render distance is raised for quality.',
      jvmPreset === 'zgc' ? 'Generational ZGC selected — needs Java 21 or newer.' : 'G1 preset tuned for stable frame times.',
      'Game must be closed when applying video settings.'
    ],
    score: 84
  }
}

function packState(instance: InstanceSummary, packId: string): PackModStatus[] {
  const pack = PACKS.find((item) => item.id === packId)
  if (!pack) return []
  const mods = detailFor(instance.id).mods
  return pack.mods.map((packMod, index) => {
    const installed = mods.find((item) => item.slug === packMod.slug)
    if (installed) {
      return {
        ...packMod,
        state: 'installed',
        versionNumber: installed.versionNumber,
        projectId: installed.projectId
      }
    }
    if (index > 6) return { ...packMod, state: 'unsupported' }
    return { ...packMod, state: 'available', versionNumber: '1.0.0' }
  })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function createMockApi(): Window['polaris'] {
  let launchState: LaunchState = { instanceId: null, status: 'idle' }
  let lastCode: DeviceCodeInfo | null = null

  const snapshot = (): Bootstrap => ({
    appVersion: '0.3.0',
    settings,
    instances: instances.map((instance) => ({ ...instance, running: launchState.instanceId === instance.id && launchState.status === 'running' })),
    accounts: accounts.accounts,
    activeAccountId: accounts.activeAccountId,
    hardware,
    launch: launchState,
    java,
    dataDir: settings.dataDir,
    packs: PACKS,
    latestVersion: '26.3'
  })

  return {
    platform: 'win32',
    bootstrap: async () => {
      await sleep(120)
      return snapshot()
    },
    windowAction: async () => undefined,
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener')
    },
    openRootFolder: async () => undefined,
    openInstanceFolder: async () => undefined,
    openLogsFolder: async (_id) => undefined,
    versions: async (includeSnapshots) => (includeSnapshots ? versions : versions.filter((v) => v.type === 'release')),
    getInstance: async (id) => {
      await sleep(80)
      return detailFor(id)
    },
    createInstance: async (input: CreateInstanceInput) => {
      const kind = input.kind ?? 'game'
      const created: InstanceSummary = {
        ...baseInstance(
          `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(16).slice(2, 8)}`,
          input.name,
          input.mcVersion,
          input.loader,
          '#34d399',
          input.memoryMb ?? 4096,
          input.packs ?? (kind === 'server' ? ['server'] : ['performance', 'qol']),
          0,
          0
        ),
        kind,
        port: kind === 'server' ? (input.port ?? 25565) : undefined,
        eulaAccepted: kind === 'server' ? Boolean(input.eulaAccepted) : undefined,
        icon: input.icon
      }
      instances = [created, ...instances]
      await sleep(300)
      return created
    },
    updateInstance: async (id, patch) => {
      await sleep(80)
      const index = instances.findIndex((item) => item.id === id)
      if (index < 0) throw new Error('Instance not found')
      instances[index] = { ...instances[index], ...patch }
      return instances[index]
    },
    deleteInstance: async (id) => {
      instances = instances.filter((item) => item.id !== id)
      await sleep(150)
    },
    launch: async (id) => {
      await sleep(900)
      const instance = instances.find((item) => item.id === id)
      const isServer = instance?.kind === 'server'
      launchState = {
        instanceId: id,
        status: 'running',
        pid: 4212,
        startedAt: Date.now(),
        message: isServer ? `Server running on port ${instance?.port ?? 25565}` : 'Minecraft is running'
      }
      return launchState
    },
    stop: async () => {
      launchState = { instanceId: null, status: 'exited', exitCode: 0, message: 'Game closed' }
    },
    tailLogs: async (instanceId) => {
      const instance = instances.find((item) => item.id === instanceId)
      if (instance?.kind === 'server') {
        return [
          '[12:44:02] [main/INFO]: Loading Minecraft 1.21.10 with Fabric Loader 0.19.5',
          '[12:44:02] [main/INFO]: Loading 6 mods:',
          '[12:44:02] [main/INFO]:   - fabric-api 0.92.6+1.21.10',
          '[12:44:02] [main/INFO]:   - lithium mc1.21.10-0.15.3',
          '[12:44:02] [main/INFO]:   - krypton 0.2.9',
          '[12:44:02] [main/INFO]:   - c2me 0.3.0+1.21.10',
          '[12:44:02] [main/INFO]:   - ferrite-core 8.0.0',
          '[12:44:02] [main/INFO]:   - modernfix 5.24.3+mc1.21.10',
          '[12:44:03] [Server thread/INFO]: Preparing level "world"',
          '[12:44:04] [Server thread/INFO]: Starting minecraft server version 1.21.10',
          '[12:44:05] [Server thread/INFO]: Done (2.314s)! For help, type "help"'
        ]
      }
      return [
        '[12:44:02] [main/INFO]: Loading Minecraft 26.3 with Fabric Loader 0.19.5',
        '[12:44:03] [main/INFO]: Loading 9 mods:',
        '[12:44:03] [main/INFO]:   - fabric-api 0.164.0+26.3',
        '[12:44:03] [main/INFO]:   - sodium mc26.3-0.9.3-beta.1',
        '[12:44:03] [main/INFO]:   - lithium mc26.3-0.26.2',
        '[12:44:04] [Render thread/INFO]: OpenGL debug message: Using hardware acceleration',
        '[12:44:05] [Render thread/INFO]: Backend library: LWJGL version 3.4.3',
        '[12:44:07] [Render thread/INFO]: Loaded 1,482 recipes and 1,203 tags in 218 ms',
        '[12:44:08] [Render thread/INFO]: Sound engine started',
        '[12:44:09] [Render thread/INFO]: Created: 1024x512x4 minecraft:textures/atlas/blocks.png-atlas'
      ]
    },
    listMods: async (id) => detailFor(id).mods,
    searchMods: async (query, type, _instanceId, _offset, filters) => {
      await sleep(300)
      const term = query.trim().toLowerCase()
      const source = type === 'modpack' ? discoverPacks : discoverMods
      const categories = filters?.categories ?? []
      let filtered = source.filter(
        (item) =>
          (!term ||
            item.title.toLowerCase().includes(term) ||
            item.description.toLowerCase().includes(term)) &&
          (categories.length === 0 || categories.some((category) => item.categories.includes(category)))
      )
      if (filters?.sort === 'downloads') filtered = [...filtered].sort((a, b) => b.downloads - a.downloads)
      if (filters?.sort === 'follows') filtered = [...filtered].sort((a, b) => (b.follows ?? 0) - (a.follows ?? 0))
      if (filters?.sort === 'newest' || filters?.sort === 'updated') {
        filtered = [...filtered].sort(
          (a, b) => Date.parse(b.dateModified ?? '1970-01-01') - Date.parse(a.dateModified ?? '1970-01-01')
        )
      }
      return { hits: filtered, total: filtered.length }
    },
    installMod: async (instanceId, ref) => {
      await sleep(700)
      const hit = discoverMods.find((item) => item.projectId === ref || item.slug === ref)
      const instance = instances.find((item) => item.id === instanceId)
      if (hit && instance) instance.modCount += 1
      return {
        installed: hit ? [hit.title] : [ref],
        skipped: [],
        unsupported: [],
        failed: [],
        dependencies: ['Fabric API']
      }
    },
    removeMod: async () => {
      await sleep(150)
    },
    toggleMod: async () => {
      await sleep(100)
    },
    modUpdates: async (instanceId) => updatesForInstance(instanceId),
    updateMods: async (instanceId, projectIds) => {
      await sleep(900)
      const detected = updatesForInstance(instanceId)
      const updates = projectIds?.length
        ? detected.filter((update) => projectIds.includes(update.projectId))
        : detected
      return {
        updates,
        result: { ...emptyInstallResult(), installed: updates.map((update) => update.name) }
      }
    },
    modDetail: async (ref) => {
      await sleep(220)
      return detailForProject(ref)
    },
    modVersions: async (ref) => {
      await sleep(180)
      return versionsForProject(ref)
    },
    installModVersion: async (_instanceId, versionId) => {
      await sleep(600)
      const projectId = versionId.split('-v')[0]
      const hit = [...discoverMods, ...discoverPacks].find((item) => item.projectId === projectId)
      return { ...emptyInstallResult(), installed: [hit?.title ?? versionId] }
    },
    modCategories: async (type) => (type === 'modpack' ? packCategories : modCategories),
    packStatus: async (instanceId, packId) => {
      await sleep(200)
      const instance = instances.find((item) => item.id === instanceId)
      return instance ? packState(instance, packId) : []
    },
    applyPack: async (instanceId, packId): Promise<PackApplyResult> => {
      await sleep(1100)
      const statuses = packStatusSync(instanceId, packId)
      const instance = instances.find((item) => item.id === instanceId)
      if (instance && !instance.packs.includes(packId)) instance.packs = [...instance.packs, packId]
      return {
        statuses: statuses.map((status) =>
          status.state === 'unsupported' ? status : { ...status, state: status.state === 'available' ? 'installed' : status.state }
        ),
        result: {
          installed: statuses.filter((status) => status.state === 'available').map((status) => status.name),
          skipped: statuses.filter((status) => status.state === 'installed').map((status) => status.name),
          unsupported: statuses.filter((status) => status.state === 'unsupported').map((status) => status.name),
          failed: [],
          dependencies: ['Fabric API']
        }
      }
    },
    scanPerformance: async (): Promise<PerfScanResult> => ({ hardware, java }),
    planPerformance: async (_instanceId, profile, memoryMb, preset) =>
      planFor(profile, memoryMb ?? 8192, preset),
    applyPerformance: async (_instanceId, profile, memoryMb, preset): Promise<PerfApplyResult> => ({
      plan: planFor(profile, memoryMb ?? 8192, preset),
      changed: 10,
      backup: 'options.txt.polaris.bak'
    }),
    createInstanceFromPack: async (input: CreateFromPackInput) => {
      await sleep(1700)
      const hit = findHit(input.packRef)
      const created: InstanceSummary = {
        ...baseInstance(
          `${hit.slug}-${Math.random().toString(16).slice(2, 8)}`,
          input.name?.trim() || hit.title,
          hit.versions[0],
          'fabric',
          '#22d3ee',
          input.memoryMb ?? 4096,
          [],
          0,
          0
        ),
        modpack: {
          projectId: hit.projectId,
          slug: hit.slug,
          name: hit.title,
          versionId: `${hit.projectId}-pack`,
          versionNumber: '1.0.0',
          filesTotal: 42,
          filesInstalled: 42
        }
      }
      instances = [created, ...instances]
      return created
    },
    serverCommand: async () => {
      await sleep(120)
    },
    gameUi: async (): Promise<GameUiSnapshot> => ({ values: { ...mockGameUi }, source: 'options.txt' }),
    applyGameUi: async (_instanceId, values) => {
      await sleep(220)
      mockGameUi = {
        ...mockGameUi,
        ...values,
        guiScale: Math.round(Math.min(4, Math.max(0, values.guiScale ?? mockGameUi.guiScale))),
        fov: Math.round(Math.min(110, Math.max(30, values.fov ?? mockGameUi.fov))),
        gamma: Math.min(1, Math.max(0, values.gamma ?? mockGameUi.gamma)),
        chatOpacity: Math.min(1, Math.max(0, values.chatOpacity ?? mockGameUi.chatOpacity)),
        chatScale: Math.min(1, Math.max(0, values.chatScale ?? mockGameUi.chatScale)),
        screenEffectScale: Math.min(1, Math.max(0, values.screenEffectScale ?? mockGameUi.screenEffectScale)),
        attackIndicator: Math.round(Math.min(2, Math.max(0, values.attackIndicator ?? mockGameUi.attackIndicator)))
      }
      return { values: { ...mockGameUi }, changed: 3 }
    },
    cosmetics: async () => cosmeticSnapshot(),
    buyCosmetic: async (id) => {
      await sleep(250)
      const item = cosmeticById(id)
      if (!item) throw new Error('Unknown cosmetic.')
      if (settings.ownedCosmetics.includes(id)) throw new Error('You already own that cosmetic.')
      if (settings.shards < item.price) throw new Error('Not enough shards for that cosmetic.')
      settings = {
        ...settings,
        shards: settings.shards - item.price,
        ownedCosmetics: [...settings.ownedCosmetics, id]
      }
      return cosmeticSnapshot()
    },
    equipCosmetic: async (id) => {
      await sleep(160)
      const item = cosmeticById(id)
      if (!item) throw new Error('Unknown cosmetic.')
      if (!settings.ownedCosmetics.includes(id)) throw new Error('Unlock that cosmetic first.')
      settings = item.kind === 'badge' ? { ...settings, equippedBadge: id } : { ...settings, equippedCape: id }
      return cosmeticSnapshot()
    },
    claimShards: async (): Promise<ShardClaimResult> => {
      await sleep(300)
      const total = playtimeTotal()
      const granted = Math.max(0, shardsForPlaytime(total) - shardsForPlaytime(settings.shardsClaimedMs))
      if (granted > 0) {
        settings = { ...settings, shards: settings.shards + granted, shardsClaimedMs: total }
      }
      return { granted, snapshot: cosmeticSnapshot() }
    },
    addOfflineAccount: async (name) => {
      const account = {
        id: `offline:${name.toLowerCase()}`,
        type: 'offline' as const,
        name,
        uuid: '8667ba71-b85a-4004-af54-457a9734eed7',
        active: true
      }
      accounts = { accounts: [...accounts.accounts, account], activeAccountId: account.id }
      return accounts
    },
    removeAccount: async (id) => {
      accounts = {
        accounts: accounts.accounts.filter((item) => item.id !== id),
        activeAccountId: accounts.activeAccountId === id ? null : accounts.activeAccountId
      }
      return accounts
    },
    setActiveAccount: async (id) => {
      accounts = { accounts: accounts.accounts, activeAccountId: id }
      return accounts
    },
    microsoftLogin: async () => {
      lastCode = {
        userCode: 'K7Q-2HP',
        verificationUri: 'https://microsoft.com/link',
        expiresIn: 900,
        message: 'Enter the code at microsoft.com/link'
      }
      return lastCode
    },
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch }
      return settings
    },
    chooseJava: async () => ({ path: java[0].path, java }),
    rescanJava: async () => java,
    settingsSnapshot: async () => settings,
    checkForUpdates: async () => ({ hasUpdate: false, currentVersion: '0.3.0', latestVersion: '0.3.0', downloadUrl: '', publishedAt: new Date().toISOString() }),
    installUpdate: async () => {},
    importMrpack: async () => {
      const created: InstanceSummary = {
        ...baseInstance(
          `imported-modpack-${Math.random().toString(16).slice(2, 8)}`,
          'Imported Modpack',
          '1.21.1',
          'fabric',
          '#34d399',
          4096,
          [],
          0,
          0
        ),
        kind: 'game'
      }
      instances = [created, ...instances]
      await sleep(300)
      return created
    },
    onProgress: () => () => undefined,
    onLaunchState: () => () => undefined,
    onGameLog: () => () => undefined,
    onGameState: () => () => undefined,
    onAccountChanged: () => () => undefined,
    onAccountError: () => () => undefined,
    onDeviceCode: () => () => undefined
  }
}

function packStatusSync(instanceId: string, packId: string): PackModStatus[] {
  const instance = instances.find((item) => item.id === instanceId)
  return instance ? packState(instance, packId) : []
}
