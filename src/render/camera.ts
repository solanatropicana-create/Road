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
  private worldW: number;
  private worldH: number;
  /** Smoothed target for zoom/pan transitions. */
  tx: number;
  ty: number;
  tzoom = 3;
  follow: { x: number; y: number } | null = null;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = this.tx = worldW / 2;
    this.y = this.ty = worldH / 2;
  }

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
    this.minZoom = Math.min(w / this.worldW, h / this.worldH) * 0.98;
  }

  fitZoom(): number {
    return Math.min(this.screenW / this.worldW, this.screenH / this.worldH);
  }

  fit(): void {
    this.tzoom = this.fitZoom();
    this.tx = this.worldW / 2;
    this.ty = this.worldH / 2;
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

  update(dt: number): void {
    if (this.follow) {
      this.tx = this.follow.x;
      this.ty = this.follow.y;
    }
    const k = 1 - Math.exp(-dt * 12);
    this.zoom += (this.tzoom - this.zoom) * k;
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.clampView();
  }

  private clampView(): void {
    const hw = this.screenW / 2 / this.zoom;
    const hh = this.screenH / 2 / this.zoom;
    const cx = (v: number, half: number, size: number): number => (half * 2 >= size ? size / 2 : clamp(v, half, size - half));
    this.x = cx(this.x, hw, this.worldW);
    this.y = cx(this.y, hh, this.worldH);
    const thw = this.screenW / 2 / this.tzoom;
    const thh = this.screenH / 2 / this.tzoom;
    this.tx = cx(this.tx, thw, this.worldW);
    this.ty = cx(this.ty, thh, this.worldH);
  }
}
