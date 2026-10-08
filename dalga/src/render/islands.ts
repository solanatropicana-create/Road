import * as THREE from 'three';
import { Rng } from '../core/rng';
import { islandRadiusAt, WORLD, type IslandDef, type PortDef } from '../data/world';
import { colored, flatMat, merge, TriBuilder } from './geom';

interface Theme {
  sand: string;
  wet: string;
  grass: string;
  hill: string;
  rock: string;
  tree: 'palm' | 'pine' | 'dead';
  accent: string;
}

const THEMES: Record<string, Theme> = {
  lush: { sand: '#f1dca2', wet: '#d9c086', grass: '#7cc650', hill: '#5fa83f', rock: '#9ba3ab', tree: 'palm', accent: '#e36f4f' },
  coral: { sand: '#f7e6b4', wet: '#e3cc92', grass: '#93d25b', hill: '#6dba45', rock: '#f09aa8', tree: 'palm', accent: '#ff9f6e' },
  storm: { sand: '#c2b18a', wet: '#a8986f', grass: '#5d8a4c', hill: '#4a7440', rock: '#717a86', tree: 'pine', accent: '#d6c46a' },
  dead: { sand: '#a39b88', wet: '#8a8371', grass: '#666b58', hill: '#545a4b', rock: '#565c61', tree: 'dead', accent: '#7dffc8' },
};

const RINGS = [1.1, 1.0, 0.93, 0.86, 0.79, 0.62, 0.45, 0.28, 0.12];

function surface(isl: IslandDef, f: number, bump: number): number {
  if (f >= 1.05) return -3.2;
  if (f >= 1.0) return 0.3 - (f - 1) * 70;
  if (f >= 0.86) return 0.3 + (1 - f) * 5;
  if (f >= 0.79) return 1.0 + (0.86 - f) * 9;
  const k = 1 - f / 0.79;
  return 1.65 + (isl.height - 1.65) * Math.pow(k, 0.7) * (0.75 + bump * 0.5);
}

/** Height of the island surface at a world point (for placing props). */
export function islandHeightAt(isl: IslandDef, x: number, z: number): number {
  const dx = x - isl.x, dz = z - isl.z;
  const a = Math.atan2(dz, dx);
  const f = Math.hypot(dx, dz) / islandRadiusAt(isl, a);
  return surface(isl, f, 0.5);
}

function palm(rng: Rng, th: Theme, parts: THREE.BufferGeometry[], x: number, y: number, z: number, s: number) {
  const lean = rng.range(-0.25, 0.25), lean2 = rng.range(-0.25, 0.25);
  const h = 4.2 * s;
  parts.push(colored(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, h, 5), '#9a7448', [x + lean * h * 0.5, y + h / 2, z + lean2 * h * 0.5], [lean2, 0, -lean]));
  const tx = x + lean * h, tz = z + lean2 * h, ty = y + h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(0, 0.4);
    const leaf = new THREE.ConeGeometry(0.55 * s, 2.8 * s, 3);
    parts.push(colored(leaf, i % 2 ? th.hill : th.grass, [tx + Math.cos(a) * 1.2 * s, ty - 0.2 * s, tz + Math.sin(a) * 1.2 * s], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], [1, 1, 0.35]));
  }
  if (rng.chance(0.5)) parts.push(colored(new THREE.IcosahedronGeometry(0.3 * s, 0), '#6b4a2a', [tx, ty - 0.4 * s, tz]));
}

function pine(rng: Rng, parts: THREE.BufferGeometry[], x: number, y: number, z: number, s: number) {
  parts.push(colored(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.5 * s, 5), '#6a4b30', [x, y + 0.75 * s, z]));
  const c = rng.chance(0.5) ? '#3f6e3c' : '#365f35';
  for (let i = 0; i < 3; i++) {
    parts.push(colored(new THREE.ConeGeometry((1.5 - i * 0.35) * s, 2 * s, 6), c, [x, y + (1.8 + i * 1.1) * s, z]));
  }
}

function deadTree(rng: Rng, parts: THREE.BufferGeometry[], x: number, y: number, z: number, s: number) {
  const h = 3.2 * s;
  parts.push(colored(new THREE.CylinderGeometry(0.1 * s, 0.25 * s, h, 5), '#4d4740', [x, y + h / 2, z], [rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)]));
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    parts.push(colored(new THREE.CylinderGeometry(0.05 * s, 0.1 * s, 1.6 * s, 4), '#4d4740', [x + Math.cos(a) * 0.5 * s, y + h * (0.6 + i * 0.12), z + Math.sin(a) * 0.5 * s], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]));
  }
}

