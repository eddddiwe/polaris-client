import AdmZip from 'adm-zip'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installJavaArchive } from '../src/core/java'

const javaName = process.platform === 'win32' ? 'java.exe' : 'java'

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'polaris-java-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function writeZip(path: string, files: [name: string, contents: string][]): void {
  const zip = new AdmZip()
  for (const [name, contents] of files) zip.addFile(name, Buffer.from(contents))
  zip.writeZip(path)
}

describe('installJavaArchive', () => {
  it('returns the verified runtime and ignores an unrelated stale directory', async () => {
    await withTempDir(async (dir) => {
      const archive = join(dir, 'java.zip')
      writeZip(archive, [
        [`jdk-21.0.5/bin/${javaName}`, 'java'],
        ['jdk-21.0.5/release', 'JAVA_VERSION="21.0.5"']
      ])
      const destination = join(dir, 'temurin-21')
      await mkdir(join(destination, 'jdk-1.8.0-partial'), { recursive: true })

      const home = await installJavaArchive(archive, destination)

      expect(home).toBe(join(destination, 'jdk-21.0.5'))
      expect(await readdir(join(home, 'bin'))).toContain(javaName)
    })
  })

  it('rejects an archive without a java executable and leaves no partial install', async () => {
    await withTempDir(async (dir) => {
      const archive = join(dir, 'java.zip')
      writeZip(archive, [['jdk-21.0.5/README.txt', 'not a runtime']])
      const destination = join(dir, 'temurin-21')

      await expect(installJavaArchive(archive, destination)).rejects.toThrow(/usable java executable/)
      expect(await readdir(destination)).toEqual([])
    })
  })

  it('cleans up when extraction fails midway', async () => {
    await withTempDir(async (dir) => {
      const archive = join(dir, 'java.zip')
      // The second entry cannot be written inside the file created by the first.
      writeZip(archive, [
        ['jdk-21/bin', 'blocker'],
        ['jdk-21/bin/java', 'java']
      ])
      const destination = join(dir, 'temurin-21')

      await expect(installJavaArchive(archive, destination)).rejects.toThrow()
      expect(await readdir(destination)).toEqual([])
      await expect(readdir(`${destination}.tmp`)).rejects.toThrow()
    })
  })
})
