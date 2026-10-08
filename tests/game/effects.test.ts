import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mythicMultFor, realmEffects, realmGrants, sourceLabel, wallsFor } from '../../src/renderer/src/lib/game/effects'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { reputationBonus } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, Effects, Sourced } from '../../src/renderer/src/lib/game/types'
import {
  allBuildings,
  equip,
  realm,
  withArmory,
  withBuildings,
  withCastle,
  withCrossings,
  withGrace,
  withMilestones
} from './support/realm'
import { near } from './support/assert'

const fx = (state: CampaignState): Effects => realmEffects(state)

/** Every `Sourced` value inside an Effects answer, by path. */
function sourcedValues(e: unknown, path = 'effects'): [string, Sourced][] {
  if (e === null || typeof e !== 'object') return []
  const o = e as Record<string, unknown>
  if ('op' in o && 'sources' in o && 'value' in o) return [[path, o as unknown as Sourced]]
  return Object.entries(o).flatMap(([k, v]) => sourcedValues(v, `${path}.${k}`))
}

test('Ch 10 worked battle inputs (E-02): Castle III plus Foundry III give walls 20 and a = 0.10', () => {
  const e = fx(withBuildings(withCastle(realm(), 3), { foundry: 3 }))
  assert.equal(e.walls.value, 20)
  assert.deepEqual(e.walls.sources, [
    { from: { kind: 'castle', tier: 3 }, value: 14 },
    { from: { kind: 'building', id: 'foundry', tier: 3 }, value: 6 }
  ])
  assert.deepEqual(e.walls.sources.map((s) => `${sourceLabel(s.from)}: ${s.value}`), ['Castle III: 14', 'Foundry III: 6'])
  near(e.armsBonus.value, 0.1)
  assert.deepEqual(e.armsBonus.sources, [{ from: { kind: 'building', id: 'foundry', tier: 3 }, value: 0.1 }])
})

test('A-31: the Foundry’s arms bonus and walls are each tier’s total, not cumulative', () => {
  const rows = [1, 2, 3, 4, 5].map((tier) => {
    const e = fx(withBuildings(realm(), { foundry: tier }))
    return [e.armsBonus.value, e.walls.value]
  })
  assert.deepEqual(rows, [
    [0, 4],
    [0.05, 7],
    [0.1, 10],
    [0.15, 13],
    [0.2, 16]
  ])
})

test('Ch 7 / Ch 8: rally floor is 0.50, 0.55 at Barracks III, 0.60 at IV, 0.65 with Warded Steel', () => {
  near(fx(realm()).rallyFloor.value, 0.5)
  assert.deepEqual(fx(realm()).rallyFloor.sources, [{ from: { kind: 'base' }, value: 0.5 }])
  near(fx(withBuildings(realm(), { barracks: 2 })).rallyFloor.value, 0.5)
  near(fx(withBuildings(realm(), { barracks: 3 })).rallyFloor.value, 0.55)
  near(fx(withBuildings(realm(), { barracks: 4 })).rallyFloor.value, 0.6)
  near(fx(withBuildings(realm(), { barracks: 5 })).rallyFloor.value, 0.65)
  const warded = fx(withCrossings(withBuildings(realm(), { barracks: 4, mageTower: 3 }), { barracksMageTower: 2 }))
  near(warded.rallyFloor.value, 0.65)
  assert.deepEqual(warded.rallyFloor.sources.map((s) => sourceLabel(s.from)), ['Barracks IV', 'Warded Steel'])
  // The Healing Springs (Milestone 6) add 10%; the Unbroken Banner 5% while it is carried.
  const springs = withMilestones(withBuildings(realm(), { barracks: 4 }), 6)
  near(fx(springs).rallyFloor.value, 0.7)
  near(fx(equip(springs, 'barracks', ['unbrokenBanner'])).rallyFloor.value, 0.75)
})

test('Ch 7: banners by castle tier are 2 / 3 / 4 / 5 / 6, plus 1 with the Crown Forge', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withCastle(realm(), t)).banners.value), [2, 3, 4, 5, 6])
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withMilestones(withCastle(realm(), t), 8)).banners.value), [3, 4, 5, 6, 7])
  assert.deepEqual(fx(withMilestones(withCastle(realm(), 4), 8)).banners.sources, [
    { from: { kind: 'castle', tier: 4 }, value: 5 },
    { from: { kind: 'milestone', index: 8, boon: 'crownForge' }, value: 1 }
  ])
})

