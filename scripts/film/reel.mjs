/**
 * Shots for the vertical Instagram reel (1080 × 1920): the hook, and the
 * colony's ways one by one. The story shots (flight, founding, growth) and
 * the weather come from trailer.mjs --tall.
 *
 *   npm run dev
 *   node scripts/film/reel.mjs                # every shot → shots/film/clips/tall/
 *   node scripts/film/reel.mjs hook lark      # just these
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, ROOT, easeInOut, pickAnt } from './stage.mjs';

const OUT = join(ROOT, 'shots/film/clips/tall');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (name) => !only.length || only.includes(name);
const stage = (opts) => openStage({ width: 1080, height: 1920, out: OUT, ...opts });

/** The door and the ground there, on the 'meadow' fixture. */
const layout = (st) =>
  st.run((g) => {
    const s = g.sim;
    const ch = (k) => s.nest.chambers.filter((c) => c.kind === k);
    return { x: s.nest.foundX, ground: s.world.ground[s.nest.foundX], queen: ch('queen')[0] && { x: ch('queen')[0].cx, floor: ch('queen')[0].floorY } };
  });

/** Golden afternoon on the 'meadow' fixture (seed 7, ~200 workers in July). */
async function meadow() {
  const st = await stage({ fixture: 'meadow' });
  await st.run((g) => { g.sim.weather.next = 1e12; });
  await st.timeOfDay(0.62);
  const L = await layout(st);

  // The hook: one ant and her seed, filling the screen; then the camera flies
  // out to show the whole colony she belongs to.
  if (want('hook')) {
    console.log('hook', await st.subject(pickAnt, { who: 'seed', range: 120, near: { x: L.x + 40, y: L.ground } }));
    await st.take('hook', {
      seconds: 3.8,
      cam: [
        { zoom: 27, follow: 1, dy: -1.5, lag: 0.25 },
        { at: 0.3, zoom: 23, follow: 1, dy: -1.5, lag: 0.25 },
        { at: 1, x: L.x + 6, y: L.ground + 95, zoom: 2.85, follow: 0, ease: easeInOut },
      ],
    });
  }
  // 01 A forager carrying a seed home.
  if (want('forager')) {
    console.log('forager', await st.subject(pickAnt, { who: 'seed', range: 200, near: { x: L.x + 110, y: L.ground } }));
    await st.take('forager', {
      seconds: 3,
      cam: [{ zoom: 22, follow: 1, dy: -2, lag: 0.35 }, { zoom: 25, follow: 1, dy: -2, lag: 0.35 }],
    });
  }
  // 02 The scent trail they lay and follow (the game's T view).
  if (want('trails')) {
    await st.run((g) => { g.renderer.trails = true; });
    await st.take('trails', {
      seconds: 3,
      cam: [
        { x: L.x + 45, y: L.ground - 8, zoom: 9 },
        { x: L.x + 75, y: L.ground - 6, zoom: 10.5 },
      ],
    });
    await st.run((g) => { g.renderer.trails = false; });
  }
  // 03 The door: foragers waiting for news, carriers coming in.
  if (want('gate')) {
    await st.take('gate', {
      seconds: 3,
      cam: [
        { x: L.x + 3, y: L.ground - 1, zoom: 12 },
        { x: L.x + 1, y: L.ground + 1, zoom: 14 },
      ],
    });
  }
  // 04 A digger hauling a load of soil up the shaft.
  if (want('digger')) {
    const who = (await st.subject(pickAnt, { who: 'soil', range: 120, near: { x: L.x, y: L.ground + 40 } })) ?? (await st.subject(pickAnt, { who: 'any', range: 60, near: { x: L.x, y: L.ground + 60 } }));
    console.log('digger', who);
    await st.take('digger', {
      seconds: 3,
      cam: [{ zoom: 22, follow: 1, dy: 0, lag: 0.35 }, { zoom: 25, follow: 1, dy: 0, lag: 0.35 }],
    });
  }
  // 06 The queen among her eggs.
  if (want('queen')) {
    await st.subject(pickAnt, { who: 'queen' });
    await st.take('queen', {
      seconds: 3,
      cam: [{ zoom: 24, follow: 1, dx: 1, dy: -1.5, lag: 1.2 }, { zoom: 27, follow: 1, dx: 1, dy: -1.5, lag: 1.2 }],
    });
  }
  // 08 One ant, by name: the game's own field note about her.
  if (want('named')) {
    const who = await st.subject(pickAnt, { who: 'out', range: 300, near: { x: L.x + 170, y: L.ground } });
    console.log('named', who);
    const r = await st.take('named', {
      seconds: 3,
      cam: [{ zoom: 19, follow: 1, dy: -3, lag: 0.4 }, { zoom: 21, follow: 1, dy: -3, lag: 0.4 }],
    });
    const note = await st.run((g) => (window.film.subject ? g.director.describe(window.film.subject) : ''));
    writeFileSync(join(OUT, 'named.json'), JSON.stringify({ note, frames: r.frames }));
    console.log('note:', note);
  }
  // 07 A beetle too heavy for one: a team drags it home.
  if (want('carry')) {
    const c = await st.run((g) => {
      const s = g.sim;
      let c = null;
      for (const dx of [70, 90, 110, 130, 150, -70, -90, -110, 60, 170]) if (!c) c = s.carcasses.drop(s, 'beetle', s.nest.foundX + dx);
      if (!c) return null;
      for (let k = 0; k < 30 * 60 * 45 && c.carriers.length < 4; k++) s.step();
      return { x: c.x, y: c.y, carriers: c.carriers.length };
    });
    console.log('carcass', c);
    if (c) {
      await st.subject((g) => g.sim.carcasses.list[g.sim.carcasses.list.length - 1]);
      await st.take('carry', {
        seconds: 3,
        ticks: 2,
        cam: [{ zoom: 15, follow: 1, dy: -3, lag: 0.6 }, { zoom: 17, follow: 1, dy: -3, lag: 0.6 }],
      });
    }
  }
  // A crested lark drops in among the foragers: at a millimetre a cell she is a giant.
  if (want('lark')) {
    const lk = await st.run((g) => {
      const s = g.sim;
      const cr = s.critters;
      for (let k = cr.list.length - 1; k >= 0; k--) if (cr.list[k].kind === 'lark') cr.list.splice(k, 1);
      const tx = s.nest.foundX + 95;
      const dir = -1;
      const c = cr.add({ kind: 'lark', x: tx - dir * 260, y: -60, dir, state: 0, life: 30 * 40, timer: tx });
      // Let her fly in until she is about to come into the frame.
      for (let k = 0; k < 30 * 30 && Math.abs(c.x - tx) > 150 && c.state === 0; k++) s.step();
      return { tx, x: c.x, y: c.y, state: c.state, ground: s.world.ground[tx] };
    });
    console.log('lark', lk);
    await st.take('lark', {
      seconds: 3.6,
      cam: [
        { x: lk.tx - 10, y: lk.ground - 70, zoom: 5.2 },
        { x: lk.tx - 4, y: lk.ground - 62, zoom: 5.8 },
      ],
    });
  }
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

/** 05 Two weeks on, the 'meadow' colony's granary is at its fullest. */
async function granary() {
  if (!want('granary')) return;
  const st = await stage({ fixture: 'meadow' });
  await st.run((g) => { g.sim.weather.next = 1e12; g.advance(10800 * 2); });
  await st.timeOfDay(0.6);
  const gr = await st.run((g) => {
    const s = g.sim;
    const w = s.world;
    const c = s.nest.chambers.filter((c) => c.kind === 'granary').sort((a, b) => b.seeds - a.seeds)[0];
    // The middle of the seeds lying in it (SEED is material 14).
    let n = 0, sx = 0, sy = 0;
    for (let y = c.floorY - 14; y <= c.floorY + 2; y++) for (let x = Math.round(c.cx) - 30; x <= c.cx + 30; x++) if (w.mat[y * w.w + x] === 14) { n++; sx += x; sy += y; }
    return n ? { x: sx / n, y: sy / n, seeds: c.seeds, cells: n } : { x: c.cx, y: c.floorY - 3, seeds: c.seeds, cells: 0 };
  });
  console.log('granary', gr);
  await st.take('granary', {
    seconds: 3,
    cam: [
      { x: gr.x - 2, y: gr.y - 2, zoom: 22 },
      { x: gr.x, y: gr.y - 1.5, zoom: 28 },
    ],
  });
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

await meadow();
await granary();
