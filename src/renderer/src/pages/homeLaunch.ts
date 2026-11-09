import type { LaunchState } from '@shared/types'

/**
 * Home can request a launch from two places: the hero button and each Recent
 * instance row. The hero is disabled while a launch is preparing, but the row
 * buttons were not, so a row click could start a second launch.
 *
 * The launcher only rejects a duplicate once its child process exists
 * (`LaunchService.launch` checks `this.child`). During `preparing` no child
 * exists yet: install, token refresh, chat session and argument building all
 * run first, which can take seconds even for an installed instance. A second
 * request in that window runs a parallel install and spawns a second JVM; the
 * second spawn overwrites the tracked child, so the first process is orphaned
 * and cannot be stopped.
 *
 * Keep every Home launch control on one predicate that matches what the
 * launcher can accept: no process running and no launch preparing.
 */
export function canLaunchFromHome(gameRunning: boolean, status: LaunchState['status']): boolean {
  return !gameRunning && status !== 'preparing'
}
