/**
 * Rules 3.13.0 (D-68, D-76, H3): the Healer's requests. At each week close from week 2 she asks one small
 * step for the week ahead, on the weakest of four habits over the last two weeks:
 * - days with food logged;
 * - days within the calorie limit (a day logged under 90% of the floor is over it, as the Table reads it);
 * - the step pool's share walked (rest days shrink the pool, D-54);
 * - days with every sworn duty kept.
 * She skips the habit a ruler dared the same close (Skivvet the food, Emrys the duties, Hrodgar the steps).
 * The ask is one day more than last week, at most every day, or 10 points more of the pool, at most all
 * of it; a habit already at its most is asked to hold there. A rest day counts as a day kept (D-54).
 *
 * She asks only for habits, never for the scale. Met, she pays at the close of the day it is met, and
 * every fourth met banks a Respite day; missed, nothing. Pure: settle.ts and the views hand it the days.
 */
import { CODEX } from './codex'
import { RULES } from './rules'
import { poolShare, tableIntake, type ScoreTerms } from './score'
import { worldOf } from './state'
import { HEALER_HABITS, type CampaignState, type HealerHabit, type HealerRequest, type ISODate } from './types'

const R = RULES.healer.requests
const POINTS = 100 // rules-ok: a share of the step pool in whole points

/** One day as her requests read it: its inputs, whether it was a rest day, and the terms in force. */
export interface HabitDay {
  date: ISODate
  steps?: number
  eaten?: number
  dutiesKept: number
  dutiesSworn: number
  rest: boolean
  terms: ScoreTerms
}

/** Whether `habit` is counted in days (the steps are a share of the pool). */
export function isDayCount(habit: HealerHabit): boolean {
  return habit !== 'steps'
}

/** Whether a day kept `habit`: a rest day always does (D-54); a day with no duty sworn keeps its duties (C-11). */
export function keptOn(habit: Exclude<HealerHabit, 'steps'>, d: HabitDay): boolean {
  if (d.rest) return true
  switch (habit) {
    case 'foodLogged':
      return d.eaten !== undefined
    case 'withinLimit':
      return d.eaten !== undefined && tableIntake(d.eaten, d.terms) <= d.terms.calorieLimit
    case 'duties':
      return d.dutiesKept >= d.dutiesSworn
  }
}

/** The steps walked on `days` against the pool for a week of `weekDays` days, rest days out of both (D-54): a share, uncapped. */
function walkedShare(days: readonly HabitDay[], weekDays: number): number {
  const scored = days.filter((d) => !d.rest)
  const rested = days.length - scored.length
  const pool = days.at(-1)?.terms.stepPool ?? 0
  const share = poolShare(pool, Math.max(0, weekDays - rested))
  if (share <= 0) return 1
  return scored.reduce((s, d) => s + Math.max(0, d.steps ?? 0), 0) / share
}

/** How `days` (a week, or two) kept `habit`, 0 to 1: the share of days kept, or of the pool walked at the pace of those days. */
export function habitShare(habit: HealerHabit, days: readonly HabitDay[]): number {
  if (days.length === 0) return 1
  if (habit === 'steps') return Math.min(1, walkedShare(days, days.length))
  return days.filter((d) => keptOn(habit, d)).length / days.length
}

/**
 * A week's figure for `habit`, in the request's terms: the days kept, or the share of the step pool walked in
 * whole points (at most 100). `weekDays` is the week's length: the days so far still count against a full week.
 */
export function habitFigure(habit: HealerHabit, days: readonly HabitDay[], weekDays: number = RULES.clock.daysPerWeek): number {
  if (habit === 'steps') return Math.min(POINTS, Math.floor(walkedShare(days, weekDays) * POINTS + 1e-9)) // rules-ok: a float's tolerance, so 83% of the pool reads 83
  return days.filter((d) => keptOn(habit, d)).length
}

/** The most a request may ask of `habit`: every day of a week, or all of the step pool. */
export function habitMost(habit: HealerHabit): number {
  return habit === 'steps' ? POINTS : RULES.clock.daysPerWeek
}

/** The habits a ruler dared at the close of `day` (D-66), which she leaves to him that week. */
export function daredHabits(state: CampaignState, day: ISODate): Set<HealerHabit> {
  const out = new Set<HealerHabit>()
  for (const q of worldOf(state).requests ?? []) {
    if (q.kind !== 'dare' || q.madeOn !== day) continue
    switch (CODEX.rivals.find((r) => r.id === q.rival)?.prizes) {
      case 'calorieAverage':
        out.add('foodLogged').add('withinLimit')
        break
      case 'allDuties':
        out.add('duties')
        break
      case 'stepPool':
        out.add('steps')
        break
    }
  }
  return out
}

/**
 * Her request at a week close: the weakest habit over `read` (the last weeks' days) that no ruler dared, a tie
 * falling in `HEALER_HABITS`' order, and its ask from `lastWeek` (the week just closed). The duties are left out
 * when none was sworn. Null when there is nothing to read.
 */
export function chooseRequest(read: readonly HabitDay[], lastWeek: readonly HabitDay[], skip: ReadonlySet<HealerHabit>): Pick<HealerRequest, 'habit' | 'target' | 'last'> | null {
  if (read.length === 0 || lastWeek.length === 0 || read.every((d) => d.rest)) return null
  const sworn = read.some((d) => d.dutiesSworn > 0)
  const open = HEALER_HABITS.filter((h) => !skip.has(h) && (h !== 'duties' || sworn))
  if (open.length === 0) return null
  const habit = open.reduce((weakest, h) => (habitShare(h, read) < habitShare(weakest, read) ? h : weakest))
  const last = habitFigure(habit, lastWeek)
  const step = habit === 'steps' ? Math.round(R.stepRaise * POINTS) : 1
  return { habit, target: Math.min(habitMost(habit), last + step), last }
}

/** How far the request's week has come by `days` (its days so far): days kept, or points of the pool walked. */
export function requestProgress(q: Pick<HealerRequest, 'habit'>, days: readonly HabitDay[]): number {
  return habitFigure(q.habit, days)
}

/** Whether `days` (the request's days so far) have met it; it stays met, since a day kept or a step walked is never taken back. */
export function requestMet(q: Pick<HealerRequest, 'habit' | 'target'>, days: readonly HabitDay[]): boolean {
  return days.length > 0 && requestProgress(q, days) >= q.target
}

/** Whether the `n`th request met banks a Respite day. */
export function banksRespite(n: number): boolean {
  return n > 0 && n % R.respiteEvery === 0
}
