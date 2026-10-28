# Patch 7 proposals (for Rich's approval)

Written 2026-10-24, after the [player audit](audit-2026-10-24.md) and Rich's answers to it. Each item says what would change, where and why.

**Status (2026-10-25):** Rich approved everything as recommended: B1 to B8 (B5 refuses at Peace), the principle and E1 to E8, A1a option 1, A1b, the A1c targets, A2 option 1, W options 1 and 2, and C2 to C7.
- **Stage 1 is built:** sections 1 and 2, rules 3.6.1 (D-55).
- **Stage 2 is built:** A2 and W, rules 3.7.0 (D-57); its report is section 6.
- **Stage 3 is built:** A1 and C4, rules 3.8.0 (D-59), with the Marshal pressing on (D-60); its report is section 7.
- **Not yet built:** C2, C3, C5, C6 and C7 (D-56).

Rich's direction (2026-10-24):
- **A1:** no set intervals; soft thresholds instead, so things can't be taken too fast or too slow. A player who never attacks must not win. Forgiving, but not so forgiving that the game needn't be played.
- **A2:** difficulty should grade and depth should still feel tougher, through some measure that weighs Valor against how deep the player attacks.
- **Bugs:** fix them all.
- **Explanations:** fewer repeats, with each rule found in the most logical place.
- **The world:** can rivals take land in other regions, so the marches change without the player?

## 1. Bug fixes

These change no rule except B4 and B5, which only stop offering choices that can't do anything. They need rules **3.6.1** with no migration; the live campaign carries forward in place.

| # | Bug | Proposed fix | Where |
| --- | --- | --- | --- |
| B1 | Choosing a target from the **Assault** dropdown sends no companies and stops the Marshal pressing the siege that day, so nothing attacks | With no companies on that assault yet, choosing a target picks them as **Lay siege** does (the companies best matched to that hex). With companies already on it, only the target changes. The same applies to the extra assaults from Castle IV and the Siege Park, using companies not already sent | `OrdersPanel.tsx`; `view/orders.ts` |
| B2 | The Herald's **Grand Battles** heading also covers tomorrow's foreseen surge, Goblin bids and buy-backs, and uprisings | Rename the section **Coming up** | `Herald.tsx` |
| B3 | 45 text lines print dates as `2027-02-11` ("Scorched until 2026-10-21", the Ultimatum card) | `t()` writes any date fact as "Thu, Feb 11". One change covers every line | `lib/game/text.ts` (reusing `shortDay` and `weekdayOf`) |
| B4 | Battle orders that can't do anything get offered: Arcane Ward against beasts that cast nothing, Bribe against a host of mythics, Foresight in the last round | When a battle's order deck is built, orders that can't apply in it go to the bottom. That covers Arcane Ward when no enemy casts a Spell or Volley, Bribe when every enemy is a mythic, Volley, Barrage and Dragonfire when none of your fielded companies is ranged, Firestorm when none is Arcane, and Siege Engines when no enemy Braces. Foresight never lands in the last round's hand. Battles already begun keep their saved decks | `orderDeck` in `grand.ts` (used by Grand Battles and daily skirmishes) |
| B5 | A Truce (150) and a non-aggression pact (250) are sold to a rival already at Peace, where they buy nothing but +2 Respect | At Peace, both show "Not needed: at Peace he sends no raids or conquest attempts" and can't be struck | `land.ts` deal checks; `view/audience.ts` |
| B6 | Player text still speaks of **rings**, which the map no longer shows | Shieldwall becomes "walls count double on your hexes deep in the marches (depth 5+ in a rival's march, 3+ in a lair's)". "Rings 0 to 2" becomes **the heartland** everywhere: the Homecoming, a battle report, two Healer lines, the Herald's "never sold", the deal requirements, a refusal and the battle summary. In How to play, strongholds sit at **depths 4 and 8**, and village tithes and loyalty "grow with depth; each village's panel shows its own" | `view/realm.ts`, `Homecoming.tsx`, `data/text/*.json` (plain-fact wording only), `view/diplomacy.ts`, `view/refusals.ts`, `view/battle.ts`, `HowToPlay.tsx` |
| B7 | The Archive lists the campaign's contracts, then says "Contracts closed 0 … The shelves are bare" below them | In a campaign, the ledger's section (its stats, search and empty shelf) shows only if the ledger has contracts of its own, under its heading "The ledger's contracts" | `ArchivePage.tsx` |
| B8 | The four rumors never change: each rival's spending split is fixed, so his top spend is always the same | Once a week at the close, each rival's rumor is drawn from what he actually spent that week, weighted by amount (seeded). It shows on his court all week and in that week's first Dawn tidings, not every morning. No new text: the four existing lines | `rivals.ts` (the rumor step); `view/shell.ts` |

