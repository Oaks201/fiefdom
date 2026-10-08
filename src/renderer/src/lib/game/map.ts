/**
 * The realm map (Ch 3): 127 pointy-topped hexes in axial coordinates, radius 6, with roads,
 * between-lands, the Rim, who holds what at the founding, seeded villages, adjacency, borders and
 * Dominion. Every later system asks this module where things are and who owns them.
 *
 * Geometry (version 1, Ch 3, as written out in docs/game/tasks/T03): `ring` is the hex distance
 * from the castle at (0, 0); on screen `r` grows downward. The four diagonal corner rays are the
 * roads (NW Barracks → Orc, NE Merchant Hall → Goblin, SW Mage Tower → Archmage, SE Foundry →
 * Dwarf). The W and E rays lead to the lairs and count as the West and East between-lands.
 *
 * Changing owners over time is T08 to T10's job; this module only builds and reads the map.
 */
import { CODEX } from './codex'
import { RULES, base } from './rules'
import { stream } from './rng'
import { RIVAL_IDS, type BuildingId, type FrontId, type HexKind, type HexState, type ISODate, type Land, type Owner, type RivalId } from './types'

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Axial {
  q: number
  r: number
}

export type Direction = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE'

/** The six directions. Pointy-topped, `r` grows downward. */
export const DIRECTIONS: Readonly<Record<Direction, Axial>> = Object.freeze({
  E: { q: 1, r: 0 },
  NE: { q: 1, r: -1 },
  NW: { q: 0, r: -1 },
  W: { q: -1, r: 0 },
  SW: { q: -1, r: 1 },
  SE: { q: 0, r: 1 }
})

/** The six corner rays in clockwise order, starting from NW (the order labels count in). */
const CLOCKWISE_CORNERS: readonly Direction[] = ['NW', 'NE', 'E', 'SE', 'SW', 'W']

/** Walking a ring clockwise, the step taken along each side after its starting corner. */
const SIDE_STEPS: readonly Direction[] = ['E', 'SE', 'SW', 'W', 'NW', 'NE']

/** The road on each diagonal corner ray. */
const ROAD_OF_CORNER: Partial<Record<Direction, BuildingId>> = {
  NW: 'barracks',
  NE: 'merchantHall',
  SW: 'mageTower',
  SE: 'foundry'
}

/** The between-land of each lair ray. */
const LAND_OF_LAIR_CORNER: Partial<Record<Direction, Land>> = { W: 'west', E: 'east' }

/**
 * The between-land of the edge hexes after each clockwise corner (side i runs from corner i to
 * corner i + 1): NW→NE North, NE→E and E→SE East, SE→SW South, SW→W and W→NW West.
 */
const LAND_OF_SIDE: readonly Land[] = ['north', 'east', 'east', 'south', 'west', 'west']

/** The two buildings each between-land lies between. */
export const LAND_BUILDINGS: Readonly<Record<Land, readonly [BuildingId, BuildingId]>> = Object.freeze({
  north: ['barracks', 'merchantHall'],
  south: ['mageTower', 'foundry'],
  west: ['barracks', 'mageTower'],
  east: ['merchantHall', 'foundry']
})

/** The map's radius: ring 6 is the Rim. */
export const MAP_RADIUS = RULES.map.radius
const FRONTIER_RING = RULES.land.claimableRings.max
const RIM_RING = MAP_RADIUS

/** Builds the id of a hex: `"q,r"`. */
export function hexId(q: number, r: number): string {
  return `${q + 0},${r + 0}` // `+ 0` turns −0 into 0
}

/** Reads a hex id back into coordinates. */
export function parseHexId(id: string): Axial {
  const [q, r] = id.split(',').map(Number)
  if (!Number.isInteger(q) || !Number.isInteger(r)) throw new RangeError(`Not a hex id: "${id}"`)
  return { q, r }
}

function toAxial(hex: string | Axial): Axial {
  return typeof hex === 'string' ? parseHexId(hex) : hex
}

