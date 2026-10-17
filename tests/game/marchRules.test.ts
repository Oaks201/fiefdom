/**
 * Patch 4 stage 2 (docs/redesign/patch-4-spec.md sections 3.1, 3.2, 3.4 and 4; D-27, D-28, D-30, D-32):
 * each march plays by its rival's rules over the whole march (P4-01); the Orc's weaker garrisons, war
 * track and attrition (P4-05); the Dwarf's walls on the wilds, slow sieges, digging in and keeping what
 * he lost (P4-06); fallbacks by personality (C-44, N-02 to N-05).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, setOrders } from '../../src/renderer/src/lib/game/combat'
import { depthOf, hexIndex, isClaimableKind, neighbors, touches } from '../../src/renderer/src/lib/game/map'
import { preparationMult } from '../../src/renderer/src/lib/game/marches'
import {
  dissolves,
  eventsOn,
  fallbackShareOn,
  freeWalls,
  marchGarrisonMult,
  marchRule,
  marchRulesDay,
  orcStrikeMult,
  orcTrackOf,
  raidWeight,
  rulesHarden,
  strikeChance,
  wearDecayOn,
  wildsMayReclaim,
  wildWalls,
  withPersonalities
} from '../../src/renderer/src/lib/game/personalities'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { strongholdMult } from '../../src/renderer/src/lib/game/sieges'
import type { CampaignState, Emit, GameEvent, GameEventKind, GameEventMap, HexState, MarchId, RivalId } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { allBuildings, realm } from './support/realm'
import { START, fight, hex, quiet, withHex, withOwner, withTiding } from './support/war'

const P = RULES.personalities
/** Monday of campaign week 3, when the rules that harden a march begin (C-37). */
const WEEK3 = '2026-10-19'

/** A plain hex of `march` (no seam, no village, not a stronghold) at `depth`, first in map order. */
function marchHex(state: CampaignState, march: MarchId, depth: number, also: (h: HexState) => boolean = () => true): HexState {
  const found = state.hexes.find((h) => h.march === march && !h.seam && depthOf(h) === depth && !h.village && strongholdMult(state.hexes, { ...h, owner: 'neutral' }) === 1 && also(h))
  if (!found) throw new Error(`No plain hex of ${march} at depth ${depth}`)
  return found
}

/** A seam hex, first in map order. */
function seamHex(state: CampaignState): HexState {
  return state.hexes.find((h) => h.seam !== undefined && h.march !== undefined) as HexState
}

/** An emitter that collects what it is given. */
function collect(): { emit: Emit; events: ({ kind: GameEventKind } & Record<string, unknown>)[] } {
  const events: ({ kind: GameEventKind } & Record<string, unknown>)[] = []
  return { events, emit: (kind, payload) => void events.push({ kind, ...payload }) }
}

/** The state with `events` in its log, dated `day`. */
function logged<K extends GameEventKind>(state: CampaignState, day: string, events: ({ kind: K } & GameEventMap[K])[]): CampaignState {
  const log = events.map((e, i) => ({ id: `t${state.log.length + i}`, day, ...e }) as unknown as GameEvent)
  return { ...state, log: [...state.log, ...log] }
}

test('D-27 (P4-01): a march rule governs every hex of its march, a seam by the march ruling it that day; the heartland and the lair wedges keep the common rules', () => {
  const s = realm()
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as const) assert.equal(marchRule(s, marchHex(s, r, 2), START), r)
  assert.equal(marchRule(s, s.hexes.find((h) => h.ring === 2) as HexState, START), undefined, 'the heartland')
  assert.equal(marchRule(s, s.hexes.find((h) => h.march === 'wyrmfells' && !h.seam) as HexState, START), undefined, 'a lair wedge')
  const seam = seamHex(s)
  const rulings = new Set<string | undefined>()
  for (let d = 0; d < 20; d++) rulings.add(marchRule(s, seam, addDays(START, d)))
  for (const r of rulings) assert.ok(r === undefined || r === seam.march || r === seam.seam)
  assert.ok(rulings.size > 1, 'a seam changes hands between its marches day by day')
})

test('C-37: what hardens a march starts at week 3', () => {
  const s = realm()
  assert.equal(rulesHarden(s, START), false)
  assert.equal(rulesHarden(s, addDays(WEEK3, -1)), false)
  assert.equal(rulesHarden(s, WEEK3), true)
})

