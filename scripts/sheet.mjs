/**
 * Screenshot the asset sheet from a running dev server (npm run dev).
 * node scripts/sheet.mjs <out.png> [only=a,b] [zooms=3,7,14]
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [out = 'shots/sheet.png', only = '', zooms = ''] = process.argv.slice(2);
const q = new URLSearchParams();
if (only) q.set('only', only);
if (zooms) q.set('zooms', zooms);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:5173/sheet.html?${q}`);
await page.waitForFunction(() => window.sheetReady, null, { timeout: 15000 });
await page.waitForTimeout(400);
const el = await page.$('canvas');
await el.screenshot({ path: out });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
