import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../context'

/** True while the window is hidden or minimized, so decorative motion can stop. */
function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const sync = (): void => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  return hidden
}

/** OS-level motion preference, in addition to the in-app setting. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setReduced(query.matches)
    query.addEventListener('change', sync)
    sync()
    return () => query.removeEventListener('change', sync)
  }, [])
  return reduced
}

/**
 * Decorative animated wallpaper. Built-in scenes are pure CSS; `custom` points
 * at a remote image/GIF/video URL chosen in Settings → Appearance.
 */
export function Wallpaper(): JSX.Element | null {
  const { settings, gameRunning } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failedUrl, setFailedUrl] = useState('')
  const hidden = useDocumentHidden()
  const osReducedMotion = usePrefersReducedMotion()
  const preset = settings.wallpaper
  const custom = preset === 'custom'
  const url = settings.wallpaperUrl
  const isVideo = /\.(mp4|webm|ogv)(?:[?#]|$)/i.test(url)
  const paused = settings.reduceMotion || (gameRunning && settings.pauseUiDuringGame) || !settings.wallpaperMotion
  const still = paused || hidden || osReducedMotion
  // Keep custom media mounted across preset changes so switching away and back
  // reuses the loaded resource instead of refetching and re-decoding it.
  const mediaOk = url !== '' && failedUrl !== url
  const active = custom && mediaOk
  const playing = active && !still

  useEffect(() => {
    setFailedUrl('')
  }, [url])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) void video.play().catch(() => undefined)
    else video.pause()
  }, [playing, url])

  if (preset === 'none') return null
  if (custom && !mediaOk) return null

  const style = {
    '--wall-dim': String(settings.wallpaperDim / 100),
    '--wall-blur': `${settings.wallpaperBlur}px`
  } as CSSProperties

  return (
    <div
      className={`wallpaper wallpaper-${preset} ${still ? 'still' : ''}`}
      style={style}
      aria-hidden="true"
    >
      {mediaOk &&
        (isVideo ? (
          <video
            key={url}
            ref={videoRef}
            className="wallpaper-media"
            src={url}
            hidden={!custom}
            loop
            muted
            playsInline
            preload={active ? 'auto' : 'none'}
            disablePictureInPicture
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <img
            key={url}
            className="wallpaper-media"
            src={url}
            alt=""
            hidden={!custom}
            draggable={false}
            decoding="async"
            loading={active ? 'eager' : 'lazy'}
            onError={() => setFailedUrl(url)}
          />
        ))}
      {!custom && <span className="wallpaper-art" />}
      <span className="wallpaper-shade" />
    </div>
  )
}
