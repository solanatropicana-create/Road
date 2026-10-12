/**
 * Robustness check: run one seed for N in-game weeks (in-game days) and print
 * a compact timeline: every 5 weeks the date, workers, brood, stores, nest size.
 * node batch.mjs <seed> <weeks> <foundX>
 */
declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { DAY_TICKS } from '../src/config';
const seed = Number(process.argv[2] ?? 1);
const weeks = Number(process.argv[3] ?? 30);
const sim = new Sim(seed, (process.argv[5] as never) ?? 'pannonian');
const fx = Number(process.argv[4] ?? sim.world.w / 2);
sim.found(fx);
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const line: string[] = [];
for (let wk = 1; wk <= weeks; wk++) {
  for (let t = 0; t < DAY_TICKS; t++) sim.step();
  if (wk % 5 === 0) {
    const c = sim.colony;
    const doy = sim.doy;
    line.push(`Y${sim.cal.year(sim.simDays)}${M[sim.cal.month(doy)]}:${c.adults}a/${c.brood.length}b/${c.stored + c.reserve}f${c.alates.length ? `/${c.alates.length}al` : ''}`);
  }
  if (sim.phase === 'failed') break;
}
const c = sim.colony;
console.log(`seed ${String(seed).padEnd(5)} ${sim.phase.padEnd(8)} ${line.join(' ')} | flown ${c.flown.total} deaths ${JSON.stringify(c.deaths)} ch ${sim.nest.chambers.map((x) => x.kind[0] + (x.ready ? '' : '*')).join('')}`);
