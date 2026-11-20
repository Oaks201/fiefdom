/**
 * Patch 10 stage 4 (L1, D-80): the week ahead. Up to three aims the player can move this week, each with how it
 * stands, so a day on which no hex falls still has something to push: a ruler's commission, Remedy's request, the
 * standing siege, the path rank nearest, and the next building tier or Crossing stage in reach of the purse. The
 * Realm page keeps them as a strip, and the week's first Dawn tidings shows them.
 *
 * Public values only (Convention 6): the player's own figures and what a ruler or Remedy asks of them, as their own
 * cards already show. No benchmark, rival income, event criterion or terms threshold reaches it.
 */
import type { Ledger } from '../../types'
import { castleOffer, crossingOffer, tierOffer, type Offer } from '../buildings'
import { weekOf } from '../clock'
import { CODEX } from '../codex'
import { pathTotals, rankThresholds } from '../dominion'
import { numeral, realmEffects } from '../effects'
import { commissionProgress, commissionStands, requestOf } from '../requests'
import { RULES } from '../rules'
import { isPlayable, openDayOf } from '../state'
import { factText } from '../text'
import { BUILDING_IDS, RIVAL_IDS, type CampaignState, type ISODate, type RivalId } from '../types'
import { healerRequestView, requestBrief } from './healer'
import { standingSiegeView } from './orders'
import { buildingName } from './realm'
import { amount } from './refusals'
import { commissionBrief } from './requests'
import { rivalName } from './shell'

const PERCENT = 100 // rules-ok: shares shown as percentages

/** The most aims the week ahead shows (L1). */
export const WEEK_AIMS = 3 // rules-ok: a screen's length, not a rule

export type WeekAimKind = 'commission' | 'healer' | 'siege' | 'rank' | 'build'

