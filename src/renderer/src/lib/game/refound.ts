/**
 * The re-founding (R-20, R-21, R-22, D-21): a campaign founded on the new map as of the journey's
 * real start, with every day since settled, the whole war included.
 *
 * - **As of** the first legacy contract's start in the ledger (2026-09-30 for the owner), or else the
 *   start of the campaign it replaces. Campaign weeks count from that day (R-22).
 * - **The player's real contracts** (P2-10): each legacy ledger contract on or after that day,
 *   re-sealed on its own terms with no wager (R-20), and the replaced campaign's own contracts
 *   re-sealed as they were, pledges and Respite included (C-14: their unlock and slot checks are
 *   skipped, since they happened). Each joins the contract slot on its first day.
 * - **The terms of the time** (P2-11): days no contract covers are judged by the last legacy
 *   contract's terms until the replaced campaign began (C-12), then by that campaign's Charter
 *   (`charterHistory`). A day with no sworn duty pays no duty income and leaves the duty pillar
 *   out of its scores (C-11).
 * - **The catch-up player** (P2-09): each day the automatic player makes that day's decisions from
 *   the founding answers (`autoplay`, with no contracts of its own), then the day settles exactly as
 *   any other: rivals, threats, Grand Battles and events, seeded and settled once. The player is
 *   counted present throughout (R-21: the absence rule doesn't apply; C-13).
 *
 * Pure: the same inputs and `now` always give the same campaign. Nothing reads or writes a file;
 * the ledger is only read.
 */
import type { Contract, Ledger } from '../types'
import { autoplay, type AutoplayPlan } from './autoplay'
import { foundCampaign, type FoundingInput } from './campaign'
import { addDays, dayCloseInstant, diffDays, openDay, weekOf } from './clock'
import { pathRank, pathTotals } from './dominion'
import { PURSE_GAINS, balance, post, roundPosting, sourceKind } from './economy'
import { isClaimableKind } from './map'
import { RULES, contractLengths } from './rules'
import { settle } from './settle'
import { isPlayable } from './state'
import { weeklyWeighIns } from './weight'
import { BUILDING_IDS, RIVAL_IDS, type BuildingId, type CampaignState, type Charter, type CharterSpan, type ContractTerm, type GameEvent, type ISODate, type LandContract, type RivalId } from './types'

/** The four founding questions (P2-08). */
export interface RefoundAnswers {
  /** The rivals whose paths the first weeks followed, shared evenly: 1 to 4. */
  paths: RivalId[]
  spend: AutoplayPlan['spend']
  land: AutoplayPlan['land']
  offers: AutoplayPlan['offers']
}

export interface RefoundInput extends Omit<FoundingInput, 'asOf'> {
  answers: RefoundAnswers
  /** The campaign being replaced, if any: its contracts and Charter carry over. */
  old?: CampaignState | null
}

export interface RefoundSummary {
  asOf: ISODate
  /** Days settled in the catch-up. */
  days: number
  /** Claimable hexes held, and by march (the heartland as `heartland`). */
  held: { total: number; byMarch: Record<string, number> }
  paths: Record<RivalId, { dominion: number; rank: number }>
  /** The purse now, and what paid into it by kind (Ch 15 invariant 4), and what was spent. */
  purse: { balance: number; behavior: number; battle: number; land: number; other: number; spent: number }
  tiers: Record<BuildingId, number>
  castleTier: number
  battles: { won: number; lost: number; grand: number }
  /** The real contracts re-sealed, and what each paid. */
  contracts: { id: string; startDate: ISODate; endDate: ISODate; payout?: number; pledgeReturn?: number }[]
}

export interface RefoundResult {
  state: CampaignState
  events: GameEvent[]
  summary: RefoundSummary
}

/** A campaign founded under an older major rules version: it can't be settled on the new map, only re-founded (section 7.1). */
export function needsRefounding(state: { campaign: { ruleVersion: string } }): boolean {
  const major = (v: string): number => Number.parseInt(v.split('.')[0], 10) // rules-ok: decimal radix
  return !(major(state.campaign.ruleVersion) >= major(RULES.ruleVersion))
}

/**
 * The wizard's starting answers (C-16): the replaced campaign's journey, Charter, week start and
 * time zone, and as the start weight the ledger's weekly reading for the founding week (D-13),
 * else the last one before it, else the old campaign's. All of them can be edited.
 */
