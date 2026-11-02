/**
 * Patch 9 stage 1 (rules 3.11.0, D-68, D-69): the weigh-in moment and the Healer's terms.
 * W1 the weight week settles at the close of the day its weigh-in came in; W4 Faithful at the Scale;
 * H2 the Healer's terms; W2 and W3 the weigh-in card, its chart and waystones; H1 the Healer's report.
 */
import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { faithfulIncome, roundPosting } from '../../src/renderer/src/lib/game/economy'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { reputationBonus, settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import { healerTermsView, reportSituation, weighInCard } from '../../src/renderer/src/lib/game/view/weighIn'
import { counselCalories, counselMaintenance, counselSteps, type StepWeek } from '../../src/renderer/src/lib/game/weight'
import { weighIns } from '../../src/renderer/src/lib/ledger'
import type { DayLog, Ledger } from '../../src/renderer/src/lib/types'
import { FOUNDED_AT, TZ, charter, chicago, goodDay, ledgerWith, steadyLedger, withDay } from './fixtures/ledgers'

function found(ledger: Ledger): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
}

const LEDGER = steadyLedger('2026-09-10', 70)

/** Mondays' weigh-ins only (weeks start on Monday in the fixtures), good days otherwise; `skip` leaves weeks out. */
function mondaysLedger(weights: Record<string, number>): Ledger {
  return ledgerWith('2026-09-10', 70, (_, date): DayLog => goodDay(weights[date] !== undefined ? { weight: weights[date] } : {}))
}

const MONDAYS: Record<string, number> = {
  '2026-09-14': 219,
  '2026-09-21': 218.4,
  '2026-09-28': 217.6,
  '2026-10-05': 217,
  '2026-10-12': 216.2,
  '2026-10-19': 215.4,
  '2026-10-26': 214.6,
  '2026-11-02': 213.8
}

function lb(ledger: Ledger): { date: string; weight: number }[] {
  return weighIns(ledger)
}

// ── W1: the weigh-in settles its weight week ─────────────────────────────────

test('D-69 (W1): Monday’s weigh-in settles its weight week at that day’s close, Momentum paid then; the week close pays none', () => {
  const monday = settle(found(LEDGER), LEDGER, chicago('2026-10-13')).state
  const week2 = monday.weight.weeks.find((w) => w.week === 2)
  assert.equal(week2?.day, '2026-10-12', 'week 2 settled at its Monday weigh-in’s close')
  assert.equal(typeof week2?.qw, 'number')
  const paid = monday.purse.events.filter((e) => e.source === 'momentum' && e.date === '2026-10-12')
  assert.equal(paid.length, 1)
  assert.equal(monday.settlement.snapshots.find((s) => s.date === '2026-10-12')?.paid?.momentum, roundPosting(paid[0].amount))
  assert.ok(monday.weight.counsel?.week === 2, 'the Healer’s terms are set with it')

  const sunday = settle(monday, LEDGER, chicago('2026-10-19')).state
  const close = sunday.purse.events.filter((e) => e.date === '2026-10-18')
  assert.ok(close.some((e) => e.source === 'steps'), 'the week close still pays its other lines')
  assert.ok(!close.some((e) => e.source === 'momentum'), 'and no Momentum: it was paid on Monday')
  assert.equal(sunday.weight.weeks.filter((w) => w.week === 2).length, 1, 'one record for the week')
  assert.equal(JSON.stringify(settle(sunday, LEDGER, chicago('2026-10-19')).state), JSON.stringify(sunday), 'settling again changes nothing')
})

test('D-69 (W1): week 1 and a week whose weigh-in never came settle at their week close, as before', () => {
  const missing = { ...MONDAYS }
  delete missing['2026-10-19']
  const ledger = mondaysLedger(missing)
  const state = settle(found(ledger), ledger, chicago('2026-10-27')).state
  assert.deepEqual(
    state.weight.weeks.map((w) => [w.week, w.day]),
    [
      [1, '2026-10-11'],
      [2, '2026-10-12'],
      [3, '2026-10-25'],
      [4, '2026-10-26']
    ]
  )
  assert.ok(state.purse.events.some((e) => e.source === 'momentum' && e.date === '2026-10-25'), 'the week with no weigh-in paid Momentum at its close')
})

