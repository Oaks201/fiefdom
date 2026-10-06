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

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 3 (E-02): the Ch 10 worked battle (Battlemages 18 and Rune Golems 18, both Arcane ×1.5; Wardens 14 ×1.5; Pikemen 14 ×1; a = 0.10; W = 20; r = 0.55) gives Army 117.9, Defense **116.31** at V = 0.97 and **81.29** at V = 0.31 (±0.01). That is a win and a loss against strength 115.
- [ ] Matching: a company tagged Steel and Arcane against Archmage conjurations (weak to Steel, resists Arcane) strikes at ×1.5.
- [ ] Early grace: threats hit at 70% in week 1 and 85% in week 3. No conquest attempt is accepted before week 6. A Saturday threat is ×1.4.
- [ ] Determinism: the same seed and day give the same threat type, target and roll. Over 10,000 simulated days with all four rivals eligible, the mix is 40 / 20 / 40 ± 2 percentage points.
- [ ] Contested flow: lose a conquest attempt and the hex is contested for 1 day; win the next day and it is broken; lose again and the hex passes at dawn. At Grace II it holds 2 days. A ring-2 hex losing a conquest-strength battle never changes owner (Test 10, part).
- [ ] Assault: Assault ≥ garrison takes the hex with 4 × ring spoils; ≥ 1.5 × garrison gives 6 × ring; a ring-3 beast den (garrison 49.5) is taken by Assault 50 and repulsed by 49, after which its garrison is 49.5 − 12.25 = 37.25 until week close and the companies are Weary tomorrow.
- [ ] No orders: every company defends and no assault happens.
- [ ] A battle settles once. After a ledger correction inside the grace window changes yesterday's Valor, re-running `settle` does not change yesterday's battle result (Test 9, part).

## Hand-off notes

*(The implementing agent adds notes here: the interface T10 uses to inject raids and conquest attempts, and the one T12 uses to receive Grand Battle triggers.)*
