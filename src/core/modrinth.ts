import type { ModCategory, ModDetail, ModSortIndex, ModVersionEntry, ModrinthSearchHit } from '../shared/types'
import type { Downloader } from './http'
import type { Logger } from './logger'

const API = 'https://api.modrinth.com/v2'

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  icon_url?: string
  downloads: number
  categories: string[]
  project_type: string
  game_versions?: string[]
  loaders?: string[]
}

export interface ModrinthProjectDetail extends ModrinthProject {
  body?: string
  color?: number | null
  followers?: number
  license?: { id?: string; name?: string; url?: string } | string
  client_side?: string
  server_side?: string
  additional_categories?: string[]
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
  gallery?: { url: string; featured?: boolean; title?: string; description?: string; created?: string }[]
  published?: string
  updated?: string
  versions?: string[]
}

export interface ModrinthVersionFile {
  url: string
  filename: string
  primary: boolean
  size: number
  file_type?: string
  hashes: { sha1?: string; sha512?: string }
}

export interface ModrinthDependency {
  version_id: string | null
  project_id: string | null
  file_name: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  changelog?: string | null
  files: ModrinthVersionFile[]
  dependencies: ModrinthDependency[]
}

interface SearchResponse {
  hits: {
    project_id: string
    project_type: string
    slug: string
    author?: string
    title: string
    description: string
    icon_url?: string
    downloads: number
    follows?: number
    categories: string[]
    display_categories?: string[]
    versions: string[]
    license?: string
    client_side?: string
    server_side?: string
    date_modified?: string
    color?: number | null
    featured_gallery?: string
    gallery?: string[]
  }[]
  total_hits: number
  limit: number
  offset: number
}

export interface SearchOptions {
  type?: 'mod' | 'modpack'
  loader?: string
  gameVersion?: string
  categories?: string[]
  sort?: ModSortIndex
  limit?: number
  offset?: number
}

/**
 * Modrinth facets: entries inside one inner array are OR-ed, inner arrays are
 * AND-ed together. Categories therefore widen (OR) while loader/version narrow.
 */
