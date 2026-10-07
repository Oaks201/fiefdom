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

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Tier II is refused with Dominion 7 or with 149 reputation, and succeeds with Dominion 8 and 150 (the purse drops by 150). After losing land drops Dominion below 8, Tier II stays and Tier III is refused for Dominion.
- [x] Tier V is refused without the matching rival resolved, refused without Milestone 6, and succeeds with both.
- [x] Castle II needs a tier sum of 8 and 250; III needs 12 and 750; IV needs 16 and 1,500. There is no `buyCastleTier` path to V.
- [x] A Crossing stage I needs both buildings at Tier II. Hybrid power is 12 / 18 / 27. Trade Roads makes the next Tier III cost 405. With Guild Charters it costs 360, not 315.
- [x] Effects reproduce the Ch 10 worked battle's inputs: Castle III plus Foundry III → walls 20 and a = 0.10. Barracks III → rally 0.55; IV → 0.60; IV plus Warded Steel → 0.65.
- [x] Banners by castle tier are 2 / 3 / 4 / 5 / 6, plus 1 with Crown Forge.
- [x] The Crownguard appears exactly when all four buildings reach Tier IV (power 40), becomes 55 at all Tier V, and gains +10 at Milestone 10.
- [x] A late-game state (all buildings at Tier IV, 4 Crossings, the Crownguard, a vassal) yields a roster of 12 or more companies, with 5 or more banners.
- [x] Every `Effects` value lists its sources, for example walls = [Castle III: 14, Foundry III: 6].

## Hand-off notes

### Evidence

`npm run typecheck` clean; `npm run check:game` → `check:game OK: 19 game files, codex valid, 273 text slots.`; `npm test` → 336 tests, 336 pass, 0 fail. The verification items map to these tests:

| Verification | Test (`tests/game/…`) |
| --- | --- |
| Tier II at Dominion 7 / 149 / 8 and 150; Tier II stays after land loss | buildings: `Tier II is refused at Dominion 7 or 149 reputation…`, `tiers are never lost…` |
| Tier V needs the rival and Milestone 6 | buildings: `Ch 7 / A-42: Tier V needs…` |
| Castle II / III / IV, no path to V | buildings: `Castle II needs a tier sum of 8 and 250…` |
| Crossing stage I, hybrids 12 / 18 / 27, Trade Roads 405, Guild Charters 360 | buildings: `a Crossing stage I needs…`, `hybrid power is 12 / 18 / 27…`, `Trade Roads makes the next Tier III cost 405…` |
| Walls 20, a = 0.10; rally 0.55 / 0.60 / 0.65 | effects: `Ch 10 worked battle inputs…`, `rally floor is 0.50…` |
| Banners 2…6, +1 Crown Forge | effects: `banners by castle tier…` |
| The Crownguard 40 / 55 / +10 | buildings: `the Crownguard appears exactly at all four Tier IV…` |
| Late-game roster ≥ 12, banners ≥ 5 | buildings: `a late-game realm fields 12 or more companies…` |
| Every value lists its sources | effects: `every Effects value lists sources that compose to it`, and the walls test checks `['Castle III: 14', 'Foundry III: 6']` |

### What exists

- **`buildings.ts`.** Each purchase has an offer and a buy: `tierOffer` / `buyTier(state, building, today)`, `castleOffer` / `buyCastleTier(state, today)`, `crossingOffer` / `buyCrossing(state, pair, today)`. An offer is `{ ok, reason?, next, cost }` and a buy returns `{ ok, reason?, state, cost }`. A refused buy hands back the same state. `reason` is a code with plain facts (`dominion`, `reputation`, `rivalUnresolved`, `milestone`, `tierSum`, `buildingTier`, `maxed`, `campaignOver`) for the screen to word. Requirements are checked before reputation. A buy posts one `spend` (sources `tier:<building>:<n>`, `castle:<n>`, `crossing:<pair>:<n>`) on `today` and refreshes the stored roster. The buy functions take `today` because the purse needs a date; the task text's signatures leave it out.
- **`roster.ts`.** `roster(state, { day?, hired?, envoys? })` returns `Company[]`. `rosterDetail` adds base power, Weary and the power sources, for tooltips. `refreshRoster(state)` brings `state.roster` up to date, and `crownguardPower(state)`.
  - **Ids are stable slots**, so orders, items and Weary survive upgrades: the building id (`barracks`…), the Crossing id, `crownguard`, the Elite id, `sworn`, `vassal:<rival>`, `ally:<rival>`, `envoy:<rival>`, `hired:<n>`. `foundingRoster` in `campaign.ts` now uses the building ids too.
  - **`power` is the company's `p`**: base, plus Wing and item additions, × (1 + power shares: the Proving Grounds, Engine Works for ranged, trophies), × reductions (Weary 0.8). The Foundry's `a` is **not** in it; combat applies `(1 + realmEffects().armsBonus.value)` to the sum, per the Ch 10 formula.
  - **Weary**: with `day`, a company is Weary while `wearyUntil >= day`. Without `day`, any `wearyUntil` on record counts. The stored roster keeps the date but never the penalty.
  - **`state.roster` is the record of items and Weary dates.** Always read power through `roster(state)`. Single-battle companies (hired, envoys) are never stored.
  - Hired companies take the Merchant Hall company's name and power (A-19). Envoy, vassal and ally names are plain facts ("Orc vassal"). If the owner wants names, they belong in the codex.
