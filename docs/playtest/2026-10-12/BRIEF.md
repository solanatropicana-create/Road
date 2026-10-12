# Play-test brief: "Underfoot" (working title)

You are one of nine play-testers. Each of you has a persona, given in your own instructions. Play the game properly, start to finish, then write a report.

## What the game is (store-page level)

- A cross-section of meadow soil at true scale: 1 pixel is 1 mm, so the slice is 64 × 36 cm. You watch a *Messor structor* harvester-ant colony.
- A mated queen lands, tears off her wings, digs a burrow and raises her first workers alone. After that the colony grows on its own: it digs a nest, forages seeds, stores them in granaries, raises brood and carries out waste.
- Weather comes on its own: rain, storms and floods.
- **The player never commands individual ants. You are the "colony brain".** You set:
  - work priorities (Dig, Forage, Nurse, Clean),
  - the queen's breeding rate,
  - the share of big-headed majors,
  - which rooms to add (nursery, granary, rest chamber, dig deeper),
  - a marker for where the nest should grow.
- Other tools:
  - Click an ant to follow it.
  - Hover a chamber for its details.
  - A field journal logs events.
  - C: documentary camera that picks subjects and captions them.
  - P: dig plan. T: scent trails. H: hide panels. ?: key list. 1–5: speed (1× to 16×). Space: pause.
- One in-game day lasts 6 real minutes at 1×.
- The colony autosaves in the browser.
- **Status:** a prototype made in one night. Planned but not built: rival colony, seasons and run structure, more species, clip tool, sound.

## How you play: the harness

There is no human screen here. You play through a Node script that drives the real game in a headless browser. You see the game by taking screenshots and opening the PNGs with the Read tool, so look often.

Work in **your own folder** (given in your instructions). Write `.mjs` scripts there and run them with `node <file>.mjs` from that folder. Each script opens the game, does things, takes screenshots, prints state, and closes. Keep a running colony within one script when you want to watch it develop.

```js
import { openGame } from '/home/user/Road/scripts/playtest.mjs';
const g = await openGame({ dir: process.cwd(), seed: 42 }); // { mobile: true } for a phone; width/height for other screens
await g.shot('01_title');                 // returns the PNG path; Read it to look
await g.land();                           // "Let her choose", or g.land(250) to click the ground at x = 250 mm (0..640)
await g.speed(5);                         // 1..5 = 1x 2x 4x 8x 16x
await g.realtime(10);                     // let it run 10 real seconds at the current speed (what a player sees)
await g.skip(12);                         // fast-forward 12 in-game minutes instantly (2 in-game days)
await g.skipDays(3);
console.log(await g.state());             // workers, brood, food, chambers (depth in cm), tasks, deaths, settings, last journal lines
console.log(await g.toasts());            // pop-up messages on screen now
await g.follow('forager');                // 'queen' | 'forager' | 'digger' | 'nurse' | 'cleaner' | 'major' | 'carrier'
await g.look(10, 320, 120);               // camera: zoom (2.5 ≈ whole slice, 4 = nest, 8–14 = macro), centred on x, y in mm
await g.fit();                            // whole slice
await g.burst('motion', 6, 400);          // 6 frames 400 ms apart, plus a contact sheet (to see movement)
await g.setPriority('forage', 3);         // 'dig'|'forage'|'nurse'|'clean', 0 Off 1 Low 2 Normal 3 High
await g.setBreeding(2);                   // 0 Low 1 Normal 2 High
await g.setMajors(25);                    // 0..35 %
await g.order('granary');                 // 'nursery' | 'granary' | 'rest'
await g.digDeeper();
await g.mark(400, 200);                   // "Mark where to grow" at x = 400, y = 200 mm
await g.rain(); await g.storm();
await g.key('c');                         // any key: 'c' 'p' 't' 'h' '?' 'f' 'Escape' ' '
await g.click('#watch');                  // any CSS selector
await g.hoverWorld(300, 120);             // hover (chamber tooltips)
await g.clickWorld(300, 120);             // click in the world (selects the nearest ant)
await g.reload(); await g.continueColony();  // test the save: reload the page and continue
console.log(g.errors);                    // JS errors seen
await g.close();
g.page                                    // the raw Playwright page, if you need something else
```

**Coordinates.**
- The ground line sits at about y = 84 mm.
- The slice runs from x = 0 to 640 and from y = 0 to 360.
- The nest is usually at x ≈ 300–340, at depths of 2–8 cm (y ≈ 100–170).

**Practical rules.**
- **One browser at a time.** Always `await g.close()` before opening another. The machine has 4 cores and 9 testers share it.
- **Use `skip()` for long stretches.** A whole session should take you roughly 20–40 minutes of wall time.
- **Do not modify anything under /home/user/Road.** No code edits, no git commands that change state, no starting or stopping servers, no killing processes.
- **The game server is already running** at http://127.0.0.1:4173 (release build). If it doesn't answer, say so in your report rather than starting one.
- **Real-time watching is limited.** Use `realtime()` plus `burst()` to see motion, and the documentary camera for the "watch" experience. ffmpeg and Python with PIL are available if you need them.
- **Screenshots are your eyes.** Take plenty (20–60), at landing, founding, first workers, growth, close-ups, night, storm, mature colony and failure, and actually look at them.

## Your report

When done, write `report.md` in your folder. Return exactly the same text as your final message. **Hard limit: 900 words.** Write in English. Use this structure:

1. **Who I am and what I did.** One line on your persona. How you played: seeds, how many in-game days, what you tried.
2. **Verdict.** Two or three sentences, in your persona's honest voice.
3. **Findings.** At most 10, most important first. Format each one as:
   `[P0|P1|P2] Title — what you saw (screenshot file name) → why it matters → concrete suggestion.`
   - P0 = must fix before anyone else plays.
   - P1 = important.
   - P2 = nice to have.
4. **Persona section.** The extra section your instructions ask for.
5. **Best screenshots.** Up to 3 file names that back your main points.

**Ground rules for findings:**
- Be specific and honest.
- Praise only what earns it, and keep it short.
- Every claim should come from something you saw or measured in play, not from reading the code.
- If you checked the code to explain something, say so.
