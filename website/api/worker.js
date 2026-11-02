// Cloudflare Worker for the Polaris launcher API.
//
// The launcher and the bundled presence mod are the only intended clients.
// There is no browser CORS grant: friend mutations require a per-account
// secret in X-Polaris-Secret plus the public code in X-Polaris-Code.
//
// Endpoints:
//   GET  /v1/version
//   GET  /v1/announcements
//   POST /v1/presence                 (authenticated)
//   GET  /v1/presence?server=         (authenticated)
//   GET  /v1/presence/friends?uuids=  (authenticated, caller's friends only)
//   POST /v1/friends/register         (authenticated; first call pins the secret)
//   GET  /v1/friends/list             (authenticated)
//   POST /v1/friends/request          (authenticated)
//   POST /v1/friends/respond          (authenticated)
//   POST /v1/friends/remove-mutual    (authenticated)
//   GET  /v1/friends/requests         (authenticated)
//   GET  /v1/shards/pending           (authenticated; queued adjustments)
//   POST /v1/shards/ack               (authenticated; acknowledge applied grants)

const REPO = 'eddddiwe/polaris-client'
// Matches the launcher's 32-symbol alphabet (no I, O, 0 or 1).
const FRIEND_CODE_RE = /^POLARIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/
const CHAT_TOKEN_RE = /^pc_[0-9a-f-]{36}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHARD_ID_RE = /^[0-9a-f-]{36}$/i
const MAX_FRIENDS = 200
const MAX_PENDING = 100
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PRESENCE_TTL_SECONDS = 120
const PRESENCE_FRESH_MS = 90_000
const IP_TTL_SECONDS = 30 * 24 * 60 * 60
const CHAT_TICKET_TTL_SECONDS = 90
const CHAT_TOKEN_TTL_SECONDS = 12 * 60 * 60
const CHAT_MESSAGE_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_CHAT_CHARS = 800
const MAX_SOCKETS_PER_INBOX = 8
// Keeps a history request well under the Workers 50-subrequest limit:
// auth + isFriend + list + one read per message <= 43 KV operations.
const MAX_HISTORY_MESSAGES = 40
const MAX_BODY_BYTES = 4096

/** Per-isolate fixed-window limiter. Cloudflare's edge also rate-limits abuse. */
const buckets = new Map()

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  })
}

function fail(status, message) {
  return json({ ok: false, error: message }, status)
}

function normalizeUuid(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (UUID_RE.test(raw)) return raw
  if (/^[0-9a-f]{32}$/.test(raw)) {
    return raw.replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, '$1-$2-$3-$4-$5')
  }
  return ''
}

function clientIp(request) {
  const raw = String(request.headers.get('CF-Connecting-IP') || '').trim()
  if (!raw || raw.length > 64) return ''
  const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
  if (new RegExp(`^(${octet}\\.){3}${octet}$`).test(raw)) return raw
  if (/^[0-9a-fA-F:.]{3,64}$/.test(raw) && raw.includes(':')) return raw
  return ''
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase()
  return FRIEND_CODE_RE.test(code) ? code : ''
}

// Bidi and zero-width controls can visually reorder text ("trojan source")
// and have no place in a chat message or display name.
const BIDI_CONTROLS = /[\u00a7\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(BIDI_CONTROLS, '')
    .trim()
    .slice(0, maxLength)
}

function cleanMessage(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    // Keep tab and newline; strip other C0/C1 controls.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(BIDI_CONTROLS, '')
    .trim()
    .slice(0, maxLength)
}

function rateLimit(request, name, limit, windowMs) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const key = `${name}:${ip}`
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  if (buckets.size > 5000) {
    for (const [entry, value] of buckets) {
      if (value.reset <= now) buckets.delete(entry)
    }
  }
  return bucket.count <= limit
}

function limitOrThrow(request, name, limit, windowMs) {
  if (!rateLimit(request, name, limit, windowMs)) {
    throw new ApiError(429, 'Too many requests. Try again later.')
  }
}

