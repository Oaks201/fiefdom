/**
 * Enemy hosts for Grand Battles (Ch 11 "Enemy hosts", Ch 14 "Defeat" rule 3, Appendix C "Rival
 * hosts" and "Mythic Hunts", A-29, A-35, A-47), how they stand on the field, and what the Herald
 * may say about them (`hostView`): bands unless the realm reveals the roster.
 */
import { CODEX } from '../codex'
import { armyValue, band, type Band } from '../combat'
import { realmEffects } from '../effects'
import { RULES } from '../rules'
import { hostCompany, hostUnits, playerArmyValue } from '../rivals'
import type { CampaignState, Company, Effects, FieldUnit, GrandBattle, ISODate, Reach, RivalId, SlotKey } from '../types'
import { FILL_ORDER, slotOf } from './field'

const G = RULES.grandBattles

/**
 * A rival's host (A-35): `share` of its Army value on `date` as a power budget. Its commander
 * joins first if the budget covers it; then passes over its list, strongest to weakest, add one
 * company of each type that still fits, until nothing fits or the host has `room` companies.
 */
export function rivalHost(state: CampaignState, rival: RivalId, share: number, date: ISODate, room: number = G.maxCompanies): Company[] {
  const host = CODEX.hosts.find((h) => h.rival === rival)
  if (!host) throw new Error(`The codex has no host for ${rival}`)
  let budget = share * armyValue(state, rival, date)
  const out: Company[] = []
  if (host.commander.power <= budget && out.length < room) {
    out.push(hostCompany(rival, host.commander, out.length + 1))
    budget -= host.commander.power
  }
  const units = hostUnits(rival)
  for (;;) {
    let added = false
    for (const unit of units) {
      if (out.length >= room) return out
      if (unit.power > budget) continue
      out.push(hostCompany(rival, unit, out.length + 1))
      budget -= unit.power
      added = true
    }
    if (!added) return out
  }
}

/** A host from several rivals (a coalition, or a Siege a coalition sends), each sending `share` of its own AV, up to 6 in all. */
export function combinedHost(state: CampaignState, members: readonly RivalId[], share: number, date: ISODate): Company[] {
  const out: Company[] = []
  for (const rival of members) out.push(...rivalHost(state, rival, share, date, G.maxCompanies - out.length))
  return out
}

/** The power each rival sent, from its companies' ids (`<rival>:<unit>:<n>`). */
export function sentBy(enemy: readonly Company[]): Partial<Record<RivalId, number>> {
  const out: Partial<Record<RivalId, number>> = {}
  for (const c of enemy) {
    const rival = foeOf(c)
    if (rival !== 'mythic') out[rival] = (out[rival] ?? 0) + c.power
  }
  return out
}

/** A mythic quarry's fixed roster (Appendix C), scaled by 1 + week ÷ 52. */
export function mythicHost(quarryId: string, week: number): Company[] {
  const quarry = CODEX.quarries.find((q) => q.id === quarryId)
  if (!quarry) throw new RangeError(`No quarry "${quarryId}" in the codex`)
  const scale = 1 + week / G.mythicScaleWeeks
  const out: Company[] = []
  for (const unit of quarry.roster) {
    for (let i = 1; i <= unit.count; i++) {
      out.push({ id: `mythic:${unit.id}:${out.length + 1}`, name: unit.name, source: 'host', power: unit.power * scale, tags: [], reach: unit.reach, items: [] })
    }
  }
  return out
}

/** The side an enemy company fights for, from its id: a rival, or mythic beasts. */
export function foeOf(company: Pick<Company, 'id'>): RivalId | 'mythic' {
  return company.id.slice(0, company.id.indexOf(':')) as RivalId | 'mythic'
}

/** An enemy company's codex unit id, from its id. */
export function unitOf(company: Pick<Company, 'id'>): string {
  const parts = company.id.split(':')
  return parts[1] ?? ''
}

