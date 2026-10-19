/**
 * T15: the Diplomacy page's view models (Ch 6, Ch 12, Convention 6): rival panels that never hold a
 * hidden number unless revealed, deals that match `makeDeal`, the Respect marks, moods and courtships.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { armyValue } from '../../src/renderer/src/lib/game/combat'
import { makeDeal, placeBid } from '../../src/renderer/src/lib/game/land'
import { benchmarkConsistency, benchmarkContractMultiplier, benchmarkIncome, holdings, rivalIncome } from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { hasText, t } from '../../src/renderer/src/lib/game/text'
import { RIVAL_IDS, type CampaignState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { courtableVillages, courtshipsView, dealReaction, dealsView, meterAt, moodOf, respectMarks, rivalPanel, rivalPanels, standingNote } from '../../src/renderer/src/lib/game/view/diplomacy'
import { suggestedBid } from '../../src/renderer/src/lib/game/view/realm'
import { driveCampaign } from './support/campaign-driver'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { realm, withCrossings, withPurse } from './support/realm'

/**
 * Every number a rival panel shows outside its public fields (Respect, the Respect marks with the
 * rules they open, the front tracks, and Patch 4's march lines: the Orc's war track, the Dwarf's walls,
 * hired companies and their dates, C-49, and the disposition note's Respect and weeks), with its path;
 * numbers written inside its text count too.
 */
function shownNumbers(value: unknown, path = '', out: { path: string; n: number }[] = []): { path: string; n: number }[] {
  if (path === 'respect' || /^marks\.\d+\.(at|labels)$/.test(path) || /^fronts\.\d+\.track$/.test(path) || /^march\.\d+\.(label|until)$/.test(path) || path === 'standingNote') return out
  if (typeof value === 'number') out.push({ path, n: value })
  else if (typeof value === 'string') for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) out.push({ path, n: Number(m[0]) })
  else if (Array.isArray(value)) value.forEach((v, i) => shownNumbers(v, `${path}.${i}`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) shownNumbers(v, path ? `${path}.${k}` : k, out)
  return out
}

test('Convention 6: across every day of a 70-week settled trace, rival panels hold no exact treasury, AV, income or benchmark unless the Spy Network applies', () => {
  const ledger = ledgerWith('2026-09-10', 540)
  let state: CampaignState = realm(13, ledger)
  let checked = 0
  for (let day = 0; day < 70 * 7; day++) {
    state = settle(state, ledger, chicago(addDays('2026-10-08', day))).state
    const today = openDayOf(state)
    const w = state.settledThrough.week
    const bench = benchmarkIncome(benchmarkConsistency(w, state.weight.grace), benchmarkContractMultiplier(w))
    for (const r of RIVAL_IDS) {
      const hidden = [holdings(state.rivals[r]), state.rivals[r].treasury, armyValue(state, r, today), rivalIncome(state, r, w), bench]
      const shown = shownNumbers(rivalPanel(state, r))
      // None of the hidden values shows, exact or rounded…
      for (const h of hidden) assert.ok(!shown.some((x) => x.n === h || x.n === Math.round(h)), `day ${day}, ${r}: ${h} leaked`)
      // …and unrevealed, a panel shows no number at all beyond Respect, its marks, the front tracks and its march lines…
      assert.deepEqual(shown, [], `day ${day}, ${r}`)
      // …and the Goblin's lines never put a number to his greed (C-49).
      if (r === 'goblin') assert.ok(rivalPanel(state, r).march.filter((m) => !m.label.includes('hired')).every((m) => !/\d/.test(m.label)), `day ${day}: his prices`)
      checked++
    }
    if (day % 70 === 69) {
      // With the Spy Network the treasury and army show as numbers, and only then.
      const spied = withCrossings(state, { mageTowerMerchantHall: 2 })
      for (const r of RIVAL_IDS) {
        const panel = rivalPanel(spied, r)
        assert.equal(panel.treasury, holdings(spied.rivals[r]))
        assert.equal(panel.army, armyValue(spied, r, openDayOf(spied)))
        assert.deepEqual(shownNumbers(panel).map((x) => x.path).sort(), ['army', 'treasury'])
      }
    }
  }
  assert.equal(checked, 70 * 7 * RIVAL_IDS.length)
  assert.ok(state.settledThrough.week >= 70, `settled through week ${state.settledThrough.week}`)
  for (const p of rivalPanels(state)) {
    assert.equal(p.treasury, undefined)
    assert.equal(p.army, undefined)
  }
})

