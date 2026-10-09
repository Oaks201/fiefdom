# Character and item art prompts

The initial prompts below document superseded character art. The pixel-style correction and final close-up revision follow them; the current manifest filenames are listed at the end. Whetstones retain their original file.

Generated with the built-in `image_gen.imagegen` tool, with `transparent_background: true`. Each slot was generated in its own call. The attached portrait was used as a visual style reference; its character was not copied.

The source outputs remain in the Codex generated-image directory. Installation used only deterministic alpha-bounds cropping, aspect-preserving Lanczos resize, and centering on a transparent RGBA canvas, fitting the visible subject into 92% of the destination canvas. No pixels were drawn or background color removed. All four installed PNGs were visually inspected and verified to have alpha extrema 0–255.

## rival.orc.calm

- Final file: `src/renderer/public/game-assets/rival.orc.calm.png`
- Dimensions: 512 × 640; RGBA with a genuine transparent background.
- Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-d3cbb663-b323-43c5-ac18-24a04675611d.png`

Exact generation prompt:

```text
Use case: stylized-concept. Asset type: original medieval fantasy strategy-game rival ruler portrait, final display 512 by 640 pixels. Primary request: one original green-skinned orc warlord, Ugrak the Unbowed, calm and confident, stern shrewd eyes, two small lower tusks, broad weathered face, dark swept-back hair with a tied short braid. His armor is heavy battered iron, broad practical shoulder plates over crimson cloth and rough brown leather; no giant spikes, no skulls, no existing franchise emblems. Style/medium: richly painted old-school fantasy strategy and card illustration with deliberately chunky visible pixel-brush texture, crisp dark warm brown contour, large bold shape language, warm golden top-left rim highlights and cool slate-violet shadows, slightly exaggerated heroic proportions. Match the supplied portrait's broad facets and warmly highlighted metal, but make this a distinctive original orc character. Composition/framing: a single chest-up three-quarter bust centered in a 4:5 portrait canvas, eyes toward viewer, all hair and shoulders inside the canvas with about 5 percent transparent margin, the bust ends naturally in a curved lower silhouette. Scene/backdrop: genuinely transparent alpha background, no setting, no frame, no floor, no vignette, no cast shadow outside the character. Color palette: moss and olive green skin, dark iron, warm amber light, muted crimson, umber leather. Constraints: produce only this single asset, excellent readable facial silhouette at small sizes; no photorealism, no smooth vector look, no text, no letters, no watermark, no logo. Generate at a useful large native size with the requested 4:5 composition, preserving true transparency.
```

## company.militia.token

- Final file: `src/renderer/public/game-assets/company.militia.token.png`
- Dimensions: 128 × 128; RGBA with a genuine transparent background.
- Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-cd89776c-6c11-403b-9d88-351ade09996f.png`

Exact generation prompt:

```text
Use case: stylized-concept. Asset type: original medieval fantasy strategy-game company token, final display 128 by 128 pixels and often 48 pixels. Primary request: one ordinary Tier I militia soldier bust wearing a simple iron open-faced kettle helmet, humble silver shoulder plates and an emerald green tabard over brown padded leather, holding the top of a plain wooden round shield at chest height and a short upright simple sword beside the shoulder. Human adult with brown hair, a short practical beard and steady determined eyes. It should clearly be an everyday soldier, not a named hero. Style/medium: old-school fantasy strategy and card illustration, chunky painted pixel-brush facets, strong warm dark brown outline, bold low-detail shape language, warm golden top-left highlights, cool slate-violet shadows. The supplied portrait's emerald cloth and warmly highlighted silver establish the palette. Composition/framing: centered one chest-up soldier, compact roughly circular silhouette on a square canvas, head and shoulders fill most of the area, all helmet and shield edges inside the canvas with 6 percent transparent margin. Prioritize the helmet, green tabard, silver armor and shield as instantly readable forms at 48 pixels; avoid fine decorations and tiny face details. Scene/backdrop: true transparent alpha background with nothing behind the soldier, no round disc, no scenery, no frame, no floor, no vignette. Constraints: single asset only, no copyrighted character or emblem, no photorealism, no vector icon aesthetic, no text, no letters, no watermark. Generate a useful large square native size for later deterministic downsampling, preserving transparency.
```

## company.militia.portrait

