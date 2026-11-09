import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { InstanceSummary, LaunchState } from '@shared/types'
import { AppContext, type AppContextValue } from '../src/renderer/src/context'
import { Sidebar } from '../src/renderer/src/components/Sidebar'

const instance = {
  id: 'astra',
  name: 'Astra',
  mcVersion: '26.3',
  loader: 'fabric'
} as unknown as InstanceSummary

function renderSidebar(options: {
  instances?: InstanceSummary[]
  launchState?: LaunchState
  gameRunning?: boolean
}): string {
  const value = {
    page: 'home',
    navigate: () => undefined,
    boot: {
      appVersion: '0.4.5',
      settings: { equippedBadge: 'badge-north' },
      instances: options.instances ?? [],
      accounts: [],
      activeAccountId: null
    },
    launchState: options.launchState ?? { instanceId: null, status: 'idle' },
    gameRunning: options.gameRunning ?? false,
    stop: async () => undefined,
    openAccount: () => undefined
  } as unknown as AppContextValue
  return renderToStaticMarkup(
    createElement(AppContext.Provider, { value }, createElement(Sidebar))
  )
}

describe('Sidebar running card', () => {
  it('shows the running instance name and stop control', () => {
    const html = renderSidebar({
      instances: [instance],
      launchState: { instanceId: 'astra', status: 'running' },
      gameRunning: true
    })
    expect(html).toContain('sidebar-game')
    expect(html).toContain('Astra')
    expect(html).toContain('Stop')
  })

  it('keeps the stop control when the running instance is no longer listed', () => {
    const html = renderSidebar({
      instances: [],
      launchState: { instanceId: 'astra', status: 'running' },
      gameRunning: true
    })
    expect(html).toContain('sidebar-game')
    expect(html).toContain('Minecraft')
    expect(html).toContain('Stop')
    expect(html).toContain('Instance details unavailable')
  })

  it('does not show a running card when no game is running', () => {
    const html = renderSidebar({
      instances: [instance],
      launchState: { instanceId: 'astra', status: 'exited' },
      gameRunning: false
    })
    expect(html).not.toContain('sidebar-game')
  })
})
