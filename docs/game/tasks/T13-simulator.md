# T13 — The simulator and the tuning report

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T11, T12 | T17, and the owner's tuning decisions | Yes (balance numbers) |

## Goal

Run hundreds of seeded whole campaigns headless through the **real** game modules, measure every Chapter 15 target and invariant, sweep every lever, and write one report with proposed changes for the owner. Per **D-02** it only reports: no value in `rules.ts` changes, and no other task waits on the targets.

(This replaces the earlier two-step plan, Simulator v1 and v2. Under D-02 an early economy-only run would block nothing, so the simulator is built once, against the finished engine.)

## Read first

- Book: Ch 15 (all of it), Ch 14, Ch 11 "Rules" (the Marshal's autoplay), Appendix A "Suggested build order" step 6.
- Decisions: **D-02**, A-04.
- Code: `tests/game/support/rival-sim.ts` (a headless driver for the rival phases alone) and `tests/game/fixtures/ledgers.ts` (synthetic ledgers), both worth reusing or learning from.
- T10's hand-off "Tuning notes for the owner": Border Campaigns move a median of 1 hex a campaign against the book's 2 to 6, the Goblin's Market moves more land than they do, special funds pile up, and with a passive player every rival sits at War by about week 8.

## Behavior profiles

From version 1 (its Ch 11), extended by v2 Ch 15 with a weight trend:

| Profile | Duties kept | Typical week vs step pool | Days with food logged | Rough weeks | 4-week score | Weight trend |
| --- | --- | --- | --- | --- | --- | --- |
| Perfect | 100% | 120% | 100% | None | 100% | 0.8 lb/wk |
| Steadfast | 93% | 104% | 96% | 1 in 12 | 89% | 0.8 lb/wk |
| Steadfast, long plateau | 93% | 104% | 96% | 1 in 12 | 89% | 0 lb/wk after week 8 |
| Committed | 85% | 97% | 90% | 1 in 9 | 79% | 0.6 lb/wk |
| Wavering | 72% | 87% | 80% | 1 in 7 | 65% | 0.4 lb/wk |
| Casual | 55% | 72% | 65% | 1 in 6 | 48% | 0.2 lb/wk |

- A rough week means adherence drops by more than half for 7 days. Respite days are spent on rough days while the bank lasts.
- Weight gets ±1.5 lb of weekly noise and one 3-week plateau every 12 weeks. Use Rich's journey (217 → 168 lb) and a Charter of a 50,000 step pool, a 2,000 kcal limit and 3 duties.

## Scope

1. **`sim/` at the repo root**, run by a new npm script `sim` (`tsx sim/run.ts`). It drives campaigns through `foundCampaign` and `settle` with synthetic ledgers, and acts only through the game's own player actions: `buyTier`, `buyCastleTier`, `buyCrossing`, `placeBid`, `setOrders`, `makeDeal`, `fortify`, `reclaim`, the contract and Armory actions, and the Grand Battle API. It never reimplements a rule; any number it needs comes from `RULES`.
2. **The synthetic ledger generator:** per-day steps, food logged and kcal, duties kept and weigh-ins, from the profile and a seed.
3. **Two player policies** (Ch 15 step 2):
   - Greedy, each week: buy the cheapest tier that unlocks a new company or Crossing; court any village where Offer ≥ Resistance is affordable; assault the adjacent hex with the best Dominion per garrison point that the assault pool can beat; seal the longest unlocked contract; fight Grand Battles with the Marshal's choices (`autoResolve`) but without the −0.1 Readiness penalty, since the player is "present"; equip the best affordable items; pick Wings from a fixed preference list.
   - Smarter: greedy, plus Truces when a rival's raids are winning and before an Ultimatum's siege, fortifying contested hexes, an Accord with the highest-Respect rival once one opens, the coalition buy-out when affordable, and defection-courting when a rival is down to 2 villages.
4. **Runs:** 300 seeded campaigns per profile per policy over 70 weeks, in worker threads. For scale: on 2026-10-07 a 70-week campaign with a passive player settled in about 0.3 s and its state was about 0.46 MB.
5. **Rule overrides for the sweeps, without editing `rules.ts`.** `RULES` is a deep-frozen constant read everywhere, so run each lever value in its own worker and serve that worker a patched `rules.ts` (for example through a Node module hook, `module.register`) that applies the override before `deepFreeze`. The repo's `rules.ts` never changes.
6. **Invariants checked in every run** (Ch 15): no loss before week 36 (44 at Grace III); rings 0 to 2 never change owner; settling a random sample of past days again changes nothing; every purse event has a behavior, battle or land source; no Momentum gain above the target pace.
7. **The report**, `docs/game/sim/report.md` plus CSVs in `docs/game/sim/data/`:
   - **The income check under the book's conditions** (behavior income only, no tithes, spoils or reputation bonus on either side, the first 48 weeks; use the override map to switch them off), against the Ch 15 table: Steadfast 19,091 vs 16,754 (ratio 1.14); the plateau 17,939 (1.07); Committed 15,467 (0.92); Wavering 11,488 (0.69); week 4, 374 vs 292; week 40, 409 vs 386. Each within ±3%, or the report names the formula responsible.
   - **The Ch 15 targets table**, every row marked hit or miss with the measured value and an 80% interval: the median win week, win within 70 weeks, loss to Ascendancy; no profile losing before week 36; Steadfast Grand Battles a month (1 to 3); the share of Steadfast campaigns with a coalition (80%); skill value, smarter vs greedy finishing time (10% to 20%).
   - Also: how each rival was resolved, hexes held by month for the player and each rival, Border Campaign hexes per campaign (book: 2 to 6), first-month assault failure rate (the playtest target is under 15%), the income ratio by week, the purse spend breakdown, and how often each lever binds.
   - **Sensitivity sweeps** for every Ch 15 lever (benchmark `b` by phase, army cost, the Ascendancy ratio, host share, payout-curve start, Tier IV Dominion) plus A-17 and A-18, at −20%, −10%, +10% and +20%, showing the effect on Steadfast and Committed outcomes.
   - **A ranked list of proposed changes**, each saying what to change, from what to what, and which targets it moves by how much. These are suggestions for the owner (D-02).
8. **A smoke test**, `tests/game/sim.test.ts`: 2 runs × 8 weeks, deterministic, fast.

## Out of scope

Changing any value in `rules.ts` or any TUNE number: that is the owner's call. Engine performance work is fine if a run needs it, but it must leave every settled state byte-identical (compare a hash of `JSON.stringify(state)` for a few seeded campaigns before and after).

## Files

- Create: `sim/run.ts`, `sim/profiles.ts`, `sim/ledgerGen.ts`, `sim/policy.ts`, `sim/overrides.ts`, `sim/report.ts`, `docs/game/sim/report.md`, `docs/game/sim/data/*.csv`, `tests/game/sim.test.ts`.
- Edit: `package.json` (the `sim` script), `tsconfig.node.json` (include `sim/`).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] The full run (6 profiles × 2 policies × 300 campaigns × 70 weeks, plus the sweeps) finishes in under 60 minutes on the development PC; record the time in the report.
- [ ] Determinism: the same arguments twice give byte-identical CSVs (put the hashes in the hand-off notes).
- [ ] The income check reproduces each Ch 15 figure within ±3%, or the report names the formula responsible and leaves it unchanged.
- [ ] Every row of the Ch 15 targets table appears in the report as hit or miss, with its value and interval.
- [ ] The invariants ran in every campaign; the report states zero violations, or lists each with its seed so it can be reproduced as a failing test.
- [ ] The sweep tables cover every lever in the Ch 15 levers table.
- [ ] `git diff main -- src/renderer/src/lib/game/rules.ts` is empty (D-02).
- [ ] `sim/` imports nothing from React, the DOM or Electron (`grep -rE "react|electron" sim/` finds nothing).
- [ ] The report ends with the owner's decision list.

## Hand-off notes

*(The implementing agent adds notes here: the run time, the CSV hashes, and anything the owner must decide.)*
