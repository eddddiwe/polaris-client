import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Logger } from '../src/core/logger'

const dirs: string[] = []

async function makeLogDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-logger-'))
  dirs.push(dir)
  return dir
}

async function readLog(dir: string): Promise<string> {
  try {
    return await readFile(join(dir, 'launcher.log'), 'utf8')
  } catch {
    return ''
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Logger error context', () => {
  it('keeps message and stack for nested Error extras, without extra fields', async () => {
    const dir = await makeLogDir()
    const logger = new Logger(dir)
    const error = new Error('install exploded') as Error & { spawnargs?: string[] }
    // child_process errors can carry credential-bearing fields; they must not
    // be copied into the launcher log.
    error.spawnargs = ['--accessToken', 'super-secret-token']

    logger.error('Install failed', { instanceId: 'instance-1', error })

    await expect.poll(() => readLog(dir), { timeout: 2000 }).toContain('"message":"install exploded"')
    const log = await readLog(dir)
    expect(log).toContain('"stack":"Error: install exploded')
    expect(log).toContain('"instanceId":"instance-1"')
    expect(log).not.toContain('super-secret-token')
    expect(log).not.toContain('"error":{}')
  })

  it('serializes a top-level Error from a failed update check', async () => {
    const dir = await makeLogDir()
    const logger = new Logger(dir)

    logger.warn('Update check failed closed', new Error('update exploded'))

    await expect.poll(() => readLog(dir), { timeout: 2000 }).toContain('"message":"update exploded"')
    const log = await readLog(dir)
    expect(log).toContain('"stack":"Error: update exploded')
    expect(log).not.toContain('Update check failed closed {}')
  })
})
