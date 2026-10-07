# T05 — Weight: Momentum, Milestones, the Crown's Grace, the Healer's range

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 2 Core rules | T01 (T02 for real weigh-in data; stubs are fine) | T06, T14, T17 | Light (Milestone unlock names) |

## Goal

Implement every way weight touches the game, all built so that losing faster never pays more: the 21-day trend, the easing target pace, weekly Momentum, the ten Milestones with their two locks, the Crown's Grace, and the Healer's calorie range that protects the Charter.

## Read first

- Book: Ch 4 "The Healer's calorie range", Ch 5 "Momentum", Ch 9 (all of it), Ch 16 (the rows on crash dieting, losing weight too fast, plateaus, weight regain and unsafe goals), Ch 15 "Invariants" 1 and 5.
- Decisions: A-05, A-06, A-39, A-42, A-43, A-44, E-04.

## Scope

All in `lib/game/weight.ts`. Rules compute in lb; convert kg input.

1. **The trend.** `trend(weighIns, endDay, windowDays)` is the least-squares slope in lb per week, with loss positive. It returns `null` unless there are at least two weigh-ins at least 6 days apart. Also `avg7(weighIns, day)`.
2. **The target pace.** `targetPace(avg7, cap)` = min(cap, 0.4% of `avg7`), where `cap` defaults to 0.8 and is settable from 0.3 to 1.0.
3. **Momentum**, following Ch 5 rules 1 to 7:
   - `Mw` = clamp(r ÷ T, 0, 1).
   - The plateau floor `Mf` is 0.6 when that week's `q_w` is at least 0.85, 0.3 when it is at least 0.75, otherwise 0.
   - `M` = max(Mw, Mf).
   - Too fast: when the 28-day trend is above 1% of body weight a week, `Mw` is held at 0.5, a Healer check-in fires, and Milestone breaks pause (A-43).
   - Maintenance goals: when the goal is within 2% of current weight, `Mw` = 1 while the 7-day average stays within 2% of the goal.
4. **Milestones.**
   - `buildMilestones(start, goal)`: step = (start − goal) ÷ 10, marks rounded to whole pounds, with the last mark equal to the goal. The step is never under 3 lb or over 10 lb.
   - Small goals (journey under 30 lb): 3 lb steps, and marks that would pass the goal become *Keeping* Milestones, which break after 4 straight weeks with the 7-day average within 2% of the goal.
   - Large goals (journey over 100 lb): 10 lb steps over the first 100 lb.
   - `earliestWeek` uses the *unrounded* lost amount (E-04).
   - Lock 1: two weigh-ins at least 6 days apart are both at or below the mark, or the 7-day average is.
   - Lock 2: the earliest week has arrived.
   - A broken Milestone is never revoked.
   - The Healer's Dispensation: after 8 straight weeks at RC ≥ 0.85, the next Milestone whose earliest week has passed may break on effort alone; at most one per 8 weeks; on by default.
   - Goal changes: at most once every 28 days; broken Milestones stay and the rest are recalculated; with a height given, a goal below BMI 18.5 is refused.
5. **The Crown's Grace.** Steadiness is the mean of M over the last 8 weeks. Grace needs at least 4 weeks of history and moves at most one level per week, up or down. Thresholds: 0.50 / 0.70 / 0.85. Export the level and a text id for its plain description; never export the benchmark numbers behind it.
6. **The Healer's calorie range.**
   - TDEE = the average logged kcal over the last 21 days (days with food logged) + trend × 3,500 ÷ 7. This needs at least 14 logged days and a known trend.
   - Bootstrap when that data is missing, in order: the 14-day average of Fitbit `burned` (A-06); then Mifflin–St Jeor × 1.4 when sex, birth year and height are known; then a floor of 1,200.
   - The range is TDEE − 1,000 to TDEE − 500. The floor is max(lower bound, 1,200), rounded to the nearest 50.
   - Smoothing per A-44: the first value is set directly, then it moves at most 100 kcal a week.
   - Also a flag for "the two-week logged average is under the floor" (a gentle check-in), and the input T04 needs for under-floor days.
7. **Healer check-ins.** `healerCheckIns(state)` returns check-in ids (too fast, under the floor, rough patch so suggest Respite, and so on), one per Ch 16 guardrail. Text comes from the catalog (`healer.*`).

## Out of scope

What each Milestone unlocks (T14), scheduling at week close (T06), screens (T17).

## Files

