import type { Climate } from '../sim/calendar';
import { PANNONIAN } from '../sim/calendar';
import { HUMUS, LOAM, CLAY, SUBSOIL, SANDY, LIME, ROCK } from './mat';
import { Rng } from '../util/rng';

/**
 * Starting sites: real places where Messor structor (or its sister species of
 * the 2018 split) lives, each with its own soil profile, climate, plants and
 * neighbours. Sources: docs/reports/Hasatçı karınca simülasyon araştırması.md.
 * Every map of a site is also varied (deeper or thinner soil, a clay lens,
 * old burrows, a tree...), so two maps of the same site play differently.
 */

export type SiteId = 'pannonian' | 'sand' | 'limestone' | 'vineyard' | 'anatolia' | 'pontic';
export const SITE_IDS: SiteId[] = ['pannonian', 'anatolia', 'sand', 'limestone', 'vineyard', 'pontic'];

import type { PlantKind } from './plants';

export type PlantMix = Partial<Record<PlantKind, number>>;

export interface Layer {
  mat: number;
  /** Depth (mm below the ground) where the layer starts, before the map's own variation. */
  top: number;
}

export interface SiteDef {
  id: SiteId;
  climate: Climate;
  layers: Layer[];
  /** Long swell of the ground surface, mm. */
  relief: number;
  plants: PlantMix;
  /** Plants per metre of ground. */
  plantDensity: number;
  /** Buried pebbles per metre (scaled by depth). */
  stones: number;
  /** Old burrows backfilled with soil of another colour, per metre. */
  krotovinas: number;
  /** Who digs here besides the ants. */
  burrower: 'squirrel' | 'vole' | 'molerat' | null;
  /** Buried seeds per metre in the top 10 cm (the soil seed bank). */
  seedBank: number;
  /** Bare ground in sun gets this much hotter than on a meadow (sand, rock). */
  surfaceHeat: number;
  /** Chance of a tree, and of a shrub, on the slice. */
  tree: number;
  shrub: number;
  /** Which ant: the Anatolian and Pontic populations are sister species since 2018. */
  species: 'structor' | 'group' | 'muticus';
}

const PANNONIAN_SITE: SiteDef = {
  id: 'pannonian',
  climate: PANNONIAN,
  // Chernozem on loess: black topsoil half a metre deep, then a brown transition into pale loess.
  layers: [
    { mat: HUMUS, top: 0 },
    { mat: LOAM, top: 470 },
    { mat: SUBSOIL, top: 620 },
  ],
  relief: 7,
  plants: { grass: 4, purse: 2, clover: 2, erodium: 1, stipa: 0.5 },
  plantDensity: 38,
  stones: 25,
  krotovinas: 8,
  burrower: 'squirrel',
  seedBank: 260,
  surfaceHeat: 1,
  tree: 0.25,
  shrub: 0.35,
  species: 'structor',
};

const SAND_STEPPE: SiteDef = {
  id: 'sand',
  climate: {
    tMonth: [-1, 1, 6, 11.5, 16.5, 20, 22, 21.5, 17, 11, 5, 0.5],
    showers: [0.45, 0.45, 0.5, 0.7, 0.85, 0.95, 0.8, 0.7, 0.55, 0.5, 0.6, 0.5],
    stormShare: 0.3,
    lat: 46.6,
  },
  // Calcaric arenosol: a few cm of grey topsoil over uniform yellow sand.
  layers: [
    { mat: HUMUS, top: 0 },
    { mat: SANDY, top: 55 },
  ],
  relief: 14,
  // Sand fescue and sand feather grass, with stork's bill on the bare patches.
  plants: { grass: 3, stipa: 2.5, erodium: 2, purse: 1, clover: 0.5 },
  plantDensity: 26,
  stones: 3,
  krotovinas: 2,
  burrower: 'vole',
  seedBank: 140,
  surfaceHeat: 1.25,
  tree: 0.15,
  shrub: 0.3,
  species: 'structor',
};

const LIMESTONE_HILL: SiteDef = {
  id: 'limestone',
  climate: {
    tMonth: [-2, 0, 4.5, 10, 15, 18.5, 20.5, 20, 15.5, 10, 4.5, 0],
    showers: [0.5, 0.5, 0.6, 0.7, 0.9, 1.0, 1.0, 0.9, 0.7, 0.6, 0.6, 0.6],
    stormShare: 0.35,
    lat: 48.8,
  },
  // Rendzina: thin black stony soil straight on cracked limestone.
  layers: [
    { mat: HUMUS, top: 0 },
    { mat: ROCK, top: 260 },
  ],
  relief: 20,
  plants: { grass: 3, stipa: 1.5, clover: 2, purse: 1, erodium: 1 },
  plantDensity: 30,
  stones: 90,
  krotovinas: 1,
  burrower: null,
  seedBank: 160,
  surfaceHeat: 1.15,
  tree: 0.2,
  shrub: 0.55,
  species: 'structor',
};

