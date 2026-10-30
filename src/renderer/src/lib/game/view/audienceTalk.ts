/**
 * Patch 8 (D-62, A2, A3): what a ruler speaks of in an Audience after his greeting, and what the
 * player may ask him. Every topic is a fact the screens already show: a hex taken from him, a raid of
 * his beaten, his front's war with a neighbor, land changing hands between the rivals, a neighbor
 * fallen, a deal running, the habit he prizes this week. No hidden number reaches a line.
 *
 * The words are each ruler's own templates in the lines file (`audience.ts`): `topics` by topic,
 * `relations` and `of` for what he thinks of his neighbors, `wishes` and `noNews`. A slot with no line
 * is left out, so the Audience speaks only lines the file has.
 */
import { addDays, diffDays } from '../clock'
import { CODEX } from '../codex'
import { hexName } from '../map'
import { RULES } from '../rules'
import { lostBattle } from '../rivals'
import { weekPillars } from '../score'
import { charterOn, currentTerms } from '../settle'
import { standingSiegeOf } from '../sieges'
import { inCoalition, respiteDays } from '../state'
import { fill, type TextFacts } from '../text'
import { RIVAL_IDS, type CampaignState, type GameEvent, type ISODate, type RivalId } from '../types'
import type { Ledger } from '../../types'
import { dailyPick, isLine, LINE_KEYS, linesOf, listOf, rulerEntry } from './audience'
import { liveWeek, stepPace } from './chronicle'
import { nextMarks, respectMarks } from './diplomacy'
import { prizedHabit } from './rivalGuide'
import { rivalName } from './shell'

/** What a ruler can speak of (A2). */
export type TopicId =
  | 'tookHex'
  | 'courted'
  | 'raidBeaten'
  | 'raidWon'
  | 'boughtHex'
  | 'tookFrom'
  | 'lostTo'
  | 'tookWilds'
  | 'lostToWilds'
  | 'frontWar'
  | 'frontPeace'
  | 'neighborFell'
  | 'neighborAllied'
  | 'siegeOnHim'
  | 'truceEnding'
  | 'pactHolds'
  | 'coalition'
  | 'emboldened'
  | 'humbled'
  | 'habitKept'
  | 'habitSlipping'

/** Every topic, with the facts its line may name. */
export const TOPICS: Record<TopicId, readonly string[]> = {
  tookHex: ['hex'],
  courted: ['hex'],
  raidBeaten: ['hex'],
  raidWon: ['hex'],
  boughtHex: ['hex'],
  tookFrom: ['rival', 'hex'],
  lostTo: ['rival', 'hex'],
  tookWilds: ['hex'],
  lostToWilds: ['hex'],
  frontWar: ['rival'],
  frontPeace: ['rival'],
  neighborFell: ['rival'],
  neighborAllied: ['rival'],
  siegeOnHim: ['hex'],
  truceEnding: ['days'],
  pactHolds: ['days'],
  coalition: ['rival'],
  emboldened: ['rival'],
  humbled: ['rival'],
  habitKept: [],
  habitSlipping: []
}

/** One fact a ruler could speak of; `neighbor` when it is about his neighbors, the news he has of them. */
export interface TopicFact {
  id: TopicId
  facts: TextFacts
  neighbor: boolean
  /** The day it happened; none for what stands now. */
  day?: ISODate
}

/** Whether the player is keeping the habit a ruler prizes so far this week. */
export type HabitSoFar = 'kept' | 'slipping'

/** How far back a ruler remembers a deed (A2), and a neighbor's fall. */
const RECENT_DAYS = RULES.clock.daysPerWeek
const FALL_DAYS = 4 * RULES.clock.daysPerWeek // rules-ok: a month, as Grand Battles count one

/**
 * Whether the player keeps the habit `rival` prizes so far this week (A-38's prized week, read live):
 * Ugrak, no battle lost; Skivvet, the food budget kept with food logged each day; Emrys, every duty
 * kept each day; Hrodgar, the step pool's pace. Days before today count, today's only once it adds;
 * rest days are left out (D-54). Undefined before there is anything to judge.
 */
export function prizedSoFar(state: CampaignState, rival: RivalId, ledger: Ledger, today: ISODate): HabitSoFar | undefined {
  const prizes = CODEX.rivals.find((r) => r.id === rival)?.prizes
  const rest = new Set(respiteDays(state))
  const week = liveWeek(state, ledger, today)
  const days = week.filter((d) => !rest.has(d.date))
  const past = days.filter((d) => d.date < today)
  const judged = (ok: boolean): HabitSoFar => (ok ? 'kept' : 'slipping')
  switch (prizes) {
    case 'noLostBattle':
      return week.length > 0 ? judged(!lostBattle(state, week[0].date, today)) : undefined
    case 'allDuties':
      return past.length > 0 ? judged(past.every((d) => d.dutiesSworn > 0 && d.dutiesKept >= d.dutiesSworn)) : undefined
    case 'calorieAverage':
      return past.length > 0 ? judged(past.every((d) => d.eaten !== undefined) && weekPillars(past, currentTerms(state, today)).table >= 1) : undefined
    case 'stepPool': {
      const pace = stepPace(week, charterOn(state, today).stepPool, today, state.campaign.weekStartsOn, state.campaign.startDate, [...rest])
      return pace.daysElapsed > 0 ? judged(pace.status === 'ahead') : undefined
    }
    default:
      return undefined
  }
}

