/**
 * Patch 4 (D-27 to D-32; R-14, P4-01 to P4-07): each march plays by its rival's rules. The rules cover
 * the whole march: every hex there the player doesn't hold, the wilds and villages included, and at
 * full strength the rival's own. A seam follows the march ruling it that day (P2-06); the heartland and
 * the lair wedges keep the common rules. What makes a march harder starts at campaign week
 * `RULES.personalities.fromWeek`; what helps the player starts at once (C-37).
 *
 * - **The Orc** (D-28): his march's garrisons are weaker; fallen forces there strike back at their
 *   first dawn; his raids favor his march; a war track against the player (−3 to +3) moves a step a
 *   day at most with the battles fought with him, and each attack of his the player beats costs him army.
 * - **The Dwarf** (D-30): he builds walls on the wilds of his march facing the player (rivals.ts);
 *   siege wear there decays slowly; his fallen forces only dig in; his raids stay in his march; a
 *   lost defense there scorches the hex and never returns it to the wilds.
 *
 * Every multiple here is read when it is needed, so nothing is rewritten. The `marchRules` day phase
 * reads the day's log once, at its close (settle once).
 */
import { CODEX } from './codex'
import { hexIndex, isClaimableKind, isLairMarch, rulingMarch, touches } from './map'
import { RULES } from './rules'
import { isWeekCloseDay } from './clock'
import { ownMark } from './respect'
import { patchRival, weekOn } from './state'
import { type CampaignState, type Emit, type GameEvent, type HexState, type ISODate, type PersonalitiesState, type RivalId, type Surge } from './types'

const P = RULES.personalities

/** What the marches' rules remember, empty in an older save. */
export function personalitiesOf(state: CampaignState): PersonalitiesState {
  return state.personalities ?? {}
}

export function withPersonalities(state: CampaignState, patch: Partial<PersonalitiesState>): CampaignState {
  return { ...state, personalities: { ...personalitiesOf(state), ...patch } }
}

/**
 * The rival whose rules govern `hex` on `day` (P4-01): the rival march it lies in, or for a seam the
 * march ruling it that day; undefined in the heartland and a lair's wedge (or a seam its lair rules).
 * Who holds the hex doesn't change it: callers decide what applies to the player's own hexes.
 */
export function marchRule(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam'>, day: ISODate): RivalId | undefined {
  const march = rulingMarch(state.campaign.seed, hex, day)
  // A resolved rival's march keeps no rules of his: it is common land.
  return march && !isLairMarch(march) && state.rivals[march].status === 'active' ? march : undefined
}

/** Whether the rules that make a march harder are in force on `day` (C-37: from week `fromWeek`). */
export function rulesHarden(state: CampaignState, day: ISODate): boolean {
  return weekOn(state, day) >= P.fromWeek
}

// ── The Orc (D-28) ───────────────────────────────────────────────────────────

/** The Orc's war track against the player: −3 to +3, positive the player's way. */
export function orcTrackOf(state: CampaignState): number {
  return personalitiesOf(state).orcTrack ?? 0
}

/** The multiple on the Orc's raids, conquest attempts and counterattacks from his track: weaker the player's way, stronger his. */
export function orcStrikeMult(state: CampaignState): number {
  return 1 - P.orc.track.strikePerStep * orcTrackOf(state)
}

/**
 * The multiple a march's rules put on `hex`'s garrison as the player's assault weighs it on `day`
 * (beside preparation and a stronghold's): the Orc's weaker garrisons, eased or hardened by his track
 * (N-04). 1 for a hex the player holds, and wherever no rival rules. A rival's own den assault reads
 * none of it (C-29).
 */
export function marchGarrisonMult(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam' | 'owner'>, day: ISODate): number {
  if (hex.owner === 'player') return 1
  const surge = surgeMult(state, hex.id, day)
  if (marchRule(state, hex, day) === 'orc') return surge * P.orc.garrisonMult * (1 - P.orc.track.garrisonPerStep * orcTrackOf(state))
  return surge
}

/** Conquest attempts the Orc plans a week: one more while his track stands at its `extraConquestAt` end (he pushes). */
export function extraConquests(state: CampaignState, rival: RivalId): number {
  // Patch 5 (D-39): or at his own mark below, −75 (one, never two).
  return rival === 'orc' && (orcTrackOf(state) <= P.orc.track.extraConquestAt || ownMark(state, 'orc', 'down')) ? RULES.respect.own.orcConquests : 0
}

