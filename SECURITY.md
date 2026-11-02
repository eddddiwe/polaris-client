# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.4.x | Yes |
| 0.3.x and older | No |

Security fixes are shipped in the latest release. If you are on an older version, update first.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for an unpatched vulnerability.

Use GitHub's private vulnerability reporting:

1. Open <https://github.com/eddddiwe/polaris-client/security/advisories/new>.
2. Include the affected version, operating system, a minimal reproduction, the impact, and any suggested fix.
3. Do not include access tokens, passwords, friend codes, or other people's data.

If private advisories are unavailable, open a minimal public issue asking for a private contact channel; do not include exploit details.

## Scope

In scope:

- The Polaris launcher (Electron main/preload/renderer, updater, installer, local data handling).
- The Cloudflare Worker API (friends, presence, version metadata).
- The bundled PolarisConfig Fabric mod.
- The static website.

Out of scope:

- Minecraft, Mojang, Microsoft/Xbox, Modrinth, Fabric, GitHub or Cloudflare services themselves.
- Third-party mods, modpacks or servers.
- Social engineering, physical access, or an attacker who already has the user's OS account and can run code as that user (still report privilege boundaries or cross-user issues).

## What to expect

- Acknowledgement within 7 days where possible.
- Triage and a remediation plan within 30 days for valid reports.
- Credit in the release notes if you want it.
- No bug bounty is offered.

## Safe harbour

Good-faith research is welcome. Do not access other users' data, degrade the service, use paid infrastructure, or test against accounts you do not own. Stop and report if you encounter personal data.
