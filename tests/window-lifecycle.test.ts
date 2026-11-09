import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EVENTS } from '../src/shared/ipc'

// The main process is normally booted by Electron. This test drives the
// lifecycle with a minimal fake so closing/re-creating a window can be
// reproduced without an Electron runtime.

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')

  class FakeWebContents extends EventEmitter {
    destroyed = false
    sent: Array<{ channel: string; payload: unknown }> = []
    private url = 'file:///app/index.html'

    isDestroyed(): boolean {
      return this.destroyed
    }

    getURL(): string {
      return this.url
    }

    setWindowOpenHandler(): void {
      // navigation policy is not exercised here
    }

    send(channel: string, payload: unknown): void {
      if (this.destroyed) throw new Error('Object has been destroyed')
      this.sent.push({ channel, payload })
    }
  }

  class FakeBrowserWindow extends EventEmitter {
    static instances: FakeBrowserWindow[] = []

    static getAllWindows(): FakeBrowserWindow[] {
      return FakeBrowserWindow.instances.filter((win) => !win.isDestroyed())
    }

    readonly webContents = new FakeWebContents()
    private destroyed = false
    private minimized = false
    private visible = false

    constructor() {
      super()
      FakeBrowserWindow.instances.push(this)
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    isMinimized(): boolean {
      return this.minimized
    }

    isVisible(): boolean {
      return this.visible
    }

    minimize(): void {
      this.minimized = true
      this.visible = false
    }

    restore(): void {
      this.minimized = false
      this.visible = true
      this.emit('restore')
    }

    show(): void {
      this.visible = true
      this.emit('show')
    }

    focus(): void {
      this.emit('focus')
    }

    loadURL(): Promise<void> {
      return Promise.resolve()
    }

    loadFile(): Promise<void> {
      return Promise.resolve()
    }

    close(): void {
      let prevented = false
      this.emit('close', { preventDefault: () => { prevented = true } })
      if (!prevented) this.destroy()
    }

    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.webContents.destroyed = true
      this.emit('closed')
    }
  }

  class FakeApp extends EventEmitter {
    isPackaged = false
    commandLine = { appendSwitch: (): void => {} }

    requestSingleInstanceLock(): boolean {
      return true
    }

    whenReady(): Promise<void> {
      return Promise.resolve()
    }

    setAppUserModelId(): void {}

    quit(): void {}
  }

  return {
    app: new FakeApp(),
    BrowserWindow: FakeBrowserWindow,
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (): void => {},
        setPermissionCheckHandler: (): void => {}
      }
    },
    shell: { openExternal: async (): Promise<void> => {} }
  }
})

vi.mock('../src/main/services', async () => {
  const { EventEmitter } = await import('node:events')

  class AppServices extends EventEmitter {
    static last: AppServices | null = null

    readonly launcher = { isRunning: (): boolean => false }
    readonly settingsStore = {
      get: () => ({ closeLauncherOnPlay: false, lowerLauncherPriority: false })
    }
    readonly ready: Promise<void>
    private resolveReady!: () => void

    constructor() {
      super()
      AppServices.last = this
      this.ready = new Promise<void>((resolve) => {
        this.resolveReady = resolve
      })
    }

    finishReady(): void {
      this.resolveReady()
    }
  }

  return { AppServices }
})

vi.mock('../src/main/ipc', () => ({ registerIpc: () => undefined }))

interface WindowMock {
  isDestroyed(): boolean
  isVisible(): boolean
  show(): void
  close(): void
  webContents: { destroyed: boolean; sent: Array<{ channel: string; payload: unknown }> }
}

interface BrowserWindowMock {
  instances: WindowMock[]
  getAllWindows(): WindowMock[]
}

interface ServicesMock {
  finishReady(): void
  listenerCount(event: string): number
  emit(event: string, ...args: unknown[]): boolean
}

describe('window lifecycle', () => {
  const originalPlatform = process.platform
  let app: { emit(event: string): boolean }
  let browserWindow: BrowserWindowMock
  let services: ServicesMock

  beforeAll(async () => {
    // Make the window-all-closed branch behave like macOS, where the app keeps
    // running with no window and `activate` re-creates it.
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const electron = (await import('electron')) as unknown as {
      app: { emit(event: string): boolean }
      BrowserWindow: BrowserWindowMock
    }
    app = electron.app
    browserWindow = electron.BrowserWindow
    await import('../src/main/index')
    const servicesModule = (await import('../src/main/services')) as unknown as {
      AppServices: { last: ServicesMock }
    }
    await vi.waitFor(() => expect(browserWindow.getAllWindows()).toHaveLength(1))
    services = servicesModule.AppServices.last
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('detaches service listeners when the window closes', () => {
    const first = browserWindow.getAllWindows()[0]
    expect(services.listenerCount('progress')).toBe(1)

    first.close()

    expect(first.isDestroyed()).toBe(true)
    expect(services.listenerCount('progress')).toBe(0)
    expect(services.listenerCount('game-started')).toBe(0)
  })

  it('re-creates the window after close without stacking listeners', async () => {
    app.emit('activate')
    await vi.waitFor(() => {
      expect(browserWindow.getAllWindows()).toHaveLength(1)
    })

    const recreated = browserWindow.getAllWindows()[0]
    expect(services.listenerCount('progress')).toBe(1)

    services.finishReady()
    await vi.waitFor(() => {
      expect(
        recreated.webContents.sent.some(({ channel }) => channel === EVENTS.instanceChanged)
      ).toBe(true)
    })
    expect(services.listenerCount('progress')).toBe(1)
  })

  it('does not send to a destroyed webContents', () => {
    const win = browserWindow.getAllWindows()[0]
    win.show()
    const sentBefore = win.webContents.sent.length
    win.webContents.destroyed = true

    expect(() => services.emit('progress', { stage: 'verify' })).not.toThrow()
    expect(win.webContents.sent).toHaveLength(sentBefore)
  })
})
