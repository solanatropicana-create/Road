import { clamp, headingOf, wrapAngle } from '../core/math';
import { Rng } from '../core/rng';
import { WEAPONS } from './defs';
import { FLIGHT } from './flight';
import { ARENA_RADIUS } from './world';
import type { Ship, Tile } from './ship';
import type { World } from './world';

/**
 * AI pilot. It only writes a ShipInput, exactly like the player's keyboard,
 * so it obeys the same physics and the same broken hardware.
 */
export interface AiProfile {
  /** Preferred engagement distance (m). */
  range: number;
  /** Aim error in radians (lower = better gunner). */
  aimError: number;
  /** How often to change strafe direction (s). */
  jink: number;
  /** Preference for shooting critical modules vs centre of mass. */
  surgical: number;
}

export const AI_PROFILES: Record<string, AiProfile> = {
  serce: { range: 40, aimError: 0.07, jink: 1.8, surgical: 0.45 },
  kaplumbaga: { range: 46, aimError: 0.06, jink: 3, surgical: 0.6 },
  ari: { range: 50, aimError: 0.05, jink: 1.5, surgical: 0.7 },
};

const CRITICAL = new Set(['reactor', 'bridge', 'cannon', 'laser', 'gyro', 'thruster']);

export class AiPilot {
  private rng: Rng;
  private strafeDir = 1;
  private jinkTimer = 0;
  private focus: { x: number; y: number } | null = null;
  private focusTimer = 0;
  private wobble = 0;
  private noise = 0;
  private noiseTarget = 0;
  private noiseTimer = 0;

  constructor(
    readonly ship: Ship,
    public target: Ship | null,
    readonly profile: AiProfile,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.strafeDir = this.rng.sign();
  }

