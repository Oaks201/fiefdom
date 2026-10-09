import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIRECTIONS,
  LAND_BUILDINGS,
  borderHexes,
  buildMap,
  capitals,
  claimableBy,
  dominion,
  fronts,
  hexDistance,
  hexId,
  hexLabel,
  hexName,
  isBorderHex,
  isClaimableKind,
  lairOf,
  neighbors,
  ringHexes,
  ringOf,
  seedVillages,
  touchesOwner,
  villageCredits
} from '../../src/renderer/src/lib/game/map'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { MAP_ASCII_LEGEND, mapAscii } from '../../src/renderer/src/lib/game/dev/mapAscii'
import { BUILDING_IDS, type BuildingId, type HexState, type Land, type Owner, type RivalId } from '../../src/renderer/src/lib/game/types'

const RIVALS: RivalId[] = ['orc', 'goblin', 'dwarf', 'archmage']
const LANDS: Land[] = ['north', 'south', 'west', 'east']
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

/** Checks the A-13 / A-108 placement rules on one map. */
function villageProblems(hexes: HexState[]): string[] {
  const problems: string[] = []
  const byId = new Map(hexes.map((h) => [h.id, h]))
  const seeded = hexes.filter((h) => h.village && h.owner === 'neutral')
  const byRing = [2, 3, 4].map((ring) => count(seeded, (h) => h.ring === ring))
  if (byRing.join('/') !== '4/6/8') problems.push(`seeded split ${byRing.join('/')}`)
  let pairs = 0
  for (const v of seeded) {
    for (const n of neighbors(v.id).map((id) => byId.get(id) as HexState)) {
      if (!n.village) continue
      if (n.owner !== 'neutral') problems.push(`${v.id} touches rival village ${n.id}`)
      else if (n.ring === v.ring) problems.push(`${v.id} touches ${n.id} in its own ring`)
      else pairs += 0.5
    }
  }
  if (pairs > 2) problems.push(`${pairs} touching pairs`)
  const credit = Object.values(villageCredits(hexes))
  if (Math.max(...credit) - Math.min(...credit) > 1) problems.push(`credit spread ${credit.join(', ')}`)
  return problems
}

// ── Test 7 (E-06) ────────────────────────────────────────────────────────────

test('Test 7 (E-06): 127 hexes, 86 claimable, 12 rival-held, 74 neutral claimable', () => {
  assert.equal(map.length, 127)
  assert.equal(new Set(map.map((h) => h.id)).size, 127)
  const claimable = map.filter(isClaimableKind)
  assert.equal(claimable.length, 86)
  assert.equal(count(claimable, (h) => h.owner === 'neutral'), 74)
  assert.equal(count(claimable, (h) => h.owner === 'player'), 0)
  const rivalHeld = claimable.filter((h) => RIVALS.includes(h.owner as RivalId))
  assert.equal(rivalHeld.length, 12)
  for (const rival of RIVALS) {
    const own = rivalHeld.filter((h) => h.owner === rival)
    assert.equal(own.length, 3, rival)
    assert.equal(count(own, (h) => h.kind === 'gate'), 1, `${rival} Gate`)
    assert.ok(own.every((h) => h.ring === 5 && h.village), `${rival} March and Gate are ring-5 villages`)
    const gate = own.find((h) => h.kind === 'gate') as HexState
    for (const march of own.filter((h) => h !== gate)) assert.equal(hexDistance(march.id, gate.id), 1)
  }
})

test('Test 7 (E-06, A-108): 30 villages, 12 rival plus 18 seeded split 4/6/8 by ring', () => {
  const villages = map.filter((h) => h.village)
  assert.equal(villages.length, 30)
  assert.equal(count(villages, (h) => h.owner !== 'neutral'), 12)
  const seeded = villages.filter((h) => h.owner === 'neutral')
  assert.deepEqual(
    [2, 3, 4].map((ring) => count(seeded, (h) => h.ring === ring)),
    [4, 6, 8]
  )
  assert.ok(villages.every((h) => isClaimableKind(h) && h.kind !== 'lairMouth'))
})

test('Test 7 (A-108): no seeded village touches a rival village or one in its own ring; at most 2 pairs touch', () => {
  assert.deepEqual(villageProblems(map), [])
})

