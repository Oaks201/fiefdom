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
import { CODEX } from '../codex'
import { realmEffects } from '../effects'
import { availableDeals, bidCheck, courtshipSlots, resistance, type DealKind, type DealOffer } from '../land'
import { claimableBy, hexName } from '../map'
import { greedBand, orcTrackOf, pactHolds, surgeOn } from '../personalities'
import { RULES } from '../rules'
import { marksFor, marksOf, reaches } from '../respect'
import { rivalView, type ArmyBand, type TreasuryBand } from '../rivals'
import { openDayOf, weekOn } from '../state'
import { stanceOf, weighsMost } from '../terms'
import { t, type RivalMoment } from '../text'
import { RIVAL_IDS, type CampaignState, type Disposition, type Effects, type FrontId, type ISODate, type Owner, type RivalId, type RivalState, type StanceBand } from '../types'
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
  treasuryBand: TreasuryBand
  armyBand: ArmyBand
  /** Exact only when revealed (the Spy Network, or the Spymaster for a neighbor's treasury). */
  treasury?: number
  army?: number
  rumors: { textId: string; text: string }[]
  /** Its Rim fronts: the other rival, the state, and the war track from this rival's side. */
  fronts: { front: FrontId; other: RivalId; otherName: string; state: Disposition; track: number }[]
  /** A one-line greeting in its mood (the words are A3's; until then the placeholder). */
  greeting: { textId: string; text: string }
  /** His stance toward the player from week 16 (D-33): a band, never the score or which measure is close. */
  stance?: { band: StanceBand; label: string }
  /** His march's state in plain lines (D-28 to D-31): the Orc's war track, the Goblin's prices and pact, the Dwarf's walls, the Archmage's surge. */
  march: MarchLine[]
  /** Patch 5 (D-40, C-65): what his standing means, the marks that change it, and what moves his Respect, in plain words; empty once he is resolved. */
  standingNote: string
}

const RC = RULES.respect.change
const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

/** What moves each rival's Respect, in plain words (D-39, P5-07): every number from `RULES`. */
function drivers(rival: RivalId): { up: string[]; down: string[] } {
  const own = RULES.respect.byRival[rival] as Readonly<Record<string, number>>
  const conquered = own.hexConquered ?? RC.hexConquered
  const beaten = `his raids and attacks beaten (${signed(RC.raidDefeated)})`
  const lost = `a battle lost to him (${signed(RC.raidLost)})`
  const taken = `his land taken (${signed(conquered)})`
  const courted = `his villages courted away (${signed(RC.villageCourted)})`
  switch (rival) {
    case 'orc':
      return { up: [beaten, `a Grand Battle won against him (${signed(own.grandBattleWon)})`, `a week with no battle lost (${signed(RC.prizedWeek)})`], down: [lost, `a Grand Battle lost to him (${signed(own.grandBattleLost)})`, taken] }
    case 'goblin':
      return { up: [beaten, `a bribe paid (${signed(own.bribePaid)})`, `a buy-off taken (${signed(own.buyOffAccepted)})`, `a hex sold to him (${signed(RC.hexSold)})`, `a week within your food budget (${signed(RC.prizedWeek)})`], down: [lost, taken, `a buy-off refused (${signed(own.buyOffRefused)})`, `his bid for a village held off (${signed(own.bidHeld)})`, courted] }
    case 'dwarf':
      return { up: [beaten, `a pact kept to its end (${signed(own.pactKept)})`, `a week meeting your step pool (${signed(RC.prizedWeek)})`], down: [lost, taken, `each wall of his broken (${signed(own.wallBroken)})`, courted] }
    case 'archmage':
      return { up: [beaten, `a week with every duty kept (${signed(RC.prizedWeek)})`, `a week at Realm Consistency ${Math.round(RULES.respect.constantWeekAt * PERCENT)}% or more (${signed(own.constantWeek)})`, `a surge strike held (${signed(own.surgeHeld)})`, `a Ritual endured (${signed(own.ritualEndured)})`], down: [lost, taken, courted] }
  }
}

/**
 * Patch 5 (D-40, C-65): his standing in plain words: what it allows him, the marks that change it (his
 * own, Patch 6, D-48), and what moves his Respect. Read at each day's close from Respect (`standingFor`,
 * D-49). Every number in it is public.
 */
