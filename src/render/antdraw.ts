import type { Ant } from '../sim/ant';
import type { Brood, Corpse } from '../sim/brood';
import type { World } from '../world/world';
import { Carry, Task } from '../sim/types';
import { SOLID } from '../world/mat';
import { PAL, RGB, hex, mixRGB, sampleRamp, seedLook, preyColor, fruitColor } from './palette';

/**
 * Ants are the subject of the shot, so unlike the soil they are drawn at the
 * screen's full resolution: articulated bodies with a tripod gait, antennae
 * and mandibles, gliding between cells and turning onto walls and ceilings.
 * Units are millimetres (= cells). Local frame: +x forward, +y toward the
 * surface the ant grips, feet at y = 0.
 */

interface Vis {
  x: number;
  y: number;
  /** Direction the legs point (radians), eased. */
  down: number;
  /** +1 / -1 facing along the surface: cos(yaw), so it passes through 0 when turning around. */
  face: number;
  /**
   * Turning around is a yaw about the axis through the legs, eased: 0 faces
   * +x, π faces -x, and halfway the ant looks into the glass or away from it.
   */
  yaw: number;
  /** Which way the current turn swings the head: +1 toward the viewer, -1 away. */
  turn: number;
  /** The facing (+1 / -1) the ant has settled on along the surface it grips. */
  heads: number;
  /** The other facing its latest steps point to (0: none), how far it has gone that way, and for how long (sim seconds). */
  want: number;
  wantGo: number;
  wantT: number;
  /** On the bare glass last frame (facing taken from the path, not the surface). */
  glass: boolean;
  /** Recent travel direction (for ants on the glass with nothing to grip). */
  dx: number;
  dy: number;
  tx: number;
  ty: number;
  gait: number;
  /** Seconds standing still (idle ants groom). */
  still: number;
}

interface Body {
  scale: number;
  head: [number, number, number, number]; // cx, cy, rx, ry
  thorax: [number, number, number, number, number]; // + tilt
  gaster: [number, number, number, number, number];
  nodes: [number, number, number][];
  hips: number[]; // x of front, mid, hind coxae
  feet: number[]; // resting foot x of front, mid, hind
  hipY: number;
  mouth: [number, number];
  antenna: [number, number];
  stride: number;
  headCol: RGB;
  /** Half-widths side to side (head, thorax, gaster), seen only while the ant turns. */
  width: [number, number, number];
  /** How far the legs reach out to the sides. */
  span: number;
}

const WORKER: Body = {
  scale: 1,
  head: [2.3, -1.4, 0.82, 0.68],
  thorax: [0.78, -1.35, 1.05, 0.5, -0.14],
  gaster: [-2.25, -1.3, 1.35, 0.95, 0.12],
  nodes: [[-0.32, -1.3, 0.3], [-0.86, -1.22, 0.34]],
  hips: [1.25, 0.8, 0.35],
  feet: [2.15, 0.75, -0.75],
  hipY: -1.0,
  mouth: [3.35, -0.95],
  antenna: [2.6, -1.95],
  stride: 1.1,
  headCol: hex('#1a120e'),
  width: [0.8, 0.5, 0.95],
  span: 1,
};

const MAJOR: Body = {
  scale: 1.22,
  head: [2.45, -1.5, 1.12, 0.92],
  thorax: [0.62, -1.3, 1.0, 0.5, -0.12],
  gaster: [-2.15, -1.25, 1.3, 0.92, 0.12],
  nodes: [[-0.42, -1.25, 0.29], [-0.9, -1.18, 0.32]],
  hips: [1.1, 0.68, 0.25],
  feet: [2.0, 0.65, -0.8],
  hipY: -0.98,
  mouth: [3.75, -0.95],
  antenna: [2.9, -2.2],
  stride: 1.05,
  headCol: hex('#4a1f13'),
  // A major's head is as broad as it is long.
  width: [1.1, 0.5, 0.92],
  span: 1.05,
};

const QUEEN: Body = {
  scale: 1.0,
  head: [3.7, -1.9, 0.95, 0.85],
  thorax: [1.75, -1.95, 1.6, 0.9, -0.1],
  gaster: [-2.6, -1.85, 2.75, 1.5, 0.05],
  nodes: [[0.05, -1.65, 0.38], [-0.55, -1.6, 0.42]],
  hips: [2.5, 1.85, 1.2],
  feet: [3.5, 1.8, -0.3],
  hipY: -1.25,
  mouth: [4.85, -1.35],
  antenna: [4.05, -2.6],
  stride: 1.4,
  headCol: hex('#1c130f'),
  width: [0.95, 0.85, 1.45],
  span: 1.35,
};

/** A winged male: small head with big eyes, a deep thorax for the flight muscles, a slim gaster. */
const MALE: Body = {
  scale: 0.95,
  head: [2.55, -1.75, 0.62, 0.55],
  thorax: [1.0, -1.65, 1.35, 0.78, -0.12],
  gaster: [-2.3, -1.45, 1.55, 0.7, 0.1],
  nodes: [[-0.45, -1.4, 0.26], [-0.95, -1.35, 0.28]],
  hips: [1.6, 1.1, 0.6],
  feet: [2.5, 1.0, -0.6],
  hipY: -1.05,
  mouth: [3.15, -1.45],
  antenna: [2.85, -2.2],
  stride: 1.15,
  headCol: hex('#0f0b0a'),
  width: [0.65, 0.7, 0.7],
  span: 1.1,
};

/** The drawing body for a caste. */
const bodyOf = (caste: string): Body => (caste === 'queen' || caste === 'gyne' ? QUEEN : caste === 'soldier' ? MAJOR : caste === 'male' ? MALE : WORKER);

const BODY_COL = hex('#261a12');
/**
 * The neighbours' workers are the same species and look the same; a faint
 * reddish cast lets the eye follow who is whose (a concession to the viewer).
 */
const RIVAL_COL = hex('#3c1d12');
const SHEEN_COL = hex('#c09a78');
const LEG_COL = hex('#30221a');
const DEAD_COL = hex('#2c241f');

type Light = (x: number, y: number) => RGB;

