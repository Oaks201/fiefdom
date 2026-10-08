/**
 * A headless rival world for the T10 tests: a founded campaign whose weeks run only the rival
 * week phases (courtship bids, the rival turn, the fronts and Border Campaigns) with a passive
 * player keeping every habit. Daily combat is skipped, so many long runs stay fast.
 */
import { addDays, isWeekCloseDay } from '../../../src/renderer/src/lib/game/clock'
import { resolveCourtships, resolveRivalCourtships } from '../../../src/renderer/src/lib/game/land'
import { isClaimableKind } from '../../../src/renderer/src/lib/game/map'
import { borderCampaigns, rivalBidsAtClose, rivalTurn, settleFronts, type RivalWeek } from '../../../src/renderer/src/lib/game/rivals'
import { shuffle } from '../../../src/renderer/src/lib/game/rng'
import type { CampaignState, Coalition, DayRecord, GameEvent, GameEventKind, GameEventMap } from '../../../src/renderer/src/lib/game/types'

export interface SimOptions {
  /** Neutral hexes in rings 2 to 4 handed to the player at the start (seeded). */
  playerHexes?: number
  /** Coalitions in force from the start. */
  coalitions?: Coalition[]
}

export interface SimWeek {
  week: number
  day: string
  /** The player's hexes just before the week's Border Campaigns. */
  playerHexes: Set<string>
  events: GameEvent[]
}

export interface SimRun {
  state: CampaignState
  weeks: SimWeek[]
  events: GameEvent[]
}

function perfectDay(date: string): DayRecord {
  return { date, steps: 10_000, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3 }
}

/** Runs `weeks` campaign weeks of the rival phases from a founded campaign. */
export function simulateRivals(start: CampaignState, weeks: number, options: SimOptions = {}): SimRun {
  let state = start
  const seed = state.campaign.seed
  if (options.playerHexes) {
    const pool = state.hexes.filter((h) => h.owner === 'neutral' && isClaimableKind(h) && h.ring >= 2 && h.ring <= 4 && h.kind !== 'lairMouth')
    const mine = new Set(shuffle(seed, state.campaign.startDate, 'sim:player', pool.map((h) => h.id)).slice(0, options.playerHexes))
    state = { ...state, hexes: state.hexes.map((h) => (mine.has(h.id) ? { ...h, owner: 'player', garrison: 0 } : h)) }
  }
  if (options.coalitions) state = { ...state, coalitions: options.coalitions }

  const out: SimWeek[] = []
  const all: GameEvent[] = []
  let day = state.campaign.startDate
  let first = day
  for (let week = 1; week <= weeks; week++) {
    while (!isWeekCloseDay(day, 1)) day = addDays(day, 1)
    const days: DayRecord[] = []
    for (let d = first; d <= day; d = addDays(d, 1)) days.push(perfectDay(d))
    const events: GameEvent[] = []
    const emit: RivalWeek['emit'] = (kind, payload) => {
      events.push({ id: `sim-${all.length + events.length + 1}`, day, kind, ...payload } as GameEvent)
    }
    const w: RivalWeek = { day, week, weekStartsOn: 1, days: days.length, valor: 1, habits: { days, pillars: { steps: 1, table: 1, duties: 1 } }, emit }
    const courtWeek = { day, realmConsistency: 1, emit }
    state = { ...state, settledThrough: { day: addDays(day, -1), week } }
    state = resolveRivalCourtships(resolveCourtships(rivalBidsAtClose(state, day), courtWeek), courtWeek)
    state = rivalTurn(state, w).state
    state = settleFronts(state, w)
    const playerHexes = new Set(state.hexes.filter((h) => h.owner === 'player').map((h) => h.id))
    state = borderCampaigns(state, w)
    state = { ...state, log: [...state.log, ...events], settledThrough: { day, week }, combat: undefined }
    out.push({ week, day, playerHexes, events })
    all.push(...events)
    first = addDays(day, 1)
    day = first
  }
  return { state, weeks: out, events: all }
}

export function eventsOf<K extends GameEventKind>(events: readonly GameEvent[], kind: K): (GameEventMap[K] & { day: string })[] {
  return events.filter((e) => e.kind === kind) as unknown as (GameEventMap[K] & { day: string })[]
}
