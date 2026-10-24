/**
 * The Diplomacy page's "How each rival works" tab (`view/rivalGuide.ts`): one rival at a time, Respect
 * and Renown side by side. Help text from `RULES` (Convention 7), his path's figures as the building
 * cards show them, and no hidden value (Convention 6).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyPaths } from '../../src/renderer/src/lib/game/dominion'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { RIVAL_IDS, type CampaignState, type RivalId } from '../../src/renderer/src/lib/game/types'
import { buildingsView } from '../../src/renderer/src/lib/game/view/realm'
import { rivalGuide, type RivalGuide } from '../../src/renderer/src/lib/game/view/rivalGuide'
import { realm } from './support/realm'

const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

/** Every string in a guide. */
function texts(g: RivalGuide): string[] {
  return [
    ...g.measures.flatMap((l) => [l.term, l.text]),
    ...g.march.flatMap((l) => [l.term, l.text]),
    ...g.deeds.flatMap((grp) => [grp.title, ...grp.rows.flatMap((r) => [r.deed, r.respect ?? '', r.renown ?? ''])]),
    g.deedsNote,
    ...g.perks.flatMap((l) => [l.term, l.text]),
    ...g.ends.flatMap((l) => [l.term, l.text]),
    g.endsNote
  ]
}

function row(g: RivalGuide, deed: string | RegExp): { group: string; respect?: string; renown?: string } | undefined {
  for (const grp of g.deeds) {
    const r = grp.rows.find((x) => (typeof deed === 'string' ? x.deed === deed : deed.test(x.deed)))
    if (r) return { group: grp.id, ...r }
  }
  return undefined
}

/** A campaign whose player holds one depth-3 hex of `rival`'s march and has Renown on his path. */
function withPath(state: CampaignState, rival: RivalId, known: number): CampaignState {
  const hex = state.hexes.find((h) => h.march === rival && !h.seam && h.owner === 'neutral' && h.ring === RULES.map.heartlandRings + 3)
  assert.ok(hex, 'a depth-3 wild hex of the march')
  const paths = emptyPaths()
  paths.byRival[rival] = { renown: known, rank: 1 }
  return { ...state, paths, hexes: state.hexes.map((h) => (h.id === hex.id ? { ...h, owner: 'player' } : h)) }
}

