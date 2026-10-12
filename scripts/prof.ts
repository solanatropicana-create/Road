import { Sim } from '../src/sim/sim';
const sim = new Sim(7);
sim.found(320);
for (let t = 0; t < 30 * 60 * 10; t++) sim.step();
