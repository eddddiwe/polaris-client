/** Runs a process and resolves its exit code; never expected to reject. */
export type TaskRunner = (command: string, args: string[], timeoutMs: number) => Promise<number>

/**
 * Remove any previous Polaris update helper task before registering a new
 * one. `schtasks /Create /F` replaces the task definition but leaves an
 * already running instance alive; the task XML uses IgnoreNew, so a later
 * `/Run` then reports success without starting the new helper. Ending the old
 * instance first is also what prevents it from deleting the new registration
 * in its own cleanup pass.
 *
 * Both calls are best-effort: a missing or idle task exits non-zero, which is
 * expected. Failures must not block the verified-installer fallback.
 */
export async function resetUpdateTask(run: TaskRunner, taskName: string): Promise<void> {
  await run('schtasks.exe', ['/End', '/TN', taskName], 10_000).catch(() => -1)
  await run('schtasks.exe', ['/Delete', '/TN', taskName, '/F'], 10_000).catch(() => -1)
}
