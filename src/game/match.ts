import { World } from '../sim/world';
import { AiPilot, AI_PROFILES } from '../sim/ai';
import { blueprintById } from '../sim/blueprints';
import type { Ship } from '../sim/ship';

export type Mode = 'duel' | 'watch';

/** Anything that writes a ship's input once per simulation tick. */
export interface Pilot {
  update(world: World, dt: number): void;
}

export interface MatchSetup {
  mode: Mode;
  seed: number;
  /** Blueprint ids for team 0 and team 1. */
  ships: [string, string];
}

/** One round: two combatants, until one of them can no longer be controlled. */
export class Match {
  world: World;
  combatants: [Ship, Ship];
  pilots: (Pilot | null)[];
  winner: number | null = null;
  over = false;
  /** Seconds since the round ended. */
  overTime = 0;
  elapsed = 0;
  /** Seconds each combatant has been without a working weapon. */
  disarmed = [0, 0];
  reason = '';

  constructor(readonly setup: MatchSetup) {
    this.world = new World(setup.seed);
    const w = this.world;
    const d = 50 + w.rng.range(-6, 10);
    const a0 = w.rng.range(-0.3, 0.3);
    const s0 = w.spawn(blueprintById(setup.ships[0]), 0, -d, w.rng.range(-20, 20), Math.PI / 2 + a0);
    const s1 = w.spawn(blueprintById(setup.ships[1]), 1, d, w.rng.range(-20, 20), -Math.PI / 2 + a0);
    this.combatants = [s0, s1];
    const mk = (s: Ship, t: Ship, i: number) => new AiPilot(s, t, AI_PROFILES[s.blueprintId] ?? AI_PROFILES.serce!, setup.seed * 7 + i);
    this.pilots = [setup.mode === 'watch' ? mk(s0, s1, 1) : null, mk(s1, s0, 2)];
  }

  /** Advance one fixed tick. Player input (if any) must already be on combatants[0].input. */
  step(dt: number): void {
    this.pilots.forEach((p) => p?.update(this.world, dt));
    this.world.step();
    this.elapsed += dt;

    if (!this.over) {
      this.combatants.forEach((s, i) => {
        const armed = s.count('cannon', true) + s.count('laser', true) > 0;
        this.disarmed[i] = armed ? 0 : this.disarmed[i]! + dt;
      });
      const alive = this.combatants.map((s, i) => s.controllable && this.world.ships.includes(s) && this.disarmed[i]! < 12);
      if (!alive[0] || !alive[1]) {
        this.over = true;
        this.winner = alive[0] ? 0 : alive[1] ? 1 : -1;
        const loser = this.combatants[alive[0] ? 1 : 0];
        this.reason = !loser.controllable || !this.world.ships.includes(loser) ? 'köprü sustu' : 'silahsız kaldı';
      } else if (this.elapsed > 240) {
        // Sudden-death tiebreak: more intact structure wins.
        this.over = true;
        const [a, b] = this.combatants;
        this.winner = a.tiles.size / a.initialTiles >= b.tiles.size / b.initialTiles ? 0 : 1;
        this.reason = 'süre doldu';
      }
    } else {
      this.overTime += dt;
    }
  }

  destroy(): void {
    this.world.destroy();
  }
}
