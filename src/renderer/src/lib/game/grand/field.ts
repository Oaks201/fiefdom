/**
 * The Grand Battle field (Ch 11 "Units on the field" and "A round", D-03, E-03, A-29, A-47,
 * A-158 to A-161): one pure round engine that a live battle, the Marshal's autoplay and a
 * replay all run, and the one interpreter of every battle `Effect` in the codex (Orders,
 * Doctrines, Elite abilities, the Sworn, items, battle Wings, host and mythic specials).
 *
 * A battle is its `BattleSetup` (fixed when it begins) plus each round's play (the Order, its
 * target and the swap). `startField` and `playRound` rebuild everything from those, so a replay
 * of the stored log gives each round's health exactly. Nothing here draws randomness: the Order
 * deck is shuffled once when the battle begins, and every other choice is a fixed rule.
 *
 * A round (Ch 11): intents, the Order, one swap, the simultaneous exchange, rout and advance,
 * then enemy shifts and the Healer's Satchel. Front companies deal p × m × R to the opposing
 * front (or rear); ranged companies in the rear deal 0.8 × that; melee in the rear do nothing.
 * Enemies deal p × the intent multiplier with no tag match (A-29): Charge deals ×1.5 and takes
 * ×1.25 (D-03), Brace deals and takes ×0.5, Volley hits the rear, Spell hits both companies in
 * the lane for 0.5 × power, Shift moves to a neighboring lane at the round's end.
 */
import { CODEX, type QuarryEntry } from '../codex'
import { tagMatch } from '../combat'
import { RULES, type DeepReadonly } from '../rules'
import type {
  BattleLogLine,
  BattleRoundLog,
  BattleSetup,
  Effect,
  FieldUnit,
  Foe,
  Intent,
  Lane,
  MythicSpecial,
  OrderTarget,
  Rank,
  Reach,
  SlotKey,
  Tag,
  UnitMods
} from '../types'

// ── The field ────────────────────────────────────────────────────────────────

export const LANES: readonly Lane[] = ['left', 'center', 'right']
export const RANKS: readonly Rank[] = ['front', 'rear']
/** The order slots fill in: the center first, then left and right (the Marshal and enemy hosts). */
export const FILL_ORDER: readonly Lane[] = ['center', 'left', 'right']
/** Every slot, fronts first, left to right: the order units act in when order matters. */
export const SLOTS: readonly SlotKey[] = RANKS.flatMap((rank) => LANES.map((lane) => slotOf(lane, rank)))

export function slotOf(lane: Lane, rank: Rank): SlotKey {
  return `${lane}:${rank}`
}

export function laneOf(slot: SlotKey): Lane {
  return slot.slice(0, slot.indexOf(':')) as Lane
}

export function rankOf(slot: SlotKey): Rank {
  return slot.slice(slot.indexOf(':') + 1) as Rank
}

export function isSlot(value: string): value is SlotKey {
  return SLOTS.includes(value as SlotKey)
}

/** A company on the field during the battle. */
export interface LiveUnit extends FieldUnit {
  hp: number
  at: SlotKey
  routed: boolean
}

export interface Field {
  setup: BattleSetup
  units: LiveUnit[]
  /** Rounds completed. */
  round: number
  /** Companies that deal nothing in a round (the Basilisk's Petrify): unit id → that round. */
  petrified: Record<string, number>
  /** Lingering poison (the Manticore): unit id → damage a round, and the round it took hold. */
  poisoned: Record<string, { perRound: number; since: number }>
  /** Each side's starting health, the share's denominator (a hired company adds its own). */
  start: { player: number; enemy: number }
  /** Companies hired by Reserves, paid when the battle settles. */
  hired: number
}

export function startField(setup: BattleSetup): Field {
  const units = setup.units.map((u) => ({ ...u, hp: u.health, at: u.slot, routed: false }))
  const total = (side: FieldUnit['side']): number => units.filter((u) => u.side === side).reduce((s, u) => s + u.health, 0)
  return { setup, units, round: 0, petrified: {}, poisoned: {}, start: { player: total('player'), enemy: total('enemy') }, hired: 0 }
}

function cloneField(f: Field): Field {
  return { ...f, units: f.units.map((u) => ({ ...u })), petrified: { ...f.petrified }, poisoned: { ...f.poisoned }, start: { ...f.start } }
}

export function onField(f: Field, side?: FieldUnit['side']): LiveUnit[] {
  return f.units.filter((u) => !u.routed && (side === undefined || u.side === side))
}

export function unitAt(f: Field, side: FieldUnit['side'], slot: SlotKey): LiveUnit | undefined {
  return f.units.find((u) => !u.routed && u.side === side && u.at === slot)
}

/** Each side's remaining health as a share of its starting health. */
export function shares(f: Field): { player: number; enemy: number } {
  const left = (side: FieldUnit['side']): number => onField(f, side).reduce((s, u) => s + Math.max(0, u.hp), 0)
  return { player: f.start.player > 0 ? left('player') / f.start.player : 0, enemy: f.start.enemy > 0 ? left('enemy') / f.start.enemy : 0 }
}

/** The battle is over after the last round, or as soon as one side has no companies left. */
export function isOver(f: Field): boolean {
  return f.round >= RULES.grandBattles.rounds || onField(f, 'player').length === 0 || onField(f, 'enemy').length === 0
}

