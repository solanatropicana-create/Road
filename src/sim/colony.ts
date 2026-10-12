import type { Sim } from './sim';
import { Ant } from './ant';
import { Brood, Corpse } from './brood';
import { Carry, Task, TaskKind, Work, WORK, ChamberKind } from './types';
import { F } from './fields';
import { TUNING, TICK_HZ, DAY_TICKS } from '../config';
import { devRate, metabolism } from './calendar';
import { EMPTY, SEED, FRUIT, SOLID, WATER, POWDER, PREY } from '../world/mat';
import { clamp } from '../util/math';

/** Multipliers for the colony brain's priority levels: off, low, normal, high. */
export const PRIO_MULT = [0, 0.4, 1, 2.2] as const;

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
  /** Winged young queens and males, waiting in the nest for the nuptial flight. */
  readonly alates: Ant[] = [];
  /** Alates that flew this year and in all (for the journal). */
  flown = { gynes: 0, males: 0, total: 0 };
  readonly brood: Brood[] = [];
  readonly corpses: Corpse[] = [];
  /** Ant index + 1 at each cell, rebuilt each tick (0 = none). */
  occ: Int32Array | null = null;
  private occCells: number[] = [];
  readonly broodCell: Int32Array;
  private broodById = new Map<number, Brood>();

  // --- the colony brain (player-set, mode B)
  prio: Record<Work, number> = { dig: 2, forage: 2, nurse: 2, clean: 2 };
  breeding = 1;
  majorShare = 0.12;

  /** Back to the colony's own defaults (the player stops steering). */
  resetSettings(): void {
    this.prio = { dig: 2, forage: 2, nurse: 2, clean: 2 };
    this.breeding = 1;
    this.majorShare = 0.12;
    this.orders.length = 0;
  }
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
  /** Seed husks piled by the stores, waiting to go out to the midden. */
  husks = 0;
  /** The queen's body reserves (and food shared mouth to mouth), in seeds. */
  reserve = 120;
  failed = false;
  hadWorkers = false;
  readonly history: Sample[] = [];
  readonly share: Record<number, number> = {};
  readonly count: Record<number, number> = {};
  hungryLarvae = 0;
  /**
   * How far foragers walk out before searching (mm of path). It follows where
   * food was last found, and grows when searches come back empty: as the
   * seeds near the nest run out, the colony ranges further.
   */
  reach = 220;
  /** Larvae fed on insect since the start (protein meals). */
  proteinMeals = 0;
  /** Spore-grooming sessions and infections cleared by them. */
  groomings = 0;
  cured = 0;
  /** Damp seeds in the stores, and how many the colony wants carried up to dry now. */
  wetSeeds = 0;
  dryNeed = 0;
  /** Cause of the most recent worker death (the game-over card explains the end with it). */
  lastDeath = '';
  /** Nurses currently carrying food to the brood. */
  mealsCarried = 0;
  looseEggs = 0;
  starving = false;

  private need = 0;
  private hunger = 0;
  private starveTimer = 0;
  private eggTimer = TICK_HZ * 2;

  /** World width (cells), for indexing the brood map. */
  private readonly w: number;
  /**
   * Temperature the brood is kept at, °C: nurses carry brood to whichever
   * room is best (up into sun-warmed chambers by day, deeper at night and in
   * the heat), so this is the best temperature the nest offers right now.
   */
  broodTemp = 20;
  /** Temperature where most of the colony sits (food use and ageing). */
  nestTemp = 15;
  /** Id of the first worker (the nanitics are the handful after it). */
  firstWorkerId = 0;

  constructor(size: number, width: number) {
    this.w = width;
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
    this.broodCell[y * this.w + x] = b.id;
    if (!this.broodById.has(b.id)) {
      this.broodById.set(b.id, b);
      this.brood.push(b);
    }
  }

  liftBrood(b: Brood): void {
    const i = b.y * this.w + b.x;
    if (this.broodCell[i] === b.id) this.broodCell[i] = 0;
    b.carried = true;
  }

  private removeBrood(b: Brood): void {
    if (!b.carried) {
      const i = b.y * this.w + b.x;
      if (this.broodCell[i] === b.id) this.broodCell[i] = 0;
    }
    this.broodById.delete(b.id);
    b.stage = 2;
    b.age = -1;
  }

  feedings(b: Brood): number {
    // Sexuals are big: a young queen takes far more food than a worker.
    return TUNING.larvaFeedings + (b.major ? 2 : 0) + (b.sex === 1 ? 3 : b.sex === 2 ? 1 : 0);
  }

  isHungry(b: Brood): boolean {
    if (b.stage !== 1 || b.carried) return false;
    const req = this.feedings(b);
    return b.fed < req && b.age >= (b.fed / req) * TUNING.larvaTicks * 0.7;
  }

  feedLarvaNear(x: number, y: number, meals = 1): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.broodAt((y + dy) * this.w + x + dx);
        if (b && this.isHungry(b)) {
          b.fed = Math.min(this.feedings(b), b.fed + meals);
          if (meals > 1) this.proteinMeals++;
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
    // Development-ticks gained this tick: full speed only in the warmth.
    const rate = devRate(this.broodTemp);
    const adults = this.adults;
    let hungry = 0;
    let loose = 0;
    const dead: Brood[] = [];
    const world = sim.world;
    for (const b of this.brood) {
      b.age += rate;
      if (!b.carried) {
        const m = world.mat[b.y * this.w + b.x]!;
        // Grains that slid onto it (seed, chaff, loose soil): the nurses pull it out at once.
        if (POWDER[m]) {
          const spot = this.freeFloorNear(sim, b.x, b.y, 5);
          if (spot >= 0) {
            this.liftBrood(b);
            this.placeBrood(b, spot % this.w, (spot / this.w) | 0);
            continue;
          }
        }
        // Water in the room: the nurses carry brood to a dry spot (if there are nurses yet).
        if (m === WATER && adults > 0 && sim.rng.next() < 0.03) {
          const spot = this.freeFloorNear(sim, b.x, b.y - 3, 8);
          if (spot >= 0) {
            this.liftBrood(b);
            this.placeBrood(b, spot % this.w, (spot / this.w) | 0);
            continue;
          }
        }
        if (m === WATER || SOLID[m]) {
          // Flooded or buried brood dies unless the water drains in time.
          if (++b.wet > TICK_HZ * 60) {
            dead.push(b);
            this.deaths['brood drowned'] = (this.deaths['brood drowned'] ?? 0) + 1;
            continue;
          }
        } else if (b.wet > 0) b.wet--;
      }
      if (b.stage === 0) {
        if (b.age >= TUNING.eggTicks * sp) {
          b.stage = 1;
          b.age = 0;
          const majors = this.majors;
          b.major = adults > 20 && majors < adults * this.majorShare && sim.rng.chance(0.6);
        } else if (!b.carried && sim.nest.chamberAt(b.y * this.w + b.x)?.kind !== 'nursery') loose++;
      } else if (b.stage === 1) {
        const req = this.feedings(b);
        if (b.fed >= req && b.age >= TUNING.larvaTicks * sp * (b.sex ? 1.3 : 1)) {
          b.stage = 2;
          b.age = 0;
        } else if (b.age > TUNING.larvaTicks * 5 && !b.carried) {
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
      } else if (b.age >= TUNING.pupaTicks * sp * (b.sex ? 1.3 : 1) && !b.carried) {
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
    if (b.sex) {
      // A winged sexual: it stays in the nest until the flight next spring.
      const a = new Ant(b.sex === 1 ? 'gyne' : 'male', b.x, b.y, DAY_TICKS * 45, TUNING.workerSpeed * 0.9);
      a.wings = true;
      a.orient(sim, 0, 0);
      if (this.alates.length === 0) sim.events.push({ key: 'firstAlates' });
      this.alates.push(a);
      return;
    }
    const major = b.major;
    const [l0, l1] = major ? TUNING.soldierLife : TUNING.workerLife;
    const nanitic = this.born < 6;
    const life = sim.rng.int(l0, l1) * (nanitic ? 0.6 : 1);
    const ant = new Ant(major ? 'soldier' : 'worker', b.x, b.y, Math.round(life), major ? TUNING.soldierSpeed : TUNING.workerSpeed * sim.rng.range(0.9, 1.1));
    if (!this.firstWorkerId) this.firstWorkerId = ant.id;
    ant.orient(sim, 0, 0);
    ant.reevalAt = 0;
    this.ants.push(ant);
    this.born++;
    if (!this.hadWorkers) {
      this.hadWorkers = true;
      // The first daughter opens the sealed burrow.
      sim.nest.unseal();
      sim.nest.widenFoundingShaft();
    }
  }

  // ---------------------------------------------------------------- queen

  private lay(sim: Sim): void {
    const q = this.queen;
    if (!q || !q.alive || q.phase !== 2) return;
    // (She lays wherever she is, even if a slump has half-filled the royal chamber.)
    // No eggs through the winter rest, and few in the cold.
    if (sim.dormant) return;
    const warm = devRate(this.broodTemp);
    if (warm <= 0) return;
    this.eggTimer -= warm;
    if (this.eggTimer > 0) return;
    const adults = this.adults;
    const breedMult = [0.55, 1, 1.6][this.breeding]!;
    const cap = 10 + adults * TUNING.broodPerWorker * breedMult;
    // Food on hand: the granaries plus what the workers carry in their crops.
    const food = this.stored + this.reserve;
    const foodFactor = adults < 6 ? 0.8 : food < adults * 0.25 ? 2.6 : food < adults * 0.8 ? 1.4 : 1;
    const perWeek = (TUNING.eggsBase + adults * TUNING.eggsPerWorker) * breedMult;
    this.eggTimer = Math.round((DAY_TICKS / perWeek) * foodFactor * sim.rng.range(0.8, 1.2));
    if (this.brood.length >= cap) return;
    // From late August a big, well-fed colony raises winged young queens and males.
    const doy = sim.doy;
    const sexual = doy > 200 && doy < 275 && adults >= TUNING.alateMinWorkers && food >= adults && sim.rng.chance(0.3);
    // Don't lay into a famine: the larvae already hatched need feeding first.
    const larvae = this.brood.filter((b) => b.stage === 1).length;
    if (adults > 0 && this.stored + this.reserve * 0.5 < larvae * 1.5 + 3) return;
    if (adults === 0 && this.born === 0 && this.brood.length >= 8) return;
    const spot = this.freeFloorNear(sim, q.x, q.y, 6);
    if (spot < 0) return;
    const egg = new Brood(spot % this.w, (spot / this.w) | 0);
    if (sexual) egg.sex = sim.rng.chance(0.3) ? 1 : 2;
    this.placeBrood(egg, spot % this.w, (spot / this.w) | 0);
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
        if (!w.walk[i] || this.broodCell[i] || !SOLID[w.mat[i + w.w]!] || w.bg[i] !== 1 || w.mat[i] === WATER) continue;
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

  /** A forager found food this far (path mm) from the mouth. */
  foundAt(d: number): void {
    if (!(d < 5000)) return;
    this.reach = clamp(this.reach * 0.85 + d * 1.4 * 0.15, 160, 1150);
  }

  refreshStore(sim: Sim): void {
    const w = sim.world;
    this.storeCells.length = 0;
    let n = 0;
    let wet = 0;
    for (const c of sim.nest.chambers) {
      if (c.kind !== 'granary' && c.kind !== 'queen') continue;
      for (const i of c.cells) {
        const m = w.mat[i]!;
        if (m !== SEED && m !== FRUIT && m !== PREY) continue;
        n++;
        if (m === SEED && w.moist[i]! > 40) wet++;
        if (w.mat[i - w.w] === EMPTY) this.storeCells.push(i);
      }
    }
    this.stored = n;
    this.wetSeeds = wet;
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
        // Messor eat the kernel; the husk is set aside for the cleaners to carry out.
        w.set(i, EMPTY, w.tone[i], w.tint[i]);
        this.husks++;
      } else if (m === FRUIT || m === PREY) {
        // Worth two rations.
        w.set(i, EMPTY, w.tone[i], w.tint[i]);
        this.need = Math.max(0, this.need - 1);
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
    // Cold ants eat little: through the winter rest the stores last.
    const meta = metabolism(this.nestTemp);
    this.need += ((adults + this.alates.length * 1.5) / TUNING.adultSeedTicks + (this.queen?.alive ? 1 / TUNING.queenSeedTicks : 0)) * meta;
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
    need[Task.Dig] = nest.frontier.length > 0 ? 0.3 + Math.min(1, nest.pendingCells / (adults * 5 + 40)) : 0;
    // Hunger reorganises the colony: empty stores pull workers out to forage
    // and leave digging for later.
    // After rain, on a warm dry day, damp seed is carried up into the sun to
    // dry before it can sprout (Moggridge saw harvester ants do this in 1873).
    const sunny = !sim.raining && sim.cal.daylight(sim.dayT, sim.doy) > 0.3 && sim.surfaceT > 16 && sim.surfaceT < 40;
    this.dryNeed = sunny && !sim.dormant && this.adults > 3 ? Math.min(this.wetSeeds, Math.ceil(this.adults * 0.25)) : 0;
    const food = this.stored + this.reserve;
    // Stores are judged in weeks of eating (larvae included); from late summer
    // the colony lays in its winter granary, so it wants much more in hand.
    const larvae = this.brood.reduce((n, b) => n + (b.stage === 1 ? 1 : 0), 0);
    const weekly = (adults * DAY_TICKS) / TUNING.adultSeedTicks + larvae * 1.1 + 2;
    const stock = sim.doy > 200 && sim.doy < 300 ? 9 : 4;
    const shortage = clamp(1 - food / (weekly * stock), 0, 1);
    need[Task.Forage] = 0.3 + 0.9 * shortage + (this.starving ? 0.8 : 0);
    // Nobody goes out in the rain, the cold, or the midday heat of summer.
    need[Task.Forage] = need[Task.Forage]! * (0.08 + 0.92 * sim.forageWeather);
    if (sim.dormant) {
      // Winter rest: the colony clusters deep and waits.
      need[Task.Forage] = 0;
      need[Task.Dig] = need[Task.Dig]! * 0.05;
    } else if (this.nestTemp < 8) need[Task.Dig] = need[Task.Dig]! * 0.3;
    if (this.starving || food < adults * 0.3) need[Task.Dig] = need[Task.Dig]! * 0.35;
    // Nowhere left to put seed: fewer foragers, more diggers (the granary needs finishing).
    if (f[F.Gran] === 0 && this.adults > 4) {
      need[Task.Forage] = need[Task.Forage]! * 0.3;
      if (nest.frontier.length > 0) need[Task.Dig] = need[Task.Dig]! + 0.6;
    }
    need[Task.Nurse] = this.brood.length > 0 ? 0.12 + Math.min(1.2, (this.looseEggs + this.hungryLarvae * 1.5) / (adults * 0.15 + 2)) : 0;
    // Cleaning demand follows the loads waiting to go out (husk bundles, the dead),
    // not how much floor they happen to lie on.
    let loads = Math.ceil(this.husks / 3);
    // Only the dead inside the nest (the trash field ignores those already outside).
    for (const c of this.corpses) if (!c.carried && sim.world.bg[c.y * sim.world.w + c.x] === 1) loads++;
    if (loads === 0 && f[F.Trash]! > 0) loads = 1;
    need[Task.Clean] = loads > 0 ? 0.08 + Math.min(0.8, loads / (adults * 0.08 + 4)) : 0;
    need[Task.Idle] = sim.dormant ? 3 : 0.28;
    for (const wk of WORK) need[WORK_TASK[wk]] = need[WORK_TASK[wk]]! * PRIO_MULT[this.prio[wk]]!;
    let sum = 0;
    for (const t of TASKS) sum += need[t]!;
    for (const t of TASKS) this.share[t] = need[t]! / sum;
    for (const t of TASKS) this.count[t] = 0;
    for (const a of this.ants) this.count[a.task] = (this.count[a.task] ?? 0) + 1;
  }

  /**
   * Age polyethism, in weeks: young workers nurse, then dig and clean, and
   * the older ones go out to forage (a few weeks in). The first, tiny
   * workers (nanitics) skip the nursery and forage at once: the colony needs food.
   */
  private affinity(a: Ant, t: TaskKind): number {
    const wk = a.age / DAY_TICKS;
    const nanitic = a.id <= this.firstWorkerId + 8;
    let v = 0;
    switch (t) {
      case Task.Nurse: v = wk < 3 ? 1 : wk < 7 ? 0.3 : -0.5; break;
      case Task.Dig: v = wk > 1 && wk < 30 ? 0.6 : 0; break;
      case Task.Forage: v = wk > 6 || nanitic ? 1 : wk > 3 ? 0.2 : -0.6; break;
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

  /** An ant dies. `body`: what is left ('fungus' grows mould, 'none' was carried off by a predator). */
  kill(a: Ant, cause: string, body: 'plain' | 'fungus' | 'parasite' | 'none' = 'plain'): void {
    if (!a.alive) return;
    a.alive = false;
    a.deathCause = cause;
    this.lastDeath = cause;
    this.deaths[cause] = (this.deaths[cause] ?? 0) + 1;
    if (a.carryBrood) {
      this.placeBrood(a.carryBrood, a.x, a.y);
      a.carryBrood = null;
    }
    a.carry = Carry.None;
    if (body !== 'none') this.corpses.push({ x: a.x, y: a.y, carried: false, kind: body === 'plain' ? undefined : body });
  }

  /** Pick up a body lying here: false if none, else what killed it ('plain', 'fungus', 'parasite'). */
  takeCorpseAt(x: number, y: number): false | 'plain' | 'fungus' | 'parasite' {
    for (let k = 0; k < this.corpses.length; k++) {
      const c = this.corpses[k]!;
      if (!c.carried && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1) {
        this.corpses.splice(k, 1);
        return c.kind ?? 'plain';
      }
    }
    return false;
  }

  /**
   * Where workers pick up fungal spores: from the soil in warm, damp weeks
   * (diggers and foragers), and from a nestmate that died of a fungus and
   * still lies in the nest. Checked a few times an in-game hour.
   */
  private exposure(sim: Sim): void {
    const rng = sim.rng;
    const w = sim.world;
    const air = sim.cal.airMean(sim.doy);
    if (air > 14 && sim.recentRain(DAY_TICKS * 1.5) && this.ants.length > 0 && rng.chance(0.012 * Math.min(1, this.adults / 40))) {
      const a = this.ants[rng.int(0, this.ants.length - 1)]!;
      if (a.caste !== 'queen' && (a.task === Task.Dig || a.task === Task.Forage)) a.spores += rng.range(0.5, 0.9);
    }
    for (const c of this.corpses) {
      if (c.carried || c.kind !== 'fungus' || w.bg[c.y * w.w + c.x] !== 1) continue;
      for (const a of this.ants) if (Math.abs(a.x - c.x) <= 3 && Math.abs(a.y - c.y) <= 3) a.spores += 0.05;
    }
  }

  // ---------------------------------------------------------------- climate

  /** Where in the nest it is warmest for the brood, and how warm the colony is. */
  private temperatures(sim: Sim): void {
    const w = sim.world;
    let best = -99;
    let bestRate = -1;
    let deep = 0;
    let n = 0;
    const consider = (depth: number, bonus = 0): void => {
      const t = sim.soilT(depth) + bonus;
      const r = devRate(t);
      // Prefer the faster room; between equals, the one nearer 26 °C.
      if (r > bestRate + 1e-3 || (Math.abs(r - bestRate) <= 1e-3 && Math.abs(t - 26) < Math.abs(best - 26))) {
        bestRate = r;
        best = t;
      }
    };
    for (const c of sim.nest.chambers) {
      if (!c.ready) continue;
      const depth = c.floorY - w.ground[Math.round(c.cx)]!;
      // A flat stone over the room soaks up the sun and warms it (Messor nest under stones for this).
      consider(depth, sim.stoneWarmth(Math.round(c.cx), Math.round(c.cy)));
      deep += depth;
      n++;
    }
    if (n === 0) {
      const q = this.queen;
      const depth = q ? Math.max(5, q.y - w.ground[q.x]!) : 20;
      consider(depth);
      deep = depth;
      n = 1;
    }
    this.broodTemp = best;
    this.nestTemp = sim.soilT(deep / n);
  }

  // ---------------------------------------------------------------- tick

  tick(sim: Sim): void {
    // A colony with no workers left is over: the queen cannot raise brood again alone.
    if (this.failed) return;
    this.advanceBrood(sim);
    this.lay(sim);
    if (sim.tick % 30 === 0) {
      this.temperatures(sim);
      this.refreshStore(sim);
      this.updateDemand(sim);
    }
    if (sim.tick % 150 === 75) this.exposure(sim);
    this.consume(sim);
    if (this.queen?.alive) this.queen.tick(sim);
    // Who stands where, so ants that meet head-on can stop and touch antennae.
    const occ = this.occ ?? (this.occ = new Int32Array(sim.world.size));
    for (const i of this.occCells) occ[i] = 0;
    this.occCells.length = 0;
    let meals = 0;
    for (let k = 0; k < this.ants.length; k++) {
      const a = this.ants[k]!;
      const i = a.y * sim.world.w + a.x;
      occ[i] = k + 1;
      this.occCells.push(i);
      if (a.task === Task.Nurse && (a.carry === Carry.Seed || a.carry === Carry.Fruit || a.carry === Carry.Prey)) meals++;
    }
    this.mealsCarried = meals;
    for (let k = 0; k < this.ants.length; k++) {
      const a = this.ants[k]!;
      if (a.alive) a.tick(sim);
    }
    if (this.ants.some((a) => !a.alive)) {
      let j = 0;
      for (const a of this.ants) if (a.alive) this.ants[j++] = a;
      this.ants.length = j;
    }
    // Alates sit out the months in the nest; on the flight day they climb out and take off.
    for (const a of this.alates) if (a.alive) a.tick(sim);
    if (this.alates.some((a) => !a.alive || a.flown)) {
      let j = 0;
      for (const a of this.alates) if (a.alive && !a.flown) this.alates[j++] = a;
      this.alates.length = j;
    }
    if (this.hadWorkers && this.ants.length === 0 && !this.failed) this.failed = true;
    if (sim.tick % (TICK_HZ * 5) === 0) {
      this.history.push({ t: sim.tick, pop: this.ants.length, brood: this.brood.length, food: this.stored });
      if (this.history.length > 2000) this.history.splice(0, this.history.length - 2000);
    }
  }
}
