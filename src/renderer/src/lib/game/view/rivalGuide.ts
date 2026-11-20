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
import { pathRank, pathTotals, rankThresholds, renown, tagOfPath } from '../dominion'
import { numeral } from '../effects'
import { marksFor, respectChange } from '../respect'
import { RULES } from '../rules'
import { RIVAL_IDS, type BuildingId, type CampaignState, type RivalId } from '../types'
import { buildingName } from './realm'
import { standingRules } from './diplomacy'
import { amount, factor } from './refusals'
import { TAG_NAMES } from './shell'

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

/** Patch 10 stage 4 (X7): his craft (anywhere), his march, and his Respect alone. */
export type DeedGroupId = 'craft' | 'march' | 'respect'

/** The deeds grouped by where they are done (X7): his craft first, then his march, then what moves his Respect alone. */
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
export function prizedHabit(rival: RivalId): string {
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
      text: `Taking his land adds Renown (${perDepth(d.hexTakenPerDepth)}) but costs Respect (${signed(conquered)}). Beating his raids adds both (Respect ${signed(respectChange(rival, 'raidDefeated', c.raidDefeated))}, Renown ${signed(d.battleWon)}). The table below shows every deed both ways.`
    }
  ]
}

/** Patch 7 (W1, D-56): how he takes the wilds of his own march, at his own pace. */
function wildsOf(rival: RivalId): GuideLine {
  const W = RULES.rivals.wildSieges
  const pace = W.pace[rival]
  const speed = pace > 1 ? `fast (${factor(pace)}× the usual pace)` : pace < 1 ? `slowly (${factor(pace)}× the usual pace)` : 'at the usual pace'
  const own = {
    orc: `; the beasts take back each hex he won from them with a ${pct(W.orcLossChance)} chance at each week close`,
    goblin: '; he courts its villages besides',
    dwarf: `, and walls each hex he takes (${W.dwarfWalls} level)`,
    archmage: `, ${factor(W.archmageEbbMult)}× as hard on a day his surge is an ebb`
  }[rival]
  const which = rival === 'orc' ? 'the one with the weakest garrison, so he spearheads toward you' : 'the one touching most of his land, so he fills his march in'
  return { term: 'His wilds', text: `From week ${RULES.personalities.fromWeek} he besieges a wild hex of his march touching his land, one at a time: ${which}. He presses ${speed}${own}. A march you leave alone fills with his land.` }
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
        wildsOf(rival),
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
        wildsOf(rival),
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
        wildsOf(rival),
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
        wildsOf(rival),
        away('His surges also grow stronger.')
      ]
    }
  }
}

interface Deed {
  deed: string
  /** A number, or words where it depends ("−3 if he held it"). */
  respect?: number | string
  /** Said after his Respect's change: "a level". */
  respectPer?: string
  renown?: string
}

/** `a` when one thing, `b` when the other: "+6 met, −2 unmet". */
const either = (a: number, whenA: string, b: number, whenB: string): string => `${signed(a)} ${whenA}, ${signed(b)} ${whenB}`

/**
 * Every deed that moves his Respect or adds Renown to his path (P5-07, D-18, D-25, D-34), his own and the common ones.
 * Patch 10 stage 4 (X7): by where they are done: his craft, anywhere, first; then his march, its battles and land; then
 * what he values and the player's word, which move his Respect alone. Deeds that are sides of one (a commission met or
 * unmet, a Grand Battle won, a pact kept or broken, a request granted or refused, his buy-off taken or refused, an oath
 * kept or broken) share a row.
 */
