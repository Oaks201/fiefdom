# Patch 10 proposals: the milestone patch (for Rich's approval)

Written 2026-11-12, on branch `patch-9` (from Patch 9, bf7f395, rules 3.14.0).

**Status (2026-11-12):** approved. Rich ruled on the four pillar decisions (F1 to F4, D-79) and then approved sections 3 to 13 as recommended (D-80). Every number is still a first guess (TUNE) for the simulator to settle, with Rich deciding (D-02). **Stage 1 is built** on branch `patch-10` as rules 3.15.0; section 12 says how it differs from what is written here. Stages 2 to 7 are not built.

Rich's direction (2026-11-11 and 12):
- Patch 10 is a milestone patch: a large one that improves the game as a whole.
- Make the game more engaging and improve the core gameplay loops.
- The rivals still have little interaction outside predetermined lines, which get stale.
- There should be different ways to earn Renown with them. Fortifying hexes should earn Renown with the Dwarf, and battling consistently should earn it with the Orc.
- The more units of a tag the player has, the more Renown for taking hexes with those units: more emphasis on Coin, Engine, Steel and Arcane.
- Cut out any fat or redundancies.
- Rich's own campaign now: pushing deeper into the Orc's lands, and fortifying so the counterstrikes don't overwhelm him.
- He asked (2026-11-12) whether any pillar hinders the fun more than it helps the weight loss. Four do, and he asked for them here as decisions to take first.

## The frame: four pillar decisions

Sections 1 to 13 were first written inside the book's pillars as they stood. Four of those cost the game more fun than they give the weight loss. Each was put to Rich with options and a recommendation (the blueprint's working rules), and **he ruled on all four as recommended (D-79)**. The options stay here as the record. Their numbers are still first guesses for the simulator and for Rich (D-02).

**What is not in question:**
- **Pillar 1** (habits are the treasury) and **Pillar 5** (the body crowns; it does not gate).
- **The Chapter 16 guardrails.** Nearly all are caps and floors the player never feels: the calorie floor, the pace cap, no loss before week 36, the protected core, the absence rule, no shame in the copy.
- **Seeded, settle-once settlement.**
- **Hidden values.** The benchmark stays hidden: a visible deficit after a bad week is the shame Chapter 16 guards against. The rule is read narrowly, as it is in K6 and L1: the player's own numbers, and what a ruler asks of them, show plainly.

### F1. Who the world goes easy on (Pillar 4, the Crown's Grace)

- **The book:** "Steadiness earns forgiveness. The more consistent your habits and weight progress, the gentler the world becomes." The blueprint keeps the Grace unless Rich rules otherwise.
- **Today** (rules 3.14.0): Steadiness is the mean Momentum of the last 8 weeks, and the Grace is level I, II or III at 0.5, 0.7 and 0.85.

  | Level | It softens a loss | It weakens the opposition |
  | --- | --- | --- |
  | I | A hex lost in the last 14 days is reclaimed for half its garrison, with no battle | Ascendancy needs 1.6× the player's Power, not 1.5× |
  | II | Tribute is halved; a contested hex holds 2 days, not 1 | The rivals' benchmark is 3 points lower |
  | III | | The benchmark is 6 points lower; Ascendancy from week 44, not 36; coalitions end 2 weeks sooner |

- **What it costs:**
  - **The best player is paid twice.** Steady habits and progress already fill the purse. The Grace then lowers the opposition too, so the player doing best has the flattest game.
  - **It isn't what keeps anyone alive.** No simulated player falls: 0% of Steadfast, Committed and Wavering campaigns (G-19; the book expected 20 to 35% and 60 to 80% for the last two). Ultimatums come in 64%, 98% and 100% of them (Steadfast's figure is the greedy and smarter players together) and are survived.
  - **A plateau lowers it.** With habits at 85% or more, a plateau holds Momentum at 0.6, which is Grace I. Eight such weeks take a player from III to I: the benchmark 6 points higher and tribute back at full, in the weeks the scale is already discouraging. Pillar 5 says a plateau is never punished while habits hold.
- **What it protects:** the sense that keeping your word makes the realm safe. Chapter 16 lists it under fear of losing, beside three rules that don't depend on it: no loss before week 36, the protected core, and 14 days' warning.
- **Options:**
  1. **Keep it.** Nothing to tune or carry. The steady player's game stays the gentlest.
  2. **Keep the mercies, turn the rest.** The Grace still softens a loss (the left column). It stops weakening the opposition (the right column). In its place, at Grace II and III the rulers send stronger hosts against the player and pay more for beating them, sized so the prize outweighs the risk. Steadiness then earns a harder, richer war. The cost is a large re-tune (the benchmark feeds G-11 and G-21), and a player may read it as the game getting harder for doing well, so the prize has to be plain on the screen.
  3. **Option 2, and the mercies follow trouble.** The left column switches on in a rough patch (a return from absence, a contract missed, a plateau) and not by Momentum. This protects the player who needs it most, but it ends the one link from weight progress to the war.
