import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CampaignFile } from '../../src/main/ledgerFile'
import { foundCampaign, type FoundingInput } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { seal } from '../../src/renderer/src/lib/game/contracts'
import { balance } from '../../src/renderer/src/lib/game/economy'
import {
  DAY_PHASE_NAMES,
  DAY_PHASES,
  WEEK_PHASE_NAMES,
  WEEK_PHASES,
  settle
} from '../../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import type { Ledger } from '../../src/renderer/src/lib/types'
import { FOUNDED_AT, START, TZ, charter, chicago, emptyLedger, steadyLedger, withDay } from './fixtures/ledgers'

function found(ledger: Ledger = emptyLedger(), over: Partial<FoundingInput> = {}): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger, ...over }, FOUNDED_AT)
}

/** Seals a contract on `today` with the state's own Charter. */
function sealOn(state: CampaignState, today: string, termDays: number, id: string, pledge = 0): CampaignState {
  const sealed = seal(
    state.contracts,
    state.purse,
    { id, termDays, charter: state.charter, pledge },
    { today, buildings: state.buildings, castleTier: state.castleTier, merchantHallTier: state.buildings.merchantHall, floor: state.weight.healerFloor ?? 0 }
  )
  return { ...state, contracts: sealed.contracts, purse: sealed.purse }
}

const LEDGER = steadyLedger('2026-09-10', 70)

/** What daily combat (T08) adds to every day: battle reports and their spoils and tribute. */
const COMBAT_EVENTS: string[] = ['defense', 'assault', 'calledOff', 'trophy', 'respect', 'hexTransfer']
const COMBAT_PURSE: string[] = ['spoils', 'tribute']

test('Ch 2 / Appendix A: the phase registry holds every phase, in the book’s order', () => {
  assert.deepEqual(
    [...DAY_PHASE_NAMES],
    ['syncNote', 'snapshotInputs', 'contractsAndDaily', 'combat', 'grandBattlesAuto', 'expireTimers', 'contractEnd']
  )
  assert.deepEqual(
    [...WEEK_PHASE_NAMES],
    ['weeklyIncome', 'courtships', 'weight', 'rivalTurn', 'fronts', 'borderCampaigns', 'world', 'resetAndSchedule']
  )
  assert.deepEqual(Object.keys(DAY_PHASES).sort(), [...DAY_PHASE_NAMES].sort())
  assert.deepEqual(Object.keys(WEEK_PHASES).sort(), [...WEEK_PHASE_NAMES].sort())
})

test('Test 9 (core): settle twice with the same now gives a deep-equal state and zero new events', () => {
  const state = sealOn(found(LEDGER), '2026-10-07', 3, 'c1', 10)
  for (const now of [chicago('2026-10-09'), chicago('2026-10-12'), chicago('2026-10-20', 600), chicago('2026-11-10')]) {
    const first = settle(state, LEDGER, now, { launch: true })
    assert.ok(first.summary.days.length > 0)
    const second = settle(first.state, LEDGER, now, { launch: true })
    assert.deepEqual(second.state, first.state)
    assert.equal(second.events.length, 0)
    assert.equal(second.summary.days.length, 0)
    assert.equal(second.state, first.state, 'nothing to settle returns the same object')
  }
})

test('Test 9: 30 days settled one call per day equal one catch-up call over the same 30 days', () => {
  let start = sealOn(found(LEDGER), '2026-10-07', 3, 'c1', 20)
  start = sealOn(start, '2026-10-07', 3, 'c2')
  let daily = start
  let events = 0
  for (let i = 1; i <= 30; i++) {
    const result = settle(daily, LEDGER, chicago(addDays(START, i)))
    assert.equal(result.summary.days.length, 1)
    daily = result.state
    events += result.events.length
  }
  const catchUp = settle(start, LEDGER, chicago(addDays(START, 30)))
  assert.equal(catchUp.summary.days.length, 30)
  assert.equal(catchUp.state.settledThrough.day, addDays(START, 29))
  assert.equal(catchUp.events.length, events)
  assert.deepEqual(daily, catchUp.state)
  // The month crossed the end of daylight time (Nov 1), and both contracts paid.
  assert.deepEqual(catchUp.state.contracts.history.map((c) => [c.id, c.status]), [['c1', 'paid'], ['c2', 'paid']])
})

