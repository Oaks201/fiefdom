import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accordRespectGain,
  availableLengths,
  contractPayout,
  earnRespite,
  lateCorrection,
  payoutCurve,
  pledgeCap,
  pledgeReturn,
  seal,
  settleContract,
  spendRespite,
  stewardSuggestion,
  validateCharter,
  withdraw,
  withdrawalPayout,
  type SealContext,
  type SealRequest
} from '../../src/renderer/src/lib/game/contracts'
import { balance, roundPosting } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { CampaignError } from '../../src/renderer/src/lib/game/errors'
import { consistency, termsOf } from '../../src/renderer/src/lib/game/score'
import { t } from '../../src/renderer/src/lib/game/text'
import type { BuildingId, BuildingTier, ContractsState, PurseState } from '../../src/renderer/src/lib/game/types'
import { realm, withBuildings } from './support/realm'
import { MONDAY, days, workedExampleWeek } from './support/worked-example'

const CHARTER = { stepPool: 50_000, calorieLimit: 2_000, duties: ['Read', 'Stretch', 'Water'] }
const SUNDAY = '2026-10-04'
const EMPTY: ContractsState = { history: [], respiteBank: 0 }
const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps

function buildings(tier: BuildingTier = 1): Record<BuildingId, BuildingTier> {
  return { barracks: tier, merchantHall: 1, mageTower: 1, foundry: 1 }
}

function ctx(over: Partial<SealContext> = {}): SealContext {
  return { today: SUNDAY, buildings: buildings(2), castleTier: 3, pledgeCapMult: 1, floor: 1_550, ...over }
}

/** What paying reads from a realm with no Merchant Hall pledge rules yet. */
const PAY = { minPledgeReturn: 0, bonus: 0 }

/** The realm's pledge rules with the Merchant Hall at `tier` (Ch 4, Ch 7). */
const merchantHall = (tier: number) => realmEffects(withBuildings(realm(), { merchantHall: tier }))

const purseOf = (amount: number): PurseState => ({ events: [{ id: 'seed', date: SUNDAY, kind: 'earn', amount, source: 'test' }] })

function sealOne(req: Partial<SealRequest> = {}, c: Partial<SealContext> = {}, purse = purseOf(500), contracts = EMPTY) {
  return seal(contracts, purse, { id: 'c1', termDays: 7, charter: CHARTER, ...req }, ctx(c))
}

// ── The curve and payouts ────────────────────────────────────────────────────

test('Test 1: Ch 4 worked example pays 80.68 (posted 80.7); a 70 pledge returns 115.26 (posted 115.3) (E-01)', () => {
  const sealed = sealOne({ pledge: 70 })
  assert.equal(sealed.contract.startDate, MONDAY, 'starts at the next dawn')
  assert.equal(sealed.contract.endDate, '2026-10-11')
  const q = consistency(workedExampleWeek(), termsOf(sealed.contract.charter), 1, sealed.contract.respiteDates)
  assert.ok(near(q, 0.893968, 1e-6), `Q = ${q}`)
  assert.ok(near(payoutCurve(q), 0.82328, 1e-6), `f = ${payoutCurve(q)}`)
  assert.ok(near(contractPayout(7, q), 80.68, 0.01))
  assert.ok(near(pledgeReturn(70, q, 0), 115.26, 0.01))

  const paid = settleContract(sealed.contracts, sealed.purse, q, { ...PAY, date: '2026-10-11' })
  const posted = paid.purse.events.slice(-2).map((e) => [e.kind, e.amount, e.source])
  assert.deepEqual(posted, [
    ['earn', 80.7, 'contract:c1'],
    ['return', 115.3, 'contract:c1']
  ])
  assert.equal(balance(paid.purse), roundPosting(500 - 70 + 80.7 + 115.3))
  assert.deepEqual(paid.outcome, { contractId: 'c1', outcome: 'paid', score: q, payout: 80.7, pledgeReturn: 115.3 })
  assert.equal(paid.contracts.active, undefined)
  assert.equal(paid.contracts.history[0].status, 'paid')
})

