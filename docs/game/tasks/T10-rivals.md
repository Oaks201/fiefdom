# T10 — Rivals: benchmark economy, weekly turn, Respect, fronts and Border Campaigns

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 3 The war | T08, T09 | T11, T12, T13, T19 | **Yes** (hidden benchmark, rival AI) |

## Goal

Make the four rivals real economies. Each earns at a hidden benchmark, spends by personality on armies, land, walls and schemes, sets its stance toward the player, plans raids and conquest attempts, and fights its neighbors. Fill the `rivalTurn`, `fronts` and `borderCampaigns` week phases, and the day-level skirmishes.

## Read first

- Book: Ch 12 (all of it), Ch 10 "The day's threats" (raids and conquest attempts), Ch 6 "Influence" (rival bids, two suitors), Appendix B "Rivals" and "Respect" rows, Appendix C "Rival hosts" (the unit lists rivals buy from) and "The Archmage's Rituals", Tests 5 and 10.
- Decisions: A-04 (partial week 1), A-17, A-18, A-20, A-23, A-24, A-25, A-26, A-33, A-37, A-38.

## Scope

All in `lib/game/rivals.ts`.

1. **`initRivals(seed, map)`** per A-18. Replace T06's placeholder init.
2. **The hidden benchmark.**
   - `b` by phase: weeks 1–8 72%, 9–20 78%, 21–36 82%, 37+ 86%. Grace II lowers it 3 points and Grace III 6; it never goes below 70%.
   - `L` by week: 1.0 in weeks 1–2, 1.4 from week 3, 1.7 from week 10, 2.0 from week 21.
   - `BI = 84b + 5P + P(P − 1)/2 + 140b + 60 + 70 × L × f(b)`, with `P = round(7b³)`.
   - Rival income = BI × the personal multiplier + its tithes (4 × ring per village it holds). Prorate it in a partial week 1.
