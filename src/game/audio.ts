import type { SimEvent } from '../sim/world';

/**
 * Tiny synthesized sound kit (no assets). Positional: volume falls off with
 * distance from the camera and pans left/right.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private laserGain: GainNode | null = null;
  private laserOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private budget = 0;
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Continuous laser hum, gated by gain.
    this.laserOsc = ctx.createOscillator();
    this.laserOsc.type = 'sawtooth';
    this.laserOsc.frequency.value = 220;
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 1400;
    lf.Q.value = 3;
    this.laserGain = ctx.createGain();
    this.laserGain.gain.value = 0;
    this.laserOsc.connect(lf).connect(this.laserGain).connect(this.master);
    this.laserOsc.start();

    // Player engine rumble: filtered looping noise.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 180;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    src.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  /** Per-frame continuous sounds. */
  frame(dt: number, laserLevel: number, engineLevel: number): void {
    this.budget = Math.min(12, this.budget + dt * 40);
    if (!this.ctx || !this.laserGain || !this.engineGain || !this.engineFilter || !this.laserOsc) return;
    const t = this.ctx.currentTime;
    this.laserGain.gain.setTargetAtTime(Math.min(0.12, laserLevel * 0.06), t, 0.03);
    this.laserOsc.frequency.setTargetAtTime(200 + laserLevel * 40 + Math.random() * 12, t, 0.05);
    this.engineGain.gain.setTargetAtTime(engineLevel * 0.35, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(120 + engineLevel * 260, t, 0.1);
  }

  handle(e: SimEvent, cam: { x: number; y: number; zoom: number }, playerShip: number | null): void {
    if (!this.ctx || this.muted) return;
    const pos = 'x' in e ? { x: e.x, y: e.y } : 'x1' in e ? { x: e.x1, y: e.y1 } : null;
    let vol = 1;
    let pan = 0;
    if (pos) {
      const dx = pos.x - cam.x;
      const dy = pos.y - cam.y;
      const d = Math.hypot(dx, dy);
      vol = Math.max(0, 1 - d / 140);
      pan = Math.max(-1, Math.min(1, dx / 60));
      if (vol <= 0.02) return;
    }
    switch (e.t) {
      case 'shot': {
        const mine = e.ship === playerShip;
        if (!this.spend(mine ? 0.6 : 1)) return;
        this.thump(mine ? 150 : 120, 0.09, (mine ? 0.32 : 0.18) * vol, pan);
        this.burst(2600, 0.05, 0.12 * vol, pan, 'highpass');
        break;
      }
      case 'hit':
        if (!this.spend(1)) return;
        this.burst(1800 + Math.random() * 800, 0.07, 0.25 * vol, pan, 'bandpass');
        this.ping(700 + Math.random() * 500, 0.12, 0.06 * vol, pan);
        break;
      case 'break':
        if (!this.spend(1.5)) return;
        this.burst(500 + Math.random() * 300, 0.25, 0.35 * vol, pan, 'lowpass');
        this.thump(70, 0.2, 0.25 * vol, pan);
        break;
      case 'explode':
        this.burst(260, 1.2, 0.9 * vol, pan, 'lowpass');
        this.thump(45, 0.9, 0.8 * vol, pan);
        this.burst(3000, 0.3, 0.2 * vol, pan, 'highpass');
        break;
      case 'impact':
        if (!this.spend(1)) return;
        this.thump(55, 0.25, Math.min(0.6, e.energy / 3000) * vol, pan);
        this.burst(900, 0.15, Math.min(0.4, e.energy / 5000) * vol, pan, 'bandpass');
        break;
      case 'disabled':
        this.sweep(600, 80, 1.0, 0.25);
        break;
      default:
        break;
    }
  }

  ui(kind: 'click' | 'win' | 'lose'): void {
    if (!this.ctx) return;
    if (kind === 'click') this.ping(880, 0.08, 0.08, 0);
    if (kind === 'win') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.ping(f, 0.35, 0.12, 0), i * 110));
    if (kind === 'lose') [392, 330, 262].forEach((f, i) => setTimeout(() => this.ping(f, 0.45, 0.12, 0), i * 160));
  }

  private spend(c: number): boolean {
    if (this.budget < c) return false;
    this.budget -= c;
    return true;
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master!);
    return p;
  }

  private thump(freq: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(freq: number, dur: number, vol: number, pan: number, type: BiquadFilterType): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private ping(freq: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.out(0));
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
