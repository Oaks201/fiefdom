import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import {
  assaultOutcome,
  assaultValue,
  effectiveGarrison,
  fieldBest,
  ordersValidity,
  setOrders
} from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { neighbors } from '../../src/renderer/src/lib/game/map'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES, base } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, DailyOrders, HexState } from '../../src/renderer/src/lib/game/types'
import { allBuildings, realm, withArmory, withBuildings, withCastle, withCrossings } from './support/realm'
import { fight, hex, withHex, withOwner, withTiding } from './support/war'

const DAY = '2026-10-08'

const near = (actual: number, expected: number, tolerance = 1e-9): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

/** A neutral ring-`ring` hex the player can reach: one of its inner neighbors is handed to the player. */
function reachable(state: CampaignState, ring: number, also: (h: HexState) => boolean): { state: CampaignState; target: string } {
  const target = state.hexes.find((h) => h.ring === ring && h.owner === 'neutral' && (h.kind === 'road' || h.kind === 'between') && also(h)) as HexState
  const inner = neighbors(target.id).find((n) => hex(state, n).ring === ring - 1 && hex(state, n).kind !== 'building') as string
  return { state: withOwner(state, [inner], 'player'), target: target.id }
}

/** A ring-3 beast den the player can reach (garrison 0.9 × 55 = 49.5). */
function den(state: CampaignState = realm()): { state: CampaignState; target: string } {
  return reachable(state, 3, (h) => !h.village)
}

/** Parks the day's daily threat on a building, where it is always beaten. */
function quiet(state: CampaignState, day = DAY): CampaignState {
  const building = state.hexes.find((h) => h.kind === 'building') as HexState
  return withTiding(state, { date: day, kind: 'beasts', hexId: building.id, strength: 1 })
}

function orders(state: CampaignState, o: Partial<DailyOrders>): CampaignState {
  return setOrders(state, { date: DAY, assault: [], defense: [], ...o }).state
}

test('Ch 6: a ring-3 beast den (garrison 49.5) is taken by Assault 50 and repulsed by 49, leaving 49.5 − 12.25 = 37.25 until the week closes', () => {
  const { state, target } = den()
  const h = hex(state, target)
  assert.equal(h.garrison, 49.5)
  assert.equal(effectiveGarrison(h), 49.5)
  assert.equal(assaultOutcome(49.5, 50).outcome, 'taken')
  const repulsed = assaultOutcome(49.5, 49)
  assert.equal(repulsed.outcome, 'repulsed')
  assert.equal(repulsed.wear, 12.25)
  assert.equal(effectiveGarrison({ ...h, garrisonDamage: repulsed.wear }), 37.25)
  assert.equal(assaultOutcome(49.5, 74.25).outcome, 'rout')
  assert.equal(assaultOutcome(49.5, 74.2).outcome, 'taken')
})

test('Ch 6: Assault = (1 + a) × Σ p × m × (r + (1 − r) × V); walls never help', () => {
  near(assaultValue({ strikes: [45, 45], armsBonus: 0.2, rallyFloor: 0.65, valor: 1 }), 108)
  near(assaultValue({ strikes: [45, 45], armsBonus: 0.2, rallyFloor: 0.65, valor: 0 }), 108 * 0.65)
})

