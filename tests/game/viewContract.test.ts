/**
 * T14: the state-level contract actions (gap 1), medical supervision (gap 2), the founding floor
 * (gap 3), and the Contract page's view model (Ch 4, D-01).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign, foundingHealer, type FoundingInput } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { charterLocked, reviseCharter, sealContract, takeRespite, withdrawContract, withdrawalPreview } from '../../src/renderer/src/lib/game/contractActions'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, DaySnapshot } from '../../src/renderer/src/lib/game/types'
import { archiveCards, contractPageView, lengthOptions, payoutPreview, runningView } from '../../src/renderer/src/lib/game/view/contract'
import { FOUNDED_AT, START, TZ, charter, chicago, emptyLedger, ledgerWith, openLegacyContract } from './fixtures/ledgers'
import { realm, withBuildings, withCastle, withPurse } from './support/realm'

function input(over: Partial<FoundingInput> = {}): FoundingInput {
  return { startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: emptyLedger(), ...over }
}

/** Settled snapshots for `days` days from `from`: 5,000 steps (0.7 of a 50,000 pool), 1,900 kcal, every duty kept. */
function settledDays(state: CampaignState, from: string, days: number): CampaignState {
  const snaps: DaySnapshot[] = Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), steps: 5_000, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3, streak: 0 }))
  const last = addDays(from, days - 1)
  return { ...state, settlement: { ...state.settlement, snapshots: [...state.settlement.snapshots, ...snaps] }, settledThrough: { day: last, week: 2 } }
}

// ── Gap 1: the actions ───────────────────────────────────────────────────────

test('Gap 1: sealing builds its context from the state, starts at the next dawn, posts the pledge and logs it', () => {
  const state = withPurse(realm(), 200)
  const sealed = sealContract(state, { id: 'c1', termDays: 3, pledge: 20 }, START)
  assert.ok(sealed.ok, sealed.reason)
  assert.equal(sealed.contract?.startDate, addDays(START, 1))
  assert.equal(balance(sealed.state.purse), 180)
  assert.deepEqual(sealed.state.log.at(-1), { id: `ev-${sealed.state.log.length}`, day: START, kind: 'contractSealed', contractId: 'c1', contractKind: 'standard', termDays: 3, pledge: 20, startDate: addDays(START, 1), endDate: addDays(START, 3) })
  // A second one queues behind it; a third is refused, with its reason worded for the player.
  const queued = sealContract(sealed.state, { id: 'c2', termDays: 1 }, START)
  assert.equal(queued.contract?.status, 'queued')
  assert.equal(queued.contract?.startDate, addDays(START, 4))
  const third = sealContract(queued.state, { id: 'c3', termDays: 1 }, START)
  assert.deepEqual([third.ok, third.reason], [false, 'A contract is already queued.'])
  assert.equal(sealContract(state, { id: 'x', termDays: 7 }, START).reason, 'The 7-day contract is not unlocked yet.')
})

test('Gap 1: withdrawing pays exactly what the preview shows, and returns half the pledge', () => {
  let state = withPurse(realm(), 200)
  state = sealContract(state, { id: 'c1', termDays: 3, pledge: 20 }, addDays(START, -1)).state
  state = settledDays(state, START, 2)
  const today = addDays(START, 2)
  const preview = withdrawalPreview(state, today)
  assert.ok(preview)
  assert.equal(preview.daysElapsed, 3)
  assert.ok(Math.abs(preview.score - 0.9) < 1e-9)
  const bonus = realmEffects(state).reputationBonus.value
  assert.equal(preview.payout, Math.round(25 * (1 + bonus) * 10) / 10, '10 × 3 × 1.0 × f(0.9) = 25, with the reputation bonus')
  assert.equal(preview.pledgeReturn, 10)
  const before = balance(state.purse)
  const done = withdrawContract(state, today)
  assert.ok(done.ok)
  assert.equal(Math.round((balance(done.state.purse) - before) * 10) / 10, preview.payout + preview.pledgeReturn)
  const posted = done.state.log.at(-1)
  assert.ok(posted?.kind === 'contract' && posted.outcome === 'withdrawn' && posted.payout === preview.payout)
  assert.equal(withdrawContract(done.state, today).reason, 'No contract is running.')
})

