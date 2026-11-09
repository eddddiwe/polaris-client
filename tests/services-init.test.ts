import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
    getPath: () => ''
  },
  shell: { openPath: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(() => Buffer.from('')),
    decryptString: vi.fn(() => '')
  }
}))

import { AppServices } from '../src/main/services'

const previousHome = process.env.POLARIS_HOME

afterEach(() => {
  if (previousHome === undefined) delete process.env.POLARIS_HOME
  else process.env.POLARIS_HOME = previousHome
})

describe('AppServices initialization failure', () => {
  it('rejects ready so bootstrap cannot report a partial data root as healthy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'polaris-init-fail-'))
    const blockedRoot = join(root, 'blocked')
    // A file where the data root should be makes every ensureDir() fail with
    // ENOTDIR, exactly like an unwritable/data-root-occupied-by-a-file install.
    await writeFile(blockedRoot, 'not a directory')
    process.env.POLARIS_HOME = blockedRoot
    try {
      const services = new AppServices()
      const outcome = await services.ready.then(
        () => null,
        (error: unknown) => error
      )
      // Before the fix initialize() swallowed this and ready resolved, so
      // bootstrap() reported settings/hardware defaults as a healthy client.
      expect(outcome).toBeInstanceOf(Error)
      expect(String(outcome)).toMatch(/ENOTDIR|not a directory/i)

      const bootstrapOutcome = await services.bootstrap().then(
        () => null,
        (error: unknown) => error
      )
      expect(bootstrapOutcome).toBeInstanceOf(Error)
      expect(String(bootstrapOutcome)).toMatch(/ENOTDIR|not a directory/i)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
