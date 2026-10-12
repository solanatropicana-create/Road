declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { Task, Carry } from '../src/sim/types';
import { F } from '../src/sim/fields';
const seed = Number(process.argv[2] ?? 4);
const sim = new Sim(seed);
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(320);
const w = sim.world;
for (let t = 0; t < 30 * 60 * 10; t++) sim.step();
// Phase accounting for foragers over 5 minutes.
const acc: Record<string, number> = {};
let n = 0;
for (let t = 0; t < 30 * 60 * 5; t++) {
  sim.step();
  for (const a of sim.colony.ants) {
    if (a.task !== Task.Forage) continue;
    const i = a.y * w.w + a.x;
    const out = w.bg[i] === 0;
    const has = a.carry === Carry.Seed || a.carry === Carry.Fruit;
    const lost = (a as any).lost > 0;
    let k = `${out ? 'OUT' : 'in '} ${has ? 'loaded' : 'empty '} ${a.timer > 0 ? 'busy' : 'walk'}${lost ? ' LOST' : ''}`;
    if (out && !has) k += ` entr${Math.min(60, Math.floor(sim.fields.dist[F.Entr]![i]! / 20) * 20)}`;
    if (out && a.y < w.ground[a.x]! - 6) k += ' high';
    acc[k] = (acc[k] ?? 0) + 1;
    n++;
  }
}
for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(k.padEnd(36), (100 * v / n).toFixed(1) + '%');
console.log('deliv', sim.colony.delivered, 'looseSeeds', sim.looseSeeds, 'ants', sim.colony.adults);
