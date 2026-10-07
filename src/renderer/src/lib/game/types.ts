/**
 * Every game type, starting from the design book's Appendix A ("Core types").
 *
 * Shared by many tasks: add to this file, don't reorganize it, so parallel branches merge
 * cleanly. Everything in `CampaignState` must stay JSON-serializable: plain objects, arrays,
 * strings, numbers, booleans and null. No Dates, Maps, Sets, functions or class instances.
 */
import type { ISODate } from '../dates'

export type { ISODate }

// ── Identities ───────────────────────────────────────────────────────────────

export type RivalId = 'orc' | 'goblin' | 'dwarf' | 'archmage'
export type Owner = 'player' | RivalId | 'neutral'
export type BuildingId = 'barracks' | 'merchantHall' | 'mageTower' | 'foundry'
export type Tag = 'steel' | 'coin' | 'arcane' | 'engine'
export type Reach = 'melee' | 'ranged'
/** A between-land, named by the direction it lies in from the castle. */
export type Land = 'north' | 'south' | 'west' | 'east'
/** The six building pairs (Ch 8), named alphabetically as in the book's table. */
export type CrossingId =
  | 'barracksFoundry'
  | 'barracksMageTower'
  | 'barracksMerchantHall'
  | 'foundryMageTower'
  | 'foundryMerchantHall'
  | 'mageTowerMerchantHall'
/** The four Rim fronts between neighboring rivals (Ch 12). */
export type FrontId = 'north' | 'south' | 'west' | 'east'
export type Disposition = 'peace' | 'tension' | 'war'
export type BuildingTier = 1 | 2 | 3 | 4 | 5 // rules-ok: literal type
export type CastleTier = 1 | 2 | 3 | 4 | 5 // rules-ok: literal type
/** 0 = not raised; 1 Alliance, 2 Brotherhood, 3 Legend. */
export type CrossingStage = 0 | 1 | 2 | 3 // rules-ok: literal type
export type GraceLevel = 0 | 1 | 2 | 3 // rules-ok: literal type
/** Mirrors `Settings.weekStartsOn` in the ledger: 0 = Sunday, 1 = Monday. */
export type WeekStartsOn = 0 | 1

// ── Appendix A: core types ───────────────────────────────────────────────────

export interface Campaign {
  id: string
  seed: number
  ruleVersion: string
  startDate: ISODate
  timeZone: string
  startWeight: number
  goalWeight: number
  heightCm?: number
  /** Optional; only to bootstrap the Healer's range. */
  sex?: 'male' | 'female'
  /** Optional; only to bootstrap the Healer's range. */
  birthYear?: number
  unit: 'lb' | 'kg'
  /** lb per week, default 0.8 */
  targetPace: number
  status: 'active' | 'won' | 'fallen'
  /** The Healer's Dispensation (Ch 9 rule 7); on unless this is false. */
  dispensation?: boolean
  /** The week start fixed at founding (`settings.weekStartsOn` then). Settlement reads this, not the ledger's current setting. */
  weekStartsOn?: WeekStartsOn
}

export interface Charter {
  stepPool: number
  calorieLimit: number
  calorieFloor?: number
  duties: string[]
}

export type HexKind =
  | 'castle'
  | 'building'
  | 'road'
  | 'between'
  | 'gate'
  | 'lairMouth'
  | 'capital'
  | 'realm'
  | 'lair'
  | 'battlefield'

export interface HexState {
  id: string
  q: number
  r: number
  ring: number
  kind: HexKind
  owner: Owner
  garrison: number
  /** Resets at week close. */
  garrisonDamage: number
  village?: { loyalty: number; settlingUntil?: ISODate }
  fortification: 0 | 1 | 2 | 3 | 4 // rules-ok: literal type
  status: 'held' | 'contested' | 'scorched'
  statusUntil?: ISODate
  /** The between-land this hex lies in (lair rays count as West and East). */
  land?: Land
  /** The building whose road this hex lies on. */
  road?: BuildingId
  /** Held by mythic beasts (the Lair Mouths, a Summoning). */
  mythic?: boolean
}

export type CompanySource =
  | 'building'
  | 'crossing'
  | 'elite'
  | 'crownguard'
  | 'vassal'
  | 'ally'
  | 'hired'
  | 'sworn'
  /** A rival's company, bought from its host list (Appendix C). */
  | 'host'

export interface Company {
  id: string
  name: string
  source: CompanySource
  power: number
  tags: Tag[]
  reach: Reach
  items: string[]
  wearyUntil?: ISODate
}

