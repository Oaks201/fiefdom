/**
 * View models for the Diplomacy page (T15; Ch 6 "Trade and negotiation" and "Influence", Ch 12
 * "The four rivals", "Respect" and "What the player sees", Ch 17's NPC note): a panel per rival
 * court, the deals each will strike, and the courtships. The endgame parts (Accords, coalitions,
 * the Ultimatum) are T16's.
 *
 * Hidden stays hidden (Convention 6): treasuries and armies show as bands, and as numbers only with
 * the Spy Network (or the Spymaster, for a neighbor's treasury), through `rivalView`. No income,
 * benchmark or event criteria ever reaches these objects.
 */
import { formatNumber } from '../../format'
import { CODEX } from '../codex'
import { totalDominion } from '../dominion'
import { realmEffects } from '../effects'
import { availableDeals, bidCheck, courtshipSlots, resistance, type DealKind, type DealOffer, type DealRefusalCode } from '../land'
import { claimableBy, hexName } from '../map'
import { greedBand, orcTrackOf, pactHolds, surgeOn } from '../personalities'
import { RULES } from '../rules'
import { marksFor, marksOf, reaches, respectChange } from '../respect'
import { rivalView, type ArmyBand, type TreasuryBand } from '../rivals'
import { openDayOf, resolutionAllowed, resolutionMark, resolutionsOf, weekOn, worldOf } from '../state'
import { stanceOf, weighsMost } from '../terms'
import { t } from '../text'
import { RIVAL_IDS, type CampaignState, type Disposition, type Effects, type FrontId, type FrontState, type ISODate, type Owner, type RivalId, type RivalState, type StanceBand } from '../types'
import { suggestedBid, trustNow } from './realm'
import { landRefusalLabel } from './refusals'
import { STANCE_WORDS, SURGE_WORDS, rivalName } from './shell'

const PERCENT = 100 // rules-ok: shares shown as percentages
const PURSE_STEP = 10 // rules-ok: the purse's 0.1 precision (A-11)

export type Mood = 'calm' | 'angry' | 'humbled'

export interface RespectMark {
  at: number
  /** What Respect at this mark opens or brings (D-39, `marksOf`), as keys and in plain words. */
  opens: string[]
  labels: string[]
  /** Reached: at or above a mark from 0 up, at or below one under 0. */
  reached: boolean
}

export interface RivalPanel {
  rival: RivalId
  name: string
  ruler: string
  title: string
  realm: string
  people: string
  status: RivalState['status']
  disposition: Disposition
  mood: Mood
  /** The portrait slot for the mood (`rival.<id>.calm|angry|humbled`). */
  portrait: string
  respect: number
  marks: RespectMark[]
  /** The next mark each way, for his court (Patch 7, E2); his guide lists `marks` in full. */
  nextMarks: string[]
  treasuryBand: TreasuryBand
  armyBand: ArmyBand
  /** Exact only when revealed (the Spy Network, or the Spymaster for a neighbor's treasury). */
  treasury?: number
  army?: number
  rumors: { textId: string; text: string }[]
  /** Its Rim fronts: the other rival, the state, and the war track from this rival's side, drawn and explained. */
  fronts: FrontLine[]
  /** The Orc's war track against the player (D-28), drawn and explained; only on his court while he is active. */
  orcWar?: OrcWar
  /** His stance toward the player from week 16 (D-33): a band, never the score or which measure is close. */
  stance?: { band: StanceBand; label: string }
  /** Patch 7 (A1a): his end waiting on the realm's next Dominion mark, in plain words. */
  waits?: string
  /** His march's state in plain lines (D-29 to D-31): the Goblin's prices and pact, the Dwarf's walls, the Archmage's surge (the Orc's war track is `orcWar`). */
  march: MarchLine[]
  /** Patch 5 (D-40, C-65): what his standing means, the marks that change it, and what moves his Respect, in plain words; empty once he is resolved. */
  standingNote: string
}

