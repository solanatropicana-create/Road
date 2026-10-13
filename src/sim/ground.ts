import type { Sim } from './sim';
import type { Chamber } from './nest';
import { EMPTY, SAND, WATER, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, SANDY, LIME, ROOT, SOIL, HARD } from '../world/mat';
import { PACKED, PLUG } from '../world/physics';
import { TICK_HZ, DAY_TICKS } from '../config';
import { clamp } from '../util/math';

/**
 * How well each soil holds a roof over a gap when just damp (1: a room of
 * ordinary size holds). Steppe loams and chernozem hold Messor's rooms well;
 * clay and marl best; a root binds what is round it; sand only while damp.
 */
const COHESION: Record<number, number> = {
  [CLAY]: 1.3, [LIME]: 1.2, [LOAM]: 1.1, [SUBSOIL]: 1.05, [HUMUS]: 0.95, [GRAVEL]: 0.6, [SANDY]: 0.65, [ROOT]: 1.4, [SAND]: 0.25,
};

/** Seconds between checks of the nest's roofs. */
const CHECK = 5;
/** After a cave-in, how long the room's new roof settles before strain can build to another (ticks). */
const SETTLE = DAY_TICKS * 6;

/**
 * The soil as something that can fail. Every room has a roof of soil over a
 * gap, and whether it holds is mechanics: the span of the gap, how cohesive
 * the soil above it is (clay and loam hold, sand runs, a root binds it), how
 * wet it is (soaked loam and clay go soft; dry sand pours), and how much soil
 * there is above it (a thin roof under the surface sags). The workers shore
 * up a roof that has begun to crack, pressing soil into it.
 *
 * A roof under strain shows it first: hairline cracks, then grains trickling
 * down. Past a point it caves in: an arch of the roof comes down as loose
 * soil and fills part of the room, burying whoever and whatever was under it.
 * Buried ants struggle toward air, nestmates dig toward them (ants do rescue
 * buried nestmates), and anyone not out within a minute or so suffocates.
 *
 * And after long rain, soaked walls weep: water seeps into the tunnels and
 * pools in the low rooms.
 */
export class Ground {
  /** Per chamber id: strain building toward a cave-in (0..1), and shoring pressed into its roof (0..1). */
  strain: number[] = [];
  shore: number[] = [];
  /** Per chamber id: the tick of the last crack warning (so it is noted once a bout), and of the last cave-in. */
  warned: number[] = [];
  fell: number[] = [];
  /** Where ants or brood lie buried alive right now (refreshed as they struggle), for the rescuers. */
  buried: { x: number; y: number; id: number; t: number }[] = [];
  caveIns = 0;
  rescued = 0;
  seeps = 0;
  /** Rooms whose roofs want shoring just now. */
  strained = 0;
  /** When someone buried was last noted getting out (one line per bout). */
  lastNote = -1e9;

  /** How cohesive the soil is at i, for its wetness. */
  private hold(sim: Sim, i: number): number {
    const w = sim.world;
    const m = w.mat[i]!;
    if (HARD[m]) return 1.8;
    if (m === EMPTY || m === WATER) return 0;
    const base = COHESION[m] ?? (SOIL[m] ? 0.9 : 0.3);
    const wet = w.moist[i]!;
    // Sand holds damp and runs dry or soaked; loams soften as they soak, clay last.
    let f: number;
    // (Rain seldom brings the soil round the rooms past 100 or so; the water table soaks it through.)
    if (m === SANDY || m === SAND) f = wet < 12 ? 0.85 : wet < 100 ? 1.15 : wet < 150 ? 0.85 : 0.5;
    else if (m === CLAY || m === LIME) f = wet < 60 ? 1 : wet < 160 ? 1 - ((wet - 60) / 100) * 0.55 : 0.45;
    else f = wet < 40 ? 1 : wet < 130 ? 1 - ((wet - 40) / 90) * 0.55 : 0.45;
    // Soil the workers have packed (a shored roof, the spoil of the walls) holds better.
    if (m === SAND && w.tint[i]! & PACKED) f *= 2.2;
    return base * f;
  }

