/**
 * Patch 3 stage 4 (docs/redesign/patch-3-spec.md section 5, D-24): routed enemies. A garrison
 * beaten without a rout falls back deeper (C-23); at each dawn of its window it may strike back at
 * the hex it lost (C-24), never while the player is away (R-24, C-25); and the fights it brings.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, combatOf, dawn, setOrders, tidings } from '../../src/renderer/src/lib/game/combat'
import { depthOf, isClaimableKind, neighbors, wildGarrison } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { chance, roll } from '../../src/renderer/src/lib/game/rng'
import { fallbackOn } from '../../src/renderer/src/lib/game/sieges'
import { todaysFights } from '../../src/renderer/src/lib/game/skirmish'
import type { CampaignState, Fallback, GameEvent, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { hexPanel, mapView } from '../../src/renderer/src/lib/game/view/realm'
import { heraldView, resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { near } from './support/assert'
import { allBuildings, realm } from './support/realm'
import { START, WEEK6, den, fight, hex, quiet, withDisposition, withHex, withOwner } from './support/war'

const F = RULES.sieges.fallback
const C = RULES.sieges.counterattack

/** The Champions alone on `target` (54 at full Valor against beasts, assault.test.ts). */
function send(state: CampaignState, target: string, day = START): CampaignState {
  return setOrders(state, { date: day, assaultTarget: target, assault: ['barracks'], defense: [] }).state
}

/** A den the Champions take at garrison 50 (no rout below 81), with neutral dens beside it no shallower (T-02). */
function setup(): { state: CampaignState; target: string; refuges: string[] } {
  const { state: s0, target } = den(allBuildings(realm(), 5))
  const t = hex(s0, target)
  const refuges = neighbors(target).filter((n) => {
    const h = s0.hexes.find((x) => x.id === n)
    return h !== undefined && h.owner === 'neutral' && !h.village && !h.mythic && isClaimableKind(h) && h.kind !== 'lairMouth' && depthOf(h) >= depthOf(t) && (h.march === t.march || h.seam === t.march || h.march === t.seam)
  })
  return { state: withHex(s0, target, { garrison: 50, garrisonDamage: 0 }), target, refuges }
}

/** The player launched the app on `day`, so they are not away (A-10). */
function present(state: CampaignState, day: string): CampaignState {
  return { ...state, settlement: { ...state.settlement, lastLaunch: day } }
}

/** A fallback id that strikes back on `day` for this campaign's seed (the draw is `counter:<id>`). */
function strikingId(state: CampaignState, day: string, strikes = true): string {
  for (let i = 0; ; i++) if (chance(state.campaign.seed, day, `counter:fb:test:${i}`, C.chancePerDay) === strikes) return `fb:test:${i}`
}

test('C-23, T-02 (D-24): a garrison beaten without a rout falls back to the neighbor of the same holder, no shallower, cheapest to assault; 50% of what the assault beat, fading over 3 days', () => {
  const { state, target, refuges } = setup()
  assert.ok(refuges.length > 1)
  const cheapest = [...refuges].sort((a, b) => assaultGarrison(state, hex(state, a), START) - assaultGarrison(state, hex(state, b), START) || a.localeCompare(b))[0]
  const day = fight(quiet(send(state, target)), START, 1)
  assert.equal(day.of('assault')[0].outcome, 'taken')
  const [posted] = day.of('fallback')
  assert.equal(posted.to, cheapest)
  // Made dearer than the rest, it is passed over for the next cheapest.
  const dearer = fight(quiet(send(withHex(state, cheapest, { garrison: 1e5 }), target)), START, 1)
  assert.notEqual(dearer.of('fallback')[0].to, cheapest)
  assert.deepEqual({ ...posted, to: undefined }, { hexId: target, to: undefined, holder: 'neutral', strength: 25 })
  const to = hex(day.state, posted.to)
  near(fallbackOn(day.state, to, addDays(START, 1)), 25)
  near(fallbackOn(day.state, to, addDays(START, 2)), 25 * (2 / 3))
  near(fallbackOn(day.state, to, addDays(START, 3)), 25 * (1 / 3))
  assert.equal(fallbackOn(day.state, to, addDays(START, 4)), 0)
  near(assaultGarrison(day.state, to, addDays(START, 1)) - assaultGarrison(day.state, to, addDays(START, 4)), 25)
})

