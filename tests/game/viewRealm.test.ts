/**
 * T15: the Realm page's view models (Ch 3, Ch 6, Ch 7, Ch 10, A-36): the map's layout, the hex
 * panel's actions against the engine's own checks, Dominion's sources, the buildings' offers, and
 * the orders panel (banners, the 04:00 lock, the Marshal's default, the estimate).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { tierOffer } from '../../src/renderer/src/lib/game/buildings'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { addDays, dayCloseInstant } from '../../src/renderer/src/lib/game/clock'
import { ordersEstimate, ordersValidity, setOrders } from '../../src/renderer/src/lib/game/combat'
import { challenge } from '../../src/renderer/src/lib/game/grand'
import { bidCheck, fortifyOffer, offerDeal, reclaimOffer } from '../../src/renderer/src/lib/game/land'
import { buildMap, dominion, dominionSources } from '../../src/renderer/src/lib/game/map'
import { shuffle } from '../../src/renderer/src/lib/game/rng'
import { rosterDetail } from '../../src/renderer/src/lib/game/roster'
import { settle, valorOn } from '../../src/renderer/src/lib/game/settle'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { BUILDING_IDS, type CampaignState, type HexState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { marshalOrders, moveCompany, ordersLock, ordersView, repeatYesterday, toggleDefender, withTarget } from '../../src/renderer/src/lib/game/view/orders'
import {
  HEX_WIDTH,
  buildingsView,
  castleView,
  clampMapZoom,
  companyArt,
  crossingsView,
  effectLines,
  hexLayout,
  hexPanel,
  mapView,
  mapViewBox,
  panMap,
  regionTerrainSlot,
  rosterView,
  suggestedBid,
  tiltedBoard,
  wholeMap,
  zoomMapAt
} from '../../src/renderer/src/lib/game/view/realm'
import { driveCampaign } from './support/campaign-driver'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import manifest from '../../src/renderer/public/game-assets/manifest.json'
import { rivalPanels } from '../../src/renderer/src/lib/game/view/diplomacy'
import { realm, withBuildings, withCastle, withCrossings, withDominion, withPurse } from './support/realm'

/** A mid-game realm: 16 weeks of a steady, greedy player, settled day by day. */
function midGame(seed: number): CampaignState {
  return driveCampaign({ seed, weeks: 16, habits: 'steady', policy: 'greedy' }).state
}

test('T15: no two of the 127 hex centers are closer than the hex width × 0.9; neighbors are one width apart', () => {
  const { points } = hexLayout(realm().hexes)
  assert.equal(points.length, 127)
  let least = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) least = Math.min(least, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
  }
  assert.ok(least >= HEX_WIDTH * 0.9)
  assert.ok(Math.abs(least - HEX_WIDTH) < 1e-9)
})

test('Ch 8: every Crossing perk says what it gives, a perk a later one replaces too (A-31)', () => {
  const perks = crossingsView(realm()).flatMap((x) => x.perks)
  for (const p of perks) assert.ok(p.gives.length > 0, `${p.name} says nothing`)
  const tradeRoads = perks.find((p) => p.id === 'tradeRoads')
  assert.deepEqual(tradeRoads?.gives.map((g) => g.label), ['Building tiers cost −10%', 'Crossing stages cost −10%'])
  assert.deepEqual(tradeRoads?.replacedBy, { name: 'Guild Charters', stage: 3 })
  assert.equal(perks.find((p) => p.id === 'guildCharters')?.replacedBy, undefined)
})

