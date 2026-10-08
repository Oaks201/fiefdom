/**
 * View models for the Armory and the Milestone card (T16; Ch 9 "Milestones", Appendix C "Items",
 * "Wings", "Elite companies", A-21, A-128): items by rank, the stash and each company's slots, the
 * Wing choices, the Elites and the Sworn.
 *
 * Pillar 7 (discovery): a locked rank, Wing wave or Elite hall shows only the Milestone number that
 * opens it, never what it holds; the Milestone card lists only what its own Milestone opens.
 */
import { armoryOf, chooseWing, heldItems, itemOffer, milestoneUnlocks, promoteElite, rankMilestone, recruitElite, slotsFor } from '../armory'
import { CODEX, type ItemRank } from '../codex'
import { milestoneBroken, realmEffects } from '../effects'
import { RULES } from '../rules'
import { roster } from '../roster'
import { openDayOf } from '../state'
import { t, type TextFacts } from '../text'
import type { BuildingId, CampaignState, Effects, ISODate, Tag } from '../types'
import { effectText } from './battle'
import { buildingName, companyArt } from './realm'
import { amount, armoryRefusalLabel } from './refusals'

const UNLOCKS = RULES.milestones.unlocks
const RANKS: readonly Exclude<ItemRank, 'trophy'>[] = ['I', 'II', 'III', 'legendary']
const RANK_NAMES: Record<ItemRank, string> = { I: 'Rank I', II: 'Rank II', III: 'Rank III', legendary: 'Legendary', trophy: 'Trophies' }
const TAGS: readonly Tag[] = ['steel', 'coin', 'arcane', 'engine']

type AnyEffect = Parameters<typeof effectText>[0]

export interface Offer {
  ok: boolean
  cost: number
  reason?: { code: string; label: string }
}

export interface ItemCard {
  id: string
  name: string
  art: string
  /** Its description slot (`items.<id>`) and words. */
  textId: string
  text: string
  /** How many the realm holds (in the stash or carried). */
  held: number
  offer: Offer
}

export interface RankView {
  rank: Exclude<ItemRank, 'trophy'>
  name: string
  milestone: number
  open: boolean
  /** Only once open: what it sells. */
  items?: ItemCard[]
}

export interface CompanySlots {
  id: string
  name: string
  art: string
  power: number
  slots: number
  items: { id: string; name: string }[]
  armorer: boolean
}

export interface WingOption {
  id: string
  name: string
  text: string
  chosen: boolean
  /** It can be chosen now (its pair is still open). */
  available: boolean
  reason?: { code: string; label: string }
}

export interface WingWave {
  wave: number
  milestone: number
  open: boolean
  /** Only once open: each building's pair. */
  buildings?: { building: BuildingId; name: string; options: WingOption[] }[]
}

export interface EliteCard {
  id: string
  name: string
  art: string
  building: string
  tags: string[]
  reach: string
  power: [number, number]
  ability: string
  textId: string
  text: string
  rank: 0 | 1 | 2
  recruit?: Offer
  promote?: Offer
}

export interface ArmoryView {
  /** The Armory opens with Milestone 1. */
  open: boolean
  opensAt: number
  ranks: RankView[]
  /** Trophies the realm holds (won, never sold). */
  trophies: { id: string; name: string; text: string }[]
  stash: { id: string; name: string }[]
  companies: CompanySlots[]
  /** The Armorer Wing's third slot, when built. */
  armorer?: { company?: string }
  wings: WingWave[]
  elites: { open: boolean; milestone: number; rankIIMilestone: number; cards?: EliteCard[] }
  sworn: { open: boolean; milestone: number; tags?: string[]; tagCount: number; choices?: Tag[] }
}

function offerOf(o: { ok: boolean; cost: number; reason?: Parameters<typeof armoryRefusalLabel>[0] }): Offer {
  return { ok: o.ok, cost: o.cost, ...(o.ok || !o.reason ? {} : { reason: { code: o.reason.code, label: armoryRefusalLabel(o.reason) } }) }
}

function itemName(id: string): string {
  return CODEX.items.find((i) => i.id === id)?.name ?? id
}

