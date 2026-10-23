/**
 * View models for the Contract page and the Archive's campaign cards (T14, Ch 4, D-01): the
 * lengths with their exact unlock requirements, the pledge cap, payout previews, the running
 * contract's live score, progress and projection (D-45), withdrawal, the Respite bank and the
 * Steward's Counsel. Pure; components only render these.
 */
import { addDays, diffDays, weekOf } from '../clock'
import { charterLocked, respiteRefusal, withdrawalPreview, type WithdrawalPreview } from '../contractActions'
import { contractPayout, payoutCurve, pledgeCap, pledgeReturn, sealRefusal, startDays, stewardSuggestion, accordRespectGain } from '../contracts'
import { balance, roundPosting, withBonus } from '../economy'
import { numeral, realmEffects } from '../effects'
import { snapshotDay, snapshotsBetween, toDayRecord } from '../ledgerDays'
import { RULES } from '../rules'
import { budgetScore, poolShare, tableIntake, termsOf, weekScores, type ScoreTerms } from '../score'
import { charterOn, contractScore } from '../settle'
import { openDayOf } from '../state'
import { t } from '../text'
import type { CampaignState, Charter, ContractTerm, DayRecord, ISODate, LandContract, Pillars, RivalId } from '../types'
import type { Ledger } from '../../types'


// ── Lengths and pledges ──────────────────────────────────────────────────────

export interface LengthRequirement {
  kind: 'anyBuildingTier' | 'castleTier'
  tier: number
  /** "Castle Tier II", "a building at Tier II". */
  label: string
}

export interface LengthOption {
  days: ContractTerm
  multiplier: number
  unlocked: boolean
  requirement?: LengthRequirement
  /** The payout at Q = 100%, before the reputation bonus. */
  fullPayout: number
  /** The pledge cap for this length now (×1.5 at Merchant Hall III), never above the purse. */
  pledgeCap: number
}

function requirementOf(unlock: (typeof RULES.contracts.lengths)[number]['unlock']): LengthRequirement | undefined {
  if (unlock.kind === 'start') return undefined
  return unlock.kind === 'castleTier'
    ? { kind: 'castleTier', tier: unlock.tier, label: `Castle Tier ${numeral(unlock.tier)}` }
    : { kind: 'anyBuildingTier', tier: unlock.tier, label: `a building at Tier ${numeral(unlock.tier)}` }
}

/** Every contract length (1, 3, 7, 14 and 30 days), unlocked or with its exact requirement. */
export function lengthOptions(state: CampaignState): LengthOption[] {
  const topBuilding = Math.max(...Object.values(state.buildings))
  const capMult = realmEffects(state).pledgeCap.value
  const held = balance(state.purse)
  return RULES.contracts.lengths.map((l) => {
    const u = l.unlock
    const unlocked = u.kind === 'start' || (u.kind === 'anyBuildingTier' ? topBuilding >= u.tier : state.castleTier >= u.tier)
    const requirement = requirementOf(u)
    return {
      days: l.days as ContractTerm,
      multiplier: l.multiplier,
      unlocked,
      ...(unlocked || !requirement ? {} : { requirement }),
      fullPayout: roundPosting(contractPayout(l.days, 1)),
      pledgeCap: roundPosting(pledgeCap(l.days, capMult, held))
    }
  })
}

export interface PayoutRow {
  /** Q, 0 to 1. */
  score: number
  /** The payout with the reputation bonus, and the pledge's return, as posted. */
  payout: number
  pledgeReturn: number
  /** What the contract leaves the purse with, the pledge paid back out: payout + return − pledge. */
  net: number
}

export interface PayoutPreview {
  days: ContractTerm
  pledge: number
  /** The score at which the pledge comes back whole ("at 70%: break even"); null without a pledge. */
  breakEven: number | null
  rows: PayoutRow[]
}

