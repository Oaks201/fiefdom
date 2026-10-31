# Patch 8 proposals: rivals worth talking to (for Rich's approval)

Written 2026-10-29, on branch `patch-8` (from Patch 7, 0db00d4, rules 3.8.0).

**Status (2026-10-29):** Rich approved everything as recommended (D-62): A1 to A5, D1 to D4, R1 and R2 with habit challenges, writing option 1 and the suggested order. Stage 1, the Audience made alive, is built (D-63). Its lines are drafts in `rivalLines.draft.json`, waiting for Rich's review; until he approves them, a release build shows none. Stage 2, each deal its own, is built (D-64, rules 3.9.0), with the last two Dominion marks lowered (D-65); its report is section 10. Each item says what would change, where and why. Every number is a first guess (TUNE) for the simulator to settle.

Rich's direction (2026-10-29):
- Make diplomacy and the rivals more exciting, with more interactions with them.
- Look at the current options (Truce, non-aggression pact and the rest). Make them more distinct from each other, and make the rivals feel like real rivals.
- Rivals could mention each other in the Audience.
- The Audience feels static. It would be fun if it were more dynamic, with the rivals saying different things each time.

## 1. What is there today

### The deals

| Deal | Price | Who | Does | Asks of you |
| --- | --- | --- | --- | --- |
| Truce | 30 × band (150 at band 5) | anyone, at War or Tension | no raids or conquest attempts from him for 7 days; +2 Respect (the Orc 0) | nothing |
| Non-aggression pact | 250 | at his pact mark (Ugrak 50, Skivvet 30, Hrodgar 30, Emrys 40) | no conquest attempts for 28 days; his raids come half as often | nothing |
| Call to arms | 200 | at his mark (45 to 75) | his front with a neighbor goes to War for 14 days | nothing |
| Sell a hex | 70% of its price | at his `buysHex` mark (Skivvet any time) | the hex is his; +5 Respect | the hex |
| Buy a hex | his price | Emrys only (Skivvet's are bribed) | the hex is yours; +2 Respect | his price |
| Buy-out | 300 | a coalition member, Respect 40 | he leaves the coalition | the price |
| Accord | the contract slot | Respect 55, path rank I, Castle III | 30 days toward alliance | a contract |

Offered to you: the Goblin's buy-offs, terms, an envoy's request (a world event) and coalitions.

### What the audit of it found

1. **The Truce and the pact are two prices for the same thing.** Both pay a rival to leave you alone, and neither asks anything of you. You can assault his land during either at no cost beyond the usual −5 Respect for a hex taken. Hrodgar still pays his +5 for "a pact kept to its end" if you did. In the simulator a Truce is struck about 2 to 3 times a campaign and a pact almost never.
2. **Every court offers the same menu.** Four very different rulers, one table.
3. **A call to arms is paid and forgotten.** A front goes to War for 14 days, but nothing tells you what came of it. The rival it was aimed at never learns who paid.
4. **The table buries the deals.** One row per hex he could buy: an Audience with Ugrak lists 15 near-identical "Sell …" rows before the Truce.
5. **The Audience says one thing per Respect tier.** That is nine lines a ruler plus "accept", so he repeats himself for weeks until his Respect crosses a tier. He never mentions:
   - what you did to him;
   - his wars with his neighbors (the fronts, Emboldened and Humbled, the land changing hands since Patch 7);
   - a coalition;
   - the habit he prizes. Each ruler prizes one of your habits: Ugrak a week with no battle lost, Skivvet your food budget, Emrys every duty kept, Hrodgar your step pool.
6. **Rivals rarely come to you.** Apart from the Goblin's buy-offs and terms, every interaction starts with you.

## 2. The Audience made alive (words and screens; no rule change)

### A1. Greetings that change
Each ruler gets 3 greetings per Respect tier, not 1.
- One is drawn by the campaign's seed and the day (`rng.ts`), so a visit reads the same all day and the next day may differ.
- Never yesterday's line.

### A2. He speaks of what is happening
After the greeting, one line on the freshest fact that concerns him, from a ranked list:
- **What you did to him** in the last 7 days: took his hex, beat his raid, broke his walls, laid siege to his land, sold him a hex, kept or broke a deal.
- **His neighbors:** he won or lost his front's war, is Emboldened or Humbled, took land from a neighbor or lost land to one (W2), or a neighbor was conquered by you or allied with you. A coalition he stands in, or one against him. These are the rivals mentioning each other.
- **The habit he prizes, this week:** whether you are keeping it so far, in plain words and with no hidden number. For example, Hrodgar on your steps, or Skivvet on your food.
- **A deal running:** a Truce or pact about to end, or a call to arms under way.

Each topic is a template per ruler with plain-fact placeholders (`{hex}`, `{rival}`, `{days}`), in `rivalLines.json`.

### A3. Ask him things
Below his words go two or three questions, each answered in character once a day:
- **"What of {rival}?"** for each neighbor: his opinion follows his real standing with that rival (at War, at Peace, Humbled, in a coalition together).
- **"What would please you?"** He names what moves his Respect, from his own deeds and the habit he prizes (the same facts as his guide), in his voice.
- **"What news?"** A rumor (the Herald's) in his voice.

Talking gives no Respect, so it can't be farmed.

### A4. Deals answered in character
- **Striking a deal:** he answers with a line for that deal (a Truce, a pact, a sale), not one "accept" line for everything.
- **A deal he refuses:** he says why in his voice ("Earn it first"), with the rule beside it, in place of the grey table note.

### A5. The screen
- **The speech:** he speaks two or three lines (greeting, topic, an answer), and his portrait shows his mood (calm, angry or humbled, which already exist).
- **The deals:** they become offer cards under "Make an offer", one card per kind.
- **Hex trades:** each becomes one card with a hex picker, so the 15 "Sell" rows become one.

## 3. Each deal its own (rule changes)

### D1. The Truce: a ceasefire that binds both sides
- **What it is:** 7 days with no raids or conquest attempts from him, and none of your assaults on his land. Your standing siege on his land waits.
- **Breaking it:** assault his land and the Truce breaks: Respect −10 and he may strike at once.
- **Who and how much:** it stays the cheap, short one, for when you're at War or Tension and need breathing room. No Respect mark is needed, and the price stays 30 × band.

### D2. The non-aggression pact: a treaty, and he turns his army elsewhere
- **What it is:** 28 days. Both sides keep it: no conquest attempts from him, his raids stop altogether, and none of your assaults on his land.
- **His army goes elsewhere:** he presses his neighbors harder (his front track pushes and his siege of the wilds runs a third faster), so a pact moves the map.
- **Kept to its end:** +5 Respect, for every ruler; today only Hrodgar gives it.
- **Broken:** −20 Respect and he goes to War at once. Word travels: −5 with every other ruler.
- **The difference:** the Truce is a breather at any Respect; the pact is a friendship's treaty.

### D3. A call to arms: a war you paid for, and both know it
- **What it is:** for 14 days his army really campaigns against the rival you named. His siege of the wilds and his border moves aim at that rival's land.
- **The other side:** the rival it is aimed at knows who paid, at −1 Respect a day toward you, up to −7.
- **The result:** when it ends, the Herald says what came of it (land taken, the front's track). If he took land, +3 Respect with him.

### D4. One deal only he offers
Each court gets a deal of its own, in keeping with its ruler.
- **Ugrak, a trial of champions.** He never makes Peace, but he respects strength. You fight his champion in a led fight: your best company against his.
  - **Won:** his raids stop for 14 days and +5 Respect.
  - **Lost:** −5 Respect and a tribute of 5 × band.
  - Once every 4 weeks.
- **Skivvet, mercenaries for hire.** He rents you a company of his for 7 days, at his greed's price (fair, dear or gouging). It uses the hired companies his buy-offs already give.
- **Hrodgar, an oath of stone.** An 8-week pact at the pact's price.
  - **Effects:** his walls on the wilds facing you come down, and +10 Respect when it is kept.
  - **Broken:** −30, and the Book of Grudges: his deals cost double for the rest of the campaign.
- **Emrys, a bargain of knowledge.** For a price you choose one:
  - his exact treasury and army for 7 days;
  - tomorrow's surge foretold for 7 days (his rank I perk, early);
  - a ward: his surges strike none of your hexes for 7 days.

## 4. Rivals that come to you (rule changes)

### R1. A ruler's request
From week 4, at about one week close in two (TUNE), one ruler sends a request to the Herald, with 7 days to answer in his Audience. Rulers who like you ask; those who don't, demand.
- **The kinds:**
  - **A habit challenge,** his own prized habit, for the coming week: Ugrak "lose no battle to my raids", Skivvet "keep your food budget", Hrodgar "meet your step pool", Emrys "keep every duty". Met: +6 Respect. Missed: −2. Your habits become something a rival dared you to do.
  - **A demand:** lift your siege on {hex}, leave {hex} alone for 2 weeks, or pay a toll. Granted: +5 Respect. Refused: −5, and he acts on it (Hrodgar walls the hex, Ugrak raids it).
  - **An offer of his own:** Skivvet sells an Armory item at a friend's price; Emrys offers a hex.
- **Silence:** ignoring a request counts as refusing it.

### R2. Rivals react to each other
When a rival takes land from another (W2), wins a front's war, or is conquered or allied by you, each other ruler has a line about it in the Herald. It is then the first topic in his next Audience (A2).

## 5. The writing

All of this needs new lines in each ruler's voice. About 250 in all, against the 40 in `rivalLines.json` today:
- **Greetings:** 3 per tier, so 108.
- **Topics:** about 60.
- **Answers to questions:** about 30.
- **Deal and refusal lines:** about 30.
- **Requests and reactions:** about 30.

The project's rule is that Claude doesn't invent story or flavor text. Of the existing lines, the tiers below 0 and the accept lines were written by Claude at Rich's request (2026-10-20), in each ruler's established voice.

**Options:**
1. **Recommended:** Claude drafts every line in `rivalLines.json`, in the four established voices, and Rich reviews and edits before it ships. Lines Rich hasn't approved are marked, and the game shows none of them in a release build until he has.
2. Rich writes them. Claude builds every slot with its placeholders, and the game falls back to today's line until a slot is filled.
3. Mixed: Claude drafts the topics and answers (they are mostly facts), and Rich writes the greetings.

## 6. Save compatibility

- **New state is optional:** the requests, the new deals, the Book of Grudges and the last line seen. The live campaign (3.1.0-founded, on 3.8.0) carries forward in place with no migration.
- **Truces and pacts already running** keep their old terms to their end.
- **Rules version:** 3.9.0.

## 7. Measuring it

New simulator targets, after the automatic player learns the new deals:
- **G-24, every deal has a use:** each deal kind is struck in at least 30% of the smarter player's campaigns, and none is a strict upgrade of another.
- **G-25, requests answered:** at least one request a month from week 8; habit challenges met at least as often as the prized week is today.
- **No campaign target moves outside its window:** G-11's victory weeks, G-19's falls, G-06's focused path.

## 8. Suggested order

1. **Stage 1, the Audience made alive (A1 to A5) with the writing.** No rule change (3.8.x), so it can ship quickly once the lines are approved.
2. **Stage 2, each deal its own (D1 to D4),** with simulator runs (3.9.0).
3. **Stage 3, rivals that come to you (R1, R2).**

## 9. Decisions needed

1. **The Audience (A1 to A5):** all of it, or which parts?
2. **The Truce and the pact (D1, D2):** both bind you as well, with the breaking costs proposed?
3. **The call to arms (D3)?**
4. **One deal per ruler (D4):** these four, or other ideas?
5. **Requests (R1, R2):** yes? And habit challenges among them?
6. **The writing (section 5):** option 1, 2 or 3?
7. **The order (section 8)?**

## 10. Stage 2 report: each deal its own (rules 3.9.0)

Built 2026-10-29 and 30 from D1 to D4 (D-62, recorded as D-64). Every number below is a first guess the simulator checked; Rich decides them (D-02).

### 10.1 What was built

- **D1, the Truce binds both sides.** For its 7 days the Marshal's standing siege on his land waits, and no battle you call there is announced. An assault on his land breaks it: −10 Respect, and his raids are free from the next dawn. The orders panel warns before the close: "This assault breaks your Truce (−10 Respect) with Ugrak."
- **D2, the pact is a treaty.**
  - **Both keep it:** for 28 days his raids stop altogether, and you make no assaults on his land.
  - **His army turns on his neighbors:** ×1.25 in his Rim fronts' skirmishes, ×1.33 on his siege of the wilds.
  - **Kept to its end:** +5 at its last day's close, for every ruler. Hrodgar's weekly +5 now posts there.
  - **Broken:** −20, he is at War for 14 days whatever his Respect, and −5 with every other ruler.
  - **At Peace:** it is offered again. B5 still refuses the Truce at Peace, but at Peace a pact now binds you, pays and moves the map. Before this, Emrys's pact could never be struck: his pact mark and his Peace mark are both 40.
- **D3, the call to arms campaigns.** The rival you call fights at ×1.25 on that front, and takes land while he merely leads its war. The rival it's aimed at loses 1 Respect a day for the first week. At the end the Herald reports the hexes taken, and land taken pays +3 with the rival you called.
- **D4, each ruler's own deal.**
  - **Ugrak's trial of champions:** your best company against his champion, a one-company-a-side battle at your border, once every 4 weeks. Won, a Truce of his own stops his raids for 14 days; it binds only him. Lost, a tribute. His Respect moves ±5, as for any Grand Battle against him, so it isn't paid twice.
  - **Skivvet's mercenaries:** one of his companies for 7 days at 80 × his greed (fair 1, dear 1.25, gouging 1.5), up to 3 at a time, never at War.
  - **Hrodgar's oath of stone:** a pact of 8 weeks at the pact's price.
    - His walls on the wilds facing you come down, and none rise while it holds.
    - Kept, +10.
    - Broken, −30, War, word travels to every other court, and his Book of Grudges doubles his prices for good.
  - **Emrys's bargain of knowledge:** 150 for 7 days, from Respect 25. Pick one: his treasury and army shown, his surges foretold, or no surge striking your hexes.
- **The Audience:** offer cards for the new deals; Emrys's three choices share one card with a picker. Rulers now also speak of deals kept and broken, of a call to arms aimed at them, and Ugrak of his trial. Stage 2 adds about 25 draft lines to `rivalLines.draft.json`.
- **Save compatibility:** deals struck before 3.9.0 keep their old terms; they don't bind you.
- **The simulator:**
  - **The automatic player keeps its word:** no assault on the land of a ruler bound to it.
  - **It strikes each deal:**
    - a pact (Hrodgar's oath) with a ruler whose attacks hit it twice in two weeks and whose land it left alone;
    - a call to arms on a ruler at War with it or raiding it;
    - the trial when its best company can face Ugrak's champion;
    - Emrys's ward when his surges strike it;
    - Skivvet's mercenaries just before a Grand Battle.
  - **New target G-24:** each deal struck in at least 30% of the smarter player's campaigns.
- **Tests:** 8 new tests in `tests/game/deals.test.ts`; all 929 pass.

### 10.2 What the simulator found

Four full runs (720 campaigns each). The report in [`docs/game/sim/targets-3.9.0.md`](../game/sim/targets-3.9.0.md) is the last row's, with the marks as decided (D-65).

| Run | Perfect (50–56) | Steadfast (58–64) | Committed (64–72) | G-07 mixes' spread (5) | G-24 | Missed |
| --- | --- | --- | --- | --- | --- | --- |
| 3.8.0 (before) | 56 | 58 | 64 | 5 | – | G-05, G-17 |
| 3.9.0 as built (marks 650 / 1,800 / 2,700 / 3,650) | **59** | 63 | 70 | 5.5 | met | G-05, G-07, G-11, G-17 |
| marks … 2,550 / 3,450 | 57 | 61 | 68 | 4.5 | met | G-05, G-11, G-17 |
| **marks … 2,500 / 3,350** | **55** | **59** | **67** | **3.5** | met | G-05, G-17 |

- **Every deal now has a use.** In the smarter player's campaigns:
  - **Truces, pacts and calls to arms:** each struck in 100% of campaigns.
  - **Ugrak's trial:** 98 to 100%.
  - **Hrodgar's oath:** 78%.
  - **Skivvet's mercenaries:** 75%.
  - **Emrys's bargain:** 63%.

  The automatic player broke none.
- **Victory comes two to three weeks later.** Pacts stop raids, so there are fewer defenses won and less Renown, hence slower Dominion. A call to arms also costs Respect with its target, which slows that ruler's Accord.
- **Other changes:**
  - Ultimatums fall to 74% of Steadfast campaigns (from 80%).
  - Three Wavering campaigns in 40 fall, against none before. Ch 15 expects many more for Wavering, and G-19 doesn't target it.
  - The save grows to 1.81 MB (from 1.69), still under 2 MB.

### 10.3 Decisions for Rich

**Decided 2026-10-30 (D-65):** Rich took option (a): the third and fourth marks are now 2,500 and 3,350, and the report in `docs/game/sim/targets-3.9.0.md` is that run's.

1. **The last two Dominion marks.** As built, Perfect wins at 59 (window 50–56), and the path mixes spread past 5 weeks.
   - **Options:**
     - (a) **Recommended:** lower the third and fourth marks to 2,500 and 3,350 (from 2,700 and 3,650). Every style is back in its window (55 / 59 / 67), and G-07 is met.
     - (b) Keep the marks D-60 confirmed, and accept Perfect three weeks over its window.
2. **The new lines.** About 25 drafts for the new deals and topics join stage 1's in `rivalLines.draft.json`, for your review with the rest.
