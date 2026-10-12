import { World } from './world';
import { Rng } from '../util/rng';
import { EMPTY, WATER, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, SAND, SEED, REFUSE, ROOT } from './mat';

/**
 * `tint` of a refuse grain that is a germinated seed. The high bit, so it never
 * reads as a soil id when the cell's tint becomes back-wall memory.
 */
export const SPROUT = 0x80;

const table = (entries: [number, number][]): Float32Array => {
  const t = new Float32Array(32);
  for (const [m, v] of entries) t[m] = v;
  return t;
};

/** How readily each material soaks up water (chance per contact per tick). */
export const ABSORB = table([
  [HUMUS, 0.5], [LOAM, 0.3], [SUBSOIL, 0.35], [CLAY, 0.06], [GRAVEL, 0.45], [SAND, 0.55], [SEED, 0.6], [REFUSE, 0.3],
  [ROOT, 0.5],
]);

/**
 * How much of the difference passes into a cell per visit. Water runs fast down
 * root channels and the loose fill of old worm burrows (preferential flow),
 * and barely into clay.
 */
const SEEP = table([[HUMUS, 0.6], [LOAM, 0.45], [SUBSOIL, 0.45], [CLAY, 0.12], [GRAVEL, 0.5], [SAND, 0.5], [SEED, 0.45], [REFUSE, 0.45], [ROOT, 0.9]]);

/** Moisture above which a ceiling of this soil gives way. Clay holds best. */
const SLUMP = table([[HUMUS, 125], [LOAM, 140], [SUBSOIL, 135], [CLAY, 190], [GRAVEL, 150]]);

/**
 * Soil moisture: water soaks in, spreads (mostly downward), dries near the
 * surface, and wet ceilings slump into the tunnels below.
 * Only wet cells are tracked, so a dry world costs nothing.
 */
export class Moisture {
  private world: World;
  private rng: Rng;
  private list: number[] = [];
  private inList: Uint8Array;
  private cursor = 0;
  /** Ceiling cells that slumped since the last read (for event messages). */
  collapses = 0;
  /** Stored seeds that germinated since the last read. */
  sprouted = 0;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
    this.inList = new Uint8Array(world.size);
  }

  get wetCells(): number {
    return this.list.length;
  }

  add(i: number, amount: number): void {
    const w = this.world;
    const before = w.moist[i]!;
    const v = Math.min(255, before + amount);
    w.moist[i] = v;
    if ((before >> 4) !== (v >> 4)) w.markDirty(i);
    if (!this.inList[i] && v > 0) {
      this.inList[i] = 1;
      this.list.push(i);
    }
  }

  private setMoist(i: number, v: number): void {
    const w = this.world;
    const before = w.moist[i]!;
    w.moist[i] = v;
    if ((before >> 4) !== (v >> 4)) w.markDirty(i);
  }

  step(): void {
    const list = this.list;
    if (list.length === 0) return;
    const w = this.world;
    const W = w.w;
    // Each wet cell is visited about twice a second; rates below are per visit.
    const budget = Math.min(list.length, Math.ceil(list.length / 15) + 1);
    for (let k = 0; k < budget; k++) {
      if (this.cursor >= list.length) this.cursor = 0;
      const i = list[this.cursor]!;
      let m = w.moist[i]!;
      const mat = w.mat[i]!;
      if (m === 0 || !(ABSORB[mat]! > 0)) {
        // Dried out or no longer soil (dug, collapsed into a tunnel and carried off).
        if (!(ABSORB[mat]! > 0)) this.setMoist(i, 0);
        this.inList[i] = 0;
        list[this.cursor] = list[list.length - 1]!;
        list.pop();
        continue;
      }
      // Soaked seed in the nest germinates: it is no longer food, and the
      // workers carry the sprouts out (a refuse grain flagged as a sprout).
      if (mat === SEED && m > 40 && w.bg[i] === 1 && this.rng.next() < 0.15) {
        w.set(i, REFUSE, w.tone[i], SPROUT);
        if (!w.plan[i]) w.claimed.push(i);
        this.sprouted++;
        this.cursor++;
        continue;
      }
      // Seep: straight down first, then a random side (a root channel passes it straight on down).
      const passes = mat === ROOT ? 3 : 2;
      for (let s = 0; s < passes; s++) {
        const r = this.rng.next();
        const n = s === 0 || (mat === ROOT && s === 1) ? i + W : r < 0.45 ? i - 1 : r < 0.9 ? i + 1 : i - W;
        if (n <= 0 || n >= w.size || !(ABSORB[w.mat[n]!]! > 0)) continue;
        const mn = w.moist[n]!;
        if (mn >= m - 6) continue;
        // A soaked seed holds its water (that is what wakes the embryo).
        const t = Math.floor((m - mn) * SEEP[w.mat[n]!]! * (mat === SEED ? 0.2 : 1));
        if (t > 0) {
          m -= t;
          this.add(n, t);
        }
      }
      // Dry: fast where air touches the surface, slowly below.
      const exposed = w.mat[i - W] === EMPTY && w.bg[i - W] === 0;
      const loss = exposed ? 2 : this.rng.next() < 0.2 ? 1 : 0;
      m = Math.max(0, m - loss);
      this.setMoist(i, m);
      // Wet ceilings give way (walls too, less readily).
      const slump = SLUMP[mat]!;
      if (slump > 0 && m > slump && w.bg[i] === 1) {
        const below = w.mat[i + W]!;
        const open = (c: number): boolean => c === EMPTY || c === WATER;
        const p = open(below) ? 0.25 : open(w.mat[i - 1]!) || open(w.mat[i + 1]!) ? 0.06 : 0;
        if (p > 0 && this.rng.next() < ((m - slump) / (256 - slump)) * p) {
          w.set(i, SAND, w.tone[i], mat);
          if (!w.plan[i]) w.claimed.push(i);
          this.collapses++;
        }
      }
      this.cursor++;
    }
  }
}
