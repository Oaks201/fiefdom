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
// Each list is the single source of its type: loop over the list, never retype it.

/** In the book's usual order, which also breaks ties between rivals. */
export const RIVAL_IDS = ['orc', 'goblin', 'dwarf', 'archmage'] as const
export type RivalId = (typeof RIVAL_IDS)[number]
export type Owner = 'player' | RivalId | 'neutral'
export const BUILDING_IDS = ['barracks', 'merchantHall', 'mageTower', 'foundry'] as const
export type BuildingId = (typeof BUILDING_IDS)[number]
export type Tag = 'steel' | 'coin' | 'arcane' | 'engine'
export type Reach = 'melee' | 'ranged'
/** The between-lands, named by the direction they lie in from the castle. */
export const LANDS = ['north', 'south', 'west', 'east'] as const
export type Land = (typeof LANDS)[number]
/** The six building pairs (Ch 8), named alphabetically as in the book's table. */
export type CrossingId =
  | 'barracksFoundry'
  | 'barracksMageTower'
  | 'barracksMerchantHall'
  | 'foundryMageTower'
  | 'foundryMerchantHall'
  | 'mageTowerMerchantHall'
/** The four Rim fronts between neighboring rivals (Ch 12), each named for the between-land its battlefields lie in. */
export const FRONT_IDS = LANDS
export type FrontId = Land
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
  /** The week start fixed at founding (`settings.weekStartsOn` then). Every rule reads this, never the ledger's current setting. */
  weekStartsOn: WeekStartsOn
  /** T14: medical supervision confirmed at founding: every later Charter check lets the limit sit below the floor (Ch 4, Ch 16). */
  medicalSupervision?: boolean
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
  /** T12: a fallen rival's capital or realm hex, left in ruins (Ch 13). */
  ruins?: boolean
  /** T12: held by the Pretender's rebels (Appendix C): neutral, with their garrison. */
  rebels?: boolean
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
  /** A rival envoy company for one battle, at Respect 50 (Ch 5, A-20). */
  | 'envoy'

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
  /** T12: an Accord's rival's Respect when it was sealed (D-01's 60 × f(Q) from 75). */
  respectAtStart?: number
}

export interface DailyOrders {
  date: ISODate
  assaultTarget?: string
  assault: string[]
  defense: string[]
  /** More assaults, when the realm allows them (Castle IV, the Siege Park; T08). */
  extraAssaults?: { target: string; companies: string[] }[]
  /** The companies the player always fields on defense; the Marshal fills the other banners with his best (T08, D-10). */
  defenseOverride?: string[]
  /** Hired blades for the day's defense battles (Merchant Hall II, A-19; T08). */
  hired?: number
  /** Rival envoy companies for the day's defense battles (Respect 50, A-20; T08). */
  envoys?: RivalId[]
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
  /** T12: the day it was resolved (Ch 14), for the pacing of the next. */
  resolvedOn?: ISODate
  specialFund: number
  /** −3..+3 per front, from this rival's side. */
  frontTracks: Record<string, number>
  /** What the rival AI remembers between turns (T10). Hidden: screens never read it. */
  ai?: RivalMemory
}

/** Where a rival's turn spent its budget (Ch 12 step 2). */
export type RivalSpend = 'army' | 'expand' | 'fortify' | 'special'

/** A village bid a rival placed at its turn; it resolves at the next week close, with the player's bids (A-25, A-141). */
export interface RivalCourtship {
  hexId: string
  bid: number
  placedOn: ISODate
}

/** T10: a rival's memory between turns. Every number in it is hidden. */
export interface RivalMemory {
  /** Village bids waiting for the next week close. */
  courting?: RivalCourtship[]
  /** What its last turn spent most on, for the Herald's rumors. */
  rumor?: RivalSpend
  /** Goblin mercenaries hired for this rival: +15% AV through this day. */
  mercenariesUntil?: ISODate
  /** The Archmage: Rituals cast so far, and the campaign week of the last one. */
  ritualsCast?: number
  lastRitualWeek?: number
  /** The Archmage's Long Night and Veil of Fog hold through these days. */
  longNightUntil?: ISODate
  veilUntil?: ISODate
  /** The Goblin: the campaign week of its last Market purchase. */
  marketWeek?: number
}

