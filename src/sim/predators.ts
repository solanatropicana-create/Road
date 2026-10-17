import type { Sim } from './sim';
import type { Critter, Critters } from './critters';
import type { Ant } from './ant';
import { EMPTY, SAND, WATER, HARD, SOLID, LOAM } from '../world/mat';
import { PACKED } from '../world/physics';
import { TICK_HZ, DAY_TICKS } from '../config';
import { clamp } from '../util/math';

/**
 * Big animals that can wreck a colony, not just nibble at it:
 *   toad   – a green toad (Bufotes viridis), 6 cm: comes at dusk to sit beside
 *            a busy trail and flicks up the workers one after another. Once it
 *            has found a nest it comes back night after night.
 *   lizard – a sand lizard (Lacerta agilis): basks on the mound in the heat of
 *            the day and darts at passing foragers.
 *   mole   – a mole (Talpa europaea) tunnelling through the slice: a 4 cm
 *            cavity that opens ahead of it and slumps shut behind it. Through
 *            the nest it fills rooms with loose soil for the workers to dig out
 *            again, eats the brood in its way, and can kill the queen.
 */

/** Hop/stand on the ground under x. */
function ground(sim: Sim, cr: Critters, x: number): number {
  return cr.top(sim, clamp(Math.round(x), 2, sim.world.w - 3));
}

/**
 * The flattest stretch of ground between x0 and x1 (a toad sits on the level,
 * not astride a spoil heap).
 */
function flatSpot(sim: Sim, cr: Critters, x0: number, x1: number): number {
  const w = sim.world;
  const lo = clamp(Math.round(Math.min(x0, x1)), 40, w.w - 41);
  const hi = clamp(Math.round(Math.max(x0, x1)), 40, w.w - 41);
  let best = lo;
  let bs = Infinity;
  for (let x = lo; x <= hi; x += 3) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let d = -26; d <= 26; d += 4) {
      const y = cr.top(sim, x + d);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    // Level ground, near the trail.
    const sc = (y1 - y0) + Math.abs(x - x0) * 0.05;
    if (sc < bs) {
      bs = sc;
      best = x;
    }
  }
  return best;
}

/** A worker out on the open ground near (x, y). */
function exposed(sim: Sim, a: Ant): boolean {
  const w = sim.world;
  return a.alive && !a.away && !a.paralysed && a.caste !== 'queen' && w.bg[a.y * w.w + a.x] === 0;
}

export function spawnPredators(sim: Sim, cr: Critters): void {
  const nest = sim.nest;
  const col = sim.colony;
  const rng = sim.rng;
  const w = sim.world;
  if (!nest.founded || sim.dormant) return;
  const doy = sim.doy;
  const air = sim.cal.airMean(doy);
  const light = sim.cal.daylight(sim.dayT, doy);
  const wet = !sim.raining && sim.snow < 5;
  // A green toad at dusk, in the warm months; once it knows the nest it comes back.
  const dusk = light < 0.25 && sim.dayT > 0.5;
  // (A big colony's evening traffic is what draws a toad; a small one is not worth its while.)
  const known = cr.toadLast > 0 && sim.tick - cr.toadLast < DAY_TICKS * 3 && col.adults >= 50;
  if (dusk && wet && air > 11 && doy > 105 && doy < 265 && cr.count('toad') === 0 && (col.adults >= 80 || known)) {
    const rained = sim.tick - sim.lastRain < DAY_TICKS;
    if (rng.chance(known ? 0.03 : rained ? 0.012 : 0.005)) {
      const side = rng.chance(0.5) ? -1 : 1;
      const gate = nest.gateNear(nest.foundX + side * 50);
      const x = side < 0 ? 6 : w.w - 7;
      const spot = flatSpot(sim, cr, gate + side * 18, gate + side * 70);
      // How many it takes in a night follows the evening traffic: a few from a colony of
      // a hundred, a full meal only from a big one (or it would hold a middling colony
      // down for years, coming back every evening).
      const meal = Math.max(2, Math.round(rng.int(6, 16) * clamp((col.adults - 30) / 270, 0.3, 1)));
      cr.add({ kind: 'toad', x, y: ground(sim, cr, x), dir: -side, state: 0, px: spot, life: meal, timer: TICK_HZ, tone: rng.int(0, 255) });
      if (known) {
        cr.toadNights++;
        sim.noteYearly('toadBack', { x: spot, y: ground(sim, cr, spot) });
      }
      cr.toadLast = sim.tick;
    }
  }
  // A sand lizard in the heat of the day.
  const hot = light > 0.45 && sim.surfaceT > 24 && sim.surfaceT < 46;
  if (hot && wet && doy > 100 && doy < 260 && cr.count('lizard') === 0 && col.adults >= 15 && rng.chance(0.006)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side < 0 ? 6 : w.w - 7;
    const spot = clamp(nest.gateNear(nest.foundX) + side * rng.int(25, 90), 30, w.w - 31);
    cr.add({ kind: 'lizard', x, y: ground(sim, cr, x), dir: -side, state: 0, px: spot, life: rng.int(4, 12), timer: 0, tone: rng.int(0, 255) });
  }
  // A mole, now and then, through the topsoil (never in the frozen months).
  if (air > 4 && col.adults >= 10 && cr.count('mole') === 0 && rng.chance(0.0006)) {
    const left = rng.chance(0.5);
    const x = left ? 2 : w.w - 3;
    const y = w.ground[x]! + rng.int(45, 200);
    if (y < w.h - 40) cr.add({ kind: 'mole', x, y, dir: left ? 1 : -1, vx: 0, vy: 0, state: 0, body: [], life: 0, timer: 0, tone: rng.int(0, 255) });
  }
}

