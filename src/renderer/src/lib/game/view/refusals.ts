/**
 * Plain words for the engine's refusals (T15): each code and its facts as one short interface
 * line, so a screen can say why a button is off without re-deriving the rule. These are interface
 * labels, not story text (A-46); deal refusals have their own catalog slots
 * (`herald.deal.refused.*`) and are not worded here.
 */
import type { ArmoryRefusal } from '../armory'
import type { Refusal, Requirement } from '../buildings'
import { CODEX } from '../codex'
import type { OrderProblem } from '../combat'
import { numeral } from '../effects'
import type { BribeRefusal, HoldRefusal } from '../goblin'
import type { GrandRefusal } from '../grand'
import type { LandRefusal } from '../land'
import { hexName } from '../map'
import type { SkirmishRefusal } from '../skirmish'
import type { BendRefusal } from '../surges'
import type { RivalId } from '../types'

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** A number as the screens print it: thousands separated, at most one decimal. */
export function amount(n: number): string {
  return nf.format(n)
}

const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** A multiplier or share as the rules state it, to two decimals (×1.25). */
export function factor(n: number): string {
  return nf2.format(n)
}

/** The purse as the player sees it: whole, rounded down (A-11). */
function purse(n: number): string {
  return nf.format(Math.floor(n))
}

function rival(id: RivalId): string {
  return CODEX.rivals.find((r) => r.id === id)?.shortName ?? id
}

function building(id: string): string {
  return CODEX.buildings.find((b) => b.id === id)?.name ?? id
}

/** Why a courtship, fortification or reclaim is refused. */
export function landRefusalLabel(r: LandRefusal): string {
  switch (r.code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'unknownHex':
      return 'There is no such hex.'
    case 'notCourtable':
      return 'Only a village touching your land, held by someone else, can be courted.'
    case 'alreadyCourting':
      return 'You are already courting this village.'
    case 'noSlot':
      return `All ${r.have ?? 0} courtship slots are in use.`
    case 'badBid':
      return 'A bid must be more than nothing.'
    case 'reputation':
      return `It costs ${amount(r.needed ?? 0)}; the purse holds ${purse(r.have ?? 0)}.`
    case 'notPlayerHex':
      return 'You do not hold this hex.'
    case 'notClaimable':
      return 'This hex never changes hands.'
    case 'maxed':
      return 'It is already at its highest level.'
    case 'grace':
      return `Reclaiming needs the Crown’s Grace at level ${numeral(r.needed ?? 1)}.`
    case 'notLost':
      return 'You have not lost this hex.'
    case 'tooLate':
      return `It was lost ${r.have ?? 0} days ago; a hex can be reclaimed for ${r.needed ?? 0} days.`
    case 'notTouching':
      return 'It no longer touches your land.'
    case 'pact':
      return 'A buy-off pact holds: you have agreed to leave the Goblin’s march alone for now.'
  }
}

/** Why a building tier, castle tier or Crossing stage can't be bought. */
export function buyRefusalLabel(r: Refusal): string {
  switch (r.code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'maxed':
      return 'It is at its highest tier.'
    case 'reputation':
      return `It costs ${amount(r.needed)}; the purse holds ${purse(r.have)}.`
    default:
      return `Needs ${requirementLabel(r)}.`
  }
}

/** A requirement as a short noun phrase ("Dominion 8 (6 now)"). */
export function requirementLabel(r: Refusal): string {
  switch (r.code) {
    case 'dominion':
      return `Dominion ${amount(r.needed)} (${amount(r.have)} now)`
    case 'reputation':
      return `${amount(r.needed)} reputation`
    case 'milestone':
      return `Milestone ${r.index} broken`
    case 'tierSum':
      return `building tiers summing to ${r.needed} (${r.have} now)`
    case 'buildingTier':
      return `the ${building(r.building)} at Tier ${numeral(r.needed)}`
    case 'campaignOver':
      return 'a campaign still running'
    case 'maxed':
      return 'nothing more'
  }
}

/** Every requirement of an offer, worded, with whether it is met. */
export function requirementLines(requirements: readonly Requirement[] | undefined): { code: Refusal['code']; label: string; met: boolean }[] {
  return (requirements ?? []).map((r) => ({ code: r.need.code, label: requirementLabel(r.need), met: r.met }))
}

/** What is wrong with the day's orders. */
export function orderProblemLabel(p: OrderProblem): string {
  switch (p.code) {
    case 'unknownCompany':
      return 'A company in the orders is no longer on the roster.'
    case 'bothPools':
      return 'A company cannot both defend and assault.'
    case 'companyInTwoAssaults':
      return 'A company can go on only one assault.'
    case 'tooManyAssaults':
      return p.allowed === 1 ? 'Only one assault a day.' : `Only ${p.allowed} assaults a day.`
    case 'unknownHex':
      return 'There is no such hex.'
    case 'grandBattleRequired':
      return `${hexName(p.hexId)} is taken only in a Grand Battle.`
    case 'notClaimable':
      return `${hexName(p.hexId)} cannot be assaulted: it must touch your land, and the heartland never falls to anyone else.`
    case 'barredByStronghold':
      return `${hexName(p.stronghold)} still stands: no assault reaches deeper into its march until it falls.`
    case 'grandBattlePending':
      return `A Grand Battle is announced at ${hexName(p.hexId)}; no assault goes there until it is fought.`
    case 'pact':
      return `A buy-off pact holds: ${hexName(p.hexId)} lies in the Goblin’s march, which you have agreed to leave alone for now.`
    case 'duplicateTarget':
      return `${hexName(p.hexId)} is already a target.`
    case 'noCompanies':
      return `No company is sent against ${hexName(p.hexId)}.`
    case 'tooManyCompanies':
      return `At most ${p.banners} companies ${p.pool === 'assault' ? 'on an assault' : 'defend'}; the rest stay out.`
    case 'overrideNotDefending':
      return 'A chosen defender is on an assault.'
    case 'hiredUnavailable':
      return 'Hired blades need the Merchant Hall at Tier II.'
    case 'envoyUnavailable':
      return `${rival(p.rival)} sends an envoy only at Respect 50.`
    case 'cannotAfford':
      return `Hired help costs ${amount(p.needed)} a battle; the purse holds ${purse(p.have)}.`
    case 'ordersLocked':
      return 'Today’s battles have begun, so the orders hold until the day’s close.'
  }
}