test('A 10-day absence settles 10 days in order, closes the week between them, and the Homecoming lists all 10 (A-45)', () => {
  const before = settle(found(LEDGER), LEDGER, chicago('2026-10-12'), { launch: true }).state
  assert.equal(before.settlement.lastLaunch, '2026-10-12')
  const back = settle(before, LEDGER, chicago('2026-10-22', 300), { launch: true })
  const { summary } = back
  assert.deepEqual(summary.days.map((d) => d.day), Array.from({ length: 10 }, (_, i) => addDays('2026-10-12', i)))
  assert.deepEqual(summary.weeksClosed, [2])
  assert.equal(summary.days.find((d) => d.weekClosed)?.day, '2026-10-18')
  assert.equal(summary.awayDays, 10)
  assert.equal(summary.homecoming, true)
  assert.equal(back.state.settlement.lastLaunch, '2026-10-22')
  assert.ok(summary.purseChange > 0)
  assert.equal(summary.purseChange, Math.round(summary.days.reduce((s, d) => s + d.purseChange, 0) * 10) / 10)

  // Calendar order: the log and the purse never go back in time, and the week's income sits
  // between Sunday's daily income and Monday's.
  const logDays = back.state.log.map((e) => e.day)
  assert.deepEqual(logDays, [...logDays].sort())
  const purse = back.state.purse.events
  assert.deepEqual(purse.map((e) => e.date), purse.map((e) => e.date).sort())
  const weekly = purse.findIndex((e, i) => i >= before.purse.events.length && e.source === 'steps')
  assert.equal(purse[weekly - 1].date, '2026-10-18')
  assert.equal(purse.find((e, i) => i > weekly && e.source === 'duties')?.date, '2026-10-19')
  const closed = back.events.find((e) => e.kind === 'weekClosed')
  assert.equal(closed?.day, '2026-10-18')
  assert.equal(back.state.weight.weeks.at(-1)?.week, 2)

  // One or two days are not a homecoming; 14 days away is, even when little is left to settle.
  assert.equal(settle(back.state, LEDGER, chicago('2026-10-24')).summary.homecoming, false)
  const away = settle(back.state, LEDGER, chicago('2026-11-05'), { launch: true })
  assert.equal(away.summary.awayDays, 14)
  assert.equal(away.summary.homecoming, true)
})

test('A-02: raising yesterday’s steps inside the grace window posts adjust events and raises the projected contract score', () => {
  const ledger = withDay(LEDGER, '2026-10-11', (d) => ({ ...d, steps: 3_000 }))
  const s1 = settle(found(ledger), ledger, chicago('2026-10-10')).state
  // A 3-day contract sealed on Saturday runs Sunday to Tuesday; Sunday's close is also week 1's.
  const s2 = settle(sealOn(s1, '2026-10-10', 3, 'c1'), ledger, chicago('2026-10-12')).state
  assert.equal(s2.settledThrough.day, '2026-10-11')
  const scoreBefore = s2.contracts.active?.score ?? 0
  const balanceBefore = balance(s2.purse)

  const corrected = withDay(ledger, '2026-10-11', (d) => ({ ...d, steps: 12_000 }))
  const s3 = settle(s2, corrected, chicago('2026-10-12', 600))
  assert.equal(s3.summary.days.length, 0)
  const adjusts = s3.state.purse.events.slice(s2.purse.events.length)
  assert.ok(adjusts.length > 0)
  assert.ok(adjusts.every((e) => e.kind === 'adjust' && e.amount > 0))
  assert.ok(adjusts.some((e) => e.source === 'correction:weekly:2026-10-11'))
  assert.ok(balance(s3.state.purse) > balanceBefore)
  assert.deepEqual(s3.events.map((e) => e.kind), ['correction'])
  assert.ok((s3.state.contracts.active?.score ?? 0) > scoreBefore)
  assert.equal(s3.state.settlement.snapshots.find((s) => s.date === '2026-10-11')?.steps, 12_000)

  // Settled once: running it again changes nothing.
  const again = settle(s3.state, corrected, chicago('2026-10-12', 600))
  assert.deepEqual(again.state, s3.state)
  assert.equal(again.events.length, 0)
  // The next close takes Monday in, and still never pays the correction twice.
  const next = settle(s3.state, corrected, chicago('2026-10-13'))
  assert.equal(next.state.purse.events.filter((e) => e.kind === 'adjust').length, adjusts.length)
})

