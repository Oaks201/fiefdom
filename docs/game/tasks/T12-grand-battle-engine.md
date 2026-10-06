# T12 — Grand Battle engine

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T07, T08, T10 | T13, T14, T15, T20 | **Yes** (enemy hosts, intents, Orders) |

## Goal

Build the tactical Grand Battle as a deterministic state machine: what triggers one, the warning and preparation, the enemy host, four rounds of intents, Orders, repositioning and exchange, the Marshal's autoplay at day close, outcomes, and a log that replays exactly. Fill the `grandBattlesAuto` day phase. The screen is T20.

## Read first

- Book: Ch 11 (all of it), Ch 14 "Defeat" (the Siege of the Crown), Appendix C "Company reach", "Orders and Doctrines", "Rival hosts and intent patterns" and "Mythic Hunts".
- Decisions: **D-03**, A-29, A-30, A-33, A-35, A-47, E-03.

## Scope

All in `lib/game/grand.ts`.

1. **Triggers** (Ch 11 table): Incursion (A-33), the Gate, the Capital (only while holding that Gate), Mythic Hunt (assaulting a Lair Mouth; or 8% of assaults on ring 4–5 beast hexes in the West or East, seeded), the Coalition Offensive (hook for T13), the Siege of the Crown (hook for T13), event battles (hook for T13), and the Orc Warhost (from T10).
   - Warnings: 2 or 3 days (14 for the Siege), +1 day with Mage Tower IV.
   - Spacing: no more than one Grand Battle in any 5 days; later triggers queue.
   - Retries: a lost Mythic Hunt can be retried after 7 days; a lost Gate or Capital after 14.
2. **Preparation state:**
   - Choose up to banners + 2 companies, never more than 6.
   - Formation: 3 lanes (left, center, right) × 2 ranks (front, rear); one company per slot.
   - Equipped items come from T14's slice (empty until then). One Doctrine from those available (effects).
   - Hidden roster: the host appears as bands unless Mage Tower IV, the Spy Network or the Observatory reveals it.
3. **Enemy hosts.**
   - A rival's host is 60% of its AV at the moment of the warning (a coalition's: 50% of each member's; the Siege: 70%), filled per A-35 from Appendix C's lists.
   - Mythic Hunts use the fixed Appendix C rosters, scaled by 1 + week ÷ 52, with special health multipliers (×6 Basilisk, ×8 Dragon, ×5 Manticore), which replace the usual 4 × p (A-47).
   - All rival companies count as that rival's type for matching.
4. **Units.** Health H = 4 × p (adjusted by items, Doctrines and Shield Forge through effects). Reach comes from the codex. Readiness R = 0.6 + 0.5 × the 7-day average Valor (0.6 to 1.1, never below 0.7 with Sanctum).
5. **A round** (4 rounds), in this order:
   1. **Intents** from the seeded per-rival pattern plus the specials: Shamans always Spell; Ogres Charge in round 2; Rune Priests Spell in round 3; the Echo Spells every lane in round 4; Wyverns Volley every round; Griffins always Charge and Shift; Hounds Shift to the weakest lane. Foresight and Foreknowledge reveal intents.
   2. **Orders:** offer 3 from the player's deck (4 with Leyline Anchor), never repeating within a battle; the player plays one. Implement every Order in the codex as data-driven effects.
   3. **Reposition:** at most one swap of two of the player's own companies.
   4. **Exchange,** simultaneous, per lane:
      - A front company deals p × m × R to the opposing front (or the rear if there is no front).
      - A ranged company in the rear deals 0.8 × p × m × R to the opposing front. A melee rear company does nothing.
      - Enemies deal p × the intent multiplier, with no matching (A-29).
      - Intent multipliers: Charge deals ×1.5 **and takes ×1.25** (D-03). Brace deals ×0.5 and takes ×0.5. Volley sends ranged damage to the player's rear. Spell deals 0.5 × power to both player companies in that lane. Shift moves to a neighboring lane at round end.
   5. **Rout and advance:** a company at 0 health leaves the field, and an empty front is filled by its rear.

   The battle ends after round 4, or as soon as one side is empty. The higher remaining health share wins. A wipe-out, or twice the enemy's share, is a Rout.
6. **Abilities and specials** as data-driven effects: Elite abilities (Oathsworn, Gold Cloaks, Starwardens, Sappers), the Sworn (never Weary; cannot rout in round 1), mythic specials (Petrify, Fire, Poison), and Doctrines (Hold the Line, Mercenary Contract, Foreknowledge, Engineered Fortress, Last Stand).
7. **The Marshal's autoplay**, used for any battle not fought by day close: strongest health in front, ranged in the rear, each round's Order chosen by highest immediate damage, at Readiness − 0.1.
8. **Outcomes** (Ch 11 table): Incursion, Gate, Capital, Mythic Hunt, Coalition Offensive. Siege results are a hook for T13. Routed companies are Weary for 3 days; nothing is ever destroyed. Spoils, tribute and Respect are posted as events.
9. **Determinism and replay.** Given the seed, the formation and the Orders played, the result is always the same. Store `BattleRoundLog[]` with every intent, Order, swap and damage line, and add `replay(log)`, which rebuilds each round's state for T20's animation.
10. **API for the screen:** `prepare`, `setFormation`, `setDoctrine`, `begin`, `offeredOrders(round)`, `playRound(orderId, swap?)`, `autoResolve`, `result`.

## Out of scope

The battle screen (T20); coalition, siege and event logic around a battle (T13); buying items (T14).

## Files

- Create: `src/renderer/src/lib/game/grand.ts`, `tests/game/grand.test.ts`, `tests/game/grandHosts.test.ts`.
- Edit: `settle.ts` (fill `grandBattlesAuto`), `combat.ts` (route Gate, capital and Lair Mouth assaults to triggers), `rivals.ts` (Warhost hand-off), `types.ts`, `rules.ts`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 4 (E-03): the Ch 11 worked exchange (Knights 21 / 84 in front, Crossbowmen 9 ranged and Engine in the rear, against an Orc Brute 20 / 80 that Charges; R = 1.0; Shieldwall played) leaves the Brute at **40.25** and the Knights at **69**. The Crossbowmen's hit is 10.8.
- [ ] Determinism: the same seed, formation and Orders give the same log hash in three runs. `replay(log)` reproduces each round's health exactly.
- [ ] Host builder (A-35): an Orc with AV 100 sends a 60 budget → the Warboss (35) plus Brutes (20), 55 power. An Orc with AV 40 sends a 24 budget → no commander; Brutes (20) only.
- [ ] Mythic scaling: a week-26 Basilisk has power 60 × 1.5 = 90 and health 90 × 6 = 540.
- [ ] Spacing: triggers on day 10 and day 12 → the second battle is moved to day 15 or later. Mage Tower IV adds a day to each warning.
- [ ] Company limits: more than banners + 2, or more than 6, is refused.
- [ ] Orders offered never repeat within one battle. With Leyline Anchor, 4 are offered.
- [ ] Readiness: 7 days of Valor 1.0 → 1.1; 7 days of 0 → 0.6 (0.7 with Sanctum). Autoplay uses R − 0.1.
- [ ] An unfought battle auto-resolves at its day's close, exactly once (Test 9, part). Routed companies are Weary for 3 days, and the roster size is unchanged.
- [ ] Outcomes: an Incursion win cuts the rival's AV by 40% of the host sent, adds +5 Respect and pays 30 × ring. An Incursion loss returns the hex. A lost Gate battle blocks a retry for 14 days.

## Hand-off notes

*(The implementing agent adds notes here: the hook signatures for T13, and the item and ability effect interfaces for T14.)*
