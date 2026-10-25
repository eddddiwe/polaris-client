# Building Polaris

Polaris is an Electron + React app packaged with electron-builder. The same source builds a
Windows NSIS installer and a Linux AppImage; the Windows path is the primary release target, and
the Linux path is available but still experimental.

## Prerequisites

- **Node.js 22 or newer** and npm 10 or newer.
- **Java** for playing, not for compiling the app: Java 21 is the floor, and Minecraft 26.x needs
  Java 25. The launcher detects Java from `JAVA_HOME`, `PATH`, common package-manager and SDKMAN
  locations, and a custom path in Settings.
- **Windows 10/11 x64** for the Windows installer. NSIS is built on Windows or in the Windows CI
  job; it is not cross-built from Linux.
- **Linux x64** for the AppImage, or WSL2 on Windows. `libfuse2` is needed to run an AppImage on
  distros that do not mount FUSE images by default; it is not needed to build one.

Install dependencies once from the repository root:

```powershell
npm.cmd ci
```

On Linux/WSL use `npm ci`. `npm install` is fine for a local development checkout; `npm ci` is
preferred for reproducible builds.

## Windows installer

On Windows:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run dist:win
```

`dist:win` runs the production bundle, prepares electron-builder's signing-tool cache, and builds
the NSIS installer. Output:

```text
dist/Polaris-Setup-0.3.0.exe
dist/Polaris-Setup-0.3.0.exe.blockmap
dist/win-unpacked/
```

The installer is **per-user**: it does not need an administrator prompt, it lets the user choose
a folder, and it creates desktop and Start menu shortcuts. It is **unsigned** unless you supply a
Windows code-signing certificate, so SmartScreen may warn. Do not tell users a build is signed
when it is not.

A single-file portable executable is still available:

```powershell
npm.cmd run dist:win:portable
```

`npm.cmd run dist` is the cross-platform shortcut: on Windows it builds the NSIS installer; on
Linux it builds the AppImage.

## Publish the installer with the site

The static showcase has a real download action. After building the installer:

```powershell
npm.cmd run release:win
```

That command:

1. builds the NSIS installer,
2. copies it to `site/public/downloads/Polaris-Setup.exe` (stable URL),
3. computes the SHA-256 and writes `site/public/downloads/latest.json` and `.sha256`, and
4. rebuilds `out/site`.

Deploy the entire `out/site` folder, including `downloads/`. The download link is relative, so it
works from a domain root or a subpath. The page reads `downloads/latest.json` for the size and
hash; if the manifest is missing, it changes the primary action to the source-build instructions
instead of leaving a dead link. If your host does not allow large binaries, host the installer on
a release/CDN and point the download link and manifest at that URL.

## Linux AppImage

Build on a Linux machine or in WSL2:

```bash
npm ci
npm run typecheck
npm run test
npm run dist:linux
```

Output:

```text
dist/Polaris-Client-0.3.0-x86_64.AppImage
```

Run it:

```bash
chmod +x dist/Polaris-Client-0.3.0-x86_64.AppImage
./dist/Polaris-Client-0.3.0-x86_64.AppImage
```

If FUSE is unavailable:

```bash
./dist/Polaris-Client-0.3.0-x86_64.AppImage --appimage-extract-and-run
```

Linux notes:

- Install `pciutils` if you want GPU-name detection; without it Polaris falls back to
  `nvidia-smi` when present and otherwise uses an unknown-GPU tier. It does not block launch.
- Java discovery checks `JAVA_HOME`, `JDK_HOME`, `/usr/lib/jvm`, `/usr/lib64/jvm`, `/usr/java`,
  `/opt/java`, `/opt/jdk`, SDKMAN, `~/.jdks`, Gradle JDKs, jlink runtimes and `PATH`. A runtime
  installed by a distro package should be found after a rescan.
- The game and server launch paths use POSIX signals (`SIGTERM`, then `SIGKILL` after ten seconds)
  instead of Windows `taskkill`.
- Linux runtime support is experimental. CI is configured to build the AppImage on Ubuntu, but the
  release has not had the same amount of manual gameplay testing as Windows.
- Debian packaging is not configured: it needs a real project homepage and maintainer email in
  `package.json`, and the project does not invent those. AppImage is the supported Linux artifact.

## WSL2

WSL2 can build and, with WSLg on Windows 11, run the Linux AppImage. Install Node 22 and the
project inside the WSL distribution rather than calling the Windows `npm` binary.

```bash
cd "/mnt/d/path/to/polaris"
npm ci
npm run dist:linux
```

- Build artifacts under `/mnt/d/...` are visible from Windows.
- For a GUI run, use WSLg on Windows 11. Headless WSL without an X/Wayland server cannot show the
  Electron window.
- Do not run `npm run dist:win` from WSL. Use the Windows checkout, a Windows VM, or the GitHub
  Actions Windows job. NSIS packaging expects a Windows host.
- Building under `/mnt/c` or `/mnt/d` is slower than building inside the WSL filesystem. If the
  build is slow or file watching is unreliable, copy the checkout into the WSL home directory.

## GitHub Actions

`.github/workflows/build.yml` runs on manual dispatch and on `v*` tags:

- **Windows job:** typecheck, tests, `npm run dist:win`, uploads `dist/*.exe`.
- **Linux job:** typecheck, tests, `npm run dist:linux`, uploads `dist/*.AppImage`.
- **Release job:** on a tag, downloads both artifact sets and attaches the installer and AppImage
  to a GitHub Release.

A release flow is therefore:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The release assets are the public download source. The static site's bundled installer is built
with `npm run release:win`; if you prefer release assets, point the site's download link at the
release URL and keep the same `latest.json` metadata.

## Artifact summary

| Command | Host | Output |
| --- | --- | --- |
| `npm run dist:win` | Windows | `dist/Polaris-Setup-<version>.exe` (NSIS, per-user, unsigned) |
| `npm run dist:win:portable` | Windows | `dist/Polaris-Client-<version>-x64.exe` (portable) |
| `npm run dist:linux` | Linux / WSL2 | `dist/Polaris-Client-<version>-x86_64.AppImage` |
| `npm run release:win` | Windows | Installer + `site/public/downloads` + `out/site` |
| `npm run build:site` | Any | `out/site` (with whatever is in `site/public`) |

## Troubleshooting

**SmartScreen says Windows protected your PC.** The build is unsigned. Verify the SHA-256 from the
site or `downloads/latest.json`, choose **More info**, then **Run anyway** only if you trust the
file. Signing requires a certificate you control; the project does not ship one.

**`dist:win` refuses to run on Linux.** That is intentional. Use a Windows host or the Windows CI
job for NSIS; use `dist:linux` on Linux.

**The AppImage will not start: FUSE error.** Install `libfuse2` (Debian/Ubuntu) or run with
`--appimage-extract-and-run`.

**No Java runtime found on Linux.** Install a JDK (for example Temurin 21), confirm
`java -version` works in a terminal, then use **Settings → Java → Rescan**. A runtime installed
inside a Flatpak/Snap sandbox may not be visible to the launcher; select the executable manually.

**GPU shows as unknown on Linux.** Install `pciutils` so `lspci -mm` is available. The launcher
still selects a tier from CPU and RAM; an unknown GPU is treated conservatively.

**The site download is missing after a build.** `npm run build:site` only copies what exists in
`site/public`. Run `npm run sync:download` after building the installer, or use
`npm run release:win`. The page will fall back to build instructions when the manifest is absent.

**The installer is too large for the host.** Serve it from a GitHub Release or object storage and
update `site/public/downloads/latest.json` plus the download link. Do not fabricate a hosted URL
that does not resolve.
