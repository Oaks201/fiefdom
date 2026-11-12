/**
 * Patch 9 stage 2b (rules 3.13.0, D-68, D-76, H3): the Healer's requests. At each week close from week 2 she
 * asks one small step on the weakest habit of the last two weeks; met pays 15 at that day's close and every
 * fourth banks a Respite day; missed costs nothing.
 */
import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { healerRequestIncome, roundPosting } from '../../src/renderer/src/lib/game/economy'
import { banksRespite, chooseRequest, habitFigure, requestMet, type HabitDay } from '../../src/renderer/src/lib/game/healer'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { reputationBonus, settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, HealerHabit } from '../../src/renderer/src/lib/game/types'
import { healerAudience, healerRequestView } from '../../src/renderer/src/lib/game/view/healer'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { weighIns } from '../../src/renderer/src/lib/ledger'
import type { DayLog, Ledger } from '../../src/renderer/src/lib/types'
import { FOUNDED_AT, TZ, charter, chicago, goodDay, ledgerWith } from './fixtures/ledgers'

/** Each settle a launch, as the app's are, so the player is never away (X-17). */
const LAUNCH = { launch: true }

const TERMS = { stepPool: 70_000, calorieLimit: 2_000, floor: 1_500 }

function day(i: number, over: Partial<HabitDay> = {}): HabitDay {
  return { date: addDays('2026-10-12', i), steps: 10_000, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3, rest: false, terms: TERMS, ...over }
}

function week(make: (i: number) => Partial<HabitDay> = () => ({}), from = 0): HabitDay[] {
  return Array.from({ length: 7 }, (_, i) => day(from + i, make(i)))
}

function found(ledger: Ledger): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
}

// ── Choosing the request ─────────────────────────────────────────────────────

test('D-76 (H3): she asks after the weakest habit of the last two weeks, one day more than last week', () => {
  const read = [...week((i) => (i < 3 ? { eaten: undefined } : {})), ...week((i) => (i < 2 ? { eaten: undefined } : {}), 7)]
  const ask = chooseRequest(read, read.slice(7), new Set())
  assert.deepEqual(ask, { habit: 'foodLogged', target: 6, last: 5 }, 'food logged on 9 of 14: log food on 6 after 5')
})

test('D-76 (H3): a day logged over the limit, or under 90% of the floor, is not within it', () => {
  const read = week((i) => (i === 0 ? { eaten: 2_300 } : i === 1 ? { eaten: 1_200 } : {}))
  const ask = chooseRequest(read, read, new Set())
  assert.deepEqual(ask, { habit: 'withinLimit', target: 6, last: 5 })
})

test('D-76 (H3): the steps ask 10 points more of the pool than last week walked, and never more than all of it', () => {
  const read = week(() => ({ steps: 7_000 }))
  assert.deepEqual(chooseRequest(read, read, new Set()), { habit: 'steps', target: 80, last: 70 })
  const most = week(() => ({ steps: 9_500 }))
  assert.equal(habitFigure('steps', most), 95)
  assert.deepEqual(chooseRequest(most, most, new Set()), { habit: 'steps', target: 100, last: 95 })
})

test('D-76 (H3): a week at its best is asked to hold, ties falling food, the limit, steps, duties', () => {
  const perfect = week()
  assert.deepEqual(chooseRequest(perfect, perfect, new Set()), { habit: 'foodLogged', target: 7, last: 7 })
  assert.deepEqual(chooseRequest(perfect, perfect, new Set<HealerHabit>(['foodLogged', 'withinLimit'])), { habit: 'steps', target: 100, last: 100 })
})

test('D-76 (H3): she leaves a habit a ruler dared that week to him, and the duties out when none was sworn', () => {
  const read = week((i) => (i < 4 ? { eaten: undefined, dutiesKept: 0 } : {}))
  assert.equal(chooseRequest(read, read, new Set())?.habit, 'foodLogged')
  assert.equal(chooseRequest(read, read, new Set<HealerHabit>(['foodLogged', 'withinLimit']))?.habit, 'duties')
  const unsworn = week((i) => ({ dutiesKept: 0, dutiesSworn: 0, ...(i < 1 ? { eaten: undefined } : {}) }))
  assert.equal(chooseRequest(unsworn, unsworn, new Set<HealerHabit>(['foodLogged', 'withinLimit', 'steps'])), null)
})

