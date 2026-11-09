import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AssetManager, type AssetIndex } from '../src/core/assets'
import type { DownloadItem, Downloader } from '../src/core/http'
import type { Paths } from '../src/core/paths'
import type { VersionJson } from '../src/core/version'

function pathsFor(root: string): Paths {
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

function versionWith(indexId: string, sha1?: string): VersionJson {
  return {
    id: '1.21',
    mainClass: 'net.minecraft.client.main.Main',
    assetIndex: { id: indexId, url: `https://example.test/${indexId}.json`, sha1, size: 16 }
  }
}

/** Writes the served index on downloadAll; asset files are only recorded. */
function fakeDownloader(served: AssetIndex): { downloader: Downloader; calls: DownloadItem[] } {
  const calls: DownloadItem[] = []
  const downloader = {
    async downloadAll(items: DownloadItem[]) {
      for (const item of items) {
        calls.push(item)
        if (item.label?.startsWith('Asset index ')) {
          await mkdir(dirname(item.dest), { recursive: true })
          await writeFile(item.dest, JSON.stringify(served))
        }
      }
      return { downloaded: items.length, reused: 0 }
    }
  } as unknown as Downloader
  return { downloader, calls }
}

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'polaris-assets-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('AssetManager asset index cache', () => {
  it('replaces a corrupt cached index instead of failing every install', async () => {
    await withTempRoot(async (root) => {
      const { downloader, calls } = fakeDownloader({ objects: {} })
      const manager = new AssetManager(pathsFor(root), downloader)
      const indexFile = manager.indexJsonPath('34')
      await mkdir(dirname(indexFile), { recursive: true })
      await writeFile(indexFile, '{"objects":')

      await expect(manager.ensureAssets(versionWith('34', 'a'.repeat(40)), false)).resolves.toBe('34')

      expect(calls[0]?.dest).toBe(indexFile)
      expect(JSON.parse(await readFile(indexFile, 'utf8'))).toEqual({ objects: {} })
    })
  })

  it('rejects an index whose object hash would escape the objects directory', async () => {
    await withTempRoot(async (root) => {
      const malicious: AssetIndex = {
        objects: {
          'minecraft/lang/en_US.lang': { hash: '../../../../escape', size: 1 }
        }
      }
      const { downloader, calls } = fakeDownloader(malicious)
      const manager = new AssetManager(pathsFor(root), downloader)
      const indexFile = manager.indexJsonPath('34')
      await mkdir(dirname(indexFile), { recursive: true })

      await expect(manager.ensureAssets(versionWith('34', 'a'.repeat(40)), false)).rejects.toThrow(
        /Invalid asset index/
      )
      expect(calls.filter((item) => item.dest.includes('objects'))).toHaveLength(0)
    })
  })
})
