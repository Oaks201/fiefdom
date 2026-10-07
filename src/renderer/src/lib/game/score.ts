/**
 * Consistency scores (Ch 4 "The consistency score", Ch 5 "Realm Consistency", Ch 10 Valor).
 *
 * Every score here reads plain `DayRecord`s plus the Charter's terms and the Healer's floor. T06
 * adapts ledger days into records; this module never reads the ledger. A day that is missing
 * data counts as missed (Ch 4 rule 5): no steps are zero steps, and no food is no logging credit.
 */
import { weekOf } from './clock'
import { RULES } from './rules'
import type { Charter, DayRecord, ISODate, Pillars, WeekStartsOn } from './types'

/** The terms a score is judged by: the Charter, and the Healer floor for under-eating (A-41). */
export interface ScoreTerms {
  stepPool: number
  calorieLimit: number
  /** The Healer's calorie floor. Without one, the floor's own minimum (1,200) is used. */
  floor?: number
}

/** The terms of a Charter, with the Healer floor it was sealed under. */
export function termsOf(charter: Charter, floor?: number): ScoreTerms {
  return { stepPool: charter.stepPool, calorieLimit: charter.calorieLimit, floor: floor ?? charter.calorieFloor }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const byDate = (a: DayRecord, b: DayRecord): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
const PILLARS = 3 // rules-ok: q_w and Valor each average three terms

/** The step pool's share for `days` days: pool × days ÷ 7 (a partial week 1 prorates, A-04). */
export function poolShare(stepPool: number, days: number): number {
  return (stepPool * days) / RULES.clock.daysPerWeek
}

/** Steps since the week began ÷ the pool's share for those days, capped at 1. */
export function stepsPillar(days: readonly DayRecord[], stepPool: number): number {
  if (days.length === 0) return 0
  const walked = days.reduce((sum, d) => sum + Math.max(0, d.steps ?? 0), 0)
  return clamp01(walked / poolShare(stepPool, days.length))
}

/**
 * What a logged day counts as in the Table's average. A day logged below 90% of the floor
 * enters as 1.15 × the limit, so on its own it scores as fully over budget (A-41, Ch 16).
 */
export function tableIntake(eaten: number, terms: ScoreTerms): number {
  const floor = terms.floor ?? RULES.healer.minFloor
  if (eaten < RULES.healer.underFloorShare * floor) return terms.calorieLimit * (1 + RULES.contracts.table.zeroAtShareOver)
  return eaten
}

/** 1 at or under the limit, falling linearly to 0 at 15% over. */
export function budgetScore(average: number, calorieLimit: number): number {
  const over = (average - calorieLimit) / calorieLimit
  return clamp01(1 - over / RULES.contracts.table.zeroAtShareOver)
}

/** Days with food logged ÷ days × the budget score of the logged average. */
export function tablePillar(days: readonly DayRecord[], terms: ScoreTerms): number {
  const logged = days.filter((d) => d.eaten !== undefined)
  if (logged.length === 0) return 0
  const average = logged.reduce((sum, d) => sum + tableIntake(d.eaten as number, terms), 0) / logged.length
  return (logged.length / days.length) * budgetScore(average, terms.calorieLimit)
}

/** Duties kept ÷ duties sworn. */
export function dutiesPillar(days: readonly DayRecord[]): number {
  const sworn = days.reduce((sum, d) => sum + d.dutiesSworn, 0)
  if (sworn === 0) return 0
  return clamp01(days.reduce((sum, d) => sum + Math.min(d.dutiesKept, d.dutiesSworn), 0) / sworn)
}

/** The three pillars for a set of days in one calendar week. */
export function weekPillars(days: readonly DayRecord[], terms: ScoreTerms): Pillars {
  return { steps: stepsPillar(days, terms.stepPool), table: tablePillar(days, terms), duties: dutiesPillar(days) }
}

/** q_w = (S_w + T_w + D_w) ÷ 3. */
export function pillarScore(p: Pillars): number {
  return (p.steps + p.table + p.duties) / PILLARS
}

/** One week's share of a span: its days in the span (n_w) and its score (q_w). */
export interface WeekScore {
  weekStart: ISODate
  days: number
  pillars: Pillars
  score: number
}

/**
 * Splits `days` into calendar weeks and scores each, oldest first. Days in `respite` are removed
 * from every pillar first (Ch 4 rule 4); a week left with no days is dropped.
 */
export function weekScores(
  days: readonly DayRecord[],
  terms: ScoreTerms,
  weekStartsOn: WeekStartsOn,
  respite: readonly ISODate[] = []
): WeekScore[] {
  const skip = new Set(respite)
  const byWeek = new Map<ISODate, DayRecord[]>()
  for (const day of [...days].sort(byDate)) {
    if (skip.has(day.date)) continue
    const week = weekOf(day.date, weekStartsOn)
    const list = byWeek.get(week)
    if (list) list.push(day)
    else byWeek.set(week, [day])
  }
  return [...byWeek.entries()].map(([weekStart, list]) => {
    const pillars = weekPillars(list, terms)
    return { weekStart, days: list.length, pillars, score: pillarScore(pillars) }
  })
}

/** Q for any span: each week's q_w weighted by its days in the span. 0 for an empty span. */
export function consistency(
  days: readonly DayRecord[],
  terms: ScoreTerms,
  weekStartsOn: WeekStartsOn,
  respite: readonly ISODate[] = []
): number {
  const weeks = weekScores(days, terms, weekStartsOn, respite)
  const n = weeks.reduce((sum, w) => sum + w.days, 0)
  if (n === 0) return 0
  return weeks.reduce((sum, w) => sum + w.days * w.score, 0) / n
}

/**
 * Realm Consistency (A-39): Q over the last 28 settled days, weeks weighted by their days in
 * the window. `days` are settled days; only the latest 28 count.
 */
export function realmConsistency(days: readonly DayRecord[], terms: ScoreTerms, weekStartsOn: WeekStartsOn): number {
  const latest = [...days].sort(byDate).slice(-RULES.scores.realmConsistencyDays)
  return consistency(latest, terms, weekStartsOn)
}

/**
 * The day's Valor, V = (d + f + s) ÷ 3 (Ch 10): d is the share of duties kept, f is 1 if food
 * was logged, and s is the week's step pace (A-40): steps since the week began ÷ (pool × days
 * elapsed ÷ 7), capped at 1. `weekSoFar` holds the week's days up to and including `day` (from
 * the campaign start in a partial week 1); `day` is added if it is missing.
 */
export function valor(day: DayRecord, weekSoFar: readonly DayRecord[], stepPool: number): number {
  const elapsed = weekSoFar.some((d) => d.date === day.date) ? weekSoFar : [...weekSoFar, day]
  const d = dutiesPillar([day])
  const f = day.eaten !== undefined ? 1 : 0
  const s = stepsPillar(elapsed, stepPool)
  return (d + f + s) / PILLARS
}
