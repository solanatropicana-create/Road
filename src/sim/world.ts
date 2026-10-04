import * as planck from 'planck';
import { Rng } from '../core/rng';
import { headingOf, wrapAngle } from '../core/math';
import { DIR_VEC, WEAPONS } from './defs';
import { Ship, key, type FixtureData, type Tile } from './ship';
import { solvePower } from './power';
import { applyFlight } from './flight';
import type { Blueprint } from './blueprints';

export const DT = 1 / 60;
export const ARENA_RADIUS = 170;

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  life: number;
  owner: number;
}

/** Things that happened this tick, for the renderer/audio. Pure data. */
export type SimEvent =
  | { t: 'shot'; x: number; y: number; dx: number; dy: number; ship: number }
  | { t: 'hit'; x: number; y: number; nx: number; ny: number; energy: number; ship: number }
  | {
      t: 'break';
      x: number;
      y: number;
      vx: number;
      vy: number;
      kind: string;
      team: number;
      ship: number;
    }
  | { t: 'explode'; x: number; y: number; energy: number }
  | { t: 'beam'; x1: number; y1: number; x2: number; y2: number; hit: boolean; ship: number }
  | { t: 'impact'; x: number; y: number; energy: number }
  | { t: 'split'; ship: number; pieces: number }
  | { t: 'disabled'; ship: number; team: number };

interface PendingExplosion {
  x: number;
  y: number;
  energy: number;
}

interface CollisionHit {
  a: FixtureData;
  b: FixtureData;
  impulse: number;
  x: number;
  y: number;
}

export class World {
  pw: planck.World;
  ships: Ship[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  rng: Rng;
  tick = 0;
  time = 0;
  private explosions: PendingExplosion[] = [];
  private collisions: CollisionHit[] = [];

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.pw = new planck.World({ gravity: planck.Vec2(0, 0) });
    this.pw.on('post-solve', (contact, impulse) => {
      const ni = impulse.normalImpulses;
      const total = (ni[0] ?? 0) + (ni[1] ?? 0);
      if (total < 12) return;
      const fa = contact.getFixtureA().getUserData() as FixtureData | null;
      const fb = contact.getFixtureB().getUserData() as FixtureData | null;
      if (!fa || !fb) return;
      const wm = contact.getWorldManifold(null);
      const p = wm?.points[0];
      this.collisions.push({ a: fa, b: fb, impulse: total, x: p?.x ?? 0, y: p?.y ?? 0 });
    });
  }

  spawn(bp: Blueprint, team: number, x: number, y: number, angle: number): Ship {
    const s = Ship.fromBlueprint(this.pw, bp, team, { x, y }, angle);
    this.ships.push(s);
    solvePower(s);
    return s;
  }

  shipById(id: number): Ship | undefined {
    return this.ships.find((s) => s.id === id);
  }

  step(): void {
    const dt = DT;
    this.tick++;
    this.time += dt;

    for (const s of this.ships) {
      if (s.powerDirty) solvePower(s);
      applyFlight(s, dt);
      this.updateWeapons(s, dt);
    }
    this.applyBounds();

    this.collisions.length = 0;
    this.pw.step(dt, 8, 3);

    this.resolveCollisions();
    this.updateProjectiles(dt);
    this.resolveExplosions();
    this.resolveStructure();

    for (const s of this.ships) {
      for (const t of s.tiles.values()) if (t.heat > 0) t.heat = Math.max(0, t.heat - dt * 0.6);
      if (s.isDebris) s.age += dt;
    }
    this.cleanupDebris();
  }

  // ---------------------------------------------------------------- weapons

  private updateWeapons(s: Ship, dt: number): void {
    const inp = s.input;
    const ang = s.body.getAngle();
    for (const t of s.tiles.values()) {
      const k = t.def.kind;
      if (k !== 'cannon' && k !== 'laser') continue;
      t.firing = false;
      if (t.cooldown > 0) t.cooldown -= dt;
      if (!t.powered || !s.controllable) continue;

      const wp = s.tileWorld(t);
      const aim = k === 'laser' && inp.aimLaser ? inp.aimLaser : inp.aim;
      const want = wrapAngle(headingOf({ x: aim.x - wp.x, y: aim.y - wp.y }) - ang);
      const rate = (k === 'cannon' ? WEAPONS.cannon.turnRate : WEAPONS.laser.turnRate) * dt;
      const diff = wrapAngle(want - t.turret);
      t.turret = wrapAngle(t.turret + Math.max(-rate, Math.min(rate, diff)));
      t.blocked = this.lineBlocked(s, t, t.turret);
      const onTarget = Math.abs(diff) < 0.12;

      if (k === 'cannon' && inp.fireCannon && !t.blocked && onTarget && t.cooldown <= 0) {
        t.cooldown = WEAPONS.cannon.interval;
        this.fireCannon(s, t, wp, ang);
      } else if (k === 'laser' && inp.fireLaser && !t.blocked && onTarget) {
        t.firing = true;
        this.fireLaser(s, t, wp, ang, dt);
      }
    }
  }

