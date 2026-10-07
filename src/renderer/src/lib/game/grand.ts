/**
 * Grand Battles (Ch 11; Ch 14 "Defeat" rule 3; A-33, A-151, A-156 to A-163): what raises one, the
 * warning and the queue, preparation, the battle API the Battle screen calls, the Marshal's
 * autoplay at the day's close, outcomes, and replay.
 *
 * - **Triggers** become `state.grandBattles` entries in the phase that raises them, through
 *   `announceGrandBattle`, the one entry point (T12 adds the Coalition Offensive, the Siege and
 *   event battles through it). The enemy host is fixed at the warning. No two battles fall within
 *   5 days; a later one moves to the first free day.
 * - **The battle** is fought on its day: `prepare` (what can be fielded), `setFormation` and
 *   `setDoctrine` during the warning; `begin` fixes Readiness, the field and the Order deck;
 *   `offeredOrders`, then `playRound(order, target, swap)` four times. The last round settles the
 *   outcome at once, as a player action dated that day. `autoResolve` is the Marshal's game for a
 *   battle unfought at its day's close (`grandBattlesAuto`). `result` and `replay` read a fought
 *   battle; `replay` rebuilds every round from the stored setup and plays (grand/field.ts).
 * - **Outcomes** follow Ch 11's table. The Capital, the Coalition Offensive, the Siege and event
 *   battles call `GRAND_HOOKS`, which T12 fills.
 *
 * Pure and deterministic: the Order deck and a Mythic Hunt's quarry are the only draws, with the
 * labels `grand:<id>:deck` (on the battle's day) and `grand:quarry:<hex>` (on the day announced).
 */
import { grantTrophy, heldItems, nextTrophyFor } from './armory'
import { CODEX } from './codex'
import { addDays, diffDays } from './clock'
import { baseArmyValue, scorch, tagMatch, type GrandBattleRequest } from './combat'
import { balance, post, roundPosting, spend, tribute as payTribute, withBonus } from './economy'
import { realmEffects } from './effects'
import { originalVillages } from './land'
import { hexIndex, neighbors, rivalOfRoad } from './map'
import { RULES } from './rules'
import { pick, shuffle } from './rng'
import { refreshRoster, roster, rosterDetail } from './roster'
import { adjustRespect, EventBuffer, hexOf, isPlayable, openDayOf, patchRival, replaceHex, resolutionAllowed, scaleArmy, toPlayer, toRival, weekOn } from './state'
import {
  RIVAL_IDS,
  type BattleRoundLog,
  type BattleSetup,
  type CampaignState,
  type Company,
  type Effects,
  type Emit,
  type FieldUnit,
  type GrandBattle,
  type GrandOutcome,
  type GrandTrigger,
  type HexState,
  type ISODate,
  type OrderTarget,
  type Owner,
  type RivalId,
  type SlotKey
} from './types'
import {
  FILL_ORDER,
  interpret,
  isOver,
  isSlot,
  laneOf,
  marshalPlay,
  offeredOn,
  orderMods,
  playProblem,
  playRoundOn,
  rankOf,
  replayField,
  shares,
  slotOf,
  startMods,
  unitMods,
  fieldResult,
  type Field,
  type RoundPlay,
  type StartMods
} from './grand/field'
import { combinedHost, mythicHost, placeHost, rivalHost, sentBy } from './grand/hosts'

export { hostView, type HostView } from './grand/hosts'
export type { RoundPlay } from './grand/field'

const G = RULES.grandBattles
/** The formation key for the company Mercenary Contract hires free. */
export const FREE_HIRE = 'hired:free'

// ── Reading ──────────────────────────────────────────────────────────────────

export function battleOf(state: CampaignState, id: string): GrandBattle | undefined {
  return state.grandBattles.find((b) => b.id === id)
}

function withBattle(state: CampaignState, battle: GrandBattle): CampaignState {
  return { ...state, grandBattles: state.grandBattles.map((b) => (b.id === battle.id ? battle : b)) }
}

/** Battles announced and not yet fought, soonest first. */
export function pendingBattles(state: CampaignState): GrandBattle[] {
  return state.grandBattles.filter((b) => b.result === undefined).sort((a, b) => a.battleDate.localeCompare(b.battleDate) || a.id.localeCompare(b.id))
}

function isRival(owner: Owner): owner is RivalId {
  return owner !== 'player' && owner !== 'neutral'
}

// ── Triggers and the queue ───────────────────────────────────────────────────

export interface GrandRequest {
  trigger: GrandTrigger
  hexId: string
  /** The day the player first sees the warning: the open day after the close that raised it, or today for a challenge. */
  announcedOn: ISODate
  rival?: RivalId
  /** A coalition's members (T12). */
  members?: RivalId[]
  /** A Mythic Hunt's quarry; drawn from the hex's lair when absent. */
  quarry?: string
  /** The 8% rare-creature reveal on a beast den. */
  revealed?: boolean
  /** A host share other than the trigger's (T12). */
  share?: number
  /** A host already built (T12 event battles). */
  enemy?: Company[]
  /** Days of warning for an event battle (T12). */
  warningDays?: number
  eventId?: string
  /** Companies a side, when an event sets it (Ugrak's Challenge). */
  limit?: number
  /** The day it must fall on or after (the Wild Hunt's full moon; the Siege after an absence). */
  notBefore?: ISODate
}

export type GrandRefusal =
  | 'campaignOver'
  | 'unknownHex'
  | 'unknownBattle'
  /** A battle on that hex is already announced and not yet fought. */
  | 'alreadyAnnounced'
  /** A lost Gate or Capital waits 14 days, a lost Mythic Hunt 7 (Ch 11 rule 3). */
  | 'retryTooSoon'
  /** The Capital needs that rival's Gate held (Ch 11). */
  | 'gateNotHeld'
  /** Winning would resolve the rival when Ch 14's pacing forbids it (no rival before week 12, one per 8 weeks; A-168). */
  | 'pacing'
  /** At most one Incursion per rival every 14 days (A-33). */
  | 'cooldown'
  | 'rivalResolved'
  | 'notGrandBattleHex'
  | 'noHost'
  | 'notBattleDay'
  | 'notPreparing'
  | 'begun'
  | 'notBegun'
  | 'fought'
  | 'formation'
  | 'doctrine'
  | 'reputation'
  | string

