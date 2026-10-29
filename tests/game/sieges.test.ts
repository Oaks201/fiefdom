/**
 * Patch 3 stage 2 (docs/redesign/patch-3-spec.md section 3, D-22): sieges. Wear that stays and
 * decays, the breach, standing siege orders (R-16, C-22), flanking (C-21), the automatic player's
 * siege pick (C-31), and what the orders panel, the map and the Herald show.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GREEDY, autoplay, expectedValor, pickAssault } from '../../src/renderer/src/lib/game/autoplay'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, clearOrders, laySiege, liftSiege, ordersEstimate, ordersFor, setOrders, siegeOrders } from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { claimableBy, isStronghold, neighbors, pathShares } from '../../src/renderer/src/lib/game/map'
import { needsRefounding } from '../../src/renderer/src/lib/game/refound'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { flankingMult } from '../../src/renderer/src/lib/game/sieges'
import { startSkirmishes, todaysFights } from '../../src/renderer/src/lib/game/skirmish'
import type { CampaignState, GameEvent, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { hexPanel, mapView } from '../../src/renderer/src/lib/game/view/realm'
import { resultLine, rivalName } from '../../src/renderer/src/lib/game/view/shell'
import { near } from './support/assert'
import { allBuildings, realm } from './support/realm'
import { START, den, fight, hex, quiet, reachable, withHex, withOwner } from './support/war'

const DAY = START
const NEXT = addDays(DAY, 1)
/** The Champions (Barracks V, Steel) alone against beasts at full Valor: 30 × 1.5 × 1.2 (assault.test.ts). */
const CHAMPIONS = 54

/** A den the Champions can reach, its garrison set to `garrison`. */
function setup(garrison: number): { state: CampaignState; target: string } {
  const { state, target } = den(allBuildings(realm(), 5))
  return { state: withHex(state, target, { garrison, garrisonDamage: 0 }), target }
}

/** Today's orders: the Champions alone on `target`. */
function send(state: CampaignState, target: string, day = DAY): CampaignState {
  return setOrders(state, { date: day, assaultTarget: target, assault: ['barracks'], defense: [] }).state
}

/** The target's neighbors the player doesn't hold yet. */
function freeNeighbors(state: CampaignState, target: string): string[] {
  return neighbors(target).filter((n) => state.hexes.some((h) => h.id === n && h.owner !== 'player'))
}

test('D-22: a repulse wears 25% of the Assault off the garrison, and it is a breach when the worn garrison is then within that Assault', () => {
  const worn = setup(60)
  const breach = fight(quiet(send(worn.state, worn.target)), DAY, 1)
  const a = breach.of('assault')[0]
  assert.equal(a.outcome, 'repulsed')
  assert.equal(a.wear, CHAMPIONS * RULES.land.repulseWear)
  assert.equal(a.breach, true, '60 − 13.5 = 46.5 is within 54')
  near(hex(breach.state, worn.target).garrisonDamage, 13.5)

  const far = setup(80)
  const plain = fight(quiet(send(far.state, far.target)), DAY, 1).of('assault')[0]
  assert.equal(plain.outcome, 'repulsed')
  assert.equal(plain.breach, undefined, '80 − 13.5 = 66.5 is not')
})

test('D-22 (C-20): a worn hex left alone loses 10% of its wear at the close, a trace is cleared, and the one assaulted loses none', () => {
  const { state: s0, target } = setup(200)
  const second = reachable(s0, 3, (h) => !h.village && h.id !== target)
  const third = reachable(second.state, 3, (h) => !h.village && h.id !== target && h.id !== second.target)
  let state = withHex(withHex(withHex(third.state, target, { garrisonDamage: 20 }), second.target, { garrisonDamage: 10 }), third.target, { garrisonDamage: 0.05 })
  state = send(state, target)
  const after = fight(quiet(state), DAY, 1).state
  near(hex(after, target).garrisonDamage, 20 + 13.5)
  near(hex(after, second.target).garrisonDamage, 10 * (1 - RULES.sieges.wearDecay.perDay))
  assert.equal(hex(after, third.target).garrisonDamage, 0)
})

