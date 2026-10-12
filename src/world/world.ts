import { EMPTY, SOLID, POWDER, WATER } from './mat';

export const CHUNK = 16;

/**
 * The cell grid. Everything physical lives here: soil, plants, stored seeds,
 * refuse, water. Ants and brood are entities on top of it.
 */
export class World {
  readonly w: number;
  readonly h: number;
  readonly size: number;

  /** Material id per cell. */
  readonly mat: Uint8Array;
  /** Per-cell colour variation, carried along when a cell moves. */
  readonly tone: Uint8Array;
  /** For loose materials: the material they were dug from (colour source). */
  readonly tint: Uint8Array;
  /** 1 where the cell sits below the original ground line (soil back wall behind it). */
  readonly bg: Uint8Array;
  /** Soil moisture 0..255. */
  readonly moist: Uint8Array;
  /** Chamber id + 1, or 0. Set by the nest planner. */
  readonly zone: Uint16Array;
  /** 1 where the nest plan wants an open cell. */
  readonly plan: Uint8Array;
  /** 1 where an ant can stand: open cell touching something solid. */
  readonly walk: Uint8Array;
  /** Original ground line per column. */
  readonly ground: Int16Array;
  /** Plant layer (stem, leaf, flower, seedhead ids), in front of the slice. */
  readonly plant: Uint8Array;
  readonly ptone: Uint8Array;

  /** The nest's mouth is shut: plug cells are not to be dug out until it opens. */
  sealed = false;
  /** Around the shut mouth (x0, x1, y0, y1): rain soaks into the plug there instead of pooling and leaking in. */
  sealBox: [number, number, number, number] = [0, -1, 0, -1];
  /** One box per entrance (a big colony has two gates). */
  sealBoxes: [number, number, number, number][] = [];