export interface GrandAction {
  ok: boolean
  reason?: GrandRefusal
  state: CampaignState
  battle?: GrandBattle
  /** The round just played (`playRound`). */
  round?: BattleRoundLog
}

function refused(state: CampaignState, reason: GrandRefusal): GrandAction {
  return { ok: false, reason, state }
}

/** Days of warning for a trigger: Ch 11's table, plus Mage Tower IV's day (`foretell.grandBattles`). */
export function warningDays(trigger: GrandTrigger, effects: Effects, eventDays?: number): number {
  const table = G.warningDays as Partial<Record<GrandTrigger, number>>
  const days = trigger === 'event' ? (eventDays ?? RULES.world.events.minBattleWarningDays) : (table[trigger] ?? G.warningDays.incursion)
  return days + effects.foretell.grandBattles.value
}

/** The first day from `nominal` at least 5 days from every other Grand Battle (Ch 11: one in any 5 days). */
export function firstFreeDay(state: CampaignState, nominal: ISODate): ISODate {
  let day = nominal
  while (state.grandBattles.some((b) => Math.abs(diffDays(b.battleDate, day)) < G.spacingDays)) day = addDays(day, 1)
  return day
}

/** The Gate on the road to `rival`. */
function gateOf(state: CampaignState, rival: RivalId): HexState | undefined {
  return state.hexes.find((h) => h.kind === 'gate' && h.road !== undefined && rivalOfRoad(h.road) === rival)
}

/** Why a trigger can't be raised, or null. */
function announceProblem(state: CampaignState, r: GrandRequest, hex: HexState | undefined): GrandRefusal | null {
  if (!isPlayable(state)) return 'campaignOver'
  if (!hex) return 'unknownHex'
  if (pendingBattles(state).some((b) => b.hexId === r.hexId)) return 'alreadyAnnounced'
  const lostTooSoon = state.grandBattles.some(
    (b) => b.hexId === r.hexId && b.trigger === r.trigger && b.result === 'defeat' && b.outcome?.retryFrom !== undefined && r.announcedOn < b.outcome.retryFrom
  )
  if (lostTooSoon) return 'retryTooSoon'
  if (r.rival && state.rivals[r.rival].status !== 'active') return 'rivalResolved'
  switch (r.trigger) {
    case 'gate':
      if (hex.kind !== 'gate' || !isRival(hex.owner)) return 'notGrandBattleHex'
      break
    case 'capital': {
      if (hex.kind !== 'capital' || !r.rival) return 'notGrandBattleHex'
      if (gateOf(state, r.rival)?.owner !== 'player') return 'gateNotHeld'
      if (!resolutionAllowed(state, r.announcedOn)) return 'pacing'
      break
    }
    case 'mythicHunt':
      if (hex.owner === 'player') return 'notGrandBattleHex'
      break
    case 'incursion': {
      const recent = state.grandBattles.some(
        (b) => b.trigger === 'incursion' && b.rival === r.rival && diffDays(b.announcedOn, r.announcedOn) < G.incursion.cooldownDays
      )
      if (recent) return 'cooldown'
      break
    }
    default:
      break
  }
  return null
}

/** A Mythic Hunt's quarry: one of the lair's own (not event-only), preferring those whose trophy isn't held yet. */
export function quarryFor(state: CampaignState, hex: HexState, day: ISODate): string | undefined {
  const lair = CODEX.lairs.find((l) => l.land === hex.land)
  if (!lair) return undefined
  const own = CODEX.quarries.filter((q) => q.lair === lair.id && !q.eventOnly)
  const held = heldItems(state)
  const fresh = own.filter((q) => !CODEX.items.some((i) => i.quarry === q.id && held.includes(i.id)))
  const pool = (fresh.length > 0 ? fresh : own).map((q) => q.id)
  return pool.length > 0 ? pick(state.campaign.seed, day, `grand:quarry:${hex.id}`, pool) : undefined
}

/**
 * Announces a Grand Battle (Ch 11): fixes its host now (60% of the rival's AV, A-35; a quarry's
 * roster scaled by the week), sets its day after the warning, moves it to the first free day if
 * another battle falls within 5 days, and posts `announced` (and `queued` when it moved). The one
 * entry point for every trigger; refusals post a `refused` event and change nothing else.
 */
