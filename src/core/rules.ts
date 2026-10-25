import os from 'node:os'

export interface OsRule {
  name?: 'windows' | 'osx' | 'linux' | string
  arch?: string
  version?: string
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: OsRule
  features?: Record<string, boolean>
}

export interface RuleContext {
  osName: 'windows' | 'osx' | 'linux'
  osVersion: string
  arch: string
  features: Record<string, boolean>
}

export function currentOsName(): 'windows' | 'osx' | 'linux' {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

export function currentArch(): string {
  return process.arch
}

export function createRuleContext(features: Record<string, boolean> = {}): RuleContext {
  return {
    osName: currentOsName(),
    osVersion: os.release(),
    arch: currentArch(),
    features
  }
}

const ARCH_ALIASES: Record<string, string[]> = {
  x64: ['x86_64', 'x86-64', 'amd64', 'x64'],
  ia32: ['x86', 'i386', 'i686'],
  arm64: ['arm64', 'aarch64'],
  arm: ['arm', 'arm32']
}

function archMatches(ruleArch: string, actual: string): boolean {
  const aliases = ARCH_ALIASES[actual] ?? [actual]
  return aliases.includes(ruleArch.toLowerCase())
}

export function rulesAllow(rules: Rule[] | undefined, ctx: RuleContext): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (!matches(rule, ctx)) continue
    allowed = rule.action === 'allow'
  }
  return allowed
}

function matches(rule: Rule, ctx: RuleContext): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== ctx.osName) return false
    if (rule.os.arch && !archMatches(rule.os.arch, ctx.arch)) return false
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(ctx.osVersion)) return false
      } catch {
        return false
      }
    }
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if ((ctx.features[key] ?? false) !== value) return false
    }
  }
  return true
}

export function defaultFeatures(extras: Record<string, boolean> = {}): Record<string, boolean> {
  return {
    is_demo_user: false,
    has_custom_resolution: true,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false,
    ...extras
  }
}
