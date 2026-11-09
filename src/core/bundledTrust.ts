import { join } from 'node:path'
import { hashFile, pathExists } from './fsutil'

/**
 * A bundled mod is trusted only while its installed bytes match the copy
 * shipped inside the app. Used before handing the game process a credential;
 * a filename or a stale cache entry is not proof.
 */
export async function isVerifiedBundledMod(
  appPath: string,
  instanceDir: string,
  name: string
): Promise<boolean> {
  if (!name) return false
  const installed = join(instanceDir, 'mods', name)
  const bundled = join(appPath, 'resources', 'mods', name)
  try {
    if (!(await pathExists(installed)) || !(await pathExists(bundled))) return false
    const [installedHash, bundledHash] = await Promise.all([
      hashFile(installed, 'sha256'),
      hashFile(bundled, 'sha256')
    ])
    return installedHash === bundledHash
  } catch {
    return false
  }
}