export function announceGrandBattle(state: CampaignState, r: GrandRequest, emit: Emit): GrandAction {
  const hex = hexOf(state, r.hexId)
  const problem = announceProblem(state, r, hex)
  const id = `gb-${state.grandBattles.length + 1}`
  if (problem) {
    emit('grandBattle', { battleId: id, trigger: r.trigger, hexId: r.hexId, stage: 'refused', reason: problem, ...(r.rival ? { rival: r.rival } : {}) })
    return refused(state, problem)
  }
  const effects = realmEffects(state)
  const week = weekOn(state, r.announcedOn)
  let quarry = r.quarry
  let enemy: Company[]
  switch (r.trigger) {
    case 'mythicHunt':
      quarry ??= quarryFor(state, hex as HexState, r.announcedOn)
      enemy = quarry ? mythicHost(quarry, week) : []
      break
    case 'coalitionOffensive':
      enemy = r.enemy ?? combinedHost(state, r.members ?? [], r.share ?? G.hostShare.coalition, r.announcedOn)
      break
    case 'siege':
      enemy = r.enemy ?? (r.members && r.members.length > 0 ? combinedHost(state, r.members, r.share ?? G.hostShare.siege, r.announcedOn) : rivalHost(state, r.rival as RivalId, r.share ?? G.hostShare.siege, r.announcedOn))
      break
    case 'event':
      enemy = r.enemy ?? []
      break
    default:
      enemy = r.enemy ?? (r.rival ? rivalHost(state, r.rival, r.share ?? G.hostShare.rival, r.announcedOn) : [])
  }
  if (enemy.length === 0) {
    emit('grandBattle', { battleId: id, trigger: r.trigger, hexId: r.hexId, stage: 'refused', reason: 'noHost', ...(r.rival ? { rival: r.rival } : {}) })
    return refused(state, 'noHost')
  }
  const warned = addDays(r.announcedOn, warningDays(r.trigger, effects, r.warningDays))
  const nominal = r.notBefore && r.notBefore > warned ? r.notBefore : warned
  const battleDate = firstFreeDay(state, nominal)
  const battle: GrandBattle = { id, trigger: r.trigger, hexId: r.hexId, announcedOn: r.announcedOn, battleDate, enemy }
  if (r.rival) battle.rival = r.rival
  if (r.members) battle.members = [...r.members]
  const sent = sentBy(enemy)
  if (Object.keys(sent).length > 0) battle.sent = sent
  if (quarry) battle.quarry = quarry
  if (r.revealed) battle.revealed = true
  if (r.eventId) battle.eventId = r.eventId
  if (r.limit !== undefined) battle.limit = r.limit
  const facts = { battleId: id, trigger: r.trigger, hexId: r.hexId, battleDate, ...(r.rival ? { rival: r.rival } : {}), ...(quarry ? { quarry } : {}) }
  emit('grandBattle', { ...facts, stage: 'announced' })
  if (battleDate !== nominal) emit('grandBattle', { ...facts, stage: 'queued' })
  const next = { ...state, grandBattles: [...state.grandBattles, battle] }
  return { ok: true, state: next, battle }
}

/** Turns the assaults on Gates, capitals and Lair Mouths (and the 8% reveal) from a day's combat into announced battles. */
export function announceRequests(state: CampaignState, requests: readonly GrandBattleRequest[], announcedOn: ISODate, emit: Emit): CampaignState {
  let next = state
  for (const req of requests) {
    const hex = hexOf(next, req.hexId)
    if (!hex) continue
    let r: GrandRequest | null = null
    if (req.reveal) r = { trigger: 'mythicHunt', hexId: hex.id, announcedOn, revealed: true }
    else if (hex.kind === 'gate' && isRival(hex.owner)) r = { trigger: 'gate', hexId: hex.id, announcedOn, rival: hex.owner }
    else if (hex.kind === 'capital' && isRival(hex.owner)) r = { trigger: 'capital', hexId: hex.id, announcedOn, rival: hex.owner }
    else if (hex.kind === 'lairMouth') r = { trigger: 'mythicHunt', hexId: hex.id, announcedOn }
    if (r) next = announceGrandBattle(next, r, emit).state
  }
  return next
}

/** Hexes the player held at some point that `rival` once held: its founding villages and any it gained since (A-33). */
function formerHexesHeld(state: CampaignState, rival: RivalId, except: string): number {
  const once = new Set(originalVillages(state.campaign.seed)[rival])
  for (const e of state.log) if (e.kind === 'hexTransfer' && (e.to === rival || e.from === rival)) once.add(e.hexId)
  once.delete(except)
  return [...once].filter((id) => hexOf(state, id)?.owner === 'player').length
}

/** The rival an Incursion comes from when the player takes `hexId` from `from` (A-33), or null. */
export function incursionRival(state: CampaignState, hexId: string, from: Owner): RivalId | null {
  const byId = hexIndex(state.hexes)
  for (const n of neighbors(hexId)) {
    const h = byId.get(n)
    if (h?.kind === 'gate' && isRival(h.owner)) return h.owner
  }
  if (isRival(from) && formerHexesHeld(state, from, hexId) >= G.incursion.formerHexes) return from
  return null
}

/**
 * Incursions (A-33) for every hex that passed to the player between `before` and `after` by
 * conquest or influence: beside a rival's Gate, or one of its hexes taken while holding 4 it once
 * held. At most one per rival every 14 days; a cooldown refuses quietly.
 */
export function raiseIncursions(before: CampaignState, after: CampaignState, announcedOn: ISODate, emit: Emit): CampaignState {
  let next = after
  const was = new Map(before.hexes.map((h) => [h.id, h.owner]))
  for (const hex of after.hexes) {
    const from = was.get(hex.id)
    if (from === undefined || from === 'player' || hex.owner !== 'player') continue
    const rival = incursionRival(next, hex.id, from)
    if (!rival || next.rivals[rival].status !== 'active') continue
    const r: GrandRequest = { trigger: 'incursion', hexId: hex.id, announcedOn, rival }
    if (announceProblem(next, r, hex) === 'cooldown') continue
    next = announceGrandBattle(next, r, emit).state
  }
  return next
}

/**
 * The player challenges a Gate, a capital or a Lair Mouth directly (the same as ordering an
 * assault on it, which settlement turns into a battle at the day's close). Announced today.
 */
export function challenge(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): GrandAction {
  const events = new EventBuffer()
  const emit = events.emitter(today)
  const hex = hexOf(state, hexId)
  if (!hex) return refused(state, 'unknownHex')
  if (!neighbors(hexId).some((n) => hexOf(state, n)?.owner === 'player')) return refused(state, 'notTouching')
  const owner = hex.owner
  let r: GrandRequest
  if (hex.kind === 'gate' && isRival(owner)) r = { trigger: 'gate', hexId, announcedOn: today, rival: owner }
  else if (hex.kind === 'capital' && isRival(owner)) r = { trigger: 'capital', hexId, announcedOn: today, rival: owner }
  else if (hex.kind === 'lairMouth' && owner !== 'player') r = { trigger: 'mythicHunt', hexId, announcedOn: today }
  else return refused(state, 'notGrandBattleHex')
  const done = announceGrandBattle(state, r, emit)
  if (!done.ok) return done
  return { ...done, state: events.flush(done.state) }
}

// ── Preparation ──────────────────────────────────────────────────────────────