test('D-22, D-60: the hex falls once its worn garrison is within the Assault, and the Marshal presses on to the weakest hex beside it held by the same foe', () => {
  const { state: s0, target } = setup(60)
  const state = send(withHex(s0, target, { garrisonDamage: 10 }), target)
  assert.equal(state.standingSiege?.hexId, target)
  const after = fight(quiet(state), DAY, 1)
  assert.equal(after.of('assault')[0].outcome, 'taken')
  assert.equal(hex(after.state, target).owner, 'player')
  assert.equal(hex(after.state, target).garrisonDamage, 0)
  const beside = freeNeighbors(after.state, target).filter((n) => hex(after.state, n).owner === 'neutral' && claimableBy(after.state.hexes, n, 'player', 'assault') && !isStronghold(after.state.hexes, n))
  assert.ok(beside.length > 0)
  const garrison = (id: string): number => assaultGarrison(after.state, hex(after.state, id), NEXT)
  const weakest = [...beside].sort((a, b) => garrison(a) - garrison(b) || a.localeCompare(b))[0]
  assert.deepEqual(after.state.standingSiege, { hexId: weakest, since: DAY })
  assert.deepEqual(after.of('standingSiege'), [{ hexId: weakest, change: 'pressedOn' }])
  assert.equal(ordersFor(after.state, NEXT)?.assaultTarget, weakest, 'tomorrow, with no orders of the player’s own, he presses it')
  const e = { id: 'e2', day: DAY, kind: 'standingSiege', hexId: weakest, change: 'pressedOn' } as GameEvent
  assert.equal(resultLine(e)?.textId, 'herald.siege.pressedOn')
  // Only against the same foe: with every wild hex beside it a rival's, he starts no fight and the siege ends.
  const ruled = withOwner(state, freeNeighbors(state, target).filter((n) => hex(state, n).owner === 'neutral'), 'orc')
  const ended = fight(quiet(ruled), DAY, 1)
  assert.equal(hex(ended.state, target).owner, 'player')
  assert.equal(ended.state.standingSiege, undefined)
  assert.deepEqual(ended.of('standingSiege'), [])
})

test('R-16 (D-22): only a hex a daily assault may take becomes the standing siege, and naming another moves it', () => {
  const { state: s0, target } = setup(200)
  const gate = s0.hexes.find((h) => h.kind === 'gate') as HexState
  assert.equal(setOrders(s0, { date: DAY, assaultTarget: gate.id, assault: ['barracks'], defense: [] }).state.standingSiege, undefined)
  const first = send(s0, target)
  assert.deepEqual(first.standingSiege, { hexId: target, since: DAY })
  // Orders with no target leave it standing; today they rule, so nothing assaults today.
  const resting = setOrders(first, { date: NEXT, assault: [], defense: [] }).state
  assert.equal(resting.standingSiege?.hexId, target)
  assert.equal(ordersFor(resting, NEXT)?.assaultTarget, undefined)
  const other = reachable(first, 3, (h) => !h.village && h.id !== target)
  const moved = send(other.state, other.target, NEXT)
  assert.deepEqual(moved.standingSiege, { hexId: other.target, since: NEXT })
})

test('R-16 (D-22): a standing siege whose hex can no longer be assaulted lapses at the close, with a Herald line', () => {
  const { state: s0, target } = setup(200)
  const inner = neighbors(target).find((n) => hex(s0, n).owner === 'player') as string
  const cut = withOwner(send(s0, target), [inner], 'neutral')
  assert.equal(ordersFor(cut, NEXT), undefined, 'a siege that no longer stands sends no one')
  const day = fight(quiet(cut, NEXT), NEXT, 1)
  assert.deepEqual(day.of('standingSiege'), [{ hexId: target, change: 'lapsed' }])
  assert.deepEqual(day.of('assault'), [])
  assert.equal(day.state.standingSiege, undefined)
  const e = { id: 'e1', day: NEXT, kind: 'standingSiege', hexId: target, change: 'lapsed' } as GameEvent
  assert.equal(resultLine(e)?.textId, 'herald.siege.lapsed')
})

test('A-181 (D-22): "Use the Marshal’s choice" clears the day’s orders, so the standing siege presses on; lifting the siege drops today’s assault on it', () => {
  const { state: s0, target } = setup(200)
  const own = send(s0, target)
  const cleared = clearOrders(own, DAY)
  assert.equal(cleared.orders.some((o) => o.date === DAY), false)
  assert.deepEqual(ordersFor(cleared, DAY), siegeOrders(cleared, DAY, target))
  const lifted = liftSiege(own, DAY)
  assert.equal(lifted.standingSiege, undefined)
  const today = lifted.orders.find((o) => o.date === DAY)
  assert.equal(today?.assaultTarget, undefined)
  assert.deepEqual(today?.assault, [])
})

