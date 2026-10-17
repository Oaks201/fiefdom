/**
 * The realm map (Ch 3, rebuilt by D-16): the heartland (rings 0 to 2, as Ch 3 built it) and, beyond
 * it, four rival marches and two lair wedges; who holds what at the founding, seeded villages,
 * seams, adjacency, borders and each hex's strength, band and path shares. Every later system asks
 * this module where things are and who owns them.
 *
 * Geometry (axial coordinates, as T03 wrote them out): `ring` is the hex distance from the castle at
 * (0, 0); on screen `r` grows downward. The six corner rays are, clockwise from the NW: the Orc's
 * road (Barracks), the Goblin's (Merchant Hall), the Thornwild's ray (E), the Dwarf's road
 * (Foundry), the Archmage's (Mage Tower) and the Wyrmfells' ray (W).
 *
 * Beyond the heartland every hex has a depth, ring − 2 (C-02):
 * - A **rival march** is, on each ring from 3 to 14, the hexes within 2 positions of that rival's
 *   corner: rows of 5, depths 1 to 12, its road down the middle, its Gate at depth 12. Its capital
 *   and the realm hexes beside it are on ring 15, where nobody claims anything.
 * - A **lair wedge** fills the gap between its two rival marches: on each ring from 3 to 7, the
 *   hexes within ring − 3 positions of the lair's corner (rows of 1, 3, 5, 7 and 9), its Lair Mouth
 *   at depth 5 on the corner, its lair hexes on ring 8.
 * - **Seams** (P2-04, P2-05): the hexes near home within 2 of two rival corners (the Orc and the
 *   Goblin, the Dwarf and the Archmage), and each wedge's edge hexes from depth 2, along a rival
 *   march. A seam counts half for each side; each dawn a draw picks whose rules apply.
 * - Everything else is empty board: on screen only (C-05).
 *
 * Patch 5 (D-37): the marches bend as they run out. Beyond the heartland each ring of this layout turns
 * clockwise a step every three rings (`bendShift`), so a hex keeps its march, seam, lane, kind and name
 * and only its position moves; "on each ring" above means on its straight ring. A hex's id on the
 * straight layout (`straightId`) keys its seeded draws (C-54) and the migration of older saves (D-38).
 *
 * Changing owners over time is the war's job (combat, land, rivals); this module builds and reads.
 */
import { CODEX } from './codex'
import { RULES, base } from './rules'
import { draw, stream } from './rng'
import { LAIR_IDS, RIVAL_IDS, type BuildingId, type FrontId, type HexKind, type HexState, type ISODate, type LairId, type Land, type MarchId, type Owner, type RivalId } from './types'

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
 * The between-land of the heartland's edge hexes after each clockwise corner (side i runs from
 * corner i to corner i + 1): NW→NE North, NE→E and E→SE East, SE→SW South, SW→W and W→NW West.
 */
const LAND_OF_SIDE: readonly Land[] = ['north', 'east', 'east', 'south', 'west', 'west']

/** The two buildings each between-land lies between. */
export const LAND_BUILDINGS: Readonly<Record<Land, readonly [BuildingId, BuildingId]>> = Object.freeze({
  north: ['barracks', 'merchantHall'],
  south: ['mageTower', 'foundry'],
  west: ['barracks', 'mageTower'],
  east: ['merchantHall', 'foundry']
})

const M = RULES.map
/** The heartland's outer ring (D-16): rings 0 to 2 lie in no march. */
const HEARTLAND = M.heartlandRings
/** Rival marches: depth 1 is ring 3; the Gate is at depth `marchDepth`; the capital and realm one ring beyond. */
const GATE_RING = HEARTLAND + M.marchDepth
const RIM_RING = GATE_RING + 1
/** Lair wedges: the Lair Mouth at depth `lairDepth`; the lair hexes one ring beyond. */
const MOUTH_RING = HEARTLAND + M.lairDepth
const LAIR_RIM_RING = MOUTH_RING + 1
/** The outermost ring with map hexes. */
export const MAP_RADIUS = RIM_RING

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

const NAME_OF = new Map(CODEX.hexes.map((h) => [h.id, h.name]))

