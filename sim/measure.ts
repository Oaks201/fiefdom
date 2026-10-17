/**
 * The day and week measures behind the blueprint's targets (Patch 2, blueprint sections 3.2 and 7):
 * what each settled day held for the player, and what each week close stood at. `runCampaign`
 * records them as it plays; `targets.ts` turns them into the G-01 to G-17 report.
 *
 * A day's labels (blueprint 3.2):
 * - **Land**: the player gained or lost a hex that day.
 * - **Grand**: a Grand Battle was fought that day.
 * - **Build**: something new was bought or unlocked: a tier, castle tier, Crossing, Armory item,
 *   Wing, Elite, the Sworn or a Milestone.
 * - **Choice**: at dawn, two or more hexes were within the army's reach (the whole army's Assault at
 *   yesterday's Valor beats the garrison).
 * - **No reach**: at dawn, no hex was within reach.
 * - **In doubt**: a defense banded Matched or worse at dawn, a defense lost, or an assault repulsed.
 * - **Auto battle**: a defense was fought that day.
 * - **Breach** (Patch 3, C-27): a repulsed assault left its target within the next day's reach: at
 *   the next dawn, it would fall to the Assault that wore it. Player-view meaningful (G-01).
 * - **No target** (Patch 3, C-27): at dawn, no hex would fall within `RULES.autoplay.siegeHorizon`
 *   assault days at the whole army's Assault, wear counted (G-03). "No reach" stays the strict
 *   reading: no hex falls today.
 */
import { pickAssault, siegeReach, type AutoplayPlan } from '../src/renderer/src/lib/game/autoplay'
import { addDays, isWeekCloseDay } from '../src/renderer/src/lib/game/clock'
import { assaultGarrison, tidings } from '../src/renderer/src/lib/game/combat'
import { PURSE_SOURCES, sourcePrefix } from '../src/renderer/src/lib/game/dev/invariants'
import { pathRank, pathTotals, renown } from '../src/renderer/src/lib/game/dominion'
import { isClaimableKind, regionsOf } from '../src/renderer/src/lib/game/map'
import { marchesOf } from '../src/renderer/src/lib/game/marches'
import { valorOn } from '../src/renderer/src/lib/game/settle'
import { weekOn } from '../src/renderer/src/lib/game/state'
import { BUILDING_IDS, RIVAL_IDS, STANCE_BANDS, type CampaignState, type GameEvent, type HexState, type ISODate, type RivalId } from '../src/renderer/src/lib/game/types'

export const LABEL = { land: 1, grand: 2, build: 4, choice: 8, noReach: 16, doubt: 32, auto: 64, breach: 128, noTarget: 256 } as const

/** Assault days per hex taken are counted up to this; longer sieges count here (the last bucket). */
export const SIEGE_DAYS_CAP = 10

/** One week close's standing. */
export interface WeekMeasure {
  week: number
  /** Hexes the player holds at the close (castle and buildings included). */
  held: number
  gained: number
  lost: number
  /** The week's mean Valor. */
  valor: number
  /** Defenses banded Matched or worse at dawn. */
  doubtDefenses: number
  /** Dominion on each path, in RIVAL_IDS order. */
  paths: number[]
  /** Each building's tier, in BUILDING_IDS order. */
  tiers: number[]
  /** Claimable hexes held, Lair Mouths aside, and how many there are. */
  claimableHeld: number
  claimable: number
  /** Patch 5 (G-20): each rival's Respect at the close, in RIVAL_IDS order; null once he is resolved. */
  respect?: (number | null)[]
  /** Patch 5 (G-20): each rival's standing toward the player at the close, one letter each in RIVAL_IDS order: p, t, w, or - once resolved. */
  standing?: string
}

