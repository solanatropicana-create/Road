// Grow a colony, start a storm, screenshot during it. node scripts/stormshot.mjs <name> <seed> <growTicks> <stormTicks> [zoom cx cy]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [name, seed = '3', grow = '45000', storm = '1200', zoom = '', cx = '', cy = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5173/?seed=${seed}&paused=1`, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.evaluate(({ seed, grow, storm }) => {
  const g = window.game;
  g.advance((Number(seed) * 37) % 90);
  g.sim.found(320);
  g.sim.weather.next = 1e12;
  g.advance(Number(grow));
  g.sim.startRain(true);
  g.advance(Number(storm));
}, { seed, grow, storm });
if (zoom) await page.evaluate(({ zoom, cx, cy }) => { const c = window.game.cam; c.tzoom = c.zoom = Number(zoom); c.tx = c.x = Number(cx); c.ty = c.y = Number(cy); }, { zoom, cx, cy });
await page.waitForTimeout(500);
await page.screenshot({ path: `shots/${name}.png` });
console.log(name, errors.length ? errors.join(' | ') : 'ok');
await browser.close();
