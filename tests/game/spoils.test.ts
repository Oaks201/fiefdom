/**
 * Spoils (Ch 5 "Where reputation comes from", Ch 10 and Ch 11 outcomes, A-165, D-12): a battle won
 * pays reputation into the purse as a `spoils` event, what the battle's report or result card names
 * is what the purse gets, and the Chronicle's day earnings count it: on the open day too ("Earned at
 * the day's close"), as soon as the battle is won, asked for by Rich (2026-10-18). Each kind of battle is won
 * here and its posting read back from the purse: the daily threat and the assault fought by the
 * close's formula, the same two led on the battle map, and the Grand Battles.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { setOrders } from '../../src/renderer/src/lib/game/combat'
import { applyScenario } from '../../src/renderer/src/lib/game/dev/scenarios'
import { balance, roundPosting } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { GRAND_HOOKS, autoResolve, battleOf } from '../../src/renderer/src/lib/game/grand'
import { marshalPlay } from '../../src/renderer/src/lib/game/grand/field'
import { bandOf, neighbors, isClaimableKind } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle, snapshotOf } from '../../src/renderer/src/lib/game/settle'
import { beginFight, playFightRound, skirmishField, startSkirmishes } from '../../src/renderer/src/lib/game/skirmish'
import { hexOf, openDayOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, DayRecord, GameEvent, ISODate } from '../../src/renderer/src/lib/game/types'
import { resultView } from '../../src/renderer/src/lib/game/view/battle'
import { dayEarned, dayProjection, daySpoils } from '../../src/renderer/src/lib/game/view/chronicle'
import { ordersView } from '../../src/renderer/src/lib/game/view/orders'
import { fightResult } from '../../src/renderer/src/lib/game/view/skirmish'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { SEVEN_FULL, announced, collector, incursionSetup, withArmy } from './support/grand'
import { allBuildings, realm, withCastle, withCrossings } from './support/realm'
import { withTiding } from './support/war'

const ledger = ledgerWith('2026-09-10', 120)
const fresh = settle(realm(7, ledger), ledger, chicago('2026-10-08')).state
const today = openDayOf(fresh)

/** Settles through `day` (its close). */
function through(state: CampaignState, day: ISODate): CampaignState {
  return settle(state, ledger, chicago(addDays(day, 1))).state
}

/**
 * Every building at Tier II (so Spoils of War is in the deck), an assault on the beast den beside
 * the castle with the strongest companies, and the day's threat a beast pack of strength 1 on a
 * building hex, beaten in a rout whoever fights it.
 */
function ordered(): { state: CampaignState; den: string; building: string } {
  const ready = applyScenario(fresh, 'armyReady', today) as CampaignState
  const den = ready.hexes.find((h) => h.ring === 1 && h.kind === 'between' && h.owner === 'neutral')!
  const building = ready.hexes.find((h) => h.kind === 'building')!
  const view = ordersView(ready, 1, today)
  const sent = [...view.companies].sort((a, b) => b.power - a.power).slice(0, view.banners.assault).map((c) => c.id)
  const withAssault = setOrders(ready, { date: today, assaultTarget: den.id, assault: sent, defense: [] }).state
  return { state: withTiding(withAssault, { date: today, kind: 'beasts', hexId: building.id, strength: 1 }), den: den.id, building: building.id }
}

type BattleEvent = Extract<GameEvent, { kind: 'defense' | 'assault' }>

/** The day's battles the close reported won, each with the purse source its spoils post under and the spoils it named. */
function wonOn(state: CampaignState, day: ISODate): { source: string; spoils: number; outcome: string }[] {
  return state.log
    .filter((e): e is BattleEvent => e.day === day && (e.kind === 'defense' || e.kind === 'assault') && e.spoils !== undefined)
    .map((e) => ({ source: e.kind === 'defense' ? `defense:${e.threat}:${e.hexId}` : `assault:${e.hexId}`, spoils: e.spoils as number, outcome: e.outcome }))
}

/** The `spoils` events the purse holds for `day`, by source. */
function spoilsOn(state: CampaignState, day: ISODate): Map<string, number> {
  return new Map(state.purse.events.filter((e) => e.kind === 'spoils' && e.date === day).map((e) => [e.source, e.amount]))
}

/** A day with every duty kept, as the Chronicle's open-day figure reads it. */
const kept = (date: ISODate): DayRecord => ({ date, dutiesKept: 3, dutiesSworn: 3 })

/** 4 × band for a win, 6 × band for a rout, with the realm's spoils multiple against beasts and the reputation bonus (Ch 10, D-17). */
function expected(state: CampaignState, hexId: string, rout: boolean, mult = 1): number {
  const effects = realmEffects(state)
  const perBand = rout ? RULES.combat.spoils.routPerRing : RULES.combat.spoils.winPerRing
  return roundPosting(perBand * bandOf(hexOf(state, hexId)!) * effects.spoils.beast.value * mult * (1 + effects.reputationBonus.value))
}

