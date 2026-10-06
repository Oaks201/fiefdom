/**
 * Weight: every way the scale touches the game, built so that losing faster never pays more.
 * The 21-day trend and the easing target pace, weekly Momentum (Ch 5), the ten Milestones with
 * their two locks and the Crown's Grace (Ch 9), the Healer's calorie range (Ch 4) and the Healer's
 * check-ins (Ch 16). Decisions A-05, A-06, A-39, A-42 to A-44 and E-04 apply.
 *
 * Every weight here is in lb with loss positive (A-05): turn ledger weigh-ins into lb with
 * `weighInsInLb` first. What each Milestone unlocks is T14's; when the week close runs is T06's.
 */
import { addDays, diffDays } from './clock'
import { CampaignError } from './errors'
import { RULES } from './rules'
import { HEALER_CHECK_INS, t, type HealerCheckIn, type TextFacts } from './text'
import type {
  Campaign,
  CampaignState,
  GraceLevel,
  HealerDay,
  ISODate,
  MilestoneState,
  WeighIn,
  WeightState,
  WeightWeek
} from './types'

/** Absorbs floating-point noise before rounding marks and taking ceilings. */
const EPSILON = 1e-9 // rules-ok: floating-point tolerance

type Unit = Campaign['unit']

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// ── Units ────────────────────────────────────────────────────────────────────

export function toLb(weight: number, unit: Unit): number {
  return unit === 'kg' ? weight * RULES.units.lbPerKg : weight
}

export function lbTo(weightLb: number, unit: Unit): number {
  return unit === 'kg' ? weightLb / RULES.units.lbPerKg : weightLb
}

