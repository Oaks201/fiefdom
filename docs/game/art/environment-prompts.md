# Environment asset prompts

Generated on 2026-10-08 using the built-in ImageGen tool, one separate generation per asset. Style reference: `C:/Users/boberino/AppData/Local/Temp/codex-clipboard-39dff2e9-2a99-4f41-9d74-e83640defcf2.png` (visual style only).

All final files are RGBA PNGs. Hex images were cropped to their generated alpha bounds and resized with nearest-neighbor sampling to the exact slot dimensions. Buildings were cropped to their generated alpha bounds, proportionally fit to 92% of the square canvas with nearest-neighbor sampling, and centered on a transparent canvas. No artwork was synthesized by scripts. Original generated alpha was preserved.

## hex.wild

- Final file: `src/renderer/public/game-assets/hex.wild.png`
- Required dimensions: 222 × 256
- Generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-630e7184-35a4-4542-a507-ad8ab29189e4.png`
- `transparent_background`: `true`
- Validation: exact size; alpha extrema 0–255; all four corner pixels transparent. Overlay central pixel also transparent.

```text
Use case: stylized-concept
Asset type: pointy-top hex terrain tile for a medieval fantasy strategy game's map, final size 222 x 256 pixels.
Primary request: Create one original grassy wilderness hex tile, a compact moss-green clearing with three chunky emerald oak trees, a few warm gray rocks and tiny grass tufts. Clear silhouette when viewed at small game-map scale.
Input images: The attached male knight portrait is a STYLE REFERENCE ONLY. Match its chunky hand-painted shading, blocky pixel-edged contours, warm dark brown outlines, saturated emerald greens, oak browns and stone highlights; do not reproduce the knight.
Composition/framing: One completely filled regular POINTY-TOP HEXAGON shown straight as a map cell with a gently elevated top-down/isometric terrain view. Its shape is vertically oriented, width is 86.6 percent of height. Hex vertices must be exactly top center, right upper at 25 percent height, right lower at 75 percent height, bottom center, left lower at 75 percent height, left upper at 25 percent height. All corners OUTSIDE that six-sided shape are fully transparent alpha. Thin warm dark edge, no extruded deep base. Trees and rocks sit inside and never spill outside the six-sided hex footprint. Hex nearly fills image vertically with narrow transparent surrounding margin. Keep broad contiguous green grass so it can be read against adjacent cells.
Lighting/mood: Warm golden sunlight from upper left, subtle cool green shadows beneath trees, inviting wild frontier.
Style/medium: Original old-school fantasy strategy/card illustration, painterly pixel texture with large angular shapes and strong readable contours, no smooth photorealism, no realistic 3D render. Bold at 222 x 256.
Constraints: Genuine transparent background, no text, no border frame, no logos, no characters, no UI, no watermark. Single tile only.
```

## hex.overlay.contested

- Final file: `src/renderer/public/game-assets/hex.overlay.contested.png`
- Required dimensions: 222 × 256
- Generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-82163068-6853-4276-9b24-d9a8863e2866.png`
- `transparent_background`: `true`
- Validation: exact size; alpha extrema 0–255; all four corner pixels transparent. Overlay central pixel also transparent.

```text
Use case: stylized-concept
Asset type: transparent contested-territory overlay for a medieval fantasy map cell, final size 222 x 256 pixels.
Primary request: One original amber-gold and dark copper thin painted rim forming a PERFECT regular POINTY-TOP HEXAGON with a few tiny angular orange ember flecks along the six edges. This is ONLY the rim; the entire central hex interior must be transparent, and the entire outside corners must be transparent. A narrow, slightly weathered luminous ring for layering over existing grass terrain.
Input images: The attached male knight portrait is a STYLE REFERENCE ONLY, use its chunky warm painted pixel-edged highlights and strong dark-brown contours; no knight.
Composition/framing: Exact vertically oriented pointy-top regular hexagon, width 86.6 percent of height. Vertices at top center, right upper at 25 percent height, right lower at 75 percent height, bottom center, left lower at 75 percent height, left upper at 25 percent height. No perspective tilt, no bevelled platform. Outer rim nearly fills image vertically with narrow surrounding margin. Rim thickness around 4 percent of total width so it remains readable as a thin boundary at small scale. Small stylized embers stay near rim. Keep the large central hex area completely empty alpha, no fill, no glow across center, no ground, no scenery, no dark background.
Style/medium: Original chunky medieval fantasy with hand-painted pixel-edged texture, bold warm dark contours, sculpted exaggerated forms, saturated earthy colors, golden light from the upper left and cool shaded recesses. Use broad readable shapes that hold their silhouette at 48 pixels, restrained surface detail. No photorealism, flat vector art, text, logos, or borrowed characters.
Constraints: Real transparent alpha everywhere except the thin six-sided ring and sparse edge embers. No text, no watermark, no frame beyond specified hex rim. Single overlay only.
```

