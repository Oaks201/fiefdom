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

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 2: logged average 2,050 and trend 1.0 lb/week → TDEE 2,550, range 1,550 to 2,050, floor 1,550.
- [ ] Bootstrap: with 10 logged days and a Fitbit `burned` average of 2,600, the floor is 1,600. Without Fitbit, for a male, age 40, 180 cm, 98.43 kg: BMR 1,914.3 → TDEE 2,680 → floor 1,700. With nothing at all, the floor is 1,200.
- [ ] Smoothing: a floor at 1,550 whose fresh computation says 1,800 moves to 1,650 after one week.
- [ ] Test 6: target pace 0.80 at 217 lb, 0.72 at 180 and 0.68 at 170. With the cap set to 0.5 it is 0.5 at 217.
- [ ] The Ch 5 Momentum table reproduces exactly: 60, 60, 30, 36, 36.
- [ ] Too fast: a 28-day trend of 2.5 lb a week at 217 lb (more than 1% = 2.17) holds `Mw` at 0.5, raises the check-in, and pauses Milestone breaks.
- [ ] Test 8 (E-04): 217 → 168 gives marks 212, 207, 202, 197, 193, 188, 183, 178, 173, 168 and earliest weeks 4, 7, 10, 13, 16, 19, 22, 25, 28, 31.
- [ ] Small goal 217 → 195: 3 lb steps, with marks 214 down to 196 and the rest as Keeping Milestones. Large goal 300 → 150: 10 lb steps, marks 290 down to 200.
- [ ] Locks: reaching 212 in week 2 waits until week 4 to break. A broken Milestone stays broken after a 6 lb regain.
- [ ] Dispensation: 8 weeks at RC 0.86 with the earliest week passed breaks the next Milestone. It cannot happen again within 8 weeks.
- [ ] Grace: with 4 or more weeks of history and Steadiness at 0.9, the level rises 0 → I → II → III over three week closes. It never drops more than one level a week. With under 4 weeks of history it stays 0.
- [ ] A goal of 125 lb with a height of 180 cm (BMI 17.5) is refused. A second goal change within 28 days is refused.
- [ ] Ch 15 invariant 5: any week with `q_w` ≥ 0.85 earns M ≥ 0.6, whatever the scale says (property test over random weigh-ins).
- [ ] Ch 15 invariant 1: M never increases when r rises above T (property test).

## Hand-off notes

*(The implementing agent adds notes here.)*
