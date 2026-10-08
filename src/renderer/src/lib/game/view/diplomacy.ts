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
import { claimableBy, hexLabel } from '../map'
import { RULES } from '../rules'
import { respectEffects, rivalView, type ArmyBand, type RespectEffects, type TreasuryBand } from '../rivals'
import { openDayOf } from '../state'
import { t, type RivalMoment } from '../text'
import { RIVAL_IDS, type CampaignState, type Disposition, type Effects, type FrontId, type ISODate, type Owner, type RivalId, type RivalState } from '../types'
import { suggestedBid, trustNow } from './realm'
import { landRefusalLabel } from './refusals'
import { rivalName } from './shell'

const PERCENT = 100 // rules-ok: shares shown as percentages
const PURSE_STEP = 10 // rules-ok: the purse's 0.1 precision (A-11)

export type Mood = 'calm' | 'angry' | 'humbled'

export interface RespectMark {
  at: number
  /** What Respect at this mark opens (`respectEffects`), as keys and in plain words. */
  opens: (keyof RespectEffects)[]
  labels: string[]
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

const OPENS: Record<keyof RespectEffects, (rival: RivalId) => string> = {
  raidsWeaker: () => `Its raids strike ${Math.round((1 - RULES.respect.raidsWeakerMult) * PERCENT)}% weaker`,
  sellsHex: () => 'It sells you hexes',
  buysHex: () => 'It buys your hexes',
  pact: () => 'Non-aggression pacts',
  envoy: () => `Its envoy fights for you at ${RULES.respect.envoyCostPerBattle} a battle`,
  accordTalks: () => 'Accord talks open',
  callToArms: () => 'Calls to arms',
  accordEasier: () => 'Its Accord is easier'
}

/** The Respect marks of Ch 12's table, each with what it opens for this rival. */
export function respectMarks(rival: RivalId, respect: number): RespectMark[] {
  const th = RULES.respect.thresholds
  const marks = [...new Set([th.raidsWeaker, th.goblinBuysHex, th.pact, th.envoy, th.accordTalks, th.accordEasier, th.buyHex, th.callToArms, th.sellHex])].sort((a, b) => a - b)
  return marks
    .map((at) => {
      const below = respectEffects(rival, at - 1)
      const here = respectEffects(rival, at)
      const opens = (Object.keys(here) as (keyof RespectEffects)[]).filter((k) => here[k] && !below[k])
      return { at, opens, labels: opens.map((k) => OPENS[k](rival)), reached: respect >= at }
    })
    .filter((m) => m.opens.length > 0)
}

export function rivalPanel(state: CampaignState, rival: RivalId, effects: Effects = realmEffects(state)): RivalPanel {
  const r = state.rivals[rival]
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
    rumors: view.rumors.map((id) => ({ textId: id, text: t(id, { rival: name }) })),
    fronts,
    greeting: { textId: greetingId, text: t(greetingId, { rival: name, disposition: view.disposition, how: FALL_HOW[r.status] ?? r.status }) }
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
  hexLabel?: string
  target?: RivalId
  available: boolean
  /** The engine's reason, as its catalog text id and the words. */
  reason?: { code: string; textId: string; text: string }
}

/** A deal's name in plain words. */
export function dealName(kind: DealKind, hexId?: string, target?: RivalId): string {
  switch (kind) {
    case 'buyHex':
      return hexId ? `Buy hex ${hexLabel(hexId)}` : 'Buy a hex'
    case 'sellHex':
      return hexId ? `Sell hex ${hexLabel(hexId)}` : 'Sell a hex'
    case 'truce':
      return 'Truce'
    case 'pact':
      return 'Non-aggression pact'
    case 'callToArms':
      return target ? `Call to arms against ${rivalName(target)}` : 'Call to arms'
    case 'buyout':
      return 'Buy-out from its coalition'
  }
}

function dealTerms(kind: DealKind, rival: RivalId): { requires: string; effect: string } {
  const th = RULES.respect.thresholds
  const tr = RULES.trade
  switch (kind) {
    case 'buyHex':
      return {
        requires: `Respect ${rival === 'goblin' ? th.goblinBuysHex : th.buyHex}; not at war with you; never its Gate; one hex deal every ${tr.hexDealEveryWeeks} weeks`,
        effect: `The hex is yours at once; +${RULES.respect.change.tradeOrTruce} Respect`
      }
    case 'sellHex':
      return {
        requires: `Respect ${th.sellHex}; not rings 1 and 2, nor a Gate; one hex deal every ${tr.hexDealEveryWeeks} weeks`,
        effect: `You receive ${Math.round(tr.sellShare * PERCENT)}% of its buy price; +${RULES.respect.change.hexSold} Respect`
      }
    case 'truce':
      return { requires: 'Any time, except while a Grand Battle is announced', effect: `No raids or conquest attempts from it for ${tr.truce.days} days; +${RULES.respect.change.tradeOrTruce} Respect` }
    case 'pact':
      return { requires: `Respect ${th.pact}`, effect: `No conquest attempts from it for ${tr.pact.days} days; its raids come half as often` }
    case 'callToArms':
      return { requires: `Respect ${th.callToArms}; a front between them; not coalition partners`, effect: `It declares war on the other for ${tr.callToArms.days} days` }
    case 'buyout':
      return { requires: `Respect ${RULES.world.coalitions.buyout.minRespect}; it stands in a coalition against you`, effect: 'It walks away and the coalition ends today' }
  }
}

/** Every deal `rival` could strike today (`availableDeals`), the unavailable ones with the engine's reason. */
export function dealsView(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): DealLine[] {
  const name = rivalName(rival)
  return availableDeals(state, rival, today).map((d) => {
    const line: DealLine = { kind: d.kind, rival, price: d.price, name: dealName(d.kind, d.hexId, d.target), ...dealTerms(d.kind, rival), available: d.allowed }
    if (d.hexId) {
      line.hexId = d.hexId
      line.hexLabel = hexLabel(d.hexId)
    }
    if (d.target) line.target = d.target
    if (!d.allowed && d.reason) {
      const facts = {
        rival: name,
        ...(d.reason.needed !== undefined ? { needed: d.reason.needed } : {}),
        ...(d.reason.have !== undefined ? { have: d.reason.have } : {}),
        ...(d.hexId ? { hex: hexLabel(d.hexId) } : {}),
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
        label: hexLabel(h),
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
        label: hexLabel(c.hexId),
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
          ? [{ day: e.day, hexId: e.hexId, label: hexLabel(e.hexId), outcome: e.outcome, bid: e.bid, ...(e.loyaltyDrop !== undefined ? { loyaltyDrop: e.loyaltyDrop } : {}), ...(e.winner ? { winner: e.winner } : {}) }]
          : []
      )
      .reverse()
  }
}
