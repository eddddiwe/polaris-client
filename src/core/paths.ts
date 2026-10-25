import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { vanillaMinecraftRoot } from './vanilla'

export interface Paths {
  root: string
  settings: string
  accounts: string
  instances: string
  versions: string
  libraries: string
  assets: string
  meta: string
  java: string
  cache: string
  logs: string
  downloads: string
}

export function resolveRoot(): string {
  if (process.env.POLARIS_HOME) return process.env.POLARIS_HOME
  const portable = join(process.execPath, '..', 'portable.txt')
  if (existsSync(portable)) return join(process.execPath, '..', 'data')
  return join(app.getPath('appData'), 'Polaris')
}

export function createPaths(root: string): Paths {
  return {
    root,
    settings: join(root, 'settings.json'),
    accounts: join(root, 'accounts.json'),
    instances: join(root, 'instances'),
    versions: join(root, 'versions'),
    libraries: join(root, 'libraries'),
    assets: join(root, 'assets'),
    meta: join(root, 'meta'),
    java: join(root, 'java'),
    cache: join(root, 'cache'),
    logs: join(root, 'logs'),
    downloads: join(root, 'downloads')
  }
}

export function vanillaCacheRoot(): string {
  return vanillaMinecraftRoot()
}