/** Companies a battle may field: banners + 2, never more than 6 (Ch 11 "Preparation"), or an event's own limit. */
export function companyLimit(effects: Effects, battle?: GrandBattle): number {
  const limit = Math.min(effects.banners.value + G.companiesOverBanners, G.maxCompanies)
  return battle?.limit !== undefined ? Math.min(limit, battle.limit) : limit
}

/** An allied rival's company fights in one Grand Battle a month (Ch 14, A-157): whether it already has, in `battle`'s month. */
export function allyUsed(state: CampaignState, battle: GrandBattle, companyId: string): boolean {
  if (!companyId.startsWith('ally:')) return false
  const month = monthOf(state, battle.battleDate)
  return state.grandBattles.some(
    (b) => b.id !== battle.id && b.setup !== undefined && monthOf(state, b.battleDate) === month && b.setup.units.some((u) => u.id === companyId)
  )
}

/** Readiness R = 0.6 + 0.5 × the average Valor of the last 7 days, never below the Sanctum's floor; the Marshal fights at R − 0.1 (A-161). */
export function readiness(valors: readonly number[], effects: Effects, marshal = false): number {
  const average = valors.length > 0 ? valors.reduce((s, v) => s + v, 0) / valors.length : 0
  const r = G.readiness.base + G.readiness.perValor * average - (marshal ? G.readiness.marshalPenalty : 0)
  return Math.max(effects.readinessFloor.value, r)
}

/** The block of 4 campaign weeks `day` falls in: "once a month" (A-157). */
export function monthOf(state: CampaignState, day: ISODate): number {
  return Math.floor((weekOn(state, day) - 1) / G.monthWeeks)
}

function doctrineEffects(id: string | undefined): StartMods {
  const mods = startMods()
  const doctrine = CODEX.doctrines.find((d) => d.id === id)
  for (const e of doctrine?.effects ?? []) interpret(e, { kind: 'start', mods })
  return mods
}

export interface Preparation {
  battle: GrandBattle
  /** Every company that may be fielded on the battle day, Weary ones at −20%. */
  companies: { company: Company; weary: boolean }[]
  limit: number
  doctrines: string[]
  /** The Doctrine chosen hires one company free (Mercenary Contract): `FREE_HIRE` may take a slot. */
  freeHire: boolean
  /** The battle can be fought now (it is the battle day). */
  canFight: boolean
  /** Readiness on the battle day from the given Valor, for the one-line explanation. */
  readiness: number
}

/** What the player may prepare for `battleId` (Ch 11 "Preparation"): companies, the limit, Doctrines, Readiness. */
export function prepare(state: CampaignState, battleId: string, today: ISODate = openDayOf(state), valors: readonly number[] = []): Preparation | null {
  const battle = battleOf(state, battleId)
  if (!battle) return null
  const effects = realmEffects(state)
  return {
    battle,
    companies: rosterDetail(state, { day: battle.battleDate }, effects).map((e) => ({ company: e.company, weary: e.weary })),
    limit: companyLimit(effects, battle),
    doctrines: effects.doctrines.map((d) => d.id),
    freeHire: doctrineEffects(battle.doctrine).freeHires > 0,
    canFight: today === battle.battleDate && battle.result === undefined,
    readiness: readiness(valors, effects)
  }
}

/** Why a formation can't be fielded, or null (A-162: banners + 2, never more than 6; each company once). */
export function formationProblem(state: CampaignState, battle: GrandBattle, formation: Record<string, string>, effects: Effects = realmEffects(state)): string | null {
  const army = new Set(roster(state, { day: battle.battleDate }, effects).map((c) => c.id))
  const freeHire = doctrineEffects(battle.doctrine).freeHires > 0
  const ids = Object.values(formation)
  if (Object.keys(formation).some((k) => !isSlot(k))) return 'badSlot'
  if (new Set(ids).size !== ids.length) return 'duplicate'
  for (const id of ids) {
    if (id === FREE_HIRE) {
      if (!freeHire) return 'noFreeHire'
    } else if (!army.has(id)) return 'unknownCompany'
    else if (allyUsed(state, battle, id)) return 'allyUsed'
  }
  const fielded = ids.filter((id) => id !== FREE_HIRE).length
  if (fielded === 0) return 'empty'
  if (fielded > companyLimit(effects, battle)) return 'tooMany'
  return null
}

function preparing(state: CampaignState, battleId: string, today: ISODate): GrandBattle | GrandRefusal {
  const battle = battleOf(state, battleId)
  if (!battle) return 'unknownBattle'
  if (battle.result !== undefined) return 'fought'
  if (battle.setup) return 'begun'
  if (today < battle.announcedOn || today > battle.battleDate) return 'notPreparing'
  return battle
}

/** Sets the battle's formation: slot → company id (`FREE_HIRE` for Mercenary Contract's company). */
export function setFormation(state: CampaignState, battleId: string, formation: Record<string, string>, today: ISODate = openDayOf(state)): GrandAction {
  const battle = preparing(state, battleId, today)
  if (typeof battle === 'string') return refused(state, battle)
  const problem = formationProblem(state, battle, formation)
  if (problem) return refused(state, `formation:${problem}`)
  const next = { ...battle, formation: { ...formation } }
  return { ok: true, state: withBattle(state, next), battle: next }
}

/** Picks the battle's one Doctrine from those the realm grants, or none. */
export function setDoctrine(state: CampaignState, battleId: string, doctrine: string | null, today: ISODate = openDayOf(state)): GrandAction {
  const battle = preparing(state, battleId, today)
  if (typeof battle === 'string') return refused(state, battle)
  if (doctrine !== null && !realmEffects(state).doctrines.some((d) => d.id === doctrine)) return refused(state, 'doctrine')
  const next: GrandBattle = { ...battle }
  if (doctrine === null) delete next.doctrine
  else next.doctrine = doctrine
  if (doctrine === null || doctrineEffects(doctrine).freeHires === 0) {
    if (next.formation) next.formation = Object.fromEntries(Object.entries(next.formation).filter(([, id]) => id !== FREE_HIRE))
  }
  return { ok: true, state: withBattle(state, next), battle: next }
}

