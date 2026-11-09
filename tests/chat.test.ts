import { beforeAll, describe, expect, it } from 'vitest'
// @ts-ignore The Worker is a plain ESM module, intentionally outside the app tsconfig.
import worker, { ChatInbox } from '../website/api/worker.js'

class FakeKV {
  readonly values = new Map<string, string>()
  readonly puts: { key: string; options?: { expirationTtl?: number } }[] = []
  reads = 0

  async get(key: string): Promise<string | null> {
    this.reads += 1
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.puts.push({ key, options })
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }

  async list(options: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }> {
    const prefix = options.prefix ?? ''
    // Workers KV lists keys in lexicographic order, not insertion order.
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
        .slice(0, options.limit ?? 1000)
        .map((name) => ({ name }))
    }
  }
}

const kv = new FakeKV()
const broadcasts: { code: string; payload: any }[] = []
const upgrades: string[] = []

const CHAT = {
  idFromName: (name: string) => name,
  get: (name: string) => ({
    // Cloudflare's stub.fetch accepts a URL plus init, not only a Request.
    fetch: async (input: string | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/broadcast') {
        broadcasts.push({ code: name, payload: await request.json() })
        return new Response('ok')
      }
      upgrades.push(String(request.headers.get('X-Polaris-Code') || ''))
      return new Response('upgraded', { status: 200 })
    }
  })
}

const env = {
  FRIENDS: kv,
  CHAT,
  CURRENT_VERSION: '0.4.5',
  MIN_VERSION: '0.4.2'
}

let ipCounter = 0

