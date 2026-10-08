/**
 * The world-event deck (Ch 13 "The world-event deck", Appendix C, A-169 to A-171): 14 events with
 * hidden criteria, checked at each week close; at most one new event fires a week, each once
 * unless recurring. Every lasting effect lives where its system already reads modifiers, and is
 * recorded in `state.worldEvents` with the days it holds (`data.from` to `data.until`):
 *
 * - tithes through `realmEffects` (the Hungry Winter, an `event` source);
 * - the threat mix and conquest reach through `COMBAT_HOOKS` (the Beast Surge, the Deep Call);
 * - garrisons on the map (the Beast Surge's +20%, the Pretender's rebels);
 * - the rival turn through `RIVAL_HOOKS` (Fear of the Crown);
 * - the roster (the Wandering Order, a company lent to an envoy), the Armory (the Merchant
 *   Caravan) and Accords (the Lost Heir, in world.ts);
 * - Grand Battles through `announceGrandBattle` and `GRAND_HOOKS.event` (Ugrak's Challenge, the
 *   Dragon, the Wild Hunt), always announced at least 2 days ahead.
 *
 * Events never take land in rings 0 to 2 and never end the campaign. Their criteria are hidden:
 * screens learn of an event only from its `worldEvent` post, and the Scrying Pool's hint names an
 * event, never its criteria.
 *
 * Draws use the week close's date with the labels `event:<id>`, `event:<id>:pick`, `auction:<hex>`
 * and `uprising:<hex>`.
 */
import { heldItems, itemOffer } from '../armory'
import { CODEX, type CodexParams } from '../codex'
import { addDays, campaignWeek, diffDays, weekdayOf, weekOf } from '../clock'
import { COMBAT_HOOKS, baseArmyValue, scorch, type ThreatMix } from '../combat'
import { balance, post, roundPosting, spend, tribute as payTribute, withBonus } from '../economy'
import { realmEffects } from '../effects'
import { GRAND_HOOKS, announceGrandBattle, monthOf, postSpoils, postTribute, type OutcomeContext } from '../grand'
import { mythicHost, rivalHost } from '../grand/hosts'
import { trust } from '../land'
import { borderHexesOf, capitals, isClaimableKind, nearestTo } from '../map'
import { RULES, base, type DeepReadonly } from '../rules'
import { chance, pick } from '../rng'
import { RIVAL_HOOKS } from '../rivals'
import { EventBuffer, adjustRespect, hexOf, isPlayable, openDayOf, patchRival, replaceHex, toPlayer, toRival, withWorld, worldOf } from '../state'
import { RIVAL_IDS, type CampaignState, type Emit, type GrandBattle, type GrandOutcome, type HexState, type ISODate, type RivalId, type WorldEvent } from '../types'

// ── Reading ──────────────────────────────────────────────────────────────────

/** What every recorded event keeps: the days its effect holds, and its plain facts. */
export interface EventHold {
  from: ISODate
  /** Its last day; absent for an effect that lasts (the Lost Heir). */
  until?: ISODate
  rival?: RivalId
  other?: RivalId
  hexIds?: string[]
  item?: string
  battleId?: string
}

function holdOf(ev: WorldEvent): EventHold {
  return (ev.data ?? {}) as EventHold
}

/** The events of `id` fired so far. */
export function eventsFired(state: CampaignState, id: string): WorldEvent[] {
  return state.worldEvents.filter((e) => e.id === id)
}

/** The event `id` in force on `day`, if any. */
export function eventInForce(state: CampaignState, id: string, day: ISODate): (WorldEvent & { data: EventHold }) | undefined {
  const ev = state.worldEvents.find((e) => e.id === id && holdOf(e).from <= day && (holdOf(e).until === undefined || day <= (holdOf(e).until as ISODate)))
  return ev ? { ...ev, data: holdOf(ev) } : undefined
}

function entry(id: string): (typeof CODEX.events)[number] {
  const e = CODEX.events.find((x) => x.id === id)
  if (!e) throw new Error(`The codex has no event ${id}`)
  return e
}

/** An event's parameters as the frozen codex holds them. */
type Params = DeepReadonly<CodexParams>

function num(params: Params, key: string): number {
  const v = params[key]
  if (typeof v !== 'number') throw new Error(`Event parameter ${key} is not a number`)
  return v
}

function weeksAfter(from: ISODate, weeks: number): ISODate {
  return addDays(from, weeks * RULES.clock.daysPerWeek - 1)
}

// ── The full moon (the Wild Hunt) ────────────────────────────────────────────

/**
 * The first day on or after `day` that holds a full moon: half a synodic month after a known new
 * moon, counted in whole days (A-170; good to about a day).
 */
