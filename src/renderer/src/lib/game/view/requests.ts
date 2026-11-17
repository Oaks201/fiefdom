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
import { commissionProgress, commissionStands, isDemand, requestOf } from '../requests'
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
  /** A commission: how far the week's deeds have come. */
  progress?: string
  /** The buttons: none for a dare, which is never answered, or a commission already in force. */
  grantLabel?: string
  refuseLabel?: string
}

const TITLES: Record<RequestKind, string> = { dare: 'His dare', itemOffer: 'His offer', hexOffer: 'His offer', liftSiege: 'His demand', spareHex: 'His demand', toll: 'His demand', commission: 'His commission' }

/** What `rival`'s commission asks for (stage 3, R1): `need` deeds of his craft, in plain terms. */
export function commissionAsks(rival: RivalId, need: number): string {
  switch (rival) {
    case 'orc':
      return `${need} days in his field: a day with a battle against him or in his march, won or lost`
    case 'dwarf':
      return `${need} wall levels raised on hexes of yours (a level counts once for each hex)`
    case 'goblin':
      return 'A hex won by coin: a bribe, a courtship or a trade, in any march'
    case 'archmage':
      return 'One of these: a hex of his march taken on its ebb, a surge strike of his held, or a mythic beaten'
  }
}

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
    case 'commission': {
      const C = Q.commission
      const need = q.need ?? C.one
      const done = Math.min(need, commissionProgress(state, q))
      const pays = `${C.renown} Renown on his path`
      const card = { ...base, asks: `${commissionAsks(rival, need)}, by ${until}.`, progress: `So far: ${done} of ${need}.` }
      // R2: sent by a ruler below 0, it is a demand, in force without being taken up.
      if (q.demand) return { ...card, title: 'His demand', rule: `Met by ${until}: ${signed(Q.demand.granted)} Respect and ${pays}, at the close of the day it is met. Refused or unmet: ${signed(Q.demand.refused)} Respect.`, grantLabel: 'Leave it standing', refuseLabel: 'Refuse' }
      if (commissionStands(q)) return { ...card, title: 'His commission, taken up', rule: `Met by ${until}: ${signed(C.met)} Respect and ${pays}, at the close of the day it is met. Unmet: ${signed(C.missed)} Respect.` }
      return { ...card, rule: `Taken up and met: ${signed(C.met)} Respect and ${pays}, at the close of the day it is met. Taken up and unmet: ${signed(C.missed)} Respect. Declined, or unanswered by ${until}: nothing. Deeds done this week before you take it up count.`, grantLabel: 'Take it up', refuseLabel: 'Decline' }
    }
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
  const standing = q && (q.kind === 'dare' || commissionStands(q))
  const open = q ? (standing ? `His ${q.kind === 'dare' ? 'dare' : q.demand ? 'demand' : 'commission'} stands through ${factText(q.until)}.` : `His ${q.kind === 'commission' ? 'commission' : isDemand(q) ? 'demand' : 'offer'} awaits your answer in his Audience, by ${factText(q.until)}.`) : undefined
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
    case 'accepted':
      return 'It already stands: there is nothing more to answer.'
    case 'noRequest':
    case 'dare':
      return 'He asks nothing of you to answer now.'
    case 'campaignOver':
      return 'The campaign is over.'
    default:
      return 'That cannot be bought now.'
  }
}
