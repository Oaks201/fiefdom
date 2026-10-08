/**
 * The living world and the endgame (Ch 13, Ch 14; D-01; A-34, A-167 to A-178): resolving rivals
 * (conquest, defection, Accord) under Ch 14's pacing, coalitions, the event deck (world/events.ts),
 * Ascendancy, the Ultimatum and the Siege of the Crown, victory and the Reign, and the Chronicle
 * record.
 *
 * - **The `world` week phase** (`worldWeek`): held resolutions and defections; coalitions' war
 *   chests, ends and triggers; the event deck; Ascendancy and Ultimatums.
 * - **Accords** (`accordGate`, `sealAccord`): Respect 60 (50 after the Lost Heir), Castle III, the
 *   rival active and in no coalition, the contract slot free. `accordPaid` adds D-01's Respect on
 *   the day the Accord is paid (settlement's `contractEnd`), from the Respect recorded when it was
 *   sealed; at 100 it is signed and the rival is allied.
 * - **Outcome hooks** for the Capital, the Coalition Offensive and the Siege are installed into
 *   `GRAND_HOOKS` when this module loads; settlement imports it.
 * - **Views** for the screens: `coalitionView`, `ultimatumView`, `accordView`, `chronicleRecord`.
 *   None shows a hidden number: the bend-the-knee price is 25% of a treasury *estimate* (A-172).
 *
 * Pure and deterministic: draws use the week close's date with the labels `betrayal:<rival>`,
 * `offensive:target`, `goblinOffer:<rival>` and those in world/events.ts.
 */
import { CODEX } from './codex'
import { addDays, diffDays } from './clock'
import { sealContract } from './contractActions'
import { accordRespectGain, payoutCurve, type AccordPaid } from './contracts'
import { balance, post, roundPosting, spend } from './economy'
import { realmEffects } from './effects'
import { GRAND_HOOKS, announceGrandBattle, firstFreeDay, pendingBattles, siegeNotBefore, type OutcomeContext } from './grand'
import { defectionTally, sellPrice } from './land'
import { borderHexesOf, capitals, hexDistance, hexIndex, isClaimableKind, touches } from './map'
import { RULES, base } from './rules'
import { chance, pick } from './rng'
import { holdings, playerPower, rivalIncome, rivalPower, sharedBorder, threatOf, treasuryBand } from './rivals'
import { refreshRoster } from './roster'
import {
  EventBuffer,
  adjustRespect,
  hexOf,
  inCoalition,
  isPlayable,
  openDayOf,
  patchRival,
  replaceHex,
  resolutionAllowed,
  resolutionsOf,
  scaleArmy,
  toPlayer,
  toRival,
  withWorld,
  worldOf
} from './state'
import { RIVAL_IDS, type CampaignState, type Coalition, type Emit, type GrandBattle, type GrandOutcome, type HexState, type ISODate, type RivalId, type RivalState } from './types'
import { eventInForce, eventsWeek } from './world/events'

export { auctionBid, eventHint, eventInForce, keepVillage, lendToEnvoy, nextFullMoon, type WorldAction } from './world/events'

const C = RULES.world.coalitions
const DAYS = RULES.clock.daysPerWeek

export type ResolveHow = 'conquered' | 'abdicated' | 'allied'

function active(state: CampaignState): RivalId[] {
  return RIVAL_IDS.filter((r) => state.rivals[r].status === 'active')
}

// ── Resolving rivals (Ch 14) ─────────────────────────────────────────────────

/**
 * Resolves `rival` now if Ch 14's pacing allows it on `day`, or holds it until the first week
 * close that does (A-168). A held defection is checked again before it resolves.
 */
export function resolveRival(state: CampaignState, rival: RivalId, how: ResolveHow, day: ISODate, emit: Emit): CampaignState {
  if (state.rivals[rival].status !== 'active') return state
  const world = worldOf(state)
  if (!resolutionAllowed(state, day)) {
    if (world.pending.some((p) => p.rival === rival)) return state
    return withWorld(state, { pending: [...world.pending, { rival, how, since: day }] })
  }
  return applyResolution(withWorld(state, { pending: world.pending.filter((p) => p.rival !== rival) }), rival, how, day, emit)
}