test('D-09: each hex asks for its region’s terrain, near or far, and the heartland and ruins keep the shared tiles', () => {
  const hexes = buildMap(7)
  const at = (id: string): HexState => hexes.find((h) => h.id === id)!
  assert.equal(regionTerrainSlot(at('0,6')), 'hex.capital.dwarf') // Kaldor Deep
  assert.equal(regionTerrainSlot(at('-5,5')), 'hex.gate.archmage') // Veilgate
  assert.equal(regionTerrainSlot(at('1,-3')), 'hex.wilds.orc.near') // Ashfall, ring 3
  assert.equal(regionTerrainSlot(at('2,-5')), 'hex.wilds.orc.far') // Scorchmoor, ring 5
  assert.equal(regionTerrainSlot(at('5,0')), 'hex.lairMouth.thornwild') // Thornmaw
  assert.equal(regionTerrainSlot(at('2,-4')), 'hex.village.orc-goblin') // Raiders’ Toll
  assert.equal(regionTerrainSlot(at('-3,-3')), 'hex.battlefield.wyrmfells-orc') // Bonefield
  assert.equal(regionTerrainSlot(at('2,0')), undefined) // Elderbrook, in the heartland
  assert.equal(regionTerrainSlot({ ...at('1,-3'), ruins: true }), undefined)
  const view = mapView(realm())
  assert.equal(view.find((h) => h.id === '0,6')?.regionSlot, 'hex.capital.dwarf')
  assert.equal(view.find((h) => h.id === '0,6')?.slot, 'hex.capital')
  assert.equal(view.find((h) => h.id === '0,0')?.regionSlot, undefined)
})

test('D-09: the art checklist lists every regional terrain the map can ask for, and nothing else', () => {
  const require = createRequire(__filename)
  const { inventory } = require('../../scripts/check-assets.cjs') as { inventory: () => { id: string }[] }
  const listed = inventory()
    .map((s) => s.id)
    .filter((id) => /^hex\.[A-Za-z]+\.[a-z]/.test(id) && !id.startsWith('hex.overlay.'))
  const asked = new Set<string>()
  for (let seed = 1; seed <= 40; seed++) {
    for (const h of buildMap(seed)) {
      const slot = regionTerrainSlot(h)
      if (slot) asked.add(slot)
    }
  }
  assert.equal(listed.length, 56)
  assert.deepEqual([...asked].sort(), [...listed].sort())
})

test('Map tilt: each hex is drawn where the perspective puts it, and neighbors meet within a hundredth of a side', () => {
  const layout = hexLayout(realm().hexes)
  const board = tiltedBoard(layout.points, layout, (18 * Math.PI) / 180, 2, 0.4)
  const corners = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos(((2 * i - 1) * Math.PI) / 6), Math.sin(((2 * i - 1) * Math.PI) / 6)])
  const at = ([a, b, c, d, e, f]: number[], x: number, y: number): [number, number] => [a * x + c * y + e, b * x + d * y + f]
  let seam = 0
  for (const p of layout.points) {
    const [cx, cy] = at(board.place(p.x, p.y), 0, 0)
    const [px, py] = board.project(p.x, p.y)
    assert.ok(Math.hypot(cx - px, cy - py) < 1e-9)
    for (const q of layout.points) {
      if (p === q || Math.hypot(p.x - q.x, p.y - q.y) > HEX_WIDTH + 1e-9) continue
      for (const [dx, dy] of corners) {
        const [ox, oy] = [p.x + dx - q.x, p.y + dy - q.y]
        if (!corners.some(([kx, ky]) => Math.hypot(kx - ox, ky - oy) < 1e-9)) continue
        const [ax, ay] = at(board.place(p.x, p.y), dx, dy)
        const [bx, by] = at(board.place(q.x, q.y), ox, oy)
        seam = Math.max(seam, Math.hypot(ax - bx, ay - by))
      }
    }
  }
  assert.ok(seam < 0.01, `neighbors' corners ${seam} apart`)
  // The far (top) edge keeps its width; the near rows are wider; every hex corner is inside the box.
  const top = layout.points.filter((p) => p.y === Math.min(...layout.points.map((q) => q.y)))
  const bottom = layout.points.filter((p) => p.y === Math.max(...layout.points.map((q) => q.y)))
  const span = (row: typeof top): number => board.project(Math.max(...row.map((p) => p.x)), row[0].y)[0] - board.project(Math.min(...row.map((p) => p.x)), row[0].y)[0]
  assert.ok(span(bottom) > span(top) * 1.05)
  for (const p of layout.points) {
    for (const [dx, dy] of corners) {
      const [x, y] = board.project(p.x + dx, p.y + dy)
      assert.ok(x > board.box.minX && x < board.box.minX + board.box.width && y > board.box.minY && y < board.box.minY + board.box.height)
    }
  }
  // Untilted, the board is the plain map.
  const flat = tiltedBoard(layout.points, layout, 0, 2, 0)
  flat.place(3, 4).forEach((v, i) => assert.ok(Math.abs(v - [1, 0, 0, 1, 3, 4][i]) < 1e-9))
})

