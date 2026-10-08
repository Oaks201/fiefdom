import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buyItem,
  chooseWing,
  equipItem,
  heldItems,
  itemOffer,
  milestoneUnlocks,
  nextTrophy,
  promoteElite,
  recruitElite,
  setArmorer,
  swearSworn,
  unequipItem
} from '../../src/renderer/src/lib/game/armory'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { defenseFor } from '../../src/renderer/src/lib/game/combat'
import { balance, withBonus } from '../../src/renderer/src/lib/game/economy'
import { milestoneBroken, realmEffects } from '../../src/renderer/src/lib/game/effects'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { FOUNDED_AT, TZ, charter, chicago, steadyLedger, withDay } from './fixtures/ledgers'
import { allBuildings, equip, realm, withArmory, withBuildings, withCrossings, withMilestones, withPurse } from './support/realm'
import { START, fight, plainHex, withHex, withTiding } from './support/war'

const TODAY = START

function armed(...milestones: number[]): CampaignState {
  return withPurse(withMilestones(realm(), ...milestones), 5_000)
}

// ── What each Milestone opens ────────────────────────────────────────────────

test('Ch 9: each Milestone lists only what it opens', () => {
  assert.deepEqual(milestoneUnlocks(1), ['armory', 'rankIItems'])
  assert.deepEqual(milestoneUnlocks(2), ['wings:1'])
  assert.deepEqual(milestoneUnlocks(3), ['elites'])
  assert.deepEqual(milestoneUnlocks(4), ['provingGrounds', 'secondItemSlot'])
  assert.deepEqual(milestoneUnlocks(5), ['wings:2', 'rankIIItems'])
  assert.deepEqual(milestoneUnlocks(6), ['healingSprings', 'tierV'])
  assert.deepEqual(milestoneUnlocks(7), ['eliteRankII', 'sworn'])
  assert.deepEqual(milestoneUnlocks(8), ['wings:3', 'rankIIIItems', 'crownForge'])
  assert.deepEqual(milestoneUnlocks(9), ['legendaryItems'])
  assert.deepEqual(milestoneUnlocks(10), ['statue', 'crownguardAscendant'])
})

test('Ch 9: an unlock appears at the week close where its Milestone breaks, and stays after a weight regain', () => {
  const start = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: steadyLedger('2026-09-10', 150) }, FOUNDED_AT)
  // Lose 1.5 lb a week from the founding, so Milestone 1 (212 lb, earliest week 4) breaks at week 4's close.
  let ledger = steadyLedger('2026-09-10', 150)
  for (let i = 0; i < 120; i++) {
    const date = new Date(Date.UTC(2026, 9, 8 + i)).toISOString().slice(0, 10)
    ledger = withDay(ledger, date, (d) => ({ ...d, weight: Math.round((216 - (1.5 * i) / 7) * 10) / 10 }))
  }
  const broke = settle(start, ledger, chicago('2026-11-09'))
  const unlock = broke.events.find((e) => e.kind === 'unlock')
  assert.ok(unlock, 'Milestone 1 broke')
  assert.equal(unlock.kind === 'unlock' && unlock.milestone, 1)
  assert.deepEqual(unlock.kind === 'unlock' && unlock.unlocks, ['armory', 'rankIItems'])
  const milestone = broke.events.find((e) => e.kind === 'milestone')!
  assert.equal(unlock.day, milestone.day)
  // The scale goes back up: the Armory stays open.
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.UTC(2026, 10, 9 + i)).toISOString().slice(0, 10)
    ledger = withDay(ledger, date, (d) => ({ ...d, weight: 225 }))
  }
  const regained = settle(broke.state, ledger, chicago('2026-12-07')).state
  assert.equal(milestoneBroken(regained, 1), true)
  assert.equal(itemOffer(withPurse(regained, 500), 'whetstones').ok, true)
})

// ── Items ────────────────────────────────────────────────────────────────────

test('Appendix C: items cost their codex price × the Great Forge, gated by rank', () => {
  assert.deepEqual(itemOffer(armed(), 'whetstones').reason, { code: 'milestone', index: 1 })
  assert.deepEqual(itemOffer(armed(1), 'bannerOfTheRealm').reason, { code: 'milestone', index: 5 })
  assert.equal(itemOffer(armed(1, 5), 'bannerOfTheRealm').ok, true)
  assert.deepEqual(itemOffer(armed(1, 5), 'dragonbonePlate').reason, { code: 'milestone', index: 8 })
  assert.deepEqual(itemOffer(armed(1, 5, 8), 'unbrokenBanner').reason, { code: 'milestone', index: 9 })
  assert.deepEqual(itemOffer(armed(1), 'basiliskEye').reason, { code: 'trophy' })
  assert.equal(itemOffer(armed(1), 'whetstones').cost, 60)
  assert.equal(itemOffer(withArmory(armed(1), { wings: ['greatForge'] }), 'whetstones').cost, 42)
  const bought = buyItem(armed(1), 'whetstones', TODAY)
  assert.ok(bought.ok)
  assert.equal(balance(bought.state.purse), 5_000 - 60)
  assert.deepEqual(bought.state.armory?.stash, ['whetstones'])
  assert.ok(bought.state.log.some((e) => e.kind === 'armory' && e.action === 'buy'))
  const poor = buyItem(withPurse(withMilestones(realm(), 1), 50), 'whetstones', TODAY)
  assert.deepEqual(poor.reason, { code: 'reputation', needed: 60, have: 50 })
})

