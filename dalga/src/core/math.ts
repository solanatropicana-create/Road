export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
};

/** Closest points between segments p1-q1 and p2-q2 (2D). Returns [s, t] parameters. */
export function segSegClosest(
  p1x: number, p1z: number, q1x: number, q1z: number,
  p2x: number, p2z: number, q2x: number, q2z: number,
): [number, number] {
  const d1x = q1x - p1x, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2z = q2z - p2z;
  const rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return [0, 0];
  if (a <= 1e-9) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-9) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return [s, t];
}

export function formatNum(n: number): string {
  n = Math.floor(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.0', '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.0', '') + 'K';
  return String(n);
}