/** Side profiles, in units of each part's half-length and half-height, front at +x. */
const THORAX_PTS = [
  [1.0, 0.3], [0.8, -0.75], [0.35, -1.0], [-0.1, -0.75], [-0.35, -0.42], [-0.62, -0.6],
  [-0.98, -0.95], [-0.92, 0.05], [-0.7, 0.8], [0.55, 0.9],
] as const;
const HEAD_PTS = [
  [1.0, -0.15], [0.75, -0.9], [-0.3, -1.0], [-0.95, -0.55], [-0.9, 0.5], [-0.2, 0.95], [0.75, 0.75],
] as const;
const GASTER_PTS = [
  [1.0, -0.05], [0.65, -0.85], [-0.2, -1.0], [-0.85, -0.7], [-1.0, 0.05], [-0.75, 0.75], [0.0, 1.0], [0.7, 0.7],
] as const;
const NODE_PTS = [
  [1.0, 0.6], [0.6, -0.6], [0.0, -1.0], [-0.6, -0.6], [-1.0, 0.6], [0.0, 0.9],
] as const;

/** Add a closed curve through the midpoints of a polygon (rounded corners). */
function addSmooth(path: Path2D, pts: readonly (readonly [number, number])[], cx: number, cy: number, rx: number, ry: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (k: number): [number, number] => {
    const p = pts[(k + pts.length) % pts.length]!;
    const x = p[0] * rx;
    const y = p[1] * ry;
    return [cx + x * c - y * s, cy + x * s + y * c];
  };
  const a = P(0);
  const b = P(1);
  path.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let k = 1; k <= pts.length; k++) {
    const p = P(k);
    const q = P(k + 1);
    path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  path.closePath();
}

/** A profile pulled toward the circle through the same angles (an ellipse once scaled), by m from 0 to 1. */
function rounded(pts: readonly (readonly [number, number])[], m: number): [number, number][] {
  return pts.map(([x, y]) => {
    const r = Math.hypot(x, y) || 1;
    return [x + (x / r - x) * m, y + (y / r - y) * m];
  });
}

function addEllipse(path: Path2D, cx: number, cy: number, rx: number, ry: number, rot: number): void {
  path.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  path.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  path.closePath();
}

interface Shapes {
  body: Path2D;
  /** The body in the "C" posture: gaster curled forward under the waist. */
  bodyC: Path2D;
  head: Path2D;
  sheen: Path2D;
  eye: Path2D;
  jaw: Path2D;
  beard: Path2D;
  wings: Path2D;
  shadow: Path2D;
  wallShadow: Path2D;
}

/** The static parts of each caste's outline, built once (only legs and antennae move). */
const SHAPES = new Map<Body, Shapes>();
function shapes(b: Body): Shapes {
  let S = SHAPES.get(b);
  if (S) return S;
  const body = new Path2D();
  const sheen = new Path2D();
  const [gx, gy, grx, gry, grot] = b.gaster;
  const [tx, ty, trx, tr_y, trot] = b.thorax;
  const [hx, hy, hrx, hry] = b.head;
  addSmooth(body, GASTER_PTS, gx, gy, grx, gry, grot);
  addEllipse(sheen, gx + grx * 0.05, gy - gry * 0.58, grx * 0.55, gry * 0.14, grot);
  for (const [nx, ny, nr] of b.nodes) {
    addSmooth(body, NODE_PTS, nx, ny, nr, nr * 1.15, 0);
    addEllipse(sheen, nx, ny - nr * 0.65, nr * 0.55, nr * 0.16, 0);
  }
  addSmooth(body, THORAX_PTS, tx, ty, trx, tr_y, trot);
  addEllipse(sheen, tx + trx * 0.05, ty - tr_y * 0.58, trx * 0.55, tr_y * 0.14, trot);
  // C posture: the gaster swings down and forward about the waist.
  const bodyC = new Path2D();
  const [px, py] = b.nodes[b.nodes.length - 1]!;
  const a = -1.35;
  const rx = gx - px;
  const ry = gy - py;
  addSmooth(bodyC, GASTER_PTS, px + rx * Math.cos(a) - ry * Math.sin(a), py + rx * Math.sin(a) + ry * Math.cos(a), grx, gry, grot + a);
  for (const [nx, ny, nr] of b.nodes) addSmooth(bodyC, NODE_PTS, nx, ny, nr, nr * 1.15, 0);
  addSmooth(bodyC, THORAX_PTS, tx, ty, trx, tr_y, trot);
  const head = new Path2D();
  addSmooth(head, HEAD_PTS, hx, hy, hrx, hry, 0.12);
  addEllipse(sheen, hx + hrx * 0.05, hy - hry * 0.58, hrx * 0.55, hry * 0.14, 0.12);
  const eye = new Path2D();
  addEllipse(eye, hx + hrx * 0.25, hy - hry * 0.2, 0.17, 0.14, 0);
  const jaw = new Path2D();
  jaw.moveTo(hx + hrx * 0.7, hy + hry * 0.25);
  jaw.lineTo(b.mouth[0] + 0.15, b.mouth[1] + 0.05);
  jaw.lineTo(hx + hrx * 0.55, hy + hry * 0.7);
  jaw.closePath();
  const beard = new Path2D();
  for (let k = 0; k < 4; k++) {
    const x = hx - hrx * 0.4 + k * hrx * 0.28;
    const y = hy + hry * 0.85;
    beard.moveTo(x, y);
    beard.quadraticCurveTo(x + 0.05, y + 0.3, x + 0.25, y + 0.42);
  }
  const wings = new Path2D();
  addEllipse(wings, -2.0, -3.2, 4.6, 0.95, 0.1);
  addEllipse(wings, -1.4, -2.75, 3.6, 0.7, 0.16);
  const shadow = new Path2D();
  addEllipse(shadow, 0, 0.05, 2.8 * (b === QUEEN ? 1.5 : 1), 0.3, 0);
  const wallShadow = new Path2D();
  addEllipse(wallShadow, tx - 0.4, ty + 0.55, 3.2 * (b === QUEEN ? 1.6 : 1), 1.0, 0);
  S = { body, bodyC, head, sheen, eye, jaw, beard, wings, shadow, wallShadow };
  SHAPES.set(b, S);
  return S;
}