// ------------------------------------------------------------------ toad

/** States: 0 hopping in to its spot, 1 sitting by the trail, 2 hopping away. */
export function toad(sim: Sim, c: Critter, cr: Critters): boolean {
  const w = sim.world;
  const rng = sim.rng;
  if (c.peck > 0) c.peck--;
  // In the air: a hop.
  if (c.air) {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.16;
    const g = ground(sim, cr, c.x);
    if (c.vy > 0 && c.y >= g) {
      c.y = g;
      c.air = false;
      c.timer = rng.int(Math.round(TICK_HZ * 0.4), TICK_HZ);
    }
    return c.x > 1 && c.x < w.w - 2;
  }
  const light = sim.cal.daylight(sim.dayT, sim.doy);
  if (c.state === 1 && (light > 0.3 || c.life <= 0 || (sim.raining && rng.chance(0.002)))) {
    c.state = 2;
    c.dir = c.x < w.w / 2 ? -1 : 1;
  }
  const hop = (dir: number): void => {
    c.dir = dir;
    c.air = true;
    c.vx = dir * rng.range(1.2, 1.7);
    c.vy = -rng.range(1.3, 1.7);
  };
  if (c.state === 0) {
    const d = (c.px ?? c.x) - c.x;
    if (Math.abs(d) < 8) {
      c.state = 1;
      c.dir = Math.sign(sim.nest.gateNear(c.x) - c.x) || c.dir;
      c.timer = TICK_HZ * 2;
      return true;
    }
    if (--c.timer <= 0) hop(Math.sign(d));
    return true;
  }
  if (c.state === 2) {
    if (--c.timer <= 0) hop(c.dir);
    return true;
  }
  // Sitting (on the ground under its middle: spoil may pile up around it),
  // a worker within reach of the tongue in front of it is flicked up.
  if (c.t % 15 === 0) c.y = ground(sim, cr, c.x + 4 * c.dir);
  if (--c.timer > 0) return true;
  c.timer = rng.int(Math.round(TICK_HZ * 0.3), Math.round(TICK_HZ * 0.6));
  let best: Ant | null = null;
  let bd = Infinity;
  let behind = 0;
  for (const a of sim.colony.ants) {
    if (!exposed(sim, a)) continue;
    const ahead = (a.x - c.x) * c.dir;
    const dy = a.y - (c.y - 5);
    if (Math.abs(dy) > 14 || Math.abs(a.x - c.x) > 40) continue;
    if (ahead < 0) {
      behind++;
      continue;
    }
    if (ahead < 6) continue;
    const d = ahead + Math.abs(dy);
    if (ahead <= 34 && d < bd) {
      bd = d;
      best = a;
    }
  }
  // Worried by a crowd of workers biting at it, it moves off (only the
  // alarmed ones attack; the rest just pass by).
  let close = 0;
  for (const a of sim.colony.ants) {
    const along = (a.x - c.x) * c.dir;
    if (a.alive && !a.away && a.alarm > 0 && along > -28 && along < 30 && a.y > c.y - 27 && a.y <= c.y + 2) close++;
  }
  // (A smaller colony drives it off with a smaller crowd: what counts is being swarmed.)
  if (close >= Math.min(25, 10 + sim.colony.adults * 0.05)) {
    c.state = 2;
    c.dir = c.x < w.w / 2 ? -1 : 1;
    sim.noteYearly('toadDriven', c);
    return true;
  }
  if (best && rng.chance(0.75)) {
    c.peck = 7;
    c.px = best.x;
    c.pr = best.y;
    sim.colony.kill(best, 'eaten by a toad', 'none');
    // Those that saw it catch the scent of alarm.
    for (const a of sim.colony.ants) if (a.alive && !a.away && Math.abs(a.x - c.px) < 10 && Math.abs(a.y - c.pr) < 10) a.alarm = Math.max(a.alarm, TICK_HZ * 6);
    c.life--;
    cr.toadKills++;
    sim.noteYearly('toad', c);
    c.timer = rng.int(Math.round(TICK_HZ * 1.2), TICK_HZ * 4);
  } else if (!best && behind > 2 && rng.chance(0.25)) {
    // The traffic is behind it: it shuffles round.
    c.dir = -c.dir;
    c.timer = TICK_HZ;
  }
  return true;
}

