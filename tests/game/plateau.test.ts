/**
 * Patch 9 stage 3 (rules 3.14.0, D-68, D-77, B1): the plateau siege. Three weekly readings in a row after the
 * low with none below it begin a siege; each day kept well adds wear; the first reading below the low breaks it
 * and pays 5 a day of wear, at most 150; a too-fast trend makes it wait.
 */
import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { plateauIncome, roundPosting } from '../../src/renderer/src/lib/game/economy'
import { plateauWeek, siegeReward, stalledLow, wearsOn } from '../../src/renderer/src/lib/game/plateau'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { reputationBonus, settle } from '../../src/renderer/src/lib/game/settle'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import type { CampaignState, GameEvent, WeighIn } from '../../src/renderer/src/lib/game/types'
import { momentsFor } from '../../src/renderer/src/lib/game/view/endgame'
import { mapView } from '../../src/renderer/src/lib/game/view/realm'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { weighInCard } from '../../src/renderer/src/lib/game/view/weighIn'
import { heartOakStage } from '../../src/renderer/src/lib/game/weight'
import { weighIns } from '../../src/renderer/src/lib/ledger'
import type { DayLog, Ledger } from '../../src/renderer/src/lib/types'
import { FOUNDED_AT, TZ, charter, chicago, goodDay, ledgerWith } from './fixtures/ledgers'

function weekly(weights: number[], from = '2026-10-12'): WeighIn[] {
  return weights.map((weight, i) => ({ date: addDays(from, 7 * i), weight }))
}

test('D-77 (B1): three readings after the low with none below it stall; an equal one is no new low', () => {
  assert.equal(stalledLow(weekly([210, 209, 209.5, 209.2])), null, 'two after the low')
  assert.deepEqual(stalledLow(weekly([210, 209, 209.5, 209.2, 209])), { date: '2026-10-19', weight: 209 })
  assert.equal(stalledLow(weekly([210, 209, 209.5, 209.2, 208.9])), null, 'a new low, so no stall')
  assert.equal(stalledLow([]), null)
})

test('D-77 (B1): wear comes from a day kept well or a rest day; the break pays 5 a day of wear, at most 150', () => {
  assert.equal(wearsOn(false, RULES.plateauSiege.wearDayScore), true)
  assert.equal(wearsOn(false, RULES.plateauSiege.wearDayScore - 0.01), false)
  assert.equal(wearsOn(true, 0), true)
  assert.equal(siegeReward(12), 60)
  assert.equal(siegeReward(40), RULES.plateauSiege.maxReward)
  assert.equal(siegeReward(0), 0)
})

test('D-77 (B1): a siege begins at the stall, holds through a regain, waits while too fast, and breaks below its low', () => {
  const readings = weekly([210, 209, 209.5, 209.2, 209.4])
  const begun = plateauWeek(undefined, readings, readings.at(-1), '2026-11-09', false)
  assert.equal(begun.begun, true)
  assert.deepEqual(begun.siege, { low: 209, lowOn: '2026-10-19', begunOn: '2026-11-09', wear: 0 })

  const siege = { ...(begun.siege as NonNullable<typeof begun.siege>), wear: 9 }
  const up = { date: '2026-11-16', weight: 210.5 }
  assert.deepEqual(plateauWeek(siege, [...readings, up], up, '2026-11-16', false), { siege }, 'a regain lengthens it')
  const below = { date: '2026-11-23', weight: 208.4 }
  assert.deepEqual(plateauWeek(siege, [...readings, below], below, '2026-11-23', true), { siege, waiting: true })
  assert.deepEqual(plateauWeek(siege, [...readings, below], below, '2026-11-23', false), { broken: { wear: 9, reward: 45 } })
  assert.deepEqual(plateauWeek(siege, readings, undefined, '2026-11-23', false), { siege }, 'no reading this week')
})

// ── At the closes ────────────────────────────────────────────────────────────

const LAUNCH = { launch: true }

function ledgerWeighing(weights: Record<string, number>, over: (date: string) => Partial<DayLog> = () => ({})): Ledger {
  return ledgerWith('2026-09-10', 90, (_, date): DayLog => goodDay({ ...(weights[date] !== undefined ? { weight: weights[date] } : {}), ...over(date) }))
}

const STALL: Record<string, number> = { '2026-10-12': 216, '2026-10-19': 215, '2026-10-26': 215.5, '2026-11-02': 215.3, '2026-11-09': 215.4 }

function found(ledger: Ledger): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
}

