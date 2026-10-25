import { useEffect, type ComponentProps, type ReactNode } from 'react'
import type { ProgressEvent } from '@shared/types'
import type { Toast } from '../context'
import { Icon } from './Icons'

export function Toasts({ toasts }: { toasts: Toast[] }): JSX.Element {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-icon">
            <Icon name={toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'info' : 'sparkles'} size={15} />
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

export function ProgressDock({ progress }: { progress: ProgressEvent | null }): JSX.Element | null {
  if (!progress) return null
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : progress.done ? 100 : 0
  return (
    <div className={`progress-dock ${progress.done ? 'done' : ''} ${progress.error ? 'failed' : ''}`}>
      <div className="progress-head">
        <span className="progress-label">
          {progress.error ? <Icon name="info" size={14} /> : <span className="spinner spinner-sm" />}
          {progress.label}
        </span>
        <span className="progress-percent">{progress.error ? 'Failed' : `${percent}%`}</span>
      </div>
      <div className="progress-bar">
        <span style={{ width: `${Math.max(percent, progress.done ? 100 : 4)}%` }} />
      </div>
      <div className="progress-detail">{progress.detail}</div>
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className="loading-inline">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  )
}

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  width
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  width?: number
}): JSX.Element {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" style={{ maxWidth: width ?? 560 }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action
}: {
  icon: ComponentProps<typeof Icon>['name']
  title: string
  body: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}
