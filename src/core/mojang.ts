import { readFile } from 'node:fs/promises'
import { DownloadItem, Downloader } from './http'
import { ensureDir, pathExists, readJson, writeJson } from './fsutil'
import { Paths } from './paths'
import { vanillaMinecraftRoot } from './vanilla'
import type { VersionJson } from './version'
import type { VersionSummary } from '../shared/types'
import { Logger } from './logger'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const MANIFEST_TTL_MS = 10 * 60 * 1000

export interface ManifestVersion {
  id: string
  type: string
  url: string
  time: string
  releaseTime: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestVersion[]
  fetchedAt?: number
}

export class MojangMeta {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader,
    private readonly logger: Logger
  ) {}

  private manifestPath(): string {
    return `${this.paths.meta}/version_manifest_v2.json`
  }

  async manifest(force = false): Promise<Manifest> {
    const cached = await readJson<Manifest | null>(this.manifestPath(), null)
    if (!force && cached && cached.fetchedAt && Date.now() - cached.fetchedAt < MANIFEST_TTL_MS) {
      return cached
    }
    try {
      const fresh = await this.downloader.fetchJson<Manifest>(MANIFEST_URL)
      fresh.fetchedAt = Date.now()
      await writeJson(this.manifestPath(), fresh)
      return fresh
    } catch (error) {
      if (cached) {
        this.logger.warn('Using cached version manifest after fetch failure', String(error))
        return cached
      }
      throw error
    }
  }

  async listVersions(includeSnapshots: boolean): Promise<VersionSummary[]> {
    const manifest = await this.manifest()
    return manifest.versions
      .filter((v) => includeSnapshots || v.type === 'release')
      .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
  }

  async latestRelease(): Promise<string> {
    return (await this.manifest()).latest.release
  }

  async versionDescriptor(id: string): Promise<ManifestVersion | undefined> {
    const manifest = await this.manifest()
    return manifest.versions.find((v) => v.id === id)
  }

  versionJsonPath(id: string): string {
    return `${this.paths.versions}/${id}/${id}.json`
  }

  clientJarPath(id: string): string {
    return `${this.paths.versions}/${id}/${id}.jar`
  }

  async fetchVersionJson(id: string): Promise<VersionJson> {
    const local = this.versionJsonPath(id)
    if (await pathExists(local)) {
      const parsed = JSON.parse(await readFile(local, 'utf8')) as VersionJson
      if (parsed.libraries) return parsed
    }
    const descriptor = await this.versionDescriptor(id)
    if (!descriptor) throw new Error(`Unknown Minecraft version: ${id}`)
    await ensureDir(`${this.paths.versions}/${id}`)
    const json = await this.downloader.fetchJson<VersionJson>(descriptor.url)
    await writeJson(local, json)
    return json
  }

  async downloadClient(version: VersionJson, mirror: boolean): Promise<string> {
    const dest = this.clientJarPath(version.id)
    const client = version.downloads?.client
    if (!client) throw new Error(`Version ${version.id} has no client download`)
    const vanilla = vanillaMinecraftRoot()
    const item: DownloadItem = {
      url: client.url,
      dest,
      sha1: client.sha1,
      size: client.size,
      label: `Minecraft ${version.id} client`,
      mirror: mirror && vanilla ? `${vanilla}/versions/${version.id}/${version.id}.jar` : undefined
    }
    await this.downloader.downloadAll([item])
    return dest
  }

  serverJarPath(id: string): string {
    return `${this.paths.versions}/${id}/${id}-server.jar`
  }

  async downloadServer(version: VersionJson): Promise<string> {
    const dest = this.serverJarPath(version.id)
    const server = version.downloads?.server
    if (!server) throw new Error(`Version ${version.id} has no server download`)
    const item: DownloadItem = {
      url: server.url,
      dest,
      sha1: server.sha1,
      size: server.size,
      label: `Minecraft ${version.id} server`
    }
    await this.downloader.downloadAll([item])
    return dest
  }
}