/**
 * A hex's place name, as screens and text name it (D-07): "Ashfall", "Caer Emrys". From the codex,
 * themed by the march the hex lies in; the ring label (`hexLabel`) stands in for a hex without one.
 */
export function hexName(hex: string | Axial | HexState): string {
  const id = typeof hex === 'string' ? hex : hexId(hex.q, hex.r)
  return NAME_OF.get(id) ?? hexLabel(hex)
}

/** The rival at the end of a building's road (Barracks → Orc, Merchant Hall → Goblin, …). */
export function rivalOfRoad(road: BuildingId): RivalId {
  const entry = CODEX.rivals.find((rv) => rv.road === road)
  if (!entry) throw new Error(`No rival on the ${road} road`)
  return entry.id
}

// ── Marches (D-16) ───────────────────────────────────────────────────────────

/** The march at the end of each corner ray: a rival's on the four roads, a lair's on the W and E rays. */
function marchOfCorner(dir: Direction): MarchId {
  const road = ROAD_OF_CORNER[dir]
  if (road) return rivalOfRoad(road)
  const lair = CODEX.lairs.find((l) => l.land === LAND_OF_LAIR_CORNER[dir])
  if (!lair || !(LAIR_IDS as readonly string[]).includes(lair.id)) throw new Error(`No lair on the ${dir} ray`)
  return lair.id as LairId
}

const CORNER_OF = new Map<MarchId, number>(CLOCKWISE_CORNERS.map((d, i) => [marchOfCorner(d), i]))

/** Whether a march is a lair's wedge. */
export function isLairMarch(march: MarchId | undefined): march is LairId {
  return march !== undefined && (LAIR_IDS as readonly string[]).includes(march)
}

/** The two rivals whose marches flank a lair's wedge, clockwise (the Wyrmfells: the Archmage and the Orc). */
export function lairNeighbors(lair: LairId): [RivalId, RivalId] {
  const i = CORNER_OF.get(lair) as number
  const n = CLOCKWISE_CORNERS.length
  return [marchOfCorner(CLOCKWISE_CORNERS[(i + n - 1) % n]) as RivalId, marchOfCorner(CLOCKWISE_CORNERS[(i + 1) % n]) as RivalId]
}

/** How far position p on ring k lies from a corner, along the ring. */
function offsetFrom(k: number, p: number, corner: number): number {
  const size = k * CLOCKWISE_CORNERS.length
  const d = Math.abs(p - corner * k) % size
  return Math.min(d, size - d)
}

/** Whether two marches lie side by side around the castle, so their border has its own art (D-09). */
export function marchesBorder(a: MarchId, b: MarchId): boolean {
  const n = CLOCKWISE_CORNERS.length
  const d = ((CORNER_OF.get(b) as number) - (CORNER_OF.get(a) as number) + n) % n
  return d === 1 || d === n - 1
}

/** Two marches in clockwise order around the castle (for border art: `orc-goblin`, `wyrmfells-orc`). */
export function clockwisePair(a: MarchId, b: MarchId): [MarchId, MarchId] {
  const ia = CORNER_OF.get(a) as number
  const ib = CORNER_OF.get(b) as number
  return (ib - ia + CLOCKWISE_CORNERS.length) % CLOCKWISE_CORNERS.length === 1 ? [a, b] : [b, a]
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
  march?: MarchId
  seam?: MarchId
  /** The rival who holds this at the founding: its capital, realm, Gate and the outer third of its march. */
  rival?: RivalId
}

/** The heartland's layout (rings 0 to 2), exactly as Ch 3 built it. */
function heartlandSlot(k: number, p: number, at: Axial): Slot {
  const slot: Slot = { q: at.q, r: at.r, ring: k, kind: 'between' }
  if (k === 0) return { ...slot, kind: 'castle' }
  const side = Math.floor(p / k)
  const corner = CLOCKWISE_CORNERS[side]
  if (p % k === 0) {
    const road = ROAD_OF_CORNER[corner]
    if (road) slot.road = road
    else slot.land = LAND_OF_LAIR_CORNER[corner]
  } else {
    slot.land = LAND_OF_SIDE[side]
  }
  if (slot.road) slot.kind = k === 1 ? 'building' : 'road'
  return slot
}