test('Gap 1: a Respite day on yesterday moves the end date a day later; the bank pays for it', () => {
  let state = withPurse(realm(), 200)
  state = sealContract(state, { id: 'c1', termDays: 3 }, addDays(START, -1)).state
  state = { ...state, contracts: { ...state.contracts, respiteBank: 1 } }
  const today = addDays(START, 1)
  const end = state.contracts.active?.endDate as string
  const rested = takeRespite(state, START, today)
  assert.ok(rested.ok, rested.reason)
  assert.equal(rested.state.contracts.active?.endDate, addDays(end, 1))
  assert.equal(rested.state.contracts.respiteBank, 0)
  assert.equal(rested.state.log.at(-1)?.kind, 'respite')
  assert.equal(takeRespite(rested.state, today, today).reason, 'No Respite days are banked.')
  assert.equal(takeRespite({ ...state }, addDays(START, -2), today).reason, 'A Respite day can be spent only on today or yesterday.')
})

test('Gap 1: the Charter is revised only between contracts, never below the floor', () => {
  const state = withPurse(realm(), 200)
  const revised = reviseCharter(state, charter({ stepPool: 60_000 }), START)
  assert.ok(revised.ok)
  assert.equal(revised.state.charter.stepPool, 60_000)
  assert.equal(revised.state.log.at(-1)?.kind, 'charter')
  assert.match(reviseCharter(state, charter({ calorieLimit: 1_100 }), START).reason ?? '', /calorie limit/)
  const running = sealContract(state, { id: 'c1', termDays: 3 }, addDays(START, -1)).state
  assert.equal(charterLocked(running, START), true)
  assert.equal(reviseCharter(running, charter({ stepPool: 60_000 }), START).reason, 'The Charter can be revised only between contracts.')
  assert.equal(charterLocked(running, addDays(START, -1)), false, 'sealed but not begun: still between contracts')
})

// ── Gaps 2 and 3 ─────────────────────────────────────────────────────────────

test('Gap 2: medical supervision confirmed at founding still lets a later contract seal below the floor; without it the seal is refused', () => {
  const profile = { sex: 'male' as const, heightCm: 180, birthYear: 1990 }
  const supervised = foundCampaign(input({ ...profile, medicalSupervision: true, charter: charter({ calorieLimit: 1_400 }) }), FOUNDED_AT)
  assert.equal(supervised.campaign.medicalSupervision, true)
  assert.equal(supervised.weight.healerFloor, 1_700)
  assert.ok(sealContract(supervised, { id: 'c1', termDays: 3 }, START).ok)
  const unsupervised = { ...supervised, campaign: { ...supervised.campaign, medicalSupervision: undefined } }
  assert.match(sealContract(unsupervised, { id: 'c1', termDays: 3 }, START).reason ?? '', /calorie limit/)
  assert.equal(foundCampaign(input({ ...profile, charter: charter({ calorieLimit: 1_700 }) }), FOUNDED_AT).campaign.medicalSupervision, undefined)
})

test('Gap 3: the wizard can show the founding floor before founding, and founding checks the same floor', () => {
  const burned = ledgerWith('2026-09-24', 14, () => ({ done: {}, burned: 2_600 }))
  const shown = foundingHealer(input({ ledger: burned }), FOUNDED_AT)
  assert.equal(shown.range.floor, 1_600)
  assert.equal(shown.range.source, 'burned')
  assert.equal(foundingHealer(input(), FOUNDED_AT).range.floor, 1_200, 'with no data, the minimum')
  assert.throws(() => foundCampaign(input({ ledger: burned, charter: charter({ calorieLimit: shown.range.floor - 50 }) }), FOUNDED_AT), /calorie limit/)
  assert.equal(foundCampaign(input({ ledger: burned, charter: charter({ calorieLimit: shown.range.floor }) }), FOUNDED_AT).weight.healerFloor, shown.range.floor)
})

test('T14: founding is refused, with its reason, for an open legacy contract and a goal below BMI 18.5', () => {
  const ledger = emptyLedger()
  ledger.contracts.push(openLegacyContract('2026-10-01'))
  assert.throws(() => foundCampaign(input({ ledger }), FOUNDED_AT), /ledger contract is still open/)
  assert.throws(() => foundCampaign(input({ goalWeight: 125, heightCm: 180 }), FOUNDED_AT), /BMI/)
})

