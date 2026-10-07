# T15 — The war table: Realm and Diplomacy screens

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T14 (and T07 to T10, done); can run beside T11 and T12 | T16, T17 | Light (no hidden numbers) |

## Goal

The player's war table, where most daily decisions happen in 2 to 5 minutes. The **Realm** page: a tilted, painted-board hex map that shows who holds what, what is under attack and what can be taken, with the day's orders, the buildings and castle to raise, and the army. The **Diplomacy** page: the four rival courts as a Civ-style screen showing who they are, how they feel about you, roughly how rich and strong they are, what they will deal on, and your courtships. The endgame parts of Diplomacy (Accords, coalitions, the Ultimatum) come in T16, once T12 exists.

## Read first

- Book: Ch 3 (all of it), Ch 6 (all of it), Ch 7, Ch 8, Ch 10 "The day's threats" and "Outcomes", Ch 12 "The four rivals", "Respect" and "What the player sees", Ch 2 rule 2 (orders lock at close), Ch 17 (the NPC note at the top, art direction for the map, the banner colors, contested torches and scorched hexes, the rival look table).
- Decisions: A-11, A-24, A-31, A-36, A-46, A-133.
- T14's hand-off notes (`GameArt`, `useText`, the Herald, view models, `screens.cjs`).

## Start from (already built)