async function call(
  path: string,
  options: {
    method?: string
    code?: string
    secret?: string
    body?: unknown
    upgrade?: boolean
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': `198.51.100.${++ipCounter % 250}`
  }
  if (options.code) headers['X-Polaris-Code'] = options.code
  if (options.secret) headers['X-Polaris-Secret'] = options.secret
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.upgrade) headers.Upgrade = 'websocket'
  const request = new Request(`https://polaris.test${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  return await (worker as any).fetch(request, env)
}

const ALICE = 'POLARIS-AAAA-AAAA'
const BOB = 'POLARIS-BBBB-BBBB'
const MALLORY = 'POLARIS-CCCC-CCCC'
const ALICE_SECRET = 'a'.repeat(43)
const BOB_SECRET = 'b'.repeat(43)
const MALLORY_SECRET = 'c'.repeat(43)

async function register(code: string, secret: string, name: string, uuid: string): Promise<void> {
  const response = await call('/v1/friends/register', {
    method: 'POST',
    code,
    secret,
    body: { name, uuid }
  })
  expect(response.status).toBe(200)
}

function chatKeys(): string[] {
  return [...kv.values.keys()].filter((key) => key.startsWith('chat:'))
}

beforeAll(async () => {
  await register(ALICE, ALICE_SECRET, 'Alice', '11111111-1111-4111-8111-111111111111')
  await register(BOB, BOB_SECRET, 'Bob', '22222222-2222-4222-8222-222222222222')
  await register(MALLORY, MALLORY_SECRET, 'Mallory', '33333333-3333-4333-8333-333333333333')
  expect(
    (
      await call('/v1/friends/request', {
        method: 'POST',
        code: ALICE,
        secret: ALICE_SECRET,
        body: { friendCode: BOB }
      })
    ).status
  ).toBe(200)
  expect(
    (
      await call('/v1/friends/respond', {
        method: 'POST',
        code: BOB,
        secret: BOB_SECRET,
        body: { friendCode: ALICE, action: 'accept' }
      })
    ).status
  ).toBe(200)
})

describe('Polaris chat transport', () => {
  it('issues a short-lived single-use ticket without a friend code body', async () => {
    const response = await call('/v1/chat/ticket', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET
    })
    expect(response.status).toBe(200)
    const { ticket } = await response.json()
    expect(ticket).toMatch(/^[0-9a-f-]{36}$/i)

    const stored = JSON.parse(String(kv.values.get(`chatTicket:${ticket}`)))
    expect(stored.code).toBe(ALICE)
    const write = [...kv.puts].reverse().find((entry) => entry.key === `chatTicket:${ticket}`)
    expect(write?.options?.expirationTtl).toBe(90)

    const upgrade = await call(`/v1/chat/ws?ticket=${ticket}`, { upgrade: true })
    expect(upgrade.status).toBe(200)
    expect(upgrades).toEqual([ALICE])

    const replay = await call(`/v1/chat/ws?ticket=${ticket}`, { upgrade: true })
    expect(replay.status).toBe(401)
  })

  it('refuses a socket handoff without a ticket or without an upgrade request', async () => {
    const noTicket = await call('/v1/chat/ws', { upgrade: true })
    expect(noTicket.status).toBe(401)

    const ticket = await (
      await call('/v1/chat/ticket', { method: 'POST', code: ALICE, secret: ALICE_SECRET })
    ).json()
    const plain = await call(`/v1/chat/ws?ticket=${ticket.ticket}`)
    expect(plain.status).toBe(426)
  })

  it('rejects friend codes outside the launcher alphabet', async () => {
    const response = await call('/v1/friends/register', {
      method: 'POST',
      code: 'POLARIS-IO01-ABCD',
      secret: 'z'.repeat(43),
      body: { name: 'Bad', uuid: '77777777-7777-4777-8777-777777777777' }
    })
    expect(response.status).toBe(400)
  })

  it('issues a chat-scoped token that cannot reach friends or mint more tokens', async () => {
    const response = await call('/v1/chat/token', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET
    })
    expect(response.status).toBe(200)
    const { token, code } = await response.json()
    expect(code).toBe(ALICE)
    expect(token).toMatch(/^pc_[0-9a-f-]{36}$/i)

    const stored = [...kv.puts].reverse().find((entry) => entry.key.startsWith('chatToken:'))
    expect(stored).toBeTruthy()
    expect(stored?.options?.expirationTtl).toBe(12 * 60 * 60)

    const chatHeaders = { 'X-Polaris-Chat-Token': token } as Record<string, string>
    const history = await (worker as any).fetch(
      new Request(`https://polaris.test/v1/chat/history?friendCode=${BOB}`, { headers: chatHeaders }),
      env
    )
    expect(history.status).toBe(200)

    const chatFriends = await (worker as any).fetch(
      new Request('https://polaris.test/v1/chat/friends', { headers: chatHeaders }),
      env
    )
    expect(chatFriends.status).toBe(200)
    expect((await chatFriends.json()).friends.map((friend: { code: string }) => friend.code)).toEqual([
      BOB
    ])

    const friends = await (worker as any).fetch(
      new Request('https://polaris.test/v1/friends/list', { headers: chatHeaders }),
      env
    )
    expect(friends.status).toBe(401)

    const secondToken = await (worker as any).fetch(
      new Request('https://polaris.test/v1/chat/token', { method: 'POST', headers: chatHeaders }),
      env
    )
    expect(secondToken.status).toBe(401)
  })

  it('requires authentication for ticket, history and send', async () => {
    expect((await call('/v1/chat/ticket', { method: 'POST' })).status).toBe(401)
    expect((await call(`/v1/chat/history?friendCode=${BOB}`)).status).toBe(401)
    expect((await call('/v1/chat/send', { method: 'POST', body: {} })).status).toBe(401)
    expect((await call('/v1/chat/typing', { method: 'POST', body: {} })).status).toBe(401)
  })

  it('withholds a chat token until the profile is registered', async () => {
    const response = await call('/v1/chat/token', {
      method: 'POST',
      code: 'POLARIS-DDDD-DDDD',
      secret: 'd'.repeat(43)
    })
    expect(response.status).toBe(401)
  })

  it('stores a friend message for 30 days and pushes it to both inboxes', async () => {
    broadcasts.length = 0
    const response = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB, text: '  hello live  ' }
    })
    expect(response.status).toBe(200)
    const { message } = await response.json()
    expect(message).toMatchObject({ from: ALICE, to: BOB, fromName: 'Alice', text: 'hello live' })

    const key = chatKeys().find((name) => name.includes(message.id))
    expect(key).toBeTruthy()
    expect(key?.startsWith(`chat:${ALICE}:${BOB}:`)).toBe(true)
    const stored = String(key).slice(String(key).lastIndexOf(':') + 1)
    expect(stored.split('-')[0]).toBe(String(9_999_999_999_999 - message.createdAt).padStart(13, '0'))
    const write = [...kv.puts].reverse().find((entry) => entry.key === key)
    expect(write?.options?.expirationTtl).toBe(30 * 24 * 60 * 60)

    expect(broadcasts.map((entry) => entry.code).sort()).toEqual([ALICE, BOB])
    expect(broadcasts[0].payload).toEqual({ type: 'message', message })

    const history = await (
      await call(`/v1/chat/history?friendCode=${ALICE}`, { code: BOB, secret: BOB_SECRET })
    ).json()
    expect(history.messages).toEqual([expect.objectContaining({ id: message.id, text: 'hello live' })])
  })

  it('keeps chat friends-only', async () => {
    const send = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: MALLORY, text: 'not a friend' }
    })
    expect(send.status).toBe(403)

    const history = await call(`/v1/chat/history?friendCode=${MALLORY}`, {
      code: ALICE,
      secret: ALICE_SECRET
    })
    expect(history.status).toBe(403)

    const typing = await call('/v1/chat/typing', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: MALLORY }
    })
    expect(typing.status).toBe(403)

    const self = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: ALICE, text: 'loop' }
    })
    expect(self.status).toBe(403)
  })

  it('keeps line breaks and strips bidi controls', async () => {
    const response = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB, text: 'line one\nline two\tend\u202e' }
    })
    expect(response.status).toBe(200)
    const { message } = await response.json()
    expect(message.text).toBe('line one\nline two\tend')

    const history = await (
      await call(`/v1/chat/history?friendCode=${BOB}`, { code: ALICE, secret: ALICE_SECRET })
    ).json()
    expect(history.messages.at(-1)?.text).toBe('line one\nline two\tend')
  })

  it('rejects empty messages and clamps overlong text', async () => {
    const empty = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB, text: '   ' }
    })
    expect(empty.status).toBe(400)

    const long = await call('/v1/chat/send', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB, text: 'x'.repeat(1200) }
    })
    expect(long.status).toBe(200)
    expect((await long.json()).message.text).toHaveLength(800)
  })

  it('delivers typing only to the recipient inbox', async () => {
    broadcasts.length = 0
    const response = await call('/v1/chat/typing', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB }
    })
    expect(response.status).toBe(200)
    expect(broadcasts).toEqual([
      { code: BOB, payload: { type: 'typing', from: ALICE, fromName: 'Alice' } }
    ])
  })

  it('returns only the newest page of messages in chronological order', async () => {
    for (const key of chatKeys()) kv.values.delete(key)
    const base = Date.now() - 200_000
    for (let index = 0; index < 130; index += 1) {
      const at = base + index
      const keyTime = String(9_999_999_999_999 - at).padStart(13, '0')
      await kv.put(
        `chat:${ALICE}:${BOB}:${keyTime}-00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        JSON.stringify({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          from: index % 2 ? BOB : ALICE,
          to: index % 2 ? ALICE : BOB,
          fromName: index % 2 ? 'Bob' : 'Alice',
          text: `message ${index}`,
          createdAt: at
        })
      )
    }
    kv.reads = 0
    const history = await (
      await call(`/v1/chat/history?friendCode=${BOB}`, { code: ALICE, secret: ALICE_SECRET })
    ).json()
    expect(history.messages).toHaveLength(40)
    expect(history.messages[0].text).toBe('message 90')
    expect(history.messages[39].text).toBe('message 129')
    // auth + isFriend + list + one read per message stays under the Workers
    // Free plan's 50-subrequest limit.
    expect(kv.reads).toBeLessThanOrEqual(50)
    const timestamps = history.messages.map((entry: { createdAt: number }) => entry.createdAt)
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps)
  })

  it('skips stored records that do not belong to the room', async () => {
    for (const key of chatKeys()) kv.values.delete(key)
    const base = Date.now()
    await kv.put(
      `chat:${ALICE}:${BOB}:${String(9_999_999_999_999 - (base + 1)).padStart(13, '0')}-11111111-1111-4111-8111-111111111111`,
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        from: ALICE,
        to: BOB,
        fromName: 'Alice',
        text: 'valid',
        createdAt: base + 1
      })
    )
    await kv.put(
      `chat:${ALICE}:${BOB}:${String(9_999_999_999_999 - base).padStart(13, '0')}-22222222-2222-4222-8222-222222222222`,
      JSON.stringify({
        id: '22222222-2222-4222-8222-222222222222',
        from: ALICE,
        to: MALLORY,
        fromName: 'Alice',
        text: 'wrong room',
        createdAt: base
      })
    )

    const history = await (
      await call(`/v1/chat/history?friendCode=${BOB}`, { code: ALICE, secret: ALICE_SECRET })
    ).json()
    expect(history.messages).toHaveLength(1)
    expect(history.messages[0].text).toBe('valid')
  })

  it('reports a missing chat binding instead of pretending typing worked', async () => {
    const response = await (worker as any).fetch(
      new Request('https://polaris.test/v1/chat/typing', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': '198.51.100.240',
          'Content-Type': 'application/json',
          'X-Polaris-Code': ALICE,
          'X-Polaris-Secret': ALICE_SECRET
        },
        body: JSON.stringify({ friendCode: BOB })
      }),
      { FRIENDS: kv, MIN_VERSION: '0.4.2' }
    )
    expect(response.status).toBe(503)
  })
})

describe('ChatInbox Durable Object', () => {
  it('broadcasts validated payloads to every connected socket', async () => {
    const sent: string[] = []
    const state = {
      getWebSockets: () => [
        { send: (data: string) => sent.push(data) },
        { send: (data: string) => sent.push(data) }
      ]
    }
    const inbox = new (ChatInbox as any)(state)
    const response = await inbox.fetch(
      new Request('https://chat.internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'typing', from: ALICE, fromName: 'Alice' })
      })
    )
    expect(response.status).toBe(200)
    expect(sent).toHaveLength(2)
    expect(JSON.parse(sent[0])).toEqual({ type: 'typing', from: ALICE, fromName: 'Alice' })
  })

  it('rejects unknown payload types', async () => {
    const inbox = new (ChatInbox as any)({ getWebSockets: () => [] })
    const response = await inbox.fetch(
      new Request('https://chat.internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'shutdown' })
      })
    )
    expect(response.status).toBe(400)
  })
})
