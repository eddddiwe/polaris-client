import { describe, expect, it } from 'vitest'
import { settleForAccount } from '../src/renderer/src/pages/friendsMutation'

describe('settleForAccount', () => {
  it('applies a result while the same account is still active', async () => {
    const result = { friends: [], synced: true }
    await expect(
      settleForAccount(Promise.resolve(result), 'POLARIS-AAAA-AAAA', () => 'POLARIS-AAAA-AAAA')
    ).resolves.toBe(result)
  })

  it('drops a remove result that resolves after an account switch', async () => {
    let current: string | null = 'POLARIS-AAAA-AAAA'
    let resolve!: (value: { friends: Array<{ code: string }>; synced: boolean }) => void
    const pending = new Promise<{ friends: Array<{ code: string }>; synced: boolean }>((done) => {
      resolve = done
    })
    const scoped = settleForAccount(pending, current, () => current)

    // The user switches accounts while the remove IPC is still in flight.
    current = 'POLARIS-BBBB-BBBB'
    resolve({ friends: [{ code: 'POLARIS-CCCC-CCCC' }], synced: false })

    await expect(scoped).resolves.toBeNull()
  })

  it('drops a result after the user signs out', async () => {
    let current: string | null = 'POLARIS-AAAA-AAAA'
    const scoped = settleForAccount(Promise.resolve({ synced: true }), current, () => current)
    current = null
    await expect(scoped).resolves.toBeNull()
  })

  it('propagates API failures so the caller can show an error toast', async () => {
    await expect(
      settleForAccount(Promise.reject(new Error('offline')), 'POLARIS-AAAA-AAAA', () => 'POLARIS-AAAA-AAAA')
    ).rejects.toThrow('offline')
  })
})
