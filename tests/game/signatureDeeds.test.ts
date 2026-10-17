/**
 * Patch 4 (docs/redesign/patch-4-spec.md section 7.1, D-34): each rival's signature deeds, posted by
 * the chronicle from the log to that rival's path alone. The Orc counts every battle with him, a
 * repulse or a loss too, and a hex retaken from him; the Goblin counts deals (by depth), bargains and
 * bids beaten; the Dwarf counts walls broken, sieges endured and his conquests broken; the Archmage
 * counts surges weathered and seized, Rituals endured and summoned mythics beaten. Each posts once.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chronicle, renown } from '../../src/renderer/src/lib/game/dominion'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { depthOf, isClaimableKind, pathShares, strongholds } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, DeedKind, GameEvent, GameEventMap, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { collector, type Posted } from './support/grand'
import { realm } from './support/realm'
import { START, withOwner } from './support/war'

const D = RULES.dominion.deeds

type Deed = GameEventMap['deed']

/** A plain march hex: not a stronghold, a village or a seam. */
function plainIn(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const forts = strongholds(hexes)
  return hexes.find((h) => h.march === march && !h.seam && !h.village && !forts.has(h.id) && isClaimableKind(h) && depthOf(h) === depth) as HexState
}

function read(state: CampaignState = realm()): CampaignState {
  return chronicle(state, () => undefined)
}

function logged(state: CampaignState, events: readonly (Posted & { day?: string })[], day = START): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ day, ...e, id: `t:${state.log.length + i}` }) as GameEvent)] }
}

function posted(state: CampaignState): { state: CampaignState; deeds: Deed[] } {
  const c = collector()
  return { state: chronicle(state, c.emit), deeds: c.of('deed') }
}

/** The signature deeds posted (every deed but the ordinary hexTaken), as [deed, path, value]. */
function signatures(deeds: readonly Deed[]): [DeedKind, RivalId, number][] {
  return deeds
    .filter((d) => d.deed !== 'hexTaken')
    .map((d): [DeedKind, RivalId, number] => [d.deed, d.path, d.value])
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))
}

test('D-34: the Orc counts every battle with him: a repulse of an assault on his hex and a defense lost to him; another rival’s, nothing', () => {
  const s0 = read()
  const orc = plainIn(s0.hexes, 'orc', 3)
  const goblin = plainIn(s0.hexes, 'goblin', 3)
  const state = logged(withOwner(s0, [goblin.id], 'player'), [
    { kind: 'assault', hexId: orc.id, owner: 'orc', outcome: 'repulsed', wear: 5 },
    { kind: 'assault', hexId: goblin.id, owner: 'goblin', outcome: 'repulsed', wear: 5 },
    { kind: 'defense', threat: 'raid', hexId: goblin.id, rival: 'orc', outcome: 'defeat', tribute: 10 },
    { kind: 'defense', threat: 'raid', hexId: goblin.id, rival: 'dwarf', outcome: 'defeat', tribute: 10 }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds), [
    ['battleLost', 'orc', D.battleLost],
    ['battleLost', 'orc', D.battleLost]
  ])
})

test('D-34: a hex the Orc took from the player, taken back, is retaken (to the Orc’s path); one he never held is not', () => {
  const s0 = read()
  const lost = plainIn(s0.hexes, 'orc', 3)
  const fresh = plainIn(s0.hexes, 'orc', 2)
  const state = logged(withOwner(s0, [lost.id, fresh.id], 'player'), [
    { kind: 'hexTransfer', hexId: lost.id, from: 'player', to: 'orc', how: 'conquest', day: addDays(START, -3) },
    { kind: 'hexTransfer', hexId: lost.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'hexTransfer', hexId: fresh.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0 }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === lost.id)), [['retaken', 'orc', D.retaken]])
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === fresh.id)), [])
})

test('D-34: the Goblin counts a hex won by a deal (by depth × his share), a bargain bribe, a bid held and a counter-bid beaten', () => {
  const s0 = read()
  const bought = plainIn(s0.hexes, 'goblin', 4)
  const dear = plainIn(s0.hexes, 'goblin', 3)
  const village = s0.hexes.find((h) => h.march === 'goblin' && h.village && !h.seam) as HexState
  const share = pathShares(bought).goblin ?? 0
  const state = logged(withOwner(s0, [bought.id, dear.id, village.id], 'player'), [
    { kind: 'bribe', hexId: bought.id, owner: 'goblin', price: 40, garrison: 60 },
    { kind: 'hexTransfer', hexId: bought.id, from: 'goblin', to: 'player', how: 'bribe', fortification: 0 },
    { kind: 'bribe', hexId: dear.id, owner: 'goblin', price: 70, garrison: 60 },
    { kind: 'goblinBid', hexId: village.id, stage: 'held', offer: 30 },
    { kind: 'goblinBid', hexId: village.id, stage: 'lost', offer: 30 },
    { kind: 'courtship', hexId: village.id, outcome: 'defected', bid: 20, winner: 'player', rivals: ['goblin'] },
    { kind: 'courtship', hexId: village.id, outcome: 'defected', bid: 20, winner: 'player', rivals: ['orc'] }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds), [
    ['bargain', 'goblin', D.bargain],
    ['bribeBeaten', 'goblin', D.bribeBeaten],
    ['counterBidBeaten', 'goblin', D.counterBidBeaten],
    ['dealTaken', 'goblin', D.dealTakenPerDepth * depthOf(bought) * share]
  ])
})