const VINEYARD_EDGE: SiteDef = {
  id: 'vineyard',
  climate: {
    tMonth: [-1, 0.5, 5, 10.5, 15.5, 18.5, 20.5, 20, 15.5, 10, 4.5, 0.5],
    showers: [0.45, 0.45, 0.55, 0.7, 0.85, 1.0, 0.9, 0.8, 0.6, 0.55, 0.6, 0.5],
    stormShare: 0.35,
    lat: 48.75,
  },
  // Loess terrace: a ploughed brown top over buried black topsoil, loess below.
  layers: [
    { mat: LOAM, top: 0 },
    { mat: HUMUS, top: 220 },
    { mat: SUBSOIL, top: 430 },
  ],
  relief: 5,
  // Weedy: shepherd's purse and stork's bill thrive on the tilled margin.
  plants: { grass: 2, purse: 3, clover: 2, erodium: 2 },
  plantDensity: 34,
  stones: 18,
  krotovinas: 6,
  burrower: 'vole',
  seedBank: 300,
  surfaceHeat: 1.05,
  tree: 0,
  shrub: 0.2,
  species: 'structor',
};

const ANATOLIA: SiteDef = {
  id: 'anatolia',
  climate: {
    tMonth: [-2, -0.5, 4.5, 10.5, 15.5, 19.5, 23, 23, 18.5, 12.5, 6, 0.5],
    showers: [0.7, 0.6, 0.7, 0.8, 0.8, 0.5, 0.15, 0.15, 0.25, 0.45, 0.55, 0.7],
    stormShare: 0.3,
    lat: 39.9,
  },
  // Kastanozem: brown topsoil, a cinnamon B horizon, then a hard white lime layer.
  layers: [
    { mat: LOAM, top: 0 },
    { mat: CLAY, top: 250 },
    { mat: LIME, top: 470 },
    { mat: SUBSOIL, top: 580 },
  ],
  relief: 10,
  plants: { grass: 3, stipa: 2, erodium: 2, purse: 2, clover: 1 },
  plantDensity: 24,
  stones: 40,
  krotovinas: 4,
  burrower: 'squirrel',
  seedBank: 150,
  surfaceHeat: 1.2,
  tree: 0.1,
  shrub: 0.3,
  species: 'group',
};

const PONTIC: SiteDef = {
  id: 'pontic',
  climate: {
    tMonth: [-3, -2, 3, 10, 16.5, 20.5, 23.5, 22.5, 17, 10, 4, -1],
    showers: [0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.6, 0.5, 0.4, 0.5, 0.6, 0.6],
    stormShare: 0.35,
    lat: 46.4,
  },
  // Dark chestnut soil under feather grass, lime beneath.
  layers: [
    { mat: HUMUS, top: 0 },
    { mat: LOAM, top: 380 },
    { mat: LIME, top: 520 },
  ],
  relief: 6,
  // Feather-grass steppe.
  plants: { stipa: 4, grass: 3, purse: 1, clover: 1, erodium: 1 },
  plantDensity: 30,
  stones: 10,
  krotovinas: 10,
  burrower: 'molerat',
  seedBank: 200,
  surfaceHeat: 1.1,
  tree: 0.05,
  shrub: 0.15,
  species: 'muticus',
};

export const SITES: Record<SiteId, SiteDef> = {
  pannonian: PANNONIAN_SITE,
  sand: SAND_STEPPE,
  limestone: LIMESTONE_HILL,
  vineyard: VINEYARD_EDGE,
  anatolia: ANATOLIA,
  pontic: PONTIC,
};

/** A trait of this particular map, for the site card: +1 an advantage, -1 a drawback, 0 neutral. */
export interface Trait {
  key: string;
  sign: 1 | -1 | 0;
}

/**
 * The procedural twist on a site: what makes this map different from every
 * other map of the same place.
 */
