import * as THREE from 'three';
import type { CannonKind } from '../data/cannons';
import { deckHeight, hullWidth } from '../data/hull';
import type { ShipDef, SlotDef } from '../data/ships';
import type { Faction } from '../data/world';
import { colored, flatMat, merge, TriBuilder } from './geom';

export interface Palette {
  hull: string;
  hullDark: string;
  trim: string;
  stripe: string;
  deck: string;
  sail: string;
  sailOpacity: number;
  flag: 'skull' | 'navy' | 'merchant' | 'ghost';
  lantern: string;
}

export const PALETTES: Record<Faction | 'boss', Palette> = {
  player: { hull: '#7a4a2b', hullDark: '#4b2c1a', trim: '#e5b53b', stripe: '#2f63b5', deck: '#c79a62', sail: '#f3ecd9', sailOpacity: 1, flag: 'skull', lantern: '#ffd27a' },
  pirate: { hull: '#5a3521', hullDark: '#2e1c12', trim: '#3a2416', stripe: '#9b2a24', deck: '#a77a4b', sail: '#d0493a', sailOpacity: 1, flag: 'skull', lantern: '#ffb26b' },
  navy: { hull: '#3b4250', hullDark: '#22262e', trim: '#e9c64e', stripe: '#e9c64e', deck: '#b9915e', sail: '#ffffff', sailOpacity: 1, flag: 'navy', lantern: '#ffe7a8' },
  merchant: { hull: '#9a6b3e', hullDark: '#5c3f24', trim: '#d9c79a', stripe: '#3f8a52', deck: '#d0aa72', sail: '#eadcb5', sailOpacity: 1, flag: 'merchant', lantern: '#ffe0a0' },
  ghost: { hull: '#2f3d3a', hullDark: '#18201f', trim: '#5fd6a8', stripe: '#5fd6a8', deck: '#4d5a55', sail: '#a9c9bd', sailOpacity: 0.62, flag: 'ghost', lantern: '#7dffc8' },
  boss: { hull: '#3a1f17', hullDark: '#1c0f0b', trim: '#f2c14e', stripe: '#f2c14e', deck: '#8a6440', sail: '#1f1f22', sailOpacity: 1, flag: 'skull', lantern: '#ff8a4a' },
};

