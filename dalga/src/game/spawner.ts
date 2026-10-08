import { clamp } from '../core/math';
import { rand, randInt, Rng } from '../core/rng';
import { bountyFor, enemyLoadout, loadoutLevel } from '../data/balance';
import { SHIP_BY_ID } from '../data/ships';
import { BOSSES, islandSdf, islandsNear, WORLD, zoneAt, type Faction } from '../data/world';
import { makeAi, type AiRole } from '../sim/ai';
import { Boat } from '../sim/boat';
import type { Sim } from '../sim/world';

export interface Mystery {
  id: number;
  x: number;
  z: number;
  /** 0 = treasure wreck, 1 = ambush, 2 = gem cache */
  kind: number;
}

const rng = new Rng(Date.now() & 0xffffff);
let mysteryId = 1;

function waterClear(x: number, z: number, margin: number): boolean {
  if (Math.hypot(x, z) > WORLD.radius - 120) return false;
  for (const isl of islandsNear(x, z)) if (islandSdf(isl, x, z) < margin) return false;
  return true;
}

export function spawnBoat(sim: Sim, x: number, z: number, level: number, faction: Faction, role: AiRole, shipId?: string, hpMul = 1): Boat {
  const lo = enemyLoadout(level, faction, rng, shipId, hpMul);
  const b = new Boat(SHIP_BY_ID[lo.shipId], faction, lo.upgrades, lo.guns, hpMul);
  b.x = x;
  b.z = z;
  b.yaw = rand(-Math.PI, Math.PI);
  b.input.heading = b.yaw;
  b.level = loadoutLevel(lo);
  b.cargo = bountyFor(b.level, faction) * (role === 'boss' ? 1 : rand(0.8, 1.2));
  b.ai = makeAi(b, role);
  sim.add(b);
  return b;
}

export class Spawner {
  mysteries: Mystery[] = [];
  /** Boss id → time (sim seconds) when it may respawn. */
  bossReady: Record<string, number> = {};
  private timer = 0;

  constructor(private sim: Sim, private playerLevel: () => number) {}

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const sim = this.sim;
    const p = sim.player;
    if (!p) return;

    // Despawn far, idle boats.
    for (const b of [...sim.boats]) {
      if (b === p || b.bossId) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d > 950 || (b.dead && d > 400)) sim.remove(b);
    }

    const zone = zoneAt(p.x, p.z);
    let count = 0;
    for (const b of sim.boats) if (b !== p && !b.dead && !b.bossId && Math.hypot(b.x - p.x, b.z - p.z) < 750) count++;
    if (count < zone.population) this.spawnAround(p.x, p.z);

    this.updateBosses(p.x, p.z);
    this.updateMysteries(p.x, p.z);
  }

  private spawnAround(px: number, pz: number) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(300, 600);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (!waterClear(x, z, 30) || this.sim.inSafeWaters(x, z) || Math.hypot(x, z) < 200) continue;
      const zone = zoneAt(x, z);
      let roll = Math.random();
      let faction: Faction = zone.factions[0][0];
      for (const [f, w] of zone.factions) {
        if (roll < w) { faction = f; break; }
        roll -= w;
      }
      const pl = this.playerLevel();
      const near = clamp(pl + randInt(-5, 1), zone.levelMin, zone.levelMax);
      const level = Math.random() < 0.65 ? near : randInt(zone.levelMin, zone.levelMax);
      if (faction === 'navy' && Math.random() < 0.5) {
        // A patrol of two or three.
        const n = randInt(2, 3);
        for (let i = 0; i < n; i++) {
          const b = spawnBoat(this.sim, x + i * 30, z + i * 18, Math.max(1, level - 1), 'navy', 'patrol');
          b.yaw = a + Math.PI;
        }
      } else {
        const role: AiRole = faction === 'merchant' ? 'merchant' : faction === 'navy' ? 'patrol' : 'hunter';
        spawnBoat(this.sim, x, z, level, faction, role);
      }
      return;
    }
  }

  private updateBosses(px: number, pz: number) {
    const sim = this.sim;
    for (const def of BOSSES) {
      const alive = sim.boats.some((b) => b.bossId === def.id && !b.dead);
      const d = Math.hypot(def.x - px, def.z - pz);
      if (alive) {
        // Park the boss if the player wanders far off.
        if (d > 1200) for (const b of [...sim.boats]) if (b.bossId === def.id) sim.remove(b);
        continue;
      }
      if (d < 700 && d > 250 && (this.bossReady[def.id] ?? 0) <= sim.t) {
        const b = spawnBoat(sim, def.x, def.z, def.level, def.faction, 'boss', def.ship, 2.2);
        b.bossId = def.id;
        b.name = def.name;
        b.cargo = def.bounty;
        // Escorts.
        for (let i = 0; i < 1 + def.zone; i++) {
          const a = (i / (1 + def.zone)) * Math.PI * 2;
          spawnBoat(sim, def.x + Math.cos(a) * 60, def.z + Math.sin(a) * 60, Math.max(1, def.level - 5), def.faction, 'patrol');
        }
      }
    }
  }

  onBossKilled(id: string) {
    this.bossReady[id] = this.sim.t + 240;
  }

  private updateMysteries(px: number, pz: number) {
    this.mysteries = this.mysteries.filter((m) => Math.hypot(m.x - px, m.z - pz) < 1000);
    while (this.mysteries.length < 3) {
      let placed = false;
      for (let tries = 0; tries < 10 && !placed; tries++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(220, 520);
        const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        if (!waterClear(x, z, 20) || this.sim.inSafeWaters(x, z)) continue;
        const roll = Math.random();
        this.mysteries.push({ id: mysteryId++, x, z, kind: roll < 0.62 ? 0 : roll < 0.85 ? 1 : 2 });
        placed = true;
      }
      if (!placed) break;
    }
  }

  /** Called by the game when the player reaches a mystery. Returns a toast message. */
  trigger(m: Mystery): string {
    this.mysteries = this.mysteries.filter((x) => x !== m);
    const sim = this.sim;
    const zone = zoneAt(m.x, m.z);
    const scale = Math.pow(1.22, (zone.levelMin + zone.levelMax) / 2);
    if (m.kind === 1) {
      const lvl = clamp(this.playerLevel() + randInt(-1, 1), zone.levelMin, zone.levelMax);
      for (let i = 0; i < 2; i++) {
        const a = rand(0, Math.PI * 2);
        spawnBoat(sim, m.x + Math.cos(a) * 110, m.z + Math.sin(a) * 110, lvl, zone.id >= 3 ? 'ghost' : 'pirate', 'hunter');
      }
      sim.spill(m.x, m.z, Math.round(60 * scale), 6);
      return 'Pusu! Korsanlar enkazın başında bekliyordu.';
    }
    if (m.kind === 2) {
      sim.dropLoot(m.x, m.z, 'gem', randInt(2, 4) + zone.id * 2, 4);
      sim.spill(m.x, m.z, Math.round(25 * scale), 4);
      return 'Mücevher sandığı buldun!';
    }
    sim.spill(m.x, m.z, Math.round(90 * scale), 8);
    if (Math.random() < 0.3) {
      const kinds = ['top', 'uzun', 'karronat', 'zincir'] as const;
      sim.dropLoot(m.x, m.z, 'crate', 1, 4, { kind: kinds[randInt(0, 3)], level: clamp(1 + zone.id * 2 + randInt(0, 1), 1, 10) });
    }
    return 'Batık hazine! Altınları topla.';
  }
}