/** Why a Grand Battle can't be called (`challenge`). */
export function grandRefusalLabel(code: GrandRefusal): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'unknownHex':
      return 'There is no such hex.'
    case 'notTouching':
      return 'It must touch your land.'
    case 'notGrandBattleHex':
      return 'Only a Gate, a capital, a Lair Mouth or a stronghold is fought for in a Grand Battle.'
    case 'barred':
      return 'A stronghold nearer the heartland still stands in this march; it must fall first.'
    case 'alreadyAnnounced':
      return 'A battle there is already announced.'
    case 'retryTooSoon':
      return 'The last battle there was lost too recently to try again yet.'
    case 'gateNotHeld':
      return 'The capital can be attacked only once you hold its Gate.'
    case 'pacing':
      return 'The realm’s Dominion has not reached the mark for another rival yet.'
    case 'cooldown':
      return 'Too soon after the last battle with this rival.'
    case 'rivalResolved':
      return 'That rival is already resolved.'
    case 'noHost':
      return 'No host stands there to fight.'
    default:
      return 'It cannot be done now.'
  }
}

/** Why a daily skirmish action is refused (D-12). */
export function skirmishRefusalLabel(code: SkirmishRefusal | undefined): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'notToday':
      return 'Only today’s battles can be fought; this day is closed.'
    case 'started':
      return 'Today’s battles have already begun.'
    case 'noFights':
      return 'No battle can be led today.'
    case 'unknownFight':
      return 'That battle is not on today’s roll.'
    case 'fought':
      return 'That battle is already fought.'
    case 'reputation':
      return 'The purse cannot pay for another hired company.'
    case 'notStarted':
      return 'Today’s battles haven’t begun.'
    case 'opened':
      return 'A battle is already opened, so the start can’t be taken back.'
    case 'veiled':
      return 'Under the Veil of Fog the start can’t be taken back.'
    default:
      return 'It cannot be done now.'
  }
}

/** Why an Armory action is refused (T16). */
export function armoryRefusalLabel(r: ArmoryRefusal): string {
  switch (r.code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'milestone':
      return `It opens at Milestone ${r.index}.`
    case 'unknown':
      return 'There is no such thing in the Armory.'
    case 'trophy':
      return 'Trophies are won in Mythic Hunts, never sold.'
    case 'unique':
      return 'Only one can be held.'
    case 'reputation':
      return `It costs ${amount(r.needed)}; the purse holds ${purse(r.have)}.`
    case 'notInStash':
      return 'That item is not in the stash.'
    case 'unknownCompany':
      return 'That company is not on the roster.'
    case 'slots':
      return `Every item slot is full (${r.slots}).`
    case 'notEquipped':
      return 'That company does not carry it.'
    case 'wingTaken':
      return 'The other Wing of this pair was chosen, for good.'
    case 'alreadyChosen':
      return 'This Wing is already built.'
    case 'recruited':
      return 'Already recruited.'
    case 'notRecruited':
      return 'Recruit it first.'
    case 'maxRank':
      return 'Already at rank II.'
    case 'swornDone':
      return 'The Sworn have already taken their oath.'
    case 'tags':
      return `Choose exactly ${r.count} different tags.`
    case 'noArmorer':
      return 'The third slot needs the Armorer Wing.'
  }
}

/** Why a hex of the Goblin's march can't be bribed (D-29). */
export function bribeRefusalLabel(code: BribeRefusal, price?: number): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'unknownHex':
      return 'There is no such hex.'
    case 'notHisMarch':
      return 'Only the hexes of the Goblin’s march take bribes.'
    case 'gate':
      return 'His Gate is fought for in a Grand Battle, never bought.'
    case 'notAssaultable':
      return 'Only a hex you could assault today takes a bribe.'
    case 'battlePending':
      return 'A Grand Battle is announced there.'
    case 'pact':
      return 'A buy-off pact holds: you have agreed to leave the Goblin’s march alone for now.'
    case 'reputation':
      return price !== undefined ? `It costs ${amount(price)}; the purse cannot pay it.` : 'The purse cannot pay it.'
  }
}

/** Why the player can't hold a village the Goblin bids for (D-29). */
export function holdRefusalLabel(code: HoldRefusal): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'noBid':
      return 'The Goblin bids for no village of yours here.'
    case 'badAmount':
      return 'Hold it with a whole amount of reputation.'
    case 'reputation':
      return 'The purse cannot pay it.'
  }
}

/** Why tomorrow's surge can't be bent (D-31, the Archmage's path at rank V). */
export function bendRefusalLabel(code: BendRefusal): string {
  switch (code) {
    case 'campaignOver':
      return 'The campaign is over.'
    case 'rank':
      return 'It opens at rank V on the Archmage’s path.'
    case 'noSwell':
      return 'Only a swell foreseen for tomorrow can be bent.'
    case 'used':
      return 'A surge was bent less than a week ago.'
  }
}
