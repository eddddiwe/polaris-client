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
    id: 'badge-diamond',
    name: 'Diamond Cut',
    kind: 'badge',
    tagline: 'Flawless under pressure.',
    rarity: 'rare',
    price: 550,
    glyph: 'diamond',
    colors: ['#67e8f9', '#0ea5e9']
  },
  {
    id: 'badge-heart',
    name: 'Heartbeat',
    kind: 'badge',
    tagline: 'Every beat counts.',
    rarity: 'common',
    price: 200,
    glyph: 'heart',
    colors: ['#fca5a5', '#ef4444']
  },
  {
    id: 'badge-moon',
    name: 'Moonlight',
    kind: 'badge',
    tagline: 'For the night owls.',
    rarity: 'rare',
    price: 480,
    glyph: 'moon',
    colors: ['#e2e8f0', '#64748b']
  },
  {
    id: 'badge-sun',
    name: 'Solar Flare',
    kind: 'badge',
    tagline: 'Burn bright.',
    rarity: 'epic',
    price: 800,
    glyph: 'sun',
    colors: ['#fbbf24', '#f59e0b']
  },
  {
    id: 'badge-sword',
    name: 'Iron Blade',
    kind: 'badge',
    tagline: 'Ready for battle.',
    rarity: 'rare',
    price: 520,
    glyph: 'sword',
    colors: ['#94a3b8', '#475569']
  },
  {
    id: 'badge-shield',
    name: 'Aegis',
    kind: 'badge',
    tagline: 'Unbreakable defense.',
    rarity: 'epic',
    price: 880,
    glyph: 'shield',
    colors: ['#60a5fa', '#1d4ed8']
  },
  {
    id: 'badge-lightning',
    name: 'Thunderstrike',
    kind: 'badge',
    tagline: 'Fast as lightning.',
    rarity: 'epic',
    price: 920,
    glyph: 'lightning',
    colors: ['#fde047', '#eab308']
  },
  {
    id: 'badge-skull',
    name: 'Skull & Bones',
    kind: 'badge',
    tagline: 'Danger ahead.',
    rarity: 'rare',
    price: 500,
    glyph: 'skull',
    colors: ['#d1d5db', '#374151']
  },
  {
    id: 'badge-dragon',
    name: 'Dragon Heart',
    kind: 'badge',
    tagline: 'Fire and fury.',
    rarity: 'legendary',
    price: 1600,
    glyph: 'dragon',
    colors: ['#f87171', '#991b1b']
  },
  {
    id: 'badge-ghost',
    name: 'Phantom',
    kind: 'badge',
    tagline: 'Here one moment, gone the next.',
    rarity: 'rare',
    price: 550,
    glyph: 'ghost',
    colors: ['#e5e7eb', '#6b7280']
  },
  {
    id: 'badge-music',
    name: 'Melody',
    kind: 'badge',
    tagline: 'Music to your ears.',
    rarity: 'common',
    price: 250,
    glyph: 'music',
    colors: ['#f9a8d4', '#ec4899']
  },
  {
    id: 'badge-rocket',
    name: 'Rocket',
    kind: 'badge',
    tagline: 'To the moon and beyond.',
    rarity: 'epic',
    price: 950,
    glyph: 'rocket',
    colors: ['#fb923c', '#ea580c']
  },
  {
    id: 'badge-trophy',
    name: 'Champion',
    kind: 'badge',
    tagline: 'Victory is yours.',
    rarity: 'legendary',
    price: 1700,
    glyph: 'trophy',
    colors: ['#fbbf24', '#d97706']
  },
  {
    id: 'badge-gem',
    name: 'Gemstone',
    kind: 'badge',
    tagline: 'Rare and precious.',
    rarity: 'epic',
    price: 1000,
    glyph: 'gem',
    colors: ['#a78bfa', '#7c3aed']
  },
  {
    id: 'badge-mythic',
    name: 'Mythic Core',
    kind: 'badge',
    tagline: 'Power beyond comprehension.',
    rarity: 'mythic',
    price: 2500,
    glyph: 'nova',
    colors: ['#ff6b6b', '#c0392b']
  },
  {
    id: 'badge-exclusive',
    name: "Founder's Mark",
    kind: 'badge',
    tagline: 'For those who were here from the start.',
    rarity: 'exclusive',
    price: 5000,
    glyph: 'crown',
    colors: ['#00ff88', '#00b894']
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
  },
  {
    id: 'cape-stripes',
    name: 'Tiger Stripes',
    kind: 'cape',
    tagline: 'Bold and fierce.',
    rarity: 'rare',
    price: 650,
    colors: ['#f97316', '#1c1917'],
    pattern: 'stripes'
  },
  {
    id: 'cape-dots',
    name: 'Polka Dots',
    kind: 'cape',
    tagline: 'Playful and fun.',
    rarity: 'common',
    price: 300,
    colors: ['#f472b6', '#1e1b4b'],
    pattern: 'dots'
  },
  {
    id: 'cape-waves',
    name: 'Ocean Waves',
    kind: 'cape',
    tagline: 'Ride the tide.',
    rarity: 'rare',
    price: 700,
    colors: ['#38bdf8', '#0c4a6e'],
    pattern: 'waves'
  },
  {
    id: 'cape-flames',
    name: 'Inferno',
    kind: 'cape',
    tagline: 'Burn everything.',
    rarity: 'epic',
    price: 950,
    colors: ['#ef4444', '#7f1d1d'],
    pattern: 'flames'
  },
  {
    id: 'cape-stars',
    name: 'Starry Night',
    kind: 'cape',
    tagline: 'A sky full of stars.',
    rarity: 'epic',
    price: 1000,
    colors: ['#1e1b4b', '#c4b5fd'],
    pattern: 'stars'
  },
  {
    id: 'cape-checker',
    name: 'Checkerboard',
    kind: 'cape',
    tagline: 'Classic pattern, modern style.',
    rarity: 'rare',
    price: 600,
    colors: ['#f8fafc', '#1e293b'],
    pattern: 'checker'
  },
  {
    id: 'cape-mythic',
    name: 'Mythic Shroud',
    kind: 'cape',
    tagline: 'Power woven into fabric.',
    rarity: 'mythic',
    price: 2500,
    colors: ['#ff6b6b', '#991b1b'],
    pattern: 'flames'
  },
  {
    id: 'cape-exclusive',
    name: "Founder's Cloak",
    kind: 'cape',
    tagline: 'Worn by those who built the foundation.',
    rarity: 'exclusive',
    price: 5000,
    colors: ['#00ff88', '#00b894'],
    pattern: 'gradient'
  },
  {
    id: 'cape-spiral',
    name: 'Hypnosis',
    kind: 'cape',
    tagline: 'Mesmerizing swirl.',
    rarity: 'legendary',
    price: 1800,
    colors: ['#8b5cf6', '#06b6d4'],
    pattern: 'spiral'
  },
  {
    id: 'cape-gradient',
    name: 'Sunset Gradient',
    kind: 'cape',
    tagline: 'Warm colors, cool vibes.',
    rarity: 'epic',
    price: 1100,
    colors: ['#fb923c', '#a855f7'],
    pattern: 'gradient'
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
