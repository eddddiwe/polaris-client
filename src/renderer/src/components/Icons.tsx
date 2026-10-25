import { useId, type SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'layers'
  | 'compass'
  | 'gauge'
  | 'settings'
  | 'play'
  | 'stop'
  | 'plus'
  | 'folder'
  | 'trash'
  | 'search'
  | 'check'
  | 'x'
  | 'minimize'
  | 'maximize'
  | 'close'
  | 'back'
  | 'refresh'
  | 'download'
  | 'user'
  | 'chevron'
  | 'cpu'
  | 'memory'
  | 'coffee'
  | 'shield'
  | 'zap'
  | 'sparkles'
  | 'external'
  | 'info'
  | 'monitor'
  | 'gamepad'
  | 'clock'
  | 'list'
  | 'terminal'
  | 'sliders'
  | 'package'
  | 'globe'
  | 'star'
  | 'more'
  | 'heart'
  | 'code'
  | 'book'
  | 'bug'
  | 'message'
  | 'image'
  | 'server'
  | 'arrowUp'
  | 'gem'
  | 'bag'

export function Icon({
  name,
  size = 18,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {glyph(name)}
    </svg>
  )
}

function glyph(name: IconName): JSX.Element {
  switch (name) {
    case 'home':
      return (
        <>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </>
      )
    case 'layers':
      return (
        <>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </>
      )
    case 'compass':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
        </>
      )
    case 'gauge':
      return (
        <>
          <path d="M4 18a9 9 0 1 1 16 0" />
          <path d="m12 14 4-4" />
          <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09A1.7 1.7 0 0 0 20.95 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
        </>
      )
    case 'play':
      return <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    case 'stop':
      return <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
    case 'plus':
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      )
    case 'folder':
      return (
        <>
          <path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
          <path d="M3 10h18" />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V4.8c0-.5.4-.8.9-.8h4.2c.5 0 .9.3.9.8V7" />
          <path d="M6.5 7v12.2c0 .5.4.8.9.8h9.2c.5 0 .9-.3.9-.8V7" />
          <path d="M10 11v5M14 11v5" />
        </>
      )
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      )
    case 'check':
      return <path d="m5 12.5 4.5 4.5L19 6.5" />
    case 'x':
      return (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      )
    case 'minimize':
      return <path d="M5 12h14" />
    case 'maximize':
      return <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
    case 'close':
      return (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      )
    case 'back':
      return (
        <>
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </>
      )
    case 'refresh':
      return (
        <>
          <path d="M20 11a8 8 0 1 0-2.3 6.2" />
          <path d="M20 4v7h-7" />
        </>
      )
    case 'download':
      return (
        <>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 19h16" />
        </>
      )
    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20c.8-4 3.6-6 7.5-6s6.7 2 7.5 6" />
        </>
      )
    case 'chevron':
      return <path d="m6 9 6 6 6-6" />
    case 'cpu':
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
        </>
      )
    case 'memory':
      return (
        <>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 7v10M11 7v10M15 7v10M19 7v10" />
          <path d="M5 17v2.5M9 17v2.5M15 17v2.5M19 17v2.5" />
        </>
      )
    case 'coffee':
      return (
        <>
          <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
          <path d="M16 10h2.5a3 3 0 0 1 0 6H16" />
          <path d="M7 3v3M11 3v3M15 3v3" />
        </>
      )
    case 'shield':
      return (
        <>
          <path d="M12 3 5 6v6c0 4.3 2.9 7.4 7 9 4.1-1.6 7-4.7 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )
    case 'zap':
      return <path d="M13 2.5 5 14h6l-1 7.5L19 10h-6l0-7.5Z" />
    case 'sparkles':
      return (
        <>
          <path d="M12 3.5 13.4 8 18 9.5 13.4 11 12 15.5 10.6 11 6 9.5 10.6 8 12 3.5Z" />
          <path d="M18.5 15.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
          <path d="M5 15l.6 1.9 1.9.6-1.9.6L5 20l-.6-1.9L2.5 17.5l1.9-.6L5 15Z" />
        </>
      )
    case 'external':
      return (
        <>
          <path d="M14 4h6v6" />
          <path d="M20 4 11 13" />
          <path d="M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10" />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5" />
          <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
        </>
      )
    case 'monitor':
      return (
        <>
          <rect x="3" y="4" width="18" height="12.5" rx="2" />
          <path d="M8 21h8M12 16.5V21" />
        </>
      )
    case 'gamepad':
      return (
        <>
          <path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 3.6l.8 4.4a3 3 0 0 1-5.3 2.4L15 16H9l-1.4 1.4a3 3 0 0 1-5.3-2.4l.8-4.4A4.5 4.5 0 0 1 7.5 7Z" />
          <path d="M7.5 11v3M6 12.5h3M16 12h.01M18 13.5h.01" />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5.2l3.5 2" />
        </>
      )
    case 'list':
      return (
        <>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </>
      )
    case 'terminal':
      return (
        <>
          <rect x="3" y="4.5" width="18" height="15" rx="2" />
          <path d="m7 9 3 3-3 3M12.5 15H17" />
        </>
      )
    case 'sliders':
      return (
        <>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </>
      )
    case 'package':
      return (
        <>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
          <path d="m8 5.2 8 4.5" />
        </>
      )
    case 'globe':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.4 3.9 5.4 3.9 9s-1.3 6.6-3.9 9c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3Z" />
        </>
      )
    case 'star':
      return <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
    case 'more':
      return (
        <>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </>
      )
    case 'heart':
      return <path d="M12 20.5S3.5 15 3.5 9.3A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 3.3C20.5 15 12 20.5 12 20.5Z" />
    case 'code':
      return (
        <>
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
          <path d="m13.5 5-3 14" />
        </>
      )
    case 'book':
      return (
        <>
          <path d="M5 4.5h11a2 2 0 0 1 2 2V21H7a2 2 0 0 1-2-2V4.5Z" />
          <path d="M5 4.5A2.5 2.5 0 0 0 2.5 7v11.5A2.5 2.5 0 0 0 5 21" />
          <path d="M9 8.5h5M9 12h5" />
        </>
      )
    case 'bug':
      return (
        <>
          <rect x="7" y="8" width="10" height="11" rx="5" />
          <path d="M9 8a3 3 0 0 1 6 0M3 11h4M17 11h4M3 16h4M17 16h4M4 6l3 2M20 6l-3 2M4 21l3-2M20 21l-3-2" />
        </>
      )
    case 'message':
      return (
        <path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 21l1.6-4.4A8.5 8.5 0 1 1 20.5 12Z" />
      )
    case 'image':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m5 18 5-5 3 3 2-2 4 4" />
        </>
      )
    case 'server':
      return (
        <>
          <rect x="3" y="4" width="18" height="6" rx="1.8" />
          <rect x="3" y="14" width="18" height="6" rx="1.8" />
          <path d="M7 7h.01M7 17h.01M11 7h5M11 17h5" />
        </>
      )
    case 'arrowUp':
      return (
        <>
          <path d="M12 20V5" />
          <path d="m6 11 6-6 6 6" />
        </>
      )
    case 'gem':
      return (
        <>
          <path d="m12 3 7 5.2L16.4 21h-8.8L5 8.2 12 3Z" />
          <path d="m5 8.2 7 3.1 7-3.1M12 11.3V21" />
        </>
      )
    case 'bag':
      return (
        <>
          <path d="M5 8h14l-1 12H6L5 8Z" />
          <path d="M9 8V6.7A3 3 0 0 1 12 4a3 3 0 0 1 3 2.7V8" />
          <path d="M9.5 12.5h5" />
        </>
      )
  }
}

