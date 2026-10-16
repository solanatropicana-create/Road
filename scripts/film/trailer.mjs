/**
 * The trailer's shots, recorded from the real game (see stage.mjs).
 *
 *   npm run dev
 *   node scripts/film/trailer.mjs                 # every shot, 2.39:1 (1920 × 804)
 *   node scripts/film/trailer.mjs --tall          # the vertical teaser's shots (1080 × 1920)
 *   node scripts/film/trailer.mjs flight forager  # just these
 *
 * Clips land in shots/film/clips/<wide|tall>/. scripts/film/edit.mjs cuts them
 * together with the titles and the score. Mature-colony shots use the art
 * lab's fixtures (made on first use, a few minutes each).
 */
import { openStage, ROOT, easeIn, pickAnt } from './stage.mjs';
import { join } from 'node:path';

const DAY = 30 * 60 * 6;
const args = process.argv.slice(2);
const tall = args.includes('--tall');
const only = args.filter((a) => !a.startsWith('--'));
const FORMAT = tall ? { width: 1080, height: 1920, dir: 'tall' } : { width: 1920, height: 804, dir: 'wide' };
const OUT = join(ROOT, 'shots/film/clips', FORMAT.dir);
const want = (name) => !only.length || only.includes(name);
const stage = (opts) => openStage({ width: FORMAT.width, height: FORMAT.height, out: OUT, ...opts });
/** A zoom that suits both formats: tall frames are narrow, so wide views pull out less. */
const Z = (wide, t = wide) => (tall ? t : wide);

// ------------------------------------------------------------ the story: a queen comes down

