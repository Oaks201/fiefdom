/**
 * Builders for realm states in the buildings, roster and effects tests: a founded campaign with
 * its tiers, Crossings, Milestones, Dominion and purse set directly.
 */
import { foundCampaign } from '../../../src/renderer/src/lib/game/campaign'
import { balance, post } from '../../../src/renderer/src/lib/game/economy'
import { pathsOf, totalDominion } from '../../../src/renderer/src/lib/game/dominion'
import { hexWorth, pathShares, rivalOfRoad } from '../../../src/renderer/src/lib/game/map'
import type {
  ArmoryState,
  BuildingId,
  BuildingTier,
  CampaignState,
  CastleTier,
  CrossingId,
  CrossingStage,
  GraceLevel,
  HexState,
  RivalId
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

/** Whether a hex lies on `building`'s rival's path (D-18). */
function onPath(h: HexState, building: BuildingId): boolean {
  return (pathShares(h)[rivalOfRoad(building)] ?? 0) > 0
}

/** What one hex adds to total Dominion when held (D-18): its depth, or 1 in the heartland. */
function credit(h: HexState): number {
  return hexWorth(h)
}

/**
 * Gives the player neutral hexes on `building`'s path until total Dominion (what the tiers need,
 * D-18) is exactly `target` (a small search).
 */
export function withDominion(state: CampaignState, building: BuildingId, target: number): CampaignState {
  const need = target - totalDominion(state)
  const pool = state.hexes.filter((h) => h.owner === 'neutral' && onPath(h, building) && credit(h) > 0).sort((a, b) => credit(b) - credit(a))
  const pick = (from: number, left: number): string[] | null => {
    if (left === 0) return []
    for (let i = from; i < pool.length; i++) {
      const c = credit(pool[i])
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

/** `state` with `rival`'s path at `renown` Renown and at least `rank` (Patch 7: the Dominion marks and the Accord's rank). */
export function withRenown(state: CampaignState, rival: RivalId, renown: number, rank = 0): CampaignState {
  const paths = pathsOf(state)
  const was = paths.byRival[rival]
  return { ...state, paths: { ...paths, byRival: { ...paths.byRival, [rival]: { renown, rank: Math.max(was.rank, rank) } } } }
}

/** Hands every hex on `building`'s path back to neutral. */
export function loseLand(state: CampaignState, building: BuildingId): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.owner === 'player' && onPath(h, building) && credit(h) > 0 ? { ...h, owner: 'neutral' } : h)) }
}
