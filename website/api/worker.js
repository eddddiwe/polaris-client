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
const FRIEND_CODE_RE = /^POLARIS-[A-Z0-9]{4}-[A-Z0-9]{4}$/
const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHARD_ID_RE = /^[0-9a-f-]{36}$/i
const MAX_FRIENDS = 200
const MAX_PENDING = 100
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PRESENCE_TTL_SECONDS = 120
const PRESENCE_FRESH_MS = 90_000
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

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase()
  return FRIEND_CODE_RE.test(code) ? code : ''
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
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
  if (!code || !SECRET_RE.test(secret)) return null
  const info = await readFriend(kv, code)
  if (!info || !info.secretHash) return null
  const hash = await sha256Hex(secret)
  if (!sameHex(hash, String(info.secretHash))) return null
  return { code, secret, info }
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
        if (!code || !SECRET_RE.test(secret)) return fail(400, 'Invalid friend code or secret')
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
        return json({ ok: true, code })
      }

      // Every remaining friends endpoint requires valid credentials.
      const auth = await authenticate(kv, request)
      if (!auth) return fail(401, 'Authentication required')

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
