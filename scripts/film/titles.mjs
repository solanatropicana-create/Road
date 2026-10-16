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

/**
 * The 'clear' and 'notes' looks, made for a phone after the design review:
 * heavier italics, a feathered band behind each line instead of a vignette,
 * and each card placed where its shot has room (`pos`, % of the height).
 * 'notes' sets lines left, like a naturalist's notebook, under a gold mono label.
 */
const css2 = (tall, look) => `
  :root { --ink: #f3ebdd; --dim: rgba(243,235,221,0.86); --gold: #e8bb62; --scrim: 12,8,5; }
  html, body { margin: 0; background: transparent; }
  body { width: 100vw; height: 100vh; position: relative; overflow: hidden; font-family: 'Fraunces', Georgia, serif; color: var(--ink); }
  .card { position: absolute; transform: translateY(-50%); ${look === 'notes' ? `left: ${tall ? 88 : 140}px; width: ${tall ? 800 : 900}px; text-align: left;` : `left: 50%; transform: translate(-50%, -50%); width: ${tall ? '84vw' : '64vw'}; text-align: center;`} }
  .shadowed { text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 28px rgba(0,0,0,0.55); }
  .label { font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: ${tall ? 28 : 22}px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold);
    display: flex; align-items: center; gap: 16px; ${look === 'notes' ? '' : 'justify-content: center;'} margin-bottom: 18px; }
  .label::before { content: ''; width: 48px; height: 2px; background: var(--gold); }
  .line { font-style: italic; font-weight: 500; font-variation-settings: 'opsz' 36; font-size: ${tall ? (look === 'notes' ? 74 : 72) : 56}px; line-height: 1.16; letter-spacing: -0.01em; }
  .line i { font-style: normal; }
  .word { font-weight: 600; font-size: ${tall ? 132 : 108}px; line-height: 1.02; letter-spacing: -0.015em; }
  .note { text-align: left; padding: 22px 26px; border-left: 3px solid var(--gold); background: rgba(var(--scrim),0.66); border-radius: 0 6px 6px 0; box-sizing: border-box; }
  .note .label { margin-bottom: 10px; justify-content: flex-start; }
  .note .label::before { display: none; }
  .note .text { font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: ${tall ? 32 : 22}px; line-height: 1.4; }
  .title { text-align: center; ${look === 'notes' ? `left: 50%; transform: translate(-50%, -50%); width: 90vw;` : ''} }
  .title .ant { width: ${tall ? 132 : 100}px; height: ${tall ? 132 : 100}px; color: var(--gold); margin: 0 auto 8px; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.6)); }
  .title h1 { margin: 0; font-weight: 600; font-size: ${tall ? 200 : 160}px; line-height: 0.95; letter-spacing: -0.02em; text-shadow: 0 3px 34px rgba(0,0,0,0.75); }
  .title .tag { margin-top: 26px; font-style: italic; font-weight: 500; font-size: ${tall ? 52 : 40}px; line-height: 1.2; color: var(--dim); }
  .title .cta { margin-top: 40px; display: inline-block; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: ${tall ? 34 : 24}px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--gold); border: 1.5px solid rgba(232,187,98,0.75); border-radius: 4px; padding: 14px 24px; background: rgba(var(--scrim),0.4); }
`;

/** A soft band of shade across the frame behind a card at `pos` %, `half` % tall either side. */
const band = (pos, half, a, left) => {
  const g = `linear-gradient(to bottom, rgba(12,8,5,0) ${pos - half * 1.9}%, rgba(12,8,5,${a}) ${pos - half * 0.6}%, rgba(12,8,5,${a}) ${pos + half * 0.6}%, rgba(12,8,5,0) ${pos + half * 1.9}%)`;
  const mask = left ? '-webkit-mask-image: linear-gradient(to right, #000 0%, #000 55%, transparent 100%);' : '';
  return `<div style="position:absolute; inset:0; background:${g}; ${mask}"></div>`;
};

function html2(card, tall, look) {
  const pos = card.pos ?? 50;
  const at = `style="top: ${pos}%"`;
  const label = card.label ? `<div class="label">${card.label}</div>` : '';
  let body = '';
  if (card.kind === 'line') body = `${band(pos, tall ? 7 : 12, 0.5, look === 'notes')}<div class="card shadowed" ${at}>${label}<div class="line">${card.text}</div></div>`;
  else if (card.kind === 'word') body = `${band(pos, tall ? 6 : 12, 0.42, false)}<div class="card shadowed" ${at}><div class="word">${card.text}</div></div>`;
  else if (card.kind === 'note') body = `<div class="card note" ${at}><div class="label">${card.label ?? 'Field notes'}</div><div class="text">${card.text}</div></div>`;
  else if (card.kind === 'title')
    body = `<div style="position:absolute; inset:0; background: rgba(12,8,5,0.3)"></div>
      <div style="position:absolute; inset:0; background: radial-gradient(ellipse ${tall ? '100% 36%' : '60% 50%'} at 50% ${pos}%, rgba(12,8,5,0.55), rgba(12,8,5,0) 100%)"></div>
      <div class="card title shadowed" ${at}><div class="ant">${ANT}</div><h1>${card.name}</h1><div class="tag">${card.tagline}</div>${card.cta ? `<div class="cta">${card.cta}</div>` : ''}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500;1,9..144,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>${css2(tall, look)}</style></head><body>${body}</body></html>`;
}

/**
 * The 'indie' look: the developer's own scribbles over the game, not a designed
 * title system. Marker handwriting (Gochi Hand), hand-drawn arrows and rings
 * pointing at the ant in question, and a pixel wordmark that belongs with the
 * pixel soil. Positions are % of the frame; the strokes wobble like a pen's.
 */
