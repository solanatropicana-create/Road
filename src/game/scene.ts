import { Application, Container, Ticker } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter } from 'pixi-filters';
import {
  BLOOM_BLUR,
  BLOOM_BRIGHTNESS,
  BLOOM_QUALITY,
  BLOOM_SCALE,
  BLOOM_THRESHOLD,
  CHROMATIC_B_OFFSET,
  CHROMATIC_G_OFFSET,
  CHROMATIC_R_OFFSET,
} from '../config/tuning';
import { playerHitsAny } from './collision';
import { Player } from './player';
import { Road } from './road';
import { SpeedLines } from './speedlines';
import { TrafficManager } from './traffic';
import { CrashSession, type CrashSessionHooks } from '../systems/crash';
import { InputManager } from '../systems/input';
import { GameOverScreen } from '../ui/gameover';
import { Hud } from '../ui/hud';

type GameState = 'idle' | 'playing' | 'crashed';

export interface GameSceneHooks extends CrashSessionHooks {
  onStateChange?(state: GameState): void;
}

export class GameScene extends Container {
  private app: Application;
  private gameplay: Container;
  private road: Road;
  private speedLines: SpeedLines;
  private traffic: TrafficManager;
  private player: Player;
  private hud: Hud;
  private gameOver: GameOverScreen;
  private input: InputManager;
  private crash: CrashSession;
  private state: GameState = 'idle';
  private tickerCb = (t: Ticker) => this.tick(t);
  private hooks: GameSceneHooks;

  constructor(app: Application, hooks: GameSceneHooks = {}) {
    super();
    this.app = app;
    this.hooks = hooks;

    this.gameplay = new Container();
    this.road = new Road();
    this.speedLines = new SpeedLines();
    this.traffic = new TrafficManager();
    this.player = new Player();
    this.hud = new Hud();
    this.gameOver = new GameOverScreen();

    this.gameplay.addChild(this.road);
    this.gameplay.addChild(this.speedLines);
    this.gameplay.addChild(this.traffic.container);
    this.gameplay.addChild(this.player);
    this.gameplay.addChild(this.hud);

    const bloom = new AdvancedBloomFilter({
      threshold: BLOOM_THRESHOLD,
      bloomScale: BLOOM_SCALE,
      brightness: BLOOM_BRIGHTNESS,
      blur: BLOOM_BLUR,
      quality: BLOOM_QUALITY,
    });
    const chromatic = new RGBSplitFilter({
      red: [CHROMATIC_R_OFFSET[0], CHROMATIC_R_OFFSET[1]],
      green: [CHROMATIC_G_OFFSET[0], CHROMATIC_G_OFFSET[1]],
      blue: [CHROMATIC_B_OFFSET[0], CHROMATIC_B_OFFSET[1]],
    });
    this.gameplay.filters = [bloom, chromatic];

    this.addChild(this.gameplay);
    this.addChild(this.gameOver);

    this.crash = new CrashSession({
      onCrashPoint: (x) => {
        console.log(`[crash] crashPoint=${x.toFixed(2)}`);
        this.hooks.onCrashPoint?.(x);
      },
      onCashOut: (m) => {
        console.log(`[crash] cashOut=${m.toFixed(2)}x`);
        this.hooks.onCashOut?.(m);
      },
    });

    this.input = new InputManager();
    this.input.on('left', () => {
      if (this.state === 'playing') this.player.moveLeft();
    });
    this.input.on('right', () => {
      if (this.state === 'playing') this.player.moveRight();
    });
    this.input.on('restart', () => {
      if (this.state === 'crashed') this.restart();
    });

    this.gameOver.setOnRestart(() => {
      if (this.state === 'crashed') this.restart();
    });

    this.app.ticker.add(this.tickerCb);
  }

  restart(): void {
    this.road.reset();
    this.speedLines.reset();
    this.traffic.reset();
    this.player.reset();
    this.hud.reset();
    this.gameOver.hide();
    this.crash.reset();
    this.crash.start();
    this.setState('playing');
  }

  cashOut(): number {
    return this.crash.cashOut();
  }

  private tick(ticker: Ticker): void {
    if (this.state !== 'playing') return;
    const dtSec = ticker.deltaMS / 1000;
    const nowMs = performance.now();

    this.road.update(dtSec);
    this.speedLines.update(dtSec);
    this.traffic.update(dtSec);
    this.player.update(nowMs, dtSec);

    const playerBounds = this.player.getBounds2D();
    if (playerHitsAny(playerBounds, this.traffic.activeBounds())) {
      this.endRun();
      return;
    }

    this.hud.update(this.crash.currentMultiplier());
  }

  private endRun(): void {
    const finalMult = this.crash.end();
    this.hud.update(finalMult);
    this.gameOver.show(finalMult);
    this.setState('crashed');
  }

  private setState(next: GameState): void {
    if (this.state === next) return;
    this.state = next;
    this.hooks.onStateChange?.(next);
  }

  override destroy(): void {
    this.app.ticker.remove(this.tickerCb);
    this.input.destroy();
    super.destroy({ children: true });
  }
}
