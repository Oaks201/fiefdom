/**
 * Patch 8 (R1, D-66): the rulers come to the player. At a week close one ruler may send a request, open
 * for the week ahead. Rulers who like the player ask; those who don't, demand:
 * - a **dare** to keep the habit he prizes that week (a ruler at Respect 0 or more): nothing to answer;
 *   the rival turn judges it at the week's close (`settleDare`), where the prized week is read;
 * - an **offer** of his own: Skivvet an Armory item, Emrys a hex of his beside the player's land, both
 *   at a discount;
 * - a **demand**: lift the siege on his hex, leave alone a hex of his the player assaulted, or (a ruler
 *   below 0) pay a toll. A siege lifted or a hex spared stands as the player's promise to leave that hex
 *   alone a while (`promisesOn`); an assault on it breaks the promise (`breakPromises`).
 * The player answers in his Audience (`answerRequest`). At the next close a demand left unanswered is
 * refused and an offer lapses (`requestsWeek`). A demand refused, by word, silence or a promise broken,
 * costs Respect and he acts on it (`demandRefused`). Every request ends in the log (`request` events);
 * the state keeps only open ones and the promises standing. Absence never costs anything (X-17): no ruler
 * asks while the player is away, and a demand or a dare that runs out then ends quietly.
 *
 * Pure and deterministic: draws use the week close's date with the labels `request:*`.
 */
import { buyItem, itemOffer } from './armory'
import { addDays } from './clock'
import { CODEX } from './codex'
import { liftSiege } from './combat'
import { balance, roundPosting, spend } from './economy'
import { buyPrice, demandRefused, promisesOn } from './land'
import { bandOf, isClaimableKind, touchesOwner } from './map'
import { RULES } from './rules'
import { chance, pick } from './rng'
import { standingSiegeOf } from './sieges'
import { EventBuffer, adjustRespect, awayOn, hexOf, isPlayable, openDayOf, replaceHex, toPlayer, withWorld, worldOf } from './state'
import { RIVAL_IDS, type CampaignState, type Emit, type ISODate, type RequestKind, type RivalId, type RulerRequest } from './types'

const Q = RULES.requests

/** The requests open now and the promises standing (the ended ones are in the log). */
export function requestsOf(state: CampaignState): RulerRequest[] {
  return worldOf(state).requests ?? []
}

/** `rival`'s request open on `day`: made at a close before it, its last day not past, not yet answered. */
export function requestOf(state: CampaignState, rival: RivalId, day: ISODate): RulerRequest | undefined {
  return requestsOf(state).find((q) => q.rival === rival && q.outcome === undefined && q.madeOn < day && day <= q.until)
}

/** Whether a request is a demand: refusing it costs Respect and he acts on it. */
export function isDemand(q: Pick<RulerRequest, 'kind'>): boolean {
  return q.kind === 'liftSiege' || q.kind === 'spareHex' || q.kind === 'toll'
}

function dropped(state: CampaignState, q: RulerRequest): CampaignState {
  return withWorld(state, { requests: requestsOf(state).filter((x) => x.id !== q.id) })
}

function told(q: RulerRequest): { hexId?: string; itemId?: string; price?: number } {
  return { ...(q.hexId ? { hexId: q.hexId } : {}), ...(q.itemId ? { itemId: q.itemId } : {}), ...(q.price !== undefined ? { price: q.price } : {}) }
}

/** A request ended without being granted on `day`: refused by the player or left to lapse. A demand costs Respect and he acts on it. */
function refused(input: CampaignState, q: RulerRequest, stage: 'refused' | 'lapsed', day: ISODate, emit: Emit): CampaignState {
  emit('request', { rival: q.rival, request: q.kind, stage, ...told(q) })
  const state = dropped(input, q)
  return isDemand(q) ? demandRefused(state, q, day, emit) : state
}

export type RequestRefusal = 'campaignOver' | 'noRequest' | 'dare' | 'reputation' | 'gone' | string

/**
 * The player answers `rival`'s open request on `today` (R1). Granting a demand lifts the siege, spares the hex or
 * pays the toll; a siege lifted or a hex spared then stands as a promise to leave that hex alone for `spareDays`.
 * Granting an offer buys the item (at his price, `itemOffer`) or the hex. Granted, +`demand.granted` Respect;
 * refused, a demand costs `demand.refused` and he acts on it. A dare is never answered.
 */
