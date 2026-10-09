/**
 * View models for the Grand Battle screen (T16; Ch 11, D-03, A-29, A-162, A-163): the notice
 * during the warning, preparation (the host as the Herald tells it, the companies, the formation,
 * the Doctrines, Readiness), the live field (lanes, intents with their exact effect, the Order
 * cards and what each can aim at, the round log), the result and its card, and replay frames
 * rebuilt from the stored log.
 *
 * Hidden stays hidden: before the battle the host is bands unless revealed (`hostView`). On the
 * field an enemy company's health shows as it falls, but its power only when the host roster is
 * revealed (A-182).
 */
import { CODEX } from '../codex'
import { diffDays } from '../clock'
import { numeral, realmEffects } from '../effects'
import {
  FREE_HIRE,
  battleOf,
  fieldOf,
  formationProblem,
  hostView,
  marshalFormation,
  pendingBattles,
  prepare,
  replay,
  result as battleResult,
  type HostView
} from '../grand'
import { LANES, SLOTS, isOver, laneOf, onField, orderNeeds, plannedIntents, rankOf, shares, validTargets, type Field } from '../grand/field'
import { hexName } from '../map'
import { RULES } from '../rules'
import { rosterDetail } from '../roster'
import { readinessValors } from '../settle'
import { openDayOf } from '../state'
import type { BattleLogLine, CampaignState, GrandBattle, GrandTrigger, Intent, ISODate, Lane, OrderTarget, RivalId, SlotKey } from '../types'
import { companyArt } from './realm'
import { amount, factor } from './refusals'
import { rivalName, rivalNames } from './shell'

const PERCENT = 100 // rules-ok: shares shown as percentages
const G = RULES.grandBattles

