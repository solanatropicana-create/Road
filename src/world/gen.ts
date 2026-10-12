import { Noise } from '../util/noise';
import { Rng } from '../util/rng';
import { clamp } from '../util/math';
import { World } from './world';
import { Plants, PlantKind } from './plants';
import {
  EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, LITTER, BEDROCK, SOIL, SANDY, LIME, ROCK, WOOD, ROOT, SEED, SAND,
} from './mat';
import { W, H, GROUND_Y } from '../config';
import { SITES, SiteDef, SiteId, Variant, makeVariant } from './sites';
import { SEED_TONE } from '../render/palette';

export interface Horizons {
  /** Depth (cells below ground) where each horizon starts, per column, top layer first. */
  tops: Int16Array[];
}

/** What the generator made that the sim needs to know about. */
export interface Generated {
  world: World;
  plants: Plants;
  horizons: Horizons;
  variant: Variant;
  /** Cells to start wet (ground water near the bottom). */
  wet: number[];
  /** Where a tree stands (trunk centre x, may be off the slice), or null. */
  tree: { x: number; r: number } | null;
}

/**
 * Builds a slice of a real Messor site at 1 mm per cell: the site's soil
 * horizons (chernozem, sand, rendzina on limestone, kastanozem with a lime
 * layer...), then this map's own twists: old backfilled burrows
 * (krotovinas), a clay lens, burrow systems of the local digger, a seed bank
 * in the topsoil, flat stones, a tree or a shrub with woody roots.
 */
