/**
 * Patch 6 (T-10, C-87; docs/redesign/patch-6-spec.md section 12.4): the standing's buffer at 5, as the
 * simulator's `standingBuffer` variant plays it. This file loads the game through that variant's rules
 * hook (`sim/overrides.ts`), so `RULES.respect.standingBuffer` is 5 here; the test runner gives each file a
 * process of its own, so no other file sees it. The buffer at 0, as built, is in respectByRival.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUFFER_PROBE, STANDING_BUFFER, checkOverride, installOverride } from '../../sim/overrides'
import type { RivalWeek, WeekHabits } from '../../src/renderer/src/lib/game/rivals'
import type { CampaignState, Disposition, GameEvent, RivalId } from '../../src/renderer/src/lib/game/types'

installOverride(STANDING_BUFFER)
// Loaded only now, so through the hook.
const { RULES } = require('../../src/renderer/src/lib/game/rules') as typeof import('../../src/renderer/src/lib/game/rules')
const { dailyStandings, rivalTurn } = require('../../src/renderer/src/lib/game/rivals') as typeof import('../../src/renderer/src/lib/game/rivals')
const { realm } = require('./support/realm') as typeof import('./support/realm')

/** Founded Thursday 2026-10-08 with Monday weeks: week 2 runs Monday 10-12 to Sunday 10-18. */
const WEDNESDAY = '2026-10-14'
const SUNDAY = '2026-10-18'
const NOTHING: WeekHabits = { days: [], pillars: { steps: 0, table: 0, duties: 0 } }
const B = BUFFER_PROBE

function at(state: CampaignState, rival: RivalId, respect: number, standing: Disposition): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect, disposition: { ...state.rivals[rival].disposition, player: standing } } } }
}

function changes(events: GameEvent[]): [RivalId, Disposition, Disposition][] {
  return events.flatMap((e) => (e.kind === 'disposition' ? [[e.rival, e.from, e.to] as [RivalId, Disposition, Disposition]] : []))
}

/** The day's close: Peace, Tension or War for `rival` at `respect`, from `standing`. */
function daily(rival: RivalId, respect: number, standing: Disposition): Disposition {
  return dailyStandings(at(realm(), rival, respect, standing), WEDNESDAY, () => undefined).rivals[rival].disposition.player
}

test('T-10: the standingBuffer variant reaches RULES in this process', () => {
  assert.deepEqual(checkOverride(STANDING_BUFFER, RULES), [B])
  assert.equal(RULES.respect.standingBuffer, B)
})

test('T-10 at 5: a day’s close holds Peace until Respect is below his Peace line less 5, and War until it is above his War line plus 5', () => {
  for (const rival of ['goblin', 'dwarf', 'archmage'] as const) {
    const m = RULES.respect.marks[rival]
    const peace = m.peace as number
    assert.equal(daily(rival, peace - 1, 'peace'), 'peace', `${rival} held at Peace just under his line`)
    assert.equal(daily(rival, peace - B, 'peace'), 'peace', `${rival} held at Peace ${B} under his line`)
    assert.equal(daily(rival, peace - B - 1, 'peace'), 'tension', `${rival} back to Tension past the buffer`)
    assert.equal(daily(rival, peace - 1, 'tension'), 'tension', `${rival} comes to Peace only at his line`)
    assert.equal(daily(rival, peace, 'tension'), 'peace')
  }
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const war = RULES.respect.marks[rival].war
    assert.equal(daily(rival, war + 1, 'war'), 'war', `${rival} held at War just over his line`)
    assert.equal(daily(rival, war + B, 'war'), 'war', `${rival} held at War ${B} over his line`)
    assert.equal(daily(rival, war + B + 1, 'war'), 'tension', `${rival} back to Tension past the buffer`)
    assert.equal(daily(rival, war + 1, 'tension'), 'tension', `${rival} goes to War only at his line`)
    assert.equal(daily(rival, war, 'tension'), 'war')
  }
})

test('T-10 at 5: the Goblin’s churn on his lines (Peace 40, War −25) holds, and each change posts once', () => {
  const events: GameEvent[] = []
  const emit = (kind: GameEvent['kind'], payload: object): void => void events.push({ id: `t-${events.length + 1}`, day: WEDNESDAY, kind, ...payload } as GameEvent)
  let state = at(realm(), 'goblin', 40, 'tension')
  const path: [number, Disposition][] = [
    [40, 'peace'],
    [38, 'peace'],
    [35, 'peace'],
    [34, 'tension'],
    [39, 'tension'],
    [40, 'peace'],
    [-25, 'war'],
    [-21, 'war'],
    [-20, 'war'],
    [-19, 'tension'],
    [-24, 'tension']
  ]
  for (const [respect, want] of path) {
    state = dailyStandings(at(state, 'goblin', respect, state.rivals.goblin.disposition.player), WEDNESDAY, emit)
    assert.equal(state.rivals.goblin.disposition.player, want, `at ${respect}`)
  }
  assert.deepEqual(changes(events), [
    ['goblin', 'tension', 'peace'],
    ['goblin', 'peace', 'tension'],
    ['goblin', 'tension', 'peace'],
    ['goblin', 'peace', 'war'],
    ['goblin', 'war', 'tension']
  ])
})

test('T-10 at 5: a coalition is War whatever his Respect, and the Orc is never at Peace', () => {
  const coalition = (s: CampaignState): CampaignState => ({ ...s, coalitions: [{ members: ['goblin', 'dwarf'], trigger: 'risingCrown', warChest: 0 }] })
  for (const standing of ['peace', 'tension', 'war'] as const) {
    assert.equal(dailyStandings(coalition(at(realm(), 'goblin', RULES.respect.max, standing)), WEDNESDAY, () => undefined).rivals.goblin.disposition.player, 'war')
  }
  assert.equal(daily('orc', RULES.respect.max, 'peace'), 'tension', 'never the Orc, held or not')
  assert.equal(daily('orc', RULES.respect.max, 'tension'), 'tension')
})

test('T-10 at 5: the week close reads the standing through the same buffer', () => {
  const week = (events: GameEvent[]): RivalWeek => ({ day: SUNDAY, week: 2, weekStartsOn: 1, days: 7, valor: 1, habits: NOTHING, emit: (kind, payload) => void events.push({ id: `t-${events.length + 1}`, day: SUNDAY, kind, ...payload } as GameEvent) })
  const peace = RULES.respect.marks.goblin.peace as number
  const war = RULES.respect.marks.dwarf.war
  const turn = (state: CampaignState): { state: CampaignState; events: GameEvent[] } => {
    const events: GameEvent[] = []
    return { state: rivalTurn(state, week(events)).state, events }
  }
  const held = turn(at(at(realm(), 'goblin', peace - B, 'peace'), 'dwarf', war + B, 'war'))
  assert.equal(held.state.rivals.goblin.respect, peace - B, 'no weekly driver moved him')
  assert.equal(held.state.rivals.goblin.disposition.player, 'peace')
  assert.equal(held.state.rivals.dwarf.disposition.player, 'war')
  assert.deepEqual(changes(held.events).filter(([r]) => r === 'goblin' || r === 'dwarf'), [])
  const past = turn(at(at(realm(), 'goblin', peace - B - 1, 'peace'), 'dwarf', war + B + 1, 'war'))
  assert.equal(past.state.rivals.goblin.disposition.player, 'tension')
  assert.equal(past.state.rivals.dwarf.disposition.player, 'tension')
})
