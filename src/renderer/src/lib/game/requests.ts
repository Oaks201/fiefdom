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
 * Patch 10 stage 3 (R1, R2, D-88): **commissions** take the dares' place. A commission asks for deeds in the ruler's
 * craft in the week ahead (`commissionNeed`), read from the `deed` events the chronicle posts (`commissionProgress`).
 * The player takes it up or declines; the `commissions` day phase (`settleCommissions`) pays it at the close of the
 * day it is met and judges one taken up and unmet at its last day's close. A ruler below 0 sends a toll and a
 * commission in turn, the commission as a demand in force without being taken up. A ruler who can't ask his
 * commission now asks nothing. Only a save from before 3.17.0 still holds a dare.
 *
 * Pure and deterministic: draws use the week close's date with the labels `request:*`.
 */
import { buyItem, itemOffer } from './armory'
import { addDays } from './clock'
import { CODEX } from './codex'
import { liftSiege } from './combat'
import { balance, roundPosting, spend } from './economy'
import { fieldStreak, inField, pathsOf, postDeed } from './dominion'
import { buyPrice, demandRefused, fortificationCap, promisesOn } from './land'
import { bandOf, isClaimableKind, touchesOwner } from './map'
import { RULES } from './rules'
import { chance, pick } from './rng'
import { standingSiegeOf } from './sieges'
import { EventBuffer, adjustRespect, awayOn, hexOf, isPlayable, openDayOf, replaceHex, toPlayer, withWorld, worldOf } from './state'
import { RIVAL_IDS, type CampaignState, type DeedKind, type Emit, type ISODate, type RequestKind, type RivalId, type RulerRequest } from './types'

const Q = RULES.requests
const C = Q.commission

/** The deeds of each ruler's craft a commission counts (K2 to K5), each on his own path. */
const COMMISSION_DEEDS: Record<RivalId, readonly DeedKind[]> = {
  orc: ['fieldDay'],
  goblin: ['dealTaken'],
  dwarf: ['wallRaised'],
  archmage: ['surgeSeized', 'surgeWeathered', 'mythicBeaten', 'mythicHunted']
}

/** Whether a commission is in force: taken up by the player, or sent as a demand (R2). */
export function commissionStands(q: Pick<RulerRequest, 'kind' | 'accepted' | 'demand'>): boolean {
  return q.kind === 'commission' && (q.accepted !== undefined || q.demand === true)
}

/** The deeds of his craft the log holds for `q`'s week: after the close it came at, through its last day. */
export function commissionProgress(state: CampaignState, q: Pick<RulerRequest, 'rival' | 'madeOn' | 'until'>): number {
  const kinds = COMMISSION_DEEDS[q.rival]
  let done = 0
  // The log runs in day order: read back from its end to the close the commission came at.
  for (let i = state.log.length - 1; i >= 0 && state.log[i].day > q.madeOn; i--) {
    const e = state.log[i]
    if (e.kind === 'deed' && e.path === q.rival && e.day <= q.until && kinds.includes(e.deed)) done++
  }
  return done
}

/** What `rival` would commission at the close of `day` (R1): how many deeds of his craft, or undefined when it can't be done now, so he asks nothing. */
export function commissionNeed(state: CampaignState, rival: RivalId, day: ISODate): number | undefined {
  const mine = state.hexes.filter((h) => h.owner === 'player' && isClaimableKind(h))
  switch (rival) {
    case 'orc': {
      // Only while his field is in reach: a hex he holds or a hex of his march beside the player's land.
      const reach = state.hexes.some((h) => h.owner !== 'player' && inField(h) && isClaimableKind(h) && touchesOwner(state.hexes, h.id, 'player'))
      if (!reach) return undefined
      return fieldStreak(state, addDays(day, 1)) >= C.streakFor ? C.fieldDaysOnStreak : C.fieldDays
    }
    case 'dwarf': {
      // By the deepest band the player holds beyond the protected rings, while that many levels can still be raised.
      const band = Math.max(0, ...mine.filter((h) => h.ring > RULES.land.protectedThroughRing).map((h) => bandOf(h)))
      if (band === 0) return undefined
      const need = C.wallLevels[Math.min(C.wallLevels.length - 1, Math.max(0, band - C.wallLevelsFromBand))]
      const room = mine.reduce((s, h) => s + Math.max(0, fortificationCap('player') - h.fortification), 0)
      return room >= need ? need : undefined
    }
    case 'goblin':
      return C.one
    case 'archmage':
      // His surges land in his march: only while the player holds a hex of it.
      return mine.some((h) => h.march === rival || h.seam === rival) ? C.one : undefined
  }
}

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

