import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountStore, type StoredAccount, type TokenCipher } from '../src/core/accounts'

class FakeCipher implements TokenCipher {
  async encrypt(value: string): Promise<string> {
    return `enc:v1:${Buffer.from(value, 'utf8').toString('base64')}`
  }

  async decrypt(value: string): Promise<string> {
    return Buffer.from(value.slice('enc:v1:'.length), 'base64').toString('utf8')
  }
}

function microsoftAccount(): StoredAccount {
  return {
    id: 'microsoft:abc',
    type: 'microsoft',
    name: 'Tester',
    uuid: '00000000-0000-0000-0000-000000000001',
    friendCode: 'POLARIS-TEST-CODE',
    active: true,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    friendSecret: 'friend-secret',
    expiresAt: Date.now() + 3_600_000
  }
}

describe('AccountStore token encryption', () => {
  it('encrypts tokens on disk and decrypts them when loaded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      const store = new AccountStore(path, new FakeCipher())
      await store.add(microsoftAccount())

      const raw = JSON.parse(await readFile(path, 'utf8'))
      expect(raw.accounts[0].accessToken).toMatch(/^enc:v1:/)
      expect(raw.accounts[0].refreshToken).toMatch(/^enc:v1:/)
      expect(raw.accounts[0].friendSecret).toMatch(/^enc:v1:/)

      const reloaded = new AccountStore(path, new FakeCipher())
      await reloaded.load()
      expect(reloaded.stored('microsoft:abc')?.accessToken).toBe('access-token')
      expect(reloaded.stored('microsoft:abc')?.refreshToken).toBe('refresh-token')
      expect(reloaded.stored('microsoft:abc')?.friendSecret).toBe('friend-secret')
      expect(reloaded.list()[0]).not.toHaveProperty('accessToken')
      expect(reloaded.list()[0]).not.toHaveProperty('refreshToken')
      expect(reloaded.list()[0]).not.toHaveProperty('friendSecret')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('migrates legacy plaintext tokens on load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      await writeFile(
        path,
        JSON.stringify({
          activeId: 'microsoft:abc',
          accounts: [microsoftAccount()]
        }),
        'utf8'
      )

      const store = new AccountStore(path, new FakeCipher())
      await store.load()
      expect(store.stored('microsoft:abc')?.accessToken).toBe('access-token')

      const raw = JSON.parse(await readFile(path, 'utf8'))
      expect(raw.accounts[0].accessToken).toMatch(/^enc:v1:/)
      expect(raw.accounts[0].refreshToken).toMatch(/^enc:v1:/)
      expect(raw.accounts[0].friendSecret).toMatch(/^enc:v1:/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('never writes the friend secret in plaintext when encryption fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      const store = new AccountStore(path, {
        encrypt: async () => {
          throw new Error('keychain unavailable')
        },
        decrypt: async () => ''
      })
      await store.add(microsoftAccount())
      const raw = JSON.parse(await readFile(path, 'utf8'))
      expect(raw.accounts[0].friendSecret).toBeUndefined()
      expect(JSON.stringify(raw)).not.toContain('friend-secret')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps accounts usable when no cipher is available', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      const store = new AccountStore(path)
      await store.add(microsoftAccount())
      const raw = JSON.parse(await readFile(path, 'utf8'))
      expect(raw.accounts[0].accessToken).toBe('plain:access-token')
      expect(raw.accounts[0].friendSecret).toBeUndefined()

      const reloaded = new AccountStore(path)
      await reloaded.load()
      expect(reloaded.stored('microsoft:abc')?.accessToken).toBe('access-token')
      expect(reloaded.stored('microsoft:abc')?.friendSecret).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('AccountStore damaged file recovery', () => {
  async function backupFor(dir: string): Promise<string | undefined> {
    const entries = await readdir(dir)
    return entries.find((name) => name.startsWith('accounts.json.corrupt-'))
  }

  it('backs up a truncated file instead of treating it as an empty account list', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      const truncated = JSON.stringify({
        activeId: 'microsoft:abc',
        accounts: [microsoftAccount()]
      }).slice(0, 80)
      await writeFile(path, truncated, 'utf8')

      const store = new AccountStore(path, new FakeCipher())
      await store.load()

      expect(store.list()).toEqual([])
      const backup = await backupFor(dir)
      expect(backup).toBeTruthy()
      expect(await readFile(join(dir, backup as string), 'utf8')).toBe(truncated)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips a partially written entry but keeps the valid accounts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-accounts-'))
    try {
      const path = join(dir, 'accounts.json')
      const partial = { id: 'microsoft:missing-token', type: 'microsoft' }
      await writeFile(
        path,
        JSON.stringify({ activeId: 'microsoft:abc', accounts: [microsoftAccount(), partial] }),
        'utf8'
      )

      const store = new AccountStore(path, new FakeCipher())
      await store.load()

      expect(store.list().map((account) => account.id)).toEqual(['microsoft:abc'])
      expect(store.activeStored()?.id).toBe('microsoft:abc')
      expect(await backupFor(dir)).toBeTruthy()
      const saved = JSON.parse(await readFile(path, 'utf8'))
      expect(saved.accounts.map((account: { id: string }) => account.id)).toEqual(['microsoft:abc'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
