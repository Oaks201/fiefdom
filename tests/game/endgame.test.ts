/**
 * T12: the endgame (Ch 14; Ch 9 Grace; Ch 16 "Fear of losing", "Coming back after an absence"):
 * Ch 14's pacing up to the earliest victory, Ascendancy and its warning, the Ultimatum and how it
 * lifts or waits, bending the knee, the Siege of the Crown won and lost, victory and the Reign,
 * and the Chronicle's record.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyTier } from '../../src/renderer/src/lib/game/buildings'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays, diffDays } from '../../src/renderer/src/lib/game/clock'
import { armyValue, baseArmyValue } from '../../src/renderer/src/lib/game/combat'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { GRAND_HOOKS, pendingBattles } from '../../src/renderer/src/lib/game/grand'
import { rivalHost } from '../../src/renderer/src/lib/game/grand/hosts'
import { playerPower, rivalPower } from '../../src/renderer/src/lib/game/rivals'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { worldOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, GameEvent, GrandBattle, HexState, RivalId, WorldEvent } from '../../src/renderer/src/lib/game/types'
import { RIVAL_IDS } from '../../src/renderer/src/lib/game/types'
import { accordPaid, bendPrice, bendTheKnee, chronicleRecord, ultimatumView, worldWeek } from '../../src/renderer/src/lib/game/world'
import { FOUNDED_AT, TZ, charter, chicago, ledgerWith } from './fixtures/ledgers'
import { collector, withArmy } from './support/grand'
import { realm, withArmory, withBuildings, withDominion, withGrace, withMilestones, withPurse } from './support/realm'

// ── Builders ─────────────────────────────────────────────────────────────────

/** The last day of campaign week `n` for `realm()` (week 1 is 2026-10-08 to 10-11; Monday weeks). */
function closeOf(n: number): string {
  return addDays('2026-10-11', 7 * (n - 1))
}

function worldAt(state: CampaignState, n: number): { state: CampaignState; c: ReturnType<typeof collector> } {
  const c = collector()
  return { state: worldWeek(state, { day: closeOf(n), week: n, days: 7, realmConsistency: 0.9, emit: c.emit }), c }
}

function weeks(state: CampaignState, from: number, to: number): { state: CampaignState; events: ReturnType<typeof collector>['events'] } {
  let next = state
  const events: ReturnType<typeof collector>['events'] = []
  for (let n = from; n <= to; n++) {
    const r = worldAt(next, n)
    next = r.state
    events.push(...r.c.events.map((e) => ({ ...e, week: n })))
  }
  return { state: next, events }
}

function setHex(state: CampaignState, id: string, patch: Partial<HexState>): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.id === id ? { ...h, ...patch } : h)) }
}

function logged(state: CampaignState, event: Record<string, unknown>): CampaignState {
  return { ...state, log: [...state.log, { id: `ev-${state.log.length + 1}`, ...event } as GameEvent] }
}

/** Every rival's villages already won by influence, so each would defect at once. */
function allDefecting(input: CampaignState, day: string): CampaignState {
  let state = input
  for (const h of input.hexes.filter((x) => x.village && x.owner !== 'player' && x.owner !== 'neutral')) {
    state = setHex(state, h.id, { owner: 'player', garrison: 0 })
    state = logged(state, { day, kind: 'hexTransfer', hexId: h.id, from: h.owner, to: 'player', how: 'influence' })
  }
  return state
}

/** Sets `rival`'s treasury so its Power is `ratio` × the player's (on the close of week `n`). */
function atRatio(state: CampaignState, rival: RivalId, ratio: number, n: number): CampaignState {
  const date = addDays(closeOf(n), 1)
  const r = state.rivals[rival]
  const gap = ratio * playerPower(state) - rivalPower(state, rival, date)
  return { ...state, rivals: { ...state.rivals, [rival]: { ...r, treasury: r.treasury + 2 * gap } } }
}

/** A realm whose purse keeps every rival's Power well under the player's, with the deck's battles and dated events already past. */
function base(): CampaignState {
  const state = withPurse(realm(), 2_000)
  const past = (id: string): WorldEvent => ({ id, firedOn: '2026-10-11', data: { from: '2026-10-12', until: '2026-10-12' } })
  const once = ['hungryWinter', 'dragonWakes', 'wildHunt', 'ugraksChallenge'].map(past)
  return { ...state, worldEvents: [...once, ...[10, 23, 36, 49, 62].map(() => past('beastSurge'))] }
}

