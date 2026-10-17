import type { Game } from '../main';
import { t } from './i18n';
import { ICON } from './icons';

/** The film's (and the video's) long and short sides: 16:9 wide, or 9:16 tall for phones. */
const LONG = 1280;
const SHORT = 720;
/** How long a freshly dug stretch glows, in quarter-weeks at the least. */
const GLOW_MIN = 6;
const AMBER = [255, 190, 104] as const;

/**
 * The nest's time-lapse: the slice around the nest with the soil back as it
 * was before the landing, and the tunnels and rooms opening up in it quarter
 * week by quarter week, each fresh stretch glowing a moment as it is dug.
 * The date and the colony's numbers run along. It can be scrubbed, and saved
 * as a video (where the browser can record one).
 */
export class Replay {
  private game: Game;
  private save: (name: string, data: Blob) => Promise<boolean>;
  private el: HTMLElement | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  /** The film's stretch of the slice (mm), and its picture at one pixel a millimetre. */
  private box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** What was dug (mm, with the ground over it), and whether the film stands tall (9:16). */
  private nest = { x0: 0, x1: 0, y1: 0, top: 0 };
  private tall = false;
  private fw = LONG;
  private fh = SHORT;
  private pic!: HTMLCanvasElement;
  private picCtx!: CanvasRenderingContext2D;
  private img!: ImageData;
  private buf!: Uint32Array;
  private soil!: Uint32Array;
  private hollow!: Uint32Array;
  /** Cells of the box that were dug (box indices), in the order they were dug, and when. */
  private order!: Int32Array;
  private when!: Uint16Array;
  /** Cells painted dug so far, and the first of them still glowing. */
  private done = 0;
  private glowFrom = 0;
  private glow = GLOW_MIN;
  /** Where the film is (quarter-weeks), how long it is, and how fast it runs (quarter-weeks a second). */
  private at = 0;
  private steps = 0;
  private rate = 1;
  private playing = false;
  /** Seconds spent on the last frame before stopping. */
  private hold = 0;
  private raf = 0;
  private last = 0;
  private wasPaused = false;
  private recorder: MediaRecorder | null = null;
  private keys = (e: KeyboardEvent): void => this.onKey(e);

  constructor(game: Game, save: (name: string, data: Blob) => Promise<boolean>) {
    this.game = game;
    this.save = save;
  }

  get open(): boolean {
    return this.el !== null;
  }

  /** Is there anything to show yet? */
  ready(): boolean {
    const s = this.game.sim.story;
    return !!s && s.steps > 1;
  }

