import * as planck from 'planck';
import { clamp } from '../core/math';
import { Ship, type Tile } from './ship';

/**
 * Flight control. Every force comes from a physical thruster at its tile
 * position, plus reaction torque from gyros. With flight assist (needs a
 * powered stabilizer = flight computer) a small bounded least-squares solver
 * picks throttles that best match the desired force and torque; losing a
 * thruster therefore produces exactly the asymmetry the remaining hardware
 * cannot cancel. Without assist the mapping is raw and nothing is compensated.
 */

export const FLIGHT = {
  vForward: 48,
  vBack: 22,
  vStrafe: 26,
  omega: 2.6,
  kv: 3.2,
  kw: 9,
};

interface Th {
  tile: Tile;
  fx: number;
  fy: number;
  tau: number;
  u: number;
  main: boolean;
}

export function applyFlight(ship: Ship, dt: number): void {
  const body = ship.body;
  const inp = ship.input;
  const lc = body.getLocalCenter();
  const thrusters: Th[] = [];
  let gyroMax = 0;
  let stabilizer = false;

  for (const t of ship.tiles.values()) {
    const k = t.def.kind;
    if (k === 'thruster' || k === 'rcs') {
      t.throttle = 0;
      if (!t.powered || !ship.controllable) continue;
      const ex = Ship.exhaust(t);
      const F = t.def.thrust ?? 0;
      const fx = -ex.x * F;
      const fy = -ex.y * F;
      const rx = t.x - lc.x;
      const ry = t.y - lc.y;
      thrusters.push({ tile: t, fx, fy, tau: rx * fy - ry * fx, u: 0, main: k === 'thruster' });
    } else if (k === 'gyro' && t.powered) gyroMax += t.def.torque ?? 0;
    else if (k === 'stabilizer' && t.powered) stabilizer = true;
  }

  ship.gyroOut = 0;
  if (!ship.controllable) {
    ship.assistActive = false;
    return;
  }

  const assist = inp.assist && stabilizer;
  ship.assistActive = assist;
  const m = body.getMass();
  const I = body.getInertia();
  const ang = body.getAngle();
  const omega = body.getAngularVelocity();
  let g = 0;

  if (assist) {
    const v = body.getLinearVelocity();
    const vl = body.getLocalVector(v);
    const vtx = inp.strafe * FLIGHT.vStrafe;
    const vty = -inp.thrust * (inp.thrust > 0 ? FLIGHT.vForward : FLIGHT.vBack);
    const Fx = (vtx - vl.x) * FLIGHT.kv * m;
    const Fy = (vty - vl.y) * FLIGHT.kv * m;
    const wt = inp.turn * FLIGHT.omega;
    const T = (wt - omega) * FLIGHT.kw * I;
    g = solve(thrusters, gyroMax, Fx, Fy, T);
  } else {
    // Raw: thrusters respond to the stick direction; RCS also help turning.
    const dx = inp.strafe;
    const dy = -inp.thrust;
    const dl = Math.hypot(dx, dy);
    for (const th of thrusters) {
      const fl = Math.hypot(th.fx, th.fy);
      let u = dl > 0 ? Math.max(0, (th.fx * dx + th.fy * dy) / (fl * dl)) * Math.min(1, dl) : 0;
      if (u < 0.35) u = 0;
      if (!th.main && inp.turn !== 0 && Math.sign(th.tau) === Math.sign(inp.turn)) u = Math.max(u, Math.abs(inp.turn));
      th.u = u;
    }
    g = inp.turn * gyroMax;
  }

  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (const th of thrusters) {
    if (th.u <= 0.001) continue;
    th.tile.throttle = th.u;
    const wfx = (th.fx * c - th.fy * s) * th.u * dt;
    const wfy = (th.fx * s + th.fy * c) * th.u * dt;
    body.applyLinearImpulse(planck.Vec2(wfx, wfy), ship.tileWorld(th.tile), true);
  }
  if (g !== 0) body.applyAngularImpulse(g * dt, true);
  ship.gyroOut = gyroMax > 0 ? g / gyroMax : 0;
}

/** Projected coordinate descent on  |Σu f − F|² + wT (Σu τ + g − T)². */
function solve(ths: Th[], gMax: number, Fx: number, Fy: number, T: number): number {
  const wT = 0.06;
  let ex = -Fx;
  let ey = -Fy;
  let eT = -T;
  let g = 0;
  for (let it = 0; it < 10; it++) {
    if (gMax > 0) {
      const ng = clamp(g - eT, -gMax, gMax);
      eT += ng - g;
      g = ng;
    }
    for (const th of ths) {
      const den = th.fx * th.fx + th.fy * th.fy + wT * th.tau * th.tau;
      if (den <= 0) continue;
      const d = -(ex * th.fx + ey * th.fy + wT * eT * th.tau) / den;
      const nu = clamp(th.u + d, 0, 1);
      const du = nu - th.u;
      if (du === 0) continue;
      th.u = nu;
      ex += du * th.fx;
      ey += du * th.fy;
      eT += du * th.tau;
    }
  }
  return g;
}