export function generate(seed: number, siteId: SiteId): Generated {
  const site = SITES[siteId];
  const variant = makeVariant(siteId, seed);
  const rng = new Rng(seed);
  const noise = new Noise(seed * 7 + 1);
  const world = new World(W, H);
  const { w, h } = world;
  const perM = w / 1000;

  // Ground: a long swell plus small bumps, tilted a little toward the exposure.
  for (let x = 0; x < w; x++) {
    const g = GROUND_Y + noise.fbm1(x / 230, 3) * site.relief + noise.fbm1(x / 40 + 40, 2) * 2 + ((x - w / 2) / w) * variant.exposure * 6;
    world.ground[x] = Math.round(g);
  }

  // Horizon boundaries per column, scaled by this map's depth and wobbled.
  const tops: Int16Array[] = site.layers.map(() => new Int16Array(w));
  site.layers.forEach((L, k) => {
    for (let x = 0; x < w; x++) {
      if (k === 0) {
        tops[k]![x] = 0;
        continue;
      }
      const base = L.top * variant.depthScale;
      tops[k]![x] = Math.round(base + noise.fbm1(x / 70 + k * 100) * (base * 0.1 + 8));
    }
  });

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
      // Mottled boundaries: jitter the depth a little per cell, and let lower
      // horizons reach up in tongues along old cracks.
      const tongue = noise.fbm2(x / 4 + 70, y / 16, 2);
      const j = d + noise.fbm2(x / 5, y / 5, 2) * 4 + rng.range(-1.2, 1.2) + (d > 60 ? Math.max(0, tongue) * 14 : 0);
      let m = site.layers[0]!.mat;
      for (let k = site.layers.length - 1; k > 0; k--) {
        if (j >= tops[k]![x]!) {
          m = site.layers[k]!.mat;
          break;
        }
      }
      world.mat[i] = m;
      const blotch = noise.fbm2(x / 9 + 50, y / 7, 3);
      const crumb = noise.n2(x / 2.2 + 9, y / 1.8 + 3);
      // Deeper horizons were laid down in thin beds: faint wavy lamination.
      const layered = m === SUBSOIL || m === CLAY || m === SANDY || m === ROCK;
      const beds = layered ? Math.sin((y + noise.fbm1(x / 40 + y / 30, 2) * 5) * 0.85) * (m === SUBSOIL || m === ROCK ? 16 : 9) : 0;
      world.tone[i] = clamp(Math.round(128 + blotch * 95 + crumb * 42 + beds + rng.range(-10, 10)), 0, 255);
      const gravelP = m === SUBSOIL ? 0.05 : m === CLAY ? 0.018 : m === LOAM ? 0.006 : m === LIME ? 0.02 : 0;
      if (rng.chance(gravelP)) {
        world.mat[i] = GRAVEL;
        world.tone[i] = rng.int(0, 255);
      }
      // White lime threads (pseudomycelia) just above a lime layer.
      if (m !== LIME && site.layers.some((L) => L.mat === LIME) && rng.chance(0.012)) {
        const limeTop = tops[site.layers.findIndex((L) => L.mat === LIME)]![x]!;
        if (d > limeTop - 90 && d < limeTop) {
          world.mat[i] = LIME;
          world.tone[i] = rng.int(150, 255);
        }
      }
    }
  }

  if (site.layers.some((L) => L.mat === ROCK)) limestoneCracks(world, rng, noise);

  // Krotovinas: old burrows backfilled with soil of another colour (pale loess
  // in black chernozem, dark topsoil in the brown and pale layers). The fill is
  // softer than the soil around it, so ants like to follow them.
  const nKroto = Math.round(site.krotovinas * perM * (0.6 + rng.next() * 0.8));
  for (let k = 0; k < nKroto; k++) krotovina(world, rng, noise);

  if (variant.clayLens) {
    const cx = rng.int(80, w - 80);
    const cy = world.ground[cx]! + rng.int(90, 200);
    blob(world, rng, noise, cx, cy, rng.range(70, 140), rng.range(8, 16), CLAY, 0);
  }

  // Pebbles, more of them with depth; flat stones just under the surface.
  const nStones = Math.round(site.stones * perM);
  for (let k = 0; k < nStones; k++) {
    const x = rng.int(4, w - 5);
    const depthBias = Math.pow(rng.next(), 0.6);
    const y = Math.round(world.ground[x]! + 8 + depthBias * (h - world.ground[x]! - 14));
    const big = rng.chance(0.18);
    const rx = big ? rng.range(5, 11) : rng.range(1.6, 4.5);
    stampPebble(world, rng, noise, x, y, rx, rx * rng.range(0.55, 0.9), rng.int(0, 3));
  }
  for (let k = 0; k < variant.flatStones; k++) {
    const x = rng.int(60, w - 60);
    const rx = rng.range(20, 45);
    stampPebble(world, rng, noise, x, world.ground[x]! + Math.round(rng.range(6, 18)), rx, rng.range(3.5, 6), siteId === 'limestone' ? 3 : rng.int(0, 3));
  }
  for (let k = 0; k < Math.round(7 * perM * (siteId === 'limestone' ? 3 : 1)); k++) {
    const x = rng.int(10, w - 11);
    const r = rng.range(1.8, 4.2);
    stampPebble(world, rng, noise, x, world.ground[x]! + Math.round(r * 0.3), r, r * 0.7, rng.int(0, 3));
  }

  // Shells of land snails in the loess: tiny pale spirals.
  if (siteId === 'pannonian' || siteId === 'vineyard' || siteId === 'pontic') {
    for (let k = 0; k < Math.round(25 * perM); k++) {
      const x = rng.int(4, w - 5);
      const y = world.ground[x]! + rng.int(120, h - world.ground[x]! - 10);
      stampPebble(world, rng, noise, x, y, rng.range(1.0, 1.8), rng.range(0.8, 1.3), 3);
    }
  }

  // The soil seed bank: seeds buried in the top 10 cm. Diggers turn them up.
  const kinds: (keyof typeof SEED_TONE)[] = ['grass', 'clover', 'purse'];
  const nSeeds = Math.round(site.seedBank * variant.seedBankScale * perM);
  for (let k = 0; k < nSeeds; k++) {
    const x = rng.int(3, w - 4);
    const y = world.ground[x]! + Math.round(Math.pow(rng.next(), 1.6) * 100) + 3;
    const i = y * w + x;
    if (!SOIL[world.mat[i]!]) continue;
    const [t0, t1] = SEED_TONE[kinds[rng.int(0, 2)]!]!;
    world.mat[i] = SEED;
    world.tone[i] = rng.int(t0, t1);
  }

  for (let k = 0; k < variant.burrows; k++) burrowSystem(world, rng, noise, site);

  // Leaf litter and twigs lying on the ground.
  for (let k = 0; k < Math.round(16 * perM); k++) {
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

  let tree: Generated['tree'] = null;
  if (variant.tree) tree = makeTree(world, rng, noise);
  if (variant.shrub) makeShrub(world, rng, noise, tree);

  // Ground water near the bottom of the slice.
  const wet: number[] = [];
  if (variant.wetBottom) {
    for (let y = h - 70; y < h - 3; y++) for (let x = 0; x < w; x++) if (SOIL[world.mat[y * w + x]!] && rng.chance(0.7)) wet.push(y * w + x);
  }

  const plants = new Plants(world, rng);
  world.recomputeAllWalk();

  // Meadow plants, spaced out but clumped like a real sward, in this site's mix.
  const mix: PlantKind[] = [];
  for (const [k, n] of Object.entries(site.plants) as [PlantKind, number][]) for (let q = 0; q < n; q++) mix.push(k);
  const want = Math.round(site.plantDensity * perM);
  let placed = 0;
  for (let tries = 0; tries < want * 20 && placed < want; tries++) {
    const x = rng.int(10, w - 11);
    if (plants.list.some((p) => Math.abs(p.x - x) < 9)) continue;
    if (tree && Math.abs(x - tree.x) < tree.r + 6) continue;
    if (plants.spawn(rng.pick(mix), x, true)) placed++;
  }
  plants.maxPlants = Math.round(want * 1.35);

  world.recomputeAllWalk();
  world.dirtyAll = true;
  return { world, plants, horizons: { tops }, variant, wet, tree };
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
      world.tone[i] = clamp(Math.round(128 + lit * 70 * rim + rng.range(-14, 14) - (rim > 0.85 ? 10 : 0)), 0, 255);
      world.tint[i] = family;
    }
  }
}