function deedsOf(rival: RivalId): Record<DeedGroupId, Deed[]> {
  const c = RULES.respect.change
  const d = RULES.dominion.deeds
  const own = RULES.respect.byRival
  const m = marksFor(rival)
  const conquered = respectChange(rival, 'hexConquered', c.hexConquered)
  const truce = respectChange(rival, 'truce', c.tradeOrTruce)
  const hexTaken = `${perDepth(d.hexTakenPerDepth)}, +${amount(d.perFortification)} a wall level`
  // The Goblin's deals (a bribe, a courtship, a trade) add his own deed on top of the hex's (D-34).
  const byDeal = perDepth(d.hexTakenPerDepth + (rival === 'goblin' ? d.dealTakenPerDepth : 0))
  // Patch 10 (D-80): each ruler's craft, and his own weight for an attack of his beaten (K3).
  const k = RULES.dominion.crafts
  const C = RULES.requests.commission
  const beaten = respectChange(rival, 'raidDefeated', c.raidDefeated)

  const ownCraft: Record<RivalId, Deed[]> = {
    // K3: the field.
    orc: [
      {
        deed: 'A day in his field: any battle against him or in his march, won or lost. A rest day or a day away holds the streak',
        renown: `+${k.fieldDay} on a streak’s first day, +${k.fieldDay} more each day after, up to +${k.fieldDayCap} a day`
      },
      { deed: `Every ${k.fieldWeekDays}th day of a streak in his field`, respect: own.orc.fieldWeek }
    ],
    // K4: the deal.
    goblin: [{ deed: 'A hex won by a bribe, a courtship or a trade in any other march', renown: perDepth(d.dealTakenPerDepth) }],
    // K2: stone.
    dwarf: [
      { deed: 'A wall level you raise on any hex of yours, once for each hex and level', renown: `+${amount(k.wallRaisedPerLevelBand)} × the level × the hex’s band` },
      { deed: 'A defense won that your walls turned, on any hex', renown: `+${amount(k.wallsHeld)} a wall level more` }
    ],
    // K5: the unseen.
    archmage: [
      { deed: 'A mythic beaten in a defense, on any hex', renown: `+${k.mythicBeaten} more` },
      { deed: 'A Mythic Hunt won', renown: `+${amount(k.mythicHunted)} more` }
    ]
  }
  const craft: Deed[] = [
    ...ownCraft[rival],
    // Patch 10 stage 2 (K6): the banner share.
    {
      deed: `A hex taken in battle, anywhere, by ${TAG_NAMES[tagOfPath(rival)]} companies (his building’s tag)`,
      renown: `${pct(k.bannerShare)} of its depth × the share of the strike that tag carried (× ${amount(k.massedMult)} at ${pct(k.massedAt)} or more), on top of what the hex’s own march earns`
    },
    // Stage 3 (R1): his commissions take the dares' place.
    { deed: 'His commission taken up (deeds of his craft, that week)', respect: either(C.met, 'met', C.missed, 'unmet'), renown: `${signed(C.renown)} met` }
  ]

  const grand: Deed[] =
    rival === 'orc'
      ? c.incursionWon === own.orc.grandBattleWon
        ? [{ deed: 'A Grand Battle against him won', respect: own.orc.grandBattleWon, renown: signed(d.grandBattleWon) }]
        : [
            { deed: 'His invasion beaten in a Grand Battle', respect: c.incursionWon, renown: signed(d.grandBattleWon) },
            { deed: 'Any other Grand Battle against him won', respect: own.orc.grandBattleWon, renown: signed(d.grandBattleWon) }
          ]
      : [{ deed: 'A Grand Battle against him won (his invasion beaten, or his Gate, capital or a stronghold taken)', respect: `${signed(c.incursionWon)} if it beat his invasion`, renown: signed(d.grandBattleWon) }]
  const ownMarch: Record<RivalId, Deed[]> = {
    orc: [
      { deed: 'His counterattack held', respect: beaten, renown: signed(d.counterattackHeld) },
      { deed: 'A Grand Battle against him lost', respect: own.orc.grandBattleLost }
    ],
    goblin: [
      { deed: 'A bribe paid for a hex of his march', respect: own.goblin.bribePaid, renown: `${byDeal}, +${amount(d.bargain)} more below the garrison it bought` },
      { deed: 'His bid for your village held off', respect: own.goblin.bidHeld, renown: signed(d.bribeBeaten) }
    ],
    dwarf: [
      { deed: 'Each of his wall levels broken (a walled hex of his march taken)', respect: own.dwarf.wallBroken, respectPer: 'a level', renown: `+${amount(d.wallsBroken)} a level more` },
      { deed: 'A hex of his march taken by siege', renown: `+${amount(d.siegeEndured)} for each repulse before it, up to +${amount(d.siegeEndured * d.siegeEnduredCap)}` }
    ],
    archmage: [
      { deed: 'His surge strike held', respect: own.archmage.surgeHeld, renown: signed(d.surgeWeathered) },
      { deed: 'His Ritual endured', respect: own.archmage.ritualEndured, renown: signed(d.ritualEndured) },
      { deed: 'A hex of his march taken on its ebb', renown: `+${amount(d.surgeSeized)} more` }
    ]
  }
  const march: Deed[] = [
    { deed: 'His raid or conquest attempt beaten', respect: beaten, renown: signed(d.battleWon) },
    ...grand,
    { deed: 'A battle lost to him (his raid or attack beats your defense)', respect: c.raidLost },
    { deed: 'A hex of his march taken by assault or Grand Battle', respect: `${signed(conquered)} if he held it`, renown: hexTaken },
    { deed: 'A stronghold of his march taken', renown: `${perDepth(d.strongholdPerDepth)} more` },
    { deed: 'A village of his courted away', respect: c.villageCourted, renown: byDeal },
    ...(m.sellsHex !== null ? [{ deed: 'A hex bought from him', respect: c.tradeOrTruce, renown: byDeal }] : []),
    { deed: 'A hex of yours sold to him', respect: c.hexSold },
    { deed: 'Beasts beaten on a hex of his march', renown: `${signed(d.heldAgainstBeasts)} (a mythic ${signed(d.heldAgainstMythic)})` },
    ...ownMarch[rival],
    { deed: 'Resolving him, by any way', renown: signed(d.resolved) }
  ]

  const ownRespect: Record<RivalId, Deed[]> = {
    // Stage 3 (R4): he scorns walls.
    orc: [{ deed: 'A wall level you raise on a hex of his march', respect: own.orc.wallRaised }],
    goblin: [{ deed: 'His buy-off', respect: either(own.goblin.buyOffAccepted, 'taken', own.goblin.buyOffRefused, 'refused or left to lapse') }],
    dwarf: [{ deed: 'An oath of stone with him (broken, the Book of Grudges opens)', respect: either(RULES.trade.oath.keptRespect, 'kept to its end', RULES.trade.oath.brokenRespect, 'broken') }],
    archmage: [{ deed: `A week at Realm Consistency ${pct(RULES.respect.constantWeekAt)} or more`, respect: own.archmage.constantWeek }]
  }
  const respect: Deed[] = [
    { deed: prizedHabit(rival), respect: c.prizedWeek },
    ...(truce !== 0 ? [{ deed: 'A Truce with him', respect: truce }] : []),
    // Patch 8 (D1, D2, D-64): deals that bind both sides, kept or broken.
    {
      deed: 'A pact with him kept to its end, or a Truce or pact broken by your assault (a broken pact brings War with him a while)',
      respect: `${signed(RULES.trade.pact.keptRespect)} a pact kept, ${signed(RULES.trade.truce.brokenRespect)} a Truce broken, ${signed(RULES.trade.pact.brokenRespect)} a pact broken`
    },
    { deed: 'A pact or oath with another ruler broken (word travels)', respect: RULES.trade.pact.heardRespect },
    // Patch 8 (R1, D-66): his requests.
    {
      deed: `His request: granted (an offer taken, a demand met), or his demand refused, left unanswered, or a promise to him broken (and ${rival === 'orc' ? 'War with him a while' : 'he walls the hex'})`,
      respect: either(RULES.requests.demand.granted, 'granted', RULES.requests.demand.refused, 'refused or broken')
    },
    ...ownRespect[rival]
  ]
  return { craft, march, respect }
}

