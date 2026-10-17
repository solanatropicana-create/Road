import type { Sim } from '../sim/sim';
import type { RGB } from './palette';
import { Rng } from '../util/rng';
import { clamp } from '../util/math';

type Light = (x: number, y: number) => RGB;

/** Fill one ellipse in the current fill style. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
const css = (c: RGB, l: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;

/** A black garden ant on the trunk's column: where along it (mm from the ground), which way, how fast. */
interface Runner {
  s: number;
  up: boolean;
  v: number;
  /** Coming down with a crop full of honeydew (the gaster swollen and amber). */
  full: boolean;
  t: number;
}

/** A firebug sunning at the foot of the trunk. */
interface Bug {
  x: number;
  y: number;
  hx: number;
  hy: number;
  rest: number;
  t: number;
}

/**
 * Life on the tree's bark, beyond the colony's business but part of the
 * scene: a trail of black garden ants (Lasius niger) running up the trunk to
 * the aphids in the crown and down again full of honeydew; firebugs
 * (Pyrrhocoris apterus) gathering to sun themselves at its foot in spring and
 * autumn; and a jumping spider (Salticus) stalking the trail in summer. Drawn
 * over the trunk's face, moved by the clock of the sim (it speeds up and
 * stops with it); none of it touches the simulation.
 */
export class TreeLife {
  private runners: Runner[] = [];
  private bugs: Bug[] = [];
  private spider: { s: number; x: number; t: number; hop: number; from: number; to: number } | null = null;
  private rng = new Rng(7177);
  /** Where the column runs and how far it is visible, set each frame. */
  private edge = 0;
  private side = 1;

  /** The trunk's face toward the slice at height y (world x), and how far into the bark the column runs. */
  private faceX(sim: Sim, y: number): number {
    const t = sim.tree!;
    const g = sim.world.ground[clamp(Math.round(t.x - this.side * t.r), 0, sim.world.w - 1)]!;
    const above = g - y;
    const flare = above < 40 ? (40 - above) * 0.7 : 0;
    return t.x - this.side * (t.r + flare);
  }

  /** The column's path up the bark: x for a point s mm above the ground. */
  private pathAt(sim: Sim, s: number): { x: number; y: number } {
    const g = sim.world.ground[clamp(Math.round(this.edge), 0, sim.world.w - 1)]!;
    const y = g - 1 - s;
    const x = this.faceX(sim, y) + this.side * (16 + Math.sin(s * 0.045) * 7 + Math.sin(s * 0.013 + 2) * 5);
    return { x, y };
  }

