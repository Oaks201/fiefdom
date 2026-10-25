/**
 * The Diplomacy page's "How each rival works" tab (2026-10-24, asked for because the courts alone left
 * how the rivals work, and how Respect and Renown differ, hard to follow): one ruler at a time, how his
 * march fights you, every deed that moves his Respect or adds Renown to his path side by side, his path's
 * perks, and the ways he can be resolved.
 *
 * Help text, not story (Convention 7): plain rules, every number from `RULES`. The live figures are the
 * public ones the courts and building cards already show (his path's Renown, Holdings and rank); no
 * hidden value reaches it (Convention 6): no benchmark, income, treasury, army, event criteria or terms
 * thresholds.
 */
import { CODEX } from '../codex'
import { pathRank, pathTotals, rankThresholds, renown } from '../dominion'
import { numeral } from '../effects'
import { marksFor, respectChange } from '../respect'
import { RULES } from '../rules'
import { RIVAL_IDS, type BuildingId, type CampaignState, type RivalId } from '../types'
import { buildingName } from './realm'
import { standingRules } from './diplomacy'
import { amount, factor } from './refusals'

const PERCENT = 100 // rules-ok: shares shown as percentages

const pct = (share: number): string => `${Math.round(share * PERCENT)}%`
const signed = (v: number): string => (v > 0 ? `+${amount(v)}` : v < 0 ? `−${amount(-v)}` : '0')
/** Renown per depth: "its depth", "1.5 × its depth". */
const perDepth = (k: number): string => (k === 1 ? 'its depth' : `${amount(k)} × its depth`)

/** A titled line: the term shown first, in bold, then what it means. */
export interface GuideLine {
  term: string
  text: string
}

/** One deed: what it does to his Respect and what it adds to his path's Renown; either may be absent. */
export interface DeedRow {
  deed: string
  respect?: string
  renown?: string
}

export type DeedGroupId = 'both' | 'costly' | 'respect' | 'renown' | 'resented'

/** The deeds grouped by what they do, so the trade-offs show: Renown that costs Respect, Respect that earns no Renown. */
export interface DeedGroup {
  id: DeedGroupId
  title: string
  rows: DeedRow[]
}

export interface PathRankLine {
  rank: number
  /** The Dominion it needs. */
  at: number
  reached: boolean
}

export interface RivalGuide {
  rival: RivalId
  /** "the Orc", for running text. */
  people: string
  building: { id: BuildingId; name: string }
  /** His path now (D-18): Renown, Holdings and the Dominion they add up to; the rank, which never falls. */
  path: { renown: number; holdings: number; dominion: number; rank: number; nextRank?: number }
  /** Respect and Renown, what each is and how they differ, with his own numbers. */
  measures: GuideLine[]
  /** How his march fights you (D-27 to D-32): his own rules and how he prepares while you are away. */
  march: GuideLine[]
  deeds: DeedGroup[]
  /** Under the deeds table: rows add up; a seam's hex deeds count half. */
  deedsNote: string
  ranks: PathRankLine[]
  /** His path's perks: what every rank adds, then what the named ranks add. */
  perks: GuideLine[]
  /** His standing's rules: his Peace and War lines and how long a standing holds (Patch 7, E1: moved here from his court). */
  standing: string
  /** The ways he can be resolved; the realm's pace for any rival is How to play's (Patch 7, E7). */
  ends: GuideLine[]
  endsNote: string
}

/** "the Orc", "the Goblin": how the guide names a rival in running text. */
function peopleOf(rival: RivalId): string {
  return `the ${CODEX.rivals.find((r) => r.id === rival)?.people ?? rival}`
}

function roadOf(rival: RivalId): BuildingId {
  return CODEX.rivals.find((r) => r.id === rival)?.road as BuildingId
}

