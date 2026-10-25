import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../context'

/**
 * Decorative animated wallpaper. Built-in scenes are pure CSS; `custom` points
 * at a remote image/GIF/video URL chosen in Settings → Appearance.
 */
export function Wallpaper(): JSX.Element | null {
  const { settings, gameRunning } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failedUrl, setFailedUrl] = useState('')
  const preset = settings.wallpaper
  const custom = preset === 'custom'
  const url = settings.wallpaperUrl
  const isVideo = /\.(mp4|webm|ogv)(?:[?#]|$)/i.test(url)
  const paused = settings.reduceMotion || (gameRunning && settings.pauseUiDuringGame) || !settings.wallpaperMotion

  useEffect(() => {
    setFailedUrl('')
  }, [url])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (paused) video.pause()
    else void video.play().catch(() => undefined)
  }, [paused, url])

  if (preset === 'none') return null
  if (custom && (!url || failedUrl === url)) return null

  const style = {
    '--wall-dim': String(settings.wallpaperDim / 100),
    '--wall-blur': `${settings.wallpaperBlur}px`
  } as CSSProperties

  return (
    <div
      className={`wallpaper wallpaper-${preset} ${settings.wallpaperMotion && !settings.reduceMotion ? '' : 'still'}`}
      style={style}
      aria-hidden="true"
    >
      {custom ? (
        isVideo ? (
          <video
            key={url}
            ref={videoRef}
            className="wallpaper-media"
            src={url}
            autoPlay
            loop
            muted
            playsInline
            disablePictureInPicture
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <img
            key={url}
            className="wallpaper-media"
            src={url}
            alt=""
            draggable={false}
            onError={() => setFailedUrl(url)}
          />
        )
      ) : (
        <span className="wallpaper-art" />
      )}
      <span className="wallpaper-shade" />
    </div>
  )
}
