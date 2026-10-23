# Patch 6 spec: catch-up figures, Dawn tidings, Respect by rival, a realm that moves by the day

Written 2026-10-18. **Status: approved as drafted by Rich on 2026-10-18, with the Orc's +75 perk as P6-07 (a)** ("Approved as drafted, with the Orc's +75 perk as (a): his beaten forces no longer strike back at their first dawn."). Rich's decisions of 2026-10-18 are in [section 1.1](#11-what-rich-decided-2026-10-18), with his words. What was still his to answer is in [section 1.2](#12-open-questions): P6-08, answered after the simulator run (T-09 (a), D-51). The tuning report's T-10 was probed and taken at a 5-point buffer (D-52, rules 3.4.1, [section 12.5](#125-rules-341-the-standing-buffer-at-5-2026-10-19-d-52)). Every further rule Claude settled is a call, C-74 onward ([section 1.3](#13-claudes-calls)); Rich may overturn any of them. Every earlier number or rule this patch changes is an N-item ([section 1.4](#14-earlier-numbers-and-rules-this-patch-changes-d-02)). The build's own changes go in [section 12](#12-what-the-build-changed), and number changes from the tuning stage still come to him (D-02).

This spec carries out Rich's three requests of 2026-10-18 and what followed from talking them through:
1. a figure for what the rest of the week needs to get back on pace, for steps and for calories;
2. a pop-up of the Herald's dawn tidings the first time the app opens each day, with a new picture of the Herald;
3. Respect marks that follow each rival's personality, and, from that talk, standings and some of the rivals' moves read by the day rather than the week.

It builds on Patch 5 as committed on `patch-5` and fast-forwarded to `master` (`d0b0e7a`, rules 3.3.0; [Patch 5 spec](patch-5-spec.md) with its section 11).

Every new number is a first guess marked TUNE. It lives in `rules.ts` or the codex, and the simulator reports on it (D-02: the simulator never retunes, and Rich approves each change).

Paths: game modules are in `src/renderer/src/lib/game/`, the simulator in `sim/`, tests in `tests/game/`.

**What this spec keeps.** Everything Patch 5 built, except where this spec says otherwise:
- the bent marches and their migration (D-37, D-38);
- Respect's track from −100 to +100, its start at 20 and every driver of D-39 (what moves Respect is unchanged; only the marks move);
- the length: the pacing at 16 and 12, the Dragon from week 40, Accord talks at 55 (D-41, D-43);
- the contract slot without a queue (D-45);
- the raider draw, conquest planning, rival income, army buying, special spending, courtships, coalitions, the event deck, Ascendancy and every week-counted rule, all weekly as today.

The Ch 16 guardrails stay. No hidden value is shown as a number.

---

## 0. The patch in short

- **Catch-up figures (P6-01; screens only).** Under the Chronicle's "This week" bars, on today's page:
  - "About 1,950 a day for the 3 days left brings the week's average back to 2,250." with what today has logged so far;
  - "About 8,000 steps a day for the 3 days left fills the week's pool (5,200 more today)."
  - The calorie figure is never under the Healer's floor. When the week is on pace it shows no figure.
- **Dawn tidings (P6-02; screens only, one new art slot).** Once a game day, the first time the app opens on it, a card shows the Herald's tidings and today's figures, after any "While you were away" or big-moment card. Settings can turn it off. The picture is a new slot, `moment.dawnTidings`; Claude writes its prompt and Rich generates it with Codex, as with the other art.
- **Respect marks by rival (P6-03, P6-04).** Each rival's marks move with his personality, by at most 15 points, on Rich's table (section 4.1). The Orc and the Dwarf never sell the player a hex, and the Orc sends no envoys. The Accord marks stay shared, so the campaign's length shouldn't move. The Orc's new perk at +75: his routed forces no longer strike back for certain at their first dawn (P6-07 (a)).
- **Daily standings (P6-05).** Peace, Tension and War are read from Respect at every day's close, not only at the week close. Peace stops a rival's raids from the next dawn.
- **The realm moves by the day (P6-06).** Four of the rivals' weekly moves land day by day, with the same dice and the same weekly count:
  - wars between rivals settle each day's skirmish at its own close;
  - stances are read every day;
  - a rival's land grab is chosen at the week close and taken on a set day that week;
  - the walls facing the player go up at the close, the rest a few levels a day.
- **Conquest attempts planned on the day a rival goes to War (P6-08, T-09).** Built behind a rule switch, measured off against on, and switched on at Rich's decision after the run (D-51).
- **Rules 3.4.0, carried forward in place.** No migration. The new state is optional (section 7).
- **Build order:** the two screens first, which change no rule and can be installed on their own; then the marks and daily standings; then the daily moves; then the simulator run and its tuning report (section 8).

---

## 1. Decisions

### 1.1 What Rich decided (2026-10-18)

| # | Decision | Rich's words |
| --- | --- | --- |
| P6-01 | **Catch-up figures** for steps and calories, as Claude proposed: the gap spread over the days left, never a calorie figure under the Healer's floor, no figure when on pace (section 2) | "Some kind of indicator of what calorie goal or step goal i would need to hit to get back on pace. Like (1950 calories will get you to the 2250 average mark you need) or (8000 steps to hit goal)" |
| P6-02 | **A Dawn tidings pop-up** on the first open of the day, with an asset of the Herald reading the tidings (section 3) | "Can we add a pop-up for the first log-in of the day that gives the Heralds updates? Maybe we could even create an asset for a picture of a herald reading the Dawn tidings?" |
| P6-03 | **Respect marks by personality**, without much tuning: the table of section 4.1 | "can we make the respect thresholds act more accordingly to the Rivals personality?"; then, of the revised table, "I like the new table proposal" |
| P6-04 | **The Orc and the Dwarf never sell the player a hex; the Orc has no envoys** | "I don't think orc or dwarf should ever sell you hexes, dwarf because he wouldnt sell his people, orc because he would never give you ground. Envoys also feel weird for the orc." |
| P6-05 | **Standings read daily**, following Respect, with nothing kept from the old lines (section 5) | "Standings should be reset daily not weekly." |
| P6-06 | **Fronts, stances, land grabs and walls by the day**; daily conquest planning measured before he decides (section 6) | "Put the fronts, stances, land grabs and walls in the spec, and measure daily conquest planning in the simulator run before I decide on it." |

