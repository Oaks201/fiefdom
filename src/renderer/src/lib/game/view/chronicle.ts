/**
 * View models for the Chronicle and its Milestones and Grace panel (T14; Ch 2, Ch 4, Ch 5, Ch 9,
 * Ch 10, Ch 16): the week's step pace, the week's calories against the limit with the floor
 * marked, today's Valor in its three parts, the weekly weigh-in prompt, the Healer's check-ins,
 * the reputation a day earned, and the Milestones.
 *
 * Plain and never shaming: a short day is a fact, not a verdict. The Milestone panel never says
 * what a future Milestone unlocks, and the Grace shows as its plain description, never Steadiness.
 */
import { addDays, diffDays, weekOf } from '../clock'
import { dailyIncome, roundPosting } from '../economy'
import { realmEffects } from '../effects'
import { snapshotDay, snapshotsBetween, toDayRecord, toHealerDay, weighInsOf } from '../ledgerDays'
import { hexLabel } from '../map'
import { RULES } from '../rules'
import { dutiesPillar, poolShare, stepsPillar, termsOf, valor, weekScores } from '../score'
import { charterOn, snapshotOf } from '../settle'
import { openDayOf, weekOn } from '../state'
import { t, type HealerCheckIn } from '../text'
import { graceTextId, healerCheckIns, lbTo, loggedAverage, markReachedOn, toLb, weekMomentum, type HealerSituation } from '../weight'
import type { CampaignState, DayRecord, GraceLevel, ISODate, WeekStartsOn, WeighIn } from '../types'
import type { Ledger } from '../../types'

/** The first day of `today`'s week, never before the campaign's first day (a partial week 1, A-04). */
function weekFrom(today: ISODate, weekStartsOn: WeekStartsOn, campaignStart?: ISODate): ISODate {
  const start = weekOf(today, weekStartsOn)
  return campaignStart && campaignStart > start ? campaignStart : start
}

/**
 * The ledger's days of `date`'s week up to `date` (never before the campaign's first day), as the
 * campaign scores them: live, before settlement reads them.
 */
export function liveWeek(state: CampaignState, ledger: Ledger, date: ISODate): DayRecord[] {
  const out: DayRecord[] = []
  for (let d = weekFrom(date, state.campaign.weekStartsOn, state.campaign.startDate); d <= date; d = addDays(d, 1)) out.push(toDayRecord(snapshotDay(ledger, d, charterOn(state, d))))
  return out
}

// ── Steps and calories this week ─────────────────────────────────────────────

export interface StepPace {
  /** Steps since the week began, today's included. */
  walked: number
  /** The pool's share for the days so far: pool × days ÷ 7, rounded. */
  expected: number
  pool: number
  daysElapsed: number
  /** Ahead of the even pace, or behind it. */
  status: 'ahead' | 'behind'
}

/** The week's pace toward the step pool (Ch 2): steps so far against pool × days elapsed ÷ 7. */
export function stepPace(days: readonly { date: ISODate; steps?: number }[], pool: number, today: ISODate, weekStartsOn: WeekStartsOn, campaignStart?: ISODate): StepPace {
  const from = weekFrom(today, weekStartsOn, campaignStart)
  const daysElapsed = diffDays(from, today) + 1
  const walked = days.filter((d) => d.date >= from && d.date <= today).reduce((sum, d) => sum + Math.max(0, d.steps ?? 0), 0)
  const expected = poolShare(pool, daysElapsed)
  return { walked, expected: Math.round(expected), pool, daysElapsed, status: walked >= expected ? 'ahead' : 'behind' }
}

export interface CalorieWeek {
  limit: number
  floor: number
  /** The logged average this week, or null with nothing logged. */
  average: number | null
  logged: number
  days: number
  /** Days logged below 90% of the floor, shown gently (Ch 16). */
  underFloor: ISODate[]
  overLimit: boolean
}

/** The week's logged calorie average against the limit, with the Healer's floor marked (Ch 4). */
export function calorieWeek(days: readonly { date: ISODate; eaten?: number }[], limit: number, floor: number, today: ISODate, weekStartsOn: WeekStartsOn, campaignStart?: ISODate): CalorieWeek {
  const from = weekFrom(today, weekStartsOn, campaignStart)
  const week = days.filter((d) => d.date >= from && d.date <= today)
  const logged = week.filter((d) => d.eaten !== undefined && d.eaten > 0)
  const average = logged.length > 0 ? logged.reduce((sum, d) => sum + (d.eaten as number), 0) / logged.length : null
  return {
    limit,
    floor,
    average: average === null ? null : Math.round(average),
    logged: logged.length,
    days: diffDays(from, today) + 1,
    underFloor: logged.filter((d) => (d.eaten as number) < RULES.healer.underFloorShare * floor).map((d) => d.date),
    overLimit: average !== null && average > limit
  }
}

// ── Valor ────────────────────────────────────────────────────────────────────

