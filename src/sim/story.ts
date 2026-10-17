import type { Sim } from './sim';
import { EMPTY } from '../world/mat';

/**
 * The nest's story, for its time-lapse film: when each cell of the nest was
 * first found dug out, in quarter-weeks since the landing (0: never), and the
 * colony's numbers once a week. Kept with the colony (a few kilobytes once
 * compressed: almost every cell of the slice is 0).
 */
export class Story {
  /** Quarter-week (from 1) each nest cell was first seen open. */
  readonly dug: Uint16Array;
  /** Quarter-weeks recorded so far, and the in-game day of the first. */
  steps = 0;
  startDay = 0;
  /** Week by week: workers, brood, seeds in the stores, rooms. */
  readonly weeks: { w: number; b: number; s: number; r: number }[] = [];

  constructor(size: number) {
    this.dug = new Uint16Array(size);
  }

  /** A quarter-week has gone by: note the cells dug since, and on the week, the numbers. */
  record(sim: Sim): void {
    if (this.steps === 0) this.startDay = sim.simDays;
    const step = ++this.steps;
    const mat = sim.world.mat;
    const dug = this.dug;
    for (const i of sim.nest.planCells) if (mat[i] === EMPTY && dug[i] === 0) dug[i] = step;
    if (step % 4 === 1) {
      const c = sim.colony;
      this.weeks.push({ w: c.adults, b: c.brood.length, s: c.stored, r: sim.nest.chambers.filter((ch) => ch.ready).length });
    }
  }
}
