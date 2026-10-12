/**
 * Robustness check: run one seed for N minutes and print a compact timeline.
 * node batch.mjs <seed> <minutes> <foundX>
 */
declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { TICK_HZ } from '../src/config';
const seed = Number(process.argv[2] ?? 1);
const minutes = Number(process.argv[3] ?? 30);
const fx = Number(process.argv[4] ?? 320);
const sim = new Sim(seed);
// Burn a few random ticks first, like a real player who takes a moment to click.
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(fx);
const line: string[] = [];
for (let m = 1; m <= minutes; m++) {
  for (let t = 0; t < TICK_HZ * 60; t++) sim.step();
  if (m % 5 === 0) line.push(`${m}m:${sim.colony.adults}a/${sim.nest.openCells}o/${sim.colony.stored}f`);
}
const c = sim.colony;
console.log(`seed ${String(seed).padEnd(5)} ${sim.phase.padEnd(8)} ${line.join(' ')} | deliv ${c.delivered} deaths ${JSON.stringify(c.deaths)} ch ${sim.nest.chambers.map(x => x.kind[0] + (x.ready ? '' : '*')).join('')}`);
