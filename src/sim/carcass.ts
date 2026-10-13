import type { Sim } from './sim';
import type { Ant } from './ant';
import { TICK_HZ, DAY_TICKS } from '../config';
import { EMPTY, SOLID, WOOD, REFUSE } from '../world/mat';
import { Carry } from './types';

export type CarcassKind = 'beetle' | 'hopper' | 'worm';

/** What a severed part looks like in a worker's jaws. */
export const Look = {
  Chunk: 0,
  Leg: 1,
  HindLeg: 2,
  Wing: 3,
  Head: 4,
  Thorax: 5,
  Abdomen: 6,
  Case: 7,
  Segment: 8,
} as const;
export type LookKind = (typeof Look)[keyof typeof Look];

/** One part a carcass comes apart into: a worker's load home. */
export interface Part {
  look: LookKind;
  /** Food in it, in single-worker loads (pieces). */
  load: number;
  /** Seconds of one worker's chewing to sever it (a major chews faster). */
  secs: number;
  /** Where it joins the body, mm along the carcass from its middle, toward the head (as drawn alive). */
  at: number;
}

const leg = (at: number, secs = 30, load = 1, look: LookKind = Look.Leg): Part => ({ look, load, secs, at });

/**
 * The parts, in the order the workers cut them off: legs first, then wings,
 * head and thorax; the last one (the trunk) is never cut, it is what is left
 * to carry. Real Messor workers dismember an insect at the joints, where the
 * cuticle is thin; the trunk goes down whole if it fits.
 */
export const PARTS: Record<CarcassKind, Part[]> = {
  beetle: [
    leg(3.8), leg(1.4), leg(-1.0), leg(3.4), leg(1.0), leg(-1.4),
    { look: Look.Head, load: 1, secs: 50, at: 6 },
    { look: Look.Thorax, load: 1, secs: 60, at: 3.1 },
    { look: Look.Case, load: 1, secs: 0, at: -2.6 },
  ],
  hopper: [
    leg(4.0), leg(2.0), leg(-0.6, 50, 2, Look.HindLeg), leg(4.4), leg(2.4), leg(1.0, 50, 2, Look.HindLeg),
    { look: Look.Wing, load: 1, secs: 24, at: -5 },
    { look: Look.Head, load: 2, secs: 60, at: 8 },
    { look: Look.Thorax, load: 2, secs: 70, at: 2.5 },
    { look: Look.Abdomen, load: 3, secs: 0, at: -6 },
  ],
  // An earthworm is bitten through into lengths, from the tail (which lies toward +x as drawn).
  worm: Array.from({ length: 8 }, (_, k): Part => ({ look: Look.Segment, load: 2, secs: 40, at: 11 - (k + 0.5) * 2.75 })),
};

/** The strength it takes to drag one whole (workers; a major counts double) and its length in mm. */
const SIZE: Record<CarcassKind, { strength: number; len: number }> = {
  beetle: { strength: 3, len: 10 },
  hopper: { strength: 5, len: 20 },
  worm: { strength: 6, len: 22 },
};

