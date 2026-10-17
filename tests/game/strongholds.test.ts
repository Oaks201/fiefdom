/**
 * Patch 3 stage 3 (docs/redesign/patch-3-spec.md section 4, D-23): strongholds. Where they sit
 * (P3-01), their garrison twice over and the bar on their march beyond, the Grand Battle that takes
 * one with its holder's host (P3-02, C-28), their slower decay, and the automatic player's
 * challenge rule (C-31).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GREEDY, autoplay } from '../../src/renderer/src/lib/game/autoplay'
import { assaultGarrison, effectiveGarrison, ordersEstimate, ordersValidity } from '../../src/renderer/src/lib/game/combat'
import { mapAscii } from '../../src/renderer/src/lib/game/dev/mapAscii'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { autoResolve, battleOf, challenge, pendingBattles, warningDays } from '../../src/renderer/src/lib/game/grand'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { bandOf, buildMap, claimableBy, depthOf, hexDistance, isLairMarch, neighbors, seedVillages, strongholdBarring, strongholds } from '../../src/renderer/src/lib/game/map'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { RIVAL_IDS, type CampaignState, type HexState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { hexPanel, mapView } from '../../src/renderer/src/lib/game/view/realm'
import { collector } from './support/grand'
import { near } from './support/assert'
import { allBuildings, realm, withCastle, withPurse } from './support/realm'
import { START, fight, hex, holdStrongholds, quiet, withHex, withOwner } from './support/war'

const S = RULES.sieges.stronghold

/** The stronghold of `march` at `depth`. */
function fortOf(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const id = [...strongholds(hexes)].find(([, s]) => s.march === march && s.depth === depth)?.[0] as string
  return hexes.find((h) => h.id === id) as HexState
}

/** The player holds the hexes just inside the stronghold of `march` at `depth`, so it borders their land. */
function besiege(state: CampaignState, march: RivalId, depth: number): { state: CampaignState; fort: HexState } {
  const fort = fortOf(state.hexes, march, depth)
  const inside = neighbors(fort.id).filter((n) => hex(state, n).ring === fort.ring - 1)
  return { state: withOwner(state, inside, 'player'), fort: hex(withOwner(state, inside, 'player'), fort.id) }
}

test('P3-01 (D-23): two strongholds in each rival march, at depths 4 and 8, on the road or the non-village hex nearest it; none in a lair, never a village or a seam', () => {
  let fellBack = 0
  for (let seed = 1; seed <= 40; seed++) {
    const map = buildMap(seed)
    const forts = strongholds(map)
    assert.equal(forts.size, RIVAL_IDS.length * S.depths.length, `seed ${seed}`)
    for (const [id, s] of forts) {
      const h = map.find((x) => x.id === id) as HexState
      assert.equal(h.march, s.march)
      assert.equal(depthOf(h), s.depth)
      assert.ok(S.depths.includes(s.depth))
      assert.ok(!h.village && !h.seam && !isLairMarch(h.march), `${id} on seed ${seed}`)
      const road = map.find((x) => x.march === s.march && x.road !== undefined && x.ring === h.ring) as HexState
      if (road.village) {
        fellBack++
        assert.equal(hexDistance(h, road), 1, 'the nearest non-village hex in the row')
      } else assert.equal(h.id, road.id, 'the road hex')
    }
  }
  assert.ok(fellBack > 0, 'some seed puts a village on a road at depth 4 or 8')
  assert.ok(seedVillages(7).ids.length > 0)
  assert.equal(mapAscii(buildMap(7)).split('').filter((c) => c === 'S').length, 8)
})

test('D-23: a stronghold’s garrison counts twice while not the player’s, as the player’s assault weighs it; a rival’s den assault reads it plain (C-29)', () => {
  // The Goblin's march: his rules put no multiple on a garrison (Patch 4).
  const state = realm()
  const fort = fortOf(state.hexes, 'goblin', 4)
  near(assaultGarrison(state, fort, START), S.garrisonMult * fort.garrison)
  near(effectiveGarrison(fort), fort.garrison)
  const plain = state.hexes.find((h) => h.march === 'goblin' && depthOf(h) === 4 && h.id !== fort.id && !h.village && !h.seam) as HexState
  near(assaultGarrison(state, plain, START), plain.garrison)
})

