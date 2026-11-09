import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isVerifiedBundledMod } from '../src/core/bundledTrust'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function fixture(): Promise<{ appPath: string; instanceDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-bundled-'))
  dirs.push(dir)
  const appPath = join(dir, 'app')
  const instanceDir = join(dir, 'instance')
  await mkdir(join(appPath, 'resources', 'mods'), { recursive: true })
  await mkdir(join(instanceDir, 'mods'), { recursive: true })
  return { appPath, instanceDir }
}

describe('bundled mod trust', () => {
  it('accepts only an installed jar with the bundled bytes', async () => {
    const { appPath, instanceDir } = await fixture()
    const name = 'polaris-chat-1.0.0.jar'
    const bundled = join(appPath, 'resources', 'mods', name)
    const installed = join(instanceDir, 'mods', name)
    await writeFile(bundled, 'trusted jar bytes')
    await writeFile(installed, 'trusted jar bytes')
    await expect(isVerifiedBundledMod(appPath, instanceDir, name)).resolves.toBe(true)

    await writeFile(installed, 'different jar bytes')
    await expect(isVerifiedBundledMod(appPath, instanceDir, name)).resolves.toBe(false)
  })

  it('fails closed when either copy is missing or the name is empty', async () => {
    const { appPath, instanceDir } = await fixture()
    await expect(isVerifiedBundledMod(appPath, instanceDir, 'polaris-chat-1.0.0.jar')).resolves.toBe(false)
    await expect(isVerifiedBundledMod(appPath, instanceDir, '')).resolves.toBe(false)
  })
})