/** The scores a preview shows. */
const PREVIEW_SCORES = [0.5, 0.7, 0.9, 1] // rules-ok: the points a preview shows, not a rule

/** What a contract of `days` with `pledge` pays at a few scores (Ch 4, A-112: the bonus is on the payout only). */
export function payoutPreview(state: CampaignState, days: ContractTerm, pledge: number): PayoutPreview {
  const effects = realmEffects(state)
  const bonus = effects.reputationBonus.value
  const minShare = effects.minPledgeReturn.value
  const rows = PREVIEW_SCORES.map((score) => {
    const payout = roundPosting(withBonus(contractPayout(days, score), bonus))
    const back = roundPosting(pledgeReturn(pledge, score, minShare))
    return { score, payout, pledgeReturn: back, net: roundPosting(payout + back - pledge) }
  })
  const { start, span } = RULES.contracts.payoutCurve
  const breakEven = pledge > 0 && minShare < 1 ? start + span / RULES.contracts.pledge.returnMultiplier : pledge > 0 ? 0 : null
  return { days, pledge, breakEven, rows }
}

// ── The running contract ─────────────────────────────────────────────────────

export interface ContractSummary {
  id: string
  kind: LandContract['kind']
  rival?: RivalId
  termDays: ContractTerm
  startDate: ISODate
  endDate: ISODate
  pledge: number
  status: LandContract['status']
  respiteDates: ISODate[]
}

function summary(c: LandContract): ContractSummary {
  return {
    id: c.id,
    kind: c.kind,
    ...(c.rival ? { rival: c.rival } : {}),
    termDays: c.termDays,
    startDate: c.startDate,
    endDate: c.endDate,
    pledge: c.pledge,
    status: c.status,
    respiteDates: [...c.respiteDates]
  }
}

export interface RespiteDay {
  day: ISODate
  allowed: boolean
  /** Why not, for the button's tooltip. */
  reason?: string
}

// ── Progress (D-45) ──────────────────────────────────────────────────────────

export interface ProgressDay {
  date: ISODate
  /**
   * `settled`: closed and in the score. `today`: the open day, its figures so far, which enter the
   * score at its close. `upcoming`: not begun. `respite`: a Respite day, left out of the score.
   */
  state: 'settled' | 'today' | 'upcoming' | 'respite'
  steps?: number
  eaten?: number
  dutiesKept: number
  dutiesSworn: number
  /** Steps against the pool's share for one day (pool ÷ 7), capped at 1. */
  stepsShare: number
  /** The day's food against the limit: within it, over it, logged well under the Healer's floor (A-41), or not logged. */
  calories: 'within' | 'over' | 'underFloor' | 'unlogged'
  /** The day's own budget score, 0 to 1: 1 within the limit, falling to 0 at 15% over (A-41's under-floor rule included), 0 unlogged. */
  tableShare: number
}

export interface ProgressWeek {
  weekStart: ISODate
  /** The calendar week's seven days in order; null for a day outside the contract. */
  days: (ProgressDay | null)[]
  /** q_w over the week's settled days of the contract so far, or null before one has settled. */
  score: number | null
}

export interface ContractProgress {
  weeks: ProgressWeek[]
  /** The step pool's share for one day, rounded: what a day's steps are set against. */
  dailySteps: number
  calorieLimit: number
  /** Each pillar over the settled days, weeks weighted by their days as the score weighs them, so the three average to it (Ch 4). */
  pillars: Pillars
  /** What lies behind each pillar, over the settled days. */
  steps: { walked: number; share: number }
  table: { logged: number; days: number; average: number | null }
  duties: { kept: number; sworn: number }
}

