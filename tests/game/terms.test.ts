/**
 * Patch 4 stage 5 (docs/redesign/patch-4-spec.md section 6; D-33): how each rival yields. The stance
 * bands from the six measures (C-38); nothing before week 16 or from a rival in a coalition or with an
 * Ascendancy streak; the Goblin's buy-offs, pact and surrender (C-35); the Archmage's surrender when his
 * life is at risk; the Dwarf's grudging surrender (R-12); the Orc's last battle (R-11, C-40); Accords and
 * defection for all but the Orc (R-13, C-41).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { ordersValidity } from '../../src/renderer/src/lib/game/combat'
import { post } from '../../src/renderer/src/lib/game/economy'
import { GRAND_HOOKS, pendingBattles } from '../../src/renderer/src/lib/game/grand'
import { bidCheck, blocksRaids } from '../../src/renderer/src/lib/game/land'
import { depthOf, isClaimableKind, neighbors } from '../../src/renderer/src/lib/game/map'
import { pactHolds } from '../../src/renderer/src/lib/game/personalities'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { bandOfScore, marchShareHeld, openTerms, stanceOf, stanceScore, termsWeek, weighsMost } from '../../src/renderer/src/lib/game/terms'
import type { CampaignState, Emit, GameEventKind, GrandBattle, RivalId } from '../../src/renderer/src/lib/game/types'
import { acceptTerms, accordGate, defects, refuseTerms } from '../../src/renderer/src/lib/game/world'
import { realm } from './support/realm'
import { hex } from './support/war'

const T = RULES.terms
/** Sunday 2027-02-14 closes campaign week 19 of `realm()` (weeks start Monday, the first day 2026-10-08). */
const CLOSE = '2027-02-14'
const WEEK = 19

function collect(): { emit: Emit; events: ({ kind: GameEventKind } & Record<string, unknown>)[] } {
  const events: ({ kind: GameEventKind } & Record<string, unknown>)[] = []
  return { events, emit: (kind, payload) => void events.push({ kind, ...payload }) }
}

/**
 * A realm the rivals fear: reputation earned past every threshold, Renown on every path, Realm
 * Consistency held, a dozen Grand Battles won, the rivals' armies cut to a tenth, and the player at the
 * close. `land` hands the player that share of the claimable neutral land.
 */
function mighty(land = 0.5, seed = 7): CampaignState {
  let s = realm(seed)
  s = { ...s, purse: post(s.purse, { date: '2026-10-08', kind: 'earn', amount: T.thresholds.reputation * 2, source: 'test' }) }
  const neutral = s.hexes.filter((h) => h.owner === 'neutral' && isClaimableKind(h) && h.kind !== 'lairMouth' && h.kind !== 'gate')
  const take = new Set(neutral.slice(0, Math.round(land * neutral.length)).map((h) => h.id))
  s = { ...s, hexes: s.hexes.map((h) => (take.has(h.id) ? { ...h, owner: 'player' } : h)) }
  const byRival = Object.fromEntries((['orc', 'goblin', 'dwarf', 'archmage'] as const).map((r) => [r, { renown: T.thresholds.dominion, rank: 0 }])) as NonNullable<CampaignState['paths']>['byRival']
  s = { ...s, paths: { byRival, logRead: s.log.length } }
  const weeks = Array.from({ length: T.constancyWeeks }, (_, i) => ({ ...(s.weight.weeks[0] ?? {}), week: i + 1, realmConsistency: 0.95 }))
  s = { ...s, weight: { ...s.weight, weeks: weeks as CampaignState['weight']['weeks'] } }
  const won: GrandBattle[] = Array.from({ length: T.thresholds.victories }, (_, i) => ({ id: `gb-${i + 1}`, trigger: 'mythicHunt', hexId: s.hexes[1].id, announcedOn: '2026-10-10', battleDate: '2026-10-12', enemy: [], result: 'victory' }))
  s = { ...s, grandBattles: won }
  // The rivals' armies cut (the Orc's only by half, so his last host can still march).
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as const) s = { ...s, rivals: { ...s.rivals, [r]: { ...s.rivals[r], companies: s.rivals[r].companies.map((c) => ({ ...c, power: c.power / (r === 'orc' ? 2 : 10) })), disposition: { ...s.rivals[r].disposition, player: 'tension' } } } }
  return { ...s, settlement: { ...s.settlement, lastLaunch: CLOSE } }
}

test('C-38: four bands from the weighted score: Defiant, Wary, Shaken, Ready to yield; the Herald names what each weighs most', () => {
  assert.deepEqual([0, 0.6, 0.75, 0.9, 1].map(bandOfScore), ['defiant', 'wary', 'shaken', 'ready', 'ready'])
  assert.equal(bandOfScore(0.59), 'defiant')
  assert.deepEqual(weighsMost('orc').slice(0, 2).sort(), ['army', 'victories'])
  assert.equal(weighsMost('goblin')[0], 'reputation')
  assert.equal(weighsMost('dwarf')[0], 'land')
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) {
    const sum = Object.values(T.weights[r]).reduce((s, v) => s + (v ?? 0), 0)
    assert.ok(Math.abs(sum - 1) < 1e-9, `${r}'s weights sum to 1`)
  }
})

