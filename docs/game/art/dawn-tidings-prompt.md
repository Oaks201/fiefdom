# Dawn tidings prompt

Written 2026-10-18 for Patch 6 (D-47, C-81; [spec section 3.4](../../redesign/patch-6-spec.md#34-the-art-slot-and-prompt)). The art for the slot `moment.dawnTidings`: the realm's herald reading the morning's news. It shows as a wide 4:1 band across the top of the Dawn tidings card, cropped from the middle of the picture (a little under half its height), so the subject has to sit in the middle third.

Not generated yet. Claude can't generate images; Rich generates it with Codex's built-in image tool, as he did the other art (A2). Until then the card shows the Herald's horn in its place.

## moment.dawnTidings

- Final file: `src/renderer/public/game-assets/moment.dawnTidings-v1.png` (to be set as the slot's `file` in `manifest.json`).
- Dimensions: 1920 × 1080, opaque RGB.
- Transparent background requested: `false`.
- Reference images: IMAGE 1 `docs/game/art/reference/owner-portrait.png` (style); IMAGE 2 `src/renderer/public/game-assets/banner.player-green-silver-v1.png` (the realm's livery).
- Generated source: (fill in once generated).

```text
Use case: stylized-concept
Asset type: Dawn tidings scene for a medieval fantasy strategy game: the realm's herald reading the morning's news aloud. Opaque 16:9 scene made as true hand-painted PIXEL ART on a logical 480 by 270 grid, for crisp nearest-neighbor 4x enlargement to 1920 by 1080.
Input images: IMAGE 1 is the mandatory STYLE REFERENCE, the owner's knight portrait. Match its stepped painted pixel style: dark warm-brown outlines, saturated emerald cloth, chunky silver metal in 3 to 5 broad facets, warm gold upper-left highlights. Style only: do not put the knight in the scene. IMAGE 2 is the realm's green-and-silver banner: use its colors and emblem for the herald's livery and the wall banner.
Composition: One herald stands on the top step of a modest stone keep at sunrise, holding an unrolled parchment scroll in both hands and reading from it, a long brass horn slung at the hip. Emerald tabard over a silver-grey tunic, the banner's emblem on the chest, a soft cap with one feather. Behind the herald, a carved oak door and one emerald-and-silver banner hanging on the wall. Keep the herald, the scroll and the banner inside the middle third of the height, so a wide 3:1 crop across the center keeps them whole; the top third is calm pale-gold sky with two or three chunky cloud masses and a low sun at the upper left, the bottom third is broad stone steps.
Pixel rendering: Square aligned pixel steps, no antialiasing or gradients. Large connected color clusters, 4 to 5 discrete tones per material. Readable at 240 x 135; crisply detailed at 960 x 540. No dithering, speckle, smooth gradient sky, fine brushwork, volumetric rays or photographic detail.
Lighting/mood: Calm early morning, golden light from the upper left, cool blue-green shadows in the doorway.
Constraints: Full-frame opaque 16:9 image. No text or lettering (the scroll shows only abstract dark lines), no logos, watermark, card border or borrowed characters.
```

## Installing it

As the earlier pixel scenes were ([pixel-scene-prompts.md](pixel-scene-prompts.md)):
1. Fit the generated image to the 480 × 270 logical grid with nearest-neighbor (`fit: 'cover'`), then enlarge it exactly 4× with nearest-neighbor to 1920 × 1080.
2. Save it as `src/renderer/public/game-assets/moment.dawnTidings-v1.png` and set `"file": "moment.dawnTidings-v1.png"` on the `moment.dawnTidings` entry in `manifest.json`.
3. Run `npm run assets:check` (the slot should read `ok`), then look at the card: the band crops to the middle of the picture, so check that the herald's head and the scroll are inside it.
4. Fill in the generated source above, and add the file to `licenses.md` as the other generated art is.
