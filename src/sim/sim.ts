import { Rng } from '../util/rng';
import { generate, Horizons } from '../world/gen';
import { World } from '../world/world';
import { Plants } from '../world/plants';
import { Physics, PACKED, PLUG } from '../world/physics';
import { EMPTY, SAND, SEED, SOLID, REFUSE, WATER, HARD, ROCK, WOOD, LIME, SANDY, STONE, PREY, SOIL, TWIG, FRUIT } from '../world/mat';
import { ABSORB } from '../world/moisture';
import { Nest } from './nest';
import { Fields, F, FIELD_COUNT, FAR } from './fields';
import { Colony } from './colony';
import { Ant } from './ant';
import { Particles } from './particles';
import { Task, holdsStores } from './types';
import { TUNING, TICK_HZ, DAY_TICKS, GROUND_Y } from '../config';
import { pack, sampleRamp, PAL, mixRGB, SEED_TONE } from '../render/palette';
import { HUMUS, LOAM, CLAY, SUBSOIL } from '../world/mat';
import { Calendar, Season, forageWindow } from './calendar';
import { SITES, SiteId, Variant, siteForSeed } from '../world/sites';
import { Ecology } from './ecology';
import { Critters } from './critters';
import { Neighbour } from './rivals';
import { Fog } from './fog';
import { Carcasses } from './carcass';

/** An event for the player; `key` names a message in the UI's string table. */
export interface SimEvent {
  key: string;
  n?: number;
  m?: number;
  /** Who or what the message is about (words looked up by the UI). */
  who?: string;
  what?: string;
  /** A chamber kind the message is about. */
  kind?: string;
  /** Where it happened (the documentary camera cuts there; the journal line links to it). */
  x?: number;
  y?: number;
}

export interface Where {
  x: number;
  y: number;
}

export type Phase = 'choose' | 'founding' | 'growing' | 'failed';

export interface Weather {
  /** Current rain intensity (eases toward target). */
  rain: number;
  target: number;
  until: number;
  next: number;
  storm: boolean;
  /** This shower falls as snow (it is below freezing). */
  snowing?: boolean;
}

/** Seeds blowing in from the meadow beyond the slice, by month (none in winter). */
const SEED_RAIN_MONTH = [0, 0, 0, 0.35, 0.6, 1, 1, 1, 0.8, 0.5, 0.15, 0];

export interface Drop {
  x: number;
  y: number;
}

export class Sim {
  readonly seed: number;
  readonly rng: Rng;
  readonly world: World;
  readonly plants: Plants;
  readonly horizons: Horizons;
  readonly physics: Physics;
  readonly nest: Nest;
  readonly fields: Fields;
  readonly colony: Colony;
  readonly particles = new Particles();
  readonly pher: Float32Array;
  /** Cells that currently hold any trail pheromone. */
  readonly pherCells: number[] = [];
  tick = 0;
  readonly weather: Weather = { rain: 0, target: 0, until: 0, next: DAY_TICKS * 2, storm: false };
  readonly drops: Drop[] = [];
  /** Lightning flash, counts down in ticks. */
  flash = 0;
  /** Messages for the UI (it drains this). */
  /** Things worth telling the player (the UI words them). Drained by the UI. */
  readonly events: SimEvent[] = [];
  /** Collapses and sprouts accumulate here and are reported every couple of in-game hours. */
  private pendingCollapse = 0;
  private pendingSprout = 0;
  /** Day starts mid-morning. */
  readonly dayOffset = 0.32;
  /** Weeks, months and seasons; temperatures from the site's climate. */
  readonly cal: Calendar;
  /** Which real place this slice is, and what makes this map of it different. */
  readonly site: SiteId;
  readonly variant: Variant;
  /** A tree at the edge of the slice (shade, roots, autumn leaves), if any. */
  readonly tree: { x: number; r: number } | null;
  /** The surface's year beyond the meadow: shrub, tree, dead insects. */
  readonly eco: Ecology;
  /** Grasshoppers, ground beetles, earthworms, spiders, nest guests. */
  readonly critters = new Critters();
  /** What the year brought, for the review at the start of the winter rest. */
  private yearStart = { born: 0, deaths: {} as Record<string, number>, flown: 0 };
  readonly yearCount = { wars: 0, raids: 0, peak: 0 };
  /** The queen's name (from the site's own region) and the colony's (from the place it chose). */
  names = { queen: '', colony: '' };
  /** Other Messor colonies: an old one beyond an edge (most maps), a young one on our slice (sometimes). */
  readonly neighbours: Neighbour[] = [];
  /** Dead insects and worms lying whole on the ground (too heavy for one worker). */
  readonly carcasses = new Carcasses();
  /** Other young queens that came down after the same flight, and how many landed. */
  readonly foreigners: Ant[] = [];
  foreignLanded = 0;
  /**
   * The part of the world the colony knows so far (x0..x1, down to y1): the
   * view starts small around the nest and widens and deepens as the nest and
   * the foragers' range grow. Eased toward `viewGoal`.
   */
  readonly view = { x0: 0, x1: 0, y1: 0 };
  private viewGoal = { x0: 0, x1: 0, y1: 0 };
  /** What the colony has seen of its world (the rest is in the dark). */
  readonly fog: Fog;
  /** What the diggers have run into so far (each is told once). */
  private discovered: Record<string, boolean> = {};
  /** Year the last batch of buried seeds was reported. */
  seedFindYear = 0;
  /** Snow lying on the ground, mm. */
  snow = 0;
  /** Cloud cover 0..1 (full under rain). */
  cloud = 0.2;
  private cloudGoal = 0.2;
  /** Soil-surface temperature now, °C (refreshed twice a second of sim time). */
  surfaceT = 15;
  season: Season = 'spring';
  /** Winter rest: no foraging, no laying, brood paused, the colony clustered deep. */
  dormant = false;
  /** When to shut the nest (soon after rain starts or the cold comes, once the foragers are in). */
  private sealAt = 0;
  /** When to open it again after rain (once the puddles in the crater have soaked away). */
  private openAt = 0;
  /** Nuptial flight under way: the alates are climbing out and taking off. */
  flight = false;
  /** Colony year of the last flight (one a year). */
  private flightYear = 0;
  private flightCount = { gynes: 0, males: 0 };
  /** When it last rained (flights follow rain, when the soil is soft for the new queens). */
  private lastRain = -1e9;
  /** Alates in the air after take-off (drawn until they are out of sight). */
  readonly flyers: { x: number; y: number; vx: number; vy: number; caste: string; t: number }[] = [];
  seedRain = 0.4;
  /** Seeds lying loose on the surface (mice and beetles keep this in check). */
  looseSeeds = 0;
  /** Awned seeds that drilled themselves into the soil. */
  drilled = 0;
  /** Year each once-a-year (or, with -1, once-ever) message was last given. */
  private noted: Record<string, number> = {};
  private src: Int32Array;