test('Ch 7 / A-103: mythic attacks are −10% at Mage Tower II and III, −20% at IV, −30% at V; reductions multiply', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((t) => Math.round(fx(withBuildings(realm(), { mageTower: t })).mythicStrength.value * 100)),
    [100, 90, 90, 80, 70]
  )
  // Wardstones (−15%) and the Starglass Orb (−15%) multiply with the tower (A-31).
  let state = withCrossings(allBuildings(realm(), 4), { foundryMageTower: 3 })
  near(fx(state).mythicStrength.value, 0.8 * 0.85)
  state = equip(state, 'mageTower', ['starglassOrb'])
  near(fx(state).mythicStrength.value, 0.8 * 0.85 * 0.85)
  assert.deepEqual(fx(state).mythicStrength.sources.map((s) => sourceLabel(s.from)), ['Mage Tower IV', 'Wardstones', 'The Starglass Orb'])
})

test('Ch 3 rule 5: a sealed lair halves mythic attacks from its side only', () => {
  const base = withBuildings(realm(), { mageTower: 2 })
  assert.equal(fx(base).mythicStrengthBySide.west?.value, 0.9)
  assert.equal(fx(base).mythicStrengthBySide.east?.value, 0.9)
  const sealed = { ...base, hexes: base.hexes.map((h) => (h.kind === 'lairMouth' && h.land === 'west' ? { ...h, owner: 'player' as const } : h)) }
  const e = fx(sealed)
  near(e.mythicStrengthBySide.west?.value ?? 0, 0.45)
  assert.equal(e.mythicStrengthBySide.east?.value, 0.9)
  assert.deepEqual(e.mythicStrengthBySide.west?.sources.at(-1), { from: { kind: 'lair', id: 'wyrmfells' }, value: 0.5 })
  near(mythicMultFor(e, 'west'), 0.45)
  near(mythicMultFor(e, 'north'), 0.9)
  near(mythicMultFor(e), 0.9)
})

test('A-31: reputation bonuses add: Merchant Hall V 15% + Statue 10% + Gilded Ledger 5% = 30%', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withBuildings(realm(), { merchantHall: t })).reputationBonus.value), [0.02, 0.05, 0.08, 0.12, 0.15])
  let state = withMilestones(withBuildings(realm(), { merchantHall: 5 }), 10)
  near(fx(state).reputationBonus.value, 0.25)
  state = equip(state, 'merchantHall', ['gildedLedger'])
  near(fx(state).reputationBonus.value, 0.3)
  // Settlement reads the same answer.
  near(reputationBonus(state), 0.3)
  // An item in the stash does nothing (A-128).
  near(fx(withArmory(withMilestones(withBuildings(realm(), { merchantHall: 5 }), 10), { stash: ['gildedLedger'] })).reputationBonus.value, 0.25)
})

test('Ch 7: pledge cap ×1.5 from Merchant Hall III; at least half of every pledge returns from IV', () => {
  const rows = [1, 2, 3, 4, 5].map((t) => {
    const e = fx(withBuildings(realm(), { merchantHall: t }))
    return [e.pledgeCap.value, e.minPledgeReturn.value, e.hiredBlades.on]
  })
  assert.deepEqual(rows, [
    [1, 0, false],
    [1, 0, true],
    [1.5, 0, true],
    [1.5, 0.5, true],
    [1.5, 0.5, true]
  ])
})

test('Ch 4 / Ch 7: the Respite bank holds 4, 5 at Mage Tower III, 6 at V; +1 Healing Springs, +1 Herb Garden', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withBuildings(realm(), { mageTower: t })).respiteBank.value), [4, 4, 5, 5, 6])
  const springs = withMilestones(withBuildings(realm(), { mageTower: 5 }), 6)
  assert.equal(fx(springs).respiteBank.value, 7)
  const garden = withArmory(springs, { wings: ['herbGarden'] })
  assert.equal(fx(garden).respiteBank.value, 8)
  assert.deepEqual(fx(garden).respiteBank.sources.map((s) => sourceLabel(s.from)), ['Mage Tower V', 'Milestone 6', 'Herb Garden'])
})