/** The layout of the ring-k hex at clockwise position p, or null when it is empty board. */
function slotAt(k: number, p: number, at: Axial): Slot | null {
  if (k <= HEARTLAND) return heartlandSlot(k, p, at)
  const base = { q: at.q, r: at.r, ring: k }
  const rivals = RIVAL_IDS.map((rival) => ({ rival, off: offsetFrom(k, p, CORNER_OF.get(rival) as number) }))

  if (k <= GATE_RING) {
    const hits = rivals.filter((x) => x.off <= M.marchHalfWidth)
    if (hits.length > 0) {
      // The nearer corner leads; halfway, the corner whose side this is (clockwise first).
      const here = marchOfCorner(CLOCKWISE_CORNERS[Math.floor(p / k)])
      hits.sort((a, b) => a.off - b.off || (a.rival === here ? -1 : b.rival === here ? 1 : 0))
      const [first, second] = hits
      const slot: Slot = { ...base, kind: 'between', march: first.rival }
      if (second) slot.seam = second.rival
      if (first.off === 0) {
        slot.road = CODEX.rivals.find((rv) => rv.id === first.rival)?.road
        slot.kind = k === GATE_RING ? 'gate' : 'road'
      }
      if (k - HEARTLAND >= M.rivalHeldFromDepth) slot.rival = first.rival
      return slot
    }
  }
  if (k === RIM_RING) {
    const near = rivals.find((x) => x.off <= 1)
    if (near) {
      const slot: Slot = { ...base, kind: near.off === 0 ? 'capital' : 'realm', march: near.rival, rival: near.rival }
      if (near.off === 0) slot.road = CODEX.rivals.find((rv) => rv.id === near.rival)?.road
      return slot
    }
  }
  for (const lair of LAIR_IDS) {
    const corner = CORNER_OF.get(lair) as number
    const off = offsetFrom(k, p, corner)
    const land = LAND_OF_LAIR_CORNER[CLOCKWISE_CORNERS[corner]]
    if (k <= MOUTH_RING && off <= k - (HEARTLAND + 1)) {
      const slot: Slot = { ...base, kind: k === MOUTH_RING && off === 0 ? 'lairMouth' : 'between', march: lair, ...(land ? { land } : {}) }
      // A wedge's edge from depth 2 runs along a rival march: a flank seam (the neck at depth 1 touches both, C-03).
      if (off === k - (HEARTLAND + 1) && k > HEARTLAND + 1) {
        const size = k * CLOCKWISE_CORNERS.length
        const clockwise = (p - corner * k + size) % size <= size / 2
        const [before, after] = lairNeighbors(lair)
        slot.seam = clockwise ? after : before
      }
      return slot
    }
    if (k === LAIR_RIM_RING && off <= 1) return { ...base, kind: 'lair', march: lair, ...(land ? { land } : {}) }
  }
  return null
}

/**
 * Patch 5 (D-37, P5-06): how many positions clockwise ring k turns as the marches bend. The heartland
 * never turns; beyond it, a step every `RULES.map.bend.everyRings` rings.
 */
export function bendShift(k: number): number {
  const b = M.bend
  return k <= b.fromRing ? 0 : Math.floor((k - b.fromRing) / b.everyRings)
}

/** Each hex's layout, with its position on the straight ring (before the bend) and its id there. */
interface Placed {
  slot: Slot
  /** Its clockwise position on the straight ring, from the ring's NW corner. */
  straight: number
  /** Its id on the straight layout: the stable key of its seeded draws (C-54) and the bend migration's source (D-38). */
  straightId: string
}

/**
 * Every hex's layout, castle first, then ring by ring clockwise from each NW corner of the straight
 * layout (map order, C-55). Each slot is laid out on its straight position, as D-16 built it, and only
 * its coordinates come from the position `bendShift(k)` steps further clockwise (D-37): a hex keeps its
 * march, seam, lane and kind, and only where it sits moves.
 */
const PLACED: readonly Placed[] = (() => {
  const out: Placed[] = []
  for (let k = 0; k <= MAP_RADIUS; k++) {
    const ring = ringHexes(k)
    ring.forEach((at, p) => {
      const bent = ring[(p + bendShift(k)) % ring.length]
      const slot = slotAt(k, p, bent)
      if (slot) out.push({ slot, straight: p, straightId: hexId(at.q, at.r) })
    })
  }
  return out
})()

