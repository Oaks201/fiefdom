/**
 * Patch 8 (D-62, A2, A3): what a ruler speaks of in an Audience after his greeting, and what the
 * player may ask him. Every topic is a fact the screens already show: a hex taken from him, a raid of
 * his beaten, his front's war with a neighbor, land changing hands between the rivals, a neighbor
 * fallen, a deal running, the habit he prizes this week. No hidden number reaches a line.
 *
 * Patch 8 (R1, R2, D-66): his dares and demands answered, and his neighbors' news: land one took from
 * another, a front's war won, a ruler fallen or allied, a pact broken. News that fresh is the first thing
 * he speaks of (`audienceTopic`), and the Herald quotes every other ruler on it (`reactionsTo`).
 *
 * The words are each ruler's own templates in the lines file (`audience.ts`): `topics` by topic,
 * `relations` and `of` for what he thinks of his neighbors, `wishes` and `noNews`. A slot with no line
 * is left out, so the Audience speaks only lines the file has.
 */
import { addDays, diffDays } from '../clock'
import { CODEX } from '../codex'
import { hexName } from '../map'
import { RULES } from '../rules'
import { isDemand } from '../requests'
import { lostBattle, lostToRaids } from '../rivals'
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
  | 'truceBroken'
  | 'pactBroken'
  | 'heardBroken'
  | 'calledAgainst'
  | 'pactKept'
  | 'trialWon'
  | 'trialLost'
  | 'heardTook'
  | 'heardFront'
  | 'dareMet'
  | 'dareMissed'
  | 'demandRefused'
  | 'promiseBroken'

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
  habitSlipping: [],
  truceBroken: [],
  pactBroken: [],
  heardBroken: ['rival'],
  calledAgainst: ['rival'],
  pactKept: [],
  trialWon: [],
  trialLost: [],
  heardTook: ['rival', 'other', 'hex'],
  heardFront: ['rival', 'other'],
  dareMet: [],
  dareMissed: [],
  demandRefused: [],
  promiseBroken: ['hex']
}

/** Patch 8 (D4): topics only one ruler has, from his own deal. */
export const RULER_TOPICS: Partial<Record<TopicId, RivalId>> = { trialWon: 'orc', trialLost: 'orc' }

/** Deals broken are remembered a month, like a neighbor's fall, and (R1) a promise broken. */
const REMEMBERED: ReadonlySet<TopicId> = new Set<TopicId>(['neighborFell', 'neighborAllied', 'truceBroken', 'pactBroken', 'heardBroken', 'promiseBroken'])

/** Patch 8 (R2): his neighbors' news, which the Herald quotes him on and which he raises first while it is fresh. */
const REACTIONS: ReadonlySet<TopicId> = new Set<TopicId>(['heardTook', 'lostTo', 'heardFront', 'neighborFell', 'neighborAllied', 'heardBroken'])