test('A-32: courtship slots are 2, +1 at Merchant Hall III, +1 more at V, +1 with the Golden Road', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withBuildings(realm(), { merchantHall: t })).courtshipSlots.value), [2, 2, 3, 3, 4])
  assert.equal(fx(withArmory(withBuildings(realm(), { merchantHall: 5 }), { wings: ['goldenRoad'] })).courtshipSlots.value, 5)
})

test('Ch 7: one daily assault, two at Castle IV, one more with the Siege Park', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => fx(withCastle(realm(), t)).dailyAssaults.value), [1, 1, 1, 2, 2])
  assert.equal(fx(withArmory(withCastle(realm(), 4), { wings: ['siegePark'] })).dailyAssaults.value, 3)
})

test('Ch 7 / Ch 8: foresight and reveals come from Mage Tower IV, the Spy Network, the Spymaster and the Observatory', () => {
  const none = fx(realm())
  assert.deepEqual(
    Object.values(none.reveals).map((r) => r.whom),
    ['none', 'none', 'none', 'none']
  )
  assert.equal(none.foretell.threats.value, 0)

  const tower = fx(withBuildings(realm(), { mageTower: 4 }))
  assert.deepEqual([tower.foretell.threats.value, tower.foretell.grandBattles.value, tower.foretell.raids.value], [1, 1, 0])
  assert.deepEqual([tower.reveals.threatStrength.whom, tower.reveals.hostRoster.whom, tower.reveals.treasury.whom, tower.reveals.army.whom], ['all', 'all', 'none', 'none'])

  const spymaster = fx(withArmory(realm(), { wings: ['spymaster', 'observatory', 'watchtowers'] }))
  assert.deepEqual([spymaster.reveals.treasury.whom, spymaster.reveals.army.whom, spymaster.reveals.hostRoster.whom], ['neighbors', 'none', 'all'])
  assert.equal(spymaster.foretell.raidsOnRoad.barracks?.value, 1)

  const spies = fx(withCrossings(allBuildings(realm(), 3), { mageTowerMerchantHall: 2 }))
  assert.deepEqual(Object.values(spies.reveals).map((r) => r.whom), ['all', 'all', 'all', 'all'])
  assert.equal(spies.foretell.raids.value, 1)
  near(spies.raidStrength.value, 0.9)
})

test('A-31: Guild Charters replace Trade Roads (20%, not 28%) and raise tithes 50%; gains add', () => {
  const roads = fx(withCrossings(allBuildings(realm(), 3), { foundryMerchantHall: 2 }))
  assert.deepEqual([roads.costs.tiers.value, roads.costs.crossings.value, roads.costs.items.value, roads.titheMult.value], [0.9, 0.9, 1, 1])
  assert.deepEqual(roads.perks.map((p) => p.id), ['tradeRoads'])

  const charters = withCrossings(allBuildings(realm(), 4), { foundryMerchantHall: 3 })
  const e = fx(charters)
  assert.deepEqual([e.costs.tiers.value, e.costs.crossings.value, e.titheMult.value], [0.8, 0.8, 1.5])
  assert.deepEqual(e.perks.map((p) => p.id), ['guildCharters'])
  assert.deepEqual(e.costs.tiers.sources, [{ from: { kind: 'perk', id: 'guildCharters', crossing: 'foundryMerchantHall' }, value: 0.8 }])
  // The Counting House's +25% adds to the Charters' +50% (A-126).
  assert.equal(fx(withArmory(charters, { wings: ['countingHouse'] })).titheMult.value, 1.75)
})

