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
import { settle } from '../../src/renderer/src/lib/game/settle'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { hasText, t } from '../../src/renderer/src/lib/game/text'
import { RIVAL_IDS, type CampaignState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { courtableVillages, courtshipsView, dealReaction, dealsView, moodOf, respectMarks, rivalPanel, rivalPanels } from '../../src/renderer/src/lib/game/view/diplomacy'
import { suggestedBid } from '../../src/renderer/src/lib/game/view/realm'
import { driveCampaign } from './support/campaign-driver'
import { chicago, ledgerWith } from './fixtures/ledgers'
import { realm, withCrossings, withPurse } from './support/realm'

/**
 * Every number a rival panel shows outside its public fields (Respect, the Respect marks with the
 * rules they open, and the front tracks), with its path; numbers written inside its text count too.
 */
function shownNumbers(value: unknown, path = '', out: { path: string; n: number }[] = []): { path: string; n: number }[] {
  if (path === 'respect' || /^marks\.\d+\.(at|labels)$/.test(path) || /^fronts\.\d+\.track$/.test(path)) return out
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
      // …and unrevealed, a panel shows no number at all beyond Respect, its marks and the front tracks.
      assert.deepEqual(shown, [], `day ${day}, ${r}`)
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

test('Ch 12: the Respect marks at 25, 40, 50, 60 and 75, and what each opens (the Goblin trades from 25)', () => {
  const goblin = respectMarks('goblin', 30)
  assert.deepEqual(goblin.map((m) => m.at), [25, 40, 50, 60, 75])
  assert.ok(goblin[0].opens.includes('sellsHex') && goblin[0].opens.includes('raidsWeaker'))
  assert.deepEqual(goblin.map((m) => m.reached), [true, false, false, false, false])
  const orc = respectMarks('orc', 0)
  assert.ok(orc.find((m) => m.at === 50)?.opens.includes('sellsHex'))
  assert.ok(orc.find((m) => m.at === 60)?.opens.includes('accordTalks'))
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
