import { clamp, damp, lerp, wrapAngle } from '../core/math';
import { cannonStats, CannonKind, CannonStats } from '../data/cannons';
import { deckHeight, hullWidth } from '../data/hull';
import { ABILITIES, AbilityId, ShipDef, ShipUpgrades, SlotDef, shipStats } from '../data/ships';
import type { Faction } from '../data/world';
import type { AiState } from './ai';
import { waveHeight } from './waves';

export interface Mount {
  slot: SlotDef;
  stats: CannonStats | null;
  /** Local position (m). */
  lx: number;
  lz: number;
  reload: number;
  /** Current barrel yaw relative to slot facing. */
  aim: number;
  /** Seconds since last shot (for recoil animation). */
  since: number;
}

export interface BoatInput {
  /** Desired world heading (radians). */
  heading: number;
  throttle: number;
}

export interface Wind {
  angle: number;
  strength: number;
}

let nextId = 1;

export class Boat {
  readonly id = nextId++;
  readonly def: ShipDef;
  faction: Faction;
  level = 1;
  name = '';
  bossId: string | null = null;
  ai: AiState | null = null;
  /** Player's preferred target (tap to focus). */
  focusId = 0;
  /** HUD bookkeeping: boss intro shown. */
  userSeen = false;

  x = 0; z = 0; vx = 0; vz = 0;
  yaw = 0; yawRate = 0;
  heave = 0; heaveV = 0;
  pitch = 0; pitchV = 0;
  roll = 0; rollV = 0;
  /** Extra list (roll) from water in the hull, signed toward the damaged side. */
  list = 0;

  hp: number;
  maxHp: number;
  maxSpeed: number;
  turnRate: number;
  hold: number;
  readonly length: number;
  readonly beam: number;
  readonly mass: number;
  readonly inertia: number;
  readonly deck: number;

  mounts: Mount[] = [];
  cargo = 0;
  input: BoatInput = { heading: 0, throttle: 0 };

  slowT = 0;
  abilityCd = 0;
  abilityT = 0;
  repairPool = 0;
  dead = false;
  sinkT = 0;
  lastHitBy = 0;
  lastHitT = -99;
  hurtT = 0;
  /** Wind efficiency at the current heading (for HUD). */
  windEff = 1;
  /** Last frame's lateral acceleration (for heel). */
  private latAcc = 0;

  constructor(def: ShipDef, faction: Faction, up: ShipUpgrades, guns: ({ kind: CannonKind; level: number } | null)[], hpMul = 1) {
    this.def = def;
    this.faction = faction;
    const st = shipStats(def, up);
    this.maxHp = this.hp = st.hp * hpMul;
    this.maxSpeed = st.speed;
    this.turnRate = st.turn;
    this.hold = st.hold;
    this.length = def.length;
    this.beam = def.beam;
    this.mass = def.mass;
    this.inertia = (def.mass * def.length * def.length) / 14;
    this.deck = deckHeight(def.length);
    this.setGuns(guns);
  }

  setGuns(guns: ({ kind: CannonKind; level: number } | null)[]) {
    this.mounts = this.def.slots.map((slot, i) => {
      const g = guns[i];
      return {
        slot,
        stats: g ? cannonStats(g.kind, g.level) : null,
        lx: slot.x * this.length,
        lz: slot.z * this.beam * 0.5 * hullWidth(slot.x + 0.5),
        reload: Math.random() * 0.8,
        aim: 0,
        since: 99,
      };
    });
  }

  get alive() { return !this.dead; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdX() { return Math.cos(this.yaw); }
  get fwdZ() { return Math.sin(this.yaw); }
  get invisible() { return this.def.ability === 'fog' && this.abilityT > 0; }
  get abilityActive() { return this.abilityT > 0; }
  get ability() { return ABILITIES[this.def.ability as AbilityId]; }

  /** Local (forward, starboard) → world. */
  toWorld(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.x + lx * c - lz * s, this.z + lx * s + lz * c];
  }

