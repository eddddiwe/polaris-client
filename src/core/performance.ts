import { execFile } from 'node:child_process'
import os from 'node:os'
import { copyFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type {
  GameUiApplyResult,
  GameUiOptions,
  GameUiSnapshot,
  HardwareInfo,
  JavaInfo,
  JvmPresetId,
  PerfPlan,
  PerfProfileId
} from '../shared/types'
import { pathExists, writeTextAtomic } from './fsutil'

const execFileAsync = promisify(execFile)

export async function detectHardware(java: JavaInfo[]): Promise<HardwareInfo> {
  const cpu = os.cpus()[0]?.model?.trim() ?? 'Unknown CPU'
  const threads = os.cpus().length
  const physicalCores = Math.max(1, Math.round(threads / 2))
  const ramGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const gpu = await detectGpu()
  const tier = classify(cpu, gpu, threads, ramGb)
  return {
    cpu,
    threads,
    physicalCores,
    ramGb,
    gpu: gpu.name,
    gpuVendor: gpu.vendor,
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    tier,
    recommendedMemoryMb: recommendMemory(ramGb, tier),
    java,
    detectedAt: Date.now()
  }
}

async function detectGpu(): Promise<{ name: string; vendor: string }> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1 Name | ConvertTo-Json -Compress'
        ],
        { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }
      )
      const parsed = JSON.parse(stdout.trim() || '{}') as { Name?: string }
      const name = parsed.Name?.trim() || 'Unknown GPU'
      return { name, vendor: vendorOf(name) }
    } catch {
      // fall through
    }
  }
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 8000 })
      const parsed = JSON.parse(stdout) as { SPDisplaysDataType?: { sppci_model?: string }[] }
      const name = parsed.SPDisplaysDataType?.[0]?.sppci_model ?? 'Apple GPU'
      return { name, vendor: 'Apple' }
    } catch {
      return { name: 'Apple GPU', vendor: 'Apple' }
    }
  }
  if (process.platform === 'linux') {
    return detectLinuxGpu()
  }
  return { name: 'Unknown GPU', vendor: 'Unknown' }
}

async function detectLinuxGpu(): Promise<{ name: string; vendor: string }> {
  // lspci -mm gives machine-readable fields:
  //   slot "VGA compatible controller" "NVIDIA Corporation" "AD104 [GeForce RTX 4070 Ti]" ...
  try {
    const { stdout } = await execFileAsync('lspci', ['-mm'], { timeout: 5000, maxBuffer: 1024 * 1024 })
    const line = stdout
      .split(/\r?\n/)
      .find((entry) => /"(VGA compatible controller|3D controller|Display controller)"/i.test(entry))
    if (line) {
      const fields = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1])
      const vendor = fields[2] ?? ''
      const device = fields[3] ?? ''
      const name = [vendor, device].filter(Boolean).join(' ').trim()
      if (name) return { name, vendor: vendorOf(name) }
    }
  } catch {
    // pciutils is not guaranteed to be installed; try the driver tool below.
  }

  try {
    const { stdout } = await execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      timeout: 5000,
      maxBuffer: 1024 * 1024
    })
    const name = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (name) return { name, vendor: 'NVIDIA' }
  } catch {
    // no NVIDIA driver tool
  }

  return { name: 'Unknown GPU', vendor: 'Unknown' }
}

function vendorOf(name: string): string {
  if (/nvidia|geforce|rtx|gtx|quadro/i.test(name)) return 'NVIDIA'
  if (/amd|radeon|rx\s?\d/i.test(name)) return 'AMD'
  if (/intel|iris|uhd|arc/i.test(name)) return 'Intel'
  if (/apple/i.test(name)) return 'Apple'
  return 'Unknown'
}