  /** Fire-control interlock: refuse to shoot through our own tiles. */
  private lineBlocked(s: Ship, t: Tile, turret: number): boolean {
    const dx = Math.sin(turret);
    const dy = -Math.cos(turret);
    const span = Math.max(s.bounds.maxX - s.bounds.minX, s.bounds.maxY - s.bounds.minY) + 2;
    for (let d = 0.7; d < span; d += 0.35) {
      const n = s.tileAt(Math.round(t.x + dx * d), Math.round(t.y + dy * d));
      if (n && n !== t) return true;
    }
    return false;
  }

  private fireCannon(s: Ship, t: Tile, wp: planck.Vec2, shipAng: number): void {
    const W = WEAPONS.cannon;
    const a = shipAng + t.turret + this.rng.range(-W.spread, W.spread);
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const muzzle = planck.Vec2(wp.x + dx * 0.8, wp.y + dy * 0.8);
    const sv = s.body.getLinearVelocityFromWorldPoint(muzzle);
    this.projectiles.push({
      x: muzzle.x,
      y: muzzle.y,
      vx: sv.x + dx * W.muzzle,
      vy: sv.y + dy * W.muzzle,
      mass: W.shellMass,
      life: W.life,
      owner: s.id,
    });
    // Recoil: equal and opposite momentum.
    const p = W.shellMass * W.muzzle;
    s.body.applyLinearImpulse(planck.Vec2(-dx * p, -dy * p), wp, true);
    this.events.push({ t: 'shot', x: muzzle.x, y: muzzle.y, dx, dy, ship: s.id });
  }

  private fireLaser(s: Ship, t: Tile, wp: planck.Vec2, shipAng: number, dt: number): void {
    const W = WEAPONS.laser;
    const a = shipAng + t.turret;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const p1 = planck.Vec2(wp.x + dx * 0.6, wp.y + dy * 0.6);
    const p2 = planck.Vec2(p1.x + dx * W.range, p1.y + dy * W.range);
    const hit = this.rayFirst(p1, p2);
    if (hit) {
      this.damageAlongRay(hit.data.ship, hit.point, { x: dx, y: dy }, W.dps * dt, true);
      hit.data.tile.heat = Math.min(1, hit.data.tile.heat + dt * 2.5);
      this.events.push({ t: 'beam', x1: p1.x, y1: p1.y, x2: hit.point.x, y2: hit.point.y, hit: true, ship: s.id });
    } else {
      this.events.push({ t: 'beam', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, hit: false, ship: s.id });
    }
  }

  private rayFirst(p1: planck.Vec2, p2: planck.Vec2): { data: FixtureData; point: planck.Vec2; normal: planck.Vec2; fraction: number } | null {
    let best: { data: FixtureData; point: planck.Vec2; normal: planck.Vec2; fraction: number } | null = null;
    this.pw.rayCast(p1, p2, (fixture, point, normal, fraction) => {
      const data = fixture.getUserData() as FixtureData | null;
      if (!data) return -1;
      best = { data, point: planck.Vec2(point.x, point.y), normal: planck.Vec2(normal.x, normal.y), fraction };
      return fraction;
    });
    return best;
  }

