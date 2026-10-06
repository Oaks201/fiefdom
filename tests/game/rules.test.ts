// Strict mode, so assigning to a frozen object throws (tsx compiles tests as CommonJS).
'use strict'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RULES, base, byTier, contractLengths, lengthMultiplier } from '../../src/renderer/src/lib/game/rules'

/** Reads a dotted key path such as 'combat.temper.orc' from RULES. */
function at(path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], RULES)
}

/**
 * Every Appendix B row: its area, its parameter, and the RULES keys that hold it with their book
 * values. Where a row names a value that belongs to a codex entry (Warded Steel's +5%), the
 * codex test checks it instead.
 */
const APPENDIX_B: { area: string; parameter: string; keys: Record<string, unknown> }[] = [
  {
    area: 'Clock',
    parameter: 'Day close; correction grace; founding grant',
    keys: { 'clock.dayCloseHour': 4, 'clock.correctionGraceDays': 1, 'clock.foundingGrant': 100 }
  },
  {
    area: 'Contracts',
    parameter: 'Lengths and unlocks',
    keys: {
      'contracts.lengths.0.unlock': { kind: 'start' },
      'contracts.lengths.1.unlock': { kind: 'start' },
      'contracts.lengths.2.unlock': { kind: 'anyBuildingTier', tier: 2 },
      'contracts.lengths.3.unlock': { kind: 'castleTier', tier: 2 },
      'contracts.lengths.4.unlock': { kind: 'castleTier', tier: 3 }
    }
  },
  {
    area: 'Contracts',
    parameter: 'Length multiplier L for 1 / 3 / 7 / 14 / 30 days',
    keys: {
      'contracts.lengths.0.multiplier': 1.0,
      'contracts.lengths.1.multiplier': 1.15,
      'contracts.lengths.2.multiplier': 1.4,
      'contracts.lengths.3.multiplier': 1.7,
      'contracts.lengths.4.multiplier': 2.0
    }
  },
  {
    area: 'Contracts',
    parameter: 'Payout',
    keys: { 'contracts.payoutPerDay': 10, 'contracts.payoutCurve.start': 0.4, 'contracts.payoutCurve.span': 0.6 }
  },
  {
    area: 'Contracts',
    parameter: 'Pledge cap; return',
    keys: { 'contracts.pledge.capPerDay': 10, 'contracts.pledge.returnMultiplier': 2 }
  },
  {
    area: 'Contracts',
    parameter: 'Withdrawal',
    keys: {
      'contracts.withdrawal.perDay': 10,
      'contracts.withdrawal.lengthMultiplier': 1.0,
      'contracts.withdrawal.pledgeShareReturned': 0.5
    }
  },
  {
    area: 'Respite',
    parameter: 'Earn rate; bank',
    keys: {
      'respite.earnEveryDays': 7,
      'respite.bankByMageTowerTier': [4, 4, 5, 5, 6],
      'respite.healingSpringsBonus': 1
    }
  },
  {
    area: 'Reputation',
    parameter: 'Daily',
    keys: {
      'reputation.daily.duties': 12,
      'reputation.daily.perfectDay': 5,
      'reputation.daily.streakPerDay': 1,
      'reputation.daily.streakCap': 7
    }
  },
  {
    area: 'Reputation',
    parameter: 'Weekly',
    keys: {
      'reputation.weekly.steps': 70,
      'reputation.weekly.calories': 70,
      'reputation.weekly.flawless': 50,
      'reputation.weekly.momentum': 60,
      'reputation.weekly.tithePerRing': 4
    }
  },
  {
    area: 'Reputation',
    parameter: 'Merchant Hall bonus, Tiers I–V',
    keys: { 'reputation.merchantHallBonus': [0.02, 0.05, 0.08, 0.12, 0.15] }
  },
  {
    area: 'Momentum',
    parameter: 'Trend window; target pace T',
    keys: {
      'momentum.trendWindowDays': 21,
      'momentum.minWeighIns': 2,
      'momentum.minWeighInSpanDays': 6,
      'momentum.targetPace.capLb': 0.8,
      'momentum.targetPace.shareOfWeight': 0.004,
      'momentum.targetPace.averageDays': 7,
      'momentum.targetPace.capMinLb': 0.3,
      'momentum.targetPace.capMaxLb': 1.0
    }
  },
  {
    area: 'Momentum',
    parameter: 'Plateau floor',
    keys: {
      'momentum.plateauFloor': [
        { minConsistency: 0.85, floor: 0.6 },
        { minConsistency: 0.75, floor: 0.3 }
      ]
    }
  },
  {
    area: 'Momentum',
    parameter: 'Too-fast hold',
    keys: { 'momentum.tooFast.windowDays': 28, 'momentum.tooFast.shareOfWeightPerWeek': 0.01, 'momentum.tooFast.heldMw': 0.5 }
  },
  {
    area: 'Milestones',
    parameter: 'Count; step; earliest week',
    keys: {
      'milestones.count': 10,
      'milestones.stepMinLb': 3,
      'milestones.stepMaxLb': 10,
      'milestones.earliestWeekRate': 0.0075
    }
  },
  {
    area: 'Milestones',
    parameter: 'Dispensation',
    keys: {
      'milestones.dispensation.weeks': 8,
      'milestones.dispensation.minRealmConsistency': 0.85,
      'milestones.dispensation.oncePerWeeks': 8
    }
  },
  {
    area: 'Grace',
    parameter: 'Steadiness thresholds I / II / III',
    keys: { 'grace.thresholds': [0.5, 0.7, 0.85], 'grace.windowWeeks': 8, 'grace.minWeeks': 4 }
  },
  {
    area: 'Buildings',
    parameter: 'Tier II / III / IV / V Dominion',
    keys: { 'buildings.tierDominion': [0, 8, 24, 68, 68] }
  },
  {
    area: 'Buildings',
    parameter: 'Tier II / III / IV / V cost',
    keys: { 'buildings.tierCost': [0, 150, 450, 1100, 1800] }
  },
  {
    area: 'Buildings',
    parameter: 'Pure company power, Tiers I–V',
    keys: { 'buildings.pureCompanyPower': [5, 9, 14, 21, 30] }
  },
  {
    area: 'Castle',
    parameter: 'Tiers II / III / IV: tier sum; cost',
    keys: { 'castle.tierSum': [0, 8, 12, 16], 'castle.tierCost': [0, 250, 750, 1500] }
  },
  {
    area: 'Castle',
    parameter: 'Banners I–V; walls I–V',
    keys: { 'castle.banners': [2, 3, 4, 5, 6], 'castle.walls': [4, 8, 14, 22, 30] }
  },
  {
    area: 'Crossings',
    parameter: 'Stage cost; hybrid power',
    keys: { 'crossings.stageCost': [200, 600, 1200], 'crossings.hybridPower': [12, 18, 27] }
  },
  {
    area: 'Crownguard',
    parameter: 'Power',
    keys: { 'crownguard.power': 40, 'crownguard.powerAllTierV': 55, 'crownguard.ascendantBonus': 10 }
  },
  {
    area: 'Land',
    parameter: 'Base garrison, rings 1–5',
    keys: { 'land.baseGarrison': [15, 22, 55, 115, 200] }
  },
  {
    area: 'Land',
    parameter: 'Garrison multipliers',
    keys: {
      'land.garrison.beasts': 0.9,
      'land.garrison.villageMilitia': 0.6,
      'land.garrison.fortificationPerLevel': 0.25
    }
  },
  {
    area: 'Land',
    parameter: 'Fortification cost, levels 1 / 2 / 3',
    keys: { 'land.fortificationCost': [15, 35, 70] }
  },
  {
    area: 'Land',
    parameter: 'Repulse wear; Weary',
    keys: { 'land.repulseWear': 0.25, 'land.weary.powerPenalty': 0.2, 'land.weary.days': 1 }
  },
  {
    area: 'Influence',
    parameter: 'Trust',
    keys: {
      'influence.trust.base': 0.6,
      'influence.trust.perRealmConsistency': 0.6,
      'influence.trust.min': 0.6,
      'influence.trust.max': 1.2
    }
  },
  {
    area: 'Influence',
    parameter: 'Village loyalty',
    keys: { 'influence.loyalty.neutralPerRing': 15, 'influence.loyalty.rivalPerRing': 30, 'influence.loyalty.gateMult': 2 }
  },
  {
    area: 'Influence',
    parameter: 'Failed bid',
    keys: { 'influence.failedBid.refundShare': 0.5, 'influence.failedBid.loyaltyDropShareOfOffer': 0.1 }
  },
  {
    area: 'Trade',
    parameter: 'Hex price',
    keys: {
      'trade.hexPricePerRing': 50,
      'trade.villageMult': 1.5,
      'trade.greed': { orc: 1.5, goblin: 1.2, dwarf: 2.0, archmage: 1.4 }
    }
  },
  {
    area: 'Trade',
    parameter: 'Truce; pact; call to arms',
    keys: { 'trade.truce.costPerRing': 30, 'trade.pact.cost': 250, 'trade.callToArms.cost': 200 }
  },
  {
    area: 'Combat',
    parameter: 'Threat mix',
    keys: { 'combat.threatMix': { beasts: 0.4, mythic: 0.2, raid: 0.4 } }
  },
  {
    area: 'Combat',
    parameter: 'Strength',
    keys: {
      'combat.strength.beasts': 0.9,
      'combat.strength.mythic': 1.15,
      'combat.strength.raidBase': 0.8,
      'combat.strength.raidArmy': 0.25,
      'combat.strength.conquestBase': 1.0,
      'combat.strength.conquestArmy': 0.5,
      'combat.strength.roll': 0.15
    }
  },
  {
    area: 'Combat',
    parameter: 'Temper',
    keys: { 'combat.temper': { orc: 1.2, goblin: 0.9, dwarf: 1.05, archmage: 1.05 } }
  },
  {
    area: 'Combat',
    parameter: 'Siege day; early grace',
    keys: {
      'combat.siegeDay.bonus': 0.4,
      'combat.earlyGrace': [
        { throughWeek: 2, mult: 0.7 },
        { throughWeek: 4, mult: 0.85 }
      ],
      'combat.noConquestBeforeWeek': 6
    }
  },
  {
    area: 'Combat',
    parameter: 'Match; rally floor',
    keys: {
      'combat.match': { weak: 1.5, neutral: 1.0, resist: 0.6 },
      'combat.rallyFloor.base': 0.5,
      'combat.rallyFloor.byBarracksTier': [0.5, 0.5, 0.55, 0.6, 0.65],
      'combat.rallyFloor.healingSprings': 0.1
    }
  },
  {
    area: 'Combat',
    parameter: 'Spoils; tribute',
    keys: {
      'combat.spoils.winPerRing': 4,
      'combat.spoils.routPerRing': 6,
      'combat.tribute.perRing': 3
    }
  },
  {
    area: 'Grand Battles',
    parameter: 'Health; ranged; Readiness',
    keys: {
      'grandBattles.healthPerPower': 4,
      'grandBattles.rangedMult': 0.8,
      'grandBattles.readiness.base': 0.6,
      'grandBattles.readiness.perValor': 0.5,
      'grandBattles.readiness.valorDays': 7
    }
  },
  {
    area: 'Grand Battles',
    parameter: 'Rounds; Orders offered; spacing',
    keys: { 'grandBattles.rounds': 4, 'grandBattles.ordersOffered': 3, 'grandBattles.spacingDays': 5 }
  },
  {
    area: 'Grand Battles',
    parameter: 'Host size',
    keys: { 'grandBattles.hostShare': { rival: 0.6, coalition: 0.5, siege: 0.7 } }
  },
  {
    area: 'Rivals',
    parameter: 'Benchmark b by weeks 1–8 / 9–20 / 21–36 / 37+',
    keys: {
      'rivals.benchmark.phases': [
        { fromWeek: 1, b: 0.72 },
        { fromWeek: 9, b: 0.78 },
        { fromWeek: 21, b: 0.82 },
        { fromWeek: 37, b: 0.86 }
      ],
      'rivals.benchmark.graceEase': [0, 0, 0.03, 0.06],
      'rivals.benchmark.floor': 0.7
    }
  },
  {
    area: 'Rivals',
    parameter: 'Income multiplier',
    keys: { 'rivals.incomeMult': { orc: 0.95, goblin: 1.1, dwarf: 1.0, archmage: 0.95 } }
  },
  {
    area: 'Rivals',
    parameter: 'Army cost per power point',
    keys: { 'rivals.armyCost.perPower': 10, 'rivals.armyCost.armyScale': 150 }
  },
  {
    area: 'Rivals',
    parameter: 'Budget split (army / expand / fortify / special)',
    keys: {
      'rivals.budget.orc': { army: 0.55, expand: 0.25, fortify: 0.1, special: 0.1 },
      'rivals.budget.goblin': { army: 0.15, expand: 0.45, fortify: 0.1, special: 0.3 },
      'rivals.budget.dwarf': { army: 0.25, expand: 0.15, fortify: 0.5, special: 0.1 },
      'rivals.budget.archmage': { army: 0.35, expand: 0.2, fortify: 0.15, special: 0.3 }
    }
  },
  {
    area: 'Rivals',
    parameter: 'Raid frequency',
    keys: { 'rivals.raidFrequency': { orc: 1.4, goblin: 1.0, archmage: 0.7, dwarf: 0.8 } }
  },
  {
    area: 'Rivals',
    parameter: 'War with player',
    keys: { 'rivals.disposition.warThreat': 60, 'rivals.disposition.warLandTakenWeeks': 2 }
  },
  {
    area: 'Respect',
    parameter: 'Gains and losses',
    keys: {
      'respect.change': {
        raidDefeated: 3,
        prizedWeek: 4,
        incursionWon: 5,
        tradeOrTruce: 2,
        hexSold: 5,
        raidLost: -2,
        villageCourted: -3,
        hexConquered: -5
      }
    }
  },
  {
    area: 'World',
    parameter: 'Coalitions',
    keys: {
      'world.coalitions.notBeforeWeek': 12,
      'world.coalitions.firstFallWeeks': 10,
      'world.coalitions.risingCrown.weeks': 6,
      'world.coalitions.betrayal': { chance: 0.15, minRespect: 50 },
      'world.coalitions.buyout': { cost: 300, minRespect: 40 }
    }
  },
  {
    area: 'World',
    parameter: 'Resolution pacing',
    keys: { 'world.resolution.notBeforeWeek': 12, 'world.resolution.oncePerWeeks': 8 }
  },
  {
    area: 'Defeat',
    parameter: 'Ascendancy',
    keys: {
      'defeat.ascendancy.fromWeek': 36,
      'defeat.ascendancy.fromWeekGraceIII': 44,
      'defeat.ascendancy.powerRatio': 1.5,
      'defeat.ascendancy.powerRatioGraceI': 1.6,
      'defeat.ascendancy.streakWeeks': 4,
      'defeat.ascendancy.ultimatumDays': 14,
      'defeat.ascendancy.liftBelowRatio': 1.3
    }
  },
  {
    area: 'Defeat',
    parameter: 'Power',
    keys: { 'defeat.power': { treasury: 0.5, army: 3, perRing: 10 } }
  },
  {
    area: 'Healer',
    parameter: 'Calorie range',
    keys: {
      'healer.logWindowDays': 21,
      'healer.kcalPerLb': 3500,
      'healer.range': { lowBelowTdee: 1000, highBelowTdee: 500 },
      'healer.minFloor': 1200,
      'healer.maxMovePerWeek': 100,
      'healer.underFloorShare': 0.9
    }
  },
  {
    area: 'World',
    parameter: 'Border Campaigns',
    keys: {
      'world.borderCampaigns': {
        firstWeek: 10,
        everyWeeks: 8,
        jitterWeeks: 1,
        attackerTrack: 2,
        armyShare: 0.5,
        roll: 0.15,
        armyLoss: 0.05
      }
    }
  }
]

