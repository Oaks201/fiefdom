/**
 * View models for the Realm page (T15; Ch 3, Ch 6, Ch 7, Ch 8, Ch 10): the hex map's layout and
 * what each hex shows, the hex panel with every action the engine allows there, the buildings,
 * castle, Crossings and the Crownguard, and the roster with where each company's power comes from.
 * Pure; components only render. A garrison shows as the exact number an assault must beat (T15 gap
 * 1): no rule hides it.
 */
import { castleOffer, crossingOffer, tierOffer, type Offer } from '../buildings'
import { CODEX } from '../codex'
import { addDays, diffDays } from '../clock'
import { assaultGarrison, combatOf, ordersFor, ordersValidity, siegeIsLive, tidings, type Band } from '../combat'
import { holdingSources, hexWorth, pathRank, pathShares, pathTotals, rankThresholds, renown } from '../dominion'
import { numeral, realmEffects, sourceLabel } from '../effects'
import { balance } from '../economy'
import { bidSways, bribeOffer, goblinBidsOf } from '../goblin'
import { challenge, pendingBattles } from '../grand'
import { bidCheck, fortifyOffer, lostOn, offerDeal, reclaimOffer, resistance, trust } from '../land'
import { MAP_RADIUS, bandOf, clockwisePair, claimableBy, depthOf, fronts, hexDistance, hexId, hexIndex, hexName, isClaimableKind, isStronghold, marchesBorder, onMap, parseHexId, regionsOf, ringHexes, rulingMarch, strongholdBarring } from '../map'
import { preparationOf } from '../marches'
import { greedBand, marchRule, personalitiesOf, surgeOn, type GreedBand } from '../personalities'
import { draw } from '../rng'
import { RULES, byTier } from '../rules'
import { crownguardPower, rosterDetail } from '../roster'
import { reachStanding, stepsBeyond } from '../reach'
import { fallbackOn, flankingMult, standingSiegeOf } from '../sieges'
import { openDayOf, worldOf } from '../state'
import { bendSurge, foreseesSurges } from '../surges'
import { t } from '../text'
import {
  BUILDING_IDS,
  type BuildingId,
  type CampaignState,
  type CompanySource,
  type CrossingId,
  type EffectSourceRef,
  type Effects,
  type FrontId,
  type HexState,
  type ISODate,
  type MarchId,
  type Owner,
  type RivalId,
  type SurgeKind,
  type ThreatKind
} from '../types'
import { wornShare } from './orders'
import { amount, bendRefusalLabel, bribeRefusalLabel, buyRefusalLabel, factor, grandRefusalLabel, landRefusalLabel, orderProblemLabel, requirementLines } from './refusals'
import { realmConsistencyNow, rivalName } from './shell'

const SQRT3 = Math.sqrt(3) // rules-ok: geometry, the width of a pointy-top hex
const ROW = 1.5 // rules-ok: pointy-top hex geometry, rows 3/2 of the side apart
const PERCENT = 100 // rules-ok: shares shown as percentages

// ── The map ──────────────────────────────────────────────────────────────────

export interface HexPoint {
  id: string
  q: number
  r: number
  /** The center, in units of the hex's side. */
  x: number
  y: number
}

/** The center of a pointy-top hex at axial (q, r), in units of its side. */
export function hexCenter(q: number, r: number): { x: number; y: number } {
  return { x: SQRT3 * (q + r / 2), y: ROW * r }
}

/** The width of a pointy-top hex, in units of its side: √3. Neighbors' centers are this far apart. */
export const HEX_WIDTH = SQRT3

/** Every hex's center and the box they fill (with one side of margin), for the SVG's viewBox. */
export function hexLayout(hexes: readonly Pick<HexState, 'id'>[]): { points: HexPoint[]; minX: number; minY: number; width: number; height: number } {
  const points = hexes.map((h) => {
    const { q, r } = parseHexId(h.id)
    return { id: h.id, q, r, ...hexCenter(q, r) }
  })
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - SQRT3
  const minY = Math.min(...ys) - 2
  return { points, minX, minY, width: Math.max(...xs) + SQRT3 - minX, height: Math.max(...ys) + 2 - minY }
}

/** The box the map fills, in units of a hex's side (from `hexLayout`). */
export type MapBox = Pick<ReturnType<typeof hexLayout>, 'minX' | 'minY' | 'width' | 'height'>

/** A 2D affine map as SVG's `matrix(a b c d e f)`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number]

/** A pointy-top hex's corners around its center, in units of its side. */
const HEX_CORNERS = [
  [0, -1],
  [SQRT3 / 2, -1 / 2],
  [SQRT3 / 2, 1 / 2],
  [0, 1],
  [-SQRT3 / 2, 1 / 2],
  [-SQRT3 / 2, -1 / 2]
] as const

/**
 * The tabletop tilt (T15) drawn in plain 2D: the map leans back `angle` radians about the top edge
 * of `frame` and is seen in perspective from `distance` frame-heights away, toward the frame's
 * center. `place(x, y)` is the affine map that matches the perspective at a hex centered there
 * (exact at the center; tests bound the gap between neighbors' shared corners), so the board
 * needs no 3D layer, whose raster Chromium leaves blurred in patches. `box` is the tilted realm's
 * extent, with `margin` sides around it.
 */
export function tiltedBoard(
  points: readonly { x: number; y: number }[],
  frame: MapBox,
  angle: number,
  distance: number,
  margin: number
): { project(x: number, y: number): [number, number]; place(x: number, y: number): Affine; box: MapBox } {
  const midU = frame.width / 2
  const midV = frame.height / 2
  const far = distance * frame.height
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const scaleAt = (v: number): number => far / (far - v * sin)
  const project = (x: number, y: number): [number, number] => {
    const u = x - frame.minX
    const v = y - frame.minY
    const s = scaleAt(v)
    return [frame.minX + midU + (u - midU) * s, frame.minY + midV + (v * cos - midV) * s]
  }
  const place = (x: number, y: number): Affine => {
    const u = x - frame.minX
    const v = y - frame.minY
    const s = scaleAt(v)
    const growth = (s * s * sin) / far
    const [px, py] = project(x, y)
    return [s, 0, (u - midU) * growth, cos * s + (v * cos - midV) * growth, px, py]
  }
  const corners = points.flatMap((p) => HEX_CORNERS.map(([dx, dy]) => project(p.x + dx, p.y + dy)))
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const minX = Math.min(...xs) - margin
  const minY = Math.min(...ys) - margin
  return { project, place, box: { minX, minY, width: Math.max(...xs) + margin - minX, height: Math.max(...ys) + margin - minY } }
}

/** How far the map is zoomed (1 shows the whole box it fills) and the point, in the box's units, at the frame's center. */
export interface MapZoom {
  zoom: number
  cx: number
  cy: number
}

/** A point on the map's frame, as fractions of its width and height (0,0 is the top left). */
export interface FramePoint {
  fx: number
  fy: number
}

/** Below this the zoom is float noise on top of 1 (zooming in and back out by the same steps). */
const ZOOM_NOISE = 1e-6 // rules-ok: float tolerance, not a rule

/** The whole realm, centered. */
export function wholeMap(box: MapBox): MapZoom {
  return { zoom: 1, cx: box.minX + box.width / 2, cy: box.minY + box.height / 2 }
}

