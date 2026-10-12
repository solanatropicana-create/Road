export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  gravity: number;
  color: number;
}

/** Purely visual specks: dust from digging, shed wings, spray. */
export class Particles {
  readonly list: Particle[] = [];
  max = 600;

  add(p: Particle): void {
    if (this.list.length < this.max) this.list.push(p);
  }

  step(): void {
    const l = this.list;
    let j = 0;
    for (let k = 0; k < l.length; k++) {
      const p = l[k]!;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      if (--p.life > 0) l[j++] = p;
    }
    l.length = j;
  }
}
