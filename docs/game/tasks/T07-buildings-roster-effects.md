# T07 — Buildings, castle, Crossings, roster and realm effects

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 3 The war | T03, T04 | T08, T09, T12, T14, T18 | Light (Crossing perks) |

## Goal

Turn reputation into power: buying building tiers, castle tiers and Crossing stages; deriving the army roster from the realm's state; and collecting every realm-wide modifier into one `realmEffects(state)` answer, so combat, economy and screens never hard-code where a bonus comes from.

## Read first

- Book: Ch 7 (all of it), Ch 8 (all of it), Ch 9 Milestones table (effects only: Proving Grounds, Healing Springs, Crown Forge, Statue, Crownguard Ascendant), Ch 5 "Where reputation goes", Appendix C "Company reach".
- Decisions: A-19, A-20, A-30, A-31, A-32, A-42.

## Scope

1. **`lib/game/buildings.ts`.**
   - `buyTier(state, building)` checks Dominion (8 / 24 / 68 / 68), reputation (150 / 450 / 1,100 / 1,800) and, for Tier V, that the matching rival is resolved and Milestone 6 is broken (A-42).
   - `buyCastleTier(state)` checks the sum of building tiers (8 / 12 / 16) and the cost (250 / 750 / 1,500). Castle V happens only when all four rivals are resolved; it is set by T13, not bought.
   - `buyCrossing(state, pair)`: stage I needs both buildings at Tier II, II both at III, III both at IV; costs 200 / 600 / 1,200.
   - Discounts: Trade Roads 10%, replaced by Guild Charters 20% (A-31); later, Wing and item discounts arrive through effects.
   - Tiers are never lost; if Dominion falls, only the next purchase waits. Each function returns `{ ok, reason }` for the UI and posts `spend` events.
2. **`lib/game/roster.ts`: `roster(state): Company[]`.**
   - One company per building at its current tier, with name, power, tags and reach from the codex and Appendix B.
   - One hybrid per bought Crossing (power 12 / 18 / 27, both tags).
   - The Crownguard: power 40 when all four buildings are at Tier IV, 55 at all Tier V, +10 at Milestone 10; all four tags; no cost.
   - Vassal and ally companies (A-20), and hired companies for one battle (A-19).
   - Leave clear slots for Elites, the Sworn and items, which T14 fills.
   - Weary status: −20% power until `wearyUntil`.
3. **`lib/game/effects.ts`: `realmEffects(state): Effects`.** Each value carries a list of the sources that produced it, for tooltips. The fields:
   - banners (castle tier, +1 Crown Forge)
   - walls (castle walls + the Foundry tier's walls, +6 Bastions, +10 Anvil-Heart)
   - arms bonus `a` (the Foundry tier's total, not cumulative, per A-31) and the Proving Grounds' +10% to all companies
   - rally floor `r` (50%; Barracks III / IV / V set it to 55 / 60 / 65%; +5% Warded Steel; +10% Healing Springs; +5% Unbroken Banner)
   - mythic strength multiplier (Mage Tower II / IV / V, Wardstones, Ward Circle, Starglass Orb, and per-side lair seals; reductions multiply)
   - reputation bonus percentage (Merchant Hall tier, Statue, Gilded Ledger; these add, per A-31)
   - pledge-cap multiplier and minimum pledge return
   - Respite bank cap (4; Mage Tower III → 5; Tier V → 6; +1 Healing Springs; +1 Herb Garden)
   - courtship slots (A-32), daily assaults (1; 2 at Castle IV; +1 Siege Park), foretell days for threats and Grand Battles
   - spy reveals (Spy Network, Spymaster, Observatory), tithe multiplier (Guild Charters, Counting House), cost discounts, item slots
   - the Order deck and Doctrines available (from the codex sources)
   - Crossing perks: Shieldwall, Siegebreakers, Warded Steel, Oathguard, Bounties, the Royal Hunt, Runed Walls, Wardstones, Trade Roads, Guild Charters, Spy Network, Grand Illusion
   - Inputs this task cannot know yet (Wings, items, Milestone unlocks) are read from state slices that T14 fills. Leave them empty until then, with tests.

## Out of scope

Using these effects in battle (T08, T12); Wings, items and Elites themselves (T14); screens (T18).

## Files

- Create: `src/renderer/src/lib/game/buildings.ts`, `roster.ts`, `effects.ts`, `tests/game/buildings.test.ts`, `tests/game/effects.test.ts`.
- Edit: `types.ts`, `rules.ts` (append only).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Tier II is refused with Dominion 7 or with 149 reputation, and succeeds with Dominion 8 and 150 (the purse drops by 150). After losing land drops Dominion below 8, Tier II stays and Tier III is refused for Dominion.
- [ ] Tier V is refused without the matching rival resolved, refused without Milestone 6, and succeeds with both.
- [ ] Castle II needs a tier sum of 8 and 250; III needs 12 and 750; IV needs 16 and 1,500. There is no `buyCastleTier` path to V.
- [ ] A Crossing stage I needs both buildings at Tier II. Hybrid power is 12 / 18 / 27. Trade Roads makes the next Tier III cost 405. With Guild Charters it costs 360, not 315.
- [ ] Effects reproduce the Ch 10 worked battle's inputs: Castle III plus Foundry III → walls 20 and a = 0.10. Barracks III → rally 0.55; IV → 0.60; IV plus Warded Steel → 0.65.
- [ ] Banners by castle tier are 2 / 3 / 4 / 5 / 6, plus 1 with Crown Forge.
- [ ] The Crownguard appears exactly when all four buildings reach Tier IV (power 40), becomes 55 at all Tier V, and gains +10 at Milestone 10.
- [ ] A late-game state (all buildings at Tier IV, 4 Crossings, the Crownguard, a vassal) yields a roster of 12 or more companies, with 5 or more banners.
- [ ] Every `Effects` value lists its sources, for example walls = [Castle III: 14, Foundry III: 6].

## Hand-off notes

*(The implementing agent adds notes here.)*