/** Hex distance between two hexes (ids or coordinates). */
export function hexDistance(a: string | Axial, b: string | Axial): number {
  const p = toAxial(a)
  const s = toAxial(b)
  const dq = p.q - s.q
  const dr = p.r - s.r
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

/** The ring of a hex: its distance from the castle. */
export function ringOf(hex: string | Axial): number {
  return hexDistance(hex, { q: 0, r: 0 })
}

/** The ids of the hexes touching this one, on the map only, in the order E, NE, NW, W, SW, SE. */
export function neighbors(id: string): string[] {
  const { q, r } = parseHexId(id)
  const out: string[] = []
  for (const d of Object.values(DIRECTIONS)) {
    const n = { q: q + d.q, r: r + d.r }
    if (ringOf(n) <= MAP_RADIUS) out.push(hexId(n.q, n.r))
  }
  return out
}

/** The hexes of ring k in clockwise order from its NW corner (ring 0 is the castle alone). */
export function ringHexes(k: number): Axial[] {
  if (k === 0) return [{ q: 0, r: 0 }]
  const out: Axial[] = []
  let q = DIRECTIONS.NW.q * k
  let r = DIRECTIONS.NW.r * k
  for (const step of SIDE_STEPS) {
    for (let i = 0; i < k; i++) {
      out.push({ q: q + 0, r: r + 0 })
      q += DIRECTIONS[step].q
      r += DIRECTIONS[step].r
    }
  }
  return out
}

/** Where a hex sits on its ring: its clockwise index from the NW corner (0-based). */
function ringIndex(hex: Axial): number {
  const k = ringOf(hex)
  if (k === 0) return 0
  return ringHexes(k).findIndex((h) => h.q === hex.q && h.r === hex.r)
}

/**
 * A hex's label for text: `"<ring>-<index>"`, with the index counted clockwise from 1 at the NW
 * corner of its ring (A-109). The castle is "0-1".
 */
export function hexLabel(hex: string | Axial | HexState): string {
  const at = typeof hex === 'string' ? parseHexId(hex) : { q: hex.q, r: hex.r }
  return `${ringOf(at)}-${ringIndex(at) + 1}`
}

// ── Building the map ─────────────────────────────────────────────────────────

/** Where a hex sits in the layout, before anyone owns it. */
interface Slot {
  q: number
  r: number
  ring: number
  kind: HexKind
  land?: Land
  road?: BuildingId
  /** The rival whose capital, realm, Gate or March this is. */
  rival?: RivalId
  /** One of the 12 rival Frontier villages (a Gate or a March hex). */
  rivalVillage?: boolean
}

/** The rival at the end of a building's road (Barracks → Orc, Merchant Hall → Goblin, …). */
export function rivalOfRoad(road: BuildingId): RivalId {
  const entry = CODEX.rivals.find((rv) => rv.road === road)
  if (!entry) throw new Error(`No rival on the ${road} road`)
  return entry.id
}

/** The layout of one ring-k hex at clockwise position p. */
function slotAt(k: number, p: number, at: Axial): Slot {
  const slot: Slot = { q: at.q, r: at.r, ring: k, kind: 'between' }
  if (k === 0) return { ...slot, kind: 'castle' }
  const side = Math.floor(p / k)
  const offset = p % k
  const corner = CLOCKWISE_CORNERS[side]
  if (offset === 0) {
    const road = ROAD_OF_CORNER[corner]
    if (road) slot.road = road
    else slot.land = LAND_OF_LAIR_CORNER[corner]
  } else {
    slot.land = LAND_OF_SIDE[side]
  }

  const size = k * CLOCKWISE_CORNERS.length
  /** The corner this hex is, or sits beside on its ring (±1 position). */
  const nearCorner = (dir: Direction): 'on' | 'beside' | undefined => {
    const c = CLOCKWISE_CORNERS.indexOf(dir) * k
    if (p === c) return 'on'
    if (p === (c + 1) % size || p === (c - 1 + size) % size) return 'beside'
    return undefined
  }
  const diagonal = (Object.keys(ROAD_OF_CORNER) as Direction[]).map((d) => ({ d, near: nearCorner(d) }))
  const nearRoad = diagonal.find((x) => x.near !== undefined)
  const nearLair = (Object.keys(LAND_OF_LAIR_CORNER) as Direction[]).find((d) => nearCorner(d) !== undefined)

  if (k === 1) {
    if (slot.road) slot.kind = 'building'
    return slot
  }
  if (k < FRONTIER_RING) {
    if (slot.road) slot.kind = 'road'
    return slot
  }
  if (k === FRONTIER_RING) {
    if (nearRoad) {
      slot.rival = rivalOfRoad(ROAD_OF_CORNER[nearRoad.d] as BuildingId)
      slot.rivalVillage = true
      if (nearRoad.near === 'on') slot.kind = 'gate'
    } else if (slot.land && offset === 0) {
      slot.kind = 'lairMouth'
    }
    return slot
  }
  // The Rim.
  if (nearRoad) {
    slot.rival = rivalOfRoad(ROAD_OF_CORNER[nearRoad.d] as BuildingId)
    slot.kind = nearRoad.near === 'on' ? 'capital' : 'realm'
  } else if (nearLair) {
    slot.kind = 'lair'
  } else {
    slot.kind = 'battlefield'
  }
  return slot
}

/** Every hex's layout, castle first, then ring by ring clockwise from each NW corner. */
function layout(): Slot[] {
  const out: Slot[] = []
  for (let k = 0; k <= MAP_RADIUS; k++) ringHexes(k).forEach((at, p) => out.push(slotAt(k, p, at)))
  return out
}

/** Whether a ring is claimable at all (rings 1 to 5). */
function inClaimableRings(ring: number): boolean {
  return ring >= RULES.land.claimableRings.min && ring <= RULES.land.claimableRings.max
}

/** The kinds that can never change hands by any method in this module. */
const FIXED_KINDS: ReadonlySet<HexKind> = new Set<HexKind>(['castle', 'building', 'capital', 'realm', 'lair', 'battlefield'])

/** The 86 claimable hexes are rings 1 to 5, minus the castle and the four buildings. */
export function isClaimableKind(hex: Pick<HexState, 'ring' | 'kind'>): boolean {
  return inClaimableRings(hex.ring) && !FIXED_KINDS.has(hex.kind)
}

/** The day seeded map draws use: the map depends on the seed alone, never on the founding date. */
const MAP_DRAW_DAY: ISODate = '0000-01-01'

/** Per-building village credit (A-13): 1 for a road village, 0.5 for each shared between-land village. */
export function villageCredits(hexes: readonly Pick<HexState, 'village' | 'road' | 'land' | 'kind'>[]): Record<BuildingId, number> {
  const credit: Record<BuildingId, number> = { barracks: 0, merchantHall: 0, mageTower: 0, foundry: 0 }
  for (const h of hexes) {
    if (!h.village) continue
    if (h.road) credit[h.road] += RULES.map.villageCredit.road
    else if (h.land) for (const b of LAND_BUILDINGS[h.land]) credit[b] += RULES.map.villageCredit.between
  }
  return credit
}

function creditSpread(credit: Record<BuildingId, number>): number {
  const values = Object.values(credit)
  return Math.max(...values) - Math.min(...values)
}

/** The result of seeding villages: the chosen hex ids and which attempt found them. */
export interface VillageSeeding {
  ids: string[]
  attempt: number
}

/**
 * Seeds the 18 neutral villages (A-13, read with A-108): 4 in ring 2, 6 in ring 3 and 8 in
 * ring 4, with per-building credit within 1. No seeded village touches a rival village or a
 * village in its own ring, and at most 2 pairs of seeded villages touch across neighboring rings.
 * (Fully apart, 4/6/8 does not fit on this map: ring 4 has exactly room for 8 beside the rival
 * villages, and those leave ring 3 room for 4.)
 *
 * Each attempt draws from the stream `villages:<attempt>`: it shuffles each ring's hexes once,
 * then searches depth-first, outermost ring first, in that order. An attempt that runs out of
 * search budget is dropped and the next one starts.
 */
export function seedVillages(seed: number): VillageSeeding {
  const slots = layout()
  const rivalVillages = new Set(slots.filter((s) => s.rivalVillage).map((s) => hexId(s.q, s.r)))
  const quota = RULES.map.seededVillages
  const rules = RULES.map.villageSeeding
  const ringOfId = new Map(slots.map((s) => [hexId(s.q, s.r), s.ring]))
  // Hexes that may hold a seeded village at all: neutral, claimable, not beside a rival village.
  const open = slots.filter(
    (s) =>
      quota[s.ring - 1] > 0 &&
      isClaimableKind(s) &&
      !s.rival &&
      !neighbors(hexId(s.q, s.r)).some((n) => rivalVillages.has(n))
  )

  for (let attempt = 0; attempt < rules.maxAttempts; attempt++) {
    const draws = stream(seed, MAP_DRAW_DAY, `villages:${attempt}`)
    const order: Slot[] = []
    for (let ring = quota.length; ring >= 1; ring--) order.push(...draws.shuffle(open.filter((s) => s.ring === ring)))
    const ids = order.map((s) => hexId(s.q, s.r))
    const leftInRing = order.map((s, i) => order.slice(i).filter((o) => o.ring === s.ring).length)

    const chosen = new Set<string>()
    const count = quota.map(() => 0)
    let nodes = 0
    const search = (i: number, pairs: number): boolean => {
      if (++nodes > rules.searchBudget) return false
      if (count.every((c, k) => c === quota[k])) {
        const credit = villageCredits(order.filter((s) => chosen.has(hexId(s.q, s.r))).map((s) => ({ ...s, village: { loyalty: 0 } })))
        return creditSpread(credit) <= RULES.map.villageCredit.maxSpread
      }
      if (i === order.length) return false
      const k = order[i].ring - 1
      if (count[k] + leftInRing[i] < quota[k]) return false
      if (count[k] < quota[k]) {
        const touching = neighbors(ids[i]).filter((n) => chosen.has(n))
        const sameRing = touching.some((n) => ringOfId.get(n) === order[i].ring)
        if (!sameRing && pairs + touching.length <= rules.maxTouchingPairs) {
          chosen.add(ids[i])
          count[k]++
          if (search(i + 1, pairs + touching.length)) return true
          count[k]--
          chosen.delete(ids[i])
        }
      }
      return search(i + 1, pairs)
    }
    if (search(0, 0)) return { ids: ids.filter((id) => chosen.has(id)), attempt }
  }
  throw new Error(`No village seeding fits after ${rules.maxAttempts} attempts (seed ${seed})`)
}

/** The starting garrison of a hex (Ch 6 garrison table, A-17). */
function startingGarrison(slot: Slot, owner: Owner, village: boolean): number {
  if (!inClaimableRings(slot.ring) || FIXED_KINDS.has(slot.kind) || owner === 'player') return 0
  const b = base(slot.ring)
  if (slot.kind === 'lairMouth') return b * RULES.combat.strength.mythic
  if (owner !== 'neutral') return b * RULES.land.rivalGarrisonMult[owner]
  return b * (village ? RULES.land.garrison.villageMilitia : RULES.land.garrison.beasts)
}

/**
 * The map at the founding (Ch 3): geometry, kinds, `land` and `road` tags, starting owners
 * (A-14, A-15), starting garrisons, villages and their loyalty, fortification 0.
 * The same seed always builds the same map.
 */
export function buildMap(seed: number): HexState[] {
  const villages = new Set(seedVillages(seed).ids)
  return layout().map((slot) => {
    const id = hexId(slot.q, slot.r)
    let owner: Owner = 'neutral'
    if (slot.kind === 'castle' || slot.kind === 'building') owner = 'player'
    else if (slot.rival) owner = slot.rival // lairs and battlefields have none: nobody ever holds them

    const hex: HexState = {
      id,
      q: slot.q,
      r: slot.r,
      ring: slot.ring,
      kind: slot.kind,
      owner,
      garrison: 0,
      garrisonDamage: 0,
      fortification: 0,
      status: 'held'
    }
    const isVillage = slot.rivalVillage === true || villages.has(id)
    if (isVillage) {
      const perRing = owner === 'neutral' ? RULES.influence.loyalty.neutralPerRing : RULES.influence.loyalty.rivalPerRing
      hex.village = { loyalty: perRing * slot.ring }
    }
    hex.garrison = startingGarrison(slot, owner, isVillage)
    if (slot.land) hex.land = slot.land
    if (slot.road) hex.road = slot.road
    if (slot.kind === 'lairMouth') hex.mythic = true
    return hex
  })
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** The hexes by id, for the queries below when a caller asks many of them at once. */
export type HexIndex = ReadonlyMap<string, HexState>

export function hexIndex(hexes: readonly HexState[]): HexIndex {
  return new Map(hexes.map((h) => [h.id, h]))
}

function find(hexes: readonly HexState[], id: string): HexState {
  const hex = hexes.find((h) => h.id === id)
  if (!hex) throw new RangeError(`No hex "${id}" on the map`)
  return hex
}

/** Whether any hex touching `id` belongs to `owner`. */
export function touches(byId: HexIndex, id: string, owner: Owner): boolean {
  return neighbors(id).some((n) => byId.get(n)?.owner === owner)
}

/** `touches` for a one-off question. */
export function touchesOwner(hexes: readonly HexState[], id: string, owner: Owner): boolean {
  return touches(hexIndex(hexes), id, owner)
}

function onBorder(byId: HexIndex, hex: HexState): boolean {
  return neighbors(hex.id).some((n) => {
    const other = byId.get(n)
    return other !== undefined && other.owner !== hex.owner
  })
}

/**
 * Whether `id` is one of `owner`'s border hexes: held by `owner` and touching a hex someone else
 * holds (or nobody does). Callers that need a ring limit, such as threat targeting, apply it.
 */
export function isBorderHex(hexes: readonly HexState[], id: string, owner: Owner): boolean {
  const byId = hexIndex(hexes)
  const hex = byId.get(id)
  return hex !== undefined && hex.owner === owner && onBorder(byId, hex)
}

/** Every border hex `owner` holds, in map order. */
export function borderHexesOf(hexes: readonly HexState[], owner: Owner): HexState[] {
  const byId = hexIndex(hexes)
  return hexes.filter((h) => h.owner === owner && onBorder(byId, h))
}

/** The ids of every border hex `owner` holds, in map order. */
export function borderHexes(hexes: readonly HexState[], owner: Owner): string[] {
  return borderHexesOf(hexes, owner).map((h) => h.id)
}

/** The hexes of `from` nearest (by hex distance) to any of `to`: one, or several when tied. Empty when `to` is. */
export function nearestTo(from: readonly HexState[], to: readonly (string | Axial)[]): HexState[] {
  if (to.length === 0) return []
  const distance = (h: HexState): number => Math.min(...to.map((t) => hexDistance(h, t)))
  const nearest = Math.min(...from.map(distance))
  return from.filter((h) => distance(h) === nearest)
}

/**
 * What one hex gives each building in Dominion, whoever holds it (Ch 3 rule 3): a road hex in rings
 * 1 to 5 gives its building 2 × ring; a between-land hex gives ring to each of its two buildings.
 * The castle, the buildings and the Rim give nothing.
 */
export function dominionOf(hex: Pick<HexState, 'ring' | 'kind' | 'road' | 'land'>): Partial<Record<BuildingId, number>> {
  if (!isClaimableKind(hex)) return {}
  if (hex.road) return { [hex.road]: RULES.map.dominion.roadPerRing * hex.ring }
  if (!hex.land) return {}
  const out: Partial<Record<BuildingId, number>> = {}
  for (const b of LAND_BUILDINGS[hex.land]) out[b] = RULES.map.dominion.betweenPerRing * hex.ring
  return out
}

/** Dominion (Ch 3 rule 3): what every hex `owner` holds gives each building (`dominionOf`), summed. */
export function dominion(hexes: readonly HexState[], owner: Owner): Record<BuildingId, number> {
  const out: Record<BuildingId, number> = { barracks: 0, merchantHall: 0, mageTower: 0, foundry: 0 }
  for (const h of hexes) {
    if (h.owner !== owner) continue
    for (const [b, v] of Object.entries(dominionOf(h)) as [BuildingId, number][]) out[b] += v
  }
  return out
}

/** Where `building`'s Dominion comes from: each hex `owner` holds that gives it some, with how much, in map order. */
export function dominionSources(hexes: readonly HexState[], owner: Owner, building: BuildingId): { hexId: string; value: number }[] {
  return hexes.flatMap((h) => {
    const value = h.owner === owner ? dominionOf(h)[building] : undefined
    return value ? [{ hexId: h.id, value }] : []
  })
}

export type ClaimMethod = 'assault' | 'court' | 'buy' | 'rivalExpand'

/**
 * Whether `claimant` may try to take hex `id` by `method` today, by the rules of the map alone
 * (Ch 3, Ch 6, A-13 to A-16, A-23, A-25). Costs, slots, Respect, deal cooldowns and the like
 * belong to the systems that use this.
 *
 * - Always: the hex is claimable (rings 1 to 5, not the castle or a building), someone else holds
 *   it, and it touches land the claimant holds (rule 1).
 * - Never: a Rim hex or a capital (rules 4 and 6), a Lair Mouth (rule 5: Grand Battle only), or,
 *   for a rival, any hex in rings 0 to 2 (rule 2, A-15).
 * - `assault`: not a Gate (A-16).
 * - `court`: villages only; rivals never court the player's villages (A-23).
 * - `buy`: the player buys an adjacent rival hex that is not a Gate (Ch 6 trade table).
 * - `rivalExpand`: a rival's weekly expansion into a neutral den or village (A-25).
 */
export function claimableBy(hexes: readonly HexState[], id: string, claimant: Owner, method: ClaimMethod): boolean {
  const hex = find(hexes, id)
  if (claimant === 'neutral') return false
  if (!isClaimableKind(hex) || hex.kind === 'lairMouth') return false
  if (hex.owner === claimant) return false
  if (claimant !== 'player' && hex.ring <= RULES.land.protectedThroughRing) return false
  if (!touchesOwner(hexes, id, claimant)) return false

  switch (method) {
    case 'assault':
      return hex.kind !== 'gate'
    case 'court':
      if (!hex.village) return false
      return claimant === 'player' || hex.owner !== 'player'
    case 'buy':
      return claimant === 'player' && hex.owner !== 'neutral' && hex.kind !== 'gate'
    case 'rivalExpand':
      return claimant !== 'player' && hex.owner === 'neutral'
  }
}

// ── The Rim fronts ───────────────────────────────────────────────────────────

export interface FrontInfo {
  front: FrontId
  rivals: [RivalId, RivalId]
  /** The front's battlefield hex ids, clockwise. */
  battlefields: string[]
}

/** The four Rim fronts (Ch 12) with their two rivals and battlefields. A front's battlefields lie in the between-land of the same name. */
export function fronts(): FrontInfo[] {
  const rim = layout().filter((s) => s.ring === RIM_RING && s.kind === 'battlefield')
  return CODEX.fronts.map((f) => ({
    front: f.id,
    rivals: [f.rivals[0], f.rivals[1]],
    battlefields: rim.filter((s) => s.land === f.id).map((s) => hexId(s.q, s.r))
  }))
}

/** The lair a Rim hex or Lair Mouth belongs to, by side. */
export function lairOf(hex: Pick<HexState, 'kind' | 'land'>): string | undefined {
  if (hex.kind !== 'lair' && hex.kind !== 'lairMouth') return undefined
  return CODEX.lairs.find((l) => l.land === hex.land)?.id
}

/** Each rival's capital id. */
export function capitals(hexes: readonly HexState[]): Record<RivalId, string> {
  const out = {} as Record<RivalId, string>
  for (const rv of RIVAL_IDS) {
    const cap = hexes.find((h) => h.kind === 'capital' && h.road && rivalOfRoad(h.road) === rv)
    if (!cap) throw new Error(`No capital for ${rv}`)
    out[rv] = cap.id
  }
  return out
}
