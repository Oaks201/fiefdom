/**
 * Patch 5 (docs/redesign/patch-5-spec.md section 6.2; D-38, C-51 to C-55): the bent marches' one-time
 * migration of an older save. Proved on the synthetic 3.1.0 and 3.2.0 fixtures (no one's real save is
 * read), and on a copy of the 3.2.0 one topped up so every field of the spec's inventory holds a hex the
 * bend moves.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { bentIds, hexName, isClaimableKind, onMap, parseHexId, rulingMarch, straightId } from '../../src/renderer/src/lib/game/map'
import { migrateCampaign, renameHexIds } from '../../src/renderer/src/lib/game/migrate'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { draw } from '../../src/renderer/src/lib/game/rng'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import type { CampaignState, GameEvent } from '../../src/renderer/src/lib/game/types'

const load = (version: string): CampaignState => (JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `campaign-${version}.json`), 'utf8')) as { state: CampaignState }).state
const SAVES = { '3.1.0': load('3.1.0'), '3.2.0': load('3.2.0') }
const MOVED = bentIds()

/**
 * The spec's inventory (section 6.2): every place a hex id may sit, as the walk below names it
 * (`[]` an array entry, `[kind]` a log event or offer of that kind, `{hex}` an object key that is a hex id).
 */
const INVENTORY = new Set([
  'hexes[].id',
  'orders[].assaultTarget',
  'orders[].extraAssaults[].target',
  'courtships[].hexId',
  'rivals.*.ai.courting[].hexId',
  'deals[].hexId',
  'standingSiege.hexId',
  'grandBattles[].hexId',
  'grandBattles[].outcome.hexTaken',
  'grandBattles[].outcome.hexLost',
  'grandBattles[].outcome.hexScorched',
  'skirmishes[].fights[].hexId',
  'skirmishes[].fights[].id',
  'combat.tidings[].hexId',
  'combat.conquests[].hexId',
  'combat.contested[].hexId',
  'combat.counterattacks[].hexId',
  'combat.counterattacks[].fallbackId',
  'fallbacks[].id',
  'fallbacks[].from',
  'fallbacks[].to',
  'world.offers[goblinBuys].hexId',
  'world.offers[uprising].hexId',
  'world.offers[buyBack].hexId',
  'world.offers[terms].gift.hexId',
  'world.auction.lots[].hexId',
  'world.lowLoyalty.{hex}',
  'worldEvents[].data.hexIds[]',
  'personalities.surges[].hexId',
  'personalities.goblinBids[].hexId',
  'personalities.dissolved[].hexId',
  'personalities.summoned[].hexId',
  'personalities.restless[].hexId',
  'purse.events[].source',
  ...['defense', 'assault', 'calledOff', 'trophy', 'hexTransfer', 'deed', 'standingSiege', 'fallback', 'bribe', 'goblinBid', 'surge', 'terms', 'restless', 'courtship', 'deal', 'rivalNews', 'borderCampaign', 'grandBattle', 'ritual'].map((k) => `log[${k}].hexId`),
  'log[fallback].to',
  'log[terms].gift',
  'log[worldEvent].hexIds[]'
])

/** The test's own reading of the rename: a whole id, or a `:`-part of one. */
function expected(s: string): string {
  if (MOVED.has(s)) return MOVED.get(s) as string
  return s.includes(':') ? s.split(':').map((p) => MOVED.get(p) ?? p).join(':') : s
}

/** Walks the old and new saves side by side: every string or key is `expected` of the old; every other leaf is unchanged. Returns the places renamed. */
function compare(before: unknown, after: unknown, at: string, renamed: Set<string>): void {
  if (typeof before === 'string') {
    assert.equal(after, expected(before), at)
    if (after !== before) renamed.add(at)
    return
  }
  if (Array.isArray(before)) {
    assert.ok(Array.isArray(after) && after.length === before.length, at)
    // The log's events and the world's offers are named by their kind; other entries by [] alone.
    const byKind = at === '.log' || at === '.world.offers'
    before.forEach((x, i) => {
      const kind = byKind && x && typeof x === 'object' && typeof (x as { kind?: unknown }).kind === 'string' ? (x as { kind: string }).kind : ''
      compare(x, (after as unknown[])[i], `${at}[${kind}]`, renamed)
    })
    return
  }
  if (before !== null && typeof before === 'object') {
    const a = after as Record<string, unknown>
    assert.equal(Object.keys(a).length, Object.keys(before).length, at)
    for (const [k, v] of Object.entries(before)) {
      const key = expected(k)
      const named = key !== k || onMap(k) ? `${at}.{hex}` : at === '.rivals' ? `${at}.*` : `${at}.${k}`
      if (key !== k) renamed.add(named)
      assert.ok(key in a, `${at}: key ${k}`)
      compare(v, a[key], named, renamed)
    }
    return
  }
  // Numbers and flags are unchanged, but for a hex record's own coordinates.
  if (/^\.hexes\[\]\.(q|r)$/.test(at)) return
  assert.equal(after, before, at)
}

