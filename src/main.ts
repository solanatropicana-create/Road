import 'pixi.js/unsafe-eval';
import { Application, Graphics } from 'pixi.js';
import { Scene } from './render/scene';
import { Input } from './game/input';
import { Match, type Mode } from './game/match';
import { renderCard, snapshot, type ShipSnapshot } from './game/hud';
import { BLUEPRINTS } from './sim/blueprints';
import { CHAR_MAP } from './sim/defs';
import { DT } from './sim/world';
import type { Ship } from './sim/ship';
import { Sfx } from './game/audio';
import { Labels } from './render/labels';
import { WEAPONS } from './sim/defs';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x0e0b1f,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  $('app').appendChild(app.canvas);

  const scene = new Scene(app);
  const input = new Input(app.canvas);
  const labels = new Labels();
  app.stage.addChild(labels.root);
  const crosshair = new Graphics();
  app.stage.addChild(crosshair);
  const CALLOUT: Record<string, string> = {
    reactor: 'REAKTÖR',
    bridge: 'KÖPRÜ',
    gyro: 'JİROSKOP',
    stabilizer: 'STABİLİZÖR',
    thruster: 'İTİCİ',
    cannon: 'TOP',
    laser: 'LAZER',
  };
  const toScreen = (x: number, y: number) => ({
    x: (x - scene.cam.x) * scene.cam.zoom + app.screen.width / 2,
    y: (y - scene.cam.y) * scene.cam.zoom + app.screen.height / 2,
  });
  const sfx = new Sfx();
  let hurt = 0;

  const state = {
    mode: 'watch' as Mode,
    playerShip: 'serce',
    match: null as Match | null,
    snaps: [] as ShipSnapshot[],
    score: [0, 0],
    round: 0,
    seed: (Date.now() % 100000) | 0,
    acc: 0,
    hitStop: 0,
    killCam: 0,
    slow: false,
    assist: true,
    hudTimer: 0,
    time: 0,
    inMenu: true,
  };

  // Debug handle for automated screenshots.
  (window as unknown as { __kesit: unknown }).__kesit = { scene, state };

  // ------------------------------------------------------------- menu
  const shipsEl = $('ships');
  for (const bp of BLUEPRINTS) {
    const b = document.createElement('button');
    b.className = 'ship';
    b.type = 'button';
    b.setAttribute('aria-pressed', String(bp.id === state.playerShip));
    b.dataset.id = bp.id;
    const cv = document.createElement('canvas');
    b.append(cv);
    b.insertAdjacentHTML('beforeend', `<strong>${bp.name}</strong><small>${bp.blurb}</small>`);
    b.addEventListener('click', () => {
      state.playerShip = bp.id;
      shipsEl.querySelectorAll('.ship').forEach((n) => n.setAttribute('aria-pressed', String((n as HTMLElement).dataset.id === bp.id)));
    });
    shipsEl.append(b);
    requestAnimationFrame(() => drawPreview(cv, bp.rows));
  }
  $('play').addEventListener('click', () => {
    sfx.unlock();
    sfx.ui('click');
    start('duel');
  });
  $('watch').addEventListener('click', () => {
    sfx.unlock();
    sfx.ui('click');
    start('watch');
  });

  let touchSlow = false;
  const tAssist = $('tAssist');
  const tSlow = $('tSlow');
  tAssist.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.assist = !state.assist;
    tAssist.setAttribute('aria-pressed', String(!state.assist));
    tAssist.textContent = state.assist ? 'ASİSTAN' : 'DRİFT';
  });
  tSlow.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touchSlow = true;
  });
  const slowOff = () => (touchSlow = false);
  tSlow.addEventListener('pointerup', slowOff);
  tSlow.addEventListener('pointercancel', slowOff);
  tSlow.addEventListener('pointerleave', slowOff);
  $('tMenu').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toMenu();
  });
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  function start(mode: Mode): void {
    state.mode = mode;
    state.score = [0, 0];
    state.round = 0;
    state.inMenu = false;
    $('menu').hidden = true;
    $('hud').hidden = false;
    $('touchui').hidden = !(isTouch && mode === 'duel');
    $('keys').innerHTML =
      mode === 'duel'
        ? '<span><kbd>WASD</kbd> uç</span><span><kbd>Q</kbd><kbd>E</kbd> kay</span><span><kbd>Sol</kbd> top</span><span><kbd>Sağ</kbd> lazer</span><span><kbd>Space</kbd> asistan</span><span><kbd>Shift</kbd> yavaşlat</span><span><kbd>M</kbd> ses</span><span><kbd>B</kbd> bloom</span><span><kbd>R</kbd> yeniden</span><span><kbd>Esc</kbd> menü</span>'
        : '<span><kbd>N</kbd> sonraki tur</span><span><kbd>Shift</kbd> yavaşlat</span><span><kbd>Esc</kbd> menü</span>';
    newRound();
  }

  function toMenu(): void {
    state.inMenu = true;
    state.match?.destroy();
    state.match = null;
    scene.clearWorld();
    labels.clear();
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('touchui').hidden = true;
  }

  function newRound(): void {
    state.match?.destroy();
    scene.clearWorld();
    labels.clear();
    state.seed++;
    state.round++;
    const ids = BLUEPRINTS.map((b) => b.id);
    const pick = () => ids[Math.floor(Math.random() * ids.length)]!;
    const ships: [string, string] = state.mode === 'duel' ? [state.playerShip, pick()] : [pick(), pick()];
    state.match = new Match({ mode: state.mode, seed: state.seed, ships });
    state.snaps = state.match.combatants.map(snapshot);
    state.acc = 0;
    state.killCam = 0;
    state.assist = true;
    $('banner').hidden = true;
    const c = state.match.combatants[0].body.getWorldCenter();
    scene.cam.x = c.x * 0.5;
    scene.cam.y = c.y * 0.5;
  }

  // ------------------------------------------------------------- loop
  const frame = (deltaMS: number): void => {
    const realDt = Math.min(deltaMS / 1000, 0.1);
    state.time += realDt;
    const m = state.match;

    if (input.hit('Escape') && !state.inMenu) toMenu();

    if (m && !state.inMenu) {
      const player = state.mode === 'duel' ? m.combatants[0] : null;
      const mouseW = scene.screenToWorld(input.mouse.x, input.mouse.y);

      if (input.hit('KeyR') && state.mode === 'duel') newRound();
      if (input.hit('KeyN') && state.mode === 'watch') newRound();
      if (input.hit('Space')) state.assist = !state.assist;
      if (input.hit('KeyM')) sfx.setMuted(!sfx.muted);
      if (input.hit('KeyB')) scene.setBloom(!scene.bloom);
      state.slow = input.down('ShiftLeft') || input.down('ShiftRight');

      if (player) {
        const pi = player.input;
        pi.thrust = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        pi.turn = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
        pi.strafe = input.axis(['KeyQ'], ['KeyE']);
        pi.assist = state.assist;
        pi.aim.x = mouseW.x;
        pi.aim.y = mouseW.y;
        pi.fireCannon = input.mouse.left;
        pi.fireLaser = input.mouse.right;
        if (input.touch.used) {
          // Twin-stick: the stick says where to go; the ship turns to face it and burns.
          const st = input.stick();
          if (st.len > 0.12) {
            const want = Math.atan2(st.x, -st.y);
            let err = want - player.body.getAngle();
            err = Math.atan2(Math.sin(err), Math.cos(err));
            pi.turn = Math.max(-1, Math.min(1, err * 2 - player.body.getAngularVelocity() * 0.5));
            pi.thrust = st.len * Math.max(0, Math.cos(err));
            pi.strafe = st.len * Math.sin(err) * 0.7;
          }
          const t = input.touch;
          if (t.aimId >= 0) {
            const aw = scene.screenToWorld(t.ax, t.ay);
            pi.aim.x = aw.x;
            pi.aim.y = aw.y;
            pi.fireCannon = true;
            pi.fireLaser = true;
          } else {
            // No finger on the right: guns track the enemy but hold fire.
            const ec = m.combatants[1].body.getWorldCenter();
            pi.aim.x = ec.x;
            pi.aim.y = ec.y;
          }
          if (touchSlow) state.slow = true;
        }
      }

      // Time: hit-stop freezes, kill-cam and Shift slow down.
      let scale = 1;
      if (state.slow) scale = 0.25;
      if (state.killCam > 0) {
        state.killCam -= realDt;
        scale = Math.min(scale, 0.3);
      }
      if (state.hitStop > 0) {
        state.hitStop -= realDt;
        scale = 0;
      }
      $('slowmo').classList.toggle('on', scale > 0 && scale < 1);

      state.acc += realDt * scale;
      let steps = 0;
      while (state.acc >= DT && steps < 6) {
        m.step(DT);
        state.acc -= DT;
        steps++;
        const focus = scene.cam;
        for (const e of m.world.events) {
          scene.fx.handle(e, focus);
          sfx.handle(e, focus, player?.id ?? null);
          if (player && (e.t === 'hit' || e.t === 'break' || e.t === 'explode') && 'ship' in e && e.ship === player.id) hurt = Math.min(1, hurt + (e.t === 'break' ? 0.35 : 0.15));
          if (e.t === 'disabled' && m.combatants.some((s) => s.id === e.ship)) {
            state.killCam = 1.3;
            const s = m.combatants.find((c) => c.id === e.ship)!;
            const c = s.body.getWorldCenter();
            labels.add(c.x, c.y - 6, 'SAVAŞ DIŞI', 0xffe27a, true);
          }
          if (e.t === 'break' && CALLOUT[e.kind] && m.combatants.some((s) => s.id === e.ship)) {
            labels.add(e.x, e.y - 1.5, CALLOUT[e.kind]!, e.team === 0 ? 0x9ff3dc : 0xffb9c8);
          }
        }
        m.world.events.length = 0;
      }
      if (scene.fx.hitStop > 0) {
        state.hitStop = Math.max(state.hitStop, scene.fx.hitStop);
        scene.fx.hitStop = 0;
      }

      // Rendering
      const aims = new Map<Ship, { x: number; y: number }>();
      for (const s of m.combatants) aims.set(s, s.input.aim);
      scene.syncWorld(m.world, state.time, aims);
      if (scale > 0) scene.fx.trails(m.world.ships, realDt * scale);
      scene.fx.update(realDt * (scale === 0 ? 0.15 : scale), m.world.projectiles);
      labels.update(realDt, toScreen);
      scene.updateCamera(realDt, cameraTarget(m, player, mouseW, app.screen.width, app.screen.height));

      // Continuous audio + hurt vignette
      let lasers = 0;
      for (const s of m.combatants) for (const t of s.tiles.values()) if (t.firing) lasers++;
      let engine = 0;
      if (player) for (const t of player.tiles.values()) if (t.def.kind === 'thruster' || t.def.kind === 'rcs') engine += t.throttle * (t.def.kind === 'thruster' ? 0.35 : 0.12);
      sfx.frame(realDt, lasers * (scale > 0 ? 1 : 0), Math.min(1, engine) * (scale > 0 ? 1 : 0));
      hurt = Math.max(0, hurt - realDt * 1.8);
      $('hurt').style.opacity = String(hurt * 0.8);

      // Round end
      if (m.over) {
        if (m.overTime === 0 || $('banner').hidden) {
          if ($('banner').hidden) {
            if (m.winner !== null && m.winner >= 0) state.score[m.winner]!++;
            showBanner(m);
            if (state.mode === 'duel') sfx.ui(m.winner === 0 ? 'win' : 'lose');
          }
        }
        if (state.mode === 'watch' && m.overTime > 4.5) newRound();
      }

      // Crosshair (duel only)
      crosshair.clear();
      if (player && input.touch.used) {
        const t = input.touch;
        if (t.stickId >= 0) {
          const st = input.stick();
          crosshair.circle(t.ox, t.oy, 70).stroke({ width: 2, color: 0x9ff3dc, alpha: 0.35 }).fill({ color: 0x9ff3dc, alpha: 0.06 });
          crosshair.circle(t.ox + st.x * 70, t.oy + st.y * 70, 26).fill({ color: 0x9ff3dc, alpha: 0.45 });
        }
        if (t.aimId >= 0) {
          crosshair.circle(t.ax, t.ay, 16).stroke({ width: 2, color: 0xffe27a, alpha: 0.9 });
          crosshair.circle(t.ax, t.ay, 3).fill({ color: 0xffe27a });
        }
      }
      const enemy = m.combatants[1];
      if (player && player.controllable && m.world.ships.includes(enemy) && enemy.controllable) {
        // Fire-control lead pip: where to aim so shells meet the enemy's centre.
        const pc = player.body.getWorldCenter();
        const ec = enemy.body.getWorldCenter();
        const pv = player.body.getLinearVelocity();
        const ev = enemy.body.getLinearVelocity();
        const t = leadTime(ec.x - pc.x, ec.y - pc.y, ev.x - pv.x, ev.y - pv.y, WEAPONS.cannon.muzzle);
        if (t !== null && t < 1.4) {
          const lx = ec.x + (ev.x - pv.x) * t;
          const ly = ec.y + (ev.y - pv.y) * t;
          const sx = (lx - scene.cam.x) * scene.cam.zoom + app.screen.width / 2;
          const sy = (ly - scene.cam.y) * scene.cam.zoom + app.screen.height / 2;
          const ex = (ec.x - scene.cam.x) * scene.cam.zoom + app.screen.width / 2;
          const ey = (ec.y - scene.cam.y) * scene.cam.zoom + app.screen.height / 2;
          crosshair.moveTo(ex, ey).lineTo(sx, sy).stroke({ width: 1, color: 0xffb9c8, alpha: 0.35 });
          crosshair.poly([sx, sy - 7, sx + 7, sy, sx, sy + 7, sx - 7, sy]).stroke({ width: 1.5, color: 0xffb9c8, alpha: 0.9 });
        }
      }
      if (player && input.mouse.inside) {
        const x = input.mouse.x;
        const y = input.mouse.y;
        const col = player.controllable ? 0xffe27a : 0x6b6488;
        crosshair.circle(x, y, 9).stroke({ width: 1.5, color: col, alpha: 0.9 });
        crosshair
          .moveTo(x - 15, y)
          .lineTo(x - 5, y)
          .moveTo(x + 5, y)
          .lineTo(x + 15, y)
          .moveTo(x, y - 15)
          .lineTo(x, y - 5)
          .moveTo(x, y + 5)
          .lineTo(x, y + 15)
          .stroke({ width: 1.5, color: col, alpha: 0.9 });
      }

      state.hudTimer -= realDt;
      if (state.hudTimer <= 0) {
        state.hudTimer = 0.1;
        updateHud(m);
      }
    } else {
      // Menu backdrop: drift the stars.
      scene.updateCamera(realDt, { x: state.time * 6, y: state.time * 2, zoom: 9 });
      crosshair.clear();
    }
    input.endFrame();
  };
  app.ticker.add((tk) => frame(tk.deltaMS));

  // Deterministic frame capture for trailers: pause the ticker, then step frames by hand.
  Object.assign(window as object, {
    __capture: {
      pause: () => app.ticker.stop(),
      frame: (ms: number, render = true) => {
        frame(ms);
        if (render) app.render();
      },
      /** Ship portrait: one idle ship at the origin, optionally shot through `shots` times. */
      showcase: (id: string, shots: number) => {
        state.mode = 'watch';
        state.inMenu = false;
        $('menu').hidden = true;
        state.match?.destroy();
        scene.clearWorld();
        const m = new Match({ mode: 'watch', seed: 7, ships: [id, id] });
        m.pilots = [null, null];
        const [a, b] = m.combatants;
        b.body.setPosition({ x: 5000, y: 5000 });
        a.body.setPosition({ x: 0, y: 0 });
        a.body.setAngle(0);
        a.body.setLinearVelocity({ x: 0, y: 0 });
        a.body.setAngularVelocity(0);
        for (let i = 0; i < shots; i++) {
          const y = [-0.2, 1.1, -1.4, 0.6][i % 4]!;
          m.world.damageAlongRay(a, { x: a.bounds.minX - 0.55, y }, { x: 1, y: 0.06 * (i - 1) }, 3200, false);
        }
        a.body.setAngle(0.35);
        camLock = { x: 0, y: 0, zoom: 0 };
        state.match = m;
        state.snaps = m.combatants.map(snapshot);
      },
      start: (mode: Mode, ships: [string, string], seed: number) => {
        state.mode = mode;
        state.inMenu = false;
        $('menu').hidden = true;
        $('hud').hidden = false;
        state.match?.destroy();
        scene.clearWorld();
        state.match = new Match({ mode, seed, ships });
        state.snaps = state.match.combatants.map(snapshot);
        state.round = 1;
        $('banner').hidden = true;
      },
    },
  });

  let zoomMul = window.innerWidth < 640 ? 1.3 : 1;
  window.addEventListener('wheel', (e) => {
    zoomMul = Math.max(0.5, Math.min(2.5, zoomMul * (e.deltaY > 0 ? 0.9 : 1.1)));
  });
  (window as unknown as { __zoom: (z: number) => void }).__zoom = (z: number) => (zoomMul = z);
  let focusIdx = -1;
  let camLock: { x: number; y: number; zoom: number } | null = null;
  (window as unknown as { __camLock: (z: number | null) => void }).__camLock = (z) => {
    camLock = z === null ? null : { x: 0, y: 0, zoom: z };
    if (camLock) Object.assign(scene.cam, camLock);
  };
  (window as unknown as { __focus: (i: number) => void }).__focus = (i: number) => (focusIdx = i);

  function cameraTarget(m: Match, player: Ship | null, mouseW: { x: number; y: number }, w: number, h: number) {
    const [a, b] = m.combatants;
    const alive = (s: Ship) => m.world.ships.includes(s);
    const ca = alive(a) ? a.body.getWorldCenter() : { x: scene.cam.x, y: scene.cam.y };
    const cb = alive(b) ? b.body.getWorldCenter() : ca;
    let cx: number;
    let cy: number;
    let extent: number;
    const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
    if (player) {
      cx = ca.x * 0.62 + cb.x * 0.38;
      cy = ca.y * 0.62 + cb.y * 0.38;
      cx += (mouseW.x - ca.x) * 0.12;
      cy += (mouseW.y - ca.y) * 0.12;
      extent = Math.max(18, dist * 0.55 + 11);
    } else {
      cx = (ca.x + cb.x) / 2;
      cy = (ca.y + cb.y) / 2;
      extent = Math.max(18, dist * 0.5 + 12);
    }
    if (camLock) return camLock;
    if (focusIdx >= 0) {
      const f = focusIdx === 0 ? ca : cb;
      cx = f.x;
      cy = f.y;
    }
    const zoom = Math.max(3.5, Math.min(16, Math.min(w, h) / 2 / extent)) * zoomMul;
    return { x: cx, y: cy, zoom };
  }

  function showBanner(m: Match): void {
    const t = $('bannerTitle');
    const s = $('bannerSub');
    const w = m.winner;
    if (state.mode === 'duel') {
      t.textContent = w === 0 ? 'KAZANDIN' : w === 1 ? 'KAYBETTİN' : 'BERABERE';
      t.style.color = w === 0 ? 'var(--mint)' : 'var(--coral)';
      s.textContent = `${m.combatants[1].name} · ${m.elapsed.toFixed(0)} sn · R ile yeni tur`;
    } else {
      const ws = w !== null && w >= 0 ? m.combatants[w] : null;
      t.textContent = ws ? `${ws.name.toUpperCase()} KAZANDI` : 'BERABERE';
      t.style.color = w === 0 ? 'var(--mint)' : 'var(--coral)';
      s.textContent = `${m.elapsed.toFixed(0)} sn · sıradaki tur hazırlanıyor`;
    }
    $('banner').hidden = false;
  }

  function updateHud(m: Match): void {
    const [a, b] = m.combatants;
    renderCard($('card0'), a, state.snaps[0]!, state.mode === 'duel' ? 'Sen' : 'Nane');
    renderCard($('card1'), b, state.snaps[1]!, state.mode === 'duel' ? 'Düşman' : 'Mercan');
    $('score').innerHTML = `<span class="m">${a.name}</span> ${state.score[0]} – ${state.score[1]} <span class="c">${b.name}</span>`;
    $('sub').textContent = `TUR ${state.round} · ${m.elapsed.toFixed(0)} sn${state.mode === 'watch' ? ' · YZ vs YZ' : ''}`;
  }
}