/** How long news stays the first thing he speaks of: the day the Herald tells it and the next (R2, "his next Audience"). */
const FRESH_DAYS = 2 // rules-ok: words only, which topic leads

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
      // Patch 8 (R2): one neighbor's land taken by another.
      if (e.how === 'conquest' && RIVAL_IDS.includes(e.from as RivalId) && RIVAL_IDS.includes(e.to as RivalId)) return at('heardTook', { rival: rivalName(e.to as RivalId), other: rivalName(e.from as RivalId), hex }, true)
      return undefined
    }
    case 'defense':
      if (e.rival !== rival || (e.threat !== 'raid' && e.threat !== 'conquest')) return undefined
      return at(e.outcome === 'defeat' ? 'raidWon' : 'raidBeaten', { hex: hexName(e.hexId) })
    case 'deal':
      if (e.deal === 'callToArms' && e.target === rival) return at('calledAgainst', { rival: rivalName(e.rival) }, true)
      return e.rival === rival && e.deal === 'sellHex' && e.hexId ? at('boughtHex', { hex: hexName(e.hexId) }) : undefined
    case 'front': {
      // Patch 8 (R2): a front's war won between two neighbors, its track at its end.
      const pair = CODEX.fronts.find((f) => f.id === e.front)?.rivals
      if (e.turned && pair && !pair.includes(rival)) {
        const [winner, loser] = e.track > 0 ? pair : [pair[1], pair[0]]
        return at('heardFront', { rival: rivalName(winner), other: rivalName(loser) }, true)
      }
      const foe = frontFoe(state, rival, e.front)
      if (!foe || (e.state !== 'war' && e.state !== 'peace')) return undefined
      return at(e.state === 'war' ? 'frontWar' : 'frontPeace', { rival: rivalName(foe) }, true)
    }
    case 'rivalResolved':
      if (e.rival === rival) return undefined
      return at(e.how === 'allied' ? 'neighborAllied' : 'neighborFell', { rival: rivalName(e.rival) }, true)
    // Patch 8 (D-64): deals kept and broken, a call to arms against him, a trial of champions fought.
    case 'dealEnded':
      if (e.rival === rival && e.how === 'broken') return at(e.deal === 'truce' ? 'truceBroken' : 'pactBroken', {})
      if (e.rival === rival && (e.deal === 'pact' || e.deal === 'oath')) return at('pactKept', {})
      return e.how === 'broken' && (e.deal === 'pact' || e.deal === 'oath') ? at('heardBroken', { rival: rivalName(e.rival) }, true) : undefined
    case 'grandBattle': {
      if (e.stage !== 'fought' || e.rival !== rival || state.grandBattles.find((b) => b.id === e.battleId)?.eventId !== 'trial') return undefined
      return at(e.result === 'defeat' ? 'trialLost' : 'trialWon', {})
    }
    // Patch 8 (R1): his dare met or missed, his demand refused (by word or silence), a promise to him broken.
    case 'request':
      if (e.rival !== rival) return undefined
      if (e.stage === 'met' || e.stage === 'missed') return at(e.stage === 'met' ? 'dareMet' : 'dareMissed', {})
      if (e.stage === 'broken' && e.hexId) return at('promiseBroken', { hex: hexName(e.hexId) })
      return (e.stage === 'refused' || e.stage === 'lapsed') && isDemand({ kind: e.request }) ? at('demandRefused', {}) : undefined
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
    if (!fact || (e.day < recent && !REMEMBERED.has(fact.id))) continue
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

/**
 * What `rival` speaks of on `today` after his greeting (A2): his neighbors' news while it is fresh (R2), else one of
 * his three freshest facts with a line, by the day.
 */
export function audienceTopic(state: CampaignState, rival: RivalId, today: ISODate, lines: unknown, habit?: HabitSoFar): { id: TopicId; text: string } | undefined {
  const fresh = addDays(today, -FRESH_DAYS)
  const spoken = topicFacts(state, rival, today, habit).flatMap((fact) => {
    const text = topicLine(lines, rival, fact)
    return text ? [{ id: fact.id, text, news: REACTIONS.has(fact.id) && fact.day !== undefined && fact.day >= fresh }] : []
  })
  const chosen = spoken.find((s) => s.news) ?? dailyPick(state, today, `topic:${rival}`, spoken.slice(0, TOPIC_CHOICE))
  return chosen && { id: chosen.id, text: chosen.text }
}

/** One ruler's words on the realm's news, as the Herald quotes him (R2). */
export interface Reaction {
  rival: RivalId
  text: string
}

/**
 * Patch 8 (R2, D-66): what every other active ruler says of event `e` in the Herald, in his topic line for it: land
 * one rival took from another (its loser too), a front's war won, a ruler conquered or allied, a pact broken.
 * Only rulers whose file has the line speak.
 */
export function reactionsTo(state: CampaignState, e: GameEvent, lines: unknown): Reaction[] {
  return RIVAL_IDS.filter((r) => state.rivals[r].status === 'active').flatMap((r) => {
    const fact = eventFact(state, r, e)
    const text = fact && REACTIONS.has(fact.id) ? topicLine(lines, r, fact) : undefined
    return text ? [{ rival: r, text }] : []
  })
}

/**
 * Patch 8 (R1): how `rival`'s dare stands so far this week: his prized habit's reading, but Ugrak's is narrower, no
 * battle lost to his raids (kept until one is).
 */
export function dareSoFar(state: CampaignState, rival: RivalId, ledger: Ledger, today: ISODate): HabitSoFar | undefined {
  if (rival !== 'orc') return prizedSoFar(state, rival, ledger, today)
  const week = liveWeek(state, ledger, today)
  return week.length > 0 ? (lostToRaids(state, rival, week[0].date, today) ? 'slipping' : 'kept') : undefined
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
