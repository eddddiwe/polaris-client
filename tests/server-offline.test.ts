import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ServerService } from '../src/core/server'
import { ProgressHub } from '../src/core/events'
import { Logger } from '../src/core/logger'
import type { InstanceConfig } from '../src/shared/types'

function serverInstance(patch: Partial<InstanceConfig> = {}): InstanceConfig {
  return {
    id: 'server-one',
    name: 'Offline server',
    mcVersion: '1.21.10',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    kind: 'server',
    createdAt: 0,
    playtimeMs: 0,
    memoryMb: 4096,
    perfProfile: 'balanced',
    jvmPreset: 'aikar',
    customJvmArgs: '',
    width: 1280,
    height: 720,
    fullscreen: false,
    extraGameArgs: '',
    packs: [],
    autoUpdate: false,
    accent: '#7c5cff',
    notes: '',
    eulaAccepted: true,
    ...patch
  }
}

interface Harness {
  root: string
  service: ServerService
  jarPath: string
  fabric: { serverLauncherUrl: ReturnType<typeof vi.fn> }
  downloader: { downloadAll: ReturnType<typeof vi.fn> }
}

async function harness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'polaris-server-offline-'))
  const jarDir = join(root, 'versions', 'fabric-server')
  await mkdir(jarDir, { recursive: true })
  await mkdir(join(root, 'instances', 'server-one'), { recursive: true })
  const jarPath = join(jarDir, 'fabric-server-1.21.10-0.16.9.jar')
  await writeFile(jarPath, 'fabric server launcher')

  const fabric = {
    serverLauncherUrl: vi.fn(async () => {
      throw new Error('offline: Fabric Meta is unreachable')
    })
  }
  const downloader = {
    downloadAll: vi.fn(async () => {
      throw new Error('offline: download is unreachable')
    })
  }
  const mojang = {
    fetchVersionJson: vi.fn(async () => ({ id: '1.21.10', javaVersion: { majorVersion: 21 } }))
  }
  const service = new ServerService(
    { versions: join(root, 'versions'), instances: join(root, 'instances') } as never,
    downloader as never,
    mojang as never,
    fabric as never,
    new ProgressHub(),
    new Logger(join(root, 'logs'))
  )
  return { root, service, jarPath, fabric, downloader }
}

async function cleanup(h: Harness): Promise<void> {
  await rm(h.root, { recursive: true, force: true })
}

describe('ServerService offline start', () => {
  it('uses the installed Fabric launcher without asking Fabric Meta', async () => {
    const h = await harness()
    try {
      const runtime = await h.service.ensureRuntime(serverInstance())
      expect(runtime.jarPath).toBe(h.jarPath)
      expect(runtime.loaderVersion).toBe('0.16.9')
      expect(h.fabric.serverLauncherUrl).not.toHaveBeenCalled()
      expect(h.downloader.downloadAll).not.toHaveBeenCalled()
    } finally {
      await cleanup(h)
    }
  })

  it('recovers the loader version from the installed jar name when the config lost it', async () => {
    const h = await harness()
    try {
      const runtime = await h.service.ensureRuntime(
        serverInstance({ loaderVersion: undefined })
      )
      expect(runtime.jarPath).toBe(h.jarPath)
      expect(runtime.loaderVersion).toBe('0.16.9')
      expect(h.fabric.serverLauncherUrl).not.toHaveBeenCalled()
    } finally {
      await cleanup(h)
    }
  })

  it('does not treat an empty launcher file as installed', async () => {
    const h = await harness()
    try {
      await writeFile(h.jarPath, '')
      await expect(h.service.ensureRuntime(serverInstance())).rejects.toThrow(
        /Fabric Meta is unreachable/
      )
      expect(h.fabric.serverLauncherUrl).toHaveBeenCalledTimes(1)
    } finally {
      await cleanup(h)
    }
  })
})
