import { readJson, writeJson } from './fsutil'
import { join } from 'node:path'
import type { Friend } from '../shared/types'

const WORKER_BASE = 'https://polaris-api.joykelows17.workers.dev'

interface FriendFile {
  friends: Friend[]
}

export class FriendStore {
  private data: FriendFile = { friends: [] }

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

  async syncFromServer(myCode: string): Promise<void> {
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/list?code=${encodeURIComponent(myCode)}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.friends)) {
        this.data.friends = data.friends.map((f: any) => ({
          code: String(f.code).toUpperCase(),
          name: String(f.name || f.code),
          addedAt: f.addedAt ?? Date.now()
        }))
        await this.save()
      }
    } catch {
      // offline: keep local cache
    }
  }

  async registerCode(code: string, name: string): Promise<void> {
    try {
      await fetch(`${WORKER_BASE}/v1/friends/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
        signal: AbortSignal.timeout(8000)
      })
    } catch {
      // best-effort
    }
  }

  async add(myCode: string, code: string, name: string): Promise<Friend> {
    const cleanCode = code.trim().toUpperCase()
    const cleanName = name.trim() || cleanCode
    const existing = this.data.friends.find((f) => f.code === cleanCode)
    if (!existing) {
      this.data.friends.push({ code: cleanCode, name: cleanName, addedAt: Date.now() })
    } else {
      existing.name = cleanName
    }
    await this.save()
    // sync to backend (best-effort)
    try {
      await fetch(`${WORKER_BASE}/v1/friends/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myCode, friendCode: cleanCode }),
        signal: AbortSignal.timeout(8000)
      })
    } catch {
      // offline: local only
    }
    return this.data.friends.find((f) => f.code === cleanCode)!
  }

  async remove(myCode: string, code: string): Promise<void> {
    const cleanCode = code.trim().toUpperCase()
    this.data.friends = this.data.friends.filter((f) => f.code !== cleanCode)
    await this.save()
    try {
      await fetch(`${WORKER_BASE}/v1/friends/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myCode, friendCode: cleanCode }),
        signal: AbortSignal.timeout(8000)
      })
    } catch {
      // offline: local only
    }
  }

  async removeMutual(myCode: string, friendCode: string): Promise<void> {
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/remove-mutual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myCode, friendCode }),
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) {
        // Server-side error (format validation, self-removal, KV not configured)
        // Still try local removal to keep UI consistent
        this.data.friends = this.data.friends.filter((f) => f.code !== friendCode)
        await this.save()
        return
      }
      // Success: also clean up local list
      this.data.friends = this.data.friends.filter((f) => f.code !== friendCode)
      await this.save()
    } catch {
      // offline: local only - remove from local list only
      this.data.friends = this.data.friends.filter((f) => f.code !== friendCode)
      await this.save()
    }
  }

  async sendRequest(myCode: string, friendCode: string): Promise<void> {
    const res = await fetch(`${WORKER_BASE}/v1/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myCode, friendCode }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `Could not send friend request (${res.status})`)
    }
  }

  async respondRequest(myCode: string, friendCode: string, action: 'accept' | 'decline'): Promise<void> {
    const res = await fetch(`${WORKER_BASE}/v1/friends/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myCode, friendCode, action }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `Could not respond to friend request (${res.status})`)
    }
  }

  async getRequests(myCode: string): Promise<Array<{ code: string; name: string; createdAt: number }>> {
    try {
      const res = await fetch(`${WORKER_BASE}/v1/friends/requests?code=${encodeURIComponent(myCode)}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return []
      const data = await res.json()
      return (data.requests || []).map((r: any) => ({
        code: String(r.code).toUpperCase(),
        name: String(r.name || r.code),
        createdAt: r.createdAt ?? Date.now()
      }))
    } catch {
      return []
    }
  }

  has(code: string): boolean {
    return this.data.friends.some((f) => f.code === code.trim().toUpperCase())
  }
}

export function createFriendStore(root: string): FriendStore {
  return new FriendStore(join(root, 'friends.json'))
}
