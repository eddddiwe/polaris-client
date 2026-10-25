import type { CosmeticItem } from './types'

/**
 * Cosmetic catalog. Prices are in Polaris shards, a local progression currency
 * earned from playtime — there is no payment flow in this build.
 */
export const COSMETICS: CosmeticItem[] = [
  {
    id: 'badge-north',
    name: 'North Star',
    kind: 'badge',
    tagline: 'The mark of every Polaris pilot.',
    rarity: 'common',
    price: 0,
    glyph: 'star',
    colors: ['#c4b5fd', '#7c3aed']
  },
  {
    id: 'badge-comet',
    name: 'Comet',
    kind: 'badge',
    tagline: 'Built for quick sessions and quick reflexes.',
    rarity: 'rare',
    price: 450,
    glyph: 'comet',
    colors: ['#67e8f9', '#2563eb']
  },
  {
    id: 'badge-ember',
    name: 'Ember',
    kind: 'badge',
    tagline: 'A warm spark for long nights underground.',
    rarity: 'rare',
    price: 450,
    glyph: 'flame',
    colors: ['#fbbf24', '#f43f5e']
  },
  {
    id: 'badge-frost',
    name: 'Frostline',
    kind: 'badge',
    tagline: 'Cool frame times, colder spawn chunks.',
    rarity: 'rare',
    price: 500,
    glyph: 'snow',
    colors: ['#e0f2fe', '#38bdf8']
  },
  {
    id: 'badge-nova',
    name: 'Nova',
    kind: 'badge',
    tagline: 'For the builds that light up the whole server.',
    rarity: 'epic',
    price: 850,
    glyph: 'nova',
    colors: ['#f0abfc', '#7c3aed']
  },
  {
    id: 'badge-void',
    name: 'Void Eye',
    kind: 'badge',
    tagline: 'Watches the horizon so you do not have to.',
    rarity: 'epic',
    price: 900,
    glyph: 'eye',
    colors: ['#a78bfa', '#111827']
  },
  {
    id: 'badge-aurora',
    name: 'Aurora Crown',
    kind: 'badge',
    tagline: 'A rare glow for the patient and the persistent.',
    rarity: 'legendary',
    price: 1400,
    glyph: 'crown',
    colors: ['#5eead4', '#6366f1']
  },
  {
    id: 'badge-warden',
    name: 'Warden Sigil',
    kind: 'badge',
    tagline: 'Earned in the deep dark. Worn everywhere else.',
    rarity: 'legendary',
    price: 1500,
    glyph: 'sigil',
    colors: ['#6ee7b7', '#064e3b']
  },
  {
    id: 'cape-classic',
    name: 'Midnight',
    kind: 'cape',
    tagline: 'The default Polaris silhouette.',
    rarity: 'common',
    price: 0,
    colors: ['#1e1b4b', '#8b5cf6'],
    pattern: 'classic'
  },
  {
    id: 'cape-grid',
    name: 'Night Grid',
    kind: 'cape',
    tagline: 'A neon horizon that follows your back.',
    rarity: 'rare',
    price: 600,
    colors: ['#0f172a', '#22d3ee'],
    pattern: 'grid'
  },
  {
    id: 'cape-aurora',
    name: 'Aurora Drift',
    kind: 'cape',
    tagline: 'Curtains of light with every step.',
    rarity: 'epic',
    price: 900,
    colors: ['#2dd4bf', '#7c3aed'],
    pattern: 'aurora'
  },
  {
    id: 'cape-supernova',
    name: 'Supernova',
    kind: 'cape',
    tagline: 'Leave a little light behind you.',
    rarity: 'legendary',
    price: 1600,
    colors: ['#fb7185', '#fbbf24'],
    pattern: 'burst'
  }
]

export const FREE_COSMETICS = COSMETICS.filter((item) => item.price === 0).map((item) => item.id)
export const DEFAULT_BADGE = 'badge-north'
export const DEFAULT_CAPE = 'cape-classic'
export const STARTER_SHARDS = 900
/** Shards earned per full hour of tracked playtime. */
export const SHARDS_PER_HOUR = 40

export function cosmeticById(id: string): CosmeticItem | undefined {
  return COSMETICS.find((item) => item.id === id)
}

export function ownedCosmetics(value: string[] | undefined): string[] {
  const known = new Set(COSMETICS.map((item) => item.id))
  const owned = new Set((Array.isArray(value) ? value : []).filter((id) => known.has(id)))
  for (const id of FREE_COSMETICS) owned.add(id)
  return [...owned]
}

export function cosmeticsByKind(kind: 'badge' | 'cape'): CosmeticItem[] {
  return COSMETICS.filter((item) => item.kind === kind)
}

export function shardsForPlaytime(playtimeMs: number): number {
  if (!Number.isFinite(playtimeMs) || playtimeMs <= 0) return 0
  return Math.floor(playtimeMs / 3_600_000) * SHARDS_PER_HOUR
}