export interface Measures {
  /** One label mask per settled day, from the campaign's first day. */
  days: number[]
  weeks: WeekMeasure[]
  /** At the week-26 close: the mean garrison (as an assault must beat it) of hexes the player doesn't hold, by march. */
  week26Garrison?: Record<string, number>
  /** At the week-26 close: each rival march's preparation level, in RIVAL_IDS order (D-19). */
  week26Preparation?: number[]
  /** At the end: each march's share of claimable hexes the player doesn't hold. */
  unheld: Record<string, number>
  /** The same at the week-`G05_WEEK` close (T-04: G-05's reading until Patch 5 sets victory). */
  week60Unheld?: Record<string, number>
  /** The size of the campaign state, as `campaign.json` would hold it, at the end. */
  bytes: number
  /** The first week any path reached rank V (Patch 2 Dominion). */
  rankV?: number
  /** Renown from deeds on each path at the end, in RIVAL_IDS order (Patch 2 Dominion). */
  deeds?: number[]
  /** Renown posted by the end, by deed kind, every path summed (P2-13's mix; Patch 3's stronghold and counterattack deeds, D-25). */
  deedMix?: Record<string, number>
  /** Daily assaults won, by a rout and without one (Patch 3: G-09's share counts fallbacks against the non-rout wins). */
  assaultWins: { rout: number; nonRout: number }
  /** Hexes taken by daily assault, by the assault days spent on each (index 1 to `SIEGE_DAYS_CAP`; the last counts longer sieges too). */
  siegeDays: number[]
  /**
   * Patch 3 (G-09): garrisons that fell back after a daily assault; the dawns after a close that
   * posted one; and of those, the dawns whose assault target (the automatic player's pick) differs
   * from the one it would have chosen without that close's fallbacks.
   */
  fallbacks: { posted: number; dawns: number; changed: number }
  /** Patch 3 (D-24): counterattacks fought, held and lost. */
  counterattacks: { held: number; lost: number }
  /** Patch 4 (G-10): each rival march's land, battles and sieges (a hex's own march; a seam counts for its first). */
  marches: Record<RivalId, MarchMeasure>
  /** Patch 4 (G-10): weeks from `SURGE_FROM_WEEK` with a surge touching a hex the player could assault that day, and the weeks counted. */
  surgeWeeks: { hit: number; weeks: number }
  /** Patch 4 (G-18): terms offered (and before week 16), refused or lapsed, rivals resolved by terms, and the first week each rival reached each stance band. */
  terms: { offered: number; before16: number; refused: number; byTerms: number; firstOffer?: number; firstBand: Record<RivalId, (number | null)[]> }
  /** Patch 5 (G-20): each rival's Respect changes by reason over the campaign: [how many, their sum]. */
  respectReasons?: Record<RivalId, Record<string, [number, number]>>
  /** Patch 5 (X-15): the campaign week each world event first fired. */
  eventWeeks?: Record<string, number>
  /** Patch 5 (G-21): reputation earned by the end: behavior income, tithes, spoils (battles and land), and every other gain. */
  income?: { behavior: number; tithe: number; spoils: number; other: number }
}

/** Patch 4 (G-10): one rival march, over the campaign. */
export interface MarchMeasure {
  /** Hexes held there, summed over the week closes, and the closes counted (their mean is the march's land held). */
  heldSum: number
  closes: number
  /** Hexes the player took there for the first time, by force (assault, Grand Battle) and by deal (courtship, trade, bribe). */
  firstForce: number
  firstDeal: number
  /** Hexes lost there. */
  lost: number
  /** Defense battles fought on hexes there. */
  defenses: number
  /** Assault days spent on hexes taken there by daily assault, and those hexes. */
  assaultDays: number
  assaultTaken: number
  /** Hexes there taken, lost and taken again. */
  bothWays: number
}

/** The march a hex lies in, for the per-march measures (the heartland is `heartland`). */
export function marchKey(h: HexState): string {
  return regionsOf(h)[0] ?? 'heartland'
}

const BUILD_SPENDS = /^(tier|castle|crossing):/
const BUILD_ARMORY = new Set(['buy', 'wing', 'recruit', 'promote', 'sworn'])
const DOUBT_BANDS = new Set(['matched', 'stronger', 'overwhelming'])
const WEEK26 = 26
const RANK_V = 5
/**
 * T-04 (approved 2026-10-15): with no victory, G-05 is read at this week's close, the middle of
 * G-11's Steadfast victory window (58 to 64), until Patch 5 sets victory.
 */
export const G05_WEEK = 60
/** Patch 4 (G-10): surges are counted from this week (C-37: the rules that make a march harder start then). */
export const SURGE_FROM_WEEK = 3
/** Patch 4 (G-18): no rival may offer terms before this week. */
export const TERMS_FROM_WEEK = 16
const DEAL_WAYS: ReadonlySet<string> = new Set(['influence', 'trade', 'bribe'])
const FORCE_WAYS: ReadonlySet<string> = new Set(['conquest'])
const SURGE_SWINGS: ReadonlySet<string> = new Set(['swell', 'ebb', 'summoning'])

function emptyMarch(): MarchMeasure {
  return { heldSum: 0, closes: 0, firstForce: 0, firstDeal: 0, lost: 0, defenses: 0, assaultDays: 0, assaultTaken: 0, bothWays: 0 }
}

