import { clamp, wrapAngle } from '../core/math';
import { rand } from '../core/rng';
import type { Boat, Mount } from './boat';
import type { Sim } from './world';

export const GRAVITY = 20;

/**
 * Launch elevation for a horizontal distance, or null when out of reach.
 * Low arc for guns, high arc for mortars.
 */
export function elevationFor(d: number, v: number, high: boolean): number | null {
  const s = (GRAVITY * d) / (v * v);
  if (s > 1) return null;
  const low = 0.5 * Math.asin(s);
  return high ? Math.PI / 2 - low : low;
}

function inArc(b: Boat, m: Mount, dirAngle: number): boolean {
  if (m.slot.turret || !m.stats) return true;
  return Math.abs(wrapAngle(dirAngle - (b.yaw + m.slot.face))) <= m.stats.arc;
}

/** Picks a target for one mount: the boat's chosen target if it can be hit, else the nearest. */
function pickTarget(sim: Sim, b: Boat, m: Mount, mx: number, mz: number): Boat | null {
  const st = m.stats!;
  const preferred = b.ai?.targetId ?? b.focusId;
  let best: Boat | null = null;
  let bestScore = Infinity;
  for (const o of sim.boats) {
    if (o === b || o.dead || o.invisible || !sim.hostile(b, o)) continue;
    const dx = o.x - mx, dz = o.z - mz;
    const d = Math.hypot(dx, dz);
    const reach = st.range + o.length * 0.35;
    if (d > reach || d < st.minRange) continue;
    if (!inArc(b, m, Math.atan2(dz, dx))) continue;
    if (sim.inSafeWaters(o.x, o.z)) continue;
    const score = o.id === preferred ? d - 1000 : d;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

export function updateMounts(sim: Sim, b: Boat, dt: number) {
  if (b.dead) return;
  if (sim.inSafeWaters(b.x, b.z)) {
    for (const m of b.mounts) { m.since += dt; m.reload = Math.max(m.reload - dt, 0.3); }
    return;
  }
  for (const m of b.mounts) {
    m.since += dt;
    if (!m.stats) continue;
    if (m.reload > 0) m.reload -= dt;
    const [mx, mz] = b.toWorld(m.lx, m.lz);
    const target = pickTarget(sim, b, m, mx, mz);
    if (!target) {
      m.aim *= 1 - Math.min(1, dt * 2);
      continue;
    }
    const st = m.stats;
    // Lead the target using relative velocity (the ball inherits our motion).
    const rvx = target.vx - b.vx, rvz = target.vz - b.vz;
    let px = target.x, pz = target.z, elev: number | null = null, tFlight = 0;
    for (let i = 0; i < 3; i++) {
      const d = Math.max(1, Math.hypot(px - mx, pz - mz));
      elev = elevationFor(Math.min(d, st.range), st.speed, st.highArc);
      if (elev === null) break;
      tFlight = d / (st.speed * Math.cos(elev));
      px = target.x + rvx * tFlight;
      pz = target.z + rvz * tFlight;
    }
    if (elev === null) continue;
    const aimAngle = Math.atan2(pz - mz, px - mx);
    const rel = m.slot.turret ? wrapAngle(aimAngle - b.yaw) : wrapAngle(aimAngle - (b.yaw + m.slot.face));
    const lim = m.slot.turret ? Math.PI : st.arc;
    m.aim += (clamp(rel, -lim, lim) - m.aim) * Math.min(1, dt * 8);
    if (m.reload > 0) continue;

    fire(sim, b, m, aimAngle, elev, mx, mz);
    m.reload = st.reload * rand(0.9, 1.12);
    m.since = 0;
  }
}

function fire(sim: Sim, b: Boat, m: Mount, angle: number, elev: number, mx: number, mz: number) {
  const st = m.stats!;
  const my = b.heave + b.deck + 0.5;
  // AI gunners are sloppier than the player's crew.
  const spread = st.spread * (b.faction === 'player' ? 1 : 2.2);
  for (let p = 0; p < st.pellets; p++) {
    const a = angle + rand(-spread, spread);
    const e = elev + rand(-spread, spread) * 0.6;
    const v = st.speed * rand(0.97, 1.03);
    const h = Math.cos(e) * v;
    const ox = Math.cos(a) * 0.9, oz = Math.sin(a) * 0.9;
    sim.shots.push({
      x: mx + ox, y: my, z: mz + oz,
      vx: Math.cos(a) * h + b.vx, vy: Math.sin(e) * v, vz: Math.sin(a) * h + b.vz,
      owner: b.id, dmg: st.dmg * (b.faction === 'player' ? 1 : b.bossId ? 0.9 : 0.75), aoe: st.aoe, slow: st.slow, tether: st.tether,
      r: st.ballR, kind: st.kind, age: 0, alive: true,
    });
  }
  // Recoil pushes the hull opposite to the shot and heels it.
  const j = 0.55 * st.recoil * Math.sqrt(b.mass) * (st.pellets > 1 ? 1.3 : 1);
  b.impulse(-Math.cos(angle) * j, -Math.sin(angle) * j, mx, mz);
  sim.emit({ type: 'fire', x: mx + Math.cos(angle) * 1.2, y: my, z: mz + Math.sin(angle) * 1.2, angle, kind: st.kind, boat: b.id });
}