test('Spoils, the close’s formula: a daily threat beaten and an assault won each post 4 × band (6 × on a rout) to the purse, and the Chronicle counts them', () => {
  const { state, den, building } = ordered()
  assert.equal(daySpoils(state, today), 0, 'a battle the close still fights adds nothing before it')
  const after = through(state, today)
  const won = wonOn(after, today)
  const posted = spoilsOn(after, today)
  assert.deepEqual(
    won.map((w) => w.source),
    [`defense:beasts:${building}`, `assault:${den}`],
    'the threat beaten, then the den taken'
  )
  assert.equal(hexOf(after, den)?.owner, 'player')
  for (const w of won) {
    assert.ok(w.spoils > 0, w.source)
    assert.equal(posted.get(w.source), w.spoils, `${w.source}: the report's spoils are what the purse got`)
    const hexId = w.source.split(':').at(-1) as string
    assert.equal(w.spoils, expected(state, hexId, w.outcome === 'rout'), `${w.source}: ${w.outcome}`)
  }
  assert.equal(posted.size, won.length, 'no spoils without a battle won')
  // The Chronicle's "Reputation earned" for the day grows by the day's behavior income plus the spoils
  // (the scenario's own top-up is dated today too, so it is counted on both sides).
  const spoils = won.reduce((s, w) => s + w.spoils, 0)
  const daily = snapshotOf(after, today)?.paid?.daily ?? 0
  assert.ok(daily > 0)
  assert.equal(roundPosting(dayEarned(after, today) - dayEarned(state, today)), roundPosting(daily + spoils))
  assert.equal(daySpoils(after, today), roundPosting(spoils))
  assert.equal(roundPosting(balance(after.purse) - balance(state.purse)), roundPosting(daily + spoils))
})

test('Spoils, led fights (D-12): the result card’s spoils count in “Earned at the day’s close” once won, and post to the purse at the close, Spoils of War’s +50% included', () => {
  const { state, den } = ordered()
  const started = startSkirmishes(state, today, 1)
  assert.ok(started.ok && started.day)
  let s = started.state
  const day = started.day
  const assault = day.fights.find((f) => f.side === 'assault' && f.hexId === den)!
  for (const f of day.fights) {
    // A weak enemy, so every fight is won; the assault plays Spoils of War in round 1, dealt into its deck.
    const units = f.setup.units.map((u) => (u.side === 'enemy' ? { ...u, power: u.power / 10, health: u.health / 10 } : u))
    const deck = f === assault ? ['spoilsOfWar', ...f.setup.deck.filter((o) => o !== 'spoilsOfWar')] : f.setup.deck
    s = { ...s, skirmishes: s.skirmishes!.map((d) => (d.day === today ? { ...d, fights: d.fights.map((x) => (x.id === f.id ? { ...x, setup: { ...x.setup, units, deck } } : x)) } : d)) }
    const begun = beginFight(s, today, f.id)
    assert.ok(begun.ok, begun.reason)
    s = begun.state
    for (let r = 1; r <= RULES.skirmish.rounds; r++) {
      const fight = s.skirmishes!.find((d) => d.day === today)!.fights.find((x) => x.id === f.id)!
      if (fight.result !== undefined) break
      const play = f === assault && r === 1 ? { order: 'spoilsOfWar' } : marshalPlay(skirmishField(fight))
      const done = playFightRound(s, today, f.id, play)
      assert.ok(done.ok, done.reason)
      s = done.state
    }
  }
  const fights = s.skirmishes!.find((d) => d.day === today)!.fights
  assert.ok(fights.every((f) => f.result === 'rout' || f.result === 'victory'), 'every led fight won')
  assert.equal(fights.find((f) => f.id === assault.id)?.spoils, 1.5)
  // Before the close, each result card names its spoils and says they post at the close; the purse holds none yet.
  const named = new Map(fights.map((f) => [f.id, fightResult(s, today, f.id)!]))
  for (const r of named.values()) {
    assert.equal(r.posted, false)
    assert.ok(Number(r.report?.facts.spoils) > 0, r.label)
  }
  assert.equal(spoilsOn(s, today).size, 0)
  // The Chronicle's open-day figure already counts them: the cards' spoils on top of the day's habits.
  const due = roundPosting([...named.values()].reduce((sum, r) => sum + Number(r.report?.facts.spoils), 0))
  assert.equal(daySpoils(started.state, today), 0, 'nothing won yet')
  assert.equal(daySpoils(s, today), due)
  assert.equal(roundPosting(dayProjection(s, kept(today)) - dayProjection(started.state, kept(today))), due)

  const after = through(s, today)
  assert.equal(daySpoils(after, today), due, 'the settled day reads the same spoils from the purse')
  const posted = spoilsOn(after, today)
  for (const f of fights) {
    const source = f.side === 'assault' ? `assault:${f.hexId}` : `defense:${f.threat}:${f.hexId}`
    assert.equal(posted.get(source), Number(named.get(f.id)!.report?.facts.spoils), `${source}: the card's spoils are what the purse got`)
    assert.equal(fightResult(after, today, f.id)?.posted, true)
    assert.equal(posted.get(source), expected(state, f.hexId, f.result === 'rout', f.spoils ?? 1), source)
  }
  assert.equal(posted.size, fights.length)
})