export function classify(cpu: string, gpu: { name: string }, threads: number, ramGb: number): HardwareInfo['tier'] {
  const gpuName = gpu.name
  let score = 0
  if (/rtx\s?(40|50)\d{2}|rx\s?(7[89]|9)\d{2}|arc\s?[ab]7|apple\s?m[3-9]/i.test(gpuName)) score = 4
  else if (/rtx\s?(20|30)\d{2}|rx\s?6[67]\d{2}|gtx\s?16\d{2}|arc\s?[ab]5|apple\s?m[12]/i.test(gpuName)) score = 3
  else if (/gtx|radeon|iris|vega|uhd|arc|apple/i.test(gpuName)) score = 2
  else score = 1

  if (threads >= 16) score += 0.5
  if (threads <= 4) score -= 0.5
  if (ramGb < 8) score -= 0.5
  if (/ryzen\s?[79]|i[79]-1[2-9]|ultra\s?[79]/i.test(cpu) && threads >= 12) score += 0.5

  if (ramGb < 8) return 'entry'
  if (score >= 4) return 'enthusiast'
  if (score >= 3) return 'high'
  if (score >= 2) return 'mainstream'
  return 'entry'
}

export function recommendMemory(ramGb: number, tier: HardwareInfo['tier'], modCount = 0): number {
  // Base memory from RAM
  let base = 3072
  if (ramGb <= 8) base = 3072
  else if (ramGb <= 12) base = 4096
  else if (ramGb <= 16) base = 4096
  else if (ramGb <= 24) base = 6144
  else base = 8192

  // Add memory for mods (each mod ~50MB, heavy mods ~200MB)
  const modMemory = Math.min(modCount * 50, 4096)
  base = Math.min(base + modMemory, Math.round(ramGb * 1024 * 0.75))

  // Tier adjustments
  if (tier === 'entry') base = Math.min(base, 4096)
  if (tier === 'enthusiast') base = Math.min(base + 1024, Math.round(ramGb * 1024 * 0.8))

  return Math.max(1024, Math.round(base / 512) * 512) // round to 512MB
}

/** Bump when the generated flag set changes so per-instance arg caches rebuild. */
export const JVM_FLAGS_VERSION = 2

/**
 * Build the JVM flags for an instance.
 *
 * Every option is gated by the detected Java major version. HotSpot aborts with
 * "Could not create the Java Virtual Machine" as soon as it sees an option it
 * does not recognise, which kills the process before Minecraft can start.
 *
 * The heap is also clamped to what the machine can actually reserve so an
 * oversized allocation can never produce the same error.
 */
export function buildJvmFlags(
  memoryMb: number,
  preset: JvmPresetId,
  custom = '',
  javaMajor?: number
): string[] {
  const totalRamMb = Math.floor(os.totalmem() / 1024 ** 2)
  const ceiling = Math.max(1024, Math.min(32768, Math.floor(totalRamMb * 0.75)))
  const requested = Number.isFinite(memoryMb) ? Math.round(memoryMb) : 1024
  const heap = Math.max(1024, Math.min(requested, ceiling))
  // 0 means "unknown runtime" — only emit options that exist since Java 8.
  const major = javaMajor && javaMajor > 0 ? javaMajor : 0

  if (preset === 'custom') {
    return [`-Xms${heap}M`, `-Xmx${heap}M`, ...tokenize(custom)]
  }

  // ZGC only exists from Java 11. Older runtimes fall through to G1 so
  // selecting the ZGC preset can never crash a Java 8 instance.
  if (preset === 'zgc' && major >= 11) {
    // ZGC was experimental in 11–14. Generational ZGC is experimental in
    // 21–22 and becomes the default (no flag) from 23 onwards.
    const experimental = major <= 14 || (major >= 21 && major <= 22)
    const generational = major >= 21 && major <= 22
    return [
      `-Xms${heap}M`,
      `-Xmx${heap}M`,
      ...(experimental ? ['-XX:+UnlockExperimentalVMOptions'] : []),
      '-XX:+UseZGC',
      ...(generational ? ['-XX:+ZGenerational'] : []),
      // -XX:+UseStringDeduplication requires G1GC. Combining it with ZGC is a
      // hard JVM start failure, so it must never appear in this branch.
      '-XX:+AlwaysPreTouch',
      '-XX:+DisableExplicitGC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:+PerfDisableSharedMem',
      '-Dfile.encoding=UTF-8',
      '-Djava.awt.headless=false'
    ]
  }

  const region = heap >= 16384 ? '16M' : heap >= 8192 ? '8M' : '4M'
  const flags = [
    `-Xms${heap}M`,
    `-Xmx${heap}M`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    `-XX:MaxGCPauseMillis=${preset === 'low-latency' ? 20 : 200}`,
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    `-XX:G1HeapRegionSize=${region}`,
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    '-Dfile.encoding=UTF-8',
    '-Djava.awt.headless=false',
    // Faster JVM startup
    '-XX:+TieredCompilation',
    '-XX:TieredStopAtLevel=4'
  ]
  // String deduplication is a G1-only feature (Java 8u20+).
  flags.push('-XX:+UseStringDeduplication')
  // Large heap optimisations
  if (heap >= 4096) {
    flags.push('-XX:G1ConcRefinementThreads=4', '-XX:G1ConcMarkStepDurationMillis=5')
  }
  // Property is ignored by older runtimes, but keep it version-gated anyway.
  if (major >= 21) flags.push('-Djdk.nio.maxCachedBufferSize=262144')
  return flags
}

