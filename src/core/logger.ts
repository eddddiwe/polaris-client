import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

type Level = 'info' | 'warn' | 'error' | 'debug'

export class Logger {
  private stream?: WriteStream

  constructor(private dir: string, private scope = 'polaris') {
    try {
      mkdirSync(dir, { recursive: true })
      const stream = createWriteStream(join(dir, 'launcher.log'), { flags: 'a' })
      // A closed stdout or an unwritable log file must never turn into an
      // uncaught-exception loop, so stream failures only disable the sink.
      stream.on('error', () => {
        this.stream = undefined
      })
      this.stream = stream
    } catch {
      this.stream = undefined
    }
  }

  child(scope: string): Logger {
    const logger = new Logger(this.dir, `${this.scope}:${scope}`)
    logger.stream = this.stream
    return logger
  }

  log(level: Level, message: string, extra?: unknown): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.scope}] ${message}${
      extra === undefined ? '' : ` ${safeStringify(extra)}`
    }\n`
    try {
      const trimmed = line.trimEnd()
      if (level === 'error') console.error(trimmed)
      else if (level === 'warn') console.warn(trimmed)
      else console.log(trimmed)
    } catch {
      // The host may close stdio while the client keeps running.
    }
    try {
      if (this.stream && !this.stream.destroyed) this.stream.write(line)
    } catch {
      this.stream = undefined
    }
  }

  info(message: string, extra?: unknown): void {
    this.log('info', message, extra)
  }

  warn(message: string, extra?: unknown): void {
    this.log('warn', message, extra)
  }

  error(message: string, extra?: unknown): void {
    this.log('error', message, extra)
  }

  debug(message: string, extra?: unknown): void {
    if (process.env.POLARIS_DEBUG) this.log('debug', message, extra)
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function logFileFor(pathsLogs: string): string {
  const file = join(pathsLogs, 'launcher.log')
  return existsSync(file) ? file : file
}
