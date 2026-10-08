/**
 * Turning reputation into power (Ch 5 "Where reputation goes", Ch 7, Ch 8, A-31, A-42):
 * building tiers, castle tiers and Crossing stages.
 *
 * Each purchase has an offer (`tierOffer`, `castleOffer`, `crossingOffer`) that says what the
 * next step costs and why it is refused, for the UI, and a buy (`buyTier`, `buyCastleTier`,
 * `buyCrossing`) that checks the same offer, posts a `spend` event and refreshes the stored
 * roster. Refusals are codes with plain facts; screens word them.
 *
 * Tiers are never lost. If Dominion falls below a tier's threshold the tier stays; only the next
 * purchase waits. Castle V is never bought: T13 sets it when every rival is resolved.
 */
import { CODEX } from './codex'
import { balance, roundPosting, spend } from './economy'
import { milestoneBroken, realmEffects } from './effects'
import { dominion, rivalOfRoad } from './map'
import { refreshRoster } from './roster'
import { isPlayable } from './state'
import { RULES, byTier } from './rules'
import { BUILDING_IDS, type BuildingId, type BuildingTier, type CampaignState, type CastleTier, type CrossingId, type CrossingStage, type ISODate, type RivalId } from './types'

export type Refusal =
  | { code: 'campaignOver' }
  /** Already at the top: Tier V, Castle IV (Castle V is never bought) or Crossing stage III. */
  | { code: 'maxed' }
  | { code: 'dominion'; needed: number; have: number }
  | { code: 'reputation'; needed: number; have: number }
  /** Tier V needs the building's own rival resolved (Ch 7). */
  | { code: 'rivalUnresolved'; rival: RivalId }
  /** Tier V needs Milestone 6 (A-42). */
  | { code: 'milestone'; index: number }
  /** The castle needs the building tiers to sum this high. */
  | { code: 'tierSum'; needed: number; have: number }
  /** A Crossing stage needs both of its buildings at a tier. */
  | { code: 'buildingTier'; building: BuildingId; needed: number; have: number }

/** One requirement of the next step, met or not; `need` names it with its facts, as a refusal would. */
export interface Requirement {
  need: Refusal
  met: boolean
}

/** What the next step would cost and whether it can be bought now. `next` is the tier or stage it reaches. */
export interface Offer {
  ok: boolean
  reason?: Refusal
  next: number
  /** The price after discounts, as it would post (0.1 precision). 0 when maxed. */
  cost: number
  /** Every requirement of the next step in the order they are checked, reputation last (absent when maxed). */
  requirements?: Requirement[]
}

export interface Purchase {
  ok: boolean
  reason?: Refusal
  /** The state after the purchase, or the same state when refused. */
  state: CampaignState
  cost: number
}

const TOP_TIER = RULES.buildings.pureCompanyPower.length
const TOP_BOUGHT_CASTLE = RULES.castle.tierCost.length
const TOP_STAGE = RULES.crossings.stageCost.length

function refuse(reason: Refusal, next: number, cost = 0): Offer {
  return { ok: false, reason, next, cost }
}

/** The first unmet requirement, or an open offer. Reputation is checked last, after the requirements. */
function checked(state: CampaignState, next: number, cost: number, requirements: Requirement[]): Offer {
  const have = balance(state.purse)
  const all: Requirement[] = [...requirements, { need: { code: 'reputation', needed: cost, have }, met: have >= cost }]
  if (!isPlayable(state)) return { ...refuse({ code: 'campaignOver' }, next, cost), requirements: all }
  const failed = all.find((r) => !r.met)
  if (failed) return { ...refuse(failed.need, next, cost), requirements: all }
  return { ok: true, next, cost, requirements: all }
}

// ── Building tiers ───────────────────────────────────────────────────────────