  /** World → local (forward, starboard). */
  toLocal(wx: number, wz: number): [number, number] {
    const dx = wx - this.x, dz = wz - this.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [dx * c + dz * s, -dx * s + dz * c];
  }

  /** Point-in-hull test in the plan view, with optional inflation. */
  containsLocal(lx: number, lz: number, pad = 0): boolean {
    const L = this.length;
    if (lx < -L / 2 - pad || lx > L / 2 + pad) return false;
    const w = (this.beam / 2) * hullWidth(clamp(lx / L + 0.5, 0, 1)) + pad;
    return Math.abs(lz) <= w;
  }

  /** Wind efficiency by point of sail: running, reaching, beating, in irons. */
  static sailEfficiency(heading: number, wind: Wind): number {
    // a = 0 when sailing straight downwind.
    const a = Math.abs(wrapAngle(heading - wind.angle));
    const deg = (a * 180) / Math.PI;
    const pts: [number, number][] = [[0, 0.95], [50, 1.12], [95, 1.05], [135, 0.78], [180, 0.55]];
    for (let i = 1; i < pts.length; i++) {
      if (deg <= pts[i][0]) {
        const [d0, v0] = pts[i - 1], [d1, v1] = pts[i];
        return lerp(v0, v1, (deg - d0) / (d1 - d0));
      }
    }
    return 0.55;
  }

