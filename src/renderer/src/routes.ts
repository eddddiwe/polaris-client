import type { ComponentType } from 'react'
import type { Page } from './context'

type LazyPage = Exclude<Page, 'home'>
type PageModule = { default: ComponentType }

const LOADERS: Record<LazyPage, () => Promise<PageModule>> = {
  instances: () => import('./pages/Instances').then((m) => ({ default: m.InstancesPage })),
  instance: () => import('./pages/Instance').then((m) => ({ default: m.InstancePage })),
  discover: () => import('./pages/Discover').then((m) => ({ default: m.DiscoverPage })),
  performance: () => import('./pages/Performance').then((m) => ({ default: m.PerformancePage })),
  store: () => import('./pages/Store').then((m) => ({ default: m.StorePage })),
  settings: () => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })),
  friends: () => import('./pages/Friends').then((m) => ({ default: m.FriendsPage })),
  chat: () => import('./pages/Chat').then((m) => ({ default: m.ChatPage }))
}

const requests = new Map<LazyPage, Promise<PageModule>>()

/**
 * Single entry point for every route chunk. React.lazy and the hover/idle
 * prefetcher share the in-flight promise, so a prefetch is never wasted and a
 * route is never requested twice.
 */
export function loadPage(page: LazyPage): Promise<PageModule> {
  const cached = requests.get(page)
  if (cached) return cached
  const request = LOADERS[page]()
  // A failed chunk load must not poison later attempts.
  request.catch(() => requests.delete(page))
  requests.set(page, request)
  return request
}

/** Best-effort warm-up; React.lazy stays the source of truth for errors. */
export function preloadPage(page: Page): void {
  if (page === 'home') return
  void loadPage(page).catch(() => {})
}
