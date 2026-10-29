/**
 * Rules 3.6.0 (D-54): a Respite day is a paid day off. Nothing needs logging: the day leaves every
 * score, the week's step pool shrinking by a day's share while its pay does not. It pays a full day
 * × Realm Consistency, the streak grows, and the realm fights its day as usual at a Valor of Realm
 * Consistency. The contract ends on its day, and a Grand Battle due on the open day waits a day.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { setOrders } from '../../src/renderer/src/lib/game/combat'
import { respiteRefusal, sealContract, takeRespite, withdrawalPreview } from '../../src/renderer/src/lib/game/contractActions'
import { roundPosting } from '../../src/renderer/src/lib/game/economy'
import { pendingBattles } from '../../src/renderer/src/lib/game/grand'
import { realmConsistencyOn, restDayIncome, settle, snapshotOf, valorOn } from '../../src/renderer/src/lib/game/settle'
import { isRestDay } from '../../src/renderer/src/lib/game/state'
import type { BattleSetup, CampaignState, GrandBattle } from '../../src/renderer/src/lib/game/types'
import { liveValor, liveValorParts, stepPace } from '../../src/renderer/src/lib/game/view/chronicle'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { heraldView } from '../../src/renderer/src/lib/game/view/shell'
import type { Ledger } from '../../src/renderer/src/lib/types'
import { START, chicago, goodDay, ledgerWith, steadyLedger, withDay } from './fixtures/ledgers'
import { near } from './support/assert'
import { realm, withPurse } from './support/realm'

const LEDGER = steadyLedger('2026-09-10', 60)
/** The open day of `opened()`: the contract's second day. */
const TODAY = addDays(START, 1)
const DAILY = new Set(['duties', 'perfectDay', 'streak'])

/** A 3-day contract from START with two Respite days banked, settled through START: TODAY is open. */
function opened(ledger: Ledger = LEDGER): CampaignState {
  const sealed = sealContract(withPurse(realm(7, ledger), 500), { id: 'c1', termDays: 3 }, addDays(START, -1))
  assert.ok(sealed.ok, sealed.reason)
  const banked = { ...sealed.state, contracts: { ...sealed.state.contracts, respiteBank: 2 } }
  return settle(banked, ledger, chicago(TODAY)).state
}

function restToday(state: CampaignState): CampaignState {
  const rested = takeRespite(state, TODAY, TODAY)
  assert.ok(rested.ok, rested.reason)
  return rested.state
}

const dailyPaid = (state: CampaignState, day: string): number => roundPosting(state.purse.events.filter((e) => e.date === day && DAILY.has(e.source)).reduce((s, e) => s + e.amount, 0))
const lineOn = (state: CampaignState, day: string, source: string): number => state.purse.events.find((e) => e.date === day && e.source === source)?.amount ?? 0
/** Nothing logged on `day`: no steps, no food, no duty kept. */
const blank = (ledger: Ledger, day: string): Ledger => withDay(ledger, day, (d) => ({ ...d, steps: 0, eaten: undefined, done: {} }))

test('D-54: a rest day pays a full day × Realm Consistency whatever was logged, and the streak grows', () => {
  const missed = blank(LEDGER, TODAY)
  const start = opened(missed)
  const streak = snapshotOf(start, START)?.streak as number
  const rested = restToday(start)
  const expected = restDayIncome(rested, TODAY, 3)
  const rc = realmConsistencyOn(rested, TODAY, 1)
  assert.ok(rc > 0.5 && rc <= 1, `Realm Consistency ${rc}`)
  const closed = settle(rested, missed, chicago(addDays(TODAY, 2))).state
  assert.ok(dailyPaid(closed, TODAY) > 0, 'paid, though nothing was logged')
  assert.equal(dailyPaid(closed, TODAY), roundPosting(expected.lines.reduce((s, l) => s + roundPosting(l.amount), 0)), 'each line rounds as it posts (A-11)')
  assert.equal(lineOn(closed, TODAY, 'perfectDay'), roundPosting(lineOn(closed, START, 'perfectDay') * rc), 'the perfect day at Realm Consistency')
  assert.equal(snapshotOf(closed, TODAY)?.streak, streak + 1, 'the streak grows on the rest day')
  assert.equal(snapshotOf(closed, addDays(TODAY, 1))?.streak, streak + 2, 'and goes on after it')
})

