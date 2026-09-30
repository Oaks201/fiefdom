import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addHabit, closeContract, createLedger, sealContract, setMetric, toggleDuty } from '../src/renderer/src/lib/ledger'
import { computeReputation, evaluateDay } from '../src/renderer/src/lib/reputation'
import { addDays } from '../src/renderer/src/lib/dates'
import type { Ledger } from '../src/renderer/src/lib/types'

const NOW = '2026-09-28T12:00:00.000Z'

function base(): Ledger {
  let l = addHabit(createLedger(), { id: 'a', name: 'Read', createdOn: '2026-09-28' })
  l = addHabit(l, { id: 'b', name: 'Stretch', createdOn: '2026-09-28' })
  return sealContract(
    l,
    { kind: 'common', startDate: '2026-09-28', stepsGoal: 10000, caloriesGoal: 2000, startWeight: 180, unit: 'lb' },
    { id: 'c1', today: '2026-09-28', now: NOW, balance: 0 }
  )
}

function perfectDay(l: Ledger, date: string): Ledger {
  l = setMetric(l, date, 'steps', 10000)
  l = setMetric(l, date, 'eaten', 1900)
  l = toggleDuty(l, date, 'a')
  return toggleDuty(l, date, 'b')
}

test('a perfect day earns every line', () => {
  const l = perfectDay(base(), '2026-09-28')
  const day = evaluateDay(l, '2026-09-28', 0)
  assert.equal(day.perfect, true)
  assert.deepEqual(
    day.lines.map((x) => [x.key, x.amount]),
    [
      ['steps', 10],
      ['calories', 10],
      ['duties', 8],
      ['perfect', 5]
    ]
  )
  assert.equal(day.lines[1].label, 'Within the calorie limit')
  assert.equal(day.total, 33)
})

test('partial days earn partial reputation and are not perfect', () => {
  let l = setMetric(base(), '2026-09-28', 'steps', 12000)
  l = toggleDuty(l, '2026-09-28', 'a')
  const day = evaluateDay(l, '2026-09-28', 3)
  assert.equal(day.perfect, false)
  assert.equal(day.streak, 0)
  assert.equal(day.total, 10 + 4)
})

test('the calorie limit is kept only when calories are recorded and within range', () => {
  const l = base()
  const at = (eaten: number | undefined): ReturnType<typeof evaluateDay> => evaluateDay(setMetric(l, '2026-09-28', 'eaten', eaten), '2026-09-28', 0)
  assert.equal(at(undefined).caloriesMet, false) // nothing recorded: no stamp
  assert.equal(at(0).caloriesMet, true)
  assert.equal(at(2000).caloriesMet, true) // exactly the limit
  assert.equal(at(2001).caloriesMet, false)
  assert.equal(at(2001).caloriesOver, true)
  // calories burned no longer count under a limit
  assert.equal(evaluateDay(setMetric(l, '2026-09-28', 'calories', 3000), '2026-09-28', 0).caloriesMet, false)

  const ranged = sealContract(
    createLedger(),
    { kind: 'common', startDate: '2026-09-28', stepsGoal: 10000, caloriesGoal: 2000, caloriesMin: 1500, startWeight: 180, unit: 'lb' },
    { id: 'c2', today: '2026-09-28', now: NOW, balance: 0 }
  )
  assert.equal(evaluateDay(setMetric(ranged, '2026-09-28', 'eaten', 1200), '2026-09-28', 0).caloriesMet, false)
  assert.equal(evaluateDay(setMetric(ranged, '2026-09-28', 'eaten', 1500), '2026-09-28', 0).caloriesMet, true)
})

test('streaks add +1 per consecutive perfect day, and an unfinished today does not break them', () => {
  let l = base()
  for (let i = 0; i < 4; i++) l = perfectDay(l, addDays('2026-09-28', i))
  const rep = computeReputation(l, '2026-10-02') // day 5 not yet done
  assert.equal(rep.currentStreak, 4)
  assert.equal(rep.days.get('2026-10-01')!.lines.find((x) => x.key === 'streak')!.amount, 3)
  assert.equal(rep.total, 33 * 4 + (0 + 1 + 2 + 3))
  const later = computeReputation(l, '2026-10-03') // day 5 was missed
  assert.equal(later.currentStreak, 0)
  assert.equal(later.bestStreak, 4)
})

test('days without a contract can still be perfect through duties alone', () => {
  let l = addHabit(createLedger(), { id: 'a', name: 'Read', createdOn: '2026-09-01' })
  l = toggleDuty(l, '2026-09-01', 'a')
  const day = evaluateDay(l, '2026-09-01', 0)
  assert.equal(day.perfect, true)
  assert.equal(day.stepsMet, null)
  assert.equal(day.total, 4 + 5)
  // nothing to do → not applicable, not perfect
  assert.equal(evaluateDay(createLedger(), '2026-09-01', 0).applicable, false)
})

test('closing a contract adds the honoured bonus, and a flawless week — duties included — adds more', () => {
  let l = base()
  for (let i = 0; i < 7; i++) {
    const d = addDays('2026-09-28', i)
    l = setMetric(l, d, 'steps', 10000)
    l = setMetric(l, d, 'eaten', 1800)
    l = toggleDuty(l, d, 'a')
    if (i !== 3) l = toggleDuty(l, d, 'b')
  }
  // one sworn duty was missed once: honored, not flawless
  let before = computeReputation(l, '2026-10-04')
  let closed = closeContract(l, 'c1', { finalWeight: 178 }, { today: '2026-10-04', now: NOW })
  let after = computeReputation(closed, '2026-10-04')
  assert.equal(after.fromContracts, 25)
  assert.equal(after.total - before.total, 25)

  l = toggleDuty(l, '2026-10-01', 'b')
  before = computeReputation(l, '2026-10-04')
  closed = closeContract(l, 'c1', { finalWeight: 178 }, { today: '2026-10-04', now: NOW })
  after = computeReputation(closed, '2026-10-04')
  assert.equal(after.fromContracts, 75)
  assert.equal(after.total - before.total, 75)
})
