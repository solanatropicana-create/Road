// Screenshots of the running game. Usage: node scripts/shot.mjs <name> <seed> <ticksAfterFound> [zoom] [cx] [cy] [found x]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [name = 'shot', seed = '7', ticks = '0', zoom = '', cx = '', cy = '', fx = '320', w = '1600', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:5173/?seed=${seed}&paused=1`, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.evaluate(({ ticks, fx, seed }) => {
  const g = window.game;
  g.paused = true;
  // Same burn-in as scripts/batch.ts, so states match the batch runs.
  g.advance((Number(seed) * 37) % 90);
  if (Number(ticks) >= 0 && fx !== 'none') g.sim.found(Number(fx));
  g.advance(Math.max(0, Number(ticks)));
}, { ticks, fx, seed });
if (zoom) {
  await page.evaluate(({ zoom, cx, cy }) => {
    const c = window.game.cam;
    c.tzoom = c.zoom = Number(zoom);
    c.tx = c.x = Number(cx);
    c.ty = c.y = Number(cy);
  }, { zoom, cx, cy });
}
await page.waitForTimeout(600);
await page.screenshot({ path: `shots/${name}.png` });
const stats = await page.evaluate(() => {
  const s = window.game.sim;
  return { phase: s.phase, ants: s.colony.adults, brood: s.colony.brood.length, food: s.colony.stored, tick: s.tick };
});
console.log(name, JSON.stringify(stats), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