/**
 * A dead insect or earthworm lying whole on the ground: food for many, too
 * heavy for one. The worker that finds it tries it, then goes back for help,
 * laying a strong trail and stirring up the foragers waiting at the gate.
 * Enough of them together drag it home, slowly, to the nearest gate. There,
 * too big for the door, it is taken apart: two workers to a joint, chewing
 * through it, a leg, a wing, the head, until the trunk is light enough for
 * one to take down. Stuck for good, or no help coming, they take it apart
 * where it lies. And if the neighbours' workers get hold of it too, each side
 * pulls toward its own nest.
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
  /** Parts already cut off (bit per part, see PARTS), and the chewing done on each. */
  gone = 0;
  prog: number[];
  /** Ticks with hands on it but going nowhere; past a while they start cutting it up. */
  stall = 0;
  /** Ticks until the gate traffic takes the next part down, when nobody is working on it. */
  cut = 0;
  /** Last net pull, -1..1 (the drawing leans it), and how far it has been dragged. */
  pull = 0;
  dragged = 0;
  age = 0;
  /** It has reached one of our gates: it is being cut up for carrying down. */
  atGate = false;
  /** When one of ours last went back for help with it (the others who find it hold on and wait). */
  helpAt = -1e9;

  constructor(kind: CarcassKind, x: number, y: number, tone: number, dir: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.tone = tone;
    this.dir = dir;
    this.prog = PARTS[kind].map(() => 0);
    this.pieces = PARTS[kind].reduce((n, p) => n + p.load, 0);
    this.whole = this.pieces;
  }

  /** Half its length, mm (it loses parts, not length). */
  get half(): number {
    return SIZE[this.kind].len / 2;
  }

  /** Strength it takes to drag it (a major counts double): less as parts are cut off. */
  get weight(): number {
    return SIZE[this.kind].strength * (0.35 + 0.65 * (this.pieces / this.whole));
  }

  /** Parts still on it. */
  get left(): number {
    let n = 0;
    for (let p = 0; p < PARTS[this.kind].length; p++) if (!((this.gone >> p) & 1)) n++;
    return n;
  }

  /** Where a part joins it, in world x. (Insects lie on their backs, head and tail swapped; worms as they lie.) */
  partX(p: number): number {
    const at = PARTS[this.kind][p]!.at;
    return this.x + (this.kind === 'worm' ? at : -at) * this.dir;
  }

  /** Can this worker take hold of it from where it stands? */
  reach(a: Ant): boolean {
    return Math.abs(a.x - this.x) <= this.half + 2 && Math.abs(a.y - this.y) <= 7;
  }

  /** No room for another pair of jaws. */
  get full(): boolean {
    return this.carriers.length >= Math.min(this.left * 2, Math.ceil(this.weight) + 3);
  }

  /** Bring an old save's carcass (pieces only) up to date: the parts its missing pieces were. */
  settle(): void {
    const parts = PARTS[this.kind];
    this.prog ??= parts.map(() => 0);
    this.helpAt ??= -1e9;
    if (this.gone !== undefined) return;
    this.gone = 0;
    let have = parts.reduce((n, p) => n + p.load, 0);
    for (let p = 0; p < parts.length - 1 && have > this.pieces; p++) {
      this.gone |= 1 << p;
      have -= parts[p]!.load;
    }
    this.pieces = have;
  }
}

/**
 * A part cut off a carcass and set down in the nest, among the brood: not
 * food yet. Nurses come and bite it up, a mouthful at a time, and carry each
 * bite to a hungry larva (insect is what larvae grow on); with no larva
 * waiting the workers pick at it themselves. What is left, the husk of a leg
 * or a wing, goes out to the midden. Left too long, it rots.
 */
export interface Morsel {
  x: number;
  y: number;
  look: LookKind;
  tone: number;
  /** Bites of food left in it (one a meal for a larva), and what it came with. */
  food: number;
  whole: number;
  age: number;
}

/** Parts with a husk worth carrying out once the meat is gone. */
const HUSKED = new Set<number>([Look.Leg, Look.HindLeg, Look.Wing, Look.Head, Look.Thorax, Look.Case]);

