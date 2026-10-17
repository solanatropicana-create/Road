/** Size of a fog cell, mm. */
export const FOG = 8;

/**
 * What a sense of radius r reaches from a point (ox, oy) mm inside its fog
 * cell: the fog cells around (dx, dy, how well known 0..255, sensed now 0/1),
 * and the columns of air above (dx, how well known). Full knowledge near the
 * ant, softening toward the edge of its senses.
 */
interface Stamp {
  cells: Int16Array;
  sky: Int16Array;
}
const STAMPS = new Map<number, Stamp>();
function stamp(r: number, ox: number, oy: number): Stamp {
  const key = Math.round(r * 16) * 4096 + ox * 64 + oy;
  let s = STAMPS.get(key);
  if (s) return s;
  const cells: number[] = [];
  const sky: number[] = [];
  const reach = Math.ceil(r / FOG) + 1;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const ddx = dx * FOG + FOG / 2 - ox;
      const ddy = dy * FOG + FOG / 2 - oy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) / r;
      if (d >= 1) continue;
      cells.push(dx, dy, Math.min(255, Math.round(255 * (1 - d) * 2.2)), d < 0.85 ? 1 : 0);
    }
  }
  for (let dx = -reach; dx <= reach; dx++) {
    const d = Math.abs(dx * FOG + FOG / 2 - ox) / r;
    if (d < 1) sky.push(dx, Math.min(255, Math.round(255 * (1 - d) * 2.2)));
  }
  s = { cells: Int16Array.from(cells), sky: Int16Array.from(sky) };
  STAMPS.set(key, s);
  return s;
}

/**
 * What the colony knows of its world. It starts as a hand's breadth around
 * the queen and grows only where ants go: out on the meadow a forager takes
 * in a few centimetres around her; underground, the diggers know the soil
 * right around their tunnels. The open air above any stretch of explored
 * ground counts as known. Everything else stays in the dark.
 */
export class Fog {
  readonly gw: number;
  readonly gh: number;
  /** How well each fog cell is known, 0..255. */
  readonly seen: Uint8Array;
  /** Columns whose ground has been explored: the air above them is known. */
  readonly sky: Uint8Array;
  /**
   * What some ant of ours can sense right now (rebuilt every few ticks). The
   * ground, once learned, stays known; strangers walking on it are seen only
   * while one of ours is there to see them.
   */
  readonly vis: Uint8Array;
  /** Bumped on every change, so the renderer rebuilds its fog image only then. */
  version = 0;
  /** Bounding box of what is known, in mm (x0..x1, down to y1). */
  readonly box = { x0: 0, x1: 0, y1: 0 };

  constructor(w: number, h: number) {
    this.gw = Math.ceil(w / FOG);
    this.gh = Math.ceil(h / FOG);
    this.seen = new Uint8Array(this.gw * this.gh);
    this.sky = new Uint8Array(this.gw);
    this.vis = new Uint8Array(this.gw * this.gh);
  }

  /** Start a new round of looking (everything goes out of sight until the ants report again). */
  look(): void {
    this.vis.fill(0);
  }

  /** Can one of ours sense this point right now? */
  sees(x: number, y: number): boolean {
    const gx = Math.min(this.gw - 1, Math.max(0, Math.floor(x / FOG)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.floor(y / FOG)));
    return this.vis[gy * this.gw + gx] === 1;
  }

  /** Learn the ground within r mm of (x, y); surface reveals also light the air above. */
  reveal(x: number, y: number, r: number, surface: boolean): void {
    // (Every ant does this every few ticks: the cells a sense reaches come from a
    // stamp worked out once per radius and per position inside a fog cell.)
    const xi = Math.round(x);
    const yi = Math.round(y);
    const cx = Math.floor(xi / FOG);
    const cy = Math.floor(yi / FOG);
    const st = stamp(r, xi - cx * FOG, yi - cy * FOG);
    const gw = this.gw;
    const gh = this.gh;
    let changed = false;
    for (let k = 0; k < st.cells.length; k += 4) {
      const gx = cx + st.cells[k]!;
      const gy = cy + st.cells[k + 1]!;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
      const i = gy * gw + gx;
      if (st.cells[k + 3]) this.vis[i] = 1;
      const v = st.cells[k + 2]!;
      if (v > this.seen[i]!) {
        this.seen[i] = v;
        changed = true;
      }
    }
    if (surface) {
      for (let k = 0; k < st.sky.length; k += 2) {
        const gx = cx + st.sky[k]!;
        if (gx < 0 || gx >= gw) continue;
        const v = st.sky[k + 1]!;
        if (v > this.sky[gx]!) {
          this.sky[gx] = v;
          changed = true;
        }
      }
    }
    if (changed) {
      this.version++;
      const b = this.box;
      if (b.x1 <= b.x0) {
        b.x0 = x - r;
        b.x1 = x + r;
        b.y1 = y + r;
      } else {
        b.x0 = Math.min(b.x0, x - r);
        b.x1 = Math.max(b.x1, x + r);
        b.y1 = Math.max(b.y1, y + r);
      }
    }
  }

  /** How well a world point is known, 0..1 (air above explored ground counts). */
  at(x: number, y: number, ground: number): number {
    const gx = Math.min(this.gw - 1, Math.max(0, Math.floor(x / FOG)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.floor(y / FOG)));
    const s = this.seen[gy * this.gw + gx]!;
    return (y < ground - 2 ? Math.max(s, this.sky[gx]!) : s) / 255;
  }

  /** Forget nothing, but know everything (e.g. the whole-slice debug view). */
  revealAll(): void {
    this.seen.fill(255);
    this.sky.fill(255);
    this.vis.fill(1);
    this.version++;
  }
}
