import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { contractPayout, seal } from '../../src/renderer/src/lib/game/contracts'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { needsRefounding, refound, refoundAsOf, refoundDefaults, type RefoundInput } from '../../src/renderer/src/lib/game/refound'
import { charterOn } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import type { Contract, Ledger } from '../../src/renderer/src/lib/types'
import { FOUNDED_AT, TZ, charter, chicago, openLegacyContract, steadyLedger } from './fixtures/ledgers'

/** The journey's first legacy contract, closed at its weigh-in, 7 days from 2026-09-30, no duties sworn. */
const LEGACY_START = '2026-09-30'
function closedLegacy(start = LEGACY_START, over: Partial<Contract> = {}): Contract {
  return { ...openLegacyContract(start), finalWeight: 215, closedOn: addDays(start, 7), closedAt: `${addDays(start, 7)}T12:00:00.000Z`, ...over }
}

function ledgerFor(from: string, n: number, contracts: Contract[]): Ledger {
  return { ...steadyLedger(from, n), contracts }
}

/** The replaced campaign: founded 2026-10-07 (first day 10-08), with a 3-day contract pledging 10 from 10-08. */
function oldCampaign(ledger: Ledger): CampaignState {
  const state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  const sealed = seal(
    state.contracts,
    state.purse,
    { id: 'c1', termDays: 3, charter: state.charter, pledge: 10 },
    { today: '2026-10-07', buildings: state.buildings, castleTier: state.castleTier, pledgeCapMult: realmEffects(state).pledgeCap.value, floor: state.weight.healerFloor ?? 0 }
  )
  return { ...state, contracts: sealed.contracts, purse: sealed.purse }
}

const LEDGER = ledgerFor('2026-09-01', 44, [closedLegacy()])
const OLD = oldCampaign(LEDGER)
const NOW = chicago('2026-10-14', 600)

function input(over: Partial<RefoundInput> = {}): RefoundInput {
  return {
    startWeight: 217,
    goalWeight: 168,
    charter: charter(),
    timeZone: TZ,
    seed: 11,
    ledger: LEDGER,
    old: OLD,
    answers: { paths: ['orc', 'goblin'], spend: 'balanced', land: 'both', offers: 'accept' },
    ...over
  }
}

test('D-21: the re-founding starts as of the first legacy contract, or else the replaced campaign', () => {
  assert.equal(refoundAsOf(LEDGER, OLD), LEGACY_START)
  assert.equal(refoundAsOf({ ...LEDGER, contracts: [] }, OLD), OLD.campaign.startDate)
  assert.equal(refoundAsOf({ ...LEDGER, contracts: [] }, null), undefined)
  const { state, summary } = refound(input(), NOW)
  assert.equal(state.campaign.startDate, LEGACY_START)
  assert.equal(state.settledThrough.day, '2026-10-13', 'every closed day is settled')
  assert.equal(summary.days, 14)
  assert.equal(state.settlement.lastLaunch, '2026-10-14')
  assert.equal(state.settlement.returnedOn, undefined, 'the backdated days are never an absence (R-21)')
})

test('D-21: the same inputs and now give the same campaign, and the ledger and old campaign are only read', () => {
  const ledgerBefore = structuredClone(LEDGER)
  const oldBefore = structuredClone(OLD)
  const a = refound(input(), NOW)
  const b = refound(input(), NOW)
  assert.deepEqual(a.state, b.state)
  assert.deepEqual(a.summary, b.summary)
  assert.deepEqual(LEDGER, ledgerBefore)
  assert.deepEqual(OLD, oldBefore)
})

test('D-21: settling the re-founded campaign again at the same now changes nothing', async () => {
  const { settle } = await import('../../src/renderer/src/lib/game/settle')
  const { state } = refound(input(), NOW)
  const again = settle(state, LEDGER, NOW, { launch: true })
  assert.equal(again.state, state)
  assert.equal(again.events.length, 0)
})

