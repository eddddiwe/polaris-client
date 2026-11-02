# Code review and code arena

This is the mandatory gate for product code, the Worker, build scripts, bundled mods and packaging.

## 1. Author self-check

- Run `npm run typecheck`, `npm test`, and the relevant build.
- For installer/updater changes, exercise the update path end to end.
- Keep the diff focused; do not mix unrelated refactors into a security fix.

## 2. Two independent subagent reviews

Launch two **fresh** reviewers with only:

- the diff or commit range,
- the relevant files and constraints,
- the rubric below.

Do not give them the full conversation, and do not tell them the intended verdict. They must cite files and lines.

### Reviewer A — correctness

- Regressions and broken existing flows.
- Compatibility with Minecraft 1.21.x and 26.x, Fabric, Windows and Linux.
- Edge cases, error paths, migration, data loss, race conditions.
- Tests: do they prove the change, or only the happy path?

### Reviewer B — security

- Authentication and authorization, especially the Worker friends/presence API.
- Path traversal, zip handling, symlinks, arbitrary file writes, URL schemes and SSRF.
- Command/PowerShell/NSIS construction and updater trust (signature, hash, TOCTOU).
- Electron: context isolation, sandbox, CSP, navigation/window policy, IPC validation, fuses.
- Secrets/tokens, logs, privacy, rate limiting, abuse and data retention.
- Supply chain: Electron runtime, dependencies, bundled jars, release artifacts.

Each reviewer returns:

```text
PASS or FAIL
Blocking findings: severity, file:line, impact, minimal fix
Non-blocking notes
```

Resolve blocking findings and rerun both reviewers.

## 3. Code arena

Run the final diff through at least **two independent reviewer agents or models** that did not write the code. Give each the same diff and rubric. Ask for:

- a 1–5 score for correctness, security, compatibility, tests and UX,
- blocking findings with file:line,
- the strongest reason the change could fail,
- one thing the other reviewers might miss.

Compare the results and record:

- each score,
- the strongest dissent,
- the consensus verdict,
- any finding rejected as a false positive, with the evidence.

Ship only when no blocking finding remains. If paid models are unavailable, use free or local reviewers and state that in the review record; do not skip the arena.

## 4. Final verification

- `npm run typecheck`
- `npm test`
- the relevant build (`npm run build:site`, `npm run dist:win`, etc.)
- updater/installer verification when packaging changed
- check the staged diff for secrets, tokens, personal paths and generated test artifacts

## 5. Disclosure

Security findings stay private until a fixed release is published. Do not put unpatched exploit details in a public issue, release note or commit message.
