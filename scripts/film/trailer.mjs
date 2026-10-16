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
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, ROOT, easeIn, easeInOut, pickAnt } from './stage.mjs';

const DAY = 30 * 60 * 6;
const args = process.argv.slice(2);
const tall = args.includes('--tall');
const fixArg = args.indexOf('--fixture');
/**
 * The mature colony the life shots are filmed on: 'pannonian' (seed 6) is Messor
 * structor proper; the art lab's 'meadow' (seed 7) is on the Anatolian site, where
 * the game has the sister species of the M. structor group.
 */
const FIXTURE = fixArg >= 0 ? args[fixArg + 1] : 'pannonian';
const only = args.filter((a, i) => !a.startsWith('--') && i !== fixArg + 1);
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
        { x: land.x0 + 200, y: Z(110, 60), zoom: Z(3, 13), follow: Z(0.75, 0.9), flight: true, dy: Z(20, 6), lag: Z(1.4, 0.8) },
        { x: land.x, y: land.ground - 10, zoom: Z(9, 15), follow: 0.95, flight: true, dy: 4, lag: 0.45, ease: easeIn },
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
        { zoom: Z(8.5, 16), follow: 1, dy: -2, lag: 0.5 },
        { zoom: Z(11.5, 20), follow: 1, dy: 2, lag: 0.7 },
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