/** What a fall does (Ch 13 "When a rival falls"), then victory if it was the last. */
function applyResolution(input: CampaignState, rival: RivalId, how: ResolveHow, day: ISODate, emit: Emit): CampaignState {
  let state = input
  if (how === 'conquered') {
    // Its capital and realm become ruins; its other hexes turn neutral with village loyalty halved.
    const capital = capitals(state.hexes)[rival]
    state = {
      ...state,
      hexes: state.hexes.map((h) => {
        if (h.owner !== rival) return h
        emit('hexTransfer', { hexId: h.id, from: rival, to: 'neutral', how: 'event' })
        if (h.id === capital || h.kind === 'realm' || h.kind === 'capital') return { ...h, owner: 'neutral', garrison: 0, garrisonDamage: 0, fortification: 0, ruins: true }
        const garrison = h.ring >= 1 && h.ring <= RULES.land.claimableRings.max ? base(h.ring) * (h.village ? RULES.land.garrison.villageMilitia : RULES.land.garrison.beasts) : 0
        const out: HexState = { ...h, owner: 'neutral', garrison, garrisonDamage: 0, fortification: 0 }
        if (h.village) out.village = { loyalty: h.village.loyalty * RULES.world.fallout.conqueredLoyaltyMult }
        return out
      })
    }
  } else if (how === 'abdicated') {
    // Its remaining land passes to the player; an active Goblin offers to buy one of those hexes. The
    // Rim stays put (Ch 3 rule 6): its capital and realm stay its own, out of play (A-175).
    const passed = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h))
    const ids = new Set(passed.map((h) => h.id))
    state = { ...state, hexes: state.hexes.map((h) => (ids.has(h.id) ? toPlayer(h, day, false) : h)) }
    for (const h of passed) emit('hexTransfer', { hexId: h.id, from: rival, to: 'player', how: 'abdication' })
    const sellable = passed.filter((h) => h.kind !== 'gate' && h.kind !== 'lairMouth' && h.ring >= RULES.trade.sellMinRing)
    if (rival !== 'goblin' && state.rivals.goblin.status === 'active' && sellable.length > 0) {
      const hexId = pick(state.campaign.seed, day, `goblinOffer:${rival}`, sellable.map((h) => h.id))
      const price = sellPrice('goblin', hexOf(state, hexId) as HexState)
      const world = worldOf(state)
      state = withWorld(state, { offers: [...world.offers, { kind: 'goblinBuys', hexId, price, until: addDays(day, RULES.worldAi.offerDays) }] })
    }
  }
  state = patchRival(state, rival, { status: how, ascendancyStreak: 0, resolvedOn: day })
  const r = { ...state.rivals[rival] }
  delete r.ultimatumUntil
  state = { ...state, rivals: { ...state.rivals, [rival]: r } }
  emit('rivalResolved', { rival, how })

  // Its battles, attempts and bids end with it; so does any coalition it stood in.
  for (const b of pendingBattles(state)) {
    if (b.setup || !(b.rival === rival || b.members?.includes(rival))) continue
    emit('grandBattle', { battleId: b.id, trigger: b.trigger, hexId: b.hexId, stage: 'cancelled', rival })
    state = { ...state, grandBattles: state.grandBattles.filter((x) => x.id !== b.id) }
  }
  if (state.combat) {
    state = {
      ...state,
      combat: {
        ...state.combat,
        conquests: state.combat.conquests.filter((c) => c.rival !== rival),
        contested: state.combat.contested.filter((c) => c.rival !== rival)
      },
      hexes: state.hexes.map((h) => (h.status === 'contested' && state.combat?.contested.some((c) => c.hexId === h.id && c.rival === rival) ? { ...h, status: 'held' as const } : h))
    }
  }
  state = { ...state, courtships: state.courtships.map((c) => (c.rivalBids[rival] !== undefined ? { ...c, rivalBids: Object.fromEntries(Object.entries(c.rivalBids).filter(([k]) => k !== rival)) } : c)) }
  state = endCoalitionsOf(state, rival, day, 'resolved', emit)
  state = refreshRoster(state)

  // Victory: every rival resolved. The castle becomes the High Throne, and the Reign goes on (Ch 14).
  if (active(state).length === 0 && state.campaign.status === 'active') {
    state = { ...state, castleTier: RULES.castle.banners.length as CampaignState['castleTier'], campaign: { ...state.campaign, status: 'won' } }
    emit('campaignEnd', { outcome: 'won' })
    state = refreshRoster(state)
  }
  return state
}

/** Defection (Ch 14): the rival holds no village, and at least half of its original villages were won by influence or trade. */
export function defects(state: CampaignState, rival: RivalId): boolean {
  if (state.rivals[rival].status !== 'active') return false
  const tally = defectionTally(state, rival)
  return tally.holds === 0 && (tally.won.influence + tally.won.trade) * 2 >= tally.original.length
}

/** Held resolutions whose time has come, then defections (the `world` phase). */
function resolutionsWeek(input: CampaignState, day: ISODate, emit: Emit): CampaignState {
  let state = input
  for (const p of worldOf(state).pending) {
    if (!resolutionAllowed(state, day)) break
    if (p.how === 'abdicated' && !defects(state, p.rival)) {
      state = withWorld(state, { pending: worldOf(state).pending.filter((x) => x !== p) })
      continue
    }
    state = resolveRival(state, p.rival, p.how, day, emit)
  }
  for (const rival of active(state)) if (defects(state, rival)) state = resolveRival(state, rival, 'abdicated', day, emit)
  return state
}

/** The player accepts the Goblin's offer for a hex that came by abdication (Ch 13): sold at its sale price, +5 Respect. */
export function acceptGoblinOffer(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): { ok: boolean; reason?: string; state: CampaignState; cost: number } {
  const world = worldOf(state)
  const offer = world.offers.find((o) => o.kind === 'goblinBuys' && o.hexId === hexId && today <= o.until)
  const hex = hexOf(state, hexId)
  if (!isPlayable(state)) return { ok: false, reason: 'campaignOver', state, cost: 0 }
  if (!offer || offer.kind !== 'goblinBuys' || !hex || hex.owner !== 'player' || state.rivals.goblin.status !== 'active') return { ok: false, reason: 'noOffer', state, cost: 0 }
  const events = new EventBuffer()
  const emit = events.emitter(today)
  let next: CampaignState = { ...state, purse: post(state.purse, { date: today, kind: 'earn', amount: offer.price, source: `goblinOffer:${hexId}` }) }
  next = replaceHex(next, toRival(hex, 'goblin'))
  emit('hexTransfer', { hexId, from: 'player', to: 'goblin', how: 'trade' })
  next = adjustRespect(next, 'goblin', RULES.respect.change.hexSold, 'hexSold', emit)
  next = withWorld(next, { offers: world.offers.filter((o) => o !== offer) })
  return { ok: true, state: events.flush(next), cost: -offer.price }
}

