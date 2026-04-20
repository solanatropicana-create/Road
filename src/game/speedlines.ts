import { Container, Graphics } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  ROAD_LEFT_X,
  ROAD_WIDTH,
  SPEED_LINE_ALPHA_MAX,
  SPEED_LINE_ALPHA_MIN,
  SPEED_LINE_COLOR,
  SPEED_LINE_COUNT,
  SPEED_LINE_LENGTH_MAX,
  SPEED_LINE_LENGTH_MIN,
  SPEED_LINE_SPEED_MAX,
  SPEED_LINE_SPEED_MIN,
  SPEED_LINE_WIDTH,
} from '../config/tuning';

interface SpeedLine {
  sprite: Graphics;
  y: number;
  speed: number;
  length: number;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class SpeedLines extends Container {
  private lines: SpeedLine[] = [];

  constructor() {
    super();
    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      const sprite = new Graphics();
      this.addChild(sprite);
      const line: SpeedLine = {
        sprite,
        y: Math.random() * CANVAS_HEIGHT,
        speed: randRange(SPEED_LINE_SPEED_MIN, SPEED_LINE_SPEED_MAX),
        length: randRange(SPEED_LINE_LENGTH_MIN, SPEED_LINE_LENGTH_MAX),
      };
      this.redrawLine(line);
      this.placeLine(line);
      this.lines.push(line);
    }
  }

  private redrawLine(line: SpeedLine): void {
    const alpha = randRange(SPEED_LINE_ALPHA_MIN, SPEED_LINE_ALPHA_MAX);
    line.sprite.clear();
    line.sprite
      .rect(-SPEED_LINE_WIDTH / 2, 0, SPEED_LINE_WIDTH, line.length)
      .fill({ color: SPEED_LINE_COLOR, alpha });
  }

  private placeLine(line: SpeedLine): void {
    line.sprite.x = ROAD_LEFT_X + Math.random() * ROAD_WIDTH;
    line.sprite.y = line.y;
  }

  private respawn(line: SpeedLine): void {
    line.y = -line.length - Math.random() * 120;
    line.speed = randRange(SPEED_LINE_SPEED_MIN, SPEED_LINE_SPEED_MAX);
    line.length = randRange(SPEED_LINE_LENGTH_MIN, SPEED_LINE_LENGTH_MAX);
    this.redrawLine(line);
    this.placeLine(line);
  }

  update(dtSec: number): void {
    for (const line of this.lines) {
      line.y += line.speed * dtSec;
      line.sprite.y = line.y;
      if (line.y > CANVAS_HEIGHT + 40) this.respawn(line);
    }
  }

  reset(): void {
    for (const line of this.lines) {
      line.y = Math.random() * CANVAS_HEIGHT;
      line.speed = randRange(SPEED_LINE_SPEED_MIN, SPEED_LINE_SPEED_MAX);
      line.length = randRange(SPEED_LINE_LENGTH_MIN, SPEED_LINE_LENGTH_MAX);
      this.redrawLine(line);
      this.placeLine(line);
    }
  }
}