test('Rival guide: every rival has each part, the deeds in at least three groups, and no text reads undefined or NaN', () => {
  const state = realm(7)
  for (const r of RIVAL_IDS) {
    const g = rivalGuide(state, r)
    assert.equal(g.measures.length, 3, r)
    assert.ok(g.march.length >= 4, r)
    assert.ok(g.deeds.length >= 3, r)
    assert.equal(g.ranks.length, RULES.dominion.rankShares.length, r)
    assert.ok(g.perks.length >= 3, r)
    assert.equal(g.ends.length, 4, r)
    for (const s of texts(g)) assert.doesNotMatch(s, /undefined|NaN|\[object/, `${r}: ${s}`)
    // The signed numbers use a real minus sign, as the courts do.
    for (const s of texts(g)) assert.doesNotMatch(s, /(^|[\s(])-\d/, `${r}: ${s}`)
  }
})

test('Respect and Renown pull apart: taking his land adds Renown and costs Respect, beating his raids adds both, for every rival', () => {
  const state = realm(7)
  for (const r of RIVAL_IDS) {
    const g = rivalGuide(state, r)
    const taken = row(g, 'A hex he holds, taken by assault or Grand Battle')
    const hexConquered = (RULES.respect.byRival[r] as Readonly<Record<string, number>>).hexConquered ?? RULES.respect.change.hexConquered
    assert.deepEqual(taken, { group: 'costly', deed: 'A hex he holds, taken by assault or Grand Battle', respect: signed(hexConquered), renown: 'its depth, +2 a wall level' }, r)
    assert.equal(row(g, /^His raid/)?.group, 'both', r)
    assert.equal(row(g, /^His raid/)?.respect, signed(RULES.respect.change.raidDefeated), r)
    assert.equal(row(g, 'Resolving him, by any way')?.renown, signed(RULES.dominion.deeds.resolved), r)
    assert.match(g.measures[2].text, new RegExp(`costs Respect \\(${signed(hexConquered)}\\)`), r)
  }
})

test('Each rival’s own deeds (D-34, P5-07) carry his own numbers from RULES', () => {
  const state = realm(7)
  const d = RULES.dominion.deeds
  const own = RULES.respect.byRival
  const orc = rivalGuide(state, 'orc')
  assert.deepEqual(row(orc, 'A Grand Battle against him lost'), { group: 'costly', deed: 'A Grand Battle against him lost', respect: signed(own.orc.grandBattleLost), renown: `+${d.battleLost}` })
  assert.equal(row(orc, /^A battle lost to him/)?.renown, `+${d.battleLost}`, 'every battle with the Orc counts, a loss too')
  assert.equal(row(orc, 'A Truce with him'), undefined, 'the Orc gives nothing for a Truce')
  const goblin = rivalGuide(state, 'goblin')
  assert.deepEqual(row(goblin, 'A bribe paid for a hex of his march'), { group: 'both', deed: 'A bribe paid for a hex of his march', respect: signed(own.goblin.bribePaid), renown: `${d.hexTakenPerDepth + d.dealTakenPerDepth} × its depth` })
  assert.equal(row(goblin, 'His bid for your village held off')?.group, 'costly')
  assert.equal(row(goblin, 'His buy-off taken')?.respect, signed(own.goblin.buyOffAccepted))
  const dwarf = rivalGuide(state, 'dwarf')
  assert.equal(row(dwarf, 'His conquest attempt beaten')?.renown, `+${d.siegeBroken}`)
  assert.equal(row(dwarf, 'A pact with him kept to its end')?.respect, signed(own.dwarf.pactKept))
  assert.equal(row(dwarf, /wall levels broken/)?.respect, `${signed(own.dwarf.wallBroken)} a level`)
  const archmage = rivalGuide(state, 'archmage')
  assert.deepEqual(row(archmage, 'His Ritual endured'), { group: 'both', deed: 'His Ritual endured', respect: signed(own.archmage.ritualEndured), renown: `+${d.ritualEndured}` })
  assert.equal(row(archmage, 'A hex bought from him')?.group, 'both', 'only the Archmage sells hexes')
  for (const r of ['orc', 'goblin', 'dwarf'] as RivalId[]) assert.equal(row(rivalGuide(state, r), 'A hex bought from him'), undefined, r)
})

test('The Orc signs no Accord and never defects; the others can be won by both', () => {
  const state = realm(7)
  const orc = rivalGuide(state, 'orc').ends
  assert.equal(orc.find((l) => l.term === 'Accord')?.text, 'He signs none.')
  assert.match(orc.find((l) => l.term === 'Defection')?.text ?? '', /^Not him/)
  for (const r of ['goblin', 'dwarf', 'archmage'] as RivalId[]) {
    const ends = rivalGuide(state, r).ends
    assert.match(ends.find((l) => l.term === 'Accord')?.text ?? '', new RegExp(`\\+${RULES.respect.thresholds.accordTalks} to open talks`), r)
    assert.match(ends.find((l) => l.term === 'Defection')?.text ?? '', /until he holds none/, r)
  }
})

test('His path’s figures are the building card’s: Renown, Holdings, rank and the next rank', () => {
  for (const r of RIVAL_IDS) {
    const state = withPath(realm(7), r, 120)
    const g = rivalGuide(state, r)
    const card = buildingsView(state).find((b) => b.path.rival === r)
    assert.ok(card, r)
    assert.deepEqual({ renown: g.path.renown, holdings: g.path.holdings, rank: g.path.rank, nextRank: g.path.nextRank }, { renown: card.path.renown, holdings: card.path.holdings, rank: card.path.rank, nextRank: card.path.nextRank }, r)
    assert.equal(g.path.dominion, card.dominion, r)
    assert.equal(g.path.renown, 120, r)
    assert.ok(g.path.holdings > 0, r)
    assert.deepEqual(
      g.ranks.map((x) => x.reached),
      g.ranks.map((x) => x.rank <= 1),
      r
    )
    assert.equal(g.building.id, card.id, r)
  }
})

test('Convention 6: the rival guide reads no hidden value: treasuries, armies, threat and the AI memory change nothing in it', () => {
  const state = realm(7)
  const hidden: CampaignState = {
    ...state,
    rivals: Object.fromEntries(
      RIVAL_IDS.map((r) => [r, { ...state.rivals[r], treasury: state.rivals[r].treasury * 7 + 1234, threat: state.rivals[r].threat + 55, specialFund: 999, companies: [], ascendancyStreak: 4 }])
    ) as unknown as CampaignState['rivals']
  }
  for (const r of RIVAL_IDS) assert.deepEqual(rivalGuide(hidden, r), rivalGuide(state, r), r)
  // Nor the terms thresholds his stance is read against (D-33): those large enough not to match a small public number.
  const shown = RIVAL_IDS.flatMap((r) => texts(rivalGuide(state, r))).join(' ')
  for (const [k, v] of Object.entries(RULES.terms.thresholds)) if (v >= 100) assert.ok(!shown.includes(v.toLocaleString('en-US')), k)
})
