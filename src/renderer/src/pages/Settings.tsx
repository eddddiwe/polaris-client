import { useState, useEffect, type CSSProperties } from 'react'
import type { Settings } from '@shared/types'
import { errorMessage, useApp } from '../context'
import { Icon, PolarisMark, type IconName } from '../components/Icons'
import { CosmeticBadge } from '../components/Cosmetics'
import { SkinAvatar } from '../components/SkinAvatar'
import { Switch } from '../components/Feedback'
import { ACCENTS, WALLPAPERS } from '@shared/appearance'

const rangeFill = (value: number, min: number, max: number): CSSProperties =>
  ({ '--fill': `${Math.round(((value - min) / Math.max(1, max - min)) * 100)}%` }) as CSSProperties

const SPACE_THEMES: { id: string; name: string; preview: string }[] = [
  { id: 'default', name: 'Default (Mixed)', preview: 'radial-gradient(ellipse 120% 80% at 30% 30%, rgba(139,92,246,0.25), transparent 55%), radial-gradient(ellipse 100% 70% at 70% 70%, rgba(34,211,238,0.18), transparent 50%), #05060d' },
  { id: 'constellations', name: 'Star Constellations', preview: 'radial-gradient(2px 2px at 25% 20%, rgba(255,255,255,0.9), transparent), radial-gradient(2px 2px at 70% 35%, rgba(255,255,255,0.8), transparent), radial-gradient(1.5px 1.5px at 30% 28%, rgba(255,255,255,0.6), transparent), radial-gradient(ellipse 100% 50% at 50% 0%, rgba(139,92,246,0.2), transparent 60%), #05060d' },
  { id: 'nebula', name: 'Atmospheric Nebula', preview: 'radial-gradient(ellipse 150% 80% at 30% 20%, rgba(139,92,246,0.45), transparent 60%), radial-gradient(ellipse 100% 60% at 70% 10%, rgba(34,211,238,0.3), transparent 50%), radial-gradient(ellipse 80% 70% at 50% 80%, rgba(244,114,182,0.25), transparent 55%), #05060d' },
  { id: 'scifi', name: 'High-Tech Sci-Fi', preview: 'linear-gradient(rgba(139,92,246,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.12) 1px, transparent 1px), radial-gradient(ellipse 100% 50% at 50% 0%, rgba(34,211,238,0.25), transparent 50%), #05060d' },
  { id: 'myth', name: 'Cosmic Myth', preview: 'radial-gradient(circle at 50% 50%, rgba(251,191,36,0.12), transparent 40%), radial-gradient(ellipse 120% 80% at 30% 30%, rgba(168,85,247,0.25), transparent 50%), radial-gradient(ellipse 100% 70% at 70% 70%, rgba(244,114,182,0.18), transparent 50%), #05060d' },
]

