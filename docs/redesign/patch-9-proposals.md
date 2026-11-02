# Patch 9 proposals: the scale worth stepping on (for Rich's approval)

Written 2026-10-31, on branch `patch-8` (from Patch 8, 258be21, rules 3.10.0).

**Status (2026-11-01):** Rich approved everything as recommended (D-68): W1 to W4, H1 to H4, B1 and B2, writing option 1 and the suggested order. B3 (Vigor) is left open for stage 3, on the simulator's report. Stage 1, the weigh-in moment and the Healer's terms, is built (D-69, rules 3.11.0; section 11), and Rich took its decisions T-11 to T-13 as recommended (D-70). On 2026-11-02 Rich named the Healer Remedy and had her terms bind, Respite days counted (D-72, section 12); stage 2a is built (D-73, rules 3.12.0), and her drafted lines wait for his approval.

Rich's direction (2026-10-31):
- Improve the weight-loss side of the game.
- For example, the Healer could give weekly updates, and suggest calories and step counts for the next contract from the weekly weigh-in trend.
- Find other fun ways to make weight loss more impactful in the game.

## 1. What is there today

### How weight touches the game

| System | What it reads | What it gives | When |
| --- | --- | --- | --- |
| Momentum (Ch 5) | The 21-day trend of the weekly weigh-ins against the target pace (0.8 lb a week, or 0.4% of weight when that is less). A floor of 30 or 60% while the week's habits hold | Up to 60 reputation | At the week close |
| Milestones (Ch 9, D-53) | A weekly weigh-in at or below each of 10 marks, once its earliest week has come | The unlocks (the Armory, Wings, Elites and the rest) and a painted card | At the close of the weigh-in day |
| The Crown's Grace (Ch 9) | The average Momentum of the last 8 week closes | Level I reclaims lost land, II halves tribute, III delays the Ascendancy to week 44 | At the week close, one level a week |
| The Healer's floor (Ch 4) | Logged food and the trend (else Fitbit's total burned, else Mifflin–St Jeor) | The lowest calorie limit the Charter may hold | At the week close, moving at most 100 kcal a week |
| The Healer's check-ins (Ch 16) | Crash dieting, too fast, a plateau, regain and 9 more | A card on the Chronicle | When one applies |
| The Dispensation (Ch 9) | 8 week closes in a row at Realm Consistency 0.85 or more | Breaks a stalled Milestone | At most once every 8 weeks |

Ch 9's promise stands over all of it: "None of the three ever pays more for losing faster, and none is needed to win."

### What is missing

1. **The weigh-in pays late.** Momentum for Monday's reading is paid at the next week close, almost a week later. D-53 fixed this for Milestones only.
2. **The Healer speaks only when something is wrong.** It has 13 check-ins, and none of them has a line yet: each still shows its plain-fact placeholder (`final: null`, `approved: false` in `healer.json`).
3. **Nothing suggests a number.** The Steward's Counsel says "gentler" or "firmer" after 4 weeks, with no figures. The floor is the only number the Healer gives.
4. **Back-to-back contracts lock the Charter.** The Charter can be revised only while no contract has begun (`charterLocked`). Since D-45, the next contract is sealed on the running one's last day, while the Charter is locked. So a player who never leaves a gap can't change their terms without leaving a day uncovered.
5. **Between Milestones the scale gives one row a week.** At target pace Rich's Milestones come about 6 weeks apart (weeks 7, 13, 19 and on). In between, the weigh-in is a number in the log and a line about Momentum.
6. **A plateau shows nothing moving.** Momentum's floor keeps paying quietly, and the Dispensation needs 8 weeks.
7. **The trend rests on three readings.** The game reads one weigh-in a week (D-11, D-13), so the 21-day trend behind Momentum and the floor uses three points. With the simulator's weekly noise (up to 1.5 lb either way), a three-reading trend is typically off by about 0.6 lb a week, which is about ±300 kcal a day in the floor's estimate. Five readings bring that to about 0.3 lb (±140 kcal).

