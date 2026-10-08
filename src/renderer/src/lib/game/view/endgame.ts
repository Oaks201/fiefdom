/**
 * View models for the endgame in Diplomacy and the big-moment cards (T16; Ch 13 "Coalitions",
 * Ch 14, Ch 16 "Fear of losing" and "Shame", Ch 17 "Big moments", D-01, A-172, A-176, A-178):
 * proposing an Accord, the coalition and Ultimatum banners, the victory, the Reign and the Fall
 * with the Chronicle's record, and the cards each settled event raises.
 *
 * Hidden stays hidden: no Power, ratio, war chest or treasury reaches these objects (the
 * bend-the-knee price is a price, from a treasury estimate the player can know, A-172). The Fall
 * is told as chronicle, in the same plain words as the victory.
 */
import { RULES } from '../rules'
import { openDayOf, weekOn } from '../state'
import { t, type TextFacts } from '../text'
import type { CampaignState, GameEvent, ISODate, RivalId } from '../types'
import { accordView, chronicleRecord, coalitionView, ultimatumView, type AccordRefusal } from '../world'
import { lbTo } from '../weight'
import { resultView } from './battle'
import { dealsView, type DealLine } from './diplomacy'
import { milestoneCard } from './armory'
import { amount } from './refusals'
import { realmConsistencyNow, rivalName, rivalNames } from './shell'

const PERCENT = 100 // rules-ok: shares shown as percentages
const TENTH = 10 // rules-ok: weights shown to 0.1

// ── Accords (Ch 14, D-01) ────────────────────────────────────────────────────

export interface AccordPanel {
  rival: RivalId
  name: string
  open: boolean
  threshold: number
  respect: number
  /** The Respect it would add at today's Realm Consistency, and whether that signs it. */
  expectedGain: number
  wouldSign: boolean
  days: number
  reason?: { code: AccordRefusal; label: string }
}

function accordRefusalLabel(code: AccordRefusal, rival: RivalId, threshold: number): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'rivalResolved':
      return `${rivalName(rival)} is already resolved.`
    case 'respect':
      return `Accord talks open at Respect ${threshold}.`
    case 'castle':
      return `An Accord needs the castle at Tier ${RULES.contracts.accord.castleTier}, the Citadel.`
    case 'coalition':
      return `${rivalName(rival)} stands in a coalition against you.`
    case 'contractRunning':
      return 'A contract holds the slot. An Accord is the one running contract for its 30 days (D-01), so it waits until the slot is free.'
  }
}

/** Proposing an Accord to `rival` (Ch 14): open or why not, and the Respect it would add at today's Realm Consistency. */
export function accordPanel(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): AccordPanel {
  const view = accordView(state, rival, realmConsistencyNow(state), today)
  return {
    rival,
    name: rivalName(rival),
    open: view.ok,
    threshold: view.threshold,
    respect: view.respect,
    expectedGain: view.expectedGain,
    wouldSign: view.wouldSign,
    days: RULES.contracts.accord.days,
    ...(view.ok || !view.reason ? {} : { reason: { code: view.reason, label: accordRefusalLabel(view.reason, rival, view.threshold) } })
  }
}

// ── Coalitions (Ch 13) ───────────────────────────────────────────────────────

export interface CoalitionBanner {
  members: RivalId[]
  names: string
  trigger: string
  textId: string
  text: string
  until?: ISODate
  watcher?: string
  /** The Coalition Offensive's day, once announced. */
  offensiveOn?: ISODate
  /** Paying a member to walk away (a deal on its court). */
  buyouts: DealLine[]
}

