import { Sim } from './sim/sim';
import { Renderer } from './render/renderer';
import { Camera } from './render/camera';
import { UI } from './ui/ui';
import { TICK_HZ, SPEEDS, DAY_TICKS } from './config';
import type { Ant } from './sim/ant';
import { Director } from './ui/director';
import { saveSim, loadSim, SAVE_KEY, META_KEY } from './sim/save';
import { SITE_IDS, SiteId, siteForSeed } from './world/sites';

/**
 * Owns the loop: a fixed-rate simulation, rendered every animation frame.
 * Speed-ups run several ticks per frame; the sim itself never sees wall time.
 */
export class Game {
  sim: Sim;
  renderer: Renderer;
  cam: Camera;
  ui: UI;
  director: Director;
  speed = 1;
  paused = false;
  /** Pass the winter rest quickly (the colony sleeps; there is little to watch). */
  winterSkip = true;
  selected: Ant | null = null;
  private acc = 0;
  private last = performance.now();
  /** Ticks per second actually achieved (for the perf readout). */
  tps = 0;
  private tpsCount = 0;
  private tpsTime = 0;

  private canvas: HTMLCanvasElement;
  private saving = false;
  /** Bumped when the save is cleared, so a save already under way doesn't write it back. */
  private saveGen = 0;
  private lastSave = performance.now();
  /** Sim tick of the last save: the colony is also saved every few in-game hours. */
  private lastSaveTick = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, seed: number, site: SiteId) {
    this.canvas = canvas;
    this.sim = new Sim(seed, site);
    this.renderer = new Renderer(canvas, this.sim.world, seed, site);
    this.cam = new Camera(this.sim.world.w, this.sim.world.h);
    this.director = new Director(this);
    this.ui = new UI(this, uiRoot);
    this.resize();
    this.cam.fit();
    this.cam.zoom = this.cam.tzoom;
    addEventListener('resize', () => this.resize());
    // Keep the colony when the tab goes away or closes.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.save();
    });
    addEventListener('pagehide', () => void this.save());
    requestAnimationFrame((t) => this.frame(t));
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    // A view showing the whole slice keeps showing it after the window changes.
    const wasFit = this.cam.tzoom <= this.cam.minZoom * 1.02;
    this.renderer.resize(w, h, Math.min(2, devicePixelRatio || 1));
    this.cam.resize(w, h);
    if (wasFit && !this.cam.follow) this.cam.fit();
    this.cam.tzoom = Math.max(this.cam.tzoom, this.cam.minZoom);
  }

  /** Write the colony to browser storage (compressed). Quietly does nothing if storage is unavailable. */
  async save(): Promise<void> {
    const phase = this.sim.phase;
    if (this.saving || (phase !== 'founding' && phase !== 'growing')) return;
    this.saving = true;
    const gen = this.saveGen;
    try {
      const { meta, blob } = await saveSim(this.sim, { journal: this.ui.journalData() });
      if (gen !== this.saveGen) return;
      localStorage.setItem(SAVE_KEY, blob);
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      // Private window, full storage: the colony just won't persist.
    } finally {
      this.saving = false;
      this.lastSave = performance.now();
      this.lastSaveTick = this.sim.tick;
    }
  }

  /** Forget the saved colony (it died, or the player started over). */
  clearSave(): void {
    this.saveGen++;
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(META_KEY);
    } catch {
      // nothing stored
    }
  }

  /** Bring back the saved colony in place of the current one. */
  async resume(): Promise<boolean> {
    let blob: string | null = null;
    try {
      blob = localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
    if (!blob) return false;
    try {
      const { sim, extra } = await loadSim(blob);
      this.sim = sim;
      this.lastSaveTick = sim.tick;
      this.renderer = new Renderer(this.canvas, sim.world, sim.seed, sim.site);
      this.selected = null;
      this.director.stop();
      this.resize();
      this.cam.fit();
      this.cam.zoom = this.cam.tzoom;
      this.ui.restore((extra as { journal?: unknown } | null)?.journal);
      return true;
    } catch {
      return false;
    }
  }

  /** A fresh, unlanded world from another seed (the title screen's "another site"). */
  newWorld(seed: number, site: SiteId = siteForSeed(seed)): void {
    this.sim = new Sim(seed, site);
    this.renderer = new Renderer(this.canvas, this.sim.world, seed, site);
    this.selected = null;
    this.director.stop();
    this.lastSaveTick = 0;
    this.resize();
    this.cam.fit();
    this.cam.zoom = this.cam.tzoom;
  }

  setSpeed(i: number): void {
    this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))]!;
    this.paused = false;
  }

  /** Run n ticks immediately (used by tests and the fast-forward button). */
  advance(n: number): void {
    for (let k = 0; k < n; k++) this.sim.step();
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Time stands still until the queen lands, so a seed always starts from the same meadow.
    if (!this.paused && this.sim.phase !== 'choose') {
      // Winter rest goes by fast unless the player wants to watch it.
      const winter = this.winterSkip && this.sim.dormant && this.sim.phase !== 'failed';
      this.acc += dt * TICK_HZ * (winter ? WINTER_SPEED : this.speed);
      // Never spend more than ~12 ms of a frame simulating; drop the rest.
      const start = performance.now();
      let n = 0;
      while (this.acc >= 1) {
        this.sim.step();
        this.acc -= 1;
        n++;
        if (performance.now() - start > 12) {
          this.acc = 0;
          break;
        }
      }
      this.tpsCount += n;
    }
    this.tpsTime += dt;
    if (this.tpsTime >= 1) {
      this.tps = this.tpsCount / this.tpsTime;
      this.tpsCount = 0;
      this.tpsTime = 0;
    }
    if (this.selected && !this.selected.alive) this.selected = null;
    const v = this.sim.view;
    this.cam.setBounds(v.x0, 0, v.x1, v.y1);
    if (this.director.active) this.director.update(dt);
    else this.cam.follow = this.selected ? { x: this.selected.x, y: this.selected.y - 2 } : this.cam.follow;
    this.cam.update(dt);
    this.renderer.render(this.sim, this.cam, dt, this.paused ? 0 : this.speed, this.ui.cinema ? null : this.selected);
    this.ui.update(dt);
    // Autosave every few in-game hours (not more than every few seconds), and at least once a minute.
    const due = this.sim.tick - this.lastSaveTick >= DAY_TICKS / 6 && now - this.lastSave > 4000;
    if (due || now - this.lastSave > 60000) void this.save();
    requestAnimationFrame((t) => this.frame(t));
  }
}

/** Sim speed while fast-forwarding through the winter rest. */
const WINTER_SPEED = 96;

const params = new URLSearchParams(location.search);
// ?art=new (or #art-new, where a host keeps only the hash) starts with the art proposal on (L toggles it).
if (params.get('art') === 'new' || location.hash === '#art-new') Renderer.proposal = true;
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e6));
const siteParam = params.get('site') as SiteId | null;
const site = siteParam && SITE_IDS.includes(siteParam) ? siteParam : siteForSeed(seed);
const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, seed, site);
// ?paused=1 starts frozen (used by the screenshot script for reproducible states).
if (params.get('paused')) game.paused = true;
(window as unknown as { game: Game }).game = game;
