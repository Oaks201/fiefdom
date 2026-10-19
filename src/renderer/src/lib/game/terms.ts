/**
 * Patch 4 (D-33; R-07 to R-09, R-11 to R-13, X-24, C-34 to C-41): how each rival yields.
 *
 * - **The stance.** Six measures of the realm, each against a hidden threshold (scored as a share of it,
 *   at most 1) and weighted by each rival his own way, give his stance band: Defiant, Wary, Shaken or
 *   Ready to yield. Only the band is shown, with Herald rumors naming what he weighs (R-08); never a
 *   number, never which measure is close.
 * - **Terms**, read at each week close from week 16 (`termsWeek`, in the `world` phase): the Goblin's
 *   buy-offs and then his surrender; the Archmage's surrender when his life is at risk; the Dwarf's
 *   grudging surrender once two thirds of his march are held; the Orc's last battle (a final Warhost,
 *   or Ugrak's Challenge when he respects the player). No offer from a rival in a coalition against the
 *   player or with an Ascendancy streak, none while the pacing would hold his resolution, none while
 *   the player is away. Offers stay open 7 days (A-171); refused or lapsed, they come back no sooner
 *   than 4 weeks later.
 *
 * Accepting and refusing are world.ts's (`acceptTerms`, `refuseTerms`), which resolve the rival.
 * Hidden: every threshold, weight and score. Screens read the band only.
 */
import { itemOffer } from './armory'
import { addDays, diffDays, weekOf } from './clock'
import { CODEX } from './codex'
import { armyValue } from './combat'
import { totalDominion } from './dominion'
import { announceGrandBattle, pendingBattles } from './grand'
import { rivalHost } from './grand/hosts'
import { borderHexesOf, hexIndex, isClaimableKind, nearestTo, pathShares, touches } from './map'
import { pushedMarches } from './marches'
import { pactHolds } from './personalities'
import { RULES } from './rules'
import { pick } from './rng'
import { playerArmyValue } from './rivals'
import { awayOn, inCoalition, resolutionAllowed, withWorld, worldOf } from './state'
import { RIVAL_IDS, STANCE_BANDS, type CampaignState, type Emit, type ISODate, type RivalId, type RivalTerms, type StanceBand, type TermsGift, type TermsState, type WorldOffer } from './types'

const T = RULES.terms

export type Measure = keyof typeof T.thresholds
export const MEASURES = Object.keys(T.thresholds) as Measure[]

export function termsOf(state: CampaignState): TermsState {
  return state.terms ?? { byRival: {} }
}

function rivalTerms(state: CampaignState, rival: RivalId): RivalTerms {
  return termsOf(state).byRival[rival] ?? {}
}

/** The state with `rival`'s terms record patched. */
export function patchRivalTerms(state: CampaignState, rival: RivalId, patch: Partial<RivalTerms>): CampaignState {
  const t = termsOf(state)
  return { ...state, terms: { ...t, byRival: { ...t.byRival, [rival]: { ...t.byRival[rival], ...patch } } } }
}

/** The state with the Goblin's hired companies from a buy-off (C-35). */
export function withHires(state: CampaignState, hires: TermsState['hires']): CampaignState {
  const t = termsOf(state)
  const { hires: _old, ...rest } = t
  return { ...state, terms: hires ? { ...rest, hires } : rest }
}

// ── The measures (C-38) ──────────────────────────────────────────────────────

/** Reputation earned over the campaign: every earning, spoils and tithe posted. */
function reputationEarned(state: CampaignState): number {
  return state.purse.events.reduce((s, e) => (e.kind === 'earn' || e.kind === 'spoils' || e.kind === 'tithe' ? s + e.amount : s), 0)
}

/** The share of `rival`'s march the player holds, by its hexes' shares of his path (a seam half). */
export function marchShareHeld(state: CampaignState, rival: RivalId): number {
  let held = 0
  let all = 0
  for (const h of state.hexes) {
    if (h.march === undefined || !isClaimableKind(h)) continue
    const s = pathShares(h)[rival] ?? 0
    if (s <= 0) continue
    all += s
    if (h.owner === 'player') held += s
  }
  return all > 0 ? held / all : 0
}

/** What every rival's measures share on a day: read once when all four read their stance (Patch 6, `dailyStances`). */
interface SharedMeasures {
  reputation: number
  playerArmy: number
  share: number
  victories: number
  dominion: number
  constancy: number
}

