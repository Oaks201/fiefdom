# Remedy's lines

**Status (2026-11-11):** Rich approved the first 26 as written (D-74), and the game speaks them. Stage 2b adds 20 drafts for her requests and her Audience (D-76), and stage 3 three for the plateau siege (D-77), at the end, unapproved: the game shows their plain lines until he approves them.

Drafted 2026-11-02 for Patch 9 stage 2a (D-72). Rich's brief: Remedy is a strict, severe-looking woman, serious about health, genuine and caring, and she can come across a bit aggressive.

**How these work:**
- Each draft is already in `src/renderer/src/data/text/healer.json` as its slot's `final`, with `approved: false`. Until you approve a line, the game shows the plain line beneath it.
- Approve all, approve some, or rewrite any: tell me which, and I set `approved: true` (or put your wording in).
- Words in braces are filled in by the game, e.g. {floor} becomes 1,550.

**How I wrote her:**
- Short, flat sentences, often an order.
- She is harsh about choices that hurt you (eating under the floor, losing too fast) and never about you.
- After a bad week she is steady, not soft.
- Every line still says the same rule or fact as its plain line.

## The check-ins (13)

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `crashDieting` | Your logged average for two weeks is under the calorie floor | Two weeks under {floor} kcal. That is not discipline; it is harm, and I will not watch it. Eat to the floor. | Healer check-in: the logged calorie average for the last two weeks is below the calorie floor of {floor} kcal. |
| `tooFast` | Your 28-day trend is over 1% of your weight a week | Too fast. Weight lost at this speed costs more than it gives, so Momentum is held at half and the Milestones wait until you slow. Eat more; that is an order. | Healer check-in: weight is coming off faster than the safe pace. Momentum is held at half and Milestones are paused until the trend slows. |
| `plateau` | The trend is flat but your habits held (the plateau floor pays) | The scale has stalled. Your habits have not: {consistency}% this week, and the plateau floor keeps your Momentum for it. Hold the line and the scale will follow. | Healer check-in: the weight trend is flat. Consistency this week was {consistency}%, so the plateau floor keeps Momentum. |
| `regain` | The trend is up this week | Up this week. It happens, and it takes nothing you have earned: broken Milestones stay broken, and Momentum never goes below zero. Back to work tomorrow. | Healer check-in: weight is up this week. Broken Milestones stay broken, and Momentum never goes below zero. |
| `unsafeGoal` | A goal below BMI 18.5 was refused | No. {goal} {unit} is below a healthy weight for your height, and I will not set it. Choose a goal I can stand behind. | Healer check-in: a goal of {goal} {unit} is below BMI 18.5 for the height given, so it was not set. |
| `overtraining` | The week's steps passed the pool | Your step pool is met. Steps past it earn nothing, so rest before your body forces you to. | Healer check-in: the step pool is met. Steps beyond the pool add nothing to the score. |
| `illnessAndTravel` | Three or more low days in a row | {days} hard days in a row. If you are ill or on the road, take a Respite day; you have {respite} banked, and that is what they are for. Rest is not failure. | Healer check-in: the last {days} days scored low. {respite} Respite days are banked and can pause the contract. |
| `fearOfLosing` | A rival's warning or Ultimatum stands | Stop worrying. No rival can win before week {week}, and no one will ever take the heartland. Mind your habits and let the war be the war. | Healer check-in: no rival can win before week {week}, and the heartland can never be taken. |
| `comingBack` | You open the app after 14 or more days away | {days} days away. The heartland held without you, as it always will. Seal a short contract and start again; I do not care how long you were gone, only that you are back. | Healer check-in: away for {days} days. The heartland held. A short contract can be sealed. |
| `shame` | A hex was lost yesterday | {what} fell on {date}. It is in the Chronicle, and that is the end of it. One loss is a fact, not a verdict on you. | Healer check-in: {what} was lost on {date}. It is recorded in the Chronicle. |
| `compulsiveChecking` | Today's orders are already set | Your orders are set. Nothing else is due before {closeTime}, so close this and go live your day. | Healer check-in: today's orders are set. Nothing else is due before the day closes at {closeTime}. |
| `payingOrRushing` | (Guardrail; not raised by any situation yet) | Nothing here can be bought with money, and no timer can be skipped. The only way through is the work. Do it. | Healer check-in: nothing in the realm can be bought with money, and no timer can be skipped. |
| `privacy` | (Guardrail; not raised by any situation yet) | Your ledger, your weigh-ins and your goals stay on this computer, and nowhere else. | Healer check-in: the ledger, weigh-ins and goals are stored only on this computer. |