test('Ch 8: Shieldwall doubles walls on rings 4 and 5; Runed Walls against mythics; never four times (A-126)', () => {
  const base = withBuildings(withCastle(realm(), 3), { foundry: 3 })
  assert.equal(wallsFor(fx(base), { ring: 5, foe: 'mythic' }), 20)
  const shield = fx(withCrossings(allBuildings(withCastle(realm(), 3), 3), { barracksFoundry: 2 }))
  assert.equal(wallsFor(shield, { ring: 4, foe: 'rival' }), 40)
  assert.equal(wallsFor(shield, { ring: 3, foe: 'rival' }), 20)
  const both = fx(withCrossings(allBuildings(withCastle(realm(), 3), 3), { barracksFoundry: 2, foundryMageTower: 2 }))
  assert.equal(wallsFor(both, { ring: 3, foe: 'mythic' }), 40)
  assert.equal(wallsFor(both, { ring: 5, foe: 'mythic' }), 40)
  assert.equal(wallsFor(both, { ring: 2, foe: 'beast' }), 20)
  // Bastions (+6) and the Anvil-Heart (+10) add to the walls.
  const thick = equip(withArmory(base, { wings: ['bastions'] }), 'foundry', ['anvilHeart'])
  assert.deepEqual(fx(thick).walls.sources.map((s) => `${sourceLabel(s.from)}: ${s.value}`), ['Castle III: 14', 'Foundry III: 6', 'Bastions: 6', 'The Anvil-Heart: 10'])
  assert.equal(fx(thick).walls.value, 36)
})

test('Ch 8: Bounties, Oathguard, Siegebreakers, the Royal Hunt and Grand Illusion', () => {
  const state = withCrossings(allBuildings(realm(), 4), { barracksMerchantHall: 3, barracksMageTower: 3, barracksFoundry: 3, mageTowerMerchantHall: 3 })
  const e = fx(state)
  assert.deepEqual([e.spoils.beast.value, e.spoils.mythic.value, e.spoils.rival.value], [2, 1, 1])
  assert.equal(e.tribute.value, 0.5)
  assert.equal(e.assaultIgnoresFortification.on, true)
  assert.deepEqual([e.royalHunt.on, e.royalHunt.reputation, e.royalHunt.trophy, e.royalHunt.perWeek], [true, 60, true, 1])
  assert.equal(e.grandIllusion.value, 1)
  assert.deepEqual(
    e.perks.map((p) => p.id),
    ['shieldwall', 'siegebreakers', 'wardedSteel', 'oathguard', 'bounties', 'theRoyalHunt', 'spyNetwork', 'grandIllusion']
  )
})

test('Ch 9: the Crown’s Grace II halves tribute (multiplying with Oathguard) and holds contested hexes 2 days', () => {
  assert.deepEqual([fx(realm()).tribute.value, fx(realm()).contestedDays.value], [1, 1])
  assert.deepEqual([fx(withGrace(realm(), 1)).tribute.value, fx(withGrace(realm(), 1)).contestedDays.value], [1, 1])
  const graceII = withGrace(realm(), 2)
  assert.deepEqual([fx(graceII).tribute.value, fx(graceII).contestedDays.value], [0.5, 2])
  const oath = withCrossings(allBuildings(withGrace(realm(), 3), 4), { barracksMageTower: 3 })
  assert.equal(fx(oath).tribute.value, 0.25)
})

test('Ch 9: item slots open at Milestone 1 (one) and Milestone 4 (two); the Proving Grounds and Crownguard Ascendant', () => {
  assert.equal(fx(realm()).itemSlots.value, 0)
  assert.equal(fx(withMilestones(realm(), 1)).itemSlots.value, 1)
  assert.equal(fx(withMilestones(realm(), 1, 2, 3, 4)).itemSlots.value, 2)
  assert.equal(fx(withArmory(withMilestones(realm(), 1), { wings: ['armorer'] })).extraItemSlots.value, 1)
  near(fx(withMilestones(realm(), 4)).companyPower.all.value, 0.1)
  assert.equal(fx(withMilestones(realm(), 10)).crownguardBonus.value, 10)
})

test('App C: the Order deck and Doctrines follow building tiers, Crossing stages and Wings', () => {
  const start = fx(realm())
  assert.deepEqual(start.orders.map((o) => o.id), ['shieldwall', 'bribe', 'arcaneWard', 'volley'])
  assert.deepEqual(start.doctrines, [])

  const two = fx(withCrossings(allBuildings(realm(), 2), { barracksFoundry: 1 }))
  assert.deepEqual(two.orders.map((o) => o.id), ['shieldwall', 'charge', 'bribe', 'spoilsOfWar', 'arcaneWard', 'foresight', 'volley', 'phalanx'])
  assert.deepEqual(two.doctrines.map((d) => d.id), ['holdTheLine', 'mercenaryContract', 'foreknowledge', 'engineeredFortress'])
  assert.deepEqual(two.orders.at(-1)?.from, { kind: 'crossing', id: 'barracksFoundry', stage: 1 })

  const hall = fx(withArmory(realm(), { wings: ['hallOfHeroes'] }))
  assert.deepEqual(hall.doctrines, [{ id: 'lastStand', from: { kind: 'wing', id: 'hallOfHeroes' } }])
})

