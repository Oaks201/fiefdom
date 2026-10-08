# T16 — Battle, Armory and endgame screens

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T11, T12, T14, T15 | T17 | **Yes** (enemy rosters and intents, Armory content) |

## Goal

The screens for the big moments. The **Grand Battle** screen: prepare during the warning, then fight four rounds on a 3-lane field in 5 to 10 minutes, reading enemy intents, playing Orders, swapping companies and watching the exchange, with every battle replayable from its log (desktop only). The **Armory**: items, Wings, Elites and the Sworn, and the full-screen card when a Milestone breaks. The **endgame** in Diplomacy: Accords, coalitions, the Ultimatum, the Siege, victory with the Reign, and the Fall.

## Read first

- Book: Ch 11 (all of it), Ch 9 "Milestones" (the unlock table), Pillar 5, Ch 13 "Coalitions" and "When a rival falls", Ch 14 (all of it), Ch 16 "Fear of losing" and "Shame", Ch 17 "Big moments" and the rival look table, Appendix C "Items", "Wings", "Elite companies", "Orders and Doctrines", "Rival hosts and intent patterns" and "Mythic Hunts".
- Decisions: **D-01**, **D-03**, A-21, A-29, A-35, A-46.
- Hand-off notes: T11 (the battle API, replay format, `hostView`, the Armory actions, `milestoneUnlocks`), T12 (coalition, Accord, Ultimatum and record functions), T14 (plumbing, the big-moment card, `screens.cjs`), T15 (the Diplomacy view model and the scenario loader).

## Start from (built by T11, T12, T14 and T15)

- **Battles:** `prepare`, `setFormation`, `setDoctrine`, `begin`, `offeredOrders`, `playRound(orderId, swap?)`, `autoResolve`, `result`, `replay` and `hostView` (`grand.ts`); `state.grandBattles` with each battle's log; `grandBattle` events (announced, queued, fought).
- **The Armory:** its actions and `milestoneUnlocks(index)` (`armory.ts`); `unlock` events when a Milestone breaks; `realmEffects().itemSlots`, `extraItemSlots` and `costs.items`.
- **The endgame:** T12's view functions for coalitions, the Accord's gate, the Ultimatum (countdown and bend-the-knee price), the Siege and the Chronicle record; status `won` (the Reign) and `fallen`.
- **Plumbing:** `<GameArt>`, `useText()`, the sound ids, the big-moment card and the Herald (T14); the Diplomacy page and view model (T15).

## Scope

1. **Entry to a Grand Battle:** a notice in the Herald and the top bar during the warning ("Battle at hex 4-7 in 2 days"). On the battle day, "Fight now" opens the Battle screen (a route, not a tab). An unfought battle auto-resolves at day close, and the player sees its result card at the next launch with "watch replay".
2. **Preparation:**
   - The enemy host as bands ("a large warband with heavy cavalry"), or its full roster when revealed (`hostView`).
   - Choose companies (up to banners + 2, never more than 6; a blocked choice says why), drag them into the 3 × 2 formation, equip items (Armory), and pick a Doctrine with its effect shown.
   - This battle's Readiness, from the last 7 days of Valor, explained in one line.
3. **The battle view:**
   - Three lanes, each with front and rear slots on both sides.
   - Each company: token art, power, a health bar, tags, reach and status (Weary, Petrified, Poisoned).
   - Each enemy lane's intent icon, with a tooltip giving the exact effect (Charge deals ×1.5 and takes ×1.25, D-03).
   - The Order cards on offer, each playable once; one optional swap; "Resolve round" animates the exchange with floating damage numbers, then routs and advances. A running round log.
