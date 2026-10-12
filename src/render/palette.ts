export type RGB = [number, number, number];

export const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Pack to the little-endian ABGR layout of ImageData's Uint32 view. */
export const pack = (r: number, g: number, b: number, a = 255): number =>
  ((a << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const ramp = (...cs: string[]): RGB[] => cs.map(hex);

/** Sample a ramp with t in 0..1 (linear between stops). */
export const sampleRamp = (r: RGB[], t: number): RGB => {
  const f = Math.max(0, Math.min(0.9999, t)) * (r.length - 1);
  const i = Math.floor(f);
  return mixRGB(r[i]!, r[i + 1] ?? r[i]!, f - i);
};

/**
 * Earth palette. Soil horizons follow a real profile: dark humus, brown loam,
 * rusty clay-rich subsoil, pale weathered parent material.
 */
export const PAL = {
  humus: ramp('#2a1d15', '#35251a', '#412e21', '#4e3828', '#5a4230'),
  litterTop: ramp('#2a1d14', '#35261a', '#433021'),
  loam: ramp('#56402d', '#634a34', '#70553c', '#7d6045', '#8a6b4e'),
  clay: ramp('#71432a', '#814d30', '#905836', '#9e643e', '#ac7149'),
  subsoil: ramp('#8f7a5d', '#9c8768', '#a99473', '#b6a17f', '#c2ae8c'),
  gravel: ramp('#5f5a53', '#77726a', '#8f8980', '#a7a097', '#bdb6ac'),
  stone: [
    ramp('#3e3d40', '#575659', '#727175', '#908f93', '#b3b2b4', '#cfcecf'),
    ramp('#363d48', '#4b5461', '#646f7d', '#7f8a98', '#a0aab6', '#c2c9d1'),
    ramp('#4a3a28', '#655238', '#826c4a', '#9e875f', '#bba479', '#d6c299'),
    ramp('#6b6862', '#8a877f', '#a9a59c', '#c6c2b8', '#dedad0', '#f0ede5'),
  ],
  root: ramp('#5e4430', '#6d5139', '#7c5e44', '#8c6c51', '#9c7b5f'),
  bedrock: ramp('#2f2c29', '#3a3632', '#45403b'),
  water: ramp('#2c5873', '#3a6c8a', '#4a80a0'),
  stem: ramp('#3f5a22', '#4b6a28', '#587a2f', '#668a37'),
  leaf: ramp('#2f5520', '#3b6626', '#47782e', '#558a36', '#66993f'),
  flowerWhite: ramp('#d9d4c6', '#ebe7dc', '#f8f6ee'),
  flowerPink: ramp('#b9708f', '#d08aa8', '#e4a8c2'),
  seedhead: ramp('#7f7a3c', '#9a8f48', '#b4a256', '#c9b363'),
  seed: ramp('#7a5a2c', '#9b7438', '#b88c45', '#cfa253', '#ddb468'),
  refuse: ramp('#3a312b', '#7d6a4d', '#a48e66', '#c0aa7f', '#d4c096'),
  leafLitter: ramp('#5c351d', '#7a4625', '#94582c', '#a86a35', '#b97c42'),
  twig: ramp('#3b2a1d', '#4a3524', '#5b432f'),
  fruit: ramp('#24111a', '#361822', '#48202b', '#5a2a34'),
};

/**
 * A seed's tone also says which plant it came from: grass seed (long, golden),
 * clover (round, orange-brown) or shepherd's purse (tiny, red-brown).
 */
const SEED_RAMPS = [
  ramp('#8a6a30', '#a5803c', '#c09a4c', '#d4b060'),
  ramp('#7a4a22', '#94592a', '#ad6c34', '#c07e40'),
  ramp('#5a2e1c', '#703a22', '#87482a', '#9a5634'),
];
const SEED_SIZE: [number, number][] = [[0.8, 0.4], [0.55, 0.48], [0.4, 0.32]];

/** Colour and half-size (mm) of a seed of this tone. */
export const seedLook = (tone: number): { col: RGB; rx: number; ry: number } => {
  const kind = tone < 86 ? 0 : tone < 171 ? 1 : 2;
  const t = (tone - kind * 85.33) / 85.33;
  const [rx, ry] = SEED_SIZE[kind]!;
  return { col: sampleRamp(SEED_RAMPS[kind]!, t), rx, ry };
};

/** Tone range for seed from each kind of plant. */
export const SEED_TONE: Record<string, [number, number]> = { grass: [0, 85], clover: [86, 170], purse: [171, 255] };

/** Chamber floor tints so rooms read at a glance (applied to the back wall). */
export const ZONE_TINT: Record<string, RGB> = {
  queen: hex('#5a3350'),
  nursery: hex('#7a6248'),
  granary: hex('#7a5a26'),
  rest: hex('#3e3328'),
};