## 2. Explanations: one home for each rule

### The principle

Every rule is written in full exactly once, in one of two rulebooks:
- **How to play** for the rules everyone shares.
- **How each rival works** for everything one ruler does differently.

Screens show what is true now and what it means now, in one line. A small **?** beside that line opens the full rule at the right place: a new `openHelp(section)` that opens How to play at a section, or the rival's guide.

The alternative would be the full rule beside the button and only pointers in How to play. I don't recommend it, because most rules touch several screens and would end up written several times.

### The moves

| # | Today | Proposed |
| --- | --- | --- |
| E1 | Each court spells out what his standing means, his Peace and War lines, how long a standing holds, and everything he respects and resents | One line: "Tension: raids, no conquest attempts · Peace at +40 · War at −25", with a ?. What he respects and resents is already in his guide's deed table |
| E2 | Each court lists every Respect mark: 7 to 12 lines | Keep the meter with its notches. Under it, two lines: the next mark up ("55: Accord talks open, 10 to go") and the next mark down. The full list moves to a new **His marks** panel in his guide |
| E3 | The front rules are written on all four courts, and "At War this week: they skirmish…" under every front (eight times) | Each front keeps its state badge, its tug of war, and the Emboldened/Humbled line when the marker is at an end. The badge's tooltip says what that state does this week. The rules live once, in How to play › The rivals' own wars |
| E4 | The Orc's court explains how his war track moves (also in his guide and in How to play) | The court keeps the bar and what it does now. How it moves lives in his guide; How to play keeps one line and a ? |
| E5 | How to play › Diplomacy and Respect holds each ruler's Respect drivers (a long paragraph) and a four-ruler marks table; The four rivals repeats each march's numbers | How to play keeps the shared rules: what Respect is, Peace/Tension/War, the 5-point hold, deals, stance and the rivals' wars. The per-ruler drivers, marks and march numbers live only in each ruler's guide. The four rivals becomes one line per ruler with a link to his guide |
| E6 | The Respite rule is written in full on the Contract page and again in How to play | How to play › Contracts keeps the full rule. Under the Respite buttons: "A paid day off: nothing to log, paid at your Realm Consistency; one earned every 7 days ?" |
| E7 | The pacing rule is in How to play › Winning and again in every rival guide | Only in How to play › Winning (and it changes with A1). Each guide keeps that ruler's own ways to be resolved |
| E8 | The siege line under the orders repeats the general rule ("On any day without orders of your own, the Marshal presses it") | Keep the siege's state (worn, garrison, days to fall). The Marshal's rule lives in How to play › Taking land, with a ? |

## 3. Design proposals (rule changes)

These change the rules: **rules 3.7.0**, carried forward in place with no migration. The live campaign has resolved no rival yet, so a new pacing rule meets it cleanly. Each needs simulator tuning after approval, reported as before, with Rich deciding the numbers. First-guess numbers are marked TUNE.

**How a player who never attacks wins today.** By diplomacy and by waiting:
- The Dwarf and the Archmage by **Accord**: their Respect rises from your habits, then 30-day Accord contracts carry it to 100.
- The Goblin by Accord or by accepting his **terms**.
- The Orc by winning **his last battle**, which he brings to your border.

The turtle still gains about 40 hexes by courting villages and paying bribes. It reaches all four between weeks 62 and 72, because the 12-week pacing is the real limit for everyone.

### A1a. Pacing: progress instead of the calendar

