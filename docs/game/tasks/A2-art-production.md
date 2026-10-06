# A2 — Produce and drop in the art (owner)

| Phase | Depends on | Unblocks | Who |
| --- | --- | --- | --- |
| 7 Assets | T16 (the slot list and checker), A1 (the style sheet); best after T21 | The finished look | The owner |

## Goal

Replace every placeholder with real art. Thanks to T16, this needs **no code changes**: drop a file into the folder, list it in the manifest, and reload.

## Read first

- `docs/game/assets.md`: the generated checklist of every art slot, with its file name, pixel size and where it shows (T16 generates it; rerun `npm run assets:check` to refresh it).
- `docs/game/art/style-sheet.md` (A1).
- Book: Ch 17 "Art direction" and the asset table.

## Where files go

- Folder: `src/renderer/public/game-assets/` (A-08).
- Manifest: `src/renderer/public/game-assets/manifest.json`. Set each slot's `"file"` to the file name you added.
- Format: PNG or WebP at the size the checklist gives, with a transparent background for tokens, icons and portraits.

## Suggested order

The book says the weight Milestones "matter most and get the most care".

1. The interface kit (frames, buttons, parchment, seals, resource icons) and the 6 banners, which are seen on every screen.
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
