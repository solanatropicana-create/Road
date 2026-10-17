import { World, CHUNK } from './world';
import { EMPTY, WATER, POWDER, SAND, REFUSE, SEED } from './mat';
import { Rng } from '../util/rng';
import { Moisture, ABSORB } from './moisture';

/** Flag in `tint` for loose soil that has settled and holds its shape. */
export const PACKED = 0x80;
/** Flag in `tint` for soil packed into the nest's mouth to shut it (rain, cold, a founding queen sealed in). */
export const PLUG = 0x40;

/**
 * Falling-sand rules for loose material (excavated soil, seeds, refuse).
 * Only chunks that saw a change recently are processed.
 */
export class Physics {
  private world: World;
  private rng: Rng;
  private stamp: Uint8Array;
  private clock = 1;
  readonly moisture: Moisture;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
    this.stamp = new Uint8Array(world.size);
    this.moisture = new Moisture(world, rng);
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

    const mat = w.mat;
    for (let cy = w.ch - 1; cy >= 0; cy--) {
      let any = false;
      for (let cx = 0; cx < w.cw; cx++) if (act[cy * w.cw + cx]) { any = true; break; }
      if (!any) continue;
      const y1 = Math.min(w.h - 2, cy * CHUNK + CHUNK - 1);
      const y0 = cy * CHUNK;
      for (let y = y1; y >= y0; y--) {
        const row = y * w.w;
        for (let cx = 0; cx < w.cw; cx++) {
          if (!act[cy * w.cw + cx]) continue;
          const x0 = cx * CHUNK;
          const x1 = Math.min(w.w - 1, x0 + CHUNK);
          // Most cells are soil or air: only loose grains and water have rules.
          if (leftFirst) {
            for (let x = x0; x < x1; x++) {
              const m = mat[row + x]!;
              if (m === WATER || POWDER[m]) this.cell(row + x, x);
            }
          } else {
            for (let x = x1 - 1; x >= x0; x--) {
              const m = mat[row + x]!;
              if (m === WATER || POWDER[m]) this.cell(row + x, x);
            }
          }
        }
      }
    }
  }

  private cell(i: number, x: number): void {
    const w = this.world;
    const m = w.mat[i]!;
    if (m === WATER) {
      if (this.stamp[i] !== this.clock) this.water(i, x);
      return;
    }
    if (!POWDER[m] || this.stamp[i] === this.clock) return;
    // A plug of packed soil in the nest's mouth holds like a little bridge.
    if (m === SAND && this.world.tint[i]! & PLUG) return;
    const W = w.w;
    const below = i + W;
    const bm = w.mat[below]!;
    // The crater holds: spoil and refuse never spill from outside into the nest
    // or the open air over its mouth (the ants keep both clear). Seeds may fall
    // in; foragers and diggers carry them on to the granary.
    const outside = !w.plan[i] && (m === SAND || m === REFUSE);
    // Stores stay in their room: grains never spill out through a chamber's doorway.
    const room = w.zone[i]!;
    if ((bm === EMPTY || bm === WATER) && !(outside && w.plan[below]) && (!room || w.zone[below] === room)) {
      this.move(i, below);
      return;
    }
    // Spoil that has settled packs down (the high bit of tint) and stops sliding,
    // but only once it rests on a stable bed, so slopes never get steeper than 45°.
    if (m === SAND) {
      if (w.tint[i]! & PACKED) return;
      if (w.mat[below - 1] !== EMPTY && w.mat[below + 1] !== EMPTY && this.rng.next() < 0.025) {
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
      if (room && (w.zone[side] !== room || w.zone[diag] !== room)) continue;
      if ((sm === EMPTY || sm === WATER) && (dm === EMPTY || dm === WATER)) {
        this.move(i, diag);
        return;
      }
    }
    // Loose soil spreads a little further, giving low mounds instead of 45-degree cones.
    if (m === SAND && this.rng.next() < 0.6) {
      const d = dir;
      if (x + 2 * d < 1 || x + 2 * d >= W - 1) return;
      if (
        w.mat[i + d] === EMPTY && w.mat[i + 2 * d] === EMPTY &&
        w.mat[below + 2 * d] === EMPTY && w.mat[below + d] !== EMPTY &&
        !w.plan[i + d] && !w.plan[i + 2 * d] && !w.plan[below + 2 * d] && !room
      ) {
        this.move(i, below + 2 * d);
      }
    }
  }

  /**
   * Water falls, runs sideways, and soaks into whatever soil it touches.
   * A flood in the nest drains away into the walls over a few minutes.
   */
  private water(i: number, x: number): void {
    const w = this.world;
    const W = w.w;
    // Over or in the shut mouth: the packed plug drinks it.
    if (w.sealed && w.inSealBox(i)) {
      w.set(i, EMPTY, w.tone[i], w.tint[i]);
      return;
    }
    const below = i + W;
    if (w.mat[below] === EMPTY) {
      this.move(i, below);
      return;
    }
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    // Soak in.
    for (const n of [below, i + dir, i - dir]) {
      const a = ABSORB[w.mat[n]!]!;
      // Tunnel walls drink slowly, so a flood in the nest stands for a while.
      // (Dry seed drinks at once, which is how a flooded granary starts to sprout.)
      const rate = w.mat[n] === SEED ? 0.3 : w.bg[i] === 1 ? 0.01 : 0.05;
      if (a > 0 && w.moist[n]! < 236 && this.rng.next() < a * rate) {
        this.moisture.add(n, 70);
        w.set(i, EMPTY, w.tone[i], w.tint[i]);
        return;
      }
    }
    // Puddles in the open dry off in half a minute or so. (Checked before the
    // water moves on: a droplet sliding about on flat ground must dry too, or it
    // lingers for ever and cuts the ants' path across the surface.)
    if (w.bg[i] === 0 && w.mat[i - W] === EMPTY && this.rng.next() < 1 / 400) {
      w.set(i, EMPTY, w.tone[i], w.tint[i]);
      return;
    }
    // Run off.
    for (const d of [dir, -dir]) {
      if (x + d < 1 || x + d >= W - 1) continue;
      if (w.mat[below + d] === EMPTY && w.mat[i + d] === EMPTY) {
        this.move(i, below + d);
        return;
      }
    }
    for (const d of [dir, -dir]) {
      let j = i;
      for (let s = 0; s < 3; s++) {
        const xx = (j % W) + d;
        if (xx < 1 || xx >= W - 1 || w.mat[j + d] !== EMPTY) break;
        j += d;
      }
      if (j !== i) {
        this.move(i, j);
        return;
      }
    }
    // Standing water keeps soaking away slowly.
    if (this.rng.next() < 0.3) w.wake(i);
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