const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

/**
 * Patch 5 (D-40, C-65), cut to one line by Patch 7 (E1): his standing today and the Respect lines that
 * change it (his own, D-48). What moves his Respect is in his guide (`rivalGuide`'s deeds), how long a
 * standing holds is `standingRules`, and what a standing means in general is How to play's. Every number
 * in it is public.
 */
export function standingNote(state: CampaignState, rival: RivalId): string {
  const r = state.rivals[rival]
  if (r.status !== 'active') return ''
  const m = marksFor(rival)
  const now = { war: 'War: raids and conquest attempts', tension: 'Tension: raids, no conquest attempts', peace: 'Peace: no raids, no conquest attempts' }[r.disposition.player]
  const lines = m.peace === null ? `never makes Peace · War at ${signed(m.war)}` : `Peace at ${signed(m.peace)} · War at ${signed(m.war)}`
  return `${now} · ${lines}`
}

/**
 * His standing's rules for his guide (Patch 7, E1): his lines, a coalition's War, and how long a standing
 * he holds lasts, until his Respect is `standingBuffer` past its line the other way (D-52).
 */
export function standingRules(rival: RivalId): string {
  const m = marksFor(rival)
  const b = RULES.respect.standingBuffer
  const lines =
    m.peace === null
      ? `He never makes Peace. War comes at Respect ${signed(m.war)}, or if he joins a coalition against you.`
      : `Peace comes at Respect ${signed(m.peace)}; War at ${signed(m.war)}, or if he joins a coalition against you.`
  if (b <= 0) return lines
  const holds = m.peace === null ? ` At War he stays until his Respect rises above ${signed(m.war + b)}.` : ` At Peace he stays until his Respect falls below ${signed(m.peace - b)}; at War, until it rises above ${signed(m.war + b)}.`
  return `${lines}${holds}`
}

/**
 * The next mark each way from his Respect (Patch 7, E2), for his court: what rising opens next, and
 * what falling ends (a mark from 0 up he holds now) or brings (the first mark under 0 below him). His
 * guide lists every mark.
 */
export function nextMarks(marks: readonly RespectMark[], respect: number): string[] {
  const out: string[] = []
  const up = marks.filter((m) => m.at > respect).sort((a, b) => a.at - b.at)[0]
  if (up) out.push(`Next, at ${signed(up.at)}: ${up.labels.join('; ')} (${Math.ceil(up.at - respect)} to go)`)
  const held = marks.filter((m) => m.at > 0 && m.at <= respect).sort((a, b) => b.at - a.at)[0]
  const below = marks.filter((m) => m.at < 0 && m.at < respect).sort((a, b) => b.at - a.at)[0]
  if (held) out.push(`Below ${signed(held.at)} it ends: ${held.labels.join('; ')} (${Math.floor(respect - held.at)} above it now)`)
  else if (below) out.push(`At ${signed(below.at)}: ${below.labels.join('; ')} (${Math.ceil(respect - below.at)} to fall)`)
  return out
}

/** One line of a march's state; a date the screen formats. */
export interface MarchLine {
  label: string
  until?: ISODate
}