// ------------------------------------------------------------------ lizard

/** States: 0 running in, 1 basking, 2 leaving, 3 darting at a worker. */
export function lizard(sim: Sim, c: Critter, cr: Critters): boolean {
  const w = sim.world;
  const rng = sim.rng;
  if (c.peck > 0) c.peck--;
  const light = sim.cal.daylight(sim.dayT, sim.doy);
  if (c.state !== 2 && (light < 0.35 || sim.raining || sim.surfaceT < 20 || c.life <= 0 || c.t > DAY_TICKS / 4)) {
    c.state = 2;
    c.dir = c.x < w.w / 2 ? -1 : 1;
    c.prey = null;
  }
  // Lizards run in bursts and stop dead.
  const run = (dir: number, speed: number): void => {
    c.dir = dir;
    if (c.timer > 0) {
      c.timer--;
      c.vx = 0;
      return;
    }
    c.vx = speed;
    c.x = clamp(c.x + dir * speed, 1, w.w - 2);
    c.y = ground(sim, cr, c.x);
    if (rng.chance(0.03)) c.timer = rng.int(8, 30);
  };
  if (c.state === 0) {
    const d = (c.px ?? c.x) - c.x;
    if (Math.abs(d) < 4) {
      c.state = 1;
      c.vx = 0;
      c.timer = TICK_HZ;
      return true;
    }
    run(Math.sign(d), 1.1);
    return true;
  }
  if (c.state === 2) {
    run(c.dir, 1.3);
    return c.x > 2 && c.x < w.w - 3;
  }
  if (c.state === 3) {
    const a = c.prey;
    if (!a || !exposed(sim, a) || Math.abs(a.x - c.x) > 70) {
      c.prey = null;
      c.state = 1;
      c.timer = TICK_HZ;
      return true;
    }
    c.timer = 0;
    run(Math.sign(a.x - c.x) || c.dir, 1.6);
    if (Math.abs(a.x - c.x) <= 4 && Math.abs(a.y - c.y) <= 8) {
      c.peck = 6;
      sim.colony.kill(a, 'eaten by a lizard', 'none');
      c.life--;
      c.prey = null;
      c.state = 1;
      c.timer = rng.int(TICK_HZ * 2, TICK_HZ * 6);
      sim.noteYearly('lizard', c);
    }
    return true;
  }
  // Basking: now and then a flick of the tongue; a worker passing near is chased.
  c.vx = 0;
  if (rng.chance(0.004)) c.peck = 4;
  if (--c.timer > 0) return true;
  c.timer = rng.int(Math.round(TICK_HZ * 0.5), TICK_HZ * 2);
  let best: Ant | null = null;
  let bd = Infinity;
  for (const a of sim.colony.ants) {
    if (!exposed(sim, a)) continue;
    const d = Math.abs(a.x - c.x) + Math.abs(a.y - c.y) * 2;
    if (Math.abs(a.x - c.x) < 50 && Math.abs(a.y - c.y) < 16 && d < bd) {
      bd = d;
      best = a;
    }
  }
  if (best && rng.chance(0.5)) {
    c.prey = best;
    c.state = 3;
  } else if (rng.chance(0.1)) c.dir = -c.dir;
  return true;
}

// ------------------------------------------------------------------ mole

/** The mole's body: the cavity is an ellipse this long and this high, snout first. */
export const MOLE_LEN = 110;
export const MOLE_H = 36;

/**
 * States: 0 tunnelling. `body` holds the cells its cavity has opened, oldest
 * first; they slump full of loose soil once its tail has passed. `life`
 * counts brood eaten; `state` bit 2 is set once it has been through the nest.
 */