// ── The Goblin's pact (D-33) ─────────────────────────────────────────────────

/** A buy-off pact with the Goblin holds on `day` (C-35): the player has agreed to leave his march alone. */
export function pactHolds(state: CampaignState, day: ISODate): boolean {
  return state.deals.some((d) => d.rival === 'goblin' && d.kind === 'buyOff' && d.madeOn <= day && (d.until === undefined || day <= d.until))
}

/** Whether a pact bars the player's hand from `hex` on `day`: a hex of the Goblin's march while a buy-off pact holds. */
export function pactBars(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam'>, day: ISODate): boolean {
  return marchRule(state, hex, day) === 'goblin' && pactHolds(state, day)
}

/**
 * How high the Dwarf walls the wilds of his march (P4-06, S-36), as his Respect has it (D-39): not at all at
 * his own mark above, +75; higher at his own mark below, −75.
 */
export function wildWallCap(state: CampaignState): number {
  if (ownMark(state, 'dwarf', 'up')) return 0
  return ownMark(state, 'dwarf', 'down') ? RULES.respect.own.dwarfWildWallMax : P.dwarf.wildWallMax
}

// ── The Goblin's greed (D-29) ───────────────────────────────────────────────

export type GreedBand = 'fair' | 'dear' | 'gouging'

/** The Goblin's greed steps: one for each hex of his march the player took by force lately. */
export function goblinGreedOf(state: CampaignState): number {
  return personalitiesOf(state).goblinGreed ?? 0
}

/** His greed's multiple on a bribe: 1 + a share a step + a share a level of his march's preparation (P4-07). Hidden: screens show its band. */
export function greedMult(state: CampaignState): number {
  const g = P.goblin.greed
  // Patch 5 (D-39): at his own mark below, −75, he gouges: his greed counts more steps.
  const steps = goblinGreedOf(state) + (ownMark(state, 'goblin', 'down') ? RULES.respect.own.goblinGreedSteps : 0)
  return 1 + g.perStep * steps + g.perLevel * (state.marches?.preparation.goblin ?? 0)
}

/** His greed as the player is told it (C-49): fair, dear or gouging. */
export function greedBand(state: CampaignState): GreedBand {
  const [dear, gouging] = P.goblin.greed.bands
  const m = greedMult(state)
  return m < dear ? 'fair' : m < gouging ? 'dear' : 'gouging'
}

/** The day's greed (D-29): a step for each hex of his march taken by force today, at most `maxRisePerWeek` a week, from week 3; a step off at a week close with none that week. */
function goblinGreedDay(input: CampaignState, today: readonly GameEvent[], day: ISODate, byId: ReadonlyMap<string, HexState>): CampaignState {
  const g = P.goblin.greed
  const week = weekOn(input, day)
  const rose = personalitiesOf(input).goblinGreedRose
  const thisWeek = rose && rose.week === week ? rose.n : 0
  let steps = goblinGreedOf(input)
  let n = thisWeek
  if (rulesHarden(input, day)) {
    for (const e of today) {
      if (e.kind !== 'hexTransfer' || e.to !== 'player' || e.how !== 'conquest') continue
      const hex = byId.get(e.hexId)
      if (!hex || marchRule(input, hex, day) !== 'goblin' || n >= g.maxRisePerWeek) continue
      n++
      steps = Math.min(g.maxSteps, steps + 1)
    }
  }
  if (isWeekCloseDay(day, input.campaign.weekStartsOn) && n === 0) steps = Math.max(0, steps - 1)
  if (steps === goblinGreedOf(input) && n === thisWeek) return input
  return withPersonalities(input, { goblinGreed: steps, goblinGreedRose: { week, n } })
}

// ── The Archmage's surges (D-31): reading them (surges.ts draws them) ─────────

/** The surge fixed for `day`, if any. */
export function surgeOn(state: CampaignState, day: ISODate): Surge | undefined {
  return (personalitiesOf(state).surges ?? []).find((s) => s.date === day)
}