- Create: `src/renderer/src/lib/game/weight.ts`, `tests/game/weight.test.ts`.
- Edit: `types.ts`, `rules.ts` (append only).

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Test 2: logged average 2,050 and trend 1.0 lb/week → TDEE 2,550, range 1,550 to 2,050, floor 1,550.
- [x] Bootstrap: with 10 logged days and a Fitbit `burned` average of 2,600, the floor is 1,600. Without Fitbit, for a male, age 40, 180 cm, 98.43 kg: BMR 1,914.3 → TDEE 2,680 → floor 1,700. With nothing at all, the floor is 1,200.
- [x] Smoothing: a floor at 1,550 whose fresh computation says 1,800 moves to 1,650 after one week.
- [x] Test 6: target pace 0.80 at 217 lb, 0.72 at 180 and 0.68 at 170. With the cap set to 0.5 it is 0.5 at 217.
- [x] The Ch 5 Momentum table reproduces exactly: 60, 60, 30, 36, 36.
- [x] Too fast: a 28-day trend of 2.5 lb a week at 217 lb (more than 1% = 2.17) holds `Mw` at 0.5, raises the check-in, and pauses Milestone breaks.
- [x] Test 8 (E-04): 217 → 168 gives marks 212, 207, 202, 197, 193, 188, 183, 178, 173, 168 and earliest weeks 4, 7, 10, 13, 16, 19, 22, 25, 28, 31.
- [x] Small goal 217 → 195: 3 lb steps, with marks 214 down to 196 and the rest as Keeping Milestones. Large goal 300 → 150: 10 lb steps, marks 290 down to 200.
- [x] Locks: reaching 212 in week 2 waits until week 4 to break. A broken Milestone stays broken after a 6 lb regain.
- [x] Dispensation: 8 weeks at RC 0.86 with the earliest week passed breaks the next Milestone. It cannot happen again within 8 weeks.
- [x] Grace: with 4 or more weeks of history and Steadiness at 0.9, the level rises 0 → I → II → III over three week closes. It never drops more than one level a week. With under 4 weeks of history it stays 0.
- [x] A goal of 125 lb with a height of 180 cm (BMI 17.5) is refused. A second goal change within 28 days is refused.
- [x] Ch 15 invariant 5: any week with `q_w` ≥ 0.85 earns M ≥ 0.6, whatever the scale says (property test over random weigh-ins).
- [x] Ch 15 invariant 1: M never increases when r rises above T (property test).

## Hand-off notes

### Evidence

`npm run typecheck` is clean. `npm test` passes all 269 tests, 34 of them new in `tests/game/weight.test.ts`. That run came after rebasing onto T03 and T04. `npm run check:game` prints `check:game OK: 13 game files, codex valid, 273 text slots.`

These tests in `tests/game/weight.test.ts` cover each verification line:

- **Test 2:** "Test 2: logged average 2,050 and trend 1.0 lb/week → TDEE 2,550, range 1,550 to 2,050, floor 1,550". It also gets the same floor from a trend computed from weigh-ins.
- **Bootstrap:** "Bootstrap: Fitbit burned, then Mifflin–St Jeor × 1.4, then 1,200" covers these cases:
  - Fitbit `burned`: floor 1,600.
  - Mifflin–St Jeor: BMR 1,914.3, TDEE 2,680.02, floor 1,700.
  - No data: 1,200.
  - 14 logged days with no trend still count as a bootstrap.
- **Floor rounding:** "The floor is never below 1,200 and rounds to the nearest 50".
- **Smoothing:** "Smoothing (A-44): a floor at 1,550 whose fresh computation says 1,800 moves to 1,650 after one week".
- **Test 6:** "Test 6: target pace 0.80 at 217 lb, 0.72 at 180, 0.68 at 170; 0.5 at 217 with the cap at 0.5". It also checks that the cap is clamped to 0.3–1.0.
- **Ch 5 table:** "Ch 5 Momentum table reproduces: 60, 60, 30, 36, 36". It also checks each row's Mw and Mf.
- **Too fast:** "Too fast: a 28-day trend of 2.5 lb a week at 217 lb holds Mw at 0.5, checks in, and pauses Milestones (A-43)".
  - The trend is computed from daily weigh-ins ending at 217.
  - The `tooFast` check-in fires.
  - A reached Milestone breaks only when the week isn't too fast.
- **Test 8:** "Test 8 (E-04): 217 → 168 gives marks 212 … 168 and earliest weeks 4 … 31".
- **Small and large goals:** "Ch 9 rule 2: small goal 217 → 195 …" (Keeping 8 to 10) and "Ch 9 rule 3: large goal 300 → 150 …". "Ch 9: a goal that lands on a whole number of steps …" checks that 200 → 150 gives earliest week 10 exactly, with no floating-point creep.
- **Locks:**
  - "Locks: reaching 212 in week 2 waits until week 4; a broken Milestone stays broken after a 6 lb regain".
  - "Lock 1: two weigh-ins at least 6 days apart … or the 7-day average", which includes A-115.
- **Keeping Milestones:** "Ch 9 rule 2: a Keeping Milestone breaks after 4 straight weeks …".
- **Dispensation:** "Dispensation: 8 weeks at RC 0.86 with the earliest week passed breaks the next Milestone, at most once per 8 weeks".
  - It breaks Milestone 1 at week 8 and Milestone 2 at week 16, never in between.
  - Nothing breaks when the Dispensation is off or with one week at 0.84.
