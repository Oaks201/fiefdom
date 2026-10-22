/**
 * Patch 5 (D-39, D-40; docs/redesign/patch-5-spec.md section 4): Respect both ways.
 *
 * - **The track.** Each court's Respect runs from −100 to +100 (`adjustRespect` in state.ts clamps it).
 * - **What moves it**, each rival his own way (P5-07): the common changes (`RULES.respect.change`), some
 *   weighed his own way, and what he alone values (`RULES.respect.byRival`). Those read from a week's log
 *   are posted at the week close by `weeklyRespect`, once (settle once).
 * - **The standing** (P5-08): Peace, Tension or War, read from Respect at each day's close (Patch 6,
 *   D-49; `standingFor`), a coalition against the player always War, and the Orc never at Peace.
 * - **The marks** both sides (`respectMarks`), each rival's own (Patch 6, D-48; `marksFor`): War, raids
 *   stronger and his own detriment below; raids weaker, deals, Peace and his own perk above (`ownMark`).
 *   Only the Accord's marks are shared (C-82).
 *
 * Respect is not a hidden value: screens show it as a number.
 */
import { weekOf } from './clock'
import { RULES, type DeepReadonly, type RivalMarks } from './rules'
import { adjustRespect } from './state'
import type { CampaignState, Company, Disposition, Emit, ISODate, RivalId } from './types'

const R = RULES.respect

/** `rival`'s own marks (Patch 6, D-48): every gate on his Respect reads them, never a shared number. */
export function marksFor(rival: RivalId): DeepReadonly<RivalMarks> {
  return R.marks[rival]
}

/** Whether `respect` reaches `mark`: at or above it from 0 up, at or below it under 0; never a mark that is `null`. */
export function reaches(respect: number, mark: number | null): boolean {
  if (mark === null) return false
  return mark >= 0 ? respect >= mark : respect <= mark
}

/** A change of Respect for `reason` with `rival`: his own weight when he has one (N-10), else the common one. */
export function respectChange(rival: RivalId, reason: string, common: number): number {
  return (R.byRival[rival] as Readonly<Record<string, number>>)[reason] ?? common
}

/**
 * The standing Respect gives `rival` (D-40, D-48): War at his War line or below, or in a coalition; Peace at
 * his Peace line or above (never the Orc); Tension between. Given the standing he holds (`from`), the buffer
 * (T-10, `RULES.respect.standingBuffer`) holds it: Peace until Respect is below his Peace line less `buffer`,
 * War until it is above his War line plus `buffer`. At 0 the lines read the same both ways.
 */
export function standingFor(rival: RivalId, respect: number, inCoalition: boolean, from?: Disposition, buffer: number = R.standingBuffer): Disposition {
  const m = marksFor(rival)
  const war = from === 'war' ? m.war + buffer : m.war
  const peace = m.peace === null ? null : from === 'peace' ? m.peace - buffer : m.peace
  if (inCoalition || respect <= war) return 'war'
  if (peace !== null && respect >= peace) return 'peace'
  return 'tension'
}

/** Whether `rival`'s own mark on one side holds (P5-07): at his `ownUp` or more (`up`), or his `ownDown` or less (`down`). */
export function ownMark(state: CampaignState, rival: RivalId, side: 'up' | 'down'): boolean {
  const r = state.rivals[rival]
  if (r.status !== 'active') return false
  const m = marksFor(rival)
  return side === 'up' ? r.respect >= m.ownUp : r.respect <= m.ownDown
}

/** What an envoy costs a battle (A-20): its rival's fee (the Orc sends none, P6-04). */
export function envoyFee(_state: CampaignState, company: Pick<Company, 'id' | 'source'>): number {
  return company.source === 'envoy' ? R.envoyCostPerBattle : 0
}

/** His raids' multiple from Respect (D-39, D-48): 10% weaker from his `raidsWeaker`, 10% stronger at his `raidsStrongerAt` or below. */
export function raidRespectMult(rival: RivalId, respect: number): number {
  const m = marksFor(rival)
  if (respect >= m.raidsWeaker) return R.raidsWeakerMult
  if (respect <= m.raidsStrongerAt) return R.raidsStrongerMult
  return 1
}

/** One mark on `rival`'s track: where it is and what it brings, as keys a screen turns into words. */
export interface MarkSpec {
  at: number
  opens: string[]
}

/**
 * Every mark on `rival`'s track, low to high (P5-07, D-48): his War line, stronger raids and his own
 * detriment below; above, the marks of Ch 12 that open something with him at his own numbers (a mark
 * that is `null` for him is left out: the Orc's Peace, envoys and hexes, the Dwarf's hexes, the Goblin's
 * bribed hexes; the Goblin buys at any Respect, C-43), the Accord's shared marks (never the Orc, C-41)
 * and his own perk.
 */
