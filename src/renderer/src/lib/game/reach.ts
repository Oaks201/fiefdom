/**
 * Patch 7 (A2, D-56): reach, a measure that weighs the player's Valor against how deep the realm
 * reaches. At each dawn settlement fixes the realm's reach (`withReach`) from the patrol, the best
 * defense the realm fields against beasts at the Valor of the 7 days before (`patrolStrength` in
 * combat.ts). Each march's depth curve (D-17) then says how deep that patrol holds: the deepest depth
 * whose beasts strike no harder than `patrolShare` × the patrol. Rival marches share a curve and the
 * lairs share theirs, so the realm has one reach for each.
 *
 * Within reach the frontier is patrolled: beasts and mythics strike its hexes weaker. Beyond it they
 * strike harder a step at a time, and an assault there fights without supply. Depth still makes
 * everything harder (the curve is unchanged); good weeks push the reach deeper and a bad week pulls it
 * in, so the hexes at risk are the ones the realm is overextended on.
 *
 * Pure and deterministic: every number from `RULES.reach`; the reach itself is read from the state.
 */
import { pathRank } from './dominion'
import { depthOf, isLairMarch } from './map'
import { RULES } from './rules'
import { RIVAL_IDS, type CampaignState, type HexState, type ISODate, type ReachState, type RivalId } from './types'

const R = RULES.reach

/** The deepest depth whose beasts strike no harder than `patrolShare` × `patrol`, in a rival march or a lair's (D-17's curve, without the jitter). */
export function reachDepth(patrol: number, lair: boolean): number {
  const curve = lair ? RULES.land.depthCurve.lair : RULES.land.depthCurve.rival
  const atDepthOne = RULES.combat.strength.beasts * curve.first
  if (patrol <= 0) return 0
  const deepest = lair ? RULES.map.lairDepth : RULES.map.marchDepth
  return Math.max(0, Math.min(deepest, Math.floor(((R.patrolShare * patrol) / atDepthOne) ** (1 / curve.exponent))))
}

/**
 * The realm's reach at `day`'s dawn from its patrol at `valor`; one already fixed for `day` stays
 * (settle once). Each rival march reaches `perRank` deeper for every rank of the player's path on its
 * rival (D-18): the march the player has fought furthest into is the one patrolled deepest.
 */
export function withReach(state: CampaignState, day: ISODate, patrol: number, valor: number): CampaignState {
  if (state.reach?.day === day) return state
  const rival = reachDepth(patrol, false)
  const marches = Object.fromEntries(RIVAL_IDS.map((r) => [r, Math.min(RULES.map.marchDepth, rival + R.perRank * pathRank(state, r))])) as Record<RivalId, number>
  const reach: ReachState = { day, patrol, valor, rival, lair: reachDepth(patrol, true), marches }
  return { ...state, reach }
}

/**
 * How many steps past the realm's reach `hex` lies: its depth less its march's reach, so 0 or less
 * within it. The heartland is always within reach. Null before the realm has a reach (a save from
 * before 3.7.0 until its next dawn), when reach changes nothing.
 */
export function stepsBeyond(state: Pick<CampaignState, 'reach'>, hex: Pick<HexState, 'ring' | 'march'>): number | null {
  const reach = state.reach
  if (!reach) return null
  if (!hex.march) return -1
  return depthOf(hex) - (isLairMarch(hex.march) ? reach.lair : (reach.marches?.[hex.march] ?? reach.rival))
}

/** The multiple on a beast or mythic strike at `hex`: `withinMult` within reach, more a step beyond it, up to `beyondCap`. */
export function strikeMult(state: Pick<CampaignState, 'reach'>, hex: Pick<HexState, 'ring' | 'march'>): number {
  const steps = stepsBeyond(state, hex)
  if (steps === null) return 1
  return steps <= 0 ? R.withinMult : Math.min(1 + R.beyondPerStep * steps, R.beyondCap)
}

/** The multiple on the garrison an assault on `hex` faces (supply): 1 within reach, `supplyPerStep` more a step beyond, up to `supplyCap` more. */
export function supplyMult(state: Pick<CampaignState, 'reach'>, hex: Pick<HexState, 'ring' | 'march'>): number {
  const steps = stepsBeyond(state, hex)
  if (steps === null || steps <= 0) return 1
  return 1 + Math.min(R.supplyPerStep * steps, R.supplyCap)
}

/** Where `hex` stands against the reach, for the screens: within it, its last row (the edge), or steps beyond. Null without a reach. */
export function reachStanding(state: Pick<CampaignState, 'reach'>, hex: Pick<HexState, 'ring' | 'march'>): { kind: 'within' | 'edge' | 'beyond'; steps: number } | null {
  const steps = stepsBeyond(state, hex)
  if (steps === null) return null
  if (steps > 0) return { kind: 'beyond', steps }
  return { kind: steps === 0 && hex.march ? 'edge' : 'within', steps: 0 }
}
