/**
 * Campaign contracts (Ch 4): lengths and unlocks, sealing with an optional pledge, the payout
 * curve, withdrawal, Respite, late corrections, the Accord (D-01), Charter validation and the
 * Steward's Counsel.
 *
 * The legacy weekly contracts in `lib/contracts.ts` stay as they are; this is the campaign's own.
 * Every function is pure: it takes the contracts and purse slices and returns new ones.
 */
import { addDays, diffDays } from './clock'
import { CampaignError } from './errors'
import { balance, post, roundPosting, withBonus } from './economy'
import { RULES, byTier, lengthMultiplier } from './rules'
import type {
  BuildingId,
  BuildingTier,
  CastleTier,
  Charter,
  ContractTerm,
  ContractsState,
  ISODate,
  LandContract,
  PurseState,
  RivalId,
  StewardSuggestion
} from './types'

// ── The curve and the payouts ────────────────────────────────────────────────

/** f(Q) = clamp((Q − 0.40) ÷ 0.60, 0, 1). */
export function payoutCurve(score: number): number {
  const { start, span } = RULES.contracts.payoutCurve
  return Math.min(1, Math.max(0, (score - start) / span))
}

/** Payout = 10 × days × L × f(Q), before the reputation bonus. */
export function contractPayout(days: number, score: number): number {
  return RULES.contracts.payoutPerDay * days * lengthMultiplier(days) * payoutCurve(score)
}

/** Pledge × 2 × f(Q); at least half the pledge back from Merchant Hall IV. */
export function pledgeReturn(pledge: number, score: number, merchantHallTier: number): number {
  const { minPledgeReturn } = RULES.buildings.merchantHall
  const floor = merchantHallTier >= minPledgeReturn.tier ? pledge * minPledgeReturn.share : 0
  return Math.max(floor, pledge * RULES.contracts.pledge.returnMultiplier * payoutCurve(score))
}

/** Withdrawal pays 10 × daysElapsed × 1.0 × f(Q), before the reputation bonus. */
export function withdrawalPayout(daysElapsed: number, score: number): number {
  const w = RULES.contracts.withdrawal
  return w.perDay * daysElapsed * w.lengthMultiplier * payoutCurve(score)
}

/** Withdrawal returns half the pledge. */
export function withdrawalPledgeReturn(pledge: number): number {
  return pledge * RULES.contracts.withdrawal.pledgeShareReturned
}

// ── Lengths and pledges ──────────────────────────────────────────────────────

/** What the contract lengths unlock by. */
export interface Progress {
  buildings: Record<BuildingId, BuildingTier>
  castleTier: CastleTier
}

/** The lengths open to the player: 1 and 3 days from the start, 7 at any building Tier II, 14 at Castle II, 30 at Castle III. */
export function availableLengths(progress: Progress): ContractTerm[] {
  const topBuilding = Math.max(...Object.values(progress.buildings))
  return RULES.contracts.lengths
    .filter(({ unlock }) => {
      if (unlock.kind === 'start') return true
      if (unlock.kind === 'anyBuildingTier') return topBuilding >= unlock.tier
      return progress.castleTier >= unlock.tier
    })
    .map((l) => l.days as ContractTerm)
}

/** The pledge cap: 10 × days, ×1.5 at Merchant Hall III, never more than the purse. */
export function pledgeCap(days: number, merchantHallTier: number, purseBalance: number): number {
  const { pledgeCap: mh } = RULES.buildings.merchantHall
  const cap = RULES.contracts.pledge.capPerDay * days * (merchantHallTier >= mh.tier ? mh.mult : 1)
  return Math.max(0, Math.min(cap, purseBalance))
}

// ── The Charter ──────────────────────────────────────────────────────────────

export interface CharterLimits {
  /** The Healer's calorie floor. */
  floor: number
  /** Confirmed medical supervision lets the limit sit below the floor (Ch 4, Ch 16). */
  medicalSupervision?: boolean
}

/** Problems with a Charter, empty when it is valid. */
export function validateCharter(charter: Charter, limits: CharterLimits): string[] {
  const rules = RULES.contracts.charter
  const errors: string[] = []
  if (!Number.isFinite(charter.stepPool) || charter.stepPool < rules.stepPool.min || charter.stepPool > rules.stepPool.max)
    errors.push(`The step pool must be ${rules.stepPool.min} to ${rules.stepPool.max} a week.`)
  const minLimit = limits.medicalSupervision ? 0 : limits.floor
  if (!Number.isFinite(charter.calorieLimit) || charter.calorieLimit <= 0 || charter.calorieLimit < minLimit || charter.calorieLimit > rules.calorieLimit.max)
    errors.push(`The calorie limit must be ${minLimit > 0 ? minLimit : 'above 0'} to ${rules.calorieLimit.max} kcal.`)
  const duties = charter.duties.filter((d) => d.trim() !== '')
  if (duties.length !== charter.duties.length) errors.push('Every duty needs a name.')
  if (charter.duties.length < rules.duties.min || charter.duties.length > rules.duties.max)
    errors.push(`Swear ${rules.duties.min} to ${rules.duties.max} duties.`)
  return errors
}