test('T07 slots: with the armory slice empty, every Wing and item value sits at its default', () => {
  const state = realm()
  assert.equal(state.armory, undefined)
  const e = fx(state)
  assert.deepEqual(realmGrants(state), [])
  assert.deepEqual(
    [e.trust.value, e.interest.rate, e.eventHints.value, e.wearyDays.value, e.ordersOffered.value, e.readinessFloor.value, e.extraItemSlots.value],
    [0, 0, 0, 0, 3, 0, 0]
  )
  assert.deepEqual([e.poolBanners.assault.value, e.poolBanners.defense.value, e.companyPower.ranged.value, e.companyPower.buildingCompany.barracks.value], [0, 0, 0, 0])
  assert.deepEqual(e.battle, [])
  // An empty slice reads the same as none.
  assert.deepEqual(fx(withArmory(state, {})), e)
})

test('T07 slots: Wings feed their fields once T14 records the choice', () => {
  const wings = ['drillYard', 'envoysRest', 'theBank', 'scryingPool', 'leylineAnchor', 'sanctum', 'veteransHall', 'musterField', 'engineWorks', 'shieldForge', 'kilns', 'exchange', 'greatForge']
  const state = withArmory(withBuildings(realm(), { foundry: 2 }), { wings })
  const e = fx(state)
  assert.equal(e.companyPower.buildingCompany.barracks.value, 2)
  near(e.companyPower.ranged.value, 0.1)
  near(e.trust.value, 0.05)
  assert.deepEqual([e.interest.rate, e.interest.cap], [0.02, 40])
  assert.deepEqual([e.eventHints.value, e.ordersOffered.value, e.readinessFloor.value, e.wearyDays.value, e.poolBanners.assault.value], [1, 4, 0.7, -1, 1])
  assert.deepEqual([e.costs.fortification.value, e.costs.trade.value, e.costs.items.value], [0.75, 0.8, 0.7])
  assert.deepEqual(e.battle.map((g) => g.from), [{ kind: 'wing', id: 'shieldForge' }])
  // The roster picks up Drill Yard (+2 to the Barracks company) and Engine Works (ranged +10%).
  const r = roster(state)
  assert.equal(r.find((c) => c.id === 'barracks')?.power, 7)
  near(r.find((c) => c.id === 'foundry')?.power ?? 0, 9.9)
  near(r.find((c) => c.id === 'mageTower')?.power ?? 0, 5.5)
  assert.equal(r.find((c) => c.id === 'merchantHall')?.power, 5)
})

test('T07: every Effects value lists sources that compose to it', () => {
  let state = withCastle(allBuildings(realm(), 4), 4)
  state = withCrossings(state, { barracksFoundry: 3, barracksMageTower: 3, barracksMerchantHall: 3, foundryMageTower: 3, foundryMerchantHall: 3, mageTowerMerchantHall: 3 })
  state = withGrace(withMilestones(state, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 3)
  state = withArmory(state, { wings: ['drillYard', 'countingHouse', 'herbGarden', 'bastions', 'musterField', 'wardCircle', 'goldenRoad', 'siegePark'] })
  state = equip(state, 'merchantHall', ['gildedLedger', 'anvilHeart'])
  const values = sourcedValues(fx(state))
  assert.ok(values.length > 40, `found ${values.length}`)
  for (const [path, s] of values) {
    const composed = s.op === 'add' ? s.sources.reduce((t, c) => t + c.value, 0) : s.sources.reduce((t, c) => t * c.value, 1)
    near(composed, s.value)
    if (s.value !== (s.op === 'add' ? 0 : 1)) assert.ok(s.sources.length > 0, `${path} has no sources`)
    for (const c of s.sources) assert.ok(sourceLabel(c.from).length > 0, `${path} has an unlabeled source`)
  }
})
