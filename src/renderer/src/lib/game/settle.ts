/**
 * The settlement engine (Ch 2, Appendix A "Settlement order", A-01, A-02, A-04, A-10, A-45).
 *
 * `settle(state, ledger, now)` is pure. It settles every closed, unsettled campaign day in order,
 * running the day phases for each and the week phases after each week's last day, and posts every
 * result as an event. `settledThrough` guards it all: calling it again with the same `now` and
 * ledger returns the same state and no new events.
 *
 * The phase registry is two fixed, ordered lists. Later tasks fill a phase by replacing its
 * entry in `DAY_PHASES` or `WEEK_PHASES` with their own `Phase`; they never reorder the lists.
 */
import type { Ledger } from '../types'
import { milestoneUnlocks } from './armory'
import { addDays, campaignWeek, diffDays, isWeekCloseDay, openDay, closedDaysSince, weekOf } from './clock'
import { borderCampaignWeeks } from './campaign'
import { dawn, scheduleThreats, settleCombat, type GrandBattleRequest } from './combat'
import { earnRespite, lateCorrection, settleContract, type AccordPaid, type PayContext } from './contracts'
import { balance, dailyIncome, post, postAll, roundPosting, tithes, weeklyIncome } from './economy'
import { realmEffects } from './effects'
import { announceGrandBattle, announceRequests, grandBattlesDue, raiseIncursions } from './grand'
import { recoverLoyalty, resolveCourtships, resolveRivalCourtships } from './land'
import { sameInputs, snapshotDay, snapshotsBetween, toDayRecord, toHealerDay, weighInsOf } from './ledgerDays'
import { borderCampaigns, rivalBidsAtClose, rivalTurn, settleFronts, type RivalWeek, type WarhostRequest } from './rivals'
import { RULES } from './rules'
import { EventBuffer, isPlayable } from './state'
import { accordPaid, worldWeek } from './world'
import { consistency, pillarScore, realmConsistency, termsOf, valor, weekPillars, type ScoreTerms } from './score'
import { closeWeightWeek, toLb, weekMomentum } from './weight'
import type { CampaignState, Charter, DayRecord, DaySnapshot, Emit, GameEvent, ISODate, LandContract, PurseLine, WeekStartsOn } from './types'

// ── The phase registry ───────────────────────────────────────────────────────

/** Day phases, in Appendix A's order. */
export const DAY_PHASE_NAMES = [
  'syncNote',
  'snapshotInputs',
  'contractsAndDaily',
  'combat',
  'grandBattlesAuto',
  'expireTimers',
  'contractEnd'
] as const

/** Week phases, run after the day phases of a week's last day, in Appendix A's order. */
export const WEEK_PHASE_NAMES = [
  'weeklyIncome',
  'courtships',
  'weight',
  'rivalTurn',
  'fronts',
  'borderCampaigns',
  'world',
  'resetAndSchedule'
] as const

export type DayPhaseName = (typeof DAY_PHASE_NAMES)[number]
export type WeekPhaseName = (typeof WEEK_PHASE_NAMES)[number]

/** What one phase leaves for a later phase or task during the same call. */
export interface PhaseHooks {
  /** Accords paid this call (D-01); `contractEnd` has already added each one's Respect (T12). */
  accordsPaid: AccordPaid[]
  /** Assaults ordered on a Gate, capital or Lair Mouth this call, and rare creatures revealed (T08); the combat phase has already announced each (T11). */
  grandBattleRequests: GrandBattleRequest[]
  /** The Orc's Warhosts launched this call (T10); the rival-turn phase has already announced each (T11). */
  warhosts: WarhostRequest[]
}

