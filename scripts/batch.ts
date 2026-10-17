/**
 * Robustness check: run one seed for N in-game weeks (in-game days) and print
 * a line every 10 weeks as it goes (date, workers, brood, food, alates, the
 * seconds it took), then a summary: how it ended, flights, deaths.
 * node batch.mjs <seed> <weeks> [foundX] [site] [tempo: true | lively | lapse]
 */
declare const process: { argv: string[]; stdout: { write(s: string): void } };
import { Sim } from '../src/sim/sim';
import { DAY_TICKS } from '../src/config';
const seed = Number(process.argv[2] ?? 1);
const weeks = Number(process.argv[3] ?? 30);
const sim = new Sim(seed, (process.argv[5] as never) ?? 'pannonian');
// node batch.mjs <seed> <weeks> [foundX] [site] [tempo]
if (process.argv[6]) sim.tempo = process.argv[6] as never;
const fx = Number(process.argv[4] ?? sim.world.w / 2);
sim.found(fx);
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Weeks between progress lines (EVERY=2 for a closer look at the first year). */
const EVERY = Number((globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.EVERY ?? 10);
let t0 = performance.now();
let peak = 0;
for (let wk = 1; wk <= weeks; wk++) {
  for (let t = 0; t < DAY_TICKS; t++) sim.step();
  const c = sim.colony;
  peak = Math.max(peak, c.adults);
  if (wk % EVERY === 0 || sim.phase === 'failed') {
    const doy = sim.doy;
    const s = ((performance.now() - t0) / 1000).toFixed(0);
    t0 = performance.now();
    process.stdout.write(`seed ${seed} wk${String(wk).padStart(3)} Y${sim.cal.year(sim.simDays)}${M[sim.cal.month(doy)]} ${c.adults}a/${c.brood.length}b/${c.stored}+${Math.round(c.reserve)}f${c.alates.length ? `/${c.alates.length}al` : ''} flown${c.flown.total} rooms${sim.nest.chambers.length} ${s}s\n`);
  }
  if (sim.phase === 'failed') break;
}
const c = sim.colony;
const starve = c.deaths['starvation'] ?? 0;
process.stdout.write(`SUMMARY seed ${seed} ${sim.phase} weeks ${Math.min(weeks, Math.round(sim.simDays))} adults ${c.adults} peak ${peak} flown ${c.flown.total} starvation ${starve} deaths ${JSON.stringify(c.deaths)} rooms ${sim.nest.chambers.map((x) => x.kind[0] + (x.ready ? '' : '*')).join('')}\n`);