test('Test 7 (E-06): 4 capitals, 8 realm hexes, 6 lair hexes, 18 battlefields (3/3/6/6), 2 Lair Mouths', () => {
  assert.equal(count(map, (h) => h.kind === 'capital'), 4)
  assert.equal(count(map, (h) => h.kind === 'realm'), 8)
  assert.equal(count(map, (h) => h.kind === 'lair'), 6)
  assert.equal(count(map, (h) => h.kind === 'battlefield'), 18)
  assert.equal(count(map, (h) => h.kind === 'lairMouth'), 2)
  assert.deepEqual(
    fronts().map((f) => [f.front, f.battlefields.length]),
    [
      ['north', 3],
      ['south', 3],
      ['west', 6],
      ['east', 6]
    ]
  )
})

// ── Geometry ─────────────────────────────────────────────────────────────────

test('Ch 3: rings hold 1, 6, 12, 18, 24, 30 and 36 hexes', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((k) => count(map, (h) => h.ring === k)),
    [1, 6, 12, 18, 24, 30, 36]
  )
  for (const h of map) assert.equal(ringOf(h.id), h.ring)
  for (let k = 0; k <= 6; k++) assert.equal(ringHexes(k).length, Math.max(1, 6 * k))
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

test('Ch 3: the roads run NW Barracks → Orc, NE Merchant Hall → Goblin, SW Mage Tower → Archmage, SE Foundry → Dwarf', () => {
  const roads: [keyof typeof DIRECTIONS, BuildingId, RivalId][] = [
    ['NW', 'barracks', 'orc'],
    ['NE', 'merchantHall', 'goblin'],
    ['SW', 'mageTower', 'archmage'],
    ['SE', 'foundry', 'dwarf']
  ]
  const caps = capitals(map)
  for (const [d, building, rival] of roads) {
    const ray = [1, 2, 3, 4, 5, 6].map((k) => hex(map, DIRECTIONS[d].q * k, DIRECTIONS[d].r * k))
    assert.deepEqual(
      ray.map((h) => h.kind),
      ['building', 'road', 'road', 'road', 'gate', 'capital']
    )
    assert.ok(ray.every((h) => h.road === building && h.land === undefined))
    assert.deepEqual(
      ray.map((h) => h.owner),
      ['player', 'neutral', 'neutral', 'neutral', rival, rival],
      `${building} road`
    )
    assert.equal(caps[rival], ray[5].id)
  }
  assert.equal(count(map, (h) => h.road !== undefined), 24)
})

test('Ch 3: the W ray leads to the Wyrmfells and the E ray to the Thornwild', () => {
  for (const [d, land, lair] of [
    ['W', 'west', 'wyrmfells'],
    ['E', 'east', 'thornwild']
  ] as const) {
    const ray = [1, 2, 3, 4, 5, 6].map((k) => hex(map, DIRECTIONS[d].q * k, DIRECTIONS[d].r * k))
    assert.ok(ray.every((h) => h.land === land && h.road === undefined))
    assert.deepEqual([ray[4].kind, ray[4].mythic, ray[4].owner], ['lairMouth', true, 'neutral'])
    assert.equal(ray[5].kind, 'lair')
    assert.equal(lairOf(ray[4]), lair)
    const lairHexes = map.filter((h) => h.kind === 'lair' && h.land === land)
    assert.equal(lairHexes.length, 3)
    assert.ok(lairHexes.every((h) => lairOf(h) === lair && h.owner === 'neutral'))
  }
})

test('Ch 3: between-land counts per ring are k − 1 / k − 1 / 2k − 1 / 2k − 1 for k = 1 to 5', () => {
  for (let k = 1; k <= 5; k++) {
    const ring = map.filter((h) => h.ring === k)
    assert.deepEqual(
      LANDS.map((land) => count(ring, (h) => h.land === land)),
      [k - 1, k - 1, 2 * k - 1, 2 * k - 1],
      `ring ${k}`
    )
    assert.equal(count(ring, (h) => h.road !== undefined), 4)
  }
  // Check from the task text: ring 2 is North 1 + South 1 + West 3 + East 3 + 4 road hexes.
  assert.equal(count(map, (h) => h.ring === 2), 1 + 1 + 3 + 3 + 4)
})

