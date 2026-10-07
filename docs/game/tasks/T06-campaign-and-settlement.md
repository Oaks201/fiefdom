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

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Founding at 2026-10-07 15:00 (America/Chicago, weeks starting Monday): the first campaign day is 2026-10-08; week 1 is Oct 8 to Oct 11 and closes at 2026-10-12 04:00; the purse holds 100; `ruleVersion` is '2.0.0'; the Border Campaign weeks fall within ±1 of 10, 18, 26, 34 and so on.
- [x] Founding is refused while a legacy contract is open, and refused with a calorie limit below the floor.
- [x] Test 9 (core): `settle` twice with the same `now` gives a deep-equal state and zero new events.
- [x] Settling 30 days one call per day gives the same final state as one catch-up call over the same 30 days (same ledger).
- [x] A 10-day absence settles 10 days and the week closes in calendar order. The Homecoming summary lists all 10 days.
- [x] Correction inside the grace window: raising yesterday's steps posts `adjust` events and raises the projected contract score. Lowering yesterday's duties after a contract has paid posts nothing that reduces the payout. Editing a day 3 days back changes nothing.
- [x] A ledger with no data at all (no steps, no food, no duties kept) settles without throwing, and pays no daily or weekly reputation except what the rules allow (Momentum's plateau floor needs consistency, so it is 0 here).
- [x] Manual, using dev time travel (or a test harness if T16 isn't merged yet): found a campaign, advance 8 days, and see one week close in `campaign.json` events.

## Hand-off notes

### Evidence

`npm run typecheck` is clean. `npm test` passes all 296 tests, 27 of them new: 11 in `tests/game/campaign.test.ts` and 16 in `tests/game/settle.test.ts`. `npm run check:game` prints `check:game OK: 16 game files, codex valid, 273 text slots.` `npm run build` succeeds, and neither `FIEFDOM_DEV_NOW` nor `fiefdomDev` appears in `out/renderer`.

These tests cover the verification lines:

- **Founding at 2026-10-07 15:00 Chicago:** "Founding at 2026-10-07 15:00 Chicago: first day Oct 8, week 1 is Oct 8 to Oct 11 and closes 2026-10-12 04:00 (A-04)". It also settles at 08:59:59Z (3 days, no week close) and at 09:00Z (4 days, week 1 closed).
  - "Founding: the purse holds the founding grant of 100 and ruleVersion is 2.0.0".
  - "Founding: the hidden Border Campaign weeks fall within ±1 of 10, 18, 26, 34 and so on (Ch 12)". It checks 50 seeds, checks that all three shifts occur, and checks that extending the schedule matches fixing it all at once.
- **Refusals:**
  - "A-07: founding is refused while a legacy contract is open, upcoming or awaiting its weigh-in".
  - "Ch 4: founding is refused with a calorie limit below the Healer floor". It covers the minimum floor of 1,200, Fitbit burned (floor 1,600), Mifflin–St Jeor (floor 1,700) and medical supervision.
- **Test 9 (core):** "Test 9 (core): settle twice with the same now gives a deep-equal state and zero new events". It runs at four different `now`s, with `launch: true`. A second call returns the same object.
- **30 days:** "Test 9: 30 days settled one call per day equal one catch-up call over the same 30 days". Two contracts (one with a pledge) run, and the month crosses the end of daylight time.
- **10-day absence:** "A 10-day absence settles 10 days in order, closes the week between them, and the Homecoming lists all 10 (A-45)". It checks that the log and purse are in date order and that the weekly income sits between Sunday's and Monday's daily income. It also checks `awayDays` and the Homecoming at 14 days away.
- **Corrections:**
  - "A-02: raising yesterday's steps inside the grace window posts adjust events and raises the projected contract score". It posts `correction:weekly:2026-10-11` and a `correction` event, and is settled once.
  - "A-02 / Ch 2 rule 5: lowering yesterday's duties after a contract has paid posts nothing that reduces the payout". The purse and contracts are deep-equal before and after. The reverse case posts a positive `adjust` for `contract:c1`.
  - "A-02: editing a day 3 days back changes nothing, and neither does editing yesterday once its window has passed".
- **Empty ledger:** "A ledger with no data settles without throwing and pays nothing beyond the founding grant (Momentum's floor needs consistency)". After 4 weeks the purse holds only the founding grant, and every week's Momentum and income are 0.
- **Manual check:** "Manual harness: found a campaign, advance 8 days, and see one week close in campaign.json events". T16 isn't merged, so this test stands in for dev time travel. It saves through the real `CampaignFile` into a temp folder, then launches, settles, saves and reloads on each of 8 mornings. It reads `campaign.json` back from disk. The one week close it prints is `{"id":"ev-1","day":"2026-10-11","kind":"weekClosed","week":1,"income":145.4}`.
- **Also covered:**
  - the phase registry order;
  - 4/7 proration in week 1 (40.8, 40.8 and 29.1 with Merchant Hall I);
  - daily duties, perfect day and streak;
  - contract scoring, payment and the queued contract;
  - timer expiry and garrison reset;
  - weight records and Momentum at week close;
  - settlement never mutating the ledger;
  - a campaign that has ended;
  - a JSON round trip of the whole state.

### What later tasks get

**Founding (`lib/game/campaign.ts`).** `foundCampaign(input: FoundingInput, now: Date): CampaignState` throws a `CampaignError` whose message is ready to show.
- `FoundingInput` holds:
  - `startWeight`, `goalWeight` and `charter`;
  - `timeZone`, the system zone (A-03);
  - `ledger`, used for A-07 and to bootstrap the Healer;
  - optional `unit`, `targetPace`, `heightCm`, `sex`, `birthYear`, `weekStartsOn`, `seed` and `medicalSupervision`.
- The founding wizard (T16) passes the ledger as it stands.
- T10 replaces `foundingRivals()` with `initRivals`. It is called once in `foundCampaign`.
- `foundingFronts()`, `foundingRoster()` and `borderCampaignWeeks(seed, startDate, throughWeek)` are exported too.

**Settling (`lib/game/settle.ts`).** `settle(state, ledger, now, { launch? }) → { state, events, summary }`.
- `summary` is a `SettleSummary` with these fields:
  - `days`: each settled day with its events and purse change;
  - `weeksClosed`;
  - `held` and `lost`, filled from T08's `defense` and `hexTransfer` events;
  - `purseChange`;
  - `awayDays`;
  - `homecoming`, true at 3 or more days or 14 or more days away.
- Pass `launch: true` only on the launch call. It records `settlement.lastLaunch`.

**Registering a phase.** The registry is `DAY_PHASES` and `WEEK_PHASES`. Their order is fixed by `DAY_PHASE_NAMES` and `WEEK_PHASE_NAMES`. To fill a phase, replace its `noop` entry with your own:

```ts
export type Phase = (state: CampaignState, ctx: PhaseContext) => CampaignState
// ctx: { day, week, weekClose, weekStartsOn, ledger, emit(kind, payload), hooks: { accordsPaid } }
// in settle.ts:  combat: combatPhase, // T08
```

Phase rules:
- Phases are pure. Return a new state.
- Post log events with `ctx.emit('defense', {...})`. They reach `state.log` (ids `ev-N`, dated `ctx.day`) when the phase returns.
- Post purse events with `economy.ts` (`post`, `postAll`, `tribute`) on `ctx.day`.
- Draw randomness with `rng.ts` on `ctx.day`, with a label unique to the purpose.
- The empty slots are:
  - T08: `combat`, plus next week's threats in `resetAndSchedule`, which already resets garrison damage;
  - T12: `grandBattlesAuto`;
  - T09: `courtships`;
  - T10: `rivalTurn`, `fronts` and `borderCampaigns`. Read `state.settlement.borderCampaignWeeks` against `ctx.week`, and never show it.
  - T13: `world`. Accords paid in this call are in `ctx.hooks.accordsPaid` (`{ contractId, rival, curve }`). Use `accordRespectGain` from T04.
- Settling once is automatic for day and week phases. `settledThrough` advances only after a day's phases run, and corrections never rerun a phase. Only `correctLastDay` touches a settled day, and it never calls a phase.

**State (`types.ts`):**
- `CampaignState.settlement` holds `snapshots: DaySnapshot[]`, `borderCampaignWeeks` and `lastLaunch`.
- A `DaySnapshot` holds a day's steps, eaten, duties kept and sworn, `weightLb`, burned, `streak` and `paid`.
- Every score and weight rule reads the snapshots. Use `toDayRecord`, `toHealerDay` and `weighInsOf` in `lib/game/ledgerDays.ts`. Only `snapshotInputs` and the correction read the ledger.
- `Campaign.weekStartsOn` is fixed at founding.
- `CompanySource` gained `'host'` for rival companies.
- `GameEventMap` gained `weekClosed: { week, income }` and `correction: { correctedDay, adjustment }`.

**Helpers in `settle.ts`:**
- `charterOn(state, day)`, `contractScore(state, contract, through, weekStartsOn)` and `snapshotOf(state, day)`.
- `isCorrectable(day, now, tz)` and `weekStartsOnOf(state, ledger)`.
- `reputationBonus(state)`: the Merchant Hall tier plus the Statue. T07 should point it at `realmEffects` once that exists. The Respite cap helper (Mage Tower tier plus the Healing Springs) works the same way.

**The app (`state/`):**
- `useCampaign` gained `found(state)`, `settleNow(ledger, now, { launch })`, `homecoming` (a `SettleSummary` or null, for T16's screen) and `dismissHomecoming()`.
- `state/campaignClock.ts`:
  - `startCampaignClock()` is started in `App.tsx` once the ledger and campaign file are loaded. It settles at launch, after the first Fitbit sync attempt or 10 s, then on each 04:00 rollover in the campaign zone. It checks every 15 s, and on focus.
  - `campaignNow()` honors `FIEFDOM_DEV_NOW` in dev builds only (added to the renderer's `envPrefix`).
  - `devAdvanceDays(n)` is for T16's dev menu. It is also on `window.fiefdomDev` in dev builds.

### Choices made here

- A-121: the grace window as settlement checks it.
- A-122: Charter duties match ledger habits by id, then by name.
- A-123: a timer's date is the last day it holds.
- A-124: which terms judge weekly income, Realm Consistency and contracts.
- A-125: the founding Healer floor and the 28-day prelude snapshot.
- A-02 says inputs are copied "into the campaign event log". They are kept as `settlement.snapshots` instead, beside the log, so scoring can read them without scanning events.
- Corrections post `adjust` events with sources `correction:daily:<day>`, `correction:weekly:<day>` and `contract:<id>`, plus one `correction` log event. Weight records (Milestones, Grace) are never re-run by a correction.
- `RULES.settlement` was appended: `borderScheduleAheadWeeks` (104) and `preludeDays` (28).
