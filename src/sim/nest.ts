import { World } from '../world/world';
import { Rng } from '../util/rng';
import { Noise } from '../util/noise';
import {
  EMPTY, STONE, BEDROCK, ROOT, CLAY, GRAVEL, SEED, REFUSE, FRUIT, HARDNESS, SOLID, LITTER,
} from '../world/mat';
import type { ChamberKind } from './types';

export interface Chamber {
  id: number;
  kind: ChamberKind;
  cx: number;
  cy: number;
  w: number;
  h: number;
  floorY: number;
  cells: number[];
  dug: number;
  ready: boolean;
  /** Open cells standing on something solid (where brood or seeds go). */
  floor: number[];
  seeds: number;
  capacity: number;
}

export interface NestNeeds {
  adults: number;
  brood: number;
  seeds: number;
  /** The player's queued build orders (mode B), first is next. */
  orders: ChamberKind[];
}

const SIZE: Record<ChamberKind, { w: [number, number]; h: [number, number]; depth: number; band: [number, number] }> = {
  queen: { w: [20, 26], h: [9, 11], depth: 999, band: [30, 250] },
  nursery: { w: [30, 46], h: [10, 12], depth: 45, band: [18, 110] },
  granary: { w: [30, 52], h: [10, 13], depth: 70, band: [24, 150] },
  rest: { w: [22, 36], h: [8, 10], depth: 90, band: [18, 240] },
};

/**
 * The colony's architect. Real nest casts (Messor, Pogonomyrmex) show
 * near-vertical shafts with flat-floored, pancake-shaped chambers budding off
 * them, larger near the top. The planner grows that shape over time and the
 * workers dig whatever it marks.
 */
export class Nest {
  readonly chambers: Chamber[] = [];
  readonly planCells: number[] = [];
  readonly frontier: number[] = [];
  /** Walkable cells beside frontier cells (sources for the dig field). */
  readonly digSpots: number[] = [];
  entrances: number[] = [];
  openCells = 0;
  pendingCells = 0;
  zonesChanged = true;
  founded = false;
  foundX = 0;
  /** Player's expansion marker (mode B): grow toward this point. */
  marker: { x: number; y: number } | null = null;
  lastPlanFailed = 0;
  private cutOff = 0;

  private world: World;
  private rng: Rng;
  private noise: Noise;
  private planDist: Uint8Array;
  private g: Float32Array;
  private seen: Uint32Array;
  private from: Int32Array;
  private gen = 1;
  private heap: number[] = [];
  private heapF: number[] = [];

  constructor(world: World, rng: Rng, seed: number) {
    this.world = world;
    this.rng = rng;
    this.noise = new Noise(seed * 31 + 5);
    this.planDist = new Uint8Array(world.size);
    this.g = new Float32Array(world.size);
    this.seen = new Uint32Array(world.size);
    this.from = new Int32Array(world.size);
  }

  zoneKinds(): (string | undefined)[] {
    return this.chambers.map((c) => (c.ready ? c.kind : undefined));
  }

  queenChamber(): Chamber | undefined {
    return this.chambers.find((c) => c.kind === 'queen');
  }

  chamberAt(i: number): Chamber | undefined {
    const z = this.world.zone[i]!;
    return z ? this.chambers[z - 1] : undefined;
  }

  // ------------------------------------------------------------ founding

  /** The queen's claustral burrow: a narrow shaft and a small sealed chamber. */
  found(x: number): { shaft: number[]; chamber: Chamber } {
    const w = this.world;
    this.founded = true;
    this.foundX = x;
    const g = w.ground[x]!;
    const depth = 26;
    const tx = x + this.rng.int(-5, 5);
    const path = this.astar(x, g, tx, g + depth) ?? [];
    const pts: [number, number][] = path.map((i) => [i % w.w, (i / w.w) | 0]);
    if (pts.length === 0) pts.push([x, g + depth]);
    const shaft: number[] = [];
    for (const [px, py] of pts) this.stampDisc(px, py, 2.0, shaft);
    // Keep the mouth itself open: spoil that slides back in gets dug out again.
    this.stampDisc(x, g - 1, 1.6, shaft, 3);
    const end = pts[pts.length - 1]!;
    const chamber = this.addChamber('queen', end[0] + this.rng.int(-3, 3), end[1] + 4, 16, 7);
    this.entrances = [w.idx(x, g)];
    this.chimney(x);
    return { shaft, chamber };
  }

