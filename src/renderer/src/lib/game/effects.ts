/**
 * Realm-wide effects (Ch 7, Ch 8, Ch 9 boons, A-30 to A-32): every modifier the realm holds,
 * collected into one `realmEffects(state)` answer, each value with the sources that produced it.
 *
 * Sources: building tiers (each tier's effect is that tier's total, A-31; a tier keeps a lower
 * tier's effect it doesn't restate, A-103), the castle, Crossing perks (a perk that `replaces`
 * another drops it), Milestone boons, the Crown's Grace, sealed lairs, and, from the armory slice
 * T14 fills, Wings and the realm-wide effects of equipped items.
 *
 * Stacking (A-31, A-126): gains from different sources add (reputation, tithes, power shares);
 * reductions multiply (mythic strength, costs, tribute); "walls count double" never stacks.
 *
 * Shared by many tasks: add fields, don't reorganize them.
 */
import { CODEX } from './codex'
import { BUILDING_IDS } from './map'
import { RULES, byTier } from './rules'
import type {
  BuildingId,
  BuildingTier,
  CampaignState,
  Contribution,
  CostKind,
  CrossingId,
  CrossingStage,
  Effect,
  EffectSourceRef,
  Effects,
  Flag,
  Foe,
  Grant,
  Land,
  Reveal,
  RevealKind,
  Sourced
} from './types'

// ── Building values ──────────────────────────────────────────────────────────

const COST_KINDS: readonly CostKind[] = ['tiers', 'crossings', 'items', 'fortification', 'trade']
const FOES: readonly Foe[] = ['beast', 'mythic', 'rival', 'militia']
const REVEAL_KINDS: readonly RevealKind[] = ['treasury', 'army', 'threatStrength', 'hostRoster']

function sum(base: Contribution[] = []): Sourced {
  return { value: base.reduce((t, c) => t + c.value, 0), op: 'add', sources: base }
}

function product(base: Contribution[] = []): Sourced {
  return { value: base.reduce((t, c) => t * c.value, 1), op: 'mult', sources: base }
}

/** Adds (or, for a product, multiplies in) one contribution. Zero gains and ×1 are left out. */
function push(target: Sourced, from: EffectSourceRef, value: number): void {
  if (target.op === 'add') {
    if (value === 0) return
    target.value += value
  } else {
    if (value === 1) return
    target.value *= value
  }
  target.sources.push({ from, value })
}

function flag(): Flag {
  return { on: false, sources: [] }
}

function raise(f: Flag, from: EffectSourceRef): void {
  f.on = true
  f.sources.push(from)
}

const building = (id: BuildingId, tier: number): EffectSourceRef => ({ kind: 'building', id, tier: tier as BuildingTier })

/**
 * A "by tier" value with its source: the building at its tier when the tier changed the value,
 * otherwise the base (a tier keeps a lower tier's value, A-103).
 */
function tierValue(list: readonly number[], id: BuildingId, tier: number): Contribution {
  const value = byTier(list, tier)
  return { from: value === byTier(list, 1) ? { kind: 'base' } : building(id, tier), value }
}

// ── What the state holds ─────────────────────────────────────────────────────

/** Whether Milestone `index` has broken (Ch 9: never revoked). */
export function milestoneBroken(state: CampaignState, index: number): boolean {
  return state.weight.milestones.some((m) => m.index === index && m.brokenOn !== undefined)
}

function milestone(index: number, boon: string): EffectSourceRef {
  return { kind: 'milestone', index, boon }
}

/** Every Crossing perk in force, by stage, without the perks another one replaces (A-31). */
function activePerks(state: CampaignState): { id: string; crossing: CrossingId; effects: readonly Effect[] }[] {
  const raised = CODEX.crossings.flatMap((x) => {
    const stage = state.crossings[x.id] ?? 0
    return x.perks.filter((p) => p.stage <= stage).map((p) => ({ id: p.id, crossing: x.id, replaces: p.replaces, effects: p.effects as readonly Effect[] }))
  })
  const replaced = new Set(raised.flatMap((p) => (p.replaces ? [p.replaces] : [])))
  return raised.filter((p) => !replaced.has(p.id)).map(({ id, crossing, effects }) => ({ id, crossing, effects }))
}

