/**
 * Daily skirmishes (D-12): the day's fights a player leads on the battle map after pressing
 * "Start battle", each a short battle (`RULES.skirmish.rounds`) on the Grand Battle field.
 *
 * - **What is fought** is what the day's close would fight, in its order: the defense battles
 *   (`dayBattles`), then the assaults of the day's orders. A den assault that reveals a rare
 *   creature is left to the close, which raises its Mythic Hunt as before.
 * - **The player's side** is the companies the close's formula would field, placed as the
 *   Marshal places them, with the Foundry's arms bonus on their power and the walls and
 *   fortification as health in the center front. Readiness is the formula's rally share
 *   (r + (1 − r) × V) at the Valor locked when the day's fights began.
 * - **The enemy** fields as many companies as the player, of its own kinds (the rival's host,
 *   the lair's quarry, or the codex's beasts and militia), their power together the threat's
 *   strength (or the garrison) × `hostScale` for that count (mythic foes × `mythicScale` too).
 * - **Nothing posts here.** A fight's result is kept with its day; the close reads it in place of
 *   the formula's (combat.ts) and posts spoils, tribute, hexes and Weary as on any day. A fight
 *   begun and not finished by the close is finished by the Marshal (`finishSkirmishes`); one never
 *   begun is left to the formula. Once the day's fights start, its orders hold (`setOrders`).
 * - **Taking it back** (D-36): until a fight is opened, the start can be undone
 *   (`undoStartSkirmishes`): the fights come off the field and the Valor and orders unlock.
 *
 * Pure and deterministic: a fight's Order deck (`skirmish:<id>:deck` on its day) and a stray
 * mythic's quarry are the only draws.
 */
import { CODEX, type MatchupId } from './codex'
import { COMBAT_HOOKS, assaultOf, calledOff, dayBattles, defenseOf, envoyAvailable, isRevealDen, ordersFor, ordersValidity, rally, setOrders, skirmishDayOf } from './combat'
import { balance } from './economy'
import { realmEffects, wallsFor } from './effects'
import { battleStart, companyUnit, hireOf, orderDeck, placeFormation, quarryFor } from './grand'
import { fieldResult, fitDeck, isOver, marshalPlay, offeredOn, orderMods, playProblem, playRoundOn, replayField, slotOf, type Field, type RoundPlay } from './grand/field'
import { hostFromKinds, placeHost, type HostKind } from './grand/hosts'
import { fortificationValue } from './land'
import { bandOf, hexIndex } from './map'
import { fallbackOn, flankingMult, garrisonMult } from './sieges'
import { RULES } from './rules'
import { chance, pick } from './rng'
import { hostUnits } from './rivals'
import { roster } from './roster'
import { envoyFee } from './respect'
import { isPlayable, openDayOf } from './state'
import type { BattleSetup, CampaignState, Company, Effects, HexState, ISODate, RivalId, SlotKey, Skirmish, SkirmishDay, ThreatKind } from './types'

const SK = RULES.skirmish
const HIRE_FEE = RULES.buildings.merchantHall.hiredBlades.costPerBattle

/** Who the enemy is: a rival's host, mythic beasts, a beast den's or the day's beasts, or a village's militia. */
export type EnemyKind = { kind: 'rival'; rival: RivalId } | { kind: 'mythic' } | { kind: 'beasts' } | { kind: 'militia' }

/** One of the day's fights before it is set on the field. `strength` is hidden: only the enemy's size comes from it. */
export interface FightPlan {
  id: string
  side: 'defense' | 'assault'
  hexId: string
  threat?: ThreatKind
  rival?: RivalId
  restrike?: boolean
  strength: number
  enemy: EnemyKind
  /** The companies the close's formula would field, in its order. */
  companies: Company[]
  /** Health the center front gains: the walls and the hex's fortification (a defense only). */
  walls: number
}

export type SkirmishRefusal = 'campaignOver' | 'notToday' | 'started' | 'noFights' | 'unknownFight' | 'fought' | 'reputation' | 'notStarted' | 'opened' | 'veiled' | string

export interface SkirmishAction {
  ok: boolean
  state: CampaignState
  reason?: SkirmishRefusal
  fight?: Skirmish
}

