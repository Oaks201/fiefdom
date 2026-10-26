/**
 * Patch 7 (A2, D-56; docs/redesign/patch-7-proposals.md section 3): reach, a measure that weighs the
 * player's Valor against how deep the realm reaches. Settlement fixes it at each dawn from the patrol at
 * the Valor of the 7 days before; beasts and mythics strike weaker within it and harder beyond, and an
 * assault beyond it fights without supply.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { combatOf, dawnTiding, patrolStrength } from '../../src/renderer/src/lib/game/combat'
import { depthOf, isLairMarch } from '../../src/renderer/src/lib/game/map'
import { reachDepth, reachStanding, stepsBeyond, strikeMult, supplyMult, withReach } from '../../src/renderer/src/lib/game/reach'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { garrisonMult } from '../../src/renderer/src/lib/game/sieges'
import type { CampaignState, HexState } from '../../src/renderer/src/lib/game/types'
import { hexPanel, mapView, reachLine } from '../../src/renderer/src/lib/game/view/realm'
import { START, chicago, goodDay, ledgerWith } from './fixtures/ledgers'
import { realm } from './support/realm'

const R = RULES.reach
const curve = RULES.land.depthCurve

/** A rival march's hex at `depth`, and a lair's. */
function marchHex(state: CampaignState, depth: number, lair = false): HexState {
  return state.hexes.find((h) => h.march !== undefined && isLairMarch(h.march) === lair && depthOf(h) === depth) as HexState
}

test('Patch 7 A2: a march’s reach is the deepest depth whose beasts strike no harder than patrolShare × the patrol, by its depth curve', () => {
  for (const patrol of [10, 40, 80, 150, 300]) {
    for (const lair of [false, true]) {
      const c = lair ? curve.lair : curve.rival
      const d = reachDepth(patrol, lair)
      const strike = (depth: number): number => RULES.combat.strength.beasts * c.first * depth ** c.exponent
      if (d > 0) assert.ok(strike(d) <= R.patrolShare * patrol, `${patrol} ${lair}: depth ${d} within`)
      if (d < (lair ? RULES.map.lairDepth : RULES.map.marchDepth)) assert.ok(strike(d + 1) > R.patrolShare * patrol, `${patrol} ${lair}: depth ${d + 1} beyond`)
    }
  }
  assert.ok(reachDepth(300, true) <= reachDepth(300, false), 'a lair climbs faster, so the reach there is shallower')
  assert.equal(reachDepth(0, false), 0)
})

test('Patch 7 A2: beasts and mythics strike weaker within reach and harder a step at a time beyond it; an assault beyond it faces its garrison without supply', () => {
  const state = withReach(realm(), START, 60, 1)
  const reach = state.reach!
  const within = marchHex(state, reach.rival)
  const one = marchHex(state, reach.rival + 1)
  const five = marchHex(state, reach.rival + 5)
  assert.deepEqual([stepsBeyond(state, within), stepsBeyond(state, one), stepsBeyond(state, five)], [0, 1, 5])
  assert.equal(strikeMult(state, within), R.withinMult)
  assert.equal(strikeMult(state, one), 1 + R.beyondPerStep)
  assert.equal(strikeMult(state, five), R.beyondCap)
  assert.equal(supplyMult(state, within), 1)
  assert.equal(supplyMult(state, one), 1 + R.supplyPerStep)
  assert.equal(supplyMult(state, five), 1 + R.supplyCap)
  // The heartland is always within reach; a save without a reach changes nothing.
  const home = state.hexes.find((h) => h.ring === 1) as HexState
  assert.equal(strikeMult(state, home), R.withinMult)
  assert.deepEqual([strikeMult(realm(), one), supplyMult(realm(), one), stepsBeyond(realm(), one)], [1, 1, null])
  assert.deepEqual([reachStanding(state, within)?.kind, reachStanding(state, one)?.kind, reachStanding(state, one)?.steps, reachStanding(state, home)?.kind], ['edge', 'beyond', 1, 'within'])
  // Supply rides on the garrison multiple every assault reads.
  const day = START
  assert.ok(Math.abs(garrisonMult(state, one, day) / garrisonMult(realm(), one, day) - (1 + R.supplyPerStep)) < 1e-9)
})

