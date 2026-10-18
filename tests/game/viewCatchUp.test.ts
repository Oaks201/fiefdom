/**
 * Patch 6 (D-46; spec section 2): the catch-up figures under the Chronicle's week bars. What the
 * rest of the week needs, spread over the days left, as the score reads the week: never a calorie
 * figure under the Healer's floor, none while on pace (C-74 to C-77).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { calorieCatchUp, catchUp, stepCatchUp } from '../../src/renderer/src/lib/game/view/chronicle'
import { calorieCatchUpLine, stepCatchUpLine } from '../../src/renderer/src/components/campaign/catchUpLines'
import { ledgerWith } from './fixtures/ledgers'
import { realm } from './support/realm'

/** A Monday-week: Monday 2026-11-02 to Sunday 2026-11-08. */
const MONDAY = '2026-11-02'
const FRIDAY = addDays(MONDAY, 4)
const SATURDAY = addDays(MONDAY, 5)
const SUNDAY = addDays(MONDAY, 6)

const eaten = (values: readonly number[], from = MONDAY): { date: string; eaten: number }[] => values.map((e, i) => ({ date: addDays(from, i), eaten: e }))
const walked = (values: readonly number[], from = MONDAY): { date: string; steps: number }[] => values.map((s, i) => ({ date: addDays(from, i), steps: s }))

test('D-46: four days at 2,475 against 2,250 ask about 1,950 a day for the 3 days left, with today’s food so far beside it', () => {
  const days = [...eaten([2_475, 2_475, 2_475, 2_475]), { date: FRIDAY, eaten: 600 }]
  assert.deepEqual(calorieCatchUp(days, 2_250, 1_700, FRIDAY, 1), { kind: 'figure', perDay: 1_950, days: 3, limit: 2_250, afterToday: false, today: 600 })
  assert.deepEqual(calorieCatchUp(days.slice(0, 4), 2_250, 1_700, FRIDAY, 1), { kind: 'figure', perDay: 1_950, days: 3, limit: 2_250, afterToday: false })
})

test('C-74: when the limit would need less than the Healer’s floor, no figure; the line gives the average the floor reaches', () => {
  const days = eaten([2_700, 2_700, 2_700, 2_700, 2_700])
  assert.deepEqual(calorieCatchUp(days, 2_250, 1_700, SATURDAY, 1), { kind: 'floor', floor: 1_700, days: 2, average: 2_414, afterToday: false })
})

test('C-74: on pace there is no figure; with nothing logged there is no line', () => {
  assert.deepEqual(calorieCatchUp(eaten([2_000, 2_000, 2_000, 2_000]), 2_250, 1_700, FRIDAY, 1), { kind: 'onPace' })
  assert.deepEqual(calorieCatchUp([], 2_250, 1_700, FRIDAY, 1), { kind: 'none' })
  // Today logged at the limit and nothing else: keeping the limit keeps the average.
  assert.deepEqual(calorieCatchUp([{ date: MONDAY, eaten: 2_250 }], 2_250, 1_700, MONDAY, 1), { kind: 'onPace' })
})

test('A-41: a day logged under 90% of the floor counts as 1.15 × the limit, as the Table counts it', () => {
  // As eaten, 2,250 × 3 + 1,000 would leave the week on pace; as the Table counts the 1,000, it is not.
  const days = eaten([2_250, 2_250, 2_250, 1_000])
  assert.deepEqual(calorieCatchUp(days, 2_250, 1_700, FRIDAY, 1), { kind: 'figure', perDay: 2_130, days: 3, limit: 2_250, afterToday: false })
})

test('D-46: today past its share of a real day’s eating counts as logged, and the figure is for the days after it', () => {
  const days = [...eaten([2_475, 2_475, 2_475, 2_475]), { date: FRIDAY, eaten: 2_400 }]
  assert.deepEqual(calorieCatchUp(days, 2_250, 1_700, FRIDAY, 1), { kind: 'figure', perDay: 1_720, days: 2, limit: 2_250, afterToday: true })
  // A small log so far today (under the floor) is still today's food so far, not a finished day.
  const morning = [...eaten([2_700, 2_700, 2_700, 2_700, 2_700]), { date: SATURDAY, eaten: 900 }]
  assert.equal(calorieCatchUp(morning, 2_250, 1_700, SATURDAY, 1).kind, 'floor')
})

