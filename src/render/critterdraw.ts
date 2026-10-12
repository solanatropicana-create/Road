import type { Critter } from '../sim/critters';
import type { Carcass } from '../sim/carcass';
import type { World } from '../world/world';
import { RGB, hex } from './palette';

type Light = (x: number, y: number) => RGB;

const css = (c: RGB, l: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;

// Crested lark: sandy, streaked upperparts, pale belly, a spiky crest.
const LARK = {
  back: hex('#8d6d48'),
  dark: hex('#4b3522'),
  belly: hex('#dccdae'),
  breast: hex('#c4ad86'),
  streak: hex('#5b4130'),
  bill: hex('#cdb48a'),
  leg: hex('#c29a84'),
  eye: hex('#140d0a'),
};
const HOPPER = { body: hex('#6f7034'), dark: hex('#4a4a22'), wing: hex('#7d6f45'), leg: hex('#5d5c2b') };
const BEETLE = { body: hex('#141210'), sheen: hex('#3d4650'), leg: hex('#1d1a17') };
const WORM = { body: hex('#b0706c'), dark: hex('#8a5250'), band: hex('#c98d80') };
// Zodarion: a red-brown front body, a dark abdomen with pale spots, banded legs.
const SPIDER = { front: hex('#6e3a22'), back: hex('#2b2018'), spot: hex('#d9c7a2'), leg: hex('#8a5a3a') };
const PHORID = { body: hex('#4e4030'), wing: hex('#c8d4dc') };
const LOUSE = { body: hex('#e8e2d4'), edge: hex('#b9b09c') };
const CRICKET = { body: hex('#7a5a3a'), dark: hex('#4e3825') };
const BEETLET = { body: hex('#8e4a26'), dark: hex('#5a2c16') };
const ANTLION = { jaw: hex('#8a6a40'), head: hex('#6b5232') };

/**
 * The other animals, drawn over the slice at screen resolution like the
 * ants. Units are millimetres; a crested lark is about 17 cm from bill to
 * tail, so here it towers over everything.
 */
export function drawCritters(ctx: CanvasRenderingContext2D, list: Critter[], world: World, light: Light, view: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const c of list) {
    const pad = c.kind === 'lark' ? 200 : 40;
    if (c.kind !== 'worm' && (c.x < view.x0 - pad || c.x > view.x1 + pad || c.y < view.y0 - pad || c.y > view.y1 + pad)) continue;
    switch (c.kind) {
      case 'lark': lark(ctx, c, light); break;
      case 'hopper': hopper(ctx, c, light); break;
      case 'beetle': beetle(ctx, c, light); break;
      case 'worm': worm(ctx, c, world, light, view); break;
      case 'spider': spider(ctx, c, light); break;
      case 'phorid': phorid(ctx, c, light); break;
      case 'woodlouse': woodlouse(ctx, c, light); break;
      case 'cricket': cricket(ctx, c, light); break;
      case 'beetlet': beetlet(ctx, c, light); break;
      case 'antlion': antlion(ctx, c, light); break;
    }
  }
}

