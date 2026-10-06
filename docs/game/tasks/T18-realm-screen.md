# T18 — Realm screen: hex map, daily orders, buildings and roster

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T08, T09, T16 (T07 through T08) | T21 | Light |

## Goal

The player's war table: a tilted, painted-board hex map that shows who holds what, what is under attack and what can be taken. Beside it, the day's orders, the buildings and castle to raise, and the army roster. This is where most daily decisions happen, in 2 to 5 minutes.

## Read first

- Book: Ch 3 (all of it), Ch 6 (all of it), Ch 7 (all of it), Ch 8 (all of it), Ch 10 "The day's threats" and "Outcomes", Ch 2 rule 2 (orders lock at close), Ch 17 "Art direction" (map look, banner colors, contested torches, scorched hexes).
- Decisions: A-11, A-24, A-31, A-36, A-46.
- Code: T03 `map.ts`, T07 `buildings.ts`, `roster.ts` and `effects.ts`, T08 `combat.ts`, T09 `land.ts`, T16 `<GameArt>` and Herald.

## Scope

1. **The hex map** (SVG, in `components/realm/HexMap.tsx`):
   - 127 pointy-top hexes laid out from axial coordinates, with a slight tilt to suggest a tabletop.
   - Each hex: terrain art through `<GameArt>` (placeholder: a fill by kind); a thick border in the owner's banner color; village and fortification markers; a contested overlay (torches) with days left; a scorched overlay; today's threat markers; the assault target.
   - Rim fronts show their war track (−3 to +3) on the battlefield hexes. Capitals, realm hexes and lairs are drawn distinctly.
   - Hover shows a label like "hex 3-4". Clicking opens the hex panel.
   - Performance: hovering must not re-render all 127 hexes (memoize per hex).
2. **The hex panel:** owner, kind, ring, Dominion value, garrison (a band, or the exact number when the rules reveal it), village loyalty, fortification, and status. It also lists the actions allowed for this hex, each with its cost or the reason it is unavailable, taken from the engine's own checks (`claimableBy`, `availableDeals`, and so on): set as assault target, court (opens a bid), buy (sends to Diplomacy), fortify, reclaim.
3. **Daily orders:**
   - The assault target(s), and dragging companies between Defense and Assault (banner limits shown).
   - The Marshal's default with a "use Marshal's choice" reset, and "repeat yesterday's orders" (A-36).
   - A countdown to the 04:00 lock; orders are read-only after the lock.
   - An expected Defense and Assault preview using today's Valor so far, labeled as an estimate.
4. **Buildings and castle:** four buildings, each with its tier, its company, what the next tier gives, its requirements (Dominion, reputation, Tier V conditions) and a Buy button. The castle tier with banners and walls. The six Crossings with their stages, perks and costs. The Crownguard status. Dominion per building, with a tooltip of where it comes from.
5. **The roster:** every company with its power (and the sources of that power), tags, reach, Weary, items (when T14 is in), and its source (building, Crossing, Elite, vassal, and so on).
6. **View models** in `lib/game/view/realm.ts` and `view/orders.ts`, with tests. Components only render.

## Out of scope

Diplomacy deals (T19), the battle screen (T20), the Armory (T14), final art (A2).

## Files

- Create: `src/renderer/src/components/realm/*`, `src/renderer/src/lib/game/view/realm.ts`, `view/orders.ts`, `src/renderer/src/styles/realm.css`, `tests/game/viewRealm.test.ts`.
- Edit: `pages/RealmPage.tsx`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] View model: the 127 hex screen positions don't overlap (no two centers closer than the hex width × 0.9). Every action the panel offers matches the engine: for 200 random hexes in a seeded mid-game state, "available" equals the engine check returning ok.
- [ ] The garrison shows as a band unless the rules reveal it (test both).
- [ ] Orders: you can't assign more companies than the banners allow; after the 04:00 lock (dev clock) the panel is read-only; with no orders, the preview says all companies defend.
- [ ] Manual, with dev time travel and a dev seed that gives 160 reputation and Dominion 8 on the Barracks: buy Barracks Tier II and see the company change in the roster. Set an assault on an adjacent beast den, advance a day, and see the hex change owner on the map with spoils in the purse. Lose a defense and see the scorched overlay for 3 days.
- [ ] Hovering across the map stays smooth (React Profiler: under 16 ms per hover commit; attach the measurement).
- [ ] Screenshots at 1024×768 and 1920×1080: the founding map, a mid-game map with contested and scorched hexes, the orders panel and the buildings panel.

## Hand-off notes

*(The implementing agent adds notes here.)*