function progressDay(day: DayRecord, state: ProgressDay['state'], terms: ScoreTerms): ProgressDay {
  const floor = terms.floor ?? RULES.healer.minFloor
  const eaten = day.eaten
  const calories = eaten === undefined ? 'unlogged' : eaten < RULES.healer.underFloorShare * floor ? 'underFloor' : eaten <= terms.calorieLimit ? 'within' : 'over'
  return {
    date: day.date,
    state,
    ...(day.steps !== undefined ? { steps: day.steps } : {}),
    ...(eaten !== undefined ? { eaten } : {}),
    dutiesKept: day.dutiesKept,
    dutiesSworn: day.dutiesSworn,
    stepsShare: Math.min(1, Math.max(0, day.steps ?? 0) / poolShare(terms.stepPool, 1)),
    calories,
    tableShare: eaten === undefined ? 0 : budgetScore(tableIntake(eaten, terms), terms.calorieLimit)
  }
}

/** Today is the running contract's last day and nothing follows it yet: the next can be sealed to begin at dawn (D-45). */
export function nextContractDue(state: CampaignState, today: ISODate = openDayOf(state)): boolean {
  return state.contracts.active?.endDate === today && sealRefusal(state.contracts, today) === null
}

/**
 * The running contract's days by calendar week (D-45): each settled day's steps, calories and
 * duties, today's so far when `ledger` is given, each week's q_w and the pillars behind the score.
 * Only settled days count, as they do in the score and the payout.
 */
export function contractProgress(state: CampaignState, contract: LandContract, today: ISODate, ledger?: Ledger): ContractProgress {
  const ws = state.campaign.weekStartsOn
  const terms = termsOf(contract.charter)
  const last = state.settledThrough.day < contract.endDate ? state.settledThrough.day : contract.endDate
  const records = contract.startDate <= last ? snapshotsBetween(state.settlement.snapshots, contract.startDate, last).map(toDayRecord) : []
  const byDate = new Map(records.map((d) => [d.date, d]))
  const respite = new Set(contract.respiteDates)
  const scored = records.filter((d) => !respite.has(d.date))
  const weekly = weekScores(scored, terms, ws)

  const dayOf = (date: ISODate): ProgressDay | null => {
    if (date < contract.startDate || date > contract.endDate) return null
    const blank: DayRecord = { date, dutiesKept: 0, dutiesSworn: contract.charter.duties.length }
    const settled = byDate.get(date)
    if (respite.has(date)) return progressDay(settled ?? blank, 'respite', terms)
    if (settled) return progressDay(settled, 'settled', terms)
    if (date === today) return progressDay(ledger ? toDayRecord(snapshotDay(ledger, date, charterOn(state, date))) : blank, 'today', terms)
    return progressDay(blank, 'upcoming', terms)
  }
  const weeks: ProgressWeek[] = []
  for (let start = weekOf(contract.startDate, ws); start <= contract.endDate; start = addDays(start, RULES.clock.daysPerWeek)) {
    const week = weekly.find((w) => w.weekStart === start)
    weeks.push({ weekStart: start, days: Array.from({ length: RULES.clock.daysPerWeek }, (_, i) => dayOf(addDays(start, i))), score: week ? week.score : null })
  }

  const n = weekly.reduce((sum, w) => sum + w.days, 0)
  const withDuties = weekly.filter((w) => !w.pillars.noDuties)
  const nDuties = withDuties.reduce((sum, w) => sum + w.days, 0)
  const weighted = (list: typeof weekly, total: number, pick: (p: Pillars) => number): number => (total > 0 ? list.reduce((sum, w) => sum + w.days * pick(w.pillars), 0) / total : 0)
  const pillars: Pillars = {
    steps: weighted(weekly, n, (p) => p.steps),
    table: weighted(weekly, n, (p) => p.table),
    duties: weighted(withDuties, nDuties, (p) => p.duties),
    ...(n > 0 && nDuties === 0 ? { noDuties: true as const } : {})
  }
  const logged = scored.filter((d) => d.eaten !== undefined)
  return {
    weeks,
    dailySteps: Math.round(poolShare(terms.stepPool, 1)),
    calorieLimit: terms.calorieLimit,
    pillars,
    steps: { walked: scored.reduce((sum, d) => sum + Math.max(0, d.steps ?? 0), 0), share: Math.round(poolShare(terms.stepPool, scored.length)) },
    table: { logged: logged.length, days: scored.length, average: logged.length > 0 ? Math.round(logged.reduce((sum, d) => sum + (d.eaten as number), 0) / logged.length) : null },
    duties: { kept: scored.reduce((sum, d) => sum + Math.min(d.dutiesKept, d.dutiesSworn), 0), sworn: scored.reduce((sum, d) => sum + d.dutiesSworn, 0) }
  }
}

