import { randomBytes } from 'node:crypto'
import { copyFile, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CreateInstanceInput, InstanceConfig, InstanceSummary } from '../shared/types'
import { assertSafeSegment, dirSize, ensureDir, isSafeSegment, pathExists, readJson, writeJson } from './fsutil'
import { ensureServersDat } from './nbt'
import type { Paths } from './paths'
import type { Settings } from '../shared/types'

const POLARIS_CONFIG_INTERMEDIARY = 'polaris-config-1.2.0.jar'
const POLARIS_CONFIG_MODERN = 'polaris-config-1.2.0-modern.jar'
const POLARIS_CONFIG_OFFICIAL = 'polaris-config-1.2.0-official.jar'
const POLARIS_CONFIG_PATTERN = /^polaris-config-.*\.jar$/i

function polarisConfigFile(mcVersion: string): string {
  const [major = 0, minor = 0, patch = 0] = mcVersion.split('.').map(Number)
  if (major >= 26) return POLARIS_CONFIG_OFFICIAL
  // 1.21.11 changed mouse/key input to event objects.
  if (major === 1 && (minor > 21 || (minor === 21 && patch >= 11))) return POLARIS_CONFIG_MODERN
  return POLARIS_CONFIG_INTERMEDIARY
}

export class InstanceStore {
  constructor(private readonly paths: Paths) {}

  dir(id: string): string {
    if (!isSafeSegment(id)) throw new Error('Invalid instance id')
    return join(this.paths.instances, id)
  }

  configPath(id: string): string {
    return join(this.dir(id), 'instance.json')
  }

  async list(isRunning: (id: string) => boolean): Promise<InstanceSummary[]> {
    let ids: string[] = []
    try {
      ids = await readdir(this.paths.instances)
    } catch {
      return []
    }
    const summaries: InstanceSummary[] = []
    for (const id of ids) {
      if (!isSafeSegment(id)) continue
      const config = await readJson<InstanceConfig | null>(this.configPath(id), null)
      if (!config) continue
      await this.syncPolarisConfig(config, false)
      const modsDir = join(this.dir(id), 'mods')
      const modFiles = await safeReaddir(modsDir)
      summaries.push({
        ...config,
        modCount: modFiles.filter((file) => file.endsWith('.jar')).length,
        running: isRunning(id),
        installed: await this.isInstalled(config),
        diskBytes: await dirSize(this.dir(id))
      })
    }
    return summaries.sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
  }

  async listIds(): Promise<string[]> {
    try {
      const { readdir } = await import('node:fs/promises')
      const ids = await readdir(this.paths.instances)
      return ids.filter((id) => isSafeSegment(id))
    } catch {
      return []
    }
  }

  async get(id: string): Promise<InstanceConfig> {
    const config = await readJson<InstanceConfig | null>(this.configPath(id), null)
    if (!config) throw new Error(`Instance not found: ${id}`)
    return config
  }

  async create(input: CreateInstanceInput, settings: Settings, defaults: { memoryMb: number }): Promise<InstanceConfig> {
    assertSafeSegment(input.mcVersion, 'Minecraft version')
    if (input.loader !== 'vanilla' && input.loader !== 'fabric') throw new Error('Unsupported loader')
    const kind = input.kind === 'server' ? 'server' : 'game'
    const id = await this.uniqueId(input.name)
    const requestedMemory = Number(input.memoryMb ?? settings.memoryMb ?? defaults.memoryMb)
    const config: InstanceConfig = {
      id,
      name: input.name.trim() || (kind === 'server' ? 'New server' : 'New instance'),
      mcVersion: input.mcVersion,
      loader: input.loader,
      kind,
      createdAt: Date.now(),
      playtimeMs: 0,
      memoryMb: Math.min(32768, Math.max(1024, Math.round(Number.isFinite(requestedMemory) ? requestedMemory : defaults.memoryMb))),
      perfProfile: input.perfProfile ?? 'balanced',
      jvmPreset: 'aikar',
      customJvmArgs: '',
      width: 1280,
      height: 720,
      fullscreen: false,
      extraGameArgs: '',
      packs: input.packs ?? (kind === 'server' ? ['server'] : ['performance', 'qol']),
      autoUpdate: settings.autoUpdateMods,
      accent: pickAccent(id),
      notes: '',
      icon: input.icon,
      port: kind === 'server' ? clampPort(input.port) : undefined,
      eulaAccepted: kind === 'server' ? Boolean(input.eulaAccepted) : undefined
    }
    await this.ensureLayout(id)
    await writeJson(this.configPath(id), config)
    await this.syncPolarisConfig(config, true)
    return config
  }

