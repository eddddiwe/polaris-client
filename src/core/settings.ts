import { pathExists, readJson, writeJson } from './fsutil'
import type { Settings, WallpaperPreset } from '../shared/types'
import { WALLPAPERS } from '../shared/appearance'
import {
  DEFAULT_BADGE,
  DEFAULT_CAPE,
  FREE_COSMETICS,
  STARTER_SHARDS,
  cosmeticById,
  ownedCosmetics
} from '../shared/cosmetics'

export function defaultSettings(root: string): Settings {
  return {
    dataDir: root,
    javaPath: '',
    memoryMb: 4096,
    msClientId: '',
    closeLauncherOnPlay: true,
    lowerLauncherPriority: true,
    pauseUiDuringGame: true,
    autoUpdateMods: false,
    showSnapshots: false,
    accent: '#7c5cff',
    reduceMotion: false,
    mirrorVanillaCache: true,
    wallpaper: 'aurora',
    wallpaperUrl: '',
    wallpaperDim: 50,
    wallpaperBlur: 0,
    wallpaperMotion: true,
    ownedCosmetics: [...FREE_COSMETICS],
    equippedBadge: DEFAULT_BADGE,
    equippedCape: DEFAULT_CAPE,
    shards: STARTER_SHARDS,
    shardsClaimedMs: 0
  }
}

export class SettingsStore {
  private value: Settings

  constructor(
    private readonly path: string,
    private readonly root: string
  ) {
    this.value = defaultSettings(root)
  }

  async load(): Promise<Settings> {
    const loaded = await readJson<Partial<Settings> | null>(this.path, null)
    if (loaded) this.value = normalizeSettings({ ...defaultSettings(this.root), ...loaded }, this.root)
    return this.value
  }

  get(): Settings {
    return this.value
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    this.value = normalizeSettings({ ...this.value, ...patch, dataDir: this.root }, this.root)
    await this.save()
    return this.value
  }

  async save(): Promise<void> {
    await writeJson(this.path, this.value)
  }

  async ensure(): Promise<void> {
    if (!(await pathExists(this.path))) await this.save()
  }
}

export function normalizeSettings(input: Settings, root: string): Settings {
  const wallpapers = new Set<WallpaperPreset>(WALLPAPERS.map((item) => item.id))
  const owned = ownedCosmetics(input.ownedCosmetics)
  const badge = cosmeticById(input.equippedBadge)
  const cape = cosmeticById(input.equippedCape)
  return {
    ...input,
    dataDir: root,
    memoryMb: clamp(input.memoryMb, 1024, 32768),
    accent: typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent : '#7c5cff',
    wallpaper: wallpapers.has(input.wallpaper) ? input.wallpaper : 'aurora',
    wallpaperUrl: typeof input.wallpaperUrl === 'string' ? input.wallpaperUrl.trim().slice(0, 2048) : '',
    wallpaperDim: clamp(input.wallpaperDim, 0, 90),
    wallpaperBlur: clamp(input.wallpaperBlur, 0, 30),
    wallpaperMotion: Boolean(input.wallpaperMotion),
    ownedCosmetics: owned,
    equippedBadge: badge?.kind === 'badge' && owned.includes(badge.id) ? badge.id : DEFAULT_BADGE,
    equippedCape: cape?.kind === 'cape' && owned.includes(cape.id) ? cape.id : DEFAULT_CAPE,
    shards: clamp(input.shards, 0, 1_000_000_000),
    shardsClaimedMs: clamp(input.shardsClaimedMs, 0, Number.MAX_SAFE_INTEGER)
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