export interface RunningView {
  contract: ContractSummary
  /** It has begun (its first dawn has come). */
  started: boolean
  /** Today's day of the contract, 1-based (0 before it starts), how many it has, Respite included, and how many come after today. */
  dayNumber: number
  totalDays: number
  daysLeft: number
  /** Today is its last day: the next contract can be sealed to follow it (D-45). */
  lastDay: boolean
  /** Q over its settled days so far, its three pillars, and how many days that is. */
  score: number
  pillars: Pillars
  settledDays: number
  progress: ContractProgress
  /** What it pays at today's Q: the payout before and with the reputation bonus, and the pledge's return; and the payout, with the bonus, at Q = 100%. */
  projected: { payout: number; payoutWithBonus: number; pledgeReturn: number; fullWithBonus: number }
  withdrawal: WithdrawalPreview
  respite: { bank: number; days: RespiteDay[] }
  /** An Accord: its rival, the Respect at its seal, and the Respect it would add at today's Q (D-01). */
  accord?: { rival: RivalId; respectAtStart: number; projectedGain: number }
}

/** A contract's projected payout at score `q`, before the reputation bonus: 10 × days × L × f(Q). */
export function projectedPayout(termDays: number, q: number): number {
  return roundPosting(contractPayout(termDays, q))
}

/** The running contract as the Contract page shows it, or null with none. `ledger` adds today's figures so far to its progress. */
export function runningView(state: CampaignState, today: ISODate = openDayOf(state), ledger?: Ledger): RunningView | null {
  const c = state.contracts.active
  if (!c) return null
  const ws = state.campaign.weekStartsOn
  const effects = realmEffects(state)
  const progress = contractProgress(state, c, today, ledger)
  const settledDays = progress.table.days
  const score = settledDays > 0 ? contractScore(state, c, today, ws) : 0
  const started = c.startDate <= today
  // Its days by the calendar: its term, and a day more for each Respite spent before rules 3.6.0 (D-54).
  const totalDays = diffDays(c.startDate, c.endDate) + 1
  const dayNumber = started ? Math.min(diffDays(c.startDate, today) + 1, totalDays) : 0
  const respiteDay = (day: ISODate): RespiteDay => {
    if (state.contracts.respiteBank < 1) return { day, allowed: false, reason: 'No Respite days are banked.' }
    if (day < c.startDate || day > c.endDate) return { day, allowed: false, reason: 'The contract does not cover this day.' }
    if (c.respiteDates.includes(day)) return { day, allowed: false, reason: 'Already a Respite day.' }
    const refusal = respiteRefusal(state, day, today)
    if (refusal) return { day, allowed: false, reason: refusal }
    return { day, allowed: true }
  }
  return {
    contract: summary(c),
    started,
    dayNumber,
    totalDays,
    daysLeft: totalDays - dayNumber,
    lastDay: c.endDate === today,
    score,
    pillars: progress.pillars,
    settledDays,
    progress,
    projected: {
      payout: projectedPayout(c.termDays, score),
      payoutWithBonus: roundPosting(withBonus(contractPayout(c.termDays, score), effects.reputationBonus.value)),
      pledgeReturn: roundPosting(pledgeReturn(c.pledge, score, effects.minPledgeReturn.value)),
      fullWithBonus: roundPosting(withBonus(contractPayout(c.termDays, 1), effects.reputationBonus.value))
    },
    withdrawal: withdrawalPreview(state, today) as WithdrawalPreview,
    respite: { bank: state.contracts.respiteBank, days: [respiteDay(addDays(today, -1)), respiteDay(today)] },
    ...(c.kind === 'accord' && c.rival
      ? { accord: { rival: c.rival, respectAtStart: c.respectAtStart ?? state.rivals[c.rival].respect, projectedGain: accordRespectGain(payoutCurve(score), c.respectAtStart ?? state.rivals[c.rival].respect) } }
      : {})
  }
}

