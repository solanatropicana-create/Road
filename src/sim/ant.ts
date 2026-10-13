import type { Sim } from './sim';
import { F, FAR } from './fields';
import { Carry, CarryKind, Task, TaskKind, Caste, holdsStores } from './types';
import { intruderNear } from './underground';
import type { Brood } from './brood';
import type { Neighbour } from './rivals';
import type { Carcass } from './carcass';
import { clamp } from '../util/math';
import { Nest } from './nest';
import {
  EMPTY, SOLID, HARDNESS, REFUSE, SEED, SEEDHEAD, FRUIT, SAND, WATER, LITTER, PREY, HUMUS,
} from '../world/mat';
import { PACKED, PLUG } from '../world/physics';
import { TUNING, TICK_HZ, DAY_TICKS } from '../config';
import { SPROUT } from '../world/moisture';

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

/** The load an ant takes from a food cell, and the cell it puts down again. */
const carryOf = (m: number): CarryKind => (m === FRUIT ? Carry.Fruit : m === PREY ? Carry.Prey : Carry.Seed);
const matOf = (c: CarryKind): number => (c === Carry.Fruit ? FRUIT : c === Carry.Prey ? PREY : SEED);
const isFood = (c: CarryKind): boolean => c === Carry.Seed || c === Carry.Fruit || c === Carry.Prey;
/** Seed is one ration; fruit pulp and a piece of insect are worth more. */
const rations = (c: CarryKind): number => (c === Carry.Seed ? 1 : 2);

/**
 * How likely a forager that walked off the slice comes back with a seed, by
 * month: the meadow beyond is the same steppe, seeding in the same season.
 */