export interface PhaseContext {
  /** The campaign day being settled. */
  readonly day: ISODate
  /** Its campaign week (A-04). */
  readonly week: number
  /** True when this day's close is also a week close. */
  readonly weekClose: boolean
  readonly weekStartsOn: WeekStartsOn
  /** The ledger, for phases that read a day's inputs. Scores read `state.settlement.snapshots`. */
  readonly ledger: Ledger
  /** Posts a game event, dated `day`. It reaches `state.log` when the phase returns. */
  readonly emit: Emit
  readonly hooks: PhaseHooks
}

/** One step of settlement: takes the state and returns the next one. Must be pure and settle once. */
export type Phase = (state: CampaignState, ctx: PhaseContext) => CampaignState

const noop: Phase = (state) => state

// ── Reading the state ────────────────────────────────────────────────────────

/** The realm's reputation bonus rate: every source in `realmEffects` (Merchant Hall, Statue, items), added (A-31). */
export function reputationBonus(state: CampaignState): number {
  return realmEffects(state).reputationBonus.value
}

/** The Respite bank's cap from `realmEffects` (Mage Tower tier, the Healing Springs, the Herb Garden). */
function respiteCap(state: CampaignState): number {
  return realmEffects(state).respiteBank.value
}

/** What paying a contract on `date` reads from the realm: the reputation bonus and the pledge's minimum return. */
function payContext(state: CampaignState, date: ISODate): PayContext {
  const effects = realmEffects(state)
  return { date, minPledgeReturn: effects.minPledgeReturn.value, bonus: effects.reputationBonus.value }
}

function contractsOf(state: CampaignState): LandContract[] {
  const { active, history } = state.contracts
  return active ? [...history, active] : history
}

/** The Charter that governs `day`: the contract covering it, or else the campaign's Charter. */
export function charterOn(state: CampaignState, day: ISODate): Charter {
  const covering = contractsOf(state).filter((c) => c.startDate <= day && day <= c.endDate)
  return covering.length > 0 ? covering[covering.length - 1].charter : state.charter
}

export function snapshotOf(state: CampaignState, day: ISODate): DaySnapshot | undefined {
  return state.settlement.snapshots.find((s) => s.date === day)
}

/** Replaces the day's snapshot, or adds it in date order. */
function putSnapshot(state: CampaignState, snapshot: DaySnapshot): CampaignState {
  const list = state.settlement.snapshots
  const at = list.findIndex((s) => s.date === snapshot.date)
  const snapshots = at >= 0 ? list.map((s, i) => (i === at ? snapshot : s)) : [...list, snapshot].sort((a, b) => a.date.localeCompare(b.date))
  return { ...state, settlement: { ...state.settlement, snapshots } }
}

/** Settled campaign days from `from` through `to` as score records (never before the start). */
function records(state: CampaignState, from: ISODate, to: ISODate): DayRecord[] {
  const start = from > state.campaign.startDate ? from : state.campaign.startDate
  return snapshotsBetween(state.settlement.snapshots, start, to).map(toDayRecord)
}

/** The terms weekly income and Realm Consistency are judged by: `day`'s Charter and the current Healer floor (A-124). */
function currentTerms(state: CampaignState, day: ISODate): ScoreTerms {
  return termsOf(charterOn(state, day), state.weight.healerFloor)
}

/** Realm Consistency at `day`'s close: Q over the last 28 settled campaign days (A-39). */
export function realmConsistencyOn(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): number {
  return realmConsistency(records(state, state.campaign.startDate, day), currentTerms(state, day), weekStartsOn)
}

/** A contract's Q over its days through `through`, without its Respite days, by its sealed terms. */
export function contractScore(state: CampaignState, contract: LandContract, through: ISODate, weekStartsOn: WeekStartsOn): number {
  const last = through < contract.endDate ? through : contract.endDate
  return consistency(records(state, contract.startDate, last), termsOf(contract.charter), weekStartsOn, contract.respiteDates)
}

/** The posted size of a set of lines: each rounds to 0.1 as it enters the purse (A-11). */
function postedTotal(lines: readonly PurseLine[]): number {
  return roundPosting(lines.reduce((sum, l) => sum + roundPosting(l.amount), 0))
}

