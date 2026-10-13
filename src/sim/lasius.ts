import type { Sim } from './sim';
import type { Critter, Critters } from './critters';
import type { Corpse } from './brood';
import { TICK_HZ } from '../config';
import { clamp } from '../util/math';
import { EMPTY, PREY } from '../world/mat';

/** How far out from the foot of the trunk the garden ants forage on the ground (mm). */
const RANGE = 110;
/** At most this many on the slice at once (the column on the bark is drawn apart, see TreeLife). */
const MOST = 8;
/** They pick fights only this close to their tree (mm out from the trunk); further out they give way. */
const TURF = 70;

/** Where the trunk meets the slice, and which way is out from it into the slice. */
function foot(sim: Sim): { x: number; out: number } | null {
  const t = sim.tree;
  if (!t) return null;
  const side = t.x < sim.world.w / 2 ? -1 : 1;
  return { x: t.x - side * t.r, out: -side };
}

/** How keen the garden ants are to be out on the ground now (0..1). */
export function lasiusOut(sim: Sim): number {
  if (!sim.tree || sim.dormant || sim.raining || sim.doy < 95 || sim.doy > 300) return 0;
  return clamp((sim.surfaceT - 12) / 8, 0, 1);
}

/**
 * A few times an in-game hour: garden ants come down the trunk onto the
 * ground to forage, more of them on warm days.
 */
export function lasiusSeason(sim: Sim, cz: Critters): void {
  const f = foot(sim);
  if (!f) return;
  const want = Math.round(lasiusOut(sim) * 3);
  if (cz.count('lasius') >= want || !sim.rng.chance(0.6)) return;
  comeDown(sim, cz, f, 0);
}

function comeDown(sim: Sim, cz: Critters, f: { x: number; out: number }, state: number, to?: number): void {
  if (cz.count('lasius') >= MOST) return;
  const rng = sim.rng;
  const x = clamp(f.x + f.out * rng.range(0, 4), 2, sim.world.w - 3);
  cz.add({ kind: 'lasius', x, y: cz.top(sim, x), dir: f.out, state, px: to, life: rng.int(TICK_HZ * 60, TICK_HZ * 200), timer: rng.int(TICK_HZ, TICK_HZ * 3), tone: rng.int(0, 255) });
}

/**
 * Black garden ants (Lasius niger) from the tree's colony, out on the
 * ground at the foot of the trunk: small (3.5 mm), quick, and quick to fight.
 * A Messor forager that runs into one is seized: a scuffle of a few seconds,
 * jaws and acid, that one of them may not walk away from. The bigger Messor
 * (a major above all) mostly wins one against one, and nestmates close by
 * tip it further; but a fight calls more Lasius down the trunk, and a
 * Messor caught among several is lost. A Lasius killed is an insect like any
 * other to the harvesters: it goes home as food. A dead Messor the Lasius
 * drag off to the trunk, unless the harvesters drive them off it.
 *
 * state: 0 foraging, 1 fighting (prey: the Messor), 2 going home, 3 coming
 * down to a fight (px: where), 4 dragging a dead Messor home (load).
 */
