/**
 * How long a tick takes once the colony is grown: run a seed for some weeks,
 * then time one more week. For a CPU profile of that week:
 *   npx esbuild scripts/prof.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/prof.mjs
 *   node --cpu-prof --cpu-prof-dir=prof node_modules/.cache/prof.mjs 7 16 lapse
 * node prof.mjs <seed> <weeks> [tempo]
 */
declare const process: { argv: string[]; stdout: { write(s: string): void } };
import { Sim } from '../src/sim/sim';
import { DAY_TICKS } from '../src/config';
const seed = Number(process.argv[2] ?? 7);
const weeks = Number(process.argv[3] ?? 10);
const sim = new Sim(seed, 'pannonian');
if (process.argv[4]) sim.tempo = process.argv[4] as never;
sim.found(sim.world.w / 2);
for (let t = 0; t < DAY_TICKS * weeks; t++) sim.step();
const t0 = performance.now();
for (let t = 0; t < DAY_TICKS; t++) sim.step();
const ms = (performance.now() - t0) / DAY_TICKS;
const c = sim.colony;
process.stdout.write(`seed ${seed} week ${weeks + 1} ${sim.tempo}: ${c.adults} workers, ${c.brood.length} brood, ${sim.nest.chambers.length} rooms, ${ms.toFixed(3)} ms a tick (16x needs ${(ms * 480).toFixed(0)} ms a second)\n`);
