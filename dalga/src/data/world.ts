import { Rng } from '../core/rng';

export type Faction = 'player' | 'pirate' | 'navy' | 'merchant' | 'ghost';

export interface ZoneDef {
  id: number;
  name: string;
  r0: number;
  r1: number;
  levelMin: number;
  levelMax: number;
  deep: string;
  shallow: string;
  fog: string;
  sky: string;
  theme: 'lush' | 'coral' | 'storm' | 'dead';
  factions: [Faction, number][];
  population: number;
}

export interface IslandDef {
  id: number;
  x: number;
  z: number;
  r: number;
  /** Harmonics: amplitude/phase pairs for k = 2, 3, 5. */
  h: [number, number, number, number, number, number];
  height: number;
  zone: number;
  seed: number;
  portId?: string;
}

export interface PortDef {
  id: string;
  name: string;
  zone: number;
  islandId: number;
  /** Dock (where the ship moors). */
  x: number;
  z: number;
  /** Facing out to sea from the dock. */
  angle: number;
}

export interface BossDef {
  id: string;
  name: string;
  zone: number;
  x: number;
  z: number;
  ship: string;
  level: number;
  faction: Faction;
  gems: number;
  bounty: number;
}

const zones: ZoneDef[] = [
  {
    id: 0, name: 'Sakin Koy', r0: 0, r1: 650, levelMin: 1, levelMax: 5,
    deep: '#1f7fb0', shallow: '#45c7c9', fog: '#9fd8ef', sky: '#8fd3f4', theme: 'lush',
    factions: [['merchant', 0.45], ['pirate', 0.55]], population: 9,
  },
  {
    id: 1, name: 'Mercan Denizi', r0: 650, r1: 1350, levelMin: 4, levelMax: 11,
    deep: '#1a74a8', shallow: '#3fd0c0', fog: '#a6dcec', sky: '#8ad0f0', theme: 'coral',
    factions: [['merchant', 0.3], ['pirate', 0.45], ['navy', 0.25]], population: 11,
  },
  {
    id: 2, name: 'Fırtına Kuşağı', r0: 1350, r1: 2050, levelMin: 10, levelMax: 18,
    deep: '#1d4f72', shallow: '#3c8a98', fog: '#5f7486', sky: '#5d7182', theme: 'storm',
    factions: [['merchant', 0.15], ['pirate', 0.45], ['navy', 0.4]], population: 12,
  },
  {
    id: 3, name: 'Ölü Sular', r0: 2050, r1: 2800, levelMin: 17, levelMax: 26,
    deep: '#1e4b57', shallow: '#3a8077', fog: '#5d8075', sky: '#5d7a72', theme: 'dead',
    factions: [['pirate', 0.25], ['navy', 0.2], ['ghost', 0.55]], population: 12,
  },
];

const PORTS_RAW: { id: string; name: string; zone: number; angle: number; r: number; size: number }[] = [
  { id: 'liman', name: 'Ana Liman', zone: 0, angle: 0, r: 0, size: 58 },
  { id: 'mercan', name: 'Mercan Kalesi', zone: 1, angle: -0.7, r: 1000, size: 52 },
  { id: 'firtina', name: 'Fener Burnu', zone: 2, angle: 2.4, r: 1700, size: 50 },
  { id: 'olu', name: 'Kemik Koyu', zone: 3, angle: -2.3, r: 2420, size: 48 },
];

export const BOSSES: BossDef[] = [
  { id: 'bill', name: 'Kambur Bill', zone: 0, x: 0, z: 0, ship: 'brigantin', level: 8, faction: 'pirate', gems: 25, bounty: 2500 },
  { id: 'kralice', name: 'Mercan Kraliçesi', zone: 1, x: 0, z: 0, ship: 'firkateyn', level: 15, faction: 'pirate', gems: 45, bounty: 9000 },
  { id: 'amiral', name: 'Fırtına Amirali', zone: 2, x: 0, z: 0, ship: 'kalyon', level: 22, faction: 'navy', gems: 80, bounty: 30000 },
  { id: 'hollandali', name: 'Uçan Hollandalı', zone: 3, x: 0, z: 0, ship: 'hayalet', level: 30, faction: 'ghost', gems: 150, bounty: 90000 },
];
const BOSS_POS: [number, number][] = [
  [1.3, 470],
  [2.9, 1050],
  [-1.2, 1720],
  [0.8, 2450],
];
BOSSES.forEach((b, i) => {
  const [a, r] = BOSS_POS[i];
  b.x = Math.cos(a) * r;
  b.z = Math.sin(a) * r;
});

