# T11 — Grand Battles and the Armory (engine)

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T07, T08, T10 (done) | T12, T13, T16 | **Yes** (enemy hosts, intents, Orders, Appendix C items) |

## Goal

Build the hands-on war layer as pure, deterministic rules. The **Grand Battle**: what triggers one, the warning and the queue, the enemy host, four rounds of intents, Orders, swaps and exchange, the Marshal's autoplay at day close, outcomes, and a log that replays exactly. The **Armory** that equips it: Milestone unlocks, items, Wings, Elites, the Sworn and trophies. Fill the `grandBattlesAuto` day phase. The screens are T16.

## Read first

- Book: Ch 11 (all of it), Ch 9 "Milestones" (the unlock table), Ch 14 "Defeat" rule 3 (the Siege host; walls count in full), Pillar 5 in the Preface, and Appendix C: "Company reach", "Elite companies", "Wings", "Items", "Orders and Doctrines", "Rival hosts and intent patterns", "Mythic Hunts".
- Decisions: **D-03**, **E-03**, A-21, A-29, A-30, A-33, A-35, A-47, A-101 to A-104, A-126, A-128, A-131, A-134.
- Hand-off notes: T07 (effects, roster, the armory slice), T08 (Grand Battle requests, trophies), T10 (the Warhost).

## Start from (already built)

- **`effects.ts`** already applies every Milestone boon (item slots at Milestones 1 and 4, the Proving Grounds, the Healing Springs, the Crown Forge, the Statue, the Crownguard Ascendant) and interprets all 24 Wings and every realm-wide item from `state.armory` and equipped items. Grand-Battle-only effects arrive as `realmEffects().battle` (`Grant[]`), beside `orders`, `doctrines`, `ordersOffered`, `readinessFloor`, `reveals.hostRoster`, `foretell.grandBattles`, `costs.items`, `itemSlots` and `extraItemSlots`.
- **`roster.ts`** fields Elites and the Sworn from `state.armory`, adds item power and tags and the Oath-Ring's ignore-Weary; call `refreshRoster` after anything that changes the army.
- **`combat.ts`**: an order on a Gate, capital or Lair Mouth is refused and returned as a `GrandBattleRequest` (`settleCombat(...).grandBattles`). Reuse `tagMatch`, `companyMatch`, `rally`, `defenseFor` and `CODEX.matchups`. Mythic victories and the Royal Hunt post `trophy` events (A-131).
- **`rivals.ts`** raises the Orc's Warhost as a `WarhostRequest` and resets its fund; `armyValue`, `rivalPower` and `respectEffects` are ready. `state.ts` has `adjustRespect`, `toPlayer`, `toRival`, `heldHex` and `EventBuffer`; `map.ts` has `capitals`, `lairOf`, `nearestTo`, `borderHexesOf`.
- **`land.ts`** already refuses a Truce while any Grand Battle in `state.grandBattles` is announced and unfought.
- **`types.ts`**: `GrandBattle`, `BattleRoundLog`, `BattleLogLine`, `ArmoryState` and the `grandBattle` event are placeholders to extend.
- **The codex** describes every Order, Doctrine, Elite ability, item, Wing, host special and mythic special as `Effect` lists.

## Gaps in the current code to close here

