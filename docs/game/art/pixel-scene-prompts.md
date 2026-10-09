# Pixel scene correction prompts

Revised on 2026-10-08 in response to the user's correction that the first milestone scene did not match the supplied portrait's pixel style. These are built-in ImageGen **edits**, one separate call per scene. Each call received the current scene as Image 1 (edit target) and `docs/game/art/reference/owner-portrait.png` as Image 2 (mandatory style reference).

The old scene concepts remain: the first armory doorway/anvil/equipment, and victorious soldiers on a ridge with their banner. The new generation prompts explicitly reduce scene complexity and require deliberate stepped contours, connected pixel clusters, and discrete painted shading, rather than using a processing filter as the source of the style.

Generated files measured 1672 × 941. Node Sharp fit them to a 480 × 270 logical raster using `resize(480, 270, { fit: 'cover', kernel: 'nearest' })`, then enlarged that raster exactly fourfold with `resize(1920, 1080, { kernel: 'nearest' })`. No brush strokes, shapes, objects, or shading were created by scripts. RGB opacity remains intact. Validation compared every delivery pixel against the anchor of its aligned 4 × 4 block: zero differing channels for both images.

Final previews were inspected at 960 × 540 and 240 × 135; those nearest-neighbor previews are under ignored `output/art-qa/pixel-revision/`.

## milestone.1

