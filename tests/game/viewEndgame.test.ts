/**
 * T16: the endgame's view models (Ch 13, Ch 14, Ch 16, D-01, A-172, A-176): proposing an Accord,
 * the coalition and Ultimatum banners with no hidden numbers, bending the knee once, the Siege won
 * (Humbled) and lost (the Fall), victory and the Reign, and the cards those events raise.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { sealContract } from '../../src/renderer/src/lib/game/contractActions'
import { applyScenario } from '../../src/renderer/src/lib/game/dev/scenarios'
import { begin } from '../../src/renderer/src/lib/game/grand'
import { playerPower, rivalPower } from '../../src/renderer/src/lib/game/rivals'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { RIVAL_IDS, type CampaignState, type GrandBattle } from '../../src/renderer/src/lib/game/types'
import { bendTheKnee, sealAccord } from '../../src/renderer/src/lib/game/world'
import { contractPageView } from '../../src/renderer/src/lib/game/view/contract'
import { accordPanel, coalitionBanners, endgameView, momentsFor, ultimatumBanners } from '../../src/renderer/src/lib/game/view/endgame'
import { playOut } from './support/grand'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { realm, withCastle } from './support/realm'

const ledger = ledgerWith('2026-09-10', 160)

function fresh(over: (s: CampaignState) => CampaignState = (s) => s): CampaignState {
  return settle(over(realm(7, ledger)), ledger, chicago('2026-10-08')).state
}

function respectful(state: CampaignState, respect: number): CampaignState {
  return { ...state, rivals: Object.fromEntries(RIVAL_IDS.map((r) => [r, { ...state.rivals[r], respect }])) as CampaignState['rivals'] }
}

function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value)
  else if (typeof value === 'string') for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, out))
  return out
}

test('D-01: proposing an Accord while a contract runs is refused with a clear reason; with the slot free it seals and shows on the Contract page', () => {
  // A week of good days settled, so Realm Consistency (and the Accord's expected Respect) is above 0.
  const state = settle(respectful(withCastle(realm(7, ledger), 3), 60), ledger, chicago('2026-10-16')).state
  const today = openDayOf(state)
  const open = accordPanel(state, 'orc', today)
  assert.equal(open.open, true)
  assert.ok(open.expectedGain > 0)
  const busy = sealContract(state, { id: 'c-1', termDays: 3 }, today).state
  const refused = accordPanel(busy, 'orc', today)
  assert.equal(refused.open, false)
  assert.equal(refused.reason?.code, 'contractRunning')
  assert.match(refused.reason?.label ?? '', /contract slot|holds the slot/)
  const sealed = sealAccord(state, 'orc', { id: 'a-1' }, today)
  assert.ok(sealed.ok)
  const page = contractPageView(sealed.state, today)
  assert.equal(page.running?.contract.kind, 'accord')
  assert.equal(page.running?.accord?.rival, 'orc')
  assert.equal(accordPanel(sealed.state, 'goblin', today).reason?.code, 'contractRunning')
})

test('Ch 13: the coalition banner tells the members and their end from the catalog, with a buy-out on each court and no war chest', () => {
  const state = fresh()
  const today = openDayOf(state)
  const formed = applyScenario(state, 'risingCrown', today) as CampaignState
  const [banner] = coalitionBanners(formed, today)
  assert.equal(banner.textId, 'coalitions.risingCrown')
  assert.match(banner.text, /Ugrak and Skivvet/)
  assert.equal(banner.buyouts.length, 2)
  assert.ok(banner.buyouts.every((d) => d.kind === 'buyout'))
  assert.ok(!JSON.stringify(banner).includes('warChest'))
  const cards = momentsFor(formed, formed.log.slice(state.log.length))
  assert.deepEqual(cards.map((c) => [c.slot, c.titleId]), [['moment.coalition', 'coalitions.risingCrown']])
})

test('Ch 14 / Ch 16: the Ultimatum banner gives the day, the countdown, what lifts it and the price, never a Power; the knee bends once', () => {
  const state = fresh()
  const today = openDayOf(state)
  const issued = applyScenario(state, 'ultimatum', today) as CampaignState
  const [banner] = ultimatumBanners(issued, today)
  assert.equal(banner.daysLeft, 14)
  assert.equal(banner.canBend, true)
  assert.match(banner.lifts, /below 1\.3× yours/)
  const hidden = [rivalPower(issued, 'orc'), playerPower(issued)].flatMap((p) => [p, Math.round(p)])
  for (const n of numbersIn(banner)) assert.ok(!hidden.includes(n), `${n} is a Power`)
  const bent = bendTheKnee(issued, 'orc', today)
  assert.ok(bent.ok)
  const after = ultimatumBanners(bent.state, today)[0]
  assert.equal(after.daysLeft, 14 + 28)
  assert.equal(after.canBend, false)
  const twice = bendTheKnee(bent.state, 'orc', today)
  assert.deepEqual([twice.ok, twice.reason], [false, 'used'])
  assert.deepEqual(momentsFor(issued, issued.log.slice(state.log.length)).map((c) => c.slot), ['moment.ultimatum'])
})

test('Ch 14 rule 5: a Siege won Humbles the besieger, and its card says so', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'siegeWin', today) as CampaignState
  const siege = ready.grandBattles.at(-1) as GrandBattle
  const begun = begin(ready, siege.id, { today, valors: [1, 1, 1, 1, 1, 1, 1] })
  assert.ok(begun.ok, String(begun.reason))
  const fought = playOut(begun.state, siege.id, today).state
  assert.notEqual(fought.grandBattles.find((b) => b.id === siege.id)?.result, 'defeat')
  assert.equal(fought.campaign.status, 'active')
  const card = momentsFor(fought, fought.log.slice(begun.state.log.length)).find((c) => c.action?.battleId === siege.id)
  assert.ok(card, 'the Siege is decisive: it gets the big card')
  assert.ok(card.lines?.some((l) => /Humbled/.test(l)))
})

test('Ch 14 rule 6 / Ch 16: a Siege lost is the Fall, told with the same plain record as a victory', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'siegeLose', today) as CampaignState
  const siege = ready.grandBattles.at(-1) as GrandBattle
  const fought = playOut(begin(ready, siege.id, { today, valors: [] }).state, siege.id, today).state
  assert.equal(fought.campaign.status, 'fallen')
  const view = endgameView(fought)!
  assert.equal(view.status, 'fallen')
  assert.equal(view.textId, 'endings.fall')
  assert.equal(view.reign, undefined)
  assert.ok(view.record.some((l) => /^Days every duty was kept: \d+$/.test(l)))
  const cards = momentsFor(fought, fought.log.slice(ready.log.length))
  assert.ok(cards.some((c) => c.slot === 'moment.fall' && c.titleId === 'endings.fall'))
  // The Fall is final: settlement changes nothing more (A-176).
  const later = settle(fought, ledger, chicago(addDays(today, 3)))
  assert.equal(later.state.settledThrough.day, fought.settledThrough.day)
})

test('Ch 14: victory shows the High Throne with the record, then the Reign goes on', () => {
  const state = fresh()
  const today = openDayOf(state)
  const won = applyScenario(state, 'victory', today) as CampaignState
  const view = endgameView(won)!
  assert.equal(view.status, 'won')
  assert.equal(view.textId, 'endings.victory')
  assert.ok(view.reign?.text)
  assert.equal(view.rivals.length, 4)
  const card = momentsFor(won, won.log.slice(state.log.length)).find((c) => c.slot === 'moment.victory')
  assert.ok(card)
  // The Reign: the campaign keeps settling.
  const next = settle(won, ledger, chicago(addDays(today, 2)))
  assert.ok(next.state.settledThrough.day > won.settledThrough.day)
  assert.equal(endgameView(fresh()), null)
})
