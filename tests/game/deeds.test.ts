/**
 * Patch 3 stage 5 (docs/redesign/patch-3-spec.md section 6, D-25): the siege patch's deeds. A
 * stronghold taken adds its own deed to the hex deed (and one won in battle, the Grand Battle's); a
 * counterattack held is its own deed, in place of the battle's ordinary one; and the chronicle posts
 * each once.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combatOf } from '../../src/renderer/src/lib/game/combat'
import { chronicle, renown } from '../../src/renderer/src/lib/game/dominion'
import { autoResolve, challenge } from '../../src/renderer/src/lib/game/grand'
import { depthOf, isClaimableKind, neighbors, pathShares, strongholds } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, DeedKind, GameEvent, GameEventMap, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { collector, type Posted } from './support/grand'
import { allBuildings, realm, withCastle, withPurse } from './support/realm'
import { START, WEEK6, den, fight, hex, quiet, withHex, withOwner } from './support/war'

const D = RULES.dominion.deeds

type Deed = GameEventMap['deed']

/** The stronghold of `march` at `depth`. */
function fortOf(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const id = [...strongholds(hexes)].find(([, s]) => s.march === march && s.depth === depth)?.[0] as string
  return hexes.find((h) => h.id === id) as HexState
}

/** A plain march hex beside nothing special: not a stronghold, a village or a seam. */
function plainIn(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const forts = strongholds(hexes)
  return hexes.find((h) => h.march === march && !h.seam && !h.village && !forts.has(h.id) && isClaimableKind(h) && depthOf(h) === depth) as HexState
}

/** A founded realm whose chronicle has read the founding log, so only what a test adds is new. */
function read(state: CampaignState = realm()): CampaignState {
  return chronicle(state, () => undefined)
}

/** `state` with `events` written into its log on `day`, as settlement writes them. */
function logged(state: CampaignState, events: readonly Posted[], day = START): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ ...e, id: `t:${state.log.length + i}`, day }) as GameEvent)] }
}

/** Runs the chronicle and returns the deeds it posted. */
function posted(state: CampaignState): { state: CampaignState; deeds: Deed[] } {
  const c = collector()
  return { state: chronicle(state, c.emit), deeds: c.of('deed') }
}

/** A hex's deeds as [deed, path, value] rows, sorted. */
function rows(deeds: readonly Deed[], hexId: string): [DeedKind, RivalId, number][] {
  return sorted(deeds.filter((d) => d.hexId === hexId).map((d): [DeedKind, RivalId, number] => [d.deed, d.path, d.value]))
}