test('P3-01 (D-23): while a stronghold stands, the player’s assault reaches no deeper into its march; seams, courtship, trade and rivals are not barred', () => {
  const s0 = realm()
  const fort = fortOf(s0.hexes, 'orc', 4)
  const deep = s0.hexes.find((h) => h.march === 'orc' && !h.seam && depthOf(h) === 5 && neighbors(h.id).includes(fort.id)) as HexState
  const beside = neighbors(deep.id).find((n) => hex(s0, n).ring === deep.ring - 1 && n !== fort.id) as string
  const state = withOwner(s0, [beside], 'player')
  assert.equal(strongholdBarring(state.hexes, deep.id), fort.id)
  assert.equal(claimableBy(state.hexes, deep.id, 'player', 'assault'), false)
  assert.deepEqual(ordersValidity(state, { date: START, assaultTarget: deep.id, assault: ['barracks'], defense: [] }).problems, [{ code: 'barredByStronghold', hexId: deep.id, stronghold: fort.id }])
  assert.equal(claimableBy(state.hexes, deep.id, 'orc', 'rivalExpand'), deep.owner === 'neutral' && neighbors(deep.id).some((n) => hex(state, n).owner === 'orc'))
  // The depth-8 stronghold is barred by the depth-4 one; seams and lair hexes never are.
  assert.equal(strongholdBarring(state.hexes, fortOf(state.hexes, 'orc', 8).id), fort.id)
  for (const h of state.hexes.filter((x) => x.seam || isLairMarch(x.march))) assert.equal(strongholdBarring(state.hexes, h.id), undefined, h.id)
  // A village behind it can still be courted (the deals road).
  const village = state.hexes.find((h) => h.march === 'orc' && h.village && !h.seam && depthOf(h) > 4 && h.owner === 'neutral') as HexState
  const near1 = neighbors(village.id).find((n) => hex(state, n).ring === village.ring - 1) as string
  const courting = withOwner(state, [near1], 'player')
  assert.ok(claimableBy(courting.hexes, village.id, 'player', 'court'))
  // Held, the march beyond opens.
  assert.ok(claimableBy(holdStrongholds(state, 'orc').hexes, deep.id, 'player', 'assault'))
})

test('D-23 (C-20): a stronghold’s wear decays 5% a day, and none while a Grand Battle waits on it', () => {
  const { state: s0, fort } = besiege(allBuildings(realm(), 4), 'orc', 4)
  const worn = withHex(s0, fort.id, { garrisonDamage: 40 })
  near(hex(fight(quiet(worn), START, 1).state, fort.id).garrisonDamage, 40 * (1 - RULES.sieges.wearDecay.stronghold))
  const called = challenge(worn, fort.id, START)
  assert.ok(called.ok)
  assert.equal(hex(fight(quiet(called.state), START, 1).state, fort.id).garrisonDamage, 40)
})

test('P3-02 (C-28): a stronghold is challenged to a Grand Battle with its holder’s host; meanwhile it can’t be assaulted', () => {
  const { state, fort } = besiege(allBuildings(realm(), 4), 'orc', 4)
  const done = challenge(state, fort.id, START)
  assert.ok(done.ok)
  assert.equal(done.battle?.trigger, 'stronghold')
  // Two days of warning, plus Mage Tower IV's day (Ch 11).
  assert.equal(done.battle?.battleDate, addDays(START, warningDays('stronghold', realmEffects(state))))
  assert.equal(warningDays('stronghold', realmEffects(realm())), RULES.grandBattles.warningDays.stronghold)
  const power = (done.battle?.enemy ?? []).reduce((s, c) => s + c.power, 0)
  near(power, S.beastHostShare * assaultGarrison(state, fort, START), 0.5)
  assert.ok(done.battle?.enemy.every((c) => c.id.startsWith('beasts:')))
  assert.deepEqual(ordersValidity(done.state, { date: START, assaultTarget: fort.id, assault: ['barracks'], defense: [] }).problems, [{ code: 'grandBattlePending', hexId: fort.id }])
  // A rival-held stronghold brings his host; a deeper one is refused while the first stands.
  const held = withOwner(state, [fort.id], 'orc')
  assert.ok(challenge(held, fort.id, START).battle?.enemy.every((c) => c.id.startsWith('orc:')))
  const { state: far, fort: deep } = besiege(state, 'orc', 8)
  assert.equal(challenge(far, deep.id, START).reason, 'barred')
})

