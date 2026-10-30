# Patch 8 proposals: rivals worth talking to (for Rich's approval)

Written 2026-10-29, on branch `patch-8` (from Patch 7, 0db00d4, rules 3.8.0).

**Status (2026-10-29):** Rich approved everything as recommended (D-62): A1 to A5, D1 to D4, R1 and R2 with habit challenges, writing option 1 and the suggested order. Stage 1, the Audience made alive, is built (D-63). Its lines are drafts in `rivalLines.draft.json`, waiting for Rich's review; until he approves them, a release build shows none. Each item says what would change, where and why. Every number is a first guess (TUNE) for the simulator to settle.

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