## The weekly report (8)

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `report.notEnough` | Weigh-in card: no trend yet | I cannot read a trend yet. Give me two weekly weigh-ins at least {days} days apart, and do not skip them. | Healer's report: there is no trend yet. It needs two weekly weigh-ins at least {days} days apart. |
| `report.tooFast` | Weigh-in card: trend over the safe pace | {trend} {unit} a week is over the safe pace of {limit} {unit}. Slow down: Momentum is held at half and the Milestones wait until you do. | Healer's report: the trend is {trend} {unit} a week, over the safe pace of {limit} {unit}. Momentum is held at half and Milestones wait until it slows. |
| `report.nearGoal` | Weigh-in card: within 2% of your goal | You are within {share}% of your goal. Momentum pays in full while you stay there, and staying is the hard part. | Healer's report: the weight is within {share}% of the goal. Momentum pays in full while it stays there. |
| `report.up` | Weigh-in card: trend going up | Up {trend} {unit} a week. Broken Milestones stay broken and Momentum never goes below zero, so steady yourself and keep to the terms. | Healer's report: the trend is up {trend} {unit} a week. Broken Milestones stay broken, and Momentum never goes below zero. |
| `report.flat` | Weigh-in card: trend under a quarter of the target pace | Flat: {trend} {unit} a week against a target of {target} {unit}. While your habits hold, the plateau floor keeps part of your Momentum, so do not let them slip now. | Healer's report: the trend is flat at {trend} {unit} a week, against a target pace of {target} {unit}. While habits hold, the plateau floor keeps part of Momentum. |
| `report.behind` | Weigh-in card: trend under the target pace | {trend} {unit} a week against a target of {target} {unit}. Behind, not lost. Keep to the terms and the pace will come. | Healer's report: the trend is {trend} {unit} a week, against a target pace of {target} {unit}. |
| `report.onPace` | Weigh-in card: trend at the target pace | {trend} {unit} a week, at the target pace of {target} {unit}. This is exactly right, and Momentum pays in full. Do not get clever and try to beat it. | Healer's report: the trend is {trend} {unit} a week, at the target pace of {target} {unit}. Momentum pays in full. |
| `report.ahead` | Weigh-in card: trend over a quarter above the target pace | {trend} {unit} a week, ahead of the target pace of {target} {unit}. Faster earns you nothing, and I would rather you eat than burn out. | Healer's report: the trend is {trend} {unit} a week, ahead of the target pace of {target} {unit}. Going faster earns nothing more. |

## Her terms (5)

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `terms.calories` | Contract page: her calorie limit | Your limit is {limit} a day. You burn about {maintenance}; {deficit} comes off for a pace of {aim} {unit} a week, and {rest} more pays for your Respite day. | Healer's terms: a calorie limit of {limit}, from an estimated maintenance of {maintenance} less {deficit} for a pace of {aim} {unit} a week and {rest} to cover a Respite day a week. |
| `terms.maintenance` | Contract page: her calorie limit near your goal | Your limit is {limit} a day: about {maintenance} to hold your weight, less {rest} to pay for your Respite day. The losing is done; now we keep it. | Healer's terms: a calorie limit of {limit}, the estimated maintenance of {maintenance} less {rest} to cover a Respite day a week, to hold the weight near the goal. |
| `terms.noEstimate` | Contract page: not enough data for a calorie limit | I have no calorie figure for you yet. Give me {weighIns} weekly weigh-ins and {days} days of food logged in {window} days, or let Fitbit tell me what you burn. | Healer's terms: no calorie figure yet. It needs {weighIns} weekly weigh-ins and {days} days of food logged in {window} days, or Fitbit's calories burned. |
| `terms.steps` | Contract page: her step pool | Your pool is {pool} steps a week. You met it in {met} of the last {weeks} weeks, and I have set it by that. | Healer's terms: a step pool of {pool}. The pool was met in {met} of the last {weeks} weeks. |
| `terms.noSteps` | Contract page: fewer than 4 weeks closed | No step figure until {weeks} weeks have closed. Walk, and I will tell you how far. | Healer's terms: no step figure until {weeks} weeks have closed. |

