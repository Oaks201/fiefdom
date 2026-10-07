# T09 — Influence, trade, fortification and reclaiming

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 3 The war | T06, T07 | T10, T18, T19 | No |

## Goal

Give the player the two non-violent ways to take land, winning a village's trust and striking a deal, plus the defensive tools: fortifying a hex and reclaiming one recently lost. Implement the `courtships` week phase.

## Read first

- Book: Ch 6 "Influence: courting a village", "Trade and negotiation" and "Losing land and taking it back", Ch 5 "Where reputation goes", Ch 9 Grace I (reclaiming), Ch 12 "Respect" (the effects table), Ch 14 "Three ways to resolve a rival" (courting a Gate needs twice the resistance; the defection count).
- Decisions: A-16, A-22, A-23, A-31, A-32, A-39.

## Scope

All in `lib/game/land.ts`.

1. **Courtships.**
   - `placeBid(state, hexId, bid)`: the target must be an adjacent village (neutral or rival-held); a free courtship slot is needed (A-32); the bid is held from the purse.
   - At week close: Trust = clamp(0.6 + 0.6 × RC, 0.6, 1.2), +0.05 with Envoy's Rest; Offer = Bid × Trust.
   - Resistance: neutral 15 × ring (current loyalty); rival-held 30 × ring + the owner's counter-bid that week (from T10 through an interface; 0 until then); ×2 for a Gate.
   - Defects: the hex and village are the player's at dawn, the whole bid is spent, −3 Respect with a rival owner, and loyalty is set per A-22. Record `takenBy: 'influence'` for the defection count.
   - Holds: half the bid is refunded, and loyalty drops permanently by 10% of the Offer.
   - Two suitors: when a rival bids on the same neutral village (rival Trust 1.0), the higher Offer wins and the loser gets half back.
