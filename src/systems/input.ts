import { KEY_LEFT, KEY_RESTART, KEY_RIGHT } from '../config/tuning';

export type InputEvent = 'left' | 'right' | 'restart';
type Handler = () => void;

export class InputManager {
  private handlers = new Map<InputEvent, Set<Handler>>();
  private keydown = (e: KeyboardEvent) => {
    const code = e.code;
    if (KEY_LEFT.includes(code)) {
      this.emit('left');
      e.preventDefault();
    } else if (KEY_RIGHT.includes(code)) {
      this.emit('right');
      e.preventDefault();
    } else if (KEY_RESTART.includes(code)) {
      this.emit('restart');
      e.preventDefault();
    }
  };

  constructor() {
    window.addEventListener('keydown', this.keydown);
  }

  on(event: InputEvent, handler: Handler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }

  off(event: InputEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: InputEvent): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keydown);
    this.handlers.clear();
  }
}
