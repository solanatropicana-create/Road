import type { World } from '../world/world';
import { DRY_SHIFT, type Plants } from '../world/plants';
import type { ShrubInfo } from '../world/gen';
import {
  EMPTY, HUMUS, LOAM, CLAY, SUBSOIL, GRAVEL, STONE, ROOT, SAND, WATER, STEM, LEAF, FLOWER, SEEDHEAD,
  SEED, REFUSE, LITTER, FRUIT, BEDROCK, SANDY, LIME, ROCK, WOOD, TWIG, BERRY, PREY,
} from '../world/mat';
import { PAL, RGB, mixRGB, sampleRamp, seedLook } from './palette';
import { Rng } from '../util/rng';
import { smoothstep } from '../util/math';

/**
 * The macro lens: what the slice looks like when the camera is close enough
 * that a millimetre is many screen pixels.
 *
 * Far out the slice is pixel art, one pixel per millimetre, and that reads
 * well: it is a map of the nest. Close up the same squares become big flat
 * tiles next to ants drawn at full resolution. So past a zoom threshold the
 * slice is resolved further instead of enlarged: each millimetre is drawn as
 * k × k sub-pixels, colours are blended between cell centres, the boundary
 * between open and solid is traced smoothly (with a little organic wobble),
 * and a per-material micro-texture shows what the soil is made of: crumbs in
 * humus, sand grains and silt in loam, fine smooth clay, loose pellets of
 * excavated soil, the packed skin of a tunnel wall. The texture averages to
 * the cell's own colour, so far-out colours, light and composition carry over
 * and the change reads as a lens coming into focus, not a style swap.
 *
 * Plants get the same treatment: smooth stems and tapering blades instead of
 * one-pixel staircases.
 */

// Classes: what a cell is for the purpose of tracing boundaries.
const SKY = 0;
const OPEN = 1;
const SOILC = 2;
const ROOTC = 3;
const STONEC = 4;
const LOOSE = 5;
const WATERC = 6;
const HEAP = 7;
const LITTERC = 8;
/** Woody shrub stems in the plant layer: not ground for the ants, but drawn by the lens like a solid. */
const TWIGC = 9;
/** Classes that are solid ground (gain the wobble, get a packed skin against tunnels). */
const SOLIDC = new Uint8Array([0, 0, 1, 1, 1, 1, 0, 1, 1, 1]);

// Micro-textures.
const T_HUMUS = 0;
const T_LOAM = 1;
const T_CLAY = 2;
const T_SAND = 3;
const T_LIME = 4;
const T_STONE = 5;
const T_ROOT = 6;
const T_PELLET = 7;
const T_WALL = 8;
const T_FLAT = 9;
const T_FIBER = 10;
const NTEX = 11;
/** How strongly each texture modulates its cell's colour (1 + v/127 · amp). */
const AMP = new Float32Array([0.38, 0.3, 0.2, 0.42, 0.22, 0.16, 0.2, 0.5, 0.14, 0.05, 0.3]);
/** How many mineral grains show in each texture (0..1). */
const SPECK = new Float32Array([0.55, 1, 0.45, 1, 0.5, 0.35, 0, 0.8, 0.3, 0, 0]);
/** Colour multipliers of the mineral grains, by kind (none, quartz, rusty, dark, glint). */
const SPK_MUL = new Float32Array([1, 1, 1, 1.5, 1.46, 1.4, 1.2, 0.86, 0.68, 0.5, 0.48, 0.48, 2.1, 2.05, 1.9]);

