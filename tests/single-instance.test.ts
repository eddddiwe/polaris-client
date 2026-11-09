import { describe, expect, it } from 'vitest'
import { focusWhenReady, focusWindow, type DeferredFocusWindow } from '../src/main/singleInstance'

function fakeWindow(
  options: { destroyed?: boolean; minimized?: boolean; visible?: boolean } = {}
): DeferredFocusWindow & { calls: string[]; showWhenReady: () => void } {
  const calls: string[] = []
  let ready: (() => void) | null = null
  return {
    calls,
    isDestroyed: () => options.destroyed === true,
    isMinimized: () => options.minimized === true,
    isVisible: () => options.visible === true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    once: (event, listener) => {
      if (event === 'ready-to-show') ready = listener
    },
    showWhenReady: () => ready?.()
  }
}

describe('focusWindow', () => {
  it('reports no focus when the primary window is missing', () => {
    expect(focusWindow(null)).toBe(false)
  })

  it('reports no focus and does not throw when the window was destroyed', () => {
    const win = fakeWindow({ destroyed: true })
    expect(focusWindow(win)).toBe(false)
    expect(win.calls).toEqual([])
  })

  it('restores a minimized window before showing and focusing it', () => {
    const win = fakeWindow({ minimized: true })
    expect(focusWindow(win)).toBe(true)
    expect(win.calls).toEqual(['restore', 'show', 'focus'])
  })

  it('shows and focuses a normal window', () => {
    const win = fakeWindow()
    expect(focusWindow(win)).toBe(true)
    expect(win.calls).toEqual(['show', 'focus'])
  })
})

describe('focusWhenReady', () => {
  it('does nothing after the window was destroyed', () => {
    const win = fakeWindow({ destroyed: true })
    focusWhenReady(win)
    expect(win.calls).toEqual([])
  })

  it('focuses an already visible window immediately', () => {
    const win = fakeWindow({ visible: true })
    focusWhenReady(win)
    expect(win.calls).toEqual(['show', 'focus'])
  })

  it('waits for ready-to-show instead of showing a blank frame', () => {
    const win = fakeWindow()
    focusWhenReady(win)
    expect(win.calls).toEqual([])
    win.showWhenReady()
    expect(win.calls).toEqual(['show', 'focus'])
  })
})
