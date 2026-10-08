/**
 * Builders for realm states in the buildings, roster and effects tests: a founded campaign with
 * its tiers, Crossings, Milestones, Dominion and purse set directly.
 */
import { foundCampaign } from '../../../src/renderer/src/lib/game/campaign'
import { balance, post } from '../../../src/renderer/src/lib/game/economy'
import { dominion, isClaimableKind, LAND_BUILDINGS } from '../../../src/renderer/src/lib/game/map'
import { RULES } from '../../../src/renderer/src/lib/game/rules'
import type {
  ArmoryState,
  BuildingId,
  BuildingTier,
  CampaignState,
  CastleTier,
  CrossingId,
  CrossingStage,
  GraceLevel,
  HexState
} from '../../../src/renderer/src/lib/game/types'
import type { Ledger } from '../../../src/renderer/src/lib/types'
import { FOUNDED_AT, TZ, charter, emptyLedger } from '../fixtures/ledgers'

export const TODAY = '2026-10-08'

/**
 * A fresh campaign founded at FOUNDED_AT for 217 → 168 lb: Tier I everywhere, Castle I, a purse of
 * 100, no land beyond the castle. `ledger` is the one founding reads (and settlement will).
 */
export function realm(seed = 7, ledger: Ledger = emptyLedger()): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed, ledger }, FOUNDED_AT)
}

export function withBuildings(state: CampaignState, tiers: Partial<Record<BuildingId, number>>): CampaignState {
  return { ...state, buildings: { ...state.buildings, ...(tiers as Record<BuildingId, BuildingTier>) } }
}

export function allBuildings(state: CampaignState, tier: number): CampaignState {
  return withBuildings(state, { barracks: tier, merchantHall: tier, mageTower: tier, foundry: tier })
}

export function withCastle(state: CampaignState, tier: number): CampaignState {
  return { ...state, castleTier: tier as CastleTier }
}

export function withCrossings(state: CampaignState, stages: Partial<Record<CrossingId, number>>): CampaignState {
  return { ...state, crossings: { ...state.crossings, ...(stages as Record<CrossingId, CrossingStage>) } }
}

export function withMilestones(state: CampaignState, ...indices: number[]): CampaignState {
  const milestones = state.weight.milestones.map((m) => (indices.includes(m.index) ? { ...m, brokenOn: TODAY, brokenWeek: m.earliestWeek } : m))
  return { ...state, weight: { ...state.weight, milestones } }
}

export function withGrace(state: CampaignState, grace: number): CampaignState {
  return { ...state, weight: { ...state.weight, grace: grace as GraceLevel } }
}

export function withArmory(state: CampaignState, armory: Partial<ArmoryState>): CampaignState {
  return { ...state, armory: { wings: [], elites: [], stash: [], ...state.armory, ...armory } }
}

/** Equips `items` on the stored company `companyId`. */
export function equip(state: CampaignState, companyId: string, items: string[]): CampaignState {
  return { ...state, roster: state.roster.map((c) => (c.id === companyId ? { ...c, items } : c)) }
}

/** Sets the purse to exactly `amount` (by earning the difference, or by a negative adjust). */
export function withPurse(state: CampaignState, amount: number): CampaignState {
  const diff = amount - balance(state.purse)
  if (diff === 0) return state
  return { ...state, purse: post(state.purse, { date: TODAY, kind: diff > 0 ? 'earn' : 'adjust', amount: diff, source: 'test' }) }
}

/** What one hex gives `building` in Dominion (Ch 3 rule 3). */
function credit(h: HexState, building: BuildingId): number {
  if (!isClaimableKind(h)) return 0
  if (h.road) return h.road === building ? RULES.map.dominion.roadPerRing * h.ring : 0
  if (h.land && LAND_BUILDINGS[h.land].includes(building)) return RULES.map.dominion.betweenPerRing * h.ring
  return 0
}

/** Gives the player neutral hexes until `building` has exactly `target` Dominion (a small search). */
export function withDominion(state: CampaignState, building: BuildingId, target: number): CampaignState {
  const need = target - dominion(state.hexes, 'player')[building]
  const pool = state.hexes.filter((h) => h.owner === 'neutral' && credit(h, building) > 0).sort((a, b) => credit(b, building) - credit(a, building))
  const pick = (from: number, left: number): string[] | null => {
    if (left === 0) return []
    for (let i = from; i < pool.length; i++) {
      const c = credit(pool[i], building)
      if (c > left) continue
      const rest = pick(i + 1, left - c)
      if (rest) return [pool[i].id, ...rest]
    }
    return null
  }
  const ids = pick(0, need)
  if (!ids) throw new Error(`No set of neutral hexes gives ${building} Dominion ${target}`)
  return { ...state, hexes: state.hexes.map((h) => (ids.includes(h.id) ? { ...h, owner: 'player' } : h)) }
}

/** Hands every hex `building` draws Dominion from back to neutral. */
export function loseLand(state: CampaignState, building: BuildingId): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.owner === 'player' && credit(h, building) > 0 ? { ...h, owner: 'neutral' } : h)) }
}
