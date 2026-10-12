declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
const mins = Number(process.argv[2] ?? 25);
const seedArg = Number(process.argv[7] ?? 7);
const sim = new Sim(seedArg);
for (let t = 0; t < (seedArg * 37) % 90; t++) sim.step();
sim.found(320);
const w = sim.world;
for (let t = 0; t < 30 * 60 * mins; t++) sim.step();
const CH: Record<number, string> = { 1: 'h', 2: 'l', 3: 'c', 4: 's', 5: 'g', 6: 'O', 7: 'r', 8: '%', 9: '~', 14: 'o', 15: 'x', 16: '_', 17: '@', 18: '#' };
const ants = new Map(sim.colony.ants.map(a => [a.y * w.w + a.x, a]));
console.log('open', sim.nest.openCells, 'pend', sim.nest.pendingCells, 'frontier', sim.nest.frontier.length, 'digSrc', sim.fields.sourceCount[F.Dig]);
const x0 = Number(process.argv[3] ?? 270), x1 = Number(process.argv[4] ?? 380), y0 = Number(process.argv[5] ?? 74), y1 = Number(process.argv[6] ?? 170);
for (let y = y0; y < y1; y++) {
  let row = '';
  for (let x = x0; x < x1; x++) {
    const i = y * w.w + x;
    const m = w.mat[i]!;
    let c: string;
    if (m === 0) c = w.plan[i] ? (w.zone[i] ? ':' : '.') : w.bg[i] ? '!' : (w.plant[i] ? '|' : ' ');
    else { c = CH[m] ?? '?'; if (w.plan[i]) c = c.toUpperCase(); }
    const a = ants.get(i);
    if (a) c = a.carry ? 'C' : 'A';
    row += c;
  }
  console.log(String(y).padStart(3), row);
}
const dig = sim.colony.ants.filter(a => a.task === 1);
const states: Record<string, number> = {};
for (const a of dig) { const i = a.y * w.w + a.x; const k = `carry${a.carry} bg${w.bg[i]} timer${a.timer > 0 ? 1 : 0} dig${sim.fields.dist[F.Dig]![i] === 65535 ? 'FAR' : 'ok'}`; states[k] = (states[k] ?? 0) + 1; }
console.log(states);
console.log('chambers', sim.nest.chambers.map(c => `${c.kind}@${c.cx},${c.cy} ready=${c.ready} dug=${c.dug}/${c.cells.length}`).join(' | '));
const fo = sim.colony.ants.filter(a => a.task === 2);
for (const a of fo) { const i = a.y * w.w + a.x; console.log('forager', a.name, a.x, a.y, 'carry', a.carry, 'bg', w.bg[i], 'gran', sim.fields.dist[F.Gran]![i], 'entr', sim.fields.dist[F.Entr]![i], 'royal', sim.fields.dist[F.Royal]![i], 'lost', (a as any).lost, 'search', (a as any).search); }
console.log('gran src', sim.fields.sourceCount[F.Gran], 'royal src', sim.fields.sourceCount[F.Royal], 'entr src', sim.fields.sourceCount[F.Entr], 'entrances', sim.nest.entrances.map(e => `${e % w.w},${(e / w.w) | 0}`));
{
  const dd = sim.fields.dist[F.Dig]!;
  const q = sim.colony.queen!;
  console.log('dig dist at queen', dd[q.y * w.w + q.x], 'at entrance', sim.nest.entrances.map(e => dd[e]), 'dig src', sim.fields.sourceCount[F.Dig], 'frontier sample', sim.nest.frontier.slice(0, 8).map(i => `${i % w.w},${(i / w.w) | 0}`).join(' '));
  const tasks: Record<number, number> = {}; for (const a of sim.colony.ants) tasks[a.task] = (tasks[a.task] ?? 0) + 1;
  console.log('tasks', tasks, 'shares', JSON.stringify(sim.colony.share));
}
