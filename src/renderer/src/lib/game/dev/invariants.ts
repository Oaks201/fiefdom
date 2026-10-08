/**
 * The runtime invariants (T17; Ch 15 "Invariants that must survive any retuning", Appendix A Tests
 * 9 and 10), checked after a `settle` call: in development builds after every settlement (the app's
 * campaign store), and every day of every simulated campaign (T13's `sim/`). Pure, and read-only.
 *
 * Each check looks only at what this settlement changed, so it is cheap to run every day:
 * 1. No loss before week 36 (44 at Grace III).
 * 2. Rings 0 to 2 never change owner, and no rival ever holds a hex there.
 * 3. A Border Campaign never targets a Gate, a capital or a player hex (Test 10).
 * 4. Settling again with the same `now` changes nothing (Test 9; optional, as it costs a settle).
 * 5. Every reputation gain traces to a behavior, a battle or land held.
 * 6. No Momentum above the target pace, and no more than half while the trend is too fast.
 */
import type { Ledger } from '../../types'
import { RULES } from '../rules'
import { settle } from '../settle'
import { weekOn } from '../state'
import type { CampaignState, PurseEvent } from '../types'

export interface InvariantInput {
  /** The campaign before this settlement. */
  before: CampaignState
  /** What `settle(before, ledger, now, …)` returned. */
  after: CampaignState
  ledger: Ledger
  now: Date
  /** Settle `after` again and check nothing changes (Test 9). */
  resettle?: boolean
  /** Source prefixes allowed besides behavior, battle and land: `dev` for the dev scenarios (A-181). */
  extraSources?: readonly string[]
}

/** Where a reputation gain may come from (Ch 15 invariant 4), by the prefix of its `source`. */
export const PURSE_SOURCES = {
  behavior: ['duties', 'perfectDay', 'streak', 'steps', 'calories', 'flawless', 'momentum', 'contract', 'correction'],
  battle: ['defense', 'assault', 'grandBattle', 'mythicHunt', 'royalHunt', 'tribute', 'mythic'],
  land: ['tithe', 'courtship', 'deal', 'goblinOffer', 'auction', 'uprising', 'reclaim'],
  /** The founding grant, and the Bank's interest on what the player has already earned. */
  other: ['founding', 'interest']
} as const

/** The purse event kinds that add to the purse. */
const GAINS: ReadonlySet<PurseEvent['kind']> = new Set<PurseEvent['kind']>(['earn', 'return', 'spoils', 'tithe', 'adjust'])

const EPSILON = 1e-9 // rules-ok: a float tolerance for comparisons, not a game number

/** What `after` added to a list `before` had: the tail when the list only grew (it is append-only), else by id. */
function added<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  const last = before[before.length - 1]
  if (after.length >= before.length && (last === undefined || after[before.length - 1]?.id === last.id)) return after.slice(before.length)
  const seen = new Set(before.map((x) => x.id))
  return after.filter((x) => !seen.has(x.id))
}

/** The prefix of a purse event's source (`steps:2027-01-04` → `steps`). */
export function sourcePrefix(source: string): string {
  return source.split(':')[0]
}

/** Every invariant this settlement broke, as plain sentences; empty when all hold. */
export function settleViolations(i: InvariantInput): string[] {
  const { before, after } = i
  const out: string[] = []
  const fresh = added(before.log, after.log)
  const ringOf = new Map(after.hexes.map((h) => [h.id, h.ring]))
  const ownerBefore = new Map(before.hexes.map((h) => [h.id, h.owner]))
  const kindOf = new Map(after.hexes.map((h) => [h.id, h.kind]))
  const protectedRing = RULES.land.protectedThroughRing

  // 1. No loss before week 36 (44 at Grace III).
  for (const e of fresh) {
    if (e.kind !== 'campaignEnd' || e.outcome !== 'fallen') continue
    const week = weekOn(after, e.day)
    const a = RULES.defeat.ascendancy
    const from = after.weight.grace >= RULES.grace.thresholds.length ? a.fromWeekGraceIII : a.fromWeek
    if (week < from) out.push(`the realm fell in week ${week}, before week ${from} (Grace ${after.weight.grace})`)
  }

  // 2. Rings 0 to 2 never change owner.
  for (const e of fresh) {
    if (e.kind === 'hexTransfer' && e.to !== 'player' && (ringOf.get(e.hexId) ?? protectedRing + 1) <= protectedRing) {
      out.push(`${e.day}: hex ${e.hexId} in ring ${ringOf.get(e.hexId)} passed to ${e.to}`)
    }
  }
  for (const h of after.hexes) {
    if (h.ring <= protectedRing && h.owner !== 'player' && h.owner !== 'neutral') out.push(`hex ${h.id} in ring ${h.ring} is held by ${h.owner}`)
  }

  // 3. Border Campaigns never target a Gate, a capital or a player hex.
  for (const e of fresh) {
    if (e.kind !== 'borderCampaign') continue
    const kind = kindOf.get(e.hexId)
    if (kind === 'gate' || kind === 'capital') out.push(`${e.day}: a Border Campaign targeted the ${kind} ${e.hexId}`)
    if (ownerBefore.get(e.hexId) === 'player') out.push(`${e.day}: a Border Campaign targeted the player's hex ${e.hexId}`)
  }

  // 4. Settling again changes nothing.
  if (i.resettle && JSON.stringify(settle(after, i.ledger, i.now).state) !== JSON.stringify(after)) out.push('settling again with the same time changed the campaign')

  // 5. Every gain has a behavior, battle or land source.
  const allowed = new Set<string>([...Object.values(PURSE_SOURCES).flat(), ...(i.extraSources ?? [])])
  for (const p of added(before.purse.events, after.purse.events)) {
    if (!GAINS.has(p.kind)) continue
    if (!allowed.has(sourcePrefix(p.source))) out.push(`${p.date}: a ${p.kind} of ${p.amount} from "${p.source}" has no behavior, battle or land source`)
  }

  // 6. Momentum never pays for losing faster than the target pace.
  const seenWeeks = new Set(before.weight.weeks.map((w) => w.week))
  for (const w of after.weight.weeks) {
    if (seenWeeks.has(w.week)) continue
    if (w.momentum > 1 + EPSILON) out.push(`week ${w.week}: Momentum ${w.momentum} above the target pace`)
    if (w.tooFast && w.momentum > RULES.momentum.tooFast.heldMw + EPSILON) out.push(`week ${w.week}: Momentum ${w.momentum} while the trend is too fast`)
  }
  return out
}
