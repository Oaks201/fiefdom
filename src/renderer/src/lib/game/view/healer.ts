/**
 * View models for the Healer as a character (Patch 9 stage 2b, D-68, D-76): her request for the week (H3) with
 * how it stands so far, read live from the ledger, and an Audience with her (H4): this week's report and her
 * answers to the player's questions, every one from the rules in plain facts. Talking with her pays nothing.
 * Pure; components only render these.
 */
import { addDays, weekOf, weighInDay } from '../clock'
import { healerRequestIncome, roundPosting } from '../economy'
import { habitFigure, habitMost, isDayCount, requestMet, type HabitDay } from '../healer'
import { snapshotDay, toDayRecord } from '../ledgerDays'
import { realmEffects } from '../effects'
import { RULES } from '../rules'
import { charterOn, currentTerms, reputationBonus } from '../settle'
import { respiteDays } from '../state'
import { t, type TextFacts } from '../text'
import { lbTo, toLb } from '../weight'
import type { CampaignState, HealerHabit, HealerRequest, HealerSource, ISODate, WeighIn } from '../types'
import type { Ledger } from '../../types'
import { formatNumber } from '../../format'
import { healerTermsView, weighInCard } from './weighIn'

const PERCENT = 100 // rules-ok: a share shown as a percentage
const TENTH = 10 // rules-ok: weights show to a tenth

/** Her words for a slot: the approved text, or else the placeholder (Ch 17). */
export interface HealerWords {
  textId: string
  text: string
}

function words(textId: string, facts: TextFacts = {}): HealerWords {
  return { textId, text: t(textId, facts) }
}

// ── Her request (H3) ─────────────────────────────────────────────────────────

/** The request's days from its first through `today`, live: settled or not, as the ledger has them now. */
function liveRequestDays(state: CampaignState, ledger: Ledger, q: Pick<HealerRequest, 'madeOn' | 'until'>, today: ISODate): HabitDay[] {
  const rest = new Set(respiteDays(state))
  const out: HabitDay[] = []
  for (let d = addDays(q.madeOn, 1); d <= today && d <= q.until; d = addDays(d, 1)) {
    out.push({ ...toDayRecord(snapshotDay(ledger, d, charterOn(state, d))), rest: rest.has(d), terms: currentTerms(state, d) })
  }
  return out
}

/** What a request asks, as her words say it. */
function askFacts(state: CampaignState, q: Pick<HealerRequest, 'habit' | 'target' | 'last' | 'until'>, today: ISODate): TextFacts {
  const charter = charterOn(state, today)
  const facts: TextFacts = { target: q.target, last: q.last, days: RULES.clock.daysPerWeek, date: q.until }
  if (q.habit === 'withinLimit') facts.limit = formatNumber(charter.calorieLimit)
  if (q.habit === 'steps') facts.steps = formatNumber(Math.round((charter.stepPool * q.target) / PERCENT))
  return facts
}

/** A habit held at its most, as the hold line names it (plain facts). */
function heldWhat(habit: HealerHabit, limit: number): string {
  switch (habit) {
    case 'foodLogged':
      return 'food logged on every day'
    case 'withinLimit':
      return `every day within the calorie limit of ${formatNumber(limit)} kcal`
    case 'steps':
      return 'the whole step pool walked'
    case 'duties':
      return 'every duty kept on every day'
  }
}

export interface HealerRequestView {
  habit: HealerHabit
  target: number
  last: number
  until: ISODate
  /** Counted in days of the week, or in points of the step pool. */
  unit: 'days' | 'points'
  /** The most it could ask. */
  most: number
  /** Her ask in her words. */
  ask: HealerWords
  /** How the week stands so far, live, in the request's own terms; met when it reaches the target. */
  soFar: number
  /** Met: paid at the close of the day it was met, or (live) at today's close. */
  met: boolean
  paid: boolean
  /** Her words once it is met. */
  metWords: HealerWords | null
  /** Her word on last week's request, when it was missed: nothing is lost. */
  lastMissed: HealerWords | null
  /** What meeting it pays, and how many more met bank the next Respite day. */
  reward: number
  toRespite: number
}

