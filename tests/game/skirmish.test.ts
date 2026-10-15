/**
 * D-12: the day's fights a player leads on the battle map ("Start battle"). What is fought and in
 * what order, the enemy's size, the Valor and orders that lock, exact replays, and the close:
 * a led fight's result stands in for the formula's, one never begun is left to the formula, one
 * left unfinished is finished by the Marshal, and resettling changes nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayCloseInstant } from '../../src/renderer/src/lib/game/clock'
import { assaultValue, companyMatch, defenseBanners, defenseValue, foeOfThreat, garrisonType, isRevealDen, rally, setOrders } from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { fieldResult, isOver, marshalPlay, playRoundOn, startField } from '../../src/renderer/src/lib/game/grand/field'
import { claimableBy, neighbors } from '../../src/renderer/src/lib/game/map'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { settle } from '../../src/renderer/src/lib/game/settle'
import {
  beginFight,
  enemyScale,
  fightSetup,
  hostScale,
  marshalAllFights,
  matchupOf,
  playFightRound,
  skirmishField,
  startSkirmishes,
  todaysFights,
  type FightPlan
} from '../../src/renderer/src/lib/game/skirmish'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { skirmishFieldView, skirmishReplayView } from '../../src/renderer/src/lib/game/view/battle'
import { ordersLock } from '../../src/renderer/src/lib/game/view/orders'
import { skirmishRefusalLabel } from '../../src/renderer/src/lib/game/view/refusals'
import { heraldView } from '../../src/renderer/src/lib/game/view/shell'
import { fightIntro, fightResult, ledYesterday, skirmishButton, skirmishDayView } from '../../src/renderer/src/lib/game/view/skirmish'
import type { CampaignState, GameEvent, HexState, ISODate } from '../../src/renderer/src/lib/game/types'
import { chicago } from './fixtures/ledgers'
import { driveCampaign, habitLedger } from './support/campaign-driver'

const SEED = 7
const WEEKS = 14
const ledger = habitLedger(SEED, 'steady', WEEKS * 7 + 7)
const base = driveCampaign({ seed: SEED, weeks: WEEKS, habits: 'steady', policy: 'greedy' }).state
const today = openDayOf(base)

/** The day's orders with one assault on a neutral hex beside the realm, sent the two strongest companies. */
function withAssault(state: CampaignState, day: ISODate): CampaignState {
  const army = roster(state, { day }, realmEffects(state))
  const target = state.hexes.find((h) => h.owner === 'neutral' && !h.village && h.kind !== 'lairMouth' && claimableBy(state.hexes, h.id, 'player', 'assault'))
  if (!target) return state
  const sent = [...army].sort((a, b) => b.power - a.power).slice(0, 2).map((c) => c.id)
  return setOrders(state, { date: day, assaultTarget: target.id, assault: sent, defense: [] }).state
}

const ordered = withAssault(base, today)
const closeOf = (day: ISODate): Date => chicago(addDays(day, 1))
type BattleEvent = Extract<GameEvent, { kind: 'defense' | 'assault' }>
const eventsOn = (state: CampaignState, day: ISODate): BattleEvent[] => state.log.filter((e): e is BattleEvent => e.day === day && (e.kind === 'defense' || e.kind === 'assault'))

test('the day’s fights: the defense battles first, then the assaults, each with what the formula would field', () => {
  const plans = todaysFights(ordered, today)
  assert.ok(plans.length >= 2, 'a defense and the assault')
  const firstAssault = plans.findIndex((p) => p.side === 'assault')
  assert.ok(firstAssault > 0 && plans.slice(firstAssault).every((p) => p.side === 'assault'), 'defenses come first')
  const effects = realmEffects(ordered)
  const sent = ordered.orders.find((o) => o.date === today)?.assault ?? []
  for (const p of plans) {
    assert.ok(p.companies.length > 0)
    if (p.side === 'defense') assert.ok(p.companies.length <= defenseBanners(effects) && p.companies.every((c) => !sent.includes(c.id)), 'defenders stay out of the assault')
    else assert.ok(p.companies.every((c) => sent.includes(c.id)), 'the assault fields its own companies')
  }
})

