import type { DeviceCodeInfo } from '../shared/types'
import { AccountStore, generateFriendCode, type StoredAccount } from './accounts'
import type { Logger } from './logger'
import { delay } from './http'

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const SCOPE = 'XboxLive.signin offline_access'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  message: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  error?: string
  error_description?: string
}

interface XblResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string; xid?: string }[] }
}

interface MinecraftProfile {
  id: string
  name: string
  skins?: { url: string }[]
}

export interface AuthEvents {
  onAccount: (account: StoredAccount) => void
  onError: (message: string) => void
  onDeviceCode?: (info: DeviceCodeInfo, clientId: string) => void
}

export class AuthService {
  private deviceAbort = false

  constructor(
    private readonly store: AccountStore,
    private readonly logger: Logger
  ) {}

  async beginDeviceLogin(clientId: string, events: AuthEvents): Promise<DeviceCodeInfo> {
    if (!clientId.trim()) {
      throw new Error(
        'Microsoft sign-in needs your own Azure application (public client) ID. Open Settings → Account to set it up. Offline mode works without it.'
      )
    }
    this.deviceAbort = false

    const body = new URLSearchParams({ client_id: clientId, scope: SCOPE })
    const response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!response.ok) throw new Error(`Microsoft device code request failed (${response.status})`)
    const device = (await response.json()) as DeviceCodeResponse
    const info: DeviceCodeInfo = {
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      expiresIn: device.expires_in,
      message: device.message
    }
    events.onDeviceCode?.(info, clientId)
    void this.pollForToken(clientId, device, events)
    return info
  }

  private async pollForToken(clientId: string, device: DeviceCodeResponse, events: AuthEvents): Promise<void> {
    const deadline = Date.now() + device.expires_in * 1000
    let intervalMs = Math.max(3, device.interval) * 1000
    while (Date.now() < deadline && !this.deviceAbort) {
      await delay(intervalMs)
      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code
      })
      try {
        const response = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        })
        const token = (await response.json()) as TokenResponse
        if (token.error === 'authorization_pending') continue
        if (token.error === 'slow_down') {
          intervalMs += 2000
          continue
        }
        if (token.error === 'expired_token') throw new Error('The sign-in code expired. Try again.')
        if (token.error === 'access_denied') throw new Error('Microsoft sign-in was cancelled.')
        if (!response.ok || !token.access_token) {
          throw new Error(token.error_description ?? token.error ?? 'Microsoft token exchange failed')
        }
        const account = await this.completeLogin(clientId, token.access_token, token.refresh_token, token.expires_in)
        await this.store.add(account, true)
        events.onAccount(account)
        return
      } catch (error) {
        this.logger.warn('Device login poll failed', String(error))
        events.onError(error instanceof Error ? error.message : String(error))
        return
      }
    }
    if (!this.deviceAbort) events.onError('The sign-in code expired. Try again.')
  }

  private async completeLogin(
    clientId: string,
    msAccessToken: string,
    refreshToken: string | undefined,
    expiresIn: number
  ): Promise<StoredAccount> {
    const xbl = await postJson<XblResponse>('https://user.auth.xboxlive.com/user/authenticate', {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
    const uhs = xbl.DisplayClaims.xui[0]?.uhs
    const xuid = xbl.DisplayClaims.xui[0]?.xid

    const xsts = await postJson<XblResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })

    let mc: { access_token: string; expires_in: number }
    try {
      mc = await postJson<{ access_token: string; expires_in: number }>(
        'https://api.minecraftservices.com/authentication/login_with_xbox',
        { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` },
        'Minecraft authentication'
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('(403)')) {
        throw new Error(
          'Minecraft rejected this application (403 Invalid app registration). Only Azure apps authorized for Minecraft Services can sign in. Apply at https://aka.ms/AppRegInfo — Polaris cannot reuse another launcher’s client ID or tokens.'
        )
      }
      throw error
    }

    const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${mc.access_token}` }
    })
    if (profileResponse.status === 404) {
      throw new Error('This Microsoft account does not own Minecraft: Java Edition.')
    }
    if (!profileResponse.ok) throw new Error(`Minecraft profile request failed (${profileResponse.status})`)
    const profile = (await profileResponse.json()) as MinecraftProfile

    return {
      id: `ms:${profile.id}`,
      type: 'microsoft',
      name: profile.name,
      uuid: formatUuid(profile.id),
      skinUrl: profile.skins?.[0]?.url,
      friendCode: generateFriendCode(),
      accessToken: mc.access_token,
      refreshToken,
      expiresAt: Date.now() + (mc.expires_in ?? 86_400) * 1000,
      clientId,
      xuid,
      active: true
    }
  }

  async refreshIfNeeded(account: StoredAccount): Promise<StoredAccount> {
    if (account.type !== 'microsoft') return account
    if (account.expiresAt && account.expiresAt - 60_000 > Date.now()) return account
    if (!account.refreshToken || !account.clientId) throw new Error('Session expired. Sign in with Microsoft again.')
    const body = new URLSearchParams({
      client_id: account.clientId,
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      scope: SCOPE
    })
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!response.ok) throw new Error('Microsoft session refresh failed. Sign in again.')
    const token = (await response.json()) as TokenResponse
    const refreshed = await this.completeLogin(
      account.clientId,
      token.access_token,
      token.refresh_token ?? account.refreshToken,
      token.expires_in
    )
    const updated = await this.store.update(account.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      name: refreshed.name,
      uuid: refreshed.uuid,
      skinUrl: refreshed.skinUrl,
      friendCode: refreshed.friendCode ?? generateFriendCode(),
      xuid: refreshed.xuid
    })
    return updated ?? refreshed
  }

  cancel(): void {
    this.deviceAbort = true
  }
}

async function postJson<T>(url: string, body: unknown, label = 'Xbox authentication'): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = (await response.json()) as {
        XErr?: number
        Message?: string
        error?: string
        errorMessage?: string
      }
      detail = parsed.Message ?? parsed.errorMessage ?? parsed.error ?? (parsed.XErr ? `Xbox error ${parsed.XErr}` : '')
      if (parsed.XErr === 2148916233) detail = 'This Microsoft account has no Xbox profile. Create one at xbox.com first.'
      if (parsed.XErr === 2148916235) detail = 'Xbox Live is not available in this account region.'
      if (parsed.XErr === 2148916238) detail = 'A child account must be added to a Microsoft family by an adult.'
    } catch {
      // ignore
    }
    throw new Error(`${label} failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await response.json()) as T
}

function formatUuid(id: string): string {
  const hex = id.replace(/-/g, '')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
