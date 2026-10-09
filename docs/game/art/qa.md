# Starter art verification

Verified on 2026-10-08 with the repository's Electron/CDP utilities. The QA runner is `scripts/art-qa.cjs`; detailed reports and screenshots are in `output/art-qa/development/` and `output/art-qa/production-offline/`.

## Reproduce

```powershell
node node_modules/tsx/dist/cli.mjs scripts/screens-data.ts output/art-qa/fixtures
node scripts/art-qa.cjs
npm run build
node scripts/art-qa.cjs --production
```

The runner uses copied scratch fixtures via `FIEFDOM_DATA_DIR`, unique Electron user-data directories, and debug ports 9457 (development) and 9458 (production). It does not read or write the player's saved ledger or campaign.

## Checks

- Exactly 17 populated art classes in the manifest, with one representative file per class.
- All 17 images decode at their required natural pixel dimensions.
- Art samples opens before a campaign is founded and reports “17 of 17 asset classes installed.”
- The gallery's preview images fit inside their cards, including tall terrain and banner assets.
- The development Reload art button changes cache revision and successfully reloads the images.
- Screenshots at 1024 × 768 and 1920 × 1080 cover every gallery scroll position, the founding Realm map, the first-tier castle and Barracks, the actual starting Army roster's Militia token, and Ugrak's starting diplomacy portrait.
- Rendered image slots use actual loaded images; founding Realm cells include `hex.wild`, building cards include `building.barracks.1` and `castle.1`, the Army roster includes `company.militia.token`, and Diplomacy includes `rival.orc.calm`.
- Computed CSS reports `image-rendering: pixelated` for foreground PNGs and SVG map images. The page-paper texture uses `image-rendering: auto` and `object-fit: cover`.
- The six revised slots load their actual `*-pixel-v2.png` URLs in both development and production, rather than stale scene/portrait files.
- No horizontal overflow in the document, main page, or gallery, and no stretched foreground HTML images. Foreground art preserves its aspect ratio; the parchment background covers the variable-size page sheet without distorting its texture.
- The production application reloads with Chromium networking set offline, stays on `file:` URLs, decodes all 17 local images, and shows the starting Realm/buildings/diplomacy art. The development art preview is absent from the production build.
- No renderer exceptions during the checked flows.

Unfilled individual slots retain the game's existing placeholders. The starter pack supplies one representative of each asset class rather than every building tier, rival mood, terrain type, or later event.

## Visual QA finding

Screenshot review caught a pre-existing flex-card layout stretching square building images vertically, plus gallery grid tracks clipping taller terrain and banner previews. The final verification checks foreground aspect ratios and gallery image bounds so these layout issues cannot silently pass the image-loading checks.

Final live verification of the pixel revisions passed: 14 development screenshot checkpoints and 8 production offline checkpoints across both resolutions. All 17 images decoded in both modes. Foreground pixel scaling/aspect ratios, gallery bounds, page widths, and renderer exception checks passed. Each production checkpoint reported both a `file:` page URL and offline navigator state after the Chromium override. No scenarios, purchases, time travel, or player progression were triggered; all launches used copied scratch fixtures.

Detailed verification status is recorded in each `report.json` beside the screenshots.

## Active pixel revisions

These six slots were revised against the supplied `docs/game/art/reference/owner-portrait.png`. Their artwork uses deliberate square stepped contours, broad connected color clusters, discrete painted material shading, and warm golden light. The scene revisions simplify the former busy cinematic landscapes; the Militia uses a closer bust framing so its token keeps a readable head/shoulder silhouette.

| Slot | Active file in `src/renderer/public/game-assets/` | Size |
| --- | --- | --- |
| `rival.orc.calm` | `rival.orc.calm-pixel-v2.png` | 512 × 640 |
| `company.militia.token` | `company.militia.token-pixel-v2.png` | 128 × 128 |
| `company.militia.portrait` | `company.militia.portrait-pixel-v2.png` | 512 × 512 |
| `event.merchantCaravan` | `event.merchantCaravan-pixel-v2.png` | 768 × 512 |
| `milestone.1` | `milestone.1-pixel-v2.png` | 1920 × 1080 |
| `moment.grandBattleWon` | `moment.grandBattleWon-pixel-v2.png` | 1920 × 1080 |

The milestone and victory scenes were inspected at 960 × 540 and 240 × 135 before installation. Their 1920 × 1080 delivery files consist of exact nearest-neighbor 4 × 4 blocks from logical 480 × 270 artwork. Original versions remain preserved under `docs/game/art/superseded/`; revision prompts and provenance are recorded beside this QA document.

## Project checks

The integrating agent completed these checks on the final implementation:

- `npm run typecheck` — passed.
- `npm run check:game` — passed.
- `npm run assets:check -- --starter --strict` — passed, 17 of 17 starter classes populated.
- `npm test` — passed, 630 tests, 0 failures.
- `npm run build` — passed.

The initial sandboxed test attempt encountered loopback restrictions; the approved run outside the sandbox passed all 630 tests. Strict checking for every one of the 255 individual slots is outside this starter-pack scope; unfilled variants retain placeholders.
