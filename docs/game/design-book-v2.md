<!--
SNAPSHOT — do not edit by hand.
Source: Fiefdom — Game Systems Design Book v2 (Claude Doc)
        https://claude.ai/artifact/HXbzXvFF6BMMFS8jPePj2V
Exported 2026-10-05 (doc rev 340) so AI agents without access to claude.ai can read it.
Where this book and docs/game/decisions.md disagree, decisions.md wins.
-->

# Fiefdom — Game Systems Design Book v2

Oct 5, 2026 · @Richard Lykins

## How to use this book

This is version 2 of the Fiefdom design book, rewritten around Rich's playtest notes. It replaces version 1 (Oct 4, 2026) wherever the two disagree. It is written so a developer and their AI coding tools can build the game from it without guessing.

- **For the developer:** every rule has a number, every number lives in the tuning table (Appendix B), and every system maps to code (Appendix A). Where a value is a first guess, it says so. Open design questions are listed in Appendix D rather than left implicit.
- **For the player (Rich):** Chapters 1 to 10 explain how the game works. Chapters 11 to 13 and Appendix C contain spoilers: unit rosters, rival hosts, hidden thresholds and the world-event deck. Skip them if you want to discover those things in play.
- **Hidden values stay hidden in the game.** Anything marked *hidden* in this book (the rival benchmark, event triggers, rival treasuries) must never be shown as a number in the UI. The UI shows bands and rumors instead (Chapter 12).

### What changed from version 1

| System | Version 1 | Version 2 |
| --- | --- | --- |
| Where land comes from | Granted by finishing a contract | Taken by conquest, won by influence (settlements defect), or bought by trade |
| What contracts pay | A hex, plus reputation | Reputation only, on a sliding scale by consistency |
| The 70% bar | Pass/fail gate on every contract | Gone. Payouts scale smoothly; rivals earn at a hidden benchmark instead |
| Rivals | Fixed realms that raid you and fight each other; never expand | Full economies that earn, expand, fortify, bid on land, ally and can win |
| Losing | Impossible | Border land can fall; a rival can win the campaign, but never before week 36 |
| Combat | Daily auto-resolve; the army can't take land | Daily auto-resolve with orders, plus tactical Grand Battles at key moments |
| Weight | Three Vows unseal three Wonders | Momentum (weekly weight trend) earns reputation; Milestones every 5 lb unlock tiered content; steady progress earns the Crown's Grace (forgiveness) |
| Time limit | None | No fixed deadline, but rivals keep pace with you, so time is pressure |
| Winning | Sign four Accords | Resolve all four rivals, each by conquest, defection or Accord |

Kept unchanged from version 1: the real-time clock, the 127-hex map, the four buildings and their tiers, the six Crossings, Respite days, the one-day grace for corrections, the weekly step pool and calorie average, and the wellbeing guardrails.

## Preface

Fiefdom turns a year of keeping your word into a kingdom you have to fight for. Your real-world habits fill your treasury. What you do with that treasury, which buildings you raise, which units you field, which land you take and how, decides whether you out-build four rival rulers who are earning at a pace you can't see. A very consistent player wins in about 11 months. A player who slips can still lose, but never early.

### The promise to the player

Every coin in your purse traces back to a day you kept. Every hex you hold is one you chose to take. The game asks for steadiness, not perfection: steps are pooled by the week, calories are averaged by the week, weight is read as a three-week trend, and only the daily duties stay daily. The world will push back, and the more steadily you keep your word, the more it forgives.

### Design pillars

Every rule in this book serves one of these seven pillars. When two rules conflict, the earlier pillar wins.

1. **Your habits are your treasury.** Reputation is earned only by real behavior: steps, food logging, duties, contracts kept and steady weight progress. Land and battles produce income only because habits paid for them first.
2. **Your choices win the war.** Land is taken by armies, influence and trade, never handed out. Two players with the same consistency can end in very different places because they spent differently.
3. **The world pushes back.** Rivals earn at a hidden benchmark, expand, fortify, form alliances and react to what you do. Pressure is constant from the first month, and defeat is possible from week 36, never sooner.
4. **Steadiness earns forgiveness.** The more consistent your habits and weight progress, the gentler the world becomes: lost land is easier to retake, defeats cost less, and rivals need longer to threaten the crown.
5. **The body crowns; it does not gate.** Weight Milestones unlock new units, items and building wings at a healthy pace. Losing faster unlocks nothing sooner, and a plateau is never punished while habits hold.
6. **Everything connects.** A direction feeds one building, the land between two directions feeds both, and pairs of buildings field units neither could alone.
7. **Real time, honest time, room to discover.** Days close at 04:00 local time and nothing can be fast-forwarded. Rival rosters, events and thresholds reveal themselves in play, not in a manual.

### The core loop in one line

Keep your habits → earn reputation → spend it on buildings, units and influence → take land by force, defection or trade → land feeds your buildings and your treasury → rivals respond → repeat.

## Chapter 1 — Where Fiefdom stands today

Fiefdom today is a working habit ledger, not yet a game: an Electron, React 19 and TypeScript app with three pages (Chronicle, Contract, Archive) and Fitbit sync through the Google Health API. This book is the game that sits on top of it. The ledger keeps recording what happened each day; a new campaign layer settles those days into game events.

| System | In the code today | In this book |
| --- | --- | --- |
| Contract length | Always 7 days (`endDate = startDate + 6` in `lib/ledger.ts`) | Player picks 1, 3, 7, 14 or 30 days from the lengths unlocked so far |
| Contract reward | Graded Gilded / Honored / Found Wanting (`HONORED_SHARE = 0.7`) | Reputation on a smooth curve of the consistency score; no pass/fail |
| Step term | Daily minimum | Weekly pool (e.g. 50,000), judged by the week's pace |
| Calorie term | Daily limit, optional minimum | Weekly average limit plus a food-logging share |
| Duties | Sworn daily habits | Unchanged |
| Reputation | Recomputed from history in `lib/reputation.ts` | A settled purse of explicit earn/spend events |
| Wagers and burning | Stakes repaid ×3/×2/×½; burning erases steps and calories | Stakes become optional Pledges; health records are never erased |
| Weight | Start and final weight per contract | Start weight (217 lb for Rich) and goal weight; weigh-ins typed into the ledger by hand; Momentum and Milestones |
| Map, buildings, units, rivals, combat | None | Chapters 3 to 14 |

### Kept from the existing code

Days close at 04:00 in a fixed campaign time zone. Earnings settle once into an event log, so editing an old day never replays a battle or a purchase. All randomness is seeded and reproducible. Hand-typed numbers are never overwritten by Fitbit. The atomic file writer and daily backups in `main/ledgerFile.ts` are reused for the campaign file.

## Chapter 2 — The real-time clock

Fiefdom runs on the player's own calendar, and nothing in it can be fast-forwarded. The daily loop costs 2 to 5 minutes; a Grand Battle, when one comes, costs 5 to 10.

