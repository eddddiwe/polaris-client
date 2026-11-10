# PolarisConfig

In-game configuration menu and HUD for Polaris clients. Right Shift opens the
menu while no other screen is focused.

This project was reconstructed from the project's own 1.2.1 shipped jars with
CFR and is now the source of truth for 1.2.2. It intentionally uses reflection
for Minecraft screen and HUD access so one common codebase can support several
mapping eras.

## Layout

- `common/` — settings, UI, HUD, presence and shared reflection.
- `v1211/` — Minecraft 1.21.1–1.21.5 (Yarn / intermediary).
- `v1216/` — Minecraft 1.21.6–1.21.8 (Yarn / void DrawContext text).
- `v1219/` — Minecraft 1.21.9–1.21.11 (Yarn / Click + KeyInput).
- `v261/` — Minecraft 26.1.x (official names).
- `v262/` — Minecraft 26.2 (official names).
- `v26/` — Minecraft 26.3.x (official names).

Fabric API is recommended, not required: the HUD falls back to a no-op when
the API is absent, so bare Fabric instances still launch.

## Build

Run Gradle on JDK 25; the 1.21.x modules target Java 21 and the 26.x modules
target Java 25. The wrapper pins Gradle 9.8.2:

```bash
./gradlew :v1211:build :v1216:build :v1219:build :v261:build :v262:build :v26:build
```

Outputs (the root `syncMods` task copies them into `resources/mods`):

- `v1211/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2.jar`
- `v1216/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2-1216.jar`
- `v1219/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2-modern.jar`
- `v261/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2-261.jar`
- `v262/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2-262.jar`
- `v26/build/libs/polaris-config-1.2.2.jar` → `polaris-config-1.2.2-official.jar`
