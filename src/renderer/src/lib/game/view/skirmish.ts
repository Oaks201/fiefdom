/**
 * View models for the daily skirmishes (D-12): the "Start today's battles" button on the
 * Chronicle and the Realm, the day's fights in the close's order, each fight's opening (who,
 * where, the enemy as the Herald knows it) and its result, told with the day's battle-report text.
 *
 * Nothing posts when a fight ends: the close posts it. Before the close a result's report is the
 * one the close would write now (the day's combat settled on a copy); after it, the posted one.
 *
 * Hidden stays hidden: a defense's enemy shows as the Herald's band (its exact strength only when
 * revealed), the enemy companies' power only when the host roster is revealed (the field view),
 * and under the Veil of Fog the button gives no count.
 */
import { addDays, campaignWeek } from '../clock'
import { effectiveGarrison, settleCombat, skirmishDayOf, tidings } from '../combat'
import { hexName } from '../map'
import { RULES } from '../rules'
import { todaysFights } from '../skirmish'
import { isPlayable, openDayOf } from '../state'
import type { CampaignState, Emit, GameEvent, ISODate, Skirmish, ThreatKind } from '../types'
import { amount } from './refusals'
import { resultLine, rivalName, strengthWord, type HeraldLine } from './shell'

const THREAT_WORDS: Record<ThreatKind, string> = { beasts: 'Beasts', mythic: 'A mythic', raid: 'Raid', conquest: 'Conquest attempt', counterattack: 'Counterattack' }

export interface SkirmishButton {
  /** Today has fights to lead, or they have begun. */
  show: boolean
  started: boolean
  /** The day's fights; absent under the Veil of Fog until they begin. */
  count?: number
  /** Fights finished so far. */
  fought: number
  /** The Valor the fights use: locked once they begin, else today's so far. */
  valor: number
}

/** The "Start today's battles" button for the open day, with today's Valor so far (`valor`, 0 to 1). */
export function skirmishButton(state: CampaignState, valor: number, day: ISODate = openDayOf(state)): SkirmishButton {
  const begun = skirmishDayOf(state, day)
  if (begun) return { show: true, started: true, count: begun.fights.length, fought: begun.fights.filter((f) => f.result !== undefined).length, valor: begun.valor }
  if (!isPlayable(state) || day !== openDayOf(state)) return { show: false, started: false, fought: 0, valor }
  const count = todaysFights(state, day).length
  return { show: count > 0, started: false, ...(tidings(state, day).hidden ? {} : { count }), fought: 0, valor }
}

/** A fight in plain words: "Raid (Ugrak the Unbowed) at Ashfall", "Assault on Ashfall". */
export function fightLabel(f: Pick<Skirmish, 'side' | 'hexId' | 'threat' | 'rival' | 'restrike'>): string {
  if (f.side === 'assault') return `Assault on ${hexName(f.hexId)}`
  const what = f.restrike ? 'Renewed conquest attempt' : THREAT_WORDS[f.threat ?? 'beasts']
  return `${what}${f.rival ? ` (${rivalName(f.rival)})` : ''} at ${hexName(f.hexId)}`
}

/** Waiting, under way, its result, or (once the day is closed) left to the close's formula. */
export type FightStatus = 'waiting' | 'underway' | 'rout' | 'victory' | 'defeat' | 'left'

export interface FightRow {
  id: string
  label: string
  side: Skirmish['side']
  hexId: string
  status: FightStatus
}

export interface SkirmishDayView {
  day: ISODate
  /** Today's fights can still be played; a closed day's are only read and replayed. */
  open: boolean
  /** The Valor locked when they began. */
  valor: number
  rounds: number
  fights: FightRow[]
  /** The first fight not yet finished, in order; null when none is left to play. */
  next: string | null
}

/** The fights of `day` the player started, in the close's order, or null if none were. */
export function skirmishDayView(state: CampaignState, day: ISODate): SkirmishDayView | null {
  const sd = skirmishDayOf(state, day)
  if (!sd) return null
  const open = day === openDayOf(state) && isPlayable(state)
  const status = (f: Skirmish): FightStatus => f.result ?? (!open ? 'left' : f.begun ? 'underway' : 'waiting')
  const fights = sd.fights.map((f) => ({ id: f.id, label: fightLabel(f), side: f.side, hexId: f.hexId, status: status(f) }))
  return { day, open, valor: sd.valor, rounds: RULES.skirmish.rounds, fights, next: open ? (sd.fights.find((f) => f.result === undefined)?.id ?? null) : null }
}