| Unit | Length | What settles when it closes |
| --- | --- | --- |
| Day | 04:00 to 04:00 in the campaign time zone | Duties, daily reputation, the day's defense battles and your assault, contested-hex checks |
| Week | Monday 04:00 to Monday 04:00 (`settings.weekStartsOn`) | Step pool, calorie average, Momentum, weekly reputation, tithes, courtships, the rivals' turn, the Crown's Grace, world events |
| Contract | 1 to 30 days, chosen by the player | Its reputation payout and any Pledge |
| Campaign | Open-ended; about 11 months for a very consistent player | Victory (all four rivals resolved) or defeat (a rival's Ascendancy, Chapter 14) |

### The daily and weekly loop

| When | What the player does | What the game does |
| --- | --- | --- |
| Dawn, 04:00 | Nothing required | The Herald posts tidings: today's threats, their targets and strength bands, rumors from rival courts, any Grand Battle warning |
| During the day | Log food and duties; steps sync on their own. Optionally: set today's assault target, split companies between defense and assault, start a courtship or trade, spend reputation, fight a Grand Battle if one is due | Shows pace toward the week's step pool and calorie average, and today's Valor so far |
| Day close, 04:00 | Nothing required | Resolves defense battles and your assault with the day's Valor; settles duties and daily reputation; auto-resolves any unfought Grand Battle |
| Week close, Monday 04:00 | Weigh in (a prompt, once a week, more often optional) | Settles the step pool, calorie average and Momentum; pays tithes; resolves courtships; runs the rivals' turn; checks Milestones, Grace and world events |

### Rules of real time

1. **Contracts begin at the next dawn.** A contract sealed at noon starts at 04:00 tomorrow. The next contract can be queued so no day is lost between contracts.
2. **Orders lock at day close.** Assault targets and company assignments can be changed until 04:00. If the player sets nothing, the Marshal defends with every company and no assault is made.
3. **Days settle at close or at next launch.** When the app has been closed, it syncs Fitbit first, then settles every missed day in order, then every missed week. Missed days run with no orders.
4. **One day of grace.** A settled day can be corrected until the following close. A correction updates contract scores, Momentum and Valor-based records going forward, but never reruns a battle, a courtship or a rival turn, and never refunds a purchase.
5. **Late data only helps.** A correction can raise a contract's payout; it can never lower one already paid.
6. **The campaign time zone is fixed** at founding and can change only at a week boundary, without repeating or skipping a day.
7. **Seeded randomness.** Every random draw is `hash(campaignSeed, date, purposeLabel)`. Reloading, resettling or reinstalling never changes a result.

## Chapter 3 — The realm map and hex ownership

The map is unchanged from version 1: 127 pointy-topped hexes in six rings around the castle, four roads running from the four buildings to the four rival capitals, and four between-lands shared by neighboring buildings. What is new is ownership: every claimable hex now belongs to someone, and it can change hands.

### Layout (unchanged)

| Ring | Name | Hexes | Contents |
| --- | --- | --- | --- |
| 0 | The Castle | 1 | The seat of the realm |
| 1 | The Hearth | 6 | The four buildings (diagonal faces) and two wild hexes (left and right) |
| 2 | The Commons | 12 | Beast dens and villages |
| 3 | The Wildwood | 18 | Beast dens and villages |
| 4 | The Marches | 24 | Beast dens, villages, rival outposts on the roads |
| 5 | The Frontier | 30 | Four Gates, two Lair Mouths, frontier hexes |
| 6 | The Rim | 36 | Rival realms and capitals, the two lairs, 18 battlefields |

Roads, between-lands and the two lairs (the Wyrmfells to the west, the Thornwild to the east) are exactly as drawn in version 1, Chapter 3. Claimable hexes: 86 (rings 1 to 5, minus the castle and four buildings).

### Who holds what at the founding

| Holder | Hexes at start |
| --- | --- |
| The player | Castle and the four buildings. The two Hearth wild hexes start *neutral* (claimable from day 1) |
| Each rival | Its capital (Rim corner on its road), the two Rim hexes beside it (its realm), its Gate on ring 5, and the two ring-5 hexes beside its Gate (its March): 3 claimable hexes each, 12 in all |
| Neutral | The other 74 claimable hexes, each held by beasts or an unaligned village |
| Nobody, ever | The 18 battlefields and the lairs' Rim hexes |

### What every hex records

| Field | Values | Meaning |
| --- | --- | --- |
| `owner` | player, orc, goblin, dwarf, archmage, neutral | Who holds it |
| `garrison` | number | Strength an attacker must beat to take it (Chapter 6) |
| `settlement` | none, or `{ loyalty }` | A village that pays tithes and can be courted to defect |
| `fortification` | 0 to 3 | Bought by its owner; adds to defense (Chapter 10) |
| `status` | held, contested (with days left), scorched (with days left) | Contested hexes are under conquest attack |

### Settlements

Thirty hexes carry a village: 4 in the Commons, 6 in the Wildwood, 8 in the Marches and all 12 rival-held Frontier hexes. Placement is seeded at the founding with two constraints: no two villages are adjacent, and each building's direction gets the same count within one. Villages pay their owner tithes each week (Chapter 5) and are the only hexes that can be won by influence (Chapter 6).

### Rules of the map

1. **Adjacency.** You can assault, court or buy a hex only if it touches land you hold. Rivals follow the same rule.
2. **The protected core.** Rings 0 to 2 can never be taken from the player. A bad month can cost you the frontier, never your home.
3. **Dominion follows the land.** Dominion is computed as in version 1 (a road hex gives 2 × ring to its building; a between-land hex gives ring to each of its two buildings). Losing a hex lowers Dominion, but a building tier already bought is never lost; only the next purchase waits.
4. **Capitals are special.** A rival's capital can only be attacked in a Grand Battle, and only once you hold that rival's Gate (Chapter 14). Taking it ends that rival.
5. **Lair Mouths.** The two ring-5 hexes facing the lairs are held by mythic beasts and can only be taken in a Grand Battle (a Mythic Hunt, Chapter 11). Taking one seals its lair: mythic attacks from that side drop by 50%.
6. **The Rim stays put.** Realm hexes beside a capital, the lairs and the battlefields are never claimable.

## Chapter 4 — Contracts

A contract is the lord's sworn word: a span of real days during which the player keeps their Charter. It pays reputation on a smooth curve of how well the terms were kept. Contracts no longer grant land, and there is no pass/fail bar. Longer contracts pay more per day, and the player can raise the stakes with a Pledge.

### The Charter (unchanged)

The player writes three terms at the founding and may revise them between contracts. Each contract copies the Charter when sealed.

| Term | Judged | Example | Allowed range |
| --- | --- | --- | --- |
| Step pool | Per calendar week | 50,000 steps a week | 10,000 to 200,000 |
| Calorie limit | Weekly average over days with food logged | 2,000 kcal a day | The Healer's floor (below) to 10,000 |
| Duties | Every day | Read 20 pages; no snacks after 9 pm | 1 to 5 sworn duties |

The Steward's Counsel suggests gentler terms after four weeks averaging below 75%, and firmer ones after four weeks above 95%. The game never sets terms itself.

### The Healer's calorie range

The calorie limit must sit inside a healthy range the game calculates from the player's own logged food and weight trend: the intake that should produce 1 to 2 lb of loss a week. The bottom of that range is the floor, and it is never below 1,200 kcal.

1. **Estimated maintenance (TDEE).** `TDEE = avgLogged + (trendLoss × 3,500) / 7`, where `avgLogged` is the average kcal over days with food logged in the last 21 days and `trendLoss` is Momentum's 21-day weight slope in lb per week (Chapter 5). It needs 14 or more logged days and 2 or more weigh-ins at least 6 days apart.
2. **Before there is enough data** (usually the first 2 to 3 weeks): use the average daily calories burned that Fitbit reports over the last 14 days; if that is missing, Mifflin–St Jeor × 1.4 when sex, age and height were given; otherwise the floor is 1,200.
3. **The range.** Lower bound (about 2 lb a week) = TDEE − 1,000. Upper bound (about 1 lb a week) = TDEE − 500. Floor = max(lower bound, 1,200).
4. **Smoothing.** Recomputed at each week's close, rounded to the nearest 50 kcal, and moving at most 100 kcal a week, so one odd week of logging cannot swing it.
5. **Enforcement.** The Charter cannot be set below the floor without confirmed medical supervision. If the floor rises above a running contract's limit, that contract keeps its terms and the Steward suggests a new limit for the next one.
6. **No reward for under-eating.** Logged days below 90% of the floor count as over budget in the Table score.

**Worked example.** Rich logs an average of 2,050 kcal and his trend is −1.0 lb a week. TDEE = 2,050 + 3,500 / 7 = 2,550. The range is 1,550 to 2,050 kcal, so his floor is 1,550 and any limit from 1,550 up is allowed.

### Contract lengths

| Length | Available from | Length multiplier `L` | Full payout | Per week at full |
| --- | --- | --- | --- | --- |
| 1 day | Day 1 | 1.00 | 10 | 70 |
| 3 days | Day 1 | 1.15 | 35 | 80 |
| 7 days | Any building at Tier II | 1.40 | 98 | 98 |
| 14 days | Castle Tier II | 1.70 | 238 | 119 |
| 30 days | Castle Tier III | 2.00 | 600 | 140 |

Short contracts give small, quick wins in the first weeks. Long ones pay up to twice as much per day but tie up the slot, so a rough patch costs more. Choosing the length is the decision.

### The consistency score (unchanged from version 1)

Each calendar week the contract touches is scored on three equal pillars, then weeks are averaged by how many contract days fell in each.

1. **Steps:** steps walked since the week began, divided by the pool's share for those days, capped at 100%.
2. **Table:** share of the week's days with food logged × a budget score (100% when the logged average is within the limit, falling linearly to 0% at 15% over).
3. **Duties:** duties kept ÷ duties sworn, over the contract's own days.

```latex
q_w = \frac{S_w + T_w + D_w}{3} \qquad Q = \frac{\sum_w n_w\, q_w}{\sum_w n_w}
```

### The payout curve

```latex
f(Q) = \min\left(1, \max\left(0, \frac{Q - 0.40}{0.60}\right)\right) \qquad \text{Payout} = 10 \times \text{days} \times L \times f(Q)
```

| Q | 40% | 55% | 70% | 80% | 90% | 100% |
| --- | --- | --- | --- | --- | --- | --- |
| f(Q) | 0 | 0.25 | 0.50 | 0.67 | 0.83 | 1.00 |

Every extra point of consistency pays the same amount. There is no cliff to fall off and no threshold to aim for, only more or less.

### Pledges (optional stakes)

When sealing a contract, the player may pledge up to `10 × days` reputation (never more than the purse holds). At the end the pledge returns `Pledge × 2 × f(Q)`: break-even at 70%, double at 100%, half back at 55%, nothing below 40%. Merchant Hall III raises the pledge cap by 50%; Merchant Hall IV guarantees at least half the pledge back.

**Worked example.** A 7-day contract with a 50,000 pool and a 2,000 kcal limit. The player walks 46,000 steps (92%), logs food 6 of 7 days averaging 1,950 kcal (86%), and keeps 19 of 21 duties (90%). Q = 89.3%, so f(Q) = 0.822. Payout = 10 × 7 × 1.4 × 0.822 = **80.5**. A 70-reputation pledge returns 70 × 2 × 0.822 = **115.0**.

### Rules of contracts

1. **One contract runs at a time.** The next can be sealed and queued.
2. **Contracts start at the next dawn**, never partway through a day.
3. **Withdrawal.** The player may end a contract early. It pays `10 × daysElapsed × 1.0 × f(Q)` (no length multiplier) and returns half the pledge.
4. **Respite days.** One Respite day is earned per 7 days of play, banked up to 4 (5 at Mage Tower III, 6 at Tier V, +1 from the Healing Springs). Spending one on today or yesterday removes that day from every pillar and moves the contract's end a day later. Respite buys time, never score.
5. **Missing data counts as missed.** No food logged scores no logging credit; unsynced steps count as zero until they arrive within the day of grace.
6. **No burning.** Health records are never destroyed by a game rule.
7. **Accords are contracts too.** The 30-day Accord with a rival (Chapter 14) uses the same score and curve.

## Chapter 5 — Reputation, Momentum and the purse

Reputation is the realm's one spendable currency. It is earned by habits and spent on everything that wins the war: buildings, units, items, fortifications, courtships and trades. Land you hold adds income through village tithes, so early choices compound.

### Where reputation comes from

| Source | Settles | Amount |
| --- | --- | --- |
| Duties | Daily | 12 × share of sworn duties kept |
| Perfect day (every duty kept and food logged) | Daily | +5 |
| Streak | Daily | +1 per perfect day in a row before it, up to +7 |
| Step pool | Weekly | 70 × share of the pool walked, capped at 70 |
| Calorie average | Weekly | 70 × the week's Table score |
| Flawless week (all three pillars at 100%) | Weekly | +50 |
| **Momentum** (new) | Weekly | 60 × Momentum score M (below) |
| Contract payout and pledge return | At contract end | Chapter 4 |
| **Tithes** (new) | Weekly | 4 × ring for each village you hold |
| Battle spoils | Daily | 4 × ring for a win, 6 × ring for a rout (Chapter 10) |
| Merchant Hall bonus | On every gain above | +2% at Tier I, rising to +15% at Tier V |

### Momentum: weight's share of the treasury

Momentum turns a steady weight trend into reputation without ever paying more for losing faster. It is computed at each week's close.

1. **The trend.** `r` = the least-squares slope of all weigh-ins in the last 21 days, in lb per week (loss is positive). It needs at least two weigh-ins at least 6 days apart; otherwise `r` is unknown and only the floor applies.
2. **The target.** `T` = min(0.8 lb, 0.4% of the 7-day average weight) a week. It holds at 0.8 lb down to 200 lb, then eases as loss naturally slows: 0.76 lb at 190, 0.72 at 180, 0.68 at 170. Early weeks usually run faster than the pace, which banks a head start. The 0.8 lb cap can be set from 0.3 to 1.0 lb.
3. **The weight score.** `Mw = clamp(r / T, 0, 1)`. Losing faster than T earns nothing extra.
4. **The plateau floor.** `Mf` = 0.6 if the week's consistency score is 85% or more, 0.3 if 75% or more, otherwise 0. Plateaus and water-weight weeks happen to people doing everything right.
5. **Momentum.** `M = max(Mw, Mf)`, so Momentum rep runs from 0 to 60 a week.
6. **Too fast is paused, not paid.** If the 28-day trend exceeds 1% of body weight a week, `Mw` is held at 0.5 and the Healer checks in (Chapter 16).
7. **Maintenance goals.** When the goal is within 2% of current weight, `Mw` = 1 while the 7-day average stays within 2% of the goal.

| Week | Weigh-in trend | Consistency | Mw | Mf | Momentum rep |
| --- | --- | --- | --- | --- | --- |
| On pace | −0.8 lb/wk | 82% | 1.00 | 0.3 | 60 |
| Faster | −1.6 lb/wk | 82% | 1.00 | 0.3 | 60 |
| Slow | −0.4 lb/wk | 70% | 0.50 | 0 | 30 |
| Plateau, habits strong | 0 lb/wk | 90% | 0 | 0.6 | 36 |
| Up a pound, habits strong | +1 lb/wk | 88% | 0 | 0.6 | 36 |

### Where reputation goes

| Sink | Cost |
| --- | --- |
| Building Tier II / III / IV / V | 150 / 450 / 1,100 / 1,800 per building |
| Castle Tier II / III / IV | 250 / 750 / 1,500 |
| Crossing stage I / II / III | 200 / 600 / 1,200 per pair |
| Items | 40 to 400 each (Appendix C) |
| Fortifying a hex, level 1 / 2 / 3 | 15 / 35 / 70 × ring |
| Courting a village | The player's bid (Chapter 6) |
| Buying a hex in trade | The agreed price (Chapter 6) |
| Hired blades (Merchant Hall II) | 20 per company per battle |
| Rival envoy companies (Respect 50) | 25 per battle |
| Reclaiming a lost hex (Crown's Grace I) | Half its garrison strength in reputation, instead of a battle |

### The purse

1. **A settled ledger.** The balance is the sum of explicit events: earn, pledge, return, spend, spoils, tribute, tithe, adjust. A correction within the day of grace posts an adjusting entry, never a rewrite.
2. **Never negative.** Tribute takes only what the purse holds; a pledge is capped at the purse.
3. **Founding grant of 100**, enough to raise a first building to Tier II in week one.
4. **Lifetime reputation and old wagers stay in the Archive** as history. A campaign starts with its own purse.

### Realm Consistency

The headline number on the castle screen is Realm Consistency: the three-pillar score over the last 28 days. The player always sees their own number. They never see the rivals' benchmark (Chapter 12).

## Chapter 6 — Taking land: conquest, influence and trade

Land changes hands three ways: by force, by winning a village's trust, or by striking a deal. Every hex taken must touch land you already hold. Each way costs something different, so the choice of how to expand is the strategy.

| Way | Works on | Costs | Limit | Best when |
| --- | --- | --- | --- | --- |
| Conquest | Any adjacent hex except capitals and Lair Mouths | Companies away from defense for the day | 1 assault a day (2 at Castle IV) | Your army out-matches the garrison |
| Influence | Adjacent village hexes | Reputation bid | 2 open courtships (3 at Merchant Hall III) | Your consistency is high and the village is well defended |
| Trade | Adjacent rival hexes | Reputation price | 1 deal per rival per 4 weeks | Respect is high and you want peace on that border |

### Conquest: the daily assault

Each day the player may name one adjacent hex to assault and assign each company to **Defense** or **Assault**. A company does one or the other that day. Each side fields up to the castle's banner count from its own pool. With no orders, all companies defend.

```latex
\text{Assault} = (1 + a)\sum_{\text{best } B} p_c\, m_c \times \big(r + (1 - r)\,V\big)
```

The symbols are as in Chapter 10: `a` is the Foundry arms bonus, `p` is company power, `m` is the match against the garrison's type (0.6 to 1.5), `r` is the rally floor and `V` is the day's Valor. Walls do not help an assault.

| Garrison | Strength |
| --- | --- |
| Beast den (neutral) | 0.9 × base(ring) |
| Unaligned village (neutral militia) | 0.6 × base(ring), Steel-typed |
| Rival hex | base(ring) × the rival's garrison multiplier, + 25% of base per fortification level |
| Base by ring 1 / 2 / 3 / 4 / 5 | 15 / 22 / 55 / 115 / 200 |

**Outcomes at day close:**

1. **Taken** (Assault ≥ garrison): the hex is yours at dawn. Spoils 4 × ring, or 6 × ring for a rout (Assault ≥ 1.5 × garrison). A taken rival hex costs 5 Respect with that rival; a taken village pays half tithes for 4 weeks while it settles.
2. **Repulsed** (Assault < garrison): the hex holds, but the attack wears it down. Its garrison drops by 25% of your Assault value until the week closes, so a second or third push can break it. Your assault companies are Wearied the next day (−20% power).

### Influence: courting a village

The player can court any adjacent village, neutral or rival-held, by placing a sealed reputation bid. Bids resolve at week close. Consistency makes your word worth more, because people trust a lord who keeps it.

```latex
\text{Trust} = \min(1.2,\ \max(0.6,\ 0.6 + 0.6 \times RC)) \qquad \text{Offer} = \text{Bid} \times \text{Trust}
```

`RC` is the player's Realm Consistency (28-day). At RC 50% Trust is 0.90; at 80% it is 1.08; at 100% it is 1.20.

| Village | Resistance to beat |
| --- | --- |
| Neutral | Loyalty = 15 × ring |
| Rival-held | Loyalty = 30 × ring, + the owner's counter-bid that week |

1. **Defects** (Offer ≥ Resistance): the hex and its village become yours at dawn with no battle, and the whole bid is spent. A village taken from a rival costs 3 Respect with it.
2. **Holds** (Offer < Resistance): half the bid is refunded, and the village's loyalty drops permanently by 10% of the Offer. Persistent courting always gets closer.
3. **Two suitors.** When a rival bids on the same neutral village, the higher Offer wins; the loser gets half back. Rivals bid at Trust 1.0.

### Trade and negotiation

The Diplomacy screen lists what each rival will discuss. Prices are fixed by formula so the AI is predictable to code.

| Deal | Requires | Price | Effect |
| --- | --- | --- | --- |
| Buy a hex | Respect 50 (Goblin: 25); not their Gate; not at war with you | 50 × ring × greed, ×1.5 for a village | The hex is yours at dawn; +2 Respect |
| Sell a hex (not rings 1 to 2) | Respect 25 | You receive 0.7 × the buy price | +5 Respect |
| Truce | Any time; not during a Grand Battle warning | 30 × the highest ring that rival borders | No raids or conquest attempts from that rival for 7 days; +2 Respect |
| Non-aggression pact | Respect 40 | 250 | No conquest attempts from that rival for 28 days; raids at half rate |
| Call to arms | Respect 60, and that rival is not allied with the target | 200 | The rival declares war on another rival for 14 days |

Greed: Orc 1.5, Goblin 1.2, Dwarf 2.0, Archmage 1.4. Each rival makes at most one hex deal with the player per 4 weeks.

### Losing land and taking it back

Rivals take land the same ways, with one extra protection for the player: a rival conquest attempt only *contests* a hex the first time it succeeds (Chapter 10). Land in rings 0 to 2 can never be lost. With the Crown's Grace at level I or higher, a hex lost in the last 14 days can be **reclaimed** for reputation equal to half its current garrison, with no battle (Chapter 9).

## Chapter 7 — Buildings and tiers

Each of the four buildings climbs five tiers, and the castle climbs with them. Tiers are how reputation becomes power: each tier upgrades the building's own company and adds a realm-wide effect. Land gates the early tiers through Dominion, reputation gates the later ones, and Tier V also needs that building's rival resolved and a weight Milestone tier.

### Requirements

| Tier | Dominion needed | Reputation | Also needs |
| --- | --- | --- | --- |
| I | 0 | — | Held from day 1 |
| II | 8 | 150 | — |
| III | 24 | 450 | — |
| IV | 68 | 1,100 | — |
| V | 68 | 1,800 | The matching rival resolved (Chapter 14) and Milestone tier III (Chapter 9) |

If land is lost and Dominion falls below a tier's threshold, the tier stays. Only the next purchase waits for Dominion to recover.

### What each tier gives

Power is in brackets. Each building's company keeps one slot on the roster and is upgraded in place.

| Tier | Barracks (Steel) | Merchant Hall (Coin) | Mage Tower (Arcane) | Foundry (Engine) |
| --- | --- | --- | --- | --- |
| I | Militia (5) | Watchmen (5); +2% reputation | Hedge-wardens (5) | Palisade Crew (5) |
| II | Men-at-Arms (9) | Sellswords (9); +5%; hired blades | Acolytes (9); mythic attacks −10% | Crossbowmen (9); all companies +5%; walls +3 |
| III | Pikemen (14); rally floor 55% | Caravan Guard (14); +8%; pledge cap +50% | Wardens (14); Respite bank holds 5 | Ballista Crew (14); all +10%; walls +6 |
| IV | Knights (21); rally floor 60% | Free Lances (21); +12%; at least half of every pledge returns | Magi (21); mythic −20%; threats and Grand Battles foretold a day earlier | Trebuchet Battery (21); all +15%; walls +9 |
| V | Champions (30); rally floor 65% | The Gilded Host (30); +15%; courtships +1 slot | Archmagi (30); mythic −30%; Respite bank holds 6 | Iron Colossus (30); all +20%; walls +12 |

### The four roles

1. **Barracks: endurance.** Raises the rally floor so bad days still hold the line. Answers the Archmage's conjurations.
2. **Merchant Hall: economy and influence.** Earns more, pledges more and courts more villages. The building for a player who wants to win by defection and trade.
3. **Mage Tower: foresight and mercy.** Blunts mythics, warns of threats and Grand Battles early, deepens the Respite bank. Answers the Dwarf's shieldwalls.
4. **Foundry: arms and walls.** Multiplies every other company and thickens the walls. The strongest building for conquest. Answers the Orc's warbands.

### The castle

| Castle tier | Requirement | Reputation | Banners | Walls | Also unlocks |
| --- | --- | --- | --- | --- | --- |
| I — Keep | Start | — | 2 | 4 | 1- and 3-day contracts |
| II — Stronghold | Building tiers sum to 8 | 250 | 3 | 8 | 14-day contracts |
| III — Citadel | Building tiers sum to 12 | 750 | 4 | 14 | 30-day contracts; the Accord |
| IV — Palace | Building tiers sum to 16 | 1,500 | 5 | 22 | A second daily assault |
| V — High Throne | All four rivals resolved | — | 6 | 30 | Victory |

### The roster

The army is a roster of companies; banners limit how many fight in any one battle. Sources: one company per building (4), one hybrid per Crossing (up to 6, Chapter 8), Elite companies from Milestones (up to 4, Chapter 9), the Crownguard (Chapter 8), a resolved rival's company, and hired or envoy companies for single battles. A late-game roster has 12 or more companies for 5 to 7 banners, so choosing who fights is a real decision every day.

## Chapter 8 — Crossings: building synergies

Every pair of buildings unlocks a Crossing: a hybrid company neither building can field alone, plus two realm-wide perks. There are six pairs with three stages each, and one grand company once all four buildings reach Tier IV. This system is unchanged from version 1 except for three perks rewritten for the new land rules (marked *v2*).

### Stages

| Stage | Requires | Reputation | Gives |
| --- | --- | --- | --- |
| I — Alliance | Both buildings at Tier II | 200 | The hybrid company, power 12 |
| II — Brotherhood | Both at Tier III | 600 | Hybrid to power 18; first perk |
| III — Legend | Both at Tier IV | 1,200 | Hybrid to power 27; second perk |

A hybrid carries both buildings' tags, so it finds a weakness in more enemies, and its power beats a pure company of the matching tier (12 vs 9, 18 vs 14, 27 vs 21).

### The six Crossings

| Pair | Hybrid I → II → III | Tags | Brotherhood perk | Legend perk |
| --- | --- | --- | --- | --- |
| Barracks + Foundry | Ironclads → Cataphracts → the Iron Legion | Steel, Engine | Shieldwall: walls count double on rings 4 and 5 | *v2* Siegebreakers: your assaults ignore fortification |
| Barracks + Mage Tower | Spellblades → Battlemages → Knights of the Veil | Steel, Arcane | Warded Steel: rally floor +5% | Oathguard: tribute on a lost battle is halved |
| Barracks + Merchant Hall | Beastcatchers → Rangers → the Royal Hunt | Steel, Coin | Bounties: victories over beasts pay double | The Royal Hunt: one beast attack a week becomes a hunt worth 60 reputation and a trophy item |
| Foundry + Mage Tower | Clay Golems → Rune Golems → Runeforged Titans | Engine, Arcane | Runed Walls: walls count double against mythics | Wardstones: mythic attacks a further 15% weaker |
| Foundry + Merchant Hall | War Wagons → Bombard Battery → Dragonfire Battery | Engine, Coin | Trade Roads: tiers and Crossings cost 10% less | *v2* Guild Charters: tiers and Crossings cost 20% less; village tithes +50% |
| Mage Tower + Merchant Hall | Alchemists → Illusionists → the Shadow Court | Arcane, Coin | *v2* Spy Network: rival raids foretold a day early and 10% weaker; rival treasuries and armies shown as numbers | Grand Illusion: one lost battle a week costs no tribute and does not contest a hex |

### Neighbors and opposites

Neighbor pairs share a between-land and rise together: Barracks + Merchant Hall (North), Mage Tower + Foundry (South), Barracks + Mage Tower (West), Merchant Hall + Foundry (East). Opposite pairs share no land and must be raised on two fronts: Barracks + Foundry (the Iron Legion) and Mage Tower + Merchant Hall (the Shadow Court). Expanding in one direction gets neighbor Crossings early; expanding evenly gets the opposites, and the Crownguard, sooner.

### The Crownguard

When all four buildings stand at Tier IV, the realm raises the Crownguard: power 40, all four tags, so it always strikes a weakness. At all four Tier V its power rises to 55. It costs nothing.

## Chapter 9 — Weight: Milestones and the Crown's Grace

Weight touches the game in three places. **Momentum** (Chapter 5) pays weekly reputation for a steady trend toward the target pace. **Milestones** unlock new content every 5 lb or so, in five tiers. **The Crown's Grace** makes the world more forgiving the longer your weight progress stays steady. None of the three ever pays more for losing faster, and none is needed to win.

### Milestones

At the founding the player records a starting weight and a goal weight. The journey is split into 10 evenly spaced Milestones.

1. **Step size.** `step = (start − goal) / 10`, rounded marks to the nearest whole pound, with the last mark equal to the goal. The step is never smaller than 3 lb or larger than 10 lb.
2. **Small goals.** If the journey is under 30 lb, steps are 3 lb, and the Milestones past the goal become *Keeping* Milestones: each one breaks after 4 straight weeks with the 7-day average within 2% of the goal.
3. **Large goals.** If the journey is over 100 lb, the 10 Milestones cover the first 100 lb in 10 lb steps, and the rest of the journey continues in the Reign without new Milestones.
4. **Lock 1, the mark.** Two weigh-ins at least 6 days apart are both at or below the mark, or the 7-day average is.
5. **Lock 2, the earliest week.** `earliestWeek = ceil(lostAtMark / (0.0075 × startWeight))`. A Milestone reached early waits for its week.
6. **Never revoked.** A broken Milestone stays broken, whatever the scale does later.
7. **The Healer's Dispensation** (on by default). After 8 straight weeks at 85% Realm Consistency or more, the next Milestone whose earliest week has passed may break on effort alone. At most one Milestone per 8 weeks can break this way.
8. **Goal changes** are allowed once every 28 days. Broken Milestones stay; the rest are recalculated. With a height given, a goal below BMI 18.5 is refused.

**Rich's campaign** (217 lb start, 168 lb goal, 49 lb journey, 4.9 lb steps):

| Milestone | Mark | Earliest week | Week at target pace | Tier | Unlocks |
| --- | --- | --- | --- | --- | --- |
| 1 | 212 lb | 4 | 7 | I | The Armory: every company can carry one item; first items for sale |
| 2 | 207 lb | 7 | 13 | I | First Wings: choose one of two Wings for each building |
| 3 | 202 lb | 10 | 19 | II | Elite companies, rank I, recruitable in each building |
| 4 | 197 lb | 13 | 26 | II | The Proving Grounds: all companies +10%; a second item slot |
| 5 | 193 lb | 16 | 31 | III | Second Wings; rank II items |
| 6 | 188 lb | 19 | 37 | III | The Healing Springs: rally floor +10%, Respite bank +1; Tier V becomes possible |
| 7 | 183 lb | 22 | 44 | IV | Elites to rank II; the Sworn, the lord's own retinue |
| 8 | 178 lb | 25 | 51 | IV | Third Wings; rank III items; the Crown Forge (+1 banner) |
| 9 | 173 lb | 28 | 58 | V | Legendary items, one per building |
| 10 | 168 lb | 31 | 65 | V | The Sovereign's Statue: +10% reputation and the title "the Steadfast"; the Crownguard Ascendant (+10 power) |

"Week at target pace" assumes exactly the easing target pace (Chapter 5): 0.8 lb a week down to 200 lb, then 0.4% of weight. Real loss usually runs faster in the first months, which is the intended head start: Milestones and the Crown's Grace arrive sooner, while Momentum stays capped. At the target pace, Milestones 1 to 7 land inside an 11-month campaign and 8 to 10 arrive in the Reign that follows victory (Chapter 14). The full contents of Wings, Elites and items are in Appendix C (spoilers).

### The Crown's Grace: forgiveness for steadiness

At each week's close the game computes **Steadiness**, the average Momentum score M over the last 8 weeks (Chapter 5). Because M includes the plateau floor, strong habits through a stall still count. The Grace needs at least 4 weeks of history and moves at most one level per week.

| Grace level | Steadiness | Effects (cumulative) |
| --- | --- | --- |
| 0 | Below 0.50 | None |
| I | 0.50 or more | Reclaim a hex lost in the last 14 days for half its garrison in reputation, no battle; a rival needs 1.6× your Power for Ascendancy instead of 1.5× |
| II | 0.70 or more | Contested hexes hold 2 days instead of 1 before falling; tribute from lost battles halved; the rivals' hidden benchmark eases by 3 points |
| III | 0.85 or more | The benchmark eases by 6 points in all; Ascendancy cannot begin before week 44 instead of 36; coalitions end 2 weeks sooner |

The player sees the Grace level and a plain description ("Fortune favors the realm"), never the benchmark numbers behind it.

## Chapter 10 — Daily combat

Every day the realm fights at least once: one threat strikes one of your hexes, any rival conquest attempt announced the day before arrives, and your own assault goes out if you ordered one. All of these resolve at day close in a fixed order. The army decides what is winnable; the day's Valor decides how much of it shows up.

### The day's threats

1. **The tidings.** At dawn the Herald names each threat, its target hex, its type and a strength band (exact numbers with Mage Tower IV or the Spy Network).
2. **The daily threat.** One per day. About 40% of days bring beasts, 20% mythics and 40% a rival raid. A rival raids more as it borders more of your land, half as often in a week it is at war with another rival, and never once it is resolved or allied.
3. **The target.** A hex's chance of being hit is weighted by ring^1.5, among hexes on your border. Raids come along the raider's border, mythics from the lair sides.
4. **Conquest attempts.** A rival at war with you may declare one conquest attempt per day on a border hex in ring 3 or beyond, announced a day ahead. These are in addition to the daily threat.
5. **The siege day.** Saturday's daily threat strikes at +40%.
6. **The early grace.** In weeks 1 and 2 all threats strike at 70% strength, in weeks 3 and 4 at 85%, and no conquest attempts are allowed before week 6.

### Threat strength

| Threat | Strength |
| --- | --- |
| Beasts | 0.9 × base(ring) |
| Mythics | 1.15 × base(ring) |
| Rival raid | max(0.8 × base(ring), 0.25 × that rival's Army value × temper) |
| Rival conquest attempt | max(1.0 × base(ring), 0.5 × that rival's Army value) |
| Base by ring 1 / 2 / 3 / 4 / 5 | 15 / 22 / 55 / 115 / 200 |

Every threat then rolls up to 15% either way (seeded). Temper: Orc 1.2, Goblin 0.9, Dwarf 1.05, Archmage 1.05. A rival's Army value is the sum of its companies' power (Chapter 12), so rivals that invest in armies hit harder as the campaign goes on.

### Types, weaknesses and resistances

| Attacker | Weak to (×1.5) | Resists (×0.6) |
| --- | --- | --- |
| Beasts (wolves, bears, giant spiders) | Steel, Coin | — |
| Mythics (wyverns, basilisks, griffins, manticores) | Arcane, Engine | Steel |
| Orc warband | Engine | Coin |
| Goblin raiders | Coin | Steel |
| Dwarf shieldwall | Arcane | Engine |
| Archmage's conjurations | Steel (cold iron) | Arcane |
| Village militia (assault targets only) | Coin | — |

A company whose tags include the weakness strikes at ×1.5; one holding only a resisted tag at ×0.6. Weakness wins when a company has both.

### Resolving a battle

```latex
\text{Army} = (1 + a)\sum_{\text{best } B} p_c\, m_c + W + F \qquad V = \frac{d + f + s}{3} \qquad \text{Defense} = \text{Army} \times \big(r + (1 - r)\,V\big)
```

- `B` is the banner count; the Marshal fields the best `B` defense-assigned companies unless the player overrides. `p` is power, including item and Wonder bonuses; `m` is the match (0.6 to 1.5).
- `a` is the Foundry's arms bonus (0% to 20%). `W` is the castle's walls plus the Foundry's. `F` = fortification level × 0.25 × base(ring) for the hex attacked.
- `V` is the day's Valor: `d` is the share of duties kept, `f` is 1 if food was logged, `s` is the week's step pace, capped at 1.
- `r` is the rally floor: 50% at the start, raised by the Barracks, Warded Steel and the Healing Springs.

**A worked battle** (from version 1, still valid). In week 16 a Dwarf shieldwall strikes a Marches hex at strength 115. The player fields 4 banners: Battlemages (18) and Rune Golems (18), both Arcane (×1.5), Wardens (14, ×1.5) and Pikemen (14, ×1). That is 89, raised 10% by Foundry III to 97.9, plus 20 walls: Army 117.9. On a full day (Valor 0.97, rally floor 55%) Defense is 116.1, a narrow win. On a poor day (Valor 0.31) it is 81.4, a loss.

### Outcomes

| Result | When | Effect |
| --- | --- | --- |
| Rout | Defense ≥ 1.5 × strength | 6 × ring spoils |
| Victory | Defense ≥ strength | 4 × ring spoils; +3 Respect with a defeated raider; a trophy item for a mythic |
| Defeat (daily threat) | Defense < strength | 3 × ring tribute; the hex is scorched for 3 days (a scorched village pays no tithe that week). Land is not lost |
| Defeat (conquest attempt) | Defense < strength | The hex becomes **Contested** for 1 day (2 at Grace II). The same force strikes again next day at the same strength. Win and the attempt is broken; lose and the hex passes to that rival at dawn |

A player can answer a contested hex by fielding more companies on defense, buying a fortification level, or paying that rival for a Truce (Chapter 6). Every battle settles once and never reruns, even when a day is corrected later.

### Settlement order at day close

1. Rival conquest attempts and the daily threat, in the order announced, using the defense pool.
2. The player's assault, using the assault pool.
3. Contested hexes that were lost pass to their attacker; captured hexes pass to the player.
4. Spoils, tribute and Respect are posted as purse and rival events.

## Chapter 11 — Grand Battles (spoilers below the triggers table)

Grand Battles are the big, hands-on fights: a rival sends a full host when you push deep into its land, a rare creature turns at bay in the deep woods, or a coalition marches on your border. They are announced days ahead so the player can prepare, then fought on a small tactical field in 5 to 10 minutes. They come about twice a month at most.

### What triggers one

| Trigger | When | Where | Warning |
| --- | --- | --- | --- |
| Incursion | You take a hex adjacent to a rival's Gate, or you hold 4 or more hexes that rival held at any point | The hex just taken | 2 days |
| The Gate | You assault a rival's Gate (Gates are never taken by daily assault) | The Gate | 2 days |
| The Capital | You assault a rival's capital while holding its Gate | The capital | 3 days |
| Mythic Hunt | You assault a Lair Mouth; or 8% of your assaults on ring 4 to 5 beast hexes in the West or East reveal a rare creature (seeded) | That hex | 2 days |
| Coalition Offensive | Within 14 days of a coalition forming (Chapter 13) | Your border hex nearest both members | 3 days |
| Siege of the Crown | A rival's Ultimatum expires (Chapter 14) | The castle | 14 days |
| Event battles | Listed in Appendix C | Varies | Varies |

Mage Tower IV adds a day of warning to every Grand Battle. No more than one Grand Battle can fall within any 5 days; later triggers queue.

### Preparation

During the warning the player can recruit, buy items, fortify and set the battle formation. The Herald shows the enemy host as bands ("a large warband with heavy cavalry"); Mage Tower IV or the Spy Network reveals the full roster.

1. **Choose companies.** Up to banners + 2 companies, never more than 6.
2. **Set the formation.** The field has 3 lanes (left, center, right) and 2 ranks (front, rear) per side. Each slot holds one company.
3. **Equip items** (Milestone 1 onward).
4. **Pick a Doctrine**, one per battle, from those your buildings grant (Appendix C). Example: *Hold the Line* (Barracks) gives front companies +20% health.

### Units on the field

| Stat | Rule |
| --- | --- |
| Power `p` | The company's power after tier, Wonder, item and Elite bonuses |
| Health `H` | 4 × p at the start of the battle |
| Reach | Melee or Ranged (each company's reach is listed in Appendix C) |
| Tags | As in daily combat; match ×1.5 / ×1.0 / ×0.6 |
| Readiness `R` | 0.6 + 0.5 × the average Valor of the last 7 days (0.6 to 1.1), for the whole battle |

Readiness is where habits enter the Grand Battle: a strong week brings an army that hits up to 83% harder than a lost week.

### A round

The battle lasts 4 rounds. Each round runs in this order:

1. **Intents.** Each enemy lane shows what it will do: *Strike* (normal), *Charge* (front deals ×1.5, takes ×1.25), *Volley* (ranged damage goes to your rear rank), *Brace* (deals ×0.5, takes ×0.5), *Shift* (moves to a neighboring lane at round end) or *Spell* (0.5 × its power to both your companies in that lane). Intents come from a seeded pattern per rival (Appendix C), so they can be learned.
2. **The Order.** The player is offered 3 Orders, drawn without repeats from a deck built from their buildings and Crossings, and plays one. Example Orders: *Shieldwall* (your fronts take −50% this round), *Volley* (your ranged deal ×1.5), *Bribe* (one non-mythic enemy company skips its action), *Arcane Ward* (cancel one enemy Spell or Volley). The full deck is in Appendix C.
3. **Reposition.** The player may swap any two of their own companies once per round.
4. **Exchange.** Simultaneously, in each lane: front companies deal `p × m × R` to the opposing front (or rear, if no front). Ranged companies in the rear deal `0.8 × p × m × R` to the opposing front. Melee companies in the rear do nothing.
5. **Rout and advance.** A company at 0 health routs and leaves the field. If a lane's front is empty, its rear company steps up.

**After round 4,** or as soon as one side has no companies left, compare each side's remaining health as a share of its starting health. Higher share wins. Winning with the enemy wiped out, or at twice the enemy's share, is a Rout.

**A worked exchange.** Center lane, round 1. Your Knights (power 21, health 84) face an Orc Brute company (power 20, health 80) whose intent is Charge. Your Crossbowmen (power 9, Engine, ranged) stand behind the Knights. Readiness is 1.0 and you play Shieldwall. The Knights deal 21 (Steel is neutral against Orcs). The Crossbowmen deal 0.8 × 9 × 1.5 = 10.8 (Orcs are weak to Engine). The Brute is at 80 − 31.8 = 48.2. The Brute's charge deals 20 × 1.5 = 30, halved by Shieldwall to 15, so the Knights are at 69.

### Rules

1. **Fight any time on the battle day.** If it is not fought by day close, the Marshal fights it automatically (strongest health in front, ranged in the rear, Orders chosen by highest immediate damage) at Readiness − 0.1.
2. **No permanent losses.** Routed companies are Wearied for 3 days (−20% power in all battles) but never destroyed.
3. **One attempt.** A Grand Battle settles once. A lost Mythic Hunt can be tried again after 7 days; a lost Gate or Capital battle can be retried after 14.
4. **Deterministic.** Given the seed, the formation and the Orders played, the result is always the same. Save the battle log so it can be replayed as an animation.

The Grand Battle screen is desktop only (the Electron app). No phone layout is needed in version 2.

### Outcomes

| Battle | Win | Loss |
| --- | --- | --- |
| Incursion | The rival loses 40% of the army value it sent; +5 Respect (they respect strength); 30 × ring spoils | The hex you just took returns to that rival |
| The Gate | The Gate is yours; the capital can be attacked | 5 × ring tribute; retry after 14 days |
| The Capital | That rival is conquered (Chapter 14) | The rival's army value +10%; retry after 14 days |
| Mythic Hunt | A unique trophy item and 150 reputation; a Lair Mouth win seals that lair | 5 × ring tribute; retry after 7 days |
| Coalition Offensive | The coalition breaks 2 weeks early; 40 × ring spoils | Your outermost hex on that border passes to the nearer member |
| Siege of the Crown | Chapter 14 | Chapter 14 |

### Enemy hosts

A rival's host has total power equal to 60% of its Army value at the moment of the warning (a coalition's host: 50% of each member's). It is built from that rival's unit list in Appendix C, filled from strongest to weakest until the power budget is spent. Mythic Hunts use fixed rosters from Appendix C, scaled by `1 + week / 52`.

## Chapter 12 — The rivals: economy and AI (spoilers)

Four rulers hold the corners of the Rim. Each earns reputation every week at a **hidden benchmark**: the income an imaginary lord would earn keeping about 80% of their terms and losing weight at exactly the target pace. A player who beats that pace out-earns them; one who falls short is out-earned, and must out-think them to keep up. Each rival spends its income according to its personality, so the same money becomes a different threat.

### The four rivals

| Rival | Realm and road | Personality | Prizes in the player | Voice |
| --- | --- | --- | --- | --- |
| Ugrak the Unbowed, Orc Warlord | The Ashen Steppe, Barracks road | Builds armies, raids 40% more often | Weeks without a lost battle | Blunt threats, grudging praise |
| Skivvet Goldtooth, Goblin Trade-Prince | The Gilded Warren, Merchant Hall road | Bids on villages, trades land, hires mercenaries | Weeks the calorie average is kept | Haggling, flattery, bad bargains |
| Emrys the Ageless, Archmage | The Veiled Vale, Mage Tower road | Saves for Rituals, raids 30% less often | Weeks every sworn duty is kept | Riddles and old warnings |
| Hrodgar Anvilborn, Dwarf Thane | Dun Kaldor, Foundry road | Fortifies everything, raids 20% less often | Weeks the step pool is met | Proverbs about stone and patience |

### The hidden benchmark

Each week every rival's income is computed from a synthetic Benchmark Lord who keeps the same Charter as the player at benchmark consistency `b`.

| Campaign weeks | b | Benchmark contract multiplier L |
| --- | --- | --- |
| 1 to 8 | 72% | 1.0 (weeks 1–2), then 1.4 |
| 9 to 20 | 78% | 1.7 from week 10 |
| 21 to 36 | 82% | 2.0 |
| 37 onward | 86% | 2.0 |

The Crown's Grace lowers `b` by 3 points at level II and 6 at level III. `b` never goes below 70%.

```latex
BI = 84b + 5P + \frac{P(P-1)}{2} + 140b + 60 + 70\,L\,f(b) \qquad P = \text{round}(7b^3)
```

Term by term: duties (12 × b × 7), perfect days (P of them, +5 each), a streak bonus as if they were consecutive, steps and calories (70 × b each), full Momentum (the benchmark always keeps the target pace), and a 7-day-equivalent contract at score b. At b = 80% and L = 1.7, BI ≈ 345 a week. A player at 90% on the same Charter earns about 396 before tithes and bonuses.

**Rival income** = BI × personal multiplier (Orc 0.95, Goblin 1.10, Dwarf 1.00, Archmage 0.95) + tithes (4 × ring per village it holds).

### What each rival tracks

| Field | Meaning |
| --- | --- |
| `treasury` | Unspent reputation |
| `companies` | Its army; **Army value (AV)** = the sum of their power |
| `hexes`, `villages`, `fortification` | Its land, as on the map |
| `respect` | 0 to 100, its regard for the player |
| `disposition` | Peace, Tension or War toward the player and toward each neighboring rival |
| `threat` | 0 to 100, how dangerous it thinks the player is |
| `status` | active, allied (Accord), abdicated (defection), conquered, or in coalition |

### The weekly rival turn

At each week's close, for each active rival in a seeded order:

1. **Earn** income into the treasury.
2. **Split the budget** (treasury above a 100 reserve) by personality.
3. **Buy army** from its unit list. Each point of power costs `10 × (1 + AV / 150)`, so armies grow quickly early and slowly late.
4. **Expand.** Choose up to one target (Goblin: two) among adjacent neutral hexes, by Dominion gained per reputation spent. Beast dens are assaulted (success if `0.5 × AV × roll(0.85–1.15) ≥ garrison`); villages are courted with a bid of `1.1 × loyalty` (Goblin `1.3 ×`), competing with any player bid.
5. **Fortify** its border hexes, outermost toward the player first (Dwarf can reach level 4 on its own hexes).
6. **Special** spending (below).
7. **Set disposition** toward the player for next week (below), and plan next week's raids and conquest attempts.
8. **Counter-bid** on villages the player is courting from it, up to 60% of its reserve (Goblin: 100%).

| Rival | Army | Expansion | Fortify | Special |
| --- | --- | --- | --- | --- |
| Orc | 55% | 25% | 10% | 10%: the Warhost fund. At 600, it launches an Incursion-style host at your border (a Grand Battle) and resets |
| Goblin | 15% | 45% | 10% | 30%: the Market. Counter-bids, buys hexes from other rivals' borders, and hires mercenaries (+15% AV for 2 weeks) for any rival at war with you |
| Dwarf | 25% | 15% | 50% | 10%: the Deep Halls. Fortifications on its own hexes cost 25% less |
| Archmage | 35% | 20% | 15% | 30%: Rituals. Every 6 weeks, at 400 saved, it casts one (Appendix C) |

### Disposition and threat

- **Threat** = `40 × min(2, playerPower / averageRivalPower) + 15 × rivalsResolved + 10` if the player borders it on 3 or more hexes, `+ 10` if the player took its land in the last 4 weeks, capped at 100.
- **Power** (for anyone) = `0.5 × treasury + 3 × AV + 10 × Σ ring of hexes held`. The player's AV counts only their best (banners + 2) companies.
- **War** if Threat ≥ 60, or the player took its land in the last 2 weeks, or it is in a coalition against the player. **Peace** if Respect ≥ 50 and no hostile act either way in 4 weeks. Otherwise **Tension**.
- Raids happen only in Tension or War. Conquest attempts happen only in War, from week 6, and only when `0.5 × AV ≥ 0.8 ×` the player's expected defense on the target.

### Respect

| Event | Respect |
| --- | --- |
| You defeat one of its raids | +3 |
| A week of the habit it prizes | +4 |
| You win an Incursion against it | +5 |
| A trade or Truce with it | +2 |
| You sell it a hex | +5 |
| You lose to one of its raids | −2 |
| A village courted away from it | −3 |
| A hex conquered from it | −5 |

| Respect | Effect |
| --- | --- |
| 25 | Its raids strike 10% weaker; Goblin will trade |
| 40 | Non-aggression pacts possible |
| 50 | Its envoy offers its company for hire at 25 a battle; hex trades possible |
| 60 | Accord talks open (Chapter 14); Calls to arms possible |
| 75 | Its Accord is easier (Chapter 14) |

### Rivals at war with each other

The four Rim fronts (North: Orc–Goblin; South: Archmage–Dwarf; West: Orc–Archmage; East: Goblin–Dwarf) are each at Peace, Tension or War every week, from the seed and the tempers (fronts touching the Orc go to war about 40% of weeks, others about 25%). At war, one skirmish a day moves the front's track one step toward the winner, from −3 to +3. Each week at war costs both sides 5% of their AV. A rival holding +3 is **Emboldened** (+15% raid strength next week); one pinned at −3 is **Humbled** (−15%). Rivals take each other's land only in Border Campaigns (below), and never each other's Gates or capitals.

### Border Campaigns: rivals taking each other's land

Rarely, one rival takes a hex from another. It happens only in preselected weeks, so the world shifts in ways the player can't predict but the developer can balance. Expect 2 to 6 hexes to change hands this way in a campaign.

1. **The schedule.** Border Campaign weeks are fixed at the founding: week 10, then every 8 weeks (18, 26, 34, 42, 50 and on), each shifted by a seeded −1 to +1 week. The schedule is hidden.
2. **Who attacks.** On each front at War in a Border Campaign week, the rival whose front track stands at +2 or more attacks the other. Fronts at Peace or Tension do nothing. Two rivals in a coalition with each other never attack each other.
3. **The target.** One hex the loser holds that touches the attacker's land; if none does, the loser's hex nearest their shared battlefield. Never a Gate, a capital or a hex the player holds.
4. **Resolution.** The hex is taken if `0.5 × attackerAV × roll(0.85–1.15) ≥` its garrison. Win or lose, both rivals lose 5% of their AV.
5. **The news.** The Herald reports the result at the next dawn ("Ugrak's banners fly over a Goblin village"). Respect toward the player does not change.
6. **Defection still needs the player.** Villages a rival loses this way count toward it holding none, but at least half of its villages must still have been won by the player through influence or trade (Chapter 14).

### What the player sees

No rival number is shown directly. Treasuries appear as Meager (under 300), Modest (under 800), Prosperous (under 2,000) or Mighty. Armies appear relative to yours: Weaker, Matched, Stronger or Overwhelming. The Herald passes on rumors ("Hrodgar's masons work through the night") that hint at spending. The Spy Network shows treasuries and armies as numbers; nothing ever shows the benchmark or the rival's income.

## Chapter 13 — The living world: alliances and events (spoilers)

The world reacts to the player. When you grow strong or bring a rival down, the others take notice and band together. A deck of world events fires when hidden criteria are met, so the campaign feels alive even though every rule is a threshold and every roll is seeded. The player learns of each event only when the Herald announces it.

### Coalitions

A coalition is two rivals acting as one against the player for a set time.

| Trigger | Who joins | Lasts |
| --- | --- | --- |
| **The First Fall:** the player resolves their first rival, by any method | The two remaining rivals with the highest Threat. The third becomes *the Watcher*: Threat +10, stays independent | 10 weeks |
| **The Last Alliance:** the player resolves their second rival | Both remaining rivals, unless the player holds Respect 60 or more with one of them; that one refuses and stays at Tension | Until one of them is resolved |
| **The Rising Crown:** before any rival is resolved, the player's Power is 1.5× or more the average rival Power for 3 weeks in a row | The two rivals that border the player's strongest direction | 6 weeks |

No coalition can form before week 12, and three rivals never ally at once. The Crown's Grace III shortens every coalition by 2 weeks.

**While a coalition stands:**

1. Both members are at War with the player, and their shared front is at Peace.
2. Each puts 10% of its income into a shared war chest. Within 14 days of forming, the chest funds a **Coalition Offensive**, a Grand Battle on the player's border (Chapter 11).
3. Both raid 25% more often.
4. A Goblin member hires mercenaries for its partner every 4 weeks.

**Breaking a coalition:** win the Coalition Offensive (it ends 2 weeks early); pay one member 300 reputation at Respect 40 or more to walk away; or wait for betrayal, a seeded 15% chance each week that a member with Respect 50 or more toward the player leaves.

### When a rival falls

| How it was resolved | What happens to its land | What happens to the world |
| --- | --- | --- |
| Conquered | Its capital and realm become ruins; its remaining hexes turn neutral with village loyalty halved | Threat toward the player +15 from every rival; *the Pretender* event can fire (Appendix C) |
| Abdicated (defection) | Its remaining hexes pass to the player | Threat +10 from every rival; the Goblin, if active, offers to buy one of them |
| Allied (Accord) | It keeps its land and stops expanding toward the player | Threat +5; it may join the player's side in one Grand Battle a month |

### The world-event deck

Events fire at week close when their hidden criteria are met, at most one new event per week (Grand Battles from events queue as in Chapter 11). Each fires once per campaign unless marked *recurring*. The full deck, with criteria, effects and Herald lines, is in Appendix C. It contains four kinds:

1. **Rival events,** driven by a rival's state: Ugrak's Challenge, the Goblin's Grand Auction, Emrys's Long Night, the Dwarf's Deep Call.
2. **World events,** driven by the map: the Beast Surge, the Hungry Winter, the Dragon Wakes.
3. **Reactions to the player,** driven by the player's choices: the Pretender, Fear of the Crown, the Village Uprising.
4. **Opportunities,** driven by good play: the Wandering Order, a Merchant Caravan, the Lost Heir.

Events never take land in rings 0 to 2, never end the campaign by themselves, and always announce a Grand Battle at least 2 days ahead.

## Chapter 14 — Winning and losing

The player wins by resolving all four rivals, each in the way they choose: conquer it, win its people away, or sign an Accord. A rival wins by out-growing the player late in the campaign and then breaking the castle in a final siege. Defeat is impossible before week 36, and the Crown's Grace pushes it further away for a steady player.

### Three ways to resolve a rival

| Way | How | Requires | The rival afterward |
| --- | --- | --- | --- |
| **Conquest** | Win the Gate Grand Battle, then the Capital Grand Battle | Holding the Gate before the Capital | *Conquered.* Gone from the map. Its company (power 24) joins your roster as a vassal levy |
| **Defection** | Win its villages until it holds none, at least half of them by influence or trade | Courting a Gate village needs twice the usual resistance | *Abdicated.* Its remaining land and its company pass to you |
| **Accord** | Raise Respect to 60, then complete a 30-day Accord contract | Castle Tier III; the rival not in a coalition | *Allied.* Stops raiding, its company joins free, and it may fight beside you in one Grand Battle a month |

**The Accord.** It is sealed like any contract (Chapter 4) and uses the same score. While it runs, that rival makes no raids or conquest attempts. At the end, Respect rises by `50 × f(Q)` (`60 × f(Q)` if Respect was 75 or more at the start). The Accord is signed when Respect reaches 100; otherwise it can be sealed again. A 30-day Accord at Q = 90% from Respect 60 adds 41.7, which signs it.

**Pacing rules.** No rival can be resolved before week 12, and no more than one rival can be resolved in any 8 weeks. The earliest possible victory is therefore week 36.

### Victory

With all four rivals resolved, the castle becomes the High Throne and the campaign is won. The Chronicle closes with a record of days kept, hexes held, Realm Consistency, Milestones, battles and how each rival fell. The realm continues as **the Reign**: the player may keep playing for the remaining Milestones, the lairs and Tier V. New realms after victory are out of scope for version 2.

### Defeat: a rival's Ascendancy

1. **The clock.** From week 36 (week 44 at Grace III), a rival enters Ascendancy when its Power is at least 1.5× the player's (1.6× at Grace I or higher) at 4 week closes in a row. A coalition's members add their Power together for this test.
2. **The warning.** From week 32, the Herald warns whenever any rival's Power passes 1.3× the player's.
3. **The Ultimatum.** Ascendancy starts a 14-day Ultimatum. On day 14, the Siege of the Crown is fought at the castle: a Grand Battle against a host worth 70% of the rival's AV (a coalition sends both). Walls count in full.
4. **Averting it.** The Ultimatum is lifted if, at any week close before the siege, the ratio drops below 1.3×. Once per campaign the player may also **bend the knee**: pay 25% of that rival's treasury estimate (shown as a price) to delay the siege by 4 weeks.
5. **Winning the siege.** The rival is Humbled: AV −50%, Respect +10, and it cannot enter Ascendancy again for 8 weeks.
6. **Losing the siege.** The campaign ends: *the Fall of the realm*. The Chronicle records it honestly and without shame. For version 2 the Fall is final; an exile continuation from the protected core may be explored later.
7. **Absence.** A siege can never fall within 7 days of the player returning from 14 or more days away. The Ultimatum waits.

Rings 0 to 2 are never taken by any rival at any point, including during an Ultimatum. The only way to lose the castle is to lose the Siege of the Crown.

## Chapter 15 — Pacing, balance and the simulation plan

A very consistent player should win in about 44 to 48 weeks and rarely lose. A player near the benchmark should feel constant pressure and win only by playing well. A player well below it should be out-built and, after week 36, usually lose. The numbers below are a closed-form estimate; version 1's simulation must be rebuilt for the v2 rules before any number is locked.

### Income against the benchmark (estimate)

Behavior income only, over the first 48 weeks: no tithes, spoils or Merchant Hall bonus on either side. Computed with the formulas in Chapters 4, 5 and 12.

| Player | Consistency | Weight trend | Player income | Rival income | Ratio |
| --- | --- | --- | --- | --- | --- |
| Steadfast | 89% | 0.8 lb/wk | 19,091 | 16,754 | 1.14 |
| Steadfast on a long plateau | 89% | 0 lb/wk | 17,939 | 16,754 | 1.07 |
| Committed | 79% | 0.6 lb/wk | 15,467 | 16,754 | 0.92 |
| Wavering | 65% | 0.4 lb/wk | 11,488 | 16,754 | 0.69 |

The gap narrows late on purpose. In week 4 a Steadfast player earns 374 a week to the benchmark's 292 (+28%); by week 40 it is 409 to 386 (+6%). The early lead lets a good player get ahead; the late squeeze is where choices decide the campaign. A plateau with strong habits still out-earns the rivals, so the scale never decides the game alone.

### Targets the simulation must hit

| Profile | Win, median week | Win within 70 weeks | Loss to Ascendancy |
| --- | --- | --- | --- |
| Perfect (100%, 0.8 lb/wk) | 36 to 40 | 100% | 0% |
| Steadfast (89%, 0.8 lb/wk) | 44 to 48 | 95% or more | Under 5% |
| Committed (79%, 0.6 lb/wk) | 52 to 62 | 60 to 75% | 20 to 35% |
| Wavering (65%, 0.4 lb/wk) | Rarely | Under 15% | 60 to 80% |
| Casual (48%, 0.2 lb/wk) | Never | 0% | 85% or more |

Also: no profile loses before week 36; a Steadfast player averages 1 to 3 Grand Battles a month; and a Steadfast player sees at least one coalition in 80% of campaigns.

### How to simulate

1. **Behavior.** Reuse version 1's profiles (duties kept, step pace, food-logging rate, rough weeks 1 in 6 to 1 in 12), and add a weight trend per profile with ±1.5 lb weekly noise and one 3-week plateau every 12 weeks.
2. **The player's AI.** Greedy, in this order each week: buy the cheapest tier that unlocks a new company or Crossing; court any village where `Offer ≥ Resistance` is affordable; assault the adjacent hex with the best Dominion per garrison point that the assault pool can beat; fight Grand Battles with the Marshal's default orders. Then run a second, smarter policy (the same plus Truces before Ultimatums, and Accords with the highest-Respect rival) to measure how much skill is worth. Skill should be worth 10 to 20% of finishing time.
3. **The rivals' AI** exactly as in Chapter 12.
4. **Runs.** 300 seeded campaigns per profile, 70-week horizon. Report finish week, loss week, hexes held by month, Grand Battles fought and won, coalitions formed and the income ratio.

### The levers

| Lever | Default | Effect of raising it |
| --- | --- | --- |
| Benchmark consistency `b` by phase | 72 / 78 / 82 / 86% | Harder for everyone; the biggest single difficulty dial |
| Army cost `10 × (1 + AV/150)` | 10 and 150 | Weaker rival armies, fewer losses to raids and hosts |
| Ascendancy ratio | 1.5× | Fewer losses for Committed and Wavering players |
| Host share of AV | 60% | Harder Grand Battles |
| Payout curve start | 40% | Lower payouts at low consistency |
| Tier IV Dominion | 68 | Longer campaign |

### Invariants that must survive any retuning

1. No reward grows with the speed of weight loss beyond the target pace.
2. No loss state before week 36, and rings 0 to 2 are never lost.
3. A battle settles once and never reruns.
4. Every reputation event traces to a behavior, a battle or land held.
5. A plateau week at 85% consistency or more earns at least 60% of Momentum.

## Chapter 16 — Wellbeing guardrails

Fiefdom rewards steady habits and never rewards harm. Version 2 adds real stakes, so it also adds guardrails for them: losing is a game event only, never touches health records, and never arrives early or while the player is away. No rule pays more for eating less, losing weight faster or training through illness.

| Risk | Guardrail | Where it lives |
| --- | --- | --- |
| Crash dieting | The Charter refuses a calorie limit below the Healer's floor (Chapter 4), calculated from the player's own logs and never below 1,200 kcal, without confirmed medical supervision. The Table score tops out at 100%, so eating under the limit earns nothing extra. Logged days under 90% of the floor count as over budget, and a two-week logged average under the floor brings a gentle Healer check-in | Charter validation; contract scoring |
| Losing weight too fast | Momentum is capped at the target pace (default 0.8 lb a week, never above 0.75% of body weight). A 28-day trend over 1% a week holds Momentum at half and pauses Milestones until it slows, with a check-in. Milestones wait for their earliest week | Chapters 5 and 9 |
| Plateaus and water weight | The plateau floor keeps 30 to 60% of Momentum while habits hold; the Healer's Dispensation can break a stalled Milestone on effort | Chapters 5 and 9 |
| Weight regain | Milestones are never revoked; Momentum never goes negative; the Crown's Grace falls at most one level a week | Chapters 5 and 9 |
| An unsafe goal | With a height given, a goal below BMI 18.5 is refused | The founding |
| Overtraining | The step score caps at the pool; the pool caps at 200,000 a week | Charter; scoring |
| Illness and travel | Respite days pause contracts without penalty; the Steward reminds the player Respite exists when a rough patch shows | Chapter 4 |
| Fear of losing | No loss before week 36; the protected core can never fall; every Ultimatum gives 14 days' warning and several ways out; the Grace pushes defeat further away for steady players | Chapter 14 |
| Coming back after an absence | Land in rings 0 to 2 is safe; no siege within 7 days of returning from 14+ days away; the first screen says what held and what happened, plainly; the Steward suggests a short contract | The Homecoming screen |
| Shame | Lost battles, lost hexes and even the Fall are told as chronicle, not judgment. Broken streaks end quietly | All copy |
| Compulsive checking | The daily loop is 2 to 5 minutes; at most two notifications a day (dawn tidings, evening reminder) plus Grand Battle warnings, all optional | Settings |
| Paying or rushing | Nothing can be bought with money and no timer can be skipped | Pillar 7 |
| Privacy | The ledger, weigh-ins and goals stay on the player's computer; Fitbit tokens stay encrypted by Windows | `%APPDATA%\Fiefdom` |

Suggested duties offered at the founding are all additive habits: sleep by a set time, drink water, stretch, read, cook at home. The game never suggests skipping meals.

## Chapter 17 — Look, feel and writing

Fiefdom looks like a classic hand-painted fantasy strategy game: chunky, cartoonish and warm, in the spirit of Warcraft but entirely original. The interactions with NPCs are similar to what one would see in Civ 6. One liners coded in the personality of the person I'm talking to, but very straightforward and to the point. For example, if the Orc is surrendering a tile, he will be very aggressive and mean-spirited but he will not say more than a sentence or two about it.

### Art direction

- **Shapes.** Exaggerated proportions: big hands, broad shoulders, oversized weapons and armor. Buildings are squat and top-heavy. Every unit and building must read as a silhouette at 48 px.
- **Surfaces.** Hand-painted textures with visible brushwork, lit from the top left. No photorealism and no flat vector art.
- **Color.** Saturated and warm, with one banner color per owner (table below) used on borders, tokens and flags.
- **Map.** A tilted top-down board that looks like a painted tabletop. Borders are thick lines in the owner's color; contested hexes show torches, scorched hexes are charred.
- **Interface.** Carved wood and stone frames with gold trim, parchment panels and wax seals on contracts. A chunky serif display font for titles and a plain sans-serif for every number.
- **Big moments.** Milestones, Grand Battle results, coalitions and victory or defeat each get a full-screen painted card. Weight Milestones matter most and get the most care.

| Owner | Banner color | Look |
| --- | --- | --- |
| Player | Vibrant red and gold | A young crowned lord; stone keep and red/gold pennants |
| Ugrak (Orc) | Blood-like Crimson | Green-skinned warlord; iron, bone and hide |
| Skivvet (Goblin) | Ochre yellow | Wiry merchant-boss; brass, patchwork and coin |
| Hrodgar (Dwarf) | Bronze | Stout forge-king; carved stone, runes and steel |
| Emrys (Archmage) | Violet | Robed sorcerer; floating towers and starlight |
| Neutral | Grey-brown | Villages, wilds and beasts |

**Originality rule.** Warcraft is the reference for mood only. Use no Blizzard art, logos, names, characters, fonts or interface frames, and no traced or closely copied designs. Image prompts never name Blizzard games or their artists. This keeps the game legally safe to share.

**Sourcing.** Pick one route and keep it for the whole game, so styles don't clash:

1. Licensed 2D asset packs in a hand-painted fantasy style.
2. Generated images from one locked style sheet: a style paragraph plus 3 to 5 approved reference images, reused for every asset.
3. Commissioned art.

Whichever route, each new asset is checked side by side against the style sheet before it goes in.

**Placeholders first.** The game must run with simple placeholder art (colored hexes, lettered tokens), so art never blocks code. Real art drops in by file name from `assets/`, listed in `assets/manifest.json`.

| Asset | How many | Where it shows |
| --- | --- | --- |
| Hex terrain | One set per terrain in Chapter 3, plus contested and scorched overlays | Map |
| Buildings | 4 buildings × 5 tiers = 20 | Castle screen |
| Castle | One per castle tier (Chapter 7) | Map center, castle screen |
| Rival portraits | 4 rulers × 3 moods (calm, angry, humbled) = 12 | Diplomacy, reports |
| Companies | One token and one portrait per unit line (Appendix C) | Army, battles |
| Elites, mythics, the Dragon, the Wild Hunt | One portrait each (Appendix C) | Grand Battles |
| Items | One icon per Armory item (Appendix C) | Armory |
| Banners | 6, one per owner | Map, battles |
| Event cards | One per event (Appendix C) | World events |
| Milestone scenes | 10 | Unlock moments |
| Interface kit | Frames, buttons, parchment, seals, resource icons | Everywhere |

### Writing

AI tools build the code, not the story text. The developer's tools must never invent flavor text; where a line is missing, the game shows its placeholder.

- **Where text lives.** All player-facing text sits in `data/text/*.json`, keyed by id and separate from the rules. Writing can be added or changed at any time without touching game logic.
- **Placeholders.** Each slot has a plain template filled from game facts, for example "Ugrak's raiders attacked hex 3-4. You held. Lost 6 power." Placeholders alone are enough to play the whole campaign.
- **The Healer is different.** Healer check-ins (Chapter 16) are health messages. They stay plain, kind and direct, with only a light in-world voice, and Rich approves each one.

| Slot | How many | Length |
| --- | --- | --- |
| Healer check-ins | One per guardrail in Chapter 16 | 1 to 3 sentences |
| Milestone unlocks | 10 | 3 to 4 sentences |
| Rival voice lines | 4 rivals × about 12 moments (greeting, warning, raid, defeat in battle, Accord offered, Ultimatum, defection, fall) | 1 to 2 sentences each |
| Event cards | One per event (Appendix C) | Title and 2 to 3 sentences |
| Coalition announcements | 3 | 2 to 3 sentences |
| Ultimatum, Siege, Victory, the Fall | 4 | A short paragraph each |
| Crossings | 6 | Name and 2 sentences |
| Units and items | One per Appendix C entry | 1 sentence |
| Daily battle reports | About 20 templates | 1 to 2 sentences |

Write in that order: the Healer and Milestones first, because they matter most to motivation and safety, then the rivals' voices, then everything else.

## Appendix A — Data model and implementation map

The game sits beside the existing ledger, not inside it. The ledger keeps recording each day; a new `campaign.json` beside `ledger.json` holds the game state, written by the same atomic writer. All game logic lives in pure, deterministic modules under `lib/game/` so it can be unit-tested and run headless by the simulator.

There is no import step. At each 04:00 day close, the campaign reads the closed day straight from `ledger.json` (steps, calories, food logging, duties and weigh-ins). Whatever Rich logs in the ledger is in the game the next morning.

### Core types (TypeScript)

```ts
type Owner = 'player' | 'orc' | 'goblin' | 'dwarf' | 'archmage' | 'neutral';
type Tag = 'steel' | 'coin' | 'arcane' | 'engine';

interface Campaign {
  id: string; seed: number; ruleVersion: string;
  startDate: string; timeZone: string;
  startWeight: number; goalWeight: number; heightCm?: number;
  sex?: 'male' | 'female'; birthYear?: number;   // optional; only to bootstrap the Healer's range
  unit: 'lb' | 'kg'; targetPace: number;        // lb per week, default 0.8
  status: 'active' | 'won' | 'fallen';
}

interface Charter { stepPool: number; calorieLimit: number; calorieFloor?: number; duties: string[] }

interface HexState {
  id: string; q: number; r: number; ring: number;
  kind: 'castle' | 'building' | 'road' | 'between' | 'gate' | 'lairMouth' | 'capital' | 'realm' | 'lair' | 'battlefield';
  owner: Owner; garrison: number; garrisonDamage: number;   // damage resets at week close
  village?: { loyalty: number; settlingUntil?: string };
  fortification: 0 | 1 | 2 | 3 | 4;
  status: 'held' | 'contested' | 'scorched'; statusUntil?: string;
}

interface Company {
  id: string; name: string; source: 'building' | 'crossing' | 'elite' | 'crownguard' | 'vassal' | 'ally' | 'hired' | 'sworn';
  power: number; tags: Tag[]; reach: 'melee' | 'ranged';
  items: string[]; wearyUntil?: string;
}

interface LandContract {
  id: string; termDays: 1 | 3 | 7 | 14 | 30; kind: 'standard' | 'accord'; rival?: Owner;
  pledge: number; charter: Charter; startDate: string; endDate: string;
  respiteDays: number; status: 'queued' | 'active' | 'paid' | 'withdrawn'; score?: number;
}

interface DailyOrders { date: string; assaultTarget?: string; assault: string[]; defense: string[] }

interface Courtship { hexId: string; bid: number; placedOn: string; rivalBids: Partial<Record<Owner, number>> }

interface RivalState {
  rival: Owner; treasury: number; companies: Company[];
  respect: number; threat: number;
  disposition: Record<string, 'peace' | 'tension' | 'war'>;   // 'player' and neighbor rivals
  status: 'active' | 'allied' | 'abdicated' | 'conquered';
  ascendancyStreak: number; ultimatumUntil?: string; humbledUntil?: string;
  specialFund: number; frontTracks: Record<string, number>;  // −3..+3
}

interface Coalition { members: Owner[]; trigger: 'firstFall' | 'lastAlliance' | 'risingCrown'; until?: string; warChest: number }

interface GrandBattle {
  id: string; trigger: string; hexId: string; announcedOn: string; battleDate: string;
  enemy: Company[]; formation?: Record<string, string>; doctrine?: string;
  log?: BattleRoundLog[]; result?: 'rout' | 'victory' | 'defeat';
}

interface PurseEvent { id: string; date: string; kind: 'earn' | 'pledge' | 'return' | 'spend' | 'spoils' | 'tribute' | 'tithe' | 'adjust'; amount: number; source: string }
interface WeighIn { date: string; weight: number }
interface MilestoneState { index: number; mark: number; earliestWeek: number; brokenOn?: string; byDispensation?: boolean }
interface WorldEvent { id: string; firedOn: string; data: unknown }
```

### New modules

| Module | Responsibility |
| --- | --- |
| `lib/game/rules.ts` | The versioned tuning table (Appendix B); nothing else holds a number |
| `lib/game/rng.ts` | `draw(seed, date, label)` on top of the FNV-1a `hashSeed` in `contracts.ts` |
| `lib/game/map.ts` | Builds the 127 hexes, roads, between-lands, starting ownership and seeded villages |
| `lib/game/score.ts` | Contract score Q, Valor, Realm Consistency |
| `lib/game/economy.ts` | Daily and weekly reputation, Momentum, tithes, the benchmark `BI` |
| `lib/game/land.ts` | Assaults, courtships, trades, contested hexes, Dominion |
| `lib/game/combat.ts` | Daily battle resolution |
| `lib/game/grand.ts` | Grand Battle state machine: triggers, warnings, rounds, Marshal autoplay |
| `lib/game/rivals.ts` | The weekly rival turn, disposition, threat, Respect, rival-vs-rival fronts |
| `lib/game/world.ts` | Coalitions, the event deck, Ascendancy and Ultimatums |
| `lib/game/weight.ts` | Trend, the easing target pace, Milestones, the Crown's Grace, the Healer's calorie range |
| `lib/game/settle.ts` | Runs the settlement order below; idempotent |
| `sim/` | Headless simulator using the same modules (Chapter 15) |

### Changes to existing code

| Area | Change |
| --- | --- |
| `lib/dates.ts` | Keep; add 04:00 campaign-day helpers |
| `lib/ledger.ts` | Keep day and duty operations; game contracts never burn; old contracts stay readable |
| `lib/contracts.ts`, `lib/reputation.ts` | Keep for the Archive's legacy cards and the Chronicle's daily view |
| `state/store.ts` | Add a campaign store; settlement runs at launch and at 04:00 |
| `main/ledgerFile.ts` | Reuse for `campaign.json` |
| `main/health.ts` | Keep as is. Weigh-ins are typed into the ledger by hand; no body-weight sync in version 2. Fitbit's calories burned is read only to bootstrap the Healer's range |
| `pages/` | Add Realm (hex map, orders), Diplomacy (rivals, courtships, trades), Battle (Grand Battle screen), Armory (items, Wings); the Contract page seals any length; the Chronicle shows tidings and Valor |

### Settlement order

**At each day's close, for each unsettled day in order:**

1. Sync Fitbit if connected.
2. Score the active contract so far; settle duties, perfect day and streak.
3. Resolve combat in the order of Chapter 10 (defense, then assault, then hex transfers).
4. Auto-resolve any Grand Battle due that day and not fought.
5. Expire Weary, scorched and contested timers.
6. If a contract ends today, pay it and start any queued contract at the next dawn.

**At each week's close, additionally:**

1. Step pool, calorie average, flawless bonus, Momentum, tithes.
2. Resolve courtships (player and rival bids together).
3. Weight: trend, target pace, Milestones, Steadiness, the Crown's Grace and the Healer's calorie range.
4. The rival turn for each active rival (Chapter 12), then rival-vs-rival fronts, then Border Campaigns in a Border Campaign week.
5. World: coalition triggers and expiry, the event deck, Ascendancy streaks and Ultimatums.
6. Reset garrison damage; draw next week's threat schedule.

Post every result as an event and save once. Settling the same period twice must change nothing.

### Suggested build order

1. Map, ownership and the purse, with contracts paying on the new curve.
2. Daily combat and the daily assault.
3. Courtships, trades and Diplomacy.
4. Rivals' weekly turn and the hidden benchmark.
5. Weight: Momentum, Milestones, Grace.
6. The simulator; tune against Chapter 15 before going further.
7. Grand Battles.
8. Coalitions, events, Ascendancy and the Siege.
9. The Armory, Wings and Elites (content from Appendix C).

### Tests to write first

1. The Chapter 4 worked example pays 80.5, and its pledge returns 115.0.
2. The Chapter 4 Healer example gives TDEE 2,550 and a floor of 1,550.
3. The Chapter 10 worked battle gives 116.1 on a full day and 81.4 on a poor one.
4. The Chapter 11 worked exchange leaves the Brute at 48.2 and the Knights at 69.
5. `BI(b = 0.80, L = 1.7)` ≈ 344.5.
6. The target pace is 0.80 lb at 217 lb, 0.72 at 180 and 0.68 at 170.
7. The map has 127 hexes, 86 claimable, 12 rival-held at the founding and 30 villages, with no two villages adjacent.
8. Rich's Milestones round to 212, 207, 202, 197, 193, 188, 183, 178, 173, 168, with earliest weeks 4, 7, 10, 13, 16, 19, 22, 25, 28, 31.
9. Settlement is idempotent; reloading never changes a battle, a courtship, a rival turn, a Border Campaign or an event.
10. No loss state can occur before week 36; no ring 0 to 2 hex ever changes owner; no Border Campaign ever targets a Gate, a capital or a player hex.

## Appendix B — Tuning table

Every number in this book lives here and in `lib/game/rules.ts`. Change values between campaigns, never during one, and rerun the simulation after any change to the benchmark, the army cost, the payout curve or the threat curve.

| Area | Parameter | Default |
| --- | --- | --- |
| Clock | Day close; correction grace; founding grant | 04:00; 1 day; 100 |
| Contracts | Lengths and unlocks | 1, 3 (start); 7 (any Tier II); 14 (Castle II); 30 (Castle III) |
| Contracts | Length multiplier L for 1 / 3 / 7 / 14 / 30 days | 1.00 / 1.15 / 1.40 / 1.70 / 2.00 |
| Contracts | Payout | 10 × days × L × f(Q); f(Q) = clamp((Q − 0.40) / 0.60) |
| Contracts | Pledge cap; return | 10 × days; pledge × 2 × f(Q) |
| Contracts | Withdrawal | 10 × daysElapsed × f(Q); half the pledge back |
| Respite | Earn rate; bank | 1 per 7 days; 4 (5 Mage Tower III, 6 Tier V, +1 Healing Springs) |
| Reputation | Daily | Duties 12; perfect day +5; streak +1 a day up to +7 |
| Reputation | Weekly | Steps 70; calories 70; flawless +50; Momentum 60 × M; tithes 4 × ring per village |
| Reputation | Merchant Hall bonus, Tiers I–V | +2 / 5 / 8 / 12 / 15% |
| Momentum | Trend window; target pace T | 21 days, 2+ weigh-ins 6+ days apart; T = min(0.8 lb, 0.4% of 7-day average weight); cap settable 0.3 to 1.0 lb |
| Momentum | Plateau floor | 0.6 at 85%+ consistency; 0.3 at 75%+ |
| Momentum | Too-fast hold | 28-day trend over 1% of weight a week → Mw held at 0.5 |
| Milestones | Count; step; earliest week | 10; journey / 10 (3 to 10 lb); ceil(lost / (0.0075 × start)) |
| Milestones | Dispensation | 8 weeks at 85% RC; at most one per 8 weeks |
| Grace | Steadiness thresholds I / II / III | 0.50 / 0.70 / 0.85 (8-week average M, 4+ weeks of data) |
| Buildings | Tier II / III / IV / V Dominion | 8 / 24 / 68 / 68 |
| Buildings | Tier II / III / IV / V cost | 150 / 450 / 1,100 / 1,800 |
| Buildings | Pure company power, Tiers I–V | 5 / 9 / 14 / 21 / 30 |
| Castle | Tiers II / III / IV: tier sum; cost | 8 / 12 / 16; 250 / 750 / 1,500 |
| Castle | Banners I–V; walls I–V | 2 / 3 / 4 / 5 / 6; 4 / 8 / 14 / 22 / 30 |
| Crossings | Stage cost; hybrid power | 200 / 600 / 1,200; 12 / 18 / 27 |
| Crownguard | Power | 40 (all Tier IV), 55 (all Tier V), +10 at Milestone 10 |
| Land | Base garrison, rings 1–5 | 15 / 22 / 55 / 115 / 200 |
| Land | Garrison multipliers | Beasts 0.9; village militia 0.6; fortification +0.25 × base per level |
| Land | Fortification cost, levels 1 / 2 / 3 | 15 / 35 / 70 × ring |
| Land | Repulse wear; Weary | 25% of Assault off the garrison until week close; −20% for 1 day |
| Influence | Trust | clamp(0.6 + 0.6 × RC, 0.6, 1.2) |
| Influence | Village loyalty | Neutral 15 × ring; rival 30 × ring + counter-bid; Gate ×2 |
| Influence | Failed bid | 50% refunded; loyalty −10% of Offer |
| Trade | Hex price | 50 × ring × greed (×1.5 village); greed Orc 1.5, Goblin 1.2, Dwarf 2.0, Archmage 1.4 |
| Trade | Truce; pact; call to arms | 30 × max ring bordered; 250; 200 |
| Combat | Threat mix | Beasts 40%, mythics 20%, raids 40% |
| Combat | Strength | Beasts 0.9, mythics 1.15 × base; raids max(0.8 × base, 0.25 × AV × temper); conquest max(base, 0.5 × AV); ±15% roll |
| Combat | Temper | Orc 1.2, Goblin 0.9, Dwarf 1.05, Archmage 1.05 |
| Combat | Siege day; early grace | +40%; 70% weeks 1–2, 85% weeks 3–4, no conquest before week 6 |
| Combat | Match; rally floor | 1.5 / 1.0 / 0.6; 50%, up to 65% (+5% Warded Steel, +10% Healing Springs) |
| Combat | Spoils; tribute | 4 × ring (6 × rout); 3 × ring |
| Grand Battles | Health; ranged; Readiness | 4 × power; 0.8 × from rear; 0.6 + 0.5 × 7-day Valor |
| Grand Battles | Rounds; Orders offered; spacing | 4; 3 per round; 1 per 5 days |
| Grand Battles | Host size | 60% of AV (coalition 50% each; siege 70%) |
| Rivals | Benchmark b by weeks 1–8 / 9–20 / 21–36 / 37+ | 72 / 78 / 82 / 86%; −3 at Grace II, −6 at Grace III; floor 70% |
| Rivals | Income multiplier | Orc 0.95, Goblin 1.10, Dwarf 1.00, Archmage 0.95 |
| Rivals | Army cost per power point | 10 × (1 + AV / 150) |
| Rivals | Budget split (army / expand / fortify / special) | Orc 55/25/10/10; Goblin 15/45/10/30; Dwarf 25/15/50/10; Archmage 35/20/15/30 |
| Rivals | Raid frequency | Orc ×1.4; Goblin ×1.0; Archmage ×0.7; Dwarf ×0.8 |
| Rivals | War with player | Threat ≥ 60, or land taken in 2 weeks, or coalition |
| Respect | Gains and losses | +3 raid won, +4 prized week, +5 Incursion won, +2 trade/Truce, +5 hex sold; −2 raid lost, −3 village courted, −5 hex conquered |
| World | Coalitions | Not before week 12; First Fall 10 weeks; Rising Crown 6 weeks; betrayal 15% a week at Respect 50+; buyout 300 at Respect 40+ |
| World | Resolution pacing | No rival before week 12; one per 8 weeks |
| Defeat | Ascendancy | From week 36 (44 at Grace III); 1.5× Power (1.6× at Grace I+) for 4 weeks; 14-day Ultimatum; lifted below 1.3× |
| Defeat | Power | 0.5 × treasury + 3 × AV + 10 × Σ rings held |
| Healer | Calorie range | TDEE = 21-day logged average + trend × 3,500 / 7; range TDEE − 1,000 to TDEE − 500; floor ≥ 1,200; moves ≤ 100 kcal a week; days under 90% of floor count as over budget |
| World | Border Campaigns | Week 10, then every 8 weeks (±1 seeded); attacker needs front track +2 and War; success if 0.5 × AV × roll ≥ garrison; both sides −5% AV |

## Appendix C — Codex (spoilers)

This appendix is the game's content: every company, Wing, item, Order, enemy host and world event. Rich: stop reading here if you want to discover these in play. Developer: every entry is a starting value, and all of it belongs in data files (`data/codex/*.json`), not code.

### Company reach

| Source | Melee | Ranged |
| --- | --- | --- |
| Barracks | Every tier | — |
| Merchant Hall | Every tier | — |
| Mage Tower | Wardens (III) | Hedge-wardens, Acolytes, Magi, Archmagi |
| Foundry | Palisade Crew (I), Iron Colossus (V) | Crossbowmen, Ballista Crew, Trebuchet Battery |
| Crossings | Ironclads line, Spellblades line, Beastcatchers (I), Golems line | Rangers and the Royal Hunt (II–III), War Wagons line, Alchemists line |
| Others | Crownguard, Elites except Starwardens, the Sworn, vassals | Starwardens |

### Elite companies (Milestone 3; rank II at Milestone 7)

Recruit for 300 each; rank II costs 600 more.

| Building | Elite | Tags | Power I / II | Ability |
| --- | --- | --- | --- | --- |
| Barracks | The Oathsworn | Steel | 16 / 26 | Takes 25% less from Charges |
| Merchant Hall | The Gold Cloaks | Coin | 16 / 26 | +25% spoils from any battle they fight |
| Mage Tower | The Starwardens | Arcane | 16 / 26 | Their damage also hits the enemy rear at half strength |
| Foundry | The Sappers | Engine | 16 / 26 | Ignore Brace and fortification |
| Milestone 7 | The Sworn, the lord's retinue | Two tags chosen once | 24 | Never Wearied; cannot rout in round 1 |

### Wings (Milestones 2, 5 and 8: choose one of two per building, permanently)

| Building | Milestone 2 | Milestone 5 | Milestone 8 |
| --- | --- | --- | --- |
| Barracks | Drill Yard: its company +2 power · or · Watchtowers: +1 day warning on raids along the Barracks road | Veterans' Hall: Weary lasts 1 day less · or · Muster Field: the assault pool fields 1 more banner | Hall of Heroes: the *Last Stand* Doctrine · or · Shield Forge: fronts +15% health in Grand Battles |
| Merchant Hall | Counting House: tithes +25% · or · Envoy's Rest: Trust +0.05 | Exchange: trade prices −20% · or · Spymaster: neighbors' treasuries shown as numbers | Golden Road: +1 courtship slot · or · The Bank: 2% weekly interest on the purse, up to 40 |
| Mage Tower | Observatory: Grand Battle rosters always revealed · or · Herb Garden: Respite bank +1 | Scrying Pool: one hint a month about an upcoming event · or · Ward Circle: mythics −10% | Leyline Anchor: 4 Orders offered instead of 3 · or · Sanctum: Readiness never below 0.7 |
| Foundry | Kilns: fortification −25% cost · or · Armorer: one company gets a third item slot | Engine Works: ranged +10% · or · Bastions: walls +6 | Great Forge: items −30% cost · or · Siege Park: +1 daily assault |

### Items (the Armory)

One slot per company from Milestone 1, two from Milestone 4.

| Rank (Milestone) | Item | Cost | Effect on its company |
| --- | --- | --- | --- |
| I (1) | Whetstones | 60 | +2 power |
| I (1) | Tower Shields | 60 | +20% health in Grand Battles |
| I (1) | Cold Iron Edges / Lucky Coin / Rune Chalk / Powder Kegs | 80 each | Adds the Steel / Coin / Arcane / Engine tag |
| II (5) | Banner of the Realm | 180 | +10% power to every company in its lane |
| II (5) | Healer's Satchel | 200 | Heals 15% health each round |
| II (5) | Hunter's Nets | 150 | ×1.8 against beasts instead of ×1.5 |
| II (5) | Warding Charms | 150 | −30% damage from mythics |
| III (8) | Dragonbone Plate | 300 | +30% health |
| III (8) | Stormglass Bolts | 300 | Ranged damage +25% |
| III (8) | Oath-Ring | 250 | Ignores Weary |
| III (8) | Herald's Horn | 350 | Once a month, Readiness +0.1 for the whole battle |
| Legendary (9) | The Unbroken Banner (Barracks) | 400 | Realm rally floor +5% |
| Legendary (9) | The Gilded Ledger (Merchant Hall) | 400 | +5% all reputation |
| Legendary (9) | The Starglass Orb (Mage Tower) | 400 | All mythic attacks −15% |
| Legendary (9) | The Anvil-Heart (Foundry) | 400 | Walls +10 |
| Trophy (Mythic Hunts) | Wyvern Scale Cloak, Basilisk Eye, Griffin Feather, Manticore Barb, Dragon's Heart | — | Unique; +15% power and immunity to that creature's special |

### Orders and Doctrines

The Order deck holds every Order the player's buildings and Crossings have unlocked. Three are offered per round, without repeats within a battle.

| Source (tier) | Order | Effect this round |
| --- | --- | --- |
| Barracks (I) | Shieldwall | Your fronts take −50% |
| Barracks (II) | Charge | One lane's front deals ×1.75, takes ×1.25 |
| Barracks (III) | Rally | One lane heals 25% |
| Barracks (IV) | Hold Fast | None of your companies can rout this round |
| Merchant Hall (I) | Bribe | One non-mythic enemy company skips its action |
| Merchant Hall (II) | Spoils of War | +50% spoils if you win |
| Merchant Hall (III) | Reserves | Hire a company (20) into an empty slot |
| Mage Tower (I) | Arcane Ward | Cancel one enemy Spell or Volley |
| Mage Tower (II) | Foresight | See next round's intents too |
| Mage Tower (III) | Firestorm | 0.4 × your total Arcane power to every enemy front |
| Foundry (I) | Volley | Your ranged deal ×1.5 |
| Foundry (III) | Siege Engines | Ignore enemy Brace |
| Foundry (IV) | Barrage | Your ranged also hit enemy rears |
| Each Crossing at stage I | Its signature Order | Iron Legion: Phalanx (center front ×2 health this round) · Veil: Blink Strike (swap an enemy's lane) · Royal Hunt: Hunter's Mark (one enemy takes ×1.5) · Titans: Earthshatter (6 × stage damage to every enemy front) · Dragonfire: Dragonfire (one lane's ranged ×2) · Shadow Court: Confusion (one enemy lane's intent becomes Brace) |

| Doctrine | Source | Effect for the whole battle |
| --- | --- | --- |
| Hold the Line | Barracks II | Fronts +20% health |
| Mercenary Contract | Merchant Hall II | One hired company free |
| Foreknowledge | Mage Tower II | All four rounds' intents shown at the start |
| Engineered Fortress | Foundry II | The castle's walls are added as health to your center front |
| Last Stand | Hall of Heroes Wing | Below 30% total health, all damage ×1.3 |

### Rival hosts and intent patterns

All of a rival's companies count as its type for matching (Chapter 10). Hosts are filled strongest-first from these lists until the power budget runs out; the commander joins only when the budget allows.

| Rival | Companies (power, reach) | Commander | Intent pattern by round |
| --- | --- | --- | --- |
| Orc | Grunts (8, M), Wolf Riders (14, M), Shamans (12, R), Brutes (20, M) | Ugrak's Warboss (35) | Charge, Strike, Charge, Strike; Shamans always Spell |
| Goblin | Sneaks (6, M), Slingers (8, R), Trap-setters (10, R), Hired Ogres (24, M) | The Golden Guard (28) | Shift, Volley, Strike, Brace; Ogres Charge in round 2 |
| Dwarf | Thunderers (14, R), Ironbreakers (18, M), Rune Priests (16, R), Hammerers (24, M) | The Anvil Guard (32) | Brace, Volley, Strike, Strike; Rune Priests Spell in round 3 |
| Archmage | Wisps (6, R), Apprentices (10, R), Shadow Hounds (12, M), Stone Sentinels (20, M) | Emrys's Echo (34) | Spell, Shift, Spell, Strike; the Echo Spells every lane in round 4 |

### Mythic Hunts

Rosters scale by `1 + week / 52`. Mythics are weak to Arcane and Engine and resist Steel.

| Lair | Quarry | Roster | Special |
| --- | --- | --- | --- |
| Wyrmfells | Wyvern Brood | Three Wyverns (18) and the Matriarch (30) | Wyverns Volley every round |
| Wyrmfells | The Basilisk | One company (60, health ×6) | Petrify: the lane it Spells deals nothing next round |
| Wyrmfells | The Dragon (event only) | One company (90, health ×8) | Fire: Spells two lanes at once |
| Thornwild | Griffin Flight | Three Griffins (16) | Always Charge; Shift every round |
| Thornwild | The Manticore | One company (45, health ×5) | Poison: its Volley lingers, 5 damage a round |
| Thornwild | The Wild Hunt (event only) | The Hunt Lord (50) and four Hounds (12) | The Hounds Shift to your weakest lane |

### The Archmage's Rituals (in order, one every 6 weeks at 400 saved)

1. **The Long Night:** for 7 days mythic threats are twice as common.
2. **Veil of Fog:** for 7 days tidings show no strength bands.
3. **The Summoning:** a mythic garrison (1.15 × base) appears on a neutral hex next to the player's border.
4. **Curse of Weariness:** the player's strongest company is Weary for 5 days.

### The world-event deck

| Event | Hidden criteria | Effect |
| --- | --- | --- |
| Ugrak's Challenge | The Orc has lost 3 Incursions to the player | A Grand Battle duel (two companies a side). Win: Orc Respect +30. Lose: 200 tribute |
| The Grand Auction | Goblin treasury 2,000 or more | Two neutral villages go to sealed auction among the player and all rivals; Trust applies |
| The Deep Call | Dwarf fortification levels total 20 or more | For 4 weeks the Dwarf may make conquest attempts on hexes two away from its land |
| The Beast Surge (recurring) | Week 10, then every 13 weeks | Neutral beast garrisons +20% and beasts 60% of daily threats for 2 weeks |
| The Hungry Winter | The first full week of December | Tithes −25% and every village's loyalty −20% for 4 weeks |
| The Dragon Wakes | Week 30 or later and the Wyrmfells unsealed | The Dragon attacks the player's westernmost hex as a Grand Battle. Win: the Dragon's Heart and 400 |
| The Wild Hunt | Week 26 or later, the Thornwild unsealed, at the next full moon | The Wild Hunt attacks the easternmost hex as a Grand Battle |
| The Pretender | 3 weeks after a rival is conquered | A rebel host (40% of the fallen rival's last AV) rises in its old lands and seizes 2 neutral hexes |
| Fear of the Crown | The player holds 40% of claimable hexes | All rivals spend 10% more on armies for 6 weeks |
| Village Uprising | A conquered village has loyalty under 20 for 4 weeks | A seeded 30% chance it turns neutral unless the player pays 50 |
| The Wandering Order | Realm Consistency 90% or more for 6 weeks | A free company (power 20, Steel and Arcane) serves for 4 weeks |
| The Merchant Caravan (recurring) | Seeded, about every 5 weeks | One item offered at 40% off for 7 days |
| The Lost Heir | One rival allied and Respect 80+ with another | That rival offers a marriage pact: its Accord opens at Respect 50 |
| Envoys (recurring) | About twice a month, a rival at war with another | Lend one company for a day: +10 Respect with the asker, −5 with its foe |

## Appendix D — Glossary and open questions

### Glossary

| Term | Meaning |
| --- | --- |
| Accord | A 30-day contract with a rival; signing it allies that rival |
| Ascendancy | A rival out-growing the player 1.5× for 4 weeks after week 36; it starts an Ultimatum |
| Assault | The player's daily attack on one adjacent hex |
| Army value (AV) | The sum of a side's company power |
| Banner | One company fielded in a battle; the castle sets how many |
| Benchmark | The hidden consistency at which rivals earn income |
| Charter | The player's standing terms: step pool, calorie limit, duties |
| Coalition | Two rivals allied against the player for a set time |
| Contested | A hex that lost one conquest battle and falls if it loses the next |
| Courtship | A sealed reputation bid for a village's loyalty |
| Crossing | A pair of buildings raised together, with a hybrid company and perks |
| Crown's Grace | Forgiveness levels I to III earned by steady weight progress and habits |
| Dominion | Each building's running total of land worth |
| Grand Battle | A tactical, hands-on battle announced days ahead |
| Milestone | A weight mark that unlocks content; ten per campaign |
| Momentum | Weekly reputation from the weight trend, capped at the target pace |
| Orders | Cards played once per round in a Grand Battle |
| Pledge | Optional reputation staked on a contract |
| Readiness | The 7-day Valor multiplier used in Grand Battles |
| Realm Consistency (RC) | The three-pillar score over the last 28 days |
| Respect | A rival's regard for the player, 0 to 100 |
| Respite | A banked day that pauses a contract without penalty |
| Steadiness | The 8-week average Momentum score that sets the Grace |
| Tithe | Weekly reputation from each village held |
| Trust | The multiplier consistency gives your courtship bids |
| Valor | The day's consistency, used in that night's battles |
| Wing | A permanent building upgrade chosen at Milestones 2, 5 and 8 |

### Decisions and remaining questions

Rich settled these on Oct 5, 2026. The rules above already reflect them.

| Question | Decision |
| --- | --- |
| Campaign length | Keep victory at about 44 to 48 weeks. Early loss usually runs faster than the pace, which gives a head start; Milestones 8 to 10 arrive in the Reign |
| Benchmark level | Keep 72% rising to 86%; retune after playtesting |
| Momentum's weight | Keep at about 15% of weekly income; retune after playtesting |
| Target pace | min(0.8 lb, 0.4% of current weight) a week, so it eases in the endgame (Chapter 5) |
| Rival vs rival land | Rare, on preselected Border Campaign weeks, never between coalition partners (Chapter 12) |
| After the Fall | The Fall is final in version 2; an exile route may come later |
| Grand Battle screen | Desktop only |
| Calorie floor | Calculated from logged intake and weight trend for 1 to 2 lb a week; the bottom of the range is the floor (Chapter 4) |
| Body weight | Typed into the ledger by hand; Rich's starting weight is 217 lb; no weight sync |
| New realms | Out of scope for version 2 |
| Art style | Cartoonish, hand-painted fantasy in the spirit of Warcraft, fully original (Chapter 17) |
| Story writing | Written by Rich and his brother, not AI; plain placeholders until then (Chapter 17) |
| Daily stats | Read from the ledger at each day close; no separate import (Appendix A) |
| Tuning | Ship the book's numbers; retune after several weeks of real play |

### Still open

- [ ] Playtest targets: after 8 weeks, check that fewer than 15% of first-month assaults fail, the first Grand Battle feels winnable, and the rivals feel close but beatable.
- [ ] Exile continuation and new realms, for a later version.
