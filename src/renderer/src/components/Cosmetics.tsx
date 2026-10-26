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

function badgeGlyph(glyph: string): JSX.Element | null {
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
    case 'diamond':
      return (
        <>
          <path d="M16 6.4 24 16l-8 9.6L8 16l8-9.6Z" {...common} />
          <path d="M16 6.4v19.2M8 16h16" {...common} />
        </>
      )
    case 'heart':
      return (
        <path
          d="M16 24.5 8.5 17c-3.3-3.3-3.3-8.7 0-12 1.7-1.7 4.4-1.7 6.1 0L16 6.4l1.4-1.4c1.7-1.7 4.4-1.7 6.1 0 3.3 3.3 3.3 8.7 0 12L16 24.5Z"
          fill="#fca5a5"
        />
      )
    case 'moon':
      return (
        <path
          d="M21.5 18.5a8.5 8.5 0 1 1-6-14.5 6.5 6.5 0 0 0 6 14.5Z"
          fill="#f8fafc"
        />
      )
    case 'sun':
      return (
        <>
          <circle cx="16" cy="16" r="5" fill="#fbbf24" />
          <path d="M16 6v3M16 23v3M6 16h3M23 16h3M9 9l2.1 2.1M18.9 18.9l2.1 2.1M9 23l2.1-2.1M18.9 7.1 21 9" {...common} stroke="#fbbf24" />
        </>
      )
    case 'sword':
      return (
        <>
          <path d="M10 22 22 10M12 24l2-2M20 12l2-2" {...common} />
          <path d="M8.5 23.5 10.5 21.5" {...common} />
        </>
      )
    case 'shield':
      return (
        <path
          d="M16 6.4 24 10v8.5c0 4.8-3.5 8.8-8 9.5-4.5-.7-8-4.7-8-9.5V10l8-3.6Z"
          {...common}
        />
      )
    case 'lightning':
      return (
        <path
          d="M18.5 6.4 11.5 16.5h5.5L13.5 25.6l9-11.1h-5.5l1.5-8.1Z"
          fill="#fbbf24"
        />
      )
    case 'skull':
      return (
        <>
          <path d="M16 7a7 7 0 0 0-7 7v3.5c0 1.5.6 2.9 1.6 4L10 24h12l-.6-2.5c1-1.1 1.6-2.5 1.6-4V14a7 7 0 0 0-7-7Z" {...common} />
          <circle cx="12.5" cy="15" r="1.5" fill="#f8fafc" />
          <circle cx="19.5" cy="15" r="1.5" fill="#f8fafc" />
        </>
      )
    case 'dragon':
      return (
        <>
          <path d="M8 22c2-6 5-9 8-9s6 3 8 9M12 13c0-3 2-5 4-5s4 2 4 5M16 8V5" {...common} />
          <circle cx="16" cy="5" r="1.5" fill="#f8fafc" />
        </>
      )
    case 'ghost':
      return (
        <>
          <path d="M10 12a6 6 0 0 1 12 0v12l-3-2-3 2-3-2-3 2V12Z" {...common} />
          <circle cx="13.5" cy="13" r="1.2" fill="#f8fafc" />
          <circle cx="18.5" cy="13" r="1.2" fill="#f8fafc" />
        </>
      )
    case 'music':
      return (
        <>
          <path d="M12 22V10l10-2v12" {...common} />
          <circle cx="10" cy="22" r="2.5" fill="#f8fafc" />
          <circle cx="20" cy="20" r="2.5" fill="#f8fafc" />
        </>
      )
    case 'rocket':
      return (
        <>
          <path d="M16 6.4c-2 3-3 6-3 9.6v6l3 3 3-3v-6c0-3.6-1-6.6-3-9.6Z" {...common} />
          <path d="M13 22l-2 4M19 22l2 4" {...common} />
        </>
      )
    case 'trophy':
      return (
        <>
          <path d="M10 8h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" {...common} />
          <path d="M8 8H6a2 2 0 0 0-2 2v1a3 3 0 0 0 3 3h3M22 8h2a2 2 0 0 0 2-2v-1a3 3 0 0 0-3-3h-3" {...common} />
          <path d="M13 20h6v4H13v-4ZM11 24h10" {...common} />
        </>
      )
    case 'gem':
      return (
        <>
          <path d="M10 10h12l4 6-10 10L6 16l4-6Z" {...common} />
          <path d="M10 10l6 16 6-16M6 16h20" {...common} />
        </>
      )
      return (
        <path
          d="M16 6.1 18.4 13.6 25.9 16 18.4 18.4 16 25.9 13.6 18.4 6.1 16 13.6 13.6 16 6.1Z"
          fill="#f8fafc"
        />
      )
    default:
      return null
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
    case 'stripes':
      return (
        <g stroke="rgba(255,255,255,0.35)" strokeWidth="3">
          <path d="M24 40h72M24 64h72M24 88h72M24 112h72M24 136h72" />
        </g>
      )
    case 'dots':
      return (
        <g fill="rgba(255,255,255,0.4)">
          <circle cx="32" cy="48" r="3" />
          <circle cx="52" cy="48" r="3" />
          <circle cx="72" cy="48" r="3" />
          <circle cx="92" cy="48" r="3" />
          <circle cx="42" cy="72" r="3" />
          <circle cx="62" cy="72" r="3" />
          <circle cx="82" cy="72" r="3" />
          <circle cx="32" cy="96" r="3" />
          <circle cx="52" cy="96" r="3" />
          <circle cx="72" cy="96" r="3" />
          <circle cx="92" cy="96" r="3" />
          <circle cx="42" cy="120" r="3" />
          <circle cx="62" cy="120" r="3" />
          <circle cx="82" cy="120" r="3" />
        </g>
      )
    case 'waves':
      return (
        <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5">
          <path d="M24 50c12-8 24 8 36 0s24 8 36 0" />
          <path d="M24 74c12-8 24 8 36 0s24 8 36 0" />
          <path d="M24 98c12-8 24 8 36 0s24 8 36 0" />
          <path d="M24 122c12-8 24 8 36 0s24 8 36 0" />
        </g>
      )
    case 'flames':
      return (
        <g fill="rgba(255,255,255,0.4)">
          <path d="M30 100c-2-8 2-14 6-18 0 6 3 8 3 4 0-4 3-8 6-10-1 4 1 7 3 8 2-6 6-8 6-4 0 6 3 10 3 16 0 6-4 10-8 10s-8-4-8-10 3-10 3-16c0-4 4-2 6 4 2-1 3-4 3-8 3 2 6 6 6 10 0 4 3 2 3-4 3 4 6 10 6 18 0 8-6 14-14 14s-14-6-14-14Z" />
        </g>
      )
    case 'stars':
      return (
        <g fill="rgba(255,255,255,0.5)">
          <path d="M32 48l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5Z" />
          <path d="M56 72l1.5 4 4 .5-3 2.5 1 4-3.5-2.5-3.5 2.5 1-4-3-2.5 4-.5Z" />
          <path d="M80 52l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5Z" />
          <path d="M40 100l1.5 4 4 .5-3 2.5 1 4-3.5-2.5-3.5 2.5 1-4-3-2.5 4-.5Z" />
          <path d="M72 116l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5Z" />
        </g>
      )
    case 'checker':
      return (
        <g fill="rgba(255,255,255,0.25)">
          <rect x="24" y="34" width="12" height="12" />
          <rect x="48" y="34" width="12" height="12" />
          <rect x="72" y="34" width="12" height="12" />
          <rect x="36" y="46" width="12" height="12" />
          <rect x="60" y="46" width="12" height="12" />
          <rect x="84" y="46" width="12" height="12" />
          <rect x="24" y="58" width="12" height="12" />
          <rect x="48" y="58" width="12" height="12" />
          <rect x="72" y="58" width="12" height="12" />
          <rect x="36" y="70" width="12" height="12" />
          <rect x="60" y="70" width="12" height="12" />
          <rect x="84" y="70" width="12" height="12" />
        </g>
      )
    case 'spiral':
      return (
        <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
          <path d="M60 88c0-12 8-20 20-20s20 8 20 20-8 20-20 20-20-8-20-20-12 0-12 12 8 20 20 20 20-8 20-20" />
        </g>
      )
    case 'gradient':
      return (
        <g>
          <rect x="24" y="34" width="72" height="100" fill="rgba(255,255,255,0.15)" />
          <rect x="24" y="34" width="72" height="33" fill="rgba(255,255,255,0.25)" />
          <rect x="24" y="67" width="72" height="33" fill="rgba(255,255,255,0.18)" />
          <rect x="24" y="100" width="72" height="34" fill="rgba(255,255,255,0.1)" />
        </g>
      )
      return (
        <path
          d="M60 74l4.6 12.4L77 91l-12.4 4.6L60 108l-4.6-12.4L43 91l12.4-4.6L60 74Z"
          fill="rgba(255,255,255,0.38)"
        />
      )
    default:
      return null
  }
}
