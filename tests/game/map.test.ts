import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIRECTIONS,
  bandOf,
  bendShift,
  bentIds,
  borderHexes,
  buildMap,
  capitals,
  claimableBy,
  depthOf,
  fronts,
  hexDistance,
  hexId,
  hexLabel,
  hexName,
  hexWorth,
  isBorderHex,
  isClaimableKind,
  lairOf,
  neighbors,
  onMap,
  pathShares,
  regionsOf,
  ringHexes,
  ringOf,
  rulingMarch,
  seedVillages,
  straightId,
  strongholds,
  touchesOwner,
  touchingPairs,
  villageCredits,
  wildBase,
  wildGarrison
} from '../../src/renderer/src/lib/game/map'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { draw } from '../../src/renderer/src/lib/game/rng'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { MAP_ASCII_LEGEND, mapAscii } from '../../src/renderer/src/lib/game/dev/mapAscii'
import { RIVAL_IDS, type BuildingId, type HexState, type MarchId, type Owner, type RivalId } from '../../src/renderer/src/lib/game/types'

const RIVALS: RivalId[] = ['orc', 'goblin', 'dwarf', 'archmage']
const map = buildMap(7)

function hex(hexes: HexState[], q: number, r: number): HexState {
  const h = hexes.find((x) => x.id === hexId(q, r))
  assert.ok(h, `hex ${q},${r}`)
  return h
}

/** A copy of the map with some hexes handed to new owners. */
function withOwners(hexes: HexState[], owners: Record<string, Owner>): HexState[] {
  return hexes.map((h) => (h.id in owners ? { ...h, owner: owners[h.id] } : { ...h }))
}

const count = <T>(list: T[], pred: (x: T) => boolean): number => list.filter(pred).length
const BENT = bentIds()
/** D-37: where a hex of the straight layout sits on the bent map. */
const bent = (id: string): string => BENT.get(id) ?? id
/** The hex k steps out along a corner ray of the straight layout, where it sits on the bent map. */
const ray = (d: keyof typeof DIRECTIONS, k: number): string => bent(hexId(DIRECTIONS[d].q * k, DIRECTIONS[d].r * k))

/** Checks D-16's village rules on one map (P2-02): the quotas, spacing and per-path credit. */
function villageProblems(hexes: HexState[]): string[] {
  const problems: string[] = []
  const villages = hexes.filter((h) => h.village)
  if (villages.length !== 76) problems.push(`${villages.length} villages`)
  if (count(villages, (h) => h.ring === 2) !== 4) problems.push('heartland villages')
  for (const rival of RIVALS) {
    for (let third = 0; third < 3; third++) {
      const n = count(villages, (h) => h.march === rival && Math.floor((depthOf(h) - 1) / 4) === third)
      if (n !== 5) problems.push(`${rival} third ${third + 1}: ${n}`)
    }
  }
  for (const lair of ['wyrmfells', 'thornwild'] as MarchId[]) {
    const n = count(villages, (h) => h.march === lair)
    if (n !== 6) problems.push(`${lair}: ${n}`)
  }
  const pairs = touchingPairs(villages.map((v) => v.id))
  if (pairs > RULES.map.villages.maxTouchingPairs) problems.push(`${pairs} touching pairs`)
  const credit = Object.values(villageCredits(hexes))
  if (Math.max(...credit) - Math.min(...credit) > RULES.map.villages.maxCreditSpread) problems.push(`credit spread ${credit.join(', ')}`)
  if (villages.some((v) => !isClaimableKind(v) || v.kind === 'lairMouth')) problems.push('a village that can’t be claimed')
  return problems
}

// ── Test 7 (D-16) ────────────────────────────────────────────────────────────

test('Test 7 (D-16): 321 hexes, 298 claimable, 80 rival-held (20 a march at depths 9 to 12), none the player’s', () => {
  assert.equal(map.length, 321)
  assert.equal(new Set(map.map((h) => h.id)).size, 321)
  const claimable = map.filter(isClaimableKind)
  assert.equal(claimable.length, 298)
  assert.equal(count(claimable, (h) => h.owner === 'player'), 0)
  const rivalHeld = claimable.filter((h) => RIVALS.includes(h.owner as RivalId))
  assert.equal(rivalHeld.length, 80)
  assert.equal(count(claimable, (h) => h.owner === 'neutral'), 218)
  for (const rival of RIVALS) {
    const own = rivalHeld.filter((h) => h.owner === rival)
    assert.equal(own.length, 20, rival)
    assert.ok(own.every((h) => h.march === rival && depthOf(h) >= RULES.map.rivalHeldFromDepth), `${rival} holds the outer third of its own march`)
    assert.equal(count(own, (h) => h.kind === 'gate'), 1, `${rival} Gate`)
  }
})

