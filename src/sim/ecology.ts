import type { Sim } from './sim';
import type { ShrubInfo } from '../world/gen';
import { EMPTY, LEAF, FLOWER, BERRY, FRUIT, LITTER, PREY, TWIG, WOOD } from '../world/mat';
import { DRY_SHIFT } from '../world/plants';
import { TICK_HZ } from '../config';
import { clamp } from '../util/math';

/** A leaf (or a fruit) on its way down from the tree or the shrub. */
export interface Faller {
  x: number;
  y: number;
  vx: number;
  vy?: number;
  t: number;
  tone: number;
  /** Length of a leaf, mm (a tree's leaves are huge at this scale). */
  len: number;
  /** A sloe or hip dropping from the bush overhead (falls straight, lands as soft fruit). */
  fruit?: boolean;
}

/** Dead insects (and stranded worms) turning up on the surface, by month. */
const PREY_MONTH = [0, 0, 0.1, 0.3, 0.6, 0.9, 1, 1, 0.8, 0.5, 0.15, 0];

/**
 * The life of the surface around the colony through the year, beyond the
 * meadow plants: the shrub's blossom, leaves and fruit, the tree's shade
 * and its autumn leaves, and the dead insects the foragers bring home as
 * protein for the larvae.
 */
export class Ecology {
  readonly shrub: ShrubInfo | null;
  readonly tree: { x: number; r: number } | null;
  readonly fallers: Faller[] = [];
  /** What the shrub has on it now (so changes happen once). */
  private shrubLeaves = false;
  private shrubBloom = false;
  private shrubFruit = false;
  /** Dead insects that turned up, and stranded worms, since the start. */
  preyFound = 0;

  constructor(shrub: ShrubInfo | null, tree: { x: number; r: number } | null) {
    this.shrub = shrub;
    this.tree = tree;
  }

  /** How much of the tree's crown is in leaf, 0..1. */
  leafCover(doy: number): number {
    if (!this.tree) return 0;
    if (doy < 105 || doy > 318) return 0;
    if (doy < 140) return (doy - 105) / 35;
    if (doy > 285) return (318 - doy) / 33;
    return 1;
  }

  /**
   * Shade from the tree's crown at a column, 0..1: deepest by the trunk. Shade
   * keeps the ground cool at a summer noon (longer foraging, slower brood in spring).
   */
  shadeAt(x: number, doy: number): number {
    const t = this.tree;
    if (!t) return 0;
    const near = clamp(1 - Math.max(0, Math.abs(x - t.x) - t.r) / 1300, 0, 1);
    return this.leafCover(doy) * (0.3 + 0.45 * near);
  }

  /** Every tick: leaves drifting down, fruit dropping. */
  step(sim: Sim): void {
    if (!this.fallers.length) return;
    const w = sim.world;
    let j = 0;
    for (const f of this.fallers) {
      f.t++;
      if (f.fruit) {
        f.vy = Math.min(3, (f.vy ?? 0) + 0.12);
        f.y += f.vy;
      } else {
        // A leaf flutters and sways as it falls.
        f.x += f.vx + Math.sin(f.t * 0.06 + f.tone) * 0.5;
        f.y += 0.3 + Math.sin(f.t * 0.11) * 0.15;
      }
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (x < 2 || x >= w.w - 2 || y >= w.h - 2) continue;
      // (Landing is judged against the ground and what lies on it, not seeds in mid-fall.)
      if (y > 1 && y >= this.topAt(sim, x)) {
        if (f.fruit) this.restFruit(sim, x, f.tone);
        else this.restLeaf(sim, x, f.len, f.tone);
        continue;
      }
      this.fallers[j++] = f;
    }
    this.fallers.length = j;
  }

  /**
   * The empty cell just above the surface of a column: the ground and what is
   * heaped on it (spoil, litter), found from the ground line so that grains
   * still falling through the air don't count.
   */
  private topAt(sim: Sim, x: number): number {
    const w = sim.world;
    let y = w.ground[x]!;
    while (y < w.h - 2 && w.mat[y * w.w + x] === EMPTY) y++;
    while (y > 2 && w.mat[(y - 1) * w.w + x] !== EMPTY) y--;
    return y - 1;
  }