export function nextFullMoon(day: ISODate): ISODate {
  const m = RULES.worldAi.moon
  const since = diffDays(m.knownNewMoon, day)
  const half = m.synodicDays / 2
  let n = Math.ceil((since - m.knownNewMoonDayShare - half) / m.synodicDays)
  let instant = m.knownNewMoonDayShare + half + n * m.synodicDays
  while (instant < since) {
    n += 1
    instant = m.knownNewMoonDayShare + half + n * m.synodicDays
  }
  return addDays(m.knownNewMoon, Math.floor(instant))
}

// ── The week close ───────────────────────────────────────────────────────────

/** What the deck reads at a week close. */
export interface DeckWeek {
  /** The week's last day; effects start at the next dawn. */
  day: ISODate
  week: number
  realmConsistency: number
  emit: Emit
}

/** The first full week of `month` starts at the dawn after `day`: the week starting there lies wholly in the month and is its first such week. */
function firstFullWeekStartsAfter(day: ISODate, month: number): boolean {
  const next = addDays(day, 1)
  const [, mm, dd] = next.split('-').map(Number)
  const end = addDays(next, RULES.clock.daysPerWeek - 1)
  return mm === month && dd <= RULES.clock.daysPerWeek && Number(end.split('-')[1]) === month
}

function lairMouth(state: CampaignState, lairId: string): HexState | undefined {
  const lair = CODEX.lairs.find((l) => l.id === lairId)
  return state.hexes.find((h) => h.kind === 'lairMouth' && h.land === lair?.land)
}

/** The player's hex nearest `to` (a lair's mouth, a rival's land), ties drawn: where an event's battle strikes (A-169). */
function playerHexNearest(state: CampaignState, to: readonly HexState[], day: ISODate, label: string): HexState | undefined {
  const mine = borderHexesOf(state.hexes, 'player').filter((h) => isClaimableKind(h))
  const pool = mine.length > 0 ? mine : state.hexes.filter((h) => h.owner === 'player' && h.ring > 0)
  const nearest = nearestTo(pool, to)
  if (nearest.length === 0) return undefined
  return hexOf(state, pick(state.campaign.seed, day, label, nearest.map((h) => h.id)))
}

/** A village the player conquered: its last transfer to the player was a conquest. */
function conqueredVillage(state: CampaignState, hex: HexState): boolean {
  if (hex.owner !== 'player' || !hex.village) return false
  let how: string | undefined
  for (const e of state.log) if (e.kind === 'hexTransfer' && e.hexId === hex.id && e.to === 'player') how = e.how
  return how === 'conquest'
}

/** Items the Merchant Caravan could offer: ones the Armory sells now, not a unique one already held. */
function caravanItems(state: CampaignState): string[] {
  const effects = realmEffects(state)
  return CODEX.items
    .filter((i) => {
      if (i.cost === null) return false
      const code = itemOffer(state, i.id, effects).reason?.code
      return code !== 'milestone' && code !== 'unique'
    })
    .map((i) => i.id)
}

type Criteria = (state: CampaignState, w: DeckWeek, params: Params, id: string) => boolean

