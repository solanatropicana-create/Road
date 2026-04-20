import { Application } from 'pixi.js';
import { GameScene } from './game/scene';
import { BACKGROUND_COLOR, CANVAS_HEIGHT, CANVAS_WIDTH } from './config/tuning';

async function bootstrap() {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    background: BACKGROUND_COLOR,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });

  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app mount point not found');
  mount.appendChild(app.canvas);

  const scene = new GameScene(app);
  app.stage.addChild(scene);
  scene.restart();

  (window as unknown as { __scene: GameScene }).__scene = scene;
}

bootstrap().catch((err) => {
  console.error('[bootstrap] failed', err);
});