test('D-46: on the week’s last day, food past what the average needed ends the week at its average', () => {
  const six = eaten([2_475, 2_475, 2_475, 2_475, 2_475, 2_475])
  assert.deepEqual(calorieCatchUp([...six, { date: SUNDAY, eaten: 2_000 }], 2_250, 1_700, SUNDAY, 1), { kind: 'ends', average: 2_407 })
  assert.deepEqual(calorieCatchUp(six, 2_250, 1_700, SUNDAY, 1), { kind: 'floor', floor: 1_700, days: 1, average: 2_364, afterToday: false })
})

test('C-75: the calorie figure rounds down to 10 kcal and never under the floor, which is never under 1,200', () => {
  // The limit needs 1,748 on Sunday; rounded down that is 1,740, under a floor of 1,745.
  const six = eaten([2_334, 2_334, 2_334, 2_334, 2_333, 2_333])
  assert.deepEqual(calorieCatchUp(six, 2_250, 1_745, SUNDAY, 1), { kind: 'figure', perDay: 1_745, days: 1, limit: 2_250, afterToday: false })
  // With medical supervision or not, the floor the figure keeps is never under RULES.healer.minFloor.
  const hard = eaten([3_000, 3_000, 3_000, 3_000, 3_000, 3_000])
  assert.deepEqual(calorieCatchUp(hard, 2_250, 800, SUNDAY, 1), { kind: 'floor', floor: 1_200, days: 1, average: 2_743, afterToday: false })
})

test('C-77, A-04: Respite days leave the figures, and a partial week 1 counts from the campaign’s first day', () => {
  // Wednesday is a Respite day: its 4,000 kcal and its place in the week both leave.
  const days = eaten([2_475, 2_475, 4_000, 2_475])
  assert.deepEqual(calorieCatchUp(days, 2_250, 1_700, FRIDAY, 1, undefined, [addDays(MONDAY, 2)]), { kind: 'figure', perDay: 2_020, days: 3, limit: 2_250, afterToday: false })
  // The campaign starts on Thursday: Monday to Wednesday are not its days.
  const thursday = addDays(MONDAY, 3)
  assert.deepEqual(calorieCatchUp(eaten([3_000, 3_000, 3_000, 2_475]), 2_250, 1_700, FRIDAY, 1, thursday), { kind: 'figure', perDay: 2_170, days: 3, limit: 2_250, afterToday: false })
})

test('D-46: 46,000 walked of 70,000 asks about 8,000 a day for the 3 days left, 5,200 more today', () => {
  const days = [...walked([11_500, 11_500, 11_500, 11_500]), { date: FRIDAY, steps: 2_800 }]
  assert.deepEqual(stepCatchUp(days, 70_000, FRIDAY, 1), { kind: 'figure', perDay: 8_000, days: 3, target: 70_000, afterToday: false, more: 5_200 })
  assert.deepEqual(stepCatchUp(walked([20_000, 20_000, 20_000, 10_000]), 70_000, FRIDAY, 1), { kind: 'met' })
})

test('D-46: today’s share walked moves the figure to the days after today; the last day asks only what is left', () => {
  const days = [...walked([11_500, 11_500, 11_500, 11_500]), { date: FRIDAY, steps: 9_000 }]
  assert.deepEqual(stepCatchUp(days, 70_000, FRIDAY, 1), { kind: 'figure', perDay: 7_500, days: 2, target: 70_000, afterToday: true })
  const sunday = [...walked([10_000, 10_000, 10_000, 10_000, 11_000, 11_000]), { date: SUNDAY, steps: 1_000 }]
  assert.deepEqual(stepCatchUp(sunday, 70_000, SUNDAY, 1), { kind: 'figure', perDay: 8_000, days: 1, target: 70_000, afterToday: false, more: 7_000 })
})

test('C-75, C-77, A-04: the step figure rounds up to 100; Respite days and days before the campaign shrink the week’s share', () => {
  assert.deepEqual(stepCatchUp(walked([12_000, 12_000, 12_000, 12_000]), 70_000, FRIDAY, 1), { kind: 'figure', perDay: 7_400, days: 3, target: 70_000, afterToday: false, more: 7_400 })
  // Wednesday is a Respite day: the share is 6 days of 10,000, and its steps leave too.
  const respite = stepCatchUp(walked([10_000, 10_000, 30_000, 10_000]), 70_000, FRIDAY, 1, undefined, [addDays(MONDAY, 2)])
  assert.deepEqual(respite, { kind: 'figure', perDay: 10_000, days: 3, target: 60_000, afterToday: false, more: 10_000 })
  const thursday = addDays(MONDAY, 3)
  assert.deepEqual(stepCatchUp(walked([10_000], thursday), 70_000, FRIDAY, 1, thursday), { kind: 'figure', perDay: 10_000, days: 3, target: 40_000, afterToday: false, more: 10_000 })
})

