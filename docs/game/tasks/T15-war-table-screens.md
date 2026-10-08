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

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Layout: no two of the 127 hex centers are closer than the hex width × 0.9.
- [x] Every action the hex panel offers matches the engine: for 200 seeded hexes in a mid-game state, "available" equals the engine's check returning ok.
- [x] Orders: you can't assign more companies than the banners allow; after the 04:00 lock (dev clock) the panel is read-only; with no orders the preview says every company defends.
- [x] Hidden values: across every rival and every state of a 70-week `settle`-driven trace, the Diplomacy view model holds no exact treasury, AV, income or benchmark unless the Spy Network or Spymaster applies (scan values against the true numbers).
- [x] Every deal shown as available is accepted by `makeDeal`; every unavailable one shows the engine's reason text id.
- [x] Manual, with dev time travel and the scenario loader: buy Barracks Tier II and see the company change in the roster; set an assault on an adjacent beast den, advance a day, and see the hex change owner with spoils in the purse; lose a defense and see the scorched overlay for 3 days; raise Respect with the Goblin to 25 and buy a hex; court a neutral village and see it defect at the week close.
- [x] Hovering across the map stays under 16 ms per commit (React Profiler; attach the measurement).
- [x] Screenshots at 1024×768 and 1920×1080: the founding map, a mid-game map with contested and scorched hexes, the orders panel, the buildings panel, the four rival panels, the deals list and the courtships list.

## Hand-off notes

### Evidence (2026-10-07)