/** Ch 11: the higher remaining health share wins (a tie is not a win); a wipe, or twice the enemy's share, is a Rout. */
export function fieldResult(f: Field): 'rout' | 'victory' | 'defeat' {
  const s = shares(f)
  if (onField(f, 'player').length > 0 && onField(f, 'enemy').length === 0) return 'rout'
  if (s.player <= s.enemy) return 'defeat'
  return s.player >= RULES.grandBattles.routShareRatio * s.enemy ? 'rout' : 'victory'
}

// ── The interpreter: every battle effect in one place ────────────────────────

/** Which own or enemy companies a round effect touches, as they stand at the exchange. */
export interface Who {
  side: FieldUnit['side']
  lane?: Lane
  rank?: Rank
  unit?: string
  reach?: Reach
}

/** What the Order played this round does (Appendix C "Orders and Doctrines"). */
export interface RoundMods {
  damage: { who: Who; mult: number }[]
  taken: { who: Who; mult: number }[]
  heal: { who: Who; share: number }[]
  noRout: Who[]
  /** Enemy companies that skip their action (Bribe). */
  skip: string[]
  /** An enemy company's Spell or Volley is cancelled (Arcane Ward). */
  cancel: { unit: string; intents: Intent[] }[]
  direct: { who: Who; tagPower?: { tag: Tag; mult: number }; perStage?: number; flat?: number }[]
  ignoreBrace: boolean
  rangedHitsRear: boolean
  /** An enemy company moved to another lane before the exchange (Blink Strike). */
  move: { unit: string; lane: Lane }[]
  setIntent: { who: Who; intent: Intent }[]
  /** Empty slots a company is hired into (Reserves). */
  hire: SlotKey[]
  /** × on the battle's spoils if it is won (Spoils of War). */
  spoils: number
  /** Rounds of intents shown ahead (Foresight). */
  reveal: number
}

function roundMods(): RoundMods {
  return { damage: [], taken: [], heal: [], noRout: [], skip: [], cancel: [], direct: [], ignoreBrace: false, rangedHitsRear: false, move: [], setIntent: [], hire: [], spoils: 1, reveal: 0 }
}

/** What the battle's start takes from Doctrines and realm battle grants. */
export interface StartMods {
  /** × on the starting health of companies in these slots (Hold the Line, the Shield Forge). */
  health: { who: Who; mult: number }[]
  /** The castle's walls added as health to the center front (Engineered Fortress). */
  wallsAsHealth: boolean
  /** Hired companies that join free (Mercenary Contract). */
  freeHires: number
  lastStand?: { below: number; mult: number }
  /** Every round's intents shown at the start (Foreknowledge). */
  revealAll: boolean
}

export function startMods(): StartMods {
  return { health: [], wallsAsHealth: false, freeHires: 0, revealAll: false }
}

/** An enemy company's round, as its host's or quarry's specials shape it. */
export interface EnemyMods {
  intent?: Intent
  /** Lanes its Spell hits: its own (1), two (the Dragon's Fire) or all. */
  spellLanes?: number | 'all'
  specials: MythicSpecial[]
  poison?: number
}

/**
 * Who holds an effect, and where its interpretation goes:
 * - a company (its items, its Elite ability, the Sworn's): its `UnitMods` and starting health;
 * - the battle's start (a Doctrine or a realm battle grant such as the Shield Forge);
 * - a round (the Order played, aimed at `target`);
 * - an enemy company in a round (its host's or quarry's specials).
 */
export type Holder =
  | { kind: 'unit'; reach: Reach; mods: UnitMods; health: { mult: number } }
  | { kind: 'start'; mods: StartMods }
  | { kind: 'round'; target: OrderTarget; stage: number; mods: RoundMods }
  | { kind: 'enemy'; unit: string; round: number; mods: EnemyMods }

/** Where an effect does its work: on this field, in the roster (power, tags, Weary), or in the realm or daily combat. */
export type EffectUse = 'field' | 'roster' | 'realm'

/** The `Who` an Order's effect target names, given what the player aimed it at. */
function whoOf(e: Effect, t: OrderTarget): Who | null {
  const reach = e.reach ? { reach: e.reach } : {}
  switch (e.target) {
    case undefined:
    case 'allCompanies':
      return { side: 'player', ...reach }
    case 'ownFronts':
      return { side: 'player', rank: 'front', ...reach }
    case 'laneFront':
      return t.lane ? { side: 'player', lane: t.lane, rank: 'front', ...reach } : null
    case 'lane':
      return t.lane ? { side: 'player', lane: t.lane, ...reach } : null
    case 'centerFront':
      return { side: 'player', lane: 'center', rank: 'front', ...reach }
    case 'oneCompany':
    case 'company':
      return t.unit ? { side: 'player', unit: t.unit } : null
    case 'enemyCompany':
      return t.unit ? { side: 'enemy', unit: t.unit } : null
    case 'enemyLane':
      return t.lane ? { side: 'enemy', lane: t.lane } : null
    case 'enemyFronts':
      return { side: 'enemy', rank: 'front' }
    case 'enemyRear':
      return { side: 'enemy', rank: 'rear' }
    case 'buildingCompany':
    case 'realm':
      return null
  }
}

