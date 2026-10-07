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

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Test 4 (E-03): Knights 21 / 84 in front and Crossbowmen 9 (ranged, Engine) behind them, against an Orc Brute 20 / 80 that Charges, with R = 1.0 and Shieldwall played. The Crossbowmen's hit is 10.8, the Brute ends at **40.25** and the Knights at **69**.
- [x] Determinism: the same seed, formation and Orders give the same log hash in three runs, and `replay` reproduces each round's health exactly.
- [x] Hosts (A-35): an Orc at AV 100 sends a 60 budget, the Warboss (35) plus Brutes (20); at AV 40 a 24 budget, Brutes only. A week-26 Basilisk has power 90 and health 540.
- [x] Spacing: triggers on day 10 and day 12 put the second battle on day 15 or later. Mage Tower IV adds a day to every warning.
- [x] Limits: more than banners + 2 companies, or more than 6, is refused. Orders never repeat within a battle; the Leyline Anchor offers 4. Readiness is 1.1 after 7 days of Valor 1.0 and 0.6 after 7 days of 0 (0.7 with the Sanctum). Autoplay uses R − 0.1.
- [x] Test 9 (part): an unfought battle auto-resolves at its day's close exactly once. A Warhost raised at a week close is announced and fought even when the next `settle` call comes days later.
- [x] Outcomes: an Incursion win cuts the rival's AV by 40% of the host sent, adds 5 Respect and pays 30 × ring; a loss returns the hex. A lost Gate blocks a retry for 14 days. Routed companies are Weary for 3 days and the roster size is unchanged.
- [x] Armory gates: each unlock appears at the week close where its Milestone breaks and stays after a weight regain. A rank II item before Milestone 5 is refused; a second item before Milestone 4 is refused; a third needs the Armorer. A second Wing for the same building and wave is refused. An Elite costs 300; rank II needs Milestone 7 and 600.
- [x] Item effects: Whetstones (+2) raise the daily Army by 2 × m. Cold Iron Edges lets a Coin-only company strike Archmage conjurations at ×1.5. The Healer's Satchel heals 15% a round, Tower Shields give +20% health, and the Oath-Ring ignores Weary.
- [x] Realm effects with sources: the Counting House +25% tithes, Bastions +6 walls, the Siege Park +1 daily assault. Merchant Hall V with the Statue turns a 100 gain into 125 (A-31).
- [x] The Bank posts 2% of the purse at a week close, at most 40.
- [x] A test walks the codex: every Order, Doctrine, Elite ability, item and mythic special is handled by the interpreter.

## Hand-off notes

### Evidence (2026-10-07)

