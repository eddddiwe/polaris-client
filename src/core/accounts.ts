import { createHash } from 'node:crypto'
import type { Account } from '../shared/types'
import { readJson, writeJson } from './fsutil'

export interface StoredAccount extends Account {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  clientId?: string
  xuid?: string
}

interface AccountFile {
  activeId: string | null
  accounts: StoredAccount[]
}

export class AccountStore {
  private data: AccountFile = { activeId: null, accounts: [] }

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    const loaded = await readJson<AccountFile | null>(this.path, null)
    if (loaded && Array.isArray(loaded.accounts)) this.data = loaded
    const usedCodes = this.data.accounts.map((a) => a.friendCode).filter((c) => c)
    for (const account of this.data.accounts) {
      account.active = account.id === this.data.activeId
      // Only generate friend code for Microsoft accounts, not offline accounts
      if (!account.friendCode && account.type === 'microsoft') {
        let code = generateFriendCode()
        while (usedCodes.includes(code)) {
          code = generateFriendCode()
        }
        account.friendCode = code
        usedCodes.push(code)
      } else if (!account.friendCode && account.type === 'offline') {
        // Offline accounts intentionally have no friend code
        account.friendCode = undefined
      }
    }
    await this.save()
  }

  async save(): Promise<void> {
    await writeJson(this.path, this.data)
  }

  list(): Account[] {
    return this.data.accounts.map(({ id, type, name, uuid, skinUrl, friendCode }) => ({
      id,
      type,
      name,
      uuid,
      skinUrl,
      friendCode,
      active: id === this.data.activeId
    }))
  }

  stored(id: string): StoredAccount | undefined {
    return this.data.accounts.find((account) => account.id === id)
  }

  activeStored(): StoredAccount | undefined {
    return this.data.accounts.find((account) => account.id === this.data.activeId)
  }

  async add(account: StoredAccount, makeActive = true): Promise<void> {
    this.data.accounts = this.data.accounts.filter((item) => item.id !== account.id)
    this.data.accounts.push(account)
    if (makeActive || !this.data.activeId) this.data.activeId = account.id
    await this.save()
  }

  async remove(id: string): Promise<void> {
    this.data.accounts = this.data.accounts.filter((account) => account.id !== id)
    if (this.data.activeId === id) this.data.activeId = this.data.accounts[0]?.id ?? null
    await this.save()
  }

  async setActive(id: string): Promise<void> {
    if (!this.data.accounts.some((account) => account.id === id)) return
    this.data.activeId = id
    await this.save()
  }

  async update(id: string, patch: Partial<StoredAccount>): Promise<StoredAccount | undefined> {
    const account = this.data.accounts.find((item) => item.id === id)
    if (!account) return undefined
    Object.assign(account, patch)
    await this.save()
    return account
  }
}

export function generateFriendCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const group = (): string => {
    let out = ''
    for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
    return out
  }
  return `POLARIS-${group()}-${group()}`
}

export function offlineUuid(name: string): string {
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x30
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function compactUuid(uuid: string): string {
  return uuid.replace(/-/g, '')
}

export function offlineAccount(name: string): StoredAccount {
  const uuid = offlineUuid(name)
  return {
    id: `offline:${uuid}`,
    type: 'offline',
    name,
    uuid,
    accessToken: '0',
    active: true
  }
}
