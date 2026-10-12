# Art review: Dr. Ilse (soil micromorphology, harvester-ant nests)

## 1. Who I am, what I looked at
I study soil thin sections and nest casts at 1–20× and have dug *Messor* nests. I studied all 14 baseline shots and took 21 of my own (`b01–b13` big fixture, `m01–m08` meadow). I read `renderer.ts` and `palette.ts`, and made a paint-over from the game's own frame (`c03_before_after_crop.png`).

## 2. Question 2: should the style change on zoom?
**Partly.** Up to zoom ~5 the 1 mm mosaic is right: it reads like a soil face under a hand lens. But nothing in soil is a flat 1 mm square. At 14 px/mm a cell is the size of a coarse sand grain, and the eye looks for crumbs, pores and grains inside it. My rule: keep the cell as the unit of simulation and colour. From zoom 6 to 10, fade in a world-anchored texture finer than 1 mm, chosen per material and multiplied over the cell colour so palette, light and moisture survive. Over the same range, let colours interpolate and smooth the soil/void edges. The hard switch at zoom 5 for seeds and dust should follow the same fade.

## 3. Findings
- **[P0] Soil at macro is camouflage mud.** `b10_clay_z14`, `m04`, `z5` show flat squares in smooth noise, with no grains, pores or aggregates. → Brightness-only texture per material, drawn for the visible area only: humus as crumbs and worm casts; loam as crumbs with clustered voids and quartz glints; clay as blocky peds with shiny coatings; subsoil as pale sand.
- **[P0] Walls have no ant-made lining.** `b08_shaft_z14`, `b01`: the walls are 1-cell staircases with a lit edge. Ants pat walls into a smooth, compacted, darker skin 0.2–0.5 mm thick that glistens when moist. This is the nest's signature at macro. → Trace a marching-squares contour along the edge, add a darker 0.3 mm band inside it, and give floors a sheen.
- **[P1] Spoil isn't pellets.** In `b05`–`b07` the mound is flat squares. Ants carry soil out as moist, head-sized pellets, and you already draw one in the mandibles (`b13`). → Draw SAND cells as rounded pellets with gaps, coloured by `tint`, so the mound records the dig: humus pellets first, rusty clay later.
- **[P1] The granary is a checkerboard.** `b01`, `b08`: stored FRUIT cells (47 in that heap) and the cells inside the heap stay as maroon squares between the seed ovals. A *Messor* granary is a packed, level bed of seeds lying flat, sorted by kind. → Draw 2–3 touching grains per stored cell, long axis horizontal; give fruit a smooth blob.
- **[P1] Teal nurseries read as standing water.** `z2`, `z3`, `b02`: ZONE_TINT `#4e7a78` mixed in at 38%. Blue-grey in a void means water or gley. → Let the contents tell rooms apart; keep any tint warm and ≤10%.
- **[P1] Grains sit on diagonal lines.** `b11_deep_z10`, `m05`, `z0_big_fit`: `Math.imul(i, 2654435761) % 10000` places the pale grains and charcoal on a lattice, so the profile looks like a scratched slide. → Use a proper hash (fmix32).
- **[P2] Roots are 1 mm staircases.** `b09`, `b12`: they read as cracks. Fine roots are 0.1–0.5 mm, curving, with cream tips and root hairs. → Draw a thin spline with root hairs at macro, and rust haloes where roots cross the gley (`b11`).
- **[P2] Small macro lies.** Underground shoots are green but should be pale yellow, since they grow in the dark (`b05`). Leaf litter is a 1 mm orange bar instead of a thin, curled flake (`z8`). Eggs sit in single file instead of sticky clumps (`m07`).

**Details that reward zooming in (draw 1–5):** (1) patted wall linings, (2) pellets coloured by horizon, (3) crumbs and pores, (4) quartz glints under the lamp, (5) a packed, sorted granary, (6) root hairs, (7) clay coatings, (8) a stray springtail.

## 4. The one screenshot
Big fixture, noon, `look(14, 671, 222)`, centred on the granary (`c01_before.png`). In the "after" frame no squares show. The humus is a crumb fabric of rounded aggregates 0.5–1.2 mm, lit from the upper left, with about 20% clustered dark voids and sparse quartz glints. Chamber outlines are smooth curves with a 0.3 mm darker lining and moist floor highlights. The granary is a level, packed bed of seeds lying flat. Nursery walls are neutral brown, roots are thin cream threads, and the ants are unchanged. See `c02_after_mockup.png`.

## 5. What not to touch
- The profile logic: real horizons, redox mottles, and spoil that dries paler and remembers its source (`hero.jpg`, `b11`), plus the pale husk midden (`macro.jpg`).
- The ants: anatomy, true scale (`z8`) and the head-sized pellet in their jaws.
- The 1 mm mosaic at overview and nest zoom (`z0`–`z3`), where it reads as an honest soil profile.
