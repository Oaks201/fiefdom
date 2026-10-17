/**
 * Patch 4 stage 4 (docs/redesign/patch-4-spec.md section 3.5; D-31): the Archmage's surges. One a dawn
 * from week 3, fixed once drawn (settle once); swells and ebbs on a garrison for the day; blessings
 * and curses on a company; strikes on the player's hexes in his march; summoned mythics that return to
 * beasts; foresight; a dissolved garrison steering the next dawn's surge; bending at rank V.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, dawn, dayBattles } from '../../src/renderer/src/lib/game/combat'
import { depthOf, neighbors, touches, hexIndex } from '../../src/renderer/src/lib/game/map'
import { surgeOn, withPersonalities } from '../../src/renderer/src/lib/game/personalities'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { bendSurge, drawSurge, foreseesSurges, surgesAtDawn } from '../../src/renderer/src/lib/game/surges'
import type { CampaignState, HexState, Surge } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { realm, withBuildings } from './support/realm'
import { START, fight, hex, withHex, withOwner } from './support/war'

const A = RULES.personalities.archmage
const WEEK3 = '2026-10-19'

/** The player holds a hex of the Archmage's march at depth 1, so his surges land beside the player's land. */
function front(): { state: CampaignState; held: HexState } {
  const s = realm()
  const held = s.hexes.find((h) => h.march === 'archmage' && !h.seam && depthOf(h) === 1 && !h.village) as HexState
  const present = { ...withOwner(s, [held.id], 'player'), settlement: { ...s.settlement, lastLaunch: WEEK3 } }
  return { state: present, held: hex(present, held.id) }
}

test('D-31: no surge before week 3; from week 3 one a dawn, the same for the same seed and day, fixed once drawn', () => {
  const { state } = front()
  assert.equal(drawSurge(state, START), null)
  const days = Array.from({ length: 28 }, (_, i) => addDays(WEEK3, i))
  const drawn = days.map((d) => drawSurge(state, d))
  assert.ok(drawn.every((s) => s !== null))
  assert.deepEqual(drawn, days.map((d) => drawSurge(state, d)))
  const kinds = new Set(drawn.map((s) => s?.surge))
  assert.ok(kinds.has('swell') && kinds.has('ebb'), 'swells and ebbs are most of them')
  // A dawn fixes it; a dawn redone changes nothing.
  const once = surgesAtDawn(state, WEEK3)
  assert.deepEqual(surgeOn(once, WEEK3), drawSurge(state, WEEK3))
  assert.deepEqual(surgesAtDawn(once, WEEK3), once)
})

test('D-31: surges land in his march on a hex the player doesn’t hold beside the player’s land', () => {
  const { state } = front()
  const byId = hexIndex(state.hexes)
  for (let i = 0; i < 40; i++) {
    const s = drawSurge(state, addDays(WEEK3, i)) as Surge
    if (s.surge !== 'swell' && s.surge !== 'ebb' && s.surge !== 'summoning') continue
    const h = byId.get(s.hexId as string) as HexState
    assert.ok(h.owner !== 'player' && touches(byId, h.id, 'player') && (h.march === 'archmage' || h.seam === 'archmage'))
    assert.equal(s.target, true)
  }
})

test('P4-04: a swell doubles a garrison as the player’s assault weighs it, an ebb halves it, for its day only', () => {
  const { state } = front()
  const t = state.hexes.find((h) => h.march === 'archmage' && !h.seam && depthOf(h) === 2 && h.owner === 'neutral' && !h.village) as HexState
  const plain = assaultGarrison(state, t, WEEK3)
  const swollen = withPersonalities(state, { surges: [{ date: WEEK3, surge: 'swell', hexId: t.id, mult: A.swell }] })
  near(assaultGarrison(swollen, t, WEEK3), plain * A.swell)
  near(assaultGarrison(swollen, t, addDays(WEEK3, 1)), assaultGarrison(state, t, addDays(WEEK3, 1)))
  const ebbed = withPersonalities(state, { surges: [{ date: WEEK3, surge: 'ebb', hexId: t.id, mult: A.ebb }] })
  near(assaultGarrison(ebbed, t, WEEK3), plain * A.ebb)
})

test('P4-04: a blessing or curse moves one company’s power 20% for its day', () => {
  const { state } = front()
  const id = roster(state, { day: WEEK3 })[0].id
  const p = roster(state, { day: WEEK3 })[0].power
  const blessed = withPersonalities(state, { surges: [{ date: WEEK3, surge: 'blessing', companyId: id, mult: 1 + A.companyShare }] })
  near(roster(blessed, { day: WEEK3 }).find((c) => c.id === id)?.power ?? 0, p * (1 + A.companyShare))
  const cursed = withPersonalities(state, { surges: [{ date: WEEK3, surge: 'curse', companyId: id, mult: 1 - A.companyShare }] })
  near(roster(cursed, { day: WEEK3 }).find((c) => c.id === id)?.power ?? 0, p * (1 - A.companyShare))
  near(roster(cursed, { day: addDays(WEEK3, 1) }).find((c) => c.id === id)?.power ?? 0, p)
})

