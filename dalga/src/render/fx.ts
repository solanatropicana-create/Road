import * as THREE from 'three';
import { waveHeight } from '../sim/waves';

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vN;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const frag = /* glsl */ `
uniform vec3 uSun;
uniform float uLit;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vN;
void main() {
  float l = mix(1.0, 0.62 + 0.45 * max(dot(normalize(vN), uSun), 0.0), uLit);
  gl_FragColor = vec4(vColor * l, vAlpha);
  #include <colorspace_fragment>
}
`;

interface Opts {
  max: number;
  geo: THREE.BufferGeometry;
  additive?: boolean;
  lit?: boolean;
  /** Falling pieces settle and float when they reach the surface. */
  floatOnHit?: boolean;
}

/** Instanced particles with per-instance colour and fade. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly max: number;
  private readonly floatOnHit: boolean;
  private p: Float32Array; // x y z vx vy vz life maxLife s0 s1 grav drag a0 rot spin float
  private col: Float32Array;
  private alpha: Float32Array;
  private colAttr: THREE.InstancedBufferAttribute;
  private alphaAttr: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  static readonly STRIDE = 16;

  constructor(o: Opts) {
    this.max = o.max;
    this.floatOnHit = !!o.floatOnHit;
    this.p = new Float32Array(o.max * Particles.STRIDE);
    this.col = new Float32Array(o.max * 3);
    this.alpha = new Float32Array(o.max);
    const geo = o.geo.clone();
    this.colAttr = new THREE.InstancedBufferAttribute(this.col, 3);
    this.alphaAttr = new THREE.InstancedBufferAttribute(this.alpha, 1);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uSun: { value: new THREE.Vector3(-0.4, 0.85, 0.35).normalize() }, uLit: { value: o.lit === false ? 0 : 1 } },
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, o.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number,
    color: THREE.Color, alpha = 1, grav = 0, drag = 0, floatOnWater = 0,
  ) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const b = i * Particles.STRIDE;
    const p = this.p;
    p[b] = x; p[b + 1] = y; p[b + 2] = z;
    p[b + 3] = vx; p[b + 4] = vy; p[b + 5] = vz;
    p[b + 6] = 0; p[b + 7] = life; p[b + 8] = s0; p[b + 9] = s1;
    p[b + 10] = grav; p[b + 11] = drag; p[b + 12] = alpha;
    p[b + 13] = Math.random() * 6.28; p[b + 14] = (Math.random() - 0.5) * 4; p[b + 15] = floatOnWater;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }

  update(dt: number, t: number) {
    const p = this.p;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const b = i * Particles.STRIDE;
      p[b + 6] += dt;
      if (p[b + 6] >= p[b + 7]) continue;
      // Compact live particles to the front.
      if (w !== i) {
        const wb = w * Particles.STRIDE;
        for (let k = 0; k < Particles.STRIDE; k++) p[wb + k] = p[b + k];
        this.col[w * 3] = this.col[i * 3]; this.col[w * 3 + 1] = this.col[i * 3 + 1]; this.col[w * 3 + 2] = this.col[i * 3 + 2];
      }
      const o = w * Particles.STRIDE;
      const drag = 1 - Math.min(1, p[o + 11] * dt);
      p[o + 3] *= drag; p[o + 5] *= drag;
      p[o + 4] = p[o + 4] * drag - p[o + 10] * dt;
      p[o] += p[o + 3] * dt;
      p[o + 1] += p[o + 4] * dt;
      p[o + 2] += p[o + 5] * dt;
      if (p[o + 15] > 0) p[o + 1] = waveHeight(p[o], p[o + 2], t) + p[o + 15];
      else if (this.floatOnHit && p[o + 4] < 0 && p[o + 1] < waveHeight(p[o], p[o + 2], t)) {
        p[o + 15] = 0.05; p[o + 3] *= 0.2; p[o + 5] *= 0.2; p[o + 10] = 0; p[o + 11] = 0.8;
        p[o + 7] = Math.max(p[o + 7], p[o + 6] + 5);
      }
      p[o + 13] += p[o + 14] * dt;
      const k = p[o + 6] / p[o + 7];
      const sc = p[o + 8] + (p[o + 9] - p[o + 8]) * Math.sqrt(k);
      const a = p[o + 12] * (1 - k * k);
      this.alpha[w] = a;
      this.e.set(p[o + 15] > 0 ? 0 : p[o + 13], p[o + 13], 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, sc);
      this.v.set(p[o], p[o + 1], p[o + 2]);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(w, this.m);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}

const C = (hex: string) => new THREE.Color(hex);
const WHITE = C('#ffffff');
const SMOKE = C('#f2f2f0');
const DARK = C('#3a3a3c');
const FIRE = C('#ff8a2a');
const FIRE2 = C('#ffd257');
const WOOD = C('#7a4f2c');
const WOOD2 = C('#9c6b3e');
const GOLD = C('#ffd34d');

export class Fx {
  readonly group = new THREE.Group();
  smoke: Particles;
  spray: Particles;
  foam: Particles;
  fire: Particles;
  debris: Particles;
  trail: Particles;
  sparkle: Particles;
  private tmp = new THREE.Color();

  constructor() {
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const drop = new THREE.IcosahedronGeometry(1, 0);
    const disc = new THREE.CircleGeometry(1, 10);
    disc.rotateX(-Math.PI / 2);
    const plank = new THREE.BoxGeometry(1.6, 0.25, 0.45);
    this.smoke = new Particles({ max: 900, geo: puff });
    this.spray = new Particles({ max: 900, geo: drop });
    this.foam = new Particles({ max: 1800, geo: disc, lit: false });
    this.fire = new Particles({ max: 500, geo: drop, additive: true, lit: false });
    this.debris = new Particles({ max: 400, geo: plank, floatOnHit: true });
    this.trail = new Particles({ max: 700, geo: drop, lit: false });
    this.sparkle = new Particles({ max: 200, geo: drop, additive: true, lit: false });
    this.foam.mesh.renderOrder = 1;
    for (const p of [this.foam, this.debris, this.smoke, this.spray, this.trail, this.fire, this.sparkle]) this.group.add(p.mesh);
  }

  update(dt: number, t: number) {
    this.smoke.update(dt, t);
    this.spray.update(dt, t);
    this.foam.update(dt, t);
    this.fire.update(dt, t);
    this.debris.update(dt, t);
    this.trail.update(dt, t);
    this.sparkle.update(dt, t);
  }

  muzzle(x: number, y: number, z: number, angle: number, big: boolean) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const n = big ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 5;
      this.smoke.spawn(x + ca * i * 0.5, y, z + sa * i * 0.5, ca * sp + (Math.random() - 0.5) * 2, 0.8 + Math.random(), sa * sp + (Math.random() - 0.5) * 2,
        1.2 + Math.random() * 0.8, 0.6, (big ? 3 : 2.2) + Math.random(), SMOKE, 0.85, -0.6, 1.2);
    }
    for (let i = 0; i < 4; i++) {
      this.fire.spawn(x, y, z, ca * (6 + Math.random() * 8), Math.random() * 2, sa * (6 + Math.random() * 8), 0.12, 0.7, 0.2, i % 2 ? FIRE : FIRE2, 1, 0, 2);
    }
  }

  splash(x: number, y: number, z: number, big = false) {
    const n = big ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * (big ? 4 : 2);
      this.spray.spawn(x + Math.cos(a) * r * 0.3, y, z + Math.sin(a) * r * 0.3, Math.cos(a) * r, (big ? 9 : 6) + Math.random() * 6, Math.sin(a) * r,
        0.7 + Math.random() * 0.5, 0.25 + Math.random() * 0.2, 0.1, WHITE, 0.95, 20, 0.3);
    }
    this.foam.spawn(x, y, z, 0, 0, 0, 1.6, 0.8, big ? 5 : 3, WHITE, 0.8, 0, 0, 0.05);
  }

  hit(x: number, y: number, z: number, big: boolean) {
    for (let i = 0; i < (big ? 10 : 6); i++) {
      const a = Math.random() * Math.PI * 2;
      this.debris.spawn(x, y, z, Math.cos(a) * (3 + Math.random() * 4), 4 + Math.random() * 5, Math.sin(a) * (3 + Math.random() * 4),
        2.5 + Math.random() * 2, 0.6 + Math.random() * 0.4, 0.5, Math.random() < 0.5 ? WOOD : WOOD2, 1, 18, 0.5);
    }
    for (let i = 0; i < 5; i++) {
      this.smoke.spawn(x, y, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.9, 0.5, 2, DARK, 0.7, -1, 1);
      this.fire.spawn(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.25, 1.1, 0.3, FIRE, 1, 0, 1);
    }
  }

  explode(x: number, y: number, z: number, r: number) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r * 1.4;
      this.fire.spawn(x, y + 0.5, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.45 + Math.random() * 0.3, 1.6, 0.4, i % 3 ? FIRE : FIRE2, 1, 2, 2);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r * 0.6;
      this.smoke.spawn(x, y + 1, z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 2 + Math.random(), 1.5, 4.5, DARK, 0.8, -0.5, 1);
    }
    this.splash(x, y, z, true);
    this.foam.spawn(x, y, z, 0, 0, 0, 2.5, 2, r * 1.2, WHITE, 0.7, 0, 0, 0.05);
  }

  /** Wake behind a hull and a bow wave. */
  wake(x: number, z: number, yaw: number, beam: number, len: number, speed: number, t: number) {
    if (speed < 1.5) return;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const rx = -fz, rz = fx;
    const k = Math.min(1, speed / 14);
    // Stern wash
    const sx = x - fx * len * 0.5, sz = z - fz * len * 0.5;
    const jitter = (Math.random() - 0.5) * beam * 0.6;
    this.foam.spawn(sx + rx * jitter, 0, sz + rz * jitter, -fx * 1.5, 0, -fz * 1.5, 1.3 + k * 1.2, beam * 0.3, beam * (0.55 + k * 0.4), WHITE, 0.3 + 0.3 * k, 0, 0.3, 0.06);
    // Bow wave peeling off both sides
    const bx = x + fx * len * 0.42, bz = z + fz * len * 0.42;
    for (const s of [1, -1]) {
      this.foam.spawn(bx + rx * s * beam * 0.4, 0, bz + rz * s * beam * 0.4, rx * s * 3 * k, 0, rz * s * 3 * k, 0.9 + k * 0.8, beam * 0.12, beam * 0.35, WHITE, 0.45 * k + 0.1, 0, 0.6, 0.06);
    }
    if (speed > 9 && Math.random() < 0.4) {
      this.spray.spawn(bx, 0.6 + waveHeight(bx, bz, t), bz, rx * (Math.random() - 0.5) * 6, 3 + Math.random() * 3, rz * (Math.random() - 0.5) * 6, 0.5, 0.25, 0.1, WHITE, 0.9, 18, 0.2);
    }
  }

  ballTrail(x: number, y: number, z: number) {
    this.trail.spawn(x, y, z, 0, 0.2, 0, 0.35, 0.22, 0.05, SMOKE, 0.7, 0, 0);
  }

  damageSmoke(x: number, y: number, z: number, heavy: boolean) {
    this.smoke.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5), 2.5, (Math.random() - 0.5), 2.4, 0.5, 2.8, heavy ? DARK : this.tmp.set('#8a8a8a'), 0.65, -0.3, 0.3);
    if (heavy) this.fire.spawn(x, y, z, 0, 2, 0, 0.5, 0.7, 0.2, Math.random() < 0.5 ? FIRE : FIRE2, 1, -1, 0.5);
  }

  sinkBubbles(x: number, z: number, r: number, t: number) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    this.foam.spawn(x + Math.cos(a) * d, 0, z + Math.sin(a) * d, 0, 0, 0, 1.6, 0.4, 1.8, WHITE, 0.8, 0, 0, 0.06);
    if (Math.random() < 0.3) this.spray.spawn(x + Math.cos(a) * d, waveHeight(x, z, t), z + Math.sin(a) * d, 0, 3, 0, 0.5, 0.3, 0.1, WHITE, 0.8, 10, 0);
  }

  coinBurst(x: number, y: number, z: number) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparkle.spawn(x, y, z, Math.cos(a) * 3, 5 + Math.random() * 3, Math.sin(a) * 3, 0.6, 0.35, 0.1, GOLD, 1, 14, 0);
    }
  }

  ramBurst(x: number, y: number, z: number, power: number) {
    const n = Math.min(14, Math.round(power));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.debris.spawn(x, y + 1, z, Math.cos(a) * 5, 5 + Math.random() * 5, Math.sin(a) * 5, 3, 0.8, 0.6, Math.random() < 0.5 ? WOOD : WOOD2, 1, 18, 0.4);
    }
    this.splash(x, y, z, true);
  }
}
