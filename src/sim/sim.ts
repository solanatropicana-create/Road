import { Rng } from '../util/rng';
import { generate, Horizons } from '../world/gen';
import { World } from '../world/world';
import { Plants } from '../world/plants';
import { Physics } from '../world/physics';
import { EMPTY, SAND, SEED, FRUIT, SOLID, REFUSE } from '../world/mat';
import { Nest } from './nest';
import { Fields, F, FIELD_COUNT } from './fields';
import { Colony } from './colony';
import { Ant } from './ant';
import { Particles } from './particles';
import { Task } from './types';
import { TUNING, TICK_HZ, DAY_TICKS } from '../config';
import { pack, sampleRamp, PAL, mixRGB } from '../render/palette';
import { HUMUS, LOAM, CLAY, SUBSOIL } from '../world/mat';

export type Phase = 'choose' | 'founding' | 'growing' | 'failed';

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
  private pherCells: number[] = [];
  tick = 0;
  /** Day starts mid-morning. */
  readonly dayOffset = 0.32;
  seedRain = 0.4;
  /** Seeds lying loose on the surface (birds and mice keep this in check). */
  looseSeeds = 0;
  private src: Int32Array;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new Rng(seed ^ 0xa5a5a5);
    const gen = generate(seed);
    this.world = gen.world;
    this.plants = gen.plants;
    this.horizons = gen.horizons;
    this.physics = new Physics(this.world, this.rng);
    this.nest = new Nest(this.world, this.rng, seed);
    this.fields = new Fields(this.world);
    this.colony = new Colony(this.world.size);
    this.pher = new Float32Array(this.world.size);
    this.src = new Int32Array(this.world.size);
  }

  get dayT(): number {
    return (this.tick / DAY_TICKS + this.dayOffset) % 1;
  }

  get day(): number {
    return Math.floor(this.tick / DAY_TICKS + this.dayOffset) + 1;
  }

  get phase(): Phase {
    if (!this.nest.founded) return 'choose';
    if (this.colony.failed) return 'failed';
    return this.colony.hadWorkers ? 'growing' : 'founding';
  }

  /** Is this column a reasonable place for a queen to dig in? */
  canFound(x: number): boolean {
    return x > 40 && x < this.world.w - 40;
  }

  /** A mated queen lands at column x and starts her colony. */
  found(x: number): void {
    if (this.nest.founded) return;
    const w = this.world;
    x = Math.max(40, Math.min(w.w - 40, Math.round(x)));
    // Land on top of whatever is there (litter, a pebble), then walk down into the burrow.
    let y = 1;
    while (y < w.h - 1 && !SOLID[w.mat[(y + 1) * w.w + x]!]) y++;
    const q = new Ant('queen', x, y, Number.MAX_SAFE_INTEGER, TUNING.queenSpeed);
    q.wings = true;
    q.phase = 0;
    q.task = Task.Found;
    q.orient(this, 1, 0);
    this.colony.queen = q;
    this.colony.middenSide = this.rng.chance(0.5) ? -1 : 1;
    this.nest.found(x);
    this.nest.scan();
    for (let f = 0; f < FIELD_COUNT; f++) this.buildField(f);
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

  /** The founding queen heaves spoil out of her burrow mouth. */
  spoil(tint: number, tone: number): void {
    const w = this.world;
    const x0 = this.nest.foundX;
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
        for (const c of nest.chambers) {
          if (c.kind !== 'granary' || !c.ready || c.seeds >= c.capacity) continue;
          const lim = c.floorY - Math.round(c.h * 0.45);
          for (const i of c.floor) if (((i / w.w) | 0) >= lim) push(i);
        }

        break;
      }
      case F.Store:
        for (const i of col.storeCells) {
          for (const d of [-w.w, -1, 1, -w.w - 1, -w.w + 1]) if (w.walk[i + d]) push(i + d);
        }
        break;
      case F.Nurse:
        for (const c of nest.chambers) {
          if (c.kind !== 'nursery' || !c.ready) continue;
          for (const i of c.floor) if (!col.broodCell[i]) push(i);
        }
        break;
      case F.Larva:
        for (const b of col.brood) if (col.isHungry(b)) push(b.y * w.w + b.x);
        break;
      case F.Egg: {
        if (this.fields.sourceCount[F.Nurse] === 0) break;
        for (const b of col.brood) {
          if (b.stage !== 0 || b.carried) continue;
          const i = b.y * w.w + b.x;
          if (nest.chamberAt(i)?.kind !== 'nursery') push(i);
        }
        break;
      }
      case F.Trash: {
        for (const c of col.corpses) if (!c.carried) push(c.y * w.w + c.x);
        for (const c of nest.chambers) {
          // Husks wait on the floor of whichever room holds the stores.
          const store = col.husks > 0 && c.ready && (c.kind === 'granary' || c.kind === 'queen');
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

  /** Birds and mice glean the surface, so fallen seed never piles up for long. */
  private gleaners(): void {
    const w = this.world;
    const found: number[] = [];
    const y0 = 30;
    const y1 = 100;
    for (let y = y0; y < y1; y++) {
      for (let x = 1; x < w.w - 1; x++) {
        const i = y * w.w + x;
        if (w.mat[i] === SEED && w.bg[i] === 0) found.push(i);
      }
    }
    this.looseSeeds = found.length;
    const eat = Math.max(0, Math.floor((found.length - 160) / 6)) + (this.rng.chance(0.3) ? 1 : 0);
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
    this.plants.tick();
    this.physics.step();
    if (this.tick % 15 === 0) this.nest.scan();
    if (this.nest.founded) {
      this.colony.tick(this);
      // Rebuild at most one distance field per tick, whichever is most overdue.
      const f = this.fields.nextDue(this.tick);
      if (f >= 0) this.buildField(f);
      if (this.tick % (TICK_HZ * 3) === 0 && this.colony.hadWorkers) this.growNest();
    }
    if ((this.tick & 3) === 0) this.decayPheromone();
    this.particles.step();
    this.weather();
  }

  private growNest(): void {
    const col = this.colony;
    const wanted = Nest.wanted(col.adults, col.brood.length, TUNING.nestCellsPerAnt, TUNING.nestCellsBase);
    this.nest.grow({ adults: col.adults, brood: col.brood.length, seeds: col.stored, orders: col.orders }, wanted);
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

  /** Seeds blow in from the meadow beyond the frame; now and then a berry drops. */
  private weather(): void {
    const w = this.world;
    if (this.tick % 150 === 0) this.gleaners();
    if (this.looseSeeds < 260 && this.rng.next() < this.seedRain / TICK_HZ) {
      const x = this.rng.int(12, w.w - 13);
      const i = 2 * w.w + x;
      if (w.mat[i] === EMPTY) w.set(i, SEED, this.rng.int(0, 255), 0);
    }
    if (this.rng.next() < 1 / (TICK_HZ * 240)) {
      const cx = this.rng.int(30, w.w - 31);
      for (let dy = 0; dy < 4; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + (dy - 1.5) * (dy - 1.5) > 5) continue;
          const i = (3 + dy) * w.w + cx + dx;
          if (w.mat[i] === EMPTY) w.set(i, FRUIT, this.rng.int(0, 255), 0);
        }
    }
  }
}
