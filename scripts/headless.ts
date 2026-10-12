/**
 * Runs the colony without rendering and prints how it grows.
 * npm run headless -- [seed] [minutes] [speedLabel]
 */
declare const process: { argv: string[] };
import { Sim } from '../src/sim/sim';
import { TICK_HZ } from '../src/config';
import { Task, TASK_LABEL } from '../src/sim/types';

const seed = Number(process.argv[2] ?? 7);
const minutes = Number(process.argv[3] ?? 30);
const sim = new Sim(seed);
sim.found(320);
const t0 = performance.now();
const total = minutes * 60 * TICK_HZ;
let lastReport = 0;
for (let t = 0; t < total; t++) {
  sim.step();
  if (sim.tick - lastReport >= TICK_HZ * 60 || t === total - 1) {
    lastReport = sim.tick;
    const c = sim.colony;
    const [e, l, p] = c.broodCounts();
    const tasks = [Task.Dig, Task.Forage, Task.Nurse, Task.Clean, Task.Idle]
      .map((k) => `${TASK_LABEL[k].slice(0, 4)}:${c.ants.filter((a) => a.task === k).length}`)
      .join(' ');
    const ch = sim.nest.chambers.map((x) => `${x.kind[0]}${x.ready ? '' : '*'}`).join('');
    console.log(
      `min ${(sim.tick / TICK_HZ / 60).toFixed(0).padStart(3)} | ${sim.phase.padEnd(8)} | ants ${String(c.adults).padStart(4)} (maj ${c.majors}) | brood e${e} l${l} p${p} hungry ${c.hungryLarvae} | food ${c.stored} deliv ${c.delivered} eaten ${c.eaten} | nest open ${sim.nest.openCells} pend ${sim.nest.pendingCells} fr ${sim.nest.frontier.length} | ${tasks} | ${ch} | deaths ${JSON.stringify(c.deaths)}`,
    );
  }
}
const ms = performance.now() - t0;
console.log(`${total} ticks in ${(ms / 1000).toFixed(1)}s = ${((ms / total) * 1000).toFixed(0)}us/tick`);
