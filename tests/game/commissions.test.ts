/**
 * Patch 10 stage 3 (docs/redesign/patch-10-proposals.md R1, R2; D-88; rules 3.17.0): commissions take the dares'
 * place. A ruler commissions deeds in his craft for the week ahead; the player takes it up or declines; taken up, it
 * pays at the close of the day it is met and costs a little unmet. A ruler below 0 sends his as a demand, in turn
 * with his toll.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { chronicle, pathsOf, renown } from '../../src/renderer/src/lib/game/dominion'
import { depthOf, isClaimableKind, strongholds } from '../../src/renderer/src/lib/game/map'
import { makeDeal, offerDeal } from '../../src/renderer/src/lib/game/land'
import { answerRequest, commissionNeed, commissionProgress, craftMarks, requestOf, requestsOf, requestsWeek, settleCommissions, ultimatumCommissions } from '../../src/renderer/src/lib/game/requests'
import { ultimatumBanners } from '../../src/renderer/src/lib/game/view/endgame'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { withWorld, worldOf } from '../../src/renderer/src/lib/game/state'
import { dealsView } from '../../src/renderer/src/lib/game/view/diplomacy'
import { withPurse } from './support/realm'
import { RIVAL_IDS, type CampaignState, type GameEvent, type GameEventKind, type GameEventMap, type HexState, type RivalId, type RulerRequest } from '../../src/renderer/src/lib/game/types'
import { requestCard, requestNote } from '../../src/renderer/src/lib/game/view/requests'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import linesJson from '../../rivalLines.json'
import { collector } from './support/grand'
import { realm } from './support/realm'
import { START, withOwner } from './support/war'

const Q = RULES.requests
const C = Q.commission
const YESTERDAY = addDays(START, -1)
const LAST = addDays(YESTERDAY, Q.answerDays)

function plainIn(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const forts = strongholds(hexes)
  return hexes.find((h) => h.march === march && !h.seam && !h.village && !forts.has(h.id) && isClaimableKind(h) && depthOf(h) === depth) as HexState
}

/** Every other ruler resolved, so `rival` is the only one who can ask. */
function only(state: CampaignState, rival: RivalId): CampaignState {
  return { ...state, rivals: Object.fromEntries(RIVAL_IDS.map((r) => [r, r === rival ? state.rivals[r] : { ...state.rivals[r], status: 'conquered' as const }])) as CampaignState['rivals'] }
}

function withRespect(state: CampaignState, rival: RivalId, respect: number): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } }
}

/** A commission of `rival`'s made at yesterday's close, open today. */
function commissioned(state: CampaignState, rival: RivalId, need: number, more: Partial<RulerRequest> = {}): CampaignState {
  const q: RulerRequest = { id: `req-${rival}`, rival, kind: 'commission', madeOn: YESTERDAY, until: LAST, need, ...more }
  return withWorld(state, { requests: [q] })
}

function rollDay(state: CampaignState, from = START): string {
  for (let k = 0; k < 60; k++) {
    const day = addDays(from, 7 * k)
    if (chance(state.campaign.seed, day, 'request:roll', Q.chance)) return day
  }
  throw new Error('no roll')
}

/** The request the world phase makes at the close of `day`, if any. */
function made(state: CampaignState, day: string): RulerRequest | undefined {
  return requestsOf(requestsWeek({ ...state, settlement: { ...state.settlement, lastLaunch: day } }, { day, week: 10, emit: () => undefined }))[0]
}

function logged(state: CampaignState, events: ({ day: string; kind: GameEventKind } & Record<string, unknown>)[]): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ ...e, id: `t-${state.log.length + i}` }) as GameEvent)] }
}

const fieldDay = (day: string, streak: number): { day: string; kind: GameEventKind } & Record<string, unknown> => ({ day, kind: 'deed', path: 'orc', deed: 'fieldDay', value: 0.25, streak })

/** The `commissions` phase at the close of `day`: the day's (`closing` false), or the week's, which judges a commission's last day. */
function settled(state: CampaignState, day: string, closing = false): { state: CampaignState; requests: GameEventMap['request'][]; respect: GameEventMap['respect'][]; deeds: GameEventMap['deed'][] } {
  const c = collector()
  const next = settleCommissions(state, day, c.emit, closing)
  return { state: next, requests: c.of('request'), respect: c.of('respect'), deeds: c.of('deed') }
}