test('A-02 / Ch 2 rule 5: lowering yesterday’s duties after a contract has paid posts nothing that reduces the payout', () => {
  const s1 = settle(found(LEDGER), LEDGER, chicago('2026-10-10')).state
  const s2 = settle(sealOn(s1, '2026-10-10', 1, 'c1', 10), LEDGER, chicago('2026-10-12')).state
  const paid = s2.contracts.history.find((c) => c.id === 'c1')
  assert.equal(paid?.status, 'paid')
  assert.equal(paid?.endDate, '2026-10-11')

  const lowered = withDay(LEDGER, '2026-10-11', (d) => ({ ...d, done: {} }))
  const s3 = settle(s2, lowered, chicago('2026-10-12', 600))
  assert.deepEqual(s3.state.purse, s2.purse)
  assert.deepEqual(s3.state.contracts, s2.contracts)
  assert.equal(s3.events.length, 0)
  // The snapshot holds the corrected inputs going forward.
  assert.equal(s3.state.settlement.snapshots.find((s) => s.date === '2026-10-11')?.dutiesKept, 0)

  // The other way round, late data raises the paid contract with an adjust.
  const low = withDay(LEDGER, '2026-10-11', (d) => ({ ...d, done: {}, eaten: undefined }))
  const t1 = settle(found(low), low, chicago('2026-10-10')).state
  const t2 = settle(sealOn(t1, '2026-10-10', 1, 'c1', 10), low, chicago('2026-10-12')).state
  const t3 = settle(t2, LEDGER, chicago('2026-10-12', 600)).state
  const added = t3.purse.events.slice(t2.purse.events.length)
  assert.ok(added.some((e) => e.kind === 'adjust' && e.source === 'contract:c1' && e.amount > 0))
  assert.ok((t3.contracts.history[0].score ?? 0) > (t2.contracts.history[0].score ?? 0))
})

test('A-02: editing a day 3 days back changes nothing, and neither does editing yesterday once its window has passed', () => {
  const s1 = settle(found(LEDGER), LEDGER, chicago('2026-10-16')).state
  const old = withDay(LEDGER, '2026-10-12', (d) => ({ ...d, steps: 40_000, done: {}, weight: 150 }))
  const r = settle(s1, old, chicago('2026-10-16', 600))
  assert.equal(r.state, s1)
  assert.equal(r.events.length, 0)

  // Yesterday (Oct 15) can be corrected until Oct 16 closes; settling late on Oct 18 ignores the edit.
  const late = withDay(LEDGER, '2026-10-15', (d) => ({ ...d, steps: 40_000 }))
  const s2 = settle(s1, late, chicago('2026-10-18'))
  assert.equal(s2.state.settlement.snapshots.find((s) => s.date === '2026-10-15')?.steps, LEDGER.days['2026-10-15'].steps)
  assert.equal(s2.events.filter((e) => e.kind === 'correction').length, 0)
  // While the next day is still being closed, it is taken in.
  const s3 = settle(s1, late, chicago('2026-10-17'))
  assert.equal(s3.state.settlement.snapshots.find((s) => s.date === '2026-10-15')?.steps, 40_000)
})

