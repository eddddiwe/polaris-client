import { useMemo, useState, type CSSProperties } from 'react'
import { useApp, formatRelative, errorMessage } from '../context'
import { Icon } from '../components/Icons'
import { EmptyState } from '../components/Feedback'

export function InstancesPage(): JSX.Element {
  const { instances, navigate, launch, gameRunning, openNewInstance, api, refresh, toast, selectInstance, confirm } = useApp()
  const [query, setQuery] = useState('')

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

  return (
    <div className="instances-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Instances</h1>
          <p className="page-sub">Isolated game directories, per-instance Java, mods and performance policy.</p>
        </div>
        <div className="page-actions">
          <div className="search-field compact">
            <Icon name="search" size={15} />
            <input placeholder="Filter instances" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={openNewInstance}>
            <Icon name="plus" size={15} /> New instance
          </button>
        </div>
      </div>

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
              onClick={() => navigate('instance', instance.id)}
            >
              <div
                className="instance-banner"
                style={{ '--card-accent': instance.accent } as CSSProperties}
              >
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
