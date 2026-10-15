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
 */
import { hexesInReach } from '../src/renderer/src/lib/game/autoplay'
import { isWeekCloseDay } from '../src/renderer/src/lib/game/clock'
import { assaultGarrison, tidings } from '../src/renderer/src/lib/game/combat'
import { pathRank, pathTotals, renown } from '../src/renderer/src/lib/game/dominion'
import { isClaimableKind, regionsOf } from '../src/renderer/src/lib/game/map'
import { marchesOf } from '../src/renderer/src/lib/game/marches'
import { valorOn } from '../src/renderer/src/lib/game/settle'
import { BUILDING_IDS, RIVAL_IDS, type CampaignState, type GameEvent, type HexState, type ISODate } from '../src/renderer/src/lib/game/types'

export const LABEL = { land: 1, grand: 2, build: 4, choice: 8, noReach: 16, doubt: 32, auto: 64 } as const

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
  /** The size of the campaign state, as `campaign.json` would hold it, at the end. */
  bytes: number
  /** The first week any path reached rank V (Patch 2 Dominion). */
  rankV?: number
  /** Renown from deeds on each path at the end, in RIVAL_IDS order (Patch 2 Dominion). */
  deeds?: number[]
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

/** Records a campaign day by day: call `dawn` before the player acts, `close` after the day settles. */
export class Recorder {
  readonly m: Measures = { days: [], weeks: [], unheld: {}, bytes: 0 }
  private mask = 0
  private doubtHexes = new Set<string>()
  private logFrom = 0
  private purseFrom = 0
  private week = { gained: 0, lost: 0, valor: [] as number[], doubtDefenses: 0 }

  /** Before the player acts on `today`: what is in reach, and the dawn bands. */
  dawn(state: CampaignState, today: ISODate): void {
    this.mask = 0
    this.logFrom = state.log.length
    this.purseFrom = state.purse.events.length
    const inReach = hexesInReach(state, today, false).filter((r) => r.today).length
    if (inReach >= 2) this.mask |= LABEL.choice
    if (inReach === 0) this.mask |= LABEL.noReach
    this.doubtHexes = new Set(
      tidings(state, today)
        .threats.filter((t) => t.band !== undefined && DOUBT_BANDS.has(t.band))
        .map((t) => t.hexId)
    )
  }

  /** After `today` has settled. */
  close(state: CampaignState, today: ISODate, week: number): void {
    const events = state.log.slice(this.logFrom).filter((e) => e.day === today)
    let mask = this.mask
    for (const e of events) mask |= this.labelOf(e)
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
        return e.to === 'player' || e.from === 'player' ? LABEL.land : 0
      case 'grandBattle':
        return e.stage === 'fought' ? LABEL.grand : 0
      case 'armory':
        return BUILD_ARMORY.has(e.action) ? LABEL.build : 0
      case 'milestone':
      case 'unlock':
        return LABEL.build
      case 'defense': {
        const banded = this.doubtHexes.has(e.hexId)
        if (banded) this.week.doubtDefenses++
        return LABEL.auto | (banded || e.outcome === 'defeat' ? LABEL.doubt : 0)
      }
      case 'assault':
        return e.outcome === 'repulsed' ? LABEL.doubt : 0
      default:
        return 0
    }
  }

  private closeWeek(state: CampaignState, week: number): void {
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
      claimable: claimable.length
    })
    if (week === WEEK26) {
      this.m.week26Garrison = meanGarrisonByMarch(state, state.settledThrough.day)
      this.m.week26Preparation = RIVAL_IDS.map((r) => marchesOf(state).preparation[r])
    }
    if (this.m.rankV === undefined && RIVAL_IDS.some((r) => pathRank(state, r) >= RANK_V)) this.m.rankV = week
    this.week = { gained: 0, lost: 0, valor: [], doubtDefenses: 0 }
  }

  /** At the campaign's end. */
  finish(state: CampaignState): Measures {
    const all: Record<string, number> = {}
    const unheld: Record<string, number> = {}
    for (const h of state.hexes) {
      if (!isClaimableKind(h)) continue
      const k = marchKey(h)
      all[k] = (all[k] ?? 0) + 1
      if (h.owner !== 'player') unheld[k] = (unheld[k] ?? 0) + 1
    }
    for (const k of Object.keys(all)) this.m.unheld[k] = (unheld[k] ?? 0) / all[k]
    this.m.bytes = JSON.stringify(state).length
    const known = renown(state)
    this.m.deeds = RIVAL_IDS.map((r) => known[r])
    return this.m
  }
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