/** The (area, parameter) rows of Appendix B, read from the design book itself. */
function bookRows(): string[] {
  const book = readFileSync('docs/game/design-book-v2.md', 'utf8')
  const section = book.slice(book.indexOf('## Appendix B'), book.indexOf('## Appendix C'))
  return section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Area') && !line.startsWith('| ---'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .map(([, area, parameter]) => `${area} / ${parameter}`)
}

test('Appendix B: the test below covers every row of the book\'s table', () => {
  const rows = bookRows()
  assert.equal(rows.length, 54, 'Appendix B has 54 rows')
  assert.deepEqual(
    APPENDIX_B.map((r) => `${r.area} / ${r.parameter}`),
    rows
  )
})

test('Appendix B: every parameter exists in RULES with the book value', () => {
  for (const row of APPENDIX_B) {
    for (const [key, value] of Object.entries(row.keys)) {
      const actual = at(key)
      assert.notEqual(actual, undefined, `${row.area} / ${row.parameter}: RULES.${key} is missing`)
      assert.deepEqual(actual, value, `${row.area} / ${row.parameter}: RULES.${key}`)
    }
  }
})

test('decisions A-17 to A-22, A-24, A-33 and A-38: TUNE values are in RULES', () => {
  assert.deepEqual(RULES.land.rivalGarrisonMult, { orc: 1.0, goblin: 0.9, dwarf: 1.3, archmage: 1.1 }) // A-17
  assert.deepEqual(RULES.rivals.start, { treasury: 150, armyPower: 40, respect: 20, disposition: 'tension', frontTrack: 0 }) // A-18
  assert.deepEqual(RULES.rivals.hired, { tag: 'coin', reach: 'melee' }) // A-19
  assert.equal(RULES.rivals.levyPower, 24) // A-20
  assert.equal(RULES.armory.elite.recruitCost, 300) // A-21: the Sworn join free; Elites cost 300
  assert.deepEqual(RULES.land.villageLoyalty, { afterConquestShare: 0.5, weeklyRecoveryShare: 0.05 }) // A-22
  assert.deepEqual(RULES.land.settling, { weeks: 4, titheShare: 0.5 }) // A-22
  assert.deepEqual(RULES.rivals.armyBands, [0.8, 1.25, 2]) // A-24
  assert.deepEqual(RULES.grandBattles.incursion, { formerHexes: 4, cooldownDays: 14 }) // A-33
  assert.equal(RULES.rivals.goblinPrizedFoodDays, 5) // A-38
})

