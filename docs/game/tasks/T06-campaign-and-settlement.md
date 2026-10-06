# T06 — Campaign founding and the settlement engine

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 2 Core rules | T02, T03, T04, T05 | T08, T09, T10, T16 and every later system | No |

## Goal

Found a campaign, then advance it honestly: at every 04:00 close (or at launch, for every day missed) read the closed day from the ledger, settle it in a fixed order, post every result as an event, and save once. Settling the same period twice must change nothing. Later tasks plug their systems into the phase slots this task defines.

## Read first

- Book: Ch 2 (all of it), Ch 1 "Kept from the existing code", Appendix A "Settlement order" and the paragraph above "Core types" (no import step), Test 9.
- Decisions: A-01, A-02, A-04, A-07, A-09, A-10, A-45.

## Scope

1. **`lib/game/campaign.ts`: `foundCampaign(input, now)`.**
   - Input: start weight, goal weight, unit, target pace cap, optional height, sex and birth year, the Charter, the time zone, and an optional seed (otherwise derived from `hashSeed` of the founding instant).
   - It builds the map (T03), the purse with the founding grant (T04), the four buildings at Tier I, Castle I, a roster of the four Tier I companies, Milestones (T05), Grace 0, and rival states with the A-18 defaults (T10 replaces the rival init).
   - It also fixes the hidden Border Campaign week schedule (week 10, then every 8 weeks, each shifted −1 to +1 by a seeded draw), sets `settledThrough` to the day before the first dawn, and stamps `ruleVersion`.
   - It refuses while a legacy contract is open (A-07) and refuses a Charter below the Healer floor.
2. **`lib/game/settle.ts`: `settle(state, ledger, now) → { state, events }`.** Pure: no I/O.
   - It enumerates the closed, unsettled days (`clock.closedDaysSince`) and settles them in order, running week-close phases after each week's last day.
   - **The phase registry** is two ordered lists with these names, taken from Appendix A. T06 implements the phases marked ✔; the rest are registered no-ops that later tasks fill in, never reorder.
     - Day: `syncNote` (Fitbit sync happens before `settle` is called) · `snapshotInputs` ✔ · `contractsAndDaily` ✔ (score the active contract so far; duties, perfect day, streak) · `combat` (T08) · `grandBattlesAuto` (T12) · `expireTimers` ✔ (Weary, scorched, contested, Settling, Truces) · `contractEnd` ✔ (pay, then start the queued contract at the next dawn; the Accord hook goes to T13)
     - Week: `weeklyIncome` ✔ (step pool, calories, flawless, Momentum, tithes) · `courtships` (T09) · `weight` ✔ (trend, pace, Milestones, Steadiness, Grace, Healer floor) · `rivalTurn` (T10) · `fronts` (T10) · `borderCampaigns` (T10) · `world` (T13) · `resetAndSchedule` ✔ (reset garrison damage; next week's threat schedule is T08)
   - **Snapshots and corrections (A-02).** `snapshotInputs` stores the day's inputs (steps, eaten, duties kept and sworn, weight, burned) in state. While a day is inside the grace window, a later `settle` compares the ledger against the snapshot. Differences re-score contracts and weekly income and post `adjust` events (never lowering a paid payout). Combat, courtships, rival turns and events are never rerun. Outside the window, ledger edits are ignored.
   - **Idempotence:** `settledThrough` guards every phase. Calling `settle` again with the same `now` and ledger returns the state unchanged (deep-equal) and no new events.
   - **Catch-up and Homecoming:** missed days run with no orders. `settle` returns a summary (days settled, what held, what was lost, purse change) for the Homecoming screen (A-45). It also records the last launch date (A-10).
3. **Adapting the ledger.** Convert ledger days into T04's day records and T05's weigh-ins. The ledger stays the source of truth for health data, and nothing in the ledger is changed by the game.
4. **Running it in the app.** A small `state/campaignClock.ts` (or an extension of `state/clock.ts`):
   - At launch, after the first Fitbit sync attempt (or 10 seconds, whichever comes first), run `settle` and save once.
   - While the app is open, detect each 04:00 rollover in the campaign zone and run `settle`.
   - Honor the dev time-travel override (A-09) when `import.meta.env.DEV`.

## Out of scope

Combat, land, rivals and world logic (their phases stay no-ops here). The founding wizard screen is T16.

## Files

- Create: `src/renderer/src/lib/game/campaign.ts`, `settle.ts`, `src/renderer/src/state/campaignClock.ts`, `tests/game/campaign.test.ts`, `tests/game/settle.test.ts`, and `tests/game/fixtures/` (synthetic ledgers).
- Edit: `types.ts`, `src/renderer/src/state/campaign.ts`, `src/renderer/src/App.tsx` (start the campaign clock).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Founding at 2026-10-07 15:00 (America/Chicago, weeks starting Monday): the first campaign day is 2026-10-08; week 1 is Oct 8 to Oct 11 and closes at 2026-10-12 04:00; the purse holds 100; `ruleVersion` is '2.0.0'; the Border Campaign weeks fall within ±1 of 10, 18, 26, 34 and so on.
- [ ] Founding is refused while a legacy contract is open, and refused with a calorie limit below the floor.
- [ ] Test 9 (core): `settle` twice with the same `now` gives a deep-equal state and zero new events.
- [ ] Settling 30 days one call per day gives the same final state as one catch-up call over the same 30 days (same ledger).
- [ ] A 10-day absence settles 10 days and the week closes in calendar order. The Homecoming summary lists all 10 days.
- [ ] Correction inside the grace window: raising yesterday's steps posts `adjust` events and raises the projected contract score. Lowering yesterday's duties after a contract has paid posts nothing that reduces the payout. Editing a day 3 days back changes nothing.
- [ ] A ledger with no data at all (no steps, no food, no duties kept) settles without throwing, and pays no daily or weekly reputation except what the rules allow (Momentum's plateau floor needs consistency, so it is 0 here).
- [ ] Manual, using dev time travel (or a test harness if T16 isn't merged yet): found a campaign, advance 8 days, and see one week close in `campaign.json` events.

## Hand-off notes

*(The implementing agent adds notes here, including the exact signature each later task must use to register its phase.)*