/** Golden late afternoon over the mature colony (~200 workers in July). */
async function life() {
  const st = await stage({ fixture: FIXTURE });
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
  // The scent trail they lay and follow (the game's T view).
  if (want('trails')) {
    await st.run((g) => { g.renderer.trails = true; });
    await st.take('trails', {
      seconds: 3,
      cam: [
        { x: L.x + 45, y: L.ground - 8, zoom: Z(7, 9) },
        { x: L.x + 75, y: L.ground - 6, zoom: Z(8, 10.5) },
      ],
    });
    await st.run((g) => { g.renderer.trails = false; });
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
        { zoom: Z(10, 13), follow: 1, dy: 0, lag: 0.6 },
        { zoom: Z(11, 15), follow: 1, dy: 2, lag: 0.6 },
      ],
    });
  }
  // A digger hauling a load of soil up the shaft, close.
  if (want('digger')) {
    const who = (await st.subject(pickAnt, { who: 'soil', range: 120, near: { x: L.x, y: L.ground + 40 } })) ?? (await st.subject(pickAnt, { who: 'any', range: 60, near: { x: L.x, y: L.ground + 60 } }));
    console.log('digger', who);
    await st.take('digger', {
      seconds: 3,
      cam: [{ zoom: Z(14, 22), follow: 1, dy: 0, lag: 0.35 }, { zoom: Z(16, 25), follow: 1, dy: 0, lag: 0.35 }],
    });
  }
  // The queen among her eggs and larvae.
  if (want('queen')) {
    await st.subject(pickAnt, { who: 'queen' });
    await st.take('queen', {
      seconds: 3,
      cam: [{ zoom: Z(14, 24), follow: 1, dx: 1, dy: -1.5, lag: 1.2 }, { zoom: Z(16, 27), follow: 1, dx: 1, dy: -1.5, lag: 1.2 }],
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
      // No grasshopper hopping through the shot.
      const cl = s.critters.list;
      for (let k = cl.length - 1; k >= 0; k--) if (cl[k].kind === 'hopper') cl.splice(k, 1);
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
          { zoom: Z(10, 15), follow: 1, dy: -3, lag: 0.8 },
          { zoom: Z(11.5, 17), follow: 1, dy: -3, lag: 0.8 },
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

/**
 * More of the mature colony: the reveal (one ant, then the whole colony), one
 * forager by name with the game's field note, the door, a lark dropping in,
 * the winged queens and males lifting off, rain at the door, the night lamp.
 */
async function more() {
  const st = await stage({ fixture: FIXTURE });
  await st.run((g) => { g.sim.weather.next = 1e12; });
  await st.timeOfDay(0.62);
  const L = await st.run((g) => {
    const s = g.sim;
    const n = s.nest.chambers.filter((c) => c.kind === 'nursery').sort((a, b) => a.floorY - b.floorY)[0];
    return { x: s.nest.foundX, ground: s.world.ground[s.nest.foundX], nursery: n && { x: n.cx, floor: n.floorY } };
  });
  // One ant and her seed filling the frame; the camera flies out to the whole colony
  // and rests there (room for a title).
  if (want('reveal')) {
    console.log('reveal', await st.subject(pickAnt, { who: 'seed', range: 120, near: { x: L.x + 40, y: L.ground } }));
    await st.take('reveal', {
      seconds: 7.5,
      cam: [
        { zoom: Z(20, 27), follow: 1, dy: -1.5, lag: 0.25 },
        { at: 0.13, zoom: Z(18, 24), follow: 1, dy: -1.5, lag: 0.25 },
        { at: 0.56, x: L.x + 6, y: L.ground + Z(60, 95), zoom: Z(1.6, 2.85), follow: 0, ease: easeInOut },
        { at: 1, x: L.x + 6, y: L.ground + Z(62, 98), zoom: Z(1.55, 2.75) },
      ],
    });
  }
  // One forager, by name, out on the meadow: the game's own field note about her.
  if (want('named')) {
    // A forager carrying a seed home, far out (or any ant out on the meadow, failing that).
    const who = (await st.subject(pickAnt, { who: 'seed', range: 300, near: { x: L.x + 170, y: L.ground } })) ?? (await st.subject(pickAnt, { who: 'out', range: 300, near: { x: L.x + 170, y: L.ground } }));
    console.log('named', who);
    const r = await st.take('named', {
      seconds: 3,
      cam: [{ zoom: Z(14, 19), follow: 1, dy: -3, lag: 0.4 }, { zoom: Z(16, 21), follow: 1, dy: -3, lag: 0.4 }],
    });
    const note = await st.run((g) => (window.film.subject ? g.director.describe(window.film.subject) : ''));
    writeFileSync(join(OUT, 'named.json'), JSON.stringify({ note, frames: r.frames }));
    console.log('note:', note);
  }
  // The door: foragers waiting for news, carriers coming in.
  if (want('gate')) {
    await st.take('gate', {
      seconds: 3,
      cam: [
        { x: L.x + 3, y: L.ground - 1, zoom: Z(10, 12) },
        { x: L.x + 1, y: L.ground + 1, zoom: Z(12, 14) },
      ],
    });
  }
  // A crested lark drops in among the foragers: at a millimetre a cell she is a giant.
  if (want('lark')) {
    const lk = await st.run((g) => {
      const s = g.sim;
      const cr = s.critters;
      for (let k = cr.list.length - 1; k >= 0; k--) if (cr.list[k].kind === 'lark') cr.list.splice(k, 1);
      const tx = s.nest.foundX + 95;
      const c = cr.add({ kind: 'lark', x: tx + 260, y: -60, dir: -1, state: 0, life: 30 * 40, timer: tx });
      // Let her fly in until she is about to come into the frame.
      for (let k = 0; k < 30 * 30 && Math.abs(c.x - tx) > 150 && c.state === 0; k++) s.step();
      return { tx, ground: s.world.ground[tx] };
    });
    await st.take('lark', {
      seconds: 3.6,
      cam: [
        { x: lk.tx - 10, y: lk.ground - 70, zoom: Z(3.6, 5.2) },
        { x: lk.tx - 4, y: lk.ground - 62, zoom: Z(4, 5.8) },
      ],
    });
  }
  // The nuptial flight: winged queens and males climb out of the crater and lift off
  // (the game's own fliers, set going here on a late spring morning's cue).
  if (want('rise')) {
    await st.timeOfDay(0.5);
    // Some already in the air when the shot begins.
    await st.run((g) => {
      const s = g.sim;
      for (let k = 0; k < 90; k++) {
        if (k % 6 === 0) s.flyers.push({ x: s.nest.foundX + (Math.random() - 0.5) * 8, y: s.world.ground[s.nest.foundX] - 2, vx: -0.15 + Math.random() * 0.4, vy: -0.22 - Math.random() * 0.13, caste: Math.random() < 0.35 ? 'gyne' : 'male', t: 0 });
        s.step();
      }
    });
    await st.take('rise', {
      seconds: 3,
      ticks: 3,
      every: (g, { f }) => {
        if (f % 2) return;
        const s = g.sim;
        const gyne = Math.random() < 0.35;
        s.flyers.push({ x: s.nest.foundX + (Math.random() - 0.5) * 8, y: s.world.ground[s.nest.foundX] - 2, vx: -0.15 + Math.random() * 0.4, vy: -0.22 - Math.random() * 0.13, caste: gyne ? 'gyne' : 'male', t: 0 });
      },
      cam: [
        { x: L.x + 4, y: L.ground - 30, zoom: Z(7, 11) },
        { x: L.x + 4, y: L.ground - 60, zoom: Z(6, 10) },
      ],
    });
  }
  // Rain coming: at dusk the first drops fall, the foragers hurry in and the door is plugged.
  if (want('flood')) {
    await st.timeOfDay(0.74);
    await st.run((g) => { g.sim.startRain(true); for (let k = 0; k < 30 * 2; k++) g.sim.step(); });
    await st.take('flood', {
      seconds: 4,
      ticks: 4,
      every: (g, { f }) => { if (f === 18 || f === 24 || f === 84) g.sim.flash = 7; },
      cam: [
        { x: L.x + 2, y: L.ground - 22, zoom: Z(7, 9) },
        { x: L.x, y: L.ground - 14, zoom: Z(8, 10.5) },
      ],
    });
  }
  // Night: the keeper's red lamp on the brood.
  if (want('lamp') && L.nursery) {
    await st.run((g) => { const w = g.sim.weather; w.target = 0; w.rain = 0; w.storm = false; });
    await st.timeOfDay(0.96);
    await st.take('lamp', {
      seconds: 3.6,
      cam: [
        { x: L.nursery.x + 14, y: L.nursery.floor - 6, zoom: Z(8, 9) },
        { x: L.nursery.x + 8, y: L.nursery.floor - 5, zoom: Z(9, 10.5) },
      ],
    });
  }
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

/** Midwinter: snow on the meadow, the colony asleep deep down. */
async function winter() {
  const st = await stage({ fixture: FIXTURE });
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
  if (want('winter')) {
    await st.take('winter', {
      seconds: 6,
      ticks: 1,
      cam: [
        { x: L.x - 30, y: L.ground - Z(8, 0), zoom: Z(4.4, 4) },
        { x: L.x - 10, y: L.ground + Z(40, 70), zoom: Z(3.6, 3) },
      ],
    });
  }
  // From the snow over the door down to the colony asleep in its deepest rooms.
  if (want('sleep')) {
    const deep = await st.run((g) => { const c = g.sim.nest.chambers.slice().sort((a, b) => b.floorY - a.floorY)[0]; return { x: c.cx, floor: c.floorY }; });
    await st.take('sleep', {
      seconds: 4,
      cam: [
        { x: L.x, y: L.ground - 6, zoom: Z(7, 9) },
        { x: deep.x, y: deep.floor - 6, zoom: Z(6, 8), ease: easeInOut },
      ],
    });
  }
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

/** The fullest granary: close on the seed pile. */
async function granary() {
  const st = await stage({ fixture: FIXTURE });
  // (The 'meadow' colony's stores are low in July and fullest two weeks on; the 'pannonian' one's are full already.)
  await st.run((g) => {
    g.sim.weather.next = 1e12;
    const most = () => Math.max(0, ...g.sim.nest.chambers.filter((c) => c.kind === 'granary').map((c) => c.seeds));
    for (let k = 0; k < 3 && most() < 40; k++) g.advance(10800);
  });
  await st.timeOfDay(0.6);
  const gr = await st.run((g) => {
    const s = g.sim;
    const w = s.world;
    const c = s.nest.chambers.filter((c) => c.kind === 'granary').sort((a, b) => b.seeds - a.seeds)[0];
    // The middle of the seeds lying in it (SEED is material 14).
    let n = 0, sx = 0, sy = 0;
    for (let y = c.floorY - 14; y <= c.floorY + 2; y++) for (let x = Math.round(c.cx) - 30; x <= c.cx + 30; x++) if (w.mat[y * w.w + x] === 14) { n++; sx += x; sy += y; }
    return n ? { x: sx / n, y: sy / n, seeds: c.seeds } : { x: c.cx, y: c.floorY - 3, seeds: c.seeds };
  });
  console.log('granary', gr);
  await st.take('granary', {
    seconds: 3,
    cam: [
      { x: gr.x - 2, y: gr.y - 2, zoom: Z(14, 22) },
      { x: gr.x, y: gr.y - 1.5, zoom: Z(18, 28) },
    ],
  });
  await st.close();
  if (st.errors.length) console.log(st.errors);
}

const SHOTS = { opening, life, more, winter, granary };
const GROUPS = {
  opening: ['flight', 'dig', 'founding', 'growth'],
  life: ['column', 'forager', 'trails', 'entrance', 'shaft', 'digger', 'queen', 'nursery', 'nest', 'carry', 'finale', 'storm', 'night'],
  more: ['reveal', 'named', 'gate', 'lark', 'rise', 'flood', 'lamp'],
  winter: ['winter', 'sleep'],
  granary: ['granary'],
};
for (const [name, fn] of Object.entries(SHOTS)) {
  if (only.length && !GROUPS[name].some((s) => only.includes(s))) continue;
  await fn();
}
