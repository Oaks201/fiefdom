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

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] The full run (6 profiles × 2 policies × 300 campaigns × 70 weeks, plus the sweeps) finishes in under 60 minutes on the development PC; record the time in the report. (48 min 17 s in a 4-core cloud container; timing it on the development PC is the owner's step, `handover.md` §1.)
- [x] Determinism: the same arguments twice give byte-identical CSVs (put the hashes in the hand-off notes).
- [x] The income check reproduces each Ch 15 figure within ±3%, or the report names the formula responsible and leaves it unchanged.
- [x] Every row of the Ch 15 targets table appears in the report as hit or miss, with its value and interval.
- [x] The invariants ran in every campaign; the report states zero violations, or lists each with its seed so it can be reproduced as a failing test.
- [x] The sweep tables cover every lever in the Ch 15 levers table.
- [x] `git diff main -- src/renderer/src/lib/game/rules.ts` is empty (D-02).
- [x] `sim/` imports nothing from React, the DOM or Electron (`grep -rE "react|electron" sim/` finds nothing).
- [x] The report ends with the owner's decision list.

## Hand-off notes

### Evidence (2026-10-08)

- **The full run** (`npm run sim`: 6,260 campaigns) took **48 min 17 s** on 4 worker threads in a Linux cloud container (4 × Xeon @ 2.10 GHz, Node 22.22), with nothing else running; an earlier full run, sharing the machine with other work, took 83 min 47 s. Not timed on the development PC (`docs/game/handover.md` §1).
- **Invariants:** checked every simulated day in all 6,260 campaigns; **zero violations**. (The first full run reported 20, all from two checks that were wrong and are fixed with tests in T17: a Border Campaign on a hex a rival had taken from the player earlier the same day, and Momentum under a too-fast trend, where Ch 5 rule 6 holds only Mw at half.)
- **Determinism:** the two full runs gave byte-identical `targets.csv`, `income_by_week.csv`, `hexes_by_month.csv`, `spend.csv`, `resolutions.csv` and `sweeps.csv`; `runs.csv` was identical in every row and column but `violations`, the one thing the invariant fix changed. `--report-only` from the stored results rebuilds the same bytes, and `npm run sim -- --quick` run twice with the same arguments gave byte-identical CSVs (the reports differ only in the time line). The committed CSVs, sha256:

  | File | sha256 |
  | --- | --- |
  | `runs.csv` | `0c7ddb26e932782349cac3710ea4d67dd3c25cae1e18859869dbc08645ca0f55` |
  | `targets.csv` | `99b75e2a13f32622608b319a259f9f206a075e69dec1d6ffa9ce16cabecbb230` |
  | `income_by_week.csv` | `6db99a72ef2f319d4d8b6113b00fbe0b62c9486497c8d74ca70ac549876c4115` |
  | `hexes_by_month.csv` | `0f2032f0503d5876226b0ee319bcbbd01f53365b707ddc259aef528d7dc8fd1f` |
  | `spend.csv` | `fe14a09b5d473fe7cc75084b322c76f6c1260629d48161965a0e71722f99c938` |
  | `resolutions.csv` | `ffed36541ae5f2d3c696449bf2c618a8dbb9be7c12268b2fb57fdecffb16673d` |
  | `sweeps.csv` | `2bf2259965046417478cb4c02eeb5b2c2aacb7800af9f0f72fcf72efe11bbb03` |

- **`git diff origin/master -- src/renderer/src/lib/game/rules.ts`** is empty (D-02; the default branch is `master`); every lever was changed in memory only, by `sim/overrides.ts`, and each worker checks its loaded `RULES` carries the variant before it runs a campaign.
- **`grep -rE "react|electron" sim/`** finds nothing.
- **Tests:** `tests/game/sim.test.ts` (2 campaigns × 8 weeks, the rules hook in a worker, the report built twice byte for byte) runs in about 3 s.

### What was built

- `sim/run.ts` (`npm run sim`; `--quick`, `--report-only`, and `--runs`, `--push-runs`, `--income-runs`, `--sweep-runs`, `--workers` to scale it), `sim/worker.ts` and `sim/worker.cjs`, `sim/overrides.ts`, `sim/report.ts`; `sim/campaign.ts`, `sim/policy.ts`, `sim/ledgerGen.ts` and `sim/profiles.ts` were begun before this task and finished here. The report is `docs/game/sim/report.md`; its CSVs are in `docs/game/sim/data/`.
- **The run:** 300 campaigns per profile for greedy and smarter (3,600), 50 per profile for a third policy, push (300), 50 per profile for the income check under the book's conditions (200, 48 weeks), and every Ch 15 lever plus A-17 and A-18 at −20, −10, +10 and +20%, 30 campaigns each for Steadfast and Committed (2,160): 6,260 campaigns. Seeds 1 to N in every group, so sweeps compare paired seeds. A campaign stops at its victory or Fall.
- **Rules overrides:** tsx loads this repo's TypeScript as CommonJS, so the hook wraps `Module.prototype._compile` (where `require` hands over each file) instead of an ESM `module.register` loader, which `require` never consults; it rewrites `deepFreeze(RULES_TABLE)` in memory and fails loudly if that line ever changes.
- **The player AI was wrong in three ways when this task began, and is fixed:** the greedy player sent its two strongest companies, which no garrison type let win, so it never assaulted (it now sends the companies the engine's own fielding picks for that garrison); it only challenged a Gate or capital at the Weaker or Matched band, so the fourth rival was never resolved (it now challenges at any band short of Overwhelming: a host is 60% of AV, so even a Stronger rival sends one the player's best can meet); and it retried a resolved rival's capital forever. The smarter player never sealed an Accord, because the greedy contract routine kept the slot full (it now lets the slot empty, D-01).
- **The push policy** (not in the book): greedy plus Ch 6's repeated push, assaulting a hex the week's repulses can wear down. Added because without it a Committed player sits on its founding land for months, and with it every profile wins.
- **The invariants** are the shared `lib/game/dev/invariants.ts` (T17), checked every simulated day.

### What the owner should know

- **Steadfast is close; the rest of the curve isn't.** Greedy: Perfect wins in week 48 (target 36 to 40), Steadfast in 51 (44 to 48) with 98% won and none lost; Committed wins only 41% within 70 weeks (target 60 to 75%) and never loses (target 20 to 35%); Wavering and Casual hit their targets.
- **The land deadlock decides the middle of the curve.** Every Tier II needs 8 Dominion in its own direction, and the ring-2 dens around the founding land need an Assault the starting companies rarely reach. A greedy Committed player holds its founding land until month 9 (Steadfast: month 3), its purse filling with nothing to buy.
- **The repeated push breaks the curve the other way.** Assaulting the same den again and again (Ch 6's 25% wear) takes it within days: with it Committed wins 96%, Wavering 88% and Casual 94%, and nobody falls. Whether a player discovers it decides more than any lever in the sweeps.
- **The income check misses by 9 to 18%** for every profile, and the report names the formula: the contract payout's `L`. The book's estimate takes the benchmark's contract schedule (7-day contracts from week 3, 30-day from week 21); a Steadfast player's first 30-day contract comes in week 38, a Committed player's in week 44, because the longer contracts need tiers and castle tiers that need land. Steadfast's Momentum is also 692 below the book's full Momentum, from its weight noise and plateaus.
- **Skill is worth 4% (Steadfast) and −2% (Committed)** for the smarter policy, against a target of 10 to 20%: Truces, Accords and buy-outs barely move finishing time. The push is worth 16% and 30%.
- **The sweeps are noisy** (30 campaigns a cell, about ±9 points on a share). No single lever brings all three of Committed's measures into range: a few steps (army cost scale −20%, army cost per power +20%, `b` −20%) lift its win share to 60 to 63%, but its median win week stays at 64 to 67 and its losses near zero. The ranked proposals are those steps.
- **Also found:** Border Campaigns take 0 hexes a campaign (book 2 to 6; T10 saw the same); a Steadfast player's first trophy arrives in week 2 (A-156 asked); 2% of resolved rivals defect under A-143's literal reading, which T13 kept (`decisions.md`).
- **The owner's decisions** are listed at the end of the report and in `docs/game/handover.md`.

