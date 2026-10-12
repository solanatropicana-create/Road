declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
const seed = Number(process.argv[2] ?? 4);
const sim = new Sim(seed);
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(320);
const w = sim.world;
let lastDel = 0;
for (let m = 1; m <= 32; m++) {
  for (let t = 0; t < 1800; t++) sim.step();
  const c = sim.colony;
  const counts: Record<string, number> = {};
  for (const a of c.ants) {
    const i = a.y * w.w + a.x;
    const k = `${a.task}${w.bg[i] ? 'i' : 'o'}${a.carry ? 'L' : ''}${(a as any).lost > 0 ? '!' : ''}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log(`m${m} rain ${sim.weather.rain.toFixed(2)} ants ${c.adults} deliv/min ${c.delivered - lastDel} stored ${c.stored} reserve ${c.reserve} gran ${sim.fields.sourceCount[F.Gran]} store ${sim.fields.sourceCount[F.Store]} water ${(() => { let n = 0; for (let i = 0; i < w.size; i++) if (w.mat[i] === 9) n++; return n; })()} ${JSON.stringify(counts)}`);
  lastDel = c.delivered;
}
