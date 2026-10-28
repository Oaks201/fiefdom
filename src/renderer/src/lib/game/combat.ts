/**
 * Daily combat (Ch 10) and the daily assault (Ch 6 "Conquest"), A-26 to A-28, A-36, E-02.
 *
 * Every day one threat strikes one of the player's border hexes, any conquest attempt announced
 * the day before arrives, and the player's assault goes out if one was ordered. All of it
 * resolves at day close in Ch 10's order:
 *
 *   1. conquest attempts (contested hexes first) and the daily threat, in the order announced,
 *      with the defense pool;
 *   2. the assault (or assaults), with the assault pool;
 *   3. contested hexes that fell pass to their attacker, captured hexes to the player;
 *   4. spoils, tribute and Respect are posted.
 *
 * The threat *schedule* (each day's type and raider) is drawn at the week close before it
 * (`scheduleThreats`, from the `resetAndSchedule` week phase). Each day's *tiding* (its target
 * and ±15% roll) is fixed at that day's dawn, on the border as it stands then (`dawn`, run by
 * settlement after the day before closes), and for foretold days a little earlier. Once fixed,
 * a tiding is what strikes, so the Herald never announces one thing and settles another.
 *
 * Interfaces for later tasks:
 * - T10 announces conquest attempts with `planConquest` and may weigh raiders through
 *   `COMBAT_HOOKS.raiderWeight`. `defenseFor` gives the player's expected defense on a hex.
 *   `armyValue` counts the Goblin's mercenaries; rivals.ts wraps `COMBAT_HOOKS.threatMix` (the
 *   Long Night) and `COMBAT_HOOKS.bandsHidden` (the Veil of Fog).
 * - T11 receives the Gate, capital and Lair Mouth assaults the player ordered, and the 8% rare
 *   creatures revealed on West and East beast dens, as `GrandBattleRequest`s; the combat phase
 *   announces them at once (grand.ts).
 * - T13 changes the threat mix, threat strength and the Herald's view through `COMBAT_HOOKS`.
 * - Screens read `tidings` and `ordersValidity`, which never show a hidden number.
 *
 * Pure: every function returns a new state, and randomness goes through `rng.ts` on the
 * threat's own date with the labels `threat:type`, `threat:raider`, `threat:target`,
 * `threat:roll` and `conquest:<rival>:roll`.
 */
import { grantTrophy, heldItems, nextTrophy } from './armory'
import { CODEX, type Matchup, type MatchupId } from './codex'
import { addDays, campaignWeek, diffDays, weekCloseDay, weekdayOf, weekOf } from './clock'
import { balance, post, roundPosting, spend, tribute as payTribute, withBonus } from './economy'
import { mythicMultFor, realmEffects, wallsFor } from './effects'
import { blocksConquest, blocksRaids, fortificationValue, raidRateMult, sellPrice } from './land'
import { bandOf, borderHexesOf, claimableBy, depthOf, hexDistance, hexIndex, isClaimableKind, isStronghold, nearestTo, neighbors, strongholdBarring, touches, wildBase, wildGarrison } from './map'
import { RULES, base, type DeepReadonly } from './rules'
import { chance, pick, roll, weighted } from './rng'
import { refreshRoster, roster } from './roster'
import { pathRank } from './dominion'
import { dissolves, fallbackShareOn, pactBars, personalitiesOf, surgeOn, withPersonalities, inMarchOf, marchRule, orcStrikeMult, raidWeight, rulesHarden, strikeChance, wearDecayOn, wildsMayReclaim } from './personalities'
import { decayedWear, fortificationShare, fallbackOn, fallbackStrengthOn, flankingMult, garrisonMult, siegeStands, standingSiegeOf, wearCap, withStandingSiege } from './sieges'
import { envoyFee, marksFor, ownMark, raidRespectMult, respectChange } from './respect'
import { adjustRespect, awayOn, heldHex, inCoalition, isPlayable, openDayOf, toPlayer, toRival, toWilds, withWorld, worldOf } from './state'
import { strikeMult } from './reach'
import {
  RIVAL_IDS,
  type CampaignState,
  type CombatState,
  type Company,
  type ConquestAttempt,
  type ContestedHex,
  type Counterattack,
  type DailyOrders,
  type DailyThreatKind,
  type Effect,
  type Effects,
  type Emit,
  type Fallback,
  type Foe,
  type GameEventMap,
  type HexKind,
  type HexState,
  type ISODate,
  type Land,
  type MarchId,
  type Owner,
  type RivalId,
  type ScheduledThreat,
  type Skirmish,
  type SkirmishDay,
  type Tag,
  type ThreatKind,
  type Tiding,
  type WeekStartsOn,
  type WorldOffer
} from './types'

const DAILY_KINDS: readonly DailyThreatKind[] = ['beasts', 'mythic', 'raid']
/** Hexes the daily assault never takes: they need a Grand Battle (Ch 3 rules 4 and 5, A-16). */
const GRAND_BATTLE_KINDS: ReadonlySet<HexKind> = new Set<HexKind>(['gate', 'capital', 'lairMouth'])
/** The between-lands the lairs open onto: mythics come from these sides (A-27). */
const LAIR_LANDS: ReadonlySet<Land> = new Set(CODEX.lairs.map((l) => l.land as Land))
/** Patch 5 (C-62): a rival's attacks whose outcome moves his Respect: his raids, conquest attempts and his garrisons' counterattacks. */
const RESPECTED_ATTACKS: ReadonlySet<ThreatKind> = new Set<ThreatKind>(['raid', 'conquest', 'counterattack'])

// ── Extension points for world modifiers (T10, T13) ──────────────────────────

export type ThreatMix = Record<DailyThreatKind, number>

/** What a threat's strength hook sees. */
export interface ThreatStrengthInput {
  kind: ThreatKind
  date: ISODate
  ring: number
  rival?: RivalId
  /** The lair side a mythic comes from, when its target lies on one. */
  side?: Land
  /** The seeded roll, −0.15 to +0.15. */
  roll: number
  /** The campaign week of `date`. */
  week: number
  /** The day's daily threat (the siege day applies), not a conquest attempt. */
  daily: boolean
  /** D-15, D-17: the target hex's strength (`wildBase`): every threat strikes at it; base(ring) only stands in without one. */
  wild?: number
}

/**
 * Named hooks for systems that change combat from outside: Beast Surge, the Long Night and Veil
 * of Fog (T13 events and T10's Rituals), and how T10 weighs raiders. Each default changes
 * nothing. Replace an entry; never reorder or remove one. Hooks must be pure.
 */
export interface CombatHooks {
  /** The day's threat mix before the type is drawn (A-26 keeps it 40 / 20 / 40). */
  threatMix(state: CampaignState, date: ISODate, mix: ThreatMix): ThreatMix
  /** A threat's strength after every rule in this module. */
  threatStrength(state: CampaignState, threat: ThreatStrengthInput, strength: number): number
  /** A rival's raider weight after A-26's multipliers. */
  raiderWeight(state: CampaignState, rival: RivalId, date: ISODate, weight: number): number
  /** Whether the Herald's tidings for a day are hidden (Veil of Fog). */
  tidingsHidden(state: CampaignState, date: ISODate): boolean
  /** Whether a day's tidings show no strength band or strength (the Archmage's Veil of Fog, T10). */
  bandsHidden(state: CampaignState, date: ISODate): boolean
  /** How far from its land a rival's conquest attempt may reach: 1 (touching), 2 under the Deep Call (T12). */
  conquestReach(state: CampaignState, rival: RivalId, date: ISODate): number
  /** What else a dawn fixes once its tidings are (Patch 4: the Archmage's surges, surges.ts). Must settle once. */
  dawn(state: CampaignState, day: ISODate): CampaignState
}

export const COMBAT_HOOKS: CombatHooks = {
  threatMix: (_state, _date, mix) => mix,
  threatStrength: (_state, _threat, strength) => strength,
  raiderWeight: (_state, _rival, _date, weight) => weight,
  tidingsHidden: () => false,
  bandsHidden: () => false,
  conquestReach: () => 1,
  dawn: (state) => state
}

// ── Reading the state ────────────────────────────────────────────────────────

/** The combat slice, empty until the first threat is scheduled. */
export function combatOf(state: CampaignState): CombatState {
  return state.combat ?? { schedule: [], tidings: [], conquests: [], contested: [] }
}

function withCombat(state: CampaignState, combat: CombatState): CampaignState {
  return { ...state, combat }
}

function weekNumber(state: CampaignState, date: ISODate, weekStartsOn: WeekStartsOn = state.campaign.weekStartsOn): number {
  return campaignWeek(state.campaign.startDate, date, weekStartsOn)
}

/** The power the rival's companies add up to, before any hired help (Ch 12): what its army purchases are priced on. */
export function baseArmyValue(state: CampaignState, rival: RivalId): number {
  return state.rivals[rival].companies.reduce((sum, c) => sum + c.power, 0)
}

/**
 * The rival's Army value on `date` (Ch 12): its companies' power, +15% while the Goblin's
 * mercenaries serve it (T10). `date` defaults to the open day.
 */
export function armyValue(state: CampaignState, rival: RivalId, date: ISODate = openDayOf(state)): number {
  const until = state.rivals[rival].ai?.mercenariesUntil
  const hired = until !== undefined && date <= until ? RULES.rivals.special.goblinMercenaries.armyBonus : 0
  return baseArmyValue(state, rival) * (1 + hired)
}

/** Whether `rival` may raid on `date` (Ch 10, A-26): active, in Tension or War, and no Truce or Accord. */
export function canRaid(state: CampaignState, rival: RivalId, date: ISODate): boolean {
  const r = state.rivals[rival]
  return r.status === 'active' && r.disposition.player !== 'peace' && !blocksRaids(state, rival, date)
}

/** Whether `rival` may strike a conquest attempt on `date` (Ch 10, Ch 12): active, at War, and no Truce, pact or Accord. */
export function canConquer(state: CampaignState, rival: RivalId, date: ISODate): boolean {
  const r = state.rivals[rival]
  return r.status === 'active' && r.disposition.player === 'war' && !blocksConquest(state, rival, date)
}

export function lairSide(hex: HexState): Land | undefined {
  return hex.land && LAIR_LANDS.has(hex.land) ? hex.land : undefined
}

// ── The weekly schedule (A-26, A-28) ─────────────────────────────────────────

/**
 * Raider weights on `date` (A-26), for every rival that may raid: its raid frequency ×
 * (1 + the player's border hexes it touches) × 0.5 at war with another rival × 1.25 in a
 * coalition (× 0.5 under a non-aggression pact: raids at half rate).
 */
export function raiderWeights(state: CampaignState, date: ISODate): { rival: RivalId; weight: number }[] {
  const byId = hexIndex(state.hexes)
  const border = borderHexesOf(state.hexes, 'player')
  const out: { rival: RivalId; weight: number }[] = []
  for (const rival of RIVAL_IDS) {
    if (!canRaid(state, rival, date)) continue
    const touching = border.filter((h) => touches(byId, h.id, rival)).length
    let weight = RULES.rivals.raidFrequency[rival] * (1 + touching)
    if (Object.values(state.fronts).some((f) => f.rivals.includes(rival) && f.state === 'war')) weight *= RULES.rivals.raiderWeight.atWarWithRival
    if (inCoalition(state, rival, date)) weight *= RULES.rivals.raiderWeight.inCoalition
    weight *= raidRateMult(state, rival, date)
    weight = COMBAT_HOOKS.raiderWeight(state, rival, date, weight)
    if (weight > 0) out.push({ rival, weight })
  }
  return out
}

