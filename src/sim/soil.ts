import type { Sim } from './sim';
import type { Hollow } from '../world/gen';
import { EMPTY, ROOT, SOIL, PREY, HUMUS } from '../world/mat';
import { DAY_TICKS } from '../config';

/** Ticks in one day of the year (a DAY_TICKS is a week). */
const DAY = Math.round(DAY_TICKS / 7);

/**
 * The soil as a living thing, day by day: roots push on through it in the
 * growing season (into the diggers' way, too: a root across a planned tunnel
 * has to be cut through) and die back in autumn, rotting to open channels;
 * the water table rises in spring and sinks in summer, soaking the soil
 * below it; chafers lay their eggs by the roots in high summer. And the
 * hollows the map was made with wait to be broken into.
 */
export class SoilLife {
  /** Root cells (kept loosely: entries that are no longer roots are dropped when met). */
  roots: number[] = [];
  private scanned = false;
  /** Top of the water table per column (cells), or null where there is none in the slice. */
  waterTop: Int16Array | null;
  /** Old root channels and hollows in this map, and which of them the diggers have found. */
  hollows: Hollow[];
  found: boolean[];

  constructor(waterTop: Int16Array | null, hollows: Hollow[]) {
    this.waterTop = waterTop;
    this.hollows = hollows;
    this.found = hollows.map(() => false);
  }

  step(sim: Sim): void {
    if (sim.tick % DAY !== 17) return;
    const w = sim.world;
    if (!this.scanned) {
      this.scanned = true;
      for (let i = 0; i < w.size; i++) if (w.mat[i] === ROOT) this.roots.push(i);
    }
    const doy = sim.doy;
    const growing = doy > 95 && doy < 270 && !sim.dormant;
    const dying = doy > 280 && doy < 330;
    this.water(sim, doy);
    if (growing || dying) this.tend(sim, growing);
    // Chafer grubs hatch by the roots in high summer.
    if (doy > 190 && doy < 230 && sim.rng.chance(((sim.variant.grubs ?? 0) + 1) / 40)) this.grub(sim);
  }

  /** Below the water table the soil stays soaked: higher after the spring thaw, lower by late summer. */
  private water(sim: Sim, doy: number): void {
    const top = this.waterTop;
    if (!top) return;
    const w = sim.world;
    const rise = Math.round(30 * Math.cos(((doy - 75) / 365) * Math.PI * 2));
    const m = sim.physics.moisture;
    for (let x = 0; x < w.w; x++) {
      for (let y = Math.max(w.ground[x]! + 20, top[x]! - rise); y < w.h - 3; y++) {
        const i = y * w.w + x;
        if (SOIL[w.mat[i]!] && w.moist[i]! < 210) m.add(i, 210 - w.moist[i]!);
      }
    }
  }

  /** A root tip: a root cell with at most one root beside it. Returns the one beside it (or -1), or null if not a tip. */
  private tip(sim: Sim, i: number): number | null {
    const w = sim.world;
    let n = -1;
    let k = 0;
    for (const d of [-1, 1, -w.w, w.w, -w.w - 1, -w.w + 1, w.w - 1, w.w + 1]) {
      if (w.mat[i + d] === ROOT) {
        n = i + d;
        if (++k > 1) return null;
      }
    }
    return n;
  }

  /** Roots grow at their tips through the season, and in autumn some fine tips die back and rot. */
  private tend(sim: Sim, growing: boolean): void {
    const w = sim.world;
    const rng = sim.rng;
    const R = this.roots;
    for (let t = 0; t < 40 && R.length; t++) {
      const k = rng.int(0, R.length - 1);
      const i = R[k]!;
      if (w.mat[i] !== ROOT) {
        R[k] = R[R.length - 1]!;
        R.pop();
        continue;
      }
      const from = this.tip(sim, i);
      if (from === null) continue;
      const x = i % w.w;
      const y = (i / w.w) | 0;
      if (y < w.ground[x]! + 4) continue;
      if (growing) {
        if (!rng.chance(0.5)) continue;
        // On, away from where it came from, tending down.
        const fx = from >= 0 ? x - (from % w.w) : 0;
        const fy = from >= 0 ? y - ((from / w.w) | 0) : 1;
        const a = Math.atan2(fy + 0.6, fx) + rng.range(-0.7, 0.7);
        const n = Math.round(y + Math.sin(a)) * w.w + Math.round(x + Math.cos(a));
        // Through soil only (not across an open tunnel); a planned, undug cell is fair game.
        if (n === i || !SOIL[w.mat[n]!] || w.bg[n] !== 1) continue;
        if (w.plan[n]) sim.noteOnce('rootInWay', { x: n % w.w, y: (n / w.w) | 0 });
        w.set(n, ROOT, rng.int(0, 255), 0);
        R.push(n);
      } else if (rng.chance(0.12) && y > w.ground[x]! + 8 && !w.plan[i]) {
        // Died and rotted: an open channel where the root was.
        let soil = HUMUS;
        for (const d of [-1, 1, -w.w, w.w]) if (SOIL[w.mat[i + d]!]) soil = w.mat[i + d]!;
        w.set(i, EMPTY, w.tone[i], soil);
      }
    }
  }

  /** A new grub, curled in the topsoil near a root. */
  private grub(sim: Sim): void {
    const w = sim.world;
    const rng = sim.rng;
    if (!this.roots.length) return;
    const r = this.roots[rng.int(0, this.roots.length - 1)]!;
    const x = (r % w.w) + rng.int(-5, 5);
    const y = ((r / w.w) | 0) + rng.int(-3, 5);
    if (y < w.ground[x]! + 12 || y > w.ground[x]! + 120) return;
    for (const d of [0, 1, w.w, w.w + 1, 2, w.w + 2]) {
      const i = y * w.w + x + d;
      if (!SOIL[w.mat[i]!] || w.plan[i]) return;
    }
    for (const d of [0, 1, w.w, w.w + 1, 2, w.w + 2]) w.set(y * w.w + x + d, PREY, rng.int(160, 205), 3);
  }

  /** The diggers broke into open soil at cell n: one of the map's hollows? Its index, once, or -1. */
  breach(n: number, W: number): number {
    const x = n % W;
    const y = (n / W) | 0;
    for (let k = 0; k < this.hollows.length; k++) {
      const h = this.hollows[k]!;
      if (this.found[k] || x < h.x0 - 2 || x > h.x1 + 2 || y < h.y0 - 2 || y > h.y1 + 2) continue;
      this.found[k] = true;
      return k;
    }
    return -1;
  }
}