- Final file: `src/renderer/public/game-assets/company.militia.portrait.png`
- Dimensions: 512 × 512; RGBA with a genuine transparent background.
- Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-4626e1ea-f436-43ee-a4d0-a95fd9400869.png`

Exact generation prompt:

```text
Use case: stylized-concept. Asset type: original medieval fantasy strategy-game company portrait, final display 512 by 512 pixels. Primary request: one ordinary Tier I militia soldier, a brown-haired human adult with a short practical beard and steady determined eyes; simple open-faced iron kettle helmet, humble silver shoulder plates, emerald green tabard over brown padded leather. Hold a plain wooden round shield at chest height and a short simple upright sword beside his shoulder. The subject is an everyday soldier representing a company, not a named hero. Style/medium: old-school fantasy strategy and card illustration, chunky painted pixel-brush facets with visible texture, dark warm brown contours and broad heroic proportions, golden top-left edge highlights, cool slate-violet shadows. Match the supplied portrait's emerald cloth, brown leather, warmly highlighted silver, and clear angular painterly pixels. Composition/framing: centered waist-up three-quarter bust in a square canvas, eyes toward viewer, kettle helmet and both shoulders comfortably inside the canvas with about 5 percent transparent margin; natural curved lower cutout silhouette. Big clear shapes, distinctive modest equipment, subtle wear on metal and cloth, no elaborate decoration. Scene/backdrop: genuine transparent alpha background, no scene, no frame, no disc, no floor, no vignette, no external cast shadow. Constraints: produce only one asset, no copyrighted characters or emblems, no photorealism, no vector graphic look, no text, no letters, no watermark. Generate at a useful large square native size, preserving transparency.
```

## item.whetstones

- Final file: `src/renderer/public/game-assets/item.whetstones.png`
- Dimensions: 128 × 128; RGBA with a genuine transparent background.
- Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-ba10574c-c16d-41be-836d-67a62dd7e0f3.png`

Exact generation prompt:

```text
Use case: stylized-concept. Asset type: original medieval fantasy strategy-game inventory item icon for Whetstones, final display 128 by 128 pixels and often 48 pixels. Primary request: one large oblong worn dark-gray whetstone on a small rich brown leather strap or pad, with one short silver sword blade lying diagonally over it. Keep the hilt simple with a brown leather grip and small warm brass crossguard, visibly sharpened silver edge catching the light. No hands and no character. Style/medium: richly painted old-school fantasy strategy and card item illustration, chunky visible pixel-brush facets, crisp warm dark-brown contour, warm golden top-left highlights on the blade and leather, cool slate-violet shadow facets. Composition/framing: square canvas, one clear compact diagonal silhouette centered, stone and sword occupy about 85 percent of frame, all edges inside 7 percent transparent margin, bold sparse details readable at 48 pixels. Scene/backdrop: true transparent alpha with no background, no scenery, no frame, no disc, no floor, no vignette, no cast shadow outside objects. Color palette: cool slate stone, bright warm-edged silver, umber leather, tiny brass accents. Constraints: only this one inventory icon, no sparks or magical effects, no photorealism, no smooth vector icon style, no text, no letters, no watermark, no emblems. Generate a useful large square native size for later deterministic downsampling, preserving genuine transparency.
```



## Pixel-art revision — 2026-10-08

This revision replaces the original Orc and militia assets after the user found their smoothly shaded, finely textured rendering inconsistent with the supplied pixel-art reference. The two portraits were fully redrawn in separate built-in edit calls with actual image references; the militia token now derives from the same new portrait for visual coherence. No manifest or code was edited by this generation task.