/** One day's threat type and raider (A-26). With no rival able to raid, a raid day brings beasts. */
export function drawThreat(state: CampaignState, date: ISODate): ScheduledThreat {
  const { seed } = state.campaign
  const mix = COMBAT_HOOKS.threatMix(state, date, { ...RULES.combat.threatMix })
  const kind = weighted(seed, date, 'threat:type', DAILY_KINDS, DAILY_KINDS.map((k) => mix[k]))
  if (kind !== 'raid') return { date, kind }
  const raiders = raiderWeights(state, date)
  if (raiders.length === 0) return { date, kind: 'beasts' }
  const rival = weighted(
    seed,
    date,
    'threat:raider',
    raiders.map((r) => r.rival),
    raiders.map((r) => r.weight)
  )
  return { date, kind, rival }
}

/** Draws the threat type and raider for every day from `from` through `to` not yet scheduled. */
export function scheduleThreats(state: CampaignState, from: ISODate, to: ISODate): CampaignState {
  const combat = combatOf(state)
  const have = new Set(combat.schedule.map((s) => s.date))
  const fresh: ScheduledThreat[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (date >= state.campaign.startDate && !have.has(date)) fresh.push(drawThreat(state, date))
  }
  if (fresh.length === 0) return state
  return withCombat(state, { ...combat, schedule: [...combat.schedule, ...fresh].sort(byDate) })
}

function byDate<T extends { date: ISODate }>(a: T, b: T): number {
  return a.date.localeCompare(b.date)
}

// ── Threat strength (Ch 10) ──────────────────────────────────────────────────

/** Weeks 1 and 2 strike at 70%, weeks 3 and 4 at 85%, then in full (Ch 10 "The early grace"). */
export function earlyGraceMult(week: number): number {
  return RULES.combat.earlyGrace.find((g) => week <= g.throughWeek)?.mult ?? 1
}

/** Saturday is the siege day: its daily threat strikes at +40%. */
export function isSiegeDay(date: ISODate): boolean {
  return weekdayOf(date) === RULES.combat.siegeDay.weekday
}

/** A raid's multipliers: Respect at the rival's own marks (×0.9 or ×1.1, D-39, D-48), the Spy Network, Emboldened (+15%) and Humbled (−15%). */
function raidMult(state: CampaignState, effects: Effects, rival: RivalId, date: ISODate): number {
  const r = state.rivals[rival]
  const fronts = RULES.rivals.fronts
  let mult = effects.raidStrength.value
  mult *= raidRespectMult(rival, r.respect)
  const tracks = Object.values(r.frontTracks)
  if (tracks.some((t) => t >= fronts.track.max)) mult *= 1 + fronts.emboldenedRaid
  if (tracks.some((t) => t <= fronts.track.min) || (r.humbledUntil !== undefined && r.humbledUntil >= date)) mult *= 1 - fronts.humbledRaid
  return mult
}

/**
 * A threat's strength (Ch 10 "Threat strength"): beasts 0.9 × base; mythics 1.15 × base ×
 * the mythic multiplier for their side; a raid max(0.8 × base, 0.25 × AV × temper) with its
 * multipliers; a conquest attempt max(1.0 × base, 0.5 × AV). Then the roll, the early grace and,
 * for a Saturday's daily threat, the siege day. Every threat takes its target's strength for base
 * (D-15, D-17), so a hex is as hard to hold on a good day as it was to take.
 */
export function threatStrength(state: CampaignState, effects: Effects, t: ThreatStrengthInput): number {
  const b = t.wild ?? base(t.ring)
  const s = RULES.combat.strength
  let value: number
  switch (t.kind) {
    case 'beasts':
      value = s.beasts * b
      break
    case 'mythic':
      value = s.mythic * b * mythicMultFor(effects, t.side)
      break
    case 'raid': {
      const rival = needRival(t)
      value = Math.max(s.raidBase * b, s.raidArmy * armyValue(state, rival, t.date) * RULES.combat.temper[rival]) * raidMult(state, effects, rival, t.date) * trackMult(state, rival)
      break
    }
    case 'conquest':
      value = Math.max(s.conquestBase * b, s.conquestArmy * armyValue(state, needRival(t), t.date)) * trackMult(state, needRival(t))
      break
    case 'counterattack':
      throw new RangeError('A counterattack strikes at the strength of its fallen force (D-24), fixed at dawn')
    case 'surge':
      throw new RangeError('A surge strikes at the strength fixed when it was drawn (D-31)')
  }
  value *= (1 + t.roll) * earlyGraceMult(t.week)
  if (t.daily && isSiegeDay(t.date)) value *= 1 + RULES.combat.siegeDay.bonus
  return COMBAT_HOOKS.threatStrength(state, t, value)
}

/** Patch 4 (D-28): the Orc's war track on his strikes; 1 for any other rival. */
function trackMult(state: CampaignState, rival: RivalId): number {
  return rival === 'orc' ? orcStrikeMult(state) : 1
}

function needRival(t: { kind: ThreatKind; rival?: RivalId }): RivalId {
  if (!t.rival) throw new RangeError(`A ${t.kind} needs a rival`)
  return t.rival
}

// ── Dawn: targets and rolls (A-27, A-28) ─────────────────────────────────────

function bandWeight(band: number): number {
  return band ** RULES.combat.targetRingExponent
}

/**
 * The day's target among the player's border hexes, weighted by band^1.5 (Ch 10, A-27, D-17). Raids
 * come along the raider's border, or else at the border hex nearest its land (ties drawn);
 * mythics prefer the lair sides. The castle (ring 0) is never a target.
 */
function pickTarget(state: CampaignState, date: ISODate, kind: DailyThreatKind, rival: RivalId | undefined): HexState | null {
  const { seed } = state.campaign
  const byId = hexIndex(state.hexes)
  const targets = borderHexesOf(state.hexes, 'player').filter((h) => h.ring > 0)
  if (targets.length === 0) return null
  let pool = targets
  let weight = (_h: HexState): number => 1
  if (kind === 'raid' && rival) {
    // Patch 4 (D-28, D-30): the Orc's and the Dwarf's raids also reach the player's hexes in their own march; the Orc's favor them.
    const ownMarch = (rival === 'orc' && rulesHarden(state, date)) || rival === 'dwarf'
    const along = targets.filter((h) => touches(byId, h.id, rival) || (ownMarch && inMarchOf(state, h, rival, date)))
    weight = (h) => raidWeight(state, rival, h, date)
    if (along.length > 0) pool = along
    else {
      const nearest = nearestTo(targets, state.hexes.filter((h) => h.owner === rival))
      if (nearest.length > 0) return byId.get(pick(seed, date, 'threat:target', nearest.map((h) => h.id))) ?? null
    }
  } else if (kind === 'mythic') {
    const sides = targets.filter((h) => lairSide(h) !== undefined)
    if (sides.length > 0) pool = sides
  }
  const id = weighted(
    seed,
    date,
    'threat:target',
    pool.map((h) => h.id),
    pool.map((h) => bandWeight(bandOf(h)) * weight(h))
  )
  return byId.get(id) ?? null
}

/**
 * The daily threat as the Herald would announce it at `date`'s dawn on the current border: the
 * scheduled type and raider (drawn now if the week was never scheduled), a target and a roll.
 * A raider that can no longer raid is replaced by beasts (A-132). Null when the player has no
 * border to strike.
 */
export function dawnTiding(state: CampaignState, date: ISODate, effects: Effects = realmEffects(state)): Tiding | null {
  const scheduled = combatOf(state).schedule.find((s) => s.date === date) ?? drawThreat(state, date)
  let kind = scheduled.kind
  let rival = scheduled.rival
  if (kind === 'raid' && (!rival || !canRaid(state, rival, date))) {
    kind = 'beasts'
    rival = undefined
  }
  const hex = pickTarget(state, date, kind, rival)
  if (!hex) return null
  const spread = RULES.combat.strength.roll
  const side = kind === 'mythic' ? lairSide(hex) : undefined
  const strength = threatStrength(state, effects, {
    kind,
    date,
    ring: hex.ring,
    ...(rival ? { rival } : {}),
    ...(side ? { side } : {}),
    roll: roll(state.campaign.seed, date, 'threat:roll', -spread, spread),
    week: weekNumber(state, date),
    daily: true,
    wild: wildBase(hex)
  })
  // Patch 7 (A2): beasts and mythics strike weaker within the realm's reach and harder beyond it.
  const reached = kind === 'beasts' || kind === 'mythic' ? strength * strikeMult(state, hex) : strength
  return { date, kind, hexId: hex.id, ...(rival ? { rival } : {}), strength: reached, siegeDay: isSiegeDay(date) }
}

/** Days of warning the realm has for each kind of threat (Mage Tower IV, the Spy Network, Watchtowers). */
function foretoldDays(effects: Effects, kind: DailyThreatKind | 'conquest', rival?: RivalId): number {
  let days = effects.foretell.threats.value
  if (kind === 'raid' && rival) {
    const road = CODEX.rivals.find((r) => r.id === rival)?.road
    days += effects.foretell.raids.value + (road ? (effects.foretell.raidsOnRoad[road]?.value ?? 0) : 0)
  }
  return Math.min(days, RULES.combat.maxForetellDays)
}

function maxForetold(effects: Effects): number {
  const roads = Object.values(effects.foretell.raidsOnRoad).map((s) => s?.value ?? 0)
  return Math.min(effects.foretell.threats.value + effects.foretell.raids.value + Math.max(0, ...roads), RULES.combat.maxForetellDays)
}

/**
 * Dawn of `day`: makes sure its week is scheduled, and fixes the tidings for `day` and for every
 * day the realm foretells (whose week is already scheduled). Settlement runs it after the day
 * before closes, and once for the open day. Returns the same state when nothing is new.
 */
export function dawn(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn = state.campaign.weekStartsOn): CampaignState {
  if (!isPlayable(state) || day < state.campaign.startDate) return state
  const lastOfWeek = weekCloseDay(day, weekStartsOn)
  const next = fallbacksAtDawn(scheduleThreats(state, day, lastOfWeek), day)
  const combat = combatOf(next)
  const effects = realmEffects(next)
  const have = new Set(combat.tidings.map((t) => t.date))
  const fresh: Tiding[] = []
  for (let ahead = 0; ahead <= maxForetold(effects); ahead++) {
    const date = addDays(day, ahead)
    if (have.has(date)) continue
    if (ahead > 0 && !combat.schedule.some((s) => s.date === date)) continue
    const tiding = dawnTiding(next, date, effects)
    if (tiding) fresh.push(tiding)
  }
  const fixed = fresh.length === 0 ? next : withCombat(next, { ...combat, tidings: [...combat.tidings, ...fresh].sort(byDate) })
  return COMBAT_HOOKS.dawn(fixed, day)
}

/**
 * The fallen forces at the dawn of `day` (D-24, C-24). A force past its window, that struck back
 * before today, or whose refuge has changed hands is gone. Each other force in its window draws once
 * (`counter:<id>`) whether it strikes back today: from campaign week 3, while the hex it lost is the
 * player's, the player is not away (R-24, C-25) and, for a rival's, he may raid. A strike is a
 * counterattack at the force's strength today × `strengthMult` (T-03), × the ±15% roll and the early
 * grace, fought at the close.
 */