// ── Sealing ──────────────────────────────────────────────────────────────────

export interface SealRequest {
  id: string
  termDays: number
  kind?: LandContract['kind']
  /** The rival an Accord is with. */
  rival?: RivalId
  pledge?: number
  charter: Charter
}

export interface SealContext extends Progress, CharterLimits {
  /** The open campaign day; the contract starts at the next dawn. */
  today: ISODate
  merchantHallTier: number
}

/**
 * Seals a contract. It copies the Charter, starts at the next dawn (or the day after the running
 * contract ends, when it is queued) and posts the pledge. One contract runs and at most one waits.
 * The Accord (D-01) is a 30-day contract with a rival, sealed exactly like one.
 */
export function seal(
  contracts: ContractsState,
  purse: PurseState,
  req: SealRequest,
  ctx: SealContext
): { contracts: ContractsState; purse: PurseState; contract: LandContract } {
  const kind = req.kind ?? 'standard'
  if (kind === 'accord') {
    if (!req.rival) throw new CampaignError('An Accord is sealed with a rival.')
    if (req.termDays !== RULES.contracts.accord.days) throw new CampaignError(`An Accord runs ${RULES.contracts.accord.days} days.`)
  }
  if (!RULES.contracts.lengths.some((l) => l.days === req.termDays)) throw new CampaignError(`There is no ${req.termDays}-day contract.`)
  if (!availableLengths(ctx).includes(req.termDays as ContractTerm)) throw new CampaignError(`The ${req.termDays}-day contract is not unlocked yet.`)
  if (contracts.active && contracts.queued) throw new CampaignError('A contract is already queued.')
  const charterErrors = validateCharter(req.charter, ctx)
  if (charterErrors.length > 0) throw new CampaignError(charterErrors.join(' '))

  const pledge = req.pledge ?? 0
  const held = balance(purse)
  if (!Number.isFinite(pledge) || pledge < 0) throw new CampaignError('A pledge cannot be negative.')
  if (pledge > held) throw new CampaignError(`The purse holds ${held}; the pledge is ${pledge}.`)
  if (pledge > pledgeCap(req.termDays, ctx.merchantHallTier, held))
    throw new CampaignError(`A ${req.termDays}-day contract takes a pledge of at most ${pledgeCap(req.termDays, ctx.merchantHallTier, held)}.`)

  const nextDawn = addDays(ctx.today, 1)
  const afterActive = contracts.active ? addDays(contracts.active.endDate, 1) : nextDawn
  const startDate = afterActive > nextDawn ? afterActive : nextDawn
  const contract: LandContract = {
    id: req.id,
    termDays: req.termDays as ContractTerm,
    kind,
    ...(req.rival ? { rival: req.rival } : {}),
    pledge: roundPosting(pledge),
    charter: { ...req.charter, duties: [...req.charter.duties], ...(ctx.floor ? { calorieFloor: ctx.floor } : {}) },
    startDate,
    endDate: addDays(startDate, req.termDays - 1),
    respiteDays: 0,
    respiteDates: [],
    status: contracts.active ? 'queued' : 'active'
  }
  const nextPurse = pledge > 0 ? post(purse, { date: ctx.today, kind: 'pledge', amount: pledge, source: `contract:${req.id}` }) : purse
  const nextContracts = contracts.active ? { ...contracts, queued: contract } : { ...contracts, active: contract }
  return { contracts: nextContracts, purse: nextPurse, contract }
}

// ── Paying out ───────────────────────────────────────────────────────────────

export interface PayContext {
  /** The day the payment is posted. */
  date: ISODate
  merchantHallTier: number
  /** The realm's reputation bonus from effects; it applies to the payout, not the pledge's return. */
  bonus: number
}

/** What a contract pays at a score Q, rounded as posted. */
export function proceeds(contract: LandContract, score: number, ctx: Omit<PayContext, 'date'>): { payout: number; pledgeReturn: number } {
  if (contract.status === 'withdrawn') {
    return {
      payout: roundPosting(withBonus(withdrawalPayout(scoredDays(contract, contract.endDate), score), ctx.bonus)),
      pledgeReturn: roundPosting(withdrawalPledgeReturn(contract.pledge))
    }
  }
  return {
    payout: roundPosting(withBonus(contractPayout(contract.termDays, score), ctx.bonus)),
    pledgeReturn: roundPosting(pledgeReturn(contract.pledge, score, ctx.merchantHallTier))
  }
}