/**
 * Her request for `today`'s week (H3): the open one with how it stands so far (live, from the ledger), or this
 * week's already met and paid; null when she has asked nothing this week.
 */
export function healerRequestView(state: CampaignState, ledger: Ledger, today: ISODate): HealerRequestView | null {
  const r = RULES.healer.requests
  const q = state.weight.request
  if (!q || q.madeOn >= today || today > q.until) return null
  const paid = q.metOn !== undefined
  const paidEvent = paid ? state.log.findLast((e) => e.kind === 'healerRequest' && e.stage === 'met' && e.until === q.until) : undefined
  const days = liveRequestDays(state, ledger, q, today)
  const met = paid || requestMet(q, days)
  const charter = charterOn(state, today)
  const hold = q.target === q.last
  const ask = hold ? words('healer.request.hold', { what: heldWhat(q.habit, charter.calorieLimit), date: q.until }) : words(`healer.request.${q.habit}`, askFacts(state, q, today))
  const reward = paidEvent?.kind === 'healerRequest' && paidEvent.reward !== undefined ? paidEvent.reward : roundPosting(healerRequestIncome(reputationBonus(state))[0].amount)
  const metCount = (state.weight.requestsMet ?? 0) + (met && !paid ? 1 : 0)
  const banked = paidEvent?.kind === 'healerRequest' && paidEvent.respite === true
  return {
    habit: q.habit,
    target: q.target,
    last: q.last,
    until: q.until,
    unit: isDayCount(q.habit) ? 'days' : 'points',
    most: habitMost(q.habit),
    ask,
    soFar: Math.min(habitMost(q.habit), habitFigure(q.habit, days)),
    met,
    paid,
    metWords: met ? (banked ? words('healer.request.metRespite', { reward, every: r.respiteEvery }) : words('healer.request.met', { reward })) : null,
    lastMissed: state.log.some((e) => e.kind === 'healerRequest' && e.stage === 'missed' && e.until === q.madeOn) ? words('healer.request.missed') : null,
    reward,
    toRespite: r.respiteEvery - (metCount % r.respiteEvery)
  }
}

// ── An Audience with her (H4) ────────────────────────────────────────────────

export interface HealerQuestion {
  id: 'doing' | 'floor' | 'scaleUp' | 'next' | 'faster' | 'rest'
  label: string
  answer: HealerWords[]
}

export interface HealerAudienceView {
  /** Her opening: this week's report, or that there is no reading. */
  opening: HealerWords
  request: HealerRequestView | null
  questions: HealerQuestion[]
}

/** Where a maintenance estimate came from, in plain words for her floor answer. */
const SOURCE_WORDS: Record<Exclude<HealerSource, 'minimum'>, string> = {
  logs: 'from your logged food and the weight trend',
  burned: 'from the calories your tracker says you burned',
  mifflin: 'from the Mifflin–St Jeor formula for your height, weight and age'
}

function tenth(x: number): number {
  return Math.round(x * TENTH) / TENTH
}

/**
 * An Audience with the Healer on `today` (H4): her opening (the weigh-in card's report, or that there is no
 * reading this week or last), her request, and her answers to how the player is doing, the floor, a scale gone
 * up (only when it has), the next Milestone, what losing faster earns, and rest. `weighInsLb` are the
 * player's weigh-ins in lb (the ledger's, live).
 */
