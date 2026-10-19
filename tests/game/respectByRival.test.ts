/**
 * Patch 6 (docs/redesign/patch-6-spec.md sections 4 and 5; D-48, D-49): each rival's Respect marks at
 * his own numbers, the Orc and the Dwarf selling no hex and the Orc sending no envoy (P6-04), the Orc's
 * new perk (P6-07), and the standing read from Respect at every day's close.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { envoyAvailable, envoyRivals, ordersValidity } from '../../src/renderer/src/lib/game/combat'
import { offerDeal } from '../../src/renderer/src/lib/game/land'
import { strikeChance } from '../../src/renderer/src/lib/game/personalities'
import { marksFor, ownMark, raidRespectMult, reaches, standingFor } from '../../src/renderer/src/lib/game/respect'
import { dailyStandings } from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { RIVAL_IDS, type CampaignState, type GameEvent, type RivalId } from '../../src/renderer/src/lib/game/types'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { dayCloseInstant } from '../../src/renderer/src/lib/game/clock'
import { START, TZ, steadyLedger } from './fixtures/ledgers'
import { realm } from './support/realm'

const R = RULES.respect
const at = (state: CampaignState, rival: RivalId, respect: number, standing?: 'peace' | 'tension' | 'war'): CampaignState => ({
  ...state,
  rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect, ...(standing ? { disposition: { ...state.rivals[rival].disposition, player: standing } } : {}) } }
})

test('D-48, spec 4.1: each rival’s marks are the approved table', () => {
  assert.deepEqual(
    { ...marksFor('orc') },
    { war: -15, raidsStrongerAt: -40, ownDown: -60, raidsWeaker: 25, buysHex: 25, pact: 50, peace: null, envoy: null, sellsHex: null, callToArms: 45, ownUp: 75 }
  )
  assert.deepEqual(
    { ...marksFor('goblin') },
    { war: -25, raidsStrongerAt: -50, ownDown: -60, raidsWeaker: 25, buysHex: -100, pact: 30, peace: 40, envoy: 35, sellsHex: null, callToArms: 60, ownUp: 60 }
  )
  assert.deepEqual(
    { ...marksFor('dwarf') },
    { war: -40, raidsStrongerAt: -60, ownDown: -75, raidsWeaker: 35, buysHex: 25, pact: 30, peace: 60, envoy: 50, sellsHex: null, callToArms: 60, ownUp: 75 }
  )
  assert.deepEqual(
    { ...marksFor('archmage') },
    { war: -25, raidsStrongerAt: -50, ownDown: -75, raidsWeaker: 15, buysHex: 25, pact: 40, peace: 40, envoy: 65, sellsHex: 50, callToArms: 75, ownUp: 60 }
  )
})

test('N-16: every number is within 15 points of the shared line it replaced', () => {
  const shared = { war: -25, raidsStrongerAt: -50, ownDown: -75, raidsWeaker: 25, pact: 40, peace: 50, envoy: 50, callToArms: 60, ownUp: 75 } as const
  for (const r of RIVAL_IDS) {
    const m = marksFor(r)
    for (const [key, was] of Object.entries(shared)) {
      const now = m[key as keyof typeof shared]
      if (now !== null) assert.ok(Math.abs(now - was) <= 15, `${r}.${key}: ${now} against ${was}`)
    }
  }
})

test('C-82: the Accord’s marks and the other shared gates are unchanged', () => {
  assert.equal(R.thresholds.accordTalks, 55)
  assert.equal(R.thresholds.accordEasier, 75)
  assert.equal(RULES.contracts.accord.signedAtRespect, 100)
  assert.equal(RULES.terms.orc.respectBar, 50, 'Ugrak’s Challenge from 50')
  assert.equal(RULES.world.coalitions.betrayal.minRespect, 50)
  assert.equal(RULES.world.coalitions.buyout.minRespect, 40)
  assert.equal(RULES.world.coalitions.lastAllianceRefusalRespect, 60)
  assert.equal(R.raidsWeakerMult, 0.9)
  assert.equal(R.raidsStrongerMult, 1.1)
})

test('D-48: Peace and War at each rival’s own lines; a coalition is War; the Orc never at Peace', () => {
  for (const r of RIVAL_IDS) {
    const m = marksFor(r)
    assert.equal(standingFor(r, m.war, false), 'war')
    assert.equal(standingFor(r, m.war + 1, false), 'tension')
    if (m.peace === null) assert.equal(standingFor(r, R.max, false), 'tension')
    else {
      assert.equal(standingFor(r, m.peace, false), 'peace')
      assert.equal(standingFor(r, m.peace - 1, false), 'tension')
    }
    assert.equal(standingFor(r, R.max, true), 'war')
  }
  // The Dwarf slow to anger and slow to warm; the Orc quick to anger.
  assert.equal(standingFor('dwarf', -30, false), 'tension')
  assert.equal(standingFor('orc', -20, false), 'war')
  assert.equal(standingFor('dwarf', 55, false), 'tension')
  assert.equal(standingFor('goblin', 45, false), 'peace')
})

test('D-48: raids 10% weaker and stronger at each rival’s own marks', () => {
  assert.equal(raidRespectMult('archmage', 15), R.raidsWeakerMult, 'the Archmage warms early')
  assert.equal(raidRespectMult('dwarf', 30), 1, 'the Dwarf warms slowly')
  assert.equal(raidRespectMult('orc', -40), R.raidsStrongerMult)
  assert.equal(raidRespectMult('dwarf', -50), 1)
  assert.equal(raidRespectMult('dwarf', -60), R.raidsStrongerMult)
})

test('D-48: pacts and calls to arms at each rival’s own marks', () => {
  const base = realm()
  for (const r of RIVAL_IDS) {
    const m = marksFor(r)
    assert.equal(offerDeal(at(base, r, m.pact - 1), r, { kind: 'pact' }).reason?.code, 'respect', `${r} pact below ${m.pact}`)
    assert.notEqual(offerDeal(at(base, r, m.pact), r, { kind: 'pact' }).reason?.code, 'respect', `${r} pact at ${m.pact}`)
  }
  // The Archmage seldom joins a war: calls to arms only from 75.
  assert.equal(offerDeal(at(base, 'archmage', 74), 'archmage', { kind: 'callToArms', target: 'orc' }).reason?.code, 'respect')
})

test('P6-04, C-84: the Orc sends no envoy, at any Respect; an Orc envoy in the day’s orders is refused and costs nothing', () => {
  const base = realm()
  assert.equal(envoyAvailable(at(base, 'orc', R.max), 'orc'), false)
  assert.deepEqual(envoyRivals(), ['goblin', 'dwarf', 'archmage'])
  for (const r of envoyRivals()) {
    const need = marksFor(r).envoy as number
    assert.equal(envoyAvailable(at(base, r, need - 1), r), false)
    assert.equal(envoyAvailable(at(base, r, need), r), true)
  }
  const state = at(base, 'orc', R.max)
  const validity = ordersValidity(state, { date: START, assault: [], defense: [], envoys: ['orc'] })
  assert.deepEqual(validity.problems, [{ code: 'envoyUnavailable', rival: 'orc' }])
  assert.ok(!ordersView(state, 1, START).envoys.some((e) => e.rival === 'orc'), 'the orders panel never offers his envoy')
})

test('P6-07: from his own mark, the Orc’s routed forces in his march strike back at their first dawn only at the common chance', () => {
  const common = RULES.sieges.counterattack.chancePerDay
  assert.equal(strikeChance('orc', 'orc', true), RULES.personalities.orc.firstDawnChance)
  assert.equal(strikeChance('orc', 'orc', true, true), common)
  assert.equal(strikeChance('orc', 'orc', false, true), common, 'later dawns as before')
  assert.equal(strikeChance('dwarf', 'dwarf', true, true), 0, 'only his own march')
  const base = realm()
  assert.equal(ownMark(at(base, 'orc', marksFor('orc').ownUp), 'orc', 'up'), true)
  assert.equal(ownMark(at(base, 'orc', marksFor('orc').ownUp - 1), 'orc', 'up'), false)
})

test('reaches: at or above a mark from 0 up, at or below one under 0, never a mark that is null', () => {
  assert.equal(reaches(50, 50), true)
  assert.equal(reaches(49, 50), false)
  assert.equal(reaches(-60, -60), true)
  assert.equal(reaches(-59, -60), false)
  assert.equal(reaches(100, null), false)
})

test('D-49: the standing follows Respect at each day’s close, posting each change once', () => {
  const events: GameEvent[] = []
  const emit = (kind: GameEvent['kind'], payload: object): void => void events.push({ id: 'x', day: START, kind, ...payload } as GameEvent)
  const base = at(at(at(realm(), 'goblin', 40, 'tension'), 'orc', -15, 'tension'), 'dwarf', 59, 'peace')
  const next = dailyStandings(base, START, emit)
  assert.equal(next.rivals.goblin.disposition.player, 'peace')
  assert.equal(next.rivals.orc.disposition.player, 'war')
  assert.equal(next.rivals.dwarf.disposition.player, 'tension', 'nothing kept from the old lines (P6-05)')
  assert.deepEqual(
    events.filter((e) => e.kind === 'disposition').map((e) => (e.kind === 'disposition' ? [e.rival, e.from, e.to] : [])),
    [
      ['orc', 'tension', 'war'],
      ['goblin', 'tension', 'peace'],
      ['dwarf', 'peace', 'tension']
    ]
  )
  assert.equal(dailyStandings(next, START, emit), next, 'read again, nothing changes')
  const resolved = { ...base, rivals: { ...base.rivals, goblin: { ...base.rivals.goblin, status: 'allied' as const } } }
  assert.equal(dailyStandings(resolved, START, () => undefined).rivals.goblin.disposition.player, 'tension', 'a resolved rival is left as he is')
})

test('D-49: settlement reads the standing at a mid-week day’s close, and Peace stops his raids from the next dawn (A-132)', () => {
  // Founded Thursday 2026-10-08; Friday 10-09 is mid-week.
  const ledger = steadyLedger('2026-09-10', 40)
  const base = at(realm(7, ledger), 'goblin', 45, 'tension')
  const friday = addDays(START, 1)
  const result = settle(base, ledger, new Date(dayCloseInstant(friday, TZ).getTime() + 60_000))
  assert.equal(result.state.rivals.goblin.disposition.player, 'peace')
  const change = result.events.find((e) => e.kind === 'disposition' && e.rival === 'goblin')
  assert.equal(change?.day, START, 'read at the first day’s close')
})

test('C-88: the Herald tells a standing changed and a front’s turn, under Across the realm', () => {
  const standing = resultLine({ id: 'e1', day: START, kind: 'disposition', rival: 'dwarf', from: 'tension', to: 'peace' })
  assert.deepEqual([standing?.section, standing?.textId], ['world', 'herald.standing.peace'])
  assert.match(standing?.text ?? '', /Hrodgar/)
  const front = resultLine({ id: 'e2', day: START, kind: 'front', front: 'north', state: 'war', track: -RULES.rivals.fronts.track.max, turned: true })
  assert.deepEqual([front?.section, front?.textId, front?.rival], ['world', 'herald.front.emboldened', 'goblin'], 'north is the Orc’s and the Goblin’s; −3 is the Goblin’s way')
  assert.equal(resultLine({ id: 'e3', day: START, kind: 'front', front: 'north', state: 'war', track: 1 }), null)
  assert.equal(resultLine({ id: 'e4', day: START, kind: 'front', front: 'north', state: 'war', track: 3 }), null, 'the weekly draw’s news at the end of a track is not a turn')
})
