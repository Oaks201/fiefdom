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
import type { BuildingTier, CastleTier, Disposition, Reach, RivalId, Tag, ThreatKind } from './types'

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
  ruleVersion: '3.1.0',

  clock: {
    /** Day D closes at 04:00 on D+1 in the campaign time zone (A-01). */
    dayCloseHour: 4,
    /** A settled day can be corrected until the following close (Ch 2 rule 4, A-02). */
    correctionGraceDays: 1,
    /** D-14: a first courtship and a first Tier II in the opening days (the book's 100 couldn't buy Tier II at 150). */
    foundingGrant: 250,
    daysPerWeek: 7,
    /** The weekly weigh-in day (D-13): Monday, whatever day the week starts on (0 = Sunday). */
    weighInWeekday: 1,
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
    /** D-06: a contract may start on any of this many days from its earliest dawn. */
    startChoiceDays: 7,
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
    /** D-17 (C-17): tithes are × band, not ring, at 2.5 (the book's 4), for 76 villages at greater depth. TUNE. */
    weekly: { steps: 70, calories: 70, flawless: 50, momentum: 60, tithePerRing: 2.5 },
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
    // Lock 1 (D-11): a single weekly weigh-in at or below the mark. It has no numbers of its own.
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
    /**
     * D-18: each tier needs this much total Dominion (all four paths summed). Tier II stays at D-14's 1
     * (the first Hearth hex opens it); III to V are the book's per-building 24 and 68 summed over the
     * four buildings (about 90 and 270), so the gates hold as the book had them. TUNE.
     */
    tierDominion: [0, 1, 90, 270, 270],
    /** D-15: Tiers III to V cost twice the book's 450 / 1,100 / 1,800, so the build lasts the campaign. */
    tierCost: [0, 150, 900, 2_200, 3_600],
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
    /** D-15: Castle III costs 1.5 × the book's 750 and Castle IV twice its 1,500. */
    tierCost: [0, 250, 1_125, 3_000],
    banners: [2, 3, 4, 5, 6],
    walls: [4, 8, 14, 22, 30],
    /** Castle IV allows a second daily assault. */
    secondAssaultTier: 4
  },

  crossings: {
    /** D-15: stages II and III cost twice the book's 600 / 1,200. */
    stageCost: [200, 1_200, 2_400],
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
    /** base(ring) for the heartland's rings 1 and 2: their hexes' strength. D-14: ring 2 is 18 (the book's 22). */
    baseGarrison: [15, 18],
    /**
     * D-17: beyond the heartland a hex's strength is its march's depth curve, `first × depth^exponent`,
     * times a seeded jitter within ±`jitter`, fixed at founding, so within a row there is always a
     * cheapest hex and a next one just past the army's reach. A power curve, not a steady growth per
     * step: the army grows about linearly over the campaign, and a growth per step that keeps the
     * opening honest leaves the deep marches out of reach for good. A lair's wedge climbs faster, to
     * about a rival march's depth 8 by its depth 5. A neutral hex's garrison is its kind's share
     * (beasts or militia, below) of it. TUNE.
     */
    depthCurve: { rival: { first: 33, exponent: 1.17 }, lair: { first: 33, exponent: 1.52 }, jitter: 0.15 },
    garrison: { beasts: 0.9, villageMilitia: 0.6, fortificationPerLevel: 0.25 },
    rivalGarrisonMult: { orc: 1.0, goblin: 0.9, dwarf: 1.3, archmage: 1.1 } as PerRival<number>, // TUNE (A-17)
    /** Fortification cost × ring, levels 1 to 3. */
    fortificationCost: [15, 35, 70],
    fortificationMax: 3,
    /** The Dwarf can reach level 4 on its own hexes. */
    dwarfFortificationMax: 4,
    /** A repulsed assault takes 25% of the Assault value off the garrison; Patch 3 (D-22): the wear stays until the hex falls, decaying by `sieges.wearDecay`. */
    repulseWear: 0.25,
    weary: { powerPenalty: 0.2, days: 1 },
    assaultsPerDay: 1,
    /** A taken village Settles for 4 weeks at half tithes. */
    settling: { weeks: 4, titheShare: 0.5 },
    /** The player's own villages: 50% of 15 × ring after a conquest; recover 5% of 15 × ring a week. */
    villageLoyalty: { afterConquestShare: 0.5, weeklyRecoveryShare: 0.05 }, // TUNE (A-22)
    /** Rings 0 to 2 are never taken from the player. */
    protectedThroughRing: 2,
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
    /** Selling pays 0.7 × the buy price, never for bands 1 to 2 (the heartland). */
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
    /** A border hex's chance of being hit is weighted by band^1.5 (D-17). */
    targetRingExponent: 1.5,
    /** T08: tidings band a threat by its strength over the defense's Army: Weaker, Matched, Stronger, Overwhelming. */
    strengthBands: [0.8, 1.25, 2], // TUNE (A-133)
    /**
     * D-15: a defense routed by these threats (their strength at least `routedAt` × the Defense) on a
     * hex in this ring or beyond that is not a village returns the hex to the wilds instead of
     * scorching it. A narrower loss scorches it as before. TUNE.
     */
    wildsReclaim: { minRing: 3, threats: ['beasts', 'mythic'] as ThreatKind[], routedAt: 1.25 },
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
    retryDays: { mythicHunt: 7, gate: 14, capital: 14, stronghold: 14 },
    /** The Orc's Warhost is Incursion-style (T10, A-151), so it warns like one. */
    warningDays: { incursion: 2, gate: 2, capital: 3, mythicHunt: 2, coalitionOffensive: 3, siege: 14, warhost: 2, stronghold: 2 },
    /** 8% of assaults on band 4 to 5 beast hexes in a lair's wedge or on its flank reveal a rare creature (D-17). */
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
      coalitionWin: { spoilsPerRing: 40, endsEarlyWeeks: 2 },
      /** Patch 3 (D-23): a stronghold battle lost costs tribute × band, as a Gate's does. TUNE. */
      strongholdLoss: { tributePerRing: 5 }
    },
    /** "Once a month" (the Herald's Horn, the Scrying Pool, an ally's battle) is once per block of 4 campaign weeks. */
    monthWeeks: 4 // TUNE (A-157)
  },

  /** D-12: the day's fights a player chooses to lead on the battle map ("Start battle"). */
  skirmish: {
    rounds: 2,
    /**
     * The enemy's total power as a multiple of the threat's strength (or the garrison), by the
     * number of companies fielded (1 to 6), so that the Marshal's play about matches the
     * day-close formula. TUNE: from `sim/skirmish-calibrate.ts sample` (3,849 fights, 15 greedy
     * campaigns; 1 and 6 companies were too rare to fit and take their neighbors' values).
     */
    hostScale: [0.79, 0.79, 0.76, 0.71, 0.79, 0.79],
    /**
     * Mythic foes field this share of `hostScale`: on the field the Marshal held fewer mythic
     * attacks than the formula (43% to 49% on the same fights), and the trophies lost compounded.
     * TUNE: owner-approved 2026-10-11 from `docs/game/sim/skirmish-report.md` (0.85 to 0.88).
     */
    mythicScale: 0.85,
    /** Days a led fight is kept for its replay. */
    keepDays: 7
  },

  rivals: {
    /**
     * The hidden benchmark consistency b by campaign week, and the contract L it assumes. D-14:
     * the book's 72 / 78 / 82 / 86% × 1.05, so weak habits still fall behind after the faster opening.
     */
    benchmark: {
      phases: [
        { fromWeek: 1, b: 0.756 },
        { fromWeek: 9, b: 0.819 },
        { fromWeek: 21, b: 0.861 },
        { fromWeek: 37, b: 0.903 }
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
    /**
     * Power = 0.5 × treasury + 3 × AV + perRing × Σ band held; the player's AV counts banners + 2.
     * D-17 (C-17): × band, not ring, at 3 (the book's 10) so land Power stays near its old share on
     * a map 3.5 times the size. TUNE.
     */
    power: { treasury: 0.5, army: 3, perRing: 3 }
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
    roughPatchDays: 3, // TUNE (A-120)
    /** A low-scoring day, for the rough patch: its duties, food and steps average below this (T14). */
    roughDayBelow: 0.5 // TUNE (A-179)
  },

  armory: {
    /** One item slot per company from Milestone 1, two from Milestone 4. */
    itemSlots: { base: 1, withSecondSlot: 2 },
    /** Elites recruit for 300; rank II costs 600 more. The Sworn join free (A-21). */
    elite: { recruitCost: 300, rankIICost: 600 }
  },

  map: {
    /** D-16: the heartland is rings 0 to 2, exactly as Ch 3 built it. */
    heartlandRings: 2,
    /**
     * D-16 (R-01, R-02): each rival march runs out along its road from the heartland, 2 hexes each
     * side of the road (5 wide) and 12 deep, its Gate at depth 12 and its capital and realm beyond.
     */
    marchHalfWidth: 2,
    marchDepth: 12,
    /** D-16 (P2-07, C-01): each lair's march fills the gap between its two rival marches, 5 deep, its Lair Mouth at depth 5. TUNE. */
    lairDepth: 5,
    /** D-16 (P2-01): each rival holds its march from this depth at founding: the outer third. */
    rivalHeldFromDepth: 9,
    /**
     * D-17: a hex's band, 1 to 5, for everything that once scaled with its ring (spoils, tribute,
     * tithes, prices, fortification, loyalty, Power): the heartland's rings 1 and 2, then one band for
     * every 4 depths of a rival march (3, 4, 5) and every 2 of a lair's.
     */
    bands: { rivalDepthsPerBand: 4, lairDepthsPerBand: 2, max: 5 },
    /**
     * D-16 (P2-02): villages, about 1 hex in 4: the heartland's 4 in ring 2 (A-13), 5 in each third
     * of a rival march (its Gate one of the outer third's), 2 in each band of a lair's wedge. No two
     * villages of a group touch, at most `maxTouchingPairs` pairs touch across groups (as A-108 allowed
     * on the old map), and each path's village credit is within `maxCreditSpread` of every other's.
     * Each attempt (labels villages:0, villages:1, …) is a seeded pass; running out is a bug.
     */
    villages: { heartland: 4, perRivalThird: 5, perLairBand: 2, maxCreditSpread: 1, maxTouchingPairs: 6, maxAttempts: 1_000 }, // TUNE
    /** D-16 (P2-06): each dawn a seam's ruling march is drawn: its first march at this chance. */
    seamFirstChance: 0.5
  },

  /** Patch 2 (D-18): Dominion as the chronicle of the player's war (R-05). Every value TUNE. */
  dominion: {
    /** C-04: a heartland hex gives this much Holdings to the path(s) it faces (the first Hearth hex opens Tier II, D-14). */
    heartlandHolding: 1,
    /** Renown for each deed (P2-13), times the hex's path shares where it has one. */
    deeds: {
      /** Taking a march hex: its depth, plus this per fortification level it had. */
      hexTakenPerDepth: 1,
      perFortification: 2,
      battleWon: 1.5,
      heldAgainstBeasts: 0.5,
      heldAgainstMythic: 1,
      grandBattleWon: 15,
      resolved: 100,
      /** D-25: a stronghold taken, this × its depth × its shares, on top of the hex deed. TUNE. */
      strongholdPerDepth: 2,
      /** D-25: a counterattack held, to the rival's path; against beasts, `counterattackHeldBeasts` × the hex's shares. It replaces that battle's ordinary deed. TUNE. */
      counterattackHeld: 2,
      counterattackHeldBeasts: 1
    },
    /** A fully walked path: its march held (Holdings about 440), its hexes taken, its battles fought and its rival resolved (Renown about 660). TUNE. */
    fullPath: 1_100,
    /** P2-14: ranks I to V at these shares of a full path. Ranks never fall (P2-15). */
    rankShares: [0.1, 0.25, 0.45, 0.7, 1],
    /** C-18: each rank's stand-in perk on its building's role, until Patch 4's real perks. */
    rankPerks: { rallyFloor: 0.01, reputationBonus: 0.005, mythicReduction: 0.02, armsBonus: 0.01, walls: 1 }
  },

  /** Patch 2 (D-19): neglected marches harden (R-03, R-06). TUNE. */
  marches: {
    /** Each quiet week raises a rival march a level, each pushed week lowers it: garrisons there × (1 + perLevel × level). */
    preparation: { perLevel: 0.05, max: 8 }
  },

  scores: {
    /** Realm Consistency is Q over the last 28 settled days (Ch 5, A-39). */
    realmConsistencyDays: 28
  },

  /** Weight rules compute in lb (A-05); BMI uses kg and m. A height typed in feet and inches is stored in cm. */
  units: { lbPerKg: 2.2046226218, cmPerM: 100, cmPerInch: 2.54, inchesPerFoot: 12 },

  /** T06: founding and the settlement engine. */
  settlement: {
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
  },

  /** T10: the rival AI's numbers the book leaves open. */
  rivalAi: {
    /** A front not drawn to War is at Peace this share of the rest, otherwise Tension. */
    frontPeaceShareOfRest: 0.5, // TUNE (A-144)
    /** The Dwarf's level-4 fortification costs this × ring (levels 1 to 3 cost 15 / 35 / 70 × ring). */
    dwarfLevel4CostPerRing: 120, // TUNE (A-145)
    /** Each rival at War plans this many conquest attempts a week, striking 2 to 7 days after the close. */
    conquestPlansPerWeek: 1, // TUNE (A-146)
    conquestDays: { min: 2, max: 7 },
    /** Goblin mercenaries cost the power they add (15% of AV) at the hiring rival's army price. */
    mercenaryCostShare: 1, // TUNE (A-147)
    /** The Goblin's Market buys at most one hex from another rival every this many weeks. */
    marketEveryWeeks: 4, // TUNE (A-147)
    /** The Archmage's first Ritual comes no earlier than this week. */
    firstRitualWeek: 6 // TUNE (A-148)
  },

  /**
   * Patch 2: the automatic player (`autoplay.ts`): the re-founding's catch-up player (R-21) and the
   * simulator's players. Habits of play, not rules of the game.
   */
  autoplay: {
    /** A safety bound on purchase loops; each buy changes the state, so this is never reached in play. */
    maxBuys: 24,
    /** Defense battles a rival's raids must win within a week before the smarter player asks for a Truce. */
    raidsWinning: 2,
    /** The share over resistance the smarter player bids on a rival's last villages, against its unknown counter-bid. */
    defectionMargin: 1.3,
    /** The Valor the player expects before any day is settled. */
    firstValor: 0.8,
    /** Wings in order of preference, one per building per wave (a fixed list, Ch 15 step 2). */
    wingPreference: ['drillYard', 'countingHouse', 'herbGarden', 'kilns', 'musterField', 'spymaster', 'wardCircle', 'engineWorks', 'shieldForge', 'goldenRoad', 'leylineAnchor', 'siegePark'],
    swornTags: ['steel', 'arcane'] as Tag[],
    /** The army bands at which the player challenges a Gate or capital, weakest first (a host is 60% of the rival's AV). */
    grandBands: ['weaker', 'matched', 'stronger'],
    /**
     * Patch 3 (C-27, C-31): a hex is a siege target when the whole army's Assault would bring it down
     * within this many assault days, today included, each repulse wearing `land.repulseWear` of the
     * Assault (Weary aside). The simulator's "a target every day" (G-03) reads the same horizon. TUNE.
     */
    siegeHorizon: 3,
    /**
     * Patch 3 (B-07 kept): a steered player presses a siege on its own paths out to this many assault
     * days before it takes land off them: about what the old push gave it (the days left in the week,
     * 4 on average). A habit of play; G-06 is sensitive to it (3: 1.8×, 4: 3.2×, 5: 4.5×). TUNE.
     */
    pathSiegeHorizon: 4,
    /**
     * Patch 3 (D-23): a steered player commits to a stronghold barring its own path, before land off
     * it, once the siege would bring it down within this many assault days. Sooner, it grinds weeks at
     * its first stronghold and its land stalls (G-07); never, and it leaves its path (G-06). Measured on
     * the 40 focused campaigns: always 3.25× and 75% rising; 7 days 2.27× and 95%; 10 days 2.72× and
     * 90%. A habit of play. TUNE.
     */
    strongholdCommitHorizon: 7
  },

  /** T12: the living world's and the endgame's numbers the book leaves open. */
  worldAi: {
    /** Bend the knee prices 25% of a treasury estimate: each band's upper edge, and twice the Mighty band's lower edge. */
    treasuryEstimates: [300, 800, 2_000, 4_000], // TUNE (A-172)
    /** An offer the world makes (the Goblin buying a hex, keeping a rising village, an envoy's ask, the Grand Auction) stays open this many days. */
    offerDays: 7, // TUNE (A-171)
    /** The synodic month, and a known new moon (2000-01-06, 18:14 UTC, 0.76 into the day), for the Wild Hunt's full moon. */
    moon: { synodicDays: 29.530588853, knownNewMoon: '2000-01-06', knownNewMoonDayShare: 0.76 }
  },

  /** Patch 3 (D-22; R-04, R-16): sieges. Every value TUNE. */
  sieges: {
    /**
     * C-20: each day a hex is not assaulted it loses `perDay` of its siege wear (a stronghold
     * `stronghold`, P3-02); wear below `clearBelow` is cleared. A day it is assaulted, it loses none.
     */
    wearDecay: { perDay: 0.1, stronghold: 0.05, clearBelow: 0.05 },
    /** C-21: the daily assault gains `perNeighbor` for each hex the player holds beside its target beyond the first, at most `maxNeighbors` of them (+20%). */
    flanking: { perNeighbor: 0.05, maxNeighbors: 4 },
    /**
     * D-23 (P3-01, P3-02): a stronghold in each rival march at each of these depths, on its road (or
     * the non-village hex nearest it); while one stands, the player's assault can't reach deeper in its
     * march. Its garrison, as the player's assault weighs it, is × `garrisonMult` while not the player's
     * (T-01: 1.75, approved 2026-10-15; 2 as first built). TUNE.
     */
    stronghold: {
      depths: [4, 8],
      garrisonMult: 1.75,
      /** C-28: a beast-held stronghold's Grand Battle host is this share of its garrison as an assault must beat it. TUNE. */
      beastHostShare: 0.5
    },
    /**
     * D-24 (C-23, T-02): a garrison beaten without a rout falls back to a neighboring hex of the same
     * holder no shallower than the one it lost, the cheapest to assault, adding `share` of the garrison
     * the assault beat there, fading by a third a day over `days`; all fallbacks on one hex add at most
     * `stackCap` × its own garrison. TUNE.
     */
    fallback: { share: 0.5, days: 3, stackCap: 1 },
    /**
     * D-24 (C-24): each dawn of its window, a fallen force strikes back at this chance, from this
     * campaign week, at its strength that day × `strengthMult` (T-03, approved 2026-10-15). TUNE.
     */
    counterattack: { chancePerDay: 0.3, fromWeek: 3, strengthMult: 1.5 }
  }
}

export const RULES = deepFreeze(RULES_TABLE)
export type Rules = typeof RULES

/** base(ring) for the heartland's rings 1 and 2 (Ch 6, Ch 10); beyond, each hex has its own strength (D-17). */
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
