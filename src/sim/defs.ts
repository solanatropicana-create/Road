/**
 * Tile catalogue. Every number here is a physical property; behaviour in the
 * simulation is derived from these, never special-cased per ship.
 *
 * Units: 1 tile = 1 m², mass in tonnes (used directly as planck density),
 * hp = energy (kJ-ish) the tile absorbs before it breaks, power in abstract units.
 */

export type TileKind =
  | 'frame'
  | 'hull'
  | 'armor'
  | 'conduit'
  | 'reactor'
  | 'bridge'
  | 'thruster'
  | 'rcs'
  | 'gyro'
  | 'stabilizer'
  | 'cannon'
  | 'laser';

/** 0 up (-y), 1 right (+x), 2 down (+y), 3 left (-x) */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_VEC: readonly { x: number; y: number }[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export interface TileDef {
  kind: TileKind;
  name: string;
  mass: number;
  hp: number;
  /** Carries power to neighbours. Modules conduct; plain structure does not. */
  conducts: boolean;
  /** >0 supplies, <0 demands. */
  power: number;
  /** Lower number = served first when supply is short. */
  priority: number;
  /** Thrust (kN-ish) for thrusters. */
  thrust?: number;
  /** Max torque for gyros. */
  torque?: number;
  /** Stored energy released when destroyed. */
  explosive?: number;
  /** Damage multiplier for thermal energy (lasers). Steel plate sheds heat badly. */
  thermalMul?: number;
}

export const TILE_DEFS: Record<TileKind, TileDef> = {
  frame: { kind: 'frame', name: 'Çerçeve', mass: 0.45, hp: 160, conducts: false, power: 0, priority: 9 },
  hull: { kind: 'hull', name: 'Gövde', mass: 1.0, hp: 420, conducts: false, power: 0, priority: 9, thermalMul: 1.2 },
  armor: { kind: 'armor', name: 'Zırh', mass: 2.2, hp: 1350, conducts: false, power: 0, priority: 9, thermalMul: 1.8 },
  conduit: { kind: 'conduit', name: 'Güç hattı', mass: 0.8, hp: 260, conducts: true, power: 0, priority: 9 },
  reactor: {
    kind: 'reactor',
    name: 'Reaktör',
    mass: 3.0,
    hp: 650,
    conducts: true,
    power: 12,
    priority: 0,
    explosive: 1700,
  },
  bridge: { kind: 'bridge', name: 'Köprü', mass: 1.6, hp: 1100, conducts: true, power: -1, priority: 0 },
  stabilizer: { kind: 'stabilizer', name: 'Stabilizör', mass: 1.2, hp: 380, conducts: true, power: -1, priority: 1 },
  gyro: { kind: 'gyro', name: 'Jiroskop', mass: 2.0, hp: 480, conducts: true, power: -1.5, priority: 2, torque: 1700 },
  thruster: {
    kind: 'thruster',
    name: 'Ana itici',
    mass: 1.3,
    hp: 380,
    conducts: true,
    power: -0.5,
    priority: 3,
    thrust: 520,
  },
  rcs: { kind: 'rcs', name: 'Manevra iticisi', mass: 0.7, hp: 260, conducts: true, power: -0.25, priority: 3, thrust: 170 },
  cannon: { kind: 'cannon', name: 'Otomatik top', mass: 1.6, hp: 460, conducts: true, power: -1, priority: 4 },
  laser: { kind: 'laser', name: 'Lazer', mass: 1.5, hp: 460, conducts: true, power: -2, priority: 4 },
};

/** Global durability scale: tunes fight length without touching ratios. */
export const HP_SCALE = 2.6;
for (const d of Object.values(TILE_DEFS)) d.hp *= HP_SCALE;

export const WEAPONS = {
  cannon: {
    interval: 0.22,
    shellMass: 0.04,
    muzzle: 120,
    spread: 0.025,
    life: 1.4,
    turnRate: 4.5,
  },
  laser: {
    /** Energy per second deposited at the hit point. */
    dps: 400,
    range: 100,
    turnRate: 3.2,
  },
};

/** Blueprint character → tile kind (+ exhaust direction for thrusters). */
export const CHAR_MAP: Record<string, { kind: TileKind; dir?: Dir }> = {
  '=': { kind: 'frame' },
  '#': { kind: 'hull' },
  '@': { kind: 'armor' },
  '+': { kind: 'conduit' },
  R: { kind: 'reactor' },
  B: { kind: 'bridge' },
  S: { kind: 'stabilizer' },
  G: { kind: 'gyro' },
  C: { kind: 'cannon' },
  L: { kind: 'laser' },
  // Main thrusters: character shows exhaust direction.
  v: { kind: 'thruster', dir: 2 },
  '^': { kind: 'thruster', dir: 0 },
  '<': { kind: 'thruster', dir: 3 },
  '>': { kind: 'thruster', dir: 1 },
  // RCS: numpad directions for exhaust.
  '8': { kind: 'rcs', dir: 0 },
  '6': { kind: 'rcs', dir: 1 },
  '2': { kind: 'rcs', dir: 2 },
  '4': { kind: 'rcs', dir: 3 },
};
