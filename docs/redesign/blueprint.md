# Fiefdom redesign: the blueprint (Patch 1)

Written 2026-10-13. Design only: this patch changes no code. It is the plan for Patches 2 to 5, which aim to make the campaign fun to play every day for a 60- to 72-week weight-loss journey.

**How to use this file.** Read [Rich's decisions](#1-richs-decisions) first: where a decision there and the options text below disagree, the decision wins. Then read the section for the patch you are building ([section 8](#8-patch-order-and-patch-plans)). The design book stays a snapshot ([`docs/game/design-book-v2.md`](../game/design-book-v2.md), never edited). Each patch records the rules it changes as new `D-` entries in [`docs/game/decisions.md`](../game/decisions.md), which overrides the book. This blueprint overrides neither: it is the plan the `D-` entries carry out.

**Paths.** The request named `docs/design-book.md`, `lib/game/` and `sim/`. In this repo they are `docs/game/design-book-v2.md`, `src/renderer/src/lib/game/` and `sim/` at the repo root.

**Working rules for every session on this plan:**

- Rich makes every design decision. When a choice is open, or a request conflicts with the book's philosophy, stop and give 2 to 3 options with tradeoffs and a recommendation. Never pick for him.
- No code changes until Rich approves a written spec for that patch.
- Unless Rich rules otherwise, keep: no defeat before week 36; the Crown's Grace; the Chapter 16 wellbeing guardrails; seeded, idempotent settlement; no new art assets (reuse what exists); no AI-written flavor text (plain-fact placeholders only, Ch 17).
- The CLAUDE.md ground rules still hold: pure deterministic rules in `lib/game/`, every number in `rules.ts` or the codex JSON, randomness only through `rng.ts`, hidden values never shown as numbers, health records never touched, and `npm run typecheck`, `npm test` and `npm run check:game` pass before a patch is done.

---

## 1. Rich's decisions

*Each entry: the area or conflict, the option chosen, any changes Rich made to it, and the date.*

| # | Area | Decision | Date |
| --- | --- | --- | --- |
| R-01 | Map shape ([5.1](#51-the-map)) | **1B, four marches**, built on the bigger map: the heartland (rings 0 to 2) plus four rival marches and two lair marches | 2026-10-13 |
| R-02 | Map size ([5.1](#51-the-map)) | **About 3.3× today, about 284 claimable hexes** (marches about 5 wide and 12 deep); Patch 2 fine-tunes by simulation | 2026-10-13 |
| R-03 | New direction from Rich | **Neglected marches harden.** Focusing on one rival gives the others time to prepare, so their marches get harder to claim the longer they're left alone. The mechanism is decided in [5.2c](#52c-neglected-marches-harden) | 2026-10-13 |
| R-04 | Depth model ([5.2a](#52a-what-makes-a-deeper-hex-harder)) | **B, sieges with the flanking modifier.** Assault wear stays on a hex until it falls (slow decay when the siege stops) and shows as progress on the map; strongholds every few steps; a small bonus for each extra held neighbor of the target | 2026-10-13 |
| R-05 | Dominion ([5.2b](#52b-dominion-the-chronicle-of-your-war)) | **Dominion is the chronicle of the player's war.** Every decision, battle and hex taken adds to the path of the rival it was against, and the path shows how that war was fought (attrition with the Orc, deals with the Goblin, sieges of the Dwarf, outlasting Emrys's magic). The paths are versatile: win with one path, two halfway, or three a third each, and never be forced onto a path at a given point. Rich set the concept and left the mechanics to Claude; they are written in 5.2b, and Rich may revise them | 2026-10-13 |
| R-06 | Neglected marches ([5.2c](#52c-neglected-marches-harden)) | **A, a preparation level per march:** each quiet week raises that march's garrisons beyond your front (about +5%, capped at about +40%); a week you push it lowers the level; each rival prepares its own way in Patch 4 | 2026-10-13 |
| R-07 | Victory ([X-24](#x-24-victory)) | **Between the Crown's claim and forcing terms.** Victory still means all four rivals resolved, but once you are far enough into the game, hidden thresholds on your reputation, army, land, opponents defeated and other key scores make a rival willing to sign an Accord or surrender out of intimidation. Each rival weighs them its own way. Design in X-24 | 2026-10-13 |
| R-08 | What you see of terms ([X-24](#x-24-victory)) | **A stance band per rival plus Herald rumors**; never numbers, never which measure is close | 2026-10-13 |
| R-09 | How each rival yields ([X-24](#x-24-victory)) | **Each in its own way** (Rich, revising his first answer): the Goblin tries to buy his way out of your war path before surrendering; the Archmage surrenders if he feels his life is at risk; the Orc can only be conquered; the Dwarf may surrender once most hexes of his kingdom are taken, but he will not be happy about it. Mechanics in X-24 | 2026-10-13 |
| R-10 | Routed enemies ([5.3](#53-routed-enemies)) | **B, fall back and strike back:** beaten defenders fall back to the next hex deeper (about +50% of the beaten garrison, fading over about 3 days) and may counterattack the hex you took in that window, announced at dawn; a rout scatters them. **Amended 2026-10-15** (Patch 3 tuning, T-02 and T-03; D-24): they fall back to a neighboring hex of the same holder no shallower than the one lost, the cheapest to assault, and strike back at 1.5× their strength that day | 2026-10-13 |
| R-11 | How the Orc is conquered ([X-24](#x-24-victory)) | **If he doesn't respect you, he comes to you thinking he can conquer you** (a final Warhost Grand Battle at your border); **if he respects you, Ugrak's Challenge plays out** (the duel). Winning either conquers him; his Gate and capital remain a third road | 2026-10-13 |
| R-12 | The Dwarf's surrender ([X-24](#x-24-victory)) | **A grudging vassal:** no levy company, and the hexes he gave up stay restless for a while (lower loyalty, a chance of an uprising you can pay to settle); never undoes the resolution | 2026-10-13 |
| R-13 | The book's Accords ([X-24](#x-24-victory)) | **Respect-based Accords stay for the Goblin, the Archmage and the Dwarf** (not the Orc), as the habit-built road to resolving a rival you didn't fight | 2026-10-13 |
| R-14 | Rival personalities ([5.4](#54-rival-personalities)) | **B, each march plays by its own rules.** The four sketches in 5.4 are the brief for Patch 4's spec | 2026-10-13 |
| R-15 | Daily cadence ([5.5](#55-daily-cadence)) | **B, every day moves something visible:** siege progress on the map each assault day, more on good-habit days; the day's choices come from the rivals (Goblin offers, Archmage surges, Orc counterattacks), not from a separate menu | 2026-10-13 |
| R-16 | Standing siege orders ([X-09](#x-09-orders-dont-carry-over)) | **A siege target carries over until it falls or is changed**; defense still defaults to the Marshal. Overrides Ch 2 rule 2 and A-36 for sieges only | 2026-10-13 |
| R-17 | Campaign length ([X-01](#x-01-campaign-length)) | **Stretch it:** Steadfast wins around weeks 58 to 64, Perfect 50 to 56, Committed 64 to 72 | 2026-10-13 |
| R-18 | Earliest defeat ([X-02](#x-02-earliest-defeat-at-week-36)) | **Keep week 36 as the floor** and tune Ascendancy so a Steadfast player's real risk stays under 5% | 2026-10-13 |
| R-19 | Resolution pacing ([X-03](#x-03-resolution-pacing)) | **Scale it:** no rival resolved before week 16, then at most one per 12 weeks (earliest victory week 52); tuned in Patch 5 | 2026-10-13 |
| R-20 | The live campaign ([X-22](#x-22-the-live-campaign)) | **Re-found on the new map, carrying over what Rich has earned.** Use every ledger day back to his first contract (2026-09-30) and credit the new campaign's purse with the reputation those days and contracts would have earned under the new system, so he starts with everything earned so far. Overrides A-07 (legacy reputation never enters the purse) for this re-founding | 2026-10-13 |
| R-21 | Carry-over: the rivals and the war ([X-22](#x-22-the-live-campaign)) | **A full backdate, guided by the player:** the campaign is founded as of 2026-09-30 and settles every day since, the whole war included. A few questions at the founding (which path, build or arm, force or deals, accept offers) guide a deterministic catch-up player through those weeks | 2026-10-13 |
| R-22 | Carry-over: week numbering ([X-22](#x-22-the-live-campaign)) | **Campaign weeks count from 2026-09-30**, the journey's real start | 2026-10-13 |
| R-23 | Names for new hexes ([X-20](#x-20-text-for-new-hexes-and-events)) | **A one-time exception like D-07:** an agent writes place names for the new hexes from each region's existing theme; Rich edits the JSON as he likes. Herald lines stay plain-fact placeholders | 2026-10-13 |
| R-24 | Absence ([X-17](#x-17-wellbeing-guardrails)) | **No new losses while away:** while the player has been away 14 or more days, no counterattack or bribe resolves against them (the Marshal defends as usual) | 2026-10-13 |
| R-25 | Daily assaults ([X-08](#x-08-one-assault-a-day)) | **Keep one a day** (Castle IV and the Siege Park Wing still add one); revisit in Patch 3 only if the cadence targets miss | 2026-10-13 |
| R-26 | Border Campaigns ([X-12](#x-12-rival-land-rules)) | **Drop them:** rival-against-rival fronts stay as the abstract weekly rolls (Emboldened and Humbled raids), but no land changes hands between rivals | 2026-10-13 |
| R-27 | Tier V ([X-26](#x-26-tier-v-needs-the-matching-rival-resolved)) | **Drop "the matching rival resolved"**; Tier V needs Milestone 6 and the Dominion gate only | 2026-10-13 |
| R-28 | Performance ([X-25](#x-25-performance)) | **Relax to under 2 s** for a 365-day catch-up and **under 2 MB** for `campaign.json` after 72 weeks, measured on Rich's PC in Patch 2 | 2026-10-13 |
| R-29 | Remaining conflicts ([section 6](#6-conflicts-with-the-design-book)) | **Approved as recommended:** X-04, X-06, X-07, X-10, X-11, X-12's Goblin rules, X-13, X-14, X-15, X-16, X-18, X-19, X-21 and X-23. Each patch's spec still comes to Rich before any code | 2026-10-13 |
| R-30 | Targets ([section 7](#7-targets-for-judging-patches-2-to-5)) | **G-01 to G-18 approved as written** as the yardstick for Patches 2 to 5 | 2026-10-13 |
| R-31 | Patch order ([8.1](#81-the-order)) | **B, re-scoped:** 2 = map, depth, Dominion and the re-founding; 3 = sieges and routed enemies; 4 = personalities and how rivals yield; 5 = length, endgame and economy | 2026-10-13 |

---

## 2. The short version

**What the simulator says** (current rules, version 2.2.0, D-15 included; 40 seeded campaigns per profile; method in [section 3.2](#32-how-it-was-measured)):

- **Dead time is real.** For a Steadfast player, a day on which something happens that the player sees or does (land changes hands, a Grand Battle, something new bought or unlocked, or a real choice of which hex to take) comes **3.0 days a week**, and only **23% of weeks** have 5 such days. After week 4 there is **no hex the army can take on about 5 days of every 7**. The auto-resolved defense battles fill some days (counting them gives 4.3 days a week), but those are the "simulated battles" you said don't feel like anything.
- **Path choice is meaningless today, and focus is a trap.** Dominion stays within 25 to 30% of even across the four rivals (even is 25%). Preferring one road changes nothing. Pushing only one road gives that rival about half of all Dominion, but the realm stalls at 27 hexes by week 12, shrinks after, and **wins 0 of 40 campaigns** in 70 weeks.
- **The land runs out.** A Steadfast player holds every claimable hex but the two Lair Mouths (84 of 86) by about **week 38** and wins about **week 44**. A 60- to 72-week journey would spend its last 16 to 28 weeks with no land left to take.
- **Why:** (1) difficulty steps up by ring while the army grows in weekly purchases, so the army is either above the next ring's garrisons or below them, and the next hex down any road is always a ring deeper than the cheapest hexes around the ring; (2) each building's tier needs Dominion from its own road and the castle needs the sum of all four tiers, so the army only grows if you expand everywhere; (3) the map holds about 9 months of land.

**What this blueprint recommends** (each one is a choice for Rich, with alternatives in [section 5](#5-design-areas-options-and-recommendations)):

| Area | Recommendation |
| --- | --- |
| Map | **Four marches** (decided, R-01 and R-02): keep the heartland (rings 0 to 2); replace rings 3 to 6 with four rival marches about 5 hexes wide and 12 deep, plus two short lair marches. About 284 claimable hexes (3.3× today), built only from the regional tiles that already exist. Neglected marches harden over time (R-03) |
| Depth and Dominion | **Sieges** (decided, R-04): every day's assault wears its target down and the wear stays until the hex falls, so every assault day shows progress; strongholds every few steps give rhythm. **Dominion as the chronicle of your war** (decided, R-05): each rival's path records the deeds done against it, path ranks give perks, building tiers gate on total Dominion, and any mix of paths can win. Neglected marches harden through a preparation level (decided, R-06) |
| Routed enemies | **Fall back and strike back:** a beaten garrison falls back to the next hex deeper (stronger for a few days) and may counterattack the hex you just took; a rout scatters it |
| Rival personalities | **Each march plays by its own rules:** the Dwarf's fortified lines and sieges, the Orc's counterattacks and attrition, the Goblin's prices and bribes, the Archmage's daily surges |
| Daily cadence | **Every day moves something visible:** siege progress on the map, scaled by the day's Valor; the rivals' personalities supply the day's choices |
| Patch order | **Re-scoped:** 2 = map + depth curve + Dominion + the new measurements; 3 = sieges + routed enemies; 4 = personalities; 5 = campaign length, endgame and economy retune |

---

## 3. The problem, measured

### 3.1 Where things stand

**The live campaign.** Founded 2026-10-09 on rules 2.0.0 (before D-14 and D-15), settled through 2026-10-12: 9 hexes, all buildings at Tier I, Castle I. Its neutral garrisons are still the old flat values for each ring (ring 3: 33 or 50; ring 4: 69 or 104; ring 5: 180 or 230), because D-15 keeps a running campaign's founding garrisons until a hex changes hands. So the ring-by-ring pattern you describe is what your own campaign would feel like, and neither D-14 nor D-15 reaches it. Any new map needs a new campaign ([conflict X-22](#x-22-the-live-campaign)).

**Where the code has moved past the book** (all in `decisions.md`; the code is current):

| Change | What it did |
| --- | --- |
| D-12 | Daily battles can be led by hand on the battle map; unled ones resolve by the Ch 10 formula |
| D-11, D-13 | One weigh-in a week, on Monday |
| D-14 | Faster opening: Tier II needs 1 Dominion (book 8), founding grant 250 (book 100), ring-2 base 18 (book 22), hidden benchmark b × 1.05 |
| D-15 | Wild garrisons ramp hex by hex within rings 3 to 5 (28–95, 50–200, 110–280) in a seeded order; beasts and mythics strike at a hex's own wild strength; a defense routed by beasts or a mythic on a ring-3+ non-village hex returns it to the wilds; Tiers III to V, Castle III to IV and Crossing stages II to III cost 1.5 to 2× the book |
| D-04 | No notifications of any kind |
| D-07, D-09 | Every hex has a place name (127 in `data/codex/hexes.json`); each region has its own terrain tiles (all 71 hex art slots are filled) |
| A-23 | Rivals never court villages the player holds (an agent's reading, never ruled on) |

### 3.2 How it was measured

A scratch script (not in the repo; Patch 2 ports it into `sim/report.ts`, see [section 7](#7-targets-for-judging-patches-2-to-5)) founded campaigns with `foundCampaign`, played each day with the simulator's greedy player (`sim/policy.ts` `act`), settled it with `settle`, and recorded each day. The ledgers are the simulator's synthetic profiles (`sim/profiles.ts`) for Rich's journey: 217 to 168 lb, a 50,000-step pool, 2,000 kcal, three duties. Each run used 40 seeds and a 70-week horizon, and a campaign stopped at its victory (the Reign is not simulated).

A day counts as:

| Label | Means |
| --- | --- |
| **Land** | The player gained or lost a hex that day |
| **Grand** | A Grand Battle was fought that day |
| **Build** | Something new was bought or unlocked: a tier, castle tier, Crossing, Armory item, Wing, Elite or Milestone |
| **Choice** | At dawn, two or more hexes were within the army's reach (the whole army's Assault at yesterday's Valor beats the garrison) |
| **In doubt** | An auto-resolved battle whose dawn band was Matched or worse, or which was lost, or an assault repulsed |
| **Player-view meaningful** | Land, Grand, Build or Choice: what you would notice or act on |
| **Meaningful incl. auto battles** | The same, or In doubt |

### 3.3 Results: cadence

Steadfast (93% duties, 104% of the step pool, food logged 96%, 0.8 lb a week, one rough week in 12), greedy player. Days per week, mean:

| Weeks | Land | No hex in reach | Grand | Build | In doubt | **Player-view meaningful** | Incl. auto battles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1–4 | 5.3 | 1.8 | 0.0 | 1.0 | 1.4 | **5.5** | 6.0 |
| 5–12 | 2.9 | 4.7 | 0.3 | 1.0 | 4.3 | **3.5** | 5.7 |
| 13–24 | 1.9 | 5.5 | 0.7 | 0.9 | 3.1 | **2.9** | 4.6 |
| 25–36 | 1.9 | 5.2 | 0.7 | 0.9 | 1.9 | **2.9** | 4.0 |
| 37–48 | 0.7 | 6.4 | 0.3 | 0.8 | 0.7 | **1.6** | 2.1 |

| Whole campaign (to victory) | Steadfast | Committed | Wavering |
| --- | --- | --- | --- |
| Player-view meaningful days a week | 3.0 | 2.9 | 2.7 |
| Weeks with 5 or more such days | 23% | 22% | 20% |
| Including auto battles: days a week; weeks with 5+ | 4.3; 51% | 4.3; 50% | 4.2; 50% |
| Longest run of days with nothing at all (median; worst) | 10; 33 | 11; 45 | 14; 62 |
| Weeks with no hex gained | 36% | 34% | 35% |
| Longest run of weeks with no hex gained (median; worst) | 4; 15 | 5; 13 | 6; 11 |
| Victory: share; median week | 100%; 44 | 100%; 49 | 57%; 65 |

Auto-resolved defenses come about once a day. Their mix shifts with the phase: weeks 5 to 12 the player loses 49% of them; weeks 37 to 48 only 3%, with 74% routs.

### 3.4 Results: land

Steadfast, greedy. Hexes held, including the castle and the four buildings (median):

| Week | 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hexes | 26 | 42 | 46 | 54 | 61 | 62.5 | 70 | 76.5 | 85.5 | 89 (all but the Lair Mouths) |

- **The ring walls show** as the two flat stretches: weeks 8 to 12 (+4 hexes) and 20 to 24 (+1.5). Ring 3 is half held by week 6 and full by week 13; ring 4 half by week 15 and full by week 33; ring 5 half by week 31 and nearly full by week 38. That is the "take a ring, wait, take the next" shape you describe.
- **Monthly gains** (4-week months): +20.6, +16.7, +6.5, +9.7, +7.8, +3.9, +6.0, +8.3, +8.5, +3.5, +0.7, 0. Losses peak at about 2.5 a month in months 3 and 4.
- **How land is won:** 83.5 hexes a campaign by assault, 8.5 by courtship, 0 by trade. Influence and trade barely exist in play.

### 3.5 Results: Dominion and path choice

Dominion is per building, and each building's road leads to one rival (Barracks to the Orc, Merchant Hall to the Goblin, Mage Tower to the Archmage, Foundry to the Dwarf). "Leader's share" is the highest building's share of all four.

| Week | 4 | 8 | 12 | 20 | 26 | 32 | 40 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Leader's share (even is 25%) | 30% | 28% | 29% | 29% | 28% | 27% | 25% |
| Highest ÷ lowest | 1.5 | 1.3 | 1.4 | 1.4 | 1.3 | 1.2 | 1.0 |

Two focus experiments, Steadfast:

| Policy | Chosen road's share at weeks 8 / 12 / 26 | Hexes at weeks 12 / 26 / 40 | Won within 70 weeks |
| --- | --- | --- | --- |
| Greedy, but prefers the chosen road's hexes whenever one is in reach (Merchant Hall) | 25% / 25% / 26% | 45.5 / 67 / 89 | 40 of 40, median week 42.5 |
| Assaults only the chosen road's hexes (Merchant Hall) | 50% / 48% / 50% | 27 / 25 / 22 | **0 of 40** |
| Assaults only the chosen road's hexes (Barracks) | 48% / 47% / 46% | 27 / 25 / 24 | **0 of 40** |

When the realm is pushed down one road, that building's Dominion peaks near 60, below Tier IV's 68. The other buildings stay at Tier II, the castle can't rise, and the army stops growing.

### 3.6 Diagnosis

1. **Difficulty is a staircase; the army is a staircase too, and they don't line up.** Garrisons and threats are keyed to `base(ring)` (15 / 18 / 55 / 115 / 200). D-15 spread each ring's wilds across a range, but the ranges still step up by ring. The army grows when tiers, castle tiers and Crossings are bought, which the greedy player does at the start of each week, each one a jump. Between jumps, nothing new is in reach.
2. **Breadth is mandatory.** A tier needs Dominion from its own road (`tierOffer`), and the castle (banners) needs the sum of all four tiers (`castleOffer`). Between-land hexes feed two buildings. Every incentive points sideways around the ring, never down a road.
3. **The cheapest next hex is never deeper.** Because difficulty rises by ring, a hex one step deeper is always stronger than the weakest hexes left in the current ring, so a sensible player clears rings. Depth only comes ring by ring.
4. **The map is sized for about 9 months.** 86 claimable hexes at the measured pace last until about week 38.
5. **Daily play has one lever.** The only daily action is one assault, and on most days it has no target. Courtships resolve weekly; trades are rare (Respect gates, one deal per rival per 4 weeks); defenses resolve without the player.

---

## 4. Where ring gating, Dominion and land pacing live in the code

All paths under `src/renderer/src/lib/game/` unless shown otherwise.

| What | Where | Notes |
| --- | --- | --- |
| Map geometry: radius 6, rings, corner rays, roads, between-lands | `map.ts` `ringHexes`, `slotAt`, `layout` (lines 115–276); `RULES.map.radius` | Ring 6 is the Rim; rings 1 to 5 are claimable |
| Regions for terrain art (D-09) | `map.ts` `regionsOf` (177) | Already assigns every hex beyond ring 2 to one rival's or lair's region |
| Founding garrisons | `map.ts` `startingGarrison` (419); `RULES.land.baseGarrison`, `wildRange`, `garrison` (`rules.ts` 248–255) | `base(ring)` in `rules.ts` 696 |
| The wilds' ramp (D-15) | `map.ts` `wildBase`, `wildGarrison` (320–331) | A seeded place on the ring's range |
| Dominion | `map.ts` `dominionOf`, `dominion` (531–548); `RULES.map.dominion` (`rules.ts` 625) | Road hex 2 × ring to its building; between-land hex ring to each of two |
| Tier gating by Dominion | `buildings.ts` `tierOffer` (82); `RULES.buildings.tierDominion` [0, 1, 24, 68, 68] (`rules.ts` 194) | Per building |
| Castle gating by the sum of tiers | `buildings.ts` `castleOffer` (125); `RULES.castle.tierSum` [0, 8, 12, 16] | Banners 2 to 6 come from the castle |
| Who may take what | `map.ts` `claimableBy` (574) | Adjacency; rings 0 to 2 protected from rivals; Gates by Grand Battle or courtship only |
| The daily assault | `combat.ts` `assaultOf` (1212), `assaultOutcome` (560); repulse wear `RULES.land.repulseWear` | Wear resets at each week close (`settle.ts` 400) |
| Threat strength and targeting by ring | `combat.ts` `threatStrength` (267), ring^1.5 weighting (300), conquest attempts ring ≥ 3 (439) | D-15: beasts and mythics use the hex's wild strength |
| Routed defense returns a hex to the wilds (D-15) | `combat.ts` `returnsToWilds` (798), settlement around 1147 | The mirror of "routed enemies" |
| Courtships, trade, reclaiming | `land.ts` (`resolveCourtships` 196, `buyPrice` 417, `reclaimOffer` 696) | Loyalty 15 or 30 × ring; price 50 × ring × greed |
| Ring-scaled income and costs | spoils and tribute `combat.ts` 1035–1058, 1131; tithes `economy.ts` 112; fortification `land.ts` 651; trade `land.ts` 411 | Every one multiplies by ring |
| Rival expansion, fortification, conquest plans | `rivals.ts` `expand` (582), `planConquests` (861) | One expansion target a week (Goblin two) |
| Power (Ascendancy, Threat, coalitions) | `rivals.ts` `power` (230): 0.5 × treasury + 3 × AV + 10 × Σ ring held | A bigger map inflates it |
| Grand Battle triggers | `grand.ts` `incursionRival` (319), `raiseIncursions` (334); mythic reveal `combat.ts` 870, 1115 | Incursion: a hex beside a Gate, or 4+ of a rival's former hexes |
| Resolution pacing, victory, Ascendancy | `world.ts` (resolution pacing, `ascendancyWeek` 465); `RULES.world.resolution`, `RULES.defeat` | None before week 12, one per 8 weeks; Ascendancy from week 36 |
| Coalitions keyed to Power | `world.ts` 388 (Rising Crown) | 1.5 × average rival Power for 3 weeks |
| Events keyed to land and weeks | `world/events.ts` (Fear of the Crown at 40% of claimable hexes, Beast Surge, Dragon, Wild Hunt) | |
| The simulator's player | `sim/policy.ts` `orders` (assault choice), `buyCheapest` (weekly purchases) | Weekly buying is why builds cluster |
| Map tests | Test 7 (127 hexes, 86 claimable, 12 rival-held, 30 villages) and Test 10 in `tests/game/` | Change with any new map |
| Map screen | `components/realm/HexMap.tsx` | Already zooms and pans |

---

## 5. Design areas: options and recommendations

Every number below is a first guess marked TUNE: each patch sets its numbers by simulation against [section 7](#7-targets-for-judging-patches-2-to-5).

### 5.1 The map

**What the numbers say about size.** Today's 86 claimable hexes are all taken (but the Lair Mouths) by about week 38. Keep the fast opening (about 20 hexes in the first month, D-14), then aim for **3 to 4 hexes net a week** for a Steadfast player (about twice today's mid-game 1.8), with victory around weeks 58 to 64 (if Rich stretches the campaign, [X-01](#x-01-campaign-length)). That is about 200 to 240 hexes held at victory. Leaving the deepest 10 to 20% of each march still contested at the end gives **about 260 to 300 claimable hexes: 3 to 3.5× today.** 4× (about 345) only makes sense if you want about 4.5 hexes a week, or a map nobody gets close to filling. Counterattacks and the Orc's attrition make gross captures about 1.3× the net, which helps cadence without needing more land.

**Art.** All three options reuse the 71 existing hex slots: each region's near and far wilds, village, road, Gate, capital, realm and battlefield, the border blends for villages and battlefields, the heartland and lair tiles, and the contested and scorched overlays. "Near" and "far" wilds become shallow and deep. Nothing new is drawn.

| | **1A. Bigger disc** | **1B. Four marches** (recommended) | **1C. Realm plus four march boards** |
| --- | --- | --- | --- |
| Shape | Today's map at radius 10 (266 claimable, 3.1×) or 11 (326, 3.8×) | Heartland (rings 0 to 2, unchanged) plus four rival marches, each a corridor about 5 hexes wide and 12 deep along its road, ending at the rival's Gate and capital; plus two lair marches about 3 wide and 5 deep. Neighboring marches touch along a short seam near the heartland; elsewhere they are divided by unclaimable wilds drawn as empty board. 5 × 12 gives 4 × 60 + 2 × 15 + 14 = **284 (3.3×)**; 5 × 14 gives 324 (3.8×) | Today's 127-hex realm stays as the home board; each rival's Gate opens onto its own march board (about 5 × 12), shown on its own screen |
| What "depth" is | The ring | Steps from the heartland down the march | Steps down that march's board |
| Front you defend | Grows with every ring (ring 9 has 54 hexes), so attacks spread thin late | About 5 hexes per march you push, plus flanks: fights concentrate where you are | As 1B, on separate screens |
| Path choice | Weak: each region's width grows and seam hexes still feed two buildings | Strong: each march is one rival; depth there is Dominion with that rival | Strong |
| Code | Smallest: `map.ts` already reads its radius; extend every by-ring table and move Gates and capitals outward | Largest: new geometry in `map.ts` (marches, seams, depth), villages, regions, the Rim's fronts and battlefields need a new home; the map screen fits a star-shaped board | Medium: today's map barely changes, but adjacency, threats and Dominion must cross boards, plus a new screen and navigation |
| Main risk | It is still rings, so the stalls come back at a larger scale | The rewrite; rival-against-rival fighting needs somewhere to happen | The journey is split across screens, so it is less visible at a glance |

**Recommendation: 1B, about 5 wide and 12 deep (about 284 claimable).** It is the only option where "pushing deeper along the road I chose" is the shape of the board itself, and the bounded front keeps "more fights defending what I hold" focused rather than spread over 50 border hexes. The rewrite is real, but `regionsOf` already divides the land by rival, and the Rim's rival-against-rival fronts are already abstract weekly rolls. Border Campaigns took 0 hexes in every simulated campaign anyway.

Details to settle in the Patch 2 spec (no decision needed now): who holds what at founding (proposal: the outer third of each march is the rival's, fortified; the middle is beasts and villages; the inner part is easy wilds); villages per march (proposal: one in four hexes); Lair Mouths at the end of the lair marches; whether the seam hexes count for both neighbors.

### 5.2 Depth progression and Dominion

Two linked decisions: **(a)** what makes a deeper hex harder and what lets you keep going; **(b)** what Dominion is and what it gates.

#### 5.2a What makes a deeper hex harder

| | **A. Smooth depth curve** | **B. Sieges** (recommended) | **C. Frontier shape** |
| --- | --- | --- | --- |
| Rule | Each hex's garrison = its march's base × growth per step of depth (about +7%, TUNE) × a seeded ±15%. You take it when one day's Assault beats it. Tools as today: tiers, banners, Crossings, items, the repeated push | Same curve underneath, but the wear from each day's assault **stays on the hex until it falls**, decaying slowly when you stop (about 10% of the wear a day, TUNE) and shown as progress on the map. Any hex falls in a number of days that grows with depth; a good-habit day moves it more (the Assault already scales with Valor). Every few steps (about 4) a **stronghold** needs a Grand Battle or a longer siege | Same curve, but your Assault gains about +10% for each extra hex you hold beside the target (flanking) and loses about 10% for each step beyond your supported front (supply). A deep spear is fast Dominion but harder and exposed; a broad front is slow and safe |
| Every assault day | Shows something only if the hex falls | Always shows progress | Shows something only if the hex falls |
| Stalls | Return whenever the army's weekly jumps fall behind the curve (today: no target on 5 days a week) | Can't happen: the worst case is a slower siege | As A, softened by choosing where to push |
| Choices it makes | Which hex | Which hex to siege, when to switch, when to commit to a stronghold | Spear or front, every day |
| New rules | Few | Persistent wear, decay, a stronghold kind, its progress marker | Two modifiers and showing them |
| Risk | Today's problem again | Can feel like filling bars unless targets and switching matter (routed enemies and personalities supply that) | Harder to read; needs clear numbers on the map |

**Recommendation: B, with C's flanking bonus as a small modifier.** B ties the daily habit straight to visible progress, which is the core of the request. Flanking adds a reason to widen as well as deepen without new screens. Changing the wear rule overrides Ch 6 ([X-07](#x-07-repulse-wear-resets-at-week-close)).

**Decided (R-04): B, sieges with the flanking modifier.**

#### 5.2b Dominion: the chronicle of your war

**Rich's concept (R-05), in short:** Dominion reflects the choices the player made on the journey: every decision, battle and hex taken adds to a tapestry of the path to victory. A long back-and-forth war of attrition with the Orc shows in the Orc's path. Forcing the trade prince into deals by bribing his troops or out-resourcing him shows as a high Merchant Hall score. Grinding down the Dwarf's walls shows as a high Foundry score. Braving and outlasting Emrys's wild magic shows as a high Mage Tower score. The paths must be versatile: you can win by focusing on one path, by mixing two halfway, or by mixing three a third each. You are never forced onto a path at a given point. Adapting to the world is good, but autonomy must feel important.

Rich left the mechanics to Claude. The design below meets the concept; Rich may revise any part of it. The options considered first were: Dominion per building as the book has it (focus becomes a trap), Dominion per march gated on the total (the base of this design), and a hybrid.

**1. Four paths.** Each rival's war is one path, feeding the building on its road: the Orc's war feeds the **Barracks**, the Goblin's the **Merchant Hall**, the Dwarf's the **Foundry**, and the Archmage's the **Mage Tower**. Each lair march feeds its two neighbors half each: the Wyrmfells the Orc's and the Archmage's paths, the Thornwild the Goblin's and the Dwarf's (the book's West and East between-lands, kept in spirit).

**2. A path's Dominion = Renown + Holdings.**
- **Renown** is permanent: the tapestry. Every deed against that rival or in its march adds to it, and nothing takes it away.
- **Holdings** is the land you hold in that march now, weighted by depth. It rises and falls as land changes hands, so defending still matters.
- Starting proportion about 60% Renown and 40% Holdings for a fully walked path (TUNE).

**3. Deeds.** Every deed's value lives in `rules.ts` (TUNE). Battles count toward the rival you fought, wherever they happen, including at home. Beasts count toward the march they're in, and nothing in the heartland.

| Path | Deeds every path shares | Its signature deeds (what "fighting this rival" means) |
| --- | --- | --- |
| All four | Taking a hex in its march (more for deeper and fortified hexes); winning a battle against it (defense or assault; a Grand Battle counts more); resolving that rival (the largest deed) | |
| Orc (Barracks) | | **Every** battle with the Orc counts, won or lost (a loss counts less): the war of attrition is the path. Also retaking a hex he took, holding a hex through his counterattack, and beating his Incursions and Warhost |
| Goblin (Merchant Hall) | | Hexes and villages won by deal, bribe or courtship; his bribes for your villages beaten; deals struck below his asking price (your Trust against his greed); his counter-bids beaten |
| Dwarf (Foundry) | | Siege wear dealt to his fortifications; fortification levels broken; his strongholds taken; holding a hex he besieges |
| Archmage (Mage Tower) | | Surges weathered (a surge struck your hexes and you held); hexes taken while a surge had weakened them; Rituals endured; mythics he summoned defeated |

Patch 2 builds the shared deeds and Holdings. Patch 3 adds siege and counterattack deeds. Patch 4 adds each rival's signature deeds along with the mechanics they record.

**4. What Dominion gives.**
- **Total Dominion** (all four paths summed) gates the building tiers, so whichever path you walk, all four buildings and the army can grow. The castle still needs the sum of the tiers. Tier V keeps its Milestone 6 requirement but drops "the matching rival resolved" ([X-26](#x-26-tier-v-needs-the-matching-rival-resolved)), which would force a path.
- **Each path's Dominion sets its rank, I to V.** Thresholds are cheaper early (about 10%, 25%, 45%, 70% and 100% of a fully walked path, TUNE). Each rank grants that path's perks, which strengthen its building's role in that kind of war:

  | Building | Its role in that war |
  | --- | --- |
  | Barracks | Endurance for attrition: rally floor, Weary recovery |
  | Merchant Hall | Prices, bribes and Trust |
  | Foundry | Siege speed and breaking fortifications |
  | Mage Tower | Foresight of surges and resistance to them |

  One path walked deep reaches the rank V capstone; two paths halfway give two sets of rank III perks; three paths a third each give three sets of rank II perks. Patch 2 ships the ranks with each building's existing role effect scaled by rank as a stand-in; Patch 4 writes the real perks.
- **Victory** ([X-24](#x-24-victory), decided R-07): all four rivals resolved, as the book has it, with a new route. Your standing (reputation, army, land, opponents defeated and Dominion, against hidden thresholds) intimidates the rivals you didn't fight into an Accord or surrender, so any mix of paths can win.

**5. Autonomy rules (constraints every patch must keep).**
- Any single path, walked fully, can reach the victory threshold alone.
- No rule requires a particular path at a particular time.
- The world may push you (raids, neglected marches hardening, coalitions) but never gates a path.

**6. What the player sees.** Four path scores with their ranks, and how much of each is Renown and how much Holdings. The deeds go into the Chronicle as plain-fact placeholder lines.

#### 5.2c Neglected marches harden

Rich's direction (R-03): while you push one rival, the others prepare, so their marches get harder to claim later. This is the counterweight to focus: focus pays now, and neglect costs later. The hardening needs a ceiling so that any mix of paths can still win (5.2b's autonomy rules, G-07). Today something like it already happens to every rival at once, whatever you do: rivals earn at the benchmark, buy army and fortify the hexes facing you (Ch 12).

| | **A. A preparation level per march** (recommended) | **B. Rivals spend where you aren't** | **C. Everything hardens; pressure holds it back** |
| --- | --- | --- | --- |
| Rule | Each march has a preparation level. At each week close, a march where you took no hex and pressed no siege gains a level: its garrisons beyond your front rise about 5% (TUNE), up to about +40%. A week you push it takes a level off. The march shows its state on the map and the Diplomacy page | The rival AI moves budget: a rival you aren't fighting shifts spending from expansion to fortification and army, so its hexes gain fortification levels and its army band rises. No new number; it comes out of the book's existing levers | Every march's garrisons beyond your front rise a little every week (about 2%); a march you pressed that week doesn't rise |
| What you see | Clear: "the Dwarf has had 5 quiet weeks" shows as stronger garrisons and a visible state | Indirect: fortifications and army bands creep up | Clear, but everything rises everywhere |
| Tuning | Direct: one rate and one cap | Hard: it depends on the whole rival economy | Direct |
| Personality (Patch 4) | Each rival prepares its own way: the Dwarf adds fortification levels, the Orc builds a host that comes for you, the Goblin raises his prices, the Archmage stores up surges | Comes naturally from each rival's budget split | Same rate for all |

**Recommendation: A.** You can see the price of neglect, it tunes against the focus targets (G-06, G-07, G-16) with two numbers, and Patch 4 gives each rival its own way of preparing.

**Decided (R-06): A, a preparation level per march.**

### 5.3 Routed enemies

When you win a hex, its defenders fall back to a nearby hex and make it harder for a set time. Common to all three options: they fall back to the adjacent hex not yours that lies deeper in the same march (ties drawn by seed); a village's militia doesn't fall back; the effect shows on the map with the defender's existing company token (no new art); a hex you take from them with Assault at 1.5× or more (a rout, as today) **scatters** them, so overwhelming force is its own reward.

| | **A. Fall back and dig in** | **B. Fall back and strike back** (recommended) | **C. A rallying host for the march** |
| --- | --- | --- | --- |
| Rule | The fallback hex gains a share of the beaten garrison (about 50%, TUNE) for a few days (about 3), fading each day; repeated fallbacks stack to a cap (about +100%) | As A, plus the fallen force may **counterattack** the hex you just took within those days: a defense battle announced at dawn like any threat, at the strength that fled | The routed strength joins a pool for the whole march that fades daily; the pool raises every garrison in that march and, past a threshold, launches a counterattack |
| What you feel | A reason to switch targets or press on | That plus more fights for land you just took ("more fights defending what I already hold") | A march that gets angrier as you push |
| Readability | High | High: you see where they went and that they may come back | Low: no single place to look |
| Risk | Mild | Counterattacks must respect the guardrails: none in rings 0 to 2, none resolving against you while you're away ([X-17](#x-17-wellbeing-guardrails)) | Hard to read; hard to tune |

**Decided (R-10): B, fall back and strike back.**

**Recommendation: B.** It delivers both halves of what you asked for, and it gives Patch 4 an easy place to express personality (the Orc counterattacks hardest, the Dwarf only digs in, the Goblin's fallen garrison may offer to sell the hex back, the Archmage's dissolves into a surge).

### 5.4 Rival personalities

Today personality is only numbers: budget splits, garrison multipliers, raid frequency, temper, one special fund each, and host rosters. In play the four feel nearly the same.

| | **A. Sharper numbers** | **B. Each march plays by its own rules** (recommended) | **C. Personality in what they do, not how you fight them** |
| --- | --- | --- | --- |
| Rule | Push the existing levers and give each rival one stronger signature (the Dwarf's level-4 walls everywhere, the Orc's Warhost twice as often, the Goblin's Market every week, a Ritual every 3 weeks) | Taking land works differently in each march (below) | The rivals' weekly turn becomes distinct (the Dwarf turtles, the Orc attacks, the Goblin trades, the Archmage casts), but assaulting a hex works the same everywhere |
| Distinct play | Little | A lot | Some |
| Cost | Small | Largest | Medium |

**What B means for each rival** (mechanics only; every line of text stays a placeholder):

- **Hrodgar, the Dwarf: the immovable object.** His march hexes start fortified and he refortifies the hexes facing you each week. Sieges there are slow but steady: his wear decays slowest, and he never counterattacks and rarely raids deep. Land taken from him tends to stay taken. Counters: Arcane (the Mage Tower), the Sappers, siege tools.
- **Ugrak, the Orc: the unrelenting force.** Weaker garrisons, but routed Orcs always counterattack, he raids his march's border often, and land there changes hands both ways. Attrition both ways: each beaten Orc attack costs him army, and a streak of your wins wears him down, while a streak of losses lets him push. Counters: Engine (the Foundry), walls, rotating fresh companies (Weary).
- **Skivvet, the Goblin: always a deal.** Every Goblin-held hex has a price: bribe its garrison to walk away, priced by your Trust (Realm Consistency) against his greed and your Respect. He bribes your villages too, with offers you can counter. Fighting is possible but raises his prices. "Leveraging reputation against his": a weekly contest of your Trust against his offers decides who keeps contested villages. Counters: the Merchant Hall, a high Realm Consistency.
- **Emrys, the Archmage: wild magic.** Each day a seeded surge touches his march: a garrison doubles or halves for the day, a hex flickers neutral, a mythic is summoned, a company of yours is blessed or cursed. Some days a deep hex is suddenly cheap, and that's the day's choice. Mage Tower foresight shows tomorrow's surge. His Rituals stay and become one ability among several seen nowhere else. Counters: Steel (the Barracks), foresight.

**Recommendation: B**, built in Patch 4 once the march and depth rules are in place. It is the only option where the rivals "fight differently" rather than only spend differently.

**Decided (R-14): B.** The sketches above are the brief for Patch 4's spec. Each rival's way of yielding (R-09, R-11, R-12) and of preparing while neglected (5.2c) belongs to the same patch.

### 5.5 Daily cadence

The target is something meaningful on at least 5 days a week. Today it is 3.0. The other areas do most of the work; the decision here is what the daily unit of progress is.

| | **A. Tune for frequency** | **B. Every day moves something visible** (recommended) | **C. The day's choice** |
| --- | --- | --- | --- |
| Rule | No new mechanic: tune the depth curve, army growth and routed enemies so a hex is in reach most days | Siege progress on the map: each assault day moves its target's progress bar, more on a good-habit day; a hex falls every 2 to 3 days on average | Each dawn the Herald offers 2 or 3 distinct actions (press a siege, accept a Goblin offer, exploit a surge, reinforce a threatened hex), each a real tradeoff |
| Daily link to habits | Indirect | Direct and visible | Indirect |
| Risk | Bad-habit days still show nothing; tuning alone may not hold for 70 weeks | Can feel mechanical without good choices | Must fit the 2- to 5-minute loop; mustn't become a chore |

**Decided (R-15): B, and (R-16) standing siege orders.**

**Recommendation: B** (it comes with siege option 5.2a-B), with C's choices arising from the personalities (Goblin offers, Archmage surges, Orc counterattacks to answer) rather than a separate system. One rule change it needs: a siege target should carry over between days unless changed (standing orders), or a missed day stalls the siege ([X-09](#x-09-orders-dont-carry-over)).

---

## 6. Conflicts with the design book

Each item names what the book (or `decisions.md`) says, what the direction changes, the options and a recommendation. Pillars are the Preface's seven. **Every item is now decided:** those marked "Decided" were ruled on one by one, and all the others were approved as recommended (R-29).

#### X-01 Campaign length
**Book:** "about 11 months" (Preface, Ch 2); Ch 15 targets victory at weeks 36–40 (Perfect), 44–48 (Steadfast), 52–62 (Committed); Appendix D: "Keep victory at about 44 to 48 weeks". **Direction:** the journey may run 60 to 72 weeks. **Measured today:** Steadfast wins at a median of week 44.
**Options:** (a) stretch the campaign: Steadfast about 58 to 64, Perfect 50 to 56, Committed 64 to 72; (b) keep victory at about 44 to 48 and make the Reign a real second act with land and battles (the book puts new realms out of scope); (c) tie victory to the journey, for example the last capital only after Milestone 9. This breaks Pillar 5 ("the body crowns; it does not gate") and would punish plateaus.
**Recommendation:** (a). It also lands Milestones 8 to 10 (weeks 51, 58 and 65 at target pace, Ch 9) inside the campaign, which the book had to leave to the Reign. **Decided (R-17): (a).**

#### X-02 Earliest defeat at week 36
**Book:** Pillar 3, Ch 14, Ch 15 invariant 2, Ch 16 ("Fear of losing"). Rich: keep unless ruled. With a longer campaign the window in which defeat is possible grows from about 12 weeks to about 28.
**Options:** (a) keep week 36 as the floor and tune Ascendancy so a Steadfast player's real risk stays under 5%; (b) move it to week 48, keeping the same share of a longer campaign safe; (c) keep 36 but lengthen Ascendancy's streak (4 to 6 week closes).
**Recommendation:** (a). It is a guardrail, not a pacing tool; keep it and tune the risk. **Decided (R-18): (a).**

#### X-03 Resolution pacing
**Book:** Ch 14: no rival resolved before week 12, at most one per 8 weeks, so the earliest victory is week 36. With a longer campaign it lets the first three rivals fall early and leaves a long tail.
**Options:** (a) keep; (b) scale to none before week 16 and one per 12 weeks (earliest victory 52); (c) drop the week rule and gate each resolution by march depth (the Gate is deep, so time follows from the land).
**Recommendation:** (b) for Patch 5, revisited with simulation. **Decided (R-19): (b).**

#### X-04 The map
**Book:** Ch 3: 127 hexes in six rings, "unchanged from version 1"; the founding table (86 claimable, 12 rival-held, 74 neutral); 30 villages (A-13, A-108: 4/6/8); the Rim (rule 6); capitals and Lair Mouths by Grand Battle only (rules 4, 5); Test 7. D-07 names every hex; D-09 gives each region its tiles.
**Direction:** a bigger map ([5.1](#51-the-map)). **Keep:** the protected core (rings 0 to 2, rule 2), capitals and Lair Mouths by Grand Battle only, Gates by Grand Battle or courtship only (A-16).
**Recommendation:** as decided in 5.1; Test 7 is rewritten for the new map in Patch 2.

#### X-05 Dominion
**Book:** Ch 3 rule 3 (a road hex gives 2 × ring to its building, a between-land hex ring to each of two); Ch 7 tier requirements 8 / 24 / 68 / 68 (code: 1 / 24 / 68 / 68, D-14); Pillar 6 ("a direction feeds one building"); Ch 8's "neighbors rise together". **Decided (R-05):** Dominion is the chronicle of deeds per rival's path, with tiers gated on the total ([5.2b](#52b-dominion-the-chronicle-of-your-war)). Pillar 6 survives in a new form: a path still feeds one building, through its rank perks, and the lair marches feed two. Crossings already gate on building tiers alone, so they keep working; only Ch 8's story about geography changes.

#### X-06 Garrisons and threats by ring
**Book:** Ch 6 base 15 / 22 / 55 / 115 / 200 (code 15 / 18 / …, D-14), beasts 0.9, militia 0.6; Ch 10 threat strength by base(ring), targets weighted ring^1.5, conquest attempts only on ring 3+; D-15's ramp. **Direction:** strength by march and depth. **Recommendation:** re-key every "ring" in combat to depth in Patch 2, keeping the heartland's rings 1 and 2 as they are.

#### X-07 Repulse wear resets at week close
**Book:** Ch 6: a repulse wears 25% of the Assault off the garrison "until the week closes". **Direction:** sieges keep the wear until the hex falls ([5.2a](#52a-what-makes-a-deeper-hex-harder) B). **Recommendation:** change it, with slow decay when the siege stops.

#### X-08 One assault a day
**Book:** Ch 6: one assault a day, two at Castle IV; the Siege Park Wing adds one. **Options:** (a) keep; (b) one siege target plus one ordinary assault each day. **Recommendation:** (a) for Patch 3, revisited if the cadence targets miss. **Decided (R-25): (a).**

#### X-09 Orders don't carry over
**Book:** Ch 2 rule 2 (with no orders the Marshal defends and makes no assault); A-36. **Direction:** a siege would stall on any day the app isn't opened. **Options:** (a) standing siege orders: the target carries over until it falls or is changed; (b) keep the rule. **Recommendation:** (a). Defense still defaults to the Marshal. **Decided (R-16): (a).**

#### X-10 Grand Battle triggers and frequency
**Book:** Ch 11 triggers (Incursion beside a Gate or on 4+ former hexes, Gate, Capital, Mythic Hunt on Lair Mouths and 8% of ring 4–5 West and East dens, Coalition Offensive, Siege, events); about twice a month at most, 5 days apart; Ch 15 target 1 to 3 a month. **Direction:** deep marches move the Gates; strongholds may be Grand Battles. **Recommendation:** re-key Incursions and reveals to march depth, make strongholds Incursion-style Grand Battles, keep the 5-day spacing and the 1 to 3 a month target.

#### X-11 The economy scaled by ring
**Book:** tithes 4 × ring, spoils 4 / 6 × ring, tribute 3 × ring, trade price 50 × ring × greed, fortification 15 / 35 / 70 × ring, village loyalty 15 / 30 × ring, Power 10 × Σ ring held; Ch 15's income table (Momentum about 15% of income); the benchmark's phases by week. **Direction:** 3 to 4× the land, at greater depths, multiplies land income and Power. **Recommendation:** re-key "ring" to a depth band (about 1 to 5, so a deep hex pays like ring 5 does now) in Patch 2, and rebalance the benchmark phases and costs in Patch 5 so that behavior still dominates income (Pillar 1).

#### X-12 Rival land rules
**Book:** Ch 12: expansion of one target a week (Goblin two), fixed budget splits, Border Campaigns at week 10 and every 8 weeks, Rim fronts; Ch 6: trades need Respect 50 (the Goblin 25), never at war, one per rival per 4 weeks; A-23: rivals never court the player's villages. **Direction:** the Goblin always has a deal, bribes your people and you bribe his; rivals fight differently. **Recommendation:** in Patch 4 the Goblin's march replaces the trade limits with its own pricing, and A-23 is overturned for the Goblin only. Decide whether Border Campaigns stay: they took 0 hexes in every simulated campaign. **Decided (R-26): drop them;** the Rim fronts stay as abstract weekly rolls.

#### X-13 Rival personalities as the book has them
**Book:** Ch 12's table (the Orc builds armies and raids 40% more; the Goblin bids, trades and hires mercenaries; the Archmage saves for Rituals and raids 30% less; the Dwarf fortifies and raids 20% less), with budget splits and special funds. **Direction:** distinct march rules ([5.4](#54-rival-personalities)). **Recommendation:** keep the book's levers and add the march rules on top.

#### X-14 The Archmage's Rituals
**Book:** Appendix C: four Rituals in order, one every 6 weeks at 400 saved. **Direction:** frequent wild surges and abilities seen nowhere else. **Recommendation:** keep the Rituals as his big moments; add daily surges in his march. Both seeded through `rng.ts` and settled once.

#### X-15 Coalitions and events keyed to map size or calendar weeks
**Book:** Rising Crown at 1.5× average rival Power; Fear of the Crown at 40% of claimable hexes; Beast Surge at week 10 and every 13 weeks; the Dragon from week 30; the Wild Hunt from week 26; the Pretender. **Recommendation:** rebase on Power after X-11, and re-time the week-keyed events in Patch 5 for the longer campaign.

#### X-16 The Crown's Grace
**Book:** Ch 9 (Steadiness from 8 weeks of Momentum; Grace I reclaim within 14 days for half the garrison, II contested hexes hold 2 days and tribute halves, III benchmark eases and Ascendancy waits to week 44). Rich: keep. **Interaction:** counterattacks and the Orc's attrition make reclaiming matter more, which is good. **Recommendation:** keep as is; with X-01 (a), Grace III's week 44 stays a gentler floor.

#### X-17 Wellbeing guardrails
**Book:** Ch 16. Rich: keep. New ways to lose land (counterattacks, the Orc's attrition, Goblin bribes of your villages) must keep the protected core safe, tell every loss as chronicle rather than judgment, and fit the 2- to 5-minute loop with no notifications (D-04). **Recommendation:** add one rule: while the player has been away 14 or more days, no counterattack or bribe resolves against them (the Marshal defends as usual), mirroring the no-siege-on-return rule. Nothing may expire in a way that punishes not opening the app on a given day (hence X-09). **Decided (R-24):** the recommended rule.

#### X-18 The daily loop's length
**Book:** Ch 2: 2 to 5 minutes; Ch 16 against compulsive checking. **Recommendation:** keep, and treat it as a target ([G-14](#7-targets-for-judging-patches-2-to-5)).

#### X-19 Hidden values
**Book and CLAUDE.md:** the benchmark, rival income, event criteria and rival treasuries (without Spy Network) are never shown as numbers. **Interaction:** bribe and deal prices must not let the player work out a treasury. **Recommendation:** prices come from public facts (Trust, Respect, depth); the Goblin's budget stays a band.

#### X-20 Text for new hexes and events
**Book:** Ch 17: no invented story text. D-07 was an owner-approved exception for the 127 place names. **Direction:** about 200 new hexes, plus new Herald lines for fallbacks, counterattacks, bribes and surges. **Options for names:** (a) the new hexes show their depth label ("Orc march 7-3") until Rich and his brother write names; (b) a one-time D-07-style exception for an agent to write names from each region's existing theme; (c) Rich writes them before Patch 2 ships. **Recommendation:** (a) now, then (b) or (c) when Rich prefers. New Herald lines are plain-fact placeholders in every case. **Decided (R-23): (b),** a one-time exception: an agent writes the new place names from each region's existing theme, in `data/codex/hexes.json`, and Rich edits them as he likes.

#### X-21 No new art
**Direction and Rich:** reuse what exists. **Recommendation:** fallbacks show the defender's existing company token, siege progress and surges use the bundled icon set and CSS, and terrain comes from the 71 existing tiles. No new art slots.

#### X-22 The live campaign
Founded 2026-10-09 on rules 2.0.0. A new map can't be applied to it. **Options:** (a) re-found when Patch 2 ships, and keep playing the current one until then; (b) a migration that maps current holdings onto the new map (complex, for a few weeks of progress); (c) keep it on the old rules and start the new map as a second campaign later. Either way `ledger.json` and every health record are untouched. **Recommendation:** (a).

**Decided (R-20): (a), with a carry-over.** The new campaign is founded on the new map, and its purse is credited with the reputation Rich's ledger days since his first contract (2026-09-30) would have earned under the new system. Rules for the Patch 2 spec:
- The game only reads the ledger and never changes it.
- From the ledger, only behavior income counts: duties, perfect days, streaks, the step pool, the calorie average, flawless weeks, Momentum and contract payouts, each posted under its behavior source so invariant 4 holds. Nothing carries over from the old campaign (its purse, land or battles); its days since 2026-10-09 are re-scored like the rest, never counted twice. The backdated war (R-21) then adds its own spoils, tithes and land as ordinary settlement.
- Legacy contracts are re-scored on the new payout curve (`10 × days × L × f(Q)`) at their own length. Legacy wagers and stakes don't carry over, since pledges are optional and new.
- The founding grant is paid as usual.
- **A full backdate, guided by the player (decided R-21).** The new campaign is founded as of 2026-09-30. Settlement plays every day from then to the founding, rivals, threats and the whole war included, as the existing catch-up does for missed days.
  - First, the founding asks the player a few questions about how they would have played those weeks: which rival's path to pursue, or a balanced mix; whether to build or arm first; whether to take land by force or by deals and courtship; whether to accept rivals' offers.
  - A deterministic catch-up player then makes those weeks' decisions from the answers.
  - Purse credit, land, battles and the rivals' growth all come out of that real settlement, seeded and settled once like any other day.
  - Notes for the Patch 2 spec. The catch-up player must live in `lib/game/` (pure and deterministic), not in `sim/`. The absence rule (R-24) does not apply to these weeks, since the player chose how they were played. The questions are interface text, not story.
- **Weeks count from 2026-09-30 (decided R-22),** the real start of the journey. The defeat floor, resolution pacing, Milestones' earliest weeks and the benchmark's phases all count from it, so victory around weeks 58 to 64 lands near the end of the 60- to 72-week journey.
- Later patches change rules in a running campaign, as D-15 did. Each patch's spec says how the re-founded campaign takes them.

#### X-23 The Ch 15 targets
They assume a 44- to 48-week campaign. **Recommendation:** replace them in Patch 5 with targets matching X-01, and add [section 7](#7-targets-for-judging-patches-2-to-5)'s cadence and path targets to the simulator report.

#### X-24 Victory
**Book:** Ch 14: resolve all four rivals, each by conquest, defection or Accord; with all four resolved the castle becomes the High Throne. **Direction (R-05):** you can win by focusing on one path, two halfway or three a third each. Under the book's rule a one-path player must still resolve the three rivals it ignored, so this rule has to change.
**Options:**
- (a) **The Crown's claim.** You win when total Dominion reaches one threshold, whatever the mix. Resolving a rival is that path's biggest deed but is not required. Rivals left standing keep raiding and can still win by Ascendancy, which keeps the pressure.
- (b) **Your strength forces the others to terms.** Keep "resolve all four", but your total Dominion raises Respect with every rival, so the ones you didn't fight can be resolved by Accord or by bending them to terms. This keeps each rival's fall as a climax but adds a 30-day Accord per ignored rival, plus pacing.
- (c) **The book's rule.** Keep it and accept that one path alone can't win.

**Recommendation:** (a). It is the simplest rule that honors "Dominion is the tapestry of your path", and Ascendancy keeps the ignored rivals dangerous to the end. The claim's size is tuned in Patch 5 to the campaign length Rich chooses in X-01.

**Decided (R-07): between (a) and (b). Victory still means all four rivals resolved, and a new route, terms by intimidation, lets you resolve the rivals you didn't fight.** Rich's direction: once you have gotten far enough into the game, you can force others into Accords or surrender. Instead of one Dominion score, hidden thresholds on several of your scores (reputation, the power of your companies, hexes taken, opponents defeated, and other important scores) make a leader willing to strike an Accord or surrender out of intimidation. The design below fills in that direction; the open choices are listed after it.

1. **What each rival watches.** Five measures of your realm, each with a hidden threshold in `rules.ts` (TUNE), never shown as a number:
   - *Reputation:* everything earned over the campaign, which traces to habits (Pillar 1).
   - *Army:* your best companies' power against that rival's army (relative, so a rival that keeps arming is harder to impress).
   - *Land:* hexes held, overall and in its march.
   - *Opponents defeated:* rivals already resolved, and Grand Battles won.
   - *Your Dominion:* your total, and your Renown against that rival.
2. **Each rival weighs them its own way** (set in Patch 4 with its personality):
   - The Orc is impressed by army strength and battles won.
   - The Goblin by reputation and wealth.
   - The Dwarf by land held and walls broken.
   - The Archmage by endurance: your Dominion and Realm Consistency held over time.

   Its terms come when enough measures pass (for example 3 of 5, weighted, TUNE), so there are several ways to impress each rival.
3. **What terms are.** A surrender resolves the rival at once, as an abdication: its claimable land and its company pass to you. What leads each rival to terms, and whether it offers them itself, is set per rival by R-09 (the table below). That replaces the first draft's single ladder of an Accord at a lower bar and surrender at a higher one.
4. **Autonomy.** Terms are offered, never imposed: you may refuse and keep fighting that rival for its path's deeds. A refused offer comes back later.
5. **Limits.**
   - Weight never counts (Pillar 5: the body crowns, it does not gate); habits count only through reputation and Realm Consistency.
   - A rival in Ascendancy, or in a coalition against you, offers no terms.
   - Resolution pacing ([X-03](#x-03-resolution-pacing)) still applies.
6. **How the paths come together.** A one-path player resolves its chosen rival in its march (conquest, deals or defection), and its standing then wins terms from the others. Two or three paths share the work the same way. The book's conquest, defection and Respect-based Accord routes all stay.

**What the player sees (decided R-08):** each rival's stance shows on the Diplomacy page as a band (for example Defiant, Wary, Shaken, Ready to yield; names are interface labels for the A3 pass). The Herald adds plain-fact rumors about what impresses that rival. Never a number, and never which measure is close.

**How each rival yields (decided R-09, in Rich's words, with Claude's mechanics).** The five measures still drive every rival's stance band and the Goblin's and Archmage's offers; how each rival acts on them is its own:

| Rival | Rich's rule | Mechanics (TUNE; offers stay open 7 days, A-171, and can be refused) |
| --- | --- | --- |
| **Skivvet, the Goblin** | Tries to buy his way out of your war path before surrendering | Once intimidated, he offers a **buy-off**: one of his march hexes, an Armory item, or hired companies for a few weeks, in return for a pact that you leave his march alone for some weeks. The offers grow while you keep pushing. Past a higher bar, or after buy-offs are refused, he **surrenders** (resolved as an abdication). He never pays in reputation: every reputation gain must trace to a habit, a battle or land held (Pillar 1, invariant 4) |
| **Emrys, the Archmage** | Surrenders if he feels his life is at risk | He offers **surrender** when his life is at risk: you hold his Gate, or your standing (the measures above, weighted to army and opponents defeated) passes his high bar, or his army falls far below yours |
| **Ugrak, the Orc** | Can only be conquered. If he doesn't respect you, he comes to you thinking he can conquer you; if he respects you, Ugrak's Challenge plays out (R-11) | No terms, no surrender, no Accord, no defection. Conquest has three roads. (1) His Gate and capital, as the book has it. (2) Once his stance reaches the top band (or he is the last rival standing), if his Respect is below a bar (about 50, TUNE) he launches a **final Warhost** at your border, a Grand Battle with his full host: win it and he is conquered; lose and the target hex passes to him, and he comes again after a cooldown. (3) If his Respect is at or above that bar, **Ugrak's Challenge** plays out instead: the book's duel Grand Battle, two companies a side; win it and he is conquered; lose and pay its tribute and wait out a cooldown |
| **Hrodgar, the Dwarf** | May surrender once most hexes of his kingdom are taken, but he will not be happy about it: a grudging vassal (R-12) | He offers **surrender** once you hold most of his march (about two thirds, TUNE). He yields as a **grudging vassal**: no levy company joins you, and the hexes he gave up stay restless for some weeks (lower village loyalty and a chance of an uprising you can pay to settle, like the book's Village Uprising). It never undoes the resolution |

**The book's other routes (decided R-13).** The Respect-based Accord (Respect 60, then the 30-day Accord contract, D-01) stays for the Goblin, the Archmage and the Dwarf. It is the habit-built road to resolving a rival you didn't fight, since each one's Respect grows with the habit it prizes (A-38: the Goblin your calorie average, the Archmage every duty kept, the Dwarf the step pool met). Defection (winning a rival's villages until it holds none) stays for those three as the book has it. The Orc has neither.

**Why any mix of paths can still win.** A rival you never fought can be resolved by an Accord built from habits (the Goblin, the Archmage, the Dwarf), by the Goblin buying his way out and then surrendering, by the Archmage's surrender once your standing threatens him, or by the Orc coming to you (his final Warhost or his Challenge). Only the Dwarf's surrender needs his march walked, and his Accord doesn't.

#### X-26 Tier V needs the matching rival resolved
**Book:** Ch 7: a building's Tier V needs the rival on its road resolved, plus Milestone tier III (A-42: Milestone 6). **Direction (R-05):** no forced path at any point. **Recommendation:** drop the matching-rival requirement and keep Milestone 6 and the Dominion gate. **Decided (R-27):** as recommended.

#### X-25 Performance
**T17 targets:** a 365-day catch-up under 1 s, `campaign.json` under 1 MB after 70 weeks, measured with 127 hexes. Some land queries rebuild a hex index on every call, so cost grows faster than the hex count. **Recommendation:** re-measure in Patch 2 and set targets of under 2 s and under 2 MB unless Rich wants the old ones kept. **Decided (R-28):** under 2 s and under 2 MB.

---

## 7. Targets for judging Patches 2 to 5

Patch 2 adds these measures to `sim/report.ts` (the method in [section 3.2](#32-how-it-was-measured), plus a focused-player policy) so every later patch is judged on the same numbers. "Steadfast" means the simulator's profile with its greedy-style player; the focused player pushes one march and takes other land only when it has no target there. Today's values are from section 3.

| # | Target | How it's measured | Today |
| --- | --- | --- | --- |
| G-01 | **Something meaningful on at least 5 days a week** | Player-view meaningful days a week, Steadfast, week 2 to victory: mean ≥ 5.0 and ≥ 70% of weeks at 5 or more | 3.0; 23% |
| G-02 | **No dead stretches** | Longest run of days with nothing at all (no land, Grand Battle, build or battle in doubt) ≤ 4 (median campaign) and ≤ 7 (worst); never 2 weeks in a row without land changing hands before the last month | 10 and 33 days; 4 and 15 weeks |
| G-03 | **A target every day** | Days with no hex in reach and no siege to press ≤ 1 a week after week 2 | about 5 |
| G-04 | **Land every week** | Steadfast nets 3 to 4 hexes a week from week 5 to week 52; land changes hands on 3 or more days a week | about 1.8 a week; 1.9 days |
| G-05 | **The map lasts** | At Steadfast's victory, at least 10% of each march is still unheld; Perfect doesn't hold every claimable hex before week 52 | All but the Lair Mouths held by week 38 |
| G-06 | **A focused path pays** | At week 26 the focused player's chosen path has 2× or more the Dominion of the next highest, and reaches rank V before the end | 1.0 to 1.4× |
| G-07 | **Every mix can win** (R-05, R-07) | From Patch 5, with terms in place: four simulated players (one path; two paths halfway; three a third each; all four evenly) have win shares within 5 points of each other and median victory weeks within 3. From Patch 2: a one-path player never stalls (all four buildings reach Tier III by week 26, and hexes held rise every month to week 40) | Strict focus: 0% wins, stalls at 27 hexes |
| G-18 | **Terms do their job** (R-07) | A one-path player resolves at least 2 rivals by terms; no rival offers terms before week 16; at least one offer is refused by the smarter player, who chooses to keep fighting for that path | No such rule |
| G-17 | **The path tells the story** (R-05) | In every campaign, the path with the most deeds is the highest-Dominion path; a player who fought mostly one rival (by battles, deals, sieges or surges) has that path highest in 90% or more of campaigns | No such rule |
| G-08 | **Defending matters** | Mid-game, 2 or more defenses a week banded Matched or worse; land lost in a bad week (Valor under 0.6) at least 2× a good week; land lost a month at most 25% of land gained (Steadfast) | Bad weeks 0.48 vs good 0.20 (D-15) |
| G-09 | **Routed enemies change choices** | A fallback after 60% or more of non-rout assault wins; the next day's target differs from the planned one in 20% or more of those | No such rule |
| G-10 | **The rivals fight differently** | Per march: the Dwarf's has the fewest hexes lost per hex held and the most days per hex taken; the Orc's has the most defenses per hex held and the most hexes changing hands both ways; at least 40% of the Goblin's march is taken by deal or bribe; the Archmage's has a surge at least weekly that moves a target's defense by 25% or more | Trade takes 0% |
| G-11 | **Campaign length** | As Rich rules in X-01; for (a): Steadfast median victory weeks 58 to 64, Perfect 50 to 56, Committed 64 to 72 with 60% or more winning by week 76 | 44, 38, 49 |
| G-12 | **Guardrails and invariants** | No defeat before week 36 (or as ruled); the heartland never changes owner; zero invariant violations; settling twice changes nothing | Holds |
| G-13 | **Grand Battles** | Steadfast 1 to 3 a month | 2.0 |
| G-14 | **A short daily loop** | At most 3 decisions offered a day; a 2- to 5-minute loop, checked by Rich in play | Holds |
| G-15 | **Performance** | 365-day catch-up and `campaign.json` after 72 weeks within X-25's limits | Under 1 s, under 1 MB |
| G-16 | **Neglect costs something** (R-03) | At week 26, the focused player's least-pushed march has garrisons beyond the front at least 20% stronger than the even player's same march; yet G-07 still holds | No such rule |

---

## 8. Patch order and patch plans

### 8.1 The order

| | **A. As proposed** | **B. Re-scoped** (recommended) | **C. One march first** |
| --- | --- | --- | --- |
| Patch 2 | Bigger map | Map + depth curve + Dominion re-keyed + the new measurements | The whole new map, with depth, sieges, routed enemies and personality for the Goblin's march only |
| Patch 3 | Depth progression | Sieges, strongholds and flanking + routed enemies | The Orc's and the Dwarf's marches |
| Patch 4 | Routed enemies | Rival personalities | The Archmage's march and the lairs |
| Patch 5 | Rival personalities | Campaign length, endgame and economy retune | Length, endgame and economy retune |
| For | Small steps | Every patch is playable and measurable on its own | Rich plays the fun early |
| Against | Patch 2 alone gives the same stalls on a bigger board, and forces a new campaign for no gain in fun; the endgame never gets its own retune | Patch 2 is big | Three marches stay plain for weeks; every patch retunes |

**Recommendation: B.** The simulator shows the stalls come from the depth curve and the Dominion gates, not from the hex count, so a bigger map without them reproduces today's problem at a bigger scale. Routed enemies sit in the same rule as sieges (assault resolution) and tune with it. The length, pacing, Ascendancy and benchmark can only be tuned once the land rules are final, so they need their own patch.

**Decided (R-31): B.**

### 8.2 Patch plans

These follow Rich's decisions (section 1); the R- numbers say which decision each item carries out.

**Every patch:**
- A written spec, approved by Rich before any code. A big patch may be built in stages, as D-12 was.
- New `D-` entries in `decisions.md`, and `ruleVersion` bumped.
- Every new number in `rules.ts` or the codex, marked TUNE.
- `npm run typecheck`, `npm test` and `npm run check:game` pass, and `npm run sim` reports the targets.
- This file's status table updated.
- Rules change in the running (re-founded) campaign as each patch lands, as D-15's did, and each spec says how.

**Patch 2: the map, depth, Dominion and the re-founding.**
1. **Measures first.** Port section 3.2's day labels and section 7's targets into `sim/report.ts`. Add the path-mix players to `sim/policy.ts` (one path, two halfway, three a third each, all four evenly). Record today's baseline in the report.
2. **The new map** (R-01, R-02) in `map.ts`, and the map screen fitted to its shape:
   - The heartland (rings 0 to 2) as today, plus four rival marches about 5 wide and 12 deep and two lair marches. About 284 claimable hexes.
   - Depth, regions to the existing tiles (near and far wilds become shallow and deep), villages per march, founding ownership and Lair Mouths.
   - The keep-list (X-04): the protected core; capitals and Lair Mouths by Grand Battle only; Gates by Grand Battle or courtship.
   - Test 7 rewritten for the new map. Border Campaigns removed, with the Rim fronts kept as abstract weekly rolls (R-26).
3. **Strength by depth** (X-06): garrisons and threats keyed to march and depth beyond the heartland, as a smooth curve per march, which Patch 3's sieges sit on (R-04). Ring-scaled income and costs re-keyed to depth bands (X-11).
4. **Dominion as the chronicle** (R-05, 5.2b):
   - Four paths, Renown from the shared deeds, and Holdings by depth.
   - Path ranks I to V, with each building's existing role effect scaled by rank as a stand-in.
   - Building tiers gated on total Dominion; Tier V without the matching-rival requirement (R-27).
5. **Neglected marches harden** (R-03, R-06, 5.2c): the preparation level, tuned together with the focus targets.
6. **Names for the new hexes** (R-23): written by an agent from each region's theme in `data/codex/hexes.json`, under the one-time exception.
7. **The re-founding** (R-20, R-21, R-22, X-22), built last because it runs on everything above:
   - Founded as of 2026-09-30, with weeks counted from then.
   - The founding questions, and a deterministic catch-up player in `lib/game/`.
   - The ledger's behavior income since 2026-09-30, legacy contracts re-scored on the new curve, and the founding grant.
   - Every day since settled with the whole war. `ledger.json` is never written.
8. **Must hit:** G-04, G-05, G-06, G-07 (its Patch 2 half: no stalls for a one-path player), G-12, G-15 (2 s and 2 MB, R-28), G-16. Expect G-01 and G-03 to improve but not yet hit, and G-17 to hold for the shared deeds.

**Patch 3: sieges and routed enemies.**
- **Sieges** (R-04, R-15): persistent wear and its slow decay, siege progress on the map, strongholds every few steps as Incursion-style Grand Battles or long sieges (X-10), and the flanking modifier.
- **Standing siege orders** (R-16).
- **One assault a day** (R-25), revisited only if the cadence targets miss.
- **Fallbacks and counterattacks** (R-10), with the absence rule (R-24).
- **The siege and counterattack deeds** for Dominion (5.2b).
- **Must hit:** G-01, G-02, G-03, G-08, G-09, G-13.

**Patch 4: the rivals fight differently, and how they yield.**
- **Each march's rules** (R-14, 5.4).
- **The Goblin:** his own pricing and bribes, replacing the trade limits; he may bribe your villages, overturning A-23 for him (X-12). His buy-off offers are land, items or hired companies, never reputation.
- **The Archmage:** daily surges in his march alongside the Rituals (X-14).
- **Personality variants** of fallbacks and of preparing while neglected.
- **Each rival's signature deeds** for Dominion, and real path-rank perks replacing Patch 2's stand-in.
- **How each rival yields** (R-07, R-09, R-11, R-12, R-13, X-24):
  - The five measures and their hidden thresholds, with each rival's weighting, and stance bands plus Herald rumors (R-08).
  - The Goblin's buy-offs, then surrender.
  - The Archmage's surrender when his life is at risk.
  - The Orc only by conquest: his Gate and capital, his final Warhost when he doesn't respect you, or Ugrak's Challenge when he does.
  - The Dwarf's grudging surrender once most of his march is taken.
  - Respect-based Accords kept for all but the Orc.
- **Rival AI** changed to match. Prices are built from public facts only (X-19).
- **Must hit:** G-10, G-17, G-18, and keep G-01 to G-09.

**Patch 5: length, endgame and economy.**
- **Campaign length** (R-17): Steadfast victory around weeks 58 to 64.
- **The defeat floor** kept at week 36, with the risk tuned (R-18).
- **Resolution pacing**: none before week 16, then one per 12 weeks (R-19).
- **Grand Battle frequency** (X-10), **coalitions and the week-keyed events** re-timed (X-15), and **the benchmark's phases and the costs** (X-11).
- **The thresholds for terms**, tuned to the new length.
- **New Ch 15-style targets** (X-23).
- **A full simulator run and a tuning report**; Rich approves each number change (D-02).
- **Must hit:** G-07 in full, G-11, G-12, G-13, G-15, G-18, and keep the rest.

### 8.3 Status

| Patch | Spec approved | Built | Targets met |
| --- | --- | --- | --- |
| 1 Blueprint | Decisions R-01 to R-31 recorded 2026-10-13 | This file | — |
| 2 | Questions answered 2026-10-14; the rest delegated to Claude that day ([spec](patch-2-spec.md) sections 1 and 13) | 2026-10-14, rules 3.0.0, committed (`37cadcc`); the live campaign is not yet re-founded (C-19) | G-04, G-05, G-06, G-07 (Patch 2 half), G-12, G-15, G-16 and G-17 met; G-01 and G-03 improved, not yet met ([report](../game/sim/targets-3.0.0.md)) |
| 3 | Questions P3-01 to P3-03 answered 2026-10-14; the rest Claude's calls C-20 to C-33 at Rich's delegation; approved as written 2026-10-15, C-27's way of counting G-01 and G-03 included ([spec](patch-3-spec.md)) | In progress: stages 1 to 5 (the measures, sieges on rules 3.1.0, strongholds, fallbacks and counterattacks, the deeds and How to play) done 2026-10-15, not yet committed; stage 6's tuning report (spec section 15, T-01 to T-05) approved and built 2026-10-15, D-22 to D-26 written; not yet committed | 3.0.0 baseline on the new measures regenerated ([report](../game/sim/targets-3.0.0.md)); 3.1.0 tuned ([report](../game/sim/targets-3.1.0.md)): every target Patch 3 must hit or keep is met but G-09's second half, left for Patch 4 (D-26); G-05 read at week 60 until Patch 5 |
| 4 | | | |
| 5 | | | |

---

## 9. Open questions for later specs

These need no decision now; each patch's spec settles them with Rich.

1. **Patch 2.** The march's founding ownership: how much is the rival's, how much beasts and villages, and how strongly the rival holds it.
2. **Patch 2.** Whether seam hexes between neighboring marches count for both, and how the lair marches meet the rival marches.
3. **Patch 2.** The founding questions for the backdated weeks (R-21): exactly which choices, and how the catch-up player turns them into daily orders.
4. **Patch 2.** The deed values, the Renown and Holdings split, and the rank thresholds (5.2b).
5. **Patch 3.** How deep the strongholds sit, and whether each is a Grand Battle or a long siege.
6. **Patch 4.** The real path-rank perks for each rival's path, and the terms thresholds' weighting per rival.
7. **Any patch.** Whether led daily battles (D-12) extend to counterattacks and stronghold fights.
8. **Patch 5.** Whether the Reign after victory needs content of its own once the campaign runs the length of the journey.
