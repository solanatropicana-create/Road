import { World } from '../world/world';
import { PACKED, PLUG } from '../world/physics';
import { Rng } from '../util/rng';
import { Noise } from '../util/noise';
import { EMPTY, ROOT, CLAY, GRAVEL, SEED, REFUSE, FRUIT, PREY, HARDNESS, SOLID, LITTER, SAND, SOIL, HUMUS, HARD, LIME } from '../world/mat';
import type { ChamberKind } from './types';
import { moleCell } from './predators';

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
  /** Cells it was planned with (later lobes don't count toward being finished). */
  base: number;
  /** Lobes dug onto it since, as the room filled up. */
  lobes: number;
}

export interface NestNeeds {
  adults: number;
  brood: number;
  seeds: number;
  /** The player's queued build orders (mode B), first is next. */
  orders: ChamberKind[];
  /** Which side of the mouth most of the harvest comes from (-1 left, +1 right). */
  harvestSide?: number;
}

/** Workers a colony needs before it opens a second gate (each colony its own, in this range). */
export const SECOND_GATE_WORKERS: [number, number] = [55, 110];

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
  /** Workers this colony waits for before opening a second gate. */
  gateAt = 90;
  /** Exploratory galleries dug so far (blind side tunnels, a few per hundred workers). */
  explored = 0;

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

  /** A second gate being dug up from the nest (its mouth column), or -1, and its shaft. */
  gateX = -1;
  private gateShaft: number[] = [];
  /** The nest cell the second gate's shaft starts from (the inside end). */
  private gateFrom = -1;

  /** The column of the mouth nearest x (spoil and the dying go out from whichever gate they used). */
  gateNear(x: number): number {
    const W = this.world.w;
    let best = this.foundX;
    let bd = Infinity;
    for (const e of this.entrances) {
      const d = Math.abs((e % W) - x);
      if (d < bd) {
        bd = d;
        best = e % W;
      }
    }
    return best;
  }

  /**
   * A big colony opens a second gate: real Messor nests of a few hundred
   * workers have several. It goes in toward the side most of the harvest
   * comes from, a shaft dug up from the nearest tunnel to a new mouth a
   * hand's width away, and counts as an entrance once it is dug through.
   */
  planGate(side: number): boolean {
    if (this.gateX >= 0 || this.entrances.length >= 2) return false;
    const w = this.world;
    for (let t = 0; t < 16; t++) {
      const dir = t < 10 ? side : -side;
      const x = Math.max(40, Math.min(w.w - 41, this.foundX + dir * this.rng.int(70, 130)));
      const g = w.ground[x]!;
      // A mouth needs soft ground: no rock or woody root right under it.
      let soft = true;
      for (let y = g; y <= g + 8 && soft; y++) for (let xx = x - 2; xx <= x + 2; xx++) if (HARD[w.mat[y * w.w + xx]!]) soft = false;
      if (!soft) continue;
      // Up from the open nest cell nearest a point a few centimetres under the new mouth.
      let best = -1;
      let bd = Infinity;
      for (const i of this.planCells) {
        if (w.mat[i] !== EMPTY || w.bg[i] !== 1 || w.zone[i]) continue;
        const ix = i % w.w;
        const iy = (i / w.w) | 0;
        if (iy < w.ground[ix]! + 12) continue;
        const d = Math.abs(ix - x) + Math.abs(iy - (g + 22)) * 0.6;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best < 0 || bd > 160) continue;
      const path = this.astar(x, g, best % w.w, (best / w.w) | 0);
      if (!path) continue;
      const shaft: number[] = [];
      for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, 1.8, shaft);
      this.stampDisc(x, g - 1, 1.6, shaft, 3);
      this.clearMouth(x, shaft);
      this.gateX = x;
      this.gateShaft = shaft;
      this.gateFrom = best;
      this.chimney(x);
      return true;
    }
    return false;
  }

  /**
   * Spoil, chaff or litter already lying over a new mouth: claim it for the
   * plan, so the diggers clear it like any other soil in the way.
   */
  private clearMouth(x: number, out: number[]): void {
    const w = this.world;
    const g = w.ground[x]!;
    for (let y = g - 1; y >= Math.max(2, g - 24); y--) {
      for (let xx = x - 2; xx <= x + 2; xx++) {
        const i = y * w.w + xx;
        const m = w.mat[i]!;
        if (w.plan[i] || w.bg[i] === 1 || (m !== SAND && m !== REFUSE && m !== LITTER)) continue;
        w.plan[i] = 1;
        this.planCells.push(i);
        out.push(i);
      }
    }
  }

  /**
   * Is there open air all the way from the inside end of a shaft up through
   * its mouth? A walk through empty cells in a box round the mouth, ending
   * above the highest a spoil heap can stand.
   */
  private mouthOpen(x: number, from: number): boolean {
    const w = this.world;
    const g = w.ground[x]!;
    const fx = from % w.w;
    const fy = (from / w.w) | 0;
    const x0 = Math.max(1, Math.min(x, fx) - 30);
    const x1 = Math.min(w.w - 2, Math.max(x, fx) + 30);
    const y0 = Math.max(1, g - 26);
    const y1 = Math.min(w.h - 2, Math.max(fy, g) + 3);
    const seen = new Set<number>([from]);
    const queue = [from];
    while (queue.length) {
      const i = queue.pop()!;
      const iy = (i / w.w) | 0;
      if (iy <= g - 18 && w.bg[i] === 0) return true;
      for (const n of [i - 1, i + 1, i - w.w, i + w.w]) {
        const nx = n % w.w;
        const ny = (n / w.w) | 0;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || seen.has(n) || SOLID[w.mat[n]!]) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return false;
  }

  /**
   * The second gate is dug through: it becomes an entrance. True once, when
   * it opens. A mouth still capped by spoil does not count (ants outside would
   * crowd onto the cap with no way in); the cap is claimed for digging instead.
   */
  gateOpened(): boolean {
    if (this.gateX < 0) return false;
    const w = this.world;
    let left = 0;
    for (const i of this.gateShaft) if (SOLID[w.mat[i]!]) left++;
    if (left > Math.max(2, this.gateShaft.length * 0.04)) return false;
    let from = this.gateFrom;
    if (from < 0) for (const i of this.gateShaft) if (from < 0 || i > from) from = i;
    if (from >= 0 && !this.mouthOpen(this.gateX, from)) {
      this.clearMouth(this.gateX, this.gateShaft);
      return false;
    }
    this.entrances.push(w.idx(this.gateX, w.ground[this.gateX]!));
    this.gateX = -1;
    this.gateShaft = [];
    this.gateFrom = -1;
    return true;
  }

  /** The queen's claustral burrow: a narrow shaft and a small sealed chamber. */
  found(x: number): { shaft: number[]; chamber: Chamber } {
    const w = this.world;
    this.founded = true;
    this.foundX = x;
    this.gateAt = this.rng.int(SECOND_GATE_WORKERS[0], SECOND_GATE_WORKERS[1]);
    const g = w.ground[x]!;
    // Claustral chamber a few centimetres down: below the worst of the day's heat and the rain.
    const depth = 48;
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

  /**
   * Shut the nest: pack the top of each entrance shaft with soil (a few mm
   * thick) so rain runs off and the cold stays out. The plug is dug out
   * again when the nest opens.
   */
  seal(): void {
    const w = this.world;
    w.sealed = true;
    w.sealBoxes = this.entrances.map((e) => {
      const cx = e % w.w;
      return [cx - 9, cx + 9, w.ground[cx]! - 30, w.ground[cx]! + 12] as [number, number, number, number];
    });
    w.sealBox = w.sealBoxes[0]!;
    for (const e of this.entrances) {
      const ex = e % w.w;
      const g = w.ground[ex]!;
      // (The whole width of the mouth: a widened shaft runs wider than the first burrow.)
      for (let y = g; y <= g + 3; y++) {
        for (let x = ex - 6; x <= ex + 6; x++) {
          const i = y * w.w + x;
          if (!w.plan[i] || w.bg[i] !== 1 || w.mat[i] !== EMPTY) continue;
          const src = w.mat[i + 2] && SOIL[w.mat[i + 2]!] ? w.mat[i + 2]! : HUMUS;
          w.set(i, SAND, this.rng.int(60, 200), src | PACKED | PLUG);
        }
      }
    }
  }

  /** The open nest cell nearest (x, y) just inside a plugged gate (for a straggler let in), or -1. */
  behindPlug(x: number, y: number): number {
    const w = this.world;
    let best = -1;
    let bd = Infinity;
    for (let dy = 0; dy <= 12; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || xx >= w.w - 1 || yy >= w.h - 1) continue;
        const i = yy * w.w + xx;
        if (w.bg[i] !== 1 || w.mat[i] !== EMPTY || !w.walk[i]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  }

  /** Open up: the plug becomes ordinary loose soil in the plan, for the diggers. */
  unseal(): void {
    this.world.sealed = false;
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
    if (HARD[m]) return false;
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
    const id = this.chambers.length;
    const floorY = Math.round(cy + chh * 0.32);
    const c: Chamber = { id, kind, cx, cy, w: cw, h: chh, floorY, cells: [], dug: 0, ready: false, floor: [], seeds: 0, capacity: 0, base: 0, lobes: 0 };
    this.stampRoom(c, cx, cy, cw, chh);
    c.base = c.cells.length;
    this.chambers.push(c);
    this.zonesChanged = true;
    return c;
  }

  /**
   * Mark a room's cells: a flat floor at c.floorY under a lumpy, lopsided
   * dome. Real chambers are pancakes, but no two alike: workers dig on where
   * the soil gives, so the outline bulges, one end is taller than the other
   * and the ceiling is uneven.
   */
  private stampRoom(c: Chamber, cx: number, cy: number, cw: number, chh: number): void {
    const w = this.world;
    const seed = this.rng.range(0, 1000);
    const lobes = this.rng.range(0.14, 0.32);
    // One end higher than the other.
    const skew = this.rng.range(-0.35, 0.35);
    for (let y = Math.floor(cy - chh * 0.75) - 1; y <= c.floorY; y++) {
      for (let x = Math.floor(cx - cw / 2) - 4; x <= Math.ceil(cx + cw / 2) + 4; x++) {
        if (!w.inside(x, y)) continue;
        const nx = (x - cx) / (cw / 2);
        const hh = (chh / 2) * Math.max(0.55, 1 + skew * nx);
        const ny = (y - cy) / hh;
        const ang = Math.atan2(ny, nx);
        // Lobed outline, two scales of bulge.
        const r = 1 + this.noise.n2(Math.cos(ang) * 1.5 + seed, Math.sin(ang) * 1.5) * lobes + this.noise.n2(Math.cos(ang) * 3.4 + seed * 2, Math.sin(ang) * 3.4) * lobes * 0.45;
        if (nx * nx + ny * ny > r * r) continue;
        const i = y * w.w + x;
        const m = w.mat[i]!;
        if (HARD[m] || w.bg[i] !== 1) continue;
        // Never into another room.
        if (w.zone[i] && w.zone[i] !== c.id + 1) continue;
        if (w.zone[i] === c.id + 1) continue;
        if (!w.plan[i]) {
          w.plan[i] = 1;
          this.planCells.push(i);
        }
        w.zone[i] = c.id + 1;
        c.cells.push(i);
        if (y >= c.floorY - Math.round(chh * 0.45)) c.capacity++;
      }
    }
  }

  /**
   * A room that has filled up is dug wider: a lobe on one end, on the same
   * floor (crowded nurseries and full granaries grow this way in real nests,
   * rather than always budding a new room off the shaft).
   */
  extendChamber(c: Chamber): boolean {
    const w = this.world;
    for (let t = 0; t < 6; t++) {
      const side = this.rng.chance(0.5) ? -1 : 1;
      const lw = Math.round(c.w * this.rng.range(0.4, 0.75));
      const lh = Math.max(6, Math.round(c.h * this.rng.range(0.75, 1.05)));
      const lx = Math.round(c.cx + side * (c.w / 2 + lw / 2 - this.rng.int(3, 7)));
      const ly = c.floorY - Math.round(lh * 0.32);
      // Room for it: soil (not rock), underground, clear of every other room and tunnel.
      const x0 = Math.floor(lx - lw / 2);
      const x1 = Math.ceil(lx + lw / 2);
      if (x0 < 14 || x1 > w.w - 14) continue;
      let ok = true;
      let rock = 0;
      let n = 0;
      for (let y = ly - lh; y <= c.floorY + 2 && ok; y++) {
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          const i = y * w.w + x;
          if (w.bg[i] !== 1 || y < w.ground[x]! + 8) {
            ok = false;
            break;
          }
          const z = w.zone[i]!;
          if (z && z !== c.id + 1) {
            ok = false;
            break;
          }
          if (HARD[w.mat[i]!] || w.mat[i] === ROOT) rock++;
          n++;
        }
      }
      if (!ok || rock / Math.max(1, n) > 0.12) continue;
      const before = c.cells.length;
      this.stampRoom(c, lx, ly, lw, lh);
      if (c.cells.length - before < 20) continue;
      c.lobes++;
      this.zonesChanged = true;
      return true;
    }
    return false;
  }

  /**
   * A blind side gallery: workers dig short exploratory tunnels off the nest
   * that lead nowhere (and are sometimes built on later). Wiggly, a little
   * narrower than a main tunnel, never up toward the surface.
   */
  explore(): boolean {
    const w = this.world;
    const open = this.planCells.filter((i) => w.mat[i] === EMPTY && w.bg[i] === 1 && ((i / w.w) | 0) > w.ground[i % w.w]! + 18);
    if (!open.length) return false;
    for (let t = 0; t < 8; t++) {
      const s = open[this.rng.int(0, open.length - 1)]!;
      let x = s % w.w;
      let y = (s / w.w) | 0;
      // Out sideways and a little down, rarely up.
      let a = (this.rng.chance(0.5) ? 0 : Math.PI) + this.rng.range(-0.5, 0.9) * (this.rng.chance(0.5) ? 1 : -1);
      if (Math.sin(a) < -0.25) a = Math.PI - a;
      const len = this.rng.int(10, 30);
      const r = this.rng.range(1.4, 1.9);
      const cells: number[] = [];
      let stopped = false;
      for (let k = 0; k < len; k++) {
        a += this.rng.range(-0.35, 0.35);
        const nx = Math.round(x + Math.cos(a) * 1.2);
        const ny = Math.round(y + Math.sin(a) * 1.2);
        const i = ny * w.w + nx;
        if (nx < 16 || nx > w.w - 16 || ny > w.h - 12 || ny < w.ground[nx]! + 14 || HARD[w.mat[i]!] || w.bg[i] !== 1) {
          stopped = true;
          break;
        }
        // Not into a room, and not back into the plan once clear of the start.
        if (w.zone[i] || (k > 4 && this.planDistAt(nx, ny) < 3)) {
          stopped = true;
          break;
        }
        x = nx;
        y = ny;
        cells.push(i);
      }
      if (cells.length < 8) continue;
      for (const i of cells) this.stampDisc(i % w.w, (i / w.w) | 0, r, null);
      this.explored++;
      return !stopped || cells.length >= 8;
    }
    return false;
  }

  /** Distance (cells, up to 12) from (x, y) to the nearest planned cell, searched directly. */
  private planDistAt(x: number, y: number): number {
    const w = this.world;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (w.plan[(y + dy) * w.w + x + dx]) return r;
        }
      }
    }
    return 12;
  }

  /**
   * Workers nibble at the walls and ceilings as they pass: now and then a
   * cell of soil beside an open part of the nest is dug away, so tunnels and
   * rooms grow rough and a little roomier with use. Never the floor (brood
   * and stores lie there), never toward the surface or into another room.
   */
  roughen(count: number): void {
    const w = this.world;
    const n = this.planCells.length;
    if (!n) return;
    for (let t = 0; t < count * 6 && count > 0; t++) {
      const i = this.planCells[this.rng.int(0, n - 1)]!;
      if (w.mat[i] !== EMPTY || w.bg[i] !== 1) continue;
      const x = i % w.w;
      const y = (i / w.w) | 0;
      if (y < w.ground[x]! + 14) continue;
      const dirs = [-1, 1, -w.w, -w.w - 1, -w.w + 1];
      const d = dirs[this.rng.int(0, dirs.length - 1)]!;
      const j = i + d;
      const m = w.mat[j]!;
      if (w.plan[j] || w.bg[j] !== 1 || !SOIL[m] || HARD[m]) continue;
      const zi = w.zone[i]!;
      // Keep rooms apart: no nibbling toward a cell that touches another room or the surface.
      let clash = false;
      for (const e of [j - 1, j + 1, j - w.w, j + w.w, j - 2 * w.w]) {
        const z = w.zone[e]!;
        if ((z && z !== zi) || w.bg[e] !== 1) clash = true;
      }
      if (clash) continue;
      w.plan[j] = 1;
      this.planCells.push(j);
      if (zi) {
        const c = this.chambers[zi - 1];
        if (c) {
          w.zone[j] = zi;
          c.cells.push(j);
        }
      }
      count--;
    }
  }

  // ------------------------------------------------------------ scanning

  /**
   * Should a worker dig out this planned cell? Soil, and anything that has
   * spilled into a tunnel (seeds, husks). Stores inside chambers stay put.
   */
  static diggable(w: World, i: number): boolean {
    if (!w.plan[i]) return false;
    const m = w.mat[i]!;
    if (w.sealed && m === SAND && w.tint[i]! & PLUG) return false;
    if (m === SEED || m === FRUIT || m === PREY) return w.zone[i] === 0 && w.bg[i] === 1;
    // Chaff in a tunnel, or heaped over a mouth the plan keeps open.
    if (m === REFUSE) return w.zone[i] === 0;
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
        if (w.plan[i] || moleCell(i)) continue;
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
    // Rooms the colony needs come first: while a nursery, granary or the royal
    // chamber is being dug, nobody starts on a resting room.
    let urgent = false;
    for (const i of this.frontier) {
      const c = this.chamberAt(i);
      if (c && !c.ready && c.kind !== 'rest') {
        urgent = true;
        break;
      }
    }
    if (urgent) {
      let j = 0;
      for (let k = 0; k < this.frontier.length; k++) {
        const c = this.chamberAt(this.frontier[k]!);
        if (c && !c.ready && c.kind === 'rest') continue;
        this.frontier[j] = this.frontier[k]!;
        this.digSpots[j] = this.digSpots[k]!;
        j++;
      }
      this.frontier.length = j;
      this.digSpots.length = j;
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
      // Hysteresis: a finished chamber stays in use through small slumps
      // (and while a lobe or a nibbled wall is still being dug).
      const ready = c.ready ? dug >= c.base * 0.6 : dug >= c.base * 0.85;
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

  /** A player's order that could not be placed anywhere (read and cleared by the sim). */
  droppedOrder: ChamberKind | null = null;

  /**
   * Room size for the colony's age: a young colony's first chambers are small
   * (a few centimetres across in real casts), a big one's are wide.
   */
  private roomScale = 1;

  /** Pick the next project, if the colony needs one. Returns what was started. */
  grow(needs: NestNeeds, wanted: number): string | null {
    // Don't stack up more unfinished work than the colony can dig.
    const maxPending = 160 + needs.adults * 4;
    if (this.pendingCells > maxPending) return null;
    this.roomScale = needs.adults < 30 ? 0.6 : needs.adults < 100 ? 0.8 : 1;

    const order = needs.orders[0];
    if (order) {
      if (this.placeChamber(order)) {
        needs.orders.shift();
        return order;
      }
      // Couldn't fit it at the current depth: dig deeper first.
      if (this.deepen()) return 'deeper';
      // Can't go deeper either (the slice bottom): drop the order rather than block every plan behind it.
      needs.orders.shift();
      this.droppedOrder = order;
      return null;
    }

    // One gate is a bottleneck for a big colony: open a second.
    if (needs.adults >= this.gateAt && this.entrances.length < 2 && this.gateX < 0 && this.planGate(needs.harvestSide ?? 1)) return 'gate';

    // Workers nibble at the walls as they come and go (more workers, more nibbling).
    if (needs.adults >= 12) this.roughen(Math.min(3, 1 + Math.floor(needs.adults / 150)));

    const nursery = this.capacityOf('nursery');
    const granary = this.capacityOf('granary');
    let kind: ChamberKind | null = null;
    // The first workers dig a nursery for the queen's growing heap of brood
    // (until then seed is kept in the royal chamber), then a granary.
    if (nursery.count === 0 && needs.adults >= 4 && needs.brood >= 10) kind = 'nursery';
    else if (granary.count === 0 && needs.adults >= 5) kind = 'granary';
    else if (nursery.building === 0 && needs.brood > nursery.cap * 0.7 && needs.adults > 6) kind = 'nursery';
    else if (granary.building === 0 && needs.seeds > granary.cap * 0.6) kind = 'granary';
    // Rooms the colony is short of are built whatever the nest's size; only
    // living space (rest chambers, deeper shafts) follows the headcount.
    if (!kind) {
      if (this.openCells + this.pendingCells >= wanted) {
        // Nothing needed: now and then a blind exploratory gallery, while the diggers are idle.
        if (this.pendingCells < 40 && needs.adults >= 20 && this.explored < 1 + needs.adults / 50 && this.rng.chance(0.12)) return this.explore() ? 'explore' : null;
        return null;
      }
      if (needs.adults > 120 && this.rng.chance(0.35)) return this.deepen() ? 'deeper' : null;
      kind = 'rest';
    }

    // A room of this kind that has filled up is often dug wider instead of starting another.
    if (this.rng.chance(0.5)) {
      const full = this.chambers.filter((c) => c.kind === kind && c.ready && c.lobes < 2);
      if (full.length && this.extendChamber(full[this.rng.int(0, full.length - 1)]!)) return 'lobe';
    }
    if (this.placeChamber(kind)) return kind;
    return this.deepen() ? 'deeper' : null;
  }

  /** Cells planned by the last shaft extension (to tell whether it has been dug yet). */
  private lastShaft: number[] = [];

  /** Share of the last shaft extension still undug (0 = done). */
  shaftPending(): number {
    if (this.lastShaft.length === 0) return 0;
    let left = 0;
    for (const i of this.lastShaft) if (SOLID[this.world.mat[i]!]) left++;
    return left / this.lastShaft.length;
  }

  /**
   * Why the player can't place the growth marker here, or null if they can:
   * 'sky' above ground, 'edge' too near the sides or bottom of the slice, 'rock' in stone.
   */
  markerProblem(x: number, y: number): 'sky' | 'edge' | 'rock' | null {
    const w = this.world;
    if (!w.inside(x, y) || y <= w.ground[x]! + 10) return 'sky';
    if (x < 24 || x > w.w - 24 || y > w.h - 40) return 'edge';
    const m = w.mat[y * w.w + x]!;
    if (HARD[m]) return 'rock';
    return null;
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
    // Now and then a new shaft branches down from the far end of a room
    // instead, so a big nest is a branching tree, not one spine.
    let lean = 14;
    const rooms = this.chambers.filter((c) => c.ready && c.kind !== 'queen');
    if (!this.marker && rooms.length >= 3 && this.rng.chance(0.35)) {
      const c = rooms[this.rng.int(0, rooms.length - 1)]!;
      const side = this.rng.chance(0.5) ? -1 : 1;
      const ex = Math.round(c.cx + side * (c.w / 2 - 3));
      const e = (c.floorY - 1) * w.w + ex;
      if (w.zone[e] === c.id + 1 && ex > 30 && ex < w.w - 30) {
        best = e;
        by = c.floorY - 1;
        lean = 30;
      }
    }
    if (best < 0) return false;
    const bx = best % w.w;
    if (by > w.h - 40) return false;
    const len = this.rng.int(28, 44);
    let tx = bx + (lean > 14 ? Math.sign(bx - this.foundX || 1) * this.rng.int(8, lean) : this.rng.int(-lean, lean));
    if (this.marker) tx = Math.round(tx * 0.5 + this.marker.x * 0.5);
    tx = Math.max(24, Math.min(w.w - 24, tx));
    const ty = Math.min(w.h - 12, by + len);
    const path = this.astar(bx, by, tx, ty);
    if (!path) return false;
    const cells: number[] = [];
    for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, this.tunnelR(i, 2.5), cells);
    this.lastShaft = cells;
    return true;
  }

  /** A tunnel's radius here: wider and narrower along its length, as dug by many jaws. */
  private tunnelR(i: number, r: number): number {
    const w = this.world;
    return r + this.noise.n2((i % w.w) / 9 + 300, ((i / w.w) | 0) / 9) * 0.65;
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
    // (A room can also bud off the end of another room, as chains of chambers do in real casts.)
    for (const c of this.chambers) {
      if (!c.ready || c.kind === 'queen' || !this.rng.chance(0.5)) continue;
      for (const side of [-1, 1]) {
        const e = (c.floorY - 2) * w.w + Math.round(c.cx + side * (c.w / 2 - 2));
        if (w.zone[e] === c.id + 1) tunnels.push(e);
      }
    }
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
      const scale = kind === 'queen' ? 1 : this.roomScale;
      const cw = Math.round(this.rng.int(spec.w[0], spec.w[1]) * scale);
      const ch = Math.max(7, Math.round(this.rng.int(spec.h[0], spec.h[1]) * Math.sqrt(scale)));
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
      for (const i of path) this.stampDisc(i % w.w, (i / w.w) | 0, this.tunnelR(i, 2.3), null);
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
        if (HARD[m] || m === ROOT || m === LIME) rock++;
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
    if (HARD[m]) return Infinity;
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
