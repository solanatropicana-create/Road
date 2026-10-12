import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
import { Nest } from '../src/sim/nest';
declare const process: { argv: string[] };
const seedArg = Number(process.argv[2] ?? 7);
const sim = new Sim(seedArg);
for (let t = 0; t < (seedArg * 37) % 90; t++) sim.step();
sim.found(320);
for (let t = 0; t < 30 * 60 * 20; t++) sim.step();
const c = sim.colony as any;
for (let k = 0; k < 4; k++) {
  for (let t = 0; t < 30; t++) sim.step();
  console.log('tick', sim.tick, 'frontier', sim.nest.frontier.length, 'pending', sim.nest.pendingCells, 'starving', c.starving, 'stored', c.stored, 'adults', c.adults, 'gran src', sim.fields.sourceCount[F.Gran], 'trash src', sim.fields.sourceCount[F.Trash], 'share', JSON.stringify(c.share));
}
{
  const w = sim.world;
  const fields = sim.fields;
  const q = sim.colony.queen!;
  const start = q.y * w.w + q.x;
  const seen = new Uint8Array(w.size);
  const queue = [start]; seen[start] = 1;
  while (queue.length) { const i = queue.pop()!; for (let k = 0; k < 8; k++) { if (!fields.canStep(i, k)) continue; const n = i + fields.off[k]!; if (!seen[n]) { seen[n] = 1; queue.push(n); } } }
  const spots = sim.nest.digSpots;
  console.log('queen walkable', w.walk[start], 'spots reachable from queen', spots.filter(s => seen[s]).length, '/', spots.length);
  const outs = []; for (let i = 0; i < w.size; i++) if (seen[i] && w.bg[i] === 0) { outs.push(i); }
  console.log('queen region touches outside cells:', outs.length);
  const dd = sim.fields.dist[2]!;
  console.log('dig dist at spots', spots.slice(0, 6).map(s => dd[s]), 'walk at spots', spots.slice(0, 6).map(s => w.walk[s]));
  console.log('Dig field due/interval check: sourceCount', sim.fields.sourceCount[2]);
}
{
  const w = sim.world; const fields = sim.fields; const q = sim.colony.queen!;
  const seen = new Uint8Array(w.size); const queue = [q.y * w.w + q.x]; seen[queue[0]!] = 1;
  while (queue.length) { const i = queue.pop()!; for (let k = 0; k < 8; k++) { if (!fields.canStep(i, k)) continue; const n = i + fields.off[k]!; if (!seen[n]) { seen[n] = 1; queue.push(n); } } }
  const s0 = sim.nest.digSpots[0]!; const sx = s0 % w.w, sy = (s0 / w.w) | 0;
  console.log('first spot', sx, sy);
  for (let y = sy - 6; y <= sy + 6; y++) { let row = ''; for (let x = sx - 10; x <= sx + 10; x++) { const i = y * w.w + x; const m = w.mat[i]!; row += m ? (w.plan[i] ? 'P' : '#') : (seen[i] ? 'r' : (w.walk[i] ? 'w' : '.')); } console.log(y, row); }
}
{
  const w = sim.world;
  const pend = sim.nest.planCells.filter(i => w.mat[i] !== 0 && Nest.diggable(w, i));
  console.log('pending diggable', pend.length);
  // nearest pending cell to any open planned cell
  let best = -1, bd = 1e9;
  const open = sim.nest.planCells.filter(i => w.mat[i] === 0 && w.bg[i] === 1);
  for (const p of pend) for (const o of open) { const d = Math.abs(p % w.w - o % w.w) + Math.abs(((p / w.w) | 0) - ((o / w.w) | 0)); if (d < bd) { bd = d; best = p; } }
  console.log('closest pending to open', best % w.w, (best / w.w) | 0, 'dist', bd);
  const bx = best % w.w, by = (best / w.w) | 0;
  for (let y = by - 5; y <= by + 5; y++) { let row = ''; for (let x = bx - 12; x <= bx + 12; x++) { const i = y * w.w + x; const m = w.mat[i]!; row += m === 0 ? (w.plan[i] ? 'o' : (w.bg[i] ? '!' : ' ')) : (w.plan[i] ? (Nest.diggable(w, i) ? 'D' : 'X') : String(m % 10)); } console.log(y, row); }
  console.log('chambers', sim.nest.chambers.map(c => `${c.kind}@${c.cx},${c.cy} dug ${c.dug}/${c.cells.length}`).join(' | '));
}