2. **Deals with rivals (the Diplomacy list).** `availableDeals(state, rival)` returns each deal with its price, whether it is allowed, and the reason if not (a text id).
   - Buy a hex: Respect ≥ 50 (Goblin ≥ 25); not the Gate; not at war with the player; price 50 × ring × greed, ×1.5 for a village, −20% with the Exchange Wing; +2 Respect; `takenBy: 'trade'`.
   - Sell a hex: not rings 1 or 2; Respect ≥ 25; the player receives 0.7 × the buy price; +5 Respect.
   - Truce: any time except during a Grand Battle warning; price 30 × the highest ring that rival borders; no raids or conquest attempts from that rival for 7 days; +2 Respect.
   - Non-aggression pact: Respect ≥ 40; 250; no conquest attempts for 28 days and raids at half rate.
   - Call to arms: Respect ≥ 60, and the target is not allied with that rival; 200; the rival declares war on the target for 14 days (sets the front to War through T10's front state).
   - Limit: at most one hex deal per rival every 4 weeks.
   - Truces and pacts are stored with expiry dates. T08's raider selection and T10's conquest planning must read them, so expose `blocksRaids(state, rival, day)` and `blocksConquest(state, rival, day)`.
3. **Fortification.** `fortify(state, hexId)` raises a player hex by one level, to a maximum of 3, at 15 / 35 / 70 × ring (−25% with the Kilns Wing). Rivals fortify through T10 (the Dwarf can reach 4 on its own hexes).
4. **Reclaiming.** With Grace ≥ I, a hex lost in the last 14 days can be reclaimed for half its current garrison in reputation, with no battle, if it still touches player land.
5. **The defection tally**, for T13: per rival, how many of its original villages the player won and how (`influence | trade | conquest`), and whether it still holds any.

## Out of scope

Rival bidding logic (T10), the Accord and coalition buy-outs (T13), screens (T18, T19).

## Files

- Create: `src/renderer/src/lib/game/land.ts`, `tests/game/land.test.ts`.
- Edit: `settle.ts` (fill the `courtships` phase only), `types.ts`, `rules.ts`.

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [x] Trust is 0.90 at RC 0.5, 1.08 at 0.8 and 1.20 at 1.0, and clamps to 0.6 at RC 0.
- [x] A neutral ring-3 village (resistance 45): bid 50 at RC 0.8 gives Offer 54 → it defects and 50 is spent. Bid 40 gives Offer 43.2 → it holds, 20 is refunded, and loyalty becomes 40.68.
- [x] A rival-held ring-4 village has resistance 120 + the counter-bid. A rival Gate on ring 5 has resistance 2 × 150 = 300 + the counter-bid.
- [x] Two suitors: when the Goblin's offer beats the player's, the player gets half the bid back and the village goes to the Goblin.
- [x] Courtship slots are 2 at the start, 3 at Merchant Hall III and 4 at Merchant Hall V (A-32). A third open bid at the start is refused.
- [x] Buying a ring-4 village from the Dwarf costs 50 × 4 × 2.0 × 1.5 = 600. It is refused at Respect 49 (allowed from the Goblin at 25), refused for any Gate, and a second hex deal with the same rival within 4 weeks is refused.
- [x] Selling a ring-2 hex is refused. Selling a non-village ring-4 hex to the Orc pays 0.7 × 50 × 4 × 1.5 = 210.
- [x] A Truce bought when the rival borders ring 5 costs 150. For 7 days `blocksRaids` and `blocksConquest` are true for that rival. A Truce is refused during a Grand Battle warning.
- [x] Fortifying a ring-3 hex costs 45, then 105, then 210; a fourth level is refused; with the Kilns it costs 33.75, then 78.75, then 157.5.
- [x] Reclaiming at Grace I works for a hex lost 10 days ago, is refused at 15 days, and is refused at Grace 0.
- [x] Courtship resolution is settled once: re-running `settle` for the same week does not re-resolve bids (Test 9, part).

## Hand-off notes

*(The implementing agent adds notes here, including the counter-bid interface for T10.)*

**T09, 2026-10-07.** Everything is in `lib/game/land.ts`; tests in `tests/game/land.test.ts` (23 tests, one or more per verification line). New readings: A-139 to A-143 in `decisions.md`.

- **Courtships.** `placeBid(state, hexId, bid, today?)` checks `bidCheck` (an adjacent village via `claimableBy(…, 'court')`, one bid per village, a free slot from `realmEffects().courtshipSlots`, the purse) and posts the bid as a `spend` (`courtship:<hex>`). The `courtships` week phase in `settle.ts` computes Realm Consistency the same way the weight phase does, calls `resolveCourtships`, then `recoverLoyalty` (A-22: the player's villages regain 5% of 15 × ring a week). Bids placed by the week's last day resolve at its close; later ones wait. Refunds post as `return`. Resolved courtships leave `state.courtships`, so settling again never re-resolves them. The `courtship` event gained a `void` outcome (refunded in full).
- **Counter-bid interface for T10.** Call `placeRivalBid(state, rival, hexId, bid)` during the rival turn for a village the player courts. On the rival's own village it is the owner's counter-bid (added to resistance, never refunded); on a neutral village it makes the rival a second suitor at Trust 1.0 (half back to the treasury if it doesn't take the village). Deduct the bid from the treasury when you place it. The rival turn runs after `courtships` in the week order, so bids placed at week N's close count at week N+1's close, "that week" from the player's side. Bids on villages nobody courts are T10's own (A-25). `resistance(hex, counterBid)` is exported for T10's bid sizing.
- **Deals.** `availableDeals(state, rival, today?)` lists one buy line per rival hex touching the player's land and one sell line per player hex touching the rival's, each with a `noHex` line when there are none, plus Truce, pact and a call to arms against each other rival. Each line has its exact `price` (a sale's price is what the player receives) and `allowed`, and a refusal has `reason: { code, textId, needed?, have? }`, where `textId` is `herald.deal.refused.<code>` (17 new plain-fact slots in `herald.json`). `offerDeal` checks one deal, and `makeDeal` strikes it: purse, hex transfer (`how: 'trade'`), Respect, a `Deal` in `state.deals` and the `deal` event. Player actions post their events straight to `state.log`, dated `today`.
- **For T08 and T10.** `blocksRaids(state, rival, day)` (a Truce) and `blocksConquest` (a Truce or pact) are the single source now: `combat.ts`'s `canRaid` and `canConquer` call them, and `raiderWeights` uses `raidRateMult` (×0.5 under a pact). `callToArmsOn(state, day)` lists calls to arms in force; `makeDeal` sets the front and both rivals' mutual disposition to War at once, and T10's fronts phase must keep that front at War until `until`. For rival fortification use `fortificationCost(level, ring, mult)` and `fortificationCap(owner)` (the Dwarf's level 4 has no price in the book yet; `fortificationCost` throws for it, so T10 must set one).
- **Fortify and reclaim.** `fortify`/`fortifyOffer` (exact price; the purse posts it rounded, so the Kilns' 33.75 posts 33.8). `reclaim`/`reclaimOffer` read the loss date from the log (`lostOn`).
- **For T13.** `defectionTally(state, rival)` gives `{ original, won: { influence, trade, conquest }, holds }`; `originalVillages(seed)` rebuilds each rival's founding villages from the seed (cached).

Verification output (2026-10-07):

```
$ npm run typecheck   → no errors
$ npm test            → # tests 398, # pass 398, # fail 0
$ npm run check:game  → check:game OK: 21 game files, codex valid, 290 text slots.
```
