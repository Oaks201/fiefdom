import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyCastleTier, buyCrossing, buyTier, castleOffer, crossingOffer, tierOffer } from '../../src/renderer/src/lib/game/buildings'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { dominion, rivalOfRoad } from '../../src/renderer/src/lib/game/map'
import { crownguardPower, refreshRoster, roster, rosterDetail } from '../../src/renderer/src/lib/game/roster'
import type { CampaignState, CrossingId } from '../../src/renderer/src/lib/game/types'
import {
  TODAY,
  allBuildings,
  equip,
  loseLand,
  realm,
  withArmory,
  withBuildings,
  withCastle,
  withCrossings,
  withDominion,
  withMilestones,
  withPurse
} from './support/realm'
import { near } from './support/assert'


function company(state: CampaignState, id: string) {
  const c = roster(state).find((x) => x.id === id)
  assert.ok(c, `no company ${id}`)
  return c
}

// ── Building tiers ───────────────────────────────────────────────────────────

test('Ch 7: Tier II is refused at Dominion 7 or 149 reputation and bought at Dominion 8 and 150', () => {
  const short = withPurse(withDominion(realm(), 'barracks', 7), 500)
  assert.equal(dominion(short.hexes, 'player').barracks, 7)
  const atSeven = buyTier(short, 'barracks', TODAY)
  assert.equal(atSeven.ok, false)
  assert.deepEqual(atSeven.reason, { code: 'dominion', needed: 8, have: 7 })
  assert.equal(atSeven.state, short)

  const poor = withPurse(withDominion(realm(), 'barracks', 8), 149)
  assert.deepEqual(buyTier(poor, 'barracks', TODAY).reason, { code: 'reputation', needed: 150, have: 149 })

  const ready = withPurse(withDominion(realm(), 'barracks', 8), 150)
  const bought = buyTier(ready, 'barracks', TODAY)
  assert.equal(bought.ok, true)
  assert.equal(bought.cost, 150)
  assert.equal(bought.state.buildings.barracks, 2)
  assert.equal(balance(bought.state.purse), 0)
  const last = bought.state.purse.events.at(-1)
  assert.deepEqual([last?.kind, last?.amount, last?.source, last?.date], ['spend', -150, 'tier:barracks:2', TODAY])
  // The company is upgraded in place: same slot, Men-at-Arms (9).
  const barracks = bought.state.roster.find((c) => c.id === 'barracks')
  assert.deepEqual([barracks?.name, barracks?.power], ['Men-at-Arms', 9])
})

test('Ch 7: tiers are never lost; after Dominion falls only the next tier waits', () => {
  let state = withPurse(withDominion(realm(), 'barracks', 8), 2_000)
  state = buyTier(state, 'barracks', TODAY).state
  state = loseLand(state, 'barracks')
  assert.equal(dominion(state.hexes, 'player').barracks, 0)
  assert.equal(state.buildings.barracks, 2)
  assert.deepEqual(tierOffer(state, 'barracks').reason, { code: 'dominion', needed: 24, have: 0 })
  assert.equal(roster(state).find((c) => c.id === 'barracks')?.power, 9)
})

test('Ch 7 / A-42: Tier V needs the matching rival resolved and Milestone 6', () => {
  let state = withPurse(withDominion(withBuildings(realm(), { foundry: 4 }), 'foundry', 68), 5_000)
  assert.equal(rivalOfRoad('foundry'), 'dwarf')
  state = withMilestones(state, 6)
  assert.deepEqual(tierOffer(state, 'foundry').reason, { code: 'rivalUnresolved', rival: 'dwarf' })

  // Another rival resolved does not count.
  const wrongRival = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'conquered' as const } } }
  assert.deepEqual(tierOffer(wrongRival, 'foundry').reason, { code: 'rivalUnresolved', rival: 'dwarf' })

  const resolved = { ...state, rivals: { ...state.rivals, dwarf: { ...state.rivals.dwarf, status: 'allied' as const } } }
  const noMilestone = { ...resolved, weight: realm().weight }
  assert.deepEqual(tierOffer(noMilestone, 'foundry').reason, { code: 'milestone', index: 6 })

  const bought = buyTier(resolved, 'foundry', TODAY)
  assert.equal(bought.ok, true)
  assert.equal(bought.cost, 1_800)
  assert.equal(bought.state.buildings.foundry, 5)
  assert.equal(balance(bought.state.purse), 3_200)
  assert.deepEqual(tierOffer(bought.state, 'foundry'), { ok: false, reason: { code: 'maxed' }, next: 5, cost: 0 })
})

