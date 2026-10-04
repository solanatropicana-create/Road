export interface V2 {
  x: number;
  y: number;
}

export const v2 = (x = 0, y = 0): V2 => ({ x, y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
export const cross = (a: V2, b: V2): number => a.x * b.y - a.y * b.x;
export const len = (a: V2): number => Math.hypot(a.x, a.y);
export const norm = (a: V2): V2 => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const rot = (a: V2, ang: number): V2 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Wrap angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
/** Ship forward is local -y. World angle of a direction vector in that convention. */
export const headingOf = (d: V2): number => Math.atan2(d.x, -d.y);
export const forwardOf = (angle: number): V2 => ({ x: Math.sin(angle), y: -Math.cos(angle) });
