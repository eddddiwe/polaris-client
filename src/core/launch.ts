import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import readline from 'node:readline'
import os from 'node:os'
import type { Account, InstanceConfig, JavaInfo, LaunchState, Settings } from '../shared/types'
import type { Paths } from './paths'
import type { Installer } from './install'
import type { ServerService } from './server'
import type { AccountStore } from './accounts'
import type { AuthService } from './auth'
import { selectJava } from './java'
import { buildJvmFlags } from './performance'
import { requiredJavaMajor } from './version'
import {
  buildClasspath,
  classpathSeparator,
  flattenArguments,
  legacyArguments,
  substituteAll,
  type VersionJson
} from './version'
import { createRuleContext, defaultFeatures, rulesAllow } from './rules'
import { compactUuid } from './accounts'
import { ensureDir, isSafeSegment, pathExists } from './fsutil'
import type { Logger } from './logger'

export interface LaunchHooks {
  onStarted?: (instanceId: string, pid: number) => void
  onExit?: (instanceId: string, code: number | null, playtimeMs: number) => void | Promise<void>
  onLog?: (instanceId: string, lines: string[]) => void
}

export class LaunchService {
  private state: LaunchState = { instanceId: null, status: 'idle' }
  private child?: ChildProcess
  private listeners = new Set<(state: LaunchState) => void>()
  private logBuffer: string[] = []
  private startedAt = 0
  private finishing = false
  private serverMode = false

  constructor(
    private readonly paths: Paths,
    private readonly installer: Installer,
    private readonly accounts: AccountStore,
    private readonly auth: AuthService,
    private readonly logger: Logger,
    private readonly hooks: LaunchHooks = {}
  ) {}

  onState(listener: (state: LaunchState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): LaunchState {
    return { ...this.state }
  }

  isRunning(instanceId?: string): boolean {
    if (!this.child) return false
    return instanceId ? this.state.instanceId === instanceId && this.state.status === 'running' : this.state.status === 'running'
  }

  private setState(patch: Partial<LaunchState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.getState())
  }