export function refoundDefaults(ledger: Ledger, old: CampaignState | null | undefined): { asOf?: ISODate; startWeight?: number } & Partial<Omit<FoundingInput, 'ledger' | 'startWeight' | 'asOf'>> {
  const asOf = refoundAsOf(ledger, old)
  const weekStartsOn = old?.campaign.weekStartsOn ?? ledger.settings.weekStartsOn
  const readings = Object.entries(ledger.days)
    .filter(([, d]) => d.weight !== undefined)
    .map(([date, d]) => ({ date, weight: d.weight as number }))
  const weekly = weeklyWeighIns(readings, weekStartsOn)
  const week = asOf ? weekOf(asOf, weekStartsOn) : undefined
  const start = (week ? weekly.find((w) => weekOf(w.date, weekStartsOn) === week) : undefined) ?? (asOf ? weekly.filter((w) => w.date < asOf).at(-1) : undefined)
  const c = old?.campaign
  return {
    ...(asOf ? { asOf } : {}),
    ...(start ? { startWeight: start.weight } : c ? { startWeight: c.startWeight } : {}),
    ...(c
      ? {
          goalWeight: c.goalWeight,
          targetPace: c.targetPace,
          timeZone: c.timeZone,
          weekStartsOn: c.weekStartsOn,
          ...(c.heightCm !== undefined ? { heightCm: c.heightCm } : {}),
          ...(c.sex !== undefined ? { sex: c.sex } : {}),
          ...(c.birthYear !== undefined ? { birthYear: c.birthYear } : {}),
          ...(c.medicalSupervision ? { medicalSupervision: true } : {})
        }
      : {}),
    ...(old ? { charter: { stepPool: old.charter.stepPool, calorieLimit: old.charter.calorieLimit, duties: [...old.charter.duties] } } : {})
  }
}

/** The day the re-founded campaign starts: the first legacy contract's start, or the replaced campaign's. */
export function refoundAsOf(ledger: Ledger, old?: CampaignState | null): ISODate | undefined {
  const legacy = ledger.contracts.map((c) => c.startDate).sort()[0]
  return legacy ?? old?.campaign.startDate
}

/** A legacy contract's terms as a Charter (P2-11): its daily step goal × 7, its limit, its duties. */
function legacyCharter(c: Contract, fallback: Charter): Charter {
  return {
    stepPool: c.stepsGoal * RULES.clock.daysPerWeek,
    // A burn goal isn't a limit to eat under: the new Charter's limit judges the Table then.
    calorieLimit: c.calorieRule === 'limit' ? c.caloriesGoal : fallback.calorieLimit,
    ...(fallback.calorieFloor !== undefined ? { calorieFloor: fallback.calorieFloor } : {}),
    duties: (c.duties ?? []).map((d) => d.name)
  }
}

/** The contract length a legacy contract counts as: its own, or the longest standard length within it. */
function termOf(days: number): ContractTerm {
  const lengths = contractLengths()
  return (lengths.includes(days) ? days : Math.max(...lengths.filter((l) => l <= days), lengths[0])) as ContractTerm
}

/** The real contracts to re-seal, oldest first (P2-10): legacy ones without wagers, the old campaign's as they were. */
function realContracts(ledger: Ledger, old: CampaignState | null | undefined, asOf: ISODate, fallback: Charter): LandContract[] {
  const legacy: LandContract[] = ledger.contracts
    .filter((c) => c.startDate >= asOf && !c.burnedAt && !c.burnedOn)
    .map((c) => ({
      id: `legacy:${c.id}`,
      termDays: termOf(diffDays(c.startDate, c.endDate) + 1),
      kind: 'standard',
      pledge: 0,
      charter: legacyCharter(c, fallback),
      startDate: c.startDate,
      endDate: c.endDate,
      respiteDays: 0,
      status: 'queued',
      respiteDates: []
    }))
  const own = old ? [...old.contracts.history, ...(old.contracts.active ? [old.contracts.active] : []), ...(old.contracts.queued ? [old.contracts.queued] : [])] : []
  const carried: LandContract[] = own
    .filter((c) => c.status !== 'withdrawn' && c.kind === 'standard' && c.startDate >= asOf)
    .map((c) => {
      const out: LandContract = { ...c, status: 'queued', respiteDates: [...c.respiteDates] }
      delete out.paid
      delete out.score
      return out
    })
  return [...legacy, ...carried].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** The terms of the time (P2-11, C-12): the last legacy terms until the old campaign began, then its Charter. */
function termsOfTheTime(ledger: Ledger, old: CampaignState | null | undefined, asOf: ISODate, today: ISODate, fallback: Charter): CharterSpan[] {
  const spans: CharterSpan[] = []
  const lastLegacy = [...ledger.contracts].filter((c) => c.startDate >= asOf).sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1)
  const oldStart = old && old.campaign.startDate > asOf ? old.campaign.startDate : undefined
  const legacyUntil = addDays(oldStart ?? today, -1)
  if (lastLegacy && asOf <= legacyUntil) spans.push({ from: asOf, until: legacyUntil, charter: legacyCharter(lastLegacy, fallback) })
  if (old && (oldStart ?? asOf) <= addDays(today, -1)) spans.push({ from: oldStart ?? asOf, until: addDays(today, -1), charter: old.charter })
  return spans
}