## building.barracks.1

- Final file: `src/renderer/public/game-assets/building.barracks.1.png`
- Required dimensions: 512 × 512
- Generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-c1d6962e-fcff-4b82-bbf4-469d07a6eee4.png`
- `transparent_background`: `true`
- Validation: exact size; alpha extrema 0–255; all four corner pixels transparent. Overlay central pixel also transparent.

```text
Use case: stylized-concept
Asset type: tier-one Barracks building sprite for the castle screen of a medieval fantasy strategy game, final size 512 x 512 pixels.
Primary request: One original modest, sturdy starter barracks: squat oak timber hall on a foundation of large warm gray stone blocks, oversized dark red shingle roof, stout arched doorway, two tiny warm windows, a spear rack and a wooden round shield beside the entrance. Simple golden corner fittings and one small red cloth pennant. Feels inhabited and ready to train ordinary militia.
Input images: The attached male knight portrait is a STYLE REFERENCE ONLY. Use its sculpted exaggerated materials, chunky painted pixel contours, warm highlight facets and rich dark brown outlines. Do not draw the knight.
Composition/framing: Single centered building seen from a clear three-quarter elevated isometric perspective, front and right side visible. Keep whole roof, flags, and ground foot inside canvas with roughly 8 percent transparent breathing room. Building occupies around 85 percent of image. Tiny irregular stone-and-grass footing only directly under building; no wide landscape, no tile, no decorative card frame. Readable simple silhouette at 64 pixels.
Lighting/mood: Golden upper-left sunlight, cool shaded recesses, welcoming practical military frontier architecture.
Style/medium: Original chunky medieval fantasy with hand-painted pixel-edged texture, bold warm dark contours, sculpted exaggerated forms, saturated earthy colors, golden light from the upper left and cool shaded recesses. Use broad readable shapes that hold their silhouette at 48 pixels, restrained surface detail, and tactile oak, stone, leather, cloth, and metal. No photorealism, flat vector art, text, logos, or borrowed characters.
Color palette: Rich oak browns, warm gray stone, muted crimson roof and pennant, restrained bright gold highlights, little moss green grass. Avoid blue roof.
Constraints: True transparent alpha background, no people or soldiers, no text, no logo, no watermark, no UI. Starter tier, small barracks rather than grand palace. Single building only.
```

## castle.1

- Final file: `src/renderer/public/game-assets/castle.1.png`
- Required dimensions: 768 × 768
- Generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-17a7df9a-6a61-403b-bf29-c775b7ea5558.png`
- `transparent_background`: `true`
- Validation: exact size; alpha extrema 0–255; all four corner pixels transparent. Overlay central pixel also transparent.

```text
Use case: stylized-concept
Asset type: tier-one castle keep sprite for a medieval fantasy strategy game, final size 768 x 768 pixels.
Primary request: One original humble starting castle, a compact thick-walled gray stone keep with a square central crenellated tower, two short round flanking towers, a stout arched oak gate, one small muted crimson roof above a hall, and a single emerald-green cloth flag flying from the highest tower. Friendly sturdy frontier lord's castle, a small keep rather than enormous palace or city.
Input images: The attached male knight portrait is a STYLE REFERENCE ONLY. Match its chunky warm hand-painted pixel-edged shading, bold dark-brown contours, saturated emerald cloth, gray stone and gold highlights; do not draw the knight.
Composition/framing: Single centered isolated compact castle seen at elevated three-quarter isometric angle, front and right side visible. All towers, flag and ground footing fully inside canvas with about 7 percent transparent margin. Whole silhouette simple, readable at 64 pixels. Tiny irregular grass-and-stone footing directly below walls, no landscape, no tile, no mountains, no moat, no surrounding village. Broad walls, oversized stone blocks and readable gateway.
Lighting/mood: Golden light from upper left, cool gray-violet shaded recesses, inviting modest fortress.
Style/medium: Original chunky medieval fantasy with hand-painted pixel-edged texture, bold warm dark contours, sculpted exaggerated forms, saturated earthy colors, golden light from the upper left and cool shaded recesses. Use broad readable shapes that hold their silhouette at 48 pixels, restrained surface detail, and tactile oak, stone, leather, cloth, and metal. No photorealism, flat vector art, text, logos, or borrowed characters.
Color palette: Warm gray stone, dark brown door, emerald flag, modest red roof, gold highlights, moss green footing. No bright blue roofs.
Constraints: True transparent alpha background. No people, no text, no watermark, no decorative frame, no UI, no logos, no city skyline. Single tier-one castle only.
```


