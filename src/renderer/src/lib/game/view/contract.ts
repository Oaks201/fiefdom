/**
 * View models for the Contract page and the Archive's campaign cards (T14, Ch 4, D-01): the
 * lengths with their exact unlock requirements, the pledge cap, payout previews, the running
 * contract's live score and projection, withdrawal, the Respite bank and the Steward's Counsel.
 * Pure; components only render these.
 */
import { addDays, diffDays } from '../clock'
import { charterLocked, withdrawalPreview, type WithdrawalPreview } from '../contractActions'
import { contractPayout, payoutCurve, pledgeCap, pledgeReturn, stewardSuggestion, accordRespectGain } from '../contracts'
import { balance, roundPosting, withBonus } from '../economy'
import { realmEffects } from '../effects'
import { snapshotsBetween, toDayRecord } from '../ledgerDays'
import { RULES } from '../rules'
import { termsOf, weekPillars, weekScores } from '../score'
import { contractScore } from '../settle'
import { openDayOf } from '../state'
import { t } from '../text'
import type { CampaignState, Charter, ContractTerm, ISODate, LandContract, Pillars, RivalId } from '../types'

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] // rules-ok: numerals for display

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
  const numeral = ROMAN[unlock.tier - 1]
  return unlock.kind === 'castleTier'
    ? { kind: 'castleTier', tier: unlock.tier, label: `Castle Tier ${numeral}` }
    : { kind: 'anyBuildingTier', tier: unlock.tier, label: `a building at Tier ${numeral}` }
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

export interface RunningView {
  contract: ContractSummary
  /** It has begun (its first dawn has come). */
  started: boolean
  /** Today's day of the contract, 1-based (0 before it starts), and how many it has, Respite included. */
  dayNumber: number
  totalDays: number
  /** Q over its settled days so far, its three pillars, and how many days that is. */
  score: number
  pillars: Pillars
  settledDays: number
  /** What it pays at today's Q: the payout before and with the reputation bonus, and the pledge's return. */
  projected: { payout: number; payoutWithBonus: number; pledgeReturn: number }
  withdrawal: WithdrawalPreview
  respite: { bank: number; days: RespiteDay[] }
  /** An Accord: its rival, the Respect at its seal, and the Respect it would add at today's Q (D-01). */
  accord?: { rival: RivalId; respectAtStart: number; projectedGain: number }
}

/** A contract's projected payout at score `q`, before the reputation bonus: 10 × days × L × f(Q). */
export function projectedPayout(termDays: number, q: number): number {
  return roundPosting(contractPayout(termDays, q))
}

/** The running contract as the Contract page shows it, or null with none. */
export function runningView(state: CampaignState, today: ISODate = openDayOf(state)): RunningView | null {
  const c = state.contracts.active
  if (!c) return null
  const ws = state.campaign.weekStartsOn
  const effects = realmEffects(state)
  const last = state.settledThrough.day < c.endDate ? state.settledThrough.day : c.endDate
  const settled = c.startDate <= last ? snapshotsBetween(state.settlement.snapshots, c.startDate, last).map(toDayRecord).filter((d) => !c.respiteDates.includes(d.date)) : []
  const score = settled.length > 0 ? contractScore(state, c, today, ws) : 0
  const pillars = settled.length > 0 ? weekPillars(settled, termsOf(c.charter)) : { steps: 0, table: 0, duties: 0 }
  const started = c.startDate <= today
  const respiteDay = (day: ISODate): RespiteDay => {
    if (state.contracts.respiteBank < 1) return { day, allowed: false, reason: 'No Respite days are banked.' }
    if (day < c.startDate || day > c.endDate) return { day, allowed: false, reason: 'The contract does not cover this day.' }
    if (c.respiteDates.includes(day)) return { day, allowed: false, reason: 'Already a Respite day.' }
    return { day, allowed: true }
  }
  return {
    contract: summary(c),
    started,
    dayNumber: started ? Math.min(diffDays(c.startDate, today) + 1, c.termDays + c.respiteDays) : 0,
    totalDays: c.termDays + c.respiteDays,
    score,
    pillars,
    settledDays: settled.length,
    projected: {
      payout: projectedPayout(c.termDays, score),
      payoutWithBonus: roundPosting(withBonus(contractPayout(c.termDays, score), effects.reputationBonus.value)),
      pledgeReturn: roundPosting(pledgeReturn(c.pledge, score, effects.minPledgeReturn.value))
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
  /** A contract sealed today starts on this day (the next dawn, or the day after the running one ends). */
  sealStartsOn: ISODate
  /** Another can be sealed: none is queued behind a running one. */
  canSeal: boolean
  running: RunningView | null
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

export function contractPageView(state: CampaignState, today: ISODate = openDayOf(state)): ContractPageView {
  const { active, queued } = state.contracts
  const nextDawn = addDays(today, 1)
  const afterActive = active ? addDays(active.endDate, 1) : nextDawn
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
    sealStartsOn: afterActive > nextDawn ? afterActive : nextDawn,
    canSeal: !(active && queued),
    running: runningView(state, today),
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
