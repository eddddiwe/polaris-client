import { describe, expect, it, vi } from 'vitest'
import { stopChatAfterStart } from '../src/renderer/src/chat-lifecycle'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('stopChatAfterStart', () => {
  it('stops again when a pending start outlives the page', async () => {
    const start = deferred()
    const stop = vi.fn()

    stopChatAfterStart(start.promise, () => true, stop)
    expect(stop).not.toHaveBeenCalled()

    start.resolve()
    await flush()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('leaves a newer chat owner alone after an account switch', async () => {
    const start = deferred()
    const stop = vi.fn()

    stopChatAfterStart(start.promise, () => false, stop)
    start.resolve()
    await flush()
    expect(stop).not.toHaveBeenCalled()
  })

  it('stops after a failed start as well', async () => {
    const start = deferred()
    const stop = vi.fn()

    stopChatAfterStart(start.promise, () => true, stop)
    start.reject(new Error('offline'))
    await flush()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
