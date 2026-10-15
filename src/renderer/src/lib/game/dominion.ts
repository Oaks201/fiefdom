/**
 * Dominion as the chronicle of the player's war (R-05, D-18). Each rival's war is one path, feeding
 * the building on its road (the Orc → Barracks, the Goblin → Merchant Hall, the Dwarf → Foundry,
 * the Archmage → Mage Tower).
 *
 * A path's Dominion = Renown + Holdings:
 * - **Holdings** is the land the player holds now, each hex worth its depth (1 in the heartland,
 *   C-04) times its path shares (`pathShares` in map.ts). It rises and falls with the land.
 * - **Renown** is permanent: every deed against a rival, or in its march, adds to it and nothing
 *   takes it away. The `chronicle` settlement phases post the deeds once, as `deed` events, from the
 *   log the rest of settlement (and the player's own actions) wrote since they last read it.
 *
 * Each path's Dominion sets its rank, I to V, at shares of a fully walked path; a rank once reached
 * never falls (P2-15). Total Dominion (all four paths) gates the building tiers.
 */
import { CODEX } from './codex'
import { depthOf, hexIndex, hexWorth, isClaimableKind, marchShares, pathShares, type Shares } from './map'
import { RULES } from './rules'
import { RIVAL_IDS, type CampaignState, type DeedKind, type Emit, type GameEvent, type HexState, type LairId, type Owner, type PathsState, type RivalId } from './types'

export { hexWorth, pathShares }

const D = RULES.dominion
const HEARTLAND = RULES.map.heartlandRings

function zeros(): Record<RivalId, number> {
  return Object.fromEntries(RIVAL_IDS.map((r) => [r, 0])) as Record<RivalId, number>
}

/** Every path at no Renown and no rank, nothing read yet. */
export function emptyPaths(): PathsState {
  return { byRival: Object.fromEntries(RIVAL_IDS.map((r) => [r, { renown: 0, rank: 0 }])) as PathsState['byRival'], logRead: 0 }
}

export function pathsOf(state: CampaignState): PathsState {
  return state.paths ?? emptyPaths()
}

/** Holdings on each path: what every hex `owner` holds is worth, by its shares. */
export function holdings(hexes: readonly HexState[], owner: Owner = 'player'): Record<RivalId, number> {
  const out = zeros()
  for (const h of hexes) {
    if (h.owner !== owner) continue
    const worth = hexWorth(h)
    if (worth <= 0) continue
    for (const [r, s] of Object.entries(pathShares(h)) as [RivalId, number][]) out[r] += worth * s
  }
  return out
}

/** Renown on each path. */
export function renown(state: CampaignState): Record<RivalId, number> {
  const out = zeros()
  for (const r of RIVAL_IDS) out[r] = pathsOf(state).byRival[r].renown
  return out
}

/** The player's Dominion on each path: Renown + Holdings. */
export function pathTotals(state: CampaignState): Record<RivalId, number> {
  const held = holdings(state.hexes)
  const known = renown(state)
  const out = zeros()
  for (const r of RIVAL_IDS) out[r] = known[r] + held[r]
  return out
}

/** Total Dominion, all four paths summed: what the building tiers need. */
export function totalDominion(state: CampaignState): number {
  return Object.values(pathTotals(state)).reduce((s, v) => s + v, 0)
}

/** The Dominion each rank needs, I to V (P2-14). */
export function rankThresholds(): number[] {
  return D.rankShares.map((s) => s * D.fullPath)
}

/** The rank a path's Dominion reaches now, 0 to 5. */
export function rankFor(dominion: number): number {
  return rankThresholds().filter((t) => dominion >= t).length
}

/** Each path's rank: the highest it has reached (it never falls). */
export function pathRank(state: CampaignState, rival: RivalId): number {
  return pathsOf(state).byRival[rival].rank
}

/** The hexes giving a path Holdings, with how much each gives, in map order. */
export function holdingSources(state: CampaignState, rival: RivalId): { hexId: string; value: number }[] {
  return state.hexes.flatMap((h) => {
    if (h.owner !== 'player') return []
    const v = hexWorth(h) * (pathShares(h)[rival] ?? 0)
    return v > 0 ? [{ hexId: h.id, value: v }] : []
  })
}

// ── Deeds (P2-13) ────────────────────────────────────────────────────────────