test('D-22: laying a siege from the hex panel sends the Marshal’s pick, keeping a pinned defender home and the rest of the day’s orders', () => {
  const { state: s0, target } = setup(200)
  const pinned = setOrders(s0, { date: DAY, assault: [], defense: [], defenseOverride: ['barracks'] }).state
  const laid = laySiege(pinned, target, DAY).state
  const today = laid.orders.find((o) => o.date === DAY)
  assert.equal(today?.assaultTarget, target)
  assert.deepEqual(today?.defenseOverride, ['barracks'])
  assert.ok(today && today.assault.length > 0 && !today.assault.includes('barracks'))
  assert.equal(laid.standingSiege?.hexId, target)
})

test('D-12 (D-22): starting the day’s fights writes the standing siege’s orders down, so they hold until the close', () => {
  const { state: s0, target } = setup(200)
  const siege = clearOrders(send(s0, target), DAY)
  const started = startSkirmishes(siege, DAY, 1)
  assert.ok(started.ok)
  assert.deepEqual(started.state.orders.find((o) => o.date === DAY), siegeOrders(siege, DAY, target))
  assert.ok(started.day?.fights.some((f) => f.side === 'assault' && f.hexId === target))
})

test('C-21: flanking adds 5% to the daily assault for each held neighbor of the target beyond the first, up to 20%', () => {
  const { state: s0, target } = setup(56)
  const byId = (s: CampaignState): Map<string, HexState> => new Map(s.hexes.map((h) => [h.id, h]))
  const free = freeNeighbors(s0, target)
  const expected = [1, 1.05, 1.1, 1.15, 1.2, 1.2]
  let state = s0
  for (let held = 1; held <= 6; held++) {
    near(flankingMult(byId(state), target), expected[held - 1])
    if (free.length > 0) state = withOwner(state, [free.shift() as string], 'player')
  }
})

test('C-21: flanking counts in the take, the wear and a led fight’s enemy, not in defenses', () => {
  const { state: s0, target } = setup(56)
  const lone = fight(quiet(send(s0, target)), DAY, 1).of('assault')[0]
  assert.equal(lone.outcome, 'repulsed', '54 alone against 56')
  const flanked = withOwner(s0, freeNeighbors(s0, target).slice(0, 2), 'player')
  const taken = fight(quiet(send(flanked, target)), DAY, 1).of('assault')[0]
  assert.equal(taken.outcome, 'taken', '54 × 1.10 = 59.4 against 56')
  assert.equal(taken.value, 59.4)
  const wide = withHex(flanked, target, { garrison: 90 })
  // The event posts wear to a tenth (A-11): 14.85 shows as 14.9.
  near(fight(quiet(send(wide, target)), DAY, 1).of('assault')[0].wear ?? 0, 59.4 * RULES.land.repulseWear, RULES.reputation.rounding)
  const plan = todaysFights(send(wide, target), DAY).find((f) => f.side === 'assault')
  near(plan?.strength ?? 0, 90 / 1.1)
  const est = ordersEstimate(send(wide, target), undefined, DAY, 1)
  assert.ok(est.assaults.length === 0 && est.defenses.every((d) => d.defense > 0))
})

test('C-31: the automatic player takes a hex that falls today, else the best siege within 3 assault days, and sets it as the standing siege', () => {
  const s0 = allBuildings(realm(), 5)
  const today = DAY
  const effects = realmEffects(s0)
  const now = pickAssault(s0, today, GREEDY, effects)
  assert.ok(now?.today, 'on the founding frontier something falls today')
  // Every hex out of reach but one, at 1.4 × the Assault on it: a siege of 3 days.
  const { state: s1, target } = den(s0)
  const everyone = roster(s1, { day: today }, effects).map((c) => c.id)
  const value = ordersEstimate(s1, { date: today, assaultTarget: target, assault: everyone, defense: [] }, today, expectedValor(s1), effects).assaults[0].value
  const walled = { ...s1, hexes: s1.hexes.map((h) => (h.owner === 'player' ? h : h.id === target ? { ...h, garrison: 1.4 * value, garrisonDamage: 0 } : { ...h, garrison: 1e6 })) }
  const siege = pickAssault(walled, today, GREEDY, effects)
  assert.equal(siege?.hex.id, target)
  assert.equal(siege?.today, false)
  const played = autoplay(walled, today, GREEDY, { rough: false, nextId: () => 'c1' })
  assert.equal(played.standingSiege?.hexId, target)
  const sealed = { ...walled, hexes: walled.hexes.map((h) => (h.id === target ? { ...h, garrison: 1e6 } : h)) }
  assert.equal(pickAssault(sealed, today, GREEDY, effects), undefined, 'nothing within the horizon')
})

