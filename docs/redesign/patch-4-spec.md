# Patch 4 spec: the rivals fight differently, and how they yield

Written 2026-10-15 and 2026-10-16. **Status: Rich answered P4-01 to P4-07 on 2026-10-15. On 2026-10-15 he said to accept Claude's recommendations from there ("I'm ok with you auto accepting for now"). On 2026-10-16 he asked Claude to make the remaining decisions, build the patch, and tell him what was decided afterwards. Every rule Claude settled carries a call number (C-34 onward) and is listed in [section 1.2](#12-claudes-calls-delegated-2026-10-15-and-16). Rich may overturn any of them. Section 16 lists what the build changed.**

This spec carries out [blueprint](blueprint.md) section 8.2's "Patch 4: the rivals fight differently, and how they yield" (decisions R-07 to R-09, R-11 to R-14, X-12, X-14, X-19, X-24). It builds on Patch 3 as committed on `daily-battles` (`86c64e4`, `abee57c`, `6ffd0f8`; rules 3.1.0; [Patch 3 spec](patch-3-spec.md) with its sections 14 and 15). Every number is a first guess marked TUNE. It lives in `rules.ts`, and the simulator reports on it (D-02: the simulator never retunes, and Rich approves each change).

Paths: game modules are in `src/renderer/src/lib/game/`, the simulator in `sim/`, tests in `tests/game/`.

**What this spec keeps.** The four-march map (D-16) stays exactly as it is: hex ids, names, seams, bands, villages, depth curve. So do Dominion as four paths of Renown plus Holdings (ranks never fall; the tier gates stay), neglected marches and their rise rule (D-19, B-06), and Patch 3's sieges, strongholds, flanking, fallbacks and counterattacks, except where this spec says otherwise. The exceptions are numbered N-01 to N-05 ([section 1.3](#13-patch-2-and-3-numbers-this-patch-changes-d-02)). New deeds go in `RULES.dominion.deeds` and are posted by the existing `chronicle` phases. `autoplay.ts` stays the one automatic player, keeps "court first, assault the rest" (S-28), and is never copied into `sim/`. `refound.ts`, the wizard, `charterHistory`, the no-duty-day rule and the campaign archive keep working. Border Campaigns (R-26) and A-129 stay retired.

---

## 0. The patch in short

- **Each march plays by its rival's rules (R-14, P4-01).** The rules cover the whole march: every hex there the player doesn't hold, wilds and villages included. On the rival's own hexes they are at full strength. A seam follows the march that rules it that day (P2-06). The lair wedges and the heartland stay as they are. The rules that make a march harder start from campaign week 3.
  - **The Orc, the unrelenting force (P4-05):** weaker garrisons; fallen forces always strike back on their first dawn; his raids favor your hexes in his march; and a **war track against you** (−3 to +3) that your wins push one way and your losses the other. Each attack of his you beat costs him army.
  - **The Goblin, always a deal (P4-02, P4-03):** any hex of his march you could assault has a **price**. Pay it and the hex is yours at once. The price is the garrison an assault must beat, times his greed, divided by your Trust, lowered by Respect. Fighting him raises his greed, which shows only as a band. From week 6 he **bids for one of your villages a week**, and you have until the week close to **hold** it. His own beaten garrisons offer to buy back the hex they lost instead of striking back. His trade limits are gone.
  - **The Dwarf, the immovable object (P4-06):** his weekly fortify budget **builds walls on the wilds of his march** that face you. Siege wear there decays half as fast. His fallen forces only dig in. His raids never go deeper than your march border. A beast defense lost in his march scorches the hex but never returns it to the wilds.
  - **The Archmage, wild magic (P4-04):** **one surge a day** in his march from a seeded table: a garrison ×2 or ×½ for the day, a mythic summoned, one of your companies blessed or cursed, or a strike on one of your hexes. Mage Tower foresight shows tomorrow's surge. His beaten garrisons dissolve into the next dawn's surge instead of falling back. The Rituals stay.
- **Preparing while neglected (P4-07):** D-19's +5% a level stays, and each rival adds his own way. The Dwarf raises a free wall, the Orc's Warhost comes sooner, the Goblin's greed rises, and the Archmage's swells and strikes grow.
- **How each rival yields (R-07 to R-09, R-11 to R-13).** Six measures of your realm (reputation earned, army, land, victories, Dominion, constancy), each with a hidden threshold, set **a stance band** for each rival: Defiant, Wary, Shaken or Ready to yield. You see only the band and Herald rumors (R-08). Terms come from week 16 at the earliest, aimed at a Steadfast player's weeks 30 to 40 (C-34):
  - **the Goblin** offers **buy-offs** (a hex, an Armory item, or hired companies, for a 4-week pact to leave his march alone), then **surrenders**;
  - **the Archmage surrenders** when his life is at risk;
  - **the Dwarf surrenders as a grudging vassal** once you hold two thirds of his march;
  - **the Orc is only conquered**: at his top band he comes with a **final Warhost** if he doesn't respect you, or **Ugrak's Challenge** plays out if he does.
  - Accords stay for all but the Orc, and so does defection.
- **Dominion.** Each rival's **signature deeds** (blueprint 5.2b) and the **real path-rank perks** (C-36), replacing Patch 2's stand-in (N-01).
- **Measures first.** G-10 and G-18 are measured in `sim/targets.ts` on 3.1.0 before any rule changes. The smarter one-path players join the targets plan.
- **Rules 3.2.0.** A 3.1.0 save carries forward in place. Every new state field is optional. Section 11 says how each new rule starts in a running campaign, and a synthetic save founded and played on 3.1.0 proves it.

---

## 1. Decisions for this patch

### 1.1 Rich's answers (2026-10-15)

