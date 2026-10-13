/**
 * Food economy probe: one seed, week by week. Prints workers, brood, stores,
 * the week's income and use (all the food that went: eaten, fed to larvae, lost), foragers, seed lying on the surface, ants
 * outside, and starvation deaths, so growth and famine can be traced; how far
 * the foragers range, the income they bring, and the week's flight weather.
 * node econ.mjs <seed> <weeks> [site]
 */
declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { DAY_TICKS } from '../src/config';
import { Task } from '../src/sim/types';
import { SEED } from '../src/world/mat';
const seed = Number(process.argv[2] ?? 1);
const weeks = Number(process.argv[3] ?? 80);
const sim = new Sim(seed, (process.argv[4] as never) ?? 'pannonian');
sim.found(sim.world.w / 2);
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let lastD = 0, lastS = 0, lastF = sim.colony.stored + sim.colony.reserve;
for (let wk = 1; wk <= weeks; wk++) {
  // Flight weather this week: midday ticks in the season fit for a flight, and whether one went.
  let fit = 0, flew = false;
  const o = sim as unknown as { lastRain: number; cloud: number; flight: boolean };
  for (let t = 0; t < DAY_TICKS; t++) {
    sim.step();
    if (sim.flight) flew = true;
    if (sim.doy >= 95 && sim.doy <= 165 && sim.dayT > 0.42 && sim.dayT < 0.58 && !sim.raining && o.cloud <= 0.6 && sim.surfaceT >= 20 && sim.surfaceT <= 36 && (sim.tick - o.lastRain < DAY_TICKS * 2 || sim.doy > 145)) fit++;
  }
  const c = sim.colony, w = sim.world;
  const [e, l, p] = c.broodCounts();
  let surf = 0;
  for (let x = 0; x < w.w; x++) for (let y = w.ground[x]! - 60; y < w.ground[x]! + 2; y++) if (y > 0 && w.mat[y * w.w + x] === SEED && w.bg[y * w.w + x] === 0) surf++;
  const out = c.ants.filter((a) => !a.away && w.bg[a.y * w.w + a.x] === 0).length;
  const away = c.ants.filter((a) => a.away).length;
  const fg = c.ants.filter((a) => a.task === Task.Forage).length;
  const st = c.deaths['starvation'] ?? 0;
  console.log(`${String(wk).padStart(3)} ${M[sim.cal.month(sim.doy)]} ${sim.dormant ? 'Z' : ' '} a${String(c.adults).padStart(4)} maj${String(c.majors).padStart(3)} e${String(e).padStart(3)} l${String(l).padStart(3)} p${String(p).padStart(3)} al${c.alates.length} | st${String(c.stored).padStart(4)} res${String(Math.round(c.reserve)).padStart(4)} | in${String(c.delivered - lastD).padStart(4)} use${String(Math.round(lastF + c.delivered - lastD - c.stored - c.reserve)).padStart(4)} | fg${String(fg).padStart(3)} out${String(out).padStart(3)} away${String(away).padStart(3)} surf${String(surf).padStart(4)} | starve+${st - lastS} reach${Math.round(c.reach)} inc${Math.round(c.income)}${fit ? ` fit${fit}` : ''}${flew ? ' FLIGHT' : ''} nestT${c.nestTemp.toFixed(0)} ch${sim.nest.chambers.length} gate${(sim.nest as unknown as { gateX: number }).gateX}`);
  lastD = c.delivered; lastS = st; lastF = c.stored + c.reserve;
  if (sim.phase === 'failed') break;
}
console.log('flown', JSON.stringify(sim.colony.flown), JSON.stringify(sim.colony.deaths));
