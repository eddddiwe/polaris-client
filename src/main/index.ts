import { app, BrowserWindow, dialog, session, shell } from 'electron'
import os from 'node:os'
import { join } from 'node:path'
import { EVENTS } from '../shared/ipc'
import { AppServices } from './services'
import { registerIpc } from './ipc'
import { focusWhenReady, focusWindow } from './singleInstance'

const isMac = process.platform === 'darwin'
let mainWindow: BrowserWindow | null = null
let services: AppServices | null = null
let quitting = false
let secondInstancePending = false

// Performance: disable unnecessary Chromium features
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,TranslateUI,BlinkGenPropertyTrees')
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-dev-shm-usage')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=384 --gc-interval=100')
// Enable V8 code cache for faster startup
app.commandLine.appendSwitch('enable-features', 'V8CodeCache')
// Reduce memory: disable backgrounding of renderer
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// When the launcher is started detached or its console pipe closes, Node's
// stdout/stderr emit EPIPE. Without listeners those become uncaught
// exceptions, and logging the exception writes to the broken pipe again.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on('error', () => {
    // discard console output when the host has gone away
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // The event can arrive before whenReady has created the window, and on
    // macOS it can arrive after the last window was destroyed while the app
    // stayed alive. Never touch a destroyed BrowserWindow: queue the focus
    // request or recreate the window, otherwise the new launch is dropped.
    if (quitting) return
    if (mainWindow && !mainWindow.isDestroyed()) {
      // A window still loading must not be shown before its first paint; a
      // window that has finished loading (even minimized/hidden) can be
      // restored and focused immediately.
      if (mainWindow.webContents.isLoading()) focusWhenReady(mainWindow)
      else focusWindow(mainWindow)
      return
    }
    if (services) {
      mainWindow = createWindow(services)
      focusWhenReady(mainWindow)
      return
    }
    secondInstancePending = true
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('dev.polaris.client')
    // The launcher needs no camera, microphone, geolocation, notifications,
    // clipboard-read, MIDI or device permissions. Deny everything.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault())
    })
    const appServices = new AppServices()
    services = appServices
    registerIpc(appServices)
    mainWindow = createWindow(appServices)
    if (secondInstancePending) {
      secondInstancePending = false
      focusWhenReady(mainWindow)
    }
    // Register before awaiting readiness so closing the starting window still
    // lets a dock activate recreate it while bootstrap is in flight.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(appServices)
        focusWhenReady(mainWindow)
      }
    })
    await appServices.ready
    if (mainWindow) send(mainWindow, EVENTS.instanceChanged, {})
  }).catch(reportStartupFailure)
}

function createWindow(services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1060,
    minHeight: 660,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    backgroundColor: '#07080d',
    title: 'Polaris Client',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      spellcheck: false,
      // Memory optimization
      v8CacheOptions: 'code',
      offscreen: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  win.on('close', (event) => {
    if (quitting || !services.launcher.isRunning()) return
    event.preventDefault()
    void dialog
      .showMessageBox(win, {
        type: 'question',
        title: 'Minecraft is still running',
        message: 'Minecraft is running in the background.',
        detail: 'Quitting the launcher will leave the game running. You can also keep Polaris open.',
        buttons: ['Keep Polaris open', 'Quit launcher'],
        defaultId: 0,
        cancelId: 0
      })
      .then(({ response }) => {
        if (response === 1) {
          quitting = true
          app.quit()
        }
      })
  })

  const disposeServices = wireServices(services, win)
  win.once('closed', () => {
    disposeServices()
    if (mainWindow === win) mainWindow = null
  })

  // electron-vite sets this during development. A packaged build must never
  // load a remote renderer: it would receive the preload API.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl && isLoopbackDevUrl(devUrl)) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function isLoopbackDevUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    )
  } catch {
    return false
  }
}

/**
 * Surface a failure that happened before the window could report it. When a
 * live window exists, its bootstrap() awaits the same rejected `ready` promise
 * and renders the fatal-start screen, so only a missing/destroyed window needs
 * a native dialog and a non-zero exit.
 */
function reportStartupFailure(error: unknown): void {
  try {
    console.error('Startup failed', error)
  } catch {
    // stdio can be closed when the app is launched detached
  }
  if (quitting || (mainWindow && !mainWindow.isDestroyed())) return
  try {
    dialog.showErrorBox('Polaris could not start', error instanceof Error ? error.message : String(error))
  } catch {
    // no graphical session available
  }
  app.exit(1)
}

