/**
 * The Audience (Diplomacy): the line a rival speaks when it receives the player, chosen by its
 * Respect tier, and its line when it accepts a deal or an Accord.
 *
 * The words live only in `rivalLines.json` at the project root, the owner's file (kept outside
 * the text catalog by the owner's request). Its `tiers` are the tier floors, so no number lives
 * here. The file is edited by hand: a missing rival, tier or line, or a malformed `tiers`, gives
 * FALLBACK_LINE and never throws.
 *
 * Patch 8 (D-62, A1, A4): each ruler's entry may also hold more greetings per tier (`greetings`), a
 * line for each deal he accepts (`deals`) and for each reason he refuses one (`refusals`), beside the
 * topics and answers `audienceTalk.ts` reads. Claude's drafts of them live apart, in
 * `rivalLines.draft.json`: `withDrafts` lays them beside Rich's lines for a development build, and a
 * release build reads his file alone, so no draft shows until he moves it into his file.
 */
import draftJson from '../../../../../../rivalLines.draft.json'
import linesJson from '../../../../../../rivalLines.json'
import { diffDays } from '../clock'
import { shuffle } from '../rng'
import type { CampaignState, ISODate, RivalId } from '../types'

/** Each rival's key in rivalLines.json. */
export const LINE_KEYS: Record<RivalId, string> = { orc: 'ugrak', goblin: 'skivvet', dwarf: 'hrodgar', archmage: 'emrys' }

/** Shown when the file has no usable line. */
export const FALLBACK_LINE = '…'

export interface AudienceLine {
  text: string
  /** True when the file had no usable line and FALLBACK_LINE stands in. */
  missing: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A usable line: a string with words in it. */
export function isLine(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Rich's lines with Claude's drafts laid beside them (Patch 8, D-62), for a development build: his
 * line wins wherever both have one, and lists (a tier's greetings, a ruler's wishes) are joined, his
 * first. A release build never calls it.
 */
export function withDrafts(approved: unknown = linesJson, drafts: unknown = draftJson): unknown {
  const merge = (a: unknown, b: unknown): unknown => {
    if (a === undefined) return b
    if (b === undefined) return a
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
    if (isRecord(a) && isRecord(b)) return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, merge(a[k], b[k])]))
    return a
  }
  return merge(approved, drafts)
}

/** The tier floors the file lists; empty when `tiers` is missing or malformed. */
export function lineTiers(lines: unknown = linesJson): number[] {
  const tiers = isRecord(lines) ? lines.tiers : undefined
  return Array.isArray(tiers) ? tiers.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : []
}

/** The tier `respect` falls in: the highest floor at or below it, else the lowest floor. Null with no floors. */
export function respectTier(tiers: readonly number[], respect: number): number | null {
  if (tiers.length === 0) return null
  const reached = tiers.filter((floor) => respect >= floor)
  return reached.length > 0 ? Math.max(...reached) : Math.min(...tiers)
}

/** `rival`'s entry in the lines file, if it has one. */
export function rulerEntry(lines: unknown, rival: RivalId): Record<string, unknown> | undefined {
  const rivals = isRecord(lines) ? lines.rivals : undefined
  const entry = isRecord(rivals) ? rivals[LINE_KEYS[rival]] : undefined
  return isRecord(entry) ? entry : undefined
}

/** A part of a ruler's entry that maps keys to lines (`deals`, `topics` and so on), or empty. */
export function linesOf(entry: Record<string, unknown> | undefined, part: string): Record<string, unknown> {
  const value = entry?.[part]
  return isRecord(value) ? value : {}
}

/** A part of a ruler's entry that lists lines (`wishes`), the unusable ones left out. */
export function listOf(entry: Record<string, unknown> | undefined, part: string): string[] {
  const value = entry?.[part]
  return Array.isArray(value) ? value.filter(isLine) : []
}

function lineAt(entry: Record<string, unknown> | undefined, key: string): AudienceLine {
  const text = entry?.[key]
  return isLine(text) ? { text, missing: false } : { text: FALLBACK_LINE, missing: true }
}

/** What `rival` says on receiving the player at `respect`, and the tier it was chosen by: the tier's first line. */
export function audienceLine(rival: RivalId, respect: number, lines: unknown = linesJson): AudienceLine & { tier: number | null } {
  const tier = respectTier(lineTiers(lines), respect)
  if (tier === null) return { tier, text: FALLBACK_LINE, missing: true }
  return { tier, ...lineAt(rulerEntry(lines, rival), String(tier)) }
}

