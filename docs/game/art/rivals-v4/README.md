# Revised rival portraits

The approved orc, green-nosed goblin, bronze-armored dwarf, and young blond mage now fill all twelve rival slots: calm, angry, and humbled for each character.

- [Compare all portraits](index.html).
- [Generation prompts and source paths](batch.json). Expressions were generated with built-in `image_gen`, using each approved calm portrait as the identity and style reference.
- Runtime PNGs: `src/renderer/public/game-assets/rival.<rival>.<mood>-revised-v4.png`, linked by `manifest.json`.
- Previous runtime portraits are preserved in `docs/game/art/superseded/rivals-v3/`.

Each image is transparent and 512 × 640 pixels, normalized through the existing 256 × 320 logical pixel size with nearest-neighbor scaling. Character identity, clothing, and props stay consistent across expressions. The approved default orc remains fierce even in the calm slot.

To inspect in the development app, open **Art samples**, enable **Show all installed art**, and use **Reload art**. Existing diplomacy logic chooses the emotion slots; no game rules or save data changed.

The generation batch can be installed again with `node scripts/install-rival-art.cjs docs/game/art/rivals-v4/batch.json <path-to-sharp>`, while the recorded local source files remain available. Committed runtime assets and the comparison page do not depend on those source paths.
