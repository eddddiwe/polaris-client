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
    // Step 1: Prompt for CurseForge ID or .mrpack upload
    const projectId = window.prompt(
      'CurseForge Project ID (leave empty to upload .mrpack file):'
    )
    
    if (projectId?.trim()) {
      // CurseForge ID provided (placeholder - swap with your API logic later)
      toast('CurseForge integration pending – add your API key later')
      return
    }

    setImporting(true)
    try {
      // Step 2: Upload .mrpack file via Electron dialog
      const { filePaths } = await window.require('electron').dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Modpack Files', extensions: ['mrpack'] }]
      })
      if (!filePaths?.[0]) return // user cancelled

      // Step 3: Validate file is a valid .mrpack (zip with manifest.json)
      const zip = await window.require('jszip').loadAsync(
        window.require('fs').readFileSync(filePaths[0])
      )
      if (!zip.file('manifest.json')) {
        toast('Invalid .mrpack: missing manifest.json')
        return
      }

      // Step 4: Parse the manifest
      const manifest = JSON.parse(
        await zip.file('manifest.json').async('text')
      )
      const modCount = manifest.mods ? manifest.mods.length : 0
      const modNames = manifest.mods?.map((m: any) => m.name).join(', ') || 'unknown'
      toast(`Imported modpack with ${modCount} mods: ${modNames}`)

      // Step 5: Auto-create instance with extracted modpack data
      try {
        await api.createInstance({
          name: manifest.name || 'Imported Modpack',
          mcVersion: manifest.mc_version || '1.20.1',
          loader: manifest.loaders?.[0] || 'fabric'
        })
        toast('Instance created successfully – mods can be installed from the mod list below')
      } catch (createErr) {
        toast('Failed to create instance: ' + (createErr instanceof Error ? createErr.message : 'unknown error'))
      }
      toast('Modpack parsed – ready for instance creation')
    } catch (err) {
      toast('Failed to parse .mrpack: ' + (err instanceof Error ? err.message : 'unknown error'))
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
          <div className="search-field compact">
            <Icon name="search" size={15} />
            <input placeholder="Filter instances" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={openNewInstance}>
            <Icon name="plus" size={15} /> New instance
          </button>
          <button className="btn btn-secondary" onClick={importModpack} disabled={importing}>
            <Icon name="folder" size={15} /> Import .mrpack
          </button>
          <button className="btn btn-primary" onClick={checkUpdates}>
            <Icon name="refresh" size={15} /> Check for updates
          </button>
        </div>
      </div>
      {boot.updateInfo?.hasUpdate && (
        <div className="update-banner">
          <div className="update-info">
            <strong>Update available: v{boot.updateInfo.latestVersion}</strong>
            <span>Current: v{boot.updateInfo.currentVersion}</span>
            {boot.updateInfo.releaseNotes && <p className="release-notes">{boot.updateInfo.releaseNotes}</p>}
          </div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await api.installUpdate()
              toast('Opening download page...', 'info')
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