  /**
   * Reserve a V of open air over an entrance, opening at 45 degrees. Loose
   * grains can't fall or slide into it, so spoil heaps up along its sides into
   * a crater with the mouth at the bottom, and nothing caps the hole.
   */
  chimney(x: number): void {
    const w = this.world;
    const g = w.ground[x]!;
    // All the way up: a capped V would let spoil pile into a roof over the crater.
    for (let y = 1; y < g - 1; y++) {
      const half = 3 + (g - 1 - y);
      for (let xx = x - half; xx <= x + half; xx++) {
        if (xx < 1 || xx >= w.w - 1) continue;
        const i = y * w.w + xx;
        if (w.mat[i] === EMPTY) w.plan[i] = 1;
        // Low growth right by the hole ends up under the spoil; tall stems stay.
        if (w.plant[i] && y > g - 8) w.setPlant(i, 0);
      }
    }
  }

  /** After the first workers hatch they widen the queen's burrow into a proper shaft. */
  widenFoundingShaft(): void {
    const w = this.world;
    const x = this.foundX;
    const g = w.ground[x]!;
    for (let y = g - 1; y < g + 34; y++) {
      for (let xx = x - 3; xx <= x + 3; xx++) {
        const i = w.idx(xx, y);
        if (w.plan[i]) this.stampDisc(xx, y, 2.6, null);
      }
    }
    // A funnel at the mouth, like the crater rim of a Messor entrance.
    this.stampDisc(x, g, 3.2, null, 3);
  }

  // ------------------------------------------------------------ stamping

  private markPlan(i: number, out: number[] | null): boolean {
    const w = this.world;
    const m = w.mat[i]!;
    if (m === STONE || m === BEDROCK) return false;
    // Above ground only open air and litter can be claimed (to keep the mouth clear).
    if (w.bg[i] !== 1 && m !== EMPTY && m !== LITTER) return false;
    if (w.plan[i]) return false;
    w.plan[i] = 1;
    this.planCells.push(i);
    out?.push(i);
    return true;
  }