test('Ch 6: every deal shown as available is accepted by makeDeal; every unavailable one carries the engine’s reason text id', () => {
  let shownAvailable = 0
  let shownRefused = 0
  for (const seed of [21, 22]) {
    const base = driveCampaign({ seed, weeks: 14, habits: 'steady', policy: 'greedy' }).state
    for (const respect of [10, 30, 55, 70]) {
      const state = withPurse({ ...base, rivals: Object.fromEntries(RIVAL_IDS.map((r) => [r, { ...base.rivals[r], respect }])) as CampaignState['rivals'] }, 2_000)
      const today = openDayOf(state)
      for (const r of RIVAL_IDS) {
        for (const line of dealsView(state, r, today)) {
          const request = { kind: line.kind, ...(line.hexId ? { hexId: line.hexId } : {}), ...(line.target ? { target: line.target } : {}) } as Parameters<typeof makeDeal>[2]
          if (line.available) {
            assert.ok(makeDeal(state, r, request, today).ok, `${r} ${line.kind} ${line.hexId ?? line.target ?? ''}`)
            shownAvailable++
          } else {
            assert.ok(line.reason)
            assert.equal(line.reason.textId, `herald.deal.refused.${line.reason.code}`)
            assert.ok(hasText(line.reason.textId))
            assert.equal(makeDeal(state, r, request, today).ok, false)
            shownRefused++
          }
        }
      }
    }
  }
  assert.ok(shownAvailable > 0 && shownRefused > 0, `${shownAvailable} available, ${shownRefused} refused`)
})

test('Ch 17: a deal struck gets the rival’s one-line reaction, its placeholders filled with the deal and its price', () => {
  const line = dealReaction('goblin', { kind: 'buyHex', price: 135, hexId: '1,-3' })
  assert.equal(line.textId, 'rivals.goblin.dealStruck')
  assert.doesNotMatch(line.text, /\{/)
  assert.match(line.text, /135/)
})

test('D-39, D-48: the Respect marks on both sides, each rival his own at his own numbers (the Goblin’s hex trades need no Respect, C-43; the Orc signs no Accord, never makes peace, sends no envoy and sells no hex)', () => {
  const goblin = respectMarks('goblin', 30)
  assert.deepEqual(goblin.map((m) => m.at), [-60, -50, -25, 25, 30, 35, 40, 55, 60, 75, 100])
  assert.ok(goblin.find((m) => m.at === 25)?.opens.includes('raidsWeaker'))
  assert.ok(goblin.find((m) => m.at === 30)?.opens.includes('pact'), 'his pacts come cheap and early')
  assert.ok(goblin.find((m) => m.at === 35)?.opens.includes('envoy'))
  assert.ok(goblin.find((m) => m.at === 55)?.opens.includes('accordTalks'), 'Accord talks open at 55 (D-43), shared by every rival (C-82)')
  assert.deepEqual(goblin.find((m) => m.at === 60)?.opens, ['callToArms', 'own.goblin.up'])
  assert.ok(!goblin.some((m) => m.opens.includes('sellsHex') || m.opens.includes('buysHex')), 'his hexes are bribed, and he buys at any Respect')
  assert.deepEqual(goblin.map((m) => m.reached), [false, false, false, true, true, false, false, false, false, false, false])
  assert.deepEqual(respectMarks('goblin', -60).filter((m) => m.reached).map((m) => m.at), [-60, -50, -25], 'below 0 a mark is reached at or under it')
  assert.ok(goblin.find((m) => m.at === -60)?.opens.includes('own.goblin.down'))
  assert.ok(goblin.find((m) => m.at === 40)?.opens.includes('peace'))
  const orc = respectMarks('orc', 0)
  assert.deepEqual(orc.map((m) => m.at), [-60, -40, -15, 25, 45, 50, 75])
  assert.ok(orc.find((m) => m.at === 50)?.opens.includes('challenge'))
  assert.ok(orc.find((m) => m.at === 45)?.opens.includes('callToArms'), 'he fights beside you early')
  assert.ok(!orc.some((m) => ['peace', 'accordTalks', 'accordSigned', 'envoy', 'sellsHex'].some((k) => m.opens.includes(k))))
  assert.deepEqual(respectMarks('dwarf', 0).find((m) => m.at === 60)?.opens, ['peace', 'callToArms'])
  assert.ok(!respectMarks('dwarf', 0).some((m) => m.opens.includes('sellsHex')), 'he never sells his people')
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) for (const m of respectMarks(r, 0)) for (const l of m.labels) assert.doesNotMatch(l, /undefined|NaN/)
})