/** A swell's or ebb's multiple on `hexId`'s garrison on `day` (1 with none). */
export function surgeMult(state: CampaignState, hexId: string, day: ISODate): number {
  const s = surgeOn(state, day)
  return s && s.hexId === hexId && (s.surge === 'swell' || s.surge === 'ebb') && s.mult !== undefined ? s.mult : 1
}

/** A blessing's or curse's multiple on company `id`'s power on `day` (1 with none). */
export function surgeCompanyMult(state: CampaignState, id: string, day: ISODate): number {
  const s = surgeOn(state, day)
  return s && s.companyId === id && (s.surge === 'blessing' || s.surge === 'curse') && s.mult !== undefined ? s.mult : 1
}

// ── Fallbacks by personality (D-32, N-02) ────────────────────────────────────

/** The share of a beaten garrison its fallen force adds where it falls back: the Dwarf's dig in deeper. */
export function fallbackShareOn(rule: RivalId | undefined): number {
  return rule === 'dwarf' ? P.dwarf.fallbackShare : RULES.sieges.fallback.share
}

/**
 * The chance a fallen force strikes back at a dawn of its window (D-24 as N-02 changes it), by the
 * rules of the march it lost its hex in: the Orc's always at their first dawn; the Dwarf's never; the
 * Goblin's own make an offer instead (never a strike), as do beasts in his march dig in only.
 */
export function strikeChance(rule: RivalId | undefined, holder: HexState['owner'], firstDawn: boolean): number {
  if (rule === 'orc') return firstDawn ? P.orc.firstDawnChance : RULES.sieges.counterattack.chancePerDay
  if (rule === 'dwarf' || rule === 'goblin') return 0
  return holder === 'player' ? 0 : RULES.sieges.counterattack.chancePerDay
}

/** Whether a garrison beaten in this march dissolves instead of falling back: the Archmage's (C-44). */
export function dissolves(rule: RivalId | undefined): boolean {
  return rule === 'archmage'
}

/** The rate siege wear decays a day on a hex: a stronghold's, or any hex of the Dwarf's march, slower (N-03). */
export function wearDecayOn(rule: RivalId | undefined, stronghold: boolean): number {
  if (stronghold) return RULES.sieges.wearDecay.stronghold
  return rule === 'dwarf' ? P.dwarf.wearDecay : RULES.sieges.wearDecay.perDay
}

/** Whether a defense lost on this hex may return it to the wilds (D-15): never in the Dwarf's march (N-05). */
export function wildsMayReclaim(rule: RivalId | undefined): boolean {
  return rule !== 'dwarf'
}

// ── Raids ────────────────────────────────────────────────────────────────────

/**
 * How a raid of `rival` weighs one of the player's border hexes (beside band^1.5): the Orc's three
 * times on the player's hexes in his march (from week 3); 1 otherwise. The Dwarf's raids reach only
 * the player's hexes in or beside his march (`dwarfRaidsHere`).
 */
export function raidWeight(state: CampaignState, rival: RivalId, hex: HexState, day: ISODate): number {
  if (rival === 'orc' && rulesHarden(state, day) && marchRule(state, hex, day) === 'orc') return P.orc.ownMarchWeight
  return 1
}

/** The road hexes of a rival's march: its own, for whether a raid of the Dwarf's may reach a hex. */
export function inMarchOf(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam'>, rival: RivalId, day: ISODate): boolean {
  return hex.march === rival || (hex.seam === rival && marchRule(state, hex, day) === rival)
}

// ── The Dwarf's walls (D-30) ───────────────────────────────────────────────

/**
 * The wilds of the Dwarf's march he walls from week 3 (P4-06): neutral hexes there, not mythic or a
 * Lair Mouth, touching the player's land. None for any other rival.
 */
export function wildWalls(state: CampaignState, rival: RivalId, day: ISODate): HexState[] {
  if (rival !== 'dwarf' || !rulesHarden(state, day)) return []
  const byId = hexIndex(state.hexes)
  return state.hexes.filter((h) => h.owner === 'neutral' && !h.mythic && h.kind !== 'lairMouth' && isClaimableKind(h) && inMarchOf(state, h, 'dwarf', day) && touches(byId, h.id, 'player'))
}

/**
 * The Dwarf's own way of preparing (P4-07): at a week close his march's level rose, `freeWallsPerQuietWeek`
 * free wall levels, each on the hex facing the player (his own or the wilds he walls) with the lowest
 * walls, innermost first, then map order, up to his cap.
 */
