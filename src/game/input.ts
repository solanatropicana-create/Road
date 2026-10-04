/** Keyboard + mouse state. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, inside: false };
  /** Twin-stick touch state: left side moves, right side aims and fires. */
  touch = {
    used: false,
    stickId: -1,
    ox: 0,
    oy: 0,
    sx: 0,
    sy: 0,
    aimId: -1,
    ax: 0,
    ay: 0,
  };

  /** Stick vector, length 0..1, screen axes. */
  stick(): { x: number; y: number; len: number } {
    const t = this.touch;
    if (t.stickId < 0) return { x: 0, y: 0, len: 0 };
    const dx = t.sx - t.ox;
    const dy = t.sy - t.oy;
    const l = Math.hypot(dx, dy);
    const max = 70;
    const k = l > max ? max / l : 1;
    return { x: (dx * k) / max, y: (dy * k) / max, len: Math.min(1, l / max) };
  }

  private touchDown(e: PointerEvent): void {
    const t = this.touch;
    t.used = true;
    if (e.clientX < window.innerWidth * 0.45 && t.stickId < 0) {
      t.stickId = e.pointerId;
      t.ox = t.sx = e.clientX;
      t.oy = t.sy = e.clientY;
    } else if (t.aimId < 0) {
      t.aimId = e.pointerId;
      t.ax = e.clientX;
      t.ay = e.clientY;
    }
  }

  private touchMove(e: PointerEvent): void {
    const t = this.touch;
    if (e.pointerId === t.stickId) {
      t.sx = e.clientX;
      t.sy = e.clientY;
    } else if (e.pointerId === t.aimId) {
      t.ax = e.clientX;
      t.ay = e.clientY;
    }
  }

  private touchUp(e: PointerEvent): void {
    const t = this.touch;
    if (e.pointerId === t.stickId) t.stickId = -1;
    if (e.pointerId === t.aimId) t.aimId = -1;
  }

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this.touchMove(e);
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    });
    el.addEventListener('pointerleave', () => (this.mouse.inside = false));
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return this.touchDown(e);
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.touchUp(e);
    };
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return up(e);
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per key press. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  axis(neg: string[], pos: string[]): number {
    return (pos.some((k) => this.keys.has(k)) ? 1 : 0) - (neg.some((k) => this.keys.has(k)) ? 1 : 0);
  }
}
