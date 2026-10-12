import type { Sim } from './sim';
import { Ant } from './ant';
import { TUNING, TICK_HZ, DAY_TICKS } from '../config';
import { EMPTY, SOLID, WOOD, SAND, LOAM } from '../world/mat';
import { clamp } from '../util/math';
import { Task } from './types';

/**
 * The neighbours. Harvester-ant colonies live a few metres apart and their
 * foraging grounds overlap. Encounters between workers are mostly ritual:
 * the two box with their forelegs and the loser backs off. Now and then,
 * mostly on humid days after rain, it turns into a real battle with dead
 * on both sides; and a much stronger colony may rob a weaker one's granary,
 * the only documented thieves of a Messor store being other ants.
 *
 * Most maps have an old colony somewhere beyond one edge of the slice. Its
 * foragers range wider week by week and reach our ground only some time
 * after we settle; we learn of them when one of ours first runs into one.
 * And now and then one of the other queens of our own spring flight
 * survives her claustral weeks: her first daughters open the burrow and a
 * second, young colony grows on the same slice.
 */
export class Neighbour {
  /** Which edge their nest lies beyond: -1 left, +1 right; 0 for a young colony on our slice. */
  readonly side: number;
  /** A young colony's entrance (column) and its queen, one of the spring's foundresses. */
  homeX = 0;
  queen: Ant | null = null;
  /** How many workers their colony has. */
  workers: number;
  /** Their workers on our slice now. */
  readonly ants: Ant[] = [];
  /** Week their foragers first push onto our ground (they forage where the seed is, and find us in time). */
  arriveWeek: number;
  /** How far onto our slice their foragers range now, mm. */
  reach = 60;
  /** We know of them: one of ours has seen one of theirs (or their door). */
  found = false;
  /** Gone: a young colony wiped out. */
  dead = false;
  /** Ticks left of a battle, and where the front is. */
  war = 0;
  front = 0;
  /** Ticks left of a raid on our stores, and seeds taken in it. */
  raid = 0;
  stolen = 0;
  /** Dead on each side in the current battle and in all. */
  warDead = { ours: 0, theirs: 0 };
  killed = { ours: 0, theirs: 0 };
  /** Seeds they carried off our slice (harvest we did not get). */
  harvested = 0;
  /** Week of the last battle or raid (they don't come every week), and of the last growth step. */
  private lastTrouble = -99;
  private lastWeek = -1;
  /**
   * Seed they may still carry off our slice this week. A colony forages in
   * proportion to its workforce, and an old neighbour's foragers mostly work
   * their own side of the meadow: only a trickle of its harvest is ours.
   */
  private budget = 0;

  constructor(side: number, workers: number, arriveWeek: number) {
    this.side = side;
    this.workers = workers;
    this.arriveWeek = arriveWeek;
  }

  get young(): boolean {
    return this.side === 0;
  }

  /** Where their foragers come in from and go home to. */
  home(sim: Sim): number {
    if (this.side === 0) return this.homeX;
    return this.side < 0 ? 2 : sim.world.w - 3;
  }

  /** Their foragers are on our ground by now. */
  arrived(sim: Sim): boolean {
    return sim.simDays >= this.arriveWeek;
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

  step(sim: Sim): void {
    const col = sim.colony;
    if (!this.found && sim.tick % 15 === 0) this.lookedAt(sim);
    if (this.war > 0 && --this.war === 0) this.endWar(sim);
    if (this.raid > 0 && --this.raid === 0) this.endRaid(sim);
    if (sim.tick % 30 === 0) this.spawn(sim);
    for (const a of this.ants) if (a.alive) a.tick(sim);
    // Meetings with our workers: boxing, or a real fight.
    const occ = col.occ;
    if (occ && sim.tick % 2 === 0) {
      const w = sim.world;
      for (const r of this.ants) {
        if (!r.alive || r.fight > 0 || r.paralysed) continue;
        for (let dy = -1; dy <= 1 && r.fight === 0; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const k = occ[(r.y + dy) * w.w + r.x + dx];
            if (!k) continue;
            const o = col.ants[k - 1];
            if (!o || !o.alive || o.fight > 0 || o.paralysed || o.away || o.caste === 'queen') continue;
            const inside = w.bg[r.y * w.w + r.x] === 1 && w.mat[(r.y - 1) * w.w + r.x] !== EMPTY;
            // Out on the meadow most pass each other with a touch of the antennae.
            if (!sim.rng.chance(this.war > 0 || inside ? 0.6 : 0.06)) continue;
            const t = this.war > 0 ? sim.rng.int(TICK_HZ, TICK_HZ * 3) : sim.rng.int(TICK_HZ * 2, TICK_HZ * 5);
            r.fight = t;
            o.fight = t;
            r.foe = o;
            o.foe = r;
            break;
          }
        }
      }
    }
    if (this.ants.some((a) => !a.alive)) {
      let j = 0;
      for (const a of this.ants) if (a.alive) this.ants[j++] = a;
      this.ants.length = j;
    }
  }