test('Ch 6 taken: Assault ≥ garrison takes the hex at dawn with 4 × ring spoils; ≥ 1.5 × garrison is a rout with 6 × ring', () => {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const effects = realmEffects(s0)
  const bonus = 1 + effects.reputationBonus.value
  // Champions (Steel) alone against beasts: 30 × 1.5 × 1.2 = 54 at full Valor.
  const champions = roster(s0).filter((c) => c.id === 'barracks')
  const value = assaultValue({ strikes: fieldBest(champions, 'beasts', 'beast', 1).map((f) => f.strike), armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor: 1 })
  near(value, 54)

  // Garrison exactly the Assault: taken, not a rout.
  const exact = quiet(orders(withHex(s0, target, { garrison: value }), { assaultTarget: target, assault: ['barracks'] }))
  const taken = fight(exact, DAY, 1)
  assert.deepEqual(taken.of('assault'), [{ hexId: target, owner: 'neutral', outcome: 'taken', spoils: Math.round(4 * 3 * bonus * 10) / 10 }])
  assert.equal(hex(taken.state, target).owner, 'player')
  assert.deepEqual(taken.of('hexTransfer'), [{ hexId: target, from: 'neutral', to: 'player', how: 'conquest' }])

  // The den's own 49.5 against 54 is taken too; 30 of garrison is a rout.
  const rout = fight(quiet(orders(withHex(s0, target, { garrison: 30 }), { assaultTarget: target, assault: ['barracks'] })), DAY, 1)
  assert.equal(rout.of('assault')[0].outcome, 'rout')
  assert.equal(rout.of('assault')[0].spoils, Math.round(6 * 3 * bonus * 10) / 10)
})

test('Ch 6 repulsed: the garrison wears down by 25% of the Assault until week close, and the assault companies are Weary tomorrow', () => {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const above = quiet(orders(withHex(s0, target, { garrison: 54.01 }), { assaultTarget: target, assault: ['barracks'] }))
  const repulsed = fight(above, DAY, 1)
  assert.equal(repulsed.of('assault')[0].outcome, 'repulsed')
  const h = hex(repulsed.state, target)
  assert.equal(h.owner, 'neutral')
  near(h.garrisonDamage, 0.25 * 54)
  near(effectiveGarrison(h), 54.01 - 13.5)
  const barracks = repulsed.state.roster.find((c) => c.id === 'barracks')
  assert.equal(barracks?.wearyUntil, addDays(DAY, 1))
  const tomorrow = roster(repulsed.state, { day: addDays(DAY, 1) }).find((c) => c.id === 'barracks')
  near(tomorrow?.power ?? 0, 30 * 0.8)
  const later = roster(repulsed.state, { day: addDays(DAY, 2) }).find((c) => c.id === 'barracks')
  near(later?.power ?? 0, 30)
})

test('A-36: with no orders every company defends and no assault goes out', () => {
  const { state, target } = den()
  const validity = ordersValidity(state, undefined)
  assert.deepEqual(validity.assaults, [])
  assert.deepEqual(validity.defense, roster(state).map((c) => c.id))
  const day = fight(quiet(state), DAY, 1)
  assert.deepEqual(day.of('assault'), [])
  assert.equal(hex(day.state, target).owner, 'neutral')
  // Yesterday's orders don't carry over.
  const ordered = orders(state, { assaultTarget: target, assault: ['barracks'] })
  const nextDay = fight(quiet(ordered, addDays(DAY, 1)), addDays(DAY, 1), 1)
  assert.deepEqual(nextDay.of('assault'), [])
})

test('Ch 6: companies sent on an assault leave the defense pool for the day', () => {
  const { state, target } = den()
  const validity = ordersValidity(orders(state, { assaultTarget: target, assault: ['barracks', 'foundry'] }), { date: DAY, assaultTarget: target, assault: ['barracks', 'foundry'], defense: [] })
  assert.deepEqual(validity.assaults, [{ target, companies: ['barracks', 'foundry'] }])
  assert.deepEqual(validity.defense, ['merchantHall', 'mageTower'])
})

test('Ch 6: one assault a day; two at Castle IV or with the Siege Park', () => {
  const first = den()
  const second = reachable(first.state, 3, (h) => !h.village && h.id !== first.target)
  const twice: Partial<DailyOrders> = { assaultTarget: first.target, assault: ['barracks'], extraAssaults: [{ target: second.target, companies: ['foundry'] }] }
  const one = ordersValidity(second.state, { date: DAY, assault: [], defense: [], ...twice })
  assert.deepEqual(one.problems, [{ code: 'tooManyAssaults', allowed: 1 }])
  assert.equal(one.assaults.length, 1)
  const castle = ordersValidity(withCastle(second.state, 4), { date: DAY, assault: [], defense: [], ...twice })
  assert.equal(castle.assaults.length, 2)
  assert.deepEqual(castle.problems, [])
  const park = ordersValidity(withArmory(second.state, { wings: ['siegePark'] }), { date: DAY, assault: [], defense: [], ...twice })
  assert.equal(park.assaults.length, 2)
})