test('C-23: a rout, a village’s militia and a garrison with nowhere to go never fall back', () => {
  const { state, target, refuges } = setup()
  const routed = fight(quiet(send(withHex(state, target, { garrison: 30 }), target)), START, 1)
  assert.equal(routed.of('assault')[0].outcome, 'rout')
  assert.deepEqual(routed.of('fallback'), [])
  const cornered = fight(quiet(send(withOwner(state, refuges, 'orc'), target)), START, 1)
  assert.equal(cornered.of('assault')[0].outcome, 'taken')
  assert.deepEqual(cornered.of('fallback'), [], 'its neighbors no shallower are another holder’s')
  const militia = fight(quiet(send(withHex(state, target, { village: { loyalty: 10 } }), target)), START, 1)
  assert.deepEqual(militia.of('fallback'), [])
})

test('C-23: fallbacks on one hex add at most its own garrison, and a force whose refuge falls goes on falling back', () => {
  const { state, target, refuges } = setup()
  const refuge = hex(state, refuges[0])
  const big: Fallback[] = [0, 1].map((i) => ({ id: `fb:x:${i}`, from: target, to: refuge.id, holder: 'neutral', strength: refuge.garrison, day: START }))
  near(fallbackOn({ ...state, fallbacks: big }, refuge, addDays(START, 1)), F.stackCap * refuge.garrison)
  // Taken itself, the refuge's garrison and the force in it are beaten together: half of that falls back again.
  const first = fight(quiet(send(state, target)), START, 1)
  const to = first.of('fallback')[0].to
  const next = addDays(START, 1)
  const beaten = assaultGarrison(first.state, hex(first.state, to), next)
  const again = fight(quiet(send(withHex(first.state, to, { garrisonDamage: beaten - 50 }), to, next), next), next, 1)
  assert.equal(again.of('assault')[0].outcome, 'taken')
  assert.equal((again.state.fallbacks ?? []).some((f) => f.to === to), false, 'the force that was there fell with it')
  for (const f of again.of('fallback')) near(f.strength, F.share * 50, 0.1)
})

test('C-24, T-03 (D-24): each dawn of its window a fallen force draws once whether it strikes back; it strikes at its strength that day × 1.5 × the roll', () => {
  const { state: s0, target, refuges } = setup()
  const day = WEEK6
  const taken = present(withOwner(s0, [target], 'player'), day)
  const id = strikingId(taken, day)
  const force: Fallback = { id, from: target, to: refuges[0], holder: 'neutral', strength: 30, day: addDays(day, -1) }
  const at = dawn({ ...taken, fallbacks: [force] }, day)
  const [c] = combatOf(at).counterattacks ?? []
  const r = roll(at.campaign.seed, day, `counter:roll:${id}`, -RULES.combat.strength.roll, RULES.combat.strength.roll)
  assert.deepEqual({ ...c, strength: 0 }, { date: day, hexId: target, strength: 0, fallbackId: id })
  near(c.strength, 30 * C.strengthMult * (1 + r))
  assert.equal(at.fallbacks?.[0].struck, day)
  assert.equal(fallbackOn(at, hex(at, refuges[0]), day), 0, 'it left its refuge to strike')
  assert.deepEqual(dawn(at, day), at, 'a second dawn draws nothing new')
  const notice = tidings(at, day).threats.find((t) => t.kind === 'counterattack')
  assert.equal(notice?.hexId, target)
  assert.ok(notice?.band)
  assert.ok(heraldView(at, day).lines.some((l) => l.textId === 'herald.threat.counterattack'))
  assert.ok(todaysFights(at, day).some((f) => f.side === 'defense' && f.threat === 'counterattack' && f.hexId === target))
  // One that doesn't strike draws once too, and keeps digging in.
  const calm = strikingId(taken, day, false)
  const stays = dawn({ ...taken, fallbacks: [{ ...force, id: calm }] }, day)
  assert.deepEqual(combatOf(stays).counterattacks ?? [], [])
  assert.equal(stays.fallbacks?.[0].drawnThrough, day)
})

