// Close-up of individual ants for judging the art. Usage: node scripts/closeup.mjs <name> <seed> <ticks> [zoom]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [name = 'close', seed = '3', ticks = '36000', zoom = '14'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://localhost:5173/?seed=${seed}&paused=1`, { waitUntil: 'load' });
await page.waitForTimeout(800);
const picks = await page.evaluate(({ ticks, seed }) => {
  const g = window.game;
  g.paused = true;
  g.advance((Number(seed) * 37) % 90);
  g.sim.found(320);
  g.advance(Number(ticks));
  const col = g.sim.colony;
  const w = g.sim.world;
  // A queen, a major, a forager on the surface, a worker in a tunnel carrying something.
  const out = [];
  if (col.queen) out.push(['queen', col.queen]);
  const maj = col.ants.find((a) => a.caste === 'soldier' && w.bg[a.y * w.w + a.x] === 1);
  if (maj) out.push(['major', maj]);
  const surf = col.ants.find((a) => a.caste === 'worker' && w.bg[a.y * w.w + a.x] === 0 && a.carry);
  if (surf) out.push(['surface', surf]);
  const carrier = col.ants.find((a) => a.caste === 'worker' && w.bg[a.y * w.w + a.x] === 1 && a.carry);
  if (carrier) out.push(['carrier', carrier]);
  window.__picks = out.map((p) => p[1]);
  return out.map((p) => p[0]);
}, { ticks, seed });
for (let k = 0; k < picks.length; k++) {
  await page.evaluate(({ k, zoom }) => {
    const g = window.game;
    const a = window.__picks[k];
    g.selected = a;
    const c = g.cam;
    c.tzoom = c.zoom = Number(zoom);
    c.tx = c.x = a.x;
    c.ty = c.y = a.y - 2;
  }, { k, zoom });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${name}_${picks[k]}.png`, clip: { x: 500, y: 300, width: 600, height: 300 } });
}
console.log(picks.join(' '));
await browser.close();
