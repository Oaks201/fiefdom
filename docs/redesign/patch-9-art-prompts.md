# Patch 9 art prompts

Written 2026-11-11 for Patch 9 (D-68, D-76): the pictures stages 2b and 3 add slots for. Until a file exists, `<GameArt>` shows its placeholder, so nothing waits on them. Each prompt follows the rulers' portraits after the pixel-art revision of 2026-10-08 (`docs/game/art/character-prompts.md`): the owner's portrait (`docs/game/art/reference/owner-portrait.png`) is the authoritative style reference, and the image is installed the same way (crop to the alpha bounds, fit into 92% of the logical canvas with Sharp `nearest`, then enlarge with `nearest` to the slot's size).

## portrait.healer: Remedy, the Healer

- Slot: `portrait.healer`, 512 × 640 (the rulers' 4:5), RGBA with a genuine transparent background.
- Shows: in the Healer's Audience, facing the player's portrait, as a ruler's does in his.
- Rich's brief (D-72): a strict, severe-looking woman, serious about health; genuine and caring, and she can come across a bit aggressive.

```text
Use case: stylized-concept. Input image: the owner's portrait, the authoritative art style reference. Asset type: original medieval fantasy strategy-game character portrait, final display 512 by 640 pixels. Primary request: one original human woman, Remedy, the realm's healer: strict and severe-looking, about fifty, a lean face with high cheekbones, a thin firm unsmiling mouth, level searching grey eyes under straight dark brows, steel-grey hair pulled back tight into a low knot with one narrow white streak. Her look is stern and direct, the face of someone who cares enough to be blunt; not cruel, not a villain, not a witch. Dress: a high-collared deep green apothecary's coat with plain bone buttons, a starched off-white linen collar, sleeves pushed to the forearm, a worn brown leather bandolier of small corked glass vials across the chest with a sprig of dried yarrow tucked in it. Arms folded, the folded arms at the bottom edge of the bust. No crown, no jewels, no religious symbols, no existing franchise emblems. Crucial style: true painted PIXEL ART in the reference's visual language: clear square pixel clusters, crisp stair-step contours, broad connected bands of discrete color, angular simplified eyes, nose and mouth. Draw as if on a logical 128 by 160 pixel grid then enlarged exactly 4 times by nearest neighbor to 512 by 640. Each material uses only 4 to 5 discrete shade steps; highlights are broad warm golden planes from the upper left and shadows cool slate-violet planes; dark warm brown silhouette outlines. Composition/framing: a single chest-up three-quarter bust centered in a 4:5 portrait canvas, eyes toward the viewer, all hair and shoulders inside the canvas with about 5 percent transparent margin, the bust ending in a natural curved lower silhouette. Scene/backdrop: genuinely transparent alpha background, no setting, no frame, no floor, no vignette, no cast shadow. Color palette: deep apothecary green (#2f5d55), off-white linen, steel grey, worn brown leather, small glints of brass and glass, warm amber light. Constraints: produce only this single asset, a readable facial silhouette at 150 pixels; no photorealism, no smooth vector look, no text, no letters, no watermark, no logo.
```

## realm.heartOak.0 to realm.heartOak.10: the Heart Oak

- Slots: `realm.heartOak.0` (planted at founding) to `realm.heartOak.10` (every Milestone broken), each 256 × 256, RGBA with a genuine transparent background.
- Shows: on the castle hex of the realm map, small, in its lower left; up close in the castle hex's panel; and on each Milestone card, at the stage that Milestone grows it to (B2, D-68).
- The tree grows, never the lord: no figure, no body, no person in any stage.
- One shared prompt, with each stage's own line in place of `{STAGE}`. Generate stage 10 first and use it as a reference for the others, so the tree reads as one tree growing.

```text
Use case: stylized-concept. Input image: the owner's portrait, the authoritative art style reference; for stages 0 to 9 also the finished stage 10, as the same tree grown. Asset type: original medieval fantasy strategy-game map ornament, final display 256 by 256 pixels and often 48 pixels. Primary request: the realm's Heart Oak, a white oak with pale silver-white bark and deep green leaves, the living tree of the realm's banner, standing on its own small patch of grass and earth. {STAGE} Crucial style: true painted PIXEL ART in the reference's visual language: clear square pixel clusters, crisp stair-step contours, broad connected bands of discrete color. Draw as if on a logical 64 by 64 pixel grid then enlarged exactly 4 times by nearest neighbor to 256 by 256. Each material uses only 4 to 5 discrete shade steps; highlights are broad warm golden planes from the upper left and shadows cool slate-violet planes; dark warm brown silhouette outlines. Composition/framing: seen from a slight three-quarter top-down angle, as the hex map's terrain is; the tree and its ground patch centered on a square canvas, its base in the lower third, everything inside the canvas with about 6 percent transparent margin; the silhouette must read at 48 pixels. Scene/backdrop: genuinely transparent alpha background, no hex tile, no scenery beyond the ground patch, no frame, no cast shadow beyond the patch. Color palette: silver-white bark, deep and spring greens, warm amber light, earth browns. Constraints: produce only this single asset; no people, no animals, no buildings, no banners, no text, no letters, no watermark, no logo; no photorealism, no smooth vector look.
```

| Slot | `{STAGE}` |
| --- | --- |
| `realm.heartOak.0` | The day it was planted: a thin sapling knee-high to a man, tied to a short wooden stake, four or five leaves, in a fresh ring of turned dark earth. |
| `realm.heartOak.1` | Its first year: a sapling a little taller, a dozen leaves, the stake still beside it, the turned earth grassing over. |
| `realm.heartOak.2` | A young tree as tall as a man, a slim straight trunk, a few short branches, the stake gone. |
| `realm.heartOak.3` | A young tree a head taller than a man, the trunk thickening, a small round crown of leaves. |
| `realm.heartOak.4` | A growing oak, its trunk as thick as an arm, its crown filling out and wider than the trunk is tall. |
| `realm.heartOak.5` | Half grown: a sturdy trunk as thick as a man's waist, a full rounded crown, the first exposed roots at its base. |
| `realm.heartOak.6` | A strong oak, its bark beginning to furrow, its crown broad and dense, a few acorns among the leaves. |
| `realm.heartOak.7` | A mature oak, a thick furrowed trunk, its lowest branches reaching wide, roots spreading over the ground patch. |
| `realm.heartOak.8` | A great oak, its crown spreading wider than it is tall, acorns plentiful, small wildflowers in the grass at its roots. |
| `realm.heartOak.9` | An old great oak, its trunk massive and gnarled, its crown vast and layered, a soft golden glow of light through the leaves. |
| `realm.heartOak.10` | The Heart Oak in full: a vast ancient white oak, a broad gnarled silver-white trunk, a huge spreading crown of deep green touched with gold, roots like buttresses, a faint warm radiance about it; the tree of the banner made real. |