function refused(state: CampaignState, reason: SkirmishRefusal): SkirmishAction {
  return { ok: false, state, reason }
}

function fightId(side: FightPlan['side'], hexId: string, threat?: ThreatKind, rival?: RivalId, restrike?: boolean): string {
  return side === 'assault' ? `assault:${hexId}` : `defense:${threat}:${rival ?? ''}:${hexId}${restrike ? ':restrike' : ''}`
}

/** What a company costs to field in a defense battle: hired blades and envoys are paid per battle. */
function feeOf(state: CampaignState, c: Company): number {
  if (c.source === 'hired') return HIRE_FEE
  return envoyFee(state, c)
}

function enemyOfThreat(kind: ThreatKind, rival?: RivalId): EnemyKind {
  if (kind === 'beasts' || (kind === 'counterattack' && !rival)) return { kind: 'beasts' }
  if (kind === 'mythic') return { kind: 'mythic' }
  return { kind: 'rival', rival: rival as RivalId }
}

function enemyOfGarrison(hex: HexState): EnemyKind {
  if (hex.mythic) return { kind: 'mythic' }
  if (hex.owner === 'neutral') return hex.village ? { kind: 'militia' } : { kind: 'beasts' }
  return { kind: 'rival', rival: hex.owner as RivalId }
}

/**
 * The day's fights in the close's order, each with the companies the formula would field: the
 * defense battles that will strike, then the assaults (a revealing den left out). A fight no
 * company can be sent to is left to the close.
 */
export function todaysFights(state: CampaignState, day: ISODate, effects: Effects = realmEffects(state)): FightPlan[] {
  const orders = ordersFor(state, day, effects)
  const validity = ordersValidity(state, orders, effects)
  const assigned = new Set(validity.assaults.flatMap((a) => a.companies))
  const hired = effects.hiredBlades.on ? (orders?.hired ?? 0) : 0
  // An envoy no longer lent (his Respect fell, or the Orc's, who sends none from Patch 6, C-84) leaves the roll unpaid.
  const army = roster(state, { day, hired, envoys: (orders?.envoys ?? []).filter((r) => envoyAvailable(state, r)) }, effects)
  const defensePool = army.filter((c) => !assigned.has(c.id))
  const purse = balance(state.purse)
  const plans: FightPlan[] = []

  for (const b of dayBattles(state, day, effects)) {
    const hex = state.hexes.find((h) => h.id === b.hexId)
    if (!hex || calledOff(state, b, hex, day)) continue
    const affordable = defensePool.filter((c) => feeOf(state, c) === 0 || feeOf(state, c) <= purse)
    const { fielded } = defenseOf(effects, affordable, hex, b.kind, b.rival, 1, orders?.defenseOverride)
    if (fielded.length === 0) continue
    const foe = b.kind === 'beasts' ? 'beast' : b.kind === 'mythic' ? 'mythic' : 'rival'
    plans.push({
      id: fightId('defense', hex.id, b.kind, b.rival, b.restrike !== undefined),
      side: 'defense',
      hexId: hex.id,
      threat: b.kind,
      ...(b.rival ? { rival: b.rival } : {}),
      ...(b.restrike ? { restrike: true } : {}),
      strength: b.strength,
      enemy: enemyOfThreat(b.kind, b.rival),
      companies: fielded.map((f) => f.company),
      walls: wallsFor(effects, { ring: bandOf(hex), foe }) + fortificationValue(hex)
    })
  }

  const byId = hexIndex(state.hexes)
  for (const a of validity.assaults) {
    const hex = state.hexes.find((h) => h.id === a.target)
    if (!hex) continue
    if (isRevealDen(hex) && chance(state.campaign.seed, day, `reveal:${hex.id}`, RULES.grandBattles.mythicReveal.chance)) continue
    const { fielded, garrison } = assaultOf(effects, army.filter((c) => a.companies.includes(c.id)), hex, 1, garrisonMult(state, hex, day), 1, fallbackOn(state, hex, day))
    if (fielded.length === 0) continue
    // Flanking (D-22, P3-03) helps a led assault as much as the formula: the enemy fields the garrison ÷ the flanking multiple.
    plans.push({ id: fightId('assault', hex.id), side: 'assault', hexId: hex.id, strength: garrison / flankingMult(byId, hex.id), enemy: enemyOfGarrison(hex), companies: fielded.map((f) => f.company), walls: 0 })
  }
  return plans
}