test('the enemy fields as many companies as the player, its power the strength × the scale for that count (mythic foes smaller)', () => {
  const plans = todaysFights(ordered, today)
  const started = startSkirmishes(ordered, today, 0.8)
  assert.ok(started.ok && started.day)
  started.day.fights.forEach((f, i) => {
    const n = f.companies.length
    assert.equal(f.enemy.length, n)
    const total = f.enemy.reduce((s, c) => s + c.power, 0)
    const want = plans[i].strength * enemyScale(plans[i], n)
    assert.ok(Math.abs(total - want) <= 0.1 * n, `${f.id}: ${total} vs ${want}`)
    assert.equal(f.setup.rounds, RULES.skirmish.rounds)
  })
  assert.equal(hostScale(0), RULES.skirmish.hostScale[0])
  assert.equal(hostScale(9), RULES.skirmish.hostScale.at(-1))
  assert.equal(enemyScale({ enemy: { kind: 'mythic' } }, 3), hostScale(3) * RULES.skirmish.mythicScale)
  assert.equal(enemyScale({ enemy: { kind: 'beasts' } }, 3), hostScale(3))
})

test('Start battle locks the Valor and the orders; it is refused again, on another day, and its Valor is 0 to 1', () => {
  const started = startSkirmishes(ordered, today, 0.83)
  assert.ok(started.ok && started.day)
  assert.equal(started.day.valor, 0.83)
  const floor = realmEffects(ordered).rallyFloor.value
  for (const f of started.day.fights) assert.equal(f.setup.readiness, rally(floor, 0.83))
  assert.equal(startSkirmishes(started.state, today, 1).reason, 'started')
  assert.equal(startSkirmishes(ordered, addDays(today, 1), 1).reason, 'notToday')
  const locked = setOrders(started.state, { date: today, assault: [], defense: [] })
  assert.equal(locked.state, started.state, 'the orders hold')
  assert.equal(locked.validity.problems[0]?.code, 'ordersLocked')
  assert.equal(startSkirmishes(ordered, today, 1.7).day?.valor, 1)
  assert.equal(startSkirmishes(ordered, today, -1).day?.valor, 0)
})

test('a fight is the same every time it is set up, replays from its rounds, and its last round sets its result', () => {
  const a = startSkirmishes(ordered, today, 0.9)
  const b = startSkirmishes(ordered, today, 0.9)
  assert.deepEqual(a.day, b.day)
  let state = a.state
  const id = a.day?.fights[0].id as string
  for (let i = 0; i < RULES.skirmish.rounds; i++) {
    const fight = state.skirmishes?.[0].fights.find((f) => f.id === id)
    if (!fight || fight.result !== undefined) break
    const played = playFightRound(state, today, id, marshalPlay(skirmishField(fight)))
    assert.ok(played.ok, played.reason)
    state = played.state
  }
  const fight = state.skirmishes?.[0].fights.find((f) => f.id === id)
  assert.ok(fight?.result !== undefined && fight.begun)
  assert.equal(fight.result, fieldResult(skirmishField(fight)))
  assert.equal(playFightRound(state, today, id, {}).reason, 'fought')
})

