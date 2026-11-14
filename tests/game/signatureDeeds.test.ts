/**
 * Patch 4 (docs/redesign/patch-4-spec.md section 7.1, D-34): each rival's signature deeds, posted by
 * the chronicle from the log to that rival's path alone. The Goblin counts deals (by depth), bargains and
 * bids held; the Dwarf counts walls broken and sieges endured; the Archmage counts surges weathered and
 * seized and Rituals endured. Each posts once.
 *
 * Patch 10 (D-80; X2, X5) retired five of them: the Orc's battle lost and hex retaken (his field streak
 * replaces them, tests/game/crafts.test.ts), a courtship won against the Goblin's bid, the Dwarf's
 * conquest broken and a summoned mythic's hex taken. K4: the Goblin's deal counts in any march.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chronicle, renown } from '../../src/renderer/src/lib/game/dominion'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { depthOf, isClaimableKind, pathShares, strongholds } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { RETIRED_DEEDS, type CampaignState, type DeedKind, type GameEvent, type GameEventMap, type HexState, type RivalId } from '../../src/renderer/src/lib/game/types'
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

/** The signature deeds posted (every deed but the ordinary hexTaken and battleWon, and the Orc's field day), as [deed, path, value]. */
function signatures(deeds: readonly Deed[]): [DeedKind, RivalId, number][] {
  return deeds
    .filter((d) => d.deed !== 'hexTaken' && d.deed !== 'battleWon' && d.deed !== 'fieldDay')
    .map((d): [DeedKind, RivalId, number] => [d.deed, d.path, d.value])
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))
}

test('D-80 (X2): a battle lost to the Orc and a hex taken back from him post no deed of their own; the day is a field day', () => {
  const s0 = read()
  const orc = plainIn(s0.hexes, 'orc', 3)
  const lost = plainIn(s0.hexes, 'orc', 2)
  const goblin = plainIn(s0.hexes, 'goblin', 3)
  const state = logged(withOwner(s0, [goblin.id, lost.id], 'player'), [
    { kind: 'hexTransfer', hexId: lost.id, from: 'player', to: 'orc', how: 'conquest', day: addDays(START, -3) },
    { kind: 'assault', hexId: orc.id, owner: 'orc', outcome: 'repulsed', wear: 5 },
    { kind: 'defense', threat: 'raid', hexId: goblin.id, rival: 'orc', outcome: 'defeat', tribute: 10 },
    { kind: 'hexTransfer', hexId: lost.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0 }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds), [])
  assert.deepEqual(deeds.filter((d) => RETIRED_DEEDS.includes(d.deed)), [])
  assert.equal(deeds.filter((d) => d.deed === 'fieldDay').length, 1, 'one field day, however many battles')
})

test('D-34, D-80 (K4, X5): the Goblin counts a hex won by a deal (by depth), a bargain bribe and a bid held; a courtship won against his bid adds nothing more', () => {
  const s0 = read()
  const bought = plainIn(s0.hexes, 'goblin', 4)
  const dear = plainIn(s0.hexes, 'goblin', 3)
  const village = s0.hexes.find((h) => h.march === 'goblin' && h.village && !h.seam) as HexState
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
    ['dealTaken', 'goblin', D.dealTakenPerDepth * depthOf(bought)]
  ])
})

test('D-80 (K4): a hex won by a bribe, a courtship or a trade in another ruler’s march adds the deal’s deed to the Goblin’s path; one taken by force does not', () => {
  const s0 = read()
  const traded = plainIn(s0.hexes, 'archmage', 4)
  const courted = s0.hexes.find((h) => h.march === 'dwarf' && h.village && !h.seam) as HexState
  const stormed = plainIn(s0.hexes, 'orc', 3)
  const state = logged(withOwner(s0, [traded.id, courted.id, stormed.id], 'player'), [
    { kind: 'hexTransfer', hexId: traded.id, from: 'archmage', to: 'player', how: 'trade', fortification: 0 },
    { kind: 'hexTransfer', hexId: courted.id, from: 'dwarf', to: 'player', how: 'influence', fortification: 0 },
    { kind: 'hexTransfer', hexId: stormed.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0 }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === traded.id)), [['dealTaken', 'goblin', D.dealTakenPerDepth * depthOf(traded)]])
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === courted.id)), [['dealTaken', 'goblin', D.dealTakenPerDepth * depthOf(courted)]])
  assert.deepEqual(signatures(deeds.filter((d) => d.hexId === stormed.id)), [])
  assert.ok(deeds.some((d) => d.hexId === traded.id && d.deed === 'hexTaken' && d.path === 'archmage'), 'the hex’s own deed still goes to its march’s path')
})

test('D-34, D-80 (X5): the Dwarf counts walls broken (per level) and a siege endured (per repulse, capped); his conquest beaten is an ordinary battle won', () => {
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
    deeds.filter((d) => d.hexId === held.id).map((d) => [d.deed, d.path, d.value]),
    [['battleWon', 'dwarf', D.battleWon]]
  )
})

test('D-34, D-80 (X5): the Archmage counts a surge weathered, a hex seized on its ebb and a Ritual endured; a summoned mythic’s hex taken adds nothing more', () => {
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
    ['surgeSeized', 'archmage', D.surgeSeized * (pathShares(ebbed).archmage ?? 0)],
    ['surgeWeathered', 'archmage', D.surgeWeathered]
  ])
})

test('D-34: the chronicle read twice posts nothing new, and the Renown matches the deeds (Test 9)', () => {
  const s0 = read()
  const struck = plainIn(s0.hexes, 'archmage', 2)
  const once = posted(logged(withOwner(s0, [struck.id], 'player'), [{ kind: 'defense', threat: 'surge', hexId: struck.id, rival: 'archmage', outcome: 'victory', spoils: 5 }]))
  assert.equal(once.deeds.length, 1)
  assert.equal(renown(once.state).archmage - renown(s0).archmage, D.surgeWeathered)
  const twice = posted(once.state)
  assert.deepEqual(twice.deeds, [])
  assert.deepEqual(renown(twice.state), renown(once.state))
})

test('D-34, D-80: the Herald reads every signature deed through its catalog slot, with its value and path; a retired deed in an older save’s log still reads', () => {
  const s0 = read()
  const h = plainIn(s0.hexes, 'dwarf', 3)
  const kinds: DeedKind[] = ['dealTaken', 'bargain', 'bribeBeaten', 'wallsBroken', 'siegeEndured', 'surgeWeathered', 'surgeSeized', 'ritualEndured', ...RETIRED_DEEDS]
  for (const kind of kinds) {
    const line = resultLine({ id: 'e1', day: START, kind: 'deed', path: 'dwarf', deed: kind, value: 3, hexId: h.id })
    assert.equal(line?.textId, `herald.deed.${kind}`)
    assert.match(line?.text ?? '', /3 Renown/, kind)
    assert.doesNotMatch(line?.text ?? '', /\{/, `${kind}: every placeholder filled`)
  }
})
