import { contextBridge, ipcRenderer } from 'electron'
import { EVENTS, IPC } from '../shared/ipc'
import type { PolarisAPI } from '../shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PolarisAPI & { platform: NodeJS.Platform } = {
  platform: process.platform,
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  windowAction: (action) => ipcRenderer.invoke(IPC.windowAction, action),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  openRootFolder: () => ipcRenderer.invoke(IPC.openRoot),
  openInstanceFolder: (id) => ipcRenderer.invoke(IPC.openInstanceFolder, id),
  openLogsFolder: (id) => ipcRenderer.invoke(IPC.openLogs, id),
  versions: (includeSnapshots) => ipcRenderer.invoke(IPC.versionsList, includeSnapshots),
  fabricLoaders: (mcVersion) => ipcRenderer.invoke(IPC.fabricLoaders, mcVersion),
  fabricEnsure: (mcVersion, preferredLoader) => ipcRenderer.invoke(IPC.fabricEnsure, mcVersion, preferredLoader),
  getInstance: (id) => ipcRenderer.invoke(IPC.instanceGet, id),
  createInstance: (input) => ipcRenderer.invoke(IPC.instanceCreate, input),
  updateInstance: (id, patch) => ipcRenderer.invoke(IPC.instanceUpdate, id, patch),
  deleteInstance: (id) => ipcRenderer.invoke(IPC.instanceDelete, id),
  launch: (id) => ipcRenderer.invoke(IPC.launchStart, id),
  stop: () => ipcRenderer.invoke(IPC.launchStop),
  tailLogs: (id, lines) => ipcRenderer.invoke(IPC.launchTail, id, lines),
  listMods: (id) => ipcRenderer.invoke(IPC.modsList, id),
  searchMods: (query, type, instanceId, offset, filters) =>
    ipcRenderer.invoke(IPC.modsSearch, query, type, instanceId, offset, filters),
  installMod: (instanceId, ref) => ipcRenderer.invoke(IPC.modsInstall, instanceId, ref),
  removeMod: (instanceId, identifier) => ipcRenderer.invoke(IPC.modsRemove, instanceId, identifier),
  toggleMod: (instanceId, filename) => ipcRenderer.invoke(IPC.modsToggle, instanceId, filename),
  modUpdates: (instanceId) => ipcRenderer.invoke(IPC.modsUpdates, instanceId),
  updateMods: (instanceId, projectIds) => ipcRenderer.invoke(IPC.modsUpdateAll, instanceId, projectIds),
  modDetail: (ref) => ipcRenderer.invoke(IPC.modsDetail, ref),
  modVersions: (ref, instanceId) => ipcRenderer.invoke(IPC.modsVersions, ref, instanceId),
  installModVersion: (instanceId, versionId) => ipcRenderer.invoke(IPC.modsInstallVersion, instanceId, versionId),
  modCategories: (type) => ipcRenderer.invoke(IPC.modsCategories, type),
  packStatus: (instanceId, packId) => ipcRenderer.invoke(IPC.packsStatus, instanceId, packId),
  applyPack: (instanceId, packId) => ipcRenderer.invoke(IPC.packsApply, instanceId, packId),
  createInstanceFromPack: (input) => ipcRenderer.invoke(IPC.packsCreateFromModpack, input),
  scanPerformance: () => ipcRenderer.invoke(IPC.perfScan),
  planPerformance: (instanceId, profile, memoryMb, preset) =>
    ipcRenderer.invoke(IPC.perfPlan, instanceId, profile, memoryMb, preset),
  applyPerformance: (instanceId, profile, memoryMb, preset) =>
    ipcRenderer.invoke(IPC.perfApply, instanceId, profile, memoryMb, preset),
  serverCommand: (instanceId, command) => ipcRenderer.invoke(IPC.serverCommand, instanceId, command),
  gameUi: (instanceId) => ipcRenderer.invoke(IPC.gameUiGet, instanceId),
  applyGameUi: (instanceId, values) => ipcRenderer.invoke(IPC.gameUiApply, instanceId, values),
  cosmetics: () => ipcRenderer.invoke(IPC.cosmeticsSnapshot),
  buyCosmetic: (id) => ipcRenderer.invoke(IPC.cosmeticsBuy, id),
  equipCosmetic: (id) => ipcRenderer.invoke(IPC.cosmeticsEquip, id),
  claimShards: () => ipcRenderer.invoke(IPC.cosmeticsClaim),
  addOfflineAccount: (name) => ipcRenderer.invoke(IPC.accountsOffline, name),
  removeAccount: (id) => ipcRenderer.invoke(IPC.accountsRemove, id),
  setActiveAccount: (id) => ipcRenderer.invoke(IPC.accountsActive, id),
  microsoftLogin: () => ipcRenderer.invoke(IPC.accountsMicrosoft),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  chooseJava: () => ipcRenderer.invoke(IPC.settingsChooseJava),
  rescanJava: () => ipcRenderer.invoke(IPC.settingsRescanJava),
  settingsSnapshot: () => ipcRenderer.invoke(IPC.settingsSnapshot),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  onProgress: (cb) => subscribe(EVENTS.progress, cb),
  onLaunchState: (cb) => subscribe(EVENTS.launchState, cb),
  onGameLog: (cb) => subscribe(EVENTS.gameLog, cb),
  onGameState: (cb) => subscribe(EVENTS.gameState, cb),
  onAccountChanged: (cb) => subscribe(EVENTS.accountChanged, cb),
  onAccountError: (cb) => subscribe(EVENTS.accountError, cb),
  onDeviceCode: (cb) => subscribe(EVENTS.deviceCode, cb)
}

contextBridge.exposeInMainWorld('polaris', api)