  /**
   * First contact: one of ours sees one of theirs (or, for a young colony,
   * comes upon its door). The ground was known; the strangers on it were not.
   */
  private lookedAt(sim: Sim): void {
    const fog = sim.fog;
    const w = sim.world;
    let at: Ant | null = null;
    for (const a of this.ants) {
      if (a.alive && fog.sees(a.x, a.y)) {
        at = a;
        break;
      }
    }
    const door = this.young && fog.sees(this.homeX, w.ground[this.homeX]! - 1);
    if (!at && !door) return;
    this.found = true;
    const x = at ? at.x : this.homeX;
    const y = at ? at.y : w.ground[this.homeX]! - 1;
    const key = this.young ? 'youngColony' : this.side < 0 ? 'neighbourMetL' : 'neighbourMetR';
    sim.events.push({ key, x, y });
  }

  /** How many of their foragers should be on our slice now. */
  private want(sim: Sim): number {
    if (sim.dormant || sim.raining || !this.arrived(sim)) return 0;
    if (this.war > 0) return clamp(Math.round(this.workers / 25), 8, 34);
    // A young colony sends out most of its few workers; an old one only a trickle reaches us.
    const base = (this.young ? clamp(this.workers / 5, 1, 10) : clamp(this.workers / 180, 1, 7)) * sim.forageWeather;
    return Math.round(this.raid > 0 ? base + 8 : base);
  }

  private spawn(sim: Sim): void {
    if (this.ants.length >= this.want(sim)) return;
    // This week's harvest is in: only battles and raids bring more of them.
    if (this.war === 0 && this.raid === 0 && !(this.budget > 0)) return;
    const w = sim.world;
    const dir = this.young ? (sim.rng.chance(0.5) ? -1 : 1) : -this.side;
    // A young colony's workers come up beside the hole (the shaft itself drops to the queen).
    const x = this.young ? clamp(this.homeX + (dir < 0 ? -2 : 3), 2, w.w - 3) : this.home(sim);
    const y = this.top(sim, x);
    if (w.mat[(y + 1) * w.w + x] === WOOD) return;
    const major = !this.young && sim.rng.chance(this.war > 0 ? 0.3 : 0.08);
    const a = new Ant(major ? 'soldier' : 'worker', x, y, Number.MAX_SAFE_INTEGER, major ? TUNING.soldierSpeed : TUNING.workerSpeed);
    a.rival = true;
    a.rivalOf = this;
    a.rstate = this.war > 0 ? 4 : this.raid > 0 ? 3 : 0;
    a.orient(sim, dir, 0);
    this.ants.push(a);
  }

  /** A rival made it back off the slice. */
  arrive(a: Ant): void {
    if (a.carry) {
      this.harvested++;
      this.budget--;
    }
    a.alive = false;
  }

  /**
   * A bout between one of theirs (r) and one of ours ends. Most are ritual:
   * nobody is hurt and the weaker backs off. In a battle, or inside our nest,
   * one of them is killed. Majors, with their big heads, usually win.
   */
  resolve(sim: Sim, r: Ant): void {
    const o = r.foe;
    r.foe = null;
    if (!o || !o.alive) return;
    o.foe = null;
    o.fight = 0;
    const rng = sim.rng;
    const w = sim.world;
    const inside = w.bg[r.y * w.w + r.x] === 1 && w.mat[(r.y - 1) * w.w + r.x] !== EMPTY;
    const so = o.caste === 'soldier' ? 2.4 : 1;
    const sr = r.caste === 'soldier' ? 2.4 : 1;
    const theyLose = rng.next() < so / (so + sr);
    // A bout on the open meadow almost never ends in a death; in a battle, or an intruder in the nest, often.
    const deadly = this.war > 0 ? 0.55 : inside ? 0.35 : 0.03;
    if (rng.next() < deadly) {
      if (theyLose) this.killRival(sim, r);
      else {
        sim.colony.kill(o, 'killed by neighbours');
        this.killed.ours++;
        if (this.war > 0) this.warDead.ours++;
      }
    } else if (theyLose) {
      // Beaten off: it drops what it carries and heads home.
      if (r.carry) r.dropLoad(sim);
      r.rstate = 2;
    } else if (o.carry === 0) {
      // Ours backs off and keeps clear for a while (with a load, it just goes on with its trip).
      o.task = Task.Idle;
      o.reevalAt = sim.tick + TICK_HZ * 8;
    }
    if (this.war === 0) sim.noteYearly('ritualFight', r);
  }

  killRival(sim: Sim, r: Ant): void {
    if (!r.alive) return;
    if (r.carry) r.dropLoad(sim);
    r.alive = false;
    // The body lies where it fell (our cleaners or scavengers deal with it).
    sim.colony.corpses.push({ x: r.x, y: r.y, carried: false });
    this.killed.theirs++;
    if (this.war > 0) this.warDead.theirs++;
  }

