import { Application, Container, Graphics, TilingSprite, type Texture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { ARENA_RADIUS, type World } from '../sim/world';
import type { Ship } from '../sim/ship';
import { ShipView } from './shipView';
import { Fx } from './fx';
import { C } from './palette';

/** Owns the Pixi scene graph: parallax stars, world layer, ships, effects, camera. */
export class Scene {
  stage = new Container();
  /** Screen-aligned wrapper so post filters work in screen space. */
  worldWrap = new Container();
  world = new Container();
  private planet = new Graphics();
  private stars: TilingSprite[] = [];
  private nebula = new Graphics();
  private boundary = new Graphics();
  private shipLayer = new Container();
  private views = new Map<Ship, ShipView>();
  fx = new Fx();

  cam = { x: 0, y: 0, zoom: 9 };
  private trauma = 0;
  private shakeT = 0;

  constructor(private app: Application) {
    app.stage.addChild(this.stage);
    this.buildStars();
    // A distant ringed planet with very slow parallax.
    const pl = this.planet;
    for (let k = 8; k >= 1; k--) pl.circle(0, 0, 26 + k * 5).fill({ color: 0x8f7cff, alpha: 0.01 * k });
    pl.circle(0, 0, 28).fill({ color: 0x241d45 });
    pl.circle(-7, -8, 21).fill({ color: 0x342a62, alpha: 0.9 });
    pl.ellipse(0, 0, 52, 9).stroke({ width: 2, color: 0xffb9c8, alpha: 0.3 });
    this.stage.addChild(pl);
    this.stage.addChild(this.worldWrap);
    this.worldWrap.addChild(this.world);
    this.world.addChild(this.nebula, this.boundary, this.shipLayer, this.fx.root);
    this.drawBoundary();
    this.setBloom(false);
  }

  bloom = false;
  setBloom(on: boolean): void {
    this.bloom = on;
    if (on) {
      const f = new AdvancedBloomFilter({ threshold: 0.86, bloomScale: 0.75, brightness: 1.0, blur: 5, quality: 4 });
      this.worldWrap.filters = [f];
      this.worldWrap.filterArea = this.app.screen;
    } else {
      this.worldWrap.filters = [];
    }
  }

  private buildStars(): void {
    const layers = [
      { n: 220, size: [0.6, 1.2], alpha: [0.25, 0.55], tile: 512 },
      { n: 110, size: [0.9, 1.7], alpha: [0.35, 0.75], tile: 640 },
      { n: 40, size: [1.4, 2.4], alpha: [0.5, 0.95], tile: 800 },
    ];
    const tints = [0xffffff, 0xbfe9ff, 0xffd6ec, 0xd8ccff];
    for (const L of layers) {
      const g = new Graphics();
      g.rect(0, 0, L.tile, L.tile).fill({ color: 0x000000, alpha: 0 });
      for (let i = 0; i < L.n; i++) {
        const r = L.size[0]! + Math.random() * (L.size[1]! - L.size[0]!);
        g.circle(Math.random() * L.tile, Math.random() * L.tile, r).fill({
          color: tints[i % tints.length]!,
          alpha: L.alpha[0]! + Math.random() * (L.alpha[1]! - L.alpha[0]!),
        });
      }
      const tex: Texture = this.app.renderer.generateTexture({ target: g, resolution: 1 });
      const ts = new TilingSprite({ texture: tex, width: this.app.screen.width, height: this.app.screen.height });
      this.stars.push(ts);
      this.stage.addChild(ts);
    }
  }

  private drawBoundary(): void {
    const g = this.boundary;
    const R = ARENA_RADIUS;
    const segs = 360;
    for (let i = 0; i < segs; i += 2) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      g.moveTo(Math.cos(a0) * R, Math.sin(a0) * R).lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    }
    g.stroke({ width: 0.35, color: C.boundary, alpha: 0.45 });
    // Soft nebula blobs give a sense of motion and place.
    const n = this.nebula;
    const blobs = [
      [-120, -60, 140, 0x3b2a7a],
      [160, 90, 170, 0x1f4f6b],
      [30, 220, 120, 0x5a2a5e],
      [-220, 180, 110, 0x23446b],
      [210, -200, 150, 0x4a2a6b],
    ] as const;
    for (const [x, y, r, c] of blobs) {
      for (let k = 20; k >= 1; k--) n.circle(x, y, (r * k) / 20).fill({ color: c, alpha: 0.011 });
    }
  }

  /** Create/destroy views to match the world's bodies. */
  syncWorld(world: World, time: number, aims: Map<Ship, { x: number; y: number }>): void {
    const live = new Set(world.ships);
    for (const [s, v] of this.views) {
      if (!live.has(s)) {
        v.destroy();
        this.views.delete(s);
      }
    }
    for (const s of world.ships) {
      let v = this.views.get(s);
      if (!v) {
        v = new ShipView(s);
        this.views.set(s, v);
        // Debris behind live ships.
        if (s.isDebris) this.shipLayer.addChildAt(v.root, 0);
        else this.shipLayer.addChild(v.root);
      }
      v.sync(time, aims.get(s) ?? null);
    }
  }

  clearWorld(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.fx.clear();
  }

  /** Move the camera towards a target framing. */
  updateCamera(dt: number, target: { x: number; y: number; zoom: number }): void {
    const k = 1 - Math.exp(-dt * 4);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;
    this.cam.zoom += (target.zoom - this.cam.zoom) * (1 - Math.exp(-dt * 2.5));

    this.trauma = Math.min(1, this.trauma + this.fx.shake);
    this.fx.shake = 0;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt;
    const sh = this.trauma * this.trauma * 18;
    const ox = sh * (Math.sin(this.shakeT * 53.1) + Math.sin(this.shakeT * 31.7) * 0.5);
    const oy = sh * (Math.cos(this.shakeT * 47.3) + Math.sin(this.shakeT * 27.9) * 0.5);

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.world.scale.set(this.cam.zoom);
    this.world.position.set(w / 2 - this.cam.x * this.cam.zoom + ox, h / 2 - this.cam.y * this.cam.zoom + oy);

    this.planet.position.set(w * 0.16 - this.cam.x * this.cam.zoom * 0.015, h * 0.8 - this.cam.y * this.cam.zoom * 0.015);
    const factors = [0.04, 0.09, 0.16];
    this.stars.forEach((s, i) => {
      s.width = w;
      s.height = h;
      const f = factors[i]!;
      s.tilePosition.set(-this.cam.x * this.cam.zoom * f + ox * 0.3, -this.cam.y * this.cam.zoom * f + oy * 0.3);
    });
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    return { x: (sx - w / 2) / this.cam.zoom + this.cam.x, y: (sy - h / 2) / this.cam.zoom + this.cam.y };
  }
}
