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
import { addDays, campaignWeek, diffDays, weekdayOf, weekOf } from './clock'
import { balance, post, roundPosting, spend, tribute as payTribute, withBonus } from './economy'
import { mythicMultFor, realmEffects, wallsFor } from './effects'
import { blocksConquest, blocksRaids, fortificationValue, raidRateMult } from './land'
import { borderHexesOf, claimableBy, hexDistance, hexIndex, nearestTo, touches } from './map'
import { RULES, base, type DeepReadonly } from './rules'
import { chance, pick, roll, weighted } from './rng'
import { refreshRoster, roster } from './roster'
import { adjustRespect, heldHex, inCoalition, isPlayable, openDayOf, toPlayer, toRival } from './state'
import {
  RIVAL_IDS,
  type CampaignState,
  type CombatState,
  type Company,
  type ConquestAttempt,
  type ContestedHex,
  type DailyOrders,
  type DailyThreatKind,
  type Effect,
  type Effects,
  type Emit,
  type Foe,
  type GameEventMap,
  type HexKind,
  type HexState,
  type ISODate,
  type Land,
  type Owner,
  type RivalId,
  type ScheduledThreat,
  type Tag,
  type ThreatKind,
  type Tiding,
  type WeekStartsOn
} from './types'

const DAILY_KINDS: readonly DailyThreatKind[] = ['beasts', 'mythic', 'raid']
/** Hexes the daily assault never takes: they need a Grand Battle (Ch 3 rules 4 and 5, A-16). */
const GRAND_BATTLE_KINDS: ReadonlySet<HexKind> = new Set<HexKind>(['gate', 'capital', 'lairMouth'])
/** The between-lands the lairs open onto: mythics come from these sides (A-27). */
const LAIR_LANDS: ReadonlySet<Land> = new Set(CODEX.lairs.map((l) => l.land as Land))

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
}

export const COMBAT_HOOKS: CombatHooks = {
  threatMix: (_state, _date, mix) => mix,
  threatStrength: (_state, _threat, strength) => strength,
  raiderWeight: (_state, _rival, _date, weight) => weight,
  tidingsHidden: () => false,
  bandsHidden: () => false,
  conquestReach: () => 1
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

function lairSide(hex: HexState): Land | undefined {
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

/** A raid's multipliers: Respect 25 (×0.9), the Spy Network, Emboldened (+15%) and Humbled (−15%). */
function raidMult(state: CampaignState, effects: Effects, rival: RivalId, date: ISODate): number {
  const r = state.rivals[rival]
  const fronts = RULES.rivals.fronts
  let mult = effects.raidStrength.value
  if (r.respect >= RULES.respect.thresholds.raidsWeaker) mult *= RULES.respect.raidsWeakerMult
  const tracks = Object.values(r.frontTracks)
  if (tracks.some((t) => t >= fronts.track.max)) mult *= 1 + fronts.emboldenedRaid
  if (tracks.some((t) => t <= fronts.track.min) || (r.humbledUntil !== undefined && r.humbledUntil >= date)) mult *= 1 - fronts.humbledRaid
  return mult
}

/**
 * A threat's strength (Ch 10 "Threat strength"): beasts 0.9 × base; mythics 1.15 × base ×
 * the mythic multiplier for their side; a raid max(0.8 × base, 0.25 × AV × temper) with its
 * multipliers; a conquest attempt max(1.0 × base, 0.5 × AV). Then the roll, the early grace and,
 * for a Saturday's daily threat, the siege day.
 */
export function threatStrength(state: CampaignState, effects: Effects, t: ThreatStrengthInput): number {
  const b = base(t.ring)
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
      value = Math.max(s.raidBase * b, s.raidArmy * armyValue(state, rival, t.date) * RULES.combat.temper[rival]) * raidMult(state, effects, rival, t.date)
      break
    }
    case 'conquest':
      value = Math.max(s.conquestBase * b, s.conquestArmy * armyValue(state, needRival(t), t.date))
      break
  }
  value *= (1 + t.roll) * earlyGraceMult(t.week)
  if (t.daily && isSiegeDay(t.date)) value *= 1 + RULES.combat.siegeDay.bonus
  return COMBAT_HOOKS.threatStrength(state, t, value)
}