export type ContractTerm = 1 | 3 | 7 | 14 | 30 // rules-ok: literal type

export interface LandContract {
  id: string
  termDays: ContractTerm
  kind: 'standard' | 'accord'
  rival?: RivalId
  pledge: number
  charter: Charter
  startDate: ISODate
  endDate: ISODate
  respiteDays: number
  status: 'queued' | 'active' | 'paid' | 'withdrawn'
  score?: number
  /** The days a Respite was spent on; they leave every pillar. `respiteDays` is their count. */
  respiteDates: ISODate[]
  /** What the purse has paid for it so far (after rounding, adjustments included). */
  paid?: { payout: number; pledgeReturn: number }
}

export interface DailyOrders {
  date: ISODate
  assaultTarget?: string
  assault: string[]
  defense: string[]
}

export interface Courtship {
  hexId: string
  bid: number
  placedOn: ISODate
  rivalBids: Partial<Record<Owner, number>>
}

export interface RivalState {
  rival: RivalId
  treasury: number
  companies: Company[]
  respect: number
  threat: number
  /** Keyed by 'player' and by neighboring rival ids. */
  disposition: Record<string, Disposition>
  status: 'active' | 'allied' | 'abdicated' | 'conquered'
  ascendancyStreak: number
  ultimatumUntil?: ISODate
  humbledUntil?: ISODate
  specialFund: number
  /** −3..+3 per front, from this rival's side. */
  frontTracks: Record<string, number>
}

export interface Coalition {
  members: RivalId[]
  trigger: 'firstFall' | 'lastAlliance' | 'risingCrown'
  until?: ISODate
  warChest: number
}

export type Lane = 'left' | 'center' | 'right'
export type Rank = 'front' | 'rear'
export type Intent = 'strike' | 'charge' | 'volley' | 'brace' | 'shift' | 'spell'

/** One line of a Grand Battle's damage log. T12 extends this. */
export interface BattleLogLine {
  from: string
  to: string
  amount: number
  note?: string
}

/** One round of a Grand Battle, enough to replay it (Ch 11 rule 4). T12 extends this. */
export interface BattleRoundLog {
  round: number
  intents: Partial<Record<Lane, Intent>>
  order?: string
  swap?: [string, string]
  lines: BattleLogLine[]
}

export interface GrandBattle {
  id: string
  trigger: string
  hexId: string
  announcedOn: ISODate
  battleDate: ISODate
  enemy: Company[]
  formation?: Record<string, string>
  doctrine?: string
  log?: BattleRoundLog[]
  result?: 'rout' | 'victory' | 'defeat'
}

export type PurseEventKind = 'earn' | 'pledge' | 'return' | 'spend' | 'spoils' | 'tribute' | 'tithe' | 'adjust'

export interface PurseEvent {
  id: string
  date: ISODate
  kind: PurseEventKind
  amount: number
  source: string
}

export interface WeighIn {
  date: ISODate
  weight: number
}

export interface MilestoneState {
  index: number
  /** In lb. A Keeping Milestone's mark is the goal. */
  mark: number
  earliestWeek: number
  brokenOn?: ISODate
  /** The campaign week it broke in. */
  brokenWeek?: number
  byDispensation?: boolean
  /** A Keeping Milestone (Ch 9 rule 2): breaks after weeks spent near the goal, not at a mark. */
  keeping?: boolean
}

/** What the weight rules record at each week close, so Grace and the streaks can be derived (T05). */
export interface WeightWeek {
  week: number
  /** The week's last day, whose close is the week close. */
  day: ISODate
  /** Momentum M, 0 to 1. */
  momentum: number
  /** Realm Consistency at the close. */
  realmConsistency: number
  /** The 7-day average weight in lb at the close, when there is one. */
  average?: number
  tooFast: boolean
}

/** One ledger day as the Healer reads it (Ch 4). */
export interface HealerDay {
  date: ISODate
  /** kcal logged */
  eaten?: number
  /** Fitbit's total calories burned (A-06) */
  burned?: number
}

export interface WorldEvent {
  id: string
  firedOn: ISODate
  data: unknown
}

// ── Effects: how the codex describes what things do ──────────────────────────

/** What kind of foe an effect is limited to. */
export type Foe = 'beast' | 'mythic' | 'rival' | 'militia'

/**
 * Who an effect applies to. Omitted means the holder: an item's company, an Elite itself,
 * or the whole realm for a perk, Wing or Milestone boon.
 */