// ── Accords (Ch 14, D-01) ────────────────────────────────────────────────────

export type AccordRefusal = 'campaignOver' | 'rivalResolved' | 'respect' | 'castle' | 'coalition' | 'contractRunning'

export interface AccordGate {
  ok: boolean
  reason?: AccordRefusal
  /** The Respect it needs: 60, or 50 after the Lost Heir names this rival. */
  threshold: number
  respect: number
}

/** The Respect an Accord with `rival` opens at (Ch 12: 60; the Lost Heir: 50). */
export function accordThreshold(state: CampaignState, rival: RivalId, day: ISODate): number {
  const heir = eventInForce(state, 'lostHeir', day)
  const opens = CODEX.events.find((e) => e.id === 'lostHeir')?.effect.accordOpensAtRespect
  return heir && heir.data.rival === rival && typeof opens === 'number' ? opens : RULES.respect.thresholds.accordTalks
}

/** Whether an Accord with `rival` may be sealed today (Ch 14), and why not. */
export function accordGate(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): AccordGate {
  const threshold = accordThreshold(state, rival, today)
  const respect = state.rivals[rival].respect
  const no = (reason: AccordRefusal): AccordGate => ({ ok: false, reason, threshold, respect })
  if (!isPlayable(state)) return no('campaignOver')
  if (state.rivals[rival].status !== 'active') return no('rivalResolved')
  if (state.castleTier < RULES.contracts.accord.castleTier) return no('castle')
  if (inCoalition(state, rival, today)) return no('coalition')
  if (state.contracts.active || state.contracts.queued) return no('contractRunning')
  if (respect < threshold) return no('respect')
  return { ok: true, threshold, respect }
}

/**
 * Seals a 30-day Accord with `rival` (Ch 14, D-01): it takes the contract slot, is scored like any
 * contract, and records the rival's Respect now for its end.
 */
export function sealAccord(state: CampaignState, rival: RivalId, req: { id: string; pledge?: number }, today: ISODate = openDayOf(state)): { ok: boolean; reason?: string; state: CampaignState } {
  const gate = accordGate(state, rival, today)
  if (!gate.ok) return { ok: false, reason: gate.reason, state }
  const sealed = sealContract(state, { id: req.id, termDays: RULES.contracts.accord.days, pledge: req.pledge ?? 0, kind: 'accord', rival }, today)
  return sealed.ok ? { ok: true, state: sealed.state } : { ok: false, reason: sealed.reason, state }
}

/** D-01's Respect gain for an Accord at score curve f(Q), from the Respect recorded at its seal. */
export function accordGain(state: CampaignState, rival: RivalId, curve: number, respectAtStart: number = state.rivals[rival].respect): number {
  return accordRespectGain(curve, respectAtStart)
}

/**
 * An Accord was paid today (settlement's `contractEnd`): its Respect, 50 × f(Q) (60 × f(Q) from 75),
 * added at once; at 100 the Accord is signed and the rival allied, as the pacing allows (D-01).
 */
export function accordPaid(input: CampaignState, accord: AccordPaid, day: ISODate, emit: Emit): CampaignState {
  const contract = [...input.contracts.history, ...(input.contracts.active ? [input.contracts.active] : [])].find((c) => c.id === accord.contractId)
  const gain = accordGain(input, accord.rival, accord.curve, contract?.respectAtStart)
  let state = adjustRespect(input, accord.rival, gain, 'accord', emit)
  if (state.rivals[accord.rival].respect >= RULES.contracts.accord.signedAtRespect) state = resolveRival(state, accord.rival, 'allied', day, emit)
  return state
}

// ── Coalitions (Ch 13) ───────────────────────────────────────────────────────

/** Coalitions standing on `day`. */
export function standingCoalitions(state: CampaignState, day: ISODate): Coalition[] {
  return state.coalitions.filter((c) => c.until === undefined || day <= c.until)
}

/** Ends a coalition on `day` and posts it, once. One a buy-out already broke (and posted) is only marked over. */
function endCoalition(state: CampaignState, c: Coalition, day: ISODate, broken: Coalition['broken'], emit: Emit): CampaignState {
  if (c.broken === 'buyout') return { ...state, coalitions: state.coalitions.map((x) => (x === c ? { ...x, over: true } : x)) }
  const stage = broken === undefined || broken === 'resolved' || broken === 'replaced' ? 'ended' : 'broken'
  emit('coalition', { members: [...c.members], trigger: c.trigger, stage })
  return { ...state, coalitions: state.coalitions.map((x) => (x === c ? { ...x, until: day, broken, over: true } : x)) }
}

function endCoalitionsOf(state: CampaignState, rival: RivalId, day: ISODate, broken: Coalition['broken'], emit: Emit): CampaignState {
  let next = state
  for (const c of standingCoalitions(state, day)) if (c.members.includes(rival) && !c.over) next = endCoalition(next, c, day, broken, emit)
  return next
}

