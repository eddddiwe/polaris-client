import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceConfig } from '../shared/types'
import type { Paths } from './paths'
import type { Downloader } from './http'
import type { Logger } from './logger'
import type { ProgressHub } from './events'
import type { MojangMeta } from './mojang'
import type { FabricMeta } from './fabric'
import { requiredJavaMajor } from './version'
import { ensureDir, isSafeSegment, pathExists, writeTextAtomic } from './fsutil'

export interface ServerRuntime {
  jarPath: string
  loaderVersion?: string
  javaMajor: number
}

/**
 * Prepares dedicated-server files: the vanilla server jar from Mojang or the
 * self-bootstrapping Fabric server launcher, plus eula.txt and a default
 * server.properties. The launcher jar downloads Fabric loader into the server
 * folder on first run, so nothing else is pre-installed here.
 */
export class ServerService {
  constructor(
    private readonly paths: Paths,
    private readonly downloader: Downloader,
    private readonly mojang: MojangMeta,
    private readonly fabric: FabricMeta,
    private readonly progress: ProgressHub,
    private readonly logger: Logger
  ) {}

  fabricJarPath(mcVersion: string, loaderVersion: string): string {
    return join(this.paths.versions, 'fabric-server', `fabric-server-${mcVersion}-${loaderVersion}.jar`)
  }

  async ensureRuntime(instance: InstanceConfig): Promise<ServerRuntime> {
    if (!instance.eulaAccepted) {
      throw new Error('Accept the Minecraft EULA on the server page before starting it.')
    }
    const taskId = `server-install:${instance.id}`
    const label = `Preparing ${instance.name}`
    this.progress.start(taskId, label)
    try {
      const base = await this.mojang.fetchVersionJson(instance.mcVersion)
      const javaMajor = requiredJavaMajor(base)
      let jarPath: string
      let loaderVersion = instance.loaderVersion
      if (instance.loader === 'fabric') {
        const installed = await this.installedFabricServer(instance.mcVersion, instance.loaderVersion)
        if (installed) {
          // Already installed: start from the cached launcher instead of
          // re-querying Fabric Meta, so an offline restart still works.
          jarPath = installed.jarPath
          loaderVersion = installed.loaderVersion
        } else {
          const resolved = await this.fabric.serverLauncherUrl(instance.mcVersion, instance.loaderVersion)
          loaderVersion = resolved.loaderVersion
          jarPath = this.fabricJarPath(instance.mcVersion, loaderVersion)
          this.progress.emit({ taskId, label, detail: 'Downloading Fabric server launcher', current: 0, total: 1, done: false })
          await this.downloader.downloadAll([
            { url: resolved.url, dest: jarPath, label: `Fabric server launcher ${loaderVersion}` }
          ])
        }
      } else {
        this.progress.emit({ taskId, label, detail: `Fetching Minecraft ${instance.mcVersion} server`, current: 0, total: 1, done: false })
        jarPath = await this.mojang.downloadServer(base)
      }

      const dir = join(this.paths.instances, instance.id)
      await ensureDir(dir)
      await ensureDir(join(dir, 'logs'))
      await writeTextAtomic(join(dir, 'eula.txt'), '# Accepted through Polaris\neula=true\n')
      await this.writeDefaultProperties(dir, instance)
      this.progress.done(taskId, label, 'Server files ready')
      return { jarPath, loaderVersion, javaMajor }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Server preparation failed', message)
      this.progress.fail(taskId, label, message)
      throw error
    }
  }

  /**
   * Reuse a Fabric server launcher that is already on disk. Without this an
   * offline restart asks Fabric Meta for the loader/installer even though the
   * verified jar is present. A missing loaderVersion is recovered from the
   * jar name because a crash after the download (or a failed first spawn)
   * never persists the resolved loader version.
   */
  private async installedFabricServer(
    mcVersion: string,
    loaderVersion?: string
  ): Promise<{ jarPath: string; loaderVersion: string } | null> {
    if (loaderVersion) {
      const jarPath = this.fabricJarPath(mcVersion, loaderVersion)
      return (await isUsableJar(jarPath)) ? { jarPath, loaderVersion } : null
    }
    const dir = join(this.paths.versions, 'fabric-server')
    const prefix = `fabric-server-${mcVersion}-`
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return null
    }
    for (const name of names.sort()) {
      if (!name.startsWith(prefix) || !name.endsWith('.jar')) continue
      const version = name.slice(prefix.length, -'.jar'.length)
      if (!isSafeSegment(version)) continue
      const jarPath = join(dir, name)
      if (await isUsableJar(jarPath)) return { jarPath, loaderVersion: version }
    }
    return null
  }

  /**
   * Writes a tuned server.properties. Existing files keep every user setting;
   * only server-port follows the instance port shown in the launcher.
   */
  private async writeDefaultProperties(dir: string, instance: InstanceConfig): Promise<void> {
    const file = join(dir, 'server.properties')
    const requested = instance.port
    const port =
      requested === undefined
        ? 25565
        : Number.isInteger(requested)
          ? Math.min(65535, Math.max(1, requested))
          : 25565
    if (await pathExists(file)) {
      // A legacy instance without a port has no authoritative value; leave the
      // user's server.properties untouched instead of forcing 25565 over it.
      if (requested !== undefined) await this.syncServerPort(file, await readFile(file, 'utf8'), port)
      return
    }
    const lines = [
      '#Generated by Polaris — server-port follows the instance port; other settings are yours',
      `motd=A Polaris ${instance.loader === 'fabric' ? 'Fabric' : 'vanilla'} server`,
      `server-port=${port}`,
      'online-mode=true',
      'view-distance=10',
      'simulation-distance=8',
      'sync-chunk-writes=false',
      'network-compression-threshold=256',
      'max-tick-time=60000'
    ]
    await writeTextAtomic(file, `${lines.join('\n')}\n`)
  }

  /** Rewrites only the port line so manual properties edits survive. */
  private async syncServerPort(file: string, content: string, port: number): Promise<void> {
    const pattern = /^[ \t]*server-port[ \t]*=[^\r\n]*/gm
    if (pattern.test(content)) {
      const next = content.replace(pattern, `server-port=${port}`)
      if (next !== content) await writeTextAtomic(file, next)
      return
    }
    const newline = content.includes('\r\n') ? '\r\n' : '\n'
    const prefix = content.length > 0 && !content.endsWith('\n') ? `${content}${newline}` : content
    await writeTextAtomic(file, `${prefix}server-port=${port}${newline}`)
  }
}

/** A launcher jar is usable only if it is a non-empty regular file. */
async function isUsableJar(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}
