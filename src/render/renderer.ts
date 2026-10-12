import { World } from '../world/world';
import {
  EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, ROOT, SAND, WATER, STEM, LEAF, FLOWER,
  SEED, REFUSE, LITTER, FRUIT, BEDROCK, SOLID,
} from '../world/mat';
import { PAL, RGB, ZONE_TINT, hex, mixRGB, pack, sampleRamp } from './palette';
import { Backdrop, skyAt } from './backdrop';
import { Camera } from './camera';
import { SPRITES, WINGS, MOUTH, SpritePx } from './sprites';
import type { Sim } from '../sim/sim';
import type { Ant } from '../sim/ant';
import { Carry } from '../sim/types';
import { smoothstep, clamp } from '../util/math';

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
      case ROOT: c = sampleRamp(PAL.root, tone); break;
      case BEDROCK: c = sampleRamp(PAL.bedrock, tone); break;
      case SAND: {
        // Excavated soil dries paler than the face it came from, and looks grainier.
        const src = soilRamp(w.tint[i]! & 0x7f);
        const grain = ((i * 2654435761) >>> 28) / 16;
        c = mixRGB(sampleRamp(src, tone * 0.7 + grain * 0.3), [230, 215, 190], 0.14);
        break;
      }
      case SEED: c = sampleRamp(PAL.seed, tone); break;
      case REFUSE: c = sampleRamp(PAL.refuse, tone); break;
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

  private buildLight(dayT: number): void {
    const daylight = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
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

  private drawSprite(ant: Ant, sprite: SpritePx[]): void {
    const hx = ant.hx;
    const hy = ant.hy;
    const lx = ant.lx;
    const ly = ant.ly;
    for (const p of sprite) {
      this.px(ant.x + p.u * hx + p.r * lx, ant.y + p.u * hy + p.r * ly, p.c);
    }
  }

  private carryColor(ant: Ant): number {
    switch (ant.carry) {
      case Carry.Soil: {
        const c = mixRGB(sampleRamp(soilRamp(ant.carryTint), ant.carryTone / 255), [230, 215, 190], 0.14);
        return pack(c[0], c[1], c[2]);
      }
      case Carry.Seed: { const c = sampleRamp(PAL.seed, ant.carryTone / 255); return pack(c[0], c[1], c[2]); }
      case Carry.Fruit: { const c = sampleRamp(PAL.fruit, 0.7); return pack(c[0], c[1], c[2]); }
      case Carry.Egg: return pack(240, 234, 216);
      case Carry.Larva: return pack(232, 222, 196);
      case Carry.Pupa: return pack(226, 210, 172);
      case Carry.Corpse: return pack(28, 20, 16);
      case Carry.Refuse: { const c = sampleRamp(PAL.refuse, ant.carryTone / 255); return pack(c[0], c[1], c[2]); }
      default: return 0;
    }
  }

  private drawAnt(ant: Ant): void {
    const frame = (ant.step >> 1) & 1;
    this.drawSprite(ant, SPRITES[ant.caste][frame]!);
    if (ant.caste === 'queen' && ant.wings) this.drawSprite(ant, WINGS);
    if (ant.carry !== Carry.None) {
      const m = MOUTH[ant.caste];
      const c = this.carryColor(ant);
      const ax = ant.x + m.u * ant.hx + m.r * ant.lx;
      const ay = ant.y + m.u * ant.hy + m.r * ant.ly;
      this.px(ax, ay, c);
      // Bigger loads take two pixels.
      if (ant.carry === Carry.Seed || ant.carry === Carry.Larva || ant.carry === Carry.Pupa || ant.carry === Carry.Corpse || ant.carry === Carry.Fruit) {
        this.px(ax + ant.hx, ay + ant.hy, c);
        if (ant.carry === Carry.Corpse || ant.carry === Carry.Pupa) this.px(ax - ant.lx, ay - ant.ly, c);
      }
    }
  }

  private drawEntities(sim: Sim): void {
    const col = sim.colony;
    const egg = pack(240, 234, 216);
    const larvaA = pack(234, 224, 198);
    const larvaB = pack(206, 192, 160);
    const pupa = pack(230, 214, 178);
    const pupaEye = pack(90, 60, 40);
    for (const b of col.brood) {
      if (b.carried) continue;
      if (b.stage === 0) {
        this.px(b.x, b.y, egg);
      } else if (b.stage === 1) {
        // A larva grows from a speck to a fat curled grub.
        const big = b.size > 0.5;
        this.px(b.x, b.y, larvaA);
        this.px(b.x + 1, b.y, larvaB);
        if (big) {
          this.px(b.x, b.y - 1, larvaA);
          this.px(b.x - 1, b.y, larvaA);
        }
      } else {
        this.px(b.x - 1, b.y, pupa);
        this.px(b.x, b.y, pupa);
        this.px(b.x + 1, b.y, pupa);
        this.px(b.x, b.y - 1, pupa);
        this.px(b.x + 1, b.y - 1, pupaEye);
      }
    }
    const dead = pack(36, 28, 24);
    for (const c of col.corpses) {
      if (c.carried) continue;
      this.px(c.x - 1, c.y, dead);
      this.px(c.x, c.y, dead);
      this.px(c.x + 1, c.y, dead);
      this.px(c.x, c.y - 1, pack(60, 48, 40));
    }
    for (const a of col.ants) if (a.caste !== 'queen') this.drawAnt(a);
    if (col.queen && col.queen.alive) this.drawAnt(col.queen);
    // Particles (dust, rain, wings).
    for (const p of sim.particles.list) {
      this.px(Math.round(p.x), Math.round(p.y), p.color);
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

  render(sim: Sim, cam: Camera, dt: number): void {
    this.time += dt;
    const w = this.world;
    this.zoneKinds = sim.nest.zoneKinds();
    if (sim.nest.zonesChanged) {
      w.dirtyAll = true;
      sim.nest.zonesChanged = false;
    }
    this.updateBase();
    this.buf.set(this.base);
    this.drawEntities(sim);
    this.buildLight(sim.dayT);
    this.applyLight();
    this.wctx.putImageData(this.img, 0, 0);

    this.backdrop.draw(sim.dayT, this.time, w.w, w.ground);

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
    ctx.setTransform(1, 0, 0, 1, 0, 0);

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