  /**
   * A room's roof: the span of the gap (mm), and for each of its columns the
   * topmost open cell under the true roof (up through any hollow a fall has
   * left over the room; a column open to the sky has no roof).
   */
  roof(sim: Sim, c: Chamber): { span: number; x0: number; x1: number; top: Map<number, number> } | null {
    const w = sim.world;
    const top = new Map<number, number>();
    for (const i of c.cells) {
      if (w.mat[i] !== EMPTY) continue;
      const x = i % w.w;
      const y = (i / w.w) | 0;
      const t = top.get(x);
      if (t === undefined || y < t) top.set(x, y);
    }
    for (const [x, t] of top) {
      let y = t;
      for (let k = 0; k < 24 && y > 1 && w.mat[(y - 1) * w.w + x] === EMPTY; k++) y--;
      if (w.bg[(y - 1) * w.w + x] !== 1 || w.mat[(y - 1) * w.w + x] === EMPTY) top.delete(x);
      else top.set(x, y);
    }
    if (top.size < 4) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const x of top.keys()) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    return { span: x1 - x0 + 1, x0, x1, top };
  }

  /**
   * How well a room's roof holds now (above 1: sound; below: strain builds),
   * and what makes it so: the soil over the middle of the span and its
   * wetness, the depth of soil over it, the span, the arch a fall leaves (a
   * domed roof holds: the ground arches over a cave-in), and the shoring.
   */
  parts(sim: Sim, c: Chamber): { hold: number; wet: number; deep: number; span: number; arch: number; shore: number; s: number } | null {
    const r = this.roof(sim, c);
    if (!r) return null;
    const w = sim.world;
    let hold = 0;
    let wet = 0;
    let n = 0;
    let depth = 0;
    let cols = 0;
    let mid = 0;
    let edge = 0;
    let nm = 0;
    let ne = 0;
    const a = r.x0 + Math.floor(r.span * 0.25);
    const b = r.x1 - Math.floor(r.span * 0.25);
    for (const [x, t] of r.top) {
      if (x >= a && x <= b) {
        mid += t;
        nm++;
        if ((x - a) % 2 === 0) {
          for (let k = 1; k <= 4; k++) {
            hold += this.hold(sim, (t - k) * w.w + x);
            wet += w.moist[(t - k) * w.w + x]!;
            n++;
          }
          depth += t - w.ground[x]!;
          cols++;
        }
      } else {
        edge += t;
        ne++;
      }
    }
    if (!n || !cols) return null;
    hold /= n;
    depth /= cols;
    // A thin roof sags; deep in the soil it arches and holds.
    const deep = clamp(depth / 45, 0.4, 1.15);
    const span = Math.pow(44 / Math.max(8, r.span), 1.1);
    // How much higher the middle of the roof is than its ends.
    const rise = nm && ne ? edge / ne - mid / nm : 0;
    const arch = 1 + clamp((rise / r.span) * 3, 0, 0.5);
    const shore = 1 + 0.6 * (this.shore[c.id] ?? 0);
    return { hold, wet: wet / n, deep, span, arch, shore, s: hold * deep * span * arch * shore };
  }

  /** How well a room's roof holds now (above 1: sound; below: building strain). */
  stability(sim: Sim, c: Chamber): number {
    return this.parts(sim, c)?.s ?? 9;
  }

  step(sim: Sim): void {
    const nest = sim.nest;
    if (!nest.founded) return;
    // The buried are re-registered every tick they stay buried.
    this.buried = this.buried.filter((b) => sim.tick - b.t < TICK_HZ);
    if (sim.tick % (TICK_HZ * 2) === 3) this.seep(sim);
    if (sim.tick % (TICK_HZ * CHECK) !== 11) return;
    const rng = sim.rng;
    this.strained = 0;
    for (const c of nest.chambers) {
      if (!c.ready) continue;
      const s = this.stability(sim, c);
      const risk = clamp(1 - s, 0, 1);
      let strain = this.strain[c.id] ?? 0;
      strain = risk > 0 ? strain + risk * 0.022 : Math.max(0, strain - 0.01);
      // A fresh fall settles into an arch for a while before the next can come (no chimney of falls).
      if (sim.tick - (this.fell[c.id] ?? -1e9) < SETTLE) strain = Math.min(strain, 0.5);
      this.strain[c.id] = strain;
      // Shoring slowly weathers away.
      if (this.shore[c.id]) this.shore[c.id] = Math.max(0, this.shore[c.id]! - 0.0015);
      if (strain > 0.35) {
        if (sim.tick - (this.warned[c.id] ?? -1e9) > TICK_HZ * 600) {
          this.warned[c.id] = sim.tick;
          sim.events.push({ key: 'roofCracks', kind: c.kind, x: c.cx, y: c.floorY - c.h });
        }
        // Grains trickle from the cracks.
        if (rng.chance(strain * 0.7)) this.trickle(sim, c);
      }
      // Past a point it may go any moment, shored or not.
      if (strain >= 1 || (strain > 0.6 && rng.chance((strain - 0.6) * 0.12))) this.caveIn(sim, c);
      if ((this.strain[c.id] ?? 0) >= 0.15) this.strained++;
    }
  }

  /** A grain or two drops from a cracked roof (a warning, and the roof creeps up). */
  private trickle(sim: Sim, c: Chamber): void {
    const r = this.roof(sim, c);
    if (!r) return;
    const w = sim.world;
    const x = Math.round(r.x0 + r.span * sim.rng.range(0.3, 0.7));
    const t = r.top.get(x);
    if (t === undefined) return;
    const i = (t - 1) * w.w + x;
    const m = w.mat[i]!;
    if (!SOIL[m] && m !== SAND) return;
    w.set(i, SAND, w.tone[i], m === SAND ? w.tint[i]! & 0x3f : m);
    w.wake(i);
    if (!w.plan[i]) w.claimed.push(i);
    sim.dust(i, m === SAND ? w.tint[i]! & 0x3f : m);
  }

  /**
   * The roof gives way: an arch of it comes down as loose soil into the room.
   * Whatever is under it is buried; the hollow it leaves is adopted into the
   * nest once the workers have cleared the fall.
   */
  caveIn(sim: Sim, c: Chamber): void {
    const r = this.roof(sim, c);
    if (!r) return;
    const w = sim.world;
    const rng = sim.rng;
    const cx = r.x0 + r.span * rng.range(0.3, 0.7);
    const half = Math.max(4, r.span * rng.range(0.25, 0.42));
    const wetter = clamp((w.moist[((r.top.get(Math.round(cx)) ?? c.floorY) - 2) * w.w + Math.round(cx)]! - 150) / 100, 0, 1);
    const high = rng.range(3, 6) + wetter * 4;
    let fell = 0;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const t = r.top.get(x);
      if (t === undefined) continue;
      const u = (x - cx) / half;
      const hh = Math.round(high * (1 - u * u));
      for (let k = 1; k <= hh; k++) {
        const y = t - k;
        if (y <= w.ground[x]! + 1) break;
        const i = y * w.w + x;
        const m = w.mat[i]!;
        if (HARD[m] || m === EMPTY || m === WATER || (m === SAND && w.tint[i]! & PLUG)) continue;
        w.set(i, SAND, w.tone[i], m === SAND ? w.tint[i]! & 0x3f : m);
        w.wake(i);
        if (!w.plan[i]) w.claimed.push(i);
        fell++;
        if (rng.chance(0.12)) sim.dust(i, m === SAND ? HUMUS : m);
      }
    }
    // (Nothing left to fall: the roof has come down to rock, or to the surface.)
    this.strain[c.id] = fell < 6 ? 0.5 : 0;
    if (fell < 6) return;
    this.fell[c.id] = sim.tick;
    this.shore[c.id] = (this.shore[c.id] ?? 0) * 0.5;
    this.caveIns++;
    sim.events.push({ key: 'caveIn', kind: c.kind, x: Math.round(cx), y: c.floorY - 2 });
  }

  /** Soaked walls weep: water seeps out into the tunnels and runs down to pool in the low rooms. */
  private seep(sim: Sim): void {
    const w = sim.world;
    const cells = sim.nest.planCells;
    if (!cells.length) return;
    const rng = sim.rng;
    for (let k = 0; k < 24; k++) {
      const i = cells[rng.int(0, cells.length - 1)]!;
      if (w.mat[i] !== EMPTY || w.bg[i] !== 1) continue;
      for (const n of [i - w.w, i - 1, i + 1]) {
        const m = w.mat[n]!;
        if (!SOIL[m] || w.moist[n]! < 110) continue;
        if (!rng.chance(0.25 * Math.min(1, (w.moist[n]! - 110) / 60))) continue;
        w.set(i, WATER, rng.int(0, 255), w.tint[i]);
        w.wake(i);
        w.moist[n] = w.moist[n]! - 40;
        w.markDirty(n);
        this.seeps++;
        if (this.seeps % 40 === 1) sim.noteYearly('seepage', { x: i % w.w, y: (i / w.w) | 0 });
        break;
      }
    }
  }

  /** An ant (or a piece of brood) is buried alive here this tick: the rescuers will come. */
  cry(id: number, x: number, y: number, tick: number): void {
    const b = this.buried.find((q) => q.id === id);
    if (b) {
      b.x = x;
      b.y = y;
      b.t = tick;
    } else this.buried.push({ x, y, id, t: tick });
  }

  /** Someone buried is out (dug out, or dug its own way), or past saving. True if it was on the list. */
  freed(id: number, alive = true): boolean {
    const k = this.buried.findIndex((q) => q.id === id);
    if (k < 0) return false;
    this.buried.splice(k, 1);
    if (alive) this.rescued++;
    return true;
  }

  /** The ceiling of a strained room here (for shoring): the room, if it wants shoring. */
  shoreAt(sim: Sim, i: number): Chamber | null {
    const c = sim.nest.chamberAt(i);
    if (!c || (this.strain[c.id] ?? 0) < 0.15) return null;
    return c;
  }

  /** A worker presses soil into a strained roof. */
  shoreUp(sim: Sim, c: Chamber, cell: number): void {
    this.shore[c.id] = Math.min(1, (this.shore[c.id] ?? 0) + 0.015);
    this.strain[c.id] = Math.max(0, (this.strain[c.id] ?? 0) - 0.006);
    const w = sim.world;
    // The roof cell over her is packed hard (spoil packed into a crack, or the soil itself pressed).
    if (w.mat[cell] === SAND) w.tint[cell] = w.tint[cell]! | PACKED;
    if (sim.tick % (TICK_HZ * 30) < TICK_HZ) sim.noteYearly('shoring', { x: cell % w.w, y: (cell / w.w) | 0 });
  }

  /** Walkable cells under the roofs of strained rooms, where shorers stand. */
  shoreSpots(sim: Sim): number[] {
    const out: number[] = [];
    const w = sim.world;
    for (const c of sim.nest.chambers) {
      if (!c.ready || (this.strain[c.id] ?? 0) < 0.15) continue;
      const r = this.roof(sim, c);
      if (!r) continue;
      for (let x = r.x0 + Math.floor(r.span * 0.2); x <= r.x1 - Math.floor(r.span * 0.2); x += 3) {
        const t = r.top.get(x);
        if (t === undefined) continue;
        // Ants hang under a roof: the open cell just below it, if it can be stood on.
        const i = t * w.w + x;
        if (w.walk[i]) out.push(i);
      }
    }
    return out;
  }
}
