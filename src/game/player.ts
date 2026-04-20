import { Container, Graphics } from 'pixi.js';
import type { AABB } from './collision';
import {
  LANE_COUNT,
  LANE_X_CENTERS,
  PLAYER_ACCENT,
  PLAYER_COLOR,
  PLAYER_HEIGHT,
  PLAYER_HITBOX_INSET,
  PLAYER_LANE_LERP_MS,
  PLAYER_START_LANE,
  PLAYER_WIDTH,
  PLAYER_Y,
  THRUSTER_COLOR_INNER,
  THRUSTER_COLOR_OUTER,
  THRUSTER_LENGTH,
  THRUSTER_PULSE_AMOUNT,
  THRUSTER_PULSE_SPEED,
  THRUSTER_WIDTH,
} from '../config/tuning';

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export class Player extends Container {
  private body: Graphics;
  private thruster: Graphics;
  private laneIndex: number = PLAYER_START_LANE;
  private targetLaneIndex: number = PLAYER_START_LANE;
  private lerpStartX: number;
  private lerpStartMs = 0;
  private lerpActive = false;
  private pulseT = 0;

  constructor() {
    super();

    this.thruster = new Graphics();
    this.addChild(this.thruster);

    this.body = new Graphics();
    this.addChild(this.body);
    this.drawBody();

    const startX = LANE_X_CENTERS[PLAYER_START_LANE] ?? LANE_X_CENTERS[0]!;
    this.x = startX;
    this.y = PLAYER_Y;
    this.lerpStartX = startX;
  }

  private drawThruster(scale: number): void {
    const g = this.thruster;
    g.clear();
    const baseY = PLAYER_HEIGHT / 2;
    const len = THRUSTER_LENGTH * scale;
    const halfW = THRUSTER_WIDTH / 2;

    g.moveTo(-halfW, baseY);
    g.lineTo(halfW, baseY);
    g.lineTo(halfW * 0.35, baseY + len);
    g.lineTo(-halfW * 0.35, baseY + len);
    g.closePath();
    g.fill({ color: THRUSTER_COLOR_OUTER, alpha: 0.55 });

    g.moveTo(-halfW * 0.55, baseY);
    g.lineTo(halfW * 0.55, baseY);
    g.lineTo(halfW * 0.15, baseY + len * 0.82);
    g.lineTo(-halfW * 0.15, baseY + len * 0.82);
    g.closePath();
    g.fill({ color: THRUSTER_COLOR_INNER, alpha: 0.9 });
  }

  private drawBody(): void {
    const g = this.body;
    const w = PLAYER_WIDTH;
    const h = PLAYER_HEIGHT;
    g.clear();
    g.roundRect(-w / 2, -h / 2, w, h, 8)
      .fill({ color: 0x0a0612 })
      .stroke({ color: PLAYER_COLOR, width: 2.5, alignment: 0.5 });
    g.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h / 2 - 10, 5).fill({
      color: PLAYER_COLOR,
      alpha: 0.35,
    });
    g.rect(-w / 2 + 4, -h / 2 + 4, 8, 5).fill({ color: PLAYER_ACCENT });
    g.rect(w / 2 - 12, -h / 2 + 4, 8, 5).fill({ color: PLAYER_ACCENT });
    g.rect(-w / 2 + 6, h / 2 - 8, w - 12, 3).fill({ color: PLAYER_ACCENT });
    g.rect(-3, -h / 2 + 18, 6, h - 30).fill({ color: PLAYER_COLOR, alpha: 0.8 });
  }

  moveLeft(): void {
    this.setTargetLane(this.targetLaneIndex - 1);
  }

  moveRight(): void {
    this.setTargetLane(this.targetLaneIndex + 1);
  }

  private setTargetLane(next: number): void {
    const clamped = Math.max(0, Math.min(LANE_COUNT - 1, next));
    if (clamped === this.targetLaneIndex) return;
    this.lerpStartX = this.x;
    this.lerpStartMs = performance.now();
    this.targetLaneIndex = clamped;
    this.lerpActive = true;
  }

  update(nowMs: number, dtSec: number): void {
    this.pulseT += dtSec * THRUSTER_PULSE_SPEED;
    const pulse = 1 + Math.sin(this.pulseT) * THRUSTER_PULSE_AMOUNT;
    this.drawThruster(pulse);

    if (!this.lerpActive) return;
    const targetX = LANE_X_CENTERS[this.targetLaneIndex]!;
    const t = (nowMs - this.lerpStartMs) / PLAYER_LANE_LERP_MS;
    if (t >= 1) {
      this.x = targetX;
      this.laneIndex = this.targetLaneIndex;
      this.lerpActive = false;
      return;
    }
    const eased = smoothstep(t);
    this.x = this.lerpStartX + (targetX - this.lerpStartX) * eased;
  }

  getBounds2D(): AABB {
    return {
      x: this.x - PLAYER_WIDTH / 2 + PLAYER_HITBOX_INSET,
      y: this.y - PLAYER_HEIGHT / 2 + PLAYER_HITBOX_INSET,
      w: PLAYER_WIDTH - PLAYER_HITBOX_INSET * 2,
      h: PLAYER_HEIGHT - PLAYER_HITBOX_INSET * 2,
    };
  }

  getLane(): number {
    return this.laneIndex;
  }

  reset(): void {
    const startX = LANE_X_CENTERS[PLAYER_START_LANE]!;
    this.x = startX;
    this.y = PLAYER_Y;
    this.laneIndex = PLAYER_START_LANE;
    this.targetLaneIndex = PLAYER_START_LANE;
    this.lerpStartX = startX;
    this.lerpActive = false;
  }
}