// ── The page ─────────────────────────────────────────────────────────────────

export interface ContractPageView {
  lengths: LengthOption[]
  charter: Charter & { floor: number; locked: boolean; medicalSupervision: boolean }
  /** The days a contract sealed today may start, earliest first (D-06): from the next dawn. */
  sealStartDays: ISODate[]
  /** A contract can be sealed today: none runs, or today is the running one's last day and none follows it yet (D-45). */
  canSeal: boolean
  running: RunningView | null
  /** The contract sealed to follow the running one. */
  queued?: ContractSummary
  respiteBank: number
  /** The Steward's Counsel, when 4 weeks call for it (Ch 4). */
  steward?: { direction: 'gentler' | 'firmer'; text: string }
}

/** Each closed week's q_w, oldest first, judged by the current Charter (A-124). */
export function closedWeekScores(state: CampaignState): number[] {
  const settled = state.settledThrough.day
  if (settled < state.campaign.startDate) return []
  const days = snapshotsBetween(state.settlement.snapshots, state.campaign.startDate, settled).map(toDayRecord)
  const closes = new Set(state.weight.weeks.map((w) => w.day))
  return weekScores(days, termsOf(state.charter, state.weight.healerFloor), state.campaign.weekStartsOn)
    .filter((w) => closes.has(addDays(w.weekStart, RULES.clock.daysPerWeek - 1)))
    .map((w) => w.score)
}

/** The Contract page; `ledger` adds today's figures so far to the running contract's progress. */
export function contractPageView(state: CampaignState, today: ISODate = openDayOf(state), ledger?: Ledger): ContractPageView {
  const { queued } = state.contracts
  const counsel = stewardSuggestion(closedWeekScores(state))
  return {
    lengths: lengthOptions(state),
    charter: {
      ...state.charter,
      duties: [...state.charter.duties],
      floor: state.weight.healerFloor ?? 0,
      locked: charterLocked(state, today),
      medicalSupervision: state.campaign.medicalSupervision === true
    },
    sealStartDays: startDays(state.contracts, today),
    canSeal: sealRefusal(state.contracts, today) === null,
    running: runningView(state, today, ledger),
    ...(queued ? { queued: summary(queued) } : {}),
    respiteBank: state.contracts.respiteBank,
    ...(counsel ? { steward: { direction: counsel.direction, text: t(counsel.textId, counsel.facts) } } : {})
  }
}

// ── The Archive ──────────────────────────────────────────────────────────────

export interface ArchiveCard extends ContractSummary {
  score?: number
  payout?: number
  pledgeReturn?: number
  /** The pledge's result: what came back less what was pledged. */
  pledgeResult?: number
}

/** The campaign's contracts for the Archive, newest first: length, Q, payout and the pledge's result. */
export function archiveCards(state: CampaignState): ArchiveCard[] {
  const all = [...state.contracts.history, ...(state.contracts.active ? [state.contracts.active] : []), ...(state.contracts.queued ? [state.contracts.queued] : [])]
  return all
    .map((c) => ({
      ...summary(c),
      ...(c.score !== undefined ? { score: c.score } : {}),
      ...(c.paid ? { payout: c.paid.payout, pledgeReturn: c.paid.pledgeReturn, pledgeResult: roundPosting(c.paid.pledgeReturn - c.pledge) } : {})
    }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
}