function told(q: RulerRequest): { hexId?: string; itemId?: string; price?: number; need?: number; demand?: true } {
  return {
    ...(q.hexId ? { hexId: q.hexId } : {}),
    ...(q.itemId ? { itemId: q.itemId } : {}),
    ...(q.price !== undefined ? { price: q.price } : {}),
    ...(q.need !== undefined ? { need: q.need } : {}),
    ...(q.demand ? { demand: true as const } : {})
  }
}

/** A request ended without being granted on `day`: refused by the player or left to lapse. A demand costs Respect and he acts on it. */
function refused(input: CampaignState, q: RulerRequest, stage: 'refused' | 'lapsed', day: ISODate, emit: Emit): CampaignState {
  emit('request', { rival: q.rival, request: q.kind, stage, ...told(q) })
  const state = dropped(input, q)
  return isDemand(q) ? demandRefused(state, q, day, emit) : state
}

export type RequestRefusal = 'campaignOver' | 'noRequest' | 'dare' | 'reputation' | 'gone' | 'accepted' | string

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
  if (q.kind === 'commission') {
    // Stage 3 (R1): taken up, it stands until it is met or its week ends; declined, nothing. One sent as a demand (R2) is already in force, and refusing it costs as a demand does.
    if (q.accepted !== undefined || (answer === 'grant' && q.demand)) return no('accepted')
    if (answer === 'grant') {
      emit('request', { rival: q.rival, request: q.kind, stage: 'accepted', ...told(q), until: q.until })
      return { ok: true, state: events.flush(withWorld(state, { requests: requestsOf(state).map((x) => (x.id === q.id ? { ...x, accepted: today } : x)) })), cost: 0 }
    }
    emit('request', { rival: q.rival, request: q.kind, stage: q.demand ? 'refused' : 'declined', ...told(q) })
    const left = dropped(state, q)
    return { ok: true, state: events.flush(q.demand ? adjustRespect(left, q.rival, Q.demand.refused, 'commissionRefused', emit) : left), cost: 0 }
  }
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

/**
 * Rules 3.11.1 (D-71): `rival`'s dare judged missed at the close of `day`, met after all once a correction to that
 * week's steps or food keeps the habit he prizes: what met gives over what missed took, once. The late `met`
 * names the close it is for (`until`).
 */