const LAYOUT: readonly Slot[] = PLACED.map((x) => x.slot)

const SLOT_OF = new Map(LAYOUT.map((s) => [hexId(s.q, s.r), s]))

const PLACED_OF = new Map(PLACED.map((x) => [hexId(x.slot.q, x.slot.r), x]))

/** A map hex's id on the straight layout (C-54): the stable key of every seeded draw read again for a day already played. */
export function straightId(id: string): string {
  return PLACED_OF.get(id)?.straightId ?? id
}

/** D-38: each hex's id on the straight layout, to its id on the bent map (only the hexes the bend moves). */
export function bentIds(): ReadonlyMap<string, string> {
  return new Map(PLACED.filter((x) => x.straightId !== hexId(x.slot.q, x.slot.r)).map((x) => [x.straightId, hexId(x.slot.q, x.slot.r)]))
}

/** Whether a hex id is on the map. */
export function onMap(id: string): boolean {
  return SLOT_OF.has(id)
}

/** The ids of the hexes touching this one, on the map only, in the order E, NE, NW, W, SW, SE. */
export function neighbors(id: string): string[] {
  const { q, r } = parseHexId(id)
  const out: string[] = []
  for (const d of Object.values(DIRECTIONS)) {
    const n = hexId(q + d.q, r + d.r)
    if (SLOT_OF.has(n)) out.push(n)
  }
  return out
}

/**
 * The march a hex lies in and, for a seam, the second (D-16), clockwise: `['orc', 'goblin']`,
 * `['wyrmfells', 'orc']`. The art follows it (D-09). A heartland hex, or empty board, lies in none.
 */
export function regionsOf(hex: string | Axial): MarchId[] {
  const at = toAxial(hex)
  const slot = SLOT_OF.get(hexId(at.q, at.r))
  if (!slot?.march) return []
  return slot.seam ? clockwisePair(slot.march, slot.seam) : [slot.march]
}

/** The kinds that can never change hands by any method in this module. */
const FIXED_KINDS: ReadonlySet<HexKind> = new Set<HexKind>(['castle', 'building', 'capital', 'realm', 'lair', 'battlefield'])

/** The claimable hexes: rings 1 and beyond, minus the castle, the buildings, capitals, realms and lairs. */
export function isClaimableKind(hex: Pick<HexState, 'ring' | 'kind'>): boolean {
  return hex.ring >= 1 && !FIXED_KINDS.has(hex.kind)
}

/** The day seeded map draws use: the map depends on the seed alone, never on the founding date. */
const MAP_DRAW_DAY: ISODate = '0000-01-01'

// ── Depth, bands and strength (D-17) ─────────────────────────────────────────

/** A hex's depth beyond the heartland: ring − 2 (0 in the heartland). */
export function depthOf(hex: Pick<HexState, 'ring'>): number {
  return Math.max(0, hex.ring - HEARTLAND)
}

/**
 * A hex's band, 1 to 5, for everything that once scaled with its ring (D-17): the heartland's ring,
 * then a band every 4 depths of a rival march (3, 4, 5) and every 2 of a lair's wedge.
 */
export function bandOf(hex: Pick<HexState, 'ring' | 'march'>): number {
  if (hex.ring <= HEARTLAND) return hex.ring
  const per = isLairMarch(hex.march) ? M.bands.lairDepthsPerBand : M.bands.rivalDepthsPerBand
  return Math.min(M.bands.max, HEARTLAND + 1 + Math.floor((depthOf(hex) - 1) / per))
}

/**
 * A hex's strength, fixed at founding (D-17): the heartland's base(ring), the buildings' too (threats
 * strike them); beyond, its march's depth curve with a seeded jitter. The castle and the hexes nobody
 * can claim beyond the heartland have none.
 */
function strengthOf(seed: number, id: string, slot: Slot): number {
  if (slot.ring <= HEARTLAND) return slot.ring >= 1 ? base(slot.ring) : 0
  if (!isClaimableKind(slot)) return 0
  const c = RULES.land.depthCurve
  const curve = isLairMarch(slot.march) ? c.lair : c.rival
  const jitter = 1 + c.jitter * (2 * draw(seed, MAP_DRAW_DAY, `strength:${straightId(id)}`) - 1)
  return curve.first * depthOf(slot) ** curve.exponent * jitter
}