export type EffectTarget =
  | 'company' // the holder's own company
  | 'buildingCompany' // the Wing's building company
  | 'oneCompany' // one company the player picks
  | 'lane' // every own company in the holder's (or the chosen) lane
  | 'laneFront' // the front company of one chosen lane
  | 'ownFronts' // every own front company
  | 'centerFront' // the own center front company
  | 'allCompanies' // every own company
  | 'realm' // realm-wide
  | 'enemyCompany' // one enemy company
  | 'enemyLane' // one enemy lane
  | 'enemyFronts' // every enemy front company
  | 'enemyRear' // the enemy rear in the same lane

export interface EffectBase {
  /** Only in daily combat or only in Grand Battles. Omitted means wherever it can apply. */
  in?: 'daily' | 'grand'
  target?: EffectTarget
  /** Only against this kind of foe. */
  against?: Foe
  /** Only for companies with this reach. */
  reach?: Reach
  /** A use limit, such as once a month. */
  limit?: { uses: number; per: 'round' | 'battle' | 'week' | 'month' }
  /** Only while this holds. */
  condition?: { ownHealthBelow?: number; rounds?: number[] }
}

/** A cost that an effect discounts. */
export type CostKind = 'tiers' | 'crossings' | 'items' | 'fortification' | 'trade'
/** A hidden value an effect lets the player see. */
export type RevealKind = 'treasury' | 'army' | 'threatStrength' | 'hostRoster'
/** A mythic quarry's special (Appendix C, Mythic Hunts). */
export type MythicSpecial = 'broodVolley' | 'petrify' | 'fire' | 'griffinDive' | 'poison' | 'huntTheWeak'

/**
 * Items, Wings, Crossing perks, Orders, Doctrines, Elite abilities and mythic specials are
 * all described as lists of these. T07 and T12 interpret them; T14 wires the rest.
 * `mult` multiplies, `add` adds, `set` replaces. Shares are fractions (0.05 = 5%).
 */
export type Effect = EffectBase &
  (
    | { kind: 'power'; add?: number; mult?: number }
    | { kind: 'health'; mult?: number; add?: number }
    | { kind: 'damage'; mult: number }
    | { kind: 'damageTaken'; mult: number; fromIntent?: Intent }
    | { kind: 'addTag'; tag: Tag }
    | { kind: 'match'; set: number }
    | { kind: 'heal'; share: number }
    | { kind: 'directDamage'; tagPower?: { tag: Tag; mult: number }; perStage?: number; flat?: number }
    | { kind: 'splash'; share: number }
    | { kind: 'readiness'; add: number }
    | { kind: 'readinessFloor'; min: number }
    | { kind: 'rallyFloor'; add: number }
    | { kind: 'walls'; add: number }
    | { kind: 'wallsMult'; mult: number; rings?: number[] }
    | { kind: 'wallsAsHealth' }
    | { kind: 'banners'; add: number; pool?: 'defense' | 'assault' }
    | { kind: 'dailyAssaults'; add: number }
    | { kind: 'mythicStrength'; mult: number }
    | { kind: 'raidStrength'; mult: number }
    | { kind: 'foretell'; days: number; threat?: 'raid' | 'all'; road?: BuildingId }
    | { kind: 'reveal'; what: RevealKind; whom?: 'all' | 'neighbors' }
    | { kind: 'reputationBonus'; add: number }
    | { kind: 'tithes'; mult: number }
    | { kind: 'spoils'; mult: number }
    | { kind: 'tribute'; mult: number }
    | { kind: 'cost'; what: CostKind[]; mult: number }
    | { kind: 'trust'; add: number }
    | { kind: 'courtshipSlots'; add: number }
    | { kind: 'respiteBank'; add: number }
    | { kind: 'itemSlots'; add: number }
    | { kind: 'interest'; rate: number; cap: number }
    | { kind: 'eventHint' }
    | { kind: 'wearyDays'; add: number }
    | { kind: 'ignoreWeary' }
    | { kind: 'noRout' }
    | { kind: 'ignoreFortification' }
    | { kind: 'ignoreIntent'; intent: Intent }
    | { kind: 'cancelIntent'; intents: Intent[] }
    | { kind: 'setIntent'; intent: Intent }
    | { kind: 'fixedIntent'; intent: Intent; unit?: string; lanes?: number | 'all' }
    | { kind: 'revealIntents'; rounds: number | 'all' }
    | { kind: 'ordersOffered'; set: number }
    | { kind: 'skipAction'; excludeMythic?: boolean }
    | { kind: 'moveEnemy' }
    | { kind: 'rangedHitsRear' }
    | { kind: 'hire'; free?: boolean }
    | { kind: 'grantDoctrine'; doctrine: string }
    | { kind: 'immune'; special: MythicSpecial }
    | { kind: 'mythicSpecial'; special: MythicSpecial; unit?: string; damagePerRound?: number; lanes?: number }
    | { kind: 'royalHunt'; reputation: number; trophy: boolean }
    | { kind: 'grandIllusion' }
  )