test('Map zoom: at 1 the frame shows the whole realm, and every zoom keeps its proportions', () => {
  const box = hexLayout(realm().hexes)
  assert.deepEqual(mapViewBox(wholeMap(box), box), { x: box.minX, y: box.minY, width: box.width, height: box.height })
  for (const zoom of [1.3, 2, 3.7]) {
    const shown = mapViewBox(clampMapZoom({ ...wholeMap(box), zoom }, box, 4), box)
    assert.ok(Math.abs(shown.width / shown.height - box.width / box.height) < 1e-9)
    assert.ok(Math.abs(shown.width - box.width / zoom) < 1e-9)
  }
})

test('Map zoom: the wheel keeps the map point under the pointer where it is on the frame', () => {
  const box = hexLayout(realm().hexes)
  const at = { fx: 0.3, fy: 0.6 }
  let view = wholeMap(box)
  for (const factor of [1.5, 1.2, 0.9]) {
    const before = mapViewBox(view, box)
    const next = zoomMapAt(view, factor, at, box, 4)
    const after = mapViewBox(next, box)
    assert.ok(Math.abs(before.x + at.fx * before.width - (after.x + at.fx * after.width)) < 1e-9)
    assert.ok(Math.abs(before.y + at.fy * before.height - (after.y + at.fy * after.height)) < 1e-9)
    view = next
  }
})

test('Map zoom: never below the whole realm or above the limit, and never panned past the edge', () => {
  const box = hexLayout(realm().hexes)
  const center = { fx: 0.5, fy: 0.5 }
  assert.deepEqual(zoomMapAt(wholeMap(box), 0.5, center, box, 4), wholeMap(box))
  assert.equal(zoomMapAt(wholeMap(box), 10, center, box, 4).zoom, 4)
  // Zooming in and back out by the same steps lands exactly on the whole realm.
  let view = wholeMap(box)
  for (let i = 0; i < 3; i++) view = zoomMapAt(view, 1.4, { fx: 0.2, fy: 0.8 }, box, 4)
  for (let i = 0; i < 3; i++) view = zoomMapAt(view, 1 / 1.4, { fx: 0.7, fy: 0.1 }, box, 4)
  assert.deepEqual(view, wholeMap(box))
  // A long drag stops at the realm's edge.
  const zoomed = clampMapZoom({ ...wholeMap(box), zoom: 2 }, box, 4)
  const shown = mapViewBox(panMap(zoomed, { fx: 0.5, fy: 0.5 }, { fx: 5, fy: 5 }, box, 4), box)
  assert.ok(Math.abs(shown.x - box.minX) < 1e-9 && Math.abs(shown.y - box.minY) < 1e-9)
})

test('Map zoom: a drag moves the grabbed map point with the pointer', () => {
  const box = hexLayout(realm().hexes)
  const start = clampMapZoom({ ...wholeMap(box), zoom: 3 }, box, 4)
  const from = { fx: 0.5, fy: 0.5 }
  const to = { fx: 0.6, fy: 0.45 }
  const before = mapViewBox(start, box)
  const after = mapViewBox(panMap(start, from, to, box, 4), box)
  assert.ok(Math.abs(before.x + from.fx * before.width - (after.x + to.fx * after.width)) < 1e-9)
  assert.ok(Math.abs(before.y + from.fy * before.height - (after.y + to.fy * after.height)) < 1e-9)
})