  constructor(seed: number, site: SiteId = siteForSeed(seed)) {
    this.seed = seed;
    this.site = site;
    this.rng = new Rng(seed ^ 0xa5a5a5);
    const gen = generate(seed, site);
    this.world = gen.world;
    this.plants = gen.plants;
    this.horizons = gen.horizons;
    this.variant = gen.variant;
    this.tree = gen.tree;
    this.eco = new Ecology(gen.shrub, gen.tree);
    this.fog = new Fog(this.world.w, this.world.h);
    // (When its foragers reach us is set when we land.)
    if (gen.variant.neighbour) this.neighbours.push(new Neighbour(gen.variant.neighbourSide, gen.variant.neighbour, 1e9));
    for (const p of gen.pits) this.critters.addAntlion(p.x, p.y, p.r);
    this.cal = new Calendar(SITES[site].climate);
    this.cal.tOffset = gen.variant.exposure * 1.5;
    this.cal.heat = SITES[site].surfaceHeat;
    this.physics = new Physics(this.world, this.rng);
    for (const i of gen.wet) this.physics.moisture.add(i, 215);
    // Before the landing the whole meadow can be scanned, but only the top of the soil.
    Object.assign(this.view, { x0: 0, x1: this.world.w, y1: GROUND_Y + 240 });
    Object.assign(this.viewGoal, this.view);
    this.nest = new Nest(this.world, this.rng, seed);
    this.fields = new Fields(this.world);
    this.colony = new Colony(this.world.size, this.world.w);
    this.pher = new Float32Array(this.world.size);
    this.src = new Int32Array(this.world.size);
  }

  /** In-game days since the start (fractional). One in-game day is one week of the calendar. */
  get simDays(): number {
    return this.tick / DAY_TICKS + this.dayOffset;
  }

  /** Day of the year, 0..364. */
  get doy(): number {
    return this.cal.doy(this.simDays);
  }

  /** Soil temperature at a depth below the surface (mm), °C. */
  soilT(depthMm: number): number {
    return this.cal.soilTemp(depthMm, this.dayT, this.doy, this.cloud, this.snow);
  }

  /** How fast ants age right now (1 on a warm day; slow in the winter cold). */
  get agingRate(): number {
    return this.dormant ? 0.3 : 1;
  }

  /** How good the weather is for foraging right now, 0..1 (temperature and rain). */
  get forageWeather(): number {
    return this.raining ? 0 : forageWindow(this.surfaceT);
  }

  get dayT(): number {
    return (this.tick / DAY_TICKS + this.dayOffset) % 1;
  }

  get day(): number {
    return Math.floor(this.tick / DAY_TICKS + this.dayOffset) + 1;
  }

  get raining(): boolean {
    return this.weather.rain > 0.15;
  }

  get phase(): Phase {
    if (!this.nest.founded) return 'choose';
    if (this.colony.failed) return 'failed';
    return this.colony.hadWorkers ? 'growing' : 'founding';
  }

  /** Is this column a reasonable place for a queen to dig in? (Not on a tree or a bush.) */
  canFound(x: number): boolean {
    return x > 40 && x < this.world.w - 40 && !this.woodNear(Math.round(x), 8) && !this.inPit(x, 10);
  }

  /** Within an antlion's pit (or this close to its rim)? */
  private inPit(x: number, margin: number): boolean {
    return this.critters.list.some((c) => c.kind === 'antlion' && Math.abs(x - (c.px ?? c.x)) < (c.pr ?? 0) + margin);
  }

  /** Any trunk, branch or root at the surface within r columns of x? */
  private woodNear(x: number, r: number): boolean {
    const w = this.world;
    for (let xx = Math.max(0, x - r); xx <= Math.min(w.w - 1, x + r); xx++) {
      const g = w.ground[xx]!;
      for (let y = Math.max(1, g - 220); y <= g + 10; y++) if (w.mat[y * w.w + xx] === WOOD || w.plant[y * w.w + xx] === TWIG) return true;
    }
    return false;
  }

  /** Nearest column to x where no pebble sits over the burrow (she cannot dig through stone). */
  private diggableNear(x: number): number {
    const w = this.world;
    const clear = (cx: number): boolean => {
      for (let xx = cx - 3; xx <= cx + 3; xx++) {
        const g = w.ground[xx]!;
        for (let y = g - 4; y <= g + 8; y++) {
          const m = w.mat[y * w.w + xx]!;
          if (HARD[m]) return false;
        }
      }
      return !this.woodNear(cx, 6) && !this.inPit(cx, 8);
    };
    for (let d = 0; d < 200; d++) {
      for (const s of d === 0 ? [0] : [d, -d]) {
        const cx = x + s;
        if (cx > 40 && cx < w.w - 40 && clear(cx)) return cx;
      }
    }
    return x;
  }