- Authoritative reference: `docs/game/art/reference/owner-portrait.png` (the user's attached portrait).
- Superseded installed assets are preserved in `docs/game/art/superseded/rival.orc.calm.painted-v1.png`, `company.militia.portrait.painted-v1.png`, and `company.militia.token.painted-v1.png`.
- Deterministic installation: crop native generated alpha bounds, fit into 92% of a logical 256 × 320 Orc canvas or 256 × 256 militia canvas using Sharp `nearest`, then enlarge exactly 2× with `nearest` to 512 × 640 and 512 × 512. Preserve the source alpha. Derive 128 × 128 token directly from the final militia portrait with `nearest`.
- Refreshed militia style reference: `docs/game/art/reference/militia.png`.
- Critical display-size proof: `docs/game/art/character-revision-preview.png` includes the owner at 150 px, Orc at 150 px, militia at 150 px, and token at 48 px.
- All three installed files were verified RGBA with alpha extrema 0–255 and their exact manifest dimensions.

### Revised rival.orc.calm

Final installed path: `src/renderer/public/game-assets/rival.orc.calm.png`

Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-203e5615-7634-48d8-96fb-b21a3ebfbf13.png`

Input role mapping:

1. Edit target: `C:/Code/Claude Projects/fiefdom v2/src/renderer/public/game-assets/rival.orc.calm.png`
2. Authoritative style reference: `C:/Code/Claude Projects/fiefdom v2/docs/game/art/reference/owner-portrait.png`

Exact prompt (built-in tool, `transparent_background: true`):

```text
Use case: style-transfer. Input images: Image 1 is the edit target, the existing calm olive-green orc portrait. Image 2 is the owner's portrait and is the authoritative art style reference. Primary request: completely REDRAW image 1 as true painted PIXEL ART in precisely image 2's visual language. Preserve the target's original orc identity: calm confident olive-green adult orc ruler with two short lower tusks, dark swept hair and short braid, broad practical iron shoulder armor, crimson cloth, brown leather straps. Preserve the chest-up three-quarter bust composition, eyes toward viewer, genuinely transparent alpha background and 4:5 portrait framing; no scenery or border. Crucial style: image 2 has clear square pixel clusters, crisp stair-step contours, broad connected bands of discrete color, angular simplified eyes/nose/mouth, sculpted exaggerated forms and clean smooth armor SHAPES rendered as chunky pixels. Draw as if working on a logical 128 by 160 pixel grid then enlarging exactly 4 times by nearest neighbor to 512 by 640. Each material uses only 4 to 5 discrete shade steps, connected square clusters about 4 to 8 final pixels wide; highlights are broad warm golden planes from upper left and shadows are cool discrete planes. Dark warm brown silhouette outlines. Do not keep target's existing mottled realistic textures or fine wrinkles: replace them with broad flat angular pixel patches. Same degree of chunkiness and bold simplified surfaces as image 2. High quality late-1990s fantasy strategy portrait, normal adult heroic proportions, not chibi and not primitive 8-bit. Keep the whole bust comfortably inside transparent margins. Avoid photorealism, smoothly blended or airbrushed shading, anti-aliased smooth curves, fine photographic textures, tiny individual hair strands, noisy paint-brush flecks, gradients, dithering, text, logo, frame. Do not just place pixel texture over the old image: redraw it. Output only this single transparent portrait.
```

### Revised company.militia.portrait

Final installed path: `src/renderer/public/game-assets/company.militia.portrait.png`

Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-ee1b05c2-8337-4a0d-833a-723e9fb175bf.png`

Input role mapping:

1. Edit target: `C:/Code/Claude Projects/fiefdom v2/src/renderer/public/game-assets/company.militia.portrait.png`
2. Authoritative style reference: `C:/Code/Claude Projects/fiefdom v2/docs/game/art/reference/owner-portrait.png`

Exact prompt (built-in tool, `transparent_background: true`):

```text
Use case: style-transfer. Input images: Image 1 is the edit target, the existing ordinary militia soldier portrait. Image 2 is the owner's portrait and is the authoritative art style reference. Primary request: completely REDRAW image 1 as true painted PIXEL ART in precisely image 2's visual language. Retain a humble adult human militia soldier with brown hair and short beard, ordinary open-faced iron kettle helmet, modest silver shoulder plates, emerald-green tabard over brown padded leather, an upright simple silver sword beside his left shoulder and a plain round wooden shield in front of the other shoulder. Keep this an everyday soldier, not a named hero. Use a tighter chest-up three-quarter bust, with his face occupying roughly the central upper third and clearly readable, shield and sword extending no higher than helmet, all edges inside a compact nearly round silhouette and square canvas with true transparent alpha. Crucial style: image 2 has strong square pixel clusters, crisp stair-step contours, broad connected bands of discrete color, angular simplified adult face and sculpted exaggerated armor SHAPES rendered as chunky pixels. Draw as if on a logical 128 by 128 pixel grid then enlarging exactly 4 times by nearest-neighbor to 512 by 512. Each material uses only 4 to 5 discrete shade steps, connected square clusters about 4 to 8 final pixels wide; broad top-left golden light planes and cool discrete shadow planes, dark warm brown outlines. Same pixel chunkiness, emerald cloth, warmly highlighted silver and clean bold surfaces as image 2. High quality late-1990s fantasy strategy portrait with normal adult proportions, not chibi and not primitive 8-bit. Fine target surface detail must be eliminated and redesigned into bold angular pixel shapes. The sword, helmet and shield should remain recognizable when the SAME portrait is downsampled to a 48px company token. No background scenery, no circular disc, no decorative border. Avoid photorealism, smoothly blended or airbrushed shading, anti-aliased smooth curves, fine photographic texture, individual hair strands, tiny nicks or scratches, noisy brush flecks, gradients, dithering, text, logos. Do not just add a pixel filter or texture: redraw the subject. Output only this single transparent soldier portrait.
```

### Revised company.militia.token

Final installed path: `src/renderer/public/game-assets/company.militia.token.png`

This is a nearest-neighbor 128 × 128 reduction of the revised `company.militia.portrait.png`; no separate generation call or differing character design was used.

### Final militia composition revision

The first pixel-art redraw fixed the surface style but retained too much shield, sword, hand, and waist. A further built-in composition edit enlarged the head and face to match the owner's head-and-shoulder framing. This final portrait supersedes the wide pixel-art candidate; the accepted Orc was unchanged.

- Source output: `C:/Users/boberino/.codex/generated_images/01a11e17-7c35-7fb2-a9b3-1d461b91904d/exec-78e15cac-6801-45ff-9b9d-fcec73a55dbd.png`
- Edit target: `C:/Code/Claude Projects/fiefdom v2/src/renderer/public/game-assets/company.militia.portrait.png` (the first pixel-art redraw, not the original smooth image).
- Authoritative reference: `C:/Code/Claude Projects/fiefdom v2/docs/game/art/reference/owner-portrait.png`.
- Superseded candidate backups: `docs/game/art/superseded/company.militia.portrait.pixel-wide-v2.png` and `company.militia.token.pixel-wide-v2.png`.
- Installed portrait: `src/renderer/public/game-assets/company.militia.portrait.png`, 512 × 512.
- Derived token: `src/renderer/public/game-assets/company.militia.token.png`, 128 × 128.
- Refreshed reference: `docs/game/art/reference/militia.png`.
- Installation used only transparent alpha-bounds fit into a 236 × 236 interior on a 256 × 256 logical canvas, enlargement 2× by nearest neighbor, then nearest-neighbor token reduction. All outputs preserve RGBA alpha 0–255. No painted pixels were modified by code.
- The display-size comparison in `character-revision-preview.png` was refreshed to show the final framing at 150 px and its token at 48 px.

Exact final composition prompt (built-in tool, `transparent_background: true`):

```text
Use case: precise-object-edit. Input images: Image 1 is the edit target, the NEW already-correct pixel-art militia portrait. Image 2 is the authoritative owner portrait, used ONLY as the reference for tight head-and-shoulder framing, face scale and the already-correct chunky pixel style. Change ONLY COMPOSITION and visible crop of Image 1; retain exactly its adult soldier identity, brown hair, short beard, iron kettle helmet, bold angular facial expression, emerald cloth, silver pauldrons, warm top-left gold lighting, cool shadows and actual discrete PIXEL-ART cluster rendering. Completely reframe and redraw as a CLOSE HEAD-AND-SHOULDERS bust with the same dominant face scale and framing as Image 2. Explicit layout in square canvas: kettle helmet top at about 4 percent canvas height, eyes at about 34 percent, chin at about 64 percent; the HEAD+HELMET occupies the upper 60 percent of the canvas. The human FACE itself must occupy roughly 35 to 40 percent of total canvas height, with broad angular cheeks, strong brow and clear eyes. Broad silver pauldrons frame the lower part and emerald collar/chest cloth occupies the bottom third. Keep the face large, so facial identity is immediately readable as a 48-pixel token. Show NO hands, NO waist, NO belt, NO large shield. At most show a small partial shield rim at the very bottom right corner, and a narrow cropped silver sword blade segment along the left edge behind the shoulder, both secondary to the head. Do not let equipment force the head smaller. Genuine transparent alpha around the bust, about 4 percent clear margin, natural curved bottom cutout, no background or frame. Preserve the existing correct pixel-art treatment: connected square pixel clusters, hard stair-step silhouette, 4 to 5 discrete tonal planes for each material, thick dark warm outline, broad highlighted silver facets and clean emerald color bands. Render on approximately 256 by 256 logical pixel grid enlarged2x to512 by512, with visible2to4px clustered steps at final size. No smoothly blended gradients, no anti-aliased rounded contours, no photographic texture, no noisy paint flecks, no hair strands, no pores or metal scratches. Mature adult proportions, not chibi or primitive8-bit. This is a tighter close-up REDRAW of the same soldier, not a crop of the existing small head.
```

Current manifest revision files (activated after pixel-art review):

- `src/renderer/public/game-assets/rival.orc.calm-pixel-v2.png`
- `src/renderer/public/game-assets/company.militia.portrait-pixel-v2.png`
- `src/renderer/public/game-assets/company.militia.token-pixel-v2.png`
