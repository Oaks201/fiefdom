/**
 * View models for the Chronicle and its Milestones and Grace panel (T14; Ch 2, Ch 4, Ch 5, Ch 9,
 * Ch 10, Ch 16): the week's step pace, the week's calories against the limit with the floor
 * marked, today's Valor in its three parts, the weekly weigh-in prompt, the Healer's check-ins,
 * the reputation a day earned, the Milestones and the weigh-in log.
 *
 * Plain and never shaming: a short day is a fact, not a verdict. The Milestone panel never says
 * what a future Milestone unlocks, and the Grace shows as its plain description, never Steadiness.
 */
import { addDays, diffDays, weekCloseDay, weekOf, weighInDay } from '../clock'
import { dailyIncome, roundPosting } from '../economy'
import { realmEffects } from '../effects'
import { snapshotDay, snapshotsBetween, toDayRecord, toHealerDay, weighInsOf } from '../ledgerDays'
import { hexName } from '../map'
import { RULES } from '../rules'
import { dutiesPillar, poolShare, stepsPillar, tableIntake, termsOf, valor, weekScores } from '../score'
import { charterOn, realmConsistencyOn, restDayIncome, streakBefore } from '../settle'
import { isRestDay, openDayOf, respiteDays, weekOn } from '../state'
import { t, type HealerCheckIn } from '../text'
import { breakMilestonesOnDay, graceTextId, healerCheckIns, lbTo, loggedAverage, markReachedOn, toLb, weeklyWeighIns, weekMomentum, type HealerSituation } from '../weight'
import type { CampaignState, DayRecord, GraceLevel, ISODate, WeekStartsOn, WeighIn } from '../types'
import type { Ledger } from '../../types'
import { ledSpoilsDue } from './skirmish'

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
  /** The week's pool, a day's share less for each of its rest days (D-54): 70,000 with one is 60,000. */
  pool: number
  /** The week's rest days. */
  rested: number
  daysElapsed: number
  /** Ahead of the even pace, or behind it. */
  status: 'ahead' | 'behind'
}

