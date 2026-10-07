/**
 * The army roster (Ch 7 "The roster", Ch 8, Ch 14, A-19, A-20, A-21), derived from the realm's
 * state: one company per building at its tier, one hybrid per Crossing raised, the Crownguard,
 * Elites and the Sworn (from the armory slice T14 fills), vassals and allies, and envoy and
 * hired companies for a single battle.
 *
 * Company ids are stable slots, so orders, items and Weary status survive an upgrade in place:
 * a building's company is its building id, a hybrid its Crossing id, and so on.
 *
 * `power` is the company's `p` (Ch 10): its base, plus item and Wing additions, raised by the
 * Proving Grounds and other power shares (gains add, A-126), and −20% while Weary. The Foundry's
 * arms bonus `a` is not in it; combat applies `(1 + a)` to the sum (`realmEffects().armsBonus`).
 *
 * `CampaignState.roster` is the stored record of each company's items and Weary status. Read
 * power from `roster(state)`, never from the stored record; `refreshRoster` brings the record up
 * to date after anything that changes the army.
 */
import { CODEX } from './codex'
import { realmEffects } from './effects'
import { RULES, byTier } from './rules'
import { openDayOf } from './state'
import {
  BUILDING_IDS,
  type BuildingId,
  type CampaignState,
  type Company,
  type CompanySource,
  type Contribution,
  type Effects,
  type ISODate,
  type Reach,
  type RivalId,
  type Tag
} from './types'

export interface RosterOptions {
  /** The day the roster fights. A company is Weary while `wearyUntil` ≥ day; omitted, any `wearyUntil` counts. */
  day?: ISODate
  /** Hired companies for this one battle (A-19). */
  hired?: number
  /** Rival envoy companies for this one battle (A-20), one per rival named. */
  envoys?: RivalId[]
}

export interface RosterEntry {
  company: Company
  /** Power from tier, stage or codex, before any bonus. */
  basePower: number
  weary: boolean
  /** What moved power off its base: additions, then shares, then reductions (each its own value). */
  sources: Contribution[]
}

interface Base {
  id: string
  name: string
  source: CompanySource
  power: number
  tags: readonly Tag[]
  reach: Reach
  /** The building whose company this is (for Wing bonuses). */
  building?: BuildingId
  /** Never Wearied (the Sworn). */
  ignoreWeary?: boolean
}

function buildingCompany(id: BuildingId, tier: number): Base {
  const entry = CODEX.companies.find((c) => c.source === 'building' && c.building === id && c.tier === tier)
  if (!entry) throw new Error(`The codex has no Tier ${tier} company for ${id}`)
  return { id, name: entry.name, source: 'building', power: byTier(RULES.buildings.pureCompanyPower, tier), tags: entry.tags, reach: entry.reach, building: id }
}

function levy(rival: RivalId, source: 'vassal' | 'ally' | 'envoy'): Base {
  const entry = CODEX.rivals.find((r) => r.id === rival)
  if (!entry) throw new Error(`The codex has no rival ${rival}`)
  return { id: `${source}:${rival}`, name: `${entry.people} ${source}`, source, power: RULES.rivals.levyPower, tags: [entry.levy.tag], reach: entry.levy.reach }
}

/** The Crownguard's power: 40 with every building at Tier IV, 55 at all Tier V; 0 before. */
export function crownguardPower(state: CampaignState): number {
  const tiers = BUILDING_IDS.map((id) => state.buildings[id])
  const cg = RULES.crownguard
  if (tiers.some((t) => t < cg.buildingTier)) return 0
  const allV = tiers.every((t) => t >= RULES.buildings.pureCompanyPower.length)
  return allV ? cg.powerAllTierV : cg.power
}

/** Every company the state fields, before bonuses. */
function bases(state: CampaignState, options: RosterOptions): Base[] {
  const out: Base[] = BUILDING_IDS.map((id) => buildingCompany(id, state.buildings[id]))

  for (const x of CODEX.crossings) {
    const stage = state.crossings[x.id] ?? 0
    if (stage === 0) continue
    const hybrid = x.hybrids.find((h) => h.stage === stage)
    if (!hybrid) throw new Error(`The codex has no stage ${stage} hybrid for ${x.id}`)
    out.push({ id: x.id, name: hybrid.name, source: 'crossing', power: byTier(RULES.crossings.hybridPower, stage), tags: x.tags, reach: hybrid.reach })
  }

  const cg = crownguardPower(state)
  if (cg > 0) {
    const entry = CODEX.companies.find((c) => c.source === 'crownguard')
    if (!entry) throw new Error('The codex has no Crownguard')
    out.push({ id: entry.id, name: entry.name, source: 'crownguard', power: cg, tags: entry.tags, reach: entry.reach })
  }

  // The slots T14 fills: Elites and the Sworn.
  for (const elite of state.armory?.elites ?? []) {
    const entry = CODEX.elites.find((e) => e.id === elite.id)
    if (!entry) continue
    out.push({ id: entry.id, name: entry.name, source: 'elite', power: byTier(entry.power, elite.rank), tags: entry.tags, reach: entry.reach })
  }
  const sworn = state.armory?.sworn
  if (sworn) {
    const entry = CODEX.sworn
    const ignoreWeary = entry.ability.some((a) => a.kind === 'ignoreWeary' && a.in !== 'grand')
    out.push({ id: entry.id, name: entry.name, source: 'sworn', power: entry.power, tags: sworn.tags, reach: entry.reach, ignoreWeary })
  }

  // A conquered or abdicated rival's company serves as a vassal; an allied rival's joins free (Ch 14).
  for (const r of CODEX.rivals) {
    const status = state.rivals[r.id]?.status
    if (status === 'conquered' || status === 'abdicated') out.push(levy(r.id, 'vassal'))
    else if (status === 'allied') out.push(levy(r.id, 'ally'))
  }

  for (const rival of options.envoys ?? []) out.push(levy(rival, 'envoy'))

  // The Wandering Order serves while its event holds (T12, Appendix C); without a day, on the open day.
  const day = options.day ?? openDayOf(state)
  for (const ev of state.worldEvents) {
    const held = ev.data as { from?: string; until?: string } | null
    const entry = CODEX.events.find((x) => x.id === ev.id)
    const power = entry?.effect.companyPower
    if (typeof power !== 'number' || !held?.from || !held.until || day < held.from || day > held.until) continue
    out.push({ id: ev.id, name: entry?.name ?? ev.id, source: 'ally', power, tags: entry?.effect.companyTags as Tag[], reach: 'melee' })
  }

  const hired = options.hired ?? 0
  if (hired > 0) {
    const mh = buildingCompany('merchantHall', state.buildings.merchantHall)
    for (let i = 1; i <= hired; i++) {
      out.push({ id: `hired:${i}`, name: mh.name, source: 'hired', power: mh.power, tags: [RULES.rivals.hired.tag], reach: RULES.rivals.hired.reach })
    }
  }
  // A company lent to an envoy is away that day (Appendix C "Envoys").
  const away = new Set((state.world?.lent ?? []).filter((l) => l.day === day).map((l) => l.companyId))
  return away.size > 0 ? out.filter((b) => !away.has(b.id)) : out
}

