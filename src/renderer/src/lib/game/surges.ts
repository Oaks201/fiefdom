/**
 * Patch 4 (D-31; P4-04, X-14): the Archmage, wild magic. From week 3, each dawn one seeded surge
 * lands in his march (a seam he rules that day included), on a hex beside the player's land when there
 * is one: a garrison ×2 or ×½ for the day, a mythic summoned for a few days, one of the player's
 * companies blessed or cursed for the day, or a strike on one of the player's hexes there, fought at
 * the close. Mage Tower foresight (Tier IV, or his path at rank I) shows tomorrow's. A garrison of his
 * march beaten without a rout dissolves into the next dawn's surge, which lands beside the hex taken
 * (C-44). His Rituals stay as A-148 has them.
 *
 * Settle once: a surge is drawn once for its day (`surge:kind`, `surge:hex`, `surge:company`,
 * `surge:roll` on that day) and kept in `personalities.surges`, so a dawn redone changes nothing.
 * Installed into `COMBAT_HOOKS.dawn` when this module loads; settlement imports it.
 */
import { addDays, diffDays } from './clock'
import { COMBAT_HOOKS, earlyGraceMult } from './combat'
import { pathRank } from './dominion'
import { hexIndex, isClaimableKind, neighbors, touches, wildGarrison } from './map'
import { marchRule, personalitiesOf, rulesHarden, surgeOn, withPersonalities } from './personalities'
import { ownMark } from './respect'
import { RULES } from './rules'
import { pick, roll, weighted } from './rng'
import { awayOn, isPlayable, openDayOf, weekOn } from './state'
import { SURGE_KINDS, type CampaignState, type HexState, type ISODate, type Surge } from './types'

const A = RULES.personalities.archmage
const PERK = RULES.dominion.rankPerks.archmage

/** The surges fixed so far: today's and any foretold. */
export function surgesOf(state: CampaignState): Surge[] {
  return personalitiesOf(state).surges ?? []
}

/** Whether the realm foresees tomorrow's surge (P4-04): Mage Tower IV, or the Archmage's path at rank I or more. */
export function foreseesSurges(state: CampaignState): boolean {
  // Patch 5 (D-39): or the Archmage's own mark above, +75.
  return state.buildings.mageTower >= RULES.buildings.mageTower.foresight.tier || pathRank(state, 'archmage') >= PERK.foresightRank || ownMark(state, 'archmage', 'up')
}

/** The Archmage's path at rank III turns a curse drawn against the player into a blessing (C-36). */
export function cursesBlocked(state: CampaignState): boolean {
  return pathRank(state, 'archmage') >= PERK.curseBlockRank
}

/** The multiple his march's preparation puts on a swell and a strike (P4-07): a neglected Archmage surges harder. */
function prepared(state: CampaignState): number {
  // Patch 5 (D-39): at his own mark below, −75, his swells and strikes grow stronger.
  return (1 + A.perLevel * (state.marches?.preparation.archmage ?? 0)) * (ownMark(state, 'archmage', 'down') ? RULES.respect.own.archmageSurgeMult : 1)
}

/**
 * Draws the surge for `date` (P4-04), or null when none lands: before week 3, or with the Archmage no
 * longer active. It lands on a hex of his march the player doesn't hold beside the player's land
 * (beside a hex a garrison of his dissolved from the day before, when there is one), else anywhere in
 * his march. A blessing or curse needs a company, a strike a hex of the player's in his march and the
 * player not away; without one, it is a swell.
 */
export function drawSurge(state: CampaignState, date: ISODate): Surge | null {
  if (state.rivals.archmage.status !== 'active' || !rulesHarden(state, date)) return null
  const { seed } = state.campaign
  const byId = hexIndex(state.hexes)
  const his = state.hexes.filter((h) => h.owner !== 'player' && isClaimableKind(h) && h.kind !== 'lairMouth' && marchRule(state, h, date) === 'archmage')
  if (his.length === 0) return null
  const beside = his.filter((h) => touches(byId, h.id, 'player'))
  const melted = (personalitiesOf(state).dissolved ?? []).filter((d) => d.day === addDays(date, -1)).flatMap((d) => neighbors(d.hexId))
  const steeredTo = beside.filter((h) => melted.includes(h.id))
  const pool = steeredTo.length > 0 ? steeredTo : beside.length > 0 ? beside : his
  const steered = steeredTo.length > 0 ? { steered: true } : {}
  const target = (h: HexState): { target?: boolean } => (touches(byId, h.id, 'player') ? { target: true } : {})

  let kind = weighted(seed, date, 'surge:kind', SURGE_KINDS, SURGE_KINDS.map((k) => A.surgeWeights[k]))
  const companies = state.roster.map((c) => c.id).sort()
  const mine = state.hexes.filter((h) => h.owner === 'player' && h.ring > RULES.land.protectedThroughRing && isClaimableKind(h) && marchRule(state, h, date) === 'archmage')
  if ((kind === 'blessing' || kind === 'curse') && companies.length === 0) kind = 'swell'
  if (kind === 'strike' && (mine.length === 0 || awayOn(state, date))) kind = 'swell'
  if (kind === 'curse' && cursesBlocked(state)) kind = 'blessing'
  const spots = pool.filter((h) => h.owner === 'neutral' && !h.village && !h.mythic)
  if (kind === 'summoning' && spots.length === 0) kind = 'swell'

  switch (kind) {
    case 'blessing':
    case 'curse':
      return { date, surge: kind, companyId: pick(seed, date, 'surge:company', companies), mult: kind === 'blessing' ? 1 + A.companyShare : 1 - A.companyShare }
    case 'strike': {
      const hex = byId.get(pick(seed, date, 'surge:hex', mine.map((h) => h.id))) as HexState
      const spread = RULES.combat.strength.roll
      const resisted = 1 - PERK.mythicCut * pathRank(state, 'archmage')
      const strength = hex.strength * A.strikeShare * prepared(state) * resisted * (1 + roll(seed, date, 'surge:roll', -spread, spread)) * earlyGraceMult(weekOn(state, date))
      return { date, surge: kind, hexId: hex.id, strength }
    }
    case 'summoning': {
      const hex = byId.get(pick(seed, date, 'surge:hex', spots.map((h) => h.id))) as HexState
      return { date, surge: kind, hexId: hex.id, ...target(hex), ...steered }
    }
    case 'ebb': {
      const hex = byId.get(pick(seed, date, 'surge:hex', pool.map((h) => h.id))) as HexState
      return { date, surge: kind, hexId: hex.id, mult: A.ebb, ...target(hex), ...steered }
    }
    default: {
      const hex = byId.get(pick(seed, date, 'surge:hex', pool.map((h) => h.id))) as HexState
      return { date, surge: 'swell', hexId: hex.id, mult: A.swell * prepared(state), ...target(hex), ...steered }
    }
  }
}

