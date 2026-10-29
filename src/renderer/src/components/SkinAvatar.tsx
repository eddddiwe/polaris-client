import { useEffect, useState } from 'react'

/**
 * Head texel region of a Minecraft skin: source rect (8, 8, 8, 8) is the front-facing
 * head (the same region the game samples for the head part of every classic/slim skin).
 * The helmet/outer layer sits at (40, 8, 8, 8) and is composited on top where opaque.
 */
const HEAD_X = 8
const HEAD_Y = 8
const HEAD_W = 8
const HEAD_H = 8
const HAT_X = 40
const HAT_Y = 8

function loadHead(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const scale = 4
        const w = HEAD_W * scale
        const h = HEAD_H * scale
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve('')
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(img, HEAD_X, HEAD_Y, HEAD_W, HEAD_H, 0, 0, w, h)

        // Composite the helmet/outer layer on top where it has opaque pixels.
        const hat = new Image()
        hat.crossOrigin = 'anonymous'
        hat.onload = () => {
          try {
            const hatCanvas = document.createElement('canvas')
            hatCanvas.width = w
            hatCanvas.height = h
            const hctx = hatCanvas.getContext('2d')
            if (hctx) {
              hctx.imageSmoothingEnabled = true
              hctx.drawImage(hat, HAT_X, HAT_Y, HEAD_W, HEAD_H, 0, 0, w, h)
              const base = ctx.getImageData(0, 0, w, h)
              const overlay = hctx.getImageData(0, 0, w, h)
              for (let i = 0; i < base.data.length; i += 4) {
                if (overlay.data[i + 3] > 16) {
                  base.data[i] = overlay.data[i]
                  base.data[i + 1] = overlay.data[i + 1]
                  base.data[i + 2] = overlay.data[i + 2]
                  base.data[i + 3] = 255
                }
              }
              ctx.putImageData(base, 0, 0)
            }
          } catch {
            // ignore overlay errors; keep the base head
          }
          resolve(canvas.toDataURL('image/png'))
        }
        hat.onerror = () => resolve(canvas.toDataURL('image/png'))
        hat.src = src.replace(/^http:\/\//, 'https://')
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
  uuid,
  size,
  radius,
  className
}: {
  skinUrl?: string
  name: string
  uuid?: string
  size?: number
  radius?: number
  className?: string
}): JSX.Element {
  const [renderFailed, setRenderFailed] = useState(false)
  const [localHead, setLocalHead] = useState<string | null>(null)
  const initial = (name.trim()[0] ?? '?').toUpperCase()

  useEffect(() => {
    let cancelled = false
    if (!skinUrl) {
      setLocalHead(null)
      return
    }
    void loadHead(skinUrl).then((data) => {
      if (!cancelled && data) setLocalHead(data)
    })
    return () => {
      cancelled = true
    }
  }, [skinUrl])

  const cls = className ?? 'avatar'
  const minotarUrl =
    uuid && skinUrl ? `https://minotar.net/helm/${uuid}/${Math.max(64, (size ?? 64) * 2)}` : null

  // Prefer a rendered head (minotar) that actually shows the account's skin; fall back to the
  // local skin crop (with helmet layer) and finally to the gradient initial. mc-heads returns a
  // default Steve head for unknown UUIDs, so it is not used here.
  if (minotarUrl && !renderFailed) {
    return (
      <span className={cls} style={className ? undefined : { width: size, height: size, borderRadius: radius }}>
        <img
          className="avatar-img"
          src={minotarUrl}
          alt=""
          draggable={false}
          onError={() => setRenderFailed(true)}
        />
      </span>
    )
  }
  return (
    <span className={cls} style={className ? undefined : { width: size, height: size, borderRadius: radius }}>
      {localHead ? (
        <img className="avatar-img" src={localHead} alt="" draggable={false} />
      ) : (
        <span className="avatar-fallback">{initial}</span>
      )}
    </span>
  )
}