/** How long a coalition lasts (Ch 13), shortened by 2 weeks at Grace III; the Last Alliance until a member is resolved. */
function coalitionUntil(state: CampaignState, trigger: Coalition['trigger'], day: ISODate): ISODate | undefined {
  const weeks = trigger === 'firstFall' ? C.firstFallWeeks : trigger === 'risingCrown' ? C.risingCrown.weeks : undefined
  if (weeks === undefined) return undefined
  const shorten = state.weight.grace >= RULES.grace.thresholds.length ? C.graceIIIShortenWeeks : 0
  return addDays(day, (weeks - shorten) * DAYS)
}

/** Forms a coalition (Ch 13): its members at War with the player now; any other standing coalition ends (three never ally at once). */
function formCoalition(input: CampaignState, members: [RivalId, RivalId], trigger: Coalition['trigger'], day: ISODate, emit: Emit, watcher?: RivalId): CampaignState {
  let state = input
  for (const c of standingCoalitions(state, day)) if (!c.over) state = endCoalition(state, c, day, 'replaced', emit)
  const until = coalitionUntil(state, trigger, day)
  const coalition: Coalition = { members: [...members], trigger, warChest: 0, formedOn: day, ...(until ? { until } : {}), ...(watcher ? { watcher } : {}) }
  state = { ...state, coalitions: [...state.coalitions, coalition] }
  emit('coalition', { members: [...members], trigger, stage: 'formed' })
  for (const r of members) {
    const rv = state.rivals[r]
    if (rv.disposition.player !== 'war') emit('disposition', { rival: r, from: rv.disposition.player, to: 'war' })
    state = patchRival(state, r, { disposition: { ...rv.disposition, player: 'war' } })
  }
  return state
}

/** The between-land where the player holds the most Dominion (A-34), ties in the usual order. */
function strongestDirection(state: CampaignState): keyof CampaignState['fronts'] {
  let best: keyof CampaignState['fronts'] = 'north'
  let most = -1
  for (const land of Object.keys(state.fronts) as (keyof CampaignState['fronts'])[]) {
    const held = state.hexes.filter((h) => h.owner === 'player' && h.land === land && isClaimableKind(h)).reduce((s, h) => s + h.ring, 0)
    if (held > most) (best = land), (most = held)
  }
  return best
}

/** The player's border hex nearest both members' lands (the Coalition Offensive's target), ties drawn. */
function offensiveTarget(state: CampaignState, members: readonly RivalId[], day: ISODate): string | undefined {
  const border = borderHexesOf(state.hexes, 'player').filter((h) => isClaimableKind(h))
  if (border.length === 0) return undefined
  const lands = members.map((m) => state.hexes.filter((h) => h.owner === m))
  const distance = (h: HexState): number => lands.reduce((s, land) => s + Math.min(Number.POSITIVE_INFINITY, ...land.map((x) => hexDistance(x.id, h.id))), 0)
  const least = Math.min(...border.map(distance))
  return pick(state.campaign.seed, day, 'offensive:target', border.filter((h) => distance(h) === least).map((h) => h.id))
}

/**
 * Coalitions at a week close (Ch 13): each member's 10% of the week's income into the war chest;
 * ends; the Offensive (announced at the first close after forming, within 14 days); a Goblin
 * member's mercenaries every 4 weeks; betrayal; then the three triggers.
 */