/** The hidden criteria (Appendix C), by the codex's criteria id. */
const CRITERIA: Record<string, Criteria> = {
  incursionsLostToPlayer: (state, _w, p) => {
    const rival = p.rival as RivalId
    const lost = state.grandBattles.filter((b) => b.trigger === 'incursion' && b.rival === rival && b.result !== undefined && b.result !== 'defeat').length
    return state.rivals[rival].status === 'active' && lost >= num(p, 'count')
  },
  treasuryAtLeast: (state, _w, p) => state.rivals[p.rival as RivalId].status === 'active' && state.rivals[p.rival as RivalId].treasury >= num(p, 'amount'),
  fortificationLevelsAtLeast: (state, _w, p) =>
    state.rivals[p.rival as RivalId].status === 'active' && state.hexes.filter((h) => h.owner === p.rival).reduce((s, h) => s + h.fortification, 0) >= num(p, 'levels'),
  // Due from its scheduled week; one the deck held back that week fires at the next close (A-169).
  weekSchedule: (state, w, p, id) => {
    const next = w.week + 1
    if (next < num(p, 'firstWeek')) return false
    const due = Math.floor((next - num(p, 'firstWeek')) / num(p, 'everyWeeks')) + 1
    return eventsFired(state, id).length < due
  },
  firstFullWeekOfMonth: (_state, w, p) => firstFullWeekStartsAfter(w.day, num(p, 'month')),
  lairUnsealedFromWeek: (state, w, p) => w.week >= num(p, 'week') && lairMouth(state, p.lair as string)?.owner !== 'player',
  lairUnsealedFromWeekAtFullMoon: (state, w, p) => w.week >= num(p, 'week') && lairMouth(state, p.lair as string)?.owner !== 'player',
  weeksAfterRivalConquered: (state, w, p) =>
    state.log.some((e) => e.kind === 'rivalResolved' && e.how === 'conquered' && diffDays(e.day, w.day) >= num(p, 'weeks') * RULES.clock.daysPerWeek),
  playerHoldsClaimableShare: (state, _w, p) => {
    const claimable = state.hexes.filter((h) => isClaimableKind(h))
    return claimable.filter((h) => h.owner === 'player').length >= num(p, 'share') * claimable.length
  },
  conqueredVillageLoyaltyBelow: (state, _w, p) => Object.values(worldOf(state).lowLoyalty).some((weeks) => weeks >= num(p, 'weeks')),
  realmConsistencyStreak: (state, _w, p) => {
    const weeks = state.weight.weeks.slice(-num(p, 'weeks'))
    return weeks.length >= num(p, 'weeks') && weeks.every((x) => x.realmConsistency >= num(p, 'realmConsistency'))
  },
  seededInterval: (state, w, p) => caravanItems(state).length > 0 && chance(state.campaign.seed, w.day, 'event:merchantCaravan', 1 / num(p, 'aboutEveryWeeks')),
  allyAndRespectAtLeast: (state, _w, p) =>
    RIVAL_IDS.some((r) => state.rivals[r].status === 'allied') && RIVAL_IDS.some((r) => state.rivals[r].status === 'active' && state.rivals[r].respect >= num(p, 'respect')),
  rivalAtWarWithRival: (state, w, p) =>
    Object.values(state.fronts).some((f) => f.state === 'war' && f.rivals.every((r) => state.rivals[r].status === 'active')) &&
    chance(state.campaign.seed, w.day, 'event:envoys', num(p, 'aboutPerMonth') / RULES.grandBattles.monthWeeks)
}

/** What firing an event does; null when it finds nothing to act on (it then doesn't fire). */
type Fire = (state: CampaignState, w: DeckWeek, effect: Params) => { state: CampaignState; hold: EventHold } | null

