import type { FriendAuth } from './friends'

const WORKER_BASE = 'https://polaris-api.joykelows17.workers.dev'
const GRANT_ID = /^[0-9a-f-]{36}$/i

export interface ShardGrant {
  id: string
  delta: number
  reason: string
  createdAt: number
}

export class ShardGrantService {
  private headers(auth: FriendAuth): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Polaris-Code': auth.code,
      'X-Polaris-Secret': auth.secret
    }
  }

  /** Pending shard adjustments for this account. `null` means the API failed. */
  async pending(auth: FriendAuth): Promise<ShardGrant[] | null> {
    try {
      const response = await fetch(`${WORKER_BASE}/v1/shards/pending`, {
        headers: this.headers(auth),
        signal: AbortSignal.timeout(8000)
      })
      if (!response.ok) return null
      const data = (await response.json()) as { grants?: unknown }
      if (!Array.isArray(data.grants)) return null
      const grants: ShardGrant[] = []
      for (const value of data.grants) {
        if (!value || typeof value !== 'object') continue
        const entry = value as { id?: unknown; delta?: unknown; reason?: unknown; createdAt?: unknown }
        const id = String(entry.id || '')
        const delta = Number(entry.delta)
        if (!GRANT_ID.test(id) || !Number.isFinite(delta) || delta === 0) continue
        if (Math.abs(delta) > 1_000_000) continue
        grants.push({
          id,
          delta: Math.round(delta),
          reason: String(entry.reason || '').slice(0, 120),
          createdAt: Number(entry.createdAt) || 0
        })
      }
      return grants
    } catch {
      return null
    }
  }

  async ack(auth: FriendAuth, ids: string[]): Promise<boolean> {
    const valid = [...new Set(ids.filter((id) => GRANT_ID.test(id)))].slice(0, 100)
    if (!valid.length) return true
    try {
      const response = await fetch(`${WORKER_BASE}/v1/shards/ack`, {
        method: 'POST',
        headers: this.headers(auth),
        body: JSON.stringify({ ids: valid }),
        signal: AbortSignal.timeout(8000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}