test('D-76 (H3, D-54): a rest day counts as kept, and leaves the pool', () => {
  const rested = week((i) => (i === 3 ? { rest: true, eaten: undefined, steps: 0 } : { steps: 8_000 }))
  assert.equal(habitFigure('foodLogged', rested), 7)
  // 6 days of 8,000 against 70,000 less a day's share (60,000): 80%.
  assert.equal(habitFigure('steps', rested), 80)
  assert.equal(chooseRequest([day(0, { rest: true })], [day(0, { rest: true })], new Set()), null, 'nothing to read in rest alone')
})

test('D-76 (H3): a request is met once its days reach it, and stays met', () => {
  const q = { habit: 'steps' as const, target: 80 }
  const days = week(() => ({ steps: 20_000 }))
  assert.equal(requestMet(q, days.slice(0, 2)), false, '40,000 of 70,000 is 57%')
  assert.equal(requestMet(q, days.slice(0, 3)), true, '60,000 is 85%')
  assert.equal(requestMet({ habit: 'foodLogged', target: 5 }, week((i) => (i % 2 ? { eaten: undefined } : {}))), false, 'four days of seven')
  assert.equal(banksRespite(RULES.healer.requests.respiteEvery), true)
  assert.equal(banksRespite(RULES.healer.requests.respiteEvery + 1), false)
})

// ── At the closes ────────────────────────────────────────────────────────────

/** Good days with food left unlogged on the days `unlogged` picks; no weigh-ins. */
function ledgerUnlogged(unlogged: (date: string) => boolean): Ledger {
  return ledgerWith('2026-09-10', 80, (_, date): DayLog => (unlogged(date) ? goodDay({ eaten: undefined }) : goodDay()))
}

