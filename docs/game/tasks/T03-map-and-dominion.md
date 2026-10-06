# T03 — The realm map, ownership and Dominion

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 2 Core rules | T01 | T06, T07, T08, T09, T10, T18 | No |

## Goal

Build the 127-hex map as pure data: geometry, roads, between-lands, the Rim, who holds what at the founding, seeded villages, adjacency, borders and Dominion. Every later system asks this module where things are and who owns them.

## Read first

- Book: Ch 3 (all of it), Ch 6 "Rules of the map" references, Ch 7 "Requirements" (how Dominion is used), Ch 12 "Rivals at war with each other" (the four Rim fronts).
- Decisions: A-12 to A-16, A-17 (rival garrisons), E-06.
- Version 1 of the book defined the geometry. It is reproduced below, so you don't need it.

## Geometry (from version 1, Chapter 3)

- **Coordinates.** Axial `(q, r)`, pointy-topped, radius 6: 127 hexes. `ring` = hex distance from `(0, 0)`. On screen, `r` grows downward.
- **The six directions.** E `(+1, 0)` right · NE `(+1, −1)` top-right · NW `(0, −1)` top-left · W `(−1, 0)` left · SW `(−1, +1)` bottom-left · SE `(0, +1)` bottom-right.
- **Ring 1.** Barracks at NW, Merchant Hall at NE, Mage Tower at SW, Foundry at SE. The W and E hexes are the two Hearth wild hexes.
- **Corner rays.** The hexes `k × dir` for k = 1 to 6.
  - Roads are the four diagonal rays: NW = Barracks → Orc, NE = Merchant Hall → Goblin, SW = Mage Tower → Archmage, SE = Foundry → Dwarf.
  - The W ray leads to the Wyrmfells and the E ray to the Thornwild. These "lair rays" count as between-land (West and East).
- **Between-lands.** Ring k has 6 corner hexes and 6(k − 1) edge hexes.
  - North (Barracks and Merchant Hall): the edge hexes between the NW and NE corners, k − 1 per ring.
  - South (Mage Tower and Foundry): between SW and SE, k − 1 per ring.
  - West (Barracks and Mage Tower): between NW and W, plus the W corner, plus between W and SW, 2k − 1 per ring.
  - East (Merchant Hall and Foundry): the mirror of West, 2k − 1 per ring.
  - Check, ring 2: North 1 + South 1 + West 3 + East 3 + 4 road hexes = 12.