const flagCache = new Map<string, THREE.Texture>();
function flagTexture(kind: Palette['flag']): THREE.Texture {
  const hit = flagCache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 80;
  const g = c.getContext('2d')!;
  if (kind === 'skull' || kind === 'ghost') {
    g.fillStyle = kind === 'ghost' ? '#26302d' : '#111';
    g.fillRect(0, 0, 128, 80);
    const fg = kind === 'ghost' ? '#8fffd0' : '#f1ead6';
    g.strokeStyle = fg; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(38, 22); g.lineTo(90, 66); g.moveTo(90, 22); g.lineTo(38, 66); g.stroke();
    g.fillStyle = fg;
    g.beginPath(); g.arc(64, 34, 17, 0, Math.PI * 2); g.fill();
    g.fillRect(55, 42, 18, 12);
    g.fillStyle = kind === 'ghost' ? '#26302d' : '#111';
    g.beginPath(); g.arc(57, 33, 4.5, 0, Math.PI * 2); g.arc(71, 33, 4.5, 0, Math.PI * 2); g.fill();
  } else if (kind === 'navy') {
    g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#fff'; g.fillRect(0, 30, 128, 20); g.fillRect(44, 0, 20, 80);
    g.fillStyle = '#c8282d'; g.fillRect(0, 35, 128, 10); g.fillRect(49, 0, 10, 80);
  } else {
    g.fillStyle = '#2f8a4f'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#f2d36b'; g.fillRect(0, 26, 128, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  flagCache.set(kind, t);
  return t;
}

function hullGeometry(def: ShipDef, pal: Palette): THREE.BufferGeometry {
  const L = def.length, B = def.beam;
  const d = deckHeight(L);
  const draft = d * 0.75;
  const S = 16;
  const tb = new TriBuilder();
  const sheer = (t: number) => d + d * 0.28 * (Math.pow(1 - t, 3) * 1.1 + Math.pow(t, 4) * 0.9);
  // Profile from rail down to keel: [z factor, y], with a colour for the band below each point.
  const profile = (t: number): [number, number][] => {
    const s = sheer(t);
    return [
      [0.94, s + 0.45],
      [1.0, s],
      [1.0, s * 0.74],
      [0.995, s * 0.46],
      [0.97, 0],
      [0.74, -draft * 0.55],
      [0.0, -draft],
    ];
  };
  const bands = [pal.trim, pal.hull, pal.stripe, pal.hull, pal.hullDark, pal.hullDark];
  const station = (s: number) => {
    const t = s / S;
    const x = (t - 0.5) * L;
    const w = (B / 2) * hullWidth(t);
    return { x, w, p: profile(t), t };
  };
  for (let s = 0; s < S; s++) {
    const a = station(s), b = station(s + 1);
    for (const side of [1, -1]) {
      for (let k = 0; k < bands.length; k++) {
        const p0 = [a.x, a.p[k][1], side * a.w * a.p[k][0]];
        const p1 = [b.x, b.p[k][1], side * b.w * b.p[k][0]];
        const p2 = [b.x, b.p[k + 1][1], side * b.w * b.p[k + 1][0]];
        const p3 = [a.x, a.p[k + 1][1], side * a.w * a.p[k + 1][0]];
        tb.quad(p0, p1, p2, p3, bands[k], k === 1 || k === 3 ? 0.04 : 0);
      }
      // Inner bulwark and rail cap.
      const ia = [a.x, sheer(a.t), side * a.w * 0.88], ib = [b.x, sheer(b.t), side * b.w * 0.88];
      const ta = [a.x, a.p[0][1], side * a.w * 0.88], tbp = [b.x, b.p[0][1], side * b.w * 0.88];
      tb.quad(ia, ib, tbp, ta, pal.hullDark);
      tb.quad(ta, tbp, [b.x, b.p[0][1], side * b.w * b.p[0][0]], [a.x, a.p[0][1], side * a.w * a.p[0][0]], pal.trim);
    }
    // Deck planks.
    const dc = s % 2 ? pal.deck : new THREE.Color(pal.deck).offsetHSL(0, 0, -0.04).getStyle();
    tb.quad([a.x, sheer(a.t), -a.w * 0.88], [b.x, sheer(b.t), -b.w * 0.88], [b.x, sheer(b.t), b.w * 0.88], [a.x, sheer(a.t), a.w * 0.88], dc);
  }
  // Transom.
  const st = station(0);
  const pts = st.p;
  const cx = st.x, cy = pts[0][1] * 0.5;
  for (let k = 0; k < pts.length - 1; k++) {
    for (const side of [1, -1]) {
      tb.tri([cx, cy, 0], [cx, pts[k][1], side * st.w * pts[k][0]], [cx, pts[k + 1][1], side * st.w * pts[k + 1][0]], k < 4 ? pal.hull : pal.hullDark);
    }
  }
  tb.tri([cx, pts[0][1], st.w * pts[0][0]], [cx, pts[0][1], -st.w * pts[0][0]], [cx, cy, 0], pal.hull);
  return tb.geometry();
}

function sailGeometry(w: number, h: number, kind: 'square' | 'fore' | 'lateen'): THREE.BufferGeometry {
  if (kind === 'square') {
    // Plane lies in XY by default; stand it across the beam (YZ plane) and bulge forward.
    const g = new THREE.PlaneGeometry(w, h, 6, 4);
    g.rotateY(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getZ(i) / (w / 2), v = p.getY(i) / (h / 2);
      p.setX(i, (1 - u * u) * (1 - 0.5 * v * v) * w * 0.16);
      p.setY(i, p.getY(i) * (1 - 0.06 * u * u));
    }
    g.computeVertexNormals();
    return g;
  }
  // Fore-and-aft: triangle/trapezoid in the keel plane, bulging to starboard.
  const g = new THREE.BufferGeometry();
  const top = kind === 'lateen' ? 0.15 : 0.55;
  const verts: number[] = [];
  const R = 4, C = 4;
  const at = (i: number, j: number) => {
    const v = i / R, u = j / C;
    const width = w * (1 - v * (1 - top));
    const x = -u * width + (kind === 'lateen' ? v * w * 0.35 : 0);
    const y = v * h;
    const z = Math.sin(u * Math.PI) * Math.sin(Math.max(0.15, 1 - v) * Math.PI * 0.5) * w * 0.14;
    return [x, y, z];
  };
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
      const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), dd = at(i + 1, j);
      verts.push(...a, ...b, ...c, ...a, ...c, ...dd);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export function cannonGeometry(kind: CannonKind | null, scale: number): THREE.BufferGeometry {
  const s = scale;
  const parts: THREE.BufferGeometry[] = [];
  const wood = '#6b4325', iron = '#2b2b30', brass = '#d4a43c';
  if (kind === 'havan') {
    parts.push(colored(new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 0.4 * s, 8), wood, [0, 0.2 * s, 0]));
    parts.push(colored(new THREE.CylinderGeometry(0.42 * s, 0.55 * s, 1.0 * s, 8), iron, [0.25 * s, 0.75 * s, 0], [0, 0, -0.75]));
    return merge(parts);
  }
  if (kind === 'zipkin') {
    parts.push(colored(new THREE.BoxGeometry(0.6 * s, 0.4 * s, 0.6 * s), wood, [0, 0.2 * s, 0]));
    parts.push(colored(new THREE.BoxGeometry(0.15 * s, 0.15 * s, 1.6 * s), wood, [0.2 * s, 0.55 * s, 0]));
    parts.push(colored(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 1.8 * s, 5), '#ccb27a', [0.75 * s, 0.6 * s, 0], [0, 0, Math.PI / 2]));
    parts.push(colored(new THREE.ConeGeometry(0.16 * s, 0.4 * s, 5), brass, [1.75 * s, 0.6 * s, 0], [0, 0, -Math.PI / 2]));
    return merge(parts);
  }
  const len = kind === 'uzun' ? 2.0 : kind === 'karronat' ? 0.95 : 1.4;
  const rad = kind === 'karronat' ? 0.3 : kind === 'uzun' ? 0.16 : 0.2;
  const col = kind === 'zincir' ? '#6f7680' : kind === 'uzun' ? '#3b4654' : iron;
  parts.push(colored(new THREE.BoxGeometry(0.85 * s, 0.38 * s, 0.6 * s), wood, [-0.1 * s, 0.19 * s, 0]));
  parts.push(colored(new THREE.CylinderGeometry(rad * 0.8 * s, rad * s, len * s, 8), col, [len * 0.35 * s, 0.5 * s, 0], [0, 0, -Math.PI / 2]));
  parts.push(colored(new THREE.CylinderGeometry(rad * 1.05 * s, rad * 1.05 * s, 0.12 * s, 8), brass, [len * 0.82 * s, 0.5 * s, 0], [0, 0, -Math.PI / 2]));
  return merge(parts);
}

