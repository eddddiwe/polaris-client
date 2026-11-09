import { describe, expect, it } from 'vitest'
import { settleChatSend } from '../src/renderer/src/pages/chatSendScope'
import type { ChatMessage } from '../src/shared/types'

const MINE = 'POLARIS-AAAA-AAAA'
const FRIEND = 'POLARIS-BBBB-BBBB'
const OTHER = 'POLARIS-CCCC-CCCC'

function outgoing(from = MINE, to = FRIEND): ChatMessage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    from,
    to,
    fromName: 'Me',
    text: 'hello',
    createdAt: 1_793_635_000_000
  }
}

function deferred(): {
  promise: Promise<ChatMessage>
  resolve: (message: ChatMessage) => void
} {
  let resolve!: (message: ChatMessage) => void
  const promise = new Promise<ChatMessage>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('settleChatSend', () => {
  it('applies the response while the sending account is still active', async () => {
    const message = outgoing()
    await expect(settleChatSend(Promise.resolve(message), () => MINE)).resolves.toBe(message)
  })

  it('drops a response that resolves after switching to another account', async () => {
    let current: string | null = MINE
    const pending = deferred()
    const scoped = settleChatSend(pending.promise, () => current)

    current = OTHER
    pending.resolve(outgoing())

    await expect(scoped).resolves.toBeNull()
  })

  it('drops a response after switching to the friend account', async () => {
    let current: string | null = MINE
    const pending = deferred()
    const scoped = settleChatSend(pending.promise, () => current)

    // The recipient is now active; the sender's composer is gone, and applying
    // the reply as an outgoing message would create a self-thread.
    current = FRIEND
    pending.resolve(outgoing())

    await expect(scoped).resolves.toBeNull()
  })

  it('drops a response after the user signs out', async () => {
    let current: string | null = MINE
    const pending = deferred()
    const scoped = settleChatSend(pending.promise, () => current)

    current = null
    pending.resolve(outgoing())

    await expect(scoped).resolves.toBeNull()
  })

  it('keeps a response after switching to the friend and back', async () => {
    let current: string | null = MINE
    const pending = deferred()
    const scoped = settleChatSend(pending.promise, () => current)
    const message = outgoing()

    current = FRIEND
    current = MINE
    pending.resolve(message)

    await expect(scoped).resolves.toBe(message)
  })

  it('propagates send failures so the caller can toast them', async () => {
    await expect(
      settleChatSend(Promise.reject(new Error('offline')), () => MINE)
    ).rejects.toThrow('offline')
  })
})