## 2. The weigh-in moment

### W1. The weigh-in pays the morning after (rule change)
- **What changes:** the weight week (Momentum, its record, the Grace, the floor, Keeping Milestones, the Dispensation and the check-ins) settles at the close of the day the week's reading comes in, not at the week close. So Monday's weigh-in pays at 04:00 on Tuesday, as its Milestones already do (D-53).
- **What it reads:** the trend ending that day, so the fresh reading counts at once, and the habits score (`q_w`) of the calendar week that has just closed.
- **A week with no reading** settles at its week close, as today.
- **Why:** rewards land while the weigh-in is fresh (D-53). Momentum is the weigh-in's weekly payment, so it should arrive with the reading.

### W2. The weigh-in card (screens)
On the weigh-in day, the moment the weight is typed, a card shows:
- **The reading:** the change since last week, the trend in lb a week, and the target pace.
- **A chart:**
  - the last 12 weekly readings;
  - the trend line;
  - looking ahead, a band from the current weight between the target pace and the too-fast line (1% of weight a week), with the Milestone marks and the goal as lines across. The band shows where Momentum pays in full and where going faster earns nothing.
- **What the close will do,** as things stand: Momentum's payment (W1), the waystones lit (W3), Faithful at the Scale (W4), and a Milestone breaking. These figures are final at the close, as D-45's progress has it.
- **The next Milestone:** its mark, the weight to go, its earliest week and the week it would come at target pace.
- **The Healer's report and terms** (H1, H2).

Tuesday's Dawn tidings (D-47) carry the settled card. As the weigh-in log already does, it never shows Steadiness or what a coming Milestone unlocks.

### W3. Waystones (screens; no rule change)
- **What they are:** each whole pound between one Milestone mark and the next is a waystone (each whole kilogram in a kg campaign), drawn as pips under the next Milestone.
- **Lighting one:** a weekly weigh-in at or below it lights it, read as Lock 1 is read. It never goes out.
- At about a pound a week, most Mondays light one. Rich's journey from 217 to 168 lb has 39.
- **Recommended:** they pay nothing. The light is the reward, and pounds keep paying only through Milestones.
- **Option:** 5 reputation each, paused by a too-fast trend (A-43). That's about 200 over the whole journey.

### W4. Faithful at the Scale (rule change)
- **What it pays:** at the close of the day the week's reading is logged, 10 reputation, plus 2 for each week in a row before it with a reading, up to +10 (TUNE). So 10 for the first week and 20 from the sixth.
- **A bad week pays the same.** It pays the same on a week the weight went up.
- **The streak:** a week with no reading resets it. A week away (14 days or more) or a week of Respite days only holds it. A corrected reading never pays twice.
- **Why:** weighing in regularly is one of the habits most linked with losing weight and keeping it off, and the bad weeks are when people skip the scale. This pays for showing up, whatever the number. It sits beside the weekly lines (steps 70, calories 70, Momentum 60).

## 3. The Healer's counsel

### H1. The Healer's weekly report (words and screens)
At each weight week's close (W1), the Healer reports in plain facts:
- the reading, the trend and the target pace, in one line by situation: ahead of pace, on pace, behind, flat, up, too fast, near the goal, or not enough readings yet;
- the logged calorie average against the limit, and the days logged;
- the week's steps against the pool;
- the estimated maintenance and where it came from (logs, Fitbit, or the formula);
- the terms it suggests (H2);
- any check-in that applies.

The report lives on the weigh-in card (W2) and in the Healer's Audience (H4), and it adds no new rules. Ahead of pace, it says that going faster earns nothing more.

### H2. The Healer's terms (rule change)
The Healer suggests a calorie limit and a step pool for the next contract. The game never sets terms itself (Ch 4): **Use these terms** fills the Charter's form, and the player keeps or changes them.

