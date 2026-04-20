import { Container, Text } from 'pixi.js';
import {
  HUD_COLOR,
  HUD_FONT_FAMILY,
  HUD_FONT_SIZE,
  HUD_STROKE_COLOR,
  HUD_X,
  HUD_Y,
} from '../config/tuning';

export class Hud extends Container {
  private text: Text;

  constructor() {
    super();
    this.text = new Text({
      text: '1.00x',
      style: {
        fontFamily: HUD_FONT_FAMILY,
        fontSize: HUD_FONT_SIZE,
        fontWeight: '700',
        fill: HUD_COLOR,
        stroke: { color: HUD_STROKE_COLOR, width: 3, alignment: 0.5 },
        letterSpacing: 2,
      },
    });
    this.text.x = HUD_X;
    this.text.y = HUD_Y;
    this.addChild(this.text);
  }

  update(multiplier: number): void {
    this.text.text = `${multiplier.toFixed(2)}x`;
  }

  reset(): void {
    this.text.text = '1.00x';
  }
}