test('f(Q) at 0.40 … 1.00 is 0, 0.25, 0.5, 0.667, 0.833, 1; below clamps to 0 and above to 1 (Ch 4)', () => {
  const table: [number, number][] = [
    [0.4, 0],
    [0.55, 0.25],
    [0.7, 0.5],
    [0.8, 0.667],
    [0.9, 0.833],
    [1.0, 1]
  ]
  for (const [q, f] of table) assert.ok(near(payoutCurve(q), f, 0.001), `f(${q}) = ${payoutCurve(q)}`)
  assert.equal(payoutCurve(0.3), 0)
  assert.equal(payoutCurve(1.3), 1)
})

test('Full payouts by length: 10, 34.5 (E-05), 98, 238 and 600 (Ch 4)', () => {
  const expected: [number, number][] = [
    [1, 10],
    [3, 34.5],
    [7, 98],
    [14, 238],
    [30, 600]
  ]
  for (const [length, full] of expected) {
    assert.ok(near(contractPayout(length, 1), full, 1e-9))
    assert.equal(roundPosting(contractPayout(length, 1)), full)
  }
})

test('Lengths unlock: 7 days at any building Tier II, 14 at Castle II, 30 at Castle III (Ch 4)', () => {
  assert.deepEqual(availableLengths({ buildings: buildings(1), castleTier: 1 }), [1, 3])
  assert.deepEqual(availableLengths({ buildings: buildings(2), castleTier: 1 }), [1, 3, 7])
  assert.deepEqual(availableLengths({ buildings: buildings(2), castleTier: 2 }), [1, 3, 7, 14])
  assert.deepEqual(availableLengths({ buildings: buildings(2), castleTier: 3 }), [1, 3, 7, 14, 30])

  assert.throws(() => sealOne({ termDays: 7 }, { buildings: buildings(1), castleTier: 1 }), CampaignError)
  assert.throws(() => sealOne({ termDays: 14 }, { castleTier: 1 }), CampaignError)
  assert.throws(() => sealOne({ termDays: 30 }, { castleTier: 2 }), CampaignError)
  assert.throws(() => sealOne({ termDays: 5 }), CampaignError)
  assert.equal(sealOne({ termDays: 3 }, { buildings: buildings(1), castleTier: 1 }).contract.endDate, '2026-10-07')
})

test('Withdrawal on day 4 of a 7-day contract at Q = 0.9 pays 33.3 and returns half the pledge (Ch 4 rule 3)', () => {
  assert.ok(near(withdrawalPayout(4, 0.9), 33.33, 0.01))
  const sealed = sealOne({ pledge: 40 })
  const out = withdraw(sealed.contracts, sealed.purse, 0.9, { ...PAY, date: '2026-10-08' })
  assert.deepEqual(
    out.purse.events.slice(-2).map((e) => [e.kind, e.amount]),
    [
      ['earn', 33.3],
      ['return', 20]
    ]
  )
  assert.equal(out.outcome.outcome, 'withdrawn')
  assert.equal(out.contracts.history[0].endDate, '2026-10-08')
  assert.equal(out.contracts.history[0].status, 'withdrawn')
})

test('Withdrawing lets the queued contract start at the next dawn (Ch 2 rule 1)', () => {
  const first = sealOne()
  const second = sealOne({ id: 'c2', termDays: 3 }, {}, first.purse, first.contracts)
  assert.equal(second.contract.status, 'queued')
  assert.equal(second.contract.startDate, '2026-10-12')
  const out = withdraw(second.contracts, second.purse, 0.9, { ...PAY, date: '2026-10-08' })
  assert.equal(out.contracts.active?.id, 'c2')
  assert.equal(out.contracts.active?.status, 'active')
  assert.equal(out.contracts.active?.startDate, '2026-10-09')
  assert.equal(out.contracts.active?.endDate, '2026-10-11')
  assert.equal(out.contracts.queued, undefined)
})

// ── Sealing and pledges ──────────────────────────────────────────────────────