test('D-28, N-04: the Orc’s march weighs 0.85 of its garrison against the player’s assault, eased or hardened 2% a step of his track; never on the player’s hexes or other marches', () => {
  const s = realm()
  const orc = marchHex(s, 'orc', 3)
  near(marchGarrisonMult(s, orc, START), P.orc.garrisonMult)
  near(marchGarrisonMult(withPersonalities(s, { orcTrack: 3 }), orc, START), P.orc.garrisonMult * (1 - 3 * P.orc.track.garrisonPerStep))
  near(marchGarrisonMult(withPersonalities(s, { orcTrack: -3 }), orc, START), P.orc.garrisonMult * (1 + 3 * P.orc.track.garrisonPerStep))
  assert.equal(marchGarrisonMult(s, { ...orc, owner: 'player' }, START), 1)
  assert.equal(marchGarrisonMult(s, marchHex(s, 'dwarf', 3), START), 1)
  // The player's assault reads it; preparation still applies on top.
  const plain = assaultGarrison(withHex(s, orc.id, { garrison: 100, garrisonDamage: 0, fortification: 0 }), { ...orc, garrison: 100, garrisonDamage: 0, fortification: 0 }, START)
  near(plain, 100 * P.orc.garrisonMult * preparationMult(s, orc, START))
})

test('D-28 (P4-05): the day’s battles with the Orc move his track at most a step, from week 3; a repulse is no loss', () => {
  const s = realm()
  const orc = marchHex(s, 'orc', 2)
  const raidWon = { kind: 'defense' as const, threat: 'raid' as const, hexId: orc.id, rival: 'orc' as RivalId, outcome: 'victory' as const }
  const raidLost = { ...raidWon, outcome: 'defeat' as const }
  // Before week 3, nothing moves.
  assert.equal(orcTrackOf(marchRulesDay(logged(s, START, [raidWon]), START, collect().emit)), 0)
  // Two wins: one step the player's way, posted.
  const c = collect()
  const won = marchRulesDay(logged(s, WEEK3, [raidWon, raidWon]), WEEK3, c.emit)
  assert.equal(orcTrackOf(won), 1)
  assert.deepEqual(c.events.filter((e) => e.kind === 'orcTrack').map((e) => [e.from, e.to]), [[0, 1]])
  // More losses than wins: a step his way.
  assert.equal(orcTrackOf(marchRulesDay(logged(s, WEEK3, [raidWon, raidLost, raidLost]), WEEK3, collect().emit)), -1)
  // A repulsed assault in his march is no loss; a hex taken there is a win.
  assert.equal(orcTrackOf(marchRulesDay(logged(s, WEEK3, [{ kind: 'assault', hexId: orc.id, owner: 'neutral', outcome: 'repulsed' }]), WEEK3, collect().emit)), 0)
  assert.equal(orcTrackOf(marchRulesDay(logged(s, WEEK3, [{ kind: 'assault', hexId: orc.id, owner: 'neutral', outcome: 'taken' }]), WEEK3, collect().emit)), 1)
  // It stops at its ends.
  assert.equal(orcTrackOf(marchRulesDay(logged(withPersonalities(s, { orcTrack: P.orc.track.max }), WEEK3, [raidWon]), WEEK3, collect().emit)), P.orc.track.max)
  // Settling a later day never rereads this one.
  const later = addDays(WEEK3, 1)
  assert.equal(orcTrackOf(marchRulesDay(won, later, collect().emit)), 1)
  assert.equal(eventsOn(won.log, later).length, 0)
})

test('D-28: each Orc attack the player beats costs him 2% of his army; his strikes weaken 5% a step his track stands the player’s way', () => {
  const s = realm()
  const orc = marchHex(s, 'orc', 2)
  const before = s.rivals.orc.companies.reduce((t, c) => t + c.power, 0)
  const raid = { kind: 'defense' as const, threat: 'raid' as const, hexId: orc.id, rival: 'orc' as RivalId, outcome: 'rout' as const }
  const after = marchRulesDay(logged(s, START, [raid, raid]), START, collect().emit)
  near(after.rivals.orc.companies.reduce((t, c) => t + c.power, 0), before * (1 - P.orc.attritionPerWin) ** 2)
  near(orcStrikeMult(withPersonalities(s, { orcTrack: 2 })), 1 - 2 * P.orc.track.strikePerStep)
  near(orcStrikeMult(withPersonalities(s, { orcTrack: -3 })), 1 + 3 * P.orc.track.strikePerStep)
})

test('D-28: the Orc’s raids weigh the player’s hexes in his march three times, from week 3; nobody else’s do', () => {
  const s = realm()
  const orc = marchHex(s, 'orc', 2)
  assert.equal(raidWeight(s, 'orc', orc, START), 1)
  assert.equal(raidWeight(s, 'orc', orc, WEEK3), P.orc.ownMarchWeight)
  assert.equal(raidWeight(s, 'orc', marchHex(s, 'goblin', 2), WEEK3), 1)
  assert.equal(raidWeight(s, 'goblin', marchHex(s, 'goblin', 2), WEEK3), 1)
})