/**
 * The effects that apply to the realm rather than to one company: Crossing perks, the Wings
 * chosen, and items equipped anywhere whose effect targets the realm (the Legendary items, A-128).
 */
export function realmGrants(state: CampaignState): Grant[] {
  const grants: Grant[] = []
  for (const p of activePerks(state)) {
    for (const effect of p.effects) grants.push({ effect, from: { kind: 'perk', id: p.id, crossing: p.crossing } })
  }
  for (const id of state.armory?.wings ?? []) {
    const wing = CODEX.wings.find((w) => w.id === id)
    if (!wing) continue
    for (const effect of wing.effects) grants.push({ effect: effect as Effect, from: { kind: 'wing', id } })
  }
  for (const company of state.roster) {
    for (const id of company.items) {
      const item = CODEX.items.find((i) => i.id === id)
      if (!item) continue
      for (const effect of item.effects) {
        if (effect.target === 'realm') grants.push({ effect: effect as Effect, from: { kind: 'item', id, company: company.id } })
      }
    }
  }
  return grants
}

function sourceGranted(state: CampaignState, s: (typeof CODEX.orders)[number]['source']): EffectSourceRef | null {
  if (s.kind === 'building') return state.buildings[s.id] >= s.tier ? building(s.id, s.tier) : null
  if (s.kind === 'crossing') return (state.crossings[s.id] ?? 0) >= s.stage ? { kind: 'crossing', id: s.id, stage: s.stage as CrossingStage } : null
  return state.armory?.wings.includes(s.id) ? { kind: 'wing', id: s.id } : null
}

// ── The answer ───────────────────────────────────────────────────────────────

