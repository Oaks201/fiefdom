/**
 * The Armory (Ch 9 "Milestones" unlock table, Appendix C "Items", "Wings", "Elite companies",
 * A-21, A-128, A-156): what each Milestone opens, buying and equipping items, the Wing choices,
 * Elites and their rank II, the Sworn, and trophies.
 *
 * Each action returns `{ ok, reason?, state, cost }` like `buildings.ts`: an offer that says why
 * not, and the change with its `spend` and an `armory` event. Unlocks follow broken Milestones,
 * which are never revoked (Ch 9 rule 6), so nothing here is ever taken back by the scale.
 *
 * `state.armory` holds the Wings, Elites, the Sworn, the stash and the Armorer's company; items
 * equipped live on each company's `items` in `state.roster`. `refreshRoster` runs after every
 * change to the army.
 */
import { CODEX, type ItemRank } from './codex'
import { balance, roundPosting, spend } from './economy'
import { milestoneBroken, realmEffects } from './effects'
import { RULES } from './rules'
import { refreshRoster } from './roster'
import { EventBuffer, isPlayable, openDayOf } from './state'
import type { ArmoryState, CampaignState, Effects, ISODate, Tag } from './types'

const UNLOCKS = RULES.milestones.unlocks
const TAGS: readonly Tag[] = ['steel', 'coin', 'arcane', 'engine']

export type ArmoryRefusal =
  | { code: 'campaignOver' }
  /** Not yet: this Milestone opens it. */
  | { code: 'milestone'; index: number }
  | { code: 'unknown' }
  /** Trophies are never sold (Appendix C). */
  | { code: 'trophy' }
  /** A Legendary item or a trophy is unique, and one is already held. */
  | { code: 'unique' }
  | { code: 'reputation'; needed: number; have: number }
  | { code: 'notInStash' }
  | { code: 'unknownCompany' }
  /** The company's item slots are full. */
  | { code: 'slots'; slots: number }
  | { code: 'notEquipped' }
  /** The other Wing of that pair was chosen, permanently. */
  | { code: 'wingTaken'; wing: string }
  | { code: 'alreadyChosen' }
  | { code: 'recruited' }
  | { code: 'notRecruited' }
  | { code: 'maxRank' }
  | { code: 'swornDone' }
  | { code: 'tags'; count: number }
  /** The Armorer's third slot needs the Armorer Wing. */
  | { code: 'noArmorer' }

export interface ArmoryAction {
  ok: boolean
  reason?: ArmoryRefusal
  state: CampaignState
  cost: number
}

function no(state: CampaignState, reason: ArmoryRefusal, cost = 0): ArmoryAction {
  return { ok: false, reason, state, cost }
}

export function armoryOf(state: CampaignState): ArmoryState {
  return state.armory ?? { wings: [], elites: [], stash: [] }
}

function withArmory(state: CampaignState, armory: ArmoryState): CampaignState {
  return { ...state, armory }
}

/** Posts an Armory action's `spend` (if any) and its event, dated `today`. */
function done(next: CampaignState, today: ISODate, cost: number, event: { action: 'buy' | 'equip' | 'unequip' | 'wing' | 'recruit' | 'promote' | 'sworn' | 'armorer'; id: string; companyId?: string }, source: string): ArmoryAction {
  const events = new EventBuffer()
  const paid = cost > 0 ? { ...next, purse: spend(next.purse, today, cost, source) } : next
  events.emitter(today)('armory', { ...event, ...(cost > 0 ? { cost: roundPosting(cost) } : {}) })
  return { ok: true, state: events.flush(paid), cost: roundPosting(cost) }
}

function checkCommon(state: CampaignState, milestone: number): ArmoryRefusal | null {
  if (!isPlayable(state)) return { code: 'campaignOver' }
  if (!milestoneBroken(state, milestone)) return { code: 'milestone', index: milestone }
  return null
}

