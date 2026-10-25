# Patch 7 proposals (for Rich's approval)

Written 2026-10-24, after the [player audit](audit-2026-10-24.md) and Rich's answers to it. Each item says what would change, where and why.

**Status (2026-10-24):** Rich approved everything as recommended: B1 to B8 (B5 refuses at Peace), the principle and E1 to E8, A1a option 1, A1b, the A1c targets, A2 option 1, W options 1 and 2, and C2 to C7. **Stage 1 is built:** sections 1 and 2, rules 3.6.1 (D-55). Sections 3 and 4 are approved and not yet built (D-56).

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