export interface Variant {
  site: SiteId;
  /** Multiplies the depth of every horizon boundary (deeper or thinner topsoil). */
  depthScale: number;
  /** A lens of clay in the topsoil that holds rain (perched water). */
  clayLens: boolean;
  seedBankScale: number;
  /** Burrow systems of the local digger crossing the slice. */
  burrows: number;
  /** -1 north-facing (cool) .. +1 south-facing (warm), °C offset is 1.5 per unit. */
  exposure: number;
  /** Flat stones lying just under the surface (warm rooms under them). */
  flatStones: number;
  tree: boolean;
  shrub: boolean;
  /** Ground water near the bottom of the slice. */
  wetBottom: boolean;
  /** Old potsherds in the topsoil (people farmed or lived here long ago). */
  shards: number;
  /** Bones of small animals buried in the soil. */
  bones: number;
  /** Cicada nymphs in their cells by the roots, years from emerging. */
  nymphs: number;
  /** Antlion pits in dry, loose sand. */
  antlions: number;
  /** Workers of the neighbouring Messor colony beyond one edge (0: none in reach), and which edge. */
  neighbour: number;
  neighbourSide: number;
  traits: Trait[];
}

export function makeVariant(site: SiteId, seed: number): Variant {
  const def = SITES[site];
  const rng = new Rng(seed * 31 + 7);
  const v: Variant = {
    site,
    depthScale: rng.range(0.75, 1.3),
    clayLens: site !== 'sand' && site !== 'limestone' && rng.chance(0.35),
    seedBankScale: rng.range(0.5, 1.7),
    burrows: def.burrower ? rng.int(0, 2) : 0,
    exposure: rng.range(-1, 1),
    flatStones: site === 'limestone' ? rng.int(1, 4) : rng.chance(0.3) ? rng.int(1, 2) : 0,
    tree: rng.chance(def.tree),
    shrub: rng.chance(def.shrub),
    wetBottom: (site === 'pannonian' || site === 'sand' || site === 'vineyard') && rng.chance(0.25),
    shards: (site === 'anatolia' || site === 'vineyard' || site === 'pontic') && rng.chance(0.55) ? rng.int(1, 4) : 0,
    bones: rng.chance(0.4) ? rng.int(1, 2) : 0,
    nymphs: rng.chance(0.5) ? rng.int(1, 3) : 0,
    antlions: site === 'sand' ? rng.int(1, 3) : site === 'anatolia' && rng.chance(0.35) ? 1 : 0,
    neighbour: rng.chance(0.8) ? Math.round(rng.range(250, 1400)) : 0,
    neighbourSide: rng.chance(0.5) ? -1 : 1,
    traits: [],
  };
  const t = v.traits;
  if (v.depthScale > 1.15) t.push({ key: site === 'limestone' ? 'tr_deeperSoil' : 'tr_deepTopsoil', sign: 1 });
  if (v.depthScale < 0.85) t.push({ key: site === 'limestone' ? 'tr_shallowRock' : 'tr_thinTopsoil', sign: -1 });
  if (v.exposure > 0.45) t.push({ key: 'tr_southFacing', sign: 1 });
  if (v.exposure < -0.45) t.push({ key: 'tr_northFacing', sign: -1 });
  if (v.seedBankScale > 1.3) t.push({ key: 'tr_richSeedBank', sign: 1 });
  if (v.seedBankScale < 0.7) t.push({ key: 'tr_poorSeedBank', sign: -1 });
  if (v.clayLens) t.push({ key: 'tr_clayLens', sign: -1 });
  if (v.flatStones) t.push({ key: 'tr_flatStones', sign: 1 });
  if (v.burrows) t.push({ key: `tr_burrows_${def.burrower}`, sign: 0 });
  if (v.tree) t.push({ key: 'tr_tree', sign: 0 });
  if (v.shrub) t.push({ key: 'tr_shrub', sign: 1 });
  if (v.wetBottom) t.push({ key: 'tr_wetBottom', sign: -1 });
  if (v.shards) t.push({ key: 'tr_shards', sign: 0 });
  if (v.nymphs) t.push({ key: 'tr_nymphs', sign: 1 });
  if (v.antlions) t.push({ key: 'tr_antlions', sign: -1 });
  if (v.neighbour > 900) t.push({ key: 'tr_bigNeighbour', sign: -1 });
  else if (v.neighbour) t.push({ key: 'tr_neighbour', sign: 0 });
  else t.push({ key: 'tr_noNeighbour', sign: 1 });
  return v;
}

/** The site for a seed when none is chosen. */
export function siteForSeed(seed: number): SiteId {
  return SITE_IDS[Math.abs(Math.floor(seed)) % SITE_IDS.length]!;
}
