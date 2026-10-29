import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Mouse-tracking for button radial glow effect (throttled via rAF)
let rafId = 0
document.addEventListener('mousemove', (e) => {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const target = e.target as HTMLElement
    const btn = target?.closest?.('.btn') as HTMLElement | null
    if (btn) {
      const rect = btn.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      btn.style.setProperty('--mouse-x', `${x}%`)
      btn.style.setProperty('--mouse-y', `${y}%`)
    }
  })
}, { passive: true })

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
