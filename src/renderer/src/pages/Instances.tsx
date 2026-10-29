import { useMemo, useState, type CSSProperties } from 'react'
import { useApp, formatRelative, errorMessage } from '../context'
import { Icon } from '../components/Icons'
import { EmptyState } from '../components/Feedback'

export function InstancesPage(): JSX.Element {
  const { instances, navigate, launch, gameRunning, openNewInstance, api, refresh, toast, selectInstance, confirm, boot } = useApp()
  const [query, setQuery] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    latestVersion: string
    currentVersion: string
    releaseNotes?: string
  } | null>(null)

  const filtered = useMemo(
    () => instances.filter((instance) => `${instance.name} ${instance.mcVersion} ${instance.loader}`.toLowerCase().includes(query.toLowerCase())),
    [instances, query]
  )

  const remove = async (id: string, name: string): Promise<void> => {
    const confirmed = await confirm({
      title: 'Delete instance?',
      message: `“${name}” and its saves, mods and configuration will be removed. This cannot be undone.`,
      confirmLabel: 'Delete instance',
      danger: true
    })
    if (!confirmed) return
    try {
      await api.deleteInstance(id)
      await refresh()
      toast('Instance deleted')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }
  const [importing, setImporting] = useState(false)

  const importModpack = async () => {
    setImporting(true)
    try {
      const instance = await api.importMrpack()
      toast(`Imported modpack: ${instance.name} (${instance.mcVersion})`)
      await refresh()
    } catch (err) {
      toast('Failed to import .mrpack: ' + (err instanceof Error ? err.message : 'unknown error'))
    } finally {
      setImporting(false)
    }
  }

  const checkUpdates = async () => {
    try {
      const info = await api.checkForUpdates()
      setUpdateInfo({
        hasUpdate: info.hasUpdate,
        latestVersion: info.latestVersion ?? 'unknown',
        currentVersion: boot.appVersion ?? 'unknown',
        releaseNotes: info.releaseNotes
      })
      if (info.hasUpdate) {
        toast(`Update available: v${info.latestVersion}`, 'info')
      } else {
        toast('You are on the latest version', 'success')
      }
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="instances-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Instances</h1>
          <p className="page-sub">Isolated game directories, per-instance Java, mods and performance policy.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNewInstance}>
            <Icon name="plus" size={15} /> New instance
          </button>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="search-field compact">
          <Icon name="search" size={15} />
          <input placeholder="Filter instances" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="page-toolbar-meta">
          <span>{filtered.length} of {instances.length} instances</span>
        </div>
        <div className="page-toolbar-actions">
          <button className="btn btn-ghost" onClick={importModpack} disabled={importing}>
            <Icon name="folder" size={15} /> Import .mrpack
          </button>
          <button className="btn btn-ghost" onClick={checkUpdates}>
            <Icon name="refresh" size={15} /> Check for updates
          </button>
        </div>
      </div>
      {updateInfo?.hasUpdate && (
        <div className="update-banner">
          <div className="update-info">
            <strong>Update available: v{updateInfo.latestVersion}</strong>
            <span>Current: v{updateInfo.currentVersion}</span>
            {updateInfo.releaseNotes && <p className="release-notes">{updateInfo.releaseNotes}</p>}
          </div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await api.installUpdate()
              toast('Downloading and installing update...', 'info')
            }}
          >
            <Icon name="download" size={14} /> Download Update
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="layers"
          title={instances.length ? 'No matching instances' : 'Your library is empty'}
          body={
            instances.length
              ? 'Try a different name or Minecraft version.'
              : 'Create an instance to install Minecraft, Fabric and a tuned mod stack.'
          }
          action={
            !instances.length ? (
              <button className="btn btn-primary" onClick={openNewInstance}>
                <Icon name="plus" size={15} /> Create instance
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="instance-grid">
          {filtered.map((instance) => (
            <article
              key={instance.id}
              className={`instance-card ${instance.running ? 'running' : ''}`}
              style={{ '--card-accent': instance.accent } as CSSProperties}
              onClick={() => navigate('instance', instance.id)}
            >
              <div className="instance-banner">
                <span className="instance-glow" />
                <span className="instance-glyph">{instance.icon || instance.name.slice(0, 1).toUpperCase()}</span>
                <div className="instance-badges">
                  <span className="badge">{instance.mcVersion}</span>
                  <span className={`badge ${instance.loader === 'fabric' ? 'badge-violet' : 'badge-plain'}`}>
                    {instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}
                  </span>
                  {instance.kind === 'server' && (
                    <span className="badge">
                      <Icon name="server" size={11} /> Server
                    </span>
                  )}
                </div>
                {instance.running && (
                  <span className="badge badge-live">
                    <span className="status-dot status-dot-live" /> Running
                  </span>
                )}
              </div>
              <div className="instance-body">
                <div className="instance-title">
                  <div>
                    <h3>{instance.name}</h3>
                    <span>
                      {instance.kind === 'server'
                        ? `${instance.modCount} mods · port ${instance.port ?? 25565}`
                        : `${instance.modCount} mods · ${Math.round(instance.memoryMb / 1024)} GB heap`}
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Delete ${instance.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void remove(instance.id, instance.name)
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <div className="instance-foot">
                  <span className="instance-last">{formatRelative(instance.lastPlayed)}</span>
                  <button
                    className={`btn btn-sm ${instance.running ? 'btn-ghost' : 'btn-soft'}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      selectInstance(instance.id)
                      if (!instance.running) void launch(instance.id)
                    }}
                    disabled={gameRunning && !instance.running}
                  >
                    <Icon name={instance.running ? 'monitor' : instance.kind === 'server' ? 'server' : 'play'} size={12} />
                    {instance.running ? 'Running' : instance.kind === 'server' ? 'Start' : 'Play'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
