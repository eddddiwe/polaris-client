import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rulesAllow, type RuleContext } from '../src/core/rules'
import { mavenKey, parseMaven } from '../src/core/maven'
import {
  buildClasspath,
  flattenArguments,
  mergeVersions,
  resolveLibraryArtifacts,
  substitute,
  substituteAll,
  type VersionJson
} from '../src/core/version'
import { compactUuid, offlineUuid } from '../src/core/accounts'
import {
  GAME_UI_DEFAULTS,
  buildJvmFlags,
  estimatedScore,
  makePlan,
  normalizeGameUi,
  perfOptions,
  readGameUi,
  writeGameUi
} from '../src/core/performance'
import { CosmeticsService } from '../src/core/cosmetics'
import { SettingsStore } from '../src/core/settings'
import { assertSafeSegment, isSafeSegment, readJson } from '../src/core/fsutil'
import {
  buildSearchFacets,
  mapVersionEntry,
  pickVersion,
  primaryFile,
  type ModrinthVersion
} from '../src/core/modrinth'
import {
  cleanDependency,
  normalizeArchivePath,
  parseMrpackIndex,
  safeOverridePath
} from '../src/core/modpacks'
import { evaluatePackMod } from '../src/core/mods'
import { PACKS, packsFor } from '../src/shared/packs'

const windows: RuleContext = {
  osName: 'windows',
  osVersion: '10.0.22631',
  arch: 'x64',
  features: { is_demo_user: false, has_custom_resolution: true }
}

describe('rule evaluation', () => {
  it('allows libraries with no rules', () => {
    expect(rulesAllow(undefined, windows)).toBe(true)
    expect(rulesAllow([], windows)).toBe(true)
  })

  it('follows the last matching rule', () => {
    expect(rulesAllow([{ action: 'allow', os: { name: 'windows' } }], windows)).toBe(true)
    expect(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], windows)).toBe(false)
    expect(
      rulesAllow(
        [
          { action: 'allow' },
          { action: 'disallow', os: { name: 'windows' } }
        ],
        windows
      )
    ).toBe(false)
  })

  it('matches architecture aliases and feature flags', () => {
    expect(rulesAllow([{ action: 'allow', os: { arch: 'x86_64' } }], windows)).toBe(true)
    expect(rulesAllow([{ action: 'allow', os: { arch: 'arm64' } }], windows)).toBe(false)
    expect(
      rulesAllow([{ action: 'allow', features: { has_custom_resolution: true } }], windows)
    ).toBe(true)
    expect(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], windows)).toBe(false)
  })
})

