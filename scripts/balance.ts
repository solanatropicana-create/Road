/** Win-rate matrix over many seeds: npm run -s balance */
import { Match } from '../src/game/match';
import { BLUEPRINTS } from '../src/sim/blueprints';
import { DT } from '../src/sim/world';
const ids = BLUEPRINTS.map((b) => b.id);
const N = Number(process.argv[2] ?? 12);
for (const a of ids) {
  for (const b of ids) {
    if (a >= b && a !== b) continue;
    let wa = 0, wb = 0, draws = 0, t = 0, timeouts = 0;
    for (let s = 0; s < N; s++) {
      // alternate sides so spawn position doesn't bias
      const flip = s % 2 === 1;
      const m = new Match({ mode: 'watch', seed: 1000 + s, ships: flip ? [b, a] : [a, b] });
      while (!m.over) { m.step(DT); m.world.events.length = 0; }
      t += m.elapsed;
      if (m.reason === 'süre doldu') timeouts++;
      const w = m.winner;
      if (w === null || w < 0) draws++;
      else if ((w === 0) !== flip) wa++;
      else wb++;
      m.destroy();
    }
    console.log(`${a.padEnd(11)} vs ${b.padEnd(11)}  ${wa}-${wb} (d${draws})  avg ${(t / N).toFixed(0)}s  timeouts ${timeouts}`);
  }
}
