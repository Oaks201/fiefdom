/**
 * The codex: the game's content as data (Appendix C, plus the building and Crossing company
 * names from Ch 7 and Ch 8), loaded from `src/renderer/src/data/codex/*.json` with types.
 *
 * Entry-specific numbers (an item's cost, an Elite's power) live here. Global numbers live in
 * `rules.ts`. Never both. What an entry does is a list of `Effect`s that T07 and T12 interpret.
 * `validateCodex()` checks the files hang together; `npm run check:game` runs it.
 */
import companiesJson from '../../data/codex/companies.json'
import crossingsJson from '../../data/codex/crossings.json'
import elitesJson from '../../data/codex/elites.json'
import itemsJson from '../../data/codex/items.json'
import wingsJson from '../../data/codex/wings.json'
import ordersJson from '../../data/codex/orders.json'
import doctrinesJson from '../../data/codex/doctrines.json'
import hostsJson from '../../data/codex/hosts.json'
import mythicsJson from '../../data/codex/mythics.json'
import ritualsJson from '../../data/codex/rituals.json'
import eventsJson from '../../data/codex/events.json'
import rivalsJson from '../../data/codex/rivals.json'
import { RULES, deepFreeze, type DeepReadonly } from './rules'
import { RIVAL_MOMENTS } from './text'
import {
  BUILDING_IDS,
  COST_KINDS,
  FOES,
  FRONT_IDS,
  LANDS,
  REVEAL_KINDS,
  RIVAL_IDS,
  type BuildingId,
  type CrossingId,
  type Effect,
  type EffectKind,
  type EffectTarget,
  type FrontId,
  type Intent,
  type Land,
  type MythicSpecial,
  type Reach,
  type RivalId,
  type Tag
} from './types'

// ── Entry types ──────────────────────────────────────────────────────────────

export interface BuildingEntry {
  id: BuildingId
  name: string
  tag: Tag
}

/** A building's company at one tier, or the Crownguard. Power comes from `rules.ts`. */
export interface CompanyEntry {
  id: string
  name: string
  source: 'building' | 'crownguard'
  building?: BuildingId
  tier?: number
  tags: Tag[]
  reach: Reach
}

/** A Crossing's hybrid company at one stage. Power comes from `rules.ts`. */
export interface HybridEntry {
  id: string
  name: string
  stage: number
  reach: Reach
}

export interface PerkEntry {
  id: string
  name: string
  /** 2 for the Brotherhood perk, 3 for the Legend perk. */
  stage: number
  /** One of the three perks rewritten for version 2's land rules. */
  v2?: boolean
  /** A perk this one replaces rather than stacks with (A-31). */
  replaces?: string
  effects: Effect[]
}

export interface CrossingEntry {
  id: CrossingId
  name: string
  buildings: [BuildingId, BuildingId]
  /** The between-land the pair shares, or null for the two opposite pairs. */
  land: Land | null
  tags: Tag[]
  hybrids: HybridEntry[]
  perks: PerkEntry[]
}

export interface EliteEntry {
  id: string
  name: string
  building: BuildingId
  tags: Tag[]
  reach: Reach
  /** Power at rank I and rank II. */
  power: number[]
  ability: Effect[]
}

/** The Sworn, the lord's retinue (Milestone 7): two tags chosen once (A-21). */
export interface SwornEntry {
  id: string
  name: string
  tagCount: number
  reach: Reach
  power: number
  ability: Effect[]
}

export type ItemRank = 'I' | 'II' | 'III' | 'legendary' | 'trophy'

export interface ItemEntry {
  id: string
  name: string
  rank: ItemRank
  /** Null for trophies, which are never sold. */
  cost: number | null
  /** The building a Legendary item belongs to. */
  building?: BuildingId
  /** The Mythic Hunt quarry a trophy comes from. */
  quarry?: string
  effects: Effect[]
}

export interface WingEntry {
  id: string
  name: string
  building: BuildingId
  /** 1, 2 or 3: the first, second or third Wings (Milestones in `RULES.milestones.unlocks.wings`). */
  wave: number
  effects: Effect[]
}

/** What grants an Order or a Doctrine. */
export type CodexSource =
  | { kind: 'building'; id: BuildingId; tier: number }
  | { kind: 'crossing'; id: CrossingId; stage: number }
  | { kind: 'wing'; id: string }

