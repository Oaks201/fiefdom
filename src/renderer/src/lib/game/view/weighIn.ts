/**
 * View models for the weigh-in (Patch 9 stage 1, D-68, D-69): the weigh-in card (W2) with its chart,
 * what the close pays for it, the next Milestone and its waystones (W3); the Healer's weekly report
 * (H1) and the Healer's terms (H2). Pure; components only render these.
 *
 * Like the weigh-in log, it never shows Steadiness or what a coming Milestone unlocks, and every
 * figure is the player's own: the trend, the target pace, the estimated maintenance.
 */
import { addDays, diffDays, isWeekCloseDay, weekCloseDay, weekOf, weighInDay } from '../clock'
import { faithfulIncome, momentumIncome, roundPosting } from '../economy'
import { RULES } from '../rules'
import { faithfulStreak, reputationBonus, weighInQw } from '../settle'
import { weekOn } from '../state'
import { t } from '../text'
import { breakMilestonesOnDay, lbTo, plannedRestPerWeek, targetPace, toLb, weeklyWeighIns, weekMomentum, type Momentum } from '../weight'
import type { CampaignState, HealerSource, ISODate, WeighIn } from '../types'
import { formatNumber } from '../../format'

type Unit = CampaignState['campaign']['unit']

/** How many weekly readings the chart shows, and how many weeks it looks ahead. */
const CHART_READINGS = 12 // rules-ok: the chart's width in weeks, a display choice
const CHART_AHEAD_WEEKS = 8 // rules-ok: the chart's look ahead, a display choice
/** How far ahead the next Milestone's week at target pace is looked for. */
const PACE_HORIZON_WEEKS = 520 // rules-ok: a bound on the projection loop, ten years
const TENTH = 10 // rules-ok: weights and paces show to a tenth

function tenth(x: number): number {
  return Math.round(x * TENTH) / TENTH
}

/** lb in the campaign's unit, to a tenth. */
function inUnit(lb: number, unit: Unit): number {
  return tenth(lbTo(lb, unit))
}

// ── The Healer's terms (H2) ──────────────────────────────────────────────────

export interface HealerTermsView {
  /** The weight week that set them, and the day it settled. */
  week: number
  day: ISODate
  source: HealerSource
  maintenance?: number
  calorieLimit?: number
  stepPool?: number
  /** The Charter now, for comparison. */
  charter: { calorieLimit: number; stepPool: number }
  /** The Healer's words for each, the approved text or else the placeholder (Ch 17). */
  lines: { textId: string; text: string }[]
  /**
   * Rules 3.12.0 (D-72, H5): her terms bind, becoming the Charter's at each weight week, so every contract
   * sealed carries them; false with medical supervision confirmed, when they stay advice.
   */
  binds: boolean
}

/** The Healer's latest terms for the next contract, or null before the first weight week on rules 3.11.0. */
export function healerTermsView(state: CampaignState): HealerTermsView | null {
  const c = state.weight.counsel
  if (!c) return null
  const { unit } = state.campaign
  const k = RULES.healer.counsel
  const lines: { textId: string; text: string }[] = []
  const say = (textId: string, facts: Record<string, string | number> = {}): void => {
    lines.push({ textId, text: t(textId, facts) })
  }
  // An estimate shows to the nearest 50, as the floor and the limit do.
  const maintenance = c.maintenance === undefined ? undefined : Math.round(c.maintenance / RULES.healer.roundTo) * RULES.healer.roundTo
  // D-72 (H6): what the Respite day she plans for each week takes off the other days.
  const rest = formatNumber((plannedRestPerWeek() * k.rest.surplus) / RULES.clock.daysPerWeek)
  if (c.calorieLimit === undefined || maintenance === undefined) {
    say('healer.terms.noEstimate', { weighIns: k.minWeighIns, days: k.minLoggedDays, window: k.windowDays })
  } else if (c.aim === 0) {
    say('healer.terms.maintenance', { limit: formatNumber(c.calorieLimit), maintenance: formatNumber(maintenance), rest })
  } else {
    say('healer.terms.calories', {
      limit: formatNumber(c.calorieLimit),
      maintenance: formatNumber(maintenance),
      deficit: formatNumber((c.aim * RULES.healer.kcalPerLb) / RULES.clock.daysPerWeek),
      rest,
      aim: inUnit(c.aim, unit),
      unit
    })
  }
  if (c.stepPool === undefined) say('healer.terms.noSteps', { weeks: k.steps.weeks })
  else say('healer.terms.steps', { pool: formatNumber(c.stepPool), met: c.stepsMet ?? 0, weeks: c.stepWeeks ?? k.steps.weeks })
  return {
    week: c.week,
    day: c.day,
    source: c.source,
    ...(maintenance !== undefined ? { maintenance } : {}),
    ...(c.calorieLimit !== undefined ? { calorieLimit: c.calorieLimit } : {}),
    ...(c.stepPool !== undefined ? { stepPool: c.stepPool } : {}),
    charter: { calorieLimit: state.charter.calorieLimit, stepPool: state.charter.stepPool },
    lines,
    binds: state.campaign.medicalSupervision !== true
  }
}