test('Patch 7 A2: the day’s beasts and mythics strike at the reach’s multiple; raids are as before', () => {
  const plain = realm()
  const reached = withReach(plain, START, 60, 1)
  for (let i = 0; i < 40; i++) {
    const date = addDays(START, i)
    const before = dawnTiding(plain, date)
    const after = dawnTiding(reached, date)
    if (!before || !after) continue
    assert.equal(after.hexId, before.hexId)
    const hex = plain.hexes.find((h) => h.id === before.hexId) as HexState
    const mult = before.kind === 'beasts' || before.kind === 'mythic' ? strikeMult(reached, hex) : 1
    assert.ok(Math.abs(after.strength - before.strength * mult) < 1e-9, `${date} ${before.kind}`)
  }
})

test('Patch 7 A2: each march hex’s panel says where it stands against the reach, and the map shades the land beyond it', () => {
  const state = withReach(realm(), START, 60, 1)
  const reach = state.reach!
  const edge = marchHex(state, reach.rival)
  const two = marchHex(state, reach.rival + 2)
  const pc = (share: number): string => `${Math.round(share * 100)}%`
  assert.equal(reachLine(state, edge)?.text, `The edge of your reach: beasts and mythics strike ${pc(1 - R.withinMult)} weaker`)
  assert.equal(reachLine(state, two)?.text, `2 steps beyond your reach: beasts and mythics strike ${pc(2 * R.beyondPerStep)} harder, and an assault faces a ${pc(2 * R.supplyPerStep)} stronger garrison`)
  assert.equal(reachLine(state, state.hexes.find((h) => h.ring === 1) as HexState), undefined, 'none in the heartland')
  assert.equal(reachLine(realm(), two), undefined, 'none before the first 3.7.0 dawn')
  assert.equal(hexPanel(state, two.id, START)?.reach?.kind, 'beyond')
  const map = mapView(state, START)
  assert.equal(map.find((h) => h.id === two.id)?.beyondReach, 2)
  assert.equal(map.find((h) => h.id === edge.id)?.beyondReach, undefined)
})

test('Patch 7 A2, X-17: while the player is away the reach holds where it was; absence never costs anything', () => {
  const kept = 21
  const ledger = ledgerWith(addDays(START, -28), kept + 28)
  const launched = settle(realm(7, ledger), ledger, chicago(addDays(START, kept)), { launch: true }).state
  const last = launched.settlement.lastLaunch as string
  const away = RULES.clock.absenceDays
  const beforeAway = settle(launched, ledger, chicago(addDays(last, away - 1))).state.reach
  const longAway = settle(launched, ledger, chicago(addDays(last, away + 10))).state.reach
  assert.equal(longAway?.day, addDays(last, away + 10))
  assert.deepEqual({ ...longAway, day: undefined }, { ...beforeAway, day: undefined }, 'held since the absence began')
})

test('Patch 7 A2: settlement fixes the reach at each dawn from the patrol at the 7 days’ Valor before, so a good week reaches deeper than a bad one; settling again changes nothing', () => {
  const days = 21
  const good = ledgerWith(addDays(START, -28), days + 28)
  const poor = ledgerWith(addDays(START, -28), days + 28, (i) => (i >= 28 + 7 ? { steps: 1_000, done: {} } : goodDay()))
  const now = chicago(addDays(START, days))
  const g = settle(realm(7, good), good, now).state
  const p = settle(realm(7, poor), poor, now).state
  assert.equal(g.reach?.day, addDays(START, days))
  assert.ok((g.reach?.valor ?? 0) > (p.reach?.valor ?? 1), 'the good week’s Valor')
  assert.ok((g.reach?.patrol ?? 0) > (p.reach?.patrol ?? Infinity), 'the good week’s patrol')
  assert.ok(Math.abs((g.reach?.patrol ?? 0) - patrolStrength(g, g.reach!.day, g.reach!.valor)) < 1e-6, 'its patrol at its Valor')
  assert.ok((g.reach?.rival ?? 0) >= (p.reach?.rival ?? 0))
  const again = settle(g, good, now).state
  assert.deepEqual(again.reach, g.reach)
  assert.deepEqual(combatOf(again).tidings, combatOf(g).tidings)
})