  update(sim: Sim, dt: number): void {
    const t = sim.tree;
    if (!t || dt <= 0) return;
    this.side = t.x < sim.world.w / 2 ? -1 : 1;
    this.edge = t.x - this.side * t.r;
    const doy = sim.doy;
    const T = sim.surfaceT;
    const rng = this.rng;
    // The garden ants: out from April to October whenever it is not cold.
    const busy = !sim.dormant && !sim.raining && doy > 95 && doy < 300 ? clamp((T - 9) / 10, 0, 1) : 0;
    const want = Math.round(busy * 26);
    const g = sim.world.ground[clamp(Math.round(this.edge), 0, sim.world.w - 1)]!;
    const top = g + 10;
    for (const r of this.runners) {
      r.t += dt;
      r.s += (r.up ? 1 : -1) * r.v * dt;
    }
    this.runners = this.runners.filter((r) => r.s >= -2 && r.s <= top);
    // New ones come up out of the litter, or down from the crown.
    if (this.runners.length < want && rng.chance(Math.min(1, dt * 2.5))) {
      const up = rng.chance(0.5);
      this.runners.push({ s: up ? 0 : top, up, v: rng.range(9, 15), full: !up && rng.chance(0.7), t: rng.range(0, 10) });
    }
    // Firebugs: a cluster sunning at the foot of the trunk on bright days in spring and autumn.
    const sunny = !sim.raining && sim.cloud < 0.6 && sim.cal.daylight(sim.dayT, doy) > 0.35;
    const season = (doy > 70 && doy < 150) || (doy > 245 && doy < 300);
    const bugsWant = season && sunny && T > 11 ? 7 : 0;
    if (this.bugs.length < bugsWant && rng.chance(Math.min(1, dt * 0.6))) {
      const y = g - 2 - rng.range(0, 32);
      const x = this.faceX(sim, y) + this.side * rng.range(3, 30);
      this.bugs.push({ x, y, hx: x, hy: y, rest: rng.range(0, 4), t: rng.range(0, 10) });
    }
    if (this.bugs.length > bugsWant && rng.chance(Math.min(1, dt * 1.2))) this.bugs.pop();
    for (const b of this.bugs) {
      b.t += dt;
      if (b.rest > 0) {
        b.rest -= dt;
        if (b.rest <= 0) {
          // A few millimetres to a new spot among the others, never far from the foot of the trunk.
          b.hy = clamp(b.y + rng.range(-6, 6), g - 36, g - 2);
          b.hx = this.faceX(sim, b.hy) + this.side * clamp(Math.abs(b.x - this.faceX(sim, b.y)) + rng.range(-6, 6), 2, 32);
        }
        continue;
      }
      const dx = b.hx - b.x;
      const dy = b.hy - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.3) {
        b.rest = rng.range(2, 9);
        continue;
      }
      const step = Math.min(d, 3 * dt);
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
    }
    // A jumping spider on the bark through the warm months, in the day.
    const spiderOut = !sim.dormant && doy > 130 && doy < 260 && T > 16 && sim.cal.daylight(sim.dayT, doy) > 0.3;
    if (spiderOut && !this.spider) this.spider = { s: rng.range(30, 120), x: rng.range(-10, 10), t: 0, hop: 0, from: 0, to: 0 };
    if (!spiderOut) this.spider = null;
    const sp = this.spider;
    if (sp) {
      sp.t += dt;
      if (sp.hop > 0) {
        sp.hop = Math.max(0, sp.hop - dt * 3);
        sp.s = sp.to + (sp.from - sp.to) * sp.hop;
      } else if (rng.chance(Math.min(1, dt * 0.35))) {
        // A sudden hop, a centimetre or two, toward the trail.
        sp.from = sp.s;
        sp.to = clamp(sp.s + rng.range(-18, 18), 15, top - 10);
        sp.x = clamp(sp.x + rng.range(-6, 6), -14, 14);
        sp.hop = 1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, sim: Sim, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (!sim.tree) return;
    if (this.edge < view.x0 - 60 || this.edge > view.x1 + 60) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const r of this.runners) {
      const p = this.pathAt(sim, r.s);
      if (p.y < view.y0 - 4 || p.y > view.y1 + 4) continue;
      const q = this.pathAt(sim, r.s + (r.up ? 1 : -1));
      this.lasius(ctx, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), r.full, r.t, light(p.x, p.y));
    }
    for (const b of this.bugs) this.firebug(ctx, b.x, b.y, b.hx - b.x, b.hy - b.y, b.rest > 0 ? 0 : b.t, light(b.x, b.y));
    const sp = this.spider;
    if (sp) {
      const p = this.pathAt(sim, sp.s);
      const lift = sp.hop > 0 ? Math.sin(sp.hop * Math.PI) * 4 : 0;
      this.jumper(ctx, p.x + sp.x * this.side, p.y, lift, light(p.x, p.y));
    }
    ctx.restore();
  }

  /** What is on the bark here (for the hover card), or null. */
  at(sim: Sim, x: number, y: number): string | null {
    if (!sim.tree) return null;
    for (const b of this.bugs) if (Math.abs(b.x - x) < 6 && Math.abs(b.y - y) < 4) return 'firebug';
    const sp = this.spider;
    if (sp) {
      const p = this.pathAt(sim, sp.s);
      if (Math.abs(p.x + sp.x * this.side - x) < 5 && Math.abs(p.y - y) < 5) return 'jumper';
    }
    for (const r of this.runners) {
      const p = this.pathAt(sim, r.s);
      if (Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4) return 'lasius';
    }
    return null;
  }

  /** A black garden ant, 3.5 mm, seen from above on the bark (head toward a). */
  private lasius(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, full: boolean, t: number, l: RGB): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const body: RGB = [34, 28, 24];
    ctx.strokeStyle = css(body, l, 0.9);
    ctx.lineWidth = 0.14;
    const step = Math.sin(t * 22) * 0.35;
    ctx.beginPath();
    for (const [lx, sgn] of [[0.35, 1], [0, -1], [-0.35, 1]] as const) {
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx + 0.4 + step * sgn, 0.95);
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx + 0.4 - step * sgn, -0.95);
    }
    ctx.stroke();
    ctx.fillStyle = css(body, l);
    blob(ctx, 1.15, 0, 0.42, 0.36);
    blob(ctx, 0.2, 0, 0.55, 0.24);
    // The gaster: dark, or swollen with honeydew and showing amber through the stretched joints.
    ctx.fillStyle = full ? css([150, 104, 46], l, 0.95) : css(body, l);
    ctx.beginPath();
    ctx.ellipse(-0.85, 0, full ? 0.72 : 0.6, full ? 0.55 : 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    if (full) {
      ctx.strokeStyle = css(body, l, 0.8);
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      for (const sx of [-0.55, -0.95, -1.3]) {
        ctx.moveTo(sx, -0.5);
        ctx.lineTo(sx, 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A firebug, 10 mm: scarlet with black spots and a black head, from above. */
  private firebug(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number, l: RGB): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx || 0.01));
    const red: RGB = [196, 46, 30];
    const black: RGB = [26, 18, 16];
    ctx.strokeStyle = css(black, l, 0.9);
    ctx.lineWidth = 0.35;
    const step = t > 0 ? Math.sin(t * 12) * 0.6 : 0;
    ctx.beginPath();
    for (const [lx, sgn] of [[2, 1], [0.6, -1], [-0.8, 1]] as const) {
      ctx.moveTo(lx, 1.6);
      ctx.lineTo(lx + 1 + step * sgn, 3.2);
      ctx.moveTo(lx, -1.6);
      ctx.lineTo(lx + 1 - step * sgn, -3.2);
    }
    ctx.moveTo(3.6, 0.4);
    ctx.lineTo(5.4, 1.6);
    ctx.moveTo(3.6, -0.4);
    ctx.lineTo(5.4, -1.6);
    ctx.stroke();
    ctx.fillStyle = css(red, l);
    ctx.beginPath();
    ctx.ellipse(-0.4, 0, 4.2, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // The black pattern: the head, a band across the pronotum, a spot on each wing, the triangle.
    ctx.fillStyle = css(black, l);
    ctx.beginPath();
    ctx.ellipse(3.5, 0, 0.9, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, 1.7, 0, 0.6, 1.3);
    blob(ctx, -0.6, 1.1, 0.75, 0.6);
    blob(ctx, -0.6, -1.1, 0.75, 0.6);
    ctx.beginPath();
    ctx.moveTo(0.6, 0);
    ctx.lineTo(-0.4, 0.5);
    ctx.lineTo(-0.4, -0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css([255, 230, 210], l, 0.25);
    ctx.beginPath();
    ctx.ellipse(-1.8, -0.9, 1.4, 0.4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A zebra jumping spider, 6 mm, black and white, big front eyes. lift: off the bark mid-hop. */
  private jumper(ctx: CanvasRenderingContext2D, x: number, y: number, lift: number, l: RGB): void {
    ctx.save();
    ctx.translate(x, y - lift);
    // Its shadow on the bark while it is in the air.
    if (lift > 0.2) {
      ctx.fillStyle = `rgba(0,0,0,${0.25 - lift * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(0, lift, 2.2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const black: RGB = [30, 28, 26];
    const white: RGB = [222, 218, 206];
    ctx.strokeStyle = css(black, l, 0.9);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (const [ax, ay] of [[1.6, 1.8], [0.4, 2.2], [-0.6, 2], [-1.6, 1.6]] as const) {
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, -ay);
    }
    ctx.stroke();
    ctx.fillStyle = css(black, l);
    ctx.beginPath();
    ctx.ellipse(0.9, 0, 1.3, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(white, l);
    ctx.beginPath();
    ctx.ellipse(-1.4, 0, 1.6, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(black, l);
    for (const bx of [-0.8, -1.6, -2.4]) {
      ctx.beginPath();
      ctx.ellipse(bx, 0, 0.22, 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = css([12, 10, 10], l);
    blob(ctx, 1.95, 0.35, 0.32, 0.32);
    blob(ctx, 1.95, -0.35, 0.32, 0.32);
    ctx.restore();
  }
}
