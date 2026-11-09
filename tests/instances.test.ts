import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InstanceStore } from '../src/core/instances'
import type { Paths } from '../src/core/paths'
import type { InstanceConfig } from '../src/shared/types'

function makePaths(root: string): Paths {
  return {
    root,
    settings: join(root, 'settings.json'),
    accounts: join(root, 'accounts.json'),
    instances: join(root, 'instances'),
    versions: join(root, 'versions'),
    libraries: join(root, 'libraries'),
    assets: join(root, 'assets'),
    meta: join(root, 'meta'),
    java: join(root, 'java'),
    cache: join(root, 'cache'),
    logs: join(root, 'logs'),
    downloads: join(root, 'downloads')
  }
}

function config(id: string): InstanceConfig {
  return {
    id,
    name: 'Test instance',
    mcVersion: '1.21.11',
    loader: 'vanilla',
    kind: 'game',
    createdAt: 1,
    playtimeMs: 0,
    memoryMb: 2048,
    perfProfile: 'balanced',
    jvmPreset: 'aikar',
    customJvmArgs: '',
    width: 1280,
    height: 720,
    fullscreen: false,
    extraGameArgs: '',
    packs: ['performance'],
    autoUpdate: true,
    accent: '#7c5cff',
    notes: ''
  }
}

describe('instance store updates', () => {
  it('keeps both fields when two updates race', async () => {
    const root = await mkdtemp(join(tmpdir(), 'polaris-instances-'))
    const id = 'test-instance'
    const dir = join(root, 'instances', id)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'instance.json'), JSON.stringify(config(id)), 'utf8')
      const store = new InstanceStore(makePaths(root))

      const results = await Promise.allSettled([
        store.update(id, { playtimeMs: 12_345 }),
        store.update(id, { memoryMb: 6144 })
      ])

      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
      const saved = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8')) as InstanceConfig
      expect(saved.playtimeMs).toBe(12_345)
      expect(saved.memoryMb).toBe(6144)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
