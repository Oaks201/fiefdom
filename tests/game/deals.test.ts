/**
 * Patch 8 stage 2 (D-64): each deal its own. A Truce and a pact bind the player too, and an assault on his
 * land breaks them at a cost (D1, D2); a pact stops his raids, pays when kept and turns his army on his
 * neighbors; a call to arms costs the player Respect with its target and reports what it took (D3); and each
 * ruler's own deal: Ugrak's trial of champions, Skivvet's mercenaries, Hrodgar's oath of stone and Emrys's
 * bargain of knowledge (D4).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { ordersFor, setOrders } from '../../src/renderer/src/lib/game/combat'
import { announceGrandBattle, pendingBattles } from '../../src/renderer/src/lib/game/grand'
import { blocksRaids, dealEnds, makeDeal, offerDeal, pactFreesArmy } from '../../src/renderer/src/lib/game/land'
import { wildWallCap } from '../../src/renderer/src/lib/game/personalities'
import { dispositionFor, rivalMovesDay, rivalView } from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { foreseesSurges } from '../../src/renderer/src/lib/game/surges'
import { withStandingSiege } from '../../src/renderer/src/lib/game/sieges'
import { bindingDeals } from '../../src/renderer/src/lib/game/state'
import { RIVAL_IDS, type CampaignState, type GameEvent, type RivalId } from '../../src/renderer/src/lib/game/types'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { topicFacts } from '../../src/renderer/src/lib/game/view/audienceTalk'
import { eventBattleOutcome } from '../../src/renderer/src/lib/game/world/events'
import { strikeDeal } from '../../src/renderer/src/lib/game/world'
import { realm, withPurse } from './support/realm'
import { START, fight, front, hex, quiet } from './support/war'
import { neighbors } from '../../src/renderer/src/lib/game/map'

const T = RULES.trade

function withRespect(state: CampaignState, rival: RivalId, respect: number): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } }
}

/** The player holds a ring-3 hex touching the Orc's ring-4 hex, a Truce with him struck today. */
function truced(): { state: CampaignState; outer: string } {
  const f = front(withPurse(realm(), 2_000), 'orc', 3)
  const done = makeDeal(f.state, 'orc', { kind: 'truce' }, START)
  assert.ok(done.ok)
  return { state: done.state, outer: f.outer }
}

