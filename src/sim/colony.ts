import type { Sim } from './sim';
import { Ant } from './ant';
import { Brood, Corpse } from './brood';
import { Carry, Task, TaskKind, Work, WORK, ChamberKind } from './types';
import { F, FAR } from './fields';
import { TUNING, TICK_HZ, W } from '../config';
import { EMPTY, SEED, FRUIT, REFUSE, SOLID } from '../world/mat';
import { clamp } from '../util/math';

/** Multipliers for the colony brain's priority levels: off, low, normal, high. */
export const PRIO_MULT = [0, 0.4, 1, 2.2] as const;
export const PRIO_LABEL = ['Off', 'Low', 'Normal', 'High'] as const;
export const BREED_LABEL = ['Low', 'Normal', 'High'] as const;

const TASKS: TaskKind[] = [Task.Dig, Task.Forage, Task.Nurse, Task.Clean, Task.Idle];
const WORK_TASK: Record<Work, TaskKind> = { dig: Task.Dig, forage: Task.Forage, nurse: Task.Nurse, clean: Task.Clean };

export interface Sample {
  t: number;
  pop: number;
  brood: number;
  food: number;
}

export class Colony {
  readonly ants: Ant[] = [];
  queen: Ant | null = null;
  readonly brood: Brood[] = [];
  readonly corpses: Corpse[] = [];
  readonly broodCell: Int32Array;
  private broodById = new Map<number, Brood>();

  // --- the colony brain (player-set, mode B)
  prio: Record<Work, number> = { dig: 2, forage: 2, nurse: 2, clean: 2 };
  breeding = 1;
  majorShare = 0.12;
  orders: ChamberKind[] = [];

  /** Which side of the entrance the refuse heap goes. */
  middenSide = 1;

  // --- bookkeeping
  delivered = 0;
  eaten = 0;
  born = 0;
  deaths: Record<string, number> = {};
  stored = 0;
  storeCells: number[] = [];
  reserve = 60;
  failed = false;
  hadWorkers = false;
  readonly history: Sample[] = [];
  readonly share: Record<number, number> = {};
  readonly count: Record<number, number> = {};
  hungryLarvae = 0;
  looseEggs = 0;
  starving = false;

  private need = 0;
  private hunger = 0;
  private starveTimer = 0;
  private eggTimer = TICK_HZ * 2;

  constructor(size: number) {
    this.broodCell = new Int32Array(size);
    for (const t of TASKS) {
      this.share[t] = 0;
      this.count[t] = 0;
    }
  }

  get adults(): number {
    return this.ants.length;
  }

  get majors(): number {
    let n = 0;
    for (const a of this.ants) if (a.caste === 'soldier') n++;
    return n;
  }

  broodCounts(): [number, number, number] {
    const c: [number, number, number] = [0, 0, 0];
    for (const b of this.brood) c[b.stage]++;
    return c;
  }

  // ---------------------------------------------------------------- brood

  broodAt(i: number): Brood | undefined {
    const id = this.broodCell[i]!;
    return id ? this.broodById.get(id) : undefined;
  }

  placeBrood(b: Brood, x: number, y: number): void {
    b.x = x;
    b.y = y;
    b.carried = false;
    this.broodCell[y * W + x] = b.id;
    if (!this.broodById.has(b.id)) {
      this.broodById.set(b.id, b);
      this.brood.push(b);
    }
  }

  liftBrood(b: Brood): void {
    const i = b.y * W + b.x;
    if (this.broodCell[i] === b.id) this.broodCell[i] = 0;
    b.carried = true;
  }

  private removeBrood(b: Brood): void {
    if (!b.carried) {
      const i = b.y * W + b.x;
      if (this.broodCell[i] === b.id) this.broodCell[i] = 0;
    }
    this.broodById.delete(b.id);
    b.stage = 2;
    b.age = -1;
  }

  feedings(b: Brood): number {
    return TUNING.larvaFeedings + (b.major ? 2 : 0);
  }

  isHungry(b: Brood): boolean {
    if (b.stage !== 1 || b.carried) return false;
    const req = this.feedings(b);
    return b.fed < req && b.age >= (b.fed / req) * TUNING.larvaTicks * 0.7;
  }

