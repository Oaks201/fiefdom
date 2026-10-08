/**
 * T14: the Chronicle's view models (Ch 2, Ch 4, Ch 9, Ch 10, Ch 16): the step pace bar, the
 * calorie week, Valor's parts, the weigh-in prompt, a day's earnings, the Milestone panel and the
 * Healer's cards.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { valor } from '../../src/renderer/src/lib/game/score'
import type { CampaignState, DayRecord } from '../../src/renderer/src/lib/game/types'
import { calorieWeek, dayEarned, dayProjection, healerCards, milestonePanel, stepPace, valorParts, weighInPrompt } from '../../src/renderer/src/lib/game/view/chronicle'
import { START } from './fixtures/ledgers'
import { realm, withMilestones } from './support/realm'

/** 2026-11-02 is a Monday; Thursday is 2026-11-05. */
const MONDAY = '2026-11-02'
const THURSDAY = '2026-11-05'

test('Ch 2: the pace bar for 30,000 steps by Thursday against a 50,000 pool (Monday weeks) reads 30,000 of 28,571 expected, ahead', () => {
  const days = [7_500, 7_500, 7_500, 7_500].map((steps, i) => ({ date: addDays(MONDAY, i), steps }))
  const pace = stepPace([{ date: addDays(MONDAY, -1), steps: 20_000 }, ...days], 50_000, THURSDAY, 1)
  assert.deepEqual(pace, { walked: 30_000, expected: 28_571, pool: 50_000, daysElapsed: 4, status: 'ahead' })
  assert.equal(stepPace(days.slice(0, 3), 50_000, THURSDAY, 1).status, 'behind')
  // A partial week 1 counts from the campaign's first day.
  assert.equal(stepPace([{ date: START, steps: 8_000 }], 50_000, START, 1, START).expected, 7_143)
})

test('Ch 4 / Ch 16: the calorie week is the logged average against the limit, with days under the floor marked gently', () => {
  const days = [
    { date: MONDAY, eaten: 1_900 },
    { date: addDays(MONDAY, 1), eaten: 1_000 },
    { date: addDays(MONDAY, 2) },
    { date: THURSDAY, eaten: 2_200 }
  ]
  const week = calorieWeek(days, 2_000, 1_500, THURSDAY, 1)
  assert.deepEqual(week, { limit: 2_000, floor: 1_500, average: 1_700, logged: 3, days: 4, underFloor: [addDays(MONDAY, 1)], overLimit: false })
  assert.equal(calorieWeek([], 2_000, 1_500, THURSDAY, 1).average, null)
})

test('Ch 10: Valor’s three parts match valor()', () => {
  const week: DayRecord[] = [
    { date: MONDAY, steps: 9_000, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3 },
    { date: addDays(MONDAY, 1), steps: 4_000, dutiesKept: 2, dutiesSworn: 3 },
    { date: addDays(MONDAY, 2), steps: 6_000, eaten: 2_100, dutiesKept: 1, dutiesSworn: 3 }
  ]
  for (const day of week) {
    const soFar = week.filter((d) => d.date <= day.date)
    const parts = valorParts(day, soFar, 50_000)
    assert.ok(Math.abs((parts.duties + parts.food + parts.steps) / 3 - parts.valor) < 1e-12)
    assert.equal(parts.valor, valor(day, soFar, 50_000))
  }
  assert.deepEqual(valorParts(week[1], week.slice(0, 2), 50_000).food, 0)
})

test('Ch 2: the weigh-in prompt comes on the week’s last day, once the week has none', () => {
  const sunday = addDays(MONDAY, 6)
  assert.equal(weighInPrompt([], sunday, 1).due, true)
  assert.equal(weighInPrompt([], THURSDAY, 1).due, false, 'more often stays optional')
  assert.equal(weighInPrompt([{ date: THURSDAY, weight: 210 }], sunday, 1).due, false)
  assert.deepEqual(weighInPrompt([{ date: '2026-10-29', weight: 211 }], sunday, 1).last, { date: '2026-10-29', weight: 211 })
})

test('Ch 9: the Milestone panel for 217 → 168 at 205 lb in week 5 shows Milestone 1 broken, Milestone 2 at 207 with earliest week 7, lock 1 met and lock 2 not yet', () => {
  const state = withMilestones(realm(), 1)
  const weighIns = [
    { date: '2026-10-27', weight: 205 },
    { date: '2026-11-03', weight: 205 }
  ]
  const panel = milestonePanel(state, weighIns, '2026-11-04')
  assert.equal(panel.week, 5)
  assert.equal(panel.rows[0].index, 1)
  assert.ok(panel.rows[0].brokenOn)
  assert.deepEqual(panel.next, { index: 2, mark: 207, earliestWeek: 7, keeping: false, lock1: true, lock2: false })
  assert.equal(panel.broken, 1)
  assert.deepEqual(panel.rows.map((r) => r.mark), [212, 207, 202, 197, 193, 188, 183, 178, 173, 168])
  assert.equal(panel.grace.text, 'The Crown’s Grace: none.'.replace('’', "'"))
  // Never what a future Milestone unlocks.
  assert.ok(!JSON.stringify(panel).toLowerCase().includes('unlock'))
})

test('Ch 5: a day’s earnings come from the purse; an open day’s projection from its duties, food and streak', () => {
  const state: CampaignState = realm()
  const day = '2026-10-09'
  const paid = { ...state, purse: { events: [...state.purse.events, { id: 'pe-x', date: day, kind: 'earn' as const, amount: 17, source: 'duties' }, { id: 'pe-y', date: day, kind: 'spend' as const, amount: -40, source: 'tier' }] } }
  assert.equal(dayEarned(paid, day), 17)
  assert.ok(dayProjection(state, { date: START, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3 }) > dayProjection(state, { date: START, dutiesKept: 1, dutiesSworn: 3 }))
})

test('Ch 16: the Healer speaks to a rough patch, the floor and steps past the pool, and to nothing when all is well', () => {
  const state = realm()
  assert.deepEqual(healerCards(state, START), [])
  const rough = {
    ...state,
    settledThrough: { day: addDays(START, 2), week: 1 },
    settlement: {
      ...state.settlement,
      snapshots: [...state.settlement.snapshots, ...[0, 1, 2].map((i) => ({ date: addDays(START, i), steps: 500, eaten: 900, dutiesKept: 0, dutiesSworn: 3, streak: 0 }))]
    }
  }
  const cards = healerCards(rough, addDays(START, 3), { stepsThisWeek: 60_000 })
  assert.deepEqual(cards.map((c) => c.checkIn), ['crashDieting', 'overtraining', 'illnessAndTravel'])
  // Unapproved Healer lines show their placeholder.
  assert.match(cards[2].text, /^Healer check-in: the last 3 days scored low/)
})
