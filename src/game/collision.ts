export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function intersects(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function playerHitsAny(player: AABB, others: Iterable<AABB>): boolean {
  for (const o of others) {
    if (intersects(player, o)) return true;
  }
  return false;
}
