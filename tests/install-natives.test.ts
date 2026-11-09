import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { Installer, type InstalledGame } from '../src/core/install'
import type { InstanceConfig } from '../src/shared/types'

const installer = new Installer(
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
  null as never
)

function instance(overrides: Partial<InstanceConfig> = {}): InstanceConfig {
  return {
    id: 'demo',
    name: 'Demo',
    mcVersion: '1.21.1',
    loader: 'vanilla',
    ...overrides
  } as unknown as InstanceConfig
}

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-install-natives-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeCache(dir: string, cached: Partial<InstalledGame>): Promise<void> {
  const installed: InstalledGame = {
    versionId: '1.21.1',
    baseVersionId: '1.21.1',
    version: { id: '1.21.1', mainClass: 'net.minecraft.client.main.Main' },
    jarPath: join(dir, 'client.jar'),
    classpath: [join(dir, 'library.jar')],
    natives: [],
    assetIndexId: '17',
    javaMajor: 21,
    ...cached
  }
  await writeFile(join(dir, '.install-cache.json'), JSON.stringify(installed), 'utf8')
}

async function writeNativeJar(path: string, files: Record<string, string>): Promise<void> {
  const zip = new AdmZip()
  for (const [name, contents] of Object.entries(files)) zip.addFile(name, Buffer.from(contents))
  zip.writeZip(path)
}

describe('install cache native artifacts', () => {
  it('accepts a cache whose client, libraries and native archives exist', async () => {
    await withDir(async (dir) => {
      const native = join(dir, 'native.jar')
      await writeFile(join(dir, 'client.jar'), 'client')
      await writeFile(join(dir, 'library.jar'), 'library')
      await writeFile(native, 'native')
      await writeCache(dir, { natives: [{ path: native }] })

      await expect(installer.tryLoadCache(instance(), dir)).resolves.not.toBeNull()
    })
  })

  it('rejects a cache when a native archive is missing', async () => {
    await withDir(async (dir) => {
      await writeFile(join(dir, 'client.jar'), 'client')
      await writeFile(join(dir, 'library.jar'), 'library')
      await writeCache(dir, { natives: [{ path: join(dir, 'native.jar') }] })

      await expect(installer.tryLoadCache(instance(), dir)).resolves.toBeNull()
    })
  })
})

describe('extractNatives', () => {
  it('replaces the previous natives directory only after a full extraction', async () => {
    await withDir(async (dir) => {
      const native = join(dir, 'native.jar')
      const destination = join(dir, 'natives')
      await writeNativeJar(native, { 'lwjgl.dll': 'new' })
      await mkdir(destination, { recursive: true })
      await writeFile(join(destination, 'stale.txt'), 'stale')

      await installer.extractNatives([{ path: native }], destination)

      expect(await readFile(join(destination, 'lwjgl.dll'), 'utf8')).toBe('new')
      await expect(readFile(join(destination, 'stale.txt'))).rejects.toThrow()
      expect((await readdir(dir)).filter((name) => name.startsWith('.natives-'))).toEqual([])
    })
  })

  it('keeps the previous natives directory when a later archive fails', async () => {
    await withDir(async (dir) => {
      const good = join(dir, 'good.jar')
      const bad = join(dir, 'bad.jar')
      const destination = join(dir, 'natives')
      await writeNativeJar(good, { 'lwjgl.dll': 'new' })
      await writeFile(bad, 'not a zip')
      await mkdir(destination, { recursive: true })
      await writeFile(join(destination, 'keep.txt'), 'keep')

      await expect(
        installer.extractNatives([{ path: good }, { path: bad }], destination)
      ).rejects.toThrow()

      expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe('keep')
      await expect(readFile(join(destination, 'lwjgl.dll'))).rejects.toThrow()
      expect((await readdir(dir)).filter((name) => name.startsWith('.natives-'))).toEqual([])
    })
  })

  it('fails instead of silently skipping a missing native archive', async () => {
    await withDir(async (dir) => {
      const destination = join(dir, 'natives')
      await mkdir(destination, { recursive: true })
      await writeFile(join(destination, 'keep.txt'), 'keep')

      await expect(
        installer.extractNatives([{ path: join(dir, 'missing.jar') }], destination)
      ).rejects.toThrow(/native library archive/i)

      expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe('keep')
    })
  })
})