test('at the close a led fight’s result stands in for the formula’s, and resettling changes nothing', () => {
  const fought = marshalAllFights(ordered, today, 0.9)
  const fights = fought.skirmishes?.find((d) => d.day === today)?.fights ?? []
  assert.ok(fights.length > 0 && fights.every((f) => f.result !== undefined))
  const settled = settle(fought, ledger, closeOf(today)).state
  const events = eventsOn(settled, today)
  const led = events.filter((e) => (e.kind === 'defense' || e.kind === 'assault') && e.led)
  assert.equal(led.length, fights.length)
  for (const f of fights) {
    const e = events.find((x) => x.hexId === f.hexId && x.kind === (f.side === 'defense' ? 'defense' : 'assault'))
    assert.ok(e, f.id)
    const want = f.side === 'defense' ? f.result : f.result === 'rout' ? 'rout' : f.result === 'victory' ? 'taken' : 'repulsed'
    assert.equal(e.outcome, want, f.id)
  }
  assert.deepEqual(settle(settled, ledger, closeOf(today)).state, settled)
})

test('a fight never begun is left to the formula; one begun and left unfinished is finished by the Marshal', () => {
  const formulaOnly = eventsOn(settle(ordered, ledger, closeOf(today)).state, today)
  const started = startSkirmishes(ordered, today, 0.9)
  assert.ok(started.ok && started.day)
  const untouched = eventsOn(settle(started.state, ledger, closeOf(today)).state, today)
  assert.deepEqual(untouched, formulaOnly, 'never begun: exactly the formula')

  const first = started.day.fights[0]
  const begun = beginFight(started.state, today, first.id)
  assert.ok(begun.ok)
  const settled = settle(begun.state, ledger, closeOf(today)).state
  const kept = settled.skirmishes?.find((d) => d.day === today)?.fights.find((f) => f.id === first.id)
  assert.ok(kept?.result !== undefined && kept.log.length > 0, 'the Marshal finished it')
  const events = eventsOn(settled, today)
  assert.equal(events.filter((e) => (e.kind === 'defense' || e.kind === 'assault') && e.led).length, 1, 'only the begun fight is led')
})

test('led fights are kept a week; a save without any gains nothing', () => {
  const old = { day: addDays(today, -RULES.skirmish.keepDays), valor: 1, fights: [] }
  const started = startSkirmishes(ordered, today, 0.9)
  const withOld = { ...started.state, skirmishes: [old, ...(started.state.skirmishes ?? [])] }
  const settled = settle(withOld, ledger, closeOf(today)).state
  assert.deepEqual(settled.skirmishes?.map((d) => d.day), [today])
  assert.equal('skirmishes' in settle(ordered, ledger, closeOf(today)).state, false)
})

/** What the close's formula does with a fight at a Valor. */
function formulaWins(state: CampaignState, plan: FightPlan, valor: number): boolean {
  const effects = realmEffects(state)
  const hex = state.hexes.find((h) => h.id === plan.hexId) as HexState
  const foe = plan.side === 'defense' ? foeOfThreat(plan.threat ?? 'beasts') : garrisonType(hex).foe
  const strikes = plan.companies.map((c) => c.power * companyMatch(c, matchupOf(plan), foe))
  const common = { strikes, armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor }
  return (plan.side === 'defense' ? defenseValue({ ...common, walls: plan.walls, fortification: 0 }).defense : assaultValue(common)) >= plan.strength
}

test('calibration guard: the Marshal’s play mostly reaches the formula’s result (hostScale, sim/skirmish-calibrate.ts)', () => {
  let fights = 0
  let same = 0
  for (const seed of [1, 2, 3, 4]) {
    for (const weeks of [8, 16]) {
      const state = driveCampaign({ seed, weeks, habits: 'steady', policy: 'greedy' }).state
      const day = openDayOf(state)
      const s = withAssault(state, day)
      for (const valor of [0.6, 1]) {
        for (const plan of todaysFights(s, day)) {
          let f = startField(fightSetup(s, plan, valor, day).setup)
          while (!isOver(f)) f = playRoundOn(f, marshalPlay(f)).field
          fights++
          if ((fieldResult(f) !== 'defeat') === formulaWins(s, plan, valor)) same++
        }
      }
    }
  }
  assert.ok(fights >= 16, `${fights} fights`)
  assert.ok(same / fights >= 0.7, `${same} of ${fights} agree`)
})

