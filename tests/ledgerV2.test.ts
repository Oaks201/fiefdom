import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  burnContract,
  createLedger,
  LEDGER_VERSION,
  LedgerError,
  mergeSynced,
  normalizeLedger,
  sealContract,
  setMetric,
  setWeight,
  validateWeight,
  weighIns
} from '../src/renderer/src/lib/ledger'
import type { Ledger } from '../src/renderer/src/lib/types'

const NOW = '2026-09-28T12:00:00.000Z'
const D = '2026-09-28'

/** A version 1 ledger as it sat on disk: two closed contracts, 217 → 214, then 214 → 211. */
function v1Raw(days: Record<string, unknown> = {}, unit: 'lb' | 'kg' = 'lb'): Record<string, unknown> {
  const contract = (id: string, startDate: string, closedOn: string, startWeight: number, finalWeight: number): Record<string, unknown> => ({
    id,
    startDate,
    endDate: closedOn,
    stepsGoal: 10000,
    caloriesGoal: 500,
    startWeight,
    unit: 'lb',
    sealedAt: `${startDate}T08:00:00.000Z`,
    finalWeight,
    closedOn,
    closedAt: `${closedOn}T20:00:00.000Z`
  })
  return {
    version: 1,
    profile: { title: 'Lord', name: 'Ada', holding: 'Ashford' },
    settings: { unit, weekStartsOn: 1 },
    habits: [],
    days,
    contracts: [contract('b', '2026-08-10', '2026-08-16', 214, 211), contract('a', '2026-08-03', '2026-08-09', 217, 214)]
  }
}

const roundTrip = (l: Ledger): unknown => JSON.parse(JSON.stringify(l))

test('A-05: v1 migration copies legacy contract weights onto their dates', () => {
  const l = normalizeLedger(JSON.parse(JSON.stringify(v1Raw({ '2026-08-04': { steps: 9000, done: {} } }))))
  assert.equal(l.version, 2)
  assert.equal(LEDGER_VERSION, 2)
  assert.equal(l.days['2026-08-03'].weight, 217)
  assert.equal(l.days['2026-08-09'].weight, 214)
  assert.equal(l.days['2026-08-10'].weight, 214)
  assert.equal(l.days['2026-08-16'].weight, 211)
  assert.deepEqual(weighIns(l), [
    { date: '2026-08-03', weight: 217 },
    { date: '2026-08-09', weight: 214 },
    { date: '2026-08-10', weight: 214 },
    { date: '2026-08-16', weight: 211 }
  ])
  // a day between the contract dates is left as it was
  assert.equal(l.days['2026-08-04'].weight, undefined)
  assert.equal(l.days['2026-08-04'].steps, 9000)
  // the new weigh-in days carry nothing else: no tallies, no manual marks
  assert.deepEqual(l.days['2026-08-03'], { done: {}, weight: 217 })
  // the contracts themselves are untouched
  assert.deepEqual(
    l.contracts.map((c) => [c.id, c.startWeight, c.finalWeight]),
    [['a', 217, 214], ['b', 214, 211]]
  )
})

test('A-05: normalizing a migrated (v2) ledger again returns an identical object', () => {
  const once = normalizeLedger(v1Raw({ '2026-08-03': { steps: 4000, done: {} } }))
  const twice = normalizeLedger(once)
  assert.deepEqual(twice, once)
  const reloaded = normalizeLedger(roundTrip(once))
  assert.deepEqual(reloaded, once)
  assert.deepEqual(normalizeLedger(roundTrip(reloaded)), once)
  assert.equal(JSON.stringify(normalizeLedger(roundTrip(once))), JSON.stringify(normalizeLedger(roundTrip(reloaded))))
})

test('A-05: a hand-typed weight already on a contract date is never overwritten by the migration', () => {
  const l = normalizeLedger(v1Raw({ '2026-08-03': { weight: 216.2, done: {} }, '2026-08-16': { weight: 210.8, steps: 7000, done: {} } }))
  assert.equal(l.days['2026-08-03'].weight, 216.2)
  assert.equal(l.days['2026-08-16'].weight, 210.8)
  assert.equal(l.days['2026-08-16'].steps, 7000)
  // the dates without a hand-typed weight still get the contract's
  assert.equal(l.days['2026-08-09'].weight, 214)
  assert.equal(l.days['2026-08-10'].weight, 214)
})