/** What his march looks like today, in the plain facts the player may know (no hidden number). */
function marchLines(state: CampaignState, rival: RivalId, today: ISODate): MarchLine[] {
  if (state.rivals[rival].status !== 'active') return state.rivals[rival].grudging ? [{ label: 'A grudging vassal: he sends no company' }] : []
  switch (rival) {
    case 'orc':
      return []
    case 'goblin': {
      const lines: MarchLine[] = [{ label: `His prices: ${({ fair: 'fair', dear: 'dear', gouging: 'gouging' } as const)[greedBand(state)]}` }]
      const pact = state.deals.find((d) => d.rival === 'goblin' && d.kind === 'buyOff' && d.madeOn <= today && d.until !== undefined && today <= d.until)
      if (pact?.until && pactHolds(state, today)) lines.push({ label: 'A buy-off pact: his march left alone', until: pact.until })
      const hires = state.terms?.hires
      if (hires && today <= hires.until) lines.push({ label: `${hires.count} hired ${hires.count === 1 ? 'company' : 'companies'} of his with you`, until: hires.until })
      return lines
    }
    case 'dwarf': {
      const walls = state.hexes.filter((h) => h.march === 'dwarf' && h.owner === 'neutral' && h.fortification > 0).reduce((s, h) => s + h.fortification, 0)
      return walls > 0 ? [{ label: `Walls on the wilds of his march: ${walls} ${walls === 1 ? 'level' : 'levels'}` }] : []
    }
    case 'archmage': {
      const s = surgeOn(state, today)
      if (!s) return []
      const on = s.hexId ? hexName(s.hexId) : (state.roster.find((c) => c.id === s.companyId)?.name ?? 'a company')
      return [{ label: `Today’s surge: ${SURGE_WORDS[s.surge]} on ${on}` }]
    }
  }
}

// ── War tracks: the Rim fronts and the Orc's war on you ─────────────────────

/** One side of a war track: a rival or the player. */
export interface TrackSide {
  owner: Owner
  name: string
}

/**
 * A war track as a tug of war (Ch 12's Rim fronts, A-153; the Orc's track against the player, D-28): the
 * ruler on the left, the other side on the right, and the marker leaning toward whoever is winning. Every
 * number on it is public.
 */
export interface WarTrack {
  left: TrackSide
  right: TrackSide
  /** −max to +max: positive leans toward the left side, negative toward the right. */
  lean: number
  max: number
  /** Who leads, in plain words: "Ugrak leads by 2", "You lead by 1", "Even". */
  leader: string
}

/** A Rim front from one rival's side (Ch 12, A-144, A-153, A-37): its state this week and its war track, with what each means. */
export interface FrontLine {
  front: FrontId
  other: RivalId
  otherName: string
  state: Disposition
  /** The war track from this rival's side, −3 to +3. */
  track: number
  tug: WarTrack
  /** What the front's state does to the track this week, in plain words from `RULES`: the state badge's tooltip (Patch 7, E3). */
  how: string
  /** Only with the marker at an end: who is Emboldened and who Humbled, and what that does to raids on the player. */
  end?: string
}

/** The Orc's war track against the player (D-28): drawn, what moves it (the track's tooltip; his guide says it in full, Patch 7, E4), and what it does now. */
export interface OrcWar {
  tug: WarTrack
  how: string
  now: string
}

const pct = (share: number): number => Math.round(share * PERCENT)

function warTrack(left: TrackSide, right: TrackSide, lean: number, max: number): WarTrack {
  const ahead = lean > 0 ? left : right
  const leader = lean === 0 ? 'Even' : ahead.owner === 'player' ? `You lead by ${Math.abs(lean)}` : `${ahead.name} leads by ${Math.abs(lean)}`
  return { left, right, lean, max, leader }
}

/** What a front's state does to its track this week: skirmishes at War (A-153), nothing at Tension, a step back toward 0 at Peace (A-37). */
function frontHow(state: Disposition): string {
  const fr = RULES.rivals.fronts
  switch (state) {
    case 'war':
      return `At War this week: they skirmish every day, the larger army winning more often, and each win moves the marker a step toward the winner. The war costs each side ${pct(fr.warArmyLoss)}% of his army a week.`
    case 'tension':
      return 'At Tension this week: no fighting, so the marker holds.'
    case 'peace':
      return `At Peace this week: no fighting, and at the week’s close the marker moves ${fr.peaceStep === 1 ? 'a step' : `${fr.peaceStep} steps`} back toward the middle.`
  }
}