// ── The Healer's report (H1) ─────────────────────────────────────────────────

export type ReportSituation = 'notEnough' | 'tooFast' | 'nearGoal' | 'up' | 'flat' | 'behind' | 'onPace' | 'ahead'

/** How the report names a week's trend against the target pace (`RULES.healer.report`). */
export function reportSituation(m: Pick<Momentum, 'r' | 'target' | 'tooFast' | 'maintenance'>): ReportSituation {
  if (m.r === null) return 'notEnough'
  if (m.tooFast) return 'tooFast'
  if (m.maintenance) return 'nearGoal'
  if (m.r < 0) return 'up'
  const { flatBelowShare, aheadAboveShare } = RULES.healer.report
  if (m.r < flatBelowShare * m.target) return 'flat'
  if (m.r < m.target) return 'behind'
  return m.r > (1 + aheadAboveShare) * m.target ? 'ahead' : 'onPace'
}

// ── The weigh-in card (W2, W3) ───────────────────────────────────────────────

export interface ChartPoint {
  date: ISODate
  /** In the campaign's unit. */
  weight: number
}

export interface WeighInChart {
  /** The last weekly readings, oldest first. */
  readings: ChartPoint[]
  /** The trend's least-squares line over its window, ending at the reading; null without a trend. */
  trend: [ChartPoint, ChartPoint] | null
  /** Looking ahead a week at a time from the reading: at the target pace, and at the too-fast pace (1% of weight a week). */
  ahead: { date: ISODate; pace: number; tooFast: number }[]
  /** The unbroken Milestone marks and the goal, in the campaign's unit. */
  marks: { index: number; mark: number }[]
  goal: number
}

export interface Waystone {
  /** A whole pound (or kilogram) between the last Milestone mark and the next. */
  mark: number
  lit: boolean
  /** Lit by this week's reading. */
  fresh: boolean
}

export interface NextMilestoneView {
  index: number
  keeping: boolean
  /** In the campaign's unit. */
  mark: number
  toGo: number
  earliestWeek: number
  /** The campaign week the mark would come at the target pace from this reading; never before its earliest week. */
  weekAtPace: number | null
}

export interface WeighInCardView {
  unit: Unit
  /** The reading's campaign week, and the reading itself in the campaign's unit. */
  week: number
  date: ISODate
  weight: number
  /** Since the weekly reading before, in the campaign's unit. */
  change: number | null
  /** The trend and the target pace, in the campaign's unit a week (loss positive). */
  trend: number | null
  target: number
  /** Its weight week has settled; until then the figures are as things stand, final at `settlesOn`'s close. */
  settled: boolean
  settlesOn: ISODate
  report: { situation: ReportSituation; textId: string; text: string }
  /** What the close pays for it, or paid: Momentum (null when the week close pays it), Faithful at the Scale, Milestones breaking. */
  pays: { momentum: number | null; faithful: number | null; milestones: number[] }
  next: NextMilestoneView | null
  waystones: Waystone[]
  chart: WeighInChart
}