export interface Coalition {
  members: RivalId[]
  trigger: 'firstFall' | 'lastAlliance' | 'risingCrown'
  /** Its last day; open-ended (the Last Alliance) until it ends, when this is set. */
  until?: ISODate
  warChest: number
  /** T12: the day it formed. */
  formedOn?: ISODate
  /** T12: the First Fall's third rival, who stays apart at Threat +10. */
  watcher?: RivalId
  /** T12: its Coalition Offensive, once announced. */
  offensive?: string
  /** T12: the campaign week a Goblin member last hired mercenaries for its partner. */
  mercenaryWeek?: number
  /** T12: how it ended early, if it did. */
  broken?: 'offensive' | 'buyout' | 'betrayal' | 'resolved' | 'replaced'
  /** T12: its end has been posted. */
  over?: boolean
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
  /** T11: the hit as dealt, before the target's own multipliers (a Charge, a Brace, Shieldwall); `amount` is what it took. */
  dealt?: number
}

/** A slot on the Grand Battle field: a lane and a rank (Ch 11 "Set the formation"). */
export type SlotKey = `${Lane}:${Rank}`

/** What an Order is aimed at, when it needs a choice: a lane, an enemy company, or an empty slot (T11). */
export interface OrderTarget {
  lane?: Lane
  /** A company's id (an enemy for Bribe, Arcane Ward, Hunter's Mark and Blink Strike). */
  unit?: string
  /** An empty own slot (Reserves). */
  slot?: SlotKey
}

/** One round of a Grand Battle, enough to replay it (Ch 11 rule 4). T12 extends this. */
export interface BattleRoundLog {
  round: number
  intents: Partial<Record<Lane, Intent>>
  order?: string
  swap?: [string, string]
  lines: BattleLogLine[]
  /** T11: every enemy company's intent this round (a special can differ from its lane's). */
  unitIntents?: Record<string, Intent>
  /** T11: the Orders offered this round. */
  offered?: string[]
  /** T11: what the Order played was aimed at. */
  target?: OrderTarget
  /** T11: every company's health after the round, the routed at 0. */
  health?: Record<string, number>
  /** T11: where every company still on the field stands after the round. */
  slots?: Record<string, SlotKey>
}

/** What raised a Grand Battle (Ch 11 "What triggers one"; T12 adds the Coalition Offensive, the Siege and events). */
export type GrandTrigger = 'incursion' | 'gate' | 'capital' | 'mythicHunt' | 'warhost' | 'coalitionOffensive' | 'siege' | 'event'

/** One company on the Grand Battle field as the battle began (T11). */
export interface FieldUnit {
  id: string
  side: 'player' | 'enemy'
  name: string
  /** p, fixed for the battle (Weary and items included). */
  power: number
  /** Health at the start, H = 4 × p (or the mythic's multiple, A-47) with every health effect. */
  health: number
  tags: Tag[]
  reach: Reach
  slot: SlotKey
  /** An enemy's type for matching: its rival, or mythic (A-29). */
  foe?: RivalId | 'mythic'
  /** An enemy's codex unit id (host company, commander or mythic). */
  unit?: string
  /** A company hired for this battle only (Mercenary Contract, Reserves). */
  hired?: boolean
  /** What its items, Elite ability or the Sworn's do on the field, read from the codex when the battle began. */
  mods?: UnitMods
}

/** A company's own battle modifiers (T11), resolved from codex effects when the battle begins. */
export interface UnitMods {
  /** × on the damage it deals (Stormglass Bolts on a ranged company). */
  damage?: number
  /** × on the damage it takes, from one intent or one kind of foe (the Oathsworn, Warding Charms). */
  taken?: { mult: number; fromIntent?: Intent; against?: Foe }[]
  /** Its hits also strike the enemy rear in its lane at this share (the Starwardens). */
  splash?: number
  /** Its damage ignores the enemy's Brace (the Sappers). */
  ignoreBrace?: boolean
  /** Rounds in which it cannot rout (the Sworn: round 1). */
  noRoutRounds?: number[]
  /** The share of its starting health it heals at each round's end (the Healer's Satchel). */
  heal?: number
  /** The power share it adds to every own company in its lane, itself included (Banner of the Realm). */
  lanePower?: number
  /** Mythic specials it shrugs off (a trophy). */
  immune?: MythicSpecial[]
  /** A match that replaces its tags' against one kind of foe (Hunter's Nets). */
  match?: { set: number; against?: Foe }[]
  /** × on the battle's spoils when it fights (the Gold Cloaks). */
  spoils?: number
}

