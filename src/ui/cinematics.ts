import type { Game } from '../main';
import { DAY_TICKS } from '../config';
import { t } from './i18n';

/** Sim speed during the founding montage (weeks go by in seconds). */
export const MONTAGE_SPEED = 150;
/** How long the queen takes to come down. */
const LANDING_SECONDS = 5.6;

interface Flyer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  caste: string;
  t: number;
}

/**
 * The two scripted sequences of a new colony:
 *  - the landing: the nuptial swarm over the meadow, one young queen
 *    spiralling down to a spot of her own choosing (not the player's), the
 *    camera following her in until she touches down;
 *  - the founding montage: once she has sealed herself in, the weeks of
 *    claustral founding pass in a time-lapse with captions (eggs, larvae,
 *    pupae) until her first daughters open the door.
 * Either can be skipped (click, Space or Esc).
 */
export class Cinematics {
  private game: Game;
  /** Landing in progress: seconds since it began, where she comes down, where she started. */
  private landing: { t: number; x: number; x0: number; dir: number } | null = null;
  /** The swarm of other alates in the sky during the landing. */
  readonly swarm: Flyer[] = [];
  /** Founding montage running, and the last stage captioned. */
  montage = false;
  private stage = -1;
  /** Called with the title, subtitle and caption to show (the UI draws them). */
  onCaption: (title: string, sub: string, line: string) => void = () => {};
  onEnd: () => void = () => {};

  constructor(game: Game) {
    this.game = game;
  }

  get busy(): boolean {
    return this.landing !== null;
  }

  /** Start the landing at a random spot where a queen could dig. */
  startLanding(): void {
    const sim = this.game.sim;
    const w = sim.world;
    let x = Math.round(w.w / 2);
    for (let k = 0; k < 300; k++) {
      const c = Math.round(w.w * (0.12 + Math.random() * 0.76));
      if (sim.canFound(c)) {
        x = c;
        break;
      }
    }
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.landing = { t: 0, x, x0: x - dir * w.w * 0.45, dir };
    this.swarm.length = 0;
    for (let k = 0; k < 26; k++) {
      this.swarm.push({ x: Math.random() * w.w, y: -20 + Math.random() * 120, vx: (Math.random() - 0.5) * 0.9, vy: -0.05 - Math.random() * 0.2, caste: Math.random() < 0.3 ? 'gyne' : 'male', t: Math.random() * 100 });
    }
    const cam = this.game.cam;
    cam.follow = null;
    cam.fit();
    // Open on the meadow under the swarm, not on the whole slice of dark soil.
    cam.tzoom = Math.max(cam.fitZoom(), cam.screenH / (w.ground[x]! * 1.5));
    cam.zoom = cam.tzoom;
    cam.tx = this.landing.x0 + dir * w.w * 0.1;
    cam.ty = 0;
    cam.x = cam.tx;
    cam.y = cam.ty;
    cam.ease = 2.4;
    this.onCaption(t('cineFlightTitle'), t('cineFlightSub', { site: t(`site_${sim.site}`) }), '');
  }

  /** Jump to the end of whatever is running. */
  skip(): void {
    if (this.landing) {
      this.landing.t = 99;
      this.updateLanding(0);
    } else if (this.montage) {
      const sim = this.game.sim;
      // Run the weeks out in one go (a small colony is quick to simulate).
      for (let k = 0; k < DAY_TICKS * 14 && !sim.colony.hadWorkers && sim.phase !== 'failed'; k++) sim.step();
      this.updateMontage();
    }
  }

  update(dt: number): void {
    if (this.landing) this.updateLanding(dt);
    if (this.swarm.length) {
      const w = this.game.sim.world.w;
      let j = 0;
      for (const f of this.swarm) {
        f.t += dt * 30;
        f.x += (f.vx + Math.sin(f.t * 0.05 + f.x) * 0.25) * dt * 30;
        f.y += (f.vy + Math.sin(f.t * 0.08) * 0.1) * dt * 30;
        if (f.y > -60 && f.x > -60 && f.x < w + 60) this.swarm[j++] = f;
      }
      this.swarm.length = j;
    }
    if (this.montage) this.updateMontage();
  }

  /** Where the queen is in the air (for the painter), or null. */
  queenInFlight(): { x: number; y: number; face: number } | null {
    const L = this.landing;
    if (!L) return null;
    const p = Math.min(1, L.t / LANDING_SECONDS);
    const a = this.flightAt(L, p);
    const b = this.flightAt(L, Math.min(1, p + 0.01));
    return { x: a.x, y: a.y, face: b.x >= a.x ? 1 : -1 };
  }

  /** Down a long glide with a lazy S, then a short circle over the spot. */
  private flightAt(L: { x: number; x0: number }, p: number): { x: number; y: number } {
    const gy = this.game.sim.world.ground[L.x]! - 1;
    const e = 1 - Math.pow(1 - p, 2.2);
    return {
      x: L.x0 + (L.x - L.x0) * e + Math.sin(p * Math.PI * 3) * 40 * (1 - p),
      y: 20 + (gy - 20) * Math.pow(p, 1.6) - Math.sin(p * Math.PI) * 12,
    };
  }

  private updateLanding(dt: number): void {
    const L = this.landing!;
    const game = this.game;
    const sim = game.sim;
    const cam = game.cam;
    L.t += dt;
    const T = LANDING_SECONDS;
    const q = this.queenInFlight()!;
    // The camera finds her and closes in as she comes down.
    const p = Math.min(1, L.t / T);
    cam.follow = { x: q.x, y: q.y + 6 };
    // Framed on the meadow and the sky over it (the ground two thirds down the screen),
    // not on the dark soil she has not yet come to; closing in as she comes down.
    const gy = sim.world.ground[L.x]!;
    const z0 = Math.max(cam.fitZoom(), cam.screenH / (gy * 1.5));
    cam.tzoom = Math.max(cam.minZoom, z0 * (1 + p * p * 2.6));
    if (L.t >= T) {
      this.landing = null;
      cam.ease = 12;
      sim.found(L.x);
      cam.follow = null;
      cam.tx = L.x;
      cam.ty = sim.world.ground[L.x]! + 6;
      cam.tzoom = Math.min(cam.maxZoom, 9);
      if (L.t > 50) {
        // Skipped: be there at once.
        cam.x = cam.tx;
        cam.y = cam.ty;
        cam.zoom = cam.tzoom;
      }
      this.onCaption(t('cineLandedTitle'), t('cineLandedSub'), '');
      this.onEnd();
    }
  }

  /** Start the time-lapse of claustral founding (she has just sealed herself in). */
  startMontage(): void {
    if (this.montage || this.game.sim.colony.hadWorkers) return;
    this.montage = true;
    this.stage = -1;
    this.updateMontage();
  }

  private updateMontage(): void {
    const game = this.game;
    const sim = game.sim;
    const col = sim.colony;
    const cam = game.cam;
    const q = col.queen;
    if (q?.alive && !game.director.active) {
      cam.follow = { x: q.x, y: q.y - 2 };
      cam.tzoom = Math.min(cam.maxZoom, 11);
    }
    let stage = 0;
    for (const b of col.brood) stage = Math.max(stage, b.stage + 1);
    if (col.hadWorkers || sim.phase === 'failed') stage = 4;
    if (stage !== this.stage) {
      this.stage = stage;
      const keys = ['cineM0', 'cineM1', 'cineM2', 'cineM3', 'cineM4'];
      this.onCaption('', '', t(keys[stage]!, { queen: sim.names.queen }));
    }
    if (stage === 4) {
      this.montage = false;
      cam.follow = null;
      this.onEnd();
    }
  }
}
