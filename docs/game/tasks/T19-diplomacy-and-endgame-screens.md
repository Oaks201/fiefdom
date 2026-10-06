# T19 — Diplomacy and endgame screens

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T10, T13, T16 (T09 through T10) | T21 | Light (no hidden numbers) |

## Goal

Show the four rival courts the way a Civ-style diplomacy screen does: who they are, how they feel about you, roughly how rich and strong they are, and what they will deal on. Short, in-character one-liners come from the text catalog. Also build the endgame screens: coalition news, the Ultimatum, the Siege, victory and the Fall.

## Read first

- Book: Ch 6 "Influence" and "Trade and negotiation", Ch 12 "What the player sees" and "Respect", Ch 13 "Coalitions" and "When a rival falls", Ch 14 (all of it), Ch 16 "Fear of losing" and "Shame", Ch 17 (the NPC interaction note at the top, and the rival look table).
- Decisions: D-01, A-24, A-46.
- Code: T09 `land.ts` (`availableDeals`, courtships), T10 `rivals.ts` (`rivalView`), T13 `world.ts`, T16 `<GameArt>`, Herald and the big-moment card.

## Scope

1. **Rival panels** (one per rival):
   - A portrait through `<GameArt>` in a mood that follows disposition: calm at Peace, angry at War, humbled when Humbled or resolved.
   - Name, realm and status (active, allied, abdicated, conquered, in a coalition, the Watcher).
   - Disposition toward the player; a Respect meter with the 25, 40, 50, 60 and 75 thresholds marked and what each opens.
   - The treasury band and the army band compared with yours (exact numbers only with the Spy Network or Spymaster), rumors, and its current front wars.
   - A one-line greeting from `rivals.<id>.*` that reflects its mood. Lines stay short; the writing itself is A3.
2. **Deals:** every deal from `availableDeals` with its price and requirement. Unavailable deals stay listed with the reason. Confirming a deal shows the rival's one-line reaction.
3. **Courtships:** open bids (village, bid, current Trust, slots used); place or raise a bid; past results (defected, held, and by how much loyalty dropped). Offers resolve at week close.
4. **Accords:** when open (Respect ≥ 60, Castle III, not in a coalition), "Propose an Accord" seals a 30-day Accord contract through T04 (it takes the contract slot and pays both, per D-01), with the expected Respect gain at the current RC.
5. **Coalitions:** a banner when one stands, showing members, end date, the Offensive warning and the buy-out option. A big-moment card when one forms, using `coalitions.*` text.
6. **The Ultimatum:** a calm, unmistakable banner with a countdown, what lifts it ("bring their power below 1.3× yours by a week close", phrased without numbers the player can't see), the bend-the-knee price, and a link to prepare for the Siege.
7. **Endgame cards:**
   - The Siege result.
   - Victory: the High Throne, with the Chronicle record from T13 (days kept, hexes held, RC, Milestones, battles, how each rival fell).
   - The Fall: told as chronicle, not judgment, with the same record (Ch 16 "Shame").
   - Reign mode after victory.
8. **View models** in `lib/game/view/diplomacy.ts` and `view/endgame.ts`, with tests.

## Out of scope

The deal rules (T09, T13); the Grand Battle screen (T20); final portraits and lines (A2, A3).

## Files

- Create: `src/renderer/src/components/diplomacy/*`, `src/renderer/src/components/endgame/*`, `src/renderer/src/lib/game/view/diplomacy.ts`, `view/endgame.ts`, `src/renderer/src/styles/diplomacy.css`, `tests/game/viewDiplomacy.test.ts`.
- Edit: `pages/DiplomacyPage.tsx`, `App.tsx` (endgame overlays).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Hidden values: for every rival and every state in a 70-week sim trace, the Diplomacy view model contains no exact treasury, AV, income, benchmark or event criteria, unless the Spy Network or Spymaster applies (scan values against the true numbers).
- [ ] Every deal shown as available is accepted by the engine; every unavailable one shows the engine's reason text id.
- [ ] Accord: proposing one with a contract already running is refused with a clear reason (D-01: the slot is busy). Proposing one with the slot free seals it, and it appears on the Contract page.
- [ ] Manual, with dev time travel and dev seeds: raise Respect with the Goblin to 25 and buy a hex; court a neutral village and see it defect at week close; trigger the Rising Crown coalition and see the card and the banner; force an Ultimatum and use bend the knee once (a second attempt is refused); win and lose a forced Siege and see the victory or Humbled card and the Fall screen.
- [ ] Screenshots at 1024×768 and 1920×1080 of the four rival panels, the deals list, the courtships list, the Ultimatum banner, the victory screen and the Fall screen.

## Hand-off notes

*(The implementing agent adds notes here.)*
