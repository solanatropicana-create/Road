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
    // Potsherd: fired clay, a dark burnished face over a brick-red core.
    ramp('#4a2a1e', '#6e3a24', '#8f4a2c', '#ad5d36', '#c27245', '#d38a5c'),
    // Bone: ivory, browned by the soil.
    ramp('#8c7f66', '#a69a80', '#bfb49b', '#d4cbb4', '#e4ddc9'),
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
  // The meadow through the year: yellowing, straw, and the grey-brown of winter.
  straw: ramp('#8f8442', '#a8995a', '#bfae6e', '#cfbd80'),
  deadPlant: ramp('#5e5444', '#6f6450', '#80735c'),
  // Shrub and vine stems above ground: grey bark.
  bark: ramp('#3e3530', '#4d433b', '#5d5147', '#6c6053'),
  // Sloes (blue-black with a bloom) and rose hips (scarlet).
  sloe: ramp('#22243a', '#2f3350', '#454c6c', '#6b7393'),
  hip: ramp('#7a1e14', '#9c2a1a', '#bf3a22', '#d9573a'),
  // Dead insects: beetle chitin (black to bronze), grasshopper olive, earthworm pink.
  beetle: ramp('#16130f', '#241f18', '#3a3221', '#4d4529'),
  hopper: ramp('#4f5226', '#646631', '#7a793d', '#8f8a4c'),
  worm: ramp('#7a4a4a', '#94595a', '#ad6e6c', '#c08482'),
  // Cicada nymph: pale cream-tan, a darker back.
  nymph: ramp('#8a7253', '#a68b66', '#bea37c', '#d4bd97'),
  fruit: ramp('#24111a', '#361822', '#48202b', '#5a2a34'),
  // Sand steppe: pale yellow quartz sand.
  sandy: ramp('#a88c5c', '#b89c68', '#c6aa76', '#d3b885', '#dfc594'),
  // Calcrete: chalky, near white with a buff cast.
  lime: ramp('#b9b19b', '#c8c0aa', '#d5cdb8', '#e1dac7', '#ece6d6'),
  // Limestone: cool grey with a warm streak.
  rock: ramp('#6f6a62', '#7f7a71', '#908a80', '#a29c91', '#b5afa3'),
  // Woody root bark.
  wood: ramp('#3a281b', '#4a3423', '#5a402c', '#6a4d36', '#7a5a40'),
};

/**
 * A seed's tone also says which plant it came from: grass seed (long, golden),
 * clover (round, orange-brown), shepherd's purse (tiny, red-brown), feather
 * grass (long and slender, dark) or stork's bill (brown, spindle-shaped).
 */
const SEED_RAMPS = [
  ramp('#8a6a30', '#a5803c', '#c09a4c', '#d4b060'),
  ramp('#7a4a22', '#94592a', '#ad6c34', '#c07e40'),
  ramp('#5a2e1c', '#703a22', '#87482a', '#9a5634'),
  ramp('#4e4232', '#5f513d', '#716148', '#827052'),
  ramp('#4a3424', '#5c412c', '#6e4f35', '#7f5d3f'),
];
const SEED_SIZE: [number, number][] = [[0.8, 0.4], [0.55, 0.48], [0.4, 0.32], [1.05, 0.34], [0.7, 0.38]];
const KINDS = SEED_RAMPS.length;
const SPAN = 256 / KINDS;

/** Colour and half-size (mm) of a seed of this tone. */
export const seedLook = (tone: number): { col: RGB; rx: number; ry: number } => {
  const kind = Math.min(KINDS - 1, Math.floor(tone / SPAN));
  const t = (tone - kind * SPAN) / SPAN;
  const [rx, ry] = SEED_SIZE[kind]!;
  return { col: sampleRamp(SEED_RAMPS[kind]!, t), rx, ry };
};

/** Tone range for seed from each kind of plant. */
export const SEED_TONE: Record<string, [number, number]> = {
  grass: [0, 50],
  clover: [52, 101],
  purse: [103, 152],
  stipa: [154, 203],
  erodium: [205, 255],
};

/** Colour of fallen soft fruit by its tone: 0–99 sloe, 100–199 grape (or old pulp), 200+ rose hip. */
export const fruitColor = (tone: number): RGB =>
  tone < 100 ? sampleRamp(PAL.sloe, tone / 100) : tone < 200 ? sampleRamp(PAL.fruit, (tone - 100) / 100) : sampleRamp(PAL.hip, (tone - 200) / 56);

/** Colour of a dead insect by its tone: 0–149 beetle, 150–219 grasshopper, 220+ earthworm. */
export const preyColor = (tone: number): RGB =>
  tone < 150 ? sampleRamp(PAL.beetle, tone / 150) : tone < 220 ? sampleRamp(PAL.hopper, (tone - 150) / 70) : sampleRamp(PAL.worm, (tone - 220) / 36);

/**
 * Chamber tints, warm and light: the brood and the seed tell rooms apart, the
 * tint only hints (blue-green belongs to water). Applied to the back wall.
 */
export const ZONE_TINT: Record<string, RGB> = {
  queen: hex('#7a4634'),
  nursery: hex('#b49a76'),
  granary: hex('#a27a32'),
  rest: hex('#4a4036'),
};

