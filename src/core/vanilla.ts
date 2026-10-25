import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Location of the official Minecraft launcher's data directory.
 * Used only for opt-in hard-link mirroring of libraries, assets and jars.
 */
export function vanillaMinecraftRoot(): string {
  if (process.env.APPDATA) return join(process.env.APPDATA, '.minecraft')
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'minecraft')
  }
  const home = process.env.HOME || homedir()
  return home ? join(home, '.minecraft') : ''
}
