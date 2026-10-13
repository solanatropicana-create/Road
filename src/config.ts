/**
 * World scale: 1 cell = 1 mm. The world is a 128 x 72 cm slice of steppe
 * soil. The colony starts in a small part of it; the view widens and deepens
 * as the nest and the foragers' range grow.
 */
export const W = 1280;
export const H = 720;
/** Mean ground line (cells from the top). Everything above is air. */
export const GROUND_Y = 160;

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

  // --- brood development, in development-ticks: one in-game day is one week,
  // and brood only develops at full speed in the warmth (see devRate). Messor
  // takes 8–12 weeks egg to worker at 22–27 °C; the game runs at the quick end
  // of that, and a little quicker, so a colony grows while you watch.
  eggTicks: DAY_TICKS * 2.6,
  larvaTicks: DAY_TICKS * 2.2,
  pupaTicks: DAY_TICKS * 2.4,
  larvaFeedings: 2,
  /** Eggs a week from a founding queen, and extra per adult worker (at full warmth, normal breeding). */
  eggsBase: 12,
  eggsPerWorker: 0.9,
  /** Workers a colony needs before it raises winged queens and males (from mid-July). */
  alateMinWorkers: 100,
  /** Brood the colony will raise per worker (caps queen output; growing colonies carry more brood than workers). */
  broodPerWorker: 3.0,

  // --- lifespans, in weeks of active life (ageing slows in the cold): workers live one to two years
  workerLife: [DAY_TICKS * 50, DAY_TICKS * 95] as const,
  soldierLife: [DAY_TICKS * 60, DAY_TICKS * 110] as const,

  // --- food (seeds). One seed feeds one adult for this many ticks (about half
  // a seed a week in the warmth: harvester workers live on very little; most
  // of the harvest goes into brood, young queens and the winter store).
  adultSeedTicks: TICK_HZ * 600,
  // A founding queen lives for months on her own body: she eats little.
  queenSeedTicks: TICK_HZ * 150,
  starveTicks: TICK_HZ * 60,

  // --- digging (ticks to loosen one cell, by hardness 1..4)
  digTicks: [0, 10, 16, 26, 40] as const,

  // --- nest sizing: tunnel+chamber cells the colony wants per adult
  nestCellsPerAnt: 14,
  nestCellsBase: 900,

  // --- spoil (excavated soil carried to the surface)
  /**
   * Share of spoil and chaff loads set down "off the slice" (shown only as a
   * puff of dust). None: every load is carried and dropped in view, and the
   * wind and the rain keep the mound in check (see Sim.blow).
   */
  spoilOffSlice: 0,
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
