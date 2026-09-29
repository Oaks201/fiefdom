import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activeHabits,
  addHabit,
  allowedStartDates,
  burnContract,
  closeContract,
  createLedger,
  LedgerError,
  moveHabit,
  normalizeLedger,
  openContract,
  retireHabit,
  sealContract,
  setMetric,
  setSound,
  toggleDuty,
  type ContractDraft
} from '../src/renderer/src/lib/ledger'
import { contractHaystack, contractStatus, evaluateContract, matchesQuery } from '../src/renderer/src/lib/contracts'
import type { Ledger } from '../src/renderer/src/lib/types'

const NOW = '2026-09-28T12:00:00.000Z'
const draft = (over: Partial<ContractDraft> = {}): ContractDraft => ({
  startDate: '2026-09-28',
  stepsGoal: 10000,
  caloriesGoal: 500,
  startWeight: 182.4,
  unit: 'lb',
  ...over
})

function sealed(): Ledger {
  return sealContract(createLedger(), draft(), { id: 'c1', today: '2026-09-28', now: NOW })
}

test('a sealed contract spans seven days and cannot overlap another', () => {
  const l = sealed()
  const c = openContract(l)!
  assert.equal(c.endDate, '2026-10-04')
  assert.equal(contractStatus(c, '2026-09-28'), 'active')
  assert.equal(contractStatus(c, '2026-10-05'), 'awaiting')
  assert.deepEqual(allowedStartDates(l, '2026-09-30'), [])
  assert.throws(() => sealContract(l, draft({ startDate: '2026-10-05' }), { id: 'c2', today: '2026-09-28', now: NOW }), LedgerError)
})

test('contract drafts are validated', () => {
  const l = createLedger()
  const ctx = { id: 'x', today: '2026-09-28', now: NOW }
  assert.throws(() => sealContract(l, draft({ startDate: '2026-09-27' }), ctx), /start date/)
  assert.throws(() => sealContract(l, draft({ startDate: '2026-10-06' }), ctx), /start date/)
  assert.throws(() => sealContract(l, draft({ stepsGoal: 5 }), ctx), /steps/i)
  assert.throws(() => sealContract(l, draft({ caloriesGoal: 0 }), ctx), /calories/i)
  assert.throws(() => sealContract(l, draft({ startWeight: 3 }), ctx), /weight/i)
  assert.doesNotThrow(() => sealContract(l, draft({ startDate: '2026-10-05' }), ctx))
})

test('weigh-in opens on the last day and closes the contract', () => {
  const l = sealed()
  const ctx = { today: '2026-10-03', now: NOW }
  assert.throws(() => closeContract(l, 'c1', { finalWeight: 180 }, ctx), /last day/)
  const closed = closeContract(l, 'c1', { finalWeight: 180.04, note: '  Good week  ' }, { today: '2026-10-04', now: NOW })
  const c = closed.contracts[0]
  assert.equal(c.finalWeight, 180)
  assert.equal(c.note, 'Good week')
  assert.equal(c.closedOn, '2026-10-04')
  assert.equal(openContract(closed), undefined)
  // the next contract may begin the day after the last one ended
  assert.equal(allowedStartDates(closed, '2026-10-04')[0], '2026-10-05')
  assert.throws(() => closeContract(closed, 'c1', { finalWeight: 179 }, { today: '2026-10-05', now: NOW }), /already/)
})

test('burning a contract erases it and the steps & calories logged under it, but keeps duties', () => {
  let l = sealed()
  l = addHabit(l, { id: 'h1', name: 'Read', createdOn: '2026-09-28' })
  l = setMetric(l, '2026-09-28', 'steps', 12000)
  l = setMetric(l, '2026-09-28', 'calories', 600)
  l = setMetric(l, '2026-09-27', 'steps', 4000) // before the contract: untouched
  l = toggleDuty(l, '2026-09-28', 'h1')
  l = burnContract(l, 'c1')
  assert.equal(l.contracts.length, 0)
  assert.deepEqual(l.days['2026-09-28'], { done: { h1: true } })
  assert.equal(l.days['2026-09-27'].steps, 4000)
  assert.deepEqual(allowedStartDates(l, '2026-09-28')[0], '2026-09-28')
})

test('metrics are clamped and clearing a value removes empty days', () => {
  let l = setMetric(createLedger(), '2026-09-28', 'steps', 12345.6)
  assert.equal(l.days['2026-09-28'].steps, 12346)
  l = setMetric(l, '2026-09-28', 'steps', -50)
  assert.equal(l.days['2026-09-28'].steps, 0)
  l = setMetric(l, '2026-09-28', 'steps', undefined)
  assert.equal(l.days['2026-09-28'], undefined)
})

