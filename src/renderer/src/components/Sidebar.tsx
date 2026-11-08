import { memo } from 'react'
import { useApp, type Page } from '../context'
import { preloadPage } from '../routes'
import { Icon, PolarisMark, type IconName } from './Icons'
import { CosmeticBadge } from './Cosmetics'
import { SkinAvatar } from './SkinAvatar'

const NAV: { id: Page; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'instances', label: 'Instances', icon: 'layers' },
  { id: 'discover', label: 'Discover', icon: 'compass' },
  { id: 'performance', label: 'Performance', icon: 'gauge' },
  { id: 'store', label: 'Cosmetics', icon: 'bag' },
  { id: 'friends', label: 'Friends', icon: 'user' },
  { id: 'chat', label: 'Chat', icon: 'message' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
]

/**
 * The app context value is rebuilt on every App render (progress events, toasts,
 * launch state), so Sidebar re-renders far more often than navigation changes.
 * Memoizing this subtree keeps all eight rows and their SVG icons out of those
 * renders; only a page or instance-count change re-renders it.
 */
const SidebarNav = memo(function SidebarNav({
  page,
  instanceCount,
  onNavigate
}: {
  page: Page
  instanceCount: number
  onNavigate: (page: Page) => void
}): JSX.Element {
  // The instance detail route keeps the Instances entry highlighted.
  const activePage = page === 'instance' ? 'instances' : page
  return (
    <nav className="nav">
      <span className="nav-label">Workspace</span>
      {NAV.map((item) => {
        const active = activePage === item.id
        return (
          <button
            key={item.id}
            className={active ? 'nav-item active' : 'nav-item'}
            onClick={() => onNavigate(item.id)}
            onPointerEnter={() => preloadPage(item.id)}
            onFocus={() => preloadPage(item.id)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.id === 'instances' && instanceCount > 0 && <em>{instanceCount}</em>}
          </button>
        )
      })}
    </nav>
  )
})

export function Sidebar(): JSX.Element {
  const { page, navigate, boot, launchState, gameRunning, openAccount, stop } = useApp()
  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const runningInstance = boot.instances.find((instance) => instance.id === launchState.instanceId)

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <PolarisMark size={34} />
        <div>
          <h1>Polaris</h1>
          <span>CLIENT / 01</span>
        </div>
      </div>

      <SidebarNav page={page} instanceCount={boot.instances.length} onNavigate={navigate} />

      {gameRunning && runningInstance && (
        <div className="sidebar-game">
          <div className="sidebar-game-top">
            <span className="status-dot status-dot-live" />
            <span>Running</span>
          </div>
          <strong>{runningInstance.name}</strong>
          <span className="sidebar-game-meta">
            {runningInstance.mcVersion} · {runningInstance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => void stop()}>
            <Icon name="stop" size={12} /> Stop
          </button>
        </div>
      )}

      <div className="sidebar-spacer" />

      <button className="account-chip" onClick={openAccount}>
        <SkinAvatar skinUrl={active?.skinUrl} name={active?.name ?? '?'} uuid={active?.uuid} className="avatar" />
        <span className="account-copy">
          <strong className="name-with-badge">
            {active ? active.name : 'Add account'}
            {active && <CosmeticBadge id={boot.settings.equippedBadge} size={15} />}
          </strong>
          <small>{active ? (active.type === 'microsoft' ? 'Microsoft' : 'Offline mode') : 'Required to play'}</small>
        </span>
        <Icon name="chevron" size={15} className="account-chevron" />
      </button>

      <div className="sidebar-footer">
        <span>GPL-3.0 · Open source</span>
        <span>Not affiliated with Mojang</span>
      </div>
    </aside>
  )
}