describe('maven coordinates', () => {
  it('builds paths including classifiers and extensions', () => {
    expect(parseMaven('com.mojang:logging:1.1.1')).toMatchObject({
      group: 'com.mojang',
      artifact: 'logging',
      version: '1.1.1',
      extension: 'jar',
      path: 'com/mojang/logging/1.1.1/logging-1.1.1.jar'
    })
    expect(parseMaven('org.lwjgl:lwjgl:3.3.3:natives-windows')).toMatchObject({
      classifier: 'natives-windows',
      path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar'
    })
    expect(mavenKey('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe('org.lwjgl:lwjgl:natives-windows')
  })

  it('rejects malformed coordinates', () => {
    expect(() => parseMaven('not-a-coordinate')).toThrow()
  })
})

describe('version metadata', () => {
  const parent: VersionJson = {
    id: '26.3',
    mainClass: 'net.minecraft.client.main.Main',
    assets: '34',
    javaVersion: { majorVersion: 25 },
    libraries: [
      { name: 'com.mojang:logging:1.1.1' },
      { name: 'com.mojang:brigadier:1.0.18' }
    ],
    arguments: {
      game: ['--username', '${auth_player_name}'],
      jvm: ['-cp', '${classpath}']
    }
  }

  it('merges a loader profile over its parent', () => {
    const child: VersionJson = {
      id: 'fabric-loader-0.19.5-26.3',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      inheritsFrom: '26.3',
      libraries: [
        { name: 'com.mojang:brigadier:1.0.18' },
        { name: 'net.fabricmc:fabric-loader:0.19.5' }
      ],
      arguments: { game: ['--fabric'], jvm: [] }
    }
    const merged = mergeVersions(child, parent)
    expect(merged.id).toBe('fabric-loader-0.19.5-26.3')
    expect(merged.mainClass).toContain('KnotClient')
    expect(merged.javaVersion?.majorVersion).toBe(25)
    expect(merged.libraries).toHaveLength(3)
    expect(merged.libraries?.filter((lib) => lib.name.startsWith('com.mojang:brigadier'))).toHaveLength(1)
    expect(merged.arguments?.game).toEqual(['--username', '${auth_player_name}', '--fabric'])
    expect(merged.inheritsFrom).toBeUndefined()
  })

  it('resolves modern and legacy native artifacts together', () => {
    const modern = resolveLibraryArtifacts(
      {
        name: 'org.lwjgl:lwjgl:3.3.3',
        downloads: {
          artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar', url: 'https://example.test/lwjgl.jar', sha1: 'abc' },
          classifiers: {
            'natives-windows': {
              path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar',
              url: 'https://example.test/lwjgl-natives.jar',
              sha1: 'def'
            }
          }
        },
        natives: { windows: 'natives-windows' }
      },
      'windows',
      'x64'
    )
    expect(modern).toHaveLength(2)
    expect(modern.map((item) => item.extract)).toEqual([false, true])

    const legacy = resolveLibraryArtifacts(
      {
        name: 'org.lwjgl.lwjgl:lwjgl:2.9.4',
        url: 'https://libraries.minecraft.net/',
        natives: { windows: 'natives-windows-${arch}' }
      },
      'windows',
      'x64'
    )
    expect(legacy).toHaveLength(2)
    expect(legacy[1].url).toContain('lwjgl-2.9.4-natives-windows-64.jar')
    expect(legacy[1].extract).toBe(true)
  })

  it('flattens conditional arguments and substitutes placeholders', () => {
    const args = flattenArguments(
      [
        '-Xss1M',
        { rules: [{ action: 'allow', os: { name: 'osx' } }], value: '-XstartOnFirstThread' },
        { rules: [{ action: 'allow', os: { name: 'windows' } }], value: ['-Dos=windows', '-Darch=${arch}'] }
      ],
      {
        osName: windows.osName,
        osVersion: windows.osVersion,
        arch: windows.arch,
        features: windows.features,
        rulesAllow: (rules) => rulesAllow(rules, windows)
      }
    )
    expect(args).toEqual(['-Xss1M', '-Dos=windows', '-Darch=${arch}'])
    expect(substituteAll(args, { arch: 'x64' })).toContain('-Darch=x64')
    expect(substitute('hello ${name}', { name: 'Polaris' })).toBe('hello Polaris')
    expect(substitute('leave ${unknown}', {})).toBe('leave ${unknown}')
  })

  it('joins classpaths with the platform separator', () => {
    const expected = process.platform === 'win32' ? 'a.jar;b.jar' : 'a.jar:b.jar'
    expect(buildClasspath(['a.jar', 'b.jar'])).toBe(expected)
  })
})

describe('offline identity', () => {
  it('derives a stable v3 UUID', () => {
    const uuid = offlineUuid('TestPilot')
    expect(offlineUuid('TestPilot')).toBe(uuid)
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(compactUuid(uuid)).toHaveLength(32)
  })
})

describe('performance plans', () => {
  it('builds one pause target and preset-appropriate flags', () => {
    const ai = buildJvmFlags(8192, 'aikar')
    expect(ai.filter((flag) => flag.startsWith('-XX:MaxGCPauseMillis='))).toEqual(['-XX:MaxGCPauseMillis=200'])
    expect(ai).toContain('-Xmx8192M')
    const low = buildJvmFlags(9216, 'low-latency')
    expect(low.filter((flag) => flag.startsWith('-XX:MaxGCPauseMillis='))).toEqual(['-XX:MaxGCPauseMillis=20'])
    expect(low).toContain('-XX:+UseStringDeduplication')
  })

  it('scales options by profile and hardware tier', () => {
    const hardware = {
      tier: 'enthusiast' as const,
      threads: 32,
      ramGb: 32
    }
    const competitive = perfOptions('competitive', hardware)
    expect(competitive.maxFps).toBe('260')
    expect(competitive.renderDistance).toBe('12')
    expect(competitive.entityShadows).toBe('false')
    const quality = perfOptions('quality', hardware)
    expect(quality.maxFps).toBe('120')
    expect(quality.particles).toBe('0')
    expect(estimatedScore(hardware)).toBe(100)
  })

  it('clamps heap overrides to a safe range', () => {
    const hardware = {
      cpu: 'Test CPU',
      threads: 32,
      physicalCores: 16,
      ramGb: 32,
      gpu: 'Test GPU',
      gpuVendor: 'Test',
      os: 'windows',
      arch: 'x64',
      tier: 'enthusiast' as const,
      recommendedMemoryMb: 8192,
      java: [],
      detectedAt: 0
    }
    expect(makePlan('balanced', hardware, 999_999).memoryMb).toBe(32768)
    expect(makePlan('balanced', hardware, 0).memoryMb).toBe(1024)
    expect(makePlan('balanced', hardware, Number.NaN).memoryMb).toBe(8192)
    expect(makePlan('competitive', hardware).jvmArgs).toContain('-Xmx8192M')
  })
})

describe('cosmetics economy', () => {
  it('always owns free items and refuses unaffordable unlocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-cosmetics-'))
    try {
      const store = new SettingsStore(join(dir, 'settings.json'), dir)
      const service = new CosmeticsService(store)
      const snapshot = service.snapshot(0)
      expect(snapshot.owned).toContain('badge-north')
      expect(snapshot.owned).toContain('cape-classic')
      expect(snapshot.shards).toBe(900)
      await expect(service.buy('cape-supernova')).rejects.toThrow(/shards/i)
      const afterBuy = await service.buy('badge-comet')
      expect(afterBuy.ownedCosmetics).toContain('badge-comet')
      expect(afterBuy.shards).toBe(450)
      await service.equip('badge-comet')
      expect(store.get().equippedBadge).toBe('badge-comet')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('converts only new playtime into shards', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-shards-'))
    try {
      const store = new SettingsStore(join(dir, 'settings.json'), dir)
      const service = new CosmeticsService(store)
      expect(await service.claim(2 * 3_600_000)).toBe(80)
      expect(await service.claim(2 * 3_600_000)).toBe(0)
      expect(await service.claim(3 * 3_600_000)).toBe(40)
      expect(store.get().shards).toBe(1020)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('in-game interface options', () => {
  it('clamps values to vanilla ranges', () => {
    const values = normalizeGameUi({ guiScale: 99, fov: 5, gamma: 2, chatOpacity: -1, attackIndicator: 7 })
    expect(values).toMatchObject({ guiScale: 4, fov: 30, gamma: 1, chatOpacity: 0, attackIndicator: 2 })
    expect(values.chatScale).toBe(GAME_UI_DEFAULTS.chatScale)
  })

  it('round-trips through options.txt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-gameui-'))
    try {
      const defaults = await readGameUi(dir)
      expect(defaults.source).toBe('defaults')
      const applied = await writeGameUi(dir, { guiScale: 3, fov: 95, gamma: 0.7 })
      expect(applied.changed).toBeGreaterThan(0)
      const read = await readGameUi(dir)
      expect(read.source).toBe('options.txt')
      expect(read.values.guiScale).toBe(3)
      expect(read.values.fov).toBe(95)
      expect(read.values.gamma).toBeCloseTo(0.7, 2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('filesystem guards', () => {
  it('accepts version and instance identifiers only', () => {
    expect(isSafeSegment('26.4-snapshot-4')).toBe(true)
    expect(isSafeSegment('fabric-loader-0.19.5-26.3')).toBe(true)
    expect(isSafeSegment('..')).toBe(false)
    expect(isSafeSegment('../escape')).toBe(false)
    expect(isSafeSegment('C:\\Windows')).toBe(false)
    expect(() => assertSafeSegment('../escape', 'instance id')).toThrow('Invalid instance id')
  })

  it('reads JSON saved with a UTF-8 BOM and falls back on corruption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-test-'))
    const file = join(dir, 'config.json')
    try {
      await writeFile(file, '\uFEFF{"ok":true}', 'utf8')
      await expect(readJson(file, { ok: false })).resolves.toEqual({ ok: true })
      await writeFile(file, 'not json', 'utf8')
      await expect(readJson(file, { ok: false })).resolves.toEqual({ ok: false })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('Modrinth selection', () => {
  const baseVersion: ModrinthVersion = {
    id: 'v1',
    project_id: 'p1',
    name: 'One',
    version_number: '1.0.0',
    version_type: 'release',
    game_versions: ['26.3'],
    loaders: ['fabric'],
    date_published: '2026-01-01T00:00:00Z',
    downloads: 10,
    files: [
      { url: 'https://example.test/one.jar', filename: 'one.jar', primary: true, size: 10, hashes: {} },
      { url: 'https://example.test/one-sources.jar', filename: 'one-sources.jar', primary: false, size: 10, hashes: {} }
    ],
    dependencies: []
  }

  it('prefers releases over newer betas', () => {
    const beta = {
      ...baseVersion,
      id: 'v2',
      version_type: 'beta' as const,
      date_published: '2026-05-01T00:00:00Z'
    }
    expect(pickVersion([beta, baseVersion])?.id).toBe('v1')
    expect(pickVersion([beta])?.id).toBe('v2')
    expect(pickVersion([])).toBeUndefined()
  })

  it('chooses the primary jar', () => {
    expect(primaryFile(baseVersion)?.filename).toBe('one.jar')
    expect(
      primaryFile({ ...baseVersion, files: [{ ...baseVersion.files[1], primary: false }] })?.filename
    ).toBe('one-sources.jar')
  })

  it('maps a version entry for the detail modal', () => {
    const entry = mapVersionEntry({
      ...baseVersion,
      changelog: '## Fixes\n\n- one crash',
      dependencies: [
        { version_id: null, project_id: 'dep-1', file_name: null, dependency_type: 'required' },
        { version_id: null, project_id: 'dep-2', file_name: null, dependency_type: 'optional' }
      ]
    })
    expect(entry).toMatchObject({
      id: 'v1',
      versionNumber: '1.0.0',
      versionType: 'release',
      filename: 'one.jar',
      size: 10,
      changelog: '## Fixes\n\n- one crash'
    })
    expect(entry.dependencies).toEqual([{ projectId: 'dep-1', type: 'required' }])
  })
})

describe('Modrinth facets', () => {
  it('ANDs the narrow filters and ORs categories', () => {
    expect(buildSearchFacets({ type: 'mod', loader: 'fabric', gameVersion: '1.21.10' })).toEqual([
      ['project_type:mod'],
      ['categories:fabric'],
      ['versions:1.21.10']
    ])
    expect(
      buildSearchFacets({ type: 'modpack', categories: ['optimization', 'adventure', 'optimization', ' '] })
    ).toEqual([['project_type:modpack'], ['categories:optimization', 'categories:adventure']])
  })
})

describe('mrpack parsing', () => {
  const manifest = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.0.0',
      name: 'Test Pack',
      dependencies: { minecraft: '1.21.10', 'fabric-loader': '0.16.9' },
      files: [
        {
          path: 'mods/required.jar',
          downloads: ['https://example.test/required.jar'],
          hashes: { sha1: 'a'.repeat(40) },
          fileSize: 42,
          env: { client: 'required' }
        },
        {
          path: 'mods/optional.jar',
          downloads: ['https://example.test/optional.jar'],
          env: { client: 'optional' }
        },
        {
          path: 'mods/server-only.jar',
          downloads: ['https://example.test/server.jar'],
          env: { client: 'unsupported' }
        },
        {
          path: '../escape.jar',
          downloads: ['https://example.test/escape.jar']
        }
      ],
      ...overrides
    })

  it('reads dependencies and keeps only client-compatible files', () => {
    const plan = parseMrpackIndex(manifest())
    expect(plan.loader).toBe('fabric')
    expect(plan.loaderVersion).toBe('0.16.9')
    expect(plan.mcVersion).toBe('1.21.10')
    expect(plan.files.map((file) => file.path)).toEqual(['mods/required.jar', 'mods/optional.jar'])
    expect(plan.files[0]).toMatchObject({ optional: false, sha1: 'a'.repeat(40), size: 42 })
    expect(plan.files[1].optional).toBe(true)
  })

  it('rejects unsupported loaders and format versions', () => {
    expect(() =>
      parseMrpackIndex(manifest({ dependencies: { minecraft: '1.21.10', forge: '47.2.0' } }))
    ).toThrow(/Fabric/)
    expect(() => parseMrpackIndex(manifest({ formatVersion: 2 }))).toThrow(/format version/)
    expect(() => parseMrpackIndex('{oops')).toThrow(/valid JSON/)
  })

  it('cleans exact dependency versions only', () => {
    expect(cleanDependency('1.21.10')).toBe('1.21.10')
    expect(cleanDependency(' 0.16.9 ')).toBe('0.16.9')
    expect(cleanDependency('>=1.21')).toBeNull()
    expect(cleanDependency('~1.20.1')).toBeNull()
    expect(cleanDependency(undefined)).toBeNull()
  })

  it('normalizes archive paths and rejects traversal', () => {
    expect(normalizeArchivePath('mods\\sodium.jar')).toBe('mods/sodium.jar')
    expect(normalizeArchivePath('/mods/x.jar')).toBe('mods/x.jar')
    expect(normalizeArchivePath('../escape.jar')).toBeNull()
    expect(normalizeArchivePath('mods/../../escape.jar')).toBeNull()
    expect(normalizeArchivePath('C:/Windows/system32/x.jar')).toBeNull()
    expect(normalizeArchivePath('mods/')).toBeNull()
  })

  it('resolves override entries inside the instance only', () => {
    const dir = join(tmpdir(), 'polaris-overrides-test')
    expect(safeOverridePath(dir, 'overrides/config/a.json', 'overrides/')).toMatch(/a\.json$/)
    expect(safeOverridePath(dir, 'overrides/nested/deep/x.json', 'overrides/')).toMatch(/x\.json$/)
    expect(safeOverridePath(dir, 'overrides/../../escape.txt', 'overrides/')).toBeNull()
    expect(safeOverridePath(dir, 'client-overrides/config/a.json', 'overrides/')).toBeNull()
    expect(safeOverridePath(dir, 'overrides/', 'overrides/')).toBeNull()
  })
})

describe('packs', () => {
  it('gates Nvidium on NVIDIA hardware', () => {
    const nvidium = { slug: 'nvidium', name: 'Nvidium', note: '', requires: 'nvidia' as const }
    expect(evaluatePackMod(nvidium, 'NVIDIA GeForce RTX 4070')).toEqual({ ok: true })
    expect(evaluatePackMod(nvidium, 'AMD Radeon RX 7800 XT').ok).toBe(false)
    expect(evaluatePackMod(nvidium, 'AMD Radeon RX 7800 XT').reason).toMatch(/NVIDIA/)
    expect(evaluatePackMod({ slug: 'sodium', name: 'Sodium', note: '' }, 'Intel')).toEqual({ ok: true })
  })

  it('keeps server packs separate from client packs', () => {
    expect(packsFor('server').map((pack) => pack.id)).toEqual(['server'])
    expect(packsFor(undefined).every((pack) => (pack.target ?? 'client') === 'client')).toBe(true)
    expect(packsFor('game').some((pack) => pack.id === 'server')).toBe(false)
    const performance = PACKS.find((pack) => pack.id === 'performance')
    expect(performance?.mods.find((mod) => mod.slug === 'nvidium')?.requires).toBe('nvidia')
  })
})

describe('ZGC preset', () => {
  it('adds the generational flag only on JDK 21–22', () => {
    const jdk21 = buildJvmFlags(8192, 'zgc', '', 21)
    expect(jdk21).toContain('-XX:+UseZGC')
    expect(jdk21).toContain('-XX:+ZGenerational')
    expect(buildJvmFlags(8192, 'zgc', '', 22)).toContain('-XX:+ZGenerational')
    expect(buildJvmFlags(8192, 'zgc', '', 23)).not.toContain('-XX:+ZGenerational')
    expect(buildJvmFlags(8192, 'zgc')).not.toContain('-XX:+ZGenerational')
    expect(buildJvmFlags(8192, 'zgc', '', 21)).toContain('-Xmx8192M')
  })

  it('honors a preset override in plans', () => {
    const hardware = {
      cpu: 'Test CPU',
      threads: 16,
      physicalCores: 8,
      ramGb: 32,
      gpu: 'Test GPU',
      gpuVendor: 'Test',
      os: 'windows',
      arch: 'x64',
      tier: 'enthusiast' as const,
      recommendedMemoryMb: 8192,
      java: [{ path: 'java', major: 21, version: '21', vendor: 'Temurin', source: 'test' }],
      detectedAt: 0
    }
    const plan = makePlan('balanced', hardware, 8192, 'zgc')
    expect(plan.jvmPreset).toBe('zgc')
    expect(plan.jvmArgs).toContain('-XX:+UseZGC')
  })
})
