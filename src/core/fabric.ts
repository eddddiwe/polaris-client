import { Downloader } from './http'
import { pathExists, readJson, writeJson, ensureDir } from './fsutil'
import type { Paths } from './paths'
import type { VersionJson } from './version'

const FABRIC_META = 'https://meta.fabricmc.net/v2'

interface FabricLoaderEntry {
  loader: { version: string; stable: boolean; build: number; maven: string }
  intermediary: { version: string; stable: boolean; maven: string }
}

interface FabricInstallerEntry {
  url: string
  maven: string
  version: string
  stable: boolean
}

export interface FabricInstall {
  versionId: string
  loaderVersion: string
  profile: VersionJson
}

export class FabricMeta {
  private loaderCache = new Map<string, FabricLoaderEntry[]>()
  private installerVersion?: string

  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader
  ) {}

  async loaders(mcVersion: string): Promise<FabricLoaderEntry[]> {
    const cached = this.loaderCache.get(mcVersion)
    if (cached) return cached
    const list = await this.downloader.fetchJson<FabricLoaderEntry[]>(
      `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`
    )
    this.loaderCache.set(mcVersion, list)
    return list
  }

  async chooseLoader(mcVersion: string): Promise<string> {
    const loaders = await this.loaders(mcVersion)
    if (loaders.length === 0) throw new Error(`Fabric does not support Minecraft ${mcVersion} yet`)
    const stable = loaders.find((entry) => entry.loader.stable)
    return (stable ?? loaders[0]).loader.version
  }

  async profile(mcVersion: string, loaderVersion: string): Promise<VersionJson> {
    return await this.downloader.fetchJson<VersionJson>(
      `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
    )
  }

  async ensure(mcVersion: string, preferredLoader?: string): Promise<FabricInstall> {
    const loaderVersion = preferredLoader ?? (await this.chooseLoader(mcVersion))
    const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`
    const jsonPath = `${this.paths.versions}/${versionId}/${versionId}.json`
    if (!(await pathExists(jsonPath))) {
      const profile = await this.profile(mcVersion, loaderVersion)
      await ensureDir(`${this.paths.versions}/${versionId}`)
      await writeJson(jsonPath, profile)
    }
    const profile = await readJson<VersionJson | null>(jsonPath, null)
    if (!profile) throw new Error(`Failed to write Fabric profile for ${versionId}`)
    return { versionId, loaderVersion, profile }
  }

  async chooseInstaller(): Promise<string> {
    if (this.installerVersion) return this.installerVersion
    const installers = await this.downloader.fetchJson<FabricInstallerEntry[]>(`${FABRIC_META}/versions/installer`)
    const stable = installers.find((entry) => entry.stable)
    this.installerVersion = (stable ?? installers[0]).version
    return this.installerVersion
  }

  /**
   * URL of the self-bootstrapping Fabric server launcher for a game version.
   * The jar downloads loader and intermediary into the server folder on first run.
   */
  async serverLauncherUrl(mcVersion: string, loaderVersion?: string): Promise<{ url: string; loaderVersion: string }> {
    const loader = loaderVersion ?? (await this.chooseLoader(mcVersion))
    const installer = await this.chooseInstaller()
    return {
      url: `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loader)}/${encodeURIComponent(installer)}/server/jar`,
      loaderVersion: loader
    }
  }
}