/** The `Who` a start effect names (Doctrines and realm grants): the slots it covers when the battle begins. */
function startWho(e: Effect): Who {
  if (e.target === 'ownFronts') return { side: 'player', rank: 'front' }
  if (e.target === 'centerFront') return { side: 'player', lane: 'center', rank: 'front' }
  return { side: 'player' }
}

function pushTaken(mods: UnitMods, entry: { mult: number; fromIntent?: Intent; against?: Foe }): void {
  mods.taken = [...(mods.taken ?? []), entry]
}

/**
 * Interprets one codex effect for `holder` and says where it does its work. Every effect kind is
 * listed: one that belongs to the roster, the realm or daily combat is acknowledged and left to
 * them; an unknown kind throws, so a codex entry this engine can't run fails loudly.
 */
export function interpret(e: DeepReadonly<Effect> | Effect, holder: Holder): EffectUse {
  const x = e as Effect
  if (x.in === 'daily') return 'realm'
  switch (x.kind) {
    // Power, tags and Weary live in the roster; a lane's power share lives on the field.
    case 'power':
      if (x.target === 'lane' && holder.kind === 'unit') {
        holder.mods.lanePower = (holder.mods.lanePower ?? 0) + ((x.mult ?? 1) - 1)
        return 'field'
      }
      return 'roster'
    case 'addTag':
    case 'ignoreWeary':
      return 'roster'
    case 'health':
      if (holder.kind === 'unit') holder.health.mult *= x.mult ?? 1
      else if (holder.kind === 'start') holder.mods.health.push({ who: startWho(x), mult: x.mult ?? 1 })
      else if (holder.kind === 'round') {
        // A round's "×2 health" (Phalanx): it takes damage as if it had twice its health.
        const who = whoOf(x, holder.target)
        if (who) holder.mods.taken.push({ who, mult: 1 / (x.mult ?? 1) })
      }
      return 'field'
    case 'damage':
      if (holder.kind === 'unit') {
        if (!x.reach || x.reach === holder.reach) holder.mods.damage = (holder.mods.damage ?? 1) * x.mult
      } else if (holder.kind === 'start') {
        if (x.condition?.ownHealthBelow !== undefined) holder.mods.lastStand = { below: x.condition.ownHealthBelow, mult: x.mult }
      } else if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) holder.mods.damage.push({ who, mult: x.mult })
      }
      return 'field'
    case 'damageTaken':
      if (holder.kind === 'unit') pushTaken(holder.mods, { mult: x.mult, ...(x.fromIntent ? { fromIntent: x.fromIntent } : {}), ...(x.against ? { against: x.against } : {}) })
      else if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) holder.mods.taken.push({ who, mult: x.mult })
      }
      return 'field'
    case 'match':
      if (holder.kind === 'unit') holder.mods.match = [...(holder.mods.match ?? []), { set: x.set, ...(x.against ? { against: x.against } : {}) }]
      return 'field'
    case 'heal':
      if (holder.kind === 'unit') holder.mods.heal = (holder.mods.heal ?? 0) + x.share
      else if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) holder.mods.heal.push({ who, share: x.share })
      }
      return 'field'
    case 'directDamage':
      if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) {
          holder.mods.direct.push({
            who,
            ...(x.tagPower ? { tagPower: x.tagPower } : {}),
            ...(x.perStage !== undefined ? { perStage: x.perStage * holder.stage } : {}),
            ...(x.flat !== undefined ? { flat: x.flat } : {})
          })
        }
      }
      return 'field'
    case 'splash':
      if (holder.kind === 'unit') holder.mods.splash = (holder.mods.splash ?? 0) + x.share
      return 'field'
    case 'readiness':
    case 'readinessFloor':
    case 'ordersOffered':
    case 'grantDoctrine':
      // Read when the battle begins (Readiness, the Order deck, the Doctrines on offer).
      return 'field'
    case 'wallsAsHealth':
      if (holder.kind === 'start') holder.mods.wallsAsHealth = true
      return 'field'
    case 'noRout':
      if (holder.kind === 'unit') {
        const every = Array.from({ length: RULES.grandBattles.rounds }, (_, i) => i + 1)
        holder.mods.noRoutRounds = [...(holder.mods.noRoutRounds ?? []), ...(x.condition?.rounds ?? every)]
      }
      else if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) holder.mods.noRout.push(who)
      }
      return 'field'
    case 'ignoreFortification':
      // Fortification is a daily-assault matter (the Sappers, Siegebreakers); there is none on the field.
      return 'realm'
    case 'ignoreIntent':
      if (x.intent === 'brace') {
        if (holder.kind === 'unit') holder.mods.ignoreBrace = true
        else if (holder.kind === 'round') holder.mods.ignoreBrace = true
      }
      return 'field'
    case 'cancelIntent':
      if (holder.kind === 'round' && holder.target.unit) holder.mods.cancel.push({ unit: holder.target.unit, intents: [...x.intents] })
      return 'field'
    case 'setIntent':
      if (holder.kind === 'round') {
        const who = whoOf(x, holder.target)
        if (who) holder.mods.setIntent.push({ who, intent: x.intent })
      }
      return 'field'
    case 'fixedIntent':
      if (holder.kind === 'enemy' && (!x.unit || x.unit === holder.unit) && (!x.condition?.rounds || x.condition.rounds.includes(holder.round))) {
        holder.mods.intent = x.intent
        if (x.lanes !== undefined) holder.mods.spellLanes = x.lanes
      }
      return 'field'
    case 'revealIntents':
      if (holder.kind === 'start' && x.rounds === 'all') holder.mods.revealAll = true
      else if (holder.kind === 'round') holder.mods.reveal = Math.max(holder.mods.reveal, x.rounds === 'all' ? RULES.grandBattles.rounds : x.rounds)
      return 'field'
    case 'skipAction':
      if (holder.kind === 'round' && holder.target.unit) holder.mods.skip.push(holder.target.unit)
      return 'field'
    case 'moveEnemy':
      if (holder.kind === 'round' && holder.target.unit && holder.target.lane) holder.mods.move.push({ unit: holder.target.unit, lane: holder.target.lane })
      return 'field'
    case 'rangedHitsRear':
      if (holder.kind === 'round') holder.mods.rangedHitsRear = true
      return 'field'
    case 'hire':
      if (holder.kind === 'start' && x.free) holder.mods.freeHires += 1
      else if (holder.kind === 'round' && holder.target.slot) holder.mods.hire.push(holder.target.slot)
      return 'field'
    case 'immune':
      if (holder.kind === 'unit') holder.mods.immune = [...(holder.mods.immune ?? []), x.special]
      return 'field'
    case 'mythicSpecial':
      if (holder.kind === 'enemy' && (!x.unit || x.unit === holder.unit)) {
        holder.mods.specials.push(x.special)
        if (x.lanes !== undefined) holder.mods.spellLanes = x.lanes
        if (x.damagePerRound !== undefined) holder.mods.poison = x.damagePerRound
      }
      return 'field'
    case 'spoils':
      if (holder.kind === 'unit') holder.mods.spoils = (holder.mods.spoils ?? 1) * x.mult
      else if (holder.kind === 'round') holder.mods.spoils *= x.mult
      return 'field'
    case 'rallyFloor':
    case 'walls':
    case 'wallsMult':
    case 'banners':
    case 'dailyAssaults':
    case 'mythicStrength':
    case 'raidStrength':
    case 'foretell':
    case 'reveal':
    case 'reputationBonus':
    case 'tithes':
    case 'tribute':
    case 'cost':
    case 'trust':
    case 'courtshipSlots':
    case 'respiteBank':
    case 'itemSlots':
    case 'interest':
    case 'eventHint':
    case 'wearyDays':
    case 'royalHunt':
    case 'grandIllusion':
      return 'realm'
    default: {
      const never: never = x
      throw new Error(`No battle rule for effect ${JSON.stringify(never)}`)
    }
  }
}

