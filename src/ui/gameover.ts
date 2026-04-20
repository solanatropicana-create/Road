import { Container, Graphics, Text } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GAMEOVER_MULT_COLOR,
  GAMEOVER_OVERLAY_ALPHA,
  GAMEOVER_OVERLAY_COLOR,
  GAMEOVER_TITLE_COLOR,
  HUD_FONT_FAMILY,
} from '../config/tuning';

export class GameOverScreen extends Container {
  private overlay: Graphics;
  private title: Text;
  private mult: Text;
  private hint: Text;
  private onRestart?: () => void;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.overlay = new Graphics()
      .rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      .fill({ color: GAMEOVER_OVERLAY_COLOR, alpha: GAMEOVER_OVERLAY_ALPHA });
    this.addChild(this.overlay);

    this.title = new Text({
      text: 'CRASHED',
      style: {
        fontFamily: HUD_FONT_FAMILY,
        fontSize: 52,
        fontWeight: '700',
        fill: GAMEOVER_TITLE_COLOR,
        stroke: { color: 0x120018, width: 2, alignment: 0.5 },
        letterSpacing: 6,
      },
    });
    this.title.anchor.set(0.5);
    this.title.x = CANVAS_WIDTH / 2;
    this.title.y = CANVAS_HEIGHT / 2 - 80;
    this.addChild(this.title);

    this.mult = new Text({
      text: '@ 1.00x',
      style: {
        fontFamily: HUD_FONT_FAMILY,
        fontSize: 64,
        fontWeight: '700',
        fill: GAMEOVER_MULT_COLOR,
        stroke: { color: 0x001820, width: 2, alignment: 0.5 },
        letterSpacing: 3,
      },
    });
    this.mult.anchor.set(0.5);
    this.mult.x = CANVAS_WIDTH / 2;
    this.mult.y = CANVAS_HEIGHT / 2;
    this.addChild(this.mult);

    this.hint = new Text({
      text: '[ SPACE / TAP ] RESTART',
      style: {
        fontFamily: HUD_FONT_FAMILY,
        fontSize: 18,
        fill: 0xcfe9ff,
        letterSpacing: 4,
      },
    });
    this.hint.anchor.set(0.5);
    this.hint.x = CANVAS_WIDTH / 2;
    this.hint.y = CANVAS_HEIGHT / 2 + 90;
    this.addChild(this.hint);

    this.on('pointertap', () => this.onRestart?.());
  }

  show(finalMultiplier: number): void {
    this.mult.text = `@ ${finalMultiplier.toFixed(2)}x`;
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  setOnRestart(handler: () => void): void {
    this.onRestart = handler;
  }
}
