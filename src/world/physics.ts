import { World, CHUNK } from './world';
import { EMPTY, WATER, POWDER, SAND } from './mat';
import { Rng } from '../util/rng';

/** Flag in `tint` for loose soil that has settled and holds its shape. */
export const PACKED = 0x80;

/**
 * Falling-sand rules for loose material (excavated soil, seeds, refuse).
 * Only chunks that saw a change recently are processed.
 */
export class Physics {
  private world: World;
  private rng: Rng;
  private stamp: Uint8Array;
  private clock = 1;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
    this.stamp = new Uint8Array(world.size);
  }

  step(): void {
    const w = this.world;
    // Swap activity buffers: process what was woken last tick.
    const act = w.nextActive;
    w.nextActive = w.active;
    w.active = act;
    w.nextActive.fill(0);
    this.clock = (this.clock % 255) + 1;
    const leftFirst = (this.clock & 1) === 0;

    for (let cy = w.ch - 1; cy >= 0; cy--) {
      let any = false;
      for (let cx = 0; cx < w.cw; cx++) if (act[cy * w.cw + cx]) { any = true; break; }
      if (!any) continue;
      const y1 = Math.min(w.h - 2, cy * CHUNK + CHUNK - 1);
      const y0 = cy * CHUNK;
      for (let y = y1; y >= y0; y--) {
        for (let cx = 0; cx < w.cw; cx++) {
          if (!act[cy * w.cw + cx]) continue;
          const x0 = cx * CHUNK;
          const x1 = Math.min(w.w - 1, x0 + CHUNK);
          if (leftFirst) for (let x = x0; x < x1; x++) this.cell(y * w.w + x, x);
          else for (let x = x1 - 1; x >= x0; x--) this.cell(y * w.w + x, x);
        }
      }
    }
  }

  private cell(i: number, x: number): void {
    const w = this.world;
    const m = w.mat[i]!;
    if (!POWDER[m] || this.stamp[i] === this.clock) return;
    const W = w.w;
    const below = i + W;
    const bm = w.mat[below]!;
    // The crater holds: nothing loose spills from outside into the nest or the
    // open air column over its mouth (the ants keep both clear).
    const outside = !w.plan[i];
    if ((bm === EMPTY || bm === WATER) && !(outside && w.plan[below])) {
      this.move(i, below);
      return;
    }
    // Spoil that has settled packs down (the high bit of tint) and stops sliding,
    // but only once it rests on a stable bed, so slopes never get steeper than 45°.
    if (m === SAND) {
      if (w.tint[i]! & PACKED) return;
      if (w.mat[below - 1] !== EMPTY && w.mat[below + 1] !== EMPTY && this.rng.next() < 0.06) {
        w.tint[i] = w.tint[i]! | PACKED;
        return;
      }
    }
    // Slide diagonally only if the side cell is open too (no leaking through corners).
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? dir : -dir;
      if (x + d < 1 || x + d >= W - 1) continue;
      const side = i + d;
      const diag = below + d;
      const sm = w.mat[side]!;
      const dm = w.mat[diag]!;
      if (outside && (w.plan[side] || w.plan[diag])) continue;
      if ((sm === EMPTY || sm === WATER) && (dm === EMPTY || dm === WATER)) {
        this.move(i, diag);
        return;
      }
    }
    // Loose soil spreads a little further, giving low mounds instead of 45-degree cones.
    if (m === SAND && this.rng.next() < 0.35) {
      const d = dir;
      if (x + 2 * d < 1 || x + 2 * d >= W - 1) return;
      if (
        w.mat[i + d] === EMPTY && w.mat[i + 2 * d] === EMPTY &&
        w.mat[below + 2 * d] === EMPTY && w.mat[below + d] !== EMPTY &&
        !w.plan[i + d] && !w.plan[i + 2 * d] && !w.plan[below + 2 * d]
      ) {
        this.move(i, below + 2 * d);
      }
    }
  }

  private move(a: number, b: number): void {
    this.world.swap(a, b);
    this.stamp[b] = this.clock;
    // Falling shakes it loose again.
    const wd = this.world;
    if (wd.mat[b] === SAND) {
      wd.tint[b] = wd.tint[b]! & ~PACKED;
      // Spoil that falls into the nest is debris: the colony will want it out.
      if (wd.bg[b] === 1 && !wd.plan[b]) wd.claimed.push(b);
    }
    // Grains keep their place in the back wall's memory: a moved grain leaves open soil behind.
    const w = this.world;
    if (w.mat[a] === EMPTY && w.bg[a] === 1 && !w.tint[a]) w.tint[a] = w.tint[b]! & ~PACKED;
  }
}