test('C-24, C-25 (R-24): no counterattack before week 3, while the player has been away 14 days or more, or from a rival who may not raid', () => {
  const { state: s0, target, refuges } = setup()
  const taken = present(withOwner(s0, [target], 'player'), addDays(START, 1))
  const early = START
  const quietEarly = dawn({ ...taken, fallbacks: [{ id: strikingId(taken, addDays(early, 1)), from: target, to: refuges[0], holder: 'neutral', strength: 30, day: early }] }, addDays(early, 1))
  assert.deepEqual(combatOf(quietEarly).counterattacks ?? [], [], 'week 1')
  const day = WEEK6
  const id = strikingId(taken, day)
  const force: Fallback = { id, from: target, to: refuges[0], holder: 'neutral', strength: 30, day: addDays(day, -1) }
  const here = present({ ...taken, fallbacks: [force] }, day)
  assert.equal((combatOf(dawn(here, day)).counterattacks ?? []).length, 1, 'present, it strikes')
  const away = { ...taken, settlement: { ...taken.settlement, lastLaunch: addDays(day, -RULES.clock.absenceDays) }, fallbacks: [force] }
  const absent = dawn(away, day)
  assert.deepEqual(combatOf(absent).counterattacks ?? [], [])
  assert.equal(absent.fallbacks?.[0].drawnThrough, day, 'the draw is spent: coming back changes nothing for today')
  const orc = present(withOwner(taken, [refuges[0]], 'orc'), day)
  const peace = withDisposition({ ...orc, fallbacks: [{ ...force, holder: 'orc' as RivalId }] }, 'orc', 'peace')
  assert.deepEqual(combatOf(dawn(peace, day)).counterattacks ?? [], [])
})

test('C-24 (D-24): a counterattack held scatters its force; lost, the hex goes back at once with tribute and no scorch: to the wilds for beasts, to the rival for his', () => {
  const { state: s0, target, refuges } = setup()
  const day = WEEK6
  const base = withOwner(s0, [target], 'player')
  const strike = (s: CampaignState, strength: number, rival?: RivalId): CampaignState => ({
    ...s,
    fallbacks: [{ id: 'fb:f', from: target, to: refuges[0], holder: rival ?? 'neutral', strength, day: addDays(day, -1), drawnThrough: day, struck: day }],
    combat: { ...combatOf(s), counterattacks: [{ date: day, hexId: target, ...(rival ? { rival } : {}), strength, fallbackId: 'fb:f' }] }
  })
  const held = fight(quiet(strike(base, 1), day), day, 1)
  const won = held.of('defense').find((d) => d.threat === 'counterattack')
  assert.notEqual(won?.outcome, 'defeat')
  assert.ok((won?.spoils ?? 0) > 0)
  assert.equal(hex(held.state, target).owner, 'player')
  assert.deepEqual(held.state.fallbacks, [])

  const beasts = fight(quiet(strike(base, 1e5), day), day, 0)
  const lost = beasts.of('defense').find((d) => d.threat === 'counterattack')
  assert.equal(lost?.outcome, 'defeat')
  assert.equal(lost?.retaken, true)
  assert.ok((lost?.tribute ?? 0) > 0)
  const wild = hex(beasts.state, target)
  assert.deepEqual([wild.owner, wild.status], ['neutral', 'held'])
  near(wild.garrison, wildGarrison(wild, false))
  assert.deepEqual(beasts.of('hexTransfer').filter((t) => t.hexId === target), [{ hexId: target, from: 'player', to: 'neutral', how: 'wilds' }])

  const rivals = fight(quiet(withDisposition(strike(withOwner(base, [refuges[0]], 'orc'), 1e5, 'orc'), 'orc', 'war'), day), day, 0)
  assert.equal(hex(rivals.state, target).owner, 'orc')
  assert.deepEqual(rivals.of('hexTransfer').filter((t) => t.hexId === target), [{ hexId: target, from: 'player', to: 'orc', how: 'conquest' }])
  const report = { id: 'e1', day, kind: 'defense', ...rivals.of('defense').find((d) => d.threat === 'counterattack') } as GameEvent
  assert.equal(resultLine(report)?.textId, 'battle.counterattack.defeat')
})

test('D-24: the map and the hex panel show a garrison fallen back, and the Herald reports it', () => {
  const { state, target } = setup()
  const day = fight(quiet(send(state, target)), START, 1)
  const to = day.of('fallback')[0].to
  const next = addDays(START, 1)
  const cell = mapView(day.state, next).find((h) => h.id === to)
  assert.deepEqual(cell?.fallback, { strength: 25, daysLeft: F.days })
  const panel = hexPanel(day.state, to, next)
  assert.deepEqual(panel?.fallback?.from.map((f) => f.hexId), [target])
  const e = { id: 'e1', day: START, kind: 'fallback', ...day.of('fallback')[0] } as GameEvent
  assert.equal(resultLine(e)?.textId, 'herald.fallback')
  assert.ok((hex(day.state, to) as HexState).garrison > 0)
})