### 1.2 Open questions

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| P6-07 | **The Orc's own perk at +75.** His perk was his envoy fighting for the player at no fee (P5-07); P6-04 takes his envoys away | (a) **Beaten fairly, they yield.** In his march, a force the player routed no longer strikes back at its first dawn for certain (`personalities.orc.firstDawnChance` 1). It strikes at the common chance, 30% a day (`sieges.counterattack.chancePerDay`). (b) **His raids 20% weaker** from +75, on top of nothing else (his 10% at 25 becomes 20%) | **(a).** It turns his own march rule (D-28, N-02), and it fits a warlord who respects strength: once he respects the player, a beaten band of his doesn't rush back. (b) is simpler but says nothing about him. **Decided (Rich, 2026-10-18): (a).** |
| P6-08 | **Conquest attempts on the day a rival goes to War** | Decided after the simulator run (T-09, section 6.5); the run is in [section 12.4](#124-stage-4-the-run-and-the-report-2026-10-18) | T-09 (a). **Decided (Rich, 2026-10-18): (a), switched on (D-51).** |

### 1.3 Claude's calls

**Rich may overturn any of them.**

| # | Call | Why |
| --- | --- | --- |
| C-74 | **The catch-up figure spreads the gap over the days left, today included, and assumes each is logged.** It never shows a calorie figure under the Healer's floor, with or without medical supervision; when the week is on pace it shows no figure, only "On pace" | One hard day is harder to keep than a few gentler ones, and a figure under the floor would be unsafe and would score as over budget anyway (A-41). Showing a figure while under the limit would invite eating up to it |
| C-75 | **Rounding:** the calorie figure down to the nearest 10 kcal (so keeping it keeps the average), never under the floor; the step figure up to the nearest 100 | The figure should never fall just short of the mark |
| C-76 | **The figures show only for today** (the open campaign day), on the Chronicle and in the Dawn tidings. A past day's page shows the bars as now | A figure for a day already closed means nothing |
| C-77 | **Respite days leave both figures**, as they leave the score (Ch 4 rule 4) | The figure reads the week the way the score does |
| C-78 | **The Dawn tidings show once per campaign day**, the first time the app opens on it. The game day turns at 4 AM, so opening at 1 AM still belongs to the day before. The card waits until no Homecoming, big-moment card, founding wizard or re-founding offer is open. It is marked seen when dismissed, so a launch that closes before dismissing shows it again | One card a morning, never over another |
| C-79 | **Where the seen day and the switch live:** the app's browser storage (`localStorage`, as the portrait's seen note does, `state/playerPortrait.ts`), not `campaign.json` or `ledger.json`. Every read and write is guarded: if storage fails, the card shows and nothing breaks | Neither is game state, and neither belongs in the health ledger |
| C-80 | **The card adds no narrative words.** Its lines are the Herald's catalog lines (`heraldView`); "Dawn tidings", its section headings and its buttons are interface labels | Code never invents the words (A-46) |
| C-81 | **The art slot is `moment.dawnTidings`, 1920 × 1080** (the big-moment size), shown as a wide band across the top of the card. Until its file exists, the slot's placeholder shows. Claude writes the prompt (section 3.4); Rich generates it with Codex's image tool, as he did the other art (A2) | Claude can't generate images here. A 16:9 picture can also serve a full card later; the prompt keeps the subject in the middle third so the band crop holds |
| C-82 | **What stays shared:** the Accord marks (talks 55, easier 75, signed 100); the Lost Heir's 50; the coalition gates (betrayal from 50, the buy-out from 40, refusing the Last Alliance from 60); Ugrak's Challenge from 50; the Goblin buying the player's hexes at any Respect; the raids' ×0.9 and ×1.1; a Truce at any Respect (C-63) | The Accord marks set the campaign's length, which Patch 5 just tuned (D-43). The rest aren't personality marks |
| C-83 | **One per-rival table, `RULES.respect.marks`**, with `null` for "never". One helper, `marksFor(rival)` in `respect.ts`, replaces every read of `respect.thresholds`, `respect.standing`, `respect.raidsStrongerAt` and `respect.own` (in `respect.ts`, `rivals.ts`, `land.ts`, `combat.ts`, `world.ts`, `view/diplomacy.ts`, `HowToPlay.tsx` and the dev scenarios) | One source per rival; no second copy of a threshold (Conventions 12) |
| C-84 | **An Orc envoy in the open day's orders when 3.4 first runs is dropped at that day's close, with no fee**, as `envoyAvailable` already filters | The live campaign may hold one |
| C-85 | **The standing is read at every day's close** by a new day phase after the day's battles. It is still read in the rival turn's step 7 at a week close (after the weekly drivers), and at once when a rival joins a coalition, as now. `RivalState.disposition.player` keeps it; the `disposition` event posts on each change | Respect already moves daily with the battles; only the standing waited for the week |
| C-86 | **The raider draw and conquest planning stay weekly** (A-28, A-146). Peace stops a rival's raids from the next dawn (A-132 turns his drawn raids into beasts). Tension or War that starts mid-week brings his raids from the next week's draw, and his conquest attempts from the next close (unless P6-08 changes that) | A daily raider draw would rework the threat schedule, which is real tuning |
| C-87 | **No buffer against a standing flipping on a line.** The run counts the flips (section 9); a buffer comes to Rich as a proposal only if they churn | A raid beaten is +3 and lost −2, so a court on a line can flip; whether it does is a measure, not a guess |
| C-88 | **New Herald placeholders**, plain facts under "Across the realm", for Rich to write (A3): `herald.standing.peace`, `herald.standing.tension`, `herald.standing.war` ("{rival} is now at Peace with you.", and so on) and `herald.rival.grab` ("{rival} took {hex}."). Patch 5's deferred standing lines (S-53) land here. The catalog's existing `herald.front.*` lines, which no screen shows today, are shown too | A daily standing that changes without a word would go unnoticed; a land grab and a front's turn today are told only by the map, or not at all |
| C-89 | **Fronts:** each day's skirmish settles at that day's close, with the same seeded draw on its own day (`skirmish:<front>`). The 5% war cost and the next week's front draw stay at the week close. Emboldened and Humbled then act from the next dawn instead of the next week | The skirmishes are already drawn a day apart (A-153); only their settling waits |
| C-90 | **Stances:** the band is read at each day's close, from week 16 as now (D-33). Offers, lapses and the pacing stay at the week close | The band is a reading; the offers carry the pacing |
| C-91 | **Land grabs:** at the week close the rival chooses his den by today's rule (A-25) and a seeded day 1 to 7 days later (`rival:<id>:grab:<i>`). At that day's close it is checked again: still neutral, still touching his land, not mythic, and 0.5 × his AV that day × the roll ≥ its garrison then. Otherwise it is called off. Village bids are unchanged | The same one grab a week (the Goblin two), from the same rule; the player's assault that day comes first |
| C-92 | **Walls:** bought at the week close from the same budget, in the same order. The levels on hexes facing the player, and the Dwarf's wild walls (D-30), go up at the close as now. The rest go up over the next 6 day closes, the same number each day (rounded up), in that order. A level whose hex he no longer holds is dropped; the money stays spent | The walls the player's assaults meet keep today's timing; the rest rise on the map day by day |
| C-93 | **Daily conquest planning is built behind `RULES.rivalAi.planConquestOnWar`, off.** On, a rival who goes to War at a day's close plans his conquest attempts at once, by A-146's rule, striking 2 to 7 days later, counted against that week's allowance (`conquestPlansPerWeek` plus his extra, so never more a week than today) | The run measures it through `sim/overrides.ts`; switching it on is one line if Rich takes it |
| C-94 | **Rules 3.4.0**, carried forward in place; `campaign.ruleVersion` stays the founding version. No migration; the new state is optional | A major bump would force a re-founding (`needsRefounding`) |

### 1.4 Earlier numbers and rules this patch changes (D-02)

Each is reported with simulator evidence in the tuning stage.

| # | What | Was | Becomes | Decided by |
| --- | --- | --- | --- | --- |
| N-16 | Each rival's marks (D-39, P5-07) | Shared: War −25, raids stronger −50, his own detriment −75, raids weaker 25, pacts 40, Peace 50, envoys 50, calls to arms 60, his own perk 75 | **By rival** (section 4.1), each within 15 points of the shared line | Rich, P6-03 |
| N-17 | Hexes sold to the player (Ch 12, A-142) | Every rival but the Goblin, at 50 | **The Archmage alone**, at 50; the Orc and the Dwarf never; the Goblin's hexes are still bribed (C-43) | Rich, P6-04 |
| N-18 | Envoys (A-20, P5-07) | Every rival at 50; the Orc's at no fee from 75 | **The Goblin at 35, the Dwarf at 50, the Archmage at 65; the Orc never** | Rich, P6-03, P6-04 |
| N-19 | The Orc's own perk at +75 (P5-07) | His envoy at no fee | **In his march, a routed force strikes back at its first dawn at the common 30%, not for certain** (`personalities.orc.firstDawnChance` 1 gives way to `sieges.counterattack.chancePerDay`) | Rich, P6-07 (a) |
| N-20 | The standing (D-40, C-60) | Read at each week close | **Read at each day's close** too (C-85) | Rich, P6-05 |
| N-21 | Rim fronts (A-153) | A week's skirmishes settled together at its close | **Each day's skirmish at its day's close** (C-89) | Rich, P6-06 |
| N-22 | Stances (D-33) | Read at each week close | **Read at each day's close** (C-90) | Rich, P6-06 |
| N-23 | A rival's land grab (A-25) | Taken at the week close | **Chosen at the close, taken on a seeded day that week** (C-91) | Rich, P6-06 |
| N-24 | A rival's walls (Ch 12 step 5, A-145, D-30) | All raised at the week close | **Those facing the player at the close; the rest over the next 6 days** (C-92) | Rich, P6-06 |

---

## 2. Catch-up figures (P6-01)

### 2.1 What it shows

Under each bar of the Chronicle's "This week" panel (`CampaignWeek` in `components/campaign/ChronicleCampaign.tsx`), on today's page only (C-76). Three examples, all with a 7-day week:

| Situation | Line |
| --- | --- |
| Limit 2,250. Four days logged, 9,900 in all (an average of 2,475). Three days left, today included, 600 logged so far today | "About 1,950 a day for the 3 days left brings the week's average back to 2,250 (600 so far today)." |
| Floor 1,700, limit 2,250. Five days logged, 13,500 in all. Two days left | "Even at the Healer's floor (1,700) for the 2 days left, the week averages 2,414." |
| Logged average at or under the limit | "On pace." |
| Pool 70,000. 46,000 walked before today. Three days left, 2,800 walked so far today | "About 8,000 steps a day for the 3 days left fills the week's pool (5,200 more today)." |
| The pool already met | "The week's pool is met." |

The words are interface labels in the component. The numbers come from one pure view function.

### 2.2 The rule