/** A soft-edged lump of one material inside the soil (a clay lens, say). */
function blob(world: World, rng: Rng, noise: Noise, cx: number, cy: number, rx: number, ry: number, mat: number, toneShift: number): void {
  const { w } = world;
  const s = rng.range(0, 100);
  for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) {
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      if (!world.inside(x, y)) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1 + noise.n2(x / 6 + s, y / 4) * 0.35) continue;
      const i = y * w + x;
      if (!SOIL[world.mat[i]!]) continue;
      world.mat[i] = mat;
      world.tone[i] = clamp(world.tone[i]! + toneShift, 0, 255);
    }
  }
}

function krotovina(world: World, rng: Rng, noise: Noise): void {
  const { w, h } = world;
  let x = rng.range(10, w - 10);
  let y = world.ground[Math.round(x)]! + rng.range(30, 260);
  let a = rng.range(0, Math.PI * 2);
  const len = rng.int(40, 160);
  const r = rng.range(2.5, 5);
  for (let t = 0; t < len; t++) {
    a += rng.range(-0.3, 0.3);
    x += Math.cos(a) * 0.9;
    y += Math.sin(a) * 0.9;
    if (x < 3 || x > w - 4 || y > h - 20) break;
    for (let oy = -5; oy <= 5; oy++)
      for (let ox = -5; ox <= 5; ox++) {
        if (ox * ox + oy * oy > r * r + 0.3) continue;
        const xx = Math.round(x + ox);
        const yy = Math.round(y + oy);
        const i = yy * w + xx;
        if (yy - world.ground[xx]! < 12 || !SOIL[world.mat[i]!] || world.mat[i] === GRAVEL || world.mat[i] === SEED) continue;
        // Filled from above: dark topsoil where it runs through pale layers, pale loess in the black.
        const fill = world.mat[i] === HUMUS ? LOAM : HUMUS;
        world.mat[i] = fill;
        const edge = Math.sqrt(ox * ox + oy * oy) / (r + 0.5);
        world.tone[i] = clamp(Math.round((fill === LOAM ? 70 : 185) + edge * 40 + noise.n2(xx / 2, yy / 2) * 30 + rng.range(-12, 12)), 0, 255);
      }
  }
}

