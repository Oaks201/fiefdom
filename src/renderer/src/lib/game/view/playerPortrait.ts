/**
 * The player's portrait (the Audience, the standing card): a tier from the player's overall
 * Dominion, and a path from the rival road they lead (pure) or the two they run close on (hybrid).
 *
 * Dominion itself is unchanged. It is each building's (`dominion()`, map.ts), and each building's
 * road leads to one rival (the codex `road`), so a rival's path is its road building's Dominion.
 * Overall Dominion is the four summed. The tier thresholds, the close margin, the path names and
 * the file names live only in playerPortraits.json at the project root. The file is edited by
 * hand: a broken entry is reported by `PORTRAIT_SETUP.problems`, and the portrait falls back to
 * the base file (or, without one, the caller's placeholder), never a throw.
 */
import setupJson from '../../../../../../playerPortraits.json'
import { CODEX } from '../codex'
import { dominion } from '../map'
import { RIVAL_IDS, type BuildingId, type CampaignState, type RivalId } from '../types'
import { rivalName, rivalNames } from './shell'

export interface PortraitConfig {
  /** Where the files are served from, relative to the page. */
  folder: string
  /** The overall Dominion where each tier starts, lowest first: tier 1, tier 2, … */
  tiers: number[]
  /** How close the second path must run to the top one, as a share of the top path's Dominion. */
  closeMargin: number
  /** Each rival's path name in the file names. This order breaks exact ties. */
  paths: [RivalId, string][]
  /** The file names: the base, and the patterns with {tier}, {path}, {a} and {b}. */
  files: { base: string; pure: string; hybrid: string }
}

export interface PortraitSetup {
  /** Null when the file has a problem; the portrait then stays on the base file. */
  config: PortraitConfig | null
  /** The base file and its folder, when the file names them, even if something else is broken. */
  base: { folder: string; file: string } | null
  problems: string[]
}

export type PathPick =
  | { kind: 'base' }
  | { kind: 'pure'; lead: RivalId; numbers: PathNumbers }
  | { kind: 'hybrid'; lead: RivalId; second: RivalId; numbers: PathNumbers }

/** The figures behind a pick: the top two paths' Dominion, the gap, and the most it may be to count as close. */
export interface PathNumbers {
  top: number
  second: number
  gap: number
  limit: number
}

export interface Standing {
  /** Each rival's path: its road building's Dominion. */
  perPath: Record<RivalId, number>
  /** The four buildings' Dominion summed. */
  overall: number
  tier: number
}

/** Which file stood in for the wanted one. */
export type Fallback = 'none' | 'leadSameTier' | 'lowerTier' | 'base' | 'placeholder'

export interface PortraitChoice {
  tier: number
  path: PathPick
  /** What a change is noticed by: `t1`, `t3:orc`, `t3:goblin-orc`. */
  key: string
  /** The file the tier and path call for; null without a usable data file. */
  wanted: string | null
  /** The files to try, in order, ending with the base file. */
  chain: string[]
}