- **The map** (`map.ts`): `hexLabel`, `ringOf`, `dominion`, `villageCredits`, `claimableBy`, `fronts`, `capitals`, `lairOf`, `hexIndex`, `touches`, `borderHexesOf`. Each hex has `kind`, `owner`, `land`, `road`, `village`, `fortification`, `status` and `statusUntil`.
- **Orders and combat** (`combat.ts`): `setOrders`, `ordersValidity` (coded problems with plain facts), `fieldBest` (the Marshal's pick), `defenseValue`, `assaultValue`, `effectiveGarrison`, `defenseFor`, `tidings`. `DailyOrders` already carries `extraAssaults`, `defenseOverride`, `hired` and `envoys`. The settled day's own orders stay in the state, for "repeat yesterday's orders".
- **Buildings and the army:** `tierOffer`/`buyTier`, `castleOffer`/`buyCastleTier`, `crossingOffer`/`buyCrossing` (refusals are codes with plain facts); `rosterDetail` (base power, Weary and the power's sources); `realmEffects` and `sourceLabel` (every bonus with where it comes from); `crownguardPower`.
- **Land:** `bidCheck`/`placeBid`, `courtshipSlots`, `trust`, `resistance`, `fortifyOffer`/`fortify`, `reclaimOffer`/`reclaim`, `availableDeals`, `offerDeal`/`makeDeal` (each refusal carries a `herald.deal.refused.<code>` text id), `buyPrice`, `sellPrice`, `trucePrice`.
- **Rivals:** `rivalView` (bands, Respect, disposition, status and rumor ids; exact numbers only when revealed), `respectEffects`, and `state.fronts` for each front's state and track.
- **Clock:** `dayCloseInstant` for the 04:00 countdown; `campaignNow()` in the app.

## Gaps in the current code to close here

1. **Garrisons are not hidden.** Earlier task text asked for the garrison as a band "unless the rules reveal it", but no rule ever reveals a garrison, and the book's hidden values are the benchmark, rival income, event criteria and (without the Spy Network or Spymaster) rival treasuries and armies (Ch 12, README Convention 6). Show the exact effective garrison an assault must beat (`effectiveGarrison`, wear included). If the owner wants garrisons hidden, that is a new decision.
2. **Dominion has no per-hex breakdown.** `dominion()` returns totals; the tooltip ("where it comes from") needs each hex's contribution. Add a pure helper in `map.ts` beside `dominion`, sharing its rule.
3. **No way to reach mid-game states for manual checks.** Add a dev-only scenario loader (A-09; absent from production builds) that writes prepared campaign states, such as "160 reputation and Dominion 8 on the Barracks" or "a contested and a scorched hex".

## Scope

1. **The hex map** (SVG, `components/realm/HexMap.tsx`):
   - 127 pointy-top hexes laid out from axial coordinates, slightly tilted like a tabletop.
   - Each hex: terrain through `<GameArt>` (placeholder: a fill by kind); a thick border in the owner's banner color; village and fortification markers; the contested overlay (torches) with days left; the scorched overlay; today's threat markers; the assault target.
   - Rim fronts show their war track (−3 to +3) on the battlefields; capitals, realm hexes and lairs are drawn distinctly.
   - Hover shows the label ("hex 3-4"); a click opens the hex panel. Hovering must not re-render all 127 hexes (memoize per hex).
2. **The hex panel:** owner, kind, ring, Dominion value, effective garrison, village loyalty, fortification and status, and every action allowed on this hex with its cost or the engine's refusal: set as assault target, court (opens a bid), buy (goes to Diplomacy), fortify, reclaim. "Available" must equal the engine's own check.
3. **Daily orders:**
   - Assault target(s), and moving companies between Defense and Assault, with banner limits shown; hired blades and envoys when available.
   - The Marshal's default with a "use the Marshal's choice" reset, and "repeat yesterday's orders" (A-36).
   - A countdown to the 04:00 lock; read-only after it.
   - An expected Defense and Assault from today's Valor so far, labeled as an estimate. With no orders, the preview says every company defends.
4. **Buildings and castle:** the four buildings with tier, company, what the next tier gives, its requirements (Dominion, reputation, Tier V's conditions) and Buy; the castle tier with banners and walls; the six Crossings with stages, perks and costs; the Crownguard; Dominion per building with its per-hex tooltip (gap 2).
5. **The roster:** every company with its power and the sources of that power, tags, reach, Weary, items, and its source (building, Crossing, Elite, vassal, …).
6. **Rival panels** on the Diplomacy page, one per rival:
   - A portrait through `<GameArt>` in a mood that follows disposition: calm at Peace, angry at War, humbled when Humbled or resolved.
   - Name, realm and status; disposition toward the player; a Respect meter with the 25, 40, 50, 60 and 75 thresholds marked and what each opens (`respectEffects`).
   - The treasury band and army band (exact numbers only with the Spy Network or the Spymaster, through `rivalView`), rumors, and its front wars.
   - A one-line greeting from `rivals.<id>.*` that follows its mood (the lines themselves are A3's).
7. **Deals:** every line of `availableDeals` with its price and requirement; unavailable ones stay listed with the engine's reason text. Confirming a deal shows the rival's one-line reaction.
8. **Courtships:** open bids (village, bid, current Trust, slots used); place a bid; past results from the log (defected, held and the loyalty drop, void). Offers resolve at the week close.
9. **View models** in `lib/game/view/realm.ts`, `view/orders.ts` and `view/diplomacy.ts`, with tests. Components only render.

## Out of scope

Accords, coalitions, the Ultimatum and the endgame cards (T16); the battle and Armory screens (T16); final art and lines (A2, A3).

## Files

- Create: `src/renderer/src/components/realm/*`, `src/renderer/src/components/diplomacy/*`, `src/renderer/src/lib/game/view/realm.ts`, `view/orders.ts`, `view/diplomacy.ts`, `src/renderer/src/styles/realm.css`, `diplomacy.css`, `tests/game/viewRealm.test.ts`, `tests/game/viewDiplomacy.test.ts`, the dev scenario loader.
- Edit: `pages/RealmPage.tsx`, `pages/DiplomacyPage.tsx`, `map.ts` (gap 2).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Layout: no two of the 127 hex centers are closer than the hex width × 0.9.
- [ ] Every action the hex panel offers matches the engine: for 200 seeded hexes in a mid-game state, "available" equals the engine's check returning ok.
- [ ] Orders: you can't assign more companies than the banners allow; after the 04:00 lock (dev clock) the panel is read-only; with no orders the preview says every company defends.
- [ ] Hidden values: across every rival and every state of a 70-week `settle`-driven trace, the Diplomacy view model holds no exact treasury, AV, income or benchmark unless the Spy Network or Spymaster applies (scan values against the true numbers).
- [ ] Every deal shown as available is accepted by `makeDeal`; every unavailable one shows the engine's reason text id.
- [ ] Manual, with dev time travel and the scenario loader: buy Barracks Tier II and see the company change in the roster; set an assault on an adjacent beast den, advance a day, and see the hex change owner with spoils in the purse; lose a defense and see the scorched overlay for 3 days; raise Respect with the Goblin to 25 and buy a hex; court a neutral village and see it defect at the week close.
- [ ] Hovering across the map stays under 16 ms per commit (React Profiler; attach the measurement).
- [ ] Screenshots at 1024×768 and 1920×1080: the founding map, a mid-game map with contested and scorched hexes, the orders panel, the buildings panel, the four rival panels, the deals list and the courtships list.

## Hand-off notes

*(The implementing agent adds notes here: the view models T16 extends for the endgame, and the scenario loader's states.)*