export type EffectKind = Effect['kind']

// ── The game log: events for the Herald and the Chronicle ────────────────────

export type BattleOutcome = 'rout' | 'victory' | 'defeat'
export type ThreatKind = 'beasts' | 'mythic' | 'raid' | 'conquest'

/**
 * Payloads by event kind. Open for later tasks: add a key here (one line each) and the
 * `GameEvent` union picks it up. Payloads hold plain facts only; screens turn them into
 * text through the catalog.
 */
export interface GameEventMap {
  /** A daily defense battle against the day's threat or a conquest attempt (Ch 10). */
  defense: {
    threat: ThreatKind
    hexId: string
    rival?: RivalId
    outcome: BattleOutcome
    spoils?: number
    tribute?: number
    contested?: boolean
  }
  /** The player's daily assault (Ch 6). */
  assault: { hexId: string; owner: Owner; outcome: 'taken' | 'rout' | 'repulsed'; spoils?: number }
  /** A hex changed hands. */
  hexTransfer: { hexId: string; from: Owner; to: Owner; how: 'conquest' | 'influence' | 'trade' | 'reclaim' | 'event' | 'borderCampaign' }
  /** A courtship resolved at week close (Ch 6). */
  courtship: { hexId: string; outcome: 'defected' | 'held'; bid: number; loyaltyDrop?: number; winner?: Owner }
  /** A deal with a rival: a hex bought or sold, a Truce, a pact, a call to arms. */
  deal: { rival: RivalId; deal: 'buyHex' | 'sellHex' | 'truce' | 'pact' | 'callToArms'; price: number; hexId?: string; target?: RivalId }
  /** Rival news the Herald may pass on as rumor or report. */
  rivalNews: { rival: RivalId; news: string; hexId?: string; other?: RivalId }
  /** A rival's Respect toward the player changed. */
  respect: { rival: RivalId; change: number; reason: string }
  /** A rival's disposition toward the player changed. */
  disposition: { rival: RivalId; from: Disposition; to: Disposition }
  /** A Rim front changed state, or a rival became Emboldened or Humbled. */
  front: { front: FrontId; state: Disposition; track: number }
  /** A Border Campaign between two rivals (Ch 12). */
  borderCampaign: { attacker: RivalId; defender: RivalId; hexId: string; taken: boolean }
  /** A weight Milestone broke (Ch 9). */
  milestone: { index: number; mark: number; byDispensation: boolean }
  /** The Crown's Grace moved a level (Ch 9). */
  grace: { from: GraceLevel; to: GraceLevel }
  /** A contract was paid or withdrawn (Ch 4). */
  contract: { contractId: string; outcome: 'paid' | 'withdrawn'; score: number; payout: number; pledgeReturn: number }
  /** A Healer check-in fired (Ch 16). */
  healer: { checkIn: string }
  /** A Grand Battle was announced, queued or fought (Ch 11). */
  grandBattle: { battleId: string; trigger: string; hexId: string; stage: 'announced' | 'queued' | 'fought'; result?: BattleOutcome }
  /** A coalition formed, broke or ended (Ch 13). */
  coalition: { members: RivalId[]; trigger: Coalition['trigger']; stage: 'formed' | 'broken' | 'ended' }
  /** A world event fired (Ch 13). */
  worldEvent: { eventId: string }
  /** The Archmage cast a Ritual. */
  ritual: { ritualId: string }
  /** Ascendancy warnings, Ultimatums and Sieges (Ch 14). */
  ascendancy: { rival: RivalId; stage: 'warning' | 'ultimatum' | 'lifted' | 'delayed' | 'siege' }
  /** A rival was resolved (Ch 14). */
  rivalResolved: { rival: RivalId; how: 'conquered' | 'abdicated' | 'allied' }
  /** The campaign ended (Ch 14). */
  campaignEnd: { outcome: 'won' | 'fallen' }
  /** A campaign week closed (T06): its number and the behavior income it paid (tithes not included). */
  weekClosed: { week: number; income: number }
  /** A ledger correction inside the grace window was taken in (A-02); `adjustment` is what the purse gained. */
  correction: { correctedDay: ISODate; adjustment: number }
}