/** The host's main type, by power: what the Marshal matches his companies against. */
function mainFoe(battle: GrandBattle): RivalId | 'mythic' {
  const power = new Map<RivalId | 'mythic', number>()
  for (const c of battle.enemy) {
    const foe = c.id.slice(0, c.id.indexOf(':')) as RivalId | 'mythic'
    power.set(foe, (power.get(foe) ?? 0) + c.power)
  }
  let best: RivalId | 'mythic' = 'mythic'
  let most = -1
  for (const [foe, p] of power) if (p > most) (best = foe), (most = p)
  return best
}

/**
 * The Marshal's formation (Ch 11 rule 1, A-163): his best companies by p × m against the host,
 * the strongest health in the fronts (center first), ranged in the rears; a front left empty takes
 * the hardiest ranged company. With Mercenary Contract the free company takes the first empty slot.
 */
export function marshalFormation(state: CampaignState, battle: GrandBattle, doctrine: string | undefined, effects: Effects = realmEffects(state)): Record<string, string> {
  const army = roster(state, { day: battle.battleDate }, effects).filter((c) => !allyUsed(state, battle, c.id))
  const matchup = CODEX.matchups[mainFoe(battle)]
  const chosen = [...army].sort((a, b) => b.power * tagMatch(b.tags, matchup) - a.power * tagMatch(a.tags, matchup)).slice(0, companyLimit(effects, battle))
  const health = (c: Company): number => c.power * unitMods(c.id, c.items, c.reach).healthMult
  const melee = chosen.filter((c) => c.reach === 'melee').sort((a, b) => health(b) - health(a))
  const ranged = chosen.filter((c) => c.reach === 'ranged').sort((a, b) => b.power - a.power)
  const out: Record<string, string> = {}
  const fronts = FILL_ORDER.map((l) => slotOf(l, 'front'))
  const rears = FILL_ORDER.map((l) => slotOf(l, 'rear'))
  for (const slot of fronts) {
    const next = melee.shift() ?? [...ranged].sort((a, b) => health(b) - health(a))[0]
    if (!next) break
    if (next.reach === 'ranged') ranged.splice(ranged.indexOf(next), 1)
    out[slot] = next.id
  }
  for (const slot of rears) {
    const next = ranged.shift() ?? melee.shift()
    if (!next) break
    out[slot] = next.id
  }
  if (doctrineEffects(doctrine).freeHires > 0) {
    const free = [...fronts, ...rears].find((s) => !(s in out))
    if (free) out[free] = FREE_HIRE
  }
  return out
}

/** The Merchant Hall's company as a hired company fields it (A-19). */
function hireOf(state: CampaignState, effects: Effects): { power: number; name: string } {
  const hired = roster(state, { hired: 1 }, effects).find((c) => c.source === 'hired') as Company
  return { power: hired.power, name: hired.name }
}

export interface BeginOptions {
  /** The battle day (the open day for the player; the closing day for the Marshal). */
  today: ISODate
  /** The Valor of the 7 days before the battle day (`readinessValors` in settle.ts). */
  valors: readonly number[]
  /** The Marshal fights it: his formation and Doctrine unless the player set them, at R − 0.1. */
  marshal?: boolean
}

/** Fixes the battle: Readiness, every company's power and health, the Order deck (Ch 11 "Units on the field"). */
export function begin(state: CampaignState, battleId: string, o: BeginOptions): GrandAction {
  const battle = battleOf(state, battleId)
  if (!battle) return refused(state, 'unknownBattle')
  if (battle.result !== undefined) return refused(state, 'fought')
  if (battle.setup) return refused(state, 'begun')
  if (o.today !== battle.battleDate) return refused(state, 'notBattleDay')
  const marshal = o.marshal === true
  const effects = realmEffects(state)
  const doctrine = battle.doctrine ?? (marshal ? effects.doctrines[0]?.id : undefined)
  const formation = battle.formation && !formationProblem(state, battle, battle.formation, effects) ? battle.formation : marshalFormation(state, battle, doctrine, effects)
  const problem = formationProblem(state, battle, formation, effects)
  if (problem) return refused(state, `formation:${problem}`)

  // The battle's start: the Doctrine and the realm's battle grants (the Shield Forge). The Siege counts the walls in full (A-164).
  const start = doctrineEffects(doctrine)
  for (const g of effects.battle) interpret(g.effect, { kind: 'start', mods: start })
  if (battle.trigger === 'siege') start.wallsAsHealth = true
  const startHealth = (slot: SlotKey): number =>
    start.health.reduce((m, h) => ((h.who.rank === undefined || h.who.rank === rankOf(slot)) && (h.who.lane === undefined || h.who.lane === laneOf(slot)) ? m * h.mult : m), 1)
  const centerFront = slotOf('center', 'front')

  const army = new Map(roster(state, { day: battle.battleDate }, effects).map((c) => [c.id, c]))
  const hire = hireOf(state, effects)
  const units: FieldUnit[] = []
  let horn = false
  const usedHorn = state.grandBattles.some((b) => b.setup?.horn === true && monthOf(state, b.battleDate) === monthOf(state, battle.battleDate))
  let hornAdd = 0
  for (const [key, id] of Object.entries(formation)) {
    const slot = key as SlotKey
    const walls = start.wallsAsHealth && slot === centerFront ? effects.walls.value : 0
    if (id === FREE_HIRE) {
      const health = G.healthPerPower * hire.power * startHealth(slot) + walls
      units.push({ id: FREE_HIRE, side: 'player', name: hire.name, power: hire.power, health, tags: [RULES.rivals.hired.tag], reach: RULES.rivals.hired.reach, slot, hired: true })
      continue
    }
    const c = army.get(id) as Company
    const own = unitMods(c.id, c.items, c.reach)
    const health = G.healthPerPower * c.power * own.healthMult * startHealth(slot) + walls
    const unit: FieldUnit = { id: c.id, side: 'player', name: c.name, power: c.power, health, tags: [...c.tags], reach: c.reach, slot }
    if (Object.keys(own.mods).length > 0) unit.mods = own.mods
    units.push(unit)
    // The Herald's Horn: once a month, Readiness +0.1 for the whole battle (A-157).
    for (const item of c.items) {
      for (const e of CODEX.items.find((i) => i.id === item)?.effects ?? []) {
        if (e.kind !== 'readiness') continue
        if (e.limit?.per === 'month' && (usedHorn || horn)) continue
        if (e.limit?.per === 'month') horn = true
        hornAdd = Math.max(hornAdd, e.add)
      }
    }
  }
  units.push(...placeHost(battle.enemy))

  const deck = shuffle(state.campaign.seed, battle.battleDate, `grand:${battle.id}:deck`, effects.orders.map((u) => u.id))
  const orderStages: Record<string, number> = {}
  for (const id of deck) {
    const order = CODEX.orders.find((x) => x.id === id)
    if (order?.source.kind === 'crossing') orderStages[id] = state.crossings[order.source.id] ?? 0
  }
  const setup: BattleSetup = {
    readiness: readiness(o.valors, effects, marshal) + hornAdd,
    marshal,
    units,
    deck,
    offer: effects.ordersOffered.value,
    hire,
    orderStages
  }
  if (horn) setup.horn = true
  if (start.lastStand) setup.lastStand = start.lastStand
  const next: GrandBattle = { ...battle, formation: { ...formation }, setup, log: [] }
  if (doctrine) next.doctrine = doctrine
  return { ok: true, state: withBattle(state, next), battle: next }
}

