import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { lazy, Suspense } from 'react'
import type { Bootstrap, InstanceDetail, LaunchState, ProgressEvent, Settings } from '@shared/types'
import type { PolarisAPI } from '@shared/api'
import { AppContext, errorMessage, type Page, type Toast, type ToastKind, type ConfirmFn, type ConfirmOptions } from './context'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toasts, ProgressDock } from './components/Feedback'
import { Wallpaper } from './components/Wallpaper'
import { HomePage } from './pages/Home'
const InstancesPage = lazy(() => import('./pages/Instances').then(m => ({ default: m.InstancesPage })))
const InstancePage = lazy(() => import('./pages/Instance').then(m => ({ default: m.InstancePage })))
const DiscoverPage = lazy(() => import('./pages/Discover').then(m => ({ default: m.DiscoverPage })))
const PerformancePage = lazy(() => import('./pages/Performance').then(m => ({ default: m.PerformancePage })))
const StorePage = lazy(() => import('./pages/Store').then(m => ({ default: m.StorePage })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })))
import { AccountModal, ConfirmModal, NewInstanceModal } from './components/Modals'
import { PolarisMark } from './components/Icons'

function getApi(): PolarisAPI {
  if (window.polaris) return window.polaris
  // Lazy-load mock API for web preview mode (code-split, not in main bundle)
  const mockModule = (window as any).__mockModule
  if (mockModule) return mockModule.createMockApi()
  // Synchronous fallback - should not reach here in production
  throw new Error('Polaris API not available. Run in Electron or use npm run dev:web for preview.')
}

