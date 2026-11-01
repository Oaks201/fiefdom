/**
 * Patch 8 (R1, D-66): a ruler's request as the screens show it: in his Audience a card with his words,
 * what he asks in plain terms, what each answer does and the buttons' labels; on his court a line that one
 * waits; on the orders, what an assault on a promised hex breaks. His words are his `requests` lines in the
 * lines file (`audience.ts`): one per kind he asks, and `granted` and `refused` for his answer to the player's.
 */
import { itemOffer } from '../armory'
import { CODEX } from '../codex'
import { buyPrice, promisesOn } from '../land'
import { hexName } from '../map'
import { isDemand, requestOf } from '../requests'
import { RULES } from '../rules'
import { withWorld } from '../state'
import { factText, fill, type TextFacts } from '../text'
import type { CampaignState, ISODate, RequestKind, RivalId, RulerRequest } from '../types'
import { isLine, linesOf, rulerEntry } from './audience'
import { prizedHabit } from './rivalGuide'
import { amount } from './refusals'
import { rivalName } from './shell'

const Q = RULES.requests

export interface RequestCard {
  rival: RivalId
  kind: RequestKind
  /** "His dare", "His offer" or "His demand". */
  title: string
  /** What he asks, in plain terms. */
  asks: string
  /** What each answer does, and silence. */
  rule: string
  /** His words for it, if the file has them. */
  words?: string
  /** Its last day, as players read it. */
  until: string
  /** The buttons: none for a dare, which is never answered. */
  grantLabel?: string
  refuseLabel?: string
}

const TITLES: Record<RequestKind, string> = { dare: 'His dare', itemOffer: 'His offer', hexOffer: 'His offer', liftSiege: 'His demand', spareHex: 'His demand', toll: 'His demand' }

function signed(v: number): string {
  return v > 0 ? `+${v}` : `−${-v}`
}

/** What `rival` dares the player to keep: the habit he prizes; Ugrak's narrower, no battle lost to his raids. */
export function dareHabit(rival: RivalId): string {
  return rival === 'orc' ? 'A week with no battle lost to his raids' : prizedHabit(rival)
}

/** What he does when a demand of his is refused, left unanswered or a promise to him broken (`demandRefused`). */
function actsOn(q: Pick<RulerRequest, 'rival' | 'hexId'>): string {
  if (q.rival === 'orc') return `he is at War with you for ${Q.demand.wrongedDays} days`
  return q.hexId ? `he walls ${hexName(q.hexId)} a level` : 'he walls a hex of his facing your land a level'
}

function facts(q: RulerRequest): TextFacts {
  return {
    ...(q.hexId ? { hex: hexName(q.hexId) } : {}),
    ...(q.itemId ? { item: CODEX.items.find((i) => i.id === q.itemId)?.name ?? q.itemId } : {}),
    ...(q.price !== undefined ? { price: amount(q.price) } : {}),
    ...(q.kind === 'spareHex' ? { days: Q.spareDays } : {}),
    rival: rivalName(q.rival)
  }
}

/** His words in the file's `requests` part for `key`, filled, if it has them. */
function said(lines: unknown, rival: RivalId, key: string, f: TextFacts = {}): string | undefined {
  const line = linesOf(rulerEntry(lines, rival), 'requests')[key]
  return isLine(line) ? fill(line, f) : undefined
}