  private stampDisc(cx: number, cy: number, r: number, out: number[] | null, above = 0): void {
    const w = this.world;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 2 || y < 2 || x >= w.w - 2 || y >= w.h - 4) continue;
        // Only the mouth reaches above ground (to keep it clear of spoil).
        if (y < w.ground[x]! - above) continue;
        this.markPlan(y * w.w + x, out);
      }
    }
  }

  private addChamber(kind: ChamberKind, cx: number, cy: number, cw: number, chh: number): Chamber {
    const w = this.world;
    const id = this.chambers.length;
    const floorY = Math.round(cy + chh * 0.32);
    const c: Chamber = { id, kind, cx, cy, w: cw, h: chh, floorY, cells: [], dug: 0, ready: false, floor: [], seeds: 0, capacity: 0 };
    const seed = this.rng.range(0, 1000);
    for (let y = Math.floor(cy - chh / 2) - 1; y <= floorY; y++) {
      for (let x = Math.floor(cx - cw / 2) - 2; x <= Math.ceil(cx + cw / 2) + 2; x++) {
        if (!w.inside(x, y)) continue;
        const nx = (x - cx) / (cw / 2);
        const ny = (y - cy) / (chh / 2);
        const ang = Math.atan2(ny, nx);
        // Lobed outline: real chambers bulge where workers kept digging.
        const r = 1 + this.noise.n2(Math.cos(ang) * 1.5 + seed, Math.sin(ang) * 1.5) * 0.16;
        if (nx * nx + ny * ny > r * r) continue;
        const i = y * w.w + x;
        const m = w.mat[i]!;
        if (m === STONE || m === BEDROCK || w.bg[i] !== 1) continue;
        if (!w.plan[i]) {
          w.plan[i] = 1;
          this.planCells.push(i);
        }
        w.zone[i] = id + 1;
        c.cells.push(i);
        if (y >= floorY - Math.round(chh * 0.45)) c.capacity++;
      }
    }
    this.chambers.push(c);
    this.zonesChanged = true;
    return c;
  }

  // ------------------------------------------------------------ scanning

  /**
   * Should a worker dig out this planned cell? Soil, and anything that has
   * spilled into a tunnel (seeds, husks). Stores inside chambers stay put.
   */
  static diggable(w: World, i: number): boolean {
    if (!w.plan[i]) return false;
    const m = w.mat[i]!;
    if (m === SEED || m === FRUIT || m === REFUSE) return w.zone[i] === 0 && w.bg[i] === 1;
    return HARDNESS[m]! > 0;
  }

  /** Recount what's dug, find the digging frontier, refresh chamber floors and stores. */
  scan(): void {
    const w = this.world;
    // Adopt debris and pockets that ended up inside the nest outside the plan,
    // but only where they touch the nest (two passes, so a clump joins up from
    // the side that touches). Anything else is out in the meadow: not ours.
    for (let pass = 0; pass < 2; pass++) {
      for (const i of w.claimed) {
        if (w.plan[i]) continue;
        if (!w.plan[i - 1] && !w.plan[i + 1] && !w.plan[i - w.w] && !w.plan[i + w.w]) continue;
        w.plan[i] = 1;
        this.planCells.push(i);
      }
    }
    w.claimed.length = 0;
    const mat = w.mat;
    const walk = w.walk;
    const W = w.w;
    this.frontier.length = 0;
    this.digSpots.length = 0;
    let open = 0;
    let pending = 0;
    for (const i of this.planCells) {
      const m = mat[i]!;
      if (m === EMPTY) {
        open++;
        continue;
      }
      if (!Nest.diggable(w, i)) continue;
      pending++;
      // Diggable if an ant can stand right beside it.
      const n4 = [i - 1, i + 1, i - W, i + W];
      let spot = -1;
      for (const n of n4) if (walk[n]) { spot = n; break; }
      if (spot >= 0) {
        this.frontier.push(i);
        this.digSpots.push(spot);
      }
    }
    this.openCells = open;
    this.pendingCells = pending;
    // Planned work that nobody can reach (cut off by a slump, a pile of stores):
    // after a while, dig a fresh link to it from the nearest open tunnel.
    this.cutOff = this.frontier.length === 0 && pending > 0 ? this.cutOff + 1 : 0;
    if (this.cutOff >= 4) {
      this.cutOff = 0;
      this.relink();
    }

    for (const c of this.chambers) {
      let dug = 0;
      let seeds = 0;
      c.floor.length = 0;
      for (const i of c.cells) {
        const m = mat[i]!;
        if (m === EMPTY) {
          dug++;
          if (walk[i] && SOLID[mat[i + W]!]) c.floor.push(i);
        } else if (m === SEED) {
          dug++;
          seeds++;
        } else if (m === REFUSE) dug++;
      }
      c.dug = dug;
      c.seeds = seeds;
      // Hysteresis: a finished chamber stays in use through small slumps.
      const ready = c.ready ? dug >= c.cells.length * 0.6 : dug >= c.cells.length * 0.85;
      if (ready !== c.ready) {
        c.ready = ready;
        this.zonesChanged = true;
      }
    }
  }

  private relink(): void {
    const w = this.world;
    const pend: number[] = [];
    const open: number[] = [];
    for (const i of this.planCells) {
      if (w.bg[i] !== 1) continue;
      if (w.mat[i] === EMPTY && !w.zone[i]) open.push(i);
      else if (Nest.diggable(w, i)) pend.push(i);
    }
    if (!open.length || !pend.length) return;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let t = 0; t < 400; t++) {
      const p = pend[this.rng.int(0, pend.length - 1)]!;
      const o = open[this.rng.int(0, open.length - 1)]!;
      const d = Math.abs((p % w.w) - (o % w.w)) + Math.abs(((p / w.w) | 0) - ((o / w.w) | 0));
      if (d < bd) {
        bd = d;
        best = [o, p];
      }
    }
    if (!best) return;
    const [o, p] = best;
    const path = this.astar(o % w.w, (o / w.w) | 0, p % w.w, (p / w.w) | 0, true);
    if (path) for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, 1.8, null);
  }

  // ------------------------------------------------------------ growth

  /** Desired open nest cells for a colony this size. */
  static wanted(adults: number, brood: number, perAnt: number, base: number): number {
    return base + (adults + brood * 0.4) * perAnt;
  }

  capacityOf(kind: ChamberKind): { cap: number; used: number; count: number; building: number } {
    let cap = 0;
    let used = 0;
    let count = 0;
    let building = 0;
    for (const c of this.chambers) {
      if (c.kind !== kind) continue;
      count++;
      if (!c.ready) {
        building++;
        continue;
      }
      if (kind === 'granary') {
        cap += c.capacity;
        used += c.seeds;
      } else {
        cap += c.floor.length;
      }
    }
    return { cap, used, count, building };
  }

  /** Pick the next project, if the colony needs one. Returns what was started. */
  grow(needs: NestNeeds, wanted: number): string | null {
    // Don't stack up more unfinished work than the colony can dig.
    const maxPending = 160 + needs.adults * 4;
    if (this.pendingCells > maxPending) return null;

    const order = needs.orders[0];
    if (order) {
      if (this.placeChamber(order)) {
        needs.orders.shift();
        return order;
      }
      // Couldn't fit it at the current depth: dig deeper first.
      return this.deepen() ? 'deeper' : null;
    }

    if (this.openCells + this.pendingCells >= wanted) return null;

    const nursery = this.capacityOf('nursery');
    const granary = this.capacityOf('granary');
    let kind: ChamberKind = 'rest';
    // A harvester colony's first big project is somewhere to keep the harvest.
    if (granary.count === 0 && needs.adults >= 5) kind = 'granary';
    else if (nursery.building === 0 && needs.brood > nursery.cap * 0.7 && needs.adults > 6) kind = 'nursery';
    else if (granary.building === 0 && needs.seeds > granary.cap * 0.6) kind = 'granary';
    else if (needs.adults > 120 && this.rng.chance(0.35)) return this.deepen() ? 'deeper' : null;

    if (this.placeChamber(kind)) return kind;
    return this.deepen() ? 'deeper' : null;
  }

  /** Extend the deepest shaft downward. */
  deepen(): boolean {
    const w = this.world;
    let best = -1;
    let by = -1;
    for (const i of this.planCells) {
      if (w.zone[i]) continue;
      const y = (i / w.w) | 0;
      if (y > by) {
        by = y;
        best = i;
      }
    }
    if (best < 0) return false;
    const bx = best % w.w;
    if (by > w.h - 40) return false;
    const len = this.rng.int(28, 44);
    let tx = bx + this.rng.int(-14, 14);
    if (this.marker) tx = Math.round(tx * 0.5 + this.marker.x * 0.5);
    tx = Math.max(24, Math.min(w.w - 24, tx));
    const ty = Math.min(w.h - 12, by + len);
    const path = this.astar(bx, by, tx, ty);
    if (!path) return false;
    for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, 2.6, null);
    return true;
  }

  private computePlanDist(): void {
    const w = this.world;
    const d = this.planDist;
    d.fill(255);
    const q: number[] = [];
    for (const i of this.planCells) {
      d[i] = 0;
      q.push(i);
    }
    let head = 0;
    while (head < q.length) {
      const i = q[head++]!;
      const nd = d[i]! + 1;
      if (nd > 12) continue;
      const x = i % w.w;
      for (const n of [x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1, i - w.w, i + w.w]) {
        if (n < 0 || n >= w.size || d[n]! <= nd) continue;
        d[n] = nd;
        q.push(n);
      }
    }
  }

  placeChamber(kind: ChamberKind): boolean {
    const w = this.world;
    const spec = SIZE[kind];
    const tunnels = this.planCells.filter((i) => !w.zone[i]);
    if (tunnels.length === 0) return false;
    this.computePlanDist();

    let maxDepth = 0;
    for (const i of tunnels) {
      const x = i % w.w;
      maxDepth = Math.max(maxDepth, ((i / w.w) | 0) - w.ground[x]!);
    }
    const pref = kind === 'queen' ? maxDepth + 14 : Math.min(spec.depth, maxDepth + 10);

    type Cand = { cx: number; cy: number; cw: number; ch: number; ax: number; ay: number; side: number; score: number };
    const cands: Cand[] = [];
    for (let t = 0; t < 70; t++) {
      const a = tunnels[this.rng.int(0, tunnels.length - 1)]!;
      const ax = a % w.w;
      const ay = (a / w.w) | 0;
      const side = this.rng.chance(0.5) ? -1 : 1;
      const cw = this.rng.int(spec.w[0], spec.w[1]);
      const ch = this.rng.int(spec.h[0], spec.h[1]);
      const gap = this.rng.int(3, 14);
      const cx = Math.round(ax + side * (cw / 2 + gap));
      const cy = Math.round(ay + this.rng.int(-4, 9));
      const ok = this.footprintOk(cx, cy, cw, ch);
      if (ok < 0) continue;
      const depth = cy - w.ground[Math.max(0, Math.min(w.w - 1, cx))]!;
      if (depth < spec.band[0] || depth > spec.band[1]) continue;
      let score = -Math.abs(depth - pref) * (kind === 'queen' ? 1.5 : 0.6) - gap * 0.6 - ok * 60 + this.rng.range(0, 8);
      // Keep the nest compact around its founding shaft unless told otherwise.
      score -= Math.abs(cx - this.foundX) * 0.06;
      if (this.marker) score -= Math.hypot(cx - this.marker.x, cy - this.marker.y) * 0.35;
      cands.push({ cx, cy, cw, ch, ax, ay, side, score });
    }
    cands.sort((a, b) => b.score - a.score);
    // Take the best spot that can actually be connected to the nest.
    for (const b of cands.slice(0, 6)) {
      const floorY = Math.round(b.cy + b.ch * 0.32);
      const ex = Math.round(b.cx - b.side * (b.cw / 2 - 2));
      const path = this.astar(ex, floorY - 3, b.ax, b.ay);
      if (!path) continue;
      this.addChamber(kind, b.cx, b.cy, b.cw, b.ch);
      for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, 2.4, null);
      return true;
    }
    this.lastPlanFailed++;
    return false;
  }

  /** -1 if the chamber can't go here, else the fraction of its footprint that is rock. */
  private footprintOk(cx: number, cy: number, cw: number, ch: number): number {
    const w = this.world;
    const x0 = Math.floor(cx - cw / 2);
    const x1 = Math.ceil(cx + cw / 2);
    const y0 = Math.floor(cy - ch / 2);
    const y1 = Math.ceil(cy + ch / 2);
    if (x0 < 14 || x1 > w.w - 14 || y1 > w.h - 8) return -1;
    let rock = 0;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        if (w.bg[i] !== 1 || y < w.ground[x]! + 8) return -1;
        if (this.planDist[i]! < 4) return -1;
        const m = w.mat[i]!;
        if (m === STONE || m === BEDROCK || m === ROOT) rock++;
        n++;
      }
    }
    const f = rock / n;
    return f > 0.14 ? -1 : f;
  }

  // ------------------------------------------------------------ pathing

  private cost(i: number, avoidRooms = false): number {
    const w = this.world;
    const m = w.mat[i]!;
    if (m === STONE || m === BEDROCK) return Infinity;
    if (w.bg[i] !== 1) return Infinity;
    // Route around rooms full of stores rather than through them.
    if (avoidRooms && w.zone[i] && m !== EMPTY) return Infinity;
    if (w.plan[i]) return 0.3;
    const x = i % w.w;
    const y = (i / w.w) | 0;
    // Wander a little: soil is never uniform, so neither are tunnels.
    const n = 0.7 + this.noise.n2(x / 7, y / 7) * 0.6;
    if (m === ROOT) return 6 + n;
    if (m === CLAY) return 1.3 * n + 0.2;
    if (m === GRAVEL) return 2.5 + n;
    return n + 0.15;
  }

  /** A* between two cells through diggable soil, preferring existing tunnels. */
  astar(sx: number, sy: number, tx: number, ty: number, avoidRooms = false): number[] | null {
    const w = this.world;
    const margin = 30;
    const bx0 = Math.max(2, Math.min(sx, tx) - margin);
    const bx1 = Math.min(w.w - 3, Math.max(sx, tx) + margin);
    const by0 = Math.max(2, Math.min(sy, ty) - margin);
    const by1 = Math.min(w.h - 5, Math.max(sy, ty) + margin);
    this.gen++;
    const gen = this.gen;
    const start = sy * w.w + sx;
    const goal = ty * w.w + tx;
    const g = this.g;
    const seen = this.seen;
    const from = this.from;
    const heap = this.heap;
    const heapF = this.heapF;
    heap.length = 0;
    heapF.length = 0;
    const h = (i: number): number => {
      const x = i % w.w;
      const y = (i / w.w) | 0;
      const dx = Math.abs(x - tx);
      const dy = Math.abs(y - ty);
      return (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)) * 0.55;
    };
    const push = (i: number, f: number): void => {
      heap.push(i);
      heapF.push(f);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p]! <= heapF[k]!) break;
        [heap[p], heap[k]] = [heap[k]!, heap[p]!];
        [heapF[p], heapF[k]] = [heapF[k]!, heapF[p]!];
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0]!;
      const li = heap.pop()!;
      const lf = heapF.pop()!;
      if (heap.length) {
        heap[0] = li;
        heapF[0] = lf;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heapF[l]! < heapF[m]!) m = l;
          if (r < heap.length && heapF[r]! < heapF[m]!) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k]!, heap[m]!];
          [heapF[m], heapF[k]] = [heapF[k]!, heapF[m]!];
          k = m;
        }
      }
      return top;
    };
    seen[start] = gen;
    g[start] = 0;
    from[start] = -1;
    push(start, h(start));
    const closed = new Set<number>();
    let found = false;
    while (heap.length) {
      const i = pop();
      if (i === goal) {
        found = true;
        break;
      }
      if (closed.has(i)) continue;
      closed.add(i);
      const x = i % w.w;
      const y = (i / w.w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
          const n = ny * w.w + nx;
          const c = this.cost(n, avoidRooms);
          if (c === Infinity) continue;
          // No cutting corners past rock: ants can't squeeze through a diagonal gap.
          if (dx && dy && (this.cost(y * w.w + nx, avoidRooms) === Infinity || this.cost(ny * w.w + x, avoidRooms) === Infinity)) continue;
          const ng = g[i]! + c * (dx && dy ? 1.41 : 1);
          if (seen[n] === gen && g[n]! <= ng) continue;
          seen[n] = gen;
          g[n] = ng;
          from[n] = i;
          push(n, ng + h(n));
        }
      }
    }
    if (!found) return null;
    const path: number[] = [];
    for (let i = goal; i !== -1; i = from[i]!) path.push(i);
    return path.reverse();
  }
}
