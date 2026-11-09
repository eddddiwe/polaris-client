import { readJson, writeJson } from './fsutil'
import { join } from 'node:path'
import type { Friend } from '../shared/types'

const WORKER_BASE = 'https://polaris-api.joykelows17.workers.dev'
const FRIEND_CODE = /^POLARIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

export interface FriendAuth {
  code: string
  secret: string
}

interface FriendFile {
  owner?: string
  friends: Friend[]
}

export class FriendStore {
  private data: FriendFile = { friends: [] }
  /** Code + secret pairs already registered successfully in this process. */
  private readonly registered = new Set<string>()
  /**
   * Bumped when local state changes. A list sync that started before the
   * change must not apply its stale snapshot: the 15s Friends poll could
   * otherwise restore a friend removed while the request was in flight.
   */
  private revision = 0
  /** Latest-wins token for overlapping list requests. */
  private syncSeq = 0

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    const loaded = await readJson<FriendFile | null>(this.path, null)
    if (loaded && Array.isArray(loaded.friends)) this.data = loaded
  }

  async save(): Promise<void> {
    await writeJson(this.path, this.data)
  }

  list(): Friend[] {
    return [...this.data.friends].sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Keep the local cache scoped to one account. Without this, signing out and
   * signing in offline would show the previous account's friend list.
   */
  async useAccount(code: string): Promise<void> {
    if (this.data.owner === code) return
    this.revision += 1
    this.data = { owner: code, friends: [] }
    await this.save()
  }

  async clear(): Promise<void> {
    if (!this.data.owner && this.data.friends.length === 0) return
    // Drop the owner as well: the next account must establish a fresh scope.
    this.revision += 1
    this.data = { friends: [] }
    await this.save()
  }

  private headers(auth: FriendAuth): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Polaris-Code': auth.code,
      'X-Polaris-Secret': auth.secret
    }
  }

  async syncFromServer(auth: FriendAuth): Promise<void> {
    const revision = this.revision
    const seq = ++this.syncSeq
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/list`, {
        headers: this.headers(auth),
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) return
      const data = (await res.json()) as { friends?: unknown }
      if (!Array.isArray(data.friends)) return
      // A removal/account switch landed while this request was in flight, or a
      // newer list request superseded this one.
      if (revision !== this.revision || seq !== this.syncSeq) return
      this.data.owner = auth.code
      this.data.friends = data.friends.map((value) => {
        const f = value as { code?: unknown; name?: unknown; uuid?: unknown; addedAt?: unknown }
        return {
          code: String(f.code ?? '').toUpperCase(),
          name: String(f.name || f.code || ''),
          uuid: f.uuid ? String(f.uuid) : undefined,
          addedAt: Number(f.addedAt) || Date.now()
        }
      })
      await this.save()
    } catch {
      // offline: keep local cache
    }
  }

  /** Bind the code to this account's secret. Idempotent while the secret matches. */
  async register(auth: FriendAuth, name: string, uuid?: string): Promise<boolean> {
    if (!FRIEND_CODE.test(auth.code) || !auth.secret) return false
    const key = `${auth.code}:${auth.secret}`
    if (this.registered.has(key)) return true
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/register`, {
        method: 'POST',
        headers: this.headers(auth),
        body: JSON.stringify({ name, uuid }),
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) this.registered.add(key)
      return res.ok
    } catch {
      return false
    }
  }

  async removeMutual(auth: FriendAuth, friendCode: string): Promise<{ synced: boolean }> {
    let synced = false
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/remove-mutual`, {
        method: 'POST',
        headers: this.headers(auth),
        body: JSON.stringify({ friendCode }),
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `Could not remove friend (${res.status})`)
      }
      synced = true
    } catch (error) {
      // Offline removals are local-only. A server rejection must be shown,
      // otherwise the local and server graphs silently diverge.
      if (error instanceof Error && !/fetch|network|timed? ?out|failed to fetch/i.test(error.message)) {
        throw error
      }
    }
    this.revision += 1
    this.data.friends = this.data.friends.filter((f) => f.code !== friendCode)
    await this.save()
    return { synced }
  }

  async sendRequest(auth: FriendAuth, friendCode: string): Promise<void> {
    const res = await fetch(`${WORKER_BASE}/v1/friends/request`, {
      method: 'POST',
      headers: this.headers(auth),
      body: JSON.stringify({ friendCode }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error || `Could not send friend request (${res.status})`)
    }
  }

  async respondRequest(auth: FriendAuth, friendCode: string, action: 'accept' | 'decline'): Promise<void> {
    const res = await fetch(`${WORKER_BASE}/v1/friends/respond`, {
      method: 'POST',
      headers: this.headers(auth),
      body: JSON.stringify({ friendCode, action }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error || `Could not respond to friend request (${res.status})`)
    }
    // Accepting changes the server-side graph. Invalidate list syncs that were
    // already in flight so they cannot drop the new friend until the next poll.
    if (action === 'accept') this.revision += 1
  }

  async getRequests(
    auth: FriendAuth
  ): Promise<Array<{ code: string; name: string; uuid?: string; createdAt: number }>> {
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/requests`, {
        headers: this.headers(auth),
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) return []
      const data = (await res.json()) as { requests?: unknown }
      if (!Array.isArray(data.requests)) return []
      return data.requests.map((value) => {
        const r = value as { code?: unknown; name?: unknown; uuid?: unknown; createdAt?: unknown }
        return {
          code: String(r.code ?? '').toUpperCase(),
          name: String(r.name || r.code || ''),
          uuid: r.uuid ? String(r.uuid) : undefined,
          createdAt: Number(r.createdAt) || 0
        }
      })
    } catch {
      return []
    }
  }

  async presence(
    auth: FriendAuth,
    uuids: string[]
  ): Promise<Record<string, { server: string; lastSeen: number }> | null> {
    const unique = Array.from(
      new Set(uuids.map((uuid) => uuid.trim().toLowerCase()).filter(Boolean))
    ).slice(0, 100)
    if (!unique.length) return {}
    try {
      const res = await fetch(
        `${WORKER_BASE}/v1/presence/friends?uuids=${encodeURIComponent(unique.join(','))}`,
        { headers: this.headers(auth), signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return null
      const data = (await res.json()) as { presence?: unknown }
      if (!data.presence || typeof data.presence !== 'object' || Array.isArray(data.presence)) {
        return null
      }
      const presence: Record<string, { server: string; lastSeen: number }> = {}
      for (const [uuid, value] of Object.entries(data.presence)) {
        if (!value || typeof value !== 'object') continue
        const entry = value as { server?: unknown; lastSeen?: unknown }
        const server = String(entry.server ?? '').trim()
        const lastSeen = Number(entry.lastSeen ?? 0)
        if (server && Number.isFinite(lastSeen) && lastSeen > 0) {
          presence[uuid] = { server, lastSeen }
        }
      }
      return presence
    } catch {
      return null
    }
  }

  has(code: string): boolean {
    return this.data.friends.some((f) => f.code === code.trim().toUpperCase())
  }
}

export function createFriendStore(root: string): FriendStore {
  return new FriendStore(join(root, 'friends.json'))
}
