import { useCallback, useMemo, type ChangeEvent, type CSSProperties, type MouseEvent } from 'react'
import { packsFor } from '@shared/packs'
import { formatPlaytime, formatRelative, useApp } from '../context'
import { Icon, PolarisMark } from '../components/Icons'
import { CosmeticBadge } from '../components/Cosmetics'
import { EmptyState } from '../components/Feedback'

// Constructing an Intl.DateTimeFormat is much pricier than using one, so build
// it once at module scope.
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

// Static marketing chips: hoisted so a progress tick does not re-allocate them.
const SERVER_CHIPS = [
  ['Fabric API', 'chip-violet'],
  ['Lithium', 'chip-cyan'],
  ['Krypton', 'chip-pink']
]

const CLIENT_CHIPS = [
  ['Sodium', 'chip-violet'],
  ['Lithium', 'chip-cyan'],
  ['FerriteCore', 'chip-pink']
]

export function HomePage(): JSX.Element {
  const {
    boot,
    hardware,
    instances,
    activeInstance,
    activeInstanceId,
    selectInstance,
    detail,
    navigate,
    launch,
    stop,
    gameRunning,
    launchState,
    openNewInstance,
    openAccount
  } = useApp()

  const active = activeInstance
  const isServer = active?.kind === 'server'
  const mods = detail?.mods.length ?? active?.modCount ?? 0
  const account = boot.accounts.find((item) => item.id === boot.activeAccountId)

  // App rebuilds its context value on every progress tick, so this page renders
  // several times a second while a download runs. The memoized values below are
  // the ones that were actually expensive to recompute on each of those ticks.
  const today = new Date()
  const dayKey = today.toDateString()
  const dateLabel = useMemo(() => DAY_FORMAT.format(today), [dayKey])

  // Installed counts drive the pack cards. A slug set per pack makes this
  // O(installed mods) instead of O(mods x pack mods) per render.
  const packRows = useMemo(
    () =>
      packsFor(active?.kind).map((pack) => {
        const slugs = new Set(pack.mods.map((entry) => entry.slug))
        return {
          pack,
          installed: detail ? detail.mods.filter((mod) => slugs.has(mod.slug)).length : 0,
          enabled: active?.packs.includes(pack.id) ?? false
        }
      }),
    [active, detail]
  )

  // Stable handlers: cards and rows no longer allocate a fresh closure on every
  // tick, so memoized children (or future ones) are not invalidated needlessly.
  const openBuild = useCallback(() => {
    if (active) navigate('instance', active.id)
  }, [active, navigate])
  const toggleRun = useCallback(() => {
    void (gameRunning ? stop() : launch())
  }, [gameRunning, launch, stop])
  const selectActive = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => selectInstance(event.target.value),
    [selectInstance]
  )
  const playFromList = useCallback(
    (event: MouseEvent<HTMLButtonElement>, id: string) => {
      event.stopPropagation()
      selectInstance(id)
      void launch(id)
    },
    [launch, selectInstance]
  )

  if (instances.length === 0) {
    return (
      <div className="home">
        <div className="page-head">
          <div>
            <span className="eyebrow">Welcome to Polaris</span>
            <h1>Build your first client.</h1>
            <p className="page-sub">Pick a Minecraft version, choose Fabric, and let the performance stack install itself.</p>
          </div>
        </div>
        <EmptyState
          icon="sparkles"
          title="No instances yet"
          body="Create an instance to install Minecraft, Fabric and the performance packs in one pass."
          action={
            <button className="btn btn-primary" onClick={openNewInstance}>
              <Icon name="plus" size={15} /> Create instance
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home-topline">
        <span className="home-hello">
          {greeting()} —{' '}
          <b className="name-with-badge">
            {account?.name ?? 'no account'}
            {account && <CosmeticBadge id={boot.settings.equippedBadge} size={15} />}
          </b>
        </span>
        <span className="home-date">{dateLabel}</span>
      </div>

      {!account && (
        <button className="account-banner" onClick={openAccount}>
          <span className="account-banner-icon">
            <Icon name="user" size={17} />
          </span>
          <span>
            <strong>Add an account to start playing</strong>
            <small>Offline mode takes five seconds. Microsoft sign-in supports your own Azure client.</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      <section className="hero">
        <div className="hero-grain" />
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> {isServer ? 'Server ready' : 'Client ready'} · {active?.mcVersion ?? boot.latestVersion}
          </span>
          <h1>
            {isServer ? 'Host faster.' : 'Play faster.'}
            <br />
            <em>{isServer ? 'Stay smoother.' : 'Think clearer.'}</em>
          </h1>
          <p>
            {isServer
              ? 'A version-matched dedicated server stack with per-instance memory, JVM flags and a clean console. One port, no client overhead.'
              : 'A complete instance manager and a version-matched performance stack, tuned per machine. Every mod is matched to your exact Minecraft version — no guesswork, no duplicate jars.'}
          </p>
          <div className="hero-actions">
            <div className="instance-select">
              <span className="instance-select-mark" style={{ background: active?.accent }}>
                {active?.name.slice(0, 1).toUpperCase()}
              </span>
              <select value={activeInstanceId ?? ''} onChange={selectActive}>
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name} · {instance.mcVersion} · {instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={15} />
            </div>
            <button
              className={`btn btn-play ${gameRunning ? 'btn-stop' : ''}`}
              onClick={toggleRun}
              disabled={launchState.status === 'preparing'}
            >
              {launchState.status === 'preparing' ? (
                <span className="spinner spinner-sm" />
              ) : (
                <Icon name={gameRunning ? 'stop' : isServer ? 'server' : 'play'} size={17} />
              )}
              {gameRunning
                ? isServer
                  ? 'Stop server'
                  : 'Stop game'
                : launchState.status === 'preparing'
                  ? 'Preparing…'
                  : isServer
                    ? 'Start server'
                    : 'Play'}
            </button>
            <button className="btn btn-ghost" onClick={openBuild}>
              Manage build
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <Icon name="package" size={14} /> {mods} mods
            </span>
            <span>
              <Icon name="memory" size={14} /> {Math.round((active?.memoryMb ?? 4096) / 1024)} GB heap
            </span>
            <span>
              {isServer ? <Icon name="globe" size={14} /> : <Icon name="shield" size={14} />}{' '}
              {isServer ? `Port ${active?.port ?? 25565}` : `${detail?.instance.packs.length ?? 0} packs`}
            </span>
          </div>
        </div>

        <div className="hero-art">
          <div className="orbit">
            <span className="orbit-ring ring-a" />
            <span className="orbit-ring ring-b" />
            <span className="orbit-ring ring-c" />
            <span className="orbit-star star-a" />
            <span className="orbit-star star-b" />
            <span className="orbit-core">
              <PolarisMark size={54} />
            </span>

          </div>
          <div className="hero-chips">
            {(isServer ? SERVER_CHIPS : CLIENT_CHIPS).map(([name, color]) => (
              <span key={name} className={`chip ${color}`}>
                {name}
              </span>
            ))}
            <span className="chip">+{Math.max(0, mods - 3)}</span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <article className="stat-card">
          <span className="stat-icon">
            <Icon name="layers" size={17} />
          </span>
          <span className="stat-label">Instances</span>
          <strong>{instances.length}</strong>
          <small>{instances.filter((instance) => instance.loader === 'fabric').length} on Fabric</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Icon name="cpu" size={17} />
          </span>
          <span className="stat-label">Hardware tier</span>
          <strong className="capitalize">{hardware.tier}</strong>
          <small>{hardware.threads} threads · {hardware.ramGb} GB</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Icon name="coffee" size={17} />
          </span>
          <span className="stat-label">Java runtime</span>
          <strong>{boot.java[0]?.major ?? '—'}</strong>
          <small>{boot.java[0]?.vendor ?? 'Not detected'}</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Icon name="clock" size={17} />
          </span>
          <span className="stat-label">Playtime</span>
          <strong>{formatPlaytime(active?.playtimeMs ?? 0)}</strong>
          <small>Last played {formatRelative(active?.lastPlayed).toLowerCase()}</small>
        </article>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">{isServer ? 'Server stack' : 'Client stack'}</span>
            <h2>Packs on this instance</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={openBuild}>
            Open build <Icon name="chevron" size={14} />
          </button>
        </div>
        <div className="pack-grid">
          {packRows.map(({ pack, installed, enabled }) => {
            return (
              <button
                key={pack.id}
                className={`pack-card ${enabled ? 'enabled' : ''}`}
                style={{ '--pack': pack.color } as CSSProperties}
                onClick={openBuild}
              >
                <div className="pack-card-top">
                  <span className="pack-mark">
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
                      size={19}
                    />
                  </span>
                  <span className={`pack-state ${enabled ? 'on' : ''}`}>{enabled ? 'Active' : 'Off'}</span>
                </div>
                <strong>{pack.name}</strong>
                <p>{pack.tagline}</p>
                <div className="pack-progress">
                  <span>
                    <i style={{ width: `${pack.mods.length ? (installed / pack.mods.length) * 100 : 0}%` }} />
                  </span>
                  <small>
                    {installed}/{pack.mods.length}
                  </small>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Library</span>
            <h2>Recent instances</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('instances')}>
            All instances <Icon name="chevron" size={14} />
          </button>
        </div>
        <div className="recent-list">
          {instances.slice(0, 3).map((instance) => (
            <div key={instance.id} className="recent-row" onClick={() => navigate('instance', instance.id)}>
              <span className="recent-mark" style={{ background: `linear-gradient(135deg, ${instance.accent}, #0d0f1a)` }}>
                {instance.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="recent-copy">
                <strong>{instance.name}</strong>
                <span>
                  {instance.mcVersion} · {instance.kind === 'server' ? `Server · port ${instance.port ?? 25565}` : instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · {instance.modCount} mods
                </span>
              </div>
              <span className="recent-time">{formatRelative(instance.lastPlayed)}</span>
              <button
                className="icon-btn play-mini"
                aria-label={`${instance.kind === 'server' ? 'Start' : 'Play'} ${instance.name}`}
                onClick={(event) => playFromList(event, instance.id)}
              >
                <Icon name={instance.kind === 'server' ? 'server' : 'play'} size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Late session'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