`catchUp(state, ledger, today)`, new in `view/chronicle.ts`, beside `stepPace` and `calorieWeek`, reading the week as the score reads it (`score.ts`):
- **The week:** from `weekFrom(today)` (the week's start, or the campaign's first day in a partial week 1) to `weekCloseDay(today)`. Respite days are left out (C-77). The Charter is `charterOn(state, today)`.
- **The days left:** `k`, today through the week close, Respite days left out.
- **Calories.** The days before today with food logged count as the Table counts them (`tableIntake`: a day under 90% of the floor counts as 1.15 × the limit). With `n` such days summing to `S`, the limit `L` and the floor `F` (the Healer's floor, never under `RULES.healer.minFloor`):
  - `Y = (L × (n + k) − S) ÷ k`, the intake a day that brings the week's logged average to `L`;
  - if `Y ≥ L`: "On pace", no figure;
  - if `F ≤ Y < L`: the figure, rounded down to the nearest 10 and never under `F` (C-75), with today's logged food beside it;
  - if `Y < F`: no figure; the line gives the average the week reaches at `F` a day, `(S + F × k) ÷ (n + k)`;
  - if today's food already exceeds `Y` and days remain after today, the figure is for the days after today, with today counted as logged.
- **Steps.** With `W` walked before today, the pool `P` and today's steps `T`:
  - `D = (P − W) ÷ k`, rounded up to the nearest 100 (C-75), with `D − T` more today when positive;
  - if `W + T ≥ P`: "The week's pool is met."
- It never reads a hidden value, and it reads the ledger only as `liveWeek` does (never writing it).

### 2.3 Guardrails (Ch 16)

- **Under-eating:** no calorie figure under the Healer's floor, ever (C-74). The floor case states the average the floor reaches, as a plain fact.
- **Overtraining:** the step gap is spread over the days left, so it never asks for the whole gap in one day. The step score still caps at the pool, and the Healer's overtraining check-in is unchanged.
- **Tone:** facts, not verdicts. No "behind", "failed" or "must" in the new lines.
- `docs/game/guardrail-audit.md` gains the catch-up figure under "Crash dieting" and "Overtraining", with its tests.

---

## 3. Dawn tidings (P6-02)

### 3.1 When

- Once per campaign day (C-78): the first time the app is open on a day the card hasn't been dismissed for. That covers a launch, and the 4 AM close while the app is left open (the card waits there for the morning).
- After any "While you were away" (Homecoming) or big-moment card, never over one, and never while the founding wizard or the re-founding offer is open.
- Only while the campaign is playable (`isPlayable`); not in a fallen campaign or before founding.
- Marked seen when dismissed (C-79).

### 3.2 What's on it

A modal (`components/game/DawnTidings.tsx`, beside `Homecoming.tsx`, using `Modal`):
- the art band (`moment.dawnTidings`, section 3.4);
- the Herald's tidings: the existing `Herald` component's sections (today's threats, Grand Battles with their "Fight now" and "Prepare" buttons, yesterday's results with the "battle you led" link, across the realm, rumors). The Veil of Fog shows its fog line, as the panel does;
- today's catch-up figures (section 2);
- on the weigh-in day, the weigh-in reminder that `WeighInBanner` shows;
- buttons: "To the Chronicle" (primary) and "To the Realm".

No new text slot (C-80).

### 3.3 The switch

Settings gains "Show the Herald's tidings each morning", on by default, kept in browser storage (C-79). Off, the card never shows; the Herald panels on the Chronicle and the Realm are unchanged.

### 3.4 The art: slot and prompt

- **Slot:** `moment.dawnTidings`, kind `moment`, 1920 × 1080. It is added to the big-moment list in `scripts/check-assets.cjs` (`dawnTidings` beside `grandBattleWon` and the rest); `npm run assets:check -- --write` adds it to `manifest.json` and `docs/game/assets.md` with no file.
- **In the card:** a band across the top, `object-fit: cover` on the middle third. Until the file exists, the slot's placeholder shows.
- **The prompt** goes in `docs/game/art/dawn-tidings-prompt.md`, in the format of `pixel-scene-prompts.md`, with the generated source and final file filled in once Rich makes it. Reference images: `docs/game/art/reference/owner-portrait.png` (style) and `src/renderer/public/game-assets/banner.player-green-silver-v1.png` (the realm's livery). The prompt:

```text
Use case: stylized-concept
Asset type: Dawn tidings scene for a medieval fantasy strategy game: the realm's herald reading the morning's news aloud. Opaque 16:9 scene made as true hand-painted PIXEL ART on a logical 480 by 270 grid, for crisp nearest-neighbor 4x enlargement to 1920 by 1080.
Input images: IMAGE 1 is the mandatory STYLE REFERENCE, the owner's knight portrait. Match its stepped painted pixel style: dark warm-brown outlines, saturated emerald cloth, chunky silver metal in 3 to 5 broad facets, warm gold upper-left highlights. Style only: do not put the knight in the scene. IMAGE 2 is the realm's green-and-silver banner: use its colors and emblem for the herald's livery and the wall banner.
Composition: One herald stands on the top step of a modest stone keep at sunrise, holding an unrolled parchment scroll in both hands and reading from it, a long brass horn slung at the hip. Emerald tabard over a silver-grey tunic, the banner's emblem on the chest, a soft cap with one feather. Behind the herald, a carved oak door and one emerald-and-silver banner hanging on the wall. Keep the herald, the scroll and the banner inside the middle third of the height, so a wide 3:1 crop across the center keeps them whole; the top third is calm pale-gold sky with two or three chunky cloud masses and a low sun at the upper left, the bottom third is broad stone steps.
Pixel rendering: Square aligned pixel steps, no antialiasing or gradients. Large connected color clusters, 4 to 5 discrete tones per material. Readable at 240 x 135; crisply detailed at 960 x 540. No dithering, speckle, smooth gradient sky, fine brushwork, volumetric rays or photographic detail.
Lighting/mood: Calm early morning, golden light from the upper left, cool blue-green shadows in the doorway.
Constraints: Full-frame opaque 16:9 image. No text or lettering (the scroll shows only abstract dark lines), no logos, watermark, card border or borrowed characters.
```

---

## 4. Respect marks by rival (P6-03, P6-04)

### 4.1 The table

**Bold** marks a change from Patch 5. "Never" means the mark doesn't exist for him.

| Mark | Patch 5 (shared) | Orc (strength) | Goblin (coin and bargains) | Dwarf (stone and patience) | Archmage (constancy) |
| --- | --- | --- | --- | --- | --- |
| Accord signed (D-01) | 100 | never | 100 | 100 | 100 |
| Accord easier | 75 | never | 75 | 75 | 75 |
| His own perk | 75 | 75: his routed forces in his march don't strike back for certain at their first dawn (P6-07) | **60**: he bids for none of your villages | 75: no walls on the wilds facing you | **60**: you see tomorrow's surge |
| Calls to arms | 60 | **45** | 60 | 60 | **75** |
| Accord talks | 55 | never | 55 | 55 | 55 |
| He sells you hexes | 50 (not the Goblin) | **never** | (bribed, C-43) | **never** | 50 |
| Envoys | 50 (the Orc's free from 75) | **never** | **35** | 50 | **65** |
| Ugrak's Challenge instead of the final Warhost | 50 | 50 | – | – | – |
| Peace | 50 (never the Orc) | never | **40** | **60** | **40** |
| Pacts | 40 | **50** | **30** | **30** | 40 |
| Raids 10% weaker | 25 | 25 | 25 | **35** | **15** |
| He buys your hexes | 25 (the Goblin at any) | 25 | any | 25 | 25 |
| Start (A-18, C-61) | 20 | 20 | 20 | 20 | 20 |
| War | −25 | **−15** | −25 | **−40** | −25 |
| Raids 10% stronger | −50 | **−40** | −50 | **−60** | −50 |
| His own detriment | −75 | **−60**: one more conquest attempt a week | **−60**: gouging | −75: walls on the wilds to level 2 | −75: surges 10% stronger |

Why each moves the way he does:
- **The Orc:** quick to anger and quick to fight beside the player, but promises and land deals mean little to him, and he never gives ground or lends his warriors (P6-04).
- **The Goblin:** every deal comes cheap and early, but his greed turns early too.
- **The Dwarf:** slow to anger and slow to warm, but an oath is the first thing he gives, and he never sells his people (P6-04).
- **The Archmage:** he wants to be left alone, so Peace and weaker raids come early; he speaks in warnings, so his foresight comes at 60; but he seldom lends his mages or joins a war.

The Orc's Respect still moves as D-39 has it; he is still never at Peace.

### 4.2 How it is built

- `RULES.respect.marks`: a `PerRival` table of the marks above (`war`, `raidsStrongerAt`, `ownDown`, `raidsWeaker`, `buysHex`, `pact`, `peace`, `envoy`, `sellsHex`, `callToArms`, `ownUp`), `null` for never (C-83). The shared marks of C-82 stay in `RULES.respect.thresholds`.
- `marksFor(rival)` reads it. Every gate reads `marksFor`:
  - `standingFor` (War and Peace lines);
  - `raidRespectMult`, which now takes the rival;
  - `ownMark` (his own perk and detriment);
  - `offerDeal` in `land.ts` (pacts, buying and selling hexes, calls to arms), with a new refusal `neverSells` for the Orc's and the Dwarf's hexes;
  - `envoyAvailable` and `envoyFee` (the Orc never; his free envoy goes);
  - `respectEffects` in `rivals.ts`;
  - `marksOf` (the court's list) and the standing note in `view/diplomacy.ts`.
- The Orc's +75 perk per P6-07.

### 4.3 What the player sees

- **The court:** each rival's marks list reads his own table, with the "never" marks left out. The standing note gives his own nearest lines ("Peace at Respect 60; War at −40").
- **How to play**, Diplomacy and Respect: the marks table becomes one table with a column per rival, every number read from `RULES`, and a line that the standing follows Respect each day (section 5).
- No hidden number is shown.

### 4.4 In the live campaign

No migration. Each court keeps its Respect. On the first night on 3.4, every standing is read from its Respect by its rival's new lines (P6-05: nothing is kept from the old lines). So, for example:
- a Dwarf at Peace with Respect 50 to 59 goes back to Tension;
- a Goblin or an Archmage at 40 to 49 comes to Peace;
- an Orc at −24 to −15 goes to War.

The court and the Herald say so the next morning.

---

## 5. Daily standings (P6-05)

### 5.1 The rule

- A new day phase, `standings`, appended to `DAY_PHASE_NAMES` after `marchRules`, reads every active rival's standing from his Respect at the day's close (`standingFor` with his own lines), after the day's battles have moved it (C-85).
- At a week close it is read again in the rival turn's step 7, after the prized week and the weekly drivers, so the week's Respect counts the same night.
- A rival who joins a coalition is at War at once, as now.
- The `disposition` event posts on each change, with the Herald line of C-88.

### 5.2 What stays weekly

- **The raider draw** (A-28): who raids each day is drawn at the week close. A rival who comes to Peace mid-week has his drawn raids turned into beasts from the next dawn (A-132). A rival who leaves Peace mid-week raids from the next week's draw (C-86).
- **Conquest planning** (A-146): at the week close, unless P6-08 changes it. An attempt already planned by a rival who leaves War is called off at its dawn, as now.
- What else reads the standing reads it when it runs, as now: the Warhost and the Rituals waiting at Peace (A-148, A-151), the Goblin's mercenaries for rivals at War (A-147).

### 5.3 What to watch

- **Flips on a line** (C-87): the run reports each rival's standing changes a campaign (section 9).
- **G-08 and G-10:** Peace comes sooner for the Goblin and the Archmage (40) and later for the Dwarf (60), so the mix of rival raids and beasts in each march moves.

---

## 6. The realm moves by the day (P6-06)

### 6.1 Wars between rivals (C-89)

- A new day phase, `fronts`, settles that day's skirmish on each front at War, with the same draw on the same day as today's week phase does (`skirmish:<front>`, won at the rival's share of the two AVs, moving the track a step, −3 to +3).
- The week phase keeps the war's 5% cost to both sides, Peace pulling a track a step toward 0, and drawing next week's front states (A-144).
- The `front` event posts on the day the track reaches ±3. Its raid multiples (Emboldened +15%, Humbled −15%) then act from the next dawn rather than the next week. That is this piece's only change in play, and it cuts both ways.
- The catalog already holds `herald.front.war`, `.peace`, `.emboldened` and `.humbled`, but no screen shows them today. They are shown under "Across the realm" (C-88), so the wars between rivals are heard as they go.

### 6.2 Stances (C-90)

- The stance band (Defiant, Wary, Shaken, Ready to yield; D-33) is read at each day's close from week 16, and the `stance` event and its Herald line post on the day it changes.
- Offers, lapses and the pacing (`resolutionAllowed`) stay in `termsWeek` at the week close.

### 6.3 Land grabs (C-91)

- At the week close, `expand` (step 4) chooses as today: a village bid first (unchanged, resolving at the next close), else the most valuable beast den 0.5 × AV beats at an average roll.
- A chosen den is not taken at once. It is stored with a seeded day 1 to 7 days later (`RivalMemory.grabs`, optional). The next targets skip it, so the count a week is today's: one a rival, two for the Goblin.
- A new day phase, `rivalMoves`, takes each grab due that day at its close, after the day's battles: if the hex is still neutral, still touches his land and isn't mythic, and 0.5 × his AV that day × the roll (`rival:<id>:grab:<i>`) ≥ its garrison then. Otherwise it is called off, and the `hexTransfer` doesn't post.
- A taken den posts `hexTransfer` as now, and the Herald line `herald.rival.grab` (C-88).

### 6.4 Walls (C-92)

- At the week close, `fortifyBorder` (step 5) buys levels from the same budget in the same order as today.
- Levels on hexes touching the player's land, and the Dwarf's wild walls (D-30), go up at once, as today.
- The rest are stored in order (`RivalMemory.walls`, optional) and raised by the `rivalMoves` phase over the next 6 day closes, the same number each day, rounded up. A level whose hex he no longer holds (or, for a wild wall, that is no longer neutral) is dropped; the money stays spent.
- No Herald line: the map shows them.

### 6.5 The measure: conquest attempts on the day of War (P6-08, T-09)

- Built behind `RULES.rivalAi.planConquestOnWar: false` (C-93). On: when the `standings` phase puts a rival at War, `planConquests` runs for him at once, striking 2 to 7 days later, announced the day before, within the week's allowance.
- The tuning stage runs the targets with it off (the patch as built) and on (an override), and reports both side by side: above all G-08 on 100 seeds, G-04, G-10, G-19, G-20 and the conquest attempts a campaign. Rich then decides whether to switch it on.

---

## 7. Rules version, saves and records

### 7.1 The version

- **`ruleVersion` 3.4.0** (C-94); 3.4.1 from the standing buffer (D-52, section 12.5). `campaign.ruleVersion` stays the founding version (3.1.0 for Rich).
- Stage 1 (the screens) changes no rule and stays on 3.3.0, so it can be installed on its own.
- **New state, all optional:**
  - `RivalMemory.grabs?: { hexId: string; day: ISODate; i: number }[]` (C-91);
  - `RivalMemory.walls?: { hexId: string; level: number }[]` (C-92).
- **New events:** none. **New day phases:** `standings`, `fronts`, `rivalMoves`, appended in that order.
- **New text slots:** the four Herald placeholders of C-88.
- **New art slot:** `moment.dawnTidings` (C-81).

### 7.2 The live campaign

Rich's campaign takes 3.4.0 when he installs the build. On its first night:
- every standing is read from Respect by the new lines (section 4.4);
- the next week close stores the first land grabs and walls; nothing from before is changed or settled again.

The proof is synthetic: the 3.1.0, 3.2.0 and 3.3.0 fixtures load under 3.4.0 without a re-founding and settle 12 weeks. Nothing in `%APPDATA%\Fiefdom` is read.

### 7.3 `decisions.md` when the patch lands

**New entries:**
- D-46: the catch-up figures (P6-01, C-74 to C-77);
- D-47: Dawn tidings (P6-02, C-78 to C-81);
- D-48: Respect marks by rival (P6-03, P6-04, P6-07, C-82 to C-84);
- D-49: daily standings (P6-05, C-85 to C-88);
- D-50: the realm by the day (P6-06, C-89 to C-93);
- after the tuning report: P6-08 (T-09).

**Marked changed:** D-39 (the marks), D-40 and C-60 (the standing daily), A-20 (envoys), A-25 (land grabs), A-142 (hexes sold), A-145 and D-30 (walls), A-153 (fronts), D-33 (stances), S-53 (the standing placeholders landed). `docs/game/guardrail-audit.md` gains the catch-up figures (section 2.3).

### 7.4 New and changed numbers in `rules.ts` (all TUNE)

| Where | Value |
| --- | --- |
| `ruleVersion` | `3.4.0`; `3.4.1` from D-52 (T-10) |
| `respect.marks` | section 4.1's table (`orc: { war: −15, raidsStrongerAt: −40, ownDown: −60, raidsWeaker: 25, buysHex: 25, pact: 50, peace: null, envoy: null, sellsHex: null, callToArms: 45, ownUp: 75 }`, and so on for each rival) |
| `respect.standing`, `respect.raidsStrongerAt`, `respect.own.up`, `respect.own.down`, `respect.thresholds.{raidsWeaker, sellHex, goblinBuysHex, pact, envoy, buyHex, callToArms}` | retired into `respect.marks` |
| `respect.own` | keeps its effects (`orcConquests`, `goblinGreedSteps`, `goblinOfferMult`, `dwarfWildWallMax`, `archmageSurgeMult`) and gains the Orc's +75 perk per P6-07 |
| `rivalAi.planConquestOnWar` | `false` (C-93) as built; `true` from D-51 (T-09) |
| `rivalAi.grabDays` | `{ min: 1, max: 7 }` (C-91) |
| `rivalAi.wallDays` | `6` (C-92) |
| `respect.standingBuffer` | `0` as built (T-10's probe, section 12.4); `5` from D-52 (T-10 (b), section 12.5) |

---

## 8. Build stages

Each stage leaves `npm run typecheck`, `npm test` and `npm run check:game` passing.

| Stage | What | Ends with |
| --- | --- | --- |
| 1 | **The screens** (rules 3.3.0): `catchUp` and its lines; the Dawn tidings card, its seen day and its switch; the `moment.dawnTidings` slot, the manifest and `assets.md`; the prompt file; the guardrail audit's rows | View and component tests; screenshots of the Chronicle's figures (behind, on pace, at the floor) and of the card with the placeholder. Can be installed on its own |
| 2 | **Marks by rival and daily standings** (rules 3.4.0): `respect.marks` and `marksFor`; every gate; the Orc's perk per P6-07; the court, the standing note and How to play; the `standings` day phase; the Herald placeholders | Respect, standing, deal and view tests; screenshots of each court; a targets run |
| 3 | **The realm by the day:** the `fronts` and `rivalMoves` day phases; stances daily; grabs and walls stored and raised; the `planConquestOnWar` switch, off | Tests for each; a targets run |
| 4 | **The run and the report:** `targets-3.4.0.md`, with the switch off and on (T-09) and the standing flips; a **tuning report** for anything that moves out of range (D-02); `decisions.md` D-46 to D-50 | The report for Rich's approval |

---

## 9. Targets

**Keep as in `targets-3.3.0.md`:** G-01 to G-07, G-09 to G-13, G-15 to G-21. G-08 stays "missed, accepted" at 1.94× on 100 seeds (D-44) and is read again on the same 100 seeds; it shouldn't fall.

**What could move them:**
- **G-04, G-05 and G-07:** the Orc and the Dwarf no longer sell hexes, so land bought by deal comes only from the Archmage (and the Goblin's bribes). Watch the Dwarf-path and Orc-path smarter players.
- **G-08 and G-10:** Peace sooner for the Goblin and the Archmage, later for the Dwarf; daily standings; the Orc's perk (P6-07 (a) touches his march's counterattacks); walls rising over the week.
- **G-11 and G-18:** the Accord marks are unchanged, but Respect's course moves with the standings (a Dwarf at Tension longer raids longer, and each raid beaten is +3).
- **G-20:** each rival's Peace and War lines move. The run adds a row: each rival's standing changes a campaign (median and most), to show flips on a line (C-87).
- **G-09:** P6-07 (a) changes the Orc's first-dawn counterattacks.

**Reported beside the targets:** T-09's comparison (section 6.5).

---

## 10. Tests and verification

New or changed tests, named after the rule they check:

- **Catch-up figures (D-46):**
  - section 2.1's five lines from their numbers;
  - no calorie figure under the floor, medical supervision or not;
  - "On pace" with no figure at or under the limit;
  - a day under 90% of the floor counted as 1.15 × the limit;
  - Respite days left out; a partial week 1; the week's last day (`k` = 1);
  - today's food past the figure gives the figure for the days after;
  - rounding: calories down to 10 and never under the floor, steps up to 100;
  - the figures only on the open day.
- **Dawn tidings (D-47):**
  - once a day, marked on dismiss, again after a launch that didn't dismiss;
  - never over a Homecoming, a big-moment card, the wizard or the re-founding offer;
  - the switch; failing storage shows the card and throws nothing;
  - the Veil of Fog's line; no new text slot;
  - `npm run assets:check` lists `moment.dawnTidings`.
- **Marks by rival (D-48):**
  - `marksFor` for each rival matches section 4.1;
  - every gate per rival: pacts, envoys (the Orc never; no free envoy), hexes sold (the Orc and the Dwarf refused with `neverSells`), hexes bought, calls to arms, raids weaker and stronger, Peace and War, his own perk and detriment;
  - the Orc's +75 perk per P6-07;
  - an Orc envoy in today's orders dropped at the close with no fee (C-84);
  - the shared marks of C-82 unchanged;
  - the court's marks and How to play read `RULES`; no hidden number.
- **Daily standings (D-49):**
  - a battle that crosses a line changes the standing at that day's close;
  - Peace mid-week turns his drawn raids into beasts from the next dawn (A-132);
  - the week close reads it again after the weekly drivers;
  - a coalition at War at once; the Orc never at Peace;
  - a 3.3.0 save's standings re-read on its first 3.4 night (section 4.4).
- **The realm by the day (D-50):**
  - fronts: a week settled day by day ends on the same track as the weekly settling of the same seed when no AV changes mid-week; Emboldened from the next dawn;
  - stances: a band change posts on its day; offers still at the close;
  - grabs: chosen at the close, taken on their day; called off when the player took the hex first; the same count a week;
  - walls: the facing levels at the close, the rest over 6 days, all by the next close; a level on a lost hex dropped;
  - `planConquestOnWar` off changes nothing; on, plans within the week's allowance.
- **Carry-forward:** `carryForward.test.ts` extended with a 3.3.0 fixture (`tests/game/fixtures/campaign-3.3.0.json`, written by a new `scripts/fixture-3.3.0.ts` as the earlier two were); the 3.1.0, 3.2.0 and 3.3.0 fixtures load under 3.4.0 without a re-founding and settle 12 weeks; `ledger.json` untouched.
- **Test 9 and Test 10:** settling twice changes nothing (the new day phases included); rings 0 to 2 never change owner; no loss before week 36.
- **Performance (G-15):** `scripts/campaign-perf.ts` within 2 s and 2 MB.

---

## 11. Risks

- **The live campaign's standings shift on the first night** (section 4.4). That is P6-05 as Rich gave it; the Herald and the court say so.
- **Fewer hexes for sale** (N-17). Land by deal now comes only from the Archmage and the Goblin's bribes; the run reads G-04, G-05 and G-07, and the report says by how much if they move.
- **Standings flip on a line** (C-87). Measured; a buffer only as a proposal.
- **The Dwarf at Peace later** (60). More Dwarf raids early; each beaten is +3 Respect, so his Accord could even come sooner. G-11 is watched.
- **A card every morning.** The switch turns it off; it never stacks over another card.
- **A figure read as pressure** (Ch 16). Plain facts, no figure under the floor, none while on pace, the step gap spread over the days left.
- **Art.** The card ships with the placeholder until Rich generates the picture; nothing waits on it.

---

## 12. What the build changed

Filled in during the build: each change from this spec (S-56 onward), the targets by stage, and the tuning report (T-09 onward).

### 12.1 Stage 1: the screens (2026-10-18, rules 3.3.0)

Built on branch `patch-6` at Rich's go-ahead ("Commit the spec on a patch-6 branch and start stage 1"). No rule changed; `ruleVersion` stays 3.3.0, so this stage can be installed on its own.

| # | Spec said | Built | Why |
| --- | --- | --- | --- |
| S-56 | C-77: Respite days leave both figures "as they leave the score" | As said, but the score that leaves them out is the **contract's** (Ch 4 rule 4). The week's income at the close still counts a Respite day | The contract's payout is the larger stake, and a rest day shouldn't ask to be made up |
| S-57 | Section 2.1's floor line: "Even at the Healer's floor, 1,700, for the 2 days left, …" | "Even at the Healer's floor (1,700) for the 2 days left, the week averages 2,414." | With one day left the commas read "1,700, today," |
| S-58 | Section 3.4: the band shows the picture's middle third (3:1) | A 4:1 band from the middle of the picture | At 3:1 the card's buttons fell below a 1280 × 800 window. The prompt still keeps the herald in the middle third, which the 4:1 band holds |
| S-59 | Section 2.2 | Two cases the spec left open: nothing logged this week (and none today) gives no line; a small log so far today, under the floor, is today's food so far, never a finished day | "On pace" over an empty week would say nothing true |
| S-60 | — | `contractsOf` in `settle.ts` is exported for the Respite days, rather than a second copy (Conventions 12); `Herald` gains a `bare` form for the card | Reuse |
| S-61 | Section 3.4: "the slot's placeholder" | The Herald's horn (`GiHornInternal`) on the band until the picture exists | The generic placeholder is a lettered card |

**Verification:** `npm run typecheck`, `npm test` (837 tests, 16 of them new in `viewCatchUp.test.ts` and `dawnTidings.test.ts`) and `npm run check:game` pass; `npm run assets:check` lists `moment.dawnTidings` as the one slot without art. The manifest gains only that entry.

**Screenshots** (`docs/game/screens/p6/`, a scratch copy of the five-week campaign from `scripts/screens-data.ts`, run on Sunday 2026-10-18, the week's last day):
- `dawn-tidings-behind`: the card at launch, the horn on the band, today's two figures above the Herald;
- `chronicle-week-behind`: "About 4,800 more steps today fills the week's pool." and "About 1,820 today brings the week's average back to 2,000 (600 so far today).";
- `chronicle-week-on-pace`: "On pace.";
- `chronicle-week-at-floor`: "Even at the Healer's floor (1,700) today, the week averages 2,214.";
- `settings-dawn-switch`: the switch under "The campaign".

### 12.2 Stage 2: marks by rival and daily standings (2026-10-18, rules 3.4.0)

Built on `patch-6` at Rich's go-ahead ("Go ahead with stage 2: the Respect marks by rival and daily standings"). Before any rule changed, `scripts/fixture-3.3.0.ts` wrote the 3.3.0 save the carry-forward test plays (`tests/game/fixtures/campaign-3.3.0.json`: 30 weeks of the smarter Steadfast player; the Orc at Respect 100 in Tension, the Goblin at 11, the Dwarf allied, the Archmage at 100 at Peace).

| # | Spec said | Built | Why |
| --- | --- | --- | --- |
| S-62 | Section 4.1: the Goblin buys your hexes at "any" Respect | `buysHex: −100`, the track's floor, so every gate reads one number; the court and How to play show it as "any" | No special value to carry through the gates |
| S-63 | Section 7.4: `respect.standing` retired into `respect.marks` | So; "never at Peace" is the Orc's `peace: null`, and `neverAtPeace` is gone | One source for each line |
| S-64 | C-88: the catalog's `herald.front.*` lines are shown | A front's turn (its track at ±3) tells the winner, `herald.front.emboldened`, naming the loser as a fact for the line Rich writes; `.humbled` stays unused, and `.war` and `.peace` stay with the weekly front draw as before | One line a turn; the loser's Humbled is the same news |
| S-65 | C-84 | The orders panel lists only the rivals who ever lend an envoy (`envoyRivals`), and the day's skirmishes leave out an envoy no longer lent, as the close always did | The skirmish roster had not filtered envoys |
| S-66 | — | `reaches(respect, mark)` in `respect.ts` (at or above from 0 up, at or below under 0, never a `null` mark) serves the court's marks and `respectEffects` | Reuse |
| S-67 | Section 4.3: How to play's marks as one table | The table lists each ruler's own marks, top to bottom from his perk to his threat, with the Accord's shared marks in the line above it | — |

**Targets** (`npm run sim -- --targets`, 720 campaigns, 674 s on 12 workers; [targets-3.4.0](../game/sim/targets-3.4.0.md) against [targets-3.3.0](../game/sim/targets-3.3.0.md)). Every target that was met stays met, and **G-08 is met again**:

| Target | 3.3.0 | 3.4.0 (stage 2) | |
| --- | --- | --- | --- |
| G-04 (net hexes a week; days land changes hands) | 3.31; 4.1 | 3.32; 4.1 | kept: the Orc and the Dwarf selling no hex didn't slow the land |
| G-05 | 20%; week 65 | 20%; week 66 | kept |
| G-07 in full (one; two; three; four paths) | 59 / 60 / 60 / 60 | 59 / 60 / 59.5 / 59 | kept |
| **G-08** (land lost a week, bad vs good; 100 seeds) | 1.14 vs 0.59 = **1.92×**, missed (accepted, D-44) | 1.19 vs 0.57 = **2.09×** (2.12× on 40); lost ÷ gained 14% | **met** |
| G-10 | the Dwarf's and the Orc's rows; the Goblin by deal 46% | the same rows; 44% | kept |
| G-11 (Perfect; Steadfast; Committed, by week 76) | 54; 59; 70.5 (88%) | 53.5; 59; 69 (83%) | kept |
| G-18 | 2 (98%); 0; 1 | 2 (100%); 0; 1 | kept |
| G-19 (falls; Ultimatums Steadfast, Committed, Wavering) | 0%; 0%; 8%; 74%, 99%, 100% | 0%; 0%; 4%; 84%, 100%, 100% | kept; more Steadfast campaigns see an Ultimatum, and none falls |
| G-20 (Peace of 3; the Orc at Peace; War; changes) | 2; 0; 2; 2 | **3**; 0; 2; 2 | kept: all three can come to Peace now, and the median rival still changes standing twice a campaign, so daily reading shows no churn on this measure |
| G-01 to G-03, G-06, G-09, G-12, G-13, G-15 to G-17, G-21 | | within a point or two of 3.3.0 | kept |

The stage-4 report adds the dedicated flip row (C-87) and the daily-conquest comparison (T-09).

**Verification:** `npm run typecheck`, `npm test` (852 tests: `respectByRival.test.ts` new, the 3.3.0 carry-forward tests added, and every test that read a shared mark moved to the rival's own) and `npm run check:game` (372 text slots) pass.

**Screenshots** (`docs/game/screens/p6/`, a five-week campaign founded on 3.4.0 by `scripts/screens-data.ts`):
- `diplomacy-courts-by-rival`: the Orc's marks (War −15, calls to arms 45, pacts and his Challenge at 50, his new perk at 75; no Peace, envoy or hex sale) beside the Goblin's, at Peace from 40;
- `court-marks-dwarf`: the Dwarf (Peace 60, War −40, no hex sale) beside the Archmage (raids weaker from 15, foresight at 60, envoys at 65, calls to arms at 75);
- `guide-marks-table`: How to play's table, one column per ruler.

### 12.3 Stage 3: the realm by the day (2026-10-18, rules 3.4.0)

Built on `patch-6` at Rich's go-ahead ("Go ahead with stage 3: fronts, stances, land grabs and walls by the day, with the daily conquest switch off").

| # | Spec said | Built | Why |
| --- | --- | --- | --- |
| S-68 | Section 7.1: day phases `standings`, `fronts`, `rivalMoves` | So; the stances (C-90) are read inside `standings`, after the standing | Both are readings of the day's state; no fourth phase |
| S-69 | Section 7.1: no new front state | `FrontState.skirmishedThrough?`, the last day whose skirmish is settled. A day is settled once, and a save from before Patch 6 that takes 3.4 mid-week settles that week's earlier days at its first close; the week phase runs the same catch-up first, so settling a week only at its close gives the old result | Without it the live campaign's first 3.4 week would lose the skirmishes of its days before the install |
| S-70 | Section 7.1: "New events: none" | The `front` event gains an optional `turned`, set on the day a skirmish takes the track to its end; the Herald tells only that, not the weekly draw's news of a front | The weekly draw posts `front` too, with whatever track it has |
| S-71 | C-91 | The grab's day is drawn at the close (`rival:<id>:grabDay:<i>`) and its roll on its day (`rival:<id>:grab:<i>`); his AV is read on that day (the old close read the next day's) | Each draw on its own day, as A-153's skirmishes |
| S-72 | — | The four stances of a day share one reading of the measures that don't depend on the rival (`sharedMeasures` in `terms.ts`) | The first timing with daily stances put the re-founding's 365 days at 2,051 ms against G-15's 2 s; shared, 1,922 ms (1,863 without daily stances), and the 365-day catch-up 1,005 ms |
| S-73 | C-93: "within the week's allowance" | A rival who goes to War plans nothing while an attempt of his is still coming; otherwise A-146's `conquestPlansPerWeek` and his extra. `dailyStandings` takes the switch as a parameter that defaults to `RULES`, so a test can turn it on without changing the rules | Never more at a time than the close would plan |
| S-74 | — | The rival-only test world (`tests/game/support/rival-sim.ts`) runs each day's `rivalMovesDay`, so its 52-week safety runs take the grabs and raise the walls | The checks that no rival enters rings 0 to 2 cover the new moves |

**Targets** (`npm run sim -- --targets`, 720 campaigns, 518 s; [targets-3.4.0](../game/sim/targets-3.4.0.md) regenerated, stage 2's reading beside it). Every target stays met; the daily moves shift each by a point or two at most, as section 6 expected:

| Target | Stage 2 | Stage 3 | |
| --- | --- | --- | --- |
| G-01 | 5.8; 83% | 5.9; 84% | kept |
| G-04 | 3.32; 4.1 | 3.32; 4.1 | kept |
| G-07 in full | 59 / 60 / 59.5 / 59 | 59 / 60 / 60 / 59 | kept |
| G-08 (100 seeds) | 1.19 vs 0.57 = 2.09× | 1.21 vs 0.59 = **2.05×** (2.09× on 40); lost ÷ gained 15% | met |
| G-10 | the Goblin by deal 44% | 45% | kept |
| G-11 | 53.5; 59; 69 (83%) | 54; 59; 69 (80%) | kept |
| G-15 | 1.79 MB | 1.73 MB | kept |
| G-19 (Ultimatums Steadfast; Committed; Wavering) | 84%; 100%; 100% | 79%; 98%; 100% | kept, no falls |
| G-20 | 3; 0; 2; 2 | 3; 0; 2; 2 | kept |
| The rest | | within a point of stage 2 | kept |

**Verification:** `npm run typecheck`, `npm test` (862 tests: `dailyMoves.test.ts` new, ten tests of the four moves and the switch) and `npm run check:game` (373 text slots) pass; `scripts/campaign-perf.ts`: the 365-day catch-up 1,005 ms, the re-founding 1,922 ms, `campaign.json` 1.31 MB after 70 weeks.

### 12.4 Stage 4: the run and the report (2026-10-18)

At Rich's go-ahead ("Go ahead with stage 4: run the comparison with daily conquest planning on and off, add the standing flips row, and write the report and decisions"). `decisions.md` gains D-46 to D-50, and D-30, D-33, D-39, D-40, A-20, A-25, A-142 and A-153 carry their Patch 6 changes.

| # | Spec said | Built | Why |
| --- | --- | --- | --- |
| S-75 | Section 9: a row of each rival's standing changes a campaign | A section of its own in the targets report, "Standing flips and conquest attempts", counted from the daily `disposition` events (so a flip and a flip back within a week both count), with the conquest attempts that struck the player. G-20's row still samples the week closes | A week-close sample can't see a flip back within the week |
| S-76 | Section 6.5: an override | `npm run sim -- --targets --variant conquestOnWar` (`CONQUEST_ON_WAR` in `sim/overrides.ts`) plays the targets with the switch on and writes `targets-3.4.0-conquestOnWar.md` beside the base report. The comparison's file was written to a scratch folder; its numbers are here | The base report stays the one `targets-3.4.0.md` |
| S-77 | Section 7.3: A-145 marked changed | Not marked: A-145 sets only the Dwarf's fourth level's cost. D-30 carries the walls' new rhythm | The cost is unchanged |

#### Targets with the switch off (as built)

`targets-3.4.0.md`, regenerated (717 s): every target reads as stage 3's run did (the simulator is seeded), so every target stays met, G-08 at 2.05× on 100 seeds. The new section reads:

| Rival | Steadfast smarter: standing changes a campaign (median; most) | Steadfast greedy (median; most) |
| --- | --- | --- |
| Orc | 2; 4 | 0; 4 |
| Goblin | 4; 22 | 5; 35 |
| Dwarf | 1; 3 | 4; 10 |
| Archmage | 1; 1 | 3; 11 |

Conquest attempts that struck the player a campaign: smarter 0.6 (0.3 held), greedy 1.2 (0.0 held).

#### T-09: daily conquest planning, off against on

The same 720 campaigns, once as built and once with `planConquestOnWar` on (666 s):

| Target | Off (as built) | On |
| --- | --- | --- |
| G-04 | 3.32; 4.1 | 3.33; 4.1 |
| G-08 (100 seeds; 40) | 1.21 vs 0.59 = 2.05×; 2.09× | 1.21 vs 0.59 = 2.04×; 2.10× |
| G-10 | the Dwarf's and the Orc's rows; the Goblin by deal 45% | the same |
| G-11 | 54; 59; 69 (80%) | 54; 59; 69 (80%) |
| G-15 | 1.73 MB | 1.81 MB |
| G-19 (falls; Ultimatums) | 0%; 0%; 4%; 79%, 98%, 100% | 0%; 0%; 4%; 78%, 98%, 100% |
| G-20 | 3; 0; 2; 2 | 3; 0; 2; 2 |
| Conquest attempts a campaign (smarter; greedy) | 0.6; 1.2 | 0.6; 1.1 |
| Every other target | met | met, within a point |

- **The switch changes almost nothing,** because a rival seldom falls to War by Respect: the Orc's climbs as his raids are beaten, and the others' sit above their War lines. Most conquest attempts come from rivals already at War at a close, which the close plans as before. A coalition's War is set at the week close, after the rival turn, so the switch doesn't reach it either.
- **What it would change in play:** on the rare day a rival's Respect drops past his War line mid-week (the Orc at −15 after his land is taken, say), his first attempt strikes 2 to 7 days later instead of after the next close (from a Monday, 8 to 13 days later). That is what the court's standing note already says War means.

| # | Target | Reading | Options | Recommendation |
| --- | --- | --- | --- | --- |
| T-09 | P6-08 | The switch moves no target past the noise; conquest attempts stay about one a campaign | (a) switch it on: War means conquest attempts from the day it starts, as the court says; (b) leave it off: the weekly rhythm, as built | (a): it costs nothing the targets can see, and it matches daily standings. Either is Rich's call (D-02). **Decided (Rich, 2026-10-18): (a)** ("Switch daily conquest planning on (T-09 option a)."); `planConquestOnWar` is `true`, D-51 |

#### T-10: the Goblin's standing churns in some campaigns (C-87)

The flips section shows it, and a scratch probe outside the repo (40 Steadfast greedy and 40 smarter campaigns, played as the targets run plays them, each standing change tallied from the log) says where:

| Rival | Greedy: changes, by line | Back within 7 days | Per campaign (greedy) |
| --- | --- | --- | --- |
| Goblin | Tension ↔ War 154, Tension ↔ Peace 139, Peace ↔ War 3 | 117 of 296 | 1 to 35; 5 campaigns at 19 or more |
| Dwarf | Tension ↔ Peace 101, Peace ↔ War 54 (coalitions) | 26 of 155 | 1 to 9 |
| Archmage | Tension ↔ Peace 99, Peace ↔ War 30 (coalitions) | 32 of 129 | 1 to 9 |
| Orc | 2 | 0 | 0 to 2 |

With the smarter player the Goblin's runs 2 to 22 (62 of 200 back within a week); the Dwarf's and the Archmage's are 1 to 3.

- **Why the Goblin:** his Respect moves most often and both ways (a bribe +2, a buy-off +10 or −5, his bid held −2, his raids +3 or −2, his land taken −5), and his lines sit close to where it wanders (Peace at 40, War at −25). Read daily, a week of bribes and a hex taken can carry him across a line and back.
- **What the player sees:** in a churning campaign, a Herald line and a new standing on his court every week or two; his raids stop and start with the weekly draw.

| # | Target | Reading | Options | Recommendation |
| --- | --- | --- | --- | --- |
| T-10 | C-87 | The Goblin's standing changes a median 5 times a greedy campaign but up to 35, and 40% of his changes followed by another within a week; the others don't churn | (a) accept: most campaigns see a handful of changes; (b) a buffer: once his standing changes, it changes back only when Respect is a few points past the line the other way (5, TUNE), for every rival; (c) hold any new standing at least 7 days | (b), probed first: run the targets with a 5-point buffer and report the Goblin's flips and G-20 before any number is set (D-02). Nothing is changed |

#### T-10 probed: a 5-point buffer on the standings (2026-10-19)

The probe T-10's recommendation asked for: the targets run at a buffer of 5 beside the build at 0. Nothing in play changes: `RULES.respect.standingBuffer` stays 0 until Rich decides (D-02).

| # | Spec said | Built | Why |
| --- | --- | --- | --- |
| S-78 | T-10 (b): once a standing changes, it changes back only when Respect is a few points past the line the other way, for every rival | `RULES.respect.standingBuffer` (TUNE, 0). `standingFor` takes the standing he holds: at Peace he goes back to Tension only below his Peace line less the buffer, at War only above his War line plus the buffer; coming to Peace or War reads the lines themselves. The day's close (`dailyStandings`) and the week close (`setDisposition`) both read it through `dispositionFor` from the standing he holds, so one rule serves both. A coalition is War whatever his Respect; the Orc is never at Peace | At 0 every reading is as before: a test reads every Respect from −100 to 100, each standing held and both coalition states, for each rival. One edge at 5: a rival whose coalition ends while his Respect is within 5 of his War line stays at War until it is past that |
| S-79 | T-10: probe before any number is set | `npm run sim -- --targets --variant standingBuffer` (`STANDING_BUFFER`, with `BUFFER_PROBE` 5, in `sim/overrides.ts`) plays the targets at 5; its report went to a scratch folder and its numbers are here. A scratch probe outside the repo played the Steadfast campaigns again (100 greedy, 40 smarter) at 0 and 5 and dated each change from the log; its counts match the report's flips section campaign for campaign | The base report stays `targets-3.4.0.md`. Run again beside the variant (1,079 s on 6 workers), it reads as committed: every target and flip the same, the timing aside, and one mean on a rounding edge (the Orc's greedy `hexConquered` count, 2.1 against 2.0, summed in the order the workers finish) |

Standing changes a campaign, Steadfast (median; most), from the report's "Standing flips and conquest attempts":

| Rival | Smarter, 0 | Smarter, 5 | Greedy, 0 | Greedy, 5 |
| --- | --- | --- | --- | --- |
| Orc | 2; 4 | 2; 4 | 0; 4 | 0; 2 |
| Goblin | 4; 22 | 4; 8 | 5; 35 | 3; 13 |
| Dwarf | 1; 3 | 1; 1 | 4; 10 | 3; 7 |
| Archmage | 1; 1 | 1; 1 | 3; 11 | 2; 5 |

Changes followed by another within 7 days, of all changes (the probe):

| Rival | Smarter, 0 | Smarter, 5 | Greedy, 0 | Greedy, 5 |
| --- | --- | --- | --- | --- |
| Orc | 19 of 86 | 22 of 82 | 2 of 8 | 0 of 6 |
| Goblin | 62 of 200 | 28 of 149 | 246 of 654 | 27 of 369 |
| Dwarf | 9 of 52 | 0 of 40 | 58 of 385 | 7 of 330 |
| Archmage | 0 of 40 | 0 of 40 | 82 of 317 | 15 of 229 |

Greedy campaigns with 19 Goblin changes or more: 9 of 100 at 0, none at 5.

| Target | Buffer 0 (as built) | Buffer 5 |
| --- | --- | --- |
| G-08 (100 seeds; 40) | 1.21 vs 0.59 = 2.04×; 2.10× | 1.20 vs 0.59 = 2.04×; 2.01× |
| G-10 | lost dwarf; days dwarf; defenses orc; both ways orc; Goblin by deal 45%; surge weeks 100% | the same |
| G-19 (falls; Ultimatums) | 0%; 0%; 4%; 78%, 98%, 100% | 0%; 0%; 3%; 84%, 98%, 100% |
| G-20 | 3; 0; 2; 2 | 3; 0; 2; 1 |
| Conquest attempts a campaign (smarter; greedy) | 0.6; 1.1 | 0.4; 1.2 |
| Every other target | met | met, within a point or two (G-04 3.33 against 3.30; G-06 2.41× against 2.39×; G-11 Steadfast week 59 against 58, Committed by week 76 80% against 83%) |

- **It does what T-10 asked.** The Goblin's worst greedy campaign falls from 35 changes to 13 and his worst smarter one from 22 to 8, and the share of his greedy changes followed by another within a week from 38% (246 of 654) to 7% (27 of 369). The Dwarf's and the Archmage's quick reversals mostly go too. No median moves by more than 2.
- **The standings still move.** G-20's rivals reaching Peace (3) and War (2) are unchanged. Its last reading, each active rival's changes of standing sampled at the week closes (Steadfast smarter, median), falls from 2 to 1: met, at its floor.
- **He holds each end a little longer.** The Goblin's active weeks at Peace / Tension / War: smarter 12% / 79% / 8% against 18% / 75% / 7%; greedy 7% / 55% / 38% against 10% / 51% / 39%. The other rivals move a point or two.
- **The Orc barely notices.** His Respect climbs 3 for each raid of his beaten, so 5 points is two raids; with the smarter player he has 22 quick returns at 5 against 19 at 0.
- **G-19's Ultimatums move most.** Steadfast smarter campaigns with one: 25 of 40 at 0, 30 at 5 (Steadfast greedy 91% both). An Ultimatum comes from a rival's Ascendancy (A-177), not from his standing, and any change re-draws a campaign's later days, so some of this may be noise; the run can't tell which. No Steadfast campaign falls.
- **What taking it would cost:** a rules version step (play changes); the court's standing note and How to play's Diplomacy and Respect section saying the hold, from `RULES`. The live campaign carries forward with no migration: the buffer reads only the standing his save already holds.

| # | Target | Reading | Options | Recommendation |
| --- | --- | --- | --- | --- |
| T-10 | C-87 | At 5, the Goblin's most changes a campaign fall from 35 to 13 (greedy) and 22 to 8 (smarter), and his changes followed by another within a week from 38% to 7%; every target stays met; G-20's last reading falls to its floor (2 to 1); Steadfast smarter campaigns with an Ultimatum 25 to 30 of 40 | (a) accept the churn, the buffer left at 0; (b) the buffer at 5 for every rival; (c) hold any new standing at least 7 days (not measured) | (b) at 5: it removes the churn T-10 found and leaves the real moves to Peace and War as they were. With it, the court's standing note and How to play say the hold, and the rules version steps. Rich decides (D-02); `standingBuffer` stays 0 until he does. **Decided (Rich, 2026-10-19): (b) at 5** ("Take the standing buffer at 5 (T-10 option b)"); D-52, rules 3.4.1, section 12.5 |

### 12.5 Rules 3.4.1: the standing buffer at 5 (2026-10-19, D-52)

At Rich's go-ahead ("Take the standing buffer at 5 (T-10 option b): merge the buffer branch into patch-6, set it to 5, update the court note and How to play, step the rules version, and run the checks"). The probe's branch was fast-forwarded into `patch-6`.

- **`RULES.respect.standingBuffer` 5; `ruleVersion` 3.4.1.** The full Patch 6 build was already installed on the live game at 3.4.0, so a play change steps the version. A 3.x save carries forward in place, with no migration: the buffer reads only the standing the save holds.
- **The court's standing note** says the hold at the rival's own numbers ("At Peace he stays until his Respect falls below +55." for the Dwarf; "At War he stays until his Respect rises above −10." for the Orc). **How to play**'s Peace, Tension or War line says a standing holds until Respect is 5 past its line the other way.
- **A 3.4.0 fixture** (`scripts/fixture-3.4.0.ts`, written on 3.4.0's rules before the buffer was set; `tests/game/fixtures/campaign-3.4.0.json`) proves the live game's rules carry forward: it loads under 3.4.1 with no re-founding or migration, plays 12 weeks with no invariant broken, and on its first night keeps a standing within 5 of its line and leaves one past it.
- **Targets** ([targets-3.4.1](../game/sim/targets-3.4.1.md), regenerated): every target met, reading as the probe's buffer-5 run did. The Goblin's standing changes a campaign: smarter 4; 8 (was 4; 22), greedy 3; 13 (was 5; 35). G-08 2.04× on 100 seeds; G-11 54; 58; 69 (83% by week 76); G-20 3; 0; 2; 1.
- **Verification:** `npm run typecheck`, `npm test` (872 tests) and `npm run check:game` pass.


### 12.6 Rules 3.5.0 on this branch: Milestones at the day close (2026-10-19, D-53)

Not part of this patch: Rich asked that a Milestone break at the close of the day its weigh-in reaches the mark, not at the week close (D-53, `2c76bad`), and it was built on `patch-6` and installed on the live game the same evening. It was committed without a targets run; the run below was made afterwards (2026-10-20) on the committed build.

- **Targets** ([targets-3.5.0](../game/sim/targets-3.5.0.md), 692 s on 12 workers): every target met, as at 3.4.1. Nothing moves by more than the noise of a re-drawn campaign: G-08 2.08× on 100 seeds (2.04×), 2.06× on 40 (2.01×); G-11 54; 58; 69, Committed by week 76 85% (83%); G-07 in full 59 / 60 / 60 / 59 (59 / 60 / 59.5 / 59); G-21 1.03; 0.85; 0.62; behavior share 35% (36%); G-15 1.79 MB (1.81 MB). G-20 and the standing flips read as at 3.4.1 but for the Dwarf's most greedy changes, 8 against 7.
- **Why so little:** the simulator's players weigh in on Mondays and Thursdays (`sim/ledgerGen.ts`), so a mark reached on the Monday weigh-in now breaks at that day's close instead of the week close: the same Milestones, a few days sooner. No number changes.
- **Verification:** `npm run typecheck`, `npm test` (878 tests) and `npm run check:game` pass.

### 12.7 A fix: the Dwarf's pact kept (2026-10-21, rules 3.5.0)

At Rich's go-ahead ("Yes, fix the Dwarf's pact-kept bonus so it posts when the pact ends, with a test that runs it through settlement.").

- **The fault:** D-39's "a pact kept to its end +5" never posted. `weeklyRespect` looked for the pact in `state.deals`, but the close of its last day (`expireTimers`, a day phase) had already cleared it, and the week phases run after the day phases, so even a pact ending on the week close was gone.
- **The fix:** the `deal` event carries a running deal's last day (`until`), and `weeklyRespect` counts the Dwarf's pacts whose last day falls in the week from the log, as D-39 says. The rule itself is unchanged, so the version stays 3.5.0. No migration: the live save has struck no pact (a pact struck before this build has no `until` on its event and would not post).
- **Targets:** not run. The simulator's players strike no deals (`sim/` never calls `makeDeal`), so no target can move.
- **Test:** `rivals.test.ts` strikes a pact with the Dwarf at his mark and settles through the week after it ends: one +5, at that week's close. Without the fix it posts none.
- **Verification:** `npm run typecheck`, `npm test` (882 tests) and `npm run check:game` pass.

### 12.8 Rules 3.6.0 on this branch: the Respite day as a paid day off (2026-10-21 and 22, D-54)

Not part of this patch: Rich took his first Respite and still had the day's whole round to go through. He asked that a Respite day be a real, earned break. His first answers (2026-10-21) made it a quiet day: no battle on his land, nothing paid, the streak held. That build was never installed: its targets run missed G-02, G-08 and G-10, because the simulator's players rest through their rough weeks, which then went quiet. On 2026-10-22 he set out what he wants instead: "freeze the chronicle page so i dont have to load steps and calories and duties that day", the week's goals leaving the day out ("instead of 70k steps it just corrects to 60k"), and "act like PTO on the realm side, so i get paid everything i would normally get paid for the day (maybe like the realm consistency score can determine my valor/rep gain for the day)". He then chose the realm fighting as usual at a Valor of Realm Consistency, a full day × Realm Consistency, the streak growing, and the contract ending on its day. The Grand Battle waiting a day stays from his first answers.

| # | Asked | Built | Why |
| --- | --- | --- | --- |
| S-80 | Nothing to log | `isRestDay` and `respiteDays` in `state.ts`. On a rest day the Chronicle's tallies are read-only (`Tally`'s `frozen`), its duties can't be marked (`DutyList`'s `resting`, number keys too), and it shows no Healer cards or catch-up figures; nor do the Dawn tidings | Rich's "freeze the chronicle page" |
| S-81 | The week's goals leave the day out | Settlement reads every score from `scoredRecords`, the settled days less rest days: the week's pillars (the step pool's share shrinks by a day for each), Realm Consistency and the Valor step pace. The contract's score already left Respite days out. The Chronicle's week bar shows the corrected pool ("60,000 for the week, a day less for Respite"). The Healer's rough patch skips the day | Rich's "corrects to 60k"; Ch 4 rule 4 already said "removes that day from every pillar" (A-113 had narrowed it) |
| S-82 | Never slowing progress | The week's behavior income counts every day (`weeklyIncome`'s days are the calendar's), so its pay doesn't shrink with the pool. A week of rest days only is judged at Realm Consistency. Tithes count every day, as before | Rich's "without slowing progress" |
| S-83 | Paid like time off | `restDayIncome`: a full day's daily lines (every duty kept, food logged, the perfect day and the streak) × Realm Consistency; the streak grows. `streakBefore` counts a rest day as kept, even one spent on yesterday after it settled (whose pay stands) | The option Rich took |
| S-84 | Valor from Realm Consistency | `valorOn` and `liveValor` give a rest day Realm Consistency as its Valor, so the realm fights its day as usual at it: the day's threat, the player's orders or the standing siege, the Marshal's defenses. A Grand Battle's Readiness and the rivals' read of the week take it too | The option Rich took |
| S-85 | The contract ends on its day | `spendRespite` no longer moves the end (or a queued contract). `scoredDays` counts the rest day as one of the contract's days, at most its term, so a withdrawal pays for it and a contract an older Respite lengthened still counts only its term. The contract's day count reads its calendar span | The option Rich took |
| S-86 | A Grand Battle waits a day | `restGrandBattles` in `grand.ts` moves each battle due on the rest day and not begun to the first free day after it (`firstFreeDay`), an Ultimatum's `ultimatumUntil` with it, posted as `queued`; `takeRespite` runs it on the open day and the `grandBattlesAuto` phase on a rest day it closes. Once that battle has begun, today can't be a Respite (`respiteRefusal`) | Rich's first answers; he fights it himself the next day |
| S-87 | The screens say it | The Chronicle's banner and its Valor panel (Valor and pay at Realm Consistency); the Herald's `herald.threat.rest` (a placeholder for Rich, A3); the Contract page's Respite note and toast; the contract's progress line; How to play | So the day reads as a paid day off everywhere |

- **Carry-forward:** no migration. A Respite already spent on the open day makes it a paid day off at its close under 3.6.0; a closed day is never settled again. The live contract a 3.5.0 Respite lengthened (2026-10-21) keeps its end. A 3.4.0 save with a Respite on its open day settles it with the standing siege pressed, a full day paid at Realm Consistency, the streak grown and the Accord ending on its day (`carryForward.test.ts`). In that save's 12 weeks the automatic player's illness weeks are Respite weeks; they leave Realm Consistency, so its streak holds and the Dispensation grants Milestone 5 at a week close before the Monday weigh-in reaches 193, as it did under 3.5.0. That test now reads any Milestone broken, and D-53 for the regular ones.
- **Tests:** `restDay.test.ts` (the pay and the streak, whatever was logged; a Respite for yesterday bridging a broken streak, and Realm Consistency as if the day had no record; the pool shrinking and the pay not; the realm fighting at Realm Consistency and the contract ending on its day; a Grand Battle waiting; the refusal). The contract tests now read the end staying and a withdrawal paying for the rest day.
- **Targets** ([targets-3.6.0](../game/sim/targets-3.6.0.md), the paid day off, 575 s on 12 workers): every target met but one. **G-08** defending matters: land lost a week in bad weeks 0.80 against 0.58 in good (1.37× on 100 seeds, 1.33× on 40; 3.5.0 2.08×; the target 2×). G-02 and G-10, missed by the quiet day, are met again: the longest run of days with nothing 1 (median) and 2 (worst); the Orc's march the most hexes changing hands both ways. The rest moved a little in the player's favor: G-11 54; 58; 67 (Committed 90% by week 76, was 85%); G-19 Wavering falls 0% (3%), Ultimatums 75%; 96%; 100% (84%; 99%; 100%); G-21 1.07; 0.89; 0.65; behavior share 35%; G-04 3.41 net hexes a week (3.30).
- **Why G-08:** it sorts weeks by their mean Valor. The automatic player spends its banked Respite through its rough weeks (Steadfast one in 12), and a rest day's Valor is now Realm Consistency, so a rough week rested is no longer a bad week, and one the bank only partly covers is fought mostly at Realm Consistency. The weeks left below the bad line lose less land than they did. It is the rule doing what it is for: a rough week spent on Respite doesn't cost the realm. Rich decides (D-02). **Decided (Rich, 2026-10-22):** accepted ("Accept G-08 as the rest day working as intended"), and the build installed on the live game.
