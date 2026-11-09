#!/usr/bin/env node
'use strict'

/*
 * Release metadata consistency check.
 *
 * The auto-updater trusts GitHub release assets by exact name:
 * Polaris-Setup-<version>.exe. This check fails if package.json, the NSIS
 * artifact name, the updater, docs/releases/<version>.md, the site sync script
 * or the CI workflow drift apart.
 *
 *   npm run check:release
 *   node scripts/check-release-metadata.cjs --installer path/to/Polaris-Setup-<version>.exe
 */

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pkg = require(path.join(root, 'package.json'))
const version = String(pkg.version)
const installerName = `Polaris-Setup-${version}.exe`

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

assert.match(version, /^\d+\.\d+\.\d+$/, 'package.json version must be x.y.z')

// On a tag build, the tag must match package.json or the release would publish
// Polaris-Setup-<package version>.exe under a different version's tag.
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${version}`,
    `tag ${process.env.GITHUB_REF_NAME} does not match package.json ${version}`
  )
}

const build = pkg.build ?? {}
assert.equal(
  build.nsis?.artifactName,
  'Polaris-Setup-${version}.${ext}',
  'build.nsis.artifactName must produce Polaris-Setup-<version>.exe'
)
assert.equal(build.publish, null, 'build.publish must stay null; CI publishes via action-gh-release')

const services = read('src/main/services.ts')
assert.ok(
  services.includes('const expectedName = `Polaris-Setup-${latestVersion}.exe`'),
  'the updater must expect Polaris-Setup-<latestVersion>.exe'
)
assert.ok(
  services.includes('/releases/download/v${version}/Polaris-Setup-${version}.exe'),
  'the trusted release URL must use the same Polaris-Setup-<version>.exe asset'
)

const notesPath = path.join('docs', 'releases', `${version}.md`)
assert.ok(fs.existsSync(path.join(root, notesPath)), `missing release notes: ${notesPath}`)
const notes = read(notesPath)
assert.ok(notes.includes(installerName), `${notesPath} must name ${installerName}`)
const hashMatch = notes.match(/\*\*SHA-256:\*\*\s*`([0-9A-Fa-f]{64})`/)
assert.ok(hashMatch, `${notesPath} must publish a SHA-256 for the installer`)

const sync = read('scripts/sync-site-download.cjs')
assert.ok(
  sync.includes('`Polaris-Setup-${pkg.version}.exe`'),
  'sync-site-download.cjs must prefer the package version installer'
)
assert.ok(
  sync.includes("file: 'Polaris-Setup.exe'"),
  'sync-site-download.cjs must publish the stable Polaris-Setup.exe name'
)

const workflow = read('.github/workflows/build.yml')
assert.ok(!workflow.includes('src-tauri'), 'CI must not build the removed Tauri app')
assert.ok(!workflow.includes('tauri-apps'), 'CI must not call the Tauri CLI')
assert.match(workflow, /npm run dist:win/, 'CI must build the Electron NSIS installer')
assert.match(workflow, /dist\/Polaris-Setup-\*\.exe/, 'CI must upload the updater asset name')
assert.match(workflow, /npm run dist:linux/, 'CI must build the Linux AppImage')

const flag = process.argv.indexOf('--installer')
if (flag !== -1) {
  const installer = process.argv[flag + 1]
  if (!installer) throw new Error('--installer requires a path')
  const resolved = path.resolve(installer)
  if (!fs.existsSync(resolved)) throw new Error(`installer not found: ${resolved}`)
  const actual = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex').toUpperCase()
  assert.equal(actual, hashMatch[1].toUpperCase(), `${resolved} does not match ${notesPath}`)
  console.log(`Installer SHA-256 matches ${notesPath}`)
}

console.log(`Release metadata OK for ${version} (${installerName})`)