function leadTime(rx: number, ry: number, vx: number, vy: number, s: number): number | null {
  const a = vx * vx + vy * vy - s * s;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || Math.abs(a) < 1e-6) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : null;
}

/** Small static preview of a blueprint for the menu cards. */
function drawPreview(cv: HTMLCanvasElement, rows: string[]): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 180;
  const H = cv.clientHeight || 110;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);
  const w = Math.max(...rows.map((r) => r.length));
  const s = Math.min((W - 10) / w, (H - 10) / rows.length);
  const ox = (W - w * s) / 2;
  const oy = (H - rows.length * s) / 2;
  const colors: Record<string, string> = {
    hull: '#9ff3dc',
    armor: '#6fb8b0',
    frame: '#5cc4b0',
    conduit: '#ffe27a',
    reactor: '#7ffcff',
    bridge: '#fff1b8',
    gyro: '#c9a8ff',
    stabilizer: '#a6c8ff',
    thruster: '#5d5680',
    rcs: '#5d5680',
    cannon: '#ffd36b',
    laser: '#ff7af0',
  };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const m = CHAR_MAP[ch];
      if (!m) return;
      g.fillStyle = '#1d4e55';
      g.fillRect(ox + x * s - 1, oy + y * s - 1, s + 2, s + 2);
    }),
  );
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const m = CHAR_MAP[ch];
      if (!m) return;
      g.fillStyle = colors[m.kind] ?? '#9ff3dc';
      const r = s * 0.2;
      const px = ox + x * s + 1;
      const py = oy + y * s + 1;
      g.beginPath();
      g.roundRect(px, py, s - 2, s - 2, r);
      g.fill();
    }),
  );
}

boot();
