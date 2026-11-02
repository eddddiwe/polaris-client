import { describe, expect, it } from 'vitest'
// @ts-ignore The Worker is a plain ESM module, intentionally outside the app tsconfig.
import worker from '../website/api/worker.js'

class FakeKV {
  readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }

  async list(options: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }> {
    const prefix = options.prefix ?? ''
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .slice(0, options.limit ?? 1000)
        .map((name) => ({ name }))
    }
  }
}

const kv = new FakeKV()
const env = { FRIENDS: kv, CURRENT_VERSION: '0.4.2', MIN_VERSION: '0.4.2' }
let ipCounter = 0

async function call(
  path: string,
  options: { method?: string; code?: string; secret?: string; body?: unknown } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': `203.0.113.${++ipCounter % 250}`
  }
  if (options.code) headers['X-Polaris-Code'] = options.code
  if (options.secret) headers['X-Polaris-Secret'] = options.secret
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
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
const ALICE_UUID = '11111111-1111-4111-8111-111111111111'
const BOB_UUID = '22222222-2222-4222-8222-222222222222'

async function register(code: string, secret: string, name: string, uuid: string): Promise<void> {
  const response = await call('/v1/friends/register', {
    method: 'POST',
    code,
    secret,
    body: { name, uuid }
  })
  expect(response.status).toBe(200)
}

describe('Polaris Worker auth', () => {
  it('binds a code to the first secret and rejects a takeover', async () => {
    await register(ALICE, ALICE_SECRET, 'Alice', ALICE_UUID)
    const takeover = await call('/v1/friends/register', {
      method: 'POST',
      code: ALICE,
      secret: MALLORY_SECRET,
      body: { name: 'Mallory', uuid: ALICE_UUID }
    })
    expect(takeover.status).toBe(403)

    const wrong = await call('/v1/friends/list', { code: ALICE, secret: MALLORY_SECRET })
    expect(wrong.status).toBe(401)
    const right = await call('/v1/friends/list', { code: ALICE, secret: ALICE_SECRET })
    expect(right.status).toBe(200)
    expect(await right.json()).toEqual({ friends: [] })
  })

  it('does not grant browser CORS and never accepts a code in the query string', async () => {
    const preflight = await call('/v1/friends/list', { method: 'OPTIONS' })
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()

    const queryOnly = await call(`/v1/friends/list?code=${ALICE}`)
    expect(queryOnly.status).toBe(401)
  })

  it('requires both sides to accept a friend request', async () => {
    await register(BOB, BOB_SECRET, 'Bob', BOB_UUID)
    const request = await call('/v1/friends/request', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB }
    })
    expect(request.status).toBe(200)

    const bobRequests = await (await call('/v1/friends/requests', {
      code: BOB,
      secret: BOB_SECRET
    })).json()
    expect(bobRequests.requests.map((entry: { code: string }) => entry.code)).toEqual([ALICE])

    const accept = await call('/v1/friends/respond', {
      method: 'POST',
      code: BOB,
      secret: BOB_SECRET,
      body: { friendCode: ALICE, action: 'accept' }
    })
    expect(accept.status).toBe(200)

    const aliceList = await (await call('/v1/friends/list', {
      code: ALICE,
      secret: ALICE_SECRET
    })).json()
    const bobList = await (await call('/v1/friends/list', {
      code: BOB,
      secret: BOB_SECRET
    })).json()
    expect(aliceList.friends.map((entry: { code: string }) => entry.code)).toEqual([BOB])
    expect(bobList.friends.map((entry: { code: string }) => entry.code)).toEqual([ALICE])
  })

  it('returns presence only for the caller’s friends and blocks spoofing', async () => {
    await register(MALLORY, MALLORY_SECRET, 'Mallory', '33333333-3333-4333-8333-333333333333')
    const post = await call('/v1/presence', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { uuid: ALICE_UUID, name: 'Alice', server: 'play.example.org' }
    })
    expect(post.status).toBe(200)

    const spoof = await call('/v1/presence', {
      method: 'POST',
      code: MALLORY,
      secret: MALLORY_SECRET,
      body: { uuid: ALICE_UUID, name: 'Alice', server: 'evil.example.org' }
    })
    expect(spoof.status).toBe(200)

    const friendPresence = await (await call(
      `/v1/presence/friends?uuids=${ALICE_UUID}`,
      { code: BOB, secret: BOB_SECRET }
    )).json()
    expect(friendPresence.presence[ALICE_UUID]?.server).toBe('play.example.org')

    const strangerPresence = await (await call(
      `/v1/presence/friends?uuids=${BOB_UUID}`,
      { code: ALICE, secret: ALICE_SECRET }
    )).json()
    expect(strangerPresence.presence).toEqual({})
  })

  it('removes a friendship from both lists when authenticated', async () => {
    const remove = await call('/v1/friends/remove-mutual', {
      method: 'POST',
      code: ALICE,
      secret: ALICE_SECRET,
      body: { friendCode: BOB }
    })
    expect(remove.status).toBe(200)
    const aliceList = await (await call('/v1/friends/list', {
      code: ALICE,
      secret: ALICE_SECRET
    })).json()
    const bobList = await (await call('/v1/friends/list', {
      code: BOB,
      secret: BOB_SECRET
    })).json()
    expect(aliceList.friends).toEqual([])
    expect(bobList.friends).toEqual([])
  })

  it('rejects unauthenticated presence reads and writes', async () => {
    const post = await call('/v1/presence', {
      method: 'POST',
      body: { uuid: ALICE_UUID, name: 'Alice', server: 'play.example.org' }
    })
    expect(post.status).toBe(401)
    const read = await call('/v1/presence?server=play.example.org')
    expect(read.status).toBe(401)
  })
})
