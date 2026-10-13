/**
 * Watch test: sits in front of the game at 1x the way a viewer does and
 * counts what spoils the watching. Real time, no fast-forward while measuring.
 *
 *   node scripts/watchtest.mjs [outDir] [seconds per stage] [url]
 *
 * Stages: the founding queen digging, the first workers, and an older colony
 * (a year on, fast-forwarded to, then watched at 1x). Per stage it reports:
 *   - teleports: loads that vanish or appear with nobody carrying them
 *     (spoil the queen puts on the surface, spoil "set down off the slice");
 *   - carcass pops: a carcass changing size in a jump;
 *   - stuck ants: not moved 4 mm in 60 s while not resting;
 *   - quiet stretches: longest time with no journal note and no toast;
 *   - frame screenshots every 10 s, for a person to look through.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [out = 'shots/watchtest', secs = '90', url = 'http://127.0.0.1:5173/'] = process.argv.slice(2);
const SECS = Number(secs);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${url}?seed=777`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game, null, { timeout: 20000 });
await page.waitForTimeout(800);

// Instruments, installed once: counters the game updates as it runs.
await page.evaluate(() => {
  const g = window.game;
  const m = (window.__watch = { spoilTeleport: 0, offSlice: 0, carcassPops: 0, notes: [], lastNote: performance.now() });
  const sim = () => g.sim;
  const wrap = (obj, name, fn) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => {
      fn(...a);
      return orig(...a);
    };
  };
  // Spoil that appears on the surface without an ant carrying it (the founding queen's).
  wrap(sim(), 'spoil', () => m.spoilTeleport++);
  // A load put down "off the slice" shows only as a puff of dust.
  wrap(sim(), 'dust', () => {
    const st = new Error().stack || '';
    if (st.includes('dump')) m.offSlice++;
  });
  // Journal notes and toasts.
  const ui = g.ui;
  if (ui && ui.note) wrap(ui, 'note', (k) => { m.notes.push([performance.now(), k]); m.lastNote = performance.now(); });
  if (ui && ui.toast) wrap(ui, 'toast', () => { m.lastNote = performance.now(); });
});

async function stage(name, seconds) {
  await page.evaluate(() => {
    const m = window.__watch;
    m.spoilTeleport = 0;
    m.offSlice = 0;
    m.carcassPops = 0;
    m.notes = [];
    m.lastNote = performance.now();
    m.quiet = 0;
    m.size = new Map();
    m.pos = new Map();
    m.stuck = new Set();
    window.game.paused = false;
  });
  await page.keyboard.press('1');
  const frames = [];
  for (let s = 0; s < seconds; s++) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const m = window.__watch;
      const sim = window.game.sim;
      const now = performance.now();
      m.quiet = Math.max(m.quiet, (now - m.lastNote) / 1000);
      for (const c of sim.carcasses.list) {
        const r = c.half ?? 0;
        const was = m.size.get(c);
        if (was !== undefined && Math.abs(r - was) > 0.6) m.carcassPops++;
        m.size.set(c, r);
      }
      for (const a of sim.colony.ants) {
        const p = m.pos.get(a.id);
        const resting = a.task === 0 && a.timer > 0;
        if (!p || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 4 || resting) m.pos.set(a.id, { x: a.x, y: a.y, t: now });
        else if (now - p.t > 60000) m.stuck.add(a.id);
      }
    });
    if (s % 10 === 0) {
      const f = join(out, `${name}-${String(s).padStart(3, '0')}.png`);
      await page.screenshot({ path: f });
      frames.push(f);
    }
  }
  const r = await page.evaluate(() => {
    const m = window.__watch;
    const sim = window.game.sim;
    return { spoilTeleport: m.spoilTeleport, offSlice: m.offSlice, carcassPops: m.carcassPops, stuck: m.stuck.size, quietLongest: Math.round(m.quiet), notes: m.notes.length, ants: sim.colony.ants.length, phase: sim.phase };
  });
  return { stage: name, ...r, frames };
}

const report = [];
// The landing (skipped with the mouse), then the queen digging at 1x.
await page.click('#title [data-mode="watch"]');
await page.waitForTimeout(500);
const sk = await page.$('#cineskip');
if (sk) {
  const b = await sk.boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
await page.waitForFunction(() => window.game.sim.phase !== 'choose', null, { timeout: 30000 });
report.push(await stage('founding', SECS));
// Through the montage to the first workers, then watch.
for (let k = 0; k < 160 && (await page.evaluate(() => window.game.sim.phase)) === 'founding'; k++) await page.evaluate(() => window.game.advance(900));
await page.evaluate(() => window.game.cine.montage && window.game.cine.skip());
await page.waitForTimeout(1500);
report.push(await stage('first-workers', SECS));
// A year on.
await page.evaluate(() => window.game.advance(30 * 360 * 26));
await page.waitForTimeout(1500);
report.push(await stage('a-year-on', SECS));

writeFileSync(join(out, 'report.json'), JSON.stringify({ report, errors }, null, 1));
for (const r of report) console.log(`${r.stage.padEnd(14)} ants ${String(r.ants).padStart(4)}  spoil teleported ${r.spoilTeleport}  set down off-slice ${r.offSlice}  carcass pops ${r.carcassPops}  stuck ${r.stuck}  longest quiet ${r.quietLongest}s  notes ${r.notes}`);
if (errors.length) console.log('errors:\n' + errors.join('\n'));
await browser.close();
