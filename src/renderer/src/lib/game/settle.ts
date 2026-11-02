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
import { addDays, campaignWeek, diffDays, isWeekCloseDay, openDay, closedDaysSince, weekOf, weighInDay } from './clock'
import { dawn, patrolStrength, scheduleThreats, settleCombat, type GrandBattleRequest } from './combat'
import { withReach } from './reach'
import { earnRespite, lateCorrection, settleContract, type AccordPaid, type PayContext } from './contracts'
import { balance, dailyIncome, faithfulIncome, momentumIncome, post, postAll, roundPosting, tithes, weeklyIncome } from './economy'
import { realmEffects } from './effects'
import { announceGrandBattle, announceRequests, grandBattlesDue, raiseIncursions, restGrandBattles } from './grand'
import { chronicle } from './dominion'
import { dealEnds, recoverLoyalty, resolveCourtships, resolveRivalCourtships } from './land'
import { bandOf } from './map'
import { resolveGoblinBids } from './goblin'
// Patch 4 (D-31): installs the Archmage's surges into combat's dawn.
import './surges'
import { prepareMarches } from './marches'
import { marchRulesDay } from './personalities'
import { sameInputs, snapshotDay, snapshotsBetween, toDayRecord, toHealerDay, weighInsOf } from './ledgerDays'
import { borderCampaigns, dailyStandings, lateWeekRespect, rivalBidsAtClose, rivalMovesDay, rivalTurn, settleFronts, skirmishFronts, type RivalWeek, type WarhostRequest, type WeekKept } from './rivals'
import { dailyStances } from './terms'
import { RULES } from './rules'
import { finishSkirmishes } from './skirmish'
import { EventBuffer, awayOn, isPlayable, isRestDay, respiteDays } from './state'
import { accordPaid, worldWeek } from './world'
import { consistency, pillarScore, realmConsistency, termsOf, valor, weekPillars, type ScoreTerms } from './score'
import { breakMilestonesOnDay, closeWeightWeek, toLb, weekMomentum, type StepWeek } from './weight'
import type { CampaignState, Charter, DayRecord, DaySnapshot, Emit, GameEvent, ISODate, LandContract, MilestoneState, PurseLine, WeekStartsOn, WeighIn } from './types'

// ── The phase registry ───────────────────────────────────────────────────────