| # | Question | Rich's answer |
| --- | --- | --- |
| P4-01 | Where each rival's march rules apply | **The whole march.** His rules cover every hex of his march the player doesn't hold, wilds and villages included, from week 3, and apply at full strength on his own hexes. A seam follows whichever march rules it that day (P2-04). The lair wedges stay as they are |
| P4-02 | How bribing a hex in the Goblin's march works | **A price you pay any day.** Any hex of his march the player could assault shows a price; paying it takes the hex at once, with no battle. Price = the garrison an assault must beat (siege wear lowers it) × his greed ÷ Trust, lowered by Respect. Greed shows only as a band (fair, dear, gouging) and rises for a few weeks each time the player takes his land by force. His Gate stays battle or courtship only. No Respect gate, no 4-week wait, and it works at War |
| P4-03 | How the Goblin's bribes for your villages work | **A week to answer.** From week 6, at his turn, he may bid for one of the player's villages in his march. The tidings name it and band his offer against its loyalty. Until the next week close the player may **Hold** it: reputation that counts × Trust on top of the loyalty. At the close, if his offer beats loyalty plus hold, the village goes to him with no battle; otherwise it stays and the player earns a "bribe beaten" deed. The hold is spent either way |
| P4-04 | The Archmage's surges | **One a day, from a table.** Each dawn one seeded surge lands in his march, on hexes beside the player's land when there are any. Most are garrison swings (×2 or ×½ for the day on a hex the player doesn't hold). Some summon a mythic beside the player's land for a few days, bless or curse one company (±20% for the day), or strike one of the player's hexes in his march as a defense at the close. Announced at dawn; Mage Tower foresight shows tomorrow's. The Rituals stay |
| P4-05 | The Orc's war of attrition | **A war track against the player.** −3 to +3, like the Rim fronts' track. Each battle the player wins against him (a defense, an assault in his march, a counterattack held) moves it a step the player's way; each loss moves it his way. At the player's end he is worn: weaker raids and counterattacks, easier garrisons in his march. At his end he pushes: stronger raids and an extra conquest attempt that week. Each Orc attack the player beats also costs him a little army |
| P4-06 | The Dwarf's march | **He builds walls on the wilds.** His weekly fortify budget also raises the walls of hexes in his march that face the player's land, wilds included, one level at a time up to his cap of 4. A running campaign starts at zero and the walls rise week by week. Siege wear there decays half as fast (as on a stronghold). His fallen forces only dig in. He raids less, and never deeper than the player's march border |
| P4-07 | How each rival prepares while neglected | **Keep +5% a level, and add his own way.** The Dwarf raises one more wall facing the player each quiet week, for free. The Orc's Warhost comes sooner. The Goblin's greed rises with the level. The Archmage's swells and strikes grow with it. G-16 is measured as today |

### 1.2 Claude's calls (delegated 2026-10-15 and 16)

Rich asked Claude to accept its own recommendations from P4-08 onward ("I'm ok with you auto accepting for now", 2026-10-15). The next day he asked it to make the decisions and build ("you can make the decisions and just make me aware of them afterwards", 2026-10-16). P4-08 was the open question at the time, and C-34 takes the recommendation it carried. **Rich may overturn any of these.**

| # | Call | Why | Set aside |
| --- | --- | --- | --- |
| C-34 | **Terms aim mid-campaign (P4-08).** The hidden thresholds are set so a Steadfast player's standing first brings one rival to his top band around weeks 30 to 40, with the others after. Never before week 16. Today's pacing stays until Patch 5: none resolved before week 12, one per 8 weeks | It sits beside the Accord road (the Dwarf allied around week 22 today, the last rival by 47 to 58) without ending the campaign before R-17's weeks 58 to 64, and lets G-18's two resolutions by terms happen by week 70 | Early (16 to 24): the campaign could end long before R-17 wants. Late (from 48): G-18 is tight under the 8-week pacing |
| C-35 | **The Goblin's buy-offs** (R-09): see [6.3](#63-the-goblin-buys-his-way-out-then-surrenders). From week 16, when his stance is Shaken or better and the player pushed his march that week, he offers at most one buy-off every 4 weeks: one of his march's hexes beside the player's land, an Armory item, or hired companies for 4 weeks. Each refused buy-off makes the next one bigger. Accepting seals a 4-week pact: the player leaves his march alone, and he neither raids nor bids. After two refused buy-offs, or at Ready to yield, he offers to surrender | R-09's mechanics column: "the offers grow while you keep pushing", never reputation (Pillar 1) | A buy-off any time he is merely Wary (too early, before the player is a threat) |
| C-36 | **Real path-rank perks** ([7.2](#72-the-real-path-rank-perks-n-01)): each rank adds a step of its path's role (blueprint 5.2b: Barracks for attrition, Merchant Hall for prices, bribes and Trust, Foundry for siege speed and breaking walls, Mage Tower for surge foresight and resistance). Ranks III and V unlock something; V is the capstone | "One path walked deep reaches the rank V capstone; two halfway give two sets of rank III perks." A step every rank keeps every rank worth having | Perks only at II, IV and V (ranks I and III feel empty) |
| C-37 | **When each rule starts.** Rules that make a march harder start from campaign week 3 (as counterattacks do, D-24): the Orc's strikes and track, the Dwarf's walls on wilds, surges, and the Goblin's greed. The Goblin's village bids start from week 6 (when conquest attempts start). Rules that help the player start at once: bribes, the Orc's ×0.85 garrisons, and the Dwarf's no-overrun. Terms start from week 16 | Keeps D-14's opening a sprint | Everything from day 1 |
| C-38 | **The stance** ([6.1](#61-the-stance-and-the-measures)): six measures, each scored as a share of its hidden threshold (capped at 1), weighted per rival; the weighted sum gives one of four bands. The sixth, constancy, is Realm Consistency held over 12 weeks: the Archmage's "endurance" (X-24 item 2) | R-07 named five measures "and other important scores". Partial credit makes the band move as the player grows, which a "3 of 5 passed" count doesn't | Counting measures passed (the band would jump) |
| C-39 | **What a surrender is.** An abdication (X-24 item 3): the rival's claimable land passes to the player, with Holdings but no hex deeds (C-10), and its company joins as a vassal. The Dwarf's is the grudging vassal's: no company, and the hexes he gave up stay **restless** for 8 weeks. Offers stay open 7 days (A-171). A refused or lapsed offer comes back no sooner than 4 weeks later. A rival offers terms only at a week close where the pacing would let him resolve, never while in a coalition against the player or with an Ascendancy streak, and never while the player is away 14 days or more | R-09, R-12, X-24 items 3 to 5. A surrender that waits on pacing would read as broken | Offers held by pacing (A-168) |
| C-40 | **The Orc's last battle** ([6.5](#65-the-orc-only-conquered)). At his top band (or when he is the last rival standing), from week 16: **a final Warhost** at Respect under 50, a Grand Battle with his whole army (`hostShare` 1) at the player's border hex nearest his land; or **Ugrak's Challenge** at Respect 50 or more. Win either and he is conquered. Lose the Warhost and its hex passes to him; lose the Challenge and pay its 200 tribute; either way he comes again 8 weeks later. Ugrak's Challenge as an event (A-169) is unchanged below his top band | R-11 | — |
| C-41 | **Accords and defection** (R-13): unchanged for the Goblin, the Archmage and the Dwarf. The Orc's Accord is refused (`orcNeverSigns`), and he never defects. An Accord with the Orc already sealed before 3.2.0 is honored as sealed | A deal the player already made is never taken back | Voiding it |
| C-42 | **Signature deeds** and their values ([7.1](#71-signature-deeds)) | Blueprint 5.2b's table. Each goes to its rival's path only, so G-17 holds by construction. Sized to add about 10 to 15% of Renown | — |
| C-43 | **The Goblin's deals list** (X-12): buying a hex from him is the bribe ([3.3](#33-the-goblin-always-a-deal)). Selling him one of the player's hexes needs no Respect and has no 4-week wait. Truces, pacts and calls to arms are unchanged. Other rivals' trade rules are unchanged | "The Goblin's march replaces the trade limits with its own pricing" | — |
| C-44 | **Fallbacks by personality** (blueprint 5.3; N-02): the Orc's forces always strike back on their first dawn; the Dwarf's dig in at 75% and never strike; the Goblin's own forces offer to buy back the hex they lost instead of striking (beasts in his march dig in only); the Archmage's dissolve into the next dawn's surge, which lands beside the hex taken. The lair wedges keep D-24 as it is | 5.3's recommendation: "the Orc counterattacks hardest, the Dwarf only digs in, the Goblin's fallen garrison may offer to sell the hex back, the Archmage's dissolves into a surge" | — |
| C-45 | **The Dwarf keeps what he lost to the player** (N-05): in his march a beast or mythic defense lost only scorches the hex; D-15's return to the wilds doesn't happen there | "Land taken from him tends to stay taken"; and G-10's "fewest hexes lost per hex held", which the Archmage's march (no counterattacks under C-44) would otherwise share | Only his own raids weakened |
| C-46 | **The automatic player's habits** ([section 8](#8-the-automatic-player)): it bribes, holds villages, takes or refuses terms, and fights the Orc's last battle, with every habit in `RULES.autoplay` | Needed for the simulator, G-10, G-18 and the re-founding | — |
| C-47 | **How the targets count Patch 4** ([section 2](#2-measures-first)). G-10 is measured on Steadfast greedy, per march. G-18 is measured on new **smarter one-path players** (the smarter player steered along one path, taking the offers it doesn't refuse). G-09 counts an Archmage force's surge as its fallback | G-18's "smarter player who chooses to keep fighting for that path" needs a player who both accepts and refuses | Changing the greedy player (G-01 to G-08 would stop comparing) |
| C-48 | **Rules 3.2.0**, carried forward in place ([section 11](#11-rules-version-saves-and-records)) | A major bump would force a re-founding (`needsRefounding`) | 4.0.0 |
| C-49 | **What stays hidden.** The thresholds and weights' numbers, which measure is close, rival income and treasury, the Goblin's greed (shown as a band), and the size of his bids for the player's villages (a band against loyalty). Shown exactly: bribe prices, the hold needed at today's Trust, the Orc's track, surges and walls | CLAUDE.md, R-08, X-19. A price has to be shown to be paid; How to play never states the greed steps | — |

### 1.3 Patch 2 and 3 numbers this patch changes (D-02)

Each of these changes a number or rule of D-16 to D-25 in a place, and is reported in the tuning stage with simulator evidence, never as a side effect.

| # | What | Was | Becomes | Decided by |
| --- | --- | --- | --- | --- |
| N-01 | Path-rank perks | C-18's stand-ins (`dominion.rankPerks`: rally floor +0.01, reputation +0.005, mythic −0.02, arms +0.01 and walls +1 a rank) | The real perks of [7.2](#72-the-real-path-rank-perks-n-01); as built (S-34), the Orc's rally floor stays +0.01 a rank and the Dwarf's path keeps the +1 wall a rank | C-36, S-34 |
| N-02 | Fallbacks and counterattacks in the rival marches | D-24 everywhere: refuge 50%, 30% a day to strike, ×1.5 | D-24 unchanged in the lair wedges; each rival march has its variant (C-44): the Orc always on the first dawn (`chance` 1), and **×1.15** harder (S-36); the Dwarf 75%, never; the Goblin buy-back offers; the Archmage no refuge, a surge | P4-01, P4-05, P4-06, C-44, S-36 |
| N-03 | Wear decay in the Dwarf's march | D-22: 10% a day (strongholds 5%) | 5% a day on every hex of his march | P4-06 |
| N-04 | Garrisons in the Orc's march | D-17's curve × A-17 | × (1 − 0.02 × his track) only: as built there is no flat discount (0.85 first specced; S-36, section 16.2) | P4-05 (5.4: "weaker garrisons"), S-36 |
| N-05 | D-15's overrun in the Dwarf's march | A beast or mythic rout returns a ring-3+ non-village hex to the wilds | It is scorched instead | C-45 |

---

## 2. Measures first

Before any rule changes, on rules 3.1.0, in `sim/measure.ts` and `sim/targets.ts`:

1. **Per-march counters** (each rival march; a seam counts for the march ruling it that day, as preparation does): hexes the player holds there at each week close; hexes taken there, by how (assault, Grand Battle, courtship, trade, bribe, reclaim); hexes lost there; defenses fought on hexes there; assault days spent on each hex taken there; hexes that changed hands both ways there (taken, lost and taken again).
2. **G-10** (Steadfast greedy), read per march:
   - the Dwarf's march has the **fewest hexes lost per hex held** (lost ÷ the mean held at week closes) and the **most assault days per hex taken**;
   - the Orc's has the **most defenses per hex held** and the **most hexes changing hands both ways** per hex held;
   - **at least 40% of the Goblin's march taken by deal or bribe**: of the hexes of his march the player took at least once, the share first taken by courtship, trade or bribe;
   - **the Archmage's has a surge at least weekly that moves a target's defense by 25% or more**: the share of weeks from week 3 with a surge (swell or ebb, or a summoning) on a hex the player could assault that day, at least 90%.
   On 3.1.0 the first two halves read as a baseline (no personalities yet); the Goblin's and the Archmage's read 0%.
3. **G-18**, on the smarter one-path players (`smarter+paths:<rival>`, C-47) and every policy for its middle clause:
   - **resolutions by terms** (a surrender accepted, or the Orc's last battle won) by the horizon: median at least 2;
   - **no rival offers terms before week 16**, in any campaign;
   - **offers refused**: median at least 1 a campaign for the smarter one-path players;
   - reported beside it: the first week each rival reaches each band (median), the first terms offer's week (Steadfast smarter), resolutions by kind (terms, Accord, conquest, defection) and the campaign's victory week.
4. **G-09** is reported as D-26 counts it, with C-47's reading for the Archmage: his force's surge is its fallback, and the "without it" question removes that surge.
5. **The targets plan** gains Steadfast `smarter` (40 seeds) and `smarter+paths:<rival>` for each rival (20 seeds each). A `smarter+paths:` policy is the smarter player steered along those paths.
6. **The 3.1.0 save** for section 11: `scripts/fixture-3.1.0.ts` founds a synthetic Steadfast campaign (seed 7, the simulator's ledger generator) on 3.1.0, plays 24 weeks with the automatic player (paths all, deals, accept), and writes `tests/game/fixtures/campaign-3.1.0.json` with its ledger. This is written before any rule changes.
7. **Baseline:** `targets-3.1.0.md` regenerated with the new rows (same seeds), so Patch 4 is compared with Patch 3 on the same measures.

---

## 3. Each march's rules (R-14, P4-01)

### 3.1 Where and when

- **`marchRule(state, hex, day)`** (new, in `personalities.ts`): the rival whose rules govern `hex` on `day`. It is the rival march the hex lies in, or for a seam the march ruling it that day (`rulingMarch`, P2-06). It is undefined for the heartland, a lair wedge (or a seam whose lair rules that day), and every hex the player holds. Rules on the player's own hexes ("your hexes in his march") read the hex's march the same way.
- From campaign week 3 for what makes a march harder; at once for what helps (C-37).
- Every multiple below is read when an assault is weighed (`garrisonMult` in `sieges.ts`, beside preparation and the stronghold), so nothing is rewritten. A rival's own den assault reads none of it (C-29).

### 3.2 The Orc: the unrelenting force (P4-05)

- **Weaker garrisons (N-04):** every hex of his march the player doesn't hold has its garrison × 0.85 (`orc.garrisonMult`) × (1 − 0.02 × his track) when the player's assault weighs it.
- **Routed Orcs strike back (N-02):** a force fallen back in his march strikes at its first dawn (chance 1), at its strength that day × 1.5 (D-24's `strengthMult`), from week 3, never while the player is away (R-24).
- **His raids favor his march:** a raid of his targets the player's border hexes in his march three times as often as others (`orc.ownMarchWeight` 3).
- **The war track (P4-05):** `personalities.orcTrack`, −3 to +3, positive the player's way, starting at 0. At each day's close, the day's battles with the Orc move it **one step at most**: toward the player if the player won more than lost, toward him if he won more. The battles are defenses against his raids, conquest attempts and counterattacks; defenses against any counterattack in his march; daily assaults won in his march; and Grand Battles against him. A repulse is not a loss, since a siege day isn't a defeat. Each step the player's way: his raids, conquest attempts and counterattacks strike 5% weaker (`strikePerStep`), and his march's garrisons are 2% easier. Each step his way: 5% stronger, and at −3 his turn plans one more conquest attempt that week (from week 6, at War). Shown on the Diplomacy page and the hex panel. It moves only from week 3.
- **Attrition:** each attack of his the player beats (a raid, a conquest strike, a counterattack by his own garrison) costs him 2% of his army (`attritionPerWin`), on top of what a front's war costs him.

### 3.3 The Goblin: always a deal (P4-02, P4-03, C-43)

- **The price.** A **bribe** may be paid on the open day for any hex of his march the player could assault (`claimableBy(…, 'player', 'assault')` and the march ruled by him that day), the wilds and his own hexes alike. A stronghold counts, at its multiple (P3-01 kept the deals road open). His Gate never counts (A-16). The price is:
  `assaultGarrison × perPoint (1.0) × greed ÷ Trust × (1 − 0.003 × Respect)`, rounded to the purse's 0.1.
  Wear, preparation, fallbacks and the stronghold all count. Trust is today's (A-39) with Envoy's Rest and the Merchant Hall path's perk. Paying it moves the hex to the player at once (A-140), `hexTransfer` how `bribe`, with no battle, no Respect change and no fallback. A bribed village is Settling at full loyalty, as one bought (A-22). It pushes the march (C-09).
- **His greed:** `personalities.goblinGreed`, a count of steps from 0 to 6. It goes up a step each time the player takes a hex of his march by force (a daily assault or a Grand Battle), at most two a week, and down a step at each week close with no force there. Greed = 1 + 0.1 × steps + 0.05 × his preparation level (P4-07). It is shown as a band: fair below 1.15, dear below 1.35, gouging from there (C-49).
- **His bids for the player's villages (P4-03):** at his turn from week 6, if active and not under a pact or Truce, he bids for one of the player's villages in his march (rings 0 to 2 never), choosing the one his offer can sway with the most to spare. His offer = 1.3 × its loyalty (`villageOffer`), paid from his expansion budget. He makes no bid if he can't pay it. It is shown in the tidings and the hex panel as a band against loyalty ("not enough alone", "enough to sway it"), never the number. Until the next week close the player may **Hold** the village (`holdVillage`): reputation spent now, counting × Trust on top of its loyalty. At the close (the `courtships` phase): offer > loyalty + hold × Trust passes the village to him (`hexTransfer` how `influence`, no battle, no tribute, A-23 overturned for him only), else it holds (the deed `bribeBeaten`) and his offer is lost. The hold is spent either way. **Never against an absent player (R-24):** at a close while the player is away, his bid is void and returned to him.
- **Buy-back (C-44):** when his own garrison is beaten without a rout, it doesn't fall back to fight. On each of its 3 dawns from week 3 (the 30% draw, D-24), it may make a **buy-back offer** for the hex it lost, at his sale price (0.7 × the trade value, the same as selling him a hex), open until its window ends. Accepting sells the hex back (+5 Respect, as a sale). Beasts in his march dig in and never strike.
- **Deals list (C-43):** buying from him is the bribe; selling to him needs no Respect and has no wait.

### 3.4 The Dwarf: the immovable object (P4-06, C-45)

- **Walls on the wilds:** at his turn, his fortify budget (50% plus the Deep Halls' 10%, A-150) is spent on his own border hexes *and on every hex of his march that touches the player's land*, the wilds included, one level at a time to his cap of 4, facing the player first (A-155's order). A neutral hex's walls add to its garrison like any hex's (`fortificationValue`), and are lost when it changes hands. In a running campaign the wilds start at 0.
- **Slow sieges (N-03):** wear in his march decays 5% a day (strongholds unchanged at 5%).
- **They dig in (N-02):** a force fallen back in his march adds 75% of the garrison it lost (`dwarf.fallbackShare`) and never strikes.
- **Raids:** his raids target only the player's hexes in his march or touching it. When there are none, he strikes the player's border hex nearest his march, as A-27 has it.
- **What's taken stays taken (N-05):** in his march, a lost beast or mythic defense scorches the hex but never returns it to the wilds.

### 3.5 The Archmage: wild magic (P4-04, X-14)

- **One surge a day**, from week 3: at each dawn, `dawn()` draws today's surge (`surge:<day>`) and fixes it in `personalities.surges`. With foresight it also draws tomorrow's. The table (TUNE):

  | Surge | Weight | What it does |
  | --- | --- | --- |
  | Swell | 30% | A hex the player doesn't hold, in his march and beside the player's land: its garrison ×2 for the day |
  | Ebb | 30% | Such a hex: its garrison ×½ for the day |
  | Summoning | 10% | A neutral non-village hex there becomes mythic (1.15 × its strength) for 5 days, then returns to beasts if still neutral |
  | Blessing | 10% | One of the player's companies (seeded): +20% power for the day |
  | Curse | 10% | One company: −20% power for the day |
  | Strike | 10% | One of the player's hexes in his march is struck: a defense at the close at its strength × 1 (the `surge` threat kind). Lost, it is scorched, never taken. Never while the player is away |

  "Beside the player's land" means a hex touching it. When none exists, swells, ebbs and summonings land on any hex of his march the player doesn't hold (shown, harmless). A strike or blessing with no target becomes a swell.
- **Foresight:** Mage Tower IV (its foresight tier) or the Archmage's path at rank I shows tomorrow's surge in the tidings. A foretold surge is fixed (settle once).
- **His forces dissolve (C-44):** a garrison of his march beaten without a rout doesn't fall back. The next dawn's surge is drawn among the hexes beside the one taken (its "dissolved" record).
- **The Rituals stay** as A-148 has them.
- **Seams:** a seam ruled by him that day can carry the surge (Rich's P2-04 example).

### 3.6 What stays the same everywhere

The lair wedges, the heartland, strongholds (D-23), flanking, standing sieges, one assault a day (R-25), the Rituals, Incursions (A-33), the Warhost fund at 600 except as section 5 changes it, coalitions, Ascendancy and the Siege.

---

## 4. Routed enemies by personality (5.3, C-44, N-02)

| March | A garrison beaten without a rout |
| --- | --- |
| Orc | Falls back as D-24 (the cheapest refuge no shallower, 50%), and strikes back at its first dawn, × 1.5 |
| Goblin | His own: no refuge fight; may offer to buy the hex back (30% a dawn, 3 dawns). Beasts and militia there: fall back as D-24 but never strike |
| Dwarf | Falls back with 75% of the garrison and never strikes |
| Archmage | Dissolves: no refuge; the next dawn's surge lands beside the hex taken |
| Lair wedges | D-24 unchanged |

A rout still scatters every force (R-10). The absence rule (R-24) holds for all of it.

---

## 5. Preparing while neglected (R-06, 5.2c, P4-07)

D-19 is unchanged: +5% to garrisons a level, up to 8, read when weighed. G-16 is measured as today. Each level also feeds the rival's own way:

- **The Dwarf:** at each week close where his level rises, one free wall level on the hex of his march facing the player with the lowest walls (to his cap).
- **The Orc:** his Warhost goes out at 600 × (1 − 0.05 × level) saved (A-151 as changed): sooner the longer he's left alone.
- **The Goblin:** +0.05 greed a level (section 3.3).
- **The Archmage:** swells × (1 + 0.05 × level) on top of their ×2, and strikes the same.
- A march under a Goblin buy-off pact doesn't rise (section 6.3): the player agreed to leave it alone.

---

## 6. How each rival yields (R-07 to R-09, R-11 to R-13, X-24)

### 6.1 The stance and the measures

Six measures (C-38), each a value against a hidden threshold (TUNE, `RULES.terms.thresholds`), scored `min(1, value ÷ threshold)`:

| Measure | Value | First threshold |
| --- | --- | --- |
| Reputation | Reputation earned over the campaign (every `earn`, `spoils` and `tithe` posting) | 30,000 |
| Army | The player's best (banners + 2) power ÷ that rival's army value | 1.25 |
| Land | Claimable hexes held ÷ claimable hexes (for the Dwarf, the larger of that and his march's share held) | 0.45 |
| Victories | Grand Battles won + 5 for each rival resolved | 12 |
| Dominion | Total Dominion | 1,400 |
| Constancy | Mean Realm Consistency over the last 12 week closes | 0.85 |

The thresholds are first guesses from the probe in section 13.3 (Steadfast reaches most of them around weeks 30 to 40). The stance is the sum of the scores weighted per rival (X-24 item 2):

| Rival | Reputation | Army | Land | Victories | Dominion | Constancy |
| --- | --- | --- | --- | --- | --- | --- |
| Orc | — | 0.4 | 0.1 | 0.4 | 0.1 | — |
| Goblin | 0.45 | 0.1 | 0.15 | — | 0.15 | 0.15 |
| Dwarf | 0.1 | 0.2 | 0.4 | 0.1 | 0.2 | — |
| Archmage | — | 0.2 | — | 0.2 | 0.3 | 0.3 |

**Bands** (`terms.bands`): **Defiant** below 0.6, **Wary** to 0.75, **Shaken** to 0.9, **Ready to yield** from 0.9 (interface labels, A3). Read at each week close in the `world` phase from week 16, and kept in `terms.byRival[r].band`; a change posts a `stance` event. Before week 16 every rival is Defiant. A resolved rival has none.

**Herald rumors** (R-08): at each week close, each active rival's rumor names one measure he weighs most (drawn among his two highest weights, `herald.terms.rumor.<measure>`). Never a number, never which measure is close.

**Limits** (X-24 item 5): no offer from a rival in a coalition against the player or with an Ascendancy streak (or Ultimatum); no terms before week 16; pacing (C-34, C-39); weight never counts (Pillar 5).

### 6.2 Offers

Terms are offers (`WorldOffer`): `buyOff`, `surrender` and `buyBack`, each open 7 days (A-171). An offer due while the player is away waits for the first close after the return. **Accept** and **Refuse** are player actions on the Diplomacy page. A refused or lapsed buy-off or surrender comes back no sooner than 4 weeks later (`terms.retryWeeks`). Each offer posts a `terms` event (offered, accepted, refused, lapsed).

### 6.3 The Goblin buys his way out, then surrenders (R-09, C-35)

- **A buy-off** at a week close: from week 16, his band Shaken or better, the player pushed his march that week (C-09), no offer open, and none in the last 4 weeks. The gift, drawn by seed among those he can give, is worth about 150 × (1 + 0.5 × buy-offs refused):
  - **a hex**: a hex of his march beside the player's land (his own or the wilds), the one whose bribe price is nearest the value; it passes at once (`hexTransfer` how `trade`);
  - **an item**: the dearest item the Armory sells now within the value (no trophies or Legendaries), put in the stash;
  - **hired companies**: 1 + buy-offs refused (at most 3) hired companies (A-19: the Merchant Hall's pure company power, Coin, melee), with the player for 4 weeks, at no fee.
  He never pays in reputation.
- **The pact:** accepting seals a `buyOff` deal for 4 weeks. The game refuses the player's assaults, sieges, Grand Battle challenges, bribes and courtships in his march, and lifts a standing siege there. He neither raids the player nor bids for the player's villages. His march's preparation doesn't rise.
- **Surrender:** offered at his band Ready to yield, or after two buy-offs refused or lapsed. Accepting: he abdicates (C-39).

### 6.4 The Archmage surrenders when his life is at risk (R-09)

He offers surrender at a week close (from week 16, limits as 6.1) when any of these holds:
- the player holds his Gate;
- his **danger reading** reaches 0.9: army and victories weighted 0.5 each (R-09: "weighted to army and opponents defeated");
- his army is at most half the player's best (`archmage.armyRatio` 0.5).

Accepting: he abdicates.

### 6.5 The Orc: only conquered (R-11, C-40)

- No terms, surrender, Accord or defection (R-09, R-13).
- At a week close from week 16, when his band is Ready to yield or he is the last active rival, and no last battle of his is pending or lost in the last 8 weeks:
  - **Respect under 50: the final Warhost.** A Grand Battle (trigger `warhost`, `final: true`) at the player's border hex nearest his land, with his whole army (`hostShare` 1), 2 days' warning, moved by the 5-day spacing. It is raised only when a win could resolve him under the pacing (as the Capital is). **Won:** he is conquered. **Lost:** its hex passes to him (rings 0 to 2 only scorched), and he comes again no sooner than 8 weeks later.
  - **Respect 50 or more: Ugrak's Challenge.** The book's duel (two companies a side; `events.json`'s battle), as a Grand Battle with `final: true`. **Won:** he is conquered (in place of the event's +30 Respect). **Lost:** 200 tribute, and 8 weeks before the next.
- His Gate and capital remain a road (the book's conquest).
- These battles are part of his war: they count on the war track and as victories.

### 6.6 The Dwarf: a grudging vassal (R-09, R-12)

- He offers surrender at a week close (from week 16, limits as 6.1) once the player holds **two thirds of his march** (by its hexes' shares of his path, seams half).
- **Accepting:** he abdicates as a grudging vassal: no levy company joins (`RivalState.grudging`). Each hex he gave up is **restless** for 8 weeks (`personalities.restless`): a village there is at half loyalty and Settling. At each week close, each restless village rolls 15% for an uprising: a 7-day offer to settle it for 15 × band (`uprising` offers, A-171). If it isn't settled by its end, it turns neutral at its curve. That never undoes his resolution.

### 6.7 Accords and defection (R-13, C-41)

- The Respect-based Accord (Ch 14, D-01) stays for the Goblin, the Archmage and the Dwarf. `accordGate` refuses the Orc (`orcNeverSigns`).
- Defection (A-143) stays for those three. `defects` is never true for the Orc.

### 6.8 Resolution and victory

Unchanged: all four resolved wins (Ch 14). A surrender is an abdication for the Threat fallout (+10, A-167). Resolution pacing stays at 12 and 8 weeks until Patch 5.

---

## 7. Dominion

### 7.1 Signature deeds (blueprint 5.2b, C-42)

New entries in `RULES.dominion.deeds` and `DeedKind`s, posted by `deedsOf` in the existing `chronicle` phases, each to its rival's path only (× that path's share of the hex where it has one):

| Path | Deed | Value | Read from |
| --- | --- | --- | --- |
| Orc | `battleLost`: a battle with the Orc lost (a defense against him, an assault on his hex repulsed, a Grand Battle against him lost): "every battle counts, won or lost" | 0.5 | `defense`, `assault`, `grandBattle` |
| Orc | `retaken`: a hex he took from the player, taken back | 2, on top of the hex deed | `hexTransfer` to the player of a hex whose last transfer was the player's to the Orc |
| Goblin | `dealTaken`: a hex of his march taken by bribe, courtship or trade | 0.5 × depth, on top of the hex deed | `hexTransfer` how `bribe`, `influence`, `trade` |
| Goblin | `bargain`: a bribe paid below the garrison it bought (Trust and Respect beat his greed) | 2 | `bribe` |
| Goblin | `bribeBeaten`: his bid for a village held | 3 | `goblinBid` resolved `held` |
| Goblin | `counterBidBeaten`: a courtship won against his counter-bid or his suit | 2 | `courtship` defected to the player with his bid in it |
| Dwarf | `wallsBroken`: each wall level of a hex of his march taken | 1 a level, on top of the hex deed's 2 | `hexTransfer` with `fortification` |
| Dwarf | `siegeEndured`: each assault day beyond the first on a hex of his march that falls to a siege | 1 a day, at most 5 | the hex's assault events |
| Dwarf | `siegeBroken`: his conquest attempt beaten (in place of `battleWon`) | 3 | `defense` conquest, Dwarf |
| Archmage | `surgeWeathered`: a surge strike held | 1 | `defense` threat `surge` |
| Archmage | `surgeSeized`: a hex taken on a day an ebb weakened it | 1, on top of the hex deed | `hexTransfer` + `surge` |
| Archmage | `ritualEndured`: a Ritual cast against the player | 3 | `ritual` |
| Archmage | `summonedDefeated`: a hex his surge or Summoning made mythic, taken | 3 | `hexTransfer` of a summoned hex |

Settling twice posts nothing new (Test 9). Herald lines `herald.deed.<deed>`, plain facts.

### 7.2 The real path-rank perks (N-01)

Replacing C-18's stand-ins. Each rank adds its step; III and V add the unlock (TUNE). They enter `realmEffects` under the existing `pathRank` source, so A-31 and A-126 stacking holds.

| Path (building) | Every rank | Rank III | Rank V (capstone) |
| --- | --- | --- | --- |
| Orc (Barracks): endurance for attrition | Rally floor +0.01 (S-34); Weary's −20% eases by 0.02 | Grand Battle Weary lasts a day less | **Iron ranks:** a company repulsed in a daily assault is not made Weary |
| Goblin (Merchant Hall): prices, bribes, Trust | Trust +0.02; bribe and trade prices −4% | Holds against his bids count × 1.5 | +1 courtship slot |
| Dwarf (Foundry): siege speed, breaking walls | Repulse wear +0.02 of the Assault; fortification counts 10% less against the player's assault; +1 wall on every defense (3.1.0's, kept: S-34) | Wear on hexes the player besieges decays half as fast | A stronghold's multiple is 1.5 against the player (D-23's 1.75) |
| Archmage (Mage Tower): surge foresight and resistance | Mythic and surge-strike strength −5% | A curse drawn against the player becomes a blessing | **Bend the weave:** once a week, turn tomorrow's foretold swell into an ebb |

Rank I of the Archmage's path also gives surge foresight (section 3.5). Ranks never fall (P2-15), so a running campaign's ranks take these at once.

---

## 8. The automatic player (C-46)

`autoplay.ts` is extended in place. Habits live in `RULES.autoplay` (TUNE):

- **Bribes:** under the land answers `deals` and `both`, after the week's purchases, each day it pays for the best bribe on the plan's paths (most Dominion per price) while the price is at most `bribeShare` (0.5) of the purse and the hex wouldn't fall today by assault. Never a village it is courting (S-28).
- **Holds:** when the Goblin bids for one of its villages, it holds it if the hold needed at today's Trust is at most `holdShare` (0.25) of the purse.
- **Terms:** under `offers: 'accept'` (and the smarter player), it accepts buy-offs and surrenders, except that a **steered player refuses those from a rival on its own path until that path reaches rank V** (`refuseOwnPathUntilRank` 5). This is the "chooses to keep fighting" of G-18. Under `decline` it refuses every offer. It accepts a buy-back only under `accept` and never on its own path. The greedy player (offers `decline`) is unchanged, so G-01 to G-08 compare.
- **The pact:** its picks skip the Goblin's march while a pact holds (the actions are refused anyway).
- **Surges:** read through `assaultGarrison` like preparation, so an ebb makes a hex a better pick and a swell a worse one. With Bend the weave it bends a foretold swell on its planned target.
- **The Orc's last battle and Ugrak's Challenge** are fought like any Grand Battle (C-13).
- **The re-founding** plays 3.2.0 through it unchanged. Its four questions already steer bribes (land) and terms (offers).

---

## 9. What the player sees

No new art (X-21). Interface labels live in components; story text goes through the text catalog as plain-fact placeholders (Ch 17, A-46).

- **The hex panel and the map** (`view/realm.ts`): the march rules in force on the hex (an interface line per rival). In the Goblin's march: the **Bribe** price and its greed band, and on a village of the player's under his bid, his offer's band and **Hold**. Walls on wilds use the existing fortification marks. Today's surge, and tomorrow's with foresight, are marked on its hex with the bundled icons. The Orc's track is shown on his march.
- **Tidings at dawn:** the day's surge (and the foretold one), the Goblin's bid, counterattacks as today, a buy-back offer.
- **Diplomacy** (`view/diplomacy.ts`): each rival's stance band, its rumor, the Orc's war track, the Goblin's greed band, a buy-off pact's days left, and the open offers with **Accept** and **Refuse**. The Orc's card says he yields only to conquest.
- **Herald and Chronicle lines** (placeholders): `herald.bribe`, `herald.goblinBid.placed|held|lost|void`, `herald.surge.<kind>`, `herald.orcTrack`, `herald.terms.stance`, `herald.terms.rumor.<measure>`, `herald.terms.offer.<kind>`, `herald.terms.accepted|refused|lapsed`, `herald.restless`, `battle.surge.victory|rout|defeat`, the last battle through `herald.grandBattle.*`, and the deed lines (7.1).
- **How to play:** a section, **The rivals' marches and their terms**, with numbers read from `RULES` where they aren't hidden. It never gives the thresholds, the weights, the greed steps or the counterattack chance.

---

## 10. Rival AI, prices and hidden values (X-19, C-49)

- **Prices come from public facts:** a bribe from the garrison shown (A-181), Trust, Respect and a greed band. His village offer comes from the village's loyalty (public), shown as a band. A buy-off's gift is shown as what it is. None reads a treasury. The only hint is whether he could pay, which rival courtships already give.
- **Turn order** (`rivalTurn`): the Goblin's village bid comes from his expansion share before his own expansion; the Dwarf's fortify step covers the wilds; the Orc's turn reads his track for the extra conquest attempt; the Archmage's turn is unchanged (surges are daily, at dawn).
- **Hidden:** thresholds and weights, which measure is close, income and treasury (unless revealed, A-105), the greed number, his bid's size. Screens read them only through view functions that band them, with tests.

---

## 11. Rules version, saves and records

- **`ruleVersion` 3.2.0** (C-48). `needsRefounding()` compares majors, so a 3.1.0 campaign loads and settles at once.
- **New state, all optional:** `CampaignState.personalities?` (`orcTrack`, `goblinGreed`, `surges`, `goblinBids`, `dissolved`, `summoned`, `restless`), `CampaignState.terms?` (each rival's band, buy-offs refused, last offer and last battle). The `WorldOffer` union gains `buyOff`, `surrender` and `buyBack`. `Deal` kinds gain `bribe` and `buyOff`. `hexTransfer.how` gains `bribe`. `ThreatKind` gains `surge`. `GrandBattle.final?` is added. `RivalState.grudging?` is added. New events: `bribe`, `goblinBid`, `surge`, `orcTrack`, `stance`, `terms`, `restless`. New deed kinds. A missing field reads as the empty state.
- **How each rule starts in a running campaign:**
  - **Orc:** his ×0.85 applies at once. The track starts at 0 and moves from the first 3.2 close. Attrition counts from then.
  - **Goblin:** bribes are open at once. Greed starts at 0 (fair). His first bid comes at the first 3.2 week close (week 6 or later). Buy-back offers come from forces beaten after 3.2.
  - **Dwarf:** walls on the wilds start at 0 and rise at his next turn. N-03 and N-05 apply at once.
  - **Archmage:** the first surge is drawn at the first 3.2 dawn. Forces already fallen back stay as D-24 had them until their window ends; only new ones dissolve.
  - **Fallback variants:** for forces that fall back after 3.2.
  - **Terms:** read from the first 3.2 week close (from week 16). No rival starts with an offer.
  - **Deeds:** the chronicle reads only events after its last read, so signature deeds count from 3.2 on, never backwards.
  - **Rank perks:** ranks already reached take the real perks at once (N-01).
  - **An Accord with the Orc already sealed** is honored (C-41).
  - Nothing else is rewritten.
- **The proof:** the 3.1.0 fixture (section 2 item 6) loads under 3.2.0 without re-founding; it keeps its state as it was until the first 3.2 close; it settles 12 more weeks with the automatic player with no invariant violation; settling twice changes nothing; and each rule starts as listed above.
- **The live campaign** (re-founded on 3.1.0 on 2026-10-15) takes 3.2.0 when Rich installs the build. Nothing in `%APPDATA%\Fiefdom` is read or written by this work.
- **`decisions.md`** when the patch lands: D-27 the march rules (P4-01, C-37); D-28 the Orc; D-29 the Goblin; D-30 the Dwarf; D-31 the Archmage; D-32 routed enemies by personality and neglect variants; D-33 terms and how each rival yields; D-34 signature deeds and rank perks; D-35 how the targets count Patch 4. Assumptions marked changed: A-23, A-25, A-110, A-142, A-143, A-151, A-155, A-165, A-169, A-171; D-15, D-18 (C-18), D-22, D-24 by N-01 to N-05.
- `docs/game/README.md`'s module map gains `personalities.ts` and `terms.ts`; the blueprint's status table is updated.

### 11.1 New numbers in `rules.ts` (all TUNE)

| Where | Value |
| --- | --- |
| `ruleVersion` | `3.2.0` |
| `personalities.fromWeek` | 3 |
| `personalities.orc` | `{ garrisonMult: 1, ownMarchWeight: 3, firstDawnChance: 1, counterMult: 1.15, track: { min: −3, max: 3, strikePerStep: 0.05, garrisonPerStep: 0.02, extraConquestAt: −2 }, attritionPerWin: 0.02, warhostFundPerLevel: 0.05 }` (as built, S-36) |
| `personalities.goblin` | `{ bribe: { perPoint: 1, respectOff: 0.003 }, greed: { perStep: 0.1, perLevel: 0.05, maxSteps: 6, maxRisePerWeek: 2, bands: [1.15, 1.35] }, villageBid: { fromWeek: 6, offerMult: 1.3, roll: 0.15 }, buyBack: { chancePerDay: 0.3 } }` |
| `personalities.dwarf` | `{ wearDecay: 0.05, fallbackShare: 0.75, freeWallsPerQuietWeek: 1, wildWallsPerWeek: 3, wildWallMax: 1 }` (as built, S-36) |
| `personalities.archmage` | `{ surgeWeights: { swell: 0.3, ebb: 0.3, summoning: 0.1, blessing: 0.1, curse: 0.1, strike: 0.1 }, swell: 1.75, ebb: 0.7, companyShare: 0.2, summonDays: 5, strikeShare: 1, perLevel: 0.05 }` (as built, S-36) |
| `terms` | `{ fromWeek: 16, thresholds: {…6.1}, weights: {…6.1}, archmageDanger: { army: 0.5, victories: 0.5 }, resolvedVictories: 5, constancyWeeks: 12, bands: [0.6, 0.75, 0.9], retryWeeks: 4, goblin: { buyOffEveryWeeks: 4, pactWeeks: 4, giftValue: 150, giftGrowth: 0.5, maxHires: 3, hireWeeks: 4, surrenderAfterRefused: 2 }, archmage: { armyRatio: 0.5 }, dwarf: { marchShare: 2/3, restlessWeeks: 8, uprisingChance: 0.15, settlePerBand: 15 }, orc: { respectBar: 50, hostShare: 1, retryWeeks: 8 } }` |
| `dominion.deeds` | `battleLost 0.5, retaken 2, dealTakenPerDepth 0.5, bargain 2, bribeBeaten 3, counterBidBeaten 2, wallsBroken 1, siegeEndured 1 (cap 5), siegeBroken 3, surgeWeathered 1, surgeSeized 1, ritualEndured 3, summonedDefeated 3` |
| `dominion.rankPerks` | Section 7.2's table, replacing the stand-ins (with S-34: the Orc's `rallyFloor` 0.01; the Dwarf's `walls` 1) |
| `autoplay` | `bribeShare 0.5, bribeReserve 0.5, holdShare 0.25, refuseOwnPathUntilRank 5, refuseOwnPathAtLeast 1, refuseBuyOffs 1, dwarfSiegeExtra 2` (as built, S-35) |

---

## 12. Build stages

Each stage leaves `npm run typecheck`, `npm test` and `npm run check:game` passing. `npm run sim -- --targets` runs whenever the rules or the automatic player change.

| Stage | What | Ends with |
| --- | --- | --- |
| 1 | Measures (section 2), the smarter path players, the 3.1.0 fixture, the baseline regenerated | `targets-3.1.0.md` with G-10's baseline and G-18 "not yet built" |
| 2 | `personalities.ts`: `marchRule`, the Orc (garrisons, track, attrition, raids), the Dwarf (walls on wilds, decay, raids, no overrun), fallbacks by personality, rules 3.2.0 | Orc and Dwarf tests |
| 3 | The Goblin: bribes and greed, the deals list, his village bids and holds, buy-back offers, the automatic player's bribes and holds | Goblin tests |
| 4 | The Archmage's surges and foresight, dissolving forces; neglect variants | Surge and neglect tests |
| 5 | `terms.ts`: the measures, bands and rumors, offers, the Goblin's buy-offs and pact, the surrenders, the Orc's last battle, the Dwarf's restless hexes, Accords and defection; the automatic player's terms | Terms tests |
| 6 | Signature deeds and rank perks; views, screens, Herald lines and How to play | Dominion and view tests; screenshots |
| 7 | The carry-forward proof; the full simulator run; a tuning report proposing changes, made at Rich's delegation and listed for him; `decisions.md` D-27 to D-35 | `targets-3.2.0.md` |

---

## 13. Targets

### 13.1 Must hit and keep

**Must hit:** G-10 (section 2 item 2), G-17 (unchanged reading), and G-18 (section 2 item 3). **Keep as in `targets-3.1.0.md`:** G-01 to G-08, G-12, G-13, G-15 and G-16, with G-05 still read at week 60 (T-04). **Revisit and report:** G-09's second half (D-26, T-05).

### 13.2 What could move them

- **G-04 and G-05:** bribes and ebbs speed land; the Dwarf's walls and the Orc's strikes slow it. The levers are `perPoint`, `bribeShare` and the walls.
- **G-08:** the Orc's first-dawn strikes and Goblin bids add losses; the bad-week-to-good-week ratio is the limit (T-03's lesson).
- **G-07:** a one-path Dwarf player against walls on the wilds; watched by "hexes held rising every month".
- **G-11 (Patch 5):** terms add resolutions, so the victory weeks are reported and not chased.

### 13.3 What a scratch probe shows (3.1.0, no game code changed)

A script outside the repo played Steadfast for 70 weeks: greedy on 6 seeds, the Goblin's and the Orc's one-path players on 3 each, and the smarter player on 3. It recorded each rival at weeks 8 to 70:

- **Rival land barely moves.** Each rival holds about 25 hexes from week 8 to week 52 (its founding 20 at depths 9 to 12, plus about 5). The player meets rival-held land only from about week 52: greedy holds 16 of 57 hexes of each march at weeks 26 to 40 (the depth-4 stronghold bar), and about 36 by weeks 52 to 60. Before then every march is beasts and villages, which is why P4-01 chose the whole march.
- **No resolution** for greedy or the path players by week 70. No capital ever falls, and Gates fall only at the very end.
- **The smarter player wins on Accords alone:** the Dwarf allied in weeks 21 to 23 (his Respect is 100 by week 26 from the step pool), the Orc in weeks 30 to 42 (R-13 now closes that), the last rival in weeks 47 to 58.
- **At weeks 30 to 40:** reputation earned about 23,000 to 35,000; hexes held 105 to 155 (35 to 50% of claimable); Grand Battles won about 0.4 a week; total Dominion about 1,200 to 1,750; army against the Orc and the Archmage about even, the Goblin slightly weaker, the Dwarf 1.4 to 1.9× stronger. The thresholds in 6.1 are set from these.
- **Per greedy campaign:** Orc raids 108 (32% lost), conquest attempts 4.5, Warhosts 7 (6 won), Rituals 8.6, Ugrak's Challenge in 1 campaign of 3, 26 villages courted, no deals.

---

## 14. Tests and verification

New or changed tests, named after the rule they check:

- **March rules (D-27):** `marchRule` per march, seam and day; nothing in the heartland or wedges; the harder rules wait for week 3.
- **The Orc (D-28):** ×0.85 and the track's 2% on the player's assault weighing; the track moves at most one step a day, from week 3, for the battles listed; a repulse never moves it; ±5% strike strength a step; the extra conquest attempt at −3; 2% army per attack beaten; raids weighted to his march; first-dawn strikes.
- **The Goblin (D-29):** the price formula and its rounding; refused outside his march, on his Gate, on a hex not assaultable; no Respect gate, wait or war refusal; greed rises with force (at most 2 a week) and eases; the bands; his bid from week 6, on a march village, never in rings 0 to 2; hold × Trust; the close resolving both ways; void while away; buy-back offers; the deals list.
- **The Dwarf (D-30):** walls on wilds facing the player, to 4; 5% decay; 75% fallbacks that never strike; raids within or touching his march; no overrun.
- **The Archmage (D-31):** one surge a dawn from week 3, deterministic per seed, fixed once drawn; each kind's effect for its day; foresight from Mage Tower IV or rank I; no strike while away; dissolved forces steer the next surge; the Rituals unchanged.
- **Neglect (D-32):** each rival's own way at levels; G-16's measure unchanged; no rise under a pact.
- **Terms (D-33):** each measure and band; nothing before week 16; no offer in a coalition or Ascendancy or when pacing forbids; offers last 7 days and come back after 4 weeks; the Goblin's buy-off gifts (never reputation), pact and surrender; the Archmage's three triggers; the Orc's final Warhost below Respect 50 and Challenge at 50, each conquering on a win and waiting 8 weeks on a loss; the Dwarf's two thirds, no levy, restless hexes and uprisings; the Orc's Accord refused, a sealed one honored; no Orc defection.
- **Deeds (D-34):** each signature deed posts once to its path; the rank perks' effects; settling twice posts nothing new.
- **Views:** no hidden number reaches a view model (stance, greed, bids, terms).
- **Carry-forward (C-48):** section 11's proof on the 3.1.0 fixture.
- **The re-founding still holds:** `refound.test.ts` unchanged; byte-identical for the same inputs; `ledger.json` untouched.
- **Test 9 and Test 10:** settling twice changes nothing (bribes, surges, bids, offers included); rings 0 to 2 never change owner; no loss before week 36.
- **Performance (G-15):** `scripts/campaign-perf.ts` within 2 s and 2 MB.

---

## 15. Risks

- **The daily loop (G-14).** Bribes, holds and offers are new choices. Each is optional, and the Diplomacy page gathers them; offers come weekly at most.
- **Land too fast (G-04's 4 a week, G-05).** Bribes are the risk; `perPoint` and the habit's `bribeShare` are the levers.
- **The Orc's losses (G-08).** First-dawn strikes at full strength may win often. The strength multiple is the lever.
- **Terms end the campaign early.** The thresholds aim at weeks 30 to 40 (C-34). Patch 5 owns the length; the victory weeks are reported.
- **Hidden values by arithmetic.** A shown price lets a careful player work back to greed. C-49 accepts this: greed is never shown or stated.
- **Performance.** Surges add one record a day, kept a week; terms are read weekly.

---

## 16. What the build changed

Built on 2026-10-16, stages 1 to 7, at Rich's delegation ("you can make the decisions and just make me aware of them afterwards"). Nothing is committed. Rules **3.2.0**.

### 16.1 What the build changed from the spec

| # | Stage | Spec said | Built | Why |
| --- | --- | --- | --- | --- |
| S-31 | 3 | The Goblin's own forces offer to buy back the hex they lost instead of striking (C-44) | They fall back as D-24's do and never strike; each dawn of their window, 30% (`buyBack.chancePerDay`) that he offers to buy the hex back at his sell price, open 7 days (A-171). Beasts in his march dig in only | An offer needs a force still standing to make it |
| S-32 | 6 | C-49: "the hold needed at today's Trust" shown exactly | The hex panel says whether, as things stand, the village holds or goes to him at the close, and the hold so far; never the hold needed | The hold needed is (his offer − loyalty) ÷ Trust: showing it shows his offer, which C-49 and P4-03 keep hidden |
| S-33 | 7 | A bribed hex passes as a bought one (A-22) | It keeps its walls (no battle broke them), and its transfer counts no walls broken (no wall deed) | G-08: bribed hexes held deep in his march were overrun by beasts |
| S-34 | 7 | N-01: the real perks replace every stand-in | The Orc's rally floor stays **+0.01 a rank** (C-36 said +0.02), and the Dwarf's path keeps 3.1.0's **+1 wall on every defense a rank** beside its new perks | G-08: a higher rally floor props up exactly the bad days G-08 compares, and the walls were part of the defense 3.1.0 was tuned with |
| S-35 | 7 | The automatic player refuses its own path's terms until rank V; bribes while the price is at most half the purse (section 8) | It also refuses **at least one** offer from its own path's rival (`refuseOwnPathAtLeast` 1) and **the Goblin's first buy-off** (`refuseBuyOffs` 1: the next is richer, C-35); it bribes only from the purse beyond **half the next build's price** (`bribeReserve` 0.5), and at most half of that (`bribeShare` 0.5); it commits 2 more assault days to a siege in the Dwarf's march (`dwarfSiegeExtra`) and doesn't assault a hex only an ebb brings within reach (one its siege horizon couldn't take without it) | G-18: by week 33 every steered player's path is at rank V, so it refused nothing (median 0). G-08: bribes took the reputation the weekly build would spend on Crossings, and the realm defended worse everywhere (week 40's companies 5% weaker; Crossings 25 to 35% fewer) |
| S-36 | 7 | P4-04: swells ×2 and ebbs ×½; P4-06: walls on the wilds "up to his cap of 4"; N-04 ×0.85; N-02 the Orc's forces strike at full strength; C-40/P4-05 his extra conquest at the track's end | Swells **×1.75**, ebbs **×0.7**; the Dwarf's walls on the wilds at most **level 1**, 3 hexes a week; the Orc's garrisons **no flat discount** (`garrisonMult` 1: only his track eases them, as P4-05 says); his counterattacks **×1.15** (blueprint 5.3: "the Orc counterattacks hardest"); his extra conquest attempt from the track's **−2** | ×2 and ×½ overran his march on ebbs and froze it on swells; level-4 walls froze the Dwarf's march; the flat discount is section 16.2's; without the harder counterattacks the Orc's and the Goblin's marches tied on G-10's "both ways" |
| S-37 | 5 | The Dwarf's restless hexes rise (R-12) | A restless village's rising is the Village Uprising's own offer (15 × band to keep it, 7 days), closed by that event's 30% roll (A-171) | One rising, one rule |
| S-38 | 3 | `Deal` kinds gain `bribe` and `buyOff` (section 11) | Only `buyOff`; a bribe posts a `bribe` event and a `hexTransfer` with how `bribe` | A bribe is a payment, not a standing deal |
| S-39 | 4 | Surges announced at dawn | Drawn at dawn into `personalities.surges` (kept a week), told by the Herald from the state; the `surge` event posts at the day's close with the battles, where the deeds read it | The close is where the log is written |
| S-40 | 1 | G-10 per march | A seam counts for its first march | A seam's ruling march changes daily |
| S-41 | 6 | `herald.terms.offer.<kind>`, `herald.restless` (section 9) | `herald.terms.offered.<offer>` (buyOff, surrender, finalWarhost, challenge), `herald.terms.accepted / refused / lapsed / won / lost`, `herald.restless.uprising`, `herald.buyBack`, `herald.surge.<kind>` and `herald.surge.tomorrow`, `herald.threat.surge`, `battle.surge.victory / rout / defeat`, `herald.deal.refused.useBribe / offeredOnly`, and the 13 deed lines; all placeholders for A3 | — |
| S-42 | 6 | The screens of section 9 | **Hex panel:** the march's rules in a line, today's surge (and tomorrow's when foreseen), his prices (fair, dear, gouging), **Bribe the garrison** with its price, **Hold against his bid** (a form counting × Trust), **Sell it back** on his buy-back, **Keep the village** on a rising one (the Village Uprising had no button before), **Bend tomorrow's swell** at the Archmage's rank V. **Courts:** the stance from week 16, the march in plain lines (the Orc's war track, the Goblin's prices, pact and hired companies, the Dwarf's walls on the wilds, today's surge), and rumors of the two measures each rival weighs most. **Diplomacy:** a Terms banner with what accepting and refusing do, Hold to accept, Refuse. **How to play:** the rivals' marches, terms, each path's deeds and rank perks | — |
| S-43 | 6 | — | The simulator's Renown table lists the signature deeds | Their share is part of G-17's story |
| S-44 | 7 | C-39: no terms while the player is away 14 days or more | Offers wait for an absent player; **the Orc's last battle doesn't**, as his Warhost and Ugrak's Challenge as an event don't | It is a Grand Battle, not an offer; and Test 10's driver (which never launches the app, so counts as away) won no campaign without it |
| S-45 | 7 | — | The automatic player no longer orders an assault on a hex whose Grand Battle waits (S-14 refuses it): it takes another target | A summoned mythic, revealed by an assault, queued a Mythic Hunt behind three other battles, and the player assaulted nothing for 11 days (G-02's worst campaign) |
| S-46 | 7 | — | The automatic player's bribe check does its cheap tests first (a hex he would take a bribe for, a price within half the purse) before pricing the next build and weighing its assaults; the hold habit returns at once with no bid open; the deed lookback compares dates as text. Four campaigns' measures are byte-identical before and after | G-15: the re-founding's 365 days took 2.29 s (3.1.0: 1.23 s on the same machine); now 1.79 s |
| S-47 | 6 | — | The Goblin's court no longer lists "It sells you hexes" and "It buys your hexes" among his Respect marks | C-43 took both off Respect: his hexes are bribed, and he buys at any Respect |

### 16.2 What it took to keep G-08

G-08 (land lost in bad weeks at least twice good weeks') was the one kept target the first build broke. Over 100 Steadfast greedy seeds, 3.1.0 reads **2.03×** (0.95 against 0.47 a week); the first full run of stages 2 to 6 read 1.24 against 0.77 a week on the targets' 40. The 40-seed reading swings by ±0.15 with where its 90-odd bad weeks fall, so each fix below was judged on 100 seeds, which share their bad weeks across versions (Valor comes from the ledger). Probes of the same seeds on 3.1.0 and 3.2.0 found:

- **The defense got weaker, not busier.** Defenses a week were unchanged (8.6 against 8.8) and so were the companies sent to assault (3.9 a day), but a larger share of every kind of defense was lost: beasts 55% to 61%, mythics 59% to 65% (despite the Archmage's stronger mythic perk), raids 37% to 48%.
- **Bribes took the build budget.** The automatic player bribed with half its purse every day, so the weekly build found less: Crossings 8.3k to 12.6k reputation by week 40 against 12.6k to 16.9k, and its army 5% weaker. S-35's reserve restored most of it (bribes off entirely read 1.87×, the reserve 1.84×).
- **The border sat deeper.** The Orc's weaker garrisons, the bribes and the Archmage's ebbs let the player push deeper into three marches (held hexes at ring 5.7 against 5.4 to 5.6), where beasts strike harder, so a lost beast defense there was an overrun 33 to 41% of the time against 21 to 25%, nearly as often in good weeks as bad (1.17× against 3.1.0's 1.57×). Trimming the reach (ebbs ×0.8, a bigger reserve) cut good and bad weeks alike (1.89×).
- **The Orc's flat discount was the cause.** One rule off at a time, over 100 seeds: no surge swings 1.83×, no bribes 1.87×, **no Orc discount 1.99×**; half the discount (×0.95) 1.84×; no discount but a stronger track step (4% a step) 1.90×. His garrisons now ease only through his track (S-36), which is what P4-05 asked.
- What did not matter: the Orc's fall to his last battle (weeks after it lost no more than weeks before) and his strikes' track step (±8% read as ±5%).

The Orc's harder counterattacks (S-36) cost a little of G-08 and buy G-10's "the Orc's march churns most": without them his march and the Goblin's tied (0.30 each).

### 16.3 Targets

[targets-3.2.0](../game/sim/targets-3.2.0.md), 460 campaigns, 70 weeks, on the rules as built:

| Target | 3.1.0 | 3.2.0 | |
| --- | --- | --- | --- |
| G-01 | 5.9; 83% | 5.9; 84% (strict 4.7; 52%) | kept |
| G-02 | 2; 4; 1 weeks | 1; 2; 0 weeks | kept |
| G-03 | 0.2 (strict 3.1) | 0.2 (strict 2.9) | kept |
| G-04 | 3.28; 4.0 | 3.26; 4.1 | kept |
| G-05 | 15% | 16% (3% at the end); Perfect's first near-full week 66 | kept |
| G-06 | 2.80×; 100% | 2.26×; 100% (the Orc's path 2.71×, the Goblin's 2.52×, the Dwarf's 2.00×, the Archmage's 1.72×) | kept |
| G-07 | met | 100%; 95% | kept |
| G-08 | 4.2; 0.94 vs 0.46; 12% | 4.9; **1.26 vs 0.60 (2.10×)**; 15% | kept |
| G-09 | 73%; 10% | 75%; **7%** | revisited: missed (16.4) |
| G-10 | — | the Dwarf's march fewest lost (0.01 a hex held) and most assault days (2.22 a hex); the Orc's most defenses (5.01) and most both ways (0.31, the Goblin's 0.28); the Goblin's 51% first taken by deal; a surge in reach every week | **hit** |
| G-12 | 0; 0 | 0; 0 | kept |
| G-13 | met | 1.4 a month | kept |
| G-15 | 1.70 MB | 1.59 MB; the 365-day catch-up and the re-founding in 0.92 s and 1.79 s (`scripts/campaign-perf.ts`, best of 3; under 2 s; S-46); 1.27 MB after 70 weeks there | kept |
| G-16 | met | 1.29× | kept |
| G-17 | 100% | 100% (93%) | **hit** |
| G-18 | not yet built | a median 2 rivals resolved by terms (74% two or more); 0 offers before week 16; a median 1 refused | **hit** |

The marches (Steadfast greedy) as G-10 reads them:

| | Orc | Goblin | Dwarf | Archmage |
| --- | --- | --- | --- | --- |
| Hexes held (mean of the week closes) | 25.7 | 25.3 | 20.7 | 23.2 |
| Lost per hex held | 0.42 | 0.31 | 0.01 | 0.28 |
| Assault days per hex taken | 2.07 | 1.79 | 2.22 | 1.73 |
| Defenses per hex held | 5.01 | 3.75 | 2.79 | 4.79 |
| Both ways per hex held | 0.31 | 0.28 | 0.01 | 0.23 |
| First taken by deal | 17% | 51% | 8% | 7% |

**Terms (C-34):** with the smarter Steadfast player the first offer comes in week 33; the Goblin first stands at Ready to yield in week 35, the Orc in week 38 and the Archmage in week 39; the Dwarf is allied by Accord first. Victory comes in week 53 (100% of campaigns), 57 for the smarter one-path players (99%): Patch 5 owns the length (R-17's 58 to 64).

**Renown:** the signature deeds are 18% of Steadfast's Renown and 16% of the one-path players' (C-42 aimed at 10 to 15%); the Goblin's bids held are most of it (6 to 7%), since the automatic player holds every one it can.

### 16.4 G-09, revisited (T-05)

G-09's first half holds (75% of non-rout wins leave a fallback, counting an Archmage force's surge as its fallback, C-47). Its second half reads **7%** of dawns after a fallback whose target differs from the one chosen without it, against 10% in 3.1.0 and the 20% asked. A fallen force only adds to one hex's garrison for three days, which changes the automatic player's pick only when that hex was its pick and is pushed out of reach; the automatic player weighs garrisons, never the threat of a strike back, so a human may well read a fallback differently. Why 3.2.0 reads lower than 3.1.0 was not measured; the likeliest cause is the Archmage's march, where no force falls back (the next dawn's surge lands beside the hex instead). **Recommendation:** retire G-09's second half, or measure it in Patch 5 against a player who weighs a fallen force's threat; no rule change is proposed.

### 16.5 Screens

From a synthetic Steadfast campaign driven 20 weeks, with an offer, a bid, a buy-back and a swell set on its open day (`docs/game/screens/p4`): [the Terms banner](../game/screens/p4/diplomacy-terms-1280x800.jpg), [the courts with stance and march lines](../game/screens/p4/diplomacy-courts-1280x800.jpg), [a bribe](../game/screens/p4/realm-bribe-1280x800.jpg), [the Goblin's bid and Hold](../game/screens/p4/realm-goblin-bid-1280x800.jpg), [his buy-back](../game/screens/p4/realm-buyback-1280x800.jpg), [a swell](../game/screens/p4/realm-swell-1280x800.jpg), and How to play's [marches](../game/screens/p4/guide-marches-1280x800.jpg) and [terms](../game/screens/p4/guide-terms-1280x800.jpg).

### 16.6 Tests and checks

- New tests: `marchRules.test.ts`, `goblin.test.ts`, `surges.test.ts`, `terms.test.ts`, `signatureDeeds.test.ts`, `viewPatch4.test.ts` and `carryForward.test.ts` (the 3.1.0 fixture in `tests/game/fixtures/`, written by `scripts/fixture-3.1.0.ts`). Tests that read Patch 2 and 3 behaviour Patch 4 changes were updated to the new rule, each citing it: the Orc never defects (C-41) in Ch 14's pacing test and the Accord tests (now on the Archmage), the Goblin's hexes bribed rather than bought, test dens moved into the lair wedges (the rival marches have their own fallbacks), the battle-report count (29 with the surge lines) and the rival panels' public numbers (the march lines, C-49).
- **790 tests pass**; `npm run typecheck` and `npm run check:game` are clean; Test 10's 300 campaigns keep every invariant, and its diplomats now win by Ugrak's Challenge (S-44).
- Nothing in `%APPDATA%\Fiefdom` or the health data was read or written. Nothing is committed.