/** A company's own battle effects: its items, its Elite ability, the Sworn's. Codex ids are unique, so the company id finds them. */
export function ownBattleEffects(companyId: string, items: readonly string[]): DeepReadonly<Effect>[] {
  const out: DeepReadonly<Effect>[] = []
  for (const id of items) {
    const item = CODEX.items.find((i) => i.id === id)
    if (item) out.push(...item.effects.filter((x) => !x.target || x.target === 'company' || x.target === 'lane'))
  }
  const elite = CODEX.elites.find((e) => e.id === companyId)
  if (elite) out.push(...elite.ability)
  if (companyId === CODEX.sworn.id) out.push(...CODEX.sworn.ability)
  return out
}

/** A company's `UnitMods` and starting-health multiplier from its own effects. */
export function unitMods(companyId: string, items: readonly string[], reach: Reach): { mods: UnitMods; healthMult: number } {
  const holder: Holder = { kind: 'unit', reach, mods: {}, health: { mult: 1 } }
  for (const e of ownBattleEffects(companyId, items)) interpret(e, holder)
  return { mods: holder.mods, healthMult: holder.health.mult }
}

/** What an Order's effects make of a target, or null when the target doesn't fit them. */
export function orderMods(orderId: string, target: OrderTarget, stage: number): RoundMods {
  const order = CODEX.orders.find((o) => o.id === orderId)
  const holder: Holder = { kind: 'round', target, stage, mods: roundMods() }
  for (const e of order?.effects ?? []) interpret(e, holder)
  return holder.mods
}

// ── Enemy intents ────────────────────────────────────────────────────────────

/** The host or quarry an enemy company comes from, by its codex unit id. */
function sourceOf(unit: FieldUnit): { pattern: readonly Intent[]; specials: readonly DeepReadonly<Effect>[] } | null {
  if (unit.foe === 'mythic') {
    const quarry = CODEX.quarries.find((q) => q.roster.some((r) => r.id === unit.unit)) as DeepReadonly<QuarryEntry> | undefined
    return quarry ? { pattern: quarry.intentPattern, specials: quarry.specialEffects } : null
  }
  const host = CODEX.hosts.find((h) => h.rival === unit.foe)
  return host ? { pattern: host.intentPattern, specials: host.specials } : null
}

/** An enemy company's planned round from its pattern and specials (A-158), before any Order. */
export function enemyRound(unit: FieldUnit, round: number): EnemyMods & { intent: Intent } {
  const source = sourceOf(unit)
  const mods: EnemyMods = { specials: [] }
  const holder: Holder = { kind: 'enemy', unit: unit.unit ?? '', round, mods }
  for (const e of source?.specials ?? []) interpret(e, holder)
  const intent = mods.intent ?? source?.pattern[round - 1] ?? 'strike'
  return { ...mods, intent }
}