test('A ledger with no data settles without throwing and pays no behavior income beyond the founding grant (Momentum’s floor needs consistency)', () => {
  const ledger = emptyLedger()
  const { state, events } = settle(found(ledger), ledger, chicago('2026-11-02'))
  assert.equal(state.settledThrough.day, '2026-11-01')
  // Daily battles (T08) still pay spoils and take tribute; nothing else moves the purse.
  const behavior = state.purse.events.filter((e) => !COMBAT_PURSE.includes(e.kind))
  assert.deepEqual(behavior.map((e) => e.source), ['founding'])
  assert.equal(balance({ events: behavior }), 100)
  assert.deepEqual(state.weight.weeks.map((w) => [w.week, w.momentum]), [[1, 0], [2, 0], [3, 0], [4, 0]])
  assert.deepEqual(events.filter((e) => e.kind === 'weekClosed').map((e) => e.kind === 'weekClosed' && [e.week, e.income]), [
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0]
  ])
  assert.equal(state.contracts.respiteBank, 3) // one per 7 days played: days 7, 14 and 21
})

test('Week 1 is prorated: a perfect partial week pays 4/7 of the full weekly amounts (A-04)', () => {
  // 30,000 steps over Thursday to Sunday beats the 28,571 share of a 50,000 pool.
  const ledger = withDay(steadyLedger('2026-09-10', 40), '2026-10-08', (d) => ({ ...d, steps: 10_000 }))
  const { state } = settle(found(ledger), ledger, chicago('2026-10-12'))
  const weekly = state.purse.events.filter((e) => e.date === '2026-10-11' && ['steps', 'calories', 'flawless'].includes(e.source))
  // 70, 70 and 50, ×4/7 and with the Merchant Hall I bonus of 2%.
  assert.deepEqual(weekly.map((e) => [e.source, e.amount]), [['steps', 40.8], ['calories', 40.8], ['flawless', 29.1]])
})

test('Daily: duties, the perfect day and the streak are paid at each close', () => {
  const { state } = settle(found(LEDGER), LEDGER, chicago('2026-10-11'))
  const byDay = (day: string): [string, number][] =>
    state.purse.events.filter((e) => e.date === day && !COMBAT_PURSE.includes(e.kind)).map((e) => [e.source, e.amount])
  // 12 + 5 with the 2% bonus; the streak adds +1 per perfect day before it.
  assert.deepEqual(byDay('2026-10-08'), [['duties', 12.2], ['perfectDay', 5.1]])
  assert.deepEqual(byDay('2026-10-09'), [['duties', 12.2], ['perfectDay', 5.1], ['streak', 1]])
  assert.deepEqual(byDay('2026-10-10'), [['duties', 12.2], ['perfectDay', 5.1], ['streak', 2]])
  assert.deepEqual(state.settlement.snapshots.filter((s) => s.date >= START).map((s) => s.streak), [1, 2, 3])
})

test('Contracts: the running contract is scored each day, paid on its last day, and the queued one starts at the next dawn', () => {
  let state = sealOn(found(LEDGER), '2026-10-07', 3, 'c1', 20)
  state = sealOn(state, '2026-10-07', 3, 'c2')
  const mid = settle(state, LEDGER, chicago('2026-10-10')).state
  assert.ok((mid.contracts.active?.score ?? 0) > 0.9)
  assert.equal(mid.contracts.active?.id, 'c1')
  const end = settle(mid, LEDGER, chicago('2026-10-11'))
  assert.deepEqual(end.events.filter((e) => !COMBAT_EVENTS.includes(e.kind)).map((e) => e.kind), ['contract'])
  assert.equal(end.state.contracts.active?.id, 'c2')
  assert.equal(end.state.contracts.active?.startDate, '2026-10-11')
  const pays = end.state.purse.events.filter((e) => e.source === 'contract:c1').map((e) => e.kind)
  assert.deepEqual(pays, ['pledge', 'earn', 'return'])
})