function dailyLines(state: CampaignState, snapshot: DaySnapshot): { lines: PurseLine[]; streak: number } {
  const prior = snapshotOf(state, addDays(snapshot.date, -1))
  const income = dailyIncome(
    {
      dutiesKept: snapshot.dutiesKept,
      dutiesSworn: snapshot.dutiesSworn,
      foodLogged: snapshot.eaten !== undefined,
      priorStreak: prior && prior.date >= state.campaign.startDate ? prior.streak : 0
    },
    reputationBonus(state)
  )
  return { lines: income.lines, streak: income.streak }
}

/** The week ending `day`: its campaign days, q_w and the behavior income it pays (steps, calories, flawless, Momentum). */
function weekIncome(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): { lines: PurseLine[]; qw: number; days: number } {
  const days = records(state, weekOf(day, weekStartsOn), day)
  const pillars = weekPillars(days, currentTerms(state, day))
  const qw = pillarScore(pillars)
  const { campaign } = state
  const momentum = weekMomentum({
    weighIns: weighInsOf(state.settlement.snapshots),
    day,
    qw,
    goal: toLb(campaign.goalWeight, campaign.unit),
    cap: campaign.targetPace
  })
  const lines = weeklyIncome({ ...pillars, momentum: momentum.m, days: days.length }, reputationBonus(state))
  return { lines, qw, days: days.length }
}

// ── Day phases ───────────────────────────────────────────────────────────────

/** Copies the day's inputs from the ledger (A-02). */
const snapshotInputs: Phase = (state, ctx) => putSnapshot(state, snapshotDay(ctx.ledger, ctx.day, charterOn(state, ctx.day)))

/** Banks Respite, pays duties, the perfect day and the streak, and scores the running contract so far. */
const contractsAndDaily: Phase = (state, ctx) => {
  const daysPlayed = diffDays(state.campaign.startDate, ctx.day) + 1
  let contracts = earnRespite(state.contracts, daysPlayed, respiteCap(state))

  const snapshot = snapshotOf(state, ctx.day) as DaySnapshot
  const { lines, streak } = dailyLines(state, snapshot)
  const purse = postAll(state.purse, ctx.day, lines)
  let next = putSnapshot({ ...state, purse }, { ...snapshot, streak, paid: { daily: postedTotal(lines) } })

  const active = contracts.active
  if (active && active.startDate <= ctx.day) {
    contracts = { ...contracts, active: { ...active, score: contractScore(next, active, ctx.day, ctx.weekStartsOn) } }
  }
  next = { ...next, contracts }
  return next
}

/**
 * Expires the timers that end with this day: Weary companies, scorched and contested hexes,
 * Settling villages, and Truces, pacts and calls to arms. A timer's date is the last day it
 * holds; at that day's close it is gone.
 */
const expireTimers: Phase = (state, ctx) => {
  const ended = (until: ISODate | undefined): boolean => until !== undefined && until <= ctx.day
  const hexes = state.hexes.map((h) => {
    let hex = h
    if (h.status !== 'held' && ended(h.statusUntil)) {
      hex = { ...hex, status: 'held' }
      delete hex.statusUntil
    }
    if (h.village && ended(h.village.settlingUntil)) {
      const village = { ...h.village }
      delete village.settlingUntil
      hex = { ...hex, village }
    }
    return hex
  })
  const roster = state.roster.map((c) => {
    if (!ended(c.wearyUntil)) return c
    const company = { ...c }
    delete company.wearyUntil
    return company
  })
  const deals = state.deals.filter((d) => !((d.kind === 'truce' || d.kind === 'pact' || d.kind === 'callToArms') && ended(d.until)))
  return { ...state, hexes, roster, deals }
}