// ── The screens (stage 2): the Start button, the orders lock, the day's fights, a fight's opening and result ──

test('the Start button gives the day’s fight count, then where they stand at the locked Valor; the orders panel holds once they begin', () => {
  const hourBefore = new Date(dayCloseInstant(today, ordered.campaign.timeZone).getTime() - 3_600_000)
  const before = skirmishButton(ordered, 0.8, today)
  assert.deepEqual([before.show, before.started, before.count, before.fought, before.valor], [true, false, todaysFights(ordered, today).length, 0, 0.8])
  assert.deepEqual([ordersLock(ordered, today, hourBefore).locked, ordersLock(ordered, today, hourBefore).held], [false, false])
  assert.equal(skirmishButton(ordered, 0.8, addDays(today, 1)).show, false, 'only on the open day')

  const started = startSkirmishes(ordered, today, 0.8)
  assert.ok(started.ok)
  const after = skirmishButton(started.state, 0.95, today)
  assert.deepEqual([after.show, after.started, after.count, after.fought, after.valor], [true, true, before.count, 0, 0.8], 'the Valor shown is the locked one')
  const lock = ordersLock(started.state, today, hourBefore)
  assert.deepEqual([lock.locked, lock.held, lock.secondsLeft], [true, true, 3_600])
  assert.equal(skirmishRefusalLabel('started'), 'Today’s battles have already begun.')
})

test('the skirmish screen: the fights in order, each one’s opening, its rounds on the field, and its result told as the close then posts it', () => {
  const started = startSkirmishes(ordered, today, 0.9)
  assert.ok(started.ok && started.day)
  let state = started.state
  const view = skirmishDayView(state, today)
  assert.ok(view?.open)
  assert.deepEqual(view.fights.map((f) => f.id), started.day.fights.map((f) => f.id))
  assert.ok(view.fights.every((f) => f.status === 'waiting'))
  assert.equal(view.next, view.fights[0].id)
  assert.equal(view.valor, 0.9)

  const id = view.fights[0].id
  const first = started.day.fights[0]
  const intro = fightIntro(state, today, id)
  assert.ok(intro)
  assert.equal(intro.enemy.reduce((s, e) => s + e.count, 0), first.enemy.length)
  assert.equal(intro.yours.length, first.companies.length)
  assert.deepEqual([intro.rounds, intro.readiness], [RULES.skirmish.rounds, first.setup.readiness])
  if (intro.side === 'defense' && realmEffects(state).reveals.threatStrength.whom === 'none') assert.ok(!/\d/.test(intro.strength), `a defense shows a band, not a number: ${intro.strength}`)
  assert.equal(fightResult(state, today, id), null, 'no result before it is fought')

  state = beginFight(state, today, id).state
  assert.equal(skirmishDayView(state, today)?.fights[0].status, 'underway')
  for (;;) {
    const field = skirmishFieldView(state, today, id)
    assert.ok(field)
    assert.equal(field.rounds, RULES.skirmish.rounds)
    if (field.over) break
    const fight = state.skirmishes?.find((d) => d.day === today)?.fights.find((f) => f.id === id)
    assert.ok(fight)
    const played = playFightRound(state, today, id, marshalPlay(skirmishField(fight)))
    assert.ok(played.ok, played.reason)
    state = played.state
  }
  const fought = state.skirmishes?.find((d) => d.day === today)?.fights.find((f) => f.id === id)
  assert.ok(fought?.result)
  const row = skirmishDayView(state, today)
  assert.equal(row?.fights[0].status, fought.result)
  assert.equal(row?.next, row?.fights[1]?.id ?? null)
  assert.equal(skirmishReplayView(state, today, id)?.frames.length, fought.log.length + 1)

  const preview = fightResult(state, today, id)
  assert.ok(preview?.report, 'a report as the close would post it')
  assert.deepEqual([preview.result, preview.posted], [fought.result, false])
  const settled = settle(state, ledger, closeOf(today)).state
  const posted = fightResult(settled, today, id)
  assert.equal(posted?.posted, true)
  assert.deepEqual([posted.report?.textId, posted.report?.facts], [preview.report.textId, preview.report.facts], 'the close posts what the result screen said')
  const closed = skirmishDayView(settled, today)
  assert.deepEqual([closed?.open, closed?.next], [false, null])
  assert.ok(closed?.fights.slice(1).every((f) => f.status === 'left'), 'the rest were left to the close')
})

