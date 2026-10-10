import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CODEX, validateCodex, type CodexData } from '../../src/renderer/src/lib/game/codex'

/** A mutable copy of the codex for breaking on purpose. */
const copy = (): CodexData => structuredClone(CODEX) as CodexData

const countBy = <T>(list: readonly T[], key: (x: T) => string): Record<string, number> =>
  list.reduce<Record<string, number>>((acc, x) => ({ ...acc, [key(x)]: (acc[key(x)] ?? 0) + 1 }), {})

test('validateCodex() finds no errors in the shipped codex', () => {
  assert.deepEqual(validateCodex(), [])
})

test('Ch 7: 20 building companies, 4 buildings × 5 tiers', () => {
  const companies = CODEX.companies.filter((c) => c.source === 'building')
  assert.equal(companies.length, 20)
  assert.deepEqual(countBy(companies, (c) => c.building!), { barracks: 5, merchantHall: 5, mageTower: 5, foundry: 5 })
  assert.deepEqual(
    CODEX.companies.filter((c) => c.building === 'barracks').map((c) => c.name),
    ['Militia', 'Men-at-Arms', 'Pikemen', 'Knights', 'Champions']
  )
})

test('Appendix C: company reach follows the reach table', () => {
  const ranged = CODEX.companies.filter((c) => c.reach === 'ranged').map((c) => c.name)
  assert.deepEqual(ranged, ['Hedge-wardens', 'Acolytes', 'Magi', 'Archmagi', 'Crossbowmen', 'Ballista Crew', 'Trebuchet Battery'])
  const hybridsRanged = CODEX.crossings.flatMap((x) => x.hybrids.filter((h) => h.reach === 'ranged').map((h) => h.name))
  assert.deepEqual(hybridsRanged, [
    'Rangers',
    'the Royal Hunt',
    'War Wagons',
    'Bombard Battery',
    'Dragonfire Battery',
    'Alchemists',
    'Illusionists',
    'the Shadow Court'
  ])
  assert.deepEqual(
    CODEX.elites.filter((e) => e.reach === 'ranged').map((e) => e.name),
    ['The Starwardens']
  )
})

test('Ch 8: 6 Crossings × 3 stages, each with two perks', () => {
  assert.equal(CODEX.crossings.length, 6)
  for (const x of CODEX.crossings) {
    assert.deepEqual(x.hybrids.map((h) => h.stage), [1, 2, 3], x.id)
    assert.deepEqual(x.perks.map((p) => p.stage), [2, 3], x.id)
  }
  assert.deepEqual(
    CODEX.crossings.flatMap((x) => x.perks.filter((p) => p.v2).map((p) => p.name)),
    ['Siegebreakers', 'Guild Charters', 'Spy Network']
  )
  const lands = Object.fromEntries(CODEX.crossings.map((x) => [x.id, x.land]))
  assert.deepEqual(lands, {
    barracksFoundry: null,
    barracksMageTower: 'west',
    barracksMerchantHall: 'north',
    foundryMageTower: 'south',
    foundryMerchantHall: 'east',
    mageTowerMerchantHall: null
  })
})

test('Appendix C: 4 Elites plus the Sworn', () => {
  assert.equal(CODEX.elites.length, 4)
  for (const e of CODEX.elites) assert.deepEqual(e.power, [16, 26], e.id)
  assert.equal(CODEX.sworn.power, 24)
  assert.equal(CODEX.sworn.tagCount, 2)
})

test('Appendix C: Warded Steel raises the rally floor by 5% (its Appendix B number lives in the codex)', () => {
  const perk = CODEX.crossings.flatMap((x) => x.perks).find((p) => p.id === 'wardedSteel')
  assert.deepEqual(perk?.effects, [{ kind: 'rallyFloor', add: 0.05 }])
})

test('Appendix C: 23 items (6 rank I, 4 rank II, 4 rank III, 4 Legendary, 5 trophies)', () => {
  assert.equal(CODEX.items.length, 23)
  assert.deepEqual(countBy(CODEX.items, (i) => i.rank), { I: 6, II: 4, III: 4, legendary: 4, trophy: 5 })
  const cost = Object.fromEntries(CODEX.items.map((i) => [i.id, i.cost]))
  assert.equal(cost.whetstones, 60)
  assert.equal(cost.luckyCoin, 80)
  assert.equal(cost.healersSatchel, 200)
  assert.equal(cost.heraldsHorn, 350)
  assert.equal(cost.anvilHeart, 400)
  assert.equal(cost.dragonsHeart, null)
})