test('R1: each ruler commissions a deed of his own craft, sized by the rules, and asks nothing when it can’t be done now', () => {
  const s0 = chronicle(realm(), () => undefined)
  const day = rollDay(s0)
  // Skivvet can always ask for a hex won by coin.
  assert.deepEqual([commissionNeed(s0, 'goblin', day)], [C.one])
  // Ugrak asks only while his field is in reach; with a streak of a week alive he asks for more days.
  assert.equal(commissionNeed(s0, 'orc', day), undefined, 'no land beside his march yet')
  const near = withOwner(s0, [plainIn(s0.hexes, 'orc', 1).id], 'player')
  assert.equal(commissionNeed(near, 'orc', day), C.fieldDays)
  const onStreak: CampaignState = { ...near, paths: { ...pathsOf(near), field: { days: C.streakFor, through: day } } }
  assert.equal(commissionNeed(onStreak, 'orc', day), C.fieldDaysOnStreak)
  // Hrodgar sizes his by the deepest band the player holds.
  assert.equal(commissionNeed(s0, 'dwarf', day), undefined, 'nothing held beyond the protected rings')
  assert.equal(commissionNeed(near, 'dwarf', day), C.wallLevels[0])
  const deep = withOwner(near, [plainIn(s0.hexes, 'goblin', 10).id], 'player')
  assert.equal(commissionNeed(deep, 'dwarf', day), C.wallLevels[2])
  // Emrys asks only while the player holds a hex of his march.
  assert.equal(commissionNeed(near, 'archmage', day), undefined)
  assert.equal(commissionNeed(withOwner(s0, [plainIn(s0.hexes, 'archmage', 1).id], 'player'), 'archmage', day), C.one)

  // The world phase sends it as a commission; a ruler who can't ask leaves the turn to one who can.
  const q = made(only(withRespect(near, 'orc', 30), 'orc'), day)
  assert.deepEqual([q?.kind, q?.rival, q?.need, q?.demand, q?.accepted], ['commission', 'orc', C.fieldDays, undefined, undefined])
  assert.equal(made(only(withRespect(s0, 'orc', 30), 'orc'), day), undefined, 'Ugrak alone, out of reach: nothing asked')
  assert.equal(made(s0, day)?.kind, 'commission', 'someone who can ask does')
})

test('R1: taken up, a commission is met at the close of the day the log holds its deeds: his Respect and Renown on his path, at once', () => {
  const s0 = commissioned(only(realm(), 'orc'), 'orc', 2)
  const taken = answerRequest(s0, 'orc', 'grant', START)
  assert.equal(taken.ok, true)
  assert.equal(requestOf(taken.state, 'orc', START)?.accepted, START)
  assert.deepEqual(taken.state.log.slice(s0.log.length).map((e) => (e.kind === 'request' ? [e.request, e.stage, e.need] : [e.kind])), [['commission', 'accepted', 2]])
  assert.equal(answerRequest(taken.state, 'orc', 'grant', START).reason, 'accepted')
  assert.equal(answerRequest(taken.state, 'orc', 'refuse', START).reason, 'accepted', 'once taken up it can’t be declined')

  // One field day: not yet. A deed from before the commission came never counts.
  const one = logged(taken.state, [fieldDay(addDays(YESTERDAY, -1), 1), fieldDay(START, 2)])
  assert.equal(commissionProgress(one, requestsOf(one)[0]), 1)
  const waiting = settled(one, START)
  assert.deepEqual([waiting.requests, waiting.respect, requestsOf(waiting.state).length], [[], [], 1])

  const two = logged(one, [fieldDay(addDays(START, 1), 3)])
  const met = settled(two, addDays(START, 1))
  assert.deepEqual(met.requests.map((e) => [e.request, e.stage, e.need, e.done]), [['commission', 'met', 2, 2]])
  assert.deepEqual(met.respect.map((e) => [e.rival, e.change, e.reason]), [['orc', C.met, 'commissionMet']])
  assert.deepEqual(met.deeds.map((e) => [e.path, e.deed, e.value]), [['orc', 'commissionMet', C.renown]])
  assert.equal(renown(met.state).orc - renown(two).orc, C.renown)
  assert.equal(requestsOf(met.state).length, 0)
  // Settle once: nothing more the next day.
  assert.deepEqual(settled(met.state, addDays(START, 2)).requests, [])
})

