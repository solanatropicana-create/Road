/** Keyboard + mouse state. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, inside: false };

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
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    });
    el.addEventListener('pointerleave', () => (this.mouse.inside = false));
    el.addEventListener('pointerdown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('pointerup', (e) => {
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