function castle(state: CampaignState): HexState {
  return state.hexes.find((h) => h.kind === 'castle') as HexState
}

function siege(state: CampaignState): GrandBattle | undefined {
  return pendingBattles(state).find((b) => b.trigger === 'siege')
}

/** An Orc whose Power stays at 2× the player's from week 36 to its Ultimatum at week 39's close. */
function ultimatum(state: CampaignState = base()): { state: CampaignState; events: ReturnType<typeof collector>['events'] } {
  return weeks(atRatio(state, 'orc', 2, 36), 36, 39)
}

// ── Pacing (Ch 14) ───────────────────────────────────────────────────────────

test('Ch 14 pacing: with every rival ready from day 1, none is resolved before week 12, one per 8 weeks after, and victory comes in week 36', () => {
  const ready = allDefecting(realm(), '2026-10-08')
  const { state, events } = weeks(ready, 1, 40)
  const resolved = events.filter((e) => e.kind === 'rivalResolved').map((e) => e.week)
  assert.deepEqual(resolved, [12, 20, 28, 36])
  const won = events.filter((e) => e.kind === 'campaignEnd')
  assert.deepEqual(won.map((e) => [e.outcome, e.week]), [['won', 36]])
  assert.equal(state.campaign.status, 'won')
  assert.equal(state.castleTier, 5, 'the High Throne, never bought')
  assert.ok(RIVAL_IDS.every((r) => state.rivals[r].status === 'abdicated'))
})

test('Ch 14 / A-168: an Accord signed in week 8 is held, and the rival is allied at week 12’s close', () => {
  const c = collector()
  const signed = accordPaid({ ...realm(), rivals: { ...realm().rivals, archmage: { ...realm().rivals.archmage, respect: 60 } } }, { contractId: 'none', rival: 'archmage', curve: 1 }, closeOf(8), c.emit)
  assert.equal(signed.rivals.archmage.respect, 100)
  assert.equal(signed.rivals.archmage.status, 'active')
  assert.deepEqual(worldOf(signed).pending.map((p) => [p.rival, p.how]), [['archmage', 'allied']])
  assert.equal(weeks(signed, 9, 11).state.rivals.archmage.status, 'active')
  assert.equal(weeks(signed, 9, 12).state.rivals.archmage.status, 'allied')
})

// ── Ascendancy and the Ultimatum (Ch 14) ─────────────────────────────────────

test('Ch 14 rule 1: from week 36, Power at 1.5× the player’s at 4 week closes in a row starts a 14-day Ultimatum with the Siege announced', () => {
  const early = weeks(atRatio(base(), 'orc', 2, 30), 30, 35).state
  assert.equal(early.rivals.orc.ascendancyStreak, 0, 'never before week 36')
  assert.equal(siege(early), undefined)
  const { state, events } = ultimatum()
  const battle = siege(state) as GrandBattle
  assert.ok(battle)
  assert.equal(battle.hexId, castle(state).id)
  assert.equal(battle.rival, 'orc')
  assert.equal(battle.announcedOn, addDays(closeOf(39), 1))
  assert.equal(diffDays(battle.announcedOn, battle.battleDate), 14)
  assert.equal(state.rivals.orc.ultimatumUntil, battle.battleDate)
  const ult = events.filter((e) => e.kind === 'ascendancy' && e.stage === 'ultimatum')
  assert.deepEqual(ult.map((e) => [e.rival, e.week, e.until]), [['orc', 39, battle.battleDate]])
  // Siege host: 70% of the Orc's AV.
  const sent = battle.enemy.reduce((s, co) => s + co.power, 0)
  assert.ok(sent <= 0.7 * armyValue(state, 'orc', battle.announcedOn) + 1e-9)
})

