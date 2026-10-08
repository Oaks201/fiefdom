/**
 * View models for the campaign shell (T14): which pages show, the top bar, the Herald's dawn
 * tidings and the Homecoming after an absence. Pure; components only render what these return.
 *
 * Hidden stays hidden (Convention 6): nothing here carries the benchmark, a rival's income,
 * Steadiness, or (unrevealed) a rival's treasury, army or a threat's exact strength. Every line of
 * narrative is a catalog slot with plain facts (`t(id, facts)`).
 */
import { CODEX } from '../codex'
import { addDays } from '../clock'
import { tidings, type ThreatNotice } from '../combat'
import { displayBalance } from '../economy'
import { pendingBattles } from '../grand'
import { hostView } from '../grand/hosts'
import { hexLabel } from '../map'
import { rivalView } from '../rivals'
import { RULES } from '../rules'
import { realmConsistencyOn, type SettleSummary } from '../settle'
import { isPlayable, openDayOf, weekOn } from '../state'
import { t, type TextFacts } from '../text'
import { graceTextId } from '../weight'
import { RIVAL_IDS, type CampaignState, type GameEvent, type GraceLevel, type ISODate, type RivalId } from '../types'

// ── Pages ────────────────────────────────────────────────────────────────────

export type PageId = 'chronicle' | 'contract' | 'archive' | 'realm' | 'diplomacy' | 'armory'

/** The pages in tab order (Ctrl+1 to 6). Without a campaign the app is the ledger alone. */
export function pagesFor(campaign: CampaignState | null): PageId[] {
  return campaign ? ['chronicle', 'contract', 'archive', 'realm', 'diplomacy', 'armory'] : ['chronicle', 'contract', 'archive']
}

// ── Names ────────────────────────────────────────────────────────────────────

/** A rival as the text names it: its ruler's short name. */
export function rivalName(rival: RivalId): string {
  return CODEX.rivals.find((r) => r.id === rival)?.shortName ?? rival
}

/** A list of rivals as the text names them, joined with "and". */
export function rivalNames(rivals: readonly RivalId[]): string {
  return rivals.map(rivalName).join(' and ')
}

/** A whole percentage, for display. */
export function percent(share: number): number {
  return Math.round(share * 100)
}

// ── The top bar ──────────────────────────────────────────────────────────────

export interface TopBarView {
  status: CampaignState['campaign']['status']
  /** The campaign week of the open day. */
  week: number
  /** The purse as a whole number, rounded down (A-11). */
  purse: number
  /** Realm Consistency over the last 28 settled days, 0 to 1, and as a whole percentage. */
  realmConsistency: number
  realmConsistencyPercent: number
  /** The Crown's Grace as its plain description, never Steadiness (Ch 9). */
  grace: { level: GraceLevel; textId: string; text: string }
}

/** Realm Consistency as of the last settled day (0 before the first): what Trust and the top bar read. */
export function realmConsistencyNow(state: CampaignState): number {
  const settled = state.settledThrough.day
  return settled >= state.campaign.startDate ? realmConsistencyOn(state, settled, state.campaign.weekStartsOn) : 0
}

export function topBarView(state: CampaignState, today: ISODate = openDayOf(state)): TopBarView {
  const rc = realmConsistencyNow(state)
  const level = state.weight.grace
  return {
    status: state.campaign.status,
    week: weekOn(state, today),
    purse: displayBalance(state.purse),
    realmConsistency: rc,
    realmConsistencyPercent: percent(rc),
    grace: { level, textId: graceTextId(level), text: t(graceTextId(level)) }
  }
}

// ── The Herald ───────────────────────────────────────────────────────────────

export type HeraldSection = 'threat' | 'warning' | 'rumor' | 'result' | 'world'

export interface HeraldLine {
  section: HeraldSection
  textId: string
  facts: TextFacts
  text: string
  /** A hex the line points at, for the map. */
  hexId?: string
  rival?: RivalId
}

export interface HeraldView {
  date: ISODate
  /** The Veil of Fog: the Herald has no tidings today. */
  hidden: boolean
  lines: HeraldLine[]
}

