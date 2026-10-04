/** Keyboard + mouse state. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, inside: false, leftHit: false, rightHit: false, rightUp: false };
  /** 'stick': twin-stick flying; 'gesture': taps and drags become orders. */
  touchMode: 'stick' | 'gesture' = 'stick';
  /** Live touch gesture (screen points) while a finger is down in gesture mode. */
  gesture: { id: number; pts: { x: number; y: number }[]; t0: number } | null = null;
  /** Finished gestures, consumed by the game each frame. */
  gestures: { tap: boolean; pts: { x: number; y: number }[] }[] = [];
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
    if (this.touchMode === 'gesture') {
      if (!this.gesture) this.gesture = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY }], t0: performance.now() };
      return;
    }
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
    const g = this.gesture;
    if (g && e.pointerId === g.id) {
      const last = g.pts[g.pts.length - 1]!;
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) > 6) g.pts.push({ x: e.clientX, y: e.clientY });
      return;
    }
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
    const g = this.gesture;
    if (g && e.pointerId === g.id) {
      const a = g.pts[0]!;
      const far = g.pts.some((p) => Math.hypot(p.x - a.x, p.y - a.y) > 14);
      this.gestures.push({ tap: !far, pts: g.pts });
      this.gesture = null;
    }
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
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftHit = true;
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightHit = true;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.touchUp(e);
    };
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return up(e);
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2 && this.mouse.right) {
        this.mouse.right = false;
        this.mouse.rightUp = true;
      }
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
    this.mouse.leftHit = this.mouse.rightHit = this.mouse.rightUp = false;
    this.gestures.length = 0;
  }

  axis(neg: string[], pos: string[]): number {
    return (pos.some((k) => this.keys.has(k)) ? 1 : 0) - (neg.some((k) => this.keys.has(k)) ? 1 : 0);
  }
}