const FIRE: Record<string, Fire> = {
  ugraksChallenge: (state, w, effect) => {
    const announcedOn = addDays(w.day, 1)
    const hex = playerHexNearest(state, state.hexes.filter((h) => h.owner === 'orc'), w.day, 'event:ugraksChallenge:pick')
    if (!hex) return null
    const enemy = rivalHost(state, 'orc', RULES.grandBattles.hostShare.rival, announcedOn, num(effect, 'companiesPerSide'))
    const done = announceGrandBattle(state, { trigger: 'event', eventId: 'ugraksChallenge', hexId: hex.id, announcedOn, rival: 'orc', enemy, limit: num(effect, 'companiesPerSide') }, w.emit)
    return done.ok && done.battle ? { state: done.state, hold: { from: announcedOn, until: done.battle.battleDate, rival: 'orc', battleId: done.battle.id } } : null
  },
  grandAuction: (state, w) => {
    const pool = state.hexes.filter((h) => h.owner === 'neutral' && h.village && isClaimableKind(h) && h.ring > RULES.land.protectedThroughRing)
    if (pool.length < 2) return null
    const first = pick(state.campaign.seed, w.day, 'event:grandAuction:pick', pool.map((h) => h.id))
    const second = pick(state.campaign.seed, w.day, 'event:grandAuction:pick2', pool.map((h) => h.id).filter((id) => id !== first))
    let next = state
    const until = addDays(w.day, RULES.worldAi.offerDays)
    const lots: { hexId: string; bids: Partial<Record<'player' | RivalId, number>> }[] = []
    for (const hexId of [first, second]) {
      const hex = hexOf(next, hexId) as HexState
      const bids: Partial<Record<'player' | RivalId, number>> = {}
      // Each active rival bids what it would bid to court the village (A-25), if its treasury above the reserve covers it.
      for (const r of RIVAL_IDS) {
        const rv = next.rivals[r]
        const bid = RULES.rivals.expansion.villageBidMult[r] * (hex.village?.loyalty ?? 0)
        if (rv.status !== 'active' || bid <= 0 || rv.treasury - RULES.rivals.reserve < bid) continue
        bids[r] = bid
        next = patchRival(next, r, { treasury: rv.treasury - bid })
      }
      lots.push({ hexId, bids })
    }
    next = withWorld(next, { auction: { until, lots } })
    return { state: next, hold: { from: addDays(w.day, 1), until, hexIds: [first, second] } }
  },
  deepCall: (_state, w, effect) => ({ state: _state, hold: { from: addDays(w.day, 1), until: weeksAfter(addDays(w.day, 1), num(effect, 'weeks')), rival: effect.rival as RivalId } }),
  beastSurge: (state, w, effect) => {
    const mult = num(effect, 'beastGarrisonMult')
    const dens = state.hexes.filter((h) => h.owner === 'neutral' && !h.village && !h.mythic && !h.rebels && isClaimableKind(h) && h.kind !== 'lairMouth')
    const ids = new Set(dens.map((h) => h.id))
    const next = { ...state, hexes: state.hexes.map((h) => (ids.has(h.id) ? { ...h, garrison: h.garrison * mult } : h)) }
    const from = addDays(w.day, 1)
    return { state: next, hold: { from, until: weeksAfter(from, num(effect, 'weeks')), hexIds: [...ids] } }
  },
  hungryWinter: (state, w, effect) => {
    const mult = num(effect, 'loyaltyMult')
    const next = { ...state, hexes: state.hexes.map((h) => (h.village ? { ...h, village: { ...h.village, loyalty: h.village.loyalty * mult } } : h)) }
    const from = addDays(w.day, 1)
    return { state: next, hold: { from, until: weeksAfter(from, num(effect, 'weeks')) } }
  },
  dragonWakes: (state, w) => {
    const mouth = lairMouth(state, 'wyrmfells')
    const hex = mouth ? playerHexNearest(state, [mouth], w.day, 'event:dragonWakes:pick') : undefined
    if (!hex) return null
    const announcedOn = addDays(w.day, 1)
    const done = announceGrandBattle(state, { trigger: 'event', eventId: 'dragonWakes', hexId: hex.id, announcedOn, quarry: 'dragon', enemy: mythicHost('dragon', w.week) }, w.emit)
    return done.ok && done.battle ? { state: done.state, hold: { from: announcedOn, until: done.battle.battleDate, battleId: done.battle.id } } : null
  },
  wildHunt: (state, w) => {
    const mouth = lairMouth(state, 'thornwild')
    const hex = mouth ? playerHexNearest(state, [mouth], w.day, 'event:wildHunt:pick') : undefined
    if (!hex) return null
    const announcedOn = addDays(w.day, 1)
    const moon = nextFullMoon(addDays(announcedOn, RULES.world.events.minBattleWarningDays))
    const done = announceGrandBattle(
      state,
      { trigger: 'event', eventId: 'wildHunt', hexId: hex.id, announcedOn, quarry: 'wildHunt', enemy: mythicHost('wildHunt', w.week), notBefore: moon },
      w.emit
    )
    return done.ok && done.battle ? { state: done.state, hold: { from: announcedOn, until: done.battle.battleDate, battleId: done.battle.id } } : null
  },
  pretender: (state, w, effect) => {
    const fallen = state.log.find((e) => e.kind === 'rivalResolved' && e.how === 'conquered')
    if (!fallen || fallen.kind !== 'rivalResolved') return null
    const rival = fallen.rival
    // Its old lands: the neutral hexes nearest its ruined capital, beyond the protected rings (A-169).
    const capital = capitals(state.hexes)[rival]
    const pool = state.hexes.filter((h) => h.owner === 'neutral' && isClaimableKind(h) && h.kind !== 'lairMouth' && h.ring > RULES.land.protectedThroughRing && !h.mythic && !h.rebels)
    if (pool.length === 0) return null
    const count = Math.min(num(effect, 'seizesNeutralHexes'), pool.length)
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const nearest = nearestTo(pool.filter((h) => !ids.includes(h.id)), [capital])
      ids.push(pick(state.campaign.seed, w.day, `event:pretender:pick:${i}`, nearest.map((h) => h.id)))
    }
    // The rebel host (40% of the fallen rival's last AV) holds the seized hexes, split evenly (A-169).
    const garrison = (num(effect, 'hostShareOfLastArmy') * baseArmyValue(state, rival)) / count
    const next = { ...state, hexes: state.hexes.map((h) => (ids.includes(h.id) ? { ...h, rebels: true, garrison: Math.max(h.garrison, garrison) } : h)) }
    return { state: next, hold: { from: addDays(w.day, 1), rival, hexIds: ids } }
  },
  fearOfTheCrown: (state, w, effect) => {
    const from = addDays(w.day, 1)
    return { state, hold: { from, until: weeksAfter(from, num(effect, 'weeks')) } }
  },
  villageUprising: (state, w, effect) => {
    const low = Object.entries(worldOf(state).lowLoyalty).filter(([id, weeks]) => weeks >= num(entry('villageUprising').criteria.params, 'weeks') && hexOf(state, id)?.owner === 'player')
    if (low.length === 0) return null
    const hexId = pick(state.campaign.seed, w.day, 'event:villageUprising:pick', low.map(([id]) => id))
    const until = addDays(w.day, RULES.worldAi.offerDays)
    const world = worldOf(state)
    const next = withWorld(state, { offers: [...world.offers, { kind: 'uprising', hexId, price: num(effect, 'keepCost'), until }] })
    return { state: next, hold: { from: addDays(w.day, 1), until, hexIds: [hexId] } }
  },
  wanderingOrder: (state, w, effect) => {
    const from = addDays(w.day, 1)
    return { state, hold: { from, until: weeksAfter(from, num(effect, 'weeks')) } }
  },
  merchantCaravan: (state, w, effect) => {
    const items = caravanItems(state)
    if (items.length === 0) return null
    const item = pick(state.campaign.seed, w.day, 'event:merchantCaravan:pick', items)
    const from = addDays(w.day, 1)
    return { state, hold: { from, until: addDays(from, num(effect, 'days') - 1), item } }
  },
  lostHeir: (state, w) => {
    const heirs = RIVAL_IDS.filter((r) => state.rivals[r].status === 'active' && state.rivals[r].respect >= num(entry('lostHeir').criteria.params, 'respect'))
    if (heirs.length === 0) return null
    return { state, hold: { from: addDays(w.day, 1), rival: heirs[0] } }
  },
  envoys: (state, w) => {
    const fronts = Object.values(state.fronts).filter((f) => f.state === 'war' && f.rivals.every((r) => state.rivals[r].status === 'active'))
    if (fronts.length === 0) return null
    const front = state.fronts[pick(state.campaign.seed, w.day, 'event:envoys:front', fronts.map((f) => f.front))]
    const asker = pick(state.campaign.seed, w.day, 'event:envoys:asker', front.rivals)
    const foe = front.rivals[0] === asker ? front.rivals[1] : front.rivals[0]
    const until = addDays(w.day, RULES.worldAi.offerDays)
    const world = worldOf(state)
    return { state: withWorld(state, { offers: [...world.offers, { kind: 'envoys', rival: asker, foe, until }] }), hold: { from: addDays(w.day, 1), until, rival: asker, other: foe } }
  }
}