async function readJson(request) {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'Request body is too large')
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'Request body is too large')
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Invalid JSON body')
  }
  return body
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function readFriend(kv, code) {
  const raw = await kv.get(`friend:${code}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Extract credentials and verify them against the stored secret hash.
 * Registration is the only endpoint that may bind a legacy record.
 */
async function authenticate(kv, request) {
  const code = normalizeCode(request.headers.get('X-Polaris-Code'))
  const secret = String(request.headers.get('X-Polaris-Secret') || '').trim()
  if (!code || !SECRET_RE.test(secret) || CHAT_TOKEN_RE.test(secret)) return null
  const info = await readFriend(kv, code)
  if (!info || !info.secretHash) return null
  const hash = await sha256Hex(secret)
  if (!sameHex(hash, String(info.secretHash))) return null
  return { code, secret, info }
}

/**
 * Chat may authenticate with either the account secret (launcher) or a
 * short-lived, chat-scoped token (the in-game mod). The token is stored hashed
 * and never grants access to friends, shards or account endpoints.
 */
async function authenticateChat(kv, request) {
  const token = String(request.headers.get('X-Polaris-Chat-Token') || '').trim()
  if (token) {
    if (!CHAT_TOKEN_RE.test(token)) return null
    const digest = await sha256Hex(token)
    const raw = await kv.get(`chatToken:${digest}`)
    if (!raw) return null
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
    const code = normalizeCode(data?.code)
    if (!code) return null
    const info = await readFriend(kv, code)
    if (!info) return null
    return { code, secret: '', info }
  }
  return await authenticate(kv, request)
}

function chatRoom(a, b) {
  return [a, b].sort().join(':')
}

function chatInbox(env, code) {
  if (!env.CHAT) return null
  return env.CHAT.get(env.CHAT.idFromName(code))
}

async function pushChat(env, code, payload) {
  const stub = chatInbox(env, code)
  if (!stub) return false
  try {
    const response = await stub.fetch('https://chat.internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return response.ok
  } catch {
    return false
  }
}

function publicFriend(code, info) {
  return {
    code,
    name: cleanText(info?.name, 32) || code,
    uuid: normalizeUuid(info?.uuid) || undefined,
    addedAt: Number(info?.createdAt) || Date.now()
  }
}

async function readList(kv, key) {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
  } catch {
    return []
  }
}

async function isFriend(kv, code, friendCode) {
  if (!code || !friendCode || code === friendCode) return false
  return (await readList(kv, `friends:${code}`)).includes(friendCode)
}

async function writeList(kv, key, list) {
  const unique = [...new Set(list)].slice(0, MAX_FRIENDS)
  await kv.put(key, JSON.stringify(unique))
}

async function readRequests(kv, auth) {
  const incoming = await readList(kv, `incoming:${auth.code}`)
  const requests = []
  const keep = []
  for (const senderCode of incoming) {
    if (!FRIEND_CODE_RE.test(senderCode)) continue
    const raw = await kv.get(`request:${senderCode}:${auth.code}`)
    if (!raw) continue
    let request
    try {
      request = JSON.parse(raw)
    } catch {
      continue
    }
    if (Number(request.expiresAt) <= Date.now()) {
      await deleteRequest(kv, senderCode, auth.code)
      continue
    }
    keep.push(senderCode)
    const info = await readFriend(kv, senderCode)
    if (!info) continue
    requests.push({
      code: senderCode,
      name: cleanText(info.name, 32) || senderCode,
      uuid: normalizeUuid(info.uuid) || undefined,
      createdAt: Number(request.createdAt) || 0
    })
  }
  if (keep.length !== incoming.length) {
    await writeList(kv, `incoming:${auth.code}`, keep)
  }
  return requests
}

async function deleteRequest(kv, senderCode, recipientCode) {
  await kv.delete(`request:${senderCode}:${recipientCode}`)
  const senderPending = await readList(kv, `pending:${senderCode}`)
  await writeList(
    kv,
    `pending:${senderCode}`,
    senderPending.filter((code) => code !== recipientCode)
  )
  const recipientIncoming = await readList(kv, `incoming:${recipientCode}`)
  await writeList(
    kv,
    `incoming:${recipientCode}`,
    recipientIncoming.filter((code) => code !== senderCode)
  )
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const minVersion = env.MIN_VERSION || env.CURRENT_VERSION || '0.4.2'

    if (request.method === 'OPTIONS') {
      // No Access-Control-Allow-Origin: the API is not a browser endpoint.
      return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } })
    }

    try {
      // Version metadata. The updater independently confirms the release
      // digest with GitHub; this endpoint is convenience/discovery only.
      if (path === '/v1/version' || path === '/version') {
        try {
          const ghRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest?t=${Date.now()}`, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Polaris-API' },
            cf: { cacheTtl: 0, cacheEverything: false },
            signal: AbortSignal.timeout(6000)
          })
          const gh = await ghRes.json()
          const latestVersion = String(gh.tag_name || '').replace(/^v/, '')
          const version = /^\d+\.\d+\.\d+$/.test(latestVersion)
            ? latestVersion
            : env.CURRENT_VERSION || '0.4.2'
          const directUrl = `https://github.com/${REPO}/releases/download/v${version}/Polaris-Setup-${version}.exe`
          const asset = (gh.assets || []).find((entry) => entry.name.endsWith('.exe')) || null
          const digest = typeof asset?.digest === 'string' ? asset.digest.replace(/^sha256:/i, '') : ''
          return json({
            version,
            url: asset?.browser_download_url || directUrl,
            sha256: /^[0-9a-f]{64}$/i.test(digest) ? digest.toLowerCase() : '',
            size: Number(asset?.size) || 0,
            minVersion,
            changelog: gh.body || '',
            publishedAt: gh.published_at || new Date().toISOString()
          })
        } catch {
          return json({
            version: env.CURRENT_VERSION || '0.4.2',
            url: `https://github.com/${REPO}/releases/latest`,
            sha256: '',
            size: 0,
            minVersion,
            changelog: '',
            publishedAt: new Date().toISOString()
          })
        }
      }

      if (path === '/v1/announcements' || path === '/announcements') {
        return json({ announcements: [], minVersion, killSwitch: false })
      }

      const kv = env.FRIENDS
      if (!kv) return fail(500, 'Service is not configured')

      // WebSocket handoff uses a short-lived ticket that is deleted on first
      // read, so the account secret never appears in a URL or handshake.
      if (path === '/v1/chat/ws' && request.method === 'GET') {
        limitOrThrow(request, 'chat-ws', 60, 60_000)
        if (!env.CHAT) return fail(503, 'Chat is not configured')
        if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
          return fail(426, 'WebSocket upgrade required')
        }
        const ticket = String(url.searchParams.get('ticket') || '').trim()
        if (!ticket) return fail(401, 'Chat ticket required')
        const raw = await kv.get(`chatTicket:${ticket}`)
        if (!raw) return fail(401, 'Chat ticket expired')
        await kv.delete(`chatTicket:${ticket}`)
        let ticketData
        try {
          ticketData = JSON.parse(raw)
        } catch {
          return fail(401, 'Invalid chat ticket')
        }
        const code = normalizeCode(ticketData?.code)
        if (!code) return fail(401, 'Invalid chat ticket')
        const stub = chatInbox(env, code)
        if (!stub) return fail(503, 'Chat is not configured')
        const headers = new Headers(request.headers)
        headers.set('X-Polaris-Code', code)
        return await stub.fetch(new Request(request, { headers }))
      }

      // ---------- Presence ----------
      if (path === '/v1/presence') {
        limitOrThrow(request, 'presence', 120, 60_000)
        const auth = await authenticate(kv, request)
        if (!auth) return fail(401, 'Authentication required')

        if (request.method === 'POST') {
          const body = await readJson(request)
          const uuid = normalizeUuid(body.uuid)
          const name = cleanText(body.name, 32) || uuid
          const server = cleanText(body.server, 200).toLowerCase()
          if (!uuid || !server) return fail(400, 'uuid and server required')
          const record = JSON.stringify({
            uuid,
            name,
            server,
            code: auth.code,
            lastSeen: Date.now()
          })
          // Keying by code as well as UUID prevents another authenticated
          // account from overwriting or hiding a player's presence record.
          await kv.put(`presence:${encodeURIComponent(server)}:${auth.code}:${uuid}`, record, {
            expirationTtl: PRESENCE_TTL_SECONDS
          })
          await kv.put(`presenceUuid:${uuid}:${auth.code}`, record, {
            expirationTtl: PRESENCE_TTL_SECONDS
          })
          return json({ ok: true })
        }

        if (request.method === 'GET') {
          const server = cleanText(url.searchParams.get('server'), 200).toLowerCase()
          if (!server) return fail(400, 'server required')
          const prefix = `presence:${encodeURIComponent(server)}:`
          const listed = await kv.list({ prefix, limit: 1000 })
          const users = []
          const now = Date.now()
          for (const entry of listed.keys || []) {
            const raw = await kv.get(entry.name)
            if (!raw) continue
            let user
            try {
              user = JSON.parse(raw)
            } catch {
              continue
            }
            if (now - Number(user.lastSeen || 0) > PRESENCE_FRESH_MS) continue
            users.push({ uuid: user.uuid, name: user.name, lastSeen: user.lastSeen })
          }
          if (url.searchParams.get('format') === 'text') {
            return new Response(users.map((user) => `${user.uuid}|${user.name}`).join('\n'), {
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff'
              }
            })
          }
          return json({ users })
        }

        return fail(405, 'Method not allowed')
      }

      // Only return presence for UUIDs on the caller's authenticated friend
      // list. This prevents arbitrary UUID interrogation and spoofed records.
      if (path === '/v1/presence/friends' && request.method === 'GET') {
        limitOrThrow(request, 'presence-friends', 120, 60_000)
        const auth = await authenticate(kv, request)
        if (!auth) return fail(401, 'Authentication required')
        const requested = new Set(
          String(url.searchParams.get('uuids') || '')
            .split(',')
            .map(normalizeUuid)
            .filter(Boolean)
        )
        if (requested.size === 0) return json({ presence: {} })
        if (requested.size > 100) return fail(400, 'too many uuids')

        const codes = await readList(kv, `friends:${auth.code}`)
        const presence = {}
        const now = Date.now()
        const profiles = await Promise.all(
          codes.map(async (code) => ({ code, info: await readFriend(kv, code) }))
        )
        await Promise.all(
          profiles.map(async ({ code, info }) => {
            const uuid = normalizeUuid(info?.uuid)
            if (!uuid || !requested.has(uuid)) return
            const raw = await kv.get(`presenceUuid:${uuid}:${code}`)
            if (!raw) return
            let record
            try {
              record = JSON.parse(raw)
            } catch {
              return
            }
            if (record.code !== code) return
            if (normalizeUuid(record.uuid) !== uuid) return
            if (now - Number(record.lastSeen || 0) > PRESENCE_FRESH_MS) return
            presence[uuid] = {
              server: cleanText(record.server, 200),
              lastSeen: Number(record.lastSeen) || 0
            }
          })
        )
        return json({ presence })
      }

      // ---------- Friends ----------
      if (path === '/v1/friends/register' && request.method === 'POST') {
        limitOrThrow(request, 'register', 10, 60_000)
        const code = normalizeCode(request.headers.get('X-Polaris-Code'))
        const secret = String(request.headers.get('X-Polaris-Secret') || '').trim()
        if (!code || !SECRET_RE.test(secret) || CHAT_TOKEN_RE.test(secret)) {
          return fail(400, 'Invalid friend code or secret')
        }
        const body = await readJson(request)
        const name = cleanText(body.name, 32) || code
        const uuid = normalizeUuid(body.uuid)
        const secretHash = await sha256Hex(secret)
        const existing = await readFriend(kv, code)
        if (existing?.secretHash && !sameHex(String(existing.secretHash), secretHash)) {
          return fail(403, 'This friend code is already registered to another account')
        }
        await kv.put(
          `friend:${code}`,
          JSON.stringify({
            name,
            uuid: uuid || normalizeUuid(existing?.uuid) || undefined,
            secretHash,
            createdAt: Number(existing?.createdAt) || Date.now()
          })
        )
        const ip = clientIp(request)
        if (ip) {
          await kv.put(`ip:${code}`, JSON.stringify({ ip, at: Date.now() }), {
            expirationTtl: IP_TTL_SECONDS
          })
        }
        return json({ ok: true, code })
      }

      if (path === '/v1/chat/token' && request.method === 'POST') {
        limitOrThrow(request, 'chat-token', 20, 60_000)
        if (!env.CHAT) return fail(503, 'Chat is not configured')
        const master = await authenticate(kv, request)
        if (!master) return fail(401, 'Authentication required')
        const token = `pc_${crypto.randomUUID()}`
        await kv.put(`chatToken:${await sha256Hex(token)}`, JSON.stringify({ code: master.code }), {
          expirationTtl: CHAT_TOKEN_TTL_SECONDS
        })
        return json({
          token,
          code: master.code,
          expiresAt: Date.now() + CHAT_TOKEN_TTL_SECONDS * 1000
        })
      }

      // Chat accepts a short-lived scoped token; every other endpoint requires
      // the account secret.
      const isChatRoute = path.startsWith('/v1/chat/')
      const auth = isChatRoute ? await authenticateChat(kv, request) : await authenticate(kv, request)
      if (!auth) return fail(401, 'Authentication required')

      if (path === '/v1/chat/friends' && request.method === 'GET') {
        limitOrThrow(request, 'chat-friends', 60, 60_000)
        const codes = (await readList(kv, `friends:${auth.code}`)).slice(0, 40)
        const friends = []
        for (const code of codes) {
          const info = await readFriend(kv, code)
          if (info) friends.push(publicFriend(code, info))
        }
        return json({ friends })
      }

      if (path === '/v1/chat/ticket' && request.method === 'POST') {
        limitOrThrow(request, 'chat-ticket', 30, 60_000)
        if (!env.CHAT) return fail(503, 'Chat is not configured')
        const ticket = crypto.randomUUID()
        await kv.put(`chatTicket:${ticket}`, JSON.stringify({ code: auth.code }), {
          expirationTtl: CHAT_TICKET_TTL_SECONDS
        })
        return json({ ticket })
      }

      if (path === '/v1/chat/history' && request.method === 'GET') {
        limitOrThrow(request, 'chat-history', 120, 60_000)
        const friendCode = normalizeCode(url.searchParams.get('friendCode'))
        if (!friendCode) return fail(400, 'Invalid friend code')
        if (!(await isFriend(kv, auth.code, friendCode))) return fail(403, 'Chat is limited to friends')
        const room = chatRoom(auth.code, friendCode)
        // Keys are stored newest-first, so the first page is the newest
        // messages and older history never masks a fresh message.
        const listed = await kv.list({ prefix: `chat:${room}:`, limit: MAX_HISTORY_MESSAGES })
        const raws = await Promise.all((listed.keys || []).map((entry) => kv.get(entry.name)))
        const messages = []
        for (const raw of raws) {
          if (!raw) continue
          try {
            const value = JSON.parse(raw)
            const from = normalizeCode(value?.from)
            const to = normalizeCode(value?.to)
            if (!value?.id || !from || !to) continue
            // Defence in depth: never surface a record from another room.
            if (from !== auth.code && from !== friendCode) continue
            if (to !== auth.code && to !== friendCode) continue
            messages.push({
              id: String(value.id),
              from,
              to,
              fromName: cleanText(value.fromName, 32),
              text: cleanMessage(value.text, MAX_CHAT_CHARS),
              createdAt: Number(value.createdAt) || 0
            })
          } catch {
            // ignore malformed messages
          }
        }
        messages.sort((a, b) => a.createdAt - b.createdAt)
        return json({ messages })
      }

      if (path === '/v1/chat/send' && request.method === 'POST') {
        limitOrThrow(request, 'chat-send', 30, 60_000)
        if (!env.CHAT) return fail(503, 'Chat is not configured')
        const body = await readJson(request)
        const friendCode = normalizeCode(body.friendCode)
        const text = cleanMessage(body.text, MAX_CHAT_CHARS)
        if (!friendCode) return fail(400, 'Invalid friend code')
        if (!text) return fail(400, 'Message is empty')
        if (!(await isFriend(kv, auth.code, friendCode))) return fail(403, 'Chat is limited to friends')
        const message = {
          id: crypto.randomUUID(),
          from: auth.code,
          to: friendCode,
          fromName: cleanText(auth.info?.name, 32) || auth.code,
          text,
          createdAt: Date.now()
        }
        const room = chatRoom(auth.code, friendCode)
        // Inverted timestamp keeps the newest messages at the front of a list
        // page; history sorts the returned records back into reading order.
        const keyTime = String(9_999_999_999_999 - message.createdAt).padStart(13, '0')
        await kv.put(`chat:${room}:${keyTime}-${message.id}`, JSON.stringify(message), {
          expirationTtl: CHAT_MESSAGE_TTL_SECONDS
        })
        await Promise.all([
          pushChat(env, auth.code, { type: 'message', message }),
          pushChat(env, friendCode, { type: 'message', message })
        ])
        return json({ message })
      }

      if (path === '/v1/chat/typing' && request.method === 'POST') {
        limitOrThrow(request, 'chat-typing', 120, 60_000)
        if (!env.CHAT) return fail(503, 'Chat is not configured')
        const body = await readJson(request)
        const friendCode = normalizeCode(body.friendCode)
        if (!friendCode) return fail(400, 'Invalid friend code')
        if (!(await isFriend(kv, auth.code, friendCode))) return fail(403, 'Chat is limited to friends')
        await pushChat(env, friendCode, {
          type: 'typing',
          from: auth.code,
          fromName: cleanText(auth.info?.name, 32) || auth.code
        })
        return json({ ok: true })
      }

      if (path === '/v1/shards/pending' && request.method === 'GET') {
        limitOrThrow(request, 'shards-pending', 30, 60_000)
        const prefix = `shard:${auth.code}:`
        const listed = await kv.list({ prefix, limit: 100 })
        const grants = []
        for (const entry of listed.keys || []) {
          const id = entry.name.slice(prefix.length)
          if (!SHARD_ID_RE.test(id)) continue
          const raw = await kv.get(entry.name)
          if (!raw) continue
          let value
          try {
            value = JSON.parse(raw)
          } catch {
            continue
          }
          const delta = Number(value?.delta)
          if (!Number.isFinite(delta) || delta === 0) continue
          grants.push({
            id,
            delta: Math.max(-1_000_000, Math.min(1_000_000, Math.round(delta))),
            reason: cleanText(value?.reason, 120),
            createdAt: Number(value?.createdAt) || 0
          })
        }
        grants.sort((a, b) => a.createdAt - b.createdAt)
        return json({ grants })
      }

      if (path === '/v1/shards/ack' && request.method === 'POST') {
        limitOrThrow(request, 'shards-ack', 30, 60_000)
        const body = await readJson(request)
        const ids = Array.isArray(body.ids) ? body.ids : []
        if (ids.length > 100) return fail(400, 'Too many grants')
        for (const value of ids) {
          const id = String(value || '')
          if (!SHARD_ID_RE.test(id)) continue
          await kv.delete(`shard:${auth.code}:${id}`)
        }
        return json({ ok: true })
      }

      if (path === '/v1/friends/list' && request.method === 'GET') {
        limitOrThrow(request, 'friends-list', 120, 60_000)
        const codes = await readList(kv, `friends:${auth.code}`)
        const friends = await Promise.all(
          codes.map(async (code) => publicFriend(code, await readFriend(kv, code)))
        )
        return json({ friends })
      }

      if (path === '/v1/friends/request' && request.method === 'POST') {
        limitOrThrow(request, 'friends-request', 20, 60_000)
        const body = await readJson(request)
        const friendCode = normalizeCode(body.friendCode)
        if (!friendCode) return fail(400, 'Invalid friend code')
        if (friendCode === auth.code) return fail(400, 'Cannot add yourself')
        const target = await readFriend(kv, friendCode)
        if (!target) return fail(404, 'No account uses that friend code')

        const friends = await readList(kv, `friends:${auth.code}`)
        if (friends.includes(friendCode)) return fail(409, 'Already friends')

        const pending = await readList(kv, `pending:${auth.code}`)
        if (pending.includes(friendCode)) return fail(409, 'Request already sent')
        if (pending.length >= MAX_PENDING) return fail(409, 'Too many outgoing requests')

        // If they already asked us, point the user at their inbox instead of
        // creating a second request edge.
        if (await kv.get(`request:${friendCode}:${auth.code}`)) {
          return fail(409, 'They already sent you a friend request')
        }

        const targetIncoming = await readList(kv, `incoming:${friendCode}`)
        if (targetIncoming.length >= MAX_PENDING) return fail(409, 'Their request inbox is full')
        const expiresAt = Date.now() + REQUEST_TTL_MS
        await kv.put(
          `request:${auth.code}:${friendCode}`,
          JSON.stringify({
            myCode: auth.code,
            friendCode,
            createdAt: Date.now(),
            expiresAt
          }),
          { expirationTtl: Math.ceil(REQUEST_TTL_MS / 1000) }
        )
        await writeList(kv, `pending:${auth.code}`, [...pending, friendCode])
        if (!targetIncoming.includes(auth.code)) {
          await writeList(kv, `incoming:${friendCode}`, [...targetIncoming, auth.code])
        }
        return json({ ok: true })
      }

      if (path === '/v1/friends/respond' && request.method === 'POST') {
        limitOrThrow(request, 'friends-respond', 20, 60_000)
        const body = await readJson(request)
        const friendCode = normalizeCode(body.friendCode)
        const action = String(body.action || '').trim().toLowerCase()
        if (!friendCode || (action !== 'accept' && action !== 'decline')) {
          return fail(400, 'friendCode and action are required')
        }
        const raw = await kv.get(`request:${friendCode}:${auth.code}`)
        if (!raw) return fail(404, 'No pending request found')
        let pendingRequest
        try {
          pendingRequest = JSON.parse(raw)
        } catch {
          await kv.delete(`request:${friendCode}:${auth.code}`)
          return fail(404, 'No pending request found')
        }
        if (Number(pendingRequest.expiresAt) <= Date.now()) {
          await deleteRequest(kv, friendCode, auth.code)
          return fail(410, 'That friend request expired')
        }

        if (action === 'accept') {
          const myFriends = await readList(kv, `friends:${auth.code}`)
          const theirFriends = await readList(kv, `friends:${friendCode}`)
          if (myFriends.length >= MAX_FRIENDS || theirFriends.length >= MAX_FRIENDS) {
            return fail(409, 'Friend list is full')
          }
          if (!myFriends.includes(friendCode)) {
            await writeList(kv, `friends:${auth.code}`, [...myFriends, friendCode])
          }
          if (!theirFriends.includes(auth.code)) {
            await writeList(kv, `friends:${friendCode}`, [...theirFriends, auth.code])
          }
        }
        await deleteRequest(kv, friendCode, auth.code)
        return json({ ok: true, action })
      }

      if (path === '/v1/friends/remove-mutual' && request.method === 'POST') {
        limitOrThrow(request, 'friends-remove', 20, 60_000)
        const body = await readJson(request)
        const friendCode = normalizeCode(body.friendCode)
        if (!friendCode) return fail(400, 'Invalid friend code')
        if (friendCode === auth.code) return fail(400, 'Cannot remove yourself')

        const mine = await readList(kv, `friends:${auth.code}`)
        await writeList(
          kv,
          `friends:${auth.code}`,
          mine.filter((code) => code !== friendCode)
        )
        const theirs = await readList(kv, `friends:${friendCode}`)
        await writeList(
          kv,
          `friends:${friendCode}`,
          theirs.filter((code) => code !== auth.code)
        )
        await deleteRequest(kv, auth.code, friendCode)
        await deleteRequest(kv, friendCode, auth.code)
        return json({ ok: true, removedFromBoth: true })
      }

      if (path === '/v1/friends/requests' && request.method === 'GET') {
        limitOrThrow(request, 'friends-requests', 120, 60_000)
        return json({ requests: await readRequests(kv, auth) })
      }

      if (path === '/health' || path === '/') {
        return json({ status: 'ok', service: 'polaris-api' })
      }

      return fail(404, 'Not found')
    } catch (error) {
      if (error instanceof ApiError) return fail(error.status, error.message)
      console.error('Polaris API error', error)
      return fail(500, 'Internal server error')
    }
  }
}

