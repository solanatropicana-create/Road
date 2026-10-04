import { Container, Graphics } from 'pixi.js';
import type { SimEvent, Projectile } from '../sim/world';
import { C, TEAM } from './palette';
import { mix } from './shipView';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  kind: 'spark' | 'smoke' | 'chip' | 'flash' | 'ring' | 'ember';
  rot: number;
  vr: number;
  drag: number;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hit: boolean;
  life: number;
}

/** World-space effects. Deterministic sim, cosmetic randomness here is fine. */
export class Fx {
  root = new Container();
  private normal = new Graphics();
  private add = new Graphics();
  private parts: Particle[] = [];
  private beams: Beam[] = [];
  /** Accumulated screen-shake "trauma" requests (consumed by camera). */
  shake = 0;
  /** Requested hit-stop seconds (consumed by main loop). */
  hitStop = 0;

  constructor() {
    this.add.blendMode = 'add';
    this.root.addChild(this.normal, this.add);
  }

  /** focus = camera centre; effects far away shake less. */
  handle(e: SimEvent, focus: { x: number; y: number }): void {
    const near = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - focus.x, y - focus.y) / 160);
    switch (e.t) {
      case 'shot':
        this.p('flash', e.x, e.y, e.dx * 8, e.dy * 8, 0.06, 0.9, C.shell);
        for (let i = 0; i < 3; i++) this.p('spark', e.x, e.y, e.dx * 40 + rnd(12), e.dy * 40 + rnd(12), 0.12, 0.12, C.flameHot);
        this.shake += 0.015 * near(e.x, e.y);
        break;
      case 'hit': {
        const n = 6 + Math.min(10, e.energy / 60);
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(e.ny, e.nx) + rnd(1.3);
          const sp = 15 + Math.random() * 45;
          this.p('spark', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.25, 0.12, C.spark);
        }
        this.p('flash', e.x, e.y, 0, 0, 0.08, 1.6, 0xffffff);
        this.shake += 0.05 * near(e.x, e.y);
        break;
      }
      case 'break': {
        const team = TEAM[Math.max(0, e.team)] ?? TEAM[0]!;
        for (let i = 0; i < 4; i++) {
          this.p('chip', e.x + rnd(0.4), e.y + rnd(0.4), e.vx + rnd(14), e.vy + rnd(14), 1.4 + Math.random(), 0.22 + Math.random() * 0.18, mix(team.fill, team.dark, Math.random() * 0.6));
        }
        for (let i = 0; i < 6; i++) this.p('ember', e.x, e.y, e.vx + rnd(20), e.vy + rnd(20), 0.6 + Math.random() * 0.6, 0.1, C.flame);
        this.p('smoke', e.x, e.y, e.vx * 0.6 + rnd(3), e.vy * 0.6 + rnd(3), 1.5 + Math.random(), 1.2, C.smoke);
        this.p('flash', e.x, e.y, 0, 0, 0.1, 1.8, C.flameHot);
        this.shake += 0.07 * near(e.x, e.y);
        break;
      }
      case 'explode': {
        const s = Math.sqrt(e.energy) / 40;
        this.p('flash', e.x, e.y, 0, 0, 0.18, 9 * s, 0xffffff);
        this.p('ring', e.x, e.y, 0, 0, 0.5, 14 * s, C.reactor);
        this.p('ring', e.x, e.y, 0, 0, 0.8, 9 * s, C.flame);
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 20 + Math.random() * 70;
          this.p('ember', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.9, 0.16, i % 3 ? C.flame : C.reactor);
        }
        for (let i = 0; i < 10; i++) this.p('smoke', e.x + rnd(3), e.y + rnd(3), rnd(10), rnd(10), 2.5 + Math.random() * 2, 3, C.smoke);
        this.shake += 0.6 * near(e.x, e.y);
        this.hitStop = Math.max(this.hitStop, 0.09 * near(e.x, e.y));
        break;
      }
      case 'beam':
        this.beams.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, hit: e.hit, life: 0.035 });
        if (e.hit && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          this.p('spark', e.x2, e.y2, Math.cos(a) * 25, Math.sin(a) * 25, 0.2, 0.1, C.laser);
          if (Math.random() < 0.15) this.p('smoke', e.x2, e.y2, rnd(3), rnd(3), 1.2, 0.8, C.smoke);
        }
        break;
      case 'impact': {
        const n = Math.min(14, 3 + e.energy / 200);
        for (let i = 0; i < n; i++) this.p('spark', e.x, e.y, rnd(40), rnd(40), 0.3, 0.12, 0xffffff);
        this.shake += Math.min(0.4, e.energy / 4000) * near(e.x, e.y);
        break;
      }
      case 'disabled':
        this.hitStop = Math.max(this.hitStop, 0.16);
        this.shake += 0.4;
        break;
      default:
        break;
    }
  }

  private p(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, life: number, size: number, color: number): void {
    if (this.parts.length > 2600) return;
    this.parts.push({
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      color,
      kind,
      rot: Math.random() * 6.28,
      vr: rnd(12),
      drag: kind === 'smoke' ? 1.2 : kind === 'chip' ? 0.15 : kind === 'ember' ? 1.6 : 2.5,
    });
  }

  update(dt: number, projectiles: Projectile[]): void {
    const n = this.normal;
    const a = this.add;
    n.clear();
    a.clear();
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      keep.push(p);
      const f = p.life / p.max;
      switch (p.kind) {
        case 'spark':
          a.moveTo(p.x, p.y)
            .lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03)
            .stroke({ width: p.size, color: p.color, alpha: f, cap: 'round' });
          break;
        case 'ember':
          a.circle(p.x, p.y, p.size * (0.5 + f)).fill({ color: p.color, alpha: f });
          break;
        case 'flash':
          a.circle(p.x, p.y, p.size * (1.4 - f * 0.4)).fill({ color: p.color, alpha: f * 0.8 });
          break;
        case 'ring':
          a.circle(p.x, p.y, p.size * (1 - f) + 0.5).stroke({ width: 0.6 * f + 0.1, color: p.color, alpha: f });
          break;
        case 'smoke':
          n.circle(p.x, p.y, p.size * (1.6 - f * 0.6)).fill({ color: p.color, alpha: f * 0.35 });
          break;
        case 'chip': {
          const s = p.size;
          const c = Math.cos(p.rot) * s;
          const sn = Math.sin(p.rot) * s;
          n.poly([p.x - c + sn, p.y - sn - c, p.x + c + sn, p.y + sn - c, p.x + c - sn, p.y + sn + c, p.x - c - sn, p.y - sn + c]).fill({
            color: p.color,
            alpha: Math.min(1, f * 3),
          });
          break;
        }
      }
    }
    this.parts = keep;

    for (const pr of projectiles) {
      a.moveTo(pr.x, pr.y)
        .lineTo(pr.x - pr.vx * 0.018, pr.y - pr.vy * 0.018)
        .stroke({ width: 0.32, color: C.flame, alpha: 0.5, cap: 'round' });
      a.moveTo(pr.x, pr.y)
        .lineTo(pr.x - pr.vx * 0.01, pr.y - pr.vy * 0.01)
        .stroke({ width: 0.14, color: C.shell, alpha: 1, cap: 'round' });
    }

    const kb: Beam[] = [];
    for (const b of this.beams) {
      b.life -= dt;
      const w = 0.25 + Math.random() * 0.15;
      a.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: w * 3, color: C.laser, alpha: 0.25 });
      a.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: w, color: C.laserCore, alpha: 0.95 });
      if (b.hit) a.circle(b.x2, b.y2, 0.6 + Math.random() * 0.4).fill({ color: C.laser, alpha: 0.7 });
      if (b.life > 0) kb.push(b);
    }
    this.beams = kb;
  }

  clear(): void {
    this.parts = [];
    this.beams = [];
  }
}

const rnd = (s: number) => (Math.random() * 2 - 1) * s;
