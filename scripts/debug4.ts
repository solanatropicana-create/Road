import { Sim } from '../src/sim/sim';
const sim = new Sim(7);
sim.found(320);
const w = sim.world;
const CH: Record<number, string> = { 0: ' ', 1: 'h', 2: 'l', 3: 'c', 4: 's', 5: 'g', 6: 'O', 7: 'r', 8: '%', 9: '~', 10: '|', 11: 'v', 12: '*', 13: 'Y', 14: 'o', 15: 'x', 16: '_', 17: '@', 18: '#' };
const dump = (label: string) => {
  console.log('==', label, 'tick', sim.tick, 'open', sim.nest.openCells, 'pend', sim.nest.pendingCells);
  const ants = new Set(sim.colony.ants.map(a => a.y * w.w + a.x));
  for (let y = 70; y < 130; y++) {
    let row = '';
    for (let x = 290; x < 352; x++) {
      const i = y * w.w + x;
      const m = w.mat[i]!;
      let c = CH[m] ?? '?';
      if (m === 0) c = w.plan[i] ? '.' : w.bg[i] ? ',' : ' ';
      else if (w.plan[i]) c = c.toUpperCase() === c ? c : c.toUpperCase();
      if (ants.has(i)) c = 'A';
      if (sim.colony.queen && sim.colony.queen.y * w.w + sim.colony.queen.x === i) c = 'Q';
      row += c;
    }
    console.log(String(y).padStart(3), row);
  }
};
for (let t = 0; t < 30 * 60 * 4; t++) sim.step();
//dump('4 min');
for (let t = 0; t < 30 * 60 * 4; t++) sim.step();
dump('8 min');
import { F } from '../src/sim/fields';
for (const a of sim.colony.ants) {
  const i = a.y * w.w + a.x;
  const fd = (f: number) => sim.fields.dist[f]![i];
  console.log(a.name.padEnd(8), 'task', a.task, 'carry', a.carry, 'pos', a.x, a.y, 'timer', a.timer, 'act', (a as any).act, 'dig', fd(F.Dig), 'out', fd(F.Out), 'entr', fd(F.Entr), 'gran', fd(F.Gran), 'stuck', (a as any).stuck, 'drop', (a as any).dropDist, 'dir', (a as any).dumpDir, 'reeval', a.reevalAt - sim.tick);
}
console.log('digSpots', sim.nest.digSpots.length, 'digSrc', sim.fields.sourceCount[F.Dig], sim.nest.digSpots.slice(0, 10).map(i => `${i % w.w},${(i / w.w) | 0}`).join(' '));
const a = sim.colony.ants.find(x => x.carry === 1)!;
console.log('ant', a.name, a.x, a.y, 'bg', w.bg[a.y*w.w+a.x], 'ground', w.ground[a.x], 'foundX', sim.nest.foundX);
for (let dy = -2; dy <= 2; dy++) {
  let row = '';
  for (let dx = -2; dx <= 2; dx++) {
    const i = (a.y + dy) * w.w + a.x + dx;
    row += `[m${String(w.mat[i]).padStart(2)} w${w.walk[i]} p${w.plan[i]} b${w.bg[i]}] `;
  }
  console.log(row);
}
const fields = sim.fields; const i0 = a.y*w.w+a.x;
for (let k = 0; k < 8; k++) console.log('k', k, 'canStep', fields.canStep(i0, k), 'grounded', (a as any).grounded(sim, i0 + fields.off[k]!));