/** Each march's share of its claimable hexes the player doesn't hold. */
function unheldShares(state: CampaignState): Record<string, number> {
  const all: Record<string, number> = {}
  const unheld: Record<string, number> = {}
  for (const h of state.hexes) {
    if (!isClaimableKind(h)) continue
    const k = marchKey(h)
    all[k] = (all[k] ?? 0) + 1
    if (h.owner !== 'player') unheld[k] = (unheld[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.keys(all).map((k) => [k, (unheld[k] ?? 0) / all[k]]))
}

/** Records a campaign day by day: call `dawn` before the player acts, `close` after the day settles. */
export class Recorder {
  readonly m: Measures = {
    days: [],
    weeks: [],
    unheld: {},
    bytes: 0,
    assaultWins: { rout: 0, nonRout: 0 },
    siegeDays: Array.from({ length: SIEGE_DAYS_CAP + 1 }, () => 0),
    fallbacks: { posted: 0, dawns: 0, changed: 0 },
    counterattacks: { held: 0, lost: 0 },
    marches: Object.fromEntries(RIVAL_IDS.map((r) => [r, emptyMarch()])) as Record<RivalId, MarchMeasure>,
    surgeWeeks: { hit: 0, weeks: 0 },
    terms: { offered: 0, before16: 0, refused: 0, byTerms: 0, firstBand: Object.fromEntries(RIVAL_IDS.map((r) => [r, STANCE_BANDS.map(() => null)])) as Record<RivalId, (number | null)[]> }
  }
  /** Each hex's rival march (a seam's first), for the per-march measures. */
  private marchOf = new Map<string, RivalId>()
  /** Hexes taken once, those lost after, and those taken again (G-10's both ways). */
  private taken = new Set<string>()
  private lostAfter = new Set<string>()
  private both = new Set<string>()
  /** A surge this week touched a hex the player could assault. */
  private surgeHit = false
  /** The day whose close posted fallbacks, for G-09's next dawn. */
  private fellBackOn: ISODate | undefined

  /** `plan`: the automatic player's, so G-09 can ask it what it would have chosen without a fallback. */
  constructor(private readonly plan?: AutoplayPlan) {}
  private mask = 0
  private doubtHexes = new Set<string>()
  private logFrom = 0
  private purseFrom = 0
  private week = { gained: 0, lost: 0, valor: [] as number[], doubtDefenses: 0 }
  /** Daily assaults on each hex since it last changed hands (for assault days per hex taken). */
  private pressed = new Map<string, number>()

  /** Before the player acts on `today`: what is in reach (today, and within the siege horizon), and the dawn bands. */
  dawn(state: CampaignState, today: ISODate): void {
    this.mask = 0
    this.logFrom = state.log.length
    this.purseFrom = state.purse.events.length
    const reach = siegeReach(state, today)
    const inReach = reach.filter((r) => r.today).length
    if (inReach >= 2) this.mask |= LABEL.choice
    if (inReach === 0) this.mask |= LABEL.noReach
    if (reach.length === 0) this.mask |= LABEL.noTarget
    // G-09: the day's target with the last close's fallbacks, and without them.
    if (this.plan && this.fellBackOn !== undefined) {
      const day = this.fellBackOn
      // Patch 4 (C-47): an Archmage force's surge (steered beside the hex it dissolved from) counts as its fallback; without it, no surge today.
      const surges = state.personalities?.surges
      const without: CampaignState = { ...state, fallbacks: (state.fallbacks ?? []).filter((f) => f.day !== day), ...(surges ? { personalities: { ...state.personalities, surges: surges.filter((s) => !(s.date === today && s.steered)) } } : {}) }
      this.m.fallbacks.dawns++
      if (pickAssault(state, today, this.plan)?.hex.id !== pickAssault(without, today, this.plan)?.hex.id) this.m.fallbacks.changed++
    }
    this.fellBackOn = undefined
    this.doubtHexes = new Set(
      tidings(state, today)
        .threats.filter((t) => t.band !== undefined && DOUBT_BANDS.has(t.band))
        .map((t) => t.hexId)
    )
  }

  /** After `today` has settled. */
  close(state: CampaignState, today: ISODate, week: number): void {
    const events = state.log.slice(this.logFrom).filter((e) => e.day === today)
    if (this.marchOf.size === 0) for (const h of state.hexes) if (h.march && (RIVAL_IDS as readonly string[]).includes(h.march)) this.marchOf.set(h.id, h.march as RivalId)
    let mask = this.mask
    for (const e of events) {
      mask |= this.labelOf(e)
      this.track(e, week)
    }
    if (events.some((e) => isBreach(state, e, addDays(today, 1)))) mask |= LABEL.breach
    if (events.some((e) => e.kind === 'fallback' || (e.kind === 'assault' && e.dissolved))) this.fellBackOn = today
    for (const p of state.purse.events.slice(this.purseFrom)) if (p.date === today && p.kind === 'spend' && BUILD_SPENDS.test(p.source)) mask |= LABEL.build
    this.m.days.push(mask)
    this.week.valor.push(valorOn(state, today, state.campaign.weekStartsOn))
    if (isWeekCloseDay(today, state.campaign.weekStartsOn)) this.closeWeek(state, week)
  }

  private labelOf(e: GameEvent): number {
    switch (e.kind) {
      case 'hexTransfer':
        if (e.to === 'player') this.week.gained++
        if (e.from === 'player') this.week.lost++
        this.pressed.delete(e.hexId)
        return e.to === 'player' || e.from === 'player' ? LABEL.land : 0
      case 'grandBattle':
        return e.stage === 'fought' ? LABEL.grand : 0
      case 'armory':
        return BUILD_ARMORY.has(e.action) ? LABEL.build : 0
      case 'milestone':
      case 'unlock':
        return LABEL.build
      case 'fallback':
        this.m.fallbacks.posted++
        return 0
      case 'defense': {
        if (e.threat === 'counterattack') this.m.counterattacks[e.outcome === 'defeat' ? 'lost' : 'held']++
        const banded = this.doubtHexes.has(e.hexId)
        if (banded) this.week.doubtDefenses++
        return LABEL.auto | (banded || e.outcome === 'defeat' ? LABEL.doubt : 0)
      }
      case 'assault': {
        if (e.outcome === 'revealed') return 0
        const days = (this.pressed.get(e.hexId) ?? 0) + 1
        if (e.outcome === 'repulsed') {
          this.pressed.set(e.hexId, days)
          return LABEL.doubt
        }
        this.m.assaultWins[e.outcome === 'rout' ? 'rout' : 'nonRout']++
        // Patch 4 (C-47): an Archmage garrison that dissolved into a surge counts as fallen back (G-09).
        if (e.dissolved) this.m.fallbacks.posted++
        this.m.siegeDays[Math.min(days, SIEGE_DAYS_CAP)]++
        const march = this.marchOf.get(e.hexId)
        if (march) {
          this.m.marches[march].assaultDays += days
          this.m.marches[march].assaultTaken++
        }
        this.pressed.delete(e.hexId)
        return 0
      }
      default:
        return 0
    }
  }

  /** Patch 4's per-march, surge and terms counters (G-10, G-18). */
  private track(e: GameEvent, week: number): void {
    switch (e.kind) {
      case 'hexTransfer': {
        const march = this.marchOf.get(e.hexId)
        if (!march) return
        const m = this.m.marches[march]
        if (e.to === 'player') {
          if (!this.taken.has(e.hexId)) {
            this.taken.add(e.hexId)
            if (DEAL_WAYS.has(e.how)) m.firstDeal++
            else if (FORCE_WAYS.has(e.how)) m.firstForce++
          } else if (this.lostAfter.has(e.hexId) && !this.both.has(e.hexId)) {
            this.both.add(e.hexId)
            m.bothWays++
          }
        } else if (e.from === 'player') {
          m.lost++
          if (this.taken.has(e.hexId)) this.lostAfter.add(e.hexId)
        }
        return
      }
      case 'defense': {
        const march = this.marchOf.get(e.hexId)
        if (march) this.m.marches[march].defenses++
        return
      }
      case 'surge':
        if (e.target && SURGE_SWINGS.has(e.surge) && week >= SURGE_FROM_WEEK) this.surgeHit = true
        return
      case 'terms': {
        const t = this.m.terms
        if (e.stage === 'offered') {
          t.offered++
          if (week < TERMS_FROM_WEEK) t.before16++
          if (t.firstOffer === undefined) t.firstOffer = week
        } else if (e.stage === 'refused' || e.stage === 'lapsed') t.refused++
        else if ((e.stage === 'accepted' && e.offer === 'surrender') || (e.stage === 'won' && (e.offer === 'finalWarhost' || e.offer === 'challenge'))) t.byTerms++
        return
      }
      case 'stance': {
        const first = this.m.terms.firstBand[e.rival]
        const reached = STANCE_BANDS.indexOf(e.to)
        for (let b = 1; b <= reached; b++) if (first[b] === null) first[b] = week
        return
      }
      default:
        return
    }
  }

  private closeWeek(state: CampaignState, week: number): void {
    for (const r of RIVAL_IDS) {
      const m = this.m.marches[r]
      m.heldSum += state.hexes.filter((h) => h.owner === 'player' && this.marchOf.get(h.id) === r).length
      m.closes++
    }
    if (week >= SURGE_FROM_WEEK) {
      this.m.surgeWeeks.weeks++
      if (this.surgeHit) this.m.surgeWeeks.hit++
    }
    this.surgeHit = false
    const totals = pathTotals(state)
    const claimable = state.hexes.filter((h) => isClaimableKind(h) && h.kind !== 'lairMouth')
    const valors = this.week.valor
    this.m.weeks.push({
      week,
      held: state.hexes.filter((h) => h.owner === 'player').length,
      gained: this.week.gained,
      lost: this.week.lost,
      valor: valors.length > 0 ? valors.reduce((s, v) => s + v, 0) / valors.length : 0,
      doubtDefenses: this.week.doubtDefenses,
      paths: RIVAL_IDS.map((r) => totals[r]),
      tiers: BUILDING_IDS.map((b) => state.buildings[b]),
      claimableHeld: claimable.filter((h) => h.owner === 'player').length,
      claimable: claimable.length,
      respect: RIVAL_IDS.map((r) => (state.rivals[r].status === 'active' ? state.rivals[r].respect : null)),
      standing: RIVAL_IDS.map((r) => (state.rivals[r].status === 'active' ? state.rivals[r].disposition.player[0] : '-')).join('')
    })
    if (week === WEEK26) {
      this.m.week26Garrison = meanGarrisonByMarch(state, state.settledThrough.day)
      this.m.week26Preparation = RIVAL_IDS.map((r) => marchesOf(state).preparation[r])
    }
    if (week === G05_WEEK) this.m.week60Unheld = unheldShares(state)
    if (this.m.rankV === undefined && RIVAL_IDS.some((r) => pathRank(state, r) >= RANK_V)) this.m.rankV = week
    this.week = { gained: 0, lost: 0, valor: [], doubtDefenses: 0 }
  }

  /** At the campaign's end. */
  finish(state: CampaignState): Measures {
    Object.assign(this.m.unheld, unheldShares(state))
    this.m.bytes = JSON.stringify(state).length
    const known = renown(state)
    this.m.deeds = RIVAL_IDS.map((r) => known[r])
    const mix: Record<string, number> = {}
    for (const e of state.log) if (e.kind === 'deed') mix[e.deed] = (mix[e.deed] ?? 0) + e.value
    this.m.deedMix = mix
    const reasons = Object.fromEntries(RIVAL_IDS.map((r) => [r, {}])) as Record<RivalId, Record<string, [number, number]>>
    const eventWeeks: Record<string, number> = {}
    for (const e of state.log) {
      if (e.kind === 'respect') {
        const [n, sum] = reasons[e.rival][e.reason] ?? [0, 0]
        reasons[e.rival][e.reason] = [n + 1, sum + e.change]
      } else if (e.kind === 'worldEvent' && eventWeeks[e.eventId] === undefined) eventWeeks[e.eventId] = weekOn(state, e.day)
    }
    this.m.respectReasons = reasons
    this.m.eventWeeks = eventWeeks
    const behavior = new Set<string>(PURSE_SOURCES.behavior)
    const income = { behavior: 0, tithe: 0, spoils: 0, other: 0 }
    for (const p of state.purse.events) {
      if (p.kind === 'tithe') income.tithe += p.amount
      else if (p.kind === 'spoils') income.spoils += p.amount
      else if (p.kind === 'earn') income[behavior.has(sourcePrefix(p.source)) ? 'behavior' : 'other'] += p.amount
    }
    this.m.income = income
    return this.m
  }
}

/**
 * A breach (C-27): `e` is a repulsed assault whose target, as settlement left it for `nextDay`'s
 * dawn, still has the same holder and would fall to the Assault that wore it.
 */
export function isBreach(state: CampaignState, e: GameEvent, nextDay: ISODate): boolean {
  if (e.kind !== 'assault' || e.outcome !== 'repulsed' || e.value === undefined) return false
  const hex = state.hexes.find((h) => h.id === e.hexId)
  return hex !== undefined && hex.owner === e.owner && assaultGarrison(state, hex, nextDay) <= e.value
}

function meanGarrisonByMarch(state: CampaignState, day: ISODate): Record<string, number> {
  const sum: Record<string, number> = {}
  const n: Record<string, number> = {}
  for (const h of state.hexes) {
    if (!isClaimableKind(h) || h.owner === 'player') continue
    const k = marchKey(h)
    sum[k] = (sum[k] ?? 0) + assaultGarrison(state, h, day)
    n[k] = (n[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.keys(sum).map((k) => [k, sum[k] / n[k]]))
}