/** A span of days as a line says it: "a day", "5 days". */
function span(days: number): string {
  return days === 1 ? 'a day' : `${days} days`
}

/** The other rival a front of `rival`'s faces. */
function frontFoe(state: CampaignState, rival: RivalId, front: string): RivalId | undefined {
  const f = Object.values(state.fronts).find((x) => x.front === front)
  return f?.rivals.includes(rival) ? f.rivals.find((r) => r !== rival) : undefined
}

/** A fact from one logged event, for `rival`. */
function eventFact(state: CampaignState, rival: RivalId, e: GameEvent): TopicFact | undefined {
  const at = (id: TopicId, facts: TextFacts, neighbor = false): TopicFact => ({ id, facts, neighbor, day: e.day })
  switch (e.kind) {
    case 'hexTransfer': {
      const hex = hexName(e.hexId)
      if (e.from === rival && e.to === 'player') return at(e.how === 'influence' || e.how === 'trade' || e.how === 'bribe' ? 'courted' : 'tookHex', { hex })
      if (e.from === rival && e.to === 'neutral') return at('lostToWilds', { hex })
      if (e.to === rival && e.from === 'neutral' && e.how === 'conquest') return at('tookWilds', { hex })
      if (e.to === rival && RIVAL_IDS.includes(e.from as RivalId)) return at('tookFrom', { rival: rivalName(e.from as RivalId), hex }, true)
      if (e.from === rival && RIVAL_IDS.includes(e.to as RivalId)) return at('lostTo', { rival: rivalName(e.to as RivalId), hex }, true)
      return undefined
    }
    case 'defense':
      if (e.rival !== rival || (e.threat !== 'raid' && e.threat !== 'conquest')) return undefined
      return at(e.outcome === 'defeat' ? 'raidWon' : 'raidBeaten', { hex: hexName(e.hexId) })
    case 'deal':
      return e.rival === rival && e.deal === 'sellHex' && e.hexId ? at('boughtHex', { hex: hexName(e.hexId) }) : undefined
    case 'front': {
      const foe = frontFoe(state, rival, e.front)
      if (!foe || (e.state !== 'war' && e.state !== 'peace')) return undefined
      return at(e.state === 'war' ? 'frontWar' : 'frontPeace', { rival: rivalName(foe) }, true)
    }
    case 'rivalResolved':
      if (e.rival === rival) return undefined
      return at(e.how === 'allied' ? 'neighborAllied' : 'neighborFell', { rival: rivalName(e.rival) }, true)
    default:
      return undefined
  }
}

/** The facts that stand on `today`, in the order he would raise them. */
function standingFacts(state: CampaignState, rival: RivalId, today: ISODate, habit?: HabitSoFar): TopicFact[] {
  const out: TopicFact[] = []
  const now = (id: TopicId, facts: TextFacts = {}, neighbor = false): void => void out.push({ id, facts, neighbor })
  const siege = standingSiegeOf(state)
  const besieged = siege && state.hexes.find((h) => h.id === siege.hexId)
  if (besieged?.owner === rival) now('siegeOnHim', { hex: hexName(besieged.id) })
  const running = (kind: 'truce' | 'pact'): number | undefined => {
    const d = state.deals.find((x) => x.rival === rival && x.kind === kind && x.madeOn <= today && x.until !== undefined && today <= x.until)
    return d?.until !== undefined ? diffDays(today, d.until) + 1 : undefined
  }
  const truce = running('truce')
  if (truce !== undefined && truce <= 2) now('truceEnding', { days: span(truce) }) // rules-ok: "about to end", two days
  const partner = state.coalitions.find((c) => c.members.includes(rival) && (c.until === undefined || today <= c.until))?.members.find((m) => m !== rival)
  if (partner && inCoalition(state, rival, today)) now('coalition', { rival: rivalName(partner) }, true)
  const { min, max } = RULES.rivals.fronts.track
  for (const f of Object.values(state.fronts)) {
    if (!f.rivals.includes(rival)) continue
    const foe = f.rivals.find((r) => r !== rival) as RivalId
    const track = state.rivals[rival].frontTracks[f.front] ?? 0
    if (track <= min) now('humbled', { rival: rivalName(foe) }, true)
    else if (track >= max) now('emboldened', { rival: rivalName(foe) }, true)
  }
  const pact = running('pact')
  if (pact !== undefined) now('pactHolds', { days: span(pact) })
  if (habit) now(habit === 'kept' ? 'habitKept' : 'habitSlipping')
  return out
}

