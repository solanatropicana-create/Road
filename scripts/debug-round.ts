import { Match } from '../src/game/match';
import { DT } from '../src/sim/world';
const [a, b, seed] = [process.argv[2] ?? 'serce', process.argv[3] ?? 'ari', Number(process.argv[4] ?? 106)];
const m = new Match({ mode: 'watch', seed, ships: [a, b] });
let shots = [0, 0];
for (let i = 0; i < 60 * 120 && !m.over; i++) {
  m.step(DT);
  for (const e of m.world.events) if (e.t === 'shot') shots[e.ship === m.combatants[0].id ? 0 : 1]++;
  m.world.events.length = 0;
  if (i % 600 === 0) {
    const [s0, s1] = m.combatants;
    const c0 = s0.body.getWorldCenter(), c1 = s1.body.getWorldCenter();
    const info = (s: typeof s0) => {
      const ts = [...s.tiles.values()].filter((t) => t.def.kind === 'cannon' || t.def.kind === 'laser');
      return `ctrl=${s.controllable} st=${(s.structure*100).toFixed(0)} w=${s.body.getAngularVelocity().toFixed(2)} v=${s.body.getLinearVelocity().length().toFixed(1)} fire=${s.input.fireCannon?1:0}${s.input.fireLaser?1:0} guns=[${ts.map((t) => `${t.def.kind[0]}${t.powered ? '' : '!'}${t.blocked ? 'B' : ''}`).join(' ')}] thr=${s.count('thruster', true)}/${s.count('rcs', true)} gyro=${s.count('gyro', true)}`;
    };
    console.log(`t=${(i * DT).toFixed(0)} d=${Math.hypot(c0.x - c1.x, c0.y - c1.y).toFixed(0)} pos0=${c0.x.toFixed(0)},${c0.y.toFixed(0)} shots=${shots}\n  A ${info(s0)}\n  B ${info(s1)}`);
  }
}
console.log('over', m.over, m.winner, m.elapsed.toFixed(1));
