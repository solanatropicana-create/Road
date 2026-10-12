# Tomás, macro cinematographer

## 1. Who I am, what I looked at
Twenty years filming insects for natural-history TV, including weeks on harvester ants in glass formicaria at 1:1–5:1 under red lamps. I studied all 14 baseline shots and took 17 of my own (zoom ladder 4→14, nursery, queen, surface, forager follow, noon and night). I also built a paint-over of one frame: `m_before.png` → `m_after.png` (`m_pair.png`, `m_crop_pair.png`).

## 2. Should the style change on zoom?
Partly: keep the data at 1 mm, change the image. Up to zoom ≈4.5 a cell is at most 4.5 screen pixels and reads as grain, so leave the pixel art alone. From 5 to 9, pull focus on a smoothstep: cell colours turn into a soft tone field, solid/void edges become crumbly curves, a world-locked sub-millimetre grain texture (averaging to the cell colour) fades in, and the chamber back wall goes slightly soft. Past 9 the slice is fully in focus. Ants never change. No lens shows a millimetre as a flat square.

## 3. Findings
1. **[P0] Macro soil is enlarged, not resolved.** `t_granary_z14.png`, `z5_granary_macro.png`, `macro.jpg`: flat 14-px tiles and staircase walls beside smooth ants and seeds. → Zoom 14 frames about 103 mm, roughly 1:3 on full frame, where any lens resolves grains above ~0.2 mm. The "macro lens" promise breaks exactly where the camera pushes in. → Apply the rule above (`m_pair.png`).
2. **[P1] Hard pop at zoom 5.** `c_pop_z49_z5.png`: at 4.9 the granary is a pixel mosaic; at 5.0 smooth seeds sit on maroon 14-px tiles (heap interior and fruit stay square). → It reads as a jump cut inside a push-in. → Crossfade every switch over ~5–6.5; draw heap interiors as shade between grains.
3. **[P1] Nursery tint reads as flooding.** `z2_nest.png`, `z3_mid.png`, `t_nursery_z14.png`: brood rooms are teal-grey (`#4e7a78` at 38%), close to the game's water (`storm.jpg`). → On film, the brood pile (the brightest thing in frame) marks the nursery. → At most 10% tint past zoom 5; warm neutral tints further out; blue-green only for water.
4. **[P1] The red lamp isn't red.** `night.jpg`, `t_night_z9.png`, `t_granary_z14_night.png`: underground at night is the day frame ~15–20% darker (multipliers ≈0.89/0.76/0.70). → A real red lamp gives a near-monochrome red frame with deep blacks, red glints and a light pool that falls off: the most shareable shot in ant filming. → Night LUT ≈(1.0, 0.35, 0.25), luminance kept, plus a soft pool around the subject.
5. **[P1] Black ants vanish in tunnels.** `t_follow_forager_z14b.png`, `t_granary_z4_9.png`: ants in the shaft read as outlines only (1-px rim at 0.3 alpha). → We separate black *Messor* from dark soil with hard specular highlights and backlit rims. → One near-white hotspot on head and gaster (≈0.8 alpha); in tunnels, rim 1.5 px at 0.5.
6. **[P2] Back wall sits in the glass plane.** `m_before.png` vs `m_after.png`. → A chamber's back is 3–8 mm behind the glass, at the edge of depth of field at 1:3; slight softness puts ants *inside* the nest. → Draw open cells as their own layer, ~0.5 mm blur from zoom 7, darker near walls.
7. **[P2] Plants are cross-stitch at macro.** `t_surface_z14_noon.png`, `z7_surface_macro.png`: 1-cell staircase stems before a soft meadow. → They are in the focal plane and should be the sharpest, most organic thing. → From zoom 5, tapered strokes 0.6–1.5 mm with a pale midrib, rim-lit.
8. **[P2] Eggs form a bead border.** `t_nursery_z14.png`, `z6_brood_macro.png`: one even row along every floor. → Real eggs stick together in packets. → Clump them into 2–3 mm packets with one shared highlight.

## 4. The one screenshot
Zoom 14, `big` fixture, noon, camera on (664, 222): granary heap centre, nursery above, queen left (`m_before.png`). The after frame (`m_after.png`) keeps the light, ants, brood and seeds, and changes:
- **Soil face:** bilinear cell colours; boundary traced from the solid mask blurred σ≈0.4 mm plus low-frequency wobble, 1-px anti-aliased.
- **Grain (world-locked):** humus crumbs 0.4–1.4 mm, dark pores 0.1–0.2 mm, mineral grains 0.08–0.3 mm; a fifth pale quartz, a third of those with a 1-px warm glint.
- **Tunnel walls:** a darker, smoother packed skin 0.3–0.5 mm thick; a 1–2 px lit lip on floors.
- **Back wall:** neutral shaded soil, tint ≤10%, blurred ~0.6 mm, darker near walls.
- **Details:** heap interior as dark warm shade; pebble rounded with a highlight; roots thin and translucent.

## 5. What not to touch
- **The background:** blur grows with zoom (blades in `z0_big_fit.png`, creamy bokeh in `t_surface_z14_noon.png`), as magnification does.
- **The ants:** waist, red-headed majors, psammophore, gait (clean in `m_key.png`). Keep them vector at every zoom.
- **The whole-slice profile** (`hero.jpg`): a textbook soil pit wall, where pixel art is right.

Note: an uncommitted `src/render/macro.ts` appeared mid-review (slice fading in over zoom 5–7.5); it isn't in the build I shot and I didn't review it. I'd stretch its fade to ~9 and add findings 3 and 6.
