import type { Game } from '../main';
import { clamp } from '../util/math';
import { Task } from '../sim/types';

const KEY = 'underfoot.sound';
const MUSIC_KEY = 'underfoot.music';
const VOL_KEY = 'underfoot.volumes';

/** Pentatonic scales (semitones above the root): open by day, minor at night. */
const DAY_SCALE = [0, 2, 4, 7, 9];
const NIGHT_SCALE = [0, 3, 5, 7, 10];
/** D3. */
const ROOT_HZ = 146.83;

/**
 * The slice's sound, made on the fly (no recordings): wind in the grass,
 * rain, thunder in a storm, field crickets on warm nights and grasshoppers
 * in the summer noon. When the camera goes below ground everything turns
 * muffled and close, with the faint scratching of the diggers when one is
 * near. A roof caving in is a deep thud.
 *
 * Browsers start sound only after the player has done something, so the
 * soundscape wakes on the first click or key.
 */
export class Soundscape {
  on = true;
  /** The soft generative music under the soundscape (its own switch). */
  music = true;
  private pad!: GainNode;
  private nextChord = 0;
  private voices: { osc: OscillatorNode[]; gain: GainNode }[] = [];
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Volume buses the player sets: the natural sound, and the music. */
  private sfx!: GainNode;
  private mus!: GainNode;
  /** The player's volumes, 0..1 (remembered). */
  vol = { master: 1, sound: 1, music: 1 };
  private earth!: BiquadFilterNode;
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private rain!: { gain: GainNode };
  private room!: { gain: GainNode };
  /** The hum of a swarm of winged ants in the air (a nuptial flight). */
  private swarm!: { gain: GainNode; am: GainNode };
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private nextChirp: number[] = [0, 0, 0];
  private nextBuzz = 0;
  private nextScratch = 0;
  private lastFlash = 0;

  constructor() {
    try {
      this.on = localStorage.getItem(KEY) !== 'off';
      this.music = localStorage.getItem(MUSIC_KEY) !== 'off';
      const v = localStorage.getItem(VOL_KEY);
      if (v) this.vol = { ...this.vol, ...(JSON.parse(v) as Partial<typeof this.vol>) };
    } catch {
      // storage unavailable: keep the default
    }
  }

  /** The master level: 0.9 at full, eased so the slider feels even. */
  private level(): number {
    return 0.9 * this.vol.master * this.vol.master;
  }

