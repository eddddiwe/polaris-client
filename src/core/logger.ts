import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

type Level = 'info' | 'warn' | 'error' | 'debug'

export class Logger {
  private stream?: WriteStream

  constructor(private dir: string, private scope = 'polaris', openSink = true) {
    if (!openSink) return
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
    // Children write through the parent's sink. Opening a second stream for
    // launcher.log here used to leak one file handle per child, because the
    // fresh stream was replaced immediately and never closed.
    const logger = new Logger(this.dir, `${this.scope}:${scope}`, false)
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
    // Error fields are non-enumerable, so plain JSON.stringify turns the most
    // useful diagnostic value into "{}". Emit only name/message/stack; other
    // fields (for example child_process spawnargs) can contain credentials.
    return JSON.stringify(value, (_key, item: unknown) =>
      item instanceof Error
        ? { name: item.name, message: item.message, stack: item.stack }
        : item
    )
  } catch {
    return String(value)
  }
}

export function logFileFor(pathsLogs: string): string {
  const file = join(pathsLogs, 'launcher.log')
  return existsSync(file) ? file : file
}
