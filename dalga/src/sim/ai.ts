import { clamp, wrapAngle } from '../core/math';
import { rand } from '../core/rng';
import { islandSdf, islandsNear, WORLD } from '../data/world';
import type { Boat } from './boat';
import type { Sim } from './world';

export type AiRole = 'merchant' | 'hunter' | 'patrol' | 'boss';

export interface AiState {
  role: AiRole;
  targetId: number | null;
  side: 1 | -1;
  homeX: number;
  homeZ: number;
  leash: number;
  aggro: number;
  wx: number;
  wz: number;
  think: number;
  fleeing: boolean;
  /** Preferred engagement distance. */
  pref: number;
  rammer: boolean;
}

export function makeAi(b: Boat, role: AiRole): AiState {
  let range = 0, n = 0, turret = false;
  for (const m of b.mounts) {
    if (!m.stats) continue;
    range += m.stats.range;
    n++;
    if (m.slot.turret) turret = true;
  }
  range = n ? range / n : 50;
  return {
    role,
    targetId: null,
    side: Math.random() < 0.5 ? 1 : -1,
    homeX: b.x, homeZ: b.z,
    leash: role === 'boss' ? 280 : role === 'patrol' ? 420 : 700,
    aggro: role === 'boss' ? 230 : role === 'merchant' ? 0 : role === 'patrol' ? 150 : 170,
    wx: b.x, wz: b.z,
    think: Math.random() * 0.5,
    fleeing: false,
    pref: turret ? range * 0.7 : range * 0.62,
    rammer: b.def.ramMul > 1.5,
  };
}

function pickWander(ai: AiState, b: Boat) {
  const a = rand(0, Math.PI * 2);
  const r = rand(80, ai.role === 'merchant' ? 500 : 260);
  ai.wx = ai.homeX + Math.cos(a) * r;
  ai.wz = ai.homeZ + Math.sin(a) * r;
  // Merchants occasionally sail for a port.
  if (ai.role === 'merchant' && Math.random() < 0.35) {
    const p = WORLD.ports[Math.floor(Math.random() * WORLD.ports.length)];
    if (Math.hypot(p.x - b.x, p.z - b.z) < 900) { ai.wx = p.x; ai.wz = p.z; }
  }
}

/** Is the point clear of land with a margin? */
function clearAt(x: number, z: number, margin: number): boolean {
  for (const isl of islandsNear(x, z)) if (islandSdf(isl, x, z) < margin) return false;
  return Math.hypot(x, z) < WORLD.radius - 60;
}

/** Bends a desired heading around islands ahead. Shared with the player autopilot assist. */
export function avoidLand(b: Boat, heading: number): number {
  const look = b.length * 0.7 + Math.max(6, b.speed) * 2.2;
  const margin = b.beam * 0.6 + 5;
  const probe = (h: number) => {
    for (const f of [0.45, 1]) {
      if (!clearAt(b.x + Math.cos(h) * look * f, b.z + Math.sin(h) * look * f, margin)) return false;
    }
    return true;
  };
  if (probe(heading)) return heading;
  for (const off of [0.35, 0.7, 1.05, 1.4, 1.8, 2.3]) {
    // Prefer turning the way we already turn.
    const s = b.yawRate >= 0 ? 1 : -1;
    if (probe(heading + off * s)) return heading + off * s;
    if (probe(heading - off * s)) return heading - off * s;
  }
  return heading + Math.PI;
}