/** What `begin` fixes for the whole battle (T11): replaying from this and the round log rebuilds it exactly. */
export interface BattleSetup {
  /** Readiness R for the whole battle, the Marshal's −0.1 and the Herald's Horn included. */
  readiness: number
  /** The Marshal fought it (Ch 11 rule 1). */
  marshal: boolean
  units: FieldUnit[]
  /** The Order deck in its seeded order; each round deals the next `offer` (never repeated in a battle). */
  deck: string[]
  /** Orders offered a round: 3, 4 with the Leyline Anchor. */
  offer: number
  /** The Herald's Horn was sounded (once a month, A-157). */
  horn?: boolean
  /** Last Stand: below this share of total health the player's damage is multiplied. */
  lastStand?: { below: number; mult: number }
  /** What a company hired by Reserves fields: the Merchant Hall's company (A-19). */
  hire: { power: number; name: string }
  /** The stage behind each Crossing Order in the deck (Earthshatter's damage). */
  orderStages: Record<string, number>
}

export interface GrandBattle {
  id: string
  trigger: GrandTrigger
  hexId: string
  announcedOn: ISODate
  battleDate: ISODate
  enemy: Company[]
  formation?: Record<string, string>
  doctrine?: string
  log?: BattleRoundLog[]
  result?: 'rout' | 'victory' | 'defeat'
  /** T11: the rival whose host it is; for a coalition, its members. */
  rival?: RivalId
  members?: RivalId[]
  /** T11: the power each rival sent, for the Incursion's 40% loss. Hidden: screens never read it. */
  sent?: Partial<Record<RivalId, number>>
  /** T11: a Mythic Hunt's quarry (Appendix C), and whether the 8% reveal raised it. */
  quarry?: string
  revealed?: boolean
  /** T11: fixed when the battle begins. */
  setup?: BattleSetup
  /** T12: companies a side when an event sets it (Ugrak's Challenge: a duel of two). */
  limit?: number
  /** T11: the day it was fought and what it did, once settled. */
  foughtOn?: ISODate
  outcome?: GrandOutcome
  /** T12: an event's id when an event raised it. */
  eventId?: string
}

