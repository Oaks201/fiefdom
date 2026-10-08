/**
 * The player's contract actions on the whole campaign (Ch 4, T14 gap 1): seal, withdraw, take a
 * Respite day, and revise the Charter between contracts. Each builds the context `contracts.ts`
 * needs from the state (the lengths unlocked, `realmEffects`, the Healer floor, medical
 * supervision, the running contract's score), posts its result to the log, and returns
 * `{ ok, reason?, state }` with the refusal's message ready to show. Screens and the simulator
 * both use these, so neither builds the context itself.
 */
import { contractScore } from './settle'
import { scoredDays, seal, spendRespite, validateCharter, withdraw, withdrawalPayout, withdrawalPledgeReturn, type SealContext } from './contracts'
import { realmEffects } from './effects'
import { roundPosting, withBonus } from './economy'
import { CampaignError } from './errors'
import { EventBuffer, isPlayable, openDayOf } from './state'
import type { CampaignState, Charter, ISODate, LandContract, RivalId } from './types'

export interface ContractAction {
  ok: boolean
  /** The refusal, worded for the player. */
  reason?: string
  state: CampaignState
  /** The contract sealed, withdrawn or changed. */
  contract?: LandContract
}

function refused(state: CampaignState, reason: string): ContractAction {
  return { ok: false, reason, state }
}

/** Runs a slice-level contract step, turning a CampaignError into a refusal. */
function attempt(state: CampaignState, step: () => ContractAction): ContractAction {
  if (!isPlayable(state)) return refused(state, 'The campaign is over.')
  try {
    return step()
  } catch (e) {
    if (e instanceof CampaignError) return refused(state, e.message)
    throw e
  }
}

/** What sealing reads from the realm on `today`: lengths unlocked, the pledge cap, the Healer floor and medical supervision. */
export function sealContextOf(state: CampaignState, today: ISODate = openDayOf(state)): SealContext {
  return {
    today,
    buildings: state.buildings,
    castleTier: state.castleTier,
    pledgeCapMult: realmEffects(state).pledgeCap.value,
    floor: state.weight.healerFloor ?? 0,
    ...(state.campaign.medicalSupervision ? { medicalSupervision: true } : {})
  }
}

export interface SealOrder {
  id: string
  termDays: number
  pledge?: number
  /** Defaults to the campaign's Charter. */
  charter?: Charter
  /** An Accord (D-01): seal it through `sealAccord` in world.ts, which checks the Accord's own rules first. */
  kind?: LandContract['kind']
  rival?: RivalId
}

/**
 * Seals a contract on `today` (Ch 4): it starts at the next dawn, or is queued after the running
 * one. An Accord records its rival's Respect now, for D-01's 60 × f(Q) at Respect 75.
 */
export function sealContract(state: CampaignState, order: SealOrder, today: ISODate = openDayOf(state)): ContractAction {
  return attempt(state, () => {
    const sealed = seal(
      state.contracts,
      state.purse,
      { id: order.id, termDays: order.termDays, charter: order.charter ?? state.charter, pledge: order.pledge ?? 0, kind: order.kind ?? 'standard', ...(order.rival ? { rival: order.rival } : {}) },
      sealContextOf(state, today)
    )
    let contract = sealed.contract
    let contracts = sealed.contracts
    if (contract.kind === 'accord' && contract.rival) {
      contract = { ...contract, respectAtStart: state.rivals[contract.rival].respect }
      contracts = contracts.active?.id === contract.id ? { ...contracts, active: contract } : { ...contracts, queued: contract }
    }
    const events = new EventBuffer()
    events.emitter(today)('contractSealed', {
      contractId: contract.id,
      contractKind: contract.kind,
      termDays: contract.termDays,
      pledge: contract.pledge,
      startDate: contract.startDate,
      endDate: contract.endDate,
      ...(contract.rival ? { rival: contract.rival } : {})
    })
    return { ok: true, contract, state: events.flush({ ...state, contracts, purse: sealed.purse }) }
  })
}