function sharedMeasures(state: CampaignState): SharedMeasures {
  const claimable = state.hexes.filter((h) => isClaimableKind(h) && h.kind !== 'lairMouth')
  const share = claimable.filter((h) => h.owner === 'player').length / Math.max(1, claimable.length)
  const won = state.grandBattles.filter((b) => b.result !== undefined && b.result !== 'defeat').length
  const resolved = RIVAL_IDS.filter((r) => state.rivals[r].status !== 'active').length
  const weeks = state.weight.weeks.slice(-T.constancyWeeks)
  return {
    reputation: reputationEarned(state),
    playerArmy: playerArmyValue(state),
    share,
    victories: won + T.resolvedVictories * resolved,
    dominion: totalDominion(state),
    constancy: weeks.length > 0 ? weeks.reduce((s, w) => s + w.realmConsistency, 0) / weeks.length : 0
  }
}

/** Each measure's value as `rival` reads it on `day`. Hidden. */
export function measures(state: CampaignState, rival: RivalId, day: ISODate, shared: SharedMeasures = sharedMeasures(state)): Record<Measure, number> {
  return {
    reputation: shared.reputation,
    army: shared.playerArmy / Math.max(1, armyValue(state, rival, day)),
    land: rival === 'dwarf' ? Math.max(shared.share, marchShareHeld(state, rival)) : shared.share,
    victories: shared.victories,
    dominion: shared.dominion,
    constancy: shared.constancy
  }
}

/** A weighted reading: Σ weight × min(1, value ÷ threshold). Hidden. */
function reading(m: Record<Measure, number>, weights: Readonly<Partial<Record<Measure, number>>>): number {
  return MEASURES.reduce((s, k) => s + (weights[k] ?? 0) * Math.min(1, m[k] / T.thresholds[k]), 0)
}

/** `rival`'s stance score on `day` (C-38). Hidden: screens read the band. */
export function stanceScore(state: CampaignState, rival: RivalId, day: ISODate, shared?: SharedMeasures): number {
  return reading(measures(state, rival, day, shared), T.weights[rival])
}

/** A score's band: Defiant, Wary, Shaken or Ready to yield (R-08). */
export function bandOfScore(score: number): StanceBand {
  return STANCE_BANDS[T.bands.filter((cut) => score >= cut).length]
}

/** `rival`'s stance band as the last week close read it (Defiant before week 16, or never read). */
export function stanceOf(state: CampaignState, rival: RivalId): StanceBand {
  return rivalTerms(state, rival).band ?? 'defiant'
}

/** The measures `rival` weighs most, highest first: what the Herald's rumors name (R-08). Never a number, never which is close. */
export function weighsMost(rival: RivalId): Measure[] {
  const w = T.weights[rival] as Readonly<Partial<Record<Measure, number>>>
  return MEASURES.filter((k) => (w[k] ?? 0) > 0).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0) || MEASURES.indexOf(a) - MEASURES.indexOf(b))
}

// ── Offers ───────────────────────────────────────────────────────────────────

export type TermsOfferRecord = Extract<WorldOffer, { kind: 'terms' }>

/** The terms open to the player on `day`. */
export function openTerms(state: CampaignState, day: ISODate): TermsOfferRecord[] {
  return worldOf(state).offers.filter((o): o is TermsOfferRecord => o.kind === 'terms' && day <= o.until)
}

/**
 * Whether `rival` may offer terms at the close of `day` (X-24 item 5, C-39). An offer waits for an absent
 * player; the Orc's last battle doesn't, as his Warhost doesn't (C-40, S-44).
 */
function mayOffer(state: CampaignState, rival: RivalId, day: ISODate, week: number): boolean {
  const r = state.rivals[rival]
  if (r.status !== 'active' || week < T.fromWeek || (rival !== 'orc' && awayOn(state, day))) return false
  return !inCoalition(state, rival, addDays(day, 1)) && r.ascendancyStreak === 0 && r.ultimatumUntil === undefined
}

/** Whether `rival` last made `offer` (or fought his last battle) at least `weeks` weeks before `day`, or never. */
function waited(state: CampaignState, rival: RivalId, offer: string, day: ISODate, weeks: number): boolean {
  const last = rivalTerms(state, rival).last?.[offer]
  return last === undefined || diffDays(last, day) >= weeks * RULES.clock.daysPerWeek
}

/** A gift in plain words for the log: `hex:<id>`, `item:<id>`, `hires:<n>`. */
export function giftLabel(g: TermsGift): string {
  return g.kind === 'hex' ? `hex:${g.hexId}` : g.kind === 'item' ? `item:${g.itemId}` : `hires:${g.count}`
}

