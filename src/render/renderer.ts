import { World } from '../world/world';
import {
  EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, ROOT, SAND, WATER, STEM, LEAF, FLOWER,
  SEED, REFUSE, LITTER, FRUIT, BEDROCK, SOLID,
} from '../world/mat';
import { PAL, RGB, ZONE_TINT, hex, mixRGB, pack, sampleRamp } from './palette';
import { Backdrop, skyAt } from './backdrop';
import { Camera } from './camera';
import { AntPainter } from './antdraw';
import type { Sim } from '../sim/sim';
import type { Ant } from '../sim/ant';
import { TUNING } from '../config';
import { smoothstep, clamp } from '../util/math';
import { Noise } from '../util/noise';
import { SPROUT } from '../world/moisture';

const BACKWALL_DARK = hex('#120b07');

/** Ramp used for a soil material's colour (also for loose soil dug from it). */
function soilRamp(m: number): RGB[] {
  switch (m) {
    case HUMUS: return PAL.humus;
    case LOAM: return PAL.loam;
    case CLAY: return PAL.clay;
    case SUBSOIL: return PAL.subsoil;
    case GRAVEL: return PAL.gravel;
    case ROOT: return PAL.root;
    default: return PAL.loam;
  }
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wc: HTMLCanvasElement;
  private wctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  private base: Uint32Array;
  private backdrop: Backdrop;
  private world: World;
  private lutR = new Uint16Array(512);
  private lutG = new Uint16Array(512);
  private lutB = new Uint16Array(512);
  private grain: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  private painter: AntPainter;
  /** Static soil features too fine for the sim to care about (mottles, flecks). */
  private detail: Uint8Array;
  dpr = 1;
  /** Seconds, for animation. */
  time = 0;

  constructor(canvas: HTMLCanvasElement, world: World, seed: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.world = world;
    this.wc = document.createElement('canvas');
    this.wc.width = world.w;
    this.wc.height = world.h;
    this.wctx = this.wc.getContext('2d')!;
    this.img = this.wctx.createImageData(world.w, world.h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.base = new Uint32Array(world.size);
    this.backdrop = new Backdrop(world.w, world.h, seed);
    this.grain = this.makeGrain();
    this.painter = new AntPainter(world);
    this.detail = this.makeDetail(seed);
  }

  /**
   * Redox mottles in the clay (grey where water stood, rust where iron
   * oxidised), charcoal flecks in the topsoil, pale grains in the subsoil.
   */
  private makeDetail(seed: number): Uint8Array {
    const w = this.world;
    const n = new Noise(seed * 13 + 5);
    const out = new Uint8Array(w.size);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const d = y - w.ground[x]!;
        if (d < 2) continue;
        const i = y * w.w + x;
        const hsh = ((Math.imul(i, 2654435761) >>> 0) % 10000) / 10000;
        if (d > 95 && n.fbm2(x / 3.2, y / 2.6, 2) > 0.42) out[i] = 1;
        else if (d > 75 && n.fbm2(x / 2.8 + 40, y / 2.8 + 40, 2) > 0.52) out[i] = 2;
        else if (d < 50 && hsh < 0.006) out[i] = 3;
        else if (d > 170 && hsh < 0.02) out[i] = 4;
      }
    }
    return out;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.vignette = null;
  }

  // ---------------------------------------------------------------- cells

  private cellColor(i: number): number {
    const w = this.world;
    const m = w.mat[i]!;
    const x = i % w.w;
    const y = (i - x) / w.w;
    const tone = w.tone[i]! / 255;
    let c: RGB;
    switch (m) {
      case EMPTY: {
        const pl = w.plant[i]!;
        if (pl) {
          const pt = w.ptone[i]! / 255;
          if (pl === STEM) c = sampleRamp(PAL.stem, pt);
          else if (pl === LEAF) c = sampleRamp(PAL.leaf, pt);
          else if (pl === FLOWER) c = pt >= 0.5 ? sampleRamp(PAL.flowerPink, (pt - 0.5) * 2) : sampleRamp(PAL.flowerWhite, pt * 2);
          else c = sampleRamp(PAL.seedhead, pt);
          return pack(c[0], c[1], c[2]);
        }
        if (w.bg[i] === 0) return 0;
        c = this.backwall(i, x, y);
        return pack(c[0], c[1], c[2]);
      }
      case WATER: {
        const under = w.bg[i] === 1;
        const wc = sampleRamp(PAL.water, tone * 0.5 + (w.mat[i - w.w] === WATER ? 0.1 : 0.5));
        if (!under) return pack(wc[0], wc[1], wc[2], 210);
        c = mixRGB(this.backwall(i, x, y), wc, 0.78);
        return pack(c[0], c[1], c[2]);
      }
      case HUMUS:
        c = y - w.ground[x]! < 3 ? sampleRamp(PAL.litterTop, tone) : sampleRamp(PAL.humus, tone);
        break;
      case LOAM: c = sampleRamp(PAL.loam, tone); break;
      case CLAY: c = sampleRamp(PAL.clay, tone); break;
      case SUBSOIL: c = sampleRamp(PAL.subsoil, tone); break;
      case GRAVEL: c = sampleRamp(PAL.gravel, tone); break;
      case STONE: c = sampleRamp(PAL.stone[w.tint[i]! & 3]!, tone); break;
      case ROOT: {
        // Fine roots: pale threads in whatever soil they run through.
        const soil = sampleRamp(soilRamp(this.guessSoil(x, y)), 0.35 + tone * 0.3);
        c = mixRGB(soil, [214, 190, 146], 0.22 + tone * 0.12);
        break;
      }
      case BEDROCK: c = sampleRamp(PAL.bedrock, tone); break;
      case SAND: {
        // Excavated soil dries paler than the face it came from, and looks grainier.
        const src = soilRamp(w.tint[i]! & 0x7f);
        const grain = ((i * 2654435761) >>> 28) / 16;
        c = mixRGB(sampleRamp(src, tone * 0.7 + grain * 0.3), [230, 215, 190], 0.14);
        break;
      }
      case SEED:
      case REFUSE:
        // Close up, grains are drawn as shapes over the slice (see grains()).
        if (this.closeUp) {
          if (w.bg[i] === 0) return 0;
          c = this.backwall(i, x, y);
          return pack(c[0], c[1], c[2]);
        }
        c = m === SEED ? sampleRamp(PAL.seed, tone) : w.tint[i] === SPROUT ? sampleRamp(PAL.leaf, 0.75) : sampleRamp(PAL.refuse, tone);
        break;
      case LITTER: c = w.tint[i] === 1 ? sampleRamp(PAL.twig, tone) : sampleRamp(PAL.leafLitter, tone); break;
      case FRUIT: c = sampleRamp(PAL.fruit, tone); break;
      default: c = [255, 0, 255];
    }
    // Relief: lit rims on floors and the ground surface, shadowed ceilings.
    if (y > 0 && y < w.h - 1) {
      const up = i - w.w;
      const dn = i + w.w;
      const upOpen = !SOLID[w.mat[up]!];
      const dnOpen = !SOLID[w.mat[dn]!];
      if (upOpen) {
        const f = w.bg[up] === 0 ? 1.16 : 1.1;
        c = [c[0] * f, c[1] * f, c[2] * f];
      } else if (dnOpen && w.bg[dn] === 1) {
        c = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.74];
      }
    }
    const det = this.detail[i]!;
    if (det && m !== GRAVEL && m !== STONE && m !== ROOT) {
      if (det === 1 && (m === CLAY || m === SUBSOIL)) c = mixRGB(c, [124, 128, 124], 0.32);
      else if (det === 2 && m !== HUMUS) c = mixRGB(c, [178, 94, 42], 0.3);
      else if (det === 3) c = mixRGB(c, [28, 22, 20], 0.7);
      else if (det === 4) c = mixRGB(c, [218, 208, 188], 0.45);
    }
    const moist = w.moist[i]!;
    if (moist > 0) {
      const f = 1 - (moist / 255) * 0.38;
      c = [c[0] * f, c[1] * f, c[2] * (f + 0.04)];
    }
    return pack(clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255));
  }

  /**
   * The soil face behind an open tunnel, seen through the glass: the same soil
   * in shade, its texture still faintly there, with a contact shadow under
   * ceilings and along walls.
   */
  private backwall(i: number, x: number, y: number): RGB {
    const w = this.world;
    const src = w.tint[i]! & 0x7f || this.guessSoil(x, y);
    const tone = w.tone[i]! / 255;
    let c = mixRGB(sampleRamp(soilRamp(src), 0.25 + tone * 0.5), BACKWALL_DARK, 0.5);
    const z = w.zone[i]!;
    if (z) {
      const kind = this.zoneKinds[z - 1];
      const tint = kind ? ZONE_TINT[kind] : undefined;
      if (tint) c = mixRGB(c, tint, 0.22);
    }
    // Shadow falls from the ceiling: darker near the top of a tunnel.
    let up = 0;
    for (let k = 1; k <= 3; k++) if (SOLID[w.mat[i - w.w * k]!]) { up = 4 - k; break; }
    let solids = 0;
    if (SOLID[w.mat[i - 1]!]) solids++;
    if (SOLID[w.mat[i + 1]!]) solids++;
    const f = 1 - solids * 0.06 - up * 0.07 + (SOLID[w.mat[i + w.w]!] ? 0.05 : 0);
    return [c[0] * f, c[1] * f, c[2] * f];
  }

  private guessSoil(x: number, y: number): number {
    const d = y - this.world.ground[x]!;
    return d < 18 ? HUMUS : d < 112 ? LOAM : d < 196 ? CLAY : SUBSOIL;
  }

  /** Chamber id → kind, mirrored from the nest planner each frame. */
  private zoneKinds: (string | undefined)[] = [];

  private updateBase(): void {
    const w = this.world;
    if (w.dirtyAll) {
      for (let i = 0; i < w.size; i++) this.base[i] = this.cellColor(i);
    } else {
      for (let k = 0; k < w.dirtyCount; k++) {
        const i = w.dirtyList[k]!;
        this.base[i] = this.cellColor(i);
      }
    }
    w.clearDirty();
  }

  // ---------------------------------------------------------------- light

  private buildLight(dayT: number, rain: number): void {
    const daylight = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2)) * (1 - Math.min(1, rain) * 0.35);
    const golden = Math.max(0, 1 - Math.abs(daylight - 0.25) * 4) * (daylight < 0.6 ? 1 : 0);
    const nightK = 1 - smoothstep(0, 0.35, daylight);
    const surf: RGB = [
      256 * (1 - nightK * 0.62) * (1 + golden * 0.05),
      256 * (1 - nightK * 0.56) * (1 - golden * 0.07),
      256 * (1 - nightK * 0.4) * (1 - golden * 0.2),
    ];
    // Keepers watch nests at night under red light, which ants cannot see.
    const under: RGB = [256 * (0.97 - nightK * 0.08), 256 * (0.94 - nightK * 0.18), 256 * (0.9 - nightK * 0.2)];
    for (let k = 0; k < 512; k++) {
      const d = k - 128;
      let r: number;
      let g: number;
      let b: number;
      if (d < 0) {
        [r, g, b] = surf;
      } else {
        const t = smoothstep(0, 30, d);
        const deep = 1 - 0.24 * Math.min(1, d / 270);
        r = (surf[0] + (under[0] - surf[0]) * t) * deep;
        g = (surf[1] + (under[1] - surf[1]) * t) * deep;
        b = (surf[2] + (under[2] - surf[2]) * t) * deep;
      }
      this.lutR[k] = r;
      this.lutG[k] = g;
      this.lutB[k] = b;
    }
  }

  private applyLight(): void {
    const w = this.world;
    const buf = this.buf;
    const ground = w.ground;
    const lr = this.lutR;
    const lg = this.lutG;
    const lb = this.lutB;
    let i = 0;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++, i++) {
        const c = buf[i]!;
        const a = c >>> 24;
        if (a === 0) continue;
        let k = y - ground[x]! + 128;
        if (k < 0) k = 0;
        else if (k > 511) k = 511;
        let r = ((c & 255) * lr[k]!) >> 8;
        let g = (((c >>> 8) & 255) * lg[k]!) >> 8;
        let b = (((c >>> 16) & 255) * lb[k]!) >> 8;
        if (r > 255) r = 255;
        if (g > 255) g = 255;
        if (b > 255) b = 255;
        buf[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
  }

  // ---------------------------------------------------------------- entities

  private px(x: number, y: number, c: number): void {
    const w = this.world;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
    this.buf[y * w.w + x] = c;
  }

  private drawEntities(sim: Sim): void {
    // Far out, dust and rain are single pixels of the slice; close up they are drawn smooth (see specks()).
    if (this.closeUp) return;
    for (const p of sim.particles.list) {
      this.px(Math.round(p.x), Math.round(p.y), p.color);
    }
    // Raindrops: slanted streaks, bright head fading up the tail.
    const dropCols = [pack(214, 228, 238), pack(176, 196, 212), pack(140, 160, 178), pack(116, 132, 150)];
    const slant = sim.weather.storm ? 0.35 : 0.12;
    for (const d of sim.drops) {
      for (let k = 0; k < 4; k++) {
        this.px(Math.round(d.x - slant * k), Math.round(d.y) - k, dropCols[k]!);
      }
    }
  }

  /** Steer the nuptial flight toward the spot the player is pointing at. */
  flightGoal(x: number): void {
    this.painter.flightGoal = x;
  }

  /** Show the colony's dig plan: always (toggled with P), or for a few seconds after an order. */
  planAlways = false;
  planFlash = 0;

  /**
   * The dig plan as a survey overlay: amber dots on soil the colony means to
   * remove, and a pin where the player asked it to grow.
   */
  private drawPlan(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }, z: number, dt: number): void {
    this.planFlash = Math.max(0, this.planFlash - dt);
    const a = this.planAlways ? 1 : Math.min(1, this.planFlash / 1.5);
    if (a <= 0) return;
    const ctx = this.ctx;
    const w = this.world;
    const dots = new Path2D();
    const r = Math.max(0.16, 1.2 / z);
    for (const i of sim.nest.planCells) {
      if (!SOLID[w.mat[i]!] || w.bg[i] !== 1) continue;
      const x = i % w.w;
      const y = (i - x) / w.w;
      // Every other cell keeps it a light dotted hatch rather than a solid fill.
      if (((x + y) & 1) !== 0 || x < view.x0 - 1 || x > view.x1 + 1 || y < view.y0 - 1 || y > view.y1 + 1) continue;
      dots.rect(x + 0.5 - r, y + 0.5 - r, r * 2, r * 2);
    }
    ctx.fillStyle = `rgba(226,180,92,${0.55 * a})`;
    ctx.fill(dots);
    const m = sim.nest.marker;
    if (m) {
      const px = 1 / z;
      ctx.strokeStyle = `rgba(226,180,92,${0.95 * a})`;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.arc(m.x + 0.5, m.y + 0.5, 5, 0, Math.PI * 2);
      ctx.moveTo(m.x + 0.5 - 9, m.y + 0.5);
      ctx.lineTo(m.x + 0.5 - 2, m.y + 0.5);
      ctx.moveTo(m.x + 0.5 + 2, m.y + 0.5);
      ctx.lineTo(m.x + 0.5 + 9, m.y + 0.5);
      ctx.moveTo(m.x + 0.5, m.y + 0.5 - 9);
      ctx.lineTo(m.x + 0.5, m.y + 0.5 - 2);
      ctx.moveTo(m.x + 0.5, m.y + 0.5 + 2);
      ctx.lineTo(m.x + 0.5, m.y + 0.5 + 9);
      ctx.stroke();
    }
  }

  /** Whether the camera is close enough that loose specks are drawn smooth instead of as pixels. */
  private closeUp = false;

  /**
   * Seeds and husks as grains: glossy ovals heaped in the granary, pale
   * split husks on the midden. Tones are bucketed so each bucket is one fill.
   */
  private grains(view: { x0: number; y0: number; x1: number; y1: number }): void {
    const w = this.world;
    const ctx = this.ctx;
    const x0 = Math.max(1, Math.floor(view.x0) - 1);
    const x1 = Math.min(w.w - 2, Math.ceil(view.x1) + 1);
    const y0 = Math.max(1, Math.floor(view.y0) - 1);
    const y1 = Math.min(w.h - 2, Math.ceil(view.y1) + 1);
    const B = 4;
    const seedPaths: Path2D[] = [];
    const huskPaths: Path2D[] = [];
    for (let k = 0; k < B; k++) {
      seedPaths.push(new Path2D());
      huskPaths.push(new Path2D());
    }
    const gloss = new Path2D();
    const shoots = new Path2D();
    let any = false;
    // One light level for the whole view keeps this to a handful of fills.
    const l = this.lightAt((x0 + x1) / 2, (y0 + y1) / 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        const m = w.mat[i];
        if (m !== SEED && m !== REFUSE) continue;
        any = true;
        const hsh = Math.imul(i, 2654435761) >>> 0;
        const rot = ((hsh >>> 8) & 255) / 255 * Math.PI;
        const jx = (((hsh >>> 16) & 15) / 15 - 0.5) * 0.25;
        const jy = (((hsh >>> 20) & 15) / 15 - 0.5) * 0.2;
        const cx = x + 0.5 + jx;
        const cy = y + 0.55 + jy;
        const b = Math.min(B - 1, (w.tone[i]! * B) >> 8);
        if (m === SEED) {
          const p = seedPaths[b]!;
          p.moveTo(cx + 0.68 * Math.cos(rot), cy + 0.68 * Math.sin(rot));
          p.ellipse(cx, cy, 0.68, 0.5, rot, 0, Math.PI * 2);
          gloss.moveTo(cx - 0.12 + 0.2, cy - 0.2);
          gloss.ellipse(cx - 0.12, cy - 0.2, 0.2, 0.1, rot, 0, Math.PI * 2);
        } else if (w.tint[i] === SPROUT) {
          // A germinated seed: the grain with a pale root and a green shoot.
          const p = seedPaths[b]!;
          p.moveTo(cx + 0.6, cy);
          p.ellipse(cx, cy, 0.6, 0.45, 0, 0, Math.PI * 2);
          shoots.moveTo(cx + 0.1, cy - 0.3);
          shoots.quadraticCurveTo(cx + 0.5, cy - 1.0, cx + 0.2, cy - 1.5);
        } else {
          const p = huskPaths[b]!;
          p.moveTo(cx + 0.6 * Math.cos(rot), cy + 0.6 * Math.sin(rot));
          p.ellipse(cx, cy, 0.6, 0.26, rot, 0, Math.PI * 2);
        }
      }
    }
    if (!any) return;
    const lit = (c: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
    for (let k = 0; k < B; k++) {
      ctx.fillStyle = lit(sampleRamp(PAL.refuse, 0.35 + (k / B) * 0.6));
      ctx.fill(huskPaths[k]!);
      ctx.fillStyle = lit(sampleRamp(PAL.seed, (k + 0.5) / B));
      ctx.fill(seedPaths[k]!);
    }
    ctx.fillStyle = lit([255, 236, 196], 0.45);
    ctx.fill(gloss);
    ctx.strokeStyle = lit([120, 170, 80]);
    ctx.lineWidth = 0.22;
    ctx.lineCap = 'round';
    ctx.stroke(shoots);
  }

  /** Dust, shed wings and rain at screen resolution, for close-ups. */
  private specks(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }, z: number): void {
    const ctx = this.ctx;
    for (const p of sim.particles.list) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      const l = this.lightAt(p.x, p.y);
      const c = p.color;
      ctx.fillStyle = `rgb(${((c & 255) * l[0]) | 0},${(((c >>> 8) & 255) * l[1]) | 0},${(((c >>> 16) & 255) * l[2]) | 0})`;
      const r = Math.max(0.3, 1.2 / z);
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    if (sim.drops.length) {
      const slant = sim.weather.storm ? 0.35 : 0.12;
      ctx.strokeStyle = 'rgba(206,220,232,0.6)';
      ctx.lineWidth = Math.max(0.3, 1 / z);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const d of sim.drops) {
        if (d.x < view.x0 - 2 || d.x > view.x1 + 2 || d.y < view.y0 - 4 || d.y > view.y1 + 4) continue;
        ctx.moveTo(d.x + 0.5, d.y + 0.5);
        ctx.lineTo(d.x + 0.5 - slant * 4, d.y + 0.5 - 4);
      }
      ctx.stroke();
    }
  }

  private makeGrain(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const d = g.createImageData(128, 128);
    for (let k = 0; k < d.data.length; k += 4) {
      const v = Math.random() * 255;
      d.data[k] = d.data[k + 1] = d.data[k + 2] = v;
      d.data[k + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  private makeVignette(W: number, H: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(8,4,2,0.55)');
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // ---------------------------------------------------------------- frame

  /** Light multipliers (1 = neutral) at a world point, matching the slice. */
  private lightAt = (x: number, y: number): RGB => {
    const w = this.world;
    const gx = clamp(Math.round(x), 0, w.w - 1);
    const k = clamp(Math.round(y) - w.ground[gx]! + 128, 0, 511);
    return [this.lutR[k]! / 256, this.lutG[k]! / 256, this.lutB[k]! / 256];
  };

  /** speed: sim time per real time (0 when paused). */
  render(sim: Sim, cam: Camera, dt: number, speed = 1, selected: Ant | null = null): void {
    this.time += dt;
    const w = this.world;
    this.zoneKinds = sim.nest.zoneKinds();
    if (sim.nest.zonesChanged) {
      w.dirtyAll = true;
      sim.nest.zonesChanged = false;
    }
    const close = cam.zoom * this.dpr >= 5;
    if (close !== this.closeUp) {
      this.closeUp = close;
      w.dirtyAll = true;
    }
    this.updateBase();
    this.buf.set(this.base);
    this.drawEntities(sim);
    this.buildLight(sim.dayT, sim.weather.rain);
    this.applyLight();
    this.wctx.putImageData(this.img, 0, 0);

    this.backdrop.draw(sim.dayT, this.time, w.w, w.ground, sim.weather.rain);

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = cam.zoom * this.dpr;
    const ox = W / 2 - cam.x * z;
    const oy = H / 2 - cam.y * z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = skyAt(sim.dayT);
    ctx.fillStyle = `rgb(${sky.top[0] | 0},${sky.top[1] | 0},${sky.top[2] | 0})`;
    ctx.fillRect(0, 0, W, H);
    // Background: smooth scaling keeps it soft (shallow depth of field).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const bs = 1 / this.backdrop.scale;
    ctx.setTransform(z * bs, 0, 0, z * bs, ox, oy);
    ctx.drawImage(this.backdrop.canvas, 0, 0);
    // The slice itself: crisp pixels.
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(z, 0, 0, z, ox, oy);
    ctx.drawImage(this.wc, 0, 0);
    // Ants, brood and the dead, at full screen resolution over the slice.
    const col = sim.colony;
    const ants = col.queen && col.queen.alive ? [...col.ants.filter((a) => a.caste !== 'queen'), col.queen] : col.ants;
    this.painter.update(ants, dt, speed);
    if (sim.phase === 'choose') this.painter.drawFlight(ctx, z, this.lightAt, w.w, dt);
    const view = { x0: cam.x - cam.screenW / 2 / cam.zoom, y0: cam.y - cam.screenH / 2 / cam.zoom, x1: cam.x + cam.screenW / 2 / cam.zoom, y1: cam.y + cam.screenH / 2 / cam.zoom };
    if (this.closeUp) this.grains(view);
    this.drawPlan(sim, view, z, dt);
    this.painter.drawCorpses(ctx, col.corpses, z, this.lightAt, view);
    this.painter.drawBrood(ctx, col.brood, z, this.lightAt, view, TUNING.pupaTicks);
    this.painter.draw(ctx, ants, z, this.lightAt, view, selected);
    if (this.closeUp) this.specks(sim, view, z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Lightning: the whole frame flashes white for a moment.
    if (sim.flash > 0) {
      ctx.fillStyle = `rgba(235,240,255,${(sim.flash / 7) * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Lens: vignette and a whisper of film grain.
    if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) this.vignette = this.makeVignette(W, H);
    ctx.drawImage(this.vignette, 0, 0);
    ctx.globalAlpha = 0.035;
    ctx.globalCompositeOperation = 'overlay';
    const gx = (Math.random() * 128) | 0;
    const gy = (Math.random() * 128) | 0;
    ctx.fillStyle = ctx.createPattern(this.grain, 'repeat')!;
    ctx.translate(-gx, -gy);
    ctx.fillRect(gx, gy, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
