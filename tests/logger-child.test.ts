import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { opened } = vi.hoisted(() => ({
  opened: [] as Array<{
    destroyed: boolean
    write: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createWriteStream: vi.fn(() => {
      const stream = {
        destroyed: false,
        write: vi.fn(() => true),
        on: vi.fn(),
        destroy: vi.fn()
      }
      opened.push(stream)
      return stream
    })
  }
})

import { Logger } from '../src/core/logger'

const dirs: string[] = []

afterEach(async () => {
  opened.length = 0
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function logDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-logger-'))
  dirs.push(dir)
  return dir
}

describe('Logger child sinks', () => {
  it('opens one sink per log directory, not one per child', async () => {
    const root = new Logger(await logDir())
    expect(opened).toHaveLength(1)

    const http = root.child('http')
    root.child('auth')
    const nested = http.child('retry')

    // Every logger writes through the root's single stream; a second child
    // used to open (and leak) its own handle to launcher.log.
    expect(opened).toHaveLength(1)

    http.info('GET /version')
    nested.warn('retrying')
    expect(opened[0].write).toHaveBeenCalledWith(expect.stringContaining('[polaris:http] GET /version'))
    expect(opened[0].write).toHaveBeenCalledWith(expect.stringContaining('[polaris:http:retry] retrying'))
  })

  it('keeps a child usable after the root sink fails, without opening a new one', async () => {
    const root = new Logger(await logDir())
    const child = root.child('http')
    const sink = opened[0]

    sink.destroyed = true
    child.info('after failure')
    expect(opened).toHaveLength(1)
    expect(sink.write).not.toHaveBeenCalled()
  })
})
