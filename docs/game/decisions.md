# Decisions, assumptions and errata

This file settles what the design book ([design-book-v2.md](design-book-v2.md)) leaves open, contradicts, or gets wrong. **Where the two disagree, this file wins.**

- **D-** entries were decided by the owner. Do not change them.
- **A-** entries are planning assumptions: sensible defaults chosen so work can start. The owner may override any of them. To override one, edit the line, add `(changed YYYY-MM-DD)`, and tell the agents working on affected tasks.
- **E-** entries correct worked examples and tests in the book. Tests use the E- values.
- Numbers marked **TUNE** are first guesses. They live in `rules.ts` like every other number, and the simulator reports on them.

**For agents:** if you hit an ambiguity that is not listed here, do not invent a rule silently. Pick the most conservative reading, add an entry under [Raised by agents](#raised-by-agents) at the bottom, and mention it in your hand-off.

## D — Decided by the owner (2026-10-05)

| ID | Decision |
| --- | --- |
| D-01 | **Accords take the contract slot and pay both.** The 30-day Accord is the one running contract for its 30 days. At the end it pays the normal contract payout (`10 × 30 × 2.0 × f(Q)`, plus pledge rules) **and** raises Respect by `50 × f(Q)` (`60 × f(Q)` if Respect was 75 or more at the start). |
| D-02 | **The simulator reports; it never retunes.** Simulator tasks build the sim, measure every Chapter 15 target, and write a report that proposes lever changes. They must not change `rules.ts`. The owner approves any change. The book's build-order line "tune against Chapter 15 before going further" is replaced by "run and report"; later tasks do not wait on the targets. |
| D-03 | **Charge: the rule wins over the worked example.** The Charge intent means the front company deals ×1.5 **and** takes ×1.25. The Chapter 11 worked exchange is corrected in E-03. |
| D-04 | **No notifications at all.** No OS notifications, no tray icon, no background process, no notification settings. The app settles when it launches and at 04:00 while it is open. Herald tidings appear only inside the app. This removes the "evening reminder" and the notification row of Chapter 16. |
| D-05 | The book's own decision table (Appendix D, "Decisions and remaining questions", settled 2026-10-05) stands as written. |

## A — Planning assumptions (owner may override)

### Time and data

| ID | Assumption |
| --- | --- |
| A-01 | **A campaign day is a ledger calendar date.** Day D uses the ledger's date D (steps, food, duties, weight), because the ledger and Fitbit both bucket by calendar date. Day D *closes* at 04:00 on D+1 in the campaign time zone. The book's "04:00 to 04:00" describes when a day settles, not how data is bucketed. |
| A-02 | **Corrections.** Day D can be corrected until day D+1 closes (04:00 on D+2). Settlement copies the inputs it used into the campaign event log. A correction inside the grace window posts `adjust` events; it can raise a contract payout but never lower one already paid (book Ch 2 rule 5). Ledger edits after the window never change the game. |
| A-03 | **Time zone.** The campaign time zone is the system IANA zone at founding (`Intl.DateTimeFormat().resolvedOptions().timeZone`), stored in `Campaign.timeZone`. Settlement always uses the stored zone. Changing it is a settings action that takes effect at the next week boundary. All clock functions must work for any IANA zone, whatever the machine's zone. |
| A-04 | **Founding and week 1.** The campaign starts at the dawn after founding. Campaign week 1 runs from that dawn to the next week close (04:00 on `settings.weekStartsOn`) and may be partial. Weekly amounts (step pool, weekly reputation, the rivals' income) are prorated by days ÷ 7 in a partial first week. "Campaign week N" = 1 + the number of week closes since the start. Pacing rules ("week 36", "week 12") use this number. |
| A-05 | **Weigh-ins live in the ledger** as `DayLog.weight` (hand-typed, in `settings.unit`). The ledger version goes from 1 to 2, and `normalizeLedger` migrates v1 by copying each legacy contract's `startWeight` and `finalWeight` onto its start and close dates (only where that day has no weight). Weight rules compute in lb; kg values are converted. |
| A-06 | **Total calories burned for the Healer.** The Healer's bootstrap (Ch 4, step 2) needs total daily calories burned, including resting. The current Fitbit code reads only active calories. Add a read-only `burned` metric from Google Health's `total-calories`. It is used only to bootstrap the Healer's range, never for scoring, and is never hand-editable. |
| A-07 | **The legacy ledger system.** A campaign can be founded only when no legacy contract is open, upcoming or awaiting a weigh-in. After founding, the Contract page seals only campaign contracts. Legacy contracts and legacy (computed) reputation stay readable in the Archive as history and never enter the purse. Once a campaign exists, the top bar shows the campaign purse. |
| A-08 | **File locations.** The book's `data/codex/*.json` → `src/renderer/src/data/codex/*.json`. The book's `data/text/*.json` → `src/renderer/src/data/text/*.json`. The book's `assets/` and `assets/manifest.json` → `src/renderer/public/game-assets/` and `src/renderer/public/game-assets/manifest.json` (Vite already writes its own build output to `assets/`). `campaign.json` sits beside `ledger.json` in the data folder, with backups at `backups/campaign-YYYY-MM-DD.json`. |
| A-09 | **Dev-only time travel.** Development builds may override "now" (env `FIEFDOM_DEV_NOW`, plus a dev menu that advances a day or a week) so settlement can be tested. It is guarded by `import.meta.env.DEV`, compiled out of production builds, and never reachable by the player (Pillar 7). |
| A-10 | **"Away"** (for the rule that no siege falls within 7 days of returning) means no app launch for 14 or more days. `campaign.json` records the last launch date. |
| A-11 | **Rounding.** Each purse event is rounded to 0.1 when it is posted. The purse is displayed as a whole number, rounded down. Affordability checks use the exact balance. |

### The map

| ID | Assumption |
| --- | --- |
| A-12 | **Map geometry** follows version 1, Chapter 3. The exact derivation (axial coordinates, which corner ray is which road, between-land membership) is written out in [T03](tasks/T03-map-and-dominion.md). |
| A-13 | **Villages.** The 12 rival-held Frontier hexes (each rival's Gate and the two March hexes beside it) are villages. They touch each other by construction, so they are exempt from the no-adjacency rule. The 18 seeded villages (4 in ring 2, 6 in ring 3, 8 in ring 4) may not touch each other or any rival village. "Each building's direction gets the same count within one" is measured as a per-building credit: 1 for a village on its road, 0.5 for a village in each between-land it shares. The highest and lowest credit differ by at most 1. Test 7 is reworded to match (E-06). |
| A-14 | Ring 4's "rival outposts on the roads" (Ch 3 layout table) is left over from version 1. Ring 4 is fully neutral at founding, which matches the founding table (74 neutral hexes). |
| A-15 | The two Hearth wild hexes are beast dens, not villages. Rivals can never acquire any hex in rings 0 to 2, whether neutral or the player's. |
| A-16 | A Gate is a village, courted at twice the usual resistance. It can never be bought or taken by a daily assault. The player takes it only by the Gate Grand Battle or by courting it. |

### Numbers the book never gives (all TUNE)

| ID | Assumption |
| --- | --- |
| A-17 | **Rival garrison multiplier** (Ch 6): Orc 1.0, Goblin 0.9, Dwarf 1.3, Archmage 1.1. |
| A-18 | **Rival starting state:** treasury 150; an army of about 40 power, bought from its own unit list (Appendix C) strongest-affordable-first; Respect 20 toward the player for all four; disposition Tension toward the player (so raids happen from day 1); every Rim front at Peace with its track at 0; Threat computed at the first week close. |
| A-19 | **Hired companies** (hired blades at Merchant Hall II, the Reserves Order, the Mercenary Contract doctrine) have the power of the Merchant Hall's current pure company (9, 14, 21 or 30), the Coin tag, and melee reach. |
| A-20 | **Rival envoy, vassal and ally companies** have power 24 (Ch 14). Their tag is the matching building's tag: Orc → Steel, Goblin → Coin, Archmage → Arcane, Dwarf → Engine. All are melee except the Archmage's, which is ranged. |
| A-21 | The Sworn (Milestone 7) join for free. Their two tags are chosen once, when they are unlocked. |
| A-22 | **Loyalty of the player's own villages:** after a conquest, 50% of 15 × ring, and the village is Settling for 4 weeks. After defection or purchase, 15 × ring. Loyalty recovers 5% of 15 × ring each week, up to 15 × ring. This feeds the Village Uprising and Hungry Winter events. |
| A-23 | Rivals never court villages the player holds. They take the player's land only by conquest attempts (Ch 10) and events. |
| A-24 | **Army bands** shown to the player compare the rival's AV with the AV of the player's best (banners + 2) companies: Weaker below 0.8×, Matched 0.8× to 1.25×, Stronger 1.25× to 2×, Overwhelming above 2×. |
| A-25 | **Rival expansion target.** Village bids are paid from the expansion budget. A beast-den assault costs no reputation but must pass the AV test. Each week the rival courts the best affordable village by (2 × ring) ÷ bid. If it can afford none, it assaults the most valuable den that `0.5 × AV` beats at an average roll. Unspent expansion budget stays in the treasury. |

### Combat and rivals

| ID | Assumption |
| --- | --- |
| A-26 | **Choosing the raider.** On a raid day the raider is drawn from rivals in Tension or War (not resolved, allied, or under a Truce or pact that blocks raids). Each rival's weight is its raid-frequency multiplier × (1 + number of player border hexes it touches) × 0.5 if it is at war with another rival that week × 1.25 if it is in a coalition. If no rival is eligible, the day's threat becomes beasts. The 40/20/40 mix is the share of days; personality multipliers decide *who* raids, not how often raids happen. |
| A-27 | **Targets without a shared border.** A raid from a rival that shares no border with the player hits the player border hex nearest (by hex distance) to that rival's land; ties are broken by a seeded draw. Mythics prefer border hexes in the West and East between-lands (weighted ring^1.5) and fall back to any border hex. |
| A-28 | **Threat schedule timing.** Each threat's *type* and raider are drawn at week close for the coming week. Its *target* and its ±15% roll are drawn at that day's dawn, on the border as it stands then. |
| A-29 | **Enemies in Grand Battles** deal `p × intent multiplier` with no tag matching and an implied Readiness of 1.0. Only the player's companies get the ×1.5 / ×0.6 match. |
| A-30 | "Wonder bonuses" (Ch 10 and Ch 11) are left over from version 1. Read them as Milestone bonuses: the Proving Grounds, the Crownguard Ascendant, and Legendary and trophy items. |
| A-31 | **Stacking.** Each building-tier effect in the Ch 7 table is that tier's total, not cumulative (Foundry III = walls +6 and all companies +10%). Percentage *reductions* from different sources multiply. Percentage *reputation bonuses* add (Merchant Hall +15% + Statue +10% + Gilded Ledger +5% = +30%). Guild Charters' 20% replaces Trade Roads' 10%; they do not stack. |
| A-32 | **Courtship slots.** Base 2; +1 at Merchant Hall III (Ch 6); +1 more at Merchant Hall V (Ch 7); +1 for the Golden Road Wing. Chapters 6 and 7 disagree, so both are applied. |
| A-33 | **Incursion frequency.** An Incursion triggers when the player takes a hex next to that rival's Gate, or takes one of its hexes while already holding 4 or more hexes that rival once held. At most one Incursion per rival every 14 days (TUNE). The 5-day Grand Battle spacing still applies. |
| A-34 | **"The player's strongest direction"** (Rising Crown coalition) is the between-land (North, South, West or East) where the player holds the most Dominion. Its two rivals are the two whose roads bound it: North = Orc and Goblin, South = Archmage and Dwarf, West = Orc and Archmage, East = Goblin and Dwarf. |
| A-35 | **Host filling.** The commander joins first if the power budget covers it. Then the builder makes repeated passes over the rival's unit list, strongest to weakest, adding one company of each type that still fits. It stops when nothing fits or the host has 6 companies. |
| A-36 | **Orders don't carry over.** With no orders, every company defends (Ch 2 rule 2). The UI may offer a one-click "repeat yesterday's orders". |
| A-37 | **Rim fronts at peace.** Each week a front spends at Peace moves its war track one step back toward 0 (version 1 rule). |
| A-38 | **Prized habits** (+4 Respect a week): Orc — a week with no lost battle of any kind; Goblin — the week's budget score is 100% with food logged on at least 5 days (TUNE); Archmage — every sworn duty kept every day; Dwarf — the step pool met (S_w = 1). |
| A-47 | **"Health ×N" on a mythic** (Basilisk ×6, Dragon ×8, Manticore ×5) means health = N × p, replacing the usual 4 × p, not 4 × p × N. |

### Scores and weight

| ID | Assumption |
| --- | --- |
| A-39 | **Which consistency score.** The plateau floor uses that calendar week's three-pillar score `q_w`. Realm Consistency (RC) is the contract score Q computed over the last 28 settled days, with weeks weighted by their days inside the window. |
| A-40 | **Valor's steps term** `s` = steps since the week began ÷ (pool × days elapsed in the week ÷ 7), capped at 1, evaluated when the day closes. |
| A-41 | **Under-eating days** (logged below 90% of the floor) enter the Table score's logged average as 1.15 × the limit, so the day scores as fully over budget. |
| A-42 | **"Milestone tier III"**, the Tier V requirement, means Milestone 6 is broken. This matches the Ch 9 table, where Milestone 6 says "Tier V becomes possible". |
| A-43 | A too-fast trend (28-day trend above 1% of body weight a week) also pauses Milestone breaks until it slows (Ch 16). |
| A-44 | **Healer smoothing.** The first computation sets the floor directly. After that it moves at most 100 kcal a week. |

### Screens and text

| ID | Assumption |
| --- | --- |
| A-45 | **Homecoming** shows at launch when 3 or more days were settled in catch-up, or after an absence of 14 or more days. |
| A-46 | **Narrative text versus interface labels.** The text catalog (`data/text`) holds narrative and flavor slots: Herald, rivals, events, Healer, Milestones, battle reports, and unit and item descriptions. Buttons, headings and form labels stay in components. Catalog placeholders state plain facts only ("Orc raid on hex 3-4: held. Lost 6 power.") and never flavor, because story text is written by people (book Ch 17). |

## E — Errata: corrected worked examples and tests

| ID | Book says | Correct value and why |
| --- | --- | --- |
| E-01 | Ch 4 worked example and Test 1: payout 80.5, pledge return 115.0 | Exact math: S = 0.92, T = 6/7, D = 19/21 → Q = 0.893968, f(Q) = 0.823280, payout **80.68** (posted 80.7), pledge return 70 × 2 × f = **115.26** (posted 115.3). The book rounded each pillar first. Tests assert the exact values to ±0.01. |
| E-02 | Ch 10 worked battle and Test 3: 116.1 on a full day, 81.4 on a poor day | Army = 89 × 1.10 + 20 = 117.9. Full day: 117.9 × (0.55 + 0.45 × 0.97) = **116.31**. Poor day: 117.9 × (0.55 + 0.45 × 0.31) = **81.29**. Still a narrow win against 115 and a loss. Tests assert to ±0.01. |
| E-03 | Ch 11 worked exchange and Test 4: Brute ends at 48.2 | Per D-03, the charging Brute takes ×1.25: 80 − (21 + 10.8) × 1.25 = **40.25**. The Knights still end at 84 − 30 × 0.5 = **69**. |
| E-04 | Ch 9 rule 5: `earliestWeek = ceil(lostAtMark / (0.0075 × startWeight))` | `lostAtMark` must be k × the *unrounded* step (k × (start − goal) ÷ 10), not start − the rounded mark. Only this reproduces 4, 7, 10, 13, 16, 19, 22, 25, 28, 31 for 217 → 168. (With the rounded mark 193, Milestone 5 would give week 15, not 16.) |
| E-05 | Ch 4 contract length table: 3-day full payout "35" | 10 × 3 × 1.15 = **34.5**; the table rounds it. |
| E-06 | Test 7: "30 villages, with no two villages adjacent" | Per A-13: 30 villages; no seeded village touches any other village; the 12 rival village hexes are exempt from adjacency with each other. |

## Raised by agents

Add new entries here as `A-1xx` (one line each: the ambiguity, the reading you chose, the task, the date). The owner will confirm or change them.

- **A-101** — The Engine Works Wing says "ranged +10%" without saying power or damage. Read as +10% *power* for ranged companies, in daily battles and Grand Battles alike (Stormglass Bolts, which says "ranged damage", stays Grand-Battle damage). T01, 2026-10-06.
- **A-102** — Appendix C gives no reach for the four rival commanders or for the mythic units. All are melee; the Wyverns still Volley through their fixed intent. T01, 2026-10-06.
- **A-103** — Ch 7 lists a mythic reduction at Mage Tower II (−10%), IV (−20%) and V (−30%) but none at III. Read as Tier III keeps Tier II's −10%: a tier never takes an effect away. The same holds for every unlisted effect (Barracks I and II keep the 50% rally floor; features such as hired blades or foresight stay from their tier up). T01, 2026-10-06.
- **A-104** — The Royal Hunt (Legend perk) pays 60 reputation "and a trophy item", but every Appendix C trophy comes from a mythic. Reading until the owner names one: the hunt pays the 60 reputation; the codex marks `trophy: true` and grants no particular item. T01, 2026-10-06.
- **A-105** — The book's Spymaster Wing shows neighbors' *treasuries* as numbers; T10's task text says treasury and AV. The codex follows the book (treasury only). T01, 2026-10-06.
- **A-106** — A-05's v1 migration doesn't say which legacy contracts count or what to do when a contract's unit differs from `settings.unit`. Every legacy contract still in the ledger counts, burned wagers included (their start weight was a real weigh-in). A weight in the other unit is converted to `settings.unit` and rounded to 0.1. T02, 2026-10-06.
- **A-107** — Burning a legacy contract erases the steps and calories on its days. It now keeps that day's weigh-in and Fitbit's total calories burned, because they are health records rather than the contract's progress. T02, 2026-10-06.
- **A-108** — A-13's village rules can't all hold. Fully apart, 18 seeded villages split 4/6/8 don't fit on this map even ignoring the rival villages (an exhaustive search finds none). With the rival villages untouched, ring 4 has room for exactly 8 villages, and those leave ring 3 room for only 4. Reading kept until the owner decides: the counts stay (30 villages, 4/6/8), no seeded village touches a rival village or a village in its own ring, and at most **2** pairs of seeded villages touch across neighboring rings (the fewest that fits). That leaves 41 possible layouts, all within the credit spread of 1. `RULES.map.villageSeeding.maxTouchingPairs` holds the 2. The alternative is fewer villages: fully apart, 4/4/8 (28 villages) fits. T03, 2026-10-06.
- **A-109** — `hexLabel` numbers each ring from **1** at its NW corner, clockwise (the castle is "0-1"), since the labels are for players to read ("hex 3-4"). T03, 2026-10-06.
- **A-110** — How `claimableBy` reads the land rules. `buy` is the player buying an adjacent rival hex (never neutral land, never a Gate). `rivalExpand` (A-25) targets adjacent neutral hexes only. A rival may `assault` (a conquest attempt) but never `court` a player's village (A-23). A Lair Mouth or capital is false for every method because Grand Battles don't go through `claimableBy`. A Gate can be courted. Contested and scorched status, costs, slots and Respect are left to the systems that use it. T03, 2026-10-06.
- **A-111** — Ch 4 scores "each calendar week the contract touches", but a contract can end mid-week, before its week does. Each week's three pillars use only the contract's own days in that week: steps against the pool's share for those days, the Table over those days, duties over those days. T04, 2026-10-06.
- **A-112** — The book's "Merchant Hall bonus on every gain above" includes the contract payout and pledge return. The reputation bonus applies to the payout (and a withdrawal's payout) but not to the pledge's return, which carries the player's own stake; otherwise a pledge would break even below 70%. T04, 2026-10-06.
- **A-113** — Respite (Ch 4 rule 4) is a contract rule. It needs a running contract that covers the day, and it removes the day only from that contract's score. Weekly reputation, Valor and Realm Consistency still count the day. T04, 2026-10-06.
- **A-114** — Withdrawal's `daysElapsed` counts the contract's days from its start through the withdrawal day, inclusive, less Respite days (the T04 test pays 4 days on day 4). A queued contract then starts at the next dawn. Sealing re-checks the Charter against the current Healer floor, so a floor that has risen above the limit blocks the next seal until the limit is revised (Ch 4 Healer rule 5), unless medical supervision is confirmed. T04, 2026-10-06.