export type GameEventKind = keyof GameEventMap

export type GameEvent = {
  [K in GameEventKind]: { id: string; day: ISODate; kind: K } & GameEventMap[K]
}[GameEventKind]

// ── The campaign's state: one slice per system ───────────────────────────────

export interface ContractsState {
  active?: LandContract
  queued?: LandContract
  history: LandContract[]
  respiteBank: number
}

export interface PurseState {
  events: PurseEvent[]
}

export interface WeightState {
  milestones: MilestoneState[]
  grace: GraceLevel
  /** The Healer's current calorie floor, once computed. */
  healerFloor?: number
  /** One record per week close, oldest first. */
  weeks: WeightWeek[]
  /** The last goal change; the founding goal is not a change. */
  goalChangedOn?: ISODate
}

export interface FrontState {
  front: FrontId
  rivals: [RivalId, RivalId]
  state: Disposition
  /** −3..+3; positive favors the first rival in `rivals`. */
  track: number
}

export interface Deal {
  id: string
  rival: RivalId
  kind: 'buyHex' | 'sellHex' | 'truce' | 'pact' | 'callToArms'
  madeOn: ISODate
  until?: ISODate
  hexId?: string
  target?: RivalId
  price: number
}

export interface CampaignState {
  campaign: Campaign
  charter: Charter
  hexes: HexState[]
  /** Tier of each building, 1 to 5. */
  buildings: Record<BuildingId, BuildingTier>
  castleTier: CastleTier
  /** Stage of each Crossing raised so far. */
  crossings: Partial<Record<CrossingId, CrossingStage>>
  roster: Company[]
  contracts: ContractsState
  purse: PurseState
  weight: WeightState
  rivals: Record<RivalId, RivalState>
  fronts: Record<FrontId, FrontState>
  courtships: Courtship[]
  deals: Deal[]
  orders: DailyOrders[]
  grandBattles: GrandBattle[]
  coalitions: Coalition[]
  worldEvents: WorldEvent[]
  log: GameEvent[]
  /** The last campaign day settled, and the campaign week it fell in. */
  settledThrough: { day: ISODate; week: number }
  /** What settlement keeps for itself (T06). */
  settlement: SettlementState
}

// ── Settlement (T06) ─────────────────────────────────────────────────────────

/**
 * One ledger day's inputs as settlement read them (A-02). Scores and income are computed from
 * these, never from the ledger, so a ledger edit outside the grace window changes nothing.
 */
export interface DaySnapshot {
  date: ISODate
  steps?: number
  /** kcal logged; undefined means no food was logged. */
  eaten?: number
  dutiesKept: number
  dutiesSworn: number
  /** The day's weigh-in, converted to lb. */
  weightLb?: number
  /** Fitbit's total calories burned (A-06). */
  burned?: number
  /** The perfect-day streak ending on this day. */
  streak: number
  /** What the purse paid for this day's behavior, after rounding: daily, and weekly on a week's last day. */
  paid?: { daily: number; weekly?: number }
}

export interface SettlementState {
  /**
   * Every settled day's inputs, oldest first, plus the days just before the start that the
   * weight and Healer windows look back over (snapshotted at founding).
   */
  snapshots: DaySnapshot[]
  /** The hidden Border Campaign weeks (Ch 12), fixed at founding. Never shown. */
  borderCampaignWeeks: number[]
  /** The last day the app was launched (A-10), as the campaign day open then. */
  lastLaunch?: ISODate
}

// ── Scores, contracts and the purse (T04) ────────────────────────────────────

/**
 * One campaign day as the scoring rules see it. T06 adapts ledger days into these; the score
 * module never reads the ledger itself. `eaten` undefined means no food was logged.
 */
export interface DayRecord {
  date: ISODate
  steps?: number
  eaten?: number
  dutiesKept: number
  dutiesSworn: number
}

/** The three pillars of one week (Ch 4), each 0 to 1. */
export interface Pillars {
  steps: number
  table: number
  duties: number
}

/** A gain or a loss before it is posted to the purse (rounded at posting, A-11). */
export interface PurseLine {
  kind: PurseEventKind
  amount: number
  source: string
}

/** The Steward's Counsel (Ch 4): a suggestion only; it never changes the Charter. */
export interface StewardSuggestion {
  direction: 'gentler' | 'firmer'
  textId: string
  facts: { weeks: number; average: number }
}
