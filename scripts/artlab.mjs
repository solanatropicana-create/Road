/**
 * Art lab: the same mature colony every time, for comparing looks.
 *
 * As a library (built on scripts/playtest.mjs):
 *
 *   import { openColony } from '/home/user/Road/scripts/artlab.mjs';
 *   const g = await openColony({ dir: '/tmp/look', fixture: 'big' }); // 'big' (seed 3, ~135 workers) | 'meadow' (seed 7, ~65)
 *   await g.timeOfDay(0.74);        // 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk; the colony stays paused
 *   console.log(await g.layout());  // chambers with x, floorY and ground height (world mm)
 *   await g.look(14, 671, 222);     // zoom, world x, y
 *   await g.shot('granary', { hideUi: true });
 *   await g.close();
 *
 * From the command line it takes the reference shots of docs/art-review/
 * (whole slice, nest, entrance, granary, surface, night) into shots/art/:
 *
 *   npm run dev   (or a release build: npx vite preview --port 4173, then --url)
 *   node scripts/artlab.mjs [--url http://127.0.0.1:5173/] [--tag name]
 *
 * A fixture is a colony saved after about a year and a half of play. The first
 * run makes it (a few minutes) and keeps it in shots/fixtures/.
 */
import { openGame } from './playtest.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = {
  big: { seed: 3, days: 70, tod: 0.55 },
  meadow: { seed: 7, days: 64, tod: 0.72 },
  // Messor structor proper (the Anatolian 'meadow' is the M. structor group): for the marketing films.
  pannonian: { seed: 6, days: 64, tod: 0.62 },
  sand: { seed: 8, days: 64, tod: 0.62 },
};

async function makeFixture(name, url) {
  const f = FIXTURES[name];
  const file = join(ROOT, 'shots/fixtures', `${name}.json`);
  if (existsSync(file)) return file;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`making fixture '${name}' (seed ${f.seed}, ${f.days} in-game weeks)…`);
  const g = await openGame({ dir: join(ROOT, 'shots/fixtures'), seed: f.seed, url });
  const W = await g.page.evaluate(() => window.game.sim.world.w);
  await g.land(Math.round(W / 2));
  await g.skipDays(f.days);
  const dayT = await g.page.evaluate(() => window.game.sim.dayT);
  await g.skip((((f.tod - dayT) % 1) + 1) % 1 * 6);
  await g.pause();
  await g.page.evaluate(() => window.game.save());
  await g.page.waitForTimeout(1500);
  // The colony is kept in an IndexedDB slot (localStorage where IndexedDB is unavailable).
  const data = await g.page.evaluate(async () => {
    const local = { save: localStorage.getItem('underfoot.save3'), meta: localStorage.getItem('underfoot.meta3') };
    if (local.save) return local;
    const db = await new Promise((ok, fail) => {
      const r = indexedDB.open('underfoot', 1);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    const all = await new Promise((ok, fail) => {
      const r = db.transaction('slots').objectStore('slots').getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    all.sort((a, b) => b.savedAt - a.savedAt);
    if (!all[0]) return { save: null, meta: null };
    const { blob, id: _id, colony: _c, queen: _q, ...meta } = all[0];
    return { save: blob, meta: JSON.stringify(meta) };
  });
  await g.close();
  if (!data.save) throw new Error('the colony did not save');
  writeFileSync(file, JSON.stringify({ seed: f.seed, ...data }));
  return file;
}

export async function openColony({ dir, fixture = 'big', url = 'http://127.0.0.1:5173/', width = 1440, height = 900 } = {}) {
  const fx = JSON.parse(readFileSync(await makeFixture(fixture, url), 'utf8'));
  const g = await openGame({ dir, seed: fx.seed, url, width, height });
  await g.page.evaluate((fx) => {
    localStorage.setItem('underfoot.save3', fx.save);
    localStorage.setItem('underfoot.meta3', fx.meta);
  }, fx);
  await g.page.goto(`${url}?seed=${fx.seed}`, { waitUntil: 'load' });
  await g.page.waitForFunction(() => !!window.game, null, { timeout: 15000 });
  await g.page.waitForTimeout(500);
  await g.page.click('#resume');
  await g.page.waitForTimeout(2500);
  await g.pause();
  g.timeOfDay = async (t) => {
    const dayT = await g.page.evaluate(() => window.game.sim.dayT);
    await g.skip((((t - dayT) % 1) + 1) % 1 * 6);
    await g.pause();
  };
  g.layout = () =>
    g.page.evaluate(() => {
      const s = window.game.sim;
      const w = s.world;
      return {
        worldW: w.w,
        worldH: w.h,
        chambers: s.nest.chambers.map((c) => ({ kind: c.kind, x: Math.round(c.cx), floorY: c.floorY, ground: w.ground[Math.round(c.cx)], seeds: c.seeds })),
      };
    });
  return g;
}

// ------------------------------------------------------------- reference shots

/** name, fixture, time of day, zoom, anchor room, dx, dy (from its floor; from the ground for 'queen'). */
const SHOTS = [
  ['dusk-nest-z8', 'meadow', 0.74, 8, 'queen', 0, 20],
  ['dusk-entrance-z11', 'meadow', 0.74, 11, 'queen', 10, -4],
  ['granary-z14', 'big', 0.5, 14, 'granary', -6, -4],
  ['surface-z13', 'big', 0.5, 13, 'queen', -30, -10],
  ['nest-z5', 'big', 0.5, 5, 'queen', 10, 30],
  ['night-z12', 'big', 0.97, 12, 'granary', -6, -4],
  ['whole-slice', 'big', 0.5, 0, '', 0, 0],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => (process.argv.indexOf(k) > 0 ? process.argv[process.argv.indexOf(k) + 1] : d);
  const url = arg('--url', 'http://127.0.0.1:5173/');
  const tag = arg('--tag', '');
  const dir = join(ROOT, 'shots/art');
  for (const fixture of ['meadow', 'big']) {
    for (const tod of [...new Set(SHOTS.filter((p) => p[1] === fixture).map((p) => p[2]))]) {
      const g = await openColony({ dir, fixture, url });
      await g.timeOfDay(tod);
      const L = await g.layout();
      for (const [name, , t, zoom, anchor, dx, dy] of SHOTS) {
        if (t !== tod || SHOTS.find((s) => s[0] === name)[1] !== fixture) continue;
        if (!zoom) {
          await g.fit();
        } else {
          const c = anchor === 'granary' ? L.chambers.filter((c) => c.kind === 'granary').sort((a, b) => b.seeds - a.seeds)[0] : L.chambers.find((c) => c.kind === anchor);
          await g.look(zoom, c.x + dx, (anchor === 'queen' ? c.ground : c.floorY) + dy);
        }
        // Let the lens draw all its tiles (it spreads the work over a few frames).
        await g.page.waitForTimeout(1500);
        console.log(await g.shot(tag ? `${name}-${tag}` : name, { hideUi: true }));
      }
      if (g.errors.length) console.log(g.errors);
      await g.close();
    }
  }
}
