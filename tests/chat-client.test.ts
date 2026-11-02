import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatService } from '../src/core/chat'
import type { ChatMessage } from '../src/shared/types'

const AUTH = { code: 'POLARIS-AAAA-AAAA', secret: 'a'.repeat(43) }
const BOB = 'POLARIS-BBBB-BBBB'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    from: BOB,
    to: AUTH.code,
    fromName: 'Bob',
    text: 'hello',
    createdAt: 1_793_635_000_000,
    ...overrides
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

type Handler = (event: any) => void

class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  readonly url: string
  private handlers = new Map<string, Handler[]>()

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.dispatch('open', {})
    })
  }

  addEventListener(type: string, handler: Handler): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler)
    this.handlers.set(type, list)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.dispatch('close', {})
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event)
  }
}

afterEach(() => {
  FakeSocket.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(routes: (url: string) => Response | Promise<Response>): {
  service: ChatService
  fetchMock: ReturnType<typeof vi.fn>
} {
  const fetchMock = vi.fn(async (input: any) => {
    const url = String(input)
    return await routes(url)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', FakeSocket as any)
  const service = new ChatService()
  return { service, fetchMock }
}

async function connected(
  routes: (url: string) => Response | Promise<Response>
): Promise<{ service: ChatService; fetchMock: ReturnType<typeof vi.fn>; socket: FakeSocket }> {
  const { service, fetchMock } = setup(routes)
  service.start(AUTH)
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(1))
  const socket = FakeSocket.instances[0]
  await vi.waitFor(() => expect(socket.readyState).toBe(1))
  return { service, fetchMock, socket }
}

const ticketRoute = () => (url: string) =>
  url.endsWith('/v1/chat/ticket') ? json({ ticket: 'ticket-1' }) : json({})

describe('ChatService', () => {
  it('exchanges credentials for a ticket and never puts the secret in the socket URL', async () => {
    const { service, fetchMock, socket } = await connected(ticketRoute())
    try {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://polaris-api.joykelows17.workers.dev/v1/chat/ticket')
      expect(init.method).toBe('POST')
      expect(init.body).toBeUndefined()
      expect((init.headers as Record<string, string>)['X-Polaris-Secret']).toBe(AUTH.secret)
      expect(socket.url).toBe(
        'wss://polaris-api.joykelows17.workers.dev/v1/chat/ws?ticket=ticket-1'
      )
      expect(socket.url).not.toContain(AUTH.secret)
    } finally {
      service.stop()
    }
  })

  it('emits validated live messages and ignores malformed frames', async () => {
    const { service, socket } = await connected(ticketRoute())
    const seen: ChatMessage[] = []
    service.on('message', (value) => seen.push(value))
    try {
      socket.dispatch('message', { data: JSON.stringify({ type: 'message', message: message() }) })
      socket.dispatch('message', { data: 'not json' })
      socket.dispatch('message', { data: JSON.stringify({ type: 'ping' }) })
      socket.dispatch(
        'message',
        { data: JSON.stringify({ type: 'message', message: message({ text: '' }) }) }
      )
      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({ id: message().id, text: 'hello' })
    } finally {
      service.stop()
    }
  })

  it('returns history and drops malformed entries', async () => {
    const { service } = await connected((url) => {
      if (url.endsWith('/v1/chat/ticket')) return json({ ticket: 'ticket-1' })
      if (url.includes('/v1/chat/history')) {
        return json({ messages: [message(), { id: 'bad' }, null] })
      }
      return json({})
    })
    try {
      const history = await service.history(BOB)
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({ id: message().id, from: BOB })
    } finally {
      service.stop()
    }
  })

  it('trims outgoing text and rejects empty messages before calling the API', async () => {
    const { service, fetchMock } = await connected(ticketRoute())
    try {
      const sent = message({ from: AUTH.code, to: BOB, text: 'hi there' })
      fetchMock.mockImplementation(async (input: any) =>
        String(input).includes('/v1/chat/send') ? json({ message: sent }) : json({})
      )
      await expect(service.send(BOB, '  hi there  ')).resolves.toMatchObject({ text: 'hi there' })
      const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
      expect(JSON.parse(String(init.body))).toEqual({ friendCode: BOB, text: 'hi there' })

      const before = fetchMock.mock.calls.length
      await expect(service.send(BOB, '   ')).rejects.toThrow('Message is empty.')
      expect(fetchMock.mock.calls.length).toBe(before)
    } finally {
      service.stop()
    }
  })

  it('surfaces API send errors and invalid payloads', async () => {
    const { service, fetchMock } = await connected(ticketRoute())
    try {
      fetchMock.mockImplementation(async (input: any) => {
        if (!String(input).includes('/v1/chat/send')) return json({})
        return json({ error: 'Too many requests. Try again later.' }, 429)
      })
      await expect(service.send(BOB, 'hello')).rejects.toThrow('Too many requests')

      fetchMock.mockImplementation(async (input: any) =>
        String(input).includes('/v1/chat/send') ? json({ message: { id: 'nope' } }) : json({})
      )
      await expect(service.send(BOB, 'hello')).rejects.toThrow('invalid message')
    } finally {
      service.stop()
    }
  })

  it('treats typing as best-effort', async () => {
    const { service, fetchMock } = await connected(ticketRoute())
    try {
      fetchMock.mockImplementation(async () => {
        throw new Error('offline')
      })
      await expect(service.typing(BOB)).resolves.toBeUndefined()
    } finally {
      service.stop()
    }
  })

  it('reports a reconnect when the socket drops', async () => {
    vi.useFakeTimers()
    const { service, fetchMock } = setup(ticketRoute())
    const states: string[] = []
    service.on('state', (state) => states.push(state))
    try {
      service.start(AUTH)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(FakeSocket.instances).toHaveLength(1)

      FakeSocket.instances[0].close()
      expect(states).toContain('disconnected')

      // Backoff adds up to 20% jitter on top of the 3 s base delay.
      await vi.advanceTimersByTimeAsync(10_000)
      await vi.advanceTimersByTimeAsync(0)
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/chat/ticket'))
      ).toHaveLength(2)
      expect(FakeSocket.instances).toHaveLength(2)
    } finally {
      service.stop()
    }
  })

  it('ignores a late close from a replaced socket', async () => {
    vi.useFakeTimers()
    const { service } = setup(ticketRoute())
    try {
      service.start(AUTH)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      const first = FakeSocket.instances[0]

      service.start({ code: 'POLARIS-CCCC-CCCC', secret: 'c'.repeat(43) })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(FakeSocket.instances).toHaveLength(2)

      const states: string[] = []
      service.on('state', (state) => states.push(state))
      first.close()
      expect(states).toEqual([])
      await vi.advanceTimersByTimeAsync(10_000)
      expect(FakeSocket.instances).toHaveLength(2)
    } finally {
      service.stop()
    }
  })

  it('does not open a socket for an account replaced during the ticket request', async () => {
    let release: (() => void) | undefined
    let staleResolved = false
    let calls = 0
    const { service } = setup((url) => {
      if (!url.endsWith('/v1/chat/ticket')) return json({})
      calls += 1
      if (calls === 1) {
        return new Promise<Response>((resolve) => {
          release = () => {
            staleResolved = true
            resolve(json({ ticket: 'stale-ticket' }))
          }
        })
      }
      return json({ ticket: 'fresh-ticket' })
    })
    try {
      service.start(AUTH)
      await vi.waitFor(() => expect(calls).toBe(1))
      service.start({ code: 'POLARIS-CCCC-CCCC', secret: 'c'.repeat(43) })
      await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))

      release?.()
      // Let the stale connect() continuation resume before asserting,
      // otherwise the assertion passes before the stale code even runs.
      await vi.waitFor(() => expect(staleResolved).toBe(true))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(FakeSocket.instances).toHaveLength(1)
      expect(FakeSocket.instances[0].url).toContain('fresh-ticket')
    } finally {
      service.stop()
    }
  })

  it('surfaces history failures instead of caching an empty thread', async () => {
    const { service } = await connected((url) => {
      if (url.endsWith('/v1/chat/ticket')) return json({ ticket: 'ticket-1' })
      if (url.includes('/v1/chat/history')) return json({ error: 'unavailable' }, 503)
      return json({})
    })
    try {
      await expect(service.history(BOB)).rejects.toThrow('Could not load messages (503)')
    } finally {
      service.stop()
    }
  })

  it('fetches a chat-scoped session for the game process', async () => {
    const token = 'pc_11111111-1111-4111-8111-111111111111'
    const { service, fetchMock } = setup((url) =>
      url.endsWith('/v1/chat/token')
        ? json({ token, code: AUTH.code, expiresAt: 1_793_635_000_000 })
        : json({})
    )
    try {
      await expect(service.session(AUTH)).resolves.toEqual({
        token,
        code: AUTH.code,
        expiresAt: 1_793_635_000_000
      })
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect((init.headers as Record<string, string>)['X-Polaris-Secret']).toBe(AUTH.secret)
      expect(init.body).toBeUndefined()
    } finally {
      service.stop()
    }
  })

  it('rejects malformed chat sessions', async () => {
    const { service } = setup(() => json({ token: 'not-a-token', code: AUTH.code }))
    try {
      await expect(service.session(AUTH)).resolves.toBeNull()
    } finally {
      service.stop()
    }
  })

  it('stops retrying when the ticket endpoint rejects the credentials', async () => {
    vi.useFakeTimers()
    const { service, fetchMock } = setup(() => json({ error: 'Authentication required' }, 401))
    try {
      service.start(AUTH)
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(FakeSocket.instances).toHaveLength(0)
      await expect(service.history(BOB)).rejects.toThrow('Chat is not connected.')
    } finally {
      service.stop()
    }
  })

  it('rejects history and sends after the session is stopped', async () => {
    const { service } = await connected(ticketRoute())
    service.stop()
    await expect(service.history(BOB)).rejects.toThrow('Chat is not connected.')
    await expect(service.send(BOB, 'hello')).rejects.toThrow('Sign in to chat.')
    await expect(service.typing(BOB)).resolves.toBeUndefined()
  })
})

