import { Sim } from '../src/sim/sim';
const sim = new Sim(7);
sim.found(320);
for (let t = 0; t < 30 * 60 * 6; t++) sim.step();
const anySim = sim as any;
const times = new Array(11).fill(0);
for (let r = 0; r < 200; r++) {
  for (let f = 0; f < 11; f++) {
    const t0 = performance.now();
    anySim.buildField(f);
    times[f] += performance.now() - t0;
  }
}
console.log(times.map((t, f) => `${f}:${(t / 200 * 1000).toFixed(0)}us src=${sim.fields.sourceCount[f]}`).join('  '));
const t0 = performance.now();
for (let r = 0; r < 300; r++) sim.physics.step();
console.log('physics', ((performance.now() - t0) / 300 * 1000).toFixed(0), 'us');
let act = 0; for (let k = 0; k < sim.world.active.length; k++) act += sim.world.active[k]!;
console.log('active chunks', act, 'of', sim.world.active.length);