function needRival(t: { kind: ThreatKind; rival?: RivalId }): RivalId {
  if (!t.rival) throw new RangeError(`A ${t.kind} needs a rival`)
  return t.rival
}

// ── Dawn: targets and rolls (A-27, A-28) ─────────────────────────────────────

function ringWeight(ring: number): number {
  return ring ** RULES.combat.targetRingExponent
}

/**
 * The day's target among the player's border hexes, weighted by ring^1.5 (Ch 10, A-27). Raids
 * come along the raider's border, or else at the border hex nearest its land (ties drawn);
 * mythics prefer the lair sides. The castle (ring 0) is never a target.
 */
function pickTarget(state: CampaignState, date: ISODate, kind: DailyThreatKind, rival: RivalId | undefined): HexState | null {
  const { seed } = state.campaign
  const byId = hexIndex(state.hexes)
  const targets = borderHexesOf(state.hexes, 'player').filter((h) => h.ring > 0)
  if (targets.length === 0) return null
  let pool = targets
  if (kind === 'raid' && rival) {
    const along = targets.filter((h) => touches(byId, h.id, rival))
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
    pool.map((h) => ringWeight(h.ring))
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
    daily: true
  })
  return { date, kind, hexId: hex.id, ...(rival ? { rival } : {}), strength, siegeDay: isSiegeDay(date) }
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
  const lastOfWeek = addDays(weekOf(day, weekStartsOn), RULES.clock.daysPerWeek - 1)
  const next = scheduleThreats(state, day, lastOfWeek)
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
  if (fresh.length === 0) return next
  return withCombat(next, { ...combat, tidings: [...combat.tidings, ...fresh].sort(byDate) })
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
    daily: false
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
  /** F = fortification level × 0.25 × base(ring). */
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

/** What an assault must beat (Ch 6): the garrison, + fortification unless ignored, − this week's wear. */
export function effectiveGarrison(hex: HexState, ignoreFortification = false): number {
  const fort = ignoreFortification ? 0 : fortificationValue(hex)
  return Math.max(0, hex.garrison + fort - hex.garrisonDamage)
}

/**
 * An assault's outcome (Ch 6): taken at Assault ≥ garrison, a rout at 1.5 × garrison; repulsed
 * below, wearing 25% of the Assault value off the garrison until the week closes.
 */
export function assaultOutcome(garrison: number, value: number): { outcome: 'rout' | 'taken' | 'repulsed'; wear: number } {
  if (value < garrison) return { outcome: 'repulsed', wear: RULES.land.repulseWear * value }
  return { outcome: value >= RULES.combat.spoils.routAt * garrison ? 'rout' : 'taken', wear: 0 }
}

function foeOfThreat(kind: ThreatKind): Foe {
  if (kind === 'beasts') return 'beast'
  return kind === 'mythic' ? 'mythic' : 'rival'
}

function matchupOfThreat(kind: ThreatKind, rival?: RivalId): MatchupId {
  if (kind === 'beasts' || kind === 'mythic') return kind
  return needRival({ kind, rival })
}

/** The garrison's type for matching: mythic beasts, a village's militia, a beast den, or its rival. */
function garrisonType(hex: HexState): { matchup: MatchupId; foe: Foe } {
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
  const foe = foeOfThreat(q.kind)
  const pool = roster(state, q.day ? { day: q.day } : {}, effects)
  const fielded = fieldBest(pool, matchupOfThreat(q.kind, q.rival), foe, defenseBanners(effects))
  return defenseValue({
    strikes: fielded.map((f) => f.strike),
    armsBonus: effects.armsBonus.value,
    walls: wallsFor(effects, { ring: hex.ring, foe }),
    fortification: fortificationValue(hex),
    rallyFloor: effects.rallyFloor.value,
    valor: q.valor
  })
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
    if (GRAND_BATTLE_KINDS.has(hex.kind) && hex.owner !== 'player') {
      problems.push({ code: 'grandBattleRequired', hexId: hex.id })
      if (touches(byId, hex.id, 'player') && !grandBattles.includes(hex.id)) grandBattles.push(hex.id)
      return
    }
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
    else fees += RULES.respect.envoyCostPerBattle
  }
  const have = balance(state.purse)
  if (fees > have) problems.push({ code: 'cannotAfford', needed: fees, have })

  return { ok: problems.length === 0, problems, assaults, grandBattles, defense }
}