/** The Armory as the player may see it (Ch 9, Appendix C), locked parts named only by their Milestone. */
export function armoryView(state: CampaignState, today: ISODate = openDayOf(state), effects: Effects = realmEffects(state)): ArmoryView {
  const armory = armoryOf(state)
  const held = heldItems(state)
  const count = (id: string): number => held.filter((x) => x === id).length
  const ranks: RankView[] = RANKS.map((rank) => {
    const milestone = rankMilestone(rank) as number
    const open = milestoneBroken(state, milestone)
    return {
      rank,
      name: RANK_NAMES[rank],
      milestone,
      open,
      ...(open
        ? {
            items: CODEX.items
              .filter((i) => i.rank === rank)
              .map((i) => ({ id: i.id, name: i.name, art: `item.${i.id}`, textId: `items.${i.id}`, text: t(`items.${i.id}`), held: count(i.id), offer: offerOf(itemOffer(state, i.id, effects)) }))
          }
        : {})
    }
  })
  const trophies = CODEX.items.filter((i) => i.rank === 'trophy' && held.includes(i.id)).map((i) => ({ id: i.id, name: i.name, text: t(`items.${i.id}`) }))
  const army = roster(state, { day: today }, effects)
  const companies: CompanySlots[] = army
    .filter((c) => state.roster.some((s) => s.id === c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      art: companyArt(state, c.id, c.source),
      power: c.power,
      slots: slotsFor(state, c.id, effects),
      items: c.items.map((id) => ({ id, name: itemName(id) })),
      armorer: armory.armorerCompany === c.id
    }))
  const wings: WingWave[] = UNLOCKS.wings.map((milestone, i) => {
    const wave = i + 1
    const open = milestoneBroken(state, milestone)
    if (!open) return { wave, milestone, open }
    const buildings = [...new Set(CODEX.wings.filter((w) => w.wave === wave).map((w) => w.building as BuildingId))].map((building) => {
      const pair = CODEX.wings.filter((w) => w.wave === wave && w.building === building)
        return {
        building,
        name: buildingName(building),
        options: pair.map((w) => {
          // The engine's own check, run and discarded: chooseWing is pure.
          const tried = chooseWing(state, w.id, today)
          return {
            id: w.id,
            name: w.name,
            text: w.effects.map((e) => effectText(e as unknown as AnyEffect)).join('; '),
            chosen: armory.wings.includes(w.id),
            available: tried.ok,
            ...(tried.ok || !tried.reason ? {} : { reason: { code: tried.reason.code, label: armoryRefusalLabel(tried.reason) } })
          }
        })
      }
    })
    return { wave, milestone, open, buildings }
  })
  const elitesOpen = milestoneBroken(state, UNLOCKS.elites)
  const eliteCards: EliteCard[] = CODEX.elites.map((e) => {
    const mine = armory.elites.find((x) => x.id === e.id)
    const rank = (mine?.rank ?? 0) as 0 | 1 | 2
    const card: EliteCard = {
      id: e.id,
      name: e.name,
      art: `portrait.${e.id}`,
      building: buildingName(e.building as BuildingId),
      tags: [...e.tags],
      reach: e.reach,
      power: [e.power[0], e.power[1]],
      ability: e.ability.map((x) => effectText(x as unknown as AnyEffect)).join('; '),
      textId: `units.${e.id}`,
      text: t(`units.${e.id}`),
      rank
    }
    // The engine's own checks, run and discarded: the Armory actions are pure.
    if (rank === 0) card.recruit = offerOf({ ...recruitElite(state, e.id, today), cost: RULES.armory.elite.recruitCost })
    else if (rank === 1) card.promote = offerOf({ ...promoteElite(state, e.id, today), cost: RULES.armory.elite.rankIICost })
    return card
  })
  const swornOpen = milestoneBroken(state, UNLOCKS.sworn)
  return {
    open: milestoneBroken(state, UNLOCKS.armory),
    opensAt: UNLOCKS.armory,
    ranks,
    trophies,
    stash: armory.stash.map((id) => ({ id, name: itemName(id) })),
    companies,
    ...(effects.extraItemSlots.value > 0 ? { armorer: armory.armorerCompany ? { company: armory.armorerCompany } : {} } : {}),
    wings,
    elites: { open: elitesOpen, milestone: UNLOCKS.elites, rankIIMilestone: UNLOCKS.eliteRankII, ...(elitesOpen ? { cards: eliteCards } : {}) },
    sworn: {
      open: swornOpen,
      milestone: UNLOCKS.sworn,
      tagCount: CODEX.sworn.tagCount,
      ...(armory.sworn ? { tags: [...armory.sworn.tags] } : swornOpen ? { choices: [...TAGS] } : {})
    }
  }
}

// ── The Milestone card (Ch 9, Ch 17 "Big moments") ───────────────────────────

const PERCENT = 100 // rules-ok: shares shown as percentages

/** What each unlock key opens, in plain words (Ch 9's table). */
export function unlockLabel(key: string): string {
  const b = RULES.milestones.boons
  const [name, wave] = key.split(':')
  switch (name) {
    case 'armory':
      return 'The Armory: every company can carry one item'
    case 'rankIItems':
      return 'Rank I items for sale'
    case 'wings':
      return wave === '1' ? 'The first Wings: one of two for each building' : wave === '2' ? 'The second Wings' : 'The third Wings'
    case 'elites':
      return 'Elite companies, rank I, one in each building'
    case 'provingGrounds':
      return `The Proving Grounds: all companies +${Math.round(b.provingGroundsPower * PERCENT)}%`
    case 'secondItemSlot':
      return 'A second item slot'
    case 'rankIIItems':
      return 'Rank II items'
    case 'healingSprings':
      return `The Healing Springs: rally floor +${Math.round(RULES.combat.rallyFloor.healingSprings * PERCENT)}%, Respite bank +${RULES.respite.healingSpringsBonus}`
    case 'tierV':
      return 'Tier V becomes possible'
    case 'eliteRankII':
      return 'Elites to rank II'
    case 'sworn':
      return 'The Sworn, the lord’s own retinue'
    case 'rankIIIItems':
      return 'Rank III items'
    case 'crownForge':
      return `The Crown Forge: +${b.crownForgeBanners} banner`
    case 'legendaryItems':
      return 'Legendary items, one for each building'
    case 'statue':
      return `The Sovereign’s Statue: +${Math.round(b.statueReputation * PERCENT)}% reputation and the title “the Steadfast”`
    case 'crownguardAscendant':
      return 'The Crownguard Ascendant'
    default:
      return key
  }
}

export interface MilestoneCard {
  index: number
  slot: string
  titleId: string
  bodyId: string
  facts: TextFacts
  /** What this Milestone opens, and only that. */
  unlocks: string[]
}

/** The full-screen card for Milestone `index` (Ch 9, Ch 17): its words and only its own unlocks. */
export function milestoneCard(index: number, facts: TextFacts): MilestoneCard {
  return { index, slot: `milestone.${index}`, titleId: 'herald.milestone', bodyId: `milestones.m${index}`, facts: { index, ...facts }, unlocks: milestoneUnlocks(index).map(unlockLabel) }
}

/** A price as the Armory prints it. */
export const price = amount