function fallbacksAtDawn(state: CampaignState, day: ISODate): CampaignState {
  const list = state.fallbacks
  if (!list || list.length === 0) return state
  const F = RULES.sieges.fallback
  const C = RULES.sieges.counterattack
  const { seed } = state.campaign
  const byId = hexIndex(state.hexes)
  const week = weekNumber(state, day)
  const away = awayOn(state, day)
  const spread = RULES.combat.strength.roll
  const kept: Fallback[] = []
  const strikes: Counterattack[] = []
  const buyBacks: Extract<WorldOffer, { kind: 'buyBack' }>[] = []
  let changed = false
  for (const f of list) {
    const k = diffDays(f.day, day)
    if (k > F.days || (f.struck !== undefined && f.struck < day) || byId.get(f.to)?.owner !== f.holder) {
      changed = true
      continue
    }
    if (k < 1 || f.struck !== undefined || (f.drawnThrough !== undefined && f.drawnThrough >= day)) {
      kept.push(f)
      continue
    }
    changed = true
    const rival = f.holder === 'neutral' || f.holder === 'player' ? undefined : f.holder
    const lost = byId.get(f.from)
    const may = week >= C.fromWeek && lost?.owner === 'player' && !away && (!rival || canRaid(state, rival, day))
    // Patch 4 (N-02): the march it lost its hex in decides how it strikes back: the Orc's always at the first dawn, the Dwarf's and the Goblin's never.
    const rule = lost ? marchRule(state, lost, day) : undefined
    if (may && chance(seed, day, `counter:${f.id}`, strikeChance(rule, f.holder, k === 1, ownMark(state, 'orc', 'up')))) {
      const orc = rule === 'orc' ? orcStrikeMult(state) * RULES.personalities.orc.counterMult : 1
      const strength = fallbackStrengthOn(f, day) * C.strengthMult * orc * (1 + roll(seed, day, `counter:roll:${f.id}`, -spread, spread)) * earlyGraceMult(week)
      strikes.push({ date: day, hexId: f.from, ...(rival ? { rival } : {}), strength, fallbackId: f.id })
      kept.push({ ...f, drawnThrough: day, struck: day })
    } else {
      // Patch 4 (C-44): the Goblin's own garrison never strikes back; it may offer to buy back the hex it lost instead.
      if (rule === 'goblin' && f.holder === 'goblin' && lost && week >= C.fromWeek && lost.owner === 'player' && !away && !buyBacks.some((o) => o.hexId === f.from)) {
        if (chance(seed, day, `buyBack:${f.id}`, RULES.personalities.goblin.buyBack.chancePerDay)) buyBacks.push({ kind: 'buyBack', hexId: f.from, price: buyBackPrice(lost), until: addDays(f.day, F.days) })
      }
      kept.push({ ...f, drawnThrough: day })
    }
  }
  const world = worldOf(state)
  const fresh = buyBacks.filter((o) => !world.offers.some((x) => x.kind === 'buyBack' && x.hexId === o.hexId && day <= x.until))
  if (!changed) return state
  const combat = combatOf(state)
  const next = fresh.length > 0 ? withWorld(state, { offers: [...world.offers, ...fresh] }) : state
  return { ...next, fallbacks: kept, ...(strikes.length > 0 ? { combat: { ...combat, counterattacks: [...(combat.counterattacks ?? []), ...strikes] } } : {}) }
}

/** The Goblin's buy-back price for a hex his garrison lost (C-44): his sale price, as selling him a hex pays. */
function buyBackPrice(hex: HexState): number {
  return sellPrice('goblin', hex)
}

/**
 * Where the garrison beaten at `hex` falls back (D-24, C-23, T-02), or undefined when it scatters:
 * an adjacent hex no shallower in a march they share (a seam lies in both of its marches), of the
 * same holder, the one an assault would find cheapest today (ties by hex id), so it stands where the
 * player is likeliest to go next. Beasts go only to a neutral hex that is neither a village nor
 * mythic; a rival's garrison to one of his hexes that is not a Gate. Militia and mythics never fall
 * back. It adds `share` of the garrison the assault beat.
 */
function fallbackFrom(state: CampaignState, byId: ReadonlyMap<string, HexState>, hex: HexState, beaten: number, day: ISODate): Fallback | undefined {
  if (hex.village || hex.mythic || hex.owner === 'player') return undefined
  // Patch 4 (C-44, N-02): an Archmage garrison dissolves (into the next dawn's surge); the Dwarf's dig in deeper.
  const rule = marchRule(state, hex, day)
  if (dissolves(rule)) return undefined
  const marches = [hex.march, hex.seam].filter((m): m is MarchId => m !== undefined)
  if (marches.length === 0) return undefined
  const depth = depthOf(hex)
  const refuges = neighbors(hex.id)
    .map((id) => byId.get(id))
    .filter((c): c is HexState => {
      if (!c || c.owner !== hex.owner || depthOf(c) < depth || !isClaimableKind(c) || c.kind === 'gate' || c.kind === 'lairMouth') return false
      if (![c.march, c.seam].some((m) => m !== undefined && marches.includes(m))) return false
      return c.owner !== 'neutral' || (!c.village && !c.mythic)
    })
    .map((c) => ({ id: c.id, garrison: assaultGarrison(state, c, day) }))
    .sort((a, b) => a.garrison - b.garrison || a.id.localeCompare(b.id))
  const to = refuges[0]?.id
  if (to === undefined) return undefined
  return { id: `fb:${day}:${hex.id}`, from: hex.id, to, holder: hex.owner, strength: fallbackShareOn(rule) * beaten, day }
}

// ── Conquest attempts (T10 announces them) ───────────────────────────────────

export type ConquestRefusal =
  | 'tooEarly'
  | 'notAtWar'
  | 'blocked'
  | 'notPlayerHex'
  | 'innerRing'
  | 'notTouching'
  | 'onePerDay'
  | 'alreadyUnderAttack'
  | 'notAhead'

export type ConquestPlan = { ok: true; state: CampaignState; attempt: ConquestAttempt } | { ok: false; reason: ConquestRefusal; state: CampaignState }

/**
 * Announces a conquest attempt (Ch 10 rule 4) for `date`, the day after `announcedOn`. Refused
 * before week 6, unless the rival is at War and free of Truces, pacts and Accords, on any hex
 * but a player's border hex in ring 3 or beyond that touches the rival's land, more than once a
 * day per rival, or on a hex already contested or targeted. The strength is fixed now: max(base,
 * 0.5 × AV) × the roll drawn on `date`.
 */
export function planConquest(state: CampaignState, a: { rival: RivalId; hexId: string; announcedOn: ISODate }): ConquestPlan {
  const date = addDays(a.announcedOn, 1)
  const refuse = (reason: ConquestRefusal): ConquestPlan => ({ ok: false, reason, state })
  const combat = combatOf(state)
  const hex = state.hexes.find((h) => h.id === a.hexId)
  if (date <= state.settledThrough.day) return refuse('notAhead')
  const week = weekNumber(state, date)
  if (week < RULES.combat.noConquestBeforeWeek) return refuse('tooEarly')
  if (state.rivals[a.rival].status !== 'active' || state.rivals[a.rival].disposition.player !== 'war') return refuse('notAtWar')
  if (!canConquer(state, a.rival, date)) return refuse('blocked')
  if (!hex || hex.owner !== 'player') return refuse('notPlayerHex')
  if (hex.ring < RULES.combat.conquestMinRing) return refuse('innerRing')
  if (!withinReach(state, hexIndex(state.hexes), hex.id, a.rival, COMBAT_HOOKS.conquestReach(state, a.rival, date))) return refuse('notTouching')
  if (combat.conquests.some((c) => c.rival === a.rival && c.date === date)) return refuse('onePerDay')
  if (hex.status === 'contested' || combat.conquests.some((c) => c.hexId === hex.id && c.date === date)) return refuse('alreadyUnderAttack')

  const spread = RULES.combat.strength.roll
  const strength = threatStrength(state, realmEffects(state), {
    kind: 'conquest',
    date,
    ring: hex.ring,
    rival: a.rival,
    roll: roll(state.campaign.seed, date, `conquest:${a.rival}:roll`, -spread, spread),
    week,
    daily: false,
    wild: wildBase(hex)
  })
  const attempt: ConquestAttempt = { rival: a.rival, hexId: hex.id, announcedOn: a.announcedOn, date, strength }
  return { ok: true, attempt, state: withCombat(state, { ...combat, conquests: [...combat.conquests, attempt] }) }
}

/** Whether `hexId` lies within `reach` hexes of `rival`'s land: touching at 1, two away at 2 (the Deep Call). */
export function withinReach(state: CampaignState, byId: ReturnType<typeof hexIndex>, hexId: string, rival: RivalId, reach: number): boolean {
  if (touches(byId, hexId, rival)) return true
  if (reach <= 1) return false
  return state.hexes.some((h) => h.owner === rival && hexDistance(h.id, hexId) <= reach)
}

// ── Matching, Army, Defense and Assault (Ch 10, Ch 6) ────────────────────────

/** The match m (Ch 10): ×1.5 with a weakness tag (weakness wins), ×0.6 holding only resisted tags, otherwise ×1. */
export function tagMatch(tags: readonly Tag[], matchup: DeepReadonly<Matchup>): number {
  const m = RULES.combat.match
  if (tags.some((t) => matchup.weakTo.includes(t))) return m.weak
  if (tags.length > 0 && tags.every((t) => matchup.resists.includes(t))) return m.resist
  return m.neutral
}

/** Daily-combat effects a company carries itself: its items and, for an Elite, its ability. */
function ownEffects(company: Company): Effect[] {
  const out: Effect[] = []
  const take = (list: readonly Effect[]): void => {
    for (const x of list) if (x.in !== 'grand' && (!x.target || x.target === 'company')) out.push(x)
  }
  for (const id of company.items) {
    const item = CODEX.items.find((i) => i.id === id)
    if (item) take(item.effects as readonly Effect[])
  }
  const elite = CODEX.elites.find((e) => e.id === company.id)
  if (elite) take(elite.ability as readonly Effect[])
  return out
}

/** A company's match against a foe: its tags, unless an item sets it (Hunter's Nets). */
export function companyMatch(company: Company, matchupId: MatchupId, foe: Foe): number {
  let m = tagMatch(company.tags, CODEX.matchups[matchupId])
  for (const x of ownEffects(company)) if (x.kind === 'match' && (!x.against || x.against === foe)) m = x.set
  return m
}

/** A fielded company and what it strikes for: p × m. */
export interface Fielded {
  company: Company
  match: number
  strike: number
}

/**
 * The Marshal's pick: the best `banners` companies of the pool by p × m. `pinned` are the
 * companies the player always fields (D-10): those of them in the pool go first, and the Marshal
 * fills the banners left with the best of the rest.
 */
export function fieldBest(pool: readonly Company[], matchupId: MatchupId, foe: Foe, banners: number, pinned?: readonly string[]): Fielded[] {
  const rated = pool.map((company) => {
    const match = companyMatch(company, matchupId, foe)
    return { company, match, strike: company.power * match }
  })
  const first = (pinned ?? []).flatMap((id) => rated.filter((r) => r.company.id === id))
  const rest = rated.filter((r) => !first.includes(r)).sort((a, b) => b.strike - a.strike)
  return [...first, ...rest].slice(0, Math.max(0, banners))
}