  feedLarvaNear(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.broodAt((y + dy) * W + x + dx);
        if (b && this.isHungry(b)) {
          b.fed++;
          return true;
        }
      }
    }
    return false;
  }

  private speedup(): number {
    // The queen's first brood is small and quick (nanitics).
    return this.born < 6 ? 0.5 : 1;
  }

  private advanceBrood(sim: Sim): void {
    const sp = this.speedup();
    const adults = this.adults;
    let hungry = 0;
    let loose = 0;
    const dead: Brood[] = [];
    for (const b of this.brood) {
      b.age++;
      if (b.stage === 0) {
        if (b.age >= TUNING.eggTicks * sp) {
          b.stage = 1;
          b.age = 0;
          const majors = this.majors;
          b.major = adults > 20 && majors < adults * this.majorShare && sim.rng.chance(0.6);
        } else if (!b.carried && sim.nest.chamberAt(b.y * W + b.x)?.kind !== 'nursery') loose++;
      } else if (b.stage === 1) {
        const req = this.feedings(b);
        if (b.fed >= req && b.age >= TUNING.larvaTicks * sp) {
          b.stage = 2;
          b.age = 0;
        } else if (b.age > TUNING.larvaTicks * 3.5) {
          dead.push(b);
          this.deaths['larva starved'] = (this.deaths['larva starved'] ?? 0) + 1;
          // Nurses eat brood they cannot raise; little is wasted.
          this.reserve += b.fed;
        } else if (this.isHungry(b)) {
          hungry++;
          // Before there are workers the queen feeds her brood from her own body.
          if (adults === 0 && this.reserve > 0 && sim.rng.next() < 1 / (TICK_HZ * 2)) {
            b.fed++;
            this.reserve--;
          }
        }
      } else if (b.age >= TUNING.pupaTicks * sp && !b.carried) {
        dead.push(b);
        this.eclose(sim, b);
      }
    }
    for (const b of dead) this.removeBrood(b);
    if (dead.length) {
      let j = 0;
      for (const b of this.brood) if (this.broodById.has(b.id)) this.brood[j++] = b;
      this.brood.length = j;
    }
    this.hungryLarvae = hungry;
    this.looseEggs = loose;
  }

  private eclose(sim: Sim, b: Brood): void {
    const major = b.major;
    const [l0, l1] = major ? TUNING.soldierLife : TUNING.workerLife;
    const nanitic = this.born < 6;
    const life = sim.rng.int(l0, l1) * (nanitic ? 0.6 : 1);
    const ant = new Ant(major ? 'soldier' : 'worker', b.x, b.y, Math.round(life), major ? TUNING.soldierSpeed : TUNING.workerSpeed * sim.rng.range(0.9, 1.1));
    ant.orient(sim, 0, 0);
    ant.reevalAt = 0;
    this.ants.push(ant);
    this.born++;
    if (!this.hadWorkers) {
      this.hadWorkers = true;
      sim.nest.widenFoundingShaft();
    }
  }

  // ---------------------------------------------------------------- queen

  private lay(sim: Sim): void {
    const q = this.queen;
    if (!q || !q.alive || q.phase !== 2) return;
    const qc = sim.nest.queenChamber();
    if (!qc || !qc.ready) return;
    if (--this.eggTimer > 0) return;
    const adults = this.adults;
    const breedMult = [0.55, 1, 1.6][this.breeding]!;
    const cap = 8 + adults * TUNING.broodPerWorker * breedMult;
    const foodFactor = adults < 6 ? 0.8 : this.stored < adults * 0.25 ? 2.6 : this.stored < adults * 0.8 ? 1.4 : 1;
    this.eggTimer = Math.round(TUNING.eggInterval * [1.8, 1, 0.6][this.breeding]! * foodFactor * sim.rng.range(0.8, 1.2));
    if (this.brood.length >= cap) return;
    // Don't lay into a famine: larvae already waiting for food come first.
    if (adults > 0 && this.stored + this.reserve < this.hungryLarvae * 2 + 2) return;
    if (adults === 0 && this.born === 0 && this.brood.length >= 8) return;
    const spot = this.freeFloorNear(sim, q.x, q.y, 6);
    if (spot < 0) return;
    this.placeBrood(new Brood(spot % W, (spot / W) | 0), spot % W, (spot / W) | 0);
  }

  private freeFloorNear(sim: Sim, x: number, y: number, r: number): number {
    const w = sim.world;
    let best = -1;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (!w.inside(xx, yy)) continue;
        const i = yy * w.w + xx;
        if (!w.walk[i] || this.broodCell[i] || !SOLID[w.mat[i + w.w]!] || w.bg[i] !== 1) continue;
        const d = dx * dx + dy * dy + sim.rng.next();
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- food

  refreshStore(sim: Sim): void {
    const w = sim.world;
    this.storeCells.length = 0;
    let n = 0;
    for (const c of sim.nest.chambers) {
      if (c.kind !== 'granary' && c.kind !== 'queen') continue;
      for (const i of c.cells) {
        const m = w.mat[i]!;
        if (m !== SEED && m !== FRUIT) continue;
        n++;
        if (w.mat[i - w.w] === EMPTY) this.storeCells.push(i);
      }
    }
    this.stored = n;
  }

  private eatOne(sim: Sim): boolean {
    const w = sim.world;
    for (let tries = 0; tries < 6 && this.storeCells.length; tries++) {
      const k = sim.rng.int(0, this.storeCells.length - 1);
      const i = this.storeCells[k]!;
      this.storeCells[k] = this.storeCells[this.storeCells.length - 1]!;
      this.storeCells.pop();
      const m = w.mat[i]!;
      if (m === SEED) {
        // Messor eat the kernel and leave the husk, which cleaners carry out.
        w.set(i, REFUSE, sim.rng.int(150, 255), 0);
      } else if (m === FRUIT) {
        w.set(i, EMPTY, w.tone[i], w.tint[i]);
      } else continue;
      this.stored = Math.max(0, this.stored - 1);
      this.eaten++;
      return true;
    }
    return false;
  }

  private consume(sim: Sim): void {
    const adults = this.adults;
    if (adults === 0) return;
    this.need += adults / TUNING.adultSeedTicks + (this.queen?.alive ? 1 / TUNING.queenSeedTicks : 0);
    while (this.need >= 1) {
      this.need -= 1;
      if (this.eatOne(sim)) this.hunger = Math.max(0, this.hunger - 0.5);
      // Early on the queen feeds her daughters from her own fat (trophic eggs).
      else if (this.reserve > 0) this.reserve--;
      else this.hunger++;
    }
    this.starving = this.hunger > 1;
    if (this.hunger > 1) {
      if (++this.starveTimer >= TUNING.starveTicks / (1 + this.hunger * 0.15)) {
        this.starveTimer = 0;
        this.hunger = Math.max(0, this.hunger - 2);
        // The oldest go first.
        let victim: Ant | null = null;
        for (const a of this.ants) if (!victim || a.ageFrac > victim.ageFrac) victim = a;
        if (victim) this.kill(victim, 'starvation');
      }
    } else this.starveTimer = 0;
  }

  // ---------------------------------------------------------------- work

  private updateDemand(sim: Sim): void {
    const adults = Math.max(1, this.adults);
    const nest = sim.nest;
    const f = sim.fields.sourceCount;
    const need: Record<number, number> = {};
    // Only count digging work the colony can actually reach.
    const dd = sim.fields.dist[F.Dig]!;
    const q = this.queen;
    const reach = (q && dd[q.y * W + q.x] !== FAR) || nest.entrances.some((e) => dd[e] !== FAR || dd[e - W] !== FAR);
    need[Task.Dig] = nest.frontier.length > 0 && reach ? 0.3 + Math.min(1, nest.pendingCells / (adults * 5 + 40)) : 0;
    need[Task.Forage] = 0.3 + 0.9 * clamp(1 - this.stored / (adults * 2 + 12), 0, 1);
    need[Task.Nurse] = this.brood.length > 0 ? 0.12 + Math.min(1.2, (this.looseEggs + this.hungryLarvae * 1.5) / (adults * 0.15 + 2)) : 0;
    need[Task.Clean] = f[F.Trash]! > 0 ? 0.12 + Math.min(0.8, f[F.Trash]! / 12) : 0;
    need[Task.Idle] = 0.28;
    for (const wk of WORK) need[WORK_TASK[wk]] = need[WORK_TASK[wk]]! * PRIO_MULT[this.prio[wk]]!;
    let sum = 0;
    for (const t of TASKS) sum += need[t]!;
    for (const t of TASKS) this.share[t] = need[t]! / sum;
    for (const t of TASKS) this.count[t] = 0;
    for (const a of this.ants) this.count[a.task] = (this.count[a.task] ?? 0) + 1;
  }

  private affinity(a: Ant, t: TaskKind): number {
    const age = a.ageFrac;
    let v = 0;
    switch (t) {
      case Task.Nurse: v = age < 0.25 ? 1 : age < 0.5 ? 0.3 : -0.5; break;
      case Task.Dig: v = age > 0.12 && age < 0.7 ? 0.6 : 0; break;
      case Task.Forage: v = age > 0.45 ? 1 : age > 0.3 ? 0.2 : -0.6; break;
      case Task.Clean: v = 0.2; break;
    }
    if (a.caste === 'soldier') {
      if (t === Task.Nurse) v -= 1;
      if (t === Task.Forage) v += 0.4;
      if (t === Task.Dig) v += 0.2;
    }
    return v;
  }

  /** Give an ant its next job: the most under-staffed one, nudged by its age. */
  assign(a: Ant, sim: Sim): void {
    const adults = Math.max(1, this.adults);
    this.count[a.task] = Math.max(0, (this.count[a.task] ?? 1) - 1);
    let best: TaskKind = Task.Idle;
    let bestS = -Infinity;
    for (const t of TASKS) {
      if (t !== Task.Idle && this.share[t] === 0) continue;
      const s = this.share[t]! - this.count[t]! / adults + this.affinity(a, t) * 0.16 + sim.rng.next() * 0.1;
      if (s > bestS) {
        bestS = s;
        best = t;
      }
    }
    a.task = best;
    this.count[best] = (this.count[best] ?? 0) + 1;
    a.reevalAt = sim.tick + sim.rng.int(TICK_HZ * 15, TICK_HZ * 45);
  }

  // ---------------------------------------------------------------- death

  kill(a: Ant, cause: string): void {
    if (!a.alive) return;
    a.alive = false;
    this.deaths[cause] = (this.deaths[cause] ?? 0) + 1;
    if (a.carryBrood) {
      this.placeBrood(a.carryBrood, a.x, a.y);
      a.carryBrood = null;
    }
    a.carry = Carry.None;
    this.corpses.push({ x: a.x, y: a.y, carried: false });
  }

  takeCorpseAt(x: number, y: number): boolean {
    for (let k = 0; k < this.corpses.length; k++) {
      const c = this.corpses[k]!;
      if (!c.carried && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1) {
        this.corpses.splice(k, 1);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- tick

  tick(sim: Sim): void {
    this.advanceBrood(sim);
    this.lay(sim);
    if (sim.tick % 30 === 0) {
      this.refreshStore(sim);
      this.updateDemand(sim);
    }
    this.consume(sim);
    if (this.queen?.alive) this.queen.tick(sim);
    for (let k = 0; k < this.ants.length; k++) {
      const a = this.ants[k]!;
      if (a.alive) a.tick(sim);
    }
    if (this.ants.some((a) => !a.alive)) {
      let j = 0;
      for (const a of this.ants) if (a.alive) this.ants[j++] = a;
      this.ants.length = j;
    }
    if (this.hadWorkers && this.ants.length === 0 && !this.failed) this.failed = true;
    if (sim.tick % (TICK_HZ * 5) === 0) {
      this.history.push({ t: sim.tick, pop: this.ants.length, brood: this.brood.length, food: this.stored });
      if (this.history.length > 2000) this.history.splice(0, this.history.length - 2000);
    }
  }
}