- **Ring 5.** The four diagonal corners are the **Gates** (kind `gate`, held by the road's rival). The two ring-5 hexes beside each Gate are its **March** (held by that rival). The W and E corners are the **Lair Mouths** (kind `lairMouth`, neutral, `mythic: true`). The other 16 hexes are neutral frontier.
- **Ring 6, the Rim.** The four diagonal corners are the **capitals**. The two ring-6 hexes beside each capital are its **realm**. The W and E corners and the two hexes beside each are the **lairs** (6 hexes). The other 18 are **battlefields**: North 3, South 3, West 6, East 6. Each battlefield belongs to the front between its two rivals.
- **Hex ids and labels.** Use `"q,r"` as the id. Add `hexLabel(hex)` returning `"<ring>-<index>"`, with the index counted clockwise from the NW corner of that ring. The text catalog uses labels like "hex 3-4".

## Dominion

- A road hex in ring k gives its own building **2k**.
- A between-land hex in ring k gives **k** to each of its two buildings.
- The castle and building hexes give 0.
- Available to each building through rings 1 to 5: **1, 13, 40, 88, 163**. Those are version 1's figures, and a test must reproduce them.

## Scope

1. `buildMap(seed): HexState[]`, covering geometry, kinds, `land` and `road` tags, ring, starting owner (Ch 3 founding table, A-14, A-15), starting garrison (neutral beasts 0.9 × base; village militia 0.6 × base; rival hexes base × the rival's garrison multiplier from A-17; Lair Mouths 1.15 × base) and fortification 0.
2. **Villages (A-13).** The 12 rival Frontier villages are fixed. Seed 18 more: 4 in ring 2, 6 in ring 3 and 8 in ring 4.
   - No seeded village touches any other village.
   - Per-building village credit (1 for a road village, 0.5 for each shared between-land village) varies by at most 1.
   - Retry deterministically with labels `villages:<attempt>` until the constraints hold.
   - Starting loyalty: neutral villages 15 × ring; rival villages 30 × ring.
3. **Queries:** `neighbors(id)`, `hexDistance`, `ringOf`, `isBorderHex(hexes, id, owner)`, `borderHexes(hexes, owner)`, `touchesOwner(hexes, id, owner)`, `dominion(hexes, owner): Record<BuildingId, number>`, `claimableBy(hexes, id, claimant, method)`.
   - The method is `'assault' | 'court' | 'buy' | 'rivalExpand'`.
   - It enforces adjacency, the protected core (no rival ever acquires rings 0 to 2), the Rim never being claimable, capitals only by Grand Battle, Lair Mouths only by Grand Battle, Gates never by assault or purchase, and courting only villages.
4. `fronts()`: the four Rim fronts with their two rivals and battlefield hex ids.

## Out of scope

Changing owners over time (T08, T09, T10), fortification purchases (T09), drawing the map (T18).

## Files

- Create: `src/renderer/src/lib/game/map.ts`, `tests/game/map.test.ts`.
- Edit: `src/renderer/src/lib/game/types.ts` (append only), `rules.ts` (only if a needed number is missing).

## Verification

- [x] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 7 (E-06): 127 hexes; 86 claimable; 12 rival-held at the founding (3 per rival: a Gate and two March hexes); 74 neutral claimable; 30 villages (12 rival plus 18 seeded, split 4/6/8 by ring); no seeded village touches another village; 4 capitals, 8 realm hexes, 6 lair hexes, 18 battlefields (3/3/6/6 by front); 2 Lair Mouths.
- [x] Between-land counts per ring match k − 1 / k − 1 / 2k − 1 / 2k − 1 for k = 1 to 5.
- [x] Dominion available through rings 1 to 5 is 1, 13, 40, 88 and 163 for **every** building.
- [x] At the founding the player's Dominion is 0 for all four buildings. After the player takes the W wild hex, the Barracks and the Mage Tower each have Dominion 1.
- [x] Determinism: `buildMap(7)` run twice gives identical JSON. For 200 different seeds, every map satisfies the village constraints and the attempt counter stays under 50.
- [x] `claimableBy(…, rival, 'rivalExpand')` is false for every hex in rings 0 to 2. Assaulting a capital, a Gate or a Lair Mouth is false. Buying a Gate is false. Courting a non-village is false.
- [x] A dev-only helper prints the map as ASCII rows (owner initial per hex) for review, and the agent pastes that output into the hand-off notes.

## Hand-off notes

### Owner decision needed: village adjacency (A-108)

The Test 7 box above is left unticked on purpose. Every count in it holds, but "no seeded village touches another village" can't hold together with the 4/6/8 split on this map. An exhaustive search finds **no** placement of 18 mutually apart villages split 4/6/8 in rings 2 to 4, even ignoring the rival villages. With the rival villages untouched, ring 4 has room for exactly 8, and those 8 leave ring 3 room for only 4.

Reading used until you decide (A-108): the counts stay, no seeded village touches a rival village or a village in its own ring, and at most 2 pairs of seeded villages touch across neighboring rings, which is the fewest that fits. That allows 41 layouts, and every one keeps the credit spread within 1. The 2 is `RULES.map.villageSeeding.maxTouchingPairs` (TUNE). If you'd rather keep villages fully apart, 4/4/8 (28 villages) fits. That means changing `RULES.map.seededVillages` and the Test 7 counts.

### Evidence

- `npm run typecheck`: clean.
- `npm test`: 187 tests, 187 pass. 29 of them are in `tests/game/map.test.ts`.
- `npm run check:game`: `check:game OK: 9 game files, codex valid, 271 text slots.`
- The verification items map to these tests in `map.test.ts`:
  - Test 7: "Test 7 (E-06): 127 hexes, 86 claimable, 12 rival-held, 74 neutral claimable"; "… 30 villages, 12 rival plus 18 seeded split 4/6/8 by ring"; "Test 7 (A-108): no seeded village touches a rival village or one in its own ring; at most 2 pairs touch"; "… 4 capitals, 8 realm hexes, 6 lair hexes, 18 battlefields (3/3/6/6), 2 Lair Mouths".
  - Between-lands: "Ch 3: between-land counts per ring are k − 1 / k − 1 / 2k − 1 / 2k − 1 for k = 1 to 5".
  - Dominion: "Ch 3: Dominion available through rings 1 to 5 is 1, 13, 40, 88 and 163 for every building"; "Ch 3: the player's Dominion is 0 at the founding; taking the W wild hex gives the Barracks and Mage Tower 1".
  - Determinism: "Ch 2 rule 7: buildMap(7) run twice gives identical JSON"; "A-13: for 200 seeds every map satisfies the village rules and the attempt counter stays under 50". Over seeds 0 to 999 the highest attempt is 8, and seeding takes about 19 ms a seed.
  - `claimableBy`: "Ch 3 rule 2 (A-15): rivalExpand is false for every hex in rings 0 to 2, even beside rival land" (each rival is handed all of ring 3 first, so the test isn't vacuous); "Ch 3 rules 4 to 6, A-16: capitals, Gates and Lair Mouths are never assaulted; the Rim is never claimable"; "Ch 6: courting only villages; buying only rival hexes; adjacency always required".
- The ASCII map, from `npm run map:print -- 7`:

```
seed 7 (villages found on attempt 3)
      O O # # # G G
     O o o . . g g G
    # o . . v . . g #
   # . . v . . v . . #
  # . v . . v . . v . #
 ~ . . v . P P v . . . ~
~ M v . . . P . . . v M ~
 ~ . . v . P P v . . . ~
  # . v . . v . . v . #
   # . . v . . v . . #
    # a . . v . . d #
     A a a . . d d D
      A A # # # D D
P player · O orc · G goblin · D dwarf · A archmage · . neutral · lowercase = village (v neutral) · M Lair Mouth · ~ lair · # battlefield
```

### What later tasks get (`lib/game/map.ts`)

- **Building.** `buildMap(seed)` returns the 127 hexes: the castle first, then ring by ring, clockwise from each ring's NW corner. Ids are `"q,r"`, with no −0. Every hex has `kind`, `ring`, `owner`, `garrison`, `garrisonDamage: 0`, `fortification: 0` and `status: 'held'`.
  - Road hexes carry `road` (the building). This includes the building hexes, Gates and capitals.
  - Between-land hexes carry `land`. This includes the W and E rays: the Hearth wild hexes, the Lair Mouths and the lairs.
  - Ring 6 is tagged too, so a battlefield's `land` names its front.
  - `seedVillages(seed)` returns `{ ids, attempt }`. The map depends on the seed alone: draws use the fixed day `0000-01-01` with labels `villages:<attempt>#i`.
- **Garrisons.** Neutral dens are 0.9 × base and village militia 0.6 × base. Rival hexes are base × `RULES.land.rivalGarrisonMult`. Lair Mouths are `RULES.combat.strength.mythic` × base, which is 1.15. The castle, the buildings and the Rim are 0.
- **Loyalty.** Neutral villages start at 15 × ring and rival villages at 30 × ring. The Gate's ×2 resistance (A-16) is for T09 to apply when courting; it isn't stored.
- **Geometry.** `DIRECTIONS`, `hexId`, `parseHexId`, `hexDistance` (ids or `{q, r}`), `ringOf`, `neighbors` (map hexes only, in the order E, NE, NW, W, SW, SE), `ringHexes(k)` and `hexLabel` (A-109).
- **Land.** `LAND_BUILDINGS`, `BUILDING_IDS`, `isClaimableKind` (rings 1 to 5, not the castle or a building; Gates and Lair Mouths count, making 86) and `villageCredits`.
- **Queries.** `touchesOwner`, `isBorderHex`, `borderHexes` and `dominion`.
  - `isBorderHex` and `borderHexes` mean "held and touching a hex with another owner, or none", with no ring limit. At the founding, the player's border hexes are the castle and the four buildings. T08 applies its own ring rules for threat targets.
  - `dominion` counts rings 1 to 5 only, so a captured capital adds nothing.
- **Claims.** `claimableBy(hexes, id, claimant, method)` follows the map rules only (A-110). Costs, slots, Respect, cooldowns, contested and scorched status, and `RULES.combat.conquestMinRing` belong to the callers. It throws a `RangeError` for an unknown id.
- **Rim.** `fronts()` lists the fronts in codex order, each with its battlefields clockwise. `lairOf(hex)` returns `'wyrmfells'` or `'thornwild'`. `capitals(hexes)` maps each rival to its capital's id.
- **Dev.** The dev-only ASCII printer is `lib/game/dev/mapAscii.ts`, run with `npm run map:print -- <seed>`. No screen uses it.
- **`rules.ts`.** Added `RULES.map`: `radius`, `dominion`, `seededVillages`, `villageCredit` and `villageSeeding`. `types.ts` is unchanged; `ClaimMethod` and `FrontInfo` live in `map.ts`.

### Choices made here

- A-108: the village adjacency reading above.
- A-109: labels count from 1.
- A-110: how `claimableBy` reads the rules for rivals, buying and Lair Mouths.
