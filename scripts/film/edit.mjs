/**
 * Cuts the recorded clips (trailer.mjs) into finished videos: the timeline,
 * dissolves and beat-cut montage, letterbox, a light grade, the title cards
 * (titles.mjs), and the score (score.py) timed to the same cuts.
 *
 *   node scripts/film/edit.mjs                  # trailer + vertical teaser, English and Turkish
 *   node scripts/film/edit.mjs wide en          # just one
 *   node scripts/film/edit.mjs wide en --cta "Wishlist on Steam"
 *
 * Output: shots/film/out/underfoot-<trailer|teaser>-<en|tr>.mp4
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './stage.mjs';
import { renderCards } from './titles.mjs';

const FPS = 30;
const BEAT = 60 / 84;
/** A life-montage shot: four beats (plus the one frame the cut eats). */
const BAR = 4 * BEAT + 1 / FPS;
const CUT = 1 / FPS;

const TEXT = {
  en: {
    c1: 'One spring morning,<br>a queen comes down from the sky.',
    c2: 'She digs. She seals herself in.<br>She waits.',
    c3: 'Seasons pass. The colony grows.',
    c4: 'No one gives orders.',
    c5: 'Every seed still finds its way home.',
    w1: 'Storms.',
    w2: 'Long nights.',
    w3: 'Winter.',
    tagline: 'A harvester-ant colony, at true scale',
    scale: '1 pixel = 1 mm',
  },
  tr: {
    c1: 'Bir bahar sabahı,<br>gökten bir kraliçe iner.',
    c2: 'Kazar. Kendini içeri kapatır.<br>Bekler.',
    c3: 'Mevsimler geçer. Koloni büyür.',
    c4: 'Kimse emir vermez.',
    c5: 'Yine de her tohum yuvasını bulur.',
    w1: 'Fırtınalar.',
    w2: 'Uzun geceler.',
    w3: 'Kış.',
    tagline: 'Gerçek ölçekte bir hasatçı karınca kolonisi',
    scale: '1 piksel = 1 mm',
  },
};

/**
 * Segments in order: clip, where in it to start, how long, the dissolve into
 * it (x), and a card over it (card: [id, at, dur, kind]). `mark` names the
 * moments the score follows.
 */
const TIMELINES = {
  wide: {
    width: 1920,
    height: 1080,
    picture: 804,
    segs: [
      { clip: 'flight', from: 0, dur: 5.45, card: ['c1', 1.0, 4.0] },
      { clip: 'dig', from: 0.5, dur: 4.3, x: 0.7 },
      { clip: 'founding', from: 0.3, dur: 7.4, x: 0.8, card: ['c2', 1.1, 4.6] },
      { clip: 'growth', from: 0, dur: 7.8, x: 0.8, mark: 'build', card: ['c3', 1.2, 4.6] },
      { clip: 'nest', from: 0, dur: 5.2, x: 0.8 },
      { clip: 'column', from: 1.0, dur: BAR, x: CUT, mark: 'life', card: ['c4', 0.35, 4.9] },
      { clip: 'forager', from: 1.2, dur: BAR, x: CUT },
      { clip: 'entrance', from: 0.8, dur: BAR, x: CUT },
      { clip: 'shaft', from: 0.8, dur: BAR, x: CUT, card: ['c5', 0.3, 4.9] },
      { clip: 'nursery', from: 1.0, dur: BAR, x: CUT },
      { clip: 'carry', from: 0.5, dur: BAR, x: CUT },
      { clip: 'storm', from: 0.4, dur: 4.3, x: CUT, mark: 'drama', card: ['w1', 0.7, 2.6, 'word'], thunder: [0.45, 3.3], rain: true },
      { clip: 'night', from: 0.5, dur: 3.6, x: 0.5, card: ['w2', 0.5, 2.4, 'word'], night: true },
      { clip: 'winter', from: 0.5, dur: 3.6, x: 0.5, card: ['w3', 0.5, 2.4, 'word'] },
      { clip: 'finale', from: 0, dur: 9.0, x: 0.9, title: 4.2 },
    ],
  },
  tall: {
    width: 1080,
    height: 1920,
    picture: 1920,
    segs: [
      { clip: 'flight', from: 0.4, dur: 5.0, card: ['c1', 0.8, 3.8] },
      { clip: 'founding', from: 1.0, dur: 4.4, x: 0.6, mark: 'build', card: ['c2', 0.6, 3.4] },
      { clip: 'nest', from: 0.5, dur: 4.0, x: 0.6, card: ['c3', 0.5, 3.0] },
      { clip: 'forager', from: 1.0, dur: BAR, x: CUT, mark: 'life', card: ['c4', 0.3, 2.6] },
      { clip: 'entrance', from: 0.8, dur: BAR, x: CUT },
      { clip: 'carry', from: 0.5, dur: BAR, x: CUT },
      { clip: 'storm', from: 0.4, dur: BAR, x: CUT, mark: 'drama', card: ['w1', 0.4, 2.2, 'word'], thunder: [0.45], rain: true },
      { clip: 'night', from: 0.5, dur: 2.6, x: 0.4, card: ['w2', 0.3, 2.0, 'word'], night: true },
      { clip: 'winter', from: 0.5, dur: 2.6, x: 0.4, card: ['w3', 0.3, 2.0, 'word'] },
      { clip: 'finale', from: 0, dur: 7.5, x: 0.7, title: 2.6 },
    ],
  },
};

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
/**
 * Bring the score to -14 LUFS (what the video platforms play at): measure it,
 * apply the gain that lands it there, and catch the few peaks that would then
 * go over with a limiter (about -1.5 dBFS).
 */