/** Every realm-wide modifier, each with its sources. Pure; cheap enough to call per battle. */
export function realmEffects(state: CampaignState): Effects {
  const b = state.buildings
  const castle = state.castleTier
  const castleRef: EffectSourceRef = { kind: 'castle', tier: castle }
  const unlocks = RULES.milestones.unlocks
  const boons = RULES.milestones.boons

  const buildingCompany = {} as Record<BuildingId, Sourced>
  for (const id of BUILDING_IDS) buildingCompany[id] = sum()

  const e: Effects = {
    banners: sum([{ from: castleRef, value: byTier(RULES.castle.banners, castle) }]),
    poolBanners: { defense: sum(), assault: sum() },
    walls: sum(),
    wallsDouble: [],
    armsBonus: sum(),
    companyPower: { all: sum(), ranged: sum(), buildingCompany },
    crownguardBonus: sum(),
    rallyFloor: sum(),
    mythicStrength: product(),
    mythicStrengthBySide: {},
    raidStrength: product(),
    reputationBonus: sum(),
    pledgeCap: product(),
    minPledgeReturn: sum(),
    respiteBank: sum([tierValue(RULES.respite.bankByMageTowerTier, 'mageTower', b.mageTower)]),
    courtshipSlots: sum([{ from: { kind: 'base' }, value: RULES.influence.courtshipSlots.base }]),
    dailyAssaults: sum([{ from: { kind: 'base' }, value: RULES.land.assaultsPerDay }]),
    foretell: { threats: sum(), raids: sum(), raidsOnRoad: {}, grandBattles: sum() },
    reveals: Object.fromEntries(REVEAL_KINDS.map((k) => [k, { whom: 'none', sources: [] } as Reveal])) as Record<RevealKind, Reveal>,
    titheMult: sum([{ from: { kind: 'base' }, value: 1 }]),
    costs: Object.fromEntries(COST_KINDS.map((k) => [k, product()])) as Record<CostKind, Sourced>,
    spoils: Object.fromEntries(FOES.map((f) => [f, product()])) as Record<Foe, Sourced>,
    tribute: product(),
    contestedDays: sum([{ from: { kind: 'base' }, value: RULES.combat.contestedDays.base }]),
    itemSlots: sum(),
    extraItemSlots: sum(),
    hiredBlades: flag(),
    assaultIgnoresFortification: flag(),
    royalHunt: { on: false, reputation: 0, trophy: false, perWeek: 0, sources: [] },
    grandIllusion: sum(),
    trust: sum(),
    interest: { rate: 0, cap: 0, sources: [] },
    eventHints: sum(),
    wearyDays: sum(),
    ordersOffered: sum([{ from: { kind: 'base' }, value: RULES.grandBattles.ordersOffered }]),
    readinessFloor: sum(),
    orders: [],
    doctrines: [],
    perks: activePerks(state).map((p) => ({ id: p.id, from: { kind: 'perk', id: p.id, crossing: p.crossing } })),
    battle: []
  }

  // The castle (Ch 7).
  push(e.walls, castleRef, byTier(RULES.castle.walls, castle))
  if (castle >= RULES.castle.secondAssaultTier) push(e.dailyAssaults, castleRef, 1)

  // Barracks: the rally floor (55 / 60 / 65% at III / IV / V).
  e.rallyFloor = sum([tierValue(RULES.combat.rallyFloor.byBarracksTier, 'barracks', b.barracks)])

  // Merchant Hall: the reputation bonus, hired blades, the pledge cap, the minimum return, slots.
  push(e.reputationBonus, building('merchantHall', b.merchantHall), byTier(RULES.reputation.merchantHallBonus, b.merchantHall))
  const mh = RULES.buildings.merchantHall
  if (b.merchantHall >= mh.hiredBlades.tier) raise(e.hiredBlades, building('merchantHall', mh.hiredBlades.tier))
  if (b.merchantHall >= mh.pledgeCap.tier) push(e.pledgeCap, building('merchantHall', mh.pledgeCap.tier), mh.pledgeCap.mult)
  if (b.merchantHall >= mh.minPledgeReturn.tier) push(e.minPledgeReturn, building('merchantHall', mh.minPledgeReturn.tier), mh.minPledgeReturn.share)
  for (const slot of RULES.influence.courtshipSlots.merchantHall) {
    if (b.merchantHall >= slot.tier) push(e.courtshipSlots, building('merchantHall', slot.tier), slot.add)
  }

  // Mage Tower: mythics weaker; foresight and exact strengths and rosters from Tier IV.
  push(e.mythicStrength, building('mageTower', b.mageTower), 1 - byTier(RULES.buildings.mageTower.mythicReduction, b.mageTower))
  const foresight = RULES.buildings.mageTower.foresight
  if (b.mageTower >= foresight.tier) {
    const ref = building('mageTower', foresight.tier)
    push(e.foretell.threats, ref, foresight.days)
    push(e.foretell.grandBattles, ref, foresight.days)
    reveal(e, 'threatStrength', 'all', ref)
    reveal(e, 'hostRoster', 'all', ref)
  }

  // Foundry: the arms bonus and its walls (that tier's totals, A-31).
  const foundry = building('foundry', b.foundry)
  push(e.armsBonus, foundry, byTier(RULES.buildings.foundry.armsBonus, b.foundry))
  push(e.walls, foundry, byTier(RULES.buildings.foundry.walls, b.foundry))

  // Milestone boons (Ch 9).
  if (milestoneBroken(state, unlocks.armory)) push(e.itemSlots, milestone(unlocks.armory, 'armory'), RULES.armory.itemSlots.base)
  if (milestoneBroken(state, unlocks.secondItemSlot)) {
    push(e.itemSlots, milestone(unlocks.secondItemSlot, 'secondItemSlot'), RULES.armory.itemSlots.withSecondSlot - e.itemSlots.value)
  }
  if (milestoneBroken(state, unlocks.provingGrounds)) {
    push(e.companyPower.all, milestone(unlocks.provingGrounds, 'provingGrounds'), boons.provingGroundsPower)
  }
  if (milestoneBroken(state, unlocks.healingSprings)) {
    const ref = milestone(unlocks.healingSprings, 'healingSprings')
    push(e.rallyFloor, ref, RULES.combat.rallyFloor.healingSprings)
    push(e.respiteBank, ref, RULES.respite.healingSpringsBonus)
  }
  if (milestoneBroken(state, unlocks.crownForge)) push(e.banners, milestone(unlocks.crownForge, 'crownForge'), boons.crownForgeBanners)
  if (milestoneBroken(state, unlocks.statue)) push(e.reputationBonus, milestone(unlocks.statue, 'statue'), boons.statueReputation)
  if (milestoneBroken(state, unlocks.crownguardAscendant)) {
    push(e.crownguardBonus, milestone(unlocks.crownguardAscendant, 'crownguardAscendant'), RULES.crownguard.ascendantBonus)
  }

  // The Crown's Grace II: tribute halved, contested hexes hold 2 days (Ch 9).
  if (state.weight.grace >= RULES.effects.graceIILevel) {
    const ref: EffectSourceRef = { kind: 'grace', level: state.weight.grace }
    push(e.tribute, ref, RULES.combat.tribute.graceIIMult)
    push(e.contestedDays, ref, RULES.combat.contestedDays.graceII - RULES.combat.contestedDays.base)
  }

  // Perks, Wings and realm-wide items.
  for (const g of realmGrants(state)) apply(e, g)

  // Orders and Doctrines from what grants them (Appendix C).
  for (const o of CODEX.orders) {
    const from = sourceGranted(state, o.source)
    if (from) e.orders.push({ id: o.id, from })
  }
  for (const d of CODEX.doctrines) {
    const from = sourceGranted(state, d.source)
    if (from) e.doctrines.push({ id: d.id, from })
  }

  // Mythic strength by lair side: everything above, halved from a sealed lair's side (Ch 3 rule 5).
  for (const lair of CODEX.lairs) {
    const side = product([...e.mythicStrength.sources])
    const mouth = state.hexes.find((h) => h.kind === 'lairMouth' && h.land === lair.land)
    if (mouth?.owner === 'player') push(side, { kind: 'lair', id: lair.id }, RULES.land.sealedLairMythicMult)
    e.mythicStrengthBySide[lair.land as Land] = side
  }
  return e
}