export interface WithdrawalPreview {
  contractId: string
  /** Q over the contract's settled days so far, without its Respite days. */
  score: number
  /** Its days from the start through `today`, less Respite days (A-114). */
  daysElapsed: number
  /** What withdrawing today pays (with the reputation bonus) and returns of the pledge, as posted. */
  payout: number
  pledgeReturn: number
}

/** Exactly what withdrawing the running contract on `today` would pay and return, or null with none running. */
export function withdrawalPreview(state: CampaignState, today: ISODate = openDayOf(state)): WithdrawalPreview | null {
  const active = state.contracts.active
  if (!active) return null
  const score = contractScore(state, active, today, state.campaign.weekStartsOn)
  const ended = { ...active, endDate: today < active.endDate ? today : active.endDate }
  const daysElapsed = scoredDays(ended, ended.endDate)
  const bonus = realmEffects(state).reputationBonus.value
  return {
    contractId: active.id,
    score,
    daysElapsed,
    payout: roundPosting(withBonus(withdrawalPayout(daysElapsed, score), bonus)),
    pledgeReturn: roundPosting(withdrawalPledgeReturn(active.pledge))
  }
}

/** Withdraws the running contract on `today` (Ch 4): it pays what `withdrawalPreview` shows; a queued one starts at the next dawn. */
export function withdrawContract(state: CampaignState, today: ISODate = openDayOf(state)): ContractAction {
  return attempt(state, () => {
    const active = state.contracts.active
    if (!active) return refused(state, 'No contract is running.')
    const preview = withdrawalPreview(state, today) as WithdrawalPreview
    const effects = realmEffects(state)
    const done = withdraw(state.contracts, state.purse, preview.score, { date: today, minPledgeReturn: effects.minPledgeReturn.value, bonus: effects.reputationBonus.value })
    const events = new EventBuffer()
    events.emitter(today)('contract', done.outcome)
    const contract = done.contracts.history.find((c) => c.id === active.id)
    return { ok: true, ...(contract ? { contract } : {}), state: events.flush({ ...state, contracts: done.contracts, purse: done.purse }) }
  })
}

/** Spends a banked Respite day on `day`, today or yesterday, inside the running contract: the contract ends a day later. */
export function takeRespite(state: CampaignState, day: ISODate, today: ISODate = openDayOf(state)): ContractAction {
  return attempt(state, () => {
    const contracts = spendRespite(state.contracts, day, today)
    const contract = contracts.active as LandContract
    const events = new EventBuffer()
    events.emitter(today)('respite', { contractId: contract.id, day, endDate: contract.endDate })
    return { ok: true, contract, state: events.flush({ ...state, contracts }) }
  })
}

/** Whether the Charter may be revised on `today`: only between contracts, never while one runs (Ch 4). */
export function charterLocked(state: CampaignState, today: ISODate = openDayOf(state)): boolean {
  const active = state.contracts.active
  return active !== undefined && active.startDate <= today
}

/** Revises the campaign's Charter between contracts, checked against the Healer's floor (or medical supervision). */
export function reviseCharter(state: CampaignState, charter: Charter, today: ISODate = openDayOf(state)): ContractAction {
  return attempt(state, () => {
    if (charterLocked(state, today)) return refused(state, 'The Charter can be revised only between contracts.')
    const floor = state.weight.healerFloor ?? 0
    const errors = validateCharter(charter, { floor, ...(state.campaign.medicalSupervision ? { medicalSupervision: true } : {}) })
    if (errors.length > 0) return refused(state, errors.join(' '))
    const next: Charter = { stepPool: charter.stepPool, calorieLimit: charter.calorieLimit, duties: [...charter.duties], calorieFloor: floor }
    const events = new EventBuffer()
    events.emitter(today)('charter', { stepPool: next.stepPool, calorieLimit: next.calorieLimit, duties: [...next.duties] })
    return { ok: true, state: events.flush({ ...state, charter: next }) }
  })
}
