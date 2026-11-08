import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Pointer-tracked radial glow for .btn elements. Moves are coalesced to the
// latest position per animation frame, and button geometry is cached per hover
// so tracking never forces layout on every mouse event. Honors reduced motion.
function installButtonGlow(): () => void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let mouseX = 0
  let mouseY = 0
  let active: HTMLElement | null = null
  let rect: DOMRect | null = null

  const flush = (): void => {
    frame = 0
    if (!active || !active.isConnected) {
      active = null
      rect = null
      return
    }
    if (reducedMotion.matches) return
    rect ??= active.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = ((mouseX - rect.left) / rect.width) * 100
    const y = ((mouseY - rect.top) / rect.height) * 100
    active.style.setProperty('--mouse-x', `${x}%`)
    active.style.setProperty('--mouse-y', `${y}%`)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (reducedMotion.matches) return
    const next =
      event.target instanceof Element ? (event.target.closest('.btn') as HTMLElement | null) : null
    if (next !== active) {
      active = next
      rect = null
    }
    if (!active) return
    mouseX = event.clientX
    mouseY = event.clientY
    if (!frame) frame = requestAnimationFrame(flush)
  }

  // Cached geometry goes stale when the layout or a scroll container moves.
  const invalidateRect = (): void => {
    rect = null
    if (active && !frame && !reducedMotion.matches) frame = requestAnimationFrame(flush)
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true })
  window.addEventListener('scroll', invalidateRect, { capture: true, passive: true })
  window.addEventListener('resize', invalidateRect, { passive: true })

  return () => {
    if (frame) cancelAnimationFrame(frame)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('scroll', invalidateRect, { capture: true })
    window.removeEventListener('resize', invalidateRect)
  }
}

const disposeButtonGlow = installButtonGlow()
const hot = (import.meta as ImportMeta & { hot?: { dispose(cb: () => void): void } }).hot
hot?.dispose(disposeButtonGlow)

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