- `npm run typecheck`: clean. `npm test`: 492 tests, 492 pass (59 new in `grand.test.ts`, `grandHosts.test.ts` and `armory.test.ts`). `npm run check:game`: `check:game OK: 27 game files, codex valid, 290 text slots.`
- Each verification item and its tests:
  - Test 4: "Test 4 (E-03, D-03): Knights and Crossbowmen against a charging Brute with Shieldwall: hit 10.8, Brute 40.25, Knights 69". The log line keeps the hit as dealt (10.8) and as taken (13.5, the charging Brute's ×1.25).
  - Determinism: "Ch 11 rule 4: the same seed, formation and Orders give the same log in three runs, and replay rebuilds every round exactly" (a SHA-256 of the log over three runs, with a swap in round 2).
  - Hosts: "A-35: an Orc at AV 100 sends a 60 budget …", "A-35: passes add one company of each type …", "Ch 11 / A-47: … a week-26 Basilisk has power 90 and health 540".
  - Spacing: "Ch 11: no two Grand Battles within 5 days: triggers on day 10 and 12 put the second on day 15 or later" (it lands on day 17); "Ch 11: warnings are 2, 2, 3 and 2 days …; Mage Tower IV adds a day to every one".
  - Limits: "Ch 11: at most banners + 2 companies, never more than 6"; "Ch 11 / Appendix C: 3 Orders a round, never repeated within a battle; the Leyline Anchor offers 4"; "Ch 11: Readiness is 1.1 after 7 days of Valor 1, 0.6 after 7 days of 0, 0.7 with the Sanctum; the Marshal fights at R − 0.1".
  - Test 9 (part): "Test 9 (part): an unfought battle auto-resolves at its day's close, exactly once"; "Test 9 (part), gap 1: a Warhost raised at a week close is announced, and fought even when the next settle comes days later".
  - Outcomes: "Ch 11 outcomes: an Incursion won cuts the rival's AV by 40% …", "… an Incursion lost returns the hex …", "… a lost Gate costs 5 × ring tribute and blocks a retry for 14 days …", "Ch 11 rule 2: routed companies are Weary for 3 days and the roster keeps its size", "… a Mythic Hunt won pays 150 and its trophy; a Lair Mouth won seals the lair".
  - Armory gates: "Ch 9: an unlock appears at the week close where its Milestone breaks, and stays after a weight regain", "Appendix C: items cost their codex price × the Great Forge, gated by rank", "Ch 9: one item slot from Milestone 1, two from Milestone 4; a third needs the Armorer", "Appendix C: Wings at Milestones 2, 5 and 8 …", "Appendix C: an Elite costs 300; rank II needs Milestone 7 and 600 more", "A-21: the Sworn join free …".
  - Item effects: "Appendix C: Whetstones (+2) raise the daily Army by 2 × m", "… Cold Iron Edges let a Coin-only company strike the Archmage's conjurations at ×1.5", "… Tower Shields give +20% health, the Healer's Satchel heals 15% a round", "Appendix C: the Oath-Ring ignores Weary".
  - Realm effects: "Appendix C: the Counting House +25% tithes, Bastions +6 walls, the Siege Park +1 daily assault, each with its source"; "A-31: Merchant Hall V with the Statue turns a 100 gain into 125".
  - The Bank: "Gap 3: the Bank posts 2% of the purse at a week close, at most 40".
  - The codex walk: "T11: one interpreter handles every Order, Doctrine, Elite ability, the Sworn, item, Wing, host and mythic special" (an unknown kind throws).

### What was built

- **`lib/game/grand/field.ts`** (pure; it never sees `CampaignState`): the field (`LANES`, `SLOTS`, `slotOf`, `laneOf`, `rankOf`), `startField(setup)`, `playRoundOn(field, play)`, `replayField`, `fieldResult`, `shares`, `isOver`, `marshalPlay`, `offeredOn`, `orderNeeds`, `validTargets`, `playProblem`, `plannedIntents`, and `interpret(effect, holder)`, the one interpreter. It is a switch over every `EffectKind`, so a new kind fails to compile and an unknown one throws. The holders are a company (items, an Elite ability, the Sworn's → `UnitMods` and starting health), the battle's start (the Doctrine and `realmEffects().battle` grants such as the Shield Forge), a round (the Order played and its target) and an enemy company in a round (host and quarry specials).
- **`lib/game/grand/hosts.ts`**: `rivalHost` (A-35), `combinedHost` (coalitions, and a coalition's Siege), `mythicHost` (scaled by 1 + week ÷ 52), `placeHost` (A-159), `hostView` (bands unless `reveals.hostRoster`; never a power otherwise).
- **`lib/game/grand.ts`**: triggers, the queue, preparation, the battle API, the Marshal and outcomes. **`lib/game/armory.ts`**: unlocks, items, Wings, Elites, the Sworn and trophies.
- **Settlement:** the combat phase announces Gate, capital and Lair Mouth assaults, the 8% reveal, and Incursions for hexes conquered; the courtships phase raises Incursions for villages courted away; the rival-turn phase announces each Warhost; `grandBattlesAuto` fights every battle due (and raises an Incursion for a hex a battle took); the weekly-income phase posts the Bank's `interest` first, on the purse as the week closes; the weight phase posts an `unlock` event after each `milestone`. `readinessValors(state, day)` in `settle.ts` gives the Valors a battle on `day` reads. `ctx.hooks.grandBattleRequests` and `warhosts` are still filled, for reading only: nothing is lost between `settle` calls any more.
- **Daily combat:** `isRevealDen` and the reveal in the assault step (label `reveal:<hex>`; the `assault` event's outcome is `revealed`, and the request carries `reveal: true`). Daily mythic victories and the Royal Hunt grant trophies (A-156).
- **Types:** `SlotKey`, `OrderTarget`, `FieldUnit`, `UnitMods`, `BattleSetup`, `GrandTrigger` and `GrandOutcome` are new. `GrandBattle` gains `rival`, `members`, `sent`, `quarry`, `revealed`, `setup`, `foughtOn`, `outcome` and `eventId`; `BattleRoundLog` gains `unitIntents`, `offered`, `target`, `health` and `slots`; `BattleLogLine` gains `dealt`. Events: `unlock` and `armory` are new; `grandBattle` gains `battleDate`, `rival`, `quarry`, `marshal`, `reason` and the stage `refused`; `trophy` gains `item` and the source `mythicHunt`; `assault` gains the outcome `revealed`.
- **Codex and rules:** every quarry has an `intentPattern` (A-158), validated like a host's. `RULES.grandBattles.warningDays.warhost` and `RULES.grandBattles.monthWeeks` (A-157) were added. `hostUnits` and `hostCompany` in `rivals.ts` are now exported for the host builder.

### For T12

- **`announceGrandBattle(state, request, emit)`** is the one entry point. A `GrandRequest` takes `trigger`, `hexId` and `announcedOn` (the open day the player first sees it: the day after a close, or today for an action), and as needed `rival`, `members`, `share`, a prebuilt `enemy`, `warningDays` (event battles) and `eventId`. It fixes the host now, puts the battle on the first day at least 5 days from every other, and posts `announced` (and `queued` if it moved) or `refused`. The Coalition Offensive and the Siege already build their hosts (50% of each member's AV; 70%, each member of a coalition sending 70%).
- **Outcome hooks:** `GRAND_HOOKS.capital`, `.coalitionOffensive`, `.siege` and `.event` receive `(state, battle, { day, won, result, spoilsMult, emit })` and return `{ state, outcome }`. Defaults: a lost Capital raises the rival's AV 10% and sets `retryFrom` (+14 days); a won Capital does nothing (conquer the rival there); a won Offensive pays 40 × ring (break the coalition 2 weeks early there; on a loss pass the outermost border hex); the Siege and events do nothing. Weary companies, Reserves fees and the `fought` event are handled around the hook.
- **"Once a month"** is `monthOf(state, day)`, a block of `RULES.grandBattles.monthWeeks` campaign weeks (A-157), for the Scrying Pool and the ally's battle.
- The Siege counts the walls in full as health on the center front (A-164); `begin` does this for any `siege` battle.

### For T16

- **API** (`grand.ts`): `pendingBattles`, `prepare(state, id, today, valors)` (companies with their Weary flag, the limit, the Doctrines on offer, `freeHire`, `canFight`, Readiness), `setFormation(state, id, slot → company id, today)` (refusals `formation:<problem>`: `tooMany`, `duplicate`, `unknownCompany`, `empty`, `noFreeHire`, `badSlot`), `setDoctrine`, `begin(state, id, { today, valors })`, `offeredOrders`, `playRound(state, id, { order, target, swap }, today)`, `result(battle)`, `replay(battle)`, `hostView(state, battle)`, `challenge(state, hexId, today)` (a direct challenge of a bordered Gate, capital or Lair Mouth) and `FREE_HIRE` (Mercenary Contract's slot value). `orderNeeds(orderId)` says whether an Order needs a lane, an enemy company or an empty slot; `validTargets(field, orderId)` lists the choices; `fieldOf(battle)` gives the live field.
- **Replay format:** a battle is its `setup` plus its `log`. Each `BattleRoundLog` has the lanes' shown `intents`, every enemy's `unitIntents`, the `offered` Orders, the `order` and `target` played, the `swap` (two slot keys), every damage line (`from`, `to`, `amount`, `note`: `spell`, `volley`, `splash`, `barrage`, `poison` or an Order id, and `dealt` when the target's own multipliers changed the hit), and every company's `health` and `slots` after the round. `replay(battle).rounds` rebuilds them from `setup` and the plays, so the health matches the stored log exactly.
- Later rounds' intents (Foresight, Foreknowledge): `plannedIntents(field, round)` in `grand/field.ts`; `orderMods(id, target, 0).reveal` and `startMods().revealAll` say how far a play or a Doctrine reveals.
- **Armory** (`armory.ts`): `milestoneUnlocks(index)` (keys of `RULES.milestones.unlocks`, Wing waves as `wings:<n>`), `rankMilestone(rank)` (the Milestone number a locked rank shows), `itemOffer`, `buyItem`, `equipItem`, `unequipItem`, `slotsFor`, `setArmorer`, `chooseWing`, `recruitElite`, `promoteElite`, `swearSworn` and `heldItems`. Each returns `{ ok, reason?, state, cost }` with a refusal code and posts an `armory` event.
- No text slots were added for Grand Battle results; the Herald already has `herald.grandBattle.warning` and `.queued`.

### Readings raised

A-156 (trophies), A-157 ("once a month"), A-158 (quarry intent patterns), A-159 (where a host stands), A-160 (movement without dice), A-161 (Readiness's 7 days), A-162 (Orders), A-163 (the Marshal), A-164 (the Siege's walls), A-165 (outcomes) and A-166 (Mythic Hunts and the realm's mythic reductions).