4. **The result:** win, Rout or defeat, with what followed (spoils, Respect, a hex taken or returned, a trophy), on the big-moment card for decisive battles (Gate, Capital, Siege, Mythic Hunt).
5. **Replay:** any stored battle, from its log, at 1×, 2× or 4× or step by step.
6. **Desktop only:** below 1024 px wide, a "widen the window" notice replaces the field (Ch 11).
7. **The Armory page:**
   - Items grouped by rank. A locked rank shows the Milestone *number* that opens it, never what later Milestones unlock.
   - Buy, and equip to a company within its slots; the roster updates at once.
   - The Wing choice: a modal that says the choice is permanent and needs a confirming hold.
   - Elite recruiting and rank II; the Sworn's two tags, chosen once (A-21).
   - All art through `<GameArt>`; descriptions from `t('items.*')` and `t('units.*')`.
8. **The Milestone card:** the full-screen card when a Milestone breaks, listing only what it opens (`milestoneUnlocks`), shown once per Milestone and never again after a reload.
9. **The endgame in Diplomacy:**
   - **Accords:** when one is open, "Propose an Accord" seals the 30-day Accord through T12's action (it takes the contract slot and pays both, D-01), showing the expected Respect gain at the current Realm Consistency. With a contract already running it is refused with a clear reason.
   - **Coalitions:** a banner while one stands (members, end date, the Offensive's warning, the buy-out) and a big-moment card when one forms, from `coalitions.*`.
   - **The Ultimatum:** a calm, unmistakable banner with its countdown, what lifts it ("bring their power below 1.3× yours by a week close", without numbers the player can't see), the bend-the-knee price, and a link to prepare for the Siege.
   - **Endgame cards:** the Siege's result; victory (the High Throne, with T12's Chronicle record: days kept, hexes held, Realm Consistency, Milestones, battles, how each rival fell); the Fall, told as chronicle and not judgment (Ch 16), with the same record; and the Reign after a victory.
10. **View models** in `lib/game/view/battle.ts`, `view/armory.ts` and `view/endgame.ts` (extending `view/diplomacy.ts` where it fits), with tests. Components only render.

## Out of scope

The rules of battle, the Armory and the endgame (T11, T12); final art, lines and sounds (A2 to A4).

## Files

- Create: `src/renderer/src/pages/BattlePage.tsx`, `src/renderer/src/components/battle/*`, `components/armory/*`, `components/endgame/*`, `src/renderer/src/lib/game/view/battle.ts`, `view/armory.ts`, `view/endgame.ts`, `src/renderer/src/styles/battle.css`, `armory.css`, `tests/game/viewBattle.test.ts`, `viewArmory.test.ts`, `viewEndgame.test.ts`.
- Edit: `App.tsx` and `state/ui.ts` (the battle route, endgame overlays), `pages/ArmoryPage.tsx`, `pages/DiplomacyPage.tsx`, `components/game/Herald.tsx` (the battle notice), `components/TopBar.tsx`.

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] A dev scenario that reproduces the Ch 11 worked exchange shows, after round 1, the Brute at **40.25** and the Knights at **69** (E-03).
- [x] Replaying a saved log shows the same health at every round as the live battle (a view-model test over the log, and a manual check).
- [x] Choosing more than banners + 2 companies, or more than 6, is blocked in the UI with the reason. Orders offered never repeat in a battle, and a played card disappears for that battle.
- [x] Manual, with dev time travel: trigger an Incursion, let the battle day pass unfought, and see the auto-resolved result and its replay at the next launch. Trigger a Mythic Hunt, fight it by hand, and win or lose.
- [x] At 1000 px wide the "widen the window" notice appears instead of the field.
- [x] Armory: buying and equipping update the roster at once; the Wing choice can't be made twice; the Milestone card appears once per Milestone and not again on reload; no later Milestone's unlocks are named anywhere before it breaks (scan the rendered view model).
- [x] Accord: proposing one while a contract runs is refused with a clear reason (D-01); with the slot free it seals, and it appears on the Contract page.
- [x] Manual, with the scenario loader: trigger the Rising Crown and see the card and the banner; force an Ultimatum and bend the knee once (a second attempt is refused); win a forced Siege and see the Humbled card; lose one and see the Fall screen; win the campaign and see the victory screen, then keep playing in the Reign.
- [x] Screenshots at 1280×800 and 1920×1080: preparation, a mid-battle round with intents and Order cards, a result card, the Armory with locked and unlocked ranks, a Milestone card, the Ultimatum banner, the victory screen and the Fall screen.