/** What a Grand Battle's result did (Ch 11 "Outcomes"), for the result card. */
export interface GrandOutcome {
  spoils?: number
  tribute?: number
  reputation?: number
  respect?: number
  /** A hex that changed hands: taken by the player, or lost. */
  hexTaken?: string
  hexLost?: string
  /** A hex scorched instead of lost (rings 0 to 2 never pass). */
  hexScorched?: string
  trophy?: string
  /** Companies Weary after routing, through `wearyUntil`. */
  weary?: string[]
  wearyUntil?: ISODate
  /** The share of the rival's army the battle cost or gave it. */
  armyLoss?: number
  armyGain?: number
  /** A retry may be announced from this day (a lost Gate, Capital or Mythic Hunt). */
  retryFrom?: ISODate
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
export const FOES = ['beast', 'mythic', 'rival', 'militia'] as const
export type Foe = (typeof FOES)[number]

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
export const COST_KINDS = ['tiers', 'crossings', 'items', 'fortification', 'trade'] as const
export type CostKind = (typeof COST_KINDS)[number]
/** A hidden value an effect lets the player see. */
export const REVEAL_KINDS = ['treasury', 'army', 'threatStrength', 'hostRoster'] as const
export type RevealKind = (typeof REVEAL_KINDS)[number]
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
    /** T08: the strike of a conquest attempt on a hex it already contests. */
    restrike?: boolean
    /** T08: a conquest attempt beaten on a contested hex: the contest is over. */
    broken?: boolean
    /** T08: the hex is scorched through this day. */
    scorchedUntil?: ISODate
    /** T08: the hex is contested through this day. */
    contestedUntil?: ISODate
    /** T08: Grand Illusion spared this loss its tribute or its contest. */
    grandIllusion?: boolean
    /** T08: the Royal Hunt turned this beast attack into a hunt worth this much. */
    hunt?: number
  }
  /** The player's daily assault (Ch 6). */
  assault: { hexId: string; owner: Owner; outcome: 'taken' | 'rout' | 'repulsed' | 'revealed'; spoils?: number; wear?: number }
  /** A threat that was announced but never struck: its rival made a Truce or can no longer attack (T08). */
  calledOff: { threat: ThreatKind; hexId: string; rival?: RivalId }
  /** A trophy earned in daily combat or a Mythic Hunt (A-131, A-156); `item` is the trophy granted, if any. */
  trophy: { hexId: string; source: 'mythic' | 'royalHunt' | 'mythicHunt'; lair?: string; item?: string }
  /** A hex changed hands. */
  hexTransfer: { hexId: string; from: Owner; to: Owner; how: 'conquest' | 'influence' | 'trade' | 'reclaim' | 'event' | 'borderCampaign' | 'abdication' }
  /** A courtship resolved at week close (Ch 6). `void`: the village could no longer be courted, and the bid came back in full (T09). */
  courtship: { hexId: string; outcome: 'defected' | 'held' | 'void'; bid: number; loyaltyDrop?: number; winner?: Owner }
  /** A deal with a rival: a hex bought or sold, a Truce, a pact, a call to arms. */
  deal: { rival: RivalId; deal: Deal['kind']; price: number; hexId?: string; target?: RivalId }
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
  /** T14: a contract (or an Accord) was sealed; it starts on `startDate`. */
  contractSealed: { contractId: string; contractKind: LandContract['kind']; termDays: number; pledge: number; startDate: ISODate; endDate: ISODate; rival?: RivalId }
  /** T14: a Respite day was spent on `day`; the contract now ends on `endDate`. */
  respite: { contractId: string; day: ISODate; endDate: ISODate }
  /** T14: the Charter was revised between contracts. */
  charter: { stepPool: number; calorieLimit: number; duties: string[] }
  /** A Healer check-in fired (Ch 16). */
  healer: { checkIn: string }
  /** A Grand Battle was announced, queued or fought (Ch 11). `refused`: a trigger that could not be raised (T11). */
  grandBattle: {
    battleId: string
    trigger: string
    hexId: string
    stage: 'announced' | 'queued' | 'fought' | 'refused' | 'cancelled'
    result?: BattleOutcome
    /** T11: the day it is fought; for a queued battle, the day it moved to. */
    battleDate?: ISODate
    rival?: RivalId
    quarry?: string
    /** T11: fought by the Marshal at the day's close. */
    marshal?: boolean
    /** T11: why a trigger was refused. */
    reason?: string
  }
  /** A coalition formed, broke or ended (Ch 13). */
  coalition: { members: RivalId[]; trigger: Coalition['trigger']; stage: 'formed' | 'broken' | 'ended' }
  /** A world event fired (Ch 13); T12 adds when its effect holds and the plain facts screens need. */
  worldEvent: { eventId: string; from?: ISODate; until?: ISODate; rival?: RivalId; other?: RivalId; hexIds?: string[]; item?: string; outcome?: string }
  /** The Archmage cast a Ritual. */
  ritual: { ritualId: string; until?: ISODate; hexId?: string; companyId?: string }
  /** Ascendancy warnings, Ultimatums and Sieges (Ch 14). `until`: the Siege's day; `members`: a coalition's. */
  ascendancy: { rival: RivalId; stage: 'warning' | 'ultimatum' | 'lifted' | 'delayed' | 'siege' | 'humbled'; until?: ISODate; members?: RivalId[]; price?: number }
  /** A rival was resolved (Ch 14). */
  rivalResolved: { rival: RivalId; how: 'conquered' | 'abdicated' | 'allied' }
  /** The campaign ended (Ch 14). */
  campaignEnd: { outcome: 'won' | 'fallen' }
  /** A campaign week closed (T06): its number and the behavior income it paid (tithes not included). */
  weekClosed: { week: number; income: number }
  /** A ledger correction inside the grace window was taken in (A-02); `adjustment` is what the purse gained. */
  correction: { correctedDay: ISODate; adjustment: number }
  /** T11: what a broken Milestone opened (Ch 9 unlock table), for the Milestone card. */
  unlock: { milestone: number; unlocks: string[] }
  /** T11: an Armory action: an item bought or equipped, a Wing chosen, an Elite recruited or promoted, the Sworn. */
  armory: { action: 'buy' | 'equip' | 'unequip' | 'wing' | 'recruit' | 'promote' | 'sworn' | 'armorer'; id: string; companyId?: string; cost?: number }
}