/** The day's Valor (Ch 10, A-40) from its snapshot and the week so far; 0 without a snapshot. */
export function valorOn(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): number {
  const snapshot = snapshotOf(state, day)
  if (!snapshot) return 0
  return valor(toDayRecord(snapshot), records(state, weekOf(day, weekStartsOn), day), charterOn(state, day).stepPool)
}

/**
 * The Valor of the 7 days before `day`, the campaign's own days only: what a Grand Battle fought
 * on `day` reads its Readiness from (Ch 11, A-161). The battle day's own Valor isn't known until it closes.
 */
export function readinessValors(state: CampaignState, day: ISODate): number[] {
  const { weekStartsOn } = state.campaign
  const out: number[] = []
  for (let d = addDays(day, -RULES.grandBattles.readiness.valorDays); d < day; d = addDays(d, 1)) {
    if (d >= state.campaign.startDate && snapshotOf(state, d)) out.push(valorOn(state, d, weekStartsOn))
  }
  return out
}

/**
 * Defense battles, the assault, hex transfers, then spoils, tribute and Respect (T08, Ch 10). Then
 * the Grand Battles the day raised (T11): assaults on Gates, capitals and Lair Mouths, rare
 * creatures revealed, and Incursions for hexes conquered, each announced for the next dawn.
 */
const combatPhase: Phase = (state, ctx) => {
  const result = settleCombat(state, { day: ctx.day, week: ctx.week, weekStartsOn: ctx.weekStartsOn, valor: valorOn(state, ctx.day, ctx.weekStartsOn), emit: ctx.emit })
  ctx.hooks.grandBattleRequests.push(...result.grandBattles)
  const dawnAfter = addDays(ctx.day, 1)
  const announced = announceRequests(result.state, result.grandBattles, dawnAfter, ctx.emit)
  return raiseIncursions(state, announced, dawnAfter, ctx.emit)
}

/** Every Grand Battle due today and not fought by the close: the Marshal fights it (Ch 11 rule 1, T11). */
const grandBattlesAuto: Phase = (state, ctx) => grandBattlesDue(state, ctx.day, (battleDate) => readinessValors(state, battleDate), ctx.emit)

/**
 * Pays the running contract on its last day; the queued one takes the slot at the next dawn. An
 * Accord's Respect is added the same day, so no `settle` call can lose it (D-01, T12).
 */
const contractEnd: Phase = (state, ctx) => {
  const active = state.contracts.active
  if (!active || active.startDate > ctx.day || active.endDate > ctx.day) return state
  const score = contractScore(state, active, active.endDate, ctx.weekStartsOn)
  const paid = settleContract(state.contracts, state.purse, score, payContext(state, ctx.day))
  ctx.emit('contract', paid.outcome)
  const next = { ...state, contracts: paid.contracts, purse: paid.purse }
  if (!paid.accord) return next
  ctx.hooks.accordsPaid.push(paid.accord)
  return accordPaid(next, paid.accord, ctx.day, ctx.emit)
}

// ── Week phases ──────────────────────────────────────────────────────────────

/** The Bank's interest (The Bank Wing): 2% of the purse at the week close, at most 40 (T11). */
function interest(state: CampaignState, day: ISODate): CampaignState {
  const bank = realmEffects(state).interest
  const amount = Math.min(bank.cap, bank.rate * balance(state.purse))
  return amount > 0 ? { ...state, purse: post(state.purse, { date: day, kind: 'earn', amount, source: 'interest' }) } : state
}

