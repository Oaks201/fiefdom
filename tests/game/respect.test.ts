/**
 * Patch 5 (docs/redesign/patch-5-spec.md section 4; D-39, D-40): Respect both ways: each rival's own
 * weights, the marks on both sides, and each rival's own mark at +75 and −75.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foreseesSurges } from '../../src/renderer/src/lib/game/surges'
import { extraConquests, greedMult, wildWallCap } from '../../src/renderer/src/lib/game/personalities'
import { envoyFee, marksOf, ownMark, raidRespectMult, respectChange, standingFor } from '../../src/renderer/src/lib/game/respect'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { RIVAL_IDS, type CampaignState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { realm } from './support/realm'

const R = RULES.respect
const at = (state: CampaignState, rival: RivalId, respect: number): CampaignState => ({ ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } })

test('D-39: each rival weighs the common changes his own way: the Orc −2 for his land taken and nothing for a Truce', () => {
  assert.equal(respectChange('orc', 'hexConquered', R.change.hexConquered), R.byRival.orc.hexConquered)
  assert.equal(respectChange('orc', 'truce', R.change.tradeOrTruce), 0)
  for (const r of ['goblin', 'dwarf', 'archmage'] as RivalId[]) {
    assert.equal(respectChange(r, 'hexConquered', R.change.hexConquered), R.change.hexConquered)
    assert.equal(respectChange(r, 'truce', R.change.tradeOrTruce), R.change.tradeOrTruce)
  }
})

test('D-39: raids strike 10% weaker from Respect 25 and 10% stronger at −50 or below', () => {
  assert.equal(raidRespectMult(R.thresholds.raidsWeaker), R.raidsWeakerMult)
  assert.equal(raidRespectMult(0), 1)
  assert.equal(raidRespectMult(R.raidsStrongerAt + 1), 1)
  assert.equal(raidRespectMult(R.raidsStrongerAt), R.raidsStrongerMult)
})

test('D-40: the standing on the whole track, every rival', () => {
  for (const r of RIVAL_IDS) {
    assert.equal(standingFor(r, R.min, false), 'war')
    assert.equal(standingFor(r, 0, false), 'tension')
    assert.equal(standingFor(r, R.max, false), r === 'orc' ? 'tension' : 'peace')
    assert.equal(standingFor(r, R.max, true), 'war')
  }
})

test('D-39: each rival’s own mark above, at +75, and below, at −75', () => {
  const base = realm()
  for (const r of RIVAL_IDS) {
    assert.equal(ownMark(at(base, r, R.own.up), r, 'up'), true)
    assert.equal(ownMark(at(base, r, R.own.up - 1), r, 'up'), false)
    assert.equal(ownMark(at(base, r, R.own.down), r, 'down'), true)
    assert.equal(ownMark(at(base, r, R.own.down + 1), r, 'down'), false)
    const marks = marksOf(r).flatMap((m) => m.opens)
    assert.ok(marks.includes(`own.${r}.up`) && marks.includes(`own.${r}.down`) && marks.includes('war') && marks.includes('raidsStronger'))
  }
  // The Orc: his envoy free above; one more conquest attempt a week below.
  const envoy = { id: 'envoy:orc', source: 'envoy' as const }
  assert.equal(envoyFee(at(base, 'orc', R.own.up), envoy), 0)
  assert.equal(envoyFee(at(base, 'orc', 50), envoy), R.envoyCostPerBattle)
  assert.equal(envoyFee(at(base, 'goblin', R.own.up), { id: 'envoy:goblin', source: 'envoy' }), R.envoyCostPerBattle)
  assert.equal(extraConquests(at(base, 'orc', 0), 'orc'), 0)
  assert.equal(extraConquests(at(base, 'orc', R.own.down), 'orc'), R.own.orcConquests)
  // The Goblin gouges below.
  assert.ok(greedMult(at(base, 'goblin', R.own.down)) > greedMult(at(base, 'goblin', 0)))
  // The Dwarf walls the wilds not at all above, higher below.
  assert.equal(wildWallCap(at(base, 'dwarf', R.own.up)), 0)
  assert.equal(wildWallCap(at(base, 'dwarf', 0)), RULES.personalities.dwarf.wildWallMax)
  assert.equal(wildWallCap(at(base, 'dwarf', R.own.down)), R.own.dwarfWildWallMax)
  // The Archmage's surge foretold above.
  assert.equal(foreseesSurges(at(base, 'archmage', 0)), false)
  assert.equal(foreseesSurges(at(base, 'archmage', R.own.up)), true)
})

test('D-39: a resolved rival’s marks no longer act', () => {
  const s = at(realm(), 'orc', R.own.down)
  const gone = { ...s, rivals: { ...s.rivals, orc: { ...s.rivals.orc, status: 'conquered' as const } } }
  assert.equal(ownMark(gone, 'orc', 'down'), false)
})