export interface ResolvedPortrait {
  /** The first file in the chain known to exist, or null. */
  file: string | null
  fallback: Fallback
  /** True while a file ahead of `file` has not been checked yet. */
  pending: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** Reads and checks playerPortraits.json (or any value shaped like it). */
export function readSetup(raw: unknown): PortraitSetup {
  const problems: string[] = []
  const r = isRecord(raw) ? raw : {}
  if (!isRecord(raw)) problems.push('the file is not an object')
  const folder = text(r.folder) ? r.folder.replace(/\/+$/, '') : null
  if (!folder) problems.push('"folder" must name a folder')
  const files = isRecord(r.files) ? r.files : {}
  for (const key of ['base', 'pure', 'hybrid']) if (!text(files[key])) problems.push(`"files.${key}" must be a file name`)
  const tiers = Array.isArray(r.tiers) && r.tiers.length > 0 && r.tiers.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [...(r.tiers as number[])].sort((a, b) => a - b) : null
  if (!tiers) problems.push('"tiers" must be a list of numbers')
  const margin = typeof r.closeMargin === 'number' && Number.isFinite(r.closeMargin) && r.closeMargin >= 0 ? r.closeMargin : null
  if (margin === null) problems.push('"closeMargin" must be a number, 0 or more')
  const named = isRecord(r.paths) ? r.paths : {}
  const paths = Object.keys(named).filter((k): k is RivalId => (RIVAL_IDS as readonly string[]).includes(k) && text(named[k])).map((k): [RivalId, string] => [k, named[k] as string])
  for (const rival of RIVAL_IDS) if (!paths.some(([id]) => id === rival)) problems.push(`"paths.${rival}" must be a path name`)
  const base = folder && text(files.base) ? { folder, file: files.base } : null
  if (problems.length > 0 || !folder || !tiers || margin === null) return { config: null, base, problems }
  return { config: { folder, tiers, closeMargin: margin, paths, files: { base: files.base as string, pure: files.pure as string, hybrid: files.hybrid as string } }, base, problems }
}

/** The game's own setup, from playerPortraits.json. */
export const PORTRAIT_SETUP: PortraitSetup = readSetup(setupJson)

/** The tier an overall Dominion is in: how many thresholds it has reached, and at least 1. */
export function tierOf(overall: number, tiers: readonly number[]): number {
  return Math.max(1, tiers.filter((floor) => overall >= floor).length)
}

function roadOf(rival: RivalId): BuildingId | undefined {
  return CODEX.rivals.find((r) => r.id === rival)?.road as BuildingId | undefined
}

/** A tier and path from any per-path Dominion (the debug panel's inputs), the tier from their sum unless given. */
export function standingFrom(perPath: Record<RivalId, number>, tier?: number, setup: PortraitSetup = PORTRAIT_SETUP): Standing {
  const overall = RIVAL_IDS.reduce((s, r) => s + (perPath[r] ?? 0), 0)
  return { perPath, overall, tier: tier ?? (setup.config ? tierOf(overall, setup.config.tiers) : 1) }
}

/** The player's standing now: each path's Dominion from the land they hold, the sum, and the tier. */
export function standingOf(state: CampaignState, setup: PortraitSetup = PORTRAIT_SETUP): Standing {
  const byBuilding = dominion(state.hexes, 'player')
  const perPath = Object.fromEntries(RIVAL_IDS.map((r) => [r, byBuilding[roadOf(r) as BuildingId] ?? 0])) as Record<RivalId, number>
  return standingFrom(perPath, undefined, setup)
}

/**
 * The path: pure when the top path leads the second by more than the margin (a share of the top
 * path's Dominion), otherwise the hybrid of the top two, however many run close; the base when
 * every path is at zero. Exact ties keep `order`.
 */
export function pathOf(perPath: Record<RivalId, number>, margin: number, order: readonly RivalId[]): PathPick {
  const ranked = order.map((rival) => ({ rival, value: perPath[rival] ?? 0 })).sort((a, b) => b.value - a.value)
  const [top, second] = ranked
  if (!top || top.value <= 0) return { kind: 'base' }
  const numbers = { top: top.value, second: second?.value ?? 0, gap: top.value - (second?.value ?? 0), limit: margin * top.value }
  if (!second || numbers.gap > numbers.limit) return { kind: 'pure', lead: top.rival, numbers }
  return { kind: 'hybrid', lead: top.rival, second: second.rival, numbers }
}

function fill(pattern: string, facts: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, name: string) => (name in facts ? String(facts[name]) : whole))
}

function nameOf(config: PortraitConfig, rival: RivalId): string {
  return config.paths.find(([id]) => id === rival)?.[1] ?? rival
}

function pureFile(config: PortraitConfig, tier: number, rival: RivalId): string {
  return fill(config.files.pure, { tier, path: nameOf(config, rival) })
}

function hybridFile(config: PortraitConfig, tier: number, x: RivalId, y: RivalId): string {
  const [a, b] = [nameOf(config, x), nameOf(config, y)].sort()
  return fill(config.files.hybrid, { tier, a, b })
}