export function updateAi(sim: Sim, b: Boat, dt: number) {
  const ai = b.ai;
  if (!ai || b.dead) return;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = rand(0.3, 0.55);
    think(sim, b, ai);
  }

  let heading: number;
  let throttle = 1;
  const target = ai.targetId ? sim.boatById(ai.targetId) : null;

  if (ai.fleeing && target) {
    heading = Math.atan2(b.z - target.z, b.x - target.x);
    if (b.abilityCd <= 0 && (b.def.ability === 'sprint' || b.def.ability === 'gust' || b.def.ability === 'fog')) sim.useAbility(b);
  } else if (target && !target.dead) {
    const dx = target.x - b.x, dz = target.z - b.z;
    const d = Math.hypot(dx, dz);
    const toT = Math.atan2(dz, dx);
    if (ai.rammer && d < 70) {
      // Galleys line up and charge with lead.
      const t = d / Math.max(8, b.speed);
      heading = Math.atan2(target.z + target.vz * t - b.z, target.x + target.vx * t - b.x);
      if (b.abilityCd <= 0 && d < 45 && Math.abs(wrapAngle(heading - b.yaw)) < 0.25) sim.useAbility(b);
    } else {
      // Orbit at preferred range with a broadside toward the target.
      const e = clamp((d - ai.pref) / ai.pref, -0.9, 0.9);
      const h1 = toT + (Math.PI / 2 - e * 1.2);
      const h2 = toT - (Math.PI / 2 - e * 1.2);
      if (Math.abs(wrapAngle(h1 - b.yaw)) + 0.3 < Math.abs(wrapAngle(h2 - b.yaw))) ai.side = 1;
      else if (Math.abs(wrapAngle(h2 - b.yaw)) + 0.3 < Math.abs(wrapAngle(h1 - b.yaw))) ai.side = -1;
      heading = ai.side === 1 ? h1 : h2;
      if (d > ai.pref * 2.2) heading = toT;
      useCombatAbility(sim, b, target, d);
    }
  } else {
    if (Math.hypot(ai.wx - b.x, ai.wz - b.z) < 40) pickWander(ai, b);
    heading = Math.atan2(ai.wz - b.z, ai.wx - b.x);
    throttle = ai.role === 'merchant' ? 0.75 : 0.6;
  }

  if (Math.hypot(b.x, b.z) > WORLD.radius - 140) heading = Math.atan2(-b.z, -b.x);
  b.input.heading = avoidLand(b, heading);
  b.input.throttle = throttle;
}

function useCombatAbility(sim: Sim, b: Boat, target: Boat, d: number) {
  if (b.abilityCd > 0) return;
  switch (b.def.ability) {
    case 'broadside': if (d < 55) sim.useAbility(b); break;
    case 'repair': if (b.hpFrac < 0.5) sim.useAbility(b); break;
    case 'fog': if (b.hpFrac < 0.4) sim.useAbility(b); break;
    case 'barrels': {
      const [lx] = b.toLocal(target.x, target.z);
      if (lx < -5 && d < 45) sim.useAbility(b);
      break;
    }
    case 'gust': case 'sprint': if (d > 90) sim.useAbility(b); break;
    default: break;
  }
}

function think(sim: Sim, b: Boat, ai: AiState) {
  const homeD = Math.hypot(b.x - ai.homeX, b.z - ai.homeZ);
  // Leash: bosses and patrols drift back home.
  if (homeD > ai.leash) {
    ai.targetId = null;
    ai.fleeing = false;
    ai.wx = ai.homeX; ai.wz = ai.homeZ;
    return;
  }
  let best: Boat | null = null;
  let bestD = Infinity;
  const scan = ai.role === 'merchant' ? 120 : ai.aggro;
  for (const o of sim.boats) {
    if (o === b || o.dead || o.invisible || !sim.hostile(b, o)) continue;
    if (sim.inSafeWaters(o.x, o.z)) continue;
    let d = Math.hypot(o.x - b.x, o.z - b.z);
    // Grudges: whoever hit us recently is the priority.
    if (o.id === b.lastHitBy && sim.t - b.lastHitT < 8) d *= 0.4;
    if (o.faction === 'player') d *= 0.8;
    if (d < scan * (o.id === ai.targetId ? 1.4 : 1) && d < bestD) { bestD = d; best = o; }
  }
  ai.targetId = best ? best.id : null;
  // Merchants run; outmatched hunters run when badly hurt.
  ai.fleeing = !!best && (ai.role === 'merchant' || (ai.role === 'hunter' && b.hpFrac < 0.2 && best.level > b.level));
}
