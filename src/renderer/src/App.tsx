import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import type { Bootstrap, InstanceDetail, LaunchState, ProgressEvent, Settings } from '@shared/types'
import type { PolarisAPI } from '@shared/api'
import { AppContext, beginRequest, errorMessage, type Page, type Toast, type ToastKind, type ConfirmFn, type ConfirmOptions } from './context'
import { loadPage, preloadPage } from './routes'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toasts, ProgressDock } from './components/Feedback'
import { Wallpaper } from './components/Wallpaper'
import { HomePage } from './pages/Home'
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

/**
 * Route components must be created in one place so a crashed page can be
 * rebuilt. React.lazy caches a rejected loader forever, so reusing the same
 * lazy component after a chunk load failure makes "Try again" a no-op.
 */
function createPageComponents() {
  return {
    instances: lazy(() => loadPage('instances')),
    instance: lazy(() => loadPage('instance')),
    discover: lazy(() => loadPage('discover')),
    performance: lazy(() => loadPage('performance')),
    store: lazy(() => loadPage('store')),
    settings: lazy(() => loadPage('settings')),
    friends: lazy(() => loadPage('friends')),
    chat: lazy(() => loadPage('chat'))
  }
}

interface PageErrorBoundaryProps {
  children: ReactNode
  /** Changing this clears a previous crash without remounting healthy pages. */
  resetKey: string
  /** Rebuild lazy route components so a failed chunk load can be retried. */
  onRetry?: () => void
}

interface PageErrorBoundaryState {
  error: Error | null
  resetKey: string
}

/**
 * Keeps a broken page from unmounting the whole app. Without this, any render
 * error replaces the entire window with a blank screen (as the old Friends
 * page used to do).
 */
class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    if (error instanceof Error) return { error }
    // A page can throw strings or falsy values; normalize so the fallback
    // renders instead of re-rendering children forever.
    return { error: new Error(typeof error === 'string' && error ? error : 'An unexpected error occurred.') }
  }

  // A crash from the previous route, instance, or account must not leak into
  // the next one. Only the boundary's own state resets; children that did not
  // crash keep their mounted state.
  static getDerivedStateFromProps(
    props: PageErrorBoundaryProps,
    state: PageErrorBoundaryState
  ): Partial<PageErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page crashed:', error, info.componentStack)
  }

  private retry = (): void => {
    this.props.onRetry?.()
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="empty-state" role="alert">
          <h2>This page hit an error</h2>
          <p className="fine-print">{this.state.error.message || 'An unexpected error occurred.'}</p>
          <button type="button" className="btn btn-primary" onClick={this.retry} autoFocus>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Progress events can arrive every 80ms while a download runs. Keeping that
 * state in App re-rendered every page on each tick; owning it here limits the
 * work to the dock itself, which is the only consumer of the value.
 */
function ProgressDockHost({ api }: { api: PolarisAPI }): JSX.Element | null {
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const off = api.onProgress((event) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      setProgress(event)
      if (event.done) {
        timer.current = window.setTimeout(() => {
          timer.current = null
          setProgress(null)
        }, event.error ? 9000 : 3200)
      }
    })
    return () => {
      off()
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [api])

  return <ProgressDock progress={progress} />
}