export function healerAudience(state: CampaignState, ledger: Ledger, weighInsLb: readonly WeighIn[], today: ISODate): HealerAudienceView {
  const { unit, weekStartsOn } = state.campaign
  const card = weighInCard(state, weighInsLb, today)
  const terms = healerTermsView(state)
  const opening = card ? { textId: card.report.textId, text: card.report.text } : words('healer.audience.noReading', { day: weighInDay(today, weekStartsOn) < today ? weighInDay(addDays(weekOf(today, weekStartsOn), RULES.clock.daysPerWeek), weekStartsOn) : weighInDay(today, weekStartsOn) })
  const questions: HealerQuestion[] = []

  questions.push({ id: 'doing', label: 'How am I doing?', answer: [opening, ...(card?.siege ? [card.siege] : []), ...(terms?.lines ?? [])] })

  const floor = state.weight.healerFloor
  const from = state.weight.floorFrom
  const h = RULES.healer
  questions.push({
    id: 'floor',
    label: floor !== undefined ? `Why is my floor ${formatNumber(floor)} kcal?` : 'What is my calorie floor?',
    answer: [
      floor === undefined
        ? words('healer.audience.floorNone')
        : from && from.source !== 'minimum' && from.tdee !== undefined
          ? words('healer.audience.floor', {
              floor: formatNumber(floor),
              tdee: formatNumber(Math.round(from.tdee / h.roundTo) * h.roundTo),
              source: SOURCE_WORDS[from.source],
              below: formatNumber(h.range.lowBelowTdee),
              low: formatNumber(Math.round((from.tdee - h.range.lowBelowTdee) / h.roundTo) * h.roundTo),
              min: formatNumber(h.minFloor),
              move: h.maxMovePerWeek
            })
          : words('healer.audience.floorMinimum', { floor: formatNumber(floor) })
    ]
  })

  if (card && card.change !== null && card.change > 0) {
    const floors = RULES.momentum.plateauFloor.map((f) => Math.round(f.floor * PERCENT))
    const trend = card.trend === null ? 'not yet read' : card.trend >= 0 ? `${card.trend.toFixed(1)} ${unit} a week down` : `${Math.abs(card.trend).toFixed(1)} ${unit} a week up`
    questions.push({
      id: 'scaleUp',
      label: 'Why did the scale go up?',
      answer: [words('healer.audience.scaleUp', { change: card.change.toFixed(1), unit, window: RULES.momentum.trendWindowDays, trend, low: Math.min(...floors), high: Math.max(...floors) })]
    })
  }

  const next = card?.next
  const unbroken = state.weight.milestones.filter((m) => m.brokenOn === undefined)
  if (next) {
    questions.push({
      id: 'next',
      label: 'When is my next Milestone?',
      answer: [
        next.keeping
          ? words('healer.audience.nextKeeping', { index: next.index })
          : next.toGo === 0
            ? words('healer.audience.nextReached', { index: next.index, mark: next.mark, unit, earliest: next.earliestWeek })
            : words('healer.audience.next', { index: next.index, mark: next.mark, unit, toGo: next.toGo.toFixed(1), earliest: next.earliestWeek, week: next.weekAtPace ?? next.earliestWeek })
      ]
    })
  } else if (unbroken.length === 0) {
    questions.push({ id: 'next', label: 'When is my next Milestone?', answer: [words('healer.audience.allBroken')] })
  }

  const weight = card ? toLb(card.weight, unit) : toLb(state.campaign.startWeight, unit)
  questions.push({
    id: 'faster',
    label: 'What does losing faster earn?',
    answer: [
      words('healer.audience.faster', {
        target: card ? card.target.toFixed(1) : tenth(lbTo(RULES.momentum.targetPace.capLb, unit)).toFixed(1),
        unit,
        limit: tenth(lbTo(RULES.momentum.tooFast.shareOfWeightPerWeek * weight, unit)).toFixed(1)
      })
    ]
  })

  const bank = state.contracts.respiteBank
  const cap = realmEffects(state).respiteBank.value
  questions.push({
    id: 'rest',
    label: 'Can I rest?',
    answer: [bank > 0 ? words('healer.audience.rest', { bank, cap, every: RULES.respite.earnEveryDays }) : words('healer.audience.restNone', { every: RULES.respite.earnEveryDays, cap })]
  })

  return { opening, request: healerRequestView(state, ledger, today), questions }
}