test('R1: taken up and unmet it costs a little at its last day’s close; never taken up it lapses at no cost; away, either ends quietly', () => {
  const s0 = commissioned(only(realm(), 'orc'), 'orc', 4)
  const taken = answerRequest(s0, 'orc', 'grant', START).state
  assert.deepEqual(settled(taken, addDays(LAST, -1)).requests, [], 'not before its last day')
  // Its last day is a week close: the day's phase leaves it for the week's, which runs after that close's own postings.
  assert.deepEqual(settled(taken, LAST).requests, [])
  const missed = settled(taken, LAST, true)
  assert.deepEqual(missed.requests.map((e) => [e.stage, e.need, e.done]), [['missed', 4, 0]])
  assert.deepEqual(missed.respect.map((e) => [e.change, e.reason]), [[C.missed, 'commissionMissed']])
  assert.equal(requestsOf(missed.state).length, 0)

  const lapsed = settled(s0, LAST, true)
  assert.deepEqual([lapsed.requests.map((e) => e.stage), lapsed.respect, requestsOf(lapsed.state).length], [['lapsed'], [], 0])

  const away: CampaignState = { ...taken, settlement: { ...taken.settlement, lastLaunch: addDays(LAST, -RULES.clock.absenceDays) } }
  const quiet = settled(away, LAST, true)
  assert.deepEqual([quiet.requests, quiet.respect, requestsOf(quiet.state).length], [[], [], 0])
  assert.equal(quiet.state.rivals.orc.respect, away.rivals.orc.respect)
})

test('R1, R2: declined, a commission costs nothing; sent as a demand by a ruler below 0 it stands at once, and refusing or missing it costs as a demand does', () => {
  const s0 = commissioned(only(realm(), 'dwarf'), 'dwarf', 2)
  const declined = answerRequest(s0, 'dwarf', 'refuse', START)
  assert.equal(declined.ok, true)
  assert.equal(declined.state.rivals.dwarf.respect, s0.rivals.dwarf.respect)
  assert.deepEqual(declined.state.log.slice(s0.log.length).map((e) => (e.kind === 'request' ? e.stage : e.kind)), ['declined'])
  assert.equal(requestsOf(declined.state).length, 0)

  const demanded = commissioned(only(withRespect(realm(), 'dwarf', -10), 'dwarf'), 'dwarf', 2, { demand: true })
  assert.equal(answerRequest(demanded, 'dwarf', 'grant', START).reason, 'accepted', 'a demand is already in force')
  const refused = answerRequest(demanded, 'dwarf', 'refuse', START)
  assert.equal(refused.state.rivals.dwarf.respect, -10 + Q.demand.refused)
  assert.deepEqual(refused.state.log.slice(demanded.log.length).map((e) => (e.kind === 'request' ? e.stage : e.kind === 'respect' ? e.reason : e.kind)), ['refused', 'commissionRefused'])

  const wall = (day: string, level: number): { day: string; kind: GameEventKind } & Record<string, unknown> => ({ day, kind: 'deed', path: 'dwarf', deed: 'wallRaised', value: 1.2, level })
  const met = settled(logged(demanded, [wall(START, 1), wall(START, 2)]), START)
  assert.deepEqual(met.respect.map((e) => [e.change, e.reason]), [[Q.demand.granted, 'commissionMet']])
  assert.deepEqual(met.deeds.map((e) => [e.deed, e.value]), [['commissionMet', C.renown]])
  const unmet = settled(demanded, LAST, true)
  assert.deepEqual(unmet.respect.map((e) => [e.change, e.reason]), [[Q.demand.refused, 'commissionMissed']])
})

test('R2: a ruler below 0 sends a toll and a commission in turn, the commission as a demand', () => {
  const s0 = chronicle(realm(), () => undefined)
  const base = only(withRespect(withOwner(s0, [plainIn(s0.hexes, 'dwarf', 1).id], 'player'), 'dwarf', -10), 'dwarf')
  const day = rollDay(base)
  assert.equal(made(base, day)?.kind, 'toll', 'the toll first')
  const afterToll = logged(base, [{ day: addDays(day, -7), kind: 'request', rival: 'dwarf', request: 'toll', stage: 'made' }])
  const way = made(afterToll, day)
  assert.deepEqual([way?.kind, way?.demand, way?.need], ['commission', true, C.wallLevels[0]])
  const afterWay = logged(afterToll, [{ day: addDays(day, -1), kind: 'request', rival: 'dwarf', request: 'commission', stage: 'made' }])
  assert.equal(made(afterWay, day)?.kind, 'toll', 'and back')
})

