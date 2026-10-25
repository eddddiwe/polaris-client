import { useId } from 'react'
import type { CosmeticItem } from '@shared/types'
import { cosmeticById } from '@shared/cosmetics'

export function CosmeticBadge({
  id,
  size = 16,
  className
}: {
  id?: string
  size?: number
  className?: string
}): JSX.Element {
  const gradient = useId()
  const item = (id ? cosmeticById(id) : undefined) ?? cosmeticById('badge-north')
  const [from, to] = item?.colors ?? ['#c4b5fd', '#7c3aed']
  const glyph = item?.glyph ?? 'star'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={['cosmetic-badge', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={item?.name ?? 'Polaris badge'}
    >
      <title>{item?.name ?? 'Polaris badge'}</title>
      <defs>
        <linearGradient id={gradient} x1="5" y1="3" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d="M16 1.6 28.9 9v14L16 30.4 3.1 23V9L16 1.6Z"
        fill={`url(#${gradient})`}
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="0.8"
      />
      <path d="M16 5.6 25.6 11v10L16 26.4 6.4 21V11L16 5.6Z" fill="rgba(5,7,15,0.24)" />
      {badgeGlyph(glyph)}
      <circle cx="25.4" cy="7.2" r="1.3" fill="rgba(255,255,255,0.9)" />
    </svg>
  )
}

function badgeGlyph(glyph: string): JSX.Element {
  const common = {
    stroke: '#f8fafc',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none'
  }
  switch (glyph) {
    case 'comet':
      return (
        <>
          <circle cx="19" cy="13" r="3.4" fill="#f8fafc" />
          <path d="M15.3 16.7c-3.2 3.2-6.4 4.5-9.5 4.1 2.8-1.2 5-3.4 6.2-6.2" {...common} />
        </>
      )
    case 'flame':
      return (
        <path
          d="M16.2 6.8c3.6 4.2 6.3 6.4 6.3 10.2a6.5 6.5 0 0 1-13 0c0-2.6 1.7-4.6 3.8-7.1.1 2.6 1 3.9 2 4.7.9-2.2.9-4.7.9-7.8Z"
          fill="#fff7ed"
        />
      )
    case 'snow':
      return (
        <>
          <path d="M16 7v18M9 11.5l14 9M23 11.5l-14 9" {...common} />
          <path d="m13.4 8.8 2.6 2.4 2.6-2.4M13.4 23.2l2.6-2.4 2.6 2.4" {...common} />
        </>
      )
    case 'nova':
      return (
        <>
          <circle cx="16" cy="16" r="2.4" fill="#f8fafc" />
          <path d="M16 6.4v4M16 21.6v4M6.4 16h4M21.6 16h4M9.2 9.2l2.8 2.8M20 20l2.8 2.8M22.8 9.2 20 12M12 20l-2.8 2.8" {...common} />
        </>
      )
    case 'eye':
      return (
        <>
          <path d="M7.4 16s3.4-5.2 8.6-5.2S24.6 16 24.6 16s-3.4 5.2-8.6 5.2S7.4 16 7.4 16Z" {...common} />
          <circle cx="16" cy="16" r="2.2" fill="#f8fafc" />
        </>
      )
    case 'crown':
      return (
        <>
          <path d="m8.4 12.4 3.2 2.2 4.4-6.1 4.4 6.1 3.2-2.2-1.4 9.4H9.8l-1.4-9.4Z" {...common} />
          <path d="M10.6 18.8h10.8" {...common} />
        </>
      )
    case 'sigil':
      return (
        <>
          <path d="M16 6.4 24 16l-8 9.6L8 16l8-9.6Z" {...common} />
          <path d="M12.2 12.3h7.6M12.2 16h7.6M12.2 19.7h7.6" {...common} />
        </>
      )
    default:
      return (
        <path
          d="M16 6.1 18.4 13.6 25.9 16 18.4 18.4 16 25.9 13.6 18.4 6.1 16 13.6 13.6 16 6.1Z"
          fill="#f8fafc"
        />
      )
  }
}

export function CapeArt({ item, className }: { item: CosmeticItem; className?: string }): JSX.Element {
  const gradient = useId()
  const [from, to] = item.colors
  return (
    <svg
      viewBox="0 0 120 160"
      className={['cape-art', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${item.name} cape`}
    >
      <title>{item.name} cape</title>
      <defs>
        <linearGradient id={gradient} x1="28" y1="8" x2="94" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M22 12h76l-5 118-33 20-33-20-5-118Z" fill={`url(#${gradient})`} />
      <path d="M22 12h76l-1.4 18H23.4L22 12Z" fill="rgba(5,7,15,0.35)" />
      <path d="M34 34v88M60 34v100M86 34v88" stroke="rgba(255,255,255,0.13)" strokeWidth="1.2" />
      {capePattern(item.pattern)}
      <path d="M23.4 30h73.2" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
    </svg>
  )
}

function capePattern(pattern?: string): JSX.Element | null {
  switch (pattern) {
    case 'grid':
      return (
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="1">
          <path d="M28 58h64M28 82h64M28 106h64M28 130h64" />
          <path d="M40 34v100M60 34v100M80 34v100" />
        </g>
      )
    case 'aurora':
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M24 62c18-16 42 10 72-12" stroke="rgba(255,255,255,0.52)" strokeWidth="7" opacity="0.42" />
          <path d="M24 88c22 14 40-16 72 6" stroke="rgba(255,255,255,0.36)" strokeWidth="5" opacity="0.5" />
          <path d="M24 116c16-12 44 12 72-8" stroke="rgba(255,255,255,0.26)" strokeWidth="4" opacity="0.5" />
        </g>
      )
    case 'burst':
      return (
        <g stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round">
          <path d="M60 88 32 62M60 88 88 62M60 88 30 108M60 88l30 20M60 88V44M60 88v46" />
          <circle cx="60" cy="88" r="7" fill="rgba(255,255,255,0.6)" stroke="none" />
        </g>
      )
    default:
      return (
        <path
          d="M60 74l4.6 12.4L77 91l-12.4 4.6L60 108l-4.6-12.4L43 91l12.4-4.6L60 74Z"
          fill="rgba(255,255,255,0.38)"
        />
      )
  }
}