function afford(state: CampaignState, cost: number): ArmoryRefusal | null {
  const have = balance(state.purse)
  return roundPosting(cost) > have ? { code: 'reputation', needed: roundPosting(cost), have } : null
}

// ── What each Milestone opens (Ch 9) ─────────────────────────────────────────

/**
 * What Milestone `index` opens, and only that (for T16's Milestone card): the keys of
 * `RULES.milestones.unlocks` naming it, with each Wing wave as `wings:<wave>`.
 */
export function milestoneUnlocks(index: number): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(UNLOCKS)) {
    if (Array.isArray(value)) value.forEach((m, i) => m === index && out.push(`${key}:${i + 1}`))
    else if (value === index) out.push(key)
  }
  return out
}

/** The Milestone that opens an item rank; trophies are never sold (null). */
export function rankMilestone(rank: ItemRank): number | null {
  switch (rank) {
    case 'I':
      return UNLOCKS.rankIItems
    case 'II':
      return UNLOCKS.rankIIItems
    case 'III':
      return UNLOCKS.rankIIIItems
    case 'legendary':
      return UNLOCKS.legendaryItems
    case 'trophy':
      return null
  }
}

// ── Items ────────────────────────────────────────────────────────────────────

/** Every item the player holds: in the stash or equipped on a company. */
export function heldItems(state: CampaignState): string[] {
  return [...armoryOf(state).stash, ...state.roster.flatMap((c) => c.items)]
}

function isUnique(rank: ItemRank): boolean {
  return rank === 'legendary' || rank === 'trophy'
}

export interface ItemOffer {
  ok: boolean
  reason?: ArmoryRefusal
  /** The price after the Great Forge (and T12's Merchant Caravan), as it would post. */
  cost: number
}

/** The Merchant Caravan's discount on `itemId` on `day` (T12, Appendix C): 0 unless it offers that item then. */
export function caravanDiscount(state: CampaignState, itemId: string, day: ISODate): number {
  for (const ev of state.worldEvents) {
    const held = ev.data as { from?: string; until?: string; item?: string } | null
    if (ev.id !== 'merchantCaravan' || held?.item !== itemId || !held.from || !held.until || day < held.from || day > held.until) continue
    const discount = CODEX.events.find((x) => x.id === ev.id)?.effect.discount
    if (typeof discount === 'number') return discount
  }
  return 0
}

/** An item's price and whether it can be bought now (Appendix C "Items"): the Great Forge and the Merchant Caravan discount it. */
export function itemOffer(state: CampaignState, itemId: string, effects: Effects = realmEffects(state)): ItemOffer {
  const item = CODEX.items.find((i) => i.id === itemId)
  if (!item) return { ok: false, reason: { code: 'unknown' }, cost: 0 }
  const milestone = rankMilestone(item.rank)
  if (milestone === null || item.cost === null) return { ok: false, reason: { code: 'trophy' }, cost: 0 }
  const cost = roundPosting(item.cost * effects.costs.items.value * (1 - caravanDiscount(state, itemId, openDayOf(state))))
  const problem = checkCommon(state, milestone) ?? (isUnique(item.rank) && heldItems(state).includes(itemId) ? { code: 'unique' as const } : null) ?? afford(state, cost)
  return problem ? { ok: false, reason: problem, cost } : { ok: true, cost }
}

/** Buys an item into the stash. */
export function buyItem(state: CampaignState, itemId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  const offer = itemOffer(state, itemId)
  if (!offer.ok) return no(state, offer.reason as ArmoryRefusal, offer.cost)
  const armory = armoryOf(state)
  return done(withArmory(state, { ...armory, stash: [...armory.stash, itemId] }), today, offer.cost, { action: 'buy', id: itemId }, `item:${itemId}`)
}

/** A company's item slots: 1 from Milestone 1, 2 from Milestone 4, +1 for the Armorer's company. */
export function slotsFor(state: CampaignState, companyId: string, effects: Effects = realmEffects(state)): number {
  const extra = armoryOf(state).armorerCompany === companyId ? effects.extraItemSlots.value : 0
  return effects.itemSlots.value + extra
}