test('Appendix C: 24 Wings (4 buildings × 3 Milestones × 2)', () => {
  assert.equal(CODEX.wings.length, 24)
  assert.deepEqual(
    countBy(CODEX.wings, (w) => `${w.building} ${w.wave}`),
    Object.fromEntries(
      ['barracks', 'merchantHall', 'mageTower', 'foundry'].flatMap((b) => [1, 2, 3].map((wave) => [`${b} ${wave}`, 2]))
    )
  )
})

test('Appendix C: 19 Orders (Barracks 4, Merchant Hall 3, Mage Tower 3, Foundry 3, 6 Crossing signatures)', () => {
  assert.equal(CODEX.orders.length, 19)
  assert.deepEqual(
    countBy(CODEX.orders, (o) => o.source.id),
    {
      barracks: 4,
      merchantHall: 3,
      mageTower: 3,
      foundry: 3,
      barracksFoundry: 1,
      barracksMageTower: 1,
      barracksMerchantHall: 1,
      foundryMageTower: 1,
      foundryMerchantHall: 1,
      mageTowerMerchantHall: 1
    }
  )
  assert.deepEqual(
    CODEX.orders.filter((o) => o.source.kind === 'building' && o.source.id === 'foundry').map((o) => [o.name, o.source.kind === 'building' && o.source.tier]),
    [
      ['Volley', 1],
      ['Siege Engines', 3],
      ['Barrage', 4]
    ]
  )
})

test('Appendix C: 5 Doctrines, the Last Stand granted by the Hall of Heroes', () => {
  assert.equal(CODEX.doctrines.length, 5)
  const lastStand = CODEX.doctrines.find((d) => d.id === 'lastStand')
  assert.deepEqual(lastStand?.source, { kind: 'wing', id: 'hallOfHeroes' })
})

test('Appendix C: 4 rival hosts of 4 companies plus a commander each', () => {
  assert.equal(CODEX.hosts.length, 4)
  for (const h of CODEX.hosts) {
    assert.equal(h.companies.length, 4, h.rival)
    assert.ok(h.commander.power > 0, h.rival)
    assert.equal(h.intentPattern.length, 4, h.rival)
  }
  const orc = CODEX.hosts.find((h) => h.rival === 'orc')!
  assert.deepEqual(
    orc.companies.map((c) => [c.name, c.power, c.reach]),
    [
      ['Grunts', 8, 'melee'],
      ['Wolf Riders', 14, 'melee'],
      ['Shamans', 12, 'ranged'],
      ['Brutes', 20, 'melee']
    ]
  )
  assert.deepEqual(orc.intentPattern, ['charge', 'strike', 'charge', 'strike'])
  assert.deepEqual(
    CODEX.hosts.map((h) => [h.commander.name, h.commander.power]),
    [
      ["Ugrak's Warboss", 35],
      ['The Golden Guard', 28],
      ['The Anvil Guard', 32],
      ["Emrys's Echo", 34]
    ]
  )
})

test('Ch 10: matchups for every enemy type', () => {
  assert.deepEqual(CODEX.matchups.orc, { weakTo: ['engine'], resists: ['coin'] })
  assert.deepEqual(CODEX.matchups.archmage, { weakTo: ['steel'], resists: ['arcane'] })
  assert.deepEqual(CODEX.matchups.mythic, { weakTo: ['arcane', 'engine'], resists: ['steel'] })
  assert.deepEqual(CODEX.matchups.militia, { weakTo: ['coin'], resists: [] })
})

test('Appendix C: 6 Mythic Hunt quarries, health multipliers per A-47', () => {
  assert.equal(CODEX.quarries.length, 6)
  assert.deepEqual(
    CODEX.quarries.filter((q) => q.eventOnly).map((q) => q.id),
    ['dragon', 'wildHunt']
  )
  const health = Object.fromEntries(CODEX.quarries.flatMap((q) => q.roster.map((u) => [u.id, u.healthPerPower])))
  assert.equal(health.basilisk, 6)
  assert.equal(health.dragon, 8)
  assert.equal(health.manticore, 5)
  assert.equal(health.wyvern, undefined)
  const brood = CODEX.quarries.find((q) => q.id === 'wyvernBrood')!
  assert.deepEqual(brood.roster.map((u) => [u.name, u.power, u.count]), [
    ['Wyvern', 18, 3],
    ['the Matriarch', 30, 1]
  ])
})