test('Ch 3: ring 5 has 4 Gates, 8 March hexes, 2 Lair Mouths and 16 neutral frontier hexes', () => {
  const ring5 = map.filter((h) => h.ring === 5)
  assert.equal(count(ring5, (h) => h.kind === 'gate'), 4)
  assert.equal(count(ring5, (h) => h.kind === 'between' && h.owner !== 'neutral'), 8)
  assert.equal(count(ring5, (h) => h.kind === 'lairMouth'), 2)
  assert.equal(count(ring5, (h) => h.kind === 'between' && h.owner === 'neutral'), 16)
})

test('Ch 3: the Rim: capitals and realms are the rivals, battlefields and lairs are nobody’s', () => {
  const rim = map.filter((h) => h.ring === 6)
  assert.ok(rim.every((h) => !isClaimableKind(h)))
  for (const h of rim) {
    if (h.kind === 'battlefield' || h.kind === 'lair') assert.equal(h.owner, 'neutral', h.id)
    else assert.ok(RIVALS.includes(h.owner as RivalId), h.id)
  }
  for (const rival of RIVALS) {
    const realm = rim.filter((h) => h.kind === 'realm' && h.owner === rival)
    assert.equal(realm.length, 2, rival)
    for (const h of realm) assert.equal(hexDistance(h.id, capitals(map)[rival]), 1)
  }
})

test('Ch 12: the four Rim fronts and their battlefields', () => {
  const f = fronts()
  assert.deepEqual(
    f.map((x) => [x.front, x.rivals]),
    [
      ['north', ['orc', 'goblin']],
      ['south', ['archmage', 'dwarf']],
      ['west', ['orc', 'archmage']],
      ['east', ['goblin', 'dwarf']]
    ]
  )
  const all = f.flatMap((x) => x.battlefields)
  assert.equal(new Set(all).size, 18)
  for (const x of f) {
    for (const id of x.battlefields) {
      const h = map.find((m) => m.id === id) as HexState
      assert.equal(h.kind, 'battlefield')
      assert.equal(h.land, x.front)
    }
  }
})