export interface ValorParts {
  /** The share of duties kept today. */
  duties: number
  /** 1 once food is logged today. */
  food: number
  /** The week's step pace, capped at 1. */
  steps: number
  /** V = (duties + food + steps) ÷ 3 (Ch 10). */
  valor: number
}

/** Today's Valor so far in its three parts (Ch 10, A-40); they average to `valor()`. */
export function valorParts(day: DayRecord, weekSoFar: readonly DayRecord[], stepPool: number): ValorParts {
  const elapsed = weekSoFar.some((d) => d.date === day.date) ? weekSoFar : [...weekSoFar, day]
  return { duties: dutiesPillar([day]), food: day.eaten !== undefined ? 1 : 0, steps: stepsPillar(elapsed, stepPool), valor: valor(day, weekSoFar, stepPool) }
}

/** `date`'s Valor so far, from the ledger as it stands (the close reads the day's final Valor). */
export function liveValor(state: CampaignState, ledger: Ledger, date: ISODate): number {
  const days = liveWeek(state, ledger, date)
  const day = days.at(-1) ?? toDayRecord(snapshotDay(ledger, date, charterOn(state, date)))
  return valorParts(day, days, charterOn(state, date).stepPool).valor
}

// ── The weigh-in ─────────────────────────────────────────────────────────────

export interface WeighInPrompt {
  /** Ask for the week's weigh-in: today closes the week and none is logged this week. */
  due: boolean
  weekEnds: ISODate
  /** The latest weigh-in, in the ledger's unit. */
  last: WeighIn | null
}

