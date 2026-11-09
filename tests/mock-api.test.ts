import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../src/renderer/src/mock'

describe('mock API launch lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits launch and game state so Stop returns the preview to idle', async () => {
    vi.useFakeTimers()
    const api = createMockApi()
    const launchStates: string[] = []
    const gameStates: boolean[] = []
    const offLaunch = api.onLaunchState((state) => launchStates.push(state.status))
    const offGame = api.onGameState((state) => gameStates.push(state.running))

    const pending = api.launch('astra-7f3a1c')
    await vi.advanceTimersByTimeAsync(1000)
    expect((await pending).status).toBe('running')

    // App.stop() ignores the resolved value and clears gameRunning from this event.
    await api.stop()
    expect(launchStates).toEqual(['preparing', 'running', 'exited'])
    expect(gameStates).toEqual([false, true, false])

    offLaunch()
    offGame()
    await api.stop()
    expect(launchStates).toHaveLength(3)
  })
})