function line(section: HeraldSection, textId: string, facts: TextFacts, extra: { hexId?: string; rival?: RivalId } = {}): HeraldLine {
  return { section, textId, facts, text: t(textId, facts), ...extra }
}

const BAND_WORDS: Record<NonNullable<ThreatNotice['band']>, string> = { weaker: 'weaker', matched: 'matched', stronger: 'stronger', overwhelming: 'overwhelming' }

/** A threat's strength as the player may know it: the exact number when revealed, else its band, else unknown (the Veil). */
function strengthWord(n: ThreatNotice): string {
  if (n.strength !== undefined) return String(Math.round(n.strength))
  return n.band ? BAND_WORDS[n.band] : 'unknown'
}

function threatLines(state: CampaignState, today: ISODate): { hidden: boolean; lines: HeraldLine[] } {
  const view = tidings(state, today)
  const lines: HeraldLine[] = []
  for (const n of view.threats) {
    const facts: TextFacts = { hex: hexLabel(n.hexId), strength: strengthWord(n), date: n.date, ...(n.rival ? { rival: rivalName(n.rival) } : {}) }
    const id = n.kind === 'conquest' ? 'herald.threat.conquest' : `herald.threat.${n.kind}`
    lines.push(line('threat', id, facts, { hexId: n.hexId, ...(n.rival ? { rival: n.rival } : {}) }))
    if (n.siegeDay) lines.push(line('threat', 'herald.threat.siegeDay', {}, { hexId: n.hexId }))
  }
  return { hidden: view.hidden, lines }
}

function warningLines(state: CampaignState, today: ISODate): HeraldLine[] {
  return pendingBattles(state)
    .filter((b) => b.announcedOn <= today && b.battleDate >= today)
    .map((b) => {
      const host = hostView(state, b)
      const facts: TextFacts = { trigger: b.trigger, hex: hexLabel(b.hexId), date: b.battleDate, host: `${host.size} host` }
      return line('warning', 'herald.grandBattle.warning', facts, { hexId: b.hexId, ...(b.rival ? { rival: b.rival } : {}) })
    })
}

function rumorLines(state: CampaignState): HeraldLine[] {
  return RIVAL_IDS.filter((r) => state.rivals[r].status === 'active').flatMap((r) =>
    rivalView(state, r).rumors.map((id) => line('rumor', id, { rival: rivalName(r) }, { rival: r }))
  )
}

/** A result from the log as a Herald line, or null for events the Herald doesn't report. */
function resultLine(e: GameEvent): HeraldLine | null {
  switch (e.kind) {
    case 'defense': {
      const until = e.scorchedUntil ?? e.contestedUntil
      const facts: TextFacts = { hex: hexLabel(e.hexId), spoils: e.spoils ?? 0, tribute: e.tribute ?? 0 }
      if (e.rival) facts.rival = rivalName(e.rival)
      if (until) facts.until = until
      if (e.grandIllusion) return line('result', 'battle.grandIllusion', facts, { hexId: e.hexId })
      if (e.threat === 'conquest') {
        const won = e.outcome !== 'defeat'
        const id = won ? (e.broken ? 'battle.conquest.broken' : 'battle.conquest.repelled') : e.contested ? 'battle.conquest.contested' : e.scorchedUntil ? 'battle.conquest.coreHeld' : 'battle.conquest.lost'
        return line('result', id, facts, { hexId: e.hexId, ...(e.rival ? { rival: e.rival } : {}) })
      }
      return line('result', `battle.${e.threat}.${e.outcome}`, facts, { hexId: e.hexId, ...(e.rival ? { rival: e.rival } : {}) })
    }
    case 'assault':
      if (e.outcome === 'revealed') return null
      return line('result', `battle.assault.${e.outcome}`, { hex: hexLabel(e.hexId), spoils: e.spoils ?? 0 }, { hexId: e.hexId })
    case 'borderCampaign':
      return line('world', e.taken ? 'herald.borderCampaign.taken' : 'herald.borderCampaign.held', { rival: rivalName(e.attacker), other: rivalName(e.defender), hex: hexLabel(e.hexId) }, { hexId: e.hexId })
    case 'coalition':
      return line('world', `herald.coalition.${e.stage}`, { members: rivalNames(e.members) })
    case 'rivalResolved':
      return line('world', `herald.rival.${e.how}`, { rival: rivalName(e.rival) }, { rival: e.rival })
    case 'worldEvent':
      if (e.outcome !== undefined) return null
      return line('world', 'herald.worldEvent', { event: t(`events.${e.eventId}.title`) })
    case 'milestone':
      return line('result', 'herald.milestone', { index: e.index })
    case 'ascendancy':
      if (e.stage === 'warning' || e.stage === 'lifted') return line('world', `herald.ascendancy.${e.stage}`, { rival: rivalName(e.rival) }, { rival: e.rival })
      if ((e.stage === 'delayed' || e.stage === 'humbled') && e.until) return line('world', `herald.ascendancy.${e.stage}`, { rival: rivalName(e.rival), date: e.until }, { rival: e.rival })
      return null
    case 'grandBattle':
      if (e.stage === 'queued' && e.battleDate) return line('warning', 'herald.grandBattle.queued', { trigger: e.trigger, hex: hexLabel(e.hexId), date: e.battleDate }, { hexId: e.hexId })
      return null
    default:
      return null
  }
}