/** A zoom between 1 and `maxZoom`, panned no further than the realm's edge. */
export function clampMapZoom(view: MapZoom, box: MapBox, maxZoom: number): MapZoom {
  const zoom = view.zoom < 1 + ZOOM_NOISE ? 1 : Math.min(maxZoom, view.zoom)
  const halfW = box.width / zoom / 2
  const halfH = box.height / zoom / 2
  return {
    zoom,
    cx: Math.min(box.minX + box.width - halfW, Math.max(box.minX + halfW, view.cx)),
    cy: Math.min(box.minY + box.height - halfH, Math.max(box.minY + halfH, view.cy))
  }
}

/** The part of the realm a zoom shows: the SVG's viewBox. It keeps the realm's proportions, so the frame never changes size. */
export function mapViewBox(view: MapZoom, box: MapBox): { x: number; y: number; width: number; height: number } {
  const width = box.width / view.zoom
  const height = box.height / view.zoom
  return { x: view.cx - width / 2, y: view.cy - height / 2, width, height }
}

/** Zooms by `factor`, keeping the map point under `at` where it is on the frame (as a wheel zooms toward the pointer). */
export function zoomMapAt(view: MapZoom, factor: number, at: FramePoint, box: MapBox, maxZoom: number): MapZoom {
  const before = mapViewBox(view, box)
  const x = before.x + at.fx * before.width
  const y = before.y + at.fy * before.height
  const zoom = clampMapZoom({ ...view, zoom: view.zoom * factor }, box, maxZoom).zoom
  const after = mapViewBox({ ...view, zoom }, box)
  return clampMapZoom({ zoom, cx: x + (1 / 2 - at.fx) * after.width, cy: y + (1 / 2 - at.fy) * after.height }, box, maxZoom)
}

/** Pans `start` so the map point that was under `from` on the frame is under `to` (a drag). */
export function panMap(start: MapZoom, from: FramePoint, to: FramePoint, box: MapBox, maxZoom: number): MapZoom {
  const shown = mapViewBox(start, box)
  return clampMapZoom({ ...start, cx: start.cx - (to.fx - from.fx) * shown.width, cy: start.cy - (to.fy - from.fy) * shown.height }, box, maxZoom)
}

/** The art slot of a hex's terrain (Ch 17's hex set). */
export function terrainSlot(hex: Pick<HexState, 'kind' | 'ring' | 'village' | 'ruins'>): string {
  if (hex.ruins) return 'hex.ruins'
  if (hex.village && (hex.kind === 'road' || hex.kind === 'between')) return 'hex.village'
  if (hex.kind === 'between') return hex.ring === 1 ? 'hex.wild' : 'hex.den'
  return `hex.${hex.kind}`
}

/** The shared terrains each region draws in its own look (D-09); the rest keep the shared tile. */
const REGIONAL_TERRAINS = new Set(['hex.road', 'hex.gate', 'hex.realm', 'hex.capital', 'hex.lairMouth', 'hex.lair'])

/**
 * A hex's terrain in its region's own look (D-09), or undefined where the shared tile from
 * `terrainSlot` serves: the heartland, ruins, and the shared kinds a region does not redraw. Wilds
 * are near (bands 3 and 4) or far (band 5, D-17); a seam's village and battlefield blend its two
 * marches (`hex.village.orc-goblin`). Until a regional tile's file exists, the map draws the shared one.
 */
export function regionTerrainSlot(hex: Pick<HexState, 'q' | 'r' | 'kind' | 'ring' | 'village' | 'ruins' | 'march'>): string | undefined {
  const regions = regionsOf(hex)
  if (hex.ruins || regions.length === 0) return undefined
  const shared = terrainSlot(hex)
  const region = regions.join('-')
  if (shared === 'hex.village' || shared === 'hex.battlefield') return `${shared}.${region}`
  if (regions.length > 1) return undefined
  if (shared === 'hex.den') return `hex.wilds.${region}.${bandOf(hex) >= RULES.map.bands.max ? 'far' : 'near'}`
  return REGIONAL_TERRAINS.has(shared) ? `${shared}.${region}` : undefined
}

export interface MapThreat {
  kind: ThreatKind
  rival?: RivalId
  /** Absent under the Veil of Fog. */
  band?: Band
}

export interface MapHex extends HexPoint {
  label: string
  ring: number
  kind: HexState['kind']
  owner: Owner
  slot: string
  /** The terrain in its region's look (D-09), drawn once its file exists; `slot` serves until then. */
  regionSlot?: string
  village?: { loyalty: number }
  fortification: number
  status: HexState['status']
  /** Days a contest or a scorching has left, today included. */
  daysLeft?: number
  mythic?: boolean
  ruins?: boolean
  rebels?: boolean
  /** Today's threats on this hex, as the Herald tells them. */
  threats?: MapThreat[]
  /** One of today's assault targets. */
  target?: boolean
  /** The player courts this village. */
  courting?: boolean
  /** A Grand Battle announced here, and its day. */
  battle?: ISODate
  /** A front's badge on the empty board between its rivals: its state, the war track (−3 to +3, from the first rival's side) and who it favors. */
  front?: { front: FrontId; state: CampaignState['fronts'][FrontId]['state']; track: number; favors?: RivalId }
  /** The march it lies in, and its depth there (D-16). */
  march?: MarchId
  depth?: number
  /** A seam's march ruling today (P2-06). */
  ruling?: MarchId
  /** Its march's preparation level, on a hex the player doesn't hold (D-19). */
  preparation?: number
  /** A siege on it (D-22): its wear as a share of the garrison it wears (0 to 1), and whether it is the standing siege. */
  siege?: { progress: number; standing: boolean }
  /** A stronghold (D-23). */
  stronghold?: boolean
  /** A garrison fallen back here (D-24): the strength it adds today and the days it has left, today included. */
  fallback?: { strength: number; daysLeft: number }
  /** The stronghold, still standing, that bars the player's assault here (D-23): its place name. */
  barredBy?: string
  /** Patch 7 (A2): steps past the realm's reach, on a march hex beyond it. */
  beyondReach?: number
  /** Empty board drawn around the marches (C-05): no rules, no name, never chosen. */
  decor?: boolean
  /** The continent beyond the marches (drawing only): highlands, or the shore where they meet the sea. */
  terrain?: 'highland' | 'shore'
}

/** The siege on `hex` (D-22): its progress and whether it is the standing siege, or undefined when it carries no wear and isn't besieged. */
function siegeOn(state: CampaignState, hex: HexState, today: ISODate, standing: string | undefined): { progress: number; standing: boolean } | undefined {
  if (hex.owner === 'player' || (hex.garrisonDamage <= 0 && hex.id !== standing)) return undefined
  return { progress: wornShare(state, hex, today), standing: hex.id === standing }
}

/** The garrisons fallen back onto `hex` (D-24): what they add today, the days left, and the hexes they came from; undefined when none. */
function fallbackHere(state: CampaignState, hex: HexState, today: ISODate): { strength: number; daysLeft: number; from: string[] } | undefined {
  const strength = fallbackOn(state, hex, today)
  if (strength <= 0) return undefined
  const here = (state.fallbacks ?? []).filter((f) => f.to === hex.id && f.holder === hex.owner && (f.struck === undefined || f.struck > today))
  const daysLeft = Math.max(...here.map((f) => RULES.sieges.fallback.days - diffDays(f.day, today) + 1))
  return { strength, daysLeft, from: here.map((f) => f.from) }
}