function isWeary(until: ISODate | undefined, day: ISODate | undefined): boolean {
  if (until === undefined) return false
  return day === undefined || until >= day
}

function detail(state: CampaignState, options: RosterOptions, effects: Effects, applyWeary: boolean): RosterEntry[] {
  const stored = new Map(state.roster.map((c) => [c.id, c]))
  return bases(state, options).map((b) => {
    const prior = stored.get(b.id)
    const items = prior ? [...prior.items] : []
    const tags = new Set<Tag>(b.tags)
    const adds: Contribution[] = []
    const shares: Contribution[] = []
    const cuts: Contribution[] = []
    let ignoreWeary = b.ignoreWeary === true

    if (b.building) adds.push(...effects.companyPower.buildingCompany[b.building].sources)
    if (b.source === 'crownguard') adds.push(...effects.crownguardBonus.sources)
    shares.push(...effects.companyPower.all.sources)
    if (b.reach === 'ranged') shares.push(...effects.companyPower.ranged.sources)

    // Items the company carries (T14 equips them).
    for (const id of items) {
      const item = CODEX.items.find((i) => i.id === id)
      if (!item) continue
      const from = { kind: 'item', id, company: b.id } as const
      for (const x of item.effects) {
        if (x.in === 'grand' || (x.target && x.target !== 'company')) continue
        if (x.kind === 'power') {
          if (x.add) adds.push({ from, value: x.add })
          if (x.mult && x.mult > 1) shares.push({ from, value: x.mult - 1 })
          if (x.mult && x.mult < 1) cuts.push({ from, value: x.mult })
        } else if (x.kind === 'addTag') tags.add(x.tag)
        else if (x.kind === 'ignoreWeary') ignoreWeary = true
      }
    }

    const weary = applyWeary && !ignoreWeary && isWeary(prior?.wearyUntil, options.day)
    if (weary && prior?.wearyUntil) cuts.push({ from: { kind: 'weary', until: prior.wearyUntil }, value: 1 - RULES.land.weary.powerPenalty })

    const total = (list: Contribution[]): number => list.reduce((t, c) => t + c.value, 0)
    const power = (b.power + total(adds)) * (1 + total(shares)) * cuts.reduce((t, c) => t * c.value, 1)
    const company: Company = { id: b.id, name: b.name, source: b.source, power, tags: [...tags], reach: b.reach, items }
    if (prior?.wearyUntil) company.wearyUntil = prior.wearyUntil
    return { company, basePower: b.power, weary, sources: [...adds, ...shares, ...cuts] }
  })
}

/** Each company with its base power, Weary status and the sources of its bonuses (for tooltips). */
export function rosterDetail(state: CampaignState, options: RosterOptions = {}, effects: Effects = realmEffects(state)): RosterEntry[] {
  return detail(state, options, effects, true)
}

/** The army: every company the realm fields today, with its power `p`. */
export function roster(state: CampaignState, options: RosterOptions = {}, effects: Effects = realmEffects(state)): Company[] {
  return rosterDetail(state, options, effects).map((e) => e.company)
}

/**
 * Brings `state.roster` up to date with the realm (new tiers, hybrids, the Crownguard, levies),
 * keeping each company's items and Weary date. Single-battle companies are never stored, and
 * the stored power leaves Weary out. A company that has left (the Wandering Order's term is over)
 * hands its items back to the stash.
 */
export function refreshRoster(state: CampaignState): CampaignState {
  const roster = detail(state, {}, realmEffects(state), false).map((e) => e.company)
  const kept = new Set(roster.map((c) => c.id))
  const returned = state.roster.filter((c) => !kept.has(c.id)).flatMap((c) => c.items)
  if (returned.length === 0) return { ...state, roster }
  const armory = state.armory ?? { wings: [], elites: [], stash: [] }
  return { ...state, roster, armory: { ...armory, stash: [...armory.stash, ...returned] } }
}
