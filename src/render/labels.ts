import { Container, Text, TextStyle } from 'pixi.js';

interface Label {
  text: Text;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
}

/** Floating world-anchored callouts ("REAKTÖR!"), drawn in screen space so they stay crisp. */
export class Labels {
  root = new Container();
  private items: Label[] = [];
  private styles = new Map<number, TextStyle>();

  private style(color: number): TextStyle {
    let s = this.styles.get(color);
    if (!s) {
      s = new TextStyle({
        fontFamily: 'Fredoka, Nunito, ui-rounded, system-ui, sans-serif',
        fontSize: 18,
        fontWeight: '700',
        fill: color,
        stroke: { color: 0x0e0b1f, width: 4 },
        letterSpacing: 1,
      });
      this.styles.set(color, s);
    }
    return s;
  }

  add(x: number, y: number, label: string, color: number, big = false): void {
    if (this.items.length > 24) return;
    const t = new Text({ text: label, style: this.style(color) });
    t.anchor.set(0.5);
    if (big) t.scale.set(1.5);
    this.root.addChild(t);
    this.items.push({ text: t, x, y, vy: -6, life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2 });
  }

  update(dt: number, toScreen: (x: number, y: number) => { x: number; y: number }): void {
    const keep: Label[] = [];
    for (const l of this.items) {
      l.life -= dt;
      if (l.life <= 0) {
        l.text.destroy();
        continue;
      }
      l.y += l.vy * dt;
      const p = toScreen(l.x, l.y);
      l.text.position.set(p.x, p.y);
      const f = l.life / l.max;
      l.text.alpha = Math.min(1, f * 3);
      keep.push(l);
    }
    this.items = keep;
  }

  clear(): void {
    for (const l of this.items) l.text.destroy();
    this.items = [];
  }
}