/** Whether `rival` lends an envoy company for the day's defense: active, at Respect 50 (A-20). */
export function envoyAvailable(state: CampaignState, rival: RivalId): boolean {
  const r = state.rivals[rival]
  return r.status === 'active' && r.respect >= RULES.respect.thresholds.envoy
}

/** Stores the orders for their day (replacing any) and reports their validity. Orders lock at day close. */
export function setOrders(state: CampaignState, orders: DailyOrders): { state: CampaignState; validity: OrdersValidity } {
  const next = { ...state, orders: [...state.orders.filter((o) => o.date !== orders.date), orders].sort(byDate) }
  return { state: next, validity: ordersValidity(next, orders) }
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
}

export interface TidingsView {
  date: ISODate
  /** Veil of Fog: the Herald has nothing to report. */
  hidden: boolean
  threats: ThreatNotice[]
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
    return {
      kind: t.kind,
      date,
      hexId: t.hexId,
      ...(t.rival ? { rival: t.rival } : {}),
      ...(veiled ? {} : { band: strengthBand(t.strength, army) }),
      ...(exact ? { strength: t.strength } : {}),
      siegeDay,
      restrike
    }
  }
  const threats: ThreatNotice[] = []
  for (const c of combat.contested) {
    if (c.since < date && date <= c.until) threats.push(notice({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength }, false, true))
  }
  for (const c of combat.conquests) {
    if (c.date === date && c.announcedOn <= today) threats.push(notice({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength }, false, false))
  }
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
  /** A rare creature turned at bay on a beast den (Ch 11: 8% of ring 4 to 5 West and East den assaults). */
  reveal?: boolean
}

/** A beast den where an assault may reveal a rare creature: a neutral road or between-land hex, no village, ring 4 or 5, on a lair side (Ch 11). */
export function isRevealDen(hex: HexState): boolean {
  const reveal = RULES.grandBattles.mythicReveal
  const den = (hex.kind === 'road' || hex.kind === 'between') && hex.owner === 'neutral' && !hex.village && !hex.mythic
  return den && hex.ring >= reveal.minRing && hex.ring <= RULES.land.claimableRings.max && lairSide(hex) !== undefined
}

export interface CombatOutcome {
  state: CampaignState
  grandBattles: GrandBattleRequest[]
}

interface Battle {
  kind: ThreatKind
  hexId: string
  rival?: RivalId
  strength: number
  restrike?: ContestedHex
  daily: boolean
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
  const effects = realmEffects(state)
  const byId = new Map(hexIndex(state.hexes))
  const setHex = (hex: HexState): void => void byId.set(hex.id, hex)
  const combat = combatOf(state)
  const bonus = effects.reputationBonus.value

