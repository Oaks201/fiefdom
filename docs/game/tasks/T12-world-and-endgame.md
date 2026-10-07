# T12 — The living world and the endgame (engine)

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T11 (and T08 to T10, done) | T13, T16 | **Yes** (the event deck and its hidden criteria) |

## Goal

Close the loop on the campaign. Rivals band together against a rising player; a deck of hidden events keeps the world moving; each rival can be resolved by conquest, defection or Accord; a rival that out-grows the player late can force a Siege of the Crown; and victory or the Fall ends the campaign, with the Reign continuing after a victory. Fill the `world` week phase.

## Read first

- Book: Ch 13 (all of it), Ch 14 (all of it), Appendix C "The world-event deck", Ch 16 rows "Fear of losing" and "Coming back after an absence", Ch 9 Grace III (coalitions shortened, Ascendancy delayed), Test 10.
- Decisions: **D-01**, A-04, A-10, A-22, A-34, A-143, A-148.
- Hand-off notes: T09 (deals, the defection tally), T10 (rivals), T11 (`announceGrandBattle` and the outcome hooks).

## Start from (already built)

- **`land.ts`**: `defectionTally` and `originalVillages` (A-143), `offerDeal` and `makeDeal` (add the coalition buy-out as a deal), courtships (the Grand Auction reuses them). `blocksRaids` and `blocksConquest` already include a running Accord.
- **`contracts.ts`**: `seal` with `{ kind: 'accord', rival }`; `settleContract` returns `accord: { contractId, rival, curve }`; `accordRespectGain(curve, respectAtStart)` gives D-01's 50 or 60 × f(Q). A 30-day contract already needs Castle III.
- **`rivals.ts`**: `rivalPower`, `playerPower`, `threatOf`, `dispositionFor` (a coalition member is already at War), fronts (coalition partners' shared front is at Peace and they never fight Border Campaigns), `RivalState.ascendancyStreak`, `ultimatumUntil` and `humbledUntil`, and `holdings`.
- **`combat.ts`** `COMBAT_HOOKS`: `threatMix` (already wrapped by the Long Night), `threatStrength`, `raiderWeight`, `tidingsHidden` (free for events, A-148) and `bandsHidden`. Raider weights already rise ×1.25 in a coalition.
- **`grand.ts`** (T11): `announceGrandBattle`, coalition and Siege hosts, and the outcome hooks for the Capital, the Coalition Offensive and the Siege.
- **`state.ts`**: `inCoalition`, `coalitionPartners`, `adjustRespect`, `patchRival`, `toPlayer`, `toRival`, `EventBuffer`.
- **`settle.ts`**: `WEEK_PHASES.world` is an empty slot; `settlement.lastLaunch` (A-10) and the summary's `awayDays`.
- **`roster.ts`** already fields a vassal for a conquered or abdicated rival and a free ally for an allied one.
- **Text:** `coalitions.*`, `endings.*`, `events.<id>.title` and `.body`, `herald.coalition.*`, `herald.ascendancy.*`.

## Gaps in the current code to close here

1. **The Reign.** Today every rule treats a campaign that isn't `active` as over: `settle` settles nothing, `dawn` stops, and buildings and land refuse with `campaignOver`. After a victory the realm continues (Ch 14 "Victory": the remaining Milestones, the lairs and Tier V stay open), so `won` must keep settling and allow purchases; only `fallen` is final. Put the test in one helper (for example `isPlayable(state)` in `state.ts`) and use it everywhere.
2. **An Accord's Respect can be lost.** `ctx.hooks.accordsPaid` lives for one `settle` call, and the `world` phase runs only at a week close, so an Accord that ends mid-week, in a call that stops before the close, would never add its Respect. Apply the gain on the day the Accord is paid (in or right after `contractEnd`), using Respect as it stood at the Accord's start, which therefore has to be recorded when it is sealed.
3. **Accord gating.** `seal` checks only the contract rules. Add the Accord's own: Respect 60 (50 with the Lost Heir), Castle III, the rival active and not in a coalition. At Respect 100 it is signed and the rival becomes `allied`.
4. **Fallout Threat.** The +15 / +10 / +5 for each rival's fall and the Watcher's +10 must feed `threatOf`.
5. **Event effects need homes.** Put each lasting effect where its system already reads modifiers, and record it in `state.worldEvents` with its end date so it settles once:
   - player-side numbers through `realmEffects`, with a new `EffectSourceRef` kind for events (the Hungry Winter's tithes);
   - combat through `COMBAT_HOOKS` (the Beast Surge's mix);
   - garrisons on the map (the Beast Surge's +20%);
   - the rival turn (Fear of the Crown's army spending, the Deep Call's reach);
   - land and the Armory (the Lost Heir's Accord threshold, the Merchant Caravan's discount).
6. **Return from an absence.** `lastLaunch` is overwritten at each launch, so the date the player came back from 14 or more days away isn't kept. Record it, because no siege may fall within 7 days of it.
7. **The Scrying Pool's hint** (`realmEffects().eventHints`) needs an upcoming event to hint at, without revealing its criteria.

## Scope

All in `lib/game/world.ts` (split by topic if it grows past about 800 lines), plus the edits listed under Files.

1. **Coalitions** (Ch 13):
   - Triggers: the First Fall (the two highest-Threat rivals; the third becomes the Watcher at Threat +10); the Last Alliance (both remaining rivals, unless one is at Respect 60 or more, which refuses and stays at Tension); the Rising Crown (player Power at least 1.5 × the average rival Power for 3 weeks in a row before any rival is resolved; the two rivals bounding the strongest direction, A-34).
   - Limits: none before week 12; never three rivals allied at once. Durations 10 weeks, until resolved, and 6 weeks; each 2 weeks shorter at Grace III.
   - While one stands: 10% of each member's income goes to `Coalition.warChest`, which funds a Coalition Offensive through `announceGrandBattle` within 14 days of forming; a Goblin member hires mercenaries for its partner every 4 weeks (reuse the Market's).
   - Breaking it: win the Offensive (it ends 2 weeks early); pay one member 300 at Respect 40 or more (a new deal); or betrayal, a seeded 15% each week for a member at Respect 50 or more.
2. **Resolving rivals** (Ch 14):
   - Conquest: the Capital battle's outcome hook. The capital and realm become ruins; its other hexes turn neutral with village loyalty halved; Threat +15 everywhere; the Pretender becomes eligible.
   - Defection: the rival holds no villages and at least half of its original villages were won by influence or trade (`defectionTally`; villages lost in Border Campaigns count toward "holds none"). It abdicates: its land passes to the player; Threat +10; an active Goblin offers to buy one of those hexes.
   - Accord: the gating above; while it runs the rival neither raids nor attempts conquest (already true). Signed, it is allied: it keeps its land, stops expanding toward the player, joins one Grand Battle a month, Threat +5.
   - Pacing: none resolved before week 12, and at most one in any 8 weeks. Decide how a resolution that comes too early waits (refused, or held until allowed), and raise the reading.
3. **The event deck:** all 14 Appendix C events with their hidden criteria, at most one new event a week, each once unless recurring, wired through the homes in gap 5. Events never take land in rings 0 to 2, never end the campaign, and announce any Grand Battle at least 2 days ahead. The Hungry Winter fires in the first full week of December. The Wild Hunt waits for the next full moon: a simple synodic-month calculation from a known new moon. Where an event's text leaves something open (for example, who holds the Pretender's 2 hexes), pick the conservative reading and raise it.
4. **Ascendancy and the Siege** (Ch 14):
   - From week 36 (44 at Grace III), a rival whose Power is at least 1.5 × the player's (1.6 × at Grace I or more) at 4 week closes in a row enters Ascendancy. Coalition members add their Power together.
   - From week 32 the Herald warns whenever a ratio passes 1.3 ×.
   - A 14-day Ultimatum, then the Siege of the Crown through `announceGrandBattle` (70% of AV; a coalition sends both; walls count in full).
   - The Ultimatum lifts if the ratio drops below 1.3 × at a week close before the siege.
   - Bend the knee once per campaign: pay 25% of the rival's treasury *estimate* to delay 4 weeks. The price is shown, so it must not reveal the hidden treasury: base it on an estimate the player may know (for example its band) and raise the reading.
   - A siege never falls within 7 days of a return from 14 or more days away; the Ultimatum waits (gap 6).
   - Winning the siege: the rival is Humbled (AV −50%, Respect +10, no Ascendancy for 8 weeks). Losing it: status `fallen`, final.
5. **Victory and the Reign:** with all four rivals resolved, `castleTier` becomes 5 (the High Throne; never bought) and status `won`, and settlement continues (gap 1).
6. **The Chronicle record** for the endgame screens: a pure function giving days kept, hexes held, Realm Consistency, Milestones, battles and how each rival fell.

## Out of scope

The screens (T15, T16). Balancing (T13 reports).

## Files

- Create: `src/renderer/src/lib/game/world.ts`, `tests/game/world.test.ts`, `tests/game/endgame.test.ts`, `tests/game/invariants.test.ts`.
- Edit: `settle.ts` (`world`; the Accord's Respect; the Reign), `grand.ts` (the outcome hooks), `rivals.ts`, `land.ts` (the buy-out deal), `combat.ts` (hooks only), `effects.ts` (an event source), `state.ts`, `buildings.ts`, `types.ts`, `rules.ts`.

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Test 10, in `invariants.test.ts`, over 300 seeded 70-week runs through `settle` (reuse T13's harness if it exists, otherwise a small headless driver): no `fallen` before week 36 (44 at Grace III), no ring 0 to 2 hex ever changes owner, no Border Campaign targets a Gate, a capital or a player hex, three rivals are never allied at once, and no coalition forms before week 12.
- [x] Pacing: with forced-perfect inputs nothing is resolved before week 12, the second resolution comes at least 8 weeks after the first, and the earliest victory is week 36.
- [x] Accord (D-01): a 30-day Accord at Q = 0.90 from Respect 60 adds 41.7 Respect (→ 101.7, signed) **and** pays 500.0 before the reputation bonus. At Q = 0.70 it adds 25.0 (→ 85) and pays 300.0; the rival is not yet allied, and a new Accord can be sealed. While it runs the contract slot is busy and that rival makes no raids. The Respect is added even when the `settle` call that pays it ends before the week closes.
- [x] Defection: courting the rival's last village, with at least half of its original villages won by influence or trade, makes it abdicate. With more than half conquered, it doesn't.
- [x] Coalitions: each trigger forms the right pair (the Rising Crown per A-34); the war chest funds an Offensive within 14 days; the buy-out and betrayal break it; Grace III shortens it by 2 weeks.
- [x] Ultimatum: lifted when the ratio drops below 1.3 × at a week close. Bend the knee works once and then refuses. A siege due 3 days after a return from 20 days away moves to day 7 after the return.
- [x] Events: each fires only when its criteria hold, at most one new event a week, non-recurring ones once. The Hungry Winter of 2026 fires in the week starting 2026-12-07 (Monday weeks). The full-moon function returns 2026-10-26 ± 1 day.
- [x] The Siege: winning gives AV −50%, Respect +10 and no new Ascendancy for 8 weeks. Losing sets `fallen`, after which `settle` changes nothing but the record.
- [x] Victory sets Castle V and `won`; the next days still settle, and a Tier V purchase still works in the Reign.

## Hand-off notes

### Evidence (2026-10-07)

- `npm run typecheck`: clean. `npm test`: 547 tests, 547 pass (55 new: 39 in `world.test.ts`, 15 in `endgame.test.ts`, 1 in `invariants.test.ts`; `buildings.test.ts`, `settle.test.ts` and `grandHosts.test.ts` updated for the Reign and the Capital's pacing). `npm run check:game`: `check:game OK: 29 game files, codex valid, 293 text slots.`
- **Test 10:** "Test 10: 300 seeded 70-week campaigns keep every endgame invariant". 300 campaigns (steady and poor habits; passive, greedy and diplomatic players) settled day by day through `settle` by `tests/game/support/campaign-driver.ts`, in worker threads, about 25 s. Zero violations of: no Ultimatum before week 36 (44 at Grace III, read from the `grace` events) and no Fall before week 36; no ring 0 to 2 hex passing to anyone but the player (ownership replayed from the founding map through every `hexTransfer`); no Border Campaign on a Gate, a capital or a player hex; never two overlapping coalitions with three rivals; no coalition before week 12; Ch 14's pacing. The runs are not vacuous: 120 fell (earliest week 42), 75 were won (earliest week 46), 180 saw a coalition, 120 an Ultimatum and 134 a resolution.
- **Pacing:** "Ch 14 pacing: with every rival ready from day 1, none is resolved before week 12, one per 8 weeks after, and victory comes in week 36" (resolutions in weeks 12, 20, 28 and 36); "Ch 14 / A-168: an Accord signed in week 8 is held, and the rival is allied at week 12's close"; "Ch 14 pacing / A-168: a defection before week 12 waits for week 12's close, checked again then".
- **Accord:** "D-01: a 30-day Accord at Q = 0.90 from Respect 60 adds 41.7 Respect (→ 101.7, signed) and pays 500.0 before the reputation bonus"; "D-01: at Q = 0.70 the Accord adds 25.0 (→ 85) and pays 300.0; the rival is not allied and a new Accord can be sealed"; "D-01: from Respect 75 or more the Accord adds 60 × f(Q), judged by the Respect recorded at its seal"; "Ch 14: an Accord needs Respect 60, Castle III, the rival active and in no coalition, and the contract slot free"; "Ch 14: while an Accord runs, that rival makes no raids"; "D-01 / gap 2: the Accord's Respect is added even when the settle call that pays it ends before the week closes" (the paying call closes no week).
- **Defection:** "Ch 14: courting the Dwarf's last village, with half its villages won by influence or trade, makes it abdicate; its land passes to the player"; "Ch 14: a village won by trade counts toward defection like one won by influence"; "Ch 14: with more than half of its villages conquered, a rival that holds none does not abdicate".
- **Coalitions:** "Ch 13: the First Fall joins the two remaining rivals with the highest Threat for 10 weeks; the third is the Watcher at Threat +10"; "Ch 13: the Last Alliance joins both remaining rivals until one is resolved, unless one holds Respect 60"; "Ch 13 / A-34: the Rising Crown forms after 3 week closes at 1.5× …, not before week 12, from the two rivals bounding the strongest direction"; "Ch 13: each member puts 10% of its income in the war chest, which funds a Coalition Offensive within 14 days of forming"; "Ch 13: paying a member 300 at Respect 40 breaks the coalition; below 40 the buy-out is refused"; "Ch 13: a member at Respect 50 betrays the coalition on its seeded 15% roll; below 50 it never does"; "Ch 9 Grace III: every coalition ends 2 weeks sooner"; "Ch 13: three rivals never ally at once; a new coalition ends the one standing"; "Ch 13 / A-174: the Rising Crown's 3 weeks count only while no coalition stands".
- **Ultimatum:** "Ch 14 rule 4: the Ultimatum is lifted when the ratio falls below 1.3× at a week close before the Siege"; "Ch 14 rule 4 / A-172: bending the knee pays 25% of the treasury estimate, delays the Siege 4 weeks, and works once"; "Ch 14 rule 7 / A-10: a Siege due 3 days after a return from 20 days away moves to day 7 after the return". Also rule 1 (4 closes; a close below the ratio restarts the count; a coalition's Power added), Grace I's 1.6× and Grace III's week 44, and rule 2's warning.
- **Events:** one test per event, each firing when its criteria hold and not when they just fail (Ugrak's Challenge, the Grand Auction, the Deep Call, the Beast Surge, the Dragon, the Wild Hunt, the Pretender, Fear of the Crown, the Village Uprising, the Wandering Order, the Merchant Caravan, the Lost Heir, Envoys; the Hungry Winter by date); "Ch 13: at most one new event fires a week; the next waits for a later close"; the Deep Call test checks that a non-recurring event never fires twice; "Appendix C / A-169: the Hungry Winter of 2026 fires in the week starting 2026-12-07; the Beast Surge due that week waits one"; "Appendix C / A-170: the next full moon after 2026-10-08 is 2026-10-26 ± 1 day".
- **The Siege:** "Ch 14 rule 5: winning the Siege Humbles the rival: AV −50%, Respect +10, and no new Ascendancy for 8 weeks"; "Ch 14 rule 6: losing the Siege is the Fall; settlement stops that day and changes nothing after".
- **Victory:** "Ch 14: victory sets Castle V and won; the Reign goes on settling, and a Tier V purchase still works" (also checks the Chronicle record).
- **Test 9 (T12's part):** "Test 9 (T12): world events, coalitions and resolutions settle once: a catch-up equals week-by-week calls" (30 weeks, coalitions and events included).

### What was built

- **`lib/game/world.ts`**: resolving rivals under Ch 14's pacing (`resolveRival`, held resolutions in `world.pending`, `defects`), what each fall does (ruins, neutral land with halved loyalty, abdication, the Goblin's offer), victory; Accords (`accordGate`, `sealAccord`, `accordPaid`, `accordGain`); coalitions (war chest, triggers, the Offensive, mercenaries, betrayal, ends); Ascendancy, the warning, the Ultimatum, the lift, bending the knee and the Siege's outcome; the outcome hooks for the Capital, the Coalition Offensive and the Siege, installed into `GRAND_HOOKS` when the module loads (settlement imports it); the `world` week phase (`worldWeek`); the views.
- **`lib/game/world/events.ts`**: the 14 events with their hidden criteria and effects, one new event a week, the full moon, the offers (the Village Uprising's price, the envoys' ask, the Grand Auction), event battles (`GRAND_HOOKS.event`) and the Scrying Pool's hint. Its hooks (`COMBAT_HOOKS.threatMix` and `conquestReach`, `RIVAL_HOOKS.armyShare`) install when the module loads.
- **The gaps:** (1) `isPlayable(state)` in `state.ts` replaces every `status !== 'active'` test; (2) `contractEnd` calls `accordPaid` the day an Accord is paid, from `LandContract.respectAtStart`; (3) `accordGate`; (4) `falloutThreat` feeds `threatOf` (A-167); (5) the event homes: `Effects.titheCut` with an `event` source (the Hungry Winter), `COMBAT_HOOKS.threatMix` and `conquestReach` (the Beast Surge, the Deep Call), hex garrisons (the Surge, the Pretender's `rebels`), `RIVAL_HOOKS.armyShare` in `rivals.ts` (Fear of the Crown), the roster (the Wandering Order, a company lent to an envoy), `caravanDiscount` in `armory.ts` and `accordThreshold` (the Lost Heir); (6) `settlement.returnedOn`, set at a launch after 14 or more days away, and `holdSieges` in `grand.ts`; (7) `eventHint`.
- **Shared code:** `RivalState.resolvedOn` (pacing reads it, so two rivals can't resolve at one close); `toPlayer` and `toRival` clear `rebels`; `refreshRoster` hands a departed company's items back to the stash; `roster()` without a day reads the open day for date-limited companies; settlement stops at the phase where the realm falls; `state.world` (`WorldState`) holds the Rising Crown streak, held resolutions, offers, the Uprising's tally, the warnings, the auction and the bend-the-knee day.
- **Text:** `herald.ascendancy.humbled` and `herald.offer.goblinBuys` (plain facts); `herald.deal.refused.noCoalition` for the buy-out.

### What changed for `won`

A won campaign keeps settling, buying, courting, dealing and fighting (the Reign); only `fallen` stops anything, and the Fall stops settlement at the very phase the Siege is lost (A-176). In the Reign Ascendancy is not tested, and every rival is resolved, so coalitions, Accords and rival turns have nothing left to do. Victory sets `castleTier` to 5, which `castleOffer` never sells.

### For T16 (views and actions)

- **Coalitions:** `coalitionView(state, today)`: members, trigger, `until`, the Watcher and the Offensive's day; never the war chest. The buy-out is a deal: `offerDeal` / `availableDeals` / `makeDeal` with `{ kind: 'buyout' }` (refusals `noCoalition`, `respect`, `reputation`).
- **The Ultimatum:** `ultimatumView(state, today)`: the rival (and a coalition's members), the Siege's day, days left, the bend-the-knee price and whether it can still be paid; never a ratio. `bendTheKnee(state, rival, today)` (refusals `noUltimatum`, `used`, `reputation`). The Siege itself is an ordinary Grand Battle (`prepare`, `begin`, `playRound`).
- **Accords:** `accordView(state, rival, rc, today)` (the gate, the threshold, the Respect it would add at that Realm Consistency, and whether it would sign) and `sealAccord(state, rival, { id, pledge }, today)`. Seal Accords only through `sealAccord`: it records `respectAtStart`, which `contracts.seal` alone does not.
- **The Chronicle:** `chronicleRecord(state)`: status, week, days settled and kept, hexes held, Realm Consistency, Milestones, battles, and each rival's status and week of its fall. The endings text is `endings.victory` / `endings.fall`.
- **Events and offers:** each `worldEvent` post carries `from`, `until` and its plain facts (rival, hexes, item). `worldOf(state).offers` lists what the player can take up now (`acceptGoblinOffer`, `keepVillage`, `lendToEnvoy`), and `worldOf(state).auction` the Grand Auction's lots (`auctionBid`; show only the player's own bid). `eventHint(state, today)` is the Scrying Pool's line.

### For T13 (the simulator)

- `tests/game/support/campaign-driver.ts` (`habitLedger`, `driveCampaign`, `auditRun`) and `drive-worker.ts` are a small start: synthetic habits, three crude policies through the real actions, Test 10's audit, and worker threads with `--import tsx`.
- What the 300 runs showed (balance is T13's to report): the Grand Auction never fired (no Goblin treasury reached 2,000), the Village Uprising never fired (a conquered village rarely stays under 20 loyalty beyond ring 2) and Ugrak's Challenge fired twice; Envoys and the Caravan take most event weeks; a steady passive player, hoarding reputation, raises a Rising Crown coalition about every 5 weeks; a steady greedy player holds 80 or more hexes and conquers from about week 53; a poor player falls in week 42; the diplomat wins in week 46 by four Accords.

### Readings raised

A-167 (fallout Threat), A-168 (pacing holds rather than refuses), A-169 (the event deck), A-170 (the full moon), A-171 (offers and the Grand Auction), A-172 (the bend-the-knee estimate), A-173 (the Offensive and the war chest), A-174 (coalitions where Ch 13 is silent), A-175 (abdication and the Rim), A-176 (the Reign and the Fall), A-177 (Ascendancy's count and the return from an absence), A-178 (the Chronicle record and sealing Accords).
