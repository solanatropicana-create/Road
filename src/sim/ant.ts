import type { Sim } from './sim';
import { F, FAR } from './fields';
import { Carry, CarryKind, Task, TaskKind } from './types';
import type { Brood } from './brood';
import type { Caste } from '../render/sprites';
import {
  EMPTY, SOLID, HARDNESS, REFUSE, SEED, SEEDHEAD, FRUIT, SAND, WATER, LITTER,
} from '../world/mat';
import { TUNING, TICK_HZ } from '../config';

const enum Step {
  Arrived,
  Moved,
  Failed,
}

const enum Act {
  None,
  Dig,
  Pick,
  Rest,
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

const NAMES = ['Ada', 'Bel', 'Cem', 'Dua', 'Ece', 'Fil', 'Gül', 'Han', 'Ila', 'Jin', 'Kaz', 'Lal', 'Mir', 'Nur', 'Oya', 'Pir', 'Rüy', 'Sel', 'Tan', 'Ufu', 'Vey', 'Yaz', 'Zel'];

export class Ant {
  static nextId = 1;
  readonly id = Ant.nextId++;
  readonly caste: Caste;
  readonly name: string;
  x: number;
  y: number;
  /** Heading (unit, orthogonal) and the side the legs grip, for the sprite. */
  hx = 1;
  hy = 0;
  lx = 0;
  ly = 1;
  /** Steps taken (drives the leg animation). */
  step = 0;
  private mv = 0;
  readonly speed: number;
  age = 0;
  readonly life: number;
  task: TaskKind = Task.Idle;
  carry: CarryKind = Carry.None;
  carryTone = 0;
  carryTint = 0;
  carryBrood: Brood | null = null;
  timer = 0;
  private act: Act = Act.None;
  private actCell = -1;
  private dropDist = 0;
  private dumpDir = 1;
  private search = 0;
  private lastDir = -1;
  private stuck = 0;
  /** Steps spent unable to find a way to the current target. */
  private lost = 0;
  private buried = 0;
  reevalAt = 0;
  alive = true;
  wings = false;
  /** Founding queen: 0 landing, 1 digging her burrow, 2 settled. */
  phase = 2;
  delivered = 0;

  constructor(caste: Caste, x: number, y: number, life: number, speed: number) {
    this.caste = caste;
    this.x = x;
    this.y = y;
    this.life = life;
    this.speed = speed;
    this.name = `${NAMES[this.id % NAMES.length]}-${this.id}`;
  }

  /** Age as a fraction of lifespan (drives which jobs an ant prefers). */
  get ageFrac(): number {
    return this.age / this.life;
  }

  // ---------------------------------------------------------------- tick

  tick(sim: Sim): void {
    this.age++;
    if (this.caste !== 'queen' && this.age >= this.life) {
      sim.colony.kill(this, 'old age');
      return;
    }
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const m = w.mat[i]!;
    if (SOLID[m] || m === WATER) {
      this.unbury(sim);
      return;
    }
    this.buried = 0;
    if (!w.walk[i]) {
      // Nothing to hold on to: fall.
      if (this.y < w.h - 2 && !SOLID[w.mat[i + w.w]!]) this.y++;
      return;
    }
    if (this.timer > 0) {
      if (--this.timer === 0) this.finish(sim);
      return;
    }
    const slow = this.carry !== Carry.None ? TUNING.carryingSlowdown : 1;
    this.mv += this.speed * slow;
    while (this.mv >= 1 && this.alive) {
      this.mv -= 1;
      this.think(sim);
      if (this.timer > 0) {
        this.mv = 0;
        break;
      }
    }
  }

  private think(sim: Sim): void {
    if (this.caste === 'queen') {
      this.queenThink(sim);
      return;
    }
    // Hopelessly lost with a load: let it go and rethink.
    if (this.lost > 240) this.discard(sim);
    if (this.carry === Carry.None && (sim.tick >= this.reevalAt || this.lost > 120)) {
      this.lost = 0;
      sim.colony.assign(this, sim);
    }
    switch (this.task) {
      case Task.Dig: this.doDig(sim); break;
      case Task.Forage: this.doForage(sim); break;
      case Task.Nurse: this.doNurse(sim); break;
      case Task.Clean: this.doClean(sim); break;
      default: this.doIdle(sim);
    }
  }

  // ---------------------------------------------------------------- movement

  private moveTo(sim: Sim, k: number): void {
    this.x += DX[k]!;
    this.y += DY[k]!;
    this.lastDir = k;
    this.step++;
    this.orient(sim, DX[k]!, DY[k]!);
  }

  /** Pick legs-toward-support and heading-along-travel for the sprite. */
  orient(sim: Sim, dx: number, dy: number): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const W = w.w;
    const below = SOLID[w.mat[i + W]!];
    const above = SOLID[w.mat[i - W]!];
    const right = SOLID[w.mat[i + 1]!];
    const left = SOLID[w.mat[i - 1]!];
    if (below) {
      this.lx = 0;
      this.ly = 1;
    } else if (above) {
      this.lx = 0;
      this.ly = -1;
    } else if (right && !left) {
      this.lx = 1;
      this.ly = 0;
    } else if (left) {
      this.lx = -1;
      this.ly = 0;
    } else if (w.plant[i + 1] || w.plant[i - 1] || w.plant[i]) {
      // Climbing a stem: grip it, heading up or down.
      this.lx = w.plant[i + 1] ? 1 : -1;
      this.ly = 0;
    } else {
      this.lx = 0;
      this.ly = SOLID[w.mat[i + W + 1]!] || SOLID[w.mat[i + W - 1]!] || w.plant[i + W] ? 1 : -1;
    }
    if (this.ly !== 0) {
      this.hy = 0;
      this.hx = dx !== 0 ? Math.sign(dx) : this.hx || 1;
    } else {
      this.hx = 0;
      this.hy = dy !== 0 ? Math.sign(dy) : this.hy || -1;
    }
  }

  /** Walk downhill on a distance field. */
  private descend(sim: Sim, f: number): Step {
    const d = sim.fields.dist[f]!;
    const i = this.y * sim.world.w + this.x;
    const cur = d[i]!;
    if (cur === 0) return Step.Arrived;
    if (cur === FAR) {
      // In-nest fields stop at the mouth: out on the surface, head home first.
      if (f !== F.Entr && sim.world.bg[i] === 0 && sim.fields.dist[F.Entr]![i] !== FAR) {
        if (this.descend(sim, F.Entr) === Step.Moved) return Step.Moved;
      }
      this.lost++;
      this.wander(sim);
      return Step.Failed;
    }
    this.lost = 0;
    const fields = sim.fields;
    let best = cur;
    let bestK = -1;
    let alt = -1;
    let ties = 0;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const v = d[i + fields.off[k]!]!;
      if (v < best) {
        best = v;
        bestK = k;
        ties = 1;
      } else if (v === best && v < cur && sim.rng.next() < 1 / ++ties) {
        bestK = k;
      }
      if (v < cur && sim.rng.next() < 0.5) alt = k;
    }
    if (bestK < 0) {
      this.stuck++;
      this.wander(sim);
      return Step.Failed;
    }
    // A little sloppiness spreads traffic over the tunnel's width.
    this.moveTo(sim, alt >= 0 && sim.rng.next() < 0.12 ? alt : bestK);
    this.stuck = 0;
    return Step.Moved;
  }

  private wander(sim: Sim, stayUnder = false): void {
    const fields = sim.fields;
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (this.lastDir >= 0 && sim.rng.next() < 0.6 && fields.canStep(i, this.lastDir)) {
      const n = i + fields.off[this.lastDir]!;
      if (!stayUnder || w.bg[n] === 1) {
        this.moveTo(sim, this.lastDir);
        return;
      }
    }
    const start = sim.rng.int(0, 7);
    for (let t = 0; t < 8; t++) {
      const k = (start + t) & 7;
      if (!fields.canStep(i, k)) continue;
      if (stayUnder && w.bg[i + fields.off[k]!] !== 1) continue;
      this.moveTo(sim, k);
      return;
    }
  }

  /** Step off the current cell (after dropping something on it). */
  private stepAside(sim: Sim): void {
    const fields = sim.fields;
    const i = this.y * sim.world.w + this.x;
    for (const k of [3, 5, 7, 0, 1, 4, 6, 2]) {
      if (fields.canStep(i, k)) {
        this.moveTo(sim, k);
        return;
      }
    }
  }

  private unbury(sim: Sim): void {
    const w = sim.world;
    // Shove aside to any nearby open foothold.
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = this.x + dx;
          const y = this.y + dy;
          if (!w.inside(x, y)) continue;
          if (w.walk[y * w.w + x]) {
            this.x = x;
            this.y = y;
            this.orient(sim, 0, 0);
            return;
          }
        }
      }
    }
    this.buried++;
    if (this.buried > TICK_HZ * 25) {
      sim.colony.kill(this, 'buried');
      return;
    }
    // Buried ants dig themselves out, slowly.
    if (this.buried % (TICK_HZ * 2) === 0) {
      const i = this.y * w.w + this.x;
      if (HARDNESS[w.mat[i]!]) {
        w.set(i, EMPTY, w.tone[i], w.tint[i] || w.mat[i]);
        if (w.bg[i] === 1 && !w.plan[i]) w.claimed.push(i);
      }
    }
  }

  // ---------------------------------------------------------------- jobs

  private startAct(a: Act, cell: number, ticks: number): void {
    this.act = a;
    this.actCell = cell;
    this.timer = Math.max(1, Math.round(ticks));
  }

  private finish(sim: Sim): void {
    const w = sim.world;
    const a = this.act;
    const n = this.actCell;
    this.act = Act.None;
    if (a === Act.Dig) {
      const m = w.mat[n]!;
      if (!w.plan[n] || !HARDNESS[m] || m === REFUSE) return;
      const src = m === SAND ? w.tint[n]! & 0x7f : m;
      this.carryTone = w.tone[n]!;
      this.carryTint = src;
      w.set(n, EMPTY, w.tone[n], w.bg[n] ? src : 0);
      if (m === LITTER) {
        // Leaf litter cleared from the mouth goes to the refuse heap, not the spoil mound.
        this.carry = Carry.Refuse;
        this.carryTone = sim.rng.int(60, 140);
        this.dropDist = 0;
        return;
      }
      sim.dust(n, src);
      if (this.caste === 'queen') {
        // The founding queen shoves spoil up and out rather than carrying it.
        sim.spoil(this.carryTint, this.carryTone);
      } else {
        this.carry = Carry.Soil;
        this.dropDist = 0;
      }
    } else if (a === Act.Pick) {
      const m = w.mat[n]!;
      if (w.plant[n] === SEEDHEAD) {
        this.carry = Carry.Seed;
        this.carryTone = w.ptone[n]!;
        w.setPlant(n, 0);
        this.search = 0;
      } else if (m === SEED) {
        this.carry = Carry.Seed;
        this.carryTone = w.tone[n]!;
        w.set(n, EMPTY, w.tone[n], w.tint[n]);
        this.search = 0;
      } else if (m === FRUIT) {
        this.carry = Carry.Fruit;
        this.carryTone = w.tone[n]!;
        w.set(n, EMPTY, w.tone[n], w.tint[n]);
        this.search = 0;
      }
    } else if (a === Act.Rest) {
      this.reevalAt = 0;
    }
  }

  /** Standing on soil (not just clinging to a plant)? */
  private grounded(sim: Sim, n: number): boolean {
    const w = sim.world;
    const W = w.w;
    for (const d of [W, -1, 1, W - 1, W + 1]) {
      if (SOLID[w.mat[n + d]!]) return true;
    }
    return false;
  }

  /**
   * Carry spoil or refuse out and drop it on the ground some way from the
   * entrance (spoil makes the mound, refuse the midden). Walks the surface in
   * one direction, never climbs plants, never drops inside the nest plan.
   */
  private dump(sim: Sim, refuse: boolean): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (w.bg[i] === 1) {
      this.descend(sim, F.Out);
      // Walled in (a collapse, a plug of spoil): pack the load into the wall and go dig.
      if (this.lost > 90) this.discard(sim);
      return;
    }
    const ex = sim.nest.foundX;
    if (this.dropDist === 0) {
      this.dropDist = refuse ? sim.rng.int(30, 64) : sim.rng.int(7, 26);
      this.dumpDir = refuse ? sim.colony.middenSide : sim.rng.chance(0.5) ? -1 : 1;
      this.stuck = 0;
    }
    const away = Math.abs(this.x - ex);
    const canDrop = !w.plan[i] && this.grounded(sim, i) && Math.sign(this.x - ex) !== -this.dumpDir;
    if ((canDrop && (away >= this.dropDist || this.stuck > 90)) || (!w.plan[i] && this.stuck > 200)) {
      // Let go: the load becomes a grain on the ground here.
      if (refuse) {
        const tone = this.carry === Carry.Corpse ? sim.rng.int(0, 25) : sim.rng.int(140, 255);
        w.set(i, REFUSE, tone, 0);
      } else {
        w.set(i, SAND, this.carryTone, this.carryTint);
      }
      this.carry = Carry.None;
      this.dropDist = 0;
      this.stuck = 0;
      this.stepAside(sim);
      return;
    }
    const fields = sim.fields;
    let bestK = -1;
    let bestS = -Infinity;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      let s = DX[k]! * this.dumpDir * 2 + sim.rng.next() * 0.8;
      // Prefer walking on soil; leaves and stems only to get past an obstacle.
      if (!this.grounded(sim, n)) s -= this.stuck > 20 ? 0.5 : 2.5;
      if (k === this.lastDir) s += 0.6;
      // Don't step back down into the entrance pit.
      if (w.plan[n] && DY[k]! > 0) s -= 2;
      if (s > bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestK >= 0) {
      const before = Math.abs(this.x - ex);
      this.moveTo(sim, bestK);
      if (Math.abs(this.x - ex) <= before) this.stuck++;
    } else {
      this.stuck++;
      this.wander(sim);
    }
  }

  /** Give up on the current load: spoil gets tamped into the wall, food shared out. */
  private discard(sim: Sim): void {
    if (this.carry === Carry.Corpse) sim.colony.corpses.push({ x: this.x, y: this.y, carried: false });
    else if (this.carry === Carry.Seed || this.carry === Carry.Fruit) sim.colony.reserve++;
    if (this.carryBrood) {
      sim.colony.placeBrood(this.carryBrood, this.x, this.y);
      this.carryBrood = null;
    }
    this.carry = Carry.None;
    this.lost = 0;
    this.dropDist = 0;
    this.reevalAt = 0;
  }

  private doDig(sim: Sim): void {
    if (this.carry === Carry.Soil || this.carry === Carry.Refuse) {
      this.dump(sim, this.carry === Carry.Refuse);
      return;
    }
    const r = this.descend(sim, F.Dig);
    if (r === Step.Arrived) {
      const cell = this.findAdjacent(sim, (n) => {
        const w = sim.world;
        const m = w.mat[n]!;
        return w.plan[n] === 1 && HARDNESS[m]! > 0 && m !== REFUSE;
      }, true);
      if (cell >= 0) {
        const h = HARDNESS[sim.world.mat[cell]!]!;
        const mult = this.caste === 'soldier' ? 0.75 : 1;
        this.startAct(Act.Dig, cell, TUNING.digTicks[h]! * mult * sim.rng.range(0.8, 1.25));
      } else {
        this.wander(sim, true);
      }
    } else if (r === Step.Failed && sim.fields.sourceCount[F.Dig] === 0) {
      this.reevalAt = 0;
    }
  }

  private findAdjacent(sim: Sim, ok: (n: number) => boolean, orthogonal = false): number {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const dirs = orthogonal ? 4 : 8;
    const start = sim.rng.int(0, dirs - 1);
    for (let t = 0; t < dirs; t++) {
      const k = (start + t) % dirs;
      const n = i + DY[k]! * w.w + DX[k]!;
      if (ok(n)) return n;
    }
    return -1;
  }

  private isForageFood(sim: Sim, n: number): boolean {
    const w = sim.world;
    if (w.plant[n] === SEEDHEAD) return true;
    const m = w.mat[n]!;
    if (m !== SEED && m !== FRUIT) return false;
    // Seeds already in a store are not "found" food.
    const c = sim.nest.chamberAt(n);
    return !c || (c.kind !== 'granary' && c.kind !== 'queen');
  }

  private doForage(sim: Sim): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (this.carry === Carry.Seed || this.carry === Carry.Fruit) {
      if (w.bg[i] === 0) sim.layTrail(i, this.carry === Carry.Fruit ? 2.5 : 1);
      const r = this.descend(sim, F.Gran);
      if (r === Step.Arrived) {
        w.set(i, this.carry === Carry.Fruit ? FRUIT : SEED, this.carryTone, 0);
        this.carry = Carry.None;
        this.delivered++;
        sim.colony.delivered++;
        this.stepAside(sim);
        this.reevalAt = Math.min(this.reevalAt, sim.tick + TICK_HZ * 4);
      } else if (r === Step.Failed && sim.fields.sourceCount[F.Gran] === 0) {
        // Nowhere to store it yet: take it to the queen and leave it by her.
        if (this.descend(sim, F.Royal) === Step.Arrived && w.mat[i + w.w] !== EMPTY) {
          w.set(i, this.carry === Carry.Fruit ? FRUIT : SEED, this.carryTone, 0);
          this.carry = Carry.None;
          sim.colony.delivered++;
          this.stepAside(sim);
        }
      }
      return;
    }
    if (this.carry !== Carry.None) {
      this.carry = Carry.None;
      return;
    }
    if (w.bg[i] === 1) {
      this.descend(sim, F.Out);
      return;
    }
    const food = this.findAdjacent(sim, (n) => this.isForageFood(sim, n));
    if (food >= 0) {
      this.startAct(Act.Pick, food, 10 + sim.rng.int(0, 8));
      return;
    }
    if (++this.search > TUNING.forageGiveUpTicks * this.speed) {
      this.search = 0;
      this.task = Task.Idle;
      this.reevalAt = sim.tick + TICK_HZ * 20;
      return;
    }
    this.searchStep(sim, i);
  }

  /** Seeds within reach of the antennae (and the scent of fruit) pull the forager in. */
  private sniff(sim: Sim, i: number): number {
    const w = sim.world;
    const x0 = this.x;
    const y0 = this.y;
    let best = -1;
    let bd = 99;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
        const n = y * w.w + x;
        if (w.bg[n] === 1 || !this.isForageFood(sim, n)) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
    }
    if (best < 0) return -1;
    // Step to the walkable neighbour that gets closest to it.
    const fields = sim.fields;
    const tx = best % w.w;
    const ty = (best / w.w) | 0;
    let bk = -1;
    let bdist = Math.abs(tx - x0) + Math.abs(ty - y0);
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const d = Math.abs(tx - x0 - DX[k]!) + Math.abs(ty - y0 - DY[k]!);
      if (d < bdist) {
        bdist = d;
        bk = k;
      }
    }
    return bk;
  }

  /** Random search biased by trail pheromone, outward from the nest, mostly on the ground. */
  private searchStep(sim: Sim, i: number): void {
    const k0 = this.sniff(sim, i);
    if (k0 >= 0) {
      this.moveTo(sim, k0);
      return;
    }
    const w = sim.world;
    const fields = sim.fields;
    const entr = fields.dist[F.Entr]!;
    const here = entr[i]!;
    let total = 0;
    const weights = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      let s = 0.12 + sim.pher[n]! * 2.5;
      const v = entr[n]!;
      if (v !== FAR && here !== FAR) s *= v > here ? 1.5 : v < here ? 0.6 : 1;
      if (k === this.lastDir) s *= 2.2;
      // Harvesters mostly glean fallen seed; climbing stems is the exception.
      if (!SOLID[w.mat[n + w.w]!]) s *= DY[k]! < 0 ? 0.25 : 0.6;
      weights[k] = s;
      total += s;
    }
    if (total <= 0) {
      this.wander(sim);
      return;
    }
    let r = sim.rng.next() * total;
    for (let k = 0; k < 8; k++) {
      r -= weights[k]!;
      if (r <= 0 && weights[k]! > 0) {
        this.moveTo(sim, k);
        return;
      }
    }
  }

  private doNurse(sim: Sim): void {
    const w = sim.world;
    const col = sim.colony;
    const i = this.y * w.w + this.x;
    if (this.carryBrood) {
      const r = this.descend(sim, F.Nurse);
      if (r === Step.Arrived && col.broodCell[i] === 0) {
        col.placeBrood(this.carryBrood, this.x, this.y);
        this.carryBrood = null;
        this.carry = Carry.None;
      } else if (r === Step.Failed && sim.fields.sourceCount[F.Nurse] === 0) {
        // Nursery full or gone: set it down where we stand.
        if (col.broodCell[i] === 0 && SOLID[w.mat[i + w.w]!]) {
          col.placeBrood(this.carryBrood, this.x, this.y);
          this.carryBrood = null;
          this.carry = Carry.None;
        }
      }
      return;
    }
    if (this.carry === Carry.Seed || this.carry === Carry.Fruit) {
      const r = this.descend(sim, F.Larva);
      if (r === Step.Arrived) {
        if (col.feedLarvaNear(this.x, this.y)) this.carry = Carry.None;
      } else if (r === Step.Failed && sim.fields.sourceCount[F.Larva] === 0) {
        // No one hungry any more: put the food back in the store.
        this.task = Task.Forage;
      }
      return;
    }
    const f = sim.fields.sourceCount;
    if (f[F.Egg]! > 0 && f[F.Nurse]! > 0) {
      if (this.descend(sim, F.Egg) === Step.Arrived) {
        const b = col.broodAt(i);
        if (b && b.stage === 0) {
          col.liftBrood(b);
          this.carryBrood = b;
          this.carry = Carry.Egg;
        } else this.wander(sim, true);
      }
      return;
    }
    if (f[F.Larva]! > 0 && f[F.Store]! > 0) {
      if (this.descend(sim, F.Store) === Step.Arrived) {
        const cell = this.findAdjacent(sim, (n) => {
          const m = w.mat[n]!;
          if (m !== SEED && m !== FRUIT) return false;
          const c = sim.nest.chamberAt(n);
          return !!c && (c.kind === 'granary' || c.kind === 'queen');
        });
        if (cell >= 0) {
          this.carry = w.mat[cell] === FRUIT ? Carry.Fruit : Carry.Seed;
          this.carryTone = w.tone[cell]!;
          w.set(cell, EMPTY, w.tone[cell], w.tint[cell]);
        } else this.wander(sim, true);
      }
      return;
    }
    // Nothing urgent: sit with the brood.
    const r = this.descend(sim, sim.fields.sourceCount[F.Nurse]! > 0 ? F.Nurse : F.Royal);
    if (r !== Step.Moved) {
      this.startAct(Act.Rest, -1, sim.rng.int(TICK_HZ * 2, TICK_HZ * 6));
      if (f[F.Egg] === 0 && f[F.Larva] === 0) this.reevalAt = 0;
    }
  }

  private doClean(sim: Sim): void {
    const w = sim.world;
    const col = sim.colony;
    if (this.carry === Carry.Corpse || this.carry === Carry.Refuse) {
      this.dump(sim, true);
      return;
    }
    const i = this.y * w.w + this.x;
    const r = this.descend(sim, F.Trash);
    if (r === Step.Arrived) {
      if (col.takeCorpseAt(this.x, this.y)) {
        this.carry = Carry.Corpse;
        this.dropDist = 0;
        return;
      }
      const cell = this.findAdjacent(sim, (n) => w.mat[n] === REFUSE && w.bg[n] === 1);
      if (cell >= 0) {
        this.carry = Carry.Refuse;
        this.carryTone = w.tone[cell]!;
        w.set(cell, EMPTY, w.tone[cell], w.tint[cell]);
        this.dropDist = 0;
      } else this.wander(sim, w.bg[i] === 1);
    } else if (r === Step.Failed && sim.fields.sourceCount[F.Trash] === 0) {
      this.reevalAt = 0;
    }
  }

  private doIdle(sim: Sim): void {
    const r = this.descend(sim, F.Rest);
    if (r === Step.Arrived || (r === Step.Failed && sim.fields.sourceCount[F.Rest] === 0)) {
      this.startAct(Act.Rest, -1, sim.rng.int(TICK_HZ * 3, TICK_HZ * 12));
      this.reevalAt = sim.tick + this.timer;
    } else if (r === Step.Moved && sim.rng.next() < 0.002) {
      this.reevalAt = 0;
    }
  }

  // ---------------------------------------------------------------- queen

  private queenThink(sim: Sim): void {
    const w = sim.world;
    if (this.phase === 0) {
      // Just landed: tear off the wings, then start digging.
      this.wings = false;
      sim.shedWings(this.x, this.y);
      this.phase = 1;
      this.startAct(Act.Rest, -1, TICK_HZ * 2);
      return;
    }
    if (this.phase === 1) {
      const qc = sim.nest.queenChamber();
      if (qc && qc.ready && sim.nest.chamberAt(this.y * w.w + this.x) === qc) {
        this.phase = 2;
        this.task = Task.Idle;
        return;
      }
      const r = this.descend(sim, F.Dig);
      if (r === Step.Arrived) {
        const cell = this.findAdjacent(sim, (n) => w.plan[n] === 1 && HARDNESS[w.mat[n]!]! > 0 && w.mat[n] !== REFUSE, true);
        if (cell >= 0) this.startAct(Act.Dig, cell, TUNING.digTicks[HARDNESS[w.mat[cell]!]!]! * 0.3);
        else this.wander(sim, true);
      } else if (r === Step.Failed && sim.fields.sourceCount[F.Dig] === 0) {
        this.descend(sim, F.Royal);
      }
      return;
    }
    // Settled: keep to the royal chamber, shuffle a little.
    const r = this.descend(sim, F.Royal);
    if (r !== Step.Moved) this.startAct(Act.Rest, -1, sim.rng.int(TICK_HZ * 2, TICK_HZ * 8));
  }

  /** Colour of whatever the ant carries (also used by the inspector). */
  static carryLabel(c: CarryKind): string {
    return ['nothing', 'soil', 'a seed', 'fruit', 'an egg', 'a larva', 'a pupa', 'a corpse', 'husks'][c]!;
  }
}