export interface OrderEntry {
  id: string
  name: string
  source: CodexSource
  /** What it does for the round it is played. */
  effects: Effect[]
}

export interface DoctrineEntry {
  id: string
  name: string
  source: CodexSource
  /** What it does for the whole battle. */
  effects: Effect[]
}

/** A rival host company, a commander or a mythic. All count as their side's type for matching. */
export interface HostUnitEntry {
  id: string
  name: string
  power: number
  reach: Reach
}

export interface HostEntry {
  rival: RivalId
  companies: HostUnitEntry[]
  commander: HostUnitEntry
  /** The intent each lane shows, by round. */
  intentPattern: Intent[]
  /** Units that break the pattern. */
  specials: Effect[]
}

/** Enemy types for matching (Ch 10): the tags they are weak to (×1.5) and resist (×0.6). */
export type MatchupId = 'beasts' | 'mythic' | 'militia' | RivalId

export interface Matchup {
  weakTo: Tag[]
  resists: Tag[]
}

export interface LairEntry {
  id: string
  name: string
  land: Land
}

export interface MythicUnitEntry extends HostUnitEntry {
  count: number
  /** Replaces the usual health of 4 × power (A-47). */
  healthPerPower?: number
}

export interface QuarryEntry {
  id: string
  name: string
  lair: string
  /** Only an event brings it (the Dragon, the Wild Hunt). */
  eventOnly: boolean
  roster: MythicUnitEntry[]
  special: MythicSpecial
  specialEffects: Effect[]
}

/** Plain parameters for logic that later tasks implement. */
export type CodexParams = Record<string, string | number | boolean | string[]>

export interface RitualEntry {
  id: string
  name: string
  /** The Archmage casts them in this order. */
  order: number
  params: CodexParams
}

export type EventKind = 'rival' | 'world' | 'reaction' | 'opportunity'

export interface EventEntry {
  id: string
  name: string
  kind: EventKind
  recurring: boolean
  /** Hidden criteria: an id plus parameters. T13 implements the logic. */
  criteria: { id: string; params: CodexParams }
  effect: CodexParams
}

/** The habit a rival prizes in the player (A-38). */
export type PrizedHabit = 'noLostBattle' | 'calorieAverage' | 'allDuties' | 'stepPool'

export interface RivalEntry {
  id: RivalId
  ruler: string
  shortName: string
  title: string
  people: string
  realm: string
  road: BuildingId
  personality: string
  prizes: PrizedHabit
  voice: string
  banner: string
  /** Its vassal, envoy or ally company (A-20). Power comes from `rules.ts`. */
  levy: { tag: Tag; reach: Reach }
}

export interface FrontEntry {
  id: FrontId
  rivals: [RivalId, RivalId]
}

export interface CodexData {
  buildings: BuildingEntry[]
  companies: CompanyEntry[]
  crossings: CrossingEntry[]
  elites: EliteEntry[]
  sworn: SwornEntry
  items: ItemEntry[]
  wings: WingEntry[]
  orders: OrderEntry[]
  doctrines: DoctrineEntry[]
  matchups: Record<MatchupId, Matchup>
  hosts: HostEntry[]
  lairs: LairEntry[]
  quarries: QuarryEntry[]
  rituals: RitualEntry[]
  events: EventEntry[]
  rivals: RivalEntry[]
  fronts: FrontEntry[]
}

export type Codex = DeepReadonly<CodexData>

// ── Loading ──────────────────────────────────────────────────────────────────

/** JSON has no literal types; `validateCodex` checks at run time what this cast assumes. */
function load<T>(json: unknown): T {
  return json as T
}

export const CODEX: Codex = deepFreeze<CodexData>({
  buildings: load(companiesJson.buildings),
  companies: load(companiesJson.companies),
  crossings: load(crossingsJson),
  elites: load(elitesJson.elites),
  sworn: load(elitesJson.sworn),
  items: load(itemsJson),
  wings: load(wingsJson),
  orders: load(ordersJson),
  doctrines: load(doctrinesJson),
  matchups: load(hostsJson.matchups),
  hosts: load(hostsJson.hosts),
  lairs: load(mythicsJson.lairs),
  quarries: load(mythicsJson.quarries),
  rituals: load(ritualsJson),
  events: load(eventsJson),
  rivals: load(rivalsJson.rivals),
  fronts: load(rivalsJson.fronts)
})

// ── Units ────────────────────────────────────────────────────────────────────