1. **Dominion marks (recommended).** The calendar rule goes (none before week 16, then one per 12 weeks). Each resolution needs the realm's total Dominion to reach a mark instead: about **650** for the first, **1,700** for the second, **2,500** for the third and **3,300** for the fourth (TUNE). Dominion is public: Renown that never falls, plus Holdings that follow the land you hold. The runs give the week each style crosses each mark:

   | Player | 650 | 1,700 | 2,500 | 3,300 |
   | --- | --- | --- | --- | --- |
   | Perfect | 16 | 31 | 41 | 48 |
   | Steadfast | 20 | 33 | 46 | ~55 |
   | Committed | 25 | 46 | 56 | ~64 |
   | Turtle (never assaults) | 34 | not by 58 | — | — |
   | Monthly (game side once a month) | 61 | not by 70 | — | — |

   That lands each style a few weeks ahead of R-17's windows (Perfect 50–56, Steadfast 58–64, Committed 64–72) without a fixed date. Tuning would raise the later marks a little, and A2 and W also change how fast Dominion grows. Doing more makes the next mark come sooner, but Dominion builds at a bounded rate, so nobody can sprint. Losing land lowers Holdings, so it is soft both ways. A rival ready early waits for the mark, and his court says so: "Ready to yield: the realm needs Dominion 1,700 to take another (1,420 now)." The week-36 floor on defeat stays.
2. **Strain.** No calendar. Each resolution adds Strain that fades each week (TUNE). While it is high, the remaining rivals stiffen: terms need more, Accord Respect rises more slowly, capitals hold stronger. Gaps vary, but it still feels like a cooldown, and it doesn't stop a turtle.
3. **Each rival's own conditions only.** No realm-wide gate; each road is made longer on its own. The most world-like, but the least control over length, and resolutions can bunch up.

### A1b. Every road needs the realm

So that habits alone don't win:
- **Accord:** talks need Respect 55 and **his path at rank I**, which is Dominion 110 on his path (TUNE). You get there by holding some of his march's wilds, beating his raids, or other deeds against him. You can't ally with a ruler you have never dealt with. Habits still carry the Respect and the Accord contracts.
- **Terms:** at least one of the measures he weighs must come from your war with him: land of his march held, or victories over him.
- **Unchanged:** defection (it needs his villages), conquest (it is battles) and the Orc's last battle (it is a battle).

### A1c. Forgiving, but it must be played

The kindness stays:
- Three weeks away costs about 1 to 3 weeks.
- The Marshal presses a standing siege on his own.
- Nobody falls before week 36.
- Health records are never touched.

Proposed targets for the tuning:
- A player who plays the game side **once a week** wins by about week 76.
- A player who plays **once a month** never falls, but doesn't win by week 76.
- A player who **never assaults** doesn't win by week 76.

### A2. Reach: difficulty that weighs Valor against depth