/** The contract's outcome, as the `contract` game event records it. */
export interface ContractOutcome {
  contractId: string
  outcome: 'paid' | 'withdrawn'
  score: number
  payout: number
  pledgeReturn: number
}

/** The hook T13 reads to add an Accord's Respect gain (D-01). */
export interface AccordPaid {
  contractId: string
  rival: RivalId
  /** f(Q) of the Accord's score. */
  curve: number
}

export interface ContractSettlement {
  contracts: ContractsState
  purse: PurseState
  outcome: ContractOutcome
  accord?: AccordPaid
}

function postProceeds(purse: PurseState, contract: LandContract, paid: { payout: number; pledgeReturn: number }, date: ISODate): PurseState {
  const source = `contract:${contract.id}`
  const withPayout = post(purse, { date, kind: 'earn', amount: paid.payout, source })
  return post(withPayout, { date, kind: 'return', amount: paid.pledgeReturn, source })
}

/** Moves the active contract to history and lets the queued one take the slot. */
function closeActive(contracts: ContractsState, closed: LandContract, queuedStart?: ISODate): ContractsState {
  const rest: ContractsState = { ...contracts, history: [...contracts.history, closed] }
  delete rest.active
  delete rest.queued
  const queued = contracts.queued
  if (!queued) return rest
  let next: LandContract = { ...queued, status: 'active' }
  if (queuedStart && queuedStart < queued.startDate) {
    const shift = diffDays(queued.startDate, queuedStart)
    next = { ...next, startDate: queuedStart, endDate: addDays(queued.endDate, shift) }
  }
  return { ...rest, active: next }
}

/**
 * Pays the running contract at its end: the payout (with the reputation bonus) and the pledge's
 * return, each rounded at posting. `score` is Q over the contract's days (`consistency` with the
 * contract's `respiteDates`). The queued contract, if any, takes the slot.
 */
export function settleContract(contracts: ContractsState, purse: PurseState, score: number, ctx: PayContext): ContractSettlement {
  const active = contracts.active
  if (!active) throw new CampaignError('No contract is running.')
  if (ctx.date < active.endDate) throw new CampaignError(`The contract runs until ${active.endDate}.`)
  const paid = proceeds({ ...active, status: 'paid' }, score, ctx)
  const closed: LandContract = { ...active, status: 'paid', score, paid }
  return {
    contracts: closeActive(contracts, closed),
    purse: postProceeds(purse, closed, paid, ctx.date),
    outcome: { contractId: active.id, outcome: 'paid', score, ...paid },
    ...(active.kind === 'accord' && active.rival ? { accord: { contractId: active.id, rival: active.rival, curve: payoutCurve(score) } } : {})
  }
}

/** The contract's days from its start through `through`, less its Respite days. */
export function scoredDays(contract: LandContract, through: ISODate): number {
  const last = through < contract.endDate ? through : contract.endDate
  const span = Math.max(0, diffDays(contract.startDate, last) + 1)
  return Math.max(0, span - contract.respiteDates.filter((d) => d >= contract.startDate && d <= last).length)
}

/**
 * Ends the running contract early on `ctx.date` (today). It pays 10 × daysElapsed × 1.0 × f(Q),
 * where daysElapsed counts its days through today less Respite days, and returns half the pledge.
 * The queued contract, if any, starts at the next dawn.
 */
export function withdraw(contracts: ContractsState, purse: PurseState, score: number, ctx: PayContext): ContractSettlement {
  const active = contracts.active
  if (!active) throw new CampaignError('No contract is running.')
  const endDate = ctx.date < active.endDate ? ctx.date : active.endDate
  const ended: LandContract = { ...active, status: 'withdrawn', endDate: endDate < active.startDate ? addDays(active.startDate, -1) : endDate, score }
  const paid = proceeds(ended, score, ctx)
  const closed: LandContract = { ...ended, paid }
  return {
    contracts: closeActive(contracts, closed, addDays(ctx.date, 1)),
    purse: postProceeds(purse, closed, paid, ctx.date),
    outcome: { contractId: active.id, outcome: 'withdrawn', score, ...paid }
  }
}

/**
 * Late data only helps (Ch 2 rule 5, A-02). Recomputes a paid or withdrawn contract at a
 * corrected score: when it would now pay more, posts an `adjust` for the difference and records
 * the new score; when it would pay the same or less, nothing changes.
 */
