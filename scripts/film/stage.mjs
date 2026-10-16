/**
 * Film stage: records the real game frame by frame for trailers.
 *
 * The game's own loop is stopped; each frame the script steps the sim a set
 * number of ticks, places the camera, renders once and grabs the screen, so
 * every frame is complete (the macro lens draws all its tiles) and motion is
 * smooth however slow the machine is. Frames go straight into ffmpeg.
 *
 *   import { openStage } from './stage.mjs';
 *   const st = await openStage({ width: 1920, height: 1080, fixture: 'big' });
 *   await st.timeOfDay(0.7);
 *   await st.take('wide', { seconds: 6, cam: [{ x: 640, y: 300, zoom: 2 }, { x: 640, y: 300, zoom: 2.4 }] });
 *   await st.close();
 *
 * Needs the dev server (npm run dev) or a preview build.
 */
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const FPS = 30;

/** 0..1 → 0..1, slow in and out. */
export const easeInOut = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const linear = (t) => t;

/**
 * Camera keyframes → camera at time u (0..1 of the shot). Each key may carry
 * `at` (0..1, default spread evenly) and `ease` (for the stretch leading to it).
 * Zoom moves in log space, so a push-in feels even.
 */
export function camAt(keys, u) {
  if (!Array.isArray(keys)) return keys;
  if (keys.length === 1) return keys[0];
  const at = keys.map((k, i) => k.at ?? i / (keys.length - 1));
  let i = 1;
  while (i < keys.length - 1 && u > at[i]) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const span = at[i] - at[i - 1] || 1;
  const e = (b.ease ?? easeInOut)(Math.max(0, Math.min(1, (u - at[i - 1]) / span)));
  const out = {};
  for (const k of Object.keys(b)) {
    if (k === 'at' || k === 'ease') continue;
    const va = a[k] ?? b[k];
    const vb = b[k];
    if (typeof vb !== 'number') out[k] = vb;
    else if (k === 'zoom') out[k] = Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * e);
    else out[k] = va + (vb - va) * e;
  }
  return out;
}

/**
 * Pick an ant for the camera to follow (runs in the page: pass it to subject()).
 * kind.who: queen | seed (carrying one outside) | seedIn | soil | out | major | nurse | any;
 * kind.range: within so many mm of the door; kind.near: the one nearest this point.
 */
export const pickAnt = (g, kind) => {
  const c = g.sim.colony;
  const w = g.sim.world;
  const under = (a) => w.bg[a.y * w.w + a.x] === 1;
  const near = (a) => Math.abs(a.x - g.sim.nest.foundX) < (kind.range ?? 9999);
  const ok = (a) => a.alive && !a.away && near(a);
  let xs = [];
  if (kind.who === 'queen') return c.queen;
  if (kind.who === 'seed') xs = c.ants.filter((a) => ok(a) && a.carry === 2 && !under(a));
  if (kind.who === 'seedIn') xs = c.ants.filter((a) => ok(a) && a.carry === 2 && under(a));
  if (kind.who === 'soil') xs = c.ants.filter((a) => ok(a) && a.carry === 1 && under(a));
  if (kind.who === 'out') xs = c.ants.filter((a) => ok(a) && !under(a));
  if (kind.who === 'major') xs = c.ants.filter((a) => ok(a) && a.caste === 'soldier');
  if (kind.who === 'nurse') xs = c.ants.filter((a) => ok(a) && a.task === 3 && under(a));
  if (kind.who === 'any') xs = c.ants.filter(ok);
  // The one nearest a point, or the first.
  if (kind.near) xs.sort((a, b) => Math.hypot(a.x - kind.near.x, a.y - kind.near.y) - Math.hypot(b.x - kind.near.x, b.y - kind.near.y));
  return xs[0] ?? null;
};

/** The in-page half: runs one frame at a time in place of the game's loop. */
function install() {
  const g = window.game;
  // Stop the game's own animation loop (its next frame finds this and does nothing).
  g.frame = () => {};
  document.getElementById('ui').style.display = 'none';
  // Offline there is no hurry: let the macro lens draw every stale tile each frame.
  const lensProto = Object.getPrototypeOf(g.renderer.lens);
  if (!lensProto.__film) {
    const draw = lensProto.draw;
    lensProto.draw = function (ctx, buf, vr, z, f, alpha, _budget, slice) {
      return draw.call(this, ctx, buf, vr, z, f, alpha, 1e9, slice);
    };
    lensProto.__film = true;
  }
  const film = {
    subject: null,
    fx: 0,
    fy: 0,
    started: false,
    /**
     * One frame: `ticks` sim steps, then the camera (`cam`: x, y, zoom, and
     * `follow` 0..1 to lean on the subject, with `dx`, `dy` offsets and
     * `lag` seconds of smoothing), then a render. `auto` leaves the camera
     * to the game (the landing and the founding montage drive it themselves).
     */
    frame({ dt, ticks, cam, auto, vis }) {
      const g = window.game;
      if (ticks === 'auto') ticks = g.cine.montage ? Math.round(dt * 30 * 150) : Math.round(dt * 30);
      for (let k = 0; k < ticks; k++) g.sim.step();
      g.cine.update(dt);
      g.renderer.setFlight(g.cine.queenInFlight(), g.cine.swarm);
      const c = g.cam;
      if (auto) {
        if (g.director.active && !g.cine.busy && !g.cine.montage) g.director.update(dt);
        c.update(dt);
      } else if (cam) {
        let x = cam.x;
        let y = cam.y;
        // The queen in her nuptial flight is not an ant yet: follow the landing's path.
        const fl = cam.flight ? g.cine.queenInFlight() : null;
        const s = fl ?? film.subject;
        if (s && cam.follow) {
          const tx = s.x + 0.5 + (cam.dx ?? 0);
          const ty = s.y + 0.5 + (cam.dy ?? 0);
          if (!film.started) {
            film.fx = tx;
            film.fy = ty;
          }
          const k = 1 - Math.exp(-dt / Math.max(0.01, cam.lag ?? 0.6));
          film.fx += (tx - film.fx) * k;
          film.fy += (ty - film.fy) * k;
          x = x === undefined ? film.fx : x + (film.fx - x) * cam.follow;
          y = y === undefined ? film.fy : y + (film.fy - y) * cam.follow;
        }
        film.started = true;
        c.follow = null;
        // Never wider than the slice itself (past that the frame shows sky colour above and below).
        c.tzoom = c.zoom = Math.max(cam.zoom, c.fitZoom());
        c.tx = c.x = x;
        c.ty = c.y = y;
        c.update(0);
      }
      g.renderer.render(g.sim, c, dt, vis ?? Math.max(0.25, ticks / (dt * 30)), null);
      g.ui.update(dt);
      return { x: c.x, y: c.y, zoom: c.zoom, sx: film.subject?.x, sy: film.subject?.y, alive: film.subject ? film.subject.alive : null };
    },
  };
  window.film = film;
}

