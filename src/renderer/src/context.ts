import { createContext, useContext } from 'react'
import type {
  Bootstrap,
  HardwareInfo,
  InstanceDetail,
  InstanceSummary,
  JavaInfo,
  LaunchState,
  ProgressEvent,
  Settings
} from '@shared/types'
import type { PolarisAPI } from '@shared/api'

export type Page = 'home' | 'instances' | 'instance' | 'discover' | 'performance' | 'store' | 'settings'
export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export interface AppContextValue {
  api: PolarisAPI
  boot: Bootstrap
  settings: Settings
  hardware: HardwareInfo
  java: JavaInfo[]
  instances: InstanceSummary[]
  page: Page
  navigate: (page: Page, instanceId?: string) => void
  activeInstanceId: string | null
  activeInstance?: InstanceSummary
  selectInstance: (id: string) => void
  detail: InstanceDetail | null
  reloadDetail: () => Promise<void>
  refresh: () => Promise<void>
  launchState: LaunchState
  gameRunning: boolean
  launch: (id?: string) => Promise<void>
  stop: () => Promise<void>
  toast: (message: string, kind?: ToastKind) => void
  confirm: ConfirmFn
  progress: ProgressEvent | null
  openNewInstance: () => void
  openAccount: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppContext')
  return value
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function formatRelative(timestamp?: number): string {
  if (!timestamp) return 'Never'
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatPlaytime(ms: number): string {
  if (ms <= 0) return '0m'
  if (ms < 60_000) return '<1m'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.round((ms % 3_600_000) / 60_000)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}