function house(rng: Rng, parts: THREE.BufferGeometry[], x: number, y: number, z: number, rot: number, s: number) {
  const wall = rng.pick(['#f1e4c8', '#e9d2a8', '#f4efe2', '#d9c09a']);
  const roof = rng.pick(['#c4553b', '#b3473a', '#8d5a3a', '#3f6fa8']);
  const w = 3.4 * s, d = 3 * s, h = 2.6 * s;
  parts.push(colored(new THREE.BoxGeometry(w, h, d), wall, [x, y + h / 2, z], [0, rot, 0]));
  parts.push(colored(new THREE.ConeGeometry(w * 0.85, 1.8 * s, 4), roof, [x, y + h + 0.9 * s, z], [0, rot + Math.PI / 4, 0]));
  parts.push(colored(new THREE.BoxGeometry(0.1, 1.3 * s, 0.8 * s), '#5b3a22', [x + Math.cos(-rot) * w * 0.51, y + 0.65 * s, z + Math.sin(-rot) * w * 0.51], [0, rot, 0]));
}

export function buildIsland(isl: IslandDef): THREE.Mesh {
  const rng = new Rng(isl.seed);
  const th = THEMES[WORLD.zones[isl.zone].theme];
  const tb = new TriBuilder();
  const N = Math.max(18, Math.min(56, Math.round(isl.r * 0.7)));
  const bumps: number[] = [];
  for (let i = 0; i < N; i++) bumps.push(rng.next());
  const ring = (ri: number, i: number): number[] => {
    const f = RINGS[ri];
    const a = ((i % N) / N) * Math.PI * 2;
    const r = islandRadiusAt(isl, a) * f;
    const j = ri >= 5 ? rng.range(-0.4, 0.4) : 0;
    return [Math.cos(a) * r, surface(isl, f, bumps[i % N]) + j, Math.sin(a) * r];
  };
  // Pre-compute so shared vertices stay welded despite jitter.
  const V: number[][][] = RINGS.map((_, ri) => Array.from({ length: N }, (_, i) => ring(ri, i)));
  const top = [0, isl.height * (0.9 + rng.next() * 0.2), 0];
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    const fMid = (RINGS[ri] + RINGS[ri + 1]) / 2;
    for (let i = 0; i < N; i++) {
      const a = V[ri][i], b = V[ri][(i + 1) % N], c = V[ri + 1][(i + 1) % N], d = V[ri + 1][i];
      let col = fMid > 0.97 ? th.wet : fMid > 0.83 ? th.sand : fMid > 0.5 ? th.grass : th.hill;
      if (fMid < 0.5 && isl.height > 9 && fMid < 0.3) col = th.rock;
      tb.quad(a, b, c, d, col, 0.05);
    }
  }
  const last = RINGS.length - 1;
  for (let i = 0; i < N; i++) {
    tb.tri(V[last][i], V[last][(i + 1) % N], top, isl.height > 9 ? th.rock : th.hill, 0.05);
  }
  const parts: THREE.BufferGeometry[] = [tb.geometry()];

  // Props scattered on the grass.
  const count = Math.round(isl.r * 0.35);
  const port = isl.portId ? WORLD.ports.find((p) => p.id === isl.portId) : undefined;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const f = rng.range(0.15, 0.74);
    const r = islandRadiusAt(isl, a) * f;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (port) {
      // Keep the harbour side clear for the village.
      const pa = Math.atan2(port.z - isl.z, port.x - isl.x);
      if (Math.abs(Math.atan2(Math.sin(a - pa), Math.cos(a - pa))) < 0.9) continue;
    }
    const y = surface(isl, f, 0.5) - 0.2;
    const roll = rng.next();
    const s = rng.range(0.8, 1.3);
    if (roll < 0.55) {
      if (th.tree === 'palm') palm(rng, th, parts, x, y, z, s);
      else if (th.tree === 'pine') pine(rng, parts, x, y, z, s);
      else deadTree(rng, parts, x, y, z, s);
    } else if (roll < 0.8) {
      parts.push(colored(new THREE.DodecahedronGeometry(rng.range(0.8, 2.2), 0), th.rock, [x, y + 0.3, z], [rng.next(), rng.next(), rng.next()], [1, rng.range(0.6, 1), 1]));
    } else {
      parts.push(colored(new THREE.IcosahedronGeometry(rng.range(0.8, 1.5), 0), th.hill, [x, y + 0.3, z], [0, 0, 0], [1, 0.7, 1]));
    }
  }
  // Beach rocks.
  for (let i = 0; i < Math.round(isl.r * 0.12); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = islandRadiusAt(isl, a) * rng.range(0.96, 1.08);
    parts.push(colored(new THREE.DodecahedronGeometry(rng.range(0.7, 1.8), 0), th.rock, [Math.cos(a) * r, 0, Math.sin(a) * r], [rng.next(), rng.next(), 0], [1, 0.7, 1]));
  }
  if (port) buildPort(isl, port, rng, parts, th);

  const mesh = new THREE.Mesh(merge(parts), flatMat);
  mesh.position.set(isl.x, 0, isl.z);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function buildPort(isl: IslandDef, port: PortDef, rng: Rng, parts: THREE.BufferGeometry[], th: Theme) {
  const a = Math.atan2(port.z - isl.z, port.x - isl.x);
  const shore = islandRadiusAt(isl, a);
  const ca = Math.cos(a), sa = Math.sin(a);
  // Pier from the beach out toward the mooring.
  const pierLen = 26;
  for (let i = 0; i < 13; i++) {
    const r = shore * 0.88 + (i / 12) * pierLen;
    const x = ca * r, z = sa * r;
    parts.push(colored(new THREE.BoxGeometry(2.1, 0.25, 5), i % 2 ? '#a0703f' : '#8f6236', [x, 1.25, z], [0, -a, 0]));
    if (i % 3 === 0) {
      for (const s of [-1, 1]) {
        parts.push(colored(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 6), '#6b4527', [x - sa * 2.4 * s, 0, z + ca * 2.4 * s]));
      }
    }
  }
  // T-head of the pier.
  const er = shore * 0.88 + pierLen;
  parts.push(colored(new THREE.BoxGeometry(5, 0.3, 12), '#9a6a3b', [ca * er, 1.3, sa * er], [0, -a, 0]));
  for (const s of [-1, 1]) parts.push(colored(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 7), '#7a5a3a', [ca * er - sa * 5 * s, 1.7, sa * er + ca * 5 * s]));
  // Village on the harbour side.
  for (let i = 0; i < 7; i++) {
    const da = rng.range(-0.75, 0.75);
    const f = rng.range(0.42, 0.72);
    const r = islandRadiusAt(isl, a + da) * f;
    const x = Math.cos(a + da) * r, z = Math.sin(a + da) * r;
    house(rng, parts, x, surface(isl, f, 0.5) - 0.3, z, -(a + da) + rng.range(-0.3, 0.3), rng.range(0.9, 1.3));
  }
  // Lighthouse.
  const la = a + 0.95;
  const lr = islandRadiusAt(isl, la) * 0.8;
  const lx = Math.cos(la) * lr, lz = Math.sin(la) * lr, ly = surface(isl, 0.8, 0.5);
  for (let i = 0; i < 4; i++) {
    parts.push(colored(new THREE.CylinderGeometry(1.6 - i * 0.2, 1.8 - i * 0.2, 2.2, 8), i % 2 ? '#c8443a' : '#f5f0e6', [lx, ly + 1.1 + i * 2.2, lz]));
  }
  parts.push(colored(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 8), th.accent === '#7dffc8' ? '#7dffc8' : '#ffe48a', [lx, ly + 9.7, lz]));
  parts.push(colored(new THREE.ConeGeometry(1.6, 1.6, 8), '#c8443a', [lx, ly + 11.2, lz]));
  // Crates and barrels on the beach.
  for (let i = 0; i < 6; i++) {
    const da = rng.range(-0.3, 0.3);
    const r = shore * rng.range(0.82, 0.9);
    const x = Math.cos(a + da) * r, z = Math.sin(a + da) * r;
    if (rng.chance(0.5)) parts.push(colored(new THREE.BoxGeometry(1.2, 1.2, 1.2), '#b07a45', [x, 1.4, z], [0, rng.next(), 0]));
    else parts.push(colored(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 7), '#7c5230', [x, 1.35, z]));
  }
}

export function buildAllIslands(): THREE.Group {
  const g = new THREE.Group();
  for (const isl of WORLD.islands) g.add(buildIsland(isl));
  return g;
}