test('Sealing copies the Charter, and one contract runs while at most one waits (Ch 4 rule 1)', () => {
  const charter = { ...CHARTER, duties: [...CHARTER.duties] }
  const first = sealOne({ charter })
  charter.duties.push('Changed later')
  assert.deepEqual(first.contract.charter.duties, CHARTER.duties)
  assert.equal(first.contract.charter.calorieFloor, 1_550)
  const second = sealOne({ id: 'c2' }, {}, first.purse, first.contracts)
  assert.equal(second.contracts.active?.id, 'c1')
  assert.equal(second.contracts.queued?.id, 'c2')
  assert.throws(() => sealOne({ id: 'c3' }, {}, second.purse, second.contracts), /already queued/)
  // Paying the first lets the queued one run.
  const paid = settleContract(second.contracts, second.purse, 1, { ...PAY, date: '2026-10-11' })
  assert.equal(paid.contracts.active?.id, 'c2')
  assert.throws(() => settleContract(paid.contracts, paid.purse, 1, { ...PAY, date: '2026-10-12' }), /runs until/)
})

test('A pledge above the balance is refused, and the cap is 10 × days, ×1.5 at Merchant Hall III (Ch 4)', () => {
  assert.throws(() => sealOne({ pledge: 31 }, {}, purseOf(30)), CampaignError)
  assert.throws(() => sealOne({ pledge: 71 }), CampaignError)
  const [mhI, mhIII] = [merchantHall(1).pledgeCap.value, merchantHall(3).pledgeCap.value]
  assert.equal(pledgeCap(7, mhI, 500), 70)
  assert.equal(pledgeCap(7, mhIII, 500), 105)
  assert.equal(pledgeCap(7, mhIII, 50), 50)
  const sealed = sealOne({ pledge: 105 }, { pledgeCapMult: mhIII })
  assert.equal(balance(sealed.purse), 395)
  assert.deepEqual(
    [sealed.purse.events.at(-1)?.kind, sealed.purse.events.at(-1)?.amount, sealed.purse.events.at(-1)?.source],
    ['pledge', -105, 'contract:c1']
  )
})

test('Merchant Hall IV guarantees at least half the pledge back (Ch 4)', () => {
  const [mhIII, mhIV] = [merchantHall(3).minPledgeReturn.value, merchantHall(4).minPledgeReturn.value]
  assert.equal(pledgeReturn(70, 0.3, mhIII), 0)
  assert.equal(pledgeReturn(70, 0.3, mhIV), 35)
  assert.ok(near(pledgeReturn(70, 0.9, mhIV), 70 * 2 * payoutCurve(0.9), 1e-9))
})

test('The reputation bonus raises a contract payout but not the pledge return', () => {
  const sealed = sealOne({ pledge: 70 })
  const paid = settleContract(sealed.contracts, sealed.purse, 1, { ...PAY, date: '2026-10-11', bonus: 0.02 })
  assert.equal(paid.outcome.payout, 100)
  assert.equal(paid.outcome.pledgeReturn, 140)
})

// ── The Charter ──────────────────────────────────────────────────────────────

test('Charter validation: pool 10,000 to 200,000, limit from the Healer floor to 10,000, 1 to 5 duties (Ch 4, Ch 16)', () => {
  const limits = { floor: 1_550 }
  assert.deepEqual(validateCharter(CHARTER, limits), [])
  assert.equal(validateCharter({ ...CHARTER, stepPool: 9_999 }, limits).length, 1)
  assert.equal(validateCharter({ ...CHARTER, stepPool: 200_001 }, limits).length, 1)
  assert.deepEqual(validateCharter({ ...CHARTER, stepPool: 200_000 }, limits), [])
  assert.equal(validateCharter({ ...CHARTER, calorieLimit: 1_500 }, limits).length, 1)
  assert.deepEqual(validateCharter({ ...CHARTER, calorieLimit: 1_550 }, limits), [])
  assert.equal(validateCharter({ ...CHARTER, calorieLimit: 10_001 }, limits).length, 1)
  assert.deepEqual(validateCharter({ ...CHARTER, calorieLimit: 1_000 }, { floor: 1_550, medicalSupervision: true }), [])
  assert.equal(validateCharter({ ...CHARTER, duties: [] }, limits).length, 1)
  assert.equal(validateCharter({ ...CHARTER, duties: ['a', 'b', 'c', 'd', 'e', 'f'] }, limits).length, 1)
  assert.equal(validateCharter({ ...CHARTER, duties: ['a', ' '] }, limits).length, 1)
  assert.throws(() => sealOne({ charter: { ...CHARTER, calorieLimit: 1_200 } }), CampaignError)
})