/** The wilds' strength on a hex (D-15, D-17): its own strength, which every garrison and threat there scales with. */
export function wildBase(hex: Pick<HexState, 'strength'>): number {
  return hex.strength
}

/** A neutral hex's garrison (Ch 6, D-15): beasts hold 0.9 of its strength, a village's militia 0.6. */
export function wildGarrison(hex: Pick<HexState, 'strength'>, village: boolean): number {
  return wildBase(hex) * (village ? RULES.land.garrison.villageMilitia : RULES.land.garrison.beasts)
}

// ── Path shares (D-18) ───────────────────────────────────────────────────────

export type Shares = Partial<Record<RivalId, number>>

/** A march's paths: a rival's own, or a lair's two neighbors half each. */
export function marchShares(march: MarchId): Shares {
  if (!isLairMarch(march)) return { [march]: 1 }
  const [a, b] = lairNeighbors(march)
  return { [a]: 1 / 2, [b]: 1 / 2 }
}

function blend(a: Shares, b: Shares): Shares {
  const out: Shares = {}
  for (const r of RIVAL_IDS) {
    const v = ((a[r] ?? 0) + (b[r] ?? 0)) / 2
    if (v > 0) out[r] = v
  }
  return out
}

/**
 * Each rival path's share of a hex (D-18, section 5.1 of the spec), summing to 1 for a claimable hex:
 * a rival march hex is its rival's; a lair's is half each of its two neighbors'; a seam is half each
 * side's. A heartland hex goes to the march it faces (C-04): a corner hex to that corner's, a ring-2
 * side hex half each to the two corners it lies between. Hexes nobody can claim have none.
 */
export function pathShares(hex: Pick<HexState, 'q' | 'r' | 'ring' | 'kind' | 'march' | 'seam'>): Shares {
  if (!isClaimableKind(hex)) return {}
  if (hex.march) return hex.seam ? blend(marchShares(hex.march), marchShares(hex.seam)) : marchShares(hex.march)
  const k = hex.ring
  const p = ringIndex(hex)
  const side = Math.floor(p / k)
  const corner = marchShares(marchOfCorner(CLOCKWISE_CORNERS[side]))
  if (p % k === 0) return corner
  return blend(corner, marchShares(marchOfCorner(CLOCKWISE_CORNERS[(side + 1) % CLOCKWISE_CORNERS.length])))
}

/** What holding a hex adds to Dominion, over all its paths (D-18): its depth, or 1 in the heartland (C-04). */
export function hexWorth(hex: Pick<HexState, 'ring' | 'kind'>): number {
  if (!isClaimableKind(hex)) return 0
  return hex.ring <= HEARTLAND ? RULES.dominion.heartlandHolding : depthOf(hex)
}

// ── Villages (D-16, P2-02) ───────────────────────────────────────────────────

/** Each path's village credit: every village's path shares, summed (A-13, rebuilt by D-16). */
export function villageCredits(hexes: readonly Pick<HexState, 'q' | 'r' | 'ring' | 'kind' | 'march' | 'seam' | 'village'>[]): Record<RivalId, number> {
  const credit = Object.fromEntries(RIVAL_IDS.map((r) => [r, 0])) as Record<RivalId, number>
  for (const h of hexes) {
    if (!h.village) continue
    for (const [r, v] of Object.entries(pathShares(h)) as [RivalId, number][]) credit[r] += v
  }
  return credit
}

/** A group of hexes that must hold `quota` villages; `forced` must be one of them (a Gate). */
interface VillageGroup {
  ids: string[]
  quota: number
  forced?: string
}

