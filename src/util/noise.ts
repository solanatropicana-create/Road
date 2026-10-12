import { Rng } from './rng';

/** Seeded 2D value noise with fractal sums. Cheap and good enough for terrain. */
export class Noise {
  private perm: Uint8Array;
  private vals: Float32Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      this.vals[i] = rng.next() * 2 - 1;
    }
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  private v(ix: number, iy: number): number {
    return this.vals[this.perm[(this.perm[ix & 255]! + iy) & 511]!]!;
  }

  /** Smooth value noise in [-1, 1]. */
  n2(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.v(ix, iy);
    const b = this.v(ix + 1, iy);
    const c = this.v(ix, iy + 1);
    const d = this.v(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  n1(x: number): number {
    return this.n2(x, 17.31);
  }

  fbm2(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += this.n2(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }

  fbm1(x: number, octaves = 4): number {
    return this.fbm2(x, 3.7, octaves);
  }
}
