import { clamp, damp, segSegClosest, smoothstep } from '../core/math';
import { rand, randInt } from '../core/rng';
import type { CannonKind } from '../data/cannons';
import { islandRadiusAt, islandsNear, WORLD, type Faction } from '../data/world';
import { updateAi } from './ai';
import { Boat, Wind } from './boat';
import { waveHeight } from './waves';
import { GRAVITY, updateMounts } from './weapons';

export interface Shot {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  owner: number;
  dmg: number;
  aoe: number;
  slow: number;
  tether: boolean;
  r: number;
  kind: CannonKind;
  age: number;
  alive: boolean;
}

export type LootKind = 'gold' | 'gem' | 'crate';

export interface Loot {
  id: number;
  x: number; z: number;
  vx: number; vz: number;
  kind: LootKind;
  value: number;
  cannon?: { kind: CannonKind; level: number };
  age: number;
  phase: number;
  /** Seconds before it can be collected (lets it fly out of the wreck). */
  delay: number;
}

export interface Mine {
  id: number;
  x: number; z: number;
  vx: number; vz: number;
  owner: number;
  dmg: number;
  age: number;
}

export interface Tether {
  a: Boat;
  b: Boat;
  len: number;
  t: number;
}

export type SimEvent =
  | { type: 'fire'; x: number; y: number; z: number; angle: number; kind: CannonKind; boat: number }
  | { type: 'hit'; x: number; y: number; z: number; dmg: number; boat: number; by: number; crit: boolean }
  | { type: 'splash'; x: number; z: number; big: boolean }
  | { type: 'explode'; x: number; y: number; z: number; r: number }
  | { type: 'sink'; boat: number; by: number; x: number; z: number }
  | { type: 'pickup'; x: number; z: number; kind: LootKind; value: number; cannon?: { kind: CannonKind; level: number } }
  | { type: 'holdFull' }
  | { type: 'ram'; x: number; z: number; power: number; a: number; b: number }
  | { type: 'ground'; x: number; z: number; power: number; boat: number }
  | { type: 'ability'; boat: number }
  | { type: 'tether'; a: number; b: number };

let lootId = 1;

export class Sim {
  t = 0;
  wind: Wind = { angle: 0.6, strength: 1 };
  boats: Boat[] = [];
  shots: Shot[] = [];
  loot: Loot[] = [];
  mines: Mine[] = [];
  tethers: Tether[] = [];
  events: SimEvent[] = [];
  player: Boat | null = null;
  private byId = new Map<number, Boat>();
  private holdFullT = 0;

  emit(e: SimEvent) {
    this.events.push(e);
  }

  add(b: Boat) {
    this.boats.push(b);
    this.byId.set(b.id, b);
    return b;
  }

  remove(b: Boat) {
    const i = this.boats.indexOf(b);
    if (i >= 0) this.boats.splice(i, 1);
    this.byId.delete(b.id);
    this.tethers = this.tethers.filter((t) => t.a !== b && t.b !== b);
  }

  boatById(id: number) {
    return this.byId.get(id) ?? null;
  }

  hostile(a: Boat, b: Boat): boolean {
    return factionsHostile(a.faction, b.faction);
  }

