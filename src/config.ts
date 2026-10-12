/**
 * World scale: 1 cell = 1 mm. The world is a 64 x 36 cm slice of meadow soil,
 * which is roughly the size of a real observation formicarium.
 */
export const W = 640;
export const H = 360;
/** Mean ground line (cells from the top). Everything above is air. */
export const GROUND_Y = 84;

/** Fixed simulation rate. Speed-ups run more ticks per frame. */
export const TICK_HZ = 30;
export const SPEEDS = [1, 2, 4, 8, 16] as const;

/** One in-game day, in ticks at 1x (6 minutes). */
export const DAY_TICKS = TICK_HZ * 60 * 6;

export const TUNING = {
  // --- movement (cells per tick; 0.5 = 15 mm/s, about a real Messor walking)
  workerSpeed: 0.5,
  soldierSpeed: 0.42,
  queenSpeed: 0.3,
  carryingSlowdown: 0.85,

  // --- brood development (ticks at 1x)
  eggTicks: TICK_HZ * 22,
  larvaTicks: TICK_HZ * 38,
  pupaTicks: TICK_HZ * 28,
  larvaFeedings: 2,
  /** Ticks between eggs at "normal" breeding when the colony is well fed. */
  eggInterval: TICK_HZ * 5,
  /** Brood the colony will raise per nurse-capable worker (caps queen output). */
  broodPerWorker: 0.9,

  // --- lifespans (ticks at 1x)
  workerLife: [TICK_HZ * 60 * 20, TICK_HZ * 60 * 32] as const,
  soldierLife: [TICK_HZ * 60 * 26, TICK_HZ * 60 * 40] as const,

  // --- food (seeds). One seed feeds one adult for this many ticks.
  adultSeedTicks: TICK_HZ * 300,
  queenSeedTicks: TICK_HZ * 30,
  starveTicks: TICK_HZ * 60,

  // --- digging (ticks to loosen one cell, by hardness 1..4)
  digTicks: [0, 10, 16, 26, 40] as const,

  // --- nest sizing: tunnel+chamber cells the colony wants per adult
  nestCellsPerAnt: 14,
  nestCellsBase: 900,

  // --- spoil (excavated soil carried to the surface)
  /**
   * Share of spoil loads that end up off the slice. A real nest's spoil lies
   * in a ring all round the entrance; a thin slice through it shows only a
   * little of that ring, so most loads are carried out of view.
   */
  spoilOffSlice: 0.6,
  /** Highest the spoil ring may stand at the crater rim, in mm. */
  moundMax: 14,
  /** Highest the chaff (seed husk) pile may stand, in mm. */
  middenMax: 6,
  /** Chance that a surface grain of chaff, when checked, has blown away or rotted. */
  chaffDecay: 0.12,

  // --- foraging
  forageGiveUpTicks: TICK_HZ * 45,
  pheromoneDeposit: 1,
  pheromoneDecay: 0.9965,
};
