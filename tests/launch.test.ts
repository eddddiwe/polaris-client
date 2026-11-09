import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LaunchService } from '../src/core/launch'
import type { InstalledGame, Installer } from '../src/core/install'
import type { AccountStore } from '../src/core/accounts'
import type { AuthService } from '../src/core/auth'
import type { ChatService } from '../src/core/chat'
import type { FriendStore } from '../src/core/friends'
import type { Logger } from '../src/core/logger'
import type { Paths } from '../src/core/paths'
import { defaultSettings } from '../src/core/settings'
import type { InstanceConfig } from '../src/shared/types'

function makePaths(root: string): Paths {
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

function makeInstance(): InstanceConfig {
  return {
    id: 'test',
    name: 'Test',
    mcVersion: '1.21.1',
    loader: 'vanilla',
    createdAt: Date.now(),
    playtimeMs: 0,
    memoryMb: 2048,
    perfProfile: 'balanced',
    jvmPreset: 'aikar',
    customJvmArgs: '',
    width: 854,
    height: 480,
    fullscreen: false,
    extraGameArgs: '',
    packs: [],
    autoUpdate: false,
    accent: '#7c5cff',
    notes: ''
  }
}

function makeService(root: string): {
  service: LaunchService
  instance: InstanceConfig
  installCalls: () => number
  releaseInstall: () => void
  installEntered: Promise<void>
} {
  const installed: InstalledGame = {
    versionId: '1.21.1',
    baseVersionId: '1.21.1',
    version: { id: '1.21.1', mainClass: 'example.Main', assets: '1' },
    jarPath: join(root, 'client.jar'),
    classpath: [],
    natives: [],
    assetIndexId: '1',
    javaMajor: 21
  }
  let releaseInstall = (): void => undefined
  const gate = new Promise<InstalledGame>((resolve) => {
    releaseInstall = () => resolve(installed)
  })
  let count = 0
  let installEntered = (): void => undefined
  const entered = new Promise<void>((resolve) => {
    installEntered = resolve
  })
  const installer = {
    tryLoadCache: async () => null,
    install: async () => {
      count += 1
      installEntered()
      return gate
    },
    saveCache: async () => undefined,
    extractNatives: async () => undefined,
    loadCachedArgs: async () => [],
    precomputeArgs: async () => []
  } as unknown as Installer
  const accounts = {
    activeStored: () => ({
      id: 'offline:test',
      type: 'offline',
      name: 'Tester',
      uuid: '00000000-0000-0000-0000-000000000001',
      active: true
    })
  } as unknown as AccountStore
  const auth = {
    refreshIfNeeded: async (stored: { name: string; uuid: string }) => ({
      name: stored.name,
      uuid: stored.uuid,
      accessToken: '',
      type: 'offline'
    })
  } as unknown as AuthService
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined }
  const service = new LaunchService(
    makePaths(root),
    root,
    installer,
    accounts,
    auth,
    {} as unknown as ChatService,
    { register: async () => true } as unknown as FriendStore,
    logger as unknown as Logger
  )
  return {
    service,
    instance: makeInstance(),
    installCalls: () => count,
    releaseInstall: () => releaseInstall(),
    installEntered: entered
  }
}

describe('LaunchService lifecycle', () => {
  it('rejects a second launch while the first is still preparing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'polaris-launch-'))
    try {
      const { service, instance, installCalls, releaseInstall, installEntered } = makeService(root)
      const settings = defaultSettings(root)

      // No compatible Java is passed, so the first launch is expected to fail
      // once it leaves the installer; the point is the preparation window.
      const first = service.launch(instance, settings, [])
      first.catch(() => undefined)
      await installEntered
      expect(service.isPreparing(instance.id)).toBe(true)
      expect(service.isPreparing('another-instance')).toBe(false)

      const second = service.launch(instance, settings, [])
      releaseInstall()

      await expect(second).rejects.toThrow('A game is already running.')
      await expect(first).rejects.toThrow('No compatible Java runtime found')
      expect(installCalls()).toBe(1)
      expect(service.isPreparing(instance.id)).toBe(false)

      // A failed launch must not leave the in-flight flag latched.
      await expect(service.launch(instance, settings, [])).rejects.toThrow('No compatible Java runtime found')
      expect(installCalls()).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
