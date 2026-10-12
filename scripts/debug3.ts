import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
import { Task } from '../src/sim/types';
const sim = new Sim(7);
sim.found(320);
const w = sim.world;
for (let t = 0; t < 30 * 60 * 5; t++) sim.step();
const diggers = sim.colony.ants.filter(a => a.task === Task.Dig);
for (const a of diggers) (a as any).reevalAt = 1e12;
const d0 = diggers[0]!;
console.log('digger', d0.name, 'frontier', sim.nest.frontier.length, 'digSrc', sim.fields.sourceCount[F.Dig], 'outSrc', sim.fields.sourceCount[F.Out]);
for (let t = 0; t < 1800; t++) {
  sim.step();
  if (t % 60 === 0) {
    const i = d0.y * w.w + d0.x;
    console.log(t, d0.x, d0.y, 'carry', d0.carry, 'timer', d0.timer, 'dig', sim.fields.dist[F.Dig]![i], 'out', sim.fields.dist[F.Out]![i], 'entr', sim.fields.dist[F.Entr]![i], 'bg', w.bg[i], 'walk', w.walk[i], 'stuck', (d0 as any).stuck, 'drop', (d0 as any).dropDist);
  }
}
console.log('open', sim.nest.openCells, 'pending', sim.nest.pendingCells);
