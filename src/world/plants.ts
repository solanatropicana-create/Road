import { Rng } from '../util/rng';
import { World } from './world';
import { EMPTY, STEM, LEAF, FLOWER, SEEDHEAD, SEED, ROOT, SOIL, SOLID, REFUSE, SAND } from './mat';
import { SPROUT } from './moisture';
import { TICK_HZ } from '../config';
import { SEED_TONE } from '../render/palette';

export type PlantKind = 'grass' | 'clover' | 'purse' | 'stipa' | 'erodium';
export const PLANT_KINDS: PlantKind[] = ['grass', 'clover', 'purse', 'stipa', 'erodium'];

/**
 * What the colony's plants do through the year. The harvest follows them:
 * stork's bill and shepherd's purse seed in spring, the grasses in early
 * summer, clover later; then the meadow yellows, the annuals die and the
 * perennials die back to a tuft until spring.
 *   grass   – brome and meadow grasses (Bromus, Poa): perennial, seed June–August.
 *   clover  – Trifolium: perennial, seed July–September.
 *   purse   – shepherd's purse (Capsella): annual, seeds from April to October.
 *   stipa   – feather grass: perennial, seed late May–June, long feathered awns.
 *   erodium – stork's bill: spring annual, seed April–June; its awned seeds
 *             drill themselves into the ground when they get wet.
 */
interface Species {
  annual: boolean;
  /** Days of the year when seed ripens on the plant. */
  ripen: [number, number];
}
export const SPECIES: Record<PlantKind, Species> = {
  grass: { annual: false, ripen: [150, 235] },
  clover: { annual: false, ripen: [170, 270] },
  purse: { annual: true, ripen: [95, 290] },
  stipa: { annual: false, ripen: [140, 190] },
  erodium: { annual: true, ripen: [100, 172] },
};

/**
 * Stems and leaves keep their shade in the low six bits of the plant tone and
 * how dry they are (0 green .. 3 dead) in the top two.
 */
export const DRY_SHIFT = 6;

interface Part {
  i: number;
  m: number;
  tone: number;
}

/**
 * A plant is a list of cells it grows into, plus seed slots that ripen over
 * time. Stems are real cells, so ants climb them to reach the seeds.
 */
export class Plant {
  readonly kind: PlantKind;
  readonly x: number;
  readonly baseY: number;
  readonly parts: Part[] = [];
  readonly slots: number[] = [];
  grown = 0;
  regrow: number;
  timer: number;
  /** 0 green, 1 yellowing, 2 straw, 3 dead (winter). */
  dry = 0;
  /** A perennial died back to its tuft for the winter. */
  resting = false;
  /** It has set seed this year (an annual dies once its season is over). */
  seeded = false;

  constructor(kind: PlantKind, x: number, baseY: number, rng: Rng) {
    this.kind = kind;
    this.x = x;
    this.baseY = baseY;
    this.regrow = Math.round(rng.range(9, 20) * TICK_HZ);
    this.timer = rng.int(0, this.regrow);
  }

  get mature(): boolean {
    return this.grown >= this.parts.length;
  }
}

const SEED_DROP_CHANCE = 1 / (TICK_HZ * 90);
/** Chance per tick of adding the next cell of a growing plant (a few weeks to full size). */
const GROW_CHANCE = 0.0025;