/** The enemy's power as a multiple of the threat's strength, for `count` companies fielded. */
export function hostScale(count: number): number {
  const table = SK.hostScale
  return table[Math.min(table.length, Math.max(1, count)) - 1]
}

/** The enemy's size for a fight: `hostScale` for the count, and for mythic foes `mythicScale` of that. */
export function enemyScale(plan: Pick<FightPlan, 'enemy'>, count: number): number {
  return hostScale(count) * (plan.enemy.kind === 'mythic' ? SK.mythicScale : 1)
}

/** The kinds of company the enemy fields, strongest share first: each with its id prefix, unit, name, share of the power and reach. */
function enemyKinds(state: CampaignState, plan: FightPlan, day: ISODate): HostKind[] {
  const e = plan.enemy
  if (e.kind === 'rival') return hostUnits(e.rival).map((u) => ({ side: e.rival, unit: u.id, name: u.name, weight: u.power, reach: u.reach }))
  if (e.kind === 'mythic') {
    const hex = state.hexes.find((h) => h.id === plan.hexId) as HexState
    const own = quarryFor(state, hex, day)
    const id = own ?? pick(state.campaign.seed, day, `skirmish:quarry:${plan.hexId}`, CODEX.quarries.filter((q) => !q.eventOnly).map((q) => q.id))
    const quarry = CODEX.quarries.find((q) => q.id === id)
    const units = (quarry?.roster ?? []).flatMap((u) => Array.from({ length: u.count }, () => ({ side: 'mythic', unit: u.id, name: u.name, weight: u.power, reach: u.reach })))
    return units.sort((a, b) => b.weight - a.weight)
  }
  const foe = CODEX.skirmishFoes.find((f) => f.id === e.kind)
  return (foe?.units ?? []).map((u) => ({ side: e.kind, unit: u.id, name: u.name, weight: u.weight, reach: u.reach }))
}

/** The enemy for a fight: `count` companies of its kinds (cycling), sharing `strength × scale` power by their weights. */
export function skirmishHost(state: CampaignState, plan: FightPlan, count: number, day: ISODate, scale: number = enemyScale(plan, count)): Company[] {
  return hostFromKinds(enemyKinds(state, plan, day), count, plan.strength * scale)
}

/** A fight set on the field: the player's companies as the Marshal stands them, the enemy, the deck, Readiness from the locked Valor. */
export function fightSetup(state: CampaignState, plan: FightPlan, valor: number, day: ISODate, effects: Effects = realmEffects(state), scale?: number): { enemy: Company[]; setup: BattleSetup } {
  const count = Math.max(1, plan.companies.length)
  const enemy = skirmishHost(state, plan, count, day, scale ?? enemyScale(plan, count))
  const start = battleStart(undefined, effects)
  const byId = new Map(plan.companies.map((c) => [c.id, c]))
  const centerFront = slotOf('center', 'front')
  const arms = 1 + effects.armsBonus.value
  const units = Object.entries(placeFormation(plan.companies)).map(([slot, id]) => companyUnit(byId.get(id) as Company, slot as SlotKey, start, slot === centerFront ? plan.walls : 0, arms))
  const { deck, orderStages } = orderDeck(state, day, `skirmish:${plan.id}:deck`, effects)
  const all = [...units, ...placeHost(enemy)]
  const setup: BattleSetup = {
    readiness: rally(effects.rallyFloor.value, valor),
    marshal: false,
    units: all,
    deck: fitDeck(deck, all, effects.ordersOffered.value, SK.rounds),
    offer: effects.ordersOffered.value,
    hire: hireOf(state, effects),
    orderStages,
    rounds: SK.rounds
  }
  if (start.lastStand) setup.lastStand = start.lastStand
  return { enemy, setup }
}

