import { World } from '../world/world';
import {
  EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, ROOT, SAND, WATER, STEM, LEAF, FLOWER,
  SEED, REFUSE, LITTER, FRUIT, BEDROCK, SOLID, SANDY, LIME, ROCK, WOOD, TWIG, BERRY, PREY,
} from '../world/mat';
import { PAL, RGB, ZONE_TINT, hex, mixRGB, pack, sampleRamp, seedLook, preyColor, fruitColor } from './palette';

/** Tone buckets for drawing seeds (each species gets three shades). */
const SEED_BUCKETS = 15;
import { Backdrop, skyAt } from './backdrop';
import { Camera } from './camera';
import { AntPainter } from './antdraw';
import { MacroLens, fibreAlpha, isPiece, heapy } from './macro';
import { drawCritters, drawCarcasses, drawMorsels } from './critterdraw';
import { TreeLife } from './treelife';
import type { Sim } from '../sim/sim';
import type { Ant } from '../sim/ant';
import { TUNING, GROUND_Y } from '../config';
import { smoothstep, clamp } from '../util/math';
import { Noise } from '../util/noise';
import { SPROUT } from '../world/moisture';
import { DRY_SHIFT } from '../world/plants';
import { FOG } from '../sim/fog';

const BACKWALL_DARK = hex('#120b07');


