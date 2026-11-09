import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import type { Account } from '../shared/types'
import { writeJson } from './fsutil'

export const ENCRYPTED_PREFIX = 'enc:v1:'
const PLAINTEXT_PREFIX = 'plain:'

/** Encrypts account tokens at rest. Implemented with Electron safeStorage in main. */
export interface TokenCipher {
  encrypt(value: string): Promise<string>
  decrypt(value: string): Promise<string>
}

export interface StoredAccount extends Account {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  clientId?: string
  xuid?: string
  /**
   * Per-account API credential. It never crosses the IPC boundary and is
   * encrypted at rest with the same safeStorage cipher as the tokens.
   */
  friendSecret?: string
}

interface AccountFile {
  activeId: string | null
  accounts: StoredAccount[]
}

export class AccountStore {
  private data: AccountFile = { activeId: null, accounts: [] }
  /** Set when the on-disk file cannot be read or safely backed up. */
  private blockedWrite?: string
  /** Encrypted values kept if the OS keychain cannot decrypt them yet. */
  private readonly originalTokens = new Map<
    string,
    { access?: string; refresh?: string; friendSecret?: string }
  >()

  constructor(
    private readonly path: string,
    private readonly cipher?: TokenCipher
  ) {}

  async load(): Promise<void> {
    const result = await this.readAccountsFile()
    this.blockedWrite = undefined
    if (result.readFailed) {
      // A missing file is a fresh install, but an unreadable one may still
      // hold every account and token. Never replace it with an empty store.
      this.blockedWrite = 'The accounts file could not be read, so Polaris will not overwrite it.'
      return
    }
    this.data = result.file ?? { activeId: null, accounts: [] }
    if (result.damaged !== undefined) {
      // Keep a recovery copy before save() rewrites the file without the
      // damaged parts (for example a truncated write or a partial entry).
      try {
        await writeFile(`${this.path}.corrupt-${Date.now()}`, result.damaged, { mode: 0o600 })
      } catch {
        this.blockedWrite = 'The accounts file is damaged and could not be backed up, so Polaris will not overwrite it.'
        return
      }
    }
    // Recover a missing or dangling active id so existing accounts stay launchable.
    if (!this.data.accounts.some((account) => account.id === this.data.activeId)) {
      this.data.activeId = this.data.accounts[0]?.id ?? null
    }
    const usedCodes = this.data.accounts.map((a) => a.friendCode).filter((c) => c)
    for (const account of this.data.accounts) {
      account.active = account.id === this.data.activeId
      if (account.type === 'microsoft') {
        // Track each encrypted field independently. A partially migrated
        // account must not lose its friend secret just because another token
        // was stored in plaintext.
        const original: { access?: string; refresh?: string; friendSecret?: string } = {}
        if (account.accessToken.startsWith(ENCRYPTED_PREFIX)) original.access = account.accessToken
        if (account.refreshToken?.startsWith(ENCRYPTED_PREFIX)) original.refresh = account.refreshToken
        if (account.friendSecret?.startsWith(ENCRYPTED_PREFIX)) original.friendSecret = account.friendSecret
        if (Object.keys(original).length > 0) this.originalTokens.set(account.id, original)

        account.accessToken = await this.decode(account.accessToken)
        if (account.refreshToken) account.refreshToken = await this.decode(account.refreshToken)
        const hadStoredSecret = Boolean(account.friendSecret)
        if (hadStoredSecret) account.friendSecret = await this.decode(account.friendSecret as string)
        // A legacy account has no secret yet. If a stored secret failed to
        // decrypt, keep the encrypted original instead of silently rotating
        // the account's API credential.
        if (!account.friendSecret && !hadStoredSecret) account.friendSecret = generateFriendSecret()
      }
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

  /** Reads the file directly so an unreadable file is not mistaken for an empty one. */
  private async readAccountsFile(): Promise<{ file?: AccountFile; damaged?: Buffer; readFailed?: boolean }> {
    let raw: Buffer
    try {
      raw = await readFile(this.path)
    } catch (error) {
      return { readFailed: (error as NodeJS.ErrnoException).code !== 'ENOENT' }
    }
    const text = raw.toString('utf8')
    // A present but empty file is more likely truncation than a fresh install;
    // keep a recovery copy instead of silently overwriting it.
    if (!text.trim()) return { damaged: raw }
    let parsed: AccountFile | null = null
    try {
      // Windows editors may save UTF-8 with a BOM, which JSON.parse rejects.
      parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as AccountFile
    } catch {
      return { damaged: raw }
    }
    if (!parsed || !Array.isArray(parsed.accounts)) return { damaged: raw }
    const accounts = parsed.accounts.filter(isStoredAccount)
    return {
      file: {
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        accounts
      },
      damaged: accounts.length === parsed.accounts.length ? undefined : raw
    }
  }

  private saving: Promise<void> = Promise.resolve()

  async save(): Promise<void> {
    if (this.blockedWrite) throw new Error(this.blockedWrite)
    const run = this.saving.then(() => this.saveNow())
    this.saving = run.catch(() => undefined)
    await run
  }

  private async saveNow(): Promise<void> {
    const accounts: StoredAccount[] = []
    for (const account of this.data.accounts) {
      const copy: StoredAccount = { ...account }
      if (account.type === 'microsoft') {
        const original = this.originalTokens.get(account.id)
        copy.accessToken =
          account.accessToken || !original?.access
            ? await this.encode(account.accessToken)
            : original.access
        if (account.refreshToken || original?.refresh) {
          copy.refreshToken =
            account.refreshToken || !original?.refresh
              ? await this.encode(account.refreshToken ?? '')
              : original.refresh
        }
        if (account.friendSecret) {
          const encodedSecret = await this.encodeSecret(account.friendSecret)
          if (encodedSecret) {
            copy.friendSecret = encodedSecret
          } else if (original?.friendSecret) {
            // Encryption is temporarily unavailable. Keep the previous
            // ciphertext rather than writing a plaintext bearer credential.
            copy.friendSecret = original.friendSecret
            account.friendSecret = undefined
          } else {
            // Fail closed: no API credential is better than a plaintext one.
            delete copy.friendSecret
            account.friendSecret = undefined
          }
        } else if (original?.friendSecret) {
          copy.friendSecret = original.friendSecret
        }
      }
      accounts.push(copy)
    }
    await writeJson(this.path, { activeId: this.data.activeId, accounts } satisfies AccountFile)
  }

  private async encode(value: string): Promise<string> {
    if (!value) return value
    if (value.startsWith(ENCRYPTED_PREFIX) || value.startsWith(PLAINTEXT_PREFIX)) return value
    if (!this.cipher) return `${PLAINTEXT_PREFIX}${value}`
    try {
      return await this.cipher.encrypt(value)
    } catch {
      // OS keychain unavailable: keep the account usable, never crash login.
      return `${PLAINTEXT_PREFIX}${value}`
    }
  }

  /**
   * Friend secrets are bearer credentials for the social API. Unlike legacy
   * tokens, they must never be written as plaintext: if the OS keychain is
   * unavailable, friends/presence stay disabled for this session.
   */
  private async encodeSecret(value: string): Promise<string | undefined> {
    if (!value) return undefined
    if (value.startsWith(ENCRYPTED_PREFIX)) return value
    if (!this.cipher) return undefined
    try {
      return await this.cipher.encrypt(value)
    } catch {
      return undefined
    }
  }

  private async decode(value: string): Promise<string> {
    if (!value) return value
    if (value.startsWith(PLAINTEXT_PREFIX)) return value.slice(PLAINTEXT_PREFIX.length)
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value
    if (!this.cipher) return ''
    try {
      return await this.cipher.decrypt(value)
    } catch {
      // Keychain changed or the file was copied to another machine.
      return ''
    }
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

/** Rejects partially written or hand-edited entries before they reach load(). */
function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false
  const account = value as StoredAccount
  return (
    typeof account.id === 'string' &&
    account.id.length > 0 &&
    (account.type === 'microsoft' || account.type === 'offline') &&
    typeof account.name === 'string' &&
    typeof account.uuid === 'string' &&
    typeof account.accessToken === 'string' &&
    [account.refreshToken, account.friendCode, account.friendSecret, account.clientId, account.xuid, account.skinUrl]
      .every((field) => field === undefined || typeof field === 'string') &&
    (account.expiresAt === undefined || typeof account.expiresAt === 'number')
  )
}

export function generateFriendCode(): string {
  // 32 symbols is a power of two, so masking a random byte is unbiased.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const group = (): string => {
    const bytes = randomBytes(4)
    let out = ''
    for (let i = 0; i < 4; i++) out += alphabet[bytes[i] & 31]
    return out
  }
  return `POLARIS-${group()}-${group()}`
}

/** 256-bit per-account credential for authenticated friend/presence calls. */
export function generateFriendSecret(): string {
  return randomBytes(32).toString('base64url')
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