function reveal(e: Effects, what: RevealKind, whom: 'neighbors' | 'all', from: EffectSourceRef): void {
  const r = e.reveals[what]
  if (whom === 'all' || r.whom === 'none') r.whom = whom
  r.sources.push(from)
}

/** Interprets one realm-wide codex effect into its field; anything else goes on to the battle engines. */
function apply(e: Effects, g: Grant): void {
  const { effect: x, from } = g
  if (x.in === 'grand') {
    e.battle.push(g)
    return
  }
  switch (x.kind) {
    case 'power':
      if (x.target === 'buildingCompany' && from.kind === 'wing') {
        const wing = CODEX.wings.find((w) => w.id === from.id)
        if (wing) push(e.companyPower.buildingCompany[wing.building], from, x.add ?? 0)
      } else if (x.reach === 'ranged') push(e.companyPower.ranged, from, (x.mult ?? 1) - 1)
      else e.battle.push(g)
      return
    case 'rallyFloor':
      return push(e.rallyFloor, from, x.add)
    case 'walls':
      return push(e.walls, from, x.add)
    case 'wallsMult':
      e.wallsDouble.push({ ...(x.rings ? { rings: [...x.rings] } : {}), ...(x.against ? { against: x.against } : {}), from })
      return
    case 'banners':
      return push(x.pool ? e.poolBanners[x.pool] : e.banners, from, x.add)
    case 'dailyAssaults':
      return push(e.dailyAssaults, from, x.add)
    case 'mythicStrength':
      return push(e.mythicStrength, from, x.mult)
    case 'raidStrength':
      return push(e.raidStrength, from, x.mult)
    case 'foretell': {
      if (x.road) {
        const road = (e.foretell.raidsOnRoad[x.road] ??= sum())
        return push(road, from, x.days)
      }
      return push(x.threat === 'raid' ? e.foretell.raids : e.foretell.threats, from, x.days)
    }
    case 'reveal':
      return reveal(e, x.what, x.whom ?? 'all', from)
    case 'reputationBonus':
      return push(e.reputationBonus, from, x.add)
    case 'tithes':
      return push(e.titheMult, from, x.mult - 1)
    case 'cost':
      for (const what of x.what) push(e.costs[what], from, x.mult)
      return
    case 'spoils':
      for (const foe of x.against ? [x.against] : FOES) push(e.spoils[foe], from, x.mult)
      return
    case 'tribute':
      return push(e.tribute, from, x.mult)
    case 'trust':
      return push(e.trust, from, x.add)
    case 'courtshipSlots':
      return push(e.courtshipSlots, from, x.add)
    case 'respiteBank':
      return push(e.respiteBank, from, x.add)
    case 'itemSlots':
      return push(e.extraItemSlots, from, x.add)
    case 'interest':
      e.interest = { rate: e.interest.rate + x.rate, cap: e.interest.cap + x.cap, sources: [...e.interest.sources, from] }
      return
    case 'eventHint':
      return push(e.eventHints, from, x.limit?.uses ?? 1)
    case 'wearyDays':
      return push(e.wearyDays, from, x.add)
    case 'ordersOffered':
      return push(e.ordersOffered, from, x.set - e.ordersOffered.value)
    case 'readinessFloor':
      return push(e.readinessFloor, from, Math.max(0, x.min - e.readinessFloor.value))
    case 'ignoreFortification':
      if (x.in === 'daily') return raise(e.assaultIgnoresFortification, from)
      e.battle.push(g)
      return
    case 'royalHunt':
      e.royalHunt = {
        on: true,
        reputation: e.royalHunt.reputation + x.reputation,
        trophy: e.royalHunt.trophy || x.trophy,
        perWeek: e.royalHunt.perWeek + (x.limit?.uses ?? 1),
        sources: [...e.royalHunt.sources, from]
      }
      return
    case 'grandIllusion':
      return push(e.grandIllusion, from, x.limit?.uses ?? 1)
    default:
      e.battle.push(g)
  }
}

