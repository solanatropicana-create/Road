// Close-up of the fullest granary. Usage: node scripts/granary.mjs <name> <seed> <ticks> [zoom]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [name = 'granary', seed = '2', ticks = '54000', zoom = '12'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://localhost:5173/?seed=${seed}&paused=1`, { waitUntil: 'load' });
await page.waitForTimeout(800);
const info = await page.evaluate(({ ticks, seed, zoom }) => {
  const g = window.game;
  g.paused = true;
  g.advance((Number(seed) * 37) % 90);
  g.sim.found(320);
  g.advance(Number(ticks));
  const gran = g.sim.nest.chambers.filter((c) => c.kind === 'granary').sort((a, b) => b.seeds - a.seeds)[0];
  const c = g.cam;
  c.tzoom = c.zoom = Number(zoom);
  c.tx = c.x = gran.cx;
  c.ty = c.y = gran.cy;
  return { seeds: gran.seeds, x: gran.cx, y: gran.cy };
}, { ticks, seed, zoom });
await page.waitForTimeout(500);
await page.screenshot({ path: `shots/${name}.png` });
console.log(name, JSON.stringify(info));
await browser.close();
