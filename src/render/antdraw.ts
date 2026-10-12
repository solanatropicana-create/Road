import type { Ant } from '../sim/ant';
import type { Brood, Corpse } from '../sim/brood';
import type { World } from '../world/world';
import { Carry } from '../sim/types';
import { SOLID } from '../world/mat';
import { PAL, RGB, hex, mixRGB, sampleRamp } from './palette';

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
  /** +1 / -1 facing along the surface, eased through 0 when turning around. */
  face: number;
  /** Recent travel direction (for ants on the glass with nothing to grip). */
  dx: number;
  dy: number;
  tx: number;
  ty: number;
  gait: number;
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
};

const BODY_COL = hex('#261a12');
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

/** A closed curve through the midpoints of a polygon (rounded corners). */
function smooth(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], cx: number, cy: number, rx: number, ry: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (k: number): [number, number] => {
    const p = pts[(k + pts.length) % pts.length]!;
    const x = p[0] * rx;
    const y = p[1] * ry;
    return [cx + x * c - y * s, cy + x * s + y * c];
  };
  ctx.beginPath();
  const a = P(0);
  const b = P(1);
  ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let k = 1; k <= pts.length; k++) {
    const p = P(k);
    const q = P(k + 1);
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
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
    const kF = 1 - Math.exp(-dt * 12);
    for (const a of ants) {
      const tx = a.x + 0.5;
      const ty = a.y + 0.5;
      let v = this.vis.get(a);
      if (!v) {
        v = { x: tx, y: ty, down: Math.atan2(a.ly, a.lx), face: a.hx * a.ly - a.hy * a.lx || 1, dx: a.hx, dy: a.hy, tx, ty, gait: Math.random() * 6 };
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
        v.tx = tx;
        v.ty = ty;
      }
      // Glide at walking pace, catching up faster if left behind.
      const ex = tx - v.x;
      const ey = ty - v.y;
      const dist = Math.hypot(ex, ey);
      if (dist > 6) {
        v.x = tx;
        v.y = ty;
      } else if (dist > 1e-3) {
        const step = Math.min(dist, Math.max(nominal * dt, dist * (1 - Math.exp(-dt * 6 * Math.max(1, speed)))));
        v.x += (ex / dist) * step;
        v.y += (ey / dist) * step;
        v.gait += (step / (a.caste === 'queen' ? QUEEN.stride : WORKER.stride)) * Math.PI;
      }
      // Pose: legs toward whatever the ant grips; on the bare glass, belly
      // toward the floor of the frame with the body along its path.
      let down: number;
      let face: number;
      if (this.gripped(a.x, a.y)) {
        down = Math.atan2(a.ly, a.lx);
        face = a.hx * a.ly - a.hy * a.lx || (v.face >= 0 ? 1 : -1);
      } else {
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
      v.face += (face - v.face) * kF;
    }
  }

  draw(ctx: CanvasRenderingContext2D, ants: Ant[], z: number, light: Light, view: { x0: number; y0: number; x1: number; y1: number }, selected: Ant | null): void {
    for (const a of ants) {
      const v = this.vis.get(a);
      if (!v) continue;
      if (v.x < view.x0 - 8 || v.x > view.x1 + 8 || v.y < view.y0 - 8 || v.y > view.y1 + 8) continue;
      const body = a.caste === 'queen' ? QUEEN : a.caste === 'soldier' ? MAJOR : WORKER;
      const l = light(v.x, v.y);
      ctx.save();
      // Feet rest on the cell edge toward the surface.
      ctx.translate(v.x + Math.cos(v.down) * 0.5, v.y + Math.sin(v.down) * 0.5);
      ctx.rotate(v.down - Math.PI / 2);
      const f = Math.abs(v.face) < 0.18 ? (v.face < 0 ? -0.18 : 0.18) : v.face;
      ctx.scale(f * body.scale, body.scale);
      const busy = a.timer > 0 ? Math.sin(this.time * 18 + a.id) * 0.12 : 0;
      if (a === selected) this.marker(ctx, body, z);
      const wall = this.world.bg[a.y * this.world.w + a.x] === 1;
      this.ant(ctx, a, body, v.gait, l, z, busy, false, wall);
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
    const px = 1 / (z * b.scale);
    const detail = z * b.scale > 1.6;
    const bodyCol = dead ? DEAD_COL : BODY_COL;
    const legCol = dead ? DEAD_COL : LEG_COL;
    // In the nest the back wall is right behind the ant: a soft shadow lifts it off.
    if (wall) {
      ctx.fillStyle = 'rgba(8,4,2,0.3)';
      ctx.beginPath();
      ctx.ellipse(b.thorax[0] - 0.4, b.thorax[1] + 0.55, 3.2 * (b === QUEEN ? 1.6 : 1), 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Contact shadow.
    if (!dead) {
      ctx.fillStyle = `rgba(0,0,0,${0.22})`;
      ctx.beginPath();
      ctx.ellipse(0, 0.05, 2.8 * (b === QUEEN ? 1.5 : 1), 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (detail) {
      // Far-side legs first, darker and half a stride out of phase.
      this.legs(ctx, b, gait + Math.PI, mixRGB(legCol, [0, 0, 0], 0.45), l, px, dead);
    }
    // Queen's wings lie over the back until she tears them off.
    if (a && a.wings) {
      ctx.fillStyle = css([215, 222, 232], l, 0.32);
      ctx.strokeStyle = css([120, 110, 100], l, 0.55);
      ctx.lineWidth = Math.max(px, 0.08);
      for (const [cx, cy, rx, ry, rot] of [[-2.0, -3.2, 4.6, 0.95, 0.1], [-1.4, -2.75, 3.6, 0.7, 0.16]] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // Gaster, nodes, mesosoma, head; each with a glossy highlight along the top.
    const sheen = css(SHEEN_COL, l, dead ? 0.12 : 0.45);
    const rim = css(SHEEN_COL, l, 0.3);
    const shape = (pts: readonly (readonly [number, number])[], cx: number, cy: number, rx: number, ry: number, rot: number, col: RGB): void => {
      ctx.fillStyle = css(col, l);
      smooth(ctx, pts, cx, cy, rx, ry, rot);
      ctx.fill();
      if (detail && !dead) {
        // Rim light: one screen pixel of warm edge so overlapping ants stay separate.
        ctx.strokeStyle = rim;
        ctx.lineWidth = px;
        ctx.stroke();
      }
      if (detail) {
        // A specular streak near the top edge, as on a glossy cuticle under a lamp.
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.ellipse(cx + rx * 0.05, cy - ry * 0.58, rx * 0.55, ry * 0.14, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const [gx, gy, grx, gry, grot] = b.gaster;
    shape(GASTER_PTS, gx, gy, grx, gry, grot, bodyCol);
    for (const [nx, ny, nr] of b.nodes) shape(NODE_PTS, nx, ny, nr, nr * 1.15, 0, bodyCol);
    const [tx, ty, trx, tr_y, trot] = b.thorax;
    shape(THORAX_PTS, tx, ty, trx, tr_y, trot, bodyCol);
    const [hx, hy, hrx, hry] = b.head;
    const hb = busy;
    shape(HEAD_PTS, hx + hb, hy, hrx, hry, 0.12, dead ? DEAD_COL : b.headCol);
    if (detail && z * b.scale > 5 && !dead) {
      // Psammophore: the beard of long hairs under a harvester's head, for carrying sand.
      ctx.strokeStyle = css(hex('#8a6a50'), l, 0.45);
      ctx.lineWidth = px;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const x = hx + hb - hrx * 0.4 + k * hrx * 0.28;
        const y = hy + hry * 0.85;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 0.05, y + 0.3, x + 0.25, y + 0.42);
      }
      ctx.stroke();
    }
    if (detail) {
      // Eye: a dull glint on the side of the head.
      ctx.fillStyle = css([90, 78, 66], l, 0.9);
      ctx.beginPath();
      ctx.ellipse(hx + hb + hrx * 0.25, hy - hry * 0.2, 0.17, 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      // Mandibles.
      ctx.fillStyle = css(hex('#3d2516'), l);
      ctx.beginPath();
      ctx.moveTo(hx + hb + hrx * 0.7, hy + hry * 0.25);
      ctx.lineTo(b.mouth[0] + hb + 0.15, b.mouth[1] + 0.05);
      ctx.lineTo(hx + hb + hrx * 0.55, hy + hry * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    if (detail) {
      this.legs(ctx, b, gait, legCol, l, px, dead);
      this.antenna(ctx, b, hb, legCol, l, px, a ? a.id : 0, dead);
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
    if (a && a.carry !== Carry.None) this.load(ctx, a, b, hb, l);
  }

  private legs(ctx: CanvasRenderingContext2D, b: Body, gait: number, col: RGB, l: RGB, px: number, dead: boolean): void {
    ctx.strokeStyle = css(col, l);
    for (let k = 0; k < 3; k++) {
      // Tripod gait: front and hind legs of one side swing with the middle leg of the other.
      const q = gait + (k === 1 ? Math.PI : 0);
      const hipX = b.hips[k]!;
      const hipY = b.hipY;
      let footX = b.feet[k]! + Math.sin(q) * b.stride * 0.5;
      let footY = -Math.max(0, Math.cos(q)) * 0.4;
      if (dead) {
        // Curled in against the belly.
        footX = hipX + (1 - k) * 0.35;
        footY = hipY + 0.3;
      }
      const kneeX = (hipX + footX) / 2 + (k === 2 ? -0.25 : 0.25);
      const kneeY = dead ? hipY + 0.85 : Math.min(hipY, footY) - 0.45;
      ctx.lineWidth = Math.max(px, 0.26);
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(kneeX, kneeY);
      ctx.stroke();
      ctx.lineWidth = Math.max(px, 0.18);
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }
  }

  private antenna(ctx: CanvasRenderingContext2D, b: Body, hb: number, col: RGB, l: RGB, px: number, id: number, dead: boolean): void {
    const [ax, ay] = b.antenna;
    const t = this.time;
    // Antennae never stop: they sweep and tap in a slow, irregular rhythm.
    const sway = dead ? 0.6 : Math.sin(t * 3.1 + id * 1.7) * 0.35 + Math.sin(t * 7.3 + id) * 0.12;
    const ex = ax + hb + 0.55;
    const ey = ay - 0.75;
    const tipX = ex + Math.cos(0.35 + sway) * 1.35;
    const tipY = ey + Math.sin(0.35 + sway) * 1.35;
    ctx.strokeStyle = css(col, l);
    ctx.lineWidth = Math.max(px, 0.14);
    ctx.beginPath();
    ctx.moveTo(ax + hb, ay);
    ctx.lineTo(ex, ey);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Clubbed tip.
    ctx.lineWidth = Math.max(px, 0.24);
    ctx.beginPath();
    ctx.moveTo(ex + (tipX - ex) * 0.7, ey + (tipY - ey) * 0.7);
    ctx.lineTo(tipX, tipY);
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
      case Carry.Seed:
        blob(0.85, 0.55, sampleRamp(PAL.seed, a.carryTone / 255), -0.3);
        ctx.fillStyle = css([255, 240, 200], l, 0.35);
        ctx.beginPath();
        ctx.ellipse(mx + 0.4, my - 0.22, 0.35, 0.14, -0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case Carry.Soil:
        blob(0.55, 0.48, mixRGB(sampleRamp(PAL.loam, a.carryTone / 255), [230, 215, 190], 0.14), 0.4);
        break;
      case Carry.Fruit:
        blob(0.8, 0.75, sampleRamp(PAL.fruit, 0.8));
        break;
      case Carry.Egg:
        blob(0.4, 0.3, [240, 234, 216]);
        break;
      case Carry.Larva:
        blob(0.75, 0.5, [234, 224, 198], 0.5);
        break;
      case Carry.Pupa:
        blob(1.1, 0.5, [228, 212, 176], 0.2);
        break;
      case Carry.Corpse:
        blob(1.4, 0.5, DEAD_COL, 0.15, 0.4);
        break;
      case Carry.Refuse:
        blob(0.6, 0.3, sampleRamp(PAL.refuse, a.carryTone / 255), 0.5);
        break;
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
      ctx.restore();
    }
  }
}