export interface DefenseInput {
  /** p × m of each fielded company. */
  strikes: readonly number[]
  /** The Foundry's arms bonus `a`. */
  armsBonus: number
  /** W, already doubled where Shieldwall or Runed Walls apply. */
  walls: number
  /** F = fortification level × 0.25 × the hex's strength (D-17). */
  fortification: number
  /** The rally floor `r`. */
  rallyFloor: number
  /** The day's Valor `V`. */
  valor: number
}

/** The share of the army that shows up: r + (1 − r) × V. */
export function rally(rallyFloor: number, valor: number): number {
  return rallyFloor + (1 - rallyFloor) * valor
}

/** Army = (1 + a) × Σ p × m + W + F; Defense = Army × (r + (1 − r) × V) (Ch 10, E-02). */
export function defenseValue(d: DefenseInput): { army: number; defense: number } {
  const army = (1 + d.armsBonus) * d.strikes.reduce((s, x) => s + x, 0) + d.walls + d.fortification
  return { army, defense: army * rally(d.rallyFloor, d.valor) }
}

/** Assault = (1 + a) × Σ p × m × (r + (1 − r) × V); walls never help (Ch 6). */
export function assaultValue(d: Omit<DefenseInput, 'walls' | 'fortification'>): number {
  return (1 + d.armsBonus) * d.strikes.reduce((s, x) => s + x, 0) * rally(d.rallyFloor, d.valor)
}

/**
 * What an assault must beat (Ch 6): the garrison, + fortification unless ignored, × its march's
 * preparation and a stronghold's multiple (`prep`, D-19, D-23), + fallen forces there (`fallen`,
 * D-24), − its siege wear (D-22).
 */
export function effectiveGarrison(hex: HexState, ignoreFortification = false, prep = 1, fallen = 0, fortShare = 1): number {
  const fort = ignoreFortification ? 0 : fortShare * fortificationValue(hex)
  return Math.max(0, (hex.garrison + fort) * prep + fallen - hex.garrisonDamage)
}

/** What an assault on `hex` must beat on `day`, with its march's preparation that day (D-19). */
export function assaultGarrison(state: CampaignState, hex: HexState, day: ISODate, ignoreFortification = false): number {
  return effectiveGarrison(hex, ignoreFortification, garrisonMult(state, hex, day), fallbackOn(state, hex, day), fortificationShare(state))
}

/**
 * An assault's outcome (Ch 6): taken at Assault ≥ garrison, a rout at 1.5 × garrison; repulsed
 * below, wearing 25% of the Assault value off the garrison until the week closes.
 */
export function assaultOutcome(garrison: number, value: number, wearShare: number = RULES.land.repulseWear): { outcome: 'rout' | 'taken' | 'repulsed'; wear: number } {
  if (value < garrison) return { outcome: 'repulsed', wear: wearShare * value }
  return { outcome: value >= RULES.combat.spoils.routAt * garrison ? 'rout' : 'taken', wear: 0 }
}

/** The foe a threat brings; a counterattack (D-24) is its holder's: beasts, or the rival named. */
export function foeOfThreat(kind: ThreatKind, rival?: RivalId): Foe {
  if (kind === 'beasts' || (kind === 'counterattack' && !rival)) return 'beast'
  return kind === 'mythic' ? 'mythic' : 'rival'
}

export function matchupOfThreat(kind: ThreatKind, rival?: RivalId): MatchupId {
  if (kind === 'beasts' || kind === 'mythic') return kind
  if (kind === 'counterattack' && !rival) return 'beasts'
  return needRival({ kind, rival })
}

/** The garrison's type for matching: mythic beasts, a village's militia, a beast den, or its rival. */
export function garrisonType(hex: HexState): { matchup: MatchupId; foe: Foe } {
  if (hex.mythic) return { matchup: 'mythic', foe: 'mythic' }
  if (hex.owner === 'neutral') return hex.village ? { matchup: 'militia', foe: 'militia' } : { matchup: 'beasts', foe: 'beast' }
  return { matchup: hex.owner as RivalId, foe: 'rival' }
}

export interface DefenseQuery {
  hexId: string
  kind: ThreatKind
  rival?: RivalId
  valor: number
  /** The day fought, for Weary companies. Omitted, any Weary on record counts. */
  day?: ISODate
}

/**
 * The player's Army and Defense on a hex against a threat, with every company defending and the
 * Marshal's pick: what T10 compares a conquest attempt against, and the basis of the bands.
 */
export function defenseFor(state: CampaignState, q: DefenseQuery, effects: Effects = realmEffects(state)): { army: number; defense: number } {
  const hex = state.hexes.find((h) => h.id === q.hexId)
  if (!hex) throw new RangeError(`No hex "${q.hexId}" on the map`)
  const foe = foeOfThreat(q.kind, q.rival)
  const pool = roster(state, q.day ? { day: q.day } : {}, effects)
  const fielded = fieldBest(pool, matchupOfThreat(q.kind, q.rival), foe, defenseBanners(effects))
  return defenseValue({
    strikes: fielded.map((f) => f.strike),
    armsBonus: effects.armsBonus.value,
    walls: wallsFor(effects, { ring: bandOf(hex), foe }),
    fortification: fortificationValue(hex),
    rallyFloor: effects.rallyFloor.value,
    valor: q.valor
  })
}

/**
 * Patch 7 (A2, D-56): the realm's patrol on `day` at `valor`, what its reach is read from: the Defense
 * the Marshal's best defense banners against beasts put up with every company home and the walls,
 * on no hex in particular (no fortification).
 */
export function patrolStrength(state: CampaignState, day: ISODate, valor: number, effects: Effects = realmEffects(state)): number {
  const fielded = fieldBest(roster(state, { day }, effects), 'beasts', 'beast', defenseBanners(effects))
  return defenseValue({
    strikes: fielded.map((f) => f.strike),
    armsBonus: effects.armsBonus.value,
    walls: effects.walls.value,
    fortification: 0,
    rallyFloor: effects.rallyFloor.value,
    valor
  }).defense
}

/** Companies a defense may field: the banners, plus any for the defense pool alone. */
export function defenseBanners(effects: Effects): number {
  return effects.banners.value + effects.poolBanners.defense.value
}

/** Companies one assault may field: the banners, plus the Muster Field's for the assault pool. */
export function assaultBanners(effects: Effects): number {
  return effects.banners.value + effects.poolBanners.assault.value
}

// ── Orders (Ch 6, Ch 2 rule 2, A-36) ─────────────────────────────────────────

export interface AssaultOrder {
  target: string
  companies: string[]
}

export type OrderProblem =
  | { code: 'unknownCompany'; companyId: string }
  | { code: 'bothPools'; companyId: string }
  | { code: 'companyInTwoAssaults'; companyId: string }
  | { code: 'tooManyAssaults'; allowed: number }
  | { code: 'unknownHex'; hexId: string }
  | { code: 'grandBattleRequired'; hexId: string }
  | { code: 'notClaimable'; hexId: string }
  | { code: 'duplicateTarget'; hexId: string }
  | { code: 'noCompanies'; hexId: string }
  | { code: 'tooManyCompanies'; pool: 'defense' | 'assault'; banners: number; hexId?: string }
  | { code: 'overrideNotDefending'; companyId: string }
  | { code: 'hiredUnavailable' }
  | { code: 'envoyUnavailable'; rival: RivalId }
  | { code: 'cannotAfford'; needed: number; have: number }
  /** D-12: the day's led fights have begun, so its orders hold until the close. */
  | { code: 'ordersLocked' }
  /** D-23 (P3-01): a stronghold of the hex's march, shallower than it, still stands. */
  | { code: 'barredByStronghold'; hexId: string; stronghold: string }
  /** D-23 (C-28): a Grand Battle has been announced here; the daily assault waits for it. */
  | { code: 'grandBattlePending'; hexId: string }
  /** Patch 4 (C-35): a buy-off pact holds; the Goblin's march is left alone. */
  | { code: 'pact'; hexId: string }

export interface OrdersValidity {
  ok: boolean
  problems: OrderProblem[]
  /** The assaults that will go out, in order (an assault with a problem of its own is dropped). */
  assaults: AssaultOrder[]
  /** Targets that need a Grand Battle instead (a Gate, a capital or a Lair Mouth). */
  grandBattles: string[]
  /** Every company that defends. */
  defense: string[]
}

/** The assaults named by a day's orders, the first one from `assaultTarget`. */
function assaultsOf(orders: DailyOrders): AssaultOrder[] {
  const first = orders.assaultTarget ? [{ target: orders.assaultTarget, companies: [...orders.assault] }] : []
  return [...first, ...(orders.extraAssaults ?? []).map((a) => ({ target: a.target, companies: [...a.companies] }))]
}

/**
 * Checks a day's orders against the realm (Ch 6, Ch 10): known companies, at most the allowed
 * number of assaults (two at Castle IV or with the Siege Park), each on a claimable adjacent hex
 * that a daily assault may take, with companies of its own; banners; hired blades and envoys.
 * Companies not sent on an assault defend, so no orders means everyone defends (A-36).
 */
export function ordersValidity(state: CampaignState, orders: DailyOrders | undefined, effects: Effects = realmEffects(state)): OrdersValidity {
  const army = roster(state, {}, effects)
  const known = new Set(army.map((c) => c.id))
  const problems: OrderProblem[] = []
  const assaults: AssaultOrder[] = []
  const grandBattles: string[] = []
  const sent = new Set<string>()
  const byId = hexIndex(state.hexes)

  const allowed = effects.dailyAssaults.value
  const asked = orders ? assaultsOf(orders) : []
  if (asked.length > allowed) problems.push({ code: 'tooManyAssaults', allowed })
  asked.slice(0, allowed).forEach((a) => {
    const hex = byId.get(a.target)
    if (!hex) return void problems.push({ code: 'unknownHex', hexId: a.target })
    // A stronghold still standing bars its march's deeper hexes, a Gate's Grand Battle included (D-23).
    const bar = strongholdBarring(state.hexes, hex.id)
    if (bar && hex.owner !== 'player') return void problems.push({ code: 'barredByStronghold', hexId: hex.id, stronghold: bar })
    if (GRAND_BATTLE_KINDS.has(hex.kind) && hex.owner !== 'player') {
      problems.push({ code: 'grandBattleRequired', hexId: hex.id })
      if (touches(byId, hex.id, 'player') && !grandBattles.includes(hex.id)) grandBattles.push(hex.id)
      return
    }
    if (state.grandBattles.some((b) => b.hexId === hex.id && b.result === undefined)) return void problems.push({ code: 'grandBattlePending', hexId: hex.id })
    if (pactBars(state, hex, orders?.date ?? openDayOf(state))) return void problems.push({ code: 'pact', hexId: hex.id })
    if (!claimableBy(state.hexes, hex.id, 'player', 'assault')) return void problems.push({ code: 'notClaimable', hexId: hex.id })
    if (assaults.some((x) => x.target === hex.id)) return void problems.push({ code: 'duplicateTarget', hexId: hex.id })
    const companies: string[] = []
    for (const id of a.companies) {
      if (!known.has(id)) problems.push({ code: 'unknownCompany', companyId: id })
      else if (sent.has(id)) problems.push({ code: 'companyInTwoAssaults', companyId: id })
      else {
        sent.add(id)
        companies.push(id)
      }
    }
    if (companies.length === 0) return void problems.push({ code: 'noCompanies', hexId: hex.id })
    const banners = assaultBanners(effects)
    if (companies.length > banners) problems.push({ code: 'tooManyCompanies', pool: 'assault', banners, hexId: hex.id })
    assaults.push({ target: hex.id, companies })
  })

  const assigned = new Set(assaults.flatMap((a) => a.companies))
  for (const id of orders?.defense ?? []) {
    if (!known.has(id)) problems.push({ code: 'unknownCompany', companyId: id })
    else if (assigned.has(id)) problems.push({ code: 'bothPools', companyId: id })
  }
  const defense = army.filter((c) => !assigned.has(c.id)).map((c) => c.id)
  if (orders?.defenseOverride) {
    for (const id of orders.defenseOverride) if (!defense.includes(id)) problems.push({ code: 'overrideNotDefending', companyId: id })
    const banners = defenseBanners(effects)
    if (orders.defenseOverride.length > banners) problems.push({ code: 'tooManyCompanies', pool: 'defense', banners })
  }

  let fees = 0
  if ((orders?.hired ?? 0) > 0) {
    if (!effects.hiredBlades.on) problems.push({ code: 'hiredUnavailable' })
    else fees += (orders?.hired ?? 0) * RULES.buildings.merchantHall.hiredBlades.costPerBattle
  }
  for (const rival of orders?.envoys ?? []) {
    if (!envoyAvailable(state, rival)) problems.push({ code: 'envoyUnavailable', rival })
    else fees += envoyFee(state, { id: `envoy:${rival}`, source: 'envoy' })
  }
  const have = balance(state.purse)
  if (fees > have) problems.push({ code: 'cannotAfford', needed: fees, have })

  return { ok: problems.length === 0, problems, assaults, grandBattles, defense }
}