test('D-54: a Respite for yesterday counts it as kept for the streak, and the day leaves Realm Consistency', () => {
  const missed = blank(LEDGER, TODAY)
  const start = opened(missed)
  const streak = snapshotOf(start, START)?.streak as number
  const closed = settle(start, missed, chicago(addDays(TODAY, 1))).state
  assert.equal(snapshotOf(closed, TODAY)?.streak, 0, 'the missed day broke the streak')
  const rested = takeRespite(closed, TODAY, addDays(TODAY, 1))
  assert.ok(rested.ok, rested.reason)
  const next = settle(rested.state, missed, chicago(addDays(TODAY, 2))).state
  assert.equal(snapshotOf(next, addDays(TODAY, 1))?.streak, streak + 2, 'the next day builds on the rest day as a day kept')
  assert.equal(dailyPaid(next, TODAY), 0, 'its pay, already settled, stands')
  // Realm Consistency reads the scored days only: the same as if the rest day had no record at all.
  const day = addDays(TODAY, 1)
  // The 3-day contract has closed by now: its Respite is in the history.
  const unrested = (s: CampaignState): CampaignState => ({ ...s, contracts: { ...s.contracts, history: s.contracts.history.map((c) => ({ ...c, respiteDates: [] })) } })
  assert.ok(next.contracts.history.some((c) => c.respiteDates.includes(TODAY)))
  const without: CampaignState = { ...unrested(next), settlement: { ...next.settlement, snapshots: next.settlement.snapshots.filter((s) => s.date !== TODAY) } }
  assert.equal(realmConsistencyOn(next, day, 1), realmConsistencyOn(without, day, 1))
  assert.ok(realmConsistencyOn(next, day, 1) > realmConsistencyOn(unrested(next), day, 1), 'counted, the empty day would pull it down')
})

test('D-54: the week’s step pool shrinks by a rest day’s share, and its pay does not', () => {
  // 7,200 steps a day clears a 50,000 pool's daily share (7,143); the rest day walks none.
  const steady = ledgerWith('2026-09-10', 60, () => goodDay({ steps: 7_200 }))
  const weekClose = '2026-10-11'
  const fullWeek = settle(opened(steady), steady, chicago(addDays(weekClose, 1))).state
  const idle = blank(steady, TODAY)
  const unrested = settle(opened(idle), idle, chicago(addDays(weekClose, 1))).state
  const rested = settle(restToday(opened(idle)), idle, chicago(addDays(weekClose, 1))).state
  const full = lineOn(fullWeek, weekClose, 'steps')
  assert.ok(full > 0)
  assert.equal(lineOn(rested, weekClose, 'steps'), full, 'the pool met on the other days pays in full')
  assert.ok(lineOn(unrested, weekClose, 'steps') < full, 'without the Respite, the idle day falls short')
  // The Chronicle's week bar: a 70,000 pool with one rest day asks 60,000.
  const pace = stepPace([], 70_000, '2026-10-14', 1, undefined, ['2026-10-13'])
  assert.deepEqual([pace.pool, pace.rested, pace.daysElapsed], [60_000, 1, 2])
})

test('D-54: the Chronicle’s live Valor leaves the week’s rest days out of the step pace, so the Valor today’s battles lock is the one the close settles', () => {
  // 6,000 steps a day against a 50,000 pool; the rest day walks none.
  const idle = blank(ledgerWith('2026-09-10', 60, () => goodDay({ steps: 6_000 })), TODAY)
  const next = addDays(TODAY, 1)
  const open = settle(restToday(opened(idle)), idle, chicago(next)).state
  const parts = liveValorParts(open, idle, next)
  near(parts.steps, 12_000 / ((50_000 * 2) / 7), 1e-12)
  assert.equal(liveValor(open, idle, next), parts.valor)
  const closed = settle(open, idle, chicago(addDays(next, 1))).state
  near(valorOn(closed, next, 1), parts.valor, 1e-12)
})

