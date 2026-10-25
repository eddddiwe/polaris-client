import type { PackDefinition } from './types'

/**
 * Curated client packs. Shared between the main process (installation) and the
 * renderer (mock previews and pack presentation) so both agree on membership.
 *
 * Membership follows the mainstream Fabric performance stack (Sodium family,
 * Lithium, Krypton, ModernFix, C2ME…). Version matching happens at install
 * time: anything without a release for the instance's exact Minecraft version
 * is skipped, never force-installed.
 */
export const PACKS: PackDefinition[] = [
  {
    id: 'performance',
    name: 'Performance Core',
    tagline: 'Frame time first',
    description:
      'The rendering and game-logic stack: Sodium, Lithium, FerriteCore, Entity Culling, ImmediatelyFast, ModernFix, Krypton, BadOptimizations, C2ME, Exordium, Cull Less Leaves, Dynamic FPS and ThreadTweak. Nvidium is added automatically on NVIDIA GPUs. Unsupported versions are skipped, never force-installed.',
    color: '#7c5cff',
    recommended: true,
    target: 'client',
    mods: [
      { slug: 'fabric-api', name: 'Fabric API', note: 'Loader API required by most Fabric mods' },
      { slug: 'sodium', name: 'Sodium', note: 'Modern renderer — the largest single FPS gain' },
      { slug: 'sodium-extra', name: 'Sodium Extra', note: 'Extra video options: animations, particles, fog' },
      { slug: 'reeses-sodium-options', name: "Reese's Sodium Options", note: 'Searchable Sodium settings screen' },
      { slug: 'lithium', name: 'Lithium', note: 'Physics, AI and tick optimizations' },
      { slug: 'ferrite-core', name: 'FerriteCore', note: 'Lower heap usage, shorter GC pauses' },
      { slug: 'entityculling', name: 'Entity Culling', note: 'Skips hidden entities and block entities' },
      { slug: 'immediatelyfast', name: 'ImmediatelyFast', note: 'Faster HUD, text, maps and item rendering' },
      { slug: 'exordium', name: 'Exordium', note: 'Caps HUD rendering to a separate frame budget' },
      { slug: 'modernfix', name: 'ModernFix', note: 'Load time, memory and bug fixes' },
      { slug: 'krypton', name: 'Krypton', note: 'Optimized networking stack' },
      { slug: 'badoptimizations', name: 'BadOptimizations', note: 'Small render-loop and allocation wins' },
      { slug: 'cull-less-leaves', name: 'Cull Less Leaves', note: 'Cheaper leaf rendering at distance' },
      { slug: 'c2me-fabric', name: 'C2ME', note: 'Multithreaded chunk generation and loading' },
      { slug: 'dynamic-fps', name: 'Dynamic FPS', note: 'Throttles rendering while unfocused' },
      { slug: 'threadtweak', name: 'ThreadTweak', note: 'Smoother client and server thread scheduling' },
      { slug: 'language-reload', name: 'Language Reload', note: 'Instant language switching, faster startup' },
      { slug: 'fastanim', name: 'FastAnim', note: 'Faster entity animation math' },
      { slug: 'nvidium', name: 'Nvidium', note: 'NVIDIA-only renderer backend on top of Sodium', requires: 'nvidia' }
    ]
  },
  {
    id: 'qol',
    name: 'Essential QoL',
    tagline: 'Small things, every session',
    description:
      'Mod Menu, Zoomify, Shulker Box Tooltip, BetterF3, YACL, FastQuit and Clumps. No gameplay advantages, just less friction.',
    color: '#22d3ee',
    recommended: true,
    target: 'client',
    mods: [
      { slug: 'modmenu', name: 'Mod Menu', note: 'Browse and configure installed mods' },
      { slug: 'zoomify', name: 'Zoomify', note: 'Smooth zoom with a configurable key' },
      { slug: 'shulkerboxtooltip', name: 'Shulker Box Tooltip', note: 'Preview shulker contents in inventory' },
      { slug: 'betterf3', name: 'BetterF3', note: 'Readable, modular debug screen' },
      { slug: 'yacl', name: 'YACL', note: 'Config library used by modern mods' },
      { slug: 'fastquit', name: 'FastQuit', note: 'Quit to menu without waiting for the world to save' },
      { slug: 'clumps', name: 'Clumps', note: 'Merges XP orbs — fewer entities, less ticking' }
    ]
  },
  {
    id: 'hud',
    name: 'HUD & Poly',
    tagline: 'Streamlined HUD overlay',
    description:
      'A curated open-source HUD stack: EvergreenHUD, PolySprint, PolyNametag and VanillaHUD. Fully configurable in-game.',
    color: '#f472b6',
    recommended: false,
    target: 'client',
    mods: [
      { slug: 'evergreenhud', name: 'EvergreenHUD', note: 'FPS, CPS, keystrokes, coordinates and more' },
      { slug: 'polysprint', name: 'PolySprint', note: 'Toggle sprint and sneak' },
      { slug: 'polynametag', name: 'PolyNametag', note: 'Nametag and player display controls' },
      { slug: 'vanillahud', name: 'VanillaHUD', note: 'Scoreboard, hotbar and HUD tweaks' }
    ]
  },
  {
    id: 'shaders',
    name: 'Visuals',
    tagline: 'Iris shader support',
    description:
      'Iris Shaders for Sodium-compatible shader packs, plus Continuity for connected textures and PolyBlur for motion blur. Expect a real frame cost.',
    color: '#fbbf24',
    recommended: false,
    target: 'client',
    mods: [
      { slug: 'iris', name: 'Iris Shaders', note: 'Shader pack loader built on Sodium' },
      { slug: 'continuity', name: 'Continuity', note: 'Connected textures and emissive blocks' },
      { slug: 'polyblur', name: 'PolyBlur', note: 'Configurable motion blur' }
    ]
  },
  {
    id: 'server',
    name: 'Server Performance',
    tagline: 'Tick budget for the whole crew',
    description:
      'The server-side stack: Lithium, Krypton, FerriteCore, ModernFix, C2ME, Very Many Players, ServerCore, ThreadTweak, Clumps and Fabric API. Installed into dedicated-server instances from Polaris.',
    color: '#34d399',
    recommended: true,
    target: 'server',
    mods: [
      { slug: 'fabric-api', name: 'Fabric API', note: 'Loader API required by most Fabric mods' },
      { slug: 'lithium', name: 'Lithium', note: 'Physics, AI, ticking and worldgen optimizations' },
      { slug: 'krypton', name: 'Krypton', note: 'Optimized networking stack' },
      { slug: 'ferrite-core', name: 'FerriteCore', note: 'Lower heap usage, shorter GC pauses' },
      { slug: 'modernfix', name: 'ModernFix', note: 'Load time, memory and bug fixes' },
      { slug: 'c2me-fabric', name: 'C2ME', note: 'Multithreaded chunk generation and loading' },
      { slug: 'vmp-fabric', name: 'Very Many Players', note: 'Scales tick and player handling for big servers' },
      { slug: 'servercore', name: 'ServerCore', note: 'Mob spawn/despawn and world tick optimizations' },
      { slug: 'threadtweak', name: 'ThreadTweak', note: 'Smoother server thread scheduling' },
      { slug: 'clumps', name: 'Clumps', note: 'Merges XP orbs — fewer entities to tick' }
    ]
  }
]

export function packById(id: string): PackDefinition | undefined {
  return PACKS.find((pack) => pack.id === id)
}

/** Packs offered for a given instance kind. */
export function packsFor(kind: 'game' | 'server' | undefined): PackDefinition[] {
  const target = kind === 'server' ? 'server' : 'client'
  return PACKS.filter((pack) => (pack.target ?? 'client') === target)
}