export function islandRadiusAt(isl: IslandDef, angle: number): number {
  const h = isl.h;
  return isl.r * (1 + h[0] * Math.cos(2 * angle + h[1]) + h[2] * Math.cos(3 * angle + h[3]) + h[4] * Math.cos(5 * angle + h[5]));
}

/** Signed distance (approx.) from a point to an island shore. Negative = on land. */
export function islandSdf(isl: IslandDef, x: number, z: number): number {
  const dx = x - isl.x, dz = z - isl.z;
  return Math.hypot(dx, dz) - islandRadiusAt(isl, Math.atan2(dz, dx));
}

function zoneIndexAt(r: number): number {
  for (let i = zones.length - 1; i >= 0; i--) if (r >= zones[i].r0) return i;
  return 0;
}

function generate() {
  const rng = new Rng(20261008);
  const islands: IslandDef[] = [];
  const ports: PortDef[] = [];
  const mk = (x: number, z: number, r: number, smooth = false): IslandDef => {
    const amp = smooth ? 0.5 : 1;
    return {
      id: islands.length, x, z, r,
      h: [
        rng.range(0.04, 0.16) * amp, rng.range(0, 6.28),
        rng.range(0.03, 0.1) * amp, rng.range(0, 6.28),
        rng.range(0.01, 0.05) * amp, rng.range(0, 6.28),
      ],
      height: rng.range(3, 6) + r * rng.range(0.04, 0.1),
      zone: zoneIndexAt(Math.hypot(x, z)),
      seed: rng.int(1, 1e9),
    };
  };

  for (const p of PORTS_RAW) {
    const cx = Math.cos(p.angle) * p.r, cz = Math.sin(p.angle) * p.r;
    const isl = mk(cx, cz, p.size, true);
    isl.portId = p.id;
    islands.push(isl);
    // Dock faces the world centre (or south for the home port).
    const outA = p.r === 0 ? Math.PI / 2 : Math.atan2(-cz, -cx);
    const shore = islandRadiusAt(isl, outA);
    ports.push({
      id: p.id, name: p.name, zone: p.zone, islandId: isl.id,
      x: cx + Math.cos(outA) * (shore + 22), z: cz + Math.sin(outA) * (shore + 22), angle: outA,
    });
  }

  const keepClear: [number, number, number][] = [
    ...ports.map((p) => [p.x, p.z, 110] as [number, number, number]),
    ...BOSSES.map((b) => [b.x, b.z, 150] as [number, number, number]),
    [0, 130, 120],
  ];

  let tries = 0;
  while (islands.length < 150 && tries < 6000) {
    tries++;
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range(0.012, 1)) * 2760;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const zi = zoneIndexAt(r);
    const big = rng.chance(0.25);
    const rad = big ? rng.range(40, 75) : rng.range(12, 36);
    let ok = true;
    for (const [kx, kz, kr] of keepClear) if (Math.hypot(x - kx, z - kz) < kr + rad) { ok = false; break; }
    if (!ok) continue;
    for (const o of islands) {
      const gap = zi === 0 ? 85 : 65;
      if (Math.hypot(o.x - x, o.z - z) < o.r * 1.25 + rad * 1.25 + gap) { ok = false; break; }
    }
    if (!ok) continue;
    islands.push(mk(x, z, rad));
  }
  return { islands, ports };
}

const gen = generate();

export const WORLD = {
  radius: 2800,
  zones,
  islands: gen.islands,
  ports: gen.ports,
  bosses: BOSSES,
  spawn: { x: 0, z: 140, angle: Math.PI / 2 },
};

export function zoneAt(x: number, z: number): ZoneDef {
  return zones[zoneIndexAt(Math.hypot(x, z))];
}

/** Uniform grid over islands for fast proximity queries. */
const CELL = 200;
const grid = new Map<string, IslandDef[]>();
for (const isl of WORLD.islands) {
  const reach = isl.r * 1.3 + 40;
  for (let cx = Math.floor((isl.x - reach) / CELL); cx <= Math.floor((isl.x + reach) / CELL); cx++) {
    for (let cz = Math.floor((isl.z - reach) / CELL); cz <= Math.floor((isl.z + reach) / CELL); cz++) {
      const k = cx + ',' + cz;
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(isl);
    }
  }
}
const EMPTY: IslandDef[] = [];
export function islandsNear(x: number, z: number): IslandDef[] {
  return grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) ?? EMPTY;
}
