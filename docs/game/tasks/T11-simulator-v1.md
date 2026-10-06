# T11 — Simulator v1: economy and land (report only)

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 4 Big systems | T10 (and T06 to T09) | T15 | Yes (balance numbers) |

## Goal

Run hundreds of seeded campaigns headless through the **real** game modules, and report how the economy and the land war behave against the book's estimates. This is the book's build-order step 6, but per D-02 it **only reports**: it must not change `rules.ts`, and later tasks don't wait on its targets.

## Read first

- Book: Ch 15 (all of it), Appendix A "Suggested build order" step 6.
- Decisions: **D-02**, A-04.

## Behavior profiles

From version 1 (Ch 11 there), extended by v2 Ch 15 with a weight trend:

| Profile | Duties kept | Typical week vs step pool | Days with food logged | Rough weeks | 4-week score | Weight trend |
| --- | --- | --- | --- | --- | --- | --- |
| Perfect | 100% | 120% | 100% | None | 100% | 0.8 lb/wk |
| Steadfast | 93% | 104% | 96% | 1 in 12 | 89% | 0.8 lb/wk |
| Committed | 85% | 97% | 90% | 1 in 9 | 79% | 0.6 lb/wk |
| Wavering | 72% | 87% | 80% | 1 in 7 | 65% | 0.4 lb/wk |
| Casual | 55% | 72% | 65% | 1 in 6 | 48% | 0.2 lb/wk |

- A rough week means adherence drops by more than half for 7 days. Respite days are spent on rough days while the bank lasts.
- Weight gets ±1.5 lb of weekly noise and one 3-week plateau every 12 weeks. Use Rich's journey (217 → 168 lb) and a Charter of a 50,000 step pool, a 2,000 kcal limit and 3 duties.

## Scope

1. **`sim/` at the repo root**, run by a new npm script `sim` (`tsx sim/run.ts`). It imports `lib/game` modules and drives them through `foundCampaign` and `settle` with a synthetic ledger. It must not reimplement any rule; if the sim needs a number, it reads `RULES`.
2. **Synthetic ledger generator**: per-day steps, food logged and kcal, duties kept, and weekly weigh-ins from the profile and a seed.
3. **The player AI** (Ch 15, step 2). The greedy policy, each week:
   - buy the cheapest tier that unlocks a new company or Crossing;
   - court any village where Offer ≥ Resistance is affordable;
   - assault the adjacent hex with the best Dominion per garrison point that the assault pool can beat;
   - seal contracts in a fixed preference: the longest unlocked length.

   A second, smarter policy adds Truces when a rival's raids are winning and fortifies contested hexes. Grand Battles don't exist yet: count their triggers and resolve them as "not fought" (no outcome).
4. **Runs:** 300 seeded campaigns per profile per policy, a 70-week horizon, run in parallel worker threads where available.
5. **Reports**, written to `docs/game/sim/report-v1.md` plus CSVs in `docs/game/sim/data/`:
   - **Income check under the book's conditions** (behavior income only: no tithes, spoils or Merchant Hall bonus on either side, first 48 weeks), compared with the Ch 15 table: Steadfast 19,091 vs 16,754 (ratio 1.14); Steadfast on a plateau 17,939 (1.07); Committed 15,467 (0.92); Wavering 11,488 (0.69). Also week 4 (374 vs 292) and week 40 (409 vs 386).
   - Full income including tithes, spoils and bonuses, by week, for the player against each rival.
   - Hexes held by month (player and each rival); first-month assault failure rate (the playtest target is under 15%); first-month defense win rate; Grand Battle triggers per month; purse spend breakdown; how often each Ch 15 lever value binds.
   - A **targets table**: every Ch 15 target marked hit, miss or not measurable yet (victory and defeat need T12 and T13).
   - **Proposed lever changes**, if any, each with its expected effect. These are suggestions for the owner (D-02).

## Out of scope

Changing any rule or number. Grand Battles, coalitions and endgame (T15 extends the sim).

## Files

- Create: `sim/run.ts`, `sim/profiles.ts`, `sim/ledgerGen.ts`, `sim/policy.ts`, `sim/report.ts`, `docs/game/sim/report-v1.md`, `docs/game/sim/data/*.csv`, `tests/game/sim.test.ts` (a smoke test with 2 runs × 8 weeks).
- Edit: `package.json` (the `sim` script).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] `npm run sim -- --runs 300 --weeks 70` finishes in under 15 minutes on the development PC (record the time in the report).
- [ ] Determinism: running the same arguments twice produces byte-identical CSVs (compare hashes in the hand-off notes).
- [ ] The income check reproduces each Ch 15 figure within ±3%. If one does not, the report names the formula responsible. It does not change it.
- [ ] `git diff main -- src/renderer/src/lib/game/rules.ts` is empty on this branch (D-02).
- [ ] The sim imports nothing from React, the DOM or Electron (`grep -r "react\|electron" sim/` finds nothing).
- [ ] The report ends with a short decision list for the owner: each proposed change, why, and which target it moves.

## Hand-off notes

*(The implementing agent adds notes here.)*