function offer(state: CampaignState, rival: RivalId, kind: 'buyOff' | 'surrender', day: ISODate, emit: Emit, gift?: TermsGift): CampaignState {
  const record: TermsOfferRecord = { kind: 'terms', rival, offer: kind, until: addDays(day, RULES.worldAi.offerDays), ...(gift ? { gift } : {}) }
  const next = patchRivalTerms(withWorld(state, { offers: [...worldOf(state).offers, record] }), rival, { last: { ...rivalTerms(state, rival).last, [kind]: day } })
  emit('terms', { rival, offer: kind, stage: 'offered', ...(gift?.kind === 'hex' ? { hexId: gift.hexId } : {}), ...(gift ? { gift: giftLabel(gift) } : {}) })
  return next
}

/**
 * The Goblin's buy-off gift (C-35), worth about `giftValue` × (1 + `giftGrowth` × buy-offs refused): a
 * hex of his march beside the player's land (his own or the wilds, never his Gate), an Armory item the
 * player could buy now, or hired companies, drawn by seed among those he can give. Never reputation.
 */
function buyOffGift(state: CampaignState, day: ISODate): TermsGift {
  const g = T.goblin
  const refused = rivalTerms(state, 'goblin').refused ?? 0
  const value = g.giftValue * (1 + g.giftGrowth * refused)
  const byId = hexIndex(state.hexes)
  const hexes = state.hexes.filter((h) => h.march === 'goblin' && (h.owner === 'goblin' || h.owner === 'neutral') && isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'lairMouth' && !h.mythic && touches(byId, h.id, 'player'))
  const items = CODEX.items.filter((i) => i.cost !== null && (i.rank === 'I' || i.rank === 'II' || i.rank === 'III') && (i.cost ?? 0) <= value && sellsNow(state, i.id))
  const kinds: TermsGift['kind'][] = [...(hexes.length > 0 ? (['hex'] as const) : []), ...(items.length > 0 ? (['item'] as const) : []), 'hires']
  const kind = pick(state.campaign.seed, day, 'terms:gift', kinds)
  if (kind === 'hex') return { kind, hexId: [...hexes].sort((a, b) => Math.abs(a.strength - value) - Math.abs(b.strength - value) || a.id.localeCompare(b.id))[0].id }
  if (kind === 'item') return { kind, itemId: [...items].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.id.localeCompare(b.id))[0].id }
  return { kind: 'hires', count: Math.min(g.maxHires, 1 + refused) }
}

/** Whether the Armory sells `id` now (its rank open, not a unique one already held), whatever its price. */
function sellsNow(state: CampaignState, id: string): boolean {
  const o = itemOffer(state, id)
  return o.ok || o.reason?.code === 'reputation'
}

/** `rival`'s stance band read at `day`'s close (Defiant before week 16), posting `stance` when it changes. */
function readStance(input: CampaignState, rival: RivalId, day: ISODate, week: number, emit: Emit, shared?: SharedMeasures): CampaignState {
  const before = stanceOf(input, rival)
  const band = week >= T.fromWeek ? bandOfScore(stanceScore(input, rival, addDays(day, 1), shared)) : 'defiant'
  if (band === before) return input
  emit('stance', { rival, from: before, to: band })
  return patchRivalTerms(input, rival, { band })
}

/**
 * Patch 6 (D-50, C-90, N-22): every active rival's stance band read at each day's close, so the court and the
 * Herald show it the next morning. Offers, lapses and the pacing stay at the week close (`termsWeek`).
 */
export function dailyStances(input: CampaignState, day: ISODate, week: number, emit: Emit): CampaignState {
  if (week < T.fromWeek && RIVAL_IDS.every((r) => stanceOf(input, r) === 'defiant')) return input
  // A stance changes only the terms record, never a measure, so the four read one day's shared measures.
  const shared = week >= T.fromWeek ? sharedMeasures(input) : undefined
  let state = input
  for (const rival of RIVAL_IDS) if (state.rivals[rival].status === 'active') state = readStance(state, rival, day, week, emit, shared)
  return state
}

/**
 * Terms at a week close (D-33): lapsed offers first (a lapsed buy-off counts as refused), then every
 * rival's stance band (read each day too from Patch 6, `dailyStances`), then the offers the bands, the
 * land and the pacing allow.
 */
