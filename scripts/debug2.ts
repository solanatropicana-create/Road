import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
import { Task, Carry } from '../src/sim/types';
const sim = new Sim(7);
sim.found(320);
const w = sim.world;
for (let t = 0; t < 30 * 60 * 6; t++) sim.step();
const buckets: Record<string, number> = {};
let samples = 0;
const track = sim.colony.ants.filter(a => a.task === Task.Forage);
for (const a of track) (a as any).reevalAt = 1e12;
console.log('tracking', track.map(a=>a.name));
for (let t = 0; t < 30 * 60 * 2; t++) {
  sim.step();
  for (const a of track) {
    if (!a.alive) continue;
    const i = a.y * w.w + a.x;
    const out = w.bg[i] === 0;
    const carrying = a.carry === Carry.Seed || a.carry === Carry.Fruit;
    const gran = sim.fields.dist[F.Gran]![i];
    const k = `${a.task}-${out ? 'out' : 'in'}-${carrying ? 'carry' : 'empty'}-${a.timer > 0 ? 'busy' : 'move'}-gran${gran === 65535 ? 'FAR' : 'ok'}`;
    buckets[k] = (buckets[k] ?? 0) + 1;
    samples++;
  }
  if (t % 300 === 0) { const a = track[0]!; const i = a.y*w.w+a.x; console.log(t, a.x, a.y, 'task', a.task, 'carry', a.carry, 'gran', sim.fields.dist[F.Gran]![i], 'entr', sim.fields.dist[F.Entr]![i], 'out', sim.fields.dist[F.Out]![i], 'royal', sim.fields.dist[F.Royal]![i], 'bg', w.bg[i]); }
}
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(34), (100 * v / samples).toFixed(1) + '%');
console.log('delivered', sim.colony.delivered, 'gran src', sim.fields.sourceCount[F.Gran], 'chambers', sim.nest.chambers.map(c=>`${c.kind} ${c.ready} floor${c.floor.length}`));
