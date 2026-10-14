import type { Sim } from './sim';
import { Ant } from './ant';
import { Brood, Corpse } from './brood';
import type { Carcass } from './carcass';
import { Carry, Task, TaskKind, Work, WORK, ChamberKind, holdsStores } from './types';
import { F } from './fields';
import { TUNING, TICK_HZ, DAY_TICKS } from '../config';
import { devRate, metabolism } from './calendar';
import { EMPTY, SEED, FRUIT, SOLID, WATER, POWDER, PREY, SAND, SOIL } from '../world/mat';
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
  /**
   * Chance per tick that a forager waiting at the gate goes out on its own,
   * to scout: higher when the colony is short of food, so a hungry colony
   * keeps looking even when nobody brings anything in.
   */
  scoutChance = 0.002;
  /** Loads brought in through the gates lately (decays over a minute or so). */
  returns = 0;
  /**
   * Seed coming in, per week (a running average over the last week or two).
   * The queen's laying follows it: a colony raises only the brood its
   * harvest can feed, not whatever the stores would stretch to for a month.
   */
  income = 0;
  private lastDelivered = 0;

  /**
   * A forager comes in through the gate with a load and taps the foragers
   * waiting there: up to n of them go out.
   */
  forageReturn(sim: Sim, a: Ant, n: number, carcass: Carcass | null = null): void {
    this.returns += 1;
    const occ = this.occ;
    if (!occ) return;
    const W = sim.world.w;
    // News of a carcass stirs a wider circle, idlers too.
    const r = carcass ? 8 : 4;
    let sent = 0;
    for (let dy = -r; dy <= r && sent < n; dy++) {
      for (let dx = -r; dx <= r && sent < n; dx++) {
        const k = occ[(a.y + dy) * W + a.x + dx];
        if (!k) continue;
        const o = this.ants[k - 1];
        if (!o || o === a || o.carry !== Carry.None || o.haul) continue;
        const idle = carcass && o.task === Task.Idle && o.age > DAY_TICKS * 2;
        if (!(o.waiting && !o.sent) && !idle) continue;
        if (idle) o.task = Task.Forage;
        o.sent = true;
        o.bound = carcass;
        sent++;
      }
    }
  }

  /**
   * Alarm pheromone: an ant that has met the enemy alarms the nestmates it
   * runs into, and they the next ones, weaker at each step. A raid sends a
   * wave through the nest from the gate inward; a scuffle out on the meadow
   * alarms hardly anyone.
   */
  private spreadAlarm(sim: Sim): void {
    const occ = this.occ;
    if (!occ) return;
    const W = sim.world.w;
    const strong = TICK_HZ * 12;
    for (const a of this.ants) {
      if (a.alarm < strong || !a.alive) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const k = occ[(a.y + dy) * W + a.x + dx];
          if (!k) continue;
          const o = this.ants[k - 1];
          if (!o || o === a || o.alarm >= a.alarm - TICK_HZ * 4 || sim.rng.next() > 0.5) continue;
          o.alarm = a.alarm - TICK_HZ * 4;
        }
      }
    }
  }

  /** Loads picked up on each side of the mouth (a second gate goes in toward the richer side). */
  harvestLeft = 0;
  harvestRight = 0;
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
  /**
   * Development rate (0..1) in each finished room right now, by chamber id:
   * brood grows at the temperature of the room it lies in, so where the
   * nurses keep it matters. The best nursery's rate is kept too.
   */
  roomRate: Record<number, number> = {};
  bestNurseryRate = 0;
  /** Rate for brood lying outside any room (a tunnel, the founding burrow). */
  private looseRate = 0.5;
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

  /** Brood taken away whole (stolen, eaten by an intruder or in a famine): gone from the nest. */
  takeBrood(b: Brood, cause: string): void {
    this.removeBrood(b);
    const k = this.brood.indexOf(b);
    if (k >= 0) this.brood.splice(k, 1);
    this.deaths[cause] = (this.deaths[cause] ?? 0) + 1;
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

  /** Seed to spare for the larvae: the workers eat first when stores run low. */
  get foodForBrood(): boolean {
    return this.stored + this.reserve > this.adults * 0.6 + 2;
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
    // Development-ticks gained this tick: full speed only in the warmth, at
    // the temperature of the room each one lies in.
    const best = devRate(this.broodTemp);
    const adults = this.adults;
    let hungry = 0;
    let loose = 0;
    const dead: Brood[] = [];
    const world = sim.world;
    for (const b of this.brood) {
      if (b.carried) b.age += best;
      else {
        const room = sim.nest.chamberAt(b.y * this.w + b.x);
        b.age += room ? (this.roomRate[room.id] ?? best) : this.looseRate;
      }
      if (!b.carried) {
        // Set down on top of another (its carrier died, a lost load): it would
        // lie hidden under that one, never fed. Move it alongside.
        const at = b.y * this.w + b.x;
        if (this.broodCell[at] !== b.id) {
          if (this.broodCell[at] === 0) this.broodCell[at] = b.id;
          else {
            const spot = this.freeFloorNear(sim, b.x, b.y, 6);
            if (spot >= 0) this.placeBrood(b, spot % this.w, (spot / this.w) | 0);
          }
        }
        const m = world.mat[b.y * this.w + b.x]!;
        // Grains that slid onto it (seed, chaff, loose soil): the nurses pull it out at once.
        // (Not from under a deep fall: that has to be dug away first.)
        if (POWDER[m] && !(m === SAND && world.mat[at - this.w] === SAND && world.mat[at - 2 * this.w] === SAND)) {
          // (Out of a seed cache that has buried the queen's floor: a little further off.)
          let spot = this.freeFloorNear(sim, b.x, b.y, 5);
          if (spot < 0 && m !== SAND) spot = this.freeFloorNear(sim, b.x, b.y, 12);
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
          // Flooded or buried brood dies unless the water drains, or the nurses dig it out, in time.
          const fall = m === SAND || SOIL[m];
          if (fall) sim.ground.cry(-b.id, b.x, b.y, sim.tick);
          if (++b.wet > TICK_HZ * 60) {
            dead.push(b);
            const cause = fall ? 'brood buried' : m === WATER ? 'brood drowned' : 'brood smothered';
            if (fall) sim.ground.freed(-b.id, false);
            this.deaths[cause] = (this.deaths[cause] ?? 0) + 1;
            continue;
          }
        } else if (b.wet > 0) b.wet--;
      }
      if (b.stage === 0) {
        if (b.age >= TUNING.eggTicks * sp) {
          b.stage = 1;
          b.age = 0;
          // Count the majors already on their way (larvae and pupae), not only the adults,
          // or a burst of brood overshoots the share.
          let majors = this.majors;
          for (const o of this.brood) if (o.major && o.stage > 0) majors++;
          b.major = adults > 20 && majors < (adults + this.brood.length * 0.5) * this.majorShare && sim.rng.chance(0.6);
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
    ant.nanitic = nanitic && !major;
    ant.orient(sim, 0, 0);
    ant.reevalAt = 0;
    // About one in four is one of the quiet ones.
    ant.zeal = sim.rng.chance(0.25) ? sim.rng.range(0.1, 0.35) : sim.rng.range(0.55, 1);
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
    const doy = sim.doy;
    // From late August a big, well-fed colony raises winged young queens and males.
    const sexual = doy > 200 && doy < 275 && adults >= TUNING.alateMinWorkers && food >= adults && sim.rng.chance(0.3);
    // Don't lay into a famine: the larvae already hatched (and the eggs about
    // to hatch) need feeding first, and the workers must eat too.
    let larvae = 0;
    let eggs = 0;
    for (const b of this.brood) {
      if (b.stage === 1) larvae++;
      else if (b.stage === 0) eggs++;
    }
    if (adults > 0 && this.stored + this.reserve * 0.5 < (larvae + eggs * 0.7) * 1.5 + adults * 0.4 + 3) return;
    // Look ahead: the brood already in the nest will soon be workers that eat.
    // Lay only while the stores, topped up by the harvest, would feed that
    // bigger colony for some weeks (fewer on High breeding, more on Low).
    if (adults >= 8 && this.runway(larvae, eggs) < [12, 7, 4][this.breeding]!) return;
    // From June the queen lays with the winter in mind: the stores, and what
    // the harvest should still bring in before it ends, must see the colony
    // and all the brood that will hatch into it through to spring.
    if (adults > 0 && doy > 150) {
      let pupae = 0;
      for (const b of this.brood) if (b.stage === 2) pupae++;
      const weeksLeft = Math.max(0, (280 - doy) / 7);
      const heads = adults + pupae + larvae + eggs + this.alates.length * 1.5;
      // At what the slice can feed: the harvest no longer keeps up with the
      // workers already here, so more of them would only eat the winter store.
      // (While it does, each new worker brings in more than she eats.)
      const upkeep = adults * (DAY_TICKS / TUNING.adultSeedTicks) * metabolism(this.nestTemp);
      if (this.income * 0.8 < upkeep) return;
      if (this.stored + this.reserve + this.income * weeksLeft * 0.5 < heads * 4) return;
      // From late June what is laid is paid for out of the winter's food: the
      // stores in hand and some of what the rest of the harvest (to early
      // September) should bring in. A head needs about a seed and a half to
      // see out the winter rest, and as much again for the spring before the
      // first seed is ripe (measured: 0.11 a head a week asleep, 30 weeks).
      // (Too many mouths all the same: see winterCull.)
      if (doy > 175 && this.stored + this.reserve + this.income * Math.max(0, (250 - doy) / 7) * 0.4 < heads * 3.4) return;
    }
    // An established colony stops raising brood at the end of summer (what is
    // laid now would only eat into the winter store); a young one keeps going.
    if (doy > 244 && adults >= 30) return;
    if (adults === 0 && this.born === 0 && this.brood.length >= 8) return;
    const spot = this.freeFloorNear(sim, q.x, q.y, 6);
    if (spot < 0) return;
    const egg = new Brood(spot % this.w, (spot / this.w) | 0);
    if (sexual) egg.sex = sim.rng.chance(0.3) ? 1 : 2;
    this.placeBrood(egg, spot % this.w, (spot / this.w) | 0);
  }

  /**
   * Weeks the food on hand would last the colony as it will be once today's
   * brood has hatched, net of what the foragers bring in (Infinity if the
   * harvest covers it).
   */
  runway(larvae: number, eggs: number): number {
    let pupae = 0;
    for (const b of this.brood) if (b.stage === 2) pupae++;
    const meta = metabolism(this.nestTemp);
    const perAdult = (DAY_TICKS / TUNING.adultSeedTicks) * meta;
    const heads = this.adults + pupae + larvae * 0.9 + eggs * 0.8 + this.alates.length * 1.5;
    // (Today's eggs are next month's larvae: they will want feeding too.)
    const use = heads * perAdult + (larvae + eggs * 0.8) * 0.9 + (this.queen?.alive ? (DAY_TICKS / TUNING.queenSeedTicks) * meta : 0);
    const net = use - this.income * 0.85;
    return net <= 0 ? Infinity : (this.stored + this.reserve) / net;
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
      if (!holdsStores(c.kind)) continue;
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
    // Cold ants eat little, and in the winter rest (diapause) less again:
    // that is what lets the autumn's stores last until spring.
    const meta = metabolism(this.nestTemp) * (sim.dormant ? 0.5 : 1);
    this.need += ((adults + this.alates.length * 1.5) / TUNING.adultSeedTicks + (this.queen?.alive ? 1 / TUNING.queenSeedTicks : 0)) * meta;
    while (this.need >= 1) {
      this.need -= 1;
      if (this.eatOne(sim)) this.hunger = Math.max(0, this.hunger - 0.5);
      // Early on the queen feeds her daughters from her own fat (trophic eggs).
      else if (this.reserve > 0) this.reserve--;
      // Famine: the nurses eat eggs, then the youngest larvae, before any worker starves.
      else if (this.eatBrood(sim)) this.hunger = Math.max(0, this.hunger - 0.5);
      else this.hunger++;
    }
    this.starving = this.hunger > 1;
    if (this.hunger > 1) {
      if (++this.starveTimer >= TUNING.starveTicks / (1 + this.hunger * 0.15)) {
        this.starveTimer = 0;
        this.hunger = Math.max(0, this.hunger - 2);
        // Whoever has least left in her crop; not always the old foragers,
        // or a hungry colony would lose the very ants that bring food home.
        const victim = this.ants.length ? this.ants[sim.rng.int(0, this.ants.length - 1)]! : null;
        if (victim) this.kill(victim, 'starvation');
      }
    } else this.starveTimer = 0;
  }

  /**
   * Before the winter, a colony that has more mouths than its stores will
   * carry through eats some of its youngest brood (ants do: brood is the
   * colony's reserve of protein). Once a day from late August to the winter
   * rest, while stores are short: eggs first, then the smallest larvae.
   */
  private winterCull(sim: Sim): void {
    const doy = sim.doy;
    if (sim.dormant || doy < 232 || doy > 305 || this.adults < 30) return;
    let eggs = 0;
    let larvae = 0;
    let pupae = 0;
    for (const b of this.brood) {
      if (b.stage === 0) eggs++;
      else if (b.stage === 1) larvae++;
      else pupae++;
    }
    const heads = this.adults + pupae + larvae + eggs * 0.8 + this.alates.length * 1.5;
    const food = this.stored + this.reserve;
    if (food >= heads * 2.6) return;
    const n = Math.max(1, Math.round((eggs + larvae) * 0.06));
    for (let k = 0; k < n; k++) {
      let pick: Brood | null = null;
      for (const b of this.brood) {
        if (b.carried || b.stage === 2 || b.sex) continue;
        if (!pick || b.stage < pick.stage || (b.stage === pick.stage && b.age < pick.age)) pick = b;
      }
      if (!pick) return;
      this.takeBrood(pick, 'brood eaten before winter');
      // What it had been fed comes back to the nurses' crops.
      this.reserve += pick.stage === 1 ? 1 : 0.3;
      sim.noteYearly('winterCull', { x: pick.x, y: pick.y });
    }
  }

  /** Eat an egg, or failing that the youngest larva. False if there is no brood to eat. */
  private eatBrood(sim: Sim): boolean {
    let pick: Brood | null = null;
    for (const b of this.brood) {
      if (b.carried || b.stage === 2 || b.sex) continue;
      if (!pick || b.stage < pick.stage || (b.stage === pick.stage && b.age < pick.age)) pick = b;
    }
    if (!pick) return false;
    this.takeBrood(pick, 'brood eaten in famine');
    sim.noteYearly('famineBrood', { x: pick.x, y: pick.y });
    return true;
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
    // Scouts: a hungry colony sends more out on their own; loads coming in do the rest.
    this.scoutChance = 0.0018 + 0.008 * shortage + (this.starving ? 0.012 : 0);
    this.returns *= 0.97;
    // Nobody goes out in the rain, the cold, or the midday heat of summer.
    need[Task.Forage] = need[Task.Forage]! * (0.08 + 0.92 * sim.forageWeather);
    if (sim.dormant) {
      // Winter rest: the colony clusters deep and waits.
      need[Task.Forage] = 0;
      need[Task.Dig] = need[Task.Dig]! * 0.05;
    } else if (this.nestTemp < 8) need[Task.Dig] = need[Task.Dig]! * 0.3;
    if (this.starving || food < adults * 0.3) need[Task.Dig] = need[Task.Dig]! * 0.35;
    // Every granary full: fewer foragers, more diggers (the next one needs finishing).
    // (With no granary yet, seed goes into the shared crops by the queen.)
    const granaries = nest.chambers.some((c) => c.kind === 'granary' && c.ready);
    if (granaries && f[F.Gran] === 0 && this.adults > 4) {
      need[Task.Forage] = need[Task.Forage]! * 0.3;
      if (nest.frontier.length > 0) need[Task.Dig] = need[Task.Dig]! + 0.6;
    }
    // A nestmate or brood buried alive under a fall: diggers drop everything to dig it out.
    if (nest.rescuing) need[Task.Dig] = need[Task.Dig]! + 1.2;
    // A roof cracking: a few diggers go to shore it up.
    else if (sim.ground.strained > 0 && !sim.dormant) need[Task.Dig] = need[Task.Dig]! + Math.min(0.5, 0.2 * sim.ground.strained);
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
      // The quiet ones take the idle places first; the keen ones the work.
      const lazy = 1 - (a.zeal ?? 0.75);
      const temper = t === Task.Idle ? lazy * 0.25 : -lazy * 0.04;
      const s = this.share[t]! - this.count[t]! / adults + this.affinity(a, t) * 0.16 + temper + sim.rng.next() * 0.1;
      if (s > bestS) {
        bestS = s;
        best = t;
      }
    }
    if (best !== a.task) {
      a.sent = false;
      a.waiting = false;
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
    let nurseryBest = -1;
    for (const c of sim.nest.chambers) {
      if (!c.ready) continue;
      const depth = c.floorY - w.ground[Math.round(c.cx)]!;
      // A flat stone over the room soaks up the sun and warms it (Messor nest under stones for this).
      const warm = sim.stoneWarmth(Math.round(c.cx), Math.round(c.cy));
      consider(depth, warm);
      const r = devRate(sim.soilT(depth) + warm);
      this.roomRate[c.id] = r;
      // (Only a nursery with room counts: a full warm one is no place to carry brood to.)
      if (c.kind === 'nursery' && c.floor.some((i) => !this.broodCell[i])) nurseryBest = Math.max(nurseryBest, r);
      deep += depth;
      n++;
    }
    const q = this.queen;
    const qDepth = q ? Math.max(5, q.y - w.ground[q.x]!) : 20;
    this.looseRate = devRate(sim.soilT(qDepth));
    if (n === 0) {
      consider(qDepth);
      deep = qDepth;
      n = 1;
    }
    this.bestNurseryRate = nurseryBest;
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
    // The harvest rate, sampled every twelfth of a week (not through the winter rest).
    if (sim.tick % Math.round(DAY_TICKS / 12) === 0) {
      const rate = (this.delivered - this.lastDelivered) * 12;
      this.lastDelivered = this.delivered;
      if (!sim.dormant) this.income = this.income * 0.94 + rate * 0.06;
    }
    this.consume(sim);
    if (sim.tick % Math.round(DAY_TICKS / 7) === 41) this.winterCull(sim);
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
      if (a.task === Task.Nurse && !a.returning && (a.carry === Carry.Seed || a.carry === Carry.Fruit || a.carry === Carry.Prey)) meals++;
    }
    this.mealsCarried = meals;
    if (sim.tick % 5 === 0) this.spreadAlarm(sim);
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
    // The founding queen dead before her first daughters hatched: that is the end of it.
    if (!this.hadWorkers && this.queen && !this.queen.alive && !this.failed) this.failed = true;
    if (sim.tick % (TICK_HZ * 5) === 0) {
      this.history.push({ t: sim.tick, pop: this.ants.length, brood: this.brood.length, food: this.stored });
      if (this.history.length > 2000) this.history.splice(0, this.history.length - 2000);
    }
  }
}