/** The Bank's interest on the purse as the week closes, then step pool, calorie average, flawless week and Momentum (prorated in a partial week 1), then tithes. */
const weeklyIncomePhase: Phase = (input, ctx) => {
  const state = interest(input, ctx.day)
  const { lines, days } = weekIncome(state, ctx.day, ctx.weekStartsOn)
  const villages = state.hexes
    .filter((h) => h.owner === 'player' && h.village)
    .map((h) => ({
      hexId: h.id,
      ring: h.ring,
      settling: h.village?.settlingUntil !== undefined && h.village.settlingUntil > ctx.day,
      scorched: h.status === 'scorched'
    }))
  const effects = realmEffects(state)
  const titheLines = tithes(villages, effects.titheMult.value * effects.titheCut.value, reputationBonus(state), days)
  const purse = postAll(postAll(state.purse, ctx.day, lines), ctx.day, titheLines)
  const snapshot = snapshotOf(state, ctx.day) as DaySnapshot
  const income = postedTotal(lines)
  ctx.emit('weekClosed', { week: ctx.week, income })
  return putSnapshot({ ...state, purse }, { ...snapshot, paid: { daily: snapshot.paid?.daily ?? 0, weekly: income } })
}

/**
 * Courtships resolve at the week's Realm Consistency (Ch 6): rival bids join the player's and rivals
 * counter-bid (T10), the player's courtships resolve, then the rival bids nobody else made (T10).
 * Then the player's villages recover loyalty (A-22) (T09).
 */
const courtshipsPhase: Phase = (state, ctx) => {
  const week = { day: ctx.day, realmConsistency: realmConsistencyOn(state, ctx.day, ctx.weekStartsOn), emit: ctx.emit }
  const resolved = recoverLoyalty(resolveRivalCourtships(resolveCourtships(rivalBidsAtClose(state, ctx.day), week), week))
  // Villages courted away can raise an Incursion (A-33, T11).
  return raiseIncursions(state, resolved, addDays(ctx.day, 1), ctx.emit)
}

/** Trend, target pace, Milestones, Steadiness, the Crown's Grace and the Healer's floor (T05). */
const weightPhase: Phase = (state, ctx) => {
  const result = closeWeightWeek(state.campaign, state.weight, {
    day: ctx.day,
    week: ctx.week,
    weighIns: weighInsOf(state.settlement.snapshots),
    days: state.settlement.snapshots.map(toHealerDay),
    qw: weekIncome(state, ctx.day, ctx.weekStartsOn).qw,
    realmConsistency: realmConsistencyOn(state, ctx.day, ctx.weekStartsOn)
  })
  for (const m of result.broken) {
    ctx.emit('milestone', { index: m.index, mark: m.mark, byDispensation: m.byDispensation === true })
    ctx.emit('unlock', { milestone: m.index, unlocks: milestoneUnlocks(m.index) })
  }
  if (result.grace.from !== result.grace.to) ctx.emit('grace', result.grace)
  for (const note of result.checkIns) ctx.emit('healer', { checkIn: note.checkIn })
  return { ...state, weight: result.weight }
}

/** The week as the rivals see it (T10): its days, pillars and average Valor. */
function rivalWeek(state: CampaignState, ctx: PhaseContext): RivalWeek {
  const from = weekOf(ctx.day, ctx.weekStartsOn)
  const days = records(state, from, ctx.day)
  const valors = days.map((d) => valorOn(state, d.date, ctx.weekStartsOn))
  return {
    day: ctx.day,
    week: ctx.week,
    weekStartsOn: ctx.weekStartsOn,
    days: days.length,
    valor: valors.length > 0 ? valors.reduce((s, v) => s + v, 0) / valors.length : 0,
    habits: { days, pillars: weekPillars(days, currentTerms(state, ctx.day)) },
    emit: ctx.emit
  }
}

/** Each active rival's weekly turn (Ch 12 steps 1 to 8); the Orc's Warhosts are announced at once, Incursion-style (T10, T11, A-151). */
const rivalTurnPhase: Phase = (state, ctx) => {
  const result = rivalTurn(state, rivalWeek(state, ctx))
  ctx.hooks.warhosts.push(...result.warhosts)
  let next = result.state
  for (const w of result.warhosts) next = announceGrandBattle(next, { trigger: 'warhost', hexId: w.hexId, rival: w.rival, announcedOn: addDays(ctx.day, 1) }, ctx.emit).state
  return next
}

