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
const SCALE = 4
const MAX_CACHED_HEADS = 200

/**
 * The same account often mounts in several places at once (sidebar, store, modals).
 * Share one crop per skin URL so repeats reuse the image load, canvas pass and data URL.
 */
const headCache = new Map<string, Promise<string>>()

function normalize(src: string): string {
  return src.replace(/^http:\/\//, 'https://')
}

function decodeImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function loadHead(src: string): Promise<string> {
  const img = await decodeImage(src)
  if (!img) return ''
  const w = HEAD_W * SCALE
  const h = HEAD_H * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, HEAD_X, HEAD_Y, HEAD_W, HEAD_H, 0, 0, w, h)

  // The helmet layer comes from the same decoded skin; do not fetch it a second time.
  try {
    const hatCanvas = document.createElement('canvas')
    hatCanvas.width = w
    hatCanvas.height = h
    const hctx = hatCanvas.getContext('2d')
    if (hctx) {
      hctx.imageSmoothingEnabled = true
      hctx.drawImage(img, HAT_X, HAT_Y, HEAD_W, HEAD_H, 0, 0, w, h)
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
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

function headFor(src: string): Promise<string> {
  const key = normalize(src)
  const cached = headCache.get(key)
  if (cached) return cached
  const head = loadHead(key).catch(() => '').then((data) => {
    // Do not cache failures: a later mount may succeed after a transient error.
    if (!data) headCache.delete(key)
    return data
  })
  headCache.set(key, head)
  if (headCache.size > MAX_CACHED_HEADS) {
    headCache.delete(headCache.keys().next().value as string)
  }
  return head
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
  const [failedUuid, setFailedUuid] = useState<string | null>(null)
  const [localHead, setLocalHead] = useState<string | null>(null)
  const initial = (name.trim()[0] ?? '?').toUpperCase()

  useEffect(() => {
    let cancelled = false
    setLocalHead(null)
    if (!skinUrl) return
    void headFor(skinUrl).then((data) => {
      if (!cancelled && data) setLocalHead(data)
    })
    return () => {
      cancelled = true
    }
  }, [skinUrl])

  const cls = className ?? 'avatar'
  const minotarUrl = uuid ? `https://minotar.net/helm/${encodeURIComponent(uuid)}/${Math.max(64, (size ?? 64) * 2)}` : null
  const renderFailed = uuid != null && failedUuid === uuid

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
          decoding="async"
          onError={() => setFailedUuid(uuid ?? null)}
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
