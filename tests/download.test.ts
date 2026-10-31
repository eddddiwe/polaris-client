import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { RequestListener } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Downloader } from '../src/core/http'
import { Logger } from '../src/core/logger'

async function withServer(
  handler: RequestListener,
  run: (baseUrl: string, dir: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-download-'))
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no listen address')
  try {
    await run(`http://127.0.0.1:${address.port}`, dir)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    await rm(dir, { recursive: true, force: true })
  }
}

describe('Downloader.downloadFile', () => {
  it('follows redirects and writes the file', async () => {
    await withServer(
      (req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/file.exe' })
          res.end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('installer')
      },
      async (baseUrl, dir) => {
        const downloader = new Downloader(1, new Logger(dir))
        const dest = join(dir, 'file.exe')
        await downloader.downloadFile(`${baseUrl}/redirect`, dest)
        expect(await readFile(dest, 'utf8')).toBe('installer')
      }
    )
  })

  it('rejects a truncated download when the release publishes a size', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('short')
      },
      async (baseUrl, dir) => {
        const downloader = new Downloader(1, new Logger(dir))
        const dest = join(dir, 'installer.exe')
        await expect(
          downloader.downloadFile(`${baseUrl}/installer.exe`, dest, { expectedSize: 100 })
        ).rejects.toThrow(/Incomplete download/)
      }
    )
  })

  it('rejects a download that fails its SHA-256 check', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('installer')
      },
      async (baseUrl, dir) => {
        const downloader = new Downloader(1, new Logger(dir))
        const dest = join(dir, 'installer.exe')
        const digest = createHash('sha256').update('installer').digest('hex')
        await downloader.downloadFile(`${baseUrl}/installer.exe`, dest, { sha256: digest })
        expect(await readFile(dest, 'utf8')).toBe('installer')
        await expect(
          downloader.downloadFile(`${baseUrl}/installer.exe`, dest, { sha256: '0'.repeat(64) })
        ).rejects.toThrow(/SHA-256/)
      }
    )
  })

  it('lets concurrent downloads to the same destination finish', async () => {
    const body = 'x'.repeat(16 * 1024)
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end(body)
      },
      async (baseUrl, dir) => {
        const downloader = new Downloader(1, new Logger(dir))
        const dest = join(dir, 'installer.exe')
        await Promise.all([1, 2, 3].map(() => downloader.downloadFile(`${baseUrl}/installer.exe`, dest)))
        expect((await readFile(dest, 'utf8')).length).toBe(body.length)
      }
    )
  })
})