  show(root: HTMLElement): void {
    if (this.el || !this.ready()) return;
    this.prepare();
    const el = document.createElement('div');
    el.id = 'replay';
    el.className = 'panel';
    const recordable = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    el.innerHTML = `<div class="rp-head"><div><div class="eyebrow">${t('replayEyebrow')}</div><h2>${t('replayTitle')}</h2></div>
        <button class="collapse" id="rp-close" title="${t('replayClose')}">${ICON.close}</button></div>
      <div class="rp-film"></div>
      <div class="rp-ctl"><button class="btn" id="rp-play"></button><input type="range" id="rp-scrub" min="0" max="1000" value="0" />
        <div class="seg" id="rp-fmt"><button data-fmt="wide" title="${t('replayWide')}">16:9</button><button data-fmt="tall" title="${t('replayTall')}">9:16</button></div>
        ${recordable ? `<button class="btn" id="rp-rec">${ICON.camera}${t('replaySave')}</button>` : ''}</div>`;
    root.appendChild(el);
    root.classList.add('modal');
    this.el = el;
    (el.querySelector('.rp-film') as HTMLElement).appendChild(this.canvas);
    (el.querySelector('#rp-close') as HTMLElement).onclick = () => this.close();
    (el.querySelector('#rp-play') as HTMLElement).onclick = () => this.toggle();
    const scrub = el.querySelector('#rp-scrub') as HTMLInputElement;
    scrub.oninput = () => {
      if (this.recorder) return;
      this.playing = false;
      this.seek((Number(scrub.value) / 1000) * this.steps);
      this.sync();
    };
    const rec = el.querySelector('#rp-rec') as HTMLElement | null;
    if (rec) rec.onclick = () => this.record();
    el.querySelectorAll<HTMLElement>('#rp-fmt [data-fmt]').forEach((b) => {
      b.onclick = () => {
        const tall = b.dataset.fmt === 'tall';
        if (this.recorder || tall === this.tall) return;
        this.tall = tall;
        const at = this.at;
        this.layout();
        this.seek(at);
        this.sync();
      };
    });
    el.classList.toggle('tall', this.tall);
    addEventListener('keydown', this.keys, true);
    // The colony waits while its film plays.
    this.wasPaused = this.game.paused;
    this.game.paused = true;
    this.seek(0);
    this.playing = true;
    this.hold = 0;
    this.sync();
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  close(): void {
    if (!this.el) return;
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.stop();
      this.recorder = null;
    }
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.keys, true);
    this.el.parentElement?.classList.remove('modal');
    this.el.remove();
    this.el = null;
    this.game.paused = this.wasPaused;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.el) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === ' ') this.toggle();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  private toggle(): void {
    if (this.recorder) return;
    if (!this.playing && this.at >= this.steps) this.seek(0);
    this.playing = !this.playing;
    this.hold = 0;
    this.sync();
  }

  /** Find what was dug, pick the film's shape to suit it, and lay the film out. */
  private prepare(): void {
    const sim = this.game.sim;
    const w = sim.world;
    const dug = sim.story.dug;
    let x0 = w.w;
    let x1 = 0;
    let y0 = w.h;
    let y1 = 0;
    for (let i = 0; i < dug.length; i++) {
      if (!dug[i]) continue;
      const x = i % w.w;
      const y = (i - x) / w.w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    let top = y0;
    for (let x = x0; x <= x1; x++) top = Math.min(top, w.ground[x]!);
    this.nest = { x0, x1, y1, top };
    // A deep, narrow nest fills a tall frame; a spreading one a wide frame.
    this.tall = y1 - top + 85 > (x1 - x0 + 120) * 1.15;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.steps = sim.story.steps;
    // Ten seconds for a short story, up to twenty for a long one.
    const secs = Math.min(20, Math.max(10, this.steps * 0.06));
    this.rate = this.steps / secs;
    this.glow = Math.max(GLOW_MIN, Math.round(this.steps / 30));
    this.layout();
  }

  /** Frame the nest in the film's shape, work out the colours, and sort the dug cells by when they were dug. */
  private layout(): void {
    const sim = this.game.sim;
    const w = sim.world;
    const dug = sim.story.dug;
    this.fw = this.tall ? SHORT : LONG;
    this.fh = this.tall ? LONG : SHORT;
    this.canvas.width = this.fw;
    this.canvas.height = this.fh;
    // Some meadow over it and soil round it, widened (or deepened) to the film's shape.
    const n = this.nest;
    let bx0 = n.x0 - 50;
    let bx1 = n.x1 + 50;
    let by0 = n.top - 40;
    let by1 = n.y1 + 35;
    const want = this.fw / this.fh;
    if ((bx1 - bx0) / (by1 - by0) < want) {
      const grow = (by1 - by0) * want - (bx1 - bx0);
      bx0 -= grow / 2;
      bx1 += grow / 2;
    } else {
      const grow = (bx1 - bx0) / want - (by1 - by0);
      by1 += grow * 0.75;
      by0 -= grow * 0.25;
    }
    // Inside the world (a nest at the edge keeps its framing by sliding over).
    const fit = (a: number, b: number, max: number): [number, number] => {
      const len = Math.min(max, b - a);
      let s = Math.max(0, a);
      if (s + len > max) s = max - len;
      return [Math.round(s), Math.round(s + len)];
    };
    [bx0, bx1] = fit(bx0, bx1, w.w);
    [by0, by1] = fit(by0, by1, w.h);
    this.box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    const { soil, hollow } = this.game.renderer.storyColors(bx0, by0, bx1, by1);
    this.soil = soil;
    this.hollow = hollow;
    // The dug cells in the box, by when they were dug.
    const cells: number[] = [];
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (dug[y * w.w + x]) cells.push(y * w.w + x);
    cells.sort((a, b) => dug[a]! - dug[b]!);
    this.order = new Int32Array(cells.length);
    this.when = new Uint16Array(cells.length);
    cells.forEach((i, k) => {
      const x = i % w.w;
      const y = (i - x) / w.w;
      this.order[k] = (y - by0) * bw + (x - bx0);
      this.when[k] = dug[i]!;
    });
    this.pic = document.createElement('canvas');
    this.pic.width = bw;
    this.pic.height = bh;
    this.picCtx = this.pic.getContext('2d')!;
    this.img = this.picCtx.createImageData(bw, bh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.done = 0;
    this.el?.classList.toggle('tall', this.tall);
  }

  /** Go to a point of the film (quarter-weeks), repainting from the start if it is earlier. */
  private seek(at: number): void {
    at = Math.max(0, Math.min(this.steps, at));
    if (at < this.at || this.done === 0) {
      this.buf.set(this.soil);
      this.done = 0;
      this.glowFrom = 0;
    }
    this.at = at;
    this.paint();
  }

  /** Bring the picture up to this.at: newly dug cells, and the glow fading on the recent ones. */
  private paint(): void {
    const at = this.at;
    const order = this.order;
    const when = this.when;
    const buf = this.buf;
    const hollow = this.hollow;
    while (this.done < order.length && when[this.done]! <= at) this.done++;
    // Cells no longer glowing settle to their plain dug colour.
    while (this.glowFrom < this.done && when[this.glowFrom]! <= at - this.glow) {
      const k = order[this.glowFrom]!;
      buf[k] = hollow[k]!;
      this.glowFrom++;
    }
    for (let j = this.glowFrom; j < this.done; j++) {
      const k = order[j]!;
      const f = 0.8 * (1 - (at - when[j]!) / this.glow);
      const c = hollow[k]!;
      const r = (c & 255) * (1 - f) + AMBER[0] * f;
      const g = ((c >>> 8) & 255) * (1 - f) + AMBER[1] * f;
      const b = ((c >>> 16) & 255) * (1 - f) + AMBER[2] * f;
      buf[k] = ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
    }
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const FW = this.fw;
    const FH = this.fh;
    const sim = this.game.sim;
    const story = sim.story;
    this.picCtx.putImageData(this.img, 0, 0);
    // A soft daylight sky behind the meadow.
    const sky = ctx.createLinearGradient(0, 0, 0, FH * 0.4);
    sky.addColorStop(0, '#8fa9bd');
    sky.addColorStop(1, '#d8cdb2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FW, FH);
    const bw = this.box.x1 - this.box.x0;
    const bh = this.box.y1 - this.box.y0;
    const s = Math.min(FW / bw, FH / bh);
    const dw = bw * s;
    const dh = bh * s;
    ctx.imageSmoothingEnabled = s < 2;
    ctx.drawImage(this.pic, (FW - dw) / 2, (FH - dh) / 2, dw, dh);
    // Light falls off with depth, as in the slice itself.
    const dark = ctx.createLinearGradient(0, FH * 0.25, 0, FH);
    dark.addColorStop(0, 'rgba(10,6,3,0)');
    dark.addColorStop(1, 'rgba(10,6,3,0.18)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, FW, FH);
    // The date, and the colony's numbers that week.
    const day = story.startDay + Math.max(0, this.at - 1) / 4;
    const doy = sim.cal.doy(day);
    const row = story.weeks[Math.min(story.weeks.length - 1, Math.max(0, Math.floor((this.at - 1) / 4)))];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(246,236,214,0.95)';
    ctx.font = 'italic 600 30px Fraunces, Georgia, serif';
    ctx.fillText(`${t(`m${sim.cal.month(doy)}`)} · ${t('yearN', { n: sim.cal.year(day) })}`, 34, 54);
    if (sim.names.colony) {
      ctx.font = 'italic 18px Fraunces, Georgia, serif';
      ctx.fillStyle = 'rgba(246,236,214,0.8)';
      ctx.fillText(t(sim.names.colony), 34, 82);
    }
    if (row) {
      ctx.font = '500 20px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(246,236,214,0.92)';
      ctx.fillText(t('replayLine', { w: row.w, r: row.r }), 34, FH - 34);
    }
    ctx.font = 'italic 16px Fraunces, Georgia, serif';
    ctx.fillStyle = 'rgba(246,236,214,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText('Underfoot', FW - 30, FH - 34);
    ctx.restore();
    // Progress along the foot.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, FH - 5, FW, 5);
    ctx.fillStyle = 'rgba(231,183,95,0.9)';
    ctx.fillRect(0, FH - 5, (FW * this.at) / Math.max(1, this.steps), 5);
  }

  private frame(now: number): void {
    if (!this.el) return;
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.playing) return;
    if (this.at < this.steps) {
      this.at = Math.min(this.steps, this.at + dt * this.rate);
      this.paint();
      this.sync();
      return;
    }
    // At the end: hold the finished nest a moment (the glow dies away), then stop.
    this.hold += dt;
    this.at = this.steps + Math.min(this.glow, this.hold * this.rate);
    this.paint();
    this.at = this.steps;
    if (this.hold > 2.5) {
      this.playing = false;
      this.sync();
      if (this.recorder) this.recorder.stop();
    }
  }

  private sync(): void {
    if (!this.el) return;
    const play = this.el.querySelector('#rp-play') as HTMLElement;
    play.innerHTML = this.playing ? `${ICON.pause}${t('replayPause')}` : `${ICON.play}${t('replayPlay')}`;
    const scrub = this.el.querySelector('#rp-scrub') as HTMLInputElement;
    scrub.value = String(Math.round((this.at / Math.max(1, this.steps)) * 1000));
    const rec = this.el.querySelector('#rp-rec') as HTMLElement | null;
    if (rec) rec.classList.toggle('disabled', !!this.recorder);
    this.el.querySelectorAll<HTMLElement>('#rp-fmt [data-fmt]').forEach((b) => b.classList.toggle('on', (b.dataset.fmt === 'tall') === this.tall));
  }

  /** Play the film from the start into a video file. */
  private record(): void {
    if (this.recorder) return;
    // MP4 where the browser can record it (what phones and social sites take), else WebM.
    const types = ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return;
    const stream = this.canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      this.recorder = null;
      this.sync();
      const sim = this.game.sim;
      const name = `underfoot-${(sim.names.queen || 'colony').toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, '-')}-nest-${this.tall ? '9x16' : '16x9'}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
      void this.save(name, new Blob(chunks, { type: mime.split(';')[0] }));
    };
    this.recorder = rec;
    this.seek(0);
    this.hold = 0;
    this.playing = true;
    rec.start(250);
    this.sync();
  }
}