/** The 3.2.0 save topped up so every field of the inventory holds a hex the bend moves (spec section 2.2 item 4). */
function toppedUp(): CampaignState {
  const s = SAVES['3.2.0']
  const moved = s.hexes.filter((h) => MOVED.has(h.id) && isClaimableKind(h))
  const [a, b, c] = moved.map((h) => h.id)
  const day = s.settledThrough.day
  const fight = { id: `defense:raid:orc:${a}`, side: 'defense' as const, hexId: a, companies: [], enemy: [], setup: { readiness: 1, marshal: true, units: [], deck: [], offer: 3, hire: { power: 1, name: 'x' }, orderStages: {} }, log: [] }
  const event = (kind: string, extra: Record<string, unknown>): GameEvent => ({ id: `top-${kind}`, day, kind, ...extra }) as GameEvent
  return {
    ...s,
    orders: [...s.orders, { date: day, assaultTarget: a, assault: [], defense: [], extraAssaults: [{ target: b, companies: [] }] }],
    courtships: [...s.courtships, { hexId: a, bid: 1, placedOn: day, rivalBids: {} }],
    rivals: { ...s.rivals, goblin: { ...s.rivals.goblin, ai: { ...s.rivals.goblin.ai, courting: [{ hexId: b, bid: 1, placedOn: day }] } } },
    deals: [...s.deals, { id: 'deal-top', rival: 'orc', kind: 'buyHex', madeOn: day, hexId: c, price: 1 }],
    standingSiege: { hexId: a, since: day },
    grandBattles: [...s.grandBattles, { id: 'gb-top', trigger: 'gate', hexId: a, announcedOn: day, battleDate: day, enemy: [], result: 'victory', outcome: { hexTaken: a, hexLost: b, hexScorched: c } }],
    skirmishes: [{ day, valor: 1, fights: [fight] }],
    combat: {
      schedule: s.combat?.schedule ?? [],
      tidings: [...(s.combat?.tidings ?? []), { date: day, kind: 'beasts', hexId: a, strength: 1, siegeDay: false }],
      conquests: [{ rival: 'orc', hexId: b, announcedOn: day, date: day, strength: 1 }],
      contested: [{ hexId: c, rival: 'orc', strength: 1, since: day, until: day }],
      counterattacks: [{ date: day, hexId: a, strength: 1, fallbackId: `fb:${day}:${a}` }]
    },
    fallbacks: [{ id: `fb:${day}:${a}`, from: a, to: b, holder: 'orc', strength: 1, day }],
    world: {
      ...(s.world as NonNullable<CampaignState['world']>),
      lowLoyalty: { [a]: 1 },
      offers: [
        { kind: 'goblinBuys', hexId: a, price: 1, until: day },
        { kind: 'uprising', hexId: b, price: 1, until: day },
        { kind: 'buyBack', hexId: c, price: 1, until: day },
        { kind: 'terms', rival: 'goblin', offer: 'buyOff', until: day, gift: { kind: 'hex', hexId: a } }
      ],
      auction: { until: day, lots: [{ hexId: b, bids: {} }] }
    },
    worldEvents: [...s.worldEvents, { id: 'we-top', firedOn: day, data: { hexIds: [a, b] } }],
    personalities: {
      ...s.personalities,
      surges: [{ date: day, surge: 'swell', hexId: a }],
      goblinBids: [{ hexId: b, offer: 1, placedOn: day }],
      dissolved: [{ hexId: c, day }],
      summoned: [{ hexId: a, until: day }],
      restless: [{ hexId: b, until: day }]
    },
    purse: { events: [...s.purse.events, { id: 'p-top', date: day, kind: 'spend', amount: 1, source: `deal:buyHex:orc:${c}` }] },
    log: [
      ...s.log,
      ...['defense', 'assault', 'calledOff', 'trophy', 'hexTransfer', 'deed', 'standingSiege', 'bribe', 'goblinBid', 'surge', 'restless', 'courtship', 'deal', 'rivalNews', 'borderCampaign', 'grandBattle', 'ritual'].map((k) => event(k, { hexId: a })),
      event('fallback', { hexId: a, to: b }),
      event('terms', { hexId: a, gift: `hex:${b}` }),
      event('worldEvent', { eventId: 'beastSurge', hexIds: [a, c] })
    ]
  }
}

