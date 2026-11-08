import { memo, useMemo } from 'react'
import type { PolarisAPI } from '@shared/api'
import { useApp } from '../context'
import { Icon, PolarisMark } from './Icons'

type WindowAction = PolarisAPI['windowAction']

/** Hoisted: the inline SVG mark (gradients + paths) is never re-created. */
const brandMark = <PolarisMark size={17} />

const TitleBarChrome = memo(function TitleBarChrome({
  isMac,
  version,
  windowAction
}: {
  isMac: boolean
  version: string
  windowAction: WindowAction
}): JSX.Element {
  const versionBadge = useMemo(() => <span className="titlebar-ver">v{version}</span>, [version])

  const controls = useMemo(() => {
    if (isMac) return null
    const run = (action: Parameters<WindowAction>[0]) => (): void => {
      void windowAction(action)
    }
    return (
      <div className="window-controls">
        <button className="window-btn" aria-label="Minimize" onClick={run('minimize')}>
          <Icon name="minimize" size={15} />
        </button>
        <button className="window-btn" aria-label="Maximize" onClick={run('maximize')}>
          <Icon name="maximize" size={13} />
        </button>
        <button className="window-btn window-close" aria-label="Close" onClick={run('close')}>
          <Icon name="close" size={15} />
        </button>
      </div>
    )
  }, [isMac, windowAction])

  return (
    <header className={`titlebar ${isMac ? 'titlebar-mac' : ''}`}>
      <div className="titlebar-brand">
        {brandMark}
        <span className="titlebar-name">POLARIS</span>
        {versionBadge}
      </div>
      <div className="titlebar-center">
        <span className="titlebar-tag">PERFORMANCE CLIENT</span>
      </div>
      {controls}
    </header>
  )
})

export function TitleBar(): JSX.Element {
  const { api, boot } = useApp()
  return <TitleBarChrome isMac={api.platform === 'darwin'} version={boot.appVersion} windowAction={api.windowAction} />
}