function matches(u: LiveUnit, who: Who): boolean {
  if (u.side !== who.side) return false
  if (who.unit !== undefined && u.id !== who.unit) return false
  if (who.lane !== undefined && laneOf(u.at) !== who.lane) return false
  if (who.rank !== undefined && rankOf(u.at) !== who.rank) return false
  if (who.reach !== undefined && u.reach !== who.reach) return false
  return true
}

export interface PlannedIntents {
  /** Each enemy company's intent this round. */
  units: Record<string, Intent>
  /** Each lane's shown intent: its front's (or its rear's). */
  lanes: Partial<Record<Lane, Intent>>
  specials: Record<string, EnemyMods>
}

/** The round's enemy intents on the field as it stands, with Confusion's Brace applied when given. */
export function plannedIntents(f: Field, round: number, mods?: RoundMods): PlannedIntents {
  const units: Record<string, Intent> = {}
  const specials: Record<string, EnemyMods> = {}
  for (const u of onField(f, 'enemy')) {
    const planned = enemyRound(u, round)
    let intent = planned.intent
    for (const s of mods?.setIntent ?? []) if (matches(u, s.who)) intent = s.intent
    units[u.id] = intent
    specials[u.id] = planned
  }
  const lanes: Partial<Record<Lane, Intent>> = {}
  for (const lane of LANES) {
    const shown = unitAt(f, 'enemy', slotOf(lane, 'front')) ?? unitAt(f, 'enemy', slotOf(lane, 'rear'))
    if (shown) lanes[lane] = units[shown.id]
  }
  return { units, lanes, specials }
}

// ── Orders: what each needs, and what the round offers ───────────────────────

/** The Orders this round deals from the deck (Appendix C: never repeated within a battle). */
export function offeredOn(setup: BattleSetup, round: number): string[] {
  return setup.deck.slice((round - 1) * setup.offer, round * setup.offer)
}

export interface OrderNeeds {
  lane: boolean
  unit: boolean
  slot: boolean
}

/** What a player must choose to play an Order: a lane, an enemy company, an empty slot. */
export function orderNeeds(orderId: string): OrderNeeds {
  const order = CODEX.orders.find((o) => o.id === orderId)
  const needs: OrderNeeds = { lane: false, unit: false, slot: false }
  for (const e of order?.effects ?? []) {
    if (e.target === 'laneFront' || e.target === 'lane' || e.target === 'enemyLane' || e.kind === 'moveEnemy') needs.lane = true
    if (e.target === 'enemyCompany') needs.unit = true
    if (e.kind === 'hire' && !e.free) needs.slot = true
  }
  return needs
}

/** Every target an Order can be aimed at this round (each lane, enemy company and empty slot it allows). */
export function validTargets(f: Field, orderId: string): OrderTarget[] {
  const needs = orderNeeds(orderId)
  const order = CODEX.orders.find((o) => o.id === orderId)
  const effects = order?.effects ?? []
  const round = f.round + 1
  const intents = plannedIntents(f, round)
  const units = onField(f, 'enemy').filter((u) =>
    effects.every((e) => {
      if (e.kind === 'skipAction' && e.excludeMythic) return u.foe !== 'mythic'
      if (e.kind === 'cancelIntent') return e.intents.includes(intents.units[u.id])
      return true
    })
  )
  const slots = SLOTS.filter((s) => !unitAt(f, 'player', s))
  const lanes = [...LANES]
  let out: OrderTarget[] = [{}]
  if (needs.unit) out = out.flatMap((t) => units.map((u) => ({ ...t, unit: u.id })))
  if (needs.lane) {
    // Blink Strike moves its enemy to another lane than its own.
    const moving = effects.some((e) => e.kind === 'moveEnemy')
    const laneOfUnit = (id: string | undefined): Lane | undefined => {
      const u = f.units.find((x) => x.id === id)
      return u ? laneOf(u.at) : undefined
    }
    out = out.flatMap((t) => lanes.filter((l) => !moving || l !== laneOfUnit(t.unit)).map((lane) => ({ ...t, lane })))
  }
  if (needs.slot) out = out.flatMap((t) => slots.map((slot) => ({ ...t, slot })))
  return out
}

/** Why a target doesn't fit an Order this round, or null when it does. */
export function targetProblem(f: Field, orderId: string, target: OrderTarget): string | null {
  const valid = validTargets(f, orderId)
  const same = (a: OrderTarget, b: OrderTarget): boolean => a.lane === b.lane && a.unit === b.unit && a.slot === b.slot
  const clean: OrderTarget = {}
  const needs = orderNeeds(orderId)
  if (needs.lane && target.lane) clean.lane = target.lane
  if (needs.unit && target.unit) clean.unit = target.unit
  if (needs.slot && target.slot) clean.slot = target.slot
  if (valid.some((v) => same(v, clean))) return null
  if (needs.unit && !target.unit) return 'needsUnit'
  if (needs.lane && !target.lane) return 'needsLane'
  if (needs.slot && !target.slot) return 'needsSlot'
  return 'badTarget'
}

