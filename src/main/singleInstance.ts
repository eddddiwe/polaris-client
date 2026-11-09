/**
 * Minimal window surface used by the single-instance focus path. Structural so
 * the handler can be tested without booting Electron.
 */
export interface FocusableWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export interface DeferredFocusWindow extends FocusableWindow {
  isVisible(): boolean
  once(event: 'ready-to-show', listener: () => void): unknown
}

/**
 * Bring the primary window back to the foreground.
 *
 * Returns false when there is no window or it has already been destroyed.
 * Callers must use that result to queue the request instead of calling methods
 * on a destroyed BrowserWindow, which throws "Object has been destroyed" from
 * inside the second-instance event and aborts the focus path.
 */
export function focusWindow(win: FocusableWindow | null): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
}

/**
 * Focus a window that was just created. The window is shown by its own
 * ready-to-show handler, so wait for that event rather than showing a blank
 * frame; an already visible window is focused immediately.
 */
export function focusWhenReady(win: DeferredFocusWindow): void {
  if (win.isDestroyed()) return
  if (win.isVisible()) {
    focusWindow(win)
    return
  }
  win.once('ready-to-show', () => focusWindow(win))
}
