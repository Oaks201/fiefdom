# Patch 5 spec: length, endgame and economy; bent marches; Respect both ways

Written 2026-10-16 and 2026-10-17. **Status: approved as drafted by Rich on 2026-10-17, after his review.** Earlier that day Rich had asked Claude to take its own recommendations ("auto accept all, i wont be here today but i will review when i am home"). So every open question in [section 1.1](#11-the-open-questions-answered-at-richs-delegation-2026-10-17) carries Claude's recommendation as its answer, P5-01 to P5-10. Every further rule Claude settled is a call, C-50 onward ([section 1.2](#12-claudes-calls)). Every earlier number this patch changes is an N-item ([section 1.3](#13-earlier-numbers-this-patch-changes-d-02)). Rich then reviewed the spec and approved every answer, call and N-item as written. The build's own changes go in [section 11](#11-what-the-build-changed), and number changes from the tuning stage still come to him (D-02).

This spec carries out [blueprint](blueprint.md) section 8.2's "Patch 5". That covers decisions R-17 to R-19 and conflicts X-01, X-03, X-10, X-11, X-15 and X-23, plus Rich's two additions of 2026-10-16: the bent marches (mockup "C") and Respect both ways. It builds on Patch 4 as committed on `patch-4`:
- `1ffbc6b`, `9f9b523` and `77f0cb6` (rules 3.2.0; [Patch 4 spec](patch-4-spec.md) with its section 16);
- the art and Undo start commits after them, through `6353437` (D-36).

Every new number is a first guess marked TUNE. It lives in `rules.ts` or the codex, and the simulator reports on it (D-02: the simulator never retunes, and Rich approves each change).

Paths: game modules are in `src/renderer/src/lib/game/`, the simulator in `sim/`, tests in `tests/game/`.

**What this spec keeps.** The four-march map keeps its structure (D-16): the same 321 hexes, their marches, depths, lanes, seams, bands, kinds, villages, strengths and names. Only where each hex sits moves (section 3). Also kept:
- Dominion as four paths (D-18); neglected marches (D-19);
- Patch 3's sieges, strongholds, fallbacks and counterattacks (D-22 to D-26);
- Patch 4's march rules, terms and signature deeds (D-27 to D-35), except where this spec says otherwise;
- skirmishes and Undo start (D-12, D-36);
- the re-founding (D-21), and `autoplay.ts` as the one automatic player.

Border Campaigns (R-26) and A-129 stay retired. The defeat floor stays at week 36 (R-18), the Crown's Grace and the Ch 16 guardrails stay, and no new art is added (X-21).

---

## 0. The patch in short

- **Bent marches (Rich, 2026-10-16; P5-06).** Each ring of the layout beyond ring 4 turns clockwise: one step for rings 5 to 7, two for 8 to 10, three for 11 to 13, four for 14 and 15. That is mockup C, so the marches and the lair wedges bend as they run out and the map reads as a continent rather than an X.
  - Every hex keeps its march, depth, lane, kind, owner, garrison, village and name. Only its position, its `"q,r"` id, moves: 260 of the 321 hexes.
  - **A running 3.x save is migrated once, in place**, by renaming every hex id it holds (section 6.2). A marker in the save records that the migration has run. The old file is backed up first. Nothing is re-founded.
- **Respect both ways (Rich, 2026-10-16; P5-07 to P5-09).** Each court's Respect runs from **−100 to +100**. It rises and falls with what that rival values, through drivers that are his own.
  - Marks on both sides give perks as it rises and detriments as it falls. Today's positive marks keep their numbers, so nothing earned is lost.
  - **Respect now sets Peace, Tension and War** (his "standing"). War comes at −25 or below, or in a coalition. Peace comes at +50 or above, and never with the Orc. Tension lies between.
  - Threat, recent land and the "4 quiet weeks" no longer decide it. That is why Peace almost never came: a rival's own raids kept it away.
  - The court shows the number with its standing and the marks above and below. The guide's section is rewritten.
- **Length, endgame and economy (R-17 to R-19; P5-01 to P5-05, P5-10).**
  - **Resolution pacing goes to 16 and 12** (R-19). On 3.2.0 that alone moves the smarter player's victory to Perfect week 55, Steadfast week 60 and Committed week 73 (90% by week 76), inside R-17's windows but for Committed's median (section 5.1).
  - **Kept as they are, because the probe shows they need no change:** the benchmark's phases, the costs, the garrisons and depth, the terms thresholds, the Grand Battle rules and the defeat rules. No campaign of 496 fell, and raising the terms thresholds a quarter pushes Steadfast to week 67.
  - **The Dragon wakes from week 40** instead of 30, which spreads a crowded month (week 29 to 32) into the longer second half.
  - G-11 is judged on the smarter player. G-09's second half is retired. The Reign gets no new content.
  - New Ch 15-style targets replace the book's 44-to-48-week table (G-19 to G-21).
- **Rules 3.3.0, carried forward in place.** The save keeps its founding `ruleVersion`. The one-time bend migration is recorded in a new optional `campaign.migrations` list, and Respect needs no migration (section 6).
- **Build order:** the measures, then the bend with its migration, then Respect both ways, then the length and economy tuning last, because both earlier pieces move the numbers (section 7).

---

## 1. Decisions

### 1.1 The open questions, answered at Rich's delegation (2026-10-17)

Claude asked P5-01 first; Rich answered "auto accept all" instead. Each answer below is Claude's recommended option. The evidence is from the scratch probe of section 2.1 (rules 3.2.0, no game code changed).

| # | Question | Answer (Claude's recommendation) | Evidence | Set aside |
| --- | --- | --- | --- | --- |
| P5-01 | How G-11 is measured | **On the smarter player**: Perfect, Steadfast and Committed `smarter`, 90-week horizon. The greedy player stays the yardstick for G-01 to G-10, and its resolutions are reported beside | Only a player who takes Accords and terms finishes. Steadfast greedy wins 0 of 20 by week 90 (it resolves a median 3: the Orc about week 45, the Archmage 81, the Dwarf 89); the smarter player wins 100% | Teaching the greedy player to finish: it would move every G-01 to G-10 baseline Patches 2 to 4 were tuned on |
| P5-02 | Which levers set the length | **Resolution pacing alone (R-19: 16 and 12).** The benchmark's phases, the terms thresholds, the garrisons and the depth curve stay | With 16/12 the smarter player wins in week 55 (Perfect), 60 (Steadfast) and 73 (Committed, 90% by 76). Victory comes about 36 weeks after the first resolution, the Dwarf's Accord in week 23. Terms ×1.25 on top: Steadfast 67; ×1.5: 68.5 | Raising the terms thresholds (overshoots), a fifth benchmark phase (no falls to cure; it would only add Ultimatums), deeper garrisons (moves every land target) |
| P5-03 | Grand Battle frequency (X-10) | **Unchanged**: the triggers, the 5-day spacing and G-13's 1 to 3 a month | Steadfast greedy 1.7 a month over 90 weeks (1.6 with 16/12), smarter 1.2 to its victory. Months 1 and 2 have none; month 8 (weeks 29 to 32) peaks at 4.1 for the smarter player | A new late trigger: G-13 holds without one |
| P5-04 | Coalitions and the week-keyed events (X-15) | **The Dragon wakes from week 40** (was 30; N-07). The rest stays: the Beast Surge from week 10, every 13; the Hungry Winter in December; the Wild Hunt from 26; Fear of the Crown at 40% of claimable land; the coalitions' triggers (the First Fall at the first resolution, the Rising Crown from week 12); the Pretender | Every event fires in 100% of campaigns by week 35 (the Pretender, with 3 weeks after a conquest, by 46 to 50). Month 8 holds the Wild Hunt, the Dragon and 4.1 Grand Battles; with 16/12 the months after week 48 run about 1. The first coalition forms in week 23 (smarter, the First Fall) or 44.5 (greedy) | Scaling every week-keyed start by the length (×1.13): it moves events that already land well |
| P5-05 | G-09 | **Retire its second half** ("the next day's target differs in 20% of dawns after a fallback"). Keep its first half and report the second | 7% on 3.2.0 and 6 to 7% on both bends (100 seeds). Patch 3 tried nine variants and none passed 12% (T-05). The automatic player weighs garrisons, not a strike back | Re-measuring with a player who weighs a fallen force's threat: a new habit built only to pass a target |
| P5-06 | The bend's step and rhythm | **Mockup C: one step clockwise every three rings from ring 5** (rings 5 to 7 one step, 8 to 10 two, 11 to 13 three, 14 and 15 four) | 100 Steadfast greedy seeds: G-01 5.8, G-04 3.31, G-10 holds (the Orc's churn 0.289 against the Goblin's 0.266), G-06 2.35×, G-07 100%; **G-08 1.90× against 3.2.0's 1.98× on the same seeds** (every four rings: 1.97×). In running saves the bend cuts no player land off in 16 of 18 snapshots (2 hexes in the other two) | One step every four rings (a gentler bend, G-08 cheaper); one every two (bends a march by a third of a side) |
| P5-07 | Each rival's Respect drivers and marks | **Each rival his own drivers and his own marks on both sides** (sections 4.3 and 4.4), over a shared skeleton: today's positive marks keep their numbers; War at −25, raids stronger at −50, his own detriment at −75; his own perk at +75 | Today Respect moves mostly with raids (20 to 36 beaten and 10 to 38 lost a campaign) and the prized habit; the Dwarf reaches 100 by week 26 on the step pool, the Goblin hovers at 16 to 48 | One shared ladder with only the drivers per rival: simpler, but Rich asked for marks that are each rival's own |
| P5-08 | How Peace, Tension and War map onto the track | **Respect sets the standing**: War at −25 or below (or in a coalition), Peace at +50 or above (never the Orc), Tension between. Read at each week close, as today. A running campaign keeps its numbers; its standing is read from them at the first 3.3 week close | Today Peace is rare: the Orc is at Peace 1 to 3% of weeks, the Goblin 0 to 2%, the Archmage 0 to 1%, while the Orc's Respect is 95 to 100 by week 40. His raids count as hostile acts, so the 4 quiet weeks never come | Clamping each rival into his current band at migration (a rival at War with Respect 100 would lose 125 points) |
| P5-09 | Respect as a number or only as bands | **A number with its standing** ("Respect +32 · Tension"), and the marks above and below | Respect is not a hidden value; the marks need a number to read | Bands only: the marks would have to be named bands too |
| P5-10 | Whether the Reign needs content (blueprint 9 item 8) | **No new content in Patch 5.** The Reign stays as A-176 has it (settling, building, the High Throne, `herald.reign`) | Victory now lands in weeks 55 to 73 against a 60- to 72-week journey, so the Reign is a few weeks; Milestones 8 to 10 (weeks 51, 58, 65 at target pace) now fall inside the campaign | Reign goals (later, if Rich wants them) |

### 1.2 Claude's calls

These follow from the answers above, made at the same delegation. **Rich may overturn any of them.**

| # | Call | Why |
| --- | --- | --- |
| C-50 | **Rules 3.3.0**, carried forward in place; `campaign.ruleVersion` stays the founding version | A major bump would force a re-founding (`needsRefounding`) |
| C-51 | **A migration marker**: `Campaign.migrations?: string[]`, the one-time migrations applied to this save, in order. The bend's is `'bentMarches'`. Absent means none | The founding `ruleVersion` can't say whether a migration ran (Rich's note). A list serves later migrations too |
| C-52 | **The migration is one structural pass** over the whole save. It renames every string that is exactly a moved hex id, every object key that is one, and every `:`-separated part of a string that is one (purse sources, fallback ids, skirmish fight ids, terms gifts). A test holds it to the typed inventory of section 6.2, so a field added later fails until it is listed | One rule can't miss a field, and the test keeps the inventory honest. The scan of six saves found no other string shaped like a hex id |
| C-53 | **The old file is kept before the migrated one is written**: `backups/campaign-<ruleVersion>-before-bend.json`, never pruned, as the re-founding keeps `-final`. If that copy fails, the campaign doesn't open and nothing is written; the ledger keeps working | The live campaign holds Rich's real progress |
| C-54 | **Seeded draws keep a stable key.** A draw whose result is read again for a day already settled, which today is only a seam's ruling march (`seam:<id>`), uses the hex's id on the straight layout, in migrated and new campaigns alike. A founding's strength jitter does too | Keyed by the new id, 12 of the 22 seams would flip their ruling march on about half of all days already played. Neglect, the deeds and G-10 read those days again |
| C-55 | **Map order stays layout order** (ring by ring, by position on the straight ring), so a migrated save keeps its `hexes` array exactly and only ids and coordinates change | "Map order" breaks ties everywhere (A-155, `nearestTo`, `pick`) |
| C-56 | **Villages stay where they are.** D-16's spacing (no two villages of a group touch; at most 6 pairs across groups) is a founding rule; new campaigns seed under the bent geometry. A migrated save keeps its villages, of which about 5 to 7 pairs within a group come to touch | Villages carry owners and loyalty; no rule reads the spacing after founding. In 100 bent foundings the seeding never failed |
| C-57 | **Strongholds are picked by lane** (the road's row, as today, counted on the straight ring), so each stays the same hex | Today's pick reads ring positions, which the bend moves |
| C-58 | **`hexes.json`**: each entry's `id` moves with its hex and its `label` is recomputed (`map.test.ts` checks it); every name is unchanged | D-07, D-20: names belong to the hex, not the position |
| C-59 | **The continent's outline (`mapLand`) is refitted** to the bent layout (drawing only; screenshots in stage 2) | Its ellipse was fitted to the straight X |
| C-60 | **The standing is read at each week close** (step 7 of the rival turn, as `setDisposition` is today) from Respect alone, and at once when a rival joins a coalition. Threat, land taken in 2 weeks and the 4 quiet weeks no longer decide it. `RivalState.disposition.player` stays in the save and keeps the standing, so every reader still works; the `disposition` event still posts | The weekly rhythm matches the threat schedule (A-28); one source for the standing |
| C-61 | **Respect still starts at 20** (A-18). Today's positive marks keep their numbers and effects | Victory comes about 36 weeks after the first Accord (section 5.1); a start at 0 would push it about 5 weeks later. Nothing earned is lost |
| C-62 | **"His raid beaten" and "lost to his raid" count his conquest attempts and his garrisons' counterattacks too** (today raids only) | All are his attacks; the Orc's are most of them |
| C-63 | **A Truce is always open**, whatever Respect, as today | The way out of a losing war (Ch 16 "Fear of losing") |
| C-64 | **Audience lines** (`rivalLines.json`, Rich's file) keep their floors 0, 25, 40, 50, 60 and 75. Respect below 0 reads the lowest floor's line until Rich adds negative floors to the file; no code change | The file is Rich's; `respectTier` already reads any floors |
| C-65 | **What replaces `dispositionNote`**: a standing note (section 4.6) giving the standing, what it allows, the nearest marks up and down, and the rival's drivers in plain words, with every number read from `RULES` | Rich asked for the plain-words line to follow the new track |
| C-66 | **Terms don't read Respect**, as today: the stance reads its six measures. The Orc's last battle still turns on Respect 50 (Ugrak's Challenge from 50, the final Warhost below) | Terms are intimidation; Respect is regard. R-11 already reads the Orc's Respect |
| C-67 | **The terms thresholds stay** (C-34) | Section 5.2: the pacing sets the spacing. ×1.25 overshoots R-17 (Steadfast 67) |
| C-68 | **The benchmark's phases, costs, garrisons and depth stay**; stage 1 measures the income split, and stage 4 proposes a change only if behavior income falls under half of reputation earned | The ratio to the benchmark is 1.07 (Steadfast, weeks 1 to 48; the book's estimate 1.14) and 1.00 in weeks 49 to 64, the book's "late squeeze". No falls |
| C-69 | **The automatic player's terms habit scales with its paths**: a steered smarter player refuses its own paths' terms until rank V on one path, III on two, II on three or four (`refuseOwnPathUntilRank` by path count; a habit, not a rule; N-13) | G-07 in full: today the all-four player refuses every rival until all four paths reach rank V, and its median victory (68.5) trails the others' (64) |
| C-70 | **New Ch 15-style targets** (X-23): G-11 as P5-01, and G-19 (defeat), G-20 (Respect moves) and G-21 (income), in section 8.1 | The book's table assumes 44 to 48 weeks |
| C-71 | **Committed and Wavering losses stay reported, not tuned** (the book's 20 to 35% and 60 to 80%); R-18 asks only that a Steadfast player's risk stay under 5% | D-14 and D-15 left those targets for a later pass; nobody falls today |
| C-72 | **G-08 is judged on 100 seeds** (Rich's instruction), which share their bad weeks across versions; the 40-seed reading is shown beside it | 40 seeds swing ±0.15. On 100 seeds 3.2.0 reads **1.985×**, already a hair under 2: the tuning stage must bring it back (section 8.2) |
| C-73 | **G-15 stays read at 72 weeks**; the size at 90 weeks is reported beside it | A greedy campaign that never wins reaches 1.92 MB by week 91 |

### 1.3 Earlier numbers this patch changes (D-02)

Each changes a number or rule of an earlier decision, and is reported with simulator evidence in the tuning stage.

| # | What | Was | Becomes | Decided by |
| --- | --- | --- | --- | --- |
| N-06 | Resolution pacing (Ch 14, A-168) | None before week 12, one per 8 weeks (C-34 kept them) | **None before week 16, one per 12 weeks** (`RULES.world.resolution`) | R-19, P5-02 |
| N-07 | The Dragon wakes (Appendix C, A-169) | From week 30 | **From week 40** (`events.json`) | P5-04 |
| N-08 | Respect's range | 0 to 100 | **−100 to +100**; the start stays 20 | Rich, P5-07, C-61 |
| N-09 | Peace, Tension and War (Ch 12, A-149) | War at Threat 60, land taken in 2 weeks or a coalition; Peace at Respect 50 and 4 quiet weeks | **From Respect**: War at −25 or a coalition, Peace at +50 (never the Orc). `RULES.rivals.disposition` retires | Rich, P5-08, C-60 |
| N-10 | Respect changes (Ch 12) | Raids beaten +3 and lost −2; a hex conquered −5; a Truce +2; an Incursion won +5 | Raids, conquest attempts and counterattacks (C-62). **The Orc: a hex conquered −2, a Truce 0, any Grand Battle against him won +5 and lost −5.** New drivers per rival (section 4.3) | P5-07 |
| N-11 | The Goblin's bribe price (D-29) | × (1 − 0.003 × Respect), Respect 0 to 100 | The same formula over −100 to +100: up to 30% dearer below 0 | P5-07 |
| N-12 | The layout (D-16) | The straight X | **Bent**: 260 hexes move (section 3.1) | Rich, P5-06 |
| N-13 | The automatic player's terms habit (S-35) | Refuses its own paths' terms until rank V | Until rank V, III or II on 1, 2, or 3 to 4 paths | C-69 |
| N-14 | Village spacing (D-16, E-06) | Holds for every map | Holds at founding; a migrated save keeps its villages | C-56 |

---

## 2. Measures first

### 2.1 What a scratch probe shows (3.2.0, no game code changed)

Scripts outside the repo patched `rules.ts` and `map.ts` in memory only, as `sim/overrides.ts` does. They played whole campaigns through the real modules and the simulator's own `runCampaign` and `targetRows`. The runs were:
- **Length**: 208 campaigns to week 90 (Perfect, Steadfast, Committed and Wavering, greedy and smarter, and the smarter one-path players), each on 3.2.0 and with 16/12 pacing; 168 more with the terms thresholds ×1.25 and ×1.5.
- **Path mixes**: 120 smarter path-mix campaigns with 16/12.
- **Bend**: 300 Steadfast greedy campaigns to week 70 (3.2.0, and the bend every three or every four rings) and 80 one-path ones.
- **Running saves**: the bend applied to four 3.2.0 campaigns at weeks 8, 16, 26, 40 and 52.
- **Hex ids**: a scan of the 3.1.0 fixture and five 3.2.0 campaigns for every place a hex id sits.

No invariant broke in any run. Nothing in `%APPDATA%\Fiefdom` or any health data was read.

**Length** (smarter unless named; median victory week [quartiles]; share won by week 76):

| Player | 3.2.0 (12/8) | 16/12 | 16/12, terms ×1.25 | 16/12, terms ×1.5 |
| --- | --- | --- | --- | --- |
| Perfect (10) | 43 [43–44] | **55** [55–56] | 55 | 55 |
| Steadfast (20) | 53 [52–55] | **60** [59–62] | 67 [65–67] | 68.5 [67–70] |
| Committed (10) | 67 [62–69]; 90% | **73** [67–74]; 90% | 72 [68–74]; 100% | 75.5 [74–77]; 70% |
| Smarter one-path (24) | 56.5 | 61 | 62 | 63.5 |
| Wavering (10) | 82; 10% | – | – | – |
| Steadfast greedy (20) | 0% by week 90 (a median 3 resolved) | 0% (2 resolved) | 0% | 0% |

- The resolutions for Steadfast smarter come in weeks 23, 35.5, 44 and 53 on 3.2.0, and 23, 36, 48 and 60 with 16/12. The first is the Dwarf's Accord (20 of 20), then the Goblin's surrender, the Orc's last battle and the Archmage's Accord.
- **G-18 holds with 16/12**: a median 2 rivals resolved by terms (88% two or more), no offer before week 16, a median 1 refused.

**Path mixes with 16/12 (G-07 in full)** (smarter, seeds 101 on):

| Mix | Won | Median week [quartiles] | By week 70 |
| --- | --- | --- | --- |
| One path (each rival, 40) | 100% | 64 [60–67] | 93% |
| Two halfway (Orc and Goblin; Dwarf and Archmage; 40) | 100% | 67.5 [65–71] | 70% |
| Three a third (Orc, Goblin, Dwarf; 20) | 100% | 64 [63–66] | 100% |
| All four (20) | 100% | 68.5 [66–73] | 65% |

The win shares are within 5 points; the medians spread 4.5 weeks against G-07's 3 (C-69 is the habit change aimed at it).

**Defeat (R-18).** No campaign fell: 0 of 496, to week 90, Wavering included. Ultimatums are common: 20 of 20 Steadfast greedy campaigns, 4 of 20 smarter (5 with 16/12), 10 of 10 Committed smarter and 95 of 120 path-mix players. Every Siege that followed was won or the knee bent.

**Grand Battles a month** (to the campaign's end):

| | Mean | Months 1–2 | Month 8 (weeks 29–32) | After week 48 |
| --- | --- | --- | --- | --- |
| Steadfast greedy | 1.7 (16/12: 1.6) | 0 | 4.0 | 0.5 to 3.9 |
| Steadfast smarter | 1.2 (16/12: 1.2) | 0 | 4.1 | 0.5 to 1.0 (16/12: 0.6 to 1.1) |

**Events, first week** (Steadfast smarter, share of campaigns):
- every campaign: the Envoys (week 2), the Wandering Order (7), the Hungry Winter (9), the Beast Surge (10), the Deep Call (12), the Merchant Caravan (14.5), the Wild Hunt (26), the Dragon (30) and Fear of the Crown (35);
- the Lost Heir in week 31.5, and the Pretender in 46.5 (80%);
- a coalition in 100% of campaigns (smarter: week 23, the First Fall; greedy: week 44.5).

**Respect and standing today** (median Respect at weeks 8 / 16 / 26 / 40; share of active weeks at Peace / Tension / War; campaigns reaching Peace):

| Rival | Steadfast smarter | Steadfast greedy |
| --- | --- | --- |
| Orc | 39 / 43.5 / 65 / 100; 1% / 72% / 26%; 1 of 20 | 37.5 / 42.5 / 64 / 95; 3% / 91% / 6%; 1 of 20 |
| Goblin | 24.5 / 24.5 / 26 / 48.5; 2% / 93% / 5%; 1 of 20 | 22.5 / 17.5 / 16 / 29.5; 0% / 48% / 52%; 1 of 20 |
| Dwarf | 56 / 85 / 100 / –; 24% / 76% / 0%; 20 of 20 (week 20) | 54 / 82.5 / 100 / 100; 27% / 25% / 48%; 19 of 20 |
| Archmage | 29.5 / 31.5 / 37.5 / 56; 1% / 72% / 28%; 4 of 20 | 29.5 / 29.5 / 34 / 45; 0% / 59% / 41%; 0 of 20 |

What moves it, a campaign (Steadfast greedy):
- raids beaten, 20 to 36 (+59 to +106);
- raids lost, 10 to 38 (−20 to −76);
- hexes conquered, 1.6 to 21 (−8 to −105);
- prized weeks, 0.7 (the Orc) to 32 (the Dwarf);
- an Incursion won, about 3 to 5.

**Income against the benchmark** (behavior income only, as Ch 15 counts it, over the benchmark the rivals earned):

| | Weeks 1–48 | Weeks 1–60 | Weeks 49–64 | The book's estimate (1–48) |
| --- | --- | --- | --- | --- |
| Steadfast greedy | 1.07 | 1.06 | 1.00 | 1.14 |
| Committed greedy | 0.89 | 0.87 | 0.82 | 0.92 |
| Wavering greedy | 0.64 | 0.63 | 0.61 | 0.69 |

**The bend** (Steadfast greedy, the same 100 seeds, 70 weeks):

| | 3.2.0 | Every 3 rings (C) | Every 4 rings |
| --- | --- | --- | --- |
| Hexes moved | 0 | 260 | 230 |
| G-01 (days a week; 5+) | 5.9; 84% | 5.8; 84% | 5.8; 83% |
| G-02, G-03 | 1; 2; 1 wk; 0.2 | 1; 2; 1 wk; 0.2 | 1; 2; 1 wk; 0.2 |
| G-04 | 3.26; 4.1 | 3.31; 4.1 | 3.29; 4.1 |
| G-05 | 16% | 16% | 15% |
| **G-08** (bad vs good weeks) | 1.200 vs 0.605 = **1.985×** | 1.109 vs 0.583 = **1.90×** | 1.156 vs 0.587 = **1.97×** |
| G-08 on seeds 1–40 / 41–80 / 61–100 | 2.10 / 1.91 / 2.02 | 1.91 / 1.83 / 1.97 | 1.95 / 1.97 / 2.05 |
| G-10 both ways (the Orc; the Goblin) | 0.301; 0.295 | 0.289; 0.266 | 0.310; 0.283 |
| G-10's other readings | met | met (the Goblin's 51% by deal) | met |
| G-09 second half | 7% | 7% | 6% |
| G-13; G-15 | 1.5; 1.53 MB | 1.5; 1.52 MB | 1.5; 1.53 MB |
| One-path (40): G-06; G-07 | 2.30×; 100%, 95% | 2.35×; 100%, 93% | – |

On the map alone: march hexes with no deeper neighbor in their own march go from 8 to 10, every road stays unbroken, and 12 of the 22 seams move.

**The bend applied to running 3.2.0 saves** (four campaigns, weeks 8 to 52; the bend every three rings):
- the bend cuts none of the player's land off in 16 of 18 snapshots, and 2 hexes in the other two (a smarter Dwarf-path campaign at weeks 26 and 40);
- the land the player could assault changes by −2 to +2 hexes;
- no standing siege and no courtship loses its target (one courtship would, in two snapshots, with the bend every four rings);
- 5 to 7 pairs of villages within a group come to touch.

**Hex ids in a save** (section 6.2 lists them). They also hide inside other strings:
- the purse's sources (`tithe:<id>`, `assault:<id>`, `defense:<kind>:<id>`, `tribute:<kind>:<id>`, `bribe:`, `hold:`, `courtship:`, `deal:<kind>:<rival>:<id>`, `fortify:<id>:<n>`, `reclaim:`, `royalHunt:`);
- fallback ids (`fb:<day>:<id>`);
- skirmish fight ids;
- the terms gift label (`hex:<id>`).

The hard-coded ids in the tests are 54 in six files; 6 of them lie in rings the bend moves.

### 2.2 What stage 1 adds to the simulator

Before any rule changes, on rules 3.2.0, in `sim/targets.ts` and `sim/measure.ts`:

1. **The targets plan**:
   - the smarter player for Perfect, Steadfast, Committed and Wavering (40 seeds each, 90-week horizon), for G-11 and G-19;
   - the smarter path-mix players for G-07 in full (each one path 10, Orc and Goblin 20, Dwarf and Archmage 20, three a third 20, all four 20; 90 weeks);
   - G-08 on 100 Steadfast greedy seeds (the plan's 40 plus 41 to 100).

   The greedy groups keep the 70-week horizon, so G-01 to G-10 still compare.
2. **New rows**:
   - G-11 on the smarter player; G-07 in full;
   - G-19 (defeat), G-20 (Respect moves), G-21 (income);
   - G-08 on 100 seeds with the 40-seed reading beside it;
   - G-09 with its second half marked "retired, reported".
3. **New tables**:
   - each rival's Respect at weeks 8, 16, 26, 40 and 52, his weeks at each standing, his first Peace and War, and his Respect changes by reason;
   - Grand Battles by month and by trigger;
   - each event's first week;
   - the income split (behavior, tithes, spoils and land, as shares of reputation earned) and behavior income against the benchmark by phase;
   - resolutions by kind and week.
4. **The 3.2.0 fixture**. `scripts/fixture-3.2.0.ts` is written before the bend changes anything. It founds a synthetic Steadfast campaign (seed 7, the simulator's ledger) on 3.2.0 and plays it 30 weeks with the smarter automatic player (every path, deals, offers taken). Then it tops up the state, by documented synthetic edits, so that every field of section 6.2's inventory holds at least one hex the bend moves (an auction lot, a skirmish day, a low-loyalty count, an extra assault, a restless hex), and writes `tests/game/fixtures/campaign-3.2.0.json` with how to rebuild its ledger. The 3.1.0 fixture stays.
5. **Baseline**: `targets-3.2.0.md` regenerated with the new rows (same seeds), so Patch 5 is compared with Patch 4 on the same measures.

---

## 3. Bent marches (Rich, 2026-10-16; P5-06)

### 3.1 The bend

- **The rule.** Each ring of the layout beyond the heartland turns clockwise by `shift(k) = ⌊(k − 2) ÷ 3⌋` positions (`RULES.map.bend: { fromRing: 2, everyRings: 3 }`, TUNE):
  - rings 3 and 4: none;
  - rings 5 to 7: one step;
  - rings 8 to 10: two;
  - rings 11 to 13: three;
  - rings 14 and 15: four.
- **How the layout is computed.** `map.ts` builds every slot as today, on the hex's position on the straight ring. A slot's march, seam, lane, kind, road, Gate, capital, realm, Lair Mouth and lair hexes don't change. Only its coordinates are taken from the ring position `shift(k)` steps further clockwise. So within a ring every hex keeps its neighbors; between two rings whose shift differs, a hex meets the next ring a step further on.
- The four rival marches and the two lair wedges bend together, so the gaps between them stay as they are and the map reads as one continent (mockup C).

### 3.2 What moves and what doesn't

- **Unchanged for every hex:**
  - ring, depth and band;
  - march, seam and lane (its offset from the road);
  - kind, owner and garrison;
  - fortification, wear, village and loyalty;
  - strength and name;
  - whether it is a stronghold (C-57);
  - its path shares and Holdings.
- **Changed:** `q`, `r` and `id`; its ring label (`hexLabel`); which hexes of the next ring and the last it touches, where the shift steps; distances to other hexes; where it is drawn.
- **What reads the new geometry:**
  - borders and `claimableBy`;
  - flanking (D-22);
  - fallback refuges and counterattacks (D-24);
  - threat targets and `nearestTo` (raids, Warhosts, the Orc's last battle, the Coalition Offensive, events);
  - surges beside the player's land;
  - the Goblin's buy-off hexes;
  - courtships (a village must touch the player's land).

  They read it as they read today's map: no rule changes.
- **Strongholds** are chosen by lane on the straight ring (C-57): the same eight hexes, at depths 4 and 8, on the road or the non-village hex nearest it.
- **Seams** keep their two marches; their daily draw keys by the straight-layout id (C-54).
- **Villages**: new campaigns seed them under the bent adjacency, with D-16's counts and spacing (all 100 bent foundings in the probe seeded). A migrated save keeps its own (C-56).

### 3.3 Names, labels and tests

- `data/codex/hexes.json`: each of the 321 entries' `id` moves with its hex and its `label` is recomputed (`map.test.ts` checks `label === hexLabel(id)`). Names don't change (C-58).
- The 54 hard-coded ids in `map.test.ts`, `rivals.test.ts`, `world.test.ts`, `viewRealm.test.ts`, `viewDiplomacy.test.ts` and `battleIds.test.ts` are reviewed. The 6 in rings 5 and 6 move with the bend, and Test 7's geometry checks are rewritten for it.
- `view/realm.ts`: `mapView` and `mapDecor` follow the hexes as they are. `mapLand`'s coastline is refitted (C-59, drawing only). The war-track badges still sit between each pair of Gates.

### 3.4 What the probe says

Section 2.1: every cadence and land target holds on the bend, and G-10 holds with a slightly wider margin. **G-08 falls from 1.985× to 1.90×** on the same 100 seeds; G-08 is section 8.2's first risk.

### 3.5 How it starts in a running 3.1.0 campaign

At the first launch of the 3.3 build, by the one-time migration of section 6.2. The live campaign then plays on the bent map from its open day: every hex where it was in its march, at its depth and lane, held by whoever held it. Days already settled are never settled again (Test 9).

---

## 4. Respect both ways (Rich, 2026-10-16; P5-07 to P5-09)

### 4.1 The track

- Each rival's Respect for the player runs from **−100 to +100** (`RULES.respect.min` −100, N-08). It starts at 20 (A-18, C-61). `adjustRespect` clamps to the new range.
- Shown as a number with its standing ("Respect +32 · Tension") on each court, with the marks above and below (P5-09). It is not a hidden value.

### 4.2 The standing: Peace, Tension and War (P5-08, C-60, N-09)

| Standing | Respect | What he does |
| --- | --- | --- |
| **War** | −25 or below, or in a coalition against the player (Ch 13) | Raids, and conquest attempts from week 6 (A-146) |
| **Tension** | −24 to +49 (the Orc: −24 and up) | Raids |
| **Peace** | +50 or above; **never the Orc** | Neither raids nor conquest attempts |

- Read at each week close in the rival turn's step 7, and at once when he joins a coalition (C-60). The `disposition` event posts on each change.
- What else reads the standing works as today: the threat schedule's raiders (A-26), the Warhost and the Rituals waiting while he is at Peace (A-148, A-151), the Goblin's mercenaries for rivals at War (A-147), conquest planning (A-146).
- **The Orc** is never at Peace. A high Respect gives him his own perks (section 4.4) and, from 50, Ugrak's Challenge instead of the final Warhost (R-11, C-40). That fits R-11: if he doesn't respect you, he comes to you; if he does, he challenges you.
- Retired: War at Threat 60, War for land taken in the last 2 weeks, and Peace's 4 quiet weeks (`RULES.rivals.disposition`). Taking his land now lowers his Respect instead (section 4.3). Threat is still computed for the Last Alliance's order (A-174).

### 4.3 What moves each rival's Respect (P5-07, N-10)

**Bold** marks a change from today; "new" a new driver. Each change posts the `respect` event with its reason.

| What happens | Orc (strength) | Goblin (coin and bargains) | Dwarf (steadfastness and stone) | Archmage (constancy) |
| --- | --- | --- | --- | --- |
| His raid, **conquest attempt or counterattack** beaten (C-62) | +3 | +3 | +3 | +3 |
| Lost to one of them | −2 | −2 | −2 | −2 |
| A hex of his taken by force (assault, Grand Battle) | **−2** | −5 | −5 | −5 |
| A village of his courted away | −3 | −3 | −3 | −3 |
| A Truce | **0** | +2 | +2 | +2 |
| A hex bought from him | +2 | (his hexes are bribed, below) | +2 | +2 |
| A hex sold to him | +5 | +5 | +5 | +5 |
| A Grand Battle against him won | **+5, any** (an Incursion, the Warhost, a stronghold or Gate in his march) | +5 (an Incursion) | +5 (an Incursion) | +5 (an Incursion) |
| A Grand Battle against him lost | **−5** (new) | – | – | – |
| His prized week (A-38) | +4: no lost battle | +4: the budget met | +4: the step pool met | +4: every duty kept |
| What he alone values (new) | – | a bribe paid +2; a buy-off accepted +10; a buy-off refused or lapsed −5; his bid for a village held against him −2 | a pact kept to its end +5; each wall level of his broken −1 | a week closing at Realm Consistency 0.85 or more +1; a surge strike held +2; a Ritual endured +2 |
| An Accord paid (D-01) | – (never) | 50 × f(Q), 60 × f(Q) from 75 | as the Goblin | as the Goblin |

Siege won (+10), Ugrak's Challenge won (+30) and the Envoys event (+10 to the asker, −5 to his foe) are unchanged. Weight never moves Respect (Pillar 5), and a missed habit never lowers it: Respect falls only for what is done to the rival (land taken, battles lost to him, deals refused).

### 4.4 The marks, both sides (P5-07)

Today's positive marks keep their numbers and effects (C-61); each rival adds his own perk at +75 and his own detriment at −75, and every rival shares the War line at −25 and stronger raids at −50.

| Respect | Orc | Goblin | Dwarf | Archmage |
| --- | --- | --- | --- | --- |
| +100 | – | Accord signed: allied (D-01) | Accord signed | Accord signed |
| **+75** | **His envoy fights for you at no fee** | Accord easier; **he bids for none of your villages** | Accord easier; **he raises no walls on the wilds facing you** | Accord easier; **you see tomorrow's surge** (as Mage Tower IV) |
| +60 | Calls to arms | Accord talks, calls to arms | Accord talks, calls to arms | Accord talks, calls to arms |
| +50 | Envoys; you may buy his hexes; **Ugrak's Challenge instead of the final Warhost** (C-40) | **Peace**; envoys | **Peace**; envoys; you may buy his hexes | **Peace**; envoys; you may buy his hexes |
| +40 | Non-aggression pacts | Pacts | Pacts | Pacts |
| +25 | Raids 10% weaker; he buys your hexes | Raids 10% weaker (he buys at any Respect, C-43) | Raids 10% weaker; buys your hexes | Raids 10% weaker; buys your hexes |
| start | 20 | 20 | 20 | 20 |
| **−25** | **War** | **War** | **War** | **War** |
| **−50** | Raids 10% stronger | Raids 10% stronger | Raids 10% stronger | Raids 10% stronger |
| **−75** | **One more conquest attempt a week** (not on top of his war track's at −2) | **Gouging**: his greed counts 2 steps higher, and his bids for your villages offer 1.5 × loyalty (1.3 today) | **His walls on the wilds rise to level 2** (1 today, S-36) | **His swells and surge strikes 10% stronger** |
| The whole track | – | His bribe price × (1 − 0.003 × Respect): up to 30% cheaper at +100 and dearer at −100 (N-11) | – | – |

A Truce is open at any Respect (C-63).

### 4.5 Everything Respect gates today

| Gate | Patch 5 |
| --- | --- |
| Raids 10% weaker at 25 | Unchanged; mirrored by raids 10% stronger at −50 |
| His hexes sold to the player at 50 (not the Goblin), the player's bought by him at 25 (the Goblin at any) | Unchanged |
| Pacts at 40; envoys at 50 | Unchanged; the Orc's envoy free from 75 |
| Accord talks at 60 (50 after the Lost Heir), calls to arms at 60, the easier Accord at 75, signed at 100 (D-01) | Unchanged; never the Orc (C-41) |
| Peace at 50 and 4 quiet weeks; War at Threat 60, land taken or a coalition | Section 4.2 |
| The Goblin's bribe price | Its Respect term runs over the whole track (N-11) |
| The Orc's last battle: Ugrak's Challenge from 50, the final Warhost below | Unchanged (C-66) |
| Terms | Unchanged: the stance doesn't read Respect (C-66) |
| Coalitions: betrayal from 50, the buy-out from 40, refusing the Last Alliance from 60 | Unchanged |
| The Lost Heir at 80 | Unchanged |
| Audience lines by Respect tier | The floors in `rivalLines.json` (Rich's); below 0 the lowest floor's line (C-64) |

### 4.6 What the player sees

No new art (X-21). Interface labels live in components; story text goes through the text catalog as plain-fact placeholders (Ch 17, A-46).

- **The court** (`view/diplomacy.ts`):
  - **Respect** as a signed number with its standing;
  - **the marks** (`respectMarks`) on both sides, each with what it opens or brings, marked reached or not; the rival's own marks included;
  - **a standing note** replacing `dispositionNote` (C-65): "Tension: he raids your border but sends no conquest attempts." The note then gives the nearest marks ("Peace at Respect 50; War at −25") and his drivers in plain words, read from `RULES`. For example: "He respects: his raids beaten (+3), a Grand Battle won against him (+5), a week with no lost battle (+4). He resents: a lost battle (−2), a Grand Battle lost (−5), his land taken (−2)." The Orc's note says he never makes peace.
  - The portrait's mood still reads War as angry.
- **Herald lines** (placeholders, A3):
  - `herald.standing.<peace|tension|war>` when his standing changes;
  - `herald.respect.mark` when a mark is crossed either way, naming the mark;
  - the existing `respect` and `disposition` events feed them.
- **How to play**: the section **Diplomacy and Respect** is rewritten. It covers the track from −100 to +100 and its start; the standing and its thresholds; each rival's drivers and marks as two tables; and the Truce always open. Every number comes from `RULES`.

### 4.7 How it starts in a running 3.1.0 campaign

- **No migration.** Each rival keeps his Respect number: today's 0 to 100 is the new track's upper half, and nothing is rescaled.
- His standing is read from it at the first 3.3 week close (C-60):
  - a rival at 50 or more (not the Orc) comes to Peace;
  - a rival in a coalition stays at War;
  - everyone else is at Tension, since no Respect is below 0 yet.
- A conquest attempt already planned by a rival who leaves War is called off at its dawn (A-132). The new drivers count from the first 3.3 event on, never backwards.
- The live campaign is in its first weeks, so its Respect sits near 20 to 55. The Dwarf, prized on the step pool, may come to Peace at the first close. That is a change in the player's favor.

### 4.8 What it should do, and what to watch

- Peace becomes reachable by Respect alone. On today's numbers:
  - the Dwarf passes 50 by week 8 to 16 for a Steadfast player;
  - the Archmage passes it mid-campaign, sooner with his constancy driver;
  - the Goblin by bargains;
  - the Orc stays at Tension and gives up conquest attempts as he comes to respect the player.
- A greedy conqueror drives the rivals it pushes toward War.
- A raid day with no rival who may raid becomes a beasts day (A-26), so the number of daily threats doesn't change, only who strikes.
- **Watch G-08 and G-10**: fewer rival raids in the Peace marches, beasts instead. G-10's "the Orc's march has the most defenses" should hold, since he never makes peace. The length shouldn't move: the first resolution is gated by Castle III and the Accord's 30 days, not by Respect.

---

## 5. Length, endgame and economy (R-17 to R-19, X-10, X-11, X-15, X-23)

### 5.1 Resolution pacing (R-19, N-06)

- `RULES.world.resolution`: none before week 16, then one per 12 weeks (`notBeforeWeek` 16, `oncePerWeeks` 12).
- A-168's holding is unchanged: a resolution earned too early is held, never refused. The Capital battle and the Orc's last battle are raised only when a win could resolve him. Terms are offered only when the pacing allows (C-39).
- Evidence (section 2.1): Perfect 55, Steadfast 60, Committed 73 (90% by week 76) on the smarter player, inside R-17's 50 to 56 and 58 to 64.
  - Committed's median is a week past 64 to 72 on 10 seeds. The 40-seed run decides; if it still misses, stage 4 proposes a lever.
  - Victory comes about 36 weeks after the first resolution, so the earliest victory is week 52 (16 + 3 × 12).

### 5.2 The terms thresholds (C-67)

- Unchanged.
- With 16/12, the first offer still comes in week 32 (Steadfast smarter) and the first rival is Ready to yield in week 35 to 38. The offers then wait for the pacing's next opening.
- Raising every threshold but army and constancy by a quarter puts Steadfast at week 67; by half, 68.5.

### 5.3 The benchmark, costs, garrisons and depth (X-11, C-68)

- Unchanged. Behavior income against the benchmark is 1.07 for Steadfast over weeks 1 to 48, 1.06 to week 60, and 1.00 in weeks 49 to 64 (the late squeeze the book wants). Committed reads 0.87 and Wavering 0.63.
- Stage 1 adds the income split. Stage 4 proposes a cost change only if behavior income falls under half of all reputation earned (G-21).

### 5.4 Defeat (R-18)

- The floor stays at week 36, with Ascendancy, the Ultimatum and the Siege unchanged.
- No campaign fell to week 90 (G-19 met). Ultimatums are frequent (section 2.1), and the stage 4 report shows them.

### 5.5 Grand Battles (X-10, P5-03)

- Unchanged. G-13 is read as before (Steadfast greedy, mean a month); the smarter player's months are reported beside it.

### 5.6 Coalitions and the week-keyed events (X-15, P5-04, N-07)

- The Dragon wakes from week 40 (`events.json`: `lairUnsealedFromWeek`, week 40). Everything else stays.
- In a running campaign:
  - a Dragon already woken stays done;
  - in weeks 30 to 39, an unsealed Wyrmfells waits until week 40;
  - the Beast Surge keeps its 13-week schedule.

### 5.7 The Reign (P5-10)

Unchanged (A-176).

### 5.8 How it starts in a running 3.1.0 campaign

- The new pacing reads each rival's `resolvedOn`, as today. A rival already resolved stays resolved, and the next resolution waits 12 weeks after the last one (from week 16).
- A resolution held under the old pacing is checked again at each close under the new.
- The terms in force and the events already fired are untouched.

---

## 6. Rules version, saves and records

### 6.1 The version

- **`ruleVersion` 3.3.0** (C-50). `needsRefounding()` compares majors, so 3.0.0 to 3.2.0 saves load at once.
- `campaign.ruleVersion` stays the founding version (3.1.0 for Rich).
- **New state, all optional:**
  - `Campaign.migrations?: string[]` (C-51);
  - no other field (Respect reuses `RivalState.respect` and `disposition`).
- **New events:** none; the existing `respect` and `disposition` events gain reasons.
- **New deed kinds:** none.

### 6.2 The bend migration (C-51 to C-55)

**When.** `migrateCampaign(state)` (new, `migrate.ts`, pure) runs on every load in `state/campaign.ts`, before anything reads the campaign. The steps:
1. It skips a 2.x save (`needsRefounding`, which the re-founding replaces) and a save whose `campaign.migrations` already holds `'bentMarches'`.
2. Otherwise it maps every hex id of the straight layout to its bent id.
3. It applies C-52's pass.
4. It appends `'bentMarches'` to `campaign.migrations`.
5. The store copies the old file to `backups/campaign-<ruleVersion>-before-bend.json` (C-53), then saves.

Running it twice changes nothing. A daily backup taken before the bend and restored by hand is migrated again, correctly, because its marker is absent.

**What it changes** (C-52). The same pass as one rule: any value, key or `:`-part equal to a moved id. The inventory, by where the ids live:

| Where | Fields |
| --- | --- |
| The hexes | `hexes[].id`, `.q`, `.r` (the array keeps its order, C-55; ring, march, seam and every other field unchanged) |
| Orders | `orders[].assaultTarget`, `orders[].extraAssaults[].target` |
| Land | `courtships[].hexId`, `rivals[*].ai.courting[].hexId`, `deals[].hexId`, `standingSiege.hexId` |
| Grand Battles | `grandBattles[].hexId`, `.outcome.hexTaken`, `.outcome.hexLost`, `.outcome.hexScorched` |
| Skirmishes | `skirmishes[].fights[].hexId` and the fight's `id` (it names its hex) |
| Daily combat | `combat.tidings[].hexId`, `combat.conquests[].hexId`, `combat.contested[].hexId`, `combat.counterattacks[].hexId` and `.fallbackId` |
| Fallbacks | `fallbacks[].id` (`fb:<day>:<hex>`), `.from`, `.to` |
| The world | `world.offers[]` (`goblinBuys`, `uprising`, `buyBack`: `.hexId`; `terms`: `.gift.hexId`), `world.auction.lots[].hexId`, `world.lowLoyalty`'s keys, `worldEvents[].data` (its `hexIds` and any other hex id) |
| The marches (Patch 4) | `personalities.surges[].hexId`, `.goblinBids[].hexId`, `.dissolved[].hexId`, `.summoned[].hexId`, `.restless[].hexId` |
| The purse | `purse.events[].source` (section 2.1's prefixes, and a battle fee's `<source>:<company>:<hex>`) |
| The log | `hexId` on `defense`, `assault`, `calledOff`, `trophy`, `hexTransfer`, `deed`, `standingSiege`, `fallback` (and its `to`), `bribe`, `goblinBid`, `surge`, `terms` (and its `gift`), `restless`, `courtship`, `deal`, `rivalNews`, `borderCampaign`, `grandBattle`, `ritual`; `worldEvent.hexIds[]` |

That is 58 fields in 11 places, the hexes' three included. `paths.logRead` still counts the same log, so the chronicle reads nothing twice. Seeded draws that read a past day key by the straight-layout id (C-54); every other draw is made once and stored.

**The proof** (synthetic fixtures only; nothing in `%APPDATA%\Fiefdom` is read or written):
- The 3.1.0 and 3.2.0 fixtures (section 2.2) are migrated. A parallel walk of the old and new save finds every value, key and part that was a moved id holding its bent id, and every other byte unchanged.
- The set of places renamed equals the inventory above.
- No hex keeps its old id: every hex's name read through the new codex equals its name before, and every moved id in the old save appears in the new one only where the bend sent a different hex to it.
- Migrating twice changes nothing; `needsRefounding` is false; `ruleVersion` is kept.
- Each migrated fixture then settles 12 more weeks with the automatic player: no invariant broken, settling twice changes nothing, and each seam's ruling march on every day already played is unchanged.
- The store writes the backup before the migrated file, and writes nothing if the backup fails (C-53).

### 6.3 Respect

No migration (section 4.7).

### 6.4 The live campaign

Rich's campaign (founded 2026-10-15 on rules 3.1.0, running on 3.2.0 since 2026-10-16) takes 3.3.0 when he installs the build. On its first launch:
- the bend migration runs once and keeps the old file beside it;
- the standing is read from Respect at its first week close;
- the new pacing holds from then on.

### 6.5 `decisions.md` when the patch lands

**New entries:**
- D-37: the bent marches (P5-06, C-54 to C-59);
- D-38: the bend migration and the `migrations` marker (C-51 to C-53);
- D-39: Respect both ways, its drivers and marks (P5-07, P5-09, C-61 to C-66);
- D-40: the standing (P5-08, C-60);
- D-41: the length: pacing, the terms kept and the Dragon (P5-02 to P5-04, C-67, C-68);
- D-42: how the targets count Patch 5 (P5-01, P5-05, C-69 to C-73).

**Marked changed:**
- A-18 (the starting disposition is the standing read from 20);
- A-26 and A-132 (the raider is drawn by standing);
- A-109 (labels follow the bend);
- A-146 (conquest attempts at War by standing);
- A-148 and A-151 (Peace by standing; the Orc never at Peace);
- A-149 (hostile acts no longer decide Peace);
- A-168 (16 and 12);
- A-169 (the Dragon from 40);
- D-16 and E-06 (the bend; village spacing at founding);
- D-07 and D-20 (names follow their hexes);
- D-29 (bribes over the whole track);
- D-33's pacing note;
- S-35 (C-69).

`docs/game/README.md`'s module map gains `migrate.ts`; the blueprint's status table is updated.

### 6.6 New and changed numbers in `rules.ts` and the codex (all TUNE)

| Where | Value |
| --- | --- |
| `ruleVersion` | `3.3.0` |
| `map.bend` | `{ fromRing: 2, everyRings: 3 }` |
| `world.resolution` | `{ notBeforeWeek: 16, oncePerWeeks: 12 }` (N-06) |
| `events.json` `dragonWakes` | `week: 40` (N-07) |
| `respect` | `min: −100`; `standing: { war: −25, peace: 50, neverAtPeace: ['orc'] }`; `raidsStrongerAt: −50, raidsStrongerMult: 1.1`; the drivers of section 4.3 (`orc: { hexConquered: −2, truce: 0, grandBattleWon: 5, grandBattleLost: −5 }`, `goblin: { bribePaid: 2, buyOffAccepted: 10, buyOffRefused: −5, bidHeld: −2 }`, `dwarf: { pactKept: 5, wallBroken: −1 }`, `archmage: { constantWeek: 1, constantWeekAt: 0.85, surgeHeld: 2, ritualEndured: 2 }`); each rival's own marks at ±75 (`orc: { freeEnvoyAt: 75, extraConquestAt: −75 }`, `goblin: { noBidsAt: 75, gougingAt: −75, gougingSteps: 2, gougingOfferMult: 1.5 }`, `dwarf: { noWildWallsAt: 75, highWallsAt: −75, highWallMax: 2 }`, `archmage: { foresightAt: 75, strongSurgesAt: −75, strongSurgesMult: 1.1 }`) |
| `rivals.disposition` | retired (N-09) |
| `autoplay.refuseOwnPathUntilRank` | by number of paths: `[5, 3, 2, 2]` (N-13) |

---

## 7. Build stages

Each stage leaves `npm run typecheck`, `npm test` and `npm run check:game` passing. `npm run sim -- --targets` runs at the end of every stage that changes the rules or the automatic player, and G-08 and G-10 are re-measured after each piece (G-08 on 100 seeds).

| Stage | What | Ends with |
| --- | --- | --- |
| 1 | Measures (section 2.2): the new players, rows and tables, G-08 on 100 seeds, the 3.2.0 fixture; the baseline regenerated on 3.2.0 | `targets-3.2.0.md` with the new rows; no rule changed |
| 2 | **Bent marches and the migration** (rules 3.3.0): `map.bend`, the stable seam key, strongholds by lane, `hexes.json` ids and labels, the 54 test ids, Test 7, `migrate.ts`, the marker and backup in the store, `mapLand` refitted | The migration's proof (section 6.2); map and view tests; screenshots of the bent map; a targets run with G-08 and G-10 |
| 3 | **Respect both ways**: the track, the standing, the drivers, the marks both sides, the Goblin's price, the Orc's perks; the court's view, the standing note, the Herald placeholders and How to play | Respect, standing and view tests; screenshots of a court at War, Tension and Peace; a targets run |
| 4 | **Length and economy**: the pacing, the Dragon, the automatic player's terms habit (C-69); the full simulator run; a **tuning report** proposing any number change with evidence (D-02), above all for G-08; `decisions.md` D-37 to D-42 | `targets-3.3.0.md`; the report for Rich's approval |

---

## 8. Targets

### 8.1 Must hit and keep

**Must hit:**

| # | Target | Measure | On 3.2.0 (probe) |
| --- | --- | --- | --- |
| G-07 in full | Every mix can win | Smarter path-mix players (one path, two halfway, three a third, all four): win shares within 5 points, median victory weeks within 3; and its Patch 2 half | 100% each; 64 / 67.5 / 64 / 68.5 (16/12): missed by 1.5 weeks |
| G-11 | Campaign length (P5-01) | Smarter: Perfect 50 to 56, Steadfast 58 to 64, Committed 64 to 72 with 60% or more winning by week 76 | 16/12: 55; 60; 73 (90%) |
| G-12 | Guardrails | No fall before week 36; the heartland never changes owner; no invariant broken; settling twice changes nothing | Holds |
| G-13 | Grand Battles | Steadfast 1 to 3 a month | 1.6 to 1.7 (greedy); 1.2 (smarter) |
| G-15 | Performance | The re-founding's 365 days under 2 s; `campaign.json` after 72 weeks under 2 MB; the migration's time reported | 1.79 s (S-46); 1.59 MB (1.92 MB at 91 weeks) |
| G-18 | Terms do their job | As D-35 | 16/12: 2 (88%); 0; 1 |
| G-19 (new) | Defeat stays rare (R-18, C-71) | Steadfast (greedy and smarter) falls by week 76 under 5%; no fall before week 36; Committed and Wavering falls and Ultimatums reported | 0 of 496 fell |
| G-20 (new) | Respect moves both ways | In the median Steadfast smarter campaign, at least 2 of the Goblin, the Dwarf and the Archmage reach Peace before they are resolved, and the Orc never; in Steadfast greedy, at least 2 rivals reach War; each active rival's standing changes at least once a campaign | Today: 1 of 3 reaches Peace (the Dwarf) |
| G-21 (new) | Behavior leads income (Pillar 1, X-11) | Behavior income over the benchmark's, weeks 1 to 60: Steadfast 1.0 to 1.2, Committed 0.8 to 1.0, Wavering under 0.75; behavior income at least half of all reputation earned (Steadfast) | 1.06; 0.87; 0.63; the share measured in stage 1 |

**Keep as in `targets-3.2.0.md`:** G-01 to G-06, G-08 (judged on 100 seeds, C-72), G-10, G-16 and G-17. G-09's first half is kept; its second half is retired and reported (P5-05). G-14 is checked by Rich in play.

**The new Ch 15 table (X-23, C-70).** The book's targets are replaced as follows:
- victory weeks: G-11;
- loss to Ascendancy: G-19;
- "1 to 3 Grand Battles a month": G-13, kept;
- "a coalition in 80% of Steadfast campaigns": kept, reported (today 100%);
- the income ratio: G-21.

### 8.2 What could move them

- **G-08** (today 1.985× on 100 seeds, under the line before Patch 5).
  - The bend costs about 0.08.
  - Respect's Peace replaces some rival raids with beasts.
  - The levers to report in stage 4, from Patch 4's G-08 work (section 16.2 there): what a routed beast or mythic defense costs (D-15's `wildsReclaim.routedAt`); the Orc's war track's step; the habit's bribe reserve.
  - Every one is proposed to Rich, never changed silently.
- **G-10**. The Orc's churn margin is 0.289 against 0.266 on the bend. Respect's Peace should widen it (he never makes peace); watch "the Orc's march has the most defenses".
- **G-07 in full**: C-69's habit. If it doesn't close, the report says by how much.
- **G-11 (Committed)**: the 40-seed run decides; the levers are the pacing's interval or Castle III's timing for the first Accord.
- **G-04 and G-05**: the bend reads 3.31 and 16%; Respect shouldn't move them.
- **G-15**: a longer campaign grows the log about 22 KB a week. Victory now lands by week 73, and a 72-week save stays under 2 MB.

### 8.3 The probe

Section 2.1.

---

## 9. Tests and verification

New or changed tests, named after the rule they check:

- **The bend (D-37):**
  - `shift(k)` for every ring;
  - every hex keeps its march, seam, depth, lane and kind;
  - Test 7's counts (321 hexes, 298 claimable, 80 rival-held, 76 villages, 22 seams) and spacing for new seeds;
  - every road unbroken, and every march hex reachable from the heartland;
  - strongholds the same eight hexes by lane;
  - a seam's daily ruling march keyed by its straight-layout id;
  - `hexes.json` ids, labels and names;
  - the views: map hexes, decor and the continent.
- **The migration (D-38):** section 6.2's proof on both fixtures, the inventory, idempotence, and the store's backup order.
- **Respect (D-39, D-40):**
  - the range and clamp;
  - each driver per rival, posted once (Test 9);
  - each mark both sides per rival, with its effect, including the Goblin's price over the whole track and the Orc's free envoy and extra conquest attempt;
  - the standing from Respect at the week close; a coalition at War; the Orc never at Peace;
  - a Truce at any Respect;
  - a 3.2.0 rival at War with Respect 60 reads Peace at the first 3.3 close (not the Orc);
  - no hidden number in the court's view.
- **Length (D-41):**
  - Ch 14's pacing test at 16 and 12;
  - a held resolution under the new pacing;
  - the Dragon from week 40 in a running campaign;
  - the terms offered only when the pacing allows.
- **The simulator (D-42):** the new rows and tables, and G-09's second half reported as retired.
- **Carry-forward:**
  - `carryForward.test.ts` extended: the 3.1.0 and 3.2.0 fixtures load under 3.3.0 without a re-founding, migrate once and settle 12 weeks;
  - `refound.test.ts` unchanged, and a re-founding on 3.3.0 is founded on the bent map with the marker set;
  - `ledger.json` untouched.
- **Test 9 and Test 10:** settling twice changes nothing; rings 0 to 2 never change owner; no loss before week 36.
- **Performance (G-15):** `scripts/campaign-perf.ts` within 2 s and 2 MB, plus the migration's time on the larger fixture.

---

## 10. Risks

- **G-08 is already at the line.** On 100 seeds 3.2.0 reads 1.985×; the bend takes about 0.08, and Respect may take more.
  - Stage 4 has to bring it back with a lever Rich approves (section 8.2).
  - If none works without hurting G-01 to G-05, the fallback is the gentler bend (every four rings: 1.97×), which Rich would choose.
- **The live save's migration.** A one-time rename of 58 fields over Rich's real campaign. Mitigations:
  - the backup before writing, and no write without it;
  - the marker;
  - the proof on two synthetic saves that between them fill every field;
  - one structural rule rather than 58 hand-written ones.

  The live file is never read by this work.
- **Bent geometry in a running save**: up to 2 hexes may lose touch with the rest of the player's land, and some villages come to touch. Neither breaks a rule: a cut-off hex is still held, and spacing is a founding rule (C-56).
- **Peace made easy.** If Respect brings Peace too soon, the war goes quiet in three marches. G-20 reads it, and the lever is the Peace line (50).
- **The Orc goes quiet.** As he comes to respect a winning player, he sends no conquest attempts (War needs −25). His raids and march rules stay. D-15 measured most land lost to rival conquest attempts, the Orc's above all, so G-08 is watched.
- **A Ready rival that waits.** With 16/12 a rival can stand at Ready to yield for weeks before the pacing lets him offer (section 5.2). The court says so in a plain line ("terms wait for the season"), as interface text.
- **Respect read as punishment** (Ch 16). Respect never reads weight, and a missed habit never lowers it. Its falls are told as chronicle.
- **The daily loop (G-14)**: no new daily choice; the court shows more lines.
- **Save size (G-15)**: about 2 MB by week 91 in a campaign that never wins (section 8.2).

---

## 11. What the build changed

Built on 2026-10-17 on branch `patch-5`, stages 1 to 4, at Rich's go-ahead ("cut it and start, you can keep working on subsequent stages"). Rules **3.3.0**. Nothing past the spec's own commit is committed.

### 11.1 What the build changed from the spec

| # | Stage | Spec said | Built | Why |
| --- | --- | --- | --- | --- |
| S-48 | 1 | The smarter one-path players at 10 seeds each for G-07 in full | 20 each (the plan's half, as for G-18) | They serve G-18 and G-07 alike; more seeds, the same players |
| S-49 | 1 | `scripts/fixture-3.2.0.ts` tops up the saved state so every field of the inventory holds a moved hex | The fixture is the campaign as played; the top-up is built in `migrate.test.ts` on a copy | Synthetic records in a saved campaign could break the 12 weeks the carry-forward test plays on it |
| S-50 | 2 | C-54: the stable key for a seam's daily draw | Also for a founding's strength jitter, so a campaign founded on the bent map has, hex for hex, the garrisons the straight map gave its seed | The probe's −0.08 on G-08 came largely from new jitters; with them kept the bend costs about 0.01 (1.99× to 1.98×) |
| S-51 | 2 | C-59: the coastline refitted (the spec's figure: 12.5 across) | 12 spacings across | The continent's test holds the drawn board within 15% wider than the map; 12.5 made it 17% wider |
| S-52 | 2 | Screenshots of the bent map | Not taken: the map was rendered as an SVG and opened in the preview pane, which can't be captured | Left for Rich to look at in the app |
| S-53 | 3 | Herald placeholders `herald.standing.<…>` and `herald.respect.mark` | Not built: no Herald line told a disposition or Respect change before either; the court's standing note and marks carry it | A follow-up with the text catalog (A3) |
| S-54 | 3 | — | The Dragon's test reads "the player's hex nearest the Wyrmfells' mouth" rather than "a western hex"; five scenario tests move their weeks to 16 and 12 | The bend turns the mouth toward the north, so the Barracks can be nearest; the rule is unchanged |

### 11.2 Targets by stage

Each stage's `npm run sim -- --targets` (720 campaigns: the greedy profiles at 70 weeks, the smarter players at 90, G-08 on 100 Steadfast seeds). The last column is [targets-3.3.0](../game/sim/targets-3.3.0.md).

| Target | 3.2.0 (stage 1) | The bend (stage 2) | Respect (stage 3) | Length (stage 4) | |
| --- | --- | --- | --- | --- | --- |
| G-01 | 5.9; 84% | 5.8; 83% | 5.9; 84% | 5.9; 85% | kept |
| G-04 | 3.26; 4.1 | 3.37; 4.1 | 3.31; 4.1 | 3.34; 4.2 | kept |
| G-05 | 16% | 19% | 19% | 18% | kept |
| G-06 | 2.26×; 100% | 2.45×; 100% | 2.36×; 100% | 2.36×; 100% | kept |
| G-07 in full (median weeks: one path, two, three, four) | 57 / 65 / 61.5 / 60.5 | 57 / 65.5 / 61 / 71 | 52 / 57.5 / 65 / 66 | **60 / 61 / 61 / 60**, all 100% | **met** |
| G-08 (100 seeds; 40) | 1.99×; 2.10× | 1.98×; 1.95× | **2.05×**; 2.08× | **1.94×; 1.88×** | **missed** (11.3) |
| G-10 | met | met | met (the Goblin 46% by deal) | met (48%) | kept |
| G-11 (Perfect; Steadfast; Committed, by week 76) | 43; 53; 64 (93%) | 43; 52.5; 65 (98%) | 43; 50; 63.5 (95%) | **55; 59.5**; 74.5 (63%) | **missed** on Committed's median (11.3) |
| G-13 | 1.4 | 1.5 | 1.5 | 1.5 | met |
| G-15 | 1.70 MB | 1.75 MB | 1.77 MB | 1.76 MB; the 365-day catch-up 0.93 s and re-founding 1.88 s; the migration 7 ms | met |
| G-16; G-17 | 1.29×; 100% | 1.32×; 100% | 1.28×; 100% | 1.28×; 100% | kept |
| G-18 | 2 (75%); 0; 1 | 2 (83%); 0; 1 | 2 (100%); 0; 1 | 2 (100%); 0; 1 | met |
| G-19 (Steadfast falls by 76; Committed; Wavering) | 0%; 0%; 3% | 0%; 0%; 6% | 0%; 0%; 3% | 0%; 0%; 3% | met |
| G-20 (Peace of 3; the Orc at Peace; War; changes) | 1; 4; 4; 2 | 1; 3; 4; 2 | 2; 0; 2; 2 | 2; 0; 2; 2 | **met** |
| G-21 (Steadfast; Committed; Wavering; behavior share) | 1.05; 0.87; 0.64; 35% | 1.05; 0.87; 0.64; 35% | 1.05; 0.87; 0.64; 36% | 1.05; 0.87; 0.64; 36% | **missed** on the share (11.3) |

G-02, G-03, G-09's first half, G-12 and G-13 held at every stage. With Respect both ways, the Dwarf and the Archmage come to Peace (Steadfast smarter: weeks 8 and 15) and the Goblin rarely; the Orc never, and in 100 greedy campaigns he is never at War either, since beating his raids raises his Respect to 100 by week 40.

### 11.3 Tuning report

Nothing below is changed: each is a proposal for Rich (D-02).

| # | Target | Reading | Options | Recommendation |
| --- | --- | --- | --- | --- |
| T-06 | G-08 | 1.94× on 100 seeds (2.05× before the pacing changed; 1.98× before Respect). The cause of stage 4's drop is not isolated: the 16/12 pacing keeps rivals active longer, and the Orc no longer reaches War, so his conquest attempts (the land a bad week loses most, D-15) are gone | (a) a probe on the 100 seeds of the War line (−25 to −15), of D-15's overrun (`wildsReclaim.routedAt` 1.25 to 1.15) and of the two together; (b) accept 1.94× and report it | (a): measure before changing a number |
| T-07 | G-11, Committed | Median 74.5 against 64 to 72, though 63% win by week 76 (the clause's share is met). Committed's first resolution comes in week 37.5 (Steadfast 23), and victory follows about 36 weeks later | (a) keep it missed and look for the lever that brings Committed's first Accord sooner; (b) an 11-week interval (Steadfast would fall to about 56, under 58); (c) read Committed's clause as its share by week 76 alone | (a) |
| T-08 | G-21, behavior's share | Behavior is 36% of the reputation a Steadfast campaign earns, tithes 42%, spoils 22%, already so on 3.2.0; against the benchmark behavior holds (1.05, 0.87, 0.64) | (a) re-read the target as behavior at least a third of reputation earned, since tithes and spoils come from land held and battles fought, both earned by play; (b) a probe of tithes at 1.5 a band (2.5 today, D-17), which reshapes the economy and every land target | Rich's call: (a) keeps every number; (b) if behavior must lead |

Also measured: Ultimatums come in 75% of Steadfast campaigns (greedy and smarter together) and 99% of Committed ones, and every Siege is won or the knee bent (no fall before week 76). R-18 asks only that the risk stay under 5%, and it does.

**T-06's probe (2026-10-17).** A scratch probe outside the repo played Steadfast greedy seeds 1 to 100 for 70 weeks on the committed 3.3.0 build (fec32b7). Each variant was patched into `rules.ts` in memory, as `sim/overrides.ts` does, and no number was changed. The base reproduces `targets-3.3.0.md`. G-08 is read on the 100 seeds; its change from base is a seed-paired bootstrap's 90% range. G-04 and G-10 are read on the run's own 40 seeds, as the report reads them.

| Variant | G-08: lost a week, bad vs good | Change from base (90%) | G-08 on 40 seeds | Lost ÷ gained | G-04 | G-10, both ways per hex held: Orc; Goblin | The Orc at War: weeks a campaign (campaigns) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base | 1.13 vs 0.58 = **1.94×** | – | 1.88× | 14% | 3.34 | 0.32; 0.28 | 0 (0 of 100) |
| War line −15 (`respect.standing.war`) | 1.14 vs 0.58 = 1.95× | −0.01 to +0.04 | 1.91× | 14% | 3.28 | 0.32; 0.29 | 0.1 (3) |
| Overrun at 1.15 (`combat.wildsReclaim.routedAt`) | 1.39 vs 0.74 = 1.89× | −0.16 to +0.05 | 1.82× | 17% | 3.32 | 0.35; 0.32 | 0 (0) |
| Both | 1.42 vs 0.74 = 1.92× | −0.13 to +0.08 | 1.85× | 17% | 3.34 | 0.36; 0.33 | 0.2 (2) |
| Pacing 12/8 (`world.resolution`) | 1.13 vs 0.58 = 1.95× | 0.00 to +0.01 | 1.89× | 14% | 3.34 | 0.32; 0.28 | 0 (0) |

Every variant keeps G-04 (3 to 4), G-10 (the Orc's march churns most, on 40 seeds and on 100), G-08's mid-game defenses (4.5 to 4.6) and its lost ÷ gained (under 25%). None brings G-08 to 2×.

- **The pacing is not the cause.** At 12/8 G-08 reads 1.95×, because every greedy campaign resolves exactly one rival by week 70 under either pacing. Of stage 4's other changes, the terms habit (C-69) steers only the smarter path players. That leaves the Dragon from week 40 (N-07). It lives in `events.json`, which the `rules.ts` hook can't reach, so it is not measured.
- **The War line doesn't reach the Orc.** His Respect climbs to 100 by week 40 because he loses about 38 raids a campaign, at +3 each. At −15 he is at War in 3 campaigns of 100, for 9 weeks in all (weeks 15 to 30). The line moves the Goblin instead (at War 27 weeks a campaign, 32 at −15), and G-08 doesn't move. Nor did the Orc's missing conquest attempts cause stage 4's drop: stage 3 took them away and G-08 rose to 2.05×.
- **The overrun cuts the wrong way.** At 1.15 the frontier loses more land in good weeks as well as bad (+0.16 against +0.26 a week, about 1.6 to 1), so the ratio falls to 1.89×.
- **G-08 sits inside the 100 seeds' noise.** Resampling the base's seeds puts it at 1.81× to 2.08× (90%), and 23% of resamples read 2× or more.

**Recommendation: change none of the three numbers.** Take T-06's (b): accept 1.94× for Patch 5 and report G-08 as missed. If Rich wants the stage-4 cause named before deciding, one more 100-seed run with the Dragon back at week 30 would name it. That run needs the probe to patch `events.json` as it patches `rules.ts`. Whether the Dragon then moves is a length question (P5-04), not a G-08 one.