export function buildSearchFacets(opts: SearchOptions): string[][] {
  const facets: string[][] = [[`project_type:${opts.type ?? 'mod'}`]]
  if (opts.loader) facets.push([`categories:${opts.loader}`])
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`])
  const categories = [...new Set((opts.categories ?? []).map((name) => name.trim()).filter(Boolean))]
  if (categories.length > 0) facets.push(categories.map((name) => `categories:${name}`))
  return facets
}

export function mapSearchHit(hit: SearchResponse['hits'][number]): ModrinthSearchHit {
  return {
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    downloads: hit.downloads,
    follows: hit.follows,
    author: hit.author,
    categories: hit.categories,
    displayCategories: hit.display_categories,
    projectType: hit.project_type,
    versions: hit.versions,
    license: hit.license,
    clientSide: hit.client_side,
    serverSide: hit.server_side,
    dateModified: hit.date_modified,
    color: hit.color,
    featuredGallery: hit.featured_gallery ?? hit.gallery?.[0]
  }
}

export class ModrinthClient {
  private cache = new Map<string, { at: number; value: unknown }>()

  constructor(
    private readonly downloader: Downloader,
    private readonly logger: Logger
  ) {}

  private async cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
    const value = await loader()
    this.cache.set(key, { at: Date.now(), value })
    return value
  }

  async search(query: string, opts: SearchOptions = {}): Promise<{ hits: ModrinthSearchHit[]; total: number }> {
    const params = new URLSearchParams({
      query,
      limit: String(opts.limit ?? 24),
      offset: String(opts.offset ?? 0),
      index: opts.sort ?? 'relevance',
      facets: JSON.stringify(buildSearchFacets(opts))
    })
    const key = `search:${params.toString()}`
    return await this.cached(key, 5 * 60_000, async () => {
      const response = await this.downloader.fetchJson<SearchResponse>(`${API}/search?${params.toString()}`)
      return { hits: response.hits.map(mapSearchHit), total: response.total_hits }
    })
  }

  async project(ref: string): Promise<ModrinthProject> {
    return await this.cached(`project:${ref.toLowerCase()}`, 10 * 60_000, async () =>
      this.downloader.fetchJson<ModrinthProject>(`${API}/project/${encodeURIComponent(ref)}`)
    )
  }

  async projects(ids: string[]): Promise<ModrinthProject[]> {
    if (ids.length === 0) return []
    return await this.downloader.fetchJson<ModrinthProject[]>(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)
  }

  /** Full project payload for the detail view: body, gallery, links and stats. */
  async projectDetail(ref: string): Promise<ModDetail> {
    const project = await this.cached(`detail:${ref.toLowerCase()}`, 10 * 60_000, async () =>
      this.downloader.fetchJson<ModrinthProjectDetail>(`${API}/project/${encodeURIComponent(ref)}`)
    )
    return mapProjectDetail(project)
  }

  async versions(projectId: string, loader: string, gameVersion: string): Promise<ModrinthVersion[]> {
    const params = new URLSearchParams()
    if (loader) params.set('loaders', JSON.stringify([loader]))
    if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return await this.cached(`versions:${projectId}:${loader}:${gameVersion}`, 5 * 60_000, async () => {
      const versions = await this.downloader.fetchJson<ModrinthVersion[]>(
        `${API}/project/${encodeURIComponent(projectId)}/version${suffix}`
      )
      return versions.sort((a, b) => Date.parse(b.date_published) - Date.parse(a.date_published))
    })
  }

  async versionById(versionId: string): Promise<ModrinthVersion> {
    return await this.downloader.fetchJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(versionId)}`)
  }

  /**
   * Batch update check: maps the sha1 of every installed file to the newest
   * version Modrinth knows for the given loaders/game versions. Only hashes
   * with a newer file appear in the response.
   */
  async updatesForHashes(
    hashes: string[],
    loaders: string[],
    gameVersions: string[]
  ): Promise<Record<string, ModrinthVersion>> {
    if (hashes.length === 0) return {}
    return await this.downloader.fetchJson<Record<string, ModrinthVersion>>(
      `${API}/version_files/update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ algorithm: 'sha1', hashes, loaders, game_versions: gameVersions })
      },
      2
    )
  }

  /** Batch hash → version lookup, used to index modpack jars by their sha1. */
  async versionsByHashes(hashes: string[]): Promise<Record<string, ModrinthVersion>> {
    if (hashes.length === 0) return {}
    return await this.downloader.fetchJson<Record<string, ModrinthVersion>>(
      `${API}/version_files`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ algorithm: 'sha1', hashes })
      },
      2
    )
  }

  async categories(projectType: 'mod' | 'modpack'): Promise<ModCategory[]> {
    return await this.cached(`categories:${projectType}`, 24 * 60 * 60_000, async () => {
      const tags = await this.downloader.fetchJson<
        { name: string; icon?: string; project_type?: string; header?: boolean }[]
      >(`${API}/tag/category`)
      return tags
        .filter((tag) => tag.project_type === projectType || tag.project_type === '*')
        .map((tag) => ({ name: tag.name, icon: tag.icon, header: tag.header }))
    })
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.downloader.fetchJson(`${API}/tag/game_version`)
      return true
    } catch (error) {
      this.logger.warn('Modrinth unreachable', String(error))
      return false
    }
  }
}

export function mapProjectDetail(project: ModrinthProjectDetail): ModDetail {
  const license =
    typeof project.license === 'string' ? project.license : (project.license?.name ?? project.license?.id ?? 'Unknown')
  const gallery = [...(project.gallery ?? [])]
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .map((image) => ({
      url: image.url,
      featured: Boolean(image.featured),
      title: image.title ?? image.description ?? undefined,
      created: image.created
    }))
  return {
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    body: project.body ?? '',
    iconUrl: project.icon_url,
    color: project.color ?? null,
    gallery,
    downloads: project.downloads,
    follows: project.followers ?? 0,
    categories: project.categories ?? [],
    additionalCategories: project.additional_categories ?? [],
    license,
    projectType: project.project_type,
    clientSide: project.client_side ?? 'unknown',
    serverSide: project.server_side ?? 'unknown',
    published: project.published ?? '',
    updated: project.updated ?? '',
    gameVersions: project.game_versions ?? [],
    links: {
      source: project.source_url ?? undefined,
      issues: project.issues_url ?? undefined,
      wiki: project.wiki_url ?? undefined,
      discord: project.discord_url ?? undefined
    }
  }
}

export function pickVersion(versions: ModrinthVersion[]): ModrinthVersion | undefined {
  if (versions.length === 0) return undefined
  const rank = { release: 0, beta: 1, alpha: 2 }
  return [...versions].sort((a, b) => rank[a.version_type] - rank[b.version_type] || Date.parse(b.date_published) - Date.parse(a.date_published))[0]
}

export function primaryFile(version: ModrinthVersion): ModrinthVersionFile | undefined {
  return version.files.find((file) => file.primary && file.filename.endsWith('.jar')) ?? version.files.find((file) => file.filename.endsWith('.jar'))
}

/** Primary file of any type — modpacks distribute .mrpack archives, not jars. */
export function primaryFileAny(version: ModrinthVersion): ModrinthVersionFile | undefined {
  return version.files.find((file) => file.primary) ?? version.files[0]
}

/** Version row for the detail modal: display fields plus the primary file. */
export function mapVersionEntry(version: ModrinthVersion): ModVersionEntry {
  const file = primaryFileAny(version)
  return {
    id: version.id,
    name: version.name,
    versionNumber: version.version_number,
    versionType: version.version_type,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    datePublished: version.date_published,
    downloads: version.downloads,
    changelog: version.changelog ?? '',
    filename: file?.filename ?? '',
    size: file?.size ?? 0,
    dependencies: (version.dependencies ?? [])
      .filter((dep) => dep.project_id && dep.dependency_type === 'required')
      .map((dep) => ({ projectId: dep.project_id, type: dep.dependency_type }))
  }
}