/** The target as the Order uses it: only the choices it needs. */
export function cleanTarget(orderId: string, target: OrderTarget | undefined): OrderTarget {
  const needs = orderNeeds(orderId)
  const out: OrderTarget = {}
  if (needs.lane && target?.lane) out.lane = target.lane
  if (needs.unit && target?.unit) out.unit = target.unit
  if (needs.slot && target?.slot) out.slot = target.slot
  return out
}

// ── A round ──────────────────────────────────────────────────────────────────

export interface RoundPlay {
  order?: string
  target?: OrderTarget
  swap?: [SlotKey, SlotKey]
}

const RULE = RULES.grandBattles

/** Moves a company to `slot`, swapping with whoever of its side stands there. */
function moveTo(f: Field, unit: LiveUnit, slot: SlotKey): void {
  const other = unitAt(f, unit.side, slot)
  if (other && other !== unit) other.at = unit.at
  unit.at = slot
}

/** Rear companies step up into empty fronts (Ch 11 step 5). */
function advance(f: Field): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const lane of LANES) {
      if (unitAt(f, side, slotOf(lane, 'front'))) continue
      const rear = unitAt(f, side, slotOf(lane, 'rear'))
      if (rear) rear.at = slotOf(lane, 'front')
    }
  }
}

function laneHealth(f: Field, side: FieldUnit['side'], lane: Lane): number {
  return onField(f, side)
    .filter((u) => laneOf(u.at) === lane)
    .reduce((s, u) => s + Math.max(0, u.hp), 0)
}

/** The neighboring lanes of `lane`, in the order a tie goes. */
function neighborsOf(lane: Lane): Lane[] {
  return lane === 'center' ? ['left', 'right'] : ['center']
}

/** Where a shifting company goes: the neighbor whose player front is weakest (A-160); the Hounds go to the weakest lane. */
function shiftTarget(f: Field, unit: LiveUnit, toWeakest: boolean): Lane {
  const lane = laneOf(unit.at)
  const pool = toWeakest ? [...LANES] : neighborsOf(lane)
  let best = pool[0]
  for (const l of pool) if (laneHealth(f, 'player', l) < laneHealth(f, 'player', best)) best = l
  return best
}

/** The lanes an enemy Spell hits: its own, two (its own and the neighbor with the most player health), or all. */
function spellLanes(f: Field, unit: LiveUnit, lanes: number | 'all' | undefined): Lane[] {
  const own = laneOf(unit.at)
  if (lanes === 'all') return [...LANES]
  if (lanes === undefined || lanes <= 1) return [own]
  const others = neighborsOf(own)
  let best = others[0]
  for (const l of others) if (laneHealth(f, 'player', l) > laneHealth(f, 'player', best)) best = l
  return [own, best]
}

function foeKind(unit: FieldUnit): Foe {
  return unit.foe === 'mythic' ? 'mythic' : 'rival'
}

/** A player company's match against an enemy: its tags against the enemy's type, unless an item sets it. */
function matchAgainst(u: LiveUnit, enemy: FieldUnit): number {
  const matchup = CODEX.matchups[enemy.foe ?? 'mythic']
  let m = tagMatch(u.tags, matchup)
  for (const x of u.mods?.match ?? []) if (!x.against || x.against === foeKind(enemy)) m = x.set
  return m
}

/**
 * Plays one round on the field: the Order and its target, the swap, the exchange, rout and
 * advance, shifts and round-end healing. Returns the next field and the round's log. The play
 * must already be valid (`playProblem`).
 */
