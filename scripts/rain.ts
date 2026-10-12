/** Grow a colony, then throw a storm at it and report what happens. */
declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { TICK_HZ } from '../src/config';
import { WATER } from '../src/world/mat';
const seed = Number(process.argv[2] ?? 3);
const storm = (process.argv[3] ?? 'storm') === 'storm';
const sim = new Sim(seed);
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(320);
// Keep the scheduler's own rain away so the test is controlled.
sim.weather.next = 1e12;
for (let t = 0; t < TICK_HZ * 60 * 25; t++) sim.step();
const report = (label: string) => {
  const w = sim.world;
  let water = 0, waterIn = 0;
  for (let i = 0; i < w.size; i++) if (w.mat[i] === WATER) { water++; if (w.bg[i] === 1 && w.plan[i]) waterIn++; }
  console.log(label.padEnd(10), 'ants', sim.colony.adults, 'brood', sim.colony.brood.length, 'water', water, 'inNest', waterIn, 'wet', sim.physics.moisture.wetCells, 'open', sim.nest.openCells, 'pend', sim.nest.pendingCells, 'deaths', JSON.stringify(sim.colony.deaths));
};
report('before');
sim.startRain(storm);
for (let s = 0; s < 12; s++) {
  for (let t = 0; t < TICK_HZ * 15; t++) sim.step();
  report(`+${(s + 1) * 15}s`);
}
console.log(sim.events.join(' | '));
{
  const w = sim.world;
  sim.startRain(true);
  for (let t = 0; t < TICK_HZ * 40; t++) sim.step();
  const hist = new Array(8).fill(0);
  let maxC = 0;
  for (let i = w.w; i < w.size - w.w; i++) {
    if (w.bg[i] !== 1 || w.mat[i] === 0 || w.mat[i] === WATER) continue;
    if (w.mat[i + w.w] !== 0 && w.mat[i + w.w] !== WATER) continue;
    const m = w.moist[i]!;
    hist[m >> 5]++;
    maxC = Math.max(maxC, m);
  }
  console.log('ceiling moisture histogram (32 bins):', hist.join(' '), 'max', maxC);
  // depth profile at the nest column
  const x = 330; const prof: string[] = [];
  for (let y = w.ground[x]! - 2; y < w.ground[x]! + 30; y += 2) prof.push(`${y - w.ground[x]!}:${w.moist[y * w.w + x]}`);
  console.log('profile', prof.join(' '));
}