const OFF_SLICE_YIELD = [0, 0, 0.05, 0.25, 0.5, 0.75, 0.8, 0.7, 0.55, 0.35, 0.1, 0];

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
  /** The carcass this worker is helping to drag, and one it found and is fetching help for. */
  haul: Carcass | null = null;
  recruiting: Carcass | null = null;
  /** Called out to a carcass (or leading the others back to the one it found). */
  bound: Carcass | null = null;
  /** Ticks spent heading for a carcass, and when to notice carcasses again after giving up on one. */
  private chase = 0;
  private noCarcassUntil = 0;
  /**
   * Temperament, 0..1. In real colonies a good share of the workers are
   * mostly inactive: a reserve that steps in when the colony is short-handed.
   * The same quiet ones fill the idle share here, day after day.
   */
  zeal = 0.75;
  /**
   * Ticks left of alarm (the scent of a fight, passed on from ant to ant).
   * Alarmed ants run, and if neighbours are attacking they turn out to defend.
   */
  alarm = 0;
  /**
   * Forager: cleared to go out (by a returning forager's touch, or to scout),
   * waiting at the gate for that now, and whether it has already passed on
   * the news of its own load.
   */
  sent = false;
  waiting = false;
  private tapped = false;
  /** The gate a load of spoil (or a damp seed) was carried out of. */
  private fromGate = 0;
  /** Times a nurse got to a larva with food and found it already fed. */
  private feedMiss = 0;
  /** This load of spoil goes off the slice (out of view), so only to just past the rim. */
  private offLoad = false;
  private search = 0;
  private lastDir = -1;
  /** Which way the last sideways step went (-1 / 1), kept through steps straight up or down. */
  private lastDX = 0;
  private stuck = 0;
  /** Steps walked on the surface with the current load. */
  private trip = 0;
  /** Ticks left foraging off the slice (out of view, in the meadow beyond). */
  away = 0;
  /** A worker of the neighbouring colony, or another founding queen: not one of ours. */
  rival = false;
  /** Which colony a rival worker belongs to. */
  rivalOf: Neighbour | null = null;
  foreign = false;
  /** Rival: 0 foraging, 1 carrying home, 2 backing off home, 3 raiding our stores, 4 off to the battle front. */
  rstate = 0;
  /** Ticks left boxing or fighting, and with whom. */
  fight = 0;
  foe: Ant | null = null;
  /** Paralysed by a spider's bite: it will not recover. Once the spider lets go, ticks since. */
  paralysed = false;
  venom = 0;
  /** Ticks left curled in the "C" posture that wards off a parasitoid fly. */
  cpose = 0;
  /** A phorid fly's egg is growing inside it: development left (ticks at full warmth). */
  parasite = 0;
  /** Fungal spores on the cuticle (0..1), how far an infection has gone (0..1), and resistance from small doses. */
  spores = 0;
  sick = 0;
  immune = 0;
  /** Carrying a damp seed up to dry in the sun (and how wet it is). */
  private drying = false;
  private carryWet = 0;
  /** Ticks left touching antennae with a nestmate met head-on, and when it may happen again. */
  meet = 0;
  private meetAgain = 0;
  /** Steps spent following a food scent, and when scents count again after giving up. */
  private sniffSteps = 0;
  private noSniffUntil = 0;
  /** Steps spent unable to find a way to the current target. */
  private lost = 0;
  private buried = 0;
  private drown = 0;
  /** Forager's chosen heading and how far to go before searching in earnest. */
  private fdir = 1;
  private fdist = 0;
  /** Where the forager came out of the nest (the walk out is measured from here). */
  private exitX = 0;
  /** Where and when a searching forager last made headway (to notice when it is stuck). */
  private stallX = 0;
  private stallY = 0;
  private stallT = 0;
  reevalAt = 0;
  alive = true;
  /** Why it died ('old age', 'starvation', 'drowned'), for the life card. */
  deathCause = '';
  wings = false;
  /** Founding queen: 0 landing, 1 digging her burrow, 2 settled. */
  phase = 2;
  /** An alate that has taken off on the nuptial flight (gone from the nest). */
  flown = false;
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
    // Ants age with their metabolism: slowly through the cold of winter.
    this.age += sim.agingRate;
    if (this.caste !== 'queen' && this.age >= this.life) {
      sim.colony.kill(this, 'old age');
      return;
    }
    if (this.away > 0) {
      if (--this.away === 0) this.comeBack(sim);
      return;
    }
    if (this.paralysed) {
      if (this.venom > 0 && ++this.venom > TICK_HZ * 25) sim.colony.kill(this, 'killed by a spider');
      return;
    }
    if (this.fight > 0) {
      // Boxing with forelegs (or fighting in earnest): the rival's side settles it.
      if (--this.fight === 0 && this.rival) this.rivalOf?.resolve(sim, this);
      return;
    }
    if (this.alarm > 0) this.alarm--;
    if (this.parasite > 0) {
      // The fly's larva feeds inside it; when it pupates, the ant dies.
      this.parasite -= sim.agingRate;
      if (this.parasite <= 0) {
        sim.colony.kill(this, 'parasitized by a fly', 'parasite');
        sim.noteYearly('parasitoidKills', this);
        return;
      }
    }
    if ((this.spores > 0 || this.sick > 0) && this.fungus(sim)) return;
    // Gripping a carcass with the others: it moves them (see Carcasses).
    if (this.haul) return;
    if (this.cpose > 0) {
      this.cpose--;
      return;
    }
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const m = w.mat[i]!;
    if (m === WATER) {
      this.swim(sim, i);
      return;
    }
    this.drown = 0;
    if (SOLID[m]) {
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
    if (this.meet > 0) {
      this.meet--;
      return;
    }
    if (this.caste !== 'queen' && sim.tick >= this.meetAgain && this.sick < 0.6 && this.greet(sim)) return;
    const slow = this.carry !== Carry.None ? TUNING.carryingSlowdown : 1;
    // Alarmed ants run.
    this.mv += this.speed * slow * (this.alarm > 0 ? 1.35 : 1);
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
    if (this.rival) {
      this.rivalThink(sim);
      return;
    }
    if (this.foreign) {
      this.foreignThink(sim);
      return;
    }
    if (this.caste === 'queen') {
      this.queenThink(sim);
      return;
    }
    if (this.caste === 'gyne' || this.caste === 'male') {
      this.alateThink(sim);
      return;
    }
    // Hopelessly lost with a load: let it go and rethink.
    if (this.lost > 240) this.discard(sim);
    // Dying of a fungus: out, and away from the others.
    if (this.sick > 0.6) {
      this.leaveToDie(sim);
      return;
    }
    // Something in the tunnels (a centipede, thief ants at a breach, a mole
    // cricket): whoever has caught the alarm and has her jaws free runs at it.
    if (this.alarm > 0 && this.carry === Carry.None && this.age > DAY_TICKS) {
      const foe = intruderNear(sim.critters.list, this.x, this.y, 40);
      if (foe) {
        this.approach(sim, foe.x, foe.y);
        return;
      }
    }
    // Neighbours attacking: foragers, idlers and majors turn out to defend.
    // Only those the alarm has reached turn out; it spreads from ant to ant.
    if (this.alarm > 0 && this.carry === Carry.None && this.task !== Task.Nurse && this.age > DAY_TICKS * 2) {
      const trouble = sim.trouble();
      if (trouble) {
        this.defend(sim, trouble);
        return;
      }
    }
    // Rain, cold or midday heat: anyone outside empty-handed heads for shelter.
    if (sim.forageWeather < 0.05 && this.carry === Carry.None && sim.world.bg[this.y * sim.world.w + this.x] === 0) {
      this.descend(sim, F.Rest);
      return;
    }
    // New jobs are taken up at home, never halfway through a trip outside.
    const home = sim.world.bg[this.y * sim.world.w + this.x] === 1;
    if (this.carry === Carry.None && ((home && sim.tick >= this.reevalAt) || this.lost > 120)) {
      this.lost = 0;
      sim.colony.assign(this, sim);
    }
    // A load in hand but no job for it (startled, or beaten off, halfway
    // through a trip): see the trip through first.
    if (this.task === Task.Idle && this.carry !== Carry.None) {
      if (this.carryBrood) this.task = Task.Nurse;
      else if (this.carry === Carry.Soil || this.carry === Carry.Refuse) this.task = Task.Dig;
      else if (this.carry === Carry.Corpse) this.task = Task.Clean;
      else if (isFood(this.carry)) this.task = Task.Forage;
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

  /**
   * Ants that meet head-on stop for a moment and touch antennae (and swap a
   * drop of food or a whiff of colony odour). Brief, and not too often, or the
   * shaft would jam.
   */
  private greet(sim: Sim): boolean {
    const occ = sim.colony.occ;
    if (!occ) return false;
    const w = sim.world;
    const ahead = (this.y + this.hy) * w.w + this.x + this.hx;
    const k = occ[ahead]!;
    if (!k) return false;
    const o = sim.colony.ants[k - 1];
    if (!o || o === this || !o.alive || o.meet > 0 || o.hx !== -this.hx || o.hy !== -this.hy) return false;
    this.meetAgain = sim.tick + TICK_HZ * 12;
    // A nestmate carrying spores gets groomed clean (and the groomer picks up a
    // small dose, which primes its own defences: social immunisation).
    const dirty = o.spores > 0.05 || this.spores > 0.05;
    if (!dirty && sim.rng.next() > 0.35) return false;
    const t = dirty ? sim.rng.int(25, 45) : sim.rng.int(9, 18);
    this.meet = t;
    o.meet = t;
    o.meetAgain = sim.tick + TICK_HZ * 12;
    if (dirty) {
      Ant.groom(this, o);
      Ant.groom(o, this);
      sim.colony.groomings++;
      if (o.sick > 0 || this.sick > 0) sim.noteYearly('grooming', this);
    }
    return true;
  }

  /** a grooms b. */
  private static groom(a: Ant, b: Ant): void {
    if (b.spores <= 0.05) return;
    const take = b.spores * 0.35;
    b.spores -= take;
    a.spores += take * 0.1;
    a.immune = Math.min(1, a.immune + take * 0.5);
  }

  /**
   * Fungal infection (Metarhizium, Beauveria): spores on the cuticle take hold
   * past a threshold; the infection kills within days unless nestmates groom
   * the spores off early. Near the end the sick worker leaves the nest to die
   * alone, away from her sisters. Returns true if the ant died.
   */
  private fungus(sim: Sim): boolean {
    // Self-grooming slowly clears spores.
    this.spores = Math.max(0, this.spores - 0.00005);
    if (this.sick > 0) {
      // Groomed clean before the fungus got through the cuticle: she recovers.
      if (this.sick < 0.3 && this.spores < 0.12) {
        this.sick = 0;
        sim.colony.cured++;
        return false;
      }
      this.sick += sim.agingRate / (DAY_TICKS * 0.55);
      if (this.sick >= 1) {
        sim.colony.kill(this, 'fungus', 'fungus');
        return true;
      }
    } else if (this.spores > 0.45 + this.immune * 0.35) {
      this.sick = 0.01;
      sim.noteYearly('fungus', this);
    }
    return false;
  }

  /** The sick worker walks out and away from the nest to die alone. */
  private leaveToDie(sim: Sim): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (this.carry !== Carry.None || this.carryBrood) this.discard(sim);
    if (w.bg[i] === 1) {
      this.descend(sim, F.Out);
      return;
    }
    sim.noteOnce('dyingAlone', this);
    const gate = sim.nest.gateNear(this.x);
    const away = Math.abs(this.x - gate);
    if (away > 160 || this.x < 4 || this.x > w.w - 5) {
      // Far enough: she stops and waits for the end.
      this.startAct(Act.Rest, -1, TICK_HZ * 20);
      return;
    }
    const side = Math.sign(this.x - gate) || 1;
    const fields = sim.fields;
    let bestK = -1;
    let bestS = -Infinity;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      const s = DX[k]! * side + (SOLID[w.mat[n + w.w]!] ? 0.4 : -0.6) + sim.rng.next() * 0.5;
      if (s > bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestK >= 0) this.moveTo(sim, bestK);
  }

  private moveTo(sim: Sim, k: number): void {
    this.x += DX[k]!;
    this.y += DY[k]!;
    this.lastDir = k;
    if (DX[k]) this.lastDX = DX[k]!;
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

  /** Caught in a flood: paddle toward air, preferably upward, or drown. */
  private swim(sim: Sim, i: number): void {
    const w = sim.world;
    if (++this.drown > TICK_HZ * 14) {
      sim.colony.kill(this, 'drowned');
      return;
    }
    if (this.drown % 4 !== 0) return;
    let best = -1;
    let bs = -Infinity;
    for (let k = 0; k < 8; k++) {
      const n = i + DY[k]! * w.w + DX[k]!;
      const m = w.mat[n]!;
      if (SOLID[m]) continue;
      const s = (m === EMPTY ? 10 : 0) - DY[k]! * 2 + sim.rng.next();
      if (s > bs) {
        bs = s;
        best = k;
      }
    }
    if (best >= 0) {
      this.x += DX[best]!;
      this.y += DY[best]!;
      this.step++;
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
      if (!Nest.diggable(w, n)) return;
      if (m === SEED || m === FRUIT || m === PREY || m === REFUSE) {
        // Clutter in a tunnel: seed goes to the granary, husks to the midden.
        // (A seed in undug soil was buried in the seed bank: a find.)
        if (m === SEED && w.bg[n] === 1 && !w.zone[n] && w.tint[n] === 0) sim.buriedSeed();
        if (m === PREY && w.tint[n] === 3) sim.noteOnce('foundNymph', this);
        this.carryTone = w.tone[n]!;
        const sprout = m === REFUSE && w.tint[n] === SPROUT;
        w.set(n, EMPTY, w.tone[n], w.tint[n]);
        if (m === REFUSE) {
          this.carry = Carry.Refuse;
          this.carryTint = sprout ? SPROUT : 0;
          this.dropDist = 0;
        } else {
          this.carry = carryOf(m);
          this.task = Task.Forage;
        }
        return;
      }
      // (Loose soil remembers only where it came from: not whether it was packed or a plug.)
      const src = m === SAND ? w.tint[n]! & 0x3f : m;
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
      if (this.task === Task.Forage && w.bg[n] === 0) {
        sim.colony.foundAt(sim.fields.dist[F.Entr]![n]!);
        // Which side of the mouth the harvest comes from (a second gate goes in that way).
        if (this.x < sim.nest.foundX) sim.colony.harvestLeft++;
        else sim.colony.harvestRight++;
      }
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
      } else if (m === FRUIT || m === PREY) {
        this.carry = carryOf(m);
        if (m === PREY) sim.noteYearly('preyIn', this);
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
    // Spoil goes round the gate it came out of.
    if (this.dropDist === 0) this.fromGate = sim.nest.gateNear(this.x);
    const ex = this.fromGate || sim.nest.foundX;
    if (this.dropDist === 0) {
      // Spoil lands past the crater rim, thinning out over a hand's width: a low, wide ring.
      // Most of that ring lies in front of or behind the slice: those loads are
      // set down just past the rim, out of view, not carried along the slice.
      this.offLoad = !refuse && sim.rng.next() < TUNING.spoilOffSlice;
      this.dropDist = refuse ? sim.rng.int(34, 70) : this.offLoad ? sim.rng.int(9, 22) : Math.round(12 + Math.pow(sim.rng.next(), 1.5) * 110);
      // Spoil goes down whichever side of the crater the ant came up on
      // (crossing the pit with a load is not worth it).
      const side = Math.sign(this.x - ex) || (sim.rng.chance(0.5) ? -1 : 1);
      this.dumpDir = refuse ? sim.colony.middenSide : side;
      this.stuck = 0;
      this.trip = 0;
    }
    // Hopelessly lost on the surface with a load: drop it and go back to work.
    if (++this.trip > 900) {
      this.discard(sim);
      return;
    }
    // Sent to the far side but can't get across the crater: use this side instead.
    if (Math.sign(this.x - ex) === -this.dumpDir && this.stuck > 40) {
      this.dumpDir = -this.dumpDir;
      this.stuck = 0;
    }
    const away = Math.abs(this.x - ex);
    // Keep the mound low and wide: walk on over the heap rather than piling it higher.
    // The allowed height falls off gently from the crater and rises as the nest
    // grows, so all the spoil fits in one broad, low cone (as real Messor mounds).
    const heap = w.ground[this.x]! - this.y;
    // A crater ring a centimetre or so high at its rim, thinning out over a hand's width.
    const rim = Math.min(TUNING.moundMax, 2 + Math.sqrt(sim.nest.openCells) * 0.14);
    const maxHeap = Math.max(1.5, rim - away * 0.12);
    // The chaff pile stays a low drift too (wind takes most of it; see Sim.settleSpoil).
    const cap = refuse ? Math.min(maxHeap, TUNING.middenMax) : maxHeap;
    if (!this.offLoad && heap > cap && away >= this.dropDist && this.stuck < 200 && this.x > 4 && this.x < w.w - 5) this.dropDist = away + 3;
    const canDrop = !w.plan[i] && this.grounded(sim, i) && Math.sign(this.x - ex) !== -this.dumpDir;
    if ((canDrop && (away >= this.dropDist || this.stuck > 90)) || (!w.plan[i] && this.stuck > 200)) {
      // Let go: the load becomes a grain on the ground here.
      if (refuse) {
        // Chaff, like spoil, mostly goes to the part of the ring off the slice.
        // (Sprouted seeds are set down on the heap, where some take root: the ant garden.)
        const sprout = this.carry === Carry.Refuse && this.carryTint === SPROUT;
        if (this.carry !== Carry.Corpse && !sprout && sim.rng.next() < TUNING.spoilOffSlice) sim.chaffPuff(i);
        else w.set(i, REFUSE, this.carry === Carry.Corpse ? sim.rng.int(0, 25) : sim.rng.int(140, 255), sprout ? SPROUT : 0);
      } else if (this.offLoad) {
        // Spread off the slice (out of view): only a puff of dust shows here.
        sim.dust(i, this.carryTint & 0x3f);
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
    let anyGround = false;
    for (let k = 0; k < 8; k++) {
      if (fields.canStep(i, k) && w.bg[i + fields.off[k]!] === 0 && this.grounded(sim, i + fields.off[k]!)) anyGround = true;
    }
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      // Loaded ants keep to the ground; plants only if there's no other way.
      if (anyGround && !this.grounded(sim, n)) continue;
      let s = DX[k]! * this.dumpDir * 2 + sim.rng.next() * 0.8;
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
      // Climbing over the heap counts as progress; only backing off or shuffling doesn't.
      if (Math.abs(this.x - ex) < before || (Math.abs(this.x - ex) === before && DY[bestK]! >= 0)) this.stuck++;
    } else {
      this.stuck++;
      this.wander(sim);
    }
  }

  /** Give up on the current load: spoil gets tamped into the wall, food shared out. */
  private discard(sim: Sim): void {
    if (this.carry === Carry.Corpse) sim.colony.corpses.push({ x: this.x, y: this.y, carried: false });
    else if (isFood(this.carry)) sim.colony.reserve += rations(this.carry);
    if (this.carryBrood) {
      sim.colony.placeBrood(this.carryBrood, this.x, this.y);
      this.carryBrood = null;
    }
    this.carry = Carry.None;
    this.drying = false;
    this.lost = 0;
    this.dropDist = 0;
    this.trip = 0;
    this.stuck = 0;
    this.reevalAt = 0;
  }

  private doDig(sim: Sim): void {
    if (this.carry === Carry.Soil || this.carry === Carry.Refuse) {
      this.dump(sim, this.carry === Carry.Refuse);
      return;
    }
    const r = this.descend(sim, F.Dig);
    if (r === Step.Arrived) {
      const cell = this.findAdjacent(sim, (n) => Nest.diggable(sim.world, n), true);
      if (cell >= 0) {
        const h = HARDNESS[sim.world.mat[cell]!]! || 1;
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
    if (m !== SEED && m !== FRUIT && m !== PREY) return false;
    // Seeds already in a store are not "found" food.
    const c = sim.nest.chamberAt(n);
    return !c || !holdsStores(c.kind);
  }

  private doForage(sim: Sim): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (this.drying) {
      this.carryOutToDry(sim);
      return;
    }
    // Damp seed in the stores: take some up into the sun first.
    if (this.carry === Carry.None && w.bg[i] === 1 && sim.colony.dryNeed > 0) {
      this.fetchWetSeed(sim);
      return;
    }
    if (isFood(this.carry)) {
      // A rich find (fruit, an insect) is worth a stronger trail: recruit help.
      if (w.bg[i] === 0) sim.layTrail(i, this.carry === Carry.Seed ? 1 : 2.5);
      // Back in through the gate with a load: the foragers waiting there take
      // the cue and go out (harvester ants regulate foraging this way: the
      // quicker loads come in, the more foragers leave).
      else if (!this.tapped && sim.fields.dist[F.Entr]![i]! <= 12) {
        this.tapped = true;
        sim.colony.forageReturn(sim, this, this.carry === Carry.Seed ? 3 : 4);
      }
      this.fdist = 0;
      // Into a granary if one has room; otherwise straight into the shared crops
      // of the workers by the queen (trophallaxis), no pile.
      const gran = sim.fields.dist[F.Gran]!;
      const useGran = sim.fields.sourceCount[F.Gran]! > 0 && (gran[i] !== FAR || w.bg[i] === 0);
      const r = this.descend(sim, useGran ? F.Gran : F.Royal);
      if (r === Step.Arrived && (!useGran || SOLID[w.mat[i + w.w]!])) {
        if (useGran) {
          w.set(i, matOf(this.carry), this.carryTone, 0);
          this.stepAside(sim);
        } else {
          sim.colony.reserve += rations(this.carry);
        }
        this.carry = Carry.None;
        this.tapped = false;
        this.delivered++;
        sim.colony.delivered++;
        this.reevalAt = Math.min(this.reevalAt, sim.tick + TICK_HZ * 4);
      } else if (this.lost > 150) {
        this.discard(sim);
      }
      return;
    }
    if (this.carry !== Carry.None) {
      this.carry = Carry.None;
      return;
    }
    if (w.bg[i] === 1) {
      this.fdist = 0;
      // (In the rain, the cold or the midday heat everyone waits.)
      if (!this.sent || sim.forageWeather < 0.05) {
        // Wait just inside the gate until a forager comes back with a load,
        // or (now and then) go out to scout on one's own.
        const d = sim.fields.dist[F.Entr]![i]!;
        if (d <= 14) {
          if (sim.rng.next() < sim.colony.scoutChance) this.sent = true;
          else {
            this.waiting = true;
            if (d < 4) this.descend(sim, F.Royal);
            else if (sim.rng.next() < 0.04) this.wander(sim, true);
            return;
          }
        }
      }
      this.waiting = false;
      this.descend(sim, F.Out);
      return;
    }
    this.waiting = false;
    // Found something too heavy: back to the gate for help, laying a strong trail.
    if (this.recruiting) {
      const d = sim.fields.dist[F.Entr]![i]!;
      sim.layTrail(i, 3);
      if (d <= 3 || d === FAR || !this.recruiting.pieces) {
        // Stir up the foragers at the gate (and idlers near it), then lead them back.
        sim.colony.forageReturn(sim, this, 6, this.recruiting);
        sim.noteOnce('recruitHeavy', this);
        this.bound = this.recruiting;
        this.recruiting = null;
        this.sent = true;
        this.fdist = 0;
      } else this.descend(sim, F.Entr);
      return;
    }
    // Called out to a carcass: straight there.
    if (this.bound && (this.bound.pieces <= 0 || !sim.carcasses.list.includes(this.bound))) this.bound = null;
    // A carcass close by (or the one we were called to): go and take hold.
    // (One it cannot get at, up on a heap or past a clod, it gives up on for a while.)
    const cc = sim.tick < this.noCarcassUntil ? null : this.bound && !this.bound.full ? this.bound : sim.carcasses.near(this.x, this.y, 14);
    if (cc && ++this.chase > TICK_HZ * 20) {
      this.chase = 0;
      this.bound = null;
      this.noCarcassUntil = sim.tick + TICK_HZ * 40;
    } else if (cc) {
      if (cc.reach(this)) {
        // Too heavy for the finder alone: most go back for help first.
        // (A small colony has nobody to spare at the gate: the finder cuts it up instead.)
        if (cc.carriers.length === 0 && cc.weight > 1.5 && !cc.atGate && sim.colony.adults >= 18 && sim.rng.chance(0.65)) {
          this.recruiting = cc;
          return;
        }
        sim.carcasses.join(this, cc);
        this.bound = null;
        this.chase = 0;
        return;
      }
      this.toward(sim, Math.round(cc.x), false);
      return;
    }
    this.chase = 0;
    this.bound = null;
    if (this.fdist === 0) {
      // Just out of the nest: pick a heading and how far to walk before searching.
      // Out on the side of the crater she climbed: the mouth between the two
      // rims is a hole she would have to cross to go the other way.
      const side = Math.sign(this.x - sim.nest.gateNear(this.x));
      this.fdir = side !== 0 ? side : sim.rng.chance(0.5) ? -1 : 1;
      this.fdist = sim.rng.int(30, Math.round(sim.colony.reach));
      this.exitX = this.x;
    }
    const food = this.findAdjacent(sim, (n) => this.isForageFood(sim, n));
    if (food >= 0) {
      this.startAct(Act.Pick, food, 10 + sim.rng.int(0, 8));
      this.sniffSteps = 0;
      return;
    }
    // (The walk out to the search area doesn't count against the search.)
    if (++this.search > TUNING.forageGiveUpTicks * this.speed + this.fdist / this.speed) {
      this.search = 0;
      // Nothing out there: the colony's scouts range further next time.
      sim.colony.reach = Math.min(sim.world.w * 0.9, sim.colony.reach * 1.05);
      // Came back empty-handed: next time, wait for word at the gate.
      this.sent = false;
      this.task = Task.Idle;
      this.reevalAt = sim.tick + TICK_HZ * 20;
      return;
    }
    this.searchStep(sim, i);
  }

  /** Go to the granary and pick up a damp seed. */
  private fetchWetSeed(sim: Sim): void {
    const w = sim.world;
    const r = this.descend(sim, F.Store);
    if (r === Step.Moved) return;
    const cell = r === Step.Arrived ? this.findAdjacent(sim, (n) => w.mat[n] === SEED && w.moist[n]! > 40 && !!sim.nest.chamberAt(n)) : -1;
    if (cell < 0) {
      // Someone got the last of them: back to foraging.
      sim.colony.dryNeed = Math.max(0, sim.colony.dryNeed - 1);
      this.wander(sim, true);
      return;
    }
    this.carry = Carry.Seed;
    this.carryTone = w.tone[cell]!;
    this.carryWet = w.moist[cell]!;
    w.set(cell, EMPTY, w.tone[cell], w.tint[cell]);
    w.moist[cell] = 0;
    this.drying = true;
    this.dropDist = 0;
    this.trip = 0;
    sim.colony.dryNeed = Math.max(0, sim.colony.dryNeed - 1);
    sim.noteYearly('dryingSeeds', this);
  }

  /** Carry a damp seed up and lay it out in the sun on the mound (foragers fetch it back once dry). */
  private carryOutToDry(sim: Sim): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (this.carry !== Carry.Seed) {
      this.drying = false;
      return;
    }
    if (w.bg[i] === 1) {
      this.descend(sim, F.Out);
      if (this.lost > 150) this.discard(sim);
      return;
    }
    if (this.dropDist === 0) {
      this.dropDist = sim.rng.int(14, 40);
      this.fromGate = sim.nest.gateNear(this.x);
    }
    const ex = this.fromGate || sim.nest.foundX;
    if (Math.abs(this.x - ex) >= this.dropDist && !w.plan[i] && this.grounded(sim, i) && w.mat[i] === EMPTY) {
      w.set(i, SEED, this.carryTone, 0);
      sim.physics.moisture.add(i, this.carryWet);
      this.carry = Carry.None;
      this.drying = false;
      this.dropDist = 0;
      this.stepAside(sim);
      return;
    }
    if (++this.trip > 600) {
      this.discard(sim);
      this.drying = false;
      return;
    }
    // Walk away from the mouth along the ground.
    const fields = sim.fields;
    let bestK = -1;
    let bestS = -Infinity;
    const side = Math.sign(this.x - ex) || 1;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      const s = DX[k]! * side + (SOLID[w.mat[n + w.w]!] ? 0.5 : -0.5) + sim.rng.next() * 0.6;
      if (s > bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestK >= 0) this.moveTo(sim, bestK);
    else this.wander(sim);
  }

  /** Turn out against the neighbours: to the granary when they raid it, to the front in a battle. */
  private defend(sim: Sim, nb: Neighbour): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const x = nb.alarmX(sim);
    if (nb.raid > 0) {
      if (w.bg[i] === 0 && sim.fields.dist[F.Entr]![i]! > 12) this.descend(sim, F.Entr);
      else if (this.descend(sim, sim.fields.sourceCount[F.Store]! > 0 ? F.Store : F.Royal) !== Step.Moved) this.wander(sim, true);
      return;
    }
    if (w.bg[i] === 1 && w.mat[i - w.w] !== EMPTY) {
      this.descend(sim, F.Out);
      return;
    }
    if (Math.abs(this.x - x) > 20) this.toward(sim, x, false);
    else this.wander(sim);
  }

  /** One step through the tunnels toward a point (an intruder), crowding in once there. */
  private approach(sim: Sim, tx: number, ty: number): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const fields = sim.fields;
    if (Math.abs(this.x - tx) + Math.abs(this.y - ty) <= 2) {
      this.wander(sim, true);
      return;
    }
    let bestK = -1;
    let bestS = Infinity;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      const s = Math.hypot((n % w.w) - tx, ((n / w.w) | 0) - ty) + sim.rng.next() * 0.8;
      if (s < bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestK >= 0) this.moveTo(sim, bestK);
    else this.wander(sim, true);
  }

  /** One step along the ground toward column tx (into tunnels only if allowed). */
  private toward(sim: Sim, tx: number, under: boolean): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const fields = sim.fields;
    const dir = Math.sign(tx - this.x) || 1;
    let bestK = -1;
    let bestS = -Infinity;
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (!under && w.bg[n] === 1 && w.mat[n - w.w] !== EMPTY) continue;
      const s = DX[k]! * dir + (SOLID[w.mat[n + w.w]!] ? 0.4 : -0.6) + (k === this.lastDir ? 0.3 : 0) + sim.rng.next() * 0.5;
      if (s > bestS) {
        bestS = s;
        bestK = k;
      }
    }
    if (bestK >= 0) this.moveTo(sim, bestK);
    else this.wander(sim);
  }

  /** Put down whatever it carries, here. */
  dropLoad(sim: Sim): void {
    const w = sim.world;
    const i = this.y * w.w + this.x;
    if (isFood(this.carry) && w.mat[i] === EMPTY) w.set(i, matOf(this.carry), this.carryTone, 0);
    this.carry = Carry.None;
  }

  /**
   * A forager of the neighbouring colony on our slice: in from its edge to
   * glean seed, home again with it; or raiding our granary; or off to battle.
   */
  private rivalThink(sim: Sim): void {
    const nb = this.rivalOf;
    if (!nb || nb.dead) {
      this.alive = false;
      return;
    }
    const w = sim.world;
    const i = this.y * w.w + this.x;
    const edge = nb.home(sim);
    const inNest = w.bg[i] === 1 && w.mat[i - w.w] !== EMPTY;
    if (this.carry !== Carry.None) this.rstate = 1;
    switch (this.rstate) {
      case 0: {
        if (nb.war > 0) this.rstate = 4;
        else if (nb.raid > 0) this.rstate = 3;
        if (this.rstate !== 0) return;
        // A carcass: take hold and pull it toward home.
        const cc = sim.tick < this.noCarcassUntil ? null : sim.carcasses.near(this.x, this.y, 12);
        if (cc && !cc.atGate) {
          if (cc.reach(this)) {
            sim.carcasses.join(this, cc);
            this.chase = 0;
          } else if (++this.chase > TICK_HZ * 20) {
            this.chase = 0;
            this.noCarcassUntil = sim.tick + TICK_HZ * 40;
          } else this.toward(sim, Math.round(cc.x), false);
          return;
        }
        const food = this.findAdjacent(sim, (n) => w.bg[n] === 0 && this.isForageFood(sim, n));
        if (food >= 0) {
          this.startAct(Act.Pick, food, 10 + sim.rng.int(0, 8));
          return;
        }
        if (this.fdist === 0) {
          this.fdist = sim.rng.int(Math.min(30, nb.reach), Math.max(31, nb.reach));
          this.fdir = nb.young ? (this.hx < 0 ? -1 : 1) : -nb.side;
        }
        const k = sim.tick >= this.noSniffUntil ? this.sniff(sim, i) : -1;
        if (k >= 0) {
          if (++this.sniffSteps > 25) {
            this.sniffSteps = 0;
            this.noSniffUntil = sim.tick + TICK_HZ * 20;
          }
          this.moveTo(sim, k);
        } else if (Math.abs(this.x - edge) < this.fdist) this.toward(sim, clamp(edge + this.fdir * 1000, 1, w.w - 2), false);
        else this.toward(sim, this.x + (sim.rng.chance(0.5) ? -30 : 30), false);
        if (++this.search > TICK_HZ * 70) this.rstate = 2;
        return;
      }
      case 3: {
        if (nb.raid === 0) {
          this.rstate = 2;
          return;
        }
        if (!inNest && sim.fields.dist[F.Entr]![i]! > 3) {
          this.descend(sim, F.Entr);
          return;
        }
        const r = this.descend(sim, F.Store);
        if (r === Step.Moved) return;
        const cell = this.findAdjacent(sim, (n) => {
          const m = w.mat[n];
          if (m !== SEED && m !== FRUIT) return false;
          const c = sim.nest.chamberAt(n);
          return !!c && holdsStores(c.kind);
        });
        if (cell >= 0) {
          this.carry = carryOf(w.mat[cell]!);
          this.carryTone = w.tone[cell]!;
          w.set(cell, EMPTY, w.tone[cell], w.tint[cell]);
          nb.stolen++;
          this.rstate = 1;
        } else if (r === Step.Failed || sim.rng.chance(0.02)) this.rstate = 2;
        else this.wander(sim, true);
        return;
      }
      case 4: {
        if (nb.war === 0) {
          this.rstate = 2;
          return;
        }
        if (Math.abs(this.x - nb.front) > 22) this.toward(sim, nb.front, false);
        else this.wander(sim);
        return;
      }
      default: {
        // Home: out of our nest first if it is inside, then to its edge.
        if (inNest) {
          this.descend(sim, F.Out);
          return;
        }
        if (Math.abs(this.x - edge) <= (nb.young ? 3 : 2)) {
          nb.arrive(this);
          return;
        }
        this.toward(sim, edge, false);
      }
    }
  }

  /**
   * Another young queen from the same flight: she sheds her wings, digs a
   * short burrow and seals herself in. Almost none of them make it.
   */
  private foreignThink(sim: Sim): void {
    const w = sim.world;
    if (this.phase === 0) {
      if (this.age < TICK_HZ * 4) return;
      this.wings = false;
      sim.shedWings(this.x, this.y);
      this.phase = 1;
      this.fdist = sim.rng.int(14, 28);
      this.startAct(Act.Rest, -1, TICK_HZ * 2);
      return;
    }
    if (this.phase === 1) {
      const depth = this.y - w.ground[this.x]!;
      if (depth >= this.fdist) {
        // Shut in: a plug of soil over her head.
        const top = w.ground[this.x]! * w.w + this.x;
        for (const c of [top, top + 1]) if (w.mat[c] === EMPTY) w.set(c, SAND, sim.rng.int(80, 200), HUMUS | PACKED | PLUG);
        this.phase = 2;
        return;
      }
      const below = (this.y + 1) * w.w + this.x;
      for (const c of [below, below + 1]) {
        const m = w.mat[c]!;
        if (HARDNESS[m] && m !== SAND) w.set(c, EMPTY, w.tone[c], m);
        else if (SOLID[m] && !HARDNESS[m]) {
          // Stone or root in the way: she settles where she is.
          this.fdist = depth;
        }
      }
      if (w.mat[below] === EMPTY) this.y++;
      this.startAct(Act.Rest, -1, TICK_HZ);
    }
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
      if (!fields.canStep(i, k) || w.bg[i + fields.off[k]!] === 1) continue;
      const d = Math.abs(tx - x0 - DX[k]!) + Math.abs(ty - y0 - DY[k]!);
      if (d < bdist) {
        bdist = d;
        bk = k;
      }
    }
    return bk;
  }

  /**
   * Back from the meadow beyond the slice: with a seed if the season gave
   * one. (Out there the forager risks lizards, birds and spiders.)
   */
  private comeBack(sim: Sim): void {
    if (sim.rng.chance(0.012)) {
      sim.colony.kill(this, 'lost foraging');
      return;
    }
    const yieldP = OFF_SLICE_YIELD[sim.cal.month(sim.doy)]! * (sim.raining ? 0.3 : 1);
    if (sim.rng.chance(yieldP)) {
      this.carry = Carry.Seed;
      this.carryTone = sim.seedToneFromMix();
    } else {
      this.task = Task.Idle;
      this.reevalAt = 0;
    }
    this.search = 0;
    this.fdist = 0;
  }

  /** Random search that keeps its heading, biased by trail pheromone, outward from the nest, mostly on the ground. */
  private searchStep(sim: Sim, i: number): void {
    const w0 = sim.world;
    // The trail runs on past the edge of the slice: the forager goes on into the meadow beyond.
    if ((this.x <= 2 || this.x >= w0.w - 3) && w0.bg[i] === 0 && this.carry === Carry.None && sim.forageWeather > 0.3) {
      this.away = sim.rng.int(TICK_HZ * 30, TICK_HZ * 100);
      return;
    }
    // A scent that leads nowhere (seed on a stem cut off or buried under spoil)
    // is given up on for a while, or the whole forage force would crowd round it.
    const k0 = sim.tick >= this.noSniffUntil ? this.sniff(sim, i) : -1;
    if (k0 >= 0) {
      if (++this.sniffSteps > 25) {
        this.sniffSteps = 0;
        this.noSniffUntil = sim.tick + TICK_HZ * 20;
      }
      this.moveTo(sim, k0);
      return;
    }
    const w = sim.world;
    const fields = sim.fields;
    const entr = fields.dist[F.Entr]!;
    const here = entr[i]!;
    // Going nowhere (a wall, a gap, a hollow in the spoil): turn round.
    if (Math.abs(this.x - this.stallX) + Math.abs(this.y - this.stallY) > 3) {
      this.stallX = this.x;
      this.stallY = this.y;
      this.stallT = sim.tick;
    } else if (sim.tick - this.stallT > TICK_HZ * 2.5) {
      this.fdir = -this.fdir;
      this.lastDX = -this.lastDX;
      this.stallT = sim.tick;
    }
    // Heading out: walk the chosen way (along a trail if there is one) until far
    // enough from the gate she left by, then search the area. Measured from that
    // gate, not from home in general: with two gates the ground between them is
    // as far from home as it gets, and a forager walking "away from home" would
    // stop there and go round in circles. Trails are followed by direction, not
    // by peak: all trails meet at the mouth, so their strongest scent is at home.
    const outbound = here !== FAR && Math.abs(this.x - this.exitX) < this.fdist;
    let trailOut = false;
    if (outbound) {
      for (let k = 0; k < 8; k++) {
        const n = i + fields.off[k]!;
        if (DX[k] === this.fdir && sim.pher[n]! > 0.3) trailOut = true;
      }
    }
    let total = 0;
    // An open nest cell underfoot is a hole (a mouth still being dug), not a stem:
    // a searcher there climbs back out rather than clinging on above it.
    const hole = (c: number): boolean => w.mat[c] === EMPTY && w.bg[c] === 1;
    const climbing = !SOLID[w.mat[i + w.w]!] && !hole(i + w.w);
    const weights = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 8; k++) {
      if (!fields.canStep(i, k)) continue;
      const n = i + fields.off[k]!;
      if (w.bg[n] === 1) continue;
      const v = entr[n]!;
      const outward = v !== FAR && here !== FAR && v > here;
      const inward = v !== FAR && here !== FAR && v < here;
      const p = sim.pher[n]!;
      let s = 0.15;
      if (outbound) {
        const ahead = DX[k] === this.fdir;
        s *= ahead ? 2 : DX[k] === -this.fdir ? 0.08 : 0.6;
        if (ahead) s += p * 3;
        if (!trailOut) s *= ahead ? 3 : 1;
      } else {
        s *= outward ? 1.1 : inward ? 0.75 : 1;
        s += p * (outward ? 1.5 : 0.4);
      }
      // Searching, a forager keeps on the way it is going: Messor search in
      // fairly straight runs with now and then a turn. The same step again is
      // favoured, other steps the same way (over a bump) less so, and turning
      // back is rare. Straight up or down keeps the old weight, so climbing
      // stems stays the exception.
      if (outbound) {
        if (k === this.lastDir) s *= 2;
      } else if (DX[k]! * this.lastDX < 0) s *= 0.04;
      else if (k === this.lastDir) s *= DX[k] ? 4 : 2;
      else if (DX[k] === this.lastDX) s *= 1.6;
      // Harvesters mostly glean fallen seed; climbing stems is the exception,
      // and a forager up a stem with nothing in reach climbs back down.
      if (hole(n + w.w)) s *= DY[k]! > 0 ? 0.05 : 1;
      else if (!SOLID[w.mat[n + w.w]!]) s *= DY[k]! < 0 ? 0.25 : 0.6;
      if (climbing) s *= DY[k]! > 0 ? 3 : DY[k]! < 0 ? 0.3 : 1;
      else if (hole(i + w.w)) s *= DY[k]! < 0 ? 4 : 1;
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
    if (isFood(this.carry)) {
      const r = this.descend(sim, F.Larva);
      if (r === Step.Arrived) {
        // Insect is what larvae grow on: a piece counts as a double meal.
        if (col.feedLarvaNear(this.x, this.y, this.carry === Carry.Prey ? 2 : 1)) {
          this.carry = Carry.None;
          this.feedMiss = 0;
        } else if (++this.feedMiss > 30) {
          // Whoever was hungry here has been fed by now: share it out mouth to mouth.
          col.reserve++;
          this.carry = Carry.None;
          this.feedMiss = 0;
        } else this.wander(sim, true);
      } else if (r === Step.Failed && sim.fields.sourceCount[F.Larva] === 0) {
        // No one hungry any more: share it out mouth to mouth (it was already
        // harvested once, so it doesn't count as a new delivery).
        col.reserve++;
        this.carry = Carry.None;
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
    // Fetch food only while the hungry outnumber the meals already on their way.
    // (When stores run low the workers eat first; the larvae wait.)
    const feedMore = col.hungryLarvae > col.mealsCarried && col.foodForBrood;
    if (feedMore && f[F.Larva]! > 0 && f[F.Store]! === 0 && col.reserve > 0) {
      // No stores yet: take food from the shared crops by the queen.
      if (this.descend(sim, F.Royal) === Step.Arrived) {
        col.reserve--;
        this.carry = Carry.Seed;
        this.carryTone = sim.rng.int(0, 255);
      }
      return;
    }
    if (feedMore && f[F.Larva]! > 0 && f[F.Store]! > 0) {
      if (this.descend(sim, F.Store) === Step.Arrived) {
        const cell = this.findAdjacent(sim, (n) => {
          const m = w.mat[n]!;
          if (m !== SEED && m !== FRUIT && m !== PREY) return false;
          const c = sim.nest.chamberAt(n);
          return !!c && holdsStores(c.kind);
        });
        if (cell >= 0) {
          this.carry = carryOf(w.mat[cell]!);
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
      const body = col.takeCorpseAt(this.x, this.y);
      if (body) {
        this.carry = Carry.Corpse;
        // Carrying out a body grown over with mould is risky work.
        if (body === 'fungus') this.spores += 0.15;
        this.dropDist = 0;
        return;
      }
      const cell = this.findAdjacent(sim, (n) => w.mat[n] === REFUSE && w.bg[n] === 1);
      const room = sim.nest.chamberAt(i);
      if (cell >= 0) {
        this.carry = Carry.Refuse;
        this.carryTone = w.tone[cell]!;
        this.carryTint = w.tint[cell] === SPROUT ? SPROUT : 0;
        w.set(cell, EMPTY, w.tone[cell], w.tint[cell]);
        this.dropDist = 0;
      } else if (col.husks > 0 && room && holdsStores(room.kind)) {
        // Chaff goes out in bundles: a few husks to a trip.
        col.husks -= Math.min(3, col.husks);
        this.carry = Carry.Refuse;
        this.carryTone = sim.rng.int(150, 255);
        this.carryTint = 0;
        this.dropDist = 0;
      } else {
        // Someone got here first: look for other work rather than loiter.
        if (col.husks === 0) this.reevalAt = 0;
        this.wander(sim, w.bg[i] === 1);
      }
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

  // ---------------------------------------------------------------- alates

  /**
   * A winged young queen or male: rests with the colony until the flight,
   * then climbs out of the crater and takes off from the surface.
   */
  private alateThink(sim: Sim): void {
    const w = sim.world;
    if (sim.flight) {
      const outside = w.bg[this.y * w.w + this.x] === 0;
      if (outside && w.walk[this.y * w.w + this.x] && sim.rng.next() < 0.08) {
        this.flown = true;
        sim.takeOff(this);
        return;
      }
      if (this.descend(sim, F.Out) !== Step.Moved) this.wander(sim);
      return;
    }
    this.doIdle(sim);
  }

  // ---------------------------------------------------------------- queen

  private queenThink(sim: Sim): void {
    const w = sim.world;
    if (this.phase === 0) {
      // She comes down out of her mating flight, settles a moment, then tears off the wings.
      if (this.age < TICK_HZ * 3) return;
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
        // Claustral founding: she shuts herself in until her first daughters open the door.
        sim.nest.seal();
        sim.events.push({ key: 'sealedIn' });
        return;
      }
      const r = this.descend(sim, F.Dig);
      if (r === Step.Arrived) {
        const cell = this.findAdjacent(sim, (n) => Nest.diggable(w, n), true);
        if (cell >= 0) this.startAct(Act.Dig, cell, TUNING.digTicks[HARDNESS[w.mat[cell]!]! || 1]! * 0.3);
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
}