/** A Rim front from `rival`'s side: at its end the winner is Emboldened and the loser Humbled (Ch 12, `raidMult` in combat.ts). */
function frontLine(state: CampaignState, rival: RivalId, f: FrontState): FrontLine {
  const fr = RULES.rivals.fronts
  const other = f.rivals[0] === rival ? f.rivals[1] : f.rivals[0]
  const track = state.rivals[rival].frontTracks[f.front] ?? 0
  const me: TrackSide = { owner: rival, name: rivalName(rival) }
  const them: TrackSide = { owner: other, name: rivalName(other) }
  const ends = track >= fr.track.max ? [me, them] : track <= fr.track.min ? [them, me] : undefined
  const end = ends && `${ends[0].name} is Emboldened: his raids on you strike ${pct(fr.emboldenedRaid)}% harder. ${ends[1].name} is Humbled: his strike ${pct(fr.humbledRaid)}% weaker.`
  return { front: f.front, other, otherName: them.name, state: f.state, track, tug: warTrack(me, them, track, fr.track.max), how: frontHow(f.state), ...(end ? { end } : {}) }
}

/** The Orc's war track against the player (D-28): positive the player's way, drawn with the Orc on the left. */
function orcWarOf(state: CampaignState): OrcWar | undefined {
  if (state.rivals.orc.status !== 'active') return undefined
  const tr = RULES.personalities.orc.track
  const t = orcTrackOf(state)
  const strike = pct(tr.strikePerStep * Math.abs(t))
  const garrison = pct(tr.garrisonPerStep * Math.abs(t))
  const extra =
    t <= tr.extraConquestAt
      ? ' While he is at War with you, he plans an extra conquest attempt each week.'
      : ` At ${-tr.extraConquestAt} his way, he plans an extra conquest attempt each week he is at War with you.`
  const now =
    t > 0
      ? `Your way by ${t}: his raids, conquest attempts and counterattacks strike ${strike}% weaker, and his march’s garrisons are ${garrison}% easier to take.`
      : t < 0
        ? `His way by ${-t}: his raids, conquest attempts and counterattacks strike ${strike}% harder, and his march’s garrisons are ${garrison}% harder to take.${extra}`
        : `Even: his strikes and his march’s garrisons are as usual. Each step your way makes his strikes ${pct(tr.strikePerStep)}% weaker and his garrisons ${pct(tr.garrisonPerStep)}% easier to take; each step his way, the reverse.${extra}`
  const how = `From week ${RULES.personalities.fromWeek}, a day you win more battles with him than you lose (his raids, conquest attempts and counterattacks; hexes of his march taken; Grand Battles) moves the marker a step your way, and a day you lose more moves it his way.`
  return { tug: warTrack({ owner: 'orc', name: rivalName('orc') }, { owner: 'player', name: 'You' }, -t, tr.max), how, now }
}

/** His stance, from the week terms start (D-33). */
function stanceLine(state: CampaignState, rival: RivalId, today: ISODate): { band: StanceBand; label: string } | undefined {
  if (state.rivals[rival].status !== 'active' || weekOn(state, today) < RULES.terms.fromWeek) return undefined
  const band = stanceOf(state, rival)
  return { band, label: STANCE_WORDS[band] }
}

/** The Herald's rumors of what he watches (D-33, C-49): his two weightiest measures, never how close they are. */
function watchRumors(state: CampaignState, rival: RivalId, today: ISODate): string[] {
  if (state.rivals[rival].status !== 'active' || weekOn(state, today) < RULES.terms.fromWeek) return []
  return weighsMost(rival).slice(0, 2).map((m) => `herald.terms.rumor.${m}`)
}

/** Humbled when resolved or pinned at −3 on a front; angry at War; calm otherwise (Ch 17's portrait moods). */
export function moodOf(state: CampaignState, rival: RivalId): Mood {
  const r = state.rivals[rival]
  if (r.status !== 'active') return 'humbled'
  if (Object.values(r.frontTracks).some((track) => track <= RULES.rivals.fronts.track.min)) return 'humbled'
  return r.disposition.player === 'war' ? 'angry' : 'calm'
}

