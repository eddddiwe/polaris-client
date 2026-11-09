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
    msClientId: '09aa1d05-9369-4725-bdb8-a46e54149e71',
    closeLauncherOnPlay: true,
    lowerLauncherPriority: true,
    pauseUiDuringGame: true,
    autoUpdateMods: false,
    showSnapshots: false,
    inGameChat: true,
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
    shardsClaimedMs: 0,
    appliedShardGrants: []
  }
}

export class SettingsStore {
  private value: Settings
  /** One queue for every write so a save can never overwrite a newer update. */
  private writes: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly root: string
  ) {
    this.value = defaultSettings(root)
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writes.then(task)
    this.writes = run.catch(() => undefined)
    return run
  }

  async load(): Promise<Settings> {
    const loaded = await readJson<Partial<Settings> | null>(this.path, null)
    if (loaded) this.value = normalizeSettings({ ...defaultSettings(this.root), ...loaded }, this.root)
    return this.value
  }

  get(): Settings {
    return this.value
  }

  async update(patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)): Promise<Settings> {
    return await this.queue(async () => {
      const current = this.value
      const resolved = typeof patch === 'function' ? patch(current) : patch
      const next = normalizeSettings({ ...current, ...resolved, dataDir: this.root }, this.root)
      // Publish only after the write succeeds. A read-only root, locked file or
      // full disk must not leave the change visible in memory for a later save
      // to persist even though the caller was told it failed.
      await writeJson(this.path, next)
      this.value = next
      return next
    })
  }

  async save(): Promise<void> {
    await this.queue(() => writeJson(this.path, this.value))
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
    inGameChat: input.inGameChat !== false,
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
    shardsClaimedMs: clamp(input.shardsClaimedMs, 0, Number.MAX_SAFE_INTEGER),
    appliedShardGrants: Array.isArray(input.appliedShardGrants)
      ? [...new Set(input.appliedShardGrants.filter((id) => typeof id === 'string'))]
      : []
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