function coalitionsWeek(input: CampaignState, w: { day: ISODate; week: number; days: number; emit: Emit }): CampaignState {
  let state = input
  const day = w.day
  // The war chest: 10% of each member's income this week moves from its treasury.
  const chests = state.coalitions.map((c) => {
    if (c.over || c.formedOn === undefined || c.formedOn >= day || (c.until !== undefined && c.until < day)) return c
    let chest = c.warChest
    for (const m of c.members) {
      if (state.rivals[m].status !== 'active') continue
      const share = Math.min(state.rivals[m].treasury, C.warChestShare * rivalIncome(state, m, w.week, w.days))
      state = patchRival(state, m, { treasury: state.rivals[m].treasury - share })
      chest += share
    }
    return { ...c, warChest: chest }
  })
  state = { ...state, coalitions: chests }
  // Coalitions whose time is up end.
  for (const c of state.coalitions) if (!c.over && c.until !== undefined && c.until <= day) state = endCoalition(state, c, c.until, undefined, w.emit)

  for (const c of standingCoalitions(state, addDays(day, 1))) {
    if (c.over || c.formedOn === undefined || c.formedOn >= day) continue
    let coalition = c
    // The Coalition Offensive, funded by the chest (A-173).
    if (!coalition.offensive && diffDays(coalition.formedOn as ISODate, day) <= C.offensiveWithinDays) {
      const target = offensiveTarget(state, coalition.members, day)
      if (target) {
        const done = announceGrandBattle(state, { trigger: 'coalitionOffensive', hexId: target, announcedOn: addDays(day, 1), members: coalition.members }, w.emit)
        if (done.ok && done.battle) {
          state = done.state
          coalition = { ...coalition, offensive: done.battle.id, warChest: 0 }
        }
      }
    }
    // A Goblin member hires mercenaries for its partner every 4 weeks (A-173: free, from the chest's purpose).
    if (coalition.members.includes('goblin')) {
      const partner = coalition.members.find((m) => m !== 'goblin') as RivalId
      const due = coalition.mercenaryWeek === undefined || w.week - coalition.mercenaryWeek >= C.goblinMercenariesEveryWeeks
      if (due && state.rivals[partner].status === 'active') {
        state = patchRival(state, partner, { ai: { ...state.rivals[partner].ai, mercenariesUntil: addDays(day, RULES.rivals.special.goblinMercenaries.weeks * DAYS) } })
        w.emit('rivalNews', { rival: 'goblin', news: 'mercenaries', other: partner })
        coalition = { ...coalition, mercenaryWeek: w.week }
      }
    }
    state = { ...state, coalitions: state.coalitions.map((x) => (x === c ? coalition : x)) }
    // Betrayal: a member at Respect 50 or more may walk away (15% a week, seeded).
    const traitor = coalition.members.find((m) => state.rivals[m].respect >= C.betrayal.minRespect && chance(state.campaign.seed, day, `betrayal:${m}`, C.betrayal.chance))
    if (traitor) state = endCoalition(state, coalition, day, 'betrayal', w.emit)
  }

  // The triggers.
  const world = worldOf(state)
  const resolved = RIVAL_IDS.length - active(state).length
  const open = active(state)
  if (resolved > world.resolvedSeen && w.week >= C.notBeforeWeek) {
    if (world.resolvedSeen === 0 && open.length >= 2) {
      const ranked = [...open].sort((a, b) => threatOf(state, b, day) - threatOf(state, a, day) || RIVAL_IDS.indexOf(a) - RIVAL_IDS.indexOf(b))
      state = formCoalition(state, [ranked[0], ranked[1]], 'firstFall', day, w.emit, ranked[2])
    } else if (resolved === 2 && open.length === 2) {
      const refuses = open.some((r) => state.rivals[r].respect >= C.lastAllianceRefusalRespect)
      if (!refuses) state = formCoalition(state, [open[0], open[1]], 'lastAlliance', day, w.emit)
    }
  }
  // The Rising Crown's 3 weeks count only while no coalition stands, so one never re-forms the day the last ends (A-174).
  let rising = worldOf(state).risingStreak
  const standing = standingCoalitions(state, addDays(day, 1)).some((c) => !c.over)
  if (resolved === 0 && open.length > 0 && !standing) {
    const average = open.reduce((s, r) => s + rivalPower(state, r, addDays(day, 1)), 0) / open.length
    rising = playerPower(state) >= C.risingCrown.powerRatio * average ? rising + 1 : 0
    if (rising >= C.risingCrown.streakWeeks && w.week >= C.notBeforeWeek) {
      const [a, b] = state.fronts[strongestDirection(state)].rivals
      if (state.rivals[a].status === 'active' && state.rivals[b].status === 'active') {
        state = formCoalition(state, [a, b], 'risingCrown', day, w.emit)
        rising = 0
      }
    }
  } else rising = 0
  return withWorld(state, { resolvedSeen: Math.max(resolved, worldOf(state).resolvedSeen), risingStreak: rising })
}

/** The Coalition Offensive's outcome (Ch 11): won, 40 × ring and the coalition ends 2 weeks early; lost, the outermost border hex passes to the nearer member. */
function offensiveOutcome(input: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome } {
  let state = input
  const outcome: GrandOutcome = {}
  const members = battle.members ?? []
  const coalition = state.coalitions.find((c) => c.offensive === battle.id)
  if (ctx.won) {
    const paid = defaultOffensive(state, battle, ctx)
    state = paid.state
    Object.assign(outcome, paid.outcome)
    if (coalition && !coalition.over) {
      const early = coalition.until ? addDays(coalition.until, -RULES.grandBattles.outcomes.coalitionWin.endsEarlyWeeks * DAYS) : ctx.day
      const until = early < ctx.day ? ctx.day : early
      if (until <= ctx.day) state = endCoalition(state, coalition, ctx.day, 'offensive', ctx.emit)
      else state = { ...state, coalitions: state.coalitions.map((c) => (c === coalition ? { ...c, until } : c)) }
    }
    return { state, outcome }
  }
  // The player's outermost hex on that border (ring 3 or beyond) passes to the nearer member (A-173).
  const byId = hexIndex(state.hexes)
  const border = state.hexes.filter((h) => h.owner === 'player' && h.ring > RULES.land.protectedThroughRing && isClaimableKind(h) && members.some((m) => touches(byId, h.id, m)))
  if (border.length === 0) return { state, outcome }
  const outer = Math.max(...border.map((h) => h.ring))
  const hex = border.filter((h) => h.ring === outer).sort((a, b) => a.id.localeCompare(b.id))[0]
  const nearest = (m: RivalId): number => Math.min(Number.POSITIVE_INFINITY, ...state.hexes.filter((h) => h.owner === m).map((h) => hexDistance(h.id, hex.id)))
  const to = [...members].sort((a, b) => nearest(a) - nearest(b) || RIVAL_IDS.indexOf(a) - RIVAL_IDS.indexOf(b))[0]
  ctx.emit('hexTransfer', { hexId: hex.id, from: 'player', to, how: 'conquest' })
  state = replaceHex(state, toRival(hex, to))
  outcome.hexLost = hex.id
  return { state, outcome }
}