test('P2-10 / R-20: the legacy contract is re-sealed on its own terms, with no wager, and paid on the new curve', () => {
  const { state } = refound(input(), NOW)
  const legacy = state.contracts.history.find((c) => c.id === 'legacy:legacy-1')
  assert.ok(legacy, 'the legacy contract is in the history')
  assert.equal(legacy.startDate, LEGACY_START)
  assert.equal(legacy.endDate, '2026-10-06')
  assert.equal(legacy.termDays, 7)
  assert.equal(legacy.pledge, 0)
  assert.equal(legacy.status, 'paid')
  assert.deepEqual(legacy.charter.duties, [])
  assert.equal(legacy.charter.stepPool, 8_000 * 7)
  assert.equal(legacy.charter.calorieLimit, 2_000)
  assert.ok(legacy.paid && legacy.score !== undefined)
  assert.equal(legacy.paid.pledgeReturn, 0)
  const base = contractPayout(7, legacy.score)
  assert.ok(base > 0, 'good days score above the curve start')
  // Paid at 10 × 7 × 1.4 × f(Q), times whatever reputation bonus the realm had built by then.
  assert.ok(legacy.paid.payout >= Math.floor(base) && legacy.paid.payout <= base * 1.2, `${legacy.paid.payout} vs ${base}`)
})

test('P2-10 / C-14: the replaced campaign’s contracts are re-sealed as they were, pledge included', () => {
  const { state, summary } = refound(input(), NOW)
  const c1 = state.contracts.history.find((c) => c.id === 'c1')
  assert.ok(c1)
  assert.equal(c1.startDate, OLD.contracts.active?.startDate ?? OLD.contracts.queued?.startDate)
  assert.equal(c1.pledge, 10)
  assert.equal(c1.status, 'paid')
  const pledge = state.purse.events.find((p) => p.kind === 'pledge' && p.source === 'contract:c1')
  assert.ok(pledge)
  assert.equal(pledge.date, c1.startDate)
  assert.equal(pledge.amount, -10)
  assert.deepEqual(
    summary.contracts.map((c) => c.id),
    ['legacy:legacy-1', 'c1']
  )
  // Nothing of the old campaign's purse, land or battles comes across (section 7.5).
  assert.equal(state.purse.events.filter((p) => p.source === 'founding').length, 1)
})

test('P2-11 / C-12: each day is judged by the terms of its time', () => {
  const { state } = refound(input(), NOW)
  const legacyTerms = charterOn(state, '2026-10-07')
  assert.equal(legacyTerms.stepPool, 8_000 * 7, 'the gap day keeps the last legacy terms')
  assert.deepEqual(legacyTerms.duties, [])
  assert.deepEqual(charterOn(state, '2026-10-12').duties, OLD.charter.duties, 'the old campaign’s Charter from its first day')
  assert.deepEqual(charterOn(state, '2026-10-14'), state.charter, 'the re-founding Charter from today')
})

test('C-11: a day with no sworn duty pays no duty income and is not counted as failed', () => {
  const { state } = refound(input(), NOW)
  for (let d = LEGACY_START; d <= '2026-10-07'; d = addDays(d, 1)) {
    const snap = state.settlement.snapshots.find((s) => s.date === d)
    assert.ok(snap, d)
    assert.equal(snap.dutiesSworn, 0, d)
    assert.equal(state.purse.events.filter((p) => p.date === d && /^(duties|perfectDay|streak)/.test(p.source)).length, 0, d)
  }
  // From the old campaign's first day its three duties are sworn and pay.
  assert.equal(state.settlement.snapshots.find((s) => s.date === '2026-10-10')?.dutiesSworn, 3)
  assert.ok(state.purse.events.some((p) => p.source.startsWith('duties') && p.date === '2026-10-10'))
})

