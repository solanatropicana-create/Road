import type { Critter } from '../sim/critters';
import type { Carcass } from '../sim/carcass';
import type { World } from '../world/world';
import { RGB, hex } from './palette';
import { clamp } from '../util/math';

type Light = (x: number, y: number) => RGB;

const css = (c: RGB, l: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;

// Steppe grasshopper (Calliptamus): mottled grey-brown, a pale stripe along
// the side, a banded hind femur and rosy hind tibiae.
const HOPPER = {
  body: hex('#7b7350'), belly: hex('#a59a6c'), dark: hex('#3f3a24'), stripe: hex('#c9bb8a'),
  wing: hex('#8c7f58'), vein: hex('#4d4530'), femur: hex('#8a8058'), band: hex('#3e3826'),
  tibia: hex('#b0675a'), eye: hex('#4a3420'),
};
const HOPPER_DRY = {
  body: hex('#866b46'), belly: hex('#ae9469'), dark: hex('#45331f'), stripe: hex('#cdb68a'),
  wing: hex('#8a7150'), vein: hex('#4f3b27'), femur: hex('#937650'), band: hex('#463421'),
  tibia: hex('#a36352'), eye: hex('#3e2a18'),
};
// Harpalus rufipes: black, finely grooved wing cases, red-brown legs and antennae.
const BEETLE = { body: hex('#1b1814'), edge: hex('#2c2722'), sheen: hex('#56646f'), leg: hex('#6e3420'), legDark: hex('#3a1d13'), jaw: hex('#4a2216') };
const WORM = { body: hex('#b0706c'), dark: hex('#8a5250'), band: hex('#c98d80') };
// Zodarion: a red-brown front body, a dark abdomen with pale spots, banded legs.
const SPIDER = { front: hex('#7a3c22'), back: hex('#2a1e17'), spot: hex('#dccaa4'), leg: hex('#a0703f'), band: hex('#5a3a22'), legFar: hex('#5e4026'), eye: hex('#120c0a') };
const PHORID = { body: hex('#7a5a2c'), dark: hex('#3e2c18'), wing: hex('#d4dee6'), vein: hex('#6a5a44') };
const LOUSE = { body: hex('#ece6d8'), edge: hex('#b4a994'), leg: hex('#d8cfbb') };
const CRICKET = { body: hex('#7c5a38'), dark: hex('#45301e'), pale: hex('#b89870') };
const BEETLET = { body: hex('#9a4c24'), dark: hex('#552812'), leg: hex('#b06a3a') };
const ANTLION = { jaw: hex('#8a6a40'), head: hex('#6b5232') };
// Solenopsis fugax: tiny, pale amber, shining.
const THIEF = { body: hex('#c99a45'), dark: hex('#7a5524'), leg: hex('#b08440') };
// Lithobius forficatus: glossy chestnut plates, paler legs.
const CENTI = { body: hex('#7a3a1e'), dark: hex('#45200f'), leg: hex('#b0703e'), head: hex('#5a2a14') };
// Gryllotalpa: brown, with a golden velvet down on the pronotum.
const MOLE = { body: hex('#6e4a2c'), dark: hex('#3e2816'), velvet: hex('#a07a4a'), wing: hex('#5a4630'), belly: hex('#9a7a56'), leg: hex('#7a5232') };
// Bufotes viridis: grey-cream, marbled with moss-green blotches edged darker, warty, a gold eye.
const TOAD = { base: hex('#b9b394'), blotch: hex('#6b8a4a'), edge: hex('#3c5428'), wart: hex('#8f8a6c'), belly: hex('#ddd6bc'), eye: hex('#c79a3a'), tongue: hex('#d9827a'), dark: hex('#2e2a20') };
// Lacerta agilis: a brown back with dark, white-centred spots; the male's flanks green in spring.
const LIZARD = { back: hex('#8a6b45'), flankM: hex('#6f9a3c'), flankF: hex('#a2845a'), spot: hex('#3a2a1a'), dot: hex('#efe6cc'), belly: hex('#d9cf9e'), eye: hex('#b88a2e'), tongue: hex('#b0455a') };
// Talpa europaea: velvet slate-black fur, pink snout and palms.
const TALPA = { fur: hex('#2b2a30'), sheen: hex('#6c7180'), pink: hex('#e0a194'), palm: hex('#d79584'), claw: hex('#efe4cc'), dark: hex('#141317') };

/**
 * The other animals, drawn over the slice at screen resolution like the
 * ants. Units are millimetres.
 */
export function drawCritters(ctx: CanvasRenderingContext2D, list: Critter[], world: World, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const c of list) {
    const pad = c.kind === 'mole' || c.kind === 'lizard' ? 140 : 40;
    if (c.kind !== 'worm' && c.kind !== 'thief' && c.kind !== 'centipede' && (c.x < view.x0 - pad || c.x > view.x1 + pad || c.y < view.y0 - pad || c.y > view.y1 + pad)) continue;
    switch (c.kind) {
      case 'hopper': hopper(ctx, c, light); break;
      case 'beetle': beetle(ctx, c, light); break;
      case 'worm': worm(ctx, c, world, light, view); break;
      case 'spider': spider(ctx, c, light); break;
      case 'phorid': phorid(ctx, c, light); break;
      case 'woodlouse': woodlouse(ctx, c, light); break;
      case 'cricket': cricket(ctx, c, light); break;
      case 'beetlet': beetlet(ctx, c, light); break;
      case 'antlion': antlion(ctx, c, light); break;
      case 'thief': thiefAnts(ctx, c, world, light); break;
      case 'centipede': centipede(ctx, c, world, light, view); break;
      case 'molecricket': moleCricket(ctx, c, light); break;
      case 'toad': drawToad(ctx, c, light); break;
      case 'lizard': drawLizard(ctx, c, light); break;
      case 'mole': drawMole(ctx, c, light); break;
    }
  }
}

// ---------------------------------------------------------------- shared

type Pt = readonly [number, number];