async function opening() {
  // Seed 8: the meadow of the README's hero shot.
  const st = await stage({ seed: 8 });
  await st.timeOfDay(0.37);
  await st.run((g) => {
    // No lark wandering through the shot (it would fill the frame at this scale).
    const cl = g.sim.critters.list;
    for (let k = cl.length - 1; k >= 0; k--) if (cl[k].kind === 'lark') cl.splice(k, 1);
    // She comes down a little right of the middle, on open ground.
    const s = g.sim;
    let x = 760;
    for (let c = 760; c < 900; c++) if (s.canFound(c)) { x = c; break; }
    g.cine.startLanding();
    const L = g.cine.landing;
    L.dir = 1;
    L.x = x;
    L.x0 = x - s.world.w * 0.45;
  });
  const land = await st.run((g) => ({ x: g.cine.landing.x, x0: g.cine.landing.x0, ground: g.sim.world.ground[g.cine.landing.x] }));
  // 1. The swarm in the morning sky; the camera finds her and follows her down.
  if (want('flight')) {
    await st.take('flight', {
      seconds: 5.6,
      preroll: 0,
      ticks: 1,
      cam: [
        // (A tall frame shows the whole sky only close in: the slice has 16 cm of air.)
        { x: land.x0 + 200, y: Z(110, 60), zoom: Z(3, 8), follow: 0.75, flight: true, dy: 20, lag: 1.4 },
        { x: land.x, y: land.ground - 10, zoom: Z(9, 10.5), follow: 0.95, flight: true, dy: 4, lag: 0.45, ease: easeIn },
      ],
    });
  } else await st.run((g) => g.cine.skip());
  // Landed: the camera hands over from the flight path to the queen herself.
  await st.run((g) => { while (g.cine.busy) { g.cine.update(1 / 30); } });
  await st.subject((g) => g.sim.colony.queen);
  // 2. She sheds her wings and digs in.
  if (want('dig')) {
    await st.take('dig', {
      seconds: 5,
      ticks: (u) => Math.round(2 + u * 10),
      preroll: 0,
      cam: [
        { zoom: Z(8.5, 7), follow: 1, dy: -2, lag: 0.5 },
        { zoom: Z(11.5, 10), follow: 1, dy: 2, lag: 0.7 },
      ],
    });
  }
  if (!want('founding') && !want('growth')) {
    await st.close();
    return;
  }
  // Run on until she has sealed herself in (the montage starts).
  await st.run((g) => { for (let k = 0; k < 10800 * 3 && !g.cine.montage; k++) { g.sim.step(); if (k % 30 === 0) g.ui.update(1 / 30); } }, null);
  // 3. Claustral founding: weeks in seconds, close on the queen and her brood.
  if (want('founding')) {
    // Light a little more of the dark around her cell than she knows (a wider lantern).
    await st.run((g) => { const q = g.sim.colony.queen; g.sim.fog.reveal(q.x, q.y, 45, false); });
    await st.take('founding', {
      seconds: 8,
      ticks: 300,
      preroll: 6,
      cam: [
        { zoom: Z(22, 20), follow: 1, dx: 1, dy: -1.5, lag: 1.5 },
        { zoom: Z(25, 22), follow: 1, dx: 0.5, dy: -1.5, lag: 1.5 },
      ],
      until: (g) => g.sim.colony.hadWorkers,
    });
  }
  await st.run((g) => { for (let k = 0; k < 10800 * 10 && !g.sim.colony.hadWorkers; k++) g.sim.step(); });
  // 4. The colony grows: one frame a week, same hour each time, the dark retreating as they dig.
  if (want('growth')) {
    await st.timeOfDay(0.58);
    const nest = await st.run((g) => ({ x: g.sim.nest.foundX, y: g.sim.world.ground[g.sim.nest.foundX] }));
    await st.take('growth', {
      seconds: 8,
      fps: 8,
      ticks: DAY,
      preroll: 2,
      cam: [
        { x: nest.x, y: nest.y + Z(12, 26), zoom: Z(3.6, 5.6) },
        { x: nest.x, y: nest.y + Z(28, 55), zoom: Z(2.7, 3.9) },
      ],
    });
  }
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

// ------------------------------------------------------------ the colony at work (a mature colony)

/** Golden late afternoon over the 'meadow' fixture (seed 7, ~200 workers in July). */
async function life() {
  const st = await stage({ fixture: 'meadow' });
  await st.run((g) => { g.sim.weather.next = 1e12; });
  await st.timeOfDay(0.64);
  const L = await st.run((g) => {
    const s = g.sim;
    const w = s.world;
    const ch = (k) => s.nest.chambers.filter((c) => c.kind === k);
    return { x: s.nest.foundX, ground: w.ground[s.nest.foundX], queen: ch('queen')[0], nurseries: ch('nursery').map((c) => ({ x: c.cx, floor: c.floorY })) };
  });
  // The column of foragers on the surface: a slow dolly along the trail.
  if (want('column')) {
    await st.take('column', {
      seconds: 5,
      ticks: 1,
      cam: [
        { x: L.x + Z(70, 40), y: L.ground - Z(6, 10), zoom: Z(6.5, 7) },
        { x: L.x + Z(140, 80), y: L.ground - Z(6, 10), zoom: Z(7.5, 8) },
      ],
    });
  }
  // One forager with a seed, close: the macro lens.
  if (want('forager')) {
    const who = await st.subject(pickAnt, { who: 'seed', range: 200, near: { x: L.x + 90, y: L.ground } });
    console.log('forager', who);
    await st.take('forager', {
      seconds: 5,
      ticks: 1,
      cam: [
        { zoom: Z(12, 11), follow: 1, dy: -2, lag: 0.45 },
        { zoom: Z(14, 13), follow: 1, dy: -2, lag: 0.45 },
      ],
    });
  }
  // The door: traffic in and out of the crater.
  if (want('entrance')) {
    await st.take('entrance', {
      seconds: 5,
      ticks: 1,
      cam: [
        { x: L.x + 6, y: L.ground - 2, zoom: Z(9, 9) },
        { x: L.x + 2, y: L.ground + 2, zoom: Z(11, 11) },
      ],
    });
  }
  // Down the shaft with a seed, to the granary.
  if (want('shaft')) {
    const who = await st.subject(pickAnt, { who: 'seedIn', range: 120, near: { x: L.x, y: L.ground + 8 } });
    console.log('shaft', who);
    await st.take('shaft', {
      seconds: 5,
      ticks: 1,
      cam: [
        { zoom: Z(10, 9), follow: 1, dy: 0, lag: 0.6 },
        { zoom: Z(11, 10), follow: 1, dy: 2, lag: 0.6 },
      ],
    });
  }
  // The brood: a nursery with nurses at work.
  if (want('nursery')) {
    const n = L.nurseries.sort((a, b) => a.floor - b.floor)[0];
    await st.take('nursery', {
      seconds: 5,
      ticks: 1,
      cam: [
        { x: n.x + 16, y: n.floor - 5, zoom: Z(11, 10) },
        { x: n.x + 10, y: n.floor - 4, zoom: Z(13, 12) },
      ],
    });
  }
  // The whole nest: a tilt from the door down the shaft.
  if (want('nest')) {
    await st.take('nest', {
      seconds: 6,
      ticks: 1,
      cam: [
        { x: L.x, y: L.ground + Z(10, 30), zoom: Z(4.6, 3.6) },
        { x: L.x + 8, y: L.ground + Z(70, 110), zoom: Z(3.6, 2.6) },
      ],
    });
  }
  // A beetle found dead near the trail: a team drags it home.
  if (want('carry')) {
    const c = await st.run((g) => {
      const s = g.sim;
      let c = null;
      for (const dx of [70, 90, 110, 130, 150, -70, -90, -110, 60, 170]) if (!c) c = s.carcasses.drop(s, 'beetle', s.nest.foundX + dx);
      if (!c) return null;
      // Wait for a team to take hold (up to three game hours), then a little more so they are under way.
      for (let k = 0; k < 30 * 60 * 45 && c.carriers.length < 3; k++) s.step();
      for (let k = 0; k < 30 * 10; k++) s.step();
      return { x: c.x, y: c.y, carriers: c.carriers.length };
    });
    console.log('carcass', c);
    if (c) {
      await st.subject((g) => g.sim.carcasses.list[g.sim.carcasses.list.length - 1]);
      await st.take('carry', {
        seconds: 5,
        ticks: 2,
        cam: [
          { zoom: Z(10, 9), follow: 1, dy: -3, lag: 0.8 },
          { zoom: Z(11.5, 10), follow: 1, dy: -3, lag: 0.8 },
        ],
      });
    }
  }
  // Dusk: the long pull-back from the door to the whole slice, for the title.
  if (want('finale')) {
    await st.timeOfDay(0.715);
    await st.take('finale', {
      seconds: 9,
      ticks: 1,
      cam: [
        { x: L.x + 4, y: L.ground - 4, zoom: Z(9, 8) },
        { x: L.x, y: L.ground + Z(60, 200), zoom: Z(1.5, 2.7), ease: (t) => 1 - Math.pow(1 - t, 2.4) },
      ],
    });
  }
  // A summer storm at dusk: rain, lightning, the door sealed.
  if (want('storm')) {
    await st.timeOfDay(0.76);
    await st.run((g) => { g.sim.startRain(true); for (let k = 0; k < 30 * 25; k++) g.sim.step(); });
    await st.take('storm', {
      seconds: 6,
      ticks: 1,
      every: (g, { f }) => { if (f === 24 || f === 33 || f === 110) g.sim.flash = 7; },
      cam: [
        { x: L.x - 20, y: L.ground - 16, zoom: Z(5, 4.5) },
        { x: L.x + 4, y: L.ground - 6, zoom: Z(6.5, 6) },
      ],
    });
  }
  // Night: the keeper's red lamp over the nest, fireflies in the grass.
  if (want('night')) {
    await st.run((g) => { const w = g.sim.weather; w.target = 0; w.rain = 0; w.storm = false; });
    await st.timeOfDay(0.95);
    await st.take('night', {
      seconds: 6,
      ticks: 1,
      cam: [
        { x: L.x - 40, y: L.ground + Z(30, 60), zoom: Z(3.6, 2.8) },
        { x: L.x + 20, y: L.ground + Z(40, 70), zoom: Z(4.2, 3.2) },
      ],
    });
  }
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

/** Midwinter on the 'meadow' fixture: snow on the meadow, the colony asleep deep down. */
async function winter() {
  const st = await stage({ fixture: 'meadow' });
  const t0 = Date.now();
  await st.run((g) => {
    const s = g.sim;
    s.weather.next = 1e12;
    for (let k = 0; k < 40 && !(s.doy > 12 && s.doy < 40); k++) g.advance(10800);
  });
  await st.timeOfDay(0.5);
  await st.run((g) => { const s = g.sim; s.startRain(false); s.snow = Math.max(s.snow, 9); for (let k = 0; k < 30 * 20; k++) s.step(); });
  console.log('winter ready', (Date.now() - t0) / 1000, await st.run((g) => ({ doy: g.sim.doy, snow: g.sim.snow, snowing: g.sim.weather.snowing, dormant: g.sim.dormant })));
  const L = await st.run((g) => ({ x: g.sim.nest.foundX, ground: g.sim.world.ground[g.sim.nest.foundX] }));
  await st.take('winter', {
    seconds: 6,
    ticks: 1,
    cam: [
      { x: L.x - 30, y: L.ground - Z(8, 0), zoom: Z(4.4, 4) },
      { x: L.x - 10, y: L.ground + Z(40, 70), zoom: Z(3.6, 3) },
    ],
  });
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

const SHOTS = { opening, life, winter };
const GROUPS = {
  opening: ['flight', 'dig', 'founding', 'growth'],
  life: ['column', 'forager', 'entrance', 'shaft', 'nursery', 'nest', 'carry', 'finale', 'storm', 'night'],
  winter: ['winter'],
};
for (const [name, fn] of Object.entries(SHOTS)) {
  if (only.length && !GROUPS[name].some((s) => only.includes(s))) continue;
  await fn();
}