const OWN = RULES.respect.own
const OPENS: Record<string, (rival: RivalId) => string> = {
  raidsWeaker: () => `Its raids strike ${Math.round((1 - RULES.respect.raidsWeakerMult) * PERCENT)}% weaker`,
  raidsStronger: () => `Its raids strike ${Math.round((RULES.respect.raidsStrongerMult - 1) * PERCENT)}% stronger`,
  war: () => 'War: conquest attempts as well as raids',
  peace: () => 'Peace: no raids or conquest attempts',
  sellsHex: () => 'It sells you hexes',
  buysHex: () => 'It buys your hexes',
  pact: () => 'Non-aggression pacts',
  envoy: () => `Its envoy fights for you at ${RULES.respect.envoyCostPerBattle} a battle`,
  accordTalks: () => 'Accord talks open',
  callToArms: () => 'Calls to arms',
  accordEasier: () => 'Its Accord is easier',
  accordSigned: () => 'An Accord signed: allied',
  challenge: () => 'Ugrak’s Challenge instead of his final Warhost',
  'own.orc.up': () => 'His routed forces in his march no longer strike back at once',
  'own.orc.down': () => `${OWN.orcConquests === 1 ? 'One more conquest attempt' : `${OWN.orcConquests} more conquest attempts`} a week`,
  'own.goblin.up': () => 'He bids for none of your villages',
  'own.goblin.down': () => 'He gouges: dearer bribes and richer bids for your villages',
  'own.dwarf.up': () => 'He raises no walls on the wilds facing you',
  'own.dwarf.down': () => `His walls on the wilds rise to level ${OWN.dwarfWildWallMax}`,
  'own.archmage.up': () => 'You see tomorrow’s surge',
  'own.archmage.down': () => `His swells and surge strikes ${Math.round((OWN.archmageSurgeMult - 1) * PERCENT)}% stronger`
}

/** Every mark on `rival`'s track, both sides (D-39, `marksOf`), with what each brings for him; reached at or above one from 0 up, at or below one under 0. */
export function respectMarks(rival: RivalId, respect: number): RespectMark[] {
  return marksOf(rival).map((m) => ({ at: m.at, opens: m.opens, labels: m.opens.map((k) => OPENS[k](rival)), reached: reaches(respect, m.at) }))
}

/**
 * Where `respect` sits along the meter, 0 to 1. The marks, 0 and both ends are evenly spaced stops
 * so close marks (50, 55, 60) don't crowd; a value between two stops falls in line between them.
 */
export function meterAt(marks: readonly { at: number }[], respect: number): number {
  const { min, max } = RULES.respect
  const stops = [...new Set([min, 0, max, ...marks.map((m) => m.at)])].sort((a, b) => a - b)
  const v = Math.min(max, Math.max(min, respect))
  const i = Math.max(1, stops.findIndex((s) => s >= v))
  return (i - 1 + (v - stops[i - 1]) / (stops[i] - stops[i - 1])) / (stops.length - 1)
}

export function rivalPanel(state: CampaignState, rival: RivalId, effects: Effects = realmEffects(state), today: ISODate = openDayOf(state)): RivalPanel {
  const r = state.rivals[rival]
  const stance = stanceLine(state, rival, today)
  const waits = waitsLine(state, rival)
  const entry = CODEX.rivals.find((x) => x.id === rival)
  const name = rivalName(rival)
  const view = rivalView(state, rival, effects)
  const mood = moodOf(state, rival)
  const fronts = Object.values(state.fronts)
    .filter((f) => f.rivals.includes(rival))
    .map((f) => frontLine(state, rival, f))
  const orcWar = rival === 'orc' ? orcWarOf(state) : undefined
  return {
    rival,
    name,
    ruler: entry?.ruler ?? rival,
    title: entry?.title ?? '',
    realm: entry?.realm ?? '',
    people: entry?.people ?? '',
    status: r.status,
    disposition: view.disposition,
    mood,
    portrait: `rival.${rival}.${mood}`,
    respect: r.respect,
    marks: respectMarks(rival, r.respect),
    nextMarks: nextMarks(respectMarks(rival, r.respect), r.respect),
    treasuryBand: view.treasuryBand,
    armyBand: view.armyBand,
    ...(view.treasury !== undefined ? { treasury: view.treasury } : {}),
    ...(view.army !== undefined ? { army: view.army } : {}),
    rumors: [...view.rumors, ...watchRumors(state, rival, today)].map((id) => ({ textId: id, text: t(id, { rival: name }) })),
    fronts,
    ...(orcWar ? { orcWar } : {}),
    ...(stance ? { stance } : {}),
    ...(waits ? { waits } : {}),
    march: marchLines(state, rival, today),
    standingNote: standingNote(state, rival)
  }
}