/** ["the Orc", "the Dwarf"] → "the Orc and the Dwarf". */
const listed = (items: readonly string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** How often he raids, against the other rivals (`RULES.rivals.raidFrequency`), in words. */
function raidsHowOften(rival: RivalId): string {
  const f = RULES.rivals.raidFrequency
  const more = RIVAL_IDS.filter((r) => f[r] > f[rival]).map(peopleOf)
  const less = RIVAL_IDS.filter((r) => f[r] < f[rival]).map(peopleOf)
  if (more.length === 0) return 'He raids you the most often of the rivals.'
  if (less.length === 0) return 'He raids you the least often of the rivals.'
  return `He raids you less often than ${listed(more)}, and more often than ${listed(less)}.`
}

/** The habit he prizes (A-38), as a week of it. */
function prizedWeek(rival: RivalId): string {
  switch (CODEX.rivals.find((r) => r.id === rival)?.prizes) {
    case 'noLostBattle':
      return 'A week with no battle lost'
    case 'calorieAverage':
      return `A week within your food budget, with food logged on ${RULES.rivals.goblinPrizedFoodDays} days or more`
    case 'allDuties':
      return 'A week with every duty kept, every day'
    case 'stepPool':
      return 'A week meeting your step pool'
    default:
      return 'A week of the habit he prizes'
  }
}

/** What Respect and Renown each are, with his numbers, and how they pull apart. */
function measuresOf(rival: RivalId): GuideLine[] {
  const c = RULES.respect.change
  const d = RULES.dominion.deeds
  const conquered = respectChange(rival, 'hexConquered', c.hexConquered)
  const rising = rival === 'orc' ? `deals and, at +${RULES.terms.orc.respectBar}, Ugrak’s Challenge in place of his last Warhost (never Peace)` : 'deals, Peace and in time an Accord'
  return [
    {
      term: 'Respect',
      text: `How he regards you, from ${signed(RULES.respect.min)} to ${signed(RULES.respect.max)}; every ruler starts at ${signed(RULES.rivals.start.respect)}. It goes up and down with what he values, and it is shown on his court. Rising, it opens ${rising}; falling, it brings War.`
    },
    {
      term: 'Renown',
      text: `Your deeds in your war against him, kept for good: nothing takes Renown away. Add your Holdings (each hex of his march you hold now, worth its depth) and you have your Dominion on his path. That raises his path’s rank, and each rank adds a perk (see his path, below); all four paths together open your building tiers.`
    },
    {
      term: 'They pull apart',
      text: `Taking his land adds Renown (${perDepth(d.hexTakenPerDepth)}) but costs Respect (${signed(conquered)}). Beating his raids adds both (Respect ${signed(c.raidDefeated)}, Renown ${signed(d.battleWon)}). The table below shows every deed both ways.`
    }
  ]
}

/** How his march fights you: his own rules (D-27 to D-32), his raids and how he prepares while you are away (D-19, P4-07). */
function marchOf(rival: RivalId): GuideLine[] {
  const pm = RULES.personalities
  const sg = RULES.sieges
  const m = marksFor(rival)
  const prep = RULES.marches.preparation
  const away = (own: string): GuideLine => ({
    term: 'Left alone',
    text: `In a week you push other marches but not his, his march gains a level (up to ${prep.max}), each making his garrisons ${pct(prep.perLevel)} stronger; a week you push it (take or assault a hex there) lowers it. ${own}`
  })
  switch (rival) {
    case 'orc': {
      const tr = pm.orc.track
      return [
        { term: 'Raids', text: `${raidsHowOften(rival)} His raids are ${pm.orc.ownMarchWeight} times as likely to strike your hexes in his march as elsewhere.` },
        {
          term: 'Counterattacks',
          text: `A garrison you beat in his march strikes back at its first dawn, at ${pct(pm.orc.counterMult)} of a usual counterattack’s strength (only at the usual chance once his Respect is +${m.ownUp}). Hold it for Renown; lose it and the hex goes back.`
        },
        {
          term: 'His war track',
          text: `From ${signed(tr.min)} to ${signed(tr.max)}, on his court. A day you win more battles with him than you lose moves it a step your way; a day you lose more, his way. Each step your way his strikes are ${pct(tr.strikePerStep)} weaker and his march’s garrisons ${pct(tr.garrisonPerStep)} easier; his way, stronger and harder, and from ${signed(tr.extraConquestAt)} he plans an extra conquest attempt each week at War.`
        },
        { term: 'His deals', text: 'He never makes Peace: Tension is the best he gives. He sends no envoy, sells you no hex, and a Truce earns no Respect from him.' },
        away('He also brings his Warhost sooner.')
      ]
    }
    case 'goblin': {
      const g = pm.goblin
      return [
        { term: 'Raids', text: raidsHowOften(rival) },
        { term: 'Bribes', text: 'Any hex of his march you could assault has a bribe price on its panel: pay it and the hex is yours at once, no battle. Higher Respect and higher Trust make it cheaper.' },
        {
          term: 'Greed',
          text: `His prices are fair, dear or gouging (shown on his court). Each hex of his march you take by force makes him greedier (at most ${g.greed.maxRisePerWeek} steps a week); a week without one eases him a step.`
        },
        {
          term: 'Bids for your villages',
          text: `From week ${g.villageBid.fromWeek} he bids each week for one of your villages in his march (none once his Respect is +${m.ownUp}). Hold it with reputation, on its hex, before the week closes, or he may win it.`
        },
        { term: 'Buy-backs', text: 'A garrison you beat in his march never strikes back; it may offer to buy back the hex it lost instead.' },
        { term: 'His deals', text: `He buys your hexes at any Respect and never sells his own. Pacts open at +${m.pact}, his envoy at +${m.envoy}, Peace at +${m.peace ?? RULES.respect.max}.` },
        away('He also grows greedier.')
      ]
    }
    case 'dwarf': {
      const dw = pm.dwarf
      return [
        { term: 'Raids', text: raidsHowOften(rival) },
        { term: 'Walls', text: `He walls the wilds of his march that face you, up to ${dw.wildWallsPerWeek} levels a week. Each wall level you break costs his Respect but adds Renown.` },
        { term: 'Slow sieges', text: `Siege wear in his march fades only ${pct(dw.wearDecay)} a day (${pct(sg.wearDecay.perDay)} elsewhere).` },
        { term: 'Digging in', text: `A garrison you beat there falls back with ${pct(dw.fallbackShare)} of what you beat (${pct(sg.fallback.share)} elsewhere), and never strikes back.` },
        { term: 'Steady ground', text: 'A hex you take from his march is never lost to the wilds.' },
        { term: 'His deals', text: `War comes only at Respect ${signed(m.war)}, and Peace only at ${signed(m.peace ?? RULES.respect.max)}; a pact comes sooner, at ${signed(m.pact)}. He never sells you a hex.` },
        away('He also adds a wall.')
      ]
    }
    case 'archmage': {
      const a = pm.archmage
      return [
        { term: 'Raids', text: raidsHowOften(rival) },
        {
          term: 'Surges',
          text: `Each day one surge lands in his march: a garrison swells (×${factor(a.swell)}) or ebbs (×${factor(a.ebb)}) for the day, a mythic is summoned for ${a.summonDays} days, one of your companies is blessed or cursed (${pct(a.companyShare)} for the day), or a surge strikes one of your hexes there. The Herald tells the day’s surge.`
        },
        {
          term: 'Foresight',
          text: `Mage Tower Tier ${numeral(RULES.buildings.mageTower.foresight.tier)}, his path at rank ${numeral(RULES.dominion.rankPerks.archmage.foresightRank)}, or his Respect at +${m.ownUp} shows tomorrow’s surge too.`
        },
        { term: 'Melting garrisons', text: 'A garrison you beat in his march melts away instead of falling back (a village’s still falls back).' },
        { term: 'His deals', text: `He sells you hexes from Respect +${m.sellsHex}, but sends his envoy only at +${m.envoy} and answers a call to arms only at +${m.callToArms}.` },
        away('His surges also grow stronger.')
      ]
    }
  }
}

interface Deed {
  deed: string
  respect?: number
  /** Said after his Respect's change: "a level". */
  respectPer?: string
  renown?: string
}

/** Every deed that moves his Respect or adds Renown to his path (P5-07, D-18, D-25, D-34), his own and the common ones. */
function deedsOf(rival: RivalId): Deed[] {
  const c = RULES.respect.change
  const d = RULES.dominion.deeds
  const own = RULES.respect.byRival
  const m = marksFor(rival)
  const conquered = respectChange(rival, 'hexConquered', c.hexConquered)
  const truce = respectChange(rival, 'truce', c.tradeOrTruce)
  const hexTaken = `${perDepth(d.hexTakenPerDepth)}, +${amount(d.perFortification)} a wall level`
  // The Goblin's deals (a bribe, a courtship, a trade) add his own deed on top of the hex's (D-34).
  const byDeal = perDepth(d.hexTakenPerDepth + (rival === 'goblin' ? d.dealTakenPerDepth : 0))

  const raids: Deed[] =
    rival === 'dwarf'
      ? [
          { deed: 'His raid beaten', respect: c.raidDefeated, renown: signed(d.battleWon) },
          { deed: 'His conquest attempt beaten', respect: c.raidDefeated, renown: signed(d.siegeBroken) }
        ]
      : [{ deed: 'His raid or conquest attempt beaten', respect: c.raidDefeated, renown: signed(d.battleWon) }]
  const grand: Deed[] =
    rival === 'orc'
      ? c.incursionWon === own.orc.grandBattleWon
        ? [{ deed: 'A Grand Battle against him won', respect: own.orc.grandBattleWon, renown: signed(d.grandBattleWon) }]
        : [
            { deed: 'His invasion beaten in a Grand Battle', respect: c.incursionWon, renown: signed(d.grandBattleWon) },
            { deed: 'Any other Grand Battle against him won', respect: own.orc.grandBattleWon, renown: signed(d.grandBattleWon) }
          ]
      : [
          { deed: 'His invasion beaten in a Grand Battle', respect: c.incursionWon, renown: signed(d.grandBattleWon) },
          { deed: 'Any other Grand Battle against him won (his Gate, capital or a stronghold)', renown: signed(d.grandBattleWon) }
        ]

  const common: Deed[] = [
    ...raids,
    ...grand,
    { deed: 'A battle lost to him (his raid or attack beats your defense)', respect: c.raidLost, ...(rival === 'orc' ? { renown: signed(d.battleLost) } : {}) },
    { deed: 'A hex he holds, taken by assault or Grand Battle', respect: conquered, renown: hexTaken },
    { deed: 'A wild hex of his march taken', renown: hexTaken },
    { deed: 'A stronghold of his march taken', renown: `${perDepth(d.strongholdPerDepth)} more` },
    { deed: 'A village of his courted away', respect: c.villageCourted, renown: byDeal },
    ...(m.sellsHex !== null ? [{ deed: 'A hex bought from him', respect: c.tradeOrTruce, renown: byDeal }] : []),
    { deed: 'A hex of yours sold to him', respect: c.hexSold },
    ...(truce !== 0 ? [{ deed: 'A Truce with him', respect: truce }] : []),
    { deed: prizedWeek(rival), respect: c.prizedWeek },
    { deed: 'Beasts beaten on a hex of his march', renown: `${signed(d.heldAgainstBeasts)} (a mythic ${signed(d.heldAgainstMythic)})` },
    { deed: 'Resolving him, by any way', renown: signed(d.resolved) }
  ]

  switch (rival) {
    case 'orc':
      return [
        ...common,
        { deed: 'His counterattack held', respect: c.raidDefeated, renown: signed(d.counterattackHeld) },
        { deed: 'A Grand Battle against him lost', respect: own.orc.grandBattleLost, renown: signed(d.battleLost) },
        { deed: 'Your assault on his hex repulsed', renown: signed(d.battleLost) },
        { deed: 'A hex he took from you, taken back', renown: `+${amount(d.retaken)} more` }
      ]
    case 'goblin':
      return [
        ...common,
        { deed: 'A bribe paid for a hex of his march', respect: own.goblin.bribePaid, renown: byDeal },
        { deed: 'A bribe paid below the garrison it bought', renown: `+${amount(d.bargain)} more` },
        { deed: 'A courtship won against his bid', renown: `+${amount(d.counterBidBeaten)} more` },
        { deed: 'His bid for your village held off', respect: own.goblin.bidHeld, renown: signed(d.bribeBeaten) },
        { deed: 'His buy-off taken', respect: own.goblin.buyOffAccepted },
        { deed: 'His buy-off refused, or left to lapse', respect: own.goblin.buyOffRefused }
      ]
    case 'dwarf':
      return [
        ...common,
        { deed: 'Each of his wall levels broken (a walled hex of his march taken)', respect: own.dwarf.wallBroken, respectPer: 'a level', renown: `+${amount(d.wallsBroken)} a level more` },
        { deed: 'A hex of his march taken by siege', renown: `+${amount(d.siegeEndured)} for each repulse before it, up to +${amount(d.siegeEndured * d.siegeEnduredCap)}` },
        { deed: 'A pact with him kept to its end', respect: own.dwarf.pactKept }
      ]
    case 'archmage':
      return [
        ...common,
        { deed: 'His surge strike held', respect: own.archmage.surgeHeld, renown: signed(d.surgeWeathered) },
        { deed: 'His Ritual endured', respect: own.archmage.ritualEndured, renown: signed(d.ritualEndured) },
        { deed: `A week at Realm Consistency ${pct(RULES.respect.constantWeekAt)} or more`, respect: own.archmage.constantWeek },
        { deed: 'A hex of his march taken on its ebb', renown: `+${amount(d.surgeSeized)} more` },
        { deed: 'A summoned mythic’s hex taken', renown: `+${amount(d.summonedDefeated)} more` }
      ]
  }
}

const GROUPS: { id: DeedGroupId; title: string; holds: (d: Deed) => boolean }[] = [
  { id: 'both', title: 'Raises his Respect and adds Renown', holds: (d) => (d.respect ?? 0) > 0 && d.renown !== undefined },
  { id: 'costly', title: 'Adds Renown, costs Respect', holds: (d) => (d.respect ?? 0) < 0 && d.renown !== undefined },
  { id: 'renown', title: 'Adds Renown only', holds: (d) => d.respect === undefined && d.renown !== undefined },
  { id: 'respect', title: 'Raises his Respect only', holds: (d) => (d.respect ?? 0) > 0 && d.renown === undefined },
  { id: 'resented', title: 'Costs Respect only', holds: (d) => (d.respect ?? 0) < 0 && d.renown === undefined }
]

/** His deeds by what they do, each group in the order the deeds are listed; an empty group is left out. */
function deedGroups(rival: RivalId): DeedGroup[] {
  const deeds = deedsOf(rival)
  return GROUPS.flatMap((g) => {
    const rows = deeds.filter(g.holds).map((d) => ({
      deed: d.deed,
      ...(d.respect !== undefined ? { respect: d.respectPer ? `${signed(d.respect)} ${d.respectPer}` : signed(d.respect) } : {}),
      ...(d.renown !== undefined ? { renown: d.renown } : {})
    }))
    return rows.length > 0 ? [{ id: g.id, title: g.title, rows }] : []
  })
}

/** His path's perks (Patch 2's rank perks, `RULES.dominion.rankPerks`): what every rank adds, then the named ranks. */
function perksOf(rival: RivalId): GuideLine[] {
  const rp = RULES.dominion.rankPerks
  const sg = RULES.sieges
  switch (rival) {
    case 'orc':
      return [
        { term: 'Every rank', text: `Your rally floor +${pct(rp.orc.rallyFloor)}, and Weary ${pct(rp.orc.wearyEase)} lighter.` },
        { term: `Rank ${numeral(rp.orc.grandWearyRank)}`, text: `A Grand Battle’s Weary lasts ${rp.orc.grandWearyDays} day less.` },
        { term: `Rank ${numeral(rp.orc.ironRanksRank)}`, text: 'No company is made Weary by a repulsed assault.' }
      ]
    case 'goblin':
      return [
        { term: 'Every rank', text: `Trust +${factor(rp.goblin.trust)}, and bribes and trades ${pct(rp.goblin.prices)} cheaper.` },
        { term: `Rank ${numeral(rp.goblin.holdRank)}`, text: `Your holds against his bids count ×${factor(rp.goblin.holdMult)}.` },
        { term: `Rank ${numeral(rp.goblin.slotRank)}`, text: `${rp.goblin.slots === 1 ? 'One more courtship' : `${rp.goblin.slots} more courtships`} at a time.` }
      ]
    case 'dwarf':
      return [
        { term: 'Every rank', text: `Each repulse wears ${pct(rp.dwarf.repulseWear)} more off a garrison, walls count ${pct(rp.dwarf.fortificationCut)} less against your assault, and every defense gains ${rp.dwarf.walls} wall.` },
        { term: `Rank ${numeral(rp.dwarf.slowDecayRank)}`, text: `Your siege wear fades ${rp.dwarf.slowDecayMult === 1 / 2 ? 'half as fast' : `×${factor(rp.dwarf.slowDecayMult)} as fast`}.` },
        { term: `Rank ${numeral(rp.dwarf.strongholdRank)}`, text: `A stronghold’s garrison counts ×${factor(rp.dwarf.strongholdMult)} instead of ×${factor(sg.stronghold.garrisonMult)}.` }
      ]
    case 'archmage':
      return [
        { term: `Rank ${numeral(rp.archmage.foresightRank)}`, text: 'Tomorrow’s surge is foretold.' },
        { term: 'Every rank', text: `Mythics and surge strikes ${pct(rp.archmage.mythicCut)} weaker.` },
        { term: `Rank ${numeral(rp.archmage.curseBlockRank)}`, text: 'No curse lands on your companies.' },
        { term: `Rank ${numeral(rp.archmage.bendRank)}`, text: 'Once a week, bend a foretold swell into an ebb (on its hex’s panel).' }
      ]
  }
}

/** The ways he can be resolved (Ch 13, D-33): conquest, his own terms, an Accord, defection. No terms threshold is told. */
function endsOf(rival: RivalId): GuideLine[] {
  const tm = RULES.terms
  const ac = RULES.contracts.accord
  const conquest: GuideLine = { term: 'Conquest', text: 'Take his Gate, then his capital, each in a Grand Battle.' }
  const accord: GuideLine =
    rival === 'orc'
      ? { term: 'Accord', text: 'He signs none.' }
      : {
          term: 'Accord',
          text: `Raise his Respect to +${RULES.respect.thresholds.accordTalks} to open talks, then keep ${ac.days}-day Accord contracts (from Castle Tier ${numeral(ac.castleTier)}) until his Respect reaches +${ac.signedAtRespect}. He becomes your ally.`
        }
  const defection: GuideLine =
    rival === 'orc' ? { term: 'Defection', text: 'Not him: winning his villages never brings him down.' } : { term: 'Defection', text: 'Win his villages until he holds none, at least half of them by courting or trade.' }
  const terms: GuideLine = (() => {
    switch (rival) {
      case 'orc':
        return {
          term: 'His last battle',
          text: `He never yields. When he is ready he comes at you in one last battle: his whole army against your border, or Ugrak’s Challenge if his Respect is +${tm.orc.respectBar} or more. Win it and he is conquered; lose and he comes again later.`
        }
      case 'goblin':
        return {
          term: 'His terms',
          text: `Once he is Shaken, in a week you push his march he tries to buy his way out (a hex, an item or hired companies, for a ${tm.goblin.pactWeeks}-week pact to leave his march alone), at most every ${tm.goblin.buyOffEveryWeeks} weeks. Refuse ${tm.goblin.surrenderAfterRefused}, or bring him to Ready to yield, and he offers to surrender.`
        }
      case 'dwarf':
        return { term: 'His terms', text: `He surrenders, grudgingly, once you hold about ${pct(tm.dwarf.marchShare)} of his march. His villages stay restless for ${tm.dwarf.restlessWeeks} weeks after.` }
      case 'archmage':
        return { term: 'His terms', text: 'He surrenders when he fears for his life: when you hold his Gate, or your army and victories frighten him enough.' }
    }
  })()
  return [conquest, terms, accord, defection]
}

/** The guide to one rival, with his path's figures from `state`. */
export function rivalGuide(state: CampaignState, rival: RivalId): RivalGuide {
  const building = roadOf(rival)
  const rank = pathRank(state, rival)
  const thresholds = rankThresholds()
  const dominion = pathTotals(state)[rival]
  const known = renown(state)[rival]
  return {
    rival,
    people: peopleOf(rival),
    building: { id: building, name: buildingName(building) },
    path: { renown: known, holdings: dominion - known, dominion, rank, ...(rank < thresholds.length ? { nextRank: thresholds[rank] } : {}) },
    measures: measuresOf(rival),
    march: marchOf(rival),
    deeds: deedGroups(rival),
    deedsNote: 'Rows add up: a Gate won in a Grand Battle counts as a Grand Battle won and as his hex taken. On a seam, where two marches meet, a hex’s deeds count half on each path. Respect from his own values and the habit he prizes posts at the week’s close; the rest when the deed is done.',
    ranks: thresholds.map((at, i) => ({ rank: i + 1, at, reached: rank > i })),
    perks: perksOf(rival),
    standing: standingRules(rival),
    ends: endsOf(rival),
    endsNote: `From week ${RULES.terms.fromWeek} his court shows his stance, Defiant to Ready to yield, and the Herald’s rumors say what he watches.`
  }
}
