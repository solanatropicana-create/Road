import type { Sim } from './sim';
import { EMPTY, SEED, PREY, SOIL, SOLID, WATER } from '../world/mat';
import { TICK_HZ, DAY_TICKS } from '../config';
import { clamp } from '../util/math';

/**
 * The other animals of the slice, above and below ground:
 *   lark   – a crested lark (Galerida cristata), the steppe's ground bird:
 *            drops in by day to peck seed off the ground, and the odd ant.
 *   hopper – a grasshopper, leaping about the summer meadow; dies in autumn
 *            (a meal of protein for whoever finds it).
 *   beetle – a seed-eating ground beetle (Harpalus), out at night: a
 *            competitor for fallen seed.
 *   worm   – an earthworm working through the topsoil in the cool, damp
 *            months; heavy rain drives worms up to the surface.
 * At 1 mm per cell the lark is a giant: as long as the frame is tall.
 */
export type CritterKind = 'lark' | 'hopper' | 'beetle' | 'worm';

export interface Critter {
  kind: CritterKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing: +1 right, -1 left. */
  dir: number;
  /** Ticks alive. */
  t: number;
  /** Kind-specific state (lark: 0 flying in, 1 on the ground, 2 flying off). */
  state: number;
  /** Ticks to the next action. */
  timer: number;
  /** Ticks left before it leaves (or dies). */
  life: number;
  /** A peck in progress (ticks left), for the drawing. */
  peck: number;
  /** In the air (a hop or a flight). */
  air: boolean;
  /** Worm: the cells its body lies along, head first. */
  body: number[];
}

const LARK_MONTH = [1.4, 1.4, 1.2, 0.8, 0.7, 0.7, 0.8, 0.9, 1, 1.1, 1.3, 1.4];
const HOPPER_MONTH = [0, 0, 0, 0, 0.2, 0.8, 1, 1, 0.7, 0.2, 0, 0];

export class Critters {
  readonly list: Critter[] = [];
  /** Ants a bird took since the start. */
  taken = 0;

  private add(c: Partial<Critter> & { kind: CritterKind; x: number; y: number }): Critter {
    const full: Critter = { vx: 0, vy: 0, dir: 1, t: 0, state: 0, timer: 0, life: 0, peck: 0, air: false, body: [], ...c };
    this.list.push(full);
    return full;
  }

  count(kind: CritterKind): number {
    let n = 0;
    for (const c of this.list) if (c.kind === kind) n++;
    return n;
  }

  /** Surface: the empty cell just above the ground and whatever lies on it. */
  private top(sim: Sim, x: number): number {
    const w = sim.world;
    const xx = clamp(Math.round(x), 1, w.w - 2);
    let y = w.ground[xx]!;
    while (y < w.h - 2 && w.mat[y * w.w + xx] === EMPTY) y++;
    while (y > 2 && w.mat[(y - 1) * w.w + xx] !== EMPTY) y--;
    return y - 1;
  }

  /** A few times an in-game hour: who turns up. */
  season(sim: Sim): void {
    const doy = sim.doy;
    const m = sim.cal.month(doy);
    const rng = sim.rng;
    const day = sim.cal.daylight(sim.dayT, doy) > 0.15;
    const w = sim.world;
    const dry = !sim.raining && sim.snow < 20;
    // A lark drops in now and then by day (more often in the lean months).
    if (day && dry && this.count('lark') === 0 && rng.chance(0.03 * LARK_MONTH[m]!)) {
      const dir = rng.chance(0.5) ? 1 : -1;
      const tx = rng.int(160, w.w - 160);
      this.add({ kind: 'lark', x: tx - dir * 260, y: -60, dir, state: 0, life: rng.int(TICK_HZ * 25, TICK_HZ * 60), timer: tx });
    }
    // Grasshoppers in the summer grass, by day.
    if (day && dry && this.count('hopper') < 3 && rng.chance(0.08 * HOPPER_MONTH[m]!)) {
      const x = rng.int(20, w.w - 21);
      this.add({ kind: 'hopper', x, y: this.top(sim, x), dir: rng.chance(0.5) ? 1 : -1, life: rng.int(DAY_TICKS / 4, DAY_TICKS), timer: rng.int(TICK_HZ, TICK_HZ * 4), state: rng.int(0, 2) });
    }
    // Seed-eating ground beetles walk the surface at night in the warm months.
    if (!day && dry && sim.cal.airMean(doy) > 9 && this.count('beetle') < 2 && rng.chance(0.06)) {
      const dir = rng.chance(0.5) ? 1 : -1;
      const x = dir > 0 ? 2 : w.w - 3;
      this.add({ kind: 'beetle', x, y: this.top(sim, x), dir, life: DAY_TICKS, state: rng.int(0, 3) });
    }
    // Earthworms in the topsoil when it is cool and damp (not in summer drought or frost).
    const air = sim.cal.airMean(doy);
    if (air > 4 && air < 17 && this.count('worm') < 2 && rng.chance(0.05)) {
      const x = rng.int(30, w.w - 31);
      const y = w.ground[x]! + rng.int(25, 110);
      const i = y * w.w + x;
      if (SOIL[w.mat[i]!] && w.bg[i] === 0 && w.moist[i]! > 0) {
        const len = rng.int(45, 85);
        this.add({ kind: 'worm', x, y, dir: rng.chance(0.5) ? 1 : -1, vx: rng.range(-1, 1), vy: rng.range(-0.3, 0.3), life: rng.int(DAY_TICKS / 3, DAY_TICKS), body: new Array(len).fill(i), state: 0 });
      }
    }
  }