/** The village groups (P2-02): the heartland's ring 2, each third of each rival march, each band of each lair's wedge. */
function villageGroups(): VillageGroup[] {
  const v = M.villages
  const groups: VillageGroup[] = []
  const claimable = LAYOUT.filter((s) => isClaimableKind(s) && s.kind !== 'lairMouth')
  groups.push({ ids: claimable.filter((s) => s.ring === HEARTLAND).map((s) => hexId(s.q, s.r)), quota: v.heartland })
  const thirds = M.marchDepth / M.bands.rivalDepthsPerBand
  for (const rival of RIVAL_IDS) {
    for (let t = 0; t < thirds; t++) {
      const from = t * M.bands.rivalDepthsPerBand + 1
      const slots = claimable.filter((s) => s.march === rival && depthOf(s) >= from && depthOf(s) < from + M.bands.rivalDepthsPerBand)
      const gate = slots.find((s) => s.kind === 'gate')
      groups.push({ ids: slots.map((s) => hexId(s.q, s.r)), quota: v.perRivalThird, ...(gate ? { forced: hexId(gate.q, gate.r) } : {}) })
    }
  }
  for (const lair of LAIR_IDS) {
    for (let from = 1; from <= M.lairDepth; from += M.bands.lairDepthsPerBand) {
      const slots = claimable.filter((s) => s.march === lair && depthOf(s) >= from && depthOf(s) < from + M.bands.lairDepthsPerBand)
      groups.push({ ids: slots.map((s) => hexId(s.q, s.r)), quota: Math.min(v.perLairBand, slots.length) })
    }
  }
  return groups
}

/** The result of seeding villages: the chosen hex ids and which attempt found them. */
export interface VillageSeeding {
  ids: string[]
  attempt: number
}

const seedings = new Map<number, VillageSeeding>()

/** How many pairs of the given hexes touch. */
export function touchingPairs(ids: readonly string[]): number {
  const set = new Set(ids)
  return ids.reduce((n, id) => n + neighbors(id).filter((x) => set.has(x)).length, 0) / 2
}

/**
 * Seeds the villages (P2-02): each group's quota, the Gates included. No two villages of a group
 * touch; across groups at most `maxTouchingPairs` pairs do; every path's credit is within
 * `maxCreditSpread` of the others'. Each attempt draws from the stream `villages:<attempt>` and fills
 * the groups in order, each from its own shuffled hexes, apart from every village where it can and
 * from its own group's always; an attempt that can't fill a group, or misses a limit, is dropped.
 */