- `npm run typecheck`: clean. `npm test`: 594 tests, 594 pass (new: `viewRealm.test.ts` 11, `viewDiplomacy.test.ts` 7, `devScenarios.test.ts` 6). `npm run check:game`: `check:game OK: 38 game files, codex valid, 293 text slots.`
- **Layout:** "T15: no two of the 127 hex centers are closer than the hex width × 0.9; neighbors are one width apart" (the least distance is exactly the width, √3).
- **The hex panel matches the engine:** "T15: every action the hex panel offers matches the engine, for 200 seeded hexes in mid-game states" (two 16-week driven campaigns, 100 shuffled hexes each; every action's `available` equals `challenge`, `ordersValidity`, `bidCheck`, `offerDeal`, `fortifyOffer` or `reclaimOffer`, and every closed one carries a reason).
- **Orders:** "Ch 2 rule 2 / A-36: no more companies than the banners allow; read-only after the 04:00 lock; with no orders every company defends" and "A-36 / Ch 10: companies sent before a target is named still defend; a second assault needs Castle IV and its own target; chosen defenders stop at the banners". "T15: the estimate at the day's own Valor gives the outcome the close then gives".
- **Hidden values:** "Convention 6: across every day of a 70-week settled trace, rival panels hold no exact treasury, AV, income or benchmark unless the Spy Network applies": 490 settled days × 4 rivals; an unrevealed panel holds no number at all beyond Respect, its marks and the front tracks (numbers written in its text included); with the Spy Network exactly `treasury` and `army` appear.
- **Deals:** "Ch 6: every deal shown as available is accepted by makeDeal; every unavailable one carries the engine's reason text id" (two driven campaigns at Respect 10, 30, 55 and 70).
- **Manual, in the dev app** (`scripts/screens.cjs --dev` on the `devcampaign` data, with the scenario loader and `fiefdomDev.advanceDays`; values read off the page):
  1. Scenario *barracksII*: the Barracks card listed "Dominion 8 (8 now)" and "150 reputation" as met; Raise turned Militia into Men-at-Arms in the roster and the purse went 160 → 10.
  2. Scenario *armyReady*: assault on hex 1-3 (a Hearth den, garrison 13.5) with three companies; the estimate read "26.6 against garrison 13.5, taken in a rout". After +1 day the hex was the player's, the Herald said "Assault on hex 1-3: taken in a rout. Spoils 6.3." and the purse went 300 → 314.
  3. Scenario *contestedScorched*: the scorched hex read 3d, then 2d, 1d, and was clear on the 4th day; the contested hex showed its torch and 2d.
  4. Scenario *goblinTrade*: Skivvet's deals offered "Buy hex 5-5" for 450; striking it showed "Goblin: Buy hex 5-5 agreed for 450." and Respect went 47 → 49.
  5. Scenario *courtship*: a bid of 26 on hex 2-2 (Offer 31.0 against 30); after +1 day (the week close) the courtships list read "Hex 2-2, bid 26: defected to you" and the map showed the hex as the player's.
  The same five flows run headlessly in `devScenarios.test.ts` ("T15 manual 1" to "5").
- **Hover:** the dev build's React Profiler (around the whole Realm page) recorded 134 commits while the real pointer (CDP `Input.dispatchMouseEvent`) swept all 127 hexes at 1920×1080: **max 3.3 ms, p95 2.2 ms, mean 0.19 ms**. Hover lives in its own store (`useMapHover`), so a hover re-renders only the tooltip; each hex is memoized on its own facts.
- **Screenshots** at 1024×768 and 1920×1080 in `docs/game/screens/t15/`: `founding-map`, `midgame-map` (16 driven weeks, a contested and a scorched hex, the contested hex's panel and an assault target), `orders`, `buildings`, `rivals` (the four courts), `deals` (Skivvet's, with the Spy Network showing exact treasuries and armies) and `courtships` (an open bid and the bid form).

### For T16

- **View models:** `view/realm.ts` (`mapView`, `hexPanel`, `buildingsView`, `castleView`, `crossingsView`, `crownguardView`, `rosterView`, `effectLines`/`effectLabel`, `trustNow`, `suggestedBid`, `ownerName`, `buildingName`), `view/orders.ts` (`ordersView`, `ordersLock`, `assaultTargets`, and the pure builders `marshalOrders`, `repeatYesterday`, `withTarget`, `moveCompany`, `toggleDefender`, `withHelp`), `view/diplomacy.ts` (`rivalPanel(s)`, `respectMarks`, `moodOf`, `dealsView`, `dealName`, `dealReaction`, `courtableVillages`, `courtshipsView`) and `view/refusals.ts` (plain words for land, purchase, order and Grand Battle refusals; `requirementLines`).
- **The endgame in Diplomacy:** `pages/DiplomacyPage.tsx` renders the courts, `DealsList` and `Courtships`; add the Accord, coalition and Ultimatum banners above the courts. A coalition member's `buyout` already shows in its deals list (from `availableDeals`). `rivalPanel`'s greeting uses `fall`, `allied`, `warning` or `greeting`; `accordOffered` and `ultimatum` are free for T16's banners.
- **Grand Battles:** the hex panel offers "Call a Grand Battle" (`challenge`) on Gates, capitals and Lair Mouths, and the map marks announced battles (`MapHex.battle`, a horn). The battle route and the Herald notice are T16's.
- **Plumbing added:** `<GameArt place={…}>` draws a slot inside an SVG (a hex placeholder there is a plain terrain fill); `useUI.goDiplomacy(rival, hexId?)` opens a court with a hex picked out; roster companies carry their art slot (`RosterCompany.art`); `rosterDetail` exposes `parts` (adds, shares, cuts).
- **The scenario loader (gap 3):** `lib/game/dev/scenarios.ts`, in the DEV panel (Scenarios) and as `window.fiefdomDev.scenario(id)`; only `DevTimeTravel` imports it, so production builds don't contain it. States: `barracksII` (160 reputation, Dominion 8 on the Barracks), `armyReady` (every building at Tier II, Castle II, 300 reputation), `contestedScorched` (the Barracks road to ring 3, the Orc at War contesting the ring-3 hex until tomorrow, the ring-2 hex scorched for 3 days), `goblinTrade` (Goblin Respect 25, your land touching its March, 600 reputation), `courtship` (a neutral village beside your land, 300 reputation) and `rich` (+1,000). Add one by appending to `DEV_SCENARIOS`.
- **Scripts:** `scripts/screens.cjs` steps may move the real pointer (`"mouse": "<JS giving [[x, y], …]>"`). `scripts/screens-data.ts` also writes `founded` (a campaign founded yesterday evening), `devcampaign` (five weeks in, three weeks logged ahead) and `midgame` (the test driver's 16 weeks on fixed dates; run the dev build with the `FIEFDOM_DEV_NOW` it prints). In dev builds the Realm page records each commit's duration in `window.__fiefdomCommits`.

### Readings raised

A-181 (garrisons shown exactly, the Marshal's choice, assaults without a target, chosen defenders, the suggested bid, the estimate, portrait moods and greetings, dev scenario purse sources).