test('T15: every action the hex panel offers matches the engine, for 200 seeded hexes in mid-game states', () => {
  let checked = 0
  for (const seed of [3, 4]) {
    const state = midGame(seed)
    const today = openDayOf(state)
    const strongest = rosterDetail(state, { day: today }).sort((a, b) => b.company.power - a.company.power)[0].company.id
    const ids = shuffle(seed, today, 'test:hexes', state.hexes.map((h) => h.id)).slice(0, 100)
    for (const id of ids) {
      const panel = hexPanel(state, id, today)
      assert.ok(panel)
      const hex = state.hexes.find((h) => h.id === id)!
      for (const a of panel.actions) {
        let engine: boolean
        switch (a.kind) {
          case 'challenge':
            engine = challenge(state, id, today).ok
            break
          case 'assault':
            engine = ordersValidity(state, { date: today, assaultTarget: id, assault: [strongest], defense: [] }).assaults.some((x) => x.target === id)
            break
          case 'court':
            engine = bidCheck(state, id, suggestedBid(state, hex)).ok
            break
          case 'buy':
            engine = offerDeal(state, hex.owner as RivalId, { kind: 'buyHex', hexId: id }, today).allowed
            break
          case 'fortify':
            engine = fortifyOffer(state, id).ok
            break
          case 'reclaim':
            engine = reclaimOffer(state, id, today).ok
            break
        }
        assert.equal(a.available, engine, `${a.kind} on ${id}`)
        if (!a.available) assert.ok(a.reason?.code, `${a.kind} on ${id} says why not`)
        checked++
      }
    }
  }
  assert.ok(checked >= 200, `${checked} actions checked`)
})

test('T15 gap 2: each building’s Dominion is the sum of its sources, hex by hex', () => {
  const state = midGame(5)
  const totals = dominion(state.hexes, 'player')
  for (const b of BUILDING_IDS) {
    const sources = dominionSources(state.hexes, 'player', b)
    assert.equal(sources.reduce((s, x) => s + x.value, 0), totals[b])
  }
  const view = buildingsView(state)
  for (const b of view) assert.equal(b.dominion, totals[b.id])
})

test('Ch 7: the buildings panel shows each next tier as the engine offers it, and what it gives', () => {
  const state = withPurse(withBuildings(realm(), { merchantHall: 2 }), 50)
  const view = buildingsView(state)
  for (const b of view) {
    const offer = tierOffer(state, b.id)
    assert.equal(b.next?.ok, offer.ok)
    assert.equal(b.next?.cost, offer.cost)
    assert.equal(b.next?.refusal?.code, offer.reason?.code)
  }
  const mh = view.find((b) => b.id === 'merchantHall')!
  assert.ok(mh.gives.some((g) => g.field === 'hiredBlades'), 'Tier II hires blades')
  assert.ok(mh.next?.gives.some((g) => g.field === 'pledgeCap' && g.value === 1.5), 'Tier III raises the pledge cap ×1.5')
  assert.deepEqual(castleView(realm()).next && { tier: castleView(realm()).next?.tier, code: castleView(realm()).next?.refusal?.code }, { tier: 2, code: 'tierSum' })
  assert.equal(crossingsView(realm()).length, 6)
  assert.ok(rosterView(realm()).every((c) => c.power > 0 && c.source === 'building'))
})

test('Ch 7 / A-42: the next tier lists every requirement, met or not: Dominion, reputation, and at Tier V the rival and Milestone 6', () => {
  const ready = withPurse(withDominion(realm(), 'barracks', 8), 160)
  const barracks = buildingsView(ready).find((b) => b.id === 'barracks')!
  assert.equal(barracks.next?.ok, true)
  assert.deepEqual(barracks.next?.requirements.map((r) => [r.code, r.met]), [['dominion', true], ['reputation', true]])
  assert.equal(barracks.next?.company.name, 'Men-at-Arms')
  assert.equal(barracks.next?.company.power, 9)
  const top = buildingsView(withPurse(withBuildings(realm(), { foundry: 4 }), 5_000)).find((b) => b.id === 'foundry')!
  assert.deepEqual(top.next?.requirements.map((r) => [r.code, r.met]), [['dominion', false], ['rivalUnresolved', false], ['milestone', false], ['reputation', true]])
  assert.equal(top.next?.refusal?.code, 'dominion')
  assert.match(top.next?.refusal?.label ?? '', /Dominion 68/)
})

test('Ch 8: a Crossing’s perks say what they give, the walls-count-double perks included', () => {
  const crossings = crossingsView(withCrossings(realm(), { barracksFoundry: 2 }))
  const ironLegion = crossings.find((x) => x.id === 'barracksFoundry')!
  assert.equal(ironLegion.hybrid?.name, 'Cataphracts')
  assert.equal(ironLegion.hybrid?.power, 18)
  assert.deepEqual(ironLegion.perks.map((p) => [p.name, p.active]), [['Shieldwall', true], ['Siegebreakers', false]])
  assert.deepEqual(ironLegion.perks[0].gives.map((g) => g.label), ['Walls count double on rings 4 and 5'])
  assert.deepEqual(ironLegion.perks[1].gives.map((g) => g.label), ['Your assaults ignore fortification'])
  const shadow = effectLines(realmEffects(withCrossings(realm(), { mageTowerMerchantHall: 2 })), (r) => r.kind === 'perk')
  assert.ok(shadow.some((g) => g.label === 'Rival treasuries shown as numbers'))
})

