/**
 * Sieges (Patch 3, D-22; R-04, R-15, R-16): the pure pieces the daily assault reads.
 *
 * - **Wear that stays.** A repulse wears `RULES.land.repulseWear` of its Assault off the garrison, and
 *   the wear stays until the hex changes hands. Each day a hex is not assaulted it loses
 *   `RULES.sieges.wearDecay.perDay` of its wear (C-20), so a siege left alone fades slowly and a
 *   pressed one never does. The week close no longer clears it (X-07).
 * - **Standing siege orders** (C-22). The siege names its target only; on any day without the
 *   player's own orders, the Marshal presses it with the companies best matched to it, and the rest
 *   defend (A-36 holds whenever no siege stands). `combat.ts` builds that day's orders
 *   (`ordersFor`); this module keeps the record and says whether it still stands.
 * - **Flanking** (C-21). The daily assault gains `perNeighbor` for each hex the player holds beside
 *   its target beyond the first, at most `maxNeighbors` of them.
 */
import { diffDays } from './clock'
import { claimableBy, isStronghold, neighbors, type HexIndex } from './map'
import { pathRank } from './dominion'
import { preparationMult } from './marches'
import { marchGarrisonMult } from './personalities'
import { supplyMult } from './reach'
import { RULES } from './rules'
import type { CampaignState, Fallback, HexState, ISODate, StandingSiege } from './types'

const S = RULES.sieges

/** The standing siege, if one stands. */
export function standingSiegeOf(state: CampaignState): StandingSiege | undefined {
  return state.standingSiege
}

/** The state with `hexId` as its standing siege (laid on `day` when the target changes), or none. */
export function withStandingSiege(state: CampaignState, hexId: string | undefined, day: ISODate): CampaignState {
  if (!hexId) {
    if (!state.standingSiege) return state
    const { standingSiege: _gone, ...rest } = state
    return rest
  }
  if (state.standingSiege?.hexId === hexId) return state
  return { ...state, standingSiege: { hexId, since: day } }
}

/** Whether the standing siege's hex can be assaulted by the player as the map stands: not theirs, adjacent, a hex a daily assault may take. */
export function siegeStands(state: CampaignState, siege: StandingSiege | undefined = standingSiegeOf(state)): boolean {
  return siege !== undefined && claimableBy(state.hexes, siege.hexId, 'player', 'assault')
}

/**
 * A hex's wear after a day it was not assaulted (C-20): `rate` of it gone (`perDay`; a stronghold's
 * `stronghold`, P3-02; the Dwarf's march slower, N-03), and cleared once it is a trace.
 */
export function decayedWear(wear: number, rate: number = S.wearDecay.perDay): number {
  const left = wear * (1 - rate)
  return left < S.wearDecay.clearBelow ? 0 : left
}

/** A stronghold's multiple on its garrison while the player doesn't hold it (D-23: `garrisonMult`; `mult` from the Dwarf's path at rank V, C-36), else 1. */
export function strongholdMult(hexes: readonly HexState[], hex: Pick<HexState, 'id' | 'owner'>, mult: number = S.stronghold.garrisonMult): number {
  return hex.owner !== 'player' && isStronghold(hexes, hex.id) ? mult : 1
}

/** What a stronghold weighs against the player's assault (D-23): its multiple, less from the Dwarf's path at rank V (C-36). */
function strongholdWeight(state: CampaignState): number {
  const perk = RULES.dominion.rankPerks.dwarf
  return pathRank(state, 'dwarf') >= perk.strongholdRank ? perk.strongholdMult : S.stronghold.garrisonMult
}

/** The share of a hex's walls that count against the player's assault: less with each rank of the Dwarf's path (C-36). */
export function fortificationShare(state: CampaignState): number {
  return Math.max(0, 1 - RULES.dominion.rankPerks.dwarf.fortificationCut * pathRank(state, 'dwarf'))
}

/**
 * The multiple on `hex`'s garrison as the player's assault weighs it on `day`: its march's
 * preparation (D-19) × a stronghold's (D-23) × its march's rules (Patch 4: the Orc's weaker
 * garrisons, the Archmage's surges) × supply beyond the realm's reach (Patch 7, A2). A rival's own
 * den assault reads none of it (C-29).
 */
export function garrisonMult(state: CampaignState, hex: HexState, day: ISODate): number {
  // Patch 7 (A2): an assault beyond the realm's reach fights without supply.
  return preparationMult(state, hex, day) * strongholdMult(state.hexes, hex, strongholdWeight(state)) * marchGarrisonMult(state, hex, day) * supplyMult(state, hex)
}

/** The most wear a hex can carry: the garrison it wears, as an assault must beat it (fortification and preparation counted). */
export function wearCap(hex: HexState, fortification: number, prep: number): number {
  return (hex.garrison + fortification) * prep
}

/** True when `value` brings `garrison` down within `days` assault days, today included, each repulse wearing `repulseWear` of it (Ch 6's repeated push; Weary aside). */
export function fallsWithin(value: number, garrison: number, days: number): boolean {
  return value * (1 + RULES.land.repulseWear * (days - 1)) >= garrison
}

/** The assault days, today included, `value` needs to bring `garrison` down, each repulse wearing `repulseWear` of it (Weary aside). */
export function assaultDays(value: number, garrison: number): number {
  if (value >= garrison) return 1
  return 1 + Math.ceil((garrison - value) / (RULES.land.repulseWear * value))
}

/** A siege's progress on a worn hex: its wear as a share of the garrison it wears (0 to 1). */
export function siegeProgress(wear: number, full: number): number {
  return full > 0 ? Math.min(1, wear / full) : 0
}

/** A fallen force's strength on `day` (C-23): all of it the day after it fell back, then 2/3, then 1/3; nothing outside that window, or from the day it struck back. */
export function fallbackStrengthOn(f: Fallback, day: ISODate): number {
  const k = diffDays(f.day, day)
  const n = S.fallback.days
  if (k < 1 || k > n || (f.struck !== undefined && f.struck <= day)) return 0
  return (f.strength * (n - k + 1)) / n
}

/** The fallen forces on `hex` on `day` (D-24): their strength together, at most `stackCap` × its own garrison; a force whose refuge changed hands counts nothing. */
export function fallbackOn(state: CampaignState, hex: Pick<HexState, 'id' | 'owner' | 'garrison'>, day: ISODate): number {
  let sum = 0
  for (const f of state.fallbacks ?? []) if (f.to === hex.id && f.holder === hex.owner) sum += fallbackStrengthOn(f, day)
  return Math.min(S.fallback.stackCap * hex.garrison, sum)
}

/** How many hexes beside `hexId` the player holds. */
export function heldNeighbors(byId: HexIndex, hexId: string): number {
  return neighbors(hexId).filter((n) => byId.get(n)?.owner === 'player').length
}

/** The daily assault's flanking multiple on `hexId` (C-21): 1 + `perNeighbor` for each held neighbor beyond the first, at most `maxNeighbors`. */
export function flankingMult(byId: HexIndex, hexId: string): number {
  const extra = Math.min(S.flanking.maxNeighbors, Math.max(0, heldNeighbors(byId, hexId) - 1))
  return 1 + S.flanking.perNeighbor * extra
}