const defaultOffensive = GRAND_HOOKS.coalitionOffensive

// ── Ascendancy, the Ultimatum and the Siege (Ch 14) ──────────────────────────

/** A group Ascendancy tests, and the war chest it holds (a coalition's), which counts as treasury (A-154, A-173). */
interface AscendancyUnit {
  members: RivalId[]
  chest: number
}

/** The groups Ascendancy tests: a standing coalition's members together, every other active rival alone. */
function ascendancyUnits(state: CampaignState, day: ISODate): AscendancyUnit[] {
  const together = standingCoalitions(state, day).filter((c) => !c.over && c.members.every((m) => state.rivals[m].status === 'active'))
  const grouped = new Set(together.flatMap((c) => c.members))
  return [...together.map((c) => ({ members: [...c.members], chest: c.warChest })), ...active(state).filter((r) => !grouped.has(r)).map((r) => ({ members: [r], chest: 0 }))]
}

/** A group's Power over the player's (Ch 14 rule 1). Hidden: screens never read it. */
function ratioOf(state: CampaignState, unit: AscendancyUnit, day: ISODate): number {
  const mine = playerPower(state)
  const theirs = unit.members.reduce((s, r) => s + rivalPower(state, r, day), 0) + RULES.defeat.power.treasury * unit.chest
  return mine > 0 ? theirs / mine : Number.POSITIVE_INFINITY
}

function siegeOf(state: CampaignState, rival: RivalId): GrandBattle | undefined {
  return pendingBattles(state).find((b) => b.trigger === 'siege' && (b.rival === rival || b.members?.includes(rival)))
}

/**
 * Ascendancy at a week close (Ch 14): the Herald's warning from week 32 on crossing 1.3×; from
 * week 36 (44 at Grace III) the streak at 1.5× (1.6× at Grace I+), and 4 closes in a row start a
 * 14-day Ultimatum with the Siege announced; an Ultimatum lifts when the ratio falls below 1.3×.
 */
function ascendancyWeek(input: CampaignState, w: { day: ISODate; week: number; emit: Emit }): CampaignState {
  let state = input
  const a = RULES.defeat.ascendancy
  const grace = state.weight.grace
  const fromWeek = grace >= RULES.grace.thresholds.length ? a.fromWeekGraceIII : a.fromWeek
  const needed = grace >= RULES.grace.reclaim.level ? a.powerRatioGraceI : a.powerRatio
  const date = addDays(w.day, 1)
  let warned = [...worldOf(state).warned]
  for (const unit of ascendancyUnits(state, date)) {
    const members = unit.members
    const lead = members[0]
    const ratio = ratioOf(state, unit, date)
    const group = members.length > 1 ? { members: [...members] } : {}
    if (w.week >= RULES.defeat.warning.fromWeek) {
      if (ratio > RULES.defeat.warning.powerRatio && !warned.includes(lead)) {
        warned.push(lead)
        w.emit('ascendancy', { rival: lead, stage: 'warning', ...group })
      } else if (ratio <= RULES.defeat.warning.powerRatio) warned = warned.filter((r) => r !== lead)
    }
    const siege = siegeOf(state, lead)
    if (siege && !siege.setup && ratio < a.liftBelowRatio) {
      // The Ultimatum lifts: the Siege is called off.
      state = { ...state, grandBattles: state.grandBattles.filter((b) => b.id !== siege.id) }
      for (const r of siege.members ?? (siege.rival ? [siege.rival] : [])) {
        const rv = { ...state.rivals[r], ascendancyStreak: 0 }
        delete rv.ultimatumUntil
        state = { ...state, rivals: { ...state.rivals, [r]: rv } }
      }
      w.emit('grandBattle', { battleId: siege.id, trigger: 'siege', hexId: siege.hexId, stage: 'cancelled', rival: lead })
      w.emit('ascendancy', { rival: lead, stage: 'lifted', ...group })
      continue
    }
    if (siege) continue
    const immune = members.some((r) => (state.rivals[r].humbledUntil ?? '') >= w.day)
    const counts = w.week >= fromWeek && !immune && ratio >= needed
    const streak = counts ? Math.max(...members.map((r) => state.rivals[r].ascendancyStreak)) + 1 : 0
    for (const r of members) state = patchRival(state, r, { ascendancyStreak: streak })
    if (streak < a.streakWeeks) continue
    // The Ultimatum: the Siege of the Crown 14 days from the dawn, never within 7 days of a return (A-10).
    const castle = state.hexes.find((h) => h.kind === 'castle') as HexState
    const done = announceGrandBattle(
      state,
      { trigger: 'siege', hexId: castle.id, announcedOn: date, rival: lead, ...(members.length > 1 ? { members: [...members] } : {}), ...(siegeNotBefore(state) ? { notBefore: siegeNotBefore(state) } : {}) },
      w.emit
    )
    if (!done.ok || !done.battle) continue
    state = done.state
    for (const r of members) state = patchRival(state, r, { ultimatumUntil: done.battle.battleDate })
    w.emit('ascendancy', { rival: lead, stage: 'ultimatum', until: done.battle.battleDate, ...group })
  }
  return withWorld(state, { warned })
}

