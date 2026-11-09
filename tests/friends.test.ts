import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FriendStore, type FriendAuth } from '../src/core/friends'

const auth: FriendAuth = {
  code: 'POLARIS-AAAA-AAAA',
  secret: 'a'.repeat(43)
}
const friendCode = 'POLARIS-BBBB-BBBB'
const uuid = '11111111-1111-4111-8111-111111111111'
const otherCode = 'POLARIS-CCCC-CCCC'
const dirs: string[] = []

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function friendResponse(friends: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ friends }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function makeStore(): Promise<{ store: FriendStore; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-friends-'))
  dirs.push(dir)
  const path = join(dir, 'friends.json')
  await writeFile(
    path,
    JSON.stringify({
      owner: auth.code,
      friends: [{ code: friendCode, name: 'Bob', uuid, addedAt: 1 }]
    })
  )
  const store = new FriendStore(path)
  await store.load()
  return { store, path }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('FriendStore state', () => {
  it('clears the local list and owner scope', async () => {
    const { store, path } = await makeStore()
    await store.clear()
    const reloaded = new FriendStore(path)
    await reloaded.load()
    expect(reloaded.list()).toEqual([])
    expect(await reloaded.has(friendCode)).toBe(false)
  })

  it('returns null when presence cannot be loaded', async () => {
    const { store } = await makeStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(store.presence(auth, [uuid])).resolves.toBeNull()
  })

  it('returns an empty map for a successful empty presence response', async () => {
    const { store } = await makeStore()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ presence: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    await expect(store.presence(auth, [uuid])).resolves.toEqual({})
  })

  it('reports local-only removal when the API is unreachable', async () => {
    const { store } = await makeStore()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(store.removeMutual(auth, friendCode)).resolves.toEqual({ synced: false })
    expect(store.list()).toEqual([])
  })

  it('reports server-confirmed removal', async () => {
    const { store } = await makeStore()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    await expect(store.removeMutual(auth, friendCode)).resolves.toEqual({ synced: true })
    expect(store.list()).toEqual([])
  })

  it('keeps a removal when an earlier list request settles afterwards', async () => {
    const { store } = await makeStore()
    const listStarted = deferred()
    const releaseList = deferred()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith('/v1/friends/list')) {
          listStarted.resolve()
          await releaseList.promise
          return friendResponse([{ code: friendCode, name: 'Bob', uuid, addedAt: 1 }])
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })
    )

    const syncing = store.syncFromServer(auth)
    await listStarted.promise
    await store.removeMutual(auth, friendCode)
    expect(store.list()).toEqual([])

    // The poll snapshot predates the removal. It must not resurrect Bob.
    releaseList.resolve()
    await syncing
    expect(store.list()).toEqual([])
  })

  it('keeps a newly accepted friend when a pre-accept list request settles afterwards', async () => {
    const { store } = await makeStore()
    const listStarted = deferred()
    const releaseList = deferred()
    let listCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith('/v1/friends/list')) {
          listCalls += 1
          if (listCalls === 1) {
            listStarted.resolve()
            await releaseList.promise
            return friendResponse([{ code: friendCode, name: 'Bob', uuid, addedAt: 1 }])
          }
          return friendResponse([
            { code: friendCode, name: 'Bob', uuid, addedAt: 1 },
            { code: otherCode, name: 'Carol', addedAt: 2 }
          ])
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })
    )

    const stale = store.syncFromServer(auth)
    await listStarted.promise
    await store.respondRequest(auth, otherCode, 'accept')
    await store.syncFromServer(auth)
    expect(store.has(otherCode)).toBe(true)

    releaseList.resolve()
    await stale
    expect(store.has(otherCode)).toBe(true)
  })

  it('does not let a previous account list repopulate after switching', async () => {
    const { store, path } = await makeStore()
    const listStarted = deferred()
    const releaseList = deferred()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith('/v1/friends/list')) {
          listStarted.resolve()
          await releaseList.promise
          return friendResponse([{ code: friendCode, name: 'Bob', uuid, addedAt: 1 }])
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })
    )

    const stale = store.syncFromServer(auth)
    await listStarted.promise
    await store.useAccount(otherCode)
    releaseList.resolve()
    await stale

    expect(store.list()).toEqual([])
    const reloaded = new FriendStore(path)
    await reloaded.load()
    expect(reloaded.list()).toEqual([])
  })
})
