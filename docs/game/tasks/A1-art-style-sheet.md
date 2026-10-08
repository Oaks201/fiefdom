# A1 — Art direction and style sheet (owner)

| Phase | Depends on | Unblocks | Who |
| --- | --- | --- | --- |
| 7 Assets | Nothing; this can be done any time | A2 | The owner (an AI may help draft, but the owner approves) |

## Goal

Lock one art route and one style sheet before any real art is made, so that every asset matches (book Ch 17: "Pick one route and keep it for the whole game").

## Read first

- Book: Ch 17 "Art direction" (shapes, surfaces, color, map, interface, big moments), the banner color table, the **originality rule**, and the sourcing routes.
- Existing art for reference: `docs/art-assets.md` (how the tavern desk and parchment were made), `src/renderer/src/assets/art/`.

## Steps

1. **Choose the route:** licensed 2D packs, generated images from a locked style sheet, or commissioned art. Write it at the top of `docs/game/art/style-sheet.md`.
2. **Write the style paragraph:** one paragraph that every prompt or brief reuses word for word. Cover chunky exaggerated shapes, hand-painted brushwork lit from the top left, saturated warm color, a 48 px silhouette, and no photorealism or flat vector art.
3. **Pick 3 to 5 reference images** you made or licensed (not Blizzard art) and save them in `docs/game/art/reference/`.
4. **Fix the banner colors** as hex values for the six owners in the Ch 17 table (Player red and gold, Orc crimson, Goblin ochre, Dwarf bronze, Archmage violet, Neutral grey-brown). Put them in the style sheet, and ask an AI to update the placeholder colors in `game.css` (T14) to match.
5. **Make a test set:** one building, one company token, one rival portrait, one hex terrain. Check each against the style sheet side by side, and against the originality rule.
6. If the route uses licensed packs, record each pack's license and where it allows use, in `docs/game/art/licenses.md`.

## Verification

- [ ] `docs/game/art/style-sheet.md` names the route, has the style paragraph, and lists the six banner hex colors.
- [ ] 3 to 5 reference images are saved, none from Blizzard games or traced from them.
- [ ] The four test assets pass a side-by-side check against the references.
- [ ] Each test asset still reads as its subject when shrunk to 48 px.
- [ ] No prompt, file name or brief names a Blizzard game, character or artist.
