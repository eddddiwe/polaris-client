import { useEffect, useState, type CSSProperties } from 'react'
import type {
  GameUiOptions,
  GameUiSnapshot,
  JvmPresetId,
  ModUpdateInfo,
  PackDefinition,
  PerfPlan,
  PerfProfileId
} from '@shared/types'
import { packsFor } from '@shared/packs'
import type { PolarisAPI } from '@shared/api'
import { errorMessage, formatBytes, formatPlaytime, formatRelative, useApp } from '../context'
import { Icon } from '../components/Icons'
import { EmptyState, Spinner, Switch } from '../components/Feedback'

type Tab = 'overview' | 'mods' | 'performance' | 'logs'

export function InstancePage(): JSX.Element {
  const { detail, activeInstance, navigate, launch, stop, gameRunning, launchState, api, refresh, reloadDetail, toast, boot } =
    useApp()
  const [tab, setTab] = useState<Tab>('overview')

  if (!detail) {
    return (
      <div className="instance-detail">
        <button className="back-link" onClick={() => navigate('instances')}>
          <Icon name="back" size={15} /> Instances
        </button>
        <Spinner label="Loading instance" />
      </div>
    )
  }

  const instance = detail.instance
  const running = activeInstance?.running && gameRunning
  const preparing = launchState.status === 'preparing' && launchState.instanceId === instance.id

  return (
    <div className="instance-detail">
      <button className="back-link" onClick={() => navigate('instances')}>
        <Icon name="back" size={15} /> Instances
      </button>

      <header className="detail-hero" style={{ '--card-accent': instance.accent } as CSSProperties}>
        <span className="detail-glow" />
        <span className="detail-glyph">{instance.icon || instance.name.slice(0, 1).toUpperCase()}</span>
        <div className="detail-title">
          <span className="eyebrow">
            {instance.kind === 'server' ? 'Dedicated server' : 'Instance'} · {instance.id}
          </span>
          <h1>{instance.name}</h1>
          <div className="detail-chips">
            {instance.kind === 'server' && (
              <span className="badge badge-violet">
                <Icon name="server" size={11} /> Server
              </span>
            )}
            <span className="badge">{instance.mcVersion}</span>
            <span className="badge">{instance.loader === 'fabric' ? `Fabric ${instance.loaderVersion ?? ''}` : 'Vanilla'}</span>
            <span className="badge">{detail.mods.length} mods</span>
            {instance.kind === 'server' ? (
              <>
                <span className="badge">Port {instance.port ?? 25565}</span>
                <span className={`badge ${instance.eulaAccepted ? 'badge-plain' : 'badge-warn'}`}>
                  {instance.eulaAccepted ? 'EULA accepted' : 'EULA required'}
                </span>
              </>
            ) : (
              <span className="badge">{formatPlaytime(instance.playtimeMs)}</span>
            )}
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-ghost" onClick={() => void api.openInstanceFolder(instance.id)}>
            <Icon name="folder" size={15} /> Folder
          </button>
          <button
            className={`btn ${running ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => (running ? void stop() : void launch(instance.id))}
            disabled={preparing || (gameRunning && !running) || (instance.kind === 'server' && !instance.eulaAccepted)}
            title={instance.kind === 'server' && !instance.eulaAccepted ? 'Accept the Minecraft EULA first' : undefined}
          >
            {preparing ? (
              <span className="spinner spinner-sm" />
            ) : (
              <Icon name={running ? 'stop' : instance.kind === 'server' ? 'server' : 'play'} size={15} />
            )}
            {running ? 'Stop' : preparing ? 'Preparing…' : instance.kind === 'server' ? 'Start server' : 'Play'}
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ['overview', 'Overview'],
            ['mods', `Mods ${detail.mods.length}`],
            ['performance', 'Performance'],
            ['logs', 'Logs']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview instance={instance} detail={detail} reloadDetail={reloadDetail} refresh={refresh} toast={toast} />}
      {tab === 'mods' && <ModsTab navigate={navigate} />}
      {tab === 'performance' && <PerformanceTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  )
}

function Overview({
  instance,
  detail,
  reloadDetail,
  refresh,
  toast
}: {
  instance: import('@shared/types').InstanceConfig
  detail: import('@shared/types').InstanceDetail
  reloadDetail: () => Promise<void>
  refresh: () => Promise<void>
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void
}): JSX.Element {
  const { boot, api, java, settings, gameRunning, activeInstance } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [memory, setMemory] = useState(instance.memoryMb)
  const [name, setName] = useState(instance.name)
  const [notes, setNotes] = useState(instance.notes)
  const [saving, setSaving] = useState(false)
  const [port, setPort] = useState(instance.port ?? 25565)
  const [savingPort, setSavingPort] = useState(false)
  const isServer = instance.kind === 'server'
  const running = Boolean(activeInstance?.running && gameRunning)

  const applyPack = async (pack: PackDefinition): Promise<void> => {
    setBusy(pack.id)
    try {
      const result = await api.applyPack(instance.id, pack.id)
      if (result.result.installed.length) toast(`${pack.name}: ${result.result.installed.length} installed`, 'success')
      else if (result.result.skipped.length) toast(`${pack.name}: already up to date`)
      else toast(`${pack.name}: no compatible releases for ${instance.mcVersion}`, 'error')
      const failed = result.result.failed[0]
      if (failed) toast(`${failed.name}: ${failed.error}`, 'error')
      await reloadDetail()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveName = async (): Promise<void> => {
    if (!name.trim() || name === instance.name) return
    try {
      await api.updateInstance(instance.id, { name: name.trim() })
      await refresh()
      toast('Instance name updated', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }
  const saveMemory = async (): Promise<void> => {
    setSaving(true)
    try {
      await api.updateInstance(instance.id, { memoryMb: memory })
      await refresh()
      toast('Memory allocation saved', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async (): Promise<void> => {
    try {
      await api.updateInstance(instance.id, { notes })
      toast('Notes saved')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const savePort = async (): Promise<void> => {
    setSavingPort(true)
    try {
      await api.updateInstance(instance.id, { port })
      await refresh()
      toast('Port saved — applies on the next start', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSavingPort(false)
    }
  }

  const saveEula = async (accepted: boolean): Promise<void> => {
    try {
      await api.updateInstance(instance.id, { eulaAccepted: accepted })
      await refresh()
      toast(accepted ? 'EULA accepted' : 'EULA acceptance removed', accepted ? 'success' : 'info')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const runtimeJava = java.find((entry) => entry.path === (instance.javaPath || settings.javaPath)) ?? java[0]

  return (
    <div className="detail-grid">
      <div className="detail-main">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">{isServer ? 'Server stack' : 'Client stack'}</span>
              <h2>Packs</h2>
            </div>
            <span className="panel-hint">Version-matched · deduplicated</span>
          </div>
          <div className="pack-stack">
            {packsFor(instance.kind).map((pack) => {
              const installed = detail.mods.filter((mod) => pack.mods.some((entry) => entry.slug === mod.slug))
              const enabled = instance.packs.includes(pack.id)
              return (
                <div key={pack.id} className="pack-row" style={{ '--pack': pack.color } as CSSProperties}>
                  <span className="pack-row-mark">
                    <Icon
                      name={
                        pack.id === 'performance'
                          ? 'zap'
                          : pack.id === 'qol'
                            ? 'sparkles'
                            : pack.id === 'hud'
                              ? 'monitor'
                              : pack.id === 'server'
                                ? 'server'
                                : 'star'
                      }
                      size={18}
                    />
                  </span>
                  <div className="pack-row-copy">
                    <div className="pack-row-title">
                      <strong>{pack.name}</strong>
                      {enabled && <span className="badge badge-violet">Active</span>}
                    </div>
                    <span>{pack.tagline}</span>
                    <div className="pack-members">
                      {pack.mods.slice(0, 5).map((mod) => {
                        const present = detail.mods.some((item) => item.slug === mod.slug)
                        return (
                          <span key={mod.slug} className={`mini-mod ${present ? 'on' : ''}`}>
                            {mod.name}
                          </span>
                        )
                      })}
                      {pack.mods.length > 5 && <span className="mini-mod muted">+{pack.mods.length - 5}</span>}
                    </div>
                  </div>
                  <div className="pack-row-side">
                    <span className="pack-count">
                      {installed.length}/{pack.mods.length}
                    </span>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => void applyPack(pack)}
                      disabled={busy !== null || instance.loader !== 'fabric'}
                      title={instance.loader !== 'fabric' ? 'Fabric is required to install mods' : undefined}
                    >
                      {busy === pack.id ? <span className="spinner spinner-sm" /> : enabled ? 'Repair' : 'Install'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {instance.loader !== 'fabric' && (
            <div className="fine-print">Vanilla instances cannot load mods. Create a Fabric instance to use packs.</div>
          )}
        </section>

        {isServer && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Dedicated server</span>
                <h2>Server settings</h2>
              </div>
              <span className="panel-hint">{running ? 'Stop the server to edit' : 'Applied on the next start'}</span>
            </div>
            <div className="server-fields">
              <div className="field">
                <label htmlFor="server-port">Port</label>
                <div className="row-input">
                  <input
                    id="server-port"
                    type="number"
                    min={1024}
                    max={65535}
                    value={port}
                    disabled={running}
                    onChange={(event) => setPort(Number(event.target.value))}
                  />
                  <button
                    className="btn btn-soft btn-sm"
                    disabled={running || savingPort || port === instance.port || port < 1024 || port > 65535}
                    onClick={() => void savePort()}
                  >
                    {savingPort ? <span className="spinner spinner-sm" /> : 'Save'}
                  </button>
                </div>
                <span className="hint">Players connect to this port. Forward it on your router for public access.</span>
              </div>
              <label className={`eula-row ${running ? 'disabled' : ''}`}>
                <Switch
                  checked={Boolean(instance.eulaAccepted)}
                  onChange={(value) => void saveEula(value)}
                  label="Accept the Minecraft EULA"
                />
                <span>
                  <strong>Minecraft EULA</strong>
                  <small>Required before the first start. Written to eula.txt.</small>
                </span>
              </label>
            </div>
            <div className="panel-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void api.openExternal('https://www.minecraft.net/en-us/eula')}
              >
                <Icon name="external" size={14} /> Read the EULA
              </button>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Memory</span>
              <h2>Runtime</h2>
            </div>
            <span className="panel-hint">
              {gameRunning ? `${isServer ? 'Server' : 'Game'} running — settings locked` : 'Safe range for this machine'}
            </span>
          </div>
          <div className="runtime-grid">
            <div>
              <span className="field-label">Heap allocation</span>
              <div className="memory-control">
                <input
                  type="range"
                  min={2048}
                  max={Math.min(16384, Math.max(4096, Math.round((boot.hardware.ramGb * 1024) / 2)))}
                  step={512}
                  value={memory}
                  disabled={gameRunning}
                  onChange={(event) => setMemory(Number(event.target.value))}
                />
                <strong>{Math.round(memory / 1024)} GB</strong>
              </div>
              <span className="hint">
                System memory {boot.hardware.ramGb} GB · recommended {Math.round(boot.hardware.recommendedMemoryMb / 1024)} GB
              </span>
            </div>
            <div className="kv-list">
              <div>
                <span>Java</span>
                <b>{runtimeJava ? `${runtimeJava.major} · ${runtimeJava.vendor}` : 'Not found'}</b>
              </div>
              <div>
                <span>{isServer ? 'Server directory' : 'Game directory'}</span>
                <b>{formatBytes(activeInstance?.diskBytes ?? 0)}</b>
              </div>
              <div>
                <span>{isServer ? 'Last started' : 'Last played'}</span>
                <b>{formatRelative(instance.lastPlayed)}</b>
              </div>
              <div>
                <span>Profile</span>
                <b className="capitalize">{instance.perfProfile}</b>
              </div>
            </div>
          </div>
          <div className="panel-actions">
            <button className="btn btn-soft btn-sm" onClick={() => void saveMemory()} disabled={saving || gameRunning || memory === instance.memoryMb}>
              {saving ? <span className="spinner spinner-sm" /> : <Icon name="check" size={14} />} Save heap
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void api.openInstanceFolder(instance.id)}>
              <Icon name="folder" size={14} /> Open folder
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void api.openLogsFolder(instance.id)}>
              <Icon name="terminal" size={14} /> Logs
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Notebook</span>
              <h2>Notes</h2>
            </div>
          </div>
          <textarea
            className="notes"
            value={notes}
            placeholder="Keybinds, server addresses, mod quirks…"
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
          />
          <div className="panel-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => void saveNotes()} disabled={notes === instance.notes}>
              Save notes
            </button>
          </div>
        </section>
      </div>

      <aside className="detail-side">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Identity</span>
              <h2>Build info</h2>
            </div>
          </div>
          <div className="kv-list">
            <div>
              <span>Name</span>
              <div className="row-input">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void saveName()}
                  className="input-sm"
                />
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => void saveName()}
                  disabled={name.trim() === instance.name || !name.trim()}
                >
                  Save
                </button>
              </div>
            </div>
            <div>
              <span>Minecraft</span>
              <b>{instance.mcVersion}</b>
            </div>
            <div>
              <span>Loader</span>
              {instance.loader === 'fabric' ? (
                <FabricLoaderSelector instance={instance} api={api} reloadDetail={reloadDetail} toast={toast} />
              ) : (
                <b>Vanilla</b>
              )}
            </div>
            <div>
              <span>Created</span>
              <b>{new Date(instance.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</b>
            </div>
            <div>
              <span>Packs</span>
              <b>{instance.packs.length || 'None'}</b>
            </div>
            <div>
              <span>Accent</span>
              <b>
                <span className="accent-dot" style={{ background: instance.accent }} /> {instance.accent}
              </b>
            </div>
          </div>
        </section>

        <section className="panel tip-panel">
          <span className="tip-icon">
            <Icon name="zap" size={17} />
          </span>
          <h3>{isServer ? 'Server hygiene' : 'Performance hygiene'}</h3>
          <p>
            {isServer
              ? 'Servers keep the whole world in memory. Leave headroom for the OS, and prefer Aikar flags for survival worlds.'
              : 'Keep heap between 4–8 GB for most packs. More memory does not mean more FPS; it usually means longer GC pauses.'}
          </p>
        </section>

        <section className="panel danger-panel">
          <h3>Danger zone</h3>
          <p>Deleting removes the instance folder, including saves and mods.</p>
          <DeleteButton id={instance.id} name={instance.name} />
        </section>
      </aside>
    </div>
  )
}

function DeleteButton({ id, name }: { id: string; name: string }): JSX.Element {
  const { api, refresh, navigate, toast, gameRunning, confirm } = useApp()
  return (
    <button
      className="btn btn-danger btn-sm"
      disabled={gameRunning}
      onClick={async () => {
        const confirmed = await confirm({
          title: 'Delete instance?',
          message: `“${name}” and its entire game directory will be removed. This cannot be undone.`,
          confirmLabel: 'Delete instance',
          danger: true
        })
        if (!confirmed) return
        try {
          await api.deleteInstance(id)
          await refresh()
          navigate('instances')
          toast('Instance deleted')
        } catch (error) {
          toast(errorMessage(error), 'error')
        }
      }}
    >
      <Icon name="trash" size={14} /> Delete instance
    </button>
  )
}

function ModsTab({ navigate }: { navigate: (page: 'discover') => void }): JSX.Element {
  const { detail, api, reloadDetail, refresh, toast, gameRunning, confirm } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [updates, setUpdates] = useState<ModUpdateInfo[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const instanceId = detail?.instance.id
  const modCount = detail?.mods.length ?? 0

  useEffect(() => {
    if (!instanceId) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      api
        .modUpdates(instanceId)
        .then((found) => {
          if (!cancelled) setUpdates(found)
        })
        .catch(() => undefined)
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [api, instanceId, modCount])

  if (!detail) return <Spinner />
  const instance = detail.instance
  const isServer = instance.kind === 'server'

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      const found = await api.modUpdates(instance.id)
      setUpdates(found)
      toast(
        found.length ? `${found.length} update${found.length === 1 ? '' : 's'} available` : 'All mods are up to date',
        found.length ? 'info' : 'success'
      )
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setChecking(false)
    }
  }

  const applyUpdates = async (projectId?: string): Promise<void> => {
    setUpdating(projectId ?? 'all')
    try {
      const result = await api.updateMods(instance.id, projectId ? [projectId] : undefined)
      if (result.updates.length === 0) {
        toast('Everything is already up to date')
      } else {
        toast(`Updated ${result.updates.length} mod${result.updates.length === 1 ? '' : 's'}`, 'success')
        const failed = result.result.failed[0]
        if (failed) toast(`${failed.name}: ${failed.error}`, 'error')
      }
      setUpdates(await api.modUpdates(instance.id))
      await reloadDetail()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setUpdating(null)
    }
  }

  const toggle = async (identifier: string): Promise<void> => {
    setBusy(identifier)
    try {
      await api.toggleMod(instance.id, identifier)
      await reloadDetail()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (identifier: string, name: string): Promise<void> => {
    const confirmed = await confirm({
      title: 'Remove mod?',
      message: `${name} will be deleted from this instance's mods folder.`,
      confirmLabel: 'Remove mod',
      danger: true
    })
    if (!confirmed) return
    setBusy(identifier)
    try {
      await api.removeMod(instance.id, identifier)
      await reloadDetail()
      await refresh()
      toast(`${name} removed`)
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel mods-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">{isServer ? 'Server mods' : 'Runtime classpath'}</span>
          <h2>Installed mods</h2>
        </div>
        <div className="panel-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void checkUpdates()} disabled={checking || modCount === 0}>
            {checking ? <span className="spinner spinner-sm" /> : <Icon name="refresh" size={14} />} Check updates
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => navigate('discover')}>
            <Icon name="search" size={14} /> Browse mods
          </button>
        </div>
      </div>

      {updates && updates.length > 0 && (
        <div className="update-banner">
          <span className="update-banner-icon">
            <Icon name="arrowUp" size={16} />
          </span>
          <div className="update-banner-copy">
            <strong>
              {updates.length} update{updates.length === 1 ? '' : 's'} available
            </strong>
            <span>Newer compatible files found on Modrinth for {instance.mcVersion}.</span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={updating !== null || gameRunning}
            onClick={() => void applyUpdates()}
          >
            {updating === 'all' ? <span className="spinner spinner-sm" /> : <Icon name="arrowUp" size={13} />} Update all
          </button>
        </div>
      )}

      {updates && updates.length === 0 && modCount > 0 && (
        <div className="mods-fresh">
          <Icon name="check" size={13} /> All tracked mods are up to date.
        </div>
      )}

      {detail.mods.length === 0 ? (
        <EmptyState
          icon="package"
          title="No mods installed"
          body={
            isServer
              ? 'Apply the Server Performance pack to add Lithium, Krypton, C2ME and friends to this server.'
              : 'Apply the Performance Core pack or browse Modrinth to add a single mod.'
          }
          action={
            <button className="btn btn-primary btn-sm" onClick={() => navigate('discover')}>
              <Icon name="compass" size={14} /> Discover mods
            </button>
          }
        />
      ) : (
        <div className="mod-list">
          {detail.mods.map((mod) => {
            const update = mod.projectId ? updates?.find((item) => item.projectId === mod.projectId) : undefined
            return (
              <div key={mod.filename} className={`mod-row ${mod.enabled ? '' : 'disabled'}`}>
                <span className="mod-icon">{mod.name.slice(0, 1).toUpperCase()}</span>
                <div className="mod-copy">
                  <div className="mod-name">
                    <strong>{mod.name}</strong>
                    <span className={`src src-${mod.source}`}>{mod.source}</span>
                  </div>
                  <span>
                    {mod.versionNumber || 'User-dropped jar'} · {mod.filename}
                  </span>
                </div>
                <div className="mod-side-meta">
                  {update && (
                    <button
                      className="mod-update-pill"
                      disabled={updating !== null || gameRunning}
                      title={`Update ${mod.name} to ${update.newVersionNumber}`}
                      onClick={() => void applyUpdates(mod.projectId)}
                    >
                      {updating === mod.projectId ? (
                        <span className="spinner spinner-sm" />
                      ) : (
                        <Icon name="arrowUp" size={12} />
                      )}
                      {update.newVersionNumber}
                    </button>
                  )}
                  <span className="mod-size">{mod.size ? formatBytes(mod.size) : ''}</span>
                </div>
                <Switch
                  checked={mod.enabled}
                  label={`Enable ${mod.name}`}
                  onChange={() => void toggle(mod.projectId || mod.filename)}
                />
                <button
                  className="icon-btn"
                  aria-label={`Remove ${mod.name}`}
                  disabled={busy === (mod.projectId || mod.filename) || gameRunning}
                  onClick={() => void remove(mod.projectId || mod.filename, mod.name)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className="fine-print">
        Disabling renames a jar to <code>.jar.disabled</code>; nothing is deleted until you remove it. Fabric only loads jars at
        startup.
      </div>
    </section>
  )
}

const JVM_PRESETS: { id: JvmPresetId; name: string; sub: string }[] = [
  { id: 'aikar', name: 'Aikar', sub: 'G1 · throughput' },
  { id: 'low-latency', name: 'Low latency', sub: 'G1 · 50 ms pauses' },
  { id: 'zgc', name: 'ZGC', sub: 'Generational · Java 21+' },
  { id: 'custom', name: 'Custom', sub: 'Your own flags' }
]

const LOG_LEVELS: Record<string, string> = {
  INFO: '#4ade80',
  WARN: '#fbbf24',
  ERROR: '#f87171',
  FATAL: '#fb7185',
  DEBUG: '#8ea4ff',
  TRACE: '#7d88a5'
}
const LOG_MESSAGE_COLOR = '#c9d1e8'
const LOG_MUTED_COLOR = '#5f6a86'
const LOG_TIME_COLOR = '#8a93b3'

function logSegments(line: string): { text: string; color: string }[] {
  const level = line.match(/\/(INFO|WARN|ERROR|DEBUG|FATAL|TRACE):/)
  const time = line.match(/\d{1,2}:\d{2}(?::\d{2})?/)
  const timeText = time ? time[0] : ''
  const timeStart = time ? line.indexOf(timeText) : -1
  const timeEnd = timeStart + timeText.length
  const levelStart = level ? line.indexOf(level[0], timeEnd) : -1
  const levelText = level ? level[0] : ''
  const levelEnd = levelStart + levelText.length
  const levelColor = level ? LOG_LEVELS[level[1].toUpperCase()] ?? LOG_MUTED_COLOR : LOG_MUTED_COLOR
  const segments: { text: string; color: string }[] = []
  const add = (from: number, to: number, color: string): void => {
    const text = line.slice(from, to)
    if (text) segments.push({ text, color })
  }
  if (!level) {
    add(0, timeEnd, LOG_MUTED_COLOR)
    add(timeStart, timeEnd, LOG_TIME_COLOR)
    add(timeEnd, line.length, LOG_MESSAGE_COLOR)
    return segments
  }
  add(0, timeStart, LOG_MUTED_COLOR)
  add(timeStart, timeEnd, LOG_TIME_COLOR)
  if (levelStart > timeEnd) add(timeEnd, levelStart, LOG_MUTED_COLOR)
  add(levelStart, levelEnd, levelColor)
  add(levelEnd, line.length, LOG_MESSAGE_COLOR)
  return segments
}

function PerformanceTab(): JSX.Element {
  const { detail, api, reloadDetail, refresh, toast, gameRunning, hardware } = useApp()
  const [profile, setProfile] = useState<PerfProfileId>(detail?.instance.perfProfile ?? 'balanced')
  const [memory, setMemory] = useState(detail?.instance.memoryMb ?? 8192)
  const [preset, setPreset] = useState<JvmPresetId>(detail?.instance.jvmPreset ?? 'aikar')
  const [customArgs, setCustomArgs] = useState(detail?.instance.customJvmArgs ?? '')
  const [savingArgs, setSavingArgs] = useState(false)
  const [plan, setPlan] = useState<PerfPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [gameUi, setGameUi] = useState<GameUiSnapshot | null>(null)
  const [uiBusy, setUiBusy] = useState(false)
  const instanceId = detail?.instance.id
  const isServer = detail?.instance.kind === 'server'

  useEffect(() => {
    if (!instanceId) return
    let cancelled = false
    api
      .planPerformance(instanceId, profile, memory, preset)
      .then((value) => {
        if (!cancelled) setPlan(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, instanceId, profile, memory, preset])

  useEffect(() => {
    if (!instanceId || isServer) {
      setGameUi(null)
      return
    }
    let cancelled = false
    api
      .gameUi(instanceId)
      .then((value) => {
        if (!cancelled) setGameUi(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, instanceId, isServer])

  if (!detail) return <Spinner />
  const presetLabel = JVM_PRESETS.find((item) => item.id === preset)?.name ?? 'JVM'

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.applyPerformance(detail.instance.id, profile, memory, preset)
      if (isServer) toast('JVM settings saved — they apply on the next start', 'success')
      else toast(result.changed ? `Applied ${result.changed} video settings` : 'Video settings were already optimal', 'success')
      await reloadDetail()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveArgs = async (): Promise<void> => {
    setSavingArgs(true)
    try {
      await api.updateInstance(detail.instance.id, { customJvmArgs: customArgs })
      await refresh()
      toast('Custom JVM flags saved', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSavingArgs(false)
    }
  }

  const applyUi = async (): Promise<void> => {
    if (!gameUi) return
    setUiBusy(true)
    try {
      const result = await api.applyGameUi(detail.instance.id, gameUi.values)
      setGameUi({ values: result.values, source: 'options.txt' })
      toast(result.changed ? `Saved ${result.changed} in-game interface settings` : 'Interface settings already match', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setUiBusy(false)
    }
  }

  const setUiValue = <K extends keyof GameUiOptions>(key: K, value: GameUiOptions[K]): void => {
    setGameUi((current) => (current ? { ...current, values: { ...current.values, [key]: value } } : current))
  }

  return (
    <div className="detail-grid">
      <div className="detail-main">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">{isServer ? 'Server runtime' : 'Frame policy'}</span>
              <h2>{isServer ? 'Memory & JVM' : 'Profile'}</h2>
            </div>
            <span className="panel-hint">{hardware.gpu}</span>
          </div>

          {!isServer && (
            <div className="profile-grid">
              {(
                [
                  ['competitive', 'Competitive', 'Lowest latency', 'zap'],
                  ['balanced', 'Balanced', 'Recommended', 'sliders'],
                  ['quality', 'Quality', 'Visual fidelity', 'sparkles']
                ] as const
              ).map(([id, title, sub, icon]) => (
                <button key={id} className={`profile-card ${profile === id ? 'active' : ''}`} onClick={() => setProfile(id)}>
                  <span className="profile-icon">
                    <Icon name={icon} size={17} />
                  </span>
                  <strong>{title}</strong>
                  <span>{sub}</span>
                </button>
              ))}
            </div>
          )}

          <div className="field">
            <label className="label-row">
              <span>Heap allocation</span>
              <b>{Math.round(memory / 1024)} GB</b>
            </label>
            <input type="range" min={2048} max={16384} step={512} value={memory} onChange={(event) => setMemory(Number(event.target.value))} />
          </div>

          <div className="field">
            <label className="label-row">
              <span>JVM preset</span>
              <b>{JVM_PRESETS.find((item) => item.id === preset)?.name}</b>
            </label>
            <div className="preset-grid">
              {JVM_PRESETS.map((item) => (
                <button key={item.id} className={`preset-card ${preset === item.id ? 'active' : ''}`} onClick={() => setPreset(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {preset === 'custom' && (
            <div className="field">
              <label className="label-row">
                <span>Custom flags</span>
                <span className="hint">Appended before -jar; heap flags stay managed</span>
              </label>
              <textarea
                className="notes jvm-args"
                rows={4}
                value={customArgs}
                placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=100"
                onChange={(event) => setCustomArgs(event.target.value)}
                disabled={gameRunning}
              />
              <div className="panel-actions">
                <button
                  className="btn btn-soft btn-sm"
                  disabled={savingArgs || gameRunning || customArgs === detail.instance.customJvmArgs}
                  onClick={() => void saveArgs()}
                >
                  {savingArgs ? <span className="spinner spinner-sm" /> : <Icon name="check" size={14} />} Save flags
                </button>
              </div>
            </div>
          )}

          {plan && !isServer && (
            <div className="plan-options">
              {Object.entries(plan.options).map(([key, value]) => (
                <div key={key} className="plan-option">
                  <span>{optionLabel(key)}</span>
                  <b>{optionValue(key, value)}</b>
                </div>
              ))}
            </div>
          )}

          <div className="panel-actions">
            <button className="btn btn-primary" onClick={() => void apply()} disabled={busy || gameRunning}>
              {busy ? <span className="spinner spinner-sm" /> : <Icon name="zap" size={15} />}{' '}
              {isServer ? 'Save server settings' : 'Apply to instance'}
            </button>
            <span className="hint">
              {gameRunning
                ? `Close the ${isServer ? 'server' : 'game'} to apply.`
                : isServer
                  ? 'Servers do not use options.txt; only memory and JVM flags are saved.'
                  : 'Writes options.txt with a timestamped backup.'}
            </span>
          </div>
        </section>

        {!isServer && gameUi && (
          <section className="panel game-ui-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">In-game interface</span>
                <h2>Make the HUD yours.</h2>
              </div>
              <span className="panel-hint">
                {gameUi.source === 'options.txt' ? 'Read from options.txt' : 'Vanilla defaults'}
              </span>
            </div>
            <p className="modal-copy">
              These write vanilla Minecraft interface values. HUD modules and animated HUD themes come from the HUD pack once
              the instance is launched.
            </p>

            <div className="field">
              <label className="label-row">
                <span>GUI scale</span>
                <b>{gameUi.values.guiScale === 0 ? 'Auto' : `${gameUi.values.guiScale}×`}</b>
              </label>
              <div className="segmented">
                {[
                  [0, 'Auto'],
                  [1, '1×'],
                  [2, '2×'],
                  [3, '3×'],
                  [4, '4×']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={gameUi.values.guiScale === value ? 'active' : ''}
                    onClick={() => setUiValue('guiScale', Number(value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="wallpaper-tuning">
              <div className="field">
                <label className="label-row">
                  <span>Field of view</span>
                  <b>{gameUi.values.fov}°</b>
                </label>
                <input
                  type="range"
                  min={30}
                  max={110}
                  step={1}
                  value={gameUi.values.fov}
                  onChange={(event) => setUiValue('fov', Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label className="label-row">
                  <span>Brightness</span>
                  <b>{Math.round(gameUi.values.gamma * 100)}%</b>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={gameUi.values.gamma}
                  onChange={(event) => setUiValue('gamma', Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label className="label-row">
                  <span>Chat opacity</span>
                  <b>{Math.round(gameUi.values.chatOpacity * 100)}%</b>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={gameUi.values.chatOpacity}
                  onChange={(event) => setUiValue('chatOpacity', Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label className="label-row">
                  <span>Screen effects</span>
                  <b>{Math.round(gameUi.values.screenEffectScale * 100)}%</b>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={gameUi.values.screenEffectScale}
                  onChange={(event) => setUiValue('screenEffectScale', Number(event.target.value))}
                />
              </div>
            </div>

            <div className="field">
              <label className="label-row">
                <span>Attack indicator</span>
                <b>{['Off', 'Crosshair', 'Hotbar'][gameUi.values.attackIndicator]}</b>
              </label>
              <div className="segmented">
                {['Off', 'Crosshair', 'Hotbar'].map((label, index) => (
                  <button
                    key={label}
                    className={gameUi.values.attackIndicator === index ? 'active' : ''}
                    onClick={() => setUiValue('attackIndicator', index)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-actions">
              <button className="btn btn-soft" onClick={() => void applyUi()} disabled={uiBusy || gameRunning}>
                {uiBusy ? <span className="spinner spinner-sm" /> : <Icon name="check" size={15} />} Save interface
              </button>
              <span className="hint">
                {gameRunning ? 'Close Minecraft before changing interface options.' : 'A timestamped options.txt backup is written first.'}
              </span>
            </div>
          </section>
        )}
      </div>

      <aside className="detail-side">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">JVM</span>
              <h2>{presetLabel} flags</h2>
            </div>
          </div>
          <pre className="jvm-preview">{(plan?.jvmArgs ?? []).join('\n')}</pre>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Notes</span>
              <h2>Tuning</h2>
            </div>
          </div>
          <ul className="note-list">
            {(plan?.notes ?? [])
              .filter(
                (note) =>
                  !isServer ||
                  !/video settings|game must be closed|render distance|high-tier gpu|graphics/i.test(note)
              )
              .map((note) => (
                <li key={note}>{note}</li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

function LogsTab(): JSX.Element {
  const { detail, api, toast, launchState, refresh } = useApp()
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [command, setCommand] = useState('')

  useEffect(() => {
    if (!detail) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const value = await api.tailLogs(detail.instance.id, 400)
        if (!cancelled) setLines(value)
      } catch (error) {
        if (!cancelled) toast(errorMessage(error), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const interval = window.setInterval(() => {
      if (launchState.status === 'running') void load()
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [api, detail, launchState.status, toast])

  if (!detail) return <Spinner />
  const isServer = detail.instance.kind === 'server'

  const [crashes, setCrashes] = useState<{ name: string; path: string; size: number; modified: number }[]>([])
  const [safeMode, setSafeMode] = useState(false)

  useEffect(() => {
    if (!detail) return
    void api.listCrashReports(detail.instance.id).then(setCrashes).catch(() => {})
  }, [api, detail])

  const disableMods = async (): Promise<void> => {
    try {
      const result = await api.disableAllMods(detail.instance.id)
      toast(`Disabled ${result.disabled} mods. Try launching again.`, 'success')
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const send = async (): Promise<void> => {
    const value = command.trim()
    if (!value) return
    try {
      await api.serverCommand(detail.instance.id, value)
      setCommand('')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">latest.log</span>
          <h2>{isServer ? 'Server output' : 'Game output'}</h2>
        </div>
        <div className="panel-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openLogsFolder(detail.instance.id)}>
            <Icon name="folder" size={14} /> Open folder
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void api.tailLogs(detail.instance.id, 400).then(setLines)}
          >
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
      </div>
      {loading ? (
        <Spinner label="Reading log" />
      ) : (
        <pre className="log-view">
          {lines.length === 0 ? (
            'No log yet. Launch the instance to generate one.'
          ) : (
            lines.map((line, index) => (
              <span key={index} className="log-line">
                {logSegments(line).map((segment, segmentIndex) => (
                  <span key={segmentIndex} style={{ color: segment.color }}>
                    {segment.text}
                  </span>
                ))}
                {index < lines.length - 1 ? '\n' : ''}
              </span>
            ))
          )}
        </pre>
      )}
      {crashes.length > 0 && (
        <div className="crash-reports">
          <h3>Crash reports ({crashes.length})</h3>
          <div className="crash-list">
            {crashes.slice(0, 5).map((crash) => (
              <div key={crash.name} className="crash-item">
                <span className="crash-name">{crash.name}</span>
                <span className="crash-size">{Math.round(crash.size / 1024)}KB</span>
                <button className="btn btn-ghost btn-sm" onClick={() => void api.openExternal(`file://${crash.path}`)}>
                  <Icon name="folder" size={12} /> Open
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => void disableMods()}>
            <Icon name="shield" size={14} /> Disable all mods (safe mode)
          </button>
        </div>
      )}
      {isServer && (
        <form
          className="console-bar"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <span className="console-prompt">›</span>
          <input
            value={command}
            placeholder={launchState.status === 'running' ? 'say Hello, list, whitelist add Steve…' : 'Start the server to send commands'}
            disabled={launchState.status !== 'running'}
            onChange={(event) => setCommand(event.target.value)}
            aria-label="Server command"
          />
          <button className="btn btn-soft btn-sm" disabled={launchState.status !== 'running' || !command.trim()}>
            Send
          </button>
        </form>
      )}
    </section>
  )
}

function optionLabel(key: string): string {
  const labels: Record<string, string> = {
    renderDistance: 'Render distance',
    simulationDistance: 'Simulation distance',
    maxFps: 'Max framerate',
    enableVsync: 'VSync',
    graphicsMode: 'Graphics',
    particles: 'Particles',
    entityShadows: 'Entity shadows',
    biomeBlendRadius: 'Biome blend',
    mipmapLevels: 'Mipmaps',
    ao: 'Ambient occlusion'
  }
  return labels[key] ?? key
}

function optionValue(key: string, value: string): string {
  if (key === 'graphicsMode') return value === '0' ? 'Fast' : 'Fancy'
  if (key === 'particles') return value === '0' ? 'All' : value === '1' ? 'Decreased' : 'Minimal'
  if (value === 'true') return 'On'
  if (value === 'false') return 'Off'
  return value
}

function FabricLoaderSelector({ instance, api, reloadDetail, toast }: {
  instance: import('@shared/types').InstanceConfig
  api: PolarisAPI
  reloadDetail: () => Promise<void>
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void
}): JSX.Element {
  const [loaders, setLoaders] = useState<{ version: string; stable: boolean }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.fabricLoaders(instance.mcVersion).then((result) => {
      if (!cancelled) {
        setLoaders(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [api, instance.mcVersion])

  if (loading) return <span>Loading...</span>

  return (
    <select
      className="select-sm"
      value={instance.loaderVersion ?? ''}
      onChange={async (e) => {
        const newVersion = e.target.value
        if (newVersion && newVersion !== instance.loaderVersion) {
          try {
            await api.fabricEnsure(instance.mcVersion, newVersion)
            await api.updateInstance(instance.id, { loaderVersion: newVersion })
            await reloadDetail()
            toast(`Fabric loader updated to ${newVersion}`, 'success')
          } catch (err) {
            toast(errorMessage(err), 'error')
          }
        }
      }}
    >
      {loaders.map((loader) => (
        <option key={loader.version} value={loader.version}>
          {loader.version} {loader.stable ? '(stable)' : '(beta)'}
        </option>
      ))}
    </select>
  )
}