export function termsWeek(input: CampaignState, w: { day: ISODate; week: number; emit: Emit }): CampaignState {
  let state = input
  const { day, week, emit } = w
  for (const o of worldOf(state).offers) {
    if (o.kind !== 'terms' || o.until > day) continue
    emit('terms', { rival: o.rival, offer: o.offer, stage: 'lapsed' })
    if (o.offer === 'buyOff') state = patchRivalTerms(state, o.rival, { refused: (rivalTerms(state, o.rival).refused ?? 0) + 1 })
  }
  state = withWorld(state, { offers: worldOf(state).offers.filter((o) => o.kind !== 'terms' || o.until > day) })

  const tomorrow = addDays(day, 1)
  for (const rival of RIVAL_IDS) {
    if (state.rivals[rival].status !== 'active') continue
    state = readStance(state, rival, day, week, emit)
    const band = stanceOf(state, rival)
    if (!mayOffer(state, rival, day, week) || openTerms(state, tomorrow).some((o) => o.rival === rival)) continue
    const pacing = resolutionAllowed(state, tomorrow)
    switch (rival) {
      case 'goblin': {
        const refused = rivalTerms(state, rival).refused ?? 0
        if (pacing && (band === 'ready' || refused >= T.goblin.surrenderAfterRefused) && waited(state, rival, 'surrender', day, T.retryWeeks)) state = offer(state, rival, 'surrender', day, emit)
        else if (STANCE_BANDS.indexOf(band) >= T.goblin.buyOffFromBand && !pactHolds(state, tomorrow) && pushedMarches(state, weekOf(day, state.campaign.weekStartsOn), day).has('goblin') && waited(state, rival, 'buyOff', day, T.goblin.buyOffEveryWeeks)) {
          state = offer(state, rival, 'buyOff', day, emit, buyOffGift(state, day))
        }
        break
      }
      case 'archmage': {
        if (!pacing || !waited(state, rival, 'surrender', day, T.retryWeeks)) break
        const gate = state.hexes.find((h) => h.kind === 'gate' && h.march === 'archmage')
        const danger = reading(measures(state, rival, tomorrow), T.archmageDanger) >= T.bands[T.bands.length - 1]
        const weak = armyValue(state, 'archmage', tomorrow) <= T.archmage.armyRatio * playerArmyValue(state)
        if (gate?.owner === 'player' || danger || weak) state = offer(state, rival, 'surrender', day, emit)
        break
      }
      case 'dwarf':
        if (pacing && marchShareHeld(state, 'dwarf') >= T.dwarf.marchShare && waited(state, rival, 'surrender', day, T.retryWeeks)) state = offer(state, rival, 'surrender', day, emit)
        break
      case 'orc':
        state = orcLastBattle(state, band, day, emit)
        break
    }
  }
  return state
}

/**
 * The Orc's last battle (R-11, C-40): at his top band, or when he is the last active rival, once his
 * last one is 8 weeks behind and none waits, and while a win could resolve him: a final Warhost with
 * his whole army at Respect under 50, else Ugrak's Challenge, the duel.
 */
function orcLastBattle(state: CampaignState, band: StanceBand, day: ISODate, emit: Emit): CampaignState {
  const last = RIVAL_IDS.filter((r) => state.rivals[r].status === 'active').length === 1
  if (band !== 'ready' && !last) return state
  const announcedOn = addDays(day, 1)
  if (!resolutionAllowed(state, announcedOn) || pendingBattles(state).some((b) => b.final) || !waited(state, 'orc', 'lastBattle', day, T.orc.retryWeeks)) return state
  const target = nearestTo(borderHexesOf(state.hexes, 'player').filter(isClaimableKind), state.hexes.filter((h) => h.owner === 'orc'))
  if (target.length === 0) return state
  const hexId = pick(state.campaign.seed, day, 'terms:orc:target', target.map((h) => h.id))
  const respectful = state.rivals.orc.respect >= T.orc.respectBar
  const duel = CODEX.events.find((e) => e.id === 'ugraksChallenge')?.effect.companiesPerSide
  const done =
    respectful && typeof duel === 'number'
      ? announceGrandBattle(state, { trigger: 'event', eventId: 'ugraksChallenge', hexId, announcedOn, rival: 'orc', enemy: rivalHost(state, 'orc', RULES.grandBattles.hostShare.rival, announcedOn, duel), limit: duel, final: true }, emit)
      : announceGrandBattle(state, { trigger: 'warhost', hexId, announcedOn, rival: 'orc', share: T.orc.hostShare, final: true }, emit)
  if (!done.ok) return state
  emit('terms', { rival: 'orc', offer: respectful ? 'challenge' : 'finalWarhost', stage: 'offered', hexId })
  return patchRivalTerms(done.state, 'orc', { last: { ...rivalTerms(done.state, 'orc').last, lastBattle: day } })
}