export function playRoundOn(input: Field, play: RoundPlay): { field: Field; log: BattleRoundLog } {
  const f = cloneField(input)
  const round = f.round + 1
  const R = f.setup.readiness
  const offered = offeredOn(f.setup, round)
  const target = play.order ? cleanTarget(play.order, play.target) : {}
  const mods = play.order ? orderMods(play.order, target, f.setup.orderStages[play.order] ?? 0) : roundMods()

  // 2. The Order: hires, an enemy moved, heals before the exchange.
  for (const slot of mods.hire) {
    const id = `hired:${round}`
    const health = RULE.healthPerPower * f.setup.hire.power
    f.units.push({ id, side: 'player', name: f.setup.hire.name, power: f.setup.hire.power, health, tags: [RULES.rivals.hired.tag], reach: RULES.rivals.hired.reach, slot, hired: true, hp: health, at: slot, routed: false })
    f.start.player += health
    f.hired += 1
  }
  for (const m of mods.move) {
    const unit = f.units.find((u) => u.id === m.unit && !u.routed)
    if (unit) moveTo(f, unit, slotOf(m.lane, rankOf(unit.at)))
  }
  if (mods.move.length > 0) advance(f)
  for (const h of mods.heal) {
    for (const u of onField(f, 'player')) if (matches(u, h.who)) u.hp = Math.min(u.health, u.hp + h.share * u.health)
  }

  // 3. The swap.
  if (play.swap) {
    const [a, b] = play.swap
    const ua = unitAt(f, 'player', a)
    const ub = unitAt(f, 'player', b)
    if (ua) moveTo(f, ua, b)
    else if (ub) moveTo(f, ub, a)
  }

  // 1. Intents, as they stand now (Confusion applied).
  const planned = plannedIntents(f, round, mods)
  const skipped = new Set(mods.skip)
  for (const c of mods.cancel) if (c.intents.includes(planned.units[c.unit])) skipped.add(c.unit)

  // 4. The exchange, simultaneous: every hit is computed on the field as it stands, then applied.
  const lines: BattleLogLine[] = []
  /** A hit of `dealt`, taken at `taken` × (the target's own multipliers). */
  const hit = (from: string, to: LiveUnit, dealt: number, taken: number, note?: string): void => {
    const amount = dealt * taken
    if (amount <= 0) return
    lines.push({ from, to: to.id, amount, ...(note ? { note } : {}), ...(taken !== 1 ? { dealt } : {}) })
  }
  const share = shares(f)
  const lastStand = f.setup.lastStand && share.player < f.setup.lastStand.below ? f.setup.lastStand.mult : 1
  const charge = RULE.intents.charge
  const brace = RULE.intents.brace

  const enemyTaken = (t: LiveUnit, ignoreBrace: boolean): number => {
    let mult = 1
    const intent = skipped.has(t.id) ? undefined : planned.units[t.id]
    if (intent === 'charge' && rankOf(t.at) === 'front') mult *= charge.takes
    if (intent === 'brace' && !ignoreBrace) mult *= brace.takes
    for (const r of mods.taken) if (matches(t, r.who)) mult *= r.mult
    return mult
  }
  const playerTaken = (t: LiveUnit, from: LiveUnit, intent: Intent): number => {
    let mult = 1
    for (const r of mods.taken) if (matches(t, r.who)) mult *= r.mult
    for (const x of t.mods?.taken ?? []) {
      if ((x.fromIntent === undefined || x.fromIntent === intent) && (x.against === undefined || x.against === foeKind(from))) mult *= x.mult
    }
    return mult
  }
  const lanePower = (u: LiveUnit): number => {
    const lane = laneOf(u.at)
    return 1 + onField(f, u.side).reduce((s, o) => s + (laneOf(o.at) === lane ? (o.mods?.lanePower ?? 0) : 0), 0)
  }

  for (const u of onField(f, 'player')) {
    if (f.petrified[u.id] === round) continue
    const lane = laneOf(u.at)
    const rear = rankOf(u.at) === 'rear'
    if (rear && u.reach !== 'ranged') continue
    const front = unitAt(f, 'enemy', slotOf(lane, 'front'))
    const back = unitAt(f, 'enemy', slotOf(lane, 'rear'))
    const t = front ?? back
    if (!t) continue
    let mult = (u.mods?.damage ?? 1) * lastStand
    for (const r of mods.damage) if (matches(u, r.who)) mult *= r.mult
    const ignoreBrace = mods.ignoreBrace || u.mods?.ignoreBrace === true
    const base = u.power * lanePower(u) * R * (rear ? RULE.rangedMult : 1) * mult
    hit(u.id, t, base * matchAgainst(u, t), enemyTaken(t, ignoreBrace))
    if (back && back !== t) {
      if (mods.rangedHitsRear && u.reach === 'ranged') hit(u.id, back, base * matchAgainst(u, back), enemyTaken(back, ignoreBrace), 'barrage')
      if (u.mods?.splash) hit(u.id, back, base * matchAgainst(u, back) * u.mods.splash, enemyTaken(back, ignoreBrace), 'splash')
    }
  }

  for (const d of mods.direct) {
    const arcane = d.tagPower ? onField(f, 'player').filter((u) => u.tags.includes(d.tagPower!.tag)).reduce((s, u) => s + u.power, 0) * d.tagPower.mult : 0
    const amount = arcane + (d.perStage ?? 0) + (d.flat ?? 0)
    for (const t of onField(f, 'enemy')) if (matches(t, d.who)) hit(play.order as string, t, amount, enemyTaken(t, mods.ignoreBrace), play.order)
  }

  const petrify: string[] = []
  const poison: { unit: string; perRound: number }[] = []
  for (const e of onField(f, 'enemy')) {
    if (skipped.has(e.id)) continue
    const intent = planned.units[e.id]
    const special = planned.specials[e.id]
    const immune = (t: LiveUnit, s: MythicSpecial): boolean => special.specials.includes(s) && (t.mods?.immune ?? []).includes(s)
    if (intent === 'spell') {
      for (const lane of spellLanes(f, e, special.spellLanes)) {
        for (const t of onField(f, 'player').filter((p) => laneOf(p.at) === lane)) {
          if (immune(t, 'fire')) continue
          hit(e.id, t, e.power * RULE.intents.spellShare, playerTaken(t, e, intent), 'spell')
          if (special.specials.includes('petrify') && !immune(t, 'petrify')) petrify.push(t.id)
        }
      }
      continue
    }
    const lane = laneOf(e.at)
    const rear = rankOf(e.at) === 'rear'
    if (rear && e.reach !== 'ranged') continue
    const pFront = unitAt(f, 'player', slotOf(lane, 'front'))
    const pRear = unitAt(f, 'player', slotOf(lane, 'rear'))
    const t = intent === 'volley' ? (pRear ?? pFront) : (pFront ?? pRear)
    if (!t) continue
    if (intent === 'volley' && immune(t, 'broodVolley')) continue
    let deals = 1
    if (intent === 'charge' && !rear && !immune(t, 'griffinDive')) deals = charge.deals
    if (intent === 'brace') deals = brace.deals
    hit(e.id, t, e.power * (rear ? RULE.rangedMult : 1) * deals, playerTaken(t, e, intent), intent === 'volley' ? 'volley' : undefined)
    if (intent === 'volley' && special.poison !== undefined && special.specials.includes('poison') && !immune(t, 'poison')) poison.push({ unit: t.id, perRound: special.poison })
  }

  for (const [id, p] of Object.entries(f.poisoned)) {
    const t = f.units.find((u) => u.id === id && !u.routed)
    if (t && p.since < round) hit('poison', t, p.perRound, 1, 'poison')
  }

  for (const line of lines) {
    const t = f.units.find((u) => u.id === line.to) as LiveUnit
    t.hp -= line.amount
  }

  // 5. Rout and advance. Hold Fast and the Sworn's first round keep a company on the field at 0.
  for (const u of f.units) {
    if (u.routed || u.hp > 0) continue
    const held = u.side === 'player' && (mods.noRout.some((w) => matches(u, w)) || (u.mods?.noRoutRounds ?? []).includes(round))
    u.hp = 0
    if (!held) u.routed = true
  }
  advance(f)

  // Shifts at the round's end: Shift intents, the Griffins every round, the Hounds to the weakest lane.
  const moved = new Set<string>()
  for (const slot of SLOTS) {
    const e = unitAt(f, 'enemy', slot)
    if (!e || moved.has(e.id) || skipped.has(e.id)) continue
    const special = planned.specials[e.id]
    const weakest = special?.specials.includes('huntTheWeak') ?? false
    const shifts = planned.units[e.id] === 'shift' || weakest || (special?.specials.includes('griffinDive') ?? false)
    if (!shifts) continue
    const lane = shiftTarget(f, e, weakest)
    if (lane !== laneOf(e.at)) moveTo(f, e, slotOf(lane, rankOf(e.at)))
    moved.add(e.id)
  }
  advance(f)

  // Round-end healing (the Healer's Satchel), then marks for the next round.
  for (const u of onField(f, 'player')) if (u.mods?.heal) u.hp = Math.min(u.health, u.hp + u.mods.heal * u.health)
  for (const id of petrify) f.petrified[id] = round + 1
  for (const p of poison) if (!f.poisoned[p.unit]) f.poisoned[p.unit] = { perRound: p.perRound, since: round }

  f.round = round
  const log: BattleRoundLog = {
    round,
    intents: planned.lanes,
    unitIntents: planned.units,
    offered,
    lines,
    health: Object.fromEntries(f.units.map((u) => [u.id, u.routed ? 0 : u.hp])),
    slots: Object.fromEntries(onField(f).map((u) => [u.id, u.at]))
  }
  if (play.order) log.order = play.order
  if (play.order && Object.keys(target).length > 0) log.target = target
  if (play.swap) log.swap = play.swap
  return { field: f, log }
}