test('Timers expire at the close of their last day; garrison damage resets at the week close', () => {
  let state = found(LEDGER)
  const hex = state.hexes.find((h) => h.ring === 3) as CampaignState['hexes'][number]
  state = {
    ...state,
    hexes: state.hexes.map((h) => (h.id === hex.id ? { ...h, status: 'scorched', statusUntil: '2026-10-09', garrisonDamage: 7 } : h)),
    roster: state.roster.map((c, i) => (i === 0 ? { ...c, wearyUntil: '2026-10-08' } : c)),
    deals: [{ id: 'd1', rival: 'orc', kind: 'truce', madeOn: '2026-10-08', until: '2026-10-09', price: 60 }]
  }
  const day1 = settle(state, LEDGER, chicago('2026-10-09')).state
  assert.equal(day1.roster[0].wearyUntil, undefined)
  assert.equal(day1.hexes.find((h) => h.id === hex.id)?.status, 'scorched')
  assert.equal(day1.deals.length, 1)
  const day2 = settle(day1, LEDGER, chicago('2026-10-10')).state
  const after = day2.hexes.find((h) => h.id === hex.id)
  assert.equal(after?.status, 'held')
  assert.equal(after?.statusUntil, undefined)
  assert.equal(after?.garrisonDamage, 7)
  assert.equal(day2.deals.length, 0)
  const week = settle(day2, LEDGER, chicago('2026-10-12')).state
  assert.equal(week.hexes.find((h) => h.id === hex.id)?.garrisonDamage, 0)
})

test('Week close: weight records the week, Momentum pays, and steady weigh-ins earn their Momentum', () => {
  const { state } = settle(found(LEDGER), LEDGER, chicago('2026-11-02'))
  assert.deepEqual(state.weight.weeks.map((w) => w.week), [1, 2, 3, 4])
  // Weigh-ins fall 0.8 lb a week from before the start, so the trend is known from week 1.
  assert.ok(state.weight.weeks.every((w) => w.momentum > 0.9))
  assert.ok(state.purse.events.some((e) => e.source === 'momentum' && e.date === '2026-10-11'))
  assert.ok(state.weight.healerFloor !== undefined)
  assert.equal(state.settledThrough.week, 4)
})

test('Settlement never changes the ledger', () => {
  const ledger = steadyLedger('2026-09-10', 70)
  const copy = JSON.parse(JSON.stringify(ledger))
  const s1 = settle(found(ledger), ledger, chicago('2026-10-20'), { launch: true }).state
  settle(s1, withDay(ledger, '2026-10-19', (d) => ({ ...d, steps: 1 })), chicago('2026-10-20', 60))
  assert.deepEqual(ledger, copy)
})

test('Manual harness: found a campaign, advance 8 days, and see one week close in campaign.json events', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-t06-'))
  const file = new CampaignFile(dir)
  const ledger = steadyLedger('2026-09-10', 70)
  let state = found(ledger)
  await file.save(JSON.stringify(state))
  // Launch on each of the next 8 mornings, settle, save once, reload.
  for (let i = 1; i <= 8; i++) {
    const loaded = JSON.parse(file.load() as string) as CampaignState
    const result = settle(loaded, ledger, chicago(addDays('2026-10-07', i), 30), { launch: true })
    state = result.state
    await file.save(JSON.stringify(state))
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'campaign.json'), 'utf8')) as CampaignState
  assert.equal(saved.settledThrough.day, '2026-10-14')
  const closes = saved.log.filter((e) => e.kind === 'weekClosed')
  assert.equal(closes.length, 1)
  assert.equal(closes[0].day, '2026-10-11')
  assert.deepEqual(saved, state)
  console.log(`# campaign.json week-close event: ${JSON.stringify(closes[0])}`)
})

test('A campaign that has ended settles nothing more', () => {
  const state = found(LEDGER)
  const won = { ...state, campaign: { ...state.campaign, status: 'won' as const } }
  const r = settle(won, LEDGER, chicago('2026-10-20'))
  assert.equal(r.state, won)
  assert.equal(r.events.length, 0)
})