test('Ch 14 rule 1: three closes at the ratio are not enough; a close below it starts the count again', () => {
  let state = atRatio(base(), 'orc', 2, 36)
  state = weeks(state, 36, 38).state
  assert.equal(state.rivals.orc.ascendancyStreak, 3)
  const dipped = atRatio(state, 'orc', 1.4, 39)
  const after = worldAt(dipped, 39).state
  assert.equal(after.rivals.orc.ascendancyStreak, 0)
  assert.equal(siege(after), undefined)
})

test('Ch 9 Grace I: a rival needs 1.6× the player’s Power; at 1.55× it counts only below Grace I', () => {
  const at = (grace: number): number => weeks(atRatio(withGrace(base(), grace), 'orc', 1.55, 36), 36, 36).state.rivals.orc.ascendancyStreak
  assert.equal(at(0), 1)
  assert.equal(at(1), 0)
  assert.equal(weeks(atRatio(withGrace(base(), 1), 'orc', 1.65, 36), 36, 36).state.rivals.orc.ascendancyStreak, 1)
})

test('Ch 9 Grace III: Ascendancy cannot begin before week 44', () => {
  const graced = atRatio(withGrace(base(), 3), 'orc', 2, 36)
  const before = weeks(graced, 36, 43).state
  assert.equal(before.rivals.orc.ascendancyStreak, 0)
  assert.equal(siege(before), undefined)
  const after = weeks(atRatio(before, 'orc', 2, 44), 44, 47)
  assert.ok(siege(after.state))
  assert.deepEqual(after.events.filter((e) => e.kind === 'ascendancy' && e.stage === 'ultimatum').map((e) => e.week), [47])
})

test('Ch 14 rule 1: a coalition’s members add their Power together; both send the Siege', () => {
  // The Last Alliance after the Orc and the Archmage fell.
  let state = base()
  for (const [rival, n] of [['orc', 12], ['archmage', 20]] as const) state = { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], status: 'conquered', resolvedOn: closeOf(n) } } }
  state = { ...state, world: { ...worldOf(state), resolvedSeen: 2 }, coalitions: [{ members: ['goblin', 'dwarf'], trigger: 'lastAlliance', warChest: 0, formedOn: closeOf(30) }] }
  state = atRatio(atRatio(state, 'goblin', 0.8, 36), 'dwarf', 0.8, 36)
  const { state: next, events } = weeks(state, 36, 39)
  const battle = siege(next) as GrandBattle
  assert.ok(battle, '0.8× + 0.8× = 1.6× together')
  assert.deepEqual(battle.members, ['goblin', 'dwarf'])
  assert.deepEqual(events.filter((e) => e.kind === 'ascendancy' && e.stage === 'ultimatum').map((e) => e.members), [['goblin', 'dwarf']])
  assert.equal(next.rivals.goblin.ultimatumUntil, battle.battleDate)
  assert.equal(next.rivals.dwarf.ultimatumUntil, battle.battleDate)
  const senders = new Set(battle.enemy.map((co) => co.id.split(':')[0]))
  assert.deepEqual([...senders].sort(), ['dwarf', 'goblin'])
})

test('Ch 14 rule 2: from week 32 the Herald warns when a rival’s Power passes 1.3× the player’s, once per crossing', () => {
  const strong = atRatio(base(), 'archmage', 1.4, 31)
  const { state, events } = weeks(strong, 31, 34)
  const warned = events.filter((e) => e.kind === 'ascendancy' && e.stage === 'warning')
  assert.deepEqual(warned.map((e) => [e.rival, e.week]), [['archmage', 32]])
  const fell = weeks(atRatio(state, 'archmage', 1.2, 35), 35, 35).state
  const again = weeks(atRatio(fell, 'archmage', 1.4, 36), 36, 36)
  assert.deepEqual(again.events.filter((e) => e.kind === 'ascendancy' && e.stage === 'warning').map((e) => e.week), [36])
})

