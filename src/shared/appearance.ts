import type { WallpaperPreset } from './types'

export interface WallpaperOption {
  id: WallpaperPreset
  name: string
  blurb: string
}

export const WALLPAPERS: WallpaperOption[] = [
  { id: 'aurora', name: 'Aurora', blurb: 'Slow polar light over deep space.' },
  { id: 'nebula', name: 'Nebula', blurb: 'A rotating cloud of violet and cyan.' },
  { id: 'starfield', name: 'Starfield', blurb: 'Quiet drift through a dense star field.' },
  { id: 'grid', name: 'Night Grid', blurb: 'Synthwave horizon with a moving grid.' },
  { id: 'custom', name: 'Your media', blurb: 'A direct GIF, WebP or MP4 link.' },
  { id: 'none', name: 'None', blurb: 'Keep the original midnight gradient.' }
]

export const ACCENTS = ['#8b5cf6', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185']

export function wallpaperLabel(id: WallpaperPreset): string {
  return WALLPAPERS.find((item) => item.id === id)?.name ?? 'Aurora'
}