export function PolarisMark({ size = 22 }: { size?: number }): JSX.Element {
  const id = useId()
  const background = `${id}-bg`
  const star = `${id}-star`
  const orbit = `${id}-orbit`
  const glow = `${id}-glow`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={background} x1="8" y1="4" x2="56" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#17132f" />
          <stop offset="0.55" stopColor="#0b0a18" />
          <stop offset="1" stopColor="#07131c" />
        </linearGradient>
        <linearGradient id={star} x1="18" y1="8" x2="49" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#c4b5fd" />
          <stop offset="0.76" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={orbit} x1="8" y1="22" x2="57" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="0.45" stopColor="#c4b5fd" stopOpacity="0.9" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id={glow} cx="0" cy="0" r="1" gradientTransform="translate(32 31) rotate(90) scale(26)">
          <stop stopColor="#8b5cf6" stopOpacity="0.48" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#${background})`} stroke="rgba(196,181,253,0.24)" />
      <circle cx="32" cy="31" r="26" fill={`url(#${glow})`} />
      <ellipse cx="32" cy="32" rx="27" ry="10.5" transform="rotate(-24 32 32)" fill="none" stroke={`url(#${orbit})`} strokeWidth="1.3" />
      <path
        d="M32 5.5 35.1 26.1 43.5 23.9 37.2 32 43.5 40.1 35.1 37.9 32 58.5 28.9 37.9 20.5 40.1 26.8 32 20.5 23.9 28.9 26.1 32 5.5Z"
        fill={`url(#${star})`}
      />
      <path d="M32 5.5 35.1 26.1 32 32 28.9 26.1 32 5.5Z" fill="#ffffff" opacity="0.58" />
      <circle cx="32" cy="32" r="2.5" fill="#080914" />
      <circle cx="32" cy="32" r="1.1" fill="#e0f2fe" />
      <circle cx="55.6" cy="20.4" r="1.7" fill="#67e8f9" />
      <circle cx="8.2" cy="45.3" r="1.1" fill="#c4b5fd" opacity="0.8" />
    </svg>
  )
}