/** Day phases, in Appendix A's order. */
export const DAY_PHASE_NAMES = [
  'syncNote',
  'snapshotInputs',
  'contractsAndDaily',
  'combat',
  'grandBattlesAuto',
  'expireTimers',
  'contractEnd',
  'chronicle',
  /** Patch 4 (D-28): the day's battles with the Orc move his war track; his beaten attacks cost him army. */
  'marchRules',
  /** Patch 6 (D-49, D-50): each rival's standing and stance read after the day's battles moved them. */
  'standings',
  /** Patch 6 (D-50): the day's skirmish on each Rim front at War. */
  'fronts',
  /** Patch 6 (D-50): the rivals' land grabs and walls due today. */
  'rivalMoves',
  /** Rules 3.5.0 (D-53): a Milestone whose weigh-in reached its mark breaks at that day's close. */
  'milestones',
  /** Rules 3.11.0 (D-69): the week's weigh-in pays Faithful at the Scale and settles its weight week at that day's close. */
  'weighIn'
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
  'resetAndSchedule',
  'marches',
  'chronicle'
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

/** Every contract that has run or is running, oldest first. */
export function contractsOf(state: CampaignState): LandContract[] {
  const { active, history } = state.contracts
  return active ? [...history, active] : history
}

/**
 * The Charter that governs `day`: the contract covering it; or else, for a campaign re-founded as of
 * an earlier day, the terms of that time (D-21, P2-11); or else the campaign's Charter.
 */
export function charterOn(state: CampaignState, day: ISODate): Charter {
  const covering = contractsOf(state).filter((c) => c.startDate <= day && day <= c.endDate)
  if (covering.length > 0) return covering[covering.length - 1].charter
  const span = state.charterHistory?.find((s) => s.from <= day && day <= s.until)
  return span ? span.charter : state.charter
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

/** The settled days from `from` through `to` that the scores read: rest days left out of every one (D-54). */
function scoredRecords(state: CampaignState, from: ISODate, to: ISODate): DayRecord[] {
  const rest = new Set(respiteDays(state))
  return records(state, from, to).filter((d) => !rest.has(d.date))
}

/** The streak a day builds on (Ch 5): the day before's. A rest day counts as a day kept (D-54), even one spent after it closed. */
export function streakBefore(state: CampaignState, day: ISODate): number {
  const d = addDays(day, -1)
  if (d < state.campaign.startDate) return 0
  if (isRestDay(state, d)) return streakBefore(state, d) + 1
  return snapshotOf(state, d)?.streak ?? 0
}

/**
 * A rest day's pay (D-54), a paid day off: a full day's daily lines (every one of its `dutiesSworn`
 * duties kept, food logged, the perfect day and the streak), each × Realm Consistency. The streak grows.
 */
export function restDayIncome(state: CampaignState, day: ISODate, dutiesSworn: number): { lines: PurseLine[]; streak: number } {
  const full = dailyIncome({ dutiesKept: dutiesSworn, dutiesSworn, foodLogged: true, priorStreak: streakBefore(state, day) }, reputationBonus(state))
  const rc = realmConsistencyOn(state, day, state.campaign.weekStartsOn)
  return { lines: full.lines.map((l) => ({ ...l, amount: l.amount * rc })), streak: full.streak }
}

/** The terms weekly income and Realm Consistency are judged by: `day`'s Charter and the current Healer floor (A-124). */
export function currentTerms(state: CampaignState, day: ISODate): ScoreTerms {
  return termsOf(charterOn(state, day), state.weight.healerFloor)
}

/** Realm Consistency at `day`'s close: Q over the last 28 settled campaign days (A-39), rest days left out (D-54). */
export function realmConsistencyOn(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): number {
  return realmConsistency(scoredRecords(state, state.campaign.startDate, day), currentTerms(state, day), weekStartsOn)
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
  if (isRestDay(state, snapshot.date)) return restDayIncome(state, snapshot.date, snapshot.dutiesSworn)
  const income = dailyIncome(
    {
      dutiesKept: snapshot.dutiesKept,
      dutiesSworn: snapshot.dutiesSworn,
      foodLogged: snapshot.eaten !== undefined,
      priorStreak: streakBefore(state, snapshot.date)
    },
    reputationBonus(state)
  )
  return { lines: income.lines, streak: income.streak }
}

/**
 * The week ending `day`: q_w and the behavior income it pays (steps, calories, flawless, Momentum).
 * Its pillars read its scored days only, rest days left out, so the step pool shrinks by a day's share
 * for each (D-54); its pay still counts every day, so a rest day never slows it. A week of rest days
 * only is judged at Realm Consistency, as a rest day is. A week whose weigh-in already settled its
 * weight week paid its Momentum then, so its close pays none (D-69).
 */
function weekIncome(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): { lines: PurseLine[]; qw: number } {
  const from = weekOf(day, weekStartsOn)
  const days = scoredRecords(state, from, day)
  const rc = days.length > 0 ? null : realmConsistencyOn(state, day, weekStartsOn)
  const pillars = rc === null ? weekPillars(days, currentTerms(state, day)) : { steps: rc, table: rc, duties: rc }
  const qw = pillarScore(pillars)
  const { campaign } = state
  const momentum = weekMomentum({
    weighIns: weighInsOf(state.settlement.snapshots, weekStartsOn),
    day,
    qw,
    goal: toLb(campaign.goalWeight, campaign.unit),
    cap: campaign.targetPace
  })
  const paidAtWeighIn = state.weight.weeks.some((w) => w.day >= from && w.day < day)
  const lines = weeklyIncome({ ...pillars, momentum: paidAtWeighIn ? 0 : momentum.m, days: records(state, from, day).length }, reputationBonus(state))
  return { lines, qw }
}

/**
 * The reading `day`'s week counts (D-13), once it is final at `day`'s close: one taken on or after the
 * week's weigh-in day and by `day`, or at the week close any reading of the week (as D-53 reads it).
 * Never a reading from before the campaign began.
 */
export function weekReading(state: CampaignState, day: ISODate): WeighIn | undefined {
  const { weekStartsOn, startDate } = state.campaign
  const week = weekOf(day, weekStartsOn)
  const reading = weighInsOf(state.settlement.snapshots, weekStartsOn).find((w) => weekOf(w.date, weekStartsOn) === week && w.date <= day)
  if (!reading || reading.date < startDate) return undefined
  return reading.date >= weighInDay(day, weekStartsOn) || isWeekCloseDay(day, weekStartsOn) ? reading : undefined
}

/** The habits score a weigh-in's weight week reads when it settles before its week close (D-69): the calendar week that closed last. */
export function weighInQw(state: CampaignState, day: ISODate): number {
  const { weekStartsOn } = state.campaign
  return weekIncome(state, addDays(weekOf(day, weekStartsOn), -1), weekStartsOn).qw
}

/**
 * The closed weeks the Healer's step pool reads at `day` (D-69, H2), newest first: whether each met its
 * pool and its steps scaled to a full week, rest days left out (D-54). A week of rest only is skipped;
 * it looks back no further than the campaign's first week.
 */
function stepWeeks(state: CampaignState, day: ISODate): StepWeek[] {
  const { weekStartsOn, startDate } = state.campaign
  const s = RULES.healer.counsel.steps
  const out: StepWeek[] = []
  let last = isWeekCloseDay(day, weekStartsOn) ? day : addDays(weekOf(day, weekStartsOn), -1)
  for (let i = 0; i < s.lookbackWeeks && out.length < s.weeks && last >= startDate; i++, last = addDays(last, -RULES.clock.daysPerWeek)) {
    const days = scoredRecords(state, weekOf(last, weekStartsOn), last)
    if (days.length === 0) continue
    const walked = days.reduce((sum, d) => sum + Math.max(0, d.steps ?? 0), 0)
    out.push({ met: weekPillars(days, currentTerms(state, last)).steps >= 1, walked: (walked * RULES.clock.daysPerWeek) / days.length })
  }
  return out
}

/**
 * The streak Faithful at the Scale pays `day`'s week's weigh-in on (D-69, W4): its own once it has
 * one, else the weeks in a row before `day`'s week with a campaign weigh-in, read from the snapshots.
 */
export function faithfulStreak(state: CampaignState, day: ISODate): number {
  if (state.weight.faithful) return state.weight.faithful.streak
  const { weekStartsOn, startDate } = state.campaign
  const weeks = new Set(weighInsOf(state.settlement.snapshots, weekStartsOn).filter((w) => w.date >= startDate).map((w) => weekOf(w.date, weekStartsOn)))
  let n = 0
  for (let w = addDays(weekOf(day, weekStartsOn), -RULES.clock.daysPerWeek); weeks.has(w); w = addDays(w, -RULES.clock.daysPerWeek)) n++
  return n
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
 * Settling villages, and every deal with a last day but the Goblin's buy-off (Patch 8: kept, it pays). A
 * timer's date is the last day it holds; at that day's close it is gone.
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
  // Patch 8 (D-64): every deal with a last day ends at its close; a pact or oath kept pays, a call to arms reports (`dealEnds`).
  const ending = state.deals.filter((d) => d.kind !== 'buyOff' && ended(d.until))
  let next: CampaignState = { ...state, hexes, roster, deals: state.deals.filter((d) => !ending.includes(d)) }
  for (const d of ending) next = dealEnds(next, d, ctx.day, ctx.emit)
  return next
}

/**
 * The day's Valor (Ch 10, A-40) from its snapshot and the week so far, its rest days left out of the
 * pace; 0 without a snapshot. A rest day's Valor is Realm Consistency (D-54), whatever was logged.
 */
export function valorOn(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): number {
  if (isRestDay(state, day)) return realmConsistencyOn(state, day, weekStartsOn)
  const snapshot = snapshotOf(state, day)
  if (!snapshot) return 0
  return valor(toDayRecord(snapshot), scoredRecords(state, weekOf(day, weekStartsOn), day), charterOn(state, day).stepPool)
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
 * Patch 7 (A2, D-56): the realm's reach at `day`'s dawn, from its patrol at the Valor of the 7 days
 * before (`startValor` before there are any). Fixed once for the day. Absence never costs anything
 * (X-17, R-24): while the player is away the reach holds where it was.
 */
function reachAtDawn(state: CampaignState, day: ISODate): CampaignState {
  if (!isPlayable(state) || state.reach?.day === day) return state
  if (state.reach && awayOn(state, day)) return { ...state, reach: { ...state.reach, day } }
  const valors = readinessValors(state, day)
  const valor = valors.length > 0 ? valors.reduce((s, v) => s + v, 0) / valors.length : RULES.reach.startValor
  return withReach(state, day, patrolStrength(state, day, valor), valor)
}

/**
 * Defense battles, the assault, hex transfers, then spoils, tribute and Respect (T08, Ch 10). Then
 * the Grand Battles the day raised (T11): assaults on Gates, capitals and Lair Mouths, rare
 * creatures revealed, and Incursions for hexes conquered, each announced for the next dawn.
 */
const combatPhase: Phase = (state, ctx) => {
  // The fights the player led and left unfinished, the Marshal finishes first; their results stand in for the formula's (D-12).
  const led = finishSkirmishes(state, ctx.day)
  const result = settleCombat(led, { day: ctx.day, week: ctx.week, weekStartsOn: ctx.weekStartsOn, valor: valorOn(state, ctx.day, ctx.weekStartsOn), emit: ctx.emit })
  ctx.hooks.grandBattleRequests.push(...result.grandBattles)
  const dawnAfter = addDays(ctx.day, 1)
  const announced = announceRequests(result.state, result.grandBattles, dawnAfter, ctx.emit)
  return raiseIncursions(state, announced, dawnAfter, ctx.emit)
}

/** Every Grand Battle due today and not fought by the close: the Marshal fights it (Ch 11 rule 1, T11); on a rest day it waits a day (D-54). */
const grandBattlesAuto: Phase = (state, ctx) =>
  isRestDay(state, ctx.day) ? restGrandBattles(state, ctx.day, ctx.emit) : grandBattlesDue(state, ctx.day, (battleDate) => readinessValors(state, battleDate), ctx.emit)

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
  const { lines } = weekIncome(state, ctx.day, ctx.weekStartsOn)
  const days = records(state, weekOf(ctx.day, ctx.weekStartsOn), ctx.day).length
  const villages = state.hexes
    .filter((h) => h.owner === 'player' && h.village)
    .map((h) => ({
      hexId: h.id,
      band: bandOf(h),
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
  // Patch 4 (D-29, P4-03): the Goblin's bids for the player's villages resolve first, against loyalty and the player's holds.
  const bids = resolveGoblinBids(state, ctx.day, week.realmConsistency, ctx.emit)
  const resolved = recoverLoyalty(resolveRivalCourtships(resolveCourtships(rivalBidsAtClose(bids, ctx.day), week), week))
  // Villages courted away can raise an Incursion (A-33, T11).
  return raiseIncursions(state, resolved, addDays(ctx.day, 1), ctx.emit)
}

/** Announces each Milestone broken, and what it opens. */
function announceMilestones(broken: readonly MilestoneState[], emit: Emit): void {
  for (const m of broken) {
    emit('milestone', { index: m.index, mark: m.mark, byDispensation: m.byDispensation === true })
    emit('unlock', { milestone: m.index, unlocks: milestoneUnlocks(m.index) })
  }
}

/**
 * One campaign week's weight (T05, D-69): trend, target pace, Momentum's record, Milestones,
 * Steadiness, the Crown's Grace, the Healer's floor and terms, with habits score `qw`. Settles once.
 */
function closeWeight(state: CampaignState, ctx: PhaseContext, qw: number): { state: CampaignState; momentum: number } {
  const result = closeWeightWeek(state.campaign, state.weight, {
    day: ctx.day,
    week: ctx.week,
    weighIns: weighInsOf(state.settlement.snapshots, ctx.weekStartsOn),
    days: state.settlement.snapshots.map(toHealerDay),
    qw,
    realmConsistency: realmConsistencyOn(state, ctx.day, ctx.weekStartsOn),
    steps: { pool: state.charter.stepPool, weeks: stepWeeks(state, ctx.day) },
    restDays: respiteDays(state)
  })
  announceMilestones(result.broken, ctx.emit)
  if (result.grace.from !== result.grace.to) ctx.emit('grace', result.grace)
  for (const note of result.checkIns) ctx.emit('healer', { checkIn: note.checkIn })
  const next = { ...state, weight: result.weight }
  const recorded = result.weight.weeks.length > state.weight.weeks.length
  return { state: recorded ? healerSetsTerms(next, ctx.emit) : next, momentum: result.momentum.m }
}

/**
 * Rules 3.12.0 (D-72, H5): the Healer's terms bind. A new weight week's calorie limit and step pool
 * become the Charter's, so the next contract seals under them; a running contract keeps the terms it
 * was sealed with (A-124), and the player keeps the duties. A figure she can't set yet stays as it was.
 * With medical supervision confirmed her terms stay advice.
 */
function healerSetsTerms(state: CampaignState, emit: Emit): CampaignState {
  const c = state.weight.counsel
  if (!c || state.campaign.medicalSupervision) return state
  const calorieLimit = c.calorieLimit ?? state.charter.calorieLimit
  const stepPool = c.stepPool ?? state.charter.stepPool
  const floor = state.weight.healerFloor
  const charter: Charter = { ...state.charter, duties: [...state.charter.duties], calorieLimit, stepPool, ...(floor !== undefined ? { calorieFloor: floor } : {}) }
  if (calorieLimit !== state.charter.calorieLimit || stepPool !== state.charter.stepPool) emit('charter', { stepPool, calorieLimit, duties: [...charter.duties], by: 'healer' })
  return { ...state, charter }
}

/** The week's weight at its close, with its own habits score, unless its weigh-in already settled it (D-69). */
const weightPhase: Phase = (state, ctx) => closeWeight(state, ctx, weekIncome(state, ctx.day, ctx.weekStartsOn).qw).state

/**
 * Faithful at the Scale (rules 3.11.0, D-69, W4): the week's weigh-in pays at the close of the day it
 * is final, once a week and whatever it reads, more for each week in a row before it with one. At a
 * week close with none the streak ends, unless the player was away (A-10) or the week was all rest (D-54).
 */
function faithfulWeighIn(state: CampaignState, ctx: PhaseContext): CampaignState {
  const f = state.weight.faithful
  if (f?.paidWeek === ctx.week) return state
  if (weekReading(state, ctx.day)) {
    const streak = faithfulStreak(state, ctx.day)
    const purse = postAll(state.purse, ctx.day, faithfulIncome(streak, reputationBonus(state)))
    return { ...state, purse, weight: { ...state.weight, faithful: { streak: streak + 1, paidWeek: ctx.week } } }
  }
  if (!ctx.weekClose) return state
  const held = awayOn(state, ctx.day) || records(state, weekOf(ctx.day, ctx.weekStartsOn), ctx.day).every((d) => isRestDay(state, d.date))
  const streak = held ? faithfulStreak(state, ctx.day) : 0
  return { ...state, weight: { ...state.weight, faithful: { streak, ...(f?.paidWeek !== undefined ? { paidWeek: f.paidWeek } : {}) } } }
}

/**
 * Rules 3.11.0 (D-69, W1): the week's weigh-in pays Faithful at the Scale, and from week 2 settles
 * its weight week at the close of the day it came in, Momentum paid then, reading the trend through
 * that reading and the habits of the week that closed last. A week close settles its own week as
 * before, and so does the close of a week whose weigh-in never came.
 */
const weighInPhase: Phase = (input, ctx) => {
  const state = faithfulWeighIn(input, ctx)
  if (ctx.weekClose || ctx.week < 2 || state.weight.weeks.some((w) => w.week === ctx.week) || !weekReading(state, ctx.day)) return state
  const settled = closeWeight(state, ctx, weighInQw(state, ctx.day))
  const lines = momentumIncome(settled.momentum, reputationBonus(state))
  const next = { ...settled.state, purse: postAll(settled.state.purse, ctx.day, lines) }
  const snapshot = snapshotOf(next, ctx.day) as DaySnapshot
  return putSnapshot(next, { ...snapshot, paid: { ...(snapshot.paid ?? { daily: 0 }), momentum: postedTotal(lines) } })
}

/** The week ending `day` as the habit-based Respect reads it: its pillars without its rest days (D-54), and Realm Consistency at its close. */
function weekKept(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn): WeekKept {
  const days = scoredRecords(state, weekOf(day, weekStartsOn), day)
  return { habits: { days, pillars: weekPillars(days, currentTerms(state, day)) }, realmConsistency: realmConsistencyOn(state, day, weekStartsOn) }
}

/** The week as the rivals see it (T10): its days, its average Valor (a rest day's its Realm Consistency), and its pillars without its rest days (D-54). */
function rivalWeek(state: CampaignState, ctx: PhaseContext): RivalWeek {
  const all = records(state, weekOf(ctx.day, ctx.weekStartsOn), ctx.day)
  const valors = all.map((d) => valorOn(state, d.date, ctx.weekStartsOn))
  return {
    day: ctx.day,
    week: ctx.week,
    weekStartsOn: ctx.weekStartsOn,
    days: all.length,
    valor: valors.length > 0 ? valors.reduce((s, v) => s + v, 0) / valors.length : 0,
    ...weekKept(state, ctx.day, ctx.weekStartsOn),
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

/** Next week's front states (T10). Border Campaigns are gone (R-26): the fronts stay abstract weekly rolls. */
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

/** Draws next week's threats (T08, A-28). Patch 3 (D-22, X-07): siege wear no longer resets here; it stays until the hex falls (`sieges.ts`). */
const resetAndSchedule: Phase = (state, ctx) => scheduleThreats(state, addDays(ctx.day, 1), addDays(ctx.day, RULES.clock.daysPerWeek))

/** Each rival march's preparation level: up after a quiet week, down after a pushed one (D-19). */
const marchesPhase: Phase = (state, ctx) => prepareMarches(state, ctx.day, ctx.emit)

/** The chronicle (D-18): the deeds the log holds since it last read it, their Renown, and new path ranks. */
const chroniclePhase: Phase = (state, ctx) => chronicle(state, ctx.emit)

/** Patch 4 (D-28): the march rules that read the day once it has closed: the Orc's war track and his attrition. */
const marchRulesPhase: Phase = (state, ctx) => marchRulesDay(state, ctx.day, ctx.emit)

/** Patch 6 (D-49, D-50): Peace, Tension and War follow Respect each day, and so do the stances. */
const standingsPhase: Phase = (state, ctx) =>
  dailyStances(
    dailyStandings(state, ctx.day, ctx.emit, () => rivalWeek(state, ctx)),
    ctx.day,
    ctx.week,
    ctx.emit
  )

/** Patch 6 (D-50): the wars between rivals settle a skirmish a day. */
const frontsDayPhase: Phase = (state, ctx) => skirmishFronts(state, ctx.day, ctx.weekStartsOn, ctx.emit)

/** Patch 6 (D-50): a rival's land grab and walls land on their days, after the day's battles. */
const rivalMovesPhase: Phase = (state, ctx) => rivalMovesDay(state, ctx.day, ctx.emit)

/**
 * Rules 3.5.0 (D-53): the regular Milestones whose locks opened break at the day's close, after
 * everything the day pays, so what they open counts from the next day. A week close breaks its
 * own in the `weight` week phase, after the week's income, as before.
 */
const milestonesDayPhase: Phase = (state, ctx) => {
  if (ctx.weekClose) return state
  const { milestones, broken } = breakMilestonesOnDay({
    milestones: state.weight.milestones,
    weighIns: weighInsOf(state.settlement.snapshots, ctx.weekStartsOn),
    day: ctx.day,
    week: ctx.week,
    weekStartsOn: ctx.weekStartsOn
  })
  if (broken.length === 0) return state
  announceMilestones(broken, ctx.emit)
  return { ...state, weight: { ...state.weight, milestones } }
}

/** The day phases. Later tasks replace their entry (T08 `combat`, T11 `grandBattlesAuto`). */
export const DAY_PHASES: Record<DayPhaseName, Phase> = {
  syncNote: noop, // Fitbit syncs before `settle` is called.
  snapshotInputs,
  contractsAndDaily,
  combat: combatPhase, // T08
  grandBattlesAuto, // T11
  expireTimers,
  contractEnd,
  chronicle: chroniclePhase, // Patch 2 (D-18)
  marchRules: marchRulesPhase, // Patch 4 (D-28)
  standings: standingsPhase, // Patch 6 (D-49, D-50)
  fronts: frontsDayPhase, // Patch 6 (D-50)
  rivalMoves: rivalMovesPhase, // Patch 6 (D-50)
  milestones: milestonesDayPhase, // Rules 3.5.0 (D-53)
  weighIn: weighInPhase // Rules 3.11.0 (D-69)
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
  resetAndSchedule,
  marches: marchesPhase, // Patch 2 (D-19)
  chronicle: chroniclePhase // Patch 2 (D-18)
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
  if (isPlayable(next)) next = dawn(reachAtDawn(next, addDays(day, 1)), addDays(day, 1), weekStartsOn)
  return { ...next, settledThrough: { day, week } }
}

/** True while `day` can still be corrected at `now`: until the day after it closes (A-02). */
export function isCorrectable(day: ISODate, now: Date, timeZone: string): boolean {
  return diffDays(day, openDay(now, timeZone)) <= 1 + RULES.clock.correctionGraceDays
}

/**
 * The settled days a ledger edit can still change at `now`, oldest first, and whether every input counts
 * (`full`) or only steps and food. The last settled day takes every input while A-02's window is open. Rules
 * 3.11.1 (D-71): each day of a contract also takes its steps and food until the contract's last day can no
 * longer be corrected, so a step count the tracker missed, or a meal logged late, still counts for the contract.
 */
export function correctableDays(state: CampaignState, now: Date): { day: ISODate; full: boolean }[] {
  const last = state.settledThrough.day
  const { timeZone } = state.campaign
  const open = new Map<ISODate, boolean>()
  if (isCorrectable(last, now, timeZone)) open.set(last, true)
  for (const c of contractsOf(state)) {
    if (c.endDate < last || !isCorrectable(c.endDate, now, timeZone)) continue
    for (let d = c.startDate; d <= last && d <= c.endDate; d = addDays(d, 1)) if (!open.has(d)) open.set(d, false)
  }
  return [...open.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, full]) => ({ day, full }))
}

/** `old` with the steps and food of `fresh` (D-71); its other inputs stay as they settled. */
function withStepsAndFood(old: DaySnapshot, fresh: DaySnapshot): DaySnapshot {
  const out: DaySnapshot = { ...old }
  delete out.steps
  delete out.eaten
  return { ...out, ...(fresh.steps !== undefined ? { steps: fresh.steps } : {}), ...(fresh.eaten !== undefined ? { eaten: fresh.eaten } : {}) }
}

/**
 * Takes in the ledger's corrections to `days` (as `correctableDays` gives them; A-02, D-71). Their snapshots take
 * the corrected inputs, then all that pays for those inputs is read again from the first day corrected: each
 * day's pay (and the streaks after it), each week's pay, Momentum paid at a weigh-in, the paid contracts and the
 * running one's score, and the Respect a week close gives for a prized habit kept (`lateWeekRespect`). Each pays
 * what the correction adds (read against the same inputs before it), never past what was paid; nothing paid is
 * lowered (Ch 2 rule 5). Combat, courtships, rival moves and events are never rerun. Postings and events are
 * dated the last settled day, so the purse and the log never go back in time.
 */
export function takeCorrections(state: CampaignState, ledger: Ledger, days: readonly { day: ISODate; full: boolean }[], events: EventBuffer): CampaignState {
  let next = state
  let first: ISODate | undefined
  for (const { day, full } of days) {
    const old = snapshotOf(state, day)
    if (!old && !full) continue
    const fresh = snapshotDay(ledger, day, charterOn(state, day))
    const inputs = full || !old ? fresh : withStepsAndFood(old, fresh)
    if (old && sameInputs(old, inputs)) continue
    next = putSnapshot(next, { ...inputs, streak: old?.streak ?? 0, ...(old?.paid ? { paid: old.paid } : {}) })
    // The founding day takes its inputs only.
    if (day >= state.campaign.startDate && first === undefined) first = day
  }
  if (first === undefined) return next

  const last = state.settledThrough.day
  const { weekStartsOn, goalWeight, unit, targetPace } = state.campaign
  let adjustment = 0
  const credit = (paid: number, before: number, after: number, source: string): number => {
    const amount = roundPosting(Math.min(after - before, after - paid))
    if (amount <= 0) return paid
    next = { ...next, purse: post(next.purse, { date: last, kind: 'adjust', amount, source }) }
    adjustment = roundPosting(adjustment + amount)
    return roundPosting(paid + amount)
  }
  const momentumOf = (s: CampaignState, day: ISODate): number => {
    const m = weekMomentum({ weighIns: weighInsOf(s.settlement.snapshots, weekStartsOn), day, qw: weighInQw(s, day), goal: toLb(goalWeight, unit), cap: targetPace }).m
    return postedTotal(momentumIncome(m, reputationBonus(s)))
  }

  // Each day's pay, in order, so a streak the correction lengthened carries into the days after it.
  for (const s of snapshotsBetween(next.settlement.snapshots, first, last)) {
    const was = snapshotOf(state, s.date)
    if (!was) continue
    const corrected = dailyLines(next, s)
    const paid = s.paid ?? { daily: 0 }
    const daily = credit(paid.daily, postedTotal(dailyLines(state, was).lines), postedTotal(corrected.lines), `correction:daily:${s.date}`)
    next = putSnapshot(next, { ...s, streak: corrected.streak, paid: { ...paid, daily } })
  }
  // Each closed week's pay, and Momentum paid at a weigh-in, which reads the week before it (D-69).
  for (const s of snapshotsBetween(next.settlement.snapshots, first, last)) {
    if (!s.paid) continue
    const paid = { ...s.paid }
    if (paid.weekly !== undefined) paid.weekly = credit(paid.weekly, postedTotal(weekIncome(state, s.date, weekStartsOn).lines), postedTotal(weekIncome(next, s.date, weekStartsOn).lines), `correction:weekly:${s.date}`)
    if (paid.momentum !== undefined) paid.momentum = credit(paid.momentum, momentumOf(state, s.date), momentumOf(next, s.date), `correction:momentum:${s.date}`)
    next = putSnapshot(next, { ...s, paid })
  }

  const ctx = payContext(next, last)
  for (const c of next.contracts.history) {
    if (!c.paid || c.endDate < first || c.startDate > last) continue
    const score = contractScore(next, c, c.endDate, weekStartsOn)
    if (score <= (c.score ?? 0)) continue
    const late = lateCorrection(next.contracts, next.purse, c.id, score, ctx)
    next = { ...next, contracts: late.contracts, purse: late.purse }
    adjustment = roundPosting(adjustment + late.adjustment)
  }
  const active = next.contracts.active
  if (active && active.startDate <= last && first <= active.endDate) {
    next = { ...next, contracts: { ...next.contracts, active: { ...active, score: contractScore(next, active, last, weekStartsOn) } } }
  }

  const emit = events.emitter(last)
  for (let close = addDays(weekOf(first, weekStartsOn), RULES.clock.daysPerWeek - 1); close <= last; close = addDays(close, RULES.clock.daysPerWeek)) {
    next = events.flush(lateWeekRespect(next, close, weekStartsOn, weekKept(state, close, weekStartsOn), weekKept(next, close, weekStartsOn), emit))
  }
  if (adjustment > 0) emit('correction', { correctedDay: first, adjustment })
  return events.flush(next)
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
 * Settles the campaign up to `now`: first the corrections to the days still open (the last settled
 * day inside its grace window, a contract's steps and food until it ends; A-02, D-71), then every
 * closed day in order (missed days run with no orders), with the week
 * phases after each week's last day. Pure: it reads `ledger` and returns the next state, the
 * events it posted and a summary for the Homecoming. With nothing new to settle it returns the
 * same state and no events.
 */
export function settle(state: CampaignState, ledger: Ledger, now: Date, options: SettleOptions = {}): SettleResult {
  const { timeZone } = state.campaign
  const events = new EventBuffer()
  const hooks: PhaseHooks = { accordsPaid: [], grandBattleRequests: [], warhosts: [] }
  const balanceBefore = balance(state.purse)
  let next = isPlayable(state) ? takeCorrections(state, ledger, correctableDays(state, now), events) : state

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

  // The open day's dawn, if no settled day has brought it yet (the campaign's first day). A clock
  // set back to a day already settled brings no dawn, and never moves the last launch back.
  if (isPlayable(next) && today > next.settledThrough.day) next = dawn(reachAtDawn(next, today), today)

  if (options.launch && (last === undefined || today > last)) next = { ...next, settlement: { ...next.settlement, lastLaunch: today } }

  return {
    state: next,
    events: events.all,
    summary: summarize(days, events.all, roundPosting(balance(next.purse) - balanceBefore), awayDays)
  }
}
