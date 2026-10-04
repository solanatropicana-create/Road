import { Match } from '../src/game/match';
import { DT } from '../src/sim/world';
const pairs: [string, string][] = [['serce', 'kaplumbaga'], ['serce', 'serce'], ['kaplumbaga', 'ari'], ['serce', 'ari']];
const found: string[] = [];
for (const pair of pairs) {
  for (let seed = 1; seed < 120; seed++) {
    const m = new Match({ mode: 'watch', seed, ships: pair });
    let ex = 0, splits = 0, firstEx = -1;
    while (!m.over && m.elapsed < 60) {
      m.step(DT);
      for (const e of m.world.events) {
        if (e.t === 'explode') { ex++; if (firstEx < 0) firstEx = m.elapsed; }
        if (e.t === 'split') splits++;
      }
      m.world.events.length = 0;
    }
    if (m.over && ex >= 1 && splits >= 3 && m.elapsed > 12 && m.elapsed < 32) found.push(`${pair.join('-')} seed=${seed} t=${m.elapsed.toFixed(1)} ex=${ex}@${firstEx.toFixed(1)} splits=${splits} winner=${m.winner} ${m.reason}`);
    m.destroy();
  }
}
console.log(found.slice(0, 30).join('\n'));