/** Whether `rival` lends an envoy company for the day's defense (A-20): active, at his own envoy mark; the Orc never (P6-04, D-48). */
export function envoyAvailable(state: CampaignState, rival: RivalId): boolean {
  const r = state.rivals[rival]
  const at = marksFor(rival).envoy
  return r.status === 'active' && at !== null && r.respect >= at
}

/** The rivals who ever lend an envoy (D-48): all but the Orc. */
export function envoyRivals(): RivalId[] {
  return RIVAL_IDS.filter((r) => marksFor(r).envoy !== null)
}

/**
 * Stores the orders for their day (replacing any) and reports their validity. Orders lock at day
 * close. Patch 3 (D-22, R-16): a first assault on a hex a daily assault may take becomes the
 * standing siege, pressed on every later day without orders of the player's own until it falls.
 */
export function setOrders(state: CampaignState, orders: DailyOrders): { state: CampaignState; validity: OrdersValidity } {
  // Once the player starts the day's fights (D-12), its orders hold: the state is unchanged.
  if (skirmishDayOf(state, orders.date)) {
    const held = ordersValidity(state, state.orders.find((o) => o.date === orders.date))
    return { state, validity: { ...held, problems: [{ code: 'ordersLocked' }, ...held.problems] } }
  }
  let next: CampaignState = { ...state, orders: [...state.orders.filter((o) => o.date !== orders.date), orders].sort(byDate) }
  const target = orders.assaultTarget
  if (target && claimableBy(state.hexes, target, 'player', 'assault')) next = withStandingSiege(next, target, orders.date)
  return { state: next, validity: ordersValidity(next, orders) }
}

/**
 * Clears `date`'s orders (A-181's "Use the Marshal's choice"): the Marshal presses the standing
 * siege, if one stands, and every other company defends (A-36). Refused once the day's fights have
 * begun (D-12): the state comes back unchanged.
 */
export function clearOrders(state: CampaignState, date: ISODate): CampaignState {
  if (skirmishDayOf(state, date) || !state.orders.some((o) => o.date === date)) return state
  return { ...state, orders: state.orders.filter((o) => o.date !== date) }
}

/**
 * Lifts the standing siege (D-22, C-22). If today's own orders send the first assault at it, that
 * assault is dropped too and its companies defend, unless the day's fights have begun (its orders
 * hold until the close). The siege's wear stays on the hex and decays.
 */
export function liftSiege(state: CampaignState, today: ISODate): CampaignState {
  const siege = standingSiegeOf(state)
  if (!siege) return state
  let next = withStandingSiege(state, undefined, today)
  const own = next.orders.find((o) => o.date === today)
  if (own?.assaultTarget === siege.hexId && !skirmishDayOf(next, today)) {
    const { assaultTarget: _gone, ...rest } = own
    next = { ...next, orders: next.orders.map((o) => (o === own ? { ...rest, assault: [] } : o)) }
  }
  return next
}

/**
 * The day's orders for a siege of `hexId` as the Marshal would send them (D-22, C-22): the
 * companies best matched to its garrison, up to the assault's banners, Weary ones counted at their
 * Weary power; every other company defends.
 */
export function siegeOrders(state: CampaignState, day: ISODate, hexId: string, effects: Effects = realmEffects(state)): DailyOrders {
  const hex = hexIndex(state.hexes).get(hexId) as HexState
  const { matchup, foe } = garrisonType(hex)
  const fielded = fieldBest(roster(state, { day }, effects), matchup, foe, assaultBanners(effects))
  return { date: day, assaultTarget: hexId, assault: fielded.map((f) => f.company.id), defense: [] }
}

/**
 * Lays a siege on `hexId` from the hex panel (D-22): today's orders send their first assault at it
 * with the Marshal's companies for it (any the player pinned to defend stay home), keeping the rest
 * of today's orders, and it becomes the standing siege. Refused, unchanged, once the day's fights
 * have begun (D-12).
 */
export function laySiege(state: CampaignState, hexId: string, today: ISODate, effects: Effects = realmEffects(state)): { state: CampaignState; validity: OrdersValidity } {
  const own = state.orders.find((o) => o.date === today)
  const base: DailyOrders = own ? { ...own, defense: [...own.defense] } : { date: today, assault: [], defense: [] }
  const pinned = new Set(base.defenseOverride ?? [])
  const otherAssaults = new Set((base.extraAssaults ?? []).flatMap((a) => a.companies))
  const pick = siegeOrders(state, today, hexId, effects).assault.filter((id) => !pinned.has(id) && !otherAssaults.has(id))
  return setOrders(state, { ...base, assaultTarget: hexId, assault: pick, defense: base.defense.filter((id) => !pick.includes(id)) })
}

/**
 * The orders `day` settles with (D-22): the player's own for the day if set; otherwise the
 * standing siege pressed by the Marshal, if one stands; otherwise none, and every company defends (A-36).
 */
export function ordersFor(state: CampaignState, day: ISODate, effects: Effects = realmEffects(state)): DailyOrders | undefined {
  const own = state.orders.find((o) => o.date === day)
  if (own) return own
  const siege = standingSiegeOf(state)
  return siege && siegeIsLive(state, siege.hexId) ? siegeOrders(state, day, siege.hexId, effects) : undefined
}

/** A standing siege on `hexId` still stands: its hex can be assaulted and no Grand Battle waits on it. */
export function siegeIsLive(state: CampaignState, hexId: string): boolean {
  return siegeStands(state) && !state.grandBattles.some((b) => b.hexId === hexId && b.result === undefined)
}

// ── What the Herald shows (no hidden numbers) ────────────────────────────────

/** How a force compares with the player's, as the player is told it: tidings (A-133) and rival armies (A-24). */
export type Band = 'weaker' | 'matched' | 'stronger' | 'overwhelming'
export type StrengthBand = Band

/** Bands `value` against `against`: Weaker below the first cut, Matched to the second, Stronger to the third, Overwhelming above. */
export function band(value: number, against: number, cuts: readonly number[]): Band {
  const [matched, stronger, overwhelming] = cuts
  const ratio = against > 0 ? value / against : Number.POSITIVE_INFINITY
  if (ratio < matched) return 'weaker'
  if (ratio <= stronger) return 'matched'
  if (ratio <= overwhelming) return 'stronger'
  return 'overwhelming'
}

/** Bands a threat by its strength over the defense's Army (A-133). */
export function strengthBand(strength: number, army: number): StrengthBand {
  return band(strength, army, RULES.combat.strengthBands)
}

export interface ThreatNotice {
  kind: ThreatKind
  date: ISODate
  hexId: string
  rival?: RivalId
  /** Absent under the Veil of Fog (T10). */
  band?: StrengthBand
  /** Only with Mage Tower IV or the Spy Network (`reveals.threatStrength`), and never under the Veil of Fog. */
  strength?: number
  siegeDay: boolean
  /** A conquest attempt striking a hex it already contests. */
  restrike: boolean
  /** D-15: losing this defense returns the hex to the wilds. */
  atStake: boolean
}

export interface TidingsView {
  date: ISODate
  /** Veil of Fog: the Herald has nothing to report. */
  hidden: boolean
  threats: ThreatNotice[]
}

/**
 * Whether losing a defense against `kind` on `hex` returns it to the wilds (D-15): beasts or a
 * mythic, on a hex the player holds in a march (ring 3 or beyond) that is not a village. Rings 0 to 2 are home.
 */
export function returnsToWilds(hex: HexState, kind: ThreatKind): boolean {
  const rule = RULES.combat.wildsReclaim
  return hex.owner === 'player' && rule.threats.includes(kind) && hex.ring >= rule.minRing && hex.village === undefined && isClaimableKind(hex)
}

/**
 * The Herald's tidings for `date` (Ch 10 rule 1): contested hexes struck again, conquest
 * attempts announced, then the daily threat, each with its target, type and a strength band. The
 * exact strength shows only when revealed. The open day always shows; a later day shows what the
 * realm foretells and the attempts already announced.
 */
export function tidings(state: CampaignState, date: ISODate): TidingsView {
  const today = openDayOf(state)
  if (COMBAT_HOOKS.tidingsHidden(state, date)) return { date, hidden: true, threats: [] }
  const effects = realmEffects(state)
  const combat = combatOf(state)
  const veiled = COMBAT_HOOKS.bandsHidden(state, date)
  const exact = effects.reveals.threatStrength.whom !== 'none' && !veiled
  const ahead = Math.max(0, diffDays(today, date))
  const notice = (t: { kind: ThreatKind; hexId: string; rival?: RivalId; strength: number }, siegeDay: boolean, restrike: boolean): ThreatNotice => {
    const { army } = defenseFor(state, { hexId: t.hexId, kind: t.kind, rival: t.rival, valor: 1, day: date }, effects)
    const hex = state.hexes.find((h) => h.id === t.hexId)
    return {
      kind: t.kind,
      date,
      hexId: t.hexId,
      ...(t.rival ? { rival: t.rival } : {}),
      ...(veiled ? {} : { band: strengthBand(t.strength, army) }),
      ...(exact ? { strength: t.strength } : {}),
      siegeDay,
      restrike,
      atStake: hex !== undefined && returnsToWilds(hex, t.kind) && wildsMayReclaim(marchRule(state, hex, date))
    }
  }
  const threats: ThreatNotice[] = []
  for (const c of combat.contested) {
    if (c.since < date && date <= c.until) threats.push(notice({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength }, false, true))
  }
  for (const c of combat.conquests) {
    if (c.date === date && c.announcedOn <= today) threats.push(notice({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength }, false, false))
  }
  for (const c of combat.counterattacks ?? []) {
    if (c.date === date) threats.push(notice({ kind: 'counterattack', hexId: c.hexId, ...(c.rival ? { rival: c.rival } : {}), strength: c.strength }, false, false))
  }
  const surge = surgeOn(state, date)
  if (surge?.surge === 'strike' && surge.hexId && surge.strength !== undefined && date >= today) threats.push(notice({ kind: 'surge', hexId: surge.hexId, rival: 'archmage', strength: surge.strength }, false, false))
  if (date >= today) {
    const stored = combat.tidings.find((t) => t.date === date)
    const daily = stored ?? (date === today ? dawnTiding(state, date, effects) : null)
    if (daily && ahead <= foretoldDays(effects, daily.kind, daily.rival)) threats.push(notice(daily, daily.siegeDay, false))
  }
  return { date, hidden: false, threats }
}