- Installed: `src/renderer/public/game-assets/milestone.1.png` (1920 × 1080, opaque RGB).
- Previous artwork preserved: `docs/game/art/superseded/milestone.1-pre-pixel-revision.png`.
- Built-in generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-f385ad18-66b8-4e47-95b5-719ab9f74c74.png`.
- Final SHA-256: `55f5db90448c729b2376f8babdcdfb683454d577adc0490662d2d6c9c21bf790`.
- Tool arguments: `transparent_background: false`; `referenced_image_paths: [target, owner-portrait.png]`.

```text
Use case: style-transfer
Asset type: First milestone reward scene for a medieval fantasy game. Opaque 16:9 scene, designed as true hand-painted PIXEL ART at a logical 480 by 270 grid, then crisp nearest-neighbor 4x enlargement for 1920 by 1080 delivery.
Input images: IMAGE 1 is the EDIT TARGET, the old first-armory scene. IMAGE 2 is the mandatory STYLE REFERENCE, the supplied owner knight portrait. Edit Image 1, keeping its first-armory-door/anvil/equipment concept, but reconstruct the actual artwork in Image 2's clearly stepped painted pixel style. Image 2 is style only, do not add the knight portrait to the scene.
Primary change: The old image is far too busy, detailed, cinematic and softly blended. Redraw it as deliberately placed square-pixel clusters with crisp staircase contours and contiguous planar shading. Use the reference portrait's dark brown outline weight, golden upper-left highlight blocks, saturated emerald/oak colors, and metal rendered in 3 to 5 broad shade facets. This is authentic dense painted pixel art, not a pixelation filter applied to a realistic painting, not 8-bit minimalism, not a blurry poster.
Composition: Simplify heavily. Make the open oak doorway and a large readable dark steel anvil on its stump the dominant masses. Two partly open oak door leaves frame a cozy small armory bay. One equipment rack holds just three chunky swords and two broad shields. One warm forge opening behind the anvil, one small red/gold banner and one torch on the frame. A few oversized mossy stone blocks and a small patch of emerald grass flank the door. Eliminate the panoramic exterior landscape, mountain vista, distant castle towers, chandeliers, hundreds of tiny bricks and every fussy equipment row. The doorway occupies about two-thirds of frame; anvil occupies the lower central-right quarter. No people.
Pixel rendering rules: Square aligned pixel steps, no antialiasing or gradients, no blurry edges. Make large connected color clusters; shape surfaces with about 4 or 5 discrete tones per material. Broad oak planes, chunky stone blocks, angular gold highlights, clean dark recesses. Tiny texture only where it supports a major form, no speckled noise, no dithering. Designed to read clearly at 240 x 135 and look detailed like the portrait at 960 x 540. Painted volume comes from discrete color facets rather than smooth illumination. Very obvious pixel grid throughout the contours, torch flames, shields, leaves and masonry.
Lighting: Saturated warm gold daylight from upper left, dark cool emerald/brown recesses, contained orange forge glow rendered as discrete bands, no volumetric rays or bloom.
Constraints: Keep 16:9 full-frame opaque image. No text, lettering, logos, watermark, decorative card border, characters or photographic detail. No painterly stippling, smooth brush texture, subtle microtexture, blended sky, huge busy landscape. Actual style must match Image 2's square stepped edge and grouped painted shade pattern.
```

## moment.grandBattleWon

- Installed: `src/renderer/public/game-assets/moment.grandBattleWon.png` (1920 × 1080, opaque RGB).
- Previous artwork preserved: `docs/game/art/superseded/moment.grandBattleWon-pre-pixel-revision.png`.
- Built-in generated original: `C:/Users/boberino/.codex/generated_images/01a11e17-9ed9-7301-b3db-2348b8502bb5/exec-1173e08f-67d4-4bff-8466-8af31643974c.png`.
- Final SHA-256: `c4dca228b0199cbeb8f7c2daa8a2b76c7eec333b0a79398928834f20e06b9855`.
- Tool arguments: `transparent_background: false`; `referenced_image_paths: [target, owner-portrait.png]`.

```text
Use case: style-transfer
Asset type: Grand Battle won reward scene for a medieval fantasy game. Opaque 16:9 scene made as true hand-painted PIXEL ART on a logical 480 by 270 grid, intended crisp nearest-neighbor 4x enlargement to 1920 by 1080.
Input images: IMAGE 1 is the EDIT TARGET, the old victory-on-ridge scene. IMAGE 2 is the required STYLE REFERENCE, the supplied owner knight portrait. Edit Image 1 keeping the victorious soldiers on a ridge and their red/gold banner, but rebuild its actual rendering and composition in Image 2's clearly stepped painted pixel style. Image 2 controls pixel technique and color/materials, not character identity.
Primary change: This old scene has a huge cinematic landscape and excessive stippled detail. Transform it into a much simpler heroic pixel tableau. Authentic deliberately placed square pixel clusters, obvious staircase contours, broad discrete shading planes, dark warm-brown outlines, saturated emerald cloth and warm gold highlights like the owner portrait. This must look drawn by a pixel artist, not a realistic picture put through a pixelation filter, not 8-bit minimalism, not a blurry poster.
Composition: Three victorious medieval militia on a compact mossy stone ridge, viewed from behind and three-quarter rear. Center soldier holds the broad crimson banner with a simple gold sun/tower emblem; two supporting soldiers with ordinary swords and wooden shields. Make helmets, steel shoulder plates and emerald cloth exaggerated readable forms modeled from the reference portrait, with a few warm red accents. Figures occupy the central two-thirds of the image, banner dominates the upper-right third. Only a few large angular gray rocks and broad connected moss patches in foreground. Background is calm: three low-contrast blue-green hill silhouettes, one narrow river band and a tiny simplified distant keep silhouette on the far right. Sky is one calm warm pale-gold band with three chunky cloud masses and a simple low sun at upper left. No vast detailed valley, tiny villages, tree forests, hundreds of flowers, distant elaborate castle or mountain panorama.
Pixel rendering: Use a logical aligned 480 x 270 pixel grid. Square pixels, sharp stepped contours, no antialiasing or blended color. At most 4 to 5 discrete tonal shades per material, broad connected clusters and a few strong highlight pixels. Metal facets and armor edges must match Image 2's chunky step pattern. Cloth shadows are bold angular emerald blocks. Leaves/grass/rocks/clouds are sculpted as broad connected shapes rather than noisy dots. Rich painted fantasy volume using clean discrete color facets. Readable at 240 x 135; crisply detailed at 960 x 540. NO dithering, speckle texture, smooth gradient skies, fine brushwork, volumetric light shafts, depth of field, photographic rendering or overly complex scenery.
Lighting/mood: Golden upper-left sunlight and calm celebration after victory, cool blue-green recesses, no violence or injuries.
Constraints: Full frame opaque 16:9 image. Preserve the victory ridge/banner concept. No text, lettering, logos, watermark, decorative card frame, borrowed characters, gore or landscape noise. The finished artwork must look clearly PIXEL STEPPED just like Image 2.
```

## Visual assessment

The revised milestone uses clearer door, sword, shield, and anvil masses; its connected warm light/shadow facets and stepped dark contours now resemble the reference technique. At 240 × 135 the doorway/workshop concept reads immediately; the anvil and equipment remain recognizable. Some small stone pitting survives, and the tiny upper-left sky has a mild color transition, but the dense cinematic vista and fine texture of the original no longer dominate.

The victory scene has much clearer stepped armor, cloth, banner, rock, cloud, and hill masses. It keeps four soldiers and their red uniforms from the edit target despite the prompt requesting three figures and emerald cloth. The background is simpler than the original but still has a river, hills, and a distant keep. Those are content variations within the retained victory concept; the required pixel construction is visible at both preview scales. These scenes intentionally use richer painted pixel clusters than minimal 8-bit art.

An independent reviewer inspected both fitted outputs and accepted their stepped armor/cloth/stone massing, broad readable shapes, and controlled materials as coherent with the supplied portrait and revised character assets. Crimson kit and the retained fourth figure were treated as content variations rather than pixel-style failures.

Current manifest revision files (activated after pixel-art review):

- `src/renderer/public/game-assets/milestone.1-pixel-v2.png`
- `src/renderer/public/game-assets/moment.grandBattleWon-pixel-v2.png`
