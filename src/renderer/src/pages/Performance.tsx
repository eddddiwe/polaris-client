import { useEffect, useState, type CSSProperties } from 'react'
import type { PerfPlan, PerfProfileId } from '@shared/types'
import { errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { EmptyState, Spinner, Switch } from '../components/Feedback'

export function PerformancePage(): JSX.Element {
  const { detail, activeInstance, boot, hardware, api, refresh, reloadDetail, toast, gameRunning, openNewInstance, navigate } = useApp()
  const instance = detail?.instance ?? activeInstance
  const [profile, setProfile] = useState<PerfProfileId>(instance?.perfProfile ?? 'balanced')
  const [memory, setMemory] = useState(instance?.memoryMb ?? hardware.recommendedMemoryMb)
  const [plan, setPlan] = useState<PerfPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!instance) return
    setProfile(instance.perfProfile)
    setMemory(instance.memoryMb)
  }, [instance?.id])

  useEffect(() => {
    if (!instance) return
    let cancelled = false
    api
      .planPerformance(instance.id, profile, memory)
      .then((value) => {
        if (!cancelled) setPlan(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, instance?.id, profile, memory])

  const apply = async (): Promise<void> => {
    if (!instance) return
    setBusy(true)
    try {
      const result = await api.applyPerformance(instance.id, profile, memory)
      toast(`${result.plan.profile} profile applied · ${result.changed} settings changed`, 'success')
      await reloadDetail()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const rescan = async (): Promise<void> => {
    setScanning(true)
    try {
      await api.scanPerformance()
      await refresh()
      toast('Hardware and Java rescanned', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setScanning(false)
    }
  }

  const setSetting = async (key: 'closeLauncherOnPlay' | 'lowerLauncherPriority' | 'pauseUiDuringGame' | 'mirrorVanillaCache', value: boolean): Promise<void> => {
    try {
      await api.updateSettings({ [key]: value })
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  if (!instance) {
    return (
      <div>
        <div className="page-head">
          <div>
            <span className="eyebrow">Performance studio</span>
            <h1>No instance selected</h1>
          </div>
        </div>
        <EmptyState
          icon="gauge"
          title="Select a build to tune"
          body="Performance plans are per instance: heap, GC flags, render distance and particles."
          action={
            <button className="btn btn-primary" onClick={openNewInstance}>
              <Icon name="plus" size={15} /> New instance
            </button>
          }
        />
      </div>
    )
  }

  const score = plan?.score ?? 0

  return (
    <div className="perf-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Performance studio</span>
          <h1>Make every frame count.</h1>
          <p className="page-sub">
            Tuning <b>{instance.name}</b>. Plans are calculated from this machine, not copied from a benchmark chart.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => void rescan()} disabled={scanning}>
          {scanning ? <span className="spinner spinner-sm" /> : <Icon name="refresh" size={15} />} Rescan hardware
        </button>
      </div>

      <div className="tier-rail">
        {(
          [
            ['entry', 'Low tier', '4–8 GB · integrated or older GPU'],
            ['mainstream', 'Mid tier', '8–16 GB · mainstream GPU'],
            ['high', 'High tier', '16–24 GB · RTX 30 / RX 6000'],
            ['enthusiast', 'Enthusiast', '24 GB+ · RTX 40/50 · RX 7000+']
          ] as const
        ).map(([id, label, detail]) => (
          <div key={id} className={`tier-cell ${hardware.tier === id ? 'active' : ''}`}>
            <span className="tier-dot" />
            <strong>{label}</strong>
            <small>{detail}</small>
            {hardware.tier === id && <em>This machine</em>}
          </div>
        ))}
      </div>

      <div className="hw-grid">
        <div className="hw-card">
          <span className="hw-icon">
            <Icon name="cpu" size={18} />
          </span>
          <span className="hw-label">Processor</span>
          <strong>{hardware.cpu.replace(/\s+\d+-Core Processor/i, '')}</strong>
          <small>
            {hardware.threads} threads · tier {hardware.tier}
          </small>
        </div>
        <div className="hw-card">
          <span className="hw-icon">
            <Icon name="monitor" size={18} />
          </span>
          <span className="hw-label">Graphics</span>
          <strong>{hardware.gpu}</strong>
          <small>{hardware.gpuVendor}</small>
        </div>
        <div className="hw-card">
          <span className="hw-icon">
            <Icon name="memory" size={18} />
          </span>
          <span className="hw-label">Memory</span>
          <strong>{hardware.ramGb} GB</strong>
          <small>Recommended heap {Math.round(hardware.recommendedMemoryMb / 1024)} GB</small>
        </div>
        <div className="hw-card">
          <span className="hw-icon">
            <Icon name="coffee" size={18} />
          </span>
          <span className="hw-label">Java</span>
          <strong>{boot.java[0] ? `Java ${boot.java[0].major}` : 'Not detected'}</strong>
          <small>{boot.java[0]?.vendor ?? 'Install Temurin 21+'}</small>
        </div>
      </div>

      <div className="perf-grid">
        <div className="perf-main">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Frame policy</span>
                <h2>Choose a profile</h2>
              </div>
              <span className="panel-hint">Applies options.txt + JVM flags</span>
            </div>
            <div className="profile-grid">
              {(
                [
                  ['competitive', 'Competitive', 'Lowest input latency', 'Frames over fidelity: fog-free distance, minimal particles, no shadows.', 'zap'],
                  ['balanced', 'Balanced', 'Recommended', 'A stable high frame rate with vanilla visuals intact.', 'sliders'],
                  ['quality', 'Quality', 'Visual fidelity', 'More distance, shadows and particles. Shaders cost extra.', 'sparkles']
                ] as const
              ).map(([id, title, sub, body, icon]) => (
                <button key={id} className={`profile-card tall ${profile === id ? 'active' : ''}`} onClick={() => setProfile(id)}>
                  <span className="profile-icon">
                    <Icon name={icon} size={18} />
                  </span>
                  <strong>{title}</strong>
                  <span className="profile-sub">{sub}</span>
                  <p>{body}</p>
                </button>
              ))}
            </div>

            <div className="field">
              <label className="label-row">
                <span>Heap allocation</span>
                <b>{Math.round(memory / 1024)} GB</b>
              </label>
              <input
                type="range"
                min={2048}
                max={Math.min(16384, Math.max(4096, Math.round((hardware.ramGb * 1024) / 2)))}
                step={512}
                value={memory}
                onChange={(event) => setMemory(Number(event.target.value))}
              />
              <span className="hint">
                {hardware.ramGb <= 8
                  ? '8 GB systems should stay at 3 GB. More heap can trigger swapping.'
                  : 'The 4–8 GB range covers most modded setups. Unused heap is not free performance.'}
              </span>
            </div>

            <div className="panel-actions">
              <button className="btn btn-primary" onClick={() => void apply()} disabled={busy || gameRunning}>
                {busy ? <span className="spinner spinner-sm" /> : <Icon name="zap" size={15} />} Apply plan
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('instance', instance.id)}>
                Open instance
              </button>
              <span className="hint">{gameRunning ? 'Close Minecraft before applying video settings.' : 'A backup of options.txt is written first.'}</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Launcher discipline</span>
                <h2>Get out of the game's way</h2>
              </div>
            </div>
            <div className="settings-rows">
              <ToggleRow
                title="Minimize launcher while playing"
                body="Hides the window on launch and restores it when Minecraft exits."
                checked={boot.settings.closeLauncherOnPlay}
                onChange={(value) => void setSetting('closeLauncherOnPlay', value)}
              />
              <ToggleRow
                title="Lower launcher CPU priority"
                body="Parks the launcher below normal priority while the game is running."
                checked={boot.settings.lowerLauncherPriority}
                onChange={(value) => void setSetting('lowerLauncherPriority', value)}
              />
              <ToggleRow
                title="Pause launcher UI"
                body="Stops CSS animation and UI work when a game session is active."
                checked={boot.settings.pauseUiDuringGame}
                onChange={(value) => void setSetting('pauseUiDuringGame', value)}
              />
              <ToggleRow
                title="Reuse official launcher cache"
                body="Hard-links matching libraries and assets from the official Minecraft cache to avoid duplicate downloads."
                checked={boot.settings.mirrorVanillaCache}
                onChange={(value) => void setSetting('mirrorVanillaCache', value)}
              />
            </div>
          </section>
        </div>

        <aside className="perf-side">
          <section className="panel score-panel">
            <div className="score-ring" style={{ '--score': `${score * 3.6}deg` } as CSSProperties}>
              <div className="score-inner">
                <strong>{score}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <h3>Estimated headroom</h3>
            <p>
              Derived from GPU class, CPU threads, system RAM and the selected profile. It is a planning score — not a promise
              of FPS.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Generated</span>
                <h2>JVM flags</h2>
              </div>
            </div>
            <pre className="jvm-preview">{(plan?.jvmArgs ?? []).join('\n') || 'Calculating…'}</pre>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Video settings</span>
                <h2>Plan</h2>
              </div>
            </div>
            {plan ? (
              <div className="plan-options">
                {Object.entries(plan.options).map(([key, value]) => (
                  <div key={key} className="plan-option">
                    <span>{optionLabel(key)}</span>
                    <b>{optionValue(key, value)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <Spinner label="Building plan" />
            )}
            <ul className="note-list">
              {(plan?.notes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <div className="fine-print">
        No fabricated benchmarks. Polaris tunes known-good settings and flags; real frame rate depends on your world, render
        distance, shaders and server.
      </div>
    </div>
  )
}

function ToggleRow({
  title,
  body,
  checked,
  onChange
}: {
  title: string
  body: string
  checked: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
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
