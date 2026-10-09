/**
 * T16: the Grand Battle screen's view models (Ch 11, D-03, E-03): the worked exchange on screen,
 * replay against the live battle, the company limit with its reason, Orders that never repeat, the
 * host's hidden numbers, the warning notice and the result card.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { hexName } from '../../src/renderer/src/lib/game/map'
import { applyScenario } from '../../src/renderer/src/lib/game/dev/scenarios'
import { begin, companyLimit, playRound, setFormation } from '../../src/renderer/src/lib/game/grand'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, GrandBattle, SlotKey } from '../../src/renderer/src/lib/game/types'
import { FORMATION_SLOTS, battleNotices, fieldView, intentText, placeCompany, preparationView, replayView, resultView } from '../../src/renderer/src/lib/game/view/battle'
import { momentsFor } from '../../src/renderer/src/lib/game/view/endgame'
import { near } from './support/assert'
import { playOut } from './support/grand'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { allBuildings, realm, withCastle, withCrossings } from './support/realm'
import { CODEX } from '../../src/renderer/src/lib/game/codex'

const ledger = ledgerWith('2026-09-10', 160)

function fresh(over: (s: CampaignState) => CampaignState = (s) => s): CampaignState {
  return settle(over(realm(7, ledger)), ledger, chicago('2026-10-08')).state
}

function lastBattle(state: CampaignState): GrandBattle {
  return state.grandBattles.at(-1) as GrandBattle
}

test('T16 / E-03: the worked-exchange scenario shows the Brute at 40.25 and the Knights at 69 after round 1 with Shieldwall', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'workedExchange', today) as CampaignState
  const id = lastBattle(ready).id
  const before = fieldView(ready, id)!
  assert.ok(before.offered.some((o) => o.id === 'shieldwall'))
  const center = before.lanes.find((l) => l.lane === 'center')!
  assert.equal(center.intent, 'charge')
  assert.match(center.text ?? '', /×1\.5 and takes ×1\.25/, 'D-03: the tooltip gives the Charge’s exact effect')
  const done = playRound(ready, id, { order: 'shieldwall' }, today)
  assert.ok(done.ok, String(done.reason))
  const after = fieldView(done.state, id)!
  near(after.units.find((u) => u.name === 'Brutes')!.hp, 40.25)
  near(after.units.find((u) => u.name === 'Knights')!.hp, 69)
  assert.equal(after.log[0].order, 'Shieldwall')
})

test('Ch 11 rule 4: replaying a saved battle shows the same health at every round as the live battle', () => {
  const state = fresh((s) => withCastle(allBuildings(s, 3), 3))
  const today = openDayOf(state)
  const hunted = applyScenario(state, 'mythicHunt', today) as CampaignState
  const id = lastBattle(hunted).id
  const begun = begin(hunted, id, { today, valors: [1, 1, 1] })
  assert.ok(begun.ok, String(begun.reason))
  const live = playOut(begun.state, id, today)
  assert.ok(live.hp.length >= 1)
  const replayed = replayView(live.state, id)!
  assert.equal(replayed.frames.length, live.hp.length + 1)
  live.hp.forEach((hp, i) => {
    for (const [unit, value] of Object.entries(hp)) near(replayed.frames[i + 1].hp[unit] ?? 0, value, 1e-9)
  })
  assert.ok(replayed.frames.every((f, i) => f.round === i))
})

test('Ch 11 / A-162: Orders offered never repeat within a battle, and a played card is gone for the rest of it', () => {
  const state = fresh((s) => withCastle(allBuildings(s, 4), 3))
  const today = openDayOf(state)
  const hunted = applyScenario(state, 'mythicHunt', today) as CampaignState
  const id = lastBattle(hunted).id
  const live = playOut(begin(hunted, id, { today, valors: [] }).state, id, today)
  const all = live.offered.flat()
  assert.equal(new Set(all).size, all.length, 'no Order offered twice')
  live.played.forEach((order, i) => assert.ok(!live.offered.slice(i + 1).flat().includes(order), `${order} played in round ${i + 1} is not offered again`))
})

test('Ch 11 "Preparation": at most banners + 2 companies, never more than 6; a formation past the limit is refused with its reason', () => {
  // Ten companies (a hybrid from each Crossing) for 2 banners: the limit is 4.
  const state = fresh((s) => withCrossings(allBuildings(s, 3), Object.fromEntries(CODEX.crossings.map((x) => [x.id, 1]))))
  const today = openDayOf(state)
  const announced = applyScenario(state, 'incursion', today) as CampaignState
  const id = lastBattle(announced).id
  const prep = preparationView(announced, id, today)!
  assert.equal(prep.limit, Math.min(realmEffects(announced).banners.value + 2, 6))
  assert.equal(prep.limit, companyLimit(realmEffects(announced)))
  assert.ok(prep.marshalPick, 'the Marshal’s formation until the player sets one')
  // Fill every slot: more than the limit is refused, with the words the screen shows.
  let formation: Record<string, string> = {}
  prep.companies.slice(0, FORMATION_SLOTS.length).forEach((c, i) => (formation = placeCompany(formation, FORMATION_SLOTS[i] as SlotKey, c.id)))
  assert.ok(Object.keys(formation).length > prep.limit)
  const refused = setFormation(announced, id, formation, today)
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'formation:tooMany')
  // Within the limit it is kept, and the view shows it.
  const kept = Object.fromEntries(Object.entries(formation).slice(0, prep.limit))
  const set = setFormation(announced, id, kept, today)
  assert.ok(set.ok)
  const shown = preparationView(set.state, id, today)!
  assert.equal(shown.marshalPick, false)
  assert.equal(shown.fielded, prep.limit)
  assert.equal(shown.problem, undefined)
  assert.match(shown.readiness.line, /^Readiness /)
})

test('Convention 6: the enemy’s power shows on the field only when the host roster is revealed; its health always does', () => {
  const plain = fresh()
  const today = openDayOf(plain)
  for (const [state, revealed] of [
    [plain, false],
    [fresh((s) => ({ ...s, buildings: { ...s.buildings, mageTower: 4 } })), true]
  ] as const) {
    const ready = applyScenario(state, 'workedExchange', today) as CampaignState
    const view = fieldView(ready, lastBattle(ready).id)!
    const brute = view.units.find((u) => u.side === 'enemy')!
    assert.equal(brute.power !== undefined, revealed)
    assert.equal(brute.hp, 80)
    assert.ok(view.units.filter((u) => u.side === 'player').every((u) => u.power !== undefined))
  }
})

test('Ch 11: the warning shows as "Incursion at <hex name> in 2 days", then "today" with Fight now', () => {
  const state = fresh()
  const today = openDayOf(state)
  const announced = applyScenario(state, 'incursion', today) as CampaignState
  const [notice] = battleNotices(announced, today)
  assert.equal(notice.daysLeft, 2)
  assert.equal(notice.label, `Incursion at ${hexName(notice.hexId)} in 2 days`)
  assert.equal(notice.today, false)
  const day = battleNotices(announced, addDays(today, 2))[0]
  assert.equal(day.today, true)
  assert.match(day.label, / today$/)
  assert.equal(intentText('brace'), 'Brace: it deals ×0.5 and takes ×0.5.')
})

test('Ch 11 rule 1: a battle left unfought is fought by the Marshal at its close, and its card offers the replay', () => {
  const state = fresh((s) => allBuildings(s, 2))
  const today = openDayOf(state)
  const announced = applyScenario(state, 'incursion', today) as CampaignState
  const battle = lastBattle(announced)
  const settled = settle(announced, ledger, chicago(addDays(battle.battleDate, 1)))
  const fought = settled.state.grandBattles.find((b) => b.id === battle.id)!
  assert.ok(fought.result !== undefined)
  const view = resultView(settled.state, battle.id)!
  assert.equal(view.marshal, true)
  const cards = momentsFor(settled.state, settled.events)
  const card = cards.find((c) => c.action?.battleId === battle.id)
  assert.ok(card, 'the result card')
  assert.equal(card.titleId, `herald.grandBattle.${fought.result}`)
  assert.ok(card.lines?.includes('Fought by the Marshal at the day’s close.'))
  assert.ok(replayView(settled.state, battle.id)!.frames.length >= 2)
})
