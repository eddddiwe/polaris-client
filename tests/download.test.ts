import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Downloader } from '../src/core/http'
import { Logger } from '../src/core/logger'

describe('Downloader.downloadFile', () => {
  it('follows redirects and writes the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-download-'))
    const server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/file.exe' })
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end('installer')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no listen address')
    try {
      const downloader = new Downloader(1, new Logger(dir))
      const dest = join(dir, 'file.exe')
      await downloader.downloadFile(`http://127.0.0.1:${address.port}/redirect`, dest)
      expect(await readFile(dest, 'utf8')).toBe('installer')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      await rm(dir, { recursive: true, force: true })
    }
  })
})
