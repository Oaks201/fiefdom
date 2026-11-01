/**
 * Patch 8 stage 3 (D-66): rivals that come to the player. A ruler sends a request at a week close (R1): a dare in
 * the habit he prizes, an offer of his own, or a demand; the player grants or refuses it in his Audience, and a
 * demand left unanswered counts as refused. A siege lifted or a hex spared is a promise an assault breaks. The
 * rulers react to each other's news (R2): the Herald quotes them, and fresh news is the first thing they say.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemOffer } from '../../src/renderer/src/lib/game/armory'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { setOrders } from '../../src/renderer/src/lib/game/combat'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { fortificationCap, promisesOn } from '../../src/renderer/src/lib/game/land'
import { touchesOwner } from '../../src/renderer/src/lib/game/map'
import { answerRequest, requestOf, requestsOf, requestsWeek, settleDare } from '../../src/renderer/src/lib/game/requests'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { lostToRaids } from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { withStandingSiege, standingSiegeOf } from '../../src/renderer/src/lib/game/sieges'
import { withWorld } from '../../src/renderer/src/lib/game/state'
import { RIVAL_IDS, type CampaignState, type GameEvent, type GameEventKind, type GameEventMap, type RivalId, type RulerRequest } from '../../src/renderer/src/lib/game/types'
import { LINE_KEYS, withDrafts } from '../../src/renderer/src/lib/game/view/audience'
import { audienceTopic, reactionsTo } from '../../src/renderer/src/lib/game/view/audienceTalk'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { requestCard, requestNote } from '../../src/renderer/src/lib/game/view/requests'
import { heraldView } from '../../src/renderer/src/lib/game/view/shell'
import draftJson from '../../rivalLines.draft.json'
import { realm, withMilestones, withPurse } from './support/realm'
import { START, fight, front, quiet } from './support/war'

const Q = RULES.requests
const DEV = withDrafts()
const YESTERDAY = addDays(START, -1)

/** Every other ruler resolved, so `rival` is the only one who can ask. */
function only(state: CampaignState, rival: RivalId): CampaignState {
  return { ...state, rivals: Object.fromEntries(RIVAL_IDS.map((r) => [r, r === rival ? state.rivals[r] : { ...state.rivals[r], status: 'conquered' as const }])) as CampaignState['rivals'] }
}

function withRespect(state: CampaignState, rival: RivalId, respect: number): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } }
}

/** A request of `rival`'s made at yesterday's close, open today. */
function asked(state: CampaignState, rival: RivalId, kind: RulerRequest['kind'], more: Partial<RulerRequest> = {}): CampaignState {
  const q: RulerRequest = { id: `req-${rival}`, rival, kind, madeOn: YESTERDAY, until: addDays(YESTERDAY, Q.answerDays), ...more }
  return withWorld(state, { requests: [q] })
}

/** The first week close on or after `from` (stepping a week at a time) where the request roll falls. */
function rollDay(state: CampaignState, from = START): string {
  for (let k = 0; k < 60; k++) {
    const day = addDays(from, 7 * k)
    if (chance(state.campaign.seed, day, 'request:roll', Q.chance)) return day
  }
  throw new Error('no roll')
}

/** The world phase's requests at the close of `day`, the player there that day (it launched the app) unless `away`. */
function week(state: CampaignState, day: string, weekNo = 10, away = false): { state: CampaignState; of<K extends GameEventKind>(kind: K): GameEventMap[K][] } {
  const events: { kind: GameEventKind }[] = []
  const present = away ? state : { ...state, settlement: { ...state.settlement, lastLaunch: day } }
  const next = requestsWeek(present, { day, week: weekNo, emit: (kind, payload) => void events.push({ kind, ...payload }) })
  return { state: next, of: <K extends GameEventKind>(kind: K) => events.filter((e) => e.kind === kind).map(({ kind: _k, ...p }) => p) as unknown as GameEventMap[K][] }
}

function logged(state: CampaignState, events: ({ day: string; kind: GameEventKind } & Record<string, unknown>)[]): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ ...e, id: `t-${i}` }) as GameEvent)] }
}

