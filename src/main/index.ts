import { app, BrowserWindow, dialog, shell } from 'electron'
import os from 'node:os'
import { join } from 'node:path'
import { EVENTS } from '../shared/ipc'
import { AppServices } from './services'
import { registerIpc } from './ipc'

const isMac = process.platform === 'darwin'
let mainWindow: BrowserWindow | null = null
let quitting = false

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
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('dev.polaris.client')
    const services = new AppServices()
    registerIpc(services)
    mainWindow = createWindow(services)
    await services.ready
    mainWindow?.webContents.send(EVENTS.instanceChanged, {})
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(services)
    })
  })
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

  wireServices(services, win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function wireServices(services: AppServices, win: BrowserWindow): void {
  services.on('progress', (event) => send(win, EVENTS.progress, event))
  services.on('launch-state', (state) => send(win, EVENTS.launchState, state))
  services.on('game-log', (chunk) => send(win, EVENTS.gameLog, chunk))
  services.on('device-code', (info) => send(win, EVENTS.deviceCode, info))
  services.on('account-changed', (snapshot) => send(win, EVENTS.accountChanged, snapshot))
  services.on('account-error', (message) => send(win, EVENTS.accountError, message))

  services.on('game-started', ({ instanceId }: { instanceId: string }) => {
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

  services.on('game-exited', () => {
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
}

function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
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
