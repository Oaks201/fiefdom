import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  budgetScore,
  consistency,
  poolShare,
  realmConsistency,
  stepsPillar,
  tablePillar,
  termsOf,
  valor,
  weekPillars,
  weekScores
} from '../../src/renderer/src/lib/game/score'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { MONDAY, TERMS, days, workedExampleWeek } from './support/worked-example'

test('Ch 4 worked example pillars: S = 0.92, T = 6/7, D = 19/21 (E-01)', () => {
  const p = weekPillars(workedExampleWeek(), TERMS)
  assert.ok(Math.abs(p.steps - 0.92) < 1e-12)
  assert.ok(Math.abs(p.table - 6 / 7) < 1e-12)
  assert.ok(Math.abs(p.duties - 19 / 21) < 1e-12)
})

test('Ch 4 worked example gives Q = 0.893968 (E-01)', () => {
  const q = consistency(workedExampleWeek(), TERMS, 1)
  assert.ok(Math.abs(q - 0.893968) < 1e-6, `Q = ${q}`)
})

test('the step pillar caps at 100%: 55,000 walked against a 50,000 pool scores 1 (Ch 16 overtraining)', () => {
  assert.equal(stepsPillar(days(7, MONDAY, () => ({ steps: 55_000 / 7 })), 50_000), 1)
})

test('a partial 4-day week 1 prorates the pool to 28,571 (A-04)', () => {
  assert.equal(Math.round(poolShare(50_000, 4)), 28_571)
  const week1 = days(4, '2026-10-08', () => ({ steps: 28_572 / 4 }))
  assert.equal(stepsPillar(week1, 50_000), 1)
  assert.ok(Math.abs(stepsPillar(week1.map((d) => ({ ...d, steps: 3_571.4 })), 50_000) - 0.5) < 1e-3)
})

test('the budget score is 1 at the limit and falls linearly to 0 at 15% over (Ch 4)', () => {
  assert.equal(budgetScore(1_800, 2_000), 1)
  assert.equal(budgetScore(2_000, 2_000), 1)
  assert.ok(Math.abs(budgetScore(2_150, 2_000) - 0.5) < 1e-12)
  assert.equal(budgetScore(2_300, 2_000), 0)
  assert.equal(budgetScore(3_000, 2_000), 0)
})

test('A day logged at 0.85 × the floor scores as fully over budget (A-41)', () => {
  const underFloor = days(1, MONDAY, () => ({ eaten: 0.85 * TERMS.floor }))
  assert.equal(tablePillar(underFloor, TERMS), 0)
  // At 90% of the floor it is no longer under-eating, and it sits within the limit.
  assert.equal(tablePillar(days(1, MONDAY, () => ({ eaten: 0.9 * TERMS.floor })), TERMS), 1)
  // In a week it enters the average as 1.15 × the limit, (6 × 1,990 + 2,300) ÷ 7, which is over the limit.
  const week = days(7, MONDAY, (i) => ({ eaten: i === 0 ? 0.85 * TERMS.floor : 1_990 }))
  const average = (6 * 1_990 + 2_300) / 7
  assert.ok(Math.abs(tablePillar(week, TERMS) - budgetScore(average, 2_000)) < 1e-12)
  assert.ok(tablePillar(week, TERMS) < 1)
})

test('without a Healer floor, under-eating is judged against the 1,200 minimum floor', () => {
  const t = termsOf({ stepPool: 50_000, calorieLimit: 2_000, duties: ['a'] })
  assert.equal(tablePillar(days(1, MONDAY, () => ({ eaten: 1_000 })), t), 0)
  assert.equal(tablePillar(days(1, MONDAY, () => ({ eaten: 1_100 })), t), 1)
})

test('missing data counts as missed: no steps are zero and no food is no logging credit (Ch 4 rule 5)', () => {
  const blank = days(7, MONDAY, () => ({ dutiesKept: 0 }))
  assert.deepEqual(weekPillars(blank, TERMS), { steps: 0, table: 0, duties: 0 })
})

test('Q weights each week by its days in the span (Ch 4)', () => {
  // Friday to Thursday: 3 days in one week, 4 in the next.
  const span = days(7, '2026-10-09', (i) => ({ steps: 50_000 / 7, eaten: 1_900, dutiesKept: i < 3 ? 0 : 3 }))
  const weeks = weekScores(span, TERMS, 1)
  assert.deepEqual(
    weeks.map((w) => [w.weekStart, w.days]),
    [
      ['2026-10-05', 3],
      ['2026-10-12', 4]
    ]
  )
  assert.ok(Math.abs(weeks[0].score - 2 / 3) < 1e-12)
  assert.equal(weeks[1].score, 1)
  assert.ok(Math.abs(consistency(span, TERMS, 1) - (3 * (2 / 3) + 4 * 1) / 7) < 1e-12)
})

test('Respite days are removed from every pillar (Ch 4 rule 4)', () => {
  const week = days(7, MONDAY, (i) => (i === 3 ? { dutiesKept: 0 } : { steps: 50_000 / 7, eaten: 1_900 }))
  assert.ok(consistency(week, TERMS, 1) < 1)
  const respite = [addDays(MONDAY, 3)]
  assert.ok(Math.abs(consistency(week, TERMS, 1, respite) - 1) < 1e-12)
  assert.equal(weekScores(week, TERMS, 1, respite)[0].days, 6)
})

test('Realm Consistency is Q over the last 28 settled days (A-39)', () => {
  const perfect = { steps: 50_000 / 7, eaten: 1_900 }
  const history = days(35, MONDAY, (i) => (i < 7 ? { dutiesKept: 0 } : perfect))
  assert.ok(Math.abs(realmConsistency(history, TERMS, 1) - 1) < 1e-12)
  assert.ok(consistency(history, TERMS, 1) < 1)
  // Order does not matter.
  assert.equal(realmConsistency([...history].reverse(), TERMS, 1), realmConsistency(history, TERMS, 1))
})

test('Valor = (d + f + s) ÷ 3 with s the week-to-date step pace (Ch 10, A-40)', () => {
  // Wednesday, the third day of the week: the pace for 3 days is 50,000 × 3 ÷ 7.
  const week = days(3, MONDAY, () => ({ steps: 50_000 / 7, eaten: 1_900 }))
  assert.ok(Math.abs(valor(week[2], week, 50_000) - 1) < 1e-12)
  const poor = { ...week[2], dutiesKept: 1, eaten: undefined, steps: 0 }
  const soFar = [week[0], week[1], poor]
  // d = 1/3, f = 0, s = 2/3.
  assert.ok(Math.abs(valor(poor, soFar, 50_000) - (1 / 3 + 0 + 2 / 3) / 3) < 1e-12)
  // The day is added when it is missing from the week so far.
  assert.equal(valor(poor, [week[0], week[1]], 50_000), valor(poor, soFar, 50_000))
})
