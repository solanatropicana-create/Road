/** Size of a fog cell, mm. */
export const FOG = 8;

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
    const gx0 = Math.max(0, Math.floor((x - r) / FOG));
    const gx1 = Math.min(this.gw - 1, Math.floor((x + r) / FOG));
    const gy0 = Math.max(0, Math.floor((y - r) / FOG));
    const gy1 = Math.min(this.gh - 1, Math.floor((y + r) / FOG));
    let changed = false;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * FOG + FOG / 2 - x;
        const dy = gy * FOG + FOG / 2 - y;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d >= 1) continue;
        if (d < 0.85) this.vis[gy * this.gw + gx] = 1;
        // Full knowledge near the ant, softening toward the edge of its senses.
        const v = Math.min(255, Math.round(255 * (1 - d) * 2.2));
        const k = gy * this.gw + gx;
        if (v > this.seen[k]!) {
          this.seen[k] = v;
          changed = true;
        }
      }
    }
    if (surface) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const d = Math.abs(gx * FOG + FOG / 2 - x) / r;
        const v = Math.min(255, Math.round(255 * (1 - d) * 2.2));
        if (d < 1 && v > this.sky[gx]!) {
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
