import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Downloader, DownloadProgress, assetUrl } from './http'
import { ensureDir, readJson } from './fsutil'
import { vanillaMinecraftRoot } from './vanilla'
import type { Paths } from './paths'
import type { VersionJson } from './version'

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

const SHA1 = /^[a-f0-9]{40}$/i

/**
 * Asset objects are content-addressed by SHA-1 and their hash is used as a
 * filesystem path. Reject anything else before it can escape objectsDir.
 */
export function isAssetObject(value: unknown): value is { hash: string; size: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as { hash?: unknown; size?: unknown }
  return (
    typeof object.hash === 'string' &&
    SHA1.test(object.hash) &&
    typeof object.size === 'number' &&
    Number.isSafeInteger(object.size) &&
    object.size >= 0
  )
}

/** A parsed asset index is only usable when every object entry is safe. */
export function isAssetIndex(value: unknown): value is AssetIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const objects = (value as { objects?: unknown }).objects
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return false
  for (const object of Object.values(objects as Record<string, unknown>)) {
    if (!isAssetObject(object)) return false
  }
  return true
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
    const cached = await readJson<AssetIndex | null>(dest, null)
    const usable = isAssetIndex(cached)
    // A cached index is not trusted just because it exists: a truncated or
    // edited file used to fail every install until the user deleted it.
    if (usable && !version.assetIndex?.sha1) return indexId
    if (!version.assetIndex?.url) {
      if (usable) return indexId
      throw new Error(`Missing asset index URL for ${indexId}`)
    }
    // downloadAll verifies the cached SHA-1/size and replaces a bad copy.
    if (!usable) await rm(dest, { force: true }).catch(() => undefined)
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
    if (!isAssetIndex(index)) throw new Error(`Invalid asset index: ${indexId}`)

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
