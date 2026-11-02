'use strict'

const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

/**
 * Flip Electron's hardening fuses after electron-builder has assembled the
 * app but before signing. This disables ELECTRON_RUN_AS_NODE, NODE_OPTIONS,
 * CLI inspect flags, and loading an app from outside app.asar.
 */
module.exports = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename
  const platform = context.electronPlatformName
  let executable

  if (platform === 'win32') {
    executable = path.join(context.appOutDir, `${product}.exe`)
  } else if (platform === 'darwin') {
    executable = path.join(context.appOutDir, `${product}.app`, 'Contents', 'MacOS', product)
  } else {
    executable = path.join(
      context.appOutDir,
      context.packager.executableName || product.toLowerCase().replace(/\s+/g, '-')
    )
  }

  const fuses = {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  }

  // Electron validates app.asar integrity on macOS and Windows. The builder
  // embeds the integrity resource before this hook runs.
  if (platform === 'darwin' || platform === 'win32') {
    fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] = true
    // Flipping bytes invalidates the ad-hoc signature on both Intel and
    // Apple Silicon builds. A real signing identity is applied afterwards.
    if (platform === 'darwin') fuses.resetAdHocDarwinSignature = true
  }

  await flipFuses(executable, fuses)
  console.log(`Flipped Electron security fuses on ${executable}`)
}
