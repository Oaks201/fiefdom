/**
 * Patch 4 (docs/redesign/patch-4-spec.md section 9, C-49): what the player sees of the rivals' new
 * rules. The hex panel's bribe, hold, sell-back and bend actions match the engine; his greed, his bid
 * and a rival's stance show as words, never as the hidden numbers behind them; the Terms banner says
 * what accepting and refusing do; and the Herald reads every new event through its catalog slot.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { bribePrice } from '../../src/renderer/src/lib/game/goblin'
import { depthOf, neighbors } from '../../src/renderer/src/lib/game/map'
import { withPersonalities } from '../../src/renderer/src/lib/game/personalities'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { openDayOf, withWorld, worldOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, GameEvent, GameEventKind, HexState } from '../../src/renderer/src/lib/game/types'
import { rivalPanel } from '../../src/renderer/src/lib/game/view/diplomacy'
import { termsBanners } from '../../src/renderer/src/lib/game/view/endgame'
import { hexPanel } from '../../src/renderer/src/lib/game/view/realm'
import { heraldView, realmConsistencyNow, resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { near } from './support/assert'
import { realm, withPurse } from './support/realm'
import { hex, withOwner } from './support/war'

/** A neutral plain hex of the Goblin's march at depth 1, and the player holding the heartland hex beside it. */
function front(state: CampaignState = withPurse(realm(), 5_000)): { state: CampaignState; target: HexState } {
  const target = state.hexes.find((h) => h.march === 'goblin' && !h.seam && depthOf(h) === 1 && !h.village && h.owner === 'neutral') as HexState
  const inner = neighbors(target.id).find((n) => hex(state, n).ring === 2 && hex(state, n).kind !== 'building') as string
  return { state: withOwner(state, [inner], 'player'), target }
}

/** A day in campaign week `week`. */
function inWeek(state: CampaignState, week: number): string {
  return addDays(state.campaign.startDate, (week - 1) * RULES.clock.daysPerWeek)
}

test('C-49: a hex of the Goblin’s march shows his rules, a bribe at the engine’s price and his greed as a word', () => {
  const { state, target } = front(withPersonalities(withPurse(realm(), 5_000), { goblinGreed: 2 }))
  const today = openDayOf(state)
  const panel = hexPanel(state, target.id, today)
  assert.ok(panel)
  assert.equal(panel.rule, 'goblin')
  assert.equal(panel.greed, 'dear')
  const b = panel.actions.find((a) => a.kind === 'bribe')
  assert.ok(b?.available)
  near(b.cost ?? 0, bribePrice(state, target, today, realmConsistencyNow(state), realmEffects(state)))
  assert.doesNotMatch(JSON.stringify(panel), /greedMult|goblinGreed/)
})

test('C-49: his bid on a village of the player’s shows whether it would sway it and the hold so far, never his offer', () => {
  const base = withPurse(realm(), 5_000)
  const village = base.hexes.find((h) => h.march === 'goblin' && h.village && !h.seam && h.ring > RULES.land.protectedThroughRing) as HexState
  const today = openDayOf(base)
  const state = withPersonalities(withOwner(base, [village.id], 'player'), { goblinBids: [{ hexId: village.id, offer: 987.6, placedOn: addDays(today, -1), hold: 4 }] })
  const panel = hexPanel(state, village.id, today)
  assert.ok(panel?.goblinBid)
  assert.deepEqual(Object.keys(panel.goblinBid).sort(), ['hold', 'sways'])
  assert.equal(panel.goblinBid.sways, true)
  assert.equal(panel.goblinBid.hold, 4)
  assert.ok(panel.actions.some((a) => a.kind === 'hold' && a.available))
  assert.doesNotMatch(JSON.stringify(panel), /987/)
})

test('C-44: his buy-back offer shows on the hex with its price, and selling it back is offered', () => {
  const { state: s0, target } = front()
  const today = openDayOf(s0)
  const state = withWorld(withOwner(s0, [target.id], 'player'), { offers: [...worldOf(s0).offers, { kind: 'buyBack', hexId: target.id, price: 42, until: addDays(today, 3) }] })
  const panel = hexPanel(state, target.id, today)
  assert.deepEqual(panel?.buyBack, { price: 42, until: addDays(today, 3) })
  assert.ok(panel?.actions.some((a) => a.kind === 'sellBack' && a.available && a.cost === 42))
})