test('Ch 14 rule 4: the Ultimatum is lifted when the ratio falls below 1.3× at a week close before the Siege', () => {
  const { state } = ultimatum()
  const battle = siege(state) as GrandBattle
  const held = worldAt(atRatio(state, 'orc', 1.35, 40), 40).state
  assert.ok(siege(held), 'still above 1.3×')
  const { state: lifted, c } = worldAt(atRatio(held, 'orc', 1.25, 41), 41)
  assert.equal(siege(lifted), undefined)
  assert.equal(lifted.grandBattles.some((b) => b.id === battle.id), false)
  assert.equal(lifted.rivals.orc.ultimatumUntil, undefined)
  assert.equal(lifted.rivals.orc.ascendancyStreak, 0)
  assert.deepEqual(c.of('ascendancy').map((e) => e.stage), ['lifted'])
  assert.ok(c.of('grandBattle').some((e) => e.stage === 'cancelled'))
})

test('Ch 14 rule 4 / A-172: bending the knee pays 25% of the treasury estimate, delays the Siege 4 weeks, and works once', () => {
  const { state: threatened } = ultimatum(withPurse(base(), 3_000))
  const battle = siege(threatened) as GrandBattle
  const today = addDays(closeOf(39), 2)
  // The price reads the treasury band, not the hidden treasury: two treasuries in one band cost the same.
  const holdingsBand = (t: number): number => bendPrice({ ...threatened, rivals: { ...threatened.rivals, orc: { ...threatened.rivals.orc, treasury: t, specialFund: 0 } } }, 'orc')
  assert.equal(holdingsBand(5_000), holdingsBand(9_000))
  assert.equal(holdingsBand(5_000), 0.25 * 4_000)
  assert.equal(holdingsBand(900), 0.25 * 2_000)
  const view = ultimatumView(threatened, today)
  assert.deepEqual(view.map((v) => [v.rival, v.siegeOn, v.daysLeft, v.canBend]), [['orc', battle.battleDate, diffDays(today, battle.battleDate), true]])
  assert.equal(view[0].bendPrice, bendPrice(threatened, 'orc'))
  assert.ok(!('ratio' in view[0]))

  const bent = bendTheKnee(threatened, 'orc', today)
  assert.ok(bent.ok, bent.reason)
  assert.equal(bent.cost, bendPrice(threatened, 'orc'))
  assert.equal(Math.round((balance(threatened.purse) - balance(bent.state.purse)) * 10) / 10, bent.cost)
  const moved = siege(bent.state) as GrandBattle
  assert.equal(moved.battleDate, addDays(battle.battleDate, 28))
  assert.equal(bent.state.rivals.orc.ultimatumUntil, moved.battleDate)
  assert.ok(bent.state.log.some((e) => e.kind === 'ascendancy' && e.stage === 'delayed'))
  const twice = bendTheKnee(bent.state, 'orc', addDays(today, 1))
  assert.deepEqual([twice.ok, twice.reason], [false, 'used'])
  assert.equal(ultimatumView(bent.state, today)[0].canBend, false)
  assert.equal(bendTheKnee(realm(), 'orc', today).reason, 'noUltimatum')
})

test('Ch 14 rule 7 / A-10: a Siege due 3 days after a return from 20 days away moves to day 7 after the return', () => {
  const ledger = ledgerWith('2026-09-10', 400)
  let state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  const away = addDays(closeOf(37), 1)
  state = settle(state, ledger, chicago(away), { launch: true }).state
  assert.equal(state.settlement.lastLaunch, away)
  const back = addDays(away, 20)
  const due = addDays(back, 3)
  // An Orc rich enough that its Ultimatum can't lift while the player is away.
  state = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, treasury: 1_000_000 } } }
  const enemy = rivalHost(withArmy(state, 'orc', [200]), 'orc', 0.7, away)
  const battle: GrandBattle = { id: `gb-${state.grandBattles.length + 1}`, trigger: 'siege', hexId: castle(state).id, announcedOn: addDays(due, -14), battleDate: due, enemy, rival: 'orc' }
  state = { ...state, grandBattles: [...state.grandBattles, battle], rivals: { ...state.rivals, orc: { ...state.rivals.orc, ultimatumUntil: due } } }
  const r = settle(state, ledger, chicago(back), { launch: true })
  assert.equal(r.summary.awayDays, 20)
  assert.equal(r.state.settlement.returnedOn, back)
  const moved = r.state.grandBattles.find((b) => b.id === battle.id) as GrandBattle
  assert.equal(moved.battleDate, addDays(back, 7))
  assert.equal(moved.result, undefined, 'not fought')
  assert.equal(r.state.rivals.orc.ultimatumUntil, addDays(back, 7))
  assert.ok(r.events.some((e) => e.kind === 'grandBattle' && e.stage === 'queued' && e.battleId === battle.id))
  // A return from fewer than 14 days away changes nothing.
  const short = settle({ ...state, settlement: { ...state.settlement, lastLaunch: addDays(back, -13) } }, ledger, chicago(back), { launch: true })
  assert.equal(short.state.grandBattles.find((b) => b.id === battle.id)?.battleDate, due)
})