  step(sim: Sim): void {
    if (!this.list.length) return;
    let j = 0;
    for (const c of this.list) {
      c.t++;
      let keep = true;
      switch (c.kind) {
        case 'lark': keep = this.lark(sim, c); break;
        case 'hopper': keep = this.hopper(sim, c); break;
        case 'beetle': keep = this.beetle(sim, c); break;
        case 'worm': keep = this.worm(sim, c); break;
      }
      if (keep) this.list[j++] = c;
    }
    this.list.length = j;
  }

  /** After a downpour the worms come up: those under the surface leave the slice upward. */
  afterStorm(): void {
    for (const c of this.list) if (c.kind === 'worm') c.life = Math.min(c.life, 1);
  }

  // ------------------------------------------------------------- lark

  private lark(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    if (c.state === 0) {
      // Gliding down to the spot it picked (kept in timer).
      const tx = c.timer;
      const gy = this.top(sim, tx);
      c.x += (tx - c.x) * 0.045 + c.dir * 0.4;
      c.y += (gy - c.y) * 0.05 + 0.3;
      c.air = true;
      if (Math.abs(c.x - tx) < 6 && Math.abs(c.y - gy) < 4) {
        c.x = tx;
        c.y = gy;
        c.state = 1;
        c.air = false;
        c.timer = rng.int(TICK_HZ / 2, TICK_HZ * 2);
        sim.noteYearly('lark');
      }
      return true;
    }
    if (c.state === 2) {
      // Off it goes, up and away.
      c.vx += c.dir * 0.08;
      c.vy -= 0.09;
      c.x += c.vx;
      c.y += c.vy;
      c.air = true;
      return c.y > -120 && c.x > -250 && c.x < w.w + 250;
    }
    // On the ground: hop, look about, peck.
    if (--c.life <= 0 || sim.raining || sim.cal.daylight(sim.dayT, sim.doy) < 0.1) {
      c.state = 2;
      c.vx = c.dir * 1.2;
      c.vy = -1.5;
      return true;
    }
    if (c.peck > 0) c.peck--;
    if (c.air) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.22;
      const gy = this.top(sim, c.x);
      if (c.y >= gy) {
        c.y = gy;
        c.air = false;
      }
      return true;
    }
    c.y = this.top(sim, c.x);
    if (--c.timer > 0) return true;
    if (rng.chance(0.55)) {
      // Peck at the ground in front of the bill.
      c.peck = 12;
      this.peckAt(sim, c.x + c.dir * 62, c.y);
      c.timer = rng.int(10, 30);
    } else {
      // Hop on (or turn round near the edge).
      if (c.x < 120 || c.x > w.w - 120 || rng.chance(0.15)) c.dir = -c.dir;
      c.vx = c.dir * rng.range(0.9, 1.8);
      c.vy = -rng.range(1.8, 2.6);
      c.air = true;
      c.timer = rng.int(8, 30);
    }
    return true;
  }

  /** The bill comes down: seeds, a dead insect, or an ant on the surface there are taken. */
  private peckAt(sim: Sim, bx: number, by: number): void {
    const w = sim.world;
    const rng = sim.rng;
    let took = 0;
    for (let dy = -6; dy <= 3 && took < 3; dy++) {
      for (let dx = -5; dx <= 5 && took < 3; dx++) {
        const x = Math.round(bx + dx);
        const y = Math.round(by + dy);
        if (!w.inside(x, y)) continue;
        const i = y * w.w + x;
        const m = w.mat[i];
        if ((m === SEED || m === PREY) && w.bg[i] === 0 && w.mat[i - w.w] === EMPTY) {
          w.set(i, EMPTY, 0, 0);
          took++;
        }
      }
    }
    // Larks eat ants too, though a Messor is a mouthful of hard bits and formic bites.
    for (const a of sim.colony.ants) {
      if (a.away || Math.abs(a.x - bx) > 6 || Math.abs(a.y - by) > 8) continue;
      if (w.bg[a.y * w.w + a.x] !== 0) continue;
      if (rng.chance(0.3)) {
        sim.colony.kill(a, 'eaten by a bird');
        this.taken++;
      }
      break;
    }
  }

  // ------------------------------------------------------------- grasshopper

  private hopper(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    if (--c.life <= 0 || sim.cal.airMean(sim.doy) < 8) {
      // It dies where it sits: a carcass for the scavengers (and the ants).
      if (!c.air) sim.eco.dropPrey(sim, 'hopper', Math.round(c.x) - 4);
      return false;
    }
    if (c.air) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.16;
      if (c.x < 4 || c.x > w.w - 5) return false;
      const gy = this.top(sim, c.x);
      if (c.y >= gy) {
        c.y = gy;
        c.air = false;
        c.vx = 0;
      }
      return true;
    }
    c.y = this.top(sim, c.x);
    if (--c.timer > 0) return true;
    // Spring: a long low leap, more often in the heat of the day.
    if (rng.chance(0.2)) c.dir = -c.dir;
    c.vx = c.dir * rng.range(0.8, 2.4);
    c.vy = -rng.range(1.6, 3.2);
    c.air = true;
    c.timer = rng.int(TICK_HZ * 2, TICK_HZ * 9);
    return true;
  }

  // ------------------------------------------------------------- ground beetle

  private beetle(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    // Dawn sends it off under cover: it heads for the nearer edge.
    if (sim.cal.daylight(sim.dayT, sim.doy) > 0.2) c.dir = c.x < w.w / 2 ? -1 : 1;
    if (c.timer > 0) {
      // Eating a seed.
      c.timer--;
      return true;
    }
    c.x += c.dir * 0.32;
    if (c.x < 1 || c.x > w.w - 2) return false;
    c.y = this.top(sim, c.x);
    // Harpalus eats fallen seed: it stops to eat one when it walks over it.
    const i = Math.round(c.y + 1) * w.w + Math.round(c.x + c.dir * 6);
    if (w.mat[i] === SEED && w.bg[i] === 0 && rng.chance(0.5)) {
      w.set(i, EMPTY, 0, 0);
      c.timer = rng.int(TICK_HZ * 4, TICK_HZ * 10);
    }
    return true;
  }

  // ------------------------------------------------------------- earthworm

  private worm(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    // Worms move slowly: a millimetre or so a second.
    if (c.t % 24 !== 0) return true;
    const head = c.body[0]!;
    const hx = head % w.w;
    const hy = (head / w.w) | 0;
    const leaving = --c.life <= 0;
    // Steer: wander, keep to the topsoil, head up and out when leaving (or when the soil is flooded).
    if (leaving || w.moist[head]! > 200) c.vy = -0.8;
    else {
      c.vx = clamp(c.vx + rng.range(-0.35, 0.35), -1, 1);
      c.vy = clamp(c.vy + rng.range(-0.3, 0.3) + (hy - w.ground[hx]! > 90 ? -0.15 : hy - w.ground[hx]! < 15 ? 0.15 : 0), -1, 1);
    }
    const nx = hx + Math.sign(Math.round(c.vx * 1.4));
    const ny = hy + Math.sign(Math.round(c.vy * 1.4));
    const n = ny * w.w + nx;
    if (nx < 2 || nx > w.w - 3) return false;
    if (leaving && ny <= w.ground[nx]! - 1) return false;
    const m = w.mat[n]!;
    // Only through soil: tunnels, stones, roots and the nest are in the way.
    if (n === head || !SOIL[m] || w.bg[n] !== 0 || w.plan[n]) {
      if (leaving && (m === EMPTY || m === WATER) && !SOLID[m]) return false;
      c.vx = -c.vx + rng.range(-0.5, 0.5);
      c.vy = -c.vy + rng.range(-0.5, 0.5);
      return true;
    }
    c.body.pop();
    c.body.unshift(n);
    // Its casts darken the soil a little where it passed (never to black).
    const old = w.tone[n]!;
    if (old > 50 && rng.chance(0.5)) {
      w.tone[n] = old - 8;
      w.markDirty(n);
    }
    return true;
  }
}