test('Appendix C: a Legendary item is unique', () => {
  const once = buyItem(armed(1, 5, 8, 9), 'anvilHeart', TODAY)
  assert.ok(once.ok)
  assert.deepEqual(buyItem(once.state, 'anvilHeart', TODAY).reason, { code: 'unique' })
})

test('Ch 9: one item slot from Milestone 1, two from Milestone 4; a third needs the Armorer', () => {
  let state = armed(1)
  for (const id of ['whetstones', 'towerShields', 'luckyCoin']) state = buyItem(state, id, TODAY).state
  state = equipItem(state, 'barracks', 'whetstones', TODAY).state
  assert.deepEqual(equipItem(state, 'barracks', 'towerShields', TODAY).reason, { code: 'slots', slots: 1 })
  state = withMilestones(state, 4)
  state = equipItem(state, 'barracks', 'towerShields', TODAY).state
  assert.deepEqual(equipItem(state, 'barracks', 'luckyCoin', TODAY).reason, { code: 'slots', slots: 2 })
  assert.deepEqual(setArmorer(state, 'barracks', TODAY).reason, { code: 'noArmorer' })
  state = withArmory(state, { wings: ['armorer'] })
  state = setArmorer(state, 'barracks', TODAY).state
  const third = equipItem(state, 'barracks', 'luckyCoin', TODAY)
  assert.ok(third.ok)
  assert.deepEqual(third.state.roster.find((c) => c.id === 'barracks')?.items, ['whetstones', 'towerShields', 'luckyCoin'])
  assert.deepEqual(roster(third.state).find((c) => c.id === 'barracks')?.tags.sort(), ['coin', 'steel'])
  const off = unequipItem(third.state, 'barracks', 'luckyCoin', TODAY)
  assert.deepEqual(off.state.armory?.stash, ['luckyCoin'])
  assert.deepEqual(setArmorer(third.state, 'foundry', TODAY).reason, { code: 'slots', slots: 2 }, 'the slot moves only when nothing is stranded')
})

test('Appendix C: Whetstones (+2) raise the daily Army by 2 × m', () => {
  const state = withMilestones(realm(), 1)
  const hex = plainHex(state, 1, () => true).id
  const plain = defenseFor(state, { hexId: hex, kind: 'beasts', valor: 1 })
  const sharp = defenseFor(equip(state, 'barracks', ['whetstones']), { hexId: hex, kind: 'beasts', valor: 1 })
  near(sharp.army - plain.army, 2 * 1.5) // Steel against beasts: m = 1.5
})

test('Appendix C: the Oath-Ring ignores Weary', () => {
  let state = withMilestones(realm(), 1, 5, 8)
  state = { ...state, roster: state.roster.map((c) => (c.id === 'barracks' ? { ...c, wearyUntil: '2026-12-31' } : c)) }
  const tired = roster(state, { day: TODAY }).find((c) => c.id === 'barracks')!.power
  const ringed = roster(equip(state, 'barracks', ['oathRing']), { day: TODAY }).find((c) => c.id === 'barracks')!.power
  near(tired, 5 * 0.8)
  near(ringed, 5)
})

// ── Wings, Elites, the Sworn ─────────────────────────────────────────────────

test('Appendix C: Wings at Milestones 2, 5 and 8, one of two per building, chosen permanently', () => {
  assert.deepEqual(chooseWing(armed(), 'drillYard', TODAY).reason, { code: 'milestone', index: 2 })
  const chosen = chooseWing(armed(2), 'drillYard', TODAY)
  assert.ok(chosen.ok)
  assert.deepEqual(chooseWing(chosen.state, 'watchtowers', TODAY).reason, { code: 'wingTaken', wing: 'drillYard' })
  assert.deepEqual(chooseWing(chosen.state, 'drillYard', TODAY).reason, { code: 'alreadyChosen' })
  assert.ok(chooseWing(chosen.state, 'countingHouse', TODAY).ok, 'another building’s pair is its own choice')
  assert.deepEqual(chooseWing(chosen.state, 'veteransHall', TODAY).reason, { code: 'milestone', index: 5 })
  assert.equal(roster(chosen.state).find((c) => c.id === 'barracks')?.power, 5 + 2)
})

