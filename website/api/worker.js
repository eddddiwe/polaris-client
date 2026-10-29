// Cloudflare Worker for Polaris Launcher API
// Deploy: wrangler deploy
// Endpoints:
//   GET /v1/version  → { version, url, sha256, minVersion, changelog }
//   GET /v1/announcements → { announcements: [...] }
//   POST /v1/telemetry → accept crash reports (opt-in)

const REPO = 'eddddiwe/polaris-client'
const CURRENT_VERSION = '0.3.4'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers
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
        // Fetch latest release from GitHub
        const ghRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Polaris-API' }
        })
        const gh = await ghRes.json()
        const latestVersion = (gh.tag_name || '').replace(/^v/, '')
        const asset = (gh.assets || []).find(a => a.name.endsWith('.exe')) || (gh.assets || [])[0]

        return new Response(JSON.stringify({
          version: latestVersion || CURRENT_VERSION,
          url: asset?.browser_download_url || `https://github.com/${REPO}/releases/latest`,
          sha256: '', // TODO: compute from release asset
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
        announcements: [
          // Add announcements here
          // { id: '1', title: 'Welcome', message: '...', type: 'info', expires: '2026-12-31' }
        ],
        minVersion: '0.3.0',
        killSwitch: false,
      }), { headers: corsHeaders })
    }

    // Telemetry (opt-in)
    if (path === '/v1/telemetry' && request.method === 'POST') {
      try {
        const body = await request.json()
        // Store in KV or log — for now just accept
        console.log('Telemetry received:', JSON.stringify(body).substring(0, 500))
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ ok: false }), { status: 400, headers: corsHeaders })
      }
    }

    // Health check
    if (path === '/health' || path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'polaris-api' }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders })
  }
}