/** Puts a real contract into the slot on its first day: running if the slot is free, else queued behind it. */
function joinContract(state: CampaignState, contract: LandContract, day: ISODate): CampaignState | null {
  const { active, queued } = state.contracts
  if (active && queued) return null
  const pledged = contract.pledge > 0 ? Math.min(contract.pledge, Math.max(0, balance(state.purse))) : 0
  const joined: LandContract = { ...contract, pledge: pledged, status: active ? 'queued' : 'active' }
  const purse = pledged > 0 ? post(state.purse, { date: day, kind: 'pledge', amount: pledged, source: `contract:${contract.id}` }) : state.purse
  const contracts = active ? { ...state.contracts, queued: joined } : { ...state.contracts, active: joined }
  return { ...state, contracts, purse }
}

/**
 * Re-founds the campaign at `now` (D-21): founded as of `refoundAsOf`, the real contracts and the
 * terms of the time carried over, and every closed day since played by the catch-up player and
 * settled. Throws a CampaignError for what founding refuses.
 */
export function refound(input: RefoundInput, now: Date): RefoundResult {
  const { ledger, old, answers } = input
  const asOf = refoundAsOf(ledger, old) ?? openDay(now, input.timeZone)
  const { answers: _a, old: _o, ...founding } = input
  let state = foundCampaign({ ...founding, asOf }, now)
  const today = openDay(now, state.campaign.timeZone)
  state = { ...state, charterHistory: termsOfTheTime(ledger, old, asOf, today, state.charter) }
  const pending = realContracts(ledger, old, asOf, state.charter)
  const plan: AutoplayPlan = { paths: answers.paths, spend: answers.spend, land: answers.land, offers: answers.offers, contracts: 'none' }
  let n = 0
  const day = { rough: false, nextId: (): string => `refound-${(n += 1)}` }
  const events: GameEvent[] = []
  let days = 0
  for (let d = asOf; d < today; d = addDays(d, 1)) {
    while (pending.length > 0 && pending[0].startDate <= d) {
      const joined = joinContract(state, pending[0], d)
      if (!joined) break
      state = joined
      pending.shift()
    }
    state = autoplay(state, d, plan, day)
    // At the instant the day closes, it is the last closed day.
    const settled = settle(state, ledger, dayCloseInstant(d, state.campaign.timeZone))
    events.push(...settled.events)
    state = settled.state
    days++
    if (!isPlayable(state)) break
  }
  // A contract sealed for today or a day to come waits in the slot, as it did; its pledge is posted today.
  for (const contract of pending) {
    const joined = joinContract(state, contract, today)
    if (joined) state = joined
  }
  // The open day: its dawn, and today recorded as a launch.
  const opened = settle(state, ledger, now, { launch: true })
  events.push(...opened.events)
  state = opened.state
  return { state, events, summary: summarize(state, asOf, days) }
}

function summarize(state: CampaignState, asOf: ISODate, days: number): RefoundSummary {
  const byMarch: Record<string, number> = {}
  let total = 0
  for (const h of state.hexes) {
    if (h.owner !== 'player' || !isClaimableKind(h)) continue
    total++
    const k = h.march ?? 'heartland'
    byMarch[k] = (byMarch[k] ?? 0) + 1
  }
  const totals = pathTotals(state)
  const paths = Object.fromEntries(RIVAL_IDS.map((r) => [r, { dominion: totals[r], rank: pathRank(state, r) }])) as RefoundSummary['paths']
  const purse = { balance: balance(state.purse), behavior: 0, battle: 0, land: 0, other: 0, spent: 0 }
  for (const p of state.purse.events) {
    if (p.amount > 0 && PURSE_GAINS.has(p.kind)) purse[sourceKind(p.source) ?? 'other'] += p.amount
    else if (p.kind === 'spend') purse.spent -= p.amount
  }
  for (const k of ['balance', 'behavior', 'battle', 'land', 'other', 'spent'] as const) purse[k] = roundPosting(purse[k])
  const battles = { won: 0, lost: 0, grand: 0 }
  for (const e of state.log) {
    if (e.kind === 'defense') battles[e.outcome === 'defeat' ? 'lost' : 'won']++
    else if (e.kind === 'assault' && e.outcome !== 'revealed') battles[e.outcome === 'repulsed' ? 'lost' : 'won']++
    else if (e.kind === 'grandBattle' && e.stage === 'fought') battles.grand++
  }
  const all = [...state.contracts.history, ...(state.contracts.active ? [state.contracts.active] : []), ...(state.contracts.queued ? [state.contracts.queued] : [])]
  return {
    asOf,
    days,
    held: { total, byMarch },
    paths,
    purse,
    tiers: Object.fromEntries(BUILDING_IDS.map((b) => [b, state.buildings[b]])) as Record<BuildingId, number>,
    castleTier: state.castleTier,
    battles,
    contracts: all.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, ...(c.paid ? { payout: c.paid.payout, pledgeReturn: c.paid.pledgeReturn } : {}) }))
  }
}
