declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { Task, Carry } from '../src/sim/types';
const seed = Number(process.argv[2] ?? 8);
const sim = new Sim(seed);
for (let t = 0; t < (seed * 37) % 90; t++) sim.step();
sim.found(320);
const w = sim.world;
for (let t = 0; t < 30 * 60 * 10; t++) sim.step();
type St = { phase: string; since: number };
const st = new Map<number, St>();
const dur: Record<string, number[]> = {};
let giveups = 0;
for (let t = 0; t < 30 * 60 * 6; t++) {
  sim.step();
  for (const a of sim.colony.ants) {
    const loaded = a.carry === Carry.Seed || a.carry === Carry.Fruit;
    const out = w.bg[a.y * w.w + a.x] === 0;
    let phase = 'other';
    if (a.task === Task.Forage) phase = loaded ? 'return' : out ? 'search' : 'exit';
    const prev = st.get(a.id);
    if (!prev) { st.set(a.id, { phase, since: sim.tick }); continue; }
    if (prev.phase !== phase) {
      const key = `${prev.phase}->${phase}`;
      (dur[key] ??= []).push(sim.tick - prev.since);
      if (prev.phase === 'search' && phase === 'other') giveups++;
      st.set(a.id, { phase, since: sim.tick });
    }
  }
}
for (const [k, v] of Object.entries(dur).sort((a, b) => b[1].length - a[1].length)) {
  v.sort((a, b) => a - b);
  console.log(k.padEnd(20), 'n', String(v.length).padStart(4), 'median', (v[v.length >> 1]! / 30).toFixed(1) + 's', 'p90', (v[Math.floor(v.length * 0.9)]! / 30).toFixed(1) + 's');
}
console.log('delivered', sim.colony.delivered, 'ants', sim.colony.adults, 'seedsOutside', sim.looseSeeds);
// where are loose seeds relative to the nest?
const xs: number[] = [];
for (let y = 30; y < 100; y++) for (let x = 0; x < w.w; x++) { const i = y * w.w + x; if (w.mat[i] === 14 && w.bg[i] === 0) xs.push(x); }
const hist = new Array(16).fill(0); for (const x of xs) hist[Math.floor(x / 40)]++;
console.log('seed x histogram (40px bins):', hist.join(' '));
