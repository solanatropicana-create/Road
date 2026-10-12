import type { Sim } from './sim';
import type { Ant } from './ant';
import { TICK_HZ, DAY_TICKS } from '../config';
import { EMPTY, SOLID, WOOD } from '../world/mat';
import { Carry } from './types';

export type CarcassKind = 'beetle' | 'hopper' | 'worm';

/**
 * Pieces a whole carcass cuts into (each one a single worker's load), the
 * strength it takes to drag it whole (workers), and its length in mm.
 */
const SIZE: Record<CarcassKind, { pieces: number; strength: number; len: number }> = {
  beetle: { pieces: 9, strength: 3, len: 10 },
  hopper: { pieces: 16, strength: 5, len: 20 },
  worm: { pieces: 16, strength: 6, len: 22 },
};

/**
 * A dead insect or earthworm lying whole on the ground: food for many, too
 * heavy for one. The worker that finds it tries it, then goes back for help,
 * laying a strong trail and stirring up the foragers waiting at the gate.
 * Enough of them together drag it home, slowly, to the nearest gate, where
 * it is cut up and taken down. Too few hands, or stuck on a clod: they cut it
 * up where it lies and carry it home piece by piece. And if the neighbours'
 * workers get hold of it too, each side pulls toward its own nest.
 */
export class Carcass {
  x: number;
  y: number;
  readonly kind: CarcassKind;
  /** Food left in it, in single-worker loads, and what it started with. */
  pieces: number;
  readonly whole: number;
  readonly tone: number;
  /** Which way it lies (for the drawing). */
  dir: number;
  /** Workers with a grip on it (ours and the neighbours'). */
  readonly carriers: Ant[] = [];
  /** Ticks with hands on it but going nowhere; past a while they start cutting it up. */
  stall = 0;
  /** Ticks left of cutting the next piece off. */
  cut = 0;
  /** Last net pull, -1..1 (the drawing leans it), and how far it has been dragged. */
  pull = 0;
  dragged = 0;
  age = 0;
  /** It has reached one of our gates: it is being cut up for carrying down. */
  atGate = false;

  constructor(kind: CarcassKind, x: number, y: number, tone: number, dir: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.tone = tone;
    this.dir = dir;
    this.pieces = SIZE[kind].pieces;
    this.whole = this.pieces;
  }

  /** Half its length now (it shrinks as pieces are cut off), mm. */
  get half(): number {
    return (SIZE[this.kind].len * (0.45 + 0.55 * (this.pieces / this.whole))) / 2;
  }

  /** Strength it takes to drag it (a major counts double): less as pieces are cut off. */
  get weight(): number {
    return SIZE[this.kind].strength * (0.35 + 0.65 * (this.pieces / this.whole));
  }

  /** Can this worker take hold of it from where it stands? */
  reach(a: Ant): boolean {
    return Math.abs(a.x - this.x) <= this.half + 2 && Math.abs(a.y - this.y) <= 7;
  }

  /** No room for another pair of jaws. */
  get full(): boolean {
    return this.carriers.length >= Math.min(this.pieces, Math.ceil(this.weight) + 3);
  }
}

export class Carcasses {
  readonly list: Carcass[] = [];

  /** Lay a fresh carcass on the ground at column x (or at random). */
  drop(sim: Sim, kind: CarcassKind, at?: number): Carcass | null {
    const w = sim.world;
    const rng = sim.rng;
    const x = Math.round(at ?? rng.int(20, w.w - 21));
    if (x < 10 || x > w.w - 11 || w.mat[(w.ground[x]! - 4) * w.w + x] === WOOD) return null;
    const y = Carcasses.top(sim, x);
    if (w.bg[y * w.w + x] !== 0 || w.plan[y * w.w + x]) return null;
    const tone = kind === 'beetle' ? rng.int(0, 149) : kind === 'hopper' ? rng.int(150, 219) : rng.int(220, 255);
    const c = new Carcass(kind, x, y, tone, rng.chance(0.5) ? 1 : -1);
    this.list.push(c);
    return c;
  }