test('Ch 6: an assault needs an adjacent target, companies of its own, and at most the assault banners', () => {
  const { state, target } = den()
  const far = state.hexes.find((h) => h.ring === 4 && h.owner === 'neutral') as HexState
  const v = (o: Partial<DailyOrders>): ReturnType<typeof ordersValidity> => ordersValidity(state, { date: DAY, assault: [], defense: [], ...o })
  assert.deepEqual(v({ assaultTarget: far.id, assault: ['barracks'] }).problems, [{ code: 'notClaimable', hexId: far.id }])
  assert.deepEqual(v({ assaultTarget: target, assault: [] }).problems, [{ code: 'noCompanies', hexId: target }])
  assert.deepEqual(v({ assaultTarget: target, assault: ['nobody'] }).problems, [
    { code: 'unknownCompany', companyId: 'nobody' },
    { code: 'noCompanies', hexId: target }
  ])
  assert.deepEqual(v({ assaultTarget: target, assault: ['barracks', 'foundry', 'mageTower'] }).problems, [
    { code: 'tooManyCompanies', pool: 'assault', banners: 2, hexId: target }
  ])
})

test('A-16 / Ch 3: a Gate, capital or Lair Mouth is refused for the daily assault and handed on as a Grand Battle', () => {
  let state = realm()
  const gate = state.hexes.find((h) => h.kind === 'gate') as HexState
  const beside = neighbors(gate.id).find((n) => hex(state, n).ring === 4) as string
  state = withOwner(state, [beside], 'player')
  const validity = ordersValidity(state, { date: DAY, assaultTarget: gate.id, assault: ['barracks'], defense: [] })
  assert.deepEqual(validity.problems, [{ code: 'grandBattleRequired', hexId: gate.id }])
  assert.deepEqual(validity.assaults, [])
  assert.deepEqual(validity.grandBattles, [gate.id])
  const day = fight(quiet(orders(state, { assaultTarget: gate.id, assault: ['barracks'] })), DAY, 1)
  assert.deepEqual(day.grandBattles, [{ hexId: gate.id, kind: 'gate', owner: gate.owner, day: DAY }])
  assert.deepEqual(day.of('assault'), [])
  const mouth = state.hexes.find((h) => h.kind === 'lairMouth') as HexState
  const near = neighbors(mouth.id).find((n) => hex(state, n).ring === 4) as string
  const lair = ordersValidity(withOwner(state, [near], 'player'), { date: DAY, assaultTarget: mouth.id, assault: ['barracks'], defense: [] })
  assert.deepEqual(lair.grandBattles, [mouth.id])
})

test('Ch 6: a captured village Settles at half tithes for 4 weeks with half its loyalty (A-22); a rival hex taken costs 5 Respect', () => {
  const { state: s0, target } = reachable(allBuildings(realm(), 5), 2, (h) => h.village !== undefined)
  assert.equal(hex(s0, target).garrison, 0.6 * base(2))
  const day = fight(quiet(orders(s0, { assaultTarget: target, assault: ['merchantHall'] })), DAY, 1)
  assert.notEqual(day.of('assault')[0].outcome, 'repulsed')
  const village = hex(day.state, target).village
  assert.deepEqual(village, { loyalty: 0.5 * 15 * 2, settlingUntil: addDays(DAY, 28) })

  const { state: s1, target: rivalHex } = den(allBuildings(realm(), 5))
  const owned = withHex(s1, rivalHex, { owner: 'goblin', garrison: base(3) * RULES.land.rivalGarrisonMult.goblin })
  const taken = fight(quiet(orders(owned, { assaultTarget: rivalHex, assault: ['foundry', 'merchantHall'] })), DAY, 1)
  assert.notEqual(taken.of('assault')[0].outcome, 'repulsed')
  assert.equal(taken.state.rivals.goblin.respect, owned.rivals.goblin.respect - 5)
  assert.deepEqual(taken.of('hexTransfer'), [{ hexId: rivalHex, from: 'goblin', to: 'player', how: 'conquest' }])
})