/** `rival`'s request open on `today` as his Audience shows it, if he has one. */
export function requestCard(state: CampaignState, rival: RivalId, today: ISODate, lines: unknown): RequestCard | undefined {
  const q = requestOf(state, rival, today)
  if (!q) return undefined
  const f = facts(q)
  const words = said(lines, rival, q.kind, f)
  const granted = `Granted: ${signed(Q.demand.granted)} Respect`
  const until = factText(q.until)
  const refused = `Refused, or unanswered by ${until}: ${signed(Q.demand.refused)} Respect, and ${actsOn(q)}.`
  const promise = `you promise to leave ${f.hex} alone for ${Q.spareDays} days, and an assault on it breaks your word as a refusal would`
  const base = { rival, kind: q.kind, title: TITLES[q.kind], until, ...(words ? { words } : {}) }
  switch (q.kind) {
    case 'dare':
      return { ...base, asks: `${dareHabit(rival)}, through ${until}.`, rule: `Met when the week closes: ${signed(Q.dare.met)} Respect. Missed: ${signed(Q.dare.missed)}. Nothing to answer.` }
    case 'itemOffer': {
      const usual = itemOffer(withWorld(state, { requests: [] }), q.itemId as string).cost
      return { ...base, asks: `${f.item} for ${f.price} (the Armory asks ${amount(usual)}).`, rule: `Bought: ${signed(Q.demand.granted)} Respect, and the item goes to your stash. Declined, or unanswered by ${until}: the offer lapses.`, grantLabel: `Buy for ${f.price}`, refuseLabel: 'Decline' }
    }
    case 'hexOffer': {
      const hex = state.hexes.find((h) => h.id === q.hexId)
      const usual = hex ? amount(buyPrice(state, rival, hex)) : undefined
      return { ...base, asks: `${f.hex} for ${f.price}${usual ? ` (a trade would ask ${usual})` : ''}.`, rule: `Bought: ${signed(Q.demand.granted)} Respect, and the hex is yours. Declined, or unanswered by ${until}: the offer lapses.`, grantLabel: `Buy for ${f.price}`, refuseLabel: 'Decline' }
    }
    case 'liftSiege':
      return { ...base, asks: `Lift your siege of ${f.hex}.`, rule: `${granted}, the siege is lifted, and ${promise}. ${refused}`, grantLabel: 'Lift the siege', refuseLabel: 'Refuse' }
    case 'spareHex':
      return { ...base, asks: `Leave ${f.hex} alone for ${Q.spareDays} days.`, rule: `${granted}, and ${promise}. ${refused}`, grantLabel: 'Leave it alone', refuseLabel: 'Refuse' }
    case 'toll':
      return { ...base, asks: `A toll of ${f.price}.`, rule: `${granted}. ${refused}`, grantLabel: `Pay ${f.price}`, refuseLabel: 'Refuse' }
  }
}

/** What `rival` says when the player grants or refuses his request (his `granted` and `refused` lines), if the file has it. */
export function requestReply(rival: RivalId, answer: 'grant' | 'refuse', lines: unknown): string | undefined {
  return said(lines, rival, answer === 'grant' ? 'granted' : 'refused')
}

/** The promises the player keeps to `rival` on `today`, in plain words. */
export function promiseLines(state: CampaignState, rival: RivalId, today: ISODate): string[] {
  return promisesOn(state, today)
    .filter((q) => q.rival === rival)
    .map((q) => `You promised to leave ${hexName(q.hexId as string)} alone through ${factText(q.until)}.`)
}

/** His court's line while a request of his waits or a promise to him stands. */
export function requestNote(state: CampaignState, rival: RivalId, today: ISODate): string | undefined {
  const q = requestOf(state, rival, today)
  const open = q ? (q.kind === 'dare' ? `His dare stands through ${factText(q.until)}.` : `His ${isDemand(q) ? 'demand' : 'offer'} awaits your answer in his Audience, by ${factText(q.until)}.`) : undefined
  const words = [...(open ? [open] : []), ...promiseLines(state, rival, today)]
  return words.length > 0 ? words.join(' ') : undefined
}

/** Patch 8 (R1): what an assault on `hexId` on `date` breaks, if it is promised to a ruler. */
export function promiseBreaks(state: CampaignState, hexId: string, date: ISODate): string | undefined {
  const q = promisesOn(state, date).find((x) => x.hexId === hexId)
  return q ? `This assault breaks your promise to ${rivalName(q.rival)} (${signed(Q.demand.refused)} Respect, and ${actsOn(q)}).` : undefined
}

/** Why the player can't answer a request just now, in plain words (`answerRequest`'s refusal). */
export function requestRefusalText(code: string | undefined): string {
  switch (code) {
    case 'reputation':
      return 'Not enough Reputation in the purse for that.'
    case 'gone':
      return 'That is no longer his to offer.'
    case 'noRequest':
    case 'dare':
      return 'He asks nothing of you to answer now.'
    case 'campaignOver':
      return 'The campaign is over.'
    default:
      return 'That cannot be bought now.'
  }
}
