/**
 * Cell materials. Kept as plain numbers (not enums) so hot loops stay cheap
 * and the ids can live in a Uint8Array.
 */
export const EMPTY = 0;
// Soil horizons, top to bottom (O/A, B, Bt, C).
export const HUMUS = 1;
export const LOAM = 2;
export const CLAY = 3;
export const SUBSOIL = 4;
export const GRAVEL = 5;
export const STONE = 6;
export const ROOT = 7;
/** Loose excavated soil. Falls and slides. Remembers its source in `tint`. */
export const SAND = 8;
export const WATER = 9;
// Plant parts. These live in World.plant, a layer in front of the slice:
// ants walk past them on the ground, or climb them to reach seeds.
export const STEM = 10;
export const LEAF = 11;
export const FLOWER = 12;
/** Ripe seed still attached to a plant. Ants harvest it. */
export const SEEDHEAD = 13;
/** Loose seed (fallen, carried, or stored in a granary). Falls and slides. */
export const SEED = 14;
/** Colony waste and dead ants. Falls and slides. */
export const REFUSE = 15;
/** Dead leaves and twigs lying on the ground. */
export const LITTER = 16;
/** Soft food (fallen fruit pulp). Slumps like a powder; ants carve it up. */
export const FRUIT = 17;
export const BEDROCK = 18;
/** Quartz sand soil (sand steppe): soft and quick to dig, drains and dries fast. */
export const SANDY = 19;
/** Lime-enriched layer (calcrete), hard and pale: ants can only slowly bore it. */
export const LIME = 20;
/** Limestone: undiggable, but split by cracks full of soil. */
export const ROCK = 21;
/** A woody root of a tree, shrub or vine: too tough to bite through. */
export const WOOD = 22;

/** Woody stem of a shrub or vine. Plant layer: ants walk past it, or climb it. */
export const TWIG = 23;
/** A berry or grape hanging on a shrub or vine (plant layer); it drops when ripe. */
export const BERRY = 24;
/**
 * A dead insect (beetle, grasshopper, moth) or worm: the protein the larvae
 * need to grow. Harvester ants take one now and then and cut it up.
 */
export const PREY = 25;

export const MAT_COUNT = 26;

const table = (entries: [number, number][]): Uint8Array => {
  const t = new Uint8Array(32);
  for (const [m, v] of entries) t[m] = v;
  return t;
};

/** Solid for walking purposes: an ant can stand on or cling to it. */
export const SOLID = table([
  [HUMUS, 1], [LOAM, 1], [CLAY, 1], [SUBSOIL, 1], [GRAVEL, 1], [STONE, 1], [ROOT, 1],
  [SAND, 1], [SEED, 1], [REFUSE, 1], [LITTER, 1], [FRUIT, 1], [BEDROCK, 1],
  [SANDY, 1], [LIME, 1], [ROCK, 1], [WOOD, 1], [PREY, 1],
]);

/** Hardness 1..4 for diggable materials; 0 means ants cannot dig it. */
export const HARDNESS = table([
  [HUMUS, 1], [LOAM, 2], [CLAY, 3], [SUBSOIL, 2], [GRAVEL, 4], [SAND, 1], [REFUSE, 1], [ROOT, 4],
  [SANDY, 1], [LIME, 4],
  // Litter only ever gets cleared where the nest plan needs the space (the entrance).
  [LITTER, 1],
]);

/** Solid rock and wood: nothing can dig through it (the nest plan goes round). */
export const HARD = table([[STONE, 1], [BEDROCK, 1], [ROCK, 1], [WOOD, 1]]);

/** Powders: fall straight down and slide off slopes. */
export const POWDER = table([[SAND, 1], [SEED, 1], [REFUSE, 1], [FRUIT, 1], [PREY, 1]]);

/** Things a forager can pick up as food. */
export const FOOD = table([[SEEDHEAD, 1], [SEED, 1], [FRUIT, 1], [PREY, 1]]);

/** Undisturbed soil that keeps a colour per horizon. */
export const SOIL = table([[HUMUS, 1], [LOAM, 1], [CLAY, 1], [SUBSOIL, 1], [GRAVEL, 1], [SANDY, 1], [LIME, 1]]);

export const PLANT = table([[STEM, 1], [LEAF, 1], [FLOWER, 1], [SEEDHEAD, 1], [TWIG, 1], [BERRY, 1]]);
