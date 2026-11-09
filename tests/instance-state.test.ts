import { describe, expect, it } from 'vitest'
import { isInstanceRunning } from '../src/renderer/src/pages/instance-state'
import type { LaunchState } from '../src/shared/types'

const state = (instanceId: string | null, status: LaunchState['status']): Pick<LaunchState, 'status' | 'instanceId'> => ({
  instanceId,
  status
})

describe('isInstanceRunning', () => {
  it('is true only for the instance the launch state names', () => {
    expect(isInstanceRunning(state('server-a', 'running'), 'server-a')).toBe(true)
    expect(isInstanceRunning(state('server-a', 'running'), 'server-b')).toBe(false)
  })

  it('is false while this instance is idle, preparing or gone', () => {
    expect(isInstanceRunning(state('server-a', 'idle'), 'server-a')).toBe(false)
    expect(isInstanceRunning(state('server-a', 'preparing'), 'server-a')).toBe(false)
    expect(isInstanceRunning(state('server-a', 'exited'), 'server-a')).toBe(false)
    expect(isInstanceRunning(state(null, 'running'), undefined)).toBe(false)
  })

  it('does not let a running client enable a stopped server console', () => {
    expect(isInstanceRunning(state('client-1', 'running'), 'server-b')).toBe(false)
  })
})