test('R1: no request before week 4; from then a roll at a week close brings one ruler’s, open the week ahead', () => {
  const state = realm()
  const day = rollDay(state)
  assert.equal(requestsOf(week(state, day, Q.fromWeek - 1).state).length, 0)
  const done = week(state, day, Q.fromWeek)
  const [q] = requestsOf(done.state)
  assert.ok(q, 'a request is made')
  assert.equal(q.madeOn, day)
  assert.equal(q.until, addDays(day, Q.answerDays))
  assert.equal(done.of('request')[0].stage, 'made')
  assert.equal(requestOf(done.state, q.rival, day), undefined, 'not open on the close it came at')
  assert.equal(requestOf(done.state, q.rival, addDays(day, 1))?.id, q.id)
  // A ruler with one open asks nothing more.
  const again = week(only(done.state, q.rival), rollDay(done.state, addDays(day, 1)))
  assert.equal(again.of('request').filter((e) => e.stage === 'made').length, 0)
})

test('R1: a friendly ruler dares first; then Skivvet offers an Armory item at his price, which the Armory honors', () => {
  const state = withMilestones(withPurse(only(withRespect(realm(), 'goblin', 30), 'goblin'), 2_000), 1, 2, 3, 4)
  const day = rollDay(state)
  const dared = week(state, day)
  assert.equal(requestsOf(dared.state)[0].kind, 'dare')
  // A week later, with the dare settled, he offers.
  const next = rollDay(state, addDays(day, 7))
  const settled = withWorld(logged(dared.state, [{ day, kind: 'request', rival: 'goblin', request: 'dare', stage: 'made' }]), { requests: [] })
  const offered = week(settled, next)
  const q = requestsOf(offered.state)[0]
  assert.equal(q.kind, 'itemOffer')
  const usual = itemOffer(settled, q.itemId as string).cost
  assert.equal(q.price, Math.round(usual * (1 - Q.offerDiscount)))
  const answered = answerRequest(offered.state, 'goblin', 'grant', addDays(next, 1))
  assert.ok(answered.ok, answered.reason)
  assert.equal(answered.cost, q.price)
  assert.equal(answered.state.rivals.goblin.respect, 30 + Q.demand.granted)
  assert.ok((answered.state.world?.requests ?? []).length === 0)
})

test('R1: a demand to lift a siege on his hex; granted, the siege lifts, +5, and the hex is promised; an assault on it breaks the promise and Ugrak goes to War', () => {
  const f = front(withPurse(realm(), 2_000), 'orc', 3)
  const besieging = withStandingSiege(withRespect(f.state, 'orc', 10), f.outer, YESTERDAY)
  const made = week(only(besieging, 'orc'), rollDay(besieging, YESTERDAY))
  assert.equal(requestsOf(made.state)[0]?.kind, 'liftSiege')
  const state = asked(besieging, 'orc', 'liftSiege', { hexId: f.outer })
  const card = requestCard(state, 'orc', START, DEV)
  assert.equal(card?.grantLabel, 'Lift the siege')
  assert.match(card?.rule ?? '', /War with you for 14 days/)
  const granted = answerRequest(state, 'orc', 'grant', START)
  assert.ok(granted.ok)
  assert.equal(standingSiegeOf(granted.state), undefined)
  assert.equal(granted.state.rivals.orc.respect, 10 + Q.demand.granted)
  const [promise] = promisesOn(granted.state, START)
  assert.equal(promise.hexId, f.outer)
  assert.equal(promise.until, addDays(START, Q.spareDays - 1))
  assert.match(requestNote(granted.state, 'orc', START) ?? '', /You promised to leave .* alone through/)
  // The orders say what an assault would break; the assault breaks it.
  const day = addDays(START, 1)
  const ordered = setOrders(granted.state, { date: day, assaultTarget: f.outer, assault: ['barracks'], defense: [] }).state
  assert.match(ordersView(ordered, 1, day).assaults[0].breaks ?? '', /breaks your promise to /)
  const fought = fight(quiet(ordered, day), day, 1)
  assert.deepEqual(fought.of('request'), [{ rival: 'orc', request: 'liftSiege', stage: 'broken', hexId: f.outer }])
  assert.equal(fought.state.rivals.orc.respect, 10 + Q.demand.granted + Q.demand.refused)
  assert.equal(fought.state.rivals.orc.wrongedUntil, addDays(day, Q.demand.wrongedDays))
  assert.equal(promisesOn(fought.state, day).length, 0)
})

