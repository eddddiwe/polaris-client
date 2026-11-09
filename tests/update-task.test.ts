import { describe, expect, it } from 'vitest'
import { resetUpdateTask } from '../src/main/updateTask'

const taskName = 'PolarisClientUpdate'

describe('Windows update task reset', () => {
  it('ends and deletes a stale helper before a new registration can be ignored', async () => {
    const calls: { command: string; args: string[]; timeoutMs: number }[] = []

    await resetUpdateTask(async (command, args, timeoutMs) => {
      calls.push({ command, args, timeoutMs })
      return 1
    }, taskName)

    // /End must precede /Delete and /Create: schtasks /Create /F leaves a
    // running instance alive, and IgnoreNew would swallow the next /Run.
    expect(calls).toEqual([
      { command: 'schtasks.exe', args: ['/End', '/TN', taskName], timeoutMs: 10_000 },
      { command: 'schtasks.exe', args: ['/Delete', '/TN', taskName, '/F'], timeoutMs: 10_000 }
    ])
  })

  it('still removes the task when /End fails because nothing is running', async () => {
    const calls: string[][] = []

    await resetUpdateTask(async (_command, args) => {
      calls.push(args)
      if (args[0] === '/End') throw new Error('task is not running')
      return 0
    }, taskName)

    expect(calls).toEqual([
      ['/End', '/TN', taskName],
      ['/Delete', '/TN', taskName, '/F']
    ])
  })
})
