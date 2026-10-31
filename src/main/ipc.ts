import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readdir, rename } from 'node:fs/promises'
import { IPC } from '../shared/ipc'

import { ensureDir } from '../core/fsutil'
import type { AppServices } from './services'
import type { GameUiOptions, JvmPresetId, PerfProfileId } from '../shared/types'

export function registerIpc(services: AppServices): void {
  const handle = <T>(channel: string, fn: (...args: never[]) => Promise<T> | T): void => {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return await fn(...(args as never[]))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        services.logger.warn(`IPC ${channel} failed: ${message}`)
        throw new Error(message)
      }
    })
  }

  handle(IPC.bootstrap, async () => services.bootstrap())
  handle(IPC.settingsSnapshot, async () => services.settingsStore.get())

  handle(IPC.friendsList, async () => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.list()
  })
  handle(IPC.friendsAdd, async (code: string, name: string) => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (!myCode) throw new Error('Sign in to add friends.')
    await services.friends.add(myCode, code, name)
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.list()
  })
  handle(IPC.friendsRemove, async (code: string) => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (myCode) await services.friends.remove(myCode, code)
    else await services.friends.remove('', code)
    return services.friends.list()
  })
  handle(IPC.friendsRemoveMutual, async (friendCode: string) => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (!myCode) throw new Error('Sign in to remove friends.')
    await services.friends.removeMutual(myCode, friendCode)
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.list()
  })
  handle(IPC.friendsRequest, async (code: string, name: string) => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (!myCode) throw new Error('Sign in to send friend request.')
    await services.friends.sendRequest(myCode, code)
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.getRequests(myCode)
  })
  handle(IPC.friendsRespond, async (myCode: string, friendCode: string, action: 'accept' | 'decline') => {
    if (!myCode) throw new Error('Sign in to respond to friend request.')
    await services.friends.respondRequest(myCode, friendCode, action)
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.getRequests(myCode)
  })
  handle(IPC.friendsGetRequests, async () => {
    const myCode = services.accounts.activeStored()?.friendCode
    if (myCode) await services.friends.syncFromServer(myCode)
    return services.friends.list()
  })

  ipcMain.handle(IPC.windowAction, (event, action: 'minimize' | 'maximize' | 'close' | 'show') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') {
      win.show()
      if (win.isMinimized()) win.restore()
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'show') {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else win.close()
  })

  ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.')
    await shell.openExternal(url)
  })

  handle(IPC.openRoot, async () => {
    await shell.openPath(services.paths.root)
  })

  handle(IPC.openInstanceFolder, async (id: string) => {
    await services.instances.get(id)
    await shell.openPath(join(services.paths.instances, id))
  })

  handle(IPC.openLogs, async (id: string) => {
    await services.instances.get(id)
    await shell.openPath(join(services.paths.instances, id, 'logs'))
  })

  handle(IPC.listCrashReports, async (id: string) => {
    const crashDir = join(services.paths.instances, id, 'crash-reports')
    try {
      const files = await readdir(crashDir)
      const reports = []
      for (const file of files) {
        if (!file.endsWith('.txt')) continue
        const fullPath = join(crashDir, file)
        const stat = await (await import('node:fs/promises')).stat(fullPath)
        reports.push({ name: file, path: fullPath, size: stat.size, modified: stat.mtimeMs })
      }
      return reports.sort((a, b) => b.modified - a.modified)
    } catch {
      return []
    }
  })

  handle(IPC.disableAllMods, async (id: string) => {
    const instance = await services.instances.get(id)
    const modsDir = join(services.paths.instances, id, 'mods')
    try {
      const files = await readdir(modsDir)
      for (const file of files) {
        if (file.endsWith('.jar') && !file.endsWith('.disabled')) {
          await rename(join(modsDir, file), join(modsDir, `${file}.disabled`))
        }
      }
      return { disabled: files.filter(f => f.endsWith('.jar') && !f.endsWith('.disabled')).length }
    } catch {
      return { disabled: 0 }
    }
  })

  handle(IPC.versionsList, async (includeSnapshots: boolean) => services.listVersions(Boolean(includeSnapshots)))
  handle(IPC.instanceGet, async (id: string) => services.instanceDetail(id))
  handle(IPC.instanceCreate, async (input) => services.createInstance(input))
  handle(IPC.instanceUpdate, async (id: string, patch) => services.updateInstance(id, patch))
  handle(IPC.instanceDelete, async (id: string) => {
    if (services.launcher.isRunning(id)) throw new Error('Stop the game before deleting this instance.')
    await services.instances.remove(id)
  })

  handle(IPC.launchStart, async (id: string) => services.launch(id))
  handle(IPC.launchStop, async () => {
    await services.launcher.stop()
  })
  handle(IPC.launchTail, async (id: string, lines?: number) => services.launcher.tailLogs(id, lines ?? 250))

  handle(IPC.modsList, async (id: string) => services.listMods(id))
  handle(
    IPC.modsSearch,
    async (
      query: string,
      type: 'mod' | 'modpack',
      instanceId: string | null,
      offset?: number,
      filters?: import('../shared/types').ModSearchFilters
    ) => services.searchMods(query, type, instanceId, offset ?? 0, filters ?? {})
  )
  handle(IPC.modsInstall, async (instanceId: string, ref: string) => services.installMod(instanceId, ref))
  handle(IPC.modsDetail, async (ref: string) => services.modDetail(ref))
  handle(IPC.modsVersions, async (ref: string, instanceId: string | null) => services.modVersions(ref, instanceId))
  handle(IPC.modsInstallVersion, async (instanceId: string, versionId: string) =>
    services.installModVersion(instanceId, versionId)
  )
  handle(IPC.modsCategories, async (type?: 'mod' | 'modpack') => services.modCategories(type ?? 'mod'))
  handle(IPC.modsRemove, async (instanceId: string, identifier: string) => {
    const instance = await services.instances.get(instanceId)
    await services.mods.remove(instance, identifier)
  })
  handle(IPC.modsToggle, async (instanceId: string, filename: string) => {
    const instance = await services.instances.get(instanceId)
    await services.mods.toggle(instance, filename)
  })
  handle(IPC.modsUpdates, async (instanceId: string) => services.checkModUpdates(instanceId))
  handle(IPC.modsUpdateAll, async (instanceId: string, projectIds?: string[]) =>
    services.updateMods(instanceId, projectIds)
  )

  handle(IPC.packsStatus, async (instanceId: string, packId: string) => services.packStatus(instanceId, packId))
  handle(IPC.packsApply, async (instanceId: string, packId: string) => services.applyPack(instanceId, packId))
  handle(IPC.packsCreateFromModpack, async (input) => services.createInstanceFromPack(input))

  handle(IPC.perfScan, async () => services.scanPerformance())
  handle(IPC.perfPlan, async (instanceId: string, profile: PerfProfileId, memoryMb?: number, preset?: JvmPresetId) =>
    services.planPerformance(instanceId, profile, memoryMb, preset)
  )
  handle(IPC.perfApply, async (instanceId: string, profile: PerfProfileId, memoryMb?: number, preset?: JvmPresetId) =>
    services.applyPerformance(instanceId, profile, memoryMb, preset)
  )

  handle(IPC.serverCommand, async (instanceId: string, command: string) =>
    services.serverCommand(instanceId, command)
  )
  handle(IPC.gameUiGet, async (instanceId: string) => services.getGameUi(instanceId))
  handle(IPC.gameUiApply, async (instanceId: string, values: Partial<GameUiOptions>) =>
    services.applyGameUi(instanceId, values)
  )

  handle(IPC.cosmeticsSnapshot, async () => services.cosmeticsSnapshot())
  handle(IPC.cosmeticsBuy, async (id: string) => services.buyCosmetic(id))
  handle(IPC.cosmeticsEquip, async (id: string) => services.equipCosmetic(id))
  handle(IPC.cosmeticsClaim, async () => services.claimShards())

  handle(IPC.accountsOffline, async (name: string) => services.addOffline(name))
  handle(IPC.accountsRemove, async (id: string) => services.removeAccount(id))
  handle(IPC.accountsActive, async (id: string) => services.setActiveAccount(id))
  handle(IPC.accountsMicrosoft, async () => services.beginMicrosoftLogin())

  handle(IPC.settingsUpdate, async (patch) => services.updateSettings(patch))

  handle(IPC.fabricLoaders, async (mcVersion: string) => services.fabricLoaders(mcVersion))
  handle(IPC.fabricEnsure, async (mcVersion: string, preferredLoader?: string) => services.fabricEnsure(mcVersion, preferredLoader))
  handle(IPC.installUpdate, async () => services.installUpdate())
  handle(IPC.importMrpack, async () => services.importMrpack())

  ipcMain.handle(IPC.settingsChooseJava, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Select a Java runtime',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [
              { name: 'Java runtime', extensions: ['exe'] },
              { name: 'All files', extensions: ['*'] }
            ]
          : [{ name: 'All files', extensions: ['*'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return { path: '', java: services.java }
    }
    const java = await services.setJavaPath(result.filePaths[0])
    return { path: result.filePaths[0], java }
  })

  handle(IPC.settingsRescanJava, async () => services.rescanJava())
  handle(IPC.settingsDownloadJava, async (major: number) => {
    const java = await services.downloadJava(major)
    return { path: java[0]?.path ?? '', java }
  })
}
