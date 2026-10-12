import { Rng } from '../util/rng';
import { World } from './world';
import { EMPTY, STEM, LEAF, FLOWER, SEEDHEAD, SEED, ROOT, SOIL, SOLID } from './mat';
import { TICK_HZ } from '../config';

export type PlantKind = 'grass' | 'clover' | 'purse';

interface Part {
  i: number;
  m: number;
  tone: number;
}

/**
 * A plant is a list of cells it grows into, plus seed slots that ripen over
 * time. Stems are real cells, so ants climb them to reach the seeds.
 */
export class Plant {
  readonly kind: PlantKind;
  readonly x: number;
  readonly baseY: number;
  readonly parts: Part[] = [];
  readonly slots: number[] = [];
  grown = 0;
  regrow: number;
  timer: number;

  constructor(kind: PlantKind, x: number, baseY: number, rng: Rng) {
    this.kind = kind;
    this.x = x;
    this.baseY = baseY;
    this.regrow = Math.round(rng.range(9, 20) * TICK_HZ);
    this.timer = rng.int(0, this.regrow);
  }

  get mature(): boolean {
    return this.grown >= this.parts.length;
  }
}

const SEED_DROP_CHANCE = 1 / (TICK_HZ * 90);

export class Plants {
  readonly list: Plant[] = [];
  private rng: Rng;
  private world: World;
  maxPlants = 34;
  /** Seeds that ripened since the last stats read (for balancing). */
  ripened = 0;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
  }

  /** Top-most solid cell of a column at or below the original ground. */
  surfaceAt(x: number): number {
    const w = this.world;
    for (let y = 1; y < w.h; y++) {
      const m = w.mat[y * w.w + x]!;
      if (SOLID[m]) return y;
    }
    return w.h - 1;
  }

  spawn(kind: PlantKind, x: number, instant: boolean): Plant | null {
    const w = this.world;
    if (x < 6 || x > w.w - 7) return null;
    const ground = this.surfaceAt(x);
    if (!SOIL[w.mat[ground * w.w + x]!]) return null;
    const p = new Plant(kind, x, ground, this.rng);
    this.design(p);
    this.roots(p);
    this.list.push(p);
    if (instant) {
      while (!p.mature) this.growStep(p);
      for (const s of p.slots) if (this.rng.chance(0.6) && w.mat[s] === EMPTY && !w.plant[s]) w.setPlant(s, SEEDHEAD, this.rng.int(0, 255));
    }
    return p;
  }

  private add(p: Plant, x: number, y: number, m: number, tone?: number): void {
    const w = this.world;
    if (x < 1 || x >= w.w - 1 || y < 1 || y >= p.baseY) return;
    const i = y * w.w + x;
    if (p.parts.some((q) => q.i === i)) return;
    p.parts.push({ i, m, tone: tone ?? this.rng.int(0, 255) });
  }

  private design(p: Plant): void {
    const r = this.rng;
    const x0 = p.x;
    const y0 = p.baseY - 1;
    if (p.kind === 'grass') {
      const h = r.int(38, 74);
      const lean = r.range(-0.18, 0.18);
      const bend = r.range(-9, 9);
      const stemTone = r.int(0, 255);
      const stemX: number[] = [];
      for (let t = 0; t < h; t++) {
        const f = t / h;
        const x = Math.round(x0 + lean * t + bend * f * f);
        stemX.push(x);
        this.add(p, x, y0 - t, STEM, stemTone);
        // Leaf blades arch out from the lower stem.
        if (t === 2 || t === Math.round(h * 0.22) || (t === Math.round(h * 0.4) && r.chance(0.6))) {
          const side = r.chance(0.5) ? -1 : 1;
          const len = r.int(7, 15);
          let bx = x;
          let by = y0 - t;
          for (let k = 1; k <= len; k++) {
            bx += side;
            if (k < len * 0.55) by -= 1;
            else if (k > len * 0.8) by += 1;
            this.add(p, bx, by, LEAF, stemTone);
          }
        }
      }
      // Panicle: spikelets along the top of the stem.
      const top = Math.min(12, Math.floor(h * 0.28));
      for (let t = h - top; t < h; t += 2) {
        const x = stemX[t]!;
        const side = ((t >> 1) & 1) === 0 ? -1 : 1;
        p.slots.push((y0 - t) * this.world.w + x + side);
        if (r.chance(0.5)) p.slots.push((y0 - t - 1) * this.world.w + x - side);
      }
      p.slots.push((y0 - h) * this.world.w + stemX[h - 1]!);
    } else if (p.kind === 'clover') {
      const petioles = r.int(2, 4);
      for (let k = 0; k < petioles; k++) {
        const h = r.int(6, 15);
        const dx = r.int(-5, 5);
        const tone = r.int(0, 255);
        for (let t = 0; t < h; t++) this.add(p, x0 + Math.round((dx * t) / h), y0 - t, STEM, tone);
        const tx = x0 + dx;
        const ty = y0 - h;
        // Three round leaflets.
        for (const [lx, ly] of [[-2, 0], [2, 0], [0, -2]] as const) {
          for (let yy = -1; yy <= 1; yy++)
            for (let xx = -1; xx <= 1; xx++) if (xx * xx + yy * yy <= 1 || r.chance(0.35)) this.add(p, tx + lx + xx, ty + ly + yy, LEAF, tone);
        }
      }
      const fh = r.int(13, 22);
      const fdx = r.int(-3, 3);
      for (let t = 0; t < fh; t++) this.add(p, x0 + Math.round((fdx * t) / fh), y0 - t, STEM);
      const fx = x0 + fdx;
      const fy = y0 - fh - 2;
      const pink = r.chance(0.4) ? 200 : 40;
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 5) this.add(p, fx + xx, fy + yy, FLOWER, pink + r.int(0, 50));
      p.slots.push((fy + 3) * this.world.w + fx - 1, (fy + 3) * this.world.w + fx + 1);
    } else {
      // Shepherd's purse: rosette, tall stem, heart-shaped pods along the top half.
      const h = r.int(26, 58);
      const tone = r.int(0, 255);
      for (const side of [-1, 1]) {
        const len = r.int(3, 7);
        for (let k = 1; k <= len; k++) this.add(p, x0 + side * k, y0 - (k > len - 2 ? 1 : 0), LEAF, tone);
      }
      const lean = r.range(-0.1, 0.1);
      for (let t = 0; t < h; t++) {
        const x = Math.round(x0 + lean * t);
        this.add(p, x, y0 - t, STEM, tone);
        if (t > h * 0.45 && t < h - 3 && t % 3 === 0) {
          const side = (t / 3) % 2 === 0 ? -1 : 1;
          this.add(p, x + side, y0 - t - 1, STEM, tone);
          p.slots.push((y0 - t - 2) * this.world.w + x + side * 2);
        }
      }
      const tx = Math.round(x0 + lean * h);
      for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [0, -1]] as const) this.add(p, tx + dx, y0 - h + dy, FLOWER, r.int(0, 40));
    }
  }

  private roots(p: Plant): void {
    const w = this.world;
    const r = this.rng;
    const count = p.kind === 'grass' ? r.int(3, 6) : r.int(2, 4);
    const maxLen = p.kind === 'grass' ? 46 : 30;
    for (let k = 0; k < count; k++) {
      let x = p.x + r.int(-1, 1);
      let y = p.baseY + 1;
      let dx = r.range(-0.9, 0.9);
      const len = r.int(Math.floor(maxLen * 0.4), maxLen);
      let fx = x;
      for (let t = 0; t < len; t++) {
        fx += dx + r.range(-0.6, 0.6);
        dx *= 0.92;
        y += r.chance(0.85) ? 1 : 0;
        x = Math.round(fx);
        if (!w.inside(x, y)) break;
        const i = y * w.w + x;
        if (SOIL[w.mat[i]!]) w.set(i, ROOT, r.int(0, 255));
        // Fine side rootlets.
        if (r.chance(0.12)) {
          const s = r.chance(0.5) ? -1 : 1;
          for (let q = 1; q < r.int(3, 7); q++) {
            const j = (y + (q >> 1)) * w.w + x + s * q;
            if (j < w.size && SOIL[w.mat[j]!]) w.set(j, ROOT, r.int(0, 255));
          }
        }
      }
    }
  }

  private growStep(p: Plant): void {
    const w = this.world;
    const part = p.parts[p.grown++]!;
    // Plants don't grow into the nest's entrance.
    if (w.mat[part.i] === EMPTY && !w.plant[part.i]) w.setPlant(part.i, part.m, part.tone);
  }

  tick(): void {
    const w = this.world;
    for (const p of this.list) {
      if (!p.mature) {
        if (this.rng.chance(0.08)) this.growStep(p);
        continue;
      }
      if (--p.timer <= 0) {
        p.timer = p.regrow;
        // Ripen one empty slot that still hangs off the plant.
        const s = p.slots[this.rng.int(0, p.slots.length - 1)];
        if (s !== undefined && w.mat[s] === EMPTY && !w.plant[s] && this.attached(s)) {
          w.setPlant(s, SEEDHEAD, this.rng.int(0, 255));
          this.ripened++;
        }
      }
      // Ripe seeds occasionally drop on their own.
      for (const s of p.slots) {
        if (w.plant[s] === SEEDHEAD && this.rng.next() < SEED_DROP_CHANCE) {
          const tone = w.ptone[s]!;
          w.setPlant(s, 0);
          if (w.mat[s] === EMPTY) w.set(s, SEED, tone);
        }
      }
    }
    this.germinate();
  }

  private attached(i: number): boolean {
    const w = this.world;
    for (const d of [1, -1, w.w, -w.w, w.w + 1, w.w - 1, -w.w + 1, -w.w - 1]) {
      const m = w.plant[i + d];
      if (m === STEM || m === LEAF || m === FLOWER) return true;
    }
    return false;
  }

  /** A fallen seed left lying on open ground may sprout. Sampled, not scanned. */
  private germinate(): void {
    if (this.list.length >= this.maxPlants || !this.rng.chance(0.02)) return;
    const w = this.world;
    const x = this.rng.int(8, w.w - 9);
    // A seed lying on the ground is itself the top-most solid cell.
    const i = this.surfaceAt(x) * w.w + x;
    if (w.mat[i] !== SEED || w.bg[i] === 1) return;
    if (this.list.some((p) => Math.abs(p.x - x) < 8)) return;
    w.set(i, EMPTY);
    this.spawn(this.rng.pick(['grass', 'purse', 'clover'] as const), x, false);
  }
}