export function marksOf(rival: RivalId): MarkSpec[] {
  const th = R.thresholds
  const m = marksFor(rival)
  const own = (at: number | null, key: string): { at: number; key: string }[] => (at === null || at <= R.min ? [] : [{ at, key }])
  const marks: { at: number; key: string }[] = [
    { at: m.ownDown, key: `own.${rival}.down` },
    { at: m.raidsStrongerAt, key: 'raidsStronger' },
    { at: m.war, key: 'war' },
    { at: m.raidsWeaker, key: 'raidsWeaker' },
    ...own(m.buysHex, 'buysHex'),
    { at: m.pact, key: 'pact' },
    ...own(m.peace, 'peace'),
    ...own(m.envoy, 'envoy'),
    ...own(m.sellsHex, 'sellsHex'),
    ...(rival === 'orc' ? [{ at: RULES.terms.orc.respectBar, key: 'challenge' }] : [{ at: th.accordTalks, key: 'accordTalks' }]),
    { at: m.callToArms, key: 'callToArms' },
    ...(rival === 'orc' ? [] : [{ at: th.accordEasier, key: 'accordEasier' }]),
    { at: m.ownUp, key: `own.${rival}.up` },
    ...(rival === 'orc' ? [] : [{ at: RULES.contracts.accord.signedAtRespect, key: 'accordSigned' }])
  ]
  const byAt = new Map<number, string[]>()
  for (const m of marks) byAt.set(m.at, [...(byAt.get(m.at) ?? []), m.key])
  return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([at, opens]) => ({ at, opens }))
}

/** The week's Respect changes each rival's own values bring, read from the week's log at its close (P5-07). Settles once: the rival turn runs once a close. */
export function weeklyRespect(input: CampaignState, w: { day: ISODate; weekStartsOn: CampaignState['campaign']['weekStartsOn']; realmConsistency?: number; emit: Emit }): CampaignState {
  let state = input
  const from = weekOf(w.day, w.weekStartsOn)
  const week = state.log.filter((e) => e.day >= from && e.day <= w.day)
  const active = (r: RivalId): boolean => state.rivals[r].status === 'active'
  const add = (rival: RivalId, reason: string, times = 1): void => {
    const change = (R.byRival[rival] as Readonly<Record<string, number>>)[reason]
    for (let i = 0; i < times && change !== undefined && active(rival); i++) state = adjustRespect(state, rival, change, reason, w.emit)
  }
  // The Orc: every Grand Battle against him counts (an Incursion won posts its own +5 when fought).
  for (const e of week) {
    if (e.kind !== 'grandBattle' || e.stage !== 'fought' || e.rival !== 'orc') continue
    if (e.result === 'defeat') add('orc', 'grandBattleLost')
    else if (e.trigger !== 'incursion') add('orc', 'grandBattleWon')
  }
  // The Goblin: coin and bargains.
  add('goblin', 'bribePaid', week.filter((e) => e.kind === 'bribe').length)
  add('goblin', 'buyOffAccepted', week.filter((e) => e.kind === 'terms' && e.rival === 'goblin' && e.offer === 'buyOff' && e.stage === 'accepted').length)
  add('goblin', 'buyOffRefused', week.filter((e) => e.kind === 'terms' && e.rival === 'goblin' && e.offer === 'buyOff' && (e.stage === 'refused' || e.stage === 'lapsed')).length)
  add('goblin', 'bidHeld', week.filter((e) => e.kind === 'goblinBid' && e.stage === 'held').length)
  // The Dwarf: an oath kept, and his walls broken. A pact is read from its deal in the log: the close of its last day has already cleared it from `state.deals`.
  add('dwarf', 'pactKept', state.log.filter((e) => e.kind === 'deal' && e.rival === 'dwarf' && e.deal === 'pact' && e.until !== undefined && e.until >= from && e.until <= w.day).length)
  const byId = new Map(state.hexes.map((h) => [h.id, h]))
  const walls = week.reduce((s, e) => (e.kind === 'hexTransfer' && e.to === 'player' && e.from !== 'player' && byId.get(e.hexId)?.march === 'dwarf' ? s + (e.fortification ?? 0) : s), 0)
  add('dwarf', 'wallBroken', walls)
  // The Archmage: constancy, and his magic endured.
  if ((w.realmConsistency ?? 0) >= R.constantWeekAt) add('archmage', 'constantWeek')
  add('archmage', 'surgeHeld', week.filter((e) => e.kind === 'defense' && e.threat === 'surge' && e.outcome !== 'defeat').length)
  add('archmage', 'ritualEndured', week.filter((e) => e.kind === 'ritual').length)
  return state
}
