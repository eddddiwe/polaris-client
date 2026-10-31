// Cloudflare Worker for Polaris Launcher API
// Deploy: wrangler deploy
// Endpoints:
//   GET  /v1/version            -> { version, url, sha256, minVersion, changelog }
//   GET  /v1/announcements      -> { announcements: [...] }
//   POST /v1/telemetry          -> accept crash reports (opt-in)
//   POST /v1/friends/register   -> register a friend code { code, name }
//   POST /v1/friends/add        -> add confirmed friend { myCode, friendCode }
//   POST /v1/friends/remove     -> remove friend { myCode, friendCode }
//   POST /v1/friends/remove-mutual -> remove from both lists { myCode, friendCode }
//   GET  /v1/friends/list?code= -> list confirmed friends { friends: [{ code, name }] }
//   POST /v1/friends/request    -> send friend request { myCode, friendCode }
//   POST /v1/friends/respond    -> accept/decline request { myCode, friendCode, action: 'accept'|'decline' }
//   GET  /v1/friends/requests?code= -> list pending requests { requests: [{ code, name, createdAt }] }

const REPO = 'eddddiwe/polaris-client'
const CURRENT_VERSION = '0.3.5'

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
        const version = latestVersion || CURRENT_VERSION
        const directUrl = `https://github.com/${REPO}/releases/download/v${version}/Polaris-Setup-${version}.exe`
        const asset = (gh.assets || []).find(a => a.name.endsWith('.exe')) || (gh.assets || [])[0]
        return new Response(JSON.stringify({
          version,
          url: asset?.browser_download_url || directUrl,
          sha256: '',
          minVersion: '0.3.0',
          changelog: gh.body || '',
          publishedAt: gh.published_at || new Date().toISOString(),
        }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({
          version: CURRENT_VERSION,
          url: `https://github.com/${REPO}/releases/download/v${CURRENT_VERSION}/Polaris-Setup-${CURRENT_VERSION}.exe`,
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

    // Add a confirmed friend
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
        // also remove from pending if exists
        await kv.delete(`request:${myCode}:${friendCode}`)
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
        await kv.delete(`request:${myCode}:${friendCode}`)
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Remove friend from BOTH lists (mutual removal)
    if (path === '/v1/friends/remove-mutual' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const myCode = String(body.myCode || '').trim().toUpperCase()
        const friendCode = String(body.friendCode || '').trim().toUpperCase()
        // Format validation
        if (!myCode || !friendCode) return new Response(JSON.stringify({ ok: false, error: 'myCode and friendCode required' }), { status: 400, headers: corsHeaders })
        if (!/^POLARIS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(myCode)) return new Response(JSON.stringify({ ok: false, error: 'Invalid myCode format' }), { status: 400, headers: corsHeaders })
        if (!/^POLARIS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(friendCode)) return new Response(JSON.stringify({ ok: false, error: 'Invalid friendCode format' }), { status: 400, headers: corsHeaders })
        // Prevent self-removal
        if (myCode === friendCode) return new Response(JSON.stringify({ ok: false, error: 'Cannot remove yourself' }), { status: 400, headers: corsHeaders })
        // Remove from myCode's list
        let myFriendsRaw = await kv.get(`friends:${myCode}`)
        let myFriends = myFriendsRaw ? JSON.parse(myFriendsRaw) : []
        if (myFriends.includes(friendCode)) {
          myFriends = myFriends.filter(c => c !== friendCode)
          await kv.put(`friends:${myCode}`, JSON.stringify(myFriends))
        }
        // Remove from friendCode's list
        let friendFriendsRaw = await kv.get(`friends:${friendCode}`)
        let friendFriends = friendFriendsRaw ? JSON.parse(friendFriendsRaw) : []
        if (friendFriends.includes(myCode)) {
          friendFriends = friendFriends.filter(c => c !== myCode)
          await kv.put(`friends:${friendCode}`, JSON.stringify(friendFriends))
        }
        // Clean up pending request markers
        await kv.delete(`request:${myCode}:${friendCode}`)
        await kv.delete(`request:${friendCode}:${myCode}`)
        // Remove from pending lists
        let myPendingRaw = await kv.get(`pending:${myCode}`)
        let myPending = myPendingRaw ? JSON.parse(myPendingRaw) : []
        myPending = myPending.filter(c => c !== friendCode)
        await kv.put(`pending:${myCode}`, JSON.stringify(myPending))
        let friendPendingRaw = await kv.get(`pending:${friendCode}`)
        let friendPending = friendPendingRaw ? JSON.parse(friendPendingRaw) : []
        friendPending = friendPending.filter(c => c !== myCode)
        await kv.put(`pending:${friendCode}`, JSON.stringify(friendPending))
        // Clean up incoming lists both ways
        const myIncomingRaw = await kv.get(`incoming:${myCode}`)
        const myIncoming = myIncomingRaw ? JSON.parse(myIncomingRaw) : []
        await kv.put(`incoming:${myCode}`, JSON.stringify(myIncoming.filter(c => c !== friendCode)))
        const friendIncomingRaw = await kv.get(`incoming:${friendCode}`)
        const friendIncoming = friendIncomingRaw ? JSON.parse(friendIncomingRaw) : []
        await kv.put(`incoming:${friendCode}`, JSON.stringify(friendIncoming.filter(c => c !== myCode)))
        return new Response(JSON.stringify({ ok: true, removedFromBoth: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }
// List confirmed friends
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

    // Send a friend request
    if (path === '/v1/friends/request' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const myCode = String(body.myCode || '').trim().toUpperCase()
        const friendCode = String(body.friendCode || '').trim().toUpperCase()
        if (!myCode || !friendCode) return new Response(JSON.stringify({ ok: false, error: 'myCode and friendCode required' }), { status: 400, headers: corsHeaders })
        if (myCode === friendCode) return new Response(JSON.stringify({ ok: false, error: 'Cannot add yourself' }), { status: 400, headers: corsHeaders })
        // Check if already friends
        const friendsRaw = await kv.get(`friends:${myCode}`)
        const friends = friendsRaw ? JSON.parse(friendsRaw) : []
        if (friends.includes(friendCode)) return new Response(JSON.stringify({ ok: false, error: 'Already friends' }), { status: 400, headers: corsHeaders })
        // Check if already has pending request
        const pendingRaw = await kv.get(`pending:${myCode}`)
        const pending = pendingRaw ? JSON.parse(pendingRaw) : []
        if (pending.includes(friendCode)) return new Response(JSON.stringify({ ok: false, error: 'Request already sent' }), { status: 400, headers: corsHeaders })
        // Create request
        await kv.put(`request:${myCode}:${friendCode}`, JSON.stringify({ myCode, friendCode, createdAt: Date.now(), status: 'pending' }))
        // Track the sender's outgoing requests...
        pending.push(friendCode)
        await kv.put(`pending:${myCode}`, JSON.stringify(pending))
        // ...and the recipient's incoming requests so they can list them.
        const incomingRaw = await kv.get(`incoming:${friendCode}`)
        const incoming = incomingRaw ? JSON.parse(incomingRaw) : []
        if (!incoming.includes(myCode)) incoming.push(myCode)
        await kv.put(`incoming:${friendCode}`, JSON.stringify(incoming))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // Respond to a friend request (accept or decline)
    if (path === '/v1/friends/respond' && request.method === 'POST') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const body = await request.json()
        const myCode = String(body.myCode || '').trim().toUpperCase()
        const friendCode = String(body.friendCode || '').trim().toUpperCase()
        const action = String(body.action || '').trim().toLowerCase()
        if (!myCode || !friendCode || !action) return new Response(JSON.stringify({ ok: false, error: 'myCode, friendCode, and action required' }), { status: 400, headers: corsHeaders })
        if (action !== 'accept' && action !== 'decline') return new Response(JSON.stringify({ ok: false, error: 'action must be accept or decline' }), { status: 400, headers: corsHeaders })
        // Check if request exists
        const reqRaw = await kv.get(`request:${friendCode}:${myCode}`)
        if (!reqRaw) return new Response(JSON.stringify({ ok: false, error: 'No pending request found' }), { status: 404, headers: corsHeaders })
        if (action === 'accept') {
          // Add as confirmed friend both ways
          // Add friendCode to myCode's friends list
          let myFriendsRaw = await kv.get(`friends:${myCode}`)
          let myFriends = myFriendsRaw ? JSON.parse(myFriendsRaw) : []
          if (!myFriends.includes(friendCode)) myFriends.push(friendCode)
          await kv.put(`friends:${myCode}`, JSON.stringify(myFriends))

          // Add myCode to friendCode's friends list
          let friendFriendsRaw = await kv.get(`friends:${friendCode}`)
          let friendFriends = friendFriendsRaw ? JSON.parse(friendFriendsRaw) : []
          if (!friendFriends.includes(myCode)) friendFriends.push(myCode)
          await kv.put(`friends:${friendCode}`, JSON.stringify(friendFriends))
        }
        // The request is resolved: delete it and clear both tracking lists.
        await kv.delete(`request:${friendCode}:${myCode}`)
        // Sender's outgoing list
        const pendingRaw = await kv.get(`pending:${friendCode}`)
        const pending = pendingRaw ? JSON.parse(pendingRaw) : []
        await kv.put(`pending:${friendCode}`, JSON.stringify(pending.filter(c => c !== myCode)))
        // Recipient's incoming list
        const incomingRaw = await kv.get(`incoming:${myCode}`)
        const incoming = incomingRaw ? JSON.parse(incomingRaw) : []
        await kv.put(`incoming:${myCode}`, JSON.stringify(incoming.filter(c => c !== friendCode)))
        return new Response(JSON.stringify({ ok: true, action }), { headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 400, headers: corsHeaders })
      }
    }

    // List pending friend requests
    if (path === '/v1/friends/requests' && request.method === 'GET') {
      if (!kv) return new Response(JSON.stringify({ ok: false, error: 'KV not configured' }), { status: 500, headers: corsHeaders })
      try {
        const code = String(url.searchParams.get('code') || '').trim().toUpperCase()
        if (!code) return new Response(JSON.stringify({ ok: false, error: 'code required' }), { status: 400, headers: corsHeaders })
        const incomingRaw = await kv.get(`incoming:${code}`)
        const incoming = incomingRaw ? JSON.parse(incomingRaw) : []
        const requests = []
        for (const senderCode of incoming) {
          const reqRaw = await kv.get(`request:${senderCode}:${code}`)
          if (!reqRaw) continue
          const req = JSON.parse(reqRaw)
          const infoRaw = await kv.get(`friend:${senderCode}`)
          const info = infoRaw ? JSON.parse(infoRaw) : {}
          requests.push({ code: senderCode, name: info.name || senderCode, createdAt: req.createdAt ?? 0 })
        }
        return new Response(JSON.stringify({ requests }), { headers: corsHeaders })
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