test('Spoils, Grand Battles (Ch 11, A-165): an Incursion pays 30 × band, a Coalition Offensive 40 × band, a Mythic Hunt 150; the card and the purse agree', () => {
  // An Incursion won, its spoils dated the battle's day; the Chronicle counts them for that day.
  const inc = incursionSetup(4, [20, 20])
  const a = announced(inc.state, { trigger: 'incursion', hexId: inc.hexId, announcedOn: today, rival: 'orc' })
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, SEVEN_FULL, collector().emit)
  assert.notEqual(battleOf(fought, a.battle.id)?.result, 'defeat')
  const bonus = 1 + realmEffects(inc.state).reputationBonus.value
  const incursion = spoilsOn(fought, a.battle.battleDate).get(`grandBattle:${a.battle.id}`)
  assert.equal(incursion, roundPosting(30 * bandOf(hexOf(inc.state, inc.hexId)!) * bonus))
  assert.ok(resultView(fought, a.battle.id)?.lines.includes(`Spoils +${incursion}`))
  assert.equal(dayEarned(fought, a.battle.battleDate), incursion)
  // Won on the open day, it counts in "Earned at the day's close" at once.
  const battleDay = kept(a.battle.battleDate)
  assert.ok(a.battle.battleDate > fought.settledThrough.day)
  assert.equal(daySpoils(fought, a.battle.battleDate), incursion)
  assert.equal(roundPosting(dayProjection(fought, battleDay) - dayProjection(a.state, battleDay)), incursion)

  // A Coalition Offensive won, through the hook the world installs (world.ts).
  const coalition = withArmy(withArmy(withCastle(allBuildings(realm(), 4), 4), 'archmage', [20, 20]), 'dwarf', [20, 20])
  const border = coalition.hexes.find((h) => h.ring === 2 && h.owner === 'player') ?? coalition.hexes.find((h) => h.ring === 1 && h.owner === 'player')!
  const c = announced(coalition, { trigger: 'coalitionOffensive', hexId: border.id, announcedOn: today, members: ['archmage', 'dwarf'] })
  const ctx = { day: c.battle.battleDate, won: true, result: 'victory' as const, spoilsMult: 1, emit: collector().emit }
  const offensive = GRAND_HOOKS.coalitionOffensive(c.state, c.battle, ctx)
  const coalitionBonus = 1 + realmEffects(coalition).reputationBonus.value
  assert.equal(spoilsOn(offensive.state, ctx.day).get(`grandBattle:${c.battle.id}`), roundPosting(40 * bandOf(border) * coalitionBonus))
  assert.equal(offensive.outcome.spoils, spoilsOn(offensive.state, ctx.day).get(`grandBattle:${c.battle.id}`))

  // A Mythic Hunt won: 150 reputation with the bonus, posted as spoils.
  const hunt = withCastle(withCrossings(allBuildings(realm(), 4), { foundryMageTower: 2 }), 4)
  const mouth = hunt.hexes.find((h) => h.kind === 'lairMouth' && h.land === 'west')!
  const m = announced(hunt, { trigger: 'mythicHunt', hexId: mouth.id, announcedOn: today, quarry: 'wyvernBrood' })
  const won = autoResolve(m.state, m.battle.id, m.battle.battleDate, SEVEN_FULL, collector().emit)
  assert.notEqual(battleOf(won, m.battle.id)?.result, 'defeat')
  const paid = spoilsOn(won, m.battle.battleDate).get(`grandBattle:${m.battle.id}`)
  assert.equal(paid, roundPosting(150 * (1 + realmEffects(hunt).reputationBonus.value)))
  assert.ok(resultView(won, m.battle.id)?.lines.includes(`+${paid} reputation`))
})

test('Spoils, Grand Battles (Ch 11): a Gate won pays no spoils; the Gate itself is the prize', () => {
  let state = withArmy(withCastle(allBuildings(realm(), 4), 4), 'orc', [20])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  state = { ...state, hexes: state.hexes.map((h) => (neighbors(gate.id).includes(h.id) && isClaimableKind(h) && h.ring < gate.ring ? { ...h, owner: 'player' as const } : h)) }
  const g = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: today, rival: 'orc' })
  const won = autoResolve(g.state, g.battle.id, g.battle.battleDate, SEVEN_FULL, collector().emit)
  assert.notEqual(battleOf(won, g.battle.id)?.result, 'defeat')
  assert.equal(hexOf(won, gate.id)?.owner, 'player')
  assert.equal(spoilsOn(won, g.battle.battleDate).size, 0)
  assert.equal(battleOf(won, g.battle.id)?.outcome?.spoils, undefined)
})
