/* Headless checks: per-ship handling numbers, then an AI free-for-all looking for NaNs and stuck hulls. */
declare const process: { exit(code: number): never };
import { enemyLoadout, loadoutLevel } from '../src/data/balance';
import { Rng } from '../src/core/rng';
import { SHIPS } from '../src/data/ships';
import { islandSdf, islandsNear, WORLD } from '../src/data/world';
import { Boat } from '../src/sim/boat';
import { spawnBoat } from '../src/game/spawner';
import { Sim } from '../src/sim/world';

const DT = 1 / 60;
let failures = 0;
const fail = (m: string) => { failures++; console.log('  FAIL', m); };

console.log(`world: ${WORLD.islands.length} islands, ${WORLD.ports.length} ports`);

console.log('\nhandling (open water, wind astern-ish):');
for (const def of SHIPS) {
  const sim = new Sim();
  sim.wind = { angle: 0.9, strength: 1 };
  const b = new Boat(def, 'player', { hp: 0, speed: 0, hold: 0 }, def.slots.map(() => ({ kind: 'top' as const, level: 1 })));
  b.x = 1000; b.z = -2200; // empty water far from islands
  b.yaw = 0;
  sim.add(b);
  b.input = { heading: 0, throttle: 1 };
  let t60 = 0;
  for (let i = 0; i < 60 * 20; i++) {
    sim.step(DT);
    if (!t60 && b.speed > def.speed * 0.9) t60 = i * DT;
  }
  const top = b.speed;
  // 180° turn time
  b.input.heading = Math.PI;
  let turnT = 0;
  for (let i = 0; i < 60 * 30; i++) {
    sim.step(DT);
    if (Math.abs(Math.abs(b.yaw) - Math.PI) < 0.05) { turnT = i * DT; break; }
  }
  console.log(`  ${def.name.padEnd(13)} top ${top.toFixed(1)} m/s  0→90% ${t60.toFixed(1)}s  180° ${turnT.toFixed(1)}s  roll ${b.roll.toFixed(2)}`);
  if (!Number.isFinite(top) || top < def.speed * 0.6) fail(`${def.id} too slow`);
  if (!turnT) fail(`${def.id} could not turn around`);
}

console.log('\nlevel calibration:');
const rng = new Rng(7);
for (const lvl of [1, 3, 6, 10, 15, 20, 25, 30]) {
  const l = enemyLoadout(lvl, 'pirate', rng);
  console.log(`  target ${String(lvl).padStart(2)} → ${l.shipId.padEnd(10)} guns L${l.guns.find(Boolean)?.level} up ${l.upgrades.hp} = level ${loadoutLevel(l)}`);
}

console.log('\nAI brawl (180 s):');
const sim = new Sim();
const factions = ['pirate', 'navy', 'merchant', 'ghost'] as const;
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2;
  const f = factions[i % 4];
  spawnBoat(sim, 600 + Math.cos(a) * 150, 600 + Math.sin(a) * 150, 3 + (i % 10), f, f === 'merchant' ? 'merchant' : 'hunter');
}
let shotsFired = 0, hits = 0, sinks = 0, grounds = 0, rams = 0;
for (let i = 0; i < 60 * 180; i++) {
  sim.step(DT);
  for (const e of sim.events) {
    if (e.type === 'fire') shotsFired++;
    else if (e.type === 'hit') hits++;
    else if (e.type === 'sink') sinks++;
    else if (e.type === 'ground') grounds++;
    else if (e.type === 'ram') rams++;
  }
  sim.events.length = 0;
  for (const b of sim.boats) {
    if (![b.x, b.z, b.vx, b.vz, b.yaw, b.roll, b.pitch, b.heave, b.hp].every(Number.isFinite)) {
      fail(`NaN on boat ${b.id} at t=${sim.t.toFixed(2)}`);
      process.exit(1);
    }
  }
}
let inLand = 0;
for (const b of sim.boats) {
  if (b.dead) continue;
  for (const isl of islandsNear(b.x, b.z)) if (islandSdf(isl, b.x, b.z) < -1) inLand++;
}
console.log(`  fired ${shotsFired}, hits ${hits} (${((hits / Math.max(1, shotsFired)) * 100).toFixed(0)}%), sunk ${sinks}, rams ${rams}, groundings ${grounds}, alive ${sim.boats.filter((b) => !b.dead).length}, loot ${sim.loot.length}`);
if (inLand) fail(`${inLand} boats inside islands`);
if (shotsFired === 0) fail('nobody fired');
if (sinks === 0) fail('nobody sank in 3 minutes');

console.log(failures ? `\n${failures} failure(s)` : '\nok');
process.exit(failures ? 1 : 0);
