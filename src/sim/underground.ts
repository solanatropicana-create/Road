import type { Sim } from './sim';
import type { Critter, Critters } from './critters';
import type { Brood } from './brood';
import { EMPTY, SAND, SOIL, ROOT, WATER, SEED, REFUSE, PREY } from '../world/mat';
import { PACKED } from '../world/physics';
import { F, FAR } from './fields';
import { TICK_HZ, DAY_TICKS } from '../config';
import { clamp } from '../util/math';

/**
 * Enemies that come through the soil, not over it:
 *   thief       – a raiding party of Solenopsis fugax, the thief ant: 2 mm
 *                 yellow workers that live in the walls of bigger ants' nests
 *                 and dig hair-thin galleries into their brood chambers, too
 *                 narrow for the hosts to follow. They carry off eggs and
 *                 small larvae until the workers find the breach and plug it.
 *   centipede   – Lithobius, 25 mm, fast and flat: hunts by night in cracks
 *                 and under stones, and slips into the nest's tunnels after
 *                 lone ants and brood. A crowd of workers drives it off.
 *   molecricket – Gryllotalpa, 40 mm, the mole cricket: digs wide galleries a
 *                 few centimetres down in damp loam at night, eating roots and
 *                 grubs. When it breaks into the nest it eats brood and leaves
 *                 a spill of loose soil, until the workers swarm it.
 * Each is one Critter; `body` holds the cells of its gallery (thief, mole
 * cricket) or the trail of its body (centipede), head first.
 */

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

/** An open cell of the nest. */
function nestOpen(sim: Sim, i: number): boolean {
  const w = sim.world;
  return w.plan[i] === 1 && w.bg[i] === 1 && w.mat[i] === EMPTY;
}

/** Soil a burrower can dig: not stone or wood, not the nest's planned rooms, not water. */
function diggable(sim: Sim, i: number): boolean {
  const w = sim.world;
  const m = w.mat[i]!;
  return (SOIL[m] === 1 || m === ROOT || m === SAND || m === SEED || m === REFUSE || m === PREY) && !w.plan[i] && w.bg[i] === 1;
}

function carve(sim: Sim, i: number): void {
  const w = sim.world;
  if (w.mat[i] === EMPTY) return;
  w.set(i, EMPTY, w.tone[i], w.tint[i] || w.mat[i]);
}

/** The workers wall a breach off: the gallery's last cells by the nest are packed with soil. */
function plug(sim: Sim, cells: number[], n: number): void {
  const w = sim.world;
  let done = 0;
  for (const i of cells) {
    if (done >= n) break;
    if (w.plan[i] || w.mat[i] !== EMPTY) continue;
    w.set(i, SAND, 90 + ((i * 37) % 80), (w.tint[i]! & 0x3f) | PACKED);
    done++;
  }
}

/** Wall off a wide gallery: discs of packed soil along its first cells. */
function plugRound(sim: Sim, centres: number[], r: number): void {
  const w = sim.world;
  for (const c of centres) {
    const cx = c % w.w;
    const cy = (c / w.w) | 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const i = (cy + dy) * w.w + cx + dx;
        if (w.plan[i] || w.mat[i] !== EMPTY || w.bg[i] !== 1) continue;
        w.set(i, SAND, 90 + ((i * 37) % 80), (w.tint[i]! & 0x3f) | PACKED);
      }
    }
  }
}

/** Alarm the workers right by an intruder (the scent then spreads ant to ant). */
function raiseAlarm(sim: Sim, x: number, y: number, r: number): number {
  let n = 0;
  for (const a of sim.colony.ants) {
    if (a.away || Math.abs(a.x - x) > r || Math.abs(a.y - y) > r) continue;
    a.alarm = Math.max(a.alarm, TICK_HZ * 14);
    n++;
  }
  return n;
}

/** Alarmed workers crowding an intruder (majors count double). */
function crowd(sim: Sim, x: number, y: number, r: number): number {
  let n = 0;
  for (const a of sim.colony.ants) {
    if (a.away || a.paralysed || a.alarm <= 0 || Math.abs(a.x - x) > r || Math.abs(a.y - y) > r) continue;
    n += a.caste === 'soldier' ? 2 : 1;
  }
  return n;
}