  update(world: World, dt: number): void {
    const me = this.ship;
    const inp = me.input;
    inp.fireCannon = false;
    inp.fireLaser = false;
    inp.assist = true;
    const tgt = this.target;
    if (!tgt || !tgt.controllable || tgt.tiles.size === 0 || !world.ships.includes(tgt)) {
      inp.thrust = 0;
      inp.strafe = 0;
      inp.turn = 0;
      return;
    }

    const mc = me.body.getWorldCenter();
    const tc = tgt.body.getWorldCenter();
    const rx = tc.x - mc.x;
    const ry = tc.y - mc.y;
    const dist = Math.hypot(rx, ry) || 1;
    const ux = rx / dist;
    const uy = ry / dist;
    const mv = me.body.getLinearVelocity();
    const tv = tgt.body.getLinearVelocity();
    // Jink sideways to spoil the enemy's lead.
    this.jinkTimer -= dt;
    if (this.jinkTimer <= 0) {
      this.jinkTimer = this.profile.jink * this.rng.range(0.6, 1.4);
      if (this.rng.next() < 0.7) this.strafeDir = -this.strafeDir;
    }

    // Desired velocity in world space: match the target, close/open range,
    // orbit sideways. Flight assist then tracks it with whatever thrusters work.
    const radial = clamp((dist - this.profile.range) * 0.7, -22, 30);
    const orbit = this.strafeDir * (dist < this.profile.range * 1.8 ? 16 : 5);
    // Follow the target's motion only partly: two pilots matching each other
    // exactly would otherwise feed back into an ever-faster chase.
    const tvl = Math.hypot(tv.x, tv.y);
    const tk = tvl > 20 ? 20 / tvl : 1;
    let vdx = tv.x * tk + ux * radial - uy * orbit;
    let vdy = tv.y * tk + uy * radial + ux * orbit;
    // Stay inside the arena.
    const r = Math.hypot(mc.x, mc.y);
    if (r > ARENA_RADIUS * 0.8) {
      const k = (r - ARENA_RADIUS * 0.8) * 0.5;
      vdx -= (mc.x / r) * k;
      vdy -= (mc.y / r) * k;
    }
    const sp = Math.hypot(vdx, vdy);
    if (sp > 42) {
      vdx *= 42 / sp;
      vdy *= 42 / sp;
    }
    const ex = vdx - mv.x;
    const ey = vdy - mv.y;
    const errV = Math.hypot(ex, ey);

    // Face the enemy to fight; if we are badly off our desired velocity
    // (e.g. retro thrusters gone), turn and burn along the error instead.
    this.wobble += dt;
    const burn = errV > 22;
    const face = burn ? headingOf({ x: ex, y: ey }) : headingOf({ x: rx, y: ry }) + Math.sin(this.wobble * 0.7) * 0.3;
    const err = wrapAngle(face - me.body.getAngle());
    inp.turn = clamp(err * 2 - me.body.getAngularVelocity() * 0.5, -1, 1);

    const ang = me.body.getAngle();
    const c = Math.cos(-ang);
    const s = Math.sin(-ang);
    const lx = vdx * c - vdy * s;
    const ly = vdx * s + vdy * c;
    inp.thrust = clamp(ly < 0 ? -ly / FLIGHT.vForward : -ly / FLIGHT.vBack, -1, 1);
    inp.strafe = clamp(lx / FLIGHT.vStrafe, -1, 1);

    // Pick an aim point on the enemy hull.
    this.focusTimer -= dt;
    if (this.focusTimer <= 0 || !this.focus) {
      this.focusTimer = this.rng.range(2, 4);
      this.focus = this.pickFocus(tgt);
    }
    let ax = tc.x;
    let ay = tc.y;
    let pvx = tv.x;
    let pvy = tv.y;
    if (this.focus) {
      const wp = tgt.body.getWorldPoint(this.focus);
      const v = tgt.body.getLinearVelocityFromWorldPoint(wp);
      ax = wp.x;
      ay = wp.y;
      pvx = v.x;
      pvy = v.y;
    }

    // Lead the shot: shells inherit our velocity, so solve in our frame.
    const lead = intercept(ax - mc.x, ay - mc.y, pvx - mv.x, pvy - mv.y, WEAPONS.cannon.muzzle);
    const t = lead ?? dist / WEAPONS.cannon.muzzle;
    // Aim error drifts smoothly (a wandering beam spreads its heat).
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.noiseTimer = this.rng.range(0.25, 0.6);
      this.noiseTarget = this.rng.range(-1, 1);
    }
    this.noise += (this.noiseTarget - this.noise) * Math.min(1, dt * 4);
    const e = this.profile.aimError * (1 + Math.abs(me.body.getAngularVelocity()) * 0.5);
    const n = (this.noise * 1.6 + this.rng.range(-0.4, 0.4)) * e * dist;
    inp.aim.x = ax + (pvx - mv.x) * t + -uy * n;
    inp.aim.y = ay + (pvy - mv.y) * t + ux * n;

    inp.fireCannon = dist < 140;
    if (dist < WEAPONS.laser.range * 0.95) {
      inp.fireLaser = true;
      // Lasers are hitscan: aim straight at the point.
      if (me.count('cannon', true) === 0) {
        inp.aim.x = ax + -uy * n;
        inp.aim.y = ay + ux * n;
      }
    }
  }

  private pickFocus(tgt: Ship): { x: number; y: number } | null {
    const tiles = [...tgt.tiles.values()];
    if (!tiles.length) return null;
    if (this.rng.next() < this.profile.surgical) {
      const crit = tiles.filter((t: Tile) => CRITICAL.has(t.def.kind));
      if (crit.length) {
        const t = this.rng.pick(crit);
        return { x: t.x, y: t.y };
      }
    }
    const c = tgt.body.getLocalCenter();
    return { x: c.x, y: c.y };
  }
}

/** Time for a projectile of speed s to hit a target at r moving with v. */
function intercept(rx: number, ry: number, vx: number, vy: number, s: number): number | null {
  const a = vx * vx + vy * vy - s * s;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-6) return c > 0 ? -c / b : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : null;
}