export class Carcasses {
  readonly list: Carcass[] = [];
  /** Parts set down in the nest, being eaten. */
  bits: Morsel[] = [];

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
    a.cutPart = -1;
    if (!c) return;
    const k = c.carriers.indexOf(a);
    if (k >= 0) c.carriers.splice(k, 1);
  }

  /** Set a part down here, in the nest. */
  lay(x: number, y: number, look: LookKind, tone: number, food: number): void {
    this.bits.push({ x, y, look, tone, food, whole: food, age: 0 });
  }

  /** The nearest part with food left within r cells (to bite from). */
  bitNear(x: number, y: number, r: number): Morsel | null {
    let best: Morsel | null = null;
    let bd = r;
    for (const m of this.bits) {
      if (m.food <= 0) continue;
      const d = Math.abs(m.x - x) + Math.abs(m.y - y) * 1.5;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** The part lying at a point (the hover card). */
  bitAt(x: number, y: number): Morsel | null {
    for (const m of this.bits) if (Math.abs(x - m.x) <= 3 && y >= m.y - 3 && y <= m.y + 1) return m;
    return null;
  }

  /** A bite taken from a part: true if there was one. */
  bite(m: Morsel): boolean {
    if (m.food <= 0) return false;
    m.food--;
    return true;
  }

  /**
   * The parts in the nest, every second: with no nurse coming for it, a part
   * is picked at by the workers about it (slowly, into the shared crops);
   * left alone too long it rots. Eaten up or rotten, its husk is left for the
   * cleaners to carry out.
   */
  private stepBits(sim: Sim): void {
    if (!this.bits.length || sim.tick % TICK_HZ !== 7) return;
    const w = sim.world;
    let j = 0;
    for (const m of this.bits) {
      m.age += TICK_HZ;
      if (m.food > 0 && m.age > TICK_HZ * 40 && sim.tick % (TICK_HZ * 20) === 7 && !sim.dormant) {
        // Workers about it take a share themselves.
        let near = 0;
        for (const a of sim.colony.ants) if (Math.abs(a.x - m.x) <= 4 && Math.abs(a.y - m.y) <= 3 && ++near > 0) break;
        if (near) {
          m.food--;
          sim.colony.reserve += 2;
        }
      }
      if (m.age > DAY_TICKS * 1.5) m.food = 0;
      if (m.food > 0) {
        this.bits[j++] = m;
        continue;
      }
      // The husk: chaff for the cleaners (a worm or an abdomen leaves nothing).
      if (!HUSKED.has(m.look)) continue;
      for (const i of [m.y * w.w + m.x, m.y * w.w + m.x - 1, m.y * w.w + m.x + 1, (m.y - 1) * w.w + m.x]) {
        if (w.mat[i] !== EMPTY || w.bg[i] !== 1) continue;
        w.set(i, REFUSE, m.tone, 0);
        if (!w.plan[i]) w.claimed.push(i);
        break;
      }
    }
    this.bits.length = j;
  }

  step(sim: Sim): void {
    this.stepBits(sim);
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
    const trunk = PARTS[c.kind].length - 1;
    if (!c.carriers.length) {
      // (Nobody on it: it waits, at the gate too, for the next foragers out.)
      c.stall = 0;
      return c.age < DAY_TICKS * (sim.dormant ? 1 : 2.5);
    }
    // Only the trunk left, and light: one of them takes it home.
    if (c.left === 1 && PARTS[c.kind][trunk]!.load <= 2) {
      this.sever(sim, c, trunk, c.carriers[rng.int(0, c.carriers.length - 1)]!);
      return false;
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
    // At one of our gates: take it apart, a part for each worker to take down.
    if (!c.atGate && ours > 0 && Math.abs(c.x - gate) <= 5) {
      c.atGate = true;
      sim.noteOnce('teamCarry', { x: Math.round(c.x), y: c.y });
    }
    // Carrying it whole comes first. Only a team stuck for half a minute, or a
    // lone finder nobody comes to help (in a colony too small to spare any, soon), starts cutting.
    const alone = c.carriers.length === 1;
    const patience = alone ? (sim.colony.adults < 18 ? 8 : 45) : 30;
    if (c.atGate || c.stall > TICK_HZ * patience) {
      if (!this.chew(sim, c)) return false;
      if (c.atGate) {
        this.place(sim, c, 0, 0);
        return true;
      }
    } else for (const a of c.carriers) a.cutPart = -1;
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
    const speed = (0.06 + 0.06 * Math.min(1.5, total / c.weight - 1)) * Math.min(1, (Math.abs(net) / total) * 1.5);
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

  /**
   * The workers on it chew at the joints: two to a joint, on the next parts
   * in order (so a crowd works on several legs at once). A part chewed through
   * goes home in the jaws of one who cut it. False once nothing is left.
   */
  private chew(sim: Sim, c: Carcass): boolean {
    const parts = PARTS[c.kind];
    const trunk = parts.length - 1;
    if (c.left === 1) {
      // Only the trunk: whoever has the best grip takes it.
      this.sever(sim, c, trunk, c.carriers[sim.rng.int(0, c.carriers.length - 1)]!);
      return false;
    }
    const crew = new Array<number>(parts.length).fill(0);
    for (const a of c.carriers) {
      if (a.cutPart >= 0 && ((c.gone >> a.cutPart) & 1 || a.cutPart >= trunk)) a.cutPart = -1;
      if (a.cutPart >= 0) crew[a.cutPart]!++;
    }
    // The thorax holds everything else: it comes off last, once the rest is gone.
    const open = (p: number): boolean => parts[p]!.look !== Look.Thorax || (c.gone & ((1 << p) - 1)) === (1 << p) - 1;
    for (const a of c.carriers) {
      if (a.cutPart >= 0) continue;
      for (let p = 0; p < trunk; p++) {
        if ((c.gone >> p) & 1 || crew[p]! >= 2 || !open(p)) continue;
        a.cutPart = p;
        crew[p]!++;
        break;
      }
    }
    // A major's big head and jaws cut much faster.
    for (const a of c.carriers) if (a.cutPart >= 0) c.prog[a.cutPart]! += a.caste === 'soldier' ? 2.5 : 1;
    for (let p = 0; p < trunk; p++) {
      if ((c.gone >> p) & 1 || c.prog[p]! < parts[p]!.secs * TICK_HZ) continue;
      const a = c.carriers.find((b) => b.cutPart === p);
      if (a) this.sever(sim, c, p, a);
    }
    return c.pieces > 0;
  }

  /** Part p comes off, into worker a's jaws: she takes it home whole. */
  private sever(sim: Sim, c: Carcass, p: number, a: Ant): void {
    const part = PARTS[c.kind][p]!;
    c.gone |= 1 << p;
    c.pieces -= part.load;
    this.release(a);
    a.carry = Carry.Prey;
    a.carryTone = c.tone;
    a.carryPart = part.look;
    a.carryLoad = part.load;
    if (!c.atGate && !a.rival) sim.noteOnce('cutUp', { x: Math.round(c.x), y: c.y });
  }

  /**
   * Put the workers round it: those cutting at their joint, facing it in
   * pairs; the rest along both sides, each facing the way it pulls (or the
   * carcass, while waiting).
   */
  private place(sim: Sim, c: Carcass, dOurs: number, dTheirs: number): void {
    const n = c.carriers.length;
    let g = 0;
    let holders = 0;
    for (const a of c.carriers) if (a.cutPart < 0) holders++;
    const pair = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const a = c.carriers[k]!;
      let x: number;
      let face: number;
      if (a.cutPart >= 0) {
        // Either side of the joint, jaws to it.
        const nth = pair.get(a.cutPart) ?? 0;
        pair.set(a.cutPart, nth + 1);
        const side = nth === 0 ? -1 : 1;
        const jx = c.partX(a.cutPart);
        x = Math.round(jx + side * 1.6);
        face = Math.sign(jx - x) || -side;
      } else {
        const side = g % 2 === 0 ? -1 : 1;
        const along = Math.floor(g / 2) / Math.max(1, Math.ceil(holders / 2));
        g++;
        x = Math.round(c.x + side * c.half * (1 - along * 0.8));
        const pull = a.rival ? dTheirs : dOurs;
        face = pull !== 0 ? pull : Math.sign(c.x - x) || 1;
      }
      const y = Carcasses.top(sim, x);
      if (x !== a.x || y !== a.y) {
        a.x = x;
        a.y = y;
        a.step++;
      }
      if (SOLID[sim.world.mat[(y + 1) * sim.world.w + x]!]) a.orient(sim, face, 0);
    }
  }
}
