/**
 * Player test: plays the game the way a person does (real mouse clicks, real
 * time) instead of calling the game's functions, and reports what a player
 * would trip over.
 *
 *   node scripts/playertest.mjs [outDir] [url]
 *
 * For every state a player passes through (title, landing, founding montage,
 * growing, the drawer's tabs, settings, the year's review, the end, and the
 * same on a phone) it checks every visible control:
 *   - clickable: the element under its centre is the control itself;
 *   - on screen and not zero-sized;
 *   - not overlapping another control;
 *   - text not cut off.
 * Then it clicks controls with the mouse and checks they did something.
 * Writes report.json and a screenshot per state; prints a summary.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const [out = 'shots/playertest', url = 'http://127.0.0.1:5173/'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const findings = [];
const note = (state, kind, what, detail = '') => findings.push({ state, kind, what, detail });

/** In the page: audit every visible control. */
function auditInPage() {
  const sel = 'button, [role=button], input, select, a[href], [data-tab], [data-mode], [data-order], [data-prio], [data-speed]';
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let e = el;
    while (e) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      e = e.parentElement;
    }
    return true;
  };
  const label = (el) => (el.id ? `#${el.id}` : '') + (el.dataset.tab ? `[tab=${el.dataset.tab}]` : '') + (el.dataset.mode ? `[mode=${el.dataset.mode}]` : '') + ' "' + (el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) + '"';
  // Scrolled out of its panel's view: not a control the player can see right now.
  const clipped = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let e = el.parentElement; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflow === 'visible' && s.overflowY === 'visible' && s.overflowX === 'visible') continue;
      const p = e.getBoundingClientRect();
      if (cx < p.left || cx > p.right || cy < p.top || cy > p.bottom) return true;
    }
    return false;
  };
  const els = [...new Set(document.querySelectorAll(sel))].filter((e) => vis(e) && !clipped(e));
  const res = [];
  const W = innerWidth;
  const H = innerHeight;
  const rects = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const off = r.right < 1 || r.bottom < 1 || r.left > W - 1 || r.top > H - 1;
    const partly = r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1;
    let hit = null;
    if (!off) hit = document.elementFromPoint(Math.min(W - 1, Math.max(0, cx)), Math.min(H - 1, Math.max(0, cy)));
    const ok = !!hit && (hit === el || el.contains(hit));
    const pe = getComputedStyle(el).pointerEvents;
    res.push({ label: label(el), ok, off, partly, pe, blocker: ok || !hit ? '' : (hit.id ? `#${hit.id}` : hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ').join('.') : '')), small: r.width < 24 || r.height < 18, w: Math.round(r.width), h: Math.round(r.height) });
    rects.push({ label: label(el), r });
  }
  // Controls overlapping each other (by more than a few pixels), unless one holds the other.
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r;
      const b = rects[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) {
        const ea = els[i];
        const eb = els[j];
        if (ea.contains(eb) || eb.contains(ea)) continue;
        overlaps.push(`${rects[i].label} × ${rects[j].label}`);
      }
    }
  }
  // Text cut off (an ellipsis or hidden overflow on a visible element).
  const cut = [];
  for (const el of document.querySelectorAll('#ui *, #title *')) {
    if (!vis(el) || !el.childNodes.length) continue;
    const s = getComputedStyle(el);
    if (s.overflow !== 'hidden' && s.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.textContent.trim()) cut.push((el.id ? `#${el.id} ` : '') + `"${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)}"`);
  }
  // Panels overlapping each other.
  const panels = [...document.querySelectorAll('#ui > *')].filter((e) => vis(e) && getComputedStyle(e).position !== 'static' && e.getBoundingClientRect().width < W * 0.9);
  const panelOverlaps = [];
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].getBoundingClientRect();
      const b = panels[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 8 && oy > 8) panelOverlaps.push(`#${panels[i].id || panels[i].className} × #${panels[j].id || panels[j].className}`);
    }
  }
  return { controls: res, overlaps, cut, panelOverlaps };
}

async function audit(page, state) {
  const a = await page.evaluate(auditInPage);
  for (const c of a.controls) {
    if (c.off) continue;
    if (!c.ok) note(state, 'NOT CLICKABLE', c.label, c.blocker ? `covered by ${c.blocker}` : `pointer-events: ${c.pe}`);
    if (c.partly) note(state, 'off screen (partly)', c.label);
    if (c.small) note(state, 'small target', c.label, `${c.w}×${c.h}px`);
  }
  for (const o of a.overlaps) note(state, 'controls overlap', o);
  for (const o of a.panelOverlaps) note(state, 'panels overlap', o);
  for (const t of a.cut) note(state, 'text cut off', t);
  await page.screenshot({ path: join(out, `${state.replace(/[^\w-]+/g, '_')}.png`) });
  return a;
}

