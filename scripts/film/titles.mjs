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
  :root { --ink: #efe6d6; --dim: rgba(239,230,214,0.84); --faint: rgba(239,230,214,0.66); --accent: #e2b45c; }
  html, body { margin: 0; background: transparent; }
  body { width: 100vw; height: 100vh; position: relative; overflow: hidden; font-family: 'Fraunces', Georgia, serif; color: var(--ink); }
  .card { position: absolute; left: 50%; transform: translate(-50%, -50%); text-align: center; width: ${tall ? '86vw' : '70vw'}; }
  .shade { position: absolute; inset: 0; }
  .line { font-style: italic; font-weight: 400; font-size: ${tall ? 66 : 54}px; line-height: 1.22; letter-spacing: -0.005em;
    text-shadow: 0 2px 18px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.5); }
  .line i { font-style: normal; }
  .hook { font-weight: 600; font-size: ${tall ? 82 : 64}px; line-height: 1.1; letter-spacing: -0.015em; text-shadow: 0 3px 26px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,0.6); }
  .word { font-weight: 600; font-size: ${tall ? 128 : 104}px; letter-spacing: -0.01em; text-shadow: 0 3px 28px rgba(0,0,0,0.8); }
  .feature .num { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: ${tall ? 42 : 28}px; letter-spacing: 0.18em; color: var(--accent);
    text-shadow: 0 1px 12px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8); display: inline-flex; align-items: center; gap: 22px; }
  .feature .num::before, .feature .num::after { content: ''; width: 70px; height: 3px; background: rgba(226,180,92,0.9); box-shadow: 0 1px 8px rgba(0,0,0,0.6); }
  .feature .text { margin-top: 14px; font-weight: 600; font-size: ${tall ? 70 : 54}px; line-height: 1.1; letter-spacing: -0.012em;
    text-shadow: 0 3px 24px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6); }
  .note { text-align: left; width: ${tall ? '84vw' : '50vw'}; box-sizing: border-box; padding: 22px 26px; border-left: 3px solid var(--accent); background: rgba(12,9,7,0.62); border-radius: 0 6px 6px 0; }
  .note .eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: ${tall ? 24 : 16}px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
  .note .text { margin-top: 10px; font-family: 'IBM Plex Mono', monospace; font-size: ${tall ? 32 : 22}px; line-height: 1.4; color: var(--ink); }
  .title .ant { width: ${tall ? 120 : 96}px; height: ${tall ? 120 : 96}px; color: var(--accent); margin: 0 auto 6px; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.6)); }
  .title h1 { margin: 0; font-weight: 600; font-size: ${tall ? 160 : 150}px; line-height: 1; letter-spacing: -0.015em; text-shadow: 0 3px 34px rgba(0,0,0,0.75); }
  .title .tag { margin: 22px auto 0; max-width: ${tall ? '78vw' : '60vw'}; font-style: italic; font-size: ${tall ? 50 : 38}px; line-height: 1.25; color: var(--dim); text-shadow: 0 2px 16px rgba(0,0,0,0.8); }
  .title .latin { margin-top: 22px; font-size: ${tall ? 34 : 24}px; font-style: italic; color: var(--faint); text-shadow: 0 1px 10px rgba(0,0,0,0.9); }
  .title .cta { margin-top: 38px; display: inline-block; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: ${tall ? 30 : 24}px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); border: 1.5px solid rgba(226,180,92,0.7); border-radius: 4px; padding: 12px 22px; text-shadow: 0 1px 10px rgba(0,0,0,0.8); background: rgba(10,8,6,0.35); }
`;

/**
 * A card: kind (line | hook | word | feature | note | title), its text, and
 * `pos`, how far down the frame its middle sits (%). On a phone the top and
 * bottom of the frame sit under the app's own buttons and captions, so the
 * reel keeps its words between about 15% and 70%.
 */
function html(card, tall) {
  const pos = card.pos ?? 50;
  const shade = (rx, ry, a) => `<div class="shade" style="background: radial-gradient(ellipse ${rx}% ${ry}% at 50% ${pos}%, rgba(8,6,4,${a}), rgba(8,6,4,0) 100%)"></div>`;
  const at = `style="top: ${pos}%"`;
  let body = '';
  if (card.kind === 'line') body = `${shade(tall ? 90 : 62, tall ? 16 : 30, 0.46)}<div class="card line" ${at}>${card.text}</div>`;
  else if (card.kind === 'hook') body = `${shade(tall ? 100 : 70, tall ? 20 : 34, 0.55)}<div class="card hook" ${at}>${card.text}</div>`;
  else if (card.kind === 'word') body = `${shade(tall ? 90 : 62, tall ? 14 : 30, 0.46)}<div class="card word" ${at}>${card.text}</div>`;
  else if (card.kind === 'feature')
    body = `${shade(tall ? 100 : 70, tall ? 15 : 30, 0.55)}<div class="card feature" ${at}><div class="num">${card.num}</div><div class="text">${card.text}</div></div>`;
  else if (card.kind === 'note') body = `<div class="card note" ${at}><div class="eyebrow">${card.eyebrow}</div><div class="text">${card.text}</div></div>`;
  else if (card.kind === 'title')
    body = `${shade(tall ? 100 : 60, tall ? 30 : 46, 0.62)}
      <div class="card title" ${at}><div class="ant">${ANT}</div><h1>${card.name}</h1><div class="tag">${card.tagline}</div>
      ${card.latin ? `<div class="latin">${card.latin}</div>` : ''}${card.cta ? `<div class="cta">${card.cta}</div>` : ''}</div>`;
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
