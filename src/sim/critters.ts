import type { Sim } from './sim';
import type { Ant } from './ant';
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
 *   spider – Zodarion, the ant-eating spider: lurks by the foragers' trail at
 *            dusk, paralyses an ant with one bite and drags it away.
 *   phorid – Razorfemora, a 2 mm parasitoid fly: hovers over medium-sized
 *            workers and lays an egg in one; ants that freeze or curl into a
 *            "C" are spared.
 *   woodlouse, cricket, beetlet – nest guests: blind white woodlice that eat
 *            chaff, an ant cricket that begs food from the workers, and
 *            Attaephilus molitori, a tiny beetle known only from Messor
 *            structor nests in the dry grasslands near Vienna and in Moravia.
 *   antlion – an antlion larva at the bottom of its sand pit.
 * At 1 mm per cell the lark is a giant: as long as the frame is tall.
 */
export type CritterKind = 'lark' | 'hopper' | 'beetle' | 'worm' | 'spider' | 'phorid' | 'woodlouse' | 'cricket' | 'beetlet' | 'antlion';

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
  /** Colour variant (spider: below 90 a young one). */
  tone: number;
  /** Spider: the ant it is holding. Phorid: the ant it is stalking. */
  prey?: Ant | null;
  /** Antlion: the pit's centre and radius. */
  px?: number;
  pr?: number;
}

const LARK_MONTH = [1.4, 1.4, 1.2, 0.8, 0.7, 0.7, 0.8, 0.9, 1, 1.1, 1.3, 1.4];
const HOPPER_MONTH = [0, 0, 0, 0, 0.2, 0.8, 1, 1, 0.7, 0.2, 0, 0];

export class Critters {
  readonly list: Critter[] = [];
  /** Ants a bird took since the start. */
  taken = 0;
  /** Where a bird is on the ground right now (NaN if none): foragers near it run for home. */
  birdX = NaN;

  private add(c: Partial<Critter> & { kind: CritterKind; x: number; y: number }): Critter {
    const full: Critter = { vx: 0, vy: 0, dir: 1, t: 0, state: 0, timer: 0, life: 0, peck: 0, air: false, body: [], tone: 0, ...c };
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
    const air = sim.cal.airMean(doy);
    const nest = sim.nest;
    const col = sim.colony;
    // Zodarion hunts by the foragers' trail from dusk, in the warm months.
    if (nest.founded && col.adults > 5 && sim.cal.daylight(sim.dayT, doy) < 0.3 && dry && air > 14 && this.count('spider') === 0 && rng.chance(0.02)) {
      const x = clamp(nest.foundX + (rng.chance(0.5) ? -1 : 1) * rng.int(40, 220), 10, w.w - 11);
      // A young spider is smaller and its venom acts more slowly.
      this.add({ kind: 'spider', x, y: this.top(sim, x), dir: rng.chance(0.5) ? 1 : -1, life: rng.int(DAY_TICKS / 6, DAY_TICKS / 3), tone: rng.int(0, 255), timer: 0 });
    }
    // Phorid flies, May to mid-July, by day over the foragers.
    // (The smell of a battle draws them in: Delgado, Disney & Palma 2020.)
    const battle = (sim.neighbour?.war ?? 0) > 0;
    if (nest.founded && doy > 125 && doy < 200 && day && dry && air > 15 && this.count('phorid') < (battle ? 5 : 1) && rng.chance(battle ? 0.3 : 0.015)) {
      const x = clamp(nest.foundX + rng.int(-150, 150), 10, w.w - 11);
      this.add({ kind: 'phorid', x, y: this.top(sim, x) - rng.int(20, 50), dir: 1, life: rng.int(TICK_HZ * 40, TICK_HZ * 120), air: true });
    }
    // Nest guests move in as the colony grows.
    if (nest.founded && sim.tick % (TICK_HZ * 60) < Critters.PERIOD) this.guests(sim);
    // Earthworms in the topsoil when it is cool and damp (not in summer drought or frost).
    if (air > 4 && air < 17 && this.count('worm') < 2 && rng.chance(0.05)) {
      const x = rng.int(30, w.w - 31);
      const y = w.ground[x]! + rng.int(25, 110);
      const i = y * w.w + x;
      if (SOIL[w.mat[i]!] && !w.plan[i] && w.moist[i]! > 0) {
        const len = rng.int(45, 85);
        this.add({ kind: 'worm', x, y, dir: rng.chance(0.5) ? 1 : -1, vx: rng.range(-1, 1), vy: rng.range(-0.3, 0.3), life: rng.int(DAY_TICKS / 3, DAY_TICKS), body: new Array(len).fill(i), state: 0 });
      }
    }
  }

