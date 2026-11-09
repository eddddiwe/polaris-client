import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const helperSource = fileURLToPath(new URL('../resources/update-helper.ps1', import.meta.url))

function runHelper(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', args, { stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? -1))
  })
}

describe.skipIf(process.platform !== 'win32')('update helper failure handling', () => {
  it('cleans up the handoff and relaunches the launcher when the digest does not match', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-update-helper-'))
    try {
      // Use a unique task name so a test run can never delete a real
      // PolarisClientUpdate task. The rest of the helper is unchanged.
      const taskName = `PolarisClientUpdateTest-${process.pid}`
      const source = await readFile(helperSource, 'utf8')
      expect(source).toContain('$taskName = "PolarisClientUpdate"')
      const helper = join(dir, 'update-helper.ps1')
      await writeFile(helper, source.replace('$taskName = "PolarisClientUpdate"', `$taskName = "${taskName}"`), 'utf8')

      const installer = join(dir, 'Polaris-Setup-9.9.9.exe')
      await writeFile(installer, 'not a real installer')
      const marker = join(dir, 'relaunched.txt')
      const appExe = join(dir, 'relaunch marker.bat')
      await writeFile(appExe, `@echo off\r\necho relaunched>"${marker}"\r\n`)
      const log = join(dir, 'update-helper.log')
      const taskXml = join(dir, 'task.xml')
      await writeFile(taskXml, '<Task />')

      const exitCode = await runHelper([
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helper,
        '-Installer',
        installer,
        '-Sha256',
        'a'.repeat(64),
        '-ParentPid',
        '2147483647',
        '-AppExe',
        appExe,
        '-LogPath',
        log,
        '-TaskXml',
        taskXml
      ])

      expect(exitCode).toBe(3)
      const logText = await readFile(log, 'utf8')
      expect(logText).toContain('installer hash mismatch')
      expect(logText).toContain('helper finished')
      await expect(access(taskXml)).rejects.toThrow()
      await expect
        .poll(
          async () => {
            try {
              await access(marker)
              return true
            } catch {
              return false
            }
          },
          { timeout: 5000, interval: 100 }
        )
        .toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 20_000)
})