test('R1: the Audience’s card says what he asks, how far it has come and what each answer does; the Herald tells one met or unmet', () => {
  const s0 = commissioned(only(realm(), 'orc'), 'orc', 4)
  const open = requestCard(s0, 'orc', START, linesJson)
  assert.equal(open?.title, 'His commission')
  assert.match(open?.asks ?? '', /^4 days in his field/)
  assert.equal(open?.progress, 'So far: 0 of 4.')
  assert.deepEqual([open?.grantLabel, open?.refuseLabel], ['Take it up', 'Decline'])
  assert.match(open?.rule ?? '', new RegExp(`\\+${C.met} Respect and ${C.renown} Renown on his path`))
  assert.match(requestNote(s0, 'orc', START) ?? '', /His commission awaits your answer/)

  const taken = logged(answerRequest(s0, 'orc', 'grant', START).state, [fieldDay(START, 1)])
  const stands = requestCard(taken, 'orc', START, linesJson)
  assert.deepEqual([stands?.title, stands?.progress, stands?.grantLabel], ['His commission, taken up', 'So far: 1 of 4.', undefined])
  assert.match(requestNote(taken, 'orc', START) ?? '', /His commission stands through/)

  const demand = requestCard(commissioned(only(withRespect(realm(), 'orc', -10), 'orc'), 'orc', 4, { demand: true }), 'orc', START, linesJson)
  assert.equal(demand?.title, 'His demand')
  assert.match(demand?.rule ?? '', new RegExp(`Refused or unmet: −${-Q.demand.refused} Respect`))

  for (const stage of ['met', 'missed'] as const) {
    const line = resultLine({ id: 'e1', day: START, kind: 'request', rival: 'orc', request: 'commission', stage, need: 4, done: 4 })
    assert.equal(line?.textId, `herald.commission.${stage}`)
    assert.doesNotMatch(line?.text ?? '', /\{/)
  }
  assert.equal(resultLine({ id: 'e2', day: START, kind: 'request', rival: 'orc', request: 'commission', stage: 'accepted', need: 4 }), null, 'the player’s own answer goes untold')
  const deed = resultLine({ id: 'e3', day: START, kind: 'deed', path: 'orc', deed: 'commissionMet', value: C.renown })
  assert.match(deed?.text ?? '', new RegExp(`commission met: ${C.renown} Renown`))
})

test('R3 (D-89): the first time the player reaches a mark in a ruler’s craft he offers his own deal at no price, once', () => {
  const marks = Q.craftMarks
  const wall = (day: string, i: number): { day: string; kind: GameEventKind } & Record<string, unknown> => ({ day, kind: 'deed', path: 'dwarf', deed: 'wallRaised', value: 1.2, level: 1, hexId: `h${i}` })
  const s0 = withPurse(withRespect(realm(), 'dwarf', 80), 1_000)
  const usual = offerDeal(s0, 'dwarf', { kind: 'oath' }, START)
  assert.ok(usual.allowed && usual.price > 0 && usual.gift === undefined)

  // One level short: nothing. The tenth level, raised today: he offers.
  const short = logged(s0, Array.from({ length: marks.wallLevels - 1 }, (_, i) => wall(START, i)))
  const none = collector()
  assert.equal(worldOf(craftMarks(short, START, none.emit)).craftGifts?.dwarf, undefined)
  const reached = logged(short, [wall(START, 99)])
  const c = collector()
  const offered = craftMarks(reached, START, c.emit)
  assert.equal(worldOf(offered).craftGifts?.dwarf, 'offered')
  assert.deepEqual(c.of('craftMark'), [{ rival: 'dwarf' }])
  assert.deepEqual(collector().events.length + craftMarks(offered, START, none.emit).log.length, offered.log.length, 'once')
  assert.equal(none.of('craftMark').length, 0)

  const gift = offerDeal(offered, 'dwarf', { kind: 'oath' }, START)
  assert.deepEqual([gift.allowed, gift.price, gift.gift], [true, 0, true])
  assert.equal(offerDeal(offered, 'dwarf', { kind: 'pact' }, START).price, usual.price, 'only his own deal')
  assert.match(dealsView(offered, 'dwarf', START).find((d) => d.kind === 'oath')?.effect ?? '', /His gift for your first mark in his craft: at no price, this once\./)

  const struck = makeDeal(offered, 'dwarf', { kind: 'oath' }, START)
  assert.deepEqual([struck.ok, struck.cost], [true, 0])
  assert.equal(worldOf(struck.state).craftGifts?.dwarf, 'taken')
  assert.equal(struck.state.log.findLast((e) => e.kind === 'deal')?.kind === 'deal' && struck.state.log.findLast((e) => e.kind === 'deal' && e.gift === true) !== undefined, true)
  // Taken, it is never offered again: more walls change nothing.
  const later = craftMarks(logged(struck.state, [wall(addDays(START, 1), 100)]), addDays(START, 1), none.emit)
  assert.equal(worldOf(later).craftGifts?.dwarf, 'taken')
})

test('R3 (D-89): Ugrak’s mark is a streak of a week in his field; his gift is the trial with no wait', () => {
  const s0 = realm()
  const tried = logged(s0, [{ day: addDays(START, -3), kind: 'deal', rival: 'orc', deal: 'trial', price: 0 }])
  assert.equal(offerDeal(tried, 'orc', { kind: 'trial' }, START).reason?.code, 'tooSoon')
  const onStreak: CampaignState = { ...tried, paths: { ...pathsOf(tried), field: { days: Q.craftMarks.fieldStreak, through: START } } }
  const c = collector()
  const offered = craftMarks(onStreak, START, c.emit)
  assert.deepEqual(c.of('craftMark'), [{ rival: 'orc' }])
  const gift = offerDeal(offered, 'orc', { kind: 'trial' }, START)
  assert.deepEqual([gift.allowed, gift.gift], [true, true])
  // A day short, or a streak that only held through today without counting, offers nothing.
  const shortStreak: CampaignState = { ...tried, paths: { ...pathsOf(tried), field: { days: Q.craftMarks.fieldStreak - 1, through: START } } }
  assert.equal(worldOf(craftMarks(shortStreak, START, c.emit)).craftGifts?.orc, undefined)
})

// ── R6: an Ultimatum answered by commissions ─────────────────────────────────

/** A pending Siege of the Crown sent by `members`, on `battleDate`, with each member's Ultimatum standing. */
function besieged(state: CampaignState, members: RivalId[], battleDate: string): CampaignState {
  const castle = state.hexes.find((h) => h.kind === 'castle') as HexState
  const siege = { id: 'gb-siege', trigger: 'siege' as const, hexId: castle.id, announcedOn: YESTERDAY, battleDate, enemy: [], rival: members[0], ...(members.length > 1 ? { members } : {}) }
  const rivals = { ...state.rivals }
  for (const r of members) rivals[r] = { ...rivals[r], ultimatumUntil: battleDate, ascendancyStreak: 4 }
  return { ...state, rivals, grandBattles: [...state.grandBattles, siege] }
}

test('R6 (D-90): an Ultimatum’s rulers each name a commission of their craft, in force at once and never refused; any request of theirs still open gives way', () => {
  const s0 = chronicle(realm(), () => undefined)
  const near = withOwner(s0, [plainIn(s0.hexes, 'dwarf', 1).id, plainIn(s0.hexes, 'orc', 1).id], 'player')
  const open = withWorld(near, { requests: [{ id: 'old', rival: 'dwarf', kind: 'toll', madeOn: addDays(YESTERDAY, -2), until: addDays(YESTERDAY, 5), price: 40 }] })
  const c = collector()
  const until = addDays(YESTERDAY, 14)
  const named = ultimatumCommissions(besieged(open, ['dwarf', 'orc'], addDays(until, 1)), ['dwarf', 'orc'], YESTERDAY, until, c.emit)
  const qs = requestsOf(named)
  assert.deepEqual(qs.map((q) => [q.rival, q.kind, q.ultimatum, q.until, q.need]), [['dwarf', 'commission', true, until, C.wallLevels[0]], ['orc', 'commission', true, until, C.fieldDays]])
  assert.deepEqual(c.of('request').map((e) => [e.rival, e.stage, e.ultimatum]), [['dwarf', 'made', true], ['orc', 'made', true]])
  assert.equal(answerRequest(named, 'dwarf', 'grant', START).reason, 'accepted')
  assert.equal(answerRequest(named, 'dwarf', 'refuse', START).reason, 'accepted')
  const card = requestCard(named, 'dwarf', START, linesJson)
  assert.deepEqual([card?.title, card?.grantLabel], ['His terms to stand down', undefined])
  assert.match(card?.rule ?? '', /he stands down from the Siege of the Crown/)
  assert.match(requestNote(named, 'dwarf', START) ?? '', /His terms to stand down from the Siege stand through/)
  assert.match(ultimatumBanners(named, START)[0]?.lifts ?? '', /Or meet the commission Hrodgar and Ugrak each name in their Audience/)
})

test('R6 (D-90): a lone ruler’s terms met, he stands down and the Siege is called off; unmet, it costs nothing more', () => {
  const until = addDays(YESTERDAY, 14)
  const s0 = besieged(commissioned(only(realm(), 'dwarf'), 'dwarf', 2, { ultimatum: true, until }), ['dwarf'], addDays(until, 1))
  const wall = (day: string, i: number): { day: string; kind: GameEventKind } & Record<string, unknown> => ({ day, kind: 'deed', path: 'dwarf', deed: 'wallRaised', value: 1.2, level: 1, hexId: `w${i}` })
  const c = collector()
  const met = settleCommissions(logged(s0, [wall(START, 1), wall(START, 2)]), START, c.emit)
  assert.equal(met.rivals.dwarf.ultimatumUntil, undefined)
  assert.equal(met.rivals.dwarf.ascendancyStreak, 0)
  assert.equal(met.grandBattles.some((b) => b.trigger === 'siege'), false, 'the Siege is called off')
  assert.deepEqual(c.of('ascendancy').map((e) => [e.rival, e.stage]), [['dwarf', 'lifted']])
  assert.deepEqual(c.of('respect').map((e) => [e.change, e.reason]), [[C.met, 'commissionMet']])
  assert.deepEqual(c.of('deed').map((e) => e.deed), ['commissionMet'])

  const u = collector()
  // Present that day (a launch), so the miss is told: away, it would end quietly (X-17).
  const unmet = settleCommissions({ ...s0, settlement: { ...s0.settlement, lastLaunch: until } }, until, u.emit, true)
  assert.deepEqual(u.of('request').map((e) => [e.stage, e.ultimatum]), [['missed', true]])
  assert.deepEqual(u.of('respect'), [], 'no Respect lost: the Siege still comes')
  assert.equal(unmet.grandBattles.some((b) => b.trigger === 'siege'), true)

  // The Ultimatum gone some other way (lifted, fought): its terms end quietly.
  const lifted: CampaignState = { ...s0, rivals: { ...s0.rivals, dwarf: { ...s0.rivals.dwarf, ultimatumUntil: undefined } } }
  const q = collector()
  assert.equal(requestsOf(settleCommissions(lifted, START, q.emit)).length, 0)
  assert.deepEqual(q.events, [])
})

test('R6 (D-90): a coalition’s Siege stands while any member still sends it, and is called off once all have stood down', () => {
  const until = addDays(YESTERDAY, 14)
  const both = withWorld(besieged(realm(), ['dwarf', 'goblin'], addDays(until, 1)), {
    requests: [
      { id: 'u-dwarf', rival: 'dwarf', kind: 'commission', madeOn: YESTERDAY, until, need: 1, ultimatum: true },
      { id: 'u-goblin', rival: 'goblin', kind: 'commission', madeOn: YESTERDAY, until, need: 1, ultimatum: true }
    ]
  })
  const deed = (path: RivalId, d: string, day: string): { day: string; kind: GameEventKind } & Record<string, unknown> => ({ day, kind: 'deed', path, deed: d, value: 1, level: 1, hexId: `${path}-h` })
  const c1 = collector()
  const one = settleCommissions(logged(both, [deed('dwarf', 'wallRaised', START)]), START, c1.emit)
  assert.deepEqual(c1.of('ascendancy').map((e) => [e.rival, e.stage]), [['dwarf', 'stoodDown']])
  assert.equal(one.grandBattles.some((b) => b.trigger === 'siege'), true, 'Skivvet still sends it')
  assert.equal(one.rivals.goblin.ultimatumUntil, addDays(until, 1))
  const c2 = collector()
  const all = settleCommissions(logged(one, [deed('goblin', 'dealTaken', addDays(START, 1))]), addDays(START, 1), c2.emit)
  assert.deepEqual(c2.of('ascendancy').map((e) => [e.rival, e.stage, e.members]), [['goblin', 'stoodDown', undefined], ['dwarf', 'lifted', ['dwarf', 'goblin']]])
  assert.equal(all.grandBattles.some((b) => b.trigger === 'siege'), false)
  for (const stage of ['stoodDown', 'lifted'] as const) assert.doesNotMatch(resultLine({ id: 'e', day: START, kind: 'ascendancy', rival: 'goblin', stage })?.text ?? '{', /\{/)
})