test('the Respect meter spaces its marks evenly, with 0 and both ends as stops, and puts a value in line between two', () => {
  const marks = respectMarks('goblin', 0)
  const near = (a: number, b: number, what: string): void => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`)
  // −100 −60 −50 −25 0 25 30 35 40 55 60 75 100: twelve even steps, so 30, 35 and 40 sit as far apart as −60 and −50.
  const steps = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]
  marks.forEach((m, i) => near(meterAt(marks, m.at), steps[i] / 12, `mark ${m.at}`))
  near(meterAt(marks, 0), 4 / 12, 'zero')
  near(meterAt(marks, 27), (5 + 2 / 5) / 12, '27, just past 25')
  near(meterAt(marks, -100), 0, 'the low end')
  near(meterAt(marks, 100), 1, 'the high end')
  near(meterAt(marks, 140), 1, 'held to the high end')
  // −100 −60 −40 −15 0 25 45 50 75 100: the Orc has fewer marks, so his steps are wider.
  const orc = respectMarks('orc', 0)
  near(meterAt(orc, 60), (7 + 10 / 25) / 9, 'the Orc at 60, between his 50 and 75')
})

test('Ch 17: the portrait’s mood follows disposition: calm at Peace, angry at War, humbled when resolved', () => {
  const state = realm()
  const at = (d: 'peace' | 'tension' | 'war', r: RivalId = 'orc'): CampaignState => ({ ...state, rivals: { ...state.rivals, [r]: { ...state.rivals[r], disposition: { ...state.rivals[r].disposition, player: d } } } })
  assert.equal(moodOf(at('peace'), 'orc'), 'calm')
  assert.equal(moodOf(at('war'), 'orc'), 'angry')
  const resolved = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'conquered' as const } } }
  assert.equal(moodOf(resolved, 'orc'), 'humbled')
  const panel = rivalPanel(at('war'), 'orc')
  assert.equal(panel.portrait, 'rival.orc.angry')
  assert.equal(panel.greeting.textId, 'rivals.orc.warning')
  assert.equal(rivalPanel(resolved, 'orc').greeting.textId, 'rivals.orc.fall')
  assert.equal(rivalPanel(resolved, 'orc').greeting.text, t('rivals.orc.fall', { how: 'conquest' }))
  assert.equal(rivalPanel(at('peace'), 'orc').greeting.textId, 'rivals.orc.greeting')
  assert.doesNotMatch(rivalPanel(at('peace'), 'orc').greeting.text, /\{/, 'every placeholder filled')
  assert.equal(panel.name, 'Ugrak')
})

test('Ch 6: the courtships list: open bids with their Offer at today’s Trust and the slots used; results from the log', () => {
  const state = withPurse(realm(), 500)
  const village = state.hexes.find((h) => h.village && h.owner === 'neutral' && h.ring === 1) ?? state.hexes.find((h) => h.village && h.owner === 'neutral' && h.ring === 2)!
  const near = { ...state, hexes: state.hexes.map((h) => (h.ring === 1 && h.kind === 'between' ? { ...h, owner: 'player' as const } : h)) }
  const target = near.hexes.find((h) => h.village && h.owner === 'neutral' && h.ring === 2 && near.hexes.some((x) => x.owner === 'player' && x.ring === 1)) ?? village
  const bid = suggestedBid(near, target)
  const placed = placeBid(near, target.id, bid)
  assert.ok(placed.ok, JSON.stringify(placed.reason))
  const view = courtshipsView(placed.state)
  assert.equal(view.open, 1)
  assert.equal(view.slots, 2)
  assert.equal(view.bids[0].bid, bid)
  assert.equal(view.bids[0].offer, Math.round(bid * view.trust * 10) / 10)
  const logged = { ...placed.state, log: [...placed.state.log, { id: 'ev-x', day: '2026-10-11', kind: 'courtship', hexId: target.id, outcome: 'held', bid, loyaltyDrop: 3 } as CampaignState['log'][number]] }
  assert.deepEqual(courtshipsView(logged).results.map((r) => [r.outcome, r.loyaltyDrop]), [['held', 3]])
  // Every village on offer can be bid on exactly when the engine says so, at the bid that meets it.
  for (const v of courtableVillages(near)) {
    assert.equal(v.available, placeBid(near, v.hexId, v.suggested).ok, v.hexId)
    assert.ok(v.suggested * view.trust >= v.resistance)
  }
  const again = courtableVillages(placed.state).find((v) => v.hexId === target.id)
  assert.deepEqual([again?.available, again?.reason?.code], [false, 'alreadyCourting'])
})

test('D-40, C-65: each court says what its standing means, the marks that change it and what moves his Respect; a resolved rival says nothing', () => {
  const state = realm()
  const at = (d: 'peace' | 'tension' | 'war', r: RivalId = 'orc'): CampaignState => ({ ...state, rivals: { ...state.rivals, [r]: { ...state.rivals[r], disposition: { ...state.rivals[r].disposition, player: d } } } })
  assert.match(standingNote(at('tension'), 'orc'), /^Tension: he raids your border but sends no conquest attempts\./)
  assert.match(standingNote(at('tension'), 'orc'), /He never makes peace/)
  // D-48: his own lines, Peace at +60 and War at −40 for the Dwarf.
  assert.match(standingNote(at('tension', 'dwarf'), 'dwarf'), new RegExp(`Peace comes at Respect \\+${RULES.respect.marks.dwarf.peace}; War at −${-RULES.respect.marks.dwarf.war}`))
  assert.match(standingNote(at('tension', 'dwarf'), 'dwarf'), /a pact kept to its end \(\+5\)/)
  assert.match(standingNote(at('war'), 'orc'), /^War: he sends conquest attempts/)
  assert.match(standingNote(at('peace', 'goblin'), 'goblin'), /^Peace: no raids/)
  assert.equal(rivalPanel(at('war'), 'orc').standingNote, standingNote(at('war'), 'orc'))
  assert.equal(standingNote({ ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'conquered' } } }, 'orc'), '')
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as RivalId[]) assert.doesNotMatch(standingNote(state, r), /undefined|NaN/)
})
