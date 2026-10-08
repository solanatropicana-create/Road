import { clamp } from '../core/math';

/** Floating virtual joystick plus keyboard fallback. Screen right = +x, screen down = +z in world. */
export class Input {
  heading = Math.PI / 2;
  throttle = 0;
  active = false;
  abilityPressed = false;
  portPressed = false;
  private pid: number | null = null;
  private ox = 0;
  private oy = 0;
  private keys = new Set<string>();
  private joy: HTMLDivElement;
  private knob: HTMLDivElement;
  enabled = true;
  onFirstGesture: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.joy = document.createElement('div');
    this.joy.className = 'joy';
    this.joy.innerHTML = '<div class="ring"></div><div class="knob"></div>';
    this.knob = this.joy.querySelector('.knob') as HTMLDivElement;
    root.appendChild(this.joy);

    window.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      this.gesture();
      this.keys.add(e.code);
      if (e.code === 'Space') { this.abilityPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'Enter') this.portPressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
  }

  private gesture() {
    if (this.onFirstGesture) { this.onFirstGesture(); }
  }

  private down(e: PointerEvent) {
    this.gesture();
    if (!this.enabled || this.pid !== null) return;
    const t = e.target as HTMLElement;
    if (t.closest('.tap')) return;
    this.pid = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.joy.style.left = `${this.ox}px`;
    this.joy.style.top = `${this.oy}px`;
    this.joy.classList.add('show');
    this.knob.style.transform = 'scale(0)';
    this.active = true;
    this.throttle = 0;
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault();
    const dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > 8) {
      this.heading = Math.atan2(dy, dx);
      this.throttle = clamp((len - 8) / 45, 0.25, 1);
      const r = Math.min(len, 75);
      this.knob.style.transform = `translate(${(dx / len) * (r + 20)}px, ${(dy / len) * (r + 20)}px) rotate(${this.heading}rad)`;
    }
    // Drag the base along when the finger runs far, so steering never "bottoms out".
    if (len > 110) {
      this.ox = e.clientX - (dx / len) * 110;
      this.oy = e.clientY - (dy / len) * 110;
      this.joy.style.left = `${this.ox}px`;
      this.joy.style.top = `${this.oy}px`;
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    this.release();
  }

  release() {
    this.pid = null;
    this.active = false;
    this.throttle = 0;
    this.joy.classList.remove('show');
  }

  /** Merges keyboard steering into the joystick state each frame. */
  poll() {
    if (this.pid !== null) return;
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (x || z) {
      this.heading = Math.atan2(z, x);
      this.throttle = 1;
      this.active = true;
    } else if (this.active) {
      this.active = false;
      this.throttle = 0;
    }
  }

  consumeAbility() {
    const v = this.abilityPressed;
    this.abilityPressed = false;
    return v;
  }

  consumePort() {
    const v = this.portPressed;
    this.portPressed = false;
    return v;
  }
}