  async update(id: string, patch: Partial<InstanceConfig>): Promise<InstanceConfig> {
    if (patch.mcVersion !== undefined) assertSafeSegment(patch.mcVersion, 'Minecraft version')
    if (patch.loaderVersion !== undefined) assertSafeSegment(patch.loaderVersion, 'Fabric loader version')
    if (patch.loader !== undefined && patch.loader !== 'vanilla' && patch.loader !== 'fabric') {
      throw new Error('Unsupported loader')
    }
    if (patch.kind !== undefined && patch.kind !== 'game' && patch.kind !== 'server') {
      throw new Error('Unsupported instance kind')
    }
    if (patch.port !== undefined) patch = { ...patch, port: clampPort(patch.port) }
    if (patch.memoryMb !== undefined) {
      patch = { ...patch, memoryMb: Math.min(32768, Math.max(1024, Math.round(Number(patch.memoryMb) || 2048))) }
    }
    const current = await this.get(id)
    const next: InstanceConfig = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt
    }
    await writeJson(this.configPath(id), next)
    return next
  }

  async remove(id: string): Promise<void> {
    await rm(this.dir(id), { recursive: true, force: true })
  }

  async ensureLayout(id: string): Promise<void> {
    const root = this.dir(id)
    for (const folder of ['mods', 'config', 'logs', 'saves', 'resourcepacks', 'shaderpacks', 'screenshots', 'natives']) {
      await ensureDir(join(root, folder))
    }
    await ensureServersDat(root)
  }

  /**
   * Install or migrate the bundled PolarisConfig mod. Existing installs with a
   * PolarisConfig jar are upgraded; deleting the mod keeps it deleted. New
   * instances always get the build that matches their mapping family.
   */
  private async syncPolarisConfig(config: InstanceConfig, installIfMissing: boolean): Promise<void> {
    if (config.kind !== 'game' || config.loader !== 'fabric') return
    try {
      const { app } = await import('electron')
      const sourceName = polarisConfigFile(config.mcVersion)
      const source = join(app.getAppPath(), 'resources', 'mods', sourceName)
      if (!(await pathExists(source))) return

      const modsDir = join(this.dir(config.id), 'mods')
      const existing = (await safeReaddir(modsDir)).filter((name) => POLARIS_CONFIG_PATTERN.test(name))
      if (!existing.length && !installIfMissing) return

      const dest = join(modsDir, sourceName)
      const [sourceStat, destStat] = await Promise.all([
        stat(source),
        stat(dest).catch(() => null)
      ])
      if (!destStat || destStat.size !== sourceStat.size) {
        await copyFile(source, dest)
      }
      for (const name of existing) {
        if (name !== sourceName) await rm(join(modsDir, name), { force: true })
      }
    } catch {
      // Optional bundled mod; never block instance listing or creation.
    }
  }

  async isInstalled(config: InstanceConfig): Promise<boolean> {
    if (config.kind === 'server') {
      if (config.loader === 'fabric') {
        if (!config.loaderVersion) return false
        return pathExists(
          join(this.paths.versions, 'fabric-server', `fabric-server-${config.mcVersion}-${config.loaderVersion}.jar`)
        )
      }
      return pathExists(join(this.paths.versions, config.mcVersion, `${config.mcVersion}-server.jar`))
    }
    if (config.loader === 'fabric') {
      const profile = join(this.paths.versions, `fabric-loader-${config.loaderVersion ?? ''}-${config.mcVersion}`)
      return pathExists(profile)
    }
    return pathExists(join(this.paths.versions, config.mcVersion, `${config.mcVersion}.jar`))
  }

  private async uniqueId(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'instance'
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = `${base}-${randomBytes(3).toString('hex')}`
      if (!(await pathExists(this.dir(id)))) return id
    }
    return `${base}-${Date.now().toString(36)}`
  }
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

const ACCENTS = ['#7c5cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185']
function pickAccent(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ACCENTS[hash % ACCENTS.length]
}

function clampPort(value: number | undefined): number {
  const port = Math.round(Number(value ?? 25565))
  return Number.isFinite(port) && port >= 1024 && port <= 65535 ? port : 25565
}
