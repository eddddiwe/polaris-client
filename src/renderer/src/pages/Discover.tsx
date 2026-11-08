import { memo, useEffect, useRef, useState } from 'react'
import type { ModCategory, ModrinthSearchHit, ModSortIndex } from '@shared/types'
import { compactNumber, errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { EmptyState, Spinner } from '../components/Feedback'
import { ModDetailModal } from '../components/ModDetailModal'

type BrowseType = 'mod' | 'modpack'

const SORTS: { id: ModSortIndex; label: string }[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'follows', label: 'Followers' },
  { id: 'relevance', label: 'Relevance' },
  { id: 'newest', label: 'Newest' },
  { id: 'updated', label: 'Recently updated' }
]

export function DiscoverPage(): JSX.Element {
  const {
    detail,
    activeInstance,
    instances,
    navigate,
    api,
    reloadDetail,
    refresh,
    toast,
    openNewInstance,
    gameRunning,
    confirm
  } = useApp()
  const [type, setType] = useState<BrowseType>('mod')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ModSortIndex>('downloads')
  const [categories, setCategories] = useState<string[]>([])
  const [categoryList, setCategoryList] = useState<ModCategory[]>([])
  const [hits, setHits] = useState<ModrinthSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const searchSeq = useRef(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [projectRef, setProjectRef] = useState<string | null>(null)

  const instance = detail?.instance ?? activeInstance
  const isFabric = instance?.loader === 'fabric'
  const installedSlugs = new Set(detail?.mods.map((mod) => mod.slug) ?? [])
  const installedPacks = new Set(instances.map((item) => item.modpack?.projectId).filter(Boolean))
  const categoriesKey = categories.join(',')

  useEffect(() => {
    let cancelled = false
    api
      .modCategories(type)
      .then((list) => {
        if (!cancelled) setCategoryList(list.filter((category) => !category.header))
      })
      .catch(() => {
        if (!cancelled) setCategoryList([])
      })
    return () => {
      cancelled = true
    }
  }, [api, type])

  useEffect(() => {
    setCategories([])
    setSort('downloads')
    // A card means something different for mods and modpacks, so drop the old
    // list instead of showing it as the other kind while the new search runs.
    setHits([])
    setTotal(0)
    setLoading(true)
  }, [type])

  useEffect(() => {
    // Every input change invalidates whatever request is still in flight, so a
    // slow response for an older query can never overwrite a newer one.
    const seq = ++searchSeq.current
    setError('')
    setSearching(true)
    setLoadingMore(false)
    const timer = window.setTimeout(() => {
      api
        .searchMods(query, type, instance?.id ?? null, 0, { sort, categories })
        .then((result) => {
          if (seq !== searchSeq.current) return
          setHits(result.hits)
          setTotal(result.total)
          setLoading(false)
        })
        .catch((err) => {
          if (seq !== searchSeq.current) return
          setError(errorMessage(err))
          setLoading(false)
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false)
        })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      // Invalidate any in-flight response when the effect is torn down too.
      searchSeq.current += 1
    }
    // categoriesKey keeps the effect stable across array identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, instance?.id, query, type, sort, categoriesKey])

  const loadMore = async (): Promise<void> => {
    const seq = searchSeq.current
    setLoadingMore(true)
    try {
      const result = await api.searchMods(query, type, instance?.id ?? null, hits.length, { sort, categories })
      if (seq !== searchSeq.current) return
      setHits((current) => [...current, ...result.hits])
      setTotal(result.total)
    } catch (err) {
      if (seq === searchSeq.current) toast(errorMessage(err), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (hit: ModrinthSearchHit): Promise<void> => {
    if (!instance) {
      toast('Create or open an instance before installing mods.', 'error')
      return
    }
    setBusy(hit.projectId)
    try {
      const result = await api.installMod(instance.id, hit.projectId)
      if (result.installed.length) {
        toast(`${hit.title} installed`, 'success')
        if (result.dependencies.length) toast(`Added dependencies: ${result.dependencies.join(', ')}`)
      } else if (result.unsupported.length) {
        toast(`${hit.title} has no release for ${instance.mcVersion}`, 'error')
      } else if (result.skipped.length) {
        toast(`${hit.title} is already installed`)
      }
      const failed = result.failed[0]
      if (failed) toast(`${failed.name}: ${failed.error}`, 'error')
      await reloadDetail()
      await refresh()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const createFromPack = async (hit: ModrinthSearchHit): Promise<void> => {
    const confirmed = await confirm({
      title: `Create an instance from ${hit.title}?`,
      message: `${hit.title} will be downloaded as a new Fabric instance with its own mods, configs and world folder. It can take a few minutes.`,
      confirmLabel: 'Create instance'
    })
    if (!confirmed) return
    setBusy(hit.projectId)
    try {
      const created = await api.createInstanceFromPack({ packRef: hit.projectId })
      toast(`${created.name} created from ${hit.title}`, 'success')
      await refresh()
      navigate('instance', created.id)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggleCategory = (name: string): void =>
    setCategories((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    )

  return (
    <div className="discover-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Modrinth · live index</span>
          <h1>Discover</h1>
          <p className="page-sub">
            {instance ? (
              <>
                Installing into <b>{instance.name}</b> · {instance.mcVersion} ·{' '}
                {instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}
              </>
            ) : (
              'Browse mods and modpacks. Modpacks create their own instance.'
            )}
          </p>
        </div>
        <div className="page-actions">
          {instance && (
            <button className="btn btn-ghost" onClick={() => navigate('instance', instance.id)}>
              <Icon name="layers" size={15} /> Open instance
            </button>
          )}
          <button className="btn btn-primary" onClick={openNewInstance}>
            <Icon name="plus" size={15} /> New instance
          </button>
        </div>
      </div>

      <div className="discover-bar">
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            autoFocus
            placeholder={type === 'mod' ? 'Search mods — sodium, minimap, voice chat…' : 'Search modpacks — optimized, adventure…'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <div className="segmented">
          <button className={type === 'mod' ? 'active' : ''} onClick={() => setType('mod')}>
            Mods
          </button>
          <button className={type === 'modpack' ? 'active' : ''} onClick={() => setType('modpack')}>
            Modpacks
          </button>
        </div>
      </div>

      <div className="discover-tools">
        <label className="sort-field">
          <Icon name="list" size={14} />
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ModSortIndex)} aria-label="Sort results">
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-count">
          {searching ? 'Searching…' : `${total.toLocaleString()} ${type === 'mod' ? 'mods' : 'modpacks'}`}
        </span>
      </div>

      <div className="category-chips" role="group" aria-label="Categories">
        <button className={`chip ${categories.length === 0 ? 'active' : ''}`} onClick={() => setCategories([])}>
          All
        </button>
        {categoryList.map((category) => (
          <button
            key={category.name}
            className={`chip ${categories.includes(category.name) ? 'active' : ''}`}
            onClick={() => toggleCategory(category.name)}
          >
            {category.name.replace(/-/g, ' ')}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span className="filter-chip">
          <Icon name="layers" size={13} /> {instance ? (instance.loader === 'fabric' ? 'Fabric' : 'Vanilla') : 'Any loader'}
        </span>
        <span className="filter-chip">
          <Icon name="gamepad" size={13} /> {instance?.mcVersion ?? 'All versions'}
        </span>
        <span className="filter-chip muted">
          {instance ? 'Version-matched to this instance' : type === 'modpack' ? 'Creates a new instance' : 'Open an instance to install'}
        </span>
      </div>

      {!instance && type === 'mod' && (
        <div className="inline-warning">
          <Icon name="info" size={16} />
          <span>You can browse mods without an instance, but installing needs one. Modpacks work without a preselected instance.</span>
        </div>
      )}

      {instance && !isFabric && type === 'mod' && (
        <div className="inline-warning">
          <Icon name="info" size={16} />
          <span>This is a vanilla instance. Create a Fabric instance to install mods.</span>
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      {loading ? (
        <div className="result-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="result-card skeleton-card">
              <span className="skeleton skeleton-icon" />
              <div className="skeleton-lines">
                <span className="skeleton" />
                <span className="skeleton short" />
                <span className="skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : hits.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing matched"
          body={`Try a broader query or remove a category filter${instance ? ` — this instance only lists files for ${instance.mcVersion}` : ''}.`}
        />
      ) : (
        <>
          <div className="result-grid">
            {hits.map((hit) => {
              const isPack = type === 'modpack'
              const installed = isPack ? installedPacks.has(hit.projectId) : installedSlugs.has(hit.slug)
              const blocked = !isPack && (!instance || !isFabric)
              return (
                <article key={hit.projectId} className="result-card">
                  <ProjectIcon projectId={hit.projectId} title={hit.title} iconUrl={hit.iconUrl} />
                  <div className="result-copy">
                    <div className="result-title">
                      <h3>
                        <button className="title-link" onClick={() => setProjectRef(hit.slug)}>
                          {hit.title}
                        </button>
                      </h3>
                      <span className="result-downloads">
                        <Icon name="download" size={12} /> {compactNumber(hit.downloads)}
                      </span>
                    </div>
                    <span className="result-author">
                      {isPack ? <Icon name="package" size={12} /> : <Icon name="user" size={12} />}
                      {hit.author ?? (isPack ? 'Modpack' : 'Community')}
                      {hit.follows !== undefined && <span className="dot-sep">·</span>}
                      {hit.follows !== undefined && `${compactNumber(hit.follows)} followers`}
                    </span>
                    <p>{hit.description}</p>
                    <div className="result-tags">
                      {hit.categories.slice(0, 3).map((category) => (
                        <span key={category} className="tag">
                          {category.replace(/-/g, ' ')}
                        </span>
                      ))}
                    </div>
                    <div className="result-foot">
                      <button className="btn btn-ghost btn-sm" onClick={() => setProjectRef(hit.slug)}>
                        Details
                      </button>
                      <button
                        className={`btn btn-sm ${installed && !isPack ? 'btn-ghost' : 'btn-soft'}`}
                        disabled={blocked || busy === hit.projectId || gameRunning || (installed && !isPack)}
                        onClick={() => void (isPack ? createFromPack(hit) : install(hit))}
                      >
                        {busy === hit.projectId ? (
                          <span className="spinner spinner-sm" />
                        ) : installed && !isPack ? (
                          <Icon name="check" size={13} />
                        ) : (
                          <Icon name={isPack ? 'plus' : 'download'} size={13} />
                        )}
                        {installed && !isPack ? 'Installed' : isPack ? 'Create instance' : 'Install'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {hits.length < total && (
            <div className="load-more">
              <button className="btn btn-ghost" onClick={() => void loadMore()} disabled={loadingMore || searching}>
                {loadingMore ? <Spinner /> : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      <div className="fine-print discover-note">
        Metadata and downloads come from the Modrinth API. Polaris verifies file hashes before writing a jar into the instance,
        and version lists are filtered to the selected instance's loader and Minecraft version.
      </div>

      {projectRef && (
        <ModDetailModal
          projectRef={projectRef}
          instanceId={instance?.id ?? null}
          onClose={() => setProjectRef(null)}
          onChanged={async () => {
            await reloadDetail()
            await refresh()
          }}
          onCreated={(id) => navigate('instance', id)}
        />
      )}
    </div>
  )
}

// Search results are replaced on every filter/query change. Pinning the first
// icon URL seen per project keeps the <img> src stable across those refreshes,
// and remembering failures stops a broken icon from being re-requested when its
// card remounts.
const ICON_CACHE_LIMIT = 400
type IconCacheEntry = { src: string; failed: boolean }
const iconCache = new Map<string, IconCacheEntry>()

function cachedIcon(projectId: string, iconUrl: string | undefined): IconCacheEntry | null {
  if (!iconUrl) return null
  const entry = iconCache.get(projectId)
  if (entry) return entry
  if (iconCache.size >= ICON_CACHE_LIMIT) {
    const oldest = iconCache.keys().next().value
    if (oldest !== undefined) iconCache.delete(oldest)
  }
  const created: IconCacheEntry = { src: iconUrl, failed: false }
  iconCache.set(projectId, created)
  return created
}

const ProjectIcon = memo(function ProjectIcon({
  projectId,
  title,
  iconUrl
}: {
  projectId: string
  title: string
  iconUrl?: string
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const entry = cachedIcon(projectId, iconUrl)
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  if (!entry || entry.failed || failed) {
    return <span className="result-icon result-icon-fallback">{initials}</span>
  }
  return (
    <img
      className="result-icon"
      src={entry.src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        // Persist the failure so a remount goes straight to the fallback.
        entry.failed = true
        setFailed(true)
      }}
    />
  )
})