test('Appendix C: 4 Rituals in order and 14 world events', () => {
  assert.deepEqual(CODEX.rituals.map((r) => r.id), ['longNight', 'veilOfFog', 'summoning', 'curseOfWeariness'])
  assert.equal(CODEX.events.length, 14)
  assert.deepEqual(
    CODEX.events.filter((e) => e.recurring).map((e) => e.id),
    ['beastSurge', 'merchantCaravan', 'envoys']
  )
})

test('Ch 12: the four rivals, their realms (Emrys’ renamed, D-08) and roads', () => {
  assert.deepEqual(
    CODEX.rivals.map((r) => [r.id, r.ruler, r.realm, r.road]),
    [
      ['orc', 'Ugrak the Unbowed', 'The Ashen Steppe', 'barracks'],
      ['goblin', 'Skivvet Goldtooth', 'The Gilded Warren', 'merchantHall'],
      ['archmage', 'Emrys the Ageless', 'Emrys’ Reach', 'mageTower'],
      ['dwarf', 'Hrodgar Anvilborn', 'Dun Kaldor', 'foundry']
    ]
  )
  assert.deepEqual(
    CODEX.fronts.map((f) => [f.id, ...f.rivals]),
    [
      ['north', 'orc', 'goblin'],
      ['south', 'archmage', 'dwarf'],
      ['west', 'orc', 'archmage'],
      ['east', 'goblin', 'dwarf']
    ]
  )
})

test('the codex has no rule numbers: rivals carry names, not multipliers', () => {
  for (const r of CODEX.rivals) assert.doesNotMatch(JSON.stringify(r), /\d/, r.id)
})

test('the codex is frozen', () => {
  assert.ok(Object.isFrozen(CODEX.items[0].effects[0]))
  assert.ok(Object.isFrozen(CODEX.hosts))
})

test('validateCodex: duplicate ids are caught', () => {
  const codex = copy()
  codex.items[1].id = codex.items[0].id
  assert.ok(validateCodex(codex).some((e) => e.includes('duplicate id "whetstones"')))
  const units = copy()
  units.hosts[0].companies[0].id = 'militia'
  assert.ok(validateCodex(units).some((e) => e.startsWith('units: duplicate id "militia"')))
})

test('validateCodex: invalid tags are caught', () => {
  const codex = copy()
  ;(codex.companies[0].tags as string[]) = ['iron']
  assert.ok(validateCodex(codex).some((e) => e.includes('invalid tag "iron"')))
  const item = copy()
  ;(item.items[2].effects[0] as { tag: string }).tag = 'wood'
  assert.ok(validateCodex(item).some((e) => e.includes('invalid tag "wood"')))
})

test('validateCodex: unresolved cross-references are caught', () => {
  const trophy = copy()
  trophy.items.find((i) => i.rank === 'trophy')!.quarry = 'kraken'
  assert.ok(validateCodex(trophy).some((e) => e.includes('unknown quarry "kraken"')))
  const event = copy()
  event.events.find((e) => e.id === 'dragonWakes')!.effect.winItem = 'dragonsTooth'
  assert.ok(validateCodex(event).some((e) => e.includes('unknown item "dragonsTooth"')))
  const wing = copy()
  ;(wing.wings[4].effects[0] as { doctrine: string }).doctrine = 'nope'
  assert.ok(validateCodex(wing).some((e) => e.includes('unknown doctrine "nope"')))
  const special = copy()
  ;(special.hosts[0].specials[0] as { unit: string }).unit = 'trolls'
  assert.ok(validateCodex(special).some((e) => e.includes('unknown unit "trolls"')))
})

test('validateCodex: every Order and Doctrine must name a real source', () => {
  const order = copy()
  order.orders[0].source = { kind: 'crossing', id: 'barracksBarracks' as never, stage: 1 }
  assert.ok(validateCodex(order).some((e) => e.includes('order shieldwall: unknown crossing')))
  const tier = copy()
  tier.orders[1].source = { kind: 'building', id: 'barracks', tier: 6 }
  assert.ok(validateCodex(tier).some((e) => e.includes('order charge: invalid tier 6')))
  const doctrine = copy()
  doctrine.doctrines[4].source = { kind: 'wing', id: 'shieldForge' }
  assert.ok(validateCodex(doctrine).some((e) => e.includes('wing "shieldForge" does not grant it')))
})

test('validateCodex: unknown effect kinds are caught', () => {
  const codex = copy()
  ;(codex.items[0].effects[0] as { kind: string }).kind = 'teleport'
  assert.ok(validateCodex(codex).some((e) => e.includes('unknown effect kind "teleport"')))
})
