/**
 * Cuts the recorded clips (trailer.mjs) into finished videos: the timeline,
 * dissolves and beat-cut montage, letterbox, a light grade, the title cards
 * (titles.mjs), and the score (score.py) timed to the same cuts.
 *
 *   node scripts/film/edit.mjs                 # the vertical teaser (1080 × 1920)
 *   node scripts/film/edit.mjs circle notes seed   # the three variants after the expert review
 *   node scripts/film/edit.mjs wide            # the 2.39:1 trailer
 *   node scripts/film/edit.mjs tall --cta "Follow the colony"
 *
 * Output: shots/film/out/underroot-<teaser|trailer>.mp4, a .jpg poster frame,
 * and for the teaser an -instagram.mp4 at the platform's upload rate.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './stage.mjs';
import { renderCards } from './titles.mjs';

const FPS = 30;
const BEAT = 60 / 84;
const CUT = 1 / FPS;
/** Montage shots: four beats, or two for the quick ones (plus the one frame the cut eats). */
const BAR = 4 * BEAT + CUT;
const HALF = 2 * BEAT + CUT;

/** Three beats: the montage's medium length. */
const THREE = 3 * BEAT + CUT;

const NAME = 'Underroot';
const TAGLINE = 'A realistic harvester-ant colony,<br>at true scale';

/** The game's own field note about the ant in the 'named' shot (trailer.mjs saves it beside the clip). */
const fieldNote = () => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'shots/film/clips/tall/named.json'), 'utf8')).note;
  } catch {
    return '';
  }
};

/**
 * Segments in order: clip, where in it to start, how long, the dissolve into
 * it (x), and the cards over it (cards: [{ kind, text, at, dur }], at from the
 * segment's start; a card may run on over the next cuts). `mark` names the
 * moments the score follows.
 */