test('D-69 (W1): a weigh-in corrected inside the grace window pays the Momentum it now earns, and never takes any back (A-02)', () => {
  const flat = mondaysLedger({ ...MONDAYS, '2026-10-12': 217, '2026-10-05': 217.2, '2026-09-28': 217.4 })
  const before = settle(found(flat), flat, chicago('2026-10-13')).state
  const paid = before.settlement.snapshots.find((s) => s.date === '2026-10-12')?.paid?.momentum ?? 0
  assert.ok(paid < RULES.reputation.weekly.momentum, `a slow week pays part of Momentum (${paid})`)
  const lower = withDay(flat, '2026-10-12', (d) => ({ ...d, weight: 215.6 }))
  const after = settle(before, lower, chicago('2026-10-13', 600)).state
  const adjust = after.purse.events.find((e) => e.source === 'correction:momentum:2026-10-12')
  assert.ok(adjust && adjust.amount > 0, 'the corrected weigh-in pays more Momentum')
  const higher = withDay(flat, '2026-10-12', (d) => ({ ...d, weight: 218 }))
  const back = settle(before, higher, chicago('2026-10-13', 600)).state
  assert.ok(!back.purse.events.some((e) => e.source === 'correction:momentum:2026-10-12'), 'a heavier correction takes nothing back')
})

// ── W4: Faithful at the Scale ────────────────────────────────────────────────

test('D-69 (W4): each week’s weigh-in pays Faithful at the Scale, 2 more for each week in a row before it, up to +10, whatever the scale says', () => {
  const up = mondaysLedger({ ...MONDAYS, '2026-10-26': 219 })
  const state = settle(found(up), up, chicago('2026-11-03')).state
  const bonus = reputationBonus(state)
  const faithful = state.purse.events.filter((e) => e.source === 'faithful')
  // Week 1 counts the founding Monday's weigh-in, from before the campaign began: it pays nothing.
  assert.deepEqual(
    faithful.map((e) => e.date),
    ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
  )
  assert.deepEqual(
    faithful.map((e) => e.amount),
    [0, 1, 2, 3].map((streak) => roundPosting(faithfulIncome(streak, bonus)[0].amount))
  )
  assert.ok(faithful[2].amount > faithful[1].amount, 'a week the weight went up pays all the same')
  assert.deepEqual(state.weight.faithful, { streak: 4, paidWeek: 5 })
  assert.equal(faithfulIncome(99, 0)[0].amount, RULES.faithful.base + RULES.faithful.maxBonus, 'the bonus stops at +10')
})

test('D-69 (W4): a week with no weigh-in ends the streak at its close, but a week away holds it (A-10, X-17)', () => {
  const gap = { ...MONDAYS }
  delete gap['2026-10-26']
  const ledger = mondaysLedger(gap)
  // Launched on 10-20, so the week close of 11-01 is 12 days on: not away, and the streak ends.
  const home = settle(settle(found(ledger), ledger, chicago('2026-10-20'), { launch: true }).state, ledger, chicago('2026-11-03'), { launch: true }).state
  const homeLast = home.purse.events.filter((e) => e.source === 'faithful').at(-1)
  assert.equal(homeLast?.date, '2026-11-02')
  assert.equal(homeLast?.amount, roundPosting(faithfulIncome(0, reputationBonus(home))[0].amount))
  // Last launched on 10-13, the week close of 11-01 is 19 days on: away, and the streak holds at 2.
  const away = settle(settle(found(ledger), ledger, chicago('2026-10-13'), { launch: true }).state, ledger, chicago('2026-11-03'), { launch: true }).state
  const awayLast = away.purse.events.filter((e) => e.source === 'faithful').at(-1)
  assert.equal(awayLast?.amount, roundPosting(faithfulIncome(2, reputationBonus(away))[0].amount))
})

test('D-69 (W4): a save from before 3.11.0 starts Faithful at the Scale with the streak its weigh-ins already earned', () => {
  const state = settle(found(LEDGER), LEDGER, chicago('2026-10-26')).state
  const old: CampaignState = { ...state, weight: { ...state.weight, faithful: undefined } }
  const next = settle(old, LEDGER, chicago('2026-10-27')).state
  const pay = next.purse.events.filter((e) => e.source === 'faithful').at(-1)
  assert.equal(pay?.date, '2026-10-26')
  assert.equal(pay?.amount, roundPosting(faithfulIncome(2, reputationBonus(next))[0].amount), 'weeks 2 and 3 had weigh-ins')
})

// ── H2: the Healer's terms ───────────────────────────────────────────────────

