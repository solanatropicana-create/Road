/**
 * Gamepad (and Steam Deck) controls, through the browser's Gamepad API in the
 * standard layout:
 *
 *   left stick   move the view           right stick / triggers   zoom
 *   A            follow the ant at the crosshair (in menus: press)
 *   B            let go, close a panel    X  documentary   Y  latest event
 *   LB / RB      slower / faster          Start  pause     Back  keys and settings
 *   d-pad        queen, hide panels, dig plan, trails (in menus: move between buttons)
 *
 * It only reads the pad and calls back; the UI decides what each thing does.
 */
export interface PadActions {
  /** True while a menu (title, settings, closing card) wants the d-pad and A. */
  menu(): boolean;
  pan(dx: number, dy: number): void;
  zoom(f: number): void;
  pick(): void;
  key(k: string): void;
  speedStep(d: number): void;
  /** Show or hide the crosshair. */
  cross(on: boolean): void;
}

const DEAD = 0.18;

export class Pad {
  private prev: boolean[] = [];
  private last = -1e9;
  private repeatAt = 0;
  private crossOn = false;

  constructor(private act: PadActions) {}

  poll(dt: number, now: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) gp = gp ?? p;
    if (!gp) {
      if (this.crossOn) this.setCross(false);
      return;
    }
    const b = gp.buttons.map((x) => x.pressed);
    const a = gp.axes;
    const ax = (k: number): number => {
      const v = a[k] ?? 0;
      return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
    };
    const down = (k: number): boolean => !!b[k] && !this.prev[k];
    const lx = ax(0);
    const ly = ax(1);
    const ry = ax(3);
    const lt = gp.buttons[6]?.value ?? 0;
    const rt = gp.buttons[7]?.value ?? 0;
    const any = b.some((x) => x) || lx !== 0 || ly !== 0 || ry !== 0;
    if (any) this.last = now;
    const menu = this.act.menu();
    if (menu) {
      // Menus: the d-pad (or the left stick, with a repeat) moves between buttons.
      const dir = b[12] || b[14] || ly < -0.6 || lx < -0.6 ? -1 : b[13] || b[15] || ly > 0.6 || lx > 0.6 ? 1 : 0;
      if (dir !== 0 && now >= this.repeatAt) {
        this.act.key(dir < 0 ? 'Shift+Tab' : 'Tab');
        this.repeatAt = now + (this.repeatAt > now - 300 ? 160 : 380);
      } else if (dir === 0) this.repeatAt = 0;
      if (down(0)) this.act.key('Enter');
      if (down(1)) this.act.key('Escape');
      if (down(8)) this.act.key('?');
      if (this.crossOn) this.setCross(false);
    } else {
      if (lx !== 0 || ly !== 0) this.act.pan(lx * dt * 900, ly * dt * 900);
      const z = -ry + rt - lt;
      if (Math.abs(z) > 0.05) this.act.zoom(Math.exp(z * dt * 1.5));
      if (down(0)) this.act.pick();
      if (down(1)) this.act.key('Escape');
      if (down(2)) this.act.key('c');
      if (down(3)) this.act.key('j');
      if (down(4)) this.act.speedStep(-1);
      if (down(5)) this.act.speedStep(1);
      if (down(9)) this.act.key(' ');
      if (down(8)) this.act.key('?');
      if (down(12)) this.act.key('q');
      if (down(13)) this.act.key('h');
      if (down(14)) this.act.key('p');
      if (down(15)) this.act.key('t');
      this.setCross(now - this.last < 8000);
    }
    this.prev = b;
  }

  private setCross(on: boolean): void {
    if (on === this.crossOn) return;
    this.crossOn = on;
    this.act.cross(on);
  }
}
