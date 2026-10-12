import { Sim } from '../src/sim/sim';
const seedArg = 6;
const sim = new Sim(seedArg);
for (let t = 0; t < (seedArg * 37) % 90; t++) sim.step();
sim.found(320);
const w = sim.world;
const target = 91 * w.w + 322;
const origSet = w.set.bind(w);
(w as any).set = (i: number, m: number, tone?: number, tint?: number) => {
  if (i === target) console.log('tick', sim.tick, 'set', m, new Error().stack!.split('\n').slice(2, 5).map(s => s.trim()).join(' <- '));
  origSet(i, m, tone, tint);
};
const origSwap = w.swap.bind(w);
(w as any).swap = (a: number, b: number) => {
  if (a === target || b === target) console.log('tick', sim.tick, 'swap', a === target ? 'from' : 'into', w.mat[a], w.mat[b], 'plan', w.plan[target], 'bg', w.bg[target]);
  origSwap(a, b);
};
for (let t = 0; t < 30 * 60 * 8; t++) sim.step();
console.log('final mat', w.mat[target], 'plan', w.plan[target], 'bg', w.bg[target], 'ground', w.ground[322]);