export function tierOffer(state: CampaignState, building: BuildingId): Offer {
  const tier = state.buildings[building]
  if (tier >= TOP_TIER) return refuse({ code: 'maxed' }, tier)
  const next = tier + 1
  const cost = roundPosting(byTier(RULES.buildings.tierCost, next) * realmEffects(state).costs.tiers.value)
  const needed = byTier(RULES.buildings.tierDominion, next)
  const have = dominion(state.hexes, 'player')[building]
  const rival = rivalOfRoad(building)
  const tierV = RULES.milestones.unlocks.tierV
  return checked(state, next, cost, [
    { need: { code: 'dominion', needed, have }, met: have >= needed },
    ...(next === TOP_TIER
      ? [
          { need: { code: 'rivalUnresolved', rival } as const, met: state.rivals[rival].status !== 'active' },
          { need: { code: 'milestone', index: tierV } as const, met: milestoneBroken(state, tierV) }
        ]
      : [])
  ])
}

function bought(state: CampaignState, offer: Offer, today: ISODate, source: string, change: (s: CampaignState) => CampaignState): Purchase {
  if (!offer.ok) return { ok: false, ...(offer.reason ? { reason: offer.reason } : {}), state, cost: offer.cost }
  const paid = { ...state, purse: spend(state.purse, today, offer.cost, source) }
  return { ok: true, state: refreshRoster(change(paid)), cost: offer.cost }
}

/** Raises `building` one tier, paying its cost from the purse. */
export function buyTier(state: CampaignState, building: BuildingId, today: ISODate): Purchase {
  const offer = tierOffer(state, building)
  return bought(state, offer, today, `tier:${building}:${offer.next}`, (s) => ({
    ...s,
    buildings: { ...s.buildings, [building]: offer.next as BuildingTier }
  }))
}

// ── The castle ───────────────────────────────────────────────────────────────

/** The sum of the four building tiers (Ch 7 castle requirement). */
export function tierSum(state: CampaignState): number {
  return BUILDING_IDS.reduce((t, id) => t + state.buildings[id], 0)
}

/** The next castle tier, II to IV. Castle discounts don't apply (A-127). */
export function castleOffer(state: CampaignState): Offer {
  const tier = state.castleTier
  if (tier >= TOP_BOUGHT_CASTLE) return refuse({ code: 'maxed' }, tier)
  const next = tier + 1
  const needed = byTier(RULES.castle.tierSum, next)
  const have = tierSum(state)
  return checked(state, next, byTier(RULES.castle.tierCost, next), [{ need: { code: 'tierSum', needed, have }, met: have >= needed }])
}

/** Raises the castle one tier (to IV at most). */
export function buyCastleTier(state: CampaignState, today: ISODate): Purchase {
  const offer = castleOffer(state)
  return bought(state, offer, today, `castle:${offer.next}`, (s) => ({ ...s, castleTier: offer.next as CastleTier }))
}

// ── Crossings ────────────────────────────────────────────────────────────────

export function crossingOffer(state: CampaignState, pair: CrossingId): Offer {
  const crossing = CODEX.crossings.find((x) => x.id === pair)
  if (!crossing) throw new Error(`No Crossing ${pair}`)
  const stage = state.crossings[pair] ?? 0
  if (stage >= TOP_STAGE) return refuse({ code: 'maxed' }, stage)
  const next = stage + 1
  const cost = roundPosting(byTier(RULES.crossings.stageCost, next) * realmEffects(state).costs.crossings.value)
  const needed = byTier(RULES.crossings.stageBuildingTier, next)
  return checked(
    state,
    next,
    cost,
    crossing.buildings.map((b) => ({ need: { code: 'buildingTier', building: b, needed, have: state.buildings[b] }, met: state.buildings[b] >= needed }))
  )
}

/** Raises a Crossing one stage: I needs both buildings at Tier II, II at III, III at IV. */
export function buyCrossing(state: CampaignState, pair: CrossingId, today: ISODate): Purchase {
  const offer = crossingOffer(state, pair)
  return bought(state, offer, today, `crossing:${pair}:${offer.next}`, (s) => ({
    ...s,
    crossings: { ...s.crossings, [pair]: offer.next as CrossingStage }
  }))
}