  step(dt: number, t: number, wind: Wind) {
    if (this.dead) return this.stepSinking(dt, t);

    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.abilityT = Math.max(0, this.abilityT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    // Crews patch the hull once the shooting stops.
    if (this.faction === 'player' && t - this.lastHitT > 6 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
    }
    if (this.repairPool > 0) {
      const r = Math.min(this.repairPool, (this.maxHp * 0.35 * dt) / 6);
      this.repairPool -= r;
      this.hp = Math.min(this.maxHp, this.hp + r);
    }

    const ab = this.abilityT > 0 ? this.def.ability : null;
    const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;

    // --- Propulsion -----------------------------------------------------
    const sailEff = Boat.sailEfficiency(this.yaw, wind);
    const influence = ab === 'gust' ? 0 : this.def.windInfluence * wind.strength;
    this.windEff = 1 + (sailEff - 1) * influence;
    const hpFrac = this.hp / this.maxHp;
    const flood = hpFrac < 0.45 ? (0.45 - hpFrac) / 0.45 : 0;
    let vmax = this.maxSpeed * this.windEff * (1 - 0.35 * flood) * (this.slowT > 0 ? 0.6 : 1);
    if (ab === 'sprint') vmax *= 1.6;
    if (ab === 'gust') vmax *= 1.12;
    if (ab === 'ram') vmax *= 2.1;

    const throttle = clamp(this.input.throttle, 0, 1);
    let accel = this.def.accel;
    if (ab === 'ram' || ab === 'sprint') accel *= 3;
    // Thrust/drag balance gives terminal speed vmax * sqrt(throttle).
    const thrust = accel * throttle * (vmax / this.maxSpeed) ** 2;
    const drag = (accel * vF * Math.abs(vF)) / (this.maxSpeed * this.maxSpeed);
    vF += (thrust - drag) * dt;
    if (vF < -2) vF = -2;
    // Keel resists sideways motion strongly; that is what makes turns carve and drift.
    const vR0 = vR;
    vR *= 1 - damp(2.4, dt);
    // Some of the lateral momentum bleeds into forward motion (keel lift).
    vF += Math.abs(vR0 - vR) * 0.15;

    // --- Steering ---------------------------------------------------------
    const err = wrapAngle(this.input.heading - this.yaw);
    const rudder = throttle > 0.02 ? clamp(err * 2.2, -1, 1) : 0;
    const speedFrac = clamp(Math.abs(vF) / this.maxSpeed, 0, 1.3);
    let turn = this.turnRate * (0.3 + 0.7 * speedFrac);
    if (ab === 'gust') turn *= 1.5;
    if (this.def.oars > 0) turn *= 1.15;
    const targetYaw = rudder * turn;
    // Heavier ships answer the helm slower.
    const resp = 3.2 / Math.sqrt(this.mass / 8 + 0.6);
    this.yawRate += (targetYaw - this.yawRate) * damp(resp, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Centripetal acceleration for heel (lean out of the turn).
    const lat = vF * this.yawRate;
    this.latAcc += (lat - this.latAcc) * damp(4, dt);

    // --- Buoyancy ---------------------------------------------------------
    this.list += ((flood * 0.22 * Math.sign(this.list || 1)) - this.list) * damp(0.6, dt);
    this.buoyancy(dt, t, wind, -flood * 0.45);
  }

  private buoyancy(dt: number, t: number, wind: Wind, sink: number) {
    const L = this.length * 0.42, B = this.beam * 0.5;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const hBow = waveHeight(this.x + c * L, this.z + s * L, t);
    const hStern = waveHeight(this.x - c * L, this.z - s * L, t);
    const hStb = waveHeight(this.x - s * B, this.z + c * B, t);
    const hPort = waveHeight(this.x + s * B, this.z - c * B, t);
    const hMid = waveHeight(this.x, this.z, t);

    const heaveT = (hBow + hStern + hStb + hPort + hMid * 2) / 6 + sink;
    const pitchT = Math.atan2(hBow - hStern, 2 * L) * 0.9;
    // Heel: waves, out of the turn, and the wind pressing the sails to leeward.
    const windSide = Math.sin(wrapAngle(wind.angle - this.yaw));
    const sailHeel = this.def.windInfluence * wind.strength * windSide * 0.05;
    // Positive roll = starboard side down.
    const rollT = Math.atan2(hPort - hStb, 2 * B) * 0.75 - clamp(this.latAcc * 0.022, -0.2, 0.2) + sailHeel + this.list;

    // Small hulls bob quickly; big ones are slow and heavy.
    const f = 1.5 / Math.sqrt(this.length / 8);
    const k = (Math.PI * 2 * f) ** 2;
    const cdamp = 2 * 0.32 * Math.PI * 2 * f;
    this.heaveV += (k * (heaveT - this.heave) - cdamp * this.heaveV) * dt;
    this.pitchV += (k * (pitchT - this.pitch) - cdamp * this.pitchV) * dt;
    this.rollV += (k * 0.7 * (rollT - this.roll) - cdamp * 0.8 * this.rollV) * dt;
    this.heave += this.heaveV * dt;
    this.pitch += this.pitchV * dt;
    this.roll += this.rollV * dt;
  }

  private stepSinking(dt: number, t: number) {
    this.sinkT += dt;
    const k = Math.min(1, this.sinkT / 5);
    this.vx *= 1 - damp(0.8, dt);
    this.vz *= 1 - damp(0.8, dt);
    this.yawRate *= 1 - damp(1.5, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yaw += this.yawRate * dt;
    const side = this.list >= 0 ? 1 : -1;
    const h = waveHeight(this.x, this.z, t);
    this.roll += (side * 1.1 * k - this.roll) * damp(0.9, dt);
    this.pitch += (0.32 * k - this.pitch) * damp(0.6, dt);
    this.heave += (h - this.deck * 0.6 - 7 * k * k - this.heave) * damp(1.2, dt);
  }

  /** Apply an impulse at a world point (horizontal), plus a heel kick. */
  impulse(jx: number, jz: number, px: number, pz: number, heel = 0) {
    this.vx += jx / this.mass;
    this.vz += jz / this.mass;
    const rx = px - this.x, rz = pz - this.z;
    this.yawRate += (rx * jz - rz * jx) / this.inertia;
    // Lateral component of the push heels the hull.
    const lat = -jx * Math.sin(this.yaw) + jz * Math.cos(this.yaw);
    this.rollV += (lat / this.mass) * 0.35 + heel;
  }

  /** Fraction of hull integrity left. */
  get hpFrac() { return this.hp / this.maxHp; }
}