/** The least-squares line through `points` (lb), as its value at the first and last day; null with fewer than two. */
function fitLine(points: readonly WeighIn[]): [WeighIn, WeighIn] | null {
  if (points.length < 2) return null
  const end = points[points.length - 1].date
  const xs = points.map((p) => diffDays(end, p.date))
  const ys = points.map((p) => p.weight)
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, y) => s + y, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  const at = (x: number): number => my + (num / den) * (x - mx)
  return [
    { date: points[0].date, weight: at(xs[0]) },
    { date: end, weight: at(0) }
  ]
}

/** The weeks from `from` (lb) to `mark` at the target pace, a week at a time; null past the horizon. */
function weeksAtPace(from: number, mark: number, cap: number | undefined): number | null {
  let w = from
  for (let k = 0; k <= PACE_HORIZON_WEEKS; k++) {
    if (w <= mark) return k
    w -= targetPace(w, cap)
  }
  return null
}

/** The whole units strictly between `upper` and `lower` (lb), in the campaign's unit, heaviest first. */
function wholeUnitsBetween(upper: number, lower: number, unit: Unit): number[] {
  const hi = lbTo(upper, unit)
  const lo = lbTo(lower, unit)
  const out: number[] = []
  for (let u = Math.ceil(hi) - 1; u > lo; u--) out.push(u)
  return out
}

/**
 * The weigh-in card for the latest weekly reading on or before `today`, when it is this week's or the
 * week before's; null otherwise. `weighInsLb` are the player's weigh-ins in lb (the ledger's, live).
 * Before its weight week settles, the card shows what the close will pay as things stand (D-45's way).
 */