/**
 * Burrows of the local digging mammal crossing the slice: open tunnels a few
 * centimetres wide (ground squirrel, vole, blind mole rat), partly slumped
 * full of loose soil, with a nest chamber lined with dry grass.
 */
function burrowSystem(world: World, rng: Rng, noise: Noise, site: SiteDef): void {
  const { w, h } = world;
  const kind = site.burrower;
  const r = kind === 'vole' ? rng.range(10, 14) : kind === 'molerat' ? rng.range(20, 26) : rng.range(18, 24);
  const depth = kind === 'vole' ? rng.range(40, 120) : kind === 'molerat' ? rng.range(110, 220) : rng.range(150, 300);
  let x = rng.chance(0.5) ? rng.range(-40, 80) : rng.range(w - 80, w + 40);
  let y = world.ground[clamp(Math.round(x), 0, w - 1)]! + depth;
  let a = x < w / 2 ? rng.range(-0.25, 0.25) : Math.PI + rng.range(-0.25, 0.25);
  const len = rng.int(Math.round(w * 0.35), Math.round(w * 0.8));
  let chamberAt = rng.int(Math.round(len * 0.4), Math.round(len * 0.8));
  const carve = (cx: number, cy: number, rr: number): void => {
    for (let oy = -Math.ceil(rr); oy <= Math.ceil(rr); oy++)
      for (let ox = -Math.ceil(rr); ox <= Math.ceil(rr); ox++) {
        if (ox * ox + oy * oy > rr * rr) continue;
        const xx = Math.round(cx + ox);
        const yy = Math.round(cy + oy);
        if (!world.inside(xx, yy) || yy >= h - 6) continue;
        const i = yy * w + xx;
        if (yy - world.ground[xx]! < 8 || !SOIL[world.mat[i]!]) continue;
        // The soil it was dug from stays as the back wall's colour.
        world.tint[i] = world.mat[i]!;
        world.mat[i] = EMPTY;
      }
  };
  for (let t = 0; t < len; t++) {
    a += rng.range(-0.12, 0.12) + Math.sin(t * 0.02) * 0.01;
    x += Math.cos(a);
    y += Math.sin(a) * 0.5;
    y = clamp(y, world.ground[clamp(Math.round(x), 0, w - 1)]! + 30, h - 30);
    // Old stretches have slumped full of loose soil.
    if (noise.n2(t / 40, 3) > 0.35) continue;
    carve(x, y, r * 0.5);
    if (t === chamberAt) {
      // The nest: a round chamber with a bed of dry grass.
      const cr = r * 1.6;
      carve(x, y - cr * 0.3, cr);
      for (let k = 0; k < cr * 3; k++) {
        const xx = Math.round(x + rng.range(-cr * 0.8, cr * 0.8));
        let yy = Math.round(y - cr * 0.3 + cr - 1);
        while (yy > 0 && world.mat[yy * w + xx] !== EMPTY) yy--;
        if (world.inside(xx, yy)) {
          world.mat[yy * w + xx] = LITTER;
          world.tone[yy * w + xx] = rng.int(140, 255);
        }
      }
      chamberAt = -1;
    }
  }
  // Loose spoil slumped on tunnel floors.
  for (let i = 0; i < world.size; i += 1) {
    if (world.mat[i] !== EMPTY || world.bg[i] !== 1 || world.mat[i + w] === EMPTY) continue;
    if (rng.chance(0.12)) {
      world.mat[i] = SAND;
      world.tint[i] = HUMUS;
      world.tone[i] = rng.int(60, 200);
    }
  }
}

