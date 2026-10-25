#!/usr/bin/env node
'use strict'

/*
 * Publish the Windows installer with the static site.
 *
 * electron-builder writes dist/Polaris-Setup-<version>.exe. This script copies
 * the current installer to site/public/downloads/Polaris-Setup.exe (a stable
 * URL), writes a small manifest with its size and SHA-256, and leaves both for
 * Vite to copy into out/site/downloads.
 *
 * Run it after `npm run dist:win`, or use `npm run release:win`, which does all
 * three steps: build, sync, and rebuild the site.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pkg = require(path.join(root, 'package.json'))
const distDir = path.join(root, 'dist')
const outDir = path.join(root, 'site', 'public', 'downloads')
const preferred = path.join(distDir, `Polaris-Setup-${pkg.version}.exe`)

function installerCandidates() {
  if (!fs.existsSync(distDir)) return []
  const setup = fs
    .readdirSync(distDir)
    .filter((name) => /^Polaris-Setup-.*\.exe$/i.test(name))
    .map((name) => path.join(distDir, name))
  if (fs.existsSync(preferred)) return [preferred, ...setup.filter((file) => file !== preferred)]
  return setup
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.file)
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function main() {
  const [source] = installerCandidates()
  if (!source) {
    console.error(
      `No NSIS installer found in ${distDir}.\n` +
        `Run "npm run dist:win" on Windows first, then run this script again.`
    )
    process.exit(1)
  }

  const stat = fs.statSync(source)
  if (stat.size < 1024 * 1024) {
    console.error(`${source} is too small to be the installer (${stat.size} bytes).`)
    process.exit(1)
  }

  fs.mkdirSync(outDir, { recursive: true })
  const target = path.join(outDir, 'Polaris-Setup.exe')
  fs.copyFileSync(source, target)

  const hash = await sha256(target)
  const manifest = {
    product: 'Polaris Client',
    version: pkg.version,
    platform: 'Windows 10/11 x64',
    installer: 'NSIS',
    file: 'Polaris-Setup.exe',
    size: stat.size,
    sha256: hash,
    signed: false,
    builtAt: new Date().toISOString(),
    source: path.basename(source)
  }
  fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(path.join(outDir, 'Polaris-Setup.exe.sha256'), `${hash}  Polaris-Setup.exe\n`)

  console.log(`Copied ${path.basename(source)} -> site/public/downloads/Polaris-Setup.exe`)
  console.log(`Size:   ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
  console.log(`SHA256: ${hash}`)
  console.log('Run "npm run build:site" to copy the download into out/site.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