/** The week's skirmishes on the Rim fronts at War, war losses, and Peace pulling tracks to 0 (T10). */
const frontsPhase: Phase = (state, ctx) => settleFronts(state, rivalWeek(state, ctx))

/** Border Campaigns in a hidden Border Campaign week, then next week's front states (T10). */
const borderCampaignsPhase: Phase = (state, ctx) => borderCampaigns(state, rivalWeek(state, ctx))

/** Coalitions, held resolutions and defections, the event deck, Ascendancy and Ultimatums (T12, Ch 13, Ch 14). */
const worldPhase: Phase = (state, ctx) =>
  worldWeek(state, {
    day: ctx.day,
    week: ctx.week,
    days: records(state, weekOf(ctx.day, ctx.weekStartsOn), ctx.day).length,
    realmConsistency: realmConsistencyOn(state, ctx.day, ctx.weekStartsOn),
    emit: ctx.emit
  })

/** Resets garrison damage, keeps the hidden Border Campaign schedule ahead of the campaign, and draws next week's threats (T08, A-28). */
const resetAndSchedule: Phase = (state, ctx) => {
  const hexes = state.hexes.some((h) => h.garrisonDamage !== 0) ? state.hexes.map((h) => (h.garrisonDamage === 0 ? h : { ...h, garrisonDamage: 0 })) : state.hexes
  const ahead = ctx.week + RULES.settlement.borderScheduleAheadWeeks
  const scheduled = state.settlement.borderCampaignWeeks
  const borderWeeks =
    scheduled.length > 0 && scheduled[scheduled.length - 1] >= ahead ? scheduled : borderCampaignWeeks(state.campaign.seed, state.campaign.startDate, ahead)
  const reset = { ...state, hexes, settlement: { ...state.settlement, borderCampaignWeeks: borderWeeks } }
  return scheduleThreats(reset, addDays(ctx.day, 1), addDays(ctx.day, RULES.clock.daysPerWeek))
}

/** The day phases. Later tasks replace their entry (T08 `combat`, T11 `grandBattlesAuto`). */
export const DAY_PHASES: Record<DayPhaseName, Phase> = {
  syncNote: noop, // Fitbit syncs before `settle` is called.
  snapshotInputs,
  contractsAndDaily,
  combat: combatPhase, // T08
  grandBattlesAuto, // T11
  expireTimers,
  contractEnd
}

/** The week phases. Later tasks replace their entry (T09 `courtships`, T10 `rivalTurn` `fronts` `borderCampaigns`, T12 `world`). */
export const WEEK_PHASES: Record<WeekPhaseName, Phase> = {
  weeklyIncome: weeklyIncomePhase,
  courtships: courtshipsPhase, // T09
  weight: weightPhase,
  rivalTurn: rivalTurnPhase, // T10
  fronts: frontsPhase, // T10
  borderCampaigns: borderCampaignsPhase, // T10
  world: worldPhase, // T12
  resetAndSchedule
}

// ── Running it ───────────────────────────────────────────────────────────────

/** Runs `names` in order; the Fall (a lost Siege) stops the rest (Ch 14 rule 6). */
function runPhases<N extends string>(state: CampaignState, names: readonly N[], phases: Record<N, Phase>, ctx: PhaseContext, events: EventBuffer): CampaignState {
  let next = state
  for (const name of names) {
    next = events.flush(phases[name](next, ctx))
    if (!isPlayable(next)) break
  }
  return next
}

/**
 * Settles one closed day: its day phases, then the week phases when its close is a week close,
 * then the next dawn, which fixes the next day's tidings on the border as it now stands (T08).
 */