  /** Set one of the player's volumes (0..1) and remember it. */
  setVolume(which: 'master' | 'sound' | 'music', v: number): void {
    this.vol[which] = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(this.vol));
    } catch {
      // storage unavailable: the volume holds for this session
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (which === 'master' && this.on) this.master.gain.setTargetAtTime(this.level(), now, 0.05);
    if (which === 'sound') this.sfx.gain.setTargetAtTime(this.vol.sound, now, 0.05);
    if (which === 'music') this.mus.gain.setTargetAtTime(this.vol.music, now, 0.05);
  }

  /** The first gesture: build the graph (or resume a suspended context). */
  wake(): void {
    if (!this.on) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // Everything passes through the earth: open above ground, muffled below.
    this.earth = ctx.createBiquadFilter();
    this.earth.type = 'lowpass';
    this.earth.frequency.value = 16000;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.vol.sound;
    this.sfx.connect(this.master);
    this.mus = ctx.createGain();
    this.mus.gain.value = this.vol.music;
    this.mus.connect(this.master);
    this.earth.connect(this.sfx);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    // Wind: noise through a low band that breathes with the gusts.
    {
      const src = this.loop(this.noise);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.earth);
      this.wind = { gain, filter };
    }
    // Rain: a hiss in the upper band.
    {
      const src = this.loop(this.noise);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3200;
      band.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(gain).connect(this.earth);
      this.rain = { gain };
    }
    // The room tone of the nest: a faint deep hush, heard only below ground.
    {
      const src = this.loop(this.brown);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(this.sfx);
      this.room = { gain };
    }
    // A swarm's hum: a low band of noise, trembling at wingbeat-ish rates.
    {
      const src = this.loop(this.noise);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 220;
      band.Q.value = 3;
      const am = ctx.createGain();
      am.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 23;
      const depth = ctx.createGain();
      depth.gain.value = 0.4;
      lfo.connect(depth).connect(am.gain);
      lfo.start();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(am).connect(gain).connect(this.earth);
      this.swarm = { gain, am };
    }
    // The music: a few soft voices through a warm low-pass, never above a murmur.
    {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 0.3;
      this.pad = ctx.createGain();
      this.pad.gain.value = 0;
      this.pad.connect(lp).connect(this.mus);
    }
    this.master.gain.setTargetAtTime(this.level(), ctx.currentTime, 1.2);
  }

  setMusic(on: boolean): void {
    this.music = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
    } catch {
      // not remembered
    }
  }

  /** A new chord: each voice glides in slowly while the old one fades (long, overlapping swells). */
  private chord(now: number, night: boolean, below: number, winter: boolean): void {
    const ctx = this.ctx!;
    const scale = night ? NIGHT_SCALE : DAY_SCALE;
    // Fade out what is sounding.
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 7);
      for (const o of v.osc) o.stop(now + 7.5);
    }
    this.voices = [];
    // Below ground an octave lower; in winter fewer voices.
    const octave = below > 0.5 ? 0.5 : 1;
    const n = winter ? 2 : 3;
    const used = new Set<number>();
    for (let k = 0; k < n; k++) {
      let deg = Math.floor(Math.random() * scale.length);
      while (used.has(deg)) deg = (deg + 1) % scale.length;
      used.add(deg);
      const up = k === n - 1 && Math.random() < 0.5 ? 12 : 0;
      const hz = ROOT_HZ * octave * Math.pow(2, (scale[deg]! + up) / 12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.16 / n, now + 6 + Math.random() * 3);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (k - (n - 1) / 2) * 0.5;
      const osc: OscillatorNode[] = [];
      // Two slightly detuned partials make each voice breathe.
      for (const [type, det, lvl] of [['sine', -4, 1], ['triangle', 5, 0.35]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = hz;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = lvl;
        o.connect(g).connect(gain);
        o.start(now);
        osc.push(o);
      }
      gain.connect(pan).connect(this.pad);
      this.voices.push({ osc, gain });
    }
  }

  toggle(): boolean {
    this.on = !this.on;
    try {
      localStorage.setItem(KEY, this.on ? 'on' : 'off');
    } catch {
      // not remembered
    }
    if (this.on) {
      this.wake();
      if (this.ctx) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.3);
    } else if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    return this.on;
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    return buf;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  /** A short burst of filtered noise (a chirp pulse, a scratch, a thud). */
  private burst(at: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, pan = 0, brown = false, sweep = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.earth);
    src.start(at, Math.random() * 2);
    src.stop(at + dur + 0.05);
  }

  /** A soft bell (a sine and its octave, struck and dying away), above the earth filter. */
  private bell(at: number, freq: number, vol: number): void {
    const ctx = this.ctx!;
    for (const [mul, v] of [[1, 1], [2.01, 0.35]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol * v, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
      o.connect(g).connect(this.mus);
      o.start(at);
      o.stop(at + 2.7);
    }
  }

  /** A field cricket's chirp: three or four quick pulses of a pure tone. */
  private chirp(at: number, pitch: number, pan: number, vol: number): void {
    const ctx = this.ctx!;
    const pulses = 3 + (Math.random() < 0.4 ? 1 : 0);
    for (let k = 0; k < pulses; k++) {
      const t0 = at + k * 0.034;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = pitch;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.024);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.earth);
      o.start(t0);
      o.stop(t0 + 0.03);
    }
  }

  /** Follow the scene: weather, time of day, where the camera is. */
  update(game: Game, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || ctx.state !== 'running') return;
    const sim = game.sim;
    const cam = game.cam;
    const now = ctx.currentTime;
    const w = sim.world;
    const gx = clamp(Math.round(cam.x), 0, w.w - 1);
    // How far below ground the middle of the view is (0 above, 1 well down).
    const below = clamp((cam.y - w.ground[gx]!) / 60, 0, 1);
    const paused = (game.paused || sim.phase === 'choose') && !game.cine.busy;
    // The nearer the camera, the more of the ground's own sound.
    const near = clamp((cam.zoom - 2) / 8, 0, 1);
    this.earth.frequency.setTargetAtTime(16000 * Math.pow(0.04, below), now, 0.4);
    const wind = Math.abs(sim.gust());
    this.wind.gain.gain.setTargetAtTime(paused ? 0 : clamp(0.14 + wind * 0.6, 0, 0.9), now, 0.6);
    this.wind.filter.frequency.setTargetAtTime(320 + wind * 700, now, 0.8);
    const rain = sim.weather.snowing ? 0 : sim.weather.rain;
    this.rain.gain.gain.setTargetAtTime(paused ? 0 : clamp(rain * 0.45, 0, 0.7), now, 0.8);
    this.room.gain.gain.setTargetAtTime(paused ? 0 : below * 0.18, now, 0.6);
    const alates = game.cine.busy ? 26 : sim.flyers.length;
    this.swarm.gain.gain.setTargetAtTime(paused && !game.cine.busy ? 0 : Math.min(0.5, alates * 0.025) * (1 - below * 0.8), now, 0.5);
    this.pad.gain.setTargetAtTime(this.music && sim.phase !== 'choose' ? 0.2 : 0, now, 2);
    if (this.music && now > this.nextChord) {
      const day0 = sim.cal.daylight(sim.dayT, sim.doy);
      this.chord(now, day0 < 0.2, below, sim.dormant || sim.snow > 2);
      this.nextChord = now + 14 + Math.random() * 10;
    }
    if (paused) return;
    // Thunder after a flash, a moment later and long.
    if (sim.flash > 0 && performance.now() - this.lastFlash > 1500) {
      this.lastFlash = performance.now();
      this.burst(now + 0.4 + Math.random() * 1.2, 3.2, 'lowpass', 160, 0.7, 1.6, (Math.random() - 0.5) * 0.6, true, 0.4);
    }
    const day = sim.cal.daylight(sim.dayT, sim.doy);
    const warm = sim.surfaceT;
    const season = sim.doy > 140 && sim.doy < 275;
    // Field crickets sing on warm nights from late spring to early autumn.
    if (season && day < 0.12 && warm > 13 && !sim.raining && !sim.dormant) {
      for (let v = 0; v < 3; v++) {
        if (now < this.nextChirp[v]!) continue;
        const pitch = 4200 + v * 260;
        this.chirp(now + Math.random() * 0.05, pitch, [-0.6, 0.15, 0.7][v]!, (0.035 + v * 0.012) * (1 - below * 0.6));
        this.nextChirp[v] = now + 0.42 + v * 0.11 + Math.random() * 0.12;
      }
    }
    // Grasshoppers in the summer heat of the day.
    if (season && day > 0.5 && warm > 20 && !sim.raining && now > this.nextBuzz) {
      this.nextBuzz = now + 2.5 + Math.random() * 6;
      const n = 3 + Math.floor(Math.random() * 6);
      const pan = (Math.random() - 0.5) * 1.4;
      for (let k = 0; k < n; k++) this.burst(now + k * 0.09, 0.07, 'bandpass', 6800, 2.5, 0.14 * (1 - below), pan);
    }
    // Close up below ground: the diggers at work nearby.
    if (below > 0.3 && near > 0.35 && now > this.nextScratch) {
      const hw = cam.screenW / 2 / cam.zoom;
      const hh = cam.screenH / 2 / cam.zoom;
      let digging = 0;
      for (const a of sim.colony.ants) if (a.task === Task.Dig && a.timer > 0 && Math.abs(a.x - cam.x) < hw && Math.abs(a.y - cam.y) < hh) digging++;
      if (digging > 0) {
        const pan = (Math.random() - 0.5) * 1.2;
        this.burst(now, 0.035 + Math.random() * 0.03, 'highpass', 2500 + Math.random() * 2500, 0.8, 0.16 * near, pan);
        this.nextScratch = now + Math.max(0.12, 1.4 / Math.sqrt(digging)) * (0.6 + Math.random() * 0.8);
      } else this.nextScratch = now + 0.6;
    }
    void dt;
  }

  /** A sound for something that happened. */
  event(game: Game, key: string, loc?: { x: number; y: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || ctx.state !== 'running') return;
    const fight = ['war', 'warYoung', 'raid', 'raidYoung', 'lasiusKill'];
    const milestone = ['firstAlates', 'flight', 'flightDone'];
    if (key !== 'caveIn' && key !== 'caveInDead' && !fight.includes(key) && !milestone.includes(key)) return;
    const cam = game.cam;
    // Louder the nearer it is to what is on screen.
    const d = loc ? (Math.hypot(loc.x - cam.x, loc.y - cam.y) * cam.zoom) / Math.max(cam.screenW, cam.screenH) : 1;
    const vol = clamp(1 - d / 1.6, 0.15, 1);
    const pan = loc ? clamp(((loc.x - cam.x) * cam.zoom) / (cam.screenW / 2), -1, 1) * 0.7 : 0;
    const now = ctx.currentTime;
    if (milestone.includes(key)) {
      // A turn in the colony's year: a soft pair of bells over the bed (part of the music).
      if (!this.music) return;
      const base = 523.25;
      this.bell(now, base, 0.05);
      this.bell(now + 0.35, base * 1.5, 0.04);
      if (key === 'flight') this.bell(now + 0.7, base * 2, 0.03);
      return;
    }
    if (fight.includes(key)) {
      // A melee: a patter of mandibles and legs, close and dry.
      for (let k = 0; k < 16; k++) this.burst(now + Math.random() * 1.6, 0.025, 'bandpass', 2400 + Math.random() * 2600, 4, 0.26 * vol, pan + (Math.random() - 0.5) * 0.4);
      this.burst(now, 0.5, 'lowpass', 180, 0.7, 0.8 * vol, pan, true);
      return;
    }
    this.burst(now, 1.8, 'lowpass', 240, 0.8, 2.2 * vol, pan, true, 0.3);
    for (let k = 0; k < 7; k++) this.burst(now + 0.08 + Math.random() * 0.9, 0.05, 'bandpass', 900 + Math.random() * 1500, 1.5, 0.22 * vol, pan + (Math.random() - 0.5) * 0.3);
  }
}
