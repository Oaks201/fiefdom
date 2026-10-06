# T13 — The living world: coalitions, events, resolving rivals, Ascendancy and the Siege

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T10, T12 (and T09) | T15, T19 | **Yes** (event deck, hidden criteria) |

## Goal

Close the loop on the campaign. Rivals band together against a rising player; a deck of hidden events keeps the world moving; each rival can be resolved by conquest, defection or Accord; a rival that out-grows the player late can force a Siege of the Crown; and victory or the Fall ends the campaign. Fill the `world` week phase.

## Read first

- Book: Ch 13 (all of it), Ch 14 (all of it), Appendix C "The world-event deck" and "The Archmage's Rituals", Ch 16 rows on fear of losing and coming back after an absence, Ch 9 Grace III (coalitions shortened, Ascendancy delayed), Test 10.
- Decisions: **D-01**, A-04, A-10, A-22, A-34.

## Scope

All in `lib/game/world.ts`.

1. **Coalitions** (Ch 13):
   - Triggers: the First Fall (the two highest-Threat rivals; the third becomes the Watcher at Threat +10); the Last Alliance (both remaining rivals, unless one is at Respect ≥ 60, which refuses and stays at Tension); the Rising Crown (player Power ≥ 1.5 × the average rival Power for 3 weeks in a row, before any rival is resolved; the rivals bounding the strongest direction, per A-34).
   - Limits: none before week 12; never three rivals allied at once. Durations are 10 weeks, until resolved, and 6 weeks, each 2 weeks shorter at Grace III.
   - While a coalition stands: both members are at War with the player; their shared front is at Peace; each puts 10% of income into a war chest that funds a Coalition Offensive Grand Battle within 14 days of forming (through T12); both raid 25% more often; a Goblin member hires mercenaries for its partner every 4 weeks.
   - Breaking it: win the Offensive (it ends 2 weeks early); pay one member 300 at Respect ≥ 40 to leave; or betrayal (a seeded 15% each week for a member at Respect ≥ 50).
2. **Resolving rivals** (Ch 14):
   - Conquest: win the Gate battle, then the Capital battle → *conquered*. The capital and realm become ruins; its remaining hexes turn neutral with village loyalty halved; every rival's Threat +15; the Pretender event becomes eligible; its company (power 24, A-20) joins as a vassal.
   - Defection: the rival holds no villages, and at least half of its original villages were won by influence or trade (T09's tally; villages lost in Border Campaigns count toward "holds none") → *abdicated*. Its remaining land and its company pass to the player; Threat +10; the Goblin, if active, offers to buy one of those hexes.
   - Accord: Respect ≥ 60, Castle III, and the rival not in a coalition. The player seals a 30-day Accord contract (T04's `accord` kind; it takes the contract slot and **pays both** the normal payout and Respect +50 × f(Q), or 60 × at Respect ≥ 75, per D-01). It is signed when Respect reaches 100; otherwise it can be sealed again. While it runs, that rival makes no raids or conquest attempts. → *allied*: it stops raiding, keeps its land, stops expanding toward the player, and lends its company free; it may fight beside the player in one Grand Battle a month; Threat +5.
   - Pacing: no rival is resolved before week 12, and at most one in any 8 weeks.
3. **The event deck:** all 14 Appendix C events with their hidden criteria, at most one new event per week, once each unless recurring, with their effects wired into T08, T09, T10 and T12 hooks.
   - The Hungry Winter fires in the first full week of December.
   - The Wild Hunt waits for the next full moon. Use a simple synodic-month calculation from a known new moon, with a test.
   - Events never take land in rings 0 to 2, never end the campaign, and always announce a Grand Battle at least 2 days ahead. Herald text comes from `events.*`.
4. **Ascendancy and the Siege** (Ch 14):
   - From week 36 (44 at Grace III), a rival whose Power is ≥ 1.5× the player's (1.6× at Grace I+) at 4 week closes in a row enters Ascendancy. Coalition members add their Power together.
   - Warnings from week 32 whenever a ratio passes 1.3×.
   - A 14-day Ultimatum, then the Siege of the Crown on day 14: a Grand Battle against 70% of AV (a coalition sends both), with walls counting in full.
   - The Ultimatum is lifted if the ratio drops below 1.3× at any week close before the siege.
   - Bend the knee, once per campaign: pay 25% of the rival's treasury estimate (shown as a price) to delay 4 weeks.
   - Absence (A-10): a siege can never fall within 7 days of a return from 14 or more days away; the Ultimatum waits.
   - Winning the siege: the rival is Humbled (AV −50%, Respect +10, no Ascendancy for 8 weeks). Losing it: the campaign status becomes `fallen`, which is final.
5. **Victory:** with all four rivals resolved, the castle becomes the High Throne (Castle V) and the status becomes `won`. The Reign continues: Milestones, the lairs and Tier V stay available, while new realms are out of scope.
6. **The Chronicle record** for the endgame screens: days kept, hexes held, RC, Milestones, battles, and how each rival fell.

## Out of scope

The screens (T19 and T20); balancing (T15 reports).

## Files

- Create: `src/renderer/src/lib/game/world.ts`, `tests/game/world.test.ts`, `tests/game/endgame.test.ts`, `tests/game/invariants.test.ts`.
- Edit: `settle.ts` (fill `world`; the Accord hook in `contractEnd`), `grand.ts` (Coalition Offensive, Siege and event-battle hooks), `rivals.ts`, `land.ts` (coalition buy-out deal), `types.ts`, `rules.ts`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 10: in `invariants.test.ts`, over 300 seeded 70-week runs (reuse the T11 harness), there is no `fallen` before week 36 (44 at Grace III), no ring 0–2 hex ever changes owner, no Border Campaign targets a Gate, a capital or a player hex, three rivals are never allied at once, and no coalition forms before week 12.
- [ ] Resolution pacing: with forced-perfect inputs, nothing is resolved before week 12, the second resolution comes at least 8 weeks after the first, and the earliest victory is week 36.
- [ ] Accord (D-01): a 30-day Accord at Q = 0.90 from Respect 60 adds 41.7 Respect (→ 101.7, signed) **and** pays 500.0 reputation. At Q = 0.70 it adds 25.0 (→ 85) and pays 300.0; the rival is not yet allied, and a new Accord can be sealed. While it runs, the contract slot is busy and that rival makes no raids.
- [ ] Defection: courting the rival's last village, with at least half of its villages won by influence or trade, makes it abdicated. If more than half were conquered, it does not abdicate.
- [ ] Ultimatum: lifted when the ratio drops below 1.3× at a week close. Bend the knee works once and then refuses. A siege scheduled 3 days after a return from 20 days away moves to day 7 after the return.
- [ ] Each event fires only when its criteria are met, at most one new event per week, and non-recurring events only once. The Hungry Winter of 2026 fires in the week starting 2026-12-07 (Monday weeks). The full-moon function returns 2026-10-26 ± 1 day.
- [ ] Winning the Siege: AV −50%, Respect +10, and no new Ascendancy for 8 weeks. Losing it sets status `fallen`, after which `settle` only records history.
- [ ] Victory sets Castle V and status `won`, and the game keeps settling in the Reign.

## Hand-off notes

*(The implementing agent adds notes here.)*