- **Decided (D-79): option 2, measured first.** A targets run with the right column switched off reads G-11, G-19 and G-21 before any number is proposed.
- **It changes:** a stage of its own (stage 6 in section 12). R6 and finding 9 (the Ultimatum) are read again with it. No save migration: the Grace level is already in the save.
- **Measured (2026-11-12, rules 3.15.0):** [the run with the right column off](../game/sim/targets-3.15.0-graceOff.md), beside [the usual one](../game/sim/targets-3.15.0.md), 740 campaigns each.

  | Reading | Grace as it is | Opposition effects off |
  | --- | --- | --- |
  | Victory week, Perfect / Steadfast / Committed (G-11) | 54 / 60 / 64 | 54 / 60 / 65 |
  | Falls: Steadfast; Committed; Wavering smarter | 0; 0; 7 of 40 | 0; 0; 6 of 40 |
  | Steadfast campaigns with an Ultimatum (G-19) | 80% | 90% |
  | Behavior income over the benchmark's, Steadfast / Committed (G-21) | 1.15 / 0.97 | 1.10 / 0.95 |

  - **Taking the right column away costs almost nothing.** The rivals earn about 5% more against a Steadfast player, one campaign in ten more sees an Ultimatum, and no result moves by more than a week. It needs no offset.
  - **So the Grace was not flattening the game much either.** What stage 6 adds (stronger hosts and their prizes) is new difficulty to size from scratch, and can't be sized as a swap for what is removed.
  - G-07 and G-17 read as missed in this run by a week and by 8 points. Both sit near their lines and moved without a cause in the rules, so they are not judged here.

### F2. How much a day holds (Pillar 7, Chapter 2, G-14)

- **The book:** a 2 to 5 minute daily loop (Chapter 2); against compulsive checking (Chapter 16); real time, and nothing can be fast-forwarded (Pillar 7). The blueprint made the loop a target: at most 3 decisions offered a day (G-14). The rules allow one assault a day, and a second at Castle IV, which none of the probe's campaigns bought.
- **What it costs:**
  - **The waiting days** (finding 6): in months 3 to 8 no hex falls on 4.7 to 5.2 days a week.
  - **A day kept and a day played meet only in the purse.** A walk today is reputation tonight, spent whenever. Behavior is 34% of the reputation earned, a point over its floor (G-21). Nothing the army does today depends on what the player did today.
- **What it protects:**
  - **Real time and no fast-forward** tie the game to days lived. These are worth keeping whole.
  - **The short loop** keeps the game from taking the time and attention the habits need. What matters there is the time the game requires, not the most it offers.