function settleDay(state: CampaignState, ledger: Ledger, day: ISODate, events: EventBuffer, hooks: PhaseHooks): CampaignState {
  const { weekStartsOn } = state.campaign
  const week = campaignWeek(state.campaign.startDate, day, weekStartsOn)
  const weekClose = isWeekCloseDay(day, weekStartsOn)
  const ctx: PhaseContext = { day, week, weekClose, weekStartsOn, ledger, emit: events.emitter(day), hooks }
  let next = runPhases(state, DAY_PHASE_NAMES, DAY_PHASES, ctx, events)
  if (weekClose && isPlayable(next)) next = runPhases(next, WEEK_PHASE_NAMES, WEEK_PHASES, ctx, events)
  if (isPlayable(next)) next = dawn(next, addDays(day, 1), weekStartsOn)
  return { ...next, settledThrough: { day, week } }
}

/** True while `day` can still be corrected at `now`: until the day after it closes (A-02). */
export function isCorrectable(day: ISODate, now: Date, timeZone: string): boolean {
  return diffDays(day, openDay(now, timeZone)) <= 1 + RULES.clock.correctionGraceDays
}

/**
 * Takes in a ledger correction to the last settled day while it is inside the grace window
 * (A-02). The snapshot is updated; daily and weekly income, a paid contract and the running
 * contract's score are recomputed. Anything that would now pay more posts an `adjust`; nothing
 * that was paid is ever lowered. Combat, courtships, rival turns and events are never rerun.
 */
function correctLastDay(state: CampaignState, ledger: Ledger, now: Date, events: EventBuffer): CampaignState {
  const day = state.settledThrough.day
  if (!isCorrectable(day, now, state.campaign.timeZone)) return state
  const old = snapshotOf(state, day)
  const fresh = snapshotDay(ledger, day, charterOn(state, day))
  if (old && sameInputs(old, fresh)) return state

  let next = putSnapshot(state, { ...fresh, streak: old?.streak ?? 0, ...(old?.paid ? { paid: old.paid } : {}) })
  if (day < state.campaign.startDate) return next // the founding day: inputs only

  const { weekStartsOn } = state.campaign
  let adjustment = 0
  const adjust = (amount: number, source: string): void => {
    if (amount <= 0) return
    next = { ...next, purse: post(next.purse, { date: day, kind: 'adjust', amount, source }) }
    adjustment = roundPosting(adjustment + amount)
  }

  const daily = dailyLines(next, snapshotOf(next, day) as DaySnapshot)
  const paid = { ...(old?.paid ?? { daily: 0 }) }
  const dailyTotal = postedTotal(daily.lines)
  adjust(roundPosting(dailyTotal - paid.daily), `correction:daily:${day}`)
  paid.daily = Math.max(paid.daily, dailyTotal)
  if (paid.weekly !== undefined) {
    const weeklyTotal = postedTotal(weekIncome(next, day, weekStartsOn).lines)
    adjust(roundPosting(weeklyTotal - paid.weekly), `correction:weekly:${day}`)
    paid.weekly = Math.max(paid.weekly, weeklyTotal)
  }
  next = putSnapshot(next, { ...(snapshotOf(next, day) as DaySnapshot), streak: daily.streak, paid })

  const ctx = payContext(next, day)
  for (const c of next.contracts.history) {
    if (!c.paid || c.startDate > day || day > c.endDate) continue
    const late = lateCorrection(next.contracts, next.purse, c.id, contractScore(next, c, c.endDate, weekStartsOn), ctx)
    next = { ...next, contracts: late.contracts, purse: late.purse }
    adjustment = roundPosting(adjustment + late.adjustment)
  }
  const active = next.contracts.active
  if (active && active.startDate <= day && day <= active.endDate) {
    next = { ...next, contracts: { ...next.contracts, active: { ...active, score: contractScore(next, active, day, weekStartsOn) } } }
  }

  if (adjustment > 0) {
    events.emitter(day)('correction', { correctedDay: day, adjustment })
    next = events.flush(next)
  }
  return next
}

// ── The summary for the Homecoming (A-45) ────────────────────────────────────

export interface SettledDay {
  day: ISODate
  week: number
  /** This day's close was also a week close. */
  weekClosed: boolean
  events: GameEvent[]
  /** The purse's change from this day's settlement. */
  purseChange: number
}

