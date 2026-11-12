# Remedy's lines

**Status (2026-11-08):** Rich approved all 26 as written (D-74). Each now carries `approved: true` in `healer.json`, so the game speaks it.

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