// ── The Siege of the Crown (Ch 14 rules 5 and 6) ─────────────────────────────

test('Ch 14 rule 5: winning the Siege Humbles the rival: AV −50%, Respect +10, and no new Ascendancy for 8 weeks', () => {
  const { state } = ultimatum()
  const battle = siege(state) as GrandBattle
  const av = baseArmyValue(state, 'orc')
  const c = collector()
  const done = GRAND_HOOKS.siege(state, battle, { day: battle.battleDate, won: true, result: 'victory', spoilsMult: 1, emit: c.emit })
  assert.ok(Math.abs(baseArmyValue(done.state, 'orc') - av / 2) < 1e-9)
  assert.equal(done.state.rivals.orc.respect, state.rivals.orc.respect + 10)
  assert.equal(done.state.rivals.orc.humbledUntil, addDays(battle.battleDate, 56))
  assert.equal(done.state.rivals.orc.ultimatumUntil, undefined)
  assert.equal(done.state.campaign.status, 'active')
  assert.deepEqual(done.outcome, { armyLoss: 0.5, respect: 10 })
  // Still far stronger, but immune for 8 weeks.
  const fought = { ...done.state, grandBattles: done.state.grandBattles.map((b) => (b.id === battle.id ? { ...b, result: 'victory' as const, foughtOn: battle.battleDate } : b)) }
  const immune = weeks(atRatio(fought, 'orc', 3, 42), 42, 49).state
  assert.equal(immune.rivals.orc.ascendancyStreak, 0)
  assert.equal(siege(immune), undefined)
  const later = weeks(atRatio(immune, 'orc', 3, 50), 50, 50).state
  assert.equal(later.rivals.orc.ascendancyStreak, 1)
})

test('Ch 14 rule 6: losing the Siege is the Fall; settlement stops that day and changes nothing after', () => {
  const ledger = ledgerWith('2026-09-10', 400)
  let state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  state = settle(state, ledger, chicago(addDays(closeOf(40), 1))).state
  const day = addDays(closeOf(40), 3)
  const strong = withArmy(state, 'orc', [3_000])
  const enemy = rivalHost(strong, 'orc', 0.7, day)
  const battle: GrandBattle = { id: `gb-${state.grandBattles.length + 1}`, trigger: 'siege', hexId: castle(state).id, announcedOn: addDays(day, -14), battleDate: day, enemy, rival: 'orc' }
  state = { ...strong, grandBattles: [...strong.grandBattles, battle] }
  const r = settle(state, ledger, chicago(addDays(day, 5)))
  assert.equal(r.state.campaign.status, 'fallen')
  assert.equal(r.state.settledThrough.day, day, 'the days after the Fall are not settled')
  const end = r.events.findIndex((e) => e.kind === 'campaignEnd')
  assert.ok(end >= 0)
  assert.deepEqual(r.events[end].kind === 'campaignEnd' && r.events[end].outcome, 'fallen')
  assert.ok(r.events.slice(end + 1).every((e) => e.kind === 'grandBattle' && e.stage === 'fought'), 'only the battle’s own record follows')
  const after = settle(r.state, ledger, chicago(addDays(day, 30)), { launch: true })
  assert.deepEqual(after.events, [])
  assert.equal(after.state.settledThrough.day, day)
  assert.equal(after.state.campaign.status, 'fallen')
  const record = chronicleRecord(after.state)
  assert.equal(record.status, 'fallen')
  assert.equal(record.week, 41)
})

// ── Victory and the Reign (Ch 14) ────────────────────────────────────────────

