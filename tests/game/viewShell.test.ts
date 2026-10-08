/**
 * T14: the shell's view models (pages, the top bar, the Herald, the Homecoming), and Convention 6
 * across every view model: no hidden number (the benchmark, a rival's income, Steadiness, an
 * unrevealed treasury or army) reaches a screen.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { baseArmyValue } from '../../src/renderer/src/lib/game/combat'
import { benchmarkConsistency, benchmarkContractMultiplier, benchmarkIncome, holdings, rivalIncome } from '../../src/renderer/src/lib/game/rivals'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { RIVAL_IDS, type CampaignState } from '../../src/renderer/src/lib/game/types'
import { calorieWeek, healerCards, milestonePanel, stepPace } from '../../src/renderer/src/lib/game/view/chronicle'
import { contractPageView, lengthOptions, payoutPreview } from '../../src/renderer/src/lib/game/view/contract'
import { heraldView, homecomingView, pagesFor, topBarView } from '../../src/renderer/src/lib/game/view/shell'
import { steadiness } from '../../src/renderer/src/lib/game/weight'
import { accordView, coalitionView, ultimatumView } from '../../src/renderer/src/lib/game/world'
import { FOUNDED_AT, START, TZ, charter, chicago, ledgerWith } from './fixtures/ledgers'
import { realm, withCrossings } from './support/realm'

const LEDGER = ledgerWith('2026-09-10', 200)

function founded(): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: LEDGER }, FOUNDED_AT)
}

test('T14: the new pages appear only once a campaign exists', () => {
  assert.deepEqual(pagesFor(null), ['chronicle', 'contract', 'archive'])
  assert.deepEqual(pagesFor(realm()), ['chronicle', 'contract', 'archive', 'realm', 'diplomacy', 'armory'])
})

test('A-11 / Ch 9: the top bar shows the purse as a whole number, Realm Consistency and the Grace in plain words', () => {
  const state = founded()
  const bar = topBarView(state)
  assert.equal(bar.purse, 100)
  assert.equal(bar.realmConsistency, 0)
  assert.deepEqual(bar.grace, { level: 0, textId: 'herald.grace.0', text: "The Crown's Grace: none." })
  const later = settle(state, LEDGER, chicago(addDays(START, 14))).state
  const view = topBarView(later)
  assert.ok(view.realmConsistency > 0.9)
  assert.equal(view.realmConsistencyPercent, Math.round(view.realmConsistency * 100))
  assert.equal(view.week, 3)
  assert.equal(Number.isInteger(view.purse), true)
})

test('Ch 2 / Ch 10: the Herald gives today’s threat with its band, the exact strength only when revealed, and yesterday’s results', () => {
  const state = settle(founded(), LEDGER, chicago(addDays(START, 9))).state
  const today = addDays(START, 9)
  const herald = heraldView(state, today)
  const threat = herald.lines.find((l) => l.section === 'threat')
  assert.ok(threat, 'a threat at dawn')
  assert.match(String(threat.facts.strength), /^(weaker|matched|stronger|overwhelming)$/)
  assert.equal(threat.text.includes('{'), false, 'every placeholder filled')
  const spied = heraldView(withCrossings(state, { mageTowerMerchantHall: 2 }), today).lines.find((l) => l.section === 'threat')
  assert.match(String(spied?.facts.strength), /^\d+$/, 'the Spy Network reveals the exact strength')
  const results = herald.lines.filter((l) => l.section === 'result')
  assert.ok(results.length > 0, 'yesterday’s battle report')
  assert.ok(results.every((l) => l.textId.startsWith('battle.')))
})

test('A-45: after a 5-day jump the Homecoming lists all 5 days, plainly', () => {
  const state = settle(founded(), LEDGER, chicago(addDays(START, 2)), { launch: true }).state
  const r = settle(state, LEDGER, chicago(addDays(START, 7)), { launch: true })
  assert.equal(r.summary.homecoming, true)
  const view = homecomingView(r.summary, 3)
  assert.equal(view.daysSettled, 5)
  assert.deepEqual(view.days.map((d) => d.day), [2, 3, 4, 5, 6].map((i) => addDays(START, i)))
  assert.equal(view.heldCount, r.summary.held.length)
  assert.equal(view.healer, undefined, 'the Healer speaks after 14 days away, not 5')
  const away = homecomingView({ ...r.summary, awayDays: 20 }, 3)
  assert.equal(away.healer?.textId, 'healer.comingBack')
  assert.equal(away.suggestedTermDays, 3)
})

/** Every key and number in a view, recursively. */
function walk(value: unknown, keys: string[], numbers: number[]): void {
  if (typeof value === 'number') numbers.push(value)
  else if (Array.isArray(value)) value.forEach((v) => walk(v, keys, numbers))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k)
      walk(v, keys, numbers)
    }
  }
}

test('Convention 6: no view model carries the benchmark, a rival’s income, Steadiness, or an unrevealed treasury or army', () => {
  const state = settle(founded(), LEDGER, chicago(addDays(START, 70))).state
  const today = addDays(START, 70)
  const week = state.settledThrough.week
  const hidden = [
    benchmarkIncome(benchmarkConsistency(week, state.weight.grace), benchmarkContractMultiplier(week)),
    ...RIVAL_IDS.map((r) => rivalIncome(state, r, week)),
    steadiness(state.weight.weeks) as number,
    ...RIVAL_IDS.map((r) => holdings(state.rivals[r])),
    ...RIVAL_IDS.map((r) => baseArmyValue(state, r))
  ].filter((n) => Number.isFinite(n) && n !== 0)
  const views = [
    topBarView(state, today),
    heraldView(state, today),
    contractPageView(state, today),
    lengthOptions(state),
    payoutPreview(state, 3, 20),
    milestonePanel(state, [], today),
    healerCards(state, today),
    stepPace([], 50_000, today, 1),
    calorieWeek([], 2_000, 1_500, today, 1),
    coalitionView(state, today),
    ultimatumView(state, today),
    ...RIVAL_IDS.map((r) => accordView(state, r, 0.9, today))
  ]
  const keys: string[] = []
  const numbers: number[] = []
  walk(views, keys, numbers)
  const forbidden = keys.filter((k) => /benchmark|income|steadiness|treasury|warchest|ratio|army/i.test(k))
  assert.deepEqual(forbidden, [])
  for (const h of hidden) {
    const leaked = numbers.filter((n) => n === h || (Math.abs(h) >= 10 && Math.round(n * 10) === Math.round(h * 10)))
    assert.deepEqual(leaked, [], `the hidden value ${h} reached a view`)
  }
})