const INK = '#f7f0e3';
/** A small seeded random, so a card looks the same every time it is rendered. */
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** A pen stroke through points (px), with a wobble. */
function wobbly(points, r, wob = 3) {
  const p = points.map(([x, y], i) => [x + (i && i < points.length - 1 ? (r() - 0.5) * wob : 0), y + (i && i < points.length - 1 ? (r() - 0.5) * wob : 0)]);
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2;
    const my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const e = p[p.length - 1];
  return `${d} L${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
}

/** A hand-drawn arrow from a to b (px), bowed sideways by `bend` (px). */
function arrow(a, b, bend, r) {
  const n = 14;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bow = Math.sin(t * Math.PI) * bend;
    pts.push([a[0] + dx * t + nx * bow, a[1] + dy * t + ny * bow]);
  }
  // The head: two short strokes back from the tip, along the last stretch.
  const [px, py] = pts[n - 2];
  const ang = Math.atan2(b[1] - py, b[0] - px);
  const h = 34;
  const head = [-0.5, 0.5].map((s) => [b[0] - Math.cos(ang + s) * h, b[1] - Math.sin(ang + s) * h]);
  return [wobbly(pts, r, 5), wobbly([head[0], [b[0] + 2, b[1] + 1]], r, 0), wobbly([[b[0] - 1, b[1] + 2], head[1]], r, 0)];
}

/** A hand-drawn ring round (cx, cy), a little more than once round, not quite closed. */
function ring(cx, cy, rx, ry, r) {
  const pts = [];
  const a0 = -2.2 + r() * 0.4;
  for (let i = 0; i <= 40; i++) {
    const a = a0 + (i / 40) * Math.PI * 2.18;
    const k = 1 + (r() - 0.5) * 0.05 + i * 0.0015;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return [wobbly(pts, r, 2)];
}

function htmlIndie(card, W, H) {
  const r = rand(Math.round((card.seed ?? card.y ?? 50) * 7919) + 13);
  const px = ([x, y]) => [(x / 100) * W, (y / 100) * H];
  const strokes = [];
  if (card.arrow) strokes.push(...arrow(px(card.arrow.from), px(card.arrow.to), card.arrow.bend ?? 40, r));
  if (card.ring) {
    const [cx, cy] = px([card.ring.x, card.ring.y]);
    strokes.push(...ring(cx, cy, (card.ring.rx / 100) * W, (card.ring.ry / 100) * H, r));
  }
  const svg = strokes.length
    ? `<svg width="${W}" height="${H}" style="position:absolute; inset:0; filter: drop-shadow(0 3px 0 rgba(20,12,6,.45)) drop-shadow(0 0 10px rgba(0,0,0,.35))">
        ${strokes.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`
    : '';
  const shadow = 'text-shadow: 0 4px 0 rgba(20,12,6,.45), 0 0 22px rgba(0,0,0,.45), 0 0 3px rgba(0,0,0,.5);';
  let body = '';
  if (card.kind === 'scribble') {
    body = `${svg}<div style="position:absolute; left:${card.x ?? 50}%; top:${card.y ?? 30}%; transform: translate(-50%, -50%) rotate(${card.rot ?? -2}deg); width: 88vw; text-align:center;
        font-family:'Gochi Hand', cursive; font-size:${card.size ?? 84}px; line-height:1.06; color:${INK}; ${shadow}">${card.text}${card.small ? `<div style="font-size:0.62em; margin-top:10px; opacity:.92">${card.small}</div>` : ''}</div>`;
  } else if (card.kind === 'title') {
    body = `<div style="position:absolute; inset:0; background: rgba(12,8,5,0.32)"></div>
      <div style="position:absolute; left:50%; top:${card.pos ?? 46}%; transform: translate(-50%, -50%); width: 94vw; text-align:center; color:${INK};">
        <div style="font-family:'Pixelify Sans', monospace; font-weight:700; font-size:${W > H ? 150 : 168}px; letter-spacing:6px; line-height:1;
          text-shadow: 0 8px 0 rgba(20,12,6,.55), 0 0 30px rgba(0,0,0,.5);">${card.name.toUpperCase()}</div>
        <div style="margin-top:34px; font-family:'Gochi Hand', cursive; font-size:${W > H ? 50 : 60}px; line-height:1.1; ${shadow}">${card.tagline}</div>
        ${card.note ? `<div style="margin-top:26px; font-family:'Gochi Hand', cursive; font-size:50px; opacity:.88; transform: rotate(-2deg); ${shadow}">${card.note}</div>` : ''}
        ${card.cta ? `<div style="margin-top:22px; font-family:'Gochi Hand', cursive; font-size:48px; ${shadow}">${card.cta}</div>` : ''}
      </div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Gochi+Hand&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet">
    <style>html,body{margin:0;background:transparent;} body{width:100vw;height:100vh;position:relative;overflow:hidden;}</style></head><body>${body}</body></html>`;
}

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

/**
 * Render each card to <dir>/<id>.png (transparent). Returns { id: path }.
 * `look`: 'classic' (the first teaser's cards), 'clear', 'notes' or 'indie'.
 */
export async function renderCards(cards, { width, height, dir, look = 'classic' }) {
  mkdirSync(dir, { recursive: true });
  const tall = height > width;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const out = {};
  for (const card of cards) {
    const page_html = look === 'indie' ? htmlIndie(card, width, height) : look === 'classic' ? html(card, tall) : html2(card, tall, look);
    await page.setContent(page_html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const path = join(dir, `${card.id}.png`);
    await page.screenshot({ path, omitBackground: true });
    out[card.id] = path;
  }
  await browser.close();
  return out;
}
