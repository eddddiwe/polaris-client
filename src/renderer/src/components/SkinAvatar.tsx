import { useEffect, useState } from 'react'

/**
 * Head texel region of a Minecraft skin: source rect (8, 8, 8, 8) is the front-facing
 * head (the same region the game samples for the head part of every classic/slim skin).
 */
const HEAD_X = 8
const HEAD_Y = 8
const HEAD_W = 8
const HEAD_H = 8

function loadHead(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        // Supersample the head crop so upscaling to avatar size stays crisp.
        const scale = 4
        const canvas = document.createElement('canvas')
        canvas.width = HEAD_W * scale
        canvas.height = HEAD_H * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve('')
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(img, HEAD_X, HEAD_Y, HEAD_W, HEAD_H, 0, 0, HEAD_W * scale, HEAD_H * scale)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = src.replace(/^http:\/\//, 'https://')
  })
}

export function SkinAvatar({
  skinUrl,
  name,
  size,
  radius,
  className
}: {
  skinUrl?: string
  name: string
  size?: number
  radius?: number
  className?: string
}): JSX.Element {
  const [head, setHead] = useState<string | null>(null)
  const initial = (name.trim()[0] ?? '?').toUpperCase()

  useEffect(() => {
    let cancelled = false
    if (!skinUrl) {
      setHead(null)
      return
    }
    void loadHead(skinUrl).then((data) => {
      if (!cancelled && data) setHead(data)
    })
    return () => {
      cancelled = true
    }
  }, [skinUrl])

  const cls = className ?? 'avatar'
  return (
    <span className={cls} style={className ? undefined : { width: size, height: size, borderRadius: radius }}>
      {head ? (
        <img className="avatar-img" src={head} alt="" draggable={false} />
      ) : (
        <span className="avatar-fallback">{initial}</span>
      )}
    </span>
  )
}