const CLASS_OF = new Uint8Array(32);
const TEX_OF = new Uint8Array(32);
for (const [m, c, t] of [
  [HUMUS, SOILC, T_HUMUS], [LOAM, SOILC, T_LOAM], [CLAY, SOILC, T_CLAY], [SUBSOIL, SOILC, T_SAND],
  [SANDY, SOILC, T_SAND], [LIME, SOILC, T_LIME], [GRAVEL, STONEC, T_STONE], [STONE, STONEC, T_STONE],
  [ROCK, STONEC, T_STONE], [BEDROCK, STONEC, T_STONE], [ROOT, ROOTC, T_ROOT], [SAND, LOOSE, T_PELLET],
  [WATER, WATERC, T_FLAT], [LITTER, LITTERC, T_FIBER], [WOOD, LITTERC, T_FIBER],
  // Fallen fruit, dead insects and the cicada nymph: smooth, domed and a little glossy.
  [FRUIT, STONEC, T_FLAT], [PREY, STONEC, T_FLAT],
] as const) {
  CLASS_OF[m] = c;
  TEX_OF[m] = t;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** A piece of the lens image (see MacroLens.draw). */
interface Tile {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Sub-division and focus it was drawn at. */
  k: number;
  f: number;
  /** Light version it was drawn under. */
  light: number;
  /** Its soil changed since. */
  dirty: boolean;
  /** Last frame it was on screen. */
  used: number;
}

/** Tile side, in cells (mm). */
const TILE = 32;
/** How far a cell's change reaches into the picture: the solidity blur and the quads around it. */
const MARGIN = 3;

/** Texture tiles: 8 texels per millimetre, repeating every 64 mm. */
const TS = 512;
const TM = TS - 1;
const TPM = 8;

export class MacroLens {
  private world: World;
  private tex: Int8Array[] = [];
  /** Organic wobble for boundaries, -1..1, same tiling as the textures. */
  private jit: Float32Array;
  /** Mineral grains (0 none, 1 quartz, 2 rusty, 3 dark, 4 glint), same tiling. */
  private spk: Uint8Array;
  private img: ImageData | null = null;
  private out: Uint32Array | null = null;
  // Per-cell scratch for the region being composed.
  private cls = new Uint8Array(0);
  private tx = new Uint8Array(0);
  private cr = new Float32Array(0);
  private cg = new Float32Array(0);
  private cb = new Float32Array(0);
  private ca = new Float32Array(0);
  private sol = new Float32Array(0);
  private tmp = new Float32Array(0);
  private uni = new Uint8Array(0);
  private mixA = new Float32Array(0);
  private mixStamp = new Uint32Array(0);
  private stamp = 0;

  constructor(world: World, seed: number) {
    this.world = world;
    const rng = new Rng(seed * 31 + 7);
    for (let t = 0; t < NTEX; t++) this.tex.push(makeTexture(t, rng));
    this.jit = periodicNoise(rng);
    this.spk = speckles(rng);
  }

  /** Sub-pixels per millimetre for a given screen scale (device pixels per mm). */
  static subdiv(z: number): number {
    return Math.max(2, Math.min(6, Math.round(z / 2.8)));
  }

  // ------------------------------------------------------------- tiles

  /**
   * The lens image is kept in tiles of 32 × 32 mm, each drawn once and reused
   * until something in it changes: the soil (dug, wet, fallen), the light, or
   * how far in focus the lens is. Stale tiles are redrawn a few per frame
   * within a time budget, nearest the middle of the view first, so panning,
   * following an ant or a change of light never redraws the whole screen at
   * once. A tile drawn at another sub-division or focus still covers the same
   * ground, so it stays on screen until its turn comes.
   */
  private tiles = new Map<number, Tile>();
  private frame = 0;
  /** Bumped when the light has changed enough to show (see Renderer.lightMoved). */
  lightVersion = 0;

  /** Cells to light for the tiles over `vr` (the visible cells): whole tiles plus the blur margin. */
  region(vr: Rect): Rect {
    const w = this.world;
    return {
      x0: Math.max(0, Math.floor(vr.x0 / TILE) * TILE - MARGIN),
      y0: Math.max(0, Math.floor(vr.y0 / TILE) * TILE - MARGIN),
      x1: Math.min(w.w - 1, (Math.floor(vr.x1 / TILE) + 1) * TILE - 1 + MARGIN),
      y1: Math.min(w.h - 1, (Math.floor(vr.y1 / TILE) + 1) * TILE - 1 + MARGIN),
    };
  }

  /** Mark the tiles that saw a change (call before the world's dirty list is cleared). */
  markDirty(): void {
    const w = this.world;
    if (!this.tiles.size) return;
    if (w.dirtyAll) {
      this.markAll();
      return;
    }
    const nx = Math.ceil(w.w / TILE);
    for (let k = 0; k < w.dirtyCount; k++) {
      const i = w.dirtyList[k]!;
      const x = i % w.w;
      const y = (i - x) / w.w;
      // A change reaches MARGIN cells into the neighbouring tiles (the blur and the quads).
      const tx0 = Math.floor((x - MARGIN) / TILE);
      const tx1 = Math.floor((x + MARGIN) / TILE);
      const ty0 = Math.floor((y - MARGIN) / TILE);
      const ty1 = Math.floor((y + MARGIN) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = this.tiles.get(ty * nx + tx);
          if (t) t.dirty = true;
        }
      }
    }
  }

  markAll(): void {
    for (const t of this.tiles.values()) t.dirty = true;
  }

  /**
   * Draw the lens over the visible cells `vr`, with the context already scaled
   * to world millimetres. `f` is how far in focus (0 looks like the pixel slice,
   * 1 is full material), `alpha` its opacity, `budget` milliseconds to spend on
   * redrawing stale tiles. A tile with no picture yet shows `slice` (the pixel
   * slice) until its turn comes.
   */
  draw(ctx: CanvasRenderingContext2D, buf: Uint32Array, vr: Rect, z: number, f: number, alpha: number, budget: number, slice: HTMLCanvasElement): void {
    const w = this.world;
    const k = MacroLens.subdiv(z);
    const fq = Math.round(f * 8) / 8;
    const nx = Math.ceil(w.w / TILE);
    const tx0 = Math.max(0, Math.floor(vr.x0 / TILE));
    const tx1 = Math.min(nx - 1, Math.floor(vr.x1 / TILE));
    const ty0 = Math.max(0, Math.floor(vr.y0 / TILE));
    const ty1 = Math.min(Math.ceil(w.h / TILE) - 1, Math.floor(vr.y1 / TILE));
    const cx = (vr.x0 + vr.x1) / 2;
    const cy = (vr.y0 + vr.y1) / 2;
    this.frame++;
    // What each visible tile needs: 0 nothing drawn yet, 1 another sub-division or focus,
    // 2 its soil changed, 3 the light changed, 4 up to date.
    const todo: { key: number; tx: number; ty: number; need: number; d: number }[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = ty * nx + tx;
        const t = this.tiles.get(key);
        if (t) t.used = this.frame;
        const need = !t ? 0 : t.k !== k || t.f !== fq ? 1 : t.dirty ? 2 : t.light !== this.lightVersion ? 3 : 4;
        if (need < 4) {
          const d = Math.hypot((tx + 0.5) * TILE - cx, (ty + 0.5) * TILE - cy);
          todo.push({ key, tx, ty, need, d });
        }
      }
    }
    todo.sort((a, b) => a.need - b.need || a.d - b.d);
    const t0 = performance.now();
    let done = 0;
    for (const job of todo) {
      const spent = performance.now() - t0;
      // Always make some progress; a tile with nothing on it yet may take a little longer.
      if (done > 0 && spent > (job.need === 0 ? budget * 2.5 : budget)) break;
      this.drawTile(job.key, job.tx, job.ty, buf, k, fq);
      done++;
    }
    // Put the tiles on screen. Each canvas has a one-sub-pixel border, so smoothing
    // across tile edges reads real neighbours and no seams show.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    if (alpha < 1) ctx.globalAlpha = alpha;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles.get(ty * nx + tx);
        const X = tx * TILE;
        const Y = ty * TILE;
        const cw = Math.min(TILE, w.w - X);
        const ch = Math.min(TILE, w.h - Y);
        if (t) {
          ctx.drawImage(t.canvas, 1, 1, cw * t.k, ch * t.k, X, Y, cw, ch);
        } else if (alpha >= 1) {
          // Not drawn yet (and the pixel slice isn't under the lens at full strength).
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(slice, X, Y, cw, ch, X, Y, cw, ch);
          ctx.imageSmoothingEnabled = true;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    // Forget tiles long out of view (a close-up tile is ~150 KB).
    if (this.tiles.size > 180) {
      for (const [key, t] of this.tiles) if (this.frame - t.used > 90) this.tiles.delete(key);
    }
  }

  private drawTile(key: number, tx: number, ty: number, buf: Uint32Array, k: number, f: number): void {
    const w = this.world;
    const X = tx * TILE;
    const Y = ty * TILE;
    const o = { x0: X, y0: Y, x1: Math.min(w.w - 1, X + TILE - 1), y1: Math.min(w.h - 1, Y + TILE - 1) };
    const r = { x0: Math.max(0, o.x0 - MARGIN), y0: Math.max(0, o.y0 - MARGIN), x1: Math.min(w.w - 1, o.x1 + MARGIN), y1: Math.min(w.h - 1, o.y1 + MARGIN) };
    const img = this.compose(buf, r, o, k, f);
    let t = this.tiles.get(key);
    const side = TILE * k + 2;
    if (!t) {
      const canvas = document.createElement('canvas');
      t = { canvas, ctx: canvas.getContext('2d')!, k, f, light: 0, dirty: false, used: this.frame };
      this.tiles.set(key, t);
    }
    if (t.canvas.width !== side) {
      t.canvas.width = side;
      t.canvas.height = side;
    }
    t.ctx.putImageData(img, 0, 0, 0, 0, img.w, img.h);
    t.k = k;
    t.f = f;
    t.light = this.lightVersion;
    t.dirty = false;
    t.used = this.frame;
  }

  // ------------------------------------------------------------- composing

  /**
   * Resolve the lit slice `buf` over the cells of `o` into k sub-pixels per
   * cell, with a border of one sub-pixel. The cells of `r` (which contains `o`
   * and must be lit) supply the neighbours; past its edge the outermost cells
   * are held.
   *
   * Where ground meets air the boundary follows a lightly blurred solidity
   * field rather than cell edges, so steps in a tunnel wall become a curve.
   * Straight walls stay exactly where the cells put them, and every cell keeps
   * its own centre, so no gap an ant can use is closed and no thread is cut.
   *
   * `f` is the focus: at 0 every sub-pixel takes its own cell's colour and
   * class, which looks like the pixel slice; towards 1 colours blend between
   * cells, edges follow the field, and texture, grains and the wall lining
   * come in. So the lens can fade in where it still looks like pixels and
   * then come into focus, with nothing drawn twice.
   */
  compose(buf: Uint32Array, r: Rect, o: Rect, k: number, f: number): ImageData & { w: number; h: number } {
    const w = this.world;
    const W = w.w;
    const OW = (o.x1 - o.x0 + 1) * k + 2;
    const OH = (o.y1 - o.y0 + 1) * k + 2;
    if (!this.img || this.img.width < OW || this.img.height < OH) {
      this.img = new ImageData(Math.max(OW, TILE * 6 + 2), Math.max(OH, TILE * 6 + 2));
      this.out = new Uint32Array(this.img.data.buffer);
    }
    const stride = this.img.width;
    const out = this.out!;

    // Unpack the region's cells: class, texture, lit colour, solidity.
    const RW = r.x1 - r.x0 + 1;
    const RH = r.y1 - r.y0 + 1;
    const n = RW * RH;
    if (this.cls.length < n) {
      this.cls = new Uint8Array(n);
      this.tx = new Uint8Array(n);
      this.cr = new Float32Array(n);
      this.cg = new Float32Array(n);
      this.cb = new Float32Array(n);
      this.ca = new Float32Array(n);
      this.sol = new Float32Array(n);
      this.tmp = new Float32Array(n);
      this.uni = new Uint8Array(n);
    }
    const { cls, tx, cr, cg, cb, ca, sol, tmp, uni } = this;
    const mat = w.mat;
    const bg = w.bg;
    for (let y = 0; y < RH; y++) {
      let i = (r.y0 + y) * W + r.x0;
      let l = y * RW;
      for (let x = 0; x < RW; x++, i++, l++) {
        const m = mat[i]!;
        let c: number;
        let t: number;
        if (m === EMPTY) {
          // Shrub stems are drawn here (rounded, barked); other plants are drawn as shapes
          // over the lens (drawPlants), so here they are air.
          if (w.plant[i] === TWIG) {
            c = TWIGC;
            t = T_FIBER;
          } else {
            c = bg[i] ? OPEN : SKY;
            t = T_WALL;
          }
        } else if (m === SEED || m === REFUSE || isPiece(w, i)) {
          // The top layer of a heap is drawn as loose grains over the back wall; inside, a solid base.
          if (heapy(w, i - W)) {
            c = HEAP;
            t = T_FLAT;
          } else {
            c = bg[i] ? OPEN : SKY;
            t = T_WALL;
          }
        } else {
          c = CLASS_OF[m]!;
          t = TEX_OF[m]!;
        }
        const col = buf[i]!;
        cls[l] = c;
        tx[l] = t;
        let R = col & 255;
        let G = (col >>> 8) & 255;
        let B = (col >>> 16) & 255;
        if (c === OPEN) {
          // The back wall a few millimetres behind the glass: a little lighter than far out,
          // so black ants stand off it (and the edges, not darkness, carry the cavity).
          R *= 1 + 0.08 * f;
          G *= 1 + 0.07 * f;
          B *= 1 + 0.06 * f;
        } else if (c === LITTERC) {
          // Dead leaves and twigs close up: brown and dry rather than orange.
          R *= 1 - 0.26 * f;
          G *= 1 - 0.3 * f;
          B *= 1 - 0.3 * f;
        } else if (c === HEAP) {
          // Inside a heap: shade between the grains.
          R *= 1 - 0.3 * f;
          G *= 1 - 0.34 * f;
          B *= 1 - 0.36 * f;
        }
        cr[l] = R;
        cg[l] = G;
        cb[l] = B;
        ca[l] = col >>> 24;
        tmp[l] = SOLIDC[c]!;
      }
    }
    for (let y = 1; y < RH - 1; y++) {
      for (let x = 1, l = y * RW + 1; x < RW - 1; x++, l++) {
        const c = cls[l]!;
        if (c === STONEC || c === TWIGC) {
          // Stones (and fruit, dead insects, shrub stems) are rounded: lighter where they
          // face up and left, darker under.
          const e = (cls[l - RW] !== c ? 1 : 0) + (cls[l - 1] !== c ? 0.6 : 0) - (cls[l + RW] !== c ? 1 : 0) - (cls[l + 1] !== c ? 0.6 : 0);
          const g = 1 + 0.16 * e * f;
          cr[l] *= g;
          cg[l] *= g;
          cb[l] *= g;
        } else if (c === ROOTC) {
          // In focus, fine roots are drawn as fibres over the soil (see drawRoots), so here
          // they turn into the soil around them.
          let R = 0;
          let G = 0;
          let B = 0;
          let s = 0;
          for (const d of [-1, 1, -RW, RW, -RW - 1, -RW + 1, RW - 1, RW + 1]) {
            if (cls[l + d] !== SOILC) continue;
            R += cr[l + d]!;
            G += cg[l + d]!;
            B += cb[l + d]!;
            s++;
          }
          if (s) {
            // They dissolve only once the fibres are already there (see Renderer.render).
            const q = rootFade(f);
            cr[l] += (R / s - cr[l]!) * q;
            cg[l] += (G / s - cg[l]!) * q;
            cb[l] += (B / s - cb[l]!) * q;
          }
          cls[l] = SOILC;
          tx[l] = T_LOAM;
        }
      }
    }
    // Solidity, blurred [1 4 6 4 1] both ways (a straight wall stays on its cell edge).
    for (let y = 0; y < RH; y++) {
      const row = y * RW;
      for (let x = 0; x < RW; x++) {
        const a = tmp[row + (x > 1 ? x - 2 : 0)]!;
        const b = tmp[row + (x > 0 ? x - 1 : 0)]!;
        const c = tmp[row + (x < RW - 1 ? x + 1 : RW - 1)]!;
        const d = tmp[row + (x < RW - 2 ? x + 2 : RW - 1)]!;
        sol[row + x] = (a + 4 * b + 6 * tmp[row + x]! + 4 * c + d) / 16;
      }
    }
    for (let x = 0; x < RW; x++) {
      for (let y = 0; y < RH; y++) {
        const a = sol[(y > 1 ? y - 2 : 0) * RW + x]!;
        const b = sol[(y > 0 ? y - 1 : 0) * RW + x]!;
        const c = sol[(y < RH - 1 ? y + 1 : RH - 1) * RW + x]!;
        const d = sol[(y < RH - 2 ? y + 2 : RH - 1) * RW + x]!;
        tmp[y * RW + x] = (a + 4 * b + 6 * sol[y * RW + x]! + 4 * c + d) / 16;
      }
    }
    const S = tmp;
    // Quads (between four cell centres) inside one material and away from any edge take
    // the fast path: 1 inside, 2 inside the sky.
    for (let y = 0; y < RH - 1; y++) {
      for (let x = 0, l = y * RW; x < RW - 1; x++, l++) {
        const c = cls[l]!;
        let u = 0;
        if (c === cls[l + 1] && c === cls[l + RW] && c === cls[l + RW + 1]) {
          const a = S[l]!;
          const b = S[l + 1]!;
          const d = S[l + RW]!;
          const e = S[l + RW + 1]!;
          if (SOLIDC[c] ? a > 0.62 && b > 0.62 && d > 0.62 && e > 0.62 : a < 0.2 && b < 0.2 && d < 0.2 && e < 0.2) u = c === SKY ? 2 : 1;
        }
        uni[l] = u;
      }
    }

    // Sub-pixel centres in cell-centre coordinates: which four cells, and how far between them.
    const colQ = new Int32Array(OW);
    const colF = new Float32Array(OW);
    const colT = new Int32Array(OW);
    for (let sx = 0; sx < OW; sx++) {
      const u = o.x0 + (sx - 1 + 0.5) / k;
      const uc = u - 0.5;
      let q = Math.floor(uc);
      let fr = uc - q;
      if (q < r.x0) {
        q = r.x0;
        fr = 0;
      } else if (q > r.x1 - 1) {
        q = r.x1 - 1;
        fr = 1;
      }
      colQ[sx] = q - r.x0;
      colF[sx] = fr;
      colT[sx] = Math.floor(u * TPM) & TM;
    }

    const tex = this.tex;
    const jit = this.jit;
    const spk = this.spk;
    const E = 0.6 / k;
    // Texture comes in with the focus; mineral grains, the lining and the shadows only near the end.
    const texF = 0.3 + 0.7 * f;
    const fine = f * f;
    // Per quad, how much of the soil around each corner is the soil of the quad's first
    // cell ([1 4 6 4 1] weights over 5 × 5 cells), worked out the first time a quad needs it.
    if (this.mixA.length < n * 4) {
      this.mixA = new Float32Array(n * 4);
      this.mixStamp = new Uint32Array(n);
    }
    const mixA = this.mixA;
    const mixStamp = this.mixStamp;
    const stamp = ++this.stamp;
    const KW = [1, 4, 6, 4, 1];
    const share = (l: number, a: number): number => {
      const x = l % RW;
      const y = (l - x) / RW;
      let num = 0;
      let den = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = Math.min(RH - 1, Math.max(0, y + dy));
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(RW - 1, Math.max(0, x + dx));
          const lq = yy * RW + xx;
          if (cls[lq] !== SOILC) continue;
          const wq = KW[dx + 2]! * KW[dy + 2]!;
          den += wq;
          if (tx[lq] === a) num += wq;
        }
      }
      return den ? num / den : 0;
    };
    const ls = new Int32Array(4);
    const ws = new Float32Array(4);
    // Colour of one side of a boundary (solid or not) at a sub-pixel: its cells among
    // the four, by weight; if none of the four is on that side, the nearest such cell
    // in the ring around them. Leaves the colour in p*, the texture in pT, the class in pC.
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let pa = 0;
    let pT = 0;
    let pC = 0;
    const side = (want: number, l00: number, fx: number, fy: number, wob = 0): void => {
      let sw = 0;
      let bw = -1;
      pr = pg = pb = pa = 0;
      // Which material on this side: the one with the most weight (stones pushed a
      // little by the wobble, so their outlines aren't drawn with a ruler).
      let wc = -1;
      let wcs = -9;
      for (let q = 0; q < 4; q++) {
        const c = cls[ls[q]!]!;
        if (SOLIDC[c] !== want) continue;
        let sc = c === SOILC || c === OPEN ? 0 : wob;
        for (let p = 0; p < 4; p++) if (cls[ls[p]!] === c) sc += ws[p]!;
        if (sc > wcs) {
          wcs = sc;
          wc = c;
        }
      }
      for (let q = 0; q < 4; q++) {
        const lq = ls[q]!;
        if (cls[lq] !== wc) continue;
        const wq = ws[q]! + 1e-4;
        pr += cr[lq]! * wq;
        pg += cg[lq]! * wq;
        pb += cb[lq]! * wq;
        pa += ca[lq]! * wq;
        sw += wq;
        if (wq > bw) {
          bw = wq;
          pT = tx[lq]!;
          pC = cls[lq]!;
        }
      }
      if (sw > 0) {
        pr /= sw;
        pg /= sw;
        pb /= sw;
        pa /= sw;
        return;
      }
      let bd = 99;
      let bl = l00;
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const lq = l00 + dy * RW + dx;
          if (lq < 0 || lq >= n || SOLIDC[cls[lq]!] !== want) continue;
          const d = (dx - fx) * (dx - fx) + (dy - fy) * (dy - fy);
          if (d < bd) {
            bd = d;
            bl = lq;
          }
        }
      }
      pr = cr[bl]!;
      pg = cg[bl]!;
      pb = cb[bl]!;
      pa = ca[bl]!;
      pT = tx[bl]!;
      pC = cls[bl]!;
    };

    for (let sy = 0; sy < OH; sy++) {
      const v = o.y0 + (sy - 1 + 0.5) / k;
      const vc = v - 0.5;
      let qy = Math.floor(vc);
      let fy = vc - qy;
      if (qy < r.y0) {
        qy = r.y0;
        fy = 0;
      } else if (qy > r.y1 - 1) {
        qy = r.y1 - 1;
        fy = 1;
      }
      const rowL = (qy - r.y0) * RW;
      const tv = (Math.floor(v * TPM) & TM) * TS;
      let p = sy * stride;
      for (let sx = 0; sx < OW; sx++, p++) {
        const fx = colF[sx]!;
        const l00 = rowL + colQ[sx]!;
        const l10 = l00 + 1;
        const l01 = l00 + RW;
        const l11 = l01 + 1;
        const ln = fx < 0.5 ? (fy < 0.5 ? l00 : l01) : fy < 0.5 ? l10 : l11;
        const u = uni[l00]!;
        if (u === 2) {
          out[p] = 0;
          continue;
        }
        const c00 = cls[l00]!;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const ti = tv + colT[sx]!;
        let R: number;
        let G: number;
        let B: number;
        let A: number;
        let texId: number;
        let amp = 1;
        let lum = 1;
        if (u === 1) {
          // Inside one material, away from any edge: from the cell's own colour (out of
          // focus) to colours blended between cells (in focus).
          R = cr[l00]! * w00 + cr[l10]! * w10 + cr[l01]! * w01 + cr[l11]! * w11;
          G = cg[l00]! * w00 + cg[l10]! * w10 + cg[l01]! * w01 + cg[l11]! * w11;
          B = cb[l00]! * w00 + cb[l10]! * w10 + cb[l01]! * w01 + cb[l11]! * w11;
          if (f < 1) {
            R = cr[ln]! + (R - cr[ln]!) * f;
            G = cg[ln]! + (G - cg[ln]!) * f;
            B = cb[ln]! + (B - cb[ln]!) * f;
          }
          A = c00 === WATERC ? ca[ln]! : 255;
          texId = tx[ln]!;
          if (f > 0.2 && (tx[l00] !== tx[l10] || tx[l00] !== tx[l01] || tx[l00] !== tx[l11])) {
            // Where one soil meets another (humus over sand, loam into clay) the line
            // follows a blurred field of the one soil, like the ground/air edge, so it
            // curves instead of stepping from cell to cell.
            const a = tx[l00]!;
            const q = l00 * 4;
            if (mixStamp[l00] !== stamp) {
              mixStamp[l00] = stamp;
              mixA[q] = share(l00, a);
              mixA[q + 1] = share(l10, a);
              mixA[q + 2] = share(l01, a);
              mixA[q + 3] = share(l11, a);
            }
            const ia = mixA[q]! * w00 + mixA[q + 1]! * w10 + mixA[q + 2]! * w01 + mixA[q + 3]! * w11 + jit[(ti + 0x3d17) & 0x3ffff]! * 0.08;
            const isA = ia > 0.5;
            // The colour and texture of that soil, from its cells among the four.
            let sr = 0;
            let sg = 0;
            let sb = 0;
            let sw = 0;
            let bw = -1;
            let bt = a;
            for (let c = 0; c < 4; c++) {
              const lc = c === 0 ? l00 : c === 1 ? l10 : c === 2 ? l01 : l11;
              if ((tx[lc] === a) !== isA) continue;
              const wc = (c === 0 ? w00 : c === 1 ? w10 : c === 2 ? w01 : w11) + 1e-4;
              sr += cr[lc]! * wc;
              sg += cg[lc]! * wc;
              sb += cb[lc]! * wc;
              sw += wc;
              if (wc > bw) {
                bw = wc;
                bt = tx[lc]!;
              }
            }
            texId = bt;
            // Soft for a sub-pixel either side of the line.
            const t = Math.min(1, Math.abs(ia - 0.5) / E) * 0.5 + 0.5;
            const q2 = f * t;
            R += (sr / sw - R) * q2;
            G += (sg / sw - G) * q2;
            B += (sb / sw - B) * q2;
          }
        } else {
          const s0 = S[l00]!;
          const s1 = S[l10]!;
          const s2 = S[l01]!;
          const s3 = S[l11]!;
          ls[0] = l00; ls[1] = l10; ls[2] = l01; ls[3] = l11;
          ws[0] = w00; ws[1] = w10; ws[2] = w01; ws[3] = w11;
          // Ground or air: in focus the blurred field with a little organic wobble decides;
          // out of focus, the cell itself. A cell the blur would swallow (a gap one or two
          // cells wide, a lone grain, a thin spur) still shows what it is around its centre.
          const mine = SOLIDC[cls[ln]!]!;
          const s = mine + (s0 * w00 + s1 * w10 + s2 * w01 + s3 * w11 + jit[ti]! * 0.09 - mine) * f;
          const nx = fx < 0.5 ? fx : 1 - fx;
          const ny = fy < 0.5 ? fy : 1 - fy;
          const lost = mine ? S[ln]! < 0.5 : S[ln]! > 0.5;
          const own = lost && nx * nx + ny * ny < 0.1;
          const solid = own ? mine : s > 0.5 ? 1 : 0;
          side(solid, l00, fx, fy, jit[(ti + 0x1555) & 0x3ffff]! * 0.25 * f);
          let cl = pC;
          if (solid === mine) {
            // Out of focus, a cell keeps its own colour.
            pr = cr[ln]! + (pr - cr[ln]!) * f;
            pg = cg[ln]! + (pg - cg[ln]!) * f;
            pb = cb[ln]! + (pb - cb[ln]!) * f;
            pa = ca[ln]! + (pa - ca[ln]!) * f;
            if (f < 0.5) {
              pT = tx[ln]!;
              cl = pC = cls[ln]!;
            }
          }
          // Within air, sky versus the nest's open space (and water) is just the nearest cell.
          if (!solid && own) cl = cls[ln]!;
          if (cl === SKY) {
            // Fade the edge of the ground into the sky.
            const m = 0.5 - s;
            if (m >= E || own) {
              out[p] = 0;
              continue;
            }
            side(1, l00, fx, fy);
            const t = 0.5 * (1 - m / E);
            R = pr;
            G = pg;
            B = pb;
            A = pa * t;
            texId = pT;
          } else {
            R = pr;
            G = pg;
            B = pb;
            A = pa;
            texId = pT;
            const m = solid ? s - 0.5 : 0.5 - s;
            if (solid) {
              // Ant-made lining: workers pat the walls smooth and compact, a darker, finer
              // skin a few tenths of a millimetre thick. Floors catch the light on their lip.
              if (m < 0.14 && (cls[l00] === OPEN || cls[l10] === OPEN || cls[l01] === OPEN || cls[l11] === OPEN)) {
                const q = (1 - m / 0.14) * fine;
                amp = 1 - 0.85 * q;
                const gy = s2 + s3 - s0 - s1;
                const gx = s1 + s3 - s0 - s2;
                const floor = gy > 0.08 && gy > Math.abs(gx) * 0.6;
                lum = floor && m < 0.06 ? 1 + (0.24 - m * 2) * fine : 1 - 0.14 * q;
              }
            } else if (cl === OPEN && m < 0.3) {
              // Contact shadow on the back wall just inside the opening.
              lum = 1 - 0.34 * (1 - m / 0.3) * fine;
            }
            if (m < E && !own) {
              // Anti-alias across the edge.
              const t = 0.5 * (1 - m / E);
              const r1 = R;
              const g1 = G;
              const b1 = B;
              const a1 = A;
              side(solid ? 0 : 1, l00, fx, fy);
              if (pC === SKY) {
                A = a1 * (1 - t);
              } else {
                R = r1 + (pr - r1) * t;
                G = g1 + (pg - g1) * t;
                B = b1 + (pb - b1) * t;
                A = a1 + (pa - a1) * t;
              }
            }
          }
        }
        // Grain is uneven: some patches are crumbly, some smoother.
        const patch = 0.8 + 0.4 * jit[(ti + 0x2a15a) & 0x3ffff]!;
        const g = (1 + (tex[texId]![ti]! / 127) * AMP[texId]! * amp * patch * texF) * lum;
        let rr = R * g;
        let gg = G * g;
        let bb = B * g;
        // Mineral grains: pale quartz, rusty and dark grains, the odd glint. Multiplied,
        // so they take the light they are in.
        const sp = spk[ti]!;
        if (sp && amp > 0.5) {
          const q = SPECK[texId]! * fine;
          if (q > 0) {
            const k3 = sp * 3;
            rr *= 1 + (SPK_MUL[k3]! - 1) * q;
            gg *= 1 + (SPK_MUL[k3 + 1]! - 1) * q;
            bb *= 1 + (SPK_MUL[k3 + 2]! - 1) * q;
          }
        }
        if (rr > 255) rr = 255;
        if (gg > 255) gg = 255;
        if (bb > 255) bb = 255;
        out[p] = (((A | 0) << 24) | ((bb & 255) << 16) | ((gg & 255) << 8) | (rr & 255)) >>> 0;
      }
    }
    const res = this.img as ImageData & { w: number; h: number };
    res.w = OW;
    res.h = OH;
    return res;
  }

  /**
   * Fine roots as fibres: root cells are walked into chains and drawn as
   * smoothed threads, so a grass root mat reads as a tangle of hairs, not
   * pale blotches. Long chains (main roots) are a little thicker.
   */
  drawRoots(ctx: CanvasRenderingContext2D, view: { x0: number; y0: number; x1: number; y1: number }, light: (x: number, y: number) => RGB, z: number): void {
    const w = this.world;
    const W = w.w;
    const x0 = Math.max(1, Math.floor(view.x0) - 2);
    const x1 = Math.min(W - 2, Math.ceil(view.x1) + 2);
    const y0 = Math.max(1, Math.floor(view.y0) - 2);
    const y1 = Math.min(w.h - 2, Math.ceil(view.y1) + 2);
    const mat = w.mat;
    const seen = new Set<number>();
    const chains: [number, number][][] = [];
    const jitter = (i: number): [number, number] => {
      const h = Math.imul(i, 2654435761) >>> 0;
      return [(i % W) + 0.5 + ((h & 255) / 255 - 0.5) * 0.45, ((i / W) | 0) + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.45];
    };
    // Prefer to keep going the way the root was going (and downward), straight neighbours first.
    const DIRS = [[0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1]] as const;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i0 = y * W + x;
        if (mat[i0] !== ROOT || seen.has(i0)) continue;
        const chain: [number, number][] = [];
        let i = i0;
        let px = 0;
        let py = 1;
        for (let guard = 0; guard < 400; guard++) {
          seen.add(i);
          chain.push(jitter(i));
          let best = -1;
          let bs = -9;
          const cx = i % W;
          const cy = (i / W) | 0;
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            const j = ny * W + nx;
            if (mat[j] !== ROOT || seen.has(j)) continue;
            const sc = (dx * px + dy * py) / Math.hypot(dx, dy) + dy * 0.3;
            if (sc > bs) {
              bs = sc;
              best = j;
            }
          }
          if (best < 0) break;
          px = (best % W) - cx;
          py = ((best / W) | 0) - cy;
          i = best;
        }
        // Join the start to a root it branches from, so branches don't float.
        const sx = i0 % W;
        const sy = (i0 / W) | 0;
        for (const [dx, dy] of [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]] as const) {
          const j = (sy + dy) * W + sx + dx;
          if (mat[j] === ROOT && seen.has(j) && j !== i0 && chain.length > 1) {
            chain.unshift(jitter(j));
            break;
          }
        }
        chains.push(chain);
      }
    }
    if (!chains.length) return;
    const l = light((x0 + x1) / 2, (y0 + y1) / 2);
    const col = (c: RGB, a: number): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
    const main = new Path2D();
    const fine = new Path2D();
    const add = (p: Path2D, pts: [number, number][]): void => {
      p.moveTo(pts[0]![0], pts[0]![1]);
      if (pts.length === 1) p.lineTo(pts[0]![0] + 0.2, pts[0]![1] + 0.3);
      for (let k = 1; k < pts.length - 1; k++) {
        const [x, y] = pts[k]!;
        const [nx, ny] = pts[k + 1]!;
        p.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      if (pts.length > 1) p.lineTo(pts[pts.length - 1]![0], pts[pts.length - 1]![1]);
    };
    for (const c of chains) add(c.length > 14 ? main : fine, smooth(c));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The channel a root runs in is a shade darker; the root itself pale, its upper edge lit.
    ctx.strokeStyle = col([30, 20, 14], 0.28);
    ctx.lineWidth = 0.8;
    ctx.stroke(main);
    ctx.lineWidth = 0.5;
    ctx.stroke(fine);
    ctx.strokeStyle = col([178, 150, 110], 0.72);
    ctx.lineWidth = 0.3;
    ctx.stroke(main);
    ctx.strokeStyle = col([170, 142, 104], 0.6);
    ctx.lineWidth = 0.16;
    ctx.stroke(fine);
    ctx.strokeStyle = col([226, 204, 166], 0.35);
    ctx.lineWidth = Math.max(0.07, 1 / z);
    ctx.stroke(main);
  }

  // ------------------------------------------------------------- plants

  /**
   * Plants as smooth shapes: stems as curves, grass blades and rosette leaves
   * tapering to a point, clover leaflets round, clover heads as balls of
   * florets, ripe seeds as grains. Only parts still standing are drawn.
   */
  drawPlants(
    ctx: CanvasRenderingContext2D,
    plants: Plants,
    light: (x: number, y: number) => RGB,
    view: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const w = this.world;
    const W = w.w;
    const adj = (a: number, b: number): boolean => {
      const ax = a % W;
      const bx = b % W;
      return Math.abs(ax - bx) <= 1 && Math.abs((a - ax) / W - (b - bx) / W) <= 1;
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of plants.list) {
      if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.baseY < view.y0 - 2 || p.baseY - 90 > view.y1) continue;
      const l = light(p.x, p.baseY - 12);
      const lit = (c: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
      const runs: { m: number; tone: number; pts: number[] }[] = [];
      const blobs: { i: number; tone: number }[] = [];
      const flowers: { i: number; tone: number }[] = [];
      const parts = p.parts;
      for (let k = 0; k < parts.length; k++) {
        const pt = parts[k]!;
        if (w.plant[pt.i] !== pt.m) continue;
        // Feather grass "flowers" are its long awns: drawn as lines, like stems.
        if (pt.m === FLOWER && p.kind !== 'stipa') {
          flowers.push(pt);
          continue;
        }
        if (pt.m === LEAF && p.kind === 'clover') {
          blobs.push(pt);
          continue;
        }
        // A pod stalk on shepherd's purse shares its row with the next stem cell: a short side stroke.
        const nx = parts[k + 1];
        const side = pt.m === STEM && nx && nx.m === STEM && ((nx.i / W) | 0) === ((pt.i / W) | 0) && nx.i !== pt.i;
        let run = side ? undefined : runs.find((r) => r.m === pt.m && adj(r.pts[r.pts.length - 1]!, pt.i));
        if (!run) {
          run = { m: pt.m, tone: pt.tone, pts: [] };
          const host = runs.find((r) => r.pts.some((q) => adj(q, pt.i)));
          if (host) {
            let near = host.pts[0]!;
            for (const q of host.pts) if (adj(q, pt.i)) near = q;
            run.pts.push(near);
          }
          runs.push(run);
        }
        run.pts.push(pt.i);
      }
      for (const r of runs) {
        const pts = smooth(r.pts.map((i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5] as [number, number]), r.m === LEAF ? 2 : 4);
        if (r.m === FLOWER) {
          // A feather-grass awn: a fine silvery thread with a feathered plume.
          strokeCurve(ctx, pts, lit([200, 196, 178], 0.85), 0.16);
          ctx.strokeStyle = lit([226, 222, 206], 0.4);
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          for (let q = Math.floor(pts.length * 0.35); q < pts.length - 1; q++) {
            const [x, y] = pts[q]!;
            const [nx2, ny2] = pts[q + 1]!;
            const dx = nx2 - x;
            const dy = ny2 - y;
            const d = Math.hypot(dx, dy) || 1;
            ctx.moveTo(x - (dy / d) * 0.55, y + (dx / d) * 0.55);
            ctx.lineTo(x + (dy / d) * 0.55, y - (dx / d) * 0.55);
          }
          ctx.stroke();
          continue;
        }
        const base = greenCol(r.m, w.ptone[r.pts[r.pts.length > 1 ? 1 : 0]!]!);
        if (r.m === STEM) {
          const width = p.kind === 'purse' ? 0.62 : p.kind === 'clover' ? 0.5 : p.kind === 'erodium' ? 0.42 : p.kind === 'stipa' ? 0.46 : 0.56;
          strokeCurve(ctx, pts, lit(base), width);
          strokeCurve(ctx, pts.map(([x, y]) => [x - 0.14, y] as [number, number]), lit([base[0] * 1.35 + 20, base[1] * 1.3 + 18, base[2] * 1.2], 0.55), width * 0.28);
        } else {
          blade(ctx, pts, p.kind === 'purse' ? 1.5 : p.kind === 'erodium' ? 1.3 : p.kind === 'stipa' ? 0.6 : 0.95, lit(base));
          // Midrib catches the light.
          strokeCurve(ctx, pts.slice(0, Math.max(2, pts.length - 1)), lit([base[0] * 1.4 + 18, base[1] * 1.35 + 20, base[2] * 1.2], 0.45), 0.12);
        }
      }
      if (blobs.length) this.clover(ctx, blobs, greenCol(LEAF, w.ptone[blobs[0]!.i]!), lit);
      if (flowers.length) {
        // One flower (or flower head) per patch of touching cells.
        const left = new Map(flowers.map((c) => [c.i, c]));
        while (left.size) {
          const first = left.values().next().value!;
          left.delete(first.i);
          const group = [first];
          for (let q = 0; q < group.length; q++) {
            const i = group[q]!.i;
            for (const d of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) {
              const c = left.get(i + d);
              if (c) {
                left.delete(c.i);
                group.push(c);
              }
            }
          }
          this.flower(ctx, group, p.kind, lit);
        }
      }
      // Ripe seeds still on the plant.
      for (const s of p.slots) {
        if (w.plant[s] !== SEEDHEAD) continue;
        const x = (s % W) + 0.5;
        const y = ((s / W) | 0) + 0.5;
        const look = seedLook(w.ptone[s]!);
        const rot = (((s * 2654435761) >>> 24) / 255) * Math.PI;
        ctx.fillStyle = lit(look.col);
        ctx.beginPath();
        ctx.ellipse(x, y, look.rx * 1.05, look.ry * 1.05, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lit([255, 238, 200], 0.4);
        ctx.beginPath();
        ctx.ellipse(x - look.rx * 0.25, y - look.ry * 0.35, look.rx * 0.35, look.ry * 0.25, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Fallen leaves and twigs close up: each run of litter cells is followed and
   * drawn as a thin, curled leaf (brown, a paler midrib, darker edges) or a
   * barked twig, over the lens's own strip of litter.
   */
  drawLitter(ctx: CanvasRenderingContext2D, view: Rect, light: (x: number, y: number) => RGB): void {
    const w = this.world;
    const W = w.w;
    const x0 = Math.max(1, Math.floor(view.x0) - 24);
    const x1 = Math.min(W - 2, Math.ceil(view.x1) + 24);
    const y0 = Math.max(1, Math.floor(view.y0) - 4);
    const y1 = Math.min(w.h - 2, Math.ceil(view.y1) + 4);
    const mat = w.mat;
    const seen = new Set<number>();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i0 = y * W + x;
        if (mat[i0] !== LITTER || seen.has(i0)) continue;
        // Litter lies along the ground: walk left to right, stepping up or down a cell.
        const run: number[] = [];
        let i = i0;
        for (let guard = 0; guard < 60; guard++) {
          seen.add(i);
          run.push(i);
          const next = [i + 1, i + 1 - W, i + 1 + W].find((j) => mat[j] === LITTER && !seen.has(j));
          if (next === undefined) break;
          i = next;
        }
        const twig = w.tint[i0] === 1;
        const pts = smooth(run.map((j) => [(j % W) + 0.5, ((j / W) | 0) + 0.6] as [number, number]), 3);
        const l = light(pts[0]![0], pts[0]![1]);
        const lit = (c: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
        if (twig) {
          const c = sampleRamp(PAL.twig, w.tone[i0]! / 255);
          strokeCurve(ctx, pts, lit(c), 0.95);
          strokeCurve(ctx, pts.map(([px, py]) => [px, py - 0.22] as [number, number]), lit([c[0] * 1.5 + 14, c[1] * 1.45 + 12, c[2] * 1.4 + 10], 0.5), 0.22);
          continue;
        }
        // A dead leaf: brown, dry, its ends curling up.
        const c = mixRGB(sampleRamp(PAL.leafLitter, w.tone[i0]! / 255), [92, 64, 40], 0.35);
        if (pts.length > 2) {
          pts[0] = [pts[0]![0], pts[0]![1] - 0.6];
          pts[pts.length - 1] = [pts[pts.length - 1]![0], pts[pts.length - 1]![1] - 0.5];
        }
        blade(ctx, pts, 1.25, lit(c));
        strokeCurve(ctx, pts, lit([c[0] * 1.35 + 16, c[1] * 1.3 + 12, c[2] * 1.25 + 8], 0.5), 0.12);
      }
    }
  }

  /**
   * The shrub at ant height: its stems are drawn by the lens (barked and
   * rounded); here each leaf is a pointed leaf with a midrib, each flower five
   * petals (white blackthorn, pink dog rose), each fruit a sloe with its bloom
   * or a glossy hip.
   */
  drawShrub(ctx: CanvasRenderingContext2D, shrub: ShrubInfo, light: (x: number, y: number) => RGB, view: Rect): void {
    const w = this.world;
    const W = w.w;
    if (shrub.x < view.x0 - 160 || shrub.x > view.x1 + 160) return;
    const l = light(shrub.x, w.ground[shrub.x]! - 20);
    const lit = (c: RGB, a = 1): string => `rgba(${(c[0] * l[0]) | 0},${(c[1] * l[1]) | 0},${(c[2] * l[2]) | 0},${a})`;
    for (const cells of shrub.leaves) {
      const on = cells.filter((i) => w.plant[i] === LEAF);
      if (!on.length) continue;
      const { cx, cy, a, len, wid } = patchShape(on, W);
      if (cx < view.x0 - 8 || cx > view.x1 + 8 || cy < view.y0 - 8 || cy > view.y1 + 8) continue;
      const base = greenCol(LEAF, w.ptone[on[0]!]!);
      const L = Math.max(1.4, len);
      const H = Math.max(0.8, Math.min(wid, L * 0.55));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = lit(base);
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.quadraticCurveTo(-L * 0.2, -H * 1.5, L, 0);
      ctx.quadraticCurveTo(-L * 0.2, H * 1.5, -L, 0);
      ctx.fill();
      ctx.strokeStyle = lit([base[0] * 1.35 + 18, base[1] * 1.3 + 20, base[2] * 1.2], 0.5);
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(L * 0.9, 0);
      for (let q = -0.5; q <= 0.5; q += 0.33) {
        ctx.moveTo(q * L, 0);
        ctx.lineTo(q * L + L * 0.25, -H * 0.6);
        ctx.moveTo(q * L, 0);
        ctx.lineTo(q * L + L * 0.25, H * 0.6);
      }
      ctx.stroke();
      ctx.restore();
    }
    for (const cells of shrub.buds) {
      const fl = cells.filter((i) => w.plant[i] === FLOWER);
      const be = cells.filter((i) => w.plant[i] === BERRY);
      const on = fl.length >= be.length ? fl : be;
      if (!on.length) continue;
      const { cx, cy, len } = patchShape(on, W);
      if (cx < view.x0 - 8 || cx > view.x1 + 8 || cy < view.y0 - 8 || cy > view.y1 + 8) continue;
      const R = Math.max(1, len);
      if (on === fl) {
        const pink = shrub.kind === 'rose';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = lit(pink ? sampleRamp(PAL.flowerPink, 0.6 + (k % 2) * 0.15) : [246, 243, 234]);
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, R * 0.52, R * 0.42, a, 0, Math.PI * 2);
          ctx.fill();
        }
        // A ring of stamens.
        ctx.fillStyle = lit([222, 196, 96]);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28, Math.max(0.1, R * 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const pt = w.ptone[on[0]!]! / 255;
        const sloe = pt < 0.5;
        const c = sloe ? sampleRamp(PAL.sloe, pt * 2) : sampleRamp(PAL.hip, (pt - 0.5) * 2);
        ctx.fillStyle = lit(c);
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * (sloe ? 1 : 0.8), R * (sloe ? 1 : 1.15), 0, 0, Math.PI * 2);
        ctx.fill();
        // A sloe wears a pale waxy bloom; a hip is glossy.
        ctx.fillStyle = sloe ? lit([150, 160, 196], 0.25) : lit([255, 220, 200], 0.5);
        ctx.beginPath();
        ctx.ellipse(cx - R * 0.3, cy - R * 0.35, R * (sloe ? 0.55 : 0.22), R * (sloe ? 0.45 : 0.3), -0.5, 0, Math.PI * 2);
        ctx.fill();
        if (!sloe) {
          ctx.fillStyle = lit([60, 40, 24]);
          ctx.beginPath();
          ctx.arc(cx, cy + R * 1.1, R * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Clover leaves: each leaflet is found by its middle cell (the one with all four
   * neighbours in leaf), and drawn as a rounded leaflet turned away from the
   * middle of its leaf, with the pale chevron white clover carries.
   */
  private clover(ctx: CanvasRenderingContext2D, cells: { i: number; tone: number }[], base: RGB, lit: (c: RGB, a?: number) => string): void {
    const W = this.world.w;
    const set = new Set(cells.map((c) => c.i));
    const mids = cells.filter((c) => set.has(c.i - 1) && set.has(c.i + 1) && set.has(c.i - W) && set.has(c.i + W));
    const pts = mids.map((c) => [(c.i % W) + 0.5, ((c.i / W) | 0) + 0.5] as [number, number]);
    // Leaflets of one leaf sit within 4 mm of each other.
    const group = pts.map((_, k) => k);
    const find = (k: number): number => (group[k] === k ? k : (group[k] = find(group[k]!)));
    for (let a = 0; a < pts.length; a++)
      for (let b = a + 1; b < pts.length; b++)
        if (Math.hypot(pts[a]![0] - pts[b]![0], pts[a]![1] - pts[b]![1]) < 4.2) group[find(a)] = find(b);
    for (let a = 0; a < pts.length; a++) {
      let cx = 0;
      let cy = 0;
      let nn = 0;
      for (let b = 0; b < pts.length; b++)
        if (find(b) === find(a)) {
          cx += pts[b]![0];
          cy += pts[b]![1];
          nn++;
        }
      cx /= nn;
      cy /= nn;
      const [x, y] = pts[a]!;
      const ang = nn > 1 ? Math.atan2(y - cy, x - cx) : -Math.PI / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = lit(base);
      ctx.beginPath();
      ctx.ellipse(0.1, 0, 1.55, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lit([base[0] * 0.7, base[1] * 0.75, base[2] * 0.7], 0.8);
      ctx.lineWidth = 0.1;
      ctx.stroke();
      ctx.strokeStyle = lit([200, 220, 176], 0.4);
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(0.55, -0.75);
      ctx.lineTo(-0.15, 0);
      ctx.lineTo(0.55, 0.75);
      ctx.stroke();
      ctx.restore();
    }
  }

  private flower(ctx: CanvasRenderingContext2D, cells: { i: number; tone: number }[], kind: string, lit: (c: RGB, a?: number) => string): void {
    const W = this.world.w;
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += (c.i % W) + 0.5;
      sy += ((c.i / W) | 0) + 0.5;
    }
    const cx = sx / cells.length;
    const cy = sy / cells.length;
    const t = cells[0]!.tone / 255;
    if (kind === 'clover') {
      // A ball of tubular florets, the lower ones turned down and browning.
      const pink = t >= 0.5;
      const ramp = pink ? PAL.flowerPink : PAL.flowerWhite;
      const R = 2.3;
      ctx.fillStyle = lit(sampleRamp(ramp, 0.15));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * Math.PI * 2 + (k % 2) * 0.12;
        const rr = R * (0.55 + ((k * 7) % 5) * 0.08);
        const x = cx + Math.cos(a) * rr * 0.75;
        const y = cy + Math.sin(a) * rr * 0.75;
        const low = Math.sin(a) > 0.5;
        ctx.fillStyle = lit(low ? [170, 140, 110] : sampleRamp(ramp, 0.55 + ((k * 3) % 4) * 0.12));
        ctx.beginPath();
        ctx.ellipse(x, y, 0.75, 0.3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = lit(sampleRamp(ramp, 0.95), 0.7);
      ctx.beginPath();
      ctx.arc(cx - 0.5, cy - 0.7, 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'erodium') {
      // Stork's bill: one small five-petalled pink flower with darker veins.
      const R = 1.5;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.fillStyle = lit(sampleRamp(PAL.flowerPink, 0.55 + (k % 2) * 0.2));
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, R * 0.55, R * 0.38, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = lit([140, 60, 96], 0.5);
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85);
      }
      ctx.stroke();
      ctx.fillStyle = lit([226, 206, 120]);
      ctx.beginPath();
      ctx.arc(cx, cy, 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Shepherd's purse: tiny four-petalled white flowers in a tight cluster.
      for (const c of cells) {
        const x = (c.i % W) + 0.5;
        const y = ((c.i / W) | 0) + 0.5;
        ctx.fillStyle = lit(sampleRamp(PAL.flowerWhite, 0.8));
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 0.32, y + Math.sin(a) * 0.32, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = lit([214, 196, 110]);
        ctx.beginPath();
        ctx.arc(x, y, 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ------------------------------------------------------------- curves

/**
 * A piece of fruit or prey lying in the nest (stored, or being cut up): close
 * up it is drawn as a crumb among the seeds. Out in the open a dead insect or
 * a fallen sloe keeps its shape, and so does a cicada nymph in the soil.
 */
export function isPiece(w: World, i: number): boolean {
  const m = w.mat[i];
  return (m === FRUIT || (m === PREY && w.tint[i] !== 3)) && w.bg[i] === 1;
}

/** Seed, chaff or a stored piece: what a granary heap is made of. */
export function heapy(w: World, i: number): boolean {
  const m = w.mat[i];
  return m === SEED || m === REFUSE || isPiece(w, i);
}


/** How far fine roots have turned from pixels into fibres at a given focus. */
export const rootFade = (f: number): number => smoothstep(0.35, 0.9, f);
/** How visible the root fibres are at a given focus: in before the pixels go. */
export const fibreAlpha = (f: number): number => smoothstep(0.05, 0.45, f);

/** A stem or leaf's colour: its shade, and how dry it is (green, yellowing, straw, dead). */
function greenCol(m: number, pt: number): RGB {
  const sh = (pt & 63) / 63;
  const dry = pt >> DRY_SHIFT;
  const c = sampleRamp(m === STEM ? PAL.stem : PAL.leaf, sh);
  if (dry === 3) return mixRGB(c, sampleRamp(PAL.deadPlant, sh), 0.9);
  if (dry > 0) return mixRGB(c, sampleRamp(PAL.straw, sh), dry === 1 ? 0.45 : 0.88);
  return c;
}

/** Centre, long axis (radians), half-length and half-width of a patch of cells. */
function patchShape(cells: number[], W: number): { cx: number; cy: number; a: number; len: number; wid: number } {
  let cx = 0;
  let cy = 0;
  for (const i of cells) {
    cx += (i % W) + 0.5;
    cy += ((i / W) | 0) + 0.5;
  }
  cx /= cells.length;
  cy /= cells.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const i of cells) {
    const dx = (i % W) + 0.5 - cx;
    const dy = ((i / W) | 0) + 0.5 - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy);
  let lo = 0;
  let hi = 0;
  let wl = 0;
  let wh = 0;
  for (const i of cells) {
    const dx = (i % W) + 0.5 - cx;
    const dy = ((i / W) | 0) + 0.5 - cy;
    const u = dx * Math.cos(a) + dy * Math.sin(a);
    const v = -dx * Math.sin(a) + dy * Math.cos(a);
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
    wl = Math.min(wl, v);
    wh = Math.max(wh, v);
  }
  return { cx, cy, a, len: (hi - lo) / 2 + 0.5, wid: (wh - wl) / 2 + 0.5 };
}

/** Soften a cell-centre polyline (passes of a three-point average, ends kept). */
function smooth(pts: [number, number][], passes = 2): [number, number][] {
  let a = pts;
  for (let pass = 0; pass < passes; pass++) {
    if (a.length < 3) return a;
    const b: [number, number][] = [a[0]!];
    for (let k = 1; k < a.length - 1; k++) {
      b.push([(a[k - 1]![0] + a[k]![0] * 2 + a[k + 1]![0]) / 4, (a[k - 1]![1] + a[k]![1] * 2 + a[k + 1]![1]) / 4]);
    }
    b.push(a[a.length - 1]!);
    a = b;
  }
  return a;
}

function curvePath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  if (pts.length === 1) {
    ctx.lineTo(pts[0]![0] + 0.01, pts[0]![1]);
    return;
  }
  for (let k = 1; k < pts.length - 1; k++) {
    const [x, y] = pts[k]!;
    const [nx, ny] = pts[k + 1]!;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last[0], last[1]);
}

function strokeCurve(ctx: CanvasRenderingContext2D, pts: [number, number][], style: string, width: number): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  curvePath(ctx, pts);
  ctx.stroke();
}

/** A leaf blade: full width at the base, tapering to a point at the tip. */
function blade(ctx: CanvasRenderingContext2D, pts: [number, number][], w0: number, style: string): void {
  const n = pts.length;
  if (n < 2) return;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)]!;
    const b = pts[Math.min(n - 1, k + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const f = k / (n - 1);
    // Narrow at the very base, widest a third of the way, then a long taper.
    const hw = (w0 / 2) * Math.min(1, 0.55 + f * 2.2) * Math.pow(1 - f, 0.85) + 0.04;
    left.push([pts[k]![0] - dy * hw, pts[k]![1] + dx * hw]);
    right.push([pts[k]![0] + dy * hw, pts[k]![1] - dx * hw]);
  }
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  for (let k = 1; k < n; k++) ctx.lineTo(left[k]![0], left[k]![1]);
  for (let k = n - 1; k >= 0; k--) ctx.lineTo(right[k]![0], right[k]![1]);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------- textures

/** Sparse mineral grains, 0.06–0.17 mm across: mostly quartz, some rusty, some dark, a few that glint. */
function speckles(rng: Rng): Uint8Array {
  const out = new Uint8Array(TS * TS);
  for (let n = 0; n < 9000; n++) {
    const gx = rng.next() * TS;
    const gy = rng.next() * TS;
    const r = 0.5 + rng.next() * 0.9;
    const u = rng.next();
    const kind = u < 0.5 ? 1 : u < 0.7 ? 2 : u < 0.93 ? 3 : 4;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const px = Math.floor(gx) + dx;
        const py = Math.floor(gy) + dy;
        if ((px + 0.5 - gx) ** 2 + (py + 0.5 - gy) ** 2 > r * r) continue;
        out[(py & TM) * TS + (px & TM)] = kind;
      }
    }
  }
  return out;
}

/** Smooth noise that repeats every tile, two octaves, -1..1. */
function periodicNoise(rng: Rng): Float32Array {
  const out = new Float32Array(TS * TS);
  for (const [cells, amp] of [[24, 0.7], [64, 0.3]] as const) {
    const lat = new Float32Array(cells * cells);
    for (let k = 0; k < lat.length; k++) lat[k] = rng.next() * 2 - 1;
    const step = TS / cells;
    for (let y = 0; y < TS; y++) {
      const gy = y / step;
      const iy = Math.floor(gy);
      let fy = gy - iy;
      fy = fy * fy * (3 - 2 * fy);
      const y0 = (iy % cells) * cells;
      const y1 = ((iy + 1) % cells) * cells;
      for (let x = 0; x < TS; x++) {
        const gx = x / step;
        const ix = Math.floor(gx);
        let fx = gx - ix;
        fx = fx * fx * (3 - 2 * fx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = lat[y0 + x0]! + (lat[y0 + x1]! - lat[y0 + x0]!) * fx;
        const b = lat[y1 + x0]! + (lat[y1 + x1]! - lat[y1 + x0]!) * fx;
        out[y * TS + x] += (a + (b - a) * fy) * amp;
      }
    }
  }
  return out;
}

/**
 * Stamp round grains into a tile, lit from the upper left: a highlight on the
 * shoulder, a darker rim, a dark pore where grains don't touch.
 */
function grains(
  t: Int16Array,
  rng: Rng,
  count: number,
  rMin: number,
  rMax: number,
  base: number,
  spread: number,
  shade: number,
  rim: number,
  glint = 0,
  squash = 1,
): void {
  for (let n = 0; n < count; n++) {
    const gx = rng.next() * TS;
    const gy = rng.next() * TS;
    const r = rMin + (rMax - rMin) * rng.next() * rng.next();
    const b = base + (rng.next() * 2 - 1) * spread;
    const rot = rng.next() * Math.PI;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    const sq = squash + (1 - squash) * rng.next() * 0.5;
    const R = Math.ceil(r + 1);
    const shiny = rng.next() < glint;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const px = Math.floor(gx) + dx;
        const py = Math.floor(gy) + dy;
        const ex = px + 0.5 - gx;
        const ey = py + 0.5 - gy;
        // Slightly elongated, randomly turned grains.
        const u = (ex * ca + ey * sa) * sq;
        const v = -ex * sa + ey * ca;
        const d = Math.sqrt(u * u + v * v) / r;
        if (d > 1) continue;
        let val = b + shade * (-(ex + ey) / (r * 1.41)) - rim * Math.max(0, d - 0.65) / 0.35;
        if (shiny && d < 0.35 && ex < 0 && ey < 0) val = 127;
        t[(py & TM) * TS + (px & TM)] = val;
      }
    }
  }
}

/** Thin dark lines: cracks in clay, fibres in humus. */
function threads(t: Int16Array, rng: Rng, count: number, segs: number, len: number, val: number, curl: number): void {
  for (let n = 0; n < count; n++) {
    let x = rng.next() * TS;
    let y = rng.next() * TS;
    let a = rng.next() * Math.PI * 2;
    for (let s = 0; s < segs; s++) {
      a += (rng.next() * 2 - 1) * curl;
      const L = len * (0.5 + rng.next());
      for (let k = 0; k < L; k++) {
        x += Math.cos(a);
        y += Math.sin(a);
        t[(Math.floor(y) & TM) * TS + (Math.floor(x) & TM)] = val;
      }
    }
  }
}

function fill(t: Int16Array, rng: Rng, base: number, spread: number): void {
  for (let k = 0; k < t.length; k++) t[k] = base + (rng.next() * 2 - 1) * spread;
}

function addNoise(t: Int16Array, n: Float32Array, amp: number): void {
  for (let k = 0; k < t.length; k++) t[k] += n[k]! * amp;
}

function makeTexture(kind: number, rng: Rng): Int8Array {
  const t = new Int16Array(TS * TS);
  switch (kind) {
    case T_HUMUS:
      // Crumbs: rounded aggregates with dark pores between, bits of organic matter.
      fill(t, rng, -62, 22);
      grains(t, rng, 9000, 1.5, 5, 0, 28, 22, 30, 0, 0.75);
      grains(t, rng, 6000, 0.6, 1.4, 0, 38, 10, 0);
      threads(t, rng, 220, 2, 6, -85, 0.9);
      grains(t, rng, 260, 0.8, 1.6, 70, 20, 10, 0, 0, 0.5);
      break;
    case T_LOAM:
      // Silt and a few sand grains, small aggregates, pores.
      fill(t, rng, -10, 25);
      grains(t, rng, 2000, 2, 5.5, 0, 18, 16, 26, 0, 0.75);
      grains(t, rng, 3500, 0.8, 2, 30, 35, 30, 20, 0.06);
      grains(t, rng, 900, 0.5, 1.2, -110, 10, 0, 0);
      break;
    case T_CLAY:
      // Fine and dense: low, soft variation and a network of hairline cracks.
      fill(t, rng, 0, 9);
      addNoise(t, periodicNoise(rng), 42);
      threads(t, rng, 260, 5, 7, -105, 0.7);
      grains(t, rng, 500, 0.6, 1.3, 40, 20, 20, 0, 0.1);
      break;
    case T_SAND:
      // Packed quartz sand: distinct rounded grains, dark gaps, the odd glint.
      fill(t, rng, -95, 12);
      grains(t, rng, 13000, 1.4, 3.8, 12, 46, 52, 42, 0.08, 0.85);
      break;
    case T_LIME:
      fill(t, rng, 6, 10);
      addNoise(t, periodicNoise(rng), 50);
      grains(t, rng, 700, 0.8, 2, 30, 30, 18, 10);
      break;
    case T_STONE:
      fill(t, rng, 0, 14);
      addNoise(t, periodicNoise(rng), 30);
      grains(t, rng, 3000, 0.5, 1.4, 0, 70, 0, 0, 0.12);
      break;
    case T_ROOT:
      fill(t, rng, 0, 18);
      threads(t, rng, 900, 1, 10, 40, 0.15);
      threads(t, rng, 500, 1, 10, -50, 0.15);
      break;
    case T_PELLET:
      // Excavated soil comes out as moist pellets the size of an ant's head: loose, with voids.
      fill(t, rng, -115, 8);
      grains(t, rng, 3600, 3, 6.5, 14, 32, 64, 55, 0.02, 0.85);
      grains(t, rng, 3000, 0.8, 1.8, 20, 40, 30, 20);
      break;
    case T_WALL:
      // The soil face behind the glass, seen in shadow: soft crumbs.
      fill(t, rng, -30, 18);
      grains(t, rng, 5000, 1.5, 4.5, 4, 24, 20, 26, 0, 0.8);
      break;
    case T_FLAT:
      fill(t, rng, 0, 20);
      break;
    case T_FIBER:
      fill(t, rng, 0, 12);
      threads(t, rng, 1500, 1, 16, 50, 0.06);
      threads(t, rng, 1200, 1, 16, -60, 0.06);
      break;
  }
  // Centre on zero so the texture keeps the cell's own colour on average.
  let mean = 0;
  for (let k = 0; k < t.length; k++) mean += t[k]!;
  mean /= t.length;
  const out = new Int8Array(TS * TS);
  for (let k = 0; k < t.length; k++) {
    const v = t[k]! - mean;
    out[k] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return out;
}
