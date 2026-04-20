import { Container, Graphics } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_STRIPE_COLOR,
  LANE_STRIPE_GAP,
  LANE_STRIPE_LENGTH,
  LANE_STRIPE_WIDTH,
  LANE_WIDTH,
  PARALLAX_BG_SPEED,
  PARALLAX_LINE_COLOR,
  PARALLAX_LINE_COUNT,
  ROAD_EDGE_COLOR,
  ROAD_EDGE_WIDTH,
  ROAD_LEFT_X,
  ROAD_SCROLL_SPEED,
  ROAD_WIDTH,
} from '../config/tuning';

export class Road extends Container {
  private parallaxLines: Graphics;
  private stripes: Graphics;
  private edges: Graphics;
  private scrollY = 0;
  private parallaxY = 0;
  private stripePeriod = LANE_STRIPE_LENGTH + LANE_STRIPE_GAP;
  private parallaxPeriod = CANVAS_HEIGHT / PARALLAX_LINE_COUNT;

  constructor() {
    super();

    this.parallaxLines = new Graphics();
    this.stripes = new Graphics();
    this.edges = new Graphics();

    this.addChild(this.parallaxLines);
    this.addChild(this.edges);
    this.addChild(this.stripes);

    this.drawEdges();
    this.redraw();
  }

  private drawEdges(): void {
    const g = this.edges;
    g.clear();
    g.rect(ROAD_LEFT_X - ROAD_EDGE_WIDTH / 2, 0, ROAD_EDGE_WIDTH, CANVAS_HEIGHT)
      .fill({ color: ROAD_EDGE_COLOR });
    g.rect(
      ROAD_LEFT_X + ROAD_WIDTH - ROAD_EDGE_WIDTH / 2,
      0,
      ROAD_EDGE_WIDTH,
      CANVAS_HEIGHT,
    ).fill({ color: ROAD_EDGE_COLOR });
  }

  private redraw(): void {
    const bg = this.parallaxLines;
    bg.clear();
    const period = this.parallaxPeriod;
    const offset = ((this.parallaxY % period) + period) % period;
    for (let i = -1; i < PARALLAX_LINE_COUNT + 1; i++) {
      const y = i * period + offset;
      bg.rect(0, y, ROAD_LEFT_X, 1).fill({ color: PARALLAX_LINE_COLOR, alpha: 0.9 });
      bg.rect(ROAD_LEFT_X + ROAD_WIDTH, y, ROAD_LEFT_X, 1).fill({
        color: PARALLAX_LINE_COLOR,
        alpha: 0.9,
      });
    }

    const s = this.stripes;
    s.clear();
    const p = this.stripePeriod;
    const off = ((this.scrollY % p) + p) % p;
    const dividerCount = LANE_COUNT - 1;
    const stripesPerColumn = Math.ceil(CANVAS_HEIGHT / p) + 2;
    for (let d = 1; d <= dividerCount; d++) {
      const cx = ROAD_LEFT_X + LANE_WIDTH * d;
      for (let i = -1; i < stripesPerColumn; i++) {
        const y = i * p + off;
        s.rect(
          cx - LANE_STRIPE_WIDTH / 2,
          y,
          LANE_STRIPE_WIDTH,
          LANE_STRIPE_LENGTH,
        ).fill({ color: LANE_STRIPE_COLOR });
      }
    }
  }

  update(dtSec: number): void {
    this.scrollY += ROAD_SCROLL_SPEED * dtSec;
    this.parallaxY += PARALLAX_BG_SPEED * dtSec;
    this.redraw();
  }

  reset(): void {
    this.scrollY = 0;
    this.parallaxY = 0;
    this.redraw();
  }
}
