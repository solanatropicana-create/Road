// Curated screenshots for the docs (panels hidden). Needs the dev server: node scripts/beauty.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5173/?seed=8&paused=1', { waitUntil: 'load' });
await page.waitForTimeout(800);
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/beauty_${name}.png` });
  console.log('shot', name);
};
// Advance to a time of day (0..1) on the next suitable day.
const until = (t) => page.evaluate((t) => {
  const g = window.game;
  const day = 30 * 60 * 6;
  const now = g.sim.dayT;
  g.advance(Math.round((((t - now) % 1) + 1) % 1 * day));
}, t);
const look = (x, y, zoom) => page.evaluate(({ x, y, zoom }) => {
  const c = window.game.cam;
  c.tzoom = c.zoom = zoom || c.fitZoom();
  c.tx = c.x = x;
  c.ty = c.y = y;
}, { x, y, zoom });
await page.evaluate(() => {
  const g = window.game;
  g.paused = true;
  g.sim.found(300);
  g.sim.weather.next = 1e12;
  g.advance(30 * 60 * 30);
  document.getElementById('ui').style.display = 'none';
});
// Golden hour over the whole slice.
await until(0.71);
await page.evaluate(() => { const g = window.game; g.cam.fit(); g.cam.zoom = g.cam.tzoom; });
await shot('hero');
// A forager carrying a seed home, close up.
await until(0.6);
const f = await page.evaluate(() => {
  const g = window.game;
  const w = g.sim.world;
  const a = g.sim.colony.ants.find((a) => a.carry === 2 && w.bg[a.y * w.w + a.x] === 0) ?? g.sim.colony.ants.find((a) => w.bg[a.y * w.w + a.x] === 0);
  return { x: a.x, y: a.y };
});
await look(f.x, f.y - 3, 12);
await shot('macro');
// The fullest granary.
const gr = await page.evaluate(() => {
  const g = window.game.sim.nest.chambers.filter((c) => c.kind === 'granary').sort((a, b) => b.seeds - a.seeds)[0];
  return { x: g.cx, y: g.floorY - 4 };
});
await look(gr.x, gr.y, 11);
await shot('granary');
// Night: the red observation lamp over the nest.
await until(0.97);
const nest = await page.evaluate(() => {
  const cs = window.game.sim.nest.chambers;
  return { x: cs.reduce((s, c) => s + c.cx, 0) / cs.length, y: cs.reduce((s, c) => s + c.cy, 0) / cs.length - 12 };
});
await look(nest.x, nest.y, 4.2);
await shot('night');
// Storm over the crater.
await until(0.5);
await page.evaluate(() => { const g = window.game; g.sim.startRain(true); g.advance(500); });
await look(nest.x, 70, 5);
await shot('storm');
await browser.close();