test('Appendix C: an Elite costs 300; rank II needs Milestone 7 and 600 more', () => {
  assert.deepEqual(recruitElite(armed(), 'oathsworn', TODAY).reason, { code: 'milestone', index: 3 })
  const hired = recruitElite(armed(3), 'oathsworn', TODAY)
  assert.ok(hired.ok)
  assert.equal(hired.cost, 300)
  assert.equal(balance(hired.state.purse), 5_000 - 300)
  assert.equal(roster(hired.state).find((c) => c.id === 'oathsworn')?.power, 16)
  assert.deepEqual(recruitElite(hired.state, 'oathsworn', TODAY).reason, { code: 'recruited' })
  assert.deepEqual(promoteElite(hired.state, 'oathsworn', TODAY).reason, { code: 'milestone', index: 7 })
  const ranked = promoteElite(withMilestones(hired.state, 7), 'oathsworn', TODAY)
  assert.ok(ranked.ok)
  assert.equal(ranked.cost, 600)
  assert.equal(roster(ranked.state).find((c) => c.id === 'oathsworn')?.power, 26)
  assert.deepEqual(promoteElite(ranked.state, 'oathsworn', TODAY).reason, { code: 'maxRank' })
})

test('A-21: the Sworn join free at Milestone 7 with two tags chosen once', () => {
  assert.deepEqual(swearSworn(armed(), ['steel', 'coin'], TODAY).reason, { code: 'milestone', index: 7 })
  assert.deepEqual(swearSworn(armed(7), ['steel'], TODAY).reason, { code: 'tags', count: 2 })
  assert.deepEqual(swearSworn(armed(7), ['steel', 'steel'], TODAY).reason, { code: 'tags', count: 2 })
  const sworn = swearSworn(armed(7), ['steel', 'arcane'], TODAY)
  assert.ok(sworn.ok)
  assert.equal(sworn.cost, 0)
  assert.deepEqual(roster(sworn.state).find((c) => c.id === 'sworn')?.tags, ['steel', 'arcane'])
  assert.deepEqual(swearSworn(sworn.state, ['coin', 'engine'], TODAY).reason, { code: 'swornDone' })
})

// ── Realm effects with sources ───────────────────────────────────────────────

test('Appendix C: the Counting House +25% tithes, Bastions +6 walls, the Siege Park +1 daily assault, each with its source', () => {
  const state = withArmory(realm(), { wings: ['countingHouse', 'bastions', 'siegePark'] })
  const e = realmEffects(state)
  near(e.titheMult.value, 1.25)
  assert.deepEqual(e.titheMult.sources.find((s) => s.from.kind === 'wing')?.from, { kind: 'wing', id: 'countingHouse' })
  const base = realmEffects(realm())
  near(e.walls.value - base.walls.value, 6)
  assert.ok(e.walls.sources.some((s) => s.from.kind === 'wing' && s.from.id === 'bastions'))
  near(e.dailyAssaults.value - base.dailyAssaults.value, 1)
  assert.ok(e.dailyAssaults.sources.some((s) => s.from.kind === 'wing' && s.from.id === 'siegePark'))
})

test('A-31: Merchant Hall V with the Statue turns a 100 gain into 125', () => {
  const state = withMilestones(withBuildings(realm(), { merchantHall: 5 }), 10)
  near(withBonus(100, realmEffects(state).reputationBonus.value), 125)
})

// ── Trophies (A-156) ─────────────────────────────────────────────────────────

test('A-156: a daily mythic victory from a lair side grants that lair’s first unheld trophy; off the lair sides, none', () => {
  const state = allBuildings(realm(), 3)
  const west = plainHex(state, 3, (h) => h.land === 'west').id
  let s = withHex(state, west, { owner: 'player' })
  s = withTiding(s, { date: START, kind: 'mythic', hexId: west, strength: 1 })
  const first = fight(s, START, 1)
  assert.deepEqual(first.of('trophy')[0], { hexId: west, source: 'mythic', lair: 'wyrmfells', item: 'wyvernScaleCloak' })
  assert.deepEqual(first.state.armory?.stash, ['wyvernScaleCloak'])
  const day2 = '2026-10-09'
  const second = fight(withTiding(first.state, { date: day2, kind: 'mythic', hexId: west, strength: 1 }), day2, 1)
  assert.equal(second.of('trophy')[0].item, 'basiliskEye')
  assert.equal(nextTrophy(heldItems(second.state), 'wyrmfells', false), undefined, 'the Dragon’s Heart comes only from the Dragon')

  const north = plainHex(state, 3, (h) => h.land === 'north').id
  const off = fight(withTiding(withHex(state, north, { owner: 'player' }), { date: START, kind: 'mythic', hexId: north, strength: 1 }), START, 1)
  assert.deepEqual(off.of('trophy')[0], { hexId: north, source: 'mythic' })
  assert.equal(off.state.armory, undefined)
})

test('A-156: the Royal Hunt grants the first unheld trophy from either lair', () => {
  const state = withCrossings(withBuildings(allBuildings(realm(), 4), { barracks: 4, merchantHall: 4 }), { barracksMerchantHall: 3 })
  const hex = plainHex(state, 3, (h) => h.land === 'north').id
  const s = withTiding(withHex(state, hex, { owner: 'player' }), { date: START, kind: 'beasts', hexId: hex, strength: 1 })
  const hunted = fight(s, START, 1)
  assert.equal(hunted.of('trophy')[0].source, 'royalHunt')
  assert.equal(hunted.of('trophy')[0].item, 'wyvernScaleCloak')
})
