# Pixel art caravan revision

Revised 2026-10-08 with the built-in ImageGen edit tool using the owner's actual portrait as the style reference. Original art is retained under `superseded/`; production will use `event.merchantCaravan-pixel-v2.png` through the same `event.merchantCaravan` slot.

- Final: `src/renderer/public/game-assets/event.merchantCaravan-pixel-v2.png`
- Size: 768 × 512; opaque PNG.
- Generated source: `C:/Users/boberino/.codex/generated_images/01a11e14-da42-7a91-a04e-4104786d6141/exec-a1945499-1fff-47cf-8d14-eff9c6bc5d55.png`
- Asset preparation: nearest-neighbor fit to logical 384 × 256, then integer 2× upscale. Generated artwork was redrawn by ImageGen; scripts only prepare the game's resolution.

Exact prompt:

```text
Use case: style-transfer.
Input images: Image 1 is the EDIT TARGET, existing merchant caravan scene. Image 2 is the STYLE REFERENCE, the owner's pixel-art armored portrait.
Primary request: completely redraw Image 1 in the genuine hand-drawn painted PIXEL ART of Image 2. Keep the subject: one chunky oak merchant wagon carrying chests and rolled fabrics, a horse, a hooded green-cloaked merchant, and a winding road to a modest stone keep in green countryside. Simplify background into a few large rolling hills and one clear keep, with no tiny landscape clutter.
Style/medium: construct the entire scene out of deliberate connected square pixel clusters and hard stepped contour lines. Big exaggerated forms, very dark warm brown outlines, saturated emerald/oak/amber colors, top-left golden highlights, four or five distinct flat tonal steps per material. The reference's silver armor facets and cloth blocks demonstrate the exact pixel density and shading construction. Use the same treatment on wooden wagon boards, stone blocks, foliage, cloth, and horse.
Composition/framing: landscape 3:2 event card; large wagon/horse/merchant occupy foreground, simplified keep background. Crisp at display 768x512 and at small cards. Think of actual art authored on a 384x256 logical pixel canvas and enlarged 2x with nearest neighbor. Paint coherent broad pixels; no fine texture, no stippling, no scratch noise, no blended gradients, no airbrush, no photorealistic rendering, no miniature realistic details, no anti-aliased soft contours. This is a full redraw into pixel art, not a pixel filter over the old picture. Maintain full opaque painted canvas, no text, no frame, no UI, no logos, no borrowed characters.
```