// ── The view model ───────────────────────────────────────────────────────────

test('Ch 4: locked lengths report their exact requirement', () => {
  const lengths = lengthOptions(realm())
  assert.deepEqual(
    lengths.map((l) => [l.days, l.unlocked, l.requirement?.label]),
    [
      [1, true, undefined],
      [3, true, undefined],
      [7, false, 'a building at Tier II'],
      [14, false, 'Castle Tier II'],
      [30, false, 'Castle Tier III']
    ]
  )
  const grown = lengthOptions(withCastle(withBuildings(realm(), { foundry: 2 }), 2))
  assert.deepEqual(grown.map((l) => l.unlocked), [true, true, true, true, false])
  assert.deepEqual(lengths.map((l) => l.fullPayout), [10, 34.5, 98, 238, 600])
})

test('Ch 4: the pledge cap is 10 × days, ×1.5 at Merchant Hall III, and never more than the purse', () => {
  const rich = withPurse(realm(), 1_000)
  assert.equal(lengthOptions(rich).find((l) => l.days === 7)?.pledgeCap, 70)
  assert.equal(lengthOptions(withBuildings(rich, { merchantHall: 3 })).find((l) => l.days === 7)?.pledgeCap, 105)
  assert.equal(lengthOptions(withPurse(realm(), 50)).find((l) => l.days === 7)?.pledgeCap, 50)
})

test('Ch 4: the payout preview shows break-even at 70% for a pledge', () => {
  const preview = payoutPreview(realm(), 3, 20)
  assert.equal(preview.breakEven, 0.7)
  const at70 = preview.rows.find((r) => r.score === 0.7)
  assert.equal(at70?.pledgeReturn, 20, 'at 70%: the pledge comes back whole')
  assert.equal(payoutPreview(realm(), 3, 0).breakEven, null)
})

test('Ch 4: a 7-day contract on its 4th day at Q 0.9 projects 10 × 7 × 1.4 × 0.833 = 81.7 before the bonus', () => {
  let state = withPurse(withBuildings(realm(), { barracks: 2 }), 200)
  state = sealContract(state, { id: 'c7', termDays: 7 }, addDays(START, -1)).state
  state = settledDays(state, START, 3)
  const view = runningView(state, addDays(START, 3))
  assert.ok(view)
  assert.equal(view.dayNumber, 4)
  assert.equal(view.totalDays, 7)
  assert.equal(view.settledDays, 3)
  assert.ok(Math.abs(view.score - 0.9) < 1e-9)
  assert.ok(Math.abs(view.pillars.steps - 0.7) < 1e-9 && view.pillars.table === 1 && view.pillars.duties === 1)
  assert.equal(view.projected.payout, 81.7)
  assert.deepEqual(view.respite.days.map((d) => d.allowed), [false, false], 'nothing banked yet')
})

test('T14: the page view: Charter locked while a contract runs, seals queue after it, and the Archive card shows the pledge result', () => {
  let state = withPurse(realm(), 200)
  const page0 = contractPageView(state, START)
  assert.equal(page0.charter.locked, false)
  assert.equal(page0.sealStartsOn, addDays(START, 1))
  assert.equal(page0.running, null)
  state = sealContract(state, { id: 'c1', termDays: 3, pledge: 20 }, addDays(START, -1)).state
  const page1 = contractPageView(state, START)
  assert.equal(page1.charter.locked, true)
  assert.equal(page1.sealStartsOn, addDays(START, 3))
  assert.equal(page1.canSeal, true)
  // Settle the 3 days through settlement itself: the contract pays, and the Archive card says so.
  const ledger = ledgerWith('2026-09-10', 60)
  const paid = settle(state, ledger, chicago(addDays(START, 4))).state
  const card = archiveCards(paid).find((c) => c.id === 'c1')
  assert.ok(card && card.status === 'paid' && card.payout !== undefined)
  assert.equal(card.pledgeResult, (card.pledgeReturn as number) - 20)
})