  private updateProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const p1 = planck.Vec2(p.x, p.y);
      const p2 = planck.Vec2(p.x + p.vx * dt, p.y + p.vy * dt);
      const hit = this.rayFirst(p1, p2);
      if (!hit) {
        p.x = p2.x;
        p.y = p2.y;
        keep.push(p);
        continue;
      }
      const target = hit.data.ship;
      const tv = target.body.getLinearVelocityFromWorldPoint(hit.point);
      const rvx = p.vx - tv.x;
      const rvy = p.vy - tv.y;
      const rv2 = rvx * rvx + rvy * rvy;
      const rv = Math.sqrt(rv2);
      const E = 0.5 * p.mass * rv2;
      const left = this.damageAlongRay(target, hit.point, { x: rvx / rv, y: rvy / rv }, E, false);
      // Momentum transferred in proportion to the energy absorbed.
      const absorbed = E > 0 ? 1 - left / E : 1;
      const transfer = absorbed * p.mass;
      target.body.applyLinearImpulse(planck.Vec2(rvx * transfer, rvy * transfer), hit.point, true);
      this.events.push({ t: 'hit', x: hit.point.x, y: hit.point.y, nx: hit.normal.x, ny: hit.normal.y, energy: E, ship: target.id });
    }
    this.projectiles = keep;
  }

  // ----------------------------------------------------------------- damage

  /**
   * Walk the ray through the ship's tile grid (Amanatides–Woo DDA), spending
   * energy on each tile it meets. Returns energy left after exiting.
   */
  damageAlongRay(ship: Ship, worldPoint: planck.Vec2Value, worldDir: { x: number; y: number }, energy: number, thermal: boolean): number {
    const lp = ship.body.getLocalPoint(planck.Vec2(worldPoint.x, worldPoint.y));
    const ld = ship.body.getLocalVector(planck.Vec2(worldDir.x, worldDir.y));
    let px = lp.x - ld.x * 0.05;
    let py = lp.y - ld.y * 0.05;
    let cx = Math.round(px);
    let cy = Math.round(py);
    const stepX = ld.x > 0 ? 1 : -1;
    const stepY = ld.y > 0 ? 1 : -1;
    const tDeltaX = ld.x !== 0 ? Math.abs(1 / ld.x) : Infinity;
    const tDeltaY = ld.y !== 0 ? Math.abs(1 / ld.y) : Infinity;
    let tMaxX = ld.x !== 0 ? (cx + 0.5 * stepX - px) / ld.x : Infinity;
    let tMaxY = ld.y !== 0 ? (cy + 0.5 * stepY - py) / ld.y : Infinity;
    const b = ship.bounds;
    let E = energy;
    for (let i = 0; i < 64 && E > 0; i++) {
      const t = ship.tileAt(cx, cy);
      if (t) {
        const mul = thermal ? (t.def.thermalMul ?? 1) : 1;
        if (E * mul >= t.hp) {
          E -= t.hp / mul;
          this.destroyTile(ship, t);
        } else {
          t.hp -= E * mul;
          t.heat = Math.min(1, t.heat + (thermal ? 0.02 : E / t.def.hp));
          E = 0;
          ship.visualVersion++;
          break;
        }
      }
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tMaxY += tDeltaY;
        cy += stepY;
      }
      if (cx < b.minX - 1 || cx > b.maxX + 1 || cy < b.minY - 1 || cy > b.maxY + 1) break;
    }
    return E;
  }

  /** Spread a damage amount to a single tile (collisions, blasts). */
  damageTile(ship: Ship, t: Tile, energy: number): void {
    if (!ship.tiles.has(key(t.x, t.y))) return;
    if (energy >= t.hp) this.destroyTile(ship, t);
    else {
      t.hp -= energy;
      t.heat = Math.min(1, t.heat + energy / t.def.hp);
      ship.visualVersion++;
    }
  }

  destroyTile(ship: Ship, t: Tile): void {
    const wp = ship.tileWorld(t);
    const v = ship.body.getLinearVelocityFromWorldPoint(wp);
    ship.removeTile(t);
    this.events.push({ t: 'break', x: wp.x, y: wp.y, vx: v.x, vy: v.y, kind: t.def.kind, team: ship.origin, ship: ship.id });
    if (t.def.explosive) this.explosions.push({ x: wp.x, y: wp.y, energy: t.def.explosive });
  }

  private resolveCollisions(): void {
    for (const c of this.collisions) {
      if (c.a.ship === c.b.ship) continue;
      const ma = c.a.ship.body.getMass();
      const mb = c.b.ship.body.getMass();
      const mr = (ma * mb) / (ma + mb);
      // Energy dissipated by an impulse J on reduced mass: J² / 2m.
      const E = ((c.impulse * c.impulse) / (2 * mr)) * 1.6;
      if (E < 40) continue;
      this.damageTile(c.a.ship, c.a.tile, E * 0.5);
      this.damageTile(c.b.ship, c.b.tile, E * 0.5);
      this.events.push({ t: 'impact', x: c.x, y: c.y, energy: E });
    }
  }

  private resolveExplosions(): void {
    let guard = 0;
    while (this.explosions.length && guard++ < 16) {
      const ex = this.explosions.shift()!;
      this.events.push({ t: 'explode', x: ex.x, y: ex.y, energy: ex.energy });
      const R = 3 + Math.sqrt(ex.energy) * 0.09;
      for (const s of [...this.ships]) {
        const c = s.body.getWorldCenter();
        if (Math.hypot(c.x - ex.x, c.y - ex.y) > R + 20) continue;
        for (const t of [...s.tiles.values()]) {
          const wp = s.tileWorld(t);
          const dx = wp.x - ex.x;
          const dy = wp.y - ex.y;
          const d = Math.hypot(dx, dy);
          if (d > R) continue;
          const f = 1 - d / R;
          const e = ex.energy * f * f * 0.9;
          const imp = ex.energy * 0.012 * f;
          const inv = d > 1e-3 ? 1 / d : 0;
          s.body.applyLinearImpulse(planck.Vec2(dx * inv * imp, dy * inv * imp), wp, true);
          this.damageTile(s, t, e);
        }
      }
    }
    this.explosions.length = 0;
  }

  // -------------------------------------------------------------- structure

  private resolveStructure(): void {
    const created: Ship[] = [];
    for (const s of this.ships) {
      if (!s.structureDirty) continue;
      s.structureDirty = false;
      if (s.tiles.size === 0) continue;
      const islands = this.islands(s);
      if (islands.length > 1) {
        const hasBridge = (isl: Tile[]) => isl.some((t) => t.def.kind === 'bridge');
        islands.sort((a, b) => Number(hasBridge(b)) - Number(hasBridge(a)) || b.length - a.length);
        const pos = s.body.getPosition();
        const ang = s.body.getAngle();
        const w = s.body.getAngularVelocity();
        for (let i = 1; i < islands.length; i++) {
          const isl = islands[i]!;
          // Velocity of the island's centre of mass before the split.
          let mx = 0,
            my = 0,
            mt = 0;
          for (const t of isl) {
            mx += t.x * t.def.mass;
            my += t.y * t.def.mass;
            mt += t.def.mass;
          }
          const cw = s.body.getWorldPoint(planck.Vec2(mx / mt, my / mt));
          const v = s.body.getLinearVelocityFromWorldPoint(cw);
          for (const t of isl) s.removeTile(t);
          const piece = new Ship(this.pw, `${s.name} parçası`, isl.some((t) => t.def.kind === 'bridge') ? s.team : -1, pos, ang);
          piece.blueprintId = s.blueprintId;
          piece.origin = s.origin;
          for (const t of isl) piece.adoptTile(t);
          piece.initialTiles = isl.length;
          piece.body.setLinearVelocity(v);
          piece.body.setAngularVelocity(w);
          piece.recomputeBounds();
          solvePower(piece);
          piece.structureDirty = false;
          created.push(piece);
        }
        this.events.push({ t: 'split', ship: s.id, pieces: islands.length });
      }
      s.recomputeBounds();
      const wasCtrl = s.controllable;
      solvePower(s);
      if (wasCtrl && !s.controllable && s.team >= 0) this.events.push({ t: 'disabled', ship: s.id, team: s.team });
    }
    if (created.length) this.ships.push(...created);
    // Remove empty bodies.
    this.ships = this.ships.filter((s) => {
      if (s.tiles.size > 0) return true;
      this.pw.destroyBody(s.body);
      return false;
    });
  }

  private islands(s: Ship): Tile[][] {
    const seen = new Set<number>();
    const out: Tile[][] = [];
    for (const t of s.tiles.values()) {
      const k0 = key(t.x, t.y);
      if (seen.has(k0)) continue;
      const isl: Tile[] = [];
      const stack = [t];
      seen.add(k0);
      while (stack.length) {
        const c = stack.pop()!;
        isl.push(c);
        for (const d of DIR_VEC) {
          const n = s.tileAt(c.x + d.x, c.y + d.y);
          if (!n) continue;
          const kn = key(n.x, n.y);
          if (seen.has(kn)) continue;
          seen.add(kn);
          stack.push(n);
        }
      }
      out.push(isl);
    }
    return out;
  }

  private applyBounds(): void {
    for (const s of this.ships) {
      const c = s.body.getWorldCenter();
      const d = Math.hypot(c.x, c.y);
      if (d <= ARENA_RADIUS) continue;
      const over = d - ARENA_RADIUS;
      const f = s.body.getMass() * Math.min(40, over * 0.6) * DT;
      s.body.applyLinearImpulse(planck.Vec2((-c.x / d) * f, (-c.y / d) * f), c, true);
    }
  }

  private cleanupDebris(): void {
    const debris = this.ships.filter((s) => s.isDebris);
    const doomed = new Set<Ship>();
    for (const s of debris) {
      if (s.tiles.size <= 3 && s.age > 30) doomed.add(s);
    }
    if (debris.length > 140) {
      const small = debris.filter((s) => !doomed.has(s)).sort((a, b) => a.tiles.size - b.tiles.size || b.age - a.age);
      for (let i = 0; i < debris.length - 140 && i < small.length; i++) doomed.add(small[i]!);
    }
    if (!doomed.size) return;
    this.ships = this.ships.filter((s) => {
      if (!doomed.has(s)) return true;
      this.pw.destroyBody(s.body);
      return false;
    });
  }

  destroy(): void {
    for (const s of this.ships) this.pw.destroyBody(s.body);
    this.ships = [];
    this.projectiles = [];
  }
}