// ── Respite ──────────────────────────────────────────────────────────────────

test('Respite on yesterday removes that day from every pillar and moves the end date by +1 (Ch 4 rule 4)', () => {
  const sealed = sealOne()
  const banked: ContractsState = { ...sealed.contracts, respiteBank: 1 }
  // Wednesday 10-07 was a bad day; today is Thursday 10-08.
  const after = spendRespite(banked, '2026-10-07', '2026-10-08')
  const active = after.active!
  assert.equal(active.endDate, '2026-10-12')
  assert.deepEqual(active.respiteDates, ['2026-10-07'])
  assert.equal(active.respiteDays, 1)
  assert.equal(after.respiteBank, 0)

  const perfect = { steps: 50_000 / 7, eaten: 1_900 }
  const record = days(8, MONDAY, (i) => (i === 2 ? { dutiesKept: 0 } : perfect))
  const terms = termsOf(active.charter)
  assert.ok(consistency(record.slice(0, 7), terms, 1) < 1)
  assert.ok(near(consistency(record, terms, 1, active.respiteDates), 1, 1e-12))
})

test('Respite on the day before yesterday, without a bank, or outside the contract is refused (Ch 4 rule 4)', () => {
  const sealed = sealOne()
  const banked: ContractsState = { ...sealed.contracts, respiteBank: 2 }
  assert.throws(() => spendRespite(banked, '2026-10-06', '2026-10-08'), /today or yesterday/)
  assert.throws(() => spendRespite(banked, '2026-10-09', '2026-10-08'), /today or yesterday/)
  assert.throws(() => spendRespite(sealed.contracts, '2026-10-08', '2026-10-08'), /No Respite/)
  assert.throws(() => spendRespite(banked, SUNDAY, SUNDAY), /No running contract/)
  const once = spendRespite(banked, '2026-10-08', '2026-10-08')
  assert.throws(() => spendRespite(once, '2026-10-08', '2026-10-08'), /already/)
})

test('Respite moves a queued contract back with the running one', () => {
  const first = sealOne()
  const second = sealOne({ id: 'c2', termDays: 3 }, {}, first.purse, first.contracts)
  const after = spendRespite({ ...second.contracts, respiteBank: 1 }, '2026-10-08', '2026-10-08')
  assert.equal(after.active?.endDate, '2026-10-12')
  assert.equal(after.queued?.startDate, '2026-10-13')
  assert.equal(after.queued?.endDate, '2026-10-15')
})

test('Respite is earned once per 7 days played and the bank never exceeds its cap (Ch 4 rule 4)', () => {
  // The cap itself (4, 5 at Mage Tower III, …) is realmEffects().respiteBank, tested in effects.test.ts.
  let state = EMPTY
  for (let day = 1; day <= 100; day++) {
    state = earnRespite(state, day, 4)
    assert.equal(state.respiteBank, Math.min(4, Math.floor(day / 7)))
    assert.ok(state.respiteBank <= 4)
  }
  assert.equal(earnRespite({ ...EMPTY, respiteBank: 6 }, 7, 4).respiteBank, 4)
})

test('A withdrawn contract does not pay for its Respite days', () => {
  const sealed = sealOne()
  const after = spendRespite({ ...sealed.contracts, respiteBank: 1 }, '2026-10-07', '2026-10-08')
  const out = withdraw(after, sealed.purse, 1, { ...PAY, date: '2026-10-08' })
  assert.equal(out.outcome.payout, 30)
})

// ── Late data ────────────────────────────────────────────────────────────────