/** The week's pace toward the step pool (Ch 2): steps so far against pool × days elapsed ÷ 7, rest days left out of both and of the pool (D-54). */
export function stepPace(
  days: readonly { date: ISODate; steps?: number }[],
  pool: number,
  today: ISODate,
  weekStartsOn: WeekStartsOn,
  campaignStart?: ISODate,
  respite: readonly ISODate[] = []
): StepPace {
  const from = weekFrom(today, weekStartsOn, campaignStart)
  const rested = respite.filter((d) => d >= from && d <= weekCloseDay(today, weekStartsOn)).length
  const daysElapsed = diffDays(from, today) + 1 - respite.filter((d) => d >= from && d <= today).length
  const walked = days.filter((d) => d.date >= from && d.date <= today && !respite.includes(d.date)).reduce((sum, d) => sum + Math.max(0, d.steps ?? 0), 0)
  const expected = poolShare(pool, daysElapsed)
  return { walked, expected: Math.round(expected), pool: Math.round(pool - poolShare(pool, rested)), rested, daysElapsed, status: walked >= expected ? 'ahead' : 'behind' }
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

/** The week's logged calorie average against the limit, with the Healer's floor marked (Ch 4), rest days left out (D-54). */
export function calorieWeek(
  days: readonly { date: ISODate; eaten?: number }[],
  limit: number,
  floor: number,
  today: ISODate,
  weekStartsOn: WeekStartsOn,
  campaignStart?: ISODate,
  respite: readonly ISODate[] = []
): CalorieWeek {
  const from = weekFrom(today, weekStartsOn, campaignStart)
  const week = days.filter((d) => d.date >= from && d.date <= today && !respite.includes(d.date))
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

// ── Catch-up figures (Patch 6, D-46) ─────────────────────────────────────────

const KCAL_ROUNDING = 10 // rules-ok: display rounding (C-75), down to the nearest 10 kcal
const STEP_ROUNDING = 100 // rules-ok: display rounding (C-75), up to the nearest 100 steps

/**
 * The days of `today`'s week the catch-up reads, as the score reads them: from the week's first day
 * (never before the campaign's, A-04) to its close, Respite days left out (Ch 4 rule 4, C-77). `before`
 * are the days already closed; `left` are today and the days after it.
 */
function catchUpWeek(today: ISODate, weekStartsOn: WeekStartsOn, campaignStart: ISODate | undefined, respite: readonly ISODate[]): { before: ISODate[]; left: ISODate[] } {
  const skip = new Set(respite)
  const before: ISODate[] = []
  const left: ISODate[] = []
  for (let d = weekFrom(today, weekStartsOn, campaignStart); d <= weekCloseDay(today, weekStartsOn); d = addDays(d, 1)) {
    if (skip.has(d)) continue
    if (d < today) before.push(d)
    else left.push(d)
  }
  return { before, left }
}

/**
 * What the week's food needs to bring its logged average back to the limit (C-74):
 * - `none`: nothing logged yet this week, or no day left to count;
 * - `onPace`: keeping the limit each day left keeps the average at or under it;
 * - `figure`: about `perDay` a day for `days` days brings it back to `limit`; `today` is the food
 *   logged so far today. `afterToday`: the days after today, today's food counted as logged;
 * - `floor`: even at the Healer's floor each day left, the week averages `average`;
 * - `ends`: today is the week's last day and its food has passed what the average needed.
 */
export type CalorieCatchUp =
  | { kind: 'none' }
  | { kind: 'onPace' }
  | { kind: 'figure'; perDay: number; days: number; limit: number; afterToday: boolean; today?: number }
  | { kind: 'floor'; floor: number; days: number; average: number; afterToday: boolean }
  | { kind: 'ends'; average: number }

/**
 * The calorie catch-up (Patch 6, D-46; Ch 4, Ch 16). Closed days count as the Table counts them
 * (`tableIntake`: a day under 90% of the floor enters as 1.15 × the limit). The gap is spread over the
 * days left, today included, each assumed logged; the figure rounds down to 10 kcal and is never
 * under the Healer's floor (`floor`, itself never under `RULES.healer.minFloor`). A figure while the
 * week is on pace would invite eating up to it, so there is none (C-74, C-75).
 */
export function calorieCatchUp(
  days: readonly { date: ISODate; eaten?: number }[],
  limit: number,
  floor: number,
  today: ISODate,
  weekStartsOn: WeekStartsOn,
  campaignStart?: ISODate,
  respite: readonly ISODate[] = []
): CalorieCatchUp {
  const { before, left } = catchUpWeek(today, weekStartsOn, campaignStart, respite)
  const least = Math.max(RULES.healer.minFloor, floor)
  const terms = { stepPool: 0, calorieLimit: limit, floor: least }
  const eatenOn = new Map(days.map((d) => [d.date, d.eaten]))
  const logged = before.flatMap((d) => {
    const eaten = eatenOn.get(d)
    return eaten === undefined ? [] : [tableIntake(eaten, terms)]
  })
  const eatenToday = left[0] === today ? eatenOn.get(today) : undefined
  if (left.length === 0 || (logged.length === 0 && eatenToday === undefined)) return { kind: 'none' }
  let n = logged.length
  let sum = logged.reduce((s, e) => s + e, 0)
  let k = left.length
  let afterToday = left[0] !== today
  let need = (limit * (n + k) - sum) / k
  // Today has already passed its share of a real day's eating: count it, and figure the days after it.
  if (eatenToday !== undefined && eatenToday > need && eatenToday >= least) {
    if (k === 1) return { kind: 'ends', average: Math.round((sum + eatenToday) / (n + 1)) }
    n += 1
    sum += eatenToday
    k -= 1
    afterToday = true
    need = (limit * (n + k) - sum) / k
  }
  if (need >= limit) return { kind: 'onPace' }
  if (need < least) return { kind: 'floor', floor: least, days: k, average: Math.round((sum + least * k) / (n + k)), afterToday }
  const perDay = Math.max(least, Math.floor(need / KCAL_ROUNDING) * KCAL_ROUNDING)
  return { kind: 'figure', perDay, days: k, limit, afterToday, ...(!afterToday && eatenToday !== undefined ? { today: eatenToday } : {}) }
}

/**
 * What the week's steps need to fill its pool (its share for the days counted, `poolShare`):
 * - `none`: no day left to count;
 * - `met`: the week's share is walked;
 * - `figure`: about `perDay` a day for `days` days fills it; `more` is what today still needs of its
 *   share. `afterToday`: today's share is walked, and the figure is for the days after it.
 */
export type StepCatchUp =
  | { kind: 'none' }
  | { kind: 'met' }
  | { kind: 'figure'; perDay: number; days: number; target: number; afterToday: boolean; more?: number }

/**
 * The step catch-up (Patch 6, D-46; Ch 2, Ch 16): the rest of the week's pool spread over the days
 * left, today included, rounded up to 100, so it never asks for the whole gap in one day.
 */
export function stepCatchUp(
  days: readonly { date: ISODate; steps?: number }[],
  pool: number,
  today: ISODate,
  weekStartsOn: WeekStartsOn,
  campaignStart?: ISODate,
  respite: readonly ISODate[] = []
): StepCatchUp {
  const { before, left } = catchUpWeek(today, weekStartsOn, campaignStart, respite)
  const stepsOn = new Map(days.map((d) => [d.date, Math.max(0, d.steps ?? 0)]))
  const target = poolShare(pool, before.length + left.length)
  const walked = before.reduce((s, d) => s + (stepsOn.get(d) ?? 0), 0)
  const todayCounts = left[0] === today
  const stepsToday = todayCounts ? (stepsOn.get(today) ?? 0) : 0
  if (walked + stepsToday >= target) return { kind: 'met' }
  if (left.length === 0) return { kind: 'none' }
  const roundUp = (x: number): number => Math.ceil(x / STEP_ROUNDING) * STEP_ROUNDING
  const k = left.length
  const share = (target - walked) / k
  if (todayCounts && k > 1 && stepsToday >= share) {
    return { kind: 'figure', perDay: roundUp((target - walked - stepsToday) / (k - 1)), days: k - 1, target: Math.round(target), afterToday: true }
  }
  return {
    kind: 'figure',
    perDay: roundUp(share),
    days: k,
    target: Math.round(target),
    afterToday: !todayCounts,
    ...(todayCounts ? { more: roundUp(share - stepsToday) } : {})
  }
}

export interface CatchUp {
  calories: CalorieCatchUp
  steps: StepCatchUp
}

/**
 * Today's catch-up figures (Patch 6, D-46) from the ledger as it stands: today's week as the score
 * reads it, against today's Charter and the floor the score uses. Shown for the open day only (C-76).
 */
export function catchUp(state: CampaignState, ledger: Ledger, today: ISODate): CatchUp {
  const charter = charterOn(state, today)
  const days = liveWeek(state, ledger, today)
  const { weekStartsOn, startDate } = state.campaign
  const respite = respiteDays(state)
  const floor = termsOf(charter, state.weight.healerFloor).floor ?? RULES.healer.minFloor
  return {
    calories: calorieCatchUp(days, charter.calorieLimit, floor, today, weekStartsOn, startDate, respite),
    steps: stepCatchUp(days, charter.stepPool, today, weekStartsOn, startDate, respite)
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

/** `date`'s Valor so far in its three parts, from the ledger as it stands: the week as the close reads it (`valorOn`), its rest days left out of the step pace (D-54). */
export function liveValorParts(state: CampaignState, ledger: Ledger, date: ISODate): ValorParts {
  const rest = new Set(respiteDays(state))
  const days = liveWeek(state, ledger, date)
  const day = days.at(-1) ?? toDayRecord(snapshotDay(ledger, date, charterOn(state, date)))
  return valorParts(day, days.filter((d) => !rest.has(d.date)), charterOn(state, date).stepPool)
}

/** `date`'s Valor so far, from the ledger as it stands (the close reads the day's final Valor); a rest day's is Realm Consistency (D-54). */
export function liveValor(state: CampaignState, ledger: Ledger, date: ISODate): number {
  if (isRestDay(state, date)) return realmConsistencyOn(state, date, state.campaign.weekStartsOn)
  return liveValorParts(state, ledger, date).valor
}

// ── The weigh-in ─────────────────────────────────────────────────────────────

export interface WeighInPrompt {
  /** Ask for the week's weigh-in: today is the weigh-in day and nothing is logged on it yet. */
  due: boolean
  /** This week's weigh-in day. */
  day: ISODate
  /** The latest weigh-in, in the ledger's unit. */
  last: WeighIn | null
}

/** The weekly weigh-in prompt (Ch 2, D-13): on the weigh-in day, until its weight is logged. */
export function weighInPrompt(weighIns: readonly WeighIn[], today: ISODate, weekStartsOn: WeekStartsOn): WeighInPrompt {
  const day = weighInDay(today, weekStartsOn)
  const sorted = [...weighIns].filter((w) => w.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  return { due: today === day && sorted.at(-1)?.date !== today, day, last: sorted.at(-1) ?? null }
}

// ── Reputation a day earned ──────────────────────────────────────────────────

/** What the purse gained on a settled day (daily income, and on a week close the weekly lines, tithes and the rest). */
export function dayEarned(state: CampaignState, day: ISODate): number {
  const gains = state.purse.events.filter((e) => e.date === day && e.amount > 0 && (e.kind === 'earn' || e.kind === 'spoils' || e.kind === 'tithe' || e.kind === 'return'))
  return roundPosting(gains.reduce((sum, e) => sum + e.amount, 0))
}

/**
 * The spoils `day` has won (Ch 10, Ch 11): what the purse holds for it (a Grand Battle's, posted when
 * it is won, and on a settled day its daily battles'), and on the open day what the battles the player
 * led and finished will post at its close (D-12).
 */
export function daySpoils(state: CampaignState, day: ISODate): number {
  const posted = state.purse.events.filter((e) => e.date === day && e.kind === 'spoils').reduce((sum, e) => sum + e.amount, 0)
  return roundPosting(posted + ledSpoilsDue(state, day))
}

/**
 * What an unsettled day would earn at its close as it stands: duties, the perfect day and the streak
 * (Ch 5), and the spoils it has won so far (`daySpoils`). A battle the close still fights adds nothing yet.
 * A rest day earns a full day × Realm Consistency (D-54).
 */
export function dayProjection(state: CampaignState, day: DayRecord): number {
  if (isRestDay(state, day.date)) return roundPosting(restDayIncome(state, day.date, day.dutiesSworn).lines.reduce((sum, l) => sum + l.amount, 0) + daySpoils(state, day.date))
  const income = dailyIncome(
    {
      dutiesKept: day.dutiesKept,
      dutiesSworn: day.dutiesSworn,
      foodLogged: day.eaten !== undefined,
      priorStreak: streakBefore(state, day.date)
    },
    realmEffects(state).reputationBonus.value
  )
  return roundPosting(income.lines.reduce((sum, l) => sum + l.amount, 0) + daySpoils(state, day.date))
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
  /** D-53: it breaks when today closes, as the day's settlement will read it. */
  breaksAtClose: boolean
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
  const weekly = weeklyWeighIns(weighInsLb, state.campaign.weekStartsOn)
  const atClose = breakMilestonesOnDay({ milestones: state.weight.milestones, weighIns: weekly, day: today, week, weekStartsOn: state.campaign.weekStartsOn }).broken.map((m) => m.index)
  const rows: MilestoneRow[] = state.weight.milestones.map((m) => ({
    index: m.index,
    mark: inUnit(m.mark, unit),
    earliestWeek: m.earliestWeek,
    keeping: m.keeping === true,
    ...(m.brokenOn ? { brokenOn: m.brokenOn } : {}),
    ...(m.byDispensation !== undefined && m.brokenOn ? { byDispensation: m.byDispensation } : {}),
    lock1: m.brokenOn !== undefined || (!m.keeping && markReachedOn(weekly, m.mark, today) !== null),
    lock2: m.brokenOn !== undefined || week >= m.earliestWeek,
    breaksAtClose: atClose.includes(m.index)
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

// ── The weigh-in log (D-13) ──────────────────────────────────────────────────

export interface WeighInNote {
  /** Broken this week, or its mark reached by this weigh-in while its week was still to come. */
  kind: 'broken' | 'reached'
  index: number
  /** The mark in the campaign's unit. */
  mark: number
  keeping: boolean
  earliestWeek: number
  byDispensation?: boolean
}

export interface WeighInRow {
  /** The week's weigh-in day, its Monday (D-13): the row's label. */
  day: ISODate
  /** The day the counted reading was taken: the weigh-in day itself from D-13 on; null for a week with no weigh-in. */
  date: ISODate | null
  /** The campaign week; 0 for a week that closed before the campaign began. */
  week: number
  /** In the campaign's unit; null for a week with no weigh-in. */
  weight: number | null
  /** Since the weigh-in before it, in the campaign's unit; null for the first. */
  change: number | null
  notes: WeighInNote[]
}

/**
 * The Chronicle's weigh-in log (D-13), newest first: one row for each week's weigh-in day, with the
 * weigh-in the game reads for that week (`weeklyWeighIns`) and its change since the one before,
 * noting each Milestone broken that week and each mark reached while its week was still
 * to come. A Milestone broken in a week with no weigh-in (by Dispensation, or a mark reached
 * earlier) gets a row of its own. `weighInsLb` are the player's weigh-ins in lb.
 */
export function weighInLog(state: CampaignState, weighInsLb: readonly WeighIn[]): WeighInRow[] {
  const { weekStartsOn, unit } = state.campaign
  const weekly = weeklyWeighIns(weighInsLb, weekStartsOn)
  const rows = new Map<ISODate, WeighInRow>()
  const rowOf = (date: ISODate): WeighInRow => {
    const day = weighInDay(date, weekStartsOn)
    const row = rows.get(day) ?? { day, date: null, week: weekOn(state, weekCloseDay(day, weekStartsOn)), weight: null, change: null, notes: [] }
    rows.set(day, row)
    return row
  }
  weekly.forEach((w, i) => {
    const change = i === 0 ? null : Math.round(lbTo(w.weight - weekly[i - 1].weight, unit) * 10) / 10 // rules-ok: a tenth
    Object.assign(rowOf(w.date), { date: w.date, weight: inUnit(w.weight, unit), change })
  })
  for (const m of state.weight.milestones) {
    const note = { index: m.index, mark: inUnit(m.mark, unit), keeping: m.keeping === true, earliestWeek: m.earliestWeek }
    if (m.brokenOn) rowOf(m.brokenOn).notes.push({ ...note, kind: 'broken', byDispensation: m.byDispensation === true })
    // A Milestone broken by Dispensation may have its mark reached only later; that is no longer news.
    const upTo = m.brokenOn ?? weekly.at(-1)?.date
    const reached = m.keeping || !upTo ? null : markReachedOn(weekly, m.mark, upTo)
    if (reached && (!m.brokenOn || weekOf(reached, weekStartsOn) !== weekOf(m.brokenOn, weekStartsOn))) rowOf(reached).notes.push({ ...note, kind: 'reached' })
  }
  return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day))
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
  const respite = respiteDays(state)
  if (lastWeek) {
    const days = snapshotsBetween(snapshots, state.campaign.startDate, lastWeek.day).map(toDayRecord)
    const qw = weekScores(days, termsOf(state.charter, floor), state.campaign.weekStartsOn, respite).at(-1)?.score ?? 0
    const m = weekMomentum({ weighIns: weighInsOf(snapshots, state.campaign.weekStartsOn), day: lastWeek.day, qw, goal: toLb(state.campaign.goalWeight, state.campaign.unit), cap: state.campaign.targetPace })
    situation.momentum = { r: m.r, mw: m.mw, mf: m.mf, qw: m.qw, tooFast: m.tooFast }
  }
  if (settled >= state.campaign.startDate) {
    const recent = snapshotsBetween(snapshots, state.campaign.startDate, settled).map(toDayRecord).reverse()
    let low = 0
    for (const d of recent) {
      // A rest day is neither a low day nor a good one (D-54).
      if (respite.includes(d.date)) continue
      if (dayScore(d, state.charter.stepPool) >= RULES.healer.roughDayBelow) break
      low++
    }
    situation.roughPatch = { days: low, respite: state.contracts.respiteBank }
  }
  if (live.stepsThisWeek !== undefined && live.stepsThisWeek > state.charter.stepPool) situation.stepsOverPool = true
  const warned = state.log.some((e) => e.kind === 'ascendancy' && (e.stage === 'warning' || e.stage === 'ultimatum') && diffDays(e.day, today) <= RULES.healer.checkInWindowDays)
  if (warned) situation.fearOfLosing = { grace: state.weight.grace }
  const lost = state.log.find((e) => e.kind === 'hexTransfer' && e.from === 'player' && e.day === addDays(today, -1))
  if (lost && lost.kind === 'hexTransfer') situation.loss = { what: `${hexName(lost.hexId)}`, date: lost.day }
  if (state.orders.some((o) => o.date === today)) situation.ordersSet = { closeTime: `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00` }
  return healerCheckIns(situation).map((n) => ({ checkIn: n.checkIn, textId: `healer.${n.checkIn}`, text: t(`healer.${n.checkIn}`, n.facts) }))
}