  /** The open cell resting on the ground in column x. */
  static top(sim: Sim, x: number): number {
    const w = sim.world;
    const xx = Math.max(1, Math.min(w.w - 2, Math.round(x)));
    let y = w.ground[xx]!;
    while (y < w.h - 2 && w.mat[y * w.w + xx] === EMPTY && w.bg[y * w.w + xx] === 0) y++;
    while (y > 2 && w.mat[(y - 1) * w.w + xx] !== EMPTY) y--;
    return y - 1;
  }

  /** The nearest carcass a forager at (x, y) would notice that still wants hands. */
  near(x: number, y: number, r: number): Carcass | null {
    let best: Carcass | null = null;
    let bd = r;
    for (const c of this.list) {
      if (c.full || c.pieces <= 0) continue;
      const d = Math.max(0, Math.abs(c.x - x) - c.half) + Math.abs(c.y - y) * 0.5;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** The carcass lying at a point, for the hover card. */
  at(x: number, y: number): Carcass | null {
    for (const c of this.list) if (Math.abs(x - c.x) <= c.half + 1 && y >= c.y - 4 && y <= c.y + 1) return c;
    return null;
  }

  /** A worker takes hold. */
  join(a: Ant, c: Carcass): void {
    if (c.carriers.includes(a)) return;
    c.carriers.push(a);
    a.haul = c;
  }

  /** A worker lets go (a fight, the rain, or it took a piece). */
  release(a: Ant): void {
    const c = a.haul;
    a.haul = null;
    if (!c) return;
    const k = c.carriers.indexOf(a);
    if (k >= 0) c.carriers.splice(k, 1);
  }

  step(sim: Sim): void {
    if (!this.list.length) return;
    let j = 0;
    for (const c of this.list) {
      if (this.stepOne(sim, c)) this.list[j++] = c;
      else for (const a of [...c.carriers]) this.release(a);
    }
    this.list.length = j;
  }

  /** One carcass for one tick; false once it is gone (eaten up, carried off, rotted). */
  private stepOne(sim: Sim, c: Carcass): boolean {
    const w = sim.world;
    const rng = sim.rng;
    c.age++;
    // Hands that are gone (dead, in a fight, taken away) let go.
    for (const a of [...c.carriers]) if (!a.alive || a.haul !== c || a.fight > 0 || a.paralysed) this.release(a);
    // Rain and cold send everyone in; carcasses lie a week or two before scavengers and rot take them.
    if (sim.forageWeather < 0.05) for (const a of [...c.carriers]) this.release(a);
    if (c.pieces <= 0) return false;
    if (!c.carriers.length) {
      c.stall = 0;
      // At the gate the traffic in and out takes the rest down piece by piece.
      if (c.atGate && !sim.dormant && sim.forageWeather > 0.05 && sim.tick % (TICK_HZ * 3) === 0) {
        c.pieces--;
        sim.colony.reserve += 2;
        return c.pieces > 0;
      }
      return c.age < DAY_TICKS * (sim.dormant ? 1 : 2.5);
    }
    let ours = 0;
    let theirs = 0;
    let their: number | null = null;
    for (const a of c.carriers) {
      const s = a.caste === 'soldier' ? 2 : 1;
      if (a.rival) {
        theirs += s;
        their ??= a.rivalOf ? a.rivalOf.home(sim) : null;
      } else ours += s;
    }
    const gate = sim.nest.founded ? sim.nest.gateNear(c.x) : c.x;
    // At one of our gates: cut it up, a piece for each worker to take down.
    if (!c.atGate && ours > 0 && Math.abs(c.x - gate) <= 5) {
      c.atGate = true;
      sim.noteOnce('teamCarry', { x: Math.round(c.x), y: c.y });
    }
    // (A lone worker, or a stuck team, soon gives up waiting and cuts.)
    if (c.atGate || c.stall > TICK_HZ * (c.carriers.length === 1 ? 6 : 15)) {
      if (c.cut > 0) c.cut--;
      else {
        // Someone cuts a piece off and heads home with it.
        const a = c.carriers[rng.int(0, c.carriers.length - 1)]!;
        this.release(a);
        a.carry = Carry.Prey;
        a.carryTone = c.tone;
        c.pieces--;
        c.cut = c.atGate ? TICK_HZ * 1.5 : TICK_HZ * 3;
        if (!c.atGate && !a.rival) sim.noteOnce('cutUp', { x: Math.round(c.x), y: c.y });
        if (c.pieces <= 0) return false;
      }
      if (c.atGate) {
        this.place(sim, c, 0, 0);
        return true;
      }
    }
    const total = ours + theirs;
    if (total < c.weight) {
      // Not enough of them yet: they tug and wait for help.
      c.stall++;
      c.pull = 0;
      this.place(sim, c, 0, 0);
      return true;
    }
    // Each side pulls toward its own nest.
    const dOurs = Math.sign(gate - c.x) || 1;
    const dTheirs = their === null ? 0 : Math.sign(their - c.x) || 1;
    const net = ours * dOurs + theirs * dTheirs;
    if (ours > 0 && theirs > 0) sim.noteOnce('tugOfWar', { x: Math.round(c.x), y: c.y });
    c.pull = net / total;
    if (Math.abs(net) < 1) {
      // Evenly matched: it jerks back and forth.
      c.stall++;
      c.x += rng.chance(0.5) ? 0.05 : -0.05;
      this.place(sim, c, dOurs, dTheirs);
      return true;
    }
    // Slow, and the stronger the team the quicker (a heavy load crawls).
    const speed = (0.12 + 0.1 * Math.min(1.5, total / c.weight - 1)) * Math.min(1, (Math.abs(net) / total) * 1.5);
    const nx = c.x + Math.sign(net) * speed;
    const ny = Carcasses.top(sim, nx);
    // A clod or a stone too high to drag it over: they stall and start cutting.
    // Dragged home by the neighbours (to their door, or off the slice's edge): theirs now.
    if (theirs > ours && (nx < 5 || nx > w.w - 6 || (their !== null && Math.abs(nx - their) <= 4))) {
      const nb = c.carriers.find((a) => a.rival)?.rivalOf;
      nb?.takeHome(c.pieces);
      return false;
    }
    if (ny < c.y - 4 || nx < 3 || nx > w.w - 4) {
      // Up against the spoil ring round our gate: they cut it up there, on the rim.
      if (ours > theirs && Math.abs(c.x - gate) <= 30) c.atGate = true;
      c.stall++;
      this.place(sim, c, 0, 0);
      return true;
    }
    c.stall = Math.max(0, c.stall - 2);
    c.dragged += Math.abs(nx - c.x);
    c.x = nx;
    c.y = ny;
    if (ours >= 3 && c.dragged > 15) sim.noteOnce('teamCarry', { x: Math.round(c.x), y: c.y });
    this.place(sim, c, dOurs, dTheirs);
    return true;
  }

  /** Put the carriers round it: along both sides, each facing the way it pulls (or the carcass, while waiting). */
  private place(sim: Sim, c: Carcass, dOurs: number, dTheirs: number): void {
    const n = c.carriers.length;
    for (let k = 0; k < n; k++) {
      const a = c.carriers[k]!;
      const side = k % 2 === 0 ? -1 : 1;
      const along = Math.floor(k / 2) / Math.max(1, Math.ceil(n / 2));
      const x = Math.round(c.x + side * c.half * (1 - along * 0.8));
      const y = Carcasses.top(sim, x);
      if (x !== a.x || y !== a.y) {
        a.x = x;
        a.y = y;
        a.step++;
      }
      // Each faces the way it pulls (toward the carcass while it waits).
      const pull = a.rival ? dTheirs : dOurs;
      const face = pull !== 0 ? pull : Math.sign(c.x - x) || 1;
      if (SOLID[sim.world.mat[(y + 1) * sim.world.w + x]!]) a.orient(sim, face, 0);
    }
  }
}
