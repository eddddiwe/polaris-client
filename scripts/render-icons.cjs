// Render build/icon.svg to a 1024px PNG and a multi-size Windows ICO.
// Usage: npm run icons
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const size = 1024
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + directory.length
  entries.forEach((entry, index) => {
    const at = index * 16
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, at)
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, at + 1)
    directory.writeUInt8(0, at + 2)
    directory.writeUInt8(0, at + 3)
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(entry.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.data.length
  })
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: false,
      backgroundThrottling: false
    }
  })
  const html = `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await wait(900)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })

  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  const png = image.toPNG()
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png)

  const sizes = [256, 128, 64, 48, 32, 16]
  const entries = sizes.map((entrySize) => ({
    size: entrySize,
    data: image.resize({ width: entrySize, height: entrySize, quality: 'best' }).toPNG()
  }))
  const ico = buildIco(entries)
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico)
  fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(root, 'icon.png'))
  fs.copyFileSync(path.join(root, 'build', 'icon.ico'), path.join(root, 'icon.ico'))

  console.log(`wrote build/icon.png (${png.length} bytes) and build/icon.ico (${ico.length} bytes)`)
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