/** Equips an item from the stash on a company within its slots. */
export function equipItem(state: CampaignState, companyId: string, itemId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  if (!isPlayable(state)) return no(state, { code: 'campaignOver' })
  const fresh = refreshRoster(state)
  const company = fresh.roster.find((c) => c.id === companyId)
  if (!company) return no(state, { code: 'unknownCompany' })
  const armory = armoryOf(fresh)
  const at = armory.stash.indexOf(itemId)
  if (at < 0) return no(state, { code: 'notInStash' })
  const slots = slotsFor(fresh, companyId)
  if (company.items.length >= slots) return no(state, { code: 'slots', slots })
  const stash = armory.stash.filter((_, i) => i !== at)
  const roster = fresh.roster.map((c) => (c.id === companyId ? { ...c, items: [...c.items, itemId] } : c))
  return done(refreshRoster({ ...withArmory(fresh, { ...armory, stash }), roster }), today, 0, { action: 'equip', id: itemId, companyId }, '')
}

/** Takes an item off a company, back to the stash. */
export function unequipItem(state: CampaignState, companyId: string, itemId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  if (!isPlayable(state)) return no(state, { code: 'campaignOver' })
  const company = state.roster.find((c) => c.id === companyId)
  if (!company) return no(state, { code: 'unknownCompany' })
  const at = company.items.indexOf(itemId)
  if (at < 0) return no(state, { code: 'notEquipped' })
  const armory = armoryOf(state)
  const roster = state.roster.map((c) => (c.id === companyId ? { ...c, items: c.items.filter((_, i) => i !== at) } : c))
  return done(refreshRoster({ ...withArmory(state, { ...armory, stash: [...armory.stash, itemId] }), roster }), today, 0, { action: 'unequip', id: itemId, companyId }, '')
}

/**
 * Gives the Armorer Wing's third slot to a company. It moves only when the company holding it
 * carries no more than the usual slots, so no item is left stranded.
 */
export function setArmorer(state: CampaignState, companyId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  if (!isPlayable(state)) return no(state, { code: 'campaignOver' })
  const effects = realmEffects(state)
  if (effects.extraItemSlots.value <= 0) return no(state, { code: 'noArmorer' })
  if (!refreshRoster(state).roster.some((c) => c.id === companyId)) return no(state, { code: 'unknownCompany' })
  const armory = armoryOf(state)
  const holder = state.roster.find((c) => c.id === armory.armorerCompany)
  if (holder && holder.id !== companyId && holder.items.length > effects.itemSlots.value) return no(state, { code: 'slots', slots: effects.itemSlots.value })
  return done(withArmory(state, { ...armory, armorerCompany: companyId }), today, 0, { action: 'armorer', id: 'armorer', companyId }, '')
}

// ── Trophies (A-156) ─────────────────────────────────────────────────────────

/** The trophy a Mythic Hunt against `quarry` grants, unless already held. */
export function nextTrophyFor(state: CampaignState, quarry: string | undefined): string | undefined {
  const item = CODEX.items.find((i) => i.rank === 'trophy' && i.quarry === quarry)
  return item && !heldItems(state).includes(item.id) ? item.id : undefined
}

/**
 * The trophy a daily mythic victory (from `lair`'s side) or the Royal Hunt (either lair) grants
 * (A-156): the first one, in codex order, of a quarry that isn't event-only and whose trophy
 * isn't held yet. Undefined when there is none left, or a mythic struck off the lair sides.
 */
export function nextTrophy(held: readonly string[], lair: string | undefined, anyLair: boolean): string | undefined {
  if (!lair && !anyLair) return undefined
  const quarries = CODEX.quarries.filter((q) => !q.eventOnly && (anyLair || q.lair === lair)).map((q) => q.id)
  return CODEX.items.find((i) => i.rank === 'trophy' && i.quarry !== undefined && quarries.includes(i.quarry) && !held.includes(i.id))?.id
}