test('D-54: the realm fights its day as usual, at a Valor of Realm Consistency, and the contract ends on its day', () => {
  const start = opened(blank(LEDGER, TODAY))
  const view = ordersView(start, 1, TODAY)
  const target = view.targets[0]?.hexId
  assert.ok(target, 'an assault target exists')
  const ordered = setOrders(start, { date: TODAY, assaultTarget: target, assault: [view.companies[0].id], defense: [] }).state
  const end = ordered.contracts.active?.endDate
  const rested = restToday(ordered)
  assert.equal(isRestDay(rested, TODAY), true)
  assert.equal(rested.contracts.active?.endDate, end, 'the contract still ends on its day')
  assert.equal(withdrawalPreview(rested, TODAY)?.daysElapsed, 2, 'the rest day is one of its days')
  assert.equal(valorOn(rested, TODAY, 1), realmConsistencyOn(rested, TODAY, 1))
  const threat = heraldView(rested, TODAY).lines.filter((l) => l.section === 'threat')
  assert.equal(threat[0]?.textId, 'herald.threat.rest')
  assert.ok(threat.length > 1, 'the day’s threats are still told')
  const result = settle(rested, blank(LEDGER, TODAY), chicago(addDays(TODAY, 1)))
  assert.ok(result.events.some((e) => e.day === TODAY && e.kind === 'assault' && e.hexId === target), 'the assault goes out')
  assert.ok(result.events.some((e) => e.day === TODAY && e.kind === 'defense'), 'the day’s threat is fought')
})

/** A Grand Battle announced at START for `battleDate`, not yet begun. */
function grandBattle(battleDate: string, setup?: BattleSetup): GrandBattle {
  return { id: 'gb-rest', trigger: 'incursion', hexId: '0,-1', announcedOn: START, battleDate, enemy: [], ...(setup ? { setup } : {}) }
}

test('D-54: a Grand Battle due on the rest day waits to the first free day after it, told as queued', () => {
  const start = { ...opened(), grandBattles: [grandBattle(TODAY)] }
  const rested = restToday(start)
  const [battle] = pendingBattles(rested)
  assert.ok(battle.battleDate > TODAY, `moved to ${battle.battleDate}`)
  const queued = rested.log.find((e) => e.kind === 'grandBattle' && e.stage === 'queued')
  assert.ok(queued && queued.kind === 'grandBattle' && queued.battleDate === battle.battleDate)
  // A rest day the close finds with a battle still due on it (one set without `takeRespite`) moves it too.
  const direct: CampaignState = {
    ...opened(),
    grandBattles: [grandBattle(TODAY)],
    contracts: { ...start.contracts, ...(start.contracts.active ? { active: { ...start.contracts.active, respiteDates: [TODAY] } } : {}) }
  }
  const closed = settle(direct, LEDGER, chicago(addDays(TODAY, 1))).state
  const waiting = closed.grandBattles.find((b) => b.id === 'gb-rest')
  assert.equal(waiting?.result, undefined, 'not fought on the rest day')
  assert.ok((waiting?.battleDate ?? '') > TODAY)
})

test('D-54: once today’s Grand Battle has begun, today can’t be a rest day; the day’s other fights don’t stop it', () => {
  const start = opened()
  const why = 'Today’s Grand Battle has begun, so today can’t be a rest day.'
  const begun: CampaignState = { ...start, grandBattles: [grandBattle(TODAY, {} as BattleSetup)] }
  assert.equal(respiteRefusal(begun, TODAY, TODAY), why)
  assert.deepEqual([takeRespite(begun, TODAY, TODAY).ok, takeRespite(begun, TODAY, TODAY).reason], [false, why])
  assert.equal(respiteRefusal(begun, START, TODAY), null, 'yesterday still can be one')
  const led: CampaignState = { ...start, skirmishes: [{ day: TODAY, valor: 1, fights: [] }] }
  assert.equal(respiteRefusal(led, TODAY, TODAY), null)
})