/** Patch 7 (C4, A1a): the road to victory, above the courts. Dominion and its marks are public. */
export interface RoadToVictory {
  resolved: number
  of: number
  dominion: number
  /** The Dominion the next resolution needs; absent once every rival is resolved. */
  mark?: number
  /** Rivals whose resolution waits for the mark, by name. */
  waiting: string[]
}

export function roadToVictory(state: CampaignState): RoadToVictory {
  const mark = resolutionMark(state)
  return {
    resolved: resolutionsOf(state).length,
    of: RIVAL_IDS.length,
    dominion: Math.floor(totalDominion(state)),
    ...(mark !== undefined ? { mark } : {}),
    waiting: worldOf(state)
      .pending.filter((p) => state.rivals[p.rival].status === 'active')
      .map((p) => rivalName(p.rival))
  }
}

/**
 * Patch 7 (A1a): why his end waits on the realm's next Dominion mark, for his court: a resolution held
 * for it, or his stance at Ready to yield while it holds his terms (or the Orc's last battle) back.
 */
function waitsLine(state: CampaignState, rival: RivalId): string | undefined {
  const mark = resolutionMark(state)
  if (state.rivals[rival].status !== 'active' || mark === undefined || resolutionAllowed(state)) return undefined
  const need = `the realm’s Dominion reaches ${formatNumber(mark)} (${formatNumber(Math.floor(totalDominion(state)))} now)`
  const held = worldOf(state).pending.find((p) => p.rival === rival)
  if (held) return { allied: `His Accord is signed: he joins you once ${need}.`, abdicated: `He is ready to give up his land: he does once ${need}.`, conquered: `His capital has fallen: he is conquered once ${need}.` }[held.how]
  if (stanceOf(state, rival) !== 'ready') return undefined
  return rival === 'orc' ? `Ready for his last battle once ${need}.` : `Ready to yield, but he offers no terms until ${need}.`
}

/** All four courts. */
export function rivalPanels(state: CampaignState): RivalPanel[] {
  const effects = realmEffects(state)
  return RIVAL_IDS.map((r) => rivalPanel(state, r, effects))
}

// ── Deals ────────────────────────────────────────────────────────────────────

export interface DealLine {
  kind: DealOffer['kind']
  rival: RivalId
  /** What the player pays, or for a sold hex receives. */
  price: number
  /** In plain words: "Buy hex 4-7", "Truce". */
  name: string
  /** What it needs, and what it does (Ch 6's table). */
  requires: string
  effect: string
  hexId?: string
  hexName?: string
  target?: RivalId
  available: boolean
  /** The engine's reason, as its catalog text id and the words. */
  reason?: { code: string; textId: string; text: string }
}

/** A deal's name in plain words. */
export function dealName(kind: DealKind, hexId?: string, target?: RivalId): string {
  switch (kind) {
    case 'buyHex':
      return hexId ? `Buy ${hexName(hexId)}` : 'Buy a hex'
    case 'sellHex':
      return hexId ? `Sell ${hexName(hexId)}` : 'Sell a hex'
    case 'truce':
      return 'Truce'
    case 'pact':
      return 'Non-aggression pact'
    case 'callToArms':
      return target ? `Call to arms against ${rivalName(target)}` : 'Call to arms'
    case 'buyout':
      return 'Buy-out from its coalition'
    case 'buyOff':
      return 'Buy-off pact'
  }
}