export type UnitKind = 'building' | 'crownguard' | 'hybrid' | 'elite' | 'sworn' | 'host' | 'commander' | 'mythic'

/** Every company line in the codex, each of which has a `units.<id>` description slot. */
export function codexUnits(codex: Codex = CODEX): { id: string; name: string; kind: UnitKind }[] {
  return [
    ...codex.companies.map((c) => ({ id: c.id, name: c.name, kind: c.source })),
    ...codex.crossings.flatMap((x) => x.hybrids.map((h) => ({ id: h.id, name: h.name, kind: 'hybrid' as const }))),
    ...codex.elites.map((e) => ({ id: e.id, name: e.name, kind: 'elite' as const })),
    { id: codex.sworn.id, name: codex.sworn.name, kind: 'sworn' as const },
    ...codex.hosts.flatMap((h) => [
      ...h.companies.map((c) => ({ id: c.id, name: c.name, kind: 'host' as const })),
      { id: h.commander.id, name: h.commander.name, kind: 'commander' as const }
    ]),
    ...codex.quarries.flatMap((q) => q.roster.map((u) => ({ id: u.id, name: u.name, kind: 'mythic' as const })))
  ]
}

/** The text catalog slots the codex needs: unit and item descriptions, Crossings, events and rival lines. */
export function requiredTextIds(codex: Codex = CODEX): string[] {
  return [
    ...codexUnits(codex).map((u) => `units.${u.id}`),
    ...codex.items.map((i) => `items.${i.id}`),
    ...codex.crossings.flatMap((x) => [`crossings.${x.id}.name`, `crossings.${x.id}.body`]),
    ...codex.events.flatMap((e) => [`events.${e.id}.title`, `events.${e.id}.body`]),
    ...codex.rivals.flatMap((r) => RIVAL_MOMENTS.map((m) => `rivals.${r.id}.${m}`))
  ]
}

// ── Validation ───────────────────────────────────────────────────────────────

const TAGS: readonly Tag[] = ['steel', 'coin', 'arcane', 'engine']
const REACHES: readonly Reach[] = ['melee', 'ranged']
const INTENTS: readonly Intent[] = ['strike', 'charge', 'volley', 'brace', 'shift', 'spell']
const MYTHIC_SPECIALS: readonly MythicSpecial[] = ['broodVolley', 'petrify', 'fire', 'griffinDive', 'poison', 'huntTheWeak']
const ITEM_RANKS: readonly ItemRank[] = ['I', 'II', 'III', 'legendary', 'trophy']
const EVENT_KINDS: readonly EventKind[] = ['rival', 'world', 'reaction', 'opportunity']
const PRIZED_HABITS: readonly PrizedHabit[] = ['noLostBattle', 'calorieAverage', 'allDuties', 'stepPool']
const MATCHUP_IDS: readonly MatchupId[] = ['beasts', 'mythic', 'militia', ...RIVAL_IDS]
const TARGETS: Record<EffectTarget, true> = {
  company: true,
  buildingCompany: true,
  oneCompany: true,
  lane: true,
  laneFront: true,
  ownFronts: true,
  centerFront: true,
  allCompanies: true,
  realm: true,
  enemyCompany: true,
  enemyLane: true,
  enemyFronts: true,
  enemyRear: true
}
/** Every effect kind; a Record so the compiler insists it stays complete. */
const EFFECT_KINDS: Record<EffectKind, true> = {
  power: true,
  health: true,
  damage: true,
  damageTaken: true,
  addTag: true,
  match: true,
  heal: true,
  directDamage: true,
  splash: true,
  readiness: true,
  readinessFloor: true,
  rallyFloor: true,
  walls: true,
  wallsMult: true,
  wallsAsHealth: true,
  banners: true,
  dailyAssaults: true,
  mythicStrength: true,
  raidStrength: true,
  foretell: true,
  reveal: true,
  reputationBonus: true,
  tithes: true,
  spoils: true,
  tribute: true,
  cost: true,
  trust: true,
  courtshipSlots: true,
  respiteBank: true,
  itemSlots: true,
  interest: true,
  eventHint: true,
  wearyDays: true,
  ignoreWeary: true,
  noRout: true,
  ignoreFortification: true,
  ignoreIntent: true,
  cancelIntent: true,
  setIntent: true,
  fixedIntent: true,
  revealIntents: true,
  ordersOffered: true,
  skipAction: true,
  moveEnemy: true,
  rangedHitsRear: true,
  hire: true,
  grantDoctrine: true,
  immune: true,
  mythicSpecial: true,
  royalHunt: true,
  grandIllusion: true
}