  /** Is this cell over or in a shut mouth of the nest? */
  inSealBox(i: number): boolean {
    if (!this.sealed) return false;
    const x = i % this.w;
    const y = (i - x) / this.w;
    // (Saves from before the second gate have only the one box.)
    const boxes = this.sealBoxes?.length ? this.sealBoxes : [this.sealBox];
    for (const b of boxes) if (x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3]) return true;
    return false;
  }
  /** Bumped whenever walkability changes anywhere. */
  walkVersion = 0;
  /** Underground cells that became part of the nest outside the plan (debris to clear). */
  readonly claimed: number[] = [];

  // Change list for the renderer (cells whose colour must be recomputed).
  private dirtyMark: Uint8Array;
  readonly dirtyList: Int32Array;
  dirtyCount = 0;
  dirtyAll = true;

  // Physics activity, per 16x16 chunk.
  readonly cw: number;
  readonly ch: number;
  active: Uint8Array;
  nextActive: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.size = w * h;
    this.mat = new Uint8Array(this.size);
    this.tone = new Uint8Array(this.size);
    this.tint = new Uint8Array(this.size);
    this.bg = new Uint8Array(this.size);
    this.moist = new Uint8Array(this.size);
    this.zone = new Uint16Array(this.size);
    this.plan = new Uint8Array(this.size);
    this.walk = new Uint8Array(this.size);
    this.ground = new Int16Array(w);
    this.plant = new Uint8Array(this.size);
    this.ptone = new Uint8Array(this.size);
    this.dirtyMark = new Uint8Array(this.size);
    this.dirtyList = new Int32Array(1 << 16);
    this.cw = Math.ceil(w / CHUNK);
    this.ch = Math.ceil(h / CHUNK);
    this.active = new Uint8Array(this.cw * this.ch);
    this.nextActive = new Uint8Array(this.cw * this.ch);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.mat[y * this.w + x]!;
  }

  isSolid(i: number): boolean {
    return SOLID[this.mat[i]!] === 1;
  }

  isOpen(i: number): boolean {
    return this.mat[i] === EMPTY;
  }

  /** Underground: below the original ground line (or inside a tunnel). */
  isUnder(i: number): boolean {
    return this.bg[i] === 1;
  }

  /** Change one cell. Keeps walkability, render dirtiness and physics wake-ups in sync. */
  set(i: number, m: number, tone = this.tone[i]!, tint = this.tint[i]!): void {
    const old = this.mat[i]!;
    this.mat[i] = m;
    this.tone[i] = tone;
    this.tint[i] = tint;
    this.markDirty(i);
    if (SOLID[old] !== SOLID[m] || old === EMPTY || m === EMPTY) {
      this.refreshWalkAround(i);
    }
    if (POWDER[m] || m === WATER || POWDER[old] || old === WATER || m === EMPTY) this.wake(i);
  }

  /** Set or clear a plant part. Plants never block, but ants can cling to them. */
  setPlant(i: number, m: number, tone = 0): void {
    this.plant[i] = m;
    this.ptone[i] = tone;
    this.markDirty(i);
    this.refreshWalkAround(i);
  }

  /** Swap two cells (used by physics so tone/tint travel with the grain). */
  swap(a: number, b: number): void {
    const m = this.mat[a]!;
    const t = this.tone[a]!;
    const n = this.tint[a]!;
    this.mat[a] = this.mat[b]!;
    this.tone[a] = this.tone[b]!;
    this.tint[a] = this.tint[b]!;
    this.mat[b] = m;
    this.tone[b] = t;
    this.tint[b] = n;
    this.markDirty(a);
    this.markDirty(b);
    this.refreshWalkAround(a);
    this.refreshWalkAround(b);
    this.wake(a);
    this.wake(b);
  }

  markDirty(i: number): void {
    // The renderer shades a cell by its vertical neighbours, so dirty those too.
    this.mark1(i);
    if (i >= this.w) this.mark1(i - this.w);
    if (i + this.w < this.size) this.mark1(i + this.w);
  }

  private mark1(i: number): void {
    if (this.dirtyMark[i]) return;
    if (this.dirtyCount >= this.dirtyList.length) {
      this.dirtyAll = true;
      return;
    }
    this.dirtyMark[i] = 1;
    this.dirtyList[this.dirtyCount++] = i;
  }

  /** Renderer calls this after consuming the dirty list. */
  clearDirty(): void {
    for (let k = 0; k < this.dirtyCount; k++) this.dirtyMark[this.dirtyList[k]!] = 0;
    this.dirtyCount = 0;
    this.dirtyAll = false;
  }

  private refreshWalkAround(i: number): void {
    const w = this.w;
    const x0 = i % w;
    const y0 = (i - x0) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= this.h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= w) continue;
        this.computeWalk(y * w + x, x, y);
      }
    }
    this.walkVersion++;
  }

  computeWalk(i: number, x: number, y: number): void {
    let v = 0;
    if (this.mat[i] === EMPTY && x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1) {
      const w = this.w;
      const p = this.plant;
      // Underground the colony lives between the glass and the soil face behind it:
      // an ant can cling anywhere in an open tunnel or chamber.
      if (this.bg[i] === 1) v = 1;
      else if (
        SOLID[this.mat[i + 1]!] || SOLID[this.mat[i - 1]!] || SOLID[this.mat[i + w]!] ||
        SOLID[this.mat[i - w]!] || SOLID[this.mat[i + w + 1]!] || SOLID[this.mat[i + w - 1]!] ||
        SOLID[this.mat[i - w + 1]!] || SOLID[this.mat[i - w - 1]!] ||
        p[i] || p[i + 1] || p[i - 1] || p[i + w] || p[i - w]
      ) v = 1;
    }
    this.walk[i] = v;
  }

  recomputeAllWalk(): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.computeWalk(y * this.w + x, x, y);
    }
    this.walkVersion++;
  }

  wake(i: number): void {
    const x = i % this.w;
    const y = (i - x) / this.w;
    const cx = (x / CHUNK) | 0;
    const cy = (y / CHUNK) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= this.ch) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= this.cw) continue;
        this.nextActive[yy * this.cw + xx] = 1;
      }
    }
  }
}