/** A fight as the day keeps it, from its plan. */
function toSkirmish(state: CampaignState, plan: FightPlan, valor: number, day: ISODate, effects: Effects): Skirmish {
  const { enemy, setup } = fightSetup(state, plan, valor, day, effects)
  return {
    id: plan.id,
    side: plan.side,
    hexId: plan.hexId,
    ...(plan.threat ? { threat: plan.threat } : {}),
    ...(plan.rival ? { rival: plan.rival } : {}),
    ...(plan.restrike ? { restrike: true } : {}),
    companies: plan.companies.map((c) => c.id),
    enemy,
    setup,
    log: []
  }
}

function withDay(state: CampaignState, next: SkirmishDay): CampaignState {
  return { ...state, skirmishes: [...(state.skirmishes ?? []).filter((d) => d.day !== next.day), next] }
}

function withFight(state: CampaignState, day: SkirmishDay, fight: Skirmish): CampaignState {
  return withDay(state, { ...day, fights: day.fights.map((f) => (f.id === fight.id ? fight : f)) })
}

/**
 * "Start battle" (D-12): sets the day's fights on the field with today's Valor so far (`valor`,
 * 0 to 1), and holds the day's orders. Refused once the day's fights have started, on another day
 * than today, after the Fall, or with nothing to fight.
 */
export function startSkirmishes(state: CampaignState, day: ISODate, valor: number): SkirmishAction & { day?: SkirmishDay } {
  if (!isPlayable(state)) return refused(state, 'campaignOver')
  if (day !== openDayOf(state)) return refused(state, 'notToday')
  if (skirmishDayOf(state, day)) return refused(state, 'started')
  const effects = realmEffects(state)
  const plans = todaysFights(state, day, effects)
  if (plans.length === 0) return refused(state, 'noFights')
  const locked = Math.min(1, Math.max(0, valor))
  // A standing siege's orders (D-22) are written down, so the orders the fights began with hold until the close.
  const orders = ordersFor(state, day, effects)
  const wrote = orders !== undefined && !state.orders.some((o) => o.date === day)
  const held = wrote ? setOrders(state, orders).state : state
  const next: SkirmishDay = { day, valor: locked, fights: plans.map((p) => toSkirmish(state, p, locked, day, effects)), ...(wrote ? { wroteOrders: true as const } : {}) }
  return { ok: true, state: withDay(held, next), day: next }
}

/** Under the Veil of Fog (the Herald's tidings or their strengths hidden), a start can't be taken back (D-36): its roll and field would show what the Herald hides. */
export function startVeiled(state: CampaignState, day: ISODate): boolean {
  return COMBAT_HOOKS.tidingsHidden(state, day) || COMBAT_HOOKS.bandsHidden(state, day)
}

/**
 * Why "Start battle" can't be taken back on `day` now (D-36), or null if it can: it must be the
 * open day, its fights begun and none of them opened or fought yet, and not under the Veil of Fog.
 */
export function undoStartRefusal(state: CampaignState, day: ISODate): SkirmishRefusal | null {
  if (!isPlayable(state)) return 'campaignOver'
  if (day !== openDayOf(state)) return 'notToday'
  const sd = skirmishDayOf(state, day)
  if (!sd) return 'notStarted'
  if (sd.fights.some((f) => f.begun || f.result !== undefined)) return 'opened'
  if (startVeiled(state, day)) return 'veiled'
  return null
}

/**
 * Takes back "Start battle" (D-36): the day's fights come off the field, its Valor unlocks and
 * its orders open again as they stood before it was pressed (a standing siege's orders it wrote
 * down are cleared). Refused once a fight is opened, as `undoStartRefusal` says.
 */
export function undoStartSkirmishes(state: CampaignState, day: ISODate): SkirmishAction {
  const refusal = undoStartRefusal(state, day)
  if (refusal) return refused(state, refusal)
  const sd = skirmishDayOf(state, day) as SkirmishDay
  const orders = sd.wroteOrders ? state.orders.filter((o) => o.date !== day) : state.orders
  return { ok: true, state: { ...state, orders, skirmishes: (state.skirmishes ?? []).filter((d) => d.day !== day) } }
}

/** A fight's field now: its setup with every round played so far. */
export function skirmishField(fight: Skirmish): Field {
  return replayField(fight.setup, fight.log).field
}

/** The Orders offered for the fight's next round; none once it is over. */
export function offeredFightOrders(fight: Skirmish): string[] {
  const field = skirmishField(fight)
  return isOver(field) ? [] : offeredOn(fight.setup, field.round + 1)
}