const css = (c: RGB, l: RGB, a = 1): string =>
  `rgba(${Math.min(255, (c[0] * l[0]) | 0)},${Math.min(255, (c[1] * l[1]) | 0)},${Math.min(255, (c[2] * l[2]) | 0)},${a})`;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class AntPainter {
  private vis = new WeakMap<Ant, Vis>();
  /** The winged queen on her nuptial flight, before she picks a spot (world coordinates). */
  private flight = { x: 320, y: 40, face: 1 };
  /** World x the pointer is over while the player is choosing a landing spot. */
  flightGoal: number | null = null;
  private world: World;
  private time = 0;

  constructor(world: World) {
    this.world = world;
  }

  /** Is there something to grip at this cell (soil, stone, plant)? */
  private gripped(x: number, y: number): boolean {
    const w = this.world;
    const i = y * w.w + x;
    return (
      SOLID[w.mat[i + w.w]!] === 1 || SOLID[w.mat[i - w.w]!] === 1 || SOLID[w.mat[i + 1]!] === 1 || SOLID[w.mat[i - 1]!] === 1 ||
      w.plant[i] !== 0 || w.plant[i + 1] !== 0 || w.plant[i - 1] !== 0 || w.plant[i + w.w] !== 0
    );
  }

  /**
   * Ease each ant's drawn position and pose toward the sim's.
   * speed: sim seconds per real second (0 when paused).
   */
  update(ants: Ant[], dt: number, speed: number): void {
    this.time += dt;
    const nominal = 15 * Math.max(speed, 0.25);
    const kA = 1 - Math.exp(-dt * 16);
    // A turn takes about a fifth of a second at 1x, and keeps up (less than in proportion) when the sim runs faster.
    const fast = Math.sqrt(Math.max(1, speed));
    const kY = 1 - Math.exp(-dt * 11 * fast);
    for (const a of ants) {
      const tx = a.x + 0.5;
      const ty = a.y + 0.5;
      let v = this.vis.get(a);
      if (!v) {
        const flying = a.caste === 'queen' && a.wings;
        const face = a.hx * a.ly - a.hy * a.lx || 1;
        v = { x: flying ? this.flight.x : tx, y: flying ? this.flight.y : ty, down: Math.atan2(a.ly, a.lx), face, yaw: face > 0 ? 0 : Math.PI, turn: a.id & 1 ? 1 : -1, heads: face, want: 0, wantGo: 0, wantT: 0, glass: false, dx: a.hx, dy: a.hy, tx, ty, gait: Math.random() * 6, still: 0 };
        this.vis.set(a, v);
      }
      if (tx !== v.tx || ty !== v.ty) {
        const ddx = tx - v.tx;
        const ddy = ty - v.ty;
        const d = Math.hypot(ddx, ddy);
        if (d < 3) {
          v.dx += (ddx / d - v.dx) * 0.45;
          v.dy += (ddy / d - v.dy) * 0.45;
        }
        // (At high speed one frame covers several steps; only a long jump is a move out of the blue.)
        if (d < 20) {
          // How far the steps went along the surface the ant grips, in the sense of its facing
          // (nothing for a step straight onto or off it, which says nothing about which way it faces).
          const go = ddx * a.ly - ddy * a.lx;
          if (go * v.heads > 0) v.want = 0;
          else if (go !== 0) {
            if (v.want !== Math.sign(go)) {
              v.want = Math.sign(go);
              v.wantGo = 0;
              v.wantT = 0;
            }
            v.wantGo += Math.abs(go);
          }
        } else {
          v.heads = a.hx * a.ly - a.hy * a.lx || v.heads;
          v.want = 0;
        }
        v.tx = tx;
        v.ty = ty;
      }
      // A step or two back and forth (digging, jostling, picking a way over
      // crumbs) is not a turn; she turns around once she keeps going the other
      // way. Run faster, it takes more of that before she does, or the whole
      // colony spins on the spot.
      if (v.want !== 0) {
        v.wantT += dt * speed;
        if (v.wantGo >= 2 * fast || v.wantT > 0.3 * fast) {
          v.heads = v.want;
          v.want = 0;
        }
      }
      // Glide at walking pace, catching up faster if left behind.
      const ex = tx - v.x;
      const ey = ty - v.y;
      const dist = Math.hypot(ex, ey);
      // A queen still on the wing glides all the way down to where she lands.
      const landing = a.caste === 'queen' && a.wings;
      if (landing && dist > 0.05) {
        const step = Math.min(dist, Math.max(45 * dt, dist * (1 - Math.exp(-dt * 2.5))));
        v.x += (ex / dist) * step;
        v.y += (ey / dist) * step;
      } else if (dist > 6) {
        v.x = tx;
        v.y = ty;
      } else if (dist > 1e-3) {
        const step = Math.min(dist, Math.max(nominal * dt, dist * (1 - Math.exp(-dt * 6 * Math.max(1, speed)))));
        v.x += (ex / dist) * step;
        v.y += (ey / dist) * step;
        v.gait += (step / (a.caste === 'queen' ? QUEEN.stride : WORKER.stride)) * Math.PI;
      }
      v.still = dist > 0.05 || (a.timer > 0 && a.task === Task.Dig) ? 0 : v.still + dt;
      // Pose: legs toward whatever the ant grips; on the bare glass, belly
      // toward the floor of the frame with the body along its path.
      let down: number;
      let face: number;
      if (this.gripped(a.x, a.y)) {
        if (v.glass) {
          // Back on a surface: take up the sim's heading on it.
          v.heads = a.hx * a.ly - a.hy * a.lx || v.heads;
          v.want = 0;
          v.glass = false;
        }
        down = Math.atan2(a.ly, a.lx);
        face = v.heads;
      } else {
        v.glass = true;
        const m = Math.hypot(v.dx, v.dy);
        if (m > 0.2) {
          const fx = v.dx / m;
          const fy = v.dy / m;
          // Two bellies are possible; keep the one closer to the current pose.
          const d1 = Math.atan2(fx, -fy);
          const d2 = Math.atan2(-fx, fy);
          const pick1 = Math.abs(wrap(d1 - v.down)) < Math.abs(wrap(d2 - v.down)) + (Math.sin(d1) > Math.sin(d2) ? 0.6 : -0.6);
          down = pick1 ? d1 : d2;
          face = pick1 ? 1 : -1;
        } else {
          down = v.down;
          face = v.face >= 0 ? 1 : -1;
        }
      }
      v.down += wrap(down - v.down) * kA;
      const yaw = face > 0 ? 0 : Math.PI;
      // A fresh turn from rest swings the other way from the last one: toward the glass, then away.
      if (Math.abs(yaw - v.yaw) > Math.PI - 0.02) v.turn = -v.turn;
      v.yaw += (yaw - v.yaw) * kY;
      v.face = Math.cos(v.yaw);
    }
  }

  draw(ctx: CanvasRenderingContext2D, ants: Ant[], z: number, light: Light, view: { x0: number; y0: number; x1: number; y1: number }, selected: Ant | null): void {
    for (const a of ants) {
      const v = this.vis.get(a);
      if (!v) continue;
      if (v.x < view.x0 - 8 || v.x > view.x1 + 8 || v.y < view.y0 - 8 || v.y > view.y1 + 8) continue;
      const body = bodyOf(a.caste);
      const l = light(v.x, v.y);
      ctx.save();
      // Feet rest on the cell edge toward the surface.
      ctx.translate(v.x + Math.cos(v.down) * 0.5, v.y + Math.sin(v.down) * 0.5);
      ctx.rotate(v.down - Math.PI / 2);
      const c = Math.cos(v.yaw);
      const s = Math.sin(v.yaw) * v.turn;
      const flip = c < 0 ? -1 : 1;
      // Partway through a turn, close enough to see it, the ant yaws as a solid.
      // Far off or curled up it stays a side profile, narrowed but never to a sliver.
      const turning = Math.abs(s) > 0.03 && z * body.scale >= 1.6 && a.cpose === 0;
      const f = turning ? 1 : Math.abs(s) <= 0.03 ? flip : flip * Math.max(Math.abs(c), 0.4);
      ctx.scale(f * body.scale, body.scale);
      const busy = a.timer > 0 ? Math.sin(this.time * 18 + a.id) * 0.12 : 0;
      if (a === selected) {
        if (turning) {
          ctx.save();
          ctx.scale(flip * Math.max(Math.abs(c), 0.55), 1);
          this.marker(ctx, body, z);
          ctx.restore();
        } else this.marker(ctx, body, z);
      }
      const wall = this.world.bg[a.y * this.world.w + a.x] === 1;
      // Standing about for a while: groom, drawing a foreleg over the antennae.
      this.groom = v.still > 1.5 && a.carry === Carry.None && a.meet === 0 ? Math.sin(this.time * 7 + a.id) : null;
      this.meeting = a.meet > 0 || a.fight > 0;
      this.airborne = a.caste === 'queen' && a.wings && Math.hypot(a.x + 0.5 - v.x, a.y + 0.5 - v.y) > 1.5;
      if (turning) this.turning(ctx, a, body, v.gait, l, z, busy, wall, c, s);
      // Facing -x the near side is the other one, whose legs are half a stride out of phase.
      else this.ant(ctx, a, body, v.gait + (c < 0 ? Math.PI : 0), l, z, busy, false, wall);
      this.airborne = false;
      this.groom = null;
      this.meeting = false;
      ctx.restore();
    }
  }

  /** A pair of brackets around the followed ant, like a field-guide callout. */
  private marker(ctx: CanvasRenderingContext2D, b: Body, z: number): void {
    const x0 = b.gaster[0] - b.gaster[2] - 0.8;
    const x1 = b.mouth[0] + 0.8;
    const y0 = -3.2;
    const y1 = 0.6;
    ctx.strokeStyle = 'rgba(226,180,92,0.9)';
    ctx.lineWidth = 1.4 / z;
    const t = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0 + t, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x0 + t, y1);
    ctx.moveTo(x1 - t, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 - t, y1);
    ctx.stroke();
  }

  private ant(ctx: CanvasRenderingContext2D, a: Ant | null, b: Body, gait: number, l: RGB, z: number, busy: number, dead: boolean, wall = false): void {
    const S = shapes(b);
    const s = z * b.scale;
    const px = 1 / s;
    // Level of detail by on-screen size: full anatomy close up, a clean silhouette further out.
    const full = s >= 4;
    const mid = s >= 1.6;
    const legCol = dead ? DEAD_COL : LEG_COL;
    if (wall && full) {
      // In the nest the back wall is right behind the ant: a soft shadow lifts it off.
      ctx.fillStyle = 'rgba(8,4,2,0.3)';
      ctx.fill(S.wallShadow);
    }
    if (!dead && mid) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill(S.shadow);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Far-side legs first, darker and half a stride out of phase.
    if (full) this.legs(ctx, b, gait + Math.PI, mixRGB(legCol, [0, 0, 0], 0.45), l, px, dead);
    // Queen's wings lie over the back until she tears them off.
    if (a && a.wings && this.airborne) {
      this.beat(ctx, l, px);
    } else if (a && a.wings) {
      ctx.fillStyle = css([215, 222, 232], l, 0.32);
      ctx.fill(S.wings);
      if (full) {
        ctx.strokeStyle = css([120, 110, 100], l, 0.55);
        ctx.lineWidth = Math.max(px, 0.08);
        ctx.stroke(S.wings);
      }
    }
    // In the nest a black ant sits on dark soil: a stronger rim there keeps it off the wall.
    const strong = wall;
    const rim = full && !dead ? css(SHEEN_COL, l, strong ? 0.5 : 0.3) : '';
    // Curled into a "C" against a fly: body raised on the legs, gaster tucked under.
    const curled = !!a && a.cpose > 0;
    if (curled) ctx.translate(0, -0.9);
    const bodyPath = curled ? S.bodyC : S.body;
    ctx.fillStyle = css(dead ? DEAD_COL : a && a.rival ? RIVAL_COL : BODY_COL, l);
    ctx.fill(bodyPath);
    if (rim) {
      // Rim light: one screen pixel of warm edge so overlapping ants stay separate.
      ctx.strokeStyle = rim;
      ctx.lineWidth = strong ? px * 1.5 : px;
      ctx.stroke(bodyPath);
    }
    if (busy) ctx.translate(busy, 0);
    ctx.fillStyle = css(dead ? DEAD_COL : b.headCol, l);
    ctx.fill(S.head);
    if (rim) ctx.stroke(S.head);
    if (full) {
      ctx.fillStyle = css([90, 78, 66], l, 0.9);
      ctx.fill(S.eye);
      ctx.fillStyle = css(hex('#3d2516'), l);
      ctx.fill(S.jaw);
      if (s > 5 && !dead) {
        // Psammophore: the beard of long hairs under a harvester's head, for carrying sand.
        ctx.strokeStyle = css(hex('#8a6a50'), l, 0.45);
        ctx.lineWidth = px;
        ctx.stroke(S.beard);
      }
    }
    if (busy) ctx.translate(-busy, 0);
    if (full && !curled) {
      // A specular streak near the top edge of each segment, as on a glossy cuticle under a lamp.
      ctx.fillStyle = css(SHEEN_COL, l, dead ? 0.12 : strong ? 0.62 : 0.45);
      ctx.fill(S.sheen);
    }
    if (curled) ctx.translate(0, 0.9);
    if (mid) {
      this.legs(ctx, b, gait, legCol, l, px, dead);
      this.antenna(ctx, b, busy, legCol, l, px, a ? a.id : 0, dead);
    } else {
      // Far away: a hint of legs so the silhouette still reads as an ant.
      ctx.strokeStyle = css(legCol, l);
      ctx.lineWidth = px;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(b.hips[k]!, b.hipY);
        ctx.lineTo(b.feet[k]! + Math.sin(gait + k * Math.PI) * b.stride * 0.4, 0);
      }
      ctx.stroke();
    }
    if (a && a.carry !== Carry.None) this.load(ctx, a, b, busy, l);
  }

  /**
   * An ant partway through turning around. Seen through the glass a turn is a
   * yaw about the axis through the legs, so rather than squash the profile
   * flat like a paper cut-out, each segment is a solid with a length, height
   * and width: the body shortens toward an end-on view, the outlines round
   * off, and the legs and antennae of the two sides fan out left and right.
   * c and s are the yaw's cosine and sine (s signed by the way the turn goes):
   * a point x along the body and w out to the +1 side lands at x * c - w * s.
   */
  private turning(ctx: CanvasRenderingContext2D, a: Ant, b: Body, gait: number, l: RGB, z: number, busy: number, wall: boolean, c: number, s: number): void {
    const px = 1 / (z * b.scale);
    const full = z * b.scale >= 4;
    const ac = Math.abs(c);
    const flip = c < 0 ? -1 : 1;
    const big = b === QUEEN;
    const [gx, gy, grx, gry, grot] = b.gaster;
    const [tx, ty, trx, tr_y, trot] = b.thorax;
    const [hx, hy, hrx, hry] = b.head;
    const [hw, tw, gw] = b.width;
    if (wall && full) {
      ctx.fillStyle = 'rgba(8,4,2,0.3)';
      ctx.beginPath();
      ctx.ellipse((tx - 0.4) * c, ty + 0.55, Math.hypot(3.2 * (big ? 1.6 : 1) * c, 1.6 * b.span * s), 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0.05, Math.hypot(2.8 * (big ? 1.5 : 1) * c, 1.6 * b.span * s), 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Each segment sits at its centre's projection, as long as its length and width project, rounding off toward end-on.
    const round = 1 - ac;
    const part = (path: Path2D, shine: Path2D, pts: readonly (readonly [number, number])[], cx: number, cy: number, rx: number, ry: number, rot: number, w: number): void => {
      const sx = flip * Math.hypot(rx * c, w * s);
      addSmooth(path, round > 0.01 ? rounded(pts, round) : pts, cx * c, cy, sx, ry, rot * c);
      addEllipse(shine, (cx + rx * 0.05) * c, cy - ry * 0.58, Math.abs(sx) * 0.55, ry * 0.14, rot * c);
    };
    // Thorax, waist and gaster one by one, the furthest first, so a nearer segment hides the one behind and its gloss.
    const segs: { path: Path2D; shine: Path2D; depth: number }[] = [];
    const seg = (pts: readonly (readonly [number, number])[], cx: number, cy: number, rx: number, ry: number, rot: number, w: number): void => {
      const path = new Path2D();
      const shine = new Path2D();
      part(path, shine, pts, cx, cy, rx, ry, rot, w);
      segs.push({ path, shine, depth: cx * s });
    };
    seg(GASTER_PTS, gx, gy, grx, gry, grot, gw);
    for (const [nx, ny, nr] of b.nodes) seg(NODE_PTS, nx, ny, nr, nr * 1.15, 0, nr);
    seg(THORAX_PTS, tx, ty, trx, tr_y, trot, tw);
    segs.sort((p, q) => p.depth - q.depth);
    const body = new Path2D();
    for (const g of segs) body.addPath(g.path);
    const head = new Path2D();
    const headSheen = new Path2D();
    part(head, headSheen, HEAD_PTS, hx, hy, hrx, hry, 0.12, hw);
    const strong = wall;
    const rim = full ? css(SHEEN_COL, l, strong ? 0.5 : 0.3) : '';
    // The side toward the viewer (+1 while facing +x); the other darkens as it goes behind, and neither is behind end-on.
    const near = flip;
    const farCol = mixRGB(LEG_COL, [0, 0, 0], 0.45 * ac);
    const phase = (side: number): number => gait + (side === 1 ? 0 : Math.PI);
    // Looking away the head is behind the body; mostly side-on the near legs still cross in front of the head.
    const headFirst = s < -0.35;
    const nearLate = ac > 0.7;
    const feelers = (): void => {
      this.antenna(ctx, b, busy, farCol, l, px, a.id, false, c, s, -near);
      this.antenna(ctx, b, busy, LEG_COL, l, px, a.id, false, c, s, near);
    };
    const carried = (): void => {
      if (a.carry === Carry.None) return;
      ctx.save();
      ctx.translate(b.mouth[0] * c, 0);
      ctx.scale(flip * Math.max(ac, 0.55), 1);
      ctx.translate(-b.mouth[0], 0);
      this.load(ctx, a, b, busy, l);
      ctx.restore();
    };
    const face = (): void => {
      if (busy) ctx.translate(busy * c, 0);
      const jaws = (): void => {
        ctx.fillStyle = css(hex('#3d2516'), l);
        ctx.beginPath();
        for (const side of [-1, 1]) {
          ctx.moveTo((hx + hrx * 0.7) * c - side * 0.35 * s, hy + hry * 0.25);
          ctx.lineTo((b.mouth[0] + 0.15) * c - side * 0.1 * s, b.mouth[1] + 0.05);
          ctx.lineTo((hx + hrx * 0.55) * c - side * 0.3 * s, hy + hry * 0.7);
          ctx.closePath();
        }
        ctx.fill();
      };
      if (full && headFirst) jaws();
      ctx.fillStyle = css(b.headCol, l);
      ctx.fill(head);
      if (rim) {
        ctx.strokeStyle = rim;
        ctx.lineWidth = strong ? px * 1.5 : px;
        ctx.stroke(head);
      }
      if (full) {
        // An eye shows while its side of the head is toward the viewer: one side-on, both head-on.
        ctx.fillStyle = css([90, 78, 66], l, 0.9);
        for (const side of [-1, 1]) {
          const e = 0.3 * s + side * 0.9 * c;
          if (e <= 0.05) continue;
          ctx.beginPath();
          ctx.ellipse((hx + hrx * 0.25) * c - side * hw * 0.8 * s, hy - hry * 0.2, 0.17 * Math.min(1, 0.3 + 0.8 * e), 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!headFirst) jaws();
        ctx.fillStyle = css(SHEEN_COL, l, strong ? 0.62 : 0.45);
        ctx.fill(headSheen);
      }
      if (busy) ctx.translate(-busy * c, 0);
    };
    if (headFirst) {
      feelers();
      carried();
      face();
    }
    this.legs(ctx, b, phase(-near), farCol, l, px, false, c, s, -near);
    if (!nearLate) this.legs(ctx, b, phase(near), LEG_COL, l, px, false, c, s, near);
    if (a.wings && this.airborne) {
      this.beat(ctx, l, px);
    } else if (a.wings) {
      // Folded flat over the back: as wide as the body end-on.
      const wings = new Path2D();
      addEllipse(wings, -2.0 * c, -3.2, Math.hypot(4.6 * c, 1.1 * s), 0.95, 0.1 * c);
      addEllipse(wings, -1.4 * c, -2.75, Math.hypot(3.6 * c, 0.9 * s), 0.7, 0.16 * c);
      ctx.fillStyle = css([215, 222, 232], l, 0.32);
      ctx.fill(wings);
      if (full) {
        ctx.strokeStyle = css([120, 110, 100], l, 0.55);
        ctx.lineWidth = Math.max(px, 0.08);
        ctx.stroke(wings);
      }
    }
    // The rim: side-on each segment keeps its edge, as in the profile; end-on the
    // segments stack up behind one another and only the outline of the whole
    // keeps one (stroked under the fill, so just its outer half shows).
    const rimA = strong ? 0.5 : 0.3;
    const lw = strong ? px * 1.5 : px;
    if (full) {
      ctx.strokeStyle = css(SHEEN_COL, l, rimA * (1 - ac * ac));
      ctx.lineWidth = lw * 2;
      ctx.stroke(body);
    }
    const bodyCol = css(a.rival ? RIVAL_COL : BODY_COL, l);
    const gloss = css(SHEEN_COL, l, strong ? 0.62 : 0.45);
    for (const g of segs) {
      ctx.fillStyle = bodyCol;
      ctx.fill(g.path);
      if (full) {
        ctx.fillStyle = gloss;
        ctx.fill(g.shine);
      }
    }
    if (full) {
      ctx.strokeStyle = css(SHEEN_COL, l, rimA * ac * ac);
      ctx.lineWidth = lw;
      ctx.stroke(body);
    }
    if (!headFirst) face();
    if (nearLate) this.legs(ctx, b, phase(near), LEG_COL, l, px, false, c, s, near);
    if (!headFirst) {
      feelers();
      carried();
    }
  }

  /** Beating wings: two blurred sweeps at the ends of the stroke, and the wing itself. */
  private beat(ctx: CanvasRenderingContext2D, l: RGB, px: number): void {
    const t = this.time;
    const flap = Math.sin(t * 38);
    const base = [1.4, -2.7] as const;
    const wing = (ang: number, a: number): void => {
      ctx.save();
      ctx.translate(base[0], base[1]);
      ctx.rotate(ang);
      ctx.fillStyle = css([220, 226, 236], l, a);
      ctx.beginPath();
      ctx.ellipse(-4.2, 0, 4.4, 0.9, 0, 0, Math.PI * 2);
      ctx.ellipse(-3.2, 0.9, 3.3, 0.65, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    wing(-1.15, 0.1);
    wing(0.25, 0.1);
    wing(-0.45 + flap * 0.7, 0.42);
    ctx.lineWidth = px;
  }

  /**
   * Before the player chooses, the mated queen drifts over the meadow on her
   * nuptial flight, high and slow, in and out of the lens's focus.
   */
  /** During the landing sequence: where the queen is in the air, and the swarm around her. */
  flightOverride: { x: number; y: number; face: number } | null = null;
  swarm: { x: number; y: number; vx: number; caste: string; t: number }[] = [];

  drawFlight(ctx: CanvasRenderingContext2D, z: number, light: Light, worldW: number, dt: number): void {
    if (this.swarm.length) this.drawFlyers(ctx, this.swarm, z, light);
    const f = this.flight;
    const t = this.time;
    const o = this.flightOverride;
    if (o) {
      f.face += (o.face - f.face) * Math.min(1, dt * 4);
      f.x = o.x;
      f.y = o.y;
    }
    // She drifts over the meadow, or hovers over the spot the pointer is considering.
    if (!o) {
      const goal = this.flightGoal ?? worldW / 2 + Math.sin(t * 0.11) * worldW * 0.3;
      const nx = f.x + (goal + Math.sin(t * 0.37) * 14 - f.x) * Math.min(1, dt * 0.8);
      const ny = 38 + Math.sin(t * 0.29) * 10 + Math.sin(t * 1.3) * 1.5;
      const dx = nx - f.x;
      if (Math.abs(dx) > 0.01) f.face += ((dx > 0 ? 1 : -1) - f.face) * Math.min(1, dt * 3);
      f.x = nx;
      f.y = ny;
    }
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(-0.15 * Math.sign(f.face));
    ctx.scale(f.face, 1);
    this.airborne = true;
    const S = shapes(QUEEN);
    const l = light(f.x, f.y);
    this.beat(ctx, l, 1 / z);
    ctx.fillStyle = css(BODY_COL, l);
    ctx.fill(S.body);
    ctx.fill(S.head);
    this.legs(ctx, QUEEN, 0, LEG_COL, l, 1 / z, false);
    this.antenna(ctx, QUEEN, 0, LEG_COL, l, 1 / z, 7, false);
    this.airborne = false;
    ctx.restore();
  }

  /** Alates that have taken off on the nuptial flight, climbing away. */
  drawFlyers(ctx: CanvasRenderingContext2D, flyers: { x: number; y: number; vx: number; caste: string; t: number }[], z: number, light: Light): void {
    for (const f of flyers) {
      const b = bodyOf(f.caste);
      const S = shapes(b);
      const face = f.vx >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(-0.35 * face);
      ctx.scale(face * b.scale, b.scale);
      this.airborne = true;
      const l = light(f.x, Math.max(1, f.y));
      this.beat(ctx, l, 1 / z);
      ctx.fillStyle = css(BODY_COL, l);
      ctx.fill(S.body);
      ctx.fillStyle = css(b.headCol, l);
      ctx.fill(S.head);
      this.legs(ctx, b, 0, LEG_COL, l, 1 / z, false);
      this.airborne = false;
      ctx.restore();
    }
  }

  /** One side's three legs as a single stroked path (tripod gait). */
  /** The ant being drawn is in the air (wings beating, legs hanging). */
  private airborne = false;
  /** The ant being drawn is touching antennae with a nestmate. */
  private meeting = false;
  /** Grooming stroke (-1..1) for the ant being drawn, or null when it isn't grooming. */
  private groom: number | null = null;

  /**
   * c, s and side are for an ant partway through a turn (see turning()): the
   * legs of one side (+1 near when facing +x, -1 the other) reach out sideways,
   * so hips, knees and feet spread apart as the ant comes round.
   */
  private legs(ctx: CanvasRenderingContext2D, b: Body, gait: number, col: RGB, l: RGB, px: number, dead: boolean, c = 1, s = 0, side = 0): void {
    ctx.strokeStyle = css(col, l);
    ctx.lineWidth = Math.max(px, 0.22);
    ctx.beginPath();
    const w = side * b.span * s;
    for (let k = 0; k < 3; k++) {
      // Front and hind legs of one side swing with the middle leg of the other.
      const q = gait + (k === 1 ? Math.PI : 0);
      const hipX = b.hips[k]!;
      const hipY = b.hipY;
      let footX = b.feet[k]! + Math.sin(q) * b.stride * 0.5;
      let footY = -Math.max(0, Math.cos(q)) * 0.4;
      if (dead) {
        // Curled in against the belly.
        footX = hipX + (1 - k) * 0.35;
        footY = hipY + 0.3;
      } else if (this.airborne) {
        // In flight the legs hang loose beneath the body.
        footX = hipX - 0.6 + (k - 1) * 0.5;
        footY = hipY + 1.6;
      } else if (k === 0 && this.groom !== null) {
        // The foreleg comes up past the mandibles and strokes the antenna.
        footX = b.head[0] + b.head[2] * 0.6 + this.groom * 0.35;
        footY = b.head[1] - b.head[3] * 0.2 + this.groom * 0.25;
      }
      const kneeX = (hipX + footX) / 2 + (k === 2 ? -0.25 : 0.25);
      const kneeY = dead ? hipY + 0.85 : Math.min(hipY, footY) - 0.45;
      // Out to the side: the hip a little, the knee well out, the foot furthest (a groomed foreleg comes back in).
      const out = k === 0 && this.groom !== null ? 0.35 : this.airborne ? 0.7 : 1.5;
      ctx.moveTo(hipX * c - w * 0.3, hipY);
      ctx.lineTo(kneeX * c - w * 1.05, kneeY);
      ctx.lineTo(footX * c - w * out, footY);
    }
    ctx.stroke();
  }

  private antenna(ctx: CanvasRenderingContext2D, b: Body, hb: number, col: RGB, l: RGB, px: number, id: number, dead: boolean, c = 1, s = 0, side = 0): void {
    const [ax, ay] = b.antenna;
    const t = this.time;
    // Antennae never stop: they sweep and tap in a slow, irregular rhythm.
    // Meeting a nestmate: both antennae reach forward and drum quickly.
    const sway = dead ? 0.6 : this.meeting ? -0.3 + Math.sin(t * 26 + id) * 0.18 : Math.sin(t * 3.1 + id * 1.7) * 0.35 + Math.sin(t * 7.3 + id) * 0.12;
    const ex = ax + hb + 0.55;
    const ey = ay - 0.75;
    // Turning (see legs()): the pair splays apart, base to elbow to tip.
    const w = side * s;
    ctx.strokeStyle = css(col, l);
    ctx.lineWidth = Math.max(px, 0.16);
    ctx.beginPath();
    ctx.moveTo((ax + hb) * c - w * 0.3, ay);
    ctx.lineTo(ex * c - w * 0.6, ey);
    ctx.lineTo((ex + Math.cos(0.35 + sway) * 1.35) * c - w * 1.0, ey + Math.sin(0.35 + sway) * 1.35);
    ctx.stroke();
  }

  /** Whatever the ant holds in its mandibles. */
  private load(ctx: CanvasRenderingContext2D, a: Ant, b: Body, hb: number, l: RGB): void {
    const mx = b.mouth[0] + hb + 0.35;
    const my = b.mouth[1] + 0.1;
    const blob = (rx: number, ry: number, col: RGB, rot = 0, dx = 0): void => {
      ctx.fillStyle = css(col, l);
      ctx.beginPath();
      ctx.ellipse(mx + rx * 0.6 + dx, my, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (a.carry) {
      case Carry.Seed: {
        const look = seedLook(a.carryTone);
        blob(look.rx * 1.05, look.ry * 1.1, look.col, -0.3);
        ctx.fillStyle = css([255, 240, 200], l, 0.35);
        ctx.beginPath();
        ctx.ellipse(mx + look.rx * 0.5, my - look.ry * 0.4, look.rx * 0.4, look.ry * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case Carry.Soil: {
        // A pellet of crumbs packed in the jaws.
        const col = mixRGB(sampleRamp(PAL.loam, a.carryTone / 255), [230, 215, 190], 0.14);
        const t = a.carryTone;
        for (let k = 0; k < 5; k++) {
          const ang = k * 1.9 + t * 0.07;
          const r = k === 0 ? 0 : 0.28;
          ctx.fillStyle = css(mixRGB(col, k % 2 ? [40, 28, 20] : [250, 236, 210], 0.12), l);
          ctx.beginPath();
          ctx.ellipse(mx + 0.4 + Math.cos(ang) * r, my + Math.sin(ang) * r * 0.8, 0.3 - k * 0.02, 0.24, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case Carry.Fruit:
        blob(0.8, 0.75, fruitColor(a.carryTone));
        ctx.fillStyle = css([255, 245, 225], l, 0.4);
        ctx.beginPath();
        ctx.ellipse(mx + 0.3, my - 0.35, 0.3, 0.16, -0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case Carry.Prey: {
        // A leg segment or a shard of wing case, angular, with a glint.
        const col = preyColor(a.carryTone);
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.moveTo(mx - 0.1, my - 0.2);
        ctx.lineTo(mx + 1.5, my - 0.55);
        ctx.lineTo(mx + 1.8, my - 0.15);
        ctx.lineTo(mx + 0.9, my + 0.3);
        ctx.lineTo(mx + 0.1, my + 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = css([255, 245, 225], l, 0.3);
        ctx.beginPath();
        ctx.ellipse(mx + 0.9, my - 0.3, 0.5, 0.08, -0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case Carry.Egg:
        blob(0.4, 0.3, [240, 234, 216]);
        ctx.fillStyle = css([255, 255, 255], l, 0.55);
        ctx.beginPath();
        ctx.arc(mx + 0.32, my - 0.12, 0.09, 0, Math.PI * 2);
        ctx.fill();
        break;
      case Carry.Larva: {
        // A crook-necked grub, held by the middle.
        const col: RGB = [236, 226, 200];
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.ellipse(mx + 0.55, my + 0.1, 0.62, 0.48, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(mx + 1.05, my - 0.32, 0.3, 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = css([170, 150, 118], l, 0.6);
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const sx = mx + 0.1 + k * 0.28;
          ctx.moveTo(sx, my - 0.25 + k * 0.05);
          ctx.quadraticCurveTo(sx + 0.12, my + 0.1, sx + 0.05, my + 0.45);
        }
        ctx.stroke();
        ctx.fillStyle = css([150, 120, 80], l, 0.7);
        ctx.beginPath();
        ctx.ellipse(mx + 0.55, my + 0.05, 0.25, 0.15, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case Carry.Pupa: {
        // A naked pupa: a pale ant folded up, eyes darkening.
        const col: RGB = [230, 214, 178];
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.ellipse(mx + 0.2, my + 0.05, 0.75, 0.42, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(mx + 1.15, my - 0.05, 0.42, 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = css([90, 70, 52], l, 0.7);
        ctx.beginPath();
        ctx.arc(mx + 1.3, my - 0.12, 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = css([180, 160, 124], l, 0.7);
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(mx + 0.9, my + 0.3);
        ctx.quadraticCurveTo(mx + 0.4, my + 0.55, mx - 0.2, my + 0.35);
        ctx.stroke();
        break;
      }
      case Carry.Corpse: {
        // A dead nestmate, curled, carried by the waist.
        const col = DEAD_COL;
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.ellipse(mx + 0.2, my + 0.2, 0.8, 0.55, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(mx + 1.1, my - 0.25, 0.6, 0.3, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(mx + 1.85, my - 0.1, 0.42, 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = css(col, l);
        ctx.lineWidth = 0.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const hx = mx + 0.8 + k * 0.3;
          ctx.moveTo(hx, my);
          ctx.quadraticCurveTo(hx + 0.2, my + 0.45, hx - 0.1, my + 0.6);
        }
        ctx.stroke();
        break;
      }
      case Carry.Refuse: {
        // A split husk: a pale, hollow shell.
        const col = sampleRamp(PAL.refuse, a.carryTone / 255);
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.ellipse(mx + 0.45, my, 0.62, 0.32, 0.5, Math.PI * 0.1, Math.PI * 1.15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = css(mixRGB(col, [60, 40, 20], 0.35), l, 0.8);
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.ellipse(mx + 0.45, my, 0.62, 0.32, 0.5, Math.PI * 0.1, Math.PI * 1.15);
        ctx.stroke();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- brood and dead

  drawBrood(ctx: CanvasRenderingContext2D, brood: Brood[], z: number, light: Light, view: { x0: number; y0: number; x1: number; y1: number }, pupaTicks: number): void {
    for (const b of brood) {
      if (b.carried) continue;
      if (b.x < view.x0 - 4 || b.x > view.x1 + 4 || b.y < view.y0 - 4 || b.y > view.y1 + 4) continue;
      const l = light(b.x, b.y);
      const cx = b.x + 0.5;
      const fy = b.y + 1;
      // Each lies a little differently, from a hash of its id.
      const tilt = (((b.id * 2654435761) >>> 24) / 255 - 0.5) * 0.6;
      if (b.stage === 0) {
        ctx.fillStyle = css([242, 236, 220], l);
        ctx.beginPath();
        ctx.ellipse(cx, fy - 0.38, 0.48, 0.36, tilt, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = css([255, 255, 250], l, 0.6);
        ctx.beginPath();
        ctx.ellipse(cx - 0.12, fy - 0.52, 0.16, 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.stage === 1) {
        // A grub that fattens as it is fed, curled like a comma.
        const s = (0.55 + b.size * 0.75) * (b.major ? 1.35 : 1);
        ctx.fillStyle = css([236, 226, 200], l);
        ctx.beginPath();
        ctx.ellipse(cx, fy - 0.55 * s, 1.0 * s, 0.6 * s, tilt, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 0.85 * s, fy - 0.85 * s, 0.38 * s, 0.34 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        if (z * s > 3) {
          ctx.strokeStyle = css([200, 186, 154], l, 0.8);
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          for (let k = -2; k <= 2; k++) {
            ctx.moveTo(cx + k * 0.3 * s, fy - 0.15 * s);
            ctx.lineTo(cx + k * 0.3 * s + 0.08, fy - 1.0 * s);
          }
          ctx.stroke();
          // A mouthful of crushed seed in the gut shows the larva has been fed.
          if (b.fed > 0) {
            ctx.fillStyle = css(sampleRamp(PAL.seed, 0.6), l, 0.55);
            ctx.beginPath();
            ctx.ellipse(cx - 0.1 * s, fy - 0.55 * s, 0.4 * s, 0.22 * s, tilt, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        // Naked pupa (Myrmicinae spin no cocoon): an ant folded up, darkening as it matures.
        const ripe = Math.min(1, b.age / Math.max(1, pupaTicks));
        const col = mixRGB([232, 216, 182], [120, 92, 70], ripe * ripe * 0.8);
        const s = b.major ? 1.25 : 1;
        ctx.fillStyle = css(col, l);
        ctx.beginPath();
        ctx.ellipse(cx - 0.9 * s, fy - 0.75 * s, 1.0 * s, 0.72 * s, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 0.35 * s, fy - 0.8 * s, 0.75 * s, 0.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 1.25 * s, fy - 0.7 * s, 0.55 * s, 0.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = css(mixRGB(col, [40, 28, 20], 0.5 + ripe * 0.4), l);
        ctx.beginPath();
        ctx.ellipse(cx + 1.4 * s, fy - 0.85 * s, 0.16 * s, 0.14 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawCorpses(ctx: CanvasRenderingContext2D, corpses: Corpse[], z: number, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
    for (const c of corpses) {
      if (c.carried) continue;
      if (c.x < view.x0 - 6 || c.x > view.x1 + 6 || c.y < view.y0 - 6 || c.y > view.y1 + 6) continue;
      const l = light(c.x, c.y);
      ctx.save();
      // On its back, legs curled up: the flip puts the back (y = -2.2) on the floor.
      ctx.translate(c.x + 0.5, c.y + 1 - 2.2);
      ctx.scale(((c.x + c.y) & 1) === 0 ? 1 : -1, -1);
      this.ant(ctx, null, WORKER, 0, l, z, 0, true);
      if (c.kind === 'fungus') {
        // Mould bursting from the joints: white tufts of a muscardine fungus.
        ctx.fillStyle = css([236, 234, 222], l, 0.9);
        for (const [mx, my, mr] of [[-0.6, -1.3, 0.55], [-1.2, -1.2, 0.5], [0.3, -1.3, 0.5], [1.6, -1.4, 0.45], [-2.4, -1.5, 0.6], [-3.0, -1.0, 0.4], [2.3, -1.6, 0.35]] as const) {
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}