export default function App(): JSX.Element {
  // Apply saved space theme
  if (typeof document !== 'undefined') {
    const savedTheme = localStorage.getItem('polaris-space-theme') || 'default'
    document.body.setAttribute('data-theme', savedTheme)
  }

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
  const [toasts, setToasts] = useState<Toast[]>([])
  const [newInstanceOpen, setNewInstanceOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)
  const toastId = useRef(0)
  const refreshSeq = useRef(0)
  const toastTimers = useRef<Set<number>>(new Set())
  const autoUpdated = useRef<Set<string>>(new Set())
  const lastDetailId = useRef<string | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  // Bumped by the page boundary's retry button. A new map gives the failed
  // route a fresh React.lazy instance instead of its cached rejection.
  const [pageEpoch, setPageEpoch] = useState(0)
  const pages = useMemo(createPageComponents, [pageEpoch])

  // Start every route at the top instead of inheriting the previous page's
  // scroll position. Force an instant scroll: `.main` sets
  // `scroll-behavior: smooth`, so a default reset animates every navigation
  // while the next page mounts. Doing no animation also respects users who
  // prefer reduced motion.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [page, activeInstanceId])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastId.current
    setToasts((current) => [...current.slice(-3), { id, message, kind }])
    const timer = window.setTimeout(() => {
      toastTimers.current.delete(timer)
      setToasts((current) => current.filter((item) => item.id !== id))
    }, kind === 'error' ? 7000 : 4200)
    toastTimers.current.add(timer)
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
    const isCurrent = beginRequest(refreshSeq)
    try {
      const snapshot = await api.bootstrap()
      // A slower, older bootstrap must not resurrect a deleted instance or
      // revert a setting that a newer refresh already applied.
      if (!isCurrent()) return
      setBoot(snapshot)
      setActiveInstanceId((current) => {
        if (current && snapshot.instances.some((instance) => instance.id === current)) return current
        return snapshot.instances[0]?.id ?? null
      })
    } catch (error) {
      if (!isCurrent()) return
      toast(`Could not refresh client data: ${errorMessage(error)}`, 'error')
    }
  }, [api, toast])

  useEffect(() => {
    let cancelled = false
    const isCurrent = beginRequest(refreshSeq)
    api
      .bootstrap()
      .then((snapshot) => {
        if (cancelled || !isCurrent()) return
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
      offLaunch()
      offGame()
      offAccount()
      offAccountError()
    }
  }, [api, refresh, toast])

  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

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
          const found = await api.modUpdates(activeInstanceId)
          if (!cancelled && found.length > 0) {
            toast(
              `${found.length} mod update${found.length === 1 ? '' : 's'} available. Open this instance to review and confirm.`,
              'info'
            )
          }
        } catch (error) {
          if (!cancelled) toast(`Mod update check failed: ${errorMessage(error)}`, 'error')
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

  // The cosmic backdrop is always-on CSS animation. Flag hidden/minimized
  // windows so CSS can park it instead of compositing full-screen effects.
  useEffect(() => {
    const syncVisibility = (): void => {
      document.body.dataset.windowHidden = String(document.visibilityState === 'hidden')
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  // Warm the two most likely next routes once the UI is idle. Skipped while a
  // game runs; hover/focus and navigate() handle the rest on demand.
  useEffect(() => {
    if (!boot || gameRunning) return
    const hasInstances = boot.instances.length > 0
    const warm = (): void => {
      preloadPage('instances')
      if (hasInstances) preloadPage('instance')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(warm, 800)
    return () => window.clearTimeout(id)
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
    preloadPage(next)
    if (instanceId) setActiveInstanceId(instanceId)
    setPage(next)
    // Reset here too: the effect above does not fire when the target page and
    // instance are unchanged (for example, re-clicking the active nav item).
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
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
  const {
    instances: InstancesPage,
    instance: InstancePage,
    discover: DiscoverPage,
    performance: PerformancePage,
    store: StorePage,
    settings: SettingsPage,
    friends: FriendsPage,
    chat: ChatPage
  } = pages
  // Route, selected instance, and signed-in account are the inputs that make a
  // page's rendered content stale. Changing any of them clears a crash.
  // JSON encoding avoids delimiter collisions in user/account identifiers.
  const boundaryResetKey = JSON.stringify([page, activeInstanceId, boot.activeAccountId])

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
        openNewInstance: () => setNewInstanceOpen(true),
        openAccount: () => setAccountOpen(true)
      }}
    >
      <div className="app" style={style} data-wallpaper={boot.settings.wallpaper}>
        <div className="star-field" aria-hidden="true" />
        <div className="polaris-star" aria-hidden="true" />
        <div className="shooting-star-2" aria-hidden="true" />
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
            <PageErrorBoundary
              resetKey={boundaryResetKey}
              onRetry={() => setPageEpoch((epoch) => epoch + 1)}
            >
              {page === 'home' && <HomePage />}
              {page === 'instances' && <Suspense fallback={<div className="page-loading">Loading...</div>}><InstancesPage /></Suspense>}
              {page === 'instance' && <Suspense fallback={<div className="page-loading">Loading...</div>}><InstancePage /></Suspense>}
              {page === 'discover' && <Suspense fallback={<div className="page-loading">Loading...</div>}><DiscoverPage /></Suspense>}
              {page === 'performance' && <Suspense fallback={<div className="page-loading">Loading...</div>}><PerformancePage /></Suspense>}
              {page === 'store' && <Suspense fallback={<div className="page-loading">Loading...</div>}><StorePage /></Suspense>}
              {page === 'settings' && <Suspense fallback={<div className="page-loading">Loading...</div>}><SettingsPage /></Suspense>}
              {page === 'friends' && <Suspense fallback={<div className="page-loading">Loading...</div>}><FriendsPage /></Suspense>}
              {page === 'chat' && <Suspense fallback={<div className="page-loading">Loading...</div>}><ChatPage /></Suspense>}
            </PageErrorBoundary>
          </div>
        </main>
        <ProgressDockHost api={api} />
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