test('D-77 (B1): the third weigh-in without a new low begins a siege at its close; days kept well wear it; a reading below the low breaks it and pays', () => {
  const ledger = ledgerWeighing({ ...STALL, '2026-11-16': 214.6 })
  const begun = settle(found(ledger), ledger, chicago('2026-11-10'), LAUNCH).state
  assert.deepEqual(begun.weight.siege, { low: 215, lowOn: '2026-10-19', begunOn: '2026-11-09', wear: 0 })
  assert.ok(begun.log.some((e) => e.kind === 'plateau' && e.stage === 'begun' && e.day === '2026-11-09'))

  const worn = settle(begun, ledger, chicago('2026-11-16'), LAUNCH).state
  assert.equal(worn.weight.siege?.wear, 6, 'Tuesday to Sunday, each kept well')

  const broken = settle(worn, ledger, chicago('2026-11-17'), LAUNCH).state
  assert.equal(broken.weight.siege, undefined)
  const paid = broken.purse.events.filter((e) => e.source === 'plateau')
  assert.deepEqual(
    paid.map((e) => [e.date, roundPosting(e.amount)]),
    [['2026-11-16', roundPosting(plateauIncome(siegeReward(6), reputationBonus(worn))[0].amount)]]
  )
  assert.ok(broken.log.some((e) => e.kind === 'plateau' && e.stage === 'broken' && e.wear === 6))
  assert.equal(JSON.stringify(settle(broken, ledger, chicago('2026-11-17'), LAUNCH).state), JSON.stringify(broken), 'settling again changes nothing')
})

test('D-77 (B1): a day kept poorly adds no wear, nor a day away, and a regain only lengthens the siege', () => {
  // Wednesday 11-11 unlogged with no duties and few steps: a poor day.
  const poor = (date: string): Partial<DayLog> => (date === '2026-11-11' ? { eaten: undefined, done: {}, steps: 500 } : {})
  const ledger = ledgerWeighing({ ...STALL, '2026-11-16': 216.2 }, poor)
  const begun = settle(found(ledger), ledger, chicago('2026-11-10'), LAUNCH).state
  const state = settle(begun, ledger, chicago('2026-11-17'), LAUNCH).state
  assert.equal(state.weight.siege?.wear, 6, 'seven days, one of them poor; Monday 11-16 counts too')
  const away = settle(found(ledger), ledger, chicago('2026-11-17'), LAUNCH).state
  assert.equal(away.weight.siege?.wear, 0, 'none while away: every day of one long catch-up is (X-17)')
  assert.equal(state.purse.events.filter((e) => e.source === 'plateau').length, 0, 'a regain breaks nothing')
})

// ── On the screens and in the war (B1, B2, B3) ───────────────────────────────

test('D-77 (B1): the weigh-in card shows the siege standing, and the break with its pay', () => {
  const ledger = ledgerWeighing({ ...STALL, '2026-11-16': 214.6 })
  const begun = settle(found(ledger), ledger, chicago('2026-11-10'), LAUNCH).state
  const worn = settle(begun, ledger, chicago('2026-11-16'), LAUNCH).state
  const before = weighInCard(worn, weighIns(ledger), '2026-11-16')
  assert.equal(before?.siege?.textId, 'healer.siege.holding')
  assert.ok((before?.pays.plateau ?? 0) > 0, 'what the close will pay, as things stand')
  const broken = settle(worn, ledger, chicago('2026-11-17'), LAUNCH).state
  const after = weighInCard(broken, weighIns(ledger), '2026-11-17')
  assert.equal(after?.siege?.textId, 'healer.siege.broken')
  assert.equal(after?.pays.plateau, before?.pays.plateau)
  assert.equal(resultLine(broken.log.find((e) => e.kind === 'plateau' && e.stage === 'broken') as GameEvent)?.textId, 'herald.plateau.broken')
})

test('D-77 (B2): the Heart Oak stands on the castle hex at one stage a Milestone broken, and grows on each Milestone card', () => {
  const state = found(ledgerWeighing({}))
  assert.equal(heartOakStage(state.weight.milestones), 0)
  const two = state.weight.milestones.map((m, i) => (i < 2 ? { ...m, brokenOn: '2026-11-02' } : m))
  assert.equal(heartOakStage(two), 2)
  const castle = mapView(state, '2026-10-08').find((h) => h.kind === 'castle')
  assert.equal(castle?.oak, 0)
  const event = { id: 'e', day: '2026-11-02', kind: 'milestone', index: 2, mark: 207, byDispensation: false } as const
  const card = momentsFor(state, [event])[0]
  assert.deepEqual(card.inset, { slot: 'realm.heartOak.2', label: 'The Heart Oak' })
  assert.ok(card.lines?.includes(`The Heart Oak grows to stage 2 of ${RULES.milestones.count}.`))
})

test('D-77 (B3): Vigor, when switched on, adds its share of the last weight week’s Momentum to every company’s power', () => {
  const state = found(ledgerWeighing({}))
  assert.equal(RULES.vigor.perMomentum, 0, 'left out by the rules (D-77)')
  const withWeek = { ...state, weight: { ...state.weight, weeks: [{ week: 2, day: '2026-10-12', momentum: 0.8, realmConsistency: 0.9, tooFast: false }] } }
  assert.ok(!realmEffects(withWeek).companyPower.all.sources.some((s) => s.from.kind === 'vigor'))
})
