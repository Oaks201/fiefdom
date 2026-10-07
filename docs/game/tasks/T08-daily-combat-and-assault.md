# T08 — Daily combat and the daily assault

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 3 The war | T06, T07 | T10, T12, T18 | Light (threat types) |

## Goal

Make every day a fight: draw the day's threats, announce them at dawn, resolve defense and the player's own assault at day close with that day's Valor, and post spoils, tribute, scorching and contested hexes. Implement the `combat` day phase and the threat-schedule part of `resetAndSchedule`.

## Read first

- Book: Ch 10 (all of it), Ch 6 "Conquest: the daily assault" and "Losing land and taking it back", Ch 2 rule 2 (orders lock at close), Ch 5 (spoils in the income table), Ch 9 Grace II (contested hexes hold 2 days, tribute halved), Ch 8 perks (Bounties, the Royal Hunt, Oathguard, Grand Illusion, Siegebreakers, Shieldwall, Runed Walls).
- Decisions: A-26, A-27, A-28, A-31, A-36, A-40, E-02.

## Scope

All in `lib/game/combat.ts`, with assault input validation shared with `land.ts` where it is natural.

1. **Weekly schedule (week phase `resetAndSchedule`).** For each day of the coming week, draw the threat type (beasts 40%, mythics 20%, raid 40%) and, for raids, the raider (A-26). World modifiers (Beast Surge, the Long Night, Veil of Fog) arrive later through hooks from T13 and T10; leave named extension points.
2. **Dawn tidings.** On the current border, choose each threat's target (weighted by ring^1.5 among border hexes; raids along the raider's border; mythics from the lair sides; A-27) and roll strength ±15%. Add any conquest attempts announced the day before (planned by T10 through an interface; until T10 exists, none).
   - Tidings data carries a strength *band*, and the exact number only with Mage Tower IV or the Spy Network.
   - Siege day: Saturday's daily threat is +40%. Early grace: weeks 1 and 2 at 70%, weeks 3 and 4 at 85%, and no conquest attempts before week 6.
3. **Strength.**
   - Beasts 0.9 × base(ring); mythics 1.15 × base × the mythic multiplier from effects.
   - A raid is max(0.8 × base, 0.25 × AV × temper), ×0.9 at Respect ≥ 25, ±15% Emboldened or Humbled.
   - A conquest attempt is max(1.0 × base, 0.5 × AV).
4. **Defense.**
   - Army = (1 + a) × Σ over the best B defense companies of p × m, + W + F. F = fortification level × 0.25 × base(ring).
   - Match m is ×1.5 when the company has a weakness tag (weakness wins over resistance), ×0.6 when it holds only resisted tags, otherwise ×1.
   - Defense = Army × (r + (1 − r) × V).
   - The Marshal picks the best B from the defense pool unless the player overrides. Shieldwall and Runed Walls double walls where they apply.
