import { Container, Graphics } from 'pixi.js';
import type { AABB } from './collision';
import {
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_X_CENTERS,
  TRAFFIC_COLORS,
  TRAFFIC_HEIGHT,
  TRAFFIC_HITBOX_INSET,
  TRAFFIC_MIN_LANE_GAP_PX,
  TRAFFIC_OFFSCREEN_MARGIN,
  TRAFFIC_POOL_SIZE,
  TRAFFIC_RELATIVE_SPEED,
  TRAFFIC_SPAWN_MAX_MS,
  TRAFFIC_SPAWN_MIN_MS,
  TRAFFIC_WIDTH,
} from '../config/tuning';

interface TrafficCar {
  sprite: Graphics;
  active: boolean;
  lane: number;
  y: number;
}

export class TrafficManager {
  readonly container: Container;
  private pool: TrafficCar[] = [];
  private msUntilNextSpawn = 0;
  private laneHeadY: number[] = new Array(LANE_COUNT).fill(Infinity);

  constructor() {
    this.container = new Container();
    for (let i = 0; i < TRAFFIC_POOL_SIZE; i++) {
      const sprite = this.makeCarSprite(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]!);
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({ sprite, active: false, lane: 0, y: 0 });
    }
    this.msUntilNextSpawn = this.randSpawnDelay();
  }

  private makeCarSprite(color: number): Graphics {
    const g = new Graphics();
    const w = TRAFFIC_WIDTH;
    const h = TRAFFIC_HEIGHT;
    g.roundRect(-w / 2, -h / 2, w, h, 7)
      .fill({ color: 0x0a0612 })
      .stroke({ color, width: 2.5, alignment: 0.5 });
    g.roundRect(-w / 2 + 6, -h / 2 + h / 2 - 4, w - 12, h / 2 - 10, 4).fill({
      color,
      alpha: 0.3,
    });
    g.rect(-w / 2 + 4, h / 2 - 9, 8, 5).fill({ color });
    g.rect(w / 2 - 12, h / 2 - 9, 8, 5).fill({ color });
    g.rect(-w / 2 + 6, -h / 2 + 5, w - 12, 3).fill({ color, alpha: 0.9 });
    return g;
  }

  private randSpawnDelay(): number {
    return (
      TRAFFIC_SPAWN_MIN_MS +
      Math.random() * (TRAFFIC_SPAWN_MAX_MS - TRAFFIC_SPAWN_MIN_MS)
    );
  }

  private pickSpawnLane(): number | null {
    const candidates: number[] = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const headY = this.laneHeadY[lane] ?? Infinity;
      if (headY > TRAFFIC_MIN_LANE_GAP_PX) candidates.push(lane);
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  private activate(lane: number): void {
    const car = this.pool.find((c) => !c.active);
    if (!car) return;
    car.active = true;
    car.lane = lane;
    car.y = -TRAFFIC_HEIGHT / 2;
    car.sprite.visible = true;
    car.sprite.x = LANE_X_CENTERS[lane]!;
    car.sprite.y = car.y;
  }

  update(dtSec: number): void {
    const move = TRAFFIC_RELATIVE_SPEED * dtSec;
    const offscreen = CANVAS_HEIGHT + TRAFFIC_OFFSCREEN_MARGIN;
    const laneHead = new Array<number>(LANE_COUNT).fill(Infinity);

    for (const car of this.pool) {
      if (!car.active) continue;
      car.y += move;
      car.sprite.y = car.y;
      if (car.y > offscreen) {
        car.active = false;
        car.sprite.visible = false;
        continue;
      }
      if (car.y < laneHead[car.lane]!) laneHead[car.lane] = car.y;
    }
    this.laneHeadY = laneHead;

    this.msUntilNextSpawn -= dtSec * 1000;
    if (this.msUntilNextSpawn <= 0) {
      const lane = this.pickSpawnLane();
      if (lane !== null) this.activate(lane);
      this.msUntilNextSpawn = this.randSpawnDelay();
    }
  }

  *activeBounds(): Iterable<AABB> {
    for (const car of this.pool) {
      if (!car.active) continue;
      yield {
        x: car.sprite.x - TRAFFIC_WIDTH / 2 + TRAFFIC_HITBOX_INSET,
        y: car.y - TRAFFIC_HEIGHT / 2 + TRAFFIC_HITBOX_INSET,
        w: TRAFFIC_WIDTH - TRAFFIC_HITBOX_INSET * 2,
        h: TRAFFIC_HEIGHT - TRAFFIC_HITBOX_INSET * 2,
      };
    }
  }

  reset(): void {
    for (const car of this.pool) {
      car.active = false;
      car.sprite.visible = false;
    }
    this.laneHeadY = new Array(LANE_COUNT).fill(Infinity);
    this.msUntilNextSpawn = this.randSpawnDelay();
  }
}
