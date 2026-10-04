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
import { CaptainPilot, type Point } from './game/captain';
import { AI_PROFILES } from './sim/ai';
import type { Tile } from './sim/ship';

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
    control: 'captain' as 'captain' | 'helm',
    paused: false,
    timeScale: 1,
  };
  let captain: CaptainPilot | null = null;
  /** Right-button drag in progress: the route being drawn (world points). */
  let drag: { sx: number; sy: number; pts: Point[] } | null = null;
  const KIND_NAME: Record<string, string> = {
    frame: 'Çerçeve',
    hull: 'Gövde',
    armor: 'Zırh',
    conduit: 'Güç hattı',
    reactor: 'Reaktör',
    bridge: 'Köprü',
    stabilizer: 'Stabilizör',
    gyro: 'Jiroskop',
    thruster: 'Ana itici',
    rcs: 'Manevra iticisi',
    cannon: 'Top',
    laser: 'Lazer',
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

  const touchSlow = false;
  const tPause = $('tPause');
  const tSpeed = $('tSpeed');
  const tMode = $('tMode');
  tPause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.paused = !state.paused;
  });
  tSpeed.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.timeScale = state.timeScale === 1 ? 2 : state.timeScale === 2 ? 0.5 : 1;
  });
  tMode.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setControl(state.control === 'captain' ? 'helm' : 'captain');
  });
  $('tMenu').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toMenu();
  });
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  function setControl(c: 'captain' | 'helm'): void {
    state.control = c;
    drag = null;
    const m = state.match;
    if (m && state.mode === 'duel') {
      m.pilots[0] = c === 'captain' ? captain : null;
      m.combatants[0].input.aimLaser = undefined;
    }
    input.touchMode = c === 'captain' ? 'gesture' : 'stick';
    tMode.textContent = c === 'captain' ? 'DÜMEN' : 'KAPTAN';
    if (state.mode === 'duel') $('keys').innerHTML = c === 'captain' ? KEYS_CAPTAIN : KEYS_HELM;
  }
  const KEYS_CAPTAIN =
    '<span><kbd>Sağ tık</kbd> git</span><span><kbd>Sağ sürükle</kbd> rota çiz</span><span><kbd>Shift</kbd>+<kbd>Sağ</kbd> rotaya ekle</span><span><kbd>Sağ tık</kbd> düşmana: kenetlen</span><span><kbd>Sol tık</kbd> düşman modülü: hedef</span><span><kbd>Space</kbd> durdur</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> hız</span><span><kbd>H</kbd> ateşi tut</span><span><kbd>Tab</kbd> dümen</span><span><kbd>Esc</kbd> menü</span>';
  const KEYS_HELM =
    '<span><kbd>WASD</kbd> uç</span><span><kbd>Q</kbd><kbd>E</kbd> kay</span><span><kbd>Sol</kbd> top</span><span><kbd>Sağ</kbd> lazer</span><span><kbd>F</kbd> asistan</span><span><kbd>Shift</kbd> yavaşlat</span><span><kbd>Space</kbd> durdur</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> hız</span><span><kbd>Tab</kbd> kaptan</span><span><kbd>Esc</kbd> menü</span>';

  /** Enemy tile nearest to a world point (within ~1 tile), for click targeting. */
  function pickEnemyTile(m: Match, p: Point): Tile | null {
    const enemy = m.combatants[1];
    if (!m.world.ships.includes(enemy)) return null;
    const lp = enemy.body.getLocalPoint(p);
    let best: Tile | null = null;
    let bd = 1.1;
    for (const t of enemy.tiles.values()) {
      const d = Math.hypot(t.x - lp.x, t.y - lp.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  function issuePath(points: Point[], append: boolean): void {
    if (!captain || !points.length) return;
    if (append && captain.order.kind === 'path') captain.order.points.push(...points);
    else captain.order = { kind: 'path', points: [...points] };
  }

  /** Thin a hand-drawn route to points ~4 m apart. */
  function simplify(pts: Point[]): Point[] {
    const out: Point[] = [];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 4) out.push(p);
    }
    const last = pts[pts.length - 1];
    if (last && out[out.length - 1] !== last) out.push(last);
    return out;
  }

  function setTarget(m: Match, t: Tile | null): void {
    if (!captain) return;
    captain.target = t ? { x: t.x, y: t.y } : null;
    if (t) {
      const wp = m.combatants[1].tileWorld(t);
      labels.add(wp.x, wp.y - 2, `HEDEF: ${KIND_NAME[t.def.kind]!.toUpperCase()}`, 0xffe27a);
    }
  }

  function start(mode: Mode): void {
    state.mode = mode;
    state.score = [0, 0];
    state.round = 0;
    state.inMenu = false;
    $('menu').hidden = true;
    $('hud').hidden = false;
    $('touchui').hidden = !isTouch;
    tMode.hidden = mode !== 'duel';
    $('keys').innerHTML = '<span><kbd>N</kbd> sonraki tur</span><span><kbd>Space</kbd> durdur</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> hız</span><span><kbd>Esc</kbd> menü</span>';
    state.paused = false;
    state.timeScale = 1;
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
    if (state.mode === 'duel') {
      const [p, e] = state.match.combatants;
      captain = new CaptainPilot(p, e, AI_PROFILES[p.blueprintId]?.range ?? 40);
    } else captain = null;
    setControl(state.control);
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
      if (input.hit('Space')) state.paused = !state.paused;
      if (input.hit('Digit1')) state.timeScale = 0.5;
      if (input.hit('Digit2')) state.timeScale = 1;
      if (input.hit('Digit3')) state.timeScale = 2;
      if (input.hit('Tab') && state.mode === 'duel') setControl(state.control === 'captain' ? 'helm' : 'captain');
      if (input.hit('KeyF')) state.assist = !state.assist;
      if (input.hit('KeyH') && captain) captain.holdFire = !captain.holdFire;
      if (input.hit('KeyM')) sfx.setMuted(!sfx.muted);
      if (input.hit('KeyB')) scene.setBloom(!scene.bloom);
      const shift = input.down('ShiftLeft') || input.down('ShiftRight');
      state.slow = shift && state.control === 'helm';

      if (player && captain && state.control === 'captain') {
        // Orders: right-click goes there (or locks onto the enemy), right-drag draws a route.
        if (input.mouse.rightHit) drag = { sx: input.mouse.x, sy: input.mouse.y, pts: [mouseW] };
        if (drag && input.mouse.right) {
          const l = drag.pts[drag.pts.length - 1]!;
          if (Math.hypot(mouseW.x - l.x, mouseW.y - l.y) > 1.5) drag.pts.push(mouseW);
        }
        if (drag && input.mouse.rightUp) {
          const moved = Math.hypot(input.mouse.x - drag.sx, input.mouse.y - drag.sy) > 10 || drag.pts.length > 3;
          if (!moved && pickEnemyTile(m, mouseW)) captain.order = { kind: 'engage' };
          else if (!moved) issuePath([mouseW], shift);
          else issuePath(simplify(drag.pts), shift);
          drag = null;
        }
        if (input.mouse.leftHit) setTarget(m, pickEnemyTile(m, mouseW));
        for (const g of input.gestures) {
          const pts = g.pts.map((p) => scene.screenToWorld(p.x, p.y));
          const tile = g.tap ? pickEnemyTile(m, pts[0]!) : null;
          if (tile) {
            setTarget(m, tile);
            captain.order = { kind: 'engage' };
          } else if (g.tap) issuePath([pts[0]!], false);
          else issuePath(simplify(pts), false);
        }
      } else if (player) {
        player.input.aimLaser = undefined;
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
      let scale = state.paused ? 0 : state.timeScale;
      if (state.slow) scale *= 0.25;
      if (state.killCam > 0) {
        state.killCam -= realDt;
        scale = Math.min(scale, 0.3);
      }
      $('pausetag').hidden = !state.paused;
      if (state.hitStop > 0) {
        state.hitStop -= realDt;
        scale = 0;
      }
      $('slowmo').classList.toggle('on', (scale > 0 && scale < 1) || state.paused);

      state.acc += realDt * scale;
      let steps = 0;
      while (state.acc >= DT && steps < 8) {
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
      drawOrders(m, player, mouseW);
      if (player && state.control === 'helm' && player.controllable && m.world.ships.includes(enemy) && enemy.controllable) {
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

  /** Dashed line in screen space. */
  function dashed(g: Graphics, pts: { x: number; y: number }[], color: number, alpha: number, dash = 8, gap = 6): void {
    let on = true;
    let left = dash;
    for (let i = 1; i < pts.length; i++) {
      let ax = pts[i - 1]!.x;
      let ay = pts[i - 1]!.y;
      const bx = pts[i]!.x;
      const by = pts[i]!.y;
      let seg = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / (seg || 1);
      const uy = (by - ay) / (seg || 1);
      while (seg > 0) {
        const step = Math.min(left, seg);
        const nx = ax + ux * step;
        const ny = ay + uy * step;
        if (on) g.moveTo(ax, ay).lineTo(nx, ny);
        ax = nx;
        ay = ny;
        seg -= step;
        left -= step;
        if (left <= 0) {
          on = !on;
          left = on ? dash : gap;
        }
      }
    }
    g.stroke({ width: 2, color, alpha, cap: 'round' });
  }

  /** Captain-mode overlays: route, drag preview, lock ring, target bracket, hover. */
  function drawOrders(m: Match, player: Ship | null, mouseW: Point): void {
    const tip = $('tip');
    tip.hidden = true;
    if (!player || !captain || state.control !== 'captain') return;
    const g = crosshair;
    const pc = player.body.getWorldCenter();
    const ps = toScreen(pc.x, pc.y);
    const o = captain.order;
    if (o.kind === 'path' && player.controllable) {
      const pts = [ps, ...o.points.map((p) => toScreen(p.x, p.y))];
      dashed(g, pts, 0x9ff3dc, 0.8);
      for (const p of pts.slice(1, -1)) g.circle(p.x, p.y, 3).fill({ color: 0x9ff3dc, alpha: 0.8 });
      const end = pts[pts.length - 1]!;
      const pulse = 8 + Math.sin(state.time * 5) * 2;
      g.circle(end.x, end.y, pulse).stroke({ width: 2, color: 0x9ff3dc, alpha: 0.9 });
      g.circle(end.x, end.y, 2.5).fill({ color: 0x9ff3dc });
    }
    const livePts = drag ? drag.pts : input.gesture ? input.gesture.pts.map((p) => scene.screenToWorld(p.x, p.y)) : null;
    if (livePts && livePts.length > 1) dashed(g, [ps, ...livePts.map((p) => toScreen(p.x, p.y))], 0xe6fff8, 0.55, 5, 5);
    const enemy = m.combatants[1];
    if (!m.world.ships.includes(enemy) || !enemy.controllable) return;
    const ec = enemy.body.getWorldCenter();
    const es = toScreen(ec.x, ec.y);
    if (o.kind === 'engage') {
      const r = captain.range * scene.cam.zoom;
      const ring: { x: number; y: number }[] = [];
      for (let i = 0; i <= 64; i++) ring.push({ x: es.x + Math.cos((i / 64) * Math.PI * 2) * r, y: es.y + Math.sin((i / 64) * Math.PI * 2) * r });
      dashed(g, ring, 0x9ff3dc, 0.3, 6, 8);
      dashed(g, [ps, es], 0x9ff3dc, 0.25, 4, 8);
    }
    const tileBox = (lx: number, ly: number, pad: number) => {
      const c = [
        [lx - pad, ly - pad],
        [lx + pad, ly - pad],
        [lx + pad, ly + pad],
        [lx - pad, ly + pad],
      ].map(([x, y]) => {
        const w = enemy.body.getWorldPoint({ x: x!, y: y! });
        return toScreen(w.x, w.y);
      });
      return c.flatMap((p) => [p.x, p.y]);
    };
    if (captain.target) {
      // Corner-bracket reticle with a minimum on-screen size, plus the exact tile outline.
      const w = enemy.body.getWorldPoint(captain.target);
      const c = toScreen(w.x, w.y);
      const s = Math.max(16, scene.cam.zoom * 1.1) + Math.sin(state.time * 6) * 2;
      const k = s * 0.45;
      const col = captain.holdFire ? 0x8f7cff : 0xffe27a;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        g.moveTo(c.x + sx * s, c.y + sy * (s - k))
          .lineTo(c.x + sx * s, c.y + sy * s)
          .lineTo(c.x + sx * (s - k), c.y + sy * s);
      }
      g.stroke({ width: 2.5, color: col, alpha: 0.95 });
      g.poly(tileBox(captain.target.x, captain.target.y, 0.5)).stroke({ width: 1.5, color: col, alpha: 0.8 });
      dashed(g, [ps, c], col, 0.25, 3, 7);
    }
    const hover = input.mouse.inside && !drag ? pickEnemyTile(m, mouseW) : null;
    if (hover) {
      g.poly(tileBox(hover.x, hover.y, 0.55)).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
      tip.hidden = false;
      tip.textContent = `${KIND_NAME[hover.def.kind]} · %${Math.round((hover.hp / hover.def.hp) * 100)}${hover.def.power < 0 ? (hover.powered ? ' · çalışıyor' : ' · güçsüz') : ''}`;
      tip.style.transform = `translate(${input.mouse.x + 16}px, ${input.mouse.y + 14}px)`;
    }
  }

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
    const speed = state.paused ? 'DURDU' : state.timeScale === 1 ? '×1' : state.timeScale === 2 ? '×2' : '×½';
    const ctrl = state.mode === 'watch' ? 'YZ vs YZ' : state.control === 'captain' ? 'KAPTAN' : 'DÜMEN';
    const order = captain && state.control === 'captain' ? ` · ${captain.order.kind === 'path' ? 'ROTADA' : captain.order.kind === 'engage' ? 'KENETLİ' : 'BEKLİYOR'}${captain.holdFire ? ' · ATEŞ TUT' : ''}` : '';
    $('sub').textContent = `TUR ${state.round} · ${m.elapsed.toFixed(0)} sn · ${ctrl} · ${speed}${order}`;
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
