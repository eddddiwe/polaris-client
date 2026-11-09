import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Installer, type InstalledGame } from '../src/core/install'
import { JVM_FLAGS_VERSION } from '../src/core/performance'
import type { InstanceConfig, Settings } from '../src/shared/types'

// loadCachedArgs is the only gate between a mod-writable cache file and the
// JVM argv, so these tests pin its "re-derive, then compare" contract.
const installer = Object.create(Installer.prototype) as Installer
let dir: string

function makeInstance(overrides: Partial<InstanceConfig> = {}): InstanceConfig {
  return {
    id: 'test-instance',
    name: 'Test',
    mcVersion: '26.3',
    loader: 'vanilla',
    createdAt: 0,
    playtimeMs: 0,
    memoryMb: 6144,
    perfProfile: 'balanced',
    jvmPreset: 'aikar',
    customJvmArgs: '',
    width: 1280,
    height: 720,
    fullscreen: false,
    extraGameArgs: '',
    packs: [],
    autoUpdate: false,
    accent: '#7c5cff',
    notes: '',
    ...overrides
  }
}

function cachePath(): string {
  return join(dir, '.args-cache.json')
}

async function writeCache(patch: Record<string, unknown>): Promise<void> {
  const base = JSON.parse(await readFile(cachePath(), 'utf8')) as Record<string, unknown>
  await writeFile(cachePath(), JSON.stringify({ ...base, ...patch }), 'utf8')
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'polaris-install-cache-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('install argument cache', () => {
  it('reuses the exact flags written by precomputeArgs', async () => {
    const instance = makeInstance()
    const expected = await installer.precomputeArgs(
      instance,
      dir,
      {} as InstalledGame,
      {} as Settings,
      21
    )

    await expect(installer.loadCachedArgs(dir, instance, 21)).resolves.toEqual(expected)
  })

  it('rejects added or altered JVM arguments before they can reach spawn', async () => {
    const instance = makeInstance()
    const expected = await installer.precomputeArgs(
      instance,
      dir,
      {} as InstalledGame,
      {} as Settings,
      21
    )

    await writeCache({ jvmTuning: [...expected, '-javaagent:payload.jar'] })
    await expect(installer.loadCachedArgs(dir, instance, 21)).resolves.toBeNull()

    const altered = expected.map((arg) => (arg.startsWith('-Xmx') ? '-Xmx16G' : arg))
    await writeCache({ jvmTuning: altered })
    await expect(installer.loadCachedArgs(dir, instance, 21)).resolves.toBeNull()
  })

  it('invalidates the cache when an instance or runtime input changes', async () => {
    const instance = makeInstance()
    await installer.precomputeArgs(instance, dir, {} as InstalledGame, {} as Settings, 21)

    const staleInputs: Array<Record<string, unknown>> = [
      { memoryMb: 8192 },
      { jvmPreset: 'zgc' },
      { customJvmArgs: '-XX:+AlwaysPreTouch' },
      { javaMajor: 17 },
      { flagsVersion: JVM_FLAGS_VERSION - 1 },
      { systemRamMb: 0 }
    ]
    for (const patch of staleInputs) {
      await writeCache(patch)
      await expect(installer.loadCachedArgs(dir, instance, 21)).resolves.toBeNull()
    }

    await writeFile(cachePath(), '{not json', 'utf8')
    await expect(installer.loadCachedArgs(dir, instance, 21)).resolves.toBeNull()
  })
})