// ── Reading it ───────────────────────────────────────────────────────────────

/**
 * The walls a battle counts: `walls`, doubled when a Shieldwall or Runed Walls condition holds.
 * Two conditions at once still count the walls double, not four times (A-126).
 */
export function wallsFor(e: Effects, battle: { ring: number; foe: Foe }): number {
  const doubled = e.wallsDouble.some((d) => (!d.rings || d.rings.includes(battle.ring)) && (!d.against || d.against === battle.foe))
  return doubled ? e.walls.value * 2 : e.walls.value
}

/** Mythic strength multiplier for an attack from a lair side, or the general one off the lair sides. */
export function mythicMultFor(e: Effects, side?: Land): number {
  return (side && e.mythicStrengthBySide[side]?.value) ?? e.mythicStrength.value
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V']

/**
 * A short label for a source, from codex names and tier numerals ("Castle III", "Foundry III",
 * "Warded Steel"). Plain facts only; screens may word them differently.
 */
export function sourceLabel(ref: EffectSourceRef): string {
  switch (ref.kind) {
    case 'base':
      return 'Base'
    case 'castle':
      return `Castle ${ROMAN[ref.tier - 1]}`
    case 'building':
      return `${CODEX.buildings.find((x) => x.id === ref.id)?.name ?? ref.id} ${ROMAN[ref.tier - 1]}`
    case 'crossing':
      return `${CODEX.crossings.find((x) => x.id === ref.id)?.name ?? ref.id} ${ROMAN[ref.stage - 1]}`
    case 'perk': {
      const crossing = CODEX.crossings.find((x) => x.id === ref.crossing)
      return crossing?.perks.find((p) => p.id === ref.id)?.name ?? crossing?.name ?? ref.id
    }
    case 'milestone':
      return `Milestone ${ref.index}`
    case 'wing':
      return CODEX.wings.find((w) => w.id === ref.id)?.name ?? ref.id
    case 'item':
      return CODEX.items.find((i) => i.id === ref.id)?.name ?? ref.id
    case 'lair':
      return CODEX.lairs.find((l) => l.id === ref.id)?.name ?? ref.id
    case 'grace':
      return `Grace ${ROMAN[ref.level - 1]}`
    case 'weary':
      return 'Weary'
  }
}