  async launch(instance: InstanceConfig, settings: Settings, javaList: JavaInfo[]): Promise<LaunchState> {
    if (this.child) throw new Error('A game is already running.')
    const stored = this.accounts.activeStored()
    if (!stored) throw new Error('Add a Minecraft account first (offline mode works instantly).')

    this.setState({
      instanceId: instance.id,
      status: 'preparing',
      message: 'Resolving game files',
      pid: undefined,
      startedAt: undefined,
      exitCode: undefined
    })

    try {
      this.finishing = false
      this.serverMode = false

      const instanceDir = join(this.paths.instances, instance.id)
      const nativesDir = join(instanceDir, 'natives')
      await ensureDir(nativesDir)

      // Try to load cached install result (skip full install if cached + files present)
      let installed = await this.installer.tryLoadCache(instance, instanceDir)
      if (!installed) {
        installed = await this.installer.install(instance, { mirrorCache: settings.mirrorVanillaCache })
        await this.installer.saveCache(instance, instanceDir, installed)
      }

      const java = selectJava(javaList, installed.javaMajor, instance.javaPath || settings.javaPath)

      // Only extract natives if the dir is empty (skip on re-launch)
      const nativesExist = await pathExists(join(nativesDir, 'liblwjgl.so')).catch(() => false) ||
        await pathExists(join(nativesDir, 'lwjgl.dll')).catch(() => false) ||
        await pathExists(join(nativesDir, 'liblwjgl.dylib')).catch(() => false)
      if (!nativesExist) {
        await this.installer.extractNatives(installed.natives, nativesDir)
      }

      const account = await this.auth.refreshIfNeeded(stored)
      const args = this.buildArguments(instance, settings, installed.version, installed.classpath, installed.assetIndexId, nativesDir, account, java)

      this.setState({ status: 'running', message: `Running on Java ${java.major}`, startedAt: Date.now() })
      const child = spawn(java.path, args, {
        cwd: instanceDir,
        env: { ...process.env, POLARIS_CLIENT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false
      })
      this.child = child
      this.startedAt = Date.now()
      this.logBuffer = []

      try {
        os.setPriority(child.pid as number, os.constants.priority.PRIORITY_ABOVE_NORMAL)
      } catch {
        // priority changes are best-effort
      }

      this.attachLogging(instance, child)
      this.setState({ pid: child.pid, status: 'running', message: 'Minecraft is running' })
      this.hooks.onStarted?.(instance.id, child.pid ?? 0)

      child.once('error', (error) => {
        this.logger.error('Game process error', String(error))
        this.finish(instance, null, error.message, true)
      })
      child.once('exit', (code) => {
        const message = code === 0 ? 'Game closed' : `Game exited with code ${code}`
        this.finish(instance, code, message, code !== 0)
      })

      return this.getState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Launch failed', message)
      this.setState({ status: 'crashed', message })
      throw error
    }
  }

  async launchServer(
    instance: InstanceConfig,
    settings: Settings,
    javaList: JavaInfo[],
    server: ServerService
  ): Promise<{ state: LaunchState; loaderVersion?: string }> {
    if (this.child) throw new Error('A game or server is already running.')

    this.setState({
      instanceId: instance.id,
      status: 'preparing',
      message: 'Preparing server files',
      pid: undefined,
      startedAt: undefined,
      exitCode: undefined
    })

    try {
      this.finishing = false
      this.serverMode = true
      const runtime = await server.ensureRuntime(instance)
      const java = selectJava(javaList, runtime.javaMajor, instance.javaPath || settings.javaPath)
      const instanceDir = join(this.paths.instances, instance.id)

      const args = [
        ...buildJvmFlags(instance.memoryMb, instance.jvmPreset, instance.customJvmArgs, java.major),
        '-jar',
        runtime.jarPath,
        'nogui'
      ]

      this.setState({ status: 'running', message: `Server running on Java ${java.major}`, startedAt: Date.now() })
      const child = spawn(java.path, args, {
        cwd: instanceDir,
        env: { ...process.env, POLARIS_SERVER: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      this.child = child
      this.startedAt = Date.now()
      this.logBuffer = []

      this.attachLogging(instance, child)
      this.setState({ pid: child.pid, status: 'running', message: 'Server is starting' })
      this.hooks.onStarted?.(instance.id, child.pid ?? 0)

      child.once('error', (error) => {
        this.logger.error('Server process error', String(error))
        this.finish(instance, null, error.message, true)
      })
      child.once('exit', (code) => {
        const message = code === 0 ? 'Server stopped' : `Server exited with code ${code}`
        this.finish(instance, code, message, code !== 0)
      })

      return { state: this.getState(), loaderVersion: runtime.loaderVersion }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Server launch failed', message)
      this.setState({ status: 'crashed', message })
      throw error
    }
  }

  /** Write a line to a running server's console (stdin). */
  sendCommand(command: string): void {
    if (!this.serverMode) throw new Error('No server is running.')
    const stdin = this.child?.stdin
    if (!stdin || stdin.destroyed) throw new Error('Server console is not available.')
    stdin.write(`${command.replace(/\r?\n$/, '')}\n`)
  }

  private buildArguments(
    instance: InstanceConfig,
    settings: Settings,
    version: VersionJson,
    classpath: string[],
    assetIndexId: string,
    nativesDir: string,
    account: { name: string; uuid: string; accessToken: string; type: 'offline' | 'microsoft'; clientId?: string; xuid?: string },
    java: JavaInfo
  ): string[] {
    const instanceDir = join(this.paths.instances, instance.id)
    const ctx = createRuleContext(defaultFeatures())
    const allow = (rules: Parameters<typeof rulesAllow>[0]) => rulesAllow(rules, ctx)

    const values: Record<string, string | number> = {
      auth_player_name: account.name,
      version_name: version.id,
      game_directory: instanceDir,
      assets_root: this.paths.assets,
      assets_index_name: assetIndexId,
      auth_uuid: compactUuid(account.uuid),
      auth_access_token: account.accessToken,
      clientid: account.clientId ?? '',
      auth_xuid: account.xuid ?? '',
      user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
      version_type: version.type ?? 'release',
      natives_directory: nativesDir,
      launcher_name: 'Polaris',
      launcher_version: '0.3.0',
      classpath: buildClasspath(classpath),
      classpath_separator: classpathSeparator(),
      library_directory: this.paths.libraries,
      resolution_width: instance.width,
      resolution_height: instance.height
    }

    const jvmEntries = version.arguments?.jvm ?? []
    const gameEntries = version.arguments?.game ?? []
    const versionJvm = flattenArguments(jvmEntries, {
      osName: ctx.osName,
      osVersion: ctx.osVersion,
      arch: ctx.arch,
      features: ctx.features,
      rulesAllow: allow
    })
    const versionGame = gameEntries.length
      ? flattenArguments(gameEntries, {
          osName: ctx.osName,
          osVersion: ctx.osVersion,
          arch: ctx.arch,
          features: ctx.features,
          rulesAllow: allow
        })
      : legacyArguments(version)

    const tuning = buildJvmFlags(instance.memoryMb, instance.jvmPreset, instance.customJvmArgs, java.major)
    const extraJvm = [
      '-Dpolaris.client=true',
      '-Dminecraft.launcher.brand=Polaris',
      '-Dminecraft.launcher.version=0.3.0',
      `-XX:ErrorFile=${join(instanceDir, 'logs', 'hs_err_%p.log')}`,
      '-Dlog4j2.formatMsgNoLookups=true'
    ]
    const extraGame = instance.extraGameArgs ? splitArgs(instance.extraGameArgs) : []

    return [
      ...substituteAll(tuning, values),
      ...substituteAll(extraJvm, values),
      ...substituteAll(versionJvm, values),
      version.mainClass,
      ...substituteAll(versionGame, values),
      ...extraGame
    ]
  }

  private attachLogging(instance: InstanceConfig, child: ChildProcess): void {
    const logDir = join(this.paths.instances, instance.id, 'logs')
    const stream = createWriteStream(join(logDir, 'latest.log'), { flags: 'w' })
    stream.on('error', () => {
      // keep the game running even if the log file cannot be written
    })
    const push = (line: string) => {
      try {
        if (!stream.destroyed && !stream.writableEnded) stream.write(`${line}\n`)
      } catch {
        // ignore late writes after the process exited
      }
      if (this.serverMode && /Done \(.*\)! For help/i.test(line) && this.state.status === 'running') {
        this.setState({ message: 'Server ready — players can connect' })
      }
      this.logBuffer.push(line)
      if (this.logBuffer.length > 4000) this.logBuffer.splice(0, this.logBuffer.length - 4000)
    }

    let pending: string[] = []
    let timer: NodeJS.Timeout | null = null
    const flush = () => {
      if (pending.length === 0) return
      this.hooks.onLog?.(instance.id, pending)
      pending = []
      timer = null
    }

    for (const source of [child.stdout, child.stderr]) {
      if (!source) continue
      const rl = readline.createInterface({ input: source })
      rl.on('line', (line) => {
        push(line)
        pending.push(line)
        if (!timer) timer = setTimeout(flush, 120)
      })
    }
    child.once('exit', () => {
      try {
        stream.end()
      } catch {
        // stream may already be closed
      }
      if (timer) clearTimeout(timer)
      flush()
    })
  }

  private async finish(instance: InstanceConfig, code: number | null, message: string, crashed: boolean): Promise<void> {
    if (this.finishing) return
    this.finishing = true
    const playtimeMs = this.startedAt ? Date.now() - this.startedAt : 0
    // Keep the game in the running state until playtime and lastPlayed are on
    // disk, otherwise the renderer refresh on "exited" reads stale timestamps.
    const pending = this.hooks.onExit?.(instance.id, code, playtimeMs)
    if (pending) {
      try {
        await Promise.race([
          Promise.resolve(pending).catch((error) => {
            this.logger.warn('Game exit hook failed', String(error))
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 4000))
        ])
      } catch (error) {
        this.logger.warn('Game exit hook failed', String(error))
      }
    }
    this.child = undefined
    this.setState({
      status: crashed ? 'crashed' : 'exited',
      exitCode: code,
      message
    })
    this.logger.info(`Game exited: ${message}`)
  }

  async stop(): Promise<void> {
    if (!this.child?.pid) return
    if (this.serverMode && this.child.stdin && !this.child.stdin.destroyed) {
      // Graceful dedicated-server shutdown: let it save worlds, then verify exit.
      try {
        this.child.stdin.write('stop\n')
      } catch {
        // fall through to the hard kill below
      }
      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 15_000)
        this.child?.once('exit', () => {
          clearTimeout(timer)
          resolve(true)
        })
      })
      if (exited) return
    }
    const pid = this.child.pid
    this.logger.info(`Stopping process ${pid}`)
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      await new Promise<void>((resolve) => {
        const done = (): void => resolve()
        killer.once('exit', done)
        killer.once('error', done)
        setTimeout(done, 5000)
      })
    } else {
      const child = this.child
      if (!child) return
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 10_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve(true)
        })
      })
      if (!exited) {
        this.logger.warn(`Process ${pid} ignored SIGTERM; sending SIGKILL`)
        try {
          child.kill('SIGKILL')
        } catch {
          // it may have exited between the timeout and this call
        }
      }
    }
  }

  async tailLogs(instanceId: string, lines = 200): Promise<string[]> {
    if (!isSafeSegment(instanceId)) throw new Error('Invalid instance id')
    try {
      const raw = await readFile(join(this.paths.instances, instanceId, 'logs', 'latest.log'), 'utf8')
      return raw.split(/\r?\n/).slice(-lines)
    } catch {
      return []
    }
  }
}

function splitArgs(input: string): string[] {
  const result: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input))) result.push(match[1] ?? match[2] ?? match[3])
  return result
}

export function readLogHead(path: string, bytes = 4096): string {
  try {
    return readFileSync(path, 'utf8').slice(0, bytes)
  } catch {
    return ''
  }
}

export type { Account }