1. **Reach (recommended).** Each dawn, every march gets a **reach**: the depth your realm can patrol. It weighs your defense (the Marshal's best defense banners) times your Valor over the last 7 days against that march's depth curve, factor TUNE.
   - **Where you see it:** a soft line across each march on the map, and on every hex panel: "Within your reach", "At the edge", "2 beyond your reach".
   - **Within reach:** beasts and mythics strike at ×0.8 of the hex's strength (TUNE). The frontier is patrolled.
   - **Beyond reach:** they strike at full strength plus 10% a step (TUNE, capped at ×1.3). An assault beyond reach loses 10% a step (supply).

   Depth still makes everything harder, because the curve is unchanged. Good weeks push the line deeper and a bad week pulls it in, so the hexes at risk are the ones you are overextended on. The loss rate becomes something habits can win.
2. **Valor-weighted strikes.** Beasts and mythics strike at their strength × (1.15 − 0.3 × your 7-day Valor) (TUNE). Simpler, with no new map idea, but invisible.
3. **Keep the rule and change only how losses read.** Words only. It doesn't solve the problem.

Proposed targets:
- A Steadfast player loses at most about 40% of defenses in weeks 9 to 20 (70 to 75% today).
- Bad weeks lose at least twice the land of good weeks (G-08; 1.37× today).
- Depth still shows: assault days per hex rise with depth.

### W. A living map: rivals take land

Measured today: in a whole 60-week campaign the rivals gain **6 hexes**, all villages courted in weeks 2 to 4. They never take land from each other (Border Campaigns were dropped by R-26).

1. **Rivals claim their own wilds (recommended).** A rival's grab becomes a siege like yours. Each week he picks a wild hex touching his land in his march and wears it down daily with his army, each in his own way:
   - **The Orc:** fast, and loses some back to beasts.
   - **The Dwarf:** slow, but walls what he takes.
   - **The Goblin:** also buys villages, as he does now.
   - **The Archmage:** his ebb days help him.

   A march you neglect visibly fills in, which makes D-19's hardening something you can see. The Herald reports it ("Hrodgar took Stonebriar"). Hexes a rival holds are harder for you than wilds, so letting a march go means meeting its rival sooner.
2. **Rival wars move borders (recommended with 1).** While a front's marker sits at an end, the Emboldened rival takes one hex of the Humbled rival's land along their seam each week. A call to arms becomes a way to carve up a rival's march.
3. **The wilds fight back.** Beasts and lair mythics can retake hexes from rivals too, so the map breathes both ways. Possible later; it adds churn.

The guardrails stay:
- The heartland can never be taken.
- Your hexes change hands only by the existing conquest attempts.
- No new losses for you while you are away (R-24).

Rival land counts toward Power as now, so the Ultimatum and coalitions are retuned to keep G-19, with a Steadfast player's falls under 5%.

Proposed target: each rival's land changes by at least 2 hexes a month without the player, and two seeds' maps look visibly different by week 26.

## 4. Optional polish (approve each)

| # | Proposal |
| --- | --- |
| C2 | The Assault list sorts by how soon each hex falls ("today", "about 3 days", "a long siege") and shows its path. Only figures already on screen are used |
| C3 | Today's threat, the standing siege and strongholds show at every zoom, and ownership gets a stronger tint and border |
| C4 | A **road to victory** strip on Diplomacy: "Rivals resolved 1 of 4 · Dominion 1,420 of 1,700 for the next", showing which rival is ready (with A1a option 1) |
| C5 | Whole numbers on screen for garrison, tribute, spoils, Respect and health. The battle log's "12.43, dealt 9.94" gets labels: struck, and what got through after armor |
| C6 | The Ultimatum card names what to do, without numbers: "Beat his raids, take his land and win his battles before the week closes", with friendly dates (B3) |
| C7 | The top bar's "PURSE · 96% · GRACE II" names its parts, for example "Consistency 96%" |
| C8 | The Marshal picks his Grand Battle companies for the slots, so ranged companies fill the rear before a melee company sits there idle. Or leave it as a place where your own formation beats his |

## 5. Decisions needed

1. **Bugs B1 to B8:** go? B5: refuse a Truce and pact at Peace, or keep them and say what little they add?
2. **Explanations:** the principle (two rulebooks, one-line state with a ?) and moves E1 to E8?
3. **A1a:** option 1 (Dominion marks), 2 (Strain) or 3 (each rival's own conditions)?
4. **A1b:** rank I on his path for Accord talks, and a war measure for terms?
5. **A1c:** the three engagement targets (weekly wins by ~76; monthly and never-assaults don't)?
6. **A2:** option 1 (Reach), 2 (Valor-weighted strikes) or 3 (words only)?
7. **W:** which of 1, 2 and 3?
8. **Polish:** which of C2 to C8?

**Suggested order:** the bugs and explanations first (3.6.1, small and safe), then A2 and W together, since both are about the map, then A1, since it depends on how fast Dominion grows once A2 and W are in.

## 6. Stage 2 report: Reach and the rivals taking land (rules 3.7.0)

Built 2026-10-25 from A2 option 1 and W options 1 and 2 (D-56, recorded as D-57). Every number below is a first guess the simulator settled; Rich decides them (D-02).

### 6.1 What was built

- **Reach** (`lib/game/reach.ts`). At each dawn the realm's patrol is the Marshal's best defense banners against beasts, with the walls, at the Valor of the 7 days before.
  - A rival march's reach is the deepest depth whose beasts strike no harder than 1.6 × the patrol, plus one depth per rank of the player's path on that rival. The lairs use their own, steeper curve.
  - Within reach, beasts and mythics strike at 0.72 × the hex's strength. Beyond it they strike 10% harder a step (up to 30%), and an assault there faces its garrison 10% stronger a step (up to 30%, supply). Raids and conquest attempts are unchanged.
  - While the player is away (14 days without opening the app) the reach holds where it was: absence costs nothing (X-17).
  - **On screen:** the map shades the land beyond reach, with a key entry. Each march hex's panel says "Within your reach", "The edge of your reach" or "N steps beyond your reach", with what that does, and now shows its band. How to play › Defending holds the full rule.
- **W1, rivals besiege their own wilds** (`pressWildSiege` in `rivals.ts`). From week 3 each rival besieges one wild hex of his march touching his land, adding a share of his army each day until it falls.
  - **The Orc** spearheads toward you (the weakest garrison, which lies shallowest) at 1.5× pace, but the beasts take back each hex he won with a 10% chance a week.
  - **The Goblin, the Dwarf and the Archmage** fill their marches in (the hex touching most of their land). The Dwarf goes at 0.6× pace and walls each hex he takes; the Archmage goes 1.5× on a day his surge is an ebb.
  - The Herald tells each hex taken or lost ("Ugrak took Cinderheath."). Each ruler's guide has a "His wilds" line.
- **W2, rival wars move borders** (`frontBorders`). Each week a front's marker stands at an end, with a 50% chance the winner gains: he takes the loser's hex touching his own land.
  - **Needs your confirmation:** the rivals' lands start at depths 9 to 13 and touch only at the seams near the heartland, which you usually hold. Taken literally, the rule would almost never fire.
  - So where their lands don't touch, the loser's frontier hex nearest the heartland falls to the wilds and the winner's own siege of the wilds falls at once. Both marches still move, and a call to arms still carves up a rival.
  - The alternative would be to let the winner take a hex across the highlands as an outpost inside the loser's march.
- **Simulator:** two new targets. **G-22** (A2): defenses lost in weeks 9 to 20, at most 40%; and defenses lost by band, rising with depth. **G-23** (W): rival land moving at least 2 hexes a rival a month, and seeds' maps differing by week 26.
  - G-22's depth half was first measured as assault days per hex by band. That doesn't rise even when depth is harder, because the player assaults deep hexes only once the army is strong enough. Defense losses by band measure it directly.

### 6.2 What the simulator found

Five full runs of the targets (720 campaigns each). The last is [`docs/game/sim/targets-3.7.0.md`](../game/sim/targets-3.7.0.md).

| Run | Change | G-22 lost wk 9–20 | G-08 bad ÷ good | G-06 focus | G-17 | G-05 | G-10 | G-11 Steadfast | Save size |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.6.0 | (before) | 57% (est.) | 1.37× | 2.47× | 100% | 16% | met | 58 | 1.79 MB |
| 1 | first guesses (0.7 within, rival press 0.08) | 38% | 1.95× | 1.57× | 68% | 6% | missed | 58 | 1.88 MB |
| 2 | 0.75 within, press 0.12, path ranks extend reach | 41% | 1.88× | 1.53× | 79% | 7% | missed | 58 | 1.88 MB |
| 3 | 0.72, press 0.16, the Orc 2× pace and 5% losses | met | met | 1.31× | 73% | 8% | missed | met | **2.01 MB** |
| 4 | run 2 with the Orc spearheading and the others filling in | 42% | 1.90× | 1.61× | 74% | 7% | **met** | 58 | 1.81 MB |
| **5 (built)** | run 4 with 0.72 within | **39%** | **2.25×** | 1.64× | 65% | 7% | missed | 57.5 | 1.84 MB |

- **What A2 did:**
  - A Steadfast player's defenses lost in weeks 9 to 20 fell from about 57% to 39%.
  - Losses now rise with depth: 25% at band 3, 29% at band 4, 45% at band 5.
  - Bad weeks lose 2.25× the land of good weeks (G-08 met for the first time).
  - Land lost against land gained fell from 13% to 3%.
  - Land pace (G-04) and the campaign's length (G-11) hardly moved.
- **What W did:** each rival's land changes by about 3 hexes a month without the player, and every seed's map is its own by week 26. Falls stay at 0%; Ultimatums are 55% for Steadfast (75% before). The save stays under 2 MB.

### 6.3 Every target in the built version

Met: G-01 to G-04, G-07, G-08, G-09, G-12, G-13, G-15, G-16, G-18 to G-23. Missed: G-05, G-06, G-17. On their edges (met in run 4, missed in run 5, within the noise of 40 seeds): G-10 (the Orc's march against the Goblin's for the most defenses a hex) and G-11 (Steadfast's median victory week 57.5 against 58 to 64).

**After D-58** (the report regenerated, values identical to run 5): G-06 is met at 1.64× against 1.5×. G-05 is accepted as missed. G-17 is still missed: 65% against the new 75%. The 75% recommendation was read from run 4 (74%), not the built run 5. To revisit after A1, which asks for path rank I before an Accord and so may change how players pursue paths.

### 6.4 Decisions for Rich

**Decided 2026-10-26 (D-58):** Rich took every recommendation below: G-06 retargeted to 1.5× and G-17 to 75%, G-05 accepted, W2's fallback confirmed, the built numbers kept.

1. **G-06 and G-17, a focused path pays.** The focused path now leads the next by 1.64× at week 26 (target 2×), and its path ends with the most deeds and Dominion in 65% of campaigns (target 90%).
   - **Why:** with defenses won far more often, every rival's path earns Renown from beaten raids and beasts, wherever the player focuses. Reach doesn't hold the focused player back: their path's rank pushes their reach ahead of their frontier.
   - **Options:**
     - (a) **Recommended:** retarget G-06 to 1.5× and G-17 to 75%. The focused path still leads clearly, and every one-path player still reaches rank V.
     - (b) Halve the Renown a beaten raid or beast attack adds to its rival's path (D-18 numbers), then re-run.
     - (c) Leave both as missed.
2. **G-05, the map lasts.** At week 60 the least-held rival march is 93% the player's (target: at least 10% left).
   - **Why:** the player now keeps almost all the land they take.
   - **Options:**
     - (a) **Recommended:** accept it, since Steadfast wins in week 58 and Perfect first holds every claimable hex in week 61, after victory.
     - (b) Press the rivals' sieges harder (run 3 tried 0.16: G-05 only reached 8%, and G-06 and the save size got worse).
3. **W2's reading.** Confirm the fallback in 6.1 (the loser's frontier hex falls to the wilds and the winner's siege falls), or ask for the outpost variant.
4. **The numbers.** Confirm or change the built numbers: reach 1.6 × patrol, 0.72 within, 10% a step beyond (cap 30%), supply 10% a step (cap 30%), one depth a path rank; sieges 0.12 of the army a day; paces 1.5 / 1 / 0.6 / 1; the Orc's 10% loss a week; the Dwarf's wall; the Archmage's 1.5× on an ebb; W2's 50% a week.

## 7. Stage 3 report: A1, progress instead of the calendar (rules 3.8.0)

Built 2026-10-26 from A1a option 1, A1b and the A1c targets (D-56, recorded as D-59). Every number below is one the probes settled; Rich decides them (D-02).

### 7.1 What was built

- **A1a, Dominion marks** (`resolutionAllowed` in `state.ts`). The calendar is gone: no "not before week 16", no "one per 12 weeks".
  - Each rival resolved needs the realm's total Dominion at a mark first: **650** for the first, **1,800** for the second, **2,700** for the third and **3,650** for the last.
  - The proposal's first guesses (650 / 1,700 / 2,500 / 3,300) let Steadfast and Committed win 4 to 6 weeks early, so the later marks went up.
  - A rival ready before his mark waits: a signed Accord, a defection, a surrender offer, the Orc's last battle. The Capital battle is still refused while a win couldn't resolve him.
  - A realm already past two marks at one week close resolves two rivals there. The calendar never allowed that.
  - Each resolution's event records the Dominion that met its mark.
- **A1b, every road needs the realm.**
  - **Accord:** talks also need his path at **rank I** (Dominion 110 on it). This is checked before his Respect, so the Accord panel says "Accord talks need his path at rank I (Dominion 110 on it): hold land of his march, or win deeds against him."
  - **Surrender:** the Goblin's and the Archmage's surrender need a war with him (`hasFought` in `terms.ts`): **20%** of his march held, or a Grand Battle won for a hex of his (his Gate, a stronghold or his capital).
  - **Unchanged:** the Dwarf (his two thirds is already a war), the Orc's last battle (a battle) and defection (his villages).
- **C4, the road to victory, on screen.**
  - Diplomacy opens with a strip: "Rivals resolved 1 of 4 · Dominion 1,501 of 1,800 for the next · Emrys waiting for it", with a ? to How to play › Winning.
  - A court whose end waits on the mark says so, in crimson under his stance. For example: "His Accord is signed: he joins you once the realm's Dominion reaches 1,800 (1,501 now)."
  - Others read "Ready to yield, but he offers no terms until …" and "Ready for his last battle once …".
  - How to play › Winning holds the whole rule. Each guide's Accord and terms lines name rank I and the war.
- **Tests:**
  - The calendar tests now step through the marks.
  - Test 10's crude players resolve at most two rivals in 70 weeks now, so it checks every resolution against its mark from the event, in place of needing a victory.
  - New tests cover rank I, the war check, the road strip and the waiting lines. All 911 tests pass.

### 7.2 What the probes found

Each player style played 6 seeds to week 80 or 90 through the game's own autoplay (the audit's probe). The table gives the median victory week, the range across seeds, and how many rivals were resolved by week 76 when there was no victory.

| Player | 3.7.0 (the calendar) | No pacing at all | A1, first-guess marks | **A1 as built** | Target |
| --- | --- | --- | --- | --- | --- |
| Perfect | 53 (53–55) | 27 | 51 (49–54) | **55 (53–56)** | 50–56 |
| Steadfast | 58 (56–61) | 33.5 | 54.5 (52–58) | **60 (57–62)** | 58–64 |
| Committed | 64.5 (59–73) | 46 | 60.5 (59–64) | **65 (63–67)** | 64–72 |
| Weekly (the game side once a week) | 59.5 (59–61) | 57 | none by 80 (1 to 3 resolved) | **none by 90 (1 or 2 resolved by 76)** | wins by about 76 |
| Monthly (once a month) | 64.5 (62–70) | 45 | none by 80 | **none by 90 (none resolved)** | no win by 76, never falls |
| Never assaults | 66.5 (60–73) | 62 | none by 80 | **none by 90 (1 resolved)** | no win by 76 |

- **What A1 did:**
  - The three daily players now win in their R-17 windows by their own pace, with no date.
  - The once-a-month and never-assault players no longer win: under 3.7.0 the calendar carried them to victory by week 70.
  - Nobody fell.
- **What it missed:** the weekly player. Under 3.7.0 they won with everyone else, around week 60. Now they don't win by week 90.
  - **Why:** they take about one hex a week. All 72 of their assaults won, but their standing siege ends when its hex falls, and they name the next one only at their next visit.
  - So their Dominion grows at about the never-assault player's rate: 630 at week 40, against 1,900 for Steadfast.
  - No single set of marks can hold the daily players to their windows and still let the weekly player through by week 76, since the weekly player's Dominion is about a third of theirs.
- **A prototype that fixes it (not built; probed through a scratch hook):** the Marshal presses on. When the standing siege's hex falls, he lays the next one on the weakest hex beside it that a daily assault may take, never a stronghold.
  - **Weekly:** wins in weeks 72 to 78 (median 75.5), resolving 3 or 4 rivals by week 76.
  - **Perfect, Steadfast and Committed:** each moves by a week at most, since they name their own target every day.
  - **Monthly:** resolves 1 rival by week 76 and doesn't win by 90.
  - **Never assaults:** unchanged, since they lay no siege.

### 7.3 Every target in the built version

One full run of the targets (720 campaigns) before D-60 is summarized below. The report in [`docs/game/sim/targets-3.8.0.md`](../game/sim/targets-3.8.0.md) is the final run, with the Marshal pressing on and G-07 at 5 weeks (D-60).

**Final run (D-60):** every target is met but G-05 (accepted, D-58) and G-17 (65%, as since 3.7.0).
- **G-07:** met at 64 / 65 / 61 / 60.
- **G-10:** met again (the Orc's march now has the most defenses a hex, on the edge as before).
- **G-08:** bad weeks lose 2.47× the land of good ones.
- **G-11:** 56 / 58 / 64.
- **Ultimatums:** 80% of Steadfast campaigns, with no falls.

The first run, before D-60:

- **Met:** G-01 to G-04, G-06, G-08, G-09, G-11 to G-13, G-15, G-16, G-18 to G-23.
- **Missed as before:** G-05 (accepted, D-58), G-10 and G-17 (65%, the same as 3.7.0).
- **Newly missed:** G-07.
- **G-11, the campaign's length, is met with no calendar.**
  - **Perfect:** median week 56 (window 50–56).
  - **Steadfast:** 58 (window 58–64).
  - **Committed:** 64 (window 64–72), and it now wins by week 76 in every campaign (80% under 3.7.0).
  - **Wavering:** 77 (82 under 3.7.0).
  - All three windows are met at their edges. The marks hold the styles closer together than the calendar did: Perfect and Steadfast are 2 weeks apart, not 4.5.
- **G-07, every mix can win.** Every steered mix still wins every campaign, but their median weeks now spread over 5 weeks (target: within 3).
  - **One path:** 64.
  - **Two halfway:** 65.5.
  - **Three a third:** 62.
  - **All four:** 60.5.
  - Under the calendar every mix waited for the same dates (56 to 58). Now the focused players' first resolution comes 4 weeks later (week 26 against 22).
- **G-19, defeat stays rare.** Falls stay at none. But more Steadfast campaigns now see an Ultimatum: 86%, against 55% under 3.7.0 and 75% under 3.6.0.
  - **Why:** the rivals stay active longer through weeks 36 to 50. The second resolution comes at week 40, not 33, so one of three rivals more often reaches 1.5× the realm's Power.
  - Every Ultimatum is still lifted or won.

### 7.4 Decisions for Rich

**Decided 2026-10-27 (D-60):** Rich took every recommendation below. The Marshal presses on is built: the weekly player now wins in weeks 74 to 79 (median 75.5). G-07 is retargeted to within 5 weeks, the Ultimatum rate is accepted, both readings are confirmed, and the built numbers stand.

1. **The weekly player (A1c).** As built, a player who opens the game side once a week doesn't win by week 90 (target: by about 76). The probes in 7.2 explain why.
   - **Options:**
     - (a) **Recommended: the Marshal presses on.** When the standing siege's hex falls, he lays the next one on the weakest hex beside it that a daily assault may take. Never a stronghold, whose fall is a Grand Battle the player calls.
       - This is A1c's kindness taken one step further: the Marshal already presses a standing siege on the days you give no orders.
       - **Probes:** the weekly player wins in weeks 72 to 78 (median 75.5).
       - **Full targets run with it:** every verdict is unchanged. Perfect, Steadfast and Committed still win at 56, 58 and 64. Monthly and never-assault players still don't win.
       - The player can still lift a siege any day, and the Herald would say where the siege moved ("The Marshal lays siege to {hex}.", a plain-fact line).
     - (b) Retarget A1c: a weekly player resolves two rivals by week 76 and wins later.
     - (c) Lower the marks. The daily players would then win outside R-17's windows.
2. **G-07, every mix can win.** The steered mixes now win 5 weeks apart (target: 3), since the marks read total Dominion and a player who walks one path builds it a little more slowly than one who walks all four. Every mix still wins every campaign.
   - A run without A1b's rank I gave the same spread (64 / 65 / 61 / 60.5), so rank I isn't the cause.
   - **Options:**
     - (a) **Recommended:** retarget G-07's victory weeks to within 5. Focusing pays in the path's perks (G-06 is met at 1.64×) and costs a few weeks of total Dominion.
     - (b) Leave it as missed.
3. **Ultimatums (G-19).** 86% of Steadfast campaigns now see one (55% under 3.7.0, 75% under 3.6.0); falls stay at none.
   - **Options:**
     - (a) **Recommended:** accept it. It is the mid-game threat working while three rivals stand, and every one is lifted or won.
     - (b) Raise the Ascendancy ratio (1.5×) a little, then re-run.
4. **Readings to confirm:**
   - **War means battles you bring.** Only a Grand Battle you call for his Gate, a stronghold or his capital counts toward "fought him", not his own Incursion or Warhost beaten off. Counting those would let the player who never assaults take the Archmage's surrender.
   - **Two marks at once resolve two.** A realm already past two marks at one week close resolves two rivals there (it happens only when the rivals were ready late). The alternative is at most one per close.
5. **The numbers.** Confirm or change the built numbers:
   - Marks 650, 1,800, 2,700 and 3,650.
   - Rank I (Dominion 110) for Accord talks.
   - A fifth of his march held for "fought him".
