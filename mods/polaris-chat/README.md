# Polaris Chat

Companion Fabric mod that adds the Polaris friend chat to Minecraft. It opens
with **F9** and talks to the same Worker API as the launcher. The launcher
passes a short-lived, chat-scoped `POLARIS_CHAT_TOKEN` and
`POLARIS_FRIEND_CODE` to the game process; the mod never writes those values
to disk. The separate PolarisConfig presence mod receives its own
presence-scoped `POLARIS_FRIEND_SECRET`; neither mod sees the account master
secret.

## Layout

- `common/` — transport, state and screen layout shared by every version.
- `v1211/` — Minecraft 1.21.1–1.21.5 (Yarn / intermediary).
- `v1216/` — Minecraft 1.21.6–1.21.8 (Yarn / void DrawContext text).
- `v1219/` — Minecraft 1.21.9–1.21.10 (Yarn / Click + KeyInput).
- `v12111/` — Minecraft 1.21.11 (Yarn / input event API).
- `v261/` — Minecraft 26.1.x (official names / GLFW keysyms).
- `v262/` — Minecraft 26.2 (official names / GLFW keysyms).
- `v26/` — Minecraft 26.3.x (official names / SDL scancodes).

## Build

Gradle itself must run on JDK 25 (Loom 1.19 requires it). The version modules
compile with a Java 21 toolchain for 1.21.x and Java 25 for 26.x. The wrapper
pins Gradle 9.8.2:

```bash
./gradlew :v1211:build :v1216:build :v1219:build :v12111:build :v261:build :v262:build :v26:build
```

Outputs (the root `syncMods` task copies them into `resources/mods`):

- `v1211/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0.jar`
- `v1216/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-1216.jar`
- `v1219/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-1219.jar`
- `v12111/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-modern.jar`
- `v261/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-261.jar`
- `v262/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-262.jar`
- `v26/build/libs/polaris-chat-1.0.0.jar` → `polaris-chat-1.0.0-official.jar`

The launcher copies the matching jar into each Fabric instance and removes
stale variants.