  inSafeWaters(x: number, z: number): boolean {
    for (const p of WORLD.ports) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < 130 * 130) return true;
    }
    return false;
  }

  step(dt: number) {
    this.t += dt;
    this.holdFullT -= dt;
    // Wind veers slowly; the storm belt gusts.
    this.wind.angle += Math.sin(this.t * 0.02) * 0.012 * dt;
    const p = this.player;
    const storm = p ? smoothstep(WORLD.zones[2].r0 - 100, WORLD.zones[2].r0 + 100, Math.hypot(p.x, p.z)) *
      (1 - smoothstep(WORLD.zones[3].r0 - 100, WORLD.zones[3].r0 + 100, Math.hypot(p.x, p.z))) : 0;
    this.wind.strength = 1 + storm * (0.35 + 0.25 * Math.sin(this.t * 0.7));

    for (const b of this.boats) updateAi(this, b, dt);
    for (const b of this.boats) b.step(dt, this.t, this.wind);
    for (const b of this.boats) updateMounts(this, b, dt);
    this.stepTethers(dt);
    this.collideBoats();
    for (const b of this.boats) this.collideLand(b);
    this.stepShots(dt);
    this.stepMines(dt);
    this.stepLoot(dt);

    // Drop sunk hulls once they are under.
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const b = this.boats[i];
      if (b.dead && b.sinkT > 7 && b !== this.player) this.remove(b);
    }
  }

  // ---------------------------------------------------------------- abilities
  useAbility(b: Boat): boolean {
    if (b.dead || b.abilityCd > 0) return false;
    const ab = b.ability;
    b.abilityCd = ab.cooldown;
    b.abilityT = ab.duration;
    switch (ab.id) {
      case 'broadside':
        for (const m of b.mounts) m.reload = Math.random() * 0.25;
        break;
      case 'ram':
        b.vx += b.fwdX * 6;
        b.vz += b.fwdZ * 6;
        break;
      case 'repair':
        b.repairPool += b.maxHp * 0.35;
        break;
      case 'barrels':
        for (let i = 0; i < 3; i++) {
          const [x, z] = b.toWorld(-b.length * 0.55, (i - 1) * b.beam * 0.5);
          this.mines.push({
            id: lootId++, x, z,
            vx: b.vx * 0.3 - b.fwdX * 3 + (i - 1) * -b.fwdZ * 2,
            vz: b.vz * 0.3 - b.fwdZ * 3 + (i - 1) * b.fwdX * 2,
            owner: b.id, dmg: 30 + b.level * 7, age: 0,
          });
        }
        break;
      default:
        break;
    }
    this.emit({ type: 'ability', boat: b.id });
    return true;
  }

  // ---------------------------------------------------------------- damage
  damage(b: Boat, amount: number, by: number, x: number, z: number, y: number) {
    if (b.dead) return;
    let dmg = amount * (1 - b.def.armor);
    if (b.invisible) dmg *= 0.5;
    b.hp -= dmg;
    b.lastHitBy = by;
    b.lastHitT = this.t;
    b.hurtT = 0.25;
    // Water comes in on the side that was holed.
    const [, lz] = b.toLocal(x, z);
    b.list += Math.sign(lz || 1) * clamp(dmg / b.maxHp, 0, 0.2) * 0.25;
    this.emit({ type: 'hit', x, y, z, dmg, boat: b.id, by, crit: dmg > b.maxHp * 0.15 });
    if (b.hp <= 0) this.kill(b, by);
  }

  kill(b: Boat, by: number) {
    if (b.dead) return;
    b.hp = 0;
    b.dead = true;
    b.sinkT = 0;
    b.list = b.list || (Math.random() < 0.5 ? -0.01 : 0.01);
    this.emit({ type: 'sink', boat: b.id, by, x: b.x, z: b.z });
    // Cargo spills as floating barrels.
    if (b.cargo > 0) this.spill(b.x, b.z, b.cargo, b.length);
    b.cargo = 0;
    if (b.bossId) {
      const boss = WORLD.bosses.find((x) => x.id === b.bossId)!;
      this.dropLoot(b.x, b.z, 'gem', boss.gems, b.length);
      this.dropLoot(b.x, b.z, 'crate', 1, b.length, { kind: (['zipkin', 'havan', 'uzun', 'karronat'] as CannonKind[])[randInt(0, 3)], level: Math.min(10, 2 + boss.zone * 2) });
    } else if (b.faction !== 'player' && Math.random() < 0.06 + b.level * 0.004) {
      this.dropLoot(b.x, b.z, 'gem', randInt(1, 2 + Math.floor(b.level / 8)), b.length);
    }
  }

  spill(x: number, z: number, value: number, spread: number) {
    const n = clamp(Math.round(Math.sqrt(value) / 6), 2, 9);
    for (let i = 0; i < n; i++) this.dropLoot(x, z, 'gold', Math.max(1, Math.round(value / n)), spread);
  }

  dropLoot(x: number, z: number, kind: LootKind, value: number, spread: number, cannon?: Loot['cannon']) {
    const a = rand(0, Math.PI * 2);
    const s = rand(2, 4) + spread * 0.25;
    this.loot.push({
      id: lootId++, x: x + Math.cos(a) * 2, z: z + Math.sin(a) * 2,
      vx: Math.cos(a) * s, vz: Math.sin(a) * s, kind, value, cannon,
      age: 0, phase: rand(0, 6.28), delay: 0.6,
    });
  }

  // ---------------------------------------------------------------- shots
  private stepShots(dt: number) {
    const sub = 2;
    const h = dt / sub;
    for (const s of this.shots) {
      for (let k = 0; k < sub && s.alive; k++) {
        s.vy -= GRAVITY * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
        s.z += s.vz * h;
        s.age += h;
        this.shotHits(s);
        if (!s.alive) break;
        const w = waveHeight(s.x, s.z, this.t);
        if (s.y < w) {
          s.alive = false;
          if (s.aoe > 0) this.explode(s, s.x, w, s.z);
          else this.emit({ type: 'splash', x: s.x, z: s.z, big: false });
        }
      }
      if (s.age > 8) s.alive = false;
    }
    this.shots = this.shots.filter((s) => s.alive);
  }

  private shotHits(s: Shot) {
    for (const b of this.boats) {
      if (b.dead || b.id === s.owner) continue;
      const owner = this.byId.get(s.owner);
      if (owner && !this.hostile(owner, b)) continue;
      const dx = s.x - b.x, dz = s.z - b.z;
      const rr = b.length * 0.5 + 1.5;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (s.y > b.heave + b.deck + 1.6 || s.y < b.heave - 1.8) continue;
      const [lx, lz] = b.toLocal(s.x, s.z);
      if (!b.containsLocal(lx, lz, s.r + 0.2)) continue;
      s.alive = false;
      if (s.aoe > 0) {
        this.explode(s, s.x, s.y, s.z, b);
        return;
      }
      this.damage(b, s.dmg, s.owner, s.x, s.z, s.y);
      // Momentum of the ball shoves and heels the hull.
      const j = 0.9 * s.r * s.r * 4;
      b.impulse(s.vx * j, s.vz * j, s.x, s.z);
      if (s.slow > 0) b.slowT = Math.max(b.slowT, s.slow);
      if (s.tether && owner && !owner.dead) {
        this.tethers = this.tethers.filter((t) => !(t.a === owner && t.b === b));
        this.tethers.push({ a: owner, b, len: Math.hypot(b.x - owner.x, b.z - owner.z), t: 4.5 });
        this.emit({ type: 'tether', a: owner.id, b: b.id });
      }
      return;
    }
  }

  private explode(s: Shot, x: number, y: number, z: number, direct?: Boat) {
    this.emit({ type: 'explode', x, y, z, r: s.aoe });
    const owner = this.byId.get(s.owner);
    for (const b of this.boats) {
      if (b.dead || b.id === s.owner) continue;
      if (owner && !this.hostile(owner, b)) continue;
      const d = Math.hypot(b.x - x, b.z - z) - b.length * 0.3;
      if (b !== direct && d > s.aoe) continue;
      const f = b === direct ? 1 : clamp(1 - d / s.aoe, 0.25, 1);
      this.damage(b, s.dmg * f, s.owner, x, z, y);
      const dl = Math.max(1, Math.hypot(b.x - x, b.z - z));
      b.impulse(((b.x - x) / dl) * 6 * f, ((b.z - z) / dl) * 6 * f, x, z, 0.15 * f);
      b.heaveV += 2.5 * f;
    }
  }

  // ---------------------------------------------------------------- tethers
  private stepTethers(dt: number) {
    for (const t of this.tethers) {
      t.t -= dt;
      if (t.a.dead || t.b.dead) { t.t = 0; continue; }
      const dx = t.b.x - t.a.x, dz = t.b.z - t.a.z;
      const d = Math.hypot(dx, dz) || 1;
      t.len = Math.max(t.a.length * 0.5 + t.b.length * 0.5 + 4, t.len - 7 * dt);
      if (d > t.len) {
        const nx = dx / d, nz = dz / d;
        const stretch = d - t.len;
        const rvn = (t.b.vx - t.a.vx) * nx + (t.b.vz - t.a.vz) * nz;
        const f = (stretch * 14 + rvn * 4) * dt;
        const mA = t.a.mass, mB = t.b.mass;
        const total = mA + mB;
        // The lighter ship gets yanked harder.
        t.a.vx += nx * f * (mB / total);
        t.a.vz += nz * f * (mB / total);
        t.b.vx -= nx * f * (mA / total);
        t.b.vz -= nz * f * (mA / total);
        t.b.yawRate += (Math.random() - 0.5) * f * 0.02;
      }
    }
    this.tethers = this.tethers.filter((t) => t.t > 0);
  }

  // ---------------------------------------------------------------- collisions
  private collideBoats() {
    const bs = this.boats;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.dead) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.dead) continue;
        const rr = (a.length + b.length) * 0.5 + 1;
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > rr * rr) continue;
        this.collidePair(a, b);
      }
    }
  }

  private collidePair(a: Boat, b: Boat) {
    // Hulls as capsules along the keel.
    const ha = a.length * 0.5 - a.beam * 0.4, hb = b.length * 0.5 - b.beam * 0.4;
    const ra = a.beam * 0.45, rb = b.beam * 0.45;
    const a1x = a.x + a.fwdX * ha, a1z = a.z + a.fwdZ * ha, a0x = a.x - a.fwdX * ha, a0z = a.z - a.fwdZ * ha;
    const b1x = b.x + b.fwdX * hb, b1z = b.z + b.fwdZ * hb, b0x = b.x - b.fwdX * hb, b0z = b.z - b.fwdZ * hb;
    const [s, t] = segSegClosest(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z);
    const pax = a0x + (a1x - a0x) * s, paz = a0z + (a1z - a0z) * s;
    const pbx = b0x + (b1x - b0x) * t, pbz = b0z + (b1z - b0z) * t;
    let nx = pbx - pax, nz = pbz - paz;
    const d = Math.hypot(nx, nz);
    const pen = ra + rb - d;
    if (pen <= 0) return;
    if (d > 1e-6) { nx /= d; nz /= d; } else { nx = 1; nz = 0; }
    const cx = pax + nx * ra, cz = paz + nz * ra;

    const ma = a.mass, mb = b.mass;
    const inv = 1 / ma + 1 / mb;
    // Positional correction, split by mass.
    a.x -= (nx * pen * (1 / ma)) / inv; a.z -= (nz * pen * (1 / ma)) / inv;
    b.x += (nx * pen * (1 / mb)) / inv; b.z += (nz * pen * (1 / mb)) / inv;

    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vn >= 0) return;
    const e = 0.25;
    const jn = (-(1 + e) * vn) / inv;
    a.impulse(-nx * jn, -nz * jn, cx, cz);
    b.impulse(nx * jn, nz * jn, cx, cz);

    const impact = -vn;
    if (impact > 2.5) {
      this.emit({ type: 'ram', x: cx, z: cz, power: impact, a: a.id, b: b.id });
      if (!this.hostile(a, b)) return;
      const base = 1.6 * Math.pow(impact - 2.5, 1.4);
      // Which hull led with its bow?
      const [alx] = a.toLocal(cx, cz);
      const [blx] = b.toLocal(cx, cz);
      const aRam = alx > a.length * 0.3, bRam = blx > b.length * 0.3;
      const aMul = (aRam ? a.def.ramMul : 1) * (a.def.ability === 'ram' && a.abilityActive ? 1.8 : 1) * (1 + 0.06 * (a.level - 1));
      const bMul = (bRam ? b.def.ramMul : 1) * (b.def.ability === 'ram' && b.abilityActive ? 1.8 : 1) * (1 + 0.06 * (b.level - 1));
      const toA = (base * (mb / (ma + mb)) * bMul) / (aRam ? a.def.ramMul : 1);
      const toB = (base * (ma / (ma + mb)) * aMul) / (bRam ? b.def.ramMul : 1);
      this.damage(a, toA, b.id, cx, cz, a.heave + 1);
      this.damage(b, toB, a.id, cx, cz, b.heave + 1);
    }
  }

  private collideLand(b: Boat) {
    if (b.dead) return;
    // World edge pushes back.
    const r = Math.hypot(b.x, b.z);
    if (r > WORLD.radius) {
      const k = (r - WORLD.radius) * 0.5;
      b.vx -= (b.x / r) * k * 0.1;
      b.vz -= (b.z / r) * k * 0.1;
    }
    const near = islandsNear(b.x, b.z);
    if (!near.length) return;
    const ha = b.length * 0.5 - b.beam * 0.35;
    const rad = b.beam * 0.45;
    for (const f of [-1, 0, 1]) {
      const px = b.x + b.fwdX * ha * f, pz = b.z + b.fwdZ * ha * f;
      for (const isl of near) {
        const dx = px - isl.x, dz = pz - isl.z;
        const dc = Math.hypot(dx, dz);
        if (dc > isl.r * 1.4 + rad) continue;
        const ang = Math.atan2(dz, dx);
        const shore = islandRadiusAt(isl, ang);
        const pen = shore + rad - dc;
        if (pen <= 0) continue;
        // Normal of the polar shoreline r(θ).
        const eps = 0.02;
        const dr = (islandRadiusAt(isl, ang + eps) - islandRadiusAt(isl, ang - eps)) / (2 * eps);
        const rx = dx / dc, rz = dz / dc;
        const tx = -rz, tz = rx;
        let nx = rx * shore - tx * dr, nz = rz * shore - tz * dr;
        const nl = Math.hypot(nx, nz);
        nx /= nl; nz /= nl;
        b.x += nx * pen;
        b.z += nz * pen;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.impulse(-nx * vn * b.mass * 1.2, -nz * vn * b.mass * 1.2, px, pz);
          // Grinding along rock bleeds speed.
          b.vx *= 1 - damp(3, 1 / 60);
          b.vz *= 1 - damp(3, 1 / 60);
          if (-vn > 4) {
            this.emit({ type: 'ground', x: px - nx * rad, z: pz - nz * rad, power: -vn, boat: b.id });
            this.damage(b, Math.pow(-vn - 4, 1.3) * 1.5 * (1 + 0.1 * b.def.tier), 0, px, pz, b.heave);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- mines
  private stepMines(dt: number) {
    for (const m of this.mines) {
      m.age += dt;
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      m.vx *= 1 - damp(0.8, dt);
      m.vz *= 1 - damp(0.8, dt);
      const owner = this.byId.get(m.owner);
      let boom = m.age > 25;
      if (m.age > 0.7) {
        for (const b of this.boats) {
          if (b.dead || b.id === m.owner || (owner && !this.hostile(owner, b))) continue;
          const [lx, lz] = b.toLocal(m.x, m.z);
          if (b.containsLocal(lx, lz, 1.5)) { boom = true; break; }
        }
      }
      if (boom) {
        m.age = -1;
        const s: Shot = { x: m.x, y: 0, z: m.z, vx: 0, vy: 0, vz: 0, owner: m.owner, dmg: m.dmg, aoe: 11, slow: 0, tether: false, r: 0.5, kind: 'havan', age: 0, alive: false };
        this.explode(s, m.x, waveHeight(m.x, m.z, this.t), m.z);
      }
    }
    this.mines = this.mines.filter((m) => m.age >= 0);
  }

  // ---------------------------------------------------------------- loot
  private stepLoot(dt: number) {
    const p = this.player;
    for (const l of this.loot) {
      l.age += dt;
      l.delay -= dt;
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      l.vx *= 1 - damp(1.2, dt);
      l.vz *= 1 - damp(1.2, dt);
      if (!p || p.dead || l.delay > 0) continue;
      const dx = p.x - l.x, dz = p.z - l.z;
      const d = Math.hypot(dx, dz);
      const reach = p.length * 0.5 + 3;
      const full = l.kind === 'gold' && p.cargo >= p.hold;
      if (d < reach + 14 && !full) {
        // Magnet pull toward the hull.
        const pull = 18 * (1 - d / (reach + 14)) + 4;
        l.vx += (dx / d) * pull * dt * 4;
        l.vz += (dz / d) * pull * dt * 4;
      }
      if (d < reach) {
        if (l.kind === 'gold') {
          const room = p.hold - p.cargo;
          if (room <= 0) {
            if (this.holdFullT <= 0) { this.emit({ type: 'holdFull' }); this.holdFullT = 3; }
            continue;
          }
          const take = Math.min(room, l.value);
          p.cargo += take;
          l.value -= take;
          this.emit({ type: 'pickup', x: l.x, z: l.z, kind: 'gold', value: take });
          if (l.value <= 0) l.age = 1e9;
        } else {
          this.emit({ type: 'pickup', x: l.x, z: l.z, kind: l.kind, value: l.value, cannon: l.cannon });
          l.age = 1e9;
        }
      }
    }
    this.loot = this.loot.filter((l) => l.age < 120);
  }
}

export function factionsHostile(a: Faction, b: Faction): boolean {
  if (a === b) return false;
  if (a === 'player' || b === 'player') return true;
  if (a === 'ghost' || b === 'ghost') return true;
  if (a === 'pirate' || b === 'pirate') return true;
  return false;
}