export function coalitionBanners(state: CampaignState, today: ISODate = openDayOf(state)): CoalitionBanner[] {
  return coalitionView(state, today).map((c) => {
    const textId = `coalitions.${c.trigger}`
    const facts: TextFacts = { members: rivalNames(c.members), ...(c.until ? { date: c.until } : {}), ...(c.watcher ? { watcher: rivalName(c.watcher) } : {}) }
    return {
      members: [...c.members],
      names: rivalNames(c.members),
      trigger: c.trigger,
      textId,
      text: t(textId, facts),
      ...(c.until ? { until: c.until } : {}),
      ...(c.watcher ? { watcher: rivalName(c.watcher) } : {}),
      ...(c.offensiveOn ? { offensiveOn: c.offensiveOn } : {}),
      buyouts: c.members.flatMap((m) => dealsView(state, m, today).filter((d) => d.kind === 'buyout'))
    }
  })
}

// ── The Ultimatum (Ch 14 rules 3, 4 and 7) ───────────────────────────────────

export interface UltimatumBanner {
  rival: RivalId
  names: string
  siegeOn: ISODate
  daysLeft: number
  textId: string
  text: string
  /** What lifts it, as a rule: no number the player can't see. */
  lifts: string
  bendPrice: number
  canBend: boolean
  battleId: string
}

export function ultimatumBanners(state: CampaignState, today: ISODate = openDayOf(state)): UltimatumBanner[] {
  return ultimatumView(state, today).map((u) => {
    const names = rivalNames(u.members)
    return {
      rival: u.rival,
      names,
      siegeOn: u.siegeOn,
      daysLeft: u.daysLeft,
      textId: 'endings.ultimatum',
      text: t('endings.ultimatum', { rival: names, date: u.siegeOn }),
      lifts: `It lifts if, at a week close before the Siege, their power falls below ${amount(RULES.defeat.ascendancy.liftBelowRatio)}× yours. Taking their land, Humbling them in battle or growing your own realm all count.`,
      bendPrice: u.bendPrice,
      canBend: u.canBend,
      battleId: u.battleId
    }
  })
}

// ── Victory, the Reign and the Fall (Ch 14, Ch 16 "Shame") ───────────────────

export interface EndgameView {
  status: 'won' | 'fallen'
  /** `endings.victory` or `endings.fall`, with its facts. */
  textId: string
  text: string
  slot: string
  /** The Chronicle's record, as plain lines (Ch 14 "Victory", A-178): the same either way. */
  record: string[]
  rivals: { rival: RivalId; name: string; fate: string }[]
  /** After a victory the realm goes on (A-176): `herald.reign`. */
  reign?: { textId: string; text: string }
}

const FATES: Record<string, string> = { conquered: 'conquered', abdicated: 'abdicated', allied: 'allied by Accord', active: 'still standing' }

function recordFacts(state: CampaignState): { facts: TextFacts; lines: string[]; rivals: EndgameView['rivals'] } {
  const r = chronicleRecord(state)
  const consistency = Math.round(r.realmConsistency * PERCENT)
  const besieger = state.log.filter((e) => e.kind === 'ascendancy' && e.stage === 'siege').at(-1)
  const rival = besieger && besieger.kind === 'ascendancy' ? rivalNames(besieger.members ?? [besieger.rival]) : ''
  return {
    facts: { week: r.week, daysKept: r.daysKept, hexes: r.hexesHeld, consistency, rival },
    lines: [
      `Week ${r.week}, ${r.daysSettled} days settled`,
      `Days every duty was kept: ${r.daysKept}`,
      `Hexes held: ${r.hexesHeld}`,
      `Realm Consistency: ${consistency}%`,
      `Milestones broken: ${r.milestones}`,
      `Grand Battles won ${r.battles.grandWon}, lost ${r.battles.grandLost}`,
      `Defenses held ${r.battles.defensesHeld}, lost ${r.battles.defensesLost}; assaults won ${r.battles.assaultsWon}`
    ],
    rivals: r.rivals.map((x) => ({ rival: x.rival, name: rivalName(x.rival), fate: `${FATES[x.status] ?? x.status}${x.week ? ` in week ${x.week}` : ''}` }))
  }
}

