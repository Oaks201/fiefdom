import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addHabit,
  allowedStartDates,
  burnContract,
  closeContract,
  contractOn,
  createLedger,
  openContract,
  sealContract,
  setMetric,
  toggleDuty,
  type ContractDraft
} from '../src/renderer/src/lib/ledger'
import { contractStatus, evaluateContract, sealFor, wagerReturn } from '../src/renderer/src/lib/contracts'
import { computeReputation } from '../src/renderer/src/lib/reputation'
import { addDays } from '../src/renderer/src/lib/dates'
import type { Ledger } from '../src/renderer/src/lib/types'

const NOW = '2026-09-28T12:00:00.000Z'
const TODAY = '2026-09-28'

const wager = (stake: number, over: Partial<ContractDraft> = {}): ContractDraft => ({
  kind: 'wager',
  stake,
  startDate: TODAY,
  stepsGoal: 8000,
  caloriesGoal: 2200,
  startWeight: 190,
  unit: 'lb',
  ...over
})

/** A noble with a week of kept duties behind them: exactly 100 reputation on the 28th. */
function withPurse(): Ledger {
  let l = addHabit(createLedger(), { id: 'a', name: 'Read', createdOn: '2026-09-20' })
  for (let i = 0; i < 8; i++) l = toggleDuty(l, addDays('2026-09-20', i), 'a')
  assert.equal(computeReputation(l, TODAY).total, 100)
  return l
}

function keepWeek(l: Ledger, missSteps = 0): Ledger {
  for (let i = 0; i < 7; i++) {
    const d = addDays(TODAY, i)
    l = setMetric(l, d, 'steps', i < missSteps ? 100 : 9000)
    l = setMetric(l, d, 'eaten', 2100)
    l = toggleDuty(l, d, 'a')
  }
  return l
}

test('a wager must stake at least 10 and no more than you hold', () => {
  const l = withPurse()
  const ctx = { id: 'w', today: TODAY, now: NOW, balance: 100 }
  assert.throws(() => sealContract(l, wager(5), ctx), /at least 10/)
  assert.throws(() => sealContract(l, wager(101), ctx), /hold only 100/)
  assert.throws(() => sealContract(l, wager(20), { ...ctx, balance: 8 }), /need at least 10/)
  assert.throws(() => sealContract(l, wager(12.5), ctx), /at least 10/)
  assert.doesNotThrow(() => sealContract(l, wager(100), ctx))
})

test('the stake is paid up front, and a gilded week repays it threefold', () => {
  let l = withPurse()
  l = sealContract(l, wager(60), { id: 'w', today: TODAY, now: NOW, balance: 100 })
  assert.equal(l.contracts[0].stake, 60)
  assert.equal(computeReputation(l, TODAY).total, 40)

  l = keepWeek(l)
  const end = addDays(TODAY, 6)
  const before = computeReputation(l, end)
  l = closeContract(l, 'w', { finalWeight: 187 }, { today: end, now: NOW })
  const after = computeReputation(l, end)
  const ev = evaluateContract(l, l.contracts[0], end)
  assert.equal(ev.grade, 'gilded')
  assert.equal(ev.closingRep, 180)
  assert.equal(after.total - before.total, 180)
  // no common-contract bonuses on a wager
  assert.equal(ev.reputation, ev.dailyRep + 180 - 60)
})

test('an honored wager repays double, a wanting one half', () => {
  assert.equal(wagerReturn(60, 'honored'), 120)
  assert.equal(wagerReturn(45, 'wanting'), 22)
  const end = addDays(TODAY, 6)
  const sealed = sealContract(withPurse(), wager(50), { id: 'w', today: TODAY, now: NOW, balance: 100 })

  // 3 of 21 goals missed → 86% → honored
  let l = closeContract(keepWeek(sealed, 3), 'w', { finalWeight: 189 }, { today: end, now: NOW })
  assert.equal(evaluateContract(l, l.contracts[0], end).grade, 'honored')
  assert.equal(evaluateContract(l, l.contracts[0], end).closingRep, 100)

  // nothing kept → wanting
  l = closeContract(sealed, 'w', { finalWeight: 192 }, { today: end, now: NOW })
  const ev = evaluateContract(l, l.contracts[0], end)
  assert.equal(ev.grade, 'wanting')
  assert.equal(ev.closingRep, 25)
  assert.equal(ev.reputation, 25 - 50)
})

test('a burned wager forfeits its stake and stays in the Archive as ash', () => {
  let l = sealContract(withPurse(), wager(70), { id: 'w', today: TODAY, now: NOW, balance: 100 })
  l = setMetric(l, TODAY, 'steps', 12000)
  l = setMetric(l, TODAY, 'eaten', 1900)
  const tomorrow = addDays(TODAY, 1)
  l = burnContract(l, 'w', { today: tomorrow, now: NOW })

  const c = l.contracts[0]
  assert.equal(c.burnedOn, tomorrow)
  assert.equal(contractStatus(c, tomorrow), 'burned')
  assert.equal(sealFor(evaluateContract(l, c, tomorrow)).label, 'Burned')
  assert.equal(evaluateContract(l, c, tomorrow).reputation, -70)
  assert.equal(l.days[TODAY], undefined) // its progress burned with it
  assert.equal(contractOn(l, TODAY), undefined)
  assert.equal(openContract(l), undefined)
  assert.equal(computeReputation(l, tomorrow).total, 30)

  // a fresh contract may begin at once, even over the ashes
  assert.equal(allowedStartDates(l, tomorrow)[0], tomorrow)
  l = sealContract(l, { ...wager(20), startDate: tomorrow }, { id: 'w2', today: tomorrow, now: NOW, balance: 30 })
  assert.equal(contractOn(l, tomorrow)?.id, 'w2')
  assert.equal(l.contracts.length, 2)
  // burning twice changes nothing
  assert.equal(burnContract(l, 'w', { today: tomorrow, now: NOW }), l)
})

test('burning a closed wager takes back what it repaid', () => {
  const end = addDays(TODAY, 6)
  let l = sealContract(withPurse(), wager(40), { id: 'w', today: TODAY, now: NOW, balance: 100 })
  l = closeContract(keepWeek(l), 'w', { finalWeight: 188 }, { today: end, now: NOW })
  assert.equal(evaluateContract(l, l.contracts[0], end).reputation > 0, true)
  l = burnContract(l, 'w', { today: end, now: NOW })
  assert.equal(evaluateContract(l, l.contracts[0], end).reputation, -40)
})