/** Puts a trophy in the stash. */
export function grantTrophy(state: CampaignState, itemId: string): CampaignState {
  const armory = armoryOf(state)
  return withArmory(state, { ...armory, stash: [...armory.stash, itemId] })
}

// ── Wings ────────────────────────────────────────────────────────────────────

/** Chooses a Wing, permanently: one of two per building in each wave (Milestones 2, 5 and 8). Free. */
export function chooseWing(state: CampaignState, wingId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  const wing = CODEX.wings.find((w) => w.id === wingId)
  if (!wing) return no(state, { code: 'unknown' })
  const problem = checkCommon(state, UNLOCKS.wings[wing.wave - 1])
  if (problem) return no(state, problem)
  const armory = armoryOf(state)
  if (armory.wings.includes(wingId)) return no(state, { code: 'alreadyChosen' })
  const other = CODEX.wings.find((w) => w.building === wing.building && w.wave === wing.wave && w.id !== wingId && armory.wings.includes(w.id))
  if (other) return no(state, { code: 'wingTaken', wing: other.id })
  return done(refreshRoster(withArmory(state, { ...armory, wings: [...armory.wings, wingId] })), today, 0, { action: 'wing', id: wingId }, '')
}

// ── Elites and the Sworn ─────────────────────────────────────────────────────

/** Recruits an Elite company at rank I for 300 (Milestone 3). */
export function recruitElite(state: CampaignState, eliteId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  if (!CODEX.elites.some((e) => e.id === eliteId)) return no(state, { code: 'unknown' })
  const cost = RULES.armory.elite.recruitCost
  const armory = armoryOf(state)
  const problem = checkCommon(state, UNLOCKS.elites) ?? (armory.elites.some((e) => e.id === eliteId) ? { code: 'recruited' as const } : null) ?? afford(state, cost)
  if (problem) return no(state, problem, cost)
  return done(refreshRoster(withArmory(state, { ...armory, elites: [...armory.elites, { id: eliteId, rank: 1 }] })), today, cost, { action: 'recruit', id: eliteId }, `elite:${eliteId}`)
}

/** Raises an Elite to rank II for 600 more (Milestone 7). */
export function promoteElite(state: CampaignState, eliteId: string, today: ISODate = openDayOf(state)): ArmoryAction {
  const cost = RULES.armory.elite.rankIICost
  const armory = armoryOf(state)
  const elite = armory.elites.find((e) => e.id === eliteId)
  const problem =
    checkCommon(state, UNLOCKS.eliteRankII) ?? (!elite ? { code: 'notRecruited' as const } : elite.rank >= 2 ? { code: 'maxRank' as const } : null) ?? afford(state, cost)
  if (problem) return no(state, problem, cost)
  const elites = armory.elites.map((e) => (e.id === eliteId ? { ...e, rank: 2 as const } : e))
  return done(refreshRoster(withArmory(state, { ...armory, elites })), today, cost, { action: 'promote', id: eliteId }, `elite:${eliteId}:rankII`)
}

/** The Sworn join free at Milestone 7, with their two tags chosen once (A-21). */
export function swearSworn(state: CampaignState, tags: readonly Tag[], today: ISODate = openDayOf(state)): ArmoryAction {
  const problem = checkCommon(state, UNLOCKS.sworn)
  if (problem) return no(state, problem)
  const armory = armoryOf(state)
  if (armory.sworn) return no(state, { code: 'swornDone' })
  const chosen = [...new Set(tags)]
  if (chosen.length !== CODEX.sworn.tagCount || chosen.length !== tags.length || !chosen.every((t) => TAGS.includes(t))) {
    return no(state, { code: 'tags', count: CODEX.sworn.tagCount })
  }
  return done(refreshRoster(withArmory(state, { ...armory, sworn: { tags: chosen } })), today, 0, { action: 'sworn', id: CODEX.sworn.id }, '')
}
