# Starter game art direction

Route: original generated raster art using the built-in ImageGen tool. The owner supplied a portrait and requested this direction on 2026-10-08. The starter set covered all 17 manifest classes. The expanded early-game set provides 65 installed slots; 65 of 166 required early slots are ready.

## Shared style paragraph

True painterly pixel art built from broad connected square color clusters, crisp stepped contours and bold warm dark outlines. Use exaggerated medieval fantasy shapes, saturated earthy colors, golden upper-left light and four or five discrete shaded facets per material. Faces, armor and cloth need large clear shapes that stay readable at 48 pixels. Avoid smooth blended gradients, fine-grained surface texture, realistic pores or scratches, soft edge halos, and photographic detail.

The supplied portrait establishes emerald fabric, chunky silver metal, brown outlines and visible painted pixel clusters. Apply its materials and shapes to original architecture, terrain, ordinary soldiers, rulers and interface pieces. The militia is a company, not a new main character. Keep small tokens simple; wide scenes can carry more detail.

## Reference set

- [Owner's portrait](reference/owner-portrait.png): supplied visual direction.
- [Militia](reference/militia.png): character materials and silhouette.
- [Starting keep](reference/keep.png): architecture and lighting.
- [Interface frame](reference/frame.png): oak, bronze and emerald.

## Banner colors

Retained from the game's existing `OWNER_COLORS` values.

| Owner | Main cloth | Edge | Light lettering |
| --- | --- | --- | --- |
| Player | `#b8322a` | `#e2b24a` | `#fff3d6` |
| Orc | `#7d1414` | `#3a0808` | `#ffe6dc` |
| Goblin | `#c79a2a` | `#6b4e0c` | `#2a1a05` |
| Dwarf | `#9c6430` | `#4a2c12` | `#fff0dc` |
| Archmage | `#6b3fa0` | `#2e1650` | `#f3e8ff` |
| Neutral | `#8a7a66` | `#4d4234` | `#fbf4e6` |

The player's new banner/seal use an original sunrise-over-stone-tower motif. Other samples use the reference's emerald accents; map ownership borders still distinguish factions.

## Installed starter set

All files below are in `src/renderer/public/game-assets/` and are mapped in its manifest. In `npm run dev`, **Art samples** at bottom-left shows every class before campaign founding. **Reload art** refreshes artwork after file drops. Previewing later-game art grants no progression.

| Class | Slot / PNG filename | Dimensions | Placement |
| --- | --- | --- | --- |
| Terrain | `hex.wild.png` | 222 × 256 | Starting Realm wilderness |
| Overlay | `hex.overlay.contested.png` | 222 × 256 | Contested hexes; preview over wilderness |
| Building | `building.barracks.1.png` | 512 × 512 | Starting barracks card |
| Castle | `castle.1.png` | 768 × 768 | Starting keep card |
| Rival | `rival.orc.calm-early-v3.png` | 512 × 640 | Orc diplomacy court |
| Token | `company.militia.token-pixel-v2.png` | 128 × 128 | Starting barracks roster and battles |
| Portrait | `company.militia.portrait-pixel-v2.png` | 512 × 512 | Art samples; company portraits have no current game screen |
| Item | `item.whetstones.png` | 128 × 128 | Rank I Armory after Milestone 1; preview immediately |
| Banner | `banner.player.png` | 256 × 512 | Starting castle heading |
| Event | `event.merchantCaravan-pixel-v2.png` | 768 × 512 | Art samples; existing events use Herald text |
| Milestone | `milestone.1-pixel-v2.png` | 1920 × 1080 | First milestone moment; preview immediately |
| Moment | `moment.grandBattleWon-pixel-v2.png` | 1920 × 1080 | Grand Battle victory card; preview immediately |
| Frame | `ui.frame.png` | 512 × 512 | Art samples |
| Button | `ui.button.png` | 256 × 64 | Art samples |
| Parchment | `ui.parchment.png` | 1024 × 1024 | Page sheets and Armory art slot |
| Seal | `ui.seal.png` | 128 × 128 | Founding confirmation seal |
| Icon | `ui.icon.purse.png` | 64 × 64 | Campaign purse in top bar |

## Constraints and verification

Use exact manifest dimensions. Hexes have transparent pointy-top corners; overlays also have transparent centers. Characters, buildings, tokens, banners, UI borders and icons preserve generated alpha. Scene cards and parchment are opaque. Crop/resize/canvas fitting is deterministic preparation of generated artwork.

`npm run assets:check -- --starter --strict` requires a valid sample per class, validates every referenced file's dimensions and rejects unknown files. Full `--strict` still requires all 255 slots and intentionally remains incomplete for this starter set. The generated [slot checklist](../assets.md) records the remaining placeholders.

Exact prompts/source paths: [environment prompts](environment-prompts.md), [character prompts](character-prompts.md), [interface and scene prompts](interface-scene-prompts.md). Preview: [contact sheet](asset-contact-sheet.png), [48px silhouette check](asset-thumbnails-48.png). Production bundles the same manifest and copies all public images into `out/renderer/game-assets/` for offline use; rebuild after adding art.

## Pixel style correction (2026-10-08)

The owner rejected the smooth character and milestone rendering. Orc, militia portrait/token, first milestone, victory and caravan were redrawn with the actual supplied portrait as the style reference. Versioned filenames force fresh URLs in the live dev build. Characters use a 256-pixel logical grid, scene moments a 480 × 270 grid and caravan 384 × 256, with nearest-neighbor integer enlargement; GameArt also uses pixelated scaling. The page-paper material retains smooth texture scaling.

Current revision prompts: [characters](character-prompts.md), [milestone/victory](pixel-scene-prompts.md), [caravan](pixel-caravan-prompts.md). Originals are retained in `superseded/`.

## First ten weeks expansion

See [the full asset set, prompts and coverage](first-ten-weeks/README.md). The Orc was entirely redesigned; all moods, the map, early armies/upgrades and early unlock/event art use the owner’s pixel reference.
