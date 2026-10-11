/**
 * The Audience (Diplomacy): the line a rival speaks when it receives the player, chosen by its
 * Respect tier, and its line when it accepts a deal or an Accord.
 *
 * The words live only in `rivalLines.json` at the project root, the owner's file (kept outside
 * the text catalog by the owner's request). Its `tiers` are the tier floors, so no number lives
 * here. The file is edited by hand: a missing rival, tier or line, or a malformed `tiers`, gives
 * FALLBACK_LINE and never throws.
 */
import linesJson from '../../../../../../rivalLines.json'
import type { RivalId } from '../types'

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

function rivalEntry(lines: unknown, rival: RivalId): Record<string, unknown> | undefined {
  const rivals = isRecord(lines) ? lines.rivals : undefined
  const entry = isRecord(rivals) ? rivals[LINE_KEYS[rival]] : undefined
  return isRecord(entry) ? entry : undefined
}

function lineAt(entry: Record<string, unknown> | undefined, key: string): AudienceLine {
  const text = entry?.[key]
  return typeof text === 'string' && text.trim() !== '' ? { text, missing: false } : { text: FALLBACK_LINE, missing: true }
}

/** What `rival` says on receiving the player at `respect`, and the tier it was chosen by. */
export function audienceLine(rival: RivalId, respect: number, lines: unknown = linesJson): AudienceLine & { tier: number | null } {
  const tier = respectTier(lineTiers(lines), respect)
  if (tier === null) return { tier, text: FALLBACK_LINE, missing: true }
  return { tier, ...lineAt(rivalEntry(lines, rival), String(tier)) }
}

/** What `rival` says when it accepts a deal or an Accord. */
export function acceptLine(rival: RivalId, lines: unknown = linesJson): AudienceLine {
  return lineAt(rivalEntry(lines, rival), 'accept')
}
