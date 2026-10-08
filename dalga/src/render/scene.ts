import * as THREE from 'three';
import { damp, lerp, smoothstep, wrapAngle } from '../core/math';
import type { CannonKind } from '../data/cannons';
import type { ShipDef } from '../data/ships';
import { WORLD, type PortDef, type ZoneDef } from '../data/world';
import type { Mystery } from '../game/spawner';
import type { Boat } from '../sim/boat';
import { waveHeight } from '../sim/waves';
import type { Sim, SimEvent } from '../sim/world';
import { colored, flatMat, merge } from './geom';
import { Fx } from './fx';
import { buildIsland } from './islands';
import { animateShip, buildShip, PALETTES, type ShipView } from './shipModel';
import { Water } from './water';

interface BoatVis {
  view: ShipView;
  smokeT: number;
  ghosted: boolean;
  gunKey: string;
}

const ghostMat = new THREE.MeshLambertMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.28, depthWrite: false });

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 1600);
  readonly water = new Water();
  readonly fx = new Fx();
  private hemi = new THREE.HemisphereLight('#dff3ff', '#5a7a5a', 1.5);
  private sun = new THREE.DirectionalLight('#fff4dc', 2.1);
  private islandMeshes = new Map<number, THREE.Mesh>();
  private boats = new Map<number, BoatVis>();
  private lootMeshes = new Map<number, THREE.Object3D>();
  private mineMeshes = new Map<number, THREE.Object3D>();
  private mysteryMeshes = new Map<number, THREE.Object3D>();
  private ropes: THREE.Mesh[] = [];
  private balls: THREE.InstancedMesh;
  private lootGeo: Record<string, THREE.BufferGeometry>;
  private gemMat = new THREE.MeshLambertMaterial({ color: '#ff5fd2', emissive: '#a0187a', flatShading: true });
  private ringMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.5, depthWrite: false });
  private beamMat = new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  private ringGeo = new THREE.RingGeometry(1.2, 1.6, 20).rotateX(-Math.PI / 2);
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private shake = 0;
  camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 80, 140);
  private zoom = 120;
  private pending: number[] = [];
  private zoneCol = { deep: new THREE.Color(), shallow: new THREE.Color(), fog: new THREE.Color(), sky: new THREE.Color() };
  harborView: ShipView | null = null;
  private harborYaw = 0;
  harborSpin = 0;
  private harborPort: PortDef | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog('#9fd8ef', 220, 480);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(-40, 90, 35);
    this.scene.add(this.water.mesh);
    this.scene.add(this.fx.group);

    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#1c1c20' }), 800);
    this.balls.frustumCulled = false;
    this.balls.count = 0;
    this.scene.add(this.balls);

    this.lootGeo = {
      gold: merge([
        colored(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 9), '#8a5a30', [0, 0, 0]),
        colored(new THREE.CylinderGeometry(0.8, 0.8, 0.14, 9), '#3d3d40', [0, 0.35, 0]),
        colored(new THREE.CylinderGeometry(0.8, 0.8, 0.14, 9), '#3d3d40', [0, -0.35, 0]),
        colored(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 9), '#ffcc33', [0, 0.68, 0]),
        colored(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), '#ffe27a', [0.2, 0.8, 0.1], [0.3, 0, 0.2]),
      ]),
      crate: merge([
        colored(new THREE.BoxGeometry(1.6, 1.1, 1.1), '#b0773f'),
        colored(new THREE.BoxGeometry(1.64, 0.16, 1.14), '#4a4a4f', [0, 0.3, 0]),
        colored(new THREE.BoxGeometry(1.64, 0.16, 1.14), '#4a4a4f', [0, -0.3, 0]),
        colored(new THREE.BoxGeometry(0.3, 0.3, 0.1), '#ffcc33', [0, 0, 0.58]),
      ]),
      gem: new THREE.OctahedronGeometry(0.75, 0),
      mine: merge([
        colored(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 9), '#a33a2a'),
        colored(new THREE.CylinderGeometry(0.75, 0.75, 0.14, 9), '#2d2d30', [0, 0.35, 0]),
        colored(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4), '#d9c79a', [0, 0.85, 0]),
      ]),
    };
    for (let i = 0; i < 6; i++) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#c9a66b' }));
      rope.visible = false;
      this.ropes.push(rope);
      this.scene.add(rope);
    }
    this.buildPortMarkers();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(high: boolean) {
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.75) : 1);
  }

  private buildPortMarkers() {
    const parts: THREE.BufferGeometry[] = [];
    for (const p of WORLD.ports) {
      for (let i = 0; i < 10; i++) {
        const a = p.angle + (i / 10) * Math.PI * 2;
        const x = p.x + Math.cos(a) * 46, z = p.z + Math.sin(a) * 46;
        if (WORLD.islands[p.islandId] && Math.hypot(x - WORLD.islands[p.islandId].x, z - WORLD.islands[p.islandId].z) < WORLD.islands[p.islandId].r * 1.05) continue;
        parts.push(colored(new THREE.CylinderGeometry(0.5, 0.8, 1.6, 7), i % 2 ? '#e8463a' : '#f4f1ea', [x, 0.3, z]));
        parts.push(colored(new THREE.ConeGeometry(0.4, 0.8, 7), '#e8463a', [x, 1.5, z]));
      }
    }
    const m = new THREE.Mesh(merge(parts), flatMat);
    this.scene.add(m);
  }

  // ------------------------------------------------------------------ islands
  private updateIslands(cx: number, cz: number) {
    for (const isl of WORLD.islands) {
      const d = Math.hypot(isl.x - cx, isl.z - cz) - isl.r;
      const has = this.islandMeshes.has(isl.id);
      if (d < 620 && !has && !this.pending.includes(isl.id)) this.pending.push(isl.id);
      else if (d > 900 && has) {
        const m = this.islandMeshes.get(isl.id)!;
        this.scene.remove(m);
        m.geometry.dispose();
        this.islandMeshes.delete(isl.id);
      }
    }
    // Build nearest first, a couple per frame.
    this.pending.sort((a, b) => {
      const A = WORLD.islands[a], B = WORLD.islands[b];
      return Math.hypot(A.x - cx, A.z - cz) - Math.hypot(B.x - cx, B.z - cz);
    });
    for (let i = 0; i < 2 && this.pending.length; i++) {
      const id = this.pending.shift()!;
      if (this.islandMeshes.has(id)) continue;
      const m = buildIsland(WORLD.islands[id]);
      this.islandMeshes.set(id, m);
      this.scene.add(m);
    }
  }

  /** Builds every island near a point synchronously (on load / teleport). */
  warmIslands(cx: number, cz: number) {
    this.updateIslands(cx, cz);
    while (this.pending.length) this.updateIslands(cx, cz);
  }

  // ------------------------------------------------------------------ zones
  private applyZone(x: number, z: number) {
    const r = Math.hypot(x, z);
    const zs = WORLD.zones;
    let i = 0;
    for (let k = zs.length - 1; k >= 0; k--) if (r >= zs[k].r0) { i = k; break; }
    const a = zs[i];
    const next: ZoneDef | undefined = zs[i + 1];
    const prev: ZoneDef | undefined = zs[i - 1];
    let other = a, k = 0;
    if (next && r > a.r1 - 120) { other = next; k = smoothstep(a.r1 - 120, a.r1 + 120, r) * 0.5; }
    else if (prev && r < a.r0 + 120) { other = prev; k = (1 - smoothstep(a.r0 - 120, a.r0 + 120, r)) * 0.5; }
    const zc = this.zoneCol;
    zc.deep.set(a.deep).lerp(new THREE.Color(other.deep), k);
    zc.shallow.set(a.shallow).lerp(new THREE.Color(other.shallow), k);
    zc.fog.set(a.fog).lerp(new THREE.Color(other.fog), k);
    zc.sky.set(a.sky).lerp(new THREE.Color(other.sky), k);
    const u = this.water.uniforms;
    (u.uDeep.value as THREE.Color).copy(zc.deep);
    (u.uShallow.value as THREE.Color).copy(zc.shallow);
    (u.uFog.value as THREE.Color).copy(zc.fog);
    (u.uSky.value as THREE.Color).copy(zc.sky).lerp(new THREE.Color('#ffffff'), 0.3);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(zc.fog);
    this.scene.background = zc.fog;
    const gloom = (a.theme === 'storm' || a.theme === 'dead' ? 1 - k : k) * (a.theme === 'storm' || a.theme === 'dead' || other.theme === 'storm' || other.theme === 'dead' ? 1 : 0);
    const near = this.zoom * (1.3 - gloom * 0.35), far = this.zoom * (2.5 - gloom * 0.8);
    fog.near = near; fog.far = far;
    u.uFogNear.value = near; u.uFogFar.value = far;
    this.sun.intensity = 2.1 - gloom * 0.9;
    this.hemi.intensity = 1.5 - gloom * 0.4;
  }

  // ------------------------------------------------------------------ boats
  private visFor(b: Boat): BoatVis {
    let v = this.boats.get(b.id);
    if (!v) {
      const pal = PALETTES[b.bossId ? 'boss' : b.faction];
      const view = buildShip(b.def, pal);
      this.scene.add(view.root);
      v = { view, smokeT: 0, ghosted: false, gunKey: '' };
      this.boats.set(b.id, v);
    }
    const key = b.mounts.map((m) => (m.stats ? m.stats.kind : '-')).join(',');
    if (key !== v.gunKey) {
      v.view.setGuns(b.mounts.map((m) => m.stats?.kind ?? null));
      v.gunKey = key;
    }
    return v;
  }

  private setGhost(v: BoatVis, on: boolean) {
    if (v.ghosted === on) return;
    v.ghosted = on;
    v.view.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (on) { m.userData.mat = m.material; m.material = ghostMat; }
      else if (m.userData.mat) m.material = m.userData.mat;
    });
  }

  private syncBoats(sim: Sim, dt: number) {
    const seen = new Set<number>();
    for (const b of sim.boats) {
      seen.add(b.id);
      const v = this.visFor(b);
      const r = v.view.root;
      r.visible = !this.harborView || b !== sim.player;
      r.position.set(b.x, b.heave, b.z);
      r.rotation.set(b.roll, -b.yaw, b.pitch, 'YZX');
      this.setGhost(v, b.invisible);
      const sp = b.speed;
      const windSide = Math.sin(wrapAngle(sim.wind.angle - b.yaw));
      animateShip(v.view, sim.t + b.id, sp / b.maxSpeed, windSide, b.mounts);
      if (!b.dead) {
        this.fx.wake(b.x, b.z, b.yaw, b.beam, b.length, sp, sim.t);
        // Damaged hulls smoke and burn.
        if (b.hpFrac < 0.5) {
          v.smokeT -= dt;
          if (v.smokeT <= 0) {
            v.smokeT = b.hpFrac < 0.25 ? 0.08 : 0.2;
            const [x, z] = b.toWorld((Math.random() - 0.5) * b.length * 0.6, (Math.random() - 0.5) * b.beam * 0.5);
            this.fx.damageSmoke(x, b.heave + b.deck + 0.5, z, b.hpFrac < 0.25);
          }
        }
      } else if (b.sinkT < 6 && Math.random() < 0.6) {
        this.fx.sinkBubbles(b.x, b.z, b.length * 0.5, sim.t);
      }
    }
    for (const [id, v] of this.boats) {
      if (!seen.has(id)) {
        this.scene.remove(v.view.root);
        v.view.dispose();
        this.boats.delete(id);
      }
    }
  }

  // ------------------------------------------------------------------ misc objects
  private syncShots(sim: Sim) {
    let i = 0;
    for (const s of sim.shots) {
      if (i >= 800) break;
      this.m4.makeScale(s.r * 1.3, s.r * 1.3, s.r * 1.3).setPosition(s.x, s.y, s.z);
      this.balls.setMatrixAt(i++, this.m4);
      if (Math.random() < 0.7) this.fx.ballTrail(s.x, s.y, s.z);
    }
    this.balls.count = i;
    this.balls.instanceMatrix.needsUpdate = true;
  }

  private syncLoot(sim: Sim) {
    const seen = new Set<number>();
    for (const l of sim.loot) {
      seen.add(l.id);
      let o = this.lootMeshes.get(l.id);
      if (!o) {
        o = new THREE.Group();
        const body = new THREE.Mesh(this.lootGeo[l.kind], l.kind === 'gem' ? this.gemMat : flatMat);
        body.name = 'body';
        o.add(body);
        const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring.name = 'ring';
        o.add(ring);
        if (l.kind !== 'gold') o.scale.setScalar(1.3);
        this.scene.add(o);
        this.lootMeshes.set(l.id, o);
      }
      const h = waveHeight(l.x, l.z, sim.t);
      o.position.set(l.x, h + (l.kind === 'gem' ? 0.9 + Math.sin(sim.t * 3 + l.phase) * 0.25 : 0.2), l.z);
      const body = o.getObjectByName('body')!;
      body.rotation.set(Math.sin(sim.t * 1.3 + l.phase) * 0.25, sim.t * (l.kind === 'gem' ? 2 : 0.4) + l.phase, Math.cos(sim.t * 1.1 + l.phase) * 0.25);
      const ring = o.getObjectByName('ring')!;
      ring.position.y = -0.35 - (l.kind === 'gem' ? 0.9 : 0.2) + 0.4;
      ring.scale.setScalar(1 + 0.25 * Math.sin(sim.t * 4 + l.phase));
    }
    for (const [id, o] of this.lootMeshes) {
      if (!seen.has(id)) { this.scene.remove(o); this.lootMeshes.delete(id); }
    }
    const mseen = new Set<number>();
    for (const m of sim.mines) {
      mseen.add(m.id);
      let o = this.mineMeshes.get(m.id);
      if (!o) {
        o = new THREE.Mesh(this.lootGeo.mine, flatMat);
        this.scene.add(o);
        this.mineMeshes.set(m.id, o);
      }
      o.position.set(m.x, waveHeight(m.x, m.z, sim.t) + 0.1, m.z);
      o.rotation.set(Math.sin(sim.t * 2 + m.id) * 0.2, m.id, Math.cos(sim.t * 2 + m.id) * 0.2);
    }
    for (const [id, o] of this.mineMeshes) {
      if (!mseen.has(id)) { this.scene.remove(o); this.mineMeshes.delete(id); }
    }
  }

  private syncTethers(sim: Sim) {
    this.ropes.forEach((r, i) => {
      const t = sim.tethers[i];
      if (!t) { r.visible = false; return; }
      r.visible = true;
      const ax = t.a.x, az = t.a.z, ay = t.a.heave + t.a.deck + 0.8;
      const bx = t.b.x, bz = t.b.z, by = t.b.heave + t.b.deck + 0.8;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      r.position.set(ax, ay, az);
      this.v3.set(bx - ax, by - ay, bz - az).normalize();
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.v3);
      r.scale.set(1, len, 1);
    });
  }

  private syncMysteries(list: Mystery[], t: number) {
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      let o = this.mysteryMeshes.get(m.id);
      if (!o) {
        const parts = [
          colored(new THREE.BoxGeometry(4, 0.4, 1.2), '#7a5030', [0, 0, 0], [0, 0.4, 0]),
          colored(new THREE.BoxGeometry(3, 0.4, 1), '#8c5d35', [1.5, 0, 1.6], [0, -0.6, 0.1]),
          colored(new THREE.CylinderGeometry(0.2, 0.25, 4, 6), '#5a3b22', [-0.8, 1.2, -0.6], [0.5, 0, 0.6]),
          colored(new THREE.BoxGeometry(1.4, 1, 1), '#b0773f', [0.4, 0.5, -0.2], [0.1, 0.5, 0]),
        ];
        o = new THREE.Group();
        o.add(new THREE.Mesh(merge(parts), flatMat));
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 60, 10, 1, true).translate(0, 30, 0), this.beamMat);
        beam.name = 'beam';
        o.add(beam);
        this.scene.add(o);
        this.mysteryMeshes.set(m.id, o);
      }
      o.position.set(m.x, waveHeight(m.x, m.z, t), m.z);
      o.rotation.set(Math.sin(t + m.id) * 0.05, m.id, Math.cos(t * 0.8) * 0.05);
      const beam = o.getObjectByName('beam')!;
      beam.scale.set(1 + 0.1 * Math.sin(t * 3), 1, 1 + 0.1 * Math.sin(t * 3));
    }
    for (const [id, o] of this.mysteryMeshes) {
      if (!seen.has(id)) { this.scene.remove(o); this.mysteryMeshes.delete(id); }
    }
  }

  handleEvents(sim: Sim, events: SimEvent[]) {
    const p = sim.player;
    for (const e of events) {
      switch (e.type) {
        case 'fire': {
          const b = sim.boatById(e.boat);
          this.fx.muzzle(e.x, e.y, e.z, e.angle, e.kind === 'havan' || e.kind === 'karronat');
          if (b && b === p) this.shake = Math.max(this.shake, 0.15);
          break;
        }
        case 'hit': {
          this.fx.hit(e.x, e.y, e.z, e.crit);
          if (p && e.boat === p.id) this.shake = Math.max(this.shake, e.crit ? 0.9 : 0.45);
          break;
        }
        case 'splash':
          this.fx.splash(e.x, waveHeight(e.x, e.z, sim.t), e.z);
          break;
        case 'explode':
          this.fx.explode(e.x, e.y, e.z, e.r);
          if (p && Math.hypot(p.x - e.x, p.z - e.z) < 30) this.shake = Math.max(this.shake, 0.8);
          break;
        case 'ram':
          this.fx.ramBurst(e.x, waveHeight(e.x, e.z, sim.t), e.z, e.power);
          if (p && (e.a === p.id || e.b === p.id)) this.shake = Math.max(this.shake, Math.min(1.5, e.power * 0.12));
          break;
        case 'ground':
          this.fx.splash(e.x, 0.3, e.z, true);
          if (p && e.boat === p.id) this.shake = Math.max(this.shake, 0.6);
          break;
        case 'sink': {
          const b = sim.boatById(e.boat);
          if (b) {
            for (let i = 0; i < 4; i++) {
              const [x, z] = b.toWorld((Math.random() - 0.5) * b.length, (Math.random() - 0.5) * b.beam);
              this.fx.explode(x, b.heave + b.deck, z, 5);
              this.fx.hit(x, b.heave + b.deck, z, true);
            }
          }
          break;
        }
        case 'pickup':
          this.fx.coinBurst(e.x, 1.5, e.z);
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ frame
  update(sim: Sim, dt: number, mysteries: Mystery[]) {
    const p = sim.player;
    if (this.harborView && this.harborPort) {
      this.updateHarborCam(dt, sim.t);
    } else if (p) {
      this.followCam(p, dt);
    }
    const cx = this.camTarget.x, cz = this.camTarget.z;
    this.updateIslands(cx, cz);
    this.applyZone(cx, cz);
    this.water.update(sim.t, cx, cz);
    this.syncBoats(sim, dt);
    this.syncShots(sim);
    this.syncLoot(sim);
    this.syncTethers(sim);
    this.syncMysteries(mysteries, sim.t);
    this.fx.update(dt, sim.t);
    if (this.harborView) {
      const hv = this.harborView.root;
      const port = this.harborPort!;
      const [hx, hz] = this.harborPos(port);
      const h = waveHeight(hx, hz, sim.t);
      hv.position.set(hx, h * 0.6 - 0.1, hz);
      hv.rotation.set(Math.sin(sim.t * 1.1) * 0.03, -this.harborYaw, Math.sin(sim.t * 0.8) * 0.02, 'YZX');
      animateShip(this.harborView, sim.t, 0.25, 1);
    }
    this.sun.position.set(cx - 40, 90, cz + 35);
    this.sun.target.position.set(cx, 0, cz);
    this.renderer.render(this.scene, this.camera);
  }

  private followCam(p: Boat, dt: number) {
    const cam = this.camera;
    const portrait = cam.aspect < 1;
    const fov = portrait ? 50 : 40;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // Metres of sea visible across the short side of the screen.
    const span = (40 + p.length * 1.6) * (1 + Math.min(0.2, p.speed / 80));
    const half = (fov * Math.PI) / 360;
    const t = portrait ? Math.tan(half) * cam.aspect : Math.tan(half);
    const want = span / 2 / t;
    this.zoom += (want - this.zoom) * damp(1.5, dt);
    const look = Math.min(span * 0.12, p.speed * 0.8);
    const sp = Math.max(0.01, p.speed);
    const tx = p.x + (p.vx / sp) * look, tz = p.z + (p.vz / sp) * look;
    this.camTarget.x += (tx - this.camTarget.x) * damp(3, dt);
    this.camTarget.z += (tz - this.camTarget.z) * damp(3, dt);
    this.camTarget.y = 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake * 0.03 * this.zoom;
    const pitch = 1.08; // ~62° down
    this.camPos.set(
      this.camTarget.x + (Math.random() - 0.5) * sh,
      Math.sin(pitch) * this.zoom + (Math.random() - 0.5) * sh,
      this.camTarget.z + Math.cos(pitch) * this.zoom + (Math.random() - 0.5) * sh,
    );
    cam.position.copy(this.camPos);
    cam.lookAt(this.camTarget.x, 0, this.camTarget.z);
  }

  /** Snaps the follow camera onto a point (after respawn / leaving port). */
  snapTo(x: number, z: number) {
    this.camTarget.set(x, 0, z);
    this.warmIslands(x, z);
  }

  // ------------------------------------------------------------------ harbour
  private harborPos(port: PortDef): [number, number] {
    const out = 9;
    return [port.x + Math.cos(port.angle) * out, port.z + Math.sin(port.angle) * out];
  }

  enterHarbor(port: PortDef, def: ShipDef, locked: boolean, guns: (CannonKind | null)[]) {
    this.harborPort = port;
    if (this.harborView) {
      this.scene.remove(this.harborView.root);
      this.harborView.dispose();
    }
    const view = buildShip(def, PALETTES.player, { silhouette: locked });
    if (!locked) view.setGuns(guns);
    this.scene.add(view.root);
    this.harborView = view;
    this.harborYaw = port.angle + Math.PI / 2;
    this.harborLen = def.length;
    this.warmIslands(port.x, port.z);
  }

  leaveHarbor() {
    if (this.harborView) {
      this.scene.remove(this.harborView.root);
      this.harborView.dispose();
    }
    this.harborView = null;
    this.harborPort = null;
  }

  private updateHarborCam(dt: number, t: number) {
    const port = this.harborPort!;
    const [hx, hz] = this.harborPos(port);
    const L = this.harborLen;
    const cam = this.camera;
    if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); }
    // Fit the whole hull (plus a margin) across the screen width.
    const tanH = Math.tan((45 * Math.PI) / 360) * Math.min(cam.aspect, 1.6);
    const dist = Math.max(16, (L * 1.35 + 6) / 2 / tanH);
    const a = port.angle + this.harborSpin + Math.sin(t * 0.15) * 0.08;
    const want = new THREE.Vector3(hx + Math.cos(a) * dist, dist * 0.36 + 3, hz + Math.sin(a) * dist);
    this.camPos.lerp(want, damp(3, dt));
    this.camTarget.lerp(new THREE.Vector3(hx, L * 0.18 + 1.5, hz), damp(4, dt));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camTarget);
    this.zoom = lerp(this.zoom, dist, damp(2, dt));
  }

  harborLen = 10;

  /** Screen position (CSS px) of a ship-local point on the harbour preview. */
  harborPoint(lx: number, ly: number, lz: number, w: number, h: number): [number, number] {
    if (!this.harborView) return [0, 0];
    this.v3.set(lx, ly, lz);
    this.harborView.hull.localToWorld(this.v3);
    this.v3.project(this.camera);
    return [(this.v3.x * 0.5 + 0.5) * w, (-this.v3.y * 0.5 + 0.5) * h];
  }

  project(x: number, y: number, z: number, w: number, h: number): [number, number, boolean] {
    this.v3.set(x, y, z).project(this.camera);
    const on = this.v3.z < 1 && Math.abs(this.v3.x) <= 1 && Math.abs(this.v3.y) <= 1;
    return [(this.v3.x * 0.5 + 0.5) * w, (-this.v3.y * 0.5 + 0.5) * h, on];
  }
}