export interface WeekAim {
  kind: WeekAimKind
  /** What it is: "Hrodgar’s commission". */
  title: string
  /** What it asks or reaches, in plain words: "2 wall levels raised, by Mon, Nov 23". */
  text: string
  /** How it stands: "1 of 2", "38 Dominion to go". */
  progress: string
  /** How far along, 0 to 1, for its bar. */
  share: number
  /** Done, and paid at today's close: shown until then. */
  done?: boolean
  /** The page where it is answered or seen, if not the Realm. */
  page?: 'diplomacy' | 'chronicle'
  rival?: RivalId
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** Each ruler's commission open today (R1, R2, R6): offered, taken up, his demand, or his terms in an Ultimatum. */
function commissionAims(state: CampaignState, today: ISODate): WeekAim[] {
  return RIVAL_IDS.flatMap((rival) => {
    const q = requestOf(state, rival, today)
    if (!q || q.kind !== 'commission') return []
    const need = q.need ?? RULES.requests.commission.one
    const done = Math.min(need, commissionProgress(state, q))
    const name = rivalName(rival)
    const title = q.ultimatum ? `${name}’s terms to stand down` : q.demand ? `${name}’s demand` : `${name}’s commission`
    const offered = !commissionStands(q)
    const met = done >= need
    const progress = `${done} of ${need}${met ? (offered ? ': met, once taken up' : ': met, paid at today’s close') : ''}${offered && !met ? ': take it up in his Audience' : ''}`
    return [{ kind: 'commission' as const, title, text: `${commissionBrief(rival, need)}, by ${factText(q.until)}`, progress, share: clamp01(done / need), ...(met && !offered ? { done: true } : {}), page: 'diplomacy' as const, rival }]
  })
}

/** Remedy's request for the week (H3), while it is not yet paid. */
function healerAim(state: CampaignState, ledger: Ledger | undefined, today: ISODate): WeekAim[] {
  const r = ledger ? healerRequestView(state, ledger, today) : null
  if (!r || r.paid) return []
  const progress = r.unit === 'days' ? `${r.soFar} of ${r.target} ${r.target === 1 ? 'day' : 'days'}` : `${r.soFar}% of ${r.target}%`
  return [{ kind: 'healer', title: 'Remedy’s request', text: `${requestBrief(r)}, by ${factText(r.until)}`, progress: r.met ? `${progress}: met, paid at today’s close` : progress, share: clamp01(r.soFar / r.target), ...(r.met ? { done: true } : {}), page: 'chronicle' }]
}

/** The standing siege (D-22): how worn its hex is, and the assault days that bring it down at a full day's Valor. */
function siegeAim(state: CampaignState, today: ISODate): WeekAim[] {
  const s = standingSiegeView(state, today, 1, realmEffects(state))
  if (!s) return []
  const days = Number.isFinite(s.days) ? (s.days <= 1 ? 'it can fall today' : `about ${s.days} assault days at a full day’s Valor`) : 'it holds against the companies you have'
  return [{ kind: 'siege', title: `The siege of ${s.label}`, text: days, progress: `${Math.round(s.progress * PERCENT)}% worn`, share: clamp01(s.progress) }]
}

/** The path rank nearest (D-18): the least Dominion to a path's next rank. */
function rankAim(state: CampaignState): WeekAim[] {
  const totals = pathTotals(state)
  const at = rankThresholds()
  const near = RIVAL_IDS.flatMap((rival) => {
    const rank = state.paths?.byRival[rival].rank ?? 0
    if (rank >= at.length) return []
    const from = rank > 0 ? at[rank - 1] : 0
    return [{ rival, rank: rank + 1, gap: Math.max(0, at[rank] - totals[rival]), share: clamp01((totals[rival] - from) / (at[rank] - from)), dominion: totals[rival], next: at[rank] }]
  }).sort((a, b) => a.gap - b.gap)[0]
  if (!near) return []
  return [{ kind: 'rank', title: `Rank ${numeral(near.rank)} on ${rivalName(near.rival)}’s path`, text: `Dominion ${amount(near.dominion)} of ${amount(near.next)}`, progress: `${amount(near.gap)} Dominion to go`, share: near.share, rival: near.rival }]
}

/** The next step of the castle, a building or a Crossing that wants only reputation: the one nearest the purse. */
function buildAim(state: CampaignState): WeekAim[] {
  const offers: { name: string; offer: Offer }[] = [
    { name: `The castle, Tier ${numeral(state.castleTier + 1)}`, offer: castleOffer(state) },
    ...BUILDING_IDS.map((id) => ({ name: `The ${buildingName(id)}, Tier ${numeral(state.buildings[id] + 1)}`, offer: tierOffer(state, id) })),
    ...CODEX.crossings.map((x) => ({ name: `${x.name}, stage ${numeral((state.crossings[x.id] ?? 0) + 1)}`, offer: crossingOffer(state, x.id) }))
  ]
  const near = offers
    .flatMap(({ name, offer }) => {
      const req = offer.requirements ?? []
      const purse = req.find((r) => r.need.code === 'reputation')
      if (offer.reason?.code === 'maxed' || offer.reason?.code === 'campaignOver' || !purse || req.some((r) => r.need.code !== 'reputation' && !r.met)) return []
      const have = purse.need.code === 'reputation' ? purse.need.have : 0
      return [{ name, cost: offer.cost, have, gap: Math.max(0, offer.cost - have) }]
    })
    .sort((a, b) => a.gap - b.gap || a.cost - b.cost)[0]
  if (!near) return []
  return [
    {
      kind: 'build',
      title: near.name,
      text: `${amount(near.cost)} reputation`,
      progress: near.gap === 0 ? 'In the purse now' : `${amount(Math.ceil(near.gap))} reputation to go`,
      share: near.cost > 0 ? clamp01(near.have / near.cost) : 1
    }
  ]
}

/**
 * The week ahead on `today` (L1): up to `WEEK_AIMS` aims, the week's own first (a ruler's commission, then Remedy's
 * request), then the standing siege, the nearest path rank and the next step in reach of the purse. The ledger
 * gives Remedy's request its live count; without it she is left out. Empty once the campaign is over.
 */
export function weekAhead(state: CampaignState, ledger?: Ledger, today: ISODate = openDayOf(state)): WeekAim[] {
  if (!isPlayable(state)) return []
  return [...commissionAims(state, today), ...healerAim(state, ledger, today), ...siegeAim(state, today), ...rankAim(state), ...buildAim(state)].slice(0, WEEK_AIMS)
}

/** Whether `today` is its week's first day, when the Dawn tidings shows the week ahead (L1). */
export function weekBegins(state: CampaignState, today: ISODate): boolean {
  return weekOf(today, state.campaign.weekStartsOn) === today
}