test('rules.ts marks each TUNE assumption with its decision id', () => {
  const source = readFileSync('src/renderer/src/lib/game/rules.ts', 'utf8')
  for (const id of ['A-17', 'A-18', 'A-19', 'A-20', 'A-22', 'A-24', 'A-33']) {
    assert.match(source, new RegExp(`// TUNE \\(${id}\\)`), `missing // TUNE (${id})`)
  }
})

test('RULES is versioned 2.0.0', () => {
  assert.equal(RULES.ruleVersion, '2.0.0')
})

test('RULES is deep-frozen: mutating it throws in strict mode', () => {
  const rules = RULES as unknown as Record<string, any>
  assert.throws(() => {
    rules.ruleVersion = '9.9.9'
  }, TypeError)
  assert.throws(() => {
    rules.clock.dayCloseHour = 5
  }, TypeError)
  assert.throws(() => {
    rules.land.baseGarrison[0] = 1
  }, TypeError)
  assert.throws(() => {
    rules.contracts.lengths.push({ days: 60, multiplier: 3 })
  }, TypeError)
  assert.throws(() => {
    rules.contracts.lengths[0].unlock.kind = 'never'
  }, TypeError)
  assert.throws(() => {
    rules.combat.newRule = 1
  }, TypeError)
  assert.equal(RULES.clock.dayCloseHour, 4)
  assert.ok(Object.isFrozen(RULES.rivals.budget.orc))
})

test('base(ring) is 15 / 22 / 55 / 115 / 200 for rings 1 to 5', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(base), [15, 22, 55, 115, 200])
  assert.throws(() => base(0), RangeError)
  assert.throws(() => base(6), RangeError)
})

test('lengthMultiplier gives L for 1 / 3 / 7 / 14 / 30 days', () => {
  assert.deepEqual(contractLengths(), [1, 3, 7, 14, 30])
  assert.deepEqual(contractLengths().map(lengthMultiplier), [1.0, 1.15, 1.4, 1.7, 2.0])
  assert.throws(() => lengthMultiplier(5), RangeError)
})

test('byTier reads tiers I to V', () => {
  assert.equal(byTier(RULES.buildings.pureCompanyPower, 1), 5)
  assert.equal(byTier(RULES.buildings.pureCompanyPower, 5), 30)
  assert.equal(byTier(RULES.crossings.hybridPower, 3), 27)
  assert.throws(() => byTier(RULES.buildings.pureCompanyPower, 0), RangeError)
  assert.throws(() => byTier(RULES.buildings.pureCompanyPower, 6), RangeError)
})
