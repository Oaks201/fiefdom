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
import { depthOf, hexIndex, hexWorth, isClaimableKind, isStronghold, marchShares, pathShares, type Shares } from './map'
import { addDays } from './clock'
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

/** The events before `at` in the log, last first, while `more` holds. */
function* before(log: readonly GameEvent[], at: number, more: (e: GameEvent) => boolean): Generator<GameEvent> {
  for (let i = at - 1; i >= 0 && more(log[i]); i--) yield log[i]
}

/** One rival's signature deed (D-34), to his path alone, × his share of the hex where there is one. */
function signature(path: RivalId, deed: DeedKind, value: number, e: GameEvent, hexId?: string): Deed[] {
  return value > 0 ? [{ path, deed, value, ...(hexId ? { hexId } : {}), source: e.id }] : []
}

const DEAL_WAYS: ReadonlySet<string> = new Set(['bribe', 'influence', 'trade'])

/** The signature deeds a hex the player took records (D-34): the Goblin's deals, the Dwarf's walls and sieges, the Orc's retaking, the Archmage's ebbs and summoned mythics. */
function takenSignatures(state: CampaignState, e: Extract<GameEvent, { kind: 'hexTransfer' }>, hex: HexState, at: number): Deed[] {
  const d = D.deeds
  const shares = pathShares(hex)
  const out: Deed[] = []
  if (DEAL_WAYS.has(e.how) && shares.goblin) out.push(...signature('goblin', 'dealTaken', d.dealTakenPerDepth * depthOf(hex) * shares.goblin, e, hex.id))
  if (shares.dwarf && e.fortification) out.push(...signature('dwarf', 'wallsBroken', d.wallsBroken * e.fortification * shares.dwarf, e, hex.id))
  // Looking back from the taking: this hex's own history since it last changed hands, and the day's surges.
  let repulses = 0
  let lastHolder: string | undefined
  let ebbed = false
  let summoned = false
  // ISO dates compare as strings: the lookback's first day, and the first day a summoning still counts.
  const since = addDays(e.day, -d.lookbackDays)
  const summonedSince = addDays(e.day, 1 - RULES.personalities.archmage.summonDays)
  for (const x of before(state.log, at, (x) => (lastHolder === undefined && x.day >= since) || x.day === e.day)) {
    if (x.kind === 'hexTransfer' && x.hexId === hex.id && lastHolder === undefined) lastHolder = x.from === 'player' ? `player>${x.to}` : 'other'
    if (x.kind === 'assault' && x.hexId === hex.id && x.outcome === 'repulsed' && lastHolder === undefined) repulses++
    if (x.kind === 'surge' && x.hexId === hex.id && x.day === e.day && x.surge === 'ebb') ebbed = true
    if (lastHolder === undefined && ((x.kind === 'surge' && x.surge === 'summoning') || (x.kind === 'ritual' && x.ritualId === 'summoning')) && x.hexId === hex.id && x.day >= summonedSince) summoned = true
  }
  if (shares.dwarf && e.how === 'conquest' && repulses > 0) out.push(...signature('dwarf', 'siegeEndured', d.siegeEndured * Math.min(d.siegeEnduredCap, repulses) * shares.dwarf, e, hex.id))
  if (lastHolder === 'player>orc') out.push(...signature('orc', 'retaken', d.retaken, e, hex.id))
  if (ebbed && shares.archmage) out.push(...signature('archmage', 'surgeSeized', d.surgeSeized * shares.archmage, e, hex.id))
  if (summoned) out.push(...signature('archmage', 'summonedDefeated', d.summonedDefeated, e, hex.id))
  return out
}

/** The deeds one log event records (D-18; Patch 4's signature deeds, D-34), with the hexes as they stand. `at` is its place in the log. */
function deedsOf(state: CampaignState, e: GameEvent, byId: ReadonlyMap<string, HexState>, at: number): Deed[] {
  const d = D.deeds
  switch (e.kind) {
    case 'hexTransfer': {
      // Taking a march hex, by any way but a rival's fall (C-10): its depth, more for walls broken.
      const hex = byId.get(e.hexId)
      if (e.to !== 'player' || e.how === 'abdication' || !hex || hex.ring <= HEARTLAND || !isClaimableKind(hex)) return []
      const value = d.hexTakenPerDepth * depthOf(hex) + d.perFortification * (e.fortification ?? 0)
      const taken = [...spread(pathShares(hex), 'hexTaken', value, hex.id, e.id), ...takenSignatures(state, e, hex, at)]
      // A stronghold (D-25) adds its own deed on top; one won in battle has the Grand Battle's too.
      if (!isStronghold(state.hexes, hex.id)) return taken
      return [...taken, ...spread(pathShares(hex), 'strongholdTaken', d.strongholdPerDepth * depthOf(hex), hex.id, e.id)]
    }
    case 'assault':
      // The Orc: every battle with him counts, a repulse too (D-34).
      return e.outcome === 'repulsed' && e.owner === 'orc' ? signature('orc', 'battleLost', d.battleLost, e, e.hexId) : []
    case 'bribe':
      return e.price < e.garrison ? signature('goblin', 'bargain', d.bargain, e, e.hexId) : []
    case 'goblinBid':
      return e.stage === 'held' ? signature('goblin', 'bribeBeaten', d.bribeBeaten, e, e.hexId) : []
    case 'courtship':
      return e.outcome === 'defected' && e.winner === 'player' && e.rivals?.includes('goblin') ? signature('goblin', 'counterBidBeaten', d.counterBidBeaten, e, e.hexId) : []
    case 'ritual':
      return signature('archmage', 'ritualEndured', d.ritualEndured, e, e.hexId)
    case 'defense': {
      if (e.outcome === 'defeat') return e.rival === 'orc' ? signature('orc', 'battleLost', d.battleLost, e, e.hexId) : []
      if (e.threat === 'surge') return signature('archmage', 'surgeWeathered', d.surgeWeathered, e, e.hexId)
      if (e.threat === 'conquest' && e.rival === 'dwarf') return signature('dwarf', 'siegeBroken', d.siegeBroken, e, e.hexId)
      if (e.threat === 'counterattack') {
        // D-25: a counterattack held is its own deed, in place of the battle's ordinary one.
        if (e.rival) return [{ path: e.rival, deed: 'counterattackHeld', value: d.counterattackHeld, hexId: e.hexId, source: e.id }]
        const hex = byId.get(e.hexId)
        return hex && hex.ring > HEARTLAND ? spread(pathShares(hex), 'counterattackHeld', d.counterattackHeldBeasts, hex.id, e.id) : []
      }
      if (e.rival) return [{ path: e.rival, deed: 'battleWon', value: d.battleWon, hexId: e.hexId, source: e.id }]
      const hex = byId.get(e.hexId)
      if (!hex || hex.ring <= HEARTLAND) return []
      if (e.threat === 'beasts') return spread(pathShares(hex), 'heldAgainstBeasts', d.heldAgainstBeasts, hex.id, e.id)
      if (e.threat === 'mythic') return spread(pathShares(hex), 'heldAgainstMythic', d.heldAgainstMythic, hex.id, e.id)
      return []
    }
    case 'grandBattle': {
      if (e.stage === 'fought' && e.result === 'defeat') return e.rival === 'orc' ? signature('orc', 'battleLost', d.battleLost, e, e.hexId) : []
      if (e.stage !== 'fought' || e.result === undefined) return []
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
  for (let at = paths.logRead; at < input.log.length; at++) {
    for (const deed of deedsOf(input, input.log[at], byId, at)) {
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
