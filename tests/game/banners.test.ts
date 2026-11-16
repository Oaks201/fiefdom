/**
 * Patch 10 stage 2 (docs/redesign/patch-10-proposals.md, K6; D-80, D-84; rules 3.16.0): the banner share.
 * Of a hex taken by daily assault or Grand Battle, a share of its depth's Renown goes to the paths of the tags
 * that took it, by each tag's share of the strike; a tag carrying enough of the strike is massed and counts more.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equipItem, buyItem } from '../../src/renderer/src/lib/game/armory'
import { setOrders } from '../../src/renderer/src/lib/game/combat'
import { bannerParts, bannersOf, chronicle, pathOfTag, renown, tagOfPath } from '../../src/renderer/src/lib/game/dominion'
import { depthOf, isClaimableKind, strongholds } from '../../src/renderer/src/lib/game/map'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { RIVAL_IDS, TAGS, type CampaignState, type DailyOrders, type GameEvent, type GameEventMap, type HexState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { near } from './support/assert'
import { collector, type Posted } from './support/grand'
import { allBuildings, realm, withMilestones, withPurse } from './support/realm'
import { START, den, fight, quiet, withHex, withOwner } from './support/war'

const D = RULES.dominion.deeds
const K = RULES.dominion.crafts

type Deed = GameEventMap['deed']

function plainIn(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const forts = strongholds(hexes)
  return hexes.find((h) => h.march === march && !h.seam && !h.village && !forts.has(h.id) && isClaimableKind(h) && depthOf(h) === depth) as HexState
}

function read(state: CampaignState = realm()): CampaignState {
  return chronicle(state, () => undefined)
}

function posted(state: CampaignState, events: readonly Posted[]): { state: CampaignState; deeds: Deed[] } {
  const logged = { ...state, log: [...state.log, ...events.map((e, i) => ({ day: START, ...e, id: `t:${state.log.length + i}` }) as GameEvent)] }
  const c = collector()
  return { state: chronicle(logged, c.emit), deeds: c.of('deed') }
}

const rowsOf = (deeds: readonly Deed[], kind: Deed['deed']): [RivalId, number][] => deeds.filter((d) => d.deed === kind).map((d): [RivalId, number] => [d.path, d.value])

test('K6: each tag’s banners feed the ruler at the end of its building’s road, one tag a path', () => {
  assert.deepEqual(TAGS.map((t) => [t, pathOfTag(t)]), [['steel', 'orc'], ['coin', 'goblin'], ['arcane', 'archmage'], ['engine', 'dwarf']])
  for (const r of RIVAL_IDS) assert.equal(pathOfTag(tagOfPath(r)), r)
})

test('K6: a strike’s banners are each company’s strike split evenly over its tags, as shares of the whole', () => {
  assert.deepEqual(bannersOf([{ tags: ['steel'], strike: 30 }]), { steel: 1 })
  assert.deepEqual(bannersOf([{ tags: ['steel'], strike: 30 }, { tags: ['engine'], strike: 10 }]), { steel: 0.75, engine: 0.25 })
  // Two tags halve a company's strike between them; a company with no tag carries none, so the shares need not reach 1.
  assert.deepEqual(bannersOf([{ tags: ['steel', 'coin'], strike: 20 }, { tags: ['coin'], strike: 20 }]), { steel: 0.25, coin: 0.75 })
  assert.deepEqual(bannersOf([{ tags: [], strike: 10 }, { tags: ['arcane'], strike: 10 }]), { arcane: 0.5 })
  assert.deepEqual(bannersOf([]), {})
  const parts = bannerParts({ engine: 0.6, steel: 0.4 })
  assert.deepEqual(parts.map((p) => [p.tag, p.path, p.massed, p.weight]), [['steel', 'orc', false, 0.4], ['engine', 'dwarf', true, 0.6 * K.massedMult]])
  assert.equal(bannerParts({ engine: K.massedAt - 0.01 })[0].massed, false, 'massed only from the mark')
})

test('K6: a tag an item adds counts: the Barracks’ company carrying a Lucky Coin flies Steel and Coin alike', () => {
  let state = withPurse(withMilestones(allBuildings(realm(), 3), 1), 1_000)
  state = buyItem(state, 'luckyCoin', START).state
  const done = equipItem(state, 'barracks', 'luckyCoin', START)
  assert.equal(done.ok, true)
  const barracks = roster(done.state).find((c) => c.id === 'barracks')
  assert.deepEqual([...(barracks?.tags ?? [])].sort(), ['coin', 'steel'])
  assert.deepEqual(barracks?.itemTags, ['coin'])
  // D-84: the item's tag weighs `itemTagWeight` beside the company's own.
  const w = K.itemTagWeight
  const flown = bannersOf([{ tags: barracks?.tags ?? [], strike: barracks?.power ?? 0, itemTags: barracks?.itemTags }])
  near(flown.steel ?? 0, 1 / (1 + w), 1e-3)
  near(flown.coin ?? 0, w / (1 + w), 1e-3)
  assert.ok((flown.coin ?? 0) >= K.massedAt, 'a tag item alone masses a one-tag company’s banner')
})

test('K6: a hex taken in battle pays its march’s path all but the banner share of its depth, and each banner its part; a massed banner’s part counts more', () => {
  const s0 = read()
  const h = plainIn(s0.hexes, 'orc', 6)
  const depth = D.hexTakenPerDepth * depthOf(h)
  const { deeds, state } = posted(withOwner(s0, [h.id], 'player'), [{ kind: 'hexTransfer', hexId: h.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0, banners: { engine: 0.6, steel: 0.4 } }])
  near(rowsOf(deeds, 'hexTaken').reduce((s, [, v]) => s + v, 0), depth * (1 - K.bannerFromMarch))
  assert.deepEqual(rowsOf(deeds, 'hexTaken').map(([p]) => p), ['orc'])
  const banners = new Map(rowsOf(deeds, 'bannerTaken'))
  near(banners.get('orc') ?? 0, depth * K.bannerShare * 0.4)
  near(banners.get('dwarf') ?? 0, depth * K.bannerShare * 0.6 * K.massedMult)
  assert.deepEqual(deeds.filter((d) => d.deed === 'bannerTaken').map((d) => [d.tag, d.massed]), [['steel', undefined], ['engine', true]])
  // Pushing the Orc with engines builds the Dwarf's path; only the massed part is Renown added.
  near(renown(state).dwarf - renown(s0).dwarf, depth * K.bannerShare * 0.6 * K.massedMult)
  near(deeds.reduce((s, d) => s + d.value, 0), depth * (1 - K.bannerFromMarch) + depth * K.bannerShare * (0.4 + 0.6 * K.massedMult))
  assert.equal(K.bannerFromMarch, 0, 'D-84: the banners’ part is on top; the march keeps its whole depth')
})

test('K6: walls broken stay with the march; a strike no tag carried, a hex won by coin, and a taking with no banners on record split nothing', () => {
  const s0 = read()
  const walled = plainIn(s0.hexes, 'dwarf', 4)
  const bought = plainIn(s0.hexes, 'goblin', 4)
  const older = plainIn(s0.hexes, 'archmage', 4)
  const half = plainIn(s0.hexes, 'orc', 4)
  const { deeds } = posted(withOwner(s0, [walled.id, bought.id, older.id, half.id], 'player'), [
    { kind: 'hexTransfer', hexId: walled.id, from: 'dwarf', to: 'player', how: 'conquest', fortification: 2, banners: { arcane: 0.5, coin: 0.5 } },
    { kind: 'hexTransfer', hexId: bought.id, from: 'goblin', to: 'player', how: 'bribe', fortification: 0, banners: { steel: 1 } },
    { kind: 'hexTransfer', hexId: older.id, from: 'archmage', to: 'player', how: 'conquest', fortification: 0 },
    { kind: 'hexTransfer', hexId: half.id, from: 'orc', to: 'player', how: 'conquest', fortification: 0, banners: { coin: 0.5 } }
  ])
  const on = (hexId: string, kind: Deed['deed']): number => deeds.filter((d) => d.hexId === hexId && d.deed === kind).reduce((s, d) => s + d.value, 0)
  const depth = D.hexTakenPerDepth * 4
  near(on(walled.id, 'hexTaken'), depth * (1 - K.bannerFromMarch) + D.perFortification * 2)
  near(on(walled.id, 'bannerTaken'), depth * K.bannerShare)
  near(on(bought.id, 'hexTaken'), depth)
  assert.equal(on(bought.id, 'bannerTaken'), 0, 'a hex won by coin is the deal’s (K4)')
  near(on(older.id, 'hexTaken'), depth)
  assert.equal(on(older.id, 'bannerTaken'), 0)
  // Half the strike flew no banner: that half of the banner share stays with the march.
  near(on(half.id, 'hexTaken'), depth * (1 - K.bannerFromMarch * 0.5))
  near(on(half.id, 'bannerTaken'), depth * K.bannerShare * 0.5)
})

test('K6: a daily assault records its banners on the assault and on the hex it takes, a repulse too', () => {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const order = (state: CampaignState, o: Partial<DailyOrders>): CampaignState => setOrders(state, { date: START, assault: [], defense: [], ...o }).state
  const won = fight(quiet(order(withHex(s0, target, { garrison: 10 }), { assaultTarget: target, assault: ['barracks', 'foundry'] })), START, 1)
  const banners = won.of('assault')[0].banners ?? {}
  assert.deepEqual(Object.keys(banners).sort(), ['engine', 'steel'])
  near(Object.values(banners).reduce((s, v) => s + v, 0), 1)
  assert.deepEqual(won.of('hexTransfer')[0].banners, banners)
  const lost = fight(quiet(order(withHex(s0, target, { garrison: 100_000 }), { assaultTarget: target, assault: ['barracks'] })), START, 1)
  assert.deepEqual([lost.of('assault')[0].outcome, lost.of('assault')[0].banners], ['repulsed', { steel: 1 }])
})

test('K6: the orders panel shows each assault’s banners before the close, the largest first, with the ruler each feeds', () => {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const set = setOrders(s0, { date: START, assaultTarget: target, assault: ['barracks', 'foundry'], defense: [] }).state
  const slot = ordersView(set, 1, START).assaults[0]
  assert.deepEqual(slot.banners.map((b) => b.tag).sort(), ['engine', 'steel'])
  assert.equal(slot.banners.reduce((s, b) => s + b.percent, 0), 100)
  assert.ok(slot.banners[0].percent >= slot.banners[1].percent)
  for (const b of slot.banners) assert.match(`${b.name} ${b.ruler}`, /^(Steel Ugrak|Engine Hrodgar)/)
  const alone = ordersView(setOrders(s0, { date: START, assaultTarget: target, assault: ['mageTower'], defense: [] }).state, 1, START).assaults[0]
  assert.deepEqual(alone.banners.map((b) => [b.tag, b.percent, b.massed]), [['arcane', 100, true]])
  assert.deepEqual(ordersView(s0, 1, START).assaults[0].banners, [], 'no company sent, no banner')
})

test('K6: the Herald reads a banner’s share through its catalog slot, naming the banner', () => {
  const h = plainIn(realm().hexes, 'orc', 3)
  const line = resultLine({ id: 'e1', day: START, kind: 'deed', path: 'dwarf', deed: 'bannerTaken', value: 1.2, hexId: h.id, tag: 'engine', massed: true })
  assert.equal(line?.textId, 'herald.deed.bannerTaken')
  assert.match(line?.text ?? '', /Engine banners: 1\.2 Renown/)
  assert.doesNotMatch(line?.text ?? '', /\{/)
})
