# Patch 2 spec: the map, depth, Dominion and the re-founding

Written 2026-10-14. **Status: built 2026-10-14 at Rich's word ("proceed with building patch 2"), with Claude making the build-time calls on his behalf that day. Section 13 lists where the build departs from this text. Rich's live campaign is not yet re-founded (C-19).**

This spec carries out [blueprint](blueprint.md) section 8.2 (decisions R-01 to R-31). Rich answered the four Patch 2 questions of blueprint section 9 on 2026-10-14 (recorded in [section 1](#1-decisions-for-this-patch)). He then asked Claude to settle the remaining rules for that day only. Every rule Claude settled is marked **[C]** and listed in [section 1.2](#12-claudes-calls-delegated-2026-10-14) so Rich can confirm or overturn it before approving. Every number is a first guess marked TUNE: it lives in `rules.ts` or the codex, and the simulator reports on it (D-02: the simulator never retunes; Rich approves each change).

Paths: game modules are in `src/renderer/src/lib/game/`, the simulator in `sim/`, tests in `tests/game/`.

---

## 0. The patch in short

- **A new map.** The heartland (rings 0 to 2, unchanged) plus four rival marches, each 5 hexes wide and 12 deep, ending at the rival's Gate. Two lair wedges fill the gaps on the West and East out to depth 5. That makes **298 claimable hexes** (today 86). Each rival holds the outer third of his march at founding. Villages are 1 hex in 4.
- **Seams.** 22 hexes lie between two marches. Each counts half for both sides, and a seeded draw at each dawn decides whose rules apply that day.
- **Strength by depth.** A smooth garrison curve per march replaces the ring staircase. Everything the economy multiplies by ring is multiplied by a depth band (1 to 5) instead.
- **Dominion is the chronicle.** There are four paths, one per rival. Each is Renown (permanent deeds) plus Holdings (land held, by depth), split about 60/40. Path ranks I to V never fall. Building tiers are gated on total Dominion.
- **Neglected marches harden.** Each rival march has a preparation level: +5% to its garrisons for each quiet week, capped at +40%.
- **The re-founding.** The campaign is re-founded as of 2026-09-30 and backdated by a deterministic catch-up player that follows four founding questions. Rich's real contracts are carried over, and each day is judged by the terms in force at the time.
- **Measures first.** The simulator learns the blueprint's day labels and targets G-01 to G-18, plus the path-mix players, before any rule changes, and records today's baseline.

---

## 1. Decisions for this patch

### 1.1 Rich's answers (2026-10-14)

| # | Question (blueprint section 9) | Rich's answer |
| --- | --- | --- |
| P2-01 | How much of each march the rival holds at founding | **The outer third:** depths 9 to 12 (20 hexes a march, 80 in all). Depths 1 to 4 are easy wilds, 5 to 8 harder wilds |
| P2-02 | Villages per march | **1 hex in 4** |
| P2-03 | How strongly the rival holds his land | **The depth curve only:** his hexes take the march's curve × his garrison multiplier (A-17), unfortified; his weekly turn fortifies as today |
| P2-04 | Seam hexes | **Half Dominion to each side, and a seeded draw decides whose march rules apply** (Rich's own proposal: "a mage/orc hex may be either a surge or an orc raid depending on the day") |
| P2-05 | Which hexes are seams | **The rival-to-rival overlaps and the lair flanks:** the 6 overlap hexes and the 16 lair hexes along each wedge's flank with a rival march |
| P2-06 | How often a seam's ruling march changes | **Daily, drawn at dawn and shown on the map and in the tidings** |
| P2-07 | How the lair marches meet the rival marches | **The lairs fill the gaps:** each lair march is a wedge between its two rival marches, sharing a long flank with both |
| P2-08 | What the founding questions offer | **R-05's mixes, with three-way picks:** paths (pick 1, 2, 3 or all 4 rivals; the days are shared evenly), spending (build first, arm first, or balanced), taking land (by force, by deals, or both), offers (accept if affordable, or decline) |
| P2-09 | How the catch-up player makes orders | **Port the simulator's player into `lib/game`,** steered by the answers; the simulator then uses the same player |
| P2-10 | Which contracts cover the backdated days | **Rich's real contracts:** the ledger's legacy contract re-scored without its wager (R-20), and the current campaign's own contracts re-sealed as they were, pledges and Respite included. The catch-up player seals none |
| P2-11 | Which Charter judges the backdated days | **The terms of the time:** the legacy contract's days by its own terms, with no duty pillar on a day with no sworn duty; from 2026-10-09, the current campaign's Charter |
| P2-12 | Renown and Holdings split | **60 / 40** for a fully walked path |
| P2-13 | How the shared deeds are weighted | **A balanced mix:** of a full path's Renown, hexes taken about 50%, battles about 30%, resolving the rival 15 to 20% |
| P2-14 | Rank thresholds | **10 / 25 / 45 / 70 / 100%** of a fully walked path |
| P2-15 | Can a rank fall | **Never:** a rank, once reached, is kept |

### 1.2 Claude's calls (delegated 2026-10-14)

Rich delegated these for 2026-10-14 only. Each is the most conservative reading Claude could find, or the one that keeps an earlier decision working. **Rich may overturn any of them when he reviews this spec.**

| # | Call | Why |
| --- | --- | --- |
| C-01 | Lair wedges run to **depth 5** (25 hexes each, 298 claimable in all), with depth 6 (36 each, 320 in all) as the simulator's alternative | Closest to R-02's "about 284" while keeping the wedge Rich chose |
| C-02 | **Depth is ring − 2** for every march hex; a march's "row" is its arc of one ring | Keeps `ringOf`, `hexLabel` (A-109) and every ring-3+ check exact; 125 of today's 127 hex ids stay on the map (section 3.1) |
| C-03 | The **neck hex** of each wedge (depth 1, touching both rival marches) is plain lair land, not a seam | It touches two rivals; the lair already splits its Dominion between them |
| C-04 | **Heartland hexes give Holdings** of 1 to the path they face (split when they face two) | Without it the first Tier II can't come on day 2 or 3 (D-14) |
| C-05 | **Battlefields are drawn only on screen** (a one-hex fringe around the marches, using the battlefield tiles); they are no longer map hexes | Border Campaigns were their only rule (R-26 dropped them) |
| C-06 | **Names:** every hex keeps its D-07 name; names of Gates, capitals, realm hexes, Lair Mouths and lairs move with their kind; an agent writes the rest (R-23) | Rich's written names are kept wherever their land still exists |
| C-07 | A **seam's ruling march** in Patch 2 decides which preparation level applies to it, and is shown; Patch 4 hangs each march's rules on it | Patch 2 has no per-march rules yet |
| C-08 | **Preparation** applies to every hex in a rival march the player doesn't hold, at read time; lair wedges never harden; it doesn't rise while the player is away (14+ days) | "Beyond your front"; beasts have no rival to prepare; X-17 forbids punishing absence |
| C-09 | **A march is pushed** in a week if the player took a hex there, assaulted one there (repulsed counts) or placed a courtship there | Deals push a march too (the Goblin's path) |
| C-10 | Hexes passed by **abdication, defection or surrender** add Holdings but no hex deed; the resolution deed covers them | Avoids a windfall of dozens of hex deeds in one day |
| C-11 | A **day with no sworn duty** pays no duty or perfect-day income; its scores (Q, q_w, Valor, Realm Consistency) leave the duty pillar out instead of counting it 0 | Nothing was sworn, so nothing is paid, and nothing is marked as failed |
| C-12 | Days between the legacy contract and the current campaign (2026-10-07 and 10-08) use the **legacy contract's terms** | They were the last terms Rich set |
| C-13 | The catch-up player fights Grand Battles with the **Marshal's play but without his −0.1** | R-21: the player chose how those weeks were played, so they count as present |
| C-14 | **Re-sealed real contracts skip the unlock and slot checks** (they happened); a pledge the backdated purse can't cover is cut to the balance | R-20 re-scores them at their own length |
| C-15 | The re-founding shows **a summary before it commits,** with Back to change the answers; the old `campaign.json` is archived, never deleted | It is a one-time, irreversible change to Rich's live campaign |
| C-16 | The re-founding uses the **current campaign's week start (Monday)** and **Charter** as defaults, and the ledger's weigh-in for the week of 2026-09-30 as the start weight; all can be edited | Rich already set them; R-22 dates the journey from 09-30 |
| C-17 | First guesses for **Power's land term** (3 × Σ band) and **tithes** (2.5 × band) | Keep land Power and land income near today's share at about 3.5× the land |
| C-18 | **Stand-in rank perks** (section 5.4) are small, additive and replaced in Patch 4 | The blueprint asks for a stand-in only |
| C-19 | The patch is built and simulated first, and **Rich's live campaign is re-founded only after he approves the tuned numbers** | The re-founding is one-time; it should run on approved rules |

---

## 2. Measures first

Before any rule changes, on rules 2.2.0:

1. **Day labels in `sim/report.ts`**, as in blueprint section 3.2: Land, Grand, Build, Choice, In doubt, *player-view meaningful* (Land, Grand, Build or Choice), and *meaningful including auto battles*. "Choice" becomes "two or more hexes within reach at dawn" (Patch 3 adds "or a siege to press").
2. **The targets** G-01 to G-09 and G-11 to G-17, each measured as blueprint section 7 says. G-10 and G-18 need Patch 4 and are reported as "not yet built".
3. **The path-mix players** (section 7.4): one path, two halfway, three a third each, and all four evenly, each for every profile the report runs. The *focused player* of G-06 and G-16 is the one-path player.
4. **Baseline.** Run the full report on rules 2.2.0 and keep it in `docs/game/sim/report.md` as "Baseline before Patch 2", so every later number is compared with today.

The path-mix players are steered settings of the catch-up player (section 7.4), so they can only be added once it is ported. Step 3 therefore lands in stage 1 as a thin steering layer over `sim/policy.ts`, and moves onto the ported player in stage 5 (section 9).

---

## 3. The new map

### 3.1 Geometry

The castle is at (0, 0). Ring k is the hex distance from it, and position p counts clockwise along the ring from its NW corner, as today. The six corner rays are, clockwise: NW the Orc, NE the Goblin, E the Thornwild, SE the Dwarf, SW the Archmage, W the Wyrmfells. Each hex's **depth** is ring − 2 (C-02).

| Part | Which hexes | Count |
| --- | --- | --- |
| **Heartland** | Rings 0 to 2, exactly as today: the castle, the four buildings in ring 1, the two Hearth wilds, ring 2 with its 4 seeded villages | 19 (14 claimable) |
| **Rival march** | Rings 3 to 14: on each ring, the hexes within 2 positions of that rival's corner. Each row (one ring's arc) is 5 hexes; depth 1 to 12 | 60 each (57 its own + 3 overlap seams) |
| **Gate** | The rival's corner hex on ring 14 (depth 12) | 1 each |
| **Capital and realm** | Ring 15: the rival's corner (capital) and the hexes on each side (realm). Unclaimable, like today's Rim | 3 each |
| **Lair wedge** | Rings 3 to 7 on the W and E sides: the hexes between the two rival marches, i.e. within k − 3 positions of the lair's corner. Rows of 1, 3, 5, 7, 9; depth 1 to 5 | 25 each |
| **Lair Mouth** | The lair's corner hex on ring 7 (depth 5). Mythic; taken only by the Mythic Hunt Grand Battle | 1 each |
| **Lair (rim)** | Ring 8: the lair's corner and the hexes on each side. Unclaimable | 3 each |
| **The gaps** | North (between the Orc and the Goblin), south (between the Dwarf and the Archmage), and beyond each wedge: empty board, unclaimable, drawn on screen only (section 3.5) | — |

Totals: **298 claimable** (14 + 4 × 57 + 6 overlap seams + 2 × 25), **321 hexes in the campaign state** (adding the castle, the buildings, 4 capitals, 8 realm hexes and 6 lair hexes).

125 of today's 127 hex ids are still on the map (a Rim hex becomes a depth-4 march hex). The two that aren't are today's middle battlefields of the north and south fronts (3,−6 and −3,6), which fall in the gaps. Nearly every surviving hex keeps its region, or becomes a seam that includes it. The exceptions are four ring-3 hexes beside the lair corners (3,−1; 2,1; −3,1; −2,−1), which move from the lair's region to the rival's, because a wedge is one hex wide at depth 1.

Neighbors: the Orc and the Goblin share 3 overlap hexes (depths 1 and 2), as do the Dwarf and the Archmage. Each wedge runs along both its rival neighbors from depth 2 to depth 5. Rival marches are apart beyond depth 3 except through a wedge.

`RULES.map` gains the march shape (TUNE): `marchWidth: 5` (2 each side of the corner), `marchDepth: 12`, `lairDepth: 5` (C-01), and `heartlandRings: 2`.

### 3.2 Who holds what at founding (P2-01, P2-03)

| Depth (rival march) | Owner | Garrison |
| --- | --- | --- |
| 1 to 4 | Neutral: beasts and villages ("easy wilds") | The curve (section 4.1) × beasts 0.9 or militia 0.6 |
| 5 to 8 | Neutral: beasts and villages ("harder wilds") | Same |
| 9 to 12 | **The rival**, Gate at 12 | The curve × his multiplier (A-17: Orc 1.0, Goblin 0.9, Dwarf 1.3, Archmage 1.1); fortification 0 |

- Lair wedges are neutral beasts and villages; the Lair Mouth holds a mythic at 1.15 × the curve.
- The heartland is as today: castle and buildings the player's, the rest neutral (A-15: the Hearth wilds are dens).
- Rival starting state otherwise stays A-18 (treasury 150, army about 40, Respect 20, Tension). Rivals expand weekly as today (A-25): one target a week (the Goblin two), into neutral land touching theirs, now including lair wedges and seams; never a Lair Mouth, never rings 0 to 2.

### 3.3 Villages (P2-02)

- The heartland keeps its 4 ring-2 villages and today's rules for them.
- Each **rival march** gets 15: 5 in each third (depths 1–4, 5–8 and 9–12). The Gate is one of the 5 in the rival's third.
- Each **lair wedge** gets 6: 2 per band.
- In all: **76 villages** (today 30). Seams may hold villages, drawn with the border-blend village tiles.
- Seeding, as A-108 but per march: no two seeded villages touch. The per-path village credit (section 5.1's shares) differs by at most 1 between paths. If a seed finds no layout, at most `maxTouchingPairs` pairs may touch across neighboring rows. The 12 old rival Frontier villages (A-13) are gone. The seeding is drawn from the map seed only, as today.

### 3.4 Seams (P2-04 to P2-06)

- **Which hexes:** the 6 overlap hexes, plus each wedge hex at depths 2 to 5 that touches a rival march (8 per wedge, 16 in all). That makes **22 seams.** The neck hex is plain lair land (C-03).
- **Dominion:** half to each side (section 5.1).
- **Ruling march:** at each dawn, `rulingMarch(state, hexId, day)` draws one of the seam's two marches with `draw(seed, day, 'seam:<id>')`, 50/50 (TUNE). It is fixed for the day, shown on the map (a tint or badge from the bundled icon set, no new art) and named in the hex's tooltip and the day's tidings. In Patch 2 it decides which march's preparation level applies (section 6) and which march a push there counts for (C-07, C-09). Patch 4's per-march rules read it, which delivers Rich's example: a raid from one side one day, a surge from the other the next.

### 3.5 Regions and art (no new art)

- Each hex's region is its march; a seam's is both, drawn with the border-blend tile (D-09's `regionTerrainSlot`, now from the march, not the nearest corner).
- **Near and far** wilds become shallow and deep by band: bands 3 and 4 are near, band 5 is far (rival depths 9–12, lair depth 5).
- Gates, capitals, realm hexes, Lair Mouths and lair rims use their region's tiles, as today.
- **The gaps** (C-05) are drawn in the view model only: every board position within one hex of a march, a Gate row, a capital or a lair rim that is not itself a map hex is drawn with `hex.battlefield.<region>`, or the two-region blend (`hex.battlefield.orc-goblin` and so on) where it borders two. These hexes are not in the campaign state, have no rules and no names, and don't take clicks.

### 3.6 What can be taken (the keep-list, X-04)

`claimableBy` keeps its rules, with these readings:

- Rings 0 to 2 are never taken by a rival (rule 2, A-15). Ring ≥ 3 is now exactly "a march hex".
- Capitals, realm and lair rim hexes are never claimable. A Lair Mouth goes only by Grand Battle; a Gate only by Grand Battle or courtship (A-16).
- **Seams and wedges** are claimable by anyone they touch, like any march hex.
- The **North and South between-lands** no longer exist. `Land` keeps `west` and `east` as the two lair wedges for the codex's lairs; `north` and `south` are retired from the map, and the fronts keep their codex ids (section 3.7).

### 3.7 Rim fronts; Border Campaigns removed (R-26)

- The four rival-against-rival fronts stay as abstract weekly rolls (A-144, A-153: skirmishes, the track, Emboldened and Humbled), keyed by the codex's front ids.
- Border Campaigns go: the `borderCampaigns` week phase becomes a no-op kept in its slot (Conventions: never reorder the phase list), and `Campaign.settlement.borderCampaignWeeks` stops being written. `FrontInfo.battlefields` is removed (its only users were Border Campaigns and the map screen, which now draws the gaps itself).
- Test 10's Border Campaign clause is removed; its other clauses stand.

### 3.8 Names for the new hexes (R-23, C-06)

- Every hex id keeps its D-07 name, except that the names of **Gates, capitals, realm hexes, Lair Mouths and lair hexes move** to the new hex of that kind and region. (Today's ring-5 Gates and ring-6 Rim hexes become ordinary march hexes, and the hexes left without a name get new ones.)
- The two battlefields that fall in the gaps give their names to the nearest unnamed hex of either march they bordered. The four ring-3 hexes that change region (section 3.1) keep their lair-themed names; they are listed for Rich to rename if he likes.
- An agent writes names for the roughly 200 unnamed hexes in `data/codex/hexes.json`, from each region's existing theme (the Ashen Steppe, the Gilded Warren, the Thornwild, Dun Kaldor, Emrys' Reach in Welsh, the Wyrmfells). Seams blend their two regions, as D-07 did. This is the one-time exception R-23; Rich edits the JSON as he likes.
- Names only. Herald and Chronicle lines stay plain-fact placeholders (Ch 17).

### 3.9 The map screen

- `HexMap.tsx` draws the star-shaped board from the view model (`view/realm.ts`), using its existing zoom and pan. The first view frames the player's land plus 2 hexes; zooming out shows the whole board. Performance is checked with 321 hexes plus the fringe (G-15).
- New on the map: each rival march's preparation state (section 6), each seam's ruling march for the day, and march names along each march's edge (interface labels).
- `dev/mapAscii.ts` draws the new board for tests and debugging.

---

## 4. Strength by depth (X-06, X-11)

### 4.1 The curve

Each march hex has a **strength** `s(hex)`, which replaces both `base(ring)` and D-15's `wildBase`:

- **Rival march:** `s = 28 × 1.24^(depth − 1) × jitter` (depth 1 ≈ 28, depth 8 ≈ 126, depth 12 ≈ 300). TUNE.
- **Lair wedge:** `s = 28 × 1.41^(depth − 1) × jitter` (depth 5 ≈ 111, about a rival march's depth 7 or 8). TUNE.
- **Heartland:** `base(ring)` as today (ring 1: 15, ring 2: 18), with no jitter.
- **Jitter:** a seeded factor in [0.85, 1.15], drawn once per hex from the map seed (`MAP_DRAW_DAY`, as D-15's ramp is). Within any row there is a cheapest hex to choose, and each step deeper is about one jitter's width harder: the D-15 "always a next hex just past reach" property, now along depth instead of around a ring.
- A neutral hex's garrison is `s × kind share` (beasts 0.9, militia 0.6). A rival's hex is `s × his multiplier`. Fortification adds `level × 0.25 × s`. A Lair Mouth is `1.15 × s`.
- Land that turns neutral (a fallen rival's, the wilds retaking a hex under D-15) takes `s × kind share`.

The blueprint's "+7% a step" was a placeholder. Over 12 steps it gives only 2.1×, while today's rings 3 to 5 span 28 to 280 (10×) and the army grows by far more over a 60-week campaign. The simulator sets the growth rate so a Steadfast player reaches each depth about when his Assault can beat it (G-03, G-04).

### 4.2 Depth bands, and every ring in the economy

Each hex has a **band**, 1 to 5: heartland ring 1 → 1 and ring 2 → 2; rival march depths 1–4 → 3, 5–8 → 4, 9–12 → 5; lair wedge depths 1–2 → 3, 3–4 → 4, 5 → 5. The band is stored on `HexState` with `march`, `depth` and (for seams) `seam`. Everything that multiplies by ring now multiplies by band:

| Today | Patch 2 |
| --- | --- |
| `base(ring)` in garrisons, fortification F, raid and conquest strength, a hex passing to a rival (`state.ts`), the Summoning's mythic (`rivals.ts`), the Village Uprising's militia (`world/events.ts`), the Pretender's hexes | `s(hex)` |
| D-15 `wildBase`, `wildGarrison` | `s(hex)` × kind share |
| Spoils 4 / 6 × ring; tribute 3 × ring; Incursion spoils 30 × ring; Gate and Mythic Hunt losses 5 × ring; Coalition win 40 × ring | × band |
| Tithes 4 × ring | `tithePerBand` × band, first guess **2.5** (C-17), so that 76 villages at greater depth keep land income near today's share of the purse (Pillar 1) |
| Trade price 50 × ring × greed; Truce 30 × the highest ring bordered; sales only from ring 3 | × band; the highest band; march hexes only |
| Fortification cost 15 / 35 / 70 × ring; the Dwarf's level 4 at 120 × ring | × band |
| Village loyalty 15 / 30 × ring (A-22, A-136) | × band |
| Power 10 × Σ ring held | `perBand` × Σ band held, first guess **3** (C-17) |
| Threat target weight ring^1.5 | band^1.5 |
| Rival expansion: village worth 2 × ring per bid, den "highest ring"; the Goblin's Market "best Dominion per price" (`rivals.ts` `dominionValue`) | band; the hex's depth |
| Shieldwall's walls ×2 in rings 4 and 5 (`crossings.json`) | bands 4 and 5 |
| A Coalition Offensive lost: the player's outermost hex | the deepest |
| `conquestMinRing` 3, `wildsReclaim.minRing` 3, `protectedThroughRing` 2 | Unchanged: ring ≥ 3 is exactly the marches |

### 4.3 Threats

- Beasts and mythics strike a hex at its own `s` (as D-15). Raids are `max(0.8 × s, 0.25 × AV × temper)`; conquest attempts `max(1.0 × s, 0.5 × AV)`. Early grace, Saturday's +40% and the ±15% roll are unchanged.
- **Mythic targets** (A-27): mythics prefer the player's border hexes in a lair wedge or on a flank seam, weighted band^1.5, and fall back to any border hex.
- **Rare-creature reveals** (Ch 11, 8%): assaults on beast hexes in a lair wedge or on a flank seam at band 4 or more, replacing "ring 4 to 5 dens in the West or East".
- Event targets that say "westernmost" or "easternmost" (A-169: the Dragon, the Wild Hunt) read as the border hex nearest that lair's Mouth.

### 4.4 Power

`power = 0.5 × treasury + 3 × AV + perBand × Σ band held`. At founding each rival holds 20 band-5 hexes. With `perBand` 3 his land term is 300 (today 3 × ring 5 × 10 = 150), and a player holding 200 hexes at an average band of 3.5 has 2,100 (today about 3,000 at the full map). The simulator reports the Ascendancy warnings, the Rising Crown's frequency and the Power ratios against the 2.2.0 baseline, and Rich approves `perBand` (Patch 5 retunes Ascendancy for the longer campaign, R-18).

---

## 5. Dominion as the chronicle (R-05)

### 5.1 Paths and shares

There are four **paths**, one per rival, each feeding the building on its road (the Orc → Barracks, the Goblin → Merchant Hall, the Dwarf → Foundry, the Archmage → Mage Tower). Every hex has a **share** of each path:

| Hex | Share |
| --- | --- |
| Rival march hex | 1 to that rival's path |
| Overlap seam | ½ to each of its two rivals |
| Lair wedge hex (neck included) | ½ to each of the lair's two neighbors (the Wyrmfells: the Orc and the Archmage; the Thornwild: the Goblin and the Dwarf) |
| Flank seam | ½ to the flanking rival, ½ to the lair (so ¾ to the flanking rival and ¼ to the other) |
| Heartland hex (C-04) | Holdings only: ring-2 corner hexes facing a rival 1 to that path; facing a lair, ½ to each of its two; ring-2 side hexes ½ to each of the two paths they lie between; the Hearth wilds ½ to each of the lair's two |

The shares are the same for every deed and for Holdings, so "the path with the most deeds is the highest path" (G-17) holds by construction for the shared deeds.

### 5.2 Holdings

**Holdings(path) = Σ over hexes the player holds of `depth × share`** (heartland hexes count 1 × share). It rises and falls as land changes hands. A full rival march is about 388 (its overlap seams count half), its wedge and flank seams add about 47, and its heartland share about 3: **about 440 for a fully held path.** The first Hearth hex gives ½ to each of two paths, 1 in total, which meets Tier II's 1 (D-14) as today.

### 5.3 Renown: the shared deeds (P2-13)

Renown is permanent. Each deed is posted once as a `deed` event (path, kind, value, hex) and adds to `CampaignState.paths[rival].renown`. Values are first guesses (TUNE). Rich chose the shares (hexes about 50%, battles about 30%, resolution 15 to 20% of a full path's Renown), and the simulator adjusts the values until they hold.

| Deed | Value (× the hex's share where it has one) |
| --- | --- |
| Taking a march hex, by any method (assault, courtship, trade, reclaim, Grand Battle, event) | its depth, + 2 per fortification level it had |
| Retaking a hex you lost | counts again |
| Hexes passed by abdication, defection or surrender (C-10) | no deed (Holdings only) |
| Winning a daily battle against a rival (defending against its raid or conquest attempt, anywhere, home included) | 5 to that rival's path |
| Holding a march hex against beasts / a mythic | 2 / 4, by the hex's shares |
| Winning a Grand Battle against a rival (Incursion, Gate, Capital, Warhost, Siege, Ugrak's duel) | 25 to that rival; a Coalition Offensive 25 split between its members |
| Winning a Mythic Hunt, the Dragon or the Wild Hunt | 25, split between the lair's two paths |
| Resolving a rival (conquest, abdication, defection, Accord) | 100 to that rival |
| Battles in the heartland against beasts | nothing |

A loss is no deed in Patch 2. The Orc's "a loss counts less" is a Patch 4 signature deed, as are every rival's.

**One place posts deeds.** A new day phase, `chronicle`, is appended to the end of `DAY_PHASE_NAMES`, and a week phase of the same name to the end of `WEEK_PHASE_NAMES`. Each reads the log events posted since the previous `chronicle` phase (`hexTransfer` to the player, `defense` won, `grandBattle` fought and won, `rivalResolved`) and posts the deeds. Deals struck on the open day (A-140) are picked up when that day settles. `hexTransfer` gains the hex's fortification at the moment it changed hands. Settling twice posts nothing new (Test 9).

A rough size check: at these values the battle deeds may run above 30% (about one defense a day over 60 weeks). The first simulator run will show this, and halving the battle values is the likely fix.

### 5.4 Dominion, ranks and stand-in perks

- **Dominion(path) = Renown + Holdings.** A fully walked path (its march held, the rival resolved, its battles fought) comes to about **1,200** (TUNE, `RULES.dominion.fullPath`), about 60% Renown (P2-12).
- **Ranks** I to V at 10 / 25 / 45 / 70 / 100% of `fullPath`, i.e. **120 / 300 / 540 / 840 / 1,200** (P2-14). A path's rank is the highest it has reached and **never falls** (P2-15). It is stored in `paths[rival].rank` and posted as a `pathRank` event.
- **Stand-in perks (C-18),** replaced by Patch 4's real perks. Each rank adds a small amount to its building's existing role effect, on top of the tier's effect:

  | Path | Building | Per rank (TUNE) |
  | --- | --- | --- |
  | Orc | Barracks | rally floor +0.01 |
  | Goblin | Merchant Hall | reputation bonus +0.005 |
  | Archmage | Mage Tower | mythic reduction +0.02 |
  | Dwarf | Foundry | arms bonus +0.01 and walls +1 |

  They enter `realmEffects` as a new source kind (`pathRank`), so the existing stacking rules (A-31, A-126) apply.
- **Total Dominion** is the sum of the four paths.

### 5.5 Building tiers

- Each building's Tier II to V needs **total Dominion** (R-05): first guesses **1 / 150 / 450 / 450** (TUNE), so that one path alone brings all four buildings to Tier III by week 26 (G-07's Patch 2 half). The tier costs (D-15) are unchanged, so the purse still paces the build.
- The castle still needs the sum of the tiers (`RULES.castle.tierSum`).
- **Tier V** needs Milestone 6 and the Dominion gate only; the matching rival resolved is dropped (R-27; A-129 is retired).
- Crossings gate on building tiers alone, so they are unchanged.

### 5.6 Other readers of Dominion

- **The Rising Crown's "strongest direction"** (A-34) becomes the pair of neighboring paths (the Orc and the Goblin; the Goblin and the Dwarf; the Dwarf and the Archmage; the Archmage and the Orc) with the highest summed Dominion. Its two rivals are that pair.
- **The simulator's assault choice** and the catch-up player value a hex by the Dominion it would add (its depth × share) per garrison point.
- `map.ts` `dominionOf`, `dominion` and `dominionSources` are replaced by a new `dominion.ts` (shares, Holdings, Renown, ranks, totals). `map.ts` keeps the geometry.

### 5.7 What the player sees

- **The Realm page:** today's Dominion panel shows the four paths: each one's Dominion, its rank, how much is Renown and how much Holdings, the next rank's threshold, and the total against the next tier's gate. None of these are hidden values.
- **The Diplomacy page:** each rival's card shows its path and rank and its march's preparation state.
- **The Chronicle:** each deed is a plain-fact placeholder line through the text catalog (for example `chronicle.deed.hexTaken`: "{hex} taken: {value} to the {rival}'s path."), and each new rank gets one (`chronicle.pathRank`). People write the final text (A3).

---

## 6. Neglected marches harden (R-03, R-06)

- Each **rival march** has a preparation level from 0 to 8 (TUNE: `RULES.marches.preparation.max`), starting at 0.
- At each week close, a march the player **didn't push** that week rises one level, and a march the player **pushed** falls one level. A march is pushed if, in that week, the player took a hex in it, assaulted a hex in it (a repulse counts), or placed a courtship on a village in it (C-09). On a seam, the push counts for the march ruling that day.
- **Effect (C-08):** every hex in that march the player doesn't hold (neutral or the rival's) has its garrison × (1 + 0.05 × level), applied when the garrison is read (`effectiveGarrison`), so lowering the level relaxes it and nothing is rewritten. That is +5% a level, +40% at most (TUNE). On a seam, the ruling march's level applies that day (a lair's is 0). Threats are unchanged in Patch 2; how each rival prepares in its own way comes in Patch 4.
- **Lair wedges never harden** (no rival is preparing there).
- **Absence (C-08):** a week close that falls while the player has been away 14 or more days (A-10) doesn't raise any level. The backdated weeks of the re-founding are not an absence (R-21).
- **Shown** on the map (a march badge) and the Diplomacy page as the number of quiet weeks and a state band (interface labels for the A3 pass). It is not a hidden value.
- **Tuned** against G-16 (the focused player's least-pushed march at least 20% stronger than the even player's at week 26) while G-07 still holds.

---

## 7. The re-founding (R-20, R-21, R-22, X-22)

Built last, because it runs on everything above. Rich's live campaign is re-founded only after he approves the tuned numbers (C-19).

### 7.1 How it starts

- A campaign whose `ruleVersion` is below 3.0.0 can't be settled on the new map. At launch, its campaign pages close (the ledger keeps working). The Realm page then offers **Re-found the campaign on the new map**, which opens the re-founding wizard.
- The old `campaign.json` is copied to `backups/campaign-2.x-final.json` before anything is written, and is never deleted (C-15). `ledger.json` is only read, never written (Ch 16, R-20).

### 7.2 The founding date and inputs

- The campaign is founded **as of the first legacy contract's start date** in the ledger: **2026-09-30** for Rich (R-21, R-22). `startDate` is that day, `settledThrough` the day before, and campaign weeks count from it. Week 1 runs from Wednesday 09-30 to the Monday 10-05 week close and is prorated (A-04).
- The wizard's usual inputs, with defaults from the current campaign (C-16): Monday weeks, its Charter, its time zone, its pace cap and its goal; the start weight defaults to the ledger's weekly reading for the week of 2026-09-30 (D-13). All can be edited.
- The Healer's prelude is the 28 days before 2026-09-30 (A-125).
- A new seed, fixed when the wizard opens, so changing the answers changes only what the answers change.
- The founding grant (250) is paid as usual.

### 7.3 The four questions (P2-08)

| Question | Choices |
| --- | --- |
| **Which rivals' paths?** | Pick 1, 2, 3 or all 4 rivals; the days are shared evenly between them |
| **What do you spend on first?** | Build first (tiers, castle, Crossings) · Arm first (the Armory's items, Wings and Elites once they open, then build) · Balanced (the cheaper of the two first, each week) |
| **How do you take land?** | By force (assault; court nothing) · By deals (court every village in reach, buy rival hexes when trade allows, assault the rest) · Both (court what the purse allows, assault the rest: the simulator's greedy player) |
| **Offers?** | Accept those you can afford · Decline |

The questions and choices are interface text, not story (Ch 17).

### 7.4 The catch-up player (P2-09)

- **The port:** `sim/policy.ts`'s greedy player moves into a new pure module, `lib/game/autoplay.ts`. It acts only through the game's player actions (`buyTier`, `placeBid`, `setOrders`, `makeDeal`, the Armory and Grand Battle actions), with every number from `RULES`. Its input is an `AutoplayPlan`: the four answers.
- **Daily target:** among hexes the assault can beat at yesterday's Valor, prefer the chosen paths' marches (a hex's shares count toward its paths). Of the chosen paths, push the one with the fewest assault days so far, so the days are shared evenly, and within it take the best Dominion per garrison point. With nothing in reach there, it takes the best hex in reach anywhere; with nothing in reach at all, it pushes a hex the week's repulses can wear down (the simulator's push rule). It challenges Gates, capitals and Lair Mouths only in the chosen paths' marches, at the army bands the simulator uses.
- **Weekly:** spending as the second answer says; courtship as the third; contracts never (section 7.5); the Armory as the simulator does; offers as the fourth (A-171's offers, the Caravan, Envoys).
- **Grand Battles:** fought on their day with the Marshal's play, without his −0.1 (C-13). No led skirmishes (D-12) and no Respite beyond the real contracts' own.
- **The simulator uses the same module.** `sim/policy.ts` becomes a thin wrapper: greedy is all four paths, build first, both, accept. The smarter and push policies add their extras on top. The path-mix players of section 2 are plans. One player, not two copies (Conventions 12).

### 7.5 Contracts and the terms of the time (P2-10, P2-11)

- **The legacy contract** (the ledger's, 2026-09-30 to 10-06, 7 days) is re-sealed as a campaign contract on its own terms: step pool = its daily step goal × 7, calorie limit = its limit, no duties. It is paid on the new curve, `10 × 7 × 1.4 × f(Q)`, with no wager or stake (R-20). Its unlock and slot checks are skipped (C-14).
- **The current campaign's contracts** (from 2026-10-09) are re-sealed as they were: length, Charter, pledge and Respite dates. A pledge the backdated purse can't cover on its seal day is cut to the balance (C-14). The one running at the re-founding keeps running and is paid at its end as usual.
- **The catch-up player seals none.** Days under no contract pay daily and weekly income only.
- **Which terms judge each day** (a new `charterHistory` on the campaign: dated Charters, read by `charterOn`): the legacy contract's terms for 2026-09-30 to 10-08 (the gap days 10-07 and 10-08 included, C-12); the current campaign's Charter from 10-09 (its contracts carry their own); the re-founding Charter from the re-founding day.
- **A day with no sworn duty (C-11)** pays no duty or perfect-day income and keeps no streak. Its scores leave the duty pillar out. D_w is taken over the week's days that swore a duty, and a week with none scores `(S_w + T_w) ÷ 2`, which carries into Q and Realm Consistency. A no-duty day's Valor is `(f + s) ÷ 2`. This rule can only apply before the first Charter, since every Charter swears at least one duty.
- **Behavior income** (duties, perfect days, streaks, the step pool, the calorie average, flawless weeks, Momentum, contract payouts) comes out of the ordinary settlement of each day from the ledger, each posted under its behavior source (invariant 4). Nothing carries over from the old campaign's purse, land, battles, Armory or Respect.

### 7.6 The backdated settlement

`refound(input, plan, ledger, oldCampaign, now)` in a new `lib/game/refound.ts` is pure:

1. It builds the founded state as of 2026-09-30 (section 7.2) and re-seals the real contracts (section 7.5).
2. For each day from 2026-09-30 to the last closed day: the catch-up player acts with that day as the open day, then `settle` settles that day, exactly as the simulator's loop does. Rivals, threats, Grand Battles, events and the whole war are included.
3. The absence rule (R-24) and the no-Siege-after-return rule don't apply to these days. `lastLaunch` is the re-founding day.
4. It returns the state, the events and a summary.

The same inputs always give the same state. A 365-day backdate must run within G-15's 2 s.

### 7.7 Confirming

- The wizard shows the summary before anything is written (C-15): hexes held by march, path scores and ranks, the purse and what paid it (behavior, battles, land), tiers and castle, battles won and lost, and Grand Battles. **Back** changes the answers; **Re-found** writes the new `campaign.json`.
- After that, the next launch settles normally from the open day. The Homecoming (A-45) shows the backdate as a catch-up.

---

## 8. Rules version and records

- `ruleVersion` **3.0.0**. A 2.x campaign is not migrated; it is re-founded (section 7).
- **New `decisions.md` entries** when the patch lands: D-16 the four-march map (sections 3.1 to 3.9), D-17 strength by depth and bands (section 4), D-18 Dominion as the chronicle (section 5), D-19 neglected marches (section 6), D-20 names for the new hexes (section 3.8), D-21 the re-founding (section 7). Each carries the final numbers and the simulator's findings, as D-14 and D-15 do.
- **Assumptions changed** (marked `(changed 2026-xx-xx)` with a pointer to the new D- entry): A-12 (geometry), A-13 and A-108 (villages), A-14 (ring 4 outposts), A-27 (mythic targets), A-34 (strongest direction), A-129 (Tier V's matching rival, retired), A-144 (its Border Campaign clause), A-155 (Border Campaign targets, retired), and A-07 (legacy reputation; R-20 overrides it for the re-founding). E-06 and Test 7 are rewritten.
- `docs/game/README.md`: the module map gains `dominion.ts`, `autoplay.ts` and `refound.ts`; Spec tests 7 and 10 are reworded.
- The blueprint's status table (section 8.3) is updated when the spec is approved, when the patch is built and when its targets are met.

---

## 9. Build stages

Each stage leaves `npm run typecheck`, `npm test` and `npm run check:game` passing, and is reviewed before the next.

| Stage | What | Ends with |
| --- | --- | --- |
| 1 | Measures (section 2): day labels, targets, a steering layer on `sim/policy.ts` for the path-mix players, the baseline on 2.2.0 | The baseline report section |
| 2 | The map (section 3), strength by depth and bands (section 4), the names (section 3.8), Border Campaigns removed, the map screen | Test 7 rewritten; a seeded map drawn by `mapAscii`; screenshots of the new board |
| 3 | Dominion (section 5): shares, Holdings, deeds and the `chronicle` phases, ranks and stand-in perks, tier gates, the Realm and Diplomacy panels, the Chronicle lines | Dominion tests; screenshots |
| 4 | Neglected marches (section 6) | Preparation tests |
| 5 | `autoplay.ts` (the port), `sim/policy.ts` as its wrapper, `refound.ts`, the wizard and its summary, `charterHistory` and the no-duty rule | Re-founding tests, run on a copy of Rich's real ledger and campaign in a scratch data folder (`FIEFDOM_DATA_DIR`) |
| 6 | The full simulator run against the targets; a tuning report proposing number changes | Rich approves the numbers (D-02); `decisions.md` D-16 to D-21; then Rich re-founds his campaign |

---

## 10. Tests and verification

New or changed tests, named after the rule they check:

- **Test 7, rewritten (D-16):** 321 hexes; 298 claimable; 80 rival-held, 20 in each rival march at depths 9 to 12; 76 villages (4 / 15 each / 6 each), no two seeded villages touching beyond the allowed pairs, and path credit within 1; 22 seams (6 overlaps, 16 flanks); every claimable hex has one march, or two for a seam; each Gate at depth 12, each Lair Mouth at depth 5; the heartland identical to 2.2.0's; 125 of today's 127 ids present (the two gap battlefields excepted).
- **Strength:** `s(hex)` is monotone in depth before jitter; jitter stays within ±15%; the band table; every re-keyed formula (spoils, tribute, tithes, prices, fortification, loyalty, Power) matches its table row; a hex turned neutral takes `s × share`.
- **Seams:** the ruling march is deterministic per seed and day, and its draw leaves every other draw unchanged.
- **Dominion:** shares sum to 1 for every claimable non-heartland hex; Holdings rises and falls with land; each deed posts once and is idempotent under resettling; abdication posts no hex deeds; a rank never falls after land is lost; the first Hearth hex opens Tier II (D-14 kept); Tier V doesn't need the matching rival.
- **Neglect:** quiet weeks raise a level, a push lowers it, the cap holds, lairs stay at 0, no rise while away, a seam reads the ruling march's level.
- **Re-founding:** the same inputs give a byte-identical state; `ledger.json` is unchanged afterwards; every purse gain has a behavior, battle or land source; the legacy contract pays `98 × f(Q)` with Q on its own terms; a day with no sworn duty pays no duty income and scores on two pillars; the old campaign's contracts and pledges carry over; the absence rule doesn't fire in the backdate; a 365-day backdate runs in under 2 s.
- **Test 9 and Test 10 still hold:** settling twice changes nothing; rings 0 to 2 never change owner; no loss before week 36.

---

## 11. Targets

**Must hit** (blueprint 8.2): G-04 (Steadfast nets 3 to 4 hexes a week from week 5 to week 52, with land changing hands on 3+ days a week); G-05 (10%+ of each march unheld at Steadfast's victory; Perfect never holds everything before week 52); G-06 (the focused path at 2× the next highest at week 26, and rank V before the end); G-07, its Patch 2 half (a one-path player gets all four buildings to Tier III by week 26, and its hexes held rise every month to week 40); G-12; G-15 (2 s and 2 MB, R-28); G-16.

**Expected to improve but not yet hit:** G-01 and G-03 (they need Patch 3's sieges). **Expected to hold for the shared deeds:** G-17.

**Watched and reported against the 2.2.0 baseline:** land income's share of the purse (Pillar 1), the Power ratios and Ascendancy warnings (section 4.4), Grand Battles a month (G-13), and how fast victory comes (Patch 5 tunes the length).

---

## 12. Risks

- **Power and Ascendancy.** Eighty rival hexes at band 5 change every Power ratio. `perBand` is the lever, and Patch 5 owns the endgame, but Patch 2 must not raise the risk of defeat after week 36 for Steadfast (R-18).
- **Income.** 76 villages at greater depth can swamp behavior income (Pillar 1). `tithePerBand` is the lever.
- **Performance.** Some land queries rebuild a hex index on every call (X-25). With 2.5× the hexes the cost grows faster than that, so stage 2 caches the index per state where the profile shows it matters.
- **The curve.** If its growth is wrong, the stall comes back at a new depth. The simulator's "no hex in reach" days (G-03) and land each week (G-04) show it first.
- **The re-founding is one-time.** That is why it comes with a summary before committing, an archived old campaign, and its own tests on a copy of the real files before Rich runs it (C-15, C-19).

---

## 13. What the build changed (2026-10-14)

Rich asked Claude to build the patch and make the calls on his behalf that day. These are the places where the build departs from the sections above, each found by the simulator or by a test. `rules.ts` holds every number; Rich may overturn any of them.

| # | Section | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| B-01 | 4 | Growth per step: `28 × 1.24^(depth − 1)` (rival), `28 × 1.41^(depth − 1)` (lair) | A power curve: `33 × depth^1.17` (rival; depth 1 ≈ 33, 8 ≈ 375, 12 ≈ 600 before preparation) and `33 × depth^1.52` (lair), ±15% jitter | The army grows about linearly over the campaign. Any growth per step that keeps the opening honest left the deep marches out of reach for good |
| B-02 | 5.3 | Battle 5, held against beasts / a mythic 2 / 4, Grand Battle 25 | Battle 1.5, held 0.5 / 1, Grand Battle 15; hexes taken: depth + 2 per fortification level; resolution 100 | At the spec's values battles were about 70% of Renown and the Orc's raids decided the leading path. These keep P2-13's balanced mix |
| B-03 | 5.2 | A full path about 1,200 | `fullPath` 1,100 (Holdings about 440, Renown about 660), so ranks at 110 / 275 / 495 / 770 / 1,100 | What a fully walked path came to in the simulator |
| B-04 | 5.5 | Tier gates 1 / 150 / 450 / 450 total Dominion | 1 / 90 / 270 / 270: the book's per-building 24 and 68 summed over four buildings | At 150 the purse piled up while Tier III waited; G-07's one-path players stalled |
| B-05 | 3.4 | No two seeded villages touch; if none fits, some pairs may | Greedy two passes: no two villages of one group (a march third, a lair band, the heartland) touch, at most 6 pairs touch across groups, path credit within 1 | A full search for a layout with no touching pairs was too slow to run at every founding |
| B-06 | 6 | A quiet march rises a level at each week close | It rises only in a week when the player pushed some march; a week with no push anywhere raises none | A stalled player otherwise met a spiral: every march hardened, so nothing came into reach, so nothing was pushed |
| B-07 | 7.4 | The steered player shares assault days between its paths | It also pushes only its own paths' marches when it has nothing else in reach | Focused players weren't focusing; G-06 and G-16 measured nothing |
| B-08 | 4 | Heartland threats at base(ring) | Unchanged in intent, but the heartland's rings 1 and 2 now always read base(ring) as their strength, so a threat on a Hearth hex beside a building has a strength | It read 0 there after the rewrite |
| B-09 | 3.8 | Names move with their kind | Four ring-3 hexes changed region but keep their lair names: Briarholt (now the Goblin's), Hagthorn (Dwarf), Drakesfell (Archmage), Coldfell (Orc). Rename them in `hexes.json` if they read wrong | C-06 keeps written names where their land exists |
| B-10 | — | — | The player portrait tiers (`playerPortraits.json`) rescaled to total Dominion: 0 / 300 / 1,100 / 2,350 / 3,850 | The old thresholds were per-building Dominion |
| B-11 | 7.1 | The Realm page offers the re-founding | The Realm tab stays open for an outdated campaign and shows the offer; Settings has the same link | As written; Settings is where a new campaign is founded |
| B-12 | 7.5 | The legacy contract has no duties | It carries whatever duties it swore (Rich's swore none, so his days are as the spec says); a burned legacy contract is not carried | Its own terms, whatever they were |
| B-13 | 7.5 | The current campaign's contracts re-sealed | Also a contract still queued at the re-founding: it waits in the slot, its pledge posted on the re-founding day | The live campaign has one queued (found by a dry run on a copy of the real files) |
| B-14 | 10 | The 365-day catch-up timed by `refound.test.ts` | Timed by `scripts/campaign-perf.ts` (best of three: 1.1 s); the test checks every day settles | Under the parallel test runner the timing failed at 6 s on a busy machine |
| B-15 | — | — | The simulator launches the app every day | Otherwise every week counted as an absence and preparation never rose |