test('Late data only helps: a lower Q posts nothing; a higher Q posts an adjust for the difference (Ch 2 rule 5, A-02)', () => {
  const sealed = sealOne({ pledge: 70 })
  const pay = { ...PAY, date: '2026-10-11' }
  const paid = settleContract(sealed.contracts, sealed.purse, 0.85, pay)
  const before = balance(paid.purse)

  const lower = lateCorrection(paid.contracts, paid.purse, 'c1', 0.8, { ...pay, date: '2026-10-12' })
  assert.equal(lower.adjustment, 0)
  assert.equal(lower.purse, paid.purse)
  assert.equal(lower.contracts, paid.contracts)

  const higher = lateCorrection(paid.contracts, paid.purse, 'c1', 0.9, { ...pay, date: '2026-10-12' })
  const expected = roundPosting(contractPayout(7, 0.9)) + roundPosting(pledgeReturn(70, 0.9, 0)) - paid.outcome.payout - paid.outcome.pledgeReturn
  assert.ok(near(higher.adjustment, expected, 1e-9))
  assert.deepEqual(
    [higher.purse.events.at(-1)?.kind, higher.purse.events.at(-1)?.source],
    ['adjust', 'contract:c1']
  )
  assert.ok(near(balance(higher.purse), before + expected, 1e-9))
  assert.equal(higher.contracts.history[0].score, 0.9)
  // Correcting again to the same score posts nothing more.
  assert.equal(lateCorrection(higher.contracts, higher.purse, 'c1', 0.9, pay).adjustment, 0)
})

// ── The Accord ───────────────────────────────────────────────────────────────

test('An Accord is sealed and paid exactly like a 30-day contract, and reports its f(Q) for Respect (D-01)', () => {
  assert.throws(() => sealOne({ kind: 'accord', termDays: 30 }), /with a rival/)
  assert.throws(() => sealOne({ kind: 'accord', termDays: 14, rival: 'orc' }), /30 days/)
  assert.throws(() => sealOne({ kind: 'accord', termDays: 30, rival: 'orc' }, { castleTier: 2 }), CampaignError)
  const sealed = sealOne({ kind: 'accord', termDays: 30, rival: 'orc', pledge: 100 })
  assert.equal(sealed.contract.endDate, '2026-11-03')
  const paid = settleContract(sealed.contracts, sealed.purse, 0.9, { ...PAY, date: '2026-11-03' })
  assert.equal(paid.outcome.payout, roundPosting(contractPayout(30, 0.9)))
  assert.equal(paid.outcome.pledgeReturn, roundPosting(pledgeReturn(100, 0.9, 0)))
  assert.deepEqual(paid.accord, { contractId: 'c1', rival: 'orc', curve: payoutCurve(0.9) })
  assert.ok(near(accordRespectGain(paid.accord!.curve, 74), 50 * payoutCurve(0.9), 1e-9))
  assert.ok(near(accordRespectGain(paid.accord!.curve, 75), 60 * payoutCurve(0.9), 1e-9))
  // A standard contract carries no Accord hook.
  const standard = sealOne()
  assert.equal(settleContract(standard.contracts, standard.purse, 1, { ...PAY, date: '2026-10-11' }).accord, undefined)
})

// ── The Steward's Counsel ────────────────────────────────────────────────────

test("The Steward's Counsel suggests gentler terms below 75% and firmer above 95% over 4 weeks, as text (Ch 4)", () => {
  assert.equal(stewardSuggestion([0.5, 0.5, 0.5]), null)
  const gentler = stewardSuggestion([0.99, 0.7, 0.72, 0.74, 0.73])
  assert.equal(gentler?.direction, 'gentler')
  assert.deepEqual(gentler?.facts, { weeks: 4, average: 72 })
  assert.equal(stewardSuggestion([0.96, 0.97, 0.98, 0.99])?.direction, 'firmer')
  assert.equal(stewardSuggestion([0.75, 0.75, 0.75, 0.75]), null)
  assert.equal(stewardSuggestion([0.95, 0.95, 0.95, 0.95]), null)
  for (const s of [gentler!, stewardSuggestion([1, 1, 1, 1])!]) {
    const text = t(s.textId, s.facts)
    assert.ok(!text.startsWith('[missing'), text)
    assert.ok(!text.includes('{'), text)
  }
})