export function lasius(sim: Sim, c: Critter, cz: Critters): boolean {
  const f = foot(sim);
  if (!f) return false;
  const w = sim.world;
  const rng = sim.rng;
  const col = sim.colony;
  const walk = (v: number, dir: number): void => {
    c.dir = dir;
    c.x = clamp(c.x + dir * v, 2, w.w - 3);
    c.y = cz.top(sim, c.x);
  };
  const d = (c.x - f.x) * f.out;
  if (c.state === 1) {
    const a = c.prey;
    if (!a || !a.alive) {
      c.prey = null;
      c.state = 0;
      return true;
    }
    // A little tussle in place.
    if (c.t % 6 === 0) c.x = clamp(a.x - c.dir * 1.6 + rng.range(-0.4, 0.4), 2, w.w - 3);
    if (--c.timer > 0) return true;
    return resolve(sim, c, cz);
  }
  if (c.state === 4) {
    const body = c.load;
    // Harvesters round her: she lets the body go and runs.
    if (!body || mob(sim, c, 3) >= 3) {
      if (body) body.carried = false;
      c.load = null;
      c.state = 2;
      return true;
    }
    walk(0.14, -f.out);
    body.x = clamp(Math.round(c.x + f.out * 2), 1, w.w - 2);
    body.y = cz.top(sim, body.x);
    if (d <= 1) {
      const k = col.corpses.indexOf(body);
      if (k >= 0) col.corpses.splice(k, 1);
      c.load = null;
      return false;
    }
    return true;
  }
  if (c.state === 2 || --c.life <= 0 || lasiusOut(sim) === 0) {
    c.state = 2;
    walk(0.4, -f.out);
    return d > 1;
  }
  if (c.state === 3) {
    const to = c.px ?? f.x;
    walk(0.45, to > c.x ? 1 : -1);
    if (Math.abs(c.x - to) < 3) c.state = 0;
  } else {
    // Foraging: quick runs, turns, pauses, never far from the trunk.
    if (--c.timer <= 0) {
      c.timer = rng.int(TICK_HZ, TICK_HZ * 4);
      if (rng.chance(0.35)) c.dir = -c.dir;
      if (d > RANGE) c.dir = -f.out;
      if (d < 4) c.dir = f.out;
    }
    if (c.timer % 40 < 30) walk(0.3, c.dir);
  }
  if (c.t % 3 !== 0 || d > TURF) return true;
  // One of ours within reach, on their ground: seized (more often than not they only touch and part).
  for (const a of col.ants) {
    if (a.away || a.paralysed || a.fight > 0 || a.rival) continue;
    if (Math.abs(a.x - c.x) > 2 || Math.abs(a.y - c.y) > 3 || w.bg[a.y * w.w + a.x] !== 0) continue;
    if (!rng.chance(0.04)) continue;
    c.state = 1;
    c.prey = a;
    c.dir = a.x >= c.x ? 1 : -1;
    c.timer = rng.int(TICK_HZ * 2, TICK_HZ * 5);
    a.fight = c.timer + 1;
    a.foe = null;
    // The alarm goes round the harvesters close by; the Lasius call more of theirs down.
    a.alarm = TICK_HZ * 20;
    cz.lasiusFights++;
    if (rng.chance(0.35)) for (let k = rng.int(1, 2); k > 0; k--) comeDown(sim, cz, f, 3, c.x);
    sim.noteYearly('lasiusFight', c);
    break;
  }
  return true;
}

/** How many of ours (not away, not caught up in a fight already) are round the critter. */
function mob(sim: Sim, c: Critter, r: number): number {
  let k = 0;
  for (const a of sim.colony.ants) {
    if (a.away || a.paralysed) continue;
    if (Math.abs(a.x - c.x) <= r + 3 && Math.abs(a.y - c.y) <= r + 2) k++;
  }
  return k;
}

/** The scuffle ends: one of them dead, or the Lasius lets go and runs. False if the Lasius died. */
function resolve(sim: Sim, c: Critter, cz: Critters): boolean {
  const a = c.prey!;
  const rng = sim.rng;
  const w = sim.world;
  const col = sim.colony;
  // Nestmates close by (beyond the one in the fight), and other Lasius in reach.
  const helpers = Math.max(0, mob(sim, c, 4) - 1);
  let allies = 0;
  for (const o of cz.list) if (o !== c && o.kind === 'lasius' && o.state !== 2 && Math.abs(o.x - c.x) < 8) allies++;
  const major = a.caste === 'soldier';
  const pDie = clamp(0.14 + 0.1 * allies - 0.06 * helpers - (major ? 0.12 : 0), 0.02, 0.6);
  const pKill = clamp(0.35 + 0.12 * helpers + (major ? 0.3 : 0) - 0.06 * allies, 0.1, 0.9);
  const r = rng.next();
  c.prey = null;
  a.fight = 0;
  if (r < pDie) {
    col.kill(a, 'killed by garden ants');
    cz.lasiusKills++;
    // The body goes back up the trunk with them.
    const body = col.corpses[col.corpses.length - 1] as Corpse | undefined;
    if (body && body.x === a.x && body.y === a.y && !body.carried) {
      body.carried = true;
      c.load = body;
      c.state = 4;
    } else c.state = 2;
    if (sim.tick - cz.lasiusNote > TICK_HZ * 120) {
      cz.lasiusNote = sim.tick;
      sim.events.push({ key: 'lasiusKill', x: a.x, y: a.y });
    }
    return true;
  }
  if (r < pDie + pKill) {
    // Killed: a small insect on the ground, food to the harvesters.
    const x = Math.round(c.x);
    const y = cz.top(sim, x);
    const i = y * w.w + x;
    if (w.mat[i] === EMPTY && !w.plan[i]) {
      w.set(i, PREY, 20 + rng.int(0, 25), 0);
      w.wake(i);
    }
    cz.lasiusDead++;
    sim.noteYearly('lasiusCaught', { x, y });
    return false;
  }
  // She lets go and runs for the trunk.
  c.state = 2;
  return true;
}
