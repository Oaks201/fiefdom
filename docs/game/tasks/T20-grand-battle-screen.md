# T20 — Grand Battle screen (desktop)

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T12, T16 (T14 for equipping items) | T21 | **Yes** (enemy rosters and intents) |

## Goal

The hands-on fight, in 5 to 10 minutes: prepare during the warning, then fight four rounds on a 3-lane field, reading enemy intents, choosing one of three Orders, swapping two companies, and watching the exchange. Afterwards the battle can be replayed from its log. Desktop only.

## Read first

- Book: Ch 11 (all of it), Appendix C "Orders and Doctrines", "Rival hosts and intent patterns" and "Mythic Hunts", Ch 17 "Big moments".
- Decisions: D-03, A-29, A-35.
- Code: T12 `grand.ts` (its API: `prepare`, `setFormation`, `setDoctrine`, `begin`, `offeredOrders`, `playRound`, `autoResolve`, `replay`), T16 `<GameArt>` and the big-moment card.

## Scope

1. **Entry:** a Grand Battle notice in the Herald and top bar during the warning ("Battle at hex 4-7 in 2 days"). On the battle day, "Fight now" opens the screen. An unfought battle auto-resolves at day close, and the player sees the result card next launch with a "watch replay" option.
2. **Preparation:**
   - The enemy host as bands ("a large warband with heavy cavalry"), or the full roster when revealed.
   - Choose companies (up to banners + 2, never more than 6).
   - Drag them into the 3 × 2 formation; equip items (T14); pick a Doctrine, with its effect shown.
   - The Readiness for this battle, from the last 7 days of Valor, explained in one line.
3. **The battle view:**
   - Three lanes, each with front and rear slots on both sides.
   - Each company: token art, power, a health bar, tags, reach, and status (Weary, Petrified, Poisoned).
   - Each enemy lane shows its intent icon and a tooltip with the exact effect (Charge deals ×1.5 and takes ×1.25, D-03).
   - Three Order cards, playable once each per round. One optional swap. "Resolve round" animates the exchange with floating damage numbers, then routs and advances.
   - A running round log.
4. **The result:** win, Rout or defeat, with the outcome effects (spoils, Respect, a hex taken or returned, a trophy). Shown on the big-moment card for decisive battles (Gate, Capital, Siege, Mythic Hunt).
5. **Replay:** play back any stored battle from its log at 1×, 2× or 4× speed, or step by step.
6. **Minimum window width 1024 px.** Below that, show a "widen the window" notice (Ch 11: desktop only).
7. **View models** in `lib/game/view/battle.ts`, with tests.

## Out of scope

The rules of battle (T12); final unit art (A2); sound (A4, through T16's sound slots).

## Files

- Create: `src/renderer/src/pages/BattlePage.tsx`, `src/renderer/src/components/battle/*`, `src/renderer/src/lib/game/view/battle.ts`, `src/renderer/src/styles/battle.css`, `tests/game/viewBattle.test.ts`.
- Edit: `App.tsx` and `state/ui.ts` (the battle route), `components/game/Herald.tsx` (the notice).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] A dev scenario that reproduces the Ch 11 worked exchange: after round 1 the screen shows the Brute at **40.25** and the Knights at **69** (E-03).
- [ ] Replaying the saved log shows the same health at every round as the live battle (a view-model test over the log, plus a manual check).
- [ ] Choosing more than banners + 2 companies, or more than 6, is blocked in the UI with the reason.
- [ ] Orders offered in a battle never repeat. A played Order card disappears for that battle.
- [ ] Manual, with dev time travel: trigger an Incursion, let the battle day pass without fighting, and see the auto-resolved result and its replay at the next launch. Trigger a Mythic Hunt, fight it by hand, and win or lose.
- [ ] At 1000 px wide the "widen the window" notice appears instead of the field.
- [ ] Screenshots at 1280×800 and 1920×1080 of preparation, a mid-battle round with intents and Order cards, and the result card.

## Hand-off notes

*(The implementing agent adds notes here.)*