// ── Fighting ─────────────────────────────────────────────────────────────────

/** The battle's field now: its setup with every logged round replayed. */
export function fieldOf(battle: GrandBattle): Field | null {
  if (!battle.setup) return null
  return replayField(battle.setup, battle.log ?? []).field
}

/** The Orders offered this round (3, or 4 with the Leyline Anchor), never repeated within the battle. */
export function offeredOrders(state: CampaignState, battleId: string): string[] {
  const battle = battleOf(state, battleId)
  const field = battle ? fieldOf(battle) : null
  if (!field || isOver(field)) return []
  return offeredOn(field.setup, field.round + 1)
}

const HIRE_FEE = RULES.buildings.merchantHall.hiredBlades.costPerBattle

/**
 * Plays the next round with the player's Order (and its target) and one optional swap. The last
 * round, or a wipe, settles the battle at once: the result, spoils or tribute, Respect, hexes,
 * Weary companies and the `fought` event, dated `today`.
 */
export function playRound(state: CampaignState, battleId: string, play: RoundPlay, today: ISODate = openDayOf(state)): GrandAction {
  const battle = battleOf(state, battleId)
  if (!battle) return refused(state, 'unknownBattle')
  if (battle.result !== undefined) return refused(state, 'fought')
  if (!battle.setup) return refused(state, 'notBegun')
  if (today !== battle.battleDate) return refused(state, 'notBattleDay')
  const field = fieldOf(battle) as Field
  const problem = playProblem(field, play)
  if (problem) return refused(state, problem)
  if (play.order && orderMods(play.order, play.target ?? {}, 0).hire.length > 0 && balance(state.purse) < HIRE_FEE * (field.hired + 1)) {
    return refused(state, 'reputation')
  }
  const played = playRoundOn(field, play)
  let next = withBattle(state, { ...battle, log: [...(battle.log ?? []), played.log] })
  if (isOver(played.field)) {
    const events = new EventBuffer()
    const emit = events.emitter(today)
    const settled = settleBattle(next, battleId, played.field, today, emit)
    // A hex the battle took can raise an Incursion of its own, announced today (A-33).
    next = events.flush(raiseIncursions(next, settled, today, emit))
  }
  return { ok: true, state: next, battle: battleOf(next, battleId), round: played.log }
}

/**
 * The Marshal fights a battle unfought at its day's close (Ch 11 rule 1): his formation and
 * Doctrine unless the player set them, at R − 0.1, each round the Order with the highest immediate
 * damage. A battle the player began is finished at its own Readiness. Settles it.
 */
export function autoResolve(state: CampaignState, battleId: string, day: ISODate, valors: readonly number[], emit: Emit): CampaignState {
  let next = state
  let battle = battleOf(next, battleId)
  if (!battle || battle.result !== undefined) return state
  if (!battle.setup) {
    const begun = begin(next, battleId, { today: battle.battleDate, valors, marshal: true })
    if (!begun.ok) return state
    next = begun.state
    battle = begun.battle as GrandBattle
  }
  let field = fieldOf(battle) as Field
  const log = [...(battle.log ?? [])]
  while (!isOver(field)) {
    const played = playRoundOn(field, marshalPlay(field))
    field = played.field
    log.push(played.log)
  }
  next = withBattle(next, { ...battle, log })
  return settleBattle(next, battleId, field, day, emit, true)
}

/** The first day a Siege may fall: 7 days after the player came back from 14 or more days away (Ch 14 rule 7, A-10). */
export function siegeNotBefore(state: CampaignState): ISODate | undefined {
  const back = state.settlement.returnedOn
  return back ? addDays(back, RULES.defeat.noSiegeAfterReturnDays) : undefined
}

/** Moves every Siege due before `siegeNotBefore` to that day: the Ultimatum waits (Ch 14 rule 7). */
export function holdSieges(state: CampaignState, emit: Emit): CampaignState {
  const notBefore = siegeNotBefore(state)
  if (!notBefore) return state
  let next = state
  for (const b of pendingBattles(state)) {
    if (b.trigger !== 'siege' || b.battleDate >= notBefore || b.setup) continue
    const others = { ...next, grandBattles: next.grandBattles.filter((x) => x.id !== b.id) }
    const battleDate = firstFreeDay(others, notBefore)
    next = withBattle(next, { ...b, battleDate })
    for (const r of b.members ?? (b.rival ? [b.rival] : [])) next = patchRival(next, r, { ultimatumUntil: battleDate })
    emit('grandBattle', { battleId: b.id, trigger: b.trigger, hexId: b.hexId, stage: 'queued', battleDate, ...(b.rival ? { rival: b.rival } : {}) })
  }
  return next
}