  /** A tree trunk stands in this column: nothing comes to rest on it. */
  private trunk(sim: Sim, x: number): boolean {
    const w = sim.world;
    return w.mat[(w.ground[x]! - 4) * w.w + x] === WOOD;
  }

  /**
   * A fallen leaf lies on the ground: in the cross-section, a thin line
   * draped over the surface, every cell resting on what is below it, so it
   * never roofs over a hollow an ant could be shut into (tint 2: this year's
   * leaf, which rots by summer).
   */
  private restLeaf(sim: Sim, x: number, len: number, tone: number): void {
    const w = sim.world;
    const x0 = Math.max(2, Math.round(x - len / 2));
    const x1 = Math.min(w.w - 3, x0 + len - 1);
    for (let xx = x0; xx <= x1; xx++) {
      if (this.trunk(sim, xx)) continue;
      const i = this.topAt(sim, xx) * w.w + xx;
      if (w.mat[i] === EMPTY && !w.plan[i] && w.bg[i] === 0) w.set(i, LITTER, tone, 2);
    }
  }

  /** A sloe or hip lands: a soft round fruit sitting on the ground. */
  private restFruit(sim: Sim, x: number, tone: number): void {
    const w = sim.world;
    const r = tone < 100 ? 3.6 : 4.2;
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const xx = x + dx;
      if (xx < 2 || xx >= w.w - 2 || this.trunk(sim, xx)) continue;
      const h = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)) * 1.7);
      const top = this.topAt(sim, xx);
      for (let dy = 0; dy < h; dy++) {
        const i = (top - dy) * w.w + xx;
        // Shaded within its own colour range (sloe, grape or hip).
        const lo = tone < 100 ? 0 : tone < 200 ? 100 : 200;
        if (w.mat[i] === EMPTY && w.bg[i] === 0) w.set(i, FRUIT, clamp(tone - dx * 4 + dy * 3, lo, lo + 99), 0);
      }
    }
  }

  /** A few times an in-game hour: the shrub's season, leaf fall, insects, rotting litter. */
  season(sim: Sim): void {
    const doy = sim.doy;
    const air = sim.cal.airMean(doy);
    this.shrubSeason(sim, doy, air);
    const w = sim.world;
    const rng = sim.rng;
    // The tree drops its leaves through October and early November.
    if (this.tree && doy > 278 && doy < 322) {
      const lx = clamp(Math.round(this.tree.x + (this.tree.x < w.w / 2 ? 260 : -260)), 40, w.w - 40);
      sim.noteYearly('leafFall', { x: lx, y: w.ground[lx]! - 30 });
      const n = rng.next() < 0.12 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const side = this.tree.x < w.w / 2 ? 1 : -1;
        const x = clamp(this.tree.x + side * rng.range(this.tree.r, this.tree.r + 700), 4, w.w - 5);
        this.fallers.push({ x, y: -30, vx: side * rng.range(0.02, 0.18), t: rng.int(0, 999), tone: rng.int(0, 255), len: rng.int(38, 72) });
      }
    }
    // Fallen leaves rot into the soil through the winter and spring (faster in the warmth).
    if (air > 3) {
      for (let k = 0; k < (air > 10 ? 6 : 2); k++) {
        const x = rng.int(2, w.w - 3);
        let y = 2;
        while (y < w.h - 1 && w.mat[y * w.w + x] === EMPTY) y++;
        const i = y * w.w + x;
        if (w.mat[i] === LITTER && w.tint[i] === 2 && w.bg[i] === 0 && rng.chance(0.25)) w.set(i, EMPTY, 0, 0);
      }
    }
    // Dead insects turn up on the ground in the warm months.
    const monthly = PREY_MONTH[sim.cal.month(doy)]!;
    if (monthly > 0 && rng.next() < monthly * (w.w / 640) * 0.08) this.dropPrey(sim, rng.chance(0.55) ? 'beetle' : 'hopper');
  }

  /** After a heavy rain, earthworms come up and some die stranded on the surface. */
  afterStorm(sim: Sim): void {
    const n = sim.rng.int(1, 3);
    let placed = 0;
    for (let k = 0; k < n; k++) placed += this.dropPrey(sim, 'worm');
    if (placed) sim.noteYearly('wormsUp');
  }

  /** Lay a small dead animal on the ground, shaped roughly like itself. */
  dropPrey(sim: Sim, kind: 'beetle' | 'hopper' | 'worm', at?: number): number {
    const w = sim.world;
    const rng = sim.rng;
    const shape: [number, number][] = [];
    let t0 = 0;
    let t1 = 149;
    if (kind === 'beetle') {
      // A ground beetle on its back: an oval of wing case.
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [0, 1], [3, 1], [1, 2], [2, 2]] as const) shape.push([dx, dy]);
    } else if (kind === 'hopper') {
      // A grasshopper: long body, a folded hind leg.
      t0 = 150;
      t1 = 219;
      const len = rng.int(7, 11);
      for (let dx = 0; dx < len; dx++) shape.push([dx, 0]);
      for (let dx = 1; dx < len - 2; dx++) shape.push([dx, 1]);
      shape.push([len - 3, 2], [len - 2, 2]);
    } else {
      t0 = 220;
      t1 = 255;
      const len = rng.int(14, 24);
      for (let dx = 0; dx < len; dx++) shape.push([dx, 0]);
      for (let dx = 2; dx < len - 2; dx += 3) shape.push([dx, 1]);
    }
    const width = Math.max(...shape.map((s) => s[0])) + 1;
    const x0 = at ?? rng.int(12, w.w - 13 - width);
    // Rest it on the surface, column by column.
    let placed = 0;
    for (const [dx, dy] of shape) {
      const x = x0 + dx;
      if (x < 2 || x >= w.w - 2 || this.trunk(sim, x)) continue;
      const i = (this.topAt(sim, x) - dy) * w.w + x;
      if (w.mat[i] !== EMPTY || w.bg[i] !== 0 || w.plan[i]) continue;
      w.set(i, PREY, rng.int(t0, t1), 0);
      placed++;
    }
    if (placed) this.preyFound++;
    return placed ? 1 : 0;
  }

  /**
   * Blackthorn flowers white on bare twigs in early April, then leafs out;
   * dog rose leafs out first and flowers pink in June. Both bear fruit from
   * late summer (sloes, hips): a few hang on the low twigs in view, and more
   * drop from the bush overhead through the autumn. The leaves turn and fall
   * in October.
   */
  private shrubSeason(sim: Sim, doy: number, air: number): void {
    const s = this.shrub;
    if (!s) return;
    const w = sim.world;
    const rng = sim.rng;
    const black = s.kind === 'blackthorn';
    const bloom = black ? doy >= 88 && doy < 114 : doy >= 150 && doy < 178;
    if (bloom !== this.shrubBloom) {
      this.shrubBloom = bloom;
      for (const cells of s.buds) {
        // Five petals round a pale heart.
        const [cx, cy, r] = this.disc(sim, cells);
        for (const i of cells) {
          const dx = (i % w.w) - cx;
          const dy = ((i / w.w) | 0) - cy;
          const d = Math.hypot(dx, dy) / r;
          const petal = Math.cos(Math.atan2(dy, dx) * 5) > -0.35 || d < 0.35;
          if (bloom && petal && w.plant[i] === 0 && w.mat[i] === EMPTY) {
            const heart = d < 0.3;
            w.setPlant(i, FLOWER, black ? (heart ? 140 : clamp(Math.round(20 + d * 40 + rng.int(-6, 6)), 0, 120)) : heart ? 255 : rng.int(170, 225));
          } else if (!bloom && w.plant[i] === FLOWER) w.setPlant(i, 0);
        }
      }
      if (bloom) sim.noteYearly(black ? 'blackthornBloom' : 'roseBloom', { x: s.x, y: w.ground[s.x]! - 70 });
    }
    const leafy = doy >= (black ? 108 : 100) && doy < 305 && air > 6;
    if (leafy && !this.shrubLeaves) {
      this.shrubLeaves = true;
      for (const cells of s.leaves) {
        const shade = rng.int(10, 50);
        for (const i of cells) if (w.plant[i] === 0 && w.mat[i] === EMPTY) w.setPlant(i, LEAF, clamp(shade + rng.int(-4, 4), 0, 63));
      }
    }
    if (this.shrubLeaves) {
      // Autumn colour, then the leaves come down one by one.
      if (doy > 272) {
        const lvl = doy > 290 ? 2 : 1;
        for (const cells of s.leaves) {
          const i0 = cells[0]!;
          if (w.plant[i0] !== LEAF) continue;
          if ((w.ptone[i0]! >> DRY_SHIFT) !== lvl) for (const i of cells) if (w.plant[i] === LEAF) w.setPlant(i, LEAF, (w.ptone[i]! & 63) | (lvl << DRY_SHIFT));
          if (rng.chance(doy > 290 ? 0.1 : 0.025)) {
            for (const i of cells) if (w.plant[i] === LEAF) w.setPlant(i, 0);
            this.fallers.push({ x: i0 % w.w, y: (i0 / w.w) | 0, vx: rng.range(-0.08, 0.08), t: rng.int(0, 999), tone: rng.int(0, 255), len: Math.max(8, Math.round(Math.sqrt(cells.length) * 2.2)) });
          }
        }
      }
      if (!leafy) {
        this.shrubLeaves = false;
        for (const cells of s.leaves) for (const i of cells) if (w.plant[i] === LEAF) w.setPlant(i, 0);
      }
    }
    // Fruit: sloes (blue-black with a bloom) or hips (scarlet).
    const fruiting = doy >= (black ? 235 : 225) || doy < 40;
    if (fruiting && !this.shrubFruit) {
      this.shrubFruit = true;
      for (const cells of s.buds) {
        if (!rng.chance(0.6)) continue;
        const [cx, cy, r] = this.disc(sim, cells);
        for (const i of cells) {
          if (w.mat[i] !== EMPTY || w.plant[i] === TWIG) continue;
          const dx = (i % w.w) - cx;
          const dy = ((i / w.w) | 0) - cy;
          // Lit from the upper left; sloes wear a pale bloom.
          const lit = clamp(0.55 - (dx + dy) / (r * 3), 0, 1);
          w.setPlant(i, BERRY, black ? Math.round(lit * 120) : 140 + Math.round(lit * 115));
        }
      }
      sim.noteYearly(black ? 'sloes' : 'hips', { x: s.x, y: w.ground[s.x]! - 50 });
    }
    if (this.shrubFruit) {
      const late = doy > 260 || doy < 40;
      for (const cells of s.buds) {
        const i0 = cells.find((i) => w.plant[i] === BERRY);
        if (i0 === undefined || !rng.chance(late ? 0.02 : 0.004)) continue;
        for (const i of cells) if (w.plant[i] === BERRY) w.setPlant(i, 0);
        this.fallers.push({ x: this.disc(sim, cells)[0], y: (i0 / w.w) | 0, vx: 0, vy: 0, t: 0, tone: black ? rng.int(10, 90) : rng.int(205, 250), len: 0, fruit: true });
      }
      // And from the bush above the frame.
      if (late && doy > 240 && rng.chance(0.015)) {
        this.fallers.push({ x: s.x + rng.int(-140, 140), y: -10, vx: 0, vy: rng.range(0, 1), t: 0, tone: black ? rng.int(10, 90) : rng.int(205, 250), len: 0, fruit: true });
      }
      if (!fruiting) {
        this.shrubFruit = false;
        for (const cells of s.buds) for (const i of cells) if (w.plant[i] === BERRY) w.setPlant(i, 0);
      }
    }
  }

  /** Centre and radius of a group of cells. */
  private disc(sim: Sim, cells: number[]): [number, number, number] {
    const W = sim.world.w;
    let sx = 0;
    let sy = 0;
    for (const i of cells) {
      sx += i % W;
      sy += (i / W) | 0;
    }
    const n = Math.max(1, cells.length);
    return [Math.round(sx / n), Math.round(sy / n), Math.max(1, Math.sqrt(n / Math.PI))];
  }

  /** Grapes knocked off at the vintage roll onto the margin (vineyard site). */
  grapes(sim: Sim): void {
    const doy = sim.doy;
    if (doy < 250 || doy > 290 || sim.rng.next() > 0.08) return;
    const w = sim.world;
    const cx = sim.rng.int(30, w.w - 31);
    for (let dy = 0; dy < 5; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + (dy - 2) * (dy - 2) > 5) continue;
        const i = (3 + dy) * w.w + cx + dx;
        if (w.mat[i] === EMPTY) w.set(i, FRUIT, sim.rng.int(120, 190), 0);
      }
  }

  /** Ticks between seasonal checks. */
  static readonly PERIOD = TICK_HZ * 10;
}