const TIMELINES = {
  /**
   * Variant 1, "Full Circle": the first teaser's story, after the review. It opens
   * lit and sounding, shows the colony grow instead of saying so, follows one
   * forager's seed home, gives the weather its own shots, holds the title on a lit
   * colony and ends on winged queens lifting off, which loops back to the start.
   */
  circle: {
    out: 'underroot-v1-full-circle',
    width: 1080,
    height: 1920,
    picture: 1920,
    look: 'clear',
    fadeIn: 0,
    loop: true,
    phone: true,
    segs: [
      { clip: 'flight', from: 0.3, dur: 4.3, buzz: true, cards: [{ kind: 'line', text: 'One April day, a young <i>Messor structor</i> queen comes down from the sky.', at: 0.12, dur: 3.9, pos: 24 }] },
      { clip: 'founding', from: 1.0, dur: 3.7, x: 0.6, filter: 'deflicker=mode=pm:size=15', cards: [{ kind: 'line', text: 'She seals herself in,<br>and feeds her first brood<br>from her own body.', at: 0.4, dur: 3.1, pos: 24 }] },
      { clip: 'growth', from: 0, dur: 3.9, speed: 2, x: 0.6, mark: 'build', cards: [{ kind: 'line', text: 'Seasons pass.<br>The colony grows.', at: 0.3, dur: 3.4, pos: 17 }] },
      { clip: 'named', from: 0, dur: BAR, x: CUT, mark: 'life', cards: [{ kind: 'note', text: fieldNote(), at: 0.3, dur: BAR - 0.4, pos: 66 }] },
      { clip: 'trails', from: 0.3, dur: HALF, x: CUT, cards: [{ kind: 'line', text: 'No one gives orders.', at: 0.1, dur: 2 * HALF - 0.3, pos: 22 }] },
      { clip: 'gate', from: 0.3, dur: HALF, x: CUT },
      { clip: 'shaft', from: 0.8, dur: HALF, x: CUT },
      { clip: 'granary', from: 0, dur: BAR, x: CUT, cards: [{ kind: 'line', text: 'Seeds in. Husks out.', at: 0.2, dur: BAR - 0.4, pos: 22 }] },
      { clip: 'queen', from: 0.3, dur: HALF, x: CUT },
      { clip: 'carry', from: 0.6, dur: BAR, x: CUT },
      { clip: 'flood', from: 0.3, dur: BAR, x: CUT, mark: 'drama', hit: true, rain: true, flashes: [0.3, 0.5, 2.5], cards: [{ kind: 'line', text: 'Rain coming?<br>They shut the door.', at: 0.2, dur: BAR - 0.35, pos: 22 }] },
      { clip: 'lark', from: 0.55, dur: 2.9, x: CUT, hit: true, cards: [{ kind: 'word', text: 'Giants.', at: 0.15, dur: 2.6, pos: 68 }] },
      { clip: 'sleep', from: 0.2, dur: 3.4, x: 0.5, shimmer: 0.3, cards: [{ kind: 'line', text: 'Winter. They sleep<br>below the frost.', at: 0.3, dur: 2.9, pos: 22 }] },
      { clip: 'reveal', from: 0, dur: 7.0, x: 0.6, title: 3.9 },
      { clip: 'rise', from: 0.2, dur: 1.8, x: 0.45 },
    ],
  },
  /**
   * Variant 2, "Field Notes": a naturalist's notebook, after the myrmecologist and
   * the designer. True lines under gold labels, set left; the game's own field note;
   * the "seed clock" score of wood, knocks and a soil shaker.
   */
  notes: {
    out: 'underroot-v2-field-notes',
    width: 1080,
    height: 1920,
    picture: 1920,
    look: 'notes',
    fadeIn: 0,
    loop: true,
    phone: true,
    style: 'seedclock',
    segs: [
      { clip: 'flight', from: 0.3, dur: 4.0, buzz: true, cards: [{ kind: 'line', label: 'April · nuptial flight', text: 'A young <i>Messor structor</i> queen takes her only flight.', at: 0.12, dur: 3.6, pos: 22 }] },
      { clip: 'dig', from: 0.5, dur: 2.4, x: 0.4, cards: [{ kind: 'line', label: 'Day one', text: 'She lands, and breaks off her wings.', at: 0.2, dur: 2.1, pos: 22 }] },
      { clip: 'founding', from: 1.0, dur: 3.4, x: 0.5, filter: 'deflicker=mode=pm:size=15', cards: [{ kind: 'line', label: 'Weeks one to eight', text: 'Sealed in, unfed, she raises her first daughters.', at: 0.3, dur: 2.9, pos: 22 }] },
      { clip: 'growth', from: 0, dur: 3.6, speed: 2, x: 0.5, mark: 'build', cards: [{ kind: 'line', label: 'Year one', text: 'Most queens never make it. Hers grows.', at: 0.25, dur: 3.1, pos: 17 }] },
      {
        clip: 'named', from: 0, dur: BAR, x: CUT, mark: 'life',
        cards: [
          { kind: 'line', label: 'Foraging', text: 'Foragers search alone…', at: 0.1, dur: BAR - 0.2, pos: 22 },
          { kind: 'note', text: fieldNote(), at: 0.5, dur: BAR - 0.6, pos: 66 },
        ],
      },
      { clip: 'trails', from: 0, dur: BAR, x: CUT, cards: [{ kind: 'line', label: 'Recruitment', text: '…until one finds a rich patch, and calls.', at: 0.1, dur: BAR - 0.2, pos: 22 }] },
      { clip: 'gate', from: 0.3, dur: HALF, x: CUT, cards: [{ kind: 'line', text: 'No one gives orders.', at: 0.1, dur: 2 * HALF - 0.25, pos: 22 }] },
      { clip: 'shaft', from: 0.8, dur: HALF, x: CUT },
      { clip: 'granary', from: 0, dur: BAR, x: CUT, cards: [{ kind: 'line', label: 'The granary', text: 'Seeds in. Husks out.', at: 0.1, dur: BAR - 0.2, pos: 22 }] },
      { clip: 'queen', from: 0.3, dur: HALF, x: CUT },
      { clip: 'flood', from: 0.3, dur: BAR, x: CUT, mark: 'drama', hit: true, rain: true, flashes: [0.3, 0.5, 2.5], cards: [{ kind: 'line', label: 'Summer storm', text: 'Rain coming? They shut the door.', at: 0.15, dur: BAR - 0.3, pos: 22 }] },
      { clip: 'lark', from: 0.55, dur: 2.9, x: CUT, hit: true, cards: [{ kind: 'line', label: 'Crested lark', text: 'At this scale, a lark is a giant.', at: 0.15, dur: 2.6, pos: 62 }] },
      { clip: 'sleep', from: 0.2, dur: 3.4, x: 0.5, shimmer: 0.3, cards: [{ kind: 'line', label: 'December', text: 'They sleep below the frost.', at: 0.3, dur: 2.9, pos: 22 }] },
      { clip: 'reveal', from: 0, dur: 7.0, x: 0.6, title: 4.0, cards: [{ kind: 'line', text: 'Every ant simulated.<br>Every ant named.', at: 0.2, dur: 3.6, pos: 24 }] },
      { clip: 'rise', from: 0.2, dur: 1.8, x: 0.45 },
    ],
  },
  /**
   * Variant 3, "One Seed": a short loop for Reels and Stories. Words on the first
   * frame, then one forager's seed from the meadow to the granary, the lark, the title.
   */
  seed: {
    out: 'underroot-v3-one-seed',
    width: 1080,
    height: 1920,
    picture: 1920,
    look: 'clear',
    fadeIn: 0,
    loop: true,
    phone: true,
    segs: [
      { clip: 'reveal', from: 0, dur: 4.3, mark: 'build', cards: [{ kind: 'line', text: 'Every ant simulated.<br>Every ant named.', at: 0, dur: 4.1, pos: 24 }] },
      { clip: 'named', from: 0, dur: BAR, x: CUT, mark: 'life', cards: [{ kind: 'note', text: fieldNote(), at: 0.15, dur: BAR - 0.25, pos: 66 }] },
      { clip: 'trails', from: 0.3, dur: HALF, x: CUT, cards: [{ kind: 'line', text: 'No one gives orders.', at: 0.1, dur: 2 * HALF - 0.3, pos: 22 }] },
      { clip: 'gate', from: 0.3, dur: HALF, x: CUT },
      { clip: 'shaft', from: 0.8, dur: HALF, x: CUT },
      { clip: 'granary', from: 0, dur: BAR, x: CUT, cards: [{ kind: 'line', text: 'Seeds in. Husks out.', at: 0.2, dur: BAR - 0.4, pos: 22 }] },
      { clip: 'lark', from: 0.55, dur: 2.9, x: CUT, mark: 'drama', hit: true, cards: [{ kind: 'word', text: 'Giants.', at: 0.15, dur: 2.6, pos: 68 }] },
      { clip: 'finale', from: 0.6, dur: 5.6, x: 0.5, title: 1.6 },
      { clip: 'rise', from: 0.2, dur: 1.6, x: 0.45 },
    ],
  },
  tall: {
    out: 'underroot-teaser',
    width: 1080,
    height: 1920,
    picture: 1920,
    segs: [
      { clip: 'flight', from: 0.4, dur: 5.0, cards: [{ kind: 'line', text: 'One spring morning, a young <i>Messor structor</i> queen comes down from the sky.', at: 0.8, dur: 3.8 }] },
      { clip: 'founding', from: 1.0, dur: 4.4, x: 0.6, mark: 'build', cards: [{ kind: 'line', text: 'She digs. She seals herself in.<br>She waits.', at: 0.6, dur: 3.4 }] },
      { clip: 'nest', from: 0.5, dur: 4.0, x: 0.6, cards: [{ kind: 'line', text: 'Seasons pass. The colony grows.', at: 0.5, dur: 3.0 }] },
      { clip: 'forager', from: 1.0, dur: BAR, x: CUT, mark: 'life', cards: [{ kind: 'line', text: 'No one gives orders.', at: 0.3, dur: BAR + HALF - 0.5 }] },
      { clip: 'trails', from: 0.5, dur: HALF, x: CUT },
      { clip: 'entrance', from: 0.8, dur: HALF, x: CUT, cards: [{ kind: 'line', text: 'Every seed still finds its way home.', at: 0.15, dur: 2 * HALF - 0.3 }] },
      { clip: 'granary', from: 0.5, dur: HALF, x: CUT },
      { clip: 'queen', from: 0.5, dur: HALF, x: CUT },
      { clip: 'digger', from: 0.5, dur: HALF, x: CUT },
      { clip: 'carry', from: 0.5, dur: BAR, x: CUT },
      { clip: 'storm', from: 0.4, dur: BAR, x: CUT, mark: 'drama', thunder: [0.45], rain: true, cards: [{ kind: 'word', text: 'Storms.', at: 0.4, dur: 2.2 }] },
      { clip: 'night', from: 0.5, dur: 2.6, x: 0.4, night: true, cards: [{ kind: 'word', text: 'Long nights.', at: 0.3, dur: 2.0 }] },
      { clip: 'winter', from: 0.5, dur: 2.6, x: 0.4, cards: [{ kind: 'word', text: 'Winter.', at: 0.3, dur: 2.0 }] },
      { clip: 'finale', from: 0, dur: 7.5, x: 0.7, title: 2.6 },
    ],
  },
  wide: {
    out: 'underroot-trailer',
    width: 1920,
    height: 1080,
    picture: 804,
    segs: [
      { clip: 'flight', from: 0, dur: 5.45, cards: [{ kind: 'line', text: 'One spring morning, a young <i>Messor structor</i><br>queen comes down from the sky.', at: 1.0, dur: 4.0 }] },
      { clip: 'dig', from: 0.5, dur: 4.3, x: 0.7 },
      { clip: 'founding', from: 0.3, dur: 7.4, x: 0.8, cards: [{ kind: 'line', text: 'She digs. She seals herself in.<br>She waits.', at: 1.1, dur: 4.6 }] },
      { clip: 'growth', from: 0, dur: 7.8, x: 0.8, mark: 'build', cards: [{ kind: 'line', text: 'Seasons pass. The colony grows.', at: 1.2, dur: 4.6 }] },
      { clip: 'nest', from: 0, dur: 5.2, x: 0.8 },
      { clip: 'column', from: 1.0, dur: BAR, x: CUT, mark: 'life', cards: [{ kind: 'line', text: 'No one gives orders.', at: 0.35, dur: 4.9 }] },
      { clip: 'forager', from: 1.2, dur: BAR, x: CUT },
      { clip: 'entrance', from: 0.8, dur: BAR, x: CUT },
      { clip: 'shaft', from: 0.8, dur: BAR, x: CUT, cards: [{ kind: 'line', text: 'Every seed still finds its way home.', at: 0.3, dur: 4.9 }] },
      { clip: 'nursery', from: 1.0, dur: BAR, x: CUT },
      { clip: 'carry', from: 0.5, dur: BAR, x: CUT },
      { clip: 'storm', from: 0.4, dur: 4.3, x: CUT, mark: 'drama', thunder: [0.45, 3.3], rain: true, cards: [{ kind: 'word', text: 'Storms.', at: 0.7, dur: 2.6 }] },
      { clip: 'night', from: 0.5, dur: 3.6, x: 0.5, night: true, cards: [{ kind: 'word', text: 'Long nights.', at: 0.5, dur: 2.4 }] },
      { clip: 'winter', from: 0.5, dur: 3.6, x: 0.5, cards: [{ kind: 'word', text: 'Winter.', at: 0.5, dur: 2.4 }] },
      { clip: 'finale', from: 0, dur: 9.0, x: 0.9, title: 4.2 },
    ],
  },
};

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
/**
 * Bring the score to -14 LUFS (what the video platforms play at): measure it,
 * apply the gain that lands it there, and catch the few peaks that would then
 * go over with a limiter (about -1.5 dBFS).
 */