export type GameEventKind = keyof GameEventMap

export type GameEvent = {
  [K in GameEventKind]: { id: string; day: ISODate; kind: K } & GameEventMap[K]
}[GameEventKind]

/** Posts a game event; whoever hands out the emitter dates it and adds it to the log. */
export type Emit = <K extends GameEventKind>(kind: K, payload: GameEventMap[K]) => void

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
  /** T12 adds `buyout`: a coalition member paid to walk away (Ch 13). */
  kind: 'buyHex' | 'sellHex' | 'truce' | 'pact' | 'callToArms' | 'buyout'
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
  /** Wings, Elites, the Sworn and the item stash (T14). Absent means none yet. */
  armory?: ArmoryState
  /** The threat schedule, the dawn tidings, conquest attempts and contested hexes (T08). Absent means none yet. */
  combat?: CombatState
  /** What the living world remembers between week closes (T12). Absent means nothing yet. */
  world?: WorldState
}

// ── The living world and the endgame (T12) ───────────────────────────────────

/** A resolution waiting for Ch 14's pacing (no rival before week 12, one per 8 weeks). */
export interface PendingResolution {
  rival: RivalId
  how: 'conquered' | 'abdicated' | 'allied'
  since: ISODate
}

/** Something the player may take up for a while: the Goblin buying an abdicated hex, keeping a rising village, an envoy's ask. */
export type WorldOffer =
  | { kind: 'goblinBuys'; hexId: string; price: number; until: ISODate }
  | { kind: 'uprising'; hexId: string; price: number; until: ISODate }
  | { kind: 'envoys'; rival: RivalId; foe: RivalId; until: ISODate }

export interface WorldState {
  /** Week closes in a row the player's Power stood at 1.5× the average rival's, before any rival was resolved (the Rising Crown). */
  risingStreak: number
  /** How many rivals were resolved when the coalition triggers last looked. */
  resolvedSeen: number
  /** Week closes in a row each conquered village of the player's has had loyalty under 20 (the Village Uprising). */
  lowLoyalty: Record<string, number>
  /** Rivals (or coalitions, by their first member) whose Power last stood above 1.3× the player's: the Herald warns on crossing. */
  warned: RivalId[]
  /** The day the player bent the knee (once a campaign). */
  bentKnee?: ISODate
  pending: PendingResolution[]
  offers: WorldOffer[]
  /** Companies lent to an envoy, away for a day (Appendix C "Envoys"). */
  lent?: { companyId: string; day: ISODate }[]
  /** The Grand Auction's lots, open until `until` (Appendix C). Bids are sealed: screens show only the player's. */
  auction?: { until: ISODate; lots: { hexId: string; bids: Partial<Record<'player' | RivalId, number>> }[] }
}

// ── Daily combat (T08) ───────────────────────────────────────────────────────

/** The day's one daily threat (Ch 10); conquest attempts come on top of it. */
export type DailyThreatKind = 'beasts' | 'mythic' | 'raid'

/** One day of the threat schedule: its type and raider, drawn at the week close before it (A-28). */
export interface ScheduledThreat {
  date: ISODate
  kind: DailyThreatKind
  rival?: RivalId
}

/** The day's threat as the Herald announces it at dawn: its target and strength are fixed then (A-28). */
export interface Tiding {
  date: ISODate
  kind: DailyThreatKind
  hexId: string
  rival?: RivalId
  /** Exact strength. Screens show it only through `tidings()`, which bands it unless revealed. */
  strength: number
  siegeDay: boolean
}

/** A rival conquest attempt, announced the day before it strikes (Ch 10). T10 plans them. */
export interface ConquestAttempt {
  rival: RivalId
  hexId: string
  announcedOn: ISODate
  date: ISODate
  strength: number
}