## Stage 2b: her requests (8)

Drafted 2026-11-11 (D-76), unapproved.

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `request.foodLogged` | Her request: food logged was your weakest habit | Log your food on {target} of the {days} days, through {date}. Last week you logged {last}. I cannot judge what I am not shown. | Healer’s request for the week: log food on {target} of its {days} days, through {date}. Last week, {last}. |
| `request.withinLimit` | Her request: days within the limit were your weakest | Keep {target} of the {days} days within {limit} kcal, through {date}. Last week you held {last}. One day more; that is all I ask. | Healer’s request for the week: keep {target} of its {days} days within the calorie limit of {limit} kcal, through {date}. Last week, {last}. |
| `request.steps` | Her request: the step pool was your weakest | Walk {target}% of your step pool this week, {steps} steps, through {date}. Last week you managed {last}%. Get there. | Healer’s request for the week: walk {target}% of the step pool, {steps} steps, through {date}. Last week, {last}%. |
| `request.duties` | Her request: duties kept were your weakest | Keep every duty on {target} of the {days} days, through {date}. Last week, {last}. Discipline is a habit before it is a virtue. | Healer’s request for the week: keep every duty on {target} of its {days} days, through {date}. Last week, {last}. |
| `request.hold` | Her request: your weakest habit was already at its best last week | Last week was what I ask for. Do it again: {what}, through {date}. Twice is a habit begun. | Healer’s request for the week: {what} again, through {date}, as last week. |
| `request.met` | Her request met | Done, and done properly. {reward} reputation. | Healer’s request met: {reward} reputation. |
| `request.metRespite` | Her request met, and it was every fourth: a Respite day banked | Done. {reward} reputation, and a day of rest banked: every {every} met earns one. Spend it when you need it, not when you want it. | Healer’s request met: {reward} reputation, and a Respite day banked, as every {every} met earns. |
| `request.missed` | Her next request card, when the one before was missed | Last week’s request: missed. Nothing is taken from you for it. We go again. | Healer: last week’s request was missed. Nothing is lost for it. |

## Stage 2b: her Audience (12)