export function answerRequest(state: CampaignState, rival: RivalId, answer: 'grant' | 'refuse', today: ISODate = openDayOf(state)): { ok: boolean; reason?: RequestRefusal; state: CampaignState; cost: number } {
  const no = (reason: RequestRefusal): { ok: false; reason: RequestRefusal; state: CampaignState; cost: number } => ({ ok: false, reason, state, cost: 0 })
  if (!isPlayable(state)) return no('campaignOver')
  const q = requestOf(state, rival, today)
  if (!q) return no('noRequest')
  if (q.kind === 'dare') return no('dare')
  const events = new EventBuffer()
  const emit = events.emitter(today)
  if (answer === 'refuse') return { ok: true, state: events.flush(refused(state, q, 'refused', today, emit)), cost: 0 }
  let next = dropped(state, q)
  let cost = 0
  switch (q.kind) {
    case 'liftSiege':
    case 'spareHex':
      if (q.kind === 'liftSiege') next = liftSiege(next, today)
      next = withWorld(next, { requests: [...requestsOf(next), { ...q, outcome: 'granted', until: addDays(today, Q.spareDays - 1) }] })
      break
    case 'toll':
      cost = q.price ?? 0
      if (balance(state.purse) < cost) return no('reputation')
      next = { ...next, purse: spend(next.purse, today, cost, `request:${q.id}`) }
      break
    case 'itemOffer': {
      const bought = buyItem(state, q.itemId as string, today)
      if (!bought.ok) return no(bought.reason?.code ?? 'gone')
      next = dropped(bought.state, q)
      cost = bought.cost
      break
    }
    case 'hexOffer': {
      const hex = q.hexId ? hexOf(state, q.hexId) : undefined
      if (!hex || hex.owner !== q.rival || !touchesOwner(state.hexes, hex.id, 'player')) return no('gone')
      cost = q.price ?? 0
      if (balance(state.purse) < cost) return no('reputation')
      next = replaceHex({ ...next, purse: spend(next.purse, today, cost, `request:${q.id}`) }, toPlayer(hex, today, false))
      emit('hexTransfer', { hexId: hex.id, from: q.rival, to: 'player', how: 'trade', fortification: hex.fortification })
      break
    }
  }
  emit('request', { rival: q.rival, request: q.kind, stage: 'granted', ...told(q) })
  next = adjustRespect(next, q.rival, Q.demand.granted, 'requestGranted', emit)
  return { ok: true, state: events.flush(next), cost }
}

/** The rival turn (R1): `rival`'s dare whose week closes on `day`, settled by whether that week kept the habit he prizes; one missed while the player is away ends quietly. */
export function settleDare(state: CampaignState, rival: RivalId, day: ISODate, met: boolean, emit: Emit): CampaignState {
  const q = requestsOf(state).find((x) => x.rival === rival && x.kind === 'dare' && x.until === day)
  if (!q) return state
  if (!met && awayOn(state, day)) return dropped(state, q)
  emit('request', { rival, request: 'dare', stage: met ? 'met' : 'missed' })
  return adjustRespect(dropped(state, q), rival, met ? Q.dare.met : Q.dare.missed, met ? 'dareMet' : 'dareMissed', emit)
}

/** The request `rival` last sent, as the log has it, if he has. */
function lastMade(state: CampaignState, rival: RivalId): { day: ISODate; kind: RequestKind } | undefined {
  const e = state.log.findLast((x) => x.kind === 'request' && x.rival === rival && x.stage === 'made')
  return e?.kind === 'request' ? { day: e.day, kind: e.request } : undefined
}

/** His hex the player assaulted most lately within `spareAfterDays` of `day`, still his and not already promised. */
function assaulted(state: CampaignState, rival: RivalId, day: ISODate): string | undefined {
  const promised = new Set(promisesOn(state, day).map((q) => q.hexId))
  const from = addDays(day, 1 - Q.spareAfterDays)
  const hit = state.log.findLast((e) => e.kind === 'assault' && e.day >= from && e.owner === rival && e.outcome !== 'revealed' && e.outcome !== 'taken' && hexOf(state, e.hexId)?.owner === rival && !promised.has(e.hexId))
  return hit?.kind === 'assault' ? hit.hexId : undefined
}

