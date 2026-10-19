/**
 * View models for the campaign shell (T14): which pages show, the top bar, when the week closes,
 * the Herald's dawn tidings and the Homecoming after an absence. Pure; components only render what these return.
 *
 * Hidden stays hidden (Convention 6): nothing here carries the benchmark, a rival's income,
 * Steadiness, or (unrevealed) a rival's treasury, army or a threat's exact strength. Every line of
 * narrative is a catalog slot with plain facts (`t(id, facts)`).
 */
import { CODEX } from '../codex'
import { numeral } from '../effects'
import { addDays, diffDays, weekCloseDay } from '../clock'
import { tidings, type ThreatNotice } from '../combat'
import { displayBalance } from '../economy'
import { pendingBattles } from '../grand'
import { hostView } from '../grand/hosts'
import { hexName } from '../map'
import { surgeOn } from '../personalities'
import { rivalView } from '../rivals'
import { RULES } from '../rules'
import { realmConsistencyOn, type SettleSummary } from '../settle'
import { foreseesSurges } from '../surges'
import { isPlayable, openDayOf, weekOn, worldOf } from '../state'
import { t, type TextFacts } from '../text'
import { graceTextId } from '../weight'
import { RIVAL_IDS, type CampaignState, type GameEvent, type GraceLevel, type ISODate, type RivalId, type StanceBand, type Surge, type SurgeKind, type WeekStartsOn } from '../types'

// ── Pages ────────────────────────────────────────────────────────────────────

export type PageId = 'chronicle' | 'contract' | 'archive' | 'realm' | 'diplomacy' | 'armory'

/**
 * The pages in tab order (Ctrl+1 to 6). Without a campaign the app is the ledger alone; with one
 * founded under older rules, the Realm page stays to offer the re-founding (D-21, section 7.1).
 */