export function standingNote(state: CampaignState, rival: RivalId): string {
  const r = state.rivals[rival]
  if (r.status !== 'active') return ''
  const m = marksFor(rival)
  const now = { war: 'War: he sends conquest attempts as well as raids.', tension: 'Tension: he raids your border but sends no conquest attempts.', peace: 'Peace: no raids and no conquest attempts.' }[r.disposition.player]
  const marks = m.peace === null ? `He never makes peace; War comes at Respect ${signed(m.war)}, or if he joins a coalition against you.` : `Peace comes at Respect ${signed(m.peace)}; War at ${signed(m.war)}, or if he joins a coalition against you.`
  const d = drivers(rival)
  return `${now} ${marks} He respects ${d.up.join(', ')}; he resents ${d.down.join(', ')}.`
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
    case 'orc': {
      const track = orcTrackOf(state)
      const side = track > 0 ? 'your way' : track < 0 ? 'his way' : 'even'
      const tr = RULES.personalities.orc.track
      return [{ label: `War track ${track > 0 ? `+${track}` : track < 0 ? `−${-track}` : '0'} (−${-tr.min} to +${tr.max}), ${side}` }]
    }
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

/** The voice line a court opens with: its fall, its alliance, a warning at War, otherwise its greeting. */
function greetingMoment(status: RivalState['status'], mood: Mood): RivalMoment {
  if (status === 'conquered' || status === 'abdicated') return 'fall'
  if (status === 'allied') return 'allied'
  return mood === 'angry' ? 'warning' : 'greeting'
}

const FALL_HOW: Partial<Record<RivalState['status'], string>> = { conquered: 'conquest', abdicated: 'abdication' }

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
  const entry = CODEX.rivals.find((x) => x.id === rival)
  const name = rivalName(rival)
  const view = rivalView(state, rival, effects)
  const mood = moodOf(state, rival)
  const greetingId = `rivals.${rival}.${greetingMoment(r.status, mood)}`
  const fronts = Object.values(state.fronts)
    .filter((f) => f.rivals.includes(rival))
    .map((f) => {
      const other = f.rivals[0] === rival ? f.rivals[1] : f.rivals[0]
      return { front: f.front, other, otherName: rivalName(other), state: f.state, track: r.frontTracks[f.front] ?? 0 }
    })
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
    treasuryBand: view.treasuryBand,
    armyBand: view.armyBand,
    ...(view.treasury !== undefined ? { treasury: view.treasury } : {}),
    ...(view.army !== undefined ? { army: view.army } : {}),
    rumors: [...view.rumors, ...watchRumors(state, rival, today)].map((id) => ({ textId: id, text: t(id, { rival: name }) })),
    fronts,
    greeting: { textId: greetingId, text: t(greetingId, { rival: name, disposition: view.disposition, how: FALL_HOW[r.status] ?? r.status }) },
    ...(stance ? { stance } : {}),
    march: marchLines(state, rival, today),
    standingNote: standingNote(state, rival)
  }
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
        requires: rival === 'goblin' ? 'Any time; not rings 1 and 2, nor a Gate' : `Respect ${m.buysHex}; not rings 1 and 2, nor a Gate; one hex deal every ${tr.hexDealEveryWeeks} weeks`,
        effect: `You receive ${Math.round(tr.sellShare * PERCENT)}% of its buy price; +${RULES.respect.change.hexSold} Respect`
      }
    case 'truce':
      return { requires: 'Any time, except while a Grand Battle is announced', effect: `No raids or conquest attempts from it for ${tr.truce.days} days; +${RULES.respect.change.tradeOrTruce} Respect` }
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

/** Every deal `rival` could strike today (`availableDeals`), the unavailable ones with the engine's reason. */
export function dealsView(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): DealLine[] {
  const name = rivalName(rival)
  return availableDeals(state, rival, today).map((d) => {
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

/** The rival's one-line reaction to a deal struck (A3 writes it; until then the placeholder). */
export function dealReaction(rival: RivalId, deal: { kind: DealKind; price: number; hexId?: string; target?: RivalId }): { textId: string; text: string } {
  const id = `rivals.${rival}.dealStruck`
  const price = Math.round(deal.price * PURSE_STEP) / PURSE_STEP
  return { textId: id, text: t(id, { rival: rivalName(rival), deal: dealName(deal.kind, deal.hexId, deal.target), price }) }
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