test('D-76 (H3): her first request comes at the close of week 2, for the week ahead; met, it pays 15 at that day’s close', () => {
  // Food unlogged on Tuesdays and Thursdays: food logged is the weakest habit, 5 days of 7.
  const ledger = ledgerUnlogged((d) => [2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
  const week1 = settle(found(ledger), ledger, chicago('2026-10-12'), LAUNCH).state
  assert.equal(week1.weight.request, undefined, 'none at the close of week 1')
  const asked = settle(week1, ledger, chicago('2026-10-19'), LAUNCH).state
  const made = asked.log.find((e) => e.kind === 'healerRequest' && e.stage === 'made')
  assert.ok(made && made.kind === 'healerRequest')
  assert.equal(made.day, '2026-10-18', 'made at the week close')
  assert.deepEqual(asked.weight.request, { madeOn: '2026-10-18', until: '2026-10-25', habit: 'foodLogged', target: 6, last: 5 })

  // Log every day of the week ahead: the sixth logged day is Saturday 10-24, and its close pays.
  const kept = ledgerUnlogged((d) => d < '2026-10-19' && [2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
  const friday = settle(asked, kept, chicago('2026-10-24'), LAUNCH).state
  assert.equal(friday.weight.request?.habit, 'foodLogged', 'still open through Friday: 5 logged')
  const saturday = settle(friday, kept, chicago('2026-10-25'), LAUNCH).state
  const paid = saturday.purse.events.filter((e) => e.source === 'healerRequest')
  assert.deepEqual(
    paid.map((e) => [e.date, e.amount]),
    [['2026-10-24', roundPosting(healerRequestIncome(reputationBonus(friday))[0].amount)]]
  )
  assert.equal(saturday.weight.request?.metOn, '2026-10-24', 'kept, met, until the week close asks again')
  assert.equal(saturday.weight.requestsMet, 1)
  assert.ok(saturday.log.some((e) => e.kind === 'healerRequest' && e.stage === 'met' && e.day === '2026-10-24'))
  assert.equal(JSON.stringify(settle(saturday, kept, chicago('2026-10-25'), LAUNCH).state), JSON.stringify(saturday), 'settling again changes nothing')
})

test('D-76 (H3): a request missed costs nothing, and the next week close asks again', () => {
  const ledger = ledgerUnlogged((d) => [2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
  const before = settle(found(ledger), ledger, chicago('2026-10-19'), LAUNCH).state
  const after = settle(before, ledger, chicago('2026-10-26'), LAUNCH).state
  assert.ok(after.log.some((e) => e.kind === 'healerRequest' && e.stage === 'missed' && e.until === '2026-10-25'))
  assert.equal(after.purse.events.filter((e) => e.source === 'healerRequest').length, 0)
  assert.equal(after.weight.request?.madeOn, '2026-10-25', 'a new one for the week ahead')
  assert.equal(after.weight.requestsMet ?? 0, 0)
})

test('D-76 (H3): every fourth request met banks a Respite day, up to the bank’s cap', () => {
  const ledger = ledgerWith('2026-09-10', 90, () => goodDay())
  let state = found(ledger)
  for (let d = '2026-10-12'; d <= '2026-11-17'; d = addDays(d, 1)) state = settle(state, ledger, chicago(d), LAUNCH).state
  const met = state.log.filter((e) => e.kind === 'healerRequest' && e.stage === 'met')
  assert.ok(met.length >= RULES.healer.requests.respiteEvery, `${met.length} met`)
  const fourth = met[RULES.healer.requests.respiteEvery - 1]
  assert.ok(fourth.kind === 'healerRequest')
  assert.equal(met.filter((e) => e.kind === 'healerRequest' && e.respite).length <= 1, true)
  // The bank was below its cap at the fourth only if a day was banked for it.
  if (fourth.respite) assert.ok(state.contracts.respiteBank >= 1)
  assert.ok(met.slice(0, RULES.healer.requests.respiteEvery - 1).every((e) => e.kind === 'healerRequest' && !e.respite))
})

// ── On the screens (H3, H4) ──────────────────────────────────────────────────

test('D-76 (H3): the request card reads the week live, and says what meeting it pays', () => {
  const ledger = ledgerUnlogged((d) => [2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
  const asked = settle(found(ledger), ledger, chicago('2026-10-19'), LAUNCH).state
  const view = healerRequestView(asked, ledger, '2026-10-19')
  assert.ok(view)
  assert.equal(view.habit, 'foodLogged')
  assert.equal(view.unit, 'days')
  assert.equal(view.soFar, 1, 'Monday logged, live, before its close')
  assert.equal(view.met, false)
  assert.equal(view.ask.textId, 'healer.request.foodLogged')
  assert.match(view.ask.text, /log food on 6 of its 7 days/)
  assert.equal(view.reward, roundPosting(healerRequestIncome(reputationBonus(asked))[0].amount))
  assert.equal(view.toRespite, RULES.healer.requests.respiteEvery)
  assert.equal(healerRequestView(asked, ledger, '2026-10-18'), null, 'not before its week')
})

test('D-76 (H3): a request at its most asks to hold, in the hold line', () => {
  const ledger = ledgerWith('2026-09-10', 80, () => goodDay())
  const asked = settle(found(ledger), ledger, chicago('2026-10-19'), LAUNCH).state
  const view = healerRequestView(asked, ledger, '2026-10-19')
  assert.equal(view?.ask.textId, 'healer.request.hold')
  assert.match(view?.ask.text ?? '', /food logged on every day again/)
})

test('D-76 (H3): the Herald tells a request made and met, and never a miss', () => {
  const made = { id: 'e', day: '2026-10-18', kind: 'healerRequest', habit: 'steps', stage: 'made', target: 80, until: '2026-10-25' } as const
  assert.equal(resultLine(made)?.textId, 'herald.healer.request')
  assert.equal(resultLine({ ...made, stage: 'met', reward: 15 })?.textId, 'herald.healer.requestMet')
  assert.equal(resultLine({ ...made, stage: 'met', reward: 15, respite: true })?.textId, 'herald.healer.requestMetRespite')
  assert.equal(resultLine({ ...made, stage: 'missed' }), null)
})

test('D-76 (H4): her Audience answers from the rules: the floor, losing faster, rest; the scale only when it went up', () => {
  const weights: Record<string, number> = { '2026-10-12': 216, '2026-10-19': 215.2, '2026-10-26': 215.8 }
  const ledger = ledgerWith('2026-09-10', 80, (_, date) => goodDay(weights[date] !== undefined ? { weight: weights[date] } : {}))
  const state = settle(found(ledger), ledger, chicago('2026-10-27'), LAUNCH).state
  const lb = weighIns(ledger)
  const view = healerAudience(state, ledger, lb, '2026-10-27')
  const ids = view.questions.map((q) => q.id)
  assert.deepEqual(ids, ['doing', 'floor', 'scaleUp', 'next', 'faster', 'rest'])
  const answer = (id: string): string => view.questions.find((q) => q.id === id)?.answer.map((a) => a.textId).join(' ') ?? ''
  assert.match(answer('floor'), /^healer\.audience\.floor/)
  assert.equal(answer('faster'), 'healer.audience.faster')
  assert.match(answer('rest'), /^healer\.audience\.rest/)
  assert.match(view.questions.find((q) => q.id === 'faster')?.answer[0].text ?? '', /Momentum is held at half/)
  const down = healerAudience(state, ledger, lb.filter((w) => w.date < '2026-10-26'), '2026-10-25')
  assert.ok(!down.questions.some((q) => q.id === 'scaleUp'), 'no question about the scale going up when it went down')
  assert.equal(healerAudience(state, ledger, [], '2026-10-27').opening.textId, 'healer.audience.noReading')
})
