/**
 * Hull plan-view profile shared by collision and rendering.
 * t runs 0 (stern) … 1 (bow); returns the half-beam fraction at that station.
 */
export function hullWidth(t: number): number {
  if (t <= 0) return 0.72;
  if (t < 0.35) {
    const u = t / 0.35;
    return 0.72 + 0.28 * Math.sin((u * Math.PI) / 2);
  }
  if (t < 0.58) return 1;
  const u = Math.min(1, (t - 0.58) / 0.42);
  return Math.max(0.04, Math.pow(Math.cos((u * Math.PI) / 2), 0.75));
}

/** Freeboard (deck height above waterline) for a ship of the given length. */
export const deckHeight = (length: number) => 0.7 + length * 0.055;