test('P4-04: a strike is a defense battle on the player’s hex in his march; lost, the hex is scorched, never taken', () => {
  const { state, held } = front()
  const struck = withPersonalities(state, { surges: [{ date: WEEK3, surge: 'strike', hexId: held.id, strength: 10_000 }] })
  const battles = dayBattles(struck, WEEK3)
  assert.ok(battles.some((b) => b.kind === 'surge' && b.hexId === held.id && b.rival === 'archmage'))
  const day = fight(struck, WEEK3, 0)
  const report = day.of('defense').find((d) => d.threat === 'surge')
  assert.ok(report && report.outcome === 'defeat')
  assert.deepEqual([hex(day.state, held.id).owner, hex(day.state, held.id).status], ['player', 'scorched'])
  assert.ok(day.of('surge').some((s) => s.surge === 'strike'))
})

test('P4-04: a summoning makes a hex mythic for its days, then beasts again', () => {
  const { state } = front()
  const t = state.hexes.find((h) => h.march === 'archmage' && !h.seam && depthOf(h) === 2 && h.owner === 'neutral' && !h.village && !h.mythic) as HexState
  let s = state
  for (let i = 0; i < 60; i++) {
    const d = addDays(WEEK3, i)
    const drawn = drawSurge(s, d)
    if (drawn?.surge !== 'summoning') continue
    s = surgesAtDawn(s, d)
    const summoned = hex(s, drawn.hexId as string)
    assert.equal(summoned.mythic, true)
    near(summoned.garrison, RULES.combat.strength.mythic * summoned.strength)
    const after = surgesAtDawn(s, addDays(d, A.summonDays))
    assert.equal(hex(after, summoned.id).mythic, undefined)
    return
  }
  assert.ok(t, 'a summoning came within 60 days')
})

test('P4-04: Mage Tower IV, or the Archmage’s path at rank I, foretells tomorrow’s surge', () => {
  const { state } = front()
  assert.equal(foreseesSurges(state), false)
  const tower = withBuildings(state, { mageTower: 4 })
  assert.equal(foreseesSurges(tower), true)
  assert.ok(surgeOn(surgesAtDawn(tower, WEEK3), addDays(WEEK3, 1)))
  const ranked = { ...state, paths: { byRival: { ...(state.paths?.byRival ?? {}), orc: { renown: 0, rank: 0 }, goblin: { renown: 0, rank: 0 }, dwarf: { renown: 0, rank: 0 }, archmage: { renown: 0, rank: 1 } }, logRead: 0 } }
  assert.equal(foreseesSurges(ranked as CampaignState), true)
})

test('C-44: a garrison of his march dissolved yesterday steers today’s surge beside the hex it lost', () => {
  const { state, held } = front()
  const melted = withPersonalities(state, { dissolved: [{ hexId: held.id, day: addDays(WEEK3, -1) }] })
  for (let i = 0; i < 5; i++) {
    const s = drawSurge(melted, WEEK3)
    if (!s?.hexId || s.surge === 'strike') continue
    assert.ok(neighbors(held.id).includes(s.hexId))
    assert.equal(s.steered, true)
  }
})

test('C-36: at the Archmage’s path rank V the player bends tomorrow’s foretold swell into an ebb, once a week', () => {
  const { state } = front()
  const t = state.hexes.find((h) => h.march === 'archmage' && !h.seam && depthOf(h) === 2 && h.owner === 'neutral') as HexState
  const paths = { byRival: { orc: { renown: 0, rank: 0 }, goblin: { renown: 0, rank: 0 }, dwarf: { renown: 0, rank: 0 }, archmage: { renown: 0, rank: 5 } }, logRead: state.log.length }
  const tomorrow = addDays(WEEK3, 1)
  const s = withPersonalities({ ...state, paths }, { surges: [{ date: tomorrow, surge: 'swell', hexId: t.id, mult: A.swell }] })
  assert.equal(bendSurge(state, WEEK3).reason, 'rank')
  const bent = bendSurge(s, WEEK3)
  assert.ok(bent.ok)
  assert.deepEqual([surgeOn(bent.state, tomorrow)?.surge, surgeOn(bent.state, tomorrow)?.mult], ['ebb', A.ebb])
  const again = withPersonalities(bent.state, { surges: [{ date: addDays(tomorrow, 2), surge: 'swell', hexId: t.id, mult: A.swell }] })
  assert.equal(bendSurge(again, addDays(WEEK3, 2)).reason, 'used')
  assert.equal(dawn(s, WEEK3).campaign.seed, s.campaign.seed)
  assert.ok(withHex)
})
