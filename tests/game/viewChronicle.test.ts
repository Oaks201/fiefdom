/**
 * T14: the Chronicle's view models (Ch 2, Ch 4, Ch 9, Ch 10, Ch 16): the step pace bar, the
 * calorie week, Valor's parts, the weigh-in prompt, a day's earnings, the Milestone panel, the
 * weigh-in log (D-13) and the Healer's cards.
 */
import { test } from 'node:test'
import { TEXT_SOURCES, t } from '../../src/renderer/src/lib/game/text'
import assert from 'node:assert/strict'
import { addDays, weighInDay } from '../../src/renderer/src/lib/game/clock'
import { valor } from '../../src/renderer/src/lib/game/score'
import type { CampaignState, DayRecord } from '../../src/renderer/src/lib/game/types'
import { calorieWeek, dayEarned, dayProjection, healerCards, milestonePanel, stepPace, valorParts, weighInLog, weighInPrompt } from '../../src/renderer/src/lib/game/view/chronicle'
import { START } from './fixtures/ledgers'
import { realm, withMilestones } from './support/realm'

/** 2026-11-02 is a Monday; Thursday is 2026-11-05. */
const MONDAY = '2026-11-02'
const THURSDAY = '2026-11-05'

test('Ch 2: the pace bar for 30,000 steps by Thursday against a 50,000 pool (Monday weeks) reads 30,000 of 28,571 expected, ahead', () => {
  const days = [7_500, 7_500, 7_500, 7_500].map((steps, i) => ({ date: addDays(MONDAY, i), steps }))
  const pace = stepPace([{ date: addDays(MONDAY, -1), steps: 20_000 }, ...days], 50_000, THURSDAY, 1)
  assert.deepEqual(pace, { walked: 30_000, expected: 28_571, pool: 50_000, rested: 0, daysElapsed: 4, status: 'ahead' })
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

test('Ch 2, D-13: the weigh-in day is Monday, whatever day the week starts on, and the prompt comes that day until its weight is logged', () => {
  const sunday = addDays(MONDAY, 6)
  assert.equal(weighInDay(THURSDAY, 1), MONDAY)
  assert.equal(weighInDay(MONDAY, 1), MONDAY)
  assert.equal(weighInDay(sunday, 1), MONDAY, 'a Monday week’s Sunday looks back to its Monday')
  assert.equal(weighInDay(THURSDAY, 0), MONDAY, 'weeks from Sunday weigh in on their second day')
  assert.equal(weighInDay(addDays(MONDAY, -1), 0), MONDAY)
  assert.equal(weighInPrompt([], MONDAY, 1).due, true)
  assert.equal(weighInPrompt([], sunday, 1).due, false, 'only the weigh-in day asks')
  assert.equal(weighInPrompt([], THURSDAY, 1).day, MONDAY)
  assert.equal(weighInPrompt([{ date: addDays(MONDAY, -1), weight: 210 }], MONDAY, 1).due, true, 'last week’s reading is not this week’s weigh-in')
  assert.equal(weighInPrompt([{ date: MONDAY, weight: 210 }], MONDAY, 1).due, false)
  assert.deepEqual(weighInPrompt([{ date: '2026-10-29', weight: 211 }], MONDAY, 1).last, { date: '2026-10-29', weight: 211 })
})

test('D-13: the weigh-in log lists each week’s weigh-in newest first with its change, and notes each mark reached and each Milestone broken', () => {
  // The campaign starts Thursday 2026-10-08 with Monday weeks: week 2 is Oct 12 to 18, week 4 Oct 26 to Nov 1.
  const base = realm()
  const broken = base.weight.milestones.map((m) => (m.index === 1 ? { ...m, brokenOn: '2026-11-01', brokenWeek: 4, byDispensation: false } : m))
  const state = { ...base, weight: { ...base.weight, milestones: broken } }
  const log = weighInLog(state, [
    { date: '2026-09-30', weight: 217 },
    { date: '2026-10-12', weight: 211.5 },
    { date: '2026-10-19', weight: 211 },
    { date: '2026-10-26', weight: 208 },
    { date: '2026-11-02', weight: 207.5 },
    { date: '2026-11-04', weight: 206.5 },
    { date: '2026-11-09', weight: 206 }
  ])
  assert.deepEqual(
    log.map((r) => [r.day, r.date, r.week, r.weight, r.change]),
    [
      ['2026-11-09', '2026-11-09', 6, 206, -1.5],
      ['2026-11-02', '2026-11-02', 5, 207.5, -0.5],
      ['2026-10-26', '2026-10-26', 4, 208, -3],
      ['2026-10-19', '2026-10-19', 3, 211, -0.5],
      ['2026-10-12', '2026-10-12', 2, 211.5, -5.5],
      ['2026-09-28', '2026-09-30', 0, 217, null]
    ],
    'one row a week under its Monday, with the day weighed when that was another day; a week before the campaign is week 0'
  )
  assert.deepEqual(log[4].notes, [{ kind: 'reached', index: 1, mark: 212, keeping: false, earliestWeek: 4 }], 'Milestone 1’s mark is reached in week 2 and waits for week 4')
  assert.deepEqual(log[2].notes, [{ kind: 'broken', index: 1, mark: 212, keeping: false, earliestWeek: 4, byDispensation: false }])
  assert.deepEqual(log[1].notes, [], 'a dip below 207 later in the week does not count: the week reads its Monday weigh-in')
  assert.deepEqual(log[0].notes, [{ kind: 'reached', index: 2, mark: 207, keeping: false, earliestWeek: 7 }])
  assert.ok(!JSON.stringify(log).toLowerCase().includes('unlock'))
})

test('D-13: a Milestone broken in a week with no weigh-in gets a row of its own', () => {
  const base = realm()
  const dispensed = base.weight.milestones.map((m) => (m.index === 1 ? { ...m, brokenOn: '2026-11-15', brokenWeek: 6, byDispensation: true } : m))
  const log = weighInLog({ ...base, weight: { ...base.weight, milestones: dispensed } }, [
    { date: '2026-10-12', weight: 214 },
    { date: '2026-11-16', weight: 211 }
  ])
  assert.deepEqual(
    log.map((r) => [r.day, r.date, r.weight, r.change]),
    [
      ['2026-11-16', '2026-11-16', 211, -3],
      ['2026-11-09', null, null, null],
      ['2026-10-12', '2026-10-12', 214, null]
    ]
  )
  assert.deepEqual(log[1].notes.map((n) => [n.kind, n.index, n.byDispensation]), [['broken', 1, true]])
  assert.deepEqual(log[0].notes, [], 'a mark reached after its Milestone broke by Dispensation is no news')
  assert.deepEqual(weighInLog(base, []), [])
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
  assert.deepEqual(panel.next, { index: 2, mark: 207, earliestWeek: 7, keeping: false, lock1: true, lock2: false, breaksAtClose: false })
  assert.equal(panel.broken, 1)
  assert.deepEqual(panel.rows.map((r) => r.mark), [212, 207, 202, 197, 193, 188, 183, 178, 173, 168])
  assert.equal(panel.grace.textId, 'herald.grace.0')
  assert.equal(panel.grace.text, t('herald.grace.0'))
  // Never what a future Milestone unlocks.
  assert.ok(!JSON.stringify(panel).toLowerCase().includes('unlock'))
})

test('D-11, D-13: the Milestone panel reads one weigh-in a week, and one at or below the mark meets lock 1', () => {
  const state = withMilestones(realm(), 1)
  const sunday = addDays(MONDAY, 6)
  // Milestone 2's mark is 207. A Thursday dip below it doesn't count: the week reads its Monday weigh-in.
  assert.equal(milestonePanel(state, [{ date: MONDAY, weight: 208 }, { date: THURSDAY, weight: 206 }], sunday).next?.lock1, false)
  assert.equal(milestonePanel(state, [{ date: sunday, weight: 207 }], sunday).next?.lock1, true)
})

test('D-53: on the weigh-in day that reaches the next mark in its week, the panel says it breaks at today’s close', () => {
  const state = withMilestones(realm(), 1)
  // Milestone 2 at 207, not before week 7: Monday 2026-11-16.
  const weighIns = [
    { date: '2026-11-02', weight: 208 },
    { date: '2026-11-09', weight: 207.6 },
    { date: '2026-11-16', weight: 206.9 }
  ]
  assert.equal(milestonePanel(state, weighIns, '2026-11-16').next?.breaksAtClose, true)
  assert.equal(milestonePanel(state, weighIns.slice(0, 2), '2026-11-16').next?.breaksAtClose, false, 'no weigh-in at the mark yet')
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
  // Unapproved Healer lines show their placeholder (A3 may since have approved a written one).
  const entry = TEXT_SOURCES['healer.json']['healer.illnessAndTravel']
  if (entry.final === null || entry.approved !== true) assert.match(cards[2].text, /^Healer check-in: the last 3 days scored low/)
})