export function freeWalls(state: CampaignState, day: ISODate): CampaignState {
  let next = state
  for (let n = 0; n < P.dwarf.freeWallsPerQuietWeek; n++) {
    const byId = hexIndex(next.hexes)
    const own = next.hexes.filter((h) => h.owner === 'dwarf' && isClaimableKind(h) && touches(byId, h.id, 'player'))
    const order = new Map(next.hexes.map((h, i) => [h.id, i]))
    const wilds = wildWalls(next, 'dwarf', day).filter((h) => h.fortification < wildWallCap(next))
    const pick = [...own, ...wilds]
      .filter((h) => h.fortification < RULES.land.dwarfFortificationMax)
      .sort((a, b) => a.fortification - b.fortification || a.ring - b.ring || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0]
    if (!pick) break
    next = { ...next, hexes: next.hexes.map((h) => (h.id === pick.id ? { ...h, fortification: (h.fortification + 1) as HexState['fortification'] } : h)) }
  }
  return next
}

// ── The day's close: the Orc's track and his attrition (D-28) ────────────────

/** The log's events dated `day`, read back from its end (the log runs in day order, so a closing day's are last). */
export function eventsOn(log: readonly GameEvent[], day: ISODate): GameEvent[] {
  const out: GameEvent[] = []
  for (let i = log.length - 1; i >= 0 && log[i].day >= day; i--) if (log[i].day === day) out.push(log[i])
  return out.reverse()
}

/** Whether a day's battle event was one with the Orc, and its result for the player: +1 won, −1 lost, 0 neither. */
function orcBattle(state: CampaignState, e: GameEvent, byId: ReadonlyMap<string, HexState>): number {
  switch (e.kind) {
    case 'defense': {
      const hex = byId.get(e.hexId)
      const his = e.rival === 'orc' || (e.threat === 'counterattack' && !e.rival && hex !== undefined && marchRule(state, hex, e.day) === 'orc')
      if (!his) return 0
      return e.outcome === 'defeat' ? -1 : 1
    }
    case 'assault': {
      if (e.outcome !== 'taken' && e.outcome !== 'rout') return 0
      const hex = byId.get(e.hexId)
      return hex !== undefined && marchRule(state, hex, e.day) === 'orc' ? 1 : 0
    }
    case 'grandBattle': {
      if (e.stage !== 'fought' || e.rival !== 'orc') return 0
      return e.result === 'defeat' ? -1 : 1
    }
    default:
      return 0
  }
}

/**
 * The `marchRules` day phase (D-28): the Orc's war track moves at most one step for the day's battles
 * with him (toward the player if the player won more of them, toward him if he did), from week 3; and
 * each attack of his the player beat today costs him `attritionPerWin` of his army. Reads only events
 * dated `day`, once.
 */
export function marchRulesDay(input: CampaignState, day: ISODate, emit: Emit): CampaignState {
  let state = input
  const today = eventsOn(state.log, day)
  const byId = hexIndex(state.hexes)
  if (state.rivals.goblin.status === 'active') state = goblinGreedDay(state, today, day, byId)
  if (today.length === 0) return state
  if (state.rivals.orc.status === 'active') {
    // Attrition: each raid, conquest strike or counterattack of his garrisons the player beat today.
    const beaten = today.filter((e) => e.kind === 'defense' && e.rival === 'orc' && e.outcome !== 'defeat').length
    if (beaten > 0) state = patchRival(state, 'orc', { companies: state.rivals.orc.companies.map((c) => ({ ...c, power: c.power * (1 - P.orc.attritionPerWin) ** beaten })) })
    if (rulesHarden(state, day)) {
      const net = today.reduce((s, e) => s + orcBattle(state, e, byId), 0)
      const from = orcTrackOf(state)
      const to = Math.max(P.orc.track.min, Math.min(P.orc.track.max, from + Math.sign(net)))
      if (to !== from) {
        state = withPersonalities(state, { orcTrack: to })
        emit('orcTrack', { from, to })
      }
    }
  }
  return state
}

/** The rivals whose rules a march follows, for screens: the rival's name, never a hidden number. */
export function ruleName(rival: RivalId): string {
  return CODEX.rivals.find((r) => r.id === rival)?.shortName ?? rival
}