  // Orders: companies sent on a valid assault leave the defense pool; the rest defend (A-36).
  const orders = state.orders.find((o) => o.date === day)
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
    return c.source === 'envoy' ? RULES.respect.envoyCostPerBattle : 0
  }

  // 1. Conquest attempts (contested hexes first, then the ones announced for today) and the daily threat.
  const battles: Battle[] = []
  for (const c of [...contested.values()].sort((a, b) => a.since.localeCompare(b.since) || a.hexId.localeCompare(b.hexId))) {
    if (c.since < day) battles.push({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength, restrike: c, daily: false })
  }
  for (const c of combat.conquests.filter((x) => x.date === day).sort((a, b) => a.announcedOn.localeCompare(b.announcedOn))) {
    battles.push({ kind: 'conquest', hexId: c.hexId, rival: c.rival, strength: c.strength, daily: false })
  }
  let daily = combat.tidings.find((t) => t.date === day) ?? null
  if (daily && byId.get(daily.hexId)?.owner !== 'player') daily = dawnTiding(state, day, effects)
  if (daily) battles.push({ kind: daily.kind, hexId: daily.hexId, ...(daily.rival ? { rival: daily.rival } : {}), strength: daily.strength, daily: true })

  for (const b of battles) {
    const hex = byId.get(b.hexId) as HexState
    const blocked = b.kind === 'conquest' ? !canConquer(state, needRival(b), day) : b.kind === 'raid' && !canRaid(state, needRival(b), day)
    if (!hex || hex.owner !== 'player' || blocked) {
      if (b.restrike) {
        contested.delete(b.hexId)
        if (hex?.status === 'contested') setHex(heldHex(hex))
      }
      emit('calledOff', { threat: b.kind, hexId: b.hexId, ...(b.rival ? { rival: b.rival } : {}) })
      continue
    }

    const foe = foeOfThreat(b.kind)
    const affordable = defensePool.filter((c) => fee(c) === 0 || fee(c) <= balance(purse))
    const { fielded, defense } = defenseOf(effects, affordable, hex, b.kind, b.rival, ctx.valor, orders?.defenseOverride)
    for (const f of fielded) if (fee(f.company) > 0) purse = spend(purse, day, fee(f.company), `${f.company.source}:${f.company.id}:${hex.id}`)
    const spoilsRules = RULES.combat.spoils
    const outcome = defense >= spoilsRules.routAt * b.strength ? 'rout' : defense >= b.strength ? 'victory' : 'defeat'
    const report: GameEventMap['defense'] = { threat: b.kind, hexId: hex.id, ...(b.rival ? { rival: b.rival } : {}), outcome }
    if (b.restrike) report.restrike = true

    if (outcome !== 'defeat') {
      if (b.kind === 'beasts' && effects.royalHunt.on && hunts < effects.royalHunt.perWeek) {
        hunts++
        const amount = withBonus(effects.royalHunt.reputation, bonus)
        gains.push({ kind: 'spoils', amount, source: `royalHunt:${hex.id}` })
        report.hunt = roundPosting(amount)
        if (effects.royalHunt.trophy) emit('trophy', { hexId: hex.id, source: 'royalHunt', ...trophy(undefined, true) })
      } else {
        const perRing = outcome === 'rout' ? spoilsRules.routPerRing : spoilsRules.winPerRing
        const amount = withBonus(perRing * hex.ring * effects.spoils[foe].value * ownSpoilsMult(fielded, foe), bonus)
        gains.push({ kind: 'spoils', amount, source: `defense:${b.kind}:${hex.id}` })
        report.spoils = roundPosting(amount)
      }
      if (b.kind === 'raid') respect.push({ rival: needRival(b), change: RULES.respect.change.raidDefeated, reason: 'raidDefeated' })
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
    } else if (b.kind !== 'conquest') {
      // The daily threat: tribute and a scorched hex. Land is never lost to it.
      const illusion = illusions < effects.grandIllusion.value
      if (illusion) {
        illusions++
        report.grandIllusion = true
      } else {
        const amount = RULES.combat.tribute.perRing * hex.ring * effects.tribute.value
        gains.push({ kind: 'tribute', amount, source: `tribute:${b.kind}:${hex.id}` })
        report.tribute = roundPosting(amount)
      }
      const scorched = scorch(hex, day)
      setHex(scorched)
      if (scorched.status === 'scorched') report.scorchedUntil = scorched.statusUntil
      if (b.kind === 'raid') respect.push({ rival: needRival(b), change: RULES.respect.change.raidLost, reason: 'raidLost' })
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
  const wearied = new Set<string>()
  for (const a of validity.assaults) {
    const hex = byId.get(a.target) as HexState
    if (isRevealDen(hex) && chance(state.campaign.seed, day, `reveal:${hex.id}`, RULES.grandBattles.mythicReveal.chance)) {
      // A rare creature turns at bay: no assault today, a Mythic Hunt instead (Ch 11).
      grandBattles.push({ hexId: hex.id, kind: hex.kind, owner: hex.owner, day, reveal: true })
      emit('assault', { hexId: hex.id, owner: hex.owner, outcome: 'revealed' })
      continue
    }
    const { foe } = garrisonType(hex)
    const { fielded, value, garrison } = assaultOf(effects, army.filter((c) => a.companies.includes(c.id)), hex, ctx.valor)
    const result = assaultOutcome(garrison, value)
    const owner = hex.owner
    if (result.outcome !== 'repulsed') {
      const rout = result.outcome === 'rout'
      const perRing = rout ? RULES.combat.spoils.routPerRing : RULES.combat.spoils.winPerRing
      const amount = withBonus(perRing * hex.ring * effects.spoils[foe].value * ownSpoilsMult(fielded, foe), bonus)
      gains.push({ kind: 'spoils', amount, source: `assault:${hex.id}` })
      if (owner !== 'neutral' && owner !== 'player') respect.push({ rival: owner, change: RULES.respect.change.hexConquered, reason: 'hexConquered' })
      taken.push({ hex, from: owner })
      emit('assault', { hexId: hex.id, owner, outcome: result.outcome, spoils: roundPosting(amount) })
    } else {
      setHex({ ...hex, garrisonDamage: hex.garrisonDamage + result.wear })
      for (const f of fielded) wearied.add(f.company.id)
      emit('assault', { hexId: hex.id, owner, outcome: 'repulsed', wear: roundPosting(result.wear) })
    }
  }

  // 3. Hex transfers: contested hexes that fell, then captured hexes.
  for (const c of falls) {
    contested.delete(c.hexId)
    const hex = byId.get(c.hexId) as HexState
    setHex(toRival(hex, c.rival))
    emit('hexTransfer', { hexId: hex.id, from: 'player', to: c.rival, how: 'conquest' })
  }
  for (const t of taken) {
    setHex(toPlayer(byId.get(t.hex.id) as HexState, day, true))
    emit('hexTransfer', { hexId: t.hex.id, from: t.from, to: 'player', how: 'conquest' })
  }

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
      contested: [...contested.values()].sort((a, b) => a.since.localeCompare(b.since) || a.hexId.localeCompare(b.hexId))
    }
  }
  if (wearied.size > 0) state = weary(state, wearied, day, effects)
  return { state, grandBattles }
}

