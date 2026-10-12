// Plays the game as a person would: lands the queen, runs at 16x for a while, screenshots.
// Usage: node scripts/play.mjs <name> <seed> <seconds>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [name = 'play', seed = '3', seconds = '40'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5173/?seed=${seed}`, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('#anywhere');
await page.keyboard.press('5');
await page.waitForTimeout(Number(seconds) * 1000);
await page.screenshot({ path: `shots/${name}.png` });
const s = await page.evaluate(() => ({ day: window.game.sim.day, ants: window.game.sim.colony.adults, tps: window.game.tps.toFixed(0) }));
console.log(name, JSON.stringify(s), errors.length ? errors.join(' | ') : 'no errors');
await browser.close();