/**
 * Every fact `rival` could speak of on `today`, freshest first (A2): the last week's deeds and news from
 * the log (a month back for a neighbor's fall), each kind once, then what stands now. Only facts of an
 * active ruler; `habit` is `prizedSoFar`'s reading, when the ledger is at hand.
 */
export function topicFacts(state: CampaignState, rival: RivalId, today: ISODate, habit?: HabitSoFar): TopicFact[] {
  if (state.rivals[rival].status !== 'active') return []
  const recent = addDays(today, -RECENT_DAYS)
  const fall = addDays(today, -FALL_DAYS)
  const seen = new Set<string>()
  const out: TopicFact[] = []
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]
    if (e.day > today) continue
    if (e.day < fall) break
    const fact = eventFact(state, rival, e)
    if (!fact || (e.day < recent && fact.id !== 'neighborFell' && fact.id !== 'neighborAllied')) continue
    const key = `${fact.id}:${fact.facts.rival ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(fact)
  }
  return [...out, ...standingFacts(state, rival, today, habit)]
}

/** A topic's line in `rival`'s words, if the file has one. */
function topicLine(lines: unknown, rival: RivalId, fact: TopicFact): string | undefined {
  const template = linesOf(rulerEntry(lines, rival), 'topics')[fact.id]
  return isLine(template) ? fill(template, fact.facts) : undefined
}

/** How many of the freshest facts a day's topic is drawn from, so he doesn't say the same thing every day. */
const TOPIC_CHOICE = 3 // rules-ok: words only, how varied a day's topic is

/** What `rival` speaks of on `today` after his greeting (A2): one of his three freshest facts with a line, by the day. */
export function audienceTopic(state: CampaignState, rival: RivalId, today: ISODate, lines: unknown, habit?: HabitSoFar): { id: TopicId; text: string } | undefined {
  const spoken = topicFacts(state, rival, today, habit).flatMap((fact) => {
    const text = topicLine(lines, rival, fact)
    return text ? [{ id: fact.id, text }] : []
  })
  return dailyPick(state, today, `topic:${rival}`, spoken.slice(0, TOPIC_CHOICE))
}

/** How `rival` stands with `other` (A3): resolved, coalition partners, or his standing toward him. */
export type Relation = 'war' | 'tension' | 'peace' | 'partner' | 'fallen' | 'allied'

export function relationTo(state: CampaignState, rival: RivalId, other: RivalId, today: ISODate): Relation {
  const o = state.rivals[other]
  if (o.status === 'allied') return 'allied'
  if (o.status !== 'active') return 'fallen'
  if (state.coalitions.some((c) => c.members.includes(rival) && c.members.includes(other) && (c.until === undefined || today <= c.until))) return 'partner'
  return state.rivals[rival].disposition[other] ?? 'tension'
}

/** A question the player may put to a ruler (A3), with his answer and, beside it, the rule it rests on. */
export interface AudienceQuestion {
  id: string
  label: string
  answer: string
  rule?: string
}

/**
 * The questions open in `rival`'s Audience on `today` (A3), each with an answer only when the file has its
 * words: what he thinks of each other rival (his standing with him, then his own opinion of him); what
 * would please him (a wish, beside the habit he prizes and his next Respect mark); and his news of his
 * neighbors (a neighbor topic other than `shown`, else his `noNews`). Talking moves no Respect.
 */
export function audienceQuestions(state: CampaignState, rival: RivalId, today: ISODate, lines: unknown, shown?: TopicId): AudienceQuestion[] {
  if (state.rivals[rival].status !== 'active') return []
  const entry = rulerEntry(lines, rival)
  const relations = linesOf(entry, 'relations')
  const opinions = linesOf(entry, 'of')
  const out: AudienceQuestion[] = []
  for (const other of RIVAL_IDS) {
    if (other === rival) continue
    const name = rivalName(other)
    const said = [relations[relationTo(state, rival, other, today)], opinions[LINE_KEYS[other]]].filter(isLine).map((l) => fill(l, { rival: name }))
    if (said.length > 0) out.push({ id: `of:${other}`, label: `What of ${name}?`, answer: said.join(' ') })
  }
  const wish = dailyPick(state, today, `wish:${rival}`, listOf(entry, 'wishes'))
  if (wish) {
    const respect = state.rivals[rival].respect
    const next = nextMarks(respectMarks(rival, respect), respect)[0]
    out.push({ id: 'wish', label: 'What would please you?', answer: wish, rule: [`He prizes ${prizedHabit(rival).charAt(0).toLowerCase()}${prizedHabit(rival).slice(1)}.`, ...(next ? [`${next}.`] : [])].join(' ') })
  }
  const news = topicFacts(state, rival, today).find((f) => f.neighbor && f.id !== shown && topicLine(lines, rival, f))
  const newsLine = news ? topicLine(lines, rival, news) : listOf(entry, 'noNews')[0] ?? (isLine(entry?.noNews) ? (entry?.noNews as string) : undefined)
  if (newsLine) out.push({ id: 'news', label: 'What news?', answer: newsLine })
  return out
}