/**
 * The surges at the dawn of `day` (D-31): drops those before today, returns summoned hexes whose time
 * is up to beasts, and draws today's surge (and tomorrow's with foresight) if not yet drawn. A
 * summoning makes its hex mythic as it is drawn.
 */
export function surgesAtDawn(input: CampaignState, day: ISODate): CampaignState {
  const p = personalitiesOf(input)
  if (!p.surges && !p.summoned && (input.rivals.archmage.status !== 'active' || !rulesHarden(input, day))) return input
  let state = input
  let surges = surgesOf(state).filter((s) => s.date >= day)
  let summoned = (p.summoned ?? []).filter((s) => s.until >= day)
  for (const s of p.summoned ?? []) {
    if (s.until >= day) continue
    const hex = state.hexes.find((h) => h.id === s.hexId)
    if (hex && hex.owner === 'neutral' && hex.mythic) {
      const back: HexState = { ...hex, garrison: wildGarrison(hex, false), garrisonDamage: 0 }
      delete back.mythic
      state = { ...state, hexes: state.hexes.map((h) => (h.id === hex.id ? back : h)) }
    }
  }
  for (const d of foreseesSurges(state) ? [day, addDays(day, 1)] : [day]) {
    if (surges.some((s) => s.date === d)) continue
    const s = drawSurge(state, d)
    if (!s) continue
    surges = [...surges, s]
    if (s.surge === 'summoning' && s.hexId) {
      const hex = state.hexes.find((h) => h.id === s.hexId) as HexState
      state = { ...state, hexes: state.hexes.map((h) => (h.id === hex.id ? { ...h, mythic: true, garrison: RULES.combat.strength.mythic * hex.strength, garrisonDamage: 0 } : h)) }
      summoned = [...summoned, { hexId: hex.id, until: addDays(s.date, A.summonDays - 1) }]
    }
  }
  const dissolved = (p.dissolved ?? []).filter((x) => diffDays(x.day, day) <= 1)
  const next = withPersonalities(state, { surges, summoned, dissolved })
  return JSON.stringify(next.personalities) === JSON.stringify(input.personalities) && next.hexes === input.hexes ? input : next
}

export type BendRefusal = 'campaignOver' | 'rank' | 'noSwell' | 'used'

/**
 * The Archmage's path at rank V (C-36): once a week, turn tomorrow's foretold swell into an ebb on the
 * same hex. A player action on the open day; refused without the rank, without a foretold swell, or
 * within 7 days of the last bend.
 */
export function bendSurge(state: CampaignState, today: ISODate = openDayOf(state)): { ok: boolean; reason?: BendRefusal; state: CampaignState } {
  if (!isPlayable(state)) return { ok: false, reason: 'campaignOver', state }
  if (pathRank(state, 'archmage') < PERK.bendRank) return { ok: false, reason: 'rank', state }
  const tomorrow = addDays(today, 1)
  const s = surgeOn(state, tomorrow)
  if (!s || s.surge !== 'swell' || !s.hexId) return { ok: false, reason: 'noSwell', state }
  const last = personalitiesOf(state).surgeBentOn
  if (last !== undefined && diffDays(last, tomorrow) < RULES.clock.daysPerWeek) return { ok: false, reason: 'used', state }
  const surges = surgesOf(state).map((x) => (x === s ? { ...x, surge: 'ebb' as const, mult: A.ebb, bent: true } : x))
  return { ok: true, state: withPersonalities(state, { surges, surgeBentOn: tomorrow }) }
}

let installed = false

/** Wraps combat's dawn hook with the surges. Runs once, when this module loads. */
function install(): void {
  if (installed) return
  installed = true
  const dawn = COMBAT_HOOKS.dawn
  COMBAT_HOOKS.dawn = (state, day) => {
    const next = dawn(state, day)
    return isPlayable(next) && day >= next.campaign.startDate ? surgesAtDawn(next, day) : next
  }
}

install()