test('A-05: a weight cleared from a contract date in a v2 ledger is not filled in again', () => {
  const migrated = normalizeLedger(v1Raw())
  const cleared = setWeight(migrated, '2026-08-03', undefined)
  assert.equal(cleared.days['2026-08-03'], undefined) // the day held nothing else, so it is gone
  const reloaded = normalizeLedger(roundTrip(cleared))
  assert.equal(reloaded.days['2026-08-03'], undefined)
  assert.deepEqual(reloaded, cleared)
  // also when the v2 ledger never had weights on its contract dates at all
  const v2 = { ...v1Raw(), version: 2 }
  assert.deepEqual(normalizeLedger(v2).days, {})
})

test('A-05: migration converts a contract weight into the ledger unit (weights are typed in settings.unit)', () => {
  const raw = v1Raw({}, 'kg')
  ;(raw.contracts as Record<string, unknown>[])[1].unit = 'kg' // contract 'a', 217 → 214 written in kg terms
  ;(raw.contracts as Record<string, unknown>[])[1].startWeight = 100
  ;(raw.contracts as Record<string, unknown>[])[1].finalWeight = 98
  const l = normalizeLedger(raw)
  assert.equal(l.settings.unit, 'kg')
  assert.equal(l.days['2026-08-03'].weight, 100) // kg contract, kg ledger: as written
  assert.equal(l.days['2026-08-09'].weight, 98)
  assert.equal(l.days['2026-08-10'].weight, 97.1) // 214 lb → 97.07 kg
  assert.equal(l.days['2026-08-16'].weight, 95.7) // 211 lb → 95.71 kg
})

test('A-05: setWeight refuses whatever validateWeight refuses, in both units', () => {
  const lb = createLedger()
  const kg: Ledger = { ...createLedger(), settings: { ...createLedger().settings, unit: 'kg' } }
  for (const [ledger, bad] of [
    [lb, 49.9],
    [lb, 1000.1],
    [lb, 0],
    [lb, -180],
    [lb, Number.NaN],
    [lb, Number.POSITIVE_INFINITY],
    [kg, 19.9],
    [kg, 450.1],
    [kg, 500], // fine in lb, too heavy in kg
    [kg, Number.NaN]
  ] as const) {
    const problem = validateWeight(bad, ledger.settings.unit)
    assert.ok(problem, `validateWeight accepts ${bad} ${ledger.settings.unit}`)
    assert.throws(
      () => setWeight(ledger, D, bad),
      (err: unknown) => err instanceof LedgerError && err.message === problem
    )
  }
  assert.equal(setWeight(lb, D, 50).days[D].weight, 50)
  assert.equal(setWeight(lb, D, 1000).days[D].weight, 1000)
  assert.equal(setWeight(lb, D, 500).days[D].weight, 500)
  assert.equal(setWeight(kg, D, 20).days[D].weight, 20)
  assert.equal(setWeight(kg, D, 450).days[D].weight, 450)
  assert.throws(() => setWeight(lb, 'not-a-day', 180), LedgerError)
})

test('A-05: setWeight rounds to a tenth, and undefined clears the weight', () => {
  let l = setMetric(createLedger(), D, 'steps', 8000)
  l = setWeight(l, D, 182.46)
  assert.equal(l.days[D].weight, 182.5)
  assert.equal(setWeight(l, D, 182.5), l) // nothing changed: the same ledger
  l = setWeight(l, D, undefined)
  assert.equal('weight' in l.days[D], false)
  assert.equal(l.days[D].steps, 8000) // the rest of the day stays
  // a day that held only a weight disappears when the weight is cleared
  const only = setWeight(createLedger(), D, 180)
  assert.deepEqual(only.days[D], { done: {}, weight: 180 })
  assert.deepEqual(setWeight(only, D, undefined).days, {})
  // clearing a day with no weight changes nothing
  const empty = createLedger()
  assert.equal(setWeight(empty, D, undefined), empty)
})

