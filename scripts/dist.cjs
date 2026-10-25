#!/usr/bin/env node
'use strict'

/*
 * Cross-platform packaging entry point.
 *
 *   node scripts/dist.cjs             current platform (Windows NSIS / Linux AppImage)
 *   node scripts/dist.cjs win         Windows NSIS installer
 *   node scripts/dist.cjs win-portable Windows portable exe
 *   node scripts/dist.cjs linux       Linux AppImage
 *
 * The Windows code-sign helper only runs on Windows. Linux and WSL builds go
 * straight to electron-builder, which means a checkout can be packaged with
 * the same command on either platform.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'
const npx = isWindows ? 'npx.cmd' : 'npx'

function run(command, args, label) {
  process.stdout.write(`\n> ${label || [command, ...args].join(' ')}\n`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    // .cmd shims need a shell on Windows. Linux binaries do not.
    shell: isWindows
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function main() {
  const requested = (process.argv[2] || '').toLowerCase()
  const target =
    requested || (isWindows ? 'win' : process.platform === 'linux' ? 'linux' : '')

  if (!['win', 'win-portable', 'linux'].includes(target)) {
    console.error('Unsupported packaging target. Use win, win-portable, or linux on a supported host.')
    process.exit(1)
  }

  run(npm, ['run', 'build'], 'npm run build')

  if (target === 'win' || target === 'win-portable') {
    if (!isWindows) {
      console.error(
        'The Windows installer is built on Windows (or in the Windows GitHub Actions job). ' +
          'On Linux, run npm run dist:linux instead.'
      )
      process.exit(1)
    }
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join('scripts', 'prepare-win-codesign.ps1')
    ])
    run(npx, ['--no-install', 'electron-builder', '--win', target === 'win' ? 'nsis' : 'portable'])
  } else {
    if (process.platform !== 'linux') {
      console.error(
        'Linux artifacts need a Linux host. Use GitHub Actions, native Linux, or WSL2; ' +
          'see docs/BUILDING.md.'
      )
      process.exit(1)
    }
    run(npx, ['--no-install', 'electron-builder', '--linux', 'AppImage'])
  }

  const dist = path.join(root, 'dist')
  if (fs.existsSync(dist)) {
    const files = fs.readdirSync(dist).filter((name) => /\.(exe|AppImage|deb)$/i.test(name))
    if (files.length) {
      console.log('\nArtifacts:')
      for (const file of files) console.log(`  dist/${file}`)
    }
  }
}

main()