test('R1: a ruler below 0 demands a toll; refused, −5 and Hrodgar walls his hex facing the player; unanswered, the same at the next close', () => {
  const f = front(withPurse(realm(), 2_000), 'dwarf', 3)
  const sour = only(withRespect(f.state, 'dwarf', -10), 'dwarf')
  const made = week(sour, rollDay(sour))
  const q = requestsOf(made.state)[0]
  assert.equal(q.kind, 'toll')
  assert.ok((q.price ?? 0) >= Q.tollPerBand)
  const state = asked(sour, 'dwarf', 'toll', { price: q.price })
  const walls = (s: CampaignState): number => s.hexes.filter((h) => h.owner === 'dwarf' && touchesOwner(s.hexes, h.id, 'player')).reduce((sum, h) => sum + h.fortification, 0)
  const refused = answerRequest(state, 'dwarf', 'refuse', START)
  assert.ok(refused.ok)
  assert.equal(refused.state.rivals.dwarf.respect, -10 + Q.demand.refused)
  assert.equal(walls(refused.state), walls(state) + 1)
  assert.ok(walls(state) < fortificationCap('dwarf'))
  // Paid instead: the purse, and +5.
  const paid = answerRequest(state, 'dwarf', 'grant', START)
  assert.equal(balance(paid.state.purse), balance(state.purse) - (q.price ?? 0))
  assert.equal(paid.state.rivals.dwarf.respect, -10 + Q.demand.granted)
  // Left unanswered: refused by silence at the close it runs out.
  const silent = week(state, addDays(YESTERDAY, Q.answerDays), 1)
  assert.deepEqual(silent.of('request')[0], { rival: 'dwarf', request: 'toll', stage: 'lapsed', price: q.price })
  assert.equal(silent.state.rivals.dwarf.respect, -10 + Q.demand.refused)
  assert.equal(requestsOf(silent.state).length, 0)
  // Absence never costs anything (X-17): away, it ends quietly, and no ruler asks.
  const close = addDays(YESTERDAY, Q.answerDays)
  const gone = { ...state, settlement: { ...state.settlement, lastLaunch: addDays(close, -RULES.clock.absenceDays) } }
  const quietly = week(gone, close, 1, true)
  assert.deepEqual(quietly.of('request'), [])
  assert.equal(quietly.state.rivals.dwarf.respect, -10)
  assert.equal(requestsOf(quietly.state).length, 0)
  assert.equal(requestsOf(week(gone, rollDay(gone, close), 10, true).state).length, 0)
})

test('R1: an offer refused or lapsed costs nothing; a dare is never answered, and settles at its close: met +6, missed −2', () => {
  const state = asked(withRespect(realm(), 'archmage', 20), 'archmage', 'dare')
  assert.equal(answerRequest(state, 'archmage', 'grant', START).reason, 'dare')
  assert.equal(requestCard(state, 'archmage', START, DEV)?.grantLabel, undefined)
  const close = addDays(YESTERDAY, Q.answerDays)
  const emit = (): void => {}
  assert.equal(settleDare(state, 'archmage', close, true, emit).rivals.archmage.respect, 20 + Q.dare.met)
  assert.equal(settleDare(state, 'archmage', close, false, emit).rivals.archmage.respect, 20 + Q.dare.missed)
  assert.equal(settleDare(state, 'archmage', START, true, emit), state, 'only at its own close')
  // Ugrak's dare is narrower than his prized week: only a battle lost to his raids spoils it.
  const raided = logged(realm(), [{ day: START, kind: 'defense', rival: 'goblin', outcome: 'defeat', threat: 'raid', hexId: 'x' }])
  assert.equal(lostToRaids(raided, 'orc', START, START), false)
  assert.equal(lostToRaids(raided, 'goblin', START, START), true)
  // An offer declined: nothing lost.
  const hexOffer = asked(withRespect(realm(), 'archmage', 20), 'archmage', 'hexOffer', { hexId: 'nowhere', price: 50 })
  const declined = answerRequest(hexOffer, 'archmage', 'refuse', START)
  assert.equal(declined.state.rivals.archmage.respect, 20)
})

