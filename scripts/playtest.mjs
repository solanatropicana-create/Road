/**
 * Play-testing harness: drives the real game in a headless browser so a tester
 * (human or agent) can play it from a script and look at screenshots.
 *
 *   import { openGame } from '/home/user/Road/scripts/playtest.mjs';
 *   const g = await openGame({ dir: '/tmp/my-run', seed: 12 });
 *   await g.shot('landing');            // -> /tmp/my-run/landing.png (Read it to see it)
 *   await g.land();                     // "Let her choose"; or g.land(250) to land at x = 250 mm
 *   await g.skip(10);                   // fast-forward 10 in-game minutes (instant-ish)
 *   console.log(await g.state());       // colony numbers, chambers, journal
 *   await g.close();
 *
 * Needs a server: `npx vite preview --port 4173` (release build) or `npm run dev` (port 5173).
 */
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const TASKS = ['idle', 'dig', 'forage', 'nurse', 'clean', 'founding'];
const TICKS_PER_GAME_MINUTE = 30 * 60; // the sim runs 30 ticks per second; 1 "game minute" here = 1 real minute at 1x
const DAY_MINUTES = 6; // one in-game day lasts 6 minutes at 1x

export async function openGame({
  dir,
  seed = Math.floor(Math.random() * 1e6),
  url = 'http://127.0.0.1:4173/',
  width = 1440,
  height = 900,
  mobile = false,
  freshStorage = true,
} = {}) {
  if (!dir) throw new Error('openGame needs { dir } for screenshots');
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width, height } },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const go = async () => {
    await page.goto(`${url}?seed=${seed}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 15000 });
    await page.waitForTimeout(600);
  };
  if (freshStorage) {
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    });
  }
  await go();

  const toScreen = (wx, wy) => page.evaluate(([x, y]) => window.game.cam.toScreen(x, y), [wx, wy]);
  let shotCount = 0;

  const g = {
    page,
    seed,
    dir,
    /** Console errors and uncaught exceptions seen so far. */
    errors,

    /** Screenshot of the whole screen (or { hideUi: true } for a clean frame). Returns the file path. */
    async shot(name = `shot${++shotCount}`, { hideUi = false, clip } = {}) {
      if (hideUi) await page.evaluate(() => (document.getElementById('ui').style.visibility = 'hidden'));
      await page.waitForTimeout(250);
      const path = join(dir, `${name}.png`);
      await page.screenshot({ path, clip });
      if (hideUi) await page.evaluate(() => (document.getElementById('ui').style.visibility = ''));
      return path;
    },

    /** Several screenshots in real time, `everyMs` apart (to see motion), plus a contact sheet. */
    async burst(name, count = 6, everyMs = 500) {
      const paths = [];
      for (let k = 0; k < count; k++) {
        paths.push(await g.shot(`${name}_${k}`));
        await page.waitForTimeout(everyMs);
      }
      return { frames: paths, sheet: g.sheet(paths, `${name}_sheet`) };
    },

    /** Combine images into one contact sheet (2 columns). Returns its path. */
    sheet(paths, name, cols = 2) {
      const out = join(dir, `${name}.png`);
      const py = `
import sys
from PIL import Image
paths=sys.argv[2:]; out=sys.argv[1]; cols=${cols}
ims=[Image.open(p) for p in paths]
w=800; h=int(ims[0].height*w/ims[0].width)
rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(w*cols,h*rows))
for k,im in enumerate(ims): s.paste(im.convert('RGB').resize((w,h)),((k%cols)*w,(k//cols)*h))
s.save(out)`;
      execFileSync('python3', ['-c', py, out, ...paths]);
      return out;
    },

    /** Colony numbers, chambers, weather, the player's settings and the last journal entries. */
    state: () =>
      page.evaluate(
        ({ TASKS }) => {
          const g = window.game;
          const s = g.sim;
          const c = s.colony;
          const w = s.world;
          const [eggs, larvae, pupae] = c.broodCounts();
          const mins = Math.floor(s.dayT * 1440);
          const tasks = {};
          for (const a of c.ants) tasks[TASKS[a.task]] = (tasks[TASKS[a.task]] ?? 0) + 1;
          const journal = g.ui.journalData().entries.slice(-10).map((e) => `${e.at} ${e.html.replace(/<[^>]+>/g, '')}`);
          return {
            phase: s.phase,
            day: s.day,
            clock: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
            weather: s.weather.rain > 0.15 ? (s.weather.storm ? 'storm' : 'rain') : 'clear',
            speed: g.paused ? 'paused' : `${g.speed}x`,
            workers: c.adults,
            majors: c.majors,
            brood: { eggs, larvae, pupae },
            seedsInGranaries: c.stored,
            foodInCrops: c.reserve,
            starving: c.starving,
            tasks,
            deaths: c.deaths,
            queenAlive: !!c.queen?.alive,
            chambers: s.nest.chambers.map((ch) => ({
              kind: ch.kind,
              ready: ch.ready,
              seeds: ch.seeds,
              depthCm: +((ch.floorY - w.ground[Math.round(ch.cx)]) / 10).toFixed(1),
              x: Math.round(ch.cx),
            })),
            nestAreaCm2: +(s.nest.openCells / 100).toFixed(1),
            settings: { priorities: { ...c.prio }, breeding: ['low', 'normal', 'high'][c.breeding], majorsPercent: Math.round(c.majorShare * 100), queuedOrders: [...c.orders] },
            journal,
          };
        },
        { TASKS },
      ),

    /** Text of the toasts currently on screen. */
    toasts: () => page.$$eval('#toasts .toast', (ts) => ts.map((t) => t.textContent)),

    /** Land the queen: no argument = "Let her choose"; a number = world x in mm (0..640). */
    async land(x) {
      if (x === undefined) {
        await page.click('#anywhere');
      } else {
        const gy = await page.evaluate((x) => window.game.sim.world.ground[Math.round(x)], x);
        const p = await toScreen(x, gy);
        await page.mouse.move(p.x, p.y);
        await page.waitForTimeout(300);
        await page.mouse.click(p.x, p.y);
      }
      await page.waitForTimeout(400);
      const phase = await page.evaluate(() => window.game.sim.phase);
      if (phase === 'choose') throw new Error('land(): the click did not land the queen (something covered that spot?)');
    },

    /** Speed: 1..5 = 1x, 2x, 4x, 8x, 16x (same as pressing the number keys). */
    async speed(n) {
      await page.keyboard.press(String(n));
    },
    async pause() {
      await page.evaluate(() => (window.game.paused = true));
    },
    async resume() {
      await page.evaluate(() => (window.game.paused = false));
    },

    /** Let the game run in real time for `seconds` at its current speed (what a player sees). */
    async realtime(seconds) {
      await page.waitForTimeout(seconds * 1000);
    },

    /**
     * Fast-forward `minutes` of game time at once (1 game minute = 1 real minute at 1x;
     * one in-game day = 6 minutes). The UI catches up on the next frame.
     */
    async skip(minutes) {
      const chunks = Math.ceil(minutes);
      for (let k = 0; k < chunks; k++) {
        const ticks = Math.round(Math.min(1, minutes - k) * TICKS_PER_GAME_MINUTE);
        await page.evaluate((n) => window.game.advance(n), ticks);
      }
      await page.waitForTimeout(400);
    },
    /** Fast-forward whole in-game days. */
    skipDays: (days) => g.skip(days * DAY_MINUTES),

    /** Press a key (e.g. 'c', 'p', 't', 'h', '?', 'f', 'Escape', ' '). */
    key: (k) => page.keyboard.press(k),
    /** Click a CSS selector (e.g. '#storm', '[data-order="granary"]', '#watch'). */
    click: (sel) => page.click(sel),
    /** Click at a world point (mm). */
    async clickWorld(wx, wy) {
      const p = await toScreen(wx, wy);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(250);
    },
    /** Hover a world point (shows chamber tooltips). */
    async hoverWorld(wx, wy) {
      const p = await toScreen(wx, wy);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(300);
    },
    /** Point the camera: zoom (1 = whole slice-ish, 4 = nest, 8-14 = macro) centred on world mm. */
    async look(zoom, wx, wy) {
      await page.evaluate(
        ([z, x, y]) => {
          const g = window.game;
          if (g.director.active) g.director.stop();
          g.selected = null;
          const c = g.cam;
          c.follow = null;
          c.tzoom = c.zoom = z;
          c.tx = c.x = x;
          c.ty = c.y = y;
        },
        [zoom, wx, wy],
      );
      await page.waitForTimeout(300);
    },
    /** Whole slice. */
    fit: () => page.keyboard.press('f'),

    /** Follow an ant: 'queen' | 'forager' | 'digger' | 'nurse' | 'cleaner' | 'major' | 'carrier'. Returns who. */
    async follow(kind = 'forager', zoom = 9) {
      const who = await page.evaluate(
        ([kind, zoom]) => {
          const g = window.game;
          const c = g.sim.colony;
          const w = g.sim.world;
          const under = (a) => w.bg[a.y * w.w + a.x] === 1;
          const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
          let a = null;
          if (kind === 'queen') a = c.queen;
          else if (kind === 'major') a = pick(c.ants.filter((a) => a.caste === 'soldier'));
          else if (kind === 'carrier') a = pick(c.ants.filter((a) => a.carry !== 0));
          else {
            const t = { digger: 1, forager: 2, nurse: 3, cleaner: 4 }[kind];
            a = pick(c.ants.filter((a) => a.task === t && (kind !== 'forager' || !under(a))) ) ?? pick(c.ants.filter((a) => a.task === t));
          }
          if (!a) return null;
          if (g.director.active) g.director.stop();
          g.selected = a;
          g.cam.tzoom = zoom;
          return { name: a.name, caste: a.caste, x: a.x, y: a.y };
        },
        [kind, zoom],
      );
      await page.waitForTimeout(700);
      return who;
    },

    /** Colony brain: work priority. work = 'dig'|'forage'|'nurse'|'clean'; level 0 Off, 1 Low, 2 Normal, 3 High. */
    setPriority: (work, level) => page.click(`#work [data-k="${work}:${level}"]`),
    /** Queen breeding: 0 Low, 1 Normal, 2 High. */
    setBreeding: (i) => page.click(`#breed button:nth-child(${i + 1})`),
    /** Majors slider, 0..35 (% of brood raised as majors). */
    setMajors: (pct) =>
      page.$eval('#majors', (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, pct),
    /** Order a room: 'nursery' | 'granary' | 'rest'. */
    order: (kind) => page.click(`[data-order="${kind}"]`),
    digDeeper: () => page.click('#deeper'),
    /** "Mark where to grow", then click the world point. */
    async mark(wx, wy) {
      await page.click('#mark');
      await g.clickWorld(wx, wy);
    },
    rain: () => page.click('#rain'),
    storm: () => page.click('#storm'),

    /** Reload the page (the colony autosaves; use continueColony() after). */
    async reload() {
      await page.evaluate(() => window.game.save());
      await go();
    },
    async continueColony() {
      await page.click('#resume');
      await page.waitForTimeout(2500);
    },

    async close() {
      await browser.close();
    },
  };
  return g;
}