function wireServices(services: AppServices, win: BrowserWindow): () => void {
  // Listeners capture their window. Without an explicit detach, every macOS
  // `activate` re-create would stack another set on the long-lived services
  // emitter and keep sending into destroyed windows.
  const listeners: Array<{ event: string; listener: (...args: any[]) => void }> = []
  const listen = (event: string, listener: (...args: any[]) => void): void => {
    services.on(event, listener)
    listeners.push({ event, listener })
  }
  // `closeLauncherOnPlay` minimizes the window for the whole game session, and
  // installs keep running while the launcher is minimized too. Waking the
  // renderer for high-frequency events nobody can see only schedules work on a
  // surface Chromium is not painting. Coalesce those two channels while the
  // window is hidden and flush the latest state when it is visible again.
  // State events (launch, account, chat) stay immediate: they are infrequent
  // and deferring them would leave the UI stale.
  const hidden = (): boolean => !win.isDestroyed() && (win.isMinimized() || !win.isVisible())
  let pendingProgress: unknown = null
  let pendingLog: Array<{ instanceId: string; lines: string[] }> = []
  let pendingLogLines = 0
  // The renderer reloads the log from disk with `tailLogs`, so a bounded
  // backlog is enough; a minimized window must not accumulate a whole session.
  const MAX_PENDING_LOG_LINES = 2000

  const flushPending = (): void => {
    if (win.isDestroyed()) return
    if (pendingProgress !== null) {
      send(win, EVENTS.progress, pendingProgress)
      pendingProgress = null
    }
    if (pendingLog.length === 0) return
    const merged = new Map<string, string[]>()
    for (const { instanceId, lines } of pendingLog) {
      const existing = merged.get(instanceId)
      if (existing) existing.push(...lines)
      else merged.set(instanceId, [...lines])
    }
    pendingLog = []
    pendingLogLines = 0
    for (const [instanceId, lines] of merged) send(win, EVENTS.gameLog, { instanceId, lines })
  }

  win.on('show', flushPending)
  win.on('restore', flushPending)
  // Some window managers restore without a show/restore event; focus covers them.
  win.on('focus', flushPending)

  listen('progress', (event) => {
    if (hidden()) pendingProgress = event
    else send(win, EVENTS.progress, event)
  })
  listen('launch-state', (state) => send(win, EVENTS.launchState, state))
  listen('game-log', (chunk: { instanceId: string; lines: string[] }) => {
    if (!hidden()) {
      send(win, EVENTS.gameLog, chunk)
      return
    }
    pendingLog.push({ instanceId: chunk.instanceId, lines: Array.isArray(chunk.lines) ? chunk.lines : [] })
    pendingLogLines += pendingLog[pendingLog.length - 1].lines.length
    // Keep exactly the newest lines. If a single chunk is larger than the
    // backlog bound, trim its head instead of dropping the whole chunk.
    while (pendingLogLines > MAX_PENDING_LOG_LINES && pendingLog.length > 0) {
      const oldest = pendingLog[0]
      const overflow = pendingLogLines - MAX_PENDING_LOG_LINES
      if (oldest.lines.length <= overflow) {
        pendingLog.shift()
        pendingLogLines -= oldest.lines.length
      } else {
        oldest.lines = oldest.lines.slice(overflow)
        pendingLogLines -= overflow
      }
    }
  })
  listen('device-code', (info) => send(win, EVENTS.deviceCode, info))
  listen('account-changed', (snapshot) => send(win, EVENTS.accountChanged, snapshot))
  listen('account-error', (message) => send(win, EVENTS.accountError, message))
  listen('shards-changed', () => send(win, EVENTS.shardsChanged, {}))
  listen('chat-message', (message) => send(win, EVENTS.chatMessage, message))
  listen('chat-typing', (typing) => send(win, EVENTS.chatTyping, typing))
  listen('chat-state', (state) => send(win, EVENTS.chatState, state))

  listen('game-started', ({ instanceId }: { instanceId: string }) => {
    const settings = services.settingsStore.get()
    send(win, EVENTS.gameState, { running: true, instanceId })
    if (settings.lowerLauncherPriority) {
      try {
        os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // best-effort
      }
    }
    if (settings.closeLauncherOnPlay && !win.isDestroyed()) win.minimize()
  })

  listen('game-exited', () => {
    const settings = services.settingsStore.get()
    send(win, EVENTS.gameState, { running: false, instanceId: null })
    if (settings.lowerLauncherPriority) {
      try {
        os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL)
      } catch {
        // best-effort
      }
    }
    if (settings.closeLauncherOnPlay && !win.isDestroyed()) {
      win.restore()
      win.show()
      win.focus()
    }
  })

  return () => {
    for (const { event, listener } of listeners) services.off(event, listener)
    listeners.length = 0
  }
}

function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(channel, payload)
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

process.on('uncaughtException', (error) => {
  try {
    console.error('Uncaught exception', error)
  } catch {
    // stdio can be closed when the app is launched detached
  }
})

process.on('unhandledRejection', (reason) => {
  try {
    console.error('Unhandled rejection', reason)
  } catch {
    // ignore stdio failures
  }
})
