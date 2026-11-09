import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ appData: '/mock-appdata' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'appData' ? mocks.appData : `/mock-${name}`) }
}))

import { createPaths, resolveRoot } from '../src/core/paths'

const ENV_KEYS = ['POLARIS_HOME', 'PORTABLE_EXECUTABLE_DIR'] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('resolveRoot', () => {
  it('keeps POLARIS_HOME as the highest-priority override', () => {
    const custom = join(tmpdir(), 'polaris-custom-home')
    process.env.POLARIS_HOME = custom
    process.env.PORTABLE_EXECUTABLE_DIR = join(tmpdir(), 'polaris-portable-exe')
    expect(resolveRoot()).toBe(custom)
  })

  it('stores portable data beside the portable executable, not the temp extraction', () => {
    const portableDir = join(tmpdir(), 'polaris-portable-exe')
    process.env.PORTABLE_EXECUTABLE_DIR = portableDir
    expect(resolveRoot()).toBe(join(portableDir, 'data'))
  })

  it('falls back to appData when no override is present', () => {
    expect(resolveRoot()).toBe(join(mocks.appData, 'Polaris'))
  })
})

describe('createPaths', () => {
  it('derives every managed path from the resolved root', () => {
    const root = join(tmpdir(), 'polaris-root')
    const paths = createPaths(root)
    expect(paths.root).toBe(root)
    expect(paths.settings).toBe(join(root, 'settings.json'))
    expect(paths.accounts).toBe(join(root, 'accounts.json'))
    for (const dir of [
      paths.instances,
      paths.versions,
      paths.libraries,
      paths.assets,
      paths.meta,
      paths.java,
      paths.cache,
      paths.logs,
      paths.downloads
    ]) {
      expect(dir.startsWith(root)).toBe(true)
    }
  })
})
