import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProgressDock } from '../src/renderer/src/components/Feedback'
import type { ProgressEvent } from '../src/shared/types'

const event = (patch: Partial<ProgressEvent> = {}): ProgressEvent => ({
  taskId: 'install',
  label: 'Installing Minecraft',
  detail: 'Ready to launch',
  current: 1,
  total: 1,
  done: true,
  ...patch
})

const render = (progress: ProgressEvent | null): string =>
  renderToStaticMarkup(createElement(ProgressDock, { progress }))

describe('ProgressDock terminal states', () => {
  it('renders a completion icon, not a spinner, once a task succeeds', () => {
    const html = render(event())
    expect(html).toContain('progress-dock done')
    expect(html).not.toContain('spinner')
    expect(html).toContain('m5 12.5')
  })

  it('keeps the spinner while work is running and the error icon on failure', () => {
    const running = render(event({ done: false, current: 1, total: 2 }))
    expect(running).toContain('spinner')
    expect(running).not.toContain('m5 12.5')

    const failed = render(event({ error: 'network down', detail: 'network down' }))
    expect(failed).toContain('progress-dock done failed')
    expect(failed).not.toContain('spinner')
  })
})