function lark(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const S = 170;
  const l = light(c.x, Math.max(1, c.y - 30));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir * S, S);
  const flying = c.state !== 1;
  // Pecking tips the whole bird forward about its hips.
  const peck = c.peck > 0 ? Math.sin((c.peck / 12) * Math.PI) : 0;
  const lw = 1 / S;
  if (!flying) {
    // Legs: thin, pinkish, long hind claw.
    ctx.strokeStyle = css(LARK.leg, l);
    ctx.lineWidth = 0.012;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const tuck = c.air ? 0.07 : 0;
    for (const [hx, fx] of [[0.02, 0.05], [-0.05, -0.03]] as const) {
      ctx.moveTo(hx, -0.17);
      ctx.lineTo((hx + fx) / 2 - 0.02, -0.08 - tuck);
      ctx.lineTo(fx, -tuck);
      ctx.moveTo(fx - 0.05, -tuck);
      ctx.lineTo(fx + 0.05, -tuck);
    }
    ctx.stroke();
  }
  ctx.translate(0, -0.17);
  ctx.rotate(peck * 0.55 + (flying ? -0.1 : 0));
  ctx.translate(0, 0.17);
  // Tail.
  ctx.fillStyle = css(LARK.dark, l);
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.33);
  ctx.lineTo(-0.63, -0.3);
  ctx.lineTo(-0.62, -0.25);
  ctx.lineTo(-0.3, -0.25);
  ctx.closePath();
  ctx.fill();
  // Body and pale underside.
  ctx.fillStyle = css(LARK.back, l);
  ctx.beginPath();
  ctx.ellipse(-0.04, -0.3, 0.33, 0.155, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LARK.belly, l);
  ctx.beginPath();
  ctx.ellipse(0.0, -0.24, 0.26, 0.085, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LARK.breast, l);
  ctx.beginPath();
  ctx.ellipse(0.15, -0.31, 0.12, 0.09, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Breast streaks.
  ctx.fillStyle = css(LARK.streak, l, 0.8);
  for (let k = 0; k < 9; k++) {
    const sx = 0.1 + (k % 3) * 0.035 + ((k * 7) % 5) * 0.004;
    const sy = -0.36 + Math.floor(k / 3) * 0.026;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 0.009, 0.005, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head with crest, eye stripe and bill.
  ctx.fillStyle = css(LARK.back, l);
  ctx.beginPath();
  ctx.arc(0.27, -0.43, 0.095, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LARK.dark, l);
  ctx.beginPath();
  ctx.moveTo(0.21, -0.505);
  ctx.lineTo(0.155, -0.585);
  ctx.lineTo(0.185, -0.57);
  ctx.lineTo(0.27, -0.515);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(LARK.belly, l, 0.85);
  ctx.lineWidth = 0.011;
  ctx.beginPath();
  ctx.moveTo(0.24, -0.465);
  ctx.quadraticCurveTo(0.3, -0.485, 0.35, -0.46);
  ctx.stroke();
  ctx.fillStyle = css(LARK.eye, l);
  ctx.beginPath();
  ctx.arc(0.3, -0.44, 0.016, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.7 * l[0]})`;
  ctx.beginPath();
  ctx.arc(0.305, -0.446, 0.005, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(LARK.bill, l);
  ctx.beginPath();
  ctx.moveTo(0.35, -0.455);
  ctx.lineTo(0.47, -0.425);
  ctx.lineTo(0.35, -0.405);
  ctx.closePath();
  ctx.fill();
  // Wing: folded on the side, or beating in flight.
  if (flying) {
    const beat = Math.sin(c.t * 0.55);
    ctx.fillStyle = css(LARK.dark, l);
    ctx.beginPath();
    ctx.moveTo(0.05, -0.36);
    ctx.quadraticCurveTo(-0.1, -0.36 - 0.42 * beat, -0.32, -0.33 - 0.5 * beat);
    ctx.quadraticCurveTo(-0.22, -0.3 - 0.2 * beat, -0.15, -0.3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = css(LARK.dark, l, 0.9);
    ctx.beginPath();
    ctx.ellipse(-0.13, -0.32, 0.23, 0.085, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Pale feather edges.
    ctx.strokeStyle = css(LARK.breast, l, 0.75);
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const fx = -0.02 - k * 0.07;
      ctx.moveTo(fx, -0.36 + k * 0.004);
      ctx.quadraticCurveTo(fx - 0.04, -0.31, fx - 0.07, -0.27);
    }
    ctx.stroke();
  }
  // Streaks on the back.
  ctx.strokeStyle = css(LARK.streak, l, 0.7);
  ctx.lineWidth = lw * 1.5;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const sx = 0.14 - k * 0.07;
    ctx.moveTo(sx, -0.43 + k * 0.012);
    ctx.lineTo(sx - 0.05, -0.41 + k * 0.012);
  }
  ctx.stroke();
  ctx.restore();
}

function hopper(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 3);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir, 1);
  if (c.air) ctx.rotate(Math.atan2(c.vy, Math.abs(c.vx) + 0.01) * 0.3);
  const brown = c.state === 1;
  const body = brown ? hex('#7a6340') : HOPPER.body;
  ctx.lineCap = 'round';
  // Hind leg: folded at rest, thrown straight when leaping.
  ctx.strokeStyle = css(HOPPER.leg, l);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-1, -3.5);
  if (c.air) ctx.lineTo(-9, -1.5);
  else ctx.lineTo(-9, -7.5);
  ctx.stroke();
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  if (c.air) {
    ctx.moveTo(-9, -1.5);
    ctx.lineTo(-17, 1.5);
  } else {
    ctx.moveTo(-9, -7.5);
    ctx.lineTo(-4, 0);
  }
  // Front and middle legs.
  ctx.moveTo(7, -2.5);
  ctx.lineTo(8.5, 0);
  ctx.moveTo(4, -2.2);
  ctx.lineTo(4.5, 0);
  ctx.stroke();
  // Body.
  ctx.fillStyle = css(body, l);
  ctx.beginPath();
  ctx.ellipse(0, -3.4, 11.5, 2.5, -0.04, 0, Math.PI * 2);
  ctx.fill();
  // Folded wings along the back.
  ctx.fillStyle = css(brown ? hex('#5e4c33') : HOPPER.wing, l, 0.9);
  ctx.beginPath();
  ctx.ellipse(-3.5, -5, 9.5, 1.3, 0.05, 0, Math.PI * 2);
  ctx.fill();
  // Head, eye, antennae.
  ctx.fillStyle = css(body, l);
  ctx.beginPath();
  ctx.ellipse(11, -4.2, 2.6, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(HOPPER.dark, l);
  ctx.beginPath();
  ctx.arc(12.2, -5.2, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(HOPPER.dark, l);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(12.5, -6.6);
  ctx.quadraticCurveTo(16, -11, 22, -10);
  ctx.stroke();
  ctx.restore();
}

function beetle(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 2);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir, 1);
  // Legs, stepping.
  const g = c.timer > 0 ? 0 : c.t * 0.35;
  ctx.strokeStyle = css(BEETLE.leg, l);
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const hx = 3 - k * 2.6;
    const q = g + (k === 1 ? Math.PI : 0);
    ctx.moveTo(hx, -1.8);
    ctx.lineTo(hx + 1.4 + Math.sin(q) * 0.9, -0.2 - Math.max(0, Math.cos(q)) * 0.5);
  }
  ctx.stroke();
  // Wing cases with a blue-grey sheen, pronotum, head, antennae.
  ctx.fillStyle = css(BEETLE.body, l);
  ctx.beginPath();
  ctx.ellipse(-1.2, -2.9, 4.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4.2, -2.8, 1.8, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6.4, -2.6, 1.2, 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(BEETLE.sheen, l, 0.55);
  ctx.beginPath();
  ctx.ellipse(-1.5, -4.0, 3.2, 0.5, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(BEETLE.leg, l);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(7.2, -3.1);
  ctx.quadraticCurveTo(9, -5, 11, -4.6);
  ctx.stroke();
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

function spider(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y - 1);
  const k = c.tone < 90 ? 0.7 : 1;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir * k, k);
  ctx.lineCap = 'round';
  // Eight legs, the front pair raised like antennae (ant-like stance).
  const g = c.state === 2 ? c.t * 0.25 : 0;
  ctx.strokeStyle = css(SPIDER.leg, l);
  ctx.lineWidth = 0.28;
  ctx.beginPath();
  for (let q = 0; q < 4; q++) {
    const hx = 0.9 - q * 0.45;
    const s = Math.sin(g + q * 1.6) * 0.4;
    if (q === 0) {
      ctx.moveTo(hx, -1.4);
      ctx.quadraticCurveTo(hx + 1.2, -2.6, hx + 2.4, -2.3);
    } else {
      ctx.moveTo(hx, -1.2);
      ctx.quadraticCurveTo(hx + (q < 2 ? 1.2 : -1.0) + s, -2.0, hx + (q < 2 ? 1.6 : -1.6) + s, 0);
    }
  }
  ctx.stroke();
  // Front body and abdomen.
  ctx.fillStyle = css(SPIDER.front, l);
  ctx.beginPath();
  ctx.ellipse(0.7, -1.35, 1.0, 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(SPIDER.back, l);
  ctx.beginPath();
  ctx.ellipse(-1.0, -1.45, 1.35, 0.95, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(SPIDER.spot, l, 0.85);
  for (const [sx, sy] of [[-0.6, -1.9], [-1.4, -1.8], [-1.0, -1.2]] as const) {
    ctx.beginPath();
    ctx.arc(sx, sy, 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function phorid(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, Math.max(1, c.y));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.dir, 1);
  // Wings a blur of fast beats.
  ctx.fillStyle = css(PHORID.wing, l, 0.35 + 0.2 * Math.sin(c.t * 2.1));
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.75, 1.0, 0.35, -0.5 + Math.sin(c.t * 1.7) * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // The humped thorax that gives phorids their name ("hump-backed flies").
  ctx.fillStyle = css(PHORID.body, l);
  ctx.beginPath();
  ctx.ellipse(0.1, -0.3, 0.55, 0.45, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.6, -0.05, 0.6, 0.3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.6, -0.05, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function woodlouse(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  // Blind and white: Platyarthrus, a woodlouse that lives only with ants.
  ctx.fillStyle = css(LOUSE.body, l);
  ctx.beginPath();
  ctx.ellipse(0, -0.75, 1.7, 0.75, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(LOUSE.edge, l, 0.8);
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  for (let k = -1.2; k <= 1.2; k += 0.4) {
    ctx.moveTo(k, -0.75);
    ctx.lineTo(k * 0.95, -1.4 + Math.abs(k) * 0.35);
  }
  ctx.moveTo(1.6, -0.9);
  ctx.lineTo(2.3, -1.4);
  ctx.stroke();
  ctx.restore();
}

function cricket(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  // Myrmecophilus: a small wingless cricket with thick hind legs.
  ctx.strokeStyle = css(CRICKET.dark, l);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.9);
  ctx.lineTo(-1.8, -1.6);
  ctx.lineTo(-1.4, 0);
  ctx.stroke();
  ctx.fillStyle = css(CRICKET.body, l);
  ctx.beginPath();
  ctx.ellipse(0, -0.9, 1.6, 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(-1.5, -1);
  ctx.lineTo(-2.4, -1.5);
  ctx.moveTo(1.4, -1.1);
  ctx.quadraticCurveTo(2.4, -1.8, 3.2, -1.2);
  ctx.stroke();
  ctx.restore();
}

function beetlet(ctx: CanvasRenderingContext2D, c: Critter, light: Light): void {
  const l = light(c.x, c.y);
  ctx.save();
  ctx.translate(c.x + 0.5, c.y + 1);
  ctx.scale(c.dir, 1);
  ctx.fillStyle = css(BEETLET.body, l);
  ctx.beginPath();
  ctx.ellipse(0, -0.55, 0.85, 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(BEETLET.dark, l);
  ctx.beginPath();
  ctx.arc(0.8, -0.5, 0.3, 0, Math.PI * 2);
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
      // Hind legs stiff in the air, body on its side.
      ctx.strokeStyle = css(DEAD.hopperDark, l);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, -2.6);
      ctx.lineTo(-8, -9);
      ctx.stroke();
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(-8, -9);
      ctx.lineTo(-13, -4.5);
      ctx.moveTo(5, -2.2);
      ctx.lineTo(7, -6);
      ctx.moveTo(2, -2.2);
      ctx.lineTo(3, -5.5);
      ctx.moveTo(9.5, -2.6);
      ctx.quadraticCurveTo(13, -4, 15, -3);
      ctx.stroke();
      ctx.fillStyle = css(DEAD.hopper, l);
      ctx.beginPath();
      ctx.ellipse(0, -1.8, 10.5, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(DEAD.hopperDark, l, 0.85);
      ctx.beginPath();
      ctx.ellipse(-3, -2.9, 8, 0.9, 0.04, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.kind === 'beetle') {
      // On its back, legs curled up.
      ctx.strokeStyle = css(DEAD.beetle, l);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const x = 2.6 - j * 2.4;
        ctx.moveTo(x, -3.6);
        ctx.quadraticCurveTo(x + 1.2, -6.2, x + 0.2, -6.8);
      }
      ctx.stroke();
      ctx.fillStyle = css(DEAD.beetle, l);
      ctx.beginPath();
      ctx.ellipse(-0.6, -2.0, 4.6, 2.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4.4, -1.8, 1.6, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(DEAD.beetleSheen, l, 0.5);
      ctx.beginPath();
      ctx.ellipse(-0.8, -0.8, 3.4, 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
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