/**
 * The file a standing calls for and what stands in while it is missing, in order: a missing hybrid
 * gives the leading path's pure file at the same tier, then that path at each lower tier, then the
 * base file. Tier 1, or every path at zero, is the base file.
 */
export function portraitChoice(standing: Standing | null, setup: PortraitSetup = PORTRAIT_SETUP): PortraitChoice {
  const base = setup.base?.file
  const config = setup.config
  if (!config || !standing || standing.tier <= 1) return { tier: 1, path: { kind: 'base' }, key: 't1', wanted: base ?? null, chain: base ? [base] : [] }
  const tier = Math.min(standing.tier, config.tiers.length)
  const path = pathOf(standing.perPath, config.closeMargin, config.paths.map(([id]) => id))
  if (path.kind === 'base') return { tier: 1, path, key: 't1', wanted: config.files.base, chain: [config.files.base] }
  const lower: string[] = []
  for (let t = tier; t >= 2; t -= 1) lower.push(pureFile(config, t, path.lead))
  const wanted = path.kind === 'hybrid' ? hybridFile(config, tier, path.lead, path.second) : pureFile(config, tier, path.lead)
  const pathName = path.kind === 'hybrid' ? [nameOf(config, path.lead), nameOf(config, path.second)].sort().join('-') : nameOf(config, path.lead)
  return { tier, path, key: `t${tier}:${pathName}`, wanted, chain: [...new Set([wanted, ...lower, config.files.base])] }
}

/** The first file in the chain that exists, and which stand-in it is. `exists` is undefined for a file not checked yet. */
export function resolvePortrait(choice: PortraitChoice, exists: (file: string) => boolean | undefined, setup: PortraitSetup = PORTRAIT_SETUP): ResolvedPortrait {
  let pending = false
  for (let i = 0; i < choice.chain.length; i++) {
    const file = choice.chain[i]
    const known = exists(file)
    if (known === undefined) pending = true
    if (known !== true) continue
    const fallback: Fallback = i === 0 ? 'none' : file === setup.base?.file ? 'base' : choice.path.kind === 'hybrid' && i === 1 ? 'leadSameTier' : 'lowerTier'
    return { file, fallback, pending }
  }
  return { file: null, fallback: 'placeholder', pending }
}

/** Every portrait file the setup names: the base, then each tier from 2 up, its pure paths and then its hybrids. */
export function portraitFiles(setup: PortraitSetup = PORTRAIT_SETUP): string[] {
  const config = setup.config
  if (!config) return setup.base ? [setup.base.file] : []
  const rivals = config.paths.map(([id]) => id)
  const out = [config.files.base]
  for (let tier = 2; tier <= config.tiers.length; tier++) {
    for (const r of rivals) out.push(pureFile(config, tier, r))
    rivals.forEach((x, i) => rivals.slice(i + 1).forEach((y) => out.push(hybridFile(config, tier, x, y))))
  }
  return [...new Set(out)]
}

/** A file's URL, from the page. */
export function portraitUrl(file: string, setup: PortraitSetup = PORTRAIT_SETUP): string {
  return `${setup.config?.folder ?? setup.base?.folder ?? ''}/${file}`
}

/** The path in words, as the text names rivals: "Ugrak", or "Ugrak and Skivvet". */
export function pathWords(path: PathPick): string {
  if (path.kind === 'pure') return rivalName(path.lead)
  if (path.kind === 'hybrid') return rivalNames([path.lead, path.second])
  return ''
}

/** What the standing card needs remembered between runs. */
export interface SeenStanding {
  tier: number
  key: string
}

/** True when the standing grew: the tier rose, or the path changed at the same or a higher tier (2 and up). A first look is not growth. */
export function standingGrew(previous: SeenStanding | null, next: SeenStanding): boolean {
  if (!previous) return false
  if (next.tier > previous.tier) return true
  return next.tier >= 2 && next.tier >= previous.tier && next.key !== previous.key
}
