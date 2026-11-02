import { safeStorage } from 'electron'
import { ENCRYPTED_PREFIX, type TokenCipher } from '../core/accounts'

/**
 * Encrypts account tokens with the operating system credential store
 * (DPAPI on Windows, Keychain on macOS, libsecret/kwallet on Linux).
 *
 * If the OS provides no encryption backend, encrypt() throws and AccountStore
 * falls back to a clearly marked plaintext value so login still works.
 */
export class SafeStorageCipher implements TokenCipher {
  async encrypt(value: string): Promise<string> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is not available')
    }
    return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
  }

  async decrypt(value: string): Promise<string> {
    const payload = value.startsWith(ENCRYPTED_PREFIX)
      ? value.slice(ENCRYPTED_PREFIX.length)
      : value
    return safeStorage.decryptString(Buffer.from(payload, 'base64'))
  }
}