test('D-34: the Dwarf counts walls broken (per level), a siege endured (per repulse, capped) and his conquest broken', () => {
  const s0 = read()
  const walled = plainIn(s0.hexes, 'dwarf', 3)
  const besieged = plainIn(s0.hexes, 'dwarf', 4)
  const held = plainIn(s0.hexes, 'dwarf', 2)
  const share = (h: HexState): number => pathShares(h).dwarf ?? 0
  const repulses = Array.from({ length: D.siegeEnduredCap + 2 }, (_, i) => ({ kind: 'assault' as const, hexId: besieged.id, owner: 'dwarf', outcome: 'repulsed', wear: 5, day: addDays(START, -(i + 1)) }))
  const state = logged(withOwner(s0, [walled.id, besieged.id, held.id], 'player'), [
    ...repulses.reverse(),
    { kind: 'hexTransfer', hexId: walled.id, from: 'dwarf', to: 'player', how: 'conquest', fortification: 2 },
    { kind: 'hexTransfer', hexId: besieged.id, from: 'dwarf', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'defense', threat: 'conquest', hexId: held.id, rival: 'dwarf', outcome: 'victory', spoils: 10 }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === walled.id)), [['wallsBroken', 'dwarf', D.wallsBroken * 2 * share(walled)]])
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === besieged.id)), [['siegeEndured', 'dwarf', D.siegeEndured * D.siegeEnduredCap * share(besieged)]])
  assert.deepEqual(
    signatures(deeds.filter((d) => d.hexId === held.id)),
    [['siegeBroken', 'dwarf', D.siegeBroken]],
    'his conquest broken is his signature, in place of the battle’s ordinary deed'
  )
})

test('D-34: the Archmage counts a surge weathered, a hex seized on its ebb, a Ritual endured and a summoned mythic beaten', () => {
  const s0 = read()
  const struck = plainIn(s0.hexes, 'archmage', 2)
  const ebbed = plainIn(s0.hexes, 'archmage', 3)
  const summoned = plainIn(s0.hexes, 'archmage', 4)
  const state = logged(withOwner(s0, [struck.id, ebbed.id, summoned.id], 'player'), [
    { kind: 'surge', surge: 'summoning', hexId: summoned.id, day: addDays(START, -2) },
    { kind: 'surge', surge: 'ebb', hexId: ebbed.id, mult: 0.6 },
    { kind: 'defense', threat: 'surge', hexId: struck.id, rival: 'archmage', outcome: 'victory', spoils: 5 },
    { kind: 'hexTransfer', hexId: ebbed.id, from: 'archmage', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'hexTransfer', hexId: summoned.id, from: 'neutral', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'ritual', ritualId: 'veil' }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds), [
    ['ritualEndured', 'archmage', D.ritualEndured],
    ['summonedDefeated', 'archmage', D.summonedDefeated],
    ['surgeSeized', 'archmage', D.surgeSeized * (pathShares(ebbed).archmage ?? 0)],
    ['surgeWeathered', 'archmage', D.surgeWeathered]
  ])
})

test('D-34: the chronicle read twice posts nothing new, and the Renown matches the deeds (Test 9)', () => {
  const s0 = read()
  const orc = plainIn(s0.hexes, 'orc', 3)
  const once = posted(logged(s0, [{ kind: 'assault', hexId: orc.id, owner: 'orc', outcome: 'repulsed', wear: 5 }]))
  assert.equal(once.deeds.length, 1)
  assert.equal(renown(once.state).orc - renown(s0).orc, D.battleLost)
  const twice = posted(once.state)
  assert.deepEqual(twice.deeds, [])
  assert.deepEqual(renown(twice.state), renown(once.state))
})

test('D-34: the Herald reads every signature deed through its catalog slot, with its value and path', () => {
  const s0 = read()
  const h = plainIn(s0.hexes, 'dwarf', 3)
  const kinds: DeedKind[] = ['battleLost', 'retaken', 'dealTaken', 'bargain', 'bribeBeaten', 'counterBidBeaten', 'wallsBroken', 'siegeEndured', 'siegeBroken', 'surgeWeathered', 'surgeSeized', 'ritualEndured', 'summonedDefeated']
  for (const kind of kinds) {
    const line = resultLine({ id: 'e1', day: START, kind: 'deed', path: 'dwarf', deed: kind, value: 3, hexId: h.id })
    assert.equal(line?.textId, `herald.deed.${kind}`)
    assert.match(line?.text ?? '', /3 Renown/, kind)
    assert.doesNotMatch(line?.text ?? '', /\{/, `${kind}: every placeholder filled`)
  }
})