/**
 * The Herald at dawn on `today` (Ch 2 "The daily and weekly loop"): today's threats with their
 * targets and bands (the exact strength only when revealed), Grand Battle warnings, rumors from
 * the rival courts, and yesterday's results, all through the text catalog.
 */
export function heraldView(state: CampaignState, today: ISODate = openDayOf(state)): HeraldView {
  const yesterday = addDays(today, -1)
  const threats = isPlayable(state) ? threatLines(state, today) : { hidden: false, lines: [] }
  const results = state.log.filter((e) => e.day === yesterday).flatMap((e) => resultLine(e) ?? [])
  return { date: today, hidden: threats.hidden, lines: [...threats.lines, ...(isPlayable(state) ? warningLines(state, today) : []), ...rumorLines(state), ...results] }
}

// ── The Homecoming (A-45, Ch 16) ─────────────────────────────────────────────

export interface HomecomingView {
  daysSettled: number
  weeksClosed: number[]
  awayDays: number
  /** Battles held, and what was lost, each told plainly. */
  heldCount: number
  lost: HeraldLine[]
  /** The purse's change over the catch-up. */
  purseChange: number
  /** Each settled day: what held, what was lost and what the purse did. */
  days: { day: ISODate; held: number; lost: number; purseChange: number }[]
  /** The Healer's word after a long absence (approved text only; otherwise its placeholder). */
  healer?: { textId: string; text: string }
  /** The Steward suggests a short contract to start again. */
  suggestedTermDays: number
}

/** What held, what was lost and the purse's change over a catch-up; chronicle, not judgment (Ch 16). */
export function homecomingView(summary: SettleSummary, suggestedTermDays: number): HomecomingView {
  const isHeld = (e: GameEvent): boolean => e.kind === 'defense' && e.outcome !== 'defeat'
  const isLost = (e: GameEvent): boolean => (e.kind === 'defense' && e.outcome === 'defeat') || (e.kind === 'hexTransfer' && e.from === 'player')
  // A hex lost in battle is told by its battle report; one lost another way gets its own plain line.
  const lost = summary.lost.flatMap((e) => {
    if (e.kind !== 'hexTransfer') return resultLine(e) ?? []
    if (e.how === 'conquest') return []
    return [line('result', 'healer.shame', { what: `Hex ${hexLabel(e.hexId)}`, date: e.day }, { hexId: e.hexId })]
  })
  const away = summary.awayDays
  return {
    daysSettled: summary.days.length,
    weeksClosed: [...summary.weeksClosed],
    awayDays: away,
    heldCount: summary.held.length,
    lost,
    purseChange: summary.purseChange,
    days: summary.days.map((d) => ({ day: d.day, held: d.events.filter(isHeld).length, lost: d.events.filter(isLost).length, purseChange: d.purseChange })),
    ...(away >= RULES.clock.absenceDays ? { healer: { textId: 'healer.comingBack', text: t('healer.comingBack', { days: away }) } } : {}),
    suggestedTermDays
  }
}
