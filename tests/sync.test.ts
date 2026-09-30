import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adoptSyncedValue, burnContract, createLedger, mergeSynced, metricSource, sealContract, setMetric } from '../src/renderer/src/lib/ledger'

const D = '2026-09-28'

test('Fitbit fills in numbers and keeps them up to date', () => {
  let l = mergeSynced(createLedger(), [
    { date: D, metric: 'steps', value: 4200 },
    { date: D, metric: 'eaten', value: 950.4 },
    { date: D, metric: 'calories', value: 1880.5 }
  ])
  assert.deepEqual(l.days[D], {
    done: {},
    steps: 4200,
    eaten: 950,
    calories: 1881,
    synced: { steps: 4200, eaten: 950, calories: 1881 }
  })
  assert.equal(metricSource(l.days[D], 'steps'), 'fitbit')
  const again = mergeSynced(l, [{ date: D, metric: 'steps', value: 4200 }])
  assert.equal(again, l) // nothing new: the same ledger, so nothing is saved
  l = mergeSynced(l, [{ date: D, metric: 'steps', value: 9100 }])
  assert.equal(l.days[D].steps, 9100)
})

test('a number typed by hand is never overwritten, but Fitbit’s figure is remembered beside it', () => {
  let l = setMetric(createLedger(), D, 'steps', 5000)
  l = mergeSynced(l, [{ date: D, metric: 'steps', value: 8432 }])
  assert.equal(l.days[D].steps, 5000)
  assert.equal(l.days[D].synced?.steps, 8432)
  assert.equal(metricSource(l.days[D], 'steps'), 'hand')
  l = adoptSyncedValue(l, D, 'steps')
  assert.equal(l.days[D].steps, 8432)
  assert.equal(metricSource(l.days[D], 'steps'), 'fitbit')
  l = mergeSynced(l, [{ date: D, metric: 'steps', value: 9000 }])
  assert.equal(l.days[D].steps, 9000)
})

test('clearing a Fitbit number keeps it clear; clearing a typed one lets Fitbit fill it', () => {
  let l = mergeSynced(createLedger(), [{ date: D, metric: 'eaten', value: 1200 }])
  l = setMetric(l, D, 'eaten', undefined)
  l = mergeSynced(l, [{ date: D, metric: 'eaten', value: 1300 }])
  assert.equal(l.days[D].eaten, undefined)
  assert.equal(l.days[D].synced?.eaten, 1300)

  let m = setMetric(createLedger(), D, 'steps', 100)
  m = setMetric(m, D, 'steps', undefined)
  assert.equal(m.days[D], undefined)
  m = mergeSynced(m, [{ date: D, metric: 'steps', value: 700 }])
  assert.equal(m.days[D].steps, 700)
})

test('a zero from Fitbit is no record at all — an empty food log must not pass for a kept limit', () => {
  let l = mergeSynced(createLedger(), [{ date: D, metric: 'eaten', value: 0 }])
  assert.equal(l.days[D], undefined)
  l = mergeSynced(l, [{ date: D, metric: 'eaten', value: 640 }])
  l = mergeSynced(l, [{ date: D, metric: 'eaten', value: 0 }]) // the food log was emptied
  assert.equal(l.days[D], undefined)
})

test('junk from the bridge is ignored', () => {
  const l = createLedger()
  const junk = [
    { date: 'yesterday', metric: 'steps', value: 5 },
    { date: D, metric: 'mood', value: 5 },
    { date: D, metric: 'steps', value: Number.NaN },
    { date: D, metric: 'steps', value: '9000' }
  ] as never[]
  assert.equal(mergeSynced(l, junk), l)
})

test('burning erases synced numbers too; Fitbit may bring them back, earning nothing without a contract', () => {
  let l = sealContract(
    createLedger(),
    { kind: 'common', startDate: D, stepsGoal: 5000, caloriesGoal: 2000, startWeight: 150, unit: 'lb' },
    { id: 'c', today: D, now: 'x', balance: 0 }
  )
  l = mergeSynced(l, [{ date: D, metric: 'steps', value: 7000 }])
  l = setMetric(l, D, 'eaten', 1500)
  l = burnContract(l, 'c', { today: D, now: 'x' })
  assert.equal(l.days[D], undefined)
})
