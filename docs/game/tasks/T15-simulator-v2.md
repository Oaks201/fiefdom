# T15 — Simulator v2: full campaign targets and tuning report

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T11, T12, T13, T14 | T21; the owner's tuning decisions | Yes (balance numbers) |

## Goal

Extend the T11 simulator to whole campaigns (Grand Battles, coalitions, events, resolving rivals, Ascendancy and the Siege) and measure every Chapter 15 target. Per **D-02**, the output is a report with proposed lever changes for the owner. Nothing in `rules.ts` changes.

## Read first

- Book: Ch 15 (all of it), Ch 14, Ch 11 "Rules" (the Marshal's autoplay).
- Decisions: **D-02**.
- Code: T11's `sim/` and `docs/game/sim/report-v1.md`.

## Scope

1. **Grand Battles in the sim:** the greedy policy fights with the Marshal's default formation and Orders (T12's `autoResolve`, without the −0.1 Readiness penalty, because the player is "present"). Equips the best affordable items. Picks Wings with a fixed preference list.
2. **The smarter policy** (Ch 15 step 2): greedy, plus Truces bought before an Ultimatum's siege, an Accord with the highest-Respect rival once it is open, the coalition buy-out when affordable, and defection-courting when a rival is down to 2 villages.
3. **Profiles:** all five from T11. Also "Steadfast on a long plateau" (89%, 0 lb/week after week 8).
4. **Measure** for 300 seeded campaigns per profile per policy, over 70 weeks:
   - the median win week, win within 70 weeks, and loss to Ascendancy (each with an 80% interval), against the Ch 15 targets table;
   - no profile losing before week 36;
   - Grand Battles per month for Steadfast (target 1 to 3);
   - the share of Steadfast campaigns that see at least one coalition (target 80%);
   - skill value: smarter vs greedy finishing time (target 10% to 20%);
   - how each rival was resolved (conquest, defection or Accord), hexes by month, the income ratio by week.
5. **Invariant checks in every run:** no loss before week 36 (or 44 at Grace III); rings 0 to 2 never change owner; a re-`settle` of a random sample of past days changes nothing; every purse event has a behavior, battle or land source; no Momentum gain above the target pace.
6. **Sensitivity sweeps** for each Ch 15 lever (benchmark b by phase, army cost, Ascendancy ratio, host share, payout-curve start, Tier IV Dominion, plus A-17 and A-18), at −20%, −10%, +10% and +20%, using a temporary override map passed to the sim, never edits to `rules.ts`. Show each lever's effect on Steadfast and Committed outcomes.
7. **The report:** `docs/game/sim/report-v2.md` and CSVs, ending with a ranked list of proposed changes. Each item says what to change, from what to what, and which targets it moves by how much.

## Out of scope

Changing `rules.ts` or any TUNE value; that is the owner's call.

## Files

- Edit: `sim/*`.
- Create: `docs/game/sim/report-v2.md`, `docs/game/sim/data/v2-*.csv`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] The full run (5 profiles + plateau × 2 policies × 300 runs × 70 weeks) finishes in under 60 minutes on the development PC. Record the time.
- [ ] Byte-identical CSVs across two runs with the same arguments.
- [ ] Every row of the Ch 15 targets table appears in the report as hit or miss, with the measured value and interval.
- [ ] The invariant checks ran in every campaign, and the report states zero violations, or lists each violation with its seed so it can be reproduced as a failing test.
- [ ] `git diff main -- src/renderer/src/lib/game/rules.ts` is empty (D-02).
- [ ] The sweep tables cover every lever in the Ch 15 levers table.

## Hand-off notes

*(The implementing agent adds notes here.)*
