import { World } from '../world/world';
import { EMPTY } from '../world/mat';

/** Distance fields the ants descend. Each is a multi-source BFS over walkable cells. */
export const F = {
  Out: 0, // open air just outside the entrances
  Entr: 1, // nest entrances; floods the whole surface ("which way is home")
  Dig: 2, // next to soil the plan wants removed
  Gran: 3, // free spots on granary floors
  Store: 4, // next to stored seeds
  Nurse: 5, // free spots on nursery floors
  Larva: 6, // hungry larvae
  Egg: 7, // eggs not yet in a nursery
  Trash: 8, // corpses and husks inside the nest
  Rest: 9, // chamber floors to rest on
  Royal: 10, // the queen's chamber floor
} as const;
export const FIELD_COUNT = 11;
export const FAR = 65535;

/** Rebuild interval per field, in ticks. Fast-changing targets refresh more often. */
const INTERVAL = [20, 30, 10, 24, 18, 30, 14, 20, 30, 45, 45];

/** Outside cells closer than this to an entrance are included in the in-nest fields. */
const MOUTH = 9;

const OFF_X = [1, -1, 0, 0, 1, 1, -1, -1];
const OFF_Y = [0, 0, 1, -1, 1, -1, 1, -1];

export class Fields {
  readonly dist: Uint16Array[] = [];
  /** How many sources each field had at its last rebuild. */
  readonly sourceCount = new Int32Array(FIELD_COUNT);
  readonly off: Int32Array;
  private queue: Int32Array;
  private world: World;
  /** Cells each field touched last time, so a rebuild only resets those. */
  private touched: Int32Array[] = [];
  private touchedCount = new Int32Array(FIELD_COUNT);
  private due = new Int32Array(FIELD_COUNT);

  constructor(world: World) {
    this.world = world;
    for (let f = 0; f < FIELD_COUNT; f++) {
      this.dist.push(new Uint16Array(world.size).fill(FAR));
      this.touched.push(new Int32Array(1024));
    }
    this.queue = new Int32Array(world.size);
    this.off = new Int32Array(8);
    for (let k = 0; k < 8; k++) this.off[k] = OFF_Y[k]! * world.w + OFF_X[k]!;
  }

  /** Can an ant step from i in direction k (no squeezing between diagonal corners)? */
  canStep(i: number, k: number): boolean {
    const w = this.world;
    const n = i + this.off[k]!;
    if (!w.walk[n]) return false;
    if (k < 4) return true;
    return w.mat[i + OFF_X[k]!] === EMPTY || w.mat[i + OFF_Y[k]! * w.w] === EMPTY;
  }

  build(f: number, sources: ArrayLike<number>, count = sources.length): void {
    const d = this.dist[f]!;
    const w = this.world;
    const walk = w.walk;
    const bg = w.bg;
    // Reset only what the previous build reached.
    const prev = this.touched[f]!;
    const pc = this.touchedCount[f]!;
    for (let k = 0; k < pc; k++) d[prev[k]!] = FAR;

    // Every field but "entrance" stays inside the nest (plus the mouth area).
    const inside = f !== F.Entr;
    const entr = this.dist[F.Entr]!;
    const q = this.queue;
    let tail = 0;
    for (let k = 0; k < count; k++) {
      const s = sources[k]!;
      if (!walk[s] || d[s] === 0) continue;
      d[s] = 0;
      q[tail++] = s;
    }
    this.sourceCount[f] = tail;
    const off = this.off;
    const W = w.w;
    const mat = w.mat;
    let head = 0;
    while (head < tail) {
      const i = q[head++]!;
      const nd = d[i]! + 1;
      for (let k = 0; k < 8; k++) {
        const n = i + off[k]!;
        if (!walk[n] || d[n]! <= nd) continue;
        if (inside && bg[n] === 0 && entr[n]! > MOUTH) continue;
        if (k >= 4 && mat[i + OFF_X[k]!] !== EMPTY && mat[i + OFF_Y[k]! * W] !== EMPTY) continue;
        d[n] = nd;
        q[tail++] = n;
      }
    }
    // Remember what we touched (the queue holds exactly that).
    let t = this.touched[f]!;
    if (t.length < tail) {
      t = new Int32Array(Math.max(tail, t.length * 2));
      this.touched[f] = t;
    }
    t.set(q.subarray(0, tail));
    this.touchedCount[f] = tail;
  }

  /** The most overdue field, if any is due this tick (at most one per tick). */
  nextDue(tick: number): number {
    let best = -1;
    let late = -1;
    for (let f = 0; f < FIELD_COUNT; f++) {
      const l = tick - this.due[f]!;
      if (l >= 0 && l > late) {
        late = l;
        best = f;
      }
    }
    if (best >= 0) this.due[best] = tick + INTERVAL[best]!;
    return best;
  }

  /** Ask for a field to be rebuilt soon (its targets just changed a lot). */
  hurry(f: number, tick: number): void {
    this.due[f] = Math.min(this.due[f]!, tick);
  }
}