/**
 * One Durable Object per account. WebSockets only receive broadcasts; chat
 * messages are sent through the authenticated HTTP endpoint and persisted in
 * KV for history.
 */
export class ChatInbox {
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      let payload
      try {
        payload = await request.json()
      } catch {
        return new Response('Invalid payload', { status: 400 })
      }
      if (!payload || (payload.type !== 'message' && payload.type !== 'typing')) {
        return new Response('Invalid payload', { status: 400 })
      }
      const data = JSON.stringify(payload)
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(data)
        } catch {
          // A dead socket will be removed by the runtime.
        }
      }
      return new Response('ok')
    }

    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 })
    }

    // Ticket issuance is rate limited, but one account should not be able to
    // hold an unbounded number of sockets open.
    if (this.state.getWebSockets().length >= MAX_SOCKETS_PER_INBOX) {
      return new Response('Too many connections', { status: 429 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket, message) {
    try {
      const value = JSON.parse(String(message))
      if (value?.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {
      // Ignore malformed client frames; chat sends use HTTP.
    }
  }

  async webSocketClose(socket, code, reason) {
    // Reserved codes (1005/1006) throw when echoed back to close().
    const safe = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000
    try {
      socket.close(safe, reason)
    } catch {
      // Already closed.
    }
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, 'Chat socket error')
    } catch {
      // Already closed.
    }
  }
}
