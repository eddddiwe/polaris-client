import { useEffect, useState, type CSSProperties } from 'react'
import type { ModDetail, ModVersionEntry } from '@shared/types'
import { compactNumber, errorMessage, useApp } from '../context'
import { Icon } from './Icons'
import { Spinner, Switch } from './Feedback'
import { Markdown } from './Markdown'

/**
 * CurseForge-style project page: gallery, rendered description, version history
 * with changelogs, links and a direct install action.
 */
export function ModDetailModal({
  projectRef,
  instanceId,
  onClose,
  onChanged,
  onCreated
}: {
  projectRef: string
  instanceId: string | null
  onClose: () => void
  onChanged: () => Promise<void>
  onCreated?: (id: string) => void
}): JSX.Element {
  const { api, toast, gameRunning } = useApp()
  const [detail, setDetail] = useState<ModDetail | null>(null)
  const [versions, setVersions] = useState<ModVersionEntry[]>([])
  const [tab, setTab] = useState<'about' | 'versions'>('about')
  const [gallery, setGallery] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const [includeOptional, setIncludeOptional] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDetail(null)
    setVersions([])
    setGallery(0)
    setTab('about')
    void (async () => {
      try {
        const [project, list] = await Promise.all([
          api.modDetail(projectRef),
          api.modVersions(projectRef, instanceId).catch(() => [])
        ])
        if (cancelled) return
        setDetail(project)
        setVersions(list)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, projectRef, instanceId])

  const isPack = detail?.projectType === 'modpack'
  const latest = versions[0]
  const hero = detail?.gallery[gallery]?.url ?? (detail?.iconUrl && !broken[detail.iconUrl] ? detail.iconUrl : undefined)

  const install = async (version: ModVersionEntry): Promise<void> => {
    if (!instanceId) {
      toast('Open an instance first to install mods.', 'error')
      return
    }
    setBusy(version.id)
    try {
      const result = await api.installModVersion(instanceId, version.id)
      if (result.installed.length) {
        toast(`${detail?.title ?? 'Mod'} ${version.versionNumber} installed`, 'success')
        if (result.dependencies.length) toast(`Added dependencies: ${result.dependencies.join(', ')}`)
      } else if (result.unsupported.length) {
        toast(`No compatible file for this instance`, 'error')
      } else if (result.skipped.length) {
        toast(`${detail?.title ?? 'Mod'} is already installed`)
      }
      const failed = result.failed[0]
      if (failed) toast(`${failed.name}: ${failed.error}`, 'error')
      await onChanged()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const installLatest = async (): Promise<void> => {
    if (!latest) return
    await install(latest)
  }

  const createFromPack = async (): Promise<void> => {
    if (!detail) return
    setBusy('pack')
    try {
      const created = await api.createInstanceFromPack({
        packRef: detail.projectId,
        includeOptional
      })
      toast(`${created.name} created from ${detail.title}`, 'success')
      await onChanged()
      onCreated?.(created.id)
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay mod-detail-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="mod-detail-modal" role="dialog" aria-modal="true" aria-label={detail?.title ?? 'Project details'}>
        <button className="icon-btn mod-detail-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>

        {loading ? (
          <div className="mod-detail-loading">
            <Spinner label="Loading project" />
          </div>
        ) : error ? (
          <div className="mod-detail-loading">
            <div className="inline-error">{error}</div>
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : detail ? (
          <>
            <div
              className="mod-detail-hero"
              style={{ '--project-color': `#${(detail.color ?? 0x7c5cff).toString(16).padStart(6, '0')}` } as CSSProperties}
            >
              {hero ? (
                <img
                  className="mod-detail-hero-img"
                  src={hero}
                  alt=""
                  onError={() => setBroken((current) => ({ ...current, [hero]: true }))}
                />
              ) : (
                <span className="mod-detail-hero-gradient" />
              )}
              <span className="mod-detail-hero-scrim" />
              <div className="mod-detail-head">
                <ProjectAvatar detail={detail} />
                <div className="mod-detail-head-copy">
                  <span className="eyebrow">
                    {isPack ? 'Modpack' : 'Mod'} · {(detail.categories[0] ?? 'project').replace(/-/g, ' ')}
                  </span>
                  <h2>{detail.title}</h2>
                  <p>{detail.description}</p>
                  <div className="mod-detail-stats">
                    <span>
                      <Icon name="download" size={13} /> {compactNumber(detail.downloads)}
                    </span>
                    <span>
                      <Icon name="heart" size={13} /> {compactNumber(detail.follows)}
                    </span>
                    <span>
                      <Icon name="clock" size={13} /> Updated {formatDate(detail.updated)}
                    </span>
                    <span>
                      <Icon name="shield" size={13} /> {detail.license}
                    </span>
                  </div>
                </div>
              </div>

              {detail.gallery.length > 1 && (
                <div className="mod-detail-gallery" role="tablist" aria-label="Gallery">
                  {detail.gallery.map((image, index) => (
                    <button
                      key={image.url}
                      className={`gallery-thumb ${gallery === index ? 'active' : ''}`}
                      aria-label={image.title ?? `Image ${index + 1}`}
                      onClick={() => setGallery(index)}
                    >
                      {broken[image.url] ? (
                        <span className="gallery-thumb-fallback">
                          <Icon name="image" size={14} />
                        </span>
                      ) : (
                        <img src={image.url} alt="" loading="lazy" onError={() => setBroken((c) => ({ ...c, [image.url]: true }))} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mod-detail-body">
              <main className="mod-detail-main">
                <nav className="tabs mod-detail-tabs">
                  <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
                    Description
                  </button>
                  <button className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')}>
                    Versions {versions.length > 0 && <span className="tab-count">{versions.length}</span>}
                  </button>
                </nav>

                {tab === 'about' ? (
                  <Markdown text={detail.body || detail.description} onLink={(url) => void api.openExternal(url)} />
                ) : versions.length === 0 ? (
                  <div className="mod-detail-empty">
                    <Icon name="package" size={20} />
                    <p>No files match this instance's Minecraft version and loader.</p>
                  </div>
                ) : (
                  <div className="version-list">
                    {versions.map((version, index) => (
                      <article key={version.id} className="version-row">
                        <div className="version-main">
                          <div className="version-title">
                            <strong>{version.versionNumber}</strong>
                            <span className={`ver-type ver-${version.versionType}`}>{version.versionType}</span>
                            {index === 0 && <span className="badge badge-violet">Latest</span>}
                          </div>
                          <span className="version-sub">
                            {version.gameVersions.slice(0, 5).join(', ')}
                            {version.gameVersions.length > 5 ? '…' : ''} · {formatDate(version.datePublished)} ·{' '}
                            {compactNumber(version.downloads)} downloads
                          </span>
                          {version.changelog && (
                            <details className="version-changelog">
                              <summary>Changelog</summary>
                              <div className="changelog-body">
                                <Markdown text={version.changelog} onLink={(url) => void api.openExternal(url)} />
                              </div>
                            </details>
                          )}
                        </div>
                        {!isPack && (
                          <button
                            className="btn btn-soft btn-sm"
                            disabled={!instanceId || gameRunning || busy !== null}
                            onClick={() => void install(version)}
                          >
                            {busy === version.id ? <span className="spinner spinner-sm" /> : <Icon name="download" size={13} />}
                            Install
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </main>

              <aside className="mod-detail-side">
                <div className="mod-side-card">
                  <span className="field-label">Compatibility</span>
                  <div className="side-pair">
                    <span>Client</span>
                    <b className={`side-state state-${detail.clientSide}`}>{detail.clientSide}</b>
                  </div>
                  <div className="side-pair">
                    <span>Server</span>
                    <b className={`side-state state-${detail.serverSide}`}>{detail.serverSide}</b>
                  </div>
                  <div className="side-versions">
                    {detail.gameVersions.slice(0, 8).map((version) => (
                      <span key={version} className="tag">
                        {version}
                      </span>
                    ))}
                    {detail.gameVersions.length > 8 && <span className="tag">+{detail.gameVersions.length - 8}</span>}
                  </div>
                </div>

                {Object.values(detail.links).some(Boolean) && (
                  <div className="mod-side-card">
                    <span className="field-label">Links</span>
                    <div className="side-links">
                      {detail.links.source && (
                        <button className="side-link" onClick={() => void api.openExternal(detail.links.source as string)}>
                          <Icon name="code" size={14} /> Source
                        </button>
                      )}
                      {detail.links.issues && (
                        <button className="side-link" onClick={() => void api.openExternal(detail.links.issues as string)}>
                          <Icon name="bug" size={14} /> Issues
                        </button>
                      )}
                      {detail.links.wiki && (
                        <button className="side-link" onClick={() => void api.openExternal(detail.links.wiki as string)}>
                          <Icon name="book" size={14} /> Wiki
                        </button>
                      )}
                      {detail.links.discord && (
                        <button className="side-link" onClick={() => void api.openExternal(detail.links.discord as string)}>
                          <Icon name="message" size={14} /> Discord
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mod-side-card">
                  <span className="field-label">Details</span>
                  <div className="side-pair">
                    <span>Published</span>
                    <b>{formatDate(detail.published)}</b>
                  </div>
                  <div className="side-pair">
                    <span>Categories</span>
                    <b>{detail.categories.map((category) => category.replace(/-/g, ' ')).join(', ') || '—'}</b>
                  </div>
                </div>

                {isPack ? (
                  <div className="mod-side-cta">
                    <label className="side-toggle">
                      <Switch checked={includeOptional} onChange={setIncludeOptional} label="Include optional files" />
                      <span>
                        <strong>Optional files</strong>
                        <small>Shaders, resource packs and extras</small>
                      </span>
                    </label>
                    <button className="btn btn-primary" disabled={busy !== null} onClick={() => void createFromPack()}>
                      {busy === 'pack' ? <span className="spinner spinner-sm" /> : <Icon name="plus" size={15} />}
                      Create instance
                    </button>
                    <span className="hint">Installs the newest pack release as a separate instance.</span>
                  </div>
                ) : (
                  <div className="mod-side-cta">
                    <button
                      className="btn btn-primary"
                      disabled={!instanceId || !latest || gameRunning || busy !== null}
                      onClick={() => void installLatest()}
                    >
                      {busy && busy !== 'pack' ? <span className="spinner spinner-sm" /> : <Icon name="download" size={15} />}
                      {latest ? `Install ${latest.versionNumber}` : 'No compatible file'}
                    </button>
                    <span className="hint">
                      {instanceId
                        ? gameRunning
                          ? 'Close Minecraft before changing mods.'
                          : 'Installs the matched file with required dependencies.'
                        : 'Open an instance to install this mod.'}
                    </span>
                  </div>
                )}
              </aside>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}

function ProjectAvatar({ detail }: { detail: ModDetail }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const initials = detail.title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  if (!detail.iconUrl || failed) return <span className="mod-detail-avatar fallback">{initials}</span>
  return <img className="mod-detail-avatar" src={detail.iconUrl} alt="" onError={() => setFailed(true)} />
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