/** Why a play can't be made this round, or null. */
export function playProblem(f: Field, play: RoundPlay): string | null {
  if (isOver(f)) return 'battleOver'
  if (play.order) {
    if (!offeredOn(f.setup, f.round + 1).includes(play.order)) return 'notOffered'
    const problem = targetProblem(f, play.order, play.target ?? {})
    if (problem) return problem
  }
  if (play.swap) {
    const [a, b] = play.swap
    if (!isSlot(a) || !isSlot(b) || a === b) return 'badSwap'
    if (!unitAt(f, 'player', a) && !unitAt(f, 'player', b)) return 'badSwap'
  }
  return null
}

/** Rebuilds a battle from its setup and logged plays: the field after each round. */
export function replayField(setup: BattleSetup, log: readonly BattleRoundLog[]): { field: Field; rounds: BattleRoundLog[] } {
  let field = startField(setup)
  const rounds: BattleRoundLog[] = []
  for (const r of log) {
    const played = playRoundOn(field, { ...(r.order ? { order: r.order } : {}), ...(r.target ? { target: r.target } : {}), ...(r.swap ? { swap: r.swap as [SlotKey, SlotKey] } : {}) })
    field = played.field
    rounds.push(played.log)
  }
  return { field, rounds }
}

// ── The Marshal (Ch 11 rule 1) ───────────────────────────────────────────────

function damageDealt(log: BattleRoundLog, f: Field): number {
  const enemies = new Set(f.units.filter((u) => u.side === 'enemy').map((u) => u.id))
  return log.lines.filter((l) => enemies.has(l.to)).reduce((s, l) => s + l.amount, 0)
}

/** The Marshal's play: of the Orders offered, the one (and target) with the highest immediate damage; no swap. */
export function marshalPlay(f: Field): RoundPlay {
  let best: RoundPlay = {}
  let bestDamage = damageDealt(playRoundOn(f, {}).log, f)
  for (const order of offeredOn(f.setup, f.round + 1)) {
    for (const target of validTargets(f, order)) {
      const damage = damageDealt(playRoundOn(f, { order, target }).log, f)
      if (damage > bestDamage || (best.order === undefined && damage >= bestDamage)) {
        best = { order, target }
        bestDamage = damage
      }
    }
  }
  return best
}