  /** A few times an in-game hour: the neighbours' year, and trouble. */
  season(sim: Sim): void {
    const doy = sim.doy;
    const col = sim.colony;
    const rng = sim.rng;
    const week = Math.floor(sim.simDays);
    if (week !== this.lastWeek) {
      this.lastWeek = week;
      if (!sim.dormant) {
        // An old colony is near its meadow's limit; a young one grows like ours did.
        this.workers = this.young ? Math.min(3000, this.workers * rng.range(1.04, 1.09) + 0.3) : Math.min(3000, this.workers * 1.012);
      }
      this.budget = this.young ? Math.min(90, this.workers * 1.2) : clamp(this.workers * 0.015, 5, 25);
      // Week by week their foragers range further onto our ground.
      const since = Math.max(0, sim.simDays - this.arriveWeek);
      this.reach = this.young ? Math.min(420, 40 + this.workers * 3 + since * 6) : Math.min(560, 70 + since * 40);
    }
    if (this.young) {
      this.youngYear(sim);
      return;
    }
    if (!sim.nest.founded || !this.found || this.war > 0 || this.raid > 0 || week - this.lastTrouble < 3) return;
    const air = sim.cal.airMean(doy);
    // Battles break out on warm, humid days after rain.
    if (col.adults >= 50 && this.workers >= 250 && doy > 120 && doy < 270 && air > 15 && sim.recentRain(DAY_TICKS / 4) && !sim.raining && rng.chance(0.03)) {
      this.war = Math.round(DAY_TICKS / 10);
      this.front = clamp(sim.nest.foundX + this.side * rng.int(110, 280), 40, sim.world.w - 41);
      this.warDead = { ours: 0, theirs: 0 };
      this.lastTrouble = week;
      sim.yearCount.wars++;
      sim.events.push({ key: 'war', x: this.front, y: sim.world.ground[this.front]! - 10 });
      return;
    }
    // A much stronger colony may raid a weaker one's granary.
    if (col.stored > 25 && this.workers > Math.max(220, col.adults * 3) && doy > 150 && doy < 270 && sim.forageWeather > 0.5 && rng.chance(0.02)) {
      this.raid = Math.round(DAY_TICKS / 9);
      this.stolen = 0;
      this.lastTrouble = week;
      sim.yearCount.raids++;
      sim.events.push({ key: 'raid', x: sim.nest.foundX, y: sim.world.ground[sim.nest.foundX]! + 20 });
    }
  }

  /**
   * A young colony on our slice: its workers heave spoil out beside the
   * door; and while it is small, a much bigger colony whose foragers find
   * the door may overrun it, as established harvester colonies do to the
   * incipient nests around them.
   */
  private youngYear(sim: Sim): void {
    const w = sim.world;
    const rng = sim.rng;
    if (sim.dormant) return;
    if (rng.chance(0.12)) {
      const x = this.homeX + (rng.chance(0.5) ? -1 : 1) * rng.int(4, 9);
      let y = 1;
      while (y < w.h - 1 && !SOLID[w.mat[(y + 1) * w.w + x]!]) y++;
      const i = y * w.w + x;
      if (w.mat[i] === EMPTY && w.bg[i] === 0 && !w.plan[i] && !w.plant[i]) w.set(i, SAND, rng.int(90, 200), LOAM);
    }
    const col = sim.colony;
    if (!this.found || col.adults < 30 || col.adults < this.workers * 3) return;
    const near = col.ants.some((a) => !a.away && a.task === Task.Forage && Math.abs(a.x - this.homeX) < 10 && w.bg[a.y * w.w + a.x] === 0);
    if (near && rng.chance(0.006)) {
      this.dead = true;
      if (this.queen) this.queen.alive = false;
      for (const a of this.ants) a.alive = false;
      this.ants.length = 0;
      sim.events.push({ key: 'youngColonyGone', x: this.homeX, y: w.ground[this.homeX]! - 1 });
    }
  }

  private endWar(sim: Sim): void {
    for (const a of this.ants) if (a.rstate === 4) a.rstate = 2;
    sim.events.push({ key: 'warOver', n: this.warDead.ours, m: this.warDead.theirs });
  }

  private endRaid(sim: Sim): void {
    for (const a of this.ants) if (a.rstate === 3 && !a.carry) a.rstate = 2;
    sim.events.push({ key: 'raidOver', n: this.stolen });
  }

  /** Where our defenders should gather (NaN if all is quiet). */
  alarmX(sim: Sim): number {
    if (this.war > 0) return this.front;
    if (this.raid > 0) return sim.nest.foundX;
    return NaN;
  }

  /** Is this column free for a founding queen to land on (for the founding-queen cull)? */
  static clearGround(sim: Sim, x: number): boolean {
    const w = sim.world;
    const g = w.ground[x]!;
    for (let y = g - 3; y <= g + 6; y++) if (SOLID[w.mat[y * w.w + x]!] && w.mat[y * w.w + x] === WOOD) return false;
    return true;
  }
}