/** The request `rival` makes at the close of `day`: a demand first, else a dare, or (Skivvet and Emrys, after a dare) his offer. */
function requestFor(state: CampaignState, rival: RivalId, day: ISODate): RulerRequest {
  const base = { id: `req-${rival}-${day}`, rival, madeOn: day, until: addDays(day, Q.answerDays) }
  const siege = standingSiegeOf(state)
  if (siege && hexOf(state, siege.hexId)?.owner === rival && !promisesOn(state, day).some((q) => q.hexId === siege.hexId)) return { ...base, kind: 'liftSiege', hexId: siege.hexId }
  const spare = assaulted(state, rival, day)
  if (spare) return { ...base, kind: 'spareHex', hexId: spare }
  if (state.rivals[rival].respect < 0) {
    const his = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h))
    const facing = his.filter((h) => touchesOwner(state.hexes, h.id, 'player'))
    const band = Math.max(1, ...(facing.length > 0 ? facing : his).map((h) => bandOf(h)))
    return { ...base, kind: 'toll', price: Q.tollPerBand * band }
  }
  // Skivvet and Emrys turn from a dare to an offer of their own and back; Ugrak and Hrodgar, who offer nothing, dare.
  if (lastMade(state, rival)?.kind !== 'dare') return { ...base, kind: 'dare' }
  if (rival === 'goblin') {
    const items = CODEX.items.flatMap((i) => {
      const offer = itemOffer(state, i.id)
      return offer.ok || offer.reason?.code === 'reputation' ? [{ id: i.id, cost: offer.cost }] : []
    })
    if (items.length === 0) return { ...base, kind: 'dare' }
    const item = pick(state.campaign.seed, day, 'request:item', items)
    return { ...base, kind: 'itemOffer', itemId: item.id, price: roundPosting(item.cost * (1 - Q.offerDiscount)) }
  }
  if (rival === 'archmage') {
    const hexes = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'lairMouth' && touchesOwner(state.hexes, h.id, 'player'))
    if (hexes.length === 0) return { ...base, kind: 'dare' }
    const hex = pick(state.campaign.seed, day, 'request:hex', hexes)
    return { ...base, kind: 'hexOffer', hexId: hex.id, price: roundPosting(buyPrice(state, rival, hex) * (1 - Q.offerDiscount)) }
  }
  return { ...base, kind: 'dare' }
}

/**
 * The `world` week phase (R1): demands and offers whose week has run end (a demand refused by silence, an offer
 * lapsed), promises run out, a dare whose ruler fell meanwhile ends quietly (and any of them while the player is
 * away), then, from `fromWeek` and at `chance`, a ruler with nothing open sends a request: the one who asked least
 * lately, by lot among equals.
 */
export function requestsWeek(input: CampaignState, w: { day: ISODate; week: number; emit: Emit }): CampaignState {
  let state = input
  const away = awayOn(state, w.day)
  for (const q of requestsOf(state)) {
    if (q.until > w.day) continue
    state = q.kind === 'dare' || q.outcome === 'granted' || state.rivals[q.rival].status !== 'active' || away ? dropped(state, q) : refused(state, q, 'lapsed', w.day, w.emit)
  }
  if (!isPlayable(state) || away || w.week < Q.fromWeek || !chance(state.campaign.seed, w.day, 'request:roll', Q.chance)) return state
  const free = RIVAL_IDS.filter((r) => state.rivals[r].status === 'active' && !requestsOf(state).some((q) => q.rival === r && q.outcome === undefined))
  if (free.length === 0) return state
  const asked = (r: RivalId): string => lastMade(state, r)?.day ?? ''
  const least = free.map(asked).sort()[0]
  const rival = pick(state.campaign.seed, w.day, 'request:rival', free.filter((r) => asked(r) === least))
  const q = requestFor(state, rival, w.day)
  w.emit('request', { rival, request: q.kind, stage: 'made', ...told(q), until: q.until })
  return withWorld(state, { requests: [...requestsOf(state), q] })
}
