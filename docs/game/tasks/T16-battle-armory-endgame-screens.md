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

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] A dev scenario that reproduces the Ch 11 worked exchange shows, after round 1, the Brute at **40.25** and the Knights at **69** (E-03).
- [ ] Replaying a saved log shows the same health at every round as the live battle (a view-model test over the log, and a manual check).
- [ ] Choosing more than banners + 2 companies, or more than 6, is blocked in the UI with the reason. Orders offered never repeat in a battle, and a played card disappears for that battle.
- [ ] Manual, with dev time travel: trigger an Incursion, let the battle day pass unfought, and see the auto-resolved result and its replay at the next launch. Trigger a Mythic Hunt, fight it by hand, and win or lose.
- [ ] At 1000 px wide the "widen the window" notice appears instead of the field.
- [ ] Armory: buying and equipping update the roster at once; the Wing choice can't be made twice; the Milestone card appears once per Milestone and not again on reload; no later Milestone's unlocks are named anywhere before it breaks (scan the rendered view model).
- [ ] Accord: proposing one while a contract runs is refused with a clear reason (D-01); with the slot free it seals, and it appears on the Contract page.
- [ ] Manual, with the scenario loader: trigger the Rising Crown and see the card and the banner; force an Ultimatum and bend the knee once (a second attempt is refused); win a forced Siege and see the Humbled card; lose one and see the Fall screen; win the campaign and see the victory screen, then keep playing in the Reign.
- [ ] Screenshots at 1280×800 and 1920×1080: preparation, a mid-battle round with intents and Order cards, a result card, the Armory with locked and unlocked ranks, a Milestone card, the Ultimatum banner, the victory screen and the Fall screen.

## Hand-off notes

*(The implementing agent adds notes here.)*