// ── Settling a day (Ch 10 "Settlement order at day close") ───────────────────

export interface CombatDay {
  day: ISODate
  week: number
  weekStartsOn: WeekStartsOn
  /** The day's Valor V. */
  valor: number
  emit: Emit
}

/** An assault order on a hex only a Grand Battle can take, or a rare creature revealed, for grand.ts to raise as a trigger. */
export interface GrandBattleRequest {
  hexId: string
  kind: HexKind
  owner: Owner
  day: ISODate
  /** A rare creature turned at bay on a beast den (Ch 11, D-17: 8% of band 4 to 5 den assaults in a lair's wedge). */
  reveal?: boolean
}

/** A beast den where an assault may reveal a rare creature: a neutral road or between-land hex, no village, band 4 or 5, in a lair's wedge or on its flank (Ch 11, D-17). */
export function isRevealDen(hex: HexState): boolean {
  const reveal = RULES.grandBattles.mythicReveal
  const den = (hex.kind === 'road' || hex.kind === 'between') && hex.owner === 'neutral' && !hex.village && !hex.mythic
  return den && bandOf(hex) >= reveal.minRing && lairSide(hex) !== undefined
}

export interface CombatOutcome {
  state: CampaignState
  grandBattles: GrandBattleRequest[]
}

/** One of the day's defense battles: a strike on a contested hex, a conquest attempt, or the day's threat. */
export interface DayBattle {
  kind: ThreatKind
  hexId: string
  rival?: RivalId
  strength: number
  restrike?: ContestedHex
  daily: boolean
  /** D-24: the fallen force a counterattack comes from. */
  fallbackId?: string
}

/**
 * The day's defense battles in Ch 10's order: strikes on contested hexes (oldest first), the
 * conquest attempts announced for the day, then the day's threat (dealt again at dawn if its hex is
 * no longer the player's). The close fights each; a day the player leads lists them (D-12).
 */
export function dayBattles(state: CampaignState, day: ISODate, effects: Effects = realmEffects(state)): DayBattle[] {
  const combat = combatOf(state)
  const battles: DayBattle[] = []
  for (const c of [...combat.contested].sort((a, b) => a.since.localeCompare(b.since) || a.hexId.localeCompare(b.hexId))) {
    if (c.since < day) battles.push({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength, restrike: c, daily: false })
  }
  for (const c of combat.conquests.filter((x) => x.date === day).sort((a, b) => a.announcedOn.localeCompare(b.announcedOn))) {
    battles.push({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength, daily: false })
  }
  for (const c of (combat.counterattacks ?? []).filter((x) => x.date === day)) {
    battles.push({ kind: 'counterattack', hexId: c.hexId, ...(c.rival ? { rival: c.rival } : {}), strength: c.strength, daily: false, fallbackId: c.fallbackId })
  }
  // Patch 4 (D-31): the Archmage's surge striking a hex of the player's in his march.
  const surge = surgeOn(state, day)
  if (surge?.surge === 'strike' && surge.hexId && surge.strength !== undefined) battles.push({ kind: 'surge', hexId: surge.hexId, rival: 'archmage', strength: surge.strength, daily: false })
  let daily = combat.tidings.find((t) => t.date === day) ?? null
  if (daily && state.hexes.find((h) => h.id === daily?.hexId)?.owner !== 'player') daily = dawnTiding(state, day, effects)
  if (daily) battles.push({ kind: daily.kind, hexId: daily.hexId, ...(daily.rival ? { rival: daily.rival } : {}), strength: daily.strength, daily: true })
  return battles
}

/** A battle that can no longer strike: its hex is not the player's, or its rival may not attack today (a Truce, a pact). */
export function calledOff(state: CampaignState, b: DayBattle, hex: HexState | undefined, day: ISODate): boolean {
  const raids = b.kind === 'raid' || b.kind === 'surge' || (b.kind === 'counterattack' && b.rival !== undefined)
  const blocked = b.kind === 'conquest' ? !canConquer(state, needRival(b), day) : raids && !canRaid(state, needRival(b), day)
  return !hex || hex.owner !== 'player' || blocked
}

// ── Fights the player led (D-12) ─────────────────────────────────────────────

/** The day's fights the player led on the battle map, if they started any. */
export function skirmishDayOf(state: CampaignState, day: ISODate): SkirmishDay | undefined {
  return state.skirmishes?.find((d) => d.day === day)
}

/** The fight the player led and finished for a defense battle, matched on its threat, rival, hex and restrike. */
export function ledDefense(state: CampaignState, day: ISODate, b: DayBattle): Skirmish | undefined {
  return skirmishDayOf(state, day)?.fights.find(
    (f) => f.side === 'defense' && f.result !== undefined && f.hexId === b.hexId && f.threat === b.kind && f.rival === b.rival && (f.restrike === true) === (b.restrike !== undefined)
  )
}

/** The fight the player led and finished for the assault on `hexId`. */
export function ledAssault(state: CampaignState, day: ISODate, hexId: string): Skirmish | undefined {
  return skirmishDayOf(state, day)?.fights.find((f) => f.side === 'assault' && f.result !== undefined && f.hexId === hexId)
}

/** A led assault's outcome: a rout or a win takes the hex; a defeat is repulsed, wearing the garrison as the formula's would. */
function ledAssaultOutcome(led: Skirmish, value: number, wearShare: number = RULES.land.repulseWear): { outcome: 'rout' | 'taken' | 'repulsed'; wear: number } {
  if (led.result === 'defeat') return { outcome: 'repulsed', wear: wearShare * value }
  return { outcome: led.result === 'rout' ? 'rout' : 'taken', wear: 0 }
}

/** Uses of a weekly allowance already spent this calendar week, read from the log. */
function usedThisWeek(state: CampaignState, day: ISODate, weekStartsOn: WeekStartsOn, used: (e: GameEventMap['defense']) => boolean): number {
  const from = weekOf(day, weekStartsOn)
  return state.log.filter((e) => e.kind === 'defense' && e.day >= from && e.day <= day && used(e)).length
}

/** Spoils multipliers the fielded companies carry themselves (the Gold Cloaks). */
function ownSpoilsMult(fielded: readonly Fielded[], foe: Foe): number {
  let mult = 1
  for (const f of fielded) for (const x of ownEffects(f.company)) if (x.kind === 'spoils' && (!x.against || x.against === foe)) mult *= x.mult
  return mult
}

/**
 * Settles the day's combat at its close: every defense battle, then the assaults, then the hex
 * transfers, then spoils, tribute and Respect. Battles that were announced but can no longer
 * strike (a Truce, a rival that stopped being able to attack, a target no longer the player's)
 * are called off. Each battle is fought once; settlement never reruns a day.
 */
