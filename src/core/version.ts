import type { Rule } from './rules'
import { parseMaven } from './maven'

export interface ArtifactDownload {
  path: string
  sha1?: string
  size?: number
  url: string
}

export interface LibraryDownload {
  artifact?: ArtifactDownload
  classifiers?: Record<string, ArtifactDownload>
}

export interface Library {
  name: string
  url?: string
  rules?: Rule[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  downloads?: LibraryDownload
  sha1?: string
  size?: number
  checksums?: string[]
}

export type ArgumentValue = string | string[]

export interface ArgumentEntry {
  rules?: Rule[]
  value: ArgumentValue
}

export interface VersionArguments {
  game?: (string | ArgumentEntry)[]
  jvm?: (string | ArgumentEntry)[]
}

export interface VersionJson {
  id: string
  type?: string
  mainClass: string
  inheritsFrom?: string
  assets?: string
  assetIndex?: { id: string; sha1?: string; size?: number; totalSize?: number; url?: string }
  downloads?: {
    client?: ArtifactDownload
    server?: ArtifactDownload
  }
  javaVersion?: { component?: string; majorVersion: number }
  libraries?: Library[]
  arguments?: VersionArguments
  minecraftArguments?: string
  releaseTime?: string
  time?: string
  complianceLevel?: number
  logging?: unknown
}

export interface ResolvedArtifact {
  name: string
  relativePath: string
  url: string
  sha1?: string
  size?: number
  extract: boolean
  exclude?: string[]
}

export function mergeVersions(child: VersionJson, parent: VersionJson): VersionJson {
  const mergedLibraries = dedupeLibraries([...(parent.libraries ?? []), ...(child.libraries ?? [])])
  const game = [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])]
  const jvm = [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
  return {
    ...parent,
    ...child,
    id: child.id,
    inheritsFrom: undefined,
    mainClass: child.mainClass || parent.mainClass,
    assets: child.assets ?? parent.assets,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    downloads: { ...(parent.downloads ?? {}), ...(child.downloads ?? {}) },
    javaVersion: child.javaVersion ?? parent.javaVersion,
    libraries: mergedLibraries,
    arguments: {
      game,
      jvm
    },
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments
  }
}

export function dedupeLibraries(libraries: Library[]): Library[] {
  const byKey = new Map<string, Library>()
  for (const library of libraries) {
    let key = library.name
    try {
      const parsed = parseMaven(library.name)
      key = `${parsed.group}:${parsed.artifact}:${parsed.classifier ?? ''}`
    } catch {
      // keep raw name as the key
    }
    byKey.set(key, library)
  }
  return [...byKey.values()]
}

export function resolveLibraryArtifacts(library: Library, osName: string, arch: string): ResolvedArtifact[] {
  const artifacts: ResolvedArtifact[] = []

  const artifact = library.downloads?.artifact
  if (artifact?.url) {
    artifacts.push({
      name: library.name,
      relativePath: artifact.path,
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
      extract: false
    })
  } else if (!library.downloads && library.url) {
    try {
      const parsed = parseMaven(library.name)
      artifacts.push({
        name: library.name,
        relativePath: parsed.path,
        url: `${library.url.replace(/\/$/, '')}/${parsed.path}`,
        sha1: library.sha1 ?? library.checksums?.[0],
        size: library.size,
        extract: false
      })
    } catch {
      // fall through to natives
    }
  }

  const nativeKey = library.natives?.[osName]
  if (nativeKey) {
    const classifier = nativeKey.replace('${arch}', arch.includes('64') ? '64' : '32')
    const native = library.downloads?.classifiers?.[classifier]
    if (native) {
      artifacts.push({
        name: `${library.name}:${classifier}`,
        relativePath: native.path,
        url: native.url,
        sha1: native.sha1,
        size: native.size,
        extract: true,
        exclude: library.extract?.exclude
      })
    } else if (!library.downloads && library.url) {
      try {
        const parsed = parseMaven(library.name)
        const file = `${parsed.artifact}-${parsed.version}-${classifier}.jar`
        const relativePath = [parsed.group.replace(/\./g, '/'), parsed.artifact, parsed.version, file].join('/')
        artifacts.push({
          name: `${library.name}:${classifier}`,
          relativePath,
          url: `${library.url.replace(/\/$/, '')}/${relativePath}`,
          sha1: library.sha1,
          size: library.size,
          extract: true,
          exclude: library.extract?.exclude
        })
      } catch {
        // ignore malformed legacy coordinates
      }
    }
  }

  return artifacts
}

export function flattenArguments(
  entries: (string | ArgumentEntry)[] | undefined,
  context: {
    osName: string
    osVersion: string
    arch: string
    features: Record<string, boolean>
    rulesAllow: (rules: Rule[] | undefined) => boolean
  }
): string[] {
  if (!entries) return []
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (!context.rulesAllow(entry.rules)) continue
    if (Array.isArray(entry.value)) out.push(...entry.value)
    else out.push(entry.value)
  }
  return out
}

export function legacyArguments(version: VersionJson): string[] {
  if (!version.minecraftArguments) return []
  return version.minecraftArguments.split(/\s+/).filter(Boolean)
}

export function substitute(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\$\{([^}]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

export function substituteAll(args: string[], values: Record<string, string | number | undefined>): string[] {
  return args.map((arg) => substitute(arg, values))
}

export function requiredJavaMajor(version: VersionJson): number {
  return version.javaVersion?.majorVersion ?? 8
}

export function classpathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':'
}

export function buildClasspath(paths: string[]): string {
  return paths.join(classpathSeparator())
}
