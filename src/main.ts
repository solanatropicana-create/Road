import { Sim } from './sim/sim';
import { Renderer } from './render/renderer';
import { Camera } from './render/camera';
import { UI } from './ui/ui';
import { TICK_HZ, SPEEDS, DAY_TICKS, TEMPOS, Tempo } from './config';
import { getPrefs } from './ui/prefs';
import type { Ant } from './sim/ant';
import { Director } from './ui/director';
import { saveSim, loadSim } from './sim/save';
import { initSlots, latestSlot, newSlotId, readSlot, removeSlot, writeSlot } from './sim/slots';
import { SITE_IDS, SiteId, siteForSeed } from './world/sites';
import { Cinematics, MONTAGE_SPEED } from './ui/cinematics';
import { Soundscape } from './ui/sound';

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
  /** The slice's sound (wakes on the first click or key). */
  readonly sound = new Soundscape();
  /** The landing sequence and the founding montage. */
  cine: Cinematics;
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

  readonly canvas: HTMLCanvasElement;
  private saving = false;
  /** The slot this colony is kept in (null until its first save). */
  slotId: string | null = null;
  /** Bumped when the save is cleared, so a save already under way doesn't write it back. */
  private saveGen = 0;
  private lastSave = performance.now();
  /** Sim tick of the last save: the colony is also saved every few in-game hours. */
  private lastSaveTick = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, seed: number, site: SiteId) {
    this.canvas = canvas;
    this.sim = this.freshSim(seed, site);
    this.renderer = new Renderer(canvas, this.sim.world, seed, site);
    this.cam = new Camera(this.sim.world.w, this.sim.world.h);
    this.director = new Director(this);
    this.cine = new Cinematics(this);
    this.ui = new UI(this, uiRoot);
    // The kept colonies are read in the background; the title screen lists them when they're in.
    void initSlots().then(() => this.ui.slotsReady());
    this.resize();
    this.cam.fit();
    this.cam.zoom = this.cam.tzoom;
    addEventListener('resize', () => this.resize());
    // Browsers let sound start only from a gesture.
    const wake = (): void => this.sound.wake();
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
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
      this.slotId ??= newSlotId();
      await writeSlot({ ...meta, id: this.slotId, colony: this.sim.names.colony, queen: this.sim.names.queen }, blob);
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
    if (this.slotId) void removeSlot(this.slotId);
    this.slotId = null;
  }

  /** Bring back the saved colony in place of the current one. */
  async resume(id = latestSlot()?.id): Promise<boolean> {
    if (!id) return false;
    let blob: string | null = null;
    try {
      blob = await readSlot(id);
    } catch {
      return false;
    }
    if (!blob) return false;
    try {
      const { sim, extra } = await loadSim(blob);
      this.sim = sim;
      this.slotId = id;
      this.saveGen++;
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

  /** A new world at the tempo last chosen (or the one asked for with ?tempo=). */
  private freshSim(seed: number, site: SiteId): Sim {
    const sim = new Sim(seed, site);
    const asked = new URLSearchParams(location.search).get('tempo') as Tempo | null;
    const kept = getPrefs().tempo;
    sim.tempo = asked && TEMPOS.includes(asked) ? asked : TEMPOS.includes(kept) ? kept : 'true';
    return sim;
  }

  /** A fresh, unlanded world from another seed (the title screen's "another site"). */
  newWorld(seed: number, site: SiteId = siteForSeed(seed)): void {
    this.sim = this.freshSim(seed, site);
    this.slotId = null;
    this.saveGen++;
    this.renderer = new Renderer(this.canvas, this.sim.world, seed, site);
    this.selected = null;
    this.director.stop();
    this.lastSaveTick = 0;
    this.resize();
    this.cam.fit();
    this.cam.zoom = this.cam.tzoom;
  }

  /**
   * Frame what the colony knows of its world (before the landing, the whole
   * meadow). The camera cannot leave what is known (see bound()).
   */
  fitKnown(): void {
    const s = this.sim;
    if (!s.nest.founded) {
      this.cam.fit();
      return;
    }
    this.cam.follow = null;
    this.cam.fit();
  }

  /**
   * The camera sees only the colony's world: before the landing the whole
   * meadow, after it the known part, which starts as a hand's breadth around
   * the queen and grows as the colony explores and digs, the nest in the middle.
   */
  private bound(): void {
    const s = this.sim;
    const w = s.world;
    if (!s.nest.founded || this.cine.busy) {
      this.cam.setBounds(0, 0, w.w, w.h);
      return;
    }
    const v = s.view;
    // Some air above the ground: little while the colony is a hole in the
    // ground, enough for the stems over it once it is a big nest.
    let g = w.ground[s.nest.foundX]!;
    for (let x = Math.max(0, Math.round(v.x0)); x < Math.min(w.w, v.x1); x += 4) g = Math.min(g, w.ground[x]!);
    const air = Math.max(60, Math.min(110, (v.y1 - g) * 0.4));
    this.cam.setBounds(v.x0, Math.max(0, g - air), v.x1, v.y1);
  }

  /** Until when a moment worth watching holds the documentary at normal speed (performance.now ms). */
  private slowUntil = 0;
  /** Something big is happening on camera: let it play out at 1x for a little while. */
  slowMo(seconds = 12): void {
    if (this.speed > 1) this.slowUntil = performance.now() + seconds * 1000;
  }
  /** A documentary time-lapse running until then (performance.now ms): the film runs faster. */
  private lapseUntil = 0;
  timeLapse(seconds: number): void {
    this.lapseUntil = performance.now() + seconds * 1000;
  }
  get lapsing(): boolean {
    return this.director.active && performance.now() < this.lapseUntil;
  }
  get slowed(): boolean {
    return this.director.active && performance.now() < this.slowUntil;
  }

  setSpeed(i: number): void {
    this.slowUntil = 0;
    this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))]!;
    this.paused = false;
  }

  /** Run n ticks immediately (used by tests and the fast-forward button). */
  advance(n: number): void {
    for (let k = 0; k < n; k++) this.sim.step();
  }

  private frame(now: number): void {
    // The next frame is asked for first: a slip in one frame's drawing must never stop the colony.
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Time stands still until the queen lands, so a seed always starts from the same meadow.
    if (!this.paused && this.sim.phase !== 'choose') {
      // Winter rest goes by fast unless the player wants to watch it.
      const winter = this.winterSkip && this.sim.dormant && this.sim.phase !== 'failed';
      this.acc += dt * TICK_HZ * (this.cine.montage ? MONTAGE_SPEED : winter ? WINTER_SPEED : this.slowed ? 1 : this.lapsing ? Math.max(this.speed * 6, 12) : this.speed);
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
    this.cine.update(dt);
    this.bound();
    this.renderer.setFlight(this.cine.queenInFlight(), this.cine.swarm);
    if (this.cine.busy || this.cine.montage) {
      // The sequence drives the camera.
    } else if (this.director.active) this.director.update(dt);
    else this.cam.follow = this.selected ? { x: this.selected.x, y: this.selected.y - 2 } : this.cam.follow;
    this.cam.update(dt);
    this.sound.update(this, dt);
    this.renderer.render(this.sim, this.cam, dt, this.paused ? 0 : this.speed, this.ui.cinema ? null : this.selected ?? this.director.focus);
    this.ui.update(dt);
    // Autosave every few in-game hours (not more than every few seconds), and at least once a minute.
    const due = this.sim.tick - this.lastSaveTick >= DAY_TICKS / 6 && now - this.lastSave > 4000;
    if (due || now - this.lastSave > 60000) void this.save();
  }
}

/** Sim speed while fast-forwarding through the winter rest. */
const WINTER_SPEED = 96;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e6));
const siteParam = params.get('site') as SiteId | null;
const site = siteParam && SITE_IDS.includes(siteParam) ? siteParam : siteForSeed(seed);
const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, seed, site);
// ?paused=1 starts frozen (used by the screenshot script for reproducible states).
if (params.get('paused')) game.paused = true;
(window as unknown as { game: Game }).game = game;