test('A-05: weighIns lists every weigh-in, oldest first', () => {
  let l = createLedger()
  l = setWeight(l, '2026-09-30', 181)
  l = setWeight(l, '2026-09-02', 186.4)
  l = setMetric(l, '2026-09-10', 'steps', 5000) // a day without a weigh-in
  l = setWeight(l, '2026-09-15', 183.2)
  assert.deepEqual(weighIns(l), [
    { date: '2026-09-02', weight: 186.4 },
    { date: '2026-09-15', weight: 183.2 },
    { date: '2026-09-30', weight: 181 }
  ])
  assert.deepEqual(weighIns(createLedger()), [])
})

test('A-06: Fitbit total calories set burned, and a zero clears it', () => {
  let l = mergeSynced(createLedger(), [
    { date: D, metric: 'burned', value: 2450.6 },
    { date: '2026-09-29', metric: 'burned', value: 2310 }
  ])
  assert.deepEqual(l.days[D], { done: {}, burned: 2451 })
  assert.equal(l.days['2026-09-29'].burned, 2310)
  assert.equal(mergeSynced(l, [{ date: D, metric: 'burned', value: 2451 }]), l) // nothing new
  l = mergeSynced(l, [{ date: D, metric: 'burned', value: 2600 }])
  assert.equal(l.days[D].burned, 2600)
  l = mergeSynced(l, [{ date: D, metric: 'burned', value: 0 }])
  assert.equal(l.days[D], undefined) // it held nothing else
  // a zero on a day with no burned figure changes nothing
  assert.equal(mergeSynced(l, [{ date: '2026-09-01', metric: 'burned', value: 0 }]), l)
})

test('A-06: burned never touches the tallies, a hand-typed eaten is never overwritten, and burned is never manual', () => {
  let l = setMetric(createLedger(), D, 'eaten', 1800)
  l = mergeSynced(l, [
    { date: D, metric: 'eaten', value: 2200 },
    { date: D, metric: 'burned', value: 2500 }
  ])
  assert.equal(l.days[D].eaten, 1800)
  assert.equal(l.days[D].synced?.eaten, 2200)
  assert.equal(l.days[D].burned, 2500)
  assert.deepEqual(l.days[D].manual, { eaten: true })
  assert.equal(l.days[D].steps, undefined)
  assert.equal(l.days[D].calories, undefined)
  assert.equal(Object.hasOwn(l.days[D].synced ?? {}, 'burned'), false)
  // burned can never be typed by hand: setMetric does not even accept it (checked by npm run typecheck)
  const handTyped = (): Ledger =>
    // @ts-expect-error 'burned' is not a Metric
    setMetric(l, D, 'burned', 2000)
  assert.equal(typeof handTyped, 'function')
})

test('A-06: loading a ledger never marks burned as manual, even if the file says so', () => {
  const l = normalizeLedger({
    version: 2,
    days: {
      [D]: { burned: 2400, steps: 6000, manual: { burned: true, steps: true }, synced: { burned: 2400 }, done: {} },
      '2026-09-29': { burned: 0, done: {} }
    }
  })
  assert.deepEqual(l.days[D], { done: {}, burned: 2400, steps: 6000, manual: { steps: true } })
  assert.equal(l.days['2026-09-29'], undefined) // a zero is no record
  const fromFitbit = normalizeLedger({ version: 2, days: { [D]: { burned: 2400, done: {} } } })
  assert.deepEqual(fromFitbit.days[D], { done: {}, burned: 2400 })
})

test('A-05, A-06: burning a contract keeps the weigh-ins and the total calories burned on its days', () => {
  let l = sealContract(
    createLedger(),
    { kind: 'common', startDate: D, stepsGoal: 10000, caloriesGoal: 2000, startWeight: 182.4, unit: 'lb' },
    { id: 'c1', today: D, now: NOW, balance: 0 }
  )
  l = setMetric(l, D, 'steps', 12000)
  l = setMetric(l, D, 'eaten', 1800)
  l = setWeight(l, D, 182.4)
  l = mergeSynced(l, [
    { date: D, metric: 'burned', value: 2600 },
    { date: '2026-09-29', metric: 'calories', value: 700 },
    { date: '2026-09-29', metric: 'burned', value: 2450 }
  ])
  l = burnContract(l, 'c1', { today: D, now: NOW })
  assert.equal(l.contracts.length, 0)
  assert.deepEqual(l.days[D], { done: {}, weight: 182.4, burned: 2600 })
  assert.deepEqual(l.days['2026-09-29'], { done: {}, burned: 2450 })
})