test('D-21: the catch-up player follows the founding answers and every gain names its source', () => {
  const { state, summary } = refound(input({ answers: { paths: ['orc'], spend: 'build', land: 'force', offers: 'decline' } }), NOW)
  assert.equal(state.purse.events.filter((p) => p.source.startsWith('courtship:')).length, 0, 'by force courts nothing')
  const gained = summary.purse.behavior + summary.purse.battle + summary.purse.land + summary.purse.other
  assert.ok(gained > 0)
  assert.ok(summary.purse.behavior > 0, 'behavior income comes from the ordinary settlement of each day')
  assert.equal(summary.purse.other, 250, 'only the founding grant is neither behavior, battle nor land')
})

test('G-15: a 365-day backdate settles every day (its time is checked by scripts/campaign-perf.ts)', () => {
  const ledger = ledgerFor('2025-08-30', 400, [closedLegacy('2025-09-30')])
  const { state, summary } = refound(input({ ledger, old: null }), chicago('2026-09-30', 600))
  assert.equal(summary.days, 365)
  assert.equal(state.settledThrough.day, '2026-09-29')
  assert.ok(summary.held.total > 13, 'a year of play takes land beyond the heartland')
})

test('Section 7.1: only a campaign founded under an older major rules version needs re-founding', () => {
  const at = (ruleVersion: string): { campaign: { ruleVersion: string } } => ({ campaign: { ruleVersion } })
  assert.equal(needsRefounding(at('2.2.0')), true)
  assert.equal(needsRefounding(at('1.0.0')), true)
  assert.equal(needsRefounding(at('3.0.0')), false)
  assert.equal(needsRefounding(at('3.4.1')), false)
  assert.equal(needsRefounding(at('garbled')), true)
  assert.equal(needsRefounding(refound(input(), NOW).state), false)
})

test('C-16: the wizard starts from the old campaign’s answers and the founding week’s weigh-in', () => {
  const d = refoundDefaults(LEDGER, OLD)
  assert.equal(d.asOf, LEGACY_START)
  // The founding week (Monday 09-28 to 10-04) is weighed on its Monday (D-13), before the journey's first day.
  assert.equal(d.startWeight, LEDGER.days['2026-09-28']?.weight)
  assert.equal(d.goalWeight, OLD.campaign.goalWeight)
  assert.equal(d.timeZone, OLD.campaign.timeZone)
  assert.equal(d.weekStartsOn, OLD.campaign.weekStartsOn)
  assert.deepEqual(d.charter?.duties, OLD.charter.duties)
  assert.equal(d.charter?.stepPool, OLD.charter.stepPool)
  // With no old campaign, only the date and weigh-in.
  const bare = refoundDefaults(LEDGER, null)
  assert.equal(bare.asOf, LEGACY_START)
  assert.equal(bare.goalWeight, undefined)
})

test('C-14: a contract still queued at the re-founding waits in the slot, its pledge posted today', () => {
  const old = OLD
  // Sealed on c1's last day, the only day it can be now (D-45); an old save may hold one sealed earlier.
  const queued = seal(
    old.contracts,
    old.purse,
    { id: 'c2', termDays: 3, charter: old.charter, pledge: 5 },
    { today: '2026-10-10', buildings: old.buildings, castleTier: old.castleTier, pledgeCapMult: realmEffects(old).pledgeCap.value, floor: old.weight.healerFloor ?? 0 }
  )
  const withQueue: CampaignState = { ...old, contracts: queued.contracts, purse: queued.purse }
  assert.equal(withQueue.contracts.queued?.id, 'c2')
  const now = chicago('2026-10-09', 600)
  const { state } = refound(input({ old: withQueue }), now)
  assert.equal(state.contracts.active?.id, 'c1')
  assert.equal(state.contracts.queued?.id, 'c2')
  assert.equal(state.contracts.queued?.status, 'queued')
  const pledge = state.purse.events.find((p) => p.kind === 'pledge' && p.source === 'contract:c2')
  assert.equal(pledge?.date, '2026-10-09')
  assert.equal(pledge?.amount, -5)
})