test('Test 7 (D-16, P2-02): 76 villages, 1 in 4: 4 in the heartland, 5 in each third of a rival march, 6 in each lair wedge; spaced; credit within 1', () => {
  assert.deepEqual(villageProblems(map), [])
  for (const rival of RIVALS) {
    const own = map.filter((h) => h.owner === rival && h.village)
    assert.equal(own.length, 5, `${rival}: the Gate and 4 more of its villages`)
    assert.ok(own.some((h) => h.kind === 'gate'))
  }
})

test('Test 7 (D-16): 4 Gates at depth 12, 4 capitals and 8 realm hexes beyond them, 2 Lair Mouths at depth 5, 6 lair hexes, no battlefields', () => {
  assert.equal(count(map, (h) => h.kind === 'gate' && depthOf(h) === 12), 4)
  assert.equal(count(map, (h) => h.kind === 'capital' && h.ring === 15), 4)
  assert.equal(count(map, (h) => h.kind === 'realm' && h.ring === 15), 8)
  assert.equal(count(map, (h) => h.kind === 'lairMouth' && depthOf(h) === 5), 2)
  assert.equal(count(map, (h) => h.kind === 'lair' && h.ring === 8), 6)
  assert.equal(count(map, (h) => h.kind === 'battlefield'), 0, 'C-05: the empty board is drawn on screen only')
  assert.deepEqual(
    fronts().map((f) => [f.front, f.rivals]),
    [
      ['north', ['orc', 'goblin']],
      ['south', ['archmage', 'dwarf']],
      ['west', ['orc', 'archmage']],
      ['east', ['goblin', 'dwarf']]
    ]
  )
})

test('D-16 (P2-05): 22 seams: 6 overlaps near home (Orc–Goblin, Dwarf–Archmage) and 16 lair flanks from depth 2 to 5', () => {
  const seams = map.filter((h) => h.seam)
  assert.equal(seams.length, 22)
  const pair = (h: HexState): string => regionsOf(h).join('-')
  const overlaps = seams.filter((h) => !lairOf(h) && RIVALS.includes(h.march as RivalId) && RIVALS.includes(h.seam as RivalId))
  assert.equal(overlaps.length, 6)
  assert.deepEqual([...new Set(overlaps.map(pair))].sort(), ['dwarf-archmage', 'orc-goblin'])
  assert.ok(overlaps.every((h) => depthOf(h) <= 2))
  const flanks = seams.filter((h) => h.march === 'wyrmfells' || h.march === 'thornwild')
  assert.equal(flanks.length, 16)
  assert.ok(flanks.every((h) => depthOf(h) >= 2 && depthOf(h) <= 5 && RIVALS.includes(h.seam as RivalId)))
  assert.deepEqual([...new Set(flanks.map(pair))].sort(), ['archmage-wyrmfells', 'goblin-thornwild', 'thornwild-dwarf', 'wyrmfells-orc'])
  // C-03: the wedge's neck, touching both rival marches, is plain lair land.
  for (const d of ['W', 'E'] as const) {
    const neck = map.find((h) => h.id === ray(d, 3)) as HexState
    assert.equal(neck.seam, undefined, `${d} neck`)
  }
})

test('D-16: every claimable hex beyond the heartland lies in one march (a seam in two); the heartland lies in none', () => {
  for (const h of map) {
    if (h.ring <= 2) {
      assert.equal(h.march, undefined, h.id)
      assert.deepEqual(regionsOf(h), [])
      continue
    }
    assert.ok(h.march, h.id)
    assert.equal(regionsOf(h).length, h.seam ? 2 : 1, h.id)
  }
  assert.equal(count(map, (h) => h.march === 'wyrmfells' && isClaimableKind(h)), 25)
  for (const rival of RIVALS) assert.equal(count(map, (h) => isClaimableKind(h) && (h.march === rival || h.seam === rival) && !lairOf(h) && !(h.march === 'wyrmfells' || h.march === 'thornwild')), 60, rival)
})

// ── Geometry ─────────────────────────────────────────────────────────────────