/**
 * The order events are tried in: the dated world events first, so a busy week can't push them off
 * their week, then the deck's order. The Hungry Winter, tied to the calendar, comes before the
 * Beast Surge, which waits a week when they meet (A-169).
 */
function deckOrder(): string[] {
  const dated = ['hungryWinter', 'beastSurge']
  return [...dated, ...CODEX.events.map((e) => e.id).filter((id) => !dated.includes(id))]
}

/** Restores what a Beast Surge raised once it ends: dens still neutral go back to their garrison. */
function endSurges(state: CampaignState, day: ISODate): CampaignState {
  let next = state
  const worldEvents = state.worldEvents.map((ev) => {
    const hold = holdOf(ev)
    if (ev.id !== 'beastSurge' || !hold.until || hold.until > day || (hold as { restored?: boolean }).restored) return ev
    const mult = num(entry('beastSurge').effect, 'beastGarrisonMult')
    const ids = new Set(hold.hexIds ?? [])
    next = { ...next, hexes: next.hexes.map((h) => (ids.has(h.id) && h.owner === 'neutral' ? { ...h, garrison: h.garrison / mult } : h)) }
    return { ...ev, data: { ...hold, restored: true } }
  })
  return { ...next, worldEvents }
}

/** Week closes in a row each conquered village has stood under the Uprising's loyalty (for its criteria). */
function trackLoyalty(state: CampaignState): CampaignState {
  const limit = num(entry('villageUprising').criteria.params, 'loyalty')
  const was = worldOf(state).lowLoyalty
  const lowLoyalty: Record<string, number> = {}
  for (const h of state.hexes) {
    if (h.owner !== 'player' || h.ring <= RULES.land.protectedThroughRing || (h.village?.loyalty ?? limit) >= limit || !conqueredVillage(state, h)) continue
    lowLoyalty[h.id] = (was[h.id] ?? 0) + 1
  }
  return withWorld(state, { lowLoyalty })
}

/**
 * Settles what the world's open offers came to at this close: an unpaid Village Uprising rolls its
 * 30% (A-171), the Grand Auction's lots are awarded, and every other lapsed offer is dropped.
 */
