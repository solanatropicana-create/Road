declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
import { Task } from '../src/sim/types';
const seedArg = Number(process.argv[2] ?? 8);
const sim = new Sim(seedArg);
for (let t = 0; t < (seedArg * 37) % 90; t++) sim.step();
sim.found(320);
const mins = Number(process.argv[3] ?? 20);
for (let t = 0; t < 30 * 60 * mins; t++) sim.step();
const w = sim.world;
const diggers = sim.colony.ants.filter(a => a.task === Task.Dig);
console.log('diggers', diggers.length);
for (const a of diggers.slice(0, 12)) { const i = a.y * w.w + a.x; console.log(a.name, a.x, a.y, 'carry', a.carry, 'timer', a.timer, 'bg', w.bg[i], 'dig', sim.fields.dist[F.Dig]![i], 'out', sim.fields.dist[F.Out]![i], 'lost', (a as any).lost, 'stuck', (a as any).stuck, 'drop', (a as any).dropDist, 'dir', (a as any).dumpDir); }
const a0 = diggers[0]!;
for (let y = a0.y - 4; y <= a0.y + 7; y++) { let row = ''; for (let x = a0.x - 10; x <= a0.x + 10; x++) { const i = y * w.w + x; const m = w.mat[i]!; const ant = sim.colony.ants.some(a => a.x === x && a.y === y); row += ant ? 'A' : m ? String(m % 10) : (w.plant[i] ? 'p' : (w.plan[i] ? (w.walk[i] ? 'W' : '.') : (w.walk[i] ? 'w' : ' '))); } console.log(y, row); }
console.log('ground', w.ground[a0.x], 'plant at ant', w.plant[a0.y * w.w + a0.x]);
const fo = sim.colony.ants.filter(a => a.task === Task.Forage);
console.log('foragers', fo.length, 'out src', sim.fields.sourceCount[F.Out], 'entr src', sim.fields.sourceCount[F.Entr]);
for (const a of fo.slice(0, 10)) { const i = a.y * w.w + a.x; console.log('F', a.name, a.x, a.y, 'carry', a.carry, 'bg', w.bg[i], 'plan', w.plan[i], 'out', sim.fields.dist[F.Out]![i], 'entr', sim.fields.dist[F.Entr]![i], 'royal', sim.fields.dist[F.Royal]![i], 'lost', (a as any).lost, 'search', (a as any).search); }
