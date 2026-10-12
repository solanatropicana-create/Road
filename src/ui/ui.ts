import type { Game } from '../main';
import { CSS } from './style';
import { PRIO_LABEL, BREED_LABEL } from '../sim/colony';
import { WORK, Work, TASK_LABEL, Task, ChamberKind } from '../sim/types';
import { Ant } from '../sim/ant';
import { SPEEDS, TICK_HZ, DAY_TICKS } from '../config';

const WORK_LABEL: Record<Work, string> = { dig: 'Dig', forage: 'Forage', nurse: 'Nurse', clean: 'Clean' };
const WORK_TASK: Record<Work, number> = { dig: Task.Dig, forage: Task.Forage, nurse: Task.Nurse, clean: Task.Clean };
const CHAMBER_LABEL: Record<ChamberKind, string> = { queen: 'Royal chamber', nursery: 'Nursery', granary: 'Granary', rest: 'Rest chamber' };

const h = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/**
 * The HUD and the colony brain. Mode B: the player never commands an ant.
 * They set what the colony cares about and where it should grow.
 */
export class UI {
  private game: Game;
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private spark: HTMLCanvasElement;
  private markerMode = false;
  private lastPhase = '';
  private lastChambers = 0;
  private refresh = 0;
  private pointer = { x: 0, y: 0, inside: false };

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.spark = document.createElement('canvas');
    this.build();
    this.bindInput(game.renderer.canvas);
  }

  private build(): void {
    const r = this.root;
    // --- field card
    const card = h('div', 'panel');
    card.id = 'card';
    card.innerHTML = `
      <div class="title">UNDERFOOT</div>
      <div class="species">Messor structor · harvester ant</div>
      <div class="pop"><b id="pop">0</b><span>workers</span></div>
      <div class="grid">
        <div><span class="eyebrow">Majors</span><b id="maj">0</b></div>
        <div><span class="eyebrow">Brood</span><b id="brood">0</b></div>
        <div><span class="eyebrow">Seeds</span><b id="food">0</b></div>
      </div>`;
    this.spark.width = 440;
    this.spark.height = 76;
    card.appendChild(this.spark);
    const clock = h('div', 'clock', `<span id="day">Day 1</span><span id="sky">Clear</span><span id="time">09:00</span>`);
    card.appendChild(clock);
    r.appendChild(card);

    // --- colony brain
    const brain = h('div', 'panel');
    brain.id = 'brain';
    brain.innerHTML = `<button class="collapse" id="collapse">hide</button><div class="title">COLONY BRAIN</div>
      <div class="body">
      <div class="hint" style="margin-top:4px">You don't command ants. You decide what the colony cares about; every worker weighs it against its own age and what it sees.</div>
      <h3 class="eyebrow">Work priorities</h3><div id="work"></div>
      <h3 class="eyebrow">Queen</h3>
      <div class="row"><label>Breeding</label><div class="seg" id="breed"></div></div>
      <div class="row"><label>Majors</label><input type="range" id="majors" min="0" max="35" step="1"></div>
      <h3 class="eyebrow">Nest</h3>
      <div class="btns">
        <button class="btn" data-order="nursery">+ Nursery</button>
        <button class="btn" data-order="granary">+ Granary</button>
        <button class="btn" data-order="rest">+ Rest chamber</button>
        <button class="btn" id="deeper">Dig deeper</button>
      </div>
      <div class="btns" style="margin-top:6px; grid-template-columns: 1fr;"><button class="btn" id="mark">Mark where to grow</button></div>
      <div class="queue" id="queue"></div>
      <h3 class="eyebrow">Sandbox</h3>
      <div class="btns"><button class="btn" id="rain">Bring rain</button><button class="btn" id="storm">Storm</button></div>
      <div class="hint">Weather comes on its own every day or two. These let you test a nest's design now.</div>
      </div>`;
    r.appendChild(brain);
    const work = brain.querySelector('#work')!;
    for (const wk of WORK) {
      const row = h('div', 'row', `<label>${WORK_LABEL[wk]}</label>`);
      const seg = h('div', 'seg');
      PRIO_LABEL.forEach((lbl, i) => {
        const b = h('button', '', lbl);
        b.onclick = () => {
          this.game.sim.colony.prio[wk] = i;
          this.syncBrain();
        };
        b.dataset.k = `${wk}:${i}`;
        seg.appendChild(b);
      });
      row.appendChild(seg);
      work.appendChild(row);
      const share = h('div', 'share', '<i></i>');
      share.id = `share-${wk}`;
      work.appendChild(share);
    }
    const breed = brain.querySelector('#breed')!;
    BREED_LABEL.forEach((lbl, i) => {
      const b = h('button', '', lbl);
      b.onclick = () => {
        this.game.sim.colony.breeding = i;
        this.syncBrain();
      };
      breed.appendChild(b);
    });
    const majors = brain.querySelector('#majors') as HTMLInputElement;
    majors.oninput = () => {
      this.game.sim.colony.majorShare = Number(majors.value) / 100;
    };
    brain.querySelectorAll<HTMLElement>('[data-order]').forEach((b) => {
      b.onclick = () => {
        const col = this.game.sim.colony;
        if (col.orders.length < 4) col.orders.push(b.dataset.order as ChamberKind);
        this.syncBrain();
      };
    });
    (brain.querySelector('#deeper') as HTMLElement).onclick = () => {
      if (this.game.sim.nest.deepen()) this.toast('The colony starts a <b>deeper shaft</b>');
    };
    (brain.querySelector('#mark') as HTMLElement).onclick = () => {
      this.markerMode = !this.markerMode;
      this.syncBrain();
    };
    (brain.querySelector('#rain') as HTMLElement).onclick = () => this.game.sim.startRain(false);
    (brain.querySelector('#storm') as HTMLElement).onclick = () => this.game.sim.startRain(true);
    (brain.querySelector('#collapse') as HTMLElement).onclick = () => {
      brain.classList.toggle('collapsed');
      (brain.querySelector('#collapse') as HTMLElement).textContent = brain.classList.contains('collapsed') ? 'show' : 'hide';
    };

    // --- time bar
    const bar = h('div', 'panel');
    bar.id = 'bar';
    const speeds = h('div', 'seg');
    speeds.id = 'speeds';
    const pause = h('button', '', '❚❚');
    pause.onclick = () => {
      this.game.paused = !this.game.paused;
      this.syncBar();
    };
    speeds.appendChild(pause);
    SPEEDS.forEach((s, i) => {
      const b = h('button', '', `${s}×`);
      b.onclick = () => {
        this.game.setSpeed(i);
        this.syncBar();
      };
      speeds.appendChild(b);
    });
    bar.appendChild(speeds);
    const zoom = h('div', 'seg');
    const zin = h('button', '', '+');
    const zout = h('button', '', '−');
    const zfit = h('button', '', 'Fit');
    zin.onclick = () => this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1.5);
    zout.onclick = () => this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1 / 1.5);
    zfit.onclick = () => {
      this.game.selected = null;
      this.game.cam.fit();
    };
    zoom.append(zout, zin, zfit);
    bar.appendChild(zoom);
    const perf = h('div', 'perf');
    perf.id = 'perf';
    bar.appendChild(perf);
    r.appendChild(bar);

    // --- inspector, prompt, toasts, tooltip, game over
    const insp = h('div', 'panel');
    insp.id = 'inspect';
    r.appendChild(insp);
    const prompt = h('div', 'panel');
    prompt.id = 'prompt';
    prompt.innerHTML = `<div class="eyebrow">Nuptial flight</div><h2>Where should the queen land?</h2><p>Click the ground. She will tear off her wings, dig a burrow and raise her first daughters alone.</p>
      <button class="btn" id="anywhere" style="display:inline-block; margin-top:12px; padding:7px 14px">Let her choose</button>`;
    r.appendChild(prompt);
    (prompt.querySelector('#anywhere') as HTMLElement).onclick = () => {
      const sim = this.game.sim;
      // A spot near the middle that suits her; the click path handles the camera and the toast.
      for (let k = 0; k < 200; k++) {
        const x = Math.round(sim.world.w * (0.3 + Math.random() * 0.4));
        if (sim.canFound(x)) {
          const cam = this.game.cam;
          const s = cam.toScreen(x, sim.world.ground[x]!);
          this.click(s.x, s.y);
          return;
        }
      }
    };
    // Small screens start with the brain folded away so the slice stays visible.
    if (innerWidth < 760) {
      brain.classList.add('collapsed');
      (brain.querySelector('#collapse') as HTMLElement).textContent = 'show';
    }
    const toasts = h('div');
    toasts.id = 'toasts';
    r.appendChild(toasts);
    const tip = h('div');
    tip.id = 'tip';
    r.appendChild(tip);
    const over = h('div', 'panel');
    over.id = 'over';
    r.appendChild(over);

    for (const id of ['pop', 'maj', 'brood', 'food', 'day', 'sky', 'time', 'queue', 'perf', 'inspect', 'prompt', 'toasts', 'tip', 'over', 'brain', 'mark']) {
      this.els[id] = r.querySelector(`#${id}`) as HTMLElement;
    }
    this.syncBrain();
    this.syncBar();
  }

  toast(html: string): void {
    const t = h('div', 'toast', html);
    this.els.toasts!.appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }

  private syncBrain(): void {
    const col = this.game.sim.colony;
    this.root.querySelectorAll<HTMLElement>('#work .seg button').forEach((b) => {
      const [wk, i] = b.dataset.k!.split(':');
      b.classList.toggle('on', col.prio[wk as Work] === Number(i));
    });
    this.root.querySelectorAll<HTMLElement>('#breed button').forEach((b, i) => b.classList.toggle('on', col.breeding === i));
    (this.root.querySelector('#majors') as HTMLInputElement).value = String(Math.round(col.majorShare * 100));
    this.els.mark!.classList.toggle('on', this.markerMode);
    this.els.mark!.textContent = this.markerMode ? 'Click underground to mark…' : 'Mark where to grow';
    this.els.queue!.textContent = col.orders.length ? `Queued: ${col.orders.map((o) => CHAMBER_LABEL[o]).join(' → ')}` : '';
  }

  private syncBar(): void {
    const btns = this.root.querySelectorAll<HTMLElement>('#speeds button');
    btns.forEach((b, i) => {
      if (i === 0) b.classList.toggle('on', this.game.paused);
      else b.classList.toggle('on', !this.game.paused && SPEEDS[i - 1] === this.game.speed);
    });
  }

  // ------------------------------------------------------------------ input

  private bindInput(canvas: HTMLCanvasElement): void {
    const game = this.game;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragDist = 0;
    let pinch0 = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDist = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, inside: true };
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch0 > 0) game.cam.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinch0);
        pinch0 = d;
        dragDist = 99;
        return;
      }
      dragDist += Math.abs(dx) + Math.abs(dy);
      if (dragDist > 5) {
        game.cam.pan(dx, dy);
        if (game.selected) game.selected = null;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e: PointerEvent): void => {
      const had = pointers.delete(e.pointerId);
      if (had && pointers.size === 0 && dragDist <= 5) this.click(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    canvas.addEventListener('pointerleave', () => (this.pointer.inside = false));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        game.cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        game.paused = !game.paused;
        this.syncBar();
        e.preventDefault();
      } else if (e.key >= '1' && e.key <= '5') {
        game.setSpeed(Number(e.key) - 1);
        this.syncBar();
      } else if (e.key === 'f' || e.key === 'F') {
        game.selected = null;
        game.cam.fit();
      } else if (e.key === 'Escape') {
        game.selected = null;
        this.markerMode = false;
        this.syncBrain();
      } else if (e.key === '+' || e.key === '=') {
        game.cam.zoomAt(game.cam.screenW / 2, game.cam.screenH / 2, 1.4);
      } else if (e.key === '-') {
        game.cam.zoomAt(game.cam.screenW / 2, game.cam.screenH / 2, 1 / 1.4);
      }
    });
  }

  private click(sx: number, sy: number): void {
    const game = this.game;
    const sim = game.sim;
    const p = game.cam.toWorld(sx, sy);
    if (sim.phase === 'choose') {
      if (sim.canFound(p.x)) {
        sim.found(p.x);
        this.toast('The queen lands and <b>tears off her wings</b>');
        game.cam.tzoom = Math.max(game.cam.tzoom, game.cam.fitZoom() * 2.4);
        game.cam.tx = p.x;
        game.cam.ty = sim.world.ground[Math.round(p.x)]! + 10;
      }
      return;
    }
    if (this.markerMode) {
      const w = sim.world;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (w.inside(x, y) && y > w.ground[x]! + 10) {
        sim.nest.marker = { x, y };
        this.toast('The colony will <b>grow toward the marker</b>');
      }
      this.markerMode = false;
      this.syncBrain();
      return;
    }
    // Select the nearest ant under the cursor.
    let best: Ant | null = null;
    let bd = (8 / game.cam.zoom) ** 2 + 6;
    const col = sim.colony;
    const all = col.queen ? [col.queen, ...col.ants] : col.ants;
    for (const a of all) {
      if (!a.alive) continue;
      const d = (a.x - p.x) ** 2 + (a.y - 2 - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    game.selected = best;
    if (best) game.cam.tzoom = Math.max(game.cam.tzoom, 7);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    const game = this.game;
    const sim = game.sim;
    const col = sim.colony;
    const phase = sim.phase;
    if (phase !== this.lastPhase) {
      if (phase === 'growing' && this.lastPhase === 'founding') this.toast('The first workers have <b>hatched</b>');
      if (phase === 'failed') this.showOver();
      this.els.prompt!.style.display = phase === 'choose' ? 'block' : 'none';
      this.lastPhase = phase;
    }
    if (sim.nest.chambers.length !== this.lastChambers) {
      const c = sim.nest.chambers[sim.nest.chambers.length - 1];
      if (c && this.lastChambers > 0) this.toast(`New chamber planned: <b>${CHAMBER_LABEL[c.kind]}</b>`);
      this.lastChambers = sim.nest.chambers.length;
      this.syncBrain();
    }
    while (sim.events.length) this.toast(sim.events.shift()!);
    this.tooltip();
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.25;

    this.els.pop!.textContent = String(col.adults);
    this.els.maj!.textContent = String(col.majors);
    const [e, l, p] = col.broodCounts();
    this.els.brood!.textContent = String(e + l + p);
    this.els.brood!.title = `${e} eggs · ${l} larvae · ${p} pupae`;
    this.els.food!.textContent = String(col.stored);
    this.els.food!.classList.toggle('warn', col.starving);
    this.els.day!.textContent = `Day ${sim.day}`;
    this.els.sky!.textContent = sim.weather.rain > 0.15 ? (sim.weather.storm ? 'Storm' : 'Rain') : sim.dayT < 0.23 || sim.dayT > 0.8 ? 'Night' : 'Clear';
    const mins = Math.floor(sim.dayT * 24 * 60);
    this.els.time!.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    this.els.perf!.textContent = `${(game.tps / TICK_HZ).toFixed(1)}× real`;
    const adults = Math.max(1, col.adults);
    for (const wk of WORK) {
      const n = col.ants.filter((a) => a.task === WORK_TASK[wk]).length;
      const bar = this.root.querySelector(`#share-${wk} i`) as HTMLElement;
      bar.style.width = `${Math.round((n / adults) * 100)}%`;
    }
    this.drawSpark();
    this.inspector();
  }

  private drawSpark(): void {
    const c = this.spark.getContext('2d')!;
    const W = this.spark.width;
    const H = this.spark.height;
    c.clearRect(0, 0, W, H);
    const hist = this.game.sim.colony.history;
    if (hist.length < 2) return;
    const n = Math.min(hist.length, 240);
    const pts = hist.slice(hist.length - n);
    let max = 10;
    for (const s of pts) max = Math.max(max, s.pop, s.food);
    const line = (key: 'pop' | 'food', color: string, width: number): void => {
      c.beginPath();
      pts.forEach((s, i) => {
        const x = (i / (n - 1)) * (W - 4) + 2;
        const y = H - 4 - (s[key] / max) * (H - 10);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };
    line('food', 'rgba(226,180,92,0.55)', 2);
    line('pop', 'rgba(239,230,214,0.9)', 3);
  }

  private inspector(): void {
    const a = this.game.selected;
    const el = this.els.inspect!;
    if (!a) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const days = (a.age / DAY_TICKS).toFixed(1);
    const caste = a.caste === 'queen' ? 'Queen' : a.caste === 'soldier' ? 'Major worker' : 'Minor worker';
    const life = a.caste === 'queen' ? 'decades' : `${Math.round(a.ageFrac * 100)}% of life`;
    el.innerHTML = `<div class="eyebrow">Following · Esc to release</div><div class="name">${a.name}</div>
      <dl><dt>Caste</dt><dd>${caste}</dd><dt>Age</dt><dd>${days} days · ${life}</dd>
      <dt>Doing</dt><dd>${a.caste === 'queen' ? (a.phase < 2 ? 'digging her burrow' : 'laying eggs') : TASK_LABEL[a.task]}</dd>
      <dt>Carrying</dt><dd>${a.carryBrood ? 'an egg' : Ant.carryLabel(a.carry)}</dd>
      ${a.delivered ? `<dt>Harvest</dt><dd>${a.delivered} seeds</dd>` : ''}</dl>`;
  }

  private tooltip(): void {
    const tip = this.els.tip!;
    const game = this.game;
    if (!this.pointer.inside) {
      tip.style.display = 'none';
      return;
    }
    const p = game.cam.toWorld(this.pointer.x, this.pointer.y);
    const w = game.sim.world;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (!w.inside(x, y)) {
      tip.style.display = 'none';
      return;
    }
    const c = game.sim.nest.chamberAt(y * w.w + x);
    if (!c || !c.ready) {
      tip.style.display = 'none';
      return;
    }
    let body = '';
    if (c.kind === 'granary' || c.kind === 'queen') body = `${c.seeds} seeds stored`;
    if (c.kind === 'nursery') {
      const n = game.sim.colony.brood.filter((b) => !b.carried && game.sim.nest.chamberAt(b.y * w.w + b.x) === c).length;
      body = `${n} brood · ${c.floor.length} spots`;
    }
    if (c.kind === 'rest') body = 'workers resting between jobs';
    tip.innerHTML = `<b>${CHAMBER_LABEL[c.kind]}</b><br>${body}`;
    tip.style.display = 'block';
    tip.style.left = `${this.pointer.x + 14}px`;
    tip.style.top = `${this.pointer.y + 14}px`;
  }

  private showOver(): void {
    const sim = this.game.sim;
    const peak = Math.max(0, ...sim.colony.history.map((s) => s.pop));
    const el = this.els.over!;
    el.style.display = 'block';
    el.innerHTML = `<div class="eyebrow">Day ${sim.day}</div><h2>The colony has died out</h2>
      <p>The queen cannot forage or tend brood alone. At its height the colony had ${peak} workers.</p>
      <button class="btn" id="again" style="padding:8px 16px">Found a new colony</button>`;
    (el.querySelector('#again') as HTMLElement).onclick = () => location.reload();
  }
}
