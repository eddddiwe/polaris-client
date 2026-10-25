# Attribution and clean-room statement

Polaris is an independent project. The implementation in this repository was written for Polaris.
No source code, art, sounds, fonts or other proprietary assets from Dawn or any other launcher are
included.

## Behavioral references

These projects influenced product decisions and public behavior. Their names are used only for
factual attribution; Polaris is not affiliated with or endorsed by them.

| Project | License | How it informed Polaris |
| --- | --- | --- |
| [Prism Launcher](https://prismlauncher.org) | GPL-3.0 | Instance isolation, per-instance Java/memory, mod management concepts, metadata layout |
| [Polyfrost OneLauncher / OneClient](https://github.com/Polyfrost/OneLauncher) | GPL-3.0 | The idea of curated HUD/QoL stacks and a performance-first launcher experience |
| [Dawn](https://dawn.gg) | Proprietary | Clean-room observation of public product behavior: minimizing the launcher, prioritizing the game, automatic performance profiles and resource discipline |
| [REA](https://github.com/morluto/rea) | MIT | Evaluated as a possible agent-driven clean-room research workflow; not a runtime component |

No Dawn installer, ASAR, binary, image, string table or branding was copied. The Dawn reference was
limited to observable behavior. Polaris does not impersonate Dawn, does not use its name as a
product name, and does not link to its proprietary components.

REA is a separate developer tool. It is not a dependency, is not bundled, and no REA source code is
part of Polaris. Any future integration would be documented separately.

## Open-source components

The following is a summary; see [NOTICE](../NOTICE) and `package-lock.json` for the resolved
dependency inventory.

- Electron — MIT
- React and React DOM — MIT
- adm-zip — MIT
- Vite, electron-vite, Vitest, electron-builder, @vitejs/plugin-react — MIT
- TypeScript — Apache-2.0
- Node.js type definitions and DefinitelyTyped packages — MIT

The Polaris source is licensed under GPL-3.0-only. These dependencies are compatible with that
license. Their copyright notices remain with their authors.

## Runtime services and downloads

Polaris is a launcher. It does not ship Minecraft, the Minecraft client, assets, or mods.

- **Mojang / Microsoft** provide Minecraft version metadata, assets and authentication. Use
  requires a legitimately owned Minecraft: Java Edition account. Minecraft is a trademark of
  Mojang Studios.
- **Fabric** provides loader metadata and the Fabric loader/Fabric API at install time. Fabric is
  not bundled.
- **Modrinth** provides project metadata and downloads. Every mod is downloaded from Modrinth at
  the user's request and remains under its own license; curated packs do not relicense mods.
  Modrinth's API terms and the individual projects' licenses apply.
- **Polyfrost mods** referenced by the HUD pack (EvergreenHUD, PolySprint, PolyNametag,
  VanillaHUD) are downloaded from their Modrinth projects and retain their own licenses.

## Trademarks

Minecraft is a trademark of Mojang Studios. Microsoft, Xbox, Xbox Live and Microsoft Entra are
trademarks of Microsoft Corporation. Polyfrost, Prism Launcher, Dawn, Fabric and Modrinth are
trademarks or project names of their respective owners. Polaris is not affiliated with any of
them.