const GROUPS: { id: DeedGroupId; title: string }[] = [
  { id: 'craft', title: 'His craft, anywhere' },
  { id: 'march', title: 'His march: its battles and its land' },
  { id: 'respect', title: 'What he values, and your word (his Respect only)' }
]

/** His deeds by where they are done (X7), his craft first, each group in the order the deeds are listed. */
function deedGroups(rival: RivalId): DeedGroup[] {
  const deeds = deedsOf(rival)
  return GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    rows: deeds[g.id].map((d) => ({
      deed: d.deed,
      ...(d.respect !== undefined ? { respect: typeof d.respect === 'string' ? d.respect : d.respectPer ? `${signed(d.respect)} ${d.respectPer}` : signed(d.respect) } : {}),
      ...(d.renown !== undefined ? { renown: d.renown } : {})
    }))
  }))
}

/**
 * His path's perks (Patch 2's rank perks, `RULES.dominion.rankPerks`): what `ranks` of it add together (every rank's
 * perk grows with each), and the perks a named rank adds, at that rank.
 */
function pathPerks(rival: RivalId): { every(ranks: number): string; named: { at: number; text: string }[] } {
  const rp = RULES.dominion.rankPerks
  const sg = RULES.sieges
  switch (rival) {
    case 'orc':
      return {
        every: (n) => `Your rally floor +${pct(rp.orc.rallyFloor * n)}, and Weary ${pct(rp.orc.wearyEase * n)} lighter.`,
        named: [
          { at: rp.orc.grandWearyRank, text: `A Grand Battle’s Weary lasts ${rp.orc.grandWearyDays} day less.` },
          { at: rp.orc.ironRanksRank, text: 'No company is made Weary by a repulsed assault.' }
        ]
      }
    case 'goblin':
      return {
        every: (n) => `Trust +${factor(rp.goblin.trust * n)}, and bribes and trades ${pct(rp.goblin.prices * n)} cheaper.`,
        named: [
          { at: rp.goblin.holdRank, text: `Your holds against his bids count ×${factor(rp.goblin.holdMult)}.` },
          { at: rp.goblin.slotRank, text: `${rp.goblin.slots === 1 ? 'One more courtship' : `${rp.goblin.slots} more courtships`} at a time.` }
        ]
      }
    case 'dwarf':
      return {
        every: (n) => {
          const walls = rp.dwarf.walls * n
          return `Each repulse wears ${pct(rp.dwarf.repulseWear * n)} more off a garrison, walls count ${pct(rp.dwarf.fortificationCut * n)} less against your assault, and every defense gains ${walls} ${walls === 1 ? 'wall' : 'walls'}.`
        },
        named: [
          { at: rp.dwarf.slowDecayRank, text: `Your siege wear fades ${rp.dwarf.slowDecayMult === 1 / 2 ? 'half as fast' : `×${factor(rp.dwarf.slowDecayMult)} as fast`}.` },
          { at: rp.dwarf.strongholdRank, text: `A stronghold’s garrison counts ×${factor(rp.dwarf.strongholdMult)} instead of ×${factor(sg.stronghold.garrisonMult)}.` }
        ]
      }
    case 'archmage':
      return {
        every: (n) => `Mythics and surge strikes ${pct(rp.archmage.mythicCut * n)} weaker.`,
        named: [
          { at: rp.archmage.foresightRank, text: 'Tomorrow’s surge is foretold.' },
          { at: rp.archmage.curseBlockRank, text: 'No curse lands on your companies.' },
          { at: rp.archmage.bendRank, text: 'Once a week, bend a foretold swell into an ebb (on its hex’s panel).' }
        ]
      }
  }
}