/** Limestone: vertical joints and bedding planes, the joints full of soil washed in from above. */
function limestoneCracks(world: World, rng: Rng, noise: Noise): void {
  const { w, h } = world;
  const n = Math.round((w / 1000) * 16);
  for (let k = 0; k < n; k++) {
    let x = rng.range(5, w - 5);
    let y = world.ground[Math.round(x)]! + 20;
    const width = rng.range(1, 3.5);
    while (y < h - 6) {
      x += noise.n2(y / 30, k * 7) * 0.6;
      y += 1;
      const wd = width * (0.6 + 0.4 * noise.n2(y / 12, k));
      for (let ox = -Math.ceil(wd); ox <= Math.ceil(wd); ox++) {
        const xx = Math.round(x + ox);
        if (xx < 1 || xx >= w - 1) continue;
        const i = y * w + xx;
        if (world.mat[i] === ROCK) {
          world.mat[i] = y - world.ground[xx]! < 200 ? HUMUS : LOAM;
          world.tone[i] = rng.int(40, 200);
        }
      }
    }
  }
  // Bedding planes: thin horizontal partings.
  for (let k = 0; k < 6; k++) {
    const y0 = rng.int(Math.round(GROUND_Y + 250), h - 20);
    for (let x = 0; x < w; x++) {
      const y = y0 + Math.round(noise.fbm1(x / 90 + k * 13) * 6);
      const i = y * w + x;
      if (world.mat[i] === ROCK && rng.chance(0.85)) world.tone[i] = clamp(world.tone[i]! - 70, 0, 255);
    }
  }
}

/**
 * A lone tree at the edge of the slice: the foot of the trunk with its root
 * flare, and thick woody roots spreading through the soil (they cannot be
 * dug through, they carry water down, and fine roots hang off them).
 */
function makeTree(world: World, rng: Rng, noise: Noise): { x: number; r: number } {
  const { w, h } = world;
  const left = rng.chance(0.5);
  const r = rng.range(110, 150);
  const cx = left ? rng.range(-60, 10) : rng.range(w - 10, w + 60);
  // Trunk above ground (with a flare where it meets the soil).
  for (let y = 0; y < h; y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 30)); x <= Math.min(w - 1, Math.ceil(cx + r + 30)); x++) {
      const g = world.ground[x]!;
      const above = g - y;
      if (above < -6) continue;
      const flare = above < 40 ? (40 - above) * 0.7 : 0;
      const rr = r + flare + noise.n2(y / 20, 5) * 4;
      if (Math.abs(x - cx) > rr) continue;
      const i = y * w + x;
      world.mat[i] = WOOD;
      // Bark: vertical furrows.
      const furrow = Math.sin((x - cx) * 0.35 + noise.n2(x / 6, y / 40) * 3);
      world.tone[i] = clamp(Math.round(128 + furrow * 70 + noise.n2(x / 3, y / 3) * 40), 0, 255);
    }
  }
  // Buttress roots fanning out into the soil.
  const nRoots = rng.int(4, 6);
  for (let k = 0; k < nRoots; k++) {
    let x = cx + (left ? 1 : -1) * r * rng.range(0.3, 0.9);
    let y = world.ground[clamp(Math.round(x), 0, w - 1)]! + rng.range(4, 20);
    let a = (left ? 0 : Math.PI) + (left ? 1 : -1) * rng.range(0.1, 1.1);
    let rad = rng.range(9, 15);
    const len = rng.int(260, 560);
    for (let t = 0; t < len && rad > 1.2; t++) {
      a += rng.range(-0.06, 0.06);
      x += Math.cos(a);
      y += Math.sin(a) * 0.8 + 0.12;
      rad *= 0.996;
      if (x < 1 || x >= w - 1 || y >= h - 8) break;
      for (let oy = -Math.ceil(rad); oy <= Math.ceil(rad); oy++)
        for (let ox = -Math.ceil(rad); ox <= Math.ceil(rad); ox++) {
          if (ox * ox + oy * oy > rad * rad) continue;
          const xx = Math.round(x + ox);
          const yy = Math.round(y + oy);
          if (!world.inside(xx, yy) || yy - world.ground[xx]! < 2) continue;
          const i = yy * w + xx;
          world.mat[i] = WOOD;
          world.tone[i] = clamp(Math.round(110 + (oy / rad) * -60 + rng.range(-15, 15)), 0, 255);
        }
      // Fine roots hang off the big ones.
      if (rng.chance(0.03)) fineRoot(world, rng, x, y + rad, a + Math.PI / 2 + rng.range(-0.5, 0.5));
    }
  }
  return { x: cx, r };
}

