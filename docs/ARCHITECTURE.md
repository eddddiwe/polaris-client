# Architecture

Polaris is an Electron application with a Node.js core, a narrow preload bridge, and a React
renderer. Game installation, authentication, downloads and process control stay in the main
process. The renderer never receives filesystem or shell access directly.

## Process model

| Layer | Location | Responsibility |
| --- | --- | --- |
| Main | `src/main` | Window lifecycle, IPC registration, services, launcher discipline |
| Core | `src/core` | Mojang/Fabric installation, launch arguments, Modrinth, performance, accounts |
| Preload | `src/preload` | `contextBridge` API surface; one function per IPC channel |
| Renderer | `src/renderer` | React UI, navigation, appearance/cosmetics surfaces, mock data for browser previews |
| Shared | `src/shared` | TypeScript types, IPC names, curated packs, cosmetics catalog, appearance presets |

Browser window settings:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- navigation is blocked except for the loaded app URL
- `window.open` is denied; HTTP(S) links are passed to the system browser
- all IPC arguments that become paths are validated (`assertSafeSegment`, basename checks)

## Startup

`AppServices` constructs the stores and core services, then starts asynchronous preparation:

1. Resolve the data root (`POLARIS_HOME`, portable mode on Windows, `%APPDATA%\Polaris` on
   Windows, or `~/.config/Polaris` on Linux).
2. Load `settings.json` and `accounts.json`.
3. Enumerate instance directories and read each `instance.json`.
4. Scan hardware (CPU threads, GPU, RAM) and detect Java runtimes.
5. Expose a bootstrap snapshot over IPC. The renderer's provider subscribes to launch, progress,
   account and log events and refreshes summaries after mutations.

Each instance has an isolated directory under `instances/<id>/` with `mods/`, `logs/`, saves and
its own `options.txt`. Shared libraries, assets, version metadata and Java runtimes are stored at
the data-root level.

## Installation

`src/core/install.ts` installs a version into the shared root:

1. Fetch the Mojang version manifest and the selected version JSON.
2. For Fabric, fetch the loader profile from the Fabric meta API and merge it over the parent
   version with `mergeVersions` (deduplicating Maven coordinates, concatenating arguments and
   inheriting the parent's Java requirement).
3. Resolve libraries and natives with platform rules, including legacy Maven layouts and
   architecture aliases.
4. Resolve the asset index and individual assets.
5. Download missing artifacts with SHA-1 verification and bounded concurrency.
6. If `mirrorVanillaCache` is enabled, try to hard-link matching files from the official
   `.minecraft` cache before downloading. Hard links share disk blocks and survive deletion of the
   other path on NTFS.
7. Extract native libraries into the version's natives directory.

Downloads are serialized through a downloader with progress events. Partial files are written to
temporary paths and promoted only after verification.

## Launch lifecycle

`src/core/launch.ts` and the launch service coordinate a session:

1. Validate the instance, check that no other session is running, and resolve Java 25/21/17 based
   on the version requirements and settings. The launch slot is single: a game and a dedicated
   server cannot both run from the same Polaris data root.
2. Install missing game files and loader metadata.
3. Refresh Microsoft credentials if they are close to expiry.
4. Build the classpath and substitute launch placeholders (`${auth_player_name}`, UUID, assets
   root, natives directory, window size, etc.).
5. Build JVM arguments from the instance preset (Aikar, low-latency G1, ZGC, or custom) and
   Minecraft arguments from the version JSON. `-XX:+ZGenerational` is emitted only for Java 21–22;
   duplicate GC pause flags are never emitted.
6. Spawn the game detached from the launcher's console, writing combined stdout/stderr into
   `instances/<id>/logs/latest.log`.
7. Emit `game-started`; the main process optionally minimizes the window and sets the launcher to
   below-normal priority.
8. On exit, persist `lastPlayed` and accumulated `playtimeMs` (also the source of cosmetics
   shard accrual), restore priority and window state, then emit `game-exited` and refresh
   summaries.

`finish` awaits the exit persistence callback (with a four-second cap) before emitting the exit
event, preventing the UI from refreshing before the new playtime is written.

Stop uses `taskkill /T /F` on Windows and bounds the wait so a missing process cannot stall the UI.
On Linux and macOS the child receives `SIGTERM`, then `SIGKILL` if it has not exited after ten
seconds. Dedicated servers get a graceful `stop\n` on stdin first. Game output streams are guarded
against EPIPE; the launcher must survive a closed console or detached parent process.

## Dedicated servers

A server is an instance with `kind: 'server'`, a port and an explicit `eulaAccepted` flag. It
reuses the same installation, mod, launch, logging and playtime pipeline as a game, but omits the
render/game-UI advice that makes no sense on a headless box. The server and game share the single
launch slot. Stop writes `stop\n` to the server console and waits for a clean exit; the hard-kill
path remains a bounded fallback. Servers are local-only: there is no remote panel, multi-user
management or port-forwarding service.

## Performance policy

`src/core/performance.ts` converts hardware into a plan:

- Tiers: entry, mainstream, high, enthusiast (based on GPU score and system resources). Tier
  shifts render distance by −2/0/+2/+4 chunks and feeds the recommended memory and JVM choices.
- Linux GPU names come from `lspci -mm`, with `nvidia-smi` as a fallback when pciutils is absent.
  macOS uses `system_profiler`; Windows uses CIM. Any detection failure degrades to an unknown
  GPU and the CPU/RAM heuristics instead of blocking startup.
- Recommended heap: 3 GB for 8 GB systems, 4 GB for 12–16 GB, 6 GB for 24 GB, 8 GB otherwise.
- Profiles:
  - **Competitive** — low render/simulation distance, minimal particles, no shadows, 260 FPS cap
    and low-latency G1 flags (`MaxGCPauseMillis=20`).
  - **Balanced** — moderate distance and particles, shadows on, 144 FPS cap, Aikar-style flags.
  - **Quality** — full distance/particles, 120 FPS cap, visual fidelity prioritized.
- All memory overrides are clamped to 1–32 GB. String deduplication is added only when the heap
  is at least 4 GB and the preset is not low-latency.
- Pack mods can carry hardware gates (for example `requires: 'nvidia'`); `evaluatePackMod` decides
  whether a mod is installable, skipped with a reason, or unsupported. Packs also declare a
  `target` of `client` or `server`.
- Applying a plan writes `options.txt` with a timestamped `.bak` backup. The game must be closed.

The JVM builder emits exactly one `-XX:MaxGCPauseMillis` value (a duplicate was fixed during live
testing). The game JVM is separate from the Electron process; lowering launcher priority cannot
slow the game.

## Cosmetics and appearance

`src/shared/cosmetics.ts` is the catalog and price list (12 items: eight badges, four capes).
`src/core/cosmetics.ts` validates ownership and equips, grants 900 starter shards plus 40 per
tracked playtime hour, and persists the balance, owned items and equipped badge/cape in
`settings.json`. The renderer receives the store state through the same typed API as the rest of
the app. There is no checkout, paid currency or economy server; cross-player in-game visibility is
not shipped and would need a shared backend or companion relay/mod.

`src/shared/appearance.ts` defines the wallpaper presets and accent colors. Settings persist the
selected wallpaper, a direct GIF/WebP/MP4 URL, dim/blur tuning, motion preference and accent in
`settings.json`. The renderer applies these through CSS variables; it never loads remote code.

`readGameUi`/`writeGameUi` in `src/core/performance.ts` parse and update only whitelisted vanilla
`options.txt` keys: GUI scale, FOV, brightness, chat opacity, chat scale, screen effects and the
attack indicator. The writer creates a timestamped `.bak` backup and requires the game to be
closed. No UI mod is injected. An animated in-game wallpaper would need a client mod and is
roadmap, not a hidden implementation detail.

## Modpacks

A chosen Modrinth pack release installs CurseForge-style as a new instance through
`createInstanceFromPack`: required and optional files are planned, `.mrpack` overrides are applied
inside the new instance, and the pack reference is persisted for later updates. `.mrpack` support
is Fabric-only; Quilt, Forge and NeoForge packs are rejected rather than half-installed. Packs
declare a client or server target and can gate individual mods on hardware. 

## Mods and curated packs

`ModrinthClient` wraps the public Modrinth v2 API. Search filters by project type, loader and game
version. Version selection prefers stable releases, then the newest compatible build, avoiding
pre-release/beta channels when a stable choice exists.

`ModsService`:

- Maintains a versioned `.polaris-index.json` inside each mods directory, but reconciles it against
  actual JARs so manually dropped mods appear and deleted files disappear.
- Installs required dependencies recursively with a visited set to avoid cycles.
- Rejects mods for vanilla instances at the service layer, not only in the UI.
- Skips a project when the exact version and file already exist.
- Deletes a previous JAR only after the new file is safe, and never deletes a replacement that
  shares the same filename.
- Toggles mods by renaming to `.disabled` and back.
- Curated packs (`src/shared/packs.ts`) apply through the same pipeline. Projects without a
  compatible Fabric build for the instance version are reported as unsupported and are never
  force-installed. Unsupported examples observed on 26.3 include ModernFix and ThreadTweak.

The pack descriptions are data, not install scripts. A pack can therefore gain or lose a mod as
its Modrinth compatibility changes without shipping a new launcher build. See the Modpacks
section above for the new-instance flow and the Fabric-only boundary.

## Accounts

- **Offline** — derives the Java-style v3 UUID from the name (`offlineUuid`), matching common
  offline launcher behavior.
- **Microsoft** — `AuthService` uses the consumers device-code endpoint, requests
  `XboxLive.signin offline_access`, exchanges the token through Xbox Live and XSTS, then obtains a
  Minecraft services token and profile. Tokens are refreshed before launch and written back to the
  account store.
- No OAuth client ID or secret is distributed. The user supplies an Azure public-client ID in
  Settings. This keeps Polaris independent of other launchers' Azure applications.
- Minecraft Services additionally require the Azure application to be authorized by Mojang.
  Microsoft/Xbox authentication can succeed while `POST /authentication/login_with_xbox` returns
  `403 Invalid app registration` for an unapproved app. The official application route is
  <https://aka.ms/AppRegInfo>. Polaris never imports another launcher's client ID or tokens;
  those are application-bound credentials, not portable login data.

Tokens are currently stored as plain JSON in the user's data directory. Production hardening
should move refresh tokens into Electron `safeStorage` or the Windows Credential Manager.

## Renderer

`src/renderer/src/App.tsx` owns boot state, navigation, launch state, toasts, the global confirm
dialog and automatic mod-update checks. Pages are plain React components. The appearance,
cosmetics and in-game panels share the same settings and boot provider as the rest of the UI.
`mock.ts` implements the same API against in-memory data when `window.polaris` is absent, so the UI
can be developed in a normal browser and captured for the site.

Auto-update behavior (disabled by default): when an instance page is opened and no game is
running, Polaris asks Modrinth for compatible versions of installed projects and installs updates
before loading the detail view. A per-session set prevents repeated checks.

## Packaging

`scripts/dist.cjs` is the cross-platform packaging entry point. On Windows it runs the NSIS
installer build through electron-builder; on Linux it builds an AppImage. The Windows helper in
`scripts/prepare-win-codesign.ps1` only prepares the signing-tool cache and is skipped on Linux.
The app bundle includes only `out/main`, `out/preload`, `out/renderer` and `resources`; `out/site`
is deliberately excluded so a built site (and its installer download) cannot be packaged back into
the app.

- Windows: `npm run dist:win` produces `dist/Polaris-Setup-<version>.exe` (per-user NSIS, no
  administrator prompt, unsigned unless a certificate is configured). `dist:win:portable` retains
  the old single-file portable target.
- Linux: `npm run dist:linux` produces an AppImage. Debian packaging is not configured because it
  would require a real package homepage and maintainer email; AppImage is the supported CI path.
- `scripts/sync-site-download.cjs` copies the installer to
  `site/public/downloads/Polaris-Setup.exe`, computes its SHA-256, and writes `latest.json` for the
  site. Vite copies `site/public` into `out/site`, so the deployed site serves the installer and
  manifest together. If the manifest is absent, the page switches its primary call to action to
  the source-build instructions instead of leaving a dead download.
- `.github/workflows/build.yml` builds and tests both platforms and attaches the artifacts to a
  GitHub Release for `v*` tags. The Windows installer is built on Windows; the Linux AppImage is
  built on Ubuntu.

## Showcase site

`site/` is a standalone static HTML/CSS/JavaScript site with no external fonts or libraries and no
imports from the renderer. Vite serves it on port 4180 for local review (`npm run site`) and writes
the production copy to `out/site` (`npm run build:site`). The gallery is captured from the
renderer mock, so it contains no real account or token data. Release copy and performance numbers
are kept honest: the site explains the performance lab from the actual plan logic and labels
unshipped cross-player cosmetics and in-game animated wallpapers as roadmap. The download section
serves the real Windows installer and its SHA-256; Linux is presented as an experimental source
build rather than a hosted binary.

`build/icon.svg` is the source for the original Polaris mark. `scripts/render-icons.cjs`
(`npm run icons`) generates the 1024px PNG and multi-size ICO; the renderer uses
`src/renderer/public/polaris.svg`, and the site uses `site/assets/polaris.svg`.

## Logging and failure handling

- `Logger` writes to the launcher log and console; console/file failures are non-fatal.
- `process.stdout` and `process.stderr` have error listeners to absorb EPIPE when the app is
  launched detached. This fixed a busy loop caused by recursively logging uncaught EPIPE errors.
- The `latest.log` stream is only written while open; stop and quit paths await their cleanup.
- IPC handlers throw typed errors that the renderer converts into toasts; the renderer does not
  receive stack traces or filesystem paths it did not request.

## Testing

`tests/core.test.ts` covers rule evaluation, Maven parsing, version merging, native resolution,
argument flattening, offline UUIDs, JVM flags, profile options, heap clamping, the cosmetics
economy, in-game `options.txt` round-trips and clamping, pack hardware gates and server targets,
ZGC generation gating, `.mrpack` parsing/loader rejection and path guards. Live integration testing
was performed against Minecraft 26.3 with Fabric 0.19.5, Java 25 and a 17-mod performance/QoL
stack, including launch, in-game mod initialization, stop, playtime persistence and log capture.
