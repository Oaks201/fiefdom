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

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] Test 7 (E-06): 127 hexes; 86 claimable; 12 rival-held at the founding (3 per rival: a Gate and two March hexes); 74 neutral claimable; 30 villages (12 rival plus 18 seeded, split 4/6/8 by ring); no seeded village touches another village; 4 capitals, 8 realm hexes, 6 lair hexes, 18 battlefields (3/3/6/6 by front); 2 Lair Mouths.
- [ ] Between-land counts per ring match k − 1 / k − 1 / 2k − 1 / 2k − 1 for k = 1 to 5.
- [ ] Dominion available through rings 1 to 5 is 1, 13, 40, 88 and 163 for **every** building.
- [ ] At the founding the player's Dominion is 0 for all four buildings. After the player takes the W wild hex, the Barracks and the Mage Tower each have Dominion 1.
- [ ] Determinism: `buildMap(7)` run twice gives identical JSON. For 200 different seeds, every map satisfies the village constraints and the attempt counter stays under 50.
- [ ] `claimableBy(…, rival, 'rivalExpand')` is false for every hex in rings 0 to 2. Assaulting a capital, a Gate or a Lair Mouth is false. Buying a Gate is false. Courting a non-village is false.
- [ ] A dev-only helper prints the map as ASCII rows (owner initial per hex) for review, and the agent pastes that output into the hand-off notes.

## Hand-off notes

*(The implementing agent adds notes here.)*