test('Ch 14: victory sets Castle V and won; the Reign goes on settling, and a Tier V purchase still works', () => {
  const ledger = ledgerWith('2026-09-10', 400)
  let state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  state = settle(state, ledger, chicago(addDays(closeOf(35), 1))).state
  // Three rivals were resolved in weeks 12, 20 and 28; the Dwarf has lost every village to influence.
  const resolved: [RivalId, 'conquered' | 'allied' | 'abdicated', number][] = [['orc', 'conquered', 12], ['goblin', 'allied', 20], ['archmage', 'abdicated', 28]]
  for (const [rival, how, n] of resolved) {
    state = logged(state, { day: closeOf(n), kind: 'rivalResolved', rival, how })
    state = { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], status: how, resolvedOn: closeOf(n) } } }
  }
  state = { ...state, world: { ...worldOf(state), resolvedSeen: 3 } }
  for (const id of ['1,4', '0,5', '-1,5']) {
    const h = state.hexes.find((x) => x.id === id) as HexState
    if (h.owner === 'dwarf') {
      state = setHex(state, id, { owner: 'player', garrison: 0 })
      state = logged(state, { day: closeOf(30), kind: 'hexTransfer', hexId: id, from: 'dwarf', to: 'player', how: 'influence' })
    }
  }
  state = { ...state, hexes: state.hexes.map((h) => (h.owner === 'dwarf' && h.village ? { ...h, owner: 'neutral' as const } : h)) }

  const r = settle(state, ledger, chicago(addDays(closeOf(36), 1)))
  assert.equal(r.state.campaign.status, 'won')
  assert.equal(r.state.castleTier, 5)
  assert.deepEqual(r.events.filter((e) => e.kind === 'campaignEnd').map((e) => [e.day, e.kind === 'campaignEnd' && e.outcome]), [[closeOf(36), 'won']])
  assert.ok(r.state.roster.some((c) => c.id === 'vassal:dwarf'))

  // The Reign: the next days and weeks still settle.
  const reign = settle(r.state, ledger, chicago(addDays(closeOf(38), 1)))
  assert.equal(reign.state.settledThrough.day, closeOf(38))
  assert.ok(reign.events.some((e) => e.kind === 'weekClosed'))
  assert.equal(reign.state.campaign.status, 'won')

  // A Tier V purchase in the Reign: Milestone 6 broken, the Orc resolved, Dominion 68, the purse.
  let shop = withPurse(withMilestones(withBuildings(reign.state, { barracks: 4 }), 6), 5_000)
  shop = withDominion({ ...shop, hexes: shop.hexes.map((h) => (h.road === 'barracks' && h.owner === 'player' && h.kind !== 'building' ? { ...h, owner: 'neutral' as const } : h)) }, 'barracks', 68)
  const bought = buyTier(shop, 'barracks', addDays(closeOf(38), 1))
  assert.ok(bought.ok, JSON.stringify(bought.reason))
  assert.equal(bought.state.buildings.barracks, 5)

  // The Chronicle's record: how each rival fell, and when.
  const record = chronicleRecord(reign.state)
  assert.equal(record.status, 'won')
  assert.deepEqual(record.rivals, [
    { rival: 'orc', status: 'conquered', week: 12 },
    { rival: 'goblin', status: 'allied', week: 20 },
    { rival: 'dwarf', status: 'abdicated', week: 36 },
    { rival: 'archmage', status: 'abdicated', week: 28 }
  ])
  assert.equal(record.daysKept, record.daysSettled, 'every day of this ledger kept every duty')
  assert.equal(record.hexesHeld, reign.state.hexes.filter((h) => h.owner === 'player').length)
  assert.ok(record.realmConsistency > 0.9)
  assert.equal(record.week, 38)
})

test('Ch 14: no Ascendancy in the Reign, and no Siege can be announced once the realm has fallen', () => {
  const won = { ...atRatio(realm(), 'orc', 3, 36), campaign: { ...realm().campaign, status: 'won' as const } }
  assert.equal(siege(weeks(won, 36, 40).state), undefined)
  const fallen = { ...realm(), campaign: { ...realm().campaign, status: 'fallen' as const } }
  assert.equal(worldAt(fallen, 40).state, fallen)
  const armory = withArmory(realm(), {})
  assert.equal(chronicleRecord(armory).status, 'active')
})