## Hand-off notes

### Evidence (2026-10-07)

- `npm run typecheck`: clean. `npm test`: 612 tests, 612 pass (new: `viewBattle.test.ts` 7, `viewArmory.test.ts` 5, `viewEndgame.test.ts` 6). `npm run check:game`: `check:game OK: 41 game files, codex valid, 297 text slots.` `npm run text:check`: `297 slots, 0 written, 297 on placeholder.` `npm run assets:check`: `255 slots, 0 with art.`
- **E-03 on screen:** "T16 / E-03: the worked-exchange scenario shows the Brute at 40.25 and the Knights at 69 after round 1 with Shieldwall"; in the dev app, the *workedExchange* scenario opened from the Herald's "Fight now", the center lane read "Charge" with the tooltip "Charge: its front deals ×1.5 and takes ×1.25.", and after Shieldwall the cards read **Brutes 40.25 / 80** and **Knights 69 / 84**, with floating hits of −26.25, −13.5 and −15 (`docs/game/screens/t16/battle-round-*` shows round 2).
- **Replay:** "Ch 11 rule 4: replaying a saved battle shows the same health at every round as the live battle" (a Mythic Hunt played round by round, every company's health compared with the replay frames); in the app the Incursion's card opened the replay at 1×, 2× and 4×.
- **Limits and Orders:** "Ch 11 "Preparation": at most banners + 2 companies, never more than 6; a formation past the limit is refused with its reason" (the six slots make more than 6 impossible to place); in the app, with the *crowdedRoster* scenario (ten companies, two banners), placing a fifth company read "More companies than the battle allows. This battle fields at most 4." "Ch 11 / A-162: Orders offered never repeat within a battle, and a played card is gone for the rest of it".
- **Manual, with dev time travel:** an Incursion left unfought ("Incursion at hex 1-1 in 2 days"; +3 days) was fought by the Marshal at its close, and the next launch showed "Grand Battle (Incursion) at hex 1-1: lost." with "Fought by the Marshal at the day's close.", the hex scorched (rings 0 to 2 never fall), Weary companies, and "Watch the replay". A Mythic Hunt (the Manticore) fought by hand from preparation: lost, tribute −12.5, Weary through Oct 13, again from Oct 17.
- **Desktop only:** at 1000 × 800 the "widen the window" notice shows (`display: flex`) and the field is hidden (`display: none`) (`widen-notice-1000x800.jpg`).
- **Armory:** "Pillar 7 / T16: no later Milestone's unlocks are named anywhere in the Armory before it breaks" (the view scanned for every locked item, Wing, Elite and the Sworn, with 0 to 8 Milestones broken); "T16: buying an item and equipping it changes the roster at once"; "Appendix C: a Wing is chosen once, for good"; "Ch 9 / Ch 17: each Milestone card lists only what that Milestone opens". In the app: Whetstones bought and equipped took Militia from 4 to 5.6 (Weary) at once; the Wing modal said "The choice is permanent" and after the hold the pair read "Drill Yard built" and "Watchtowers (closed)"; the Milestone 2 card listed only "The first Wings: one of two for each building" and did not come back after a reload.
- **Accord (D-01):** "D-01: proposing an Accord while a contract runs is refused with a clear reason; with the slot free it seals and shows on the Contract page"; in the app, with a contract running the panel read "A contract holds the slot. An Accord is the one running contract for its 30 days (D-01), so it waits until the slot is free."; once the slot was free, holding "Hold to propose an Accord" sealed it and the Contract page showed "Accord with Ugrak … ends Tuesday, Nov 10".
- **Manual, with the scenario loader:** the Rising Crown raised its card ("Coalition formed against the rising crown: Ugrak and Skivvet, until 2026-11-17.") and the banner with a buy-out for each member. An Ultimatum raised its card and the banner ("The Siege of the Crown in 14 days"); bending the knee moved it to 42 days, and the banner then read "The knee has been bent once already this campaign" (the engine refuses a second: "Ch 14 / Ch 16: … the knee bends once"). A Siege won: "won in a rout", "Respect +10 with Ugrak", "Ugrak's army −50%", "Ugrak is Humbled". A Siege lost: the battle's card, then the Fall's ("The Fall of the realm in week 6. Ugrak won the Siege of the Crown. Days kept: 33 …") with the record, which stays on Diplomacy and the Realm. Victory: the card and record, then "The Reign: the campaign was won in week 6, and the realm goes on.", and the next day still settled.
- **Screenshots** at 1280 × 800 and 1920 × 1080 in `docs/game/screens/t16/`: `preparation`, `battle-round` (a mid-battle round with intents and Order cards), `result-card`, `armory` (locked and open ranks), `milestone-card`, `ultimatum-banner`, `victory-screen` and `victory-record`, `fall-screen` and `fall-record`; and `widen-notice-1000x800`.

### What was built

- **View models:** `view/battle.ts` (`battleNotices`, `preparationView` with `hostWords` and `readinessLine`, `placeCompany`/`swapSlots`, `fieldView` with `intentText` and the Order cards' targets, `replayView`, `resultView`, `effectText` for every codex effect, `triggerName`, `shortDay`), `view/armory.ts` (`armoryView`, `milestoneCard`, `unlockLabel`; offers are the engine's own actions, run and discarded), `view/endgame.ts` (`accordPanel`, `coalitionBanners`, `ultimatumBanners`, `endgameView`, `momentsFor`). `refusals.ts` gains `armoryRefusalLabel` and `factor` (multipliers to two decimals).
- **Screens:** `pages/BattlePage.tsx` (a route: `useUI.openBattle(id, replay?)`, `closeBattle()`) with `components/battle/` (`Preparation`, `LiveBattle`, `FieldGrid`, `BattleParts`: result, replay, shares, round log); `pages/ArmoryPage.tsx` with `components/armory/ArmoryParts.tsx`; `components/endgame/Endgame.tsx` on Diplomacy (and the record on the Realm). The Herald lists each battle with "Prepare" or "Fight now"; the top bar has a battle button with a badge on the day.
- **Moments:** settlement raises every card through `momentsFor` (Milestones with their unlock lines, battles the Marshal fought and decisive ones with "Watch the replay", coalitions, Ultimatums, and last victory or the Fall); a player's last round and a dev scenario do the same. `Moment` gains `lines` and `action`, and `useMoments.showAll`.
- **Dev scenarios:** `milestone`, `accordReady`, `crowdedRoster`, `workedExchange`, `incursion`, `mythicHunt`, `risingCrown`, `ultimatum`, `siegeWin`, `siegeLose`, `victory`. `scripts/screens.cjs` steps can press and hold (`"hold"`, `"holdMs"`).
- **Text:** `herald.grandBattle.rout`, `.victory`, `.defeat` and `herald.reign` (plain facts).

### For T17

- The e2e script can drive everything through `window.fiefdomDev` (`advanceDays`, `scenario`) and the DOM: `.herald__battle button` (Fight now), `.prep__begin .btn--primary`, `.order-card`, `.orders-hand__targets .chip`, the "Resolve round" button, `.moment__actions` buttons. Hold-to-confirm buttons need a real pointer press (`"hold"` in `screens.cjs`).
- Dev scenarios post purse changes with `dev:scenario:<id>` sources (A-181): the runtime purse-source invariant should accept them in dev builds.

### Readings raised

A-182 (enemy power on the field, which battles get a card, the order of the Fall's cards, the Reign's line, the Accord's expected Respect, locked Armory parts).
