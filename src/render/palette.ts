/** Pastel-neon palette. Team 0 = mint (player side), team 1 = coral. */
export interface TeamColors {
  fill: number;
  mid: number;
  dark: number;
  rim: number;
}

export const TEAM: TeamColors[] = [
  { fill: 0x9ff3dc, mid: 0x5cc4b0, dark: 0x1d4e55, rim: 0xe6fff8 },
  { fill: 0xffb9c8, mid: 0xe07895, dark: 0x5a1f3d, rim: 0xfff0f4 },
];
export const DEBRIS_DIM = 0.55;

export const C = {
  bg: 0x0e0b1f,
  bgDeep: 0x07061a,
  armor: [0x6fb8b0, 0xc78597],
  armorEdge: [0x2d6b6c, 0x7a3352],
  wireOn: 0xffe27a,
  wireOff: 0x3b3556,
  lightOn: 0x8dffb0,
  lightOff: 0x2a2440,
  reactor: 0x7ffcff,
  bridge: 0xfff1b8,
  eye: 0x1b1530,
  gyro: 0xc9a8ff,
  stab: 0xa6c8ff,
  nozzle: 0x5d5680,
  flameHot: 0xfff0b0,
  flame: 0xffa05a,
  flameCool: 0xff5fa2,
  cannon: 0xffd36b,
  laser: 0xff7af0,
  laserCore: 0xfff2ff,
  shell: 0xfff2a0,
  spark: 0xffd27a,
  heat: 0xff7a3a,
  smoke: 0x9a90c8,
  boundary: 0x6a5acd,
};