test('D-33: a fresh realm leaves every rival Defiant; a mighty one brings them to Ready to yield', () => {
  const fresh = realm()
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) assert.equal(bandOfScore(stanceScore(fresh, r, CLOSE)), 'defiant')
  const strong = mighty()
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) assert.equal(bandOfScore(stanceScore(strong, r, CLOSE)), 'ready', r)
})

test('G-18: no stance and no terms before week 16; none while in a coalition, with an Ascendancy streak, or away', () => {
  const c = collect()
  const early = termsWeek(mighty(), { day: CLOSE, week: T.fromWeek - 1, emit: c.emit })
  assert.deepEqual(openTerms(early, addDays(CLOSE, 1)), [])
  assert.equal(c.events.filter((e) => e.kind === 'terms').length, 0)
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) assert.equal(stanceOf(early, r), 'defiant')
  const streak = mighty()
  const s2 = { ...streak, rivals: { ...streak.rivals, archmage: { ...streak.rivals.archmage, ascendancyStreak: 1 } } }
  assert.equal(openTerms(termsWeek(s2, { day: CLOSE, week: WEEK, emit: collect().emit }), addDays(CLOSE, 1)).some((o) => o.rival === 'archmage'), false)
  const away = { ...mighty(), settlement: { ...mighty().settlement, lastLaunch: addDays(CLOSE, -RULES.clock.absenceDays) } }
  assert.deepEqual(openTerms(termsWeek(away, { day: CLOSE, week: WEEK, emit: collect().emit }), addDays(CLOSE, 1)), [])
})

test('R-09 (C-39): the Archmage surrenders when his life is at risk; accepted, he abdicates and his company joins', () => {
  const c = collect()
  const s = termsWeek(mighty(), { day: CLOSE, week: WEEK, emit: c.emit })
  const offer = openTerms(s, addDays(CLOSE, 1)).find((o) => o.rival === 'archmage')
  assert.ok(offer && offer.offer === 'surrender')
  assert.equal(offer.until, addDays(CLOSE, RULES.worldAi.offerDays))
  assert.ok(c.events.some((e) => e.kind === 'stance' && e.rival === 'archmage' && e.to === 'ready'))
  const done = acceptTerms(s, 'archmage', addDays(CLOSE, 1))
  assert.ok(done.ok)
  assert.equal(done.state.rivals.archmage.status, 'abdicated')
  assert.ok(roster(done.state).some((co) => co.id === 'vassal:archmage'))
  assert.ok(done.state.log.some((e) => e.kind === 'terms' && e.stage === 'accepted' && e.rival === 'archmage'))
})

test('C-35: the Goblin, Shaken or more and pushed that week, offers a buy-off (a hex, an item or hired companies; never reputation); accepted, a 4-week pact leaves his march alone', () => {
  // Push his march this week: a hex of his taken on the close day.
  let s0 = mighty()
  const his = s0.hexes.find((h) => h.march === 'goblin' && !h.seam && depthOf(h) === 1 && h.owner === 'neutral') as (typeof s0.hexes)[number] | undefined
  const target = his ?? (s0.hexes.find((h) => h.march === 'goblin' && !h.seam && depthOf(h) === 1) as (typeof s0.hexes)[number])
  s0 = { ...s0, log: [...s0.log, { id: 'push', day: CLOSE, kind: 'hexTransfer', hexId: target.id, from: 'neutral', to: 'player', how: 'conquest' } as unknown as CampaignState['log'][number]] }
  // Without a surrender yet: Shaken, not Ready (lower his reading by taking the land away).
  const shaken = { ...s0, rivals: { ...s0.rivals, goblin: { ...s0.rivals.goblin } } }
  const s = termsWeek(shaken, { day: CLOSE, week: WEEK, emit: collect().emit })
  const offer = openTerms(s, addDays(CLOSE, 1)).find((o) => o.rival === 'goblin')
  assert.ok(offer)
  if (offer.offer === 'buyOff') {
    assert.ok(offer.gift && ['hex', 'item', 'hires'].includes(offer.gift.kind))
    const done = acceptTerms(s, 'goblin', addDays(CLOSE, 1))
    assert.ok(done.ok)
    const day = addDays(CLOSE, 2)
    assert.equal(pactHolds(done.state, day), true)
    assert.equal(pactHolds(done.state, addDays(CLOSE, 1 + T.goblin.pactWeeks * 7)), false)
    assert.equal(blocksRaids(done.state, 'goblin', day), true)
    const near = neighbors(target.id).find((n) => hex(done.state, n).march === 'goblin' && hex(done.state, n).owner !== 'player')
    if (near) {
      const problems = ordersValidity(done.state, { date: day, assaultTarget: near, assault: ['barracks'], defense: [] }).problems
      assert.ok(problems.some((p) => p.code === 'pact' || p.code === 'notClaimable' || p.code === 'barredByStronghold'))
    }
    const v = done.state.hexes.find((h) => h.march === 'goblin' && h.village && h.owner === 'neutral')
    if (v) assert.notEqual(bidCheck(done.state, v.id, 10).reason?.code, 'noSlot')
  } else assert.equal(offer.offer, 'surrender')
})

