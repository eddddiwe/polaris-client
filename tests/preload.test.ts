import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PolarisAPI } from '../src/shared/api'
import type { JavaInfo } from '../src/shared/types'

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  exposeInMainWorld: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridge.exposeInMainWorld },
  ipcRenderer: {
    invoke: bridge.invoke,
    on: bridge.on,
    removeListener: bridge.removeListener
  }
}))

import { IPC } from '../src/shared/ipc'
import '../src/preload/index'

const api = bridge.exposeInMainWorld.mock.calls[0]?.[1] as unknown as PolarisAPI

const java: JavaInfo[] = [
  {
    path: 'C:/polaris/java/temurin-21/bin/javaw.exe',
    major: 21,
    version: '21.0.5',
    vendor: 'Eclipse Adoptium',
    source: 'downloaded'
  }
]

describe('preload downloadJava', () => {
  beforeEach(() => {
    bridge.invoke.mockReset()
  })

  it('normalizes the main-process { path, java } envelope to the declared JavaInfo[]', async () => {
    bridge.invoke.mockResolvedValueOnce({ path: java[0].path, java })

    await expect(api.downloadJava(21)).resolves.toEqual(java)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.settingsDownloadJava, 21)
  })

  it('passes a plain JavaInfo[] response through unchanged', async () => {
    bridge.invoke.mockResolvedValueOnce(java)

    await expect(api.downloadJava(21)).resolves.toBe(java)
  })
})
