declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { F } from '../src/sim/fields';
const seed = Number(process.argv[2] ?? 4), mins = Number(process.argv[3] ?? 24);
const sim = new Sim(seed);
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(320);
for (let t = 0; t < 1800 * mins; t++) sim.step();
const w = sim.world;
// densest 5x5 spot among outside ants
const out = sim.colony.ants.filter(a => w.bg[a.y * w.w + a.x] === 0);
let best = out[0]!, bn = 0;
for (const a of out) { const n = out.filter(b => Math.abs(b.x - a.x) <= 3 && Math.abs(b.y - a.y) <= 3).length; if (n > bn) { bn = n; best = a; } }
console.log('cluster at', best.x, best.y, 'size', bn, 'task', best.task);
const cx = best.x, cy = best.y;
const ants = new Map<number, number>(); for (const a of out) ants.set(a.y * w.w + a.x, (ants.get(a.y * w.w + a.x) ?? 0) + 1);
for (let y = cy - 8; y <= cy + 6; y++) { let row = ''; for (let x = cx - 14; x <= cx + 14; x++) { const i = y * w.w + x; const m = w.mat[i]!; const n = ants.get(i); row += n ? String(Math.min(9, n)) : m === 8 ? '#' : m ? '%' : w.plant[i] ? '|' : w.plan[i] ? (w.walk[i] ? 'W' : '.') : (w.walk[i] ? 'w' : ' '); } console.log(String(y).padStart(3), row); }
const a = best; const i = a.y * w.w + a.x;
console.log('entr', sim.fields.dist[F.Entr]![i], 'fdist', (a as any).fdist, 'fdir', (a as any).fdir, 'search', (a as any).search, 'lastDir', (a as any).lastDir, 'step', a.step);
for (let k = 0; k < 8; k++) { const n = i + sim.fields.off[k]!; console.log('k', k, 'can', sim.fields.canStep(i, k), 'bg', w.bg[n], 'entr', sim.fields.dist[F.Entr]![n], 'pher', sim.pher[n]!.toFixed(2), 'mat', w.mat[n], 'plant', w.plant[n]); }