test('Ch 7: the Dominion and reputation table for Tiers II to V', () => {
  const needs = [
    [1, 8, 150],
    [2, 24, 450],
    [3, 68, 1_100]
  ]
  for (const [from, dom, cost] of needs) {
    const base = withPurse(withBuildings(realm(), { mageTower: from }), 10_000)
    assert.deepEqual(tierOffer(withDominion(base, 'mageTower', dom - 1), 'mageTower').reason, { code: 'dominion', needed: dom, have: dom - 1 })
    const offer = tierOffer(withDominion(base, 'mageTower', dom), 'mageTower')
    assert.deepEqual(offer, { ok: true, next: from + 1, cost })
  }
})

// ── The castle ───────────────────────────────────────────────────────────────

test('Ch 7: Castle II needs a tier sum of 8 and 250; III 12 and 750; IV 16 and 1,500; never V', () => {
  const steps = [
    [1, 8, 250],
    [2, 12, 750],
    [3, 16, 1_500]
  ]
  for (const [from, sum, cost] of steps) {
    const castle = withPurse(withCastle(realm(), from), cost)
    const below = allBuildings(castle, sum / 4 - 1)
    const short = withBuildings(below, { barracks: sum / 4 })
    assert.deepEqual(castleOffer(short).reason, { code: 'tierSum', needed: sum, have: sum - 3 })
    const ready = allBuildings(castle, sum / 4)
    assert.deepEqual(castleOffer(withPurse(ready, cost - 0.1)).reason, { code: 'reputation', needed: cost, have: cost - 0.1 })
    const bought = buyCastleTier(ready, TODAY)
    assert.equal(bought.ok, true)
    assert.equal(bought.state.castleTier, from + 1)
    assert.equal(balance(bought.state.purse), 0)
    assert.equal(bought.state.purse.events.at(-1)?.source, `castle:${from + 1}`)
  }
  // At Castle IV there is no path to V, whatever the realm holds.
  const top = withPurse(allBuildings(withCastle(realm(), 4), 5), 100_000)
  const rivals = Object.fromEntries(Object.entries(top.rivals).map(([k, r]) => [k, { ...r, status: 'conquered' as const }])) as CampaignState['rivals']
  const refused = buyCastleTier({ ...top, rivals }, TODAY)
  assert.equal(refused.ok, false)
  assert.deepEqual(refused.reason, { code: 'maxed' })
  assert.equal(refused.state.castleTier, 4)
})

// ── Crossings ────────────────────────────────────────────────────────────────

test('Ch 8: a Crossing stage I needs both buildings at Tier II', () => {
  const rich = withPurse(realm(), 10_000)
  const half = withBuildings(rich, { barracks: 2 })
  assert.deepEqual(crossingOffer(half, 'barracksFoundry').reason, { code: 'buildingTier', building: 'foundry', needed: 2, have: 1 })
  const both = withBuildings(rich, { barracks: 2, foundry: 2 })
  const bought = buyCrossing(both, 'barracksFoundry', TODAY)
  assert.equal(bought.ok, true)
  assert.equal(bought.cost, 200)
  assert.equal(bought.state.crossings.barracksFoundry, 1)
  assert.equal(bought.state.purse.events.at(-1)?.source, 'crossing:barracksFoundry:1')
  // Stage II waits for both at Tier III.
  assert.deepEqual(crossingOffer(bought.state, 'barracksFoundry').reason, { code: 'buildingTier', building: 'barracks', needed: 3, have: 2 })
  const top = withCrossings(allBuildings(rich, 4), { barracksFoundry: 3 })
  assert.deepEqual(crossingOffer(top, 'barracksFoundry').reason, { code: 'maxed' })
})