1. **Triggers are lost between `settle` calls.** `ctx.hooks` lives for one call and is never saved, and the Orc's fund has already reset when its Warhost is pushed there. Turn each trigger into a `state.grandBattles` entry in the phase that raises it (the combat phase for assault requests, Incursions and the rare-creature reveal; the rival-turn phase for Warhosts). `grandBattlesAuto` then only fights battles that are due.
2. **Trophy events grant nothing yet.** Every Appendix C trophy belongs to one quarry (A-104, A-131). Decide what a daily mythic victory and the Royal Hunt grant, raise it as an `A-1xx` entry, and implement it.
3. **The Bank pays no interest.** `realmEffects().interest` (2% a week, up to 40) is computed but never posted. Post it at the week close (source `interest`).
4. **"Once a month"** (the Herald's Horn; the Scrying Pool in T12) has no reading yet: a calendar month or 4 campaign weeks. Decide, raise it, and put the window in `rules.ts`.
5. **The 8% rare-creature reveal** on ring 4–5 West and East beast-den assaults is not in `settleCombat`'s assault step yet.

## Scope

1. **Triggers and the queue** (`lib/game/grand.ts`):
   - Incursion (A-33: the player takes a hex beside a rival's Gate, or one of its hexes while holding 4 or more it once held, read from the log; at most one per rival every 14 days), the Gate, the Capital (only while holding that Gate), the Mythic Hunt (a Lair Mouth assault, or the 8% reveal) and the Orc's Warhost.
   - `announceGrandBattle(state, request)` as the one entry point, so T12 can add the Coalition Offensive, the Siege and event battles.
   - Warnings from `RULES.grandBattles.warningDays`, plus `foretell.grandBattles`. At most one battle in any 5 days; later ones move to the first free day. Retries: a lost Mythic Hunt after 7 days, a lost Gate or Capital after 14. Post `grandBattle` events (announced, queued, fought).
2. **The enemy host,** fixed at the warning: 60% of the rival's AV, filled per A-35 (the commander first when it fits). A coalition sends 50% of each member's AV, and the Siege 70%. Mythic quarries come from Appendix C, scaled by 1 + week ÷ 52, with A-47's health multipliers. Enemies count as their side's type and get no tag match (A-29). `hostView` shows bands unless `reveals.hostRoster` applies; screens read only that.
3. **Preparation:** choose up to banners + 2 companies (never more than 6), a 3-lane × 2-rank formation, and one Doctrine from `realmEffects().doctrines`. Items come as equipped. Readiness R = 0.6 + 0.5 × the 7-day average Valor (`valorOn` in `settle.ts`), never below `readinessFloor`.
4. **Four rounds:**
   - Intents come from the host's pattern and its specials (`fixedIntent`, `mythicSpecial`).
   - 3 Orders are offered (`ordersOffered`), seeded and never repeated within a battle. The player plays one and may make one swap.
   - The exchange is simultaneous. A front deals p × m × R; a ranged rear deals 0.8 × that. Enemies deal p × the intent multiplier: Charge deals ×1.5 and takes ×1.25 (D-03); Brace ×0.5 both ways; Volley hits the rear; Spell deals 0.5 × power to both companies in the lane; Shift moves at round end.
   - Then rout and advance. Health is 4 × p, adjusted by effects.
   - The battle ends after round 4 or a wipe. The higher remaining health share wins; a wipe, or twice the enemy's share, is a Rout.
5. **Every effect is data.** One interpreter handles the `Effect` kinds that Orders, Doctrines, Elite abilities, the Sworn, items, battle Wings and mythic specials use. No per-entry `if`. A test walks the codex so an unhandled kind fails loudly.
6. **The Marshal's autoplay** for a battle unfought at its day's close: strongest health in front, ranged in the rear, each round the Order with the highest immediate damage, at R − 0.1. This is `grandBattlesAuto`.
7. **Outcomes** (the Ch 11 table):
   - Incursion, Gate and Mythic Hunt resolve here. A Lair Mouth win seals its lair by passing the mouth to the player.
   - The Capital, the Coalition Offensive and the Siege call outcome hooks that T12 fills.
   - Routed companies are Weary for 3 days and never destroyed.
   - Spoils, tribute and Respect go through `economy.ts` and `adjustRespect`.
8. **Determinism and replay.** Each battle draws with its own labels. `BattleRoundLog` records every intent, Order, swap and damage line, and `replay(battle)` rebuilds each round's health exactly. The API for T16 is `prepare`, `setFormation`, `setDoctrine`, `begin`, `offeredOrders`, `playRound(orderId, swap?)`, `autoResolve`, `result` and `replay`.
9. **The Armory** (`lib/game/armory.ts`). Each action returns `{ ok, reason?, state }` like `buildings.ts` and posts its `spend`.
   - Unlocks per Milestone from `RULES.milestones.unlocks`, never revoked. `milestoneUnlocks(index)` lists only what that Milestone opens, for T16's card. Post an `unlock` event when a Milestone breaks.
   - Items: bought at codex cost × `costs.items` (the Great Forge; T12 adds the Merchant Caravan's discount), gated by rank. Equip and unequip within `itemSlots`, +1 slot for the `armorerCompany`. Trophies are unique and never sold. The Herald's Horn's use limit.
   - Wings: at Milestones 2, 5 and 8, one of two per building, chosen permanently.
   - Elites: 300 to recruit; rank II for 600 more from Milestone 7. The Sworn join free at Milestone 7 with two tags chosen once (A-21).
10. Gaps 2 to 5 above.

## Out of scope

The battle and Armory screens (T16). Coalitions, the Siege and event battles beyond their entry points and hooks (T12). Balancing (T13 reports).

## Files

- Create: `src/renderer/src/lib/game/grand.ts` (split it, for example into `grand/hosts.ts` and `grand/round.ts`, if it passes about 800 lines), `src/renderer/src/lib/game/armory.ts`, `tests/game/grand.test.ts`, `tests/game/grandHosts.test.ts`, `tests/game/armory.test.ts`.
- Edit: `settle.ts` (`grandBattlesAuto`; announcing from the combat and rival-turn phases; interest), `combat.ts` (the reveal), `types.ts`, `rules.ts` (append), `effects.ts` only for a missing field.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 4 (E-03): Knights 21 / 84 in front and Crossbowmen 9 (ranged, Engine) behind them, against an Orc Brute 20 / 80 that Charges, with R = 1.0 and Shieldwall played. The Crossbowmen's hit is 10.8, the Brute ends at **40.25** and the Knights at **69**.
- [ ] Determinism: the same seed, formation and Orders give the same log hash in three runs, and `replay` reproduces each round's health exactly.
- [ ] Hosts (A-35): an Orc at AV 100 sends a 60 budget, the Warboss (35) plus Brutes (20); at AV 40 a 24 budget, Brutes only. A week-26 Basilisk has power 90 and health 540.
- [ ] Spacing: triggers on day 10 and day 12 put the second battle on day 15 or later. Mage Tower IV adds a day to every warning.
- [ ] Limits: more than banners + 2 companies, or more than 6, is refused. Orders never repeat within a battle; the Leyline Anchor offers 4. Readiness is 1.1 after 7 days of Valor 1.0 and 0.6 after 7 days of 0 (0.7 with the Sanctum). Autoplay uses R − 0.1.
- [ ] Test 9 (part): an unfought battle auto-resolves at its day's close exactly once. A Warhost raised at a week close is announced and fought even when the next `settle` call comes days later.
- [ ] Outcomes: an Incursion win cuts the rival's AV by 40% of the host sent, adds 5 Respect and pays 30 × ring; a loss returns the hex. A lost Gate blocks a retry for 14 days. Routed companies are Weary for 3 days and the roster size is unchanged.
- [ ] Armory gates: each unlock appears at the week close where its Milestone breaks and stays after a weight regain. A rank II item before Milestone 5 is refused; a second item before Milestone 4 is refused; a third needs the Armorer. A second Wing for the same building and wave is refused. An Elite costs 300; rank II needs Milestone 7 and 600.
- [ ] Item effects: Whetstones (+2) raise the daily Army by 2 × m. Cold Iron Edges lets a Coin-only company strike Archmage conjurations at ×1.5. The Healer's Satchel heals 15% a round, Tower Shields give +20% health, and the Oath-Ring ignores Weary.
- [ ] Realm effects with sources: the Counting House +25% tithes, Bastions +6 walls, the Siege Park +1 daily assault. Merchant Hall V with the Statue turns a 100 gain into 125 (A-31).
- [ ] The Bank posts 2% of the purse at a week close, at most 40.
- [ ] A test walks the codex: every Order, Doctrine, Elite ability, item and mythic special is handled by the interpreter.

## Hand-off notes

*(The implementing agent adds notes here: the outcome hooks and `announceGrandBattle` for T12, the battle API and replay format for T16, and the trophy and "once a month" readings.)*
