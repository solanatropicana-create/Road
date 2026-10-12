import { Sim } from '../src/sim/sim';
import { HARDNESS } from '../src/world/mat';
const sim = new Sim(7);
sim.found(320);
const w = sim.world;
const g = w.ground[320]!;
console.log('ground', g, 'plan cells', sim.nest.planCells.length, 'frontier', sim.nest.frontier.length);
for (let y = g - 5; y < g + 6; y++) {
  let row = '';
  for (let x = 312; x < 329; x++) {
    const i = y * w.w + x;
    const m = w.mat[i]!;
    row += w.plan[i] ? (m === 0 ? (w.walk[i] ? 'w' : 'o') : HARDNESS[m] ? 'P' : 'X') : m === 0 ? (w.walk[i] ? ',' : '.') : String(m % 10);
  }
  console.log(y, row);
}
const q = sim.colony.queen!;
for (let t = 0; t < 400; t++) {
  sim.step();
  if (t % 40 === 0) console.log(t, 'q', q.x, q.y, 'ph', q.phase, 'tm', q.timer, 'fr', sim.nest.frontier.length, sim.nest.frontier.map(i=>[i%w.w,(i/w.w)|0]).join(' '), 'spots', sim.nest.digSpots.map(i=>[i%w.w,(i/w.w)|0]).join(' '), 'dist', sim.fields.dist[2]![q.y*w.w+q.x], 'src', sim.fields.sourceCount[2]);
}
for (let y = g - 5; y < g + 6; y++) {
  let row = '';
  for (let x = 312; x < 329; x++) {
    const i = y * w.w + x;
    const m = w.mat[i]!;
    row += (x===q.x&&y===q.y)?'Q': w.plan[i] ? (m === 0 ? (w.walk[i] ? 'w' : 'o') : HARDNESS[m] ? 'P' : 'X') : m === 0 ? (w.walk[i] ? ',' : '.') : String(m % 10);
  }
  console.log(y, row);
}
