/**
 * Patch 5 (D-39, D-40; docs/redesign/patch-5-spec.md section 4): Respect both ways.
 *
 * - **The track.** Each court's Respect runs from −100 to +100 (`adjustRespect` in state.ts clamps it).
 * - **What moves it**, each rival his own way (P5-07): the common changes (`RULES.respect.change`), some
 *   weighed his own way, and what he alone values (`RULES.respect.byRival`). Those read from a week's log
 *   are posted at the week close by `weeklyRespect`, once (settle once).
 * - **The standing** (P5-08): Peace, Tension or War, read from Respect at each week close
 *   (`standingFor`), a coalition against the player always War, and the Orc never at Peace.
 * - **The marks** both sides (`respectMarks`): today's positive marks with their numbers, War at −25,
 *   raids stronger at −50, and each rival's own mark at +75 and −75 (`ownMark`).
 *
 * Respect is not a hidden value: screens show it as a number.
 */
import { weekOf } from './clock'
import { RULES } from './rules'
import { adjustRespect } from './state'
import type { CampaignState, Company, Disposition, Emit, ISODate, RivalId } from './types'

const R = RULES.respect

/** A change of Respect for `reason` with `rival`: his own weight when he has one (N-10), else the common one. */
export function respectChange(rival: RivalId, reason: string, common: number): number {
  return (R.byRival[rival] as Readonly<Record<string, number>>)[reason] ?? common
}

/** The standing Respect gives `rival` (D-40): War at −25 or below, or in a coalition; Peace at +50 or above, never the Orc; Tension between. */
export function standingFor(rival: RivalId, respect: number, inCoalition: boolean): Disposition {
  if (inCoalition || respect <= R.standing.war) return 'war'
  if (respect >= R.standing.peace && !R.standing.neverAtPeace.includes(rival)) return 'peace'
  return 'tension'
}

/** Whether `rival`'s own mark on one side holds (P5-07): at +75 or more (`up`), or −75 or less (`down`). */
export function ownMark(state: CampaignState, rival: RivalId, side: 'up' | 'down'): boolean {
  const r = state.rivals[rival]
  if (r.status !== 'active') return false
  return side === 'up' ? r.respect >= R.own.up : r.respect <= R.own.down
}

/** What an envoy costs a battle (A-20): its rival's fee, nothing for the Orc's at his own mark (P5-07). */
export function envoyFee(state: CampaignState, company: Pick<Company, 'id' | 'source'>): number {
  if (company.source !== 'envoy') return 0
  const rival = company.id.split(':')[1] as RivalId | undefined
  return rival === 'orc' && ownMark(state, 'orc', 'up') ? 0 : R.envoyCostPerBattle
}

/** His raids' multiple from Respect: 10% weaker from 25, 10% stronger at −50 or below. */
export function raidRespectMult(respect: number): number {
  if (respect >= R.thresholds.raidsWeaker) return R.raidsWeakerMult
  if (respect <= R.raidsStrongerAt) return R.raidsStrongerMult
  return 1
}

/** One mark on `rival`'s track: where it is and what it brings, as keys a screen turns into words. */
export interface MarkSpec {
  at: number
  opens: string[]
}

/**
 * Every mark on `rival`'s track, low to high (P5-07): War at −25, stronger raids at −50, his own at ±75,
 * and the positive marks of Ch 12 that open something with him (the Orc signs no Accord, C-41; the
 * Goblin's hexes are bribed and he buys at any Respect, C-43), Peace at +50 but for the Orc.
 */
export function marksOf(rival: RivalId): MarkSpec[] {
  const th = R.thresholds
  const marks: { at: number; key: string }[] = [
    { at: R.own.down, key: `own.${rival}.down` },
    { at: R.raidsStrongerAt, key: 'raidsStronger' },
    { at: R.standing.war, key: 'war' },
    { at: th.raidsWeaker, key: 'raidsWeaker' },
    ...(rival === 'goblin' ? [] : [{ at: th.sellHex, key: 'buysHex' }]),
    { at: th.pact, key: 'pact' },
    ...(R.standing.neverAtPeace.includes(rival) ? [] : [{ at: R.standing.peace, key: 'peace' }]),
    { at: th.envoy, key: 'envoy' },
    ...(rival === 'goblin' ? [] : [{ at: th.buyHex, key: 'sellsHex' }]),
    ...(rival === 'orc' ? [{ at: RULES.terms.orc.respectBar, key: 'challenge' }] : [{ at: th.accordTalks, key: 'accordTalks' }]),
    { at: th.callToArms, key: 'callToArms' },
    ...(rival === 'orc' ? [] : [{ at: th.accordEasier, key: 'accordEasier' }]),
    { at: R.own.up, key: `own.${rival}.up` },
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
  // The Dwarf: an oath kept, and his walls broken.
  add('dwarf', 'pactKept', state.deals.filter((d) => d.rival === 'dwarf' && d.kind === 'pact' && d.until !== undefined && d.until >= from && d.until <= w.day).length)
  const byId = new Map(state.hexes.map((h) => [h.id, h]))
  const walls = week.reduce((s, e) => (e.kind === 'hexTransfer' && e.to === 'player' && e.from !== 'player' && byId.get(e.hexId)?.march === 'dwarf' ? s + (e.fortification ?? 0) : s), 0)
  add('dwarf', 'wallBroken', walls)
  // The Archmage: constancy, and his magic endured.
  if ((w.realmConsistency ?? 0) >= R.constantWeekAt) add('archmage', 'constantWeek')
  add('archmage', 'surgeHeld', week.filter((e) => e.kind === 'defense' && e.threat === 'surge' && e.outcome !== 'defeat').length)
  add('archmage', 'ritualEndured', week.filter((e) => e.kind === 'ritual').length)
  return state
}
