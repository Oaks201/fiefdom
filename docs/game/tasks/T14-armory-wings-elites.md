# T14 — Armory, Wings, Elites and Milestone unlocks (engine and screen)

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T05, T07, T12, T16 | T15, T21 | **Yes** (Appendix C content) |

## Goal

Make weight Milestones *crown* the realm. Each Milestone unlocks its content exactly when it breaks: the Armory and items, permanent building Wings, Elite companies, the Sworn, and the realm-wide boons. This task ships both the rules and the Armory screen, because the screen is small and tightly tied to the rules.

## Read first

- Book: Ch 9 "Milestones" (the unlock table), Pillar 5 in the Preface, Appendix C "Elite companies", "Wings", "Items (the Armory)" and "Orders and Doctrines" (Last Stand).
- Decisions: A-21, A-30, A-31.
- Code: T07's `effects.ts` and `roster.ts` (which leave slots for this task), T12's ability and item interface, T16's `<GameArt>` and big-moment card components.

## Scope

1. **`lib/game/armory.ts`, unlocks by Milestone** (from Ch 9's table):
   - M1: the Armory, one item slot per company, rank I items.
   - M2: first Wings.
   - M3: Elites, rank I.
   - M4: the Proving Grounds (+10% all companies) and a second item slot.
   - M5: second Wings and rank II items.
   - M6: the Healing Springs (rally +10%, Respite +1; Tier V becomes possible).
   - M7: Elites rank II and the Sworn.
   - M8: third Wings, rank III items, the Crown Forge (+1 banner).
   - M9: Legendary items, one per building.
   - M10: the Sovereign's Statue (+10% reputation, the title "the Steadfast", the Crownguard Ascendant +10).

   Unlocks are never revoked, because Milestones never are.
2. **Items:**
   - Buy at codex cost, gated by rank, with discounts (Great Forge −30%; a Merchant Caravan event offer −40% for 7 days).
   - Equip and unequip per company within its slots (1, or 2 from M4, plus a third slot for one company with the Armorer Wing).
   - Effects apply in daily combat (through `effects.ts` and `roster.ts` power) and in Grand Battles (through T12's interface).
   - Trophies from Mythic Hunts and mythic victories are unique and are never sold.
   - Herald's Horn is usable once a month.
3. **Wings:** at M2, M5 and M8, choose one of two per building, permanently. Wire all 24 Wing effects into `effects.ts`.
4. **Elites:** recruit at 300 per building (Oathsworn, Gold Cloaks, Starwardens, Sappers); rank II for 600 more at M7. Abilities run through T12's ability effects. The Sworn (A-21) join free at M7 with two tags chosen once.
5. **The Armory page** (`pages/ArmoryPage.tsx`):
   - Items grouped by rank. Locked ranks show which Milestone opens them; the Milestone *number* is shown, but nothing that spoils what later Milestones unlock.
   - Buy, and equip to a company. A Wing choice modal that says the choice is permanent and needs a confirming hold. Elite recruit and rank-up.
   - All art goes through `<GameArt>`; descriptions come from `t('items.*')` and `t('units.*')`.
   - Show the full-screen Milestone unlock card (T16's big-moment component) when a Milestone breaks, once.
   - View models in `lib/game/view/armory.ts`.

## Out of scope

Milestone thresholds themselves (T05); item art (A2); final description text (A3).

## Files

- Create: `src/renderer/src/lib/game/armory.ts`, `src/renderer/src/lib/game/view/armory.ts`, `src/renderer/src/pages/ArmoryPage.tsx`, `src/renderer/src/components/armory/*`, `src/renderer/src/styles/armory.css`, `tests/game/armory.test.ts`.
- Edit: `effects.ts`, `roster.ts`, `grand.ts` (item and ability hookup), `settle.ts` (unlock events when a Milestone breaks), `types.ts`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Each unlock appears exactly at the week close where its Milestone breaks, never before, and stays after a weight regain.
- [ ] Buying a rank II item before M5 is refused. Equipping a second item before M4 is refused, and a third is refused unless the company has the Armorer slot.
- [ ] Whetstones (+2) raise that company's power in the daily Army sum by 2 × m. Cold Iron Edges gives a Coin-only company the Steel tag, so it strikes Archmage conjurations at ×1.5.
- [ ] The Healer's Satchel heals 15% each round in a Grand Battle. Tower Shields give +20% health. The Oath-Ring lets a company ignore Weary.
- [ ] A Wing choice is permanent: a second choice for the same building and Milestone is refused. The Counting House gives +25% tithes, Bastions walls +6, and the Siege Park +1 daily assault, all visible in `realmEffects` with their sources.
- [ ] Recruiting an Elite spends 300. Rank II needs M7 and spends 600.
- [ ] The Statue's +10% adds to the Merchant Hall bonus (A-31): Merchant Hall V plus the Statue turns a 100 gain into 125.
- [ ] Screen: at 1280×800 and 1920×1080, the Armory page shows locked and unlocked ranks, buying and equipping update the roster immediately, and the Milestone card appears once per Milestone and not again on reload. Attach screenshots.
- [ ] No later Milestone's unlocks are named anywhere on screen before they break (search the rendered view model in a test).

## Hand-off notes

*(The implementing agent adds notes here.)*