function dealTerms(kind: DealKind, rival: RivalId): { requires: string; effect: string } {
  const m = marksFor(rival)
  const tr = RULES.trade
  switch (kind) {
    case 'buyHex':
      return {
        requires: m.sellsHex === null ? 'He sells no hex' : `Respect ${m.sellsHex}; not at war with you; never its Gate; one hex deal every ${tr.hexDealEveryWeeks} weeks`,
        effect: `The hex is yours at once; +${RULES.respect.change.tradeOrTruce} Respect`
      }
    case 'sellHex':
      return {
        requires: rival === 'goblin' ? 'Any time; not in the heartland, nor a Gate' : `Respect ${m.buysHex}; not in the heartland, nor a Gate; one hex deal every ${tr.hexDealEveryWeeks} weeks`,
        effect: `You receive ${Math.round(tr.sellShare * PERCENT)}% of its buy price; +${RULES.respect.change.hexSold} Respect`
      }
    case 'truce': {
      // Patch 5 (D-39): the Orc gives nothing for a Truce.
      const gain = respectChange(rival, 'truce', RULES.respect.change.tradeOrTruce)
      return { requires: 'Any time, except while a Grand Battle is announced', effect: `No raids or conquest attempts from it for ${tr.truce.days} days${gain !== 0 ? `; ${signed(gain)} Respect` : ''}` }
    }
    case 'pact':
      return { requires: `Respect ${m.pact}`, effect: `No conquest attempts from it for ${tr.pact.days} days; its raids come half as often` }
    case 'callToArms':
      return { requires: `Respect ${m.callToArms}; a front between them; not coalition partners`, effect: `It declares war on the other for ${tr.callToArms.days} days` }
    case 'buyout':
      return { requires: `Respect ${RULES.world.coalitions.buyout.minRespect}; it stands in a coalition against you`, effect: 'It walks away and the coalition ends today' }
    case 'buyOff':
      return { requires: 'Offered by the Goblin only', effect: 'You leave his march alone for a while; he neither raids you nor bids for your villages' }
  }
}

/**
 * The refusals a player can work toward: Respect, the purse, the 4 weeks between hex deals, a standing,
 * an agreement or a Grand Battle warning that ends, a coalition that breaks. A deal refused for any other
 * reason (no hex to trade, no front between them, a rival who never does it, a resolved rival) cannot be
 * struck as things stand, and the court doesn't list it. A Truce or pact refused at Peace (Patch 7, B5)
 * stays listed with its reason, so the player sees why it isn't needed.
 */
const WITHIN_REACH: ReadonlySet<DealRefusalCode> = new Set<DealRefusalCode>(['respect', 'reputation', 'cooldown', 'atWar', 'inForce', 'grandBattleWarning', 'targetAllied', 'atPeace'])

/** Every deal `rival` could strike today (`availableDeals`), and those it refuses for a reason within reach, with the engine's reason. */
export function dealsView(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): DealLine[] {
  const name = rivalName(rival)
  return availableDeals(state, rival, today)
    .filter((d) => d.allowed || (d.reason !== undefined && WITHIN_REACH.has(d.reason.code)))
    .map((d) => {
      const line: DealLine = { kind: d.kind, rival, price: d.price, name: dealName(d.kind, d.hexId, d.target), ...dealTerms(d.kind, rival), available: d.allowed }
      if (d.hexId) {
        line.hexId = d.hexId
        line.hexName = hexName(d.hexId)
      }
      if (d.target) line.target = d.target
      if (!d.allowed && d.reason) {
        const facts = {
          rival: name,
          ...(d.reason.needed !== undefined ? { needed: d.reason.needed } : {}),
          ...(d.reason.have !== undefined ? { have: d.reason.have } : {}),
          ...(d.hexId ? { hex: hexName(d.hexId) } : {}),
          ...(d.target ? { target: rivalName(d.target) } : {})
        }
        line.reason = { code: d.reason.code, textId: d.reason.textId, text: t(d.reason.textId, facts) }
      }
      return line
    })
}

