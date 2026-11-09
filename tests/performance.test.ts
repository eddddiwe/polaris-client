import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Hold both writes open long enough that a second applyOptions starts while
// the first is still between its read and its write.
vi.mock('../src/core/fsutil', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/fsutil')>()
  return {
    ...actual,
    writeTextAtomic: async (path: string, value: string) => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      await actual.writeTextAtomic(path, value)
    }
  }
})

import { applyOptions } from '../src/core/performance'

describe('options.txt writes', () => {
  it('serializes concurrent applies so neither update is lost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-options-race-'))
    try {
      await writeFile(join(dir, 'options.txt'), 'fov:70.0\nguiScale:2\n', 'utf8')
      const [first, second] = await Promise.all([
        applyOptions(dir, { renderDistance: '8', particles: '0' }),
        applyOptions(dir, { fov: '95.0', gamma: '0.7' })
      ])
      expect(first.changed).toBe(2)
      expect(second.changed).toBe(2)
      const text = await readFile(join(dir, 'options.txt'), 'utf8')
      expect(text).toContain('renderDistance:8')
      expect(text).toContain('particles:0')
      expect(text).toContain('fov:95.0')
      expect(text).toContain('gamma:0.7')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