export function lateDareMet(state: CampaignState, rival: RivalId, day: ISODate, emit: Emit): CampaignState {
  const judged = state.log.flatMap((e) => (e.kind === 'request' && e.rival === rival && e.request === 'dare' && (e.until ?? e.day) === day && (e.stage === 'met' || e.stage === 'missed') ? [e.stage] : []))
  if (!judged.includes('missed') || judged.includes('met')) return state
  emit('request', { rival, request: 'dare', stage: 'met', until: day })
  return adjustRespect(state, rival, Q.dare.met - Q.dare.missed, 'dareMet', emit)
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

/**
 * Stage 3 (R1, D-88): the `commissions` day phase. A commission in force is met at the close of the day the log holds
 * the deeds it asked for: his Respect and Renown on his path, at once (D-53). Its last day is a week close, and what
 * that close's own phases post still counts (a courtship won there is a hex won by coin): so its end is judged by the
 * `commissions` week phase (`closing`), after the week's chronicle. There one in force and unmet is missed, and one
 * never taken up lapses at no cost. Away, either ends quietly (X-17). A ruler resolved
 * meanwhile asks nothing more.
 */
export function settleCommissions(input: CampaignState, day: ISODate, emit: Emit, closing = false): CampaignState {
  let state = input
  for (const q of requestsOf(input)) {
    if (q.kind !== 'commission' || q.outcome !== undefined || day <= q.madeOn) continue
    if (state.rivals[q.rival].status !== 'active') {
      state = dropped(state, q)
      continue
    }
    const stands = commissionStands(q)
    const done = commissionProgress(state, q)
    const need = q.need ?? C.one
    if (stands && done >= need) {
      emit('request', { rival: q.rival, request: q.kind, stage: 'met', ...told(q), done })
      state = adjustRespect(dropped(state, q), q.rival, q.demand ? Q.demand.granted : C.met, 'commissionMet', emit)
      state = postDeed(state, { path: q.rival, deed: 'commissionMet', value: C.renown }, emit)
    } else if (closing ? day >= q.until : day > q.until) {
      state = dropped(state, q)
      if (awayOn(state, day)) continue
      if (!stands) emit('request', { rival: q.rival, request: q.kind, stage: 'lapsed', ...told(q) })
      else {
        emit('request', { rival: q.rival, request: q.kind, stage: 'missed', ...told(q), done })
        state = adjustRespect(state, q.rival, q.demand ? Q.demand.refused : C.missed, 'commissionMissed', emit)
      }
    }
  }
  return state
}

/** Stage 3 (R3): the deed whose count is each ruler's craft mark, and the count it needs (the Orc's is his streak). */
const MARK_DEED: Partial<Record<RivalId, { deed: DeedKind; need: number }>> = {
  dwarf: { deed: 'wallRaised', need: Q.craftMarks.wallLevels },
  goblin: { deed: 'dealTaken', need: Q.craftMarks.coinHexes },
  archmage: { deed: 'surgeSeized', need: Q.craftMarks.ebbHexes }
}

/**
 * Stage 3 (R3, D-89): at a day's close, each active ruler whose craft mark the player has just reached for the first
 * time offers his own deal free, once (`craftGifts`, `isGift` in land.ts). Read only on a day that posted a deed of
 * his craft, so the count over the log is made a handful of times a campaign.
 */
export function craftMarks(input: CampaignState, day: ISODate, emit: Emit): CampaignState {
  let state = input
  const gifts = worldOf(input).craftGifts ?? {}
  for (const rival of RIVAL_IDS) {
    if (gifts[rival] !== undefined || state.rivals[rival].status !== 'active') continue
    const mark = MARK_DEED[rival]
    let reached = false
    if (!mark) {
      const field = pathsOf(state).field
      reached = field !== undefined && field.through === day && field.days >= Q.craftMarks.fieldStreak
    } else {
      let today = false
      for (let i = state.log.length - 1; i >= 0 && state.log[i].day >= day; i--) {
        const e = state.log[i]
        if (e.kind === 'deed' && e.path === rival && e.deed === mark.deed) today = true
      }
      reached = today && state.log.filter((e) => e.kind === 'deed' && e.path === rival && e.deed === mark.deed).length >= mark.need
    }
    if (!reached) continue
    emit('craftMark', { rival })
    state = withWorld(state, { craftGifts: { ...worldOf(state).craftGifts, [rival]: 'offered' } })
  }
  return state
}

/** The request `rival` makes at the close of `day`: a demand first, else his commission, or (Skivvet and Emrys, after a commission) his offer; undefined when he has nothing he can ask. */
function requestFor(state: CampaignState, rival: RivalId, day: ISODate): RulerRequest | undefined {
  const base = { id: `req-${rival}-${day}`, rival, madeOn: day, until: addDays(day, Q.answerDays) }
  const siege = standingSiegeOf(state)
  if (siege && hexOf(state, siege.hexId)?.owner === rival && !promisesOn(state, day).some((q) => q.hexId === siege.hexId)) return { ...base, kind: 'liftSiege', hexId: siege.hexId }
  const spare = assaulted(state, rival, day)
  if (spare) return { ...base, kind: 'spareHex', hexId: spare }
  const commission = (demand: boolean): RulerRequest | undefined => {
    const need = commissionNeed(state, rival, day)
    return need === undefined ? undefined : { ...base, kind: 'commission', need, ...(demand ? { demand: true as const } : {}) }
  }
  const last = lastMade(state, rival)?.kind
  if (state.rivals[rival].respect < 0) {
    // R2: a way back. A toll and a commission in turn, the commission worded as a demand.
    const wayBack = last === 'toll' ? commission(true) : undefined
    if (wayBack) return wayBack
    const his = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h))
    const facing = his.filter((h) => touchesOwner(state.hexes, h.id, 'player'))
    const band = Math.max(1, ...(facing.length > 0 ? facing : his).map((h) => bandOf(h)))
    return { ...base, kind: 'toll', price: Q.tollPerBand * band }
  }
  // Skivvet and Emrys turn from a commission to an offer of their own and back; Ugrak and Hrodgar, who offer nothing, commission.
  if (last !== 'commission' && last !== 'dare') return commission(false)
  if (rival === 'goblin') {
    const items = CODEX.items.flatMap((i) => {
      const offer = itemOffer(state, i.id)
      return offer.ok || offer.reason?.code === 'reputation' ? [{ id: i.id, cost: offer.cost }] : []
    })
    if (items.length === 0) return commission(false)
    const item = pick(state.campaign.seed, day, 'request:item', items)
    return { ...base, kind: 'itemOffer', itemId: item.id, price: roundPosting(item.cost * (1 - Q.offerDiscount)) }
  }
  if (rival === 'archmage') {
    const hexes = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'lairMouth' && touchesOwner(state.hexes, h.id, 'player'))
    if (hexes.length === 0) return commission(false)
    const hex = pick(state.campaign.seed, day, 'request:hex', hexes)
    return { ...base, kind: 'hexOffer', hexId: hex.id, price: roundPosting(buyPrice(state, rival, hex) * (1 - Q.offerDiscount)) }
  }
  return commission(false)
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
    // A commission is judged by its own phases (`settleCommissions`), the last at the end of this close.
    if (q.kind === 'commission') continue
    state = q.kind === 'dare' || q.outcome === 'granted' || state.rivals[q.rival].status !== 'active' || away ? dropped(state, q) : refused(state, q, 'lapsed', w.day, w.emit)
  }
  if (!isPlayable(state) || away || w.week < Q.fromWeek || !chance(state.campaign.seed, w.day, 'request:roll', Q.chance)) return state
  const free = RIVAL_IDS.filter((r) => state.rivals[r].status === 'active' && !requestsOf(state).some((q) => q.rival === r && q.outcome === undefined))
  if (free.length === 0) return state
  const asked = (r: RivalId): string => lastMade(state, r)?.day ?? ''
  const least = free.map(asked).sort()[0]
  const rival = pick(state.campaign.seed, w.day, 'request:rival', free.filter((r) => asked(r) === least))
  // Stage 3: a ruler whose commission can't be done now asks nothing, and the next who asked least lately asks in his place.
  const turn = [rival, ...free.filter((r) => r !== rival).sort((a, b) => asked(a).localeCompare(asked(b)))]
  const q = turn.map((r) => requestFor(state, r, w.day)).find((x) => x !== undefined)
  if (!q) return state
  w.emit('request', { rival: q.rival, request: q.kind, stage: 'made', ...told(q), until: q.until })
  return withWorld(state, { requests: [...requestsOf(state), q] })
}