export class Plants {
  readonly list: Plant[] = [];
  private rng: Rng;
  private world: World;
  maxPlants = 34;
  /** Seeds that ripened since the last stats read (for balancing). */
  ripened = 0;
  /** This site's mix of species, as weights (new plants from the seed bank). */
  mix: Partial<Record<PlantKind, number>> = { grass: 4, purse: 2, clover: 2 };
  /** Seedlings that came up on the colony's chaff heap since the last read. */
  gardens = 0;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
  }

  /** Top-most solid cell of a column at or below the original ground. */
  surfaceAt(x: number): number {
    const w = this.world;
    for (let y = 1; y < w.h; y++) {
      const m = w.mat[y * w.w + x]!;
      if (SOLID[m]) return y;
    }
    return w.h - 1;
  }

  spawn(kind: PlantKind, x: number, instant: boolean, ripe = instant): Plant | null {
    const w = this.world;
    if (x < 6 || x > w.w - 7) return null;
    const ground = this.surfaceAt(x);
    // Soil, or the colony's own heaps (seedlings come up on the chaff and spoil).
    const gm = w.mat[ground * w.w + x]!;
    if (!SOIL[gm] && gm !== REFUSE && gm !== SAND) return null;
    const p = new Plant(kind, x, ground, this.rng);
    this.design(p);
    // Nothing takes root in the nest's crater (it would grow with its stem cut).
    if (p.parts.some((pt) => w.plan[pt.i])) return null;
    this.roots(p);
    this.list.push(p);
    if (instant) {
      while (!p.mature) this.growStep(p);
      if (ripe) for (const s of p.slots) if (this.rng.chance(0.6) && w.mat[s] === EMPTY && !w.plant[s]) w.setPlant(s, SEEDHEAD, this.seedTone(p));
    }
    return p;
  }

  /** A species drawn from this site's mix. */
  pickKind(): PlantKind {
    let total = 0;
    for (const k of PLANT_KINDS) total += this.mix[k] ?? 0;
    let r = this.rng.next() * total;
    for (const k of PLANT_KINDS) {
      r -= this.mix[k] ?? 0;
      if (r < 0) return k;
    }
    return 'grass';
  }

  private add(p: Plant, x: number, y: number, m: number, tone?: number): void {
    const w = this.world;
    if (x < 1 || x >= w.w - 1 || y < 1 || y >= p.baseY) return;
    const i = y * w.w + x;
    if (p.parts.some((q) => q.i === i)) return;
    // Green parts keep their shade in the low bits (the top two say how dry they are).
    const green = m === STEM || m === LEAF;
    p.parts.push({ i, m, tone: green ? (tone ?? this.rng.int(0, 63)) & 63 : (tone ?? this.rng.int(0, 255)) });
  }

  private design(p: Plant): void {
    const r = this.rng;
    const x0 = p.x;
    const y0 = p.baseY - 1;
    if (p.kind === 'grass') {
      const h = r.int(38, 74);
      const lean = r.range(-0.18, 0.18);
      const bend = r.range(-9, 9);
      const stemTone = r.int(0, 255);
      const stemX: number[] = [];
      for (let t = 0; t < h; t++) {
        const f = t / h;
        const x = Math.round(x0 + lean * t + bend * f * f);
        stemX.push(x);
        this.add(p, x, y0 - t, STEM, stemTone);
        // Leaf blades arch out from the lower stem.
        if (t === 2 || t === Math.round(h * 0.22) || (t === Math.round(h * 0.4) && r.chance(0.6))) {
          const side = r.chance(0.5) ? -1 : 1;
          const len = r.int(7, 15);
          let bx = x;
          let by = y0 - t;
          for (let k = 1; k <= len; k++) {
            bx += side;
            if (k < len * 0.55) by -= 1;
            else if (k > len * 0.8) by += 1;
            this.add(p, bx, by, LEAF, stemTone);
          }
        }
      }
      // Panicle: spikelets along the top of the stem.
      const top = Math.min(12, Math.floor(h * 0.28));
      for (let t = h - top; t < h; t += 2) {
        const x = stemX[t]!;
        const side = ((t >> 1) & 1) === 0 ? -1 : 1;
        p.slots.push((y0 - t) * this.world.w + x + side);
        if (r.chance(0.5)) p.slots.push((y0 - t - 1) * this.world.w + x - side);
      }
      p.slots.push((y0 - h) * this.world.w + stemX[h - 1]!);
    } else if (p.kind === 'clover') {
      const petioles = r.int(2, 4);
      for (let k = 0; k < petioles; k++) {
        const h = r.int(6, 15);
        const dx = r.int(-5, 5);
        const tone = r.int(0, 255);
        for (let t = 0; t < h; t++) this.add(p, x0 + Math.round((dx * t) / h), y0 - t, STEM, tone);
        const tx = x0 + dx;
        const ty = y0 - h;
        // Three round leaflets.
        for (const [lx, ly] of [[-2, 0], [2, 0], [0, -2]] as const) {
          for (let yy = -1; yy <= 1; yy++)
            for (let xx = -1; xx <= 1; xx++) if (xx * xx + yy * yy <= 1 || r.chance(0.35)) this.add(p, tx + lx + xx, ty + ly + yy, LEAF, tone);
        }
      }
      const fh = r.int(13, 22);
      const fdx = r.int(-3, 3);
      for (let t = 0; t < fh; t++) this.add(p, x0 + Math.round((fdx * t) / fh), y0 - t, STEM);
      const fx = x0 + fdx;
      const fy = y0 - fh - 2;
      const pink = r.chance(0.4) ? 200 : 40;
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 5) this.add(p, fx + xx, fy + yy, FLOWER, pink + r.int(0, 50));
      p.slots.push((fy + 3) * this.world.w + fx - 1, (fy + 3) * this.world.w + fx + 1);
    } else if (p.kind === 'stipa') {
      // Feather grass: a fountain of fine leaves, and tall culms whose seeds
      // trail long silvery awns.
      const tone = r.int(0, 63);
      const blades = r.int(8, 13);
      for (let k = 0; k < blades; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const len = r.int(14, 34);
        const spread = r.range(0.15, 0.7);
        let bx = x0 + r.int(-1, 1);
        let by = y0;
        for (let t = 0; t < len; t++) {
          const f = t / len;
          by -= f < 0.6 ? 1 : f < 0.8 ? 0.4 : -0.6;
          bx += side * spread * (0.3 + f);
          this.add(p, Math.round(bx), Math.round(by), LEAF, tone + r.int(-3, 3));
        }
      }
      const culms = r.int(1, 3);
      for (let k = 0; k < culms; k++) {
        const h = r.int(56, 96);
        const lean = r.range(-0.22, 0.22);
        let x = x0;
        for (let t = 0; t < h; t++) {
          x = Math.round(x0 + lean * t);
          this.add(p, x, y0 - t, STEM, tone);
        }
        const tipY = y0 - h;
        // Seeds at the top, each with an awn arching away downwind.
        const side = lean >= 0 ? 1 : -1;
        for (let q = 0; q < r.int(1, 3); q++) {
          const sx = x + (q === 0 ? 0 : side * q);
          const sy = tipY + q * 2;
          p.slots.push(sy * this.world.w + sx);
          let ax = sx;
          let ay = sy - 1;
          let a = -Math.PI / 2 + side * r.range(0.5, 0.9);
          const len = r.int(18, 36);
          for (let t = 0; t < len; t++) {
            a += side * r.range(0.03, 0.08);
            ax += Math.cos(a);
            ay += Math.sin(a);
            this.add(p, Math.round(ax), Math.round(ay), FLOWER, r.int(0, 50));
          }
        }
      }
    } else if (p.kind === 'erodium') {
      // Stork's bill: a flat rosette of feathery leaves, short stalks with
      // pink flowers and long-beaked fruits.
      const tone = r.int(0, 63);
      const leaves = r.int(4, 7);
      for (let k = 0; k < leaves; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const len = r.int(6, 13);
        const rise = r.range(0.05, 0.35);
        for (let t = 1; t <= len; t++) {
          const x = x0 + side * t;
          const y = Math.round(y0 - t * rise);
          this.add(p, x, y, LEAF, tone);
          // Pinnate lobes.
          if (t % 2 === 0) this.add(p, x, y - 1, LEAF, tone + 4);
          if (t % 3 === 1 && t > 1) this.add(p, x, y + 1 > y0 ? y : y + 1, LEAF, tone + 2);
        }
      }
      const stalks = r.int(2, 4);
      for (let k = 0; k < stalks; k++) {
        const h = r.int(10, 24);
        const dx = r.int(-6, 6);
        for (let t = 0; t < h; t++) this.add(p, x0 + Math.round((dx * t) / h), y0 - t, STEM, tone);
        const tx = x0 + dx;
        const ty = y0 - h;
        if (k % 2 === 0) {
          for (const [fx, fy] of [[-1, 0], [1, 0], [0, -1], [0, 0]] as const) this.add(p, tx + fx, ty + fy, FLOWER, r.int(170, 255));
        } else {
          // Fruits: a seed at the base of each long beak.
          for (const fx of [-1, 1]) {
            p.slots.push(ty * this.world.w + tx + fx);
            for (let b = 1; b <= r.int(5, 8); b++) this.add(p, tx + fx, ty - b, STEM, tone + 6);
          }
        }
      }
    } else {
      // Shepherd's purse: rosette, tall stem, heart-shaped pods along the top half.
      const h = r.int(26, 58);
      const tone = r.int(0, 255);
      for (const side of [-1, 1]) {
        const len = r.int(3, 7);
        for (let k = 1; k <= len; k++) this.add(p, x0 + side * k, y0 - (k > len - 2 ? 1 : 0), LEAF, tone);
      }
      const lean = r.range(-0.1, 0.1);
      for (let t = 0; t < h; t++) {
        const x = Math.round(x0 + lean * t);
        this.add(p, x, y0 - t, STEM, tone);
        if (t > h * 0.45 && t < h - 3 && t % 3 === 0) {
          const side = (t / 3) % 2 === 0 ? -1 : 1;
          this.add(p, x + side, y0 - t - 1, STEM, tone);
          p.slots.push((y0 - t - 2) * this.world.w + x + side * 2);
        }
      }
      const tx = Math.round(x0 + lean * h);
      for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [0, -1]] as const) this.add(p, tx + dx, y0 - h + dy, FLOWER, r.int(0, 40));
    }
  }

  private roots(p: Plant): void {
    const w = this.world;
    const r = this.rng;
    const put = (x: number, y: number): void => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (!w.inside(xi, yi)) return;
      const i = yi * w.w + xi;
      if (SOIL[w.mat[i]!]) w.set(i, ROOT, r.int(0, 255));
    };
    if (p.kind !== 'grass' && p.kind !== 'stipa') {
      // Clover, shepherd's purse and stork's bill: one tapering taproot with a few laterals.
      let x = p.x;
      let a = Math.PI / 2 + r.range(-0.2, 0.2);
      const len = r.int(22, 40);
      for (let t = 0; t < len; t++) {
        a += r.range(-0.25, 0.25) + (Math.PI / 2 - a) * 0.15;
        x += Math.cos(a);
        const y = p.baseY + 1 + t;
        put(x, y);
        if (t < len * 0.45) put(x + 1, y);
        if (t > 3 && r.chance(0.1)) this.rootlet(x, y, r.chance(0.5) ? 0.5 : Math.PI - 0.5, r.int(4, 10), put);
      }
      return;
    }
    // Grasses: a fibrous mat of fine roots, mostly straight down, wandering (feather grass deeper).
    const count = p.kind === 'stipa' ? r.int(8, 12) : r.int(5, 9);
    for (let k = 0; k < count; k++) {
      let x = p.x + r.range(-1.5, 1.5);
      let y = p.baseY + 1;
      let a = Math.PI / 2 + r.range(-0.55, 0.55);
      const len = p.kind === 'stipa' ? r.int(30, 80) : r.int(12, 48);
      for (let t = 0; t < len; t++) {
        a += r.range(-0.3, 0.3) + (Math.PI / 2 - a) * 0.08;
        x += Math.cos(a);
        y += Math.max(0.35, Math.sin(a));
        put(x, y);
        if (r.chance(0.06)) this.rootlet(x, y, a + (r.chance(0.5) ? 0.9 : -0.9), r.int(2, 6), put);
      }
    }
  }

  /** A fine side root: short, thread-like, curling downward. */
  private rootlet(x: number, y: number, a: number, len: number, put: (x: number, y: number) => void): void {
    for (let q = 0; q < len; q++) {
      a += this.rng.range(-0.3, 0.3) + (Math.PI / 2 - a) * 0.12;
      x += Math.cos(a);
      y += Math.sin(a);
      put(x, y);
    }
  }

  /** Seed tone carries the species (see seedLook in the palette). */
  private seedTone(p: Plant): number {
    const [lo, hi] = SEED_TONE[p.kind]!;
    return this.rng.int(lo, hi);
  }

  /** Take a plant out entirely: stem, leaves, flowers and any seeds still on it. */
  remove(p: Plant): void {
    const w = this.world;
    for (const pt of p.parts) if (w.plant[pt.i]) w.setPlant(pt.i, 0);
    for (const s of p.slots) if (w.plant[s]) w.setPlant(s, 0);
    const k = this.list.indexOf(p);
    if (k >= 0) this.list.splice(k, 1);
  }

  private growStep(p: Plant): void {
    const w = this.world;
    const part = p.parts[p.grown++]!;
    // Plants don't grow into the nest's crater; a plant gone to straw grows no new flowers.
    if (part.m === FLOWER && p.dry >= 2 && p.kind !== 'stipa') return;
    if (w.mat[part.i] === EMPTY && !w.plant[part.i] && !w.plan[part.i]) w.setPlant(part.i, part.m, this.partTone(p, part));
  }

  private partTone(p: Plant, part: Part): number {
    return part.m === STEM || part.m === LEAF ? (part.tone & 63) | (p.dry << DRY_SHIFT) : part.tone;
  }

  /**
   * Plants grow and ripen in their season. `doy` is the day of the year,
   * `air` today's mean air temperature, `plenty` how much more seed they set
   * than a real meadow (the faster tempos).
   */
  tick(doy: number, air: number, damp = false, plenty = 1): void {
    const w = this.world;
    const growing = air > 7;
    for (const p of this.list) {
      if (!p.mature) {
        // Perennials regrow from their tuft faster than a seedling starts.
        if (growing && !p.resting && this.rng.next() < GROW_CHANCE * (p.parts.length > 60 ? 1.6 : 1)) this.growStep(p);
        continue;
      }
      const sp = SPECIES[p.kind];
      // (A richer meadow, at the faster tempos, ripens its seed sooner.)
      if (doy >= sp.ripen[0] && doy <= sp.ripen[1] && air > 8 && (p.timer -= plenty) <= 0) {
        p.timer = p.regrow;
        // Ripen one empty slot that still hangs off the plant.
        const s = p.slots[this.rng.int(0, p.slots.length - 1)];
        if (s !== undefined && w.mat[s] === EMPTY && !w.plant[s] && !w.plan[s] && this.attached(s)) {
          w.setPlant(s, SEEDHEAD, this.seedTone(p));
          this.ripened++;
          p.seeded = true;
        }
      }
      // Ripe seeds drop on their own now and then; once the season is over the heads shatter.
      const drop = doy > sp.ripen[1] ? SEED_DROP_CHANCE * 6 : SEED_DROP_CHANCE;
      for (const s of p.slots) if (w.plant[s] === SEEDHEAD && this.rng.next() < drop) this.shed(s);
    }
    this.germinate(doy, air, damp);
  }

  /** A ripe seed falls from the plant. */
  private shed(s: number): void {
    const w = this.world;
    const tone = w.ptone[s]!;
    w.setPlant(s, 0);
    if (w.mat[s] === EMPTY) w.set(s, SEED, tone);
  }

  /**
   * The turn of the year, checked a few times a day: the meadow yellows after
   * seeding, the annuals die, the perennials die back to a tuft in the cold
   * and come again in spring.
   */
  season(doy: number, air: number): void {
    for (const p of [...this.list]) {
      const sp = SPECIES[p.kind];
      if (sp.annual) {
        // An annual dies once it has seeded and its season is over. One that
        // came up in autumn spends the winter as a rosette and seeds first
        // thing in spring: the earliest food of the year.
        if (p.seeded && doy > sp.ripen[1] + 28) {
          this.die(p);
          continue;
        }
      } else if (!p.resting && air < 5 && doy > 240) {
        this.dieBack(p);
      } else if (p.resting && air > 7 && doy < 200) {
        p.resting = false;
        this.setDry(p, 0);
      }
      const lvl = p.resting ? 3 : doy < sp.ripen[1] || (sp.annual && !p.seeded) ? 0 : doy < sp.ripen[1] + 21 ? 1 : 2;
      if (lvl !== p.dry) this.setDry(p, lvl);
    }
  }

  private setDry(p: Plant, lvl: number): void {
    const w = this.world;
    p.dry = lvl;
    for (const pt of p.parts) {
      if (w.plant[pt.i] !== pt.m) continue;
      if (pt.m === FLOWER && lvl >= 2 && p.kind !== 'stipa') w.setPlant(pt.i, 0);
      else if (pt.m === STEM || pt.m === LEAF) w.setPlant(pt.i, pt.m, this.partTone(p, pt));
    }
  }

  /** An annual's life is over: its last seeds fall and it is gone. */
  private die(p: Plant): void {
    for (const s of p.slots) if (this.world.plant[s] === SEEDHEAD) this.shed(s);
    this.remove(p);
  }

  /** A perennial dies back for the winter to a low tuft at the base. */
  private dieBack(p: Plant): void {
    const w = this.world;
    for (const s of p.slots) if (w.plant[s] === SEEDHEAD) this.shed(s);
    const tuft = p.kind === 'clover' ? 3 : 7;
    for (const pt of p.parts) if (Math.floor(pt.i / w.w) < p.baseY - tuft && w.plant[pt.i] === pt.m) w.setPlant(pt.i, 0);
    p.resting = true;
    p.dry = 3;
    // It regrows from the start of its part list (the tuft is still standing).
    p.grown = 0;
  }

  private attached(i: number): boolean {
    const w = this.world;
    for (const d of [1, -1, w.w, -w.w, w.w + 1, w.w - 1, -w.w + 1, -w.w - 1]) {
      const m = w.plant[i + d];
      if (m === STEM || m === LEAF || m === FLOWER) return true;
    }
    return false;
  }

  /**
   * Seedlings come up in spring (and the grasses again in early autumn) after
   * rain: from a fallen seed, from a sprouted seed the ants threw on their
   * chaff heap (the "ant garden" round a harvester nest), or from the seed
   * bank in the soil. Sampled, not scanned.
   */
  private germinate(doy: number, air: number, damp: boolean): void {
    if (air < 8 || this.list.length >= this.maxPlants || !this.rng.chance(0.04)) return;
    const spring = doy > 60 && doy < 165;
    const autumn = doy > 235 && doy < 290;
    if (!spring && !autumn) return;
    const w = this.world;
    const x = this.rng.int(8, w.w - 9);
    if (this.list.some((p) => Math.abs(p.x - x) < 8)) return;
    // A seed lying on the ground is itself the top-most solid cell.
    const i = this.surfaceAt(x) * w.w + x;
    if (w.bg[i] === 1) return;
    const m = w.mat[i]!;
    // Damp enough to germinate: the top few millimetres of soil still hold rain.
    const wet = damp || w.moist[i]! > 20 || w.moist[i + w.w]! > 20 || w.moist[i + 4 * w.w]! > 12;
    if (m === SEED && wet) {
      const kind = PLANT_KINDS[Math.min(4, Math.floor(w.tone[i]! / 51.2))]!;
      const sp = SPECIES[kind];
      // Annuals start in autumn (to overwinter) or in spring while there is time
      // left to seed; perennials in spring, the grasses in autumn too.
      if (sp.annual ? spring && doy > sp.ripen[1] - 35 : !spring && kind !== 'grass' && kind !== 'stipa') return;
      w.set(i, EMPTY);
      this.spawn(kind, x, false);
    } else if (m === REFUSE && w.tint[i] === SPROUT) {
      w.set(i, EMPTY);
      if (this.spawn(this.pickKind(), x, false)) this.gardens++;
    } else if (wet && this.list.length < this.maxPlants * 0.85 && this.rng.chance(0.15)) {
      // From the seed bank: seed buried in earlier years.
      const kind = this.pickKind();
      const sp = SPECIES[kind];
      if (sp.annual ? !spring || doy < sp.ripen[1] - 35 : spring || kind === 'grass' || kind === 'stipa') this.spawn(kind, x, false);
    }
  }
}