interface Deed {
  path: RivalId
  deed: DeedKind
  value: number
  hexId?: string
  source?: string
}

function spread(shares: Shares, deed: DeedKind, value: number, hexId?: string, source?: string): Deed[] {
  return (Object.entries(shares) as [RivalId, number][]).flatMap(([path, s]) =>
    value * s > 0 ? [{ path, deed, value: value * s, ...(hexId ? { hexId } : {}), ...(source ? { source } : {}) }] : []
  )
}

function lairShares(lair: string): Shares {
  return marchShares(lair as LairId)
}

/** The deeds one log event records (D-18), with the hexes as they stand. */
function deedsOf(state: CampaignState, e: GameEvent, byId: ReadonlyMap<string, HexState>): Deed[] {
  const d = D.deeds
  switch (e.kind) {
    case 'hexTransfer': {
      // Taking a march hex, by any way but a rival's fall (C-10): its depth, more for walls broken.
      const hex = byId.get(e.hexId)
      if (e.to !== 'player' || e.how === 'abdication' || !hex || hex.ring <= HEARTLAND || !isClaimableKind(hex)) return []
      const value = d.hexTakenPerDepth * depthOf(hex) + d.perFortification * (e.fortification ?? 0)
      return spread(pathShares(hex), 'hexTaken', value, hex.id, e.id)
    }
    case 'defense': {
      if (e.outcome === 'defeat') return []
      if (e.rival) return [{ path: e.rival, deed: 'battleWon', value: d.battleWon, hexId: e.hexId, source: e.id }]
      const hex = byId.get(e.hexId)
      if (!hex || hex.ring <= HEARTLAND) return []
      if (e.threat === 'beasts') return spread(pathShares(hex), 'heldAgainstBeasts', d.heldAgainstBeasts, hex.id, e.id)
      if (e.threat === 'mythic') return spread(pathShares(hex), 'heldAgainstMythic', d.heldAgainstMythic, hex.id, e.id)
      return []
    }
    case 'grandBattle': {
      if (e.stage !== 'fought' || e.result === 'defeat' || e.result === undefined) return []
      const battle = state.grandBattles.find((b) => b.id === e.battleId)
      const members = battle?.members ?? (e.rival ? [e.rival] : [])
      if (members.length > 0) return members.map((path) => ({ path, deed: 'grandBattleWon' as const, value: d.grandBattleWon / members.length, hexId: e.hexId, source: e.id }))
      const quarry = e.quarry ?? battle?.quarry
      const lair = quarry ? CODEX.quarries.find((q) => q.id === quarry)?.lair : byId.get(e.hexId)?.march
      return lair ? spread(lairShares(lair), 'grandBattleWon', d.grandBattleWon, e.hexId, e.id) : []
    }
    case 'rivalResolved':
      return [{ path: e.rival, deed: 'resolved', value: d.resolved, source: e.id }]
    default:
      return []
  }
}

/**
 * The chronicle (D-18): posts the deeds in the log since it last read it, adds their Renown, and
 * raises any path whose Dominion has passed a new rank. Settle once: it reads each event once.
 */
export function chronicle(input: CampaignState, emit: Emit): CampaignState {
  const paths = pathsOf(input)
  if (paths.logRead >= input.log.length && input.paths) return checkRanks(input, emit)
  const byId = hexIndex(input.hexes)
  const byRival = { ...paths.byRival }
  for (const e of input.log.slice(paths.logRead)) {
    for (const deed of deedsOf(input, e, byId)) {
      byRival[deed.path] = { ...byRival[deed.path], renown: byRival[deed.path].renown + deed.value }
      emit('deed', deed)
    }
  }
  return checkRanks({ ...input, paths: { byRival, logRead: input.log.length } }, emit)
}

function checkRanks(state: CampaignState, emit: Emit): CampaignState {
  const totals = pathTotals(state)
  const paths = pathsOf(state)
  let byRival = paths.byRival
  for (const r of RIVAL_IDS) {
    const rank = rankFor(totals[r])
    if (rank > byRival[r].rank) {
      byRival = { ...byRival, [r]: { ...byRival[r], rank } }
      emit('pathRank', { path: r, rank })
    }
  }
  return byRival === paths.byRival ? state : { ...state, paths: { ...paths, byRival } }
}
