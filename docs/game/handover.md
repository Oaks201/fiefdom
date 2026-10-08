# Handover (T17)

Everything the owner still has to decide or do before Fiefdom is played for real: the open readings agents raised, the decisions still owed, the simulator's proposals, the steps only the owner can take, and what the asset tasks A1 to A4 need. Written 2026-10-08, when T01 to T17 were done.

## 1. Steps only the owner can take

| Step | Why it is the owner's | How |
| --- | --- | --- |
| **Install the release on the development PC** | The installer is built for Windows; it was built in a Linux container, where it can't be run | `npm run dist` (or the `dist/Fiefdom-Setup-0.2.0.exe` it makes), then run it. The installer isn't code-signed (README) |
| **Check the real ledger migrates** | The real `ledger.json` stays on the owner's PC and is never committed (T17 scope 4) | Copy `%APPDATA%\Fiefdom\ledger.json` to a scratch folder, then `npm run build` and `node scripts/migration-check.cjs <copy> --goal <your goal> --app`. It checks the migration to version 2, that the Archive evaluates every legacy contract as before, that founding works, and that a launch that settles leaves `ledger.json` byte-identical. A stand-in version 1 ledger passed all of it (T17 hand-off) |
| **Time the performance targets on the development PC** | They were measured in a 4-core container (a 365-day catch-up in under 1 s, `campaign.json` under 1 MB after 70 weeks, hover commits under 16 ms) | `npx tsx scripts/campaign-perf.ts` (365-day catch-up, `campaign.json` size) and `node scripts/campaign-e2e.cjs` (the hover line in its summary) |
| **Time the full simulator run** | T13's target is "under 60 minutes on the development PC"; it took 48 min in a 4-core container | `npm run sim`; the report records the time and the machine |

## 2. Decisions still owed

### 2a. From the simulator (T13, D-02)

The full report is [`docs/game/sim/report.md`](sim/report.md); its last section is the decision list. In short:

