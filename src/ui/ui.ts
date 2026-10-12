import type { Game } from '../main';
import { CSS } from './style';
import { PRIO_LABEL, BREED_LABEL } from '../sim/colony';
import { WORK, Work, TASK_LABEL, Task, ChamberKind } from '../sim/types';
import { Ant } from '../sim/ant';
import { SPEEDS, TICK_HZ, DAY_TICKS } from '../config';
import { ZONE_TINT } from '../render/palette';

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
  /** The field journal: what happened and when, newest last. */
  private journal: { at: string; html: string }[] = [];
  private notesOpen = false;
  private milestone = 0;
  private notedChambers = new Set<number>();
  private firstStore = false;
  private firstMajor = false;
  private drowned = 0;
  private starvedDay = -1;

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
    // What the chamber tints mean (hover a chamber for its contents).
    const legend = h('div', 'legend');
    for (const [kind, label] of [['queen', 'Royal'], ['nursery', 'Nursery'], ['granary', 'Granary'], ['rest', 'Rest']] as const) {
      const c = ZONE_TINT[kind]!;
      legend.appendChild(h('span', '', `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>${label}`));
    }
    card.appendChild(legend);
    const notes = h('div', 'notes', `<div class="notes-head"><span class="eyebrow">Field notes</span><button class="collapse" id="notes-all">all</button></div><ol id="notes"></ol>`);
    card.appendChild(notes);
    (notes.querySelector('#notes-all') as HTMLElement).onclick = () => {
      this.notesOpen = !this.notesOpen;
      notes.classList.toggle('open', this.notesOpen);
      (notes.querySelector('#notes-all') as HTMLElement).textContent = this.notesOpen ? 'less' : 'all';
      this.renderNotes();
    };
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
      <div class="hint">Amber dots show where the colony means to dig. <b>P</b> keeps them on.</div>
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
        this.game.renderer.planFlash = 6;
        this.syncBrain();
      };
    });
    (brain.querySelector('#deeper') as HTMLElement).onclick = () => {
      if (this.game.sim.nest.deepen()) {
        this.toast('The colony starts a <b>deeper shaft</b>');
        this.game.renderer.planFlash = 6;
      }
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
    const manual = (): void => {
      if (this.game.director.active) this.game.director.stop();
    };
    zin.onclick = () => {
      manual();
      this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1.5);
    };
    zout.onclick = () => {
      manual();
      this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1 / 1.5);
    };
    zfit.onclick = () => {
      manual();
      this.game.selected = null;
      this.game.cam.fit();
    };
    zoom.append(zout, zin, zfit);
    bar.appendChild(zoom);
    const watch = h('div', 'seg');
    const watchBtn = h('button', '', 'Watch');
    watchBtn.id = 'watch';
    watchBtn.title = 'Documentary camera (C)';
    watchBtn.onclick = () => this.game.director.toggle();
    watch.appendChild(watchBtn);
    bar.appendChild(watch);
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
    const caption = h('div', '', '<div class="eyebrow">Watching</div><div class="line"></div>');
    caption.id = 'caption';
    r.appendChild(caption);

    for (const id of ['pop', 'maj', 'brood', 'food', 'day', 'sky', 'time', 'queue', 'perf', 'inspect', 'prompt', 'toasts', 'tip', 'over', 'brain', 'mark', 'notes', 'caption', 'watch']) {
      this.els[id] = r.querySelector(`#${id}`) as HTMLElement;
    }
    this.syncBrain();
    this.syncBar();
    this.renderNotes();
  }

  toast(html: string, ms = 5200): void {
    const box = this.els.toasts!;
    // Keep it to a few lines; the oldest make way.
    while (box.children.length >= 3) box.firstElementChild!.remove();
    const t = h('div', 'toast', html);
    t.style.animationDuration = `${ms / 1000}s`;
    box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  /** Write an entry in the field journal (and optionally pop it up as a toast). */
  note(html: string, toast = false): void {
    const sim = this.game.sim;
    const mins = Math.floor(sim.dayT * 24 * 60);
    const at = `D${sim.day} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    this.journal.push({ at, html });
    if (this.journal.length > 80) this.journal.shift();
    this.renderNotes();
    if (toast) this.toast(html);
  }

  private renderNotes(): void {
    const list = this.els.notes;
    if (!list) return;
    const shown = this.notesOpen ? this.journal.slice().reverse() : this.journal.slice(-3).reverse();
    list.innerHTML = shown.map((n) => `<li><time>${n.at}</time><span>${n.html}</span></li>`).join('') || '<li><time></time><span>Nothing yet. Choose where the queen lands.</span></li>';
  }

  /** Things worth writing down, noticed by watching the colony's numbers. */
  private observe(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    const marks = [10, 25, 50, 100, 150, 200, 300, 500];
    while (this.milestone < marks.length && col.adults >= marks[this.milestone]!) {
      this.note(`The colony reaches <b>${marks[this.milestone]}</b> workers`, marks[this.milestone]! >= 50);
      this.milestone++;
    }
    for (const c of sim.nest.chambers) {
      if (!c.ready || this.notedChambers.has(c.id)) continue;
      this.notedChambers.add(c.id);
      const depth = c.floorY - sim.world.ground[Math.round(c.cx)]!;
      this.note(`${CHAMBER_LABEL[c.kind]} finished, <b>${(depth / 10).toFixed(1)} cm</b> down`);
    }
    if (!this.firstStore && col.stored > 0) {
      this.firstStore = true;
      this.note('First seeds laid up in the <b>granary</b>', true);
    }
    if (!this.firstMajor && col.majors > 0) {
      this.firstMajor = true;
      this.note('The first <b>major</b> ecloses: big head, seed-cracking jaws', true);
    }
    const drowned = col.deaths['brood drowned'] ?? 0;
    if (drowned > this.drowned && sim.weather.rain < 0.15) {
      this.note(`Flood: <b>${drowned - this.drowned}</b> brood drowned`, true);
      this.drowned = drowned;
    }
    if ((col.deaths['starvation'] ?? 0) > 0 && col.starving && this.starvedDay !== sim.day) {
      this.starvedDay = sim.day;
      this.note('Workers are <b>starving</b>; foragers can\'t keep up', true);
    }
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
      // Taking the camera by hand ends the documentary.
      if (game.director.active) game.director.stop();
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
        if (game.director.active) game.director.stop();
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
        if (game.director.active) game.director.stop();
        game.selected = null;
        game.cam.fit();
      } else if (e.key === 'p' || e.key === 'P') {
        game.renderer.planAlways = !game.renderer.planAlways;
        this.toast(game.renderer.planAlways ? 'Showing the <b>dig plan</b> (P to hide)' : 'Dig plan hidden');
      } else if (e.key === 'c' || e.key === 'C') {
        game.director.toggle();
      } else if (e.key === 'h' || e.key === 'H') {
        // Clean frame for screenshots and clips.
        this.root.style.display = this.root.style.display === 'none' ? '' : 'none';
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
        this.note('The queen lands and <b>tears off her wings</b>', true);
        setTimeout(() => this.toast('Drag to look around · scroll to zoom · click an ant to follow it · <b>H</b> hides the panels', 9000), 2500);
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
        game.renderer.planFlash = 8;
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
      if (phase === 'growing' && this.lastPhase === 'founding') this.note('The first workers have <b>hatched</b>', true);
      if (phase === 'failed') {
        this.note('The colony has died out');
        this.showOver();
      }
      this.els.prompt!.style.display = phase === 'choose' ? 'block' : 'none';
      this.lastPhase = phase;
    }
    if (sim.nest.chambers.length !== this.lastChambers) {
      const c = sim.nest.chambers[sim.nest.chambers.length - 1];
      if (c && this.lastChambers > 0) this.toast(`New chamber planned: <b>${CHAMBER_LABEL[c.kind]}</b>`);
      this.lastChambers = sim.nest.chambers.length;
      this.syncBrain();
    }
    const dir = game.director;
    this.els.watch!.classList.toggle('on', dir.active);
    const cap = this.els.caption!;
    cap.style.display = dir.active && dir.caption ? 'block' : 'none';
    if (dir.active) (cap.querySelector('.line') as HTMLElement).innerHTML = dir.caption;
    while (sim.events.length) {
      const e = sim.events.shift()!;
      // The rain stopping is worth a glance, not a line in the journal.
      if (e.includes('rain stops')) this.toast(e);
      else this.note(e, true);
    }
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
    this.observe();
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