- **Options:**
  1. **Keep it:** one assault, three decisions. L1 to L4 give a waiting day an aim, and no more to do.
  2. **Cap what the game requires, not what it offers.** G-14 becomes: a day's play can be finished in 2 minutes with nothing lost, and "repeat yesterday's orders" stays whole. More may be offered beyond that. This rules nothing in by itself; it lets later items add optional play.
  3. **A day kept earns a second march.** A day on which the player kept their word earns a second assault at that day's close. The player queues it with the day's orders, and it is carried out only if earned.
     - **Earned by** (first guess, Rich's call): every duty kept and the day logged. Duties are the one thing the book keeps daily; steps stay pooled by the week, so no single day's walk is judged.
     - **Capped:** it is earned or it isn't. Nothing pays for doing more than the charter asks.
     - **A Respite day earns it** (D-54). While away, nothing is queued.
     - **Settled once:** a late correction never grants or takes back a march.
     - **Said plainly:** a march not earned is absent from the tidings, with no line about it.
     - **Costs:** a short day then has fewer moves as well as less coin. Campaigns run faster, so it needs a larger offset than K7's. Castle IV's second assault needs a new place (a third, or another perk).
- **Decided (D-79): options 2 and 3 together.** Option 3 is Pillar 1 made daily and follows D-53: the reward lands on the day it was earned.
- **It changes:** L5 takes G-14's new wording. E1's work on Castle IV comes first, so a second assault is measured before it is handed out. A stage of its own (stage 7).
- **Still open inside it:** what earns the march (duties and logging is the first guess), and where Castle IV's second assault goes.

### F3. Who writes the words (Chapter 17)

- **The book:** the developer's tools never invent flavor text; a missing line shows its placeholder.
- **As practiced since Patch 8** (D-62, D-67, D-74, D-78): Claude drafts, and Rich approves each line before a release build speaks it. 380 rival lines stand (340 drafted, 40 his own), and Remedy's 49.
- **What it costs:** everything a ruler can say is a whole line, read and approved one at a time. Variety grows by one for each line Rich reads. Section 9's 70 new slots are one line each, so a commission would be asked in the same words every time. This is the stale-lines complaint at its root, and the rule does nothing for the weight loss.
- **What it protects:** Rich's voice, and the certainty that nothing unread is ever said about his health.
- **Options:**
  1. **Keep it:** every line approved one at a time. Section 9 as written.
  2. **Approve parts, not lines.** A line is built from approved parts (an opening, a body with plain-fact placeholders, a close), picked by the campaign's seeded draw, so each visit differs and a reload never changes it. Rich approves the parts and reads a sheet of built lines for each ruler before release. About 15 parts can make 100 lines. The cost is the odd pairing that reads badly; the sheet, and a list of parts never to pair, are the guard.
  3. **Approve a voice, spot-check the lines.** Rich approves a voice sheet for each ruler, Claude writes whole lines against it in batches, and Rich reads a sample. The lines read more naturally than built ones, but some ship unread.
- **Not offered:** lines written by a model while the game runs. The game would need a service, and a reload could change what was said.
- **Decided (D-79): option 2** for the rulers' commissions, topics and memory (R1, R2, R5). Remedy, and any line that touches health, stay line by line (option 1).
- **It changes:** section 9 is parts and sheets, with fewer things for Rich to read and more lines in play. The ground rule holds: nothing shows in a release build that Rich has not approved, as a line or as its parts.

### F4. What choices can decide (Pillar 1 over Pillar 2, G-11)

- **The book:** "Two players with the same consistency can end in very different places because they spent differently" (Pillar 2). Where pillars conflict the earlier wins, and R-17 set the length by consistency: Perfect wins in weeks 50 to 56, Steadfast 58 to 64, Committed 64 to 72, so that Milestones 8 to 10 fall inside the campaign.
- **What it costs:**
  - **Choices are tuned not to move the result.** The victory week is pinned to the profile within 6 to 8 weeks, and G-07 wants the path mixes' victories within 5 weeks of each other.
  - **Every reward that adds power is taken back somewhere.** K7's offset is this rule at work: the crafts add Renown, so the hex-taken deed must lose it.
  - **Every victory is the same one:** four rulers resolved.
- **What it protects:** the campaign lasts as long as the weight journey. A consistent player can't be shut out by poor play, or finish in month 6 and put the app down.
- **Options:**
  1. **Keep it.** Choices decide the route. K7 offsets what the crafts add.
  2. **Keep the windows; give choices outcomes that aren't power.** The Chronicle records, and victory shows, what kind of realm won: how each ruler ended (conquered, abdicated or allied, which the log already holds), the craft that led the player's banners, the ranks reached. The Reign (E3) starts from it. Rewards of this kind need no offset. On its own it is mostly a screen until the Reign uses it.
  3. **Widen the windows,** so play can move victory by six weeks or more either way. Strategy then decides when, but a strong player finishes before the last Milestones and a weak one runs past a year.
- **Decided (D-79): option 2.** The length is the part that serves the weight loss.
- **It changes:** K7 stays. E3 gains its brief: the Reign opens on the realm the player made. A victory page and the Chronicle's summary join stage 5; any words on them are slots for Rich.

## 1. What is there today

### How it was measured

- **The targets run:** [targets-3.14.0.md](../game/sim/targets-3.14.0.md), 740 campaigns.
- **A probe for this document:** 10 Steadfast campaigns played to victory with the smarter automatic player on rules 3.14.0: 6 along every path and 4 along the Orc's path alone. The script was a scratch file and is not in the repo. Its victory weeks (63 to 73) run later than the targets run's (median 59), so read its figures as shapes, not as tuning.
- **The live campaign was not read.** D-75 records that Rich walled (2,−5) in the Orc's march on Nov 7.

### The loop as it stands

| When | What the player does | What answers |
| --- | --- | --- |
| Each day | Logs habits; sets orders (which hex to assault or besiege, which companies go); may lead the day's fights; may wall, court, bribe or deal | The close: battles, land, spoils, deeds |
| Each week | Weighs in; Remedy's request; a ruler's request about one week in two; seals a contract when one ends | The week close: tithes, Respect, the rivals' turn |
| The campaign | Raises tiers, Crossings and the Armory; resolves four rivals | Dominion marks open each resolution; victory |

### What the numbers say

1. **Respect runs on rails.** Its largest drivers are things that happen to the player, not things the player chooses (the smarter Steadfast player, a campaign):
   - **Ugrak:** his raids beaten give +97.5. His Respect is 85 by week 26 and 100 by week 52, for every player.
   - **Hrodgar:** the step pool met gives +56. He is at Peace in 40 of 40 campaigns, first at a median of week 10, and never at War.
   - **Skivvet:** he falls to −88 by week 52 and reaches War in 40 of 40. The largest cause is the player holding their own village against his bid: −2 each time, 37 times, −73.
   - **Emrys:** steady weeks (+33) and the Accord's own contracts (+51) carry him.
2. **Renown is mostly "took a hex".** 54% of all Renown is the hex-taken deed. The signature deeds (D-34) were meant to give each path its own way:

   | Path | Signature deeds' share of its Renown by week 13 / 26 / 52 (probe, every path) | Mostly from |
   | --- | --- | --- |
   | Orc | 5% / 5% / 4% | a battle lost to him (0.5 each) |
   | Goblin | 56% / 51% / 37% | his bid for a village held off (+3, about 44 times) |
   | Dwarf | 29% / 24% / 18% | sieges endured, walls broken |
   | Archmage | 23% / 19% / 5% | Rituals and surges endured |

   The Orc, the ruler of battle, has the path with the least of its own. Four signature deeds post less than once a campaign: a hex taken back from the Orc (0.7), a summoned mythic's hex taken (0.3), a courtship won against the Goblin's bid (0) and the Dwarf's conquest attempt beaten (0).
3. **Walls earn nothing but defense.**
   - The simulator's player spends 6 reputation a campaign on walls: of about 242 hexes held at the end, 0.8 has one. Every number in the game was tuned by a player who doesn't wall.
   - A campaign has about 500 defenses, a third of them lost. Walls are the one defense the player buys hex by hex.
   - No deed, no Respect and no ruler's line ever mentions a wall the player raised.
4. **Tags aren't a decision.** A tag gives ×1.5 against a foe weak to it and ×0.6 when the foe resists every tag a company has. The Marshal picks by that. The log doesn't record which companies took a hex.
5. **Most requests are dares.** Of 27 requests a campaign, 17.5 are dares, and a dare is a habit already paid twice (his prized week, +4 Respect; Remedy's request, 15 reputation). There is nothing to answer.
6. **The middle months wait.** In months 3 to 8, no hex falls on 4.7 to 5.2 days a week, and the strict count of meaningful days is 3.1 to 3.6 a week. On those days the orders are "repeat yesterday's".
7. **A path's rank is a Herald line.** Reaching a rank changes the war (a perk, a building tier nearer), but it has no card and no ruler says a word.
8. **The top of the tree comes at the end.** In 8 of the probe's 10 campaigns the first Tier V building came in weeks 61 to 72, against victory in weeks 63 to 73; in the other two it never came. No campaign had every building at Tier V, and none bought Castle IV (a second daily assault, 3,000), which is the automatic player's spending order. So the simulator has never measured a second assault.
9. **The Ultimatum is near-certain and never lethal:** 73% of Steadfast smarter campaigns, 95 to 100% of Committed and Wavering, no falls.
10. **The world's events keep one order.** 10 of the 14 events fire in every Steadfast campaign, at the same median weeks for both simulated players (Envoys 2, the Wandering Order 6, the Hungry Winter 9, the Beast Surge 10, and on). The report gives medians only, so how tight the spread is isn't known yet.
11. **Four targets are missed:** G-05 (accepted, D-58), G-07 (the mixes' victories 7 weeks apart against 5), G-10 (a near-tie) and G-17 (70% against 75%).

## 2. The shape of the patch

Five parts. The first three are the heart of it.

| Part | In one line |
| --- | --- |
| **K. Crafts** | Each ruler admires a way of war. Fighting his way earns Renown on his path, wherever it is done |
| **R. Rulers who act** | They commission deeds in their craft, answer what the player has become, and remember |
| **L. The day and the week** | The waiting days get work, the week gets an aim, and rewards get their moment |
| **E. The long game** | The top of the tree, the Ultimatum, the events and the Reign |
| **X. Cut and merge** | What the parts above replace, and what never earned its place |

## 3. Crafts

### K1. The principle (rule change)

- **Today** a path's Renown is the deeds done against its rival or in his march (D-18).
- **Proposed:** it is also the deeds done in his craft, anywhere. A path then says what kind of lord the player is, as well as whom they fought.

| Ruler | Path, building | Tag | His craft | Today's deeds of it |
| --- | --- | --- | --- | --- |
| Ugrak | Orc, Barracks | Steel | The field: fighting day after day | A battle lost to him; a hex taken back |
| Skivvet | Goblin, Merchant Hall | Coin | The deal: land won by coin | A deal in his march; a bargain; his bid held off |
| Hrodgar | Dwarf, Foundry | Engine | Stone: walls and sieges | His walls broken; a siege endured |
| Emrys | Archmage, Mage Tower | Arcane | The unseen: mythics and wild magic | His surges and Rituals endured |

### K2. Stone, for Hrodgar (rule change)

- **A wall raised:** raising a wall level on a hex the player holds pays Renown to the Dwarf's path: the level × the hex's band × 0.5.
  - Paid once for each hex and level in a campaign. A hex lost, retaken and walled again pays nothing more.
  - The price bounds it (15, 35 and 70 × the band).
  - **Example:** a band 4 hex walled to level 3 costs 480 reputation and pays 12 Renown. Taking a depth 8 hex pays 8.
  - **As tuned (D-81):** 0.4, not 0.5, so the example pays 9.6. At 0.5 stone alone was a tenth of all Renown.
- **The walls held:** a defense won that would have been lost without the hex's walls pays 1 Renown a wall level to the Dwarf's path, beside the battle's own deed. The close records it as a plain fact (`defense` events gain `walls`).
- **No Respect from either.** Hrodgar already reaches Peace in every campaign, at a median of week 10. His Respect for walls comes through his commissions (R1).
- **A new log event,** `fortified` (hex, level), since fortifying leaves only a purse entry today.

### K3. The field, for Ugrak (rule change)

- **A day in the field:** a day with at least one battle against him or in his march: an assault on a hex of his march (his own or its wilds), or a raid, counterattack, conquest attempt or Grand Battle of his. Won or lost.
- **The streak:** field days in a row. Day n of a streak pays 0.25 × n Renown to the Orc's path, at most 1.5 a day (from day 6).
  - A full week at the cap pays 10.5.
  - **It holds** on a Respite day (D-54) and while the player is away (X-17). Any other day without a battle ends it.
- **Respect:** every seventh day of a streak, +2 with Ugrak.
- **His raids beaten weigh less with him:** his own weight for a raid beaten falls from +3 to +2, so his Respect is earned by coming at him, not by standing still.
- **No new meter:** his court shows the streak as a line beside his war track ("day 5 in the field"), and the war track itself is unchanged.
- **As built:** the save keeps the streak as one small record beside the chronicle's bookmark (its days, and the last day it counted or held). A day away leaves nothing in the log, so the log alone could not say a streak was held.
- **Sizing (probe):**

  | Player | Field days a week | Streaks of 7 days or more a campaign | Longest |
  | --- | --- | --- | --- |
  | Every path | 2.2 | 4.5 | 48 days |
  | The Orc's path alone | 3.6 | 11 | 39 days |

  The streak pays focus: a player set on his march keeps it, and one spread over four doesn't. That should help G-06 and G-17.
- **Replaces** the battle-lost and hex-taken-back deeds (X2): the streak already counts a lost day.

### K4. The deal, for Skivvet (rule change)

- **Today** a hex won by a bribe, a courtship or a trade pays its extra deed (0.5 × depth) only in his march.
- **Proposed:** it pays to the Goblin's path in any march. The probe's player won 48 hexes a campaign by coin, 17 of them in his march.
- **His bid held off** keeps its Renown and stops costing Respect (X3). **As tuned (D-82):** it costs 1, half what it did.

### K5. The unseen, for Emrys (rule change)

- **Proposed:** a mythic beaten pays to the Archmage's path wherever it is fought, beside its own deed: +0.5 for a defense held against one, +5 for a Mythic Hunt won.
- His surge and Ritual deeds stay.
- **As tuned (D-81):** a mythic beaten pays 0.75, not 0.5. At 0.5 his craft sat just under G-28's 2% of Renown.
- **This is the weakest fit of the four,** and it is Rich's call. Mythics are weak to Arcane and are the game's other wild magic, which is the case for it. The alternative is to leave his craft as his surges alone, in his march only.

### K6. Banner share: the tags that took the hex (rule change)

- **Today** a hex taken pays its depth to the path of the march it lies in.
- **Proposed:** 70% goes to the march's path as today, and 30% (the craft share) goes to the paths of the tags that took it, by each tag's share of the strike.
  - A company's strike is split evenly over its tags. A tag added by an item counts.
  - It applies to a hex taken by daily assault or Grand Battle. A hex won by coin is K4's.
- **Massed banners:** when one tag carries 60% or more of the strike, its craft share counts × 1.5. This is the only part of K6 that adds Renown, and it is Rich's "the more units, the more Renown".
- **What it does to choices.** The Marshal picks by weakness, and each ruler is weak to another's tag:

  | Assaulting | Weak to | Resists | So the craft share feeds |
  | --- | --- | --- | --- |
  | The Orc | Engine | Coin | the Dwarf's path |
  | The Goblin | Coin | Steel | his own |
  | The Dwarf | Arcane | Engine | the Archmage's path |
  | The Archmage | Steel | Arcane | the Orc's path |
  | Beasts | Steel, Coin | none | the Orc's and the Goblin's |
  | Mythics | Arcane, Engine | Steel | the Archmage's and the Dwarf's |

  Pushing the Orc with engines and walling behind builds the Dwarf's path, which is Rich's campaign today. Massing a tag the foe resists costs strike and earns that path more: a real trade.
- **Screens:**
  - The orders panel shows each assault's split before the close ("Foundry 60%, Barracks 40%"), from the companies sent. It is the player's own army, so nothing hidden shows.
  - Tag marks on companies, building cards and courts, so path, building, tag and ruler read as one thing. Four small art slots (A2), with lettered placeholders until painted.
- **The log:** `assault` and Grand Battle events gain the tag shares of the strike.

### K7. The budget

- **Why it matters:** total Dominion opens the building tiers and the four resolutions (D-59). Steadfast wins at week 59 in a 58 to 64 window (G-11), so Renown added on top ends campaigns too soon.
- **Moved, not added:** K6's craft share is 30% of the hex-taken deed for hexes taken in battle, at most about 550 of a campaign's 3,434 Renown, going to other paths.
- **Added (first guesses, a campaign):**

  | Source | Renown |
  | --- | --- |
  | Walls raised and held (30 hexes to level 2) | about 150 |
  | The field streak | 60 to 150, less the 20 to 60 of the deeds it replaces |
  | Deals in any march | about 50 |
  | Mythics | about 60 |
  | Massed banners | by the simulator |
  | **Together** | **about 350 to 450, 10 to 13%** |

- **The offset:** lower the hex-taken deed (1 × depth to about 0.85) or raise the Dominion marks, whichever the simulator shows keeps G-11 and G-07.
- **As tuned for stage 1 (D-81):** the marks. The second rises from 1,800 to 1,900, and the third and fourth go back to D-59's 2,700 and 3,650 (D-65 had lowered them to 2,500 and 3,350). Lowering the hex-taken deed to 0.85 recovered less: Steadfast at week 58 against 60 in the probes. Stage 2's banner share is read against these marks.

## 4. Rulers who act

### R1. Commissions take the dares' place (rule change)

- **What it is:** where a ruler sends a dare today, he sends a commission: a deed in his craft for the week ahead. The player accepts or declines in his Audience.

| Ruler | He asks for | Sized by |
| --- | --- | --- |
| Hrodgar | Wall levels raised on hexes facing a named neighbor or the wilds | 2 to 4 levels, by the band |
| Ugrak | Days in the field this week | 4 or 5 |
| Skivvet | A hex won by coin, in any march | 1 |
| Emrys | A hex of his march taken on its ebb, a surge strike held, or a mythic beaten | 1 |

- **He asks only what can be done:** Ugrak only while his march is in reach, Emrys only when a surge or a mythic allows it. Otherwise he asks nothing that week.
- **Met:** +6 Respect and 5 Renown to his path, at the close of the day it is met (D-53).
- **Accepted and missed:** −2 Respect. **Declined or left unanswered:** nothing.
- **The numbers** are the dares' (met +6, missed −2), so Respect's totals move little.
- **Habits keep their place:** each ruler's prized week (+4 Respect) is unchanged, and Remedy's requests are the weekly habit ask.
- **Cost:** the 12 dare lines Rich approved (D-67) retire. **Option:** keep dares in turn with commissions, one request in three.

### R2. A way back (rule change)

- **Today** a ruler below 0 Respect sends tolls: 4.5 a campaign, pay or lose 5 Respect.
- **Proposed:** he sends a toll and a commission in turn. The commission is his craft's, worded as a demand: met +5, refused or missed −5, as demands are today.
- **Why:** it gives a player at War with him something to do about it besides paying.

### R3. He answers what you have become (rule change)

- The first time the player reaches a mark in his craft, he offers his own deal (Patch 8's D4) free, once:

| The mark | His answer |
| --- | --- |
| A 7-day streak in the field | Ugrak's trial of champions, with nothing lost if the player loses it |
| 10 wall levels raised | Hrodgar's oath of stone at no price |
| 5 hexes won by coin | Skivvet's mercenaries for a week at no fee |
| A hex of his march taken on its ebb | Emrys's bargain of knowledge at no price |

- **Why:** it brings each ruler's own deal to the player in play. G-24 has the bargain struck in 48% of campaigns.

### R4. Ugrak scorns walls (rule change, optional)

- Each wall level raised on a hex of his march costs 1 Respect with Ugrak.
- **Why:** Rich's plan (push the Orc, wall behind) then pleases one ruler and irks another, and both say so. It is small beside the +2 a streak week brings.
- **Recommended:** yes, at this size.

### R5. He speaks of it, and he remembers (words and screens)

- **New topics** for his Audience (A2 of Patch 8), each a template with plain-fact placeholders:
  - the walls raised on his border, or facing his neighbor (`{hex}`, `{levels}`);
  - the streak (`{days}`);
  - the craft that leads the player's banners;
  - a commission met, missed or declined;
  - the others on a deed in a craft not their own (Ugrak on walls, Hrodgar on the streak).
- **Memory:** on a day with nothing fresh he recalls one deed from the chronicle: the first hex taken from him, the longest siege, a pact kept or broken, the last Grand Battle (`{hex}`, `{week}`).
- **Never the same topic two visits running.**
- **Why this fixes the staleness:** today's lines are keyed to his Respect tier and to the last week's log. Lines keyed to facts that keep changing don't repeat.

### R6. The Ultimatum can be answered (rule change)

- **Today** a coalition's member can be bought out (300, at Respect 40).
- **Proposed:** while an Ultimatum stands, each ruler in it names one commission of his craft. Met, he stands down.
- **Why:** the most alarming card in the game becomes a call to play, answered by the war, not only the purse.
- It needs G-19 read again: falls must stay rare.

## 5. The day and the week

### L1. The week ahead (screens; no rule change)

- At the week's first dawn the Herald shows up to three aims, each with its progress, and the Realm page keeps them as a strip:
  - the open commission;
  - the path rank nearest ("12 Renown to the Foundry's rank III");
  - the standing siege and its days to fall;
  - the next building tier or Crossing in reach of the purse;
  - Remedy's request.
- Public values only.
- **Why:** on a day when no hex falls there is still something to move.

### L2. A rank reached is a moment (words and screens)

- A path's rank shows as a big-moment card: the rank, its perk in plain words, and the ruler's line.
- It is a Herald line today. Rewards land fast (D-53).
- 20 lines (4 rulers × 5 ranks), or 4 with `{rank}`.

### L3. The Dawn tidings say what the walls did (screens)

- With K2's fact, the tidings say "the walls at {hex} held" where they turned the fight.
- The Chronicle counts walls raised, and held by walls.

### L4. The streak on the day (screens)

- The orders panel says, before the close, whether today's orders keep the streak.
- The Herald marks day 7, and a streak ended.

### L5. A day that can be finished in 2 minutes

- **G-14 as F2 rewords it (D-79):** a day's play can be finished in 2 minutes with nothing lost, and "repeat yesterday's orders" stays whole.
- The parts above keep to it: commissions are weekly, walls are bought when wanted and the streak follows the orders.
- F2's second march is queued with the day's orders, so it adds one choice and no second visit.

## 6. The long game

These matter later than the rest. Rich's campaign is in its first months.

### E1. The top of the tree (tuning; measure first)

- **Add to the report:** the weeks of play each Steadfast campaign has with a Tier V building, with Castle IV and with the stronger Crownguard.
- **Target, if Rich wants one:** at least 8 weeks of play with each.
- **Teach the automatic player** to buy Castle IV, so a second daily assault is measured before a person meets it.

### E2. The events' order (measure first)

- **Add to the report:** the quartiles of each event's first week.
- If they are tight, widen the criteria or tie some to crafts (a 14-day streak, 20 wall levels), so the world answers the player. Rich asked for soft thresholds, never set times (D-56).

### E3. The Reign (its own patch)

- After victory the realm "goes on" with one line. Keeping the weight off is the hardest part of the journey (the audit's A5, the blueprint's open question 8).
- **Recommended:** leave it out of Patch 10 and give it a patch of its own. It needs its own design, and the live campaign is about a year from it.
- **Its brief, from F4 (D-79):** the Reign opens on the realm the player made: how each ruler ended, the leading craft, the ranks reached. Stage 5 records these and shows them at victory.

### E4. The missed targets

- **G-17 and G-06:** count a craft deed as a deed of its craft's path, then read them again. K3 should help; K6 may blur them.
- **G-07:** crafts give a one-path player Renown on other paths, which should narrow the mixes. Read again.
- **G-10:** a near-tie; read again once the automatic player walls.

## 7. Cut and merge

| # | What goes or merges | Into | Why |
| --- | --- | --- | --- |
| X1 | Habit dares | Commissions (R1) | A third payment for the same habit |
| X2 | The battle-lost and hex-taken-back deeds | The streak (K3) | The same idea; together 4 to 6% of the Orc's path |
| X3 | Skivvet's −2 Respect for a bid held off | Nothing (0). **As tuned (D-82):** −1 | It punishes defending, and it is the largest single reason he ends at War with everyone |
| X4 | Every second toll | A commission (R2) | A tax with no choice in it |
| X5 | Three deeds that post less than once a campaign: a summoned mythic's hex taken, a courtship won against his bid, his conquest attempt beaten | Dropped, or folded into K5, K4 and K2 | Rules the guide explains and nobody meets |
| X6 | Remedy's rule to skip a habit a ruler dared | Gone with X1 | Nothing left to skip |
| X7 | The guide's deed table, about 30 rows a ruler in five groups | Regrouped: his craft (anywhere), his march, his Respect | Fewer rows, and the craft first |
| X8 | His court's figures. The rules keep nine for each ruler: Respect, standing, Renown, Holdings, Dominion, rank, his march's preparation, his stance and his own track | Stage 4 reads his court and proposes what shows first and what moves behind a tap | Crafts add no meter; the court should get shorter |

Rich deferred the empty-lane dodge on 2026-10-20, and it stays as it is unless he reopens it here.

## 8. What stays out

- **Weight never earns Renown or Respect,** and no ruler speaks of it (D-39). Crafts are deeds of war.
- **No Renown from habits.** The prized week and Remedy's requests are the habits' rewards.
- **Absence costs nothing** (X-17): no commission is sent while the player is away, one open then ends quietly, and the streak holds.
- **A rest day costs nothing** (D-54): the streak holds.
- **Hidden stays hidden:** the banner split is the player's own army; no garrison, treasury or criterion shows.
- **No new meter** on a court.
- **No story text invented:** every new line is a slot with a plain-fact template until Rich approves its words.

## 9. The writing

About 70 new slots:
- **Commissions:** 12 (asked, met and missed, for each ruler).
- **A way back and the Ultimatum's commissions:** 8.
- **His answers to a craft mark:** 4.
- **Craft topics:** about 20.
- **Memory:** 12.
- **Rank cards:** 4 to 20.
- **The Herald:** about 10.

The 12 dare lines retire (R1).

**How they are written (F3, D-79):**
- **Parts:** the commissions, the way back, the craft topics and memory (about 50 of the 70 slots) are drafted as parts: openings, bodies with plain-fact placeholders, and closes. Each ruler gets a sheet of built lines and a list of parts never to pair. Rich approves the parts after reading the sheet.
- **Whole lines:** his answers to a craft mark, the rank cards and the Herald's lines stay whole lines, approved one at a time.
- **The build is seeded:** the same visit on the same day always builds the same line.

**Who drafts (still to decide):**
1. **Recommended:** Claude drafts the parts and the whole lines in the four voices in `rivalLines.draft.json`, and Rich approves before any shows in a release build, as in D-67 and D-74.
2. Rich writes them; the templates show until he does.

## 10. Save compatibility

- **Additive:** the new events and fields (`fortified`; the tag shares on `assault`; `walls` on `defense`), the deed kinds and the request kinds are all optional. The streak is one optional record (K3).
- **No back-pay by default:** the chronicle reads forward from where it stopped, so crafts count from the day of install.
- **The walls already standing** in the live campaign would earn nothing, since they were raised before `fortified` existed. **Decided (D-80), and built in stage 1:** a one-time migration (`wallsStanding`) posts each wall level standing at install, and the first close pays it.
- **Ranks never fall** (P2-15), so K7's offset takes no rank away.
- **A dare open at install** is judged as a dare.
- **F1 and F2** add nothing that needs migrating: the Grace level is already in the save, and a queued second march is an optional field on the day's orders. Both take effect from the day of install.
- **Rules version:** 3.15.0 for stage 1.

## 11. Measuring it

**The automatic player learns to:**
- wall its frontier (hexes facing a rival at Tension or War, and those beasts keep taking);
- send companies by a tag plan;
- accept the commissions it can meet;
- buy Castle IV.

**New readings:**
- **G-28, crafts are played:** craft deeds are 10 to 20% of a Steadfast campaign's Renown, each craft at least 2%; the walls a campaign buys.
- **G-29, Respect is earned:** for each ruler, the share of the Respect he gives that comes from deeds the player chose (commissions, deals, the streak) is at least 40%.
- **G-30, commissions are answered:** at least 60% accepted; of those, 50 to 80% met.
- **G-31, a build shows:** a player massing one tag has that tag's path highest at week 26 in at least 75% of campaigns.
- **Reported:** each path's signature and craft share by quarter; the streak's lengths; E1's and E2's readings.
- **For F1:** a second targets run with the Grace's opposition effects off, beside the usual one; then the share of Steadfast's defenses against the stronger hosts that are won, and what they pay.
- **For F2:** the share of days each profile earns the second march, and what it does to G-11's windows. The automatic player queues it whenever it has a target.

**Kept:** G-11's windows, G-19, G-20 and G-21. **Read again:** G-06, G-07, G-10 and G-17.

## 12. Suggested order

1. **Stage 1, the crafts** (rules 3.15.0): K2 to K5, X2 and X3, the automatic player and the new readings. Walls and the streak are Rich's own two examples and serve his campaign at once. **Built** (2026-11-12), with these differences from the text above:
   - **X5 is in this stage.** The three rare deeds are dropped, since they are deeds and stage 1 is where deeds change. A courtship won against Skivvet's bid now earns K4's deal deed; the other two earn nothing more.
   - **The streak has a record in the save** (K3, as built).
   - **The automatic player walls one level a day:** a hex beyond the protected rings that was attacked twice in the last 14 days, or touches a ruler at War, to level 2, when the level costs at most 10% of the purse. These are the simulator's player's habits, not rules. A first, more eager habit (every hex facing a ruler at Tension or War, at 15%) raised 214 levels a campaign and starved a weak player's army.
   - **The numbers moved once** on the simulator's first reading (D-81): a wall level raised 0.4, a mythic beaten 0.75, and the Dominion marks as K7 says.
   - **X3 is −1, not gone** (D-82, Rich's call on that reading). With no penalty Skivvet sat at Peace 69% of his weeks and ended by an Accord nearly every time; at −1 he is at Peace 42% and Tension 53%, and two rulers a campaign are resolved by terms again.
   - **Where it reads now** (740 campaigns): victory in weeks 54 / 59 / 64 for Perfect / Steadfast / Committed; crafts 18% of Renown. Two targets are missed: G-05 as before, and G-22 by 3 points at band 4.
   - **Screens kept small:** the Herald's lines for the five new deeds, the streak as a line on Ugrak's court, and the new rows in the guide and How to Play. L3 and L4 (the tidings and the orders panel) wait for stage 4.
   - **G-28 is the only new target here.** G-29 to G-31 need commissions and banners (stages 2 and 3).
2. **Stage 2, the banners** (3.16.0): K6, the orders panel's split, the tag marks, and K7's offset from the simulator.
3. **Stage 3, rulers who act** (3.17.0): R1 to R6 and their lines, X1, X4 and X6.
4. **Stage 4, the day and the week** (no rule change): L1 to L4, X7 and X8.
5. **Stage 5, the long game** (3.18.0): E1 and E2, measured first, and E4's readings. With F4: the Chronicle's record of the realm that won, and the victory page.
6. **Stage 6, the Grace turned** (F1; 3.19.0): the stronger hosts and their prizes, sized from the run made in stage 1. Its numbers come to Rich as a short spec of their own before it is built.
7. **Stage 7, the second march** (F2; 3.20.0): after stage 5 has measured a second daily assault. Its own short spec too: what earns it, Castle IV's new perk, and the offset.

Each stage is installed when it is done, and each carries the live campaign forward in place.

**Where the other pillar rulings land:**
- **F1's measuring run** is made during stage 1, beside the stage's own targets run.
- **F3** shapes stage 3: its lines are drafted as parts and sheets.

## 13. Decisions needed

**The frame is decided (D-79):** F1 to F4, each as recommended. Two things inside F2 stay open for its own spec: what earns the second march, and Castle IV's new perk.

**The parts are decided (D-80):** all 14 below, each as recommended. For the two where the text gave no single recommendation: K5 is mythics for Emrys, as proposed, and X5 drops the three deeds. They stay here as the record.

1. **K1:** may a path's Renown come from its craft, anywhere? This widens D-18.
2. **K2 and K3:** walls and the field streak as proposed? The streak's holds (Respite, away)? Ugrak's raid weight from +3 to +2?
3. **K4 and K5:** deals in any march? Mythics for Emrys, or his surges alone?
4. **K6:** banner share, with the craft share at 30%? Massed banners at × 1.5?
5. **K7:** the offset left to the simulator, with G-11 kept?
6. **R1:** commissions in place of dares (recommended), or in turn with them?
7. **R2 to R6:** each yes or no. R4, Ugrak scorning walls, is the optional one.
8. **L1 to L4:** each yes or no.
9. **E1 and E2:** measure first? **E3:** the Reign in its own patch?
10. **X3:** Skivvet's bid penalty gone? **X5:** drop the three rare deeds?
11. **The live campaign:** credit the walls already standing?
12. **The writing:** who drafts the parts and lines, option 1 or 2?
13. **The order** of section 12?
14. **The empty-lane dodge:** leave it, or reopen it?
