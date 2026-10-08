import { clamp, formatNum } from '../core/math';
import { BOSSES, islandRadiusAt, WORLD } from '../data/world';
import type { Mystery } from '../game/spawner';
import type { GameScene } from '../render/scene';
import type { Boat } from '../sim/boat';
import type { Sim } from '../sim/world';
import { ABILITY_ICON, COIN, GEM } from './icons';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

interface Label {
  el: HTMLDivElement;
  hex: HTMLDivElement;
  bounty: HTMLSpanElement;
  bar: HTMLElement;
  name: HTMLDivElement;
  used: boolean;
  key: string;
}

interface Floater {
  el: HTMLDivElement;
  x: number; y: number; z: number;
  t: number;
  life: number;
}

export interface HudState {
  gold: number;
  gems: number;
  level: number;
  discovered: Set<string>;
  nearPort: string | null;
}

export class Hud {
  readonly root: HTMLDivElement;
  private cargoBar: HTMLElement;
  private cargoTxt: HTMLElement;
  private cargoWrap: HTMLElement;
  private hpBar: HTMLElement;
  private lvl: HTMLDivElement;
  private goldTxt: HTMLElement;
  private gemTxt: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private miniT = 0;
  private windArrow: HTMLElement;
  private windEff: HTMLElement;
  private banner: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastT = 0;
  private abilityBtn: HTMLDivElement;
  private abilityCd: HTMLDivElement;
  private abilityCdt: HTMLDivElement;
  private abilityIco: HTMLDivElement;
  private abilityLbl: HTMLDivElement;
  readonly portBtn: HTMLButtonElement;
  readonly pauseBtn: HTMLDivElement;
  private labels: HTMLDivElement;
  private indicators: HTMLDivElement;
  private floatersEl: HTMLDivElement;
  private vignette: HTMLDivElement;
  private labelPool: Label[] = [];
  private indPool: HTMLDivElement[] = [];
  private floaters: Floater[] = [];
  onAbility: (() => void) | null = null;
  onPort: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onMap: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'hud');
    this.root.style.cssText = 'position:absolute;inset:0;';
    parent.appendChild(this.root);

    this.labels = h('div', 'labels');
    this.indicators = h('div', 'indicators');
    this.floatersEl = h('div', 'floaters');
    this.vignette = h('div', 'vignette');
    this.root.append(this.vignette, this.labels, this.floatersEl, this.indicators);

    const top = h('div', 'hud-top');
    this.pauseBtn = h('div', 'btn-round tap stroke', 'II');
    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.cargoWrap = h('div', 'cargo');
    this.lvl = h('div', 'hex stroke', '1');
    const box = h('div', 'box');
    const row = h('div', 'row stroke');
    row.innerHTML = COIN;
    this.cargoTxt = h('span', '', '0/0');
    row.appendChild(this.cargoTxt);
    const bar = h('div', 'bar');
    this.cargoBar = h('i');
    bar.appendChild(this.cargoBar);
    const hp = h('div', 'bar hp');
    this.hpBar = h('i');
    hp.appendChild(this.hpBar);
    box.append(row, bar, hp);
    this.cargoWrap.append(this.lvl, box);
    const money = h('div', 'money');
    const gp = h('div', 'pill stroke');
    this.goldTxt = h('span', '', '0');
    gp.append(this.goldTxt);
    gp.insertAdjacentHTML('beforeend', COIN);
    const gm = h('div', 'pill stroke');
    this.gemTxt = h('span', '', '0');
    gm.append(this.gemTxt);
    gm.insertAdjacentHTML('beforeend', GEM);
    money.append(gp, gm);
    top.append(this.pauseBtn, this.cargoWrap, money);
    this.root.appendChild(top);

    const mm = h('div', 'minimap tap');
    this.mini = h('canvas');
    this.mini.width = 232; this.mini.height = 232;
    mm.appendChild(this.mini);
    mm.addEventListener('click', () => this.onMap?.());
    this.miniCtx = this.mini.getContext('2d')!;
    this.root.appendChild(mm);

    const wind = h('div', 'wind stroke');
    this.windArrow = h('div', 'arrow', '➤');
    this.windEff = h('div', 'eff', '');
    wind.append(h('span', '', 'Rüzgar'), this.windArrow, this.windEff);
    this.root.appendChild(wind);

    this.banner = h('div', 'zone-banner stroke');
    this.toastEl = h('div', 'toast stroke');
    this.root.append(this.banner, this.toastEl);

    this.abilityBtn = h('div', 'ability tap');
    this.abilityCd = h('div', 'cd');
    this.abilityIco = h('div', 'ico');
    this.abilityCdt = h('div', 'cdt stroke');
    this.abilityLbl = h('div', 'lbl stroke');
    this.abilityBtn.append(this.abilityCd, this.abilityIco, this.abilityCdt, this.abilityLbl);
    this.abilityBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onAbility?.(); });
    this.root.appendChild(this.abilityBtn);

    this.portBtn = h('button', 'btn blue port-btn tap stroke', '⚓ Limana Gir');
    this.portBtn.addEventListener('click', () => this.onPort?.());
    this.root.appendChild(this.portBtn);
  }

  show(on: boolean) {
    this.root.style.display = on ? 'block' : 'none';
  }

  toast(msg: string, secs = 2.6) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = secs;
  }

  zoneBanner(name: string, sub: string) {
    this.banner.innerHTML = `${name}<small>${sub}</small>`;
    this.banner.classList.add('show');
    window.setTimeout(() => this.banner.classList.remove('show'), 2600);
  }

  floater(text: string, cls: string, x: number, y: number, z: number, life = 1.1) {
    let f = this.floaters.find((q) => q.t >= q.life);
    if (!f) {
      if (this.floaters.length > 60) return;
      const el = h('div', 'floater stroke');
      this.floatersEl.appendChild(el);
      f = { el, x, y, z, t: 0, life };
      this.floaters.push(f);
    }
    f.el.className = `floater stroke ${cls}`;
    f.el.textContent = text;
    f.x = x + (Math.random() - 0.5) * 2; f.y = y; f.z = z + (Math.random() - 0.5) * 2;
    f.t = 0; f.life = life;
    f.el.style.display = 'block';
  }

  hurt(k: number) {
    this.vignette.style.opacity = String(clamp(k, 0, 1));
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, sim: Sim, scene: GameScene, st: HudState, mysteries: Mystery[]) {
    const p = sim.player;
    const W = window.innerWidth, H = window.innerHeight;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    this.goldTxt.textContent = formatNum(st.gold);
    this.gemTxt.textContent = formatNum(st.gems);
    if (p) {
      this.lvl.textContent = String(st.level);
      this.cargoTxt.textContent = `${formatNum(p.cargo)}/${formatNum(p.hold)}`;
      this.cargoBar.style.width = `${(100 * p.cargo) / p.hold}%`;
      this.cargoWrap.classList.toggle('full', p.cargo >= p.hold);
      this.hpBar.style.width = `${100 * p.hpFrac}%`;
      this.hpBar.style.background = p.hpFrac < 0.3 ? 'var(--red)' : p.hpFrac < 0.6 ? 'var(--yellow)' : 'var(--green)';
      const ab = p.ability;
      this.abilityIco.textContent = ABILITY_ICON[ab.id];
      this.abilityLbl.textContent = ab.name;
      const cdk = p.abilityCd / ab.cooldown;
      this.abilityCd.style.background = cdk > 0 ? `conic-gradient(rgba(10,20,30,.65) ${cdk * 360}deg, transparent 0)` : 'none';
      this.abilityCdt.textContent = p.abilityCd > 0 ? String(Math.ceil(p.abilityCd)) : '';
      this.abilityIco.style.opacity = p.abilityCd > 0 ? '0.4' : '1';
      this.abilityBtn.classList.toggle('on', p.abilityActive);
      // Wind arrow relative to screen, efficiency for the current heading.
      this.windArrow.style.transform = `rotate(${sim.wind.angle}rad)`;
      const eff = p.def.windInfluence > 0 ? Math.round(p.windEff * 100) : 100;
      this.windEff.textContent = p.def.windInfluence > 0 ? `%${eff}` : 'kürek';
      this.windEff.style.color = eff >= 100 ? '#9effa8' : eff < 80 ? '#ff9b8e' : '#fff';
      this.hurt(p.hurtT * 2.2 + (p.hpFrac < 0.25 && !p.dead ? 0.25 + 0.15 * Math.sin(sim.t * 6) : 0));
    }
    this.portBtn.classList.toggle('show', !!st.nearPort && !!p && !p.dead);

    this.updateLabels(sim, scene, st, W, H);
    this.updateIndicators(sim, scene, st, mysteries, W, H);
    this.updateFloaters(dt, scene, W, H);
    this.miniT -= dt;
    if (this.miniT <= 0 && p) {
      this.miniT = 0.15;
      this.drawMini(sim, st, mysteries);
    }
  }

  private updateLabels(sim: Sim, scene: GameScene, st: HudState, W: number, H: number) {
    for (const l of this.labelPool) l.used = false;
    const p = sim.player;
    let i = 0;
    for (const b of sim.boats) {
      if (b.dead || (b.invisible && b !== p)) continue;
      if (p && b !== p && Math.hypot(b.x - p.x, b.z - p.z) > 260) continue;
      const top = b.heave + b.def.masts.reduce((m, x) => Math.max(m, x.h), 4) * 0.55 + b.deck + 3;
      const [sx, sy, on] = scene.project(b.x, top, b.z, W, H);
      if (!on) continue;
      const l = this.labelPool[i] ?? this.makeLabel();
      i++;
      l.used = true;
      this.fillLabel(l, b, p, st.level);
      l.el.style.transform = `translate(${sx - 40}px, ${sy - 34}px)`;
    }
    for (const l of this.labelPool) l.el.style.display = l.used ? 'flex' : 'none';
  }

  private makeLabel(): Label {
    const el = h('div', 'lbl stroke');
    const hex = h('div', 'hex');
    const box = h('div', 'box');
    const bounty = h('div', 'bounty');
    bounty.innerHTML = COIN;
    const txt = h('span');
    bounty.appendChild(txt);
    const bar = h('div', 'bar');
    const fill = h('i');
    bar.appendChild(fill);
    box.append(bounty, bar);
    const name = h('div', 'name');
    el.append(name, hex, box);
    this.labels.appendChild(el);
    const l: Label = { el, hex, bounty: txt, bar: fill, name, used: false, key: '' };
    this.labelPool.push(l);
    return l;
  }

  private fillLabel(l: Label, b: Boat, p: Boat | null, myLevel: number) {
    const me = b === p;
    let cls = 'ally';
    if (b.bossId) cls = 'boss';
    else if (!me) {
      const d = b.level - myLevel;
      cls = d <= -3 ? 'easy' : d >= 3 ? 'hard' : 'even';
    }
    const key = `${cls}${b.level}${me}${b.bossId ?? ''}`;
    if (key !== l.key) {
      l.key = key;
      l.hex.className = `hex ${cls}`;
      l.hex.textContent = String(me ? myLevel : b.level);
      l.el.classList.toggle('me', me);
      l.name.textContent = b.bossId ? `☠ ${b.name}` : '';
    }
    l.bounty.textContent = formatNum(b.cargo);
    l.bar.style.width = `${100 * b.hpFrac}%`;
    l.bar.style.background = me ? 'var(--green)' : b.faction === 'merchant' ? '#6fc3ff' : b.hpFrac < 0.3 ? 'var(--red)' : '#5fd36c';
  }

  private ind(i: number): HTMLDivElement {
    let el = this.indPool[i];
    if (!el) {
      el = h('div', 'ind stroke', '<div class="ic"></div><div class="d"></div>');
      this.indicators.appendChild(el);
      this.indPool.push(el);
    }
    return el;
  }

  private updateIndicators(sim: Sim, scene: GameScene, st: HudState, mysteries: Mystery[], W: number, H: number) {
    const p = sim.player;
    let n = 0;
    if (p && !scene.harborView) {
      const targets: { x: number; z: number; icon: string; cls: string; always: boolean }[] = [];
      for (const port of WORLD.ports) {
        targets.push({ x: port.x, z: port.z, icon: '⚓', cls: 'port', always: st.discovered.has(port.id) || Math.hypot(port.x - p.x, port.z - p.z) < 900 });
      }
      for (const m of mysteries) targets.push({ x: m.x, z: m.z, icon: '?', cls: 'myst', always: true });
      for (const bd of BOSSES) {
        const d = Math.hypot(bd.x - p.x, bd.z - p.z);
        if (d < 900) {
          const alive = sim.boats.find((b) => b.bossId === bd.id && !b.dead);
          targets.push({ x: alive ? alive.x : bd.x, z: alive ? alive.z : bd.z, icon: '☠', cls: 'boss', always: true });
        }
      }
      for (const l of sim.loot) {
        if (Math.hypot(l.x - p.x, l.z - p.z) < 200) targets.push({ x: l.x, z: l.z, icon: l.kind === 'gem' ? '💎' : l.kind === 'crate' ? '📦' : '💰', cls: 'loot', always: false });
      }
      const cam = scene.camera;
      cam.updateMatrixWorld();
      const margin = 34;
      // Centre of the view on screen (the camera target).
      const [cx, cy] = scene.project(scene.camTarget.x, 0, scene.camTarget.z, W, H);
      const placed: [number, number][] = [];
      for (const t of targets) {
        if (!t.always) continue;
        const dist = Math.hypot(t.x - p.x, t.z - p.z);
        const [sx, sy, on] = scene.project(t.x, 2, t.z, W, H);
        const el = this.ind(n++);
        el.className = `ind stroke ${t.cls}`;
        (el.firstChild as HTMLElement).textContent = t.icon;
        (el.lastChild as HTMLElement).textContent = `${Math.round(dist)} m`;
        let x = sx, y = sy;
        if (on && t.cls !== 'port') {
          y -= 30;
        } else if (!on) {
          // Off-screen: slide along the edge in the target's direction.
          const dx = t.x - scene.camTarget.x, dz = t.z - scene.camTarget.z;
          const a = Math.atan2(dz, dx);
          const ca = Math.cos(a), sa = Math.sin(a);
          const kx = ca > 0 ? (W - margin - cx) / ca : ca < 0 ? (margin - cx) / ca : Infinity;
          const ky = sa > 0 ? (H - margin - 40 - cy) / sa : sa < 0 ? (margin + 80 - cy) / sa : Infinity;
          const k = Math.min(kx, ky);
          x = cx + ca * k; y = cy + sa * k;
        } else {
          y -= 40;
        }
        x = clamp(x, margin, W - margin - (y > H - 150 ? 90 : 0));
        y = clamp(y, H < 500 ? 80 : 150, H - margin - 30);
        // Nudge apart icons that pile up on the same stretch of edge.
        for (let k = 0; k < 6; k++) {
          const hit = placed.find(([px, py]) => Math.abs(px - x) < 44 && Math.abs(py - y) < 52);
          if (!hit) break;
          if (x <= margin + 1 || x >= W - margin - 91) y = hit[1] + 54; else x = hit[0] + 46;
        }
        placed.push([x, y]);
        el.style.display = 'flex';
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
    }
    for (let i = n; i < this.indPool.length; i++) this.indPool[i].style.display = 'none';
  }

  private updateFloaters(dt: number, scene: GameScene, W: number, H: number) {
    for (const f of this.floaters) {
      if (f.t >= f.life) continue;
      f.t += dt;
      if (f.t >= f.life) { f.el.style.display = 'none'; continue; }
      const k = f.t / f.life;
      const [sx, sy, on] = scene.project(f.x, f.y + k * 4, f.z, W, H);
      if (!on) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      f.el.style.opacity = String(1 - k * k);
      const s = k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3;
      f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${s})`;
    }
  }

  private drawMini(sim: Sim, st: HudState, mysteries: Mystery[]) {
    const p = sim.player!;
    const g = this.miniCtx;
    const S = this.mini.width;
    const R = 420; // metres shown from centre to edge
    const k = S / 2 / R;
    const tx = (x: number) => S / 2 + (x - p.x) * k;
    const tz = (z: number) => S / 2 + (z - p.z) * k;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#1b6d9b';
    g.fillRect(0, 0, S, S);
    // Zone rings
    g.lineWidth = 2;
    for (const z of WORLD.zones) {
      if (!z.r0) continue;
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.arc(tx(0), tz(0), z.r0 * k, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(255,80,60,0.6)';
    g.beginPath(); g.arc(tx(0), tz(0), WORLD.radius * k, 0, Math.PI * 2); g.stroke();
    for (const isl of WORLD.islands) {
      if (Math.abs(isl.x - p.x) > R + isl.r * 1.3 || Math.abs(isl.z - p.z) > R + isl.r * 1.3) continue;
      g.fillStyle = '#e9d9a0';
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const r = islandRadiusAt(isl, a);
        const x = tx(isl.x + Math.cos(a) * r), y = tz(isl.z + Math.sin(a) * r);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
      g.fillStyle = '#7cc650';
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const r = islandRadiusAt(isl, a) * 0.78;
        const x = tx(isl.x + Math.cos(a) * r), y = tz(isl.z + Math.sin(a) * r);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
    }
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const port of WORLD.ports) {
      g.fillStyle = st.discovered.has(port.id) ? '#ffffff' : 'rgba(255,255,255,0.5)';
      g.fillText('⚓', tx(port.x), tz(port.z));
    }
    for (const m of mysteries) { g.fillStyle = '#ffe27a'; g.fillText('?', tx(m.x), tz(m.z)); }
    for (const l of sim.loot) {
      g.fillStyle = l.kind === 'gem' ? '#ff5fd2' : '#ffd34d';
      g.beginPath(); g.arc(tx(l.x), tz(l.z), 4, 0, Math.PI * 2); g.fill();
    }
    for (const b of sim.boats) {
      if (b === p || b.dead || b.invisible) continue;
      g.fillStyle = b.bossId ? '#ffcf3a' : b.faction === 'merchant' ? '#7fd0ff' : b.level - st.level >= 3 ? '#ff4a3c' : b.level - st.level <= -3 ? '#5fe070' : '#ffcd2e';
      g.beginPath(); g.arc(tx(b.x), tz(b.z), b.bossId ? 8 : 5, 0, Math.PI * 2); g.fill();
    }
    // Player arrow
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(p.yaw);
    g.fillStyle = '#fff';
    g.strokeStyle = '#123';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-9, -9); g.lineTo(-4, 0); g.lineTo(-9, 9); g.closePath();
    g.stroke(); g.fill();
    g.restore();
  }
}