// ── Fielding a battle (shared by settlement and the orders estimate) ────────

/** The Defense `pool` puts up on `hex` against a threat of `kind` (Ch 10): the companies the player always fields, then the Marshal's best by p × m (D-10). */
function defenseOf(effects: Effects, pool: readonly Company[], hex: HexState, kind: ThreatKind, rival: RivalId | undefined, valor: number, override?: readonly string[]): { fielded: Fielded[]; defense: number } {
  const foe = foeOfThreat(kind)
  const fielded = fieldBest(pool, matchupOfThreat(kind, rival), foe, defenseBanners(effects), override)
  const { defense } = defenseValue({
    strikes: fielded.map((f) => f.strike),
    armsBonus: effects.armsBonus.value,
    walls: wallsFor(effects, { ring: hex.ring, foe }),
    fortification: fortificationValue(hex),
    rallyFloor: effects.rallyFloor.value,
    valor
  })
  return { fielded, defense }
}

/** The Assault `pool` brings against `hex` (Ch 6), and the garrison it must beat (fortification ignored by Siegebreakers and like effects). */
function assaultOf(effects: Effects, pool: readonly Company[], hex: HexState, valor: number): { fielded: Fielded[]; value: number; garrison: number } {
  const { matchup, foe } = garrisonType(hex)
  const fielded = fieldBest(pool, matchup, foe, assaultBanners(effects))
  const value = assaultValue({ strikes: fielded.map((f) => f.strike), armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor })
  const ignoreFort = effects.assaultIgnoresFortification.on || fielded.some((f) => ownEffects(f.company).some((x) => x.kind === 'ignoreFortification'))
  return { fielded, value, garrison: effectiveGarrison(hex, ignoreFort) }
}

export interface OrdersEstimate {
  /** Each battle foretold for `day` on the player's land, and the Defense the defense pool would put up at `valor`. */
  defenses: { hexId: string; kind: ThreatKind; rival?: RivalId; defense: number; fielded: string[] }[]
  /** Each assault the orders send, its Assault at `valor`, the garrison it must beat, and the outcome that would give. */
  assaults: { hexId: string; value: number; garrison: number; outcome: 'rout' | 'taken' | 'repulsed'; fielded: string[] }[]
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
    const { fielded, value, garrison } = assaultOf(effects, army.filter((c) => a.companies.includes(c.id)), hex, valor)
    return { hexId: hex.id, value, garrison, outcome: assaultOutcome(garrison, value).outcome, fielded: fielded.map((f) => f.company.id) }
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
