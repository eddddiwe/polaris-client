import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../src/core/settings'
import { CosmeticsService } from '../src/core/cosmetics'
import { ShardGrantService } from '../src/core/shards'

const auth = {
  code: 'POLARIS-AAAA-AAAA',
  secret: 'a'.repeat(43)
}
const dirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('shard grants', () => {
  it('reads valid pending grants and rejects malformed ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            grants: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                delta: 50,
                reason: 'event reward',
                createdAt: 1
              },
              { id: 'nope', delta: 20 },
              { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', delta: 0 }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    await expect(new ShardGrantService().pending(auth)).resolves.toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        delta: 50,
        reason: 'event reward',
        createdAt: 1
      }
    ])
  })

  it('returns null when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    await expect(new ShardGrantService().pending(auth)).resolves.toBeNull()
  })

  it('acknowledges only valid grant ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new ShardGrantService()
    await expect(
      service.ack(auth, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bad'])
    ).resolves.toBe(true)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.ids).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
  })

  it('keeps old grant ids so an unacknowledged grant cannot be applied twice', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-shards-'))
    dirs.push(dir)
    const store = new SettingsStore(join(dir, 'settings.json'), dir)
    await store.load()
    const older = Array.from(
      { length: 500 },
      (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
    )
    // `older[0]` was applied but its ack failed, so the server still returns it.
    // The other ids stand for grants applied later while that ack kept failing.
    await store.update({ shards: 0, appliedShardGrants: older })
    const cosmetics = new CosmeticsService(store)
    await expect(cosmetics.applyGrant('ffffffff-ffff-4fff-8fff-ffffffffffff', 5)).resolves.toBe(5)
    expect(store.get().appliedShardGrants).toContain(older[0])
    await expect(cosmetics.applyGrant(older[0], 5)).resolves.toBe(0)
    expect(store.get().shards).toBe(5)
  })

  it('applies a grant once and clamps the balance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-shards-'))
    dirs.push(dir)
    const store = new SettingsStore(join(dir, 'settings.json'), dir)
    await store.load()
    await store.update({ shards: 10, appliedShardGrants: [] })
    const cosmetics = new CosmeticsService(store)
    await expect(cosmetics.applyGrant('grant-a', 5)).resolves.toBe(5)
    expect(store.get().shards).toBe(15)
    await expect(cosmetics.applyGrant('grant-a', 5)).resolves.toBe(0)
    expect(store.get().shards).toBe(15)
    await expect(cosmetics.applyGrant('grant-b', -100)).resolves.toBe(-15)
    expect(store.get().shards).toBe(0)
  })

  it('keeps a claim and a grant when they finish out of order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-shards-'))
    dirs.push(dir)
    const store = new SettingsStore(join(dir, 'settings.json'), dir)
    await store.load()
    await store.update({ shards: 0, shardsClaimedMs: 0, appliedShardGrants: [] })
    const cosmetics = new CosmeticsService(store)
    const [claimed, applied] = await Promise.all([
      cosmetics.claim(86_400_000),
      cosmetics.applyGrant('grant-overlap', 5)
    ])
    expect(claimed).toBe(960)
    expect(applied).toBe(5)
    expect(store.get().shards).toBe(965)
    expect(store.get().shardsClaimedMs).toBe(86_400_000)
    expect(store.get().appliedShardGrants).toContain('grant-overlap')
  })
})
