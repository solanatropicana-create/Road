export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 8-neighbourhood offsets, ordered so index ^ 4 is the opposite direction. */
export const DX8 = [1, 1, 0, -1, -1, -1, 0, 1] as const;
export const DY8 = [0, 1, 1, 1, 0, -1, -1, -1] as const;
