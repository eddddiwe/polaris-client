import { EventEmitter } from 'node:events'
import type { ChatMessage, ChatTyping } from '../shared/types'
import type { FriendAuth } from './friends'

const WORKER_BASE = 'https://polaris-api.joykelows17.workers.dev'
const WS_BASE = WORKER_BASE.replace(/^https:/, 'wss:')
const MESSAGE_ID = /^[0-9a-f-]{36}$/i
const FRIEND_CODE = /^POLARIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
const RECONNECT_BASE_MS = 3000
const RECONNECT_MAX_MS = 60_000
const HEARTBEAT_MS = 20_000
const HANDSHAKE_TIMEOUT_MS = 12_000
const STABLE_CONNECTION_MS = 10_000
const STALE_SOCKET_MS = 60_000

/** The subset of FriendStore needed to bind an account before minting a token. */
export interface FriendRegistrar {
  register(auth: FriendAuth, name: string, uuid?: string): Promise<boolean>
}

export interface ChatAccount extends FriendAuth {
  name: string
  uuid: string
}

function validMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null
  const item = value as {
    id?: unknown
    from?: unknown
    to?: unknown
    fromName?: unknown
    text?: unknown
    createdAt?: unknown
  }
  const id = String(item.id || '')
  const from = String(item.from || '').toUpperCase()
  const to = String(item.to || '').toUpperCase()
  const text = String(item.text || '')
  if (!MESSAGE_ID.test(id) || !FRIEND_CODE.test(from) || !FRIEND_CODE.test(to)) return null
  if (!text || text.length > 800) return null
  return {
    id,
    from,
    to,
    fromName: String(item.fromName || from).slice(0, 32),
    text: text.slice(0, 800),
    createdAt: Number(item.createdAt) || 0
  }
}

export class ChatService extends EventEmitter {
  private socket?: WebSocket
  private auth?: FriendAuth
  private stopped = true
  private reconnectTimer?: NodeJS.Timeout
  private heartbeatTimer?: NodeJS.Timeout
  /**
   * Bumped on every start/stop. A connection attempt that finishes after a
   * newer start() must not touch the current socket or deliver old-account
   * messages into the renderer.
   */
  private generation = 0
  private attempts = 0