test('P3-02 (D-23): a stronghold battle lost costs 5 × band tribute and 14 days before the next challenge, its wear kept; won, it is the player’s', () => {
  const { state: s0, fort } = besiege(withPurse(realm(), 500), 'orc', 4)
  const worn = withHex(s0, fort.id, { garrisonDamage: 30 })
  const lost = challenge(worn, fort.id, START)
  const after = autoResolve(lost.state, lost.battle!.id, lost.battle!.battleDate, [0, 0, 0, 0, 0, 0, 0], collector().emit)
  const b = battleOf(after, lost.battle!.id)!
  assert.equal(b.result, 'defeat')
  assert.equal(b.outcome?.tribute, 5 * bandOf(fort))
  assert.equal(b.outcome?.retryFrom, '2026-10-24')
  assert.equal(hex(after, fort.id).garrisonDamage, 30)
  assert.equal(challenge(after, fort.id, '2026-10-23').reason, 'retryTooSoon')

  const strong = withCastle(allBuildings(withHex(s0, fort.id, { garrison: 5 }), 4), 4)
  const w = challenge(strong, fort.id, START)
  const c = collector()
  const won = autoResolve(w.state, w.battle!.id, w.battle!.battleDate, [1, 1, 1, 1, 1, 1, 1], c.emit)
  assert.notEqual(battleOf(won, w.battle!.id)!.result, 'defeat')
  assert.equal(hex(won, fort.id).owner, 'player')
  assert.deepEqual(c.of('hexTransfer'), [{ hexId: fort.id, from: 'neutral', to: 'player', how: 'conquest', fortification: 0 }])
})

test('C-31: the automatic player challenges a stronghold it can face that won’t fall within 3 days, and besieges one it can’t', () => {
  const { state: s0, fort } = besiege(allBuildings(realm(), 5), 'orc', 4)
  const effects = realmEffects(s0)
  const everyone = roster(s0, { day: START }, effects).map((c) => c.id)
  const value = ordersEstimate(s0, { date: START, assaultTarget: fort.id, assault: everyone, defense: [] }, START, 0.8, effects).assaults[0].value
  // Everything else out of reach; the stronghold at 1.8 × the Assault: no 3-day siege, but its host (0.9 ×) can be faced.
  const walled = (garrisonTimesAssault: number): CampaignState => ({
    ...s0,
    hexes: s0.hexes.map((h) => (h.owner === 'player' ? h : h.id === fort.id ? { ...h, garrison: (garrisonTimesAssault * value) / S.garrisonMult, garrisonDamage: 0 } : { ...h, garrison: 1e6 }))
  })
  const faced = autoplay(walled(1.8), START, GREEDY, { rough: false, nextId: () => 'c1' })
  assert.deepEqual(pendingBattles(faced).map((b) => [b.trigger, b.hexId]), [['stronghold', fort.id]])
  // At 2.5 × its host (1.25 ×) is too strong: the player besieges it instead.
  const sieged = autoplay(walled(2.5), START, GREEDY, { rough: false, nextId: () => 'c2' })
  assert.deepEqual(pendingBattles(sieged), [])
  assert.equal(sieged.standingSiege?.hexId, fort.id)
})

test('D-23: the map marks strongholds and the hexes they bar; the hex panel offers a stronghold’s Grand Battle beside the siege', () => {
  const { state, fort } = besiege(allBuildings(realm(), 4), 'orc', 4)
  const view = mapView(state, START)
  assert.equal(view.find((h) => h.id === fort.id)?.stronghold, true)
  const barred = view.find((h) => h.march === 'orc' && h.ruling === undefined && (h.depth ?? 0) > 4 && h.owner !== 'player')
  assert.equal(barred?.barredBy, view.find((h) => h.id === fort.id)?.label)
  const panel = hexPanel(state, fort.id, START)
  assert.equal(panel?.stronghold, true)
  assert.deepEqual(panel?.actions.map((a) => [a.kind, a.available]), [['challenge', true], ['assault', true]])
})