test('D-16: the heartland is rings 0 to 2 as Ch 3 built it; beyond, rings hold march hexes only', () => {
  assert.deepEqual(
    [0, 1, 2].map((k) => count(map, (h) => h.ring === k)),
    [1, 6, 12]
  )
  for (const h of map) assert.equal(ringOf(h.id), h.ring)
  for (let k = 0; k <= 6; k++) assert.equal(ringHexes(k).length, Math.max(1, 6 * k))
  // Rings 3 to 5 are wholly marches; from ring 6 the gaps open between them.
  assert.deepEqual([3, 4, 5].map((k) => count(map, (h) => h.ring === k)), [18, 24, 30])
  assert.equal(count(map, (h) => h.ring === 6), 34)
})

test('Ch 3: ring 1 has the Barracks NW, Merchant Hall NE, Mage Tower SW, Foundry SE and wild hexes W and E', () => {
  const at = (d: keyof typeof DIRECTIONS): HexState => hex(map, DIRECTIONS[d].q, DIRECTIONS[d].r)
  assert.deepEqual(
    (['NW', 'NE', 'SW', 'SE'] as const).map((d) => [at(d).kind, at(d).road, at(d).owner]),
    [
      ['building', 'barracks', 'player'],
      ['building', 'merchantHall', 'player'],
      ['building', 'mageTower', 'player'],
      ['building', 'foundry', 'player']
    ]
  )
  for (const [d, land] of [
    ['W', 'west'],
    ['E', 'east']
  ] as const) {
    const wild = at(d)
    assert.equal(wild.kind, 'between')
    assert.equal(wild.land, land)
    assert.equal(wild.owner, 'neutral')
    assert.equal(wild.village, undefined, 'A-15: the Hearth wild hexes are beast dens')
  }
  assert.deepEqual([hex(map, 0, 0).kind, hex(map, 0, 0).owner], ['castle', 'player'])
})

test('D-16: each road runs down the middle of its rival’s march: the building, road to depth 11, the Gate at 12, the capital beyond', () => {
  const roads: [keyof typeof DIRECTIONS, BuildingId, RivalId][] = [
    ['NW', 'barracks', 'orc'],
    ['NE', 'merchantHall', 'goblin'],
    ['SW', 'mageTower', 'archmage'],
    ['SE', 'foundry', 'dwarf']
  ]
  const caps = capitals(map)
  for (const [d, building, rival] of roads) {
    const line = Array.from({ length: 15 }, (_, i) => map.find((h) => h.id === ray(d, i + 1)) as HexState)
    assert.deepEqual(
      line.map((h) => h.kind),
      ['building', ...Array(12).fill('road'), 'gate', 'capital']
    )
    assert.ok(line.every((h) => h.road === building), `${building} road`)
    assert.ok(line.slice(2).every((h) => h.march === rival), `${rival} march`)
    assert.deepEqual(
      line.map((h) => h.owner),
      ['player', ...Array(9).fill('neutral'), ...Array(5).fill(rival)],
      `${building} road owners`
    )
    assert.equal(caps[rival], line[14].id)
  }
})

test('D-16: the W ray leads into the Wyrmfells’ wedge and the E ray into the Thornwild’s, each to its Lair Mouth at depth 5', () => {
  for (const [d, land, lair] of [
    ['W', 'west', 'wyrmfells'],
    ['E', 'east', 'thornwild']
  ] as const) {
    const line = Array.from({ length: 8 }, (_, i) => map.find((h) => h.id === ray(d, i + 1)) as HexState)
    assert.ok(line.every((h) => h.land === land && h.road === undefined))
    assert.ok(line.slice(2).every((h) => h.march === lair))
    assert.deepEqual([line[6].kind, line[6].mythic, line[6].owner], ['lairMouth', true, 'neutral'])
    assert.equal(line[7].kind, 'lair')
    assert.equal(lairOf(line[6]), lair)
    const lairHexes = map.filter((h) => h.kind === 'lair' && h.land === land)
    assert.equal(lairHexes.length, 3)
    assert.ok(lairHexes.every((h) => lairOf(h) === lair && h.owner === 'neutral'))
    // The wedge widens 2 a depth: rows of 1, 3, 5, 7 and 9.
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((depth) => count(map, (h) => h.march === lair && depthOf(h) === depth)),
      [1, 3, 5, 7, 9]
    )
  }
})