export async function openStage({
  width = 1920,
  height = 1080,
  url = 'http://127.0.0.1:5173/',
  fixture,
  seed = 3,
  site,
  out = join(ROOT, 'shots/film/clips'),
  lang = 'en',
} = {}) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const q = (s) => `${url}?seed=${s}${site ? `&site=${site}` : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  if (fixture) {
    const file = join(ROOT, 'shots/fixtures', `${fixture}.json`);
    if (!existsSync(file)) throw new Error(`no fixture ${file}: run scripts/artlab.mjs once to make it`);
    const fx = JSON.parse(readFileSync(file, 'utf8'));
    seed = fx.seed;
    await page.evaluate((fx) => {
      localStorage.clear();
      localStorage.setItem('underfoot.save3', fx.save);
      localStorage.setItem('underfoot.meta3', fx.meta);
    }, fx);
    await page.goto(q(seed), { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.click('#resume');
    await page.waitForFunction(() => window.game.sim.phase === 'growing', null, { timeout: 20000 });
  } else {
    await page.evaluate(() => localStorage.clear());
    await page.goto(q(seed), { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 15000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.evaluate(install);

  const st = {
    page,
    errors,
    width,
    height,
    /** Run code in the page with the game as `g` (a function (g, arg) => …). */
    run: (fn, arg) => page.evaluate(([src, arg]) => new Function('g', 'arg', `return (${src})(g, arg)`)(window.game, arg), [fn.toString(), arg]),
    /** Step the sim without rendering. */
    advance: (ticks) => page.evaluate((n) => window.game.advance(n), ticks),
    /** Run on to a time of day (0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk). */
    async timeOfDay(t) {
      await page.evaluate((t) => {
        const g = window.game;
        const day = 30 * 60 * 6;
        g.advance(Math.round(((((t - g.sim.dayT) % 1) + 1) % 1) * day));
      }, t);
    },
    /** Pick the subject the camera can lean on (a function (g, arg) => ant). Returns its position. */
    async subject(fn, arg) {
      return page.evaluate(([src, arg]) => {
        const a = new Function('g', 'arg', `return (${src})(g, arg)`)(window.game, arg);
        window.film.subject = a ?? null;
        window.film.started = false;
        return a ? { x: a.x, y: a.y, name: a.name } : null;
      }, [fn.toString(), arg]);
    },
    /** Render frames without recording (lets the lens and painter settle after a cut). */
    async preroll(n = 8, cam, ticks = 1) {
      for (let k = 0; k < n; k++) await page.evaluate((a) => window.film.frame(a), { dt: 1 / FPS, ticks, cam: cam && camAt(cam, 0), auto: !cam });
    },
    /**
     * Record a shot to <out>/<name>.mp4. `cam` is a list of keyframes (see camAt)
     * or null to let the game drive; `ticks` sim steps per frame (a number, a
     * function of u, or 'auto'); `until` an optional in-page stop condition.
     */
    async take(name, { seconds = 5, cam = null, ticks = 1, preroll = 10, every, until, vis, fps = FPS } = {}) {
      const frames = Math.round(seconds * fps);
      const file = join(out, `${name}.mp4`);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
      const tickAt = (u) => (typeof ticks === 'function' ? ticks(u) : ticks);
      if (preroll) await st.preroll(preroll, cam, 0);
      const t0 = Date.now();
      let last;
      let n = 0;
      for (let f = 0; f < frames; f++) {
        const u = frames > 1 ? f / (frames - 1) : 0;
        last = await page.evaluate((a) => window.film.frame(a), { dt: 1 / FPS, ticks: tickAt(u), cam: cam && camAt(cam, u), auto: !cam, vis });
        if (every) await st.run(every, { u, f });
        const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        n++;
        if (until && (await st.run(until, { u, f }))) break;
      }
      ff.stdin.end();
      await done;
      console.log(`${name}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${file}`);
      return { file, last, frames: n };
    },
    /** One still (PNG) of the current view, for checking a framing. */
    async still(path, cam, ticks = 0) {
      if (cam) await st.preroll(3, cam, ticks);
      await page.screenshot({ path });
      return path;
    },
    close: () => browser.close(),
  };
  return st;
}