test('duties appear from their first day and can be retired without rewriting history', () => {
  let l = addHabit(createLedger(), { id: 'h1', name: '  Stretch   daily ', createdOn: '2026-09-20' })
  assert.equal(l.habits[0].name, 'Stretch daily')
  assert.equal(activeHabits(l, '2026-09-19').length, 0)
  assert.equal(activeHabits(l, '2026-09-20').length, 1)
  l = toggleDuty(l, '2026-09-21', 'h1')
  l = toggleDuty(l, '2026-09-25', 'h1')
  l = retireHabit(l, 'h1', '2026-09-25')
  assert.equal(l.habits[0].retiredOn, '2026-09-25')
  assert.equal(activeHabits(l, '2026-09-24').length, 1)
  assert.equal(activeHabits(l, '2026-09-25').length, 0)
  assert.deepEqual(l.days['2026-09-21'].done, { h1: true })
  assert.equal(l.days['2026-09-25'], undefined)
  // toggling a duty on a day it doesn't apply does nothing
  assert.equal(toggleDuty(l, '2026-09-26', 'h1'), l)
  // retiring on (or before) its first day deletes it entirely
  l = retireHabit(l, 'h1', '2026-09-20')
  assert.equal(l.habits.length, 0)
  assert.equal(l.days['2026-09-21'], undefined)
})

test('duties can be reordered', () => {
  let l = createLedger()
  for (const id of ['a', 'b', 'c']) l = addHabit(l, { id, name: id, createdOn: '2026-09-28' })
  l = moveHabit(l, 'c', 0)
  assert.deepEqual(l.habits.map((h) => h.id), ['c', 'a', 'b'])
})

test('contract evaluation, grades and search', () => {
  let l = sealed()
  for (const [i, date] of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].entries()) {
    l = setMetric(l, date, 'steps', i === 2 ? 8000 : 11000)
    l = setMetric(l, date, 'calories', 550)
  }
  l = closeContract(l, 'c1', { finalWeight: 180.9, note: 'Rainy week in the hills' }, { today: '2026-10-05', now: NOW })
  const ev = evaluateContract(l, l.contracts[0], '2026-10-05')
  assert.equal(ev.stepsDays, 6)
  assert.equal(ev.caloriesDays, 7)
  assert.equal(ev.bothDays, 6)
  assert.equal(ev.grade, 'honored')
  assert.equal(ev.weightDelta, -1.5)
  assert.equal(ev.reputation, 6 * 10 + 7 * 10 + 25)
  const hay = contractHaystack(ev)
  assert.ok(matchesQuery(hay, 'september'))
  assert.ok(matchesQuery(hay, 'oct 2026'))
  assert.ok(matchesQuery(hay, 'rainy honored'))
  assert.ok(matchesQuery(hay, '10,000'))
  assert.ok(!matchesQuery(hay, 'gilded'))
})

test('normalizeLedger keeps what is valid and drops the rest', () => {
  const raw = {
    version: 1,
    profile: { title: 'Lady', name: 'Amy', holding: 'Ashford' },
    settings: { unit: 'kg', weekStartsOn: 5 },
    habits: [{ id: 'h1', name: 'Read', createdOn: '2026-09-01' }, { id: 'bad' }],
    days: {
      '2026-09-02': { steps: 9000, done: { h1: true, ghost: true } },
      'not-a-date': { steps: 1 },
      '2026-09-03': { done: {} }
    },
    contracts: [{ id: 'c', startDate: '2026-09-01', stepsGoal: 8000, caloriesGoal: 400, startWeight: 80, unit: 'kg', sealedAt: NOW }, { id: 'broken' }]
  }
  const l = normalizeLedger(JSON.parse(JSON.stringify(raw)))
  assert.equal(l.settings.unit, 'kg')
  assert.equal(l.settings.weekStartsOn, 1)
  assert.equal(l.habits.length, 1)
  assert.deepEqual(Object.keys(l.days), ['2026-09-02'])
  assert.deepEqual(l.days['2026-09-02'].done, { h1: true })
  assert.equal(l.contracts.length, 1)
  assert.equal(l.contracts[0].endDate, '2026-09-07')
  assert.deepEqual(normalizeLedger('garbage'), createLedger())
})

test('sound settings default on, are clamped, and survive saving', () => {
  const fresh = normalizeLedger({ version: 1, settings: { unit: 'lb' } })
  assert.deepEqual(fresh.settings.sound, { music: true, musicVolume: 0.5, effects: true, effectsVolume: 0.7 })
  let l = setSound(createLedger(), { music: false, effectsVolume: 3 })
  assert.equal(l.settings.sound.music, false)
  assert.equal(l.settings.sound.effectsVolume, 1)
  l = normalizeLedger(JSON.parse(JSON.stringify(l)))
  assert.deepEqual(l.settings.sound, { music: false, musicVolume: 0.5, effects: true, effectsVolume: 1 })
  assert.equal(normalizeLedger({ settings: { sound: { musicVolume: -2, effects: 'yes' } } }).settings.sound.musicVolume, 0)
})