export interface ShipView {
  root: THREE.Group;
  hull: THREE.Group;
  guns: THREE.Group[];
  sails: THREE.Mesh[];
  oars: THREE.Group[];
  flag: THREE.Mesh;
  lantern: THREE.Mesh;
  setGuns(kinds: (CannonKind | null)[]): void;
  dispose(): void;
}

const gunGeoCache = new Map<string, THREE.BufferGeometry>();
function gunGeo(kind: CannonKind | null, scale: number) {
  const k = `${kind}:${scale.toFixed(2)}`;
  let g = gunGeoCache.get(k);
  if (!g) { g = cannonGeometry(kind, scale); gunGeoCache.set(k, g); }
  return g;
}

export function buildShip(def: ShipDef, pal: Palette, opts: { silhouette?: boolean } = {}): ShipView {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const L = def.length, B = def.beam;
  const d = deckHeight(L);
  const sheerAt = (t: number) => d + d * 0.28 * (Math.pow(1 - t, 3) * 1.1 + Math.pow(t, 4) * 0.9);
  const mat = opts.silhouette ? new THREE.MeshLambertMaterial({ color: '#1e2328', flatShading: true }) : flatMat;

  const parts: THREE.BufferGeometry[] = [hullGeometry(def, pal)];
  // Stern castle.
  if (def.castle > 0) {
    const cl = L * def.castle;
    const cw = B * 0.78;
    const ch = 0.9 + L * 0.03;
    const x0 = -L / 2 + cl / 2;
    parts.push(colored(new THREE.BoxGeometry(cl, ch, cw), pal.hull, [x0, sheerAt(0.05) + ch / 2 - 0.1, 0]));
    parts.push(colored(new THREE.BoxGeometry(cl * 1.04, 0.18, cw * 1.04), pal.trim, [x0, sheerAt(0.05) + ch, 0]));
    // Windows on the transom.
    for (let i = -1; i <= 1; i++) {
      parts.push(colored(new THREE.BoxGeometry(0.1, 0.35, 0.5), pal.lantern, [-L / 2 - 0.02, sheerAt(0) + ch * 0.45, i * cw * 0.3]));
    }
    // Rudder.
    parts.push(colored(new THREE.BoxGeometry(0.5, d * 1.4, 0.18), pal.hullDark, [-L / 2 - 0.2, d * 0.1, 0]));
  }
  // Bowsprit.
  if (def.tier >= 2) {
    const len = L * 0.28;
    parts.push(colored(new THREE.CylinderGeometry(0.1, 0.16, len, 6), '#5a3b22', [L / 2 + len * 0.3, sheerAt(1) + 0.4 + len * 0.15, 0], [0, 0, -Math.PI / 2 + 0.35]));
  }
  // Ram.
  if (def.ramMul > 1.5) {
    parts.push(colored(new THREE.ConeGeometry(0.45, 3, 6), '#b08a3e', [L / 2 + 0.9, 0.3, 0], [0, 0, -Math.PI / 2]));
  }
  // Deck clutter: hatch and barrels.
  if (L > 10) {
    parts.push(colored(new THREE.BoxGeometry(L * 0.1, 0.3, B * 0.3), '#7d5634', [L * 0.05, sheerAt(0.55) + 0.15, 0]));
    parts.push(colored(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 7), '#8a5a33', [L * 0.32, sheerAt(0.8) + 0.35, B * 0.18]));
  }
  // Masts and yards.
  const sails: THREE.Mesh[] = [];
  let tallest = 0, tallX = 0;
  const sailMat = opts.silhouette
    ? mat
    : new THREE.MeshLambertMaterial({ color: pal.sail, side: THREE.DoubleSide, transparent: pal.sailOpacity < 1, opacity: pal.sailOpacity, flatShading: true });
  for (const m of def.masts) {
    const mx = m.x * L;
    const base = sheerAt(m.x + 0.5);
    parts.push(colored(new THREE.CylinderGeometry(0.12 + L * 0.004, 0.2 + L * 0.007, m.h, 6), '#6a4526', [mx, base + m.h / 2, 0]));
    if (m.h > tallest) { tallest = m.h; tallX = mx; }
    const sw = B * 1.55 * m.w;
    if (m.sail === 'square') {
      // Two stacked square sails on big masts.
      const tiers = m.h > 14 ? 2 : 1;
      for (let i = 0; i < tiers; i++) {
        const sh = (m.h * 0.62) / tiers;
        const y = base + m.h * 0.28 + sh * (i + 0.5) + i * 0.4;
        const w = sw * (1 - i * 0.18);
        const sail = new THREE.Mesh(sailGeometry(w, sh, 'square'), sailMat);
        sail.position.set(mx + 0.25, y, 0);
        hull.add(sail);
        sails.push(sail);
        parts.push(colored(new THREE.CylinderGeometry(0.08, 0.08, w * 1.08, 5), '#5a3b22', [mx + 0.2, y + sh / 2, 0], [Math.PI / 2, 0, 0]));
      }
    } else {
      const sh = m.h * (m.sail === 'lateen' ? 0.9 : 0.7);
      const sail = new THREE.Mesh(sailGeometry(L * 0.3 * m.w, sh, m.sail), sailMat);
      sail.position.set(mx - 0.1, base + m.h * 0.14, 0);
      hull.add(sail);
      sails.push(sail);
      parts.push(colored(new THREE.CylinderGeometry(0.07, 0.07, L * 0.32 * m.w, 5), '#5a3b22', [mx - L * 0.15 * m.w, base + m.h * 0.16, 0], [0, 0, Math.PI / 2]));
    }
  }
  // Crow's nest.
  if (tallest > 12) parts.push(colored(new THREE.CylinderGeometry(0.75, 0.55, 0.5, 8), '#6a4526', [tallX, sheerAt(tallX / L + 0.5) + tallest * 0.8, 0]));

  const body = new THREE.Mesh(merge(parts), mat);
  hull.add(body);

  // Flag at the masthead.
  const flagMat = opts.silhouette ? mat : new THREE.MeshLambertMaterial({ map: flagTexture(pal.flag), side: THREE.DoubleSide });
  const fs = 1 + L * 0.05;
  const flagGeo = new THREE.PlaneGeometry(1.6 * fs, 1.0 * fs, 4, 1);
  flagGeo.translate(-0.8 * fs, 0, 0);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(tallX, sheerAt(tallX / L + 0.5) + tallest + 0.2, 0);
  hull.add(flag);

  // Stern lantern.
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), new THREE.MeshBasicMaterial({ color: pal.lantern }));
  lantern.position.set(-L / 2 + 0.3, sheerAt(0) + (def.castle ? 0.9 + L * 0.03 : 0) + 0.6, 0);
  hull.add(lantern);

  // Oars.
  const oars: THREE.Group[] = [];
  if (def.oars > 0) {
    const oarGeo = colored(new THREE.BoxGeometry(0.12, 0.12, B * 0.95), '#8a6038', [0, 0, B * 0.47]);
    for (let i = 0; i < def.oars; i++) {
      for (const side of [1, -1]) {
        const g = new THREE.Group();
        const x = (-0.3 + (0.6 * i) / (def.oars - 1)) * L;
        g.position.set(x, sheerAt(x / L + 0.5) - 0.2, side * (B / 2) * hullWidth(x / L + 0.5) * 0.95);
        const o = new THREE.Mesh(oarGeo, mat);
        o.rotation.x = side > 0 ? 0.35 : Math.PI - 0.35;
        g.add(o);
        g.userData.side = side;
        g.userData.phase = i * 0.15;
        hull.add(g);
        oars.push(g);
      }
    }
  }

  // Guns.
  const scale = 0.75 + L * 0.012;
  const guns: THREE.Group[] = def.slots.map((slot: SlotDef) => {
    const g = new THREE.Group();
    const x = slot.x * L;
    const t = slot.x + 0.5;
    g.position.set(x, sheerAt(t) - (slot.turret ? 0 : 0.05), slot.z * (B / 2) * hullWidth(t) * (slot.turret ? 1 : 0.86));
    g.rotation.y = -slot.face;
    g.userData.face = slot.face;
    hull.add(g);
    return g;
  });

  const view: ShipView = {
    root, hull, guns, sails, oars, flag, lantern,
    setGuns(kinds) {
      guns.forEach((g, i) => {
        g.clear();
        const k = kinds[i];
        if (k === undefined || k === null) return;
        const m = new THREE.Mesh(gunGeo(k, scale), mat);
        g.add(m);
      });
    },
    dispose() {
      body.geometry.dispose();
      for (const s of sails) s.geometry.dispose();
      flagGeo.dispose();
    },
  };
  return view;
}

/** Per-frame animation: sail billow, flag flutter, oar strokes, gun recoil. */
export function animateShip(v: ShipView, t: number, speedFrac: number, windSide: number, guns?: { aim: number; since: number }[]) {
  const billow = 0.45 + 0.75 * Math.min(1, speedFrac);
  for (const s of v.sails) {
    if (s.geometry.type === 'PlaneGeometry') s.scale.x = billow;
    else s.scale.z = billow * (windSide >= 0 ? 1 : -1);
  }
  v.flag.rotation.y = Math.sin(t * 6) * 0.25 + 0.2;
  v.flag.scale.y = 1 + Math.sin(t * 9) * 0.05;
  for (const o of v.oars) {
    const ph = t * (2 + speedFrac * 4) + o.userData.phase;
    o.rotation.y = Math.sin(ph) * 0.45 * o.userData.side;
    o.rotation.z = Math.cos(ph) * 0.12;
  }
  if (guns) {
    v.guns.forEach((g, i) => {
      const m = guns[i];
      if (!m) return;
      g.rotation.y = -(g.userData.face + m.aim);
      const child = g.children[0];
      if (child) child.position.x = m.since < 0.35 ? -0.5 * (1 - m.since / 0.35) : 0;
    });
  }
}
