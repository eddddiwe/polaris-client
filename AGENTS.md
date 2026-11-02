# Polaris Client — agent instructions

## Mandatory code-review gate

Every change to product code, the Worker, build scripts, bundled mods, or packaging must pass this gate **before commit or release**:

1. **Implement and self-check** — run `npm run typecheck`, `npm test`, and the relevant build. Never skip a failing check.
2. **Two independent subagent reviews** — launch two fresh reviewers with only the diff and relevant repo context, not the full conversation:
   - **Reviewer A — correctness:** regressions, compatibility, edge cases, data loss, migration, tests.
   - **Reviewer B — security:** auth/authorization, injection, path traversal, supply chain, privacy, abuse, updater trust, Electron hardening.
   Each reviewer must cite files/lines and return **PASS/FAIL** with blocking findings and a concrete fix.
3. **Fix and re-review** — resolve blocking findings, then run both reviewers again. A reviewer may pass with non-blocking notes, but those notes must be recorded.
4. **Code arena** — run the final diff through at least **two independent reviewer agents/models** with a shared rubric: correctness, security, compatibility, tests, UX. Record each score (1–5), the strongest dissent, and the consensus. Do not ship while a blocking finding is unresolved. If paid models are unavailable, use free/local reviewers and state the limitation; do not silently skip the arena.
5. **Verify again** — rerun typecheck, tests, and the build. For release changes, exercise the installer/update path end to end.
6. **Commit only after the gate passes.** Keep security findings private until a fix ships.

Full rubric and reviewer brief: [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md).

## Security-sensitive areas

Treat changes here as requiring the full security review:

- `src/main/**` — IPC, updater, scheduled task, shell/`openPath`, window/navigation policy.
- `src/preload/**` — the `window.polaris` API surface.
- `src/core/**` — downloads, hashes, zip/modpack extraction, accounts/tokens, Java, launch arguments.
- `website/api/worker.js` — friends, presence, update metadata, KV.
- `src/renderer/index.html` — CSP and renderer trust boundary.
- `resources/mods/**` and `build/**` — bundled mods, installer, licensing.
- `package.json` — Electron version, dependencies, build/NSIS config.

## Reporting vulnerabilities

Do not open a public issue for an unpatched vulnerability. Follow [SECURITY.md](SECURITY.md).