export function seedVillages(seed: number): VillageSeeding {
  const known = seedings.get(seed)
  if (known) return known
  const v = M.villages
  const groups = villageGroups()
  for (let attempt = 0; attempt < v.maxAttempts; attempt++) {
    const draws = stream(seed, MAP_DRAW_DAY, `villages:${attempt}`)
    const chosen = new Set<string>()
    const touching = (id: string, among: ReadonlySet<string>): boolean => neighbors(id).some((n) => among.has(n))
    let ok = true
    for (const g of groups) {
      const mine = new Set<string>()
      const take = (id: string): void => {
        chosen.add(id)
        mine.add(id)
      }
      if (g.forced) take(g.forced)
      const order = draws.shuffle(g.ids.filter((id) => id !== g.forced))
      // Apart from every village first; then apart from this group's own, touching a neighbor group's if it must.
      for (const pass of [chosen, mine]) {
        for (const id of order) {
          if (mine.size >= g.quota) break
          if (!chosen.has(id) && !touching(id, pass)) take(id)
        }
      }
      if (mine.size < g.quota) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const placed = [...chosen].map((id) => ({ ...(SLOT_OF.get(id) as Slot), village: { loyalty: 0 } }))
    const credit = Object.values(villageCredits(placed))
    if (Math.max(...credit) - Math.min(...credit) > v.maxCreditSpread) continue
    if (touchingPairs([...chosen]) > v.maxTouchingPairs) continue
    const out = { ids: LAYOUT.map((s) => hexId(s.q, s.r)).filter((id) => chosen.has(id)), attempt }
    seedings.set(seed, out)
    return out
  }
  throw new Error(`No village seeding fits after ${v.maxAttempts} attempts (seed ${seed})`)
}

/** The starting garrison of a hex (Ch 6 garrison table, A-17; D-17's strength). */
function startingGarrison(slot: Slot, strength: number, owner: Owner, village: boolean): number {
  if (!isClaimableKind(slot) || owner === 'player') return 0
  if (slot.kind === 'lairMouth') return strength * RULES.combat.strength.mythic
  if (owner !== 'neutral') return strength * RULES.land.rivalGarrisonMult[owner]
  return wildGarrison({ strength }, village)
}

/**
 * The map at the founding (D-16): geometry, kinds, marches and seams, `land` and `road` tags,
 * starting owners (the outer third of each rival march is the rival's, P2-01), each hex's strength
 * and starting garrison (P2-03: unfortified), villages and their loyalty.
 * The same seed always builds the same map.
 */
export function buildMap(seed: number): HexState[] {
  const villages = new Set(seedVillages(seed).ids)
  return LAYOUT.map((slot) => {
    const id = hexId(slot.q, slot.r)
    let owner: Owner = 'neutral'
    if (slot.kind === 'castle' || slot.kind === 'building') owner = 'player'
    else if (slot.rival) owner = slot.rival // lairs have none: nobody ever holds them
    const strength = strengthOf(seed, id, slot)
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
      status: 'held',
      strength
    }
    if (slot.march) hex.march = slot.march
    if (slot.seam) hex.seam = slot.seam
    const isVillage = villages.has(id)
    if (isVillage) {
      const perBand = owner === 'neutral' ? RULES.influence.loyalty.neutralPerRing : RULES.influence.loyalty.rivalPerRing
      hex.village = { loyalty: perBand * bandOf(slot) }
    }
    hex.garrison = startingGarrison(slot, strength, owner, isVillage)
    if (slot.land) hex.land = slot.land
    if (slot.road) hex.road = slot.road
    if (slot.kind === 'lairMouth') hex.mythic = true
    return hex
  })
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** The hexes by id, for the queries below when a caller asks many of them at once. */
export type HexIndex = ReadonlyMap<string, HexState>

const indexes = new WeakMap<readonly HexState[], HexIndex>()

/** The hexes by id. The index of a given hexes array is built once and kept while the array lives. */
export function hexIndex(hexes: readonly HexState[]): HexIndex {
  let byId = indexes.get(hexes)
  if (!byId) {
    byId = new Map(hexes.map((h) => [h.id, h]))
    indexes.set(hexes, byId)
  }
  return byId
}

function find(hexes: readonly HexState[], id: string): HexState {
  const hex = hexIndex(hexes).get(id)
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

export type ClaimMethod = 'assault' | 'court' | 'buy' | 'rivalExpand'

/**
 * Whether `claimant` may try to take hex `id` by `method` today, by the rules of the map alone
 * (Ch 3, Ch 6, A-13 to A-16, A-23, A-25). Costs, slots, Respect, deal cooldowns and the like
 * belong to the systems that use this.
 *
 * - Always: the hex is claimable (not the castle, a building, a capital, realm or lair hex),
 *   someone else holds it, and it touches land the claimant holds (rule 1).
 * - Never: a capital, realm or lair hex (rules 4 and 6), a Lair Mouth (rule 5: Grand Battle only),
 *   or, for a rival, any hex in rings 0 to 2 (rule 2, A-15).
 * - `assault`: not a Gate (A-16); for the player, not a hex a standing stronghold bars (P3-01, D-23).
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
      return hex.kind !== 'gate' && (claimant !== 'player' || strongholdBarring(hexes, id) === undefined)
    case 'court':
      if (!hex.village) return false
      return claimant === 'player' || hex.owner !== 'player'
    case 'buy':
      return claimant === 'player' && hex.owner !== 'neutral' && hex.kind !== 'gate'
    case 'rivalExpand':
      return claimant !== 'player' && hex.owner === 'neutral'
  }
}

// ── Strongholds (Patch 3, D-23; P3-01) ───────────────────────────────────────

/** Each march hex by id, with its clockwise position on its straight ring (from its NW corner): its lane, which the bend never moves (C-57). */
const POSITION_OF: ReadonlyMap<string, number> = new Map(PLACED.filter((x) => x.slot.ring > HEARTLAND).map((x) => [hexId(x.slot.q, x.slot.r), x.straight]))

const strongholdCache = new WeakMap<readonly HexState[], ReadonlyMap<string, { march: RivalId; depth: number }>>()

/**
 * The strongholds (P3-01): in each rival march, at each depth of `RULES.sieges.stronghold.depths`,
 * the road hex of that row, or when it is a village the non-village hex nearest the road in the row
 * (ties clockwise). Never a seam; none in a lair's wedge. Derived from the map (road tags and
 * village flags, which never change), so a campaign founded before Patch 3 has them at once. By id,
 * with the march and depth of each.
 */
export function strongholds(hexes: readonly HexState[]): ReadonlyMap<string, { march: RivalId; depth: number }> {
  const known = strongholdCache.get(hexes)
  if (known) return known
  const out = new Map<string, { march: RivalId; depth: number }>()
  for (const rival of RIVAL_IDS) {
    const corner = CORNER_OF.get(rival) as number
    for (const depth of RULES.sieges.stronghold.depths) {
      const k = depth + HEARTLAND
      const size = k * CLOCKWISE_CORNERS.length
      const row = hexes.filter((h) => h.ring === k && h.march === rival && !h.seam && !h.village && (h.kind === 'road' || h.kind === 'between'))
      const place = (h: HexState): { off: number; clockwise: number } => {
        const p = POSITION_OF.get(h.id) as number
        return { off: offsetFrom(k, p, corner), clockwise: (p - corner * k + size) % size }
      }
      const pick = row.sort((a, b) => place(a).off - place(b).off || place(a).clockwise - place(b).clockwise)[0]
      if (pick) out.set(pick.id, { march: rival, depth })
    }
  }
  strongholdCache.set(hexes, out)
  return out
}

/** Whether hex `id` is a stronghold. */
export function isStronghold(hexes: readonly HexState[], id: string): boolean {
  return strongholds(hexes).has(id)
}

/**
 * The stronghold that bars the player's assault on hex `id` (P3-01), or undefined: a stronghold of
 * the march `id` lies in, shallower than it, that the player does not hold. Seams (they lie in two
 * marches) and lair wedges are never barred.
 */
export function strongholdBarring(hexes: readonly HexState[], id: string): string | undefined {
  const hex = hexIndex(hexes).get(id)
  if (!hex?.march || hex.seam || isLairMarch(hex.march)) return undefined
  const depth = depthOf(hex)
  const byId = hexIndex(hexes)
  let barring: { id: string; depth: number } | undefined
  for (const [sid, s] of strongholds(hexes)) {
    if (s.march !== hex.march || s.depth >= depth || byId.get(sid)?.owner === 'player') continue
    if (!barring || s.depth < barring.depth) barring = { id: sid, depth: s.depth }
  }
  return barring?.id
}

// ── Seams (P2-04 to P2-06) ───────────────────────────────────────────────────

/**
 * Whose march rules apply on a hex on `day` (P2-06): its march, or for a seam one of its two,
 * drawn each dawn from the campaign seed (`seam:<id>`, its straight-layout id, C-54: the bend never
 * changes a day already played). A heartland hex has none.
 */
export function rulingMarch(seed: number, hex: Pick<HexState, 'id' | 'march' | 'seam'>, day: ISODate): MarchId | undefined {
  if (!hex.march || !hex.seam) return hex.march
  return draw(seed, day, `seam:${straightId(hex.id)}`) < M.seamFirstChance ? hex.march : hex.seam
}

// ── The Rim fronts ───────────────────────────────────────────────────────────

export interface FrontInfo {
  front: FrontId
  rivals: [RivalId, RivalId]
}

/** The four rival-against-rival fronts (Ch 12; abstract weekly rolls since R-26) with their two rivals. */
export function fronts(): FrontInfo[] {
  return CODEX.fronts.map((f) => ({ front: f.id, rivals: [f.rivals[0], f.rivals[1]] }))
}

/** The lair a lair hex or Lair Mouth belongs to. */
export function lairOf(hex: Pick<HexState, 'kind' | 'land'>): string | undefined {
  if (hex.kind !== 'lair' && hex.kind !== 'lairMouth') return undefined
  return CODEX.lairs.find((l) => l.land === hex.land)?.id
}

/** Each rival's capital id. */
export function capitals(hexes: readonly HexState[]): Record<RivalId, string> {
  const out = {} as Record<RivalId, string>
  for (const rv of RIVAL_IDS) {
    const cap = hexes.find((h) => h.kind === 'capital' && h.march === rv)
    if (!cap) throw new Error(`No capital for ${rv}`)
    out[rv] = cap.id
  }
  return out
}