function closeOffers(input: CampaignState, w: DeckWeek): CampaignState {
  let state = input
  const world = worldOf(state)
  const keep = world.offers.filter((o) => o.until > w.day)
  for (const o of world.offers) {
    if (o.until > w.day || o.kind !== 'uprising') continue
    const hex = hexOf(state, o.hexId)
    if (!hex || hex.owner !== 'player' || hex.ring <= RULES.land.protectedThroughRing) continue
    const rises = chance(state.campaign.seed, w.day, `uprising:${o.hexId}`, num(entry('villageUprising').effect, 'turnsNeutralChance'))
    w.emit('worldEvent', { eventId: 'villageUprising', hexIds: [o.hexId], outcome: rises ? 'neutral' : 'held' })
    if (!rises) continue
    const garrison = RULES.land.garrison.villageMilitia * base(hex.ring)
    state = replaceHex(state, { ...hex, owner: 'neutral', garrison, garrisonDamage: 0, fortification: 0, status: 'held', village: { loyalty: (hex.village?.loyalty ?? 0) } })
    w.emit('hexTransfer', { hexId: hex.id, from: 'player', to: 'neutral', how: 'event' })
  }
  state = withWorld(state, { offers: keep })

  const auction = worldOf(state).auction
  if (auction && auction.until <= w.day) {
    const effects = realmEffects(state)
    const playerTrust = trust(w.realmConsistency, effects.trust.value)
    for (const lot of auction.lots) {
      const hex = hexOf(state, lot.hexId)
      const offers = (Object.entries(lot.bids) as ['player' | RivalId, number][]).map(([who, bid]) => ({ who, bid, offer: roundPosting(bid * (who === 'player' ? playerTrust : RULES.influence.rivalTrust)) }))
      // The highest Offer wins; a tie goes to the player, then the usual rival order (A-141).
      const order = (who: string): number => (who === 'player' ? -1 : RIVAL_IDS.indexOf(who as RivalId))
      offers.sort((a, b) => b.offer - a.offer || order(a.who) - order(b.who))
      const winner = hex && hex.owner === 'neutral' ? offers[0] : undefined
      for (const o of offers) {
        if (o === winner) continue
        // Losing bids come back in full: an auction, not a courtship (A-171).
        if (o.who === 'player') state = { ...state, purse: post(state.purse, { date: w.day, kind: 'return', amount: o.bid, source: `auction:${lot.hexId}` }) }
        else state = patchRival(state, o.who, { treasury: state.rivals[o.who].treasury + o.bid })
      }
      if (!winner || !hex) continue
      if (winner.who === 'player') state = replaceHex(state, toPlayer(hex, w.day, false))
      else state = replaceHex(state, toRival(hex, winner.who))
      w.emit('hexTransfer', { hexId: hex.id, from: 'neutral', to: winner.who, how: 'influence' })
      w.emit('worldEvent', { eventId: 'grandAuction', hexIds: [hex.id], outcome: winner.who })
    }
    const rest = { ...worldOf(state) }
    delete rest.auction
    state = { ...state, world: rest }
  }
  return state
}

/**
 * The deck at a week close: ends lapsed effects, settles open offers, tracks the Uprising's
 * villages, then fires at most one new event whose hidden criteria hold.
 */
export function eventsWeek(input: CampaignState, w: DeckWeek): CampaignState {
  let state = trackLoyalty(closeOffers(endSurges(input, w.day), w))
  for (const id of deckOrder()) {
    const e = entry(id)
    if (!e.recurring && eventsFired(state, id).length > 0) continue
    if (e.recurring && eventsFired(state, id).some((ev) => holdOf(ev).until === undefined || (holdOf(ev).until as ISODate) > w.day)) continue
    const criteria = CRITERIA[e.criteria.id]
    if (!criteria || !criteria(state, w, e.criteria.params, id)) continue
    const fired = FIRE[id]?.(state, w, e.effect)
    if (!fired) continue
    state = { ...fired.state, worldEvents: [...fired.state.worldEvents, { id, firedOn: w.day, data: fired.hold }] }
    const h = fired.hold
    w.emit('worldEvent', {
      eventId: id,
      from: h.from,
      ...(h.until ? { until: h.until } : {}),
      ...(h.rival ? { rival: h.rival } : {}),
      ...(h.other ? { other: h.other } : {}),
      ...(h.hexIds ? { hexIds: h.hexIds } : {}),
      ...(h.item ? { item: h.item } : {})
    })
    break
  }
  return state
}

// ── Player actions on the world's offers ─────────────────────────────────────

export interface WorldAction {
  ok: boolean
  reason?: string
  state: CampaignState
  cost: number
}

function refused(state: CampaignState, reason: string): WorldAction {
  return { ok: false, reason, state, cost: 0 }
}