/** Scrambles an integer well enough that neighbouring cells look unrelated (murmur3 finaliser). */
function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Ramp used for a soil material's colour (also for loose soil dug from it). */
function soilRamp(m: number): RGB[] {
  switch (m) {
    case HUMUS: return PAL.humus;
    case LOAM: return PAL.loam;
    case CLAY: return PAL.clay;
    case SUBSOIL: return PAL.subsoil;
    case GRAVEL: return PAL.gravel;
    case ROOT: return PAL.root;
    case SANDY: return PAL.sandy;
    case LIME: return PAL.lime;
    case ROCK: return PAL.rock;
    case WOOD: return PAL.wood;
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
  /** The tree at the slice's edge (its trunk is shaded round), if any, and the life on its bark. */
  private tree: { x: number; r: number } | null = null;
  readonly treeLife = new TreeLife();
  private lutR = new Uint16Array(512);
  private lutG = new Uint16Array(512);
  private lutB = new Uint16Array(512);
  private grain: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  private painter: AntPainter;
  /** Made on first use: building its textures takes a moment, and only close-ups need it. */
  private lensObj: MacroLens | null = null;
  private get lens(): MacroLens {
    return (this.lensObj ??= new MacroLens(this.world, this.seed));
  }
  private seed: number;
  /** Static soil features too fine for the sim to care about (mottles, flecks). */
  private detail: Uint8Array;
  dpr = 1;
  private calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Seconds, for animation. */
  time = 0;

  constructor(canvas: HTMLCanvasElement, world: World, seed: number, site = 'pannonian') {
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
    this.backdrop = new Backdrop(world.w, world.h, seed, site);
    this.grain = this.makeGrain();
    this.painter = new AntPainter(world);
    this.seed = seed;
    // Make the lens's textures while nothing is happening, so the first close-up doesn't stall.
    const idle = (globalThis as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
    if (idle) idle(() => void this.lens);
    else setTimeout(() => void this.lens, 1500);
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
        const hsh = mix32(i ^ (seed * 0x9e3779b1)) / 4294967296;
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
          if (pl === STEM || pl === LEAF) {
            // Shade in the low bits, dryness (green, yellowing, straw, dead) in the top two.
            const sh = (w.ptone[i]! & 63) / 63;
            const dry = w.ptone[i]! >> DRY_SHIFT;
            c = sampleRamp(pl === STEM ? PAL.stem : PAL.leaf, sh);
            if (dry === 3) c = mixRGB(c, sampleRamp(PAL.deadPlant, sh), 0.9);
            else if (dry > 0) c = mixRGB(c, sampleRamp(PAL.straw, sh), dry === 1 ? 0.45 : 0.88);
          } else if (pl === TWIG) c = sampleRamp(PAL.bark, pt);
          else if (pl === BERRY) c = pt < 0.5 ? sampleRamp(PAL.sloe, pt * 2) : sampleRamp(PAL.hip, (pt - 0.5) * 2);
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
      case STONE: c = sampleRamp(PAL.stone[w.tint[i]! & 7] ?? PAL.stone[0]!, tone); break;
      case ROOT: {
        // Fine roots: pale threads in whatever soil they run through.
        const soil = sampleRamp(soilRamp(this.guessSoil(x, y)), 0.35 + tone * 0.3);
        c = mixRGB(soil, [214, 190, 146], 0.22 + tone * 0.12);
        break;
      }
      case BEDROCK: c = sampleRamp(PAL.bedrock, tone); break;
      case SANDY: c = sampleRamp(PAL.sandy, tone); break;
      case LIME: c = sampleRamp(PAL.lime, tone); break;
      case ROCK: c = sampleRamp(PAL.rock, tone); break;
      case WOOD: {
        c = sampleRamp(PAL.wood, tone);
        const t = this.tree;
        const g = w.ground[x]!;
        if (t && y < g) {
          // The trunk above the ground is a column, not a slab: lit on the side
          // toward the light, falling off round to the shadowed side, with moss
          // on the cool side near its foot.
          const above = g - y;
          const r = t.r + (above < 40 ? (40 - above) * 0.7 : 0);
          const u = clamp((x - t.x) / r, -1, 1);
          const nz = Math.sqrt(1 - u * u);
          const lit = 0.42 + 0.78 * Math.max(0, -0.45 * u + 0.89 * nz);
          c = [c[0] * lit, c[1] * lit, c[2] * lit];
          const moss = clamp((u - 0.25) * 1.6, 0, 1) * clamp(1 - above / 120, 0, 1) * (0.5 + 0.5 * Math.sin(y * 0.21 + x * 0.05));
          if (moss > 0.05) c = mixRGB(c, [86, 104, 52], moss * 0.55);
        }
        break;
      }
      case SAND: {
        // Excavated soil dries paler than the face it came from, and looks grainier.
        const src = soilRamp(w.tint[i]! & 0x3f);
        const grain = ((i * 2654435761) >>> 28) / 16;
        c = mixRGB(sampleRamp(src, tone * 0.7 + grain * 0.3), [230, 215, 190], 0.14);
        break;
      }
      case SEED:
      case REFUSE:
      case FRUIT:
      case PREY: {
        // Close up, grains (and the pieces of fruit and prey stored with them) are drawn
        // as shapes over the slice (see grains()). The top layer of a heap is loose
        // grains; inside a heap, under other grains, there is no gap to see through,
        // so the cell keeps a solid shaded base.
        const piece = m === SEED || m === REFUSE || isPiece(w, i);
        const own = (): RGB =>
          m === SEED ? seedLook(w.tone[i]!).col
          : m === REFUSE ? (w.tint[i] === SPROUT ? sampleRamp(PAL.leaf, 0.75) : sampleRamp(PAL.refuse, tone))
          : m === FRUIT ? fruitColor(w.tone[i]!)
          : w.tint[i] === 3 ? sampleRamp(PAL.nymph, (w.tone[i]! - 150) / 60) : preyColor(w.tone[i]!);
        if (this.closeUp && piece) {
          if (heapy(w, i - w.w)) {
            c = m === REFUSE ? sampleRamp(PAL.refuse, tone * 0.6 + 0.2) : own();
            c = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72];
            break;
          }
          if (w.bg[i] === 0) return 0;
          c = this.backwall(i, x, y);
          return pack(c[0], c[1], c[2]);
        }
        c = own();
        break;
      }
      case LITTER: c = w.tint[i] === 1 ? sampleRamp(PAL.twig, tone) : sampleRamp(PAL.leafLitter, tone); break;
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
    const src = w.tint[i]! & 0x3f || this.guessSoil(x, y);
    const tone = w.tone[i]! / 255;
    let c = mixRGB(sampleRamp(soilRamp(src), 0.25 + tone * 0.5), BACKWALL_DARK, 0.42);
    const z = w.zone[i]!;
    if (z) {
      const kind = this.zoneKinds[z - 1];
      const tint = kind ? ZONE_TINT[kind] : undefined;
      if (tint) c = mixRGB(c, tint, 0.2);
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

  /** The light the lens tiles were last drawn under. */
  private lensLut = new Uint16Array(1536);

  /** Whether the light has changed enough since the lens tiles were drawn to show. */
  private lightMoved(): boolean {
    const L = this.lensLut;
    for (let k = 0; k < 512; k += 4) {
      if (Math.abs(L[k]! - this.lutR[k]!) > 3 || Math.abs(L[512 + k]! - this.lutG[k]!) > 3 || Math.abs(L[1024 + k]! - this.lutB[k]!) > 3) return true;
    }
    return false;
  }

  /** World cells on screen (a cell of margin), clamped to the world. */
  private visibleRect(cam: Camera): { x0: number; y0: number; x1: number; y1: number } {
    const w = this.world;
    const hw = cam.screenW / 2 / cam.zoom;
    const hh = cam.screenH / 2 / cam.zoom;
    return {
      x0: Math.max(0, Math.floor(cam.x - hw) - 2),
      x1: Math.min(w.w - 1, Math.ceil(cam.x + hw) + 2),
      y0: Math.max(0, Math.floor(cam.y - hh) - 2),
      y1: Math.min(w.h - 1, Math.ceil(cam.y + hh) + 2),
    };
  }

  private applyLight(r: { x0: number; y0: number; x1: number; y1: number }): void {
    const w = this.world;
    const buf = this.buf;
    const ground = w.ground;
    const lr = this.lutR;
    const lg = this.lutG;
    const lb = this.lutB;
    for (let y = r.y0; y <= r.y1; y++) {
      let i = y * w.w + r.x0;
      for (let x = r.x0; x <= r.x1; x++, i++) {
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
    if (sim.weather.snowing) {
      const flake = pack(238, 242, 248);
      for (const d of sim.drops) this.px(Math.round(d.x), Math.round(d.y), flake);
      return;
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

  /** Show scent trails (toggled with T). */
  trails = false;

  /** Trail pheromone as a faint teal haze, strongest where the most ants have passed. */
  private drawTrails(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const w = this.world;
    const B = 4;
    const paths: Path2D[] = [];
    for (let k = 0; k < B; k++) paths.push(new Path2D());
    for (const i of sim.pherCells) {
      const v = sim.pher[i]!;
      if (v < 0.05) continue;
      const x = i % w.w;
      const y = (i - x) / w.w;
      if (x < view.x0 - 1 || x > view.x1 + 1 || y < view.y0 - 1 || y > view.y1 + 1) continue;
      const b = Math.min(B - 1, Math.floor(Math.sqrt(v / 4) * B));
      paths[b]!.rect(x - 0.6, y - 0.6, 2.2, 2.2);
    }
    const ctx = this.ctx;
    for (let k = 0; k < B; k++) {
      ctx.fillStyle = `rgba(110,225,205,${0.22 + k * 0.16})`;
      ctx.fill(paths[k]!);
    }
  }

  /** Steer the nuptial flight toward the spot the player is pointing at. */
  /** The landing sequence: the queen's place in the air (or null) and the swarm. */
  setFlight(pos: { x: number; y: number; face: number } | null, swarm: { x: number; y: number; vx: number; caste: string; t: number }[]): void {
    this.painter.flightOverride = pos;
    this.painter.swarm = swarm;
  }

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
  /**
   * Hairline cracks in the roof of a room under strain (see Ground): more,
   * longer and darker as the strain builds toward a cave-in.
   */
  private drawCracks(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }, z: number): void {
    const g = sim.ground;
    if (!g.strained) return;
    const ctx = this.ctx;
    const path = new Path2D();
    let worst = 0;
    for (const c of sim.nest.chambers) {
      const st = g.strain[c.id] ?? 0;
      if (!c.ready || st < 0.15) continue;
      if (c.cx + c.w < view.x0 || c.cx - c.w > view.x1 || c.floorY < view.y0 || c.floorY - c.h * 2 > view.y1) continue;
      if (!this.known(sim, c.cx, c.floorY - c.h)) continue;
      const r = g.roof(sim, c);
      if (!r) continue;
      worst = Math.max(worst, st);
      const n = 1 + Math.floor(Math.min(1, st) * 8);
      for (let k = 0; k < n; k++) {
        // Fixed per room and crack, so the cracks stay put and only grow.
        const h = (c.id * 7919 + k * 104729) >>> 0;
        const u = ((h % 1000) / 1000) * 0.7 + 0.15;
        let x = Math.round(r.x0 + r.span * u);
        const top = r.top.get(x);
        if (top === undefined) continue;
        let y = top;
        path.moveTo(x + 0.5, y);
        const len = 2 + Math.min(1, st) * (4 + ((h >> 10) % 5));
        for (let s = 0; s < len; s++) {
          const j = ((h >> (s % 13)) & 3) - 1.5;
          x += j * 0.45;
          y -= 1;
          path.lineTo(x + 0.5, y);
        }
      }
    }
    if (!worst) return;
    ctx.strokeStyle = `rgba(22,14,9,${0.3 + 0.6 * Math.min(1, worst)})`;
    ctx.lineWidth = Math.max(0.25, 1.1 / z);
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }

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
    // Two layers, open air and nest, because they are lit so differently (moonlight
    // against the red lamp); within a layer one light keeps this to a few fills.
    const layer = (): { seed: Path2D[]; husk: Path2D[]; gloss: Path2D; shoots: Path2D; meniscus: Path2D; any: boolean } => ({
      seed: Array.from({ length: SEED_BUCKETS }, () => new Path2D()),
      husk: Array.from({ length: B }, () => new Path2D()),
      gloss: new Path2D(),
      shoots: new Path2D(),
      meniscus: new Path2D(),
      any: false,
    });
    const layers = [layer(), layer()];
    const pieces: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        const m = w.mat[i];
        if (m !== WATER && m !== SEED && m !== REFUSE) {
          if (isPiece(w, i)) pieces.push(i);
          continue;
        }
        const L = layers[w.bg[i]!]!;
        L.any = true;
        if (m === WATER) {
          // The top of standing water catches the light.
          if (w.mat[i - w.w] !== WATER) L.meniscus.rect(x, y, 1, 0.22);
          continue;
        }
        const hsh = Math.imul(i, 2654435761) >>> 0;
        // In a heap, stored seed settles lying flat; loose on the ground it lies any way.
        const flat = w.mat[i + w.w] === SEED || w.mat[i - w.w] === SEED;
        const rot = flat ? ((((hsh >>> 8) & 255) / 255) - 0.5) * 0.8 : ((hsh >>> 8) & 255) / 255 * Math.PI;
        // Scatter each grain a little, and stagger alternate rows by half a cell, so heaps
        // don't line up with the cell grid.
        const jx = (((hsh >>> 16) & 15) / 15 - 0.5) * 0.9 + (y & 1 ? 0.5 : 0);
        const jy = (((hsh >>> 20) & 15) / 15 - 0.5) * 0.5;
        const sz = 0.8 + ((hsh >>> 24) & 15) / 15 * 0.45;
        const cx = x + 0.5 + jx;
        const cy = y + 0.55 + jy;
        const b = Math.min(B - 1, (w.tone[i]! * B) >> 8);
        if (m === SEED) {
          // Grouped by species and shade: one path per tone bucket.
          const look = seedLook(w.tone[i]!);
          const p = L.seed[Math.min(SEED_BUCKETS - 1, (w.tone[i]! * SEED_BUCKETS) >> 8)]!;
          const rx = look.rx * 0.95;
          const ry = look.ry * 0.95;
          p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
          p.ellipse(cx, cy + 0.5 - ry, rx, ry, rot, 0, Math.PI * 2);
          L.gloss.moveTo(cx - 0.1 + rx * 0.3, cy + 0.5 - ry * 1.5);
          L.gloss.ellipse(cx - 0.1, cy + 0.5 - ry * 1.5, rx * 0.3, ry * 0.22, rot, 0, Math.PI * 2);
        } else if (w.tint[i] === SPROUT) {
          // A germinated seed: the grain with a green shoot.
          const p = L.seed[b]!;
          p.moveTo(cx + 0.6, cy);
          p.ellipse(cx, cy, 0.6, 0.45, 0, 0, Math.PI * 2);
          L.shoots.moveTo(cx + 0.1, cy - 0.3);
          L.shoots.quadraticCurveTo(cx + 0.5, cy - 1.0, cx + 0.2, cy - 1.5);
        } else {
          const p = L.husk[b]!;
          p.moveTo(cx + 0.6 * sz * Math.cos(rot), cy + 0.6 * sz * Math.sin(rot));
          p.ellipse(cx, cy, 0.6 * sz, 0.26 * sz, rot, 0, Math.PI * 2);
        }
      }
    }
    const mx = Math.round(Math.max(0, Math.min(w.w - 1, (x0 + x1) / 2)));
    const lights = [this.lightAt(mx, w.ground[mx]! - 2), this.lightAt(mx, w.ground[mx]! + 30)];
    layers.forEach((L, k) => {
      if (!L.any) return;
      const l = lights[k]!;
      const lit = (c: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
      for (let q = 0; q < B; q++) {
        ctx.fillStyle = lit(sampleRamp(PAL.refuse, 0.35 + (q / B) * 0.6));
        ctx.fill(L.husk[q]!);
      }
      for (let q = 0; q < SEED_BUCKETS; q++) {
        ctx.fillStyle = lit(seedLook(((q + 0.5) * 256) / SEED_BUCKETS).col);
        ctx.fill(L.seed[q]!);
      }
      ctx.fillStyle = lit([255, 236, 196], 0.45);
      ctx.fill(L.gloss);
      ctx.strokeStyle = lit([120, 170, 80]);
      ctx.lineWidth = 0.22;
      ctx.lineCap = 'round';
      ctx.stroke(L.shoots);
      ctx.fillStyle = lit([205, 228, 242], 0.6);
      ctx.fill(L.meniscus);
    });
    // Pieces of fruit and prey in the nest: soft, glossy crumbs.
    if (pieces.length) {
      const l = lights[1]!;
      for (const i of pieces) {
        const x = i % w.w;
        const y = (i - x) / w.w;
        const hsh = Math.imul(i, 2654435761) >>> 0;
        const c = w.mat[i] === FRUIT ? fruitColor(w.tone[i]!) : preyColor(w.tone[i]!);
        const rot = (((hsh >>> 8) & 255) / 255) * Math.PI;
        const cx = x + 0.5 + (((hsh >>> 16) & 15) / 15 - 0.5) * 0.4;
        const cy = y + 0.55;
        ctx.fillStyle = `rgb(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 0.62, 0.46, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${(255 * l[0]) | 0},${(236 * l[1]) | 0},${(214 * l[2]) | 0},0.3)`;
        ctx.beginPath();
        ctx.ellipse(cx - 0.15, cy - 0.18, 0.24, 0.13, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Snow lying on the ground: a soft white blanket over whatever is on top of
   * each column (mounds and litter included), a little uneven, lit like the
   * surface (blue at night).
   */
  private drawSnow(depth: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const w = this.world;
    const ctx = this.ctx;
    const x0 = Math.max(0, Math.floor(view.x0) - 1);
    const x1 = Math.min(w.w - 1, Math.ceil(view.x1) + 1);
    const d = Math.min(30, depth);
    // The surface under the snow (mounds and litter included), and the snow's soft top.
    const base: number[] = [];
    for (let x = x0; x <= x1; x++) {
      let y = w.ground[x]!;
      while (y > 1 && w.mat[(y - 1) * w.w + x] !== EMPTY) y--;
      base.push(y);
    }
    // Snow drifts smooth out the bumps underneath.
    const top: number[] = base.map((_, k) => {
      let s = 0;
      let n = 0;
      for (let j = Math.max(0, k - 3); j <= Math.min(base.length - 1, k + 3); j++) {
        s += base[j]!;
        n++;
      }
      const x = x0 + k;
      const wob = Math.sin(x * 0.21) * 0.5 + Math.sin(x * 0.067 + 2) * 0.8;
      return Math.min(base[k]!, s / n) - d - wob * Math.min(1, d / 8);
    });
    const p = new Path2D();
    p.moveTo(x0, base[0]!);
    for (let k = 0; k < top.length; k++) p.lineTo(x0 + k + 0.5, top[k]!);
    for (let k = base.length - 1; k >= 0; k--) p.lineTo(x0 + k + 0.5, base[k]! + 0.5);
    p.closePath();
    const mx = Math.round((x0 + x1) / 2);
    const l = this.lightAt(mx, w.ground[mx]! - 3);
    // Snow throws back what light there is: never as dark as the soil at night.
    const lit = (c: number, k: number): number => Math.min(255, c * Math.max(l[k]!, 0.5));
    ctx.fillStyle = `rgb(${lit(232, 0) | 0},${lit(238, 1) | 0},${lit(246, 2) | 0})`;
    ctx.fill(p);
    // A brighter crust along the top edge.
    const edge = new Path2D();
    edge.moveTo(x0 + 0.5, top[0]!);
    for (let k = 1; k < top.length; k++) edge.lineTo(x0 + k + 0.5, top[k]!);
    ctx.strokeStyle = `rgba(${lit(255, 0) | 0},${lit(255, 1) | 0},${lit(255, 2) | 0},0.8)`;
    ctx.lineWidth = 0.6;
    ctx.stroke(edge);
  }

  /**
   * Beyond the colony's known world the slice fades into shadow, like the
   * edge of a lamp's pool of light, so the eye stays on what the ants know.
   */
  /** The fog image (one pixel per fog cell, upscaled soft), and how far the fog has closed in. */
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogImg: ImageData | null = null;
  private fogIn = 0;
  private lastDt = 0;
  private skyTop: RGB = [120, 140, 160];

  /**
   * What the colony doesn't know yet lies in the dark: underground, plain
   * darkness; above ground, a mist the colour of the sky. While the queen is
   * still in the air the meadow is open below her; once she lands the mist
   * closes in to the few centimetres around her.
   */
  private unknown(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }): void {
    void view;
    const fog = sim.fog;
    const w = this.world;
    const ctx = this.ctx;
    const target = sim.nest.founded ? 1 : 0;
    this.fogIn += (target - this.fogIn) * Math.min(1, this.lastDt * 0.9);
    if (!this.fogCanvas || this.fogCanvas.width !== fog.gw) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = fog.gw;
      this.fogCanvas.height = fog.gh;
      this.fogImg = this.fogCanvas.getContext('2d')!.createImageData(fog.gw, fog.gh);
    }
    const img = this.fogImg!;
    const d = img.data;
    const mist = mixRGB(this.skyTop, [70, 74, 78], 0.45);
    for (let gy = 0; gy < fog.gh; gy++) {
      for (let gx = 0; gx < fog.gw; gx++) {
        const x = Math.min(w.w - 1, gx * FOG + FOG / 2);
        const y = gy * FOG + FOG / 2;
        const above = y < w.ground[x]! - 3;
        const k = gy * fog.gw + gx;
        const v = (above ? Math.max(fog.seen[k]!, fog.sky[gx]!) : fog.seen[k]!) / 255;
        const a = (1 - v) * (above ? 0.88 * this.fogIn : 0.97);
        const o = k * 4;
        if (above) {
          d[o] = mist[0];
          d[o + 1] = mist[1];
          d[o + 2] = mist[2];
        } else {
          d[o] = 9;
          d[o + 1] = 6;
          d[o + 2] = 4;
        }
        d[o + 3] = Math.round(a * 255);
      }
    }
    this.fogCanvas.getContext('2d')!.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.fogCanvas, 0, 0, fog.gw * FOG, fog.gh * FOG);
    ctx.restore();
  }

  /** Is this point known to the colony (so things there may be drawn)? */
  /** Rings that draw the eye to something that just happened (first contact, a battle). */
  private marks: { x: number; y: number; t: number }[] = [];

  mark(x: number, y: number): void {
    this.marks.push({ x, y, t: 0 });
  }

  private drawMarks(ctx: CanvasRenderingContext2D, z: number): void {
    if (!this.marks.length) return;
    let j = 0;
    for (const m of this.marks) {
      m.t += this.lastDt;
      if (m.t > 7) continue;
      this.marks[j++] = m;
      const fade = Math.min(1, m.t * 3, (7 - m.t) / 2);
      ctx.lineWidth = 1.5 / z;
      for (let k = 0; k < 2; k++) {
        const p = ((m.t + k * 0.8) % 1.6) / 1.6;
        ctx.strokeStyle = `rgba(255,232,182,${((1 - p) * 0.75 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x + 0.5, m.y + 0.5, (5 + p * 38) / z + 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.marks.length = j;
  }

  /** Is this point within the senses of one of our ants right now? */
  inSight(sim: Sim, x: number, y: number): boolean {
    return !sim.nest.founded || sim.fog.sees(x, y);
  }

  private known(sim: Sim, x: number, y: number): boolean {
    if (!sim.nest.founded) return true;
    const xi = clamp(Math.round(x), 0, this.world.w - 1);
    return sim.fog.at(xi, y, this.world.ground[xi]!) > 0.35;
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
      // A speck of dust is round, not a little square.
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sim.drops.length && sim.weather.snowing) {
      ctx.fillStyle = 'rgba(240,244,250,0.85)';
      const r = Math.max(0.35, 1.4 / z);
      for (const d of sim.drops) {
        if (d.x < view.x0 - 2 || d.x > view.x1 + 2 || d.y < view.y0 - 4 || d.y > view.y1 + 4) continue;
        ctx.beginPath();
        ctx.arc(d.x + 0.5, d.y + 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sim.drops.length) {
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

  /** The open air over the slice (above the original ground line), for shading the surface. */
  private airPath: Path2D | null = null;

  /**
   * A tree's crown overhead: the ground under it lies in soft shade, with
   * sunflecks drifting as the leaves move.
   */
  private drawShade(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }, solar: number): void {
    const eco = sim.eco;
    const doy = sim.doy;
    const cover = eco.leafCover(doy);
    const sun = Math.max(0, Math.sin((solar - 0.25) * Math.PI * 2)) * (1 - 0.7 * Math.min(1, sim.cloud));
    if (sun < 0.05) return;
    const w = this.world;
    const ctx = this.ctx;
    if (!this.airPath) {
      const p = new Path2D();
      p.moveTo(0, -200);
      for (let x = 0; x < w.w; x += 2) p.lineTo(x, w.ground[x]! + 3);
      p.lineTo(w.w, w.ground[w.w - 1]! + 3);
      p.lineTo(w.w, -200);
      p.closePath();
      this.airPath = p;
    }
    if (cover <= 0) return;
    const x0 = Math.max(0, view.x0);
    const x1 = Math.min(w.w, view.x1);
    if (x1 <= x0) return;
    ctx.save();
    ctx.clip(this.airPath);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let k = 0; k <= 4; k++) {
      const x = x0 + ((x1 - x0) * k) / 4;
      g.addColorStop(k / 4, `rgba(14,22,12,${(eco.shadeAt(x, doy) * 0.42 * sun).toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(x0, Math.max(view.y0, -200), x1 - x0, GROUND_Y + 60 - Math.max(view.y0, -200));
    // Sunflecks: soft spots of light that wander as the crown sways.
    ctx.globalCompositeOperation = 'lighter';
    const t = this.time * 0.15;
    for (let k = 0; k < 28; k++) {
      const hx = ((k * 7919) % 1000) / 1000;
      const x = x0 + hx * (x1 - x0) + Math.sin(t + k * 1.7) * 6;
      if (eco.shadeAt(x, doy) < 0.15) continue;
      const gx = clamp(Math.round(x), 0, w.w - 1);
      const y = w.ground[gx]! - 2 - ((k * 37) % 60);
      const r = 3 + ((k * 13) % 7);
      const a = 0.06 * sun * cover * (0.6 + 0.4 * Math.sin(t * 2.3 + k));
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(255,236,190,${a.toFixed(3)})`);
      rg.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /** Leaves on their way down in autumn, turning as they fall. */
  private drawFallers(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    for (const f of sim.eco.fallers) {
      if (f.x < view.x0 - 4 || f.x > view.x1 + 4 || f.y < view.y0 - 4 || f.y > view.y1 + 4) continue;
      const l = this.lightAt(f.x, Math.max(f.y, 0));
      if (f.samara) {
        // A samara: the seed and its papery wing, turning as it comes down.
        const look = seedLook(f.tone);
        const c = look.col;
        const spin = f.samara === 'maple' ? f.t * 0.45 : Math.sin(f.t * 0.07 + f.tone) * 1.2;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(spin);
        ctx.fillStyle = `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},0.85)`;
        ctx.beginPath();
        if (f.samara === 'maple') ctx.ellipse(1.6, 0, 2.6, 0.9 + Math.abs(Math.cos(spin)) * 0.3, 0, 0, Math.PI * 2);
        else ctx.ellipse(0, 0, 1.6, 1.6 * (0.4 + 0.6 * Math.abs(Math.cos(spin * 0.7))), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${(c[0] * l[0] * 0.55) | 0},${(c[1] * l[1] * 0.5) | 0},${(c[2] * l[2] * 0.45) | 0})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.6, 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (f.fruit) {
        const c = fruitColor(f.tone);
        ctx.fillStyle = `rgb(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0})`;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.tone < 100 ? 3.6 : 3.2, f.tone < 100 ? 3.6 : 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const c = sampleRamp(PAL.leafLitter, f.tone / 255);
      // A leaf turns as it falls: broad face-on, a line edge-on.
      const spin = Math.sin(f.t * 0.05 + f.tone);
      const half = Math.max(2.2, f.len / 2);
      ctx.fillStyle = `rgb(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0})`;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, half, 0.5 + Math.abs(spin) * half * 0.42, Math.sin(f.t * 0.03 + f.tone * 2) * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // The midrib.
      ctx.strokeStyle = `rgba(${(c[0] * l[0] * 0.6) | 0},${(c[1] * l[1] * 0.6) | 0},${(c[2] * l[2] * 0.6) | 0},0.7)`;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      const a = Math.sin(f.t * 0.03 + f.tone * 2) * 0.5;
      ctx.moveTo(f.x - Math.cos(a) * half, f.y - Math.sin(a) * half);
      ctx.lineTo(f.x + Math.cos(a) * half, f.y + Math.sin(a) * half);
      ctx.stroke();
    }
  }

  /** speed: sim time per real time (0 when paused). */
  render(sim: Sim, cam: Camera, dt: number, speed = 1, selected: Ant | null = null): void {
    if (this.tree !== sim.tree) {
      this.tree = sim.tree;
      this.world.dirtyAll = true;
    }
    this.time += dt;
    this.lastDt = dt;
    const w = this.world;
    this.zoneKinds = sim.nest.zoneKinds();
    if (sim.nest.zonesChanged) {
      w.dirtyAll = true;
      sim.nest.zonesChanged = false;
    }
    // Close-up is about how big a millimetre looks, not how many device pixels back it.
    const close = cam.zoom >= 5;
    if (close !== this.closeUp) {
      // Only grains (and stored pieces) look different close up: recolour just those, not the whole
      // slice, so crossing zoom 5 doesn't hitch.
      this.closeUp = close;
      const mat = w.mat;
      for (let i = 0; i < w.size; i++) {
        const m = mat[i]!;
        if (m === SEED || m === REFUSE || m === FRUIT || m === PREY) this.base[i] = this.cellColor(i);
      }
      this.lensObj?.markAll();
    }
    // The macro lens (macro.ts): from zoom 3.4 it fades in looking like the pixel slice,
    // then comes into focus up to zoom 6.8, so zooming out loses detail gradually.
    const lensA = smoothstep(3.4, 4.4, cam.zoom);
    const focus = smoothstep(3.4, 6.8, cam.zoom);
    // Tiles keep track of changes even while the lens is off, so none comes back stale.
    this.lensObj?.markDirty();
    this.updateBase();
    // Only the part of the slice on screen is copied, lit and uploaded each frame
    // (under the lens, whole tiles of it).
    const vr = this.visibleRect(cam);
    const lr = lensA > 0 ? this.lens.region(vr) : vr;
    for (let y = lr.y0; y <= lr.y1; y++) {
      const a = y * w.w + lr.x0;
      this.buf.set(this.base.subarray(a, a + lr.x1 - lr.x0 + 1), a);
    }
    this.drawEntities(sim);
    // Sky and light follow the sun: sunrise and sunset move with the season.
    const doy = sim.doy;
    const solar = sim.cal.solar(sim.dayT, doy);
    this.buildLight(solar, sim.weather.rain);
    this.applyLight(lr);
    this.wctx.putImageData(this.img, 0, 0, vr.x0, vr.y0, vr.x1 - vr.x0 + 1, vr.y1 - vr.y0 + 1);

    // The tree beyond the glass: its boughs and their leaves through the year.
    this.backdrop.tree = sim.tree;
    this.backdrop.treeKind = sim.eco.treeKind ?? 'elm';
    this.backdrop.leafCover = sim.eco.leafCover(doy);
    this.backdrop.autumn = clamp((doy - 262) / 40, 0, 1);
    this.backdrop.draw(solar, this.time, w.w, w.ground, sim.weather.rain, sim.cal.month(doy), sim.snow, sim.gust());

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = cam.zoom * this.dpr;
    const ox = W / 2 - cam.x * z;
    const oy = H / 2 - cam.y * z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = skyAt(solar);
    this.skyTop = sky.top;
    ctx.fillStyle = `rgb(${sky.top[0] | 0},${sky.top[1] | 0},${sky.top[2] | 0})`;
    ctx.fillRect(0, 0, W, H);
    // Background: smooth scaling keeps it soft (shallow depth of field).
    ctx.imageSmoothingEnabled = true;
    // Bilinear is plenty for a layer that is out of focus anyway, and far cheaper than 'high'.
    ctx.imageSmoothingQuality = 'low';
    const bs = 1 / this.backdrop.scale;
    ctx.setTransform(z * bs, 0, 0, z * bs, ox, oy);
    ctx.drawImage(this.backdrop.canvas, 0, 0);
    // The slice itself: crisp pixels, until the lens covers it.
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(z, 0, 0, z, ox, oy);
    if (lensA < 1) ctx.drawImage(this.wc, 0, 0);
    if (lensA > 0) {
      if (this.lightMoved()) {
        this.lens.lightVersion++;
        this.lensLut.set(this.lutR, 0);
        this.lensLut.set(this.lutG, 512);
        this.lensLut.set(this.lutB, 1024);
      }
      this.lens.draw(ctx, this.buf, vr, z, focus, lensA, 6, this.wc);
    }
    const view = { x0: cam.x - cam.screenW / 2 / cam.zoom, y0: cam.y - cam.screenH / 2 / cam.zoom, x1: cam.x + cam.screenW / 2 / cam.zoom, y1: cam.y + cam.screenH / 2 / cam.zoom };
    if (lensA > 0 && focus > 0.05) {
      // Fine roots become fibres as the lens comes into focus, fallen leaves and twigs thin flakes.
      ctx.globalAlpha = lensA * fibreAlpha(focus);
      this.lens.drawRoots(ctx, view, this.lightAt, z);
      ctx.globalAlpha = lensA * smoothstep(0.2, 0.6, focus);
      this.lens.drawLitter(ctx, view, this.lightAt);
      ctx.globalAlpha = 1;
    }
    if (cam.zoom >= 3.6) {
      // Plants are drawn smooth over the slice; the slice's pixel plants go with it under the lens.
      ctx.globalAlpha = smoothstep(3.6, 4.4, cam.zoom);
      this.lens.drawPlants(ctx, sim.plants, this.lightAt, view);
      if (sim.eco.shrub) this.lens.drawShrub(ctx, sim.eco.shrub, this.lightAt, view);
      ctx.globalAlpha = 1;
    }
    this.drawShade(sim, view, solar);
    if (sim.snow > 0.5) this.drawSnow(sim.snow, view);
    // Ants, brood and the dead, at full screen resolution over the slice.
    const col = sim.colony;
    // (Foragers out in the meadow beyond the slice are out of view.)
    const out = col.ants.filter((a) => a.away === 0);
    // Strangers show only while one of ours is near enough to sense them.
    for (const nb of sim.neighbours) for (const a of nb.ants) if (this.inSight(sim, a.x, a.y)) out.push(a);
    if (sim.foreigners.length) out.push(...sim.foreigners.filter((q) => q.phase < 2 && this.known(sim, q.x, q.y)));
    const base = col.alates.length ? [...out, ...col.alates] : out;
    const ants = col.queen && col.queen.alive ? [...base, col.queen] : base;
    this.painter.update(ants, dt, speed);
    if (sim.phase === 'choose') this.painter.drawFlight(ctx, z, this.lightAt, w.w, dt);
    if (this.closeUp) {
      this.grains(view);
    } else if (cam.zoom >= 4.3) {
      // Fade the grains in over the pixel seeds before the switch at zoom 5, so it doesn't pop.
      ctx.globalAlpha = smoothstep(4.3, 5, cam.zoom);
      this.grains(view);
      ctx.globalAlpha = 1;
    }
    this.drawPlan(sim, view, z, dt);
    this.drawCracks(sim, view, z);
    if (this.trails) this.drawTrails(sim, view);
    this.painter.drawCorpses(ctx, col.corpses, z, this.lightAt, view);
    this.painter.drawBrood(ctx, col.brood, z, this.lightAt, view, TUNING.pupaTicks);
    if (sim.critters.list.length) drawCritters(ctx, sim.critters.list.filter((c) => (c.kind === 'worm' ? this.known(sim, c.body[0]! % w.w, (c.body[0]! / w.w) | 0) : this.known(sim, c.x, c.y))), w, this.lightAt, view);
    if (sim.carcasses.list.length) drawCarcasses(ctx, sim.carcasses.list.filter((c) => this.known(sim, c.x, c.y)), this.lightAt, view);
    if (sim.carcasses.bits.length) drawMorsels(ctx, sim.carcasses.bits.filter((m) => this.known(sim, m.x, m.y)), this.lightAt, view);
    if (sim.tree) {
      // (Its clock is the sim's: in seconds of sim time, so it hurries and stops with the game.)
      this.treeLife.update(sim, dt * speed);
      if (this.known(sim, Math.round(sim.tree.x < w.w / 2 ? sim.tree.x + sim.tree.r : sim.tree.x - sim.tree.r), w.ground[0]! - 5)) this.treeLife.draw(ctx, sim, this.lightAt, view);
    }
    this.painter.draw(ctx, ants, z, this.lightAt, view, selected);
    if (sim.flyers.length) this.painter.drawFlyers(ctx, sim.flyers, z, this.lightAt);
    if (sim.eco.fallers.length) this.drawFallers(sim, view);
    if (this.closeUp) this.specks(sim, view, z);
    this.unknown(sim, view);
    this.drawMarks(ctx, z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Lightning: the whole frame flashes white for a moment.
    if (sim.flash > 0) {
      ctx.fillStyle = `rgba(235,240,255,${(sim.flash / 7) * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Lens: vignette and a whisper of film grain.
    if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) this.vignette = this.makeVignette(W, H);
    ctx.drawImage(this.vignette, 0, 0);
    // Film grain flickers, so it stays still for people who ask for less motion.
    ctx.globalAlpha = this.calm ? 0.02 : 0.035;
    ctx.globalCompositeOperation = 'overlay';
    const gx = this.calm ? 0 : (Math.random() * 128) | 0;
    const gy = this.calm ? 0 : (Math.random() * 128) | 0;
    ctx.fillStyle = ctx.createPattern(this.grain, 'repeat')!;
    ctx.translate(-gx, -gy);
    ctx.fillRect(gx, gy, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
