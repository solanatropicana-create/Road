import { clamp } from '../util/math';

/** World-space camera: (x, y) is the world point at the screen centre. */
export class Camera {
  x: number;
  y: number;
  zoom = 3;
  minZoom = 1;
  maxZoom = 14;
  screenW = 1;
  screenH = 1;
  /** Smoothed target for zoom/pan transitions. */
  tx: number;
  ty: number;
  tzoom = 3;
  follow: { x: number; y: number } | null = null;
  /** How quickly the view catches up with its target (per second). Slow for the documentary camera. */
  ease = 12;
  /** The part of the world that may be shown (the colony's known world). */
  private bx0 = 0;
  private by0 = 0;
  private bx1: number;
  private by1: number;

  constructor(worldW: number, worldH: number) {
    this.bx1 = worldW;
    this.by1 = worldH;
    this.x = this.tx = worldW / 2;
    this.y = this.ty = worldH / 2;
  }

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
    this.minZoom = this.fitZoom();
  }

  /**
   * Limit the view to part of the world. A view showing all of it (at the
   * fit zoom) keeps showing all of it as the part grows.
   */
  setBounds(x0: number, y0: number, x1: number, y1: number): void {
    if (Math.abs(x0 - this.bx0) < 0.5 && Math.abs(x1 - this.bx1) < 0.5 && Math.abs(y1 - this.by1) < 0.5 && y0 === this.by0) return;
    const wasFit = this.tzoom <= this.minZoom * 1.02;
    this.bx0 = x0;
    this.by0 = y0;
    this.bx1 = x1;
    this.by1 = y1;
    this.minZoom = this.fitZoom();
    if (wasFit) {
      this.tzoom = this.minZoom;
      if (!this.follow) {
        this.tx = (x0 + x1) / 2;
        this.ty = (y0 + y1) / 2;
      }
    }
    this.tzoom = Math.max(this.tzoom, this.minZoom);
  }

  /** Zoom at which the known world just covers the screen (no empty margins; the longer side is cropped). */
  fitZoom(): number {
    return Math.max(this.screenW / (this.bx1 - this.bx0), this.screenH / (this.by1 - this.by0));
  }

  fit(): void {
    this.tzoom = this.fitZoom();
    this.tx = (this.bx0 + this.bx1) / 2;
    this.ty = (this.by0 + this.by1) / 2;
  }

  /** Frame a part of the world (the known part, say): it fits on screen, with a little room around it. */
  fitRect(x0: number, y0: number, x1: number, y1: number): void {
    const z = Math.min(this.screenW / ((x1 - x0) * 1.12), this.screenH / ((y1 - y0) * 1.12));
    this.tzoom = clamp(z, this.minZoom, this.maxZoom);
    this.tx = (x0 + x1) / 2;
    this.ty = (y0 + y1) / 2;
    this.follow = null;
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.screenW / 2) / this.zoom + this.x, y: (sy - this.screenH / 2) / this.zoom + this.y };
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.screenW / 2, y: (wy - this.y) * this.zoom + this.screenH / 2 };
  }

  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    const z = clamp(this.tzoom * factor, this.minZoom, this.maxZoom);
    this.tzoom = z;
    // Solve for the centre that keeps `before` under the cursor at the target zoom.
    this.tx = before.x - (sx - this.screenW / 2) / z;
    this.ty = before.y - (sy - this.screenH / 2) / z;
    this.follow = null;
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.tx -= dxScreen / this.tzoom;
    this.ty -= dyScreen / this.tzoom;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.follow = null;
  }

  /** A jolt (a roof coming down nearby): screen pixels of shake, dying away. */
  private shakeAmp = 0;
  private shakeT = 0;
  shake(px: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, px);
  }
  /** The current shake offset, in screen pixels. */
  jolt(): { x: number; y: number } {
    if (this.shakeAmp < 0.2) return { x: 0, y: 0 };
    const a = this.shakeAmp;
    return { x: Math.sin(this.shakeT * 53) * a * 0.6, y: Math.sin(this.shakeT * 71 + 1) * a };
  }

  update(dt: number): void {
    if (this.shakeAmp > 0) {
      this.shakeT += dt;
      this.shakeAmp *= Math.exp(-dt * 3.2);
      if (this.shakeAmp < 0.2) this.shakeAmp = 0;
    }
    if (this.follow) {
      this.tx = this.follow.x;
      this.ty = this.follow.y;
    }
    this.tzoom = clamp(this.tzoom, this.minZoom, this.maxZoom);
    const k = 1 - Math.exp(-dt * this.ease);
    this.zoom += (this.tzoom - this.zoom) * k;
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.clampView();
  }

  private clampView(): void {
    const hw = this.screenW / 2 / this.zoom;
    const hh = this.screenH / 2 / this.zoom;
    const cx = (v: number, half: number, lo: number, hi: number): number => (half * 2 >= hi - lo ? (lo + hi) / 2 : clamp(v, lo + half, hi - half));
    this.x = cx(this.x, hw, this.bx0, this.bx1);
    this.y = cx(this.y, hh, this.by0, this.by1);
    const thw = this.screenW / 2 / this.tzoom;
    const thh = this.screenH / 2 / this.tzoom;
    this.tx = cx(this.tx, thw, this.bx0, this.bx1);
    this.ty = cx(this.ty, thh, this.by0, this.by1);
  }
}
