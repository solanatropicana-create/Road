import { Rng } from '../util/rng';
import { GROUND_Y } from '../config';
import { RGB, hex, mixRGB } from './palette';

interface Blade {
  x: number;
  h: number;
  lean: number;
  phase: number;
  w: number;
  layer: number;
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  a: number;
  vx: number;
  phase: number;
}

const css = (c: RGB, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Sky keyframes over a day (t = 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk). */
const SKY: { t: number; top: RGB; mid: RGB; low: RGB; sun: RGB; haze: number }[] = [
  { t: 0.0, top: hex('#070b18'), mid: hex('#0f1a30'), low: hex('#1b2a40'), sun: hex('#9fb4d8'), haze: 0.15 },
  { t: 0.2, top: hex('#101a33'), mid: hex('#2b3557'), low: hex('#5a5068'), sun: hex('#d9b0a0'), haze: 0.3 },
  { t: 0.27, top: hex('#3a5a8a'), mid: hex('#c98f7a'), low: hex('#f2c08c'), sun: hex('#ffd9a0'), haze: 0.65 },
  { t: 0.36, top: hex('#6b98c4'), mid: hex('#b9cfde'), low: hex('#efe3c9'), sun: hex('#fff2d6'), haze: 0.55 },
  { t: 0.5, top: hex('#76a6d0'), mid: hex('#b8d2e4'), low: hex('#e8e6d6'), sun: hex('#fffaf0'), haze: 0.45 },
  { t: 0.66, top: hex('#6c95c2'), mid: hex('#c4cfd6'), low: hex('#f0dcbc'), sun: hex('#fff0cf'), haze: 0.55 },
  { t: 0.74, top: hex('#3d4f80'), mid: hex('#d48a6a'), low: hex('#f6b26e'), sun: hex('#ffc685'), haze: 0.75 },
  { t: 0.8, top: hex('#1a2244'), mid: hex('#4d3d5c'), low: hex('#8a5a5c'), sun: hex('#e09a80'), haze: 0.35 },
  { t: 1.0, top: hex('#070b18'), mid: hex('#0f1a30'), low: hex('#1b2a40'), sun: hex('#9fb4d8'), haze: 0.15 },
];

export function skyAt(t: number): (typeof SKY)[number] {
  let a = SKY[0]!;
  let b = SKY[SKY.length - 1]!;
  for (let k = 0; k < SKY.length - 1; k++) {
    if (t >= SKY[k]!.t && t <= SKY[k + 1]!.t) {
      a = SKY[k]!;
      b = SKY[k + 1]!;
      break;
    }
  }
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return {
    t,
    top: mixRGB(a.top, b.top, f),
    mid: mixRGB(a.mid, b.mid, f),
    low: mixRGB(a.low, b.low, f),
    sun: mixRGB(a.sun, b.sun, f),
    haze: a.haze + (b.haze - a.haze) * f,
  };
}

/**
 * Everything behind the soil slice: sky, out-of-focus meadow and bokeh.
 * Drawn at half the world resolution and scaled up smoothly, so it reads as
 * the soft background of a macro photograph while the slice stays crisp.
 */
export class Backdrop {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly scale = 0.5;
  private blades: Blade[] = [];
  private bokeh: Bokeh[] = [];
  private flies: Bokeh[] = [];
  /** Wildflowers in the meadow behind, far out of focus: soft discs of colour on stalks. */
  private flowers: { x: number; h: number; r: number; col: RGB; phase: number; layer: number }[] = [];

  constructor(worldW: number, worldH: number, seed: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(worldW * this.scale);
    this.canvas.height = Math.ceil(worldH * this.scale);
    this.ctx = this.canvas.getContext('2d')!;
    const rng = new Rng(seed ^ 0x5bd1e995);
    const across = worldW / 640;
    for (let layer = 0; layer < 3; layer++) {
      const n = Math.round([70, 55, 30][layer]! * across);
      for (let k = 0; k < n; k++) {
        this.blades.push({
          x: rng.range(-20, worldW + 20),
          h: rng.range(40, 140) * (0.6 + layer * 0.35),
          lean: rng.range(-0.5, 0.5),
          phase: rng.range(0, Math.PI * 2),
          w: rng.range(1, 2.6) * (1 + layer * 0.6),
          layer,
        });
      }
    }
    for (let k = 0; k < Math.round(26 * across); k++) {
      this.bokeh.push({
        x: rng.range(0, worldW),
        y: rng.range(4, GROUND_Y - 6),
        r: rng.range(3, 13),
        a: rng.range(0.05, 0.16),
        vx: rng.range(-0.02, 0.02),
        phase: rng.range(0, 6.28),
      });
    }
    const palette: RGB[] = [hex('#f2e6c8'), hex('#e8c45a'), hex('#d98cab'), hex('#b9a3d9'), hex('#f0f0ea')];
    for (let k = 0; k < Math.round(22 * across); k++) {
      this.flowers.push({
        x: rng.range(0, worldW),
        h: rng.range(18, 65),
        r: rng.range(3, 7),
        col: palette[rng.int(0, palette.length - 1)]!,
        phase: rng.range(0, 6.28),
        layer: rng.int(0, 1),
      });
    }
    for (let k = 0; k < Math.round(14 * across); k++) {
      this.flies.push({
        x: rng.range(0, worldW),
        y: rng.range(10, GROUND_Y - 4),
        r: rng.range(1.2, 2.4),
        a: 0,
        vx: rng.range(-0.08, 0.08),
        phase: rng.range(0, 6.28),
      });
    }
  }

  /**
   * dayT: 0..1 solar time of day. time: seconds (for sway). month: 0..11
   * (the meadow greens up in spring, dries to straw in high summer, browns in
   * autumn and lies flat and pale under winter snow). snow: mm lying.
   */
  draw(dayT: number, time: number, worldW: number, ground: Int16Array, rain = 0, month = 4, snow = 0): void {
    const c = this.ctx;
    const s = this.scale;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sky = skyAt(dayT);
    // Overcast: the sky greys and the haze thickens under rain.
    const wet = Math.min(1, rain);
    if (wet > 0) {
      const grey = mixRGB(hex('#5d6670'), sky.low, 0.25);
      sky.top = mixRGB(sky.top, mixRGB(grey, sky.top, 0.3), wet * 0.85);
      sky.mid = mixRGB(sky.mid, grey, wet * 0.8);
      sky.low = mixRGB(sky.low, mixRGB(grey, [200, 205, 210], 0.3), wet * 0.7);
      sky.haze *= 1 - wet * 0.7;
    }
    const gy = GROUND_Y * s;

    const g = c.createLinearGradient(0, 0, 0, gy + 6);
    g.addColorStop(0, css(sky.top));
    g.addColorStop(0.55, css(sky.mid));
    g.addColorStop(1, css(sky.low));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Sun or moon glow, low and to one side like late light through grass.
    const daylight = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
    // Sun crosses left to right by day, the moon does the same by night.
    const arc = (((dayT - 0.25 + 1) % 1) / 0.5) % 1;
    const sunX = (0.1 + arc * 0.8) * W;
    const sunY = gy * (0.95 - daylight * 0.75);
    const glow = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.45);
    glow.addColorStop(0, css(sky.sun, 0.55 * sky.haze + 0.15));
    glow.addColorStop(0.25, css(sky.sun, 0.18 * sky.haze));
    glow.addColorStop(1, css(sky.sun, 0));
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);

    // Out-of-focus meadow, far to near. Haze lifts the far layers toward the sky colour.
    const night = 1 - Math.min(1, daylight * 2.2);
    const grassDay = seasonGrass(month, snow);
    const grassNight = [hex('#1a2333'), hex('#131b28'), hex('#0c121c')];
    for (let layer = 0; layer < 3; layer++) {
      const base = mixRGB(grassDay[layer]!, grassNight[layer]!, night);
      const col = mixRGB(base, sky.low, (2 - layer) * 0.22 * (0.5 + sky.haze));
      c.strokeStyle = css(col, 0.9);
      c.lineCap = 'round';
      for (const b of this.blades) {
        if (b.layer !== layer) continue;
        const sway = Math.sin(time * (0.5 + layer * 0.15) + b.phase) * (2 + layer * 1.5);
        const x0 = b.x * s;
        const y0 = (ground[Math.max(0, Math.min(worldW - 1, b.x | 0))]! + 4) * s;
        const tipX = x0 + (b.lean * b.h + sway) * s;
        const tipY = y0 - b.h * s;
        c.lineWidth = b.w * s * 1.6;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo(x0 + b.lean * b.h * 0.2 * s, (y0 + tipY) / 2, tipX, tipY);
        c.stroke();
      }
    }

    // Wildflowers: blurred heads on their stalks, dimmed by night and haze. They
    // bloom from April into July; a few late ones linger into September.
    const bloom = [0, 0, 0.05, 0.5, 1, 1, 0.75, 0.4, 0.25, 0.05, 0, 0][month]!;
    for (let fi = 0; fi < this.flowers.length; fi++) {
      const f = this.flowers[fi]!;
      if (fi / this.flowers.length >= bloom) continue;
      const sway = Math.sin(time * 0.5 + f.phase) * 2;
      const x0 = f.x * s;
      const y0 = (ground[Math.max(0, Math.min(worldW - 1, f.x | 0))]! + 4) * s;
      const tx = x0 + sway * s;
      const ty = y0 - f.h * s;
      const stem = mixRGB(mixRGB(hex('#6f8f5a'), hex('#131b28'), night), sky.low, 0.3);
      c.strokeStyle = css(stem, 0.7);
      c.lineWidth = 1.2 * s * (1 + f.layer * 0.5);
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0, (y0 + ty) / 2, tx, ty);
      c.stroke();
      const col = mixRGB(mixRGB(f.col, hex('#1a2333'), night * 0.85), sky.low, 0.25 * (1 - f.layer));
      const r = f.r * s * (1 + f.layer * 0.5);
      const g2 = c.createRadialGradient(tx, ty, 0, tx, ty, r);
      g2.addColorStop(0, css(col, 0.85));
      g2.addColorStop(0.7, css(col, 0.55));
      g2.addColorStop(1, css(col, 0));
      c.fillStyle = g2;
      c.beginPath();
      c.arc(tx, ty, r, 0, Math.PI * 2);
      c.fill();
    }

    // Bokeh: soft discs of light with a slightly brighter rim.
    c.globalCompositeOperation = 'lighter';
    const bokehCol = mixRGB(sky.sun, [255, 255, 255], 0.3);
    for (const b of this.bokeh) {
      b.x += b.vx;
      if (b.x < -20) b.x = worldW + 20;
      if (b.x > worldW + 20) b.x = -20;
      const a = b.a * (0.7 + 0.3 * Math.sin(time * 0.4 + b.phase)) * (0.25 + 0.75 * (1 - night)) * (1 - wet * 0.8);
      const x = b.x * s;
      const y = b.y * s;
      const r = b.r * s;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, css(bokehCol, a * 0.7));
      rg.addColorStop(0.82, css(bokehCol, a));
      rg.addColorStop(1, css(bokehCol, 0));
      c.fillStyle = rg;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    // Fireflies after dark, in early summer.
    if (night > 0.3 && (month === 5 || month === 6)) {
      for (const f of this.flies) {
        f.x += f.vx + Math.sin(time * 0.7 + f.phase) * 0.05;
        f.y += Math.cos(time * 0.5 + f.phase) * 0.04;
        if (f.x < 0) f.x = worldW;
        if (f.x > worldW) f.x = 0;
        const blink = Math.max(0, Math.sin(time * 1.3 + f.phase * 3));
        const a = blink * blink * (night - 0.3) * 1.2;
        if (a < 0.02) continue;
        const x = f.x * s;
        const y = f.y * s;
        const rg = c.createRadialGradient(x, y, 0, x, y, f.r * 3 * s);
        rg.addColorStop(0, `rgba(230,255,140,${a})`);
        rg.addColorStop(1, 'rgba(230,255,140,0)');
        c.fillStyle = rg;
        c.beginPath();
        c.arc(x, y, f.r * 3 * s, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }
}

/** Meadow colours (far, middle, near) through the year. */
function seasonGrass(month: number, snow: number): RGB[] {
  const spring = [hex('#a3b98a'), hex('#76995a'), hex('#426634')];
  const summer = [hex('#b9b78a'), hex('#94935a'), hex('#5f6634')];
  const autumn = [hex('#b3a37e'), hex('#8f7a52'), hex('#5c4a30')];
  const winter = [hex('#a8a296'), hex('#857c6c'), hex('#544c40')];
  const keys: RGB[][] = [winter, winter, autumn, spring, spring, spring, summer, summer, summer, autumn, autumn, winter];
  let g = keys[month]!;
  if (snow > 3) {
    const k = Math.min(1, snow / 25);
    g = g.map((c) => mixRGB(c, hex('#dfe3e6'), k * 0.75));
  }
  return g;
}

