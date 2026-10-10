# Regional hex tiles (D-09)

56 map tiles that give each region its own look: the four rivals' realms (the Ashen Steppe, the Gilded Warren, Dun Kaldor and Emrys’ Reach), the two lair lands (the Thornwild and the Wyrmfells), and blended tiles where two regions meet.

| File | What it is |
| --- | --- |
| [descriptors.md](descriptors.md) | What every tile shows, approved by the owner on 2026-10-09. The source for the prompts. |
| [prompts.json](prompts.json) | One Codex prompt per tile, with its output file, size and reference images. Generated; do not edit by hand. |
| `batch.json` | You create it: the approved images to install (step 2 below). |
| `index.html` | Created by the install script: every tile side by side, installed or still to make. |

## How the game uses them

Each hex beyond the heartland belongs to the region of the corner ray it is nearest (`regionsOf` in `map.ts`), and asks for its region's version of its terrain (`regionTerrainSlot` in `view/realm.ts`): `hex.wilds.dwarf.near`, `hex.capital.goblin`, `hex.village.orc-goblin`. Until that file is installed, the hex draws today's shared tile, so tiles can arrive one at a time and the map never breaks. The art follows the land, not the owner: a conquered hex keeps its region's look under the new border color.

## Making the tiles with Codex

1. **Generate.** For each entry in `prompts.json`, make one image with the built-in image generator: attach the two `references` in order (the existing tile whose hexagon outline to match, then the style reference) and use `prompt` as written. Keep each region consistent: once its first tile is approved, also attach that tile as a reference for the region's other tiles, and attach both regions' approved tiles for a border tile.
   Suggested order: every region's near and far wilds first (they cover most of the map), then the capitals, gates, home hexes (`realm`), villages, roads, lair tiles and battlefields, and the 12 border tiles last.
2. **Record.** For each image you approve, add an entry to `docs/game/art/zone-terrain/batch.json`:
   ```json
   [{ "slot": "hex.wilds.dwarf.near", "source": "C:/path/to/the/generated.png", "mode": "built-in image_gen", "prompt": "…" }]
   ```
   Only `slot` and `source` are read; the rest is the generation record, as in `../rivals-v4/batch.json`.
3. **Install.**
   ```
   node scripts/install-zone-terrain.cjs docs/game/art/zone-terrain/batch.json <path-to-sharp>
   ```
   Each image is cropped to its visible pixels, fit into the 111 × 128 logical pixel canvas with nearest-neighbor sampling, doubled to 222 × 256 and saved as `src/renderer/public/game-assets/<slot>.png`; `manifest.json` gets the file and `index.html` is rebuilt. An image whose corners around the hexagon are not transparent (a painted background) is refused with its reason, and the rest of the batch still installs. Running the same batch again reinstalls it.
4. **Check.** Run `npm run assets:check` to update the checklist in `docs/game/assets.md`. Open `index.html` to compare the tiles side by side, and the Realm map in the app (in the development build, **Art samples → Reload art** picks up new files without a restart).

## Changing a tile

Edit its row (or its region's **Look:** line) in `descriptors.md`, run `node scripts/zone-terrain-prompts.cjs` to rebuild `prompts.json`, then generate and install that tile again.