/** Keeps a rising village by paying its price before the week closes (the Village Uprising). */
export function keepVillage(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): WorldAction {
  if (!isPlayable(state)) return refused(state, 'campaignOver')
  const world = worldOf(state)
  const offer = world.offers.find((o) => o.kind === 'uprising' && o.hexId === hexId && today <= o.until)
  if (!offer || offer.kind !== 'uprising') return refused(state, 'noOffer')
  if (balance(state.purse) < offer.price) return refused(state, 'reputation')
  const events = new EventBuffer()
  events.emitter(today)('worldEvent', { eventId: 'villageUprising', hexIds: [hexId], outcome: 'kept' })
  const paid = { ...state, purse: spend(state.purse, today, offer.price, `uprising:${hexId}`) }
  return { ok: true, cost: offer.price, state: events.flush(withWorld(paid, { offers: world.offers.filter((o) => o !== offer) })) }
}

/** Lends a company to an envoy for today: it is away from today's battles; +10 Respect with the asker, −5 with its foe (Appendix C "Envoys"). */
export function lendToEnvoy(state: CampaignState, companyId: string, today: ISODate = openDayOf(state)): WorldAction {
  if (!isPlayable(state)) return refused(state, 'campaignOver')
  const world = worldOf(state)
  const offer = world.offers.find((o) => o.kind === 'envoys' && today <= o.until)
  if (!offer || offer.kind !== 'envoys') return refused(state, 'noOffer')
  if (!state.roster.some((c) => c.id === companyId)) return refused(state, 'unknownCompany')
  const effect = entry('envoys').effect
  const events = new EventBuffer()
  const emit = events.emitter(today)
  let next = withWorld(state, { offers: world.offers.filter((o) => o !== offer), lent: [...(world.lent ?? []), { companyId, day: today }] })
  next = adjustRespect(next, offer.rival, num(effect, 'askerRespect'), 'envoy', emit)
  next = adjustRespect(next, offer.foe, num(effect, 'foeRespect'), 'envoyFoe', emit)
  return { ok: true, cost: 0, state: events.flush(next) }
}

/** A sealed bid on a Grand Auction lot, held from the purse until the auction closes; a new bid replaces the old. */
export function auctionBid(state: CampaignState, hexId: string, bid: number, today: ISODate = openDayOf(state)): WorldAction {
  if (!isPlayable(state)) return refused(state, 'campaignOver')
  const world = worldOf(state)
  const auction = world.auction
  const lot = auction?.lots.find((l) => l.hexId === hexId)
  if (!auction || !lot || today > auction.until) return refused(state, 'noOffer')
  const amount = roundPosting(bid)
  if (!(amount > 0)) return refused(state, 'badBid')
  const earlier = lot.bids.player ?? 0
  if (balance(state.purse) + earlier < amount) return refused(state, 'reputation')
  let purse = state.purse
  if (earlier > 0) purse = post(purse, { date: today, kind: 'return', amount: earlier, source: `auction:${hexId}` })
  purse = spend(purse, today, amount, `auction:${hexId}`)
  const lots = auction.lots.map((l) => (l === lot ? { ...l, bids: { ...l.bids, player: amount } } : l))
  return { ok: true, cost: amount, state: withWorld({ ...state, purse }, { auction: { ...auction, lots } }) }
}

// ── Event battles (GRAND_HOOKS.event) ────────────────────────────────────────

/**
 * What an event's Grand Battle does (Appendix C; A-169): Ugrak's Challenge won, Orc Respect +30,
 * lost, 200 tribute; the Dragon won, the Dragon's Heart and 400, the Wild Hunt won, a Mythic Hunt's
 * 150; either lost, a Mythic Hunt's 5 × ring tribute and the hex scorched. No land is lost.
 */
export function eventBattleOutcome(input: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome } {
  let state = input
  const outcome: GrandOutcome = {}
  const hex = hexOf(state, battle.hexId) as HexState
  const effect = battle.eventId ? entry(battle.eventId).effect : {}
  const bonus = realmEffects(state).reputationBonus.value
  if (battle.eventId === 'ugraksChallenge') {
    if (ctx.won) {
      const before = state.rivals.orc.respect
      state = adjustRespect(state, 'orc', num(effect, 'winRespect'), 'challengeWon', ctx.emit)
      outcome.respect = state.rivals.orc.respect - before
    } else {
      const amount = num(effect, 'loseTribute')
      state = { ...state, purse: payTribute(state.purse, ctx.day, amount, `grandBattle:${battle.id}`) }
      outcome.tribute = amount
    }
    return { state, outcome }
  }
  if (ctx.won) {
    const reward = typeof effect.winReputation === 'number' ? effect.winReputation : RULES.grandBattles.outcomes.mythicHuntWin.reputation
    const amount = withBonus(reward, bonus)
    state = postSpoils(state, ctx.day, amount, `grandBattle:${battle.id}`)
    outcome.reputation = roundPosting(amount)
    const item = typeof effect.winItem === 'string' ? effect.winItem : undefined
    if (item && !heldItems(state).includes(item)) {
      const armory = state.armory ?? { wings: [], elites: [], stash: [] }
      state = { ...state, armory: { ...armory, stash: [...armory.stash, item] } }
      outcome.trophy = item
      ctx.emit('trophy', { hexId: hex.id, source: 'mythicHunt', item })
    }
  } else {
    const paid = postTribute(state, ctx.day, RULES.grandBattles.outcomes.mythicHuntLoss.tributePerRing, hex, `grandBattle:${battle.id}`)
    state = replaceHex(paid.state, scorch(hexOf(paid.state, hex.id) as HexState, ctx.day))
    outcome.tribute = paid.amount
    outcome.hexScorched = hex.id
  }
  return { state, outcome }
}

