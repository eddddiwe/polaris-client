// Cloudflare Worker for Polaris Launcher API
// Deploy: wrangler deploy
// Endpoints:
//   GET  /v1/version            -> { version, url, sha256, minVersion, changelog }
//   GET  /v1/announcements      -> { announcements: [...] }
//   POST /v1/telemetry          -> accept crash reports (opt-in)
//   POST /v1/friends/register   -> register a friend code { code, name }
//   POST /v1/friends/add        -> add friend { myCode, friendCode }
//   POST /v1/friends/remove     -> remove friend { myCode, friendCode }
//   GET  /v1/friends/list?code= -> list friends { friends: [{ code, name }] }
//   POST /v1/friends/ping       -> presence ping { code } (updates lastSeen)
//   GET  /v1/friends/presence?codes= -> { presence: { code: 'online'|'offline' } }

const REPO = 'eddddiwe/polaris-client'
const CURRENT_VERSION = '0.3.4'
const PRESENCE_TTL_SECONDS = 120 // 2 minutes

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Version check
    if (path === '/v1/version' || path === '/version') {
      try {
        const ghRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Polaris-API' }
        })
        const gh = await ghRes.json()
        const latestVersion = (gh.tag_name || '').replace(/^v/, '')
        const asset = (gh.assets || []).find(a => a.name.endsWith('.exe')) || (gh.assets || [])[0]
        return new Response(JSON.stringify({
          version: latestVersion || CURRENT_VERSION,
          url: asset?.browser_download_url || `https://github.com/${REPO}/releases/latest`,
          sha256: '',
          minVersion: '0.3.0',
          changelog: gh.body || '',
          publishedAt: gh.published_at || new Date().toISOString(),
        }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({
          version: CURRENT_VERSION,
          url: `https://github.com/${REPO}/releases/latest`,
          sha256: '',
          minVersion: '0.3.0',
          changelog: '',
          publishedAt: new Date().toISOString(),
        }), { headers: corsHeaders })
      }
    }

    // Announcements
    if (path === '/v1/announcements' || path === '/announcements') {
      return new Response(JSON.stringify({
        announcements: [],
        minVersion: '0.3.0',
        killSwitch: false,
      }), { headers: corsHeaders })
    }

    // Telemetry (opt-in)
    if (path === '/v1/telemetry' && request.method === 'POST') {
      try {
        const body = await request.json()
        console.log('Telemetry received:', JSON.stringify(body).substring(0, 500))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ ok: false }), { status: 400, headers: corsHeaders })
      }
    }

    // ---------- Friends API (requires KV binding: FRIENDS) ----------
    const kv = env.FRIENDS

    // Register a friend code
    if (path === '/v1/friends/register' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const code = String(body.code || '').trim().toUpperCase()
        const name = String(body.name || '').trim() || code
        if (!code) return new Response(JSON.stringify({ ok: false, error: 'code required' }), { status: 400, headers: corsHeaders })
        await kv.put(`friend:${code}`, JSON.stringify({ name, createdAt: Date.now() }))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Add a friend
    if (path === '/v1/friends/add' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const myCode = String(body.myCode || '').trim().toUpperCase()
        const friendCode = String(body.friendCode || '').trim().toUpperCase()
        if (!myCode || !friendCode) return new Response(JSON.stringify({ ok: false, error: 'myCode and friendCode required' }), { status: 400, headers: corsHeaders })
        const raw = await kv.get(`friends:${myCode}`)
        const list = raw ? JSON.parse(raw) : []
        if (!list.includes(friendCode)) list.push(friendCode)
        await kv.put(`friends:${myCode}`, JSON.stringify(list))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Remove a friend
    if (path === '/v1/friends/remove' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const myCode = String(body.myCode || '').trim().toUpperCase()
        const friendCode = String(body.friendCode || '').trim().toUpperCase()
        const raw = await kv.get(`friends:${myCode}`)
        const list = raw ? JSON.parse(raw) : []
        const next = list.filter(c => c !== friendCode)
        await kv.put(`friends:${myCode}`, JSON.stringify(next))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // List friends
    if (path === '/v1/friends/list' && request.method === 'GET') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const code = String(url.searchParams.get('code') || '').trim().toUpperCase()
        if (!code) return new Response(JSON.stringify({ ok: false, error: 'code required' }), { status: 400, headers: corsHeaders })
        const raw = await kv.get(`friends:${code}`)
        const codes = raw ? JSON.parse(raw) : []
        const friends = []
        for (const fc of codes) {
          const infoRaw = await kv.get(`friend:${fc}`)
          const info = infoRaw ? JSON.parse(infoRaw) : { name: fc }
          friends.push({ code: fc, name: info.name || fc })
        }
        return new Response(JSON.stringify({ friends }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Presence ping
    if (path === '/v1/friends/ping' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const code = String(body.code || '').trim().toUpperCase()
        if (!code) return new Response(JSON.stringify({ ok: false, error: 'code required' }), { status: 400, headers: corsHeaders })
        await kv.put(`presence:${code}`, JSON.stringify({ lastSeen: Date.now() }), { expirationTtl: PRESENCE_TTL_SECONDS })
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Presence check
    if (path === '/v1/friends/presence' && request.method === 'GET') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const codes = String(url.searchParams.get('codes') || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
        const presence = {}
        for (const code of codes) {
          const raw = await kv.get(`presence:${code}`)
          if (raw) {
            const info = JSON.parse(raw)
            presence[code] = (Date.now() - info.lastSeen < PRESENCE_TTL_SECONDS * 1000) ? 'online' : 'offline'
          } else {
            presence[code] = 'offline'
          }
        }
        return new Response(JSON.stringify({ presence }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Health check
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'polaris-api' }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders })
  }
}