/** A closed outline through the midpoints of a polygon (soft corners), as a path on ctx. */
function outline(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  const n = pts.length;
  const mid = (k: number): [number, number] => {
    const a = pts[k % n]!;
    const b = pts[(k + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(0);
  ctx.beginPath();
  ctx.moveTo(m0[0], m0[1]);
  for (let k = 1; k <= n; k++) {
    const p = pts[k % n]!;
    const m = mid(k);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

/**
 * Fill the current path lit from above: the colour, lighter on the back and
 * darker on the belly between y0 (top) and y1 (bottom).
 */
function litFill(ctx: CanvasRenderingContext2D, c: RGB, l: RGB, y0: number, y1: number, top = 1.25, bottom = 0.6, a = 1): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  const k = (f: number): RGB => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
  g.addColorStop(0, css(k(top), l, a));
  g.addColorStop(0.45, css(c, l, a));
  g.addColorStop(1, css(k(bottom), l, a));
  ctx.fillStyle = g;
  ctx.fill();
}

/** A limb segment that tapers from w0 to w1 (a filled, round-ended stroke). */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
  ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  ctx.arc(x1, y1, w1 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI);
  ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  ctx.arc(x0, y0, w0 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI);
  ctx.closePath();
  ctx.fill();
}

/** A jointed leg through the given points, tapering from w0 to w1, with a dot at each joint. */
function leg(ctx: CanvasRenderingContext2D, pts: readonly Pt[], w0: number, w1: number): void {
  for (let k = 0; k < pts.length - 1; k++) {
    const t0 = k / (pts.length - 1);
    const t1 = (k + 1) / (pts.length - 1);
    limb(ctx, pts[k]![0], pts[k]![1], pts[k + 1]![0], pts[k + 1]![1], w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1);
  }
}

/** A thin bead-chain antenna along a quadratic curve. */
function antenna(ctx: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, beads: number): void {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  for (let k = 1; k <= beads; k++) {
    const t = k / (beads + 1);
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    ctx.beginPath();
    ctx.arc(x, y, w * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A soft glint: a small bright ellipse (light caught on a shiny cuticle). */
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, l: RGB, a = 0.5): void {
  ctx.fillStyle = css([255, 250, 235], l, a);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- grasshopper

/**
 * A short-horned grasshopper, about 25 mm, side on: short beaded antennae, a
 * big eye, the saddle of the pronotum, wings folded along the back, and the
 * great hind femur with its herringbone ridges, the tibia folded under it.
 * Leaping, the hind legs kick out straight behind. `dead`: lying on its side,
 * legs stiff.
 */
function grasshopper(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, air: boolean, vx: number, vy: number, t: number, dry: boolean, l: RGB, dead = false): void {
  const P = dry ? HOPPER_DRY : HOPPER;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  if (air) ctx.rotate(Math.atan2(vy, Math.abs(vx) + 0.01) * 0.35);
  if (dead) {
    // On its back, the pronotum on the ground, legs up.
    ctx.translate(0, -7.6);
    ctx.rotate(Math.PI + 0.05);
    l = [l[0] * 0.82, l[1] * 0.8, l[2] * 0.76];
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Far-side legs, in shadow.
  ctx.fillStyle = css(P.dark, l, 0.85);
  if (!air) {
    leg(ctx, [[4.0, -3.0], [5.6, -1.4], [5.0, 0], [6.2, 0]], 0.55, 0.3);
    leg(ctx, [[2.0, -3.0], [3.0, -1.5], [2.0, 0], [3.0, 0]], 0.55, 0.3);
    leg(ctx, [[-6.6, -4.4], [-2.4, -0.6], [-0.4, -0.1]], 0.55, 0.32);
  }
  // Hind leg (near side): the femur along the flank, back and up to the knee;
  // the tibia folded forward under it to the foot. Leaping, both kick out behind.
  // (Dead, the body is upside down, so "up" here is +y.)
  const knee: Pt = air ? [-9.5, -3.4] : dead ? [-7.6, -1.2] : [-8.4, -5.2];
  const ankle: Pt = air ? [-18, -1.4] : dead ? [-11.2, 2.2] : [-1.8, -0.4];
  const toe: Pt = air ? [-20.5, -0.6] : dead ? [-12.6, 3.0] : [0.4, 0];
  const hip: Pt = [1.0, -3.1];
  // Tibia (rosy) and foot.
  ctx.fillStyle = css(P.tibia, l);
  leg(ctx, [knee, ankle, toe], 0.75, 0.42);
  // Spines along the back of the tibia.
  ctx.strokeStyle = css(P.dark, l, 0.8);
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  for (let k = 1; k < 7; k++) {
    const f = k / 7;
    const sx = knee[0] + (ankle[0] - knee[0]) * f;
    const sy = knee[1] + (ankle[1] - knee[1]) * f;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 0.35, sy - 0.3);
  }
  ctx.stroke();
  // Abdomen: segmented, tapering to the tip.
  outline(ctx, [[-12.4, -3.6], [-11, -5.0], [-6, -5.6], [-1, -5.9], [0.5, -4.5], [0, -2.4], [-5, -2.1], [-10, -2.7]]);
  litFill(ctx, P.belly, l, -6, -2);
  ctx.strokeStyle = css(P.dark, l, 0.35);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const sx = -1.2 - k * 1.35;
    ctx.moveTo(sx, -2.3 - k * 0.03);
    ctx.lineTo(sx + 0.25, -4.8 + k * 0.1);
  }
  ctx.stroke();
  // Cerci at the tip.
  ctx.fillStyle = css(P.dark, l);
  limb(ctx, -12.2, -3.7, -13.3, -3.3, 0.35, 0.15);
  // Thorax under the pronotum, front and middle legs.
  ctx.fillStyle = css(P.body, l);
  if (dead) {
    // Stiff, splayed.
    leg(ctx, [[4.4, -3.2], [6.8, -1.2], [8.2, 0.6]], 0.6, 0.32);
    leg(ctx, [[2.4, -3.0], [3.6, -0.6], [3.2, 1.0]], 0.6, 0.32);
  } else {
    leg(ctx, [[4.4, -3.2], [6.2, -1.7], [5.8, 0], [7.0, 0]], 0.65, 0.35);
    leg(ctx, [[2.4, -3.0], [3.4, -1.6], [2.6, 0], [3.8, 0]], 0.65, 0.35);
  }
  outline(ctx, [[-0.6, -3.0], [-0.6, -6.6], [2.5, -7.2], [5.6, -6.8], [5.8, -3.0], [2.5, -2.4]]);
  litFill(ctx, P.body, l, -7.2, -2.4);
  // Head: tall, the face nearly upright, mouthparts at the bottom.
  outline(ctx, [[5.0, -3.0], [5.0, -6.6], [7.2, -7.9], [9.6, -7.2], [10.8, -5.0], [10.6, -2.8], [9.6, -1.9], [7.4, -2.0]]);
  litFill(ctx, P.body, l, -7.9, -1.9);
  ctx.fillStyle = css(P.dark, l, 0.9);
  outline(ctx, [[9.2, -2.4], [10.6, -2.6], [10.4, -1.4], [9.4, -1.3]]);
  ctx.fill();
  // Pronotum: a saddle with a keel along the top and a lobe down the side.
  outline(ctx, [[-1.2, -6.4], [0.2, -7.6], [3.2, -7.9], [5.8, -7.4], [6.2, -5.6], [5.6, -3.4], [2.6, -3.0], [-0.6, -3.6]]);
  litFill(ctx, P.body, l, -7.9, -3.0, 1.35, 0.75);
  ctx.strokeStyle = css(P.dark, l, 0.6);
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(-0.9, -6.5);
  ctx.quadraticCurveTo(2.8, -7.6, 5.9, -6.9);
  ctx.moveTo(1.6, -7.5);
  ctx.quadraticCurveTo(1.0, -5.6, 1.6, -3.3);
  ctx.moveTo(3.9, -7.6);
  ctx.quadraticCurveTo(3.4, -5.6, 3.9, -3.1);
  ctx.stroke();
  // The pale stripe running back from the eye across the pronotum.
  ctx.strokeStyle = css(P.stripe, l, 0.75);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(8.0, -6.6);
  ctx.quadraticCurveTo(4, -7.2, -1.0, -6.2);
  ctx.stroke();
  // Mottling.
  ctx.fillStyle = css(P.dark, l, 0.28);
  for (const [mx, my, mr] of [[1.2, -5.2, 0.6], [3.6, -4.6, 0.7], [4.8, -6.2, 0.4], [-3, -3.4, 0.5], [-7.4, -3.6, 0.45]] as const) {
    ctx.beginPath();
    ctx.ellipse(mx, my, mr * 1.3, mr, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Wings folded along the back, a little translucent, veined.
  outline(ctx, [[-0.8, -6.8], [-6, -6.7], [-12.8, -5.6], [-13.4, -4.9], [-12.4, -4.4], [-6, -4.7], [-0.6, -5.0]]);
  litFill(ctx, P.wing, l, -7, -4.4, 1.3, 0.8, 0.92);
  ctx.strokeStyle = css(P.vein, l, 0.55);
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(-0.8, -6.0);
  ctx.quadraticCurveTo(-7, -5.9, -13, -5.1);
  ctx.moveTo(-0.8, -5.4);
  ctx.quadraticCurveTo(-7, -5.2, -12.6, -4.7);
  for (let k = 0; k < 9; k++) {
    const sx = -2 - k * 1.2;
    ctx.moveTo(sx, -6.6 + k * 0.08);
    ctx.lineTo(sx - 0.5, -4.8 + k * 0.03);
  }
  ctx.stroke();
  // Dark flecks on the wing.
  ctx.fillStyle = css(P.vein, l, 0.5);
  for (const [fx, fy, fr] of [[-4, -5.9, 0.45], [-7.2, -5.6, 0.55], [-10, -5.3, 0.4]] as const) {
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr * 1.4, fr * 0.6, -0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hind femur over everything: a drumstick, broad at the hip.
  const fx = knee[0] - hip[0];
  const fy = knee[1] - hip[1];
  const flen = Math.hypot(fx, fy);
  const fa = Math.atan2(fy, fx);
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(fa);
  outline(ctx, [[-0.8, 0], [0.6, -1.25], [flen * 0.45, -1.15], [flen * 0.85, -0.55], [flen + 0.3, -0.3], [flen + 0.3, 0.35], [flen * 0.8, 0.6], [flen * 0.4, 1.0], [0.4, 1.2]]);
  litFill(ctx, P.femur, l, -1.3, 1.2, 1.3, 0.7);
  // Herringbone ridges and two dark bands.
  ctx.strokeStyle = css(P.dark, l, 0.45);
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  for (let k = 1; k < 12; k++) {
    const sx = (flen * k) / 12;
    const hw = 1.1 - (k / 12) * 0.7;
    ctx.moveTo(sx, -hw * 0.9);
    ctx.lineTo(sx + 0.45, 0);
    ctx.lineTo(sx, hw * 0.9);
  }
  ctx.stroke();
  ctx.fillStyle = css(P.band, l, 0.55);
  for (const f of [0.5, 0.72]) {
    ctx.beginPath();
    ctx.ellipse(flen * f, 0, 0.45, 1.05 - f * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = css(P.dark, l);
  ctx.beginPath();
  ctx.ellipse(flen + 0.15, 0, 0.45, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Eye: big, oval, with a highlight; a small ocellus above.
  ctx.fillStyle = css(P.eye, l);
  ctx.beginPath();
  ctx.ellipse(8.4, -5.5, 1.05, 1.45, 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (!dead) glint(ctx, 8.1, -6.1, 0.35, 0.22, 0.4, l, 0.65);
  // Antennae: short and beaded (a grasshopper's, not a bush cricket's).
  const sway = dead ? 0 : Math.sin(t * 0.07) * 0.6;
  ctx.strokeStyle = css(P.dark, l);
  ctx.fillStyle = css(P.dark, l);
  antenna(ctx, 9.6, -7.2, 11.6, -9.6 + sway * 0.4, 14.6 + sway * 0.4, -10.4 + sway, 0.2, 11);
  ctx.restore();
}

function hopper(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  grasshopper(ctx, c.x, c.y, c.dir, c.air, c.vx, c.vy, c.t, c.state === 1, light(c.x, c.y - 4));
}

function beetle(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  groundBeetle(ctx, c.x, c.y, c.dir, c.timer > 0 ? 0 : c.t * 0.32, light(c.x, c.y - 2), false);
}

/**
 * A ground beetle, about 13 mm, walking on a tripod gait: black wing cases
 * with fine grooves and a cold sheen, a squarish pronotum, curved jaws, and
 * red-brown legs and beaded antennae. `dead`: on its back, legs curled.
 */
function groundBeetle(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, gait: number, l: RGB, dead: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  if (dead) {
    ctx.translate(0, -5.0);
    ctx.rotate(Math.PI - 0.04);
    l = [l[0] * 0.85, l[1] * 0.85, l[2] * 0.85];
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Legs: hips along the underside; feet step in two alternating tripods.
  const hips = [3.4, 1.0, -1.4];
  const rest = [5.6, 1.6, -3.6];
  const drawLegs = (far: boolean): void => {
    ctx.fillStyle = css(far ? BEETLE.legDark : BEETLE.leg, l);
    for (let k = 0; k < 3; k++) {
      const hx = hips[k]! + (far ? 0.4 : 0);
      const tripodA = (k === 1) === far;
      const q = gait + (tripodA ? 0 : Math.PI);
      if (dead) {
        // Curled up in the air (body upside down: up is +y).
        const fx = hx + (k - 1) * 0.6;
        leg(ctx, [[hx, -1.8], [fx + 0.8, 1.2], [fx + 1.8, 2.4], [fx + 1.0, 3.0]], 0.62, 0.3);
        continue;
      }
      const fx = rest[k]! + (far ? 0.5 : 0) + Math.sin(q) * 1.0;
      const lift = Math.max(0, Math.cos(q)) * 0.6;
      const knee: Pt = [hx + (fx - hx) * 0.55 + (k === 2 ? -0.6 : 0.4), -2.6 - lift * 0.5];
      leg(ctx, [[hx, -1.9], knee, [fx, -lift], [fx + (k === 2 ? -1.1 : 1.1), -lift * 0.4]], 0.7, 0.3);
    }
  };
  drawLegs(true);
  // Wing cases: a long dome, rounded behind.
  outline(ctx, [[-7.3, -2.6], [-6.4, -4.4], [-3.4, -5.2], [0.4, -4.9], [1.7, -3.9], [1.6, -2.0], [-2.0, -1.6], [-6.0, -1.9]]);
  litFill(ctx, BEETLE.body, l, -5.2, -1.6, 1.6, 0.7);
  // Grooves (striae) along the wing case.
  ctx.strokeStyle = css(BEETLE.edge, l, 0.9);
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const yy = -4.6 + k * 0.7;
    ctx.moveTo(1.2, yy + 0.25);
    ctx.quadraticCurveTo(-3, yy - 0.35, -6.6, yy + 1.3 - k * 0.1);
  }
  ctx.stroke();
  // The bluish sheen of a black carabid in the light.
  glint(ctx, -2.6, -4.55, 3.0, 0.32, -0.04, l, 0.2);
  ctx.fillStyle = css(BEETLE.sheen, l, 0.35);
  ctx.beginPath();
  ctx.ellipse(-2.2, -4.25, 3.6, 0.55, -0.03, 0, Math.PI * 2);
  ctx.fill();
  // Pronotum: a rounded square.
  outline(ctx, [[1.3, -2.1], [1.4, -4.2], [3.0, -4.6], [4.8, -4.1], [5.0, -2.3], [3.2, -1.9]]);
  litFill(ctx, BEETLE.body, l, -4.6, -1.9, 1.6, 0.7);
  glint(ctx, 3.1, -4.15, 1.2, 0.2, -0.05, l, 0.22);
  // Head, jaws, eye, palps.
  outline(ctx, [[4.7, -2.2], [4.8, -3.6], [6.0, -3.9], [7.1, -3.3], [7.2, -2.3], [6.0, -1.9]]);
  litFill(ctx, BEETLE.body, l, -3.9, -1.9, 1.5, 0.7);
  ctx.fillStyle = css(BEETLE.jaw, l);
  outline(ctx, [[6.9, -2.9], [8.1, -2.7], [8.3, -2.2], [7.6, -2.3], [7.0, -2.0]]);
  ctx.fill();
  ctx.fillStyle = css([36, 30, 26], l);
  ctx.beginPath();
  ctx.ellipse(5.9, -3.25, 0.42, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  glint(ctx, 5.8, -3.38, 0.14, 0.1, 0, l, 0.6);
  ctx.fillStyle = css(BEETLE.leg, l);
  leg(ctx, [[7.0, -2.1], [7.7, -1.5], [8.3, -1.6]], 0.22, 0.14);
  drawLegs(false);
  // Antennae: beaded, red-brown, swept forward.
  ctx.strokeStyle = css(BEETLE.leg, l);
  ctx.fillStyle = css(BEETLE.leg, l);
  const sway = dead ? 0 : Math.sin(gait * 0.5) * 0.4;
  if (dead) antenna(ctx, 6.6, -3.2, 8.4, -0.6, 9.6, 1.6, 0.16, 9);
  else antenna(ctx, 6.6, -3.6, 8.6, -5.6 + sway, 11.6, -5.2 + sway, 0.16, 10);
  ctx.restore();
}

function worm(ctx: CanvasRenderingContext2D, c: Critter, world: World, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
  const b = c.body;
  if (b.length < 2) return;
  const W = world.w;
  const hx = b[0]! % W;
  const hy = (b[0]! / W) | 0;
  if (hx < view.x0 - 100 || hx > view.x1 + 100 || hy < view.y0 - 100 || hy > view.y1 + 100) return;
  const l = light(hx, hy);
  // Smooth the cell path a little.
  const pts: [number, number][] = [];
  for (let k = 0; k < b.length; k += 2) pts.push([(b[k]! % W) + 0.5, ((b[k]! / W) | 0) + 0.5]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = (from: number, to: number): void => {
    ctx.beginPath();
    ctx.moveTo(pts[from]![0], pts[from]![1]);
    for (let k = from + 1; k <= to; k++) ctx.lineTo(pts[k]![0], pts[k]![1]);
  };
  const n = pts.length - 1;
  // Taper: thick front two-thirds, thinner tail.
  ctx.strokeStyle = css(WORM.dark, l);
  ctx.lineWidth = 3.4;
  path(0, Math.max(1, Math.floor(n * 0.7)));
  ctx.stroke();
  ctx.lineWidth = 2.4;
  path(Math.floor(n * 0.6), n);
  ctx.stroke();
  ctx.strokeStyle = css(WORM.body, l);
  ctx.lineWidth = 2.6;
  path(0, Math.max(1, Math.floor(n * 0.7)));
  ctx.stroke();
  ctx.lineWidth = 1.7;
  path(Math.floor(n * 0.6), n);
  ctx.stroke();
  // The saddle (clitellum) a third of the way back.
  const s0 = Math.floor(n * 0.18);
  ctx.strokeStyle = css(WORM.band, l);
  ctx.lineWidth = 3.6;
  path(s0, Math.min(n, s0 + 3));
  ctx.stroke();
  // Rings.
  ctx.strokeStyle = css(WORM.dark, l, 0.5);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let k = 1; k < n; k += 1) {
    const [x0, y0] = pts[k - 1]!;
    const [x1, y1] = pts[k + 1]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const [x, y] = pts[k]!;
    const r = k < n * 0.7 ? 1.3 : 0.85;
    ctx.moveTo(x - (dy / len) * r, y + (dx / len) * r);
    ctx.lineTo(x + (dy / len) * r, y - (dx / len) * r);
  }
  ctx.stroke();
}

/**
 * Zodarion, about 4 mm: a glossy red-brown front body, a dark abdomen with
 * pale spots, eight banded legs bent high at the knee. Lying in wait it holds
 * its front pair up and taps them like antennae, as an ant would.
 */
function spider(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 1);
  const k = c.tone < 90 ? 0.7 : 1;
  const walking = c.state === 2;
  const g = walking ? c.t * 0.45 : 0;
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir * k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Hips along the underside of the front body; feet spread fore and aft.
  const hips = [1.5, 1.1, 0.7, 0.3];
  const feet = [3.6, 2.5, -0.9, -2.6];
  const knees = [2.6, 1.9, 0.0, -1.4];
  const legs = (far: boolean): void => {
    for (let q = 0; q < 4; q++) {
      const ph = g + q * 1.7 + (far ? Math.PI : 0);
      const step = walking ? Math.sin(ph) * 0.5 : 0;
      const lift = walking ? Math.max(0, Math.cos(ph)) * 0.35 : 0;
      const hx = hips[q]! + (far ? 0.15 : 0);
      ctx.fillStyle = css(far ? SPIDER.legFar : SPIDER.leg, l);
      if (q === 0 && !walking) {
        // The raised, tapping front legs.
        const tap = Math.sin(c.t * 0.22 + (far ? 1.2 : 0)) * 0.35;
        leg(ctx, [[hx, -1.0], [2.5, -2.4], [3.8, -3.0 + tap]], 0.2, 0.08);
        continue;
      }
      const kx = knees[q]! + step * 0.6 + (far ? 0.15 : 0);
      const fx = feet[q]! + step + (far ? 0.25 : 0);
      leg(ctx, [[hx, -1.0], [kx, -2.5 - lift * 0.5], [fx, -lift], [fx + (q < 2 ? 0.4 : -0.4), -lift * 0.3]], 0.22, 0.08);
      // Dark bands at the knees.
      if (!far) {
        ctx.fillStyle = css(SPIDER.band, l);
        ctx.beginPath();
        ctx.arc(kx, -2.5 - lift * 0.5, 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  legs(true);
  // Abdomen: dark, raised, glossy, with pale spots.
  outline(ctx, [[-2.9, -1.5], [-2.4, -2.5], [-1.0, -2.8], [0.1, -2.2], [0.2, -1.2], [-1.0, -0.7], [-2.4, -0.9]]);
  litFill(ctx, SPIDER.back, l, -2.8, -0.7, 1.7, 0.7);
  ctx.fillStyle = css(SPIDER.spot, l, 0.9);
  for (const [sx, sy, r] of [[-0.7, -2.35, 0.2], [-1.6, -2.4, 0.22], [-2.3, -1.9, 0.17], [-1.2, -1.5, 0.15]] as const) {
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 1.2, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  glint(ctx, -1.2, -2.55, 0.55, 0.12, -0.1, l, 0.4);
  // Front body.
  outline(ctx, [[0.0, -1.3], [0.4, -2.0], [1.4, -2.1], [2.1, -1.6], [2.0, -0.9], [0.8, -0.7]]);
  litFill(ctx, SPIDER.front, l, -2.1, -0.7, 1.5, 0.7);
  glint(ctx, 1.1, -1.95, 0.45, 0.1, 0, l, 0.45);
  // Eyes on the brow, jaws and palps below.
  ctx.fillStyle = css(SPIDER.eye, l);
  for (const [ex, ey] of [[1.85, -1.75], [1.65, -1.9], [1.95, -1.55]] as const) {
    ctx.beginPath();
    ctx.arc(ex, ey, 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = css(SPIDER.front, l, 1);
  leg(ctx, [[1.9, -1.0], [2.25, -0.6]], 0.3, 0.2);
  ctx.fillStyle = css(SPIDER.leg, l);
  leg(ctx, [[1.8, -1.2], [2.5, -1.3], [2.8, -0.9]], 0.16, 0.12);
  legs(false);
  ctx.restore();
}

/**
 * A phorid fly, 2 mm: the humped thorax that names the family, a small head
 * slung low, wings longer than the body (a blur while it hovers), legs hanging,
 * and the female's hooked ovipositor curled down toward the ant below.
 */
function phorid(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, Math.max(1, c.y));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const beat = Math.sin(c.t * 2.3);
  // Far wing, then legs dangling.
  ctx.fillStyle = css(PHORID.wing, l, 0.22);
  ctx.beginPath();
  ctx.ellipse(-0.5, -0.95, 1.4, 0.42, -0.35 - beat * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(PHORID.dark, l, 0.9);
  for (const [hx, fx, fy] of [[0.35, 0.6, 0.7], [0.1, 0.0, 0.85], [-0.15, -0.7, 0.8]] as const) leg(ctx, [[hx, -0.1], [hx + (fx - hx) * 0.5, 0.35], [fx, fy]], 0.11, 0.06);
  // Abdomen, tapering to the curled ovipositor.
  outline(ctx, [[-0.1, -0.45], [-0.6, -0.55], [-1.05, -0.3], [-1.1, 0.0], [-0.7, 0.15], [-0.15, 0.1]]);
  litFill(ctx, PHORID.body, l, -0.55, 0.15, 1.4, 0.7);
  ctx.strokeStyle = css(PHORID.dark, l);
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-1.05, -0.05);
  ctx.quadraticCurveTo(-1.35, 0.35, -0.95, 0.5);
  ctx.stroke();
  // Thorax: the hump.
  outline(ctx, [[-0.15, -0.3], [0.0, -0.85], [0.4, -0.95], [0.65, -0.55], [0.55, -0.05], [0.1, 0.05]]);
  litFill(ctx, PHORID.body, l, -0.95, 0.05, 1.5, 0.7);
  glint(ctx, 0.3, -0.82, 0.18, 0.06, -0.3, l, 0.5);
  // Head, low and forward, with a dark eye.
  ctx.fillStyle = css(PHORID.body, l);
  ctx.beginPath();
  ctx.ellipse(0.78, -0.18, 0.22, 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(PHORID.dark, l);
  ctx.beginPath();
  ctx.ellipse(0.82, -0.24, 0.13, 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Near wing, veins thick along the front edge.
  ctx.save();
  ctx.translate(0.15, -0.75);
  ctx.rotate(-0.25 - beat * 0.4);
  ctx.fillStyle = css(PHORID.wing, l, 0.32);
  ctx.beginPath();
  ctx.ellipse(-0.85, 0, 1.0, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(PHORID.vein, l, 0.7);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(0, -0.05);
  ctx.lineTo(-1.1, -0.22);
  ctx.moveTo(-0.3, 0.0);
  ctx.quadraticCurveTo(-1.0, 0.1, -1.6, 0.05);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/**
 * Platyarthrus, a blind white woodlouse, 3 mm, that lives only in ant nests:
 * a low dome of overlapping plates, a fan of tail plates, stubby antennae,
 * seven pairs of short legs pattering underneath.
 */
function woodlouse(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  const step = c.t * 0.6;
  ctx.fillStyle = css(LOUSE.leg, l, 0.9);
  for (let k = 0; k < 7; k++) {
    const hx = -1.3 + k * 0.4;
    const s = Math.sin(step + k * 0.9) * 0.12;
    limb(ctx, hx, -0.35, hx + 0.12 + s, -0.02, 0.12, 0.08);
  }
  outline(ctx, [[-1.95, -0.3], [-1.6, -0.85], [-0.4, -1.15], [0.9, -1.05], [1.7, -0.6], [1.75, -0.3], [0, -0.3]]);
  litFill(ctx, LOUSE.body, l, -1.15, -0.3, 1.08, 0.78);
  // The plates' edges.
  ctx.strokeStyle = css(LOUSE.edge, l, 0.75);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const sx = 1.3 - k * 0.42;
    const top = -1.08 + Math.abs(sx - 0.1) * 0.12;
    ctx.moveTo(sx, top);
    ctx.quadraticCurveTo(sx - 0.12, -0.7, sx - 0.05, -0.32);
  }
  ctx.stroke();
  // Tail plates.
  ctx.fillStyle = css(LOUSE.edge, l, 0.9);
  limb(ctx, -1.85, -0.45, -2.25, -0.3, 0.16, 0.08);
  // Head and stubby antennae.
  ctx.fillStyle = css(LOUSE.body, l);
  ctx.beginPath();
  ctx.ellipse(1.65, -0.55, 0.3, 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LOUSE.edge, l);
  const wave = Math.sin(c.t * 0.25) * 0.15;
  leg(ctx, [[1.85, -0.65], [2.25, -0.85 + wave], [2.55, -0.7 + wave]], 0.12, 0.08);
  ctx.restore();
}

/**
 * Myrmecophilus, the ant cricket, 3 mm: wingless and egg-shaped, brown with
 * pale-rimmed segments, thick hind femora, two long cerci, long antennae.
 * It begs food from the workers by mimicking their touch.
 */
function cricket(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = css(CRICKET.dark, l, 0.85);
  leg(ctx, [[0.9, -0.5], [1.4, -0.25], [1.3, 0], [1.6, 0]], 0.14, 0.08);
  leg(ctx, [[0.3, -0.5], [0.6, -0.2], [0.3, 0], [0.6, 0]], 0.14, 0.08);
  // Cerci.
  ctx.strokeStyle = css(CRICKET.dark, l);
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-1.5, -0.7);
  ctx.quadraticCurveTo(-2.1, -0.95, -2.6, -0.8);
  ctx.moveTo(-1.5, -0.55);
  ctx.quadraticCurveTo(-2.0, -0.5, -2.5, -0.35);
  ctx.stroke();
  outline(ctx, [[-1.6, -0.6], [-1.2, -1.15], [0.0, -1.35], [1.1, -1.15], [1.5, -0.6], [1.0, -0.3], [-0.6, -0.25]]);
  litFill(ctx, CRICKET.body, l, -1.35, -0.25, 1.35, 0.7);
  ctx.strokeStyle = css(CRICKET.pale, l, 0.6);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const sx = 1.0 - k * 0.42;
    ctx.moveTo(sx, -1.2 + Math.abs(sx) * 0.12);
    ctx.quadraticCurveTo(sx - 0.1, -0.8, sx - 0.05, -0.35);
  }
  ctx.stroke();
  // The thick hind femur, tibia folded under.
  ctx.save();
  ctx.translate(-0.2, -0.55);
  ctx.rotate(-0.35);
  ctx.fillStyle = css(CRICKET.body, l);
  ctx.beginPath();
  ctx.ellipse(-0.45, 0, 0.75, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(CRICKET.pale, l, 0.35);
  ctx.beginPath();
  ctx.ellipse(-0.4, -0.12, 0.55, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = css(CRICKET.dark, l);
  leg(ctx, [[-1.05, -0.35], [-0.3, -0.05], [0.1, 0]], 0.12, 0.08);
  // Head and long antennae.
  ctx.fillStyle = css(CRICKET.body, l);
  ctx.beginPath();
  ctx.ellipse(1.45, -0.75, 0.38, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(CRICKET.dark, l);
  ctx.beginPath();
  ctx.arc(1.6, -0.85, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(CRICKET.dark, l);
  ctx.lineWidth = 0.06;
  const w = Math.sin(c.t * 0.2) * 0.3;
  ctx.beginPath();
  ctx.moveTo(1.75, -1.0);
  ctx.quadraticCurveTo(2.6, -1.8 + w, 3.6, -1.4 + w);
  ctx.stroke();
  ctx.restore();
}

/**
 * Attaephilus, a 1.5 mm beetle known only from Messor structor nests: an
 * oval, shining red-brown body, clubbed antennae, short legs.
 */
function beetlet(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  const g = c.t * 0.5;
  ctx.fillStyle = css(BEETLET.leg, l);
  for (let k = 0; k < 3; k++) {
    const hx = 0.35 - k * 0.38;
    const s = Math.sin(g + k * 2.1) * 0.1;
    leg(ctx, [[hx, -0.25], [hx + 0.15 + s, -0.12], [hx + 0.22 + s, 0]], 0.09, 0.06);
  }
  outline(ctx, [[-0.85, -0.4], [-0.6, -0.8], [0.1, -0.88], [0.55, -0.62], [0.5, -0.25], [-0.4, -0.2]]);
  litFill(ctx, BEETLET.body, l, -0.88, -0.2, 1.5, 0.65);
  glint(ctx, -0.2, -0.74, 0.3, 0.08, -0.1, l, 0.55);
  ctx.fillStyle = css(BEETLET.dark, l);
  ctx.beginPath();
  ctx.ellipse(0.72, -0.45, 0.22, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(BEETLET.leg, l);
  leg(ctx, [[0.85, -0.55], [1.1, -0.75], [1.3, -0.7]], 0.06, 0.05);
  ctx.beginPath();
  ctx.ellipse(1.34, -0.7, 0.11, 0.08, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function antlion(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  // Only the head shows above the sand: a pair of long sickle jaws, open.
  const snap = c.peck > 0 ? Math.sin(c.peck * 0.9) * 0.3 : 0;
  ctx.fillStyle = css(ANTLION.head, l);
  ctx.beginPath();
  ctx.ellipse(0, -0.2, 1.3, 0.8, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(ANTLION.jaw, l);
  ctx.lineWidth = 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 0.6, -0.6);
    ctx.quadraticCurveTo(s * (2.4 - snap * 3), -2.6, s * (1.0 - snap), -3.4);
  }
  ctx.stroke();
  // Sand flicked up at an ant on the slope.
  if (c.peck > 0) {
    ctx.fillStyle = `rgba(214,190,140,${0.6 * (c.peck / 12)})`;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.35;
      const d = 3 + (12 - c.peck) * 0.9 + k * 0.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d - 1, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** One tiny ant, 2.2 mm, pointing along (dx, dy); `egg`: carrying one. */
function tinyAnt(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number, l: RGB, egg: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  const g = Math.sin(t * 0.9) * 0.18;
  ctx.strokeStyle = css(THIEF.leg, l);
  ctx.lineWidth = 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const hx = 0.15 - k * 0.22;
    const s = (k === 1 ? -g : g);
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx + 0.25 + s, 0.45);
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx + 0.25 - s, -0.45);
  }
  ctx.moveTo(0.75, 0);
  ctx.quadraticCurveTo(1.0, 0.3, 1.25, 0.35);
  ctx.moveTo(0.75, 0);
  ctx.quadraticCurveTo(1.0, -0.3, 1.25, -0.35);
  ctx.stroke();
  ctx.fillStyle = css(THIEF.body, l);
  ctx.beginPath();
  ctx.ellipse(-0.75, 0, 0.5, 0.36, 0, 0, Math.PI * 2);
  ctx.ellipse(0.05, 0, 0.32, 0.18, 0, 0, Math.PI * 2);
  ctx.ellipse(0.62, 0, 0.27, 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(THIEF.dark, l, 0.5);
  ctx.beginPath();
  ctx.ellipse(-0.85, 0, 0.3, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  glint(ctx, -0.7, -0.12, 0.22, 0.07, 0, l, 0.5);
  if (egg) {
    ctx.fillStyle = css([242, 236, 220], l);
    ctx.beginPath();
    ctx.ellipse(1.15, 0, 0.32, 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A raiding party of thief ants: a few 2 mm workers along their gallery,
 * at the face they are digging, at the breach, or filing home with eggs.
 */
function thiefAnts(ctx: CanvasRenderingContext2D, c: Critter, world: World, light: Light): void {
  const g = c.body;
  if (!g.length) return;
  const W = world.w;
  const l = light(c.x, c.y);
  // Where the party is along the gallery (its index), and which way they face.
  let at = g.length - 1;
  if (c.state >= 2 && c.timer < 0) at = Math.max(0, g.length - 1 + c.timer);
  const home = c.state >= 2;
  for (let k = 0; k < 4; k++) {
    const j = clamp(at + (home ? k * 3 : -k * 3) + Math.round(Math.sin(c.t * 0.05 + k) * 1.2), 0, g.length - 1);
    const j2 = clamp(j + (home ? -1 : 1), 0, g.length - 1);
    const i = g[j]!;
    const i2 = g[j2]!;
    const x = (i % W) + 0.5;
    const y = ((i / W) | 0) + 0.5;
    let dx = (i2 % W) - (i % W);
    let dy = ((i2 / W) | 0) - ((i / W) | 0);
    if (dx === 0 && dy === 0) dx = c.dir;
    tinyAnt(ctx, x, y, dx, dy, c.t + k * 7, l, home && c.tone > k);
  }
}

/**
 * Lithobius: a flat ribbon of glossy plates along its path, a pair of legs
 * to each, long antennae ahead and the long last legs trailing.
 */
function centipede(ctx: CanvasRenderingContext2D, c: Critter, world: World, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
  const b = c.body;
  if (b.length < 2) return;
  const W = world.w;
  const hx = b[0]! % W;
  const hy = (b[0]! / W) | 0;
  if (hx < view.x0 - 40 || hx > view.x1 + 40 || hy < view.y0 - 40 || hy > view.y1 + 40) return;
  const l = light(hx, hy);
  // A smoothed spine through the trail of cells.
  const pts: [number, number][] = [];
  for (let k = 0; k < b.length; k++) {
    const a = b[Math.max(0, k - 1)]!;
    const m = b[k]!;
    const z = b[Math.min(b.length - 1, k + 1)]!;
    pts.push([((a % W) + (m % W) * 2 + (z % W)) / 4 + 0.5, (((a / W) | 0) + ((m / W) | 0) * 2 + ((z / W) | 0)) / 4 + 0.5]);
  }
  // Walk the spine at even spacing for the 15 segments.
  const seg: [number, number, number][] = [];
  let acc = 0;
  let k = 0;
  const step = 1.45;
  let px = pts[0]![0];
  let py = pts[0]![1];
  seg.push([px, py, 0]);
  while (seg.length < 16 && k < pts.length - 1) {
    const [x1, y1] = pts[k + 1]!;
    const d = Math.hypot(x1 - px, y1 - py);
    if (acc + d >= step) {
      const f = (step - acc) / (d || 1);
      px += (x1 - px) * f;
      py += (y1 - py) * f;
      seg.push([px, py, 0]);
      acc = 0;
    } else {
      acc += d;
      px = x1;
      py = y1;
      k++;
    }
  }
  while (seg.length < 16) {
    const [ax, ay] = seg[seg.length - 1]!;
    const [bx, by] = seg[Math.max(0, seg.length - 2)]!;
    const dx = ax - bx || -c.dir;
    const dy = ay - by;
    const m = Math.hypot(dx, dy) || 1;
    seg.push([ax + (dx / m) * step, ay + (dy / m) * step, 0]);
  }
  for (let j = 0; j < seg.length; j++) {
    const a = seg[Math.max(0, j - 1)]!;
    const z = seg[Math.min(seg.length - 1, j + 1)]!;
    seg[j]![2] = Math.atan2(a[1] - z[1], a[0] - z[0]);
  }
  ctx.lineCap = 'round';
  // Legs: one pair per segment, rippling in a wave down the body.
  ctx.strokeStyle = css(CENTI.leg, l);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  for (let j = 1; j < seg.length; j++) {
    const [x, y, a] = seg[j]!;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const wave = Math.sin(c.t * 0.6 - j * 0.9) * 0.45;
    const len = j === seg.length - 1 ? 3.2 : 1.25;
    const back = j === seg.length - 1 ? -2.6 : wave;
    for (const sd of [-1, 1]) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + nx * sd * len * 0.6 + Math.cos(a) * back * 0.4, y + ny * sd * len * 0.6 + Math.sin(a) * back * 0.4);
      ctx.lineTo(x + nx * sd * len + Math.cos(a) * (back - 0.2), y + ny * sd * len + Math.sin(a) * (back - 0.2));
    }
  }
  ctx.stroke();
  // The plates, alternately long and short, from tail to head.
  for (let j = seg.length - 1; j >= 1; j--) {
    const [x, y, a] = seg[j]!;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    // Flat plates, wider than long, the long and short ones alternating.
    const wide = (j % 2 === 0 ? 1.15 : 0.95) * (j > 12 ? 0.85 : 1);
    ctx.fillStyle = css(CENTI.body, l);
    outline(ctx, [[0.85, -wide * 0.8], [0.85, wide * 0.8], [-0.75, wide], [-0.75, -wide]]);
    ctx.fill();
    ctx.strokeStyle = css(CENTI.dark, l, 0.85);
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(-0.7, -wide * 0.9);
    ctx.lineTo(-0.7, wide * 0.9);
    ctx.stroke();
    glint(ctx, 0.05, -wide * 0.4, 0.45, 0.12, 0, l, 0.32);
    ctx.restore();
  }
  // Head, poison claws, antennae.
  const [x0, y0, a0] = seg[0]!;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a0);
  ctx.fillStyle = css(CENTI.head, l);
  ctx.beginPath();
  ctx.ellipse(0.2, 0, 1.0, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(CENTI.dark, l);
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  ctx.moveTo(0.9, 0.5);
  ctx.quadraticCurveTo(1.6, 0.4, 1.5, 0.05);
  ctx.moveTo(0.9, -0.5);
  ctx.quadraticCurveTo(1.6, -0.4, 1.5, -0.05);
  ctx.stroke();
  ctx.strokeStyle = css(CENTI.leg, l);
  ctx.fillStyle = css(CENTI.leg, l);
  const sw = Math.sin(c.t * 0.3) * 0.6;
  antenna(ctx, 0.9, -0.4, 3.5, -1.8 + sw, 6.0, -1.0 + sw, 0.1, 10);
  antenna(ctx, 0.9, 0.4, 3.5, 1.8 - sw, 6.0, 1.0 - sw, 0.1, 10);
  ctx.restore();
}

/**
 * The mole cricket, 4 cm, side on along its heading: a small head, the great
 * velvet pronotum, shovel forelegs with their teeth, short wing covers over a
 * soft ringed abdomen, the hind wings rolled into points, two long cerci.
 */
function moleCricket(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 0.5);
  const a = Math.atan2(c.vy, c.vx || c.dir);
  const flip = Math.cos(a) < 0 ? -1 : 1;
  ctx.rotate(flip < 0 ? a + Math.PI : a);
  ctx.scale(flip, 1);
  ctx.translate(0, 2.8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dig = Math.sin(c.t * 0.35);
  // Far shovel.
  ctx.fillStyle = css(MOLE.dark, l, 0.9);
  outline(ctx, [[2.6, -1.6], [5.2, -0.6 + dig * 0.4], [6.2, 0.3 + dig * 0.4], [4.6, 0.6], [2.8, -0.6]]);
  ctx.fill();
  // Cerci.
  ctx.strokeStyle = css(MOLE.dark, l);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(-23, -2.6);
  ctx.quadraticCurveTo(-27, -3.6, -30.5, -3.0);
  ctx.moveTo(-23, -2.2);
  ctx.quadraticCurveTo(-27, -1.8, -30, -0.8);
  ctx.stroke();
  // Hind and middle legs.
  ctx.fillStyle = css(MOLE.leg, l);
  leg(ctx, [[-9, -1.5], [-12.5, -3.6], [-14.5, 0.2], [-16.2, 0.4]], 1.4, 0.5);
  leg(ctx, [[-3, -1.4], [-4.4, -0.8], [-5.6, 0.3], [-6.8, 0.3]], 0.8, 0.4);
  // Abdomen: soft, ringed, tapering.
  outline(ctx, [[-23.5, -2.5], [-21, -5.4], [-12, -6.6], [-5, -6.2], [-4, -1.8], [-10, -0.6], [-19, -0.9]]);
  litFill(ctx, MOLE.belly, l, -6.6, -0.6, 1.2, 0.75);
  ctx.strokeStyle = css(MOLE.dark, l, 0.4);
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const sx = -6 - k * 2.4;
    ctx.moveTo(sx, -0.8);
    ctx.quadraticCurveTo(sx - 0.6, -3.6, sx + 0.1, -6.2 + k * 0.25);
  }
  ctx.stroke();
  // Hind wings rolled into points, past the abdomen.
  ctx.fillStyle = css(MOLE.wing, l, 0.9);
  outline(ctx, [[-6, -6.4], [-16, -6.9], [-25.5, -5.8], [-24, -5.0], [-14, -5.6], [-6, -5.4]]);
  ctx.fill();
  // Wing covers: short, veined.
  outline(ctx, [[-4.2, -6.8], [-9, -7.3], [-14.5, -6.6], [-14.2, -4.6], [-8, -4.4], [-4, -4.8]]);
  litFill(ctx, MOLE.wing, l, -7.3, -4.4, 1.35, 0.8);
  ctx.strokeStyle = css(MOLE.dark, l, 0.55);
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(-4.4, -6.2);
  ctx.quadraticCurveTo(-9, -6.6, -14, -6.0);
  ctx.moveTo(-6, -7.0);
  ctx.lineTo(-7, -4.6);
  ctx.moveTo(-9.5, -7.1);
  ctx.lineTo(-10.2, -4.5);
  ctx.moveTo(-12.4, -6.9);
  ctx.lineTo(-12.8, -4.6);
  ctx.stroke();
  // Pronotum: a big velvet shield.
  outline(ctx, [[-5.2, -2.4], [-5.4, -6.4], [-2, -8.0], [2.6, -7.8], [4.6, -5.6], [4.4, -2.0], [0, -1.2]]);
  litFill(ctx, MOLE.body, l, -8.0, -1.2, 1.45, 0.7);
  ctx.fillStyle = css(MOLE.velvet, l, 0.35);
  ctx.beginPath();
  ctx.ellipse(-0.6, -6.4, 4.0, 1.1, -0.05, 0, Math.PI * 2);
  ctx.fill();
  // Head: small, low, with the eye and short antennae.
  outline(ctx, [[4.2, -2.0], [4.4, -5.0], [6.4, -5.4], [8.0, -4.0], [7.8, -2.0], [5.8, -1.4]]);
  litFill(ctx, MOLE.body, l, -5.4, -1.4, 1.35, 0.7);
  ctx.fillStyle = css([24, 16, 10], l);
  ctx.beginPath();
  ctx.ellipse(6.4, -4.2, 0.55, 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  glint(ctx, 6.3, -4.4, 0.18, 0.12, 0, l, 0.6);
  ctx.strokeStyle = css(MOLE.dark, l);
  ctx.fillStyle = css(MOLE.dark, l);
  antenna(ctx, 7.6, -4.4, 9.4, -6.2 + dig * 0.3, 11.6, -5.4, 0.18, 9);
  // The near shovel: broad tibia with four teeth, scooping.
  ctx.save();
  ctx.translate(3.2, -1.8);
  ctx.rotate(0.25 + dig * 0.3);
  ctx.fillStyle = css(MOLE.leg, l);
  outline(ctx, [[-0.6, -0.6], [1.6, -1.0], [3.2, -0.4], [3.4, 0.9], [1.0, 1.0], [-0.6, 0.6]]);
  litFill(ctx, MOLE.leg, l, -1.0, 1.0, 1.3, 0.7);
  ctx.fillStyle = css(MOLE.dark, l);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(3.0 - k * 0.55, 0.85);
    ctx.lineTo(3.25 - k * 0.55, 1.8);
    ctx.lineTo(2.75 - k * 0.55, 0.95);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- toad

/**
 * A green toad, about 6 cm, sitting side on: squat and warty, a kidney-shaped
 * gland behind the gold eye, green blotches on grey. Hopping, the hind legs
 * kick out. Feeding, the sticky tongue flicks out to the ant and back.
 */
function drawToad(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 10);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const breathe = Math.sin(c.t * 0.12) * 0.6;
  const air = c.air;
  // Far hind leg.
  ctx.fillStyle = css(TOAD.base, l, 0.85);
  if (air) leg(ctx, [[-20, -9], [-30, -6], [-40, -3], [-46, -2]], 6, 2.4);
  else outline(ctx, [[-24, -6], [-18, -14], [-10, -10], [-12, -2], [-22, -1]]);
  ctx.fill();
  // Body: a warty dome, head low and wide.
  const body: Pt[] = [[-27, -5], [-24, -17], [-12, -25], [2, -24], [14, -21], [24, -16], [29, -9], [26, -4], [16, -2 + breathe], [0, -2], [-16, -2]];
  outline(ctx, body);
  litFill(ctx, TOAD.base, l, -25, -2, 1.12, 0.62);
  // Pale throat and belly.
  ctx.fillStyle = css(TOAD.belly, l, 0.85);
  ctx.beginPath();
  ctx.ellipse(10, -4 + breathe * 0.5, 15, 3.4 + breathe * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Green marbling, each blotch edged darker.
  ctx.save();
  outline(ctx, body);
  ctx.clip();
  const blot = (x: number, y: number, rx: number, ry: number, rot: number): void => {
    ctx.fillStyle = css(TOAD.edge, l, 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 0.9, ry + 0.9, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(TOAD.blotch, l);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const v = (c.tone % 7) - 3;
  blot(-14, -15, 6, 3.6, 0.3);
  blot(-2 + v * 0.4, -22, 5, 2.6, -0.1);
  blot(-20, -7, 3.6, 2.6, 0.5);
  blot(5, -13, 4.2, 3, -0.2);
  blot(18, -12, 3.2, 2.2, 0.2);
  blot(-6, -7, 3.4, 2.2, 0);
  // Warts.
  ctx.fillStyle = css(TOAD.wart, l, 0.9);
  for (let k = 0; k < 26; k++) {
    const x = -24 + ((k * 37) % 46);
    const y = -21 + ((k * 13) % 16);
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + (k % 3) * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = css(TOAD.dark, l, 0.5);
  ctx.lineWidth = 0.5;
  outline(ctx, body);
  ctx.stroke();
  // The gland behind the eye.
  ctx.fillStyle = css(TOAD.base, l);
  ctx.beginPath();
  ctx.ellipse(9, -21, 6.5, 2.6, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(TOAD.edge, l, 0.6);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  // Mouth line.
  ctx.strokeStyle = css(TOAD.dark, l, 0.7);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(28.5, -9.5);
  ctx.quadraticCurveTo(22, -9, 15, -12);
  ctx.stroke();
  // The eye: a bulging gold iris with a level black pupil.
  ctx.fillStyle = css(TOAD.base, l);
  ctx.beginPath();
  ctx.ellipse(19, -19.5, 5.4, 5, 0, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.strokeStyle = css(TOAD.edge, l, 0.6);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = css(TOAD.dark, l);
  ctx.beginPath();
  ctx.arc(19, -19, 3.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(TOAD.eye, l);
  ctx.beginPath();
  ctx.arc(19, -19, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(TOAD.dark, l);
  ctx.beginPath();
  ctx.ellipse(19.3, -19, 2.3, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  glint(ctx, 18, -20.3, 0.9, 0.55, 0, l, 0.75);
  // Front leg and fingers (a shade darker than the flank, and outlined).
  ctx.fillStyle = css(TOAD.edge, l, 0.55);
  leg(ctx, [[15, -9.5], [17.2, -5], [18, -0.5]], 5.2, 3.4);
  ctx.fillStyle = css(TOAD.wart, l);
  leg(ctx, [[15, -9], [17, -5], [18, -0.5]], 4.2, 2.6);
  ctx.strokeStyle = css(TOAD.wart, l);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const d of [-2, 0, 2.2]) {
    ctx.moveTo(18, -0.6);
    ctx.lineTo(19.5 + d, 0);
  }
  ctx.stroke();
  // Near hind leg: a folded thigh and a long foot forward (or kicked out in a hop).
  ctx.fillStyle = css(TOAD.base, l);
  if (air) {
    leg(ctx, [[-16, -10], [-28, -8], [-38, -4], [-48, -3]], 7, 2.8);
  } else {
    ctx.beginPath();
    ctx.ellipse(-15, -8.5, 10, 6.4, -0.25, 0, Math.PI * 2);
    litFill(ctx, TOAD.base, l, -15, -2, 1.1, 0.7);
    ctx.strokeStyle = css(TOAD.edge, l, 0.55);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = css(TOAD.blotch, l, 0.85);
    ctx.beginPath();
    ctx.ellipse(-16, -10, 4.6, 2.2, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(TOAD.edge, l, 0.55);
    leg(ctx, [[-22, -3], [-12, -1], [-2, -0.6]], 5, 3);
    ctx.fillStyle = css(TOAD.wart, l);
    leg(ctx, [[-22, -3], [-12, -1], [-2, -0.6]], 4, 2.2);
  }
  // The tongue: out to the ant and back.
  if (c.peck > 0 && c.px !== undefined && c.pr !== undefined) {
    const f = c.peck > 3.5 ? (7 - c.peck) / 3.5 : c.peck / 3.5;
    const tx = (c.px - c.x) * c.dir;
    const ty = c.pr - c.y;
    const ex = 28 + (tx - 28) * f;
    const ey = -9.5 + (ty + 9.5) * f;
    ctx.strokeStyle = css(TOAD.tongue, l);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(27, -9.5);
    ctx.quadraticCurveTo((27 + ex) / 2, Math.min(-9.5, ey) - 2, ex, ey);
    ctx.stroke();
    ctx.fillStyle = css(TOAD.tongue, l);
    ctx.beginPath();
    ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- lizard

/**
 * A sand lizard, about 18 cm with its tail, flat to the ground: a brown back
 * with rows of dark, white-centred spots, flanks green on a male, legs
 * splayed and swinging as it runs. A flick of the forked tongue now and then.
 */
function drawLizard(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 4);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const male = c.tone >= 128;
  const flank = male ? LIZARD.flankM : LIZARD.flankF;
  const gait = c.vx > 0 ? Math.sin(c.x * 0.5) : 0;
  const sway = Math.sin(c.x * 0.25) * (c.vx > 0 ? 1.5 : 0);
  // Far legs.
  ctx.fillStyle = css(flank, l, 0.7);
  leg(ctx, [[22, -4], [25 - gait * 3, -2], [28 - gait * 5, 0]], 2.2, 1);
  leg(ctx, [[-22, -4], [-26 + gait * 3, -2], [-30 + gait * 5, 0]], 2.6, 1.1);
  // Tail: long, tapering, a little wave in it when running.
  ctx.fillStyle = css(LIZARD.back, l);
  ctx.beginPath();
  ctx.moveTo(-28, -10);
  ctx.quadraticCurveTo(-70, -6 + sway, -128, -1.2);
  ctx.quadraticCurveTo(-70, -1 + sway, -28, -1.8);
  ctx.closePath();
  litFill(ctx, LIZARD.back, l, -8, -1, 1.15, 0.7);
  // Body: long and low.
  const body: Pt[] = [[-30, -2], [-31, -10], [-12, -13], [10, -13], [26, -11.4], [32, -8.4], [32, -2.5], [14, -1.2], [-12, -1.2]];
  outline(ctx, body);
  litFill(ctx, flank, l, -10.5, -1.2, 1.1, 0.75);
  ctx.save();
  outline(ctx, body);
  ctx.clip();
  // The brown band down the back, and the pale belly edge.
  ctx.fillStyle = css(LIZARD.back, l);
  ctx.fillRect(-33, -14, 68, 6.4);
  ctx.fillStyle = css(LIZARD.belly, l, 0.8);
  ctx.fillRect(-32, -3, 66, 2);
  // Rows of dark spots, each with a small white centre, not quite in line.
  for (let k = 0; k < 11; k++) {
    for (const row of [0, 1]) {
      const j = (k * 37 + row * 11 + c.tone) % 7;
      const x = -27 + k * 5.6 + row * 2.6 + (j - 3) * 0.4;
      const y = (row ? -6.8 : -10.6) + ((j % 3) - 1) * 0.4;
      const r = 1 + (j % 3) * 0.2;
      ctx.fillStyle = css(LIZARD.spot, l, 0.9);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.3, r * 0.75, 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (j % 2 === 0) {
        ctx.fillStyle = css(LIZARD.dot, l, 0.9);
        ctx.beginPath();
        ctx.arc(x + 0.2, y, 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  // Head: a blunt wedge, the eye ringed gold.
  const head: Pt[] = [[27, -2.4], [28, -11.5], [36, -12.2], [44, -9], [47.5, -5], [43, -2.2]];
  outline(ctx, head);
  litFill(ctx, male ? flank : LIZARD.back, l, -12.2, -2.2, 1.2, 0.75);
  ctx.fillStyle = css(LIZARD.back, l, 0.8);
  ctx.beginPath();
  ctx.ellipse(36, -10.6, 7, 1.6, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LIZARD.eye, l);
  ctx.beginPath();
  ctx.arc(38.5, -8, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css([20, 14, 8], l);
  ctx.beginPath();
  ctx.arc(38.6, -8, 1.1, 0, Math.PI * 2);
  ctx.fill();
  glint(ctx, 38, -8.7, 0.45, 0.3, 0, l, 0.8);
  // Ear opening and the mouth line.
  ctx.fillStyle = css(LIZARD.spot, l, 0.6);
  ctx.beginPath();
  ctx.ellipse(31.5, -6.5, 1, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(LIZARD.spot, l, 0.6);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(47, -4.4);
  ctx.lineTo(35, -4);
  ctx.stroke();
  if (c.peck > 0) {
    ctx.strokeStyle = css(LIZARD.tongue, l);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(47, -4.6);
    ctx.lineTo(51.5, -4.8);
    ctx.lineTo(53, -5.8);
    ctx.moveTo(51.5, -4.8);
    ctx.lineTo(53, -3.8);
    ctx.stroke();
  }
  // Near legs, splayed: toes long.
  ctx.fillStyle = css(flank, l);
  leg(ctx, [[20, -5], [23 + gait * 3, -1.5], [26 + gait * 5, 0.2]], 3.2, 1.2);
  leg(ctx, [[-20, -5], [-24 - gait * 3, -1.5], [-29 - gait * 5, 0.2]], 3.8, 1.4);
  ctx.restore();
}

// ---------------------------------------------------------------- mole

/**
 * A mole in its tunnel, side on, head first: velvet fur, a pink snout, the
 * huge pink spade hands turned out and raking at the soil ahead, a stub of a
 * tail. (c.x, c.y) is the tip of its snout.
 */
function drawMole(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x - c.dir * 40, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 0.5);
  ctx.scale(c.dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const rake = Math.sin(c.t * 0.45);
  // Far hand.
  ctx.save();
  ctx.translate(-16, 6);
  ctx.rotate(-0.4 - rake * 0.35);
  ctx.fillStyle = css(TALPA.palm, l, 0.75);
  ctx.beginPath();
  ctx.ellipse(6, 0, 7, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Tail with bristles.
  ctx.strokeStyle = css(TALPA.fur, l);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-100, -2);
  ctx.quadraticCurveTo(-108, -4, -112, -8);
  ctx.stroke();
  // Body: a velvet cylinder, fattest behind the shoulders.
  const body: Pt[] = [[-104, 2], [-104, -10], [-90, -17], [-60, -18], [-30, -15], [-12, -9], [-4, -3], [-10, 5], [-34, 11], [-70, 12], [-96, 9]];
  outline(ctx, body);
  litFill(ctx, TALPA.fur, l, -18, 12, 1.6, 0.6);
  // The sheen of velvet, and the lie of the fur.
  ctx.save();
  outline(ctx, body);
  ctx.clip();
  const g = ctx.createLinearGradient(0, -18, 0, -6);
  g.addColorStop(0, css(TALPA.sheen, l, 0.55));
  g.addColorStop(1, css(TALPA.sheen, l, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-106, -19, 104, 13);
  ctx.strokeStyle = css(TALPA.dark, l, 0.35);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  for (let k = 0; k < 24; k++) {
    const x = -100 + k * 4;
    ctx.moveTo(x, -12 + (k % 3));
    ctx.quadraticCurveTo(x - 2, -2, x - 1, 8 - (k % 2) * 2);
  }
  ctx.stroke();
  ctx.restore();
  // Hind foot.
  ctx.fillStyle = css(TALPA.pink, l, 0.9);
  ctx.beginPath();
  ctx.ellipse(-84, 11.5, 5, 1.8, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Snout: a long pink cone, nostrils at the tip; a pinprick of an eye in the fur.
  ctx.fillStyle = css(TALPA.pink, l);
  outline(ctx, [[-10, -7], [-2, -4.5], [5, -1.6], [6, 0.2], [2, 1.4], [-8, 1.8]]);
  ctx.fill();
  ctx.fillStyle = css(TALPA.dark, l, 0.7);
  ctx.beginPath();
  ctx.arc(5, -0.4, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(TALPA.dark, l);
  ctx.beginPath();
  ctx.arc(-16, -9.5, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // Whiskers.
  ctx.strokeStyle = css(TALPA.claw, l, 0.5);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (const d of [-3, 0, 3]) {
    ctx.moveTo(1, -2);
    ctx.lineTo(9, -4 + d);
  }
  ctx.stroke();
  // The near spade hand, palm out, five claws, raking.
  ctx.save();
  ctx.translate(-18, 7);
  ctx.rotate(-0.2 + rake * 0.4);
  ctx.fillStyle = css(TALPA.palm, l);
  ctx.beginPath();
  ctx.ellipse(7, 0, 8, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(TALPA.dark, l, 0.25);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.fillStyle = css(TALPA.claw, l);
  for (let k = 0; k < 5; k++) {
    const a = -0.7 + k * 0.35;
    const x = 7 + Math.cos(a) * 7.6;
    const y = Math.sin(a) * 5.2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 2, 0.8, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

const DEAD = {
  hopper: hex('#7a6a3c'),
  hopperDark: hex('#4f4426'),
  beetle: hex('#16130f'),
  beetleSheen: hex('#3a424a'),
  worm: hex('#9a6560'),
  wormDark: hex('#74484a'),
};

/**
 * Dead insects and worms lying whole on the ground (see Carcasses): a
 * grasshopper on its side, legs stiff; a beetle on its back, legs curled up;
 * a stranded worm. They shrink as pieces are cut off, and lean the way the
 * workers drag them.
 */
export function drawCarcasses(ctx: CanvasRenderingContext2D, list: Carcass[], light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const c of list) {
    if (c.x < view.x0 - 30 || c.x > view.x1 + 30 || c.y < view.y0 - 20 || c.y > view.y1 + 20) continue;
    const l = light(c.x, c.y - 2);
    const k = 0.45 + 0.55 * (c.pieces / c.whole);
    ctx.save();
    ctx.translate(c.x + 0.5, c.y + 1);
    ctx.rotate(c.pull * 0.06);
    ctx.scale(c.dir * k, k);
    ctx.lineCap = 'round';
    if (c.kind === 'hopper') {
      ctx.restore();
      ctx.save();
      ctx.translate(c.x + 0.5, c.y + 1);
      ctx.rotate(c.pull * 0.06);
      ctx.scale(k, k);
      grasshopper(ctx, 0, 0, c.dir, false, 0, 0, 0, true, l, true);
    } else if (c.kind === 'beetle') {
      ctx.restore();
      ctx.save();
      ctx.translate(c.x + 0.5, c.y + 1);
      ctx.rotate(c.pull * 0.06);
      ctx.scale(k, k);
      groundBeetle(ctx, 0, 0, c.dir, 0, l, true);
    } else {
      // A stranded worm, gone dull and limp.
      ctx.strokeStyle = css(DEAD.wormDark, l);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-11, -1.3);
      ctx.bezierCurveTo(-5, -0.4, -2, -2.4, 4, -1.2);
      ctx.quadraticCurveTo(8, -0.6, 11, -1.1);
      ctx.stroke();
      ctx.strokeStyle = css(DEAD.worm, l);
      ctx.lineWidth = 1.9;
      ctx.stroke();
    }
    ctx.restore();
  }
}