/** What bending the knee costs (Ch 14 rule 4): 25% of the treasury estimate of each rival sending the Siege (A-172). */
export function bendPrice(state: CampaignState, rival: RivalId): number {
  const siege = siegeOf(state, rival)
  const members = siege?.members ?? [rival]
  const reveal = realmEffects(state).reveals.treasury
  const estimate = (r: RivalId): number => {
    const seen = reveal.whom === 'all' || (reveal.whom === 'neighbors' && sharedBorder(state, r) > 0)
    if (seen) return holdings(state.rivals[r])
    const bands = ['meager', 'modest', 'prosperous', 'mighty'] as const
    return RULES.worldAi.treasuryEstimates[bands.indexOf(treasuryBand(holdings(state.rivals[r])))]
  }
  return roundPosting(RULES.defeat.bendTheKnee.treasuryShare * members.reduce((s, r) => s + estimate(r), 0))
}

/** Bends the knee (Ch 14 rule 4): once a campaign, pay the price and the Siege waits 4 weeks. */
export function bendTheKnee(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): { ok: boolean; reason?: string; state: CampaignState; cost: number } {
  const siege = siegeOf(state, rival)
  const world = worldOf(state)
  if (!isPlayable(state)) return { ok: false, reason: 'campaignOver', state, cost: 0 }
  if (!siege || siege.setup) return { ok: false, reason: 'noUltimatum', state, cost: 0 }
  const used = state.log.filter((e) => e.kind === 'ascendancy' && e.stage === 'delayed').length
  if (world.bentKnee !== undefined || used >= RULES.defeat.bendTheKnee.timesPerCampaign) return { ok: false, reason: 'used', state, cost: 0 }
  const price = bendPrice(state, rival)
  if (balance(state.purse) < price) return { ok: false, reason: 'reputation', state, cost: price }
  const events = new EventBuffer()
  const others = { ...state, grandBattles: state.grandBattles.filter((b) => b.id !== siege.id) }
  const battleDate = firstFreeDay(others, addDays(siege.battleDate, RULES.defeat.bendTheKnee.delayWeeks * DAYS))
  let next: CampaignState = { ...state, purse: spend(state.purse, today, price, `bendTheKnee:${rival}`) }
  next = { ...next, grandBattles: next.grandBattles.map((b) => (b.id === siege.id ? { ...b, battleDate } : b)) }
  for (const r of siege.members ?? [rival]) next = patchRival(next, r, { ultimatumUntil: battleDate })
  events.emitter(today)('ascendancy', { rival, stage: 'delayed', until: battleDate, price })
  next = withWorld(next, { bentKnee: today })
  return { ok: true, state: events.flush(next), cost: price }
}

/** The Siege's outcome (Ch 14 rules 5 and 6): won, each sender Humbled (AV −50%, Respect +10, no Ascendancy for 8 weeks); lost, the Fall. */
function siegeOutcome(input: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome } {
  let state = input
  const outcome: GrandOutcome = {}
  const senders = battle.members ?? (battle.rival ? [battle.rival] : [])
  ctx.emit('ascendancy', { rival: senders[0], stage: 'siege', ...(senders.length > 1 ? { members: [...senders] } : {}) })
  if (!ctx.won) {
    state = { ...state, campaign: { ...state.campaign, status: 'fallen' } }
    ctx.emit('campaignEnd', { outcome: 'fallen' })
    return { state, outcome }
  }
  const won = RULES.defeat.siegeWon
  for (const r of senders) {
    state = scaleArmy(state, r, 1 - won.armyLoss)
    state = adjustRespect(state, r, won.respect, 'siegeWon', ctx.emit)
    const rv = { ...state.rivals[r], ascendancyStreak: 0, humbledUntil: addDays(ctx.day, won.immuneWeeks * DAYS) }
    delete rv.ultimatumUntil
    state = { ...state, rivals: { ...state.rivals, [r]: rv } }
    ctx.emit('ascendancy', { rival: r, stage: 'humbled', until: rv.humbledUntil })
  }
  outcome.armyLoss = won.armyLoss
  outcome.respect = won.respect
  return { state, outcome }
}

/** The Capital won: the rival is conquered (Ch 14), as the pacing allows. */
const defaultCapital = GRAND_HOOKS.capital
function capitalOutcome(state: CampaignState, battle: GrandBattle, ctx: OutcomeContext): { state: CampaignState; outcome: GrandOutcome } {
  if (!ctx.won) return defaultCapital(state, battle, ctx)
  return { state: resolveRival(state, battle.rival as RivalId, 'conquered', ctx.day, ctx.emit), outcome: {} }
}

GRAND_HOOKS.capital = capitalOutcome
GRAND_HOOKS.coalitionOffensive = offensiveOutcome
GRAND_HOOKS.siege = siegeOutcome

// ── The week phase ───────────────────────────────────────────────────────────

export interface WorldWeek {
  day: ISODate
  week: number
  /** Campaign days in the week (7, or fewer in week 1). */
  days: number
  realmConsistency: number
  emit: Emit
}

/** The `world` week phase (Ch 13, Ch 14): resolutions, coalitions, the event deck, Ascendancy. */
export function worldWeek(input: CampaignState, w: WorldWeek): CampaignState {
  if (!isPlayable(input)) return input
  // Resolutions first, so a rival that defects at this close sets off the First Fall at the same close.
  let state = resolutionsWeek(input, w.day, w.emit)
  state = coalitionsWeek(state, w)
  state = eventsWeek(state, w)
  if (state.campaign.status === 'active') state = ascendancyWeek(state, w)
  return rosterInStep(state)
}