const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T)
const sameSet = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x))
const camel = (a: string, b: string): string => a + b[0].toUpperCase() + b.slice(1)

/**
 * Checks that ids are unique, tags and other enums are valid, cross-references resolve, and every
 * Order and Doctrine names a real source. Returns one message per problem; empty means valid.
 */
export function validateCodex(codex: Codex = CODEX): string[] {
  const errors: string[] = []
  const fail = (where: string, problem: string): void => {
    errors.push(`${where}: ${problem}`)
  }

  const unique = (what: string, ids: readonly string[]): void => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') fail(what, `invalid id ${JSON.stringify(id)}`)
      else if (seen.has(id)) fail(what, `duplicate id "${id}"`)
      seen.add(id)
    }
  }
  const tags = (where: string, list: readonly unknown[]): void => {
    if (!Array.isArray(list)) return fail(where, 'tags must be a list')
    for (const tag of list) if (!isOneOf(TAGS, tag)) fail(where, `invalid tag "${tag}"`)
  }
  const reach = (where: string, value: unknown): void => {
    if (!isOneOf(REACHES, value)) fail(where, `invalid reach "${value}"`)
  }
  const building = (where: string, value: unknown): void => {
    if (!isOneOf(BUILDING_IDS, value)) fail(where, `unknown building "${value}"`)
  }
  const rival = (where: string, value: unknown): void => {
    if (!isOneOf(RIVAL_IDS, value)) fail(where, `unknown rival "${value}"`)
  }
  const positive = (where: string, value: unknown): void => {
    if (typeof value !== 'number' || !(value > 0)) fail(where, `expected a positive number, got ${value}`)
  }

  const quarryIds = codex.quarries.map((q) => q.id)
  const doctrineIds = codex.doctrines.map((d) => d.id)

  const effects = (where: string, list: readonly DeepReadonly<Effect>[], units: readonly string[] = []): void => {
    if (!Array.isArray(list) || list.length === 0) return fail(where, 'needs at least one effect')
    list.forEach((e, i) => {
      const at = `${where} effect ${i + 1}`
      if (!(e.kind in EFFECT_KINDS)) return fail(at, `unknown effect kind "${e.kind}"`)
      if (e.target !== undefined && !(e.target in TARGETS)) fail(at, `unknown target "${e.target}"`)
      if (e.against !== undefined && !isOneOf(FOES, e.against)) fail(at, `unknown foe "${e.against}"`)
      if (e.reach !== undefined) reach(at, e.reach)
      if (e.in !== undefined && e.in !== 'daily' && e.in !== 'grand') fail(at, `invalid "in" "${e.in}"`)
      switch (e.kind) {
        case 'addTag':
          tags(at, [e.tag])
          break
        case 'directDamage':
          if (e.tagPower) tags(at, [e.tagPower.tag])
          break
        case 'cost':
          for (const what of e.what) if (!isOneOf(COST_KINDS, what)) fail(at, `unknown cost "${what}"`)
          break
        case 'reveal':
          if (!isOneOf(REVEAL_KINDS, e.what)) fail(at, `unknown reveal "${e.what}"`)
          break
        case 'foretell':
          if (e.road !== undefined) building(at, e.road)
          break
        case 'ignoreIntent':
        case 'setIntent':
          if (!isOneOf(INTENTS, e.intent)) fail(at, `unknown intent "${e.intent}"`)
          break
        case 'cancelIntent':
          for (const intent of e.intents) if (!isOneOf(INTENTS, intent)) fail(at, `unknown intent "${intent}"`)
          break
        case 'fixedIntent':
          if (!isOneOf(INTENTS, e.intent)) fail(at, `unknown intent "${e.intent}"`)
          if (e.unit !== undefined && !units.includes(e.unit)) fail(at, `unknown unit "${e.unit}"`)
          break
        case 'grantDoctrine':
          if (!doctrineIds.includes(e.doctrine)) fail(at, `unknown doctrine "${e.doctrine}"`)
          break
        case 'immune':
          if (!isOneOf(MYTHIC_SPECIALS, e.special)) fail(at, `unknown special "${e.special}"`)
          break
        case 'mythicSpecial':
          if (!isOneOf(MYTHIC_SPECIALS, e.special)) fail(at, `unknown special "${e.special}"`)
          if (e.unit !== undefined && !units.includes(e.unit)) fail(at, `unknown unit "${e.unit}"`)
          break
        default:
          break
      }
    })
  }

  // Unit ids share the `units.*` text namespace, so they must be unique across the codex.
  unique('units', codexUnits(codex).map((u) => u.id))

  // Buildings and their companies
  unique('buildings', codex.buildings.map((b) => b.id))
  if (!sameSet(codex.buildings.map((b) => b.id), BUILDING_IDS)) fail('buildings', 'must be exactly the four buildings')
  for (const b of codex.buildings) tags(`building ${b.id}`, [b.tag])
  for (const c of codex.companies) {
    const at = `company ${c.id}`
    tags(at, c.tags)
    reach(at, c.reach)
    if (c.source === 'building') {
      building(at, c.building)
      const home = codex.buildings.find((b) => b.id === c.building)
      if (home && !sameSet(c.tags, [home.tag])) fail(at, `tags must be [${home.tag}]`)
    } else if (c.source === 'crownguard') {
      if (!sameSet(c.tags, TAGS)) fail(at, 'the Crownguard carries all four tags')
    } else fail(at, `invalid source "${c.source}"`)
  }
  for (const b of BUILDING_IDS) {
    const tiers = codex.companies.filter((c) => c.source === 'building' && c.building === b).map((c) => c.tier)
    if (!sameSet(tiers, RULES.buildings.pureCompanyPower.map((_, i) => i + 1))) {
      fail(`building ${b}`, `needs one company per tier, got tiers [${tiers.join(', ')}]`)
    }
  }

  // Crossings
  unique('crossings', codex.crossings.map((x) => x.id))
  const perkIds = codex.crossings.flatMap((x) => x.perks.map((p) => p.id))
  unique('crossing perks', perkIds)
  const stages = RULES.crossings.hybridPower.map((_, i) => i + 1)
  for (const x of codex.crossings) {
    const at = `crossing ${x.id}`
    x.buildings.forEach((b) => building(at, b))
    const [a, b] = x.buildings
    const [first, second] = [a, b].sort()
    if (a === b) fail(at, 'needs two different buildings')
    if (x.id !== camel(first, second) || a !== first) fail(at, `id and buildings must be the alphabetical pair "${camel(first, second)}"`)
    if (x.land !== null && !isOneOf(LANDS, x.land)) fail(at, `invalid land "${x.land}"`)
    tags(at, x.tags)
    const pairTags = codex.buildings.filter((bb) => x.buildings.includes(bb.id)).map((bb) => bb.tag)
    if (!sameSet(x.tags, pairTags)) fail(at, `tags must be its buildings' tags [${pairTags.join(', ')}]`)
    if (!sameSet(x.hybrids.map((h) => h.stage), stages)) fail(at, 'needs one hybrid per stage')
    for (const h of x.hybrids) reach(`hybrid ${h.id}`, h.reach)
    for (const p of x.perks) {
      if (p.stage < 2 || p.stage > stages.length) fail(`perk ${p.id}`, `invalid stage ${p.stage}`)
      if (p.replaces !== undefined && !perkIds.includes(p.replaces)) fail(`perk ${p.id}`, `replaces unknown perk "${p.replaces}"`)
      effects(`perk ${p.id}`, p.effects)
    }
  }
  const allPairs = BUILDING_IDS.flatMap((a, i) => BUILDING_IDS.slice(i + 1).map((b) => [a, b].sort().join('+')))
  if (!sameSet(codex.crossings.map((x) => [...x.buildings].sort().join('+')), allPairs)) {
    fail('crossings', 'must cover every pair of buildings exactly once')
  }

  // Elites and the Sworn
  unique('elites', codex.elites.map((e) => e.id))
  if (!sameSet(codex.elites.map((e) => e.building), BUILDING_IDS)) fail('elites', 'needs one Elite per building')
  for (const e of codex.elites) {
    const at = `elite ${e.id}`
    building(at, e.building)
    tags(at, e.tags)
    reach(at, e.reach)
    if (e.power.length !== 2) fail(at, 'needs power for rank I and rank II')
    e.power.forEach((p) => positive(at, p))
    effects(at, e.ability)
  }
  reach('the Sworn', codex.sworn.reach)
  positive('the Sworn', codex.sworn.power)
  positive('the Sworn', codex.sworn.tagCount)
  effects('the Sworn', codex.sworn.ability)

  // Items
  unique('items', codex.items.map((i) => i.id))
  for (const item of codex.items) {
    const at = `item ${item.id}`
    if (!isOneOf(ITEM_RANKS, item.rank)) fail(at, `invalid rank "${item.rank}"`)
    if (item.rank === 'trophy') {
      if (item.cost !== null) fail(at, 'trophies are never sold, so cost must be null')
      const quarry = codex.quarries.find((q) => q.id === item.quarry)
      if (!quarry) fail(at, `unknown quarry "${item.quarry}"`)
      const immune = item.effects.find((e) => e.kind === 'immune')
      if (quarry && (!immune || immune.kind !== 'immune' || immune.special !== quarry.special)) {
        fail(at, `must grant immunity to its quarry's special "${quarry.special}"`)
      }
    } else positive(at, item.cost)
    if (item.rank === 'legendary') building(at, item.building)
    effects(at, item.effects)
  }
  const legendary = codex.items.filter((i) => i.rank === 'legendary').map((i) => i.building)
  if (!sameSet(legendary, BUILDING_IDS)) fail('items', 'needs one Legendary item per building')

  // Wings
  unique('wings', codex.wings.map((w) => w.id))
  const waves = RULES.milestones.unlocks.wings.length
  for (const w of codex.wings) {
    building(`wing ${w.id}`, w.building)
    if (!Number.isInteger(w.wave) || w.wave < 1 || w.wave > waves) fail(`wing ${w.id}`, `invalid wave ${w.wave}`)
    effects(`wing ${w.id}`, w.effects)
  }
  for (const b of BUILDING_IDS) {
    for (let wave = 1; wave <= waves; wave++) {
      const n = codex.wings.filter((w) => w.building === b && w.wave === wave).length
      if (n !== 2) fail(`wings ${b}`, `needs a choice of two in wave ${wave}, has ${n}`)
    }
  }

  // Orders and Doctrines name a real source
  const tierCount = RULES.buildings.pureCompanyPower.length
  const source = (at: string, s: DeepReadonly<CodexSource>): void => {
    if (s.kind === 'building') {
      building(at, s.id)
      if (!Number.isInteger(s.tier) || s.tier < 1 || s.tier > tierCount) fail(at, `invalid tier ${s.tier}`)
    } else if (s.kind === 'crossing') {
      if (!codex.crossings.some((x) => x.id === s.id)) fail(at, `unknown crossing "${s.id}"`)
      if (!stages.includes(s.stage)) fail(at, `invalid stage ${s.stage}`)
    } else if (s.kind === 'wing') {
      if (!codex.wings.some((w) => w.id === s.id)) fail(at, `unknown wing "${s.id}"`)
    } else fail(at, `invalid source ${JSON.stringify(s)}`)
  }
  unique('orders', codex.orders.map((o) => o.id))
  for (const o of codex.orders) {
    source(`order ${o.id}`, o.source)
    effects(`order ${o.id}`, o.effects)
  }
  unique('doctrines', doctrineIds)
  for (const d of codex.doctrines) {
    source(`doctrine ${d.id}`, d.source)
    effects(`doctrine ${d.id}`, d.effects)
    if (d.source.kind === 'wing') {
      const wingId = d.source.id
      const wing = codex.wings.find((w) => w.id === wingId)
      if (wing && !wing.effects.some((e) => e.kind === 'grantDoctrine' && e.doctrine === d.id)) {
        fail(`doctrine ${d.id}`, `wing "${wingId}" does not grant it`)
      }
    }
  }

  // Enemy types, hosts, lairs and quarries
  if (!sameSet(Object.keys(codex.matchups), MATCHUP_IDS)) fail('matchups', `must cover ${MATCHUP_IDS.join(', ')}`)
  for (const [id, m] of Object.entries(codex.matchups)) {
    tags(`matchup ${id}`, m.weakTo)
    tags(`matchup ${id}`, m.resists)
  }
  if (!sameSet(codex.hosts.map((h) => h.rival), RIVAL_IDS)) fail('hosts', 'needs one host per rival')
  for (const h of codex.hosts) {
    const at = `host ${h.rival}`
    rival(at, h.rival)
    const units = [...h.companies, h.commander]
    for (const u of units) {
      reach(`${at} unit ${u.id}`, u.reach)
      positive(`${at} unit ${u.id}`, u.power)
    }
    if (h.intentPattern.length !== RULES.grandBattles.rounds) fail(at, `needs an intent for each of ${RULES.grandBattles.rounds} rounds`)
    for (const intent of h.intentPattern) if (!isOneOf(INTENTS, intent)) fail(at, `unknown intent "${intent}"`)
    effects(at, h.specials, units.map((u) => u.id))
  }
  unique('lairs', codex.lairs.map((l) => l.id))
  for (const l of codex.lairs) if (!isOneOf(LANDS, l.land)) fail(`lair ${l.id}`, `invalid land "${l.land}"`)
  unique('quarries', quarryIds)
  for (const q of codex.quarries) {
    const at = `quarry ${q.id}`
    if (!codex.lairs.some((l) => l.id === q.lair)) fail(at, `unknown lair "${q.lair}"`)
    if (!isOneOf(MYTHIC_SPECIALS, q.special)) fail(at, `unknown special "${q.special}"`)
    if (q.roster.length === 0) fail(at, 'needs a roster')
    for (const u of q.roster) {
      reach(`${at} unit ${u.id}`, u.reach)
      positive(`${at} unit ${u.id}`, u.power)
      positive(`${at} unit ${u.id}`, u.count)
      if (u.healthPerPower !== undefined) positive(`${at} unit ${u.id}`, u.healthPerPower)
    }
    effects(at, q.specialEffects, q.roster.map((u) => u.id))
  }

  // Rituals
  unique('rituals', codex.rituals.map((r) => r.id))
  if (!sameSet(codex.rituals.map((r) => r.order), codex.rituals.map((_, i) => i + 1))) {
    fail('rituals', 'orders must run 1, 2, 3 … without gaps')
  }

  // World events
  unique('events', codex.events.map((e) => e.id))
  const itemIds = codex.items.map((i) => i.id)
  const lairIds = codex.lairs.map((l) => l.id)
  for (const e of codex.events) {
    const at = `event ${e.id}`
    if (!isOneOf(EVENT_KINDS, e.kind)) fail(at, `invalid kind "${e.kind}"`)
    if (typeof e.recurring !== 'boolean') fail(at, 'recurring must be true or false')
    if (typeof e.criteria?.id !== 'string' || e.criteria.id === '') fail(at, 'criteria need an id')
    for (const params of [e.criteria?.params ?? {}, e.effect]) {
      if ('rival' in params) rival(at, params.rival)
      if ('lair' in params && !lairIds.includes(params.lair as string)) fail(at, `unknown lair "${params.lair}"`)
      if ('winItem' in params && !itemIds.includes(params.winItem as string)) fail(at, `unknown item "${params.winItem}"`)
      if ('companyTags' in params) tags(at, params.companyTags as string[])
    }
    const battle = e.effect.battle
    if (battle !== undefined && battle !== 'duel' && !quarryIds.includes(battle as string)) {
      fail(at, `unknown battle "${battle}"`)
    }
  }

  // Rivals and fronts
  unique('rivals', codex.rivals.map((r) => r.id))
  if (!sameSet(codex.rivals.map((r) => r.id), RIVAL_IDS)) fail('rivals', 'must be exactly the four rivals')
  if (!sameSet(codex.rivals.map((r) => r.road), BUILDING_IDS)) fail('rivals', 'each building road must lead to exactly one rival')
  for (const r of codex.rivals) {
    const at = `rival ${r.id}`
    building(at, r.road)
    if (!isOneOf(PRIZED_HABITS, r.prizes)) fail(at, `unknown prized habit "${r.prizes}"`)
    tags(at, [r.levy.tag])
    reach(at, r.levy.reach)
    for (const field of ['ruler', 'shortName', 'title', 'people', 'realm'] as const) {
      if (typeof r[field] !== 'string' || r[field] === '') fail(at, `needs a ${field}`)
    }
  }
  unique('fronts', codex.fronts.map((f) => f.id))
  if (!sameSet(codex.fronts.map((f) => f.id), FRONT_IDS)) fail('fronts', 'must be the four Rim fronts')
  for (const f of codex.fronts) {
    f.rivals.forEach((r) => rival(`front ${f.id}`, r))
    if (f.rivals[0] === f.rivals[1]) fail(`front ${f.id}`, 'needs two different rivals')
  }

  return errors
}