/** Ledger weigh-ins (in `unit`) as lb, oldest first. */
export function weighInsInLb(weighIns: readonly WeighIn[], unit: Unit): WeighIn[] {
  return weighIns
    .map((w) => ({ date: w.date, weight: toLb(w.weight, unit) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── The trend and the target pace (Ch 5 rules 1 and 2) ───────────────────────

/** Weigh-ins in the `days` days that end with `endDay`, oldest first. */
function inWindow(weighIns: readonly WeighIn[], endDay: ISODate, days: number): WeighIn[] {
  const after = addDays(endDay, -days)
  return weighIns.filter((w) => w.date > after && w.date <= endDay).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The least-squares slope of the weigh-ins in the `windowDays` days ending `endDay`, in lb per
 * week with loss positive. Null unless there are at least two weigh-ins at least 6 days apart.
 */
export function trend(
  weighIns: readonly WeighIn[],
  endDay: ISODate,
  windowDays: number = RULES.momentum.trendWindowDays
): number | null {
  const points = inWindow(weighIns, endDay, windowDays)
  if (points.length < RULES.momentum.minWeighIns) return null
  if (diffDays(points[0].date, points[points.length - 1].date) < RULES.momentum.minWeighInSpanDays) return null
  const xs = points.map((p) => diffDays(endDay, p.date))
  const ys = points.map((p) => p.weight)
  const mx = mean(xs) as number
  const my = mean(ys) as number
  let num = 0
  let den = 0
  for (let i = 0; i < points.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return -(num / den) * RULES.clock.daysPerWeek
}

/** The average of the weigh-ins in the 7 days ending `day`, or null when there are none. */
export function avg7(weighIns: readonly WeighIn[], day: ISODate): number | null {
  return mean(inWindow(weighIns, day, RULES.momentum.targetPace.averageDays).map((w) => w.weight))
}

/** The 7-day average, or else the latest weigh-in on or before `day`. */
export function currentWeight(weighIns: readonly WeighIn[], day: ISODate): number | null {
  const average = avg7(weighIns, day)
  if (average !== null) return average
  const before = weighIns.filter((w) => w.date <= day).sort((a, b) => a.date.localeCompare(b.date))
  return before.length > 0 ? before[before.length - 1].weight : null
}

/** The pace cap the player may set, 0.3 to 1.0 lb a week. */
export function clampPaceCap(cap: number): number {
  const { capMinLb, capMaxLb } = RULES.momentum.targetPace
  return clamp(cap, capMinLb, capMaxLb)
}

/** T = min(cap, 0.4% of the 7-day average), in lb a week. */
export function targetPace(average: number, cap: number = RULES.momentum.targetPace.capLb): number {
  return Math.min(clampPaceCap(cap), RULES.momentum.targetPace.shareOfWeight * average)
}

// ── Momentum (Ch 5 rules 3 to 7) ─────────────────────────────────────────────

/** Mf: 0.6 when the week's `q_w` is at least 0.85, 0.3 when at least 0.75, otherwise 0. */
export function plateauFloor(qw: number): number {
  return RULES.momentum.plateauFloor.find((p) => qw >= p.minConsistency)?.floor ?? 0
}

/** A 28-day trend above 1% of body weight a week (Ch 5 rule 6, A-43). */
export function isTooFast(trend28: number | null, bodyWeight: number | null): boolean {
  if (trend28 === null || bodyWeight === null) return false
  return trend28 > RULES.momentum.tooFast.shareOfWeightPerWeek * bodyWeight
}

/** Ch 5 rule 7: the goal is within 2% of the current weight and the 7-day average within 2% of the goal. */
export function isMaintenance(goal: number, average: number | null): boolean {
  if (average === null) return false
  const gap = Math.abs(average - goal)
  return gap <= RULES.momentum.maintenance.goalWithinShare * average && gap <= RULES.momentum.maintenance.averageWithinShare * goal
}

export interface MomentumParts {
  /** The 21-day trend, lb a week, loss positive; null when unknown. */
  r: number | null
  /** The target pace T. */
  target: number
  /** The week's three-pillar score (A-39). */
  qw: number
  tooFast?: boolean
  maintenance?: boolean
}

/** Mw, Mf and M = max(Mw, Mf). Losing faster than T never earns more. */
export function momentumScore(p: MomentumParts): { mw: number; mf: number; m: number } {
  let mw = p.r === null || p.target <= 0 ? 0 : clamp(p.r / p.target, 0, 1)
  if (p.maintenance) mw = 1
  // The safety hold wins over everything else, maintenance included.
  if (p.tooFast) mw = RULES.momentum.tooFast.heldMw
  const mf = plateauFloor(p.qw)
  return { mw, mf, m: Math.max(mw, mf) }
}

export interface Momentum {
  r: number | null
  trend28: number | null
  /** The 7-day average, or the latest weigh-in when the week had none. */
  weight: number | null
  target: number
  qw: number
  mw: number
  mf: number
  m: number
  tooFast: boolean
  maintenance: boolean
}

export interface MomentumInput {
  /** In lb. */
  weighIns: readonly WeighIn[]
  /** The week's last day. */
  day: ISODate
  qw: number
  /** The goal, in lb. */
  goal: number
  /** The pace cap (`Campaign.targetPace`); 0.8 when omitted. */
  cap?: number
}

/** A week's Momentum, as the week close computes it. */
export function weekMomentum(input: MomentumInput): Momentum {
  const r = trend(input.weighIns, input.day, RULES.momentum.trendWindowDays)
  const trend28 = trend(input.weighIns, input.day, RULES.momentum.tooFast.windowDays)
  const weight = currentWeight(input.weighIns, input.day)
  const target = weight === null ? clampPaceCap(input.cap ?? RULES.momentum.targetPace.capLb) : targetPace(weight, input.cap)
  const tooFast = isTooFast(trend28, weight)
  const maintenance = isMaintenance(input.goal, avg7(input.weighIns, input.day))
  return { r, trend28, weight, target, qw: input.qw, tooFast, maintenance, ...momentumScore({ r, target, qw: input.qw, tooFast, maintenance }) }
}

/** The week's Momentum reputation: M × 60. */
export function momentumReputation(m: number): number {
  return m * RULES.reputation.weekly.momentum
}

// ── Milestones (Ch 9) ────────────────────────────────────────────────────────

/** ceil(lost / (0.0075 × start)), where `lost` is unrounded (E-04). Never before week 1. */
export function earliestWeek(lostLb: number, startWeight: number): number {
  return Math.max(1, Math.ceil(lostLb / (RULES.milestones.earliestWeekRate * startWeight) - EPSILON))
}

/**
 * `count` Milestones from `from` toward `goal`, numbered from `firstIndex`. The step is
 * (from − goal) ÷ count, kept between 3 and 10 lb; marks round to whole pounds and the one that
 * lands on the goal is the goal. Marks that would pass the goal become Keeping Milestones.
 */
function planMilestones(start: number, from: number, goal: number, count: number, firstIndex: number): MilestoneState[] {
  const { stepMinLb, stepMaxLb } = RULES.milestones
  const journey = from - goal
  const even = journey / count
  const clamped = even < stepMinLb || even > stepMaxLb
  const step = clamp(even, stepMinLb, stepMaxLb)
  const plan: MilestoneState[] = []
  for (let k = 1; k <= count; k++) {
    const index = firstIndex + k - 1
    // k × journey ÷ count keeps E-04's unrounded amounts exact (5 × 49 ÷ 10 = 24.5).
    const lost = clamped ? k * step : (k * journey) / count
    if (lost > journey + EPSILON) {
      plan.push({ index, mark: goal, earliestWeek: earliestWeek(Math.max(start - goal, 0), start), keeping: true })
      continue
    }
    const mark = Math.abs(lost - journey) <= EPSILON ? goal : Math.round(from - lost + EPSILON)
    plan.push({ index, mark, earliestWeek: earliestWeek(start - from + lost, start) })
  }
  return plan
}

/** The ten Milestones for a journey from `start` to `goal`, both in lb (Ch 9 rules 1 to 3, E-04). */
export function buildMilestones(start: number, goal: number): MilestoneState[] {
  return planMilestones(start, start, goal, RULES.milestones.count, 1)
}

/**
 * Lock 1: the first day on or before `upTo` when two weigh-ins at least 6 days apart were both at
 * or below `mark`, or the 7-day average of two or more weigh-ins was. Null when it never was. Reaching a mark is
 * remembered: a Milestone reached early waits for its week (Ch 9 rule 5).
 */
export function markReachedOn(weighIns: readonly WeighIn[], mark: number, upTo: ISODate): ISODate | null {
  const list = weighIns.filter((w) => w.date <= upTo).sort((a, b) => a.date.localeCompare(b.date))
  let reached: ISODate | null = null
  let firstAtMark: ISODate | null = null
  for (const w of list) {
    if (w.weight > mark) continue
    if (firstAtMark === null) firstAtMark = w.date
    else if (diffDays(firstAtMark, w.date) >= RULES.milestones.lock.minSpanDays) {
      reached = w.date
      break
    }
  }
  // The 7-day average only changes on a weigh-in day or the day one leaves the window.
  const averageDays = RULES.milestones.lock.averageDays
  const candidates = new Set<ISODate>()
  for (const w of list) {
    candidates.add(w.date)
    const leaves = addDays(w.date, averageDays)
    if (leaves <= upTo) candidates.add(leaves)
  }
  for (const day of [...candidates].sort()) {
    if (reached !== null && day >= reached) break
    // One weigh-in alone is not an average; it would skip the two-weigh-in rule (A-115).
    const recent = inWindow(list, day, averageDays)
    const average = recent.length < RULES.momentum.minWeighIns ? null : mean(recent.map((w) => w.weight))
    if (average !== null && average <= mark) {
      reached = day
      break
    }
  }
  return reached
}

/** Within 2% of the goal, as Keeping Milestones count it. */
function nearGoal(average: number | undefined, goal: number): boolean {
  return average !== undefined && Math.abs(average - goal) <= RULES.milestones.keeping.withinShare * goal
}

/** Trailing week closes (newest back) that satisfy `ok`, counting only those after `since`. */
function trailingWeeks(weeks: readonly WeightWeek[], ok: (w: WeightWeek) => boolean, since?: ISODate): number {
  let n = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i]
    if ((since !== undefined && w.day <= since) || !ok(w)) break
    n++
  }
  return n
}

/** Week closes in a row, ending with the newest, with Realm Consistency at 0.85 or more. */
export function consistencyStreak(weeks: readonly WeightWeek[]): number {
  return trailingWeeks(weeks, (w) => w.realmConsistency >= RULES.milestones.dispensation.minRealmConsistency)
}

export interface MilestoneCheck {
  milestones: readonly MilestoneState[]
  /** In lb. */
  weighIns: readonly WeighIn[]
  /** Every week close so far, this one included. */
  weeks: readonly WeightWeek[]
  /** The goal, in lb. */
  goal: number
  /** The week close being settled: its last day and its campaign week. */
  day: ISODate
  week: number
  /** The Healer's Dispensation; on unless false. */
  dispensation?: boolean
}

/**
 * Breaks every Milestone whose locks are open at this week close, in order. A broken Milestone is
 * never revoked. A too-fast week breaks nothing (A-43). The Dispensation may break the next
 * regular Milestone on effort alone, at most once every 8 weeks.
 */
export function breakMilestones(c: MilestoneCheck): { milestones: MilestoneState[]; broken: MilestoneState[] } {
  const milestones = c.milestones.map((m) => ({ ...m }))
  const broken: MilestoneState[] = []
  const thisWeek = c.weeks.find((w) => w.week === c.week)
  if (thisWeek?.tooFast) return { milestones, broken }

  const { dispensation } = RULES.milestones
  const lastByDispensation = Math.max(
    -Infinity,
    ...milestones.filter((m) => m.byDispensation && m.brokenWeek !== undefined).map((m) => m.brokenWeek as number)
  )
  const mayDispense =
    c.dispensation !== false &&
    consistencyStreak(c.weeks) >= dispensation.weeks &&
    c.week - lastByDispensation >= dispensation.oncePerWeeks

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]
    if (m.brokenOn !== undefined) continue
    const sincePrevious = i > 0 ? milestones[i - 1].brokenOn : undefined
    const lock1 = m.keeping
      ? trailingWeeks(c.weeks, (w) => nearGoal(w.average, c.goal), sincePrevious) >= RULES.milestones.keeping.weeks
      : markReachedOn(c.weighIns, m.mark, c.day) !== null
    const lock2 = c.week >= m.earliestWeek
    if (lock1 && lock2) {
      Object.assign(m, { brokenOn: c.day, brokenWeek: c.week, byDispensation: false })
    } else if (mayDispense && !m.keeping && c.week > m.earliestWeek) {
      Object.assign(m, { brokenOn: c.day, brokenWeek: c.week, byDispensation: true })
      broken.push(m)
      break
    } else {
      break
    }
    broken.push(m)
  }
  return { milestones, broken }
}

// ── Goals (Ch 9 rule 8, Ch 16) ───────────────────────────────────────────────

export function bmi(weightLb: number, heightCm: number): number {
  const metres = heightCm / RULES.units.cmPerM
  return weightLb / RULES.units.lbPerKg / (metres * metres)
}

/** Refuses a goal (in `unit`) below BMI 18.5 when a height is known. */
export function checkGoal(goal: number, unit: Unit, heightCm?: number): void {
  if (heightCm === undefined) return
  if (bmi(toLb(goal, unit), heightCm) < RULES.milestones.minBmi) {
    throw new CampaignError(t('healer.unsafeGoal', { goal, unit }))
  }
}

/** When the goal may next change: 28 days after the last change. The founding goal is not a change. */
export function nextGoalChange(goalChangedOn: ISODate | undefined): ISODate | null {
  return goalChangedOn === undefined ? null : addDays(goalChangedOn, RULES.milestones.goalChangeEveryDays)
}

/**
 * Keeps the broken Milestones and plans the rest again, from the last broken mark (or the start)
 * toward the new goal. Earliest weeks still count from the start weight. Weights in lb.
 */
export function replanMilestones(milestones: readonly MilestoneState[], start: number, goal: number): MilestoneState[] {
  const kept = milestones.filter((m) => m.brokenOn !== undefined).map((m) => ({ ...m }))
  const from = kept.length > 0 ? kept[kept.length - 1].mark : start
  return [...kept, ...planMilestones(start, from, goal, RULES.milestones.count - kept.length, kept.length + 1)]
}

/** Changes the campaign's goal (given in the campaign's unit) on `today`, or throws a CampaignError. */
export function changeGoal(state: CampaignState, goal: number, today: ISODate): CampaignState {
  const { campaign, weight } = state
  if (!(goal > 0)) throw new CampaignError('The goal must be a positive weight.')
  const next = nextGoalChange(weight.goalChangedOn)
  if (next !== null && today < next) throw new CampaignError(`The goal can change again on ${next}.`)
  checkGoal(goal, campaign.unit, campaign.heightCm)
  const milestones = replanMilestones(weight.milestones, toLb(campaign.startWeight, campaign.unit), toLb(goal, campaign.unit))
  return {
    ...state,
    campaign: { ...campaign, goalWeight: goal },
    weight: { ...weight, milestones, goalChangedOn: today }
  }
}

// ── The Crown's Grace (Ch 9) ─────────────────────────────────────────────────

/** The mean of M over the last 8 week closes; null with fewer than 4. */
export function steadiness(weeks: readonly WeightWeek[]): number | null {
  if (weeks.length < RULES.grace.minWeeks) return null
  return mean(weeks.slice(-RULES.grace.windowWeeks).map((w) => w.momentum))
}

/** The level a Steadiness earns, before the one-level-a-week limit. */
export function graceFor(steadinessValue: number): GraceLevel {
  return RULES.grace.thresholds.filter((threshold) => steadinessValue >= threshold).length as GraceLevel
}

/** The Grace after this week close: one level at most toward what Steadiness earns. */
export function nextGrace(current: GraceLevel, weeks: readonly WeightWeek[]): GraceLevel {
  const s = steadiness(weeks)
  if (s === null) return current
  const step = RULES.grace.maxLevelChangePerWeek
  return clamp(graceFor(s), current - step, current + step) as GraceLevel
}

/** The catalog slot that describes a Grace level in plain words. */
export function graceTextId(level: GraceLevel): string {
  return `herald.grace.${level}`
}

// ── The Healer's calorie range (Ch 4, A-06, A-44) ────────────────────────────

function daysIn(days: readonly HealerDay[], day: ISODate, windowDays: number): HealerDay[] {
  const after = addDays(day, -windowDays)
  return days.filter((d) => d.date > after && d.date <= day)
}

/** The average kcal over days with food logged in the `windowDays` days ending `day`. */
export function loggedAverage(days: readonly HealerDay[], day: ISODate, windowDays: number): { average: number | null; count: number } {
  const logged = daysIn(days, day, windowDays)
    .map((d) => d.eaten)
    .filter((e): e is number => e !== undefined && e > 0)
  return { average: mean(logged), count: logged.length }
}

/** TDEE = 21-day logged average + trend × 3,500 ÷ 7; needs 14 logged days and a known trend. */
export function tdeeFromLogs(days: readonly HealerDay[], day: ISODate, trendLb: number | null): number | null {
  const { average, count } = loggedAverage(days, day, RULES.healer.logWindowDays)
  if (average === null || count < RULES.healer.minLoggedDays || trendLb === null) return null
  return average + (trendLb * RULES.healer.kcalPerLb) / RULES.clock.daysPerWeek
}

export interface HealerProfile {
  sex?: 'male' | 'female'
  birthYear?: number
  heightCm?: number
  /** The current weight, in lb. */
  weightLb?: number | null
}

/** Mifflin–St Jeor BMR, or null without sex, birth year, height and weight. Age is by calendar year. */
export function mifflinStJeor(profile: HealerProfile, day: ISODate): number | null {
  const { sex, birthYear, heightCm, weightLb } = profile
  if (sex === undefined || birthYear === undefined || heightCm === undefined || weightLb === undefined || weightLb === null) return null
  const m = RULES.healer.bootstrap.mifflin
  const age = Number(day.split('-')[0]) - birthYear
  return m.perKg * (weightLb / RULES.units.lbPerKg) + m.perCm * heightCm - m.perYear * age + m[sex]
}

export type HealerSource = 'logs' | 'burned' | 'mifflin' | 'minimum'

export interface HealerRange {
  /** Where the TDEE came from: logs, else Fitbit burned (A-06), else Mifflin–St Jeor, else nothing. */
  source: HealerSource
  tdee: number | null
  /** TDEE − 1,000 and TDEE − 500, when there is a TDEE. */
  low: number | null
  high: number | null
  /** max(low, 1,200), rounded to the nearest 50. Before smoothing. */
  floor: number
}

/** The Healer's range at `day`, freshly computed (Ch 4 steps 1 to 3). */
export function healerRange(days: readonly HealerDay[], day: ISODate, trendLb: number | null, profile: HealerProfile = {}): HealerRange {
  const h = RULES.healer
  let source: HealerSource = 'logs'
  let tdee = tdeeFromLogs(days, day, trendLb)
  if (tdee === null) {
    source = 'burned'
    tdee = mean(
      daysIn(days, day, h.bootstrap.burnedWindowDays)
        .map((d) => d.burned)
        .filter((b): b is number => b !== undefined && b > 0)
    )
  }
  if (tdee === null) {
    source = 'mifflin'
    const bmr = mifflinStJeor(profile, day)
    tdee = bmr === null ? null : bmr * h.bootstrap.activityFactor
  }
  if (tdee === null) return { source: 'minimum', tdee: null, low: null, high: null, floor: h.minFloor }
  const low = tdee - h.range.lowBelowTdee
  const floor = Math.max(h.minFloor, Math.round(Math.max(low, h.minFloor) / h.roundTo) * h.roundTo)
  return { source, tdee, low, high: tdee - h.range.highBelowTdee, floor }
}

/** A-44: the first floor is set directly; after that it moves at most 100 kcal a week. */
export function smoothFloor(previous: number | undefined, fresh: number): number {
  if (previous === undefined) return fresh
  const most = RULES.healer.maxMovePerWeek
  return previous + clamp(fresh - previous, -most, most)
}

// ── Healer check-ins (Ch 16) ─────────────────────────────────────────────────

/**
 * What the Healer may speak to. Each field feeds one Ch 16 guardrail; leave out what doesn't
 * apply. Weight-side fields come from this module; the rest are facts other systems pass in.
 */
export interface HealerSituation {
  /** This week's Momentum. Feeds tooFast, plateau and regain. */
  momentum?: Pick<Momentum, 'r' | 'mw' | 'mf' | 'qw' | 'tooFast'>
  /** The floor and the two-week logged average. Feeds crashDieting. */
  floor?: number
  loggedAverage?: number | null
  /** A goal just refused (in its unit). Feeds unsafeGoal. */
  refusedGoal?: { goal: number; unit: Unit }
  /** The week's steps went past the pool. Feeds overtraining. */
  stepsOverPool?: boolean
  /** Low-scoring days in a row and the Respite bank. Feeds illnessAndTravel. */
  roughPatch?: { days: number; respite: number }
  /** The player is worried about losing; the Grace sets the earliest Ascendancy week. */
  fearOfLosing?: { grace: GraceLevel }
  /** Days away at launch. Feeds comingBack. */
  awayDays?: number
  /** Something was lost, plainly named. Feeds shame. */
  loss?: { what: string; date: ISODate }
  /** Orders are set for today; when the day closes. Feeds compulsiveChecking. */
  ordersSet?: { closeTime: string }
  payingOrRushing?: boolean
  privacy?: boolean
}

export interface HealerNote {
  checkIn: HealerCheckIn
  facts: TextFacts
}

/** The check-ins a situation calls for, in Ch 16's order. Text: `healerText`. */
export function healerCheckIns(s: HealerSituation): HealerNote[] {
  const found: Partial<Record<HealerCheckIn, TextFacts>> = {}
  if (s.floor !== undefined && s.loggedAverage !== undefined && s.loggedAverage !== null && s.loggedAverage < s.floor) {
    found.crashDieting = { floor: s.floor }
  }
  const m = s.momentum
  if (m?.tooFast) found.tooFast = {}
  else if (m && m.r !== null && m.r < 0) found.regain = {}
  else if (m && m.r !== null && m.mf > m.mw) found.plateau = { consistency: Math.round(m.qw * 100) }
  if (s.refusedGoal) found.unsafeGoal = { goal: s.refusedGoal.goal, unit: s.refusedGoal.unit }
  if (s.stepsOverPool) found.overtraining = {}
  if (s.roughPatch && s.roughPatch.days >= RULES.healer.roughPatchDays) {
    found.illnessAndTravel = { days: s.roughPatch.days, respite: s.roughPatch.respite }
  }
  if (s.fearOfLosing) {
    const { fromWeek, fromWeekGraceIII } = RULES.defeat.ascendancy
    found.fearOfLosing = { week: s.fearOfLosing.grace >= RULES.grace.thresholds.length ? fromWeekGraceIII : fromWeek }
  }
  if (s.awayDays !== undefined && s.awayDays >= RULES.clock.absenceDays) found.comingBack = { days: s.awayDays }
  if (s.loss) found.shame = { what: s.loss.what, date: s.loss.date }
  if (s.ordersSet) found.compulsiveChecking = { closeTime: s.ordersSet.closeTime }
  if (s.payingOrRushing) found.payingOrRushing = {}
  if (s.privacy) found.privacy = {}
  return HEALER_CHECK_INS.filter((id) => found[id] !== undefined).map((id) => ({ checkIn: id, facts: found[id] as TextFacts }))
}

export function healerText(note: HealerNote): string {
  return t(`healer.${note.checkIn}`, note.facts)
}

// ── The week close ───────────────────────────────────────────────────────────

/** A fresh weight slice for a campaign founded with `start` and `goal` (in lb). */
export function initialWeightState(start: number, goal: number): WeightState {
  return { milestones: buildMilestones(start, goal), grace: 0, weeks: [] }
}

export interface WeightWeekInput {
  /** The week's last day and its campaign week. */
  day: ISODate
  week: number
  /** Ledger weigh-ins, already in lb. */
  weighIns: readonly WeighIn[]
  /** Ledger days, for the Healer. */
  days: readonly HealerDay[]
  /** The week's three-pillar score (A-39). */
  qw: number
  /** Realm Consistency at the close (A-39). */
  realmConsistency: number
}

export interface WeightWeekResult {
  weight: WeightState
  momentum: Momentum
  broken: MilestoneState[]
  grace: { from: GraceLevel; to: GraceLevel }
  healer: HealerRange
  checkIns: HealerNote[]
}

/**
 * Everything weight does at one week close: Momentum, the week's record, Milestones, the Grace
 * and the Healer's floor. Settles once: closing a week already recorded changes nothing.
 */
export function closeWeightWeek(campaign: Campaign, weight: WeightState, input: WeightWeekInput): WeightWeekResult {
  const goal = toLb(campaign.goalWeight, campaign.unit)
  const momentum = weekMomentum({ weighIns: input.weighIns, day: input.day, qw: input.qw, goal, cap: campaign.targetPace })
  const profile: HealerProfile = {
    sex: campaign.sex,
    birthYear: campaign.birthYear,
    heightCm: campaign.heightCm,
    weightLb: momentum.weight ?? toLb(campaign.startWeight, campaign.unit)
  }
  const healer = healerRange(input.days, input.day, momentum.r, profile)

  if (weight.weeks.some((w) => w.week === input.week)) {
    return { weight, momentum, broken: [], grace: { from: weight.grace, to: weight.grace }, healer, checkIns: [] }
  }

  const average = avg7(input.weighIns, input.day)
  const record: WeightWeek = {
    week: input.week,
    day: input.day,
    momentum: momentum.m,
    realmConsistency: input.realmConsistency,
    tooFast: momentum.tooFast,
    ...(average === null ? {} : { average })
  }
  const weeks = [...weight.weeks, record]
  const { milestones, broken } = breakMilestones({
    milestones: weight.milestones,
    weighIns: input.weighIns,
    weeks,
    goal,
    day: input.day,
    week: input.week,
    dispensation: campaign.dispensation
  })
  const grace = nextGrace(weight.grace, weeks)
  const healerFloor = smoothFloor(weight.healerFloor, healer.floor)
  const checkIns = healerCheckIns({
    momentum,
    floor: healerFloor,
    loggedAverage: loggedAverage(input.days, input.day, RULES.healer.checkInWindowDays).average
  })
  return {
    weight: { ...weight, milestones, grace, healerFloor, weeks },
    momentum,
    broken,
    grace: { from: weight.grace, to: grace },
    healer,
    checkIns
  }
}
