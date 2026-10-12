import { Sim } from './sim/sim';
import { Renderer } from './render/renderer';
import { Camera } from './render/camera';
import { UI } from './ui/ui';
import { TICK_HZ, SPEEDS } from './config';
import type { Ant } from './sim/ant';

/**
 * Owns the loop: a fixed-rate simulation, rendered every animation frame.
 * Speed-ups run several ticks per frame; the sim itself never sees wall time.
 */
export class Game {
  sim: Sim;
  renderer: Renderer;
  cam: Camera;
  ui: UI;
  speed = 1;
  paused = false;
  selected: Ant | null = null;
  private acc = 0;
  private last = performance.now();
  /** Ticks per second actually achieved (for the perf readout). */
  tps = 0;
  private tpsCount = 0;
  private tpsTime = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, seed: number) {
    this.sim = new Sim(seed);
    this.renderer = new Renderer(canvas, this.sim.world, seed);
    this.cam = new Camera(this.sim.world.w, this.sim.world.h);
    this.ui = new UI(this, uiRoot);
    this.resize();
    this.cam.fit();
    this.cam.zoom = this.cam.tzoom;
    addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.resize(w, h, Math.min(2, devicePixelRatio || 1));
    this.cam.resize(w, h);
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
    if (!this.paused) {
      this.acc += dt * TICK_HZ * this.speed;
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
    this.cam.follow = this.selected ? { x: this.selected.x, y: this.selected.y - 2 } : this.cam.follow;
    this.cam.update(dt);
    this.renderer.render(this.sim, this.cam, dt, this.paused ? 0 : this.speed, this.selected);
    this.ui.update(dt);
    requestAnimationFrame((t) => this.frame(t));
  }
}

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e6));
const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, seed);
// ?paused=1 starts frozen (used by the screenshot script for reproducible states).
if (params.get('paused')) game.paused = true;
(window as unknown as { game: Game }).game = game;