export default function App(): JSX.Element {
  let api: PolarisAPI
  try {
    api = getApi()
  } catch (e) {
    return (
      <div style={{ padding: 40, color: '#fb7185', background: '#07080d', minHeight: '100vh', fontFamily: 'monospace' }}>
        <h1>Polaris failed to start</h1>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{String(e)}</pre>
      </div>
    )
  }
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InstanceDetail | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>({ instanceId: null, status: 'idle' })
  const [gameRunning, setGameRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [newInstanceOpen, setNewInstanceOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)
  const progressTimer = useRef<number | null>(null)
  const toastId = useRef(0)
  const autoUpdated = useRef<Set<string>>(new Set())
  const lastDetailId = useRef<string | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)

  // Start every route at the top instead of inheriting the previous page's
  // scroll position.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [page, activeInstanceId])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastId.current
    setToasts((current) => [...current.slice(-3), { id, message, kind }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, kind === 'error' ? 7000 : 4200)
  }, [])

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise((resolve) => {
        setConfirmRequest({ ...options, resolve })
      }),
    []
  )

  const resolveConfirm = (value: boolean): void => {
    confirmRequest?.resolve(value)
    setConfirmRequest(null)
  }

  const refresh = useCallback(async () => {
    try {
      const snapshot = await api.bootstrap()
      setBoot(snapshot)
      setActiveInstanceId((current) => {
        if (current && snapshot.instances.some((instance) => instance.id === current)) return current
        return snapshot.instances[0]?.id ?? null
      })
    } catch (error) {
      toast(`Could not refresh client data: ${errorMessage(error)}`, 'error')
    }
  }, [api, toast])

  useEffect(() => {
    let cancelled = false
    api
      .bootstrap()
      .then((snapshot) => {
        if (cancelled) return
        setBoot(snapshot)
        setActiveInstanceId(snapshot.instances[0]?.id ?? null)
        setLaunchState(snapshot.launch)
        setGameRunning(snapshot.launch.status === 'running')
      })
      .catch((error) => {
        if (!cancelled) setFatal(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    const offProgress = api.onProgress((event) => {
      if (progressTimer.current) window.clearTimeout(progressTimer.current)
      setProgress(event)
      if (event.done) {
        progressTimer.current = window.setTimeout(() => setProgress(null), event.error ? 9000 : 3200)
      }
    })
    const offLaunch = api.onLaunchState((state) => {
      setLaunchState(state)
      setGameRunning(state.status === 'running')
      if (state.status === 'exited' || state.status === 'crashed') void refresh()
    })
    const offGame = api.onGameState((state) => setGameRunning(state.running))
    const offAccount = api.onAccountChanged((snapshot) => {
      setBoot((current) =>
        current ? { ...current, accounts: snapshot.accounts, activeAccountId: snapshot.activeAccountId } : current
      )
      setAccountOpen(false)
      toast('Microsoft account connected', 'success')
    })
    const offAccountError = api.onAccountError((message) => toast(message, 'error'))
    return () => {
      offProgress()
      offLaunch()
      offGame()
      offAccount()
      offAccountError()
    }
  }, [api, refresh, toast])

  useEffect(() => {
    if (!boot || !activeInstanceId) {
      setDetail(null)
      lastDetailId.current = null
      return
    }
    let cancelled = false
    if (lastDetailId.current !== activeInstanceId) {
      lastDetailId.current = activeInstanceId
      setDetail(null)
    }
    void (async () => {
      if (!gameRunning && boot.settings.autoUpdateMods && !autoUpdated.current.has(activeInstanceId)) {
        autoUpdated.current.add(activeInstanceId)
        try {
          const result = await api.updateMods(activeInstanceId)
          if (!cancelled && result.updates.length > 0) {
            toast(
              `Updated ${result.updates.length} mod${result.updates.length === 1 ? '' : 's'} for this instance`,
              'success'
            )
            void refresh()
          }
        } catch (error) {
          if (!cancelled) toast(`Automatic mod update failed: ${errorMessage(error)}`, 'error')
        }
      }
      try {
        const value = await api.getInstance(activeInstanceId)
        if (!cancelled) setDetail(value)
      } catch {
        if (!cancelled) setDetail(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, activeInstanceId, boot, gameRunning, refresh, toast])

  useEffect(() => {
    if (!boot) return
    const body = document.body
    body.dataset.gameRunning = String(gameRunning && boot.settings.pauseUiDuringGame)
    body.dataset.reduceMotion = String(boot.settings.reduceMotion)
    body.dataset.wallpaper = boot.settings.wallpaper
    document.documentElement.style.setProperty('--accent', boot.settings.accent)
  }, [boot, gameRunning])

  const reloadDetail = useCallback(async () => {
    if (!activeInstanceId) {
      setDetail(null)
      return
    }
    const value = await api.getInstance(activeInstanceId)
    setDetail(value)
  }, [api, activeInstanceId])

  const navigate = useCallback((next: Page, instanceId?: string) => {
    if (instanceId) setActiveInstanceId(instanceId)
    setPage(next)
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }, [])

  const selectInstance = useCallback((id: string) => setActiveInstanceId(id), [])

  const launch = useCallback(
    async (id?: string) => {
      if (!boot) return
      if (!boot.accounts.length) {
        setAccountOpen(true)
        return
      }
      const target = id ?? activeInstanceId
      if (!target) {
        setPage('instances')
        return
      }
      try {
        const state = await api.launch(target)
        setLaunchState(state)
        setGameRunning(state.status === 'running')
      } catch (error) {
        toast(errorMessage(error), 'error')
      }
    },
    [activeInstanceId, api, boot, toast]
  )

  const stop = useCallback(async () => {
    try {
      await api.stop()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }, [api, toast])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const updated = await api.updateSettings(patch)
      setBoot((current) => (current ? { ...current, settings: updated } : current))
      return updated
    },
    [api]
  )

  if (fatal) {
    return (
      <div className="splash">
        <div className="splash-mark">
          <PolarisMark size={58} />
        </div>
        <h1>POLARIS</h1>
        <p className="splash-error">The client could not start.</p>
        <pre className="fatal-box">{fatal}</pre>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }

  if (!boot) {
    return (
      <div className="splash">
        <div className="splash-mark splash-pulse">
          <PolarisMark size={64} />
        </div>
        <h1>POLARIS</h1>
        <p>Detecting hardware · reading Java · loading instances</p>
        <div className="splash-bar">
          <span />
        </div>
      </div>
    )
  }

  const activeInstance = boot.instances.find((instance) => instance.id === activeInstanceId)
  const style = { '--accent': boot.settings.accent } as CSSProperties

  return (
    <AppContext.Provider
      value={{
        api,
        boot,
        settings: boot.settings,
        hardware: boot.hardware,
        java: boot.java,
        instances: boot.instances,
        page,
        navigate,
        activeInstanceId,
        activeInstance,
        selectInstance,
        detail,
        reloadDetail,
        refresh,
        launchState,
        gameRunning,
        launch,
        stop,
        toast,
        confirm,
        progress,
        openNewInstance: () => setNewInstanceOpen(true),
        openAccount: () => setAccountOpen(true)
      }}
    >
      <div className="app" style={style} data-wallpaper={boot.settings.wallpaper}>
        <div className="polaris-star" aria-hidden="true" />
        <Wallpaper />
        <TitleBar />
        <Sidebar />
        <main className="main" ref={mainRef}>
          {gameRunning && (
            <div className="game-banner">
              <span className="status-dot status-dot-live" />
              <span>Minecraft is running. Launcher resources are parked.</span>
              <button className="btn btn-ghost btn-sm" onClick={() => void stop()}>
                Stop game
              </button>
            </div>
          )}
          <div className="page" key={page}>
            {page === 'home' && <HomePage />}
            {page === 'instances' && <Suspense fallback={<div className="page-loading">Loading...</div>}><InstancesPage /></Suspense>}
            {page === 'instance' && <Suspense fallback={<div className="page-loading">Loading...</div>}><InstancePage /></Suspense>}
            {page === 'discover' && <Suspense fallback={<div className="page-loading">Loading...</div>}><DiscoverPage /></Suspense>}
            {page === 'performance' && <Suspense fallback={<div className="page-loading">Loading...</div>}><PerformancePage /></Suspense>}
            {page === 'store' && <Suspense fallback={<div className="page-loading">Loading...</div>}><StorePage /></Suspense>}
            {page === 'settings' && <Suspense fallback={<div className="page-loading">Loading...</div>}><SettingsPage /></Suspense>}
          </div>
        </main>
        <ProgressDock progress={progress} />
        <Toasts toasts={toasts} />
        {newInstanceOpen && (
          <NewInstanceModal
            onClose={() => setNewInstanceOpen(false)}
            onCreated={(id) => {
              setNewInstanceOpen(false)
              void refresh()
              navigate('instance', id)
            }}
          />
        )}
        {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
        {confirmRequest && (
          <ConfirmModal
            title={confirmRequest.title}
            message={confirmRequest.message}
            confirmLabel={confirmRequest.confirmLabel}
            danger={confirmRequest.danger}
            onCancel={() => resolveConfirm(false)}
            onConfirm={() => resolveConfirm(true)}
          />
        )}
      </div>
    </AppContext.Provider>
  )
}
