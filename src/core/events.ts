import type { ProgressEvent } from '../shared/types'

type ProgressListener = (event: ProgressEvent) => void

export class ProgressHub {
  private listeners = new Set<ProgressListener>()
  private lastEmit = new Map<string, number>()

  on(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: ProgressEvent, throttleMs = 80): void {
    const now = Date.now()
    const last = this.lastEmit.get(event.taskId) ?? 0
    if (!event.done && !event.error && now - last < throttleMs) return
    this.lastEmit.set(event.taskId, now)
    for (const listener of this.listeners) listener(event)
  }

  start(taskId: string, label: string): void {
    this.emit({ taskId, label, detail: 'Starting', current: 0, total: 0, done: false })
  }

  done(taskId: string, label: string, detail = 'Complete'): void {
    this.emit({ taskId, label, detail, current: 1, total: 1, done: true })
  }

  fail(taskId: string, label: string, error: string): void {
    this.emit({ taskId, label, detail: error, current: 0, total: 1, done: true, error })
  }
}
