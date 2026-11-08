import { memo, useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import type { ProgressEvent } from '@shared/types'
import type { Toast } from '../context'
import { Icon } from './Icons'

export const Toasts = memo(function Toasts({ toasts }: { toasts: Toast[] }): JSX.Element {
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
})

function progressPercent(progress: ProgressEvent): number {
  return progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : progress.done ? 100 : 0
}

// Progress events can outpace visible changes; skip renders with identical markup.
function sameVisibleProgress(previous: ProgressEvent | null, next: ProgressEvent | null): boolean {
  if (previous === next) return true
  if (!previous || !next) return false
  return (
    progressPercent(previous) === progressPercent(next) &&
    previous.label === next.label &&
    previous.detail === next.detail &&
    previous.done === next.done &&
    Boolean(previous.error) === Boolean(next.error)
  )
}

export const ProgressDock = memo(
  function ProgressDock({ progress }: { progress: ProgressEvent | null }): JSX.Element | null {
    if (!progress) return null
    const percent = progressPercent(progress)
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
  },
  (previous, next) => sameVisibleProgress(previous.progress, next.progress)
)

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open dialogs in mount order. Only the top dialog handles Escape and recaptures
// focus, so stacked modals never both close or fight over the caret.
const modalStack: HTMLElement[] = []

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  width,
  dismissible = true
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  width?: number
  dismissible?: boolean
}): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const latest = useRef({ onClose, dismissible })
  // Capture the trigger during the first render: React applies child
  // `autoFocus` before passive effects run, which would otherwise capture an
  // element inside the dialog and lose focus on close.
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
  )

  useEffect(() => {
    latest.current = { onClose, dismissible }
  }, [onClose, dismissible])

  // Document-level handling keeps Escape and the trap alive even if the
  // focused control is disabled while an action runs (focus moves to <body>).
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    modalStack.push(overlay)
    const panelOf = (): HTMLElement => overlay.querySelector<HTMLElement>('.modal') ?? overlay
    const focusables = (): HTMLElement[] =>
      Array.from(panelOf().querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (modalStack[modalStack.length - 1] !== overlay) return
      // Enter/Escape during IME composition belong to the input method.
      if (event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        // Keep a page-level window listener (e.g. ModDetailModal) from also
        // closing something behind this dialog.
        event.stopPropagation()
        if (latest.current.dismissible) latest.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelOf()
      const items = focusables()
      const first = items[0] ?? panel
      const last = items[items.length - 1] ?? panel
      const active = document.activeElement
      const wrappingBack = event.shiftKey && (active === first || active === panel)
      if (!panel.contains(active) || wrappingBack) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (!overlay.isConnected || modalStack[modalStack.length - 1] !== overlay) return
      if (overlay.contains(event.target as Node)) return
      ;(focusables()[0] ?? panelOf()).focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn, true)
      const index = modalStack.lastIndexOf(overlay)
      if (index >= 0) modalStack.splice(index, 1)
    }
  }, [])

  useEffect(() => {
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus({ preventScroll: true })
    return () => {
      const previous = returnFocusRef.current
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        if (dismissible) onClose()
        else panelRef.current?.focus({ preventScroll: true })
      }}
    >
      <section className="modal" ref={panelRef} tabIndex={-1} style={{ maxWidth: width ?? 560 }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={!dismissible}>
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