test('Ch 8: hybrid power is 12 / 18 / 27 with both tags, at a cost of 200 / 600 / 1,200', () => {
  let state = withPurse(allBuildings(realm(), 4), 2_000)
  const costs: number[] = []
  for (const [stage, power, name] of [
    [1, 12, 'Clay Golems'],
    [2, 18, 'Rune Golems'],
    [3, 27, 'Runeforged Titans']
  ] as const) {
    const bought = buyCrossing(state, 'foundryMageTower', TODAY)
    assert.equal(bought.ok, true)
    costs.push(bought.cost)
    state = bought.state
    assert.equal(state.crossings.foundryMageTower, stage)
    const hybrid = company(state, 'foundryMageTower')
    assert.deepEqual([hybrid.name, hybrid.power, hybrid.source, hybrid.reach], [name, power, 'crossing', 'melee'])
    assert.deepEqual(hybrid.tags, ['engine', 'arcane'])
  }
  assert.deepEqual(costs, [200, 600, 1_200])
})

test('Ch 8 / A-31: Trade Roads makes the next Tier III cost 405; with Guild Charters it costs 360, not 315', () => {
  const base = withPurse(withDominion(withBuildings(realm(), { barracks: 2 }), 'barracks', 24), 1_000)
  assert.equal(tierOffer(base, 'barracks').cost, 450)
  const roads = withCrossings(base, { foundryMerchantHall: 2 })
  assert.equal(tierOffer(roads, 'barracks').cost, 405)
  const bought = buyTier(roads, 'barracks', TODAY)
  assert.equal(balance(bought.state.purse), 595)
  const charters = withCrossings(base, { foundryMerchantHall: 3 })
  assert.equal(tierOffer(charters, 'barracks').cost, 360)
  // Crossings are discounted too; the castle is not (A-127).
  assert.equal(crossingOffer(withBuildings(charters, { mageTower: 2 }), 'barracksMageTower').cost, 160)
  assert.equal(castleOffer(withCastle(charters, 1)).cost, 250)
})

test('Ch 7 / Ch 14: a fallen campaign buys nothing; the Reign after a victory still does', () => {
  const state = withPurse(withDominion(realm(), 'barracks', 8), 500)
  const fallen = { ...state, campaign: { ...state.campaign, status: 'fallen' as const } }
  assert.deepEqual(buyTier(fallen, 'barracks', TODAY).reason, { code: 'campaignOver' })
  assert.deepEqual(buyCastleTier(fallen, TODAY).reason, { code: 'campaignOver' })
  const won = { ...state, campaign: { ...state.campaign, status: 'won' as const } }
  assert.equal(buyTier(won, 'barracks', TODAY).ok, true)
})

// ── The roster ───────────────────────────────────────────────────────────────

test('Ch 7: the founding roster is one Tier I company per building, power 5, in stable slots', () => {
  const r = roster(realm())
  assert.deepEqual(
    r.map((c) => [c.id, c.name, c.power, c.tags.join(), c.reach]),
    [
      ['barracks', 'Militia', 5, 'steel', 'melee'],
      ['merchantHall', 'Watchmen', 5, 'coin', 'melee'],
      ['mageTower', 'Hedge-wardens', 5, 'arcane', 'ranged'],
      ['foundry', 'Palisade Crew', 5, 'engine', 'melee']
    ]
  )
  assert.deepEqual(realm().roster, r)
})

test('Ch 7 / App C: each tier upgrades the building company in place, with its reach', () => {
  const rows = [1, 2, 3, 4, 5].map((tier) =>
    roster(allBuildings(realm(), tier))
      .filter((c) => c.source === 'building')
      .map((c) => `${c.name} ${c.power} ${c.reach}`)
  )
  assert.deepEqual(rows, [
    ['Militia 5 melee', 'Watchmen 5 melee', 'Hedge-wardens 5 ranged', 'Palisade Crew 5 melee'],
    ['Men-at-Arms 9 melee', 'Sellswords 9 melee', 'Acolytes 9 ranged', 'Crossbowmen 9 ranged'],
    ['Pikemen 14 melee', 'Caravan Guard 14 melee', 'Wardens 14 melee', 'Ballista Crew 14 ranged'],
    ['Knights 21 melee', 'Free Lances 21 melee', 'Magi 21 ranged', 'Trebuchet Battery 21 ranged'],
    ['Champions 30 melee', 'The Gilded Host 30 melee', 'Archmagi 30 ranged', 'Iron Colossus 30 melee']
  ])
})