  step(sim: Sim): void {
    this.birdX = NaN;
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
        case 'spider': keep = this.spider(sim, c); break;
        case 'phorid': keep = this.phorid(sim, c); break;
        case 'woodlouse':
        case 'cricket':
        case 'beetlet': keep = this.guest(sim, c); break;
        case 'antlion': keep = this.antlion(sim, c); break;
      }
      if (keep) this.list[j++] = c;
    }
    this.list.length = j;
  }

  /** Ticks between seasonal checks (matches Ecology.PERIOD). */
  static readonly PERIOD = TICK_HZ * 10;

  /** Antlions in their pits (from the map). */
  addAntlion(x: number, y: number, r: number): void {
    this.add({ kind: 'antlion', x, y, px: x, pr: r, life: Infinity, dir: 1 });
  }

  /** A free spot on a chamber floor, for a guest to appear on. */
  private floorSpot(sim: Sim, kinds: string[]): number {
    const rooms = sim.nest.chambers.filter((c) => c.ready && kinds.includes(c.kind) && c.floor.length);
    if (!rooms.length) return -1;
    const room = rooms[sim.rng.int(0, rooms.length - 1)]!;
    return room.floor[sim.rng.int(0, room.floor.length - 1)]!;
  }

  /**
   * Myrmecophiles: half of all the obligate ant guests on Malta live with
   * Messor. Woodlice come first, then an ant cricket, and in the dry
   * grasslands of Austria and Moravia, Attaephilus.
   */
  private guests(sim: Sim): void {
    const a = sim.colony.adults;
    const w = sim.world;
    const want: [CritterKind, number, string[], string][] = [
      ['woodlouse', a >= 50 ? Math.min(5, Math.floor(a / 50)) : 0, ['granary', 'rest', 'queen'], 'guestWoodlouse'],
      ['cricket', a >= 90 ? 1 + (a >= 250 ? 1 : 0) : 0, ['rest', 'nursery', 'granary'], 'guestCricket'],
      ['beetlet', a >= 140 && (sim.site === 'pannonian' || sim.site === 'vineyard' || sim.site === 'limestone') ? 2 : 0, ['granary'], 'guestBeetle'],
    ];
    for (const [kind, n, rooms, key] of want) {
      if (this.count(kind) >= n) continue;
      const i = this.floorSpot(sim, rooms);
      if (i < 0) continue;
      this.add({ kind, x: i % w.w, y: (i / w.w) | 0, dir: sim.rng.chance(0.5) ? 1 : -1, life: Infinity, timer: sim.rng.int(0, TICK_HZ * 5) });
      sim.noteOnce(key, { x: i % w.w, y: (i / w.w) | 0 });
    }
  }

  // ------------------------------------------------------------- Zodarion

  private spider(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    const col = sim.colony;
    const young = c.tone < 90;
    const dawn = sim.cal.daylight(sim.dayT, sim.doy) > 0.35;
    // Holding a bitten ant: wait for the venom, then drag it off.
    const prey = c.prey;
    if (prey) {
      if (!prey.alive) {
        c.prey = null;
        return true;
      }
      if (c.state === 1) {
        if (--c.timer <= 0) c.state = 2;
        // Nestmates that find her at it drive her off (she leaves the ant).
        if (this.mobbed(sim, c, 3)) {
          c.state = 3;
          c.prey = null;
          // Too late for the bitten ant: the venom has done its work.
          prey.venom = 1;
        }
        return true;
      }
      // Dragging: back the way she came, out of the meadow's view.
      c.x += -c.dir * 0.22;
      c.y = this.top(sim, c.x);
      prey.x = clamp(Math.round(c.x + c.dir * 4), 1, w.w - 2);
      prey.y = this.top(sim, prey.x);
      if (Math.abs(c.x - sim.nest.foundX) > 260 || c.x < 3 || c.x > w.w - 4) {
        col.kill(prey, 'killed by a spider', 'none');
        this.spiderKills++;
        return false;
      }
      return true;
    }
    if (c.state === 3 || dawn || --c.life <= 0) {
      // Fleeing, or off to her retreat at dawn.
      c.x += (c.x < sim.nest.foundX ? -1 : 1) * 0.5;
      c.y = this.top(sim, c.x);
      return c.x > 2 && c.x < w.w - 3 && Math.abs(c.x - sim.nest.foundX) < 320;
    }
    // Lurking: creeping a little, turning, waiting by the trail.
    if (--c.timer <= 0) {
      c.timer = rng.int(TICK_HZ, TICK_HZ * 6);
      if (rng.chance(0.4)) c.dir = -c.dir;
    }
    if (c.t % 3 === 0 && rng.chance(0.3)) {
      c.x = clamp(c.x + c.dir * 0.5, 4, w.w - 5);
      c.y = this.top(sim, c.x);
    }
    if (this.mobbed(sim, c, 4)) {
      c.state = 3;
      return true;
    }
    // An ant within reach: one bite.
    for (const a of col.ants) {
      if (a.away || a.paralysed || a.caste === 'queen') continue;
      if (Math.abs(a.x - c.x) > 3 || Math.abs(a.y - c.y) > 4 || w.bg[a.y * w.w + a.x] !== 0) continue;
      if (!rng.chance(0.02)) continue;
      a.paralysed = true;
      a.carry = 0;
      c.prey = a;
      c.state = 1;
      c.dir = a.x >= c.x ? 1 : -1;
      // The venom of a young spider takes half as long again to work.
      c.timer = Math.round(TICK_HZ * (young ? 9 : 6));
      sim.noteYearly('spider', c);
      break;
    }
    return true;
  }

  /** Several workers round her: the spider is found out and attacked. */
  private mobbed(sim: Sim, c: Critter, n: number): boolean {
    let k = 0;
    for (const a of sim.colony.ants) {
      if (a.away || a.paralysed) continue;
      if (Math.abs(a.x - c.x) <= 7 && Math.abs(a.y - c.y) <= 6 && ++k >= n) return true;
    }
    return false;
  }

  /** Ants killed by spiders since the start. */
  spiderKills = 0;
  /** Eggs laid in ants by phorid flies, and attacks warded off by the C posture. */
  phoridHits = 0;
  phoridBlocked = 0;

  // ------------------------------------------------------------- phorid fly

  private phorid(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    const col = sim.colony;
    if (--c.life <= 0 || sim.raining) {
      c.y -= 0.8;
      return c.y > -20;
    }
    let target = c.prey;
    if (!target || !target.alive || target.away || w.bg[target.y * w.w + target.x] !== 0) {
      // Pick a medium-sized worker out on the surface (never a major, never the smallest).
      target = null;
      let best = 1e9;
      for (const a of col.ants) {
        if (a.caste !== 'worker' || a.away || a.paralysed || a.parasite > 0 || a.id <= col.firstWorkerId + 8) continue;
        if (w.bg[a.y * w.w + a.x] !== 0) continue;
        const d = Math.abs(a.x - c.x) + Math.abs(a.y - c.y);
        if (d < best && d < 260) {
          best = d;
          target = a;
        }
      }
      c.prey = target;
      c.timer = rng.int(TICK_HZ, TICK_HZ * 3);
    }
    // Jinking flight: darting about, then hovering a few millimetres over the target.
    const tx = target ? target.x + Math.sin(c.t * 0.4) * 2 : c.x + Math.sin(c.t * 0.05) * 30;
    const ty = target ? target.y - 5 + Math.sin(c.t * 0.7) * 1.2 : c.y;
    c.x += (tx - c.x) * 0.12 + (rng.next() - 0.5) * 0.8;
    c.y += (ty - c.y) * 0.12 + (rng.next() - 0.5) * 0.8;
    c.dir = tx >= c.x ? 1 : -1;
    if (!target || Math.abs(c.x - target.x) > 4 || Math.abs(c.y - (target.y - 5)) > 3) return true;
    // The ant may notice and curl into a C (or freeze), and the fly gives up on her.
    if (target.cpose > 0) {
      c.prey = null;
      return true;
    }
    if (rng.chance(0.02)) {
      target.cpose = rng.int(TICK_HZ * 3, TICK_HZ * 8);
      this.phoridBlocked++;
      sim.noteYearly('cPosture', target);
      // Nestmates nearby freeze too.
      for (const a of col.ants) if (a !== target && Math.abs(a.x - target.x) < 12 && Math.abs(a.y - target.y) < 8 && !a.away) a.cpose = Math.max(a.cpose, rng.int(TICK_HZ, TICK_HZ * 4));
      return true;
    }
    if (--c.timer <= 0) {
      // Strike: an egg is laid in the ant in an instant.
      target.parasite = DAY_TICKS * rng.range(1.5, 2.5);
      this.phoridHits++;
      sim.noteYearly('phorid', target);
      c.prey = null;
      c.life = Math.min(c.life, TICK_HZ * 20);
    }
    return true;
  }

  // ------------------------------------------------------------- nest guests

  private guest(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    const col = sim.colony;
    const speed = c.kind === 'cricket' ? 0.35 : c.kind === 'woodlouse' ? 0.12 : 0.08;
    if (c.timer > 0) {
      c.timer--;
      return true;
    }
    if (rng.next() > speed) return true;
    // Wander the nest's floors and walls (never out into the open).
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    const opts: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const n = (y + dy) * w.w + x + dx;
      if (w.walk[n] && w.bg[n] === 1 && w.mat[n] !== WATER) opts.push(n);
    }
    if (!opts.length) return true;
    let n = opts[rng.int(0, opts.length - 1)]!;
    // Keep going the same way along a floor where possible.
    const ahead = y * w.w + x + c.dir;
    if (opts.includes(ahead) && rng.chance(0.7)) n = ahead;
    else c.dir = (n % w.w) >= x ? 1 : -1;
    c.x = n % w.w;
    c.y = (n / w.w) | 0;
    if (rng.chance(0.004)) c.timer = rng.int(TICK_HZ * 2, TICK_HZ * 10);
    if (c.kind === 'woodlouse' && col.husks > 0 && rng.chance(0.002)) col.husks--;
    if (c.kind === 'cricket') {
      for (const a of col.ants) {
        if (Math.abs(a.x - c.x) > 4 || Math.abs(a.y - c.y) > 4) continue;
        // It begs food by mimicking a nestmate; now and then it is found out and chased.
        if (rng.chance(0.01) && col.reserve > 0) col.reserve--;
        if (rng.chance(0.004)) {
          c.timer = 0;
          c.dir = -c.dir;
          for (let k = 0; k < 6; k++) this.guestStep(sim, c);
        }
        break;
      }
    }
    return true;
  }

  private guestStep(sim: Sim, c: Critter): void {
    const w = sim.world;
    const n = Math.round(c.y) * w.w + Math.round(c.x) + c.dir;
    if (w.walk[n] && w.bg[n] === 1) c.x += c.dir;
  }

  // ------------------------------------------------------------- antlion

  private antlion(sim: Sim, c: Critter): boolean {
    const w = sim.world;
    const rng = sim.rng;
    const r = c.pr ?? 15;
    const cx = c.px ?? c.x;
    if (c.timer > 0) c.timer--;
    if (sim.cal.airMean(sim.doy) < 12 || sim.raining) return true;
    // Anything that fell into the pit is flicked out over the rim.
    if (c.t % 45 === 0) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(cx) + dx;
        let y = w.ground[x]!;
        while (y < c.y && w.mat[y * w.w + x] === EMPTY) y++;
        const i = y * w.w + x;
        if (y < c.y && w.mat[i] !== EMPTY && !SOIL[w.mat[i]!]) {
          w.set(i, EMPTY, 0, 0);
          c.peck = 8;
          break;
        }
      }
    }
    if (c.peck > 0) c.peck--;
    // An ant on the pit's slope slips on the loose sand toward the jaws; the
    // antlion flicks sand at it as it scrambles.
    for (const a of sim.colony.ants) {
      if (a.away || a.paralysed) continue;
      const dx = a.x - cx;
      if (Math.abs(dx) >= r * 0.85 || a.y < w.ground[a.x]! - 1 || w.bg[a.y * w.w + a.x] !== 0) continue;
      // A big harvester worker usually scrambles out; the jaws close on one now
      // and then, and a fed larva digests for weeks before it hunts again.
      if (Math.abs(dx) <= 2 && a.y >= c.y - 3) {
        if (c.timer <= 0 && rng.chance(0.01)) {
          sim.colony.kill(a, 'caught by an antlion', 'none');
          this.antlionKills++;
          c.peck = 12;
          c.timer = DAY_TICKS * 3;
          sim.noteYearly('antlion', c);
        } else if (rng.chance(0.03)) {
          a.x += Math.sign(dx) || 1;
          a.y = this.top(sim, a.x);
        }
        continue;
      }
      if (rng.chance(0.025)) {
        a.x -= Math.sign(dx);
        a.y = this.top(sim, a.x);
        c.peck = 6;
      }
    }
    return true;
  }

  /** Ants caught by antlions since the start. */
  antlionKills = 0;

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
        sim.noteYearly('lark', { x: c.x, y: c.y - 40 });
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
    this.birdX = c.x;
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
      if (a.away || Math.abs(a.x - bx) > 4 || Math.abs(a.y - by) > 6) continue;
      if (w.bg[a.y * w.w + a.x] !== 0) continue;
      if (rng.chance(0.12)) {
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
    if (n === head || !SOIL[m] || w.plan[n]) {
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