5. **Outcomes.**
   - Rout (≥ 1.5 × strength): 6 × ring spoils. Victory: 4 × ring spoils, +3 Respect with a defeated raider, and a trophy item on a mythic victory (handed to T14's inventory slice). Bounties double spoils against beasts.
   - Defeat by the daily threat: 3 × ring tribute (halved at Grace II and by Oathguard; waived by Grand Illusion once a week), and the hex is scorched for 3 days. No land is lost.
   - Defeat by a conquest attempt: the hex is Contested for 1 day (2 at Grace II), and the same force strikes again the next day at the same strength. Win and the attempt breaks; lose and the hex passes to that rival at dawn. **Rings 0 to 2 never pass**, so the defeat only scorches.
6. **The daily assault (Ch 6).**
   - Orders: one adjacent target (two at Castle IV, or with Siege Park); companies split between Defense and Assault; orders lock at day close; with no orders, everyone defends (A-36).
   - Assault = (1 + a) × Σ over the best B assault companies of p × m × (r + (1 − r) × V). Walls don't help.
   - Garrisons: beast dens 0.9 × base; village militia 0.6 × base, Steel-typed (so Coin is its weakness); rival hexes per T03 plus fortification. Siegebreakers and Sappers ignore fortification.
   - Taken: the hex is the player's at dawn, with spoils 4 × ring (6 × ring on a rout), −5 Respect with a rival owner, and a captured village Settling at half tithes for 4 weeks.
   - Repulsed: the garrison loses 25% of the Assault value until week close, and the assault companies are Wearied (−20%) the next day.
   - Gates, capitals and Lair Mouths are refused here. Return a "Grand Battle required" result so T12 can raise the trigger.
7. **Settlement order (Ch 10).** Conquest attempts and the daily threat in announced order using the defense pool; then the assault using the assault pool; then contested and captured transfers; then posting spoils, tribute and Respect.
8. **Queries for screens:** `tidings(state, day)` and `ordersValidity(state, orders)`.

## Out of scope

Rival planning of raids and conquest attempts (T10 supplies them through an interface); Grand Battles (T12); screens (T18).

## Files

- Create: `src/renderer/src/lib/game/combat.ts`, `tests/game/combat.test.ts`, `tests/game/assault.test.ts`.
- Edit: `settle.ts` (fill the `combat` phase and the schedule step only), `types.ts`, `rules.ts`.

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Test 3 (E-02): the Ch 10 worked battle (Battlemages 18 and Rune Golems 18, both Arcane ×1.5; Wardens 14 ×1.5; Pikemen 14 ×1; a = 0.10; W = 20; r = 0.55) gives Army 117.9, Defense **116.31** at V = 0.97 and **81.29** at V = 0.31 (±0.01). That is a win and a loss against strength 115.
- [x] Matching: a company tagged Steel and Arcane against Archmage conjurations (weak to Steel, resists Arcane) strikes at ×1.5.
- [x] Early grace: threats hit at 70% in week 1 and 85% in week 3. No conquest attempt is accepted before week 6. A Saturday threat is ×1.4.
- [x] Determinism: the same seed and day give the same threat type, target and roll. Over 10,000 simulated days with all four rivals eligible, the mix is 40 / 20 / 40 ± 2 percentage points.
- [x] Contested flow: lose a conquest attempt and the hex is contested for 1 day; win the next day and it is broken; lose again and the hex passes at dawn. At Grace II it holds 2 days. A ring-2 hex losing a conquest-strength battle never changes owner (Test 10, part).
- [x] Assault: Assault ≥ garrison takes the hex with 4 × ring spoils; ≥ 1.5 × garrison gives 6 × ring; a ring-3 beast den (garrison 49.5) is taken by Assault 50 and repulsed by 49, after which its garrison is 49.5 − 12.25 = 37.25 until week close and the companies are Weary tomorrow.
- [x] No orders: every company defends and no assault happens.
- [x] A battle settles once. After a ledger correction inside the grace window changes yesterday's Valor, re-running `settle` does not change yesterday's battle result (Test 9, part).

## Hand-off notes

### Evidence

`npm run typecheck` is clean. `npm run check:game` prints `check:game OK: 20 game files, codex valid, 273 text slots.` `npm test` runs 375 tests: 375 pass, 0 fail. 39 of them are new: 26 in `tests/game/combat.test.ts` and 13 in `tests/game/assault.test.ts`.

| Verification | Test |
| --- | --- |
| Test 3 (E-02) | combat: `Test 3 (E-02): the Ch 10 worked battle gives Army 117.9, Defense 116.31 at V 0.97 and 81.29 at V 0.31`, and the same battle built from a realm state (see A-138) |
| Matching | combat: `Ch 10 matching: Steel and Arcane against Archmage conjurations … strikes at ×1.5` |
| Early grace, week 6, Saturday | combat: `Ch 10 early grace: threats strike at 70% in weeks 1 and 2, 85% in weeks 3 and 4 … a Saturday threat is ×1.4`; `Ch 10 rule 6: no conquest attempt is accepted before week 6 …` |
| Determinism and the 40 / 20 / 40 mix | combat: `Determinism (Ch 2 rule 7): …`; `A-26: over 10,000 days with all four rivals eligible the mix is 40 / 20 / 40 ± 2 points …` |
| Contested flow, Grace II, ring 2 | combat: `Contested flow: … win the next day and the attempt is broken`; `… lose again the next day and the hex passes to the rival at dawn`; `Contested flow at Grace II: …`; `Test 10 (part): a ring-2 hex …` |
| Assault 50 / 49 / 37.25, spoils 4× and 6×, Weary | assault: `Ch 6: a ring-3 beast den (garrison 49.5) is taken by Assault 50 and repulsed by 49 …`; `Ch 6 taken: …`; `Ch 6 repulsed: …` |
| No orders | assault: `A-36: with no orders every company defends and no assault goes out` |
| A battle settles once | combat: `Test 9 (part): a battle settles once; a correction to yesterday inside the grace window never reruns it`. T06's `Test 9: 30 days settled one call per day equal one catch-up call` now runs with combat in every day and still passes. |

Three T06 tests in `settle.test.ts` compared exact purse or event lists. Every day now also posts a battle, so those assertions now leave out combat's `spoils` and `tribute` entries and its events. What they check is unchanged.

### What exists

**`lib/game/combat.ts`**

- **The schedule** (A-26, A-28). `drawThreat(state, date)` draws the type with `threat:type` and the raider with `threat:raider`, weighted by `raiderWeights(state, date)`. `scheduleThreats(state, from, to)` stores the days not yet drawn in `state.combat.schedule`. The `resetAndSchedule` week phase draws the coming 7 days.
- **Dawn.** `dawn(state, day)` makes sure the day's week is scheduled. It then fixes `Tiding`s (target, ±15% roll, strength) for the day and for every foretold day whose week is drawn.
  - `settle.ts` runs it after each settled day, for the next day, and once at the end of `settle()` for the open day (the campaign's first day).
  - Once fixed, a tiding is what strikes, so the Herald never says one thing and settlement does another. If its target has stopped being the player's, the target is drawn again at the close.
  - Labels: `threat:target` and `threat:roll`.
- **Strength.** `threatStrength(state, effects, input)` covers the book's formulas, the roll, the early grace (`earlyGraceMult`) and the siege day (`isSiegeDay`, the daily threat only). `armyValue(state, rival)` is the AV sum.
- **Battles.**
  - `tagMatch` and `companyMatch` work out the match. An item's `match` effect, such as Hunter's Nets, overrides tags.
  - `fieldBest(pool, matchup, foe, banners, override?)` is the Marshal's pick by p × m.
  - `defenseValue`, `assaultValue` and `rally` are the formulas. `fortificationValue` is F.
  - `effectiveGarrison(hex, ignoreFortification?)` is the garrison + F − wear.
  - `assaultOutcome(garrison, value)` gives taken, rout or repulsed, plus the wear.
  - `defenseFor(state, { hexId, kind, rival?, valor, day? })` gives the Army and Defense with everyone defending.
- **Settling.** `settleCombat(state, { day, week, weekStartsOn, valor, emit })` runs Ch 10's four steps and returns `{ state, grandBattles }`.
  - The settle wrapper (`combatPhase`) computes Valor with `valorOn(state, day, weekStartsOn)` (exported from `settle.ts`, A-40).
  - It posts `defense`, `assault`, `hexTransfer`, `respect`, `trophy` and `calledOff` events.
  - It posts `spoils` (with the reputation bonus), `tribute` (capped at the purse) and `spend` (hired blades and envoys).
  - Afterwards it prunes the schedule, tidings and attempts through the settled day, and orders older than that day. The settled day's own orders stay, for "repeat yesterday's orders".
- **Orders.**
  - `ordersValidity(state, orders)` returns `{ ok, problems, assaults, grandBattles, defense }`. `problems` are coded with plain facts, for T18 to word. The assaults and defense lists are what settlement will actually use.
  - `setOrders(state, orders)` stores one day's orders.
  - `DailyOrders` gained four fields:
    - `extraAssaults`: a second assault, at Castle IV or with the Siege Park;
    - `defenseOverride`: the player's pick instead of the Marshal's;
    - `hired`;
    - `envoys`.
- **Tidings.** `tidings(state, date)` returns a `TidingsView`: restrikes, then announced attempts, then the daily threat.
  - Each threat carries a `band` (A-133). Its exact `strength` appears only with `reveals.threatStrength` (Mage Tower IV or the Spy Network).
  - Later days show only what the realm foretells (`foretell.threats`, `raids` and `raidsOnRoad`), capped by `RULES.combat.maxForetellDays`.
  - `strengthBand` is exported.

**`types.ts`:**
- `CampaignState.combat?: CombatState`, with `schedule`, `tidings`, `conquests` and `contested`. It is absent until the first dawn, so read it through `combatOf`.
- New types: `DailyThreatKind`, `ScheduledThreat`, `Tiding`, `ConquestAttempt` and `ContestedHex`.
- New events: `calledOff` and `trophy`.
- `defense` gained `restrike`, `broken`, `scorchedUntil`, `contestedUntil`, `grandIllusion` and `hunt`. `assault` gained `wear`.

**`rules.ts`:** `combat.strengthBands` (TUNE, A-133) and `combat.maxForetellDays`.

**`settle.ts`:**
- The `combat` phase is filled, and `resetAndSchedule` draws next week's threats.
- `settleDay` runs `dawn` for the next day after the week phases.
- `settle()` runs `dawn` for the open day.
- `PhaseHooks` gained `grandBattleRequests`.
- `valorOn` is exported.

### For T10: raids and conquest attempts

- **Conquest attempts.** Announce one with `planConquest(state, { rival, hexId, announcedOn })`. It strikes on `announcedOn + 1`.
  - It returns `{ ok, state, attempt }` or `{ ok: false, reason }`. The reasons are `tooEarly` (before week 6), `notAtWar`, `blocked` (a Truce, pact or Accord), `notPlayerHex`, `innerRing` (below ring 3), `notTouching`, `onePerDay`, `alreadyUnderAttack` and `notAhead`.
  - The strength is fixed at planning: max(base, 0.5 × AV) × the roll drawn on the strike date (`conquest:<rival>:roll`). Plan at the time of announcing, or AV may have moved by the strike.
  - Use `defenseFor` for Ch 12's test (0.5 × AV ≥ 0.8 × the player's expected defense).
- **Raids.** Raiders are drawn here per A-26, from `RULES.rivals.raidFrequency`, borders, fronts at war, coalitions and pacts. Adjust a weight through `COMBAT_HOOKS.raiderWeight`; Goblin mercenaries for a rival at war would go there, or into AV. Never draw raiders elsewhere.
- **Eligibility.** `canRaid` and `canConquer` read `disposition.player`, `status`, Truces, pacts and Accords from `state.deals` and the active contract. When T09 adds `blocksRaids` and `blocksConquest`, point these two at them.
- **Raid modifiers.** Emboldened and Humbled are read from `frontTracks` (±3) and `humbledUntil` (A-137).

### For T12: Grand Battle triggers

- An order naming a Gate, capital or Lair Mouth is refused as `grandBattleRequired` and goes into `OrdersValidity.grandBattles`. It goes there only when the hex touches the player's land.
- At settlement it arrives as `GrandBattleRequest { hexId, kind, owner, day }` in `ctx.hooks.grandBattleRequests`, which `grandBattlesAuto` can read in the same call.
- The 8% rare-creature reveal on ring 4–5 West and East beast dens is T12's to add, in `settleCombat`'s assault step.

### For T13 and T14

- **T13.** The world-event hooks are `COMBAT_HOOKS.threatMix` (Beast Surge, the Long Night), `COMBAT_HOOKS.threatStrength` and `COMBAT_HOOKS.tidingsHidden` (Veil of Fog). Replace an entry; don't reorder or remove any. An Accord already stops raids and attempts.
- **T14.** `trophy` events (A-131) mark trophies earned in daily combat. Elite abilities are read from the codex by company id: the Sappers ignore fortification and the Gold Cloaks multiply spoils. Item `match` effects apply in daily battles.

### Choices made here

- **New decisions:**
  - A-131: trophies are events.
  - A-132: a raider that can no longer raid at dawn; Truces after dawn.
  - A-133: strength bands.
  - A-134: the Royal Hunt.
  - A-135: Grand Illusion.
  - A-136: timers and hexes changing hands.
  - A-137: hired blades and envoys; Emboldened and Humbled.
  - A-138: the worked battle leaves out Warded Steel.
- **No new text.** Every report is a plain-fact event. The existing `battle.*` and `herald.threat.*` catalog slots already cover them, and the screens (T16, T18) map events to those slots.
- **Spoils** carry the reputation bonus, per Ch 5's income table: "Merchant Hall bonus on every gain above".
