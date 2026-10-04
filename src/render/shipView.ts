import { Container, Graphics } from 'pixi.js';
import { DIR_VEC } from '../sim/defs';
import type { Ship, Tile } from '../sim/ship';
import { C, TEAM, DEBRIS_DIM } from './palette';

const hash = (x: number, y: number, s = 0): number => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Draws one physical body. Static parts (tiles, wires, icons, cracks) are
 * rebuilt only when the ship's visualVersion changes; moving parts (flames,
 * turret barrels, eyes, glows) are redrawn every frame.
 */
export class ShipView {
  root = new Container();
  private base = new Graphics();
  private dyn = new Graphics();
  private glow = new Graphics();
  private version = -1;
  blink = 0;

  constructor(readonly ship: Ship) {
    this.glow.blendMode = 'add';
    this.root.addChild(this.base, this.dyn, this.glow);
  }

  sync(time: number, aim: { x: number; y: number } | null): void {
    const s = this.ship;
    const p = s.body.getPosition();
    this.root.position.set(p.x, p.y);
    this.root.rotation = s.body.getAngle();
    if (this.version !== s.visualVersion) {
      this.version = s.visualVersion;
      this.drawBase();
    }
    this.drawDyn(time, aim);
  }

  private drawBase(): void {
    const g = this.base;
    const s = this.ship;
    g.clear();
    const team = TEAM[Math.max(0, s.origin)] ?? TEAM[0]!;
    const debris = s.isDebris;
    const tint = (c: number) => (debris ? dim(c, DEBRIS_DIM) : c);
    const tiles = [...s.tiles.values()];

    // 1. Outline silhouette: slightly oversized dark squares merge into one shape.
    for (const t of tiles) g.roundRect(t.x - 0.58, t.y - 0.58, 1.16, 1.16, 0.3);
    g.fill({ color: tint(team.dark) });

    // 2. Tile bodies.
    for (const t of tiles) {
      const k = t.def.kind;
      let color = team.fill;
      if (k === 'armor') color = C.armor[s.origin === 1 ? 1 : 0]!;
      else if (k === 'conduit' || k === 'frame') color = team.mid;
      else if (k !== 'hull') color = mix(team.fill, team.mid, 0.35);
      const hpR = t.hp / t.def.hp;
      color = mix(color, team.dark, (1 - hpR) * 0.45);
      g.roundRect(t.x - 0.47, t.y - 0.47, 0.94, 0.94, 0.22).fill({ color: tint(color) });
    }

    // 3. Rim light on exposed top/left edges for a soft sticker look.
    for (const t of tiles) {
      if (!s.tileAt(t.x, t.y - 1)) g.moveTo(t.x - 0.32, t.y - 0.4).lineTo(t.x + 0.32, t.y - 0.4);
      if (!s.tileAt(t.x - 1, t.y)) g.moveTo(t.x - 0.4, t.y - 0.32).lineTo(t.x - 0.4, t.y + 0.32);
    }
    g.stroke({ width: 0.07, color: tint(team.rim), alpha: 0.55, cap: 'round' });

    // 4. Details per kind.
    for (const t of tiles) this.drawTile(g, t, team.dark, tint);

    // 5. Cracks from damage.
    for (const t of tiles) {
      const r = 1 - t.hp / t.def.hp;
      if (r < 0.25) continue;
      const n = r > 0.66 ? 3 : r > 0.45 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = hash(t.x, t.y, i) * Math.PI * 2;
        const cx = t.x + (hash(t.x, t.y, i + 7) - 0.5) * 0.4;
        const cy = t.y + (hash(t.x, t.y, i + 13) - 0.5) * 0.4;
        const l = 0.25 + r * 0.25;
        g.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l)
          .lineTo(cx + Math.cos(a + 0.5) * l * 0.3, cy + Math.sin(a + 0.5) * l * 0.3)
          .lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      }
    }
    g.stroke({ width: 0.06, color: 0x140f24, alpha: 0.75 });
  }

  private drawTile(g: Graphics, t: Tile, dark: number, tint: (c: number) => number): void {
    const s = this.ship;
    const x = t.x;
    const y = t.y;
    const on = t.powered;
    switch (t.def.kind) {
      case 'armor':
        g.roundRect(x - 0.32, y - 0.32, 0.64, 0.64, 0.12).stroke({ width: 0.07, color: tint(C.armorEdge[s.origin === 1 ? 1 : 0]!), alpha: 0.8 });
        break;
      case 'frame':
        g.moveTo(x - 0.3, y - 0.3).lineTo(x + 0.3, y + 0.3).moveTo(x + 0.3, y - 0.3).lineTo(x - 0.3, y + 0.3);
        g.stroke({ width: 0.08, color: tint(dark), alpha: 0.6 });
        break;
      case 'conduit': {
        for (const d of DIR_VEC) {
          const n = s.tileAt(x + d.x, y + d.y);
          if (n && n.def.conducts) g.moveTo(x, y).lineTo(x + d.x * 0.5, y + d.y * 0.5);
        }
        g.stroke({ width: 0.17, color: tint(on ? C.wireOn : C.wireOff), cap: 'round' });
        g.circle(x, y, 0.13).fill({ color: tint(on ? C.wireOn : C.wireOff) });
        break;
      }
      case 'reactor':
        g.circle(x, y, 0.4).fill({ color: tint(dark) });
        g.circle(x, y, 0.27).fill({ color: tint(on ? C.reactor : C.lightOff) });
        break;
      case 'bridge':
        g.roundRect(x - 0.38, y - 0.3, 0.76, 0.56, 0.24).fill({ color: tint(on ? C.bridge : 0x6b6488) });
        break;
      case 'gyro':
        g.circle(x, y, 0.3).stroke({ width: 0.09, color: tint(on ? C.gyro : C.lightOff) });
        break;
      case 'stabilizer':
        g.poly([x, y - 0.32, x + 0.28, y, x, y + 0.32, x - 0.28, y]).fill({ color: tint(on ? C.stab : C.lightOff) });
        break;
      case 'thruster':
      case 'rcs': {
        const d = DIR_VEC[t.dir]!;
        const big = t.def.kind === 'thruster';
        const w0 = big ? 0.22 : 0.14;
        const w1 = big ? 0.42 : 0.26;
        const px = -d.y;
        const py = d.x;
        const b0 = big ? -0.1 : 0.05;
        g.poly([
          x + d.x * b0 + px * w0,
          y + d.y * b0 + py * w0,
          x + d.x * 0.5 + px * w1,
          y + d.y * 0.5 + py * w1,
          x + d.x * 0.5 - px * w1,
          y + d.y * 0.5 - py * w1,
          x + d.x * b0 - px * w0,
          y + d.y * b0 - py * w0,
        ]).fill({ color: tint(C.nozzle) });
        break;
      }
      case 'cannon':
        g.circle(x, y, 0.4).fill({ color: tint(dark) });
        g.circle(x, y, 0.28).fill({ color: tint(on ? C.cannon : 0x6b6488) });
        break;
      case 'laser':
        g.poly(octagon(x, y, 0.4)).fill({ color: tint(dark) });
        g.circle(x, y, 0.22).fill({ color: tint(on ? C.laser : 0x6b6488) });
        break;
      default:
        break;
    }
    // Status light on every powered consumer: the ship visibly "goes dark".
    if (t.def.power < 0 && t.def.kind !== 'bridge') {
      g.circle(x - 0.3, y - 0.3, 0.075).fill({ color: tint(on ? C.lightOn : C.lightOff) });
    }
  }

  private drawDyn(time: number, aim: { x: number; y: number } | null): void {
    const s = this.ship;
    const d = this.dyn;
    const gl = this.glow;
    d.clear();
    gl.clear();
    const team = TEAM[Math.max(0, s.origin)] ?? TEAM[0]!;
    const ang = s.body.getAngle();
    const pos = s.body.getPosition();

    for (const t of s.tiles.values()) {
      const k = t.def.kind;
      const x = t.x;
      const y = t.y;
      if ((k === 'thruster' || k === 'rcs') && t.throttle > 0.02) {
        const dv = DIR_VEC[t.dir]!;
        const big = k === 'thruster';
        const flick = 0.75 + 0.25 * Math.sin(time * 61 + x * 3 + y * 7);
        const L = (big ? 2.6 : 1.1) * t.throttle * flick;
        const w = big ? 0.34 : 0.18;
        const px = -dv.y;
        const py = dv.x;
        const bx = x + dv.x * 0.5;
        const by = y + dv.y * 0.5;
        gl.poly([bx + px * w, by + py * w, bx + dv.x * L, by + dv.y * L, bx - px * w, by - py * w]).fill({ color: C.flame, alpha: 0.75 });
        gl.poly([bx + px * w * 0.5, by + py * w * 0.5, bx + dv.x * L * 0.55, by + dv.y * L * 0.55, bx - px * w * 0.5, by - py * w * 0.5]).fill({
          color: C.flameHot,
          alpha: 0.9,
        });
      } else if (k === 'cannon' || k === 'laser') {
        const a = t.turret;
        const fx = Math.sin(a);
        const fy = -Math.cos(a);
        const len = k === 'cannon' ? 0.85 : 0.7;
        const recoil = k === 'cannon' ? Math.max(0, t.cooldown) * 1.6 : 0;
        d.moveTo(x, y).lineTo(x + fx * (len - recoil), y + fy * (len - recoil));
        d.stroke({ width: k === 'cannon' ? 0.2 : 0.16, color: t.powered ? 0x2b2340 : 0x4a4466, cap: 'round' });
        d.circle(x, y, 0.16).fill({ color: t.powered ? (k === 'cannon' ? C.cannon : C.laser) : 0x6b6488 });
        if (k === 'laser' && t.firing) gl.circle(x + fx * len, y + fy * len, 0.3).fill({ color: C.laser, alpha: 0.8 });
      } else if (k === 'reactor' && t.powered) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4 + x);
        gl.circle(x, y, 0.45 + pulse * 0.15).fill({ color: C.reactor, alpha: 0.25 + pulse * 0.15 });
      } else if (k === 'gyro' && t.powered) {
        const a = time * (4 + Math.abs(s.gyroOut) * 14) * (s.gyroOut < 0 ? -1 : 1);
        d.moveTo(x, y).lineTo(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3).stroke({ width: 0.08, color: C.gyro });
      } else if (k === 'bridge') {
        // Two little eyes that look where the ship is aiming.
        let lx = 0;
        let ly = -1;
        if (aim) {
          const dx = aim.x - pos.x;
          const dy = aim.y - pos.y;
          const c = Math.cos(-ang);
          const sn = Math.sin(-ang);
          const l = Math.hypot(dx, dy) || 1;
          lx = (dx * c - dy * sn) / l;
          ly = (dx * sn + dy * c) / l;
        }
        if (!t.powered || !s.controllable) {
          // Knocked out: little x-eyes.
          for (const ex of [-0.14, 0.14]) {
            d.moveTo(x + ex - 0.06, y - 0.06).lineTo(x + ex + 0.06, y + 0.06).moveTo(x + ex + 0.06, y - 0.06).lineTo(x + ex - 0.06, y + 0.06);
          }
          d.stroke({ width: 0.05, color: C.eye });
        } else {
          const closed = (time + s.id * 1.7) % 4.3 < 0.12;
          for (const ex of [-0.14, 0.14]) {
            const cx = x + ex + lx * 0.06;
            const cy = y - 0.02 + ly * 0.05;
            if (closed) d.moveTo(cx - 0.06, cy).lineTo(cx + 0.06, cy).stroke({ width: 0.04, color: C.eye });
            else d.circle(cx, cy, 0.075).fill({ color: C.eye });
          }
        }
      }
      if (t.heat > 0.03) {
        gl.roundRect(x - 0.5, y - 0.5, 1, 1, 0.25).fill({ color: C.heat, alpha: Math.min(0.85, t.heat) });
      }
    }
    // Faint team aura on controllable ships helps readability at low zoom.
    if (s.controllable && s.team >= 0) {
      const lc = s.body.getLocalCenter();
      gl.circle(lc.x, lc.y, 1.2).fill({ color: team.mid, alpha: 0.05 });
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

function octagon(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function dim(c: number, f: number): number {
  return mix(0x2a2540, c, f);
}
