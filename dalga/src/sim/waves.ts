/**
 * Shared ocean surface. The CPU version drives buoyancy; the GLSL version
 * generated from the same table drives the water mesh, so ships sit exactly on
 * the waves the player sees.
 */
import { WORLD } from '../data/world';

interface Wave {
  dx: number;
  dz: number;
  k: number;
  w: number;
  amp: number;
  phase: number;
}

const G = 9.81;
const RAW: [number, number, number, number, number][] = [
  // dirX, dirZ, wavelength, amplitude, phase
  [1, 0.35, 42, 0.5, 0],
  [-0.3, 1, 25, 0.3, 1.7],
  [0.75, -0.65, 14, 0.15, 4.1],
  [-0.9, -0.4, 8.5, 0.07, 2.3],
];

export const WAVES: Wave[] = RAW.map(([dx, dz, len, amp, phase]) => {
  const l = Math.hypot(dx, dz);
  const k = (Math.PI * 2) / len;
  return { dx: dx / l, dz: dz / l, k, w: Math.sqrt(G * k), amp, phase };
});

/** Sea state multiplier by position: calm bay, choppy storm belt, eerie dead water. */
export function seaState(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const z1 = WORLD.zones[1].r0, z2 = WORLD.zones[2].r0, z3 = WORLD.zones[3].r0;
  if (r < z1) return 0.7 + (0.3 * r) / z1;
  if (r < z2 - 120) return 1.0;
  if (r < z2 + 60) return 1.0 + (1.6 * (r - (z2 - 120))) / 180;
  if (r < z3 - 80) return 2.6;
  if (r < z3 + 80) return 2.6 - (1.9 * (r - (z3 - 80))) / 160;
  return 0.7;
}

export function waveHeight(x: number, z: number, t: number): number {
  const s = seaState(x, z);
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const wv = WAVES[i];
    h += wv.amp * Math.sin(wv.k * (wv.dx * x + wv.dz * z) - wv.w * t + wv.phase);
  }
  return h * s;
}

/** GLSL source for the same functions. */
export function wavesGLSL(): string {
  const f = (n: number) => n.toFixed(6);
  const terms = WAVES.map(
    (w) => `h += ${f(w.amp)} * sin(${f(w.k)} * dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) - ${f(w.w)} * t + ${f(w.phase)});`,
  ).join('\n  ');
  const dterms = WAVES.map(
    (w) =>
      `{ float c = ${f(w.amp * w.k)} * cos(${f(w.k)} * dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) - ${f(w.w)} * t + ${f(w.phase)}); g += c * vec2(${f(w.dx)}, ${f(w.dz)}); }`,
  ).join('\n  ');
  const z1 = WORLD.zones[1].r0.toFixed(1), z2 = WORLD.zones[2].r0.toFixed(1), z3 = WORLD.zones[3].r0.toFixed(1);
  return /* glsl */ `
float seaState(vec2 p) {
  float r = length(p);
  if (r < ${z1}) return 0.7 + 0.3 * r / ${z1};
  if (r < ${z2} - 120.0) return 1.0;
  if (r < ${z2} + 60.0) return 1.0 + 1.6 * (r - (${z2} - 120.0)) / 180.0;
  if (r < ${z3} - 80.0) return 2.6;
  if (r < ${z3} + 80.0) return 2.6 - 1.9 * (r - (${z3} - 80.0)) / 160.0;
  return 0.7;
}
float waveH(vec2 p, float t) {
  float h = 0.0;
  ${terms}
  return h * seaState(p);
}
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  ${dterms}
  return g * seaState(p);
}
`;
}