/** Brood lying near a point (not being carried), nearest first: eggs and young larvae if `small`. */
function broodNear(sim: Sim, x: number, y: number, r: number, small: boolean): Brood | null {
  let best: Brood | null = null;
  let bd = Infinity;
  for (const b of sim.colony.brood) {
    if (b.carried || b.sex || (small && (b.stage === 2 || b.fed > 1))) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < r && d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

// ------------------------------------------------------------------ spawning

/** Checked with the other animals a few times an in-game hour. */
export function spawnUnderground(sim: Sim, cr: Critters): void {
  const nest = sim.nest;
  const col = sim.colony;
  const rng = sim.rng;
  const w = sim.world;
  if (!nest.founded || sim.dormant) return;
  const doy = sim.doy;
  const air = sim.cal.airMean(doy);
  const night = sim.cal.daylight(sim.dayT, doy) < 0.15;
  // Thief ants: warm months, a colony worth robbing (brood in a nursery).
  const nursery = nest.chambers.filter((c) => c.kind === 'nursery' && c.ready);
  if (nursery.length && col.adults >= 40 && col.brood.length >= 10 && air > 12 && doy > 120 && doy < 280 && cr.count('thief') === 0 && rng.chance(0.0045)) {
    const room = nursery[rng.int(0, nursery.length - 1)]!;
    const side = rng.chance(0.5) ? 1 : -1;
    for (let tries = 0; tries < 12; tries++) {
      const x = clamp(Math.round(room.cx + side * rng.int(90, 170)), 6, w.w - 7);
      const y = clamp(Math.round(room.floorY + rng.int(-25, 30)), w.ground[x]! + 12, w.h - 12);
      const i = y * w.w + x;
      if (!diggable(sim, i)) continue;
      carve(sim, i);
      cr.add({ kind: 'thief', x, y, dir: -side, state: 0, body: [i], life: DAY_TICKS * 2, timer: 0, px: room.cx, pr: room.floorY - 2, tone: 0 });
      break;
    }
  }
  // A centipede at night, in from the meadow.
  if (night && air > 8 && !sim.raining && col.adults >= 25 && cr.count('centipede') === 0 && rng.chance(0.02)) {
    const gate = nest.gateNear(nest.foundX);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = clamp(gate + side * rng.int(70, 140), 4, w.w - 5);
    const y = cr.top(sim, x);
    cr.add({ kind: 'centipede', x, y, dir: -side, state: 0, body: new Array(26).fill(y * w.w + x), life: DAY_TICKS / 3, timer: 0, tone: rng.int(0, 255) });
  }
  // A mole cricket in damp loam, spring to late summer, at night.
  const loamy = sim.site === 'pannonian' || sim.site === 'vineyard' || sim.site === 'pontic' || sim.site === 'anatolia';
  if (loamy && night && doy > 100 && doy < 250 && air > 10 && col.adults >= 30 && cr.count('molecricket') === 0 && rng.chance(0.012)) {
    const left = rng.chance(0.5);
    const x = left ? 4 : w.w - 5;
    const y = w.ground[x]! + rng.int(45, 120);
    const i = y * w.w + x;
    if (diggable(sim, i)) {
      // Heading in across the slice, wandering, toward the nest more often than not.
      const tx = rng.chance(0.65) ? nest.foundX + rng.int(-60, 60) : rng.int(100, w.w - 100);
      cr.add({ kind: 'molecricket', x, y, dir: left ? 1 : -1, vx: left ? 1 : -1, vy: 0, state: 0, body: [i], life: DAY_TICKS * 0.7, timer: 0, px: tx, tone: rng.int(0, 255) });
    }
  }
}

// ------------------------------------------------------------------ thief ants

/** States: 0 digging toward the nursery, 1 raiding through the breach, 2 going home with loot, 3 shut out. */
export function thief(sim: Sim, c: Critter): boolean {
  const w = sim.world;
  const rng = sim.rng;
  const col = sim.colony;
  const gal = c.body;
  if (c.state === 0) {
    if (--c.life <= 0) c.state = 3;
    // A worker's pace for these tiny ants: a millimetre every second or so.
    if (c.t % 34 !== 0) return true;
    const head = gal[gal.length - 1]!;
    const hx = head % w.w;
    const hy = (head / w.w) | 0;
    // Broken through? (An open nest cell right beside the gallery's end.)
    for (const [dx, dy] of N8) {
      const n = head + dy * w.w + dx;
      if (nestOpen(sim, n)) {
        c.state = 1;
        c.timer = TICK_HZ * 4;
        c.x = hx;
        c.y = hy;
        sim.noteYearly('thiefBreach', { x: hx, y: hy });
        return true;
      }
    }
    // Dig on toward the brood, a little crooked.
    const tx = c.px ?? hx;
    const ty = c.pr ?? hy;
    let best = -1;
    let bs = Infinity;
    for (const [dx, dy] of N8) {
      const n = head + dy * w.w + dx;
      if (!diggable(sim, n) && !nestOpen(sim, n)) continue;
      const s = Math.hypot(hx + dx - tx, hy + dy - ty) + rng.next() * 2.2 + (dx !== 0 && dy !== 0 ? 0.3 : 0);
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    if (best < 0) {
      // Rock or roots in the way: they give up this attempt.
      c.state = 3;
      return true;
    }
    carve(sim, best);
    gal.push(best);
    c.x = best % w.w;
    c.y = (best / w.w) | 0;
    return true;
  }
  if (c.state === 1) {
    // At the breach: the workers smell them and come. It takes a while for
    // enough of them to find the hole and pack it with soil; meanwhile the
    // thieves keep carrying brood off.
    raiseAlarm(sim, c.x, c.y, 4);
    if (crowd(sim, c.x, c.y, 4) >= 3) c.peck++;
    if (c.peck > TICK_HZ * 9) {
      plug(sim, [...gal].reverse(), 4);
      c.state = 3;
      sim.noteYearly('thiefPlugged', { x: c.x, y: c.y });
      return true;
    }
    if (--c.timer > 0) return true;
    c.timer = TICK_HZ * rng.int(5, 10);
    const b = broodNear(sim, c.x, c.y, 45, true);
    if (!b) {
      c.state = c.tone > 0 ? 2 : 3;
      return true;
    }
    // One more egg or larva gone down the gallery.
    col.takeBrood(b, 'brood stolen by thief ants');
    c.tone++;
    sim.noteYearly('thiefStole', { x: c.x, y: c.y });
    if (c.tone >= 8) c.state = 2;
    return true;
  }
  // Going home along the gallery (the drawing follows them); the gallery stays.
  if (c.t % 6 !== 0) return true;
  if (c.timer > -gal.length) {
    c.timer = Math.min(c.timer, 0) - 1;
    const i = gal[Math.max(0, gal.length - 1 + c.timer)]!;
    c.x = i % w.w;
    c.y = (i / w.w) | 0;
    return true;
  }
  // Out of the slice: the plug, if any, stays; a raid that got loot may come back another week.
  return false;
}

// ------------------------------------------------------------------ centipede

/** States: 0 coming over the ground to the gate, 1 hunting in the tunnels, 2 leaving. */
export function centipede(sim: Sim, c: Critter, cr: Critters): boolean {
  const w = sim.world;
  const rng = sim.rng;
  const col = sim.colony;
  const fields = sim.fields;
  const speed = c.state === 2 ? 0.75 : 0.55;
  c.vx += speed;
  let moved = false;
  while (c.vx >= 1) {
    c.vx -= 1;
    const i = Math.round(c.y) * w.w + Math.round(c.x);
    let next = -1;
    if (c.state === 0) {
      // Over the ground to the nearest gate, then in.
      const g = sim.nest.gateNear(c.x);
      if (Math.abs(c.x - g) <= 2) c.state = 1;
      else {
        const nx = Math.round(c.x + Math.sign(g - c.x));
        next = cr.top(sim, nx) * w.w + nx;
      }
    }
    if (c.state === 1 || c.state === 2) {
      // Down whichever scent leads to brood (or, leaving, up to the gate).
      const f = c.state === 2 ? F.Entr : fields.sourceCount[F.Larva]! > 0 ? F.Larva : fields.sourceCount[F.Nurse]! > 0 ? F.Nurse : F.Royal;
      const dist = fields.dist[f]!;
      let bd = dist[i]!;
      for (let k = 0; k < 8; k++) {
        if (!fields.canStep(i, k)) continue;
        const n = i + fields.off[k]!;
        const d = dist[n]! + rng.next() * 1.5;
        if (d < bd) {
          bd = d;
          next = n;
        }
      }
      if (c.state === 2 && (dist[i]! <= 2 || dist[i] === FAR)) {
        // Out at the gate: away over the ground, gone.
        return false;
      }
    }
    if (next < 0) {
      if (c.state === 2) return false;
      if (c.state === 1 && rng.chance(0.02)) c.state = 2;
      break;
    }
    const nx = next % w.w;
    c.dir = nx > c.x ? 1 : nx < c.x ? -1 : c.dir;
    c.x = nx;
    c.y = (next / w.w) | 0;
    c.body.pop();
    c.body.unshift(next);
    moved = true;
  }
  if (!moved && c.t % 3 === 0) {
    c.body.pop();
    c.body.unshift(c.body[0]!);
  }
  if (--c.life <= 0 && c.state !== 2) c.state = 2;
  if (c.state !== 1) return true;
  // In the nest: the ants it brushes past raise the alarm, and it spreads;
  // a crowd drives it off, a big crowd kills it.
  if (c.t % 10 === 0) {
    raiseAlarm(sim, c.x, c.y, 2);
    const n = crowd(sim, c.x, c.y, 5);
    if (n >= 7 && rng.chance(0.25)) {
      sim.noteYearly('centipedeKilled', c);
      // Cut up and eaten: a feast for the larvae.
      col.reserve += 8;
      return false;
    }
    if (n >= 4) {
      c.state = 2;
      sim.noteYearly('centipedeDriven', c);
      return true;
    }
  }
  if (c.timer > 0) {
    c.timer--;
    return true;
  }
  // A bite: a lone worker beside it, or brood on the floor.
  for (const a of col.ants) {
    if (a.away || a.caste === 'queen' || Math.abs(a.x - c.x) > 2 || Math.abs(a.y - c.y) > 2) continue;
    if (crowd(sim, c.x, c.y, 5) > 2) break;
    col.kill(a, 'killed by a centipede', 'none');
    sim.noteYearly('centipede', c);
    c.timer = TICK_HZ * 20;
    // Two meals and it has had enough.
    if (++c.peck >= 2) c.state = 2;
    return true;
  }
  const b = broodNear(sim, c.x, c.y, 4, false);
  if (b) {
    col.takeBrood(b, 'brood eaten by a centipede');
    sim.noteYearly('centipede', c);
    c.timer = TICK_HZ * 15;
  }
  return true;
}

// ------------------------------------------------------------------ mole cricket

/** States: 0 digging, 1 broken into the nest (eating, being swarmed). */
export function moleCricket(sim: Sim, c: Critter): boolean {
  const w = sim.world;
  const rng = sim.rng;
  const col = sim.colony;
  const leaving = --c.life <= 0;
  if (c.state === 1) {
    const n = raiseAlarm(sim, c.x, c.y, 10);
    const crowded = crowd(sim, c.x, c.y, 10);
    if (c.t % TICK_HZ === 0) {
      const b = broodNear(sim, c.x, c.y, 14, false);
      if (b && rng.chance(0.35)) col.takeBrood(b, 'brood eaten by a mole cricket');
    }
    if ((n > 0 && crowded >= 6) || --c.timer <= 0) {
      // Stung all over, it backs off and digs away; the workers wall off its gallery.
      c.state = 0;
      c.vx = -c.vx;
      c.vy = -c.vy + rng.range(-0.4, 0.4);
      c.dir = c.vx >= 0 ? 1 : -1;
      const back = c.body[Math.min(12, c.body.length - 1)]!;
      plugRound(sim, c.body.slice(0, 6), 3);
      c.x = back % w.w;
      c.y = (back / w.w) | 0;
      c.body.length = 0;
      c.body.push(back);
      if (crowded >= 6) sim.noteYearly('moleDriven', c);
      c.life = Math.min(c.life, DAY_TICKS / 8);
    }
    return true;
  }
  // Digging: about 3 mm a second; a gallery as wide as its body.
  if (c.t % 10 !== 0) return true;
  const hx = Math.round(c.x);
  const hy = Math.round(c.y);
  const depth = hy - w.ground[clamp(hx, 0, w.w - 1)]!;
  const tx = c.px ?? hx;
  c.vx = clamp(c.vx + rng.range(-0.25, 0.25) + (leaving ? 0 : Math.sign(tx - hx) * 0.06), -1, 1);
  c.vy = clamp(c.vy + rng.range(-0.25, 0.25) + (depth > 130 ? -0.12 : depth < 35 ? 0.12 : 0), -0.7, 0.7);
  const m = Math.hypot(c.vx, c.vy) || 1;
  const nx = hx + Math.round(c.vx / m);
  const ny = hy + Math.round(c.vy / m);
  if (nx < 3 || nx > w.w - 4) return false;
  if (ny < w.ground[nx]! + 8 || ny > w.h - 8) {
    c.vy = -c.vy;
    return true;
  }
  // Breaking into the nest?
  let breach = -1;
  for (let dy = -3; dy <= 3 && breach < 0; dy++) for (let dx = -3; dx <= 3; dx++) if (nestOpen(sim, (ny + dy) * w.w + nx + dx)) { breach = (ny + dy) * w.w + nx + dx; break; }
  if (breach >= 0 && !leaving) {
    // Soil caves into the room where it burst through; the colony will have to clear it.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = (ny + dy) * w.w + nx + dx;
        if (w.mat[i] !== EMPTY && diggable(sim, i)) {
          w.set(i, SAND, w.tone[i], w.tint[i] || w.mat[i]);
          w.claimed.push(i);
        }
      }
    }
    c.x = nx;
    c.y = ny;
    c.state = 1;
    c.timer = TICK_HZ * 40;
    sim.noteYearly('moleBreach', { x: nx, y: ny });
    return true;
  }
  // Carve a round gallery about 7 mm across; stones turn it aside.
  const r = 3;
  let blocked = false;
  for (let dy = -r; dy <= r && !blocked; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const i = (ny + dy) * w.w + nx + dx;
      const mm = w.mat[i]!;
      if (mm === EMPTY || mm === WATER) continue;
      if (!diggable(sim, i) && !w.plan[i]) {
        blocked = true;
        break;
      }
    }
  }
  if (blocked) {
    c.vx = -c.vx + rng.range(-0.5, 0.5);
    c.vy = -c.vy + rng.range(-0.5, 0.5);
    return true;
  }
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const i = (ny + dy) * w.w + nx + dx;
      if (diggable(sim, i)) carve(sim, i);
    }
  }
  c.dir = nx > hx ? 1 : nx < hx ? -1 : c.dir;
  c.x = nx;
  c.y = ny;
  c.body.unshift(ny * w.w + nx);
  if (c.body.length > 60) c.body.length = 60;
  return true;
}

/** An intruder in the nest close to (x, y), for the workers to turn out against. */
export function intruderNear(list: Critter[], x: number, y: number, r: number): Critter | null {
  for (const c of list) {
    const live = (c.kind === 'thief' && c.state === 1) || (c.kind === 'centipede' && c.state === 1) || (c.kind === 'molecricket' && c.state === 1);
    if (live && Math.abs(c.x - x) <= r && Math.abs(c.y - y) <= r) return c;
  }
  return null;
}