test('D1: a Truce binds the player too: the Marshal’s siege on his land waits, no battle is called there, and the orders say what an assault would break', () => {
  const { state, outer } = truced()
  assert.equal(bindingDeals(state, 'orc', START).length, 1)
  assert.equal(blocksRaids(state, 'orc', START), true)
  // The standing siege on his hex waits while the Truce holds.
  const besieging = withStandingSiege(state, outer, START)
  assert.equal(ordersFor(besieging, START), undefined)
  assert.equal(ordersFor(besieging, addDays(START, T.truce.days))?.assaultTarget, outer, 'the day after it ends, the Marshal presses it again')
  // A battle the player calls on his land is refused while it holds.
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  assert.equal(announceGrandBattle(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' }, () => {}).reason, 'bound')
  // The orders panel names what an assault would cost.
  const ordered = setOrders(state, { date: START, assaultTarget: outer, assault: ['barracks'], defense: [] }).state
  assert.match(ordersView(ordered, 1, START).assaults[0].breaks ?? '', /^This assault breaks your Truce \(-10 Respect\) with /)
})

test('D1: an assault on his land breaks the Truce: Respect −10, his raids free from the next dawn, and he remembers it', () => {
  const { state, outer } = truced()
  const ordered = setOrders(state, { date: START, assaultTarget: outer, assault: ['barracks'], defense: [] }).state
  const before = state.rivals.orc.respect
  const day = fight(quiet(ordered), START, 1)
  assert.deepEqual(day.of('dealEnded'), [{ rival: 'orc', deal: 'truce', how: 'broken' }])
  assert.equal(day.state.rivals.orc.respect, before + T.truce.brokenRespect)
  assert.equal(day.state.deals.find((d) => d.kind === 'truce')?.brokenOn, START)
  assert.equal(blocksRaids(day.state, 'orc', addDays(START, 1)), false)
  assert.equal(day.state.rivals.orc.wrongedUntil, undefined, 'a Truce broken is not a pact broken')
  const remembered = { ...day.state, log: day.events.map((e, i) => ({ id: `e-${i}`, day: START, ...e }) as GameEvent) }
  assert.ok(topicFacts(remembered, 'orc', addDays(START, 20)).some((f) => f.id === 'truceBroken'), 'remembered for a month')
})

test('D2: a pact stops his raids, frees his army and pays when kept; broken, −20, War for a while whatever his Respect, and every court hears', () => {
  const f = front(withPurse(realm(), 2_000), 'orc', 3)
  const state = withRespect(f.state, 'orc', RULES.respect.marks.orc.pact)
  const done = makeDeal(state, 'orc', { kind: 'pact' }, START)
  assert.ok(done.ok)
  assert.equal(blocksRaids(done.state, 'orc', START), true)
  assert.equal(pactFreesArmy(done.state, 'orc', START), true)
  // Kept to its end: +5 at its last day's close.
  const deal = done.state.deals.find((d) => d.kind === 'pact')!
  const kept: GameEvent[] = []
  const after = dealEnds(done.state, deal, deal.until as string, (kind, payload) => void kept.push({ id: 'k', day: deal.until as string, kind, ...payload } as GameEvent))
  assert.equal(after.rivals.orc.respect, state.rivals.orc.respect + T.pact.keptRespect)
  // Broken by an assault.
  const ordered = setOrders(withRespect(done.state, 'orc', 60), { date: START, assaultTarget: f.outer, assault: ['barracks'], defense: [] }).state
  const others = Object.fromEntries(RIVAL_IDS.map((r) => [r, ordered.rivals[r].respect]))
  const day = fight(quiet(ordered), START, 1)
  assert.deepEqual(day.of('dealEnded'), [{ rival: 'orc', deal: 'pact', how: 'broken' }])
  assert.ok(day.state.rivals.orc.respect <= 60 + T.pact.brokenRespect, 'the pact broken (and his hex taken, if it fell)')
  assert.equal(day.state.rivals.orc.wrongedUntil, addDays(START, T.pact.wrongedDays))
  for (const r of ['goblin', 'dwarf', 'archmage'] as RivalId[]) assert.equal(day.state.rivals[r].respect, others[r] + T.pact.heardRespect, `${r} heard`)
  assert.equal(dispositionFor({ rival: 'orc', respect: 60, inCoalition: false, wronged: true }), 'war', 'at War whatever his Respect')
})

test('D3: a call to arms costs Respect with its target for a week, and at its end reports the land it took (and pays if it took some)', () => {
  let state = withRespect(withPurse(realm(), 2_000), 'orc', 60)
  const done = makeDeal(state, 'orc', { kind: 'callToArms', target: 'goblin' }, START)
  assert.ok(done.ok)
  state = done.state
  const respect = state.rivals.goblin.respect
  for (let d = 0; d < 10; d++) state = rivalMovesDay(state, addDays(START, d), () => {})
  assert.equal(state.rivals.goblin.respect, respect + T.callToArms.targetDays * T.callToArms.targetRespectPerDay, 'one a day, for a week only')
  const deal = state.deals.find((d) => d.kind === 'callToArms')!
  const goblins = state.hexes.find((h) => h.owner === 'goblin' && h.kind !== 'capital' && h.kind !== 'gate')!
  const took = { ...state, log: [...state.log, { id: 'x', day: addDays(START, 3), kind: 'hexTransfer', hexId: goblins.id, from: 'goblin', to: 'orc', how: 'conquest' } as GameEvent] }
  const ended: Record<string, unknown>[] = []
  const after = dealEnds(took, deal, deal.until as string, (kind, payload) => void ended.push({ kind, ...payload }))
  assert.deepEqual(ended.filter((e) => e.kind === 'dealEnded'), [{ kind: 'dealEnded', rival: 'orc', deal: 'callToArms', how: 'kept', target: 'goblin', taken: 1 }])
  assert.equal(after.rivals.orc.respect, took.rivals.orc.respect + T.callToArms.answeredRespect)
})

test('D4: Ugrak’s trial of champions: a battle of one company a side, once every 4 weeks; won, his raids stop; lost, a tribute', () => {
  const state = front(withPurse(realm(), 2_000), 'orc', 3).state
  assert.equal(offerDeal(state, 'goblin', { kind: 'trial' }, START).reason?.code, 'notOffered')
  const done = strikeDeal(state, 'orc', { kind: 'trial' }, START)
  assert.ok(done.ok)
  const battle = pendingBattles(done.state).find((b) => b.eventId === 'trial')!
  assert.equal(battle.limit, T.trial.companiesPerSide)
  assert.equal(battle.rival, 'orc')
  assert.equal(offerDeal(done.state, 'orc', { kind: 'trial' }, addDays(START, 14)).reason?.code, 'tooSoon')
  assert.equal(offerDeal(done.state, 'orc', { kind: 'trial' }, addDays(START, 1)).reason?.code, 'grandBattleWarning', 'while its battle is announced')
  assert.equal(offerDeal(done.state, 'orc', { kind: 'trial' }, addDays(START, 28)).allowed, true, 'four weeks on, open again')
  const ctx = (won: boolean): Parameters<typeof eventBattleOutcome>[2] => ({ day: battle.battleDate, won, result: won ? 'victory' : 'defeat', spoilsMult: 1, emit: () => {} })
  const won = eventBattleOutcome(done.state, battle, ctx(true)).state
  assert.equal(blocksRaids(won, 'orc', addDays(battle.battleDate, T.trial.raidsStopDays)), true)
  assert.equal(blocksRaids(won, 'orc', addDays(battle.battleDate, T.trial.raidsStopDays + 1)), false)
  assert.equal(bindingDeals(won, 'orc', addDays(battle.battleDate, 1)).length, 0, 'his word, not the player’s')
  const lost = eventBattleOutcome(done.state, battle, ctx(false))
  assert.ok((lost.outcome.tribute ?? 0) > 0)
})

test('D4: Skivvet’s mercenaries: one of his companies for a week, priced by his greed, never at War and never more than the buy-off’s cap', () => {
  const state = withPurse(realm(), 2_000)
  const offer = offerDeal(state, 'goblin', { kind: 'mercenaries' }, START)
  assert.ok(offer.allowed)
  assert.equal(offer.price, T.mercenaries.cost * T.mercenaries.greedMult.fair)
  let hired = state
  for (let i = 0; i < RULES.terms.goblin.maxHires; i++) hired = makeDeal(hired, 'goblin', { kind: 'mercenaries' }, START).state
  assert.deepEqual(hired.terms?.hires, { count: RULES.terms.goblin.maxHires, until: addDays(START, T.mercenaries.days - 1) })
  assert.equal(offerDeal(hired, 'goblin', { kind: 'mercenaries' }, START).reason?.code, 'inForce')
  const war = { ...state, rivals: { ...state.rivals, goblin: { ...state.rivals.goblin, disposition: { ...state.rivals.goblin.disposition, player: 'war' as const } } } }
  assert.equal(offerDeal(war, 'goblin', { kind: 'mercenaries' }, START).reason?.code, 'atWar')
})

test('D4: Hrodgar’s oath of stone: 8 weeks, his walls facing you down and none raised; broken, the Book of Grudges doubles his prices for good', () => {
  let state = withRespect(withPurse(realm(), 3_000), 'dwarf', RULES.respect.marks.dwarf.pact)
  // A wild hex of his march beside the player's land, walled, and one far from it.
  const wild = state.hexes.find((h) => h.owner === 'neutral' && h.march === 'dwarf' && h.kind !== 'lairMouth' && neighbors(h.id).some((n) => hex(state, n).owner === 'neutral' && hex(state, n).march === 'dwarf'))!
  const beside = neighbors(wild.id).find((n) => hex(state, n).owner === 'neutral' && hex(state, n).march === 'dwarf')!
  const far = state.hexes.find((h) => h.owner === 'neutral' && h.march === 'dwarf' && h.id !== wild.id && h.id !== beside && !neighbors(h.id).includes(beside))!
  state = { ...state, hexes: state.hexes.map((h) => (h.id === wild.id || h.id === far.id ? { ...h, fortification: 2 } : h.id === beside ? { ...h, owner: 'player' } : h)) }
  const done = makeDeal(state, 'dwarf', { kind: 'oath' }, START)
  assert.ok(done.ok)
  assert.equal(done.deal?.until, addDays(START, T.oath.days - 1))
  assert.equal(hex(done.state, wild.id).fortification, 0, 'his wall facing you comes down')
  assert.equal(hex(done.state, far.id).fortification, 2, 'his walls elsewhere stand')
  assert.equal(wildWallCap({ ...done.state, settledThrough: { day: addDays(START, -1), week: 1 } }), 0)
  assert.equal(offerDeal(done.state, 'dwarf', { kind: 'pact' }, START).reason?.code, 'inForce', 'one oath or pact at a time')
  const grudge = { ...done.state, rivals: { ...done.state.rivals, dwarf: { ...done.state.rivals.dwarf, grudge: true as const } } }
  assert.equal(offerDeal(grudge, 'dwarf', { kind: 'truce' }, START).price, offerDeal(done.state, 'dwarf', { kind: 'truce' }, START).price * T.oath.grudgeMult)
})

test('D4: Emrys’s bargain of knowledge: his treasury and army shown, his surges foretold, or a ward, for a week', () => {
  const state = withRespect(withPurse(realm(), 2_000), 'archmage', T.bargain.minRespect)
  assert.equal(offerDeal(state, 'archmage', { kind: 'bargain' }, START).reason?.code, 'noChoice')
  const today = { ...state, settledThrough: { day: addDays(START, -1), week: 1 } }
  assert.equal(rivalView(today, 'archmage').treasury, undefined)
  const reveal = makeDeal(today, 'archmage', { kind: 'bargain', choice: 'reveal' }, START)
  assert.ok(reveal.ok)
  assert.equal(typeof rivalView(reveal.state, 'archmage').treasury, 'number')
  assert.equal(typeof rivalView(reveal.state, 'archmage').army, 'number')
  assert.equal(offerDeal(reveal.state, 'archmage', { kind: 'bargain', choice: 'ward' }, START).reason?.code, 'inForce')
  const foresight = makeDeal(today, 'archmage', { kind: 'bargain', choice: 'foresight' }, START)
  assert.equal(foreseesSurges(today), false)
  assert.equal(foreseesSurges(foresight.state), true)
})
