import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'
import type { JavaInfo } from '../src/shared/types'
import type { AppServices } from '../src/main/services'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn)
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() }
}))

import { registerIpc } from '../src/main/ipc'

describe('IPC settings:downloadJava', () => {
  const java: JavaInfo[] = [
    {
      path: 'C:/polaris/java/temurin-21/bin/javaw.exe',
      major: 21,
      version: '21.0.6',
      vendor: 'Eclipse Adoptium',
      source: 'downloaded'
    }
  ]
  const services = {
    logger: { warn: vi.fn() },
    downloadJava: vi.fn(async () => java)
  }

  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerIpc(services as unknown as AppServices)
  })

  it('returns the JavaInfo[] promised by PolarisAPI.downloadJava', async () => {
    const handler = handlers.get(IPC.settingsDownloadJava)
    expect(handler).toBeTypeOf('function')

    const result = await handler!({}, 21)

    expect(services.downloadJava).toHaveBeenCalledWith(21)
    // Settings.tsx reads `list.length` to decide between success and failure;
    // a `{ path, java }` wrapper made a successful download report "failed".
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(java)
  })
})