export function pagesFor(campaign: CampaignState | null, outdated = false): PageId[] {
  if (campaign) return ['chronicle', 'contract', 'archive', 'realm', 'diplomacy', 'armory']
  return outdated ? ['chronicle', 'contract', 'archive', 'realm'] : ['chronicle', 'contract', 'archive']
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

// ── The week close ───────────────────────────────────────────────────────────

export interface WeekCloseView {
  /** The week's last day; its close is the week close (A-04). */
  lastDay: ISODate
  /** The date on whose morning, at `time`, the week closes. */
  closesOn: ISODate
  /** The close's wall-clock time, "04:00". */
  time: string
  /** Days left in the week, today included: 1 when the week closes tonight. */
  daysLeft: number
}

/** When the week holding `today` closes: at 04:00 on the morning after its last day (A-04). */
export function weekCloseView(weekStartsOn: WeekStartsOn, today: ISODate): WeekCloseView {
  const lastDay = weekCloseDay(today, weekStartsOn)
  return { lastDay, closesOn: addDays(lastDay, 1), time: `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00`, daysLeft: diffDays(today, lastDay) + 1 }
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
  /** A battle the player led on the battle map (D-12). */
  led?: boolean
}

export interface HeraldView {
  date: ISODate
  /** The Veil of Fog: the Herald has no tidings today. */
  hidden: boolean
  lines: HeraldLine[]
}

function line(section: HeraldSection, textId: string, facts: TextFacts, extra: { hexId?: string; rival?: RivalId; led?: boolean } = {}): HeraldLine {
  return { section, textId, facts, text: t(textId, facts), ...extra }
}

/** Renown in a Herald line, to a tenth. */
const TENTHS = 10 // rules-ok: display rounding

const BAND_WORDS: Record<NonNullable<ThreatNotice['band']>, string> = { weaker: 'weaker', matched: 'matched', stronger: 'stronger', overwhelming: 'overwhelming' }

/** A threat's strength as the player may know it: the exact number when revealed, else its band, else unknown (the Veil). */
export function strengthWord(n: ThreatNotice): string {
  if (n.strength !== undefined) return String(Math.round(n.strength))
  return n.band ? BAND_WORDS[n.band] : 'unknown'
}

function threatLines(state: CampaignState, today: ISODate): { hidden: boolean; lines: HeraldLine[] } {
  const view = tidings(state, today)
  const lines: HeraldLine[] = []
  for (const n of view.threats) {
    const facts: TextFacts = { hex: hexName(n.hexId), strength: strengthWord(n), date: n.date, ...(n.rival ? { rival: rivalName(n.rival) } : {}) }
    const id = n.kind === 'conquest' ? 'herald.threat.conquest' : `herald.threat.${n.kind}`
    lines.push(line('threat', id, facts, { hexId: n.hexId, ...(n.rival ? { rival: n.rival } : {}) }))
    if (n.siegeDay) lines.push(line('threat', 'herald.threat.siegeDay', {}, { hexId: n.hexId }))
    if (n.atStake) lines.push(line('threat', 'herald.threat.atStake', { hex: facts.hex }, { hexId: n.hexId }))
  }
  return { hidden: view.hidden, lines }
}

/** A rival's stance toward the player, as his court shows it (D-33). */
export const STANCE_WORDS: Record<StanceBand, string> = { defiant: 'Defiant', wary: 'Wary', shaken: 'Shaken', ready: 'Ready to yield' }

/** A surge's kind in plain words (D-31). */
export const SURGE_WORDS: Record<SurgeKind, string> = { swell: 'a swell', ebb: 'an ebb', summoning: 'a summoning', blessing: 'a blessing', curse: 'a curse', strike: 'a strike' }

/** A buy-off's gift from its log label (`hex:<id>`, `item:<id>`, `hires:<n>`) in plain words. */
export function giftWords(label: string | undefined): string {
  if (!label) return ''
  const [kind, id] = label.split(':')
  if (kind === 'hex') return hexName(id)
  if (kind === 'item') return CODEX.items.find((i) => i.id === id)?.name ?? id
  const n = Number(id)
  return `${n} hired ${n === 1 ? 'company' : 'companies'} for ${RULES.terms.goblin.hireWeeks} weeks`
}

/** What a surge lands on: its hex, or the company it blesses or curses. */
function surgeTarget(state: CampaignState, s: Surge): string {
  if (s.hexId) return hexName(s.hexId)
  return state.roster.find((c) => c.id === s.companyId)?.name ?? 'a company'
}

/** The Archmage's surge today (a strike is told among the threats) and, when foreseen, tomorrow's (D-31). */
function surgeLines(state: CampaignState, today: ISODate): HeraldLine[] {
  const lines: HeraldLine[] = []
  const s = surgeOn(state, today)
  const a = RULES.personalities.archmage
  if (s && s.surge !== 'strike') {
    const facts: TextFacts = { hex: s.hexId ? hexName(s.hexId) : '', company: surgeTarget(state, s), mult: s.mult ?? 1, days: a.summonDays, share: percent(a.companyShare) }
    lines.push(line('threat', `herald.surge.${s.surge}`, facts, { rival: 'archmage', ...(s.hexId ? { hexId: s.hexId } : {}) }))
  }
  const next = foreseesSurges(state) ? surgeOn(state, addDays(today, 1)) : undefined
  if (next) lines.push(line('warning', 'herald.surge.tomorrow', { what: SURGE_WORDS[next.surge], target: surgeTarget(state, next) }, { rival: 'archmage', ...(next.hexId ? { hexId: next.hexId } : {}) }))
  return lines
}

/** The Goblin's open offers to buy back a hex his garrison lost (C-44). */
function buyBackLines(state: CampaignState, today: ISODate): HeraldLine[] {
  return worldOf(state)
    .offers.flatMap((o) => (o.kind === 'buyBack' && today <= o.until ? [o] : []))
    .map((o) => line('warning', 'herald.buyBack', { rival: rivalName('goblin'), hex: hexName(o.hexId), price: o.price }, { hexId: o.hexId, rival: 'goblin' }))
}

function warningLines(state: CampaignState, today: ISODate): HeraldLine[] {
  return pendingBattles(state)
    .filter((b) => b.announcedOn <= today && b.battleDate >= today)
    .map((b) => {
      const host = hostView(state, b)
      const facts: TextFacts = { trigger: b.trigger, hex: hexName(b.hexId), date: b.battleDate, host: `${host.size} host` }
      return line('warning', 'herald.grandBattle.warning', facts, { hexId: b.hexId, ...(b.rival ? { rival: b.rival } : {}) })
    })
}

function rumorLines(state: CampaignState): HeraldLine[] {
  return RIVAL_IDS.filter((r) => state.rivals[r].status === 'active').flatMap((r) =>
    rivalView(state, r).rumors.map((id) => line('rumor', id, { rival: rivalName(r) }, { rival: r }))
  )
}

/** A result from the log as a Herald line, or null for events the Herald doesn't report. */
export function resultLine(e: GameEvent): HeraldLine | null {
  switch (e.kind) {
    case 'defense': {
      const until = e.scorchedUntil ?? e.contestedUntil
      const facts: TextFacts = { hex: hexName(e.hexId), spoils: e.spoils ?? 0, tribute: e.tribute ?? 0 }
      if (e.rival) facts.rival = rivalName(e.rival)
      if (until) facts.until = until
      const led = e.led ? { led: true } : {}
      if (e.grandIllusion) return line('result', 'battle.grandIllusion', facts, { hexId: e.hexId, ...led })
      if (e.threat === 'conquest') {
        const won = e.outcome !== 'defeat'
        const id = won ? (e.broken ? 'battle.conquest.broken' : 'battle.conquest.repelled') : e.contested ? 'battle.conquest.contested' : e.scorchedUntil ? 'battle.conquest.coreHeld' : 'battle.conquest.lost'
        return line('result', id, facts, { hexId: e.hexId, ...(e.rival ? { rival: e.rival } : {}), ...led })
      }
      const outcome = e.overrun ? 'overrun' : e.outcome
      return line('result', `battle.${e.threat}.${outcome}`, facts, { hexId: e.hexId, ...(e.rival ? { rival: e.rival } : {}), ...led })
    }
    case 'assault':
      if (e.outcome === 'revealed') return null
      // A repulse that wore the garrison within reach reads as a breach (D-22).
      return line('result', `battle.assault.${e.breach ? 'breach' : e.outcome}`, { hex: hexName(e.hexId), spoils: e.spoils ?? 0 }, { hexId: e.hexId, ...(e.led ? { led: true } : {}) })
    case 'standingSiege':
      return line('result', `herald.siege.${e.change}`, { hex: hexName(e.hexId) }, { hexId: e.hexId })
    case 'fallback':
      return line('result', 'herald.fallback', { hex: hexName(e.hexId), to: hexName(e.to), strength: Math.round(e.strength), days: RULES.sieges.fallback.days }, { hexId: e.to })
    case 'borderCampaign':
      return line('world', e.taken ? 'herald.borderCampaign.taken' : 'herald.borderCampaign.held', { rival: rivalName(e.attacker), other: rivalName(e.defender), hex: hexName(e.hexId) }, { hexId: e.hexId })
    case 'coalition':
      return line('world', `herald.coalition.${e.stage}`, { members: rivalNames(e.members) })
    case 'rivalResolved':
      return line('world', `herald.rival.${e.how}`, { rival: rivalName(e.rival) }, { rival: e.rival })
    case 'worldEvent':
      if (e.outcome !== undefined) return null
      return line('world', 'herald.worldEvent', { event: t(`events.${e.eventId}.title`) })
    case 'milestone':
      return line('result', 'herald.milestone', { index: e.index })
    case 'pathRank':
      return line('result', 'herald.pathRank', { rival: rivalName(e.path), rank: numeral(e.rank) }, { rival: e.path })
    case 'deed':
      return line('result', `herald.deed.${e.deed}`, { rival: rivalName(e.path), value: Math.round(e.value * TENTHS) / TENTHS, ...(e.hexId ? { hex: hexName(e.hexId) } : {}) }, { rival: e.path, ...(e.hexId ? { hexId: e.hexId } : {}) })
    case 'ascendancy':
      if (e.stage === 'warning' || e.stage === 'lifted') return line('world', `herald.ascendancy.${e.stage}`, { rival: rivalName(e.rival) }, { rival: e.rival })
      if ((e.stage === 'delayed' || e.stage === 'humbled') && e.until) return line('world', `herald.ascendancy.${e.stage}`, { rival: rivalName(e.rival), date: e.until }, { rival: e.rival })
      return null
    case 'grandBattle':
      if (e.stage === 'queued' && e.battleDate) return line('warning', 'herald.grandBattle.queued', { trigger: e.trigger, hex: hexName(e.hexId), date: e.battleDate }, { hexId: e.hexId })
      return null
    case 'bribe':
      return line('result', 'herald.bribe', { hex: hexName(e.hexId), price: e.price }, { hexId: e.hexId, rival: 'goblin' })
    case 'goblinBid':
      return line(e.stage === 'placed' ? 'warning' : 'result', `herald.goblinBid.${e.stage}`, { rival: rivalName('goblin'), hex: hexName(e.hexId) }, { hexId: e.hexId, rival: 'goblin' })
    case 'orcTrack':
      return line('world', 'herald.orcTrack', { rival: rivalName('orc'), track: e.to > 0 ? `+${e.to}` : String(e.to) }, { rival: 'orc' })
    case 'stance':
      return line('world', 'herald.terms.stance', { rival: rivalName(e.rival), band: STANCE_WORDS[e.to] }, { rival: e.rival })
    case 'disposition':
      // Patch 6 (C-88): a standing that changes, read each day (D-49), is told the next morning.
      return line('world', `herald.standing.${e.to}`, { rival: rivalName(e.rival) }, { rival: e.rival })
    case 'front': {
      // Patch 6 (C-88): a front's track at its end, the first rival's way (+) or the second's (−); the other is Humbled.
      const pair = CODEX.fronts.find((f) => f.id === e.front)?.rivals
      if (!pair || Math.abs(e.track) < RULES.rivals.fronts.track.max) return null
      const [winner, loser] = e.track > 0 ? pair : [pair[1], pair[0]]
      return line('world', 'herald.front.emboldened', { rival: rivalName(winner), other: rivalName(loser), front: e.front }, { rival: winner })
    }
    case 'terms': {
      const facts: TextFacts = { rival: rivalName(e.rival), ...(e.hexId ? { hex: hexName(e.hexId) } : {}), ...(e.gift ? { gift: giftWords(e.gift) } : {}) }
      const extra = { rival: e.rival, ...(e.hexId ? { hexId: e.hexId } : {}) }
      if (e.stage === 'offered') return line(e.offer === 'finalWarhost' || e.offer === 'challenge' ? 'warning' : 'world', `herald.terms.offered.${e.offer}`, facts, extra)
      return line('world', `herald.terms.${e.stage}`, facts, extra)
    }
    case 'restless':
      return e.stage === 'uprising' ? line('warning', 'herald.restless.uprising', { hex: hexName(e.hexId) }, { hexId: e.hexId }) : null
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
  const live = isPlayable(state) ? [...surgeLines(state, today), ...warningLines(state, today), ...buyBackLines(state, today)] : []
  return { date: today, hidden: threats.hidden, lines: [...threats.lines, ...live, ...rumorLines(state), ...results] }
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
    if (e.how === 'conquest' || e.how === 'wilds') return []
    return [line('result', 'healer.shame', { what: `${hexName(e.hexId)}`, date: e.day }, { hexId: e.hexId })]
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