export function mole(sim: Sim, c: Critter): boolean {
  const w = sim.world;
  const rng = sim.rng;
  const col = sim.colony;
  // About 15 mm a second, digging.
  c.vx += 0.5;
  while (c.vx >= 1) {
    c.vx -= 1;
    // Wander in depth, keeping to the topsoil where the worms are; stones turn it.
    const depth = c.y - w.ground[clamp(Math.round(c.x), 0, w.w - 1)]!;
    c.vy = clamp(c.vy + rng.range(-0.04, 0.04) + (depth < 40 ? 0.02 : depth > 210 ? -0.02 : 0), -0.25, 0.25);
    const nx = Math.round(c.x + c.dir);
    let blocked = 0;
    for (let dy = -MOLE_H / 2; dy <= MOLE_H / 2; dy++) if (HARD[w.mat[(Math.round(c.y) + dy) * w.w + nx]!]) blocked += dy < 0 ? -1 : 1;
    if (blocked) c.vy = clamp(c.vy - Math.sign(blocked) * 0.2, -0.6, 0.6);
    c.x = nx;
    c.y = clamp(c.y + c.vy, w.ground[clamp(nx, 0, w.w - 1)]! + MOLE_H / 2 + 12, w.h - MOLE_H);
    if (c.x < 1 || c.x > w.w - 2) {
      slump(sim, c, Infinity);
      return false;
    }
    dig(sim, c);
    slump(sim, c, c.x - c.dir * MOLE_LEN);
  }
  // What the snout meets: brood, workers, and maybe the queen.
  if (c.t % 3 === 0) {
    const sx = c.x;
    const sy = c.y;
    const inSnout = (x: number, y: number): boolean => (x - sx) * c.dir <= 2 && (x - sx) * c.dir > -26 && Math.abs(y - sy) <= MOLE_H / 2 + 2;
    for (const b of [...col.brood]) {
      if (b.carried || !inSnout(b.x, b.y) || !rng.chance(0.5)) continue;
      col.takeBrood(b, 'brood eaten by a mole');
      c.life++;
    }
    for (const a of col.ants) {
      if (!a.alive || a.away || !inSnout(a.x, a.y)) continue;
      if (a.caste === 'queen') {
        // She has a moment to get clear (or her workers buy her one); not always.
        if (!rng.chance(0.017)) continue;
        col.kill(a, 'killed by a mole');
        sim.events.push({ key: 'queenKilledMole', x: a.x, y: a.y });
        continue;
      }
      if (rng.chance(0.02)) col.kill(a, 'killed by a mole');
    }
  }
  return true;
}

/** Cells already in a mole's list (not saved: a duplicate after loading only slumps twice). */
let listed: Uint8Array | null = null;

/**
 * Is this cell part of a mole's open tunnel? Soil crumbling into it is not the
 * nest's to adopt, or the whole tunnel would be taken into the plan a cell at
 * a time as the mole went.
 */
export function moleCell(i: number): boolean {
  return listed !== null && listed[i] === 1;
}

/** Open the cavity ahead: the front half of the ellipse. */
function dig(sim: Sim, c: Critter): void {
  const w = sim.world;
  if (!listed || listed.length !== w.size) listed = new Uint8Array(w.size);
  const mark = listed;
  const a = MOLE_LEN / 2;
  const b = MOLE_H / 2;
  const cx = c.x - c.dir * a;
  const cy = c.y;
  let nest = false;
  for (let dx = 0; dx <= a; dx++) {
    const x = c.x - c.dir * dx;
    if (x < 1 || x > w.w - 2) continue;
    const nx = (x - cx) / a;
    const half = b * Math.sqrt(Math.max(0, 1 - nx * nx));
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++) {
      const i = y * w.w + x;
      if (mark[i]) continue;
      const m = w.mat[i]!;
      if (w.bg[i] !== 1 || HARD[m] || m === WATER) continue;
      if (m === EMPTY) {
        // A tunnel or room of the nest: it slumps full behind the mole too.
        if (!w.plan[i]) continue;
        nest = true;
      } else w.set(i, EMPTY, w.tone[i], w.tint[i] || m);
      mark[i] = 1;
      c.body.push(i);
    }
  }
  if (nest && !(c.state & 2)) {
    c.state |= 2;
    sim.events.push({ key: 'moleNest', x: c.x, y: c.y });
  }
}

/** Behind the mole (cells behind x, the way it is heading), its tunnel slumps full of loose soil. */
function slump(sim: Sim, c: Critter, x: number): void {
  const w = sim.world;
  let k = 0;
  for (; k < c.body.length; k++) {
    const i = c.body[k]!;
    if (Number.isFinite(x) && ((i % w.w) - x) * c.dir > 0) break;
    if (listed) listed[i] = 0;
    if (w.mat[i] !== EMPTY) continue;
    const src = w.tint[i]! & 0x3f;
    const soil = src && SOLID[src] && !HARD[src] ? src : LOAM;
    if (w.plan[i]) {
      // The nest's own rooms and tunnels fill with loose soil, for the workers to dig out again.
      w.set(i, SAND, 70 + ((i * 53) % 120), soil | PACKED);
    } else {
      // Out in the soil the tunnel just closes up, a shade darker where it ran:
      // solid ground again, not sand that would drain into the nest below it.
      w.set(i, soil, clamp(w.tone[i]! - 18 + ((i * 29) % 12), 0, 255), 0);
    }
  }
  if (k) c.body.splice(0, k);
}
