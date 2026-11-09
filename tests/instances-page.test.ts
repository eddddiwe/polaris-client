import { describe, expect, it } from 'vitest'
import type { LaunchState } from '../src/shared/types'
import { preparingInstanceId } from '../src/renderer/src/pages/Instances'

const idle: LaunchState = { instanceId: null, status: 'idle' }

describe('preparingInstanceId', () => {
  it('reports a locally submitted launch before the main-process event arrives', () => {
    expect(preparingInstanceId('instance-a', idle)).toBe('instance-a')
  })

  it('reports the instance the main process says is preparing', () => {
    expect(preparingInstanceId(null, { instanceId: 'instance-b', status: 'preparing' })).toBe('instance-b')
  })

  it('does not block launches once the process is running or idle', () => {
    expect(preparingInstanceId(null, { instanceId: 'instance-b', status: 'running' })).toBeNull()
    expect(preparingInstanceId(null, idle)).toBeNull()
  })
})
