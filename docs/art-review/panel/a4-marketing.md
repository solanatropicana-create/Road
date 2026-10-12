## 1. Who I am, what I looked at

I'm Defne. I make Steam capsules, trailers and vertical clips for indie sims. I studied all 14 baseline shots and took 22 of my own: both fixtures, at noon, dusk and night, zoom 4 to 14, plus native 540×960 portrait renders. I cropped 7 frames to 9:16 (viewed at 360×640, phone-feed size) and to 460×215 and 231×87 (`crops/`, `sheet_916.png`, `sheet_capsule_true.png`). I made a rough paint-over (`before_after_z11.png`) and read `renderer.ts`.

## 2. Question 2: should the style change on zoom?

**Partly, yes.** The soil should change, but only once its squares get big enough to become the subject:

- **Up to zoom 6:** keep the pixels. A square is at most 6 px, 3–4 px in a phone feed, and reads as texture.
- **Zoom 6 to 9:** crossfade into "resolved grain": each 1 mm cell becomes 2–4 crumbs in its own tone, and cavity outlines are smoothed.
- **Zoom 9 and up:** no flat square is ever visible.

Surface plants are in the ants' focal plane, so they switch to smooth strokes at zoom 5, like the seeds. Pixels stay the "map" look; macro becomes the "lens" look the pitch promises. Cost: the slice is one canvas drawn with smoothing off. A cheap first version adds a bilinear draw plus a crumb-texture multiply, crossfaded by zoom.

## 3. Findings

**[P0] The macro frames show off the ants, and the soil squares spoil them.** In my best frame (`m_dusk_z11_surface`) the top half stops a thumb: peach backlight, bokeh, ant silhouettes at about 5–6:1 contrast. The bottom half is flat 11 px squares, and a 9:16 crop makes it 55–60% of the frame (`crops/B_dusk_z11_mound_916.png`). `macro.jpg`, `z7` and `z8` have the same problem. It reads as a low-res prototype. **Change:** the zoom rule above. In the paint-over the mound becomes a sand heap the ants stand on.

**[P1] The in-focus grass looks the most like a prototype in the best shots.** Stems are stair-step lines 7–14 px thick (`z7_surface_macro`, `z8_follow_forager`), beside anatomical ants and a soft backdrop. **Change:** draw them as tapered `Path2D` strokes from zoom 5.

**[P1] Underground, the subject disappears.** Ants measure about 1.6:1 against their surroundings underground, versus 5–6:1 against the sky (`p_z8` pair). In `b_granary_z10/14` you search for the queen, and the granary capsule crop is unreadable. **Change:** chamber air lighter than the walls with a warm bounce, plus a stronger rim light underground. Target at least 3:1.

**[P1] The granary, the harvester-ant hook, reads as a grid.** In `b_granary_z14` the seeds sit on a lattice with maroon squares between them. In `renderer.ts`, inner heap cells keep a solid square base, and ±0.27-cell jitter doesn't break the grid. **Change:** offset alternate rows by half a cell, jitter at least 0.5 cell, a soft dark gradient base, and a curved heap top.

**[P1] The red lamp isn't a look yet.** Night underground averages RGB 78/50/33, against 86/63/42 at dusk (`m_night_z6`, `night.jpg`): just darker brown. Red-light formicarium photos are an image people already recognise. **Change:** push the nest to near-monochrome red, with a pool of light and deep black edges. That's a second signature frame.

**[P2] Render vertical clips in portrait; don't crop them.** A native 540×960 render at zoom 6 (`v_dusk_z6`) tells the whole story: mound, foragers, shaft, brood, granary. Cropping 16:10 loses the vignette and misplaces the horizon. **Change:** the clip tool renders 9:16 at zoom 5–7, horizon 30–35% from the top. It keeps the "1 cm" scale bar and shows the caption as a lower third. Today's small caption (`b_director_ui`) can't be read on a phone.

**[P2] Chamber air is a flat teal slab.** In `b_granary_z5`, `z3_mid` and others it reads as water in thumbnails. **Change:** a warm dark gradient, soft wall ambient occlusion, zone tint on the floor only.

## 4. The one screenshot

- **Setup:** meadow fixture at dusk (`timeOfDay(0.74)`), `look(11, nestX+12, ground−4)`: the entrance mound with foragers on the crest.
- **Before:** `p_z11_full.png`.
- **After,** same frame and ants:
  - Soil and mound as grain: each cell becomes 3 crumbs, ellipses of 0.25–0.45 mm, tone ±12%, top lit from the sun side. Tone is interpolated between cells, so there are no 11 px steps.
  - Mound, shaft and chamber outlines traced smooth (marching squares), with a 1 mm soft dark band inside cavities.
  - The four grass stems as tapered strokes.
- **Unchanged:** backdrop, light, ants, film grain.
- **Export:** 16:9 plus native 9:16. Mock-up: `before_after_z11.png`.

## 5. What not to touch

- **Golden-hour backlight over the bokeh backdrop.** These are the only thumb-stopping frames today (`b_entrance_dusk_z7`).
- **The ant drawings.** They read at 460×215 and even at 231×87.
- **The whole-slice cross-section (`hero.jpg`).** Its silhouette reads as "ant farm" at 231×87, so it's the right base for the capsule.
