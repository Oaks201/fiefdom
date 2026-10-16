# Patch 3 spec: sieges and routed enemies

Written 2026-10-14. **Status: approved by Rich as written on 2026-10-15, C-27 included. Build stages 1 (the measures), 2 (sieges, rules 3.1.0), 3 (strongholds), 4 (fallbacks and counterattacks) and 5 (the deeds, the Herald lines and How to play) done, not yet committed. Stage 6 done: Rich approved the tuning report (section 15, T-01 to T-05) on 2026-10-15; it is built, `targets-3.1.0.md` regenerated and D-22 to D-26 written. Not yet committed. Section 14 lists what the build changed.**

This spec carries out [blueprint](blueprint.md) section 8.2's "Patch 3: sieges and routed enemies" (decisions R-04, R-10, R-15, R-16, R-24, R-25). It builds on Patch 2 as committed (`37cadcc`, rules 3.0.0; [Patch 2 spec](patch-2-spec.md) with its section 13). Rich answered the first three questions on 2026-10-14 ([section 1.1](#11-richs-answers-2026-10-14)). He then handed the rest to Claude for that night. Every rule Claude settled carries its call's number (C-20 to C-33) where it is used, and is listed in [section 1.2](#12-claudes-calls-delegated-2026-10-14) for Rich to confirm or overturn before he approves. C-27 changes how G-01 and G-03 are counted, which R-30 approved as written, so it needs Rich's ruling in particular. Every number is a first guess marked TUNE: it lives in `rules.ts`, and the simulator reports on it (D-02: the simulator never retunes, and Rich approves each change).

Paths: game modules are in `src/renderer/src/lib/game/`, the simulator in `sim/`, tests in `tests/game/`.

**This spec changes no Patch 2 number.** D-16 to D-19's values, and section 13's B-01 to B-15, stay as built. The map, its hex ids, names, seams, bands, villages, depth curve, tithes and Power stay exactly as they are. So do Dominion's four paths, ranks and tier gates, neglected marches, `autoplay.ts` as the one automatic player, and the re-founding (`refound.ts`, the wizard, `charterHistory`, the no-duty-day rule, the campaign archive). Border Campaigns (R-26) and A-129 stay retired.

---

## 0. The patch in short

- **Sieges.** A repulsed assault's wear (25% of the Assault, as today) stays on the hex until the hex falls. It is no longer reset at the week close. Each day a hex is not assaulted, it loses 10% of its wear. Every assault day moves a visible siege bar on the map, and a good-habit day moves it further, because the Assault already scales with Valor (R-04, R-15).
- **Standing siege orders.** The day's assault target carries over until it falls, can no longer be assaulted, or is changed or lifted. On any day without the player's own orders, the Marshal presses it and the other companies defend (R-16). One assault a day stays (R-25).
- **Flanking.** The Assault gains 5% for each hex the player holds beside the target beyond the first, up to +20%.
- **Strongholds.** One stronghold sits on each rival march's road at depths 4 and 8: 8 in all, none in the lair wedges. While one stands, no hex deeper in its march can be assaulted. Its garrison is twice its curve. The player takes it either by a siege, whose wear decays at half the rate, or by challenging it to a Grand Battle (P3-01, P3-02).
- **Routed enemies.** A garrison beaten without a rout falls back to a deeper hex of the same holder: +50% of the beaten garrison, fading over 3 days, stacking to at most +100%. Each of those days it may strike back at the hex it lost, as a defense battle announced at dawn. If it wins, the hex goes back. A rout scatters it, and militia never fall back. No counterattack comes while the player has been away 14 or more days (R-10, R-24).
- **Led battles** extend as they are: counterattacks join D-12's fight list, siege days are led like any assault, and stronghold battles are Grand Battles (P3-03).
- **New deeds** in `RULES.dominion.deeds`, posted by the existing `chronicle` phases: a stronghold taken, and a counterattack held.
- **Measures.** A new "Breach" day label (a siege brought its target within the next assault's reach) counts toward G-01. G-03's "a siege to press" means a hex that falls within 3 assault days. G-09 is measured in `sim/targets.ts`. The strict readings are reported beside them.
- **Rules 3.1.0.** A 3.0.0 campaign carries forward in place, with no re-founding.

---

## 1. Decisions for this patch

### 1.1 Rich's answers (2026-10-14)

| # | Question | Rich's answer |
| --- | --- | --- |
| P3-01 | Blueprint 9 item 5, part one: where strongholds sit, and what one holds back | **Depths 4 and 8 on each rival march's road, barring the way.** One stronghold per rival march on its road hex at depths 4 and 8 (the band edges). If that hex is a seeded village, the stronghold is the nearest non-village hex in its row. 8 in all, none in the lair wedges (the Lair Mouth is theirs). While one stands, no hex deeper in its march can be assaulted. Seams, courtship and trade still reach past it, so the deals road stays open |
| P3-02 | Blueprint 9 item 5, part two: Grand Battle or long siege | **Either, the player's choice.** Garrison 2× its curve. The player sieges it (its wear decays at half the usual rate) or challenges it to an Incursion-style Grand Battle. A lost battle costs tribute and a 14-day wait before the next challenge, and the siege wear stays |
| P3-03 | Blueprint 9 item 7: led battles and the new fights | **Yes, as they are.** A counterattack joins the day's fight list; a siege day's assault (a stronghold's included) is led like any assault, with the formula's wear; a stronghold's Grand Battle is a Grand Battle. No new screens; D-12's calibration stands |

**A correction to what Rich was shown for P3-02.** The option he chose said a stronghold siege would take "about a week when you first reach it". A measure taken after he answered (section 4.4) puts first contact at about two weeks (months 3 and 4, Assault about 72 to 86 against about 300), falling to about a week by months 5 to 8, when the bar starts to bind. The 2× is TUNE (C-28); 1.5× would make first contact about ten days.

### 1.2 Claude's calls (delegated 2026-10-14)

Rich handed the remaining questions to Claude on the night of 2026-10-14 ("I'll let you make the decisions from here"). Each call below takes the recommendation Claude had prepared for him, checked against the code and the scratch simulation in [section 12.3](#123-what-a-scratch-emulation-shows). **Rich may overturn any of them when he reviews this spec.** C-20 to C-25 answer the questions Claude would have asked next; C-26 to C-33 settle details the build needs.

| # | Call | Why | The options set aside |
| --- | --- | --- | --- |
| C-20 | **Wear decays 10% a day** on a hex not assaulted that day (strongholds 5%). It never decays on a day the hex is assaulted. It clears when the hex changes hands | The blueprint's rule (R-04: "slow decay when the siege stops"). A siege left for a week keeps about half its wear (0.9^7), two weeks about a quarter: switching targets costs a little, never everything | Holding wear 3 days and then fading it (a dropped siege is lost entirely after a week); halving it at the week close (coarse: all or half) |
| C-21 | **Flanking: the Assault gains 5% for each held neighbor of the target beyond the first, up to 4 (+20%).** It applies to the daily assault only (taking the hex and the wear), led fights included, and never to Grand Battles or defenses | The cheapest target already touches 2.5 to 3.4 held hexes (section 12.3), so this typically adds 8 to 12%. That is a reason to widen without pushing land past G-04's ceiling of 4 a week or eating G-05's margin (16% unheld at week 60 with sieges) | +10% each up to +30% (the blueprint's first figure: typically +15 to 24%, risky for G-04 and G-05); flanking on the wear only |
| C-22 | **A standing siege names its target only.** On a day without the player's own orders, the Marshal sends the best-matched companies for it (as the orders estimate fields them, by power × match with Weary's −20% counted, so a fresher company takes a Weary one's place when it is now the stronger) and the rest defend. On a day the player sets orders, those orders rule that day. Naming a new assault target makes it the standing siege. It ends when the hex falls (by any means), when it can't be assaulted at dawn, or when the player lifts it. It covers the first daily assault only | R-16 ("carries over until it falls or is changed"); A-36's "everyone defends" still holds whenever no siege stands. Keeping companies out of the order means a standing siege never sends stale or Weary picks | Keeping the player's chosen companies (they would go even when Weary); "press on" to the next hex by itself (an autopilot, which would walk into fresh fallbacks) |
| C-23 | **Fallbacks:** the garrison of a hex taken by a daily assault without a rout falls back. It goes to a deeper adjacent hex of the same march (a seam counts for both of its marches) and the same holder: beasts to a neutral non-village hex, a rival's garrison to one of his hexes that isn't a Gate, capital or realm hex. Ties are drawn by seed. It adds **50% of the garrison the assault beat** to that hex, then 2/3 and 1/3 of that over the next two days, and is gone after 3 days. Fallbacks on one hex stack to at most +100% of its own garrison. Militia, mythics, routed garrisons, and hexes taken by Grand Battle, courtship or trade never fall back | R-10's numbers. "The garrison the assault beat" is the worn garrison, so a long siege leaves a weak fallback and a quick take a strong one. With beasts kept out of villages, 68% of non-rout wins have somewhere to fall back (section 12.3), above G-09's 60% | Letting beasts fall into villages (72%, but militia hexes would hold beasts); a pool for the whole march (blueprint 5.3 C, rejected by R-10) |
| C-24 | **Counterattacks:** on each of the fallback's 3 days, a seeded draw (**30%** a day, TUNE) decides whether the fallen force strikes back instead of digging in. If it does, it leaves its fallback hex and strikes the hex it lost at its strength that day (±15% roll, early grace as for any threat, no Saturday bonus). The strike is announced at dawn in the tidings with its band, and fights once. **Held:** it scatters; spoils as for any defense won; the counterattack deed. **Lost:** the hex goes back at once (beasts: to the wilds at its curve, as D-15; a rival: to him, at his garrison), with tribute 3 × band and no scorch. Grand Illusion spares the hex and the tribute; Grace I can reclaim it (A-139). No Respect changes. A rival's force is called off when he can't raid (a Truce, a pact, an Accord, resolved). **No counterattack before week 3** | R-10 ("may counterattack ... in that window, announced at dawn"). A daily draw makes the threat real without a fight after every capture (about 66% of fallbacks strike within 3 days). Retaking at once mirrors D-15's overrun and keeps the result readable. Holding off until week 3 protects D-14's fast opening | Always striking the next dawn with a contested hex on a loss (most fights, but more battles a day than the loop wants, G-14); beasts only digging in and rivals always striking (pre-empts Patch 4's personalities) |
| C-25 | **Absence (R-24):** while the player has been away 14 or more days (A-10), no counterattack is drawn: the fallen force only digs in and fades. Standing sieges carry on (taking land is not a loss). The test is the one D-19 uses for preparation, moved into `state.ts` so both share it | R-24's "no counterattack resolves against them". Not launching it at all is the cleanest reading, and matches D-19 | Launching it with the Marshal defending but costing no land (a battle the player never sees that changes nothing); pausing standing sieges while away (contradicts R-16) |
| C-26 | **Deeds:** `strongholdTaken` adds **2 × depth** (× the hex's shares) on top of the hex deed (8 at depth 4, 16 at depth 8); a stronghold won in a Grand Battle also earns the Grand Battle deed (15). `counterattackHeld` is **2** to a rival's path, or **1** × the hex's shares for beasts. There is no deed for each day of a siege | A little above an ordinary defense (1.5 / 0.5), since it holds land just won. Small next to a 660-Renown path, so P2-13's mix (hexes about 50%, battles about 30%) holds. Shares keep G-17 true by construction. A per-day siege deed would flood Renown with effort rather than results; the Dwarf's "siege wear dealt" is a Patch 4 signature deed | Counting counterattacks as ordinary defenses with no new entries; a deed for each day of wear |
| C-27 | **Measures** (section 2): a new day label, **Breach**: a repulsed assault that left its target within the next day's reach (at the next dawn, it would fall to the Assault that wore it). It counts toward G-01's player-view days. **G-03's "a siege to press"** is a hex that falls within 3 assault days at today's Assault. Choice stays "two or more hexes that fall today". The strict G-01 (without Breach) and the strict G-03 ("no hex falls today") are reported beside the verdicts | R-15 makes siege progress the daily unit, but counting every siege day is hollow: it gives 7.0 days a week. Counting "two targets within 3 days" as a Choice gives 6.9 a week even on 3.0.0, with no sieges. A breach is a visible change of state (the hex turns "in reach"), and in the emulation it gives 5.7 days a week and 81% of weeks at 5 or more, against 4.7 and 50% strict | Every siege day counts; G-01 kept strictly as written (4.7 in the emulation, which would push Patch 3 to revisit R-25) |
| C-28 | **Stronghold details:** the 2× is read when the player's assault weighs the garrison (like preparation), so nothing is rewritten. A stronghold challenged to a Grand Battle can't be assaulted until the battle is fought, and its wear holds without decay meanwhile. A beast-held stronghold's host is drawn from `skirmish.json`'s beasts at **0.5 ×** its garrison as an assault must beat it (TUNE); a rival-held one's is his Incursion host (60% of his AV). Lost: tribute 5 × band and a 14-day wait before the next challenge. Won: the hex is taken and its garrison scatters (no fallback). Strongholds are derived from the map (road tags and villages), never stored | Keeps 3.0.0 saves carrying forward without a migration, and avoids a siege and a battle racing for the same hex | Storing a stronghold flag on `HexState` (needs a migration pass) |
| C-29 | **A rival's den assault (A-25) reads garrisons as today:** no stronghold ×2, no fallback strength. The player's siege wear still counts for him, as it always has | Strongholds and fallbacks are the player's beat; changing the rival AI belongs to Patch 4 | Applying both to rivals (a rival taking a beast stronghold would face its 2×) |
| C-30 | **Names in code:** the Grand Battle trigger is `stronghold`, the order is `standingSiege`, and the new threat kind is `counterattack`. The existing `siege` trigger stays the Ch 14 Siege of the castle | `GrandTrigger` already has `'siege'` (Ch 14), and `RULES.combat.siegeDay` is Saturday's +40% | — |
| C-31 | **The automatic player** presses sieges (section 7). It takes the best hex that falls today. Failing that, it presses the target with the most Dominion per expected assault day within a 3-day horizon; a fallback that raises its standing target can make it switch. Failing that, it presses the nearest to falling. It challenges a stronghold when the siege would take longer than the horizon and the holder's army band allows (as for Gates). Habits of play live in `RULES.autoplay` | Needed for the simulator, the re-founding's catch-up (R-21) and G-09. One player, extended in place, never copied into `sim/` | — |
| C-32 | **One assault a day stays (R-25).** If the build's simulator misses G-01, G-02 or G-03, the tuning report names R-25's revisit (blueprint X-08 (b): a siege target plus one ordinary assault) as an option for Rich, with evidence; it is not built in this patch | R-25: "revisit in Patch 3 only if the cadence targets miss" | — |
| C-33 | **Rules 3.1.0**, carried forward in place (section 9) | A major bump would make `needsRefounding()` force another re-founding; nothing here needs one | 4.0.0 |

### 1.3 What Patch 3 keeps

| Kept as built | Notes |
| --- | --- |
| The four-march map (D-16), strength by depth and bands (D-17) | Strongholds and fallbacks are read-time multiples and records; no hex id, name, seam, band, village or curve changes |
| Dominion (D-18) | Two new deed kinds, posted by the existing `chronicle` day and week phases. Ranks never fall; tier gates unchanged |
| Neglected marches (D-19) | A siege day is an assault, so it pushes its march as C-09 already says |
| `autoplay.ts`, `refound.ts`, the wizard, `charterHistory`, the no-duty-day rule, the archive | The automatic player is extended in place (section 7); the re-founding plays Patch 3's rules through it unchanged |
| D-12 led fights, D-15's overrun, Grace I reclaiming, Grand Illusion | Extended to the new fights as written in sections 3 to 5 |
| The phase lists | No phase is added or moved. `resetAndSchedule` stops resetting wear and keeps its schedule; decay, fallbacks and counterattacks live in `combat` and `dawn` |

---

## 2. Measures first

Before any rule changes, on rules 3.0.0, in `sim/measure.ts` and `sim/targets.ts`:

1. **Breach label** (`LABEL.breach`, C-27): at a day's close, a repulsed daily assault whose target, at the next dawn, would fall to the Assault that wore it. The `assault` event gains the Assault value it was fought at (`value`), which the measure reads. Player-view meaningful becomes Land, Grand, Build, Choice or Breach.
2. **Target label** (`LABEL.noTarget`): at dawn, no hex falls today and none falls within `RULES.autoplay.siegeHorizon` (3) assault days at the whole army's Assault, wear counted. `LABEL.noReach` stays (no hex falls today), as the strict G-03.
3. **G-01**: the verdict on Land, Grand, Build, Choice or Breach; the strict value (without Breach) reported beside it, with the "incl. auto battles" value as today.
4. **G-03**: the verdict on `noTarget`; the strict "no hex falls today" reported beside it.
5. **G-09** (blueprint section 7): "A fallback after 60% or more of non-rout assault wins; the next day's target differs from the planned one in 20% or more of those."
   - The share: `fallback` events from daily assaults ÷ daily assault wins that were not routs (led fights included), Steadfast greedy.
   - The change: at the dawn after each close that posted a fallback, the recorder asks the automatic player for its target twice, through the one exported picker (`pickAssault` in `autoplay.ts`): once on the state as it stands, once on a copy with that close's fallbacks removed. A day where they differ is a changed choice. The verdict: share ≥ 60% and changed ≥ 20%.
6. **New report rows** (in `docs/game/sim/report.md`'s Patch 3 section): assault days per hex taken; stronghold sieges and battles (days, wins, losses); counterattacks a week, held and lost; fallbacks and the targets they changed; flanking's average bonus on assaults that fell.
7. **Baseline.** The targets on 3.0.0 with the new labels: `targets-3.0.0.md` regenerated (it is generated, and the same seeds give the same rows), so Patch 3 is compared with Patch 2 on the same measures.

---

## 3. Sieges (R-04, R-15, R-16, R-25)

### 3.1 Wear that stays (X-07)

- A repulsed assault wears **25% of its Assault** off the garrison (`RULES.land.repulseWear`, unchanged), led or not, as today. Weary (−20% the next day for the companies that were repulsed) is unchanged.
- **The wear stays until the hex falls.** `resetAndSchedule` no longer clears `garrisonDamage` at the week close; it keeps drawing next week's threats. `HexState.garrisonDamage`'s comment changes from "Resets at week close" to the siege rule.
- **Decay (C-20):** at the day's close, after the assaults, every hex not assaulted that day loses **10%** of its wear (**5%** for a stronghold), `RULES.sieges.wearDecay`. Wear below 0.05 is cleared. A hex assaulted that day doesn't decay.
- **Cap:** wear never exceeds the garrison it wears, as an assault must beat it that day (fortification, preparation and the stronghold's 2× counted).
- **Clearing:** wear clears whenever the hex changes hands (`toPlayer`, `toRival`, `toWilds` already set it to 0).
- What an assault must beat: `(garrison + fortification) × preparation × stronghold + fallback − wear`, floored at 0 (`effectiveGarrison`, with the new factors passed in as preparation is today).
- **Siege progress** on a hex = wear ÷ the garrison before wear, shown as a bar (section 8). It is not a hidden value: garrisons are shown exactly (A-181).

### 3.2 Standing siege orders (R-16, C-22)

- `CampaignState.standingSiege?: { hexId: string; since: ISODate }`, read through `standingSiegeOf(state)` (missing in a 3.0 save means none).
- **Setting it:** the player's orders for a day with an assault target make that hex the standing siege (`setOrders`). The orders panel's **Lift the siege** clears it (`liftSiege`, a player action dated the open day).
- **A day with no orders from the player:** at the close, `ordersValidity` builds the day's orders from the standing siege: its hex is the assault target, the Marshal fields the best-matched companies for it from the whole roster (`fieldBest`, assault banners), and everyone else defends. A day the player set orders for is ruled by those orders (A-36 is overridden for sieges only).
- **It ends** when its hex falls (by any means), when at dawn the hex can't be assaulted (`claimableBy` refuses it, or it is the subject of an announced Grand Battle), or when the player names another target or lifts it. Lapsing posts a plain-fact tiding.
- **Only the first daily assault** stands. A second assault (Castle IV, the Siege Park) needs the day's orders.
- With no standing siege and no orders, everyone defends (A-36 as today).

### 3.3 Flanking (R-04, C-21)

- The daily assault's value × (1 + `perNeighbor` × min(`maxNeighbors`, held − 1)), where *held* is the number of the target's neighbors the player holds: **+5% each, at most 4, so +20%** (`RULES.sieges.flanking`). A target touching one held hex gets nothing.
- It counts in the take and in the wear (wear is 25% of the flanked Assault).
- **Led assaults (P3-03):** the enemy host is the garrison ÷ the flanking multiple × `hostScale`, so flanking helps a led fight as much as the formula.
- Not in Grand Battles, defenses or rival assaults.
- Shown in the orders estimate and the hex panel as "Flanked +N%" (an interface label).

### 3.4 One assault a day (R-25, C-32)

Unchanged: one daily assault, two at Castle IV, plus the Siege Park Wing's. Revisited only if the cadence targets miss (C-32).

---

## 4. Strongholds (P3-01, P3-02, C-28)

### 4.1 Where

- Each rival march has two strongholds, at **depths 4 and 8** (`RULES.sieges.stronghold.depths`): its road hex in that row (the hex tagged with the march's `road`), or, if that hex is a seeded village, the non-village hex nearest the road in that row (ties go clockwise). Never a seam; none in the lair wedges. 8 in all.
- Derived from the map (`strongholds(hexes)` in `map.ts`, from road tags and village flags, which never change), never stored, so a 3.0 campaign has them at once.
- The Gate (depth 12) stays the march's last fortress, as today.

### 4.2 Its garrison and the bar

**Changed (T-01, approved 2026-10-15):** the multiple is **1.75**, not 2. Where this section and section 4.4 say 2×, read 1.75×.

- **Garrison:** while the player doesn't hold it, a stronghold's garrison is **2×** its usual one (`RULES.sieges.stronghold.garrisonMult`). Beasts' 0.9 or a rival's multiplier (A-17), fortification, preparation, fallbacks and wear all apply as on any hex, read when the player's assault weighs it.
- **The bar:** while a stronghold of a march is not the player's, `claimableBy(hexes, id, 'player', 'assault')` refuses every hex of that march deeper than it, seams excepted. That includes ordering a Gate's Grand Battle. Hexes the player already holds there stay held.
- **Courtship and trade still reach past it** (P3-01: the deals road stays open), and so do rivals (they never answer to the bar).
- If a rival retakes a stronghold, the bar returns until the player takes it again.

### 4.3 Taking one: siege or battle (P3-02)

- **By siege:** an ordinary daily assault, standing orders and all. Its wear decays at 5% a day (C-20). An Assault at 1.5× its garrison routs it and takes it outright, as any hex. When it falls to an assault, its garrison falls back as any hex's would (section 5.1).
- **By Grand Battle:** the player challenges it (`challenge`, or an assault order on it with **Challenge** chosen in the orders panel). It is a new trigger, `stronghold` (C-30): Incursion-style, with a 2-day warning (`warningDays.stronghold`), moved by the 5-day spacing like any Grand Battle.
  - **The host:** the holder's. A rival's is his Incursion host (60% of his AV, `hostShare.rival`). For beasts, a host from `skirmish.json`'s beasts with power **0.5 ×** the garrison an assault would have to beat on the day it is announced (`hostShare.strongholdBeasts`, TUNE; a new `beastHost` in `grand/hosts.ts`, filled as A-35 fills a rival's).
  - **Meanwhile:** from the announcement until the battle, the hex can't be assaulted, and its wear holds without decay (C-28).
  - **Won:** the hex is taken (`takeHex`), and its garrison scatters (no fallback). A rival-held one costs −5 Respect, as a conquered hex does.
  - **Lost:** tribute 5 × band (`outcomes.strongholdLoss`), the next challenge no sooner than 14 days (`retryDays.stronghold`), and its siege wear stays. Sieging it meanwhile is allowed.
  - Fought by the player on the field, or by the Marshal at the close with his −0.1 (Ch 11), as any Grand Battle.
- **Incursions** (A-33) are unchanged: taking a stronghold from a rival counts like taking any of his hexes.

### 4.4 The beat it gives

With the Gate at depth 12, each rival march now runs: three rows of sieges, a stronghold, three rows, a stronghold, three rows, the Gate.

A scratch measure on 3.0.0 (ten Steadfast campaigns; section 12.3) puts the beats here. The siege lengths below are before flanking (up to +20%) and preparation, with Weary's −20% on repeated days:

- **First contact, months 3 and 4.** Steadfast first holds depth 3 of a rival march (in 83% of the month-3 samples, all by month 4). Its whole army's Assault is then about 72 to 86, against a depth-4 stronghold of about 300 (167 × 0.9 beasts × 2): about two weeks of siege. Whether its Grand Battle (a beast host of about 150 power) is winnable that early is for the simulator to report.
- **When the bar starts to bind, months 5 to 8.** The deepest rival depth held stays 4 through month 7 and reaches 5 in month 8. The Assault is 116 to 150, so a stronghold is about a week of siege.
- **The depth-8 strongholds, months 10 to 12.** An Assault of 230 to 307 against about 675: about a week to ten days.

`garrisonMult` (2) is the lever if the first contact drags; 1.5 would make it about ten days. G-13 (1 to 3 Grand Battles a month; 1.1 today) gains at most about 0.5 a month if every stronghold Steadfast reaches is challenged.

---

## 5. Routed enemies (R-10, R-24)

### 5.1 Fallbacks (C-23)

**Changed (T-02, approved 2026-10-15; R-10 amended by Rich):** the force falls back to a neighboring hex of the same holder **no shallower** than the one it lost, in a march they share, **the one cheapest to assault** (ties by hex id), not a deeper hex drawn by seed. The other limits below stand.

- **Who:** the garrison of a hex the player takes by a daily assault (formula or led) **without a rout**. Never militia (a village's), mythics, routed garrisons, or hexes taken by Grand Battle, courtship, trade, reclaiming or events.
- **Where:** an adjacent hex deeper than the one taken, in the same march (a seam counts for both of its marches), held by the same holder. Beasts go only to a neutral hex that is neither a village nor mythic; a rival's garrison goes to one of his hexes that is not a Gate, capital or realm hex. The choice is drawn by seed among the candidates (`fallback:<hexId>`). With none, it scatters.
- **How much:** 50% of the garrison the assault beat, its effective value at that moment (`RULES.sieges.fallback.share`). The fallback hex's garrison gains that amount on the next day, 2/3 of it the day after, 1/3 the third day; then it is gone (`days: 3`). All fallbacks on one hex together add at most 100% of its own garrison (`stackCap: 1`).
- **Recorded** as `CampaignState.fallbacks?: Fallback[]` (`{ id, from, to, holder, strength, day, struck? }`), each removed at the dawn after its last day. A `fallback` event is posted (from, to, holder, strength).
- **If the fallback hex falls** while the force is there, the force is part of the garrison the assault beat, so 50% of the total falls back further, capped as above.
- **Shown** on the map with the defender's existing company token on the fallback hex, its strength and the days left (no new art). The hex's garrison, as an assault must beat it, includes it.

### 5.2 Counterattacks (C-24)

**Changed (T-03, approved 2026-10-15):** a counterattack strikes at the force's strength that day × 1.5 (`RULES.sieges.counterattack.strengthMult`). At × 1 none was ever lost; at × 1.5, 6% are.

- **The draw:** at each dawn in a fallback's window (from campaign week 3, `RULES.sieges.counterattack.fromWeek`), `chance(seed, day, 'counter:<id>')` at 30% (`chancePerDay`). It is drawn only if the hex it lost is still the player's, the force hasn't struck, the player is not away (section 5.3), and, for a rival, he can raid that day (not resolved, no Truce, pact or Accord).
- **If it strikes:** the force leaves its fallback hex that day and becomes a threat of a new kind, `counterattack`, on the hex it lost. Its strength is the force's strength that day (1, 2/3 or 1/3 of its start), × the ±15% roll, × early grace (weeks 1 to 4). Saturday's +40% belongs to the daily threat and doesn't apply. It is in the day's tidings at dawn with its band (A-133), exact with the realm's reveals. Mage Tower IV's day of warning doesn't apply, because it is drawn that dawn.
- **The fight:** fought at the close with the conquest strikes, before the daily threat, by the day's defense pool (companies not on the assault), with the hex's walls and fortification, by the formula or led (P3-03).
- **Held:** the force scatters (its fallback record ends). Spoils are 4 × band (6 on a rout) with the usual multipliers. The `counterattackHeld` deed (section 6) is posted. Respect doesn't change.
- **Lost:** the hex goes back at once. Beasts return it to the wilds at its curve (`toWilds`, how `wilds`, as D-15). A rival takes it with his garrison (`toRival`, how `conquest`). Tribute is 3 × band; there is no scorch. Grand Illusion spares the hex and the tribute, as it spares a D-15 overrun. Grace I can reclaim it within 14 days (A-139, at half its garrison without its siege wear).
- A counterattack can only target a march hex, so the heartland (rings 0 to 2) can never be struck (Ch 3 rule 2, G-12).

### 5.3 Absence (R-24, C-25)

- While the player has been away 14 or more days (A-10: no launch for 14 or more days, counted from the last launch as each day settles), no counterattack is drawn. Fallbacks still dig in and fade.
- Standing sieges carry on while away (taking land is not a loss); a hex that falls ends the order as usual.
- The away test moves from `marches.ts` into `state.ts` (`awayOn(state, day)`), used by both (Conventions 12).
- The re-founding's backdated days are never away (R-21), as today.

### 5.4 Led fights (P3-03)

- `todaysFights` lists counterattacks with the conquest strikes, in the close's order. The enemy is the rival's host or `skirmish.json`'s beasts, at the force's strength × `hostScale`, as D-12 builds any defense.
- A siege day's assault, a stronghold's included, is led as any assault. A led defeat wears the garrison as the formula would (25% of the Assault, flanked).
- A stronghold's Grand Battle is fought on the Grand Battle field.
- No new screens; the Battle screen's fight list grows.

---

## 6. Dominion: the siege and counterattack deeds (C-26)

New entries in `RULES.dominion.deeds` (TUNE), and two new `DeedKind`s, posted by `deedsOf` in the existing `chronicle` phases:

| Deed | Value | Read from |
| --- | --- | --- |
| `strongholdTaken` | **2 × depth** × the hex's shares, on top of the hex deed (depth + 2 per fortification level). A stronghold won in a Grand Battle also earns `grandBattleWon` (15: to the rival, or × the hex's shares for beasts) | `hexTransfer` to the player of a stronghold hex, by any way but a rival's fall (C-10) |
| `counterattackHeld` | **2** to the rival's path; **1** × the hex's shares for beasts | `defense` with threat `counterattack`, won. It replaces that battle's ordinary `battleWon` or `heldAgainstBeasts` deed, so it is never counted twice |

- Retaking a hex lost to a counterattack counts its hex deed again (D-18's retaking rule).
- No deed for each day of a siege, or for wear dealt (C-26).
- Settling twice posts nothing new (Test 9).
- Chronicle lines: `chronicle.deed.strongholdTaken` and `chronicle.deed.counterattackHeld`, plain-fact placeholders.
- **Size check:** 8 strongholds come to at most 24 extra Renown per path (rank V is 1,100). At about one counterattack held a week, they add about 1 to 2 Renown a week across the paths. P2-13's mix holds; the simulator reports the deed shares as it did for Patch 2.

---

## 7. The automatic player (C-31)

`autoplay.ts` is extended in place, and the simulator and the re-founding use it as they do today. Nothing is copied into `sim/`.

- **The daily pick** (`pickAssault(state, today, plan)`, exported for G-09):
  1. The best hex that falls today, by Dominion per garrison point, on the plan's paths first (as today, B-07 kept).
  2. Otherwise, the best target that falls within `RULES.autoplay.siegeHorizon` (3) assault days, by Dominion per expected assault day. The expected days are 1 + ⌈(garrison − Assault) ÷ (`repulseWear` × Assault)⌉, wear and flanking counted, Weary ignored. A standing siege's wear makes its own target cheaper, so the player keeps a siege unless a fallback or something better changes the sum.
  3. Otherwise, the target nearest to falling.
  4. Gates and capitals are challenged as today, when nothing on the plan's paths falls within the horizon.
- **Strongholds:** when the pick is a stronghold that won't fall within the horizon, it challenges it if the holder's army band is in `RULES.autoplay.grandBands` (beasts: if the host's power is at most the army's Assault). Otherwise it sieges.
- **Orders:** it sets its pick as the day's orders, which makes it the standing siege (section 3.2). It never lifts a siege except by naming another.
- **Counterattacks:** no special response; the Marshal defends.
- The re-founding's four questions (P2-08) steer it as before. "By force" and "both" siege as above; "by deals" sieges only what it doesn't court.

---

## 8. What the player sees

No new art (X-21): siege bars, stronghold and flanking marks, and the standing-siege marker use the bundled icon set and CSS; fallbacks use the defender's existing company token. Interface labels (Stronghold, Siege, Lift the siege, Flanked, Breach) live in components. Story text goes through the text catalog as plain-fact placeholders (Ch 17, A-46).

- **The map and the hex panel** (`view/realm.ts`): each hex's siege progress (wear ÷ garrison) and the garrison an assault must beat (wear, fortification, preparation, the stronghold's 2× and fallbacks counted). A stronghold mark, and on the hexes it bars, "barred by {stronghold}". A fallback's token, strength and days left. The flanking bonus if assaulted today. The standing siege marked.
- **The orders panel** (`view/orders.ts`): the standing siege, with **Lift the siege**. Today's estimate, with flanking, and "about N more assault days at today's Valor" (the player's own Valor, not a hidden value). On a stronghold, **Siege** or **Challenge**.
- **Tidings at dawn:** counterattacks with their band, and a breach line ("{hex}: within reach") on the day a siege brings a hex within the army's reach.
- **The Herald and Chronicle** (placeholders, plain facts): `herald.siege.lapsed`, `herald.siege.breach`, `herald.fallback` ("{foe} fell back from {from} to {to}."), `herald.counterattack`, `battle.counterattack.held`, `battle.counterattack.lost`, the `stronghold` Grand Battle's announcement and result through the existing `herald.grandBattle.*` lines, and the two deed lines (section 6).
- **How to play:** sieges, standing orders, flanking, strongholds, fallbacks and counterattacks, as help text. It never states the counterattack chance, an event criterion (CLAUDE.md, Conventions 6); it says a fallen force "may strike back within 3 days".
- **Hidden values stay hidden.** Garrisons, wear and fallback strengths are shown exactly, as garrisons are today (A-181); a counterattack's strength is a band unless the realm reveals threats.

---

## 9. Rules version, saves and records

- **`ruleVersion` 3.1.0** (C-33). `needsRefounding()` compares majors, so a 3.0.0 campaign loads and settles under 3.1.0 at once. `campaign.ruleVersion` keeps its founding version.
- **A running 3.0 campaign takes Patch 3 at once, in place**, as D-15's did:
  - wear on the books carries on and decays from the first 3.1 close;
  - strongholds derive from its map;
  - `standingSiege` and `fallbacks` start empty (the first orders with a target set the siege);
  - nothing else is rewritten.
- **The live campaign** (still awaiting re-founding, C-19) is re-founded onto whatever rules are current when Rich runs it. If it is 3.1.0, the backdate plays Patch 3's rules through the extended automatic player. Nothing in `%APPDATA%\Fiefdom` is read or written by this patch's work; the tests use synthetic fixtures.
- **New `decisions.md` entries** when the patch lands, each with its final numbers and the simulator's findings:
  - D-22 Sieges: wear that stays, its decay, standing orders, flanking; one assault a day kept.
  - D-23 Strongholds.
  - D-24 Routed enemies: fallbacks, counterattacks, the absence rule.
  - D-25 The siege and counterattack deeds.
  - D-26 How the targets count siege days (C-27).
- **Assumptions changed** (marked `(changed 2026-xx-xx)` with a pointer):
  - A-36 (orders carry over for sieges);
  - A-139 (a reclaim's price is without siege wear, not "this week's");
  - A-110 (`claimableBy` refuses hexes behind a standing stronghold for the player's assault);
  - A-155 (a den's garrison counts siege wear, now persistent);
  - A-181 (the garrison shown counts the stronghold's 2× and fallbacks).
  - Ch 6's "until the week closes" is overridden by R-04 (X-07), recorded in D-22.
- `docs/game/README.md`: the module map notes sieges in `combat.ts`, strongholds in `map.ts` and `grand.ts`, and fallbacks in `combat.ts`. Spec test 9's wording gains "fallback, counterattack".
- The blueprint's status table (section 8.3) is updated at approval, at build and when the targets are met.

### 9.1 New numbers in `rules.ts` (all TUNE)

**Changed by the tuning report (2026-10-15):** `sieges.stronghold.garrisonMult` is 1.75 (T-01), and `sieges.counterattack` gains `strengthMult: 1.5` (T-03).

| Where | Value |
| --- | --- |
| `sieges.wearDecay` | `{ perDay: 0.1, stronghold: 0.05 }` |
| `sieges.flanking` | `{ perNeighbor: 0.05, maxNeighbors: 4 }` |
| `sieges.stronghold` | `{ depths: [4, 8], garrisonMult: 2 }` |
| `sieges.fallback` | `{ share: 0.5, days: 3, stackCap: 1 }` |
| `sieges.counterattack` | `{ chancePerDay: 0.3, fromWeek: 3 }` |
| `grandBattles.warningDays.stronghold` | 2 |
| `grandBattles.retryDays.stronghold` | 14 |
| `grandBattles.hostShare.strongholdBeasts` | 0.5 |
| `grandBattles.outcomes.strongholdLoss` | `{ tributePerRing: 5 }` (× band, as the Gate's) |
| `dominion.deeds` | `strongholdPerDepth: 2`, `counterattackHeld: 2`, `counterattackHeldBeasts: 1` |
| `autoplay.siegeHorizon` | 3 (a habit of play, and the measures' horizon) |

`land.repulseWear` (0.25) keeps its value; its comment loses "until week close".

---

## 10. Build stages

Each stage leaves `npm run typecheck`, `npm test` and `npm run check:game` passing, and is reviewed before the next.

| Stage | What | Ends with |
| --- | --- | --- |
| 1 | Measures (section 2): Breach and target labels, the G-09 scaffolding (reported "not yet built" until fallbacks exist), the 3.0.0 baseline regenerated | The baseline on the new measures |
| 2 | Sieges (section 3): wear that stays and decays, standing siege orders and the actions, flanking, the orders and realm views; the automatic player's siege pick (section 7) | Siege tests; screenshots of the siege bar and the orders panel |
| 3 | Strongholds (section 4): placement, the 2×, the bar, the `stronghold` Grand Battle and its beast host; the automatic player's challenge rule | Stronghold tests; a seeded map in `mapAscii` with strongholds marked |
| 4 | Fallbacks and counterattacks (section 5), the absence rule, led fights | Routed-enemy tests |
| 5 | Deeds and Chronicle lines (section 6); How to play | Dominion tests |
| 6 | The full simulator run against the targets; a tuning report proposing number changes, with R-25's revisit if a cadence target misses (C-32) | Rich approves the numbers (D-02); `decisions.md` D-22 to D-26 |

---

## 11. Tests and verification

New or changed tests, named after the rule they check:

- **Wear (D-22):** a repulse adds 25% of the (flanked) Assault; the week close no longer clears it; an unassaulted hex loses 10% a day (a stronghold 5%); it clears on any change of hands; it never exceeds the garrison; the hex falls on the day the worn garrison is within the Assault.
- **Standing sieges:** a day with no orders presses the standing target with the Marshal's best-matched companies and the rest defend; the player's orders for a day rule it; naming a new target replaces it; it ends on a fall, on a hex no longer assaultable at dawn, and when lifted; with none, everyone defends (A-36).
- **Flanking:** +5% per held neighbor beyond the first, capped at +20%; applies to the take and the wear; not to defenses or Grand Battles; a led assault's enemy is scaled by it.
- **Strongholds (D-23):** 8 per map, at depths 4 and 8 on each rival road (or the nearest non-village hex in that row), never a village or seam, none in the wedges, for every seed's village layout; the 2× applies only while not the player's; the bar refuses deeper march hexes for the player's assault and not seams, courtship, trade or rivals; a challenge is a `stronghold` Grand Battle with the holder's host; a challenged stronghold can't be assaulted until its battle; a loss charges 5 × band and holds the next challenge 14 days, keeping its wear; a won battle leaves no fallback.
- **Fallbacks (D-24):** a non-rout assault win falls back to a deeper same-holder hex (villages never receive beasts; Gates never receive a rival's), at 50%, then 2/3 and 1/3, gone after 3 days, stacking to +100%; a rout, militia, a mythic and a Grand Battle never fall back; the draw is deterministic per seed.
- **Counterattacks (D-24):** drawn at 30% a day in the window from week 3; announced at dawn with a band; held scatters and posts the deed; lost returns the hex at once (to the wilds or the rival) with tribute and no scorch; Grand Illusion spares it; Grace I can reclaim it; never while away 14 days or more; never in rings 0 to 2; called off for a rival under a Truce, pact or Accord; led fights include them.
- **Deeds (D-25):** a stronghold taken posts the hex deed and `strongholdTaken`; one won in battle also the Grand Battle deed; a counterattack held posts `counterattackHeld` and not `battleWon`; settling twice posts nothing new.
- **Carry-forward:** a 3.0.0 campaign fixture loads under 3.1.0 without re-founding, keeps its state byte for byte until the first 3.1 close, and settles; `needsRefounding` stays false.
- **The re-founding still holds:** the existing `refound.test.ts` passes unchanged; the same inputs give a byte-identical state; `ledger.json` is untouched.
- **Test 9 and Test 10 still hold:** settling twice changes nothing (a fallback, a counterattack and a stronghold battle included); rings 0 to 2 never change owner; no loss before week 36.
- **Performance (G-15):** `scripts/campaign-perf.ts` keeps the 365-day catch-up under 2 s, and `campaign.json` after 72 weeks stays under 2 MB.

---

## 12. Targets

**As built and tuned** (2026-10-15, [targets-3.1.0](../game/sim/targets-3.1.0.md)): every target this patch must hit or keep is met but G-09's second half, left for Patch 4 (T-05); G-05 is read at week 60 until Patch 5 (T-04, D-26).

### 12.1 Must hit (blueprint 8.2) and must keep

| # | Target | Measured as |
| --- | --- | --- |
| G-01 | Something meaningful on 5+ days a week | Player-view meaningful (Land, Grand, Build, Choice, Breach) days a week, Steadfast greedy, week 2 to the end: mean ≥ 5.0 and ≥ 70% of weeks at 5+; the strict value (without Breach) reported beside it (C-27) |
| G-02 | No dead stretches | As blueprint section 7, unchanged |
| G-03 | A target every day | Days a week with no hex that falls within 3 assault days ≤ 1; "no hex falls today" reported beside it (C-27) |
| G-08 | Defending matters | As blueprint section 7, unchanged; counterattacks are defenses |
| G-09 | Routed enemies change choices | Section 2 item 5 |
| G-13 | Grand Battles | Steadfast 1 to 3 a month, stronghold battles included |

**Keep met:** G-04, G-05, G-06, G-07 (its Patch 2 half), G-12, G-15, G-16 and G-17, each measured as `sim/targets.ts` does today.

**Not chased here:** no campaign wins within 70 weeks today. That is Patch 5's work (G-11), and Patch 3 doesn't change the endgame.

### 12.2 The slow months

Steadfast's months 3 and 6 to 7 are the stretches to fix. On 3.0.0, land changed hands on 1.3, 0.7 and 0.8 days a week, with no hex in reach on 6.3, 6.5 and 6.1 days ([targets-3.0.0](../game/sim/targets-3.0.0.md)). The report's month table gains a "no target" column (3-day horizon) and a breach column, so those months can be read directly.

### 12.3 What a scratch emulation shows

These numbers come from scratch scripts outside the repo (no game code changed). Twelve Steadfast campaigns with the greedy player, 60 weeks, rules 3.0.0, were run twice. The second run kept each repulse's wear across days and week closes (10% decay a day when unassaulted) and pressed a standing siege: a hex that falls today, else the current target, else the best within 3 assault days, else the nearest to falling. **It did not include flanking, strongholds, fallbacks or counterattacks**, so it shows what sieges alone do, not the patch's final numbers.

| Measure | 3.0.0 as built | With sieges |
| --- | --- | --- |
| G-01 strict: player-view days a week; weeks at 5+ | 4.1; 44% | 4.7; 50% |
| G-01 with Breach (C-27; in the emulation, a repulse whose target fell on the next assault on it) | — | 5.7; 81% |
| (Every siege day counted, rejected) | — | 7.0; 100% |
| (Choice as "2 targets within 3 days", rejected) | 6.9; 98% | 6.8; 98% |
| G-02: longest run of quiet days (median; worst); worst run of weeks without land | 7; 10; 8 weeks | 1; 1; 0 weeks |
| G-03: days a week no hex falls today; no target within 3 days | 3.5; 0.1 | 2.9; 0.1 |
| G-04: net hexes a week, weeks 5–52 (median); land days a week | 3.21; 3.4 | 3.31; 4.0 |
| Months 3 / 6 / 7: land days a week | 1.2 / 0.7 / 1.1 | 2.9 / 2.5 / 2.8 |
| Months 3 / 6 / 7: net hexes a week | 1.4 / 0.5 / 1.1 | 2.0 / 1.8 / 2.4 |
| G-05: the least-held rival march's unheld share at week 60 (median) | 27% | 16% |
| G-08: land lost ÷ gained | 2.4% | 7.0% |
| G-13: Grand Battles a month | 0.9 | 1.2 |
| Assault days per hex taken: 1 / 2–3 / 4+ | 89% / 11% / 0% | 61% / 28% / 11% |

A second probe (8 to 12 campaigns, 32 to 40 weeks, 3.0.0) measured what C-21 and C-23 rest on:

- In months 3 and 6, the cheapest hex the army could attack had a median garrison of 1.15× and 1.12× its best Assault (the top quarter of days: 1.37× and 1.25×), and about 9 and 18 hexes sat within 1.5×.
- That cheapest target touched 2.5 to 3.4 held hexes.
- 68% of non-rout assault wins had a deeper hex of the same holder behind them (villages excluded for beasts); 72% with villages allowed.
- In the first 8 to 10 months, 98 to 99% of those wins were against neutral garrisons (beasts and militia), not rivals: fallbacks and counterattacks will mostly be beasts' until Patch 4's rivals fight differently.

A third probe (10 campaigns, 60 weeks) gave the whole army's Assault against beasts, and the deepest rival-march depth held, by month (median): months 1 to 4: 27, 57, 72, 86 (depths 1, 2, 3, 3); months 5 to 9: 116 to 167 (depths 4 to 5); months 10 to 15: 230 to 380 (depths 7 to 9). Section 4.4 reads the strongholds' beats from it.

**Reading it:**

- Sieges alone meet G-02 and nearly double the slow months' land days.
- G-01 is met only with breaches counted (C-27), by a modest margin. Fallbacks (slower) and flanking and stronghold battles (faster) will move it either way; if it misses, C-32 applies.
- G-05 keeps its margin above 10%, but flanking is the risk (C-21 keeps it small), and strongholds work the other way.
- G-08's losses stay far below 25% of the gains.

---

## 13. Risks

- **G-01 is close.** Sieges plus breaches reached 5.7 days a week in the emulation; the full patch has forces pulling both ways. C-32 names the lever (R-25's revisit) and leaves it to Rich.
- **Measures can flatter.** C-27 rejects the two readings that would pass on any rules (every siege day; two targets within 3 days), reports the strict values beside each verdict, and records the reading as D-26 for Rich to rule on.
- **The bar can stall a focused player** (G-07) if a stronghold outpaces the army. At first contact (months 3 and 4) a depth-4 stronghold is about a two-week siege (section 4.4). A siege always ends; the Grand Battle is the faster road once the army can win it; seams, the wedges and deals stay open. The simulator watches G-07's "hexes held rising every month", and `garrisonMult` is the lever.
- **Land too fast** (G-04's ceiling of 4 a week, G-05). Flanking is small (C-21), and strongholds and fallbacks slow the deep march. Watched in the report.
- **Counterattacks and the opening.** None before week 3 (C-24), so D-14's first weeks stay a sprint. Losses are watched against G-08's 25%.
- **Rivals snipe worn hexes.** A rival's weekly den assault already counts the player's wear (C-29). Persistent wear makes that likelier; the report counts hexes rivals took while the player was sieging them.
- **Performance.** Fallback records are short-lived, and decay touches only worn hexes; G-15 is re-measured.

---

## 14. What the build changed

As in the Patch 2 spec, every departure from the text above is listed here with the reason, and Rich may overturn any of them. Findings that change no rule but bear on a call are listed too.

| # | Stage | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| S-01 | 1 | New siege rows in `docs/game/sim/report.md`'s Patch 3 section (section 2 item 6) | They are in the targets report, `targets-<ruleVersion>.md`, under "Steadfast, sieges"; the month table gains Strict, Breach, No target and No reach columns | `report.md` is T13's full tuning run, last generated on 2.2.0; Patch 2 put its measures in the targets report, which is what each patch regenerates |
| S-02 | 1 | — | Finding: under C-27's reading, **G-03 already passes on 3.0.0** (0.1 days a week with no hex that falls within 3 assault days), so its verdict no longer tells Patch 3 from Patch 2. The strict reading (3.7 days a week with no hex that falls today; 6.3, 6.5 and 6.1 in months 3, 6 and 7) is the one that shows the change, and the report keeps it beside the verdict. Breach adds only 0.1 to G-01 on 3.0.0 (3.9 against 3.8 strict), because the greedy player is rarely repulsed | Rich approved C-27 as written; this is reported, not changed |
| S-03 | 1 | — | The `assault` event carries `value` on every outcome but `revealed` (taken and rout too, not only repulses); the largest `campaign.json` grew from 1.32 to 1.33 MB (G-15's limit is 2 MB) | One field for every assault the measures and later stages read |

Stage 1 left every number in the regenerated [targets-3.0.0](../game/sim/targets-3.0.0.md) that existed before unchanged (same seeds, same rules), apart from S-03's file size.

| # | Stage | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| S-04 | 2 | `ordersValidity` builds a siege day's orders (section 3.2) | One function, `ordersFor` in `combat.ts`, gives the orders a day settles with (the player's own, else the standing siege's with the Marshal's pick from `siegeOrders`); the close, the led fights (`todaysFights`), the orders panel and the map all read it. Starting the day's fights writes a siege day's orders down, so they hold (D-12) | One reading of "today's orders" everywhere; `ordersValidity` still judges them |
| S-05 | 2 | A standing siege lapses "at dawn" when its hex can't be assaulted (section 3.2) | It lapses at the next close, before the assault, with the `standingSiege` event and the Herald's `herald.siege.lapsed`; meanwhile the panels and `ordersFor` treat it as not standing, so nothing is sent at it | `dawn()` posts no events; the player sees the same thing at the same time |
| S-06 | 2 | — | **"Use the Marshal's choice" now clears the day's orders** (`clearOrders`) instead of writing empty ones, so a standing siege is pressed and everyone else defends; it is disabled when there are no orders of the player's own | A-181 already says it "clears the day's orders"; writing empty orders would have cancelled a standing siege for the day without saying so |
| S-07 | 2 | The hex panel's assault action | It is **Lay siege** (`laySiege`): today's first assault goes at the hex with the Marshal's companies for it (a pinned defender stays home; the rest of today's orders are kept), and it becomes the standing siege | Before, it named a target with no companies, so nothing went out until the player filled the orders panel |
| S-08 | 2 | A breach tiding `herald.siege.breach` at dawn (section 8) | A repulse that breaches reads `battle.assault.breach` in place of the plain repulse line (the `assault` event carries `breach: true`); `battle.assault.repulsed` no longer says the wear lasts "until the week closes" | One line per assault, from the log, as every other result line is |
| S-09 | 2 | The automatic player's horizon is `siegeHorizon` (3) (section 7) | A steered player presses sieges on its own paths out to **`pathSiegeHorizon` 4** assault days before it takes land off them; the 3-day horizon stays for everything else | With 3, G-06 fell to 1.81× (below 2×): the old push let a steered player press its own paths for the days left in the week (about 4 on average). Measured on the 40 focused campaigns: 3 → 1.82×, 4 → 3.23×, 5 → 4.54×, 7 → 4.75×. A habit of play, not a rule |
| S-10 | 2 | — | The orders panel's target list and the estimate show the garrison with its march's preparation (`assaultGarrison`), siege wear and flanking | It showed the garrison without preparation, unlike the hex panel |
| S-11 | 2 | — | New module `sieges.ts`: the standing-siege record, wear decay, the wear cap, flanking and the siege arithmetic (`fallsWithin`, `assaultDays`), shared by `combat.ts`, `autoplay.ts` and the views | One copy of each (Conventions 12) |

**Stage 2 on its own** (strongholds, fallbacks and counterattacks not yet built; `npm run sim -- --targets` written to a scratch folder, so `targets-3.1.0.md` is not in the repo until stage 6). G-01 6.0 days a week, 87% of weeks at 5+ (strict 4.7; 50%): met. G-02 1; 2; 0 weeks: met. G-03 0.1 (strict 3.0): met. G-04 3.60 a week; 4.2 land days: met. **G-05 2%: missed** (the least-held rival march is nearly all taken by week 70; strongholds and fallbacks are the levers, stage 3 and 4). G-06 3.21×, 100% at rank V: met (with S-09). G-07 100%; 95%: met. G-08 4.2; 0.85 vs 0.35; 10%: met. G-13 1.6: met. G-15 1.46 MB; the 365-day catch-up 0.84 s and the re-founding 1.18 s (`scripts/campaign-perf.ts`): met. G-16 1.35×: met. G-17 100% (79%): met. G-12: no invariant violations, no fall before week 36. In months 3, 6 and 7 land changes hands on 3.4, 2.9 and 3.2 days a week (3.0.0: 1.3, 0.7, 0.8).

Screenshots: [the map with the siege and its hex panel](../game/screens/p3/siege-map-1280x800.jpg), [zoomed in on the siege bar](../game/screens/p3/siege-map-zoomed-1280x800.jpg), and [the orders panel with the standing siege](../game/screens/p3/siege-orders-1280x800.jpg), from a Steadfast campaign played by the automatic player to week 10 (a scratch data folder; nothing in `%APPDATA%\Fiefdom` was read or written).

| # | Stage | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| S-12 | 3 | `grandBattles.hostShare.strongholdBeasts` (section 9.1) | The beast host's share is `sieges.stronghold.beastHostShare` (0.5); the warning, the retry wait and the loss tribute are in `grandBattles` as written | `grandBattles.hostShare` is the book's Appendix B row, which its test checks key for key |
| S-13 | 3 | The bar refuses "ordering a Gate's Grand Battle" (section 4.2) | It is enforced where the player calls a battle: `challenge()` refuses (`barred`) and an assault order on a barred Gate is the `barredByStronghold` problem, not a Grand Battle request. Battles the engine raises itself go through `announceGrandBattle` as before | The same for play, and Grand Battle mechanics stay testable on their own |
| S-14 | 3 | A challenged stronghold can't be assaulted until its battle | **No hex with a Grand Battle waiting on it can be assaulted** (`grandBattlePending`): a revealed den waiting for its Mythic Hunt included, which an assault could reach before | An assault and a battle must not race for one hex |
| S-15 | 3 | — | A standing siege on a stronghold ends quietly when the player challenges it (no "lifted" line) | The player chose the battle |
| S-16 | 3 | The automatic player challenges or sieges a stronghold (section 7) | A steered player also **commits to a stronghold barring its own path, before land off it, once it is a week's siege** (`strongholdCommitHorizon` 7). Measured on the 40 focused campaigns (G-06 at week 26; G-07 hexes rising every month): always committing 3.25×, 75%; never 1.67×, 93%; within 7 days 2.27×, 95%; within 10 days 2.72×, 90%. A 1.5× garrison with always committing gave 3.33×, 78%: the stall is the habit, not the number | A habit of play, not a rule |
| S-17 | 3 | — | A led fight's host and a beast stronghold's host share one builder, `hostFromKinds` in `grand/hosts.ts` | One copy (Conventions 12) |
| S-18 | 3 | — | The map marks a stronghold with the stone-tower icon and the tooltip names the stronghold barring a hex; the hex panel offers **Call a Grand Battle** beside **Lay siege**; `mapAscii` prints `S` (`s` held) | Section 8, no new art |

**Stage 3, strongholds in** (`npm run sim -- --targets`, scratch folder). G-01 5.8; 80% (strict 4.4; 43%): met. **G-02 3; 5; 2 weeks: missed** (one campaign went two weeks without land). G-03 0.2 (strict 3.3): met. **G-04 2.87 a week: missed** (just under 3; 3.9 land days). **G-05 2%: missed.** G-06 2.19×, 95% at rank V: met. G-07 100%; 95%: met. G-08 4.4; 0.96 vs 0.39; 11%: met. G-13 1.5: met. G-15 1.41 MB; catch-up 0.82 s, re-founding 1.16 s: met. G-16 1.24×: met. G-17 99% (78%): met. G-12: none.

**For the stage-6 tuning report:** strongholds slow the middle of the campaign (G-04 3.60 → 2.87) without saving the deep march by the 70-week horizon (G-05 stays 2%: the greedy player still finishes one march, Gate and all). Fallbacks (stage 4) slow it further. G-05 is measured at the horizon because no Steadfast campaign wins within 70 weeks yet (Patch 5's work), which is later than "at Steadfast's victory". The levers to weigh, each for Rich's approval with evidence: `sieges.stronghold.garrisonMult` (1.5 makes a first-contact siege about ten days), flanking, and how G-05 is read before Patch 5 moves victory.

Screenshots: [a stronghold on the border, its hex panel offering the battle and the siege](../game/screens/p3/stronghold-map-1280x800.jpg), and [zoomed in on its mark](../game/screens/p3/stronghold-map-zoomed-1280x800.jpg) (a scratch campaign played to week 10).

| # | Stage | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| S-19 | 4 | A counterattack is drawn at each dawn of its window (section 5.2) | Each fallen force draws once per dawn and keeps the result (`drawnThrough`): a dawn redone at a later launch changes nothing, and a draw skipped while the player was away stays skipped for that day | Settle once (Conventions 5); the tidings are fixed at dawn (A-28) |
| S-20 | 4 | — | A force whose refuge changes hands by any other means (a rival's expansion, a courtship) scatters at the next dawn | It has nowhere left to stand |
| S-21 | 4 | Beasts fall back to a neutral non-village, non-mythic hex; a rival's to his hex that isn't a Gate, capital or realm hex (section 5.1) | Also never to a Lair Mouth, and only to a claimable hex | The same hexes a daily assault may reach |
| S-22 | 4 | Herald lines `herald.fallback`, `herald.counterattack`, `battle.counterattack.held` / `.lost` (section 8) | `herald.fallback`, `herald.threat.counterattack` (the dawn tiding, as for every threat), and `battle.counterattack.victory` / `.rout` / `.defeat` (the defense report, as for every threat) | The existing threat and report lines are keyed by threat kind and outcome |
| S-23 | 4 | — | The simulator's recorder takes the automatic player's plan, so G-09 asks `pickAssault` for the day's target with and without the last close's fallbacks | Section 2 item 5 |

**Stage 4, fallbacks and counterattacks in** (`npm run sim -- --targets`, scratch folder). G-01 5.7; 79% (strict 4.4; 41%): met. **G-02 2; 4; 2 weeks: missed.** G-03 0.2 (strict 3.2): met. **G-04 2.99 a week: missed** (3.9 land days). **G-05 2%: missed.** G-06 2.21×, 96%: met. G-07 100%; 96%: met. G-08 4.1; 0.80 vs 0.38; 11%: met. **G-09 57%; 4%: missed.** G-13 1.5: met. G-15 1.46 MB; catch-up 0.82 s, re-founding 1.15 s: met. G-16 1.23×: met. G-17 98% (80%): met. G-12: none. Fallbacks come 1.8 a week, counterattacks 1.16 a week, and every one is held.

**Findings for the stage-6 tuning report (both are Rich's call):**

1. **Fallbacks rarely change choices.** On 40-week runs (8 seeds each) 66 to 69% of non-rout wins leave a fallback (at 70 weeks 57%: deep in rival land there is often no refuge short of the Gate), but the next day's target changes on only 1 to 3% of the dawns after one, for the greedy player and for focused ones alike. A force falls back deeper (R-10), where the automatic player, picking by Dominion per garrison point, rarely meant to go next. Levers: where the force goes (the cheapest deeper hex, the one most likely to be next, rather than a seeded one; or, against R-10's "the next hex deeper", any hex of the march beside the one taken), its share (C-23: 0.5), its days (3); or reading G-09 against the standing siege (did the fallback land on the hex being besieged?).
2. **Counterattacks never succeed.** None of the 943 fought in the probe runs was lost: half the beaten garrison, fading, never matches the Defense of the companies left home. R-10's "more fights defending what I already hold" happens (G-08's matched-or-worse defenses stay above 4 a week) but never costs land. Levers: the counterattack's strength (C-24: the force's strength that day; for example the whole beaten garrison, or not fading), its chance (0.3).

| # | Stage | The spec said | The build does | Why |
| --- | --- | --- | --- | --- |
| S-24 | 5 | Chronicle lines `chronicle.deed.strongholdTaken` and `chronicle.deed.counterattackHeld` (section 6) | `herald.deed.strongholdTaken` and `herald.deed.counterattackHeld`, beside Patch 2's deed lines | Every deed line is `herald.deed.<deed>`, read by `resultLine` from the `deed` event; there is no `chronicle.*` namespace |
| S-25 | 5 | — | The simulator's recorder sums the Renown posted by deed kind (`deedMix`), and the targets report gains a **Renown by deed** table for Steadfast and the one-path players | Section 6's size check, measured rather than estimated |
| S-26 | 5 | How to play: sieges, standing orders, flanking, strongholds, fallbacks and counterattacks (section 8) | A new section, **Sieges and strongholds**, with every number read from `RULES` and the deed values; the counterattack chance is never stated. Four older lines are corrected: the orders ("If you set nothing … nothing is assaulted"), the assault and the garrison (wear "until the week closes") and the order of the day's battles (counterattacks after conquest attempts); Battles and Hex conditions point to the new section | Those lines stopped being true in stages 2 and 4 |
| S-27 | 5 | — | **A bug fix, found by this stage's targets run.** A Grand Battle's id was `gb-` + the list's length + 1, but battles leave the list (a Siege called off when its Ultimatum lifts, a resolved rival's battles), so the next battle could take the id of one still on it. Looking it up then found the older battle, so the new one was never fought and stayed pending for good, and while it waited the automatic player called no other battle. Ids now run one past the highest number on the list (`nextBattleId`). A save that already shares one has the later battle renamed at the next close, where it is fought (`uniqueBattleIds`). The dev invariants gain no. 7 (every battle has its own id; none is left unfought past its day), so G-12 catches it | In Steadfast seed 30 a stronghold challenge took the id of a warhost battle fought twelve days before, and was never fought. From week 68 the player held everything it could reach: 16 days with nothing, G-02's worst. The code predates Patch 3; stronghold challenges made it likelier. No number changes |

**Stage 5, the deeds in** (`npm run sim -- --targets`, scratch folder, with S-27). G-01 5.7; 78% (strict 4.4; 41%): met. **G-02 3; 4; 1 week: met** (before S-27, 3; 16; 1 week: seed 30's stuck battle). G-03 0.2 (strict 3.2): met. **G-04 2.98 a week: missed** (3.9 land days). **G-05 2%: missed.** G-06 2.35×, 94% at rank V: met. G-07 100%; 98%: met. G-08 4.1; 0.80 vs 0.37; 11%: met. **G-09 57%; 4%: missed.** G-13 1.5: met. G-15 1.49 MB: met. G-16 1.22×: met. G-17 98% (79%): met. G-12: no violations, invariant 7 included. Counterattacks 1.14 a week, all held.

**The Renown mix** (the new table): the new deeds come to 6 to 7% of the Renown posted (a stronghold taken 2 to 3%, a counterattack held 3 to 4%), within section 6's size check. Hexes come to 67% for Steadfast and 59% for the one-path players, and battles 33% and 41%. That straddles P2-13's 50 : 30 once resolution is set aside: no rival is resolved by week 70 yet (Patch 5's work), so its 15 to 20% doesn't show. G-06 rose from 2.21× to 2.35× and G-17 holds.

**Carried to stage 6:** the routed-enemy options (findings 1 and 2 above: where a fallen force goes, its share and days, and the counterattack's strength and chance), each with simulator evidence for Rich's call, beside the stronghold and G-05 levers from stage 3.

Screenshot: [How to play's new section](../game/screens/p3/guide-sieges-1280x800.jpg).

---

## 15. Tuning report (stage 6)

**Rich approved T-01 to T-05 as recommended on 2026-10-15, and they are built (section 15.7).**

Written 2026-10-15. **Nothing in `rules.ts` has changed (D-02):** each T-item below is a proposal for Rich, with the simulator's evidence. Every number in this section comes from a run on the same seeds as [targets-3.1.0](../game/sim/targets-3.1.0.md). The proposals were tried in scratch copies (rule values patched in memory as `sim/overrides.ts` does it; the placement and strength variants in a scratch copy of the code), so the repo holds only the as-built report. "Full" means the whole targets plan (340 campaigns, 70 weeks); "screen" means Steadfast greedy alone (40 campaigns), which carries G-01 to G-05, G-08, G-09 and G-13.

### 15.1 Where 3.1.0 stands

[targets-3.1.0](../game/sim/targets-3.1.0.md), as built: **G-01, G-02, G-03, G-08 and G-13 met** (every target this patch must hit except G-09), and G-06, G-07, G-12, G-15, G-16 and G-17 kept. **Missed: G-04** (2.98 hexes a week; the band is 3 to 4), **G-05** (2% of the least-held rival march unheld at the 70-week horizon) and **G-09** (a fallback after 57% of non-rout wins; the next day's target changed on 4% of the dawns after one). Counterattacks: 1.14 a week, none ever lost.

**R-25's revisit is not needed (C-32):** G-01, G-02 and G-03 are all met with one assault a day.

### 15.2 Proposals

| # | Lever | Now | Proposed | What it buys | Rich's ruling it touches |
| --- | --- | --- | --- | --- | --- |
| T-01 | `sieges.stronghold.garrisonMult` | 2 | **1.75** | G-04 met (3.23 alone; 3.28 with T-02 and T-03). In a probe with them, the first stronghold falls at week 31, not 39, and stronghold battles are lost 2 times in 10, not 14 in 20 | P3-01's "a 2× garrison" |
| T-02 | Where a beaten garrison falls back | A deeper neighbor, drawn by seed | **A neighbor at the same depth or deeper, the cheapest to assault** (ties by hex id) | G-09's first half met (68%); its second half 4% → 11% | R-10's "to the next hex deeper" |
| T-03 | A counterattack's strength | The force's strength that day | **× 1.5** (new `sieges.counterattack.strengthMult`) | 6% of counterattacks succeed (none do now); G-08 kept | — (C-24 was Claude's call) |
| T-04 | How G-05 is read until Patch 5 | At the 70-week horizon | **At week 60**, the middle of G-11's Steadfast victory window (58 to 64), with the horizon value beside it | G-05 met (13% with T-01 to T-03; 20% as built) | G-05 (blueprint section 7) |
| T-05 | G-09's second half (20% of choices changed) | — | **Leave it missed for Patch 3 and revisit it in Patch 4** | See 15.4 | G-09 (blueprint section 7) |

**Kept as built**, with the evidence for keeping them: flanking (5% a neighbor), the counterattack chance (30%), the fallback's share (50%) and days (3), the stronghold's beast host (0.5 × its garrison), and the automatic player's horizons (S-09, S-16).

### 15.3 The package together (T-01 to T-03; full)

| Target | 3.1.0 as built | **T-01 to T-03** | The same with strongholds at 1.5× |
| --- | --- | --- | --- |
| G-01 meaningful days (strict) | 5.7; 78% (4.4; 41%) | 5.9; 83% (4.5; 46%) | 6.0; 86% (4.7; 48%) |
| G-02 quiet days; weeks without land | 3; 4; 1 week | 2; 4; 1 week | 2; 4; 1 week |
| G-03 days with no target (strict) | 0.2 (3.2) | 0.2 (3.1) | 0.1 (3.0) |
| **G-04** net hexes a week; land days | **2.98 ✗**; 3.9 | **3.28**; 4.0 | 3.53; 4.1 |
| G-05 at the 70-week horizon | 2% ✗ | 2% ✗ | 2% ✗ |
| **G-05 at week 60 (T-04)** | 20% | **13%** | **9% ✗** |
| G-06 focused path at week 26; rank V | 2.35×; 94% | 2.80×; 99% | 2.99×; 99% |
| G-07 Tier III by week 26; land rising | 100%; 98% | 100%; 96% | 100%; 95% |
| G-08 bad vs good weeks; lost ÷ gained | 0.80 vs 0.37; 11% | 0.85 vs 0.41; 11% | 0.84 vs 0.41; 11% |
| **G-09** fallback share; choices changed | **57% ✗; 4% ✗** | **68%; 11% ✗** | 67%; 11% ✗ |
| G-12 violations; falls before week 36 | 0; 0 | 0; 0 | 0; 0 |
| G-13 Grand Battles a month | 1.5 | 1.5 | 1.6 |
| G-15 largest save | 1.49 MB | 1.49 MB | 1.54 MB |
| G-16 neglect | 1.22× | 1.23× | 1.25× |
| G-17 the path tells the story | 98% (79%) | 99% (82%) | 100% (82%) |
| Fallbacks a week; counterattacks a week; lost | 1.7; 1.14; 0% | 2.2; 1.46; 6% | 2.3; 1.54; 6% |
| Held at the end of months 12 and 17 (median) | 167.5; 244 | 172; 251.5 | 187; 258 |
| Renown: a stronghold taken; a counterattack held | 3%; 4% | 3%; 5% | 4%; 5% |

With T-04, the package meets every target this patch must hit or keep **except G-09's second half**. Strongholds at 1.5× make G-04 safer (3.53) but G-05 at week 60 then misses (9%); 1.75× is the setting where both hold. G-04 and G-05 pull against each other: the map has 298 claimable hexes (58 to 59 in each rival march), and at 3 hexes a week from week 5 Steadfast holds nearly all of it by week 70, so G-05 can't hold at the 70-week horizon while G-04 does.

### 15.4 The evidence, lever by lever

**T-01 Strongholds** (full; each alone, the rest as built):

| `garrisonMult` | G-02 | G-04 | G-06 | G-07 | G-17 |
| --- | --- | --- | --- | --- | --- |
| 1.5 | 2; 4; 1 week | 3.54 | 3.10×; 100% | 100%; 95% | 100% |
| 1.75 | 2; 4; 1 week | 3.23 | 2.95×; 98% | 100%; 99% | 100% |
| **2 (as built)** | 3; 4; 1 week | **2.98 ✗** | 2.35×; 94% | 100%; 98% | 98% |
| 2.5 | **3; 4; 2 weeks ✗** | 2.91 ✗ | **1.74× ✗**; 83% | 100%; 95% | 95% |

How the strongholds fall (a probe of 12 Steadfast campaigns each, to week 70):

| | 2× (as built) | 1.75× with T-02 and T-03 |
| --- | --- | --- |
| First depth-4 stronghold taken (median week; range) | 39 (34 to 47) | 31 (24 to 42) |
| First depth-8 stronghold taken (median week) | 58 | 56 |
| Stronghold takings by week 70, a campaign | 6.0 | 7.5 |
| By siege (assault days: median; longest) | 66 (3; 9) | 82 (2; 10) |
| By Grand Battle | 6 | 8 |
| Stronghold battles fought; lost | 20; **14** | 10; 2 |

Section 4.4 expected first contact in months 3 and 4 with about two weeks of siege. In play the greedy player doesn't hold a long siege: it presses a hex only once it falls within 3 assault days, and until then it takes land elsewhere. So the depth-4 bar holds each rival march at depth 3 until about week 39, and a stronghold that does fall takes 1 to 3 assault days. Its battles go badly at 2×: the stronghold's host beats the army 14 times in 20. At 1.75× the bar lifts about two months sooner and the battles are mostly won. A human player who holds a two-week siege takes strongholds earlier than this; the targets measure the automatic player.

**T-02 Where the force falls back** (screens; strength as built):

| Placement | G-04 | G-09 share; changed | Fallbacks a week |
| --- | --- | --- | --- |
| **A deeper neighbor, by seed (as built)** | 2.98 | 57%; 4% | 1.7 |
| The cheapest deeper neighbor | 2.98 | 57%; 5% | — |
| The same depth or deeper, by seed | 3.07 | **68%**; 7% | — |
| **The same depth or deeper, the cheapest** | 2.99 | **68%**; 12% | 2.2 |
| The same depth or deeper, by Dominion per garrison point | 3.02 | 67%; 11% | — |

Deeper-only leaves 43% of non-rout wins without a fallback (a village's militia never falls back, and many hexes have no deeper neighbor of the same holder), which caps G-09's share below 60%. Allowing the same depth meets it and lifts changed choices to 7%. Choosing the cheapest refuge rather than a seeded one lifts them to 12%, because it puts the force where the player is likelier to go next; it also drops the `fallback:` draw. R-10 says the force falls back "to the next hex deeper", so T-02 needs Rich's word on that ruling.

**T-03 Counterattack strength** (screens; placement as built):

| Strike strength | Counterattacks lost | G-08 bad vs good weeks | G-08 lost ÷ gained | G-04 |
| --- | --- | --- | --- | --- |
| **× 1 (as built)** | 0% | 0.80 vs 0.37 (2.2×) | 11% | 2.98 |
| × 1.25 | 1% | 0.79 vs 0.38 (2.1×) | 11% | 2.98 |
| × 1.5 | 5% | 0.83 vs 0.42 (2.0×) | 12% | 2.97 |
| × 1.75 | 14% | 0.95 vs 0.47 (2.0×) | 13% | 2.98 |
| × 2 | 23% | 1.00 vs 0.58 (1.7× ✗) | 15% | 2.95 |
| × 3 | 59% | 1.31 vs 1.02 (1.3× ✗) | 24% | 2.90 |
| × 2, not fading | 54% | 1.33 vs 0.97 (1.4× ✗) | 23% | 2.88 |
| The whole beaten garrison falls back (share 1) | 22% | 1.00 vs 0.57 (1.8× ✗) | 15% | 2.93 |
| Chance 50% a day | 0% | 0.80 vs 0.35 (2.3×) | 10% | **3.13** |

As built a counterattack is half the beaten garrison, fading, against the companies left home, and it never wins: it's a free spoils fight. G-08's "bad weeks lose at least twice what good weeks lose" is the limit on strength. Counterattacks come after conquests, and conquests come in good weeks, so their losses land on good weeks as much as bad ones and flatten that ratio. ×1.5 keeps it (2.05× in the package's full run; ×1.75 fell to 1.85× there). A raised chance makes the realm faster, not harder: a force that strikes leaves its refuge, and a held strike pays spoils.

**T-04 G-05's reading.** No campaign wins within 70 weeks yet (G-11 is Patch 5's), so "at Steadfast's victory" falls back to the horizon, which is later than any victory Patch 5 aims for. The least-held rival march's unheld share at week 60 (median, full runs): 20% as built, 13% with T-01 to T-03, 9% with strongholds at 1.5×. A 60-week run plays its first 60 weeks exactly as a 70-week run does (months 1 to 14 identical), so the reading can come from the regular run. It would be a `Measures` field (the unheld shares at week 60) and G-05's row reading it, with the horizon value shown beside it; Perfect's half is unchanged.

**T-05 G-09's second half.** Across nine placements, shares, windows and strengths, the next day's target changed on 3 to 12% of the dawns after a fallback. The cause is the greedy player's breadth. On most days it can take two or more hexes (Choice), and it picks by Dominion per garrison point across the whole frontier, so a force falling back beside the hex just taken is rarely on the hex it meant to take next. A larger force (share 1) didn't raise it either; it only made counterattacks win. Options for Rich:
- (a) **Leave it missed for Patch 3 and revisit it in Patch 4** (recommended). In the first 8 to 10 months, 98 to 99% of the player's wins are against neutral garrisons (section 12.3); when the rivals fight differently (G-10), a rival's force falling back into his own line may change choices more.
- (b) Lower G-09's bar to 10%. That is a blueprint target change.
- (c) A different shape, not built or measured: a fallen force joins the defense of the hex under the player's standing siege, when it is adjacent. That would be a new rule beside R-10.

**Kept as built:**
- **Flanking** (full): at 0, G-04 falls to 2.77 and G-06 to 1.91×; at 10% a neighbor G-04 rises to 3.40 but G-16 falls to 1.19× (✗).
- **The fallback's share and days** (R-10's "about 50%" and "about 3 days"): share 1 breaks G-08 (above); 5 days gave G-09 nothing (12%).
- **The counterattack chance** (30%): 50% raises G-04, but T-01 already meets it.

### 15.5 Other findings

- **S-27's stuck battle** froze seed 30 before the fix; with it, G-12's invariant 7 finds no Grand Battle unfought past its day in any of the 340 campaigns, in every run above.
- **Rivals sniping worn hexes** (section 13's risk) barely happens: in the probe, 3 of 90 rival takings (as built) and 0 of 85 (the package) were of a hex the player had assaulted in the week before.
- **The Renown mix** (S-25): the new deeds are 7 to 9% of Steadfast's Renown in every run above. With resolution set aside (no rival is resolved by week 70), hexes to battles run about 67 : 33 for Steadfast and 58 : 42 for the one-path players, around P2-13's 50 : 30.

### 15.6 Once Rich rules

For each T-item approved: the value in `rules.ts` (T-01, T-03) or the code (T-02 in `fallbackFrom`, T-04 in `sim/measure.ts` and `sim/targets.ts`), with tests. Then How to play's fallback line is updated for T-02, `targets-3.1.0.md` regenerated, and the spec's sections 4 and 5 marked. Then D-22 to D-26 go into `decisions.md` with the final numbers, and A-36, A-139, A-110, A-155 and A-181 are marked changed (section 9). The rules stay 3.1.0: nothing has been released on 3.1.0.

### 15.7 Built (2026-10-15)

- **T-01:** `RULES.sieges.stronghold.garrisonMult` 1.75. The hex panel's stronghold tooltip reads the multiple from the rules (it said "twice").
- **T-02:** `fallbackFrom` in `combat.ts` takes refuges no shallower than the hex lost and picks the cheapest by `assaultGarrison`, ties by hex id; the `fallback:` seeded draw is gone. How to play and the hex panel's fallback tooltip say so.
- **T-03:** `RULES.sieges.counterattack.strengthMult` 1.5, applied where a strike is drawn (`fallbacksAtDawn`).
- **T-04:** `sim/measure.ts` records each march's unheld share at the week-60 close (`week60Unheld`, `G05_WEEK`), and G-05's row reads it when a campaign has no victory, the end's value beside it.
- **T-05:** nothing built; G-09 stays reported, and missed, as measured.
- Tests: `fallbacks.test.ts` (the cheapest refuge no shallower, and passed over when dearer; the strike's × 1.5) and `simMeasures.test.ts` (G-05's week-60 reading, at victory, and short of week 60). 733 tests, typecheck and check:game pass.
- **[targets-3.1.0](../game/sim/targets-3.1.0.md) regenerated** on the approved rules. It matches the scratch run of the package line for line, but for G-05: G-01 5.9; 83% (strict 4.5; 46%); G-02 2; 4; 1 week; G-03 0.2 (strict 3.1); G-04 3.28; 4.0; **G-05 15%** at the week-60 close (2% at the end; the scratch figure of 13% was read three days later, at a 60-week run's end); G-06 2.80×; 99%; G-07 100%; 96%; G-08 4.1; 0.85 vs 0.41; 11%; **G-09 68%; 11% (missed, T-05)**; G-12 0; 0; G-13 1.5; G-15 1.49 MB; G-16 1.23×; G-17 99% (82%). 2.2 fallbacks and 1.46 counterattacks a week; 6% of counterattacks lost.
- **`decisions.md`:** D-22 (sieges), D-23 (strongholds), D-24 (routed enemies, R-10 as amended), D-25 (the deeds) and D-26 (how the targets count Patch 3); A-36, A-110, A-139, A-155 and A-181 marked changed.