  private headers(auth: FriendAuth): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Polaris-Code': auth.code,
      'X-Polaris-Secret': auth.secret
    }
  }

  /**
   * Issues a short-lived, chat-scoped token for the in-game mod. The game
   * process never receives the account secret.
   */
  async session(auth: FriendAuth): Promise<{ token: string; code: string; expiresAt: number } | null> {
    try {
      const response = await fetch(`${WORKER_BASE}/v1/chat/token`, {
        method: 'POST',
        headers: this.headers(auth),
        signal: AbortSignal.timeout(2500)
      })
      if (!response.ok) return null
      const data = (await response.json()) as { token?: unknown; code?: unknown; expiresAt?: unknown }
      const token = String(data.token || '')
      const code = String(data.code || '').toUpperCase()
      if (!/^pc_[0-9a-f-]{36}$/i.test(token) || !FRIEND_CODE.test(code)) return null
      return { token, code, expiresAt: Number(data.expiresAt) || 0 }
    } catch {
      return null
    }
  }

  start(auth: FriendAuth): void {
    this.stop()
    this.auth = auth
    this.stopped = false
    this.attempts = 0
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    this.generation += 1
    this.auth = undefined
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.reconnectTimer = undefined
    this.heartbeatTimer = undefined
    const socket = this.socket
    this.socket = undefined
    if (socket) {
      try {
        socket.close(1000, 'Chat closed')
      } catch {
        // already closed
      }
    }
    this.emit('state', 'disconnected')
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const step = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(this.attempts, 5))
    this.attempts += 1
    // Jitter avoids a reconnect stampede after a Worker restart.
    const delay = Math.round(step * (0.8 + Math.random() * 0.4))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect()
    }, delay)
  }

  private async connect(): Promise<void> {
    const auth = this.auth
    if (this.stopped || !auth || this.socket) return
    const generation = this.generation
    const current = (): boolean => !this.stopped && generation === this.generation
    this.emit('state', 'connecting')
    try {
      const response = await fetch(`${WORKER_BASE}/v1/chat/ticket`, {
        method: 'POST',
        headers: this.headers(auth),
        signal: AbortSignal.timeout(8000)
      })
      if (!current()) return
      if (response.status === 401 || response.status === 403) {
        // The stored friend secret was rejected. Retrying cannot fix that.
        this.stopped = true
        this.auth = undefined
        this.emit('state', 'disconnected')
        return
      }
      if (!response.ok) throw new Error(`Chat ticket failed (${response.status})`)
      const data = (await response.json()) as { ticket?: string }
      const ticket = String(data.ticket || '')
      if (!ticket) throw new Error('Chat ticket missing')
      if (!current()) return

      const socket = new WebSocket(`${WS_BASE}/v1/chat/ws?ticket=${encodeURIComponent(ticket)}`)
      this.socket = socket
      const isCurrent = (): boolean => current() && this.socket === socket
      let openedAt = 0
      let lastInbound = Date.now()
      // A handshake stuck in CONNECTING would block every later reconnect
      // because connect() refuses to run while a socket exists.
      const handshakeTimer = setTimeout(() => {
        if (!isCurrent() || socket.readyState !== 0) return
        try {
          socket.close()
        } catch {
          // already closed
        }
      }, HANDSHAKE_TIMEOUT_MS)
      handshakeTimer.unref?.()

      socket.addEventListener('open', () => {
        clearTimeout(handshakeTimer)
        if (!isCurrent()) {
          try {
            socket.close()
          } catch {
            // already closed
          }
          return
        }
        openedAt = Date.now()
        this.emit('state', 'connected')
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = setInterval(() => {
          if (socket.readyState !== 1) return
          // Half-open connections never fire close; a missing pong means the
          // socket is dead even though the UI still says "Live".
          if (Date.now() - lastInbound > STALE_SOCKET_MS) {
            try {
              socket.close()
            } catch {
              // already closed
            }
            return
          }
          socket.send(JSON.stringify({ type: 'ping' }))
        }, HEARTBEAT_MS)
      })
      socket.addEventListener('message', (event) => {
        if (!isCurrent()) return
        lastInbound = Date.now()
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch {
          return
        }
        // JSON.parse('null') yields null; reading .type off it would throw out
        // of the listener (an uncaught exception in the main process). Frames
        // are untrusted input, so reject every non-object shape here.
        if (!parsed || typeof parsed !== 'object') return
        const payload = parsed as {
          type?: unknown
          message?: unknown
          from?: unknown
          fromName?: unknown
        }
        if (payload.type === 'message') {
          const message = validMessage(payload.message)
          if (message) this.emit('message', message)
        } else if (payload.type === 'typing') {
          const from = String(payload.from || '').toUpperCase()
          if (!FRIEND_CODE.test(from)) return
          const typing: ChatTyping = {
            from,
            fromName: String(payload.fromName || from).slice(0, 32)
          }
          this.emit('typing', typing)
        }
      })
      socket.addEventListener('close', () => {
        clearTimeout(handshakeTimer)
        // A socket replaced by a newer start() must not clear the live timers
        // or schedule a second connection.
        if (!isCurrent()) return
        this.socket = undefined
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = undefined
        // Only treat a connection that stayed up as a reset. Otherwise an
        // accept-then-close server would cause a hot reconnect loop.
        if (openedAt && Date.now() - openedAt >= STABLE_CONNECTION_MS) this.attempts = 0
        this.emit('state', 'disconnected')
        this.scheduleReconnect()
      })
      socket.addEventListener('error', () => {
        try {
          socket.close()
        } catch {
          // already closed
        }
      })
    } catch {
      if (!current()) return
      this.emit('state', 'disconnected')
      this.scheduleReconnect()
    }
  }

  async history(friendCode: string): Promise<ChatMessage[]> {
    const auth = this.auth
    if (!auth) throw new Error('Chat is not connected.')
    const response = await fetch(
      `${WORKER_BASE}/v1/chat/history?friendCode=${encodeURIComponent(friendCode)}`,
      { headers: this.headers(auth), signal: AbortSignal.timeout(8000) }
    )
    if (!response.ok) throw new Error(`Could not load messages (${response.status})`)
    const data = (await response.json()) as { messages?: unknown }
    if (!Array.isArray(data.messages)) throw new Error('Chat history response was invalid.')
    return data.messages.map(validMessage).filter((item): item is ChatMessage => Boolean(item))
  }

  async send(friendCode: string, text: string): Promise<ChatMessage> {
    if (!this.auth) throw new Error('Sign in to chat.')
    const clean = text.trim().slice(0, 800)
    if (!clean) throw new Error('Message is empty.')
    const response = await fetch(`${WORKER_BASE}/v1/chat/send`, {
      method: 'POST',
      headers: this.headers(this.auth),
      body: JSON.stringify({ friendCode, text: clean }),
      signal: AbortSignal.timeout(8000)
    })
    const data = (await response.json().catch(() => null)) as
      | { message?: unknown; error?: string }
      | null
    if (!response.ok) throw new Error(data?.error || `Could not send message (${response.status})`)
    const message = validMessage(data?.message)
    if (!message) throw new Error('Chat API returned an invalid message.')
    return message
  }

  async typing(friendCode: string): Promise<void> {
    if (!this.auth) return
    try {
      await fetch(`${WORKER_BASE}/v1/chat/typing`, {
        method: 'POST',
        headers: this.headers(this.auth),
        body: JSON.stringify({ friendCode }),
        signal: AbortSignal.timeout(5000)
      })
    } catch {
      // Typing is best-effort.
    }
  }
}

/**
 * Mint a chat token for the game process. The Worker only issues a token for
 * an account whose friend profile is registered, and a user can launch a
 * Fabric instance without ever opening the launcher's Chat or Friends tabs.
 * Binding the profile here is best-effort: an offline registration must not
 * stop the token request when the worker already knows the account.
 */
export async function mintChatSession(
  chat: Pick<ChatService, 'session'>,
  friends: FriendRegistrar,
  account: ChatAccount
): Promise<{ token: string; code: string; expiresAt: number } | null> {
  const auth = { code: account.code, secret: account.secret }
  try {
    await friends.register(auth, account.name, account.uuid)
  } catch {
    // Keep the launch path offline-tolerant; session() decides.
  }
  const session = await chat.session(auth)
  return session && session.code === account.code ? session : null
}