/** Click a control with the real mouse at its centre (fails loudly if something else is on top). */
async function click(page, state, selector) {
  const el = await page.$(selector);
  if (!el) {
    note(state, 'missing control', selector);
    return false;
  }
  const box = await el.boundingBox();
  if (!box) {
    note(state, 'control not shown', selector);
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const top = await page.evaluate(([x, y, s]) => {
    const h = document.elementFromPoint(x, y);
    const e = document.querySelector(s);
    return !!h && !!e && (h === e || e.contains(h));
  }, [x, y, selector]);
  if (!top) note(state, 'click lands elsewhere', selector);
  await page.mouse.click(x, y);
  await page.waitForTimeout(350);
  return top;
}

const fastForward = (page, ticks) => page.evaluate((n) => window.game.advance(n), ticks);

async function run(vp) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext(vp.mobile ? { viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?seed=4242`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const S = (s) => `${vp.name}:${s}`;

  // Title screen, then the mode is picked with the mouse.
  await audit(page, S('title'));
  await click(page, S('title'), '#title [data-mode="watch"]');
  await page.waitForTimeout(600);

  // The landing sequence: skip it with the mouse.
  const landing = await page.evaluate(() => window.game.cine.busy);
  if (landing) {
    await audit(page, S('landing'));
    await click(page, S('landing'), '#cineskip');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => window.game.cine.busy)) note(S('landing'), 'SKIP DID NOTHING', '#cineskip', 'the landing kept playing after a click');
  } else note(S('landing'), 'no landing sequence', '');
  await page.waitForFunction(() => window.game.sim.phase !== 'choose', null, { timeout: 30000 }).catch(() => note(S('landing'), 'queen never landed', ''));

  // The founding montage starts once she has sealed herself in.
  for (let k = 0; k < 40 && !(await page.evaluate(() => window.game.cine.montage)); k++) await fastForward(page, 300);
  if (await page.evaluate(() => window.game.cine.montage)) {
    await page.waitForTimeout(1500);
    await audit(page, S('montage'));
    await click(page, S('montage'), '#cineskip');
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => window.game.cine.montage && !window.game.sim.colony.hadWorkers);
    if (still) note(S('montage'), 'SKIP DID NOTHING', '#cineskip', 'the montage kept playing after a click');
  } else note(S('montage'), 'montage never started', '');
  for (let k = 0; k < 60 && (await page.evaluate(() => window.game.sim.phase)) === 'founding'; k++) await fastForward(page, 600);
  await page.waitForTimeout(2500);

  // Growing: the main screen and every tab.
  await audit(page, S('growing'));
  for (const tab of ['colony', 'notes']) {
    if (await page.$(`#tabs [data-tab="${tab}"]`)) {
      await click(page, S(`tab-${tab}`), `#tabs [data-tab="${tab}"]`);
      const on = await page.evaluate((t) => document.querySelector('#drawer')?.dataset.tab === t, tab);
      if (!on && tab !== 'guide') note(S(`tab-${tab}`), 'tab click did nothing', tab);
      await audit(page, S(`tab-${tab}`));
    }
  }
  // The speed buttons.
  const speeds = await page.$$('#bar [data-speed]');
  if (speeds.length) {
    for (const b of speeds) {
      const box = await b.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(150);
    }
  }
  // Settings.
  const gear = (await page.$('#help-btn')) ? '#help-btn' : null;
  if (gear) {
    await click(page, S('settings'), gear);
    await audit(page, S('settings'));
    await click(page, S('settings'), gear);
  } else note(S('settings'), 'no settings button found', '');

  // A year on: the review at the start of the winter rest.
  for (let k = 0; k < 160 && !(await page.evaluate(() => getComputedStyle(document.querySelector('#review')).display !== 'none' && document.querySelector('#review').getBoundingClientRect().width > 0)); k++) {
    await fastForward(page, 1800);
    await page.waitForTimeout(80);
  }
  if (await page.$('#review #rvok')) {
    await page.waitForTimeout(600);
    await audit(page, S('review'));
    await click(page, S('review'), '#review #rvok');
    const open = await page.evaluate(() => document.querySelector('#review').getBoundingClientRect().width > 0 && getComputedStyle(document.querySelector('#review')).display !== 'none');
    if (open) note(S('review'), 'review did not close', '#rvok');
  } else note(S('review'), 'year review never showed', '');

  // The end of a colony.
  await page.evaluate(() => {
    const c = window.game.sim.colony;
    for (const a of c.ants) a.alive = false;
    c.ants.length = 0;
    c.failed = true;
  });
  await page.waitForTimeout(1500);
  await audit(page, S('over'));

  for (const e of errors) note(S('page'), 'console error', e.slice(0, 160));
  await browser.close();
}

for (const vp of [
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'laptop', w: 1280, h: 720 },
  { name: 'phone', w: 400, h: 820, mobile: true },
]) {
  try {
    await run(vp);
  } catch (e) {
    note(vp.name, 'TEST CRASHED', String(e).slice(0, 200));
  }
}

writeFileSync(join(out, 'report.json'), JSON.stringify(findings, null, 1));
const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);
for (const [k, list] of Object.entries(byKind)) {
  console.log(`\n== ${k} (${list.length})`);
  const seen = new Set();
  for (const f of list) {
    const key = `${f.what} ${f.detail}`;
    const states = list.filter((g) => `${g.what} ${g.detail}` === key).map((g) => g.state);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${f.what}${f.detail ? ` — ${f.detail}` : ''}   [${[...new Set(states)].join(', ')}]`);
  }
}
console.log(`\n${findings.length} findings; screenshots and report.json in ${out}`);
