/**
 * Headless sanity run: AI vs AI rounds, checks for crashes/NaN and reports
 * round lengths. Run: npm run sim-test
 */
import { Match } from '../src/game/match';
import { BLUEPRINTS } from '../src/sim/blueprints';
import { DT } from '../src/sim/world';
import { solvePower } from '../src/sim/power';

const ids = BLUEPRINTS.map((b) => b.id);
const rounds = Number(process.argv[2] ?? 9);

// Blueprint power check
for (const bp of BLUEPRINTS) {
  const m = new Match({ mode: 'watch', seed: 1, ships: [bp.id, bp.id] });
  const s = m.combatants[0];
  solvePower(s);
  const dark = [...s.tiles.values()].filter((t) => t.def.power < 0 && !t.powered).map((t) => `${t.def.kind}@${t.x},${t.y}`);
  console.log(`${bp.name}: tiles=${s.tiles.size} mass=${s.body.getMass().toFixed(1)} I=${s.body.getInertia().toFixed(0)} supply=${s.powerSupply} demand=${s.powerDemand} unpowered=[${dark.join(' ')}]`);
  m.destroy();
}

const wins: Record<string, number> = {};
let t0 = Date.now();
for (let r = 0; r < rounds; r++) {
  const a = ids[r % ids.length]!;
  const b = ids[Math.floor(r / ids.length) % ids.length]!;
  const m = new Match({ mode: 'watch', seed: 100 + r, ships: [a, b] });
  let steps = 0;
  let maxShips = 0;
  let shots = 0;
  let breaks = 0;
  const kinds: Record<string, number> = {};
  while (!m.over && steps < 60 * 300) {
    m.step(DT);
    steps++;
    for (const e of m.world.events) {
      if (e.t === 'shot') shots++;
      if (e.t === 'break') {
        breaks++;
        kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
      }
      if (e.t === 'explode') kinds.EXPLODE = (kinds.EXPLODE ?? 0) + 1;
      if (e.t === 'beam' && e.hit) kinds.beamTicks = (kinds.beamTicks ?? 0) + 1;
    }
    m.world.events.length = 0;
    maxShips = Math.max(maxShips, m.world.ships.length);
    for (const s of m.world.ships) {
      const p = s.body.getPosition();
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`NaN position on ${s.name} at step ${steps}`);
    }
  }
  const w = m.winner === null ? 'none' : m.winner < 0 ? 'draw' : m.combatants[m.winner].name;
  wins[w] = (wins[w] ?? 0) + 1;
  const [s0, s1] = m.combatants;
  console.log(
    `round ${r}: ${a} vs ${b} → ${w} in ${(steps * DT).toFixed(1)}s  shots=${shots} breaks=${breaks} bodies(max)=${maxShips} ` +
      `struct=${(s0.structure * 100).toFixed(0)}%/${(s1.structure * 100).toFixed(0)}%`,
  );
  const loser = m.winner === 0 ? s1 : m.winner === 1 ? s0 : null;
  if (loser) console.log(`   loser: bridge=${loser.count('bridge')} reactor=${loser.count('reactor')} supply=${loser.powerSupply} ctrl=${loser.controllable}  breaks=${JSON.stringify(kinds)}`);
  m.destroy();
}
console.log('wins', wins, `wall=${((Date.now() - t0) / 1000).toFixed(1)}s`);