  /** A mated queen lands at column x and starts her colony. */
  found(x: number): void {
    if (this.nest.founded) return;
    const w = this.world;
    x = this.diggableNear(Math.max(40, Math.min(w.w - 40, Math.round(x))));
    // Land on top of whatever is there (litter, a pebble), then walk down into the burrow.
    let y = 1;
    while (y < w.h - 1 && !SOLID[w.mat[(y + 1) * w.w + x]!]) y++;
    const q = new Ant('queen', x, y, Number.MAX_SAFE_INTEGER, TUNING.queenSpeed);
    q.wings = true;
    q.phase = 0;
    q.task = Task.Found;
    q.orient(this, 1, 0);
    this.colony.queen = q;
    this.cal.originDay = this.simDays;
    // The colony's world starts as a hand's breadth around the queen.
    this.fog.reveal(x, w.ground[x]! - 4, 46, true);
    Object.assign(this.view, { x0: Math.max(0, x - 80), x1: Math.min(w.w, x + 80), y1: w.ground[x]! + 50 });
    Object.assign(this.viewGoal, this.view);
    this.colony.middenSide = this.rng.chance(0.5) ? -1 : 1;
    this.nest.found(x);
    // Plants the crater cut through go entirely: a stem severed at the base would
    // leave flowers and seeds hanging in the air, out of every forager's reach.
    for (const p of [...this.plants.list]) {
      if (p.parts.some((pt) => w.plan[pt.i] && !w.plant[pt.i] && w.bg[pt.i] === 0)) this.plants.remove(p);
    }
    this.nest.scan();
    for (let f = 0; f < FIELD_COUNT; f++) this.buildField(f);
    this.names = { queen: this.queenName(), colony: this.colonyName(x) };
    // Other young queens from the same nuptial flight come down nearby.
    const n = this.rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      let fx = -1;
      for (let tries = 0; tries < 30; tries++) {
        const c = this.rng.int(60, w.w - 61);
        if (Math.abs(c - x) > 90 && this.canFound(c) && !this.foreigners.some((q) => Math.abs(q.x - c) < 40)) {
          fx = c;
          break;
        }
      }
      if (fx < 0) continue;
      let fy = 1;
      while (fy < w.h - 1 && !SOLID[w.mat[(fy + 1) * w.w + fx]!]) fy++;
      const fq = new Ant('queen', fx, fy, Number.MAX_SAFE_INTEGER, TUNING.queenSpeed);
      fq.foreign = true;
      fq.wings = true;
      fq.phase = 0;
      fq.age = -this.rng.int(0, TICK_HZ * 6);
      fq.orient(this, 1, 0);
      this.foreigners.push(fq);
    }
    this.foreignLanded = this.foreigners.length;
    // The old neighbours' foragers find our corner of the meadow some weeks on: this summer, or next spring.
    const week = this.simDays;
    for (const nb of this.neighbours) if (!nb.young) nb.arriveWeek = week + (this.rng.chance(0.75) ? this.rng.range(14, 30) : this.rng.range(48, 58));
    if (this.foreignLanded) this.events.push({ key: 'otherQueens', n: this.foreignLanded, x: this.foreigners[0]!.x, y: this.foreigners[0]!.y });
  }

  /** A name from the languages spoken where this site is. */
  private queenName(): string {
    const names: Record<SiteId, string[]> = {
      pannonian: ['Ilka', 'Réka', 'Zsófi', 'Hedvig', 'Kata', 'Boróka', 'Etelka', 'Panni'],
      sand: ['Csilla', 'Enikő', 'Tünde', 'Boróka', 'Ilona', 'Piroska'],
      limestone: ['Lenka', 'Eliška', 'Marta', 'Vera', 'Johana', 'Bára'],
      vineyard: ['Hedwig', 'Resi', 'Vroni', 'Lisl', 'Anni', 'Gretl'],
      anatolia: ['Ayla', 'Defne', 'Elif', 'Gülay', 'Ilgın', 'Meltem', 'Yaprak', 'Ceren'],
      pontic: ['Oksana', 'Lesya', 'Daryna', 'Mila', 'Zlata', 'Vira'],
    };
    const list = names[this.site];
    return list[(this.seed * 7 + 3) % list.length]!;
  }

  /** The colony is known by what stands over or beside its nest. */
  private colonyName(x: number): string {
    const s = this.eco.shrub;
    if (s && Math.abs(s.x - x) < 170) return s.kind === 'blackthorn' ? 'cn_blackthorn' : 'cn_rose';
    if (this.tree && Math.abs(this.tree.x - x) < this.tree.r + 300) return 'cn_tree';
    const w = this.world;
    for (let xx = x - 40; xx <= x + 40; xx++) {
      const g = w.ground[xx]!;
      for (let y = g; y < g + 25; y++) if (w.mat[y * w.w + xx] === STONE && w.tint[y * w.w + xx] !== 4 && w.tint[y * w.w + xx] !== 5) return 'cn_stone';
    }
    if (this.critters.list.some((c) => c.kind === 'antlion')) return 'cn_sand';
    const stipa = this.plants.list.filter((p) => p.kind === 'stipa' && Math.abs(p.x - x) < 120).length;
    if (stipa >= 2) return 'cn_featherGrass';
    return `cn_${this.site}`;
  }

  /**
   * The other founding queens: almost none survive. Heat and hunting beetles
   * take those still on the surface; foragers of established colonies (ours, once we have
   * workers, and the neighbours') find their burrows, dig them out and kill
   * them; others starve or sicken in their cells.
   */
  private foundresses(): void {
    const w = this.world;
    const rng = this.rng;
    for (const q of this.foreigners) {
      if (!q.alive) continue;
      q.tick(this);
      if (this.tick % 30 !== 0) continue;
      // Still on the open ground: the midday heat or a hunting beetle gets many of them.
      if (q.phase < 2 && rng.chance(0.004)) {
        q.alive = false;
        this.noteYearly('foundressLost', q);
        continue;
      }
      if (q.phase === 2) {
        // A forager passing over the burrow scents her.
        const finder = this.colony.ants.find((a) => !a.away && a.task === Task.Forage && Math.abs(a.x - q.x) <= 3 && w.bg[a.y * w.w + a.x] === 0 && a.carry === 0);
        if (finder && rng.chance(0.25)) {
          q.alive = false;
          // She is dug out, killed and carried home: a big meal of protein.
          finder.carry = 9;
          finder.carryTone = 40;
          this.noteOnce('foundressKilled', q);
          continue;
        }
        const rival = this.neighbours.some((nb) => nb.ants.some((a) => Math.abs(a.x - q.x) <= 3 && w.bg[a.y * w.w + a.x] === 0));
        if (rival && rng.chance(0.25)) {
          q.alive = false;
          this.noteOnce('foundressKilledByRivals', q);
          continue;
        }
        // Most starve or sicken in their cells; a lucky one raises her first daughters.
        if (!this.dormant && rng.chance(0.0006)) q.alive = false;
        else if (!this.dormant && q.age > DAY_TICKS * 7.5 && !this.neighbours.some((nb) => nb.young)) this.youngColony(q);
      }
    }
    if (this.foreigners.some((q) => !q.alive)) {
      const left = this.foreigners.filter((q) => q.alive);
      this.foreigners.length = 0;
      this.foreigners.push(...left);
    }
  }

  /**
   * A foundress made it: her first workers chew through the plug and a young
   * colony starts on our slice. It is not announced; we find it when one of
   * ours meets one of its workers or comes upon its door.
   */
  private youngColony(q: Ant): void {
    const w = this.world;
    const nb = new Neighbour(0, this.rng.int(3, 6), this.simDays);
    nb.homeX = q.x;
    nb.queen = q;
    nb.reach = 40;
    this.neighbours.push(nb);
    const i = this.foreigners.indexOf(q);
    if (i >= 0) this.foreigners.splice(i, 1);
    const top = w.ground[q.x]! * w.w + q.x;
    for (const c of [top, top + 1]) {
      if (w.mat[c] !== SAND || !(w.tint[c]! & PLUG)) continue;
      w.set(c, EMPTY, w.tone[c], w.bg[c] ? w.tint[c]! & 0x3f : 0);
    }
  }

  /** The neighbours raiding us or fighting us right now, if any. */
  trouble(): Neighbour | null {
    for (const nb of this.neighbours) if (nb.war > 0 || nb.raid > 0) return nb;
    return null;
  }

  // ---------------------------------------------------------------- effects

  dust(cell: number, src: number): void {
    const w = this.world;
    const x = cell % w.w;
    const y = (cell / w.w) | 0;
    const ramp = src === HUMUS ? PAL.humus : src === CLAY ? PAL.clay : src === SUBSOIL ? PAL.subsoil : PAL.loam;
    for (let k = 0; k < 2; k++) {
      const c = mixRGB(sampleRamp(ramp, this.rng.next()), [235, 220, 195], 0.3);
      this.particles.add({
        x: x + this.rng.range(-0.5, 0.5),
        y: y + this.rng.range(-0.5, 0.5),
        vx: this.rng.range(-0.15, 0.15),
        vy: this.rng.range(-0.15, 0.05),
        life: this.rng.int(10, 24),
        gravity: 0.01,
        color: pack(c[0], c[1], c[2]),
      });
    }
  }

  /** A load of husks scattered off the slice: a few flakes drift down here. */
  chaffPuff(cell: number): void {
    const w = this.world;
    const x = cell % w.w;
    const y = (cell / w.w) | 0;
    for (let k = 0; k < 2; k++) {
      const c = sampleRamp(PAL.refuse, 0.6 + this.rng.next() * 0.4);
      this.particles.add({
        x: x + this.rng.range(-0.5, 0.5),
        y: y + this.rng.range(-0.5, 0.5),
        vx: this.rng.range(-0.25, 0.25),
        vy: this.rng.range(-0.2, 0),
        life: this.rng.int(12, 26),
        gravity: 0.008,
        color: pack(c[0], c[1], c[2]),
      });
    }
  }

  /** Spoil heaved out of a mouth (the founding queen's, or a plug pushed out of a gate). */
  spoil(tint: number, tone: number, near = this.nest.foundX): void {
    const w = this.world;
    const x0 = this.nest.gateNear(near);
    for (let t = 0; t < 8; t++) {
      // Thrown clear of the crater's open air.
      const x = x0 + (this.rng.chance(0.5) ? -1 : 1) * this.rng.int(10, 22);
      let y = 1;
      while (y < w.h - 1 && !SOLID[w.mat[(y + 1) * w.w + x]!]) y++;
      const i = y * w.w + x;
      if (w.mat[i] === EMPTY && w.bg[i] === 0 && !w.plan[i]) {
        w.set(i, SAND, tone, tint || LOAM);
        return;
      }
    }
  }

  shedWings(x: number, y: number): void {
    for (let k = 0; k < 16; k++) {
      this.particles.add({
        x: x + this.rng.range(-4, 2),
        y: y - 3 + this.rng.range(-1, 1),
        vx: this.rng.range(-0.25, 0.25),
        vy: this.rng.range(-0.2, 0.05),
        life: this.rng.int(80, 160),
        gravity: 0.004,
        color: pack(205, 214, 222),
      });
    }
  }

  layTrail(i: number, amount: number): void {
    const old = this.pher[i]!;
    const v = old + amount * TUNING.pheromoneDeposit;
    this.pher[i] = v > 8 ? 8 : v;
    if (old === 0) this.pherCells.push(i);
  }

  // ---------------------------------------------------------------- fields

  private buildField(f: number): void {
    const w = this.world;
    const src = this.src;
    const col = this.colony;
    const nest = this.nest;
    let n = 0;
    const push = (i: number): void => {
      if (n < src.length) src[n++] = i;
    };
    switch (f) {
      case F.Out: {
        // The crater rim: open ground near an entrance but outside the crater's
        // reserved air. Leaving ants climb here before setting off.
        for (const e of nest.entrances) {
          const ex = e % w.w;
          const ey = (e / w.w) | 0;
          for (let dy = -45; dy <= 2; dy++) {
            const y = ey + dy;
            if (y < 2) continue;
            for (let dx = -50; dx <= 50; dx++) {
              const x = ex + dx;
              if (x < 1 || x >= w.w - 1) continue;
              const i = y * w.w + x;
              if (w.walk[i] && w.bg[i] === 0 && !w.plan[i]) push(i);
            }
          }
        }
        break;
      }
      case F.Entr: {
        for (const e of nest.entrances) {
          const ex = e % w.w;
          const ey = (e / w.w) | 0;
          for (let dy = -3; dy <= 1; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const i = (ey + dy) * w.w + ex + dx;
              if (w.walk[i]) push(i);
            }
        }
        break;
      }
      case F.Dig:
        for (const i of nest.digSpots) push(i);
        break;
      case F.Gran: {
        // Only granaries hold physical stores; without one, food goes into the
        // colony's shared crops at the royal chamber (see Ant.doForage).
        // Seed is laid up from the far end of the room: filling from the doorway
        // would heap the store across it and seal the granary off.
        const entr = this.fields.dist[F.Entr]!;
        for (const c of nest.chambers) {
          if (c.kind !== 'granary' || !c.ready || c.seeds >= c.capacity) continue;
          const lim = c.floorY - Math.round(c.h * 0.45);
          let door = FAR;
          for (const i of c.floor) door = Math.min(door, entr[i]!);
          let n = 0;
          for (const i of c.floor) if (((i / w.w) | 0) >= lim && entr[i]! >= door + 5 && entr[i] !== FAR) { push(i); n++; }
          if (n === 0) for (const i of c.floor) if (((i / w.w) | 0) >= lim) push(i);
        }
        // No granary with room: seed is piled where there is space. First on
        // the queen's floor, to either side of her (a founding nest's cache),
        // then along the back of the resting rooms.
        if (n === 0) {
          for (const c of nest.chambers) {
            if (!c.ready) continue;
            if (c.kind === 'queen' && c.seeds < Math.min(28, c.capacity * 0.6)) {
              for (const i of c.floor) if (Math.abs((i % w.w) - c.cx) > c.w * 0.28) push(i);
            } else if (c.kind === 'rest' && c.seeds < c.capacity * 0.4) {
              let door = FAR;
              for (const i of c.floor) door = Math.min(door, entr[i]!);
              for (const i of c.floor) if (entr[i]! >= door + 6 && entr[i] !== FAR) push(i);
            }
          }
        }
        break;
      }
      case F.Store:
        for (const i of col.storeCells) {
          for (const d of [-w.w, -1, 1, -w.w - 1, -w.w + 1]) if (w.walk[i + d]) push(i + d);
        }
        break;
      case F.Nurse:
        // The nurseries where brood grows fastest right now (sun-warmed near
        // the top on a cool morning, deeper in the midday heat).
        for (const c of nest.chambers) {
          if (c.kind !== 'nursery' || !c.ready) continue;
          if ((col.roomRate[c.id] ?? 1) < col.bestNurseryRate - 0.15) continue;
          for (const i of c.floor) if (!col.broodCell[i]) push(i);
        }
        break;
      case F.Larva:
        for (const b of col.brood) if (col.isHungry(b)) push(b.y * w.w + b.x);
        break;
      case F.Egg: {
        // Brood to carry: eggs the queen has just laid, brood lying outside a
        // nursery, and brood in a nursery much colder (or hotter) than the best.
        if (this.fields.sourceCount[F.Nurse] === 0) break;
        for (const b of col.brood) {
          if (b.carried || b.restUntil > this.tick || b.sex) continue;
          const i = b.y * w.w + b.x;
          const room = nest.chamberAt(i);
          if (room?.kind !== 'nursery') {
            // The young queens and males sit apart; workers' brood goes to the nursery.
            push(i);
            continue;
          }
          if ((col.roomRate[room.id] ?? 1) < col.bestNurseryRate - 0.3) push(i);
        }
        break;
      }
      case F.Trash: {
        // Only the dead inside the nest need carrying out; outside they already are.
        for (const c of col.corpses) if (!c.carried && w.bg[c.y * w.w + c.x] === 1) push(c.y * w.w + c.x);
        for (const c of nest.chambers) {
          // Husks wait on the floor of whichever room holds the stores.
          const store = col.husks > 0 && c.ready && holdsStores(c.kind);
          if (store) for (const i of c.floor) push(i);
          for (const i of c.cells) {
            if (w.mat[i] !== REFUSE) continue;
            for (const d of [-w.w, -1, 1]) if (w.walk[i + d]) push(i + d);
          }
        }
        break;
      }
      case F.Rest: {
        let any = false;
        // Winter: the colony clusters in the deepest rooms, below the frost.
        if (this.dormant) {
          const rooms = nest.chambers.filter((c) => c.ready && c.kind !== 'granary').sort((a, b) => b.floorY - a.floorY).slice(0, 2);
          for (const c of rooms) for (const i of c.floor) push(i);
          if (rooms.length) break;
        }
        for (const c of nest.chambers) {
          if (c.kind !== 'rest' || !c.ready) continue;
          any = true;
          for (const i of c.floor) push(i);
        }
        if (!any) {
          for (const c of nest.chambers) {
            if (!c.ready || c.kind === 'queen') continue;
            any = true;
            for (const i of c.floor) push(i);
          }
        }
        if (!any) {
          const qc = nest.queenChamber();
          if (qc?.ready) for (const i of qc.floor) push(i);
        }
        break;
      }
      case F.Royal: {
        const qc = nest.queenChamber();
        if (qc) {
          for (const i of qc.floor) if (Math.abs((i % w.w) - qc.cx) <= qc.w * 0.25) push(i);
          if (n === 0) for (const i of qc.cells) if (w.walk[i]) push(i);
        }
        break;
      }
    }
    this.fields.build(f, src, n);
  }

  /**
   * Mice and beetles glean the surface, so fallen seed never piles up for long;
   * other scavengers take dead insects. Feather-grass and stork's-bill seeds
   * left lying on damp ground screw themselves into the soil with their awns.
   */
  private gleaners(): void {
    const w = this.world;
    const found: number[] = [];
    const y0 = Math.max(1, GROUND_Y - 70);
    const y1 = GROUND_Y + 30;
    for (let y = y0; y < y1; y++) {
      for (let x = 1; x < w.w - 1; x++) {
        const i = y * w.w + x;
        const m = w.mat[i];
        if (m === SEED && w.bg[i] === 0) {
          // Awned seed (feather grass, stork's bill) drills down when wet.
          const dn = i + w.w;
          if (w.tone[i]! >= 154 && SOIL[w.mat[dn]!] && w.moist[dn]! > 30 && w.mat[i - w.w] === EMPTY && this.rng.chance(0.05)) {
            w.set(dn, SEED, w.tone[i], 0);
            w.set(i, EMPTY, 0, 0);
            this.drilled++;
            this.noteOnce('awnsDrill', { x: i % w.w, y: (i / w.w) | 0 });
            continue;
          }
          found.push(i);
        } else if ((m === PREY || m === FRUIT) && w.bg[i] === 0 && w.mat[i - w.w] === EMPTY && this.rng.chance(m === FRUIT ? 0.012 : 0.006)) {
          // Scavengers and rot: dead insects and fallen fruit don't lie out for long.
          w.set(i, EMPTY, 0, 0);
        }
      }
    }
    this.looseSeeds = found.length;
    // Scavengers take the dead left lying out in the open.
    const dead = this.colony.corpses;
    for (let k = dead.length - 1; k >= 0; k--) {
      const c = dead[k]!;
      if (!c.carried && w.bg[c.y * w.w + c.x] === 0 && this.rng.chance(0.04)) dead.splice(k, 1);
    }
    const eat = Math.max(0, Math.floor((found.length - 160 * (w.w / 640)) / 6)) + (this.rng.chance(0.3) ? 1 : 0);
    for (let k = 0; k < eat && found.length; k++) {
      const j = this.rng.int(0, found.length - 1);
      const i = found[j]!;
      found[j] = found[found.length - 1]!;
      found.pop();
      // Only grains on top can be picked off.
      if (w.mat[i - w.w] === EMPTY) w.set(i, EMPTY, 0, 0);
    }
  }

  // ---------------------------------------------------------------- step

  step(): void {
    this.tick++;
    if (this.tick % 15 === 0) this.climate();
    if (this.tick % 10 === 0) this.updateView();
    if (this.tick % 30 === 0 && this.colony.adults > this.yearCount.peak) this.yearCount.peak = this.colony.adults;
    if (this.tick % 300 === 150 && this.nest.founded) this.discoveries();
    if (this.site === 'sand' && this.tick % 20 === 0) this.drySand();
    // Plants grow and ripen in their season; the year turns for the meadow, shrub and tree.
    const air = this.cal.airMean(this.doy);
    // (Seedlings come up in the week or so after rain, while the topsoil is damp.)
    this.plants.tick(this.doy, air, this.tick - this.lastRain < DAY_TICKS * 1.2);
    this.eco.step(this);
    this.critters.step(this);
    if (this.tick % Ecology.PERIOD === 0) {
      const doy = this.doy;
      this.plants.season(doy, air);
      this.eco.season(this);
      this.critters.season(this);
      for (const nb of this.neighbours) nb.season(this);
      if (this.neighbours.some((nb) => nb.dead)) {
        const left = this.neighbours.filter((nb) => !nb.dead);
        this.neighbours.length = 0;
        this.neighbours.push(...left);
      }
      if (this.site === 'vineyard') this.eco.grapes(this);
      // The meadow's year, as the colony lives it.
      if (doy >= 150 && doy < 165) this.noteYearly('harvest');
      if (doy >= 222 && doy < 240) this.noteYearly('meadowStraw');
      if (doy > 240 && this.plants.list.some((p) => p.resting)) this.noteYearly('dieback');
      if (this.plants.gardens > 0) this.noteOnce('antGarden');
    }
    this.physics.step();
    if (this.tick % 15 === 0) this.nest.scan();
    if (this.nest.founded) {
      this.colony.tick(this);
      // Rebuild at most one distance field per tick, whichever is most overdue.
      const f = this.fields.nextDue(this.tick);
      if (f >= 0) this.buildField(f);
      if (this.tick % (TICK_HZ * 3) === 0 && this.colony.hadWorkers) this.growNest();
      for (const nb of this.neighbours) nb.step(this);
      this.carcasses.step(this);
      if (this.foreigners.length) this.foundresses();
    }
    if ((this.tick & 3) === 0) this.decayPheromone();
    this.particles.step();
    // Alates on the wing climb and drift off, fluttering.
    if (this.flyers.length) {
      let j = 0;
      for (const f of this.flyers) {
        f.t++;
        f.x += f.vx + Math.sin(f.t * 0.13 + f.x) * 0.12;
        f.y += f.vy;
        f.vx += (this.rng.next() - 0.45) * 0.01;
        if (f.y > -20 && f.x > -20 && f.x < this.world.w + 20) this.flyers[j++] = f;
      }
      this.flyers.length = j;
    }
    this.physics.moisture.step();
    this.seasonal();
    if (this.tick % 20 === 0) this.settleSpoil();
    this.rain();
    const m = this.physics.moisture;
    this.pendingCollapse += m.collapses;
    this.pendingSprout += m.sprouted;
    m.collapses = 0;
    m.sprouted = 0;
    // One line per kind every two in-game hours at most, with the total.
    if (this.tick % Math.round(DAY_TICKS / 12) === 0) {
      if (this.pendingCollapse >= 3) this.events.push({ key: 'collapse', n: this.pendingCollapse });
      if (this.pendingSprout >= 2) this.events.push({ key: 'sprout', n: this.pendingSprout });
      if (this.pendingCollapse >= 3) this.pendingCollapse = 0;
      if (this.pendingSprout >= 2) this.pendingSprout = 0;
    }
  }

  /** Tone of a seed of a species drawn from this site's plant mix. */
  seedToneFromMix(): number {
    const [lo, hi] = SEED_TONE[this.plants.pickKind()]!;
    return this.rng.int(lo, hi);
  }

  /**
   * Close the year's books: births, deaths by cause, battles and raids, the
   * nuptial flight, since the last review. (Called by the field notes when
   * the colony goes into its winter rest.)
   */
  closeYear(): { year: number; born: number; deaths: [string, number][]; flown: number; wars: number; raids: number; peak: number } {
    const c = this.colony;
    const s = this.yearStart;
    const deaths: [string, number][] = [];
    for (const [k, v] of Object.entries(c.deaths)) {
      const d = v - (s.deaths[k] ?? 0);
      if (d > 0) deaths.push([k, d]);
    }
    deaths.sort((a, b) => b[1] - a[1]);
    const out = { year: this.cal.year(this.simDays), born: c.born - s.born, deaths, flown: c.flown.total - s.flown, wars: this.yearCount.wars, raids: this.yearCount.raids, peak: Math.max(this.yearCount.peak, c.adults) };
    this.yearStart = { born: c.born, deaths: { ...c.deaths }, flown: c.flown.total };
    this.yearCount.wars = 0;
    this.yearCount.raids = 0;
    this.yearCount.peak = c.adults;
    return out;
  }

  /** Has it rained in the last `ticks`? */
  recentRain(ticks: number): boolean {
    return this.tick - this.lastRain < ticks;
  }

  /** A message given at most once a year (and only once there is a colony to tell of). */
  noteYearly(key: string, at?: Where): void {
    if (!this.nest.founded) return;
    const y = this.cal.year(this.simDays);
    if (this.noted[key] === y) return;
    this.noted[key] = y;
    this.events.push({ key, x: at?.x, y: at?.y });
  }

  /** A message given once in the colony's life. */
  noteOnce(key: string, at?: Where): void {
    if (!this.nest.founded || this.noted[key] !== undefined) return;
    this.noted[key] = -1;
    this.events.push({ key, x: at?.x, y: at?.y });
  }

  /** Start a shower now (or a storm). */
  startRain(storm: boolean): void {
    const w = this.weather;
    const already = w.rain > 0.15 || w.target > 0;
    // Already raining: a storm call strengthens it, otherwise it just lasts longer.
    if (already) this.events.push(storm && !w.storm ? { key: 'stormGrows' } : { key: 'rainLonger' });
    else {
      w.snowing = this.cal.airMean(this.doy) < 1.5;
      if (w.snowing) storm = false;
      this.events.push({ key: w.snowing ? 'snow' : storm ? 'storm' : 'rain' });
    }
    w.storm = w.storm || storm;
    if (this.colony.hadWorkers && !this.world.sealed && !this.sealAt) this.sealAt = this.tick + TICK_HZ * 3;
    this.openAt = 0;
    w.target = Math.max(already ? w.target : 0, storm ? 2.6 : this.rng.range(0.5, 1));
    w.until = Math.max(w.until, this.tick + Math.round((storm ? this.rng.range(45, 70) : this.rng.range(30, 60)) * TICK_HZ));
  }

  private rain(): void {
    const wt = this.weather;
    if (wt.target === 0 && this.tick >= wt.next && this.phase !== 'choose') {
      // Summer showers are often thunderstorms; below freezing it snows.
      const summer = this.season === 'summer';
      this.startRain(summer && this.rng.chance(this.cal.climate.stormShare));
    }
    if (wt.target > 0 && this.tick >= wt.until) {
      wt.target = 0;
      // Showers come at the site's monthly rate (in-game days are weeks).
      const perWeek = this.cal.climate.showers[this.cal.month(this.doy)]!;
      wt.next = this.tick + Math.round((DAY_TICKS / Math.max(0.2, perWeek)) * this.rng.range(0.5, 1.5));
      this.events.push({ key: wt.snowing ? 'snowStops' : 'rainStops' });
      // A downpour drives earthworms up; some die stranded on the surface.
      if (wt.storm && !wt.snowing) {
        this.eco.afterStorm(this);
        this.critters.afterStorm();
      }
      wt.snowing = false;
      // The rain is over: dig the door open again once the crater has drained (unless it is winter).
      if (this.colony.hadWorkers && !this.dormant) this.openAt = this.tick + TICK_HZ * 25;
    }
    wt.rain += (wt.target - wt.rain) * 0.01;
    if (wt.rain < 0.01 && wt.target === 0) wt.rain = 0;
    if (wt.storm && wt.rain > 1 && this.rng.next() < 1 / (TICK_HZ * 6)) this.flash = 7;
    if (this.flash > 0) this.flash--;

    const w = this.world;
    const n = wt.rain * 5;
    const spawn = Math.floor(n) + (this.rng.next() < n % 1 ? 1 : 0);
    for (let k = 0; k < spawn; k++) this.drops.push({ x: this.rng.range(0, w.w), y: this.rng.range(-6, 0) });
    const wind = wt.storm ? 0.35 : 0.12;
    let j = 0;
    for (let k = 0; k < this.drops.length; k++) {
      const d = this.drops[k]!;
      let alive = true;
      // Raindrops are quick: four cells a tick, checked one at a time. Snow drifts down slowly.
      const steps = wt.snowing ? 1 : 4;
      for (let s = 0; s < steps && alive; s++) {
        const px = Math.round(d.x);
        const py = Math.round(d.y);
        if (wt.snowing) {
          d.x += Math.sin(d.y * 0.15 + d.x) * 0.3 + wind * 0.5;
          d.y += this.rng.next() < 0.6 ? 1 : 0;
        } else {
          d.x += wind * 0.25;
          d.y += 1;
        }
        const x = Math.round(d.x);
        const y = Math.round(d.y);
        if (x < 1 || x >= w.w - 1 || y >= w.h - 1) {
          alive = false;
          break;
        }
        if (y < 1) continue;
        const i = y * w.w + x;
        // Leaves catch a share of the rain.
        if (w.plant[i] && this.rng.next() < 0.12) {
          alive = false;
          break;
        }
        if (w.mat[i] !== EMPTY) {
          this.impact(py * w.w + px, i);
          alive = false;
        }
      }
      if (alive) this.drops[j++] = d;
    }
    this.drops.length = j;
  }

  /** A drop lands: it soaks in, or (on saturated or hard ground) pools as water. */
  private impact(prev: number, hit: number): void {
    const w = this.world;
    const m = w.mat[hit]!;
    // Snowflakes just add to the snow lying on the ground.
    if (this.weather.snowing) {
      this.snow = Math.min(60, this.snow + 0.004);
      return;
    }
    // Ground soaks rain up to a point; past that the rain pools and runs off.
    // Loose spoil on the crater sheds most of it toward the mouth.
    const soak = ABSORB[m]! > 0 ? Math.max(0, 1 - w.moist[hit]! / 170) * (m === SAND ? 0.35 : 1) : 0;
    // Rain loosens settled spoil, so the mound slumps lower with every shower.
    if (m === SAND && !w.plan[hit] && w.tint[hit]! & PACKED && this.rng.next() < 0.5) {
      w.tint[hit] = w.tint[hit]! & ~PACKED;
      w.wake(hit);
    }
    if (this.rng.next() < soak || w.inSealBox(prev)) {
      if (ABSORB[m]! > 0) this.physics.moisture.add(hit, 40);
    } else if (prev >= 0 && prev < w.size && w.mat[prev] === EMPTY && this.rng.next() < 0.7) {
      w.set(prev, WATER, this.rng.int(0, 255), w.tint[prev]);
    }
    if (this.rng.next() < 0.3) {
      const x = prev % w.w;
      const y = (prev / w.w) | 0;
      this.particles.add({ x, y, vx: this.rng.range(-0.4, 0.4), vy: this.rng.range(-0.5, -0.15), life: 6, gravity: 0.1, color: pack(190, 210, 225) });
    }
  }

  private growNest(): void {
    const col = this.colony;
    const wanted = Nest.wanted(col.adults, col.brood.length, TUNING.nestCellsPerAnt, TUNING.nestCellsBase);
    this.nest.grow({ adults: col.adults, brood: col.brood.length, seeds: col.stored, orders: col.orders, harvestSide: col.harvestRight >= col.harvestLeft ? 1 : -1 }, wanted);
    // The second gate is dug through: the colony starts using it at once.
    if (this.nest.gateOpened()) {
      const e = this.nest.entrances[this.nest.entrances.length - 1]!;
      this.fields.hurry(F.Entr, this.tick);
      this.fields.hurry(F.Out, this.tick);
      this.events.push({ key: 'secondGate', n: Math.round(Math.abs((e % this.world.w) - this.nest.foundX) / 10), x: e % this.world.w, y: ((e / this.world.w) | 0) - 4 });
    }
    if (this.nest.droppedOrder) {
      this.events.push({ key: 'orderDropped', kind: this.nest.droppedOrder });
      this.nest.droppedOrder = null;
    }
  }

  private decayPheromone(): void {
    const p = this.pher;
    const k = Math.pow(TUNING.pheromoneDecay, 4);
    const cells = this.pherCells;
    let j = 0;
    for (let n = 0; n < cells.length; n++) {
      const i = cells[n]!;
      const v = p[i]! * k;
      if (v < 0.02) p[i] = 0;
      else {
        p[i] = v;
        cells[j++] = i;
      }
    }
    cells.length = j;
  }

  /**
   * Spoil on the surface creeps: a grain that stands proud of its neighbours
   * two cells away (a slope steeper than about 1 in 2) works loose and slides.
   * Wind, foot traffic and drying do this slowly; rain does it fast (see impact).
   */
  private settleSpoil(): void {
    if (!this.nest.founded) return;
    const w = this.world;
    const gates = this.nest.entrances;
    const top = (x: number): number => {
      let y = 1;
      while (y < w.h - 1 && w.mat[y * w.w + x] === EMPTY) y++;
      return y;
    };
    for (let k = 0; k < 12; k++) {
      // Around whichever gate (each has its ring of spoil).
      const x = (gates.length ? gates[this.rng.int(0, gates.length - 1)]! % w.w : this.nest.foundX) + this.rng.int(-220, 220);
      if (x < 3 || x >= w.w - 3) continue;
      const y = top(x);
      const i = y * w.w + x;
      // Husks on the surface blow away or rot within a day or two.
      if (w.mat[i] === REFUSE && !w.plan[i]) {
        // (The dead outside take longer: scavengers and decay.)
        if (this.rng.next() < TUNING.chaffDecay * (w.tone[i]! >= 140 ? 1 : 0.3)) w.set(i, EMPTY, 0, 0);
        continue;
      }
      if (w.mat[i] !== SAND || w.plan[i] || !(w.tint[i]! & PACKED)) continue;
      if (y > top(x - 2) - 2 && y > top(x + 2) - 2) continue;
      w.tint[i] = w.tint[i]! & ~PACKED;
      w.wake(i);
    }
  }

  /**
   * Temperature, cloud and snow, and the turn of the seasons. The colony
   * rests through the winter (when the mean air temperature is below about
   * 7 °C: roughly November to late March in the Pannonian steppe).
   */
  private climate(): void {
    const doy = this.doy;
    const wt = this.weather;
    // Cloud drifts toward a new cover every few hours; rain closes it.
    if (this.rng.next() < 0.01) this.cloudGoal = Math.pow(this.rng.next(), 1.6) * 0.9;
    const goal = wt.rain > 0.15 ? 1 : this.cloudGoal;
    this.cloud += (goal - this.cloud) * 0.05;
    // Under a tree's crown the ground keeps cool.
    this.cal.shade = this.eco.shadeAt(this.nest.founded ? this.nest.foundX : this.world.w / 2, doy);
    this.surfaceT = this.cal.surfaceTemp(this.dayT, doy, this.cloud, this.snow);
    // Snow melts in the sun and in thaw; meltwater soaks the topsoil.
    if (this.snow > 0) {
      const air = this.cal.airMean(doy);
      const melt = Math.max(0, this.surfaceT) * 0.002 + Math.max(0, air - 1) * 0.004;
      if (melt > 0) {
        const before = this.snow;
        this.snow = Math.max(0, this.snow - melt);
        this.meltWater((before - this.snow) * 6);
      }
    }
    const season = this.cal.season(doy);
    if (season !== this.season) {
      this.season = season;
      if (this.nest.founded) this.events.push({ key: `season_${season}` });
    }
    if (this.raining) this.lastRain = this.tick;
    this.nuptialFlight(doy);
    const mean = this.cal.airMean(doy);
    const dormant = this.dormant ? mean < 7.5 : mean < 6.5;
    if (dormant !== this.dormant) {
      this.dormant = dormant;
      if (this.nest.founded) this.events.push({ key: dormant ? 'dormancy' : 'waking' });
      // The first winter: what became of the other queens of the spring.
      if (dormant && this.foreignLanded && !this.noted.foundressSummary) {
        this.noted.foundressSummary = -1;
        const left = this.foreigners.length + this.neighbours.filter((nb) => nb.young).length;
        this.events.push({ key: left ? 'foundressSummary' : 'foundressNone', n: this.foreignLanded, m: left });
      }
      if (this.colony.hadWorkers) {
        if (dormant) this.sealAt = this.tick + TICK_HZ * 20;
        else if (!this.raining) this.openNest();
      }
    }
    if (this.openAt && this.tick >= this.openAt) {
      this.openAt = 0;
      if (!this.raining && !this.dormant) this.openNest();
    }
    // Shut the door once everyone is in (or after a while, leaving stragglers to shelter outside).
    if (this.sealAt && this.tick >= this.sealAt) {
      const outside = this.colony.ants.some((a) => this.world.bg[a.y * this.world.w + a.x] === 0);
      if (!outside || this.tick > this.sealAt + TICK_HZ * 20) {
        this.sealAt = 0;
        if (!this.world.sealed && (this.raining || this.dormant)) {
          this.nest.seal();
          this.events.push({ key: 'plugged' });
        }
      }
    }
  }

  /**
   * The nuptial flight: once a year, between April and early June, on a warm,
   * calm late morning soon after rain, the winged queens and males pour out of
   * the crater and take off.
   */
  private nuptialFlight(doy: number): void {
    const col = this.colony;
    const year = this.cal.year(this.simDays);
    if (this.flight) {
      if (col.alates.length === 0 || this.dayT > 0.66 || this.raining) {
        this.flight = false;
        this.events.push({ key: 'flightDone', n: this.flightCount.gynes, m: this.flightCount.males });
      }
      return;
    }
    if (col.alates.length === 0 || year === this.flightYear || this.dormant) return;
    if (doy < 95 || doy > 165 || this.dayT < 0.42 || this.dayT > 0.58) return;
    const afterRain = this.tick - this.lastRain < DAY_TICKS * 2 || doy > 145;
    if (!afterRain || this.raining || this.cloud > 0.6 || this.surfaceT < 20 || this.surfaceT > 36) return;
    this.flight = true;
    this.flightYear = year;
    this.flightCount = { gynes: 0, males: 0 };
    this.openNest();
    this.events.push({ key: 'flight', x: this.nest.foundX, y: this.world.ground[this.nest.foundX]! - 12 });
  }

  /** An alate leaves the ground: off it goes, up and away on the breeze. */
  takeOff(a: Ant): void {
    if (a.caste === 'gyne') this.flightCount.gynes++;
    else this.flightCount.males++;
    this.colony.flown.total++;
    this.flyers.push({ x: a.x + 0.5, y: a.y, vx: this.rng.range(-0.15, 0.25), vy: this.rng.range(-0.35, -0.22), caste: a.caste, t: 0 });
  }

  /**
   * Widen and deepen the known world to take in the nest and wherever the
   * ants have been, a little beyond. It never shrinks; it eases outward.
   */
  private updateView(): void {
    if (!this.nest.founded) return;
    const w = this.world;
    const fog = this.fog;
    // Ants learn the world around them: a few centimetres out on the meadow,
    // less underground, where they know the soil around their tunnels.
    const see = (a: Ant, r: number): void => {
      const under = w.bg[a.y * w.w + a.x] === 1 && a.y > w.ground[a.x]! + 2;
      fog.reveal(a.x, a.y, under ? r * 0.45 : r, !under);
    };
    if (this.tick % 10 === 0) {
      fog.look();
      for (const a of this.colony.ants) if (!a.away) see(a, 38);
      const q = this.colony.queen;
      if (q?.alive) see(q, 40);
    }
    // The view (and the camera's "whole colony" framing) follows what is known.
    const b = fog.box;
    const g = this.viewGoal;
    g.x0 = Math.max(0, b.x0 - 30);
    g.x1 = Math.min(w.w, b.x1 + 30);
    g.y1 = Math.min(w.h, b.y1 + 30);
    const v = this.view;
    const k = 0.08;
    v.x0 += (g.x0 - v.x0) * k;
    v.x1 += (g.x1 - v.x1) * k;
    v.y1 += (g.y1 - v.y1) * k;
  }

  /**
   * What the diggers run into: an old burrow of the local digger (open
   * tunnels the nest breaks into), limestone, a tree root, the lime layer.
   */
  private discoveries(): void {
    const w = this.world;
    const W = w.w;
    const once = (key: string, ev: SimEvent): void => {
      if (this.discovered[key]) return;
      this.discovered[key] = true;
      this.events.push(ev);
    };
    for (const i of this.nest.frontier) {
      for (const n of [i - 1, i + 1, i - W, i + W]) {
        const m = w.mat[n]!;
        const at = { x: n % W, y: (n / W) | 0 };
        if (m === ROCK) once('rock', { key: 'hitRock', what: 'rock', ...at });
        else if (m === STONE && w.tint[n] === 4) once('shard', { key: 'foundShard', ...at });
        else if (m === STONE && w.tint[n] === 5) once('bone', { key: 'foundBone', ...at });
        else if (m === WOOD) once('wood', { key: 'hitRock', what: 'wood', ...at });
        else if (m === LIME) once('lime', { key: 'hitLime', ...at });
      }
    }
    if (!this.discovered.burrow) {
      for (const i of this.nest.planCells) {
        if (w.mat[i] !== EMPTY) continue;
        for (const n of [i - 1, i + 1, i - W, i + W]) {
          if (w.mat[n] === EMPTY && !w.plan[n] && w.bg[n] === 1) {
            once('burrow', { key: 'foundBurrow', who: SITES[this.site].burrower ?? 'vole', x: n % W, y: (n / W) | 0 });
            break;
          }
        }
        if (this.discovered.burrow) break;
      }
    }
  }

  /**
   * Sand holds a tunnel only while it is damp: a dry ceiling of loose sand
   * trickles down into the tunnel below, and the diggers have to clear it.
   */
  private drySand(): void {
    const w = this.world;
    const cells = this.nest.planCells;
    if (cells.length === 0) return;
    for (let k = 0; k < 6; k++) {
      const i = cells[this.rng.int(0, cells.length - 1)]!;
      if (w.mat[i] !== EMPTY) continue;
      const up = i - w.w;
      if (w.mat[up] !== SANDY || w.moist[up]! > 40) continue;
      if (this.rng.next() < 0.25) {
        w.set(up, SAND, w.tone[up], SANDY);
        if (!w.plan[up]) w.claimed.push(up);
      }
    }
  }

  /** How much a flat stone lying over this spot warms it in the sun, °C. */
  stoneWarmth(x: number, y: number): number {
    const w = this.world;
    for (let yy = y - 1; yy > y - 45 && yy > 0; yy--) {
      const m = w.mat[yy * w.w + x]!;
      if (m === STONE) return 5 * this.cal.daylight(this.dayT, this.doy) * (1 - this.cloud * 0.7);
      if (m === EMPTY && w.bg[yy * w.w + x] === 0) break;
    }
    return 0;
  }

  /** A digger turned up a seed buried in the soil (reported once a year). */
  buriedSeed(): void {
    const y = this.cal.year(this.simDays);
    if (this.seedFindYear === y) return;
    this.seedFindYear = y;
    this.events.push({ key: 'foundSeeds' });
  }

  /**
   * Unshut the nest: the workers inside push the plug up and out onto the
   * spoil ring. (Left for the diggers to clear, it could lock the colony in:
   * the diggers caught inside by the rain all hold a load they cannot dump.)
   */
  openNest(): void {
    this.sealAt = 0;
    const w = this.world;
    if (!w.sealed) return;
    for (const [x0, x1, y0, y1] of w.sealBoxes?.length ? w.sealBoxes : [w.sealBox]) {
      for (let y = Math.max(1, y0); y <= Math.min(w.h - 2, y1); y++) {
        for (let x = Math.max(1, x0); x <= Math.min(w.w - 2, x1); x++) {
          const i = y * w.w + x;
          if (w.mat[i] !== SAND || !(w.tint[i]! & PLUG)) continue;
          const src = w.tint[i]! & 0x3f;
          const tone = w.tone[i]!;
          w.set(i, EMPTY, tone, w.bg[i] ? src : 0);
          this.spoil(src, tone, x);
        }
      }
    }
    this.nest.unseal();
    this.nest.scan();
  }

  /** Meltwater (in cells' worth of moisture) soaks into the top of the soil. */
  private meltWater(amount: number): void {
    const w = this.world;
    let left = amount;
    while (left > 0) {
      const x = this.rng.int(2, w.w - 3);
      let y = 1;
      while (y < w.h - 1 && w.mat[y * w.w + x] === EMPTY) y++;
      this.physics.moisture.add(y * w.w + x, 60);
      left -= 1;
    }
  }

  /** Seeds blow in from the meadow beyond the frame. */
  private seasonal(): void {
    const w = this.world;
    if (this.tick % 150 === 0) this.gleaners();
    // Seed blows in all along the slice: the rate (and the most that lies about) scale with its width.
    const monthly = SEED_RAIN_MONTH[this.cal.month(this.doy)]!;
    const across = w.w / 640;
    if (this.looseSeeds < 260 * across && this.rng.next() < (this.seedRain * monthly * across) / TICK_HZ) {
      const x = this.rng.int(12, w.w - 13);
      const i = 2 * w.w + x;
      if (w.mat[i] === EMPTY) w.set(i, SEED, this.rng.int(0, 255), 0);
    }
  }
}
