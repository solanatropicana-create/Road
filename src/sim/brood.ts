/** Egg, larva or pupa. Lives on a chamber floor; nurses move and feed it. */
export class Brood {
  static nextId = 1;
  readonly id = Brood.nextId++;
  stage: 0 | 1 | 2 = 0;
  x: number;
  y: number;
  /** Ticks spent in the current stage. */
  age = 0;
  fed = 0;
  carried = false;
  /** Fed for a major (big-headed soldier) instead of a minor worker. */
  major = false;
  /** 0 a worker, 1 a young queen (gyne), 2 a male. */
  sex: 0 | 1 | 2 = 0;
  /** Ticks spent under water or buried. */
  wet = 0;
  /** Set down by a nurse: not moved again before this tick (no shuttling back and forth). */
  restUntil = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** Larval growth 0..1 (for drawing). */
  get size(): number {
    return this.stage === 1 ? Math.min(1, this.fed / 2) : 0;
  }
}

export interface Corpse {
  x: number;
  y: number;
  carried: boolean;
  /** Died of a fungus (it sprouts mould, and spreads spores), or killed by a parasitoid fly. */
  kind?: 'fungus' | 'parasite';
}