/** The standing siege's hex while it stands (D-22). */
function standingHex(state: CampaignState): string | undefined {
  const siege = standingSiegeOf(state)
  return siege && siegeIsLive(state, siege.hexId) ? siege.hexId : undefined
}

/** Everything the map draws, hex by hex, on `today`. */
export function mapView(state: CampaignState, today: ISODate = openDayOf(state)): MapHex[] {
  const threats = new Map<string, MapThreat[]>()
  for (const n of tidings(state, today).threats) {
    threats.set(n.hexId, [...(threats.get(n.hexId) ?? []), { kind: n.kind, ...(n.rival ? { rival: n.rival } : {}), ...(n.band ? { band: n.band } : {}) }])
  }
  const orders = ordersFor(state, today)
  const targets = new Set([orders?.assaultTarget, ...(orders?.extraAssaults ?? []).map((a) => a.target)].filter(Boolean) as string[])
  const courting = new Set(state.courtships.map((c) => c.hexId))
  const battles = new Map(pendingBattles(state).map((b) => [b.hexId, b.battleDate]))
  const standing = standingHex(state)
  return hexLayout(state.hexes).points.map((p, i) => {
    const h = state.hexes[i]
    const out: MapHex = {
      ...p,
      label: hexName(h),
      ring: h.ring,
      kind: h.kind,
      owner: h.owner,
      slot: terrainSlot(h),
      fortification: h.fortification,
      status: h.status
    }
    const regional = regionTerrainSlot(h)
    if (regional) out.regionSlot = regional
    if (h.village) out.village = { loyalty: h.village.loyalty }
    if (h.status !== 'held' && h.statusUntil) out.daysLeft = diffDays(today, h.statusUntil) + 1
    if (h.mythic) out.mythic = true
    if (h.ruins) out.ruins = true
    if (h.rebels) out.rebels = true
    const here = threats.get(h.id)
    if (here) out.threats = here
    if (targets.has(h.id)) out.target = true
    if (courting.has(h.id)) out.courting = true
    const battle = battles.get(h.id)
    if (battle) out.battle = battle
    const siege = siegeOn(state, h, today, standing)
    if (siege) out.siege = siege
    if (isStronghold(state.hexes, h.id)) out.stronghold = true
    const fallen = fallbackHere(state, h, today)
    if (fallen) out.fallback = { strength: fallen.strength, daysLeft: fallen.daysLeft }
    const bar = h.owner !== 'player' ? strongholdBarring(state.hexes, h.id) : undefined
    if (bar) out.barredBy = hexName(bar)
    if (h.march) {
      out.march = h.march
      out.depth = depthOf(h)
      if (h.seam) out.ruling = rulingMarch(state.campaign.seed, h, today) as MarchId
      const preparation = preparationOf(state, h, today)
      if (preparation > 0) out.preparation = preparation
      // Patch 7 (A2): the land past the realm's reach, shaded on the map.
      const steps = stepsBeyond(state, h)
      if (steps !== null && steps > 0 && isClaimableKind(h)) out.beyondReach = steps
    }
    return out
  })
}

/** Patch 7 (A2): where a hex stands against the realm's reach, in a line for its panel; none in the heartland or before the first 3.7.0 dawn. */
export function reachLine(state: CampaignState, hex: HexState): { kind: 'within' | 'edge' | 'beyond'; steps: number; text: string } | undefined {
  const standing = hex.march ? reachStanding(state, hex) : null
  if (!standing) return undefined
  const R = RULES.reach
  const weaker = `beasts and mythics strike ${pct(1 - R.withinMult)} weaker`
  if (standing.kind !== 'beyond') return { ...standing, text: `${standing.kind === 'edge' ? 'The edge of your reach' : 'Within your reach'}: ${weaker}` }
  const steps = standing.steps
  const harder = Math.min(R.beyondPerStep * steps, R.beyondCap - 1)
  const supply = Math.min(R.supplyPerStep * steps, R.supplyCap)
  return { ...standing, text: `${steps === 1 ? 'A step' : `${steps} steps`} beyond your reach: beasts and mythics strike ${pct(harder)} harder, and an assault faces a ${pct(supply)} stronger garrison` }
}

/**
 * The empty board around the marches (C-05): every board position touching a map hex that is not
 * one itself, drawn as a battlefield in the look of the march (or the two marches) it borders.
 * Nothing here has rules. Each front's war track sits on the one nearest the castle that lies
 * about as far from both its rivals' Gates.
 */
export function mapDecor(state: CampaignState): MapHex[] {
  const around = new Map<string, MarchId[]>()
  for (const h of state.hexes) {
    for (const d of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
      const id = hexId(h.q + d[0], h.r + d[1])
      if (onMap(id)) continue
      const marches = around.get(id) ?? []
      for (const m of [h.march, h.seam]) if (m && !marches.includes(m)) marches.push(m)
      around.set(id, marches)
    }
  }
  const gates = new Map(state.hexes.filter((h) => h.kind === 'gate' && h.march).map((h) => [h.march as MarchId, h.id]))
  const badges = new Map<string, FrontId>()
  for (const f of fronts()) {
    const [a, b] = f.rivals.map((r) => gates.get(r) ?? '0,0')
    const score = (id: string): number => hexDistance(id, '0,0') + Math.abs(hexDistance(id, a) - hexDistance(id, b))
    const spot = [...around.keys()].filter((id) => !badges.has(id)).sort((x, y) => score(x) - score(y) || x.localeCompare(y))[0]
    if (spot) badges.set(spot, f.front)
  }
  return [...around.entries()].map(([id, marches]) => {
    const { q, r } = parseHexId(id)
    const region = marches.length >= 2 && marchesBorder(marches[0], marches[1]) ? clockwisePair(marches[0], marches[1]).join('-') : marches[0]
    const out: MapHex = { id, q, r, ...hexCenter(q, r), label: '', ring: hexDistance(id, '0,0'), kind: 'battlefield', owner: 'neutral', slot: 'hex.battlefield', fortification: 0, status: 'held', decor: true, ...(marches[0] ? { march: marches[0] } : {}) }
    if (region) out.regionSlot = `hex.battlefield.${region}`
    const front = badges.get(id)
    if (front) {
      const f = state.fronts[front]
      const favors = f.track > 0 ? f.rivals[0] : f.track < 0 ? f.rivals[1] : undefined
      out.front = { front, state: f.state, track: f.track, ...(favors ? { favors } : {}) }
    }
    return out
  })
}

// ── The continent (drawing only) ─────────────────────────────────────────────

/**
 * The coastline: an ellipse fitted inside the marches' own frame (12 hex spacings across from the
 * castle, 14.5 up and down; the bend widened the frame from 8 to 10 across, D-37, C-59), roughened by
 * two octaves of smooth noise around it, fixed for the campaign; the marches' tips run out past it as
 * capes. Drawing only: no rules read it.
 */
const COAST = { across: 12, along: 14.5, wide: 0.22, fine: 0.08, octaves: [7, 19] } // rules-ok: drawing only, the continent's outline
/** How far past the map's last ring to look for land (a ring-k hex lies 0.87k to k from the castle). */
const COAST_REACH = 6 // rules-ok: drawing only