test('C-44, N-02: fallen forces by personality: the Orc’s always strike at the first dawn, the Dwarf’s dig in at 75% and never strike, the Goblin’s never strike, the Archmage’s dissolve; the lair wedges keep D-24', () => {
  assert.equal(strikeChance('orc', 'neutral', true), P.orc.firstDawnChance)
  assert.equal(strikeChance('orc', 'orc', false), RULES.sieges.counterattack.chancePerDay)
  assert.equal(strikeChance('dwarf', 'dwarf', true), 0)
  assert.equal(strikeChance('goblin', 'goblin', true), 0)
  assert.equal(strikeChance('goblin', 'neutral', true), 0)
  assert.equal(strikeChance(undefined, 'neutral', true), RULES.sieges.counterattack.chancePerDay)
  assert.equal(fallbackShareOn('dwarf'), P.dwarf.fallbackShare)
  assert.equal(fallbackShareOn('orc'), RULES.sieges.fallback.share)
  assert.equal(fallbackShareOn(undefined), RULES.sieges.fallback.share)
  assert.deepEqual((['orc', 'goblin', 'dwarf', 'archmage', undefined] as const).map(dissolves), [false, false, false, true, false])
})

test('C-44: an Archmage garrison beaten without a rout leaves no fallback', () => {
  const s0 = allBuildings(realm(), 5)
  const target = marchHex(s0, 'archmage', 1, (h) => h.owner === 'neutral')
  const inner = neighbors(target.id).find((n) => hex(s0, n).ring === 2 && hex(s0, n).kind !== 'building') as string
  const state = withHex(withOwner(s0, [inner], 'player'), target.id, { garrison: 50, garrisonDamage: 0 })
  const day = fight(quiet(setOrders(state, { date: START, assaultTarget: target.id, assault: ['barracks'], defense: [] }).state), START, 1)
  assert.equal(day.of('assault')[0].outcome, 'taken')
  assert.deepEqual(day.of('fallback'), [])
})

test('N-03: siege wear in the Dwarf’s march decays half as fast; a stronghold’s as before', () => {
  assert.equal(wearDecayOn('dwarf', false), P.dwarf.wearDecay)
  assert.equal(wearDecayOn('orc', false), RULES.sieges.wearDecay.perDay)
  assert.equal(wearDecayOn(undefined, true), RULES.sieges.wearDecay.stronghold)
  const s = realm()
  const dwarf = marchHex(s, 'dwarf', 3)
  const worn = withHex(s, dwarf.id, { garrisonDamage: 20 })
  const day = fight(quiet(worn), START, 1)
  near(hex(day.state, dwarf.id).garrisonDamage, 20 * (1 - P.dwarf.wearDecay))
})

test('N-05: a beast rout in the Dwarf’s march scorches the hex and never returns it to the wilds', () => {
  const s = realm()
  assert.equal(wildsMayReclaim('dwarf'), false)
  assert.equal(wildsMayReclaim('orc'), true)
  const dwarf = marchHex(s, 'dwarf', 1)
  const owned = withHex(s, dwarf.id, { owner: 'player', garrison: 0 })
  const lost = fight(withTiding(owned, { date: START, kind: 'beasts', hexId: dwarf.id, strength: 1_000 }), START, 0)
  const report = lost.of('defense')[0]
  assert.deepEqual([report.outcome, report.overrun, hex(lost.state, dwarf.id).owner, hex(lost.state, dwarf.id).status], ['defeat', undefined, 'player', 'scorched'])
})

test('D-30 (P4-06): from week 3 the Dwarf walls the wilds of his march that face the player; a quiet week raises one free wall, to his cap', () => {
  const s0 = realm()
  const inner = marchHex(s0, 'dwarf', 1)
  const s = withOwner(s0, [inner.id], 'player')
  const byId = hexIndex(s.hexes)
  assert.deepEqual(wildWalls(s, 'dwarf', START), [])
  assert.deepEqual(wildWalls(s, 'orc', WEEK3), [])
  const walls = wildWalls(s, 'dwarf', WEEK3)
  assert.ok(walls.length > 0)
  for (const h of walls) assert.ok(h.owner === 'neutral' && isClaimableKind(h) && touches(byId, h.id, 'player') && (h.march === 'dwarf' || h.seam === 'dwarf'))
  const raised = freeWalls(s, WEEK3)
  const changed = raised.hexes.filter((h, i) => h.fortification !== s.hexes[i].fortification)
  assert.equal(changed.length, P.dwarf.freeWallsPerQuietWeek)
  assert.equal(changed[0].fortification, 1)
  // At the cap, nothing more.
  const capped = { ...s, hexes: s.hexes.map((h) => (walls.some((w) => w.id === h.id) ? { ...h, fortification: RULES.land.dwarfFortificationMax as HexState['fortification'] } : h)) }
  assert.deepEqual(freeWalls(capped, WEEK3).hexes, capped.hexes)
})