export interface SettleSummary {
  /** Every day settled by this call, oldest first. */
  days: SettledDay[]
  /** The campaign weeks closed by this call. */
  weeksClosed: number[]
  /** Battles held: defenses won or routed. */
  held: GameEvent[]
  /** What was lost: defenses lost and hexes taken from the player. */
  lost: GameEvent[]
  /** The purse's change over the whole call, corrections included. */
  purseChange: number
  /** Days since the previous launch (A-10), on a launch; otherwise 0. */
  awayDays: number
  /** Show the Homecoming: 3 or more days settled at once, or away 14 or more days (A-45). */
  homecoming: boolean
}

export interface SettleOptions {
  /** This call is the app's launch: record the launch date (A-10). */
  launch?: boolean
}

export interface SettleResult {
  state: CampaignState
  /** The events this call posted, in order. */
  events: GameEvent[]
  summary: SettleSummary
}

function summarize(days: SettledDay[], events: GameEvent[], purseChange: number, awayDays: number): SettleSummary {
  const held = events.filter((e) => e.kind === 'defense' && e.outcome !== 'defeat')
  const lost = events.filter((e) => (e.kind === 'defense' && e.outcome === 'defeat') || (e.kind === 'hexTransfer' && e.from === 'player'))
  return {
    days,
    weeksClosed: days.filter((d) => d.weekClosed).map((d) => d.week),
    held,
    lost,
    purseChange,
    awayDays,
    homecoming: days.length >= RULES.clock.homecomingCatchUpDays || awayDays >= RULES.clock.absenceDays
  }
}

/**
 * Settles the campaign up to `now`: first any correction to the last settled day still inside
 * its grace window, then every closed day in order (missed days run with no orders), with the week
 * phases after each week's last day. Pure: it reads `ledger` and returns the next state, the
 * events it posted and a summary for the Homecoming. With nothing new to settle it returns the
 * same state and no events.
 */
export function settle(state: CampaignState, ledger: Ledger, now: Date, options: SettleOptions = {}): SettleResult {
  const { timeZone } = state.campaign
  const events = new EventBuffer()
  const hooks: PhaseHooks = { accordsPaid: [], grandBattleRequests: [], warhosts: [] }
  const balanceBefore = balance(state.purse)
  let next = isPlayable(state) ? correctLastDay(state, ledger, now, events) : state

  // A launch after 14 or more days away is a return (A-10): no Siege may fall within 7 days of it (Ch 14 rule 7).
  const today = openDay(now, timeZone)
  const last = next.settlement.lastLaunch
  const awayDays = options.launch && last !== undefined ? Math.max(0, diffDays(last, today)) : 0
  if (awayDays >= RULES.clock.absenceDays) next = { ...next, settlement: { ...next.settlement, returnedOn: today } }

  const days: SettledDay[] = []
  if (isPlayable(next)) {
    for (const day of closedDaysSince(next.settledThrough.day, now, timeZone)) {
      const before = balance(next.purse)
      const from = events.all.length
      next = settleDay(next, ledger, day, events, hooks)
      days.push({
        day,
        week: next.settledThrough.week,
        weekClosed: isWeekCloseDay(day, next.campaign.weekStartsOn),
        events: events.all.slice(from),
        purseChange: roundPosting(balance(next.purse) - before)
      })
      // After the Fall nothing more settles (Ch 14 rule 6).
      if (!isPlayable(next)) break
    }
  }

  // The open day's dawn, if no settled day has brought it yet (the campaign's first day).
  if (isPlayable(next)) next = dawn(next, today)

  if (options.launch && last !== today) next = { ...next, settlement: { ...next.settlement, lastLaunch: today } }

  return {
    state: next,
    events: events.all,
    summary: summarize(days, events.all, roundPosting(balance(next.purse) - balanceBefore), awayDays)
  }
}
