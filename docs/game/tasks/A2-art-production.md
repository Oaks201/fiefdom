# A2 — Produce and drop in the art (owner)

| Phase | Depends on | Unblocks | Who |
| --- | --- | --- | --- |
| 7 Assets | T14 (the slot list and checker), A1 (the style sheet); best after T17 | The finished look | The owner |

## Goal

Replace every placeholder with real art. Thanks to T14, this needs **no code changes**: drop a file into the folder, list it in the manifest, and reload.

## Read first

- `docs/game/assets.md`: the generated checklist of every art slot, with its file name, pixel size and where it shows (T14 generates it; rerun `npm run assets:check` to refresh it).
- `docs/game/art/style-sheet.md` (A1).
- Book: Ch 17 "Art direction" and the asset table.

## Where files go

- Folder: `src/renderer/public/game-assets/` (A-08).
- Manifest: `src/renderer/public/game-assets/manifest.json`. Set each slot's `"file"` to the file name you added.
- Format: PNG or WebP at the size the checklist gives, with a transparent background for tokens, icons and portraits.

## What the screens draw today (T17 note, 2026-10-08)

`docs/game/assets.md` lists 255 slots, but the current screens draw 169 of them. These 86 have no place on any screen yet, so they can wait (or be skipped) unless a screen is added for them first:

- **Company portraits** (60, `company.<unit>.portrait`): the Army, the Armory and the battle field all show company *tokens*; portraits are drawn only for Elites (`portrait.<elite>`), mythic quarries (`portrait.<unit>`) and the rival rulers.
- **Event cards** (14, `event.*`): world events reach the player as Herald text, without a card.
- **Most of the interface kit** (11): `ui.frame`, `ui.button`, `ui.seal` and the 8 `ui.icon.*`. The frames, buttons and icons are drawn in CSS and with the bundled icon set; only `ui.parchment` is drawn (on the Armory page).
- **`banner.player`**: rival banners stand in for their levies; the player's own banner is never drawn.

Constraints the checker doesn't spell out:

- **Hex terrain** (222 × 256) is drawn unclipped into each map hex, so paint a pointy-top hexagon filling the canvas with transparent corners. The two overlays (`hex.overlay.contested`, `hex.overlay.scorched`) are laid over the terrain, so they need transparency too.
- **Tokens and icons are shown small:** company tokens at 28 to 40 px in the roster and on the field (84 px at most, in the Armory), items at 52 px, buildings at 96 px, the castle at 132 px, rival portraits at 150 px and 56 px. Hence the 48 px silhouette check.
- **Big-moment and Milestone scenes** (1920 × 1080) are shown at up to 960 px wide on a card with the title and lines below; keep the subject away from the bottom edge.

## Suggested order

The book says the weight Milestones "matter most and get the most care".

1. The 5 rival banners (`banner.orc` … `banner.neutral`), drawn for levies and unknown enemies, and `ui.parchment`. (The rest of the interface kit isn't drawn today; see above.)
2. Hex terrains, plus the contested and scorched overlays.
3. The 20 building tiers and the 5 castle tiers.
4. The 10 Milestone scenes.
5. Company tokens and portraits, then the 12 rival portraits (4 rulers × calm, angry, humbled).
6. Elites, mythics, the Dragon and the Wild Hunt; item icons; event cards.

## Steps for each asset

1. Make or source it under the A1 style sheet.
2. Check it side by side with the references; check it still reads at 48 px.
3. Save it with the checklist's file name into `game-assets/`, and set `"file"` in the manifest.
4. Run `npm run assets:check` and fix any size or name warnings.
5. Run `npm run dev` and look at it on the screen where it shows.

## Verification

- [ ] `npm run assets:check -- --strict` exits 0 (no missing, unknown or wrong-size files).
- [ ] Every screen checked at 1024×768 and 1920×1080 shows no placeholder art.
- [ ] Every asset passed the A1 side-by-side check and the 48 px silhouette check.
- [ ] Any licensed pack is recorded in `docs/game/art/licenses.md`, and the credits section of `README.md` is updated.
- [ ] `npm run dist` builds, and the installed app shows the art. Files in `public/` are bundled at build time, so rebuild after adding art.