/** Smooth noise at `angle` around the circle, with `k` control points drawn for the campaign. */
function coastNoise(seed: number, day: ISODate, k: number, angle: number): number {
  const t = ((angle / (2 * Math.PI)) * k + k) % k
  const i = Math.floor(t)
  const f = t - i
  const a = draw(seed, day, `map:coast:${k}:${i}`)
  const b = draw(seed, day, `map:coast:${k}:${(i + 1) % k}`)
  const s = f * f * (3 - 2 * f) // rules-ok: smoothstep
  return a + (b - a) * s
}

/**
 * The continent around the marches (drawing only): every board position inside the campaign's
 * coastline that is neither a map hex nor the board drawn around them (`mapDecor`) is highland in
 * the look of the nearest march's far wilds, or shore where it meets the sea. Nothing here has rules,
 * a name or an owner, and none of it can be chosen.
 */
export function mapLand(state: CampaignState): MapHex[] {
  const { seed, startDate } = state.campaign
  const marched = state.hexes.filter((h) => h.march)
  const taken = new Set(state.hexes.map((h) => h.id))
  for (const h of state.hexes) for (const n of neighborIds(h.q, h.r)) taken.add(n)
  const land = new Map<string, { q: number; r: number }>()
  for (let k = 1; k <= MAP_RADIUS + COAST_REACH; k++) {
    for (const { q, r } of ringHexes(k)) {
      const id = hexId(q, r)
      if (taken.has(id)) continue
      const { x, y } = hexCenter(q, r)
      const angle = Math.atan2(y, x)
      const coast = 1 + COAST.wide * (coastNoise(seed, startDate, COAST.octaves[0], angle) - 1 / 2) + COAST.fine * (coastNoise(seed, startDate, COAST.octaves[1], angle) - 1 / 2)
      if (Math.hypot(x / (COAST.across * SQRT3), y / (COAST.along * SQRT3)) <= coast) land.set(id, { q, r })
    }
  }
  return [...land.entries()].map(([id, { q, r }]) => {
    let near: HexState | undefined
    let best = Infinity
    for (const h of marched) {
      const d = hexDistance(id, h.id)
      if (d < best) [best, near] = [d, h]
    }
    const march = near?.march
    const shore = neighborIds(q, r).some((n) => !land.has(n) && !taken.has(n))
    return { id, q, r, ...hexCenter(q, r), label: '', ring: hexDistance(id, '0,0'), kind: 'battlefield', owner: 'neutral', slot: march ? `hex.wilds.${march}.far` : 'hex.wild', fortification: 0, status: 'held', decor: true, terrain: shore ? 'shore' : 'highland', ...(march ? { march } : {}) }
  })
}

/** The six board positions around (q, r), on the map or not. */
function neighborIds(q: number, r: number): string[] {
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => hexId(q + dq, r + dr))
}

// ── The hex panel ────────────────────────────────────────────────────────────

export type HexActionKind = 'assault' | 'challenge' | 'court' | 'buy' | 'fortify' | 'reclaim' | 'bribe' | 'hold' | 'sellBack' | 'keep' | 'bend'

export interface HexAction {
  kind: HexActionKind
  /** Exactly what the engine's own check says. */
  available: boolean
  /** Its price, when it has one (a bid suggested to meet the resistance, a deal's price, a level's cost, a bribe); for a sale, what it pays. */
  cost?: number
  /** The engine's refusal: a code, its plain facts and its words. A deal's refusal also names its text id. */
  reason?: { code: string; label: string; textId?: string; facts?: Record<string, unknown> }
}

export interface HexPanel {
  id: string
  label: string
  owner: Owner
  ownerName: string
  kind: HexState['kind']
  ring: number
  /** Its band (D-17), which sets what it pays and costs: 1 and 2 in the heartland, then 3 to 5 by depth (Patch 7, B6). */
  band: number
  land?: HexState['land']
  road?: HexState['road']
  /** The march it lies in and its depth there; a seam's second march and the one ruling today (D-16). */
  march?: MarchId
  depth?: number
  seam?: MarchId
  ruling?: MarchId
  /** Its march's preparation level today, on a hex the player doesn't hold (D-19). */
  preparation?: number
  /** The rival whose rules it plays by today (D-27): his march, or a seam he rules today. None in the heartland or a lair's wedge. */
  rule?: RivalId
  /** The Archmage's surge on it today, and tomorrow's when foreseen (D-31). */
  surge?: { today?: SurgeKind; tomorrow?: SurgeKind }
  /** The Goblin's greed as a band, on a hex of his march he could be paid for (C-49). */
  greed?: GreedBand
  /** His bid for this village of the player's (D-29): whether it would sway the village at today's close, and the player's hold so far. Never his offer. */
  goblinBid?: { sways: boolean; hold: number }
  /** His offer to buy back this hex (C-44): his price and its last day. */
  buyBack?: { price: number; until: ISODate }
  /** Restless after the Dwarf's surrender (R-12), until this day. */
  restless?: ISODate
  /** A rising village (the Village Uprising, or a restless one): its price to keep and the last day. */
  uprising?: { price: number; until: ISODate }
  /** What holding the hex adds to each rival's path in Holdings (D-18). */
  paths: Partial<Record<RivalId, number>>
  /** The exact garrison an assault must beat today: wear, fortification and preparation counted (claimable hexes only). */
  garrison?: number
  /** A siege on it (D-22): its progress (wear as a share of the garrison it wears) and whether it is the standing siege. */
  siege?: { progress: number; standing: boolean }
  /** The daily assault's flanking multiple on it today (D-22), on a hex a daily assault may take. */
  flank?: number
  /** Patch 7 (A2): where it stands against the realm's reach, in a line (march hexes only). */
  reach?: { kind: 'within' | 'edge' | 'beyond'; steps: number; text: string }
  /** A stronghold (D-23): its garrison is × `garrisonMult` while not the player's, and it bars its march beyond. */
  stronghold?: boolean
  /** The stronghold, still standing, that bars the player's assault here (D-23). */
  barredBy?: { hexId: string; label: string }
  /** Garrisons fallen back here (D-24): what they add today, the days left, and where they came from. */
  fallback?: { strength: number; daysLeft: number; from: { hexId: string; label: string }[] }
  village?: { loyalty: number; resistance: number; settlingUntil?: ISODate }
  fortification: number
  status: HexState['status']
  statusUntil?: ISODate
  /** A rival's conquest attempt has beaten this hex once: the same force strikes each day until `until`. */
  contest?: { rival: RivalId; until: ISODate }
  /** Today's threats here, as the Herald tells them. */
  threats: MapThreat[]
  /** The player's open bid on this village. */
  courting?: { bid: number; placedOn: ISODate }
  /** Already one of today's assault targets. */
  target: boolean
  actions: HexAction[]
}

const GRAND_KINDS = new Set<HexState['kind']>(['gate', 'capital', 'lairMouth'])

function isRival(owner: Owner): owner is RivalId {
  return owner !== 'player' && owner !== 'neutral'
}

/** A march by the name of its land (D-16): "The Ashen Steppe", "the Wyrmfells". */
export function marchName(march: MarchId): string {
  return CODEX.rivals.find((r) => r.id === march)?.realm ?? CODEX.lairs.find((l) => l.id === march)?.name ?? march
}

/** Who holds a hex, as the panel names them. */
export function ownerName(owner: Owner): string {
  if (owner === 'player') return 'Your realm'
  if (owner === 'neutral') return 'Unaligned'
  return rivalName(owner)
}