/** Fights every battle due on `day` and not yet fought (the `grandBattlesAuto` phase); a hex one takes can raise an Incursion (A-33). */
export function grandBattlesDue(input: CampaignState, day: ISODate, valorsFor: (battleDate: ISODate) => readonly number[], emit: Emit): CampaignState {
  const state = holdSieges(input, emit)
  let next = state
  for (const b of pendingBattles(state)) {
    if (b.battleDate <= day) next = autoResolve(next, b.id, day, valorsFor(b.battleDate), emit)
  }
  return next === state ? state : raiseIncursions(state, next, addDays(day, 1), emit)
}

// ── Outcomes (Ch 11 "Outcomes") ──────────────────────────────────────────────

export interface OutcomeContext {
  day: ISODate
  won: boolean
  result: 'rout' | 'victory' | 'defeat'
  /** The spoils multiplier this battle earned: realm, the Gold Cloaks, Spoils of War. */
  spoilsMult: number
  emit: Emit
}

/** What a trigger's result does; T12 replaces `capital`, `coalitionOffensive`, `siege` and `event`. */
export interface GrandOutcomeHooks {
  capital(state: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome }
  coalitionOffensive(state: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome }
  siege(state: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome }
  event(state: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome }
}

function retryFrom(day: ISODate, days: number): ISODate {
  return addDays(day, days)
}

export function postSpoils(state: CampaignState, day: ISODate, amount: number, source: string): CampaignState {
  return { ...state, purse: post(state.purse, { date: day, kind: 'spoils', amount, source }) }
}

/** Tribute of `perRing` × the hex's ring, with the realm's tribute multiplier (Grace II, Oathguard; A-165). */
export function postTribute(state: CampaignState, day: ISODate, perRing: number, hex: HexState, source: string): { state: CampaignState; amount: number } {
  const amount = perRing * hex.ring * realmEffects(state).tribute.value
  return { state: { ...state, purse: payTribute(state.purse, day, amount, source) }, amount: roundPosting(amount) }
}

export const GRAND_HOOKS: GrandOutcomeHooks = {
  /** Won: the rival is conquered (T12, Ch 14). Lost: its army value +10%; retry after 14 days. */
  capital: (state, battle, ctx) => {
    if (ctx.won) return { state, outcome: {} }
    const gain = G.outcomes.capitalLoss.armyGain
    return { state: scaleArmy(state, battle.rival as RivalId, 1 + gain), outcome: { armyGain: gain, retryFrom: retryFrom(ctx.day, G.retryDays.capital) } }
  },
  /** Won: 40 × ring spoils; T12 breaks the coalition 2 weeks early. Lost: T12 passes the outermost border hex. */
  coalitionOffensive: (state, battle, ctx) => {
    if (!ctx.won) return { state, outcome: {} }
    const hex = hexOf(state, battle.hexId) as HexState
    const amount = withBonus(G.outcomes.coalitionWin.spoilsPerRing * hex.ring * ctx.spoilsMult, realmEffects(state).reputationBonus.value)
    return { state: postSpoils(state, ctx.day, amount, `grandBattle:${battle.id}`), outcome: { spoils: roundPosting(amount) } }
  },
  /** Ch 14: T12. */
  siege: (state) => ({ state, outcome: {} }),
  /** T12. */
  event: (state) => ({ state, outcome: {} })
}

/** A hex the player loses to `rival` after a lost Incursion or Warhost; rings 0 to 2 are only scorched (Ch 3 rule 2). */
function loseHex(state: CampaignState, hexId: string, rival: RivalId, day: ISODate, emit: Emit, outcome: GrandOutcome): CampaignState {
  const hex = hexOf(state, hexId)
  if (!hex || hex.owner !== 'player') return state
  if (hex.ring <= RULES.land.protectedThroughRing) {
    outcome.hexScorched = hex.id
    return replaceHex(state, scorch(hex, day))
  }
  emit('hexTransfer', { hexId: hex.id, from: 'player', to: rival, how: 'conquest' })
  outcome.hexLost = hex.id
  return replaceHex(state, toRival(hex, rival))
}

/** A hex the player takes by a Grand Battle: a Gate, a Lair Mouth or a revealed den (conquest, Settling, A-22). */
function takeHex(state: CampaignState, hexId: string, day: ISODate, emit: Emit, outcome: GrandOutcome): CampaignState {
  const hex = hexOf(state, hexId)
  if (!hex || hex.owner === 'player') return state
  emit('hexTransfer', { hexId: hex.id, from: hex.owner, to: 'player', how: 'conquest' })
  outcome.hexTaken = hex.id
  return replaceHex(state, toPlayer(hex, day, true))
}

/**
 * Settles a battle whose field is over: Weary for routed companies (never destroyed), Reserves'
 * fees, then the trigger's outcome, the `fought` event, and the battle's record.
 */