test('a den assault: the close’s own reveal roll leaves a revealing den to its Mythic Hunt, and sets any other den on the field', () => {
  const reveals = (h: HexState): boolean => chance(base.campaign.seed, today, `reveal:${h.id}`, RULES.grandBattles.mythicReveal.chance)
  const all = base.hexes.filter((h) => isRevealDen(h))
  const revealing = all.find(reveals)
  const plain = all.find((h) => !reveals(h))
  assert.ok(revealing && plain, 'the map has a den of each kind today')
  // D-16: the dens a rare creature turns at bay in lie deep in a lair's wedge; hand the player a hex beside each.
  const inner = (h: HexState): string => neighbors(h.id).find((n) => (base.hexes.find((x) => x.id === n) as HexState).ring === h.ring - 1) as string
  const near = { ...base, hexes: base.hexes.map((h) => (h.id === inner(revealing) || h.id === inner(plain) ? { ...h, owner: 'player' as const } : h)) }
  assert.ok([revealing, plain].every((h) => claimableBy(near.hexes, h.id, 'player', 'assault')))
  const sent = [...roster(near, { day: today }, realmEffects(near))].sort((a, b) => b.power - a.power).slice(0, 2).map((c) => c.id)
  const orderOn = (hexId: string): CampaignState => setOrders(near, { date: today, assaultTarget: hexId, assault: sent, defense: [] }).state

  const onPlain = todaysFights(orderOn(plain.id), today).find((p) => p.side === 'assault')
  assert.deepEqual([onPlain?.hexId, onPlain?.enemy.kind], [plain.id, 'beasts'])

  const revealState = orderOn(revealing.id)
  assert.equal(todaysFights(revealState, today).some((p) => p.side === 'assault'), false, 'no skirmish for it')
  const settled = settle(marshalAllFights(revealState, today, 0.9), ledger, closeOf(today)).state
  assert.equal(eventsOn(settled, today).find((e) => e.kind === 'assault')?.outcome, 'revealed')
  assert.ok(settled.grandBattles.some((b) => b.trigger === 'mythicHunt' && b.hexId === revealing.id), 'the close raises its Mythic Hunt')
})

test('the next dawn: the Herald marks the battles the player led and links to them; one opened and left says the Marshal finished it', () => {
  const started = startSkirmishes(ordered, today, 0.9)
  assert.ok(started.ok && started.day && started.day.fights.length >= 2)
  const [first, second] = started.day.fights
  let state = beginFight(started.state, today, first.id).state
  for (;;) {
    const fight = state.skirmishes?.find((d) => d.day === today)?.fights.find((f) => f.id === first.id)
    if (!fight || fight.result !== undefined) break
    state = playFightRound(state, today, first.id, marshalPlay(skirmishField(fight))).state
  }
  state = beginFight(state, today, second.id).state
  const settled = settle(state, ledger, closeOf(today)).state
  const tomorrow = addDays(today, 1)
  assert.deepEqual(ledYesterday(settled, tomorrow), { day: today, fought: 2 })
  assert.equal(heraldView(settled, tomorrow).lines.filter((l) => l.led).length, 2)
  assert.deepEqual([fightResult(settled, today, first.id)?.marshal, fightResult(settled, today, second.id)?.marshal], [false, true])
  assert.equal(ledYesterday(settle(ordered, ledger, closeOf(today)).state, tomorrow), null, 'nothing led, no link')
})