/** Trust now (Ch 6): from Realm Consistency over the last 28 settled days, plus Envoy's Rest. */
export function trustNow(state: CampaignState, effects: Effects = realmEffects(state)): number {
  return trust(realmConsistencyNow(state), effects.trust.value)
}

/** The bid whose Offer meets a village's resistance at today's Trust (rounded up to whole reputation; a rival's counter-bid is not known). */
export function suggestedBid(state: CampaignState, hex: HexState, effects: Effects = realmEffects(state)): number {
  return Math.max(1, Math.ceil(resistance(hex) / trustNow(state, effects)))
}

/** Today's threats on one hex, as the Herald tells them. */
function threatsOn(state: CampaignState, today: ISODate, hexId: string): MapThreat[] {
  return tidings(state, today)
    .threats.filter((n) => n.hexId === hexId)
    .map((n) => ({ kind: n.kind, ...(n.rival ? { rival: n.rival } : {}), ...(n.band ? { band: n.band } : {}) }))
}

/** The hex panel: its facts and every action allowed on it today, each as the engine judges it. */
export function hexPanel(state: CampaignState, hexId: string, today: ISODate = openDayOf(state), effects: Effects = realmEffects(state)): HexPanel | null {
  const hex = state.hexes.find((h) => h.id === hexId)
  if (!hex) return null
  const actions: HexAction[] = []
  if (hex.owner !== 'player' && GRAND_KINDS.has(hex.kind)) {
    const done = challenge(state, hexId, today)
    const code = done.reason ?? 'refused'
    actions.push({ kind: 'challenge', available: done.ok, ...(done.ok ? {} : { reason: { code, label: grandRefusalLabel(code) } }) })
  } else if (hex.owner !== 'player' && isClaimableKind(hex)) {
    // A stronghold (D-23, P3-02): its Grand Battle, as well as the siege.
    if (isStronghold(state.hexes, hexId)) {
      const done = challenge(state, hexId, today)
      const code = done.reason ?? 'refused'
      actions.push({ kind: 'challenge', available: done.ok, ...(done.ok ? {} : { reason: { code, label: grandRefusalLabel(code) } }) })
    }
    const strongest = rosterDetail(state, { day: today }, effects).sort((a, b) => b.company.power - a.company.power)[0]
    const validity = ordersValidity(state, { date: today, assaultTarget: hexId, assault: strongest ? [strongest.company.id] : [], defense: [] }, effects)
    const ok = validity.assaults.some((a) => a.target === hexId)
    const problem = validity.problems.find((p) => 'hexId' in p && p.hexId === hexId) ?? validity.problems[0]
    actions.push({ kind: 'assault', available: ok, ...(ok || !problem ? {} : { reason: { code: problem.code, label: orderProblemLabel(problem), facts: { ...problem } } }) })
  }
  if (hex.village && hex.owner !== 'player') {
    const bid = suggestedBid(state, hex, effects)
    const check = bidCheck(state, hexId, bid)
    actions.push({ kind: 'court', available: check.ok, cost: bid, ...(check.ok || !check.reason ? {} : { reason: { code: check.reason.code, label: landRefusalLabel(check.reason), facts: { ...check.reason } } }) })
  }
  if (isRival(hex.owner)) {
    const offer = offerDeal(state, hex.owner, { kind: 'buyHex', hexId }, today)
    const reason = offer.reason
    const facts = { rival: rivalName(hex.owner), hex: hexName(hex), ...(reason?.needed !== undefined ? { needed: reason.needed } : {}) }
    actions.push({ kind: 'buy', available: offer.allowed, cost: offer.price, ...(offer.allowed || !reason ? {} : { reason: { code: reason.code, label: t(reason.textId, facts), textId: reason.textId, facts: { ...reason } } }) })
  }
  if (hex.owner === 'player') {
    const offer = fortifyOffer(state, hexId)
    actions.push({ kind: 'fortify', available: offer.ok, cost: offer.cost, ...(offer.ok || !offer.reason ? {} : { reason: { code: offer.reason.code, label: landRefusalLabel(offer.reason), facts: { ...offer.reason } } }) })
  }
  if (hex.owner !== 'player' && lostOn(state, hexId)) {
    const offer = reclaimOffer(state, hexId, today)
    actions.push({ kind: 'reclaim', available: offer.ok, cost: offer.cost, ...(offer.ok || !offer.reason ? {} : { reason: { code: offer.reason.code, label: landRefusalLabel(offer.reason), facts: { ...offer.reason } } }) })
  }
  const rule = marchRule(state, hex, today)
  const rc = realmConsistencyNow(state)
  // Patch 4 (D-29): a bribe in the Goblin's march, his bid on a village of the player's, his buy-back.
  if (hex.owner !== 'player' && rule === 'goblin') {
    const offer = bribeOffer(state, hexId, rc, today)
    if (offer.reason !== 'notHisMarch' && offer.reason !== 'unknownHex' && offer.reason !== 'gate') {
      const price = offer.ok || offer.reason === 'reputation' ? offer.price : undefined
      actions.push({ kind: 'bribe', available: offer.ok, ...(price !== undefined ? { cost: price } : {}), ...(offer.ok || !offer.reason ? {} : { reason: { code: offer.reason, label: bribeRefusalLabel(offer.reason, price) } }) })
    }
  }
  const bid = goblinBidsOf(state).find((b) => b.hexId === hexId)
  if (bid && hex.owner === 'player') {
    const open = balance(state.purse) > 0
    actions.push({ kind: 'hold', available: open, ...(open ? {} : { reason: { code: 'reputation', label: 'The purse is empty.' } }) })
  }
  const offers = worldOf(state).offers
  const buyBack = offers.find((o) => o.kind === 'buyBack' && o.hexId === hexId && today <= o.until)
  if (buyBack?.kind === 'buyBack' && hex.owner === 'player') actions.push({ kind: 'sellBack', available: state.rivals.goblin.status === 'active', cost: buyBack.price })
  const uprising = offers.find((o) => o.kind === 'uprising' && o.hexId === hexId && today <= o.until)
  if (uprising?.kind === 'uprising' && hex.owner === 'player') {
    const ok = balance(state.purse) >= uprising.price
    actions.push({ kind: 'keep', available: ok, cost: uprising.price, ...(ok ? {} : { reason: { code: 'reputation', label: `It costs ${amount(uprising.price)}; the purse cannot pay it.` } }) })
  }
  // The Archmage's path at rank V (C-36): bend tomorrow's foreseen swell here into an ebb.
  const foreseen = foreseesSurges(state) ? surgeOn(state, addDays(today, 1)) : undefined
  if (foreseen?.hexId === hexId && foreseen.surge === 'swell' && pathRank(state, 'archmage') >= RULES.dominion.rankPerks.archmage.bendRank) {
    const done = bendSurge(state, today)
    actions.push({ kind: 'bend', available: done.ok, ...(done.ok || !done.reason ? {} : { reason: { code: done.reason, label: bendRefusalLabel(done.reason) } }) })
  }
  const surgeToday = surgeOn(state, today)
  const surge = {
    ...(surgeToday?.hexId === hexId ? { today: surgeToday.surge } : {}),
    ...(foreseen?.hexId === hexId ? { tomorrow: foreseen.surge } : {})
  }
  const restless = (personalitiesOf(state).restless ?? []).find((r) => r.hexId === hexId && today <= r.until && hex.owner === 'player')
  const orders = ordersFor(state, today, effects)
  const contest = combatOf(state).contested.find((c) => c.hexId === hexId)
  const courtship = state.courtships.find((c) => c.hexId === hexId)
  const siege = siegeOn(state, hex, today, standingHex(state))
  const assaultable = claimableBy(state.hexes, hexId, 'player', 'assault')
  const reach = reachLine(state, hex)
  const barring = hex.owner !== 'player' ? strongholdBarring(state.hexes, hexId) : undefined
  const fallen = fallbackHere(state, hex, today)
  return {
    id: hex.id,
    label: hexName(hex),
    owner: hex.owner,
    ownerName: ownerName(hex.owner),
    kind: hex.kind,
    ring: hex.ring,
    band: bandOf(hex),
    ...(hex.land ? { land: hex.land } : {}),
    ...(hex.road ? { road: hex.road } : {}),
    ...(hex.march ? { march: hex.march, depth: depthOf(hex) } : {}),
    ...(hex.seam ? { seam: hex.seam, ruling: rulingMarch(state.campaign.seed, hex, today) as MarchId } : {}),
    ...(preparationOf(state, hex, today) > 0 ? { preparation: preparationOf(state, hex, today) } : {}),
    ...(rule ? { rule } : {}),
    ...(surge.today || surge.tomorrow ? { surge } : {}),
    ...(rule === 'goblin' && hex.owner !== 'player' && actions.some((a) => a.kind === 'bribe') ? { greed: greedBand(state) } : {}),
    ...(bid && hex.owner === 'player' ? { goblinBid: { sways: bidSways(state, bid, rc, effects), hold: bid.hold ?? 0 } } : {}),
    ...(buyBack?.kind === 'buyBack' && hex.owner === 'player' ? { buyBack: { price: buyBack.price, until: buyBack.until } } : {}),
    ...(restless ? { restless: restless.until } : {}),
    ...(uprising?.kind === 'uprising' && hex.owner === 'player' ? { uprising: { price: uprising.price, until: uprising.until } } : {}),
    paths: Object.fromEntries(Object.entries(pathShares(hex)).map(([r, s]) => [r, hexWorth(hex) * (s ?? 0)])),
    ...(isClaimableKind(hex) ? { garrison: assaultGarrison(state, hex, today) } : {}),
    ...(siege ? { siege } : {}),
    ...(assaultable ? { flank: flankingMult(hexIndex(state.hexes), hexId) } : {}),
    ...(reach ? { reach } : {}),
    ...(isStronghold(state.hexes, hexId) ? { stronghold: true } : {}),
    ...(barring ? { barredBy: { hexId: barring, label: hexName(barring) } } : {}),
    ...(fallen ? { fallback: { strength: fallen.strength, daysLeft: fallen.daysLeft, from: fallen.from.map((id) => ({ hexId: id, label: hexName(id) })) } } : {}),
    ...(hex.village ? { village: { loyalty: hex.village.loyalty, resistance: resistance(hex), ...(hex.village.settlingUntil ? { settlingUntil: hex.village.settlingUntil } : {}) } } : {}),
    fortification: hex.fortification,
    status: hex.status,
    ...(hex.statusUntil ? { statusUntil: hex.statusUntil } : {}),
    ...(contest ? { contest: { rival: contest.rival, until: contest.until } } : {}),
    threats: threatsOn(state, today, hexId),
    ...(courtship ? { courting: { bid: courtship.bid, placedOn: courtship.placedOn } } : {}),
    target: orders?.assaultTarget === hexId || (orders?.extraAssaults ?? []).some((a) => a.target === hexId),
    actions
  }
}