1. **The targets.** On the greedy policy 7 of the 20 Ch 15 target rows miss: Perfect and Steadfast win a few weeks late (weeks 48 and 51 against 36 to 40 and 44 to 48), Committed wins too rarely (41% within 70 weeks against 60 to 75%) and never loses to Ascendancy (against 20 to 35%), and skill is worth less than the book wants (the smarter policy saves 4% of Steadfast's finishing time against 10 to 20%). Wavering and Casual, the no-loss-before-week-36 rule, Grand Battles a month and coalitions all hit. Decide which to accept and which to tune toward.
2. **The land deadlock.** Every Tier II needs 8 Dominion in its own direction, and the ring-2 dens next to the founding land need an Assault the starting companies rarely reach, so a greedy Committed player holds its founding land until month 9 with a purse it can't spend. This, more than any single number, is why Committed misses. The 52-week end-to-end run saw the same.
3. **The repeated push.** Assaulting one den day after day (Ch 6: each repulse wears 25% of the Assault off the garrison until the week closes) breaks the deadlock within days, and then every profile wins: Committed 96%, Wavering 88%, Casual 94%, with no losses. Decide whether the wear should stay as strong, or Weary (−20% the next day) should also stop a company pushing on consecutive days, or the early Dominion thresholds should come down.
4. **The ranked proposals** (army cost, the benchmark `b`, the rivals' starting state): each one-lever step that brings Steadfast and Committed closer to their ranges, with by how much. They are noisy (30 campaigns a cell); approve, change or reject each (D-02).
5. **The income check** misses the book's table by 9 to 18%, and the report names the formula: the contract payout's `L`, because longer contracts need tiers and castle tiers that need land, while the book took the benchmark's schedule. Decide whether the book's estimate or the unlock path is right.
6. **A-143, A-156 and the Border Campaigns:** 2% of resolved rivals defect under A-143's literal reading (kept by T13); a Steadfast player's first trophy arrives in week 2 (A-156); Border Campaigns take 0 hexes a campaign against the book's 2 to 6 (as T10 found).

### 2b. Raised in T17

- **The 52-week end-to-end run** played through the real screens ended week 52 on its founding land with every building at Tier I: the land deadlock of 2a, seen by a player in the app. Its numbers are in the T17 hand-off.
- **Fitbit tokens off Windows.** They are encrypted only when the OS offers `safeStorage`; on a machine without a keychain they are saved in plain text (`docs/game/guardrail-audit.md`). Windows is unaffected.
- **A-183** (a clock set back changes nothing) is a new reading to confirm.

### 2c. Every planning assumption is still a default

The 47 **A-** planning assumptions (A-01 to A-47) and the 22 numbers marked TUNE in `rules.ts` stand until the owner changes them (decisions.md explains how). None was changed by T13 or T17 (D-02).

### 2d. Open readings raised by agents

Each is a reading an agent took where the book was silent or contradicted itself. All are implemented as written in `decisions.md` and await confirmation; only A-108 has been decided (and A-143's open question was settled by T13, as written there). The full text of each is in [decisions.md](decisions.md#raised-by-agents).

| ID | What it settles | Raised in |
| --- | --- | --- |
| A-101 | The Engine Works Wing says "ranged +10%" without saying power or damage. | T01 |
| A-102 | Appendix C gives no reach for the four rival commanders or for the mythic units. | T01 |
| A-103 | Ch 7 lists a mythic reduction at Mage Tower II (−10%), IV (−20%) and V (−30%) but none at III. | T01 |
| A-104 | The Royal Hunt (Legend perk) pays 60 reputation "and a trophy item", but every Appendix C trophy comes from a mythic. | T01 |
| A-105 | The book's Spymaster Wing shows neighbors' *treasuries* as numbers; T10's task text says treasury and AV. | T01 |
| A-106 | A-05's v1 migration doesn't say which legacy contracts count or what to do when a contract's unit differs from `settings.unit`. | T02 |
| A-107 | Burning a legacy contract erases the steps and calories on its days. | T02 |
| A-109 | `hexLabel` numbers each ring from **1** at its NW corner, clockwise (the castle is "0-1"), since the labels are for players to read ("hex 3-4"). | T03 |
| A-110 | How `claimableBy` reads the land rules. | T03 |
| A-111 | Ch 4 scores "each calendar week the contract touches", but a contract can end mid-week, before its week does. | T04 |
| A-112 | The book's "Merchant Hall bonus on every gain above" includes the contract payout and pledge return. | T04 |
| A-113 | Respite (Ch 4 rule 4) is a contract rule. | T04 |
| A-114 | Withdrawal's `daysElapsed` counts the contract's days from its start through the withdrawal day, inclusive, less Respite days (the T04 test pays 4… | T04 |
| A-115 | Ch 9 Lock 1 says the mark is reached when "the 7-day average is" at or below it, but a lone weigh-in in its window is its own average, which would… | T05 |
| A-116 | Keeping Milestones (Ch 9 rule 2) don't say their mark, earliest week or how runs count. | T05 |
| A-117 | The Healer's Dispensation: | T05 |
| A-118 | Goal changes (Ch 9 rule 8). | T05 |
| A-119 | Momentum (Ch 5). | T05 |
| A-120 | Ch 16 "Illness and travel" has the Steward point to Respite "when a rough patch shows", without saying what a rough patch is. | T05 |
| A-121 | A-02's grace window, as settlement checks it. | T06 |
| A-122 | The Charter stores duties by name, and the ledger marks habits done by id. | T06 |
| A-123 | A timer's date (`statusUntil`, `wearyUntil`, `settlingUntil`, a deal's `until`) is the last day the status holds. | T06 |
| A-124 | Which terms judge what. | T06 |
| A-125 | At founding, the Healer floor is computed from the ledger's last 28 days (logs, else Fitbit burned, else Mifflin–St Jeor, else 1,200) and set… | T06 |
| A-126 | Stacking beyond A-31. | T07 |
| A-127 | Trade Roads and Guild Charters ("tiers and Crossings cost less") discount building tiers and Crossing stages, not castle tiers. | T07 |
| A-128 | A Legendary item's realm-wide effect (the Unbroken Banner, the Gilded Ledger, the Starglass Orb, the Anvil-Heart) holds while the item is equipped… | T07 |
| A-129 | Tier V's "matching rival" is the rival on that building's road (Barracks–Orc, Merchant Hall–Goblin, Mage Tower–Archmage, Foundry–Dwarf). | T07 |
| A-130 | The Crown's Grace II's halved tribute multiplies with Oathguard's (a reduction, A-31): | T07 |
| A-131 | A daily mythic victory pays "a trophy item", but every trophy is the unique prize of one Mythic Hunt (Appendix C), as with A-104. | T08 |
| A-132 | A raid's raider is drawn at the week close (A-28), but a Truce, Peace, an Accord or the rival's fall can come later. | T08 |
| A-133 | The tidings' "strength band" isn't defined. | T08 |
| A-134 | The Royal Hunt: | T08 |
| A-135 | Grand Illusion: | T08 |
| A-136 | Timers and land changing hands in combat. | T08 |
| A-137 | Hired blades and rival envoys (Ch 5 sinks) join only the day's defense pool. | T08 |
| A-138 | The Ch 10 worked battle (E-02) fields the Battlemages, a Barracks + Mage Tower Brotherhood hybrid, but uses a 55% rally floor. | T08 |
| A-139 | Reclaiming (Ch 6, Grace I). | T09 |
| A-140 | A bought or sold hex changes hands when the deal is struck, not at the next dawn. | T09 |
| A-141 | Courtships, where Ch 6 is silent. | T09 |
| A-142 | Deals, where Ch 6 is silent. | T09 |
| A-143 | The defection tally (Ch 14) counts a rival's original villages (its Gate and two March hexes at the founding) that the player holds now, each by… | T09 |
| A-144 | Rim fronts, where Ch 12 is silent. | T10 |
| A-145 | The Dwarf's fourth fortification level costs 120 × ring (TUNE, `RULES.rivalAi.dwarfLevel4CostPerRing`; the book gives only levels 1 to 3), less… | T10 |
| A-146 | Conquest attempts (Ch 12 step 7). | T10 |
| A-147 | The Goblin's Market (Ch 12 step 6) spends a fund fed by its special share. | T10 |
| A-148 | The Archmage's Rituals. | T10 |
| A-149 | Hostile acts and land taken (Ch 12 disposition and Threat). | T10 |
| A-150 | The Dwarf's 10% special (the Deep Halls) has no purchase of its own; it is spent on more fortification at the Deep Halls' 25% discount, with its… | T10 |
| A-151 | The Orc's Warhost goes out at 600 saved, aimed at the player's border hex in rings 1 to 5 nearest the Orc's land (ties drawn), as a… | T10 |
| A-152 | Rival bids and the week close. | T10 |
| A-153 | Skirmishes. | T10 |
| A-154 | A rival's special fund (the Warhost, the Market, the Rituals) is unspent reputation, so its Power and its treasury band count it with the treasury. | T10 |
| A-155 | The rival turn's open choices. | T10 |
| A-156 | Trophies. | T11 |
| A-157 | "Once a month" (the Herald's Horn; the Scrying Pool and an ally's battle in T12) means once per block of 4 campaign weeks: | T11 |
| A-158 | The book gives no intent pattern for the Mythic Hunt quarries. | T11 |
| A-159 | Where a host stands: | T11 |
| A-160 | Movement without dice. | T11 |
| A-161 | Readiness reads the Valor of the 7 days *before* the battle day (the battle day's own Valor isn't known until it closes), only the campaign's own… | T11 |
| A-162 | Orders, where Appendix C is brief. | T11 |
| A-163 | The Marshal (Ch 11 rule 1) keeps the player's formation and Doctrine when they were set during the warning; otherwise he picks his best companies… | T11 |
| A-164 | The Siege's "walls count in full" (Ch 14 rule 3): | T11 |
| A-165 | Grand Battle outcomes, where Ch 11 is silent. | T11 |
| A-166 | Mythic Hunt quarries are not weakened by the realm's mythic reductions (the Mage Tower, the Ward Circle, the Starglass Orb, Wardstones, a sealed… | T11 |
| A-167 | Ch 12's Threat counts "15 × rivals resolved", while Ch 13's fall table gives +15, +10 and +5 by how each fell. | T12 |
| A-168 | Ch 14's pacing (none before week 12, one in any 8 weeks) never refuses a resolution the player earned; it holds it. | T12 |
| A-169 | The event deck, where Appendix C is brief. | T12 |
| A-170 | The Wild Hunt's full moon is computed from a known new moon (2000-01-06 18:14 UTC) and the 29.530589-day synodic month, in whole days (good to… | T12 |
| A-171 | Offers the world makes stay open 7 days (TUNE, `RULES.worldAi.offerDays`): | T12 |
| A-172 | Bending the knee is priced from a treasury *estimate* the player can know, since the price is shown and the treasury is hidden: | T12 |
| A-173 | The Coalition Offensive and the war chest. | T12 |
| A-174 | Coalitions, where Ch 13 is silent. | T12 |
| A-175 | Abdication passes only the rival's claimable hexes to the player. | T12 |
| A-176 | The Reign and the Fall. | T12 |
| A-177 | Ascendancy's 4 week closes in a row all count from week 36 (44 at Grace III), each at the Grace level of its close, so the earliest Ultimatum is… | T12 |
| A-178 | The Chronicle's record (Ch 14 "Victory") counts "days kept" as settled campaign days on which every sworn duty was kept; Realm Consistency is the… | T12 |
| A-179 | A "low-scoring day" for the Healer's rough patch (A-120): | T14 |
| A-180 | The campaign in the app, where the book leaves the screens open. | T14 |
| A-181 | The war table, where the book leaves the screens open. | T15 |
| A-182 | The big-moment screens, where the book leaves them open. | T16 |
| A-183 | A computer clock set back to a day already settled (Ch 2's real-time rules assume time only moves forward). | T17 |

## 3. What A1 to A4 need

The game is complete on placeholders: every art slot falls back to a colored hex, a lettered token or a parchment card, every sound to silence, and every story line to its plain-fact template. Nothing in code needs to change to add any of them. The details are in each task file; what T17 found:

### A1 and A2: art

- **Where it goes:** a PNG or WebP at exactly the size `docs/game/assets.md` gives, saved in `src/renderer/public/game-assets/`, and its file name set as that slot's `"file"` in `manifest.json` there. `npm run assets:check` reports missing, unknown and wrong-size files and rewrites the checklist; `npm run dev` shows the result after a reload. The installed app shows new art only after `npm run dist` and a reinstall, because the folder is bundled.
- **How many:** the checklist has 255 slots: the book's Ch 17 asset table plus 6 big-moment cards its art direction asks for. **The screens draw 169 of them today.** The other 86 have no place on any screen yet: the 60 company portraits (the screens draw company tokens; portraits only for Elites, mythic quarries and the rulers), the 14 event cards (events reach the player as Herald text), 11 of the 12 interface-kit pieces (frames, buttons and icons are drawn in CSS and with the bundled icon set; only `ui.parchment` is drawn) and the player's own banner. They can wait, or be skipped, unless a screen is added for them first. A2 now says so.
- **Constraints the checker doesn't spell out** (now in A2): hex terrain is drawn unclipped, so paint a pointy-top hexagon with transparent corners; overlays sit on the terrain; tokens are shown at 28 to 84 px, items at 52 px, buildings at 96 px; the moment scenes are shown at up to 960 px with text below. A1 step 4 says to update the placeholder banner colors in `game.css`, but they aren't there: the six colors are `OWNER_COLORS` in `components/game/GameArt.tsx`, repeated in `styles/realm.css`, `styles/diplomacy.css` and `styles/battle.css`; all four need the style sheet's values.
- **Fixed in T17:** a hired company asked for a slot no manifest entry could fill (`company.hired:0.token`); it now wears the Merchant Hall's company token, as it already did on the battle field.

### A3: story text

- **Where it goes:** `src/renderer/src/data/text/*.json`. Write each line in the entry's `"final"`, keeping the `{placeholders}` the template offers. Healer lines show only once `"approved": true`. `npm run text:check` reports progress, unknown placeholders (an error) and lines longer than Ch 17 allows (a warning).
- **How many:** 297 slots, all on placeholder: Healer 13, Milestones 10, rival lines 48, events 28 (a title and a body each), coalitions 3, endings 4, Crossings 12 (a name and a body each), units 72, items 23, battle reports 20, and 64 Herald lines (threats, results, deals, Grace, rumors and the like). The Herald's 64 are not in the book's writing table; their plain-fact templates read well enough to leave as they are.
- **Fixed in T17:** six tests compared rendered text with the placeholder wording, so `npm test` would have failed as soon as the first line was written. They now pass both on placeholders and with every slot written and approved.
- **The Shame guardrail depends on A3:** read every loss and Fall line aloud as chronicle, not judgment (`docs/game/guardrail-audit.md` lists them as they render today).

### A4: sound (optional)

- **Where it goes:** a WAV named after the sound's id in `src/renderer/src/assets/audio/sfx/` (`victory.wav`, plus `victory-2.wav` and so on for variations). No code changes; A4's text said to register each file in code, which isn't needed, and now says so. Bundled at build time, so restart `npm run dev`, or rebuild and reinstall.
- **How many:** 10 ids, all silent today: `founding`, `herald`, `battleWon`, `battleLost`, `milestone`, `coalition`, `ultimatum`, `victory`, `fall`, `grandBattle`.