test('D-33: a court shows its stance as a word from week 16 only, and his march in plain lines', () => {
  const s0 = realm()
  const banded: CampaignState = { ...s0, terms: { byRival: { goblin: { band: 'shaken' } } } }
  assert.equal(rivalPanel(banded, 'goblin', realmEffects(banded), inWeek(banded, 15)).stance, undefined)
  const panel = rivalPanel(banded, 'goblin', realmEffects(banded), inWeek(banded, 16))
  assert.deepEqual(panel.stance, { band: 'shaken', label: 'Shaken' })
  assert.ok(panel.rumors.some((r) => r.textId.startsWith('herald.terms.rumor.')), 'the Herald says what he watches')
  assert.deepEqual(
    rivalPanel(withPersonalities(s0, { goblinGreed: 4 }), 'goblin').march.map((m) => m.label),
    ['His prices: gouging']
  )
  const orc = rivalPanel(withPersonalities(s0, { orcTrack: -2 }), 'orc')
  assert.deepEqual(orc.march, [], 'his war track is drawn on its own, as orcWar')
  assert.equal(orc.orcWar?.tug.leader, 'Ugrak leads by 2')
  assert.doesNotMatch(JSON.stringify(panel), /threshold|score|weight/i)
})

test('D-33: the Terms banner names the gift and what accepting and refusing do; none without an open offer', () => {
  const s0 = realm()
  const today = openDayOf(s0)
  assert.deepEqual(termsBanners(s0, today), [])
  const state = withWorld(s0, { offers: [{ kind: 'terms', rival: 'goblin', offer: 'buyOff', until: addDays(today, 6), gift: { kind: 'hires', count: 2 } }] })
  const [b] = termsBanners(state, today)
  assert.equal(b.offer, 'buyOff')
  assert.match(b.accept, /^2 hired companies for 4 weeks, and a pact for 4 weeks/)
  assert.match(b.refuse, /4 weeks/)
  assert.doesNotMatch(b.text, /\{/)
  const dwarf = withWorld(s0, { offers: [{ kind: 'terms', rival: 'dwarf', offer: 'surrender', until: addDays(today, 6) }] })
  assert.match(termsBanners(dwarf, today)[0].accept, /grudging vassal/)
})

test('D-31: the Herald tells today’s surge at dawn; tomorrow’s only with foresight', () => {
  const s0 = realm()
  const today = openDayOf(s0)
  const target = s0.hexes.find((h) => h.march === 'archmage' && h.owner === 'neutral' && !h.seam) as HexState
  const state = withPersonalities(s0, {
    surges: [
      { date: today, surge: 'swell', hexId: target.id, mult: 1.75 },
      { date: addDays(today, 1), surge: 'ebb', hexId: target.id, mult: 0.6 }
    ]
  })
  const lines = heraldView(state, today).lines
  const swell = lines.find((l) => l.textId === 'herald.surge.swell')
  assert.ok(swell)
  assert.match(swell.text, /1\.75/)
  assert.ok(!lines.some((l) => l.textId === 'herald.surge.tomorrow'), 'no Mage Tower foresight, no Archmage rank: tomorrow is not told')
})

test('Ch 17: every new event the Herald reports reads through its catalog slot with every placeholder filled', () => {
  const s0 = realm()
  const h = s0.hexes.find((x) => x.march === 'goblin' && !x.seam) as HexState
  const events: ({ kind: GameEventKind } & Record<string, unknown>)[] = [
    { kind: 'bribe', hexId: h.id, owner: 'goblin', price: 40, garrison: 60 },
    ...(['placed', 'held', 'lost', 'void'] as const).map((stage) => ({ kind: 'goblinBid' as const, hexId: h.id, stage, offer: 555 })),
    { kind: 'orcTrack', from: 0, to: 2 },
    { kind: 'stance', rival: 'archmage', from: 'wary', to: 'shaken' },
    { kind: 'terms', rival: 'goblin', offer: 'buyOff', stage: 'offered', gift: `hex:${h.id}`, hexId: h.id },
    { kind: 'terms', rival: 'goblin', offer: 'buyOff', stage: 'offered', gift: 'hires:1' },
    { kind: 'terms', rival: 'dwarf', offer: 'surrender', stage: 'offered' },
    { kind: 'terms', rival: 'orc', offer: 'finalWarhost', stage: 'offered', hexId: h.id },
    { kind: 'terms', rival: 'orc', offer: 'challenge', stage: 'offered', hexId: h.id },
    ...(['accepted', 'refused', 'lapsed', 'won', 'lost'] as const).map((stage) => ({ kind: 'terms' as const, rival: 'orc', offer: 'finalWarhost', stage, hexId: h.id })),
    { kind: 'restless', hexId: h.id, stage: 'uprising' }
  ]
  for (const e of events) {
    const line = resultLine({ id: 'e', day: openDayOf(s0), ...e } as GameEvent)
    assert.ok(line, `${e.kind} is told`)
    assert.doesNotMatch(line.text, /\{/, `${line.textId}: ${line.text}`)
    if (e.kind === 'goblinBid') assert.doesNotMatch(line.text, /555/, 'his offer is never told')
  }
})