function pct(share: number): string {
  return `${Math.round(share * PERCENT)}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] // rules-ok: month names for display

/** A day as the screens print it ("Oct 13"). */
export function shortDay(day: ISODate): string {
  const [, m, d] = day.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

// ── Words for the field ──────────────────────────────────────────────────────

const TRIGGER_NAMES: Record<GrandTrigger, string> = {
  incursion: 'Incursion',
  gate: 'The Gate',
  capital: 'The Capital',
  mythicHunt: 'Mythic Hunt',
  warhost: 'The Warhost',
  coalitionOffensive: 'Coalition Offensive',
  siege: 'Siege of the Crown',
  event: 'Event battle'
}

/** What raised a battle, in plain words (an event battle by its event's name). */
export function triggerName(battle: Pick<GrandBattle, 'trigger' | 'eventId'>): string {
  if (battle.trigger === 'event') return CODEX.events.find((e) => e.id === battle.eventId)?.name ?? TRIGGER_NAMES.event
  return TRIGGER_NAMES[battle.trigger]
}

const INTENT_NAMES: Record<Intent, string> = { strike: 'Strike', charge: 'Charge', volley: 'Volley', brace: 'Brace', shift: 'Shift', spell: 'Spell' }

/** An intent's exact effect (Ch 11 "A round", D-03), for its tooltip. */
export function intentText(intent: Intent): string {
  const i = G.intents
  switch (intent) {
    case 'strike':
      return 'Strike: it deals its normal damage.'
    case 'charge':
      return `Charge: its front deals ×${factor(i.charge.deals)} and takes ×${factor(i.charge.takes)}.`
    case 'volley':
      return 'Volley: its ranged damage goes to your rear rank.'
    case 'brace':
      return `Brace: it deals ×${factor(i.brace.deals)} and takes ×${factor(i.brace.takes)}.`
    case 'shift':
      return 'Shift: it moves to a neighboring lane at the round’s end.'
    case 'spell':
      return `Spell: ${factor(i.spellShare)} × its power to both your companies in that lane.`
  }
}

export function intentName(intent: Intent): string {
  return INTENT_NAMES[intent]
}

type AnyEffect = { kind: string } & Record<string, unknown>

const TARGETS: Record<string, string> = {
  ownFronts: 'your fronts',
  laneFront: 'one lane’s front',
  lane: 'one lane',
  allCompanies: 'every company of yours',
  enemyCompany: 'one enemy company',
  enemyFronts: 'every enemy front',
  enemyLane: 'one enemy lane',
  centerFront: 'your center front',
  buildingCompany: 'its building’s company',
  enemyRear: 'the enemy rear'
}

const TAG_NAMES: Record<string, string> = { steel: 'Steel', coin: 'Coin', arcane: 'Arcane', engine: 'Engine' }

function times(mult: number): string {
  return mult < 1 ? `−${pct(1 - mult)}` : `+${pct(mult - 1)}`
}

/**
 * A codex effect in plain words (an Order, a Doctrine, an item, a Wing or an Elite's ability),
 * from its own values. `stage` is a Crossing Order's stage (Earthshatter's damage).
 */
export function effectText(e: AnyEffect, stage = 0): string {
  const target = typeof e.target === 'string' ? (TARGETS[e.target] ?? e.target) : undefined
  const mult = typeof e.mult === 'number' ? e.mult : 1
  const reach = e.reach === 'ranged' ? 'ranged ' : ''
  switch (e.kind) {
    case 'damageTaken':
      if (e.fromIntent) return `Takes ${times(mult)} from ${INTENT_NAMES[e.fromIntent as Intent]}s`
      if (e.against) return `Takes ${times(mult)} damage from ${e.against === 'mythic' ? 'mythics' : String(e.against)}`
      return target === 'one enemy company' ? `One enemy company takes ×${factor(mult)}` : `${capital(target ?? 'it')} take${target ? '' : 's'} ${times(mult)} damage`
    case 'damage':
      if (e.condition && typeof (e.condition as { ownHealthBelow?: number }).ownHealthBelow === 'number') return `Below ${pct((e.condition as { ownHealthBelow: number }).ownHealthBelow)} total health, all damage ×${factor(mult)}`
      if (target === 'one lane') return `One lane’s ${reach}companies deal ×${factor(mult)}`
      return `${capital(target ?? `your ${reach}companies`)} deal${target ? 's' : ''} ×${factor(mult)}`
    case 'heal':
      return target ? `${capital(target)} heals ${pct(Number(e.share))}` : `Heals ${pct(Number(e.share))} of its health each round`
    case 'noRout':
      return e.condition ? 'Cannot rout in round 1' : 'None of your companies can rout this round'
    case 'skipAction':
      return `One ${e.excludeMythic ? 'non-mythic ' : ''}enemy company skips its action`
    case 'spoils':
      return `+${pct(mult - 1)} spoils`
    case 'hire':
      return e.free ? 'One hired company free' : `Hire a company (${RULES.buildings.merchantHall.hiredBlades.costPerBattle}) into an empty slot`
    case 'cancelIntent':
      return `Cancel one enemy ${(e.intents as Intent[]).map((i) => INTENT_NAMES[i]).join(' or ')}`
    case 'revealIntents':
      return e.rounds === 'all' ? 'All four rounds’ intents shown at the start' : 'See the next round’s intents too'
    case 'directDamage': {
      const tp = e.tagPower as { tag: string; mult: number } | undefined
      if (tp) return `${factor(tp.mult)} × your total ${TAG_NAMES[tp.tag]} power to ${target ?? 'the enemy'}`
      const per = Number(e.perStage)
      return stage > 0 ? `${amount(per * stage)} damage to ${target ?? 'the enemy'}` : `${per} × the Crossing’s stage in damage to ${target ?? 'the enemy'}`
    }
    case 'ignoreIntent':
      return `Ignores enemy ${INTENT_NAMES[e.intent as Intent]}`
    case 'ignoreFortification':
      return 'Ignores fortification'
    case 'rangedHitsRear':
      return 'Your ranged also hit enemy rears'
    case 'health':
      return target ? `${capital(target)} ×${factor(mult)} health${e.in === 'grand' ? ' in Grand Battles' : ''}` : `${times(mult)} health${e.in === 'grand' ? ' in Grand Battles' : ''}`
    case 'moveEnemy':
      return 'Move one enemy company to another lane'
    case 'setIntent':
      return `One enemy lane’s intent becomes ${INTENT_NAMES[e.intent as Intent]}`
    case 'wallsAsHealth':
      return 'The castle’s walls are added as health to your center front'
    case 'splash':
      return `Its hits also strike ${target ?? 'the enemy rear'} at ${pct(Number(e.share))}`
    case 'power':
      if (e.add !== undefined) return `${target ? capital(target) : 'Its'} power +${amount(Number(e.add))}`
      return `${e.target === 'lane' ? 'Every company in its lane' : reach ? `Ranged companies` : 'Power'} ${times(mult)}`
    case 'addTag':
      return `Adds the ${TAG_NAMES[String(e.tag)]} tag`
    case 'match':
      return `×${factor(Number(e.set))} against ${e.against === 'beast' ? 'beasts' : String(e.against)}`
    case 'ignoreWeary':
      return 'Never Weary'
    case 'readiness':
      return `Readiness +${amount(Number(e.add))}${(e.limit as { per?: string } | undefined)?.per === 'month' ? ', once a month' : ''}`
    case 'immune':
      return 'Immune to its creature’s special'
    case 'grantDoctrine':
      return `The ${CODEX.doctrines.find((d) => d.id === e.doctrine)?.name ?? String(e.doctrine)} Doctrine`
    case 'foretell':
      return `${e.threat === 'raid' ? 'Raids' : 'Threats'}${e.road ? ` along the ${CODEX.buildings.find((b) => b.id === e.road)?.name ?? String(e.road)} road` : ''} foretold ${Number(e.days) === 1 ? 'a day' : `${String(e.days)} days`} earlier`
    case 'wearyDays':
      return Number(e.add) < 0 ? `Weary lasts ${-Number(e.add)} day${Number(e.add) === -1 ? '' : 's'} less` : `Weary lasts ${String(e.add)} more`
    case 'banners':
      return `${e.pool === 'assault' ? 'The assault pool fields' : 'Every battle fields'} ${String(e.add)} more banner${Number(e.add) === 1 ? '' : 's'}`
    case 'tithes':
      return `Tithes ${times(mult)}`
    case 'trust':
      return `Trust +${amount(Number(e.add))}`
    case 'cost':
      return `${capital((e.what as string[]).map((w) => (w === 'trade' ? 'trade prices' : w === 'items' ? 'items' : w === 'fortification' ? 'fortification' : w)).join(' and '))} ${times(mult)}`
    case 'reveal': {
      const what: Record<string, string> = { treasury: 'treasuries', army: 'armies', threatStrength: 'threat strengths', hostRoster: 'Grand Battle rosters' }
      return e.whom === 'neighbors' ? `Neighbors’ ${what[String(e.what)] ?? String(e.what)} shown as numbers` : `${capital(what[String(e.what)] ?? String(e.what))} always revealed`
    }
    case 'courtshipSlots':
      return `+${String(e.add)} courtship slot${Number(e.add) === 1 ? '' : 's'}`
    case 'interest':
      return `${pct(Number(e.rate))} weekly interest on the purse, up to ${String(e.cap)}`
    case 'respiteBank':
      return `Respite bank +${String(e.add)}`
    case 'eventHint':
      return 'One hint a month about an upcoming event'
    case 'mythicStrength':
      return `Mythic attacks ${times(mult)}`
    case 'ordersOffered':
      return `${String(e.set)} Orders offered instead of ${G.ordersOffered}`
    case 'readinessFloor':
      return `Readiness never below ${amount(Number(e.min))}`
    case 'itemSlots':
      return e.target === 'oneCompany' ? `One company gets ${Number(e.add) === 1 ? 'a third' : `${String(e.add)} more`} item slot` : `+${String(e.add)} item slot`
    case 'walls':
      return `Walls +${String(e.add)}`
    case 'dailyAssaults':
      return `+${String(e.add)} daily assault`
    case 'rallyFloor':
      return `Rally floor +${pct(Number(e.add))}`
    case 'reputationBonus':
      return `+${pct(Number(e.add))} reputation`
    default:
      return e.kind
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface OrderCard {
  id: string
  name: string
  text: string
  needs: { lane: boolean; unit: boolean; slot: boolean }
}

export function orderCard(id: string, stage = 0): OrderCard {
  const order = CODEX.orders.find((o) => o.id === id)
  return { id, name: order?.name ?? id, text: (order?.effects ?? []).map((e) => effectText(e as unknown as AnyEffect, stage)).join('; '), needs: orderNeeds(id) }
}

export function doctrineCard(id: string): { id: string; name: string; text: string } {
  const doctrine = CODEX.doctrines.find((d) => d.id === id)
  return { id, name: doctrine?.name ?? id, text: (doctrine?.effects ?? []).map((e) => effectText(e as unknown as AnyEffect)).join('; ') }
}

// ── The notice during the warning ────────────────────────────────────────────

export interface BattleNotice {
  battleId: string
  trigger: string
  hexId: string
  hexName: string
  battleDate: ISODate
  daysLeft: number
  /** Today is the battle day: "Fight now". */
  today: boolean
  label: string
}

/** Every Grand Battle announced and unfought, soonest first: "Battle at Ashfall in 2 days". */
export function battleNotices(state: CampaignState, today: ISODate = openDayOf(state)): BattleNotice[] {
  return pendingBattles(state).map((b) => {
    const days = Math.max(0, diffDays(today, b.battleDate))
    const where = hexName(b.hexId)
    return {
      battleId: b.id,
      trigger: triggerName(b),
      hexId: b.hexId,
      hexName: hexName(b.hexId),
      battleDate: b.battleDate,
      daysLeft: days,
      today: days === 0,
      label: days === 0 ? `${triggerName(b)} at ${where} today` : `${triggerName(b)} at ${where} in ${days === 1 ? '1 day' : `${days} days`}`
    }
  })
}

// ── Preparation ──────────────────────────────────────────────────────────────

export interface HostWords {
  /** The host as the Herald tells it: its size and strongest company against yours, and what it brings. */
  text: string
  revealed: boolean
  roster?: { name: string; power: number; reach: string }[]
  quarry?: string
  rivals: string
}

const SIZE_WORDS: Record<string, string> = { weaker: 'a small host', matched: 'a host matched with your own', stronger: 'a large host', overwhelming: 'an overwhelming host' }
const STRONGEST_WORDS: Record<string, string> = {
  weaker: 'no company stronger than your best',
  matched: 'its best company a match for yours',
  stronger: 'its best company stronger than yours',
  overwhelming: 'its best company far stronger than yours'
}

/** The enemy host in words (Ch 11 "Preparation"): bands, or the full roster when revealed. */
export function hostWords(view: HostView): HostWords {
  const kinds = [view.melee ? 'melee' : null, view.ranged ? 'ranged' : null].filter(Boolean).join(' and ')
  const quarry = view.quarry ? CODEX.quarries.find((q) => q.id === view.quarry)?.name : undefined
  const size = quarry ? SIZE_WORDS[view.size] : capital(SIZE_WORDS[view.size])
  return {
    text: `${quarry ? `${quarry}: ` : ''}${size}, ${kinds ? `${kinds} companies` : 'of some kind'}, ${STRONGEST_WORDS[view.strongest]}${view.commander ? ', with its commander' : ''}.`,
    revealed: view.revealed,
    ...(view.roster ? { roster: view.roster.map((c) => ({ name: c.name, power: c.power, reach: c.reach })) } : {}),
    ...(quarry ? { quarry } : {}),
    rivals: view.rivals.length > 0 ? rivalNames(view.rivals) : 'the wilds'
  }
}

export interface PrepCompany {
  id: string
  name: string
  power: number
  tags: string[]
  reach: string
  weary: boolean
  items: string[]
  art: string
  /** Where the current formation puts it. */
  slot?: SlotKey
}

export interface PreparationView {
  battleId: string
  trigger: string
  hexName: string
  battleDate: ISODate
  daysLeft: number
  canFight: boolean
  begun: boolean
  fought: boolean
  host: HostWords
  limit: number
  formation: Partial<Record<SlotKey, { id: string; name: string }>>
  /** The formation is the Marshal's pick until the player sets one. */
  marshalPick: boolean
  fielded: number
  problem?: { code: string; label: string }
  companies: PrepCompany[]
  doctrines: { id: string; name: string; text: string; chosen: boolean }[]
  freeHire: boolean
  readiness: { value: number; line: string }
}

const FORMATION_PROBLEMS: Record<string, string> = {
  tooMany: 'More companies than the battle allows.',
  duplicate: 'A company can stand in only one slot.',
  unknownCompany: 'A company in the formation is not on the roster.',
  empty: 'Place at least one company.',
  noFreeHire: 'A free hired company needs the Mercenary Contract.',
  badSlot: 'That is not a slot on the field.',
  allyUsed: 'The allied company already fought a Grand Battle this month.'
}

export function formationProblemLabel(code: string): string {
  return FORMATION_PROBLEMS[code] ?? 'This formation cannot be fielded.'
}

/** Readiness in one line (Ch 11, A-161). */
export function readinessLine(value: number, valors: readonly number[]): string {
  if (valors.length === 0) return `Readiness ${amount(value)}: no Valor recorded yet in the 7 days before the battle.`
  const average = valors.reduce((s, v) => s + v, 0) / valors.length
  return `Readiness ${amount(value)}, from an average Valor of ${pct(average)} over ${valors.length === G.readiness.valorDays ? 'the last 7 days' : `${valors.length} of the last 7 days`}.`
}

export function preparationView(state: CampaignState, battleId: string, today: ISODate = openDayOf(state)): PreparationView | null {
  const battle = battleOf(state, battleId)
  if (!battle) return null
  const valors = readinessValors(state, battle.battleDate)
  const prep = prepare(state, battleId, today, valors)
  if (!prep) return null
  const effects = realmEffects(state)
  const set = battle.formation
  const formation = set ?? marshalFormation(state, battle, battle.doctrine, effects)
  const names = new Map(prep.companies.map((c) => [c.company.id, c.company.name]))
  const problem = set ? formationProblem(state, battle, set, effects) : null
  const slotOfCompany = new Map(Object.entries(formation).map(([slot, id]) => [id, slot as SlotKey]))
  const detail = new Map(rosterDetail(state, { day: battle.battleDate }, effects).map((e) => [e.company.id, e]))
  return {
    battleId,
    trigger: triggerName(battle),
    hexName: hexName(battle.hexId),
    battleDate: battle.battleDate,
    daysLeft: Math.max(0, diffDays(today, battle.battleDate)),
    canFight: prep.canFight,
    begun: battle.setup !== undefined,
    fought: battle.result !== undefined,
    host: hostWords(hostView(state, battle, effects)),
    limit: prep.limit,
    formation: Object.fromEntries(Object.entries(formation).map(([slot, id]) => [slot, { id, name: id === FREE_HIRE ? 'Hired company (free)' : (names.get(id) ?? id) }])),
    marshalPick: !set,
    fielded: Object.values(formation).filter((id) => id !== FREE_HIRE).length,
    ...(problem ? { problem: { code: problem, label: formationProblemLabel(problem) } } : {}),
    companies: prep.companies.map(({ company, weary }) => ({
      id: company.id,
      name: company.name,
      power: company.power,
      tags: [...company.tags],
      reach: company.reach,
      weary,
      items: company.items.map((i) => CODEX.items.find((x) => x.id === i)?.name ?? i),
      art: companyArt(state, company.id, detail.get(company.id)?.company.source ?? 'building'),
      ...(slotOfCompany.has(company.id) ? { slot: slotOfCompany.get(company.id) } : {})
    })),
    doctrines: prep.doctrines.map((id) => ({ ...doctrineCard(id), chosen: battle.doctrine === id })),
    freeHire: prep.freeHire,
    readiness: { value: prep.readiness, line: readinessLine(prep.readiness, valors) }
  }
}

/** The formation with `companyId` in `slot` (moved from wherever it stood), or `slot` emptied when null. */
export function placeCompany(formation: Readonly<Record<string, string>>, slot: SlotKey, companyId: string | null): Record<string, string> {
  const out = Object.fromEntries(Object.entries(formation).filter(([s, id]) => s !== slot && id !== companyId))
  if (companyId) out[slot] = companyId
  return out
}

/** The formation with the companies in two slots exchanged (either may be empty). */
export function swapSlots(formation: Readonly<Record<string, string>>, a: SlotKey, b: SlotKey): Record<string, string> {
  const out = { ...formation }
  const [x, y] = [formation[a], formation[b]]
  delete out[a]
  delete out[b]
  if (y) out[a] = y
  if (x) out[b] = x
  return out
}

// ── The field ────────────────────────────────────────────────────────────────

export interface UnitView {
  id: string
  name: string
  side: 'player' | 'enemy'
  slot: SlotKey
  art: string
  /** The player's always; an enemy's only when the host roster is revealed. */
  power?: number
  hp: number
  maxHp: number
  tags: string[]
  reach: string
  routed: boolean
  status: ('weary' | 'petrified' | 'poisoned' | 'hired')[]
  /** An enemy's intent for the coming round. */
  intent?: Intent
}

export interface LaneIntent {
  lane: Lane
  intent?: Intent
  name?: string
  text?: string
}

export interface LogLine {
  from: string
  to: string
  /** The companies' ids (several can share a name). */
  fromId: string
  toId: string
  amount: number
  /** What made it (`spell`, `volley`, an Order's name …). */
  note?: string
  dealt?: number
}

export interface RoundView {
  round: number
  order?: string
  target?: string
  swap?: [string, string]
  intents: Partial<Record<Lane, Intent>>
  lines: LogLine[]
}

export interface OfferedCard extends OrderCard {
  targets: { target: OrderTarget; label: string }[]
}

export interface FieldView {
  battleId: string
  trigger: string
  hexName: string
  /** Rounds played, and how many there are. */
  round: number
  rounds: number
  over: boolean
  readiness: number
  units: UnitView[]
  /** The coming round's intents, lane by lane, with their exact effect. */
  lanes: LaneIntent[]
  /** Later rounds' intents, when a Doctrine or Order shows them. */
  later: { round: number; lanes: Partial<Record<Lane, Intent>> }[]
  offered: OfferedCard[]
  log: RoundView[]
  shares: { player: number; enemy: number }
  result?: 'rout' | 'victory' | 'defeat'
}

function unitName(field: Field, id: string): string {
  return field.units.find((u) => u.id === id)?.name ?? id
}

function enemyArt(unit: string | undefined, foe: RivalId | 'mythic' | undefined): string {
  if (!unit) return 'banner.neutral'
  return foe === 'mythic' ? `portrait.${unit}` : `company.${unit}.token`
}

/** The art slot of a company on the field: the player's from the roster, an enemy's from its codex unit. */
function unitArt(state: CampaignState, u: Field['units'][number]): string {
  if (u.side === 'enemy') return enemyArt(u.unit, u.foe)
  if (u.hired) return companyArt(state, 'merchantHall', 'building')
  const entry = rosterDetail(state, { day: openDayOf(state) }).find((e) => e.company.id === u.id)
  return companyArt(state, u.id, entry?.company.source ?? 'building')
}

function targetLabel(field: Field, target: OrderTarget | undefined): string | undefined {
  if (!target) return undefined
  const parts: string[] = []
  if (target.unit) parts.push(unitName(field, target.unit))
  if (target.lane) parts.push(`${target.lane} lane`)
  if (target.slot) parts.push(`the empty ${laneOf(target.slot)} ${rankOf(target.slot)}`)
  return parts.join(', ') || undefined
}

function roundView(field: Field, r: { round: number; order?: string; target?: OrderTarget; swap?: [string, string]; intents: Partial<Record<Lane, Intent>>; lines: BattleLogLine[] }): RoundView {
  const label = targetLabel(field, r.target)
  return {
    round: r.round,
    ...(r.order ? { order: CODEX.orders.find((o) => o.id === r.order)?.name ?? r.order } : {}),
    ...(label ? { target: label } : {}),
    ...(r.swap ? { swap: r.swap } : {}),
    intents: { ...r.intents },
    lines: r.lines.map((l) => ({ from: unitName(field, l.from), to: unitName(field, l.to), fromId: l.from, toId: l.to, amount: l.amount, ...(l.note ? { note: CODEX.orders.find((o) => o.id === l.note)?.name ?? l.note } : {}), ...(l.dealt !== undefined ? { dealt: l.dealt } : {}) }))
  }
}

/** The battle as it stands: who is where with what health, the coming round's intents and the Orders on offer. */
export function fieldView(state: CampaignState, battleId: string): FieldView | null {
  const battle = battleOf(state, battleId)
  const field = battle ? fieldOf(battle) : null
  if (!battle || !field) return null
  const revealed = realmEffects(state).reveals.hostRoster.whom !== 'none'
  const over = isOver(field)
  const next = field.round + 1
  const planned = over ? undefined : plannedIntents(field, next)
  const weary = new Set(rosterDetail(state, { day: battle.battleDate }).filter((e) => e.weary).map((e) => e.company.id))
  const units: UnitView[] = field.units.map((u) => {
    const status: UnitView['status'] = []
    if (u.side === 'player' && weary.has(u.id)) status.push('weary')
    if (field.petrified[u.id] === next) status.push('petrified')
    if (field.poisoned[u.id]) status.push('poisoned')
    if (u.hired) status.push('hired')
    const intent = planned?.units[u.id]
    return {
      id: u.id,
      name: u.name,
      side: u.side,
      slot: u.at,
      art: unitArt(state, u),
      ...(u.side === 'player' || revealed ? { power: u.power } : {}),
      hp: Math.max(0, u.hp),
      maxHp: u.health,
      tags: [...u.tags],
      reach: u.reach,
      routed: u.routed,
      status,
      ...(intent && u.side === 'enemy' && !u.routed ? { intent } : {})
    }
  })
  const lanes: LaneIntent[] = LANES.map((lane) => {
    const intent = planned?.lanes[lane]
    return intent ? { lane, intent, name: INTENT_NAMES[intent], text: intentText(intent) } : { lane }
  })
  const doctrine = CODEX.doctrines.find((d) => d.id === battle.doctrine)
  const seesAll = doctrine?.effects.some((e) => e.kind === 'revealIntents' && (e as { rounds?: unknown }).rounds === 'all') ?? false
  const later: FieldView['later'] = []
  if (seesAll && !over) for (let r = next + 1; r <= G.rounds; r++) later.push({ round: r, lanes: plannedIntents(field, r).lanes })
  const offered: OfferedCard[] = over
    ? []
    : (battle.setup?.deck ?? []).slice(field.round * (battle.setup?.offer ?? G.ordersOffered), next * (battle.setup?.offer ?? G.ordersOffered)).map((id) => ({
        ...orderCard(id, battle.setup?.orderStages[id] ?? 0),
        targets: validTargets(field, id).map((target) => ({ target, label: targetLabel(field, target) ?? '' }))
      }))
  const log = (battle.log ?? []).map((r) => roundView(field, r))
  const done = over ? battleResult(battle) : null
  return {
    battleId,
    trigger: triggerName(battle),
    hexName: hexName(battle.hexId),
    round: field.round,
    rounds: G.rounds,
    over,
    readiness: battle.setup?.readiness ?? 0,
    units,
    lanes,
    later,
    offered,
    log,
    shares: shares(field),
    ...(done ? { result: done.result } : over ? { result: shares(field).player > shares(field).enemy ? 'victory' : 'defeat' } : {})
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────

export interface ReplayFrame {
  /** 0 is the field as the battle began; n is after round n. */
  round: number
  hp: Record<string, number>
  slots: Record<string, SlotKey>
  routed: string[]
  /** The round that led here: its intents, Order and damage. */
  played?: RoundView
}

export interface ReplayView {
  battleId: string
  trigger: string
  hexName: string
  units: Omit<UnitView, 'hp' | 'routed' | 'intent' | 'slot'>[]
  frames: ReplayFrame[]
}

/** Every round of a stored battle as frames (Ch 11 rule 4), rebuilt from its setup and log: the same health as the live battle. */
export function replayView(state: CampaignState, battleId: string): ReplayView | null {
  const battle = battleOf(state, battleId)
  const rebuilt = battle ? replay(battle) : null
  const field = battle ? fieldOf(battle) : null
  if (!battle || !rebuilt || !field) return null
  const revealed = realmEffects(state).reveals.hostRoster.whom !== 'none'
  const start: ReplayFrame = {
    round: 0,
    hp: Object.fromEntries(rebuilt.setup.units.map((u) => [u.id, u.health])),
    slots: Object.fromEntries(rebuilt.setup.units.map((u) => [u.id, u.slot])),
    routed: []
  }
  const frames = [start]
  for (const r of rebuilt.rounds) {
    const hp = { ...(r.health ?? {}) }
    frames.push({ round: r.round, hp, slots: { ...(r.slots ?? {}) }, routed: Object.entries(hp).filter(([, v]) => v <= 0).map(([id]) => id), played: roundView(field, r) })
  }
  return {
    battleId,
    trigger: triggerName(battle),
    hexName: hexName(battle.hexId),
    units: field.units.map((u) => ({
      id: u.id,
      name: u.name,
      side: u.side,
      art: unitArt(state, u),
      ...(u.side === 'player' || revealed ? { power: u.power } : {}),
      maxHp: u.health,
      tags: [...u.tags],
      reach: u.reach,
      status: u.hired ? ['hired' as const] : []
    })),
    frames
  }
}

// ── The result ───────────────────────────────────────────────────────────────

const DECISIVE = new Set<GrandTrigger>(['gate', 'capital', 'siege', 'mythicHunt'])

export interface ResultView {
  battleId: string
  trigger: string
  hexName: string
  result: 'rout' | 'victory' | 'defeat'
  won: boolean
  /** Gate, Capital, Siege and Mythic Hunt results get the big-moment card. */
  decisive: boolean
  marshal: boolean
  shares: { player: number; enemy: number }
  /** What followed, in plain facts: spoils, Respect, a hex taken or returned, a trophy, Weary companies. */
  lines: string[]
  /** The card's heading (`herald.grandBattle.<result>`) with its facts, and its art. */
  titleId: string
  facts: { battle: string; hex: string }
  slot: string
}

/** A fought battle's result card, or null while it is unfought. */
export function resultView(state: CampaignState, battleId: string): ResultView | null {
  const battle = battleOf(state, battleId)
  const done = battle ? battleResult(battle) : null
  if (!battle || !done) return null
  const o = done.outcome
  const who = battle.members ? rivalNames(battle.members) : battle.rival ? rivalName(battle.rival) : undefined
  const roster = new Map(state.roster.map((c) => [c.id, c.name]))
  const lines: string[] = []
  if (o.spoils) lines.push(`Spoils +${amount(o.spoils)}`)
  if (o.reputation) lines.push(`+${amount(o.reputation)} reputation`)
  if (o.tribute) lines.push(`Tribute −${amount(o.tribute)}`)
  if (o.respect) lines.push(`Respect ${o.respect > 0 ? '+' : '−'}${amount(Math.abs(o.respect))}${who ? ` with ${who}` : ''}`)
  if (o.hexTaken) lines.push(`${hexName(o.hexTaken)} is yours`)
  if (o.hexLost) lines.push(`${hexName(o.hexLost)} passes to ${who ?? 'the enemy'}`)
  if (o.hexScorched) lines.push(`${hexName(o.hexScorched)} is scorched; rings 0 to 2 never fall`)
  if (o.trophy) lines.push(`Trophy: ${CODEX.items.find((i) => i.id === o.trophy)?.name ?? o.trophy}`)
  if (o.armyLoss) lines.push(`${who ?? 'The enemy'}’s army −${pct(o.armyLoss)}`)
  if (o.armyGain) lines.push(`${who ?? 'The enemy'}’s army +${pct(o.armyGain)}`)
  if (o.weary?.length) lines.push(`Weary through ${o.wearyUntil ? shortDay(o.wearyUntil) : 'a few days'}: ${o.weary.map((id) => roster.get(id) ?? id).join(', ')}`)
  if (o.retryFrom) lines.push(`It can be fought again from ${shortDay(o.retryFrom)}`)
  if (battle.trigger === 'siege' && done.result !== 'defeat') lines.push(`${who ?? 'The besieger'} is Humbled`)
  const won = done.result !== 'defeat'
  return {
    battleId,
    trigger: triggerName(battle),
    hexName: hexName(battle.hexId),
    result: done.result,
    won,
    decisive: DECISIVE.has(battle.trigger),
    marshal: done.marshal,
    shares: done.shares,
    lines,
    titleId: `herald.grandBattle.${done.result}`,
    facts: { battle: triggerName(battle), hex: hexName(battle.hexId) },
    slot: won ? 'moment.grandBattleWon' : 'moment.grandBattleLost'
  }
}

/** The slots a formation can use, in reading order (fronts first). */
export const FORMATION_SLOTS: readonly SlotKey[] = SLOTS

/** How many companies the battle may field, for the counter. */
export function companyCount(formation: Readonly<Record<string, string>>): number {
  return Object.values(formation).filter((id) => id !== FREE_HIRE).length
}

/** Numerals for round headings. */
export const roundNumeral = numeral

/** Whether the battle has begun and isn't over: the live field shows. */
export function inProgress(state: CampaignState, battleId: string): boolean {
  const battle = battleOf(state, battleId)
  const field = battle ? fieldOf(battle) : null
  return field !== null && !isOver(field) && battle?.result === undefined
}

/** The player's companies still standing, for the swap picker. */
export function standing(state: CampaignState, battleId: string): string[] {
  const battle = battleOf(state, battleId)
  const field = battle ? fieldOf(battle) : null
  return field ? onField(field, 'player').map((u) => u.id) : []
}