/** The stored roster gains and loses the companies events bring (the Wandering Order) as they come and go. */
function rosterInStep(state: CampaignState): CampaignState {
  const fresh = refreshRoster(state)
  const same = fresh.roster.length === state.roster.length && fresh.roster.every((c, i) => c.id === state.roster[i].id)
  return same ? state : fresh
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface CoalitionView {
  members: RivalId[]
  trigger: Coalition['trigger']
  until?: ISODate
  watcher?: RivalId
  /** The Offensive's day, once announced. */
  offensiveOn?: ISODate
}

/** The coalitions standing today, for the Diplomacy banner (no hidden numbers: the war chest stays out). */
export function coalitionView(state: CampaignState, today: ISODate = openDayOf(state)): CoalitionView[] {
  return standingCoalitions(state, today)
    .filter((c) => !c.over)
    .map((c) => {
      const offensive = c.offensive ? state.grandBattles.find((b) => b.id === c.offensive) : undefined
      return {
        members: [...c.members],
        trigger: c.trigger,
        ...(c.until ? { until: c.until } : {}),
        ...(c.watcher ? { watcher: c.watcher } : {}),
        ...(offensive && offensive.result === undefined ? { offensiveOn: offensive.battleDate } : {})
      }
    })
}

export interface UltimatumView {
  rival: RivalId
  members: RivalId[]
  /** The Siege's day and the days left until it. */
  siegeOn: ISODate
  daysLeft: number
  /** What bending the knee costs now, and whether it can still be done. */
  bendPrice: number
  canBend: boolean
  battleId: string
}

/** Every Ultimatum standing, for the calm banner (Ch 16 "Fear of losing"). The ratio stays hidden. */
export function ultimatumView(state: CampaignState, today: ISODate = openDayOf(state)): UltimatumView[] {
  const used = worldOf(state).bentKnee !== undefined
  return pendingBattles(state)
    .filter((b) => b.trigger === 'siege')
    .map((b) => {
      const rival = b.rival ?? (b.members?.[0] as RivalId)
      return { rival, members: b.members ?? [rival], siegeOn: b.battleDate, daysLeft: Math.max(0, diffDays(today, b.battleDate)), bendPrice: bendPrice(state, rival), canBend: !used && !b.setup, battleId: b.id }
    })
}

export interface AccordView extends AccordGate {
  rival: RivalId
  /** The Respect the Accord would add at today's Realm Consistency, and whether that signs it. */
  expectedGain: number
  wouldSign: boolean
}

/** What proposing an Accord to `rival` would do now, at Realm Consistency `rc` (for T16's "Propose an Accord"). */
export function accordView(state: CampaignState, rival: RivalId, rc: number, today: ISODate = openDayOf(state)): AccordView {
  const gate = accordGate(state, rival, today)
  const expectedGain = accordGain(state, rival, payoutCurve(rc))
  return { ...gate, rival, expectedGain, wouldSign: state.rivals[rival].respect + expectedGain >= RULES.contracts.accord.signedAtRespect }
}

export interface ChronicleRecord {
  status: CampaignState['campaign']['status']
  week: number
  daysSettled: number
  /** Campaign days on which every sworn duty was kept. */
  daysKept: number
  hexesHeld: number
  /** Realm Consistency at the last week close. */
  realmConsistency: number
  milestones: number
  battles: { grandWon: number; grandLost: number; defensesHeld: number; defensesLost: number; assaultsWon: number }
  rivals: { rival: RivalId; status: RivalState['status']; week?: number }[]
}

/** The Chronicle's record for the endgame screens (Ch 14 "Victory", "the Fall"): plain facts, told the same either way. */
export function chronicleRecord(state: CampaignState): ChronicleRecord {
  const days = state.settlement.snapshots.filter((s) => s.date >= state.campaign.startDate && s.date <= state.settledThrough.day)
  const fought = state.grandBattles.filter((b) => b.result !== undefined)
  const resolved = resolutionsOf(state)
  return {
    status: state.campaign.status,
    week: state.settledThrough.week,
    daysSettled: days.length,
    daysKept: days.filter((d) => d.dutiesSworn > 0 && d.dutiesKept >= d.dutiesSworn).length,
    hexesHeld: state.hexes.filter((h) => h.owner === 'player').length,
    realmConsistency: state.weight.weeks.at(-1)?.realmConsistency ?? 0,
    milestones: state.weight.milestones.filter((m) => m.brokenOn !== undefined).length,
    battles: {
      grandWon: fought.filter((b) => b.result !== 'defeat').length,
      grandLost: fought.filter((b) => b.result === 'defeat').length,
      defensesHeld: state.log.filter((e) => e.kind === 'defense' && e.outcome !== 'defeat').length,
      defensesLost: state.log.filter((e) => e.kind === 'defense' && e.outcome === 'defeat').length,
      assaultsWon: state.log.filter((e) => e.kind === 'assault' && (e.outcome === 'taken' || e.outcome === 'rout')).length
    },
    rivals: RIVAL_IDS.map((rival) => {
      const r = resolved.find((x) => x.rival === rival)
      return { rival, status: state.rivals[rival].status, ...(r ? { week: r.week } : {}) }
    })
  }
}

