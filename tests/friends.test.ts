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
const dirs: string[] = []

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
})
