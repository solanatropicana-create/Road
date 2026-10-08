/** Small synthesised sound set: no assets needed. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private last = new Map<string, number>();
  enabled = true;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  private startAmbient() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    this.ambient = { src, gain, filter };
  }

  /** Sea and wind bed follows speed and storminess. */
  setAmbient(speed: number, storm: number) {
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambient.gain.gain.setTargetAtTime(0.05 + speed * 0.004 + storm * 0.07, t, 0.4);
    this.ambient.filter.frequency.setTargetAtTime(380 + speed * 25 + storm * 500, t, 0.4);
  }

  private throttle(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if ((this.last.get(key) ?? -1) > now - gap) return false;
    this.last.set(key, now);
    return true;
  }

  private burst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.3), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 1, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Volume falls off with distance from the listener. */
  private att(dist: number) {
    return Math.max(0, 1 - dist / 260);
  }

  cannon(dist: number, heavy: boolean) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.02 || !this.throttle('cannon', 0.035)) return;
    this.burst(heavy ? 0.9 : 0.6, heavy ? 700 : 1100, 0.7, 0.55 * a);
    this.tone(heavy ? 55 : 75, 0.35, 0.6 * a, 'sine', 0.5);
  }

  hit(dist: number, big: boolean) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.02 || !this.throttle('hit', 0.04)) return;
    this.burst(0.25, big ? 1600 : 2400, 1.5, 0.45 * a, 'bandpass');
    this.tone(180, 0.12, 0.25 * a, 'square', 0.4);
  }

  splash(dist: number) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.05 || !this.throttle('splash', 0.05)) return;
    this.burst(0.35, 3000, 0.6, 0.22 * a, 'highpass');
  }

  explode(dist: number) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.02 || !this.throttle('explode', 0.06)) return;
    this.burst(1.4, 500, 0.5, 0.8 * a);
    this.tone(45, 0.8, 0.7 * a, 'sine', 0.5);
  }

  sink(dist: number) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.02) return;
    this.burst(2.5, 300, 0.4, 0.5 * a);
    this.tone(90, 2, 0.3 * a, 'triangle', 0.3);
  }

  coin() {
    if (!this.ctx || !this.throttle('coin', 0.06)) return;
    this.tone(1320, 0.08, 0.18, 'square');
    this.tone(1760, 0.14, 0.15, 'square', 1, 0.07);
  }

  gem() {
    if (!this.ctx) return;
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.18, 0.13, 'triangle', 1, i * 0.06));
  }

  ui() {
    if (!this.ctx) return;
    this.tone(660, 0.06, 0.12, 'triangle');
  }

  success() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 0.15, 'triangle', 1, i * 0.08));
  }

  error() {
    if (!this.ctx) return;
    this.tone(200, 0.18, 0.18, 'square', 0.7);
  }

  ability() {
    if (!this.ctx) return;
    this.burst(0.5, 1500, 0.8, 0.3, 'bandpass');
    this.tone(330, 0.3, 0.2, 'sawtooth', 2);
  }

  ram(dist: number, power: number) {
    const a = this.att(dist);
    if (!this.ctx || a <= 0.02 || !this.throttle('ram', 0.1)) return;
    this.burst(0.6, 900, 0.6, Math.min(0.9, power * 0.06) * a);
    this.tone(60, 0.4, Math.min(0.8, power * 0.05) * a, 'sine', 0.5);
  }

  bell() {
    if (!this.ctx) return;
    this.tone(880, 1.2, 0.2, 'sine', 0.995);
    this.tone(1320, 0.9, 0.08, 'sine', 0.995);
  }
}
