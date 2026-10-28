import type { PolarisAPI } from '@shared/api'

/**
 * Tauri-based implementation of PolarisAPI.
 * Maps Electron IPC calls to Tauri commands.
 * Uses window.__TAURI__ global instead of @tauri-apps/api import.
 */
export function createTauriApi(): PolarisAPI {
  const invoke = (window as any).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('Tauri API not available')

  return {
    platform: navigator.platform.includes('Win') ? 'win32' : navigator.platform.includes('Mac') ? 'darwin' : 'linux',
    bootstrap: () => invoke('bootstrap'),
    windowAction: (action) => invoke('window_action', { action }),
    openExternal: (url) => invoke('open_external', { url }),
    openRootFolder: () => invoke('open_root'),
    openInstanceFolder: (id) => invoke('open_instance_folder', { id }),
    openLogsFolder: (id) => invoke('open_logs', { id }),
    versions: (includeSnapshots) => invoke('versions_list', { includeSnapshots }),
    fabricLoaders: (mcVersion) => invoke('fabric_loaders', { mcVersion }),
    fabricEnsure: (mcVersion, preferredLoader) => invoke('fabric_ensure', { mcVersion, preferredLoader }),
    importMrpack: () => invoke('import_mrpack'),
    getInstance: (id) => invoke('instance_get', { id }),
    createInstance: (input) => invoke('create_instance', { name: input.name, mcVersion: input.mcVersion, loader: input.loader }),
    updateInstance: (id, patch) => invoke('update_instance', { id, patch }),
    deleteInstance: (id) => invoke('delete_instance', { id }),
    launch: (id) => invoke('launch_start', { id }),
    stop: () => invoke('launch_stop'),
    tailLogs: (id, lines) => invoke('launch_tail', { id, lines }),
    listMods: (id) => invoke('list_mods', { instanceId: id }),
    searchMods: (query, type, instanceId, offset, filters) => invoke('search_mods', { query, projectType: type, limit: 24, offset: offset ?? 0 }),
    installMod: (instanceId, ref) => invoke('install_mod', { instanceId, projectId: ref }),
    removeMod: (instanceId, identifier) => invoke('mods_remove', { instanceId, identifier }),
    toggleMod: (instanceId, filename) => invoke('mods_toggle', { instanceId, filename }),
    modUpdates: (instanceId) => invoke('mods_updates', { instanceId }),
    updateMods: (instanceId, projectIds) => invoke('mods_update_all', { instanceId, projectIds }),
    modDetail: (ref) => invoke('mod_detail', { projectId: ref }),
    modVersions: (ref, instanceId) => invoke('mod_versions', { projectId: ref, instanceId }),
    installModVersion: (instanceId, versionId) => invoke('mods_install_version', { instanceId, versionId }),
    modCategories: (type) => invoke('mods_categories', { type }),
    packStatus: (instanceId, packId) => invoke('packs_status', { instanceId, packId }),
    applyPack: (instanceId, packId) => invoke('packs_apply', { instanceId, packId }),
    createInstanceFromPack: (input) => invoke('packs_create_from_modpack', { input }),
    scanPerformance: () => invoke('perf_scan'),
    planPerformance: (instanceId, profile, memoryMb, preset) => invoke('perf_plan', { instanceId, profile, memoryMb, preset }),
    applyPerformance: (instanceId, profile, memoryMb, preset) => invoke('perf_apply', { instanceId, profile, memoryMb, preset }),
    serverCommand: (instanceId, command) => invoke('server_command', { instanceId, command }),
    gameUi: (instanceId) => invoke('gameui_get', { instanceId }),
    applyGameUi: (instanceId, values) => invoke('gameui_apply', { instanceId, values }),
    cosmetics: () => invoke('cosmetics_snapshot'),
    buyCosmetic: (id) => invoke('cosmetics_buy', { id }),
    equipCosmetic: (id) => invoke('cosmetics_equip', { id }),
    claimShards: () => invoke('cosmetics_claim', { playtimeMs: 0 }),
    addOfflineAccount: (name) => invoke('accounts_offline', { name }),
    removeAccount: (id) => invoke('accounts_remove', { id }),
    setActiveAccount: (id) => invoke('accounts_active', { id }),
    microsoftLogin: () => invoke('accounts_microsoft'),
    updateSettings: (patch) => invoke('settings_update', { patch }),
    chooseJava: () => invoke('settings_choose_java'),
    rescanJava: () => invoke('settings_rescan_java'),
    settingsSnapshot: () => invoke('settings_snapshot'),
    checkForUpdates: () => invoke('check_for_updates'),
    installUpdate: () => invoke('install_update'),
    onProgress: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('progress', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onLaunchState: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('launch-state', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onGameLog: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('game-log', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onGameState: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('game-state', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onAccountChanged: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('account-changed', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onAccountError: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('account-error', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
    onDeviceCode: (cb) => {
      const unlisten = (window as any).__TAURI__?.event?.listen('device-code', (e: any) => cb(e.payload))
      return () => { unlisten?.then((f: any) => f()) }
    },
  }
}