// ── What a source gives the realm ────────────────────────────────────────────

export interface EffectLine {
  /** Where in the realm's effects it lands (`reputationBonus`, `foretell.threats`, …), and its value. */
  field: string
  value: number | boolean | string
  /** In plain words ("Rally floor 55%"). */
  label: string
}

function pct(share: number): string {
  return `${amount(share * PERCENT)}%`
}

function days(n: number): string {
  return n === 1 ? 'a day' : `${n} days`
}

/**
 * Bands ("4 and 5", as an effect names them, D-17) in the depths a player sees (Patch 7, B6): the
 * lowest band's first depth and deeper, in a rival's march and in a lair's.
 */
function bandDepths(bands: string): string {
  const lowest = Math.min(...bands.split(' and ').map(Number))
  const m = RULES.map
  if (lowest <= m.heartlandRings) return 'in the heartland and beyond'
  const from = (perBand: number): number => (lowest - m.heartlandRings - 1) * perBand + 1
  return `deep in the marches: depth ${from(m.bands.rivalDepthsPerBand)} and deeper in a rival’s march, ${from(m.bands.lairDepthsPerBand)} and deeper in a lair’s`
}

/** One effect line in plain words. */
export function effectLabel(field: string, value: number | boolean | string): string {
  const n = typeof value === 'number' ? value : 0
  switch (field) {
    case 'banners':
      return `${n} banners`
    case 'walls':
      return `Walls +${amount(n)}`
    case 'wallsDouble.rings':
      return `Walls count double on your hexes ${bandDepths(String(value))}`
    case 'wallsDouble.against':
      return `Walls count double against ${value === 'mythic' ? 'mythics' : value}`
    case 'dailyAssaults':
      return n === 1 ? 'A second daily assault' : `+${n} daily assaults`
    case 'rallyFloor':
      return n >= RULES.combat.rallyFloor.base ? `Rally floor ${pct(n)}` : `Rally floor +${pct(n)}`
    case 'armsBonus':
      return `All companies +${pct(n)}`
    case 'reputationBonus':
      return `+${pct(n)} reputation`
    case 'hiredBlades':
      return 'Hired blades for the daily defense'
    case 'pledgeCap':
      return `Pledge cap ×${factor(n)}`
    case 'minPledgeReturn':
      return `At least ${pct(n)} of every pledge returns`
    case 'courtshipSlots':
      return n === 1 ? '+1 courtship slot' : `+${n} courtship slots`
    case 'mythicStrength':
      return `Mythic attacks −${pct(1 - n)}`
    case 'raidStrength':
      return `Rival raids −${pct(1 - n)}`
    case 'respiteBank':
      return `Respite bank holds ${n}`
    case 'foretell.threats':
      return `Threats foretold ${days(n)} earlier`
    case 'foretell.raids':
      return `Rival raids foretold ${days(n)} early`
    case 'foretell.grandBattles':
      return `Grand Battles foretold ${days(n)} earlier`
    case 'reveals.threatStrength':
      return 'Threat strengths shown as numbers'
    case 'reveals.hostRoster':
      return 'Enemy hosts shown in full'
    case 'reveals.treasury':
      return value === 'neighbors' ? 'Neighbors’ treasuries shown as numbers' : 'Rival treasuries shown as numbers'
    case 'reveals.army':
      return 'Rival armies shown as numbers'
    case 'assaultIgnoresFortification':
      return 'Your assaults ignore fortification'
    case 'tribute':
      return `Tribute on a lost battle −${pct(1 - n)}`
    case 'spoils.beast':
      return `Spoils from beasts ×${factor(n)}`
    case 'royalHunt':
      return 'One beast attack a week becomes a hunt'
    case 'costs.tiers':
      return `Building tiers cost −${pct(1 - n)}`
    case 'costs.crossings':
      return `Crossing stages cost −${pct(1 - n)}`
    case 'titheMult':
      return `Village tithes +${pct(n)}`
    case 'grandIllusion':
      return 'One lost battle a week costs no tribute and contests no hex'
    default:
      return `${field}: ${typeof value === 'number' ? amount(value) : String(value)}`
  }
}