test('Ch 6 / Ch 8: rival fortification adds 25% of base a level; Siegebreakers and the Sappers ignore it', () => {
  const { state, target } = den()
  const fortified = { ...hex(state, target), owner: 'dwarf' as const, garrison: base(3) * 1.3, fortification: 2 as const }
  near(effectiveGarrison(fortified), base(3) * 1.3 + 2 * 0.25 * base(3))
  near(effectiveGarrison(fortified, true), base(3) * 1.3)

  // The same assault fails against the walls, and takes the hex with Siegebreakers or the Sappers.
  let s = allBuildings(realm(), 4)
  const reach = den(s)
  s = withHex(reach.state, reach.target, { owner: 'dwarf', garrison: 40, fortification: 3 })
  const plan = (x: CampaignState, companies: string[]): CampaignState => quiet(orders(x, { assaultTarget: reach.target, assault: companies }))
  // Against 40 + 41.25: the Magi (21 Arcane ×1.5) with the Iron Legion (27) or the Sappers (16 Engine ×0.6), × 1.15,
  // make 67.3 and 47.3: enough for the garrison alone, not with its walls.
  assert.equal(fight(plan(s, ['mageTower']), DAY, 1).of('assault')[0].outcome, 'repulsed')
  const breakers = withCrossings(s, { barracksFoundry: 3 })
  assert.notEqual(fight(plan(breakers, ['mageTower', 'barracksFoundry']), DAY, 1).of('assault')[0].outcome, 'repulsed')
  const sappers = withArmory(s, { elites: [{ id: 'sappers', rank: 1 }] })
  const withSappers = fight(plan(sappers, ['mageTower', 'sappers']), DAY, 1).of('assault')[0]
  const without = fight(plan(sappers, ['mageTower', 'foundry']), DAY, 1).of('assault')[0]
  assert.notEqual(withSappers.outcome, 'repulsed')
  assert.equal(without.outcome, 'repulsed')
})

test('Orders are stored by day, replace that day’s earlier orders, and are dropped once the day after settles', () => {
  const { state, target } = den()
  const a = setOrders(state, { date: DAY, assault: [], defense: [] }).state
  const b = setOrders(a, { date: DAY, assaultTarget: target, assault: ['barracks'], defense: [] })
  assert.equal(b.state.orders.length, 1)
  assert.equal(b.validity.ok, true)
  const settled = fight(quiet(b.state), DAY, 1).state
  assert.equal(settled.orders.length, 1, 'today’s orders stay for "repeat yesterday’s orders"')
  const next = fight(quiet(settled, addDays(DAY, 1)), addDays(DAY, 1), 1).state
  assert.equal(next.orders.length, 0)
})

test('Merchant Hall II: hired blades defend for 20 a battle; without the Hall they are refused', () => {
  const state = realm()
  assert.deepEqual(ordersValidity(state, { date: DAY, assault: [], defense: [], hired: 1 }).problems, [{ code: 'hiredUnavailable' }])
  const hall = withBuildings(state, { merchantHall: 2 })
  assert.deepEqual(ordersValidity(hall, { date: DAY, assault: [], defense: [], hired: 1 }).problems, [])
  // Against beasts the Sellswords-strength blade (9, Coin ×1.5) is the best company, so it is fielded and paid.
  const day = fight(quiet(orders(hall, { hired: 1 })), DAY, 1)
  assert.deepEqual(
    day.state.purse.events.filter((e) => e.kind === 'spend').map((e) => e.amount),
    [-RULES.buildings.merchantHall.hiredBlades.costPerBattle]
  )
})