function sorted(list: [DeedKind, RivalId, number][]): [DeedKind, RivalId, number][] {
  return [...list].sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`))
}

/** What `deed` worth `value` spreads to over the hex's path shares, as rows. */
function spreadRows(h: HexState, deed: DeedKind, value: number): [DeedKind, RivalId, number][] {
  return sorted((Object.entries(pathShares(h)) as [RivalId, number][]).map(([path, s]): [DeedKind, RivalId, number] => [deed, path, value * s]))
}

test('D-25: a stronghold taken posts the hex deed and strongholdTaken, 2 × depth on its shares; a plain hex beside it only the hex deed; a rival’s fall neither', () => {
  const s0 = read()
  const fort = fortOf(s0.hexes, 'orc', 4)
  const deep = fortOf(s0.hexes, 'orc', 8)
  const plain = plainIn(s0.hexes, 'orc', 4)
  const state = logged(withOwner(s0, [fort.id, plain.id, deep.id], 'player'), [
    { kind: 'hexTransfer', hexId: fort.id, from: 'neutral', to: 'player', how: 'conquest', fortification: 1 },
    { kind: 'hexTransfer', hexId: plain.id, from: 'neutral', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'hexTransfer', hexId: deep.id, from: 'orc', to: 'player', how: 'abdication', fortification: 0 }
  ])
  const { state: after, deeds } = posted(state)
  assert.deepEqual(rows(deeds, fort.id), [
    ['hexTaken', 'orc', D.hexTakenPerDepth * 4 + D.perFortification],
    ['strongholdTaken', 'orc', D.strongholdPerDepth * 4]
  ])
  assert.deepEqual(rows(deeds, plain.id), [['hexTaken', 'orc', D.hexTakenPerDepth * 4]])
  assert.deepEqual(rows(deeds, deep.id), [], 'a hex handed over at a rival’s fall is no deed (C-10)')
  assert.equal(renown(after).orc - renown(s0).orc, 4 + 2 + 8 + 4)
})

test('D-25: a stronghold won in its Grand Battle posts the Grand Battle deed, the hex deed and strongholdTaken', () => {
  const s0 = read(withPurse(realm(), 500))
  const fort = fortOf(s0.hexes, 'orc', 4)
  const inside = neighbors(fort.id).filter((n) => hex(s0, n).ring === fort.ring - 1)
  const strong = withCastle(allBuildings(withHex(withOwner(s0, inside, 'player'), fort.id, { garrison: 5 }), 4), 4)
  const asked = challenge(strong, fort.id, START)
  const c = collector()
  const won = autoResolve(asked.state, asked.battle!.id, asked.battle!.battleDate, [1, 1, 1, 1, 1, 1, 1], c.emit)
  assert.equal(hex(won, fort.id).owner, 'player')
  const { deeds } = posted(logged(won, c.events, asked.battle!.battleDate))
  assert.deepEqual(rows(deeds, fort.id), [
    ['grandBattleWon', 'orc', D.grandBattleWon],
    ['hexTaken', 'orc', D.hexTakenPerDepth * depthOf(fort)],
    ['strongholdTaken', 'orc', D.strongholdPerDepth * depthOf(fort)]
  ])
})

test('D-25: a counterattack held is counterattackHeld (2 to the rival; 1 × the hex’s shares for beasts) and not the battle’s ordinary deed; lost, nothing', () => {
  const s0 = read()
  const plain = plainIn(s0.hexes, 'orc', 3)
  const seam = s0.hexes.find((h) => h.seam !== undefined && h.ring > RULES.map.heartlandRings && isClaimableKind(h)) as HexState
  const other = plainIn(s0.hexes, 'goblin', 3)
  const state = logged(withOwner(s0, [plain.id, seam.id, other.id], 'player'), [
    { kind: 'defense', threat: 'counterattack', hexId: plain.id, rival: 'orc', outcome: 'victory', spoils: 8 },
    { kind: 'defense', threat: 'counterattack', hexId: seam.id, outcome: 'rout', spoils: 12 },
    { kind: 'defense', threat: 'counterattack', hexId: other.id, rival: 'goblin', outcome: 'defeat', tribute: 15, retaken: true }
  ])
  const { deeds } = posted(state)
  assert.deepEqual(rows(deeds, plain.id), [['counterattackHeld', 'orc', D.counterattackHeld]])
  assert.deepEqual(rows(deeds, seam.id), spreadRows(seam, 'counterattackHeld', D.counterattackHeldBeasts))
  assert.equal(rows(deeds, seam.id).length, 2, 'a seam splits it between its two paths')
  assert.deepEqual(rows(deeds, other.id), [])
  assert.ok(!deeds.some((d) => d.deed === 'battleWon' || d.deed === 'heldAgainstBeasts'))
})

test('D-25: a counterattack held in a day’s fighting posts counterattackHeld once; the chronicle read twice posts nothing new (Test 9)', () => {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const refuge = neighbors(target).find((n) => hex(s0, n).owner === 'neutral') as string
  const base = read(withOwner(s0, [target], 'player'))
  const struck: CampaignState = {
    ...base,
    fallbacks: [{ id: 'fb:d', from: target, to: refuge, holder: 'neutral', strength: 1, day: START, drawnThrough: WEEK6, struck: WEEK6 }],
    combat: { ...combatOf(base), counterattacks: [{ date: WEEK6, hexId: target, strength: 1, fallbackId: 'fb:d' }] }
  }
  const held = fight(quiet(struck, WEEK6), WEEK6, 1)
  assert.notEqual(held.of('defense').find((d) => d.threat === 'counterattack')?.outcome, 'defeat')
  const once = posted(logged(held.state, held.events, WEEK6))
  assert.deepEqual(rows(once.deeds, target), spreadRows(hex(base, target), 'counterattackHeld', D.counterattackHeldBeasts))
  const twice = posted(once.state)
  assert.deepEqual(twice.deeds, [])
  assert.deepEqual(renown(twice.state), renown(once.state))
})

test('D-25: the Herald reads the new deeds with their hex, value and path', () => {
  const s0 = read()
  const fort = fortOf(s0.hexes, 'dwarf', 4)
  const deed = (d: DeedKind, value: number): GameEvent => ({ id: 'e1', day: START, kind: 'deed', path: 'dwarf', deed: d, value, hexId: fort.id })
  for (const kind of ['strongholdTaken', 'counterattackHeld'] as const) {
    const line = resultLine(deed(kind, 8))
    assert.equal(line?.textId, `herald.deed.${kind}`)
    assert.match(line?.text ?? '', /8 Renown/)
  }
})