function loudnorm(src, dst, eq = 'anull') {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-af', `${eq},loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']).stderr.toString();
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const gain = (-14 - Number(m.input_i)).toFixed(2);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', `${eq},volume=${gain}dB,alimiter=limit=0.84:level=false:attack=2:release=60,aresample=48000`, '-c:a', 'pcm_s16le', dst]);
}
/**
 * For phone speakers: nothing under 90 Hz (they can't play it, and it eats the
 * loudness budget), the low end eased, a little presence. Measured on a phone
 * simulation it plays about 2.5 dB louder at the same -14 LUFS.
 */
const PHONE_EQ = 'highpass=f=90:poles=2,lowshelf=f=180:g=-5,equalizer=f=2200:t=q:w=0.8:g=4';
const probeDur = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();

async function cut(format, { cta } = {}) {
  const T = TIMELINES[format];
  const clips = join(ROOT, 'shots/film/clips', T.width > T.height ? 'wide' : 'tall');
  const work = join(ROOT, 'shots/film/work', format);
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
    // (The growth time-lapse is one frame a week, at 8 fps; `speed` plays a clip faster.)
    const fps = s.clip === 'growth' ? 8 : FPS;
    const speed = s.speed ?? 1;
    const len = probeDur(file) / speed;
    // Each shot runs a few frames past its cut, so the dissolve into the next never runs dry.
    const tail = i < T.segs.length - 1 ? 3 / FPS : 0;
    if (s.from + s.dur + tail > len + 0.02) throw new Error(`${s.clip}: needs ${(s.from + s.dur + tail).toFixed(2)} s, has ${len.toFixed(2)} s`);
    return { ...s, start, file, fps, speed, tail };
  });
  const total = t;

  // Cards.
  const cards = [];
  for (const s of segs) {
    for (const c of s.cards ?? []) cards.push({ ...c, id: `c${cards.length}`, at: s.start + c.at });
    if (s.title !== undefined) {
      // The title holds to the end, or (in a loop) until the shot after it has faded in.
      const next = segs[segs.indexOf(s) + 1];
      const until = next ? next.start + (next.x ?? 0) : total;
      cards.push({ id: 'title', kind: 'title', name: NAME, tagline: TAGLINE, cta, pos: T.height > T.width ? 46 : 50, at: s.start + s.title, dur: until - (s.start + s.title) });
    }
  }
  const pngs = await renderCards(cards, { width: T.width, height: T.height, dir: join(work, 'cards'), look: T.look ?? 'classic' });

  // The score, cued to the same cuts.
  const at = (m) => segs.find((s) => s.mark === m)?.start;
  const titleSeg = segs.find((s) => s.title !== undefined);
  const cues = {
    length: total,
    build: at('build'),
    life: at('life'),
    drama: at('drama'),
    title: titleSeg.start + titleSeg.title,
    hits: T.phone ? segs.filter((s) => s.hit).map((s) => s.start) : [at('drama')],
    thunder: segs.flatMap((s) => (s.thunder ?? []).map((d) => s.start + d)),
    rain: (() => { const s = segs.find((s) => s.rain); return s ? [s.start, s.start + s.dur] : [0, 0]; })(),
    night: (() => { const s = segs.find((s) => s.night); return s ? [s.start, s.start + s.dur] : [0, 0]; })(),
  };
  if (T.phone) {
    Object.assign(cues, {
      phone: true,
      style: T.style,
      fade_in: Math.max(0.02, T.fadeIn ?? 1.2),
      loop: !!T.loop,
      // A note on each line, a knock on each cut of the montage.
      accents: cards.filter((c) => c.kind === 'line' || c.kind === 'word').map((c) => c.at),
      cuts: segs.filter((s) => s.x === CUT && s.start > at('life') + 0.1).map((s) => s.start),
      flashes: segs.flatMap((s) => (s.flashes ?? []).map((d) => s.start + d)),
      shimmer: segs.filter((s) => s.shimmer !== undefined).map((s) => s.start + s.shimmer),
      risers: [titleSeg.start + titleSeg.title],
    });
    const fl = segs.find((s) => s.buzz);
    if (fl) cues.buzz = [fl.start, fl.start + fl.dur];
  }
  writeFileSync(join(work, 'cues.json'), JSON.stringify(cues, null, 1));
  const raw = join(work, 'score-raw.wav');
  const wav = join(work, 'score.wav');
  sh('python3', [join(ROOT, 'scripts/film/score.py'), join(work, 'cues.json'), raw]);
  loudnorm(raw, wav, T.phone ? PHONE_EQ : 'anull');

  // The picture: trims, dissolves, letterbox, grade, cards, fades.
  const inputs = [];
  const f = [];
  segs.forEach((s, i) => {
    inputs.push('-i', s.file);
    const fast = s.speed !== 1 ? `setpts=PTS/${s.speed},` : '';
    const slow = s.fps * s.speed < FPS ? `framerate=fps=${FPS}:interp_start=0:interp_end=255:scene=100,` : '';
    const extra = s.filter ? `${s.filter},` : '';
    f.push(`[${i}:v]${fast}${slow}fps=${FPS},${extra}trim=start=${s.from.toFixed(4)}:duration=${(s.dur + s.tail).toFixed(4)},setpts=PTS-STARTPTS,format=yuv420p,settb=AVTB[s${i}]`);
  });
  let last = 's0';
  segs.slice(1).forEach((s, k) => {
    const i = k + 1;
    f.push(`[${last}][s${i}]xfade=transition=fade:duration=${(s.x ?? CUT).toFixed(4)}:offset=${s.start.toFixed(4)}[x${i}]`);
    last = `x${i}`;
  });
  const pad = T.picture < T.height ? `,pad=${T.width}:${T.height}:0:${(T.height - T.picture) / 2}:black` : '';
  // A light grade: a touch more contrast and warmth, the shadows lifted a hair.
  // (The variants also lift the black of the unexplored soil a little, so it reads as soil in the dark, not a hole.)
  const lift = T.phone ? `,curves=master='0/0.045 0.25/0.27 1/1'` : '';
  f.push(`[${last}]eq=contrast=1.06:saturation=1.08:gamma=1.04,colorbalance=rs=0.02:bs=-0.02:rh=0.02:bh=-0.03${lift}${pad},format=yuva420p[base]`);
  last = 'base';
  const n0 = segs.length;
  cards.forEach((c, k) => {
    const i = n0 + k;
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', c.dur.toFixed(3), '-i', pngs[c.id]);
    const fin = c.kind === 'title' ? (T.loop ? 0.5 : 1.4) : T.phone ? 0.35 : 0.6;
    const fout = c.kind === 'title' ? (T.loop ? 0.45 : 0.01) : T.phone ? 0.4 : 0.7;
    f.push(`[${i}:v]format=rgba,fade=t=in:st=0:d=${fin}:alpha=1,fade=t=out:st=${(c.dur - fout).toFixed(3)}:d=${fout}:alpha=1,setpts=PTS+${c.at.toFixed(3)}/TB[c${k}]`);
    f.push(`[${last}][c${k}]overlay=0:0:eof_action=pass[o${k}]`);
    last = `o${k}`;
  });
  // A loop has no fades: its last frame cuts straight back to its first.
  const fades = T.loop ? '' : `fade=t=in:st=0:d=${T.fadeIn ?? 1.2},fade=t=out:st=${(total - 1.6).toFixed(3)}:d=1.6,`;
  f.push(`[${last}]${fades}format=yuv420p[v]`);
  const ai = inputs.filter((a) => a === '-i').length;
  inputs.push('-i', wav);
  f.push(`[${ai}:a]anull[a]`);

  const out = join(outDir, `${T.out}.mp4`);
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
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', Math.min(total - 0.5, titleSeg.start + titleSeg.title + 1.4).toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '2', poster]);
  // The teaser also comes at Instagram's own rate (it re-encodes uploads anyway): about 6 Mbps, a third the size.
  if (T.height > T.width) {
    const ig = out.replace(/\.mp4$/, '-instagram.mp4');
    const log = join(work, 'x264pass');
    sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-c:v', 'libx264', '-preset', 'slow', '-b:v', '6M', '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '/dev/null']);
    sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-c:v', 'libx264', '-preset', 'slow', '-b:v', '6M', '-maxrate', '9M', '-bufsize', '12M', '-pass', '2', '-passlogfile', log,
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', ig]);
    console.log(ig);
  }
  console.log(`${out}  (${total.toFixed(1)} s)`);
  return out;
}

const args = process.argv.slice(2);
const ctaAt = args.indexOf('--cta');
const cta = ctaAt >= 0 ? args[ctaAt + 1] : undefined;
const formats = args.filter((a, i) => a in TIMELINES && i !== (ctaAt >= 0 ? ctaAt + 1 : -1));
for (const format of formats.length ? formats : ['tall']) await cut(format, { cta });