export function weighInCard(state: CampaignState, weighInsLb: readonly WeighIn[], today: ISODate): WeighInCardView | null {
  const { campaign } = state
  const { unit, weekStartsOn } = campaign
  const weekly = weeklyWeighIns(
    weighInsLb.filter((w) => w.date <= today),
    weekStartsOn
  )
  const reading = weekly.at(-1)
  if (!reading || reading.date < campaign.startDate || diffDays(weekOf(reading.date, weekStartsOn), weekOf(today, weekStartsOn)) > RULES.clock.daysPerWeek) return null
  const index = weekly.length - 1
  const week = weekOn(state, reading.date)
  const record = state.weight.weeks.find((w) => w.week === week)
  // A weigh-in settles its week at its own close from week 2 (D-69), unless that close is the week close.
  const early = week >= 2 && reading.date >= weighInDay(reading.date, weekStartsOn) && !(record === undefined && isWeekCloseDay(today, weekStartsOn))
  const settlesOn = record?.day ?? (early ? today : weekCloseDay(reading.date, weekStartsOn))
  const upTo = weekly.filter((w) => w.date <= settlesOn)
  const goal = toLb(campaign.goalWeight, unit)
  const qw = record?.qw ?? (early ? weighInQw(state, settlesOn) : undefined)
  const momentum = weekMomentum({ weighIns: upTo, day: settlesOn, qw: qw ?? 0, goal, cap: campaign.targetPace })
  const situation = reportSituation(momentum)

  // What the close pays, or paid.
  const bonus = reputationBonus(state)
  const posted = (source: string, from: ISODate, to: ISODate): number | null => {
    const events = state.purse.events.filter((e) => e.source === source && e.date >= from && e.date <= to)
    return events.length > 0 ? roundPosting(events.reduce((s, e) => s + e.amount, 0)) : null
  }
  const total = (lines: readonly { amount: number }[]): number => roundPosting(lines.reduce((s, l) => s + l.amount, 0))
  const weekStart = weekOf(reading.date, weekStartsOn)
  const faithfulPaid = state.weight.faithful?.paidWeek === week
  const faithful = faithfulPaid ? posted('faithful', weekStart, weekCloseDay(reading.date, weekStartsOn)) : total(faithfulIncome(faithfulStreak(state, reading.date), bonus))
  const momentumPay = record ? (posted('momentum', record.day, record.day) ?? 0) : early ? total(momentumIncome(momentum.m, bonus)) : null
  const breaking = record
    ? state.weight.milestones.filter((m) => m.brokenOn !== undefined && m.brokenOn >= weekStart && m.brokenOn <= weekCloseDay(reading.date, weekStartsOn)).map((m) => m.index)
    : breakMilestonesOnDay({ milestones: state.weight.milestones, weighIns: upTo, day: settlesOn, week, weekStartsOn }).broken.map((m) => m.index)

  // The next Milestone and its waystones.
  const lowest = Math.min(...weekly.map((w) => w.weight))
  const lowestBefore = index > 0 ? Math.min(...weekly.slice(0, index).map((w) => w.weight)) : Infinity
  const unbroken = state.weight.milestones.filter((m) => m.brokenOn === undefined && !breaking.includes(m.index))
  const nextMark = unbroken[0]
  let next: NextMilestoneView | null = null
  let waystones: Waystone[] = []
  if (nextMark) {
    const passed = state.weight.milestones.filter((m) => m.index < nextMark.index && !m.keeping)
    const upper = passed.length > 0 ? passed[passed.length - 1].mark : toLb(campaign.startWeight, unit)
    const atPace = nextMark.keeping ? null : weeksAtPace(reading.weight, nextMark.mark, campaign.targetPace)
    next = {
      index: nextMark.index,
      keeping: nextMark.keeping === true,
      mark: inUnit(nextMark.mark, unit),
      toGo: inUnit(Math.max(0, reading.weight - nextMark.mark), unit),
      earliestWeek: nextMark.earliestWeek,
      weekAtPace: atPace === null ? null : Math.max(nextMark.earliestWeek, week + atPace)
    }
    if (!nextMark.keeping) {
      waystones = wholeUnitsBetween(upper, nextMark.mark, unit).map((mark) => {
        const lb = toLb(mark, unit)
        return { mark, lit: lowest <= lb, fresh: reading.weight <= lb && lowestBefore > lb }
      })
    }
  }

  // The chart.
  const shown = weekly.slice(-CHART_READINGS)
  const trendPoints = upTo.filter((w) => w.date > addDays(settlesOn, -RULES.momentum.trendWindowDays))
  const line = momentum.r === null ? null : fitLine(trendPoints)
  const ahead: WeighInChart['ahead'] = []
  let pace = reading.weight
  let fast = reading.weight
  for (let k = 1; k <= CHART_AHEAD_WEEKS; k++) {
    pace -= targetPace(pace, campaign.targetPace)
    fast -= RULES.momentum.tooFast.shareOfWeightPerWeek * fast
    ahead.push({ date: addDays(reading.date, k * RULES.clock.daysPerWeek), pace: inUnit(pace, unit), tooFast: inUnit(fast, unit) })
  }
  const facts = {
    trend: momentum.r === null ? 0 : inUnit(Math.abs(momentum.r), unit),
    target: inUnit(momentum.target, unit),
    unit,
    limit: momentum.weight === null ? 0 : inUnit(RULES.momentum.tooFast.shareOfWeightPerWeek * momentum.weight, unit),
    share: Math.round(RULES.momentum.maintenance.averageWithinShare * 100),
    days: RULES.momentum.minWeighInSpanDays
  }
  return {
    unit,
    week,
    date: reading.date,
    weight: inUnit(reading.weight, unit),
    change: index > 0 ? inUnit(reading.weight - weekly[index - 1].weight, unit) : null,
    trend: momentum.r === null ? null : inUnit(momentum.r, unit),
    target: inUnit(momentum.target, unit),
    settled: record !== undefined,
    settlesOn,
    report: { situation, textId: `healer.report.${situation}`, text: t(`healer.report.${situation}`, facts) },
    pays: { momentum: momentumPay, faithful, milestones: breaking },
    next,
    waystones,
    chart: {
      readings: shown.map((w) => ({ date: w.date, weight: inUnit(w.weight, unit) })),
      trend: line ? [{ date: line[0].date, weight: inUnit(line[0].weight, unit) }, { date: line[1].date, weight: inUnit(line[1].weight, unit) }] : null,
      ahead,
      marks: unbroken.filter((m) => !m.keeping).map((m) => ({ index: m.index, mark: inUnit(m.mark, unit) })),
      goal: campaign.goalWeight
    }
  }
}