test('hexDistance, neighbors and ringOf', () => {
  assert.equal(hexDistance('0,0', '3,-3'), 3)
  assert.equal(hexDistance({ q: -2, r: 1 }, { q: 2, r: -1 }), 4)
  assert.deepEqual(neighbors('0,0'), ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'])
  assert.equal(neighbors('0,-6').length, 3, 'a Rim corner touches 3 map hexes')
  assert.equal(neighbors('1,-6').length, 4, 'a Rim edge hex touches 4 map hexes')
  for (const h of map) for (const n of neighbors(h.id)) assert.equal(hexDistance(h.id, n), 1)
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
  assert.equal(hexLabel(hex(map, 0, -5)), '5-1')
  assert.equal(new Set(map.map((h) => hexLabel(h))).size, 127)
})

test('every hex has its own place name, and the codex names only map hexes (D-07)', () => {
  const ids = new Set(map.map((h) => h.id))
  assert.equal(CODEX.hexes.length, map.length)
  for (const entry of CODEX.hexes) {
    assert.ok(ids.has(entry.id), `${entry.name} names no hex (${entry.id})`)
    assert.equal(entry.label, hexLabel(entry.id), `${entry.name}'s label`)
  }
  assert.equal(new Set(map.map((h) => hexName(h))).size, map.length)
})

test('hexName reads the codex for an id, coordinates or a hex (D-07)', () => {
  assert.equal(hexName('0,0'), 'Crownhold')
  assert.equal(hexName({ q: -6, r: 6 }), 'Caer Emrys') // the Archmage's capital, SW
  assert.equal(hexName(hex(map, 0, 6)), 'Kaldor Deep') // the Dwarf's capital, SE
  assert.notEqual(hexName('0,-3'), hexLabel('0,-3'))
})

// ── Starting garrisons and loyalty ───────────────────────────────────────────

test('Ch 6 and A-17: starting garrisons by holder', () => {
  const close = (actual: number, expected: number, what: string): void =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} ≠ ${expected}`)
  close(hex(map, -1, 0).garrison, 0.9 * 15, 'Hearth wild hex (beasts)')
  close(hex(map, 0, -2).garrison, 0.9 * 22, 'ring-2 road den')
  for (const v of map.filter((h) => h.village && h.owner === 'neutral')) {
    close(v.garrison, 0.6 * [15, 22, 55, 115, 200][v.ring - 1], `village militia ${v.id}`)
  }
  const mult: Record<RivalId, number> = { orc: 1.0, goblin: 0.9, dwarf: 1.3, archmage: 1.1 }
  for (const rival of RIVALS) {
    for (const h of map.filter((x) => x.owner === rival && isClaimableKind(x))) close(h.garrison, 200 * mult[rival], `${rival} ${h.id}`)
  }
  for (const h of map.filter((x) => x.kind === 'lairMouth')) close(h.garrison, 1.15 * 200, 'Lair Mouth')
  for (const h of map.filter((x) => !isClaimableKind(x))) assert.equal(h.garrison, 0, h.id)
  for (const h of map) {
    assert.equal(h.fortification, 0)
    assert.equal(h.garrisonDamage, 0)
    assert.equal(h.status, 'held')
  }
})

test('A-13: starting loyalty is 15 × ring for neutral villages and 30 × ring for rival villages', () => {
  for (const v of map.filter((h) => h.village)) {
    assert.equal(v.village?.loyalty, (v.owner === 'neutral' ? 15 : 30) * v.ring, v.id)
  }
  assert.equal(hex(map, 0, -5).village?.loyalty, 150, 'the Orc Gate (×2 applies when courted, A-16)')
})

// ── Dominion ─────────────────────────────────────────────────────────────────

test('Ch 3: Dominion available through rings 1 to 5 is 1, 13, 40, 88 and 163 for every building', () => {
  const expected = [1, 13, 40, 88, 163]
  for (let k = 1; k <= 5; k++) {
    const owners: Record<string, Owner> = {}
    for (const h of map) if (h.ring >= 1 && h.ring <= k) owners[h.id] = 'player'
    const d = dominion(withOwners(map, owners), 'player')
    for (const b of BUILDING_IDS) assert.equal(d[b], expected[k - 1], `${b} through ring ${k}`)
  }
})

test('Ch 3: a road hex gives its building 2 × ring; a between-land hex gives ring to each of its two', () => {
  const road = withOwners(map, { '0,-3': 'player' })
  assert.deepEqual(dominion(road, 'player'), { barracks: 6, merchantHall: 0, mageTower: 0, foundry: 0 })
  const north = withOwners(map, { '1,-3': 'player' })
  assert.deepEqual(dominion(north, 'player'), { barracks: 3, merchantHall: 3, mageTower: 0, foundry: 0 })
  for (const land of LANDS) assert.equal(LAND_BUILDINGS[land].length, 2)
  // Ring-6 hexes never count, even if held.
  const rim = withOwners(map, { '0,-6': 'player' })
  assert.deepEqual(dominion(rim, 'player'), { barracks: 0, merchantHall: 0, mageTower: 0, foundry: 0 })
})

test('Ch 3: the player’s Dominion is 0 at the founding; taking the W wild hex gives the Barracks and Mage Tower 1', () => {
  assert.deepEqual(dominion(map, 'player'), { barracks: 0, merchantHall: 0, mageTower: 0, foundry: 0 })
  const after = withOwners(map, { '-1,0': 'player' })
  assert.deepEqual(dominion(after, 'player'), { barracks: 1, merchantHall: 0, mageTower: 1, foundry: 0 })
})

test('Ch 3: each rival’s founding Dominion comes from its Gate and March', () => {
  // Orc: Gate (road, ring 5) 10 to the Barracks; March hexes in North and West give 5 to each of their two.
  assert.deepEqual(dominion(map, 'orc'), { barracks: 20, merchantHall: 5, mageTower: 5, foundry: 0 })
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

test('A-13: for 200 seeds every map satisfies the village rules and the attempt counter stays under 50', () => {
  let maxAttempt = 0
  const layouts = new Set<string>()
  for (let seed = 1; seed <= 200; seed++) {
    const seeding = seedVillages(seed)
    maxAttempt = Math.max(maxAttempt, seeding.attempt)
    const m = buildMap(seed)
    assert.deepEqual(villageProblems(m), [], `seed ${seed}`)
    assert.deepEqual(
      m.filter((h) => h.village && h.owner === 'neutral').map((h) => h.id).sort(),
      seeding.ids.slice().sort()
    )
    layouts.add(seeding.ids.slice().sort().join(' '))
  }
  assert.ok(maxAttempt < 50, `attempt ${maxAttempt}`)
  assert.ok(layouts.size > 10, `only ${layouts.size} distinct village layouts`)
})

// ── Borders and adjacency ────────────────────────────────────────────────────

test('Ch 3 rule 1: touchesOwner and border hexes', () => {
  assert.ok(touchesOwner(map, '-1,0', 'player'), 'the W wild hex touches the castle')
  assert.ok(!touchesOwner(map, '-2,0', 'player'))
  assert.ok(touchesOwner(map, '0,-4', 'orc'), 'the ring-4 road hex touches the Orc Gate')
  assert.deepEqual(borderHexes(map, 'player').sort(), ['-1,1', '0,-1', '0,0', '0,1', '1,-1'].sort())
  const grown = withOwners(map, { '-1,0': 'player', '1,0': 'player' })
  assert.ok(!isBorderHex(grown, '0,0', 'player'), 'the castle is surrounded by the player’s land')
  assert.ok(isBorderHex(grown, '-1,0', 'player'))
  assert.ok(!isBorderHex(grown, '-2,0', 'player'), 'not held')
  // The Orc capital touches only Orc land; its realm hexes touch battlefields.
  assert.deepEqual(borderHexes(map, 'orc').sort(), ['-1,-4', '0,-5', '1,-5', '1,-6', '-1,-5'].sort())
})

// ── claimableBy ──────────────────────────────────────────────────────────────

test('Ch 3 rule 2 (A-15): rivalExpand is false for every hex in rings 0 to 2, even beside rival land', () => {
  // Hand ring 3 to the rivals so rings 0 to 2 are adjacent to each of them.
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
  assert.ok(claimableBy(map, '0,-4', 'orc', 'rivalExpand'), 'the ring-4 road beside its Gate')
  assert.ok(!claimableBy(map, '0,-3', 'orc', 'rivalExpand'), 'not adjacent')
  assert.ok(!claimableBy(map, '5,-5', 'orc', 'rivalExpand'), 'not the Goblin Gate')
  const m = withOwners(map, { '0,-4': 'player' })
  assert.ok(!claimableBy(m, '0,-4', 'orc', 'rivalExpand'), 'not the player’s land')
  assert.ok(!claimableBy(map, '0,-4', 'player', 'rivalExpand'))
})

test('Ch 3 rules 4 to 6, A-16: capitals, Gates and Lair Mouths are never assaulted; the Rim is never claimable', () => {
  // Give the player every claimable hex except the targets, so adjacency always holds.
  const owners: Record<string, Owner> = {}
  for (const h of map) if (isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'lairMouth' && h.ring < 5) owners[h.id] = 'player'
  for (const h of map) if (h.ring === 5 && h.kind === 'between') owners[h.id] = 'player'
  const m = withOwners(map, owners)
  // And a copy where the player also holds every Gate, so the capitals are adjacent too.
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
  for (const h of withGates.filter((x) => x.ring === 6)) {
    for (const method of ['assault', 'court', 'buy'] as const) assert.equal(claimableBy(withGates, h.id, 'player', method), false, `${method} ${h.id}`)
  }
  // (Above: a Gate is a village, so it can be courted, A-16.)
  // The March beside it can be assaulted and bought.
  assert.ok(claimableBy(withOwners(map, { '0,-4': 'player' }), '1,-5', 'player', 'assault'))
  assert.ok(claimableBy(withOwners(map, { '0,-4': 'player' }), '1,-5', 'player', 'buy'))
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
  const village = map.find((h) => h.ring === 4 && h.village && h.owner === 'neutral') as HexState
  const near = neighbors(village.id).find((n) => (map.find((h) => h.id === n) as HexState).ring === 5) as string
  const held = withOwners(map, { [village.id]: 'player', [near]: 'orc' })
  assert.ok(!claimableBy(held, village.id, 'orc', 'court'))
  assert.ok(claimableBy(held, village.id, 'orc', 'assault'), 'a conquest attempt is still possible')
})

test('claimableBy throws on an unknown hex', () => {
  assert.throws(() => claimableBy(map, '9,9', 'player', 'assault'), RangeError)
})

// ── Dev helper ───────────────────────────────────────────────────────────────

test('mapAscii prints 13 rows with the castle in the middle', () => {
  const rows = mapAscii(map).split('\n')
  assert.equal(rows.length, 13)
  assert.deepEqual(
    rows.map((r) => r.trim().split(' ').length),
    [7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7]
  )
  assert.equal(rows[6].trim().split(' ')[6], 'P')
  assert.equal(rows[0].trim(), 'O O # # # G G')
  assert.ok(MAP_ASCII_LEGEND.includes('battlefield'))
})