// ── Courtships (Ch 6 "Influence") ────────────────────────────────────────────

export interface CourtshipLine {
  hexId: string
  label: string
  owner: Owner
  bid: number
  placedOn: ISODate
  /** The Offer the bid makes at today's Trust: bid × Trust. */
  offer: number
  /** What the Offer must reach (its owner's counter-bid, if any, is not known). */
  resistance?: number
}

export interface CourtshipResult {
  day: ISODate
  hexId: string
  label: string
  outcome: 'defected' | 'held' | 'void'
  bid: number
  loyaltyDrop?: number
  /** For a defection, who won the village (a rival suitor can outbid the player). */
  winner?: Owner
}

export interface CourtableVillage {
  hexId: string
  label: string
  owner: Owner
  ownerName: string
  ring: number
  resistance: number
  /** The bid whose Offer meets the resistance at today's Trust. */
  suggested: number
  available: boolean
  reason?: { code: string; label: string }
}

export interface CourtshipsView {
  slots: number
  open: number
  /** Trust now (0.6 to 1.2, plus Envoy's Rest), from the last 28 days' Realm Consistency. */
  trust: number
  bids: CourtshipLine[]
  /** Villages the player could bid on now, and why not when it can't. */
  villages: CourtableVillage[]
  /** Past results from the log, newest first. */
  results: CourtshipResult[]
}

/** Every village touching the player's land that someone else holds, with the bid that would meet it and whether a bid is allowed. */
export function courtableVillages(state: CampaignState, effects: Effects = realmEffects(state)): CourtableVillage[] {
  return state.hexes
    .filter((h) => h.village && claimableBy(state.hexes, h.id, 'player', 'court'))
    .map((h) => {
      const suggested = suggestedBid(state, h, effects)
      const check = bidCheck(state, h.id, suggested)
      return {
        hexId: h.id,
        label: hexName(h),
        owner: h.owner,
        ownerName: h.owner === 'neutral' ? 'Unaligned' : rivalName(h.owner as RivalId),
        ring: h.ring,
        resistance: resistance(h),
        suggested,
        available: check.ok,
        ...(check.ok || !check.reason ? {} : { reason: { code: check.reason.code, label: landRefusalLabel(check.reason) } })
      }
    })
}

export function courtshipsView(state: CampaignState, effects: Effects = realmEffects(state)): CourtshipsView {
  const tr = trustNow(state, effects)
  const byId = new Map(state.hexes.map((h) => [h.id, h]))
  return {
    slots: courtshipSlots(state, effects),
    open: state.courtships.length,
    trust: tr,
    bids: state.courtships.map((c) => {
      const hex = byId.get(c.hexId)
      return {
        hexId: c.hexId,
        label: hexName(c.hexId),
        owner: hex?.owner ?? 'neutral',
        bid: c.bid,
        placedOn: c.placedOn,
        offer: Math.round(c.bid * tr * PURSE_STEP) / PURSE_STEP,
        ...(hex?.village ? { resistance: resistance(hex) } : {})
      }
    }),
    villages: courtableVillages(state, effects),
    results: state.log
      .flatMap((e) =>
        e.kind === 'courtship'
          ? [{ day: e.day, hexId: e.hexId, label: hexName(e.hexId), outcome: e.outcome, bid: e.bid, ...(e.loyaltyDrop !== undefined ? { loyaltyDrop: e.loyaltyDrop } : {}), ...(e.winner ? { winner: e.winner } : {}) }]
          : []
      )
      .reverse()
  }
}
