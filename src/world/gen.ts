import { Noise } from '../util/noise';
import { Rng } from '../util/rng';
import { clamp } from '../util/math';
import { World } from './world';
import { Plants, PlantKind } from './plants';
import { EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, LITTER, BEDROCK, SOIL } from './mat';
import { GROUND_Y } from '../config';

export interface Horizons {
  /** Depth (cells below ground) where each horizon starts, per column. */
  loam: Int16Array;
  clay: Int16Array;
  subsoil: Int16Array;
}

/**
 * Builds a slice of meadow soil at 1 mm per cell: leaf litter and humus on top,
 * brown loam, a reddish clay-rich layer, then pale weathered subsoil with
 * gravel. Pebbles and plant roots are scattered through it.
 */
export function generate(seed: number): { world: World; plants: Plants; horizons: Horizons } {
  const rng = new Rng(seed);
  const noise = new Noise(seed * 7 + 1);
  const world = new World(640, 360);
  const { w, h } = world;

  for (let x = 0; x < w; x++) {
    const g = GROUND_Y + noise.fbm1(x / 110, 3) * 7 + noise.fbm1(x / 23 + 40, 2) * 1.6;
    world.ground[x] = Math.round(g);
  }

  const hz: Horizons = { loam: new Int16Array(w), clay: new Int16Array(w), subsoil: new Int16Array(w) };
  for (let x = 0; x < w; x++) {
    hz.loam[x] = Math.round(17 + noise.fbm1(x / 60 + 100) * 6);
    hz.clay[x] = Math.round(112 + noise.fbm1(x / 80 + 200) * 16);
    hz.subsoil[x] = Math.round(196 + noise.fbm1(x / 70 + 300) * 14);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = y - world.ground[x]!;
      if (d < 0) continue;
      world.bg[i] = 1;
      if (y >= h - 3) {
        world.mat[i] = BEDROCK;
        world.tone[i] = rng.int(0, 255);
        continue;
      }
      // Mottled boundaries: jitter the depth a little per cell.
      const j = d + noise.fbm2(x / 5, y / 5, 2) * 4 + rng.range(-1.2, 1.2);
      let m = HUMUS;
      if (j >= hz.subsoil[x]!) m = SUBSOIL;
      else if (j >= hz.clay[x]!) m = CLAY;
      else if (j >= hz.loam[x]!) m = LOAM;
      world.mat[i] = m;
      // Tone: soft blotches plus grain.
      const blotch = noise.fbm2(x / 9 + 50, y / 7, 3);
      world.tone[i] = clamp(Math.round(128 + blotch * 110 + rng.range(-40, 40)), 0, 255);
      // Gravel grows more common with depth.
      const gravelP = m === SUBSOIL ? 0.05 : m === CLAY ? 0.018 : m === LOAM ? 0.006 : 0;
      if (rng.chance(gravelP)) {
        world.mat[i] = GRAVEL;
        world.tone[i] = rng.int(0, 255);
      }
    }
  }

  // Pebbles: blobby ellipses, shaded from the upper left.
  const pebbles = 70;
  for (let k = 0; k < pebbles; k++) {
    const x = rng.int(4, w - 5);
    const depthBias = Math.pow(rng.next(), 0.6);
    const y = Math.round(GROUND_Y + 8 + depthBias * (h - GROUND_Y - 14));
    const big = rng.chance(0.18);
    const rx = big ? rng.range(5, 11) : rng.range(1.6, 4.5);
    const ry = rx * rng.range(0.55, 0.9);
    const family = rng.int(0, 3);
    stampPebble(world, rng, noise, x, y, rx, ry, family);
  }

  // Surface pebbles half sunk into the ground.
  for (let k = 0; k < 7; k++) {
    const x = rng.int(10, w - 11);
    const r = rng.range(1.8, 4.2);
    stampPebble(world, rng, noise, x, world.ground[x]! + Math.round(r * 0.3), r, r * 0.7, rng.int(0, 3));
  }

  // Leaf litter and twigs lying on the ground.
  for (let k = 0; k < 16; k++) {
    const x0 = rng.int(4, w - 30);
    const len = rng.int(6, 22);
    const twig = rng.chance(0.35);
    const tone = rng.int(0, 255);
    for (let t = 0; t < len; t++) {
      const x = x0 + t;
      const top = surfaceTop(world, x);
      const curl = !twig && (t === 0 || t === len - 1) ? -1 : 0;
      const y = top - 1 + curl;
      if (y > 0) {
        world.mat[y * w + x] = LITTER;
        world.tone[y * w + x] = twig ? 255 - (tone >> 3) : tone;
        world.tint[y * w + x] = twig ? 1 : 0;
      }
    }
  }

  const plants = new Plants(world, rng);
  world.recomputeAllWalk();

  // Meadow plants, spaced out but clumped like a real sward.
  const kinds: PlantKind[] = ['grass', 'grass', 'grass', 'purse', 'purse', 'clover', 'clover'];
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 24; tries++) {
    const x = rng.int(10, w - 11);
    if (plants.list.some((p) => Math.abs(p.x - x) < 9)) continue;
    if (plants.spawn(rng.pick(kinds), x, true)) placed++;
  }

  world.recomputeAllWalk();
  world.dirtyAll = true;
  return { world, plants, horizons: hz };
}

function surfaceTop(world: World, x: number): number {
  for (let y = 1; y < world.h; y++) if (world.mat[y * world.w + x] !== EMPTY) return y;
  return world.h - 1;
}

function stampPebble(world: World, rng: Rng, noise: Noise, cx: number, cy: number, rx: number, ry: number, family: number): void {
  const { w } = world;
  const seed = rng.range(0, 100);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      if (!world.inside(x, y) || y >= world.h - 3) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const wobble = noise.n2(x / 3 + seed, y / 3) * 0.18;
      const d = nx * nx + ny * ny;
      if (d > 1 + wobble) continue;
      const i = y * w + x;
      if (world.bg[i] !== 1 && !SOIL[world.mat[i]!]) {
        // Above ground only the buried part of a surface pebble counts; let it poke out.
        if (y < world.ground[x]! - Math.round(ry * 1.2)) continue;
      }
      world.mat[i] = STONE;
      // Light from the upper left: highlight on that rim, shadow opposite.
      const lit = -(nx * 0.6 + ny * 0.8);
      const rim = Math.sqrt(d);
      const shade = clamp(Math.round(128 + lit * 70 * rim + rng.range(-14, 14) - (rim > 0.85 ? 10 : 0)), 0, 255);
      world.tone[i] = shade;
      world.tint[i] = family;
    }
  }
}