- **`effects.ts`.**
  - `realmEffects(state): Effects` (type in `types.ts`). Numeric fields are `Sourced`: `{ value, op: 'add' | 'mult', sources: [{ from, value }] }`, and the contributions sum or multiply to `value`. Gains of 0 and ×1 are left out.
  - Switches are `Flag`s and reveals are `{ whom: 'none' | 'neighbors' | 'all', sources }`.
  - `sourceLabel(ref)` gives plain labels from codex names and numerals ("Castle III", "Warded Steel", "Milestone 6").
  - Helpers: `wallsFor(effects, { ring, foe })`, which applies Shieldwall and Runed Walls; `mythicMultFor(effects, side?)`, which includes a sealed lair's ×0.5; `milestoneBroken`; `realmGrants`.
  - **Generic interpreter.** Crossing perks, Wings (`state.armory.wings`) and items equipped anywhere whose effect targets `realm` all run through one interpreter over the codex `Effect` kinds. All 24 Wings already land in their fields once T14 records the choice (tests cover that, and the empty slice). Anything Grand-Battle-only, or with no realm field, goes to `effects.battle` as a `Grant` for T12.
  - **Orders and Doctrines** are derived from the codex sources: building tier, Crossing stage or Wing.
  - **Grace.** `tribute` and `contestedDays` include the Crown's Grace II (A-130), so T08 should read them rather than the Grace rules.
- **`types.ts`.**
  - `CompanySource` gained `'envoy'`.
  - `CampaignState.armory?: ArmoryState` holds `wings`, `elites` with their rank, `sworn` with its tags, `stash` and `armorerCompany`. The slice is optional and absent until T14 writes it. Equipped items stay on `Company.items`.
  - New types: `EffectSourceRef`, `Contribution`, `Sourced`, `Flag`, `Reveal`, `Grant`, `Unlocked`, `Effects`.
- **`rules.ts`.** Appended `effects.graceIILevel` (2).
- **`settle.ts`.** `reputationBonus` and the Respite cap now read `realmEffects` (as T06 asked), and weekly tithes use `realmEffects().titheMult`. These give the same values as before until Wings, items or Crossings are in play.

### For later tasks

- **T08.** Army = `(1 + armsBonus) × Σ p·m` over the best `banners` (+ `poolBanners.<pool>`) companies, + `wallsFor(...)` + F. Also read `rallyFloor`, `mythicMultFor`, `raidStrength`, `spoils[foe]`, `tribute`, `contestedDays`, `dailyAssaults`, `assaultIgnoresFortification`, `royalHunt`, `grandIllusion`, `foretell` and `reveals`. Hired blades need `hiredBlades.on`; pass `hired: n` to `roster`, and charge `RULES.buildings.merchantHall.hiredBlades.costPerBattle`. Call `refreshRoster` when you add stored statuses for companies that may not be stored yet.
- **T09.** `courtshipSlots`, `trust`, `costs.fortification` and `costs.trade`.
- **T12.** `effects.battle`, `orders`, `doctrines`, `ordersOffered` and `readinessFloor`. A company's own item and Elite abilities are on the codex entries, read by id.
- **T14.** Write `state.armory` and equip items onto `state.roster` companies, then call `refreshRoster`. Item slots are in `itemSlots` and `extraItemSlots`. Slot enforcement and buying are yours.
- **T13.** Castle V is never bought (`castleOffer` reports `maxed` at IV). Set `castleTier: 5` when every rival is resolved. A resolved rival's levy appears in the roster automatically.
- `contracts.ts` still takes the Merchant Hall tier for the pledge cap and minimum return. `realmEffects().pledgeCap` and `minPledgeReturn` show the same values with sources, for screens.

### Choices made here

- A-126 (stacking), A-127 (no castle discount), A-128 (Legendary items act while equipped), A-129 (Tier V's rival; abdication gives a vassal), A-130 (Grace II inside `tribute` and `contestedDays`).
- The book's "a late-game roster has 12 or more companies" needs the Elites. The verification's own list (four buildings, 4 Crossings, the Crownguard and a vassal) makes 10, so the test adds two Elites (Milestone 3 comes long before Tier IV everywhere) and also asserts the 10.
- Noticed but not changed: T05's row in the README status table has a stray empty cell.
