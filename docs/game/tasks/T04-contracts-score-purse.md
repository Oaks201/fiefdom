# T04 — Contracts, consistency scores and the purse

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 2 Core rules | T01 | T06, T07, T09, T10, T17 | No |

## Goal

Turn kept days into reputation: the three-pillar consistency score, Valor, Realm Consistency, contracts of 1 to 30 days on a smooth payout curve, optional pledges, Respite, the daily and weekly reputation sources, and a purse that is an explicit, never-negative event ledger.

## Read first

- Book: Ch 4 (all of it), Ch 5 "Where reputation comes from", "Where reputation goes", "The purse" and "Realm Consistency", Ch 2 rules 4 and 5 (grace and late data), Ch 16 (crash-dieting and overtraining rows).
- Decisions: D-01, A-02, A-04, A-07, A-11, A-31, A-39, A-40, A-41, E-01, E-05.
- Code: `src/renderer/src/lib/contracts.ts` and `src/renderer/src/lib/reputation.ts`. These are legacy; keep them as they are and write the new logic beside them.

## Scope

1. **`lib/game/score.ts`.**
   - Weekly pillars for a set of days: `S_w` (steps since the week began ÷ the pool's share for those days, capped at 1), `T_w` (days with food logged ÷ days × the budget score, where the budget score is 1 at or under the limit and falls linearly to 0 at 15% over; under-floor days per A-41), and `D_w` (duties kept ÷ duties sworn).
   - `q_w`, and `Q` for any span, with weeks weighted by their days in the span. Respite days are removed from every pillar.
   - `valor(day)` = (d + f + s) ÷ 3, with s per A-40.
   - `realmConsistency(days)` per A-39.
   - Inputs are plain day records `{ date, steps?, eaten?, dutiesKept, dutiesSworn }` plus the Charter and the Healer floor. The module does not read the ledger itself; T06 adapts ledger days into these records.
2. **`lib/game/contracts.ts`.**
   - Available lengths by unlock: 1 and 3 days from the start; 7 days once any building is at Tier II; 14 at Castle II; 30 at Castle III.
   - `seal` copies the Charter, checks the pledge cap (10 × days, ×1.5 at Merchant Hall III, never more than the purse), starts at the next dawn, and queues at most one contract.
   - `f(Q)`, `payout = 10 × days × L × f(Q)`, `pledgeReturn = pledge × 2 × f(Q)` (at least half at Merchant Hall IV).
   - `withdraw` pays `10 × daysElapsed × 1.0 × f(Q)` and returns half the pledge.
   - Respite: earn 1 per 7 days played; the bank cap comes from effects; spend only on today or yesterday; spending one moves the contract's end a day later.
   - Late data only helps: a recomputed payout above the paid one posts an `adjust` for the difference; a lower one posts nothing.
   - The `accord` kind is sealed and paid exactly like a 30-day contract (D-01). It exposes a hook so T13 can add the Respect gain.
   - Charter validation: pool 10,000 to 200,000; limit from the Healer floor to 10,000 (the floor is an input, and a medical-supervision override flag is allowed); 1 to 5 duties.
   - Steward's Counsel: `stewardSuggestion(weeklyScores)` returns gentler terms after 4 weeks averaging below 75% and firmer ones after 4 weeks above 95%, as a suggestion object with a text id. It never changes the Charter.
3. **`lib/game/economy.ts`**, behavior income only.
   - Daily: duties 12 × share kept; perfect day +5 (every duty kept and food logged); streak +1 per perfect day in a row before it, up to +7.
   - Weekly: steps 70 × share, capped at 70; calories 70 × `T_w`; flawless week +50 (all three pillars at 100%); Momentum 60 × M, where M is an input from T05.
   - Tithes 4 × ring per village held. A Settling village pays half; a scorched village pays nothing that week. Multipliers are inputs from effects.
   - The Merchant Hall bonus (a rate supplied by effects) applies to every gain above.
   - All weekly amounts prorate in a partial week 1 (A-04).
4. **The purse.** Event kinds `earn | pledge | return | spend | spoils | tribute | tithe | adjust`, each rounded to 0.1 at posting (A-11). `balance = Σ events`. The founding grant is 100. `spend` refuses when the purse is short. Tribute takes at most the balance. Every event carries a `source` that says which behavior, battle or land produced it (Ch 15 invariant 4).

## Out of scope

Momentum and the floor calculation (T05), settlement scheduling (T06), screens (T17).

## Files

- Create: `src/renderer/src/lib/game/score.ts`, `contracts.ts`, `economy.ts`, `tests/game/score.test.ts`, `tests/game/contracts.test.ts`, `tests/game/economy.test.ts`.
- Edit: `types.ts`, `rules.ts` (append only).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 1 (E-01): the Ch 4 worked example (pool 50,000, 46,000 walked; food logged 6 of 7 days, averaging 1,950 against a 2,000 limit; 19 of 21 duties) gives Q = 0.893968 ± 1e-6 and f = 0.823280 ± 1e-6. The payout posts as **80.7** (exact 80.68). A 70 pledge returns **115.3** (exact 115.26).
- [ ] f(Q) at 0.40, 0.55, 0.70, 0.80, 0.90 and 1.00 equals 0, 0.25, 0.5, 0.667, 0.833 and 1 (±0.001). Q = 0.3 gives 0, and inputs above 1 clamp to 1.
- [ ] Full payouts by length: 10, 34.5 (E-05), 98, 238 and 600. Sealing a 7-day contract before any building reaches Tier II is refused, as are 14 days before Castle II and 30 days before Castle III.
- [ ] Withdrawal on day 4 of a 7-day contract at Q = 0.9 pays 33.3 and returns half the pledge.
- [ ] Respite: spending it on yesterday removes that day from every pillar and moves the end date by +1. Spending it on the day before yesterday is refused. The bank never exceeds its cap.
- [ ] Daily: 3 of 4 duties earns 9. A perfect day after 3 perfect days in a row earns 12 + 5 + 3 = 20. The streak bonus never exceeds +7.
- [ ] Weekly: 55,000 walked against a 50,000 pool earns 70. `T_w` = 6/7 earns 60.0. The flawless +50 appears only when all three pillars are 1.0. A partial 4-day week 1 prorates the pool to 28,571.
- [ ] A day logged at 0.85 × the floor scores as fully over budget (A-41).
- [ ] The Merchant Hall Tier I bonus turns a 70 gain into 71.4.
- [ ] Purse: a 50 tribute on a 30 balance takes 30 and leaves 0. A pledge above the balance is refused. The balance always equals the sum of events. A late correction that lowers Q posts nothing; one that raises it posts an `adjust` for the difference.

## Hand-off notes

*(The implementing agent adds notes here.)*