/** An enemy company's starting health: 4 × p, or its quarry's multiple (A-47). */
export function enemyHealth(company: Company): number {
  const id = unitOf(company)
  const mythic = foeOf(company) === 'mythic' ? CODEX.quarries.flatMap((q) => q.roster).find((u) => u.id === id) : undefined
  return (mythic?.healthPerPower ?? G.healthPerPower) * company.power
}

/**
 * Where a host stands (A-159): melee companies, strongest first, in the fronts (center, left,
 * right); ranged companies, strongest first, in the rears; then whatever is left fills the free
 * slots, fronts first.
 */
export function placeHost(enemy: readonly Company[]): FieldUnit[] {
  const order = (reach: Reach): Company[] => enemy.filter((c) => c.reach === reach).sort((a, b) => b.power - a.power)
  const taken = new Set<SlotKey>()
  const placed: FieldUnit[] = []
  const put = (c: Company, slot: SlotKey): void => {
    taken.add(slot)
    placed.push({ id: c.id, side: 'enemy', name: c.name, power: c.power, health: enemyHealth(c), tags: [], reach: c.reach, slot, foe: foeOf(c), unit: unitOf(c) })
  }
  const fronts = FILL_ORDER.map((l) => slotOf(l, 'front'))
  const rears = FILL_ORDER.map((l) => slotOf(l, 'rear'))
  const rest: Company[] = []
  const melee = order('melee')
  const ranged = order('ranged')
  melee.forEach((c, i) => (i < fronts.length ? put(c, fronts[i]) : rest.push(c)))
  ranged.forEach((c, i) => (i < rears.length ? put(c, rears[i]) : rest.push(c)))
  for (const c of rest) {
    const free = [...fronts, ...rears].find((s) => !taken.has(s))
    if (free) put(c, free)
  }
  return placed
}

// ── What the player may see ──────────────────────────────────────────────────

export interface HostView {
  /** The full roster is shown (Mage Tower IV, the Spy Network, the Observatory). */
  revealed: boolean
  /** Every company with its power, only when revealed. */
  roster?: { name: string; unit: string; power: number; reach: Reach }[]
  /** The host's size against the player's best (banners + 2) companies (A-24's cut points). */
  size: Band
  /** Its strongest company against the player's strongest. */
  strongest: Band
  /** What kinds of company it brings, and whether its commander comes. */
  melee: boolean
  ranged: boolean
  commander: boolean
  /** The quarry of a Mythic Hunt: the creature at bay is no secret. */
  quarry?: string
  /** The rivals whose host it is. */
  rivals: RivalId[]
}

/** The enemy host as the Herald describes it (Ch 11 "Preparation"): bands, or the roster when revealed. Never a hidden number otherwise. */
export function hostView(state: CampaignState, battle: GrandBattle, effects: Effects = realmEffects(state)): HostView {
  const revealed = effects.reveals.hostRoster.whom !== 'none'
  const enemy = battle.enemy
  const total = enemy.reduce((s, c) => s + c.power, 0)
  const top = enemy.reduce((m, c) => Math.max(m, c.power), 0)
  const mine = playerArmyValue(state, effects)
  const best = state.roster.length > 0 ? Math.max(...state.roster.map((c) => c.power)) : 0
  const commanders = new Set(CODEX.hosts.map((h) => h.commander.id))
  const rivals = [...new Set(enemy.map(foeOf).filter((f): f is RivalId => f !== 'mythic'))]
  return {
    revealed,
    ...(revealed ? { roster: enemy.map((c) => ({ name: c.name, unit: unitOf(c), power: c.power, reach: c.reach })) } : {}),
    size: band(total, mine, RULES.rivals.armyBands),
    strongest: band(top, best, RULES.rivals.armyBands),
    melee: enemy.some((c) => c.reach === 'melee'),
    ranged: enemy.some((c) => c.reach === 'ranged'),
    commander: enemy.some((c) => commanders.has(unitOf(c))),
    ...(battle.quarry ? { quarry: battle.quarry } : {}),
    rivals
  }
}