3. **The weekly turn** (Ch 12, steps 1 to 8), for each active rival in a seeded order:
   1. Earn.
   2. Split the treasury above a 100 reserve by personality (army, expansion, fortify, special).
   3. Buy army: each power point costs 10 × (1 + AV / 150). Buy whole companies from its unit list.
   4. Expand per A-25: at most one target (the Goblin two). Beast dens are taken when 0.5 × AV × roll(0.85–1.15) ≥ garrison. Villages are courted with bids of 1.1 × loyalty (the Goblin 1.3 ×), resolved together with the player's bids through T09's interface.
   5. Fortify border hexes, the ones facing the player first. The Dwarf can reach level 4; the Deep Halls make fortifying its own hexes 25% cheaper.
   6. Specials:
      - Orc: the Warhost fund. At 600 it raises an Incursion-style Grand Battle trigger (handed to T12's queue) and resets.
      - Goblin: the Market. Counter-bids, buys hexes from other rivals' borders, and hires mercenaries (+15% AV for 2 weeks) for any rival at war with the player.
      - Archmage: Rituals in order, one every 6 weeks once 400 is saved. The effects are hooks: the Long Night and Veil of Fog modify T08's schedule and tidings; the Summoning places a mythic garrison next to the player's border; the Curse of Weariness makes the player's strongest company Weary for 5 days.
      - Dwarf: the Deep Halls.
   7. Set disposition and plan next week's raids and conquest attempts. Conquest attempts happen only at War, from week 6, and only when 0.5 × AV ≥ 0.8 × the player's expected defense on the target. They respect Truces and pacts from T09.
   8. Counter-bid on villages the player is courting from it: up to 60% of its reserve (the Goblin 100%).
4. **Threat, Power and disposition.**
   - Power = 0.5 × treasury + 3 × AV + 10 × Σ ring of hexes held. For the player, AV counts only the best (banners + 2) companies.
   - Threat = 40 × min(2, player Power ÷ average rival Power) + 15 × rivals resolved + 10 if the player borders it on 3 or more hexes + 10 if the player took its land in the last 4 weeks, capped at 100.
   - War if Threat ≥ 60, or the player took its land in the last 2 weeks, or it is in a coalition against the player. Peace if Respect ≥ 50 and no hostile act either way in 4 weeks. Otherwise Tension.
5. **Respect.** The event table (+3 raid defeated, +4 prized week per A-38, +5 Incursion won, +2 trade or Truce, +5 hex sold to it, −2 raid lost, −3 village courted away, −5 hex conquered), clamped to 0–100. Threshold effects are exposed for T08 (raids 10% weaker at 25), T09 (deals) and T13 (Accords).
6. **Rival-versus-rival fronts.**
   - Each week every front is drawn as Peace, Tension or War from the seed and tempers: fronts touching the Orc go to war about 40% of weeks, others about 25%.
   - At War, one skirmish a day moves the track one step toward the winner, within −3 to +3. Each war week costs both sides 5% of AV.
   - +3 means Emboldened (+15% raid strength next week); −3 means Humbled (−15%). A Peace week moves the track one step toward 0 (A-37).
   - At war with another rival, a rival raids the player half as often (feeds A-26).
7. **Border Campaigns.** In the hidden scheduled weeks (from T06), on each front at War, the rival whose track is at +2 or more attacks.
   - Target: one hex the loser holds that touches the attacker's land; otherwise the loser's hex nearest their shared battlefield. Never a Gate, a capital, or a hex the player holds.
   - It is taken if 0.5 × attacker AV × roll ≥ garrison. Either way, both lose 5% of AV.
   - The Herald reports it at the next dawn. Coalition partners never attack each other.
8. **What the player sees.** `rivalView(state, rival)` returns treasury bands (Meager under 300, Modest under 800, Prosperous under 2,000, Mighty above), army bands (A-24), Respect, disposition, status and rumor text ids. Exact treasury and AV appear only with the Spy Network (neighbors only with the Spymaster Wing). It never returns the benchmark or income.

## Out of scope

Coalitions, events, Accords, Ascendancy (T13); Grand Battle resolution (T12); screens (T19).

## Files

- Create: `src/renderer/src/lib/game/rivals.ts`, `tests/game/rivals.test.ts`, `tests/game/fronts.test.ts`.
- Edit: `settle.ts` (fill `rivalTurn`, `fronts` and `borderCampaigns`, and the day skirmish), `combat.ts` (wire the raid and conquest-attempt interface), `land.ts` (counter-bids and two suitors), `campaign.ts` (call `initRivals`), `types.ts`, `rules.ts`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 5: `BI(0.80, 1.7)` = 344.53 ± 0.01.
- [ ] `b` and `L` by week: week 1 → 0.72 / 1.0; week 3 → 0.72 / 1.4; week 9 → 0.78 / 1.4; week 10 → 0.78 / 1.7; week 21 → 0.82 / 2.0; week 37 → 0.86 / 2.0. Week 40 at Grace III → 0.80. A forced Grace III in week 1 → 0.70 (the floor).
- [ ] Army cost per power point is 10 at AV 0 and 20 at AV 150.
- [ ] Determinism: the same seed and state give identical rival states after 10 turns. A 52-week headless run with a passive player (no orders, perfect habits) never produces a negative treasury, never puts a rival in rings 0 to 2, and leaves every rival with AV > 0.
- [ ] Threat: player Power 1,500 against an average of 1,000, no rivals resolved, bordering on 3 hexes → 40 × 1.5 + 10 = 70 → War.
- [ ] Peace needs Respect ≥ 50 and 4 quiet weeks. One raid the player defeats in that span keeps it at Tension.
- [ ] The prized-habit Respect (+4) is paid only in weeks that meet A-38 for that rival.
- [ ] Test 10 (part): across 300 seeded 70-week runs, no Border Campaign ever targets a Gate, a capital or a player hex, and coalition partners never attack each other. Record the median number of hexes changing hands between rivals (book target: 2 to 6 a campaign) and warn in the output when it falls outside that range.
- [ ] `rivalView` exposes no number for treasury, AV, benchmark or income unless the Spy Network or Spymaster applies (unit test over all fields).
- [ ] The rival turn is settled once: re-running `settle` for a week already closed changes nothing (Test 9, part).

## Hand-off notes

*(The implementing agent adds notes here.)*