/** A hex a conquest attempt has beaten once: the same force strikes again each day until `until` (Ch 10). */
export interface ContestedHex {
  hexId: string
  rival: RivalId
  strength: number
  /** The day the attempt first won. */
  since: ISODate
  /** The last day it holds; a loss on this day passes the hex at the next dawn. */
  until: ISODate
}

export interface CombatState {
  /** The coming days' threat types and raiders. */
  schedule: ScheduledThreat[]
  /** Tidings fixed at dawn (and foretold days) for days not yet settled. */
  tidings: Tiding[]
  /** Conquest attempts announced and not yet struck. */
  conquests: ConquestAttempt[]
  contested: ContestedHex[]
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
  /** T12: the day the player last came back from 14 or more days away (A-10): no Siege falls within 7 days of it. */
  returnedOn?: ISODate
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

// ── Realm effects and the armory slice (T07) ─────────────────────────────────

/**
 * What T14 fills: the Wings chosen, the Elites recruited, the Sworn and the items owned. Equipped
 * items live on each company's `items` in `CampaignState.roster`. T07 reads this slice; until
 * T14 writes it, it is absent and reads as empty.
 */
export interface ArmoryState {
  /** Wing ids chosen, permanently (Appendix C). */
  wings: string[]
  /** Elite companies recruited, by codex id, at rank 1 or 2. */
  elites: { id: string; rank: 1 | 2 }[] // rules-ok: literal type
  /** The Sworn (Milestone 7), with the two tags chosen once (A-21). */
  sworn?: { tags: Tag[] }
  /** Item ids owned and not equipped on any company. */
  stash: string[]
  /** The company holding the Armorer Wing's third item slot. */
  armorerCompany?: string
}

/** Where an effect's value comes from, for tooltips. Screens turn these into labels. */
export type EffectSourceRef =
  | { kind: 'base' }
  | { kind: 'castle'; tier: CastleTier }
  | { kind: 'building'; id: BuildingId; tier: BuildingTier }
  /** A Crossing at a stage (its hybrid, its signature Order). */
  | { kind: 'crossing'; id: CrossingId; stage: CrossingStage }
  /** A Crossing perk (Ch 8). */
  | { kind: 'perk'; id: string; crossing: CrossingId }
  /** A Milestone boon (Ch 9): the Proving Grounds, the Healing Springs and so on. */
  | { kind: 'milestone'; index: number; boon: string }
  | { kind: 'wing'; id: string }
  /** An item equipped on `company`. */
  | { kind: 'item'; id: string; company: string }
  /** A lair sealed by taking its Lair Mouth (Ch 3 rule 5). */
  | { kind: 'lair'; id: string }
  /** The Crown's Grace at a level (Ch 9). */
  | { kind: 'grace'; level: GraceLevel }
  /** A Weary company, through `until` (Ch 10, A-123). */
  | { kind: 'weary'; until: ISODate }
  /** A world event in force (Ch 13), by its codex id (T12). */
  | { kind: 'event'; id: string }

export interface Contribution {
  from: EffectSourceRef
  value: number
}

/**
 * A number and what produced it. With `op: 'add'` the contributions sum to `value`; with
 * `op: 'mult'` they multiply to it (an empty list is 1).
 */
export interface Sourced {
  value: number
  op: 'add' | 'mult'
  sources: Contribution[]
}

/** A switch and what turned it on. */
export interface Flag {
  on: boolean
  sources: EffectSourceRef[]
}

/** How much of a hidden value the player may see. */
export interface Reveal {
  whom: 'none' | 'neighbors' | 'all'
  sources: EffectSourceRef[]
}

/** A codex effect and where it comes from, passed on for the battle engines to interpret. */
export interface Grant {
  effect: Effect
  from: EffectSourceRef
}

/** An Order or a Doctrine the realm holds, and what granted it. */
export interface Unlocked {
  id: string
  from: EffectSourceRef
}

/**
 * Every realm-wide modifier in one answer (T07 `realmEffects`). Combat, the economy and screens
 * read these instead of asking where a bonus comes from. Shares are fractions (0.05 = 5%).
 */
export interface Effects {
  /** Banners in every battle: the castle tier, +1 with the Crown Forge. */
  banners: Sourced
  /** Extra banners for one pool only (the Muster Field adds to the assault pool). */
  poolBanners: { defense: Sourced; assault: Sourced }
  /** Walls W: the castle's, the Foundry tier's, Bastions and the Anvil-Heart. */
  walls: Sourced
  /** Walls that count double in some battles (Shieldwall on rings 4 and 5, Runed Walls against mythics). Read with `wallsFor`. */
  wallsDouble: { rings?: number[]; against?: Foe; from: EffectSourceRef }[]
  /** The arms bonus `a`: the Foundry tier's total (A-31). */
  armsBonus: Sourced
  /** Company power bonuses that belong in `p`: the Proving Grounds (all), ranged bonuses, and a building company's own. */
  companyPower: { all: Sourced; ranged: Sourced; buildingCompany: Record<BuildingId, Sourced> }
  /** The Crownguard Ascendant's power bonus (Milestone 10). */
  crownguardBonus: Sourced
  /** The rally floor `r`. */
  rallyFloor: Sourced
  /** Mythic strength multiplier from everywhere but the lairs. */
  mythicStrength: Sourced
  /** Mythic strength multiplier by lair side, the lair's seal included. */
  mythicStrengthBySide: Partial<Record<Land, Sourced>>
  /** Rival raid strength multiplier (the Spy Network). */
  raidStrength: Sourced
  /** The reputation bonus rate; rates add (A-31). */
  reputationBonus: Sourced
  /** The pledge cap multiplier (Merchant Hall III). */
  pledgeCap: Sourced
  /** The share of every pledge that returns at least (Merchant Hall IV). */
  minPledgeReturn: Sourced
  /** The Respite bank's cap. */
  respiteBank: Sourced
  courtshipSlots: Sourced
  dailyAssaults: Sourced
  /** Days of warning before a threat strikes or a Grand Battle starts. `raidsOnRoad` adds to `raids` along one road. */
  foretell: { threats: Sourced; raids: Sourced; raidsOnRoad: Partial<Record<BuildingId, Sourced>>; grandBattles: Sourced }
  /** Which hidden values the player may see as numbers. */
  reveals: Record<RevealKind, Reveal>
  /** Village tithe multiplier. */
  titheMult: Sourced
  /** T12: cuts to tithes, multiplied after `titheMult` (the Hungry Winter; reductions multiply, A-126). */
  titheCut: Sourced
  /** Cost multipliers by what is bought. */
  costs: Record<CostKind, Sourced>
  /** Spoils multiplier by the kind of foe beaten. */
  spoils: Record<Foe, Sourced>
  /** Tribute multiplier on a lost battle (Grace II, Oathguard). */
  tribute: Sourced
  /** Days a contested hex holds before it falls (Grace II). */
  contestedDays: Sourced
  /** Item slots per company (Milestones 1 and 4); 0 before the Armory opens. */
  itemSlots: Sourced
  /** Companies that may carry one more item (the Armorer). */
  extraItemSlots: Sourced
  /** Hired blades for daily battles (Merchant Hall II). */
  hiredBlades: Flag
  /** The player's daily assaults ignore fortification (Siegebreakers). */
  assaultIgnoresFortification: Flag
  /** One beast attack a week becomes a hunt (the Royal Hunt). */
  royalHunt: { on: boolean; reputation: number; trophy: boolean; perWeek: number; sources: EffectSourceRef[] }
  /** Lost battles a week that cost no tribute and contest no hex (Grand Illusion). */
  grandIllusion: Sourced
  /** Trust added to the player's bids (Envoy's Rest). */
  trust: Sourced
  /** Weekly interest on the purse (The Bank). */
  interest: { rate: number; cap: number; sources: EffectSourceRef[] }
  /** Event hints a month (the Scrying Pool). */
  eventHints: Sourced
  /** Days added to every Weary status (the Veterans' Hall takes one off). */
  wearyDays: Sourced
  /** Orders offered per Grand Battle round. */
  ordersOffered: Sourced
  /** Grand Battle Readiness never below this (0 = no floor). */
  readinessFloor: Sourced
  /** The Order deck. */
  orders: Unlocked[]
  /** The Doctrines the player may pick from. */
  doctrines: Unlocked[]
  /** The Crossing perks in force, by perk id (a replaced perk is not listed). */
  perks: Unlocked[]
  /** Realm-wide effects no field above covers (Grand Battle effects), for T12 to interpret. */
  battle: Grant[]
}