test('R1: the Herald tells an open request each day, and a dare met, a demand refused by silence or a promise broken', () => {
  const state = asked(realm(), 'goblin', 'toll', { price: 40 })
  const lines = heraldView(state, START).lines.filter((l) => l.textId.startsWith('herald.request'))
  assert.deepEqual(lines.map((l) => [l.textId, l.section]), [['herald.request.toll', 'warning']])
  assert.match(lines[0].text, /demands a toll of 40/)
  const told = logged(realm(), [
    { day: YESTERDAY, kind: 'request', rival: 'dwarf', request: 'dare', stage: 'met' },
    { day: YESTERDAY, kind: 'request', rival: 'orc', request: 'toll', stage: 'lapsed' },
    { day: YESTERDAY, kind: 'request', rival: 'goblin', request: 'itemOffer', stage: 'lapsed' }
  ])
  const ids = heraldView(told, START).lines.map((l) => l.textId)
  assert.ok(ids.includes('herald.request.met'))
  assert.ok(ids.includes('herald.request.lapsed'))
  assert.equal(ids.filter((i) => i === 'herald.request.lapsed').length, 1, 'an offer lapses untold')
})

test('R2: land one rival takes from another: the other rulers react in the Herald, and it leads their next Audience', () => {
  const hexId = realm().hexes.find((h) => h.owner === 'dwarf' && h.kind !== 'gate')!.id
  const state = logged(realm(), [{ day: YESTERDAY, kind: 'hexTransfer', hexId, from: 'dwarf', to: 'orc', how: 'conquest' }])
  const e = state.log.at(-1) as GameEvent
  const said = reactionsTo(state, e, DEV)
  assert.deepEqual(said.map((r) => r.rival).sort(), ['archmage', 'dwarf', 'goblin'], 'all but the taker')
  const line = heraldView(state, START, (x) => reactionsTo(state, x, DEV)).lines.find((l) => l.textId === 'herald.rival.takesFrom')
  assert.equal(line?.quotes?.length, 3)
  // Fresh, it is the first thing he speaks of; a week on, it is one topic among others.
  assert.equal(audienceTopic(state, 'goblin', START, DEV)?.id, 'heardTook')
  assert.equal(audienceTopic(state, 'dwarf', START, DEV)?.id, 'lostTo')
  assert.equal(reactionsTo(state, e, {}).length, 0, 'no line, no quote')
})

test('R1, R2: every ruler has a draft line for each request he makes and each answer, naming only its facts', () => {
  const rivals = (draftJson as unknown as { rivals: Record<string, { requests: Record<string, string> }> }).rivals
  const facts: Record<string, string[]> = { dare: [], itemOffer: ['item', 'price'], hexOffer: ['hex', 'price'], liftSiege: ['hex'], spareHex: ['hex', 'days'], toll: ['price'], granted: [], refused: [] }
  for (const rival of RIVAL_IDS) {
    const own = rival === 'goblin' ? ['itemOffer'] : rival === 'archmage' ? ['hexOffer'] : []
    for (const key of ['dare', 'liftSiege', 'spareHex', 'toll', 'granted', 'refused', ...own]) {
      const line = rivals[LINE_KEYS[rival]].requests[key]
      assert.ok(typeof line === 'string' && line.trim(), `${rival}: request ${key}`)
      for (const [, name] of line.matchAll(/\{(\w+)\}/g)) assert.ok(facts[key].includes(name), `${rival}: request ${key} names {${name}}`)
    }
  }
})
