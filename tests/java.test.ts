import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectJavaHomes, inspectJava } from '../src/core/java'

const isWindows = process.platform === 'win32'
const javaName = isWindows ? 'java.exe' : 'java'

describe('Java runtime layout detection', () => {
  let root = ''
  let flatHome = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'polaris-java-layout-'))
    // Oracle's java8path/javapath and Chocolatey shims have no bin/ level:
    // PATH discovery reports the shim itself, so java[.exe] sits directly
    // in the detected "home" directory.
    flatHome = join(root, 'jdk-21')
    await mkdir(flatHome, { recursive: true })
    await writeFile(join(flatHome, javaName), '')
    if (isWindows) await writeFile(join(flatHome, 'javaw.exe'), '')
  })

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  // The dummy binaries cannot spawn, so inspectJava falls back to the
  // version parsed from the directory name; the old code returned null
  // before it got that far.
  it('inspects a flat shim directory without bin/', async () => {
    expect(await inspectJava(flatHome)).toMatchObject({ major: 21, version: '21' })
  })

  it('inspects an executable path reported by PATH discovery', async () => {
    expect(await inspectJava(join(flatHome, javaName))).toMatchObject({ major: 21, version: '21' })
  })

  it('walks a directory named java instead of treating it as a binary', async () => {
    const container = join(root, 'java')
    const nestedHome = join(container, 'jdk-17')
    await mkdir(join(nestedHome, 'bin'), { recursive: true })
    await writeFile(join(nestedHome, 'bin', javaName), '')
    const homes = await detectJavaHomes([container])
    const normalize = (path: string): string => path.replace(/\\/g, '/').toLowerCase()
    expect(homes.map(normalize)).toContain(normalize(nestedHome))
  })
})