function loudnorm(src, dst) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr.toString();
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const gain = (-14 - Number(m.input_i)).toFixed(2);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', `volume=${gain}dB,alimiter=limit=0.84:level=false:attack=2:release=60,aresample=48000`, '-c:a', 'pcm_s16le', dst]);
}
const probeDur = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();

async function cut(format, lang, { cta } = {}) {
  const T = TIMELINES[format];
  const clips = join(ROOT, 'shots/film/clips', format);
  const work = join(ROOT, 'shots/film/work', `${format}-${lang}`);
  const outDir = join(ROOT, 'shots/film/out');
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  // Lay the segments out on the timeline.
  let t = 0;
  const segs = T.segs.map((s, i) => {
    const start = i === 0 ? 0 : t - (s.x ?? 0);
    t = start + s.dur;
    const file = join(clips, `${s.clip}.mp4`);
    if (!existsSync(file)) throw new Error(`missing clip ${file}`);
    const fps = s.clip === 'growth' ? 8 : FPS;
    const len = probeDur(file);
    // Each shot runs a few frames past its cut, so the dissolve into the next never runs dry.
    const tail = i < T.segs.length - 1 ? 3 / FPS : 0;
    if (s.from + s.dur + tail > len + 0.02) throw new Error(`${s.clip}: needs ${(s.from + s.dur).toFixed(2)} s, has ${len.toFixed(2)} s`);
    return { ...s, start, file, fps, tail };
  });
  const total = t;

  // Cards.
  const tx = TEXT[lang];
  const cards = [];
  for (const s of segs) {
    if (s.card) {
      const [id, at, dur, kind = 'line'] = s.card;
      cards.push({ id, kind, text: tx[id], at: s.start + at, dur });
    }
    if (s.title !== undefined) {
      cards.push({ id: 'title', kind: 'title', tagline: tx.tagline, scale: tx.scale, cta, at: s.start + s.title, dur: total - (s.start + s.title) });
    }
  }
  const pngs = await renderCards(cards, { width: T.width, height: T.height, dir: join(work, 'cards') });

  // The score, cued to the same cuts.
  const at = (m) => segs.find((s) => s.mark === m)?.start;
  const titleSeg = segs.find((s) => s.title !== undefined);
  const cues = {
    length: total,
    build: at('build'),
    life: at('life'),
    drama: at('drama'),
    title: titleSeg.start + titleSeg.title,
    hits: [at('drama')],
    thunder: segs.flatMap((s) => (s.thunder ?? []).map((d) => s.start + d)),
    rain: (() => { const s = segs.find((s) => s.rain); return s ? [s.start, s.start + s.dur] : [0, 0]; })(),
    night: (() => { const s = segs.find((s) => s.night); return s ? [s.start, s.start + s.dur] : [0, 0]; })(),
  };
  writeFileSync(join(work, 'cues.json'), JSON.stringify(cues, null, 1));
  const raw = join(work, 'score-raw.wav');
  const wav = join(work, 'score.wav');
  sh('python3', [join(ROOT, 'scripts/film/score.py'), join(work, 'cues.json'), raw]);
  loudnorm(raw, wav);

  // The picture: trims, dissolves, letterbox, grade, cards, fades.
  const inputs = [];
  const f = [];
  segs.forEach((s, i) => {
    inputs.push('-i', s.file);
    const slow = s.fps !== FPS ? `framerate=fps=${FPS}:interp_start=0:interp_end=255:scene=100,` : '';
    f.push(`[${i}:v]${slow}fps=${FPS},trim=start=${s.from.toFixed(4)}:duration=${(s.dur + s.tail).toFixed(4)},setpts=PTS-STARTPTS,format=yuv420p,settb=AVTB[s${i}]`);
  });
  let last = 's0';
  segs.slice(1).forEach((s, k) => {
    const i = k + 1;
    f.push(`[${last}][s${i}]xfade=transition=fade:duration=${(s.x ?? CUT).toFixed(4)}:offset=${s.start.toFixed(4)}[x${i}]`);
    last = `x${i}`;
  });
  const pad = T.picture < T.height ? `,pad=${T.width}:${T.height}:0:${(T.height - T.picture) / 2}:black` : '';
  // A light grade: a touch more contrast and warmth, the shadows lifted a hair.
  f.push(`[${last}]eq=contrast=1.06:saturation=1.08:gamma=1.04,colorbalance=rs=0.02:bs=-0.02:rh=0.02:bh=-0.03${pad},format=yuva420p[base]`);
  last = 'base';
  const n0 = segs.length;
  cards.forEach((c, k) => {
    const i = n0 + k;
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', c.dur.toFixed(3), '-i', pngs[c.id]);
    const fin = c.kind === 'title' ? 1.4 : 0.6;
    const fout = c.kind === 'title' ? 0.01 : 0.7;
    f.push(`[${i}:v]format=rgba,fade=t=in:st=0:d=${fin}:alpha=1,fade=t=out:st=${(c.dur - fout).toFixed(3)}:d=${fout}:alpha=1,setpts=PTS+${c.at.toFixed(3)}/TB[c${k}]`);
    f.push(`[${last}][c${k}]overlay=0:0:eof_action=pass[o${k}]`);
    last = `o${k}`;
  });
  f.push(`[${last}]fade=t=in:st=0:d=1.2,fade=t=out:st=${(total - 1.6).toFixed(3)}:d=1.6,format=yuv420p[v]`);
  const ai = inputs.filter((a) => a === '-i').length;
  inputs.push('-i', wav);
  f.push(`[${ai}:a]anull[a]`);

  const out = join(outDir, `underfoot-${format === 'wide' ? 'trailer' : 'teaser'}-${lang}.mp4`);
  writeFileSync(join(work, 'filter.txt'), f.join(';\n'));
  sh('ffmpeg', [
    '-y', '-loglevel', 'error',
    ...inputs,
    '-filter_complex_script', join(work, 'filter.txt'),
    '-map', '[v]', '-map', '[a]',
    '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart',
    out,
  ]);
  // A poster frame (the title over the slice) for the thumbnail.
  const poster = out.replace(/\.mp4$/, '.jpg');
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (total - 2.2).toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '2', poster]);
  console.log(`${out}  (${total.toFixed(1)} s)`);
  return out;
}

const args = process.argv.slice(2);
const ctaAt = args.indexOf('--cta');
const cta = ctaAt >= 0 ? args[ctaAt + 1] : undefined;
const pos = args.filter((a, i) => !a.startsWith('--') && i !== (ctaAt >= 0 ? ctaAt + 1 : -1));
const formats = pos.filter((a) => a in TIMELINES);
const langs = pos.filter((a) => a in TEXT);
for (const format of formats.length ? formats : Object.keys(TIMELINES)) {
  for (const lang of langs.length ? langs : Object.keys(TEXT)) await cut(format, lang, { cta });
}