export function settleCombat(input: CampaignState, ctx: CombatDay): CombatOutcome {
  const { day, emit } = ctx
  let state = dawn(input, day, ctx.weekStartsOn)
  // A standing siege whose hex can no longer be assaulted ends now (D-22): quietly if the hex is the
  // player's or a Grand Battle the player called waits on it (D-23), else it lapses with a Herald line.
  const siege = standingSiegeOf(state)
  if (siege && !siegeIsLive(state, siege.hexId)) {
    const theirs = state.hexes.find((h) => h.id === siege.hexId)?.owner === 'player'
    const battle = state.grandBattles.some((b) => b.hexId === siege.hexId && b.result === undefined)
    if (!theirs && !battle) emit('standingSiege', { hexId: siege.hexId, change: 'lapsed' })
    state = withStandingSiege(state, undefined, day)
  }
  // Patch 4 (D-31): the day's surge, fixed at dawn, goes into the record.
  const surge = surgeOn(state, day)
  if (surge) emit('surge', { surge: surge.surge, ...(surge.hexId ? { hexId: surge.hexId } : {}), ...(surge.companyId ? { companyId: surge.companyId } : {}), ...(surge.mult !== undefined ? { mult: surge.mult } : {}), ...(surge.target ? { target: true } : {}), ...(surge.steered ? { steered: true } : {}) })
  const effects = realmEffects(state)
  const byId = new Map(hexIndex(state.hexes))
  const setHex = (hex: HexState): void => void byId.set(hex.id, hex)
  const combat = combatOf(state)
  const bonus = effects.reputationBonus.value

  // Orders: the player's own, else the standing siege's (D-22); companies sent on a valid assault leave the defense pool; the rest defend (A-36).
  const orders = ordersFor(state, day, effects)
  const validity = ordersValidity(state, orders, effects)
  const assigned = new Set(validity.assaults.flatMap((a) => a.companies))
  const hiredBlades = effects.hiredBlades.on ? (orders?.hired ?? 0) : 0
  const envoys = (orders?.envoys ?? []).filter((r) => envoyAvailable(state, r))
  const army = roster(state, { day, hired: hiredBlades, envoys }, effects)
  const defensePool = army.filter((c) => !assigned.has(c.id))

  let purse = state.purse
  const gains: { kind: 'spoils' | 'tribute'; amount: number; source: string }[] = []
  const respect: { rival: RivalId; change: number; reason: string }[] = []
  const contested = new Map(combat.contested.map((c) => [c.hexId, c]))
  const falls: ContestedHex[] = []
  const overrun: string[] = []
  // D-24: hexes a rival's counterattack takes back, the fallen forces spent today, and those new today.
  const retaken: { hexId: string; rival: RivalId }[] = []
  const spentForces = new Set<string>()
  const fallen: Fallback[] = []
  let illusions = usedThisWeek(state, day, ctx.weekStartsOn, (e) => e.grandIllusion === true)
  let hunts = usedThisWeek(state, day, ctx.weekStartsOn, (e) => e.hunt !== undefined)
  // Trophies granted today (A-156): each unique, so later victories see the earlier ones.
  const held = heldItems(state)
  const trophies: string[] = []
  const trophy = (lair: string | undefined, anyLair: boolean): { item?: string } => {
    const item = nextTrophy([...held, ...trophies], lair, anyLair)
    if (item) trophies.push(item)
    return item ? { item } : {}
  }

  const fee = (c: Company): number => {
    if (c.source === 'hired') return RULES.buildings.merchantHall.hiredBlades.costPerBattle
    return envoyFee(state, c)
  }

  // 1. Conquest attempts (contested hexes first, then the ones announced for today) and the daily threat.
  const battles = dayBattles(state, day, effects)

  for (const b of battles) {
    const hex = byId.get(b.hexId) as HexState
    if (calledOff(state, b, hex, day)) {
      if (b.restrike) {
        contested.delete(b.hexId)
        if (hex?.status === 'contested') setHex(heldHex(hex))
      }
      emit('calledOff', { threat: b.kind, hexId: b.hexId, ...(b.rival ? { rival: b.rival } : {}) })
      continue
    }

    const foe = foeOfThreat(b.kind, b.rival)
    // A fight the player led on the battle map (D-12) gives the outcome; its companies pay their fees if the purse still can.
    const led = ledDefense(state, day, b)
    const affordable = defensePool.filter((c) => fee(c) === 0 || fee(c) <= balance(purse))
    const { fielded, defense } = led ? ledFielded(defensePool, led, matchupOfThreat(b.kind, b.rival), foe) : defenseOf(effects, affordable, hex, b.kind, b.rival, ctx.valor, orders?.defenseOverride)
    for (const f of fielded) if (fee(f.company) > 0 && (!led || fee(f.company) <= balance(purse))) purse = spend(purse, day, fee(f.company), `${f.company.source}:${f.company.id}:${hex.id}`)
    if (led?.hired) purse = spend(purse, day, Math.min(led.hired * RULES.buildings.merchantHall.hiredBlades.costPerBattle, balance(purse)), `hired:${led.id}`)
    const spoilsRules = RULES.combat.spoils
    const outcome = led?.result ?? (defense >= spoilsRules.routAt * b.strength ? 'rout' : defense >= b.strength ? 'victory' : 'defeat')
    const report: GameEventMap['defense'] = { threat: b.kind, hexId: hex.id, ...(b.rival ? { rival: b.rival } : {}), outcome }
    if (b.restrike) report.restrike = true
    if (led) report.led = true
    // A counterattack fights once: held, its force scatters; lost, it takes the hex back (D-24).
    if (b.fallbackId) spentForces.add(b.fallbackId)

    if (outcome !== 'defeat') {
      if (b.kind === 'beasts' && effects.royalHunt.on && hunts < effects.royalHunt.perWeek) {
        hunts++
        const amount = withBonus(effects.royalHunt.reputation, bonus)
        gains.push({ kind: 'spoils', amount, source: `royalHunt:${hex.id}` })
        report.hunt = roundPosting(amount)
        if (effects.royalHunt.trophy) emit('trophy', { hexId: hex.id, source: 'royalHunt', ...trophy(undefined, true) })
      } else {
        const perRing = outcome === 'rout' ? spoilsRules.routPerRing : spoilsRules.winPerRing
        const amount = withBonus(perRing * bandOf(hex) * effects.spoils[foe].value * ownSpoilsMult(fielded, foe) * (led?.spoils ?? 1), bonus)
        gains.push({ kind: 'spoils', amount, source: `defense:${b.kind}:${hex.id}` })
        report.spoils = roundPosting(amount)
      }
      if (b.rival && RESPECTED_ATTACKS.has(b.kind)) respect.push({ rival: b.rival, change: RULES.respect.change.raidDefeated, reason: 'raidDefeated' })
      if (b.kind === 'mythic') {
        const side = lairSide(hex)
        const lair = side ? CODEX.lairs.find((l) => l.land === side)?.id : undefined
        emit('trophy', { hexId: hex.id, source: 'mythic', ...(lair ? { lair, ...trophy(lair, false) } : {}) })
      }
      if (b.restrike) {
        contested.delete(hex.id)
        setHex(heldHex(hex))
        report.broken = true
      }
    } else if (b.kind === 'counterattack') {
      // A counterattack lost (D-24, C-24): the hex goes back at once, with tribute and no scorch:
      // to the wilds for beasts (as D-15), to the rival for his garrison. Grand Illusion spares it.
      if (illusions < effects.grandIllusion.value) {
        illusions++
        report.grandIllusion = true
      } else {
        const amount = RULES.combat.tribute.perRing * bandOf(hex) * effects.tribute.value
        gains.push({ kind: 'tribute', amount, source: `tribute:${b.kind}:${hex.id}` })
        report.tribute = roundPosting(amount)
        contested.delete(hex.id)
        if (b.rival) retaken.push({ hexId: hex.id, rival: b.rival })
        else overrun.push(hex.id)
        report.retaken = true
      }
    } else if (b.kind !== 'conquest') {
      // The daily threat: tribute and a scorched hex, or beyond the home rings a wild hex back to the wilds (D-15).
      const illusion = illusions < effects.grandIllusion.value
      if (illusion) {
        illusions++
        report.grandIllusion = true
      } else {
        const amount = RULES.combat.tribute.perRing * bandOf(hex) * effects.tribute.value
        gains.push({ kind: 'tribute', amount, source: `tribute:${b.kind}:${hex.id}` })
        report.tribute = roundPosting(amount)
      }
      // A rout returns the hex to the wilds (D-15). A led fight's margin is the formula's, at the Valor locked when it began.
      const judged = led
        ? defenseValue({
            strikes: fielded.map((f) => f.strike),
            armsBonus: effects.armsBonus.value,
            walls: wallsFor(effects, { ring: bandOf(hex), foe }),
            fortification: fortificationValue(hex),
            rallyFloor: effects.rallyFloor.value,
            valor: skirmishDayOf(state, day)?.valor ?? ctx.valor
          }).defense
        : defense
      // Patch 4 (N-05): never in the Dwarf's march; what he lost stays taken.
      if (!illusion && returnsToWilds(hex, b.kind) && wildsMayReclaim(marchRule(state, hex, day)) && b.strength >= RULES.combat.wildsReclaim.routedAt * judged) {
        contested.delete(hex.id)
        overrun.push(hex.id)
        report.overrun = true
      } else {
        const scorched = scorch(hex, day)
        setHex(scorched)
        if (scorched.status === 'scorched') report.scorchedUntil = scorched.statusUntil
      }
      if (b.rival && RESPECTED_ATTACKS.has(b.kind)) respect.push({ rival: b.rival, change: RULES.respect.change.raidLost, reason: 'raidLost' })
    } else if (hex.ring <= RULES.land.protectedThroughRing) {
      // Rings 0 to 2 never pass: a lost conquest battle only scorches (Ch 3 rule 2).
      contested.delete(hex.id)
      const scorched = scorch(heldHex(hex), day)
      setHex(scorched)
      report.scorchedUntil = scorched.statusUntil
    } else if (b.restrike) {
      if (day >= b.restrike.until) falls.push(b.restrike)
      report.contested = true
      report.contestedUntil = b.restrike.until
    } else if (illusions < effects.grandIllusion.value) {
      illusions++
      report.grandIllusion = true
    } else {
      const until = addDays(day, effects.contestedDays.value)
      contested.set(hex.id, { hexId: hex.id, rival: needRival(b), strength: b.strength, since: day, until })
      setHex({ ...hex, status: 'contested', statusUntil: until })
      report.contested = true
      report.contestedUntil = until
    }
    emit('defense', report)
  }

  // 2. The assaults, with the assault pool.
  const grandBattles: GrandBattleRequest[] = validity.grandBattles.map((id) => {
    const hex = byId.get(id) as HexState
    return { hexId: id, kind: hex.kind, owner: hex.owner, day }
  })
  const taken: { hex: HexState; from: Owner }[] = []
  const dissolved: { hexId: string; day: ISODate }[] = []
  // Patch 4 (C-36): the Dwarf's path wears a siege faster.
  const wearShare = RULES.land.repulseWear + RULES.dominion.rankPerks.dwarf.repulseWear * pathRank(state, 'dwarf')
  const wearied = new Set<string>()
  const assaulted = new Set<string>()
  for (const a of validity.assaults) {
    const hex = byId.get(a.target) as HexState
    if (isRevealDen(hex) && chance(state.campaign.seed, day, `reveal:${hex.id}`, RULES.grandBattles.mythicReveal.chance)) {
      // A rare creature turns at bay: no assault today, a Mythic Hunt instead (Ch 11).
      grandBattles.push({ hexId: hex.id, kind: hex.kind, owner: hex.owner, day, reveal: true })
      emit('assault', { hexId: hex.id, owner: hex.owner, outcome: 'revealed' })
      continue
    }
    assaulted.add(hex.id)
    const { foe } = garrisonType(hex)
    // A led assault (D-12) gives the outcome; its Assault value (for the wear on a repulse) uses the Valor locked when it began.
    const led = ledAssault(state, day, hex.id)
    const prep = garrisonMult(state, hex, day)
    const { fielded, value, garrison } = assaultOf(effects, army.filter((c) => a.companies.includes(c.id)), hex, led ? (skirmishDayOf(state, day)?.valor ?? ctx.valor) : ctx.valor, prep, flankingMult(byId, hex.id), fallbackOn(state, hex, day), fortificationShare(state))
    const result = led ? ledAssaultOutcome(led, value, wearShare) : assaultOutcome(garrison, value, wearShare)
    if (led?.hired) purse = spend(purse, day, Math.min(led.hired * RULES.buildings.merchantHall.hiredBlades.costPerBattle, balance(purse)), `hired:${led.id}`)
    const owner = hex.owner
    const ledFlag = led ? { led: true } : {}
    if (result.outcome !== 'repulsed') {
      const rout = result.outcome === 'rout'
      const perRing = rout ? RULES.combat.spoils.routPerRing : RULES.combat.spoils.winPerRing
      const amount = withBonus(perRing * bandOf(hex) * effects.spoils[foe].value * ownSpoilsMult(fielded, foe) * (led?.spoils ?? 1), bonus)
      gains.push({ kind: 'spoils', amount, source: `assault:${hex.id}` })
      if (owner !== 'neutral' && owner !== 'player') respect.push({ rival: owner, change: respectChange(owner, 'hexConquered', RULES.respect.change.hexConquered), reason: 'hexConquered' })
      taken.push({ hex, from: owner })
      const melts = result.outcome === 'taken' && !hex.village && !hex.mythic && dissolves(marchRule(state, hex, day))
      emit('assault', { hexId: hex.id, owner, outcome: result.outcome, spoils: roundPosting(amount), value: roundPosting(value), ...ledFlag, ...(melts ? { dissolved: true } : {}) })
      // Beaten without a rout, the garrison falls back deeper (D-24); a rout scatters it.
      const force = result.outcome === 'taken' ? fallbackFrom(state, byId, hex, garrison, day) : undefined
      if (force) {
        fallen.push(force)
        emit('fallback', { hexId: force.from, to: force.to, holder: force.holder, strength: roundPosting(force.strength) })
      }
      // Patch 4 (C-44): an Archmage garrison dissolves into the next dawn's surge, beside the hex it lost.
      if (melts) dissolved.push({ hexId: hex.id, day })
    } else {
      // The wear stays until the hex falls (D-22), never more than the garrison it wears.
      const worn = { ...hex, garrisonDamage: Math.min(wearCap(hex, fortificationValue(hex), prep), hex.garrisonDamage + result.wear) }
      setHex(worn)
      for (const f of fielded) wearied.add(f.company.id)
      // A breach: worn within the Assault that wore it, so the same assault would now take it.
      const breach = effectiveGarrison(worn, effects.assaultIgnoresFortification.on, prep, fallbackOn(state, hex, day), fortificationShare(state)) <= value ? { breach: true } : {}
      emit('assault', { hexId: hex.id, owner, outcome: 'repulsed', wear: roundPosting(result.wear), value: roundPosting(value), ...breach, ...ledFlag })
    }
  }

  // 3. Hex transfers: hexes the wilds took back, contested hexes that fell, then captured hexes.
  for (const id of overrun) {
    const hex = byId.get(id) as HexState
    setHex(toWilds(hex, wildGarrison(hex, false)))
    emit('hexTransfer', { hexId: id, from: 'player', to: 'neutral', how: 'wilds' })
  }
  for (const c of falls) {
    contested.delete(c.hexId)
    const hex = byId.get(c.hexId) as HexState
    setHex(toRival(hex, c.rival))
    emit('hexTransfer', { hexId: hex.id, from: 'player', to: c.rival, how: 'conquest' })
  }
  for (const r of retaken) {
    setHex(toRival(byId.get(r.hexId) as HexState, r.rival))
    emit('hexTransfer', { hexId: r.hexId, from: 'player', to: r.rival, how: 'conquest' })
  }
  for (const t of taken) {
    setHex(toPlayer(byId.get(t.hex.id) as HexState, day, true))
    emit('hexTransfer', { hexId: t.hex.id, from: t.from, to: 'player', how: 'conquest', fortification: t.hex.fortification })
  }
  // A siege left alone fades (D-22, C-20): every worn hex not assaulted today loses part of its wear, a
  // stronghold more slowly, and none while a Grand Battle waits on it (C-28).
  const awaited = new Set(state.grandBattles.filter((b) => b.result === undefined).map((b) => b.hexId))
  // Patch 4 (C-36): from the Dwarf's path rank III the player's sieges fade more slowly.
  const dp = RULES.dominion.rankPerks.dwarf
  const slowDecay = pathRank(state, 'dwarf') >= dp.slowDecayRank ? dp.slowDecayMult : 1
  for (const [id, h] of byId) {
    if (h.garrisonDamage <= 0 || h.owner === 'player' || assaulted.has(id) || awaited.has(id)) continue
    setHex({ ...h, garrisonDamage: decayedWear(h.garrisonDamage, slowDecay * wearDecayOn(marchRule(state, h, day), isStronghold(state.hexes, id))) })
  }
  // The standing siege ends when its hex falls; the Marshal presses on from it once the map is current (Patch 7, D-60).
  const besieged = standingSiegeOf(state)
  const fell = besieged && taken.find((t) => t.hex.id === besieged.hexId)
  if (fell) state = withStandingSiege(state, undefined, day)

  // 4. Spoils, tribute and Respect.
  for (const g of gains) purse = g.kind === 'spoils' ? post(purse, { date: day, ...g }) : payTribute(purse, day, g.amount, g.source)
  for (const r of respect) state = adjustRespect(state, r.rival, r.change, r.reason, emit)
  for (const item of trophies) state = grantTrophy(state, item)

  state = {
    ...state,
    hexes: state.hexes.map((h) => byId.get(h.id) as HexState),
    purse,
    orders: state.orders.filter((o) => o.date >= day),
    combat: {
      schedule: combat.schedule.filter((s) => s.date > day),
      tidings: combat.tidings.filter((t) => t.date > day),
      conquests: combat.conquests.filter((c) => c.date > day),
      contested: [...contested.values()].sort((a, b) => a.since.localeCompare(b.since) || a.hexId.localeCompare(b.hexId)),
      ...((combat.counterattacks ?? []).some((c) => c.date > day) ? { counterattacks: (combat.counterattacks ?? []).filter((c) => c.date > day) } : {})
    },
    // The fallen forces (D-24): those spent today and those on a hex taken today are gone; today's join them.
    ...fallbacksAfter(state.fallbacks, spentForces, new Set(taken.map((t) => t.hex.id)), fallen)
  }
  if (dissolved.length > 0) state = withPersonalities(state, { dissolved: [...(personalitiesOf(state).dissolved ?? []), ...dissolved] })
  if (fell) state = pressOn(state, fell.hex.id, fell.from, day, emit)
  // Patch 4 (C-36): at the Orc's path rank V a repulse leaves no company Weary (iron ranks).
  if (wearied.size > 0 && pathRank(state, 'orc') < RULES.dominion.rankPerks.orc.ironRanksRank) state = weary(state, wearied, day, effects)
  // Led fights are kept a week for their replays (D-12).
  if (state.skirmishes) state = { ...state, skirmishes: state.skirmishes.filter((d) => d.day > addDays(day, -RULES.skirmish.keepDays)) }
  return { state, grandBattles }
}

