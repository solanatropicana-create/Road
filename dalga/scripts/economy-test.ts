/* A bot plays the player's ship in a zone for a few minutes: how fast does gold come in, how often does it sink? */
declare const process: { argv: string[]; exit(code: number): never };
import { SHIP_BY_ID } from '../src/data/ships';
import { WORLD } from '../src/data/world';
import { Spawner } from '../src/game/spawner';
import { makeAi } from '../src/sim/ai';
import { Boat } from '../src/sim/boat';
import { Sim } from '../src/sim/world';
import { loadoutLevel } from '../src/data/balance';

const DT = 1 / 60;
const shipId = process.argv[2] ?? 'sandal';
const gunLevel = Number(process.argv[3] ?? 1);
const minutes = Number(process.argv[4] ?? 6);
const def = SHIP_BY_ID[shipId];
const guns = def.slots.map(() => ({ kind: 'top' as const, level: gunLevel }));
const up = { hp: 0, speed: 0, hold: 0 };
const level = loadoutLevel({ shipId, upgrades: up, guns, hpMul: 1 });

const sim = new Sim();
const spawner = new Spawner(sim, () => level);
let banked = 0, deaths = 0, kills = 0, picked = 0;
const dmgBy: Record<string, number> = {};

function spawnPlayer() {
  const port = WORLD.ports[0];
  const b = new Boat(def, 'player', up, guns);
  b.x = port.x + Math.cos(port.angle) * 34;
  b.z = port.z + Math.sin(port.angle) * 34;
  b.yaw = port.angle;
  b.level = level;
  b.ai = makeAi(b, 'hunter');
  b.ai.aggro = 260;
  b.ai.leash = 600;
  sim.add(b);
  sim.player = b;
  return b;
}
let p = spawnPlayer();
for (let i = 0; i < minutes * 60 * 60; i++) {
  // Greedy loot collection when nothing to fight.
  if (p.ai && !p.ai.targetId && sim.loot.length) {
    const l = sim.loot.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
    p.ai.wx = l.x; p.ai.wz = l.z;
  }
  sim.step(DT);
  spawner.update(DT);
  for (const e of sim.events) {
    if (e.type === 'hit' && e.boat === p.id) {
      const o = sim.boatById(e.by);
      const k = o ? `${o.faction}${o.bossId ? '-boss' : ''} L${o.level} ${o.def.id}` : 'land/other';
      dmgBy[k] = (dmgBy[k] ?? 0) + e.dmg;
    }
    if (e.type === 'sink' && e.boat === p.id) { deaths++; const near = sim.boats.filter((b) => !b.dead && b !== p && Math.hypot(b.x - p.x, b.z - p.z) < 120).map((b) => `${b.faction}L${b.level}`); console.log(`  died t=${sim.t.toFixed(0)} at r=${Math.hypot(p.x, p.z).toFixed(0)} near: ${near.join(' ')}`); }
    else if (e.type === 'sink' && e.by === p.id) kills++;
    else if (e.type === 'pickup' && e.kind === 'gold') picked += e.value;
  }
  sim.events.length = 0;
  if (p.dead && p.sinkT > 3) { sim.remove(p); p = spawnPlayer(); }
  // Bank when the hold is 80% full.
  if (p.cargo >= p.hold * 0.8) { banked += p.cargo; p.cargo = 0; }
}
banked += p.cargo;
console.log('  damage taken by source:', Object.entries(dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(', '));
console.log(`${def.name} L${gunLevel} guns (level ${level}), ${minutes} min in ${'Sakin Koy'}:`);
console.log(`  kills ${kills}, deaths ${deaths}, gold picked ${picked}, gold/min ${(picked / minutes).toFixed(0)}, hold ${p.hold}`);