test('Ch 8: the Crownguard appears exactly at all four Tier IV (40), is 55 at all Tier V, and +10 at Milestone 10', () => {
  const three = withBuildings(allBuildings(realm(), 4), { foundry: 3 })
  assert.equal(crownguardPower(three), 0)
  assert.equal(roster(three).some((c) => c.source === 'crownguard'), false)

  const four = allBuildings(realm(), 4)
  const cg = company(four, 'crownguard')
  assert.deepEqual([cg.name, cg.power, cg.reach], ['The Crownguard', 40, 'melee'])
  assert.deepEqual([...cg.tags].sort(), ['arcane', 'coin', 'engine', 'steel'])

  const mixed = withBuildings(four, { barracks: 5, merchantHall: 5, mageTower: 5 })
  assert.equal(company(mixed, 'crownguard').power, 40)
  const five = allBuildings(realm(), 5)
  assert.equal(company(five, 'crownguard').power, 55)
  assert.equal(company(withMilestones(five, 10), 'crownguard').power, 65)
  assert.equal(company(withMilestones(four, 10), 'crownguard').power, 50)
})

test('Ch 7: a late-game realm fields 12 or more companies for 5 or more banners', () => {
  let state = withCastle(allBuildings(realm(), 4), 4)
  state = withCrossings(state, { barracksMerchantHall: 3, foundryMageTower: 3, barracksMageTower: 2, foundryMerchantHall: 2 })
  state = withMilestones(state, 1, 2, 3)
  state = withArmory(state, { elites: [{ id: 'oathsworn', rank: 1 }, { id: 'sappers', rank: 1 }] })
  state = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'conquered' } } }
  const r = roster(state)
  assert.ok(r.length >= 12, `roster has ${r.length}`)
  assert.deepEqual(
    r.map((c) => c.source),
    ['building', 'building', 'building', 'building', 'crossing', 'crossing', 'crossing', 'crossing', 'crownguard', 'elite', 'elite', 'vassal']
  )
  assert.ok(realmEffects(state).banners.value >= 5)
  // Without the Elites, the four Crossings, the Crownguard and the vassal make 10.
  assert.equal(roster(withArmory(state, { elites: [] })).length, 10)
})

test('A-20: vassal and ally companies have power 24 and the matching building tag', () => {
  const state = realm()
  const rivals = {
    ...state.rivals,
    orc: { ...state.rivals.orc, status: 'conquered' as const },
    goblin: { ...state.rivals.goblin, status: 'abdicated' as const },
    archmage: { ...state.rivals.archmage, status: 'allied' as const }
  }
  const levies = roster({ ...state, rivals }).filter((c) => c.source === 'vassal' || c.source === 'ally')
  assert.deepEqual(
    levies.map((c) => [c.id, c.source, c.power, c.tags.join(), c.reach]),
    [
      ['vassal:orc', 'vassal', 24, 'steel', 'melee'],
      ['vassal:goblin', 'vassal', 24, 'coin', 'melee'],
      ['ally:archmage', 'ally', 24, 'arcane', 'ranged']
    ]
  )
  const envoys = roster(state, { envoys: ['dwarf'] }).filter((c) => c.source === 'envoy')
  assert.deepEqual(envoys.map((c) => [c.id, c.power, c.tags.join()]), [['envoy:dwarf', 24, 'engine']])
})

test('A-19: hired companies for one battle have the Merchant Hall company’s power, Coin and melee', () => {
  for (const [tier, power] of [
    [2, 9],
    [3, 14],
    [4, 21],
    [5, 30]
  ]) {
    const state = withBuildings(realm(), { merchantHall: tier })
    const hired = roster(state, { hired: 2 }).filter((c) => c.source === 'hired')
    assert.deepEqual(
      hired.map((c) => [c.id, c.power, c.tags.join(), c.reach]),
      [
        ['hired:1', power, 'coin', 'melee'],
        ['hired:2', power, 'coin', 'melee']
      ]
    )
    // Hired companies never enter the stored roster.
    assert.equal(refreshRoster(state).roster.some((c) => c.source === 'hired'), false)
  }
})