/**
 * Patch 7 (D-60): once the standing siege's hex falls, the Marshal presses on. The siege moves to the hex
 * beside it held by the same foe (the wilds, or the same rival, so he never starts a fight on his own)
 * that a daily assault may take tomorrow, with the weakest garrison an assault would face. Never a
 * stronghold, a hex under a pact, or one a Grand Battle waits on; with none, the siege ends. The player
 * names another target, or lifts it, any day.
 */
function pressOn(state: CampaignState, fell: string, foe: Owner, day: ISODate, emit: Emit): CampaignState {
  const tomorrow = addDays(day, 1)
  const byId = hexIndex(state.hexes)
  const next = neighbors(fell)
    .flatMap((id) => {
      const h = byId.get(id)
      if (!h || h.owner !== foe || !claimableBy(state.hexes, h.id, 'player', 'assault') || isStronghold(state.hexes, h.id) || pactBars(state, h, tomorrow)) return []
      return state.grandBattles.some((b) => b.hexId === h.id && b.result === undefined) ? [] : [{ id: h.id, garrison: assaultGarrison(state, h, tomorrow) }]
    })
    .sort((a, b) => a.garrison - b.garrison || a.id.localeCompare(b.id))[0]
  if (!next) return state
  emit('standingSiege', { hexId: next.id, change: 'pressedOn' })
  return withStandingSiege(state, next.id, day)
}

/** The fallen forces after a close (D-24): without the spent and those whose refuge fell, with today's. */
function fallbacksAfter(before: readonly Fallback[] | undefined, spent: ReadonlySet<string>, fell: ReadonlySet<string>, fresh: readonly Fallback[]): { fallbacks?: Fallback[] } {
  const kept = (before ?? []).filter((f) => !spent.has(f.id) && !fell.has(f.to))
  const all = [...kept, ...fresh]
  return all.length > 0 || before !== undefined ? { fallbacks: all } : {}
}

/** The companies a led fight fielded (D-12), found in the pool, as the close counts them for fees and spoils. */
function ledFielded(pool: readonly Company[], led: Skirmish, matchup: MatchupId, foe: Foe): { fielded: Fielded[]; defense: number } {
  const fielded = led.companies.flatMap((id) => pool.filter((c) => c.id === id)).map((company) => {
    const match = companyMatch(company, matchup, foe)
    return { company, match, strike: company.power * match }
  })
  // The outcome is the fight's own; no Defense value is compared.
  return { fielded, defense: 0 }
}

// ── Fielding a battle (shared by settlement and the orders estimate) ────────

/** The Defense `pool` puts up on `hex` against a threat of `kind` (Ch 10): the companies the player always fields, then the Marshal's best by p × m (D-10). */
export function defenseOf(effects: Effects, pool: readonly Company[], hex: HexState, kind: ThreatKind, rival: RivalId | undefined, valor: number, override?: readonly string[]): { fielded: Fielded[]; defense: number } {
  const foe = foeOfThreat(kind, rival)
  const fielded = fieldBest(pool, matchupOfThreat(kind, rival), foe, defenseBanners(effects), override)
  const { defense } = defenseValue({
    strikes: fielded.map((f) => f.strike),
    armsBonus: effects.armsBonus.value,
    walls: wallsFor(effects, { ring: bandOf(hex), foe }),
    fortification: fortificationValue(hex),
    rallyFloor: effects.rallyFloor.value,
    valor
  })
  return { fielded, defense }
}

/**
 * The Assault `pool` brings against `hex` (Ch 6), × its flanking multiple (`flank`, D-22), and the
 * garrison it must beat (fortification ignored by Siegebreakers and like effects; × its march's
 * preparation `prep`, D-19).
 */
export function assaultOf(effects: Effects, pool: readonly Company[], hex: HexState, valor: number, prep = 1, flank = 1, fallen = 0, fortShare = 1): { fielded: Fielded[]; value: number; garrison: number } {
  const { matchup, foe } = garrisonType(hex)
  const fielded = fieldBest(pool, matchup, foe, assaultBanners(effects))
  const value = flank * assaultValue({ strikes: fielded.map((f) => f.strike), armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor })
  const ignoreFort = effects.assaultIgnoresFortification.on || fielded.some((f) => ownEffects(f.company).some((x) => x.kind === 'ignoreFortification'))
  return { fielded, value, garrison: effectiveGarrison(hex, ignoreFort, prep, fallen, fortShare) }
}

export interface OrdersEstimate {
  /** Each battle foretold for `day` on the player's land, and the Defense the defense pool would put up at `valor`. */
  defenses: { hexId: string; kind: ThreatKind; rival?: RivalId; defense: number; fielded: string[] }[]
  /** Each assault the orders send, its Assault at `valor` (flanking counted, `flank` its multiple, D-22), the garrison it must beat, and the outcome that would give. */
  assaults: { hexId: string; value: number; flank: number; garrison: number; outcome: 'rout' | 'taken' | 'repulsed'; fielded: string[] }[]
}

/**
 * What `orders` would field on `day` at Valor `valor` (an estimate for the orders panel, T15): the
 * same fielding as the day's close, before any fee is paid. With no orders every company defends.
 */
export function ordersEstimate(state: CampaignState, orders: DailyOrders | undefined, day: ISODate, valor: number, effects: Effects = realmEffects(state)): OrdersEstimate {
  const validity = ordersValidity(state, orders, effects)
  const assigned = new Set(validity.assaults.flatMap((a) => a.companies))
  const army = roster(state, { day, hired: effects.hiredBlades.on ? (orders?.hired ?? 0) : 0, envoys: (orders?.envoys ?? []).filter((r) => envoyAvailable(state, r)) }, effects)
  const pool = army.filter((c) => !assigned.has(c.id))
  const byId = hexIndex(state.hexes)
  const defenses: OrdersEstimate['defenses'] = []
  for (const t of tidings(state, day).threats) {
    const hex = byId.get(t.hexId)
    if (!hex || hex.owner !== 'player') continue
    const { fielded, defense } = defenseOf(effects, pool, hex, t.kind, t.rival, valor, orders?.defenseOverride)
    defenses.push({ hexId: t.hexId, kind: t.kind, ...(t.rival ? { rival: t.rival } : {}), defense, fielded: fielded.map((f) => f.company.id) })
  }
  const assaults = validity.assaults.map((a) => {
    const hex = byId.get(a.target) as HexState
    const flank = flankingMult(byId, hex.id)
    const { fielded, value, garrison } = assaultOf(effects, army.filter((c) => a.companies.includes(c.id)), hex, valor, garrisonMult(state, hex, day), flank, fallbackOn(state, hex, day), fortificationShare(state))
    return { hexId: hex.id, value, flank, garrison, outcome: assaultOutcome(garrison, value).outcome, fielded: fielded.map((f) => f.company.id) }
  })
  return { defenses, assaults }
}

/** Scorches a hex for 3 days after `day` (a contested hex stays contested). */
export function scorch(hex: HexState, day: ISODate): HexState {
  if (hex.status === 'contested') return hex
  const until = addDays(day, RULES.combat.scorchedDays)
  return { ...hex, status: 'scorched', statusUntil: hex.status === 'scorched' && hex.statusUntil && hex.statusUntil > until ? hex.statusUntil : until }
}

/** Repulsed assault companies are Weary the next day (−20%); the Veterans' Hall takes a day off. */
function weary(state: CampaignState, ids: ReadonlySet<string>, day: ISODate, effects: Effects): CampaignState {
  const days = RULES.land.weary.days + effects.wearyDays.value
  if (days <= 0) return state
  const until = addDays(day, days)
  let next = state
  if ([...ids].some((id) => !next.roster.some((c) => c.id === id))) next = refreshRoster(next)
  return { ...next, roster: next.roster.map((c) => (ids.has(c.id) ? { ...c, wearyUntil: c.wearyUntil && c.wearyUntil > until ? c.wearyUntil : until } : c)) }
}