/** Every greeting `rival` has for a tier: its first line, then any more in `greetings` (Patch 8, A1). */
export function greetingPool(rival: RivalId, tier: number, lines: unknown = linesJson): string[] {
  const entry = rulerEntry(lines, rival)
  const first = entry?.[String(tier)]
  const more = linesOf(entry, 'greetings')[String(tier)]
  return [...(isLine(first) ? [first] : []), ...(Array.isArray(more) ? more.filter(isLine) : [])]
}

/** The campaign day `day` is, counted from its first (0), so a day's choice is the same all day. */
export function dayIndex(state: CampaignState, day: ISODate): number {
  return Math.max(0, diffDays(state.campaign.startDate, day))
}

/**
 * Patch 8 (A1): one of `list` for `day`, in an order seeded once per campaign and stepped through a day
 * at a time, so a visit reads the same all day and the next day says something else.
 */
export function dailyPick<T>(state: CampaignState, day: ISODate, label: string, list: readonly T[]): T | undefined {
  if (list.length === 0) return undefined
  const order = shuffle(state.campaign.seed, state.campaign.startDate, `audience:${label}`, list)
  return order[dayIndex(state, day) % order.length]
}

/** What `rival` says on receiving the player on `day` (Patch 8, A1): one of the tier's greetings, never yesterday's. */
export function greetingFor(state: CampaignState, rival: RivalId, respect: number, day: ISODate, lines: unknown = linesJson): AudienceLine & { tier: number | null } {
  const tier = respectTier(lineTiers(lines), respect)
  if (tier === null) return { tier, text: FALLBACK_LINE, missing: true }
  const text = dailyPick(state, day, `greeting:${rival}:${tier}`, greetingPool(rival, tier, lines))
  return text === undefined ? { tier, text: FALLBACK_LINE, missing: true } : { tier, text, missing: false }
}

/** What `rival` says when it accepts a deal or an Accord. */
export function acceptLine(rival: RivalId, lines: unknown = linesJson): AudienceLine {
  return lineAt(rulerEntry(lines, rival), 'accept')
}

/** The deals a ruler answers in his own words (Patch 8, A4), and the Accord sealed. */
export type DealLineKind = 'truce' | 'pact' | 'callToArms' | 'sellHex' | 'buyHex' | 'buyout' | 'accord' | 'trial' | 'mercenaries' | 'oath' | 'bargain'

/** What `rival` says on striking `kind` (Patch 8, A4): his line for it, else his one accept line. */
export function dealAcceptLine(rival: RivalId, kind: DealLineKind, lines: unknown = linesJson): AudienceLine {
  const own = linesOf(rulerEntry(lines, rival), 'deals')[kind]
  return isLine(own) ? { text: own, missing: false } : acceptLine(rival, lines)
}

/** The reasons a ruler gives, in his words, for turning a deal or an Accord down (Patch 8, A4). */
export type RefusalKey = 'respect' | 'notYet' | 'atWar' | 'atPeace' | 'cooldown' | 'inForce' | 'reputation' | 'neverSells' | 'other'

/** Which of his reasons a refusal code is: a deal's (`DealRefusalCode`), a bribe's or an Accord's. */
export function refusalKey(code: string): RefusalKey {
  switch (code) {
    case 'respect':
    case 'atWar':
    case 'atPeace':
    case 'cooldown':
    case 'inForce':
    case 'reputation':
      return code
    case 'tooSoon':
      return 'cooldown'
    case 'neverSells':
    case 'useBribe':
      return 'neverSells'
    case 'pathRank':
    case 'castle':
    case 'contractRunning':
      return 'notYet'
    default:
      return 'other'
  }
}

/** What `rival` says on turning down a deal or an Accord for `code` (Patch 8, A4), if the file has a line for it. */
export function refusalLine(rival: RivalId, code: string, lines: unknown = linesJson): AudienceLine | undefined {
  const own = linesOf(rulerEntry(lines, rival), 'refusals')
  const text = own[refusalKey(code)] ?? own.other
  return isLine(text) ? { text, missing: false } : undefined
}
