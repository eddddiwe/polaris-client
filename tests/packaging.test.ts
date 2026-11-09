import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const workflow = read('.github/workflows/build.yml')
const pkg = JSON.parse(read('package.json'))

describe('release packaging', () => {
  it('builds the Electron targets instead of the removed Tauri tree', () => {
    expect(workflow).not.toMatch(/src-tauri|@tauri-apps/)
    expect(workflow).toContain('npm run dist:win')
    expect(workflow).toContain('npm run dist:linux')
    expect(pkg.scripts['dev:tauri']).toBeUndefined()
    expect(pkg.scripts['build:tauri']).toBeUndefined()
  })

  it('uploads the updater asset names electron-builder produces', () => {
    for (const artifact of ['dist/Polaris-Setup-*.exe', 'dist/Polaris-Setup-*.exe.blockmap', 'dist/*.AppImage']) {
      expect(workflow).toContain(artifact)
    }
    expect(pkg.build.nsis.artifactName).toBe('Polaris-Setup-${version}.${ext}')
    expect(pkg.scripts['check:release']).toBe('node scripts/check-release-metadata.cjs')
  })
})