export function perfOptions(
  profile: PerfProfileId,
  hardware: Pick<HardwareInfo, 'tier' | 'threads' | 'ramGb'>,
  memoryMb?: number
): Record<string, string> {
  const sizeBoost = hardware.tier === 'entry' ? -2 : hardware.tier === 'mainstream' ? 0 : hardware.tier === 'high' ? 2 : 4
  const render =
    profile === 'competitive' ? Math.max(4, 8 + sizeBoost) : profile === 'balanced' ? Math.max(6, 12 + sizeBoost) : Math.max(8, 16 + sizeBoost)
  const simulation = profile === 'competitive' ? Math.max(4, 5 + Math.floor(sizeBoost / 2)) : profile === 'balanced' ? 8 : 10
  const maxFps = profile === 'competitive' ? 260 : profile === 'balanced' ? 144 : 120
  return {
    renderDistance: String(render),
    simulationDistance: String(simulation),
    maxFps: String(maxFps),
    enableVsync: 'false',
    graphicsMode: profile === 'competitive' ? '0' : '1',
    particles: profile === 'competitive' ? '2' : profile === 'balanced' ? '1' : '0',
    entityShadows: profile === 'competitive' ? 'false' : 'true',
    biomeBlendRadius: profile === 'competitive' ? '0' : profile === 'balanced' ? '2' : '3',
    mipmapLevels: profile === 'competitive' ? '2' : '4',
    ao: 'true'
  }
}

export function makePlan(
  profile: PerfProfileId,
  hardware: HardwareInfo,
  memoryOverride?: number,
  presetOverride?: JvmPresetId
): PerfPlan {
  const requested = memoryOverride ?? hardware.recommendedMemoryMb
  const memoryMb = Math.min(32768, Math.max(1024, Math.round(Number.isFinite(requested) ? requested : hardware.recommendedMemoryMb)))
  const jvmPreset = presetOverride ?? (profile === 'competitive' ? 'low-latency' : 'aikar')
  const options = perfOptions(profile, hardware, memoryMb)
  const javaMajor = hardware.java.reduce((max, entry) => Math.max(max, entry.major), 0) || undefined
  const notes: string[] = []
  if (hardware.tier === 'entry') notes.push('Entry-tier GPU detected — distance is lowered to protect frame pacing.')
  if (hardware.ramGb <= 8) notes.push('8 GB system: 3 GB heap is the safe ceiling; close background apps before playing.')
  if (profile === 'competitive') notes.push('Competitive mode minimizes particles, entity shadows and render distance for stable input latency.')
  if (profile === 'quality') notes.push('Quality mode keeps shadows and full particles; shaders will still cost frames.')
  if (jvmPreset === 'zgc') notes.push('Generational ZGC targets sub-millisecond pauses; it needs Java 21+ and shines on 8 GB+ heaps.')
  notes.push('Game must be closed when applying video settings.')
  return {
    profile,
    memoryMb,
    jvmPreset,
    jvmArgs: buildJvmFlags(memoryMb, jvmPreset, '', javaMajor),
    options,
    notes,
    score: estimatedScore(hardware)
  }
}

