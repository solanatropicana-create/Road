import { clamp, headingOf } from '../core/math';
import { intercept, steerVelocity } from '../sim/ai';
import { WEAPONS } from '../sim/defs';
import { ARENA_RADIUS, type World } from '../sim/world';
import type { Ship } from '../sim/ship';
import type { Pilot } from './match';

export interface Point {
  x: number;
  y: number;
}

export type Order =
  | { kind: 'hold' }
  /** Fly through the points in order, stop at the last one. */
  | { kind: 'path'; points: Point[] }
  /** Keep range around the enemy and circle it. */
  | { kind: 'engage' };

const CRUISE = 34;
const CORNER = 12;
/** Braking deceleration the planner assumes (m/s²); damaged ships overshoot. */
const BRAKE = 9;

/**
 * The player's ship in captain mode. The player gives orders (where to go,
 * which module to shoot); this turns them into the same stick input the
 * keyboard or the AI would produce, so physics and broken hardware still apply.
 */
export class CaptainPilot implements Pilot {
  order: Order = { kind: 'hold' };
  /** Aim point in the enemy's local tile coordinates; null = centre of mass. */
  target: Point | null = null;
  holdFire = false;
  private orbitDir = 1;

  constructor(
    readonly ship: Ship,
    public enemy: Ship,
    readonly range: number,
  ) {}

  update(world: World, dt: number): void {
    void dt;
    const me = this.ship;
    const inp = me.input;
    if (!me.controllable) return;
    const mc = me.body.getWorldCenter();
    const mv = me.body.getLinearVelocity();
    const enemyAlive = world.ships.includes(this.enemy) && this.enemy.controllable;
    const ec = this.enemy.body.getWorldCenter();
    const ev = this.enemy.body.getLinearVelocity();
    const rx = ec.x - mc.x;
    const ry = ec.y - mc.y;
    const dist = Math.hypot(rx, ry) || 1;

    // ---- movement
    let vdx = 0;
    let vdy = 0;
    const o = this.order;
    if (o.kind === 'path') {
      let p = o.points[0]!;
      let dx = p.x - mc.x;
      let dy = p.y - mc.y;
      let d = Math.hypot(dx, dy);
      // Pass through intermediate points without stopping.
      while (o.points.length > 1 && d < 5) {
        o.points.shift();
        p = o.points[0]!;
        dx = p.x - mc.x;
        dy = p.y - mc.y;
        d = Math.hypot(dx, dy);
      }
      const last = o.points.length === 1;
      if (last && d < 1.5 && Math.hypot(mv.x, mv.y) < 2.5) {
        this.order = { kind: 'hold' };
      } else {
        let corner = 0;
        if (!last) {
          const n = o.points[1]!;
          const a1 = Math.atan2(dy, dx);
          const a2 = Math.atan2(n.y - p.y, n.x - p.x);
          corner = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) / Math.PI;
        }
        const vEnd = last ? 0 : CRUISE - (CRUISE - CORNER) * corner;
        const v = Math.min(CRUISE, Math.sqrt(vEnd * vEnd + 2 * BRAKE * d));
        vdx = (dx / (d || 1)) * v;
        vdy = (dy / (d || 1)) * v;
      }
    } else if (o.kind === 'engage' && enemyAlive) {
      const ux = rx / dist;
      const uy = ry / dist;
      const radial = clamp((dist - this.range) * 0.7, -22, 30);
      const orbit = this.orbitDir * (dist < this.range * 1.8 ? 14 : 4);
      const tvl = Math.hypot(ev.x, ev.y);
      const tk = tvl > 20 ? 20 / tvl : 1;
      vdx = ev.x * tk + ux * radial - uy * orbit;
      vdy = ev.y * tk + uy * radial + ux * orbit;
    }
    // Stay inside the arena.
    const r = Math.hypot(mc.x, mc.y);
    if (r > ARENA_RADIUS * 0.85) {
      const k = (r - ARENA_RADIUS * 0.85) * 0.5;
      vdx -= (mc.x / r) * k;
      vdy -= (mc.y / r) * k;
    }

    // Face the enemy when in a fight so the guns bear; otherwise face where we go.
    const sp = Math.hypot(vdx, vdy);
    let face = me.body.getAngle();
    if (enemyAlive && dist < 170) face = headingOf({ x: rx, y: ry });
    else if (sp > 3) face = headingOf({ x: vdx, y: vdy });
    steerVelocity(me, vdx, vdy, face);

    // ---- weapons: everything at the chosen module, fire whenever in range
    inp.fireCannon = false;
    inp.fireLaser = false;
    if (!enemyAlive) return;
    let ax = ec.x;
    let ay = ec.y;
    let pvx = ev.x;
    let pvy = ev.y;
    if (this.target) {
      const wp = this.enemy.body.getWorldPoint(this.target);
      const v = this.enemy.body.getLinearVelocityFromWorldPoint(wp);
      ax = wp.x;
      ay = wp.y;
      pvx = v.x;
      pvy = v.y;
    }
    const t = intercept(ax - mc.x, ay - mc.y, pvx - mv.x, pvy - mv.y, WEAPONS.cannon.muzzle) ?? dist / WEAPONS.cannon.muzzle;
    inp.aim.x = ax + (pvx - mv.x) * t;
    inp.aim.y = ay + (pvy - mv.y) * t;
    inp.aimLaser = { x: ax, y: ay };
    if (this.holdFire) return;
    inp.fireCannon = dist < 140;
    inp.fireLaser = dist < WEAPONS.laser.range * 0.95;
  }

  flipOrbit(): void {
    this.orbitDir = -this.orbitDir;
  }
}