test('T15: the map marks today’s threat, the assault target, and contested and scorched hexes with days left', () => {
  const state = midGame(6)
  const today = openDayOf(state)
  const mine = state.hexes.filter((h) => h.owner === 'player' && h.ring >= 3)
  const marked: CampaignState = {
    ...state,
    hexes: state.hexes.map((h) => (h.id === mine[0].id ? { ...h, status: 'contested', statusUntil: addDays(today, 1) } : h.id === mine[1].id ? { ...h, status: 'scorched', statusUntil: addDays(today, 2) } : h))
  }
  const map = mapView(marked, today)
  assert.equal(map.length, 127)
  assert.deepEqual([map.find((h) => h.id === mine[0].id)?.status, map.find((h) => h.id === mine[0].id)?.daysLeft], ['contested', 2])
  assert.deepEqual([map.find((h) => h.id === mine[1].id)?.status, map.find((h) => h.id === mine[1].id)?.daysLeft], ['scorched', 3])
  assert.ok(map.some((h) => h.threats?.length), 'today’s threat')
  assert.ok(map.filter((h) => h.front).length === 18, 'the 18 battlefields carry their front')
})

test('Ch 2 rule 2 / A-36: no more companies than the banners allow; read-only after the 04:00 lock; with no orders every company defends', () => {
  const state = realm()
  const today = openDayOf(state)
  const close = dayCloseInstant(today, state.campaign.timeZone).getTime()
  const view = ordersView(state, 0.8, today)
  assert.equal(view.allDefend, true)
  assert.equal(view.orders, null)
  assert.ok(view.companies.every((c) => c.pool === 'defense'))
  assert.equal(view.estimate.assaults.length, 0)
  assert.ok(view.estimate.defenses.every((d) => d.fielded.length > 0), 'every foretold battle is met by the defense')
  const before = ordersLock(state, today, new Date(close - 3_600_000))
  assert.deepEqual([before.locked, before.secondsLeft], [false, 3_600])
  // Send companies to the assault until the banners are full: the next is refused.
  let orders = withTarget(null, today, state.hexes.find((h) => h.owner === 'neutral' && h.ring === 1)!.id)
  for (const c of view.companies.slice(0, view.banners.assault)) orders = moveCompany(state, orders, today, c.id, 'assault').orders
  const extra = moveCompany(state, orders, today, view.companies[view.banners.assault].id, 'assault')
  assert.equal(extra.refused, 'tooManyCompanies')
  assert.equal(extra.orders.assault.length, view.banners.assault)
  const set = setOrders(state, orders).state
  const sent = ordersView(set, 0.8, today)
  assert.equal(sent.allDefend, false)
  assert.equal(sent.companies.filter((c) => c.pool === 'assault').length, view.banners.assault)
  assert.equal(sent.problems.length, 0)
  assert.equal(sent.assaults[0].goesOut, true)
  // After the close, the panel only reads.
  const after = ordersLock(set, today, new Date(close + 60_000))
  assert.deepEqual([after.locked, after.secondsLeft], [true, 0])
  // Tomorrow can repeat today's orders.
  assert.deepEqual(repeatYesterday(set, addDays(today, 1))?.assault, orders.assault)
  assert.equal(ordersView(set, 0.8, addDays(today, 1)).canRepeat, true)
})

