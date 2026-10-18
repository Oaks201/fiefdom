# Patch 6 spec: catch-up figures, Dawn tidings, Respect by rival, a realm that moves by the day

Written 2026-10-18. **Status: approved as drafted by Rich on 2026-10-18, with the Orc's +75 perk as P6-07 (a)** ("Approved as drafted, with the Orc's +75 perk as (a): his beaten forces no longer strike back at their first dawn."). Rich's decisions of 2026-10-18 are in [section 1.1](#11-what-rich-decided-2026-10-18), with his words. What is still his to answer is in [section 1.2](#12-open-questions): only P6-08, after the simulator run. Every further rule Claude settled is a call, C-74 onward ([section 1.3](#13-claudes-calls)); Rich may overturn any of them. Every earlier number or rule this patch changes is an N-item ([section 1.4](#14-earlier-numbers-and-rules-this-patch-changes-d-02)). The build's own changes go in [section 12](#12-what-the-build-changed), and number changes from the tuning stage still come to him (D-02).

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
- **Measured, not switched on: conquest attempts planned on the day a rival goes to War (P6-08, T-09).** Built behind a rule switch that stays off; the simulator run measures it, and Rich decides.
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
| P6-08 | **Conquest attempts on the day a rival goes to War** | Decided after the simulator run (T-09, section 6.5) | – |

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
| Floor 1,700, limit 2,250. Five days logged, 13,500 in all. Two days left | "Even at the Healer's floor, 1,700, for the 2 days left, the week averages 2,414." |
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

- **`ruleVersion` 3.4.0** (C-94). `campaign.ruleVersion` stays the founding version (3.1.0 for Rich).
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
| `ruleVersion` | `3.4.0` |
| `respect.marks` | section 4.1's table (`orc: { war: −15, raidsStrongerAt: −40, ownDown: −60, raidsWeaker: 25, buysHex: 25, pact: 50, peace: null, envoy: null, sellsHex: null, callToArms: 45, ownUp: 75 }`, and so on for each rival) |
| `respect.standing`, `respect.raidsStrongerAt`, `respect.own.up`, `respect.own.down`, `respect.thresholds.{raidsWeaker, sellHex, goblinBuysHex, pact, envoy, buyHex, callToArms}` | retired into `respect.marks` |
| `respect.own` | keeps its effects (`orcConquests`, `goblinGreedSteps`, `goblinOfferMult`, `dwarfWildWallMax`, `archmageSurgeMult`) and gains the Orc's +75 perk per P6-07 |
| `rivalAi.planConquestOnWar` | `false` (C-93) |
| `rivalAi.grabDays` | `{ min: 1, max: 7 }` (C-91) |
| `rivalAi.wallDays` | `6` (C-92) |

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