function settleBattle(input: CampaignState, battleId: string, field: Field, day: ISODate, emit: Emit, marshal = false): CampaignState {
  let state = input
  const battle = battleOf(state, battleId) as GrandBattle
  const result = fieldResult(field)
  const won = result !== 'defeat'
  const effects = realmEffects(state)
  const bonus = effects.reputationBonus.value
  const hex = hexOf(state, battle.hexId) as HexState
  const outcome: GrandOutcome = {}

  // Reserves' hires are paid now; the purse checked them when each was played.
  const fees = Math.min(field.hired * HIRE_FEE, balance(state.purse))
  if (fees > 0) state = { ...state, purse: spend(state.purse, day, fees, `grandBattle:${battle.id}:reserves`) }

  // Routed companies are Weary for 3 days and never destroyed (Ch 11 rule 2); the Veterans' Hall takes a day off.
  const routed = field.units.filter((u) => u.side === 'player' && u.routed && !u.hired).map((u) => u.id)
  const wearyDays = G.wearyDaysAfterRout + effects.wearyDays.value
  if (routed.length > 0 && wearyDays > 0) {
    const until = addDays(day, wearyDays)
    if (routed.some((id) => !state.roster.some((c) => c.id === id))) state = refreshRoster(state)
    state = { ...state, roster: state.roster.map((c) => (routed.includes(c.id) ? { ...c, wearyUntil: c.wearyUntil && c.wearyUntil > until ? c.wearyUntil : until } : c)) }
    outcome.weary = routed
    outcome.wearyUntil = until
  }

  // The spoils multiplier: the realm's against this foe, the Gold Cloaks fielded, Spoils of War played.
  let spoilsMult = effects.spoils[battle.trigger === 'mythicHunt' ? 'mythic' : 'rival'].value
  for (const u of field.setup.units) if (u.side === 'player') spoilsMult *= u.mods?.spoils ?? 1
  for (const r of battle.log ?? []) if (r.order) spoilsMult *= orderMods(r.order, r.target ?? {}, 0).spoils

  const ctx: OutcomeContext = { day, won, result, spoilsMult, emit }
  switch (battle.trigger) {
    case 'incursion':
    case 'warhost': {
      const rival = battle.rival as RivalId
      if (won) {
        const sent = battle.sent?.[rival] ?? 0
        const av = baseArmyValue(state, rival)
        const loss = av > 0 ? Math.min(1, (G.outcomes.incursionWin.armyLoss * sent) / av) : 0
        state = scaleArmy(state, rival, 1 - loss)
        outcome.armyLoss = loss
        const before = state.rivals[rival].respect
        state = adjustRespect(state, rival, RULES.respect.change.incursionWon, 'incursionWon', emit)
        outcome.respect = state.rivals[rival].respect - before
        const amount = withBonus(G.outcomes.incursionWin.spoilsPerRing * hex.ring * spoilsMult, bonus)
        state = postSpoils(state, day, amount, `grandBattle:${battle.id}`)
        outcome.spoils = roundPosting(amount)
      } else state = loseHex(state, battle.hexId, rival, day, emit, outcome)
      break
    }
    case 'gate': {
      const rival = battle.rival as RivalId
      if (won) {
        state = takeHex(state, battle.hexId, day, emit, outcome)
        const before = state.rivals[rival].respect
        state = adjustRespect(state, rival, RULES.respect.change.hexConquered, 'hexConquered', emit)
        outcome.respect = state.rivals[rival].respect - before
      } else {
        const paid = postTribute(state, day, G.outcomes.gateLoss.tributePerRing, hex, `grandBattle:${battle.id}`)
        state = paid.state
        outcome.tribute = paid.amount
        outcome.retryFrom = retryFrom(day, G.retryDays.gate)
      }
      break
    }
    case 'mythicHunt': {
      if (won) {
        const amount = withBonus(G.outcomes.mythicHuntWin.reputation, bonus)
        state = postSpoils(state, day, amount, `grandBattle:${battle.id}`)
        outcome.reputation = roundPosting(amount)
        const trophy = nextTrophyFor(state, battle.quarry)
        const lair = CODEX.quarries.find((q) => q.id === battle.quarry)?.lair
        if (trophy) {
          state = grantTrophy(state, trophy)
          outcome.trophy = trophy
        }
        emit('trophy', { hexId: hex.id, source: 'mythicHunt', ...(lair ? { lair } : {}), ...(trophy ? { item: trophy } : {}) })
        // A Lair Mouth won seals its lair (Ch 3 rule 5); a revealed den is taken too (A-156).
        state = takeHex(state, battle.hexId, day, emit, outcome)
      } else {
        const paid = postTribute(state, day, G.outcomes.mythicHuntLoss.tributePerRing, hex, `grandBattle:${battle.id}`)
        state = paid.state
        outcome.tribute = paid.amount
        outcome.retryFrom = retryFrom(day, G.retryDays.mythicHunt)
      }
      break
    }
    case 'capital':
    case 'coalitionOffensive':
    case 'siege':
    case 'event': {
      const done = GRAND_HOOKS[battle.trigger](state, battle, ctx)
      state = done.state
      Object.assign(outcome, done.outcome)
      break
    }
  }

  emit('grandBattle', {
    battleId: battle.id,
    trigger: battle.trigger,
    hexId: battle.hexId,
    stage: 'fought',
    result,
    battleDate: battle.battleDate,
    ...(battle.rival ? { rival: battle.rival } : {}),
    ...(battle.quarry ? { quarry: battle.quarry } : {}),
    ...(marshal ? { marshal: true } : {})
  })
  const fought = battleOf(state, battleId) as GrandBattle
  return withBattle(state, { ...fought, result, foughtOn: day, outcome })
}

// ── Reading a fought battle ──────────────────────────────────────────────────

export interface BattleResult {
  result: 'rout' | 'victory' | 'defeat'
  /** Each side's remaining health share at the end. */
  shares: { player: number; enemy: number }
  rounds: number
  marshal: boolean
  outcome: GrandOutcome
}

/** A fought battle's result card, or null while it is unfought. */
export function result(battle: GrandBattle): BattleResult | null {
  if (battle.result === undefined || !battle.setup) return null
  const field = fieldOf(battle) as Field
  return { result: battle.result, shares: shares(field), rounds: field.round, marshal: battle.setup.marshal, outcome: battle.outcome ?? {} }
}

export interface ReplayRound extends BattleRoundLog {
  health: Record<string, number>
}

/** Rebuilds a battle round by round from its setup and logged plays (Ch 11 rule 4): the same health at every round. */
export function replay(battle: GrandBattle): { setup: BattleSetup; rounds: ReplayRound[] } | null {
  if (!battle.setup) return null
  const { rounds } = replayField(battle.setup, battle.log ?? [])
  return { setup: battle.setup, rounds: rounds as ReplayRound[] }
}

/** The rivals a battle's host came from (for views). */
export function battleRivals(battle: GrandBattle): RivalId[] {
  return RIVAL_IDS.filter((r) => battle.enemy.some((c) => c.id.startsWith(`${r}:`)))
}

export type { OrderTarget }
