/**
 * Title cards for the trailer, drawn by the browser in the game's own type
 * (Fraunces, IBM Plex Mono) as transparent PNGs the edit lays over the
 * picture.
 *
 *   import { renderCards } from './titles.mjs';
 *   await renderCards([{ id: 'c1', kind: 'line', text: '…' }], { width: 1920, height: 1080, dir });
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

// The ant of the game's logo (src/ui/icons.ts).
const ANT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round">
  <ellipse cx="3.3" cy="7.2" rx="1.9" ry="1.6" fill="currentColor" stroke="none"/>
  <path d="M1.6 6.1 0.6 4.6M2.3 5.8 1.9 4.1" stroke-width="0.9"/>
  <ellipse cx="6.6" cy="7.6" rx="1.7" ry="1.05" fill="currentColor" stroke="none"/>
  <circle cx="8.7" cy="8" r="0.65" fill="currentColor" stroke="none"/>
  <circle cx="9.9" cy="7.9" r="0.7" fill="currentColor" stroke="none"/>
  <ellipse cx="12.6" cy="7.6" rx="2.6" ry="2" fill="currentColor" stroke="none"/>
  <path d="M5.6 8.4 4.2 11.2M6.6 8.6 6.8 11.6M7.5 8.4 9.2 11.2" stroke-width="0.8"/></svg>`;

const css = (tall) => `
  :root { --ink: #efe6d6; --dim: rgba(239,230,214,0.82); --faint: rgba(239,230,214,0.66); --accent: #e2b45c; }
  html, body { margin: 0; background: transparent; }
  body { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', Georgia, serif; color: var(--ink); }
  .card { text-align: center; max-width: ${tall ? '86vw' : '70vw'}; }
  .shade { position: fixed; inset: 0; background: radial-gradient(ellipse ${tall ? '90% 34%' : '62% 30%'} at 50% 50%, rgba(8,6,4,0.46), rgba(8,6,4,0) 100%); }
  .line { position: relative; font-style: italic; font-weight: 400; font-size: ${tall ? 66 : 54}px; line-height: 1.22; letter-spacing: -0.005em;
    text-shadow: 0 2px 18px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.5); }
  .line i { font-style: normal; }
  .word { position: relative; font-weight: 600; font-size: ${tall ? 120 : 104}px; letter-spacing: -0.01em; text-shadow: 0 3px 28px rgba(0,0,0,0.8); }
  .title { position: relative; }
  .title .ant { width: ${tall ? 120 : 96}px; height: ${tall ? 120 : 96}px; color: var(--accent); margin: 0 auto 6px; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.6)); }
  .title h1 { margin: 0; font-weight: 600; font-size: ${tall ? 168 : 150}px; line-height: 1; letter-spacing: -0.015em; text-shadow: 0 3px 34px rgba(0,0,0,0.75); }
  .title .tag { margin-top: 18px; font-style: italic; font-size: ${tall ? 46 : 38}px; line-height: 1.25; color: var(--dim); text-shadow: 0 2px 16px rgba(0,0,0,0.8); }
  .title .cta { margin-top: 34px; display: inline-block; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: ${tall ? 30 : 24}px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); border: 1.5px solid rgba(226,180,92,0.7); border-radius: 4px; padding: 12px 22px; text-shadow: 0 1px 10px rgba(0,0,0,0.8); background: rgba(10,8,6,0.35); }
`;

/** A card: kind (line | word | title) and its text; the title also takes name, tagline and an optional cta. */
function html(card, tall) {
  let body = '';
  if (card.kind === 'line') body = `<div class="shade"></div><div class="card line">${card.text}</div>`;
  else if (card.kind === 'word') body = `<div class="shade"></div><div class="card word">${card.text}</div>`;
  else if (card.kind === 'title')
    body = `<div class="shade" style="background: radial-gradient(ellipse ${tall ? '95% 40%' : '60% 46%'} at 50% 52%, rgba(8,6,4,0.62), rgba(8,6,4,0) 100%)"></div>
      <div class="card title"><div class="ant">${ANT}</div><h1>${card.name}</h1><div class="tag">${card.tagline}</div>${card.cta ? `<div class="cta">${card.cta}</div>` : ''}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>${css(tall)}</style></head><body>${body}</body></html>`;
}

/** Render each card to <dir>/<id>.png (transparent). Returns { id: path }. */
export async function renderCards(cards, { width, height, dir }) {
  mkdirSync(dir, { recursive: true });
  const tall = height > width;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const out = {};
  for (const card of cards) {
    await page.setContent(html(card, tall), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const path = join(dir, `${card.id}.png`);
    await page.screenshot({ path, omitBackground: true });
    out[card.id] = path;
  }
  await browser.close();
  return out;
}