test('C-35: refused buy-offs make the next richer; after two refused, the Goblin offers to surrender', () => {
  let s = mighty()
  s = { ...s, terms: { byRival: { goblin: { refused: T.goblin.surrenderAfterRefused } } } }
  const out = termsWeek(s, { day: CLOSE, week: WEEK, emit: collect().emit })
  const offer = openTerms(out, addDays(CLOSE, 1)).find((o) => o.rival === 'goblin')
  assert.equal(offer?.offer, 'surrender')
  const refused = refuseTerms(out, 'goblin', addDays(CLOSE, 1))
  assert.ok(refused.ok)
  assert.deepEqual(openTerms(refused.state, addDays(CLOSE, 1)).filter((o) => o.rival === 'goblin'), [])
  // It comes back no sooner than 4 weeks later.
  const next = termsWeek(refused.state, { day: addDays(CLOSE, 7), week: WEEK + 1, emit: collect().emit })
  assert.equal(openTerms(next, addDays(CLOSE, 8)).some((o) => o.rival === 'goblin' && o.offer === 'surrender'), false)
})

test('R-12: the Dwarf surrenders once two thirds of his march are held; he yields as a grudging vassal, no company, his villages restless', () => {
  let s = mighty(0.2)
  const march = s.hexes.filter((h) => (h.march === 'dwarf' || h.seam === 'dwarf') && isClaimableKind(h) && h.kind !== 'gate')
  s = { ...s, hexes: s.hexes.map((h) => (march.some((m) => m.id === h.id) ? { ...h, owner: 'player' } : h)) }
  assert.ok(marchShareHeld(s, 'dwarf') >= T.dwarf.marchShare)
  const out = termsWeek(s, { day: CLOSE, week: WEEK, emit: collect().emit })
  const offer = openTerms(out, addDays(CLOSE, 1)).find((o) => o.rival === 'dwarf')
  assert.equal(offer?.offer, 'surrender')
  const done = acceptTerms(out, 'dwarf', addDays(CLOSE, 1))
  assert.ok(done.ok)
  assert.equal(done.state.rivals.dwarf.status, 'abdicated')
  assert.equal(done.state.rivals.dwarf.grudging, true)
  assert.equal(roster(done.state).some((co) => co.id === 'vassal:dwarf'), false, 'no levy company')
  const restless = done.state.personalities?.restless ?? []
  assert.ok(restless.length > 0)
  for (const r of restless) {
    const h = hex(done.state, r.hexId)
    assert.equal(h.owner, 'player')
    if (h.village) assert.ok(h.village.settlingUntil !== undefined)
  }
})

test('R-11, C-40: at his top band the Orc comes with a final Warhost below Respect 50, Ugrak’s Challenge from it; won, he is conquered', () => {
  const s = mighty()
  const proud = { ...s, rivals: { ...s.rivals, orc: { ...s.rivals.orc, respect: 0 } } }
  const out = termsWeek(proud, { day: CLOSE, week: WEEK, emit: collect().emit })
  const battle = pendingBattles(out).find((b) => b.final)
  assert.ok(battle)
  assert.equal(battle.trigger, 'warhost')
  const respectful = { ...s, rivals: { ...s.rivals, orc: { ...s.rivals.orc, respect: T.orc.respectBar } } }
  const duel = pendingBattles(termsWeek(respectful, { day: CLOSE, week: WEEK, emit: collect().emit })).find((b) => b.final)
  assert.ok(duel && duel.trigger === 'event' && duel.eventId === 'ugraksChallenge' && duel.limit === 2)
  const c = collect()
  const won = GRAND_HOOKS.final(out, battle, { day: battle.battleDate, won: true, result: 'victory', spoilsMult: 1, emit: c.emit })
  assert.equal(won.state.rivals.orc.status, 'conquered')
  assert.ok(c.events.some((e) => e.kind === 'terms' && e.stage === 'won'))
  const lost = GRAND_HOOKS.final(out, battle, { day: battle.battleDate, won: false, result: 'defeat', spoilsMult: 1, emit: collect().emit })
  assert.equal(lost.state.rivals.orc.status, 'active')
  // He offers no terms of any other kind.
  assert.equal(openTerms(out, addDays(CLOSE, 1)).some((o) => o.rival === 'orc'), false)
})

test('R-13, C-41: the Orc signs no Accord and never defects; the others still may', () => {
  const s = realm()
  assert.equal(accordGate(s, 'orc').reason, 'orcNeverSigns')
  assert.notEqual(accordGate(s, 'dwarf').reason, 'orcNeverSigns')
  const noVillages = { ...s, hexes: s.hexes.map((h) => (h.owner === 'orc' && h.village ? { ...h, owner: 'player' as const } : h)) }
  assert.equal(defects(noVillages, 'orc'), false)
})