export function lateCorrection(
  contracts: ContractsState,
  purse: PurseState,
  contractId: string,
  score: number,
  ctx: PayContext
): { contracts: ContractsState; purse: PurseState; adjustment: number } {
  const index = contracts.history.findIndex((c) => c.id === contractId)
  const contract = contracts.history[index]
  if (!contract || !contract.paid) throw new CampaignError(`Contract ${contractId} has not been paid.`)
  const now = proceeds(contract, score, ctx)
  const adjustment = roundPosting(now.payout + now.pledgeReturn - contract.paid.payout - contract.paid.pledgeReturn)
  if (adjustment <= 0) return { contracts, purse, adjustment: 0 }
  const history = [...contracts.history]
  history[index] = { ...contract, score, paid: now }
  return {
    contracts: { ...contracts, history },
    purse: post(purse, { date: ctx.date, kind: 'adjust', amount: adjustment, source: `contract:${contract.id}` }),
    adjustment
  }
}

/** The Accord's Respect gain (D-01): 50 × f(Q), or 60 × f(Q) when Respect was 75 or more at its start. */
export function accordRespectGain(curve: number, respectAtStart: number): number {
  const a = RULES.contracts.accord
  return (respectAtStart >= a.highFromRespect ? a.respectGainPerFHigh : a.respectGainPerF) * curve
}

// ── Respite ──────────────────────────────────────────────────────────────────

/** The base Respite bank by Mage Tower tier (4, 5 at III, 6 at V), +1 with the Healing Springs. */
export function respiteBankCap(mageTowerTier: number, healingSprings: boolean): number {
  const r = RULES.respite
  return byTier(r.bankByMageTowerTier, mageTowerTier) + (healingSprings ? r.healingSpringsBonus : 0)
}

/**
 * Banks one Respite day for every 7 days played, up to `cap` (from effects). Call once per
 * settled day with the campaign's days played so far.
 */
export function earnRespite(contracts: ContractsState, daysPlayed: number, cap: number): ContractsState {
  const earned = daysPlayed > 0 && daysPlayed % RULES.respite.earnEveryDays === 0
  const bank = Math.min(cap, contracts.respiteBank + (earned ? 1 : 0))
  return bank === contracts.respiteBank ? contracts : { ...contracts, respiteBank: bank }
}

/**
 * Spends a banked Respite on `day`, which must be today or yesterday and one of the running
 * contract's days. The day leaves every pillar of the contract's score, and the contract (and
 * any queued one) ends a day later. Respite buys time, never score.
 */
export function spendRespite(contracts: ContractsState, day: ISODate, today: ISODate): ContractsState {
  const active = contracts.active
  const back = diffDays(day, today)
  if (back < 0 || back > RULES.respite.spendBackDays) throw new CampaignError('A Respite day can be spent only on today or yesterday.')
  if (contracts.respiteBank < 1) throw new CampaignError('No Respite days are banked.')
  if (!active || day < active.startDate || day > active.endDate) throw new CampaignError(`No running contract covers ${day}.`)
  if (active.respiteDates.includes(day)) throw new CampaignError(`${day} is already a Respite day.`)
  const respiteDates = [...active.respiteDates, day].sort()
  const nextActive: LandContract = { ...active, respiteDates, respiteDays: respiteDates.length, endDate: addDays(active.endDate, 1) }
  const queued = contracts.queued
  const nextQueued = queued && queued.startDate <= nextActive.endDate ? { ...queued, startDate: addDays(queued.startDate, 1), endDate: addDays(queued.endDate, 1) } : queued
  return { ...contracts, respiteBank: contracts.respiteBank - 1, active: nextActive, ...(nextQueued ? { queued: nextQueued } : {}) }
}

// ── The Steward's Counsel ────────────────────────────────────────────────────

/**
 * Gentler terms after 4 weeks averaging below 75%, firmer ones after 4 weeks above 95%
 * (Ch 4). `weeklyScores` are q_w, oldest first; only the latest 4 count. It only suggests;
 * the Charter never changes on its own.
 */
export function stewardSuggestion(weeklyScores: readonly number[]): StewardSuggestion | null {
  const c = RULES.contracts.stewardCounsel
  if (weeklyScores.length < c.weeks) return null
  const average = weeklyScores.slice(-c.weeks).reduce((sum, q) => sum + q, 0) / c.weeks
  const facts = { weeks: c.weeks, average: Math.round(average * 100) }
  if (average < c.gentlerBelow) return { direction: 'gentler', textId: 'herald.steward.gentler', facts }
  if (average > c.firmerAbove) return { direction: 'firmer', textId: 'herald.steward.firmer', facts }
  return null
}
