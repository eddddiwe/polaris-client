import { useApp } from '../context'
import { Icon, PolarisMark } from './Icons'

export function TitleBar(): JSX.Element {
  const { api, boot } = useApp()
  const isMac = api.platform === 'darwin'

  return (
    <header className={`titlebar ${isMac ? 'titlebar-mac' : ''}`}>
      <div className="titlebar-brand">
        <PolarisMark size={17} />
        <span className="titlebar-name">POLARIS</span>
        <span className="titlebar-ver">v{boot.appVersion}</span>
      </div>
      <div className="titlebar-center">
        <span className="titlebar-tag">PERFORMANCE CLIENT</span>
      </div>
      {!isMac && (
        <div className="window-controls">
          <button className="window-btn" aria-label="Minimize" onClick={() => void api.windowAction('minimize')}>
            <Icon name="minimize" size={15} />
          </button>
          <button className="window-btn" aria-label="Maximize" onClick={() => void api.windowAction('maximize')}>
            <Icon name="maximize" size={13} />
          </button>
          <button className="window-btn window-close" aria-label="Close" onClick={() => void api.windowAction('close')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
