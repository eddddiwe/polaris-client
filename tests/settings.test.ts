import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../src/core/settings'

// Pause every write so overlapping saves would collide on the shared .tmp file.
const writeState = vi.hoisted(() => ({ active: 0, maxActive: 0 }))

vi.mock('../src/core/fsutil', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/fsutil')>()
  return {
    ...actual,
    writeJson: async (path: string, value: unknown) => {
      writeState.active += 1
      writeState.maxActive = Math.max(writeState.maxActive, writeState.active)
      try {
        await new Promise((resolve) => setTimeout(resolve, 10))
        await actual.writeJson(path, value)
      } finally {
        writeState.active -= 1
      }
    }
  }
})

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  writeState.active = 0
  writeState.maxActive = 0
})

describe('SettingsStore saves', () => {
  it('serializes overlapping saves and persists the newest value', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-settings-'))
    dirs.push(dir)
    const file = join(dir, 'settings.json')
    const store = new SettingsStore(file, dir)
    await store.load()

    const updates = Array.from({ length: 8 }, (_, i) => store.update({ memoryMb: 2048 + i }))
    await expect(Promise.all(updates)).resolves.toHaveLength(8)

    expect(writeState.maxActive).toBe(1)
    const disk = JSON.parse(await readFile(file, 'utf8')) as { memoryMb: number }
    expect(disk.memoryMb).toBe(store.get().memoryMb)
    expect(disk.memoryMb).toBe(2055)
  })
})
