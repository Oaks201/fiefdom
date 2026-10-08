/**
 * T15 gap 3: the dev scenario loader. Each prepared state sets up the manual check it names, and
 * the check then plays out through the game's own actions and `settle`: Barracks II changes the
 * roster, an assault takes a den with spoils, the scorched overlay lasts 3 days, the Goblin sells
 * a hex at Respect 25, and a courted village defects at the week close.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyTier, tierOffer } from '../../src/renderer/src/lib/game/buildings'
import { addDays, isWeekCloseDay } from '../../src/renderer/src/lib/game/clock'
import { setOrders } from '../../src/renderer/src/lib/game/combat'
import { DEV_SCENARIOS, applyScenario } from '../../src/renderer/src/lib/game/dev/scenarios'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { makeDeal, placeBid } from '../../src/renderer/src/lib/game/land'
import { dominion } from '../../src/renderer/src/lib/game/map'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { hexOf, openDayOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import { courtableVillages, dealsView } from '../../src/renderer/src/lib/game/view/diplomacy'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { hexPanel, mapView, rosterView } from '../../src/renderer/src/lib/game/view/realm'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { realm } from './support/realm'

const ledger = ledgerWith('2026-09-10', 120)

function fresh(): CampaignState {
  return settle(realm(7, ledger), ledger, chicago('2026-10-08')).state
}

/** Settles through `day` (its close). */
function through(state: CampaignState, day: string): CampaignState {
  return settle(state, ledger, chicago(addDays(day, 1))).state
}

test('T15 gap 3: every scenario applies to a fresh campaign and changes it; an unknown id is refused', () => {
  const state = fresh()
  const today = openDayOf(state)
  for (const s of DEV_SCENARIOS) assert.notEqual(applyScenario(state, s.id, today), state, s.id)
  assert.equal(applyScenario(state, 'nope', today), null)
})

test('T15 manual 1: with 160 reputation and Dominion 8 on the Barracks, Tier II is bought and the roster shows Men-at-Arms', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'barracksII', today) as CampaignState
  assert.equal(balance(ready.purse), 160)
  assert.ok(dominion(ready.hexes, 'player').barracks >= 8)
  assert.equal(tierOffer(ready, 'barracks').ok, true)
  const bought = buyTier(ready, 'barracks', today)
  assert.ok(bought.ok)
  assert.equal(rosterView(state).find((c) => c.id === 'barracks')?.name, 'Militia')
  assert.equal(rosterView(bought.state).find((c) => c.id === 'barracks')?.name, 'Men-at-Arms')
})

test('T15 manual 2: an assault on the beast den next door takes it at the close, with spoils in the purse', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'armyReady', today) as CampaignState
  const den = ready.hexes.find((h) => h.ring === 1 && h.kind === 'between' && h.owner === 'neutral')!
  const view = ordersView(ready, 1, today)
  const sent = [...view.companies].sort((a, b) => b.power - a.power).slice(0, view.banners.assault).map((c) => c.id)
  const ordered = setOrders(ready, { date: today, assaultTarget: den.id, assault: sent, defense: [] }).state
  const after = through(ordered, today)
  assert.equal(hexOf(after, den.id)?.owner, 'player')
  const assault = after.log.find((e) => e.kind === 'assault' && e.hexId === den.id)
  assert.ok(assault && assault.kind === 'assault' && (assault.spoils ?? 0) > 0)
  assert.ok(after.purse.events.some((e) => e.kind === 'spoils' && e.date === today))
})

test('T15 manual 3: the scorched overlay lasts 3 days; the contested hex is struck again and shows its days left', () => {
  const state = fresh()
  const today = openDayOf(state)
  const marked = applyScenario(state, 'contestedScorched', today) as CampaignState
  const map = mapView(marked, today)
  const scorched = map.find((h) => h.status === 'scorched')!
  const contested = map.find((h) => h.status === 'contested')!
  assert.deepEqual([scorched.daysLeft, contested.daysLeft], [3, 2])
  assert.ok(contested.threats?.some((t) => t.kind === 'conquest' && t.rival === 'orc'), 'the Orc strikes the contested hex again today')
  assert.deepEqual(hexPanel(marked, contested.id, today)?.contest, { rival: 'orc', until: addDays(today, 1) })
  let later = marked
  for (let d = 0; d < 3; d++) {
    assert.equal(hexOf(later, scorched.id)?.status, 'scorched', `day ${d}`)
    later = through(later, addDays(today, d))
  }
  assert.equal(hexOf(later, scorched.id)?.status, 'held')
})

test('T15 manual 4: at Respect 25 the Goblin sells a hex touching your land', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'goblinTrade', today) as CampaignState
  const offer = dealsView(ready, 'goblin', today).find((d) => d.kind === 'buyHex' && d.available)
  assert.ok(offer, 'a hex is on offer')
  const done = makeDeal(ready, 'goblin', { kind: 'buyHex', hexId: offer.hexId }, today)
  assert.ok(done.ok)
  assert.equal(hexOf(done.state, offer.hexId as string)?.owner, 'player')
  assert.equal(done.state.rivals.goblin.respect, ready.rivals.goblin.respect + 2)
})

test('T15 manual 5: a courted neutral village defects at the week close', () => {
  const state = fresh()
  const today = openDayOf(state)
  const ready = applyScenario(state, 'courtship', today) as CampaignState
  const village = courtableVillages(ready).find((v) => v.available && v.owner === 'neutral')
  assert.ok(village)
  const bid = placeBid(ready, village.hexId, village.suggested, today)
  assert.ok(bid.ok)
  let day = today
  while (!isWeekCloseDay(day, ready.campaign.weekStartsOn)) day = addDays(day, 1)
  const before = through(bid.state, addDays(day, -1))
  assert.equal(hexOf(before, village.hexId)?.owner, 'neutral', 'nothing happens before the close')
  const after = through(before, day)
  assert.equal(hexOf(after, village.hexId)?.owner, 'player')
  assert.ok(after.log.some((e) => e.kind === 'courtship' && e.hexId === village.hexId && e.outcome === 'defected'))
})