function fightOf(state: CampaignState, dayOf: ISODate, id: string): { day: SkirmishDay; fight: Skirmish } | null {
  const day = skirmishDayOf(state, dayOf)
  const fight = day?.fights.find((f) => f.id === id)
  return day && fight ? { day, fight } : null
}

/** Opens a fight: from now on the Marshal finishes it at the close if the player doesn't. */
export function beginFight(state: CampaignState, dayOf: ISODate, id: string): SkirmishAction {
  const found = fightOf(state, dayOf, id)
  if (!found) return refused(state, 'unknownFight')
  if (found.fight.result !== undefined) return refused(state, 'fought')
  if (dayOf !== openDayOf(state)) return refused(state, 'notToday')
  if (found.fight.begun) return { ok: true, state, fight: found.fight }
  const fight = { ...found.fight, begun: true }
  return { ok: true, state: withFight(state, found.day, fight), fight }
}

/** The fight played on `field` to its end: its log, result, hires and the Orders' multiple on its spoils (every round's, as a Grand Battle's). */
function finished(fight: Skirmish, field: Field, log: Skirmish['log']): Skirmish {
  const spoils = log.reduce((m, r) => (r.order ? m * orderMods(r.order, r.target ?? {}, 0).spoils : m), 1)
  return { ...fight, begun: true, log, result: fieldResult(field), ...(field.hired > 0 ? { hired: field.hired } : {}), ...(spoils !== 1 ? { spoils } : {}) }
}

/** Plays the fight's next round with the player's Order (and target) and one optional swap; the last round sets its result. */
export function playFightRound(state: CampaignState, dayOf: ISODate, id: string, play: RoundPlay): SkirmishAction {
  const found = fightOf(state, dayOf, id)
  if (!found) return refused(state, 'unknownFight')
  if (found.fight.result !== undefined) return refused(state, 'fought')
  if (dayOf !== openDayOf(state)) return refused(state, 'notToday')
  const field = skirmishField(found.fight)
  const problem = playProblem(field, play)
  if (problem) return refused(state, problem)
  if (play.order && orderMods(play.order, play.target ?? {}, 0).hire.length > 0 && balance(state.purse) < HIRE_FEE * (field.hired + 1)) return refused(state, 'reputation')
  const played = playRoundOn(field, play)
  const log = [...found.fight.log, played.log]
  const fight = isOver(played.field) ? finished(found.fight, played.field, log) : { ...found.fight, begun: true, log }
  return { ok: true, state: withFight(state, found.day, fight), fight }
}

/** The Marshal plays a fight to its end from wherever it stands. */
function marshalFinish(fight: Skirmish): Skirmish {
  let field = skirmishField(fight)
  const log = [...fight.log]
  while (!isOver(field)) {
    const played = playRoundOn(field, marshalPlay(field))
    field = played.field
    log.push(played.log)
  }
  return finished(fight, field, log)
}

/** At the close: every fight of `day` begun and not finished, the Marshal finishes (fights never begun are left to the formula). */
export function finishSkirmishes(state: CampaignState, day: ISODate): CampaignState {
  const sd = skirmishDayOf(state, day)
  if (!sd || !sd.fights.some((f) => f.begun && f.result === undefined)) return state
  return withDay(state, { ...sd, fights: sd.fights.map((f) => (f.begun && f.result === undefined ? { ...marshalFinish(f), marshal: true } : f)) })
}

/** The simulator's player, and a test's: starts the day's fights and has the Marshal play every one. */
export function marshalAllFights(state: CampaignState, day: ISODate, valor: number): CampaignState {
  const started = startSkirmishes(state, day, valor)
  if (!started.ok || !started.day) return state
  return withDay(started.state, { ...started.day, fights: started.day.fights.map((f) => marshalFinish({ ...f, begun: true })) })
}

/** The matchup a fight's enemy is met by (Ch 10), for a formula comparison. */
export function matchupOf(plan: Pick<FightPlan, 'enemy'>): MatchupId {
  return plan.enemy.kind === 'rival' ? plan.enemy.rival : plan.enemy.kind
}