**The calorie limit:**
- **Maintenance:** the logged average plus the trend × 500 (`tdeeFromLogs`, the floor's own estimate), over the Healer's window (35 days, TUNE; see decision 3). It needs 3 weekly readings and 21 logged days in the window.
- **The aim:** the target pace, the pace Momentum pays in full. The suggestion is maintenance − 500 × the target pace, rounded to 50.
- **The limits on it:**
  - never under the floor, medical supervision or not (as D-46's catch-up figures);
  - never more than 500 below the logged average (TUNE), so it asks one step at a time;
  - it moves at most 100 kcal a week from the last suggestion (the floor's own A-44 rule).
- **Near the goal** (Ch 5 rule 7) the aim is 0, so the Healer suggests maintenance itself and walks the player into keeping the weight.
- **Without enough data** it uses the floor's fallbacks: Fitbit's total burned, else Mifflin–St Jeor × 1.4, else no figure, and it says why.
- **It suggests more room when you're ahead.** The limit is a ceiling, so more room never asks anyone to eat more. And steps feed it on their own: walking more raises measured maintenance, which raises the suggested limit.

| Your trend (logged 2,050 kcal, about 210 lb, target pace 0.8) | Maintenance | The Healer suggests |
| --- | --- | --- |
| Ahead: 1.0 lb a week (the book's Ch 4 example) | 2,550 | 2,150 |
| On pace: 0.8 | 2,450 | 2,050, what you eat now |
| Behind: 0.3 | 2,200 | 1,800, reached 100 a week |
| Up: gaining 0.5 | 1,800 | 1,550 (500 below the logged average; the formula's 1,400 is held back), reached 100 a week |
| Too fast: over 1% of weight a week | high | more room, 100 a week, with the too-fast check-in |

**The step pool,** from what you have walked: the last 4 closed weeks, read as the score reads them (Respite days shrink the pool, D-54).
- **Met in 3 or 4 of them:** the pool + 5%, rounded up to 1,000, never more than the best of those weeks. For example, 74,000 after a 70,000 pool met in 3 of 4 weeks with a best of 76,000.
- **Met in 2:** the same pool.
- **Met in 0 or 1:** the median of those weeks, rounded down to 1,000, never more than 10% below the pool. For example, 63,000 after 70,000 when the median walked was 59,500.
- **The cap:** never above 105,000 a week (TUNE). The overtraining check-in stays.
- **Fewer than 4 closed weeks:** no step figure yet.

Steps follow your walking and calories follow your weight, so each lever answers to its own data.

**When the Charter can change:** on a running contract's last day (when the next can be sealed, D-45), the Charter may be revised for the next contract. The new terms govern from the next dawn; the running contract keeps its own sealed copy (A-124). This fixes item 4 of section 1, so a back-to-back player can take the Healer's terms.

**The Steward's Counsel:** recommended to retire it in favor of the Healer's terms, since numbers say more than "gentler" or "firmer".

**No bonus for using the terms** (recommended). The reward is terms that fit.

### H3. The Healer's requests (rule change)
- **Built on Patch 8's dares (D-66, `requests.ts`):** from week 2, at each week close, the Healer asks one small thing for the week ahead.
- **What it asks for:** the weakest of four habits over the last 2 closed weeks:
  - days with food logged;
  - days within the calorie limit;
  - the step pool's share walked;
  - days with every duty kept.
- **It skips** a habit a ruler has dared that week (Skivvet food, Hrodgar steps, Emrys duties).
- **The size of the ask:** one more than last week, for day counts (at most 7), for example "log food on 5 days" after 4. For steps, 10 points more of the pool than last week walked, at most the pool.
- **Met:** 15 reputation, and every fourth met adds a Respite day (the bank's cap applies). TUNE.
- **Missed:** nothing. The Healer never punishes.
- **Rest counts:** a Respite day counts as kept (D-54).
- **Never about the scale:** it asks only for habits.

### H4. An Audience with the Healer (words and screens)
- **Where:** opened from the weigh-in card and the Healer's cards, a short audience like Patch 8's.
- **What it shows:** the Healer's portrait (a new art slot, `portrait.healer`, A2), this week's report, and questions answered from the rules with plain facts:
  - "How am I doing?": the report (H1).
  - "Why is my floor {floor}?": its source and its numbers.
  - "Why did the scale go up?": one reading a week, the change, the trend; Milestones are never revoked, and Momentum's floor while habits hold.
  - "When is my next Milestone?": its mark, its earliest week, and the week at target pace from now.
  - "What does losing faster earn?": nothing. Momentum is capped at the target pace; over 1% a week it holds Momentum at half and pauses Milestones.
  - "Can I rest?": the Respite bank, and that a rest day is paid (D-54).
- Talking pays nothing, so it can't be farmed.

## 4. Bigger ideas (rule changes, simulated first)

### B1. The plateau siege
- **A stall:** 3 weekly weigh-ins in a row with no new low (TUNE). The low is the lowest weekly reading of the campaign.
- **Wear:** while stalled, each day whose day score is 0.75 or more (TUNE; `dayScore`: duties, food logged and steps) adds a day of wear, and so does a Respite day (D-54).
  - Wear never fades, so there is no deadline and no reason to force a break.
  - It pauses while the player is away 14 days or more.
- **The break:** the first weekly reading below the low.
  - **Pays:** 5 reputation a day of wear, at most 150 (TUNE), at the close of the weigh-in day, with a Herald line.
  - The payment comes from the days kept, never from how much was lost.
  - A too-fast trend makes it wait (A-43).
- **On the card:** while stalled, the weigh-in card shows "the plateau: day {n} of the siege, {wear} days of wear". So a stall shows progress even when the scale shows none.
- **Farming:** a regain only lengthens the current siege. A new one needs a new low, which is real progress.
- **Beside the rest:** Momentum's floor and the Dispensation are unchanged.

### B2. The Heart Oak (art and screens)
- **What it is:** the white oak of the banner, planted on the Hearth hex at founding, grows a stage with each Milestone. The map shows the journey.
- **Where it shows:** on the realm view and up close, and on the Milestone card in its new stage. Keeping Milestones could bring its acorns.
- **Art (A2):** small hex-sized pictures, `realm.heartOak.0` to `.10`, from a sapling to the great oak. Claude writes the prompts. **Option:** 6 stages (one per Milestone tier) for fewer pictures.
- The tree grows, never the lord: no picture of a body.

### B3. Vigor
- **What it does:** each weight week's Momentum M gives every company × (1 + 0.05 × M) power in every battle until the next weight week settles (TUNE). It's shown on the battle screen and in the orders.
- **Why it's safe:** M is capped at the target pace, so faster loss gives no more Vigor. Momentum's floor keeps 3% while habits hold, and too fast holds M at half.
- **The cost:** it ties weight to the war most directly, and it widens the gap between habit profiles. Ch 9 says weight is never needed to win, so it needs the simulator's word on G-08, G-11 and G-19 first (D-02).

## 5. What stays out

- **No reward grows with how fast weight comes off.** Every new reward reads habits (W4, H3, B1's wear) or a fixed mark (W3, B2), and the too-fast hold pauses the scale-triggered ones.
- **Contracts stay habits only.** The scale pays only through Momentum, Milestones and what this patch adds beside them.
- **The Healer is the only voice on weight.** Rulers never mention it, and weight never counts for Respect (D-39).
- **No suggestion is ever under the floor,** and the game never sets terms itself.
- **The game still reads one weigh-in a week** (D-11, D-13). A longer window answers the noise instead.
- **No notifications** (D-04): the card shows in the app, at its next opening.

## 6. The writing

The Healer has no voice yet: its 13 check-ins all show their plain-fact templates. This patch adds about 45 slots:
- **The report:** about 10.
- **The terms:** about 5.
- **Faithful at the Scale and the waystones:** about 3.
- **The requests:** about 10.
- **The Audience:** about 12.
- **The plateau siege:** about 5.

Every slot ships with a plain-fact template, so no stage waits on the writing. Healer entries show their `final` only once Rich approves it (Ch 17, `approved`).

**Options:**
1. **Recommended:** Rich gives a few words on who the Healer is (a name, a manner, how they speak). Claude drafts every Healer line, the 13 check-ins included, in a draft file for Rich to approve, as Patch 8's lines were (D-67).
2. Rich writes them, and the templates show until he does.
3. The templates only, for now.

## 7. Save compatibility

- **New state is optional:**
  - the last suggested terms, for smoothing;
  - the Charter revised on a last day, for the next dawn;
  - the plateau siege's low, start and wear;
  - the Healer's open request.
- **Read from the snapshots, with no state:** Faithful's streak, the waystones and the oak's stage.
- **The live campaign** (founded on 3.1.0, on 3.10.0) carries forward in place with no migration.
- **W1 at install:** a week whose Momentum is already recorded is never paid again (the week close settles once). The week the patch lands settles at its weigh-in day's close if that is still to come, else at its week close.
- **Rules version:** 3.11.0 for stage 1.

## 8. Measuring it

New simulator readings (the simulator's weigh-ins already carry weekly noise and a 3-week plateau every 12 weeks, and the "Steadfast, long plateau" profile stalls from week 9):
- **G-26, the Healer's terms hold steady:**
  - how often the suggested limit changes direction from one week to the next, with the 21- and 35-day windows;
  - target: under 1 week in 4 with the window chosen.
- **G-27, plateaus, not noise:**
  - how often a stall starts outside the generated plateaus on Steadfast (target: at most once every 8 weeks);
  - that each long plateau of the plateau profile becomes a siege.
- **The new income:** Faithful, the requests and the siege together stay under 10% of a Steadfast campaign's reputation (TUNE).
- **Vigor, if chosen:** G-08, G-11 and G-19 stay inside their windows.
- **Every other target** keeps its verdict.

## 9. Suggested order

1. **Stage 1, the weigh-in moment and the Healer's terms:** W1 to W4, H1 and H2 (rules 3.11.0). The heart of Rich's idea, on the templates.
2. **Stage 2, the Healer as a character:** H3, H4 and the writing (3.12.0).
3. **Stage 3, the bigger ideas, each simulated first:** B1, B2 (once the art exists) and B3 if wanted.

## 10. Decisions needed

1. **W1:** the weight week settles at the close of the weigh-in day?
2. **W2 to W4:**
   - the card;
   - waystones, unpaid (recommended) or 5 each;
   - Faithful at the Scale?
3. **H2:**
   - aim at the target pace (recommended), or the book's range of 1 to 2 lb a week (Ch 4)?
   - the 35-day window (recommended) or the floor's 21?
   - the Charter revised on a running contract's last day?
   - the Steward's Counsel retired?
   - no bonus for using the Healer's terms?
4. **H3 and H4:** yes? The requests' reward of 15 reputation, with a Respite day every fourth?
5. **B1 to B3:** which, if any? For the oak, 11 stages or 6?
6. **The writing (section 6):** option 1, 2 or 3? With option 1, a few words on who the Healer is.
7. **The order (section 9)?**

## 11. Stage 1 report: the weigh-in moment and the Healer's terms (rules 3.11.0)

Built on branch `patch-9` (2026-11-01). The decision log has it as D-69. [Targets](../game/sim/targets-3.11.0.md).

### 11.1 What was built

- **W1, the weigh-in pays the morning after.** A new `weighIn` day phase settles the week's weight at the close of the day its reading is final, from week 2: Momentum, its record, Keeping Milestones, the Dispensation, the Grace, the Healer's floor and terms, and the check-ins.
  - It reads the trend through that reading, and the habits score of the week that closed the day before (the record keeps it).
  - The week close pays no Momentum for a week its weigh-in already settled.
  - Week 1, a week with no reading, and a week whose weigh-in day is its last day settle at the week close as before.
  - A weigh-in corrected inside the grace window pays any Momentum it now adds, and never takes any back (A-02).
- **W4, Faithful at the Scale.** As proposed, with one change: its streak is kept in the save (`weight.faithful`). Section 7 said it needed none, but a week away can only be told as it settles. A 3.10 save starts the streak from the weeks it already weighed in.
- **H2, the Healer's terms.** As proposed, with the numbers in section 3.
  - On the Contract page they replace the Steward's Counsel, which is removed with its rule and lines.
  - "Use these terms" fills the Charter's form.
  - The Charter can be revised on a running contract's last day, until the next is sealed.
- **H1, W2 and W3, the weigh-in card.** On the Chronicle, from the moment the weight is typed:
  - the reading, its change, the trend and the target pace;
  - the chart: 12 weeks back, and 8 weeks ahead between the target pace and the too-fast pace, with the next Milestone marks and the goal;
  - what the close pays, as things stand until then;
  - the next Milestone, with the week it would come at the target pace, and its waystones;
  - the Healer's report and terms.

  The Dawn tidings carry the report and what it paid, the morning after.
- **Words.** 13 new Healer slots (8 report lines, 5 terms lines), all plain-fact templates, none approved. How to Play's weigh-in, weekly, purse, contracts and weight sections say the new rules.
- **Tests.** 13 new (`tests/game/weighIn.test.ts`): the timing, the corrections, the streak and its holds, the terms' arithmetic, the card's preview matching what the close pays, the waystones and the report. 950 pass; typecheck and `check:game` are clean.

### 11.2 What the simulator found

720 campaigns, no invariant broken.
- **Faithful at the Scale** is 2% of a Steadfast campaign's reputation (G-26's half, met).
- **Victory comes a week or two sooner** with it: the smarter player wins in weeks 54 / 59 / 66, against 55.5 / 60 / 68 on 3.10.0. That is inside G-11's windows.
- **G-26, the Healer's terms hold steady: missed.** The suggested calorie limit turns around from one weight week to the next in 35% of weeks. The floor's 21-day window would turn in 46%. The target was under 25%.
  - **Why:** each weekly weigh-in is noisy (up to 1.5 lb either way in the simulator), so the fresh maintenance estimate wanders. The 100-a-week smoothing follows the wander in small steps up and down.
  - **A probe** on the simulator's own ledgers (40 seeds each, 70 weeks; the built rule reproduces at 36%):

| Variant | Steadfast | Long plateau | Committed | Weeks the figure moves (Steadfast) |
| --- | --- | --- | --- | --- |
| 21-day window, 100 a week | 47% | 50% | 49% | 97% |
| **35-day window, 100 a week (built)** | 36% | 40% | 38% | 91% |
| 35-day, 50 a week | 30% | 34% | 33% | 91% |
| 35-day, hold within 100 | 27% | 30% | 29% | 72% |
| **35-day, hold within 150** | 20% | 21% | 21% | 53% |
| 49-day, 100 a week | 30% | 36% | 34% | 83% |
| 49-day, hold within 100 | 18% | 20% | 20% | 53% |
| 63-day, 100 a week | 25% | 31% | 28% | 73% |

  "Hold within 150" means the Healer keeps last week's figure unless the fresh one is 150 kcal or more away from it, and then moves it 100.
- **G-07 and G-10 flipped to missed, both on near-ties.**
  - **G-07:** the three-path mix wins at a median of week 59 (58 to 62), against 64 to 65.5 for the others: 6.5 weeks apart, against the 5 allowed. On 3.10.0 it was week 62.
  - **G-10:** the Goblin's march now has the most defenses per hex held, 4.48 against the Orc's 4.20. On 3.10.0 the Orc's led, 4.51 to 4.44.
  - **Why, probably:** the 2% more income changes how each seeded campaign unfolds, and both readings were close before. I did not run a comparison to prove it.

### 11.3 Decisions for Rich

**Decided (2026-11-01, D-70):** Rich took all three as recommended. With "hold within 150" in `rules.ts`, the simulator reads G-26 as met: the suggested limit turns around in 20% of weight weeks (the 21-day window, held the same way, 38%).

- **T-11, G-26:** recommended: **keep the 35-day window and add "hold within 150"** (`RULES.healer.counsel.holdWithin`). The suggestion then turns around in about 20% of weeks and moves in about half of them, so it reads as advice, not a ticker. The alternative is a 49-day window with "hold within 100" (18 to 20%), which reacts a week or two later to a real change.
- **T-12, G-07:** recommended: **accept it for now and read it again after stage 2**, whose requests add income of their own. If it still misses then, probe it before changing anything.
- **T-13, G-10:** recommended: **accept it as a near-tie.** The Orc's march still changes hands most both ways, and the Goblin's leads on defenses by 0.28.

## 12. Rich's additions (2026-11-02): Remedy, and her terms bind

Rich, on 2026-11-02:
- The Healer is a woman named **Remedy**: strict and severe-looking, serious about health, genuine and caring, and able to come across a bit aggressive.
- Her terms should **override the contract's conditions**, set by her advice on what keeps a good pace.
- She should **account for Respite days**, assuming high calorie intake and a low step count on them, since they slow the trend.

The decision log has it as D-72. What it means here:

### H5. Her terms bind
- At each weight week, her calorie limit and step pool become the Charter's. Every contract sealed from then on carries them. "Use these terms" is gone, and the Charter's form keeps only the duties.
- **Claude's readings,** which Rich may overturn:
  - a contract already running keeps the terms it was sealed with (A-124), so new terms start with the next contract;
  - a figure she can't set yet (too little data) stays as the Charter has it;
  - with medical supervision confirmed, her terms stay advice, since a doctor's plan outranks hers.
- **What follows from it:** her step pool rises 5% after 3 of 4 weeks met, never past the best week, so the pool now climbs on its own as the walking does, and eases after misses.

### H6. Respite days in her arithmetic
- **The assumption:** a Respite day runs about 600 kcal over a usual day, between eating more and walking less (TUNE, Claude's first guess).
- **Reading the past:** in her 35-day window each Respite day counts at the logged average plus 600, so unlogged rest days don't make her misread maintenance.
- **Planning ahead:** she assumes one Respite day a week (the rate they're earned) at 600 over the limit, and lowers the other days' limit so the week keeps the target pace: by 600 ÷ 7, about 85 kcal.
- **Steps:** a Respite day still asks nothing of the step pool (D-54); its fewer steps are part of the 600.
- **Unchanged:** a rest day pays exactly as before (D-54). Only her advice plans for it.

### Remedy's lines
Claude drafts every Healer line in her voice: the 13 check-ins, the report and the terms. Each draft sits in its `final` with `approved: false`, so the game shows the plain template until Rich approves it. The drafts are listed for review in [patch-9-remedy-lines.md](patch-9-remedy-lines.md).

### Order
- **Stage 2a:** H5, H6 and Remedy's drafts (rules 3.12.0).
- **Stage 2b:** H3 (her requests) and H4 (her Audience, with her portrait).

### Stage 2a, built (2026-11-02, D-73)
- **H5 and H6** are built as above (rules 3.12.0). Her terms became the sample campaign's Charter at its weigh-in, and a contract sealed after carries them.
- **Remedy's 26 drafts** are in the catalog, unapproved, and listed for review in [patch-9-remedy-lines.md](patch-9-remedy-lines.md).
- **Simulator:** it can't play her terms, since its players eat a fixed share of the journey's terms and their weight doesn't follow what they eat, so its campaigns take her terms as advice. Every target reads as on 3.11.0. G-26 is 21% with the Respite planning (20% before).
- **Tests:** 957 pass, 4 of them new for stage 2a.