test('D-69 (H2): the calorie limit aims at the target pace from maintenance, never more than 500 under the logged average, 100 a week at most, never under the floor', () => {
  const logs = (maintenance: number, logged: number | null = 2_050) => ({ source: 'logs' as const, maintenance, logged })
  assert.equal(counselCalories(logs(2_550), 0.8, 1_550), 2_150, 'ahead: the book’s Ch 4 example, more room')
  assert.equal(counselCalories(logs(2_450), 0.8, 1_450), 2_050, 'on pace: what is eaten now')
  assert.equal(counselCalories(logs(2_200), 0.8, 1_200), 1_800, 'behind')
  assert.equal(counselCalories(logs(2_200), 0.8, 1_200, 2_000), 1_900, 'reached 100 a week')
  // D-70 (T-11): last week's figure stands while the fresh one is within 150 of it.
  assert.equal(counselCalories(logs(2_500), 0.8, 1_500, 2_000), 2_000, '2,100 is within 150 of 2,000: held')
  assert.equal(counselCalories(logs(2_550), 0.8, 1_550, 2_000), 2_100, '2,150 is 150 away: it moves, 100 at most')
  assert.equal(counselCalories(logs(2_500), 0.8, 2_050, 2_000), 2_050, 'a held figure never sits under a risen floor')
  assert.equal(counselCalories(logs(1_800), 0.8, 1_200), 1_550, 'gaining: held to 500 under the logged average')
  assert.equal(counselCalories({ source: 'mifflin', maintenance: 1_500, logged: null }, 0.8, 1_200), 1_200, 'never under the floor')
  assert.equal(counselCalories(logs(1_430, null), 0.8, 1_300, 1_500), 1_400, 'the floor stands under the smoothing too')
  assert.equal(counselCalories(logs(2_480), 0, 1_480), 2_500, 'near the goal: maintenance itself, rounded to 50')
  assert.equal(counselCalories({ source: 'minimum', maintenance: null, logged: null }, 0.8, 1_200), null)
})

test('D-69 (H2): maintenance reads 35 days of logs and the weekly trend, else Fitbit’s burned, else the formula', () => {
  const days = Array.from({ length: 35 }, (_, i) => ({ date: addDays('2026-10-01', i), eaten: 2_000, burned: 2_600 }))
  const weekly = [0, 7, 14, 21, 28].map((k) => ({ date: addDays('2026-10-01', k + 3), weight: 210 - k / 7 }))
  const fromLogs = counselMaintenance(days, weekly, '2026-11-04')
  assert.equal(fromLogs.source, 'logs')
  assert.ok(Math.abs((fromLogs.maintenance ?? 0) - 2_500) < 1, `2,000 logged + 1 lb a week × 500 (${fromLogs.maintenance})`)
  const twoReadings = counselMaintenance(days, weekly.slice(-2), '2026-11-04')
  assert.equal(twoReadings.source, 'burned', 'fewer than 3 weekly weigh-ins: Fitbit’s burned')
  assert.equal(counselMaintenance([], [], '2026-11-04', { sex: 'male', birthYear: 1990, heightCm: 180, weightLb: 210 }).source, 'mifflin')
  assert.equal(counselMaintenance([], [], '2026-11-04').source, 'minimum')
})

test('D-69 (H2): the step pool rises 5% after 3 of 4 weeks met, holds after 2, eases toward the median after fewer, never past 105,000', () => {
  const weeks = (walked: number[], met: boolean[]): StepWeek[] => walked.map((w, i) => ({ walked: w, met: met[i] }))
  assert.equal(counselSteps(70_000, weeks([74_000, 71_000, 68_000, 76_000], [true, true, false, true])), 74_000)
  assert.equal(counselSteps(70_000, weeks([72_000, 71_000, 70_500, 73_200], [true, true, true, true])), 73_000, 'never above the best week')
  assert.equal(counselSteps(70_000, weeks([72_000, 71_000, 60_000, 62_000], [true, true, false, false])), 70_000, 'held')
  assert.equal(counselSteps(70_000, weeks([52_000, 61_000, 58_000, 66_000], [false, false, false, false])), 63_000, 'no more than 10% under the pool')
  assert.equal(counselSteps(70_000, weeks([64_000, 66_000, 65_000, 69_000], [false, false, false, false])), 65_000, 'the median, rounded down')
  assert.equal(counselSteps(104_000, weeks([120_000, 120_000, 120_000, 120_000], [true, true, true, true])), 105_000, 'capped')
  assert.equal(counselSteps(150_000, weeks([160_000, 160_000, 160_000, 160_000], [true, true, true, true])), 150_000, 'the cap never lowers a pool')
  assert.equal(counselSteps(70_000, weeks([74_000, 71_000, 76_000], [true, true, true])), null, 'fewer than 4 weeks')
})