export interface FightIntro {
  id: string
  label: string
  side: Skirmish['side']
  hexName: string
  /** The enemy as the player may know it: a defense's Herald band (its strength only when revealed), an assault's garrison. */
  strength: string
  /** The enemy's companies, by name. */
  enemy: { name: string; count: number }[]
  /** The player's companies: those the close's formula would field. */
  yours: string[]
  readiness: number
  rounds: number
}

function fightOf(state: CampaignState, day: ISODate, fightId: string): Skirmish | undefined {
  return skirmishDayOf(state, day)?.fights.find((f) => f.id === fightId)
}

/** A fight before it is opened: who, where, the enemy as known and the companies that meet it. */
export function fightIntro(state: CampaignState, day: ISODate, fightId: string): FightIntro | null {
  const f = fightOf(state, day, fightId)
  if (!f) return null
  const hex = state.hexes.find((h) => h.id === f.hexId)
  let strength = 'unknown'
  if (f.side === 'assault') strength = hex ? `garrison ${amount(effectiveGarrison(hex))}` : strength
  else {
    const notice = tidings(state, day).threats.find((n) => n.kind === f.threat && n.hexId === f.hexId && n.rival === f.rival && n.restrike === (f.restrike === true))
    if (notice) strength = strengthWord(notice)
  }
  const counts = new Map<string, number>()
  for (const c of f.enemy) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  const names = new Map(f.setup.units.filter((u) => u.side === 'player').map((u) => [u.id, u.name]))
  return {
    id: f.id,
    label: fightLabel(f),
    side: f.side,
    hexName: hexName(f.hexId),
    strength,
    enemy: [...counts].map(([name, count]) => ({ name, count })),
    yours: f.companies.map((id) => names.get(id) ?? id),
    readiness: f.setup.readiness,
    rounds: f.setup.rounds ?? RULES.grandBattles.rounds
  }
}

export interface FightResult {
  id: string
  label: string
  result: NonNullable<Skirmish['result']>
  won: boolean
  /** The day's battle report for it: as the close posted it, or as it would post it now. */
  report: HeraldLine | null
  posted: boolean
  /** The Marshal finished it at the close: it was opened and left unfinished. */
  marshal: boolean
  /** The companies left Weary at the close by a repulsed assault. */
  weary: string[]
}

function sameFight(e: GameEvent, f: Skirmish): boolean {
  if (f.side === 'assault') return e.kind === 'assault' && e.hexId === f.hexId
  return e.kind === 'defense' && e.hexId === f.hexId && e.threat === f.threat && e.rival === f.rival && (e.restrike === true) === (f.restrike === true)
}

/** The day's battle reports as the close would write them now: its combat settled on a copy, nothing kept. */
function closePreview(state: CampaignState, day: ISODate, valor: number): GameEvent[] {
  const events: GameEvent[] = []
  const emit: Emit = (kind, payload) => void events.push({ id: `preview-${events.length + 1}`, day, kind, ...payload } as GameEvent)
  const { startDate, weekStartsOn } = state.campaign
  settleCombat(state, { day, week: campaignWeek(startDate, day, weekStartsOn), weekStartsOn, valor, emit })
  return events
}

/** A finished fight's result and its report, or null while it is unfinished. */
export function fightResult(state: CampaignState, day: ISODate, fightId: string): FightResult | null {
  const sd = skirmishDayOf(state, day)
  const f = sd?.fights.find((x) => x.id === fightId)
  if (!sd || !f || f.result === undefined) return null
  const posted = day <= state.settledThrough.day
  const events = posted ? state.log.filter((e) => e.day === day) : closePreview(state, day, sd.valor)
  const event = events.find((e) => sameFight(e, f))
  const repulsed = event?.kind === 'assault' && event.outcome === 'repulsed'
  const names = new Map(f.setup.units.filter((u) => u.side === 'player').map((u) => [u.id, u.name]))
  return {
    id: f.id,
    label: fightLabel(f),
    result: f.result,
    won: f.result !== 'defeat',
    report: event ? resultLine(event) : null,
    posted,
    marshal: f.marshal === true,
    weary: repulsed ? f.companies.map((id) => names.get(id) ?? id) : []
  }
}

/** Yesterday's battles the player led, for the Herald's link to their results and replays; null when none were finished. */
export function ledYesterday(state: CampaignState, today: ISODate = openDayOf(state)): { day: ISODate; fought: number } | null {
  const day = addDays(today, -1)
  const fought = skirmishDayOf(state, day)?.fights.filter((f) => f.result !== undefined).length ?? 0
  return fought > 0 ? { day, fought } : null
}