test('D-46, spec 2.1: the lines read as the spec’s examples, and say nothing when there is nothing to say', () => {
  assert.equal(
    calorieCatchUpLine({ kind: 'figure', perDay: 1_950, days: 3, limit: 2_250, afterToday: false, today: 600 }),
    'About 1,950 a day for the 3 days left brings the week’s average back to 2,250 (600 so far today).'
  )
  assert.equal(calorieCatchUpLine({ kind: 'floor', floor: 1_700, days: 2, average: 2_414, afterToday: false }), 'Even at the Healer’s floor (1,700) for the 2 days left, the week averages 2,414.')
  assert.equal(calorieCatchUpLine({ kind: 'floor', floor: 1_700, days: 1, average: 2_214, afterToday: false }), 'Even at the Healer’s floor (1,700) today, the week averages 2,214.')
  assert.equal(calorieCatchUpLine({ kind: 'figure', perDay: 1_720, days: 2, limit: 2_250, afterToday: true }), 'About 1,720 a day for the 2 days after today brings the week’s average back to 2,250.')
  assert.equal(calorieCatchUpLine({ kind: 'figure', perDay: 1_745, days: 1, limit: 2_250, afterToday: false }), 'About 1,745 today brings the week’s average back to 2,250.')
  assert.equal(calorieCatchUpLine({ kind: 'onPace' }), 'On pace.')
  assert.equal(calorieCatchUpLine({ kind: 'ends', average: 2_407 }), 'The week’s average comes to 2,407.')
  assert.equal(calorieCatchUpLine({ kind: 'none' }), null)
  assert.equal(stepCatchUpLine({ kind: 'figure', perDay: 8_000, days: 3, target: 70_000, afterToday: false, more: 5_200 }), 'About 8,000 steps a day for the 3 days left fills the week’s pool (5,200 more today).')
  assert.equal(stepCatchUpLine({ kind: 'figure', perDay: 8_000, days: 1, target: 70_000, afterToday: false, more: 7_000 }), 'About 7,000 more steps today fills the week’s pool.')
  assert.equal(stepCatchUpLine({ kind: 'figure', perDay: 7_500, days: 2, target: 70_000, afterToday: true }), 'About 7,500 steps a day for the 2 days after today fills the week’s pool.')
  assert.equal(stepCatchUpLine({ kind: 'met' }), 'The week’s pool is met.')
  assert.equal(stepCatchUpLine({ kind: 'none' }), null)
  // Ch 16: plain facts, never a verdict.
  const all = [
    calorieCatchUpLine({ kind: 'figure', perDay: 1_950, days: 3, limit: 2_250, afterToday: false }),
    calorieCatchUpLine({ kind: 'floor', floor: 1_700, days: 2, average: 2_414, afterToday: false }),
    stepCatchUpLine({ kind: 'figure', perDay: 8_000, days: 3, target: 70_000, afterToday: false, more: 5_200 })
  ].join(' ')
  assert.doesNotMatch(all, /\b(behind|fail|failed|must|should)\b/i)
})

test('D-46: catchUp reads today’s week from the ledger against the Charter and the floor the score uses', () => {
  // Founded Thursday 2026-10-08 with Monday weeks; week 2 runs Monday 10-12 to Sunday 10-18.
  const monday = '2026-10-12'
  const friday = addDays(monday, 4)
  const ledger = ledgerWith(monday, 4, () => ({ steps: 6_000, eaten: 2_300, done: {} }))
  const base = realm(7, ledger)
  const state = { ...base, weight: { ...base.weight, healerFloor: 1_500 } }
  const view = catchUp(state, ledger, friday)
  assert.deepEqual(view.calories, { kind: 'figure', perDay: 1_600, days: 3, limit: 2_000, afterToday: false })
  assert.deepEqual(view.steps, { kind: 'figure', perDay: 8_700, days: 3, target: 50_000, afterToday: false, more: 8_700 })
})