test('D-69 (H2): settled weeks set the Healer’s terms, and the terms view says each in plain words', () => {
  const state = settle(found(LEDGER), LEDGER, chicago('2026-11-03')).state
  const c = state.weight.counsel
  assert.ok(c)
  assert.equal(c.week, state.weight.weeks.at(-1)?.week)
  assert.equal(c.source, 'logs')
  assert.ok(c.calorieLimit !== undefined && c.calorieLimit >= (state.weight.healerFloor ?? 0) && c.calorieLimit % RULES.healer.roundTo === 0)
  assert.ok(c.stepPool !== undefined && c.stepPool % RULES.healer.counsel.steps.roundTo === 0)
  const view = healerTermsView(state)
  assert.ok(view)
  assert.deepEqual(view.lines.map((l) => l.textId), ['healer.terms.calories', 'healer.terms.steps'])
  for (const l of view.lines) assert.ok(!l.text.includes('{') && !l.text.startsWith('[missing'), l.text)
  assert.equal(healerTermsView(found(LEDGER)), null, 'none before the first weight week')
})

// ── W2, W3 and H1: the weigh-in card ─────────────────────────────────────────

test('D-69 (W2): on the weigh-in day the card shows what the close will pay, and the close pays exactly that', () => {
  const sunday = settle(found(LEDGER), LEDGER, chicago('2026-10-19')).state
  const before = weighInCard(sunday, lb(LEDGER), '2026-10-19')
  assert.ok(before)
  assert.equal(before.date, '2026-10-19')
  assert.equal(before.settled, false)
  assert.equal(before.settlesOn, '2026-10-19')
  const after = settle(sunday, LEDGER, chicago('2026-10-20')).state
  const settled = weighInCard(after, lb(LEDGER), '2026-10-20')
  assert.ok(settled)
  assert.equal(settled.settled, true)
  assert.equal(settled.pays.momentum, before.pays.momentum, 'Momentum as previewed')
  assert.equal(settled.pays.faithful, before.pays.faithful, 'Faithful as previewed')
  assert.equal(settled.report.situation, before.report.situation)
  assert.ok(!settled.report.text.includes('{'), settled.report.text)
})

test('D-69 (W3): waystones are the whole pounds between the last Milestone mark and the next, lit by a weekly weigh-in at or under them', () => {
  // 217 → 168: Milestone 1 at 212. Weigh-ins down to 213.8 light 216, 215 and 214; 213 waits.
  const ledger = mondaysLedger({ ...MONDAYS, '2026-11-02': 213.8 })
  const state = settle(found(ledger), ledger, chicago('2026-11-02')).state
  const card = weighInCard(state, lb(ledger), '2026-11-02')
  assert.ok(card?.next)
  assert.equal(card.next.index, 1)
  assert.equal(card.next.mark, 212)
  assert.deepEqual(
    card.waystones.map((w) => [w.mark, w.lit, w.fresh]),
    [
      [216, true, false],
      [215, true, false],
      [214, true, true],
      [213, false, false]
    ]
  )
  assert.equal(card.next.toGo, 1.8)
  assert.ok(card.next.weekAtPace !== null && card.next.weekAtPace >= card.next.earliestWeek)
  assert.equal(card.chart.readings.at(-1)?.weight, 213.8)
  assert.equal(card.chart.ahead.length, 8)
  assert.ok(card.chart.ahead.every((a) => a.tooFast < a.pace), 'the too-fast line runs under the target pace')
})

test('D-69 (H1): the report names the trend against the target pace', () => {
  const at = (r: number | null, extra: { tooFast?: boolean; maintenance?: boolean } = {}) => reportSituation({ r, target: 0.8, tooFast: false, maintenance: false, ...extra })
  assert.equal(at(null), 'notEnough')
  assert.equal(at(2.5, { tooFast: true }), 'tooFast')
  assert.equal(at(0.1, { maintenance: true }), 'nearGoal')
  assert.equal(at(-0.4), 'up')
  assert.equal(at(0.1), 'flat')
  assert.equal(at(0.5), 'behind')
  assert.equal(at(0.8), 'onPace')
  assert.equal(at(1.0), 'onPace')
  assert.equal(at(1.1), 'ahead')
})
