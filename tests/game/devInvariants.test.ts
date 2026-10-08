/**
 * The runtime invariants (T17): `settleViolations`, which development builds run after every
 * settlement and the simulator runs every day. A clean month settles with none; each broken
 * invariant is reported.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { settleViolations } from '../../src/renderer/src/lib/game/dev/invariants'
import { post } from '../../src/renderer/src/lib/game/economy'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, GameEvent } from '../../src/renderer/src/lib/game/types'
import { FOUNDED_AT, START, TZ, charter, chicago, steadyLedger } from './fixtures/ledgers'

const LEDGER = steadyLedger('2026-09-10', 60)

function settled(days: number): { before: CampaignState; after: CampaignState; now: Date } {
  const founded = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: LEDGER }, FOUNDED_AT)
  const before = settle(founded, LEDGER, chicago(addDays(START, days - 1), 600)).state
  const now = chicago(addDays(START, days), 600)
  return { before, after: settle(before, LEDGER, now).state, now }
}

function withEvent(state: CampaignState, event: GameEvent): CampaignState {
  return { ...state, log: [...state.log, event] }
}

test('T17: a month of steady settlement breaks no invariant, settling again included (Test 9)', () => {
  const { before, after, now } = settled(30)
  assert.deepEqual(settleViolations({ before, after, ledger: LEDGER, now, resettle: true }), [])
})

test('T17: each broken invariant is reported (Ch 15, Test 10)', () => {
  const { before, after, now } = settled(10)
  const check = (state: CampaignState): string[] => settleViolations({ before, after: state, ledger: LEDGER, now })
  const day = after.settledThrough.day
  const ring2 = after.hexes.find((h) => h.ring === 2) as CampaignState['hexes'][number]
  const gate = after.hexes.find((h) => h.kind === 'gate') as CampaignState['hexes'][number]

  assert.match(check(withEvent(after, { id: 'x-1', day, kind: 'campaignEnd', outcome: 'fallen' }))[0], /fell in week 2, before week 36/)
  assert.ok(check({ ...after, hexes: after.hexes.map((h) => (h.id === ring2.id ? { ...h, owner: 'orc' } : h)) }).some((v) => /ring 2 is held by orc/.test(v)))
  assert.match(check(withEvent(after, { id: 'x-2', day, kind: 'hexTransfer', hexId: ring2.id, from: 'neutral', to: 'goblin', how: 'conquest' }))[0], /passed to goblin/)
  assert.match(check(withEvent(after, { id: 'x-3', day, kind: 'borderCampaign', attacker: 'orc', defender: 'goblin', hexId: gate.id, taken: false }))[0], /targeted the gate/)
  assert.match(check({ ...after, purse: post(after.purse, { date: day, kind: 'earn', amount: 50, source: 'windfall' }) })[0], /"windfall" has no behavior, battle or land source/)
  assert.deepEqual(check({ ...after, purse: post(after.purse, { date: day, kind: 'earn', amount: 50, source: 'dev:scenario:x' }) }).length, 1)
  assert.deepEqual(settleViolations({ before, after: { ...after, purse: post(after.purse, { date: day, kind: 'earn', amount: 50, source: 'dev:scenario:x' }) }, ledger: LEDGER, now, extraSources: ['dev'] }), [])
  const week = { ...after.weight.weeks[after.weight.weeks.length - 1], week: 99, momentum: 1.2 }
  assert.match(check({ ...after, weight: { ...after.weight, weeks: [...after.weight.weeks, week] } })[0], /Momentum 1.2 above the target pace/)
  const fast = (momentum: number): CampaignState => ({ ...after, weight: { ...after.weight, weeks: [...after.weight.weeks, { ...week, momentum, tooFast: true }] } })
  assert.match(check(fast(0.8))[0], /Momentum 0.8 while the trend is too fast/)
})

test('T17 / Ch 5 rule 6: a too-fast week may still earn the habits’ plateau floor, since only Mw is held at half', () => {
  const { before, after, now } = settled(10)
  const week = { ...after.weight.weeks[after.weight.weeks.length - 1], week: 99, momentum: 0.6, tooFast: true }
  assert.deepEqual(settleViolations({ before, after: { ...after, weight: { ...after.weight, weeks: [...after.weight.weeks, week] } }, ledger: LEDGER, now }), [])
})

test('Test 10: a Border Campaign on a player hex is reported, but not on one a rival took from the player earlier that day', () => {
  const { before, after, now } = settled(10)
  const day = after.settledThrough.day
  const hex = after.hexes.find((h) => h.owner === 'player' && h.ring === 1) as CampaignState['hexes'][number]
  const check = (events: GameEvent[]): string[] => settleViolations({ before, after: { ...after, log: [...after.log, ...events] }, ledger: LEDGER, now })
  const campaign: GameEvent = { id: 'x-9', day, kind: 'borderCampaign', attacker: 'goblin', defender: 'orc', hexId: hex.id, taken: true }
  assert.ok(check([campaign]).some((v) => /targeted the player's hex/.test(v)))
  const lost: GameEvent = { id: 'x-8', day, kind: 'hexTransfer', hexId: hex.id, from: 'player', to: 'orc', how: 'conquest' }
  assert.ok(!check([lost, campaign]).some((v) => /targeted the player's hex/.test(v)))
})