export function estimatedScore(hardware: Pick<HardwareInfo, 'tier' | 'threads' | 'ramGb'>): number {
  const base = { entry: 38, mainstream: 58, high: 76, enthusiast: 88 }[hardware.tier]
  const threadBonus = Math.min(8, Math.max(0, hardware.threads - 4))
  const ramBonus = hardware.ramGb >= 16 ? 4 : 0
  return Math.min(100, Math.round(base + threadBonus + ramBonus))
}

export async function applyOptions(instanceDir: string, options: Record<string, string>): Promise<{ changed: number; backup?: string }> {
  const file = join(instanceDir, 'options.txt')
  const existing: Record<string, string> = (await pathExists(file))
    ? parseOptions(await readFile(file, 'utf8'))
    : {}
  let changed = 0
  for (const [key, value] of Object.entries(options)) {
    if (existing[key] !== value) {
      existing[key] = value
      changed++
    }
  }
  if (changed === 0) return { changed: 0 }
  const backup = join(instanceDir, `options.txt.polaris-${Date.now()}.bak`)
  if (await pathExists(file)) await copyFile(file, backup)
  const body = Object.entries(existing)
    .map(([key, value]) => `${key}:${value}`)
    .join('\n')
  await writeTextAtomic(file, `${body}\n`)
  return { changed, backup }
}

export const GAME_UI_DEFAULTS: GameUiOptions = {
  guiScale: 0,
  fov: 70,
  gamma: 0.5,
  chatOpacity: 1,
  chatScale: 1,
  screenEffectScale: 1,
  attackIndicator: 1
}

/** Vanilla options.txt values used by the in-game interface panel. */
export function normalizeGameUi(input: Partial<GameUiOptions> | undefined): GameUiOptions {
  const value = { ...GAME_UI_DEFAULTS, ...(input ?? {}) }
  return {
    guiScale: Math.round(clamp(value.guiScale, 0, 4)),
    fov: Math.round(clamp(value.fov, 30, 110)),
    gamma: roundTo(clamp(value.gamma, 0, 1), 2),
    chatOpacity: roundTo(clamp(value.chatOpacity, 0, 1), 2),
    chatScale: roundTo(clamp(value.chatScale, 0, 1), 2),
    screenEffectScale: roundTo(clamp(value.screenEffectScale, 0, 1), 2),
    attackIndicator: Math.round(clamp(value.attackIndicator, 0, 2))
  }
}

export async function readGameUi(instanceDir: string): Promise<GameUiSnapshot> {
  const file = join(instanceDir, 'options.txt')
  if (!(await pathExists(file))) {
    return { values: { ...GAME_UI_DEFAULTS }, source: 'defaults' }
  }
  const existing = parseOptions(await readFile(file, 'utf8'))
  const read = (key: keyof GameUiOptions): number => {
    const value = Number(existing[key])
    return Number.isFinite(value) ? value : GAME_UI_DEFAULTS[key]
  }
  return {
    values: normalizeGameUi({
      guiScale: read('guiScale'),
      fov: read('fov'),
      gamma: read('gamma'),
      chatOpacity: read('chatOpacity'),
      chatScale: read('chatScale'),
      screenEffectScale: read('screenEffectScale'),
      attackIndicator: read('attackIndicator')
    }),
    source: 'options.txt'
  }
}

export async function writeGameUi(
  instanceDir: string,
  input: Partial<GameUiOptions>
): Promise<GameUiApplyResult> {
  const values = normalizeGameUi(input)
  const applied = await applyOptions(instanceDir, {
    guiScale: String(values.guiScale),
    fov: values.fov.toFixed(1),
    gamma: values.gamma.toFixed(2),
    chatOpacity: values.chatOpacity.toFixed(2),
    chatScale: values.chatScale.toFixed(2),
    screenEffectScale: values.screenEffectScale.toFixed(2),
    attackIndicator: String(values.attackIndicator)
  })
  return { values, ...applied }
}

function parseOptions(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index > 0) result[line.slice(0, index)] = line.slice(index + 1)
  }
  return result
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function tokenize(input: string): string[] {
  const result: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input))) result.push(match[1] ?? match[2] ?? match[3])
  return result
}

export function profileLabel(profile: PerfProfileId): string {
  return { competitive: 'Competitive', balanced: 'Balanced', quality: 'Quality' }[profile]
}