test('A-36 / Ch 10: companies sent before a target is named still defend; a second assault needs Castle IV and its own target; chosen defenders stop at the banners', () => {
  // Castle IV (5 banners, two assaults) and a hybrid from each Crossing: ten companies.
  const state = withCrossings(withCastle(realm(), 4), Object.fromEntries(CODEX.crossings.map((x) => [x.id, 1])))
  const today = openDayOf(state)
  const ids = ordersView(state, 1, today).companies.map((c) => c.id)
  assert.equal(ids.length, 10)
  // No target yet: the company shows as sent, but nothing goes out and everyone defends.
  const waiting = moveCompany(state, null, today, ids[0], 'assault').orders
  const view = ordersView(setOrders(state, waiting).state, 1, today)
  assert.equal(view.companies.find((c) => c.id === ids[0])?.pool, 'assault')
  assert.deepEqual([view.allDefend, view.assaults[0].goesOut], [true, false])
  // Castle IV allows two assaults; the second takes companies only once it has a target.
  assert.equal(view.assaultsAllowed, 2)
  assert.equal(moveCompany(state, waiting, today, ids[1], 'assault', 1).refused, 'noTarget')
  const ring1 = state.hexes.filter((h) => h.owner === 'neutral' && h.ring === 1).map((h) => h.id)
  let orders = withTarget(withTarget(waiting, today, ring1[0]), today, ring1[1], 1)
  orders = moveCompany(state, orders, today, ids[1], 'assault', 1).orders
  const two = ordersValidity(setOrders(state, orders).state, orders)
  assert.deepEqual(two.assaults.map((a) => a.target), ring1.slice(0, 2))
  assert.deepEqual(two.problems, [])
  // Clearing the second target drops that assault; its company defends again.
  const cleared = withTarget(orders, today, undefined, 1)
  assert.equal(cleared.extraAssaults, undefined)
  // Chosen defenders: up to the defense's banners, never a company on an assault.
  const banners = realmEffects(state).banners.value
  let picked = marshalOrders(today)
  for (const id of ids.slice(2, 2 + banners)) picked = toggleDefender(state, picked, today, id).orders
  assert.equal(picked.defenseOverride?.length, banners)
  assert.equal(toggleDefender(state, picked, today, ids[2 + banners]).refused, 'tooManyCompanies')
  assert.equal(toggleDefender(state, orders, today, ids[0]).refused, 'onAssault')
  assert.deepEqual(ordersValidity(state, picked).problems, [])
})

test('T15: the estimate at the day’s own Valor gives the outcome the close then gives', () => {
  const ledger = ledgerWith('2026-09-10', 120)
  let state = settle(realm(7, ledger), ledger, chicago(addDays('2026-10-08', 10))).state
  const today = openDayOf(state)
  const target = state.hexes.find((h) => h.owner === 'neutral' && h.ring === 1)!
  const army = rosterDetail(state, { day: today }).map((e) => e.company.id)
  state = setOrders(state, { date: today, assaultTarget: target.id, assault: army.slice(0, 2), defense: [] }).state
  const settled = settle(state, ledger, chicago(addDays(today, 1)))
  const valor = valorOn(settled.state, today, settled.state.campaign.weekStartsOn)
  const estimate = ordersEstimate(state, state.orders.find((o) => o.date === today), today, valor)
  const assault = settled.events.find((e) => e.kind === 'assault')
  assert.ok(assault && assault.kind === 'assault')
  assert.equal(estimate.assaults[0].outcome, assault.outcome === 'revealed' ? estimate.assaults[0].outcome : assault.outcome)
})

test('Convention 8 / A-19: hired blades wear the Merchant Hall’s current company token, a slot in the art manifest', () => {
  const state = withBuildings(realm(), { merchantHall: 3 })
  const art = companyArt(state, 'hired:0', 'hired')
  assert.equal(art, companyArt(state, 'merchantHall', 'building'))
  assert.equal(art, 'company.caravanGuard.token')
  assert.ok(Object.keys(manifest).includes(art))
})

test('Convention 8: every art slot the Realm and Diplomacy views name is in the art manifest', () => {
  const slots = new Set(Object.keys(manifest))
  for (const seed of [3, 4]) {
    const state = midGame(seed)
    const named = [
      ...mapView(state).map((h) => h.slot),
      ...buildingsView(state).map((b) => b.slot),
      castleView(state).slot,
      ...rosterView(state).map((c) => c.art),
      ...rivalPanels(state).map((p) => p.portrait),
      'hex.overlay.contested',
      'hex.overlay.scorched'
    ]
    for (const slot of named) assert.ok(slots.has(slot), `${slot} is in the manifest`)
  }
})