export function SettingsPage(): JSX.Element {
  const { boot, api, refresh, toast, openAccount, confirm } = useApp()

  const [choosingJava, setChoosingJava] = useState(false)
  const [downloadingJava, setDownloadingJava] = useState(false)
  const [javaVersion, setJavaVersion] = useState(21)
  const [spaceTheme, setSpaceTheme] = useState(localStorage.getItem('polaris-space-theme') || 'default')
  const [wallpaperUrl, setWallpaperUrl] = useState(boot.settings.wallpaperUrl)
  const [wallDim, setWallDim] = useState(boot.settings.wallpaperDim)
  const [wallBlur, setWallBlur] = useState(boot.settings.wallpaperBlur)
  const [activeSection, setActiveSection] = useState('accounts')

  // Apply space theme to body
  useEffect(() => {
    document.body.setAttribute('data-theme', spaceTheme)
    localStorage.setItem('polaris-space-theme', spaceTheme)
  }, [spaceTheme])

  const setSetting = async (patch: Partial<Settings>): Promise<void> => {
    try {
      await api.updateSettings(patch)
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const chooseJava = async (): Promise<void> => {
    setChoosingJava(true)
    try {
      const result = await api.chooseJava()
      if (result.path) {
        await refresh()
        toast('Java runtime updated', 'success')
      }
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setChoosingJava(false)
    }
  }

  const rescan = async (): Promise<void> => {
    try {
      const list = await api.rescanJava()
      await refresh()
      toast(list.length ? `${list.length} Java runtime${list.length === 1 ? '' : 's'} found` : 'No Java runtime found', list.length ? 'success' : 'error')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const downloadJava = async (): Promise<void> => {
    setDownloadingJava(true)
    try {
      const list = await api.downloadJava(javaVersion)
      await refresh()
      toast(list.length ? `Java ${javaVersion} downloaded and installed` : 'Java download failed', list.length ? 'success' : 'error')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setDownloadingJava(false)
    }
  }

  const saveWallpaper = async (): Promise<void> => {
    const url = wallpaperUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      toast('Wallpaper URL must start with http:// or https://', 'error')
      return
    }
    await setSetting({ wallpaperUrl: url, wallpaperDim: wallDim, wallpaperBlur: wallBlur })
    toast('Wallpaper saved', 'success')
  }

  const removeAccount = async (id: string, name: string): Promise<void> => {
    const confirmed = await confirm({
      title: 'Sign out?',
      message: `${name} will be removed from this launcher. Cached Minecraft data stays on disk.`,
      confirmLabel: 'Sign out'
    })
    if (!confirmed) return
    try {
      await api.removeAccount(id)
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Client configuration</span>
          <h1>Settings</h1>
          <p className="page-sub">Accounts, Java runtimes, launcher behavior and appearance.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void api.openRootFolder()}>
          <Icon name="folder" size={15} /> Open data folder
        </button>
      </div>

      <nav className="settings-nav" aria-label="Settings sections">
        {(
          [
            ['accounts', 'Accounts', 'user'],
            ['java', 'Java', 'coffee'],
            ['data', 'Game data', 'folder'],
            ['behavior', 'Behavior', 'sliders'],
            ['appearance', 'Appearance', 'sparkles'],
            ['updates', 'Updates', 'download'],
            ['about', 'About', 'star']
          ] as [string, string, IconName][]
        ).map(([id, label, icon]) => (
          <button
            key={id}
            className={`settings-nav-item ${activeSection === id ? 'active' : ''}`}
            aria-current={activeSection === id ? 'true' : undefined}
            onClick={() => setActiveSection(id)}
          >
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </nav>

      <div className="settings-grid">
        {activeSection === 'accounts' && (
        <section className="panel" id="settings-accounts">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Identity</span>
              <h2>Accounts</h2>
            </div>
            <button className="btn btn-soft btn-sm" onClick={openAccount}>
              <Icon name="plus" size={14} /> Add
            </button>
          </div>
          <div className="settings-rows">
            {boot.accounts.length === 0 && <p className="empty-line">No account yet. Offline mode works without Azure setup.</p>}
            {boot.accounts.map((account) => (
              <div key={account.id} className={`setting-row account-card ${account.active ? 'active' : ''}`}>
                <div className="account-avatar">
                  <SkinAvatar skinUrl={account.skinUrl} name={account.name} uuid={account.uuid} className="avatar avatar-md" />
                  <span className={`account-type-badge ${account.type === 'microsoft' ? 'ms' : 'off'}`}>{account.type === 'microsoft' ? 'MS' : 'OFF'}</span>
                </div>
                <div className="account-info">
                  <strong className="account-name">
                    {account.name}
                    {account.active && <CosmeticBadge id={boot.settings.equippedBadge} size={14} />}
                  </strong>
                  <span className="account-type">
                    {account.type === 'microsoft' ? 'Microsoft' : 'Offline'} account
                  </span>
                  {account.uuid && <span className="account-uuid">{account.uuid}</span>}
                </div>
                {account.active ? (
                  <span className="badge badge-violet">Active</span>
                ) : (
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => void api.setActiveAccount(account.id).then(() => refresh())}
                  >
                    Use
                  </button>
                )}
                <button className="icon-btn" aria-label={`Remove ${account.name}`} onClick={() => void removeAccount(account.id, account.name)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="fine-print">
            Microsoft tokens are stored locally in <code>accounts.json</code>. Polaris does not ship an OAuth client ID; add
            your own below.
          </div>
        </section>
        )}

        {activeSection === 'java' && (
        <section className="panel" id="settings-java">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Runtime</span>
              <h2>Java</h2>
            </div>
            <div className="panel-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => void rescan()}>
                <Icon name="refresh" size={14} /> Rescan
              </button>
              <select className="java-version-select" value={javaVersion} onChange={(e) => setJavaVersion(Number(e.target.value))} disabled={downloadingJava}>
                <option value={8}>Java 8</option>
                <option value={16}>Java 16</option>
                <option value={17}>Java 17</option>
                <option value={21}>Java 21</option>
              </select>
              <button className="btn btn-soft btn-sm" onClick={() => void downloadJava()} disabled={downloadingJava}>
                {downloadingJava ? <span className="spinner spinner-sm" /> : <Icon name="download" size={14} />} Download
              </button>
              <button className="btn btn-soft btn-sm" onClick={() => void chooseJava()} disabled={choosingJava}>
                {choosingJava ? <span className="spinner spinner-sm" /> : <Icon name="folder" size={14} />} Choose
              </button>
            </div>
          </div>
          <div className="settings-rows">
            {boot.java.length === 0 && (
              <p className="empty-line">
                No Java runtime found. Select a version and click "Download" to install Eclipse Temurin automatically, or install manually and rescan.
              </p>
            )}
            {boot.java.map((entry) => {
              const selected = (boot.settings.javaPath || boot.java[0]?.path) === entry.path
              return (
                <button
                  key={entry.path}
                  className={`setting-row java-row ${selected ? 'selected' : ''}`}
                  onClick={() => void setSetting({ javaPath: entry.path })}
                >
                  <span className="hw-icon">
                    <Icon name="coffee" size={16} />
                  </span>
                  <div className="grow">
                    <strong>
                      Java {entry.major} · {entry.vendor}
                    </strong>
                    <span className="mono-path">{entry.path}</span>
                  </div>
                  {selected && <Icon name="check" size={16} />}
                </button>
              )
            })}
          </div>
          <div className="fine-print">
            Minecraft 26.x requires Java 25; older versions run on 17 or 21. Polaris picks the closest compatible runtime per
            instance.
          </div>
        </section>
        )}

        {activeSection === 'data' && (
        <section className="panel" id="settings-data">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Storage</span>
              <h2>Game data</h2>
            </div>
          </div>
          <div className="settings-rows">
            <div className="setting-row">
              <div>
                <strong>Polaris data folder</strong>
                <span className="mono-path">{boot.dataDir}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => void api.openRootFolder()}>
                <Icon name="folder" size={14} /> Open
              </button>
            </div>
            <ToggleRow
              title="Reuse official launcher cache"
              body="Hard-link matching libraries, assets and client jars from the official Minecraft cache. Saves bandwidth and disk."
              checked={boot.settings.mirrorVanillaCache}
              onChange={(value) => void setSetting({ mirrorVanillaCache: value })}
            />
            <ToggleRow
              title="Show snapshots"
              body="Include snapshots and release candidates in version pickers."
              checked={boot.settings.showSnapshots}
              onChange={(value) => void setSetting({ showSnapshots: value })}
            />
            <ToggleRow
              title="Auto-update instance mods"
              body="Check installed Modrinth projects for compatible updates when an instance is opened."
              checked={boot.settings.autoUpdateMods}
              onChange={(value) => void setSetting({ autoUpdateMods: value })}
            />
          </div>
        </section>
        )}

        {activeSection === 'behavior' && (
        <section className="panel" id="settings-behavior">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Behavior</span>
              <h2>Launcher discipline</h2>
            </div>
          </div>
          <div className="settings-rows">
            <ToggleRow
              title="Minimize while playing"
              body="Get the launcher off-screen and restore it when the game exits."
              checked={boot.settings.closeLauncherOnPlay}
              onChange={(value) => void setSetting({ closeLauncherOnPlay: value })}
            />
            <ToggleRow
              title="Lower launcher priority"
              body="Run Polaris below normal priority while Minecraft is active."
              checked={boot.settings.lowerLauncherPriority}
              onChange={(value) => void setSetting({ lowerLauncherPriority: value })}
            />
            <ToggleRow
              title="Pause UI during game"
              body="Stop launcher animations and timers while a session is running."
              checked={boot.settings.pauseUiDuringGame}
              onChange={(value) => void setSetting({ pauseUiDuringGame: value })}
            />
          </div>
        </section>
        )}

        {activeSection === 'updates' && (
        <section className="panel" id="settings-updates">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Updates</span>
              <h2>Client Updates</h2>
            </div>
          </div>
          <div className="settings-rows">
            <div className="setting-row">
              <div>
                <strong>Current version</strong>
                <span className="mono-path">{boot.appVersion}</span>
              </div>
              <button
                className="btn btn-soft btn-sm"
                onClick={async () => {
                  try {
                    const info = await api.checkForUpdates()
                    if (info.hasUpdate) {
                      toast(`Update available: v${info.latestVersion}`, 'info')
                    } else {
                      toast('You are on the latest version', 'success')
                    }
                  } catch (error) {
                    toast(errorMessage(error), 'error')
                  }
                }}
              >
                <Icon name="refresh" size={14} /> Check for updates
              </button>
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
                    toast('Downloading and installing update...', 'info')
                  }}
                >
                  <Icon name="download" size={14} /> Download Update
                </button>
              </div>
            )}
          </div>
        </section>
        )}

        {activeSection === 'appearance' && (
        <section className="panel appearance-panel" id="settings-appearance">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Appearance</span>
              <h2>Space Theme</h2>
            </div>
          </div>
          <div className="settings-rows">
            <div className="setting-row">
              <div>
                <strong>Cosmic Theme</strong>
                <p>Choose your space aesthetic</p>
              </div>
            </div>
          </div>
          <div className="space-theme-grid">
            {SPACE_THEMES.map((theme) => (
              <button
                key={theme.id}
                className={`space-theme-card ${spaceTheme === theme.id ? 'active' : ''}`}
                style={{ background: theme.preview, backgroundSize: theme.id === 'scifi' ? '24px 24px, 24px 24px, 100% 100%, 100% 100%' : undefined }}
                onClick={() => setSpaceTheme(theme.id)}
                aria-pressed={spaceTheme === theme.id}
              >
                <span className="space-theme-name">{theme.name}</span>
                {spaceTheme === theme.id && <span className="space-theme-check"><Icon name="check" size={12} /></span>}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Accent color</label>
            <div className="swatches">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  className={`swatch ${boot.settings.accent === color ? 'active' : ''}`}
                  style={{ background: color }}
                  aria-label={`Use ${color}`}
                  onClick={() => void setSetting({ accent: color })}
                >
                  {boot.settings.accent === color && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="wallpaper-tuning">
            <div className="field">
              <label className="label-row">
                <span>Dim</span>
                <b>{wallDim}%</b>
              </label>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={wallDim}
                style={rangeFill(wallDim, 0, 90)}
                onChange={(event) => setWallDim(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label className="label-row">
                <span>Blur</span>
                <b>{wallBlur}px</b>
              </label>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={wallBlur}
                style={rangeFill(wallBlur, 0, 30)}
                onChange={(event) => setWallBlur(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="panel-actions">
            <button
              className="btn btn-soft btn-sm"
              onClick={() => void setSetting({ wallpaperDim: wallDim, wallpaperBlur: wallBlur })}
            >
              <Icon name="check" size={14} /> Save tuning
            </button>
          </div>

          <div className="settings-rows">
            <ToggleRow
              title="Animated wallpaper"
              body="Let built-in scenes and video wallpapers move."
              checked={boot.settings.wallpaperMotion}
              onChange={(value) => void setSetting({ wallpaperMotion: value })}
            />
            <ToggleRow
              title="Reduce motion"
              body="Disable ambient rotation, page transitions, hover movement and wallpaper animation."
              checked={boot.settings.reduceMotion}
              onChange={(value) => void setSetting({ reduceMotion: value })}
            />
          </div>
        </section>
        )}

      </div>

      {activeSection === 'about' && (
      <section className="about-card" id="settings-about">
        <div className="about-brand">
          <PolarisMark size={38} />
          <div>
            <strong>Polaris Client</strong>
            <span>v{boot.appVersion} · GPL-3.0-only</span>
          </div>
        </div>
        <p>
          An independent, open-source launcher and performance client. Its defaults are based on public documentation,
          clean-room behavioral research and open-source components. No proprietary code or assets from other launchers are
          included.
        </p>
        <p className="fine-print">
          Not affiliated with Mojang Studios, Microsoft, Polyfrost, Prism Launcher or Dawn. Minecraft is a trademark of Mojang
          Studios. Mod metadata and downloads are provided by Modrinth.
        </p>
        <div className="about-links">
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openExternal('https://modrinth.com')}>
            <Icon name="external" size={13} /> Modrinth
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openExternal('https://fabricmc.net')}>
            <Icon name="external" size={13} /> Fabric
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openExternal('https://www.gnu.org/licenses/gpl-3.0.html')}>
            <Icon name="external" size={13} /> License
          </button>
        </div>
      </section>
      )}
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