- **Grace:**
  - "Grace: with Steadiness 0.9 it rises 0 → I → II → III over three week closes, once 4 weeks exist".
  - "Grace never drops more than one level a week, and stays 0 with under 4 weeks of history".
- **Goals:**
  - "A goal of 125 lb with a height of 180 cm (BMI 17.5) is refused".
  - "A second goal change within 28 days is refused; broken Milestones stay and the rest are recalculated".
  - "Goals in kg are checked and planned in lb".
- **Invariant 5:** "Ch 15 invariant 5: any week with q_w ≥ 0.85 earns M ≥ 0.6, whatever the scale says". It runs 500 seeded random weigh-in series, goals and caps.
- **Invariant 1:** "Ch 15 invariant 1: M never increases when r rises above T". It runs 500 seeded cases on `momentumScore`, with the too-fast and maintenance flags drawn at random, and 200 more cases from ledger series.
- **Check-ins:** "Ch 16: each guardrail has its check-in, in the chapter's order", "Ch 16: regain and quiet weeks" and "Crash dieting: …". Every filled template is checked for a leftover `{placeholder}`.
- **The week close:** "closeWeightWeek records the week, breaks Milestones, moves Grace and the floor, and settles once".

### What later tasks get

All of this is in `lib/game/weight.ts`. Every weight is in lb with loss positive. Use `weighInsInLb(ledgerWeighIns, settings.unit)` first, and `toLb`/`lbTo` for single values.

- **T06 (founding and week close):**
  - `initialWeightState(startLb, goalLb)` gives the founding slice. Check the founding goal with `checkGoal(goal, unit, heightCm)` first.
  - At each week close, call `closeWeightWeek(campaign, weightState, { day, week, weighIns, days, qw, realmConsistency })` once.
    - `days` are `HealerDay`s (`{ date, eaten?, burned? }`, read straight from the ledger).
    - `qw` is that week's `pillarScore` (A-39). `realmConsistency` is T04's `realmConsistency`.
  - It returns:
    - the new `weight` slice;
    - the week's `momentum` (use `momentumReputation(momentum.m)` with T04's `weeklyIncome`);
    - the `broken` Milestones (post a `milestone` event for each);
    - `grace: { from, to }` (post a `grace` event when they differ);
    - the fresh `healer` range;
    - `checkIns` (post a `healer` event for each).
  - Closing a week that is already recorded changes nothing.
  - `weight.healerFloor` is the smoothed floor that T04's `termsOf(charter, floor)` and `validateCharter` should read.
- **T06/T17 (goal changes):** `changeGoal(state, goal, today)` returns the new `CampaignState` or throws a `CampaignError` whose message is ready to show. `nextGoalChange(goalChangedOn)` says when the goal may change again.
- **T14:** a Milestone's `index` maps to `RULES.milestones.unlocks`. `brokenOn`, `brokenWeek` and `byDispensation` are set when it breaks, and Keeping Milestones carry `keeping: true`.
- **T17 (screens):**
  - `graceTextId(level)` gives the plain description slot (`herald.grace.N`).
  - `healerText(note)` fills a check-in from the catalog.
  - `steadiness(weeks)` is exported for the simulator. Screens should show the Grace level, not this number.
  - `healerCheckIns(situation)` also maps the guardrails other systems detect to their check-ins: away days, a refused goal, a rough patch, a loss, orders set, fear of losing, paying or rushing, privacy. The caller passes the facts, and the function returns them in Ch 16 order.
- **`types.ts`:**
  - `WeightState` gained `weeks: WeightWeek[]` and `goalChangedOn`.
  - `MilestoneState` gained `brokenWeek` and `keeping`.
  - `Campaign` gained an optional `dispensation`, which is on unless it is `false`.
  - New types: `WeightWeek` and `HealerDay`.
- **`rules.ts`:** appended `units` (lb per kg, cm per m) and `healer.roughPatchDays` (TUNE, A-120).

### Choices made here

- A-115: Lock 1's 7-day average needs at least 2 weigh-ins. A reached mark is remembered.
- A-116: how Keeping Milestones are marked, timed and counted. The Dispensation does not apply to them.
- A-117: the Dispensation's streak, "passed" and cooldown.
- A-118: how a goal change replans the remaining Milestones. The founding goal is not a change.
- A-119: what "current weight" means, how maintenance is tested, and why the too-fast hold beats maintenance.
- A-120: a rough patch is 3 low-scoring days in a row (TUNE).
- The under-floor rule for scoring (A-41) already lives in T04's `score.ts` (`tableIntake`), so `weight.ts` only supplies the floor.
- Check-ins describe the week as it stands. If repeating the plateau or too-fast check-in every week reads as nagging, the Herald (T16) should show it only when it changes.