test('D-16: the rim: capitals and realm hexes are their rivals’ and nobody can claim them; lair hexes are nobody’s', () => {
  for (const h of map.filter((x) => x.kind === 'capital' || x.kind === 'realm' || x.kind === 'lair')) assert.ok(!isClaimableKind(h), h.id)
  for (const rival of RIVALS) {
    const realm = map.filter((h) => h.kind === 'realm' && h.owner === rival)
    assert.equal(realm.length, 2, rival)
    for (const h of realm) assert.equal(hexDistance(h.id, capitals(map)[rival]), 1)
  }
})

test('hexDistance, neighbors and ringOf', () => {
  assert.equal(hexDistance('0,0', '3,-3'), 3)
  assert.equal(hexDistance({ q: -2, r: 1 }, { q: 2, r: -1 }), 4)
  assert.deepEqual(neighbors('0,0'), ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'])
  const capital = neighbors(ray('NW', 15))
  for (const id of [ray('NW', 14), bent(hexId(-1, -14)), bent(hexId(1, -15))]) assert.ok(capital.includes(id), 'a capital touches its Gate and its two realm hexes')
  for (const h of map) for (const n of neighbors(h.id)) assert.equal(hexDistance(h.id, n), 1)
  for (const h of map) for (const n of neighbors(h.id)) assert.ok(onMap(n), 'neighbors are on the map only')
  assert.equal(ringOf('-4,1'), 4)
  assert.ok(!map.some((h) => Object.is(h.q, -0) || Object.is(h.r, -0)), 'no −0 coordinates')
})

test('hexLabel counts clockwise from 1 at the NW corner of each ring (A-109)', () => {
  assert.equal(hexLabel('0,0'), '0-1')
  assert.equal(hexLabel('0,-1'), '1-1') // Barracks, NW
  assert.equal(hexLabel('1,-1'), '1-2') // Merchant Hall, NE
  assert.equal(hexLabel('1,0'), '1-3') // E wild hex
  assert.equal(hexLabel('-1,0'), '1-6') // W wild hex
  assert.equal(hexLabel('0,-3'), '3-1')
  assert.equal(hexLabel('1,-3'), '3-2')
  assert.equal(hexLabel('-1,-2'), '3-18')
  assert.equal(hexLabel(ray('NW', 14)), `14-${bendShift(14) + 1}`, 'D-37: the Orc’s Gate, a corner of the straight ring, turned with its ring')
  assert.equal(new Set(map.map((h) => hexLabel(h))).size, 321)
})

test('every hex has its own place name, and the codex names only map hexes (D-07, D-20)', () => {
  const ids = new Set(map.map((h) => h.id))
  assert.equal(CODEX.hexes.length, map.length)
  for (const entry of CODEX.hexes) {
    assert.ok(ids.has(entry.id), `${entry.name} names no hex (${entry.id})`)
    assert.equal(entry.label, hexLabel(entry.id), `${entry.name}'s label`)
  }
  assert.equal(new Set(map.map((h) => hexName(h))).size, map.length)
})

test('hexName reads the codex; the names of Gates, capitals and Lair Mouths moved with their kind (D-20)', () => {
  assert.equal(hexName('0,0'), 'Crownhold')
  assert.equal(hexName(capitals(map).archmage), 'Caer Emrys')
  assert.equal(hexName(capitals(map).dwarf), 'Kaldor Deep')
  assert.equal(hexName(ray('NW', 14)), 'Ashgate') // the Orc's Gate, now at depth 12
  assert.notEqual(hexName('0,-3'), hexLabel('0,-3'))
})

// ── The bent marches (Patch 5, D-37) ─────────────────────────────────────────

test('D-37: each ring beyond the heartland turns clockwise a step every three rings, and every hex keeps its ring', () => {
  assert.deepEqual(
    Array.from({ length: 16 }, (_, k) => bendShift(k)),
    [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]
  )
  for (const h of map) {
    const from = straightId(h.id)
    const ring = ringHexes(h.ring)
    const p = ring.findIndex((a) => hexId(a.q, a.r) === from)
    assert.ok(p >= 0, `${h.id} sat on its own ring`)
    assert.equal(h.id, hexId(ring[(p + bendShift(h.ring)) % ring.length].q, ring[(p + bendShift(h.ring)) % ring.length].r))
  }
  assert.equal(map.filter((h) => straightId(h.id) !== h.id).length, 260)
})

test('D-37: every road runs unbroken from its building to its capital, and every claimable hex is reachable from the castle', () => {
  for (const road of ['barracks', 'merchantHall', 'mageTower', 'foundry'] as BuildingId[]) {
    const line = map.filter((h) => h.road === road).sort((a, b) => a.ring - b.ring)
    assert.equal(line.length, 15)
    for (let i = 1; i < line.length; i++) assert.ok(neighbors(line[i].id).includes(line[i - 1].id), `${road} at ring ${line[i].ring}`)
  }
  const claimable = new Set(map.filter((h) => isClaimableKind(h) || h.kind === 'castle').map((h) => h.id))
  const seen = new Set(['0,0'])
  const queue = ['0,0']
  while (queue.length > 0) for (const n of neighbors(queue.shift() as string)) if (claimable.has(n) && !seen.has(n)) (seen.add(n), queue.push(n))
  assert.equal(seen.size, claimable.size, 'no claimable hex is cut off')
})

test('C-57: the strongholds stay on their roads, at depths 4 and 8, as on the straight layout', () => {
  const held = strongholds(map)
  assert.equal(held.size, 8)
  for (const [id, s] of held) {
    const h = map.find((x) => x.id === id) as HexState
    assert.equal(depthOf(h), s.depth)
    assert.equal(h.march, s.march)
    const road = map.find((x) => x.march === s.march && x.ring === h.ring && x.kind === 'road') as HexState
    assert.ok(id === road.id || (road.village && hexDistance(id, road.id) === 1), `${s.march} at depth ${s.depth}: on the road, or beside a village road`)
  }
})

test('C-54: a seam’s ruling march is drawn on its straight-layout id, so the bend never changes a day already played', () => {
  const seams = map.filter((h) => h.seam)
  assert.equal(seams.length, 22)
  assert.ok(seams.some((h) => straightId(h.id) !== h.id), 'some seams moved')
  for (const h of seams) {
    for (const day of ['2026-10-01', '2026-11-15', '2027-03-02']) {
      const want = draw(7, day, `seam:${straightId(h.id)}`) < RULES.map.seamFirstChance ? h.march : h.seam
      assert.equal(rulingMarch(7, h, day), want)
    }
  }
})

// ── Strength, bands and loyalty (D-17) ───────────────────────────────────────

test('D-17: a hex’s strength is the heartland’s base(ring), or its march’s depth curve within its seeded jitter', () => {
  const c = RULES.land.depthCurve
  for (const h of map) {
    if (h.ring <= 2) {
      assert.equal(h.strength, h.ring === 0 ? 0 : RULES.land.baseGarrison[h.ring - 1], `${h.id}: the heartland, buildings too, since threats strike them`)
      continue
    }
    if (!isClaimableKind(h)) {
      assert.equal(h.strength, 0, h.id)
      continue
    }
    const curve = h.march === 'wyrmfells' || h.march === 'thornwild' ? c.lair : c.rival
    const mid = curve.first * depthOf(h) ** curve.exponent
    assert.ok(h.strength >= mid * (1 - c.jitter) - 1e-9 && h.strength <= mid * (1 + c.jitter) + 1e-9, `${h.id}: ${h.strength} against ${mid}`)
  }
  // Deeper is harder: each row's mean beats the row three depths nearer home (the jitter can blur neighbors).
  const mean = (depth: number): number => {
    const row = map.filter((h) => h.march === 'orc' && depthOf(h) === depth && isClaimableKind(h))
    return row.reduce((s, h) => s + h.strength, 0) / row.length
  }
  for (let d = 4; d <= 12; d++) assert.ok(mean(d) > mean(d - 3), `depth ${d}`)
  assert.notDeepEqual(
    map.map((h) => h.strength),
    buildMap(8).map((h) => h.strength),
    'another seed, other jitters'
  )
})

test('Ch 6, A-17, D-17: starting garrisons: the wilds’ share of a hex’s strength; a rival’s multiplier on its land; the Lair Mouth’s mythic', () => {
  const close = (actual: number, expected: number, what: string): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} ≠ ${expected}`)
  close(hex(map, -1, 0).garrison, 0.9 * 15, 'Hearth wild hex (beasts)')
  const ring2den = map.find((h) => h.ring === 2 && !h.village) as HexState
  close(ring2den.garrison, 0.9 * 18, 'a ring-2 den') // D-14: ring 2's base is 18
  for (const v of map.filter((h) => h.village && h.owner === 'neutral')) close(v.garrison, 0.6 * wildBase(v), `village militia ${v.id}`)
  for (const d of map.filter((h) => !h.village && h.owner === 'neutral' && isClaimableKind(h) && h.kind !== 'lairMouth')) close(d.garrison, wildGarrison(d, false), `beast den ${d.id}`)
  for (const rival of RIVALS) {
    for (const h of map.filter((x) => x.owner === rival && isClaimableKind(x))) close(h.garrison, h.strength * RULES.land.rivalGarrisonMult[rival], `${rival} ${h.id}`)
  }
  for (const h of map.filter((x) => x.kind === 'lairMouth')) close(h.garrison, 1.15 * h.strength, 'Lair Mouth')
  for (const h of map) {
    assert.equal(h.fortification, 0, 'P2-03: unfortified at founding')
    assert.equal(h.garrisonDamage, 0)
    assert.equal(h.status, 'held')
  }
})

test('D-17: bands: the heartland’s rings 1 and 2, then 3 / 4 / 5 every 4 depths of a rival march and every 2 of a lair’s', () => {
  const band = (march: MarchId | undefined, depth: number): number => bandOf({ ring: depth + 2, march })
  assert.deepEqual([1, 2].map((ring) => bandOf({ ring })), [1, 2])
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => band('orc', i + 1)),
    [3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]
  )
  assert.deepEqual(
    Array.from({ length: 5 }, (_, i) => band('wyrmfells', i + 1)),
    [3, 3, 4, 4, 5]
  )
  assert.equal(band('dwarf', 13), 5, 'the rim is band 5')
})

test('A-13, D-17: starting loyalty is 15 × band for neutral villages and 30 × band for rival villages', () => {
  for (const v of map.filter((h) => h.village)) assert.equal(v.village?.loyalty, (v.owner === 'neutral' ? 15 : 30) * bandOf(v), v.id)
  assert.equal(map.find((h) => h.id === ray('NW', 14))?.village?.loyalty, 150, 'the Orc Gate, band 5 (×2 applies when courted, A-16)')
})

// ── Path shares (D-18) ───────────────────────────────────────────────────────

test('D-18: path shares: a rival march hex is its rival’s; a lair’s is half each of its neighbors’; a seam is half each side’s; they sum to 1', () => {
  for (const h of map.filter(isClaimableKind)) {
    const shares = pathShares(h)
    const total = Object.values(shares).reduce((s, v) => s + (v ?? 0), 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `${h.id}: ${total}`)
  }
  assert.deepEqual(pathShares(hex(map, 0, -6)), { orc: 1 })
  assert.deepEqual(pathShares(hex(map, -6, 0)), { orc: 0.5, archmage: 0.5 }, 'the Wyrmfells')
  const overlap = map.find((h) => regionsOf(h).join('-') === 'orc-goblin') as HexState
  assert.deepEqual(pathShares(overlap), { orc: 0.5, goblin: 0.5 })
  const flank = map.find((h) => regionsOf(h).join('-') === 'wyrmfells-orc') as HexState
  assert.deepEqual(pathShares(flank), { orc: 0.75, archmage: 0.25 })
  // C-04: the heartland faces its marches; the first Hearth hex gives 1 Dominion, half to each of two paths (D-14).
  assert.deepEqual(pathShares(hex(map, -1, 0)), { orc: 0.5, archmage: 0.5 })
  assert.equal(hexWorth(hex(map, -1, 0)), 1)
  assert.deepEqual(pathShares(hex(map, 0, -2)), { orc: 1 })
  assert.deepEqual(pathShares(hex(map, 0, 0)), {}, 'the castle gives none')
  assert.equal(hexWorth(hex(map, 0, -9)), 7, 'a march hex is worth its depth')
})

// ── Seams (P2-06) ────────────────────────────────────────────────────────────

test('P2-06: a seam’s ruling march is drawn each day from the seed; a hex with one march is always ruled by it', () => {
  const seam = map.find((h) => h.seam) as HexState
  const days = Array.from({ length: 60 }, (_, i) => `2026-11-${String((i % 30) + 1).padStart(2, '0')}`)
  const ruled = new Set(days.map((d) => rulingMarch(7, seam, d)))
  assert.deepEqual([...ruled].sort(), [seam.march, seam.seam].sort())
  assert.equal(rulingMarch(7, seam, '2026-11-03'), rulingMarch(7, seam, '2026-11-03'))
  assert.equal(rulingMarch(7, hex(map, 0, -6), '2026-11-03'), 'orc')
  assert.equal(rulingMarch(7, hex(map, 0, 0), '2026-11-03'), undefined)
})

// ── Determinism and village seeding ──────────────────────────────────────────

test('Ch 2 rule 7: buildMap(7) run twice gives identical JSON', () => {
  assert.equal(JSON.stringify(buildMap(7)), JSON.stringify(buildMap(7)))
  assert.deepEqual(buildMap(7), map)
  assert.notEqual(
    JSON.stringify(buildMap(7).filter((h) => h.village).map((h) => h.id)),
    JSON.stringify(buildMap(8).filter((h) => h.village).map((h) => h.id)),
    'a different seed seeds different villages'
  )
})

test('D-16: for 100 seeds every map satisfies the village rules within the attempt limit', () => {
  const layouts = new Set<string>()
  for (let seed = 1; seed <= 100; seed++) {
    const seeding = seedVillages(seed)
    assert.ok(seeding.attempt < RULES.map.villages.maxAttempts)
    const m = buildMap(seed)
    assert.deepEqual(villageProblems(m), [], `seed ${seed}`)
    assert.deepEqual(m.filter((h) => h.village).map((h) => h.id), seeding.ids)
    layouts.add(seeding.ids.join(' '))
  }
  assert.ok(layouts.size > 90, `only ${layouts.size} distinct village layouts`)
})

// ── Borders and adjacency ────────────────────────────────────────────────────

test('Ch 3 rule 1: touchesOwner and border hexes', () => {
  assert.ok(touchesOwner(map, '-1,0', 'player'), 'the W wild hex touches the castle')
  assert.ok(!touchesOwner(map, '-2,0', 'player'))
  assert.ok(touchesOwner(map, ray('NW', 10), 'orc'), 'the depth-8 road touches the Orc’s land')
  assert.deepEqual(borderHexes(map, 'player').sort(), ['-1,1', '0,-1', '0,0', '0,1', '1,-1'].sort())
  const grown = withOwners(map, { '-1,0': 'player', '1,0': 'player' })
  assert.ok(!isBorderHex(grown, '0,0', 'player'), 'the castle is surrounded by the player’s land')
  assert.ok(isBorderHex(grown, '-1,0', 'player'))
  assert.ok(!isBorderHex(grown, '-2,0', 'player'), 'not held')
  // The Orc’s border is its front row: depth 9.
  const orcBorder = map.filter((h) => isBorderHex(map, h.id, 'orc'))
  assert.equal(orcBorder.length, 5)
  assert.ok(orcBorder.every((h) => depthOf(h) === RULES.map.rivalHeldFromDepth))
})

// ── claimableBy ──────────────────────────────────────────────────────────────

test('Ch 3 rule 2 (A-15): rivalExpand is false for every hex in rings 0 to 2, even beside rival land', () => {
  for (const rival of RIVALS) {
    const owners: Record<string, Owner> = {}
    for (const h of map) if (h.ring === 3) owners[h.id] = rival
    const m = withOwners(map, owners)
    for (const h of m.filter((x) => x.ring <= 2)) {
      assert.equal(claimableBy(m, h.id, rival, 'rivalExpand'), false, `${rival} ${h.id}`)
      assert.equal(claimableBy(m, h.id, rival, 'assault'), false, `${rival} assault ${h.id}`)
      assert.equal(claimableBy(m, h.id, rival, 'court'), false, `${rival} court ${h.id}`)
    }
    assert.ok(m.some((h) => h.ring === 4 && claimableBy(m, h.id, rival, 'rivalExpand')), `${rival} can still expand outward`)
  }
})

test('A-25: a rival expands only into adjacent neutral hexes', () => {
  assert.ok(claimableBy(map, ray('NW', 10), 'orc', 'rivalExpand'), 'the depth-8 road beside its land')
  assert.ok(!claimableBy(map, ray('NW', 9), 'orc', 'rivalExpand'), 'not adjacent')
  assert.ok(!claimableBy(map, ray('NE', 10), 'orc', 'rivalExpand'), 'not the Goblin’s march')
  const m = withOwners(map, { [ray('NW', 10)]: 'player' })
  assert.ok(!claimableBy(m, ray('NW', 10), 'orc', 'rivalExpand'), 'not the player’s land')
  assert.ok(!claimableBy(map, ray('NW', 10), 'player', 'rivalExpand'))
})

test('Ch 3 rules 4 to 6, A-16: capitals, Gates and Lair Mouths are never assaulted; capitals, realms and lairs are never claimable', () => {
  // Give the player every claimable hex except the targets, so adjacency always holds.
  const owners: Record<string, Owner> = {}
  for (const h of map) if (isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'lairMouth') owners[h.id] = 'player'
  const m = withOwners(map, owners)
  const gates: Record<string, Owner> = { ...owners }
  for (const h of map) if (h.kind === 'gate') gates[h.id] = 'player'
  const withGates = withOwners(map, gates)
  for (const [mm, kinds] of [
    [m, ['gate', 'lairMouth']],
    [withGates, ['capital']]
  ] as const) {
    for (const h of mm.filter((x) => (kinds as readonly string[]).includes(x.kind))) {
      assert.ok(touchesOwner(mm, h.id, 'player'), `${h.id} is adjacent`)
      assert.equal(claimableBy(mm, h.id, 'player', 'assault'), false, `assault ${h.kind} ${h.id}`)
      assert.equal(claimableBy(mm, h.id, 'player', 'buy'), false, `buy ${h.kind} ${h.id}`)
      assert.equal(claimableBy(mm, h.id, 'player', 'court'), h.kind === 'gate', `court ${h.kind} ${h.id}`)
    }
  }
  for (const h of withGates.filter((x) => x.kind === 'capital' || x.kind === 'realm' || x.kind === 'lair')) {
    for (const method of ['assault', 'court', 'buy'] as const) assert.equal(claimableBy(withGates, h.id, 'player', method), false, `${method} ${h.id}`)
  }
  // A rival hex beside the player's land can be bought; while the Orc's strongholds stand (D-23), it can't be assaulted.
  const front = withOwners(map, { [ray('NW', 10)]: 'player' })
  assert.equal(claimableBy(front, ray('NW', 11), 'player', 'assault'), false)
  assert.ok(claimableBy(front, ray('NW', 11), 'player', 'buy'))
  const held = withOwners(front, Object.fromEntries([...strongholds(front)].filter(([, s]) => s.march === 'orc').map(([id]) => [id, 'player' as Owner])))
  assert.ok(claimableBy(held, ray('NW', 11), 'player', 'assault'))
})

test('Ch 6: courting only villages; buying only rival hexes; adjacency always required', () => {
  const m = withOwners(map, { '-1,0': 'player' })
  for (const h of m) {
    if (!h.village && claimableBy(m, h.id, 'player', 'court')) assert.fail(`courted non-village ${h.id}`)
    if (h.owner === 'neutral' && claimableBy(m, h.id, 'player', 'buy')) assert.fail(`bought neutral ${h.id}`)
    for (const method of ['assault', 'court', 'buy'] as const) {
      if (claimableBy(m, h.id, 'player', method)) assert.ok(touchesOwner(m, h.id, 'player'), `${method} ${h.id}`)
    }
  }
  assert.ok(claimableBy(map, '-1,0', 'player', 'assault'), 'the W wild hex from day 1')
  assert.ok(!claimableBy(map, '-1,0', 'player', 'court'), 'a beast den, not a village')
  assert.ok(!claimableBy(map, '0,-1', 'player', 'assault'), 'already the player’s')
  assert.ok(!claimableBy(map, '0,0', 'orc', 'assault'), 'the castle')
  assert.ok(!claimableBy(map, '0,-4', 'neutral', 'assault'))
  // A-23: rivals never court the player's villages.
  const village = map.find((h) => h.march === 'orc' && depthOf(h) === 8 && h.village && h.owner === 'neutral') as HexState
  const near = neighbors(village.id).find((n) => (map.find((h) => h.id === n) as HexState).ring === village.ring + 1) as string
  const held = withOwners(map, { [village.id]: 'player', [near]: 'orc' })
  assert.ok(!claimableBy(held, village.id, 'orc', 'court'))
  assert.ok(claimableBy(held, village.id, 'orc', 'assault'), 'a conquest attempt is still possible')
})

test('claimableBy throws on an unknown hex', () => {
  assert.throws(() => claimableBy(map, '40,40', 'player', 'assault'), RangeError)
})

// ── Dev helper ───────────────────────────────────────────────────────────────

test('mapAscii prints 31 rows with the castle in the middle and the empty board blank', () => {
  const rows = mapAscii(map).split('\n')
  assert.equal(rows.length, 2 * 15 + 1)
  assert.ok(rows[15].includes('. P .'), 'the castle between the two Hearth wilds')
  assert.ok(rows[0].trim().startsWith('O'), 'the Orc’s realm at the top left')
  assert.ok(MAP_ASCII_LEGEND.includes('empty board'))
  assert.equal(RIVAL_IDS.length, 4)
})
