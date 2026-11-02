# Polaris Chat

Companion Fabric mod that adds the Polaris friend chat to Minecraft. It opens
with **F9** and talks to the same Worker API as the launcher. The launcher
passes a short-lived `POLARIS_CHAT_TOKEN` and `POLARIS_FRIEND_CODE` to the game
process; the mod never writes those values to disk. The separate PolarisConfig
presence mod still reads the account secret from the environment; that is
pre-existing and unrelated to chat.

## Layout

- `common/` — transport, state and screen layout shared by every version.
- `v1211/` — Minecraft 1.21.1–1.21.8 (Yarn / intermediary).
- `v12111/` — Minecraft 1.21.11+ (Yarn / input event API).
- `v26/` — Minecraft 26.x (deobfuscated official names).

## Build

Gradle itself must run on JDK 25 (Loom 1.19 requires it). The version modules
compile with a Java 21 toolchain for 1.21.x and Java 25 for 26.x. The wrapper
pins Gradle 9.8.2:

```bash
./gradlew :v1211:build :v12111:build :v26:build
```

Outputs:

- `v1211/build/libs/polaris-chat-1.0.0.jar` → `resources/mods/polaris-chat-1.0.0.jar`
- `v12111/build/libs/polaris-chat-1.0.0.jar` → `resources/mods/polaris-chat-1.0.0-modern.jar`
- `v26/build/libs/polaris-chat-1.0.0.jar` → `resources/mods/polaris-chat-1.0.0-official.jar`

The launcher copies the matching jar into each Fabric instance and removes
stale variants.