test('D-37: the bend moves 260 of the 321 hexes; the heartland and rings 3 and 4 stay put', () => {
  assert.equal(MOVED.size, 260)
  for (const [from, to] of MOVED) {
    assert.notEqual(from, to)
    const ring = (id: string): number => Math.max(...Object.values(parseHexId(id)).map(Math.abs), Math.abs(parseHexId(id).q + parseHexId(id).r))
    assert.equal(ring(to), ring(from), 'a hex keeps its ring')
    assert.ok(ring(from) >= 5)
    assert.equal(straightId(to), from)
  }
})

test('D-38: each fixture migrates once: every moved hex id it holds is renamed, and nothing else changes', () => {
  for (const [version, save] of Object.entries(SAVES)) {
    const { state, applied } = migrateCampaign(save)
    assert.deepEqual(applied, ['bentMarches'], version)
    const renamed = new Set<string>()
    compare({ ...save, campaign: { ...save.campaign, migrations: ['bentMarches'] } }, state, '', renamed)
    for (const place of renamed) assert.ok(INVENTORY.has(place.replace(/^\./, '')), `${version}: ${place} is renamed but not in the inventory`)
    assert.ok(renamed.size >= 10, `${version}: renamed ${renamed.size} places`)
    // The hexes keep their order and everything but their position (C-55).
    state.hexes.forEach((h, i) => {
      const old = save.hexes[i]
      assert.deepEqual({ ...h, id: old.id, q: old.q, r: old.r }, old)
      assert.deepEqual(parseHexId(h.id), { q: h.q, r: h.r })
      assert.ok(onMap(h.id), h.id)
    })
    assert.deepEqual(migrateCampaign(state), { state, applied: [] }, `${version}: never again`)
  }
})

test('D-38: on a save that holds a moved hex in every field of the inventory, every one is renamed', () => {
  const save = toppedUp()
  const { state } = migrateCampaign(save)
  const renamed = new Set<string>()
  compare({ ...save, campaign: { ...save.campaign, migrations: ['bentMarches'] } }, state, '', renamed)
  const places = new Set([...renamed].map((p) => p.replace(/^\./, '')))
  for (const want of INVENTORY) if (want !== 'hexes[].id') assert.ok(places.has(want) || want === 'log[terms].gift', `${want} renamed`)
  assert.ok(places.has('log[terms].gift') || places.has('log[terms].hexId'))
})

test('D-38, C-54: every hex keeps its name, and a seam keeps its ruling march on every day already played', () => {
  const save = SAVES['3.1.0']
  const { state } = migrateCampaign(save)
  // Names follow their hexes (C-58): the codex names each hex at its new id.
  const nameAt = new Map(CODEX.hexes.map((h) => [h.id, h.name]))
  assert.equal(hexName(MOVED.get('0,-14') as string), 'Ashgate', 'the Orc’s Gate, turned four steps with ring 14')
  for (const h of state.hexes) assert.equal(hexName(h), nameAt.get(h.id))
  const days = Array.from({ length: 60 }, (_, i) => addDays(save.settledThrough.day, -i))
  for (const [i, h] of state.hexes.entries()) {
    if (!h.seam) continue
    const old = save.hexes[i]
    for (const day of days) {
      const before = draw(save.campaign.seed, day, `seam:${old.id}`) < RULES.map.seamFirstChance ? old.march : old.seam
      assert.equal(rulingMarch(state.campaign.seed, h, day), before, `${h.id} on ${day}`)
    }
  }
})

test('D-38: a save that needs a re-founding is never migrated', () => {
  const old = { ...SAVES['3.1.0'], campaign: { ...SAVES['3.1.0'].campaign, ruleVersion: '2.2.0' } }
  assert.deepEqual(migrateCampaign(old), { state: old, applied: [] })
})

test('C-52: the rename touches only whole ids, keys and `:`-parts, never a string that merely contains one', () => {
  const [from, to] = [...MOVED][0]
  assert.deepEqual(renameHexIds({ a: from, b: `x:${from}:y`, [from]: 1, c: `${from}0`, d: [from, 3, null] }, MOVED), { a: to, b: `x:${to}:y`, [to]: 1, c: `${from}0`, d: [to, 3, null] })
})