/** His path's perks for his guide: what every rank adds, then what the named ranks add, in rank order. */
function perksOf(rival: RivalId): GuideLine[] {
  const p = pathPerks(rival)
  return [{ term: 'Every rank', text: p.every(1) }, ...p.named.map((x) => ({ term: `Rank ${numeral(x.at)}`, text: x.text }))]
}

/**
 * Patch 10 stage 4 (L2): what `rival`'s path gives at `rank`, in plain words, for the card the rank raises: the perk a
 * named rank adds, then what all its ranks add together, then where the next rank lies. Public figures only.
 */
export function rankPerkLines(rival: RivalId, rank: number): string[] {
  const p = pathPerks(rival)
  const next = rankThresholds()[rank]
  return [
    ...p.named.filter((x) => x.at === rank).map((x) => `New at rank ${numeral(rank)}: ${x.text}`),
    `${rank === 1 ? 'Its first rank' : 'Its ranks together'}: ${p.every(rank)}`,
    ...(next !== undefined ? [`Rank ${numeral(rank + 1)} at Dominion ${amount(next)} on his path.`] : ['The top rank of his path.'])
  ]
}

/** The ways he can be resolved (Ch 13, D-33): conquest, his own terms, an Accord, defection. No terms threshold is told. */
function endsOf(rival: RivalId): GuideLine[] {
  const tm = RULES.terms
  const ac = RULES.contracts.accord
  const conquest: GuideLine = { term: 'Conquest', text: 'Take his Gate, then his capital, each in a Grand Battle.' }
  const fought = `once you have fought him (${pct(tm.war.marchShare)} of his march held, or a Grand Battle won for a hex of his)`
  const accord: GuideLine =
    rival === 'orc'
      ? { term: 'Accord', text: 'He signs none.' }
      : {
          term: 'Accord',
          text: `Raise his Respect to +${RULES.respect.thresholds.accordTalks} and his path to rank ${numeral(ac.pathRank)} to open talks, then keep ${ac.days}-day Accord contracts (from Castle Tier ${numeral(ac.castleTier)}) until his Respect reaches +${ac.signedAtRespect}. He becomes your ally.`
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
          text: `Once he is Shaken, in a week you push his march he tries to buy his way out (a hex, an item or hired companies, for a ${tm.goblin.pactWeeks}-week pact to leave his march alone), at most every ${tm.goblin.buyOffEveryWeeks} weeks. Refuse ${tm.goblin.surrenderAfterRefused}, or bring him to Ready to yield, and he offers to surrender ${fought}.`
        }
      case 'dwarf':
        return { term: 'His terms', text: `He surrenders, grudgingly, once you hold about ${pct(tm.dwarf.marchShare)} of his march. His villages stay restless for ${tm.dwarf.restlessWeeks} weeks after.` }
      case 'archmage':
        return { term: 'His terms', text: `He surrenders when he fears for his life: when you hold his Gate, or, ${fought}, when your army and victories frighten him enough.` }
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
    deedsNote: 'Rows add up: a Gate won in a Grand Battle counts as a Grand Battle won and as his hex taken. His craft counts on his path wherever you do it; on a seam, where two marches meet, a hex’s other deeds count half on each path. Respect from his own values and the habit he prizes posts at the week’s close; the rest when the deed is done.',
    ranks: thresholds.map((at, i) => ({ rank: i + 1, at, reached: rank > i })),
    perks: perksOf(rival),
    standing: standingRules(rival),
    ends: endsOf(rival),
    endsNote: `From week ${RULES.terms.fromWeek} his court shows his stance, Defiant to Ready to yield, and the Herald’s rumors say what he watches.`
  }
}
