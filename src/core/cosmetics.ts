import type { CosmeticSnapshot, Settings } from '../shared/types'
import {
  COSMETICS,
  DEFAULT_BADGE,
  DEFAULT_CAPE,
  cosmeticById,
  ownedCosmetics,
  shardsForPlaytime
} from '../shared/cosmetics'
import type { SettingsStore } from './settings'

/**
 * Local cosmetic economy. Shards are earned from tracked playtime; nothing is
 * purchased with real money and no account data leaves the machine.
 */
export class CosmeticsService {
  constructor(private readonly settings: SettingsStore) {}

  snapshot(totalPlaytimeMs: number): CosmeticSnapshot {
    const current = this.settings.get()
    const owned = ownedCosmetics(current.ownedCosmetics)
    const equippedBadge = owned.includes(current.equippedBadge) ? current.equippedBadge : DEFAULT_BADGE
    const equippedCape = owned.includes(current.equippedCape) ? current.equippedCape : DEFAULT_CAPE
    return {
      items: COSMETICS,
      owned,
      equippedBadge,
      equippedCape,
      shards: Math.max(0, Math.floor(current.shards)),
      claimable: Math.max(0, shardsForPlaytime(totalPlaytimeMs) - shardsForPlaytime(current.shardsClaimedMs)),
      totalPlaytimeMs: Math.max(0, totalPlaytimeMs)
    }
  }

  async buy(id: string): Promise<Settings> {
    const item = cosmeticById(id)
    if (!item) throw new Error('Unknown cosmetic.')
    return await this.settings.update((current) => {
      const owned = ownedCosmetics(current.ownedCosmetics)
      if (owned.includes(id)) throw new Error('You already own that cosmetic.')
      if (current.shards < item.price) {
        throw new Error(`Not enough shards — ${item.price - current.shards} more needed.`)
      }
      return {
        shards: current.shards - item.price,
        ownedCosmetics: [...owned, id]
      }
    })
  }

  async equip(id: string): Promise<Settings> {
    const item = cosmeticById(id)
    if (!item) throw new Error('Unknown cosmetic.')
    return await this.settings.update((current) => {
      const owned = ownedCosmetics(current.ownedCosmetics)
      if (!owned.includes(id)) throw new Error('Unlock that cosmetic before equipping it.')
      return item.kind === 'badge' ? { equippedBadge: id } : { equippedCape: id }
    })
  }

  /** Apply one queued shard adjustment exactly once. Returns the actual delta. */
  async applyGrant(id: string, delta: number): Promise<number> {
    let applied = 0
    await this.settings.update((current) => {
      if (!id || current.appliedShardGrants.includes(id)) return {}
      const next = Math.min(1_000_000_000, Math.max(0, Math.round(current.shards + delta)))
      applied = next - current.shards
      return {
        shards: next,
        // Keep every id. A grant that was applied but not acknowledged yet can
        // still be returned by a later sync; trimming old ids would apply it twice.
        appliedShardGrants: [...current.appliedShardGrants, id]
      }
    })
    return applied
  }

  /** Convert unclaimed playtime into shards. Returns the amount granted. */
  async claim(totalPlaytimeMs: number): Promise<number> {
    let earned = 0
    await this.settings.update((current) => {
      earned = shardsForPlaytime(totalPlaytimeMs) - shardsForPlaytime(current.shardsClaimedMs)
      if (earned <= 0) return {}
      return {
        shards: Math.max(0, Math.floor(current.shards)) + earned,
        shardsClaimedMs: Math.max(current.shardsClaimedMs, totalPlaytimeMs)
      }
    })
    return earned
  }
}