Drafted 2026-11-11 (D-76), unapproved. The question buttons are the player's words and show as they are.

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `audience.noReading` | Her Audience opens with no weigh-in this week or last | No weigh-in this week or last. Step on the scale on {day}. I cannot help you with numbers I do not have. | There is no weigh-in this week or last. The next weekly reading is taken on {day}. |
| `audience.floor` | Asked why the floor is what it is (maintenance estimated) | Your floor is {floor} kcal. You burn about {tdee} a day, {source}; {below} less is {low}, and I never set it under {min}. It moves {move} a week at most, so no single week can shove it. | The calorie floor is {floor} kcal a day. Maintenance is estimated at {tdee} kcal, {source}; {below} less is {low}, and the floor is never under {min}. It moves at most {move} kcal a week toward that. |
| `audience.floorMinimum` | Asked about the floor while it is at its least (no estimate yet) | Your floor is {floor} kcal, the least I allow anyone. I have not seen enough of you yet to set it higher. | The calorie floor is {floor} kcal a day, the least it can be: there is not yet enough to estimate maintenance. |
| `audience.floorNone` | Asked about the floor before the first weight week | No floor yet. I set it at your first weight week, and not a day before. | There is no calorie floor yet. It is set at the first weight week. |
| `audience.scaleUp` | Asked why the scale went up (only after a reading up) | Up {change} {unit} on one reading. One reading is weather; the {window}-day trend is the climate, and it reads {trend}. Nothing you broke is taken back, and while your habits hold, Momentum keeps {low} to {high}%. | The scale read {change} {unit} more than last week. The game reads one weigh-in a week, and the trend over {window} days is {trend}. A broken Milestone is never taken back, and while the week’s habits hold, Momentum keeps a floor of {low} to {high}%. |
| `audience.next` | Asked when the next Milestone comes | Milestone {index}: {mark} {unit}, {toGo} {unit} from here. Not before week {earliest}; at the pace I set, about week {week}. Do not chase it faster. | Milestone {index} is at {mark} {unit}, {toGo} {unit} to go. It cannot break before week {earliest}; at the target pace it comes about week {week}. |
| `audience.nextReached` | Asked about a Milestone whose mark is reached early | You have reached {mark} {unit}. Milestone {index} waits for week {earliest}. Patience is part of the cure. | Milestone {index}’s mark of {mark} {unit} is reached; it breaks in week {earliest}, when its time comes. |
| `audience.nextKeeping` | Asked about a Keeping Milestone, near the goal | Milestone {index} asks one thing now: stay near your goal. Keeping is harder than losing; most never learn that. | Milestone {index} is kept by staying near the goal. |
| `audience.allBroken` | Asked about Milestones once all are broken | Every Milestone is broken. Now keep what you built. | Every Milestone is broken. |
| `audience.faster` | Asked what losing faster earns | Nothing. Momentum pays in full at {target} {unit} a week and not a crumb more. Past {limit} {unit} a week I hold it at half and stop your Milestones; faster is not better, it is damage. | Nothing. Momentum pays in full at the target pace of {target} {unit} a week and no more. Past {limit} {unit} a week, Momentum is held at half and the Milestones wait. |
| `audience.rest` | Asked whether you can rest, with days banked | You have {bank} rest days banked, of {cap}, and earn one every {every} days. A rest day pays as a day kept and asks nothing of you. Take one when you are worn, not when you are bored. | There are {bank} Respite days banked, of {cap}; one is earned every {every} days. A Respite day pays as a day kept, and asks nothing to be logged. |
| `audience.restNone` | Asked whether you can rest, with none banked | None banked. You earn one every {every} days, up to {cap}. When it comes, it pays as a day kept. | There is no Respite day banked; one is earned every {every} days, up to {cap}. A Respite day pays as a day kept, and asks nothing to be logged. |

## Stage 3: the plateau siege (3)

Drafted 2026-11-11 (D-77), unapproved.

| Slot | When it shows | Remedy (draft) | The plain line it replaces |
| --- | --- | --- | --- |
| `siege.holding` | Weigh-in card and her Audience: a plateau siege stands | Day {day} of the siege: {wear} of wear so far, worth {reward} the week you weigh in under {low} {unit}. Plateaus fall to patience, not panic; keep wearing it down. | Healer: the plateau siege, day {day}: {wear} of wear, worth {reward} reputation when a weekly weigh-in breaks below {low} {unit}. |
| `siege.waiting` | Weigh-in card: a reading under the low while the trend is too fast | You are under {low} {unit}, but too fast. The siege's pay waits until you slow down. Eat to your limit, not under it. | Healer: the weigh-in is below the plateau's low of {low} {unit}, but the trend is too fast, so the siege's pay waits until it slows. |
| `siege.broken` | Weigh-in card: the week a reading breaks the plateau | The plateau is broken. {wear} of wear, {reward} reputation: paid for the days you kept when the scale gave you nothing. | Healer: the plateau is broken. {wear} of wear pay {reward} reputation. |