test('D-22: the orders panel shows the standing siege, its progress and its days; the map and the hex panel mark it', () => {
  const { state: s0, target } = setup(100)
  const state = clearOrders(send(withHex(s0, target, { garrisonDamage: 25 }), target), DAY)
  const view = ordersView(state, 1, DAY)
  assert.equal(view.fromSiege, true)
  assert.equal(view.siege?.hexId, target)
  near(view.siege?.progress ?? 0, 0.25)
  assert.equal(view.siege?.pressedToday, true)
  assert.ok((view.siege?.days ?? 0) >= 1)
  const cell = mapView(state, DAY).find((h) => h.id === target)
  assert.deepEqual(cell?.siege, { progress: 0.25, standing: true })
  assert.equal(cell?.target, true)
  const panel = hexPanel(state, target, DAY)
  assert.equal(panel?.siege?.standing, true)
  assert.equal(panel?.flank, 1)
  const repulse = { id: 'e2', day: DAY, kind: 'assault', hexId: target, owner: 'neutral', outcome: 'repulsed', wear: 1, value: 54, breach: true } as GameEvent
  assert.equal(resultLine(repulse)?.textId, 'battle.assault.breach')
})

test('C-33: a 3.0.0 campaign settles under 3.1.0 in place: no re-founding, its wear decays, and with no siege A-36 holds', () => {
  const { state: s0, target } = setup(200)
  const old: CampaignState = { ...withHex(s0, target, { garrisonDamage: 30 }), campaign: { ...s0.campaign, ruleVersion: '3.0.0' } }
  assert.equal(needsRefounding(old), false)
  assert.equal(old.standingSiege, undefined)
  assert.equal(ordersFor(old, DAY), undefined)
  const day = fight(quiet(old), DAY, 1)
  assert.deepEqual(day.of('assault'), [])
  near(hex(day.state, target).garrisonDamage, 30 * (1 - RULES.sieges.wearDecay.perDay))
})

test('Patch 7 (C2): the Assault list runs soonest to fall first, each hex with its assault days and the path it feeds; the standing siege’s days agree', () => {
  const { state: s0, target } = setup(100)
  const state = clearOrders(send(withHex(s0, target, { garrisonDamage: 25 }), target), DAY)
  const view = ordersView(state, 1, DAY)
  assert.ok(view.targets.length > 1)
  for (let i = 1; i < view.targets.length; i++) {
    const [a, b] = [view.targets[i - 1], view.targets[i]]
    assert.ok(a.days < b.days || (a.days === b.days && a.garrison <= b.garrison), `${a.hexId} before ${b.hexId}`)
  }
  const besieged = view.targets.find((t) => t.hexId === target)
  assert.equal(besieged?.days, view.siege?.days, 'the list and the siege line read the same Marshal’s pick')
  assert.ok(view.targets.every((t) => t.days >= 1))
  // Each names the rivals whose paths its Dominion feeds, from its path shares.
  for (const t of view.targets) {
    const feeds = (Object.entries(pathShares(hex(state, t.hexId))) as [RivalId, number][]).filter(([, v]) => v > 0).map(([r]) => rivalName(r))
    assert.equal(t.path === '', feeds.length === 0, t.hexId)
    for (const name of feeds) assert.ok(t.path.includes(`${name}’s`), `${t.hexId}: ${t.path}`)
  }
})

test('Patch 7 (C5): the Herald shows spoils and tribute whole; the purse keeps its tenths', () => {
  const { target } = setup(100)
  const held = { id: 'e3', day: DAY, kind: 'defense', hexId: target, threat: 'beasts', outcome: 'victory', spoils: 40.3 } as unknown as GameEvent
  assert.equal(resultLine(held)?.facts?.spoils, 40)
  const lost = { id: 'e4', day: DAY, kind: 'defense', hexId: target, threat: 'beasts', outcome: 'defeat', tribute: 1.5 } as unknown as GameEvent
  assert.equal(resultLine(lost)?.facts?.tribute, 2)
  const taken = { id: 'e5', day: DAY, kind: 'assault', hexId: target, owner: 'neutral', outcome: 'taken', spoils: 12.6 } as GameEvent
  assert.equal(resultLine(taken)?.facts?.spoils, 13)
})
