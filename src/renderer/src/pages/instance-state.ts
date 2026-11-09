import type { LaunchState } from '@shared/types'

/**
 * Launch state is global: the app runs at most one game or server, and
 * `instanceId` names it. Per-instance controls must compare that id instead of
 * trusting `status` alone, otherwise a stopped server's console looks live
 * (and `serverCommand` writes to whichever server is actually running).
 */
export function isInstanceRunning(
  launchState: Pick<LaunchState, 'status' | 'instanceId'>,
  instanceId: string | null | undefined
): boolean {
  return Boolean(instanceId) && launchState.instanceId === instanceId && launchState.status === 'running'
}
