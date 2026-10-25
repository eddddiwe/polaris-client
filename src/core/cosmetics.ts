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
    const current = this.settings.get()
    const owned = ownedCosmetics(current.ownedCosmetics)
    if (owned.includes(id)) throw new Error('You already own that cosmetic.')
    if (current.shards < item.price) {
      throw new Error(`Not enough shards — ${item.price - current.shards} more needed.`)
    }
    return await this.settings.update({
      shards: current.shards - item.price,
      ownedCosmetics: [...owned, id]
    })
  }

  async equip(id: string): Promise<Settings> {
    const item = cosmeticById(id)
    if (!item) throw new Error('Unknown cosmetic.')
    const owned = ownedCosmetics(this.settings.get().ownedCosmetics)
    if (!owned.includes(id)) throw new Error('Unlock that cosmetic before equipping it.')
    return await this.settings.update(
      item.kind === 'badge' ? { equippedBadge: id } : { equippedCape: id }
    )
  }

  /** Convert unclaimed playtime into shards. Returns the amount granted. */
  async claim(totalPlaytimeMs: number): Promise<number> {
    const current = this.settings.get()
    const earned = shardsForPlaytime(totalPlaytimeMs) - shardsForPlaytime(current.shardsClaimedMs)
    if (earned <= 0) return 0
    await this.settings.update({
      shards: Math.max(0, Math.floor(current.shards)) + earned,
      shardsClaimedMs: Math.max(current.shardsClaimedMs, totalPlaytimeMs)
    })
    return earned
  }
}