test('Ch 10: a Weary company fights at −20% through its wearyUntil day', () => {
  const base = withBuildings(realm(), { barracks: 3 })
  const state = { ...base, roster: base.roster.map((c) => (c.id === 'barracks' ? { ...c, wearyUntil: '2026-10-10' } : c)) }
  near(roster(state, { day: '2026-10-10' }).find((c) => c.id === 'barracks')?.power ?? 0, 11.2)
  near(roster(state, { day: '2026-10-11' }).find((c) => c.id === 'barracks')?.power ?? 0, 14)
  // Without a day, a Weary date still on record counts.
  near(roster(state).find((c) => c.id === 'barracks')?.power ?? 0, 11.2)
  const detail = rosterDetail(state, { day: '2026-10-09' }).find((e) => e.company.id === 'barracks')
  assert.equal(detail?.weary, true)
  assert.deepEqual(detail?.sources, [{ from: { kind: 'weary', until: '2026-10-10' }, value: 0.8 }])
  // The stored roster keeps the date and leaves the penalty out.
  const stored = refreshRoster(state).roster.find((c) => c.id === 'barracks')
  assert.deepEqual([stored?.power, stored?.wearyUntil], [14, '2026-10-10'])
})

test('Ch 7: items and Weary status follow a company through a tier upgrade', () => {
  let state = withPurse(withDominion(withMilestones(realm(), 1), 'barracks', 8), 500)
  state = equip(state, 'barracks', ['whetstones'])
  state = { ...state, roster: state.roster.map((c) => (c.id === 'barracks' ? { ...c, wearyUntil: '2026-10-09' } : c)) }
  near(company(state, 'barracks').power, (5 + 2) * 0.8)
  const up = buyTier(state, 'barracks', TODAY).state
  const barracks = up.roster.find((c) => c.id === 'barracks')
  assert.deepEqual([barracks?.name, barracks?.items, barracks?.wearyUntil], ['Men-at-Arms', ['whetstones'], '2026-10-09'])
  near(roster(up, { day: '2026-10-10' }).find((c) => c.id === 'barracks')?.power ?? 0, 11)
})

test('Ch 9: the Proving Grounds raise every company 10%; Crossings never take a slot they lack', () => {
  const state = withMilestones(withCrossings(allBuildings(realm(), 2), { barracksFoundry: 1 }), 4)
  const r = roster(state)
  near(r.find((c) => c.id === 'barracks')?.power ?? 0, 9.9)
  near(r.find((c) => c.id === 'barracksFoundry')?.power ?? 0, 13.2)
  const crossings: CrossingId[] = ['barracksMageTower', 'barracksMerchantHall', 'foundryMageTower', 'foundryMerchantHall', 'mageTowerMerchantHall']
  for (const x of crossings) assert.equal(r.some((c) => c.id === x), false)
})

test('T07 slots for T14: Elites by rank, the Sworn with their two tags, and items’ own power and tags', () => {
  let state = withArmory(realm(), { elites: [{ id: 'starwardens', rank: 2 }], sworn: { tags: ['steel', 'arcane'] } })
  state = refreshRoster(state)
  state = equip(state, 'foundry', ['powderKegs', 'runeChalk'])
  state = equip(state, 'sworn', ['whetstones'])
  state = { ...state, roster: state.roster.map((c) => (c.id === 'sworn' ? { ...c, wearyUntil: '2026-10-09' } : c)) }
  const r = roster(state, { day: '2026-10-09' })
  const star = r.find((c) => c.id === 'starwardens')
  assert.deepEqual([star?.power, star?.reach, star?.source], [26, 'ranged', 'elite'])
  const sworn = r.find((c) => c.id === 'sworn')
  // The Sworn are never Wearied (Appendix C).
  assert.deepEqual([sworn?.power, sworn?.tags], [26, ['steel', 'arcane']])
  assert.deepEqual(r.find((c) => c.id === 'foundry')?.tags, ['engine', 'arcane'])
  // Trophies multiply their company: ×1.15.
  near(roster(equip(state, 'barracks', ['dragonsHeart'])).find((c) => c.id === 'barracks')?.power ?? 0, 5.75)
})
