import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Downloader, DownloadProgress, assetUrl } from './http'
import { ensureDir, pathExists, readJson, writeJson } from './fsutil'
import { vanillaMinecraftRoot } from './vanilla'
import type { Paths } from './paths'
import type { VersionJson } from './version'

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

export class AssetManager {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader
  ) {}

  indexDir(): string {
    return `${this.paths.assets}/indexes`
  }

  objectsDir(): string {
    return `${this.paths.assets}/objects`
  }

  indexJsonPath(id: string): string {
    return `${this.indexDir()}/${id}.json`
  }

  async ensureIndex(version: VersionJson, mirror: boolean): Promise<string> {
    const indexId = version.assetIndex?.id ?? version.assets
    if (!indexId) throw new Error('Version has no asset index')
    const dest = this.indexJsonPath(indexId)
    if (await pathExists(dest)) return indexId
    if (!version.assetIndex?.url) throw new Error(`Missing asset index URL for ${indexId}`)
    await ensureDir(this.indexDir())
    await this.downloader.downloadAll([
      {
        url: version.assetIndex.url,
        dest,
        sha1: version.assetIndex.sha1,
        size: version.assetIndex.size,
        label: `Asset index ${indexId}`
      }
    ])
    return indexId
  }

  async ensureAssets(version: VersionJson, mirror: boolean, onProgress?: (p: DownloadProgress) => void): Promise<string> {
    const indexId = await this.ensureIndex(version, mirror)
    const index = await readJson<AssetIndex | null>(this.indexJsonPath(indexId), null)
    if (!index) throw new Error(`Unreadable asset index: ${indexId}`)

    const vanilla = vanillaMinecraftRoot()
    const items = Object.entries(index.objects).map(([name, object]) => {
      const prefix = object.hash.slice(0, 2)
      return {
        url: assetUrl(object.hash),
        dest: `${this.objectsDir()}/${prefix}/${object.hash}`,
        sha1: object.hash,
        size: object.size,
        label: name,
        mirror: mirror && vanilla ? join(vanilla, 'assets', 'objects', prefix, object.hash) : undefined
      }
    })
    await this.downloader.downloadAll(items, onProgress)

    if (index.virtual) await this.buildVirtual(indexId, index)
    return indexId
  }

  private async buildVirtual(indexId: string, index: AssetIndex): Promise<void> {
    const virtualRoot = `${this.paths.assets}/virtual/${indexId}`
    const mapping: Record<string, string> = {}
    for (const [name, object] of Object.entries(index.objects)) {
      mapping[name] = object.hash
    }
    await ensureDir(virtualRoot)
    await writeFile(`${virtualRoot}/.polaris-index.json`, JSON.stringify(mapping))
  }
}
