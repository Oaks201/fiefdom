/**
 * Builders for the daily combat and assault tests: a founded realm (support/realm.ts) with hexes
 * handed out directly, and a way to settle one day's combat and read what it posted.
 */
import { campaignWeek } from '../../../src/renderer/src/lib/game/clock'
import { settleCombat, type CombatOutcome } from '../../../src/renderer/src/lib/game/combat'
import { isLairMarch, neighbors, strongholds } from '../../../src/renderer/src/lib/game/map'
import type { CampaignState, GameEventKind, GameEventMap, HexState, Owner, RivalId, Tiding } from '../../../src/renderer/src/lib/game/types'
import { realm } from './realm'

/** The first campaign day of `realm()` (founded 2026-10-07 in Chicago; weeks start on Monday). */
export const START = '2026-10-08'
/** Monday of campaign week 6, the first week conquest attempts may strike. */
export const WEEK6 = '2026-11-09'

export type Posted = { kind: GameEventKind } & Record<string, unknown>

export interface Fought extends CombatOutcome {
  events: Posted[]
  of<K extends GameEventKind>(kind: K): GameEventMap[K][]
}

/** Settles `day`'s combat with Valor `valor` and collects the events it posts. */
export function fight(state: CampaignState, day: string, valor: number): Fought {
  const events: Posted[] = []
  const result = settleCombat(state, {
    day,
    week: campaignWeek(state.campaign.startDate, day, 1),
    weekStartsOn: 1,
    valor,
    emit: (kind, payload) => void events.push({ kind, ...payload })
  })
  return {
    ...result,
    events,
    of: <K extends GameEventKind>(kind: K) =>
      events.filter((e) => e.kind === kind).map(({ kind: _kind, ...payload }) => payload) as unknown as GameEventMap[K][]
  }
}

export function hex(state: CampaignState, id: string): HexState {
  const found = state.hexes.find((h) => h.id === id)
  if (!found) throw new Error(`No hex ${id}`)
  return found
}

export function withHex(state: CampaignState, id: string, patch: Partial<HexState>): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.id === id ? { ...h, ...patch } : h)) }
}

export function withOwner(state: CampaignState, ids: string[], owner: Owner): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (ids.includes(h.id) ? { ...h, owner } : h)) }
}

/** A plain hex (a road or between-land hex, no village) in `ring`, the first in map order passing `also`. */
export function plainHex(state: CampaignState, ring: number, also: (h: HexState) => boolean = () => true): HexState {
  const found = state.hexes.find((h) => h.ring === ring && (h.kind === 'road' || h.kind === 'between') && !h.village && also(h))
  if (!found) throw new Error(`No plain hex in ring ${ring}`)
  return found
}

/**
 * A front for conquest tests: the player holds a plain ring-`ring` hex, and `rival` holds a plain
 * hex in the next ring out that touches it. The rival is at War with the player.
 */
export function front(state: CampaignState, rival: RivalId, ring = 3): { state: CampaignState; inner: string; outer: string } {
  const inner = plainHex(state, ring, (h) => neighbors(h.id).some((n) => isPlain(state, n, ring + 1)))
  const outer = neighbors(inner.id).find((n) => isPlain(state, n, ring + 1)) as string
  let next = withOwner(withOwner(state, [inner.id], 'player'), [outer], rival)
  next = withDisposition(next, rival, 'war')
  return { state: next, inner: inner.id, outer }
}

function isPlain(state: CampaignState, id: string, ring: number): boolean {
  const h = hex(state, id)
  return h.ring === ring && (h.kind === 'road' || h.kind === 'between') && !h.village
}

export function withDisposition(state: CampaignState, rival: RivalId, to: 'peace' | 'tension' | 'war'): CampaignState {
  const r = state.rivals[rival]
  return { ...state, rivals: { ...state.rivals, [rival]: { ...r, disposition: { ...r.disposition, player: to } } } }
}

/** Fixes `day`'s daily threat as if the Herald had announced it at dawn. */
export function withTiding(state: CampaignState, tiding: Omit<Tiding, 'siegeDay'> & { siegeDay?: boolean }): CampaignState {
  const combat = state.combat ?? { schedule: [], tidings: [], conquests: [], contested: [] }
  const t: Tiding = { siegeDay: false, ...tiding }
  return { ...state, combat: { ...combat, tidings: [...combat.tidings.filter((x) => x.date !== t.date), t] } }
}

/** A neutral ring-`ring` hex the player can reach: one of its inner neighbors is handed to the player. */
export function reachable(state: CampaignState, ring: number, also: (h: HexState) => boolean): { state: CampaignState; target: string } {
  const target = state.hexes.find((h) => h.ring === ring && h.owner === 'neutral' && (h.kind === 'road' || h.kind === 'between') && also(h)) as HexState
  const inner = neighbors(target.id).find((n) => hex(state, n).ring === ring - 1 && hex(state, n).kind !== 'building') as string
  return { state: withOwner(state, [inner], 'player'), target: target.id }
}

/**
 * A ring-3 beast den the player can reach, in a lair's wedge: no rival's march rules apply there
 * (Patch 4, P4-01), so the common rules (D-22 to D-24) read plain.
 */
export function den(state: CampaignState = realm()): { state: CampaignState; target: string } {
  return reachable(state, 3, (h) => !h.village && isLairMarch(h.march) && h.seam === undefined)
}

/** Parks `day`'s daily threat on a building, where it is always beaten. */
export function quiet(state: CampaignState, day: string = START): CampaignState {
  const building = state.hexes.find((h) => h.kind === 'building') as HexState
  return withTiding(state, { date: day, kind: 'beasts', hexId: building.id, strength: 1 })
}

/** The player holds every stronghold of `march` (D-23), so nothing in it is barred. */
export function holdStrongholds(state: CampaignState, march: RivalId): CampaignState {
  const ids = [...strongholds(state.hexes)].filter(([, s]) => s.march === march).map(([id]) => id)
  return withOwner(state, ids, 'player')
}
