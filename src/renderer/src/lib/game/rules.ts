/**
 * The versioned tuning table: the design book's Appendix B, plus the numbers its chapters
 * state and the TUNE assumptions in docs/game/decisions.md. Nothing else in `lib/game` holds a
 * number (`npm run check:game` enforces it); per-entry content such as an item's cost lives in
 * the codex JSON instead, never in both places.
 *
 * Grouped by Appendix B's "Area" column. Lists "by tier" hold tiers I to V in order (read them
 * with `byTier`); lists "by ring" hold rings 1 to 5. Shares are fractions (0.05 = 5%).
 *
 * Shared by many tasks: append, don't reorganize. Change values between campaigns, never
 * during one, and bump `ruleVersion` when you do.
 */
import type { BuildingTier, CastleTier, Disposition, Reach, RivalId, Tag } from './types'

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

/** Freezes a value and everything inside it, so shared tables can't be changed by accident. */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

/** How a contract length unlocks (Ch 4). */
export type LengthUnlock =
  | { kind: 'start' }
  | { kind: 'anyBuildingTier'; tier: BuildingTier }
  | { kind: 'castleTier'; tier: CastleTier }

type PerRival<T> = Record<RivalId, T>

const RULES_TABLE = {
  ruleVersion: '2.0.0',

  clock: {
    /** Day D closes at 04:00 on D+1 in the campaign time zone (A-01). */
    dayCloseHour: 4,
    /** A settled day can be corrected until the following close (Ch 2 rule 4, A-02). */
    correctionGraceDays: 1,
    foundingGrant: 100,
    daysPerWeek: 7,
    /** "Away" means no launch for this many days (A-10); also opens the Homecoming (A-45). */
    absenceDays: 14,
    /** Homecoming shows after settling this many days in catch-up (A-45). */
    homecomingCatchUpDays: 3
  },

  contracts: {
    /** Lengths, their multiplier L and how each unlocks. */
    lengths: [
      { days: 1, multiplier: 1.0, unlock: { kind: 'start' } as LengthUnlock },
      { days: 3, multiplier: 1.15, unlock: { kind: 'start' } as LengthUnlock },
      { days: 7, multiplier: 1.4, unlock: { kind: 'anyBuildingTier', tier: 2 } as LengthUnlock },
      { days: 14, multiplier: 1.7, unlock: { kind: 'castleTier', tier: 2 } as LengthUnlock },
      { days: 30, multiplier: 2.0, unlock: { kind: 'castleTier', tier: 3 } as LengthUnlock }
    ],
    /** Payout = 10 × days × L × f(Q). */
    payoutPerDay: 10,
    /** f(Q) = clamp((Q − start) / span, 0, 1). */
    payoutCurve: { start: 0.4, span: 0.6 },
    /** Cap 10 × days (never more than the purse); returns pledge × 2 × f(Q). */
    pledge: { capPerDay: 10, returnMultiplier: 2 },
    /** Pays 10 × daysElapsed × 1.0 × f(Q) and returns half the pledge. */
    withdrawal: { perDay: 10, lengthMultiplier: 1.0, pledgeShareReturned: 0.5 },
    /** Ch 4: the Charter's allowed ranges. The calorie limit's minimum is the Healer's floor. */
    charter: {
      stepPool: { min: 10_000, max: 200_000 },
      calorieLimit: { max: 10_000 },
      duties: { min: 1, max: 5 }
    },
    /** Ch 4: the Table's budget score falls linearly to 0 at 15% over the limit. */
    table: { zeroAtShareOver: 0.15 },
    /** Ch 4: the Steward's Counsel after 4 weeks averaging below 75% or above 95%. */
    stewardCounsel: { weeks: 4, gentlerBelow: 0.75, firmerAbove: 0.95 },
    /** One contract runs; the next can be queued. */
    maxQueued: 1,
    /** Ch 14 and D-01: the Accord is a 30-day contract that also raises Respect. */
    accord: {
      days: 30,
      castleTier: 3,
      respectGainPerF: 50,
      respectGainPerFHigh: 60,
      highFromRespect: 75,
      signedAtRespect: 100
    }
  },

  respite: {
    earnEveryDays: 7,
    /** Bank size by Mage Tower tier: 4, 5 at Tier III, 6 at Tier V. */
    bankByMageTowerTier: [4, 4, 5, 5, 6],
    /** The Healing Springs (Milestone 6) add one. */
    healingSpringsBonus: 1,
    /** Spend on today or yesterday only. */
    spendBackDays: 1
  },

  reputation: {
    daily: { duties: 12, perfectDay: 5, streakPerDay: 1, streakCap: 7 },
    weekly: { steps: 70, calories: 70, flawless: 50, momentum: 60, tithePerRing: 4 },
    /** Merchant Hall bonus by tier, on every gain. */
    merchantHallBonus: [0.02, 0.05, 0.08, 0.12, 0.15],
    /** Each purse event is rounded to this when posted (A-11). */
    rounding: 0.1
  },

  momentum: {
    trendWindowDays: 21,
    minWeighIns: 2,
    minWeighInSpanDays: 6,
    /** T = min(cap, 0.4% of the 7-day average weight); the cap is settable from 0.3 to 1.0 lb. */
    targetPace: {
      capLb: 0.8,
      shareOfWeight: 0.004,
      averageDays: 7,
      capMinLb: 0.3,
      capMaxLb: 1.0,
      /** Ch 16: the cap never exceeds 0.75% of body weight a week. */
      ceilingShareOfWeight: 0.0075
    },
    /** Mf by the week's consistency, highest first. */
    plateauFloor: [
      { minConsistency: 0.85, floor: 0.6 },
      { minConsistency: 0.75, floor: 0.3 }
    ],
    /** A 28-day trend over 1% of weight a week holds Mw at 0.5. */
    tooFast: { windowDays: 28, shareOfWeightPerWeek: 0.01, heldMw: 0.5 },
    /** Ch 5 rule 7: a goal within 2% of current weight; Mw = 1 while the average stays within 2%. */
    maintenance: { goalWithinShare: 0.02, averageWithinShare: 0.02 }
  },

  milestones: {
    count: 10,
    stepMinLb: 3,
    stepMaxLb: 10,
    /** earliestWeek = ceil(lostAtMark / (0.0075 × startWeight)) (E-04). */
    earliestWeekRate: 0.0075,
    /** Journeys under 30 lb use 3 lb steps and Keeping Milestones past the goal. */
    smallJourneyUnderLb: 30,
    /** Journeys over 100 lb: 10 Milestones over the first 100 lb. */
    largeJourneyOverLb: 100,
    keeping: { weeks: 4, withinShare: 0.02 },
    /** Lock 1: two weigh-ins at least 6 days apart, or the 7-day average. */
    lock: { minSpanDays: 6, averageDays: 7 },
    dispensation: { weeks: 8, minRealmConsistency: 0.85, oncePerWeeks: 8 },
    goalChangeEveryDays: 28,
    minBmi: 18.5,
    /** Ch 9: the Milestone that opens each unlock. Tier V needs Milestone 6 (A-42). */
    unlocks: {
      armory: 1,
      rankIItems: 1,
      wings: [2, 5, 8],
      elites: 3,
      provingGrounds: 4,
      secondItemSlot: 4,
      rankIIItems: 5,
      healingSprings: 6,
      tierV: 6,
      eliteRankII: 7,
      sworn: 7,
      rankIIIItems: 8,
      crownForge: 8,
      legendaryItems: 9,
      statue: 10,
      crownguardAscendant: 10
    },
    /** Ch 9 boons: Proving Grounds all companies +10%; Crown Forge +1 banner; Statue +10% reputation. */
    boons: { provingGroundsPower: 0.1, crownForgeBanners: 1, statueReputation: 0.1 }
  },

  grace: {
    /** Steadiness needed for levels I, II and III. */
    thresholds: [0.5, 0.7, 0.85],
    /** Steadiness = average M over the last 8 weeks; needs 4 weeks; moves one level a week. */
    windowWeeks: 8,
    minWeeks: 4,
    maxLevelChangePerWeek: 1,
    /** Grace I: reclaim a hex lost in the last 14 days for half its garrison, no battle. */
    reclaim: { level: 1, windowDays: 14, garrisonShare: 0.5 }
  },

  buildings: {
    tierDominion: [0, 8, 24, 68, 68],
    tierCost: [0, 150, 450, 1_100, 1_800],
    pureCompanyPower: [5, 9, 14, 21, 30],
    /** Ch 7: each tier's effect is that tier's total, not cumulative (A-31). */
    merchantHall: {
      hiredBlades: { tier: 2, costPerBattle: 20 },
      pledgeCap: { tier: 3, mult: 1.5 },
      minPledgeReturn: { tier: 4, share: 0.5 }
    },
    mageTower: {
      /** Mythic attacks weaker by tier (II −10%, IV −20%, V −30%). */
      mythicReduction: [0, 0.1, 0.1, 0.2, 0.3],
      /** Tier IV: threats and Grand Battles foretold a day earlier; exact strengths and rosters shown. */
      foresight: { tier: 4, days: 1 }
    },
    foundry: {
      /** The arms bonus `a` by tier. */
      armsBonus: [0, 0.05, 0.1, 0.15, 0.2],
      walls: [0, 3, 6, 9, 12]
    }
  },

  castle: {
    /** Building tiers needed for castle tiers I to IV. Tier V needs every rival resolved. */
    tierSum: [0, 8, 12, 16],
    /** Cost of castle tiers I to IV. Tier V is never bought. */
    tierCost: [0, 250, 750, 1_500],
    banners: [2, 3, 4, 5, 6],
    walls: [4, 8, 14, 22, 30],
    /** Castle IV allows a second daily assault. */
    secondAssaultTier: 4
  },

  crossings: {
    stageCost: [200, 600, 1_200],
    hybridPower: [12, 18, 27],
    /** Both buildings need this tier for stages I, II and III. */
    stageBuildingTier: [2, 3, 4]
  },

  crownguard: {
    /** Raised when every building is at Tier IV. */
    buildingTier: 4,
    power: 40,
    powerAllTierV: 55,
    /** The Crownguard Ascendant (Milestone 10). */
    ascendantBonus: 10
  },

  land: {
    /** base(ring) for rings 1 to 5: garrisons and threat strength. */
    baseGarrison: [15, 22, 55, 115, 200],
    garrison: { beasts: 0.9, villageMilitia: 0.6, fortificationPerLevel: 0.25 },
    rivalGarrisonMult: { orc: 1.0, goblin: 0.9, dwarf: 1.3, archmage: 1.1 } as PerRival<number>, // TUNE (A-17)
    /** Fortification cost × ring, levels 1 to 3. */
    fortificationCost: [15, 35, 70],
    fortificationMax: 3,
    /** The Dwarf can reach level 4 on its own hexes. */
    dwarfFortificationMax: 4,
    /** A repulsed assault takes 25% of the Assault value off the garrison until week close. */
    repulseWear: 0.25,
    weary: { powerPenalty: 0.2, days: 1 },
    assaultsPerDay: 1,
    /** A taken village Settles for 4 weeks at half tithes. */
    settling: { weeks: 4, titheShare: 0.5 },
    /** The player's own villages: 50% of 15 × ring after a conquest; recover 5% of 15 × ring a week. */
    villageLoyalty: { afterConquestShare: 0.5, weeklyRecoveryShare: 0.05 }, // TUNE (A-22)
    /** Rings 0 to 2 are never taken from the player. */
    protectedThroughRing: 2,
    claimableRings: { min: 1, max: 5 },
    /** A sealed lair halves mythic attacks from its side. */
    sealedLairMythicMult: 0.5
  },

  influence: {
    /** Trust = clamp(0.6 + 0.6 × RC, 0.6, 1.2). */
    trust: { base: 0.6, perRealmConsistency: 0.6, min: 0.6, max: 1.2 },
    rivalTrust: 1.0,
    loyalty: { neutralPerRing: 15, rivalPerRing: 30, gateMult: 2 },
    failedBid: { refundShare: 0.5, loyaltyDropShareOfOffer: 0.1 },
    /** Two suitors: the loser gets half back. */
    outbidRefundShare: 0.5,
    /** Base 2; +1 at Merchant Hall III and +1 more at Merchant Hall V (A-32). */
    courtshipSlots: {
      base: 2,
      merchantHall: [
        { tier: 3, add: 1 },
        { tier: 5, add: 1 }
      ]
    }
  },

  trade: {
    /** Hex price = 50 × ring × greed, ×1.5 for a village. */
    hexPricePerRing: 50,
    villageMult: 1.5,
    greed: { orc: 1.5, goblin: 1.2, dwarf: 2.0, archmage: 1.4 } as PerRival<number>,
    /** Selling pays 0.7 × the buy price, never for rings 1 to 2. */
    sellShare: 0.7,
    sellMinRing: 3,
    /** Truce: 30 × the highest ring that rival borders; no raids or conquest for 7 days. */
    truce: { costPerRing: 30, days: 7 },
    pact: { cost: 250, days: 28, raidRateMult: 0.5 },
    callToArms: { cost: 200, days: 14 },
    hexDealEveryWeeks: 4
  },

  combat: {
    threatMix: { beasts: 0.4, mythic: 0.2, raid: 0.4 },
    strength: {
      beasts: 0.9,
      mythic: 1.15,
      /** Raid = max(0.8 × base, 0.25 × AV × temper). */
      raidBase: 0.8,
      raidArmy: 0.25,
      /** Conquest attempt = max(1.0 × base, 0.5 × AV). */
      conquestBase: 1.0,
      conquestArmy: 0.5,
      /** Every threat rolls up to 15% either way. */
      roll: 0.15
    },
    temper: { orc: 1.2, goblin: 0.9, dwarf: 1.05, archmage: 1.05 } as PerRival<number>,
    /** Saturday's daily threat strikes at +40%. 0 = Sunday … 6 = Saturday. */
    siegeDay: { weekday: 6, bonus: 0.4 },
    /** Threat strength in the first weeks; no conquest attempts before week 6. */
    earlyGrace: [
      { throughWeek: 2, mult: 0.7 },
      { throughWeek: 4, mult: 0.85 }
    ],
    noConquestBeforeWeek: 6,
    /** Conquest attempts only target border hexes in ring 3 or beyond, one per rival a day. */
    conquestMinRing: 3,
    match: { weak: 1.5, neutral: 1.0, resist: 0.6 },
    /** 50% at the start; Barracks III / IV / V set 55 / 60 / 65%; the Healing Springs add 10%. */
    rallyFloor: { base: 0.5, byBarracksTier: [0.5, 0.5, 0.55, 0.6, 0.65], healingSprings: 0.1 },
    /** Victory pays 4 × ring, a rout (at 1.5 × strength) 6 × ring. */
    spoils: { winPerRing: 4, routPerRing: 6, routAt: 1.5 },
    /** Defeat costs 3 × ring tribute, halved at Grace II. */
    tribute: { perRing: 3, graceIIMult: 0.5 },
    scorchedDays: 3,
    contestedDays: { base: 1, graceII: 2 },
    /** A border hex's chance of being hit is weighted by ring^1.5. */
    targetRingExponent: 1.5,
    /** T08: tidings band a threat by its strength over the defense's Army: Weaker, Matched, Stronger, Overwhelming. */
    strengthBands: [0.8, 1.25, 2], // TUNE (A-133)
    /** T08: tidings are fixed for every foretold day, but never further ahead than this. */
    maxForetellDays: 3
  },

  grandBattles: {
    healthPerPower: 4,
    rangedMult: 0.8,
    /** R = 0.6 + 0.5 × the 7-day average Valor; the Marshal fights at R − 0.1. */
    readiness: { base: 0.6, perValor: 0.5, valorDays: 7, marshalPenalty: 0.1 },
    rounds: 4,
    ordersOffered: 3,
    spacingDays: 5,
    hostShare: { rival: 0.6, coalition: 0.5, siege: 0.7 },
    /** Up to banners + 2 companies, never more than 6. */
    companiesOverBanners: 2,
    maxCompanies: 6,
    /** Charge deals ×1.5 and takes ×1.25 (D-03); Brace deals and takes ×0.5; Spell hits for 0.5 × power. */
    intents: { charge: { deals: 1.5, takes: 1.25 }, brace: { deals: 0.5, takes: 0.5 }, spellShare: 0.5 },
    /** A win at twice the enemy's remaining health share is a Rout. */
    routShareRatio: 2,
    wearyDaysAfterRout: 3,
    retryDays: { mythicHunt: 7, gate: 14, capital: 14 },
    warningDays: { incursion: 2, gate: 2, capital: 3, mythicHunt: 2, coalitionOffensive: 3, siege: 14 },
    /** 8% of assaults on ring 4 to 5 beast hexes in the West or East reveal a rare creature. */
    mythicReveal: { chance: 0.08, minRing: 4 },
    /** Mythic Hunt rosters scale by 1 + week / 52. */
    mythicScaleWeeks: 52,
    /** An Incursion: a hex beside the Gate, or 4+ of that rival's former hexes held. */
    incursion: { formerHexes: 4, cooldownDays: 14 }, // TUNE (A-33)
    outcomes: {
      incursionWin: { armyLoss: 0.4, spoilsPerRing: 30 },
      gateLoss: { tributePerRing: 5 },
      capitalLoss: { armyGain: 0.1 },
      mythicHuntWin: { reputation: 150 },
      mythicHuntLoss: { tributePerRing: 5 },
      coalitionWin: { spoilsPerRing: 40, endsEarlyWeeks: 2 }
    }
  },

  rivals: {
    /** The hidden benchmark consistency b by campaign week, and the contract L it assumes. */
    benchmark: {
      phases: [
        { fromWeek: 1, b: 0.72 },
        { fromWeek: 9, b: 0.78 },
        { fromWeek: 21, b: 0.82 },
        { fromWeek: 37, b: 0.86 }
      ],
      contractMultiplier: [
        { fromWeek: 1, L: 1.0 },
        { fromWeek: 3, L: 1.4 },
        { fromWeek: 10, L: 1.7 },
        { fromWeek: 21, L: 2.0 }
      ],
      /** b eases by Grace level: −3 points at II, −6 at III. */
      graceEase: [0, 0, 0.03, 0.06],
      floor: 0.7,
      /** P = round(7 × b³) perfect days a week. */
      perfectDaysPerB3: 7
    },
    incomeMult: { orc: 0.95, goblin: 1.1, dwarf: 1.0, archmage: 0.95 } as PerRival<number>,
    /** The budget is the treasury above this reserve. */
    reserve: 100,
    /** Each point of power costs 10 × (1 + AV / 150). */
    armyCost: { perPower: 10, armyScale: 150 },
    budget: {
      orc: { army: 0.55, expand: 0.25, fortify: 0.1, special: 0.1 },
      goblin: { army: 0.15, expand: 0.45, fortify: 0.1, special: 0.3 },
      dwarf: { army: 0.25, expand: 0.15, fortify: 0.5, special: 0.1 },
      archmage: { army: 0.35, expand: 0.2, fortify: 0.15, special: 0.3 }
    } as PerRival<{ army: number; expand: number; fortify: number; special: number }>,
    raidFrequency: { orc: 1.4, goblin: 1.0, dwarf: 0.8, archmage: 0.7 } as PerRival<number>,
    /** Raider weights (A-26): ×0.5 at war with another rival, ×1.25 in a coalition. */
    raiderWeight: { atWarWithRival: 0.5, inCoalition: 1.25 },
    expansion: {
      targets: { orc: 1, goblin: 2, dwarf: 1, archmage: 1 } as PerRival<number>,
      /** A beast den falls if 0.5 × AV × roll(0.85 to 1.15) ≥ its garrison. */
      denArmyShare: 0.5,
      roll: 0.15,
      villageBidMult: { orc: 1.1, goblin: 1.3, dwarf: 1.1, archmage: 1.1 } as PerRival<number>
    },
    /** Counter-bids on villages the player courts, up to this share of the reserve. */
    counterBidReserveShare: { orc: 0.6, goblin: 1.0, dwarf: 0.6, archmage: 0.6 } as PerRival<number>,
    special: {
      orcWarhostFund: 600,
      goblinMercenaries: { armyBonus: 0.15, weeks: 2 },
      dwarfFortifyDiscount: 0.25,
      archmageRitual: { everyWeeks: 6, cost: 400 }
    },
    /** Threat = 40 × min(2, ratio) + 15 × resolved, +10 on 3+ shared hexes, +10 for land taken in 4 weeks, ≤ 100. */
    threat: {
      ratioWeight: 40,
      ratioCap: 2,
      perResolved: 15,
      border: { minHexes: 3, bonus: 10 },
      recentLand: { weeks: 4, bonus: 10 },
      max: 100
    },
    /** War at Threat 60 or land taken in 2 weeks; Peace at Respect 50 and 4 quiet weeks. */
    disposition: { warThreat: 60, warLandTakenWeeks: 2, peaceRespect: 50, peaceQuietWeeks: 4 },
    /** Conquest attempts need 0.5 × AV ≥ 0.8 × the player's expected defense. */
    conquestAttempt: { armyShare: 0.5, defenseShare: 0.8 },
    /** Every rival's state at the founding. */
    start: {
      treasury: 150,
      armyPower: 40,
      respect: 20,
      disposition: 'tension' as Disposition,
      frontTrack: 0
    }, // TUNE (A-18)
    fronts: {
      /** Chance a front goes to war in a week: 40% if it touches the Orc, otherwise 25%. */
      warChance: { touchingOrc: 0.4, other: 0.25 },
      track: { min: -3, max: 3 },
      skirmishesPerDay: 1,
      /** Each week at war costs both sides 5% of their AV. */
      warArmyLoss: 0.05,
      /** Emboldened at +3: raids +15%. Humbled at −3: raids −15%. */
      emboldenedRaid: 0.15,
      humbledRaid: 0.15,
      /** A week at Peace moves the track one step toward 0 (A-37). */
      peaceStep: 1
    },
    /** A rival's vassal, envoy or ally company (Ch 14). Tags and reach are in the codex (A-20). */
    levyPower: 24, // TUNE (A-20)
    /** Hired companies have the Merchant Hall's current pure company power, Coin and melee. */
    hired: { tag: 'coin' as Tag, reach: 'melee' as Reach }, // TUNE (A-19)
    /** What the player sees: treasury bands (Meager, Modest, Prosperous, Mighty). */
    treasuryBands: [300, 800, 2_000],
    /** Army bands against the player's best (banners + 2): Weaker, Matched, Stronger, Overwhelming. */
    armyBands: [0.8, 1.25, 2], // TUNE (A-24)
    /** A-38: the Goblin's prized week needs food logged on at least 5 days. */
    goblinPrizedFoodDays: 5 // TUNE (A-38)
  },

  respect: {
    min: 0,
    max: 100,
    change: {
      raidDefeated: 3,
      prizedWeek: 4,
      incursionWon: 5,
      tradeOrTruce: 2,
      hexSold: 5,
      raidLost: -2,
      villageCourted: -3,
      hexConquered: -5
    },
    thresholds: {
      raidsWeaker: 25,
      goblinBuysHex: 25,
      sellHex: 25,
      pact: 40,
      envoy: 50,
      buyHex: 50,
      accordTalks: 60,
      callToArms: 60,
      accordEasier: 75
    },
    raidsWeakerMult: 0.9,
    envoyCostPerBattle: 25
  },

  world: {
    coalitions: {
      notBeforeWeek: 12,
      firstFallWeeks: 10,
      risingCrown: { weeks: 6, powerRatio: 1.5, streakWeeks: 3 },
      betrayal: { chance: 0.15, minRespect: 50 },
      buyout: { cost: 300, minRespect: 40 },
      warChestShare: 0.1,
      offensiveWithinDays: 14,
      raidMult: 1.25,
      goblinMercenariesEveryWeeks: 4,
      watcherThreat: 10,
      lastAllianceRefusalRespect: 60,
      graceIIIShortenWeeks: 2
    },
    /** No rival resolved before week 12, and one per 8 weeks. */
    resolution: { notBeforeWeek: 12, oncePerWeeks: 8 },
    /** Week 10, then every 8 weeks (±1 seeded); the attacker needs track +2 at War. */
    borderCampaigns: { firstWeek: 10, everyWeeks: 8, jitterWeeks: 1, attackerTrack: 2, armyShare: 0.5, roll: 0.15, armyLoss: 0.05 },
    /** Ch 13: what a rival's fall does to the others. */
    fallout: { conqueredThreat: 15, abdicatedThreat: 10, alliedThreat: 5, conqueredLoyaltyMult: 0.5 },
    /** An allied rival may join one Grand Battle a month. */
    allyBattlesPerMonth: 1,
    events: { maxNewPerWeek: 1, minBattleWarningDays: 2 }
  },

  defeat: {
    ascendancy: {
      fromWeek: 36,
      fromWeekGraceIII: 44,
      powerRatio: 1.5,
      powerRatioGraceI: 1.6,
      streakWeeks: 4,
      ultimatumDays: 14,
      liftBelowRatio: 1.3
    },
    /** From week 32 the Herald warns when a rival's Power passes 1.3× the player's. */
    warning: { fromWeek: 32, powerRatio: 1.3 },
    bendTheKnee: { treasuryShare: 0.25, delayWeeks: 4, timesPerCampaign: 1 },
    siegeWon: { armyLoss: 0.5, respect: 10, immuneWeeks: 8 },
    /** No siege within 7 days of returning from an absence (Ch 14 rule 7). */
    noSiegeAfterReturnDays: 7,
    /** Power = 0.5 × treasury + 3 × AV + 10 × Σ rings held; the player's AV counts banners + 2. */
    power: { treasury: 0.5, army: 3, perRing: 10 }
  },

  healer: {
    logWindowDays: 21,
    minLoggedDays: 14,
    kcalPerLb: 3_500,
    /** The range is TDEE − 1,000 to TDEE − 500; the floor is never below 1,200. */
    range: { lowBelowTdee: 1_000, highBelowTdee: 500 },
    minFloor: 1_200,
    maxMovePerWeek: 100,
    roundTo: 50,
    /** Logged days below 90% of the floor count as over budget. */
    underFloorShare: 0.9,
    /** A two-week logged average under the floor brings a check-in. */
    checkInWindowDays: 14,
    /** Before there is data: 14-day Fitbit burned average, else Mifflin–St Jeor × 1.4. */
    bootstrap: {
      burnedWindowDays: 14,
      activityFactor: 1.4,
      mifflin: { perKg: 10, perCm: 6.25, perYear: 5, male: 5, female: -161 }
    },
    /** A rough patch (Ch 16 "Illness and travel"): this many low-scoring days in a row. */
    roughPatchDays: 3 // TUNE (A-120)
  },

  armory: {
    /** One item slot per company from Milestone 1, two from Milestone 4. */
    itemSlots: { base: 1, withSecondSlot: 2 },
    /** Elites recruit for 300; rank II costs 600 more. The Sworn join free (A-21). */
    elite: { recruitCost: 300, rankIICost: 600 }
  },

  map: {
    /** Ch 3: six rings around the castle, 127 hexes; ring 6 is the Rim. */
    radius: 6,
    /** Ch 3 rule 3: a road hex gives 2 × ring to its building; a between-land hex gives ring to each of its two. */
    dominion: { roadPerRing: 2, betweenPerRing: 1 },
    /** A-13: villages seeded in rings 1 to 5 (4 in the Commons, 6 in the Wildwood, 8 in the Marches). */
    seededVillages: [0, 4, 6, 8, 0],
    /** A-13: a road village credits its building 1; a between-land village credits each of its two 0.5. */
    villageCredit: { road: 1, between: 0.5, maxSpread: 1 },
    /**
     * A-108: seeded villages never touch a rival village or a village in their own ring, and at
     * most this many pairs of them touch across neighboring rings (2 is the fewest 4/6/8 allows).
     * Each attempt (labels villages:0, villages:1, …) searches at most `searchBudget` steps;
     * running out of attempts is a bug.
     */
    villageSeeding: { maxTouchingPairs: 2, searchBudget: 20_000, maxAttempts: 1_000 } // TUNE (A-108)
  },

  scores: {
    /** Realm Consistency is Q over the last 28 settled days (Ch 5, A-39). */
    realmConsistencyDays: 28
  },

  /** Weight rules compute in lb (A-05); BMI uses kg and m. */
  units: { lbPerKg: 2.2046226218, cmPerM: 100 },

  /** T06: founding and the settlement engine. */
  settlement: {
    /** The Border Campaign schedule is fixed this many weeks ahead and extended as weeks pass. */
    borderScheduleAheadWeeks: 104,
    /**
     * Founding snapshots this many days before the start, so the weight trend (28-day too-fast
     * window), the Healer (21 days) and the burned bootstrap (14 days) can look back from week 1.
     */
    preludeDays: 28
  },

  /** T07: realm effects, buildings and the roster. */
  effects: {
    /** The Crown's Grace level from which tribute halves and contested hexes hold longer (Ch 9). */
    graceIILevel: 2
  }
}

export const RULES = deepFreeze(RULES_TABLE)
export type Rules = typeof RULES

/** base(ring) for rings 1 to 5 (Ch 6, Ch 10). */
export function base(ring: number): number {
  const value = RULES.land.baseGarrison[ring - 1]
  if (value === undefined) throw new RangeError(`No base garrison for ring ${ring}`)
  return value
}

/** The length multiplier L for a contract length in days. */
export function lengthMultiplier(days: number): number {
  const length = RULES.contracts.lengths.find((l) => l.days === days)
  if (!length) throw new RangeError(`No contract length of ${days} days`)
  return length.multiplier
}

/** The contract lengths, shortest first. */
export function contractLengths(): number[] {
  return RULES.contracts.lengths.map((l) => l.days)
}

/** Reads a "by tier" list (tiers I to V, or stages I to III) for a 1-based tier. */
export function byTier<T>(list: readonly T[], tier: number): T {
  const value = list[tier - 1]
  if (value === undefined) throw new RangeError(`No value for tier ${tier}`)
  return value
}
