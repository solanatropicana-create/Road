# Art review brief: "Underfoot" (working title)

*The brief the five reviewers worked from, 12 October 2026. The harness they used is now `scripts/artlab.mjs`; at the time it ran from a scratch folder against the release build on port 4173. The `../baseline/` shots it mentions were the docs images plus a zoom ladder of the current build; the reviewers' own shots are not kept, apart from their mock-ups (`mock-*.jpg`).*

You are one of five reviewers on an **art panel**. Each of you has a persona, given in your own instructions. Look at the game properly, then write a report. The producer asked two questions, and the panel exists to answer them:

1. **How can the game's visuals get better?** (The current direction is liked: "not bad". We want the next step, not a reboot.)
2. **When the camera zooms in close, does it make sense for the art style to change?** Today the soil is drawn as 1 px = 1 mm pixel art at every zoom, so at macro zoom each millimetre becomes a big flat square, while the ants, seeds and husks are drawn smooth at screen resolution. Is that mix right at every zoom? Should the look shift as you zoom, and if so how, where, and how gradually?

## What the game is

- A cross-section of meadow soil at true scale: 1 world cell = 1 mm. The world is 128 × 72 cm; the view starts around the nest and grows. A *Messor structor* harvester-ant colony lives in it.
- A queen lands, digs, raises workers; then the colony digs a nest (one shaft with flat "pancake" chambers either side), forages seeds, stores them in granaries, raises brood, carries out waste. Seasons, weather, rain, snow, night.
- The player never commands individual ants; they set colony priorities. A big part of the appeal is **watching**: a documentary camera (C) picks subjects and captions them; screenshots and clips are meant to be shareable.
- Zoom runs from about 2.5 (whole slice on a 1440×900 screen) to 14 (macro: one millimetre ≈ 14 screen pixels). Ants are 7–13 mm long.

## The current visual direction (from the design doc, summarised)

- **Macro-lens metaphor, three layers:** (1) out-of-focus background (meadow, sky, bokeh) drawn at half resolution and upscaled soft; (2) the soil slice as **crisp pixel art**, 1 px = 1 mm, real soil horizons (humus, loam, rusty clay, pale subsoil), root threads, old worm burrows, mottles, flecks; (3) **ants at screen resolution**, anatomical vector drawings (two-segment waist, spines, psammophore, tripod gait, sheen, rim light, soft shadow).
- Close up (zoom ≥ 5), seeds/husks/dust/rain switch from single pixels to smooth shapes. The soil and plants do not: they stay square pixels.
- Night: underground lit by a red observation lamp; above ground blue. Vignette and light film grain over everything.
- UI: dark translucent panels, IBM Plex, one amber accent; "field station / lab notebook" tone. No cartoon ants, no neon, no grid look.
- The designer's own open question: "soil pixel, ants smooth: do you like this mix, or should everything be pixel?"

## Material to look at

- `../baseline/` (next to your folder) holds screenshots of the current build: `hero/macro/granary/night/storm.jpg` are the curated shots from the docs; `z0…z8_*.png` are a zoom ladder of a mature colony, from the whole slice (`z0`, `z1`) through nest view (`z2`), mid (`z3`, `z4`) to macro (`z5` granary, `z6` brood, `z7` surface, `z8` following a forager). **Start by opening all of them with the Read tool.**
- You may take your own screenshots. A harness opens the game straight into a saved, mature colony:

```js
import { openColony } from '/home/user/Road/scripts/artlab.mjs';
const g = await openColony({ dir: process.cwd(), fixture: 'meadow' }); // 'meadow' (seed 7, 65 workers, dusk) or 'big' (seed 3, 135 workers, midday, big granary)
console.log(JSON.stringify(await g.layout()));  // chambers with x, floorY, ground (world mm); world is 1280 x 720
await g.timeOfDay(0.5);                         // 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk (colony stays paused)
await g.look(14, 671, 220);                     // zoom (2.5 whole slice … 14 macro), centred on world x, y in mm
await g.shot('my_name', { hideUi: true });      // PNG in your folder; Read it to look
await g.resume(); await g.realtime(3); await g.pause();   // let it move a little
await g.follow('forager', 12);                  // follow an ant ('queen'|'forager'|'digger'|'nurse'|'cleaner'|'major'|'carrier')
await g.rain(); await g.storm();                // weather
await g.fit();                                  // whole slice
await g.close();                                // ALWAYS close
```

  The full harness API (the object returned is the play-test harness plus `timeOfDay` and `layout`) is documented at the top of `/home/user/Road/scripts/playtest.mjs`. The game server runs at http://127.0.0.1:4173 (current release build). In the `big` fixture the granary with seeds is at about x = 671, floor y = 226; the ground there is at y ≈ 168.

## Practical rules

- Work only in **your own folder** (given in your instructions). Write `.mjs` scripts there, run them with `node file.mjs` from that folder.
- **Do not modify anything under /home/user/Road.** No code edits, no git commands, no starting or stopping servers, no killing processes.
- Four other reviewers share a 4-core machine. **One browser per script, always `close()`**, and keep it to a few short scripts (opening a fixture takes ~10 s). 10–30 screenshots of your own is plenty.
- You may make rough mock-ups (paint-overs) with Python + PIL on top of screenshots if that is the clearest way to make a point. Optional; words are fine.
- You may read the renderer code (`/home/user/Road/src/render/*.ts`) to understand or cost an idea; say so when you do.

## Your report

Write `report.md` in your folder and return exactly the same text as your final message. **Hard limit: 800 words.** English. Structure:

1. **Who I am, what I looked at.** One line on your persona; which shots you studied or took.
2. **Answer to question 2 (style change on zoom).** Your clear position: yes / no / partly, and the rule you would use (what changes, at which zoom, how the transition happens). Two to five sentences, in your persona's voice.
3. **Findings.** At most 8, most important first:
   `[P0|P1|P2] Title — what you saw (file name) → why it matters → concrete change.`
   P0 = the thing that most holds the look back; P1 = important; P2 = nice to have.
4. **The one screenshot.** If the team could build only one change and show it as a before/after screenshot, describe exactly what the "after" frame shows (zoom, subject, what is drawn differently), concretely enough that an engineer could build it.
5. **What not to touch.** One to three things that already work and should be protected.

Ground rules: be specific and honest; praise only what earns it; every claim should come from something you saw.