/** A blackthorn or wild rose: a woody stem and a few branches, roots below. */
function makeShrub(world: World, rng: Rng, noise: Noise, tree: { x: number; r: number } | null): void {
  const { w } = world;
  let cx = rng.int(120, w - 120);
  if (tree && Math.abs(cx - tree.x) < tree.r + 160) cx = tree.x < w / 2 ? rng.int(Math.round(w * 0.6), w - 120) : rng.int(120, Math.round(w * 0.4));
  const g = world.ground[cx]!;
  const hgt = rng.int(110, 170);
  // Stems, splitting into branches.
  const stem = (x0: number, y0: number, a0: number, len: number, rad: number, depth: number): void => {
    let x = x0;
    let y = y0;
    let a = a0;
    for (let t = 0; t < len; t++) {
      a += rng.range(-0.05, 0.05);
      x += Math.cos(a);
      y += Math.sin(a);
      for (let ox = -Math.ceil(rad); ox <= Math.ceil(rad); ox++) {
        const xx = Math.round(x + ox);
        const yy = Math.round(y);
        if (!world.inside(xx, yy) || yy >= world.ground[xx]!) continue;
        world.mat[yy * w + xx] = WOOD;
        world.tone[yy * w + xx] = clamp(Math.round(150 + noise.n2(xx / 2, yy / 5) * 60), 0, 255);
      }
      if (depth < 2 && t > len * 0.35 && rng.chance(0.04)) stem(x, y, a + rng.range(-0.9, 0.9), len * 0.55, Math.max(0.6, rad * 0.6), depth + 1);
    }
  };
  stem(cx, g, -Math.PI / 2 + rng.range(-0.15, 0.15), hgt, 2.5, 0);
  stem(cx + 3, g, -Math.PI / 2 + rng.range(0.15, 0.45), hgt * 0.8, 1.8, 0);
  // Roots.
  for (let k = 0; k < 3; k++) {
    let x = cx;
    let y = g + 2;
    let a = Math.PI / 2 + rng.range(-0.9, 0.9);
    let rad = rng.range(3, 5);
    for (let t = 0; t < 220 && rad > 0.8; t++) {
      a += rng.range(-0.08, 0.08);
      x += Math.cos(a);
      y += Math.sin(a);
      rad *= 0.993;
      for (let oy = -Math.ceil(rad); oy <= Math.ceil(rad); oy++)
        for (let ox = -Math.ceil(rad); ox <= Math.ceil(rad); ox++) {
          if (ox * ox + oy * oy > rad * rad) continue;
          const xx = Math.round(x + ox);
          const yy = Math.round(y + oy);
          if (!world.inside(xx, yy) || yy - world.ground[xx]! < 1) continue;
          world.mat[yy * w + xx] = WOOD;
          world.tone[yy * w + xx] = rng.int(60, 160);
        }
    }
  }
}

function fineRoot(world: World, rng: Rng, x: number, y: number, a: number): void {
  const { w } = world;
  for (let t = 0; t < rng.int(20, 60); t++) {
    a += rng.range(-0.3, 0.3);
    x += Math.cos(a);
    y += Math.abs(Math.sin(a)) + 0.2;
    const xx = Math.round(x);
    const yy = Math.round(y);
    if (!world.inside(xx, yy)) return;
    const i = yy * w + xx;
    if (SOIL[world.mat[i]!]) {
      world.mat[i] = ROOT;
      world.tone[i] = rng.int(0, 255);
    }
  }
}