// ── The Scrying Pool (gap 7) ─────────────────────────────────────────────────

/** The first day of the first week lying wholly in December, on or after `day` (the Hungry Winter's week). */
function nextFirstFullWeek(state: CampaignState, day: ISODate, month: number): ISODate {
  const year = Number(day.split('-')[0])
  for (const y of [year, year + 1]) {
    const first = `${y}-${String(month).padStart(2, '0')}-01` // rules-ok: an ISO date's month digits
    const offset = (state.campaign.weekStartsOn - weekdayOf(first) + RULES.clock.daysPerWeek) % RULES.clock.daysPerWeek
    const start = addDays(first, offset)
    if (start >= day) return start
  }
  return day
}

/**
 * The Scrying Pool's hint for the month `today` falls in (A-157): the next dated world event (the
 * Beast Surge or the Hungry Winter) and the campaign week it comes in. It names the event, never its
 * criteria; one a month; null without the Pool.
 */
export function eventHint(state: CampaignState, today: ISODate = openDayOf(state)): { eventId: string; week: number } | null {
  if (realmEffects(state).eventHints.value <= 0) return null
  const month = monthOf(state, today) * RULES.grandBattles.monthWeeks + 1
  const surge = entry('beastSurge').criteria.params
  const nextSurge = num(surge, 'firstWeek') + eventsFired(state, 'beastSurge').length * num(surge, 'everyWeeks')
  const hints = [{ eventId: 'beastSurge', week: Math.max(month, nextSurge) }]
  if (eventsFired(state, 'hungryWinter').length === 0) {
    const monthStart = addDays(weekOf(state.campaign.startDate, state.campaign.weekStartsOn), (month - 1) * RULES.clock.daysPerWeek)
    const winter = nextFirstFullWeek(state, monthStart, num(entry('hungryWinter').criteria.params, 'month'))
    hints.push({ eventId: 'hungryWinter', week: campaignWeek(state.campaign.startDate, winter, state.campaign.weekStartsOn) })
  }
  return hints.sort((a, b) => a.week - b.week)[0]
}

// ── Hooks the deck installs ──────────────────────────────────────────────────

/** The Beast Surge: beasts are 60% of daily threats; the other kinds keep their shares of the rest. */
const surgeMix = COMBAT_HOOKS.threatMix
COMBAT_HOOKS.threatMix = (state, date, mix) => {
  const base = surgeMix(state, date, mix)
  if (!eventInForce(state, 'beastSurge', date)) return base
  const share = num(entry('beastSurge').effect, 'beastThreatShare')
  const rest = base.mythic + base.raid
  const out: ThreatMix = { beasts: share, mythic: rest > 0 ? ((1 - share) * base.mythic) / rest : 0, raid: rest > 0 ? ((1 - share) * base.raid) / rest : 0 }
  return out
}

/** The Deep Call: the Dwarf's conquest attempts reach hexes two away from its land. */
const reach = COMBAT_HOOKS.conquestReach
COMBAT_HOOKS.conquestReach = (state, rival, date) => {
  const call = eventInForce(state, 'deepCall', date)
  return call && call.data.rival === rival ? num(entry('deepCall').effect, 'conquestReachHexes') : reach(state, rival, date)
}

/** Fear of the Crown: every rival spends 10% more on its army at each of the 6 week closes it holds. */
const armyShare = RIVAL_HOOKS.armyShare
RIVAL_HOOKS.armyShare = (state, rival, day, share) => {
  const base = armyShare(state, rival, day, share)
  return eventInForce(state, 'fearOfTheCrown', day) ? base * num(entry('fearOfTheCrown').effect, 'rivalArmySpendMult') : base
}

GRAND_HOOKS.event = eventBattleOutcome

