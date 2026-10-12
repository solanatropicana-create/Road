# Mira, art director: art review of "Underfoot"

## 1. Who I am, what I looked at
I'm Mira, art director: 14 years in games, art lead on two pixel-art indies, one of them a falling-sand game. I studied all 14 baseline shots and took 10 of my own on `big`, including a 4.9-vs-5.1 pop test, z14 in the nest, the surface and night. I measured luminance and built a paint-over from the game's slice data with the real ants matted on top. I read `renderer.ts` and `palette.ts`.

## 2. Should the style change on zoom?
**Partly.** Pixel soil with smooth ants is right while a millimetre is 1–4 screen px. The pixels read as grain, and the player feels the rule untold: the world is granular, the living things are drawn. Past about 5 px/mm the soil "pixel" is ten times the ants' line weight, and the mix looks like a bug. From zoom 4.5 to 7 the slice should cross-fade to material: same cells and colours, drawn with detail inside each cell and traced edges. Plants and loose objects go smooth on the same curve.

*On the studio wall:* **One focal plane, one pixel size.** Nothing in focus shows a pixel bigger than about four screen pixels. Below that, the cell is the pixel. Above it, the cell is a crumb: add detail inside the millimetre, never enlarge it. Show depth with blur, never with blockiness. Overview shapes come from mass, macro shapes from edges. Every style change happens across a zoom range, never at a threshold.

## 3. Findings
1. **[P0] Macro soil looks like a magnified JPEG.** In z5, z6 and `m06_z14_nest`, each cell is a flat 14-px square, and flecks and stones become "dead pixel" squares. These are the most shareable frames. → Above zoom ~6, draw cells as crumbs: colours blended inside 1–4 mm aggregates, broken pores between them, top-left light, 2-px speckle, and one domed pebble per stone.
2. **[P1] Cavity walls are 14-px staircases**, so ants and eggs float above stepped floors (z6, m06). → At close zoom, trace the boundaries smooth (marching squares), with a lit floor lip, a dark wall rim and contact shadow. Collision stays on cells.
3. **[P1] Plants are the worst mixel.** One-cell stems become stair-stepped coat-hanger outlines over creamy bokeh (macro.jpg, z7, z8): the crudest thing in the ants' focal plane. → From zoom 4.5, draw tapered spline strokes through the cell centres. Keep the pixel version at overview.
4. **[P1] Room tints break the palette.** Nursery `#4e7a78` reads as standing water: m02 shows five "flooded" chambers, while real water is blue (storm.jpg). The queen's magenta reads as a selection box (z5). → Code rooms by value and earth hue: nursery cream, granary ochre, queen red-brown. Keep blue for water.
5. **[P1] Underground values are crushed.** In m06 the 10th–90th percentile luminance spans 24–54/255 (macro.jpg: 36–173). In the shaft, ants (L≈32) sit on a back wall at L≈31. → At close zoom, cut the `BACKWALL_DARK` mix from 0.5 to about 0.25 and let the edges carry the cavity, so ants stay darkest. Keep the dark fill at overview.
6. **[P2] Zoom 5 pops.** `closeUp` is a boolean, so the granary jumps from checkerboard to ovals between 4.9 and 5.1 (`c01_pop_4.9_vs_5.1.png`). → Cross-fade over 4.5–6.
7. **[P2] The hash makes visible lines.** Pale subsoil grains form diagonal dotted rows (m01, z0) because of `Math.imul(i,…) % 10000` on the linear index. → Use a proper 2D hash.
8. **[P2] The night lamp is invisible underground.** m08 differs from day only in the sky. → Make the red lamp a pool of light centred on the nest, falling off to near-black.

## 4. The one screenshot
- **Frame:** `big` fixture, noon, zoom 14, centred on x 670, y 212: queen chamber, granary, two nurseries and the shaft (before: `k_nest14_with.png`). Ants, brood and seed ovals are unchanged.
- **Soil:** cells drawn as crumbs, as in finding 1.
- **Cavity edges:** traced smooth, with a 2–3 px lit floor lip, a 1–2 px dark rim and about 1 mm of contact shadow.
- **Back wall:** slightly soft, just behind the focal plane.
- **Build:** a second slice texture at 4–6 texels per cell, rebuilt for dirty cells in view and cross-faded in from zoom 4.5 to 7.

My paint-over is `p_k_nest14_grain.png`: thumbnail values unchanged, and at 1:1 it reads as a macro photo of humus (`c02_soil_1to1.png`). `p_k_nest14_grain_warm.png` adds finding 4.

## 5. What not to touch
- **The macro-lens bokeh backdrop**, the game's most distinctive asset (macro.jpg). Don't sharpen or pixelate it.
- **The ants:** anatomical, glossy and readable at 20 px; on black (`k_nest14_black.png`) they are excellent. Don't stylise them.
- **The overview pixel slice:** the earth palette, the banded horizons and the shaft-and-pancakes "nest tree" read instantly as a thumbnail (hero.jpg, night.jpg).