/**
 * Every effect line a source gives, by walking the realm's effects for contributions from it.
 * Several contributions to one field combine as the field does (added, or multiplied); the lair
 * sides' mythic strength repeats the realm-wide one and is left out.
 */
export function effectLines(effects: Effects, from: (ref: EffectSourceRef) => boolean): EffectLine[] {
  const found = new Map<string, { value: number | boolean | string; op?: 'add' | 'mult' }>()
  const put = (field: string, value: number | boolean | string, op?: 'add' | 'mult'): void => {
    const was = found.get(field)
    if (was && typeof was.value === 'number' && typeof value === 'number') found.set(field, { value: op === 'mult' ? was.value * value : was.value + value, op })
    else found.set(field, { value, op })
  }
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    if (path.startsWith('mythicStrengthBySide')) return
    const o = node as Record<string, unknown>
    if (Array.isArray(o.sources)) {
      for (const s of o.sources as unknown[]) {
        const contribution = s as { from?: EffectSourceRef; value?: number }
        if (contribution.from && from(contribution.from)) put(path, contribution.value ?? 0, o.op as 'add' | 'mult')
        else if (!contribution.from && from(s as EffectSourceRef)) put(path, 'whom' in o ? String(o.whom) : true)
      }
      return
    }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k)
  }
  walk(effects, '')
  for (const w of effects.wallsDouble) {
    if (!from(w.from)) continue
    if (w.rings) put('wallsDouble.rings', w.rings.join(' and '))
    if (w.against) put('wallsDouble.against', w.against)
  }
  return [...found.entries()].map(([field, { value }]) => ({ field, value, label: effectLabel(field, value) }))
}

// ── Buildings, the castle, Crossings and the Crownguard (Ch 7, Ch 8) ─────────

export interface NextOffer {
  /** The tier or stage it reaches. */
  tier: number
  cost: number
  ok: boolean
  refusal?: { code: string; label: string; facts: Record<string, unknown> }
  /** Every requirement, worded, met or not (reputation last). */
  requirements: { code: string; label: string; met: boolean }[]
}

/** An engine offer as the panel shows it, or undefined at the top (nothing more to buy). */
function nextOf(offer: Offer): NextOffer | undefined {
  if (offer.reason?.code === 'maxed') return undefined
  return {
    tier: offer.next,
    cost: offer.cost,
    ok: offer.ok,
    ...(offer.reason ? { refusal: { code: offer.reason.code, label: buyRefusalLabel(offer.reason), facts: { ...offer.reason } } } : {}),
    requirements: requirementLines(offer.requirements)
  }
}

export interface CompanyCard {
  name: string
  power: number
  tags: string[]
  /** Its description slot (`units.<id>`). */
  textId: string
  text: string
}

export interface BuildingView {
  id: BuildingId
  name: string
  tier: number
  /** The art slot of this tier (`building.<id>.<tier>`). */
  slot: string
  company: CompanyCard
  /** Its path's Dominion (D-18): Renown + Holdings. */
  dominion: number
  /** Its path: the rival, its Renown and Holdings, its rank (never falls) and the next rank's threshold. */
  path: { rival: RivalId; name: string; renown: number; holdings: number; rank: number; nextRank?: number }
  /** Where its path's Holdings come from: each hex with what it gives (gap 2). */
  dominionSources: { hexId: string; label: string; value: number }[]
  /** What its current tier gives the realm. */
  gives: EffectLine[]
  next?: NextOffer & { company: CompanyCard; gives: EffectLine[] }
}

function companyAt(building: BuildingId, tier: number): CompanyCard {
  const entry = CODEX.companies.find((c) => c.source === 'building' && c.building === building && c.tier === tier)
  const textId = `units.${entry?.id ?? building}`
  return { name: entry?.name ?? building, power: byTier(RULES.buildings.pureCompanyPower, tier), tags: [...(entry?.tags ?? [])], textId, text: t(textId) }
}

/** The four buildings: tier, company, its path's Dominion and Holdings sources, what the tier gives, and the next tier's offer. */
export function buildingsView(state: CampaignState, effects: Effects = realmEffects(state)): BuildingView[] {
  const totals = pathTotals(state)
  const renowned = renown(state)
  const thresholds = rankThresholds()
  return BUILDING_IDS.map((id) => {
    const tier = state.buildings[id]
    const rival = CODEX.rivals.find((r) => r.id && r.road === id)?.id as RivalId
    const fromThis = (ref: EffectSourceRef): boolean => (ref.kind === 'building' && ref.id === id) || (ref.kind === 'pathRank' && ref.path === rival)
    const sources = holdingSources(state, rival)
    const rank = pathRank(state, rival)
    const next = nextOf(tierOffer(state, id))
    const view: BuildingView = {
      id,
      name: CODEX.buildings.find((b) => b.id === id)?.name ?? id,
      tier,
      slot: `building.${id}.${tier}`,
      company: companyAt(id, tier),
      dominion: totals[rival],
      path: {
        rival,
        name: rivalName(rival),
        renown: renowned[rival],
        holdings: totals[rival] - renowned[rival],
        rank,
        ...(rank < thresholds.length ? { nextRank: thresholds[rank] } : {})
      },
      dominionSources: sources.map((s) => ({ ...s, label: hexName(s.hexId) })),
      gives: effectLines(effects, fromThis)
    }
    if (next) {
      const nextEffects = realmEffects({ ...state, buildings: { ...state.buildings, [id]: next.tier } })
      view.next = { ...next, company: companyAt(id, next.tier), gives: effectLines(nextEffects, fromThis) }
    }
    return view
  })
}

export interface CastleView {
  tier: number
  name: string
  slot: string
  banners: number
  walls: number
  gives: EffectLine[]
  next?: NextOffer & { name: string; banners: number; walls: number; gives: EffectLine[] }
}

const CASTLE_NAMES = ['Keep', 'Stronghold', 'Citadel', 'Palace', 'High Throne'] // rules-ok: names of the castle tiers (Ch 7)

export function castleView(state: CampaignState, effects: Effects = realmEffects(state)): CastleView {
  const tier = state.castleTier
  const offer = nextOf(castleOffer(state))
  const fromCastle = (ref: EffectSourceRef): boolean => ref.kind === 'castle'
  return {
    tier,
    name: CASTLE_NAMES[tier - 1],
    slot: `castle.${tier}`,
    banners: byTier(RULES.castle.banners, tier),
    walls: byTier(RULES.castle.walls, tier),
    gives: effectLines(effects, fromCastle),
    ...(offer
      ? {
          next: {
            ...offer,
            name: CASTLE_NAMES[offer.tier - 1],
            banners: byTier(RULES.castle.banners, offer.tier),
            walls: byTier(RULES.castle.walls, offer.tier),
            gives: effectLines(realmEffects({ ...state, castleTier: offer.tier as CampaignState['castleTier'] }), fromCastle)
          }
        }
      : {})
  }
}