/** The weekly weigh-in prompt (Ch 2): on the week's last day, when the week has none yet. More often stays optional. */
export function weighInPrompt(weighIns: readonly WeighIn[], today: ISODate, weekStartsOn: WeekStartsOn): WeighInPrompt {
  const from = weekOf(today, weekStartsOn)
  const weekEnds = addDays(from, RULES.clock.daysPerWeek - 1)
  const sorted = [...weighIns].filter((w) => w.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const thisWeek = sorted.filter((w) => w.date >= from)
  return { due: today === weekEnds && thisWeek.length === 0, weekEnds, last: sorted.at(-1) ?? null }
}

// ── Reputation a day earned ──────────────────────────────────────────────────

/** What the purse gained on a settled day (daily income, and on a week close the weekly lines, tithes and the rest). */
export function dayEarned(state: CampaignState, day: ISODate): number {
  const gains = state.purse.events.filter((e) => e.date === day && e.amount > 0 && (e.kind === 'earn' || e.kind === 'spoils' || e.kind === 'tithe' || e.kind === 'return'))
  return roundPosting(gains.reduce((sum, e) => sum + e.amount, 0))
}

/** What an unsettled day would earn at its close as it stands: duties, the perfect day and the streak (Ch 5). */
export function dayProjection(state: CampaignState, day: DayRecord): number {
  const prior = snapshotOf(state, addDays(day.date, -1))
  const income = dailyIncome(
    {
      dutiesKept: day.dutiesKept,
      dutiesSworn: day.dutiesSworn,
      foodLogged: day.eaten !== undefined,
      priorStreak: prior && prior.date >= state.campaign.startDate ? prior.streak : 0
    },
    realmEffects(state).reputationBonus.value
  )
  return roundPosting(income.lines.reduce((sum, l) => sum + l.amount, 0))
}

// ── The Milestones and Grace panel (Ch 9) ────────────────────────────────────

export interface MilestoneRow {
  index: number
  /** The mark in the campaign's unit. */
  mark: number
  earliestWeek: number
  keeping: boolean
  brokenOn?: ISODate
  byDispensation?: boolean
  /** Lock 1, the mark reached (Ch 9 rule 4), and lock 2, its earliest week come. */
  lock1: boolean
  lock2: boolean
}

export interface MilestonePanel {
  unit: CampaignState['campaign']['unit']
  goal: number
  week: number
  rows: MilestoneRow[]
  /** The next unbroken Milestone. */
  next?: MilestoneRow
  broken: number
  /** The Grace as its plain words (no Steadiness, no benchmark). */
  grace: { level: GraceLevel; textId: string; text: string }
  /** What Momentum paid at the last week close, as reputation earned (Ch 5), not a weight target. */
  momentumReputation: number | null
}

function inUnit(lb: number, unit: CampaignState['campaign']['unit']): number {
  return unit === 'kg' ? Math.round(lbTo(lb, unit) * 10) / 10 : lb // rules-ok: a tenth of a kilogram
}

/** The ten Milestones with their marks, earliest weeks and locks; `weighInsLb` are the player's weigh-ins in lb. */
export function milestonePanel(state: CampaignState, weighInsLb: readonly WeighIn[], today: ISODate = openDayOf(state)): MilestonePanel {
  const week = weekOn(state, today)
  const unit = state.campaign.unit
  const rows: MilestoneRow[] = state.weight.milestones.map((m) => ({
    index: m.index,
    mark: inUnit(m.mark, unit),
    earliestWeek: m.earliestWeek,
    keeping: m.keeping === true,
    ...(m.brokenOn ? { brokenOn: m.brokenOn } : {}),
    ...(m.byDispensation !== undefined && m.brokenOn ? { byDispensation: m.byDispensation } : {}),
    lock1: m.brokenOn !== undefined || (!m.keeping && markReachedOn(weighInsLb, m.mark, today) !== null),
    lock2: m.brokenOn !== undefined || week >= m.earliestWeek
  }))
  const lastClose = state.weight.weeks.at(-1)?.day
  const momentum = lastClose ? state.purse.events.filter((e) => e.date === lastClose && e.source === 'momentum').reduce((s, e) => s + e.amount, 0) : null
  const level = state.weight.grace
  const next = rows.find((r) => r.brokenOn === undefined)
  return {
    unit,
    goal: state.campaign.goalWeight,
    week,
    rows,
    ...(next ? { next } : {}),
    broken: rows.filter((r) => r.brokenOn !== undefined).length,
    grace: { level, textId: graceTextId(level), text: t(graceTextId(level)) },
    momentumReputation: momentum === null ? null : roundPosting(momentum)
  }
}

// ── The Healer's check-ins (Ch 16) ───────────────────────────────────────────

export interface HealerCard {
  checkIn: HealerCheckIn
  textId: string
  /** The approved final text, or else the placeholder (Ch 17). */
  text: string
}

/** A settled day's duties, food and steps (against a day's share of the pool), averaged: what a "low-scoring day" means (A-179). */
export function dayScore(day: DayRecord, stepPool: number): number {
  return (dutiesPillar([day]) + (day.eaten !== undefined ? 1 : 0) + stepsPillar([day], stepPool)) / DAY_PARTS
}

const DAY_PARTS = 3 // rules-ok: duties, food and steps

/**
 * The Healer's calm cards for the Chronicle on `today`: the calorie floor, a too-fast trend, a
 * plateau or a regain, a rough patch with the Respite bank, steps past the pool, a loss
 * yesterday, the fear of losing while an Ultimatum or warning stands, and orders already set.
 */
export function healerCards(state: CampaignState, today: ISODate = openDayOf(state), live: { stepsThisWeek?: number } = {}): HealerCard[] {
  const settled = state.settledThrough.day
  const snapshots = state.settlement.snapshots
  const situation: HealerSituation = {}
  const floor = state.weight.healerFloor
  if (floor !== undefined) {
    situation.floor = floor
    situation.loggedAverage = loggedAverage(snapshots.map(toHealerDay), settled, RULES.healer.checkInWindowDays).average
  }
  const lastWeek = state.weight.weeks.at(-1)
  if (lastWeek) {
    const days = snapshotsBetween(snapshots, state.campaign.startDate, lastWeek.day).map(toDayRecord)
    const qw = weekScores(days, termsOf(state.charter, floor), state.campaign.weekStartsOn).at(-1)?.score ?? 0
    const m = weekMomentum({ weighIns: weighInsOf(snapshots), day: lastWeek.day, qw, goal: toLb(state.campaign.goalWeight, state.campaign.unit), cap: state.campaign.targetPace })
    situation.momentum = { r: m.r, mw: m.mw, mf: m.mf, qw: m.qw, tooFast: m.tooFast }
  }
  if (settled >= state.campaign.startDate) {
    const recent = snapshotsBetween(snapshots, state.campaign.startDate, settled).map(toDayRecord).reverse()
    let low = 0
    for (const d of recent) {
      if (dayScore(d, state.charter.stepPool) >= RULES.healer.roughDayBelow) break
      low++
    }
    situation.roughPatch = { days: low, respite: state.contracts.respiteBank }
  }
  if (live.stepsThisWeek !== undefined && live.stepsThisWeek > state.charter.stepPool) situation.stepsOverPool = true
  const warned = state.log.some((e) => e.kind === 'ascendancy' && (e.stage === 'warning' || e.stage === 'ultimatum') && diffDays(e.day, today) <= RULES.healer.checkInWindowDays)
  if (warned) situation.fearOfLosing = { grace: state.weight.grace }
  const lost = state.log.find((e) => e.kind === 'hexTransfer' && e.from === 'player' && e.day === addDays(today, -1))
  if (lost && lost.kind === 'hexTransfer') situation.loss = { what: `Hex ${hexLabel(lost.hexId)}`, date: lost.day }
  if (state.orders.some((o) => o.date === today)) situation.ordersSet = { closeTime: `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00` }
  return healerCheckIns(situation).map((n) => ({ checkIn: n.checkIn, textId: `healer.${n.checkIn}`, text: t(`healer.${n.checkIn}`, n.facts) }))
}
