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
  /** Wind now, -1..1 (the meadow leans with it). */
  private wind = 0;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly scale = 0.5;
  private blades: Blade[] = [];
  private bokeh: Bokeh[] = [];
  private flies: Bokeh[] = [];
  /** Which kind of place is behind the slice (sparse sand steppe, vines, limestone...). */
  private site: string;
  /** Background features of the site: rocks, vine posts, distant hills, feather-grass plumes. */
  private props: { kind: string; x: number; y: number; w: number; h: number; phase: number }[] = [];
  /**
   * The tree at the slice's edge, as seen beyond the glass: its low boughs
   * reaching out over the meadow, out of focus, the leaf masses on them
   * green, then gold, then gone with the season. Set by the renderer.
   */
  tree: { x: number; r: number } | null = null;
  treeKind = 'elm';
  /** How much of the crown is in leaf (0..1), and how far into autumn its colour has turned (0..1). */
  leafCover = 0;
  autumn = 0;
  private boughs: { tip: number; len: number; y: number; bend: number; leaves: { t: number; off: number; r: number; phase: number }[] }[] | null = null;
  /** Wildflowers in the meadow behind, far out of focus: soft discs of colour on stalks. */
  private flowers: { x: number; h: number; r: number; col: RGB; phase: number; layer: number }[] = [];

  constructor(worldW: number, worldH: number, seed: number, site = 'pannonian') {
    this.site = site;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(worldW * this.scale);
    this.canvas.height = Math.ceil(worldH * this.scale);
    this.ctx = this.canvas.getContext('2d')!;
    const rng = new Rng(seed ^ 0x5bd1e995);
    const across = worldW / 640;
    // Sand and the dry Anatolian steppe are sparse; the feather-grass steppe is thick.
    const density = site === 'sand' ? 0.45 : site === 'anatolia' ? 0.55 : site === 'limestone' ? 0.7 : site === 'pontic' ? 1.15 : 1;
    for (let layer = 0; layer < 3; layer++) {
      const n = Math.round([70, 55, 30][layer]! * across * density);
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
    // Site props, behind the meadow.
    if (site === 'anatolia') {
      for (let k = 0; k < 3; k++) this.props.push({ kind: 'hill', x: rng.range(-200, worldW), y: 0, w: rng.range(500, 900), h: rng.range(25, 55), phase: k });
    } else if (site === 'limestone') {
      for (let k = 0; k < Math.round(5 * across); k++) this.props.push({ kind: 'rock', x: rng.range(0, worldW), y: 0, w: rng.range(30, 90), h: rng.range(14, 38), phase: rng.range(0, 6) });
    } else if (site === 'vineyard') {
      for (let k = 0; k < Math.round(4 * across); k++) this.props.push({ kind: 'vine', x: (k + rng.range(0.2, 0.8)) * (worldW / Math.round(4 * across)), y: 0, w: rng.range(60, 110), h: rng.range(110, 140), phase: rng.range(0, 6) });
    } else if (site === 'pontic' || site === 'sand') {
      for (let k = 0; k < Math.round((site === 'pontic' ? 26 : 8) * across); k++) this.props.push({ kind: 'plume', x: rng.range(0, worldW), y: 0, w: rng.range(30, 60), h: rng.range(60, 120), phase: rng.range(0, 6) });
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
  draw(dayT: number, time: number, worldW: number, ground: Int16Array, rain = 0, month = 4, snow = 0, wind = 0): void {
    this.wind = wind;
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
    const grassDay = siteTint(seasonGrass(month, snow), this.site, month);
    this.drawProps(c, s, time, worldW, ground, sky, night, grassDay);
    const grassNight = [hex('#1a2333'), hex('#131b28'), hex('#0c121c')];
    for (let layer = 0; layer < 3; layer++) {
      const base = mixRGB(grassDay[layer]!, grassNight[layer]!, night);
      const col = mixRGB(base, sky.low, (2 - layer) * 0.22 * (0.5 + sky.haze));
      c.strokeStyle = css(col, 0.9);
      c.lineCap = 'round';
      for (const b of this.blades) {
        if (b.layer !== layer) continue;
        // The wind bends the blades its way and sets them shivering.
        const sway = Math.sin(time * (0.5 + layer * 0.15) * (1 + Math.abs(this.wind) * 2.5) + b.phase) * (2 + layer * 1.5) * (1 + Math.abs(this.wind)) + this.wind * b.h * 0.28;
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

    // Low sun on a clear morning or evening: shafts of light slanting down through the grass,
    // coming and going as the blades sway across them.
    const low = daylight > 0.04 && daylight < 0.6 ? Math.min(1, (daylight - 0.04) / 0.1) * Math.min(1, (0.6 - daylight) / 0.2) : 0;
    const rays = low * (1 - wet) * Math.min(1, sky.haze * 1.4);
    if (rays > 0.03) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const dir = sunX < W / 2 ? 1 : -1;
      for (let k = 0; k < 7; k++) {
        const slope = 0.55 + k * 0.17 + Math.sin(time * 0.04 + k * 2.1) * 0.05;
        const x1 = sunX + dir * (gy - sunY) * slope;
        const half = (14 + ((k * 37) % 23)) * s * 2;
        const flicker = 0.55 + 0.45 * Math.sin(time * (0.21 + k * 0.03) + k * 1.3);
        const beam = c.createLinearGradient(sunX, sunY, x1, gy);
        beam.addColorStop(0, css(sky.sun, 0));
        beam.addColorStop(0.35, css(sky.sun, 0.13 * rays * flicker));
        beam.addColorStop(1, css(sky.sun, 0.03 * rays * flicker));
        c.fillStyle = beam;
        c.beginPath();
        c.moveTo(sunX - half * 0.08, sunY);
        c.lineTo(sunX + half * 0.08, sunY);
        c.lineTo(x1 + half, gy);
        c.lineTo(x1 - half, gy);
        c.closePath();
        c.fill();
      }
      c.restore();
    }

    // Ground mist on still spring and autumn mornings, lying low over the meadow until the sun lifts it.
    const morning = dayT > 0.22 && dayT < 0.42 ? Math.min(1, (dayT - 0.22) / 0.04) * Math.min(1, (0.42 - dayT) / 0.1) : 0;
    const mistSeason = (month >= 2 && month <= 4) || (month >= 8 && month <= 10) ? 1 : 0.25;
    const mist = morning * mistSeason * (1 - Math.min(1, Math.abs(this.wind) * 1.5)) * (1 - wet * 0.5);
    if (mist > 0.03) {
      const band = c.createLinearGradient(0, gy - 70 * s, 0, gy + 6 * s);
      band.addColorStop(0, 'rgba(232,234,238,0)');
      band.addColorStop(0.6, `rgba(232,234,238,${0.22 * mist})`);
      band.addColorStop(1, `rgba(240,240,242,${0.34 * mist})`);
      c.fillStyle = band;
      c.fillRect(0, gy - 70 * s, W, 76 * s);
    }
    // Dandelion seeds adrift on breezy days in May and June.
    const pappus = (month === 4 || month === 5) && daylight > 0.2 && !wet ? Math.min(1, Math.abs(this.wind) * 2) : 0;
    if (pappus > 0.1) {
      c.save();
      const dirW = this.wind >= 0 ? 1 : -1;
      for (let k = 0; k < 16; k++) {
        if (k / 16 > pappus) break;
        const hx = ((k * 4513 + 77) % 1000) / 1000;
        const x = ((((hx * worldW + dirW * time * (8 + (k % 4) * 3)) % worldW) + worldW) % worldW) * s;
        const y = (GROUND_Y - 30 - ((k * 37) % 90) + Math.sin(time * 0.6 + k) * 6) * s;
        const r = (1.6 + (k % 3) * 0.5) * s;
        c.strokeStyle = css(mixRGB([245, 245, 240], sky.low, 0.2), 0.75);
        c.lineWidth = 0.35 * s;
        c.beginPath();
        for (let a = 0; a < 8; a++) {
          const ang = Math.PI + (a / 7) * Math.PI;
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        }
        c.moveTo(x, y);
        c.lineTo(x, y + r * 1.4);
        c.stroke();
      }
      c.restore();
    }
    // Glow-worm males (Lamprohiza) drifting over the meadow on June and July nights, blinking.
    const glowSeason = month === 5 || month === 6 ? 1 : 0;
    const glow2 = glowSeason * Math.max(0, night - 0.6) / 0.4 * (1 - wet) * (snow > 1 ? 0 : 1);
    if (glow2 > 0.05) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 40; k++) {
        const hx = ((k * 7919 + 131) % 1000) / 1000;
        const x = (hx * worldW + Math.sin(time * 0.07 + k * 1.9) * 40 + time * (k % 2 ? 1.5 : -1.2)) % worldW;
        const gx = ((x % worldW) + worldW) % worldW;
        const y = (ground[Math.max(0, Math.min(worldW - 1, gx | 0))]! - 12 - ((k * 53) % 70) + Math.sin(time * 0.31 + k * 2.3) * 9) * s;
        const blink = Math.pow(Math.max(0, Math.sin(time * (0.6 + (k % 5) * 0.11) + k * 4.1)), 4);
        if (blink < 0.02) continue;
        const r = (5 + (k % 3) * 2) * s;
        const g3 = c.createRadialGradient(gx * s, y, 0, gx * s, y, r);
        g3.addColorStop(0, `rgba(214,255,140,${0.85 * blink * glow2})`);
        g3.addColorStop(0.25, `rgba(170,240,110,${0.35 * blink * glow2})`);
        g3.addColorStop(1, 'rgba(120,200,80,0)');
        c.fillStyle = g3;
        c.beginPath();
        c.arc(gx * s, y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    // The trunk's shadow across the meadow beside it, away from the sun: long
    // and soft in the morning and evening, short at noon.
    if (this.tree && daylight > 0.05) this.trunkShadow(c, s, ground, worldW, dayT, daylight, wet);
    // The tree's low boughs: nearer than the meadow behind, so over its grass.
    if (this.tree) this.drawTree(c, s, time, sky, night);
    // Wildflowers: blurred heads on their stalks, dimmed by night and haze. They
    // bloom from April into July; a few late ones linger into September.
    const bloom = [0, 0, 0.05, 0.5, 1, 1, 0.75, 0.4, 0.25, 0.05, 0, 0][month]!;
    for (let fi = 0; fi < this.flowers.length; fi++) {
      const f = this.flowers[fi]!;
      if (fi / this.flowers.length >= bloom) continue;
      const sway = Math.sin(time * 0.5 * (1 + Math.abs(this.wind) * 2.5) + f.phase) * 2 * (1 + Math.abs(this.wind)) + this.wind * f.h * 0.22;
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

  /**
   * The tree beyond the glass: a few low boughs out of the trunk, reaching
   * over the meadow and out of the frame, with soft leaf masses along them.
   * Far out of focus, so it reads as depth behind the crisp slice.
   */
  private drawTree(c: CanvasRenderingContext2D, s: number, time: number, sky: { low: RGB; mid: RGB }, night: number): void {
    const t = this.tree!;
    const side = t.x < this.canvas.width / s / 2 ? 1 : -1;
    if (!this.boughs) {
      const rng = new Rng(Math.round(t.x * 7 + t.r));
      this.boughs = [];
      for (let k = 0; k < 4; k++) {
        const leaves = [];
        for (let j = 0; j < 26; j++) leaves.push({ t: rng.range(0.25, 1.05), off: rng.range(-28, 28), r: rng.range(14, 34), phase: rng.range(0, 6.28) });
        // Low boughs: out from the trunk above the frame, drooping into view at their tips.
        this.boughs.push({ tip: rng.range(45, 105), len: rng.range(380, 820), y: rng.range(-30, 20), bend: rng.range(-0.25, 0.1), leaves });
      }
    }
    const bark = mixRGB(mixRGB(hex('#3a2c22'), sky.low, 0.45), hex('#0e1420'), night * 0.8);
    // The leaves: fresh green in spring, deep in summer, gold to rust in autumn.
    const green = mixRGB(hex('#5f7f3a'), hex('#3f5f2c'), 0.5);
    const gold = this.treeKind === 'maple' ? hex('#c8742e') : hex('#c9a640');
    const leaf = mixRGB(mixRGB(mixRGB(green, gold, this.autumn), sky.low, 0.35), hex('#101824'), night * 0.85);
    const sway = (k: number): number => Math.sin(time * (0.35 + Math.abs(this.wind) * 0.9) + k) * (3 + Math.abs(this.wind) * 9) + this.wind * 14;
    for (let k = 0; k < this.boughs.length; k++) {
      const b = this.boughs[k]!;
      // From the trunk's edge, up and out over the meadow.
      const x0 = (t.x + side * t.r * 0.8) * s;
      const y0 = (GROUND_Y - 150 + b.y) * s;
      const ex = x0 + side * b.len * s;
      const ey = (GROUND_Y - b.tip) * s + sway(k) * s;
      const cx = (x0 + ex) / 2 + side * b.bend * b.len * s * 0.3;
      const cy = Math.max(y0, ey) - b.len * 0.04 * s;
      c.strokeStyle = css(bark, 0.8);
      c.lineCap = 'round';
      c.lineWidth = 18 * s;
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(cx, cy, ex, ey);
      c.stroke();
      if (this.leafCover <= 0.02) continue;
      for (const l of b.leaves) {
        // Only part of the crown is in leaf while it is coming out or falling.
        if (l.phase / 6.28 > this.leafCover) continue;
        const u = l.t;
        const px = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * ex + side * l.off * 0.3 * s;
        const py = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * ey + l.off * s + Math.sin(time * 0.6 + l.phase) * 2 * s;
        const r = l.r * s;
        // A clump of leaves out of focus: a darker heart, lit at the edge toward the sky.
        const g = c.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, css(mixRGB(leaf, [8, 14, 6], 0.35), 0.8));
        g.addColorStop(0.65, css(leaf, 0.55));
        g.addColorStop(1, css(leaf, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
        const hx = px - r * 0.25;
        const hy = py - r * 0.35;
        const g2 = c.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
        g2.addColorStop(0, css(mixRGB(leaf, sky.low, 0.45), 0.35 * (1 - night)));
        g2.addColorStop(1, css(leaf, 0));
        c.fillStyle = g2;
        c.beginPath();
        c.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  private trunkShadow(c: CanvasRenderingContext2D, s: number, ground: Int16Array, worldW: number, dayT: number, daylight: number, wet: number): void {
    const t = this.tree!;
    const side = t.x < worldW / 2 ? 1 : -1;
    // Falls away from the sun: east (left) in the morning, so the shadow reaches
    // right; after noon, left. Seen only when it falls into the slice.
    if ((dayT < 0.5 ? 1 : -1) !== side) return;
    const len = Math.min(900, (t.r * 1.5) / Math.max(0.18, daylight));
    const x0 = t.x + side * (t.r + 20);
    const gy = ground[Math.max(0, Math.min(worldW - 1, Math.round(x0)))]!;
    // (Up through the grass in its shade, which is about this tall.)
    const R = 110;
    const a = 0.5 * (0.4 + 0.6 * daylight) * (1 - wet * 0.8);
    c.save();
    c.beginPath();
    c.rect((side > 0 ? x0 : x0 - len) * s, (gy - R - 10) * s, len * s, (R + 16) * s);
    c.clip();
    c.translate(x0 * s, (gy + 4) * s);
    c.scale(len / R, 1);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R * s);
    g.addColorStop(0, `rgba(10,14,10,${a.toFixed(3)})`);
    g.addColorStop(0.55, `rgba(10,14,10,${(a * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(10,14,10,0)');
    c.fillStyle = g;
    c.fillRect(-R * s, -R * s, R * 2 * s, (R + 4) * s);
    c.restore();
  }

  /** Hills, rocks, vine rows and feather-grass plumes behind the meadow, soft and hazy. */
  private drawProps(c: CanvasRenderingContext2D, s: number, time: number, worldW: number, ground: Int16Array, sky: { low: RGB; mid: RGB }, night: number, grass: RGB[]): void {
    const g = (x: number): number => ground[Math.max(0, Math.min(worldW - 1, x | 0))]! * s;
    for (const p of this.props) {
      if (p.kind === 'hill') {
        const col = mixRGB(mixRGB(grass[0]!, sky.low, 0.55), hex('#141b28'), night * 0.8);
        c.fillStyle = css(col, 0.9);
        c.beginPath();
        const y0 = g(p.x + p.w / 2) - 4 * s;
        c.moveTo(p.x * s, y0);
        c.quadraticCurveTo((p.x + p.w / 2) * s, y0 - p.h * 2 * s, (p.x + p.w) * s, y0);
        c.closePath();
        c.fill();
      } else if (p.kind === 'rock') {
        const col = mixRGB(mixRGB(hex('#a39d92'), sky.low, 0.35), hex('#1a2030'), night * 0.8);
        c.fillStyle = css(col, 0.85);
        c.beginPath();
        c.ellipse(p.x * s, g(p.x) - p.h * 0.35 * s, p.w * 0.5 * s, p.h * 0.6 * s, 0, Math.PI, Math.PI * 2);
        c.fill();
      } else if (p.kind === 'vine') {
        // A post and a row of vines on their wires, far behind.
        const base = g(p.x) + 2 * s;
        const post = mixRGB(mixRGB(hex('#5a4634'), sky.low, 0.45), hex('#151b26'), night * 0.8);
        c.strokeStyle = css(post, 0.85);
        c.lineWidth = 3 * s;
        c.beginPath();
        c.moveTo(p.x * s, base);
        c.lineTo(p.x * s, base - p.h * s);
        c.stroke();
        const leaf = mixRGB(mixRGB(grass[1]!, sky.low, 0.3), hex('#121a24'), night * 0.8);
        c.fillStyle = css(leaf, 0.75);
        for (let k = 0; k < 7; k++) {
          const lx = (p.x + (k - 3) * p.w * 0.16 + Math.sin(time * 0.3 + p.phase + k) * 1.5) * s;
          const ly = base - (p.h * (0.55 + 0.35 * Math.sin(k * 1.7 + p.phase))) * s;
          c.beginPath();
          c.arc(lx, ly, p.w * 0.14 * s, 0, Math.PI * 2);
          c.fill();
        }
      } else if (p.kind === 'plume') {
        // Feather grass: long silky awns curving in the wind, catching the light.
        const base = g(p.x) + 3 * s;
        const col = mixRGB(mixRGB(hex('#e8e0c8'), sky.low, 0.3), hex('#202838'), night * 0.85);
        c.strokeStyle = css(col, 0.5);
        c.lineWidth = 1.2 * s;
        for (let k = 0; k < 4; k++) {
          const sway = Math.sin(time * 0.6 * (1 + Math.abs(this.wind) * 2) + p.phase + k) * 10 + 18 * (1 + this.wind * 1.6);
          c.beginPath();
          c.moveTo((p.x + k * 3) * s, base);
          c.quadraticCurveTo((p.x + k * 3 + sway * 0.4) * s, base - p.h * 0.7 * s, (p.x + k * 3 + sway + p.w * 0.4) * s, base - p.h * s + k * 4 * s);
          c.stroke();
        }
      }
    }
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


/** Each site's meadow has its own cast: paler sand steppe, golden dry Anatolian grass, silvery feather grass. */
function siteTint(g: RGB[], site: string, month: number): RGB[] {
  const dry = month >= 6 && month <= 9;
  const tint: Record<string, [string, number]> = {
    sand: ['#cbbf8e', 0.35],
    anatolia: ['#c2a868', dry ? 0.55 : 0.25],
    pontic: ['#c9c09a', dry ? 0.4 : 0.15],
    limestone: ['#9aa38a', 0.15],
  };
  const t = tint[site];
  return t ? g.map((c) => mixRGB(c, hex(t[0]), t[1])) : g;
}