export interface CrossingView {
  id: CrossingId
  name: string
  buildings: [BuildingId, BuildingId]
  stage: number
  /** The hybrid at this stage (none before stage I). */
  hybrid?: CompanyCard
  /** The next stage's hybrid. */
  nextHybrid?: CompanyCard
  /** Each perk, worded at its own stage; `replacedBy` is the later perk that replaces it (A-31). */
  perks: { id: string; name: string; stage: number; active: boolean; gives: EffectLine[]; replacedBy?: { name: string; stage: number } }[]
  /** The Crossing's own description slot (`crossings.<id>.body`). */
  textId: string
  text: string
  next?: NextOffer
}

function hybridAt(crossing: CrossingId, stage: number): CompanyCard | undefined {
  const entry = CODEX.crossings.find((x) => x.id === crossing)
  const hybrid = entry?.hybrids.find((h) => h.stage === stage)
  if (!entry || !hybrid) return undefined
  const textId = `units.${hybrid.id}`
  return { name: hybrid.name, power: byTier(RULES.crossings.hybridPower, stage), tags: [...entry.tags], textId, text: t(textId) }
}

export function crossingsView(state: CampaignState, effects: Effects = realmEffects(state)): CrossingView[] {
  const active = new Set(effects.perks.map((p) => p.id))
  return CODEX.crossings.map((x) => {
    const stage = state.crossings[x.id] ?? 0
    const next = nextOf(crossingOffer(state, x.id))
    // Each perk is worded with the Crossing raised to its own stage: at a later stage, a perk that
    // another replaces (Trade Roads under Guild Charters, A-31) gives nothing to read.
    const atStage = (n: number): Effects => realmEffects({ ...state, crossings: { ...state.crossings, [x.id]: n } })
    const hybrid = hybridAt(x.id, stage)
    const nextHybrid = next ? hybridAt(x.id, next.tier) : undefined
    const textId = `crossings.${x.id}.body`
    return {
      id: x.id,
      name: x.name,
      buildings: [x.buildings[0], x.buildings[1]],
      stage,
      ...(hybrid ? { hybrid } : {}),
      ...(nextHybrid ? { nextHybrid } : {}),
      perks: x.perks.map((p) => {
        const replacedBy = x.perks.find((q) => q.replaces === p.id)
        return {
          id: p.id,
          name: p.name,
          stage: p.stage,
          active: active.has(p.id),
          gives: effectLines(atStage(p.stage), (ref) => ref.kind === 'perk' && ref.id === p.id),
          ...(replacedBy ? { replacedBy: { name: replacedBy.name, stage: replacedBy.stage } } : {})
        }
      }),
      textId,
      text: t(textId),
      ...(next ? { next } : {})
    }
  })
}

/** The Crownguard (Ch 8): its power now (0 until every building is at Tier IV) and the tier it needs. */
export function crownguardView(state: CampaignState): { power: number; needsTier: number; raised: boolean } {
  const power = crownguardPower(state)
  return { power, needsTier: RULES.crownguard.buildingTier, raised: power > 0 }
}

// ── The roster (Ch 7 "The roster") ───────────────────────────────────────────

export interface RosterCompany {
  id: string
  name: string
  /** Its art slot: the unit line's token, an Elite's portrait, or a rival's banner for its levies. */
  art: string
  source: CompanySource
  /** Where it comes from, in plain words ("Barracks", "Barracks + Foundry", "Ugrak's vassals"). */
  origin: string
  power: number
  basePower: number
  tags: string[]
  reach: string
  weary: boolean
  wearyUntil?: ISODate
  items: { id: string; name: string }[]
  /** Where its power comes from beyond its base, each with what it does ("+2", "+10%", "−20%"). */
  sources: { label: string; effect: string }[]
}

const SOURCE_NAMES: Record<CompanySource, string> = {
  building: 'Building',
  crossing: 'Crossing',
  elite: 'Elite company',
  crownguard: 'The Crownguard',
  vassal: 'Vassal',
  ally: 'Ally',
  hired: 'Hired',
  sworn: 'The Sworn',
  host: 'Host',
  envoy: 'Envoy'
}

/**
 * The art slot of a roster company: its current unit line's token (`company.<unit>.token`), an Elite's
 * portrait, a levy's banner. Hired blades wear the Merchant Hall's current company, whose power they
 * have (A-19), as they do on the Grand Battle field.
 */
export function companyArt(state: CampaignState, id: string, source: CompanySource): string {
  if (source === 'hired') return companyArt(state, 'merchantHall', 'building')
  if (source === 'building') {
    const unit = CODEX.companies.find((c) => c.source === 'building' && c.building === id && c.tier === state.buildings[id as BuildingId])
    return `company.${unit?.id ?? id}.token`
  }
  if (source === 'crossing') {
    const crossing = CODEX.crossings.find((x) => x.id === id)
    const hybrid = crossing?.hybrids.find((h) => h.stage === state.crossings[id as CrossingId])
    return `company.${hybrid?.id ?? id}.token`
  }
  if (source === 'elite') return `portrait.${id}`
  const [, rival] = id.split(':')
  if ((source === 'vassal' || source === 'ally' || source === 'envoy') && rival) return `banner.${rival}`
  return `company.${id}.token`
}

function originOf(id: string, source: CompanySource): string {
  if (source === 'building') return CODEX.buildings.find((b) => b.id === id)?.name ?? SOURCE_NAMES.building
  if (source === 'crossing') return CODEX.crossings.find((x) => x.id === id)?.name ?? SOURCE_NAMES.crossing
  const [, rival] = id.split(':')
  if ((source === 'vassal' || source === 'ally' || source === 'envoy') && rival) return `${SOURCE_NAMES[source]} of ${rivalName(rival as RivalId)}`
  return SOURCE_NAMES[source]
}

export function rosterView(state: CampaignState, today: ISODate = openDayOf(state), effects: Effects = realmEffects(state)): RosterCompany[] {
  return rosterDetail(state, { day: today }, effects).map((e) => ({
    id: e.company.id,
    name: e.company.name,
    art: companyArt(state, e.company.id, e.company.source),
    source: e.company.source,
    origin: originOf(e.company.id, e.company.source),
    power: e.company.power,
    basePower: e.basePower,
    tags: [...e.company.tags],
    reach: e.company.reach,
    weary: e.weary,
    ...(e.company.wearyUntil ? { wearyUntil: e.company.wearyUntil } : {}),
    items: e.company.items.map((id) => ({ id, name: CODEX.items.find((i) => i.id === id)?.name ?? id })),
    sources: [
      ...e.parts.adds.map((s) => ({ label: sourceLabel(s.from), effect: `+${amount(s.value)}` })),
      ...e.parts.shares.map((s) => ({ label: sourceLabel(s.from), effect: `+${pct(s.value)}` })),
      ...e.parts.cuts.map((s) => ({ label: sourceLabel(s.from), effect: s.value < 1 ? `−${pct(1 - s.value)}` : `×${factor(s.value)}` }))
    ]
  }))
}

/** A building's name, as the screens print it. */
export function buildingName(id: BuildingId): string {
  return CODEX.buildings.find((b) => b.id === id)?.name ?? id
}

/** A tier as its numeral, for headings ("Tier III"). */
export const tierNumeral = numeral