/** The end of the campaign, told plainly (null while it runs). */
export function endgameView(state: CampaignState): EndgameView | null {
  const status = state.campaign.status
  if (status === 'active') return null
  const { facts, lines, rivals } = recordFacts(state)
  const textId = status === 'won' ? 'endings.victory' : 'endings.fall'
  const won = status === 'won'
  const end = state.log.find((e) => e.kind === 'campaignEnd')
  return {
    status,
    textId,
    text: t(textId, facts),
    slot: won ? 'moment.victory' : 'moment.fall',
    record: lines,
    rivals,
    ...(won ? { reign: { textId: 'herald.reign', text: t('herald.reign', { week: end ? weekOn(state, end.day) : facts.week }) } } : {})
  }
}

// ── The big-moment cards a settlement raises (Ch 17) ─────────────────────────

export interface MomentSpec {
  id: string
  slot: string
  titleId: string
  bodyId?: string
  facts?: TextFacts
  sound?: string
  /** Plain lines under the words: what a Milestone opens, what a battle did, the record. */
  lines?: string[]
  /** A button beside Continue: watch a battle's replay. */
  action?: { label: string; battleId: string }
}

/**
 * The cards the events of a settlement (or a player action) raise, in order: each Milestone broken
 * with only its own unlocks; each Grand Battle the Marshal fought (with its replay) and each
 * decisive one; a coalition formed; an Ultimatum; and last, victory or the Fall with the record.
 */
export function momentsFor(state: CampaignState, events: readonly GameEvent[]): MomentSpec[] {
  const out: MomentSpec[] = []
  // The campaign's end comes last, after the battle that decided it.
  const endings: MomentSpec[] = []
  for (const e of events) {
    switch (e.kind) {
      case 'milestone': {
        const card = milestoneCard(e.index, { mark: Math.round(lbTo(e.mark, state.campaign.unit) * TENTH) / TENTH, unit: state.campaign.unit, date: e.day })
        out.push({ id: e.id, slot: card.slot, titleId: card.titleId, bodyId: card.bodyId, facts: card.facts, sound: 'milestone', lines: card.unlocks })
        break
      }
      case 'grandBattle': {
        if (e.stage !== 'fought') break
        const view = resultView(state, e.battleId)
        if (!view || (!e.marshal && !view.decisive)) break
        out.push({
          id: e.id,
          slot: view.slot,
          titleId: view.titleId,
          facts: view.facts,
          sound: view.won ? 'battleWon' : 'battleLost',
          lines: [...(view.marshal ? ['Fought by the Marshal at the day’s close.'] : []), ...view.lines],
          action: { label: 'Watch the replay', battleId: e.battleId }
        })
        break
      }
      case 'coalition': {
        if (e.stage !== 'formed') break
        const c = coalitionBanners(state, e.day).find((x) => x.trigger === e.trigger)
        const facts: TextFacts = { members: rivalNames(e.members), ...(c?.until ? { date: c.until } : {}), ...(c?.watcher ? { watcher: c.watcher } : {}) }
        out.push({ id: e.id, slot: 'moment.coalition', titleId: `coalitions.${e.trigger}`, facts, sound: 'coalition' })
        break
      }
      case 'ascendancy': {
        if (e.stage !== 'ultimatum') break
        out.push({ id: e.id, slot: 'moment.ultimatum', titleId: 'endings.ultimatum', facts: { rival: rivalNames(e.members ?? [e.rival]), date: e.until ?? '' }, sound: 'ultimatum' })
        break
      }
      case 'campaignEnd': {
        const view = endgameView(state)
        if (!view) break
        endings.push({ id: e.id, slot: view.slot, titleId: view.textId, facts: recordFacts(state).facts, sound: view.status === 'won' ? 'victory' : 'fall', lines: [...view.record, ...view.rivals.map((r) => `${r.name}: ${r.fate}`)] })
        break
      }
      default:
        break
    }
  }
  return [...out, ...endings]
}
