import type { Game } from '../main';
import { CSS } from './style';
import { WORK, Work, Task, ChamberKind } from '../sim/types';
import type { Ant } from '../sim/ant';
import type { Chamber } from '../sim/nest';
import { SPEEDS, TICK_HZ, DAY_TICKS, TUNING } from '../config';
import { ZONE_TINT } from '../render/palette';
import { savedMeta } from '../sim/save';
import { t, num, getLang, setLang, Lang, Vars } from './i18n';
import { metabolism } from '../sim/calendar';
import type { Sim } from '../sim/sim';
import { ICON, LOGO_ANT } from './icons';
import { SITES, SITE_IDS } from '../world/sites';
import { TWIG, BERRY, FLOWER, SEEDHEAD, FRUIT, PREY, STONE, LITTER, SEED, EMPTY, SAND } from '../world/mat';
import { PACKED, PLUG } from '../world/physics';

export type Mode = 'watch' | 'guide';
const MODE_KEY = 'underfoot.mode';
/** Scale-bar lengths to choose from, in mm. */
const SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100];

const WORK_TASK: Record<Work, number> = { dig: Task.Dig, forage: Task.Forage, nurse: Task.Nurse, clean: Task.Clean };
/** One in-game hour, in ticks. */
const HOUR = DAY_TICKS / 24;
/** A second click this soon after the first is one double-click, not a confirmation. */
const CONFIRM_DELAY_MS = 450;
/**
 * Below this many days of food the colony is warned. Healthy colonies live
 * hand to mouth at around half a day, so the line sits lower than that.
 */
const LOW_FOOD_DAYS = 0.25;

/** A line in the field journal. Old saves hold `html`; new entries are re-worded in the current language. */
interface Entry {
  at: string;
  tick?: number;
  key?: string;
  vars?: Vars;
  loc?: { x: number; y: number };
  html?: string;
}

const h = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** Is there room to open the brain without hiding the slice (not a phone, upright or sideways)? */
const roomy = (): boolean => innerWidth >= 760 && innerHeight > 500;

/** "June · week 2" for the current calendar date. */
export const dateText = (sim: Sim): string => {
  const doy = sim.doy;
  return t('dateLine', { month: t(`m${sim.cal.month(doy)}`), w: sim.cal.weekOfMonth(doy) });
};

const clockText = (sim: Sim): string => {
  const mins = Math.floor(sim.dayT * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

/** "Jun 2 · 08:48": a journal time stamp. */
const stampText = (sim: Sim): string => {
  const doy = sim.doy;
  return `${t('dateShort', { m: t(`ms${sim.cal.month(doy)}`), w: sim.cal.weekOfMonth(doy) })} · ${clockText(sim)}`;
};

const depthCm = (c: Chamber, ground: Int16Array): string => num((c.floorY - ground[Math.round(c.cx)]!) / 10);

/**
 * The HUD and the colony brain. Mode B: the player never commands an ant.
 * They set what the colony cares about and where it should grow.
 */
/** The name key of a cell's material (loose spoil, a plug, a find told apart by their marks). */
function matKey(m: number, tint: number): string {
  if (m === SAND) return tint & PLUG ? 'plug' : tint & PACKED ? 'packed' : 'spoil';
  return MAT_KEYS[m] ?? 'soil';
}

/** Hover-card things that are the cell itself (not an animal or plant on it). */
const CELL_THINGS = new Set(['fruit', 'nymph', 'deadBeetle', 'deadHopper', 'deadWorm', 'shard', 'bone', 'leaf']);

const MAT_KEYS = ['air', 'humus', 'loam', 'clay', 'subsoil', 'gravel', 'stone', 'root', 'spoil', 'water', 'stem', 'leaf', 'flower', 'seedhead', 'seed', 'refuse', 'litter', 'fruit', 'bedrock', 'sandy', 'lime', 'rock', 'wood', 'twig', 'berry', 'prey'];

export class UI {
  /** Panels hidden for a clean frame (H); the documentary caption stays. */
  cinema = false;
  /** Watch: the colony runs itself. Guide: the player is the colony brain. */
  mode: Mode = 'watch';
  /** The title screen's question has been answered (or a colony resumed). */
  private modeChosen = false;
  private roomSig = '';
  private skySig = '';
  private game: Game;
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private spark!: HTMLCanvasElement;
  private markerMode = false;
  private lastPhase = '';
  private refresh = 0;
  private pointer = { x: 0, y: 0, inside: false };
  private journal: Entry[] = [];
  private notesOpen = false;
  private milestone = 0;
  private notedChambers = new Set<number>();
  private restNoted = false;
  private firstStore = false;
  private firstMajor = false;
  private drowned = 0;
  private larvaeLost = 0;
  private starvedDay = -1;
  private lowFoodDay = -1;
  private wingsNoted = false;
  private replaceArmedAt = 0;
  private pluggedNoted = false;
  private followed: Ant | null = null;
  private lifeCardUntil = 0;
  private queueSig = '';

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    try {
      if (localStorage.getItem(MODE_KEY) === 'guide') this.mode = 'guide';
    } catch {
      // no storage: watch
    }
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.build();
    this.bindInput(game.renderer.canvas);
  }

  // ------------------------------------------------------------------ building

  private build(): void {
    const r = this.root;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    // --- field card
    const card = h('div', 'panel');
    card.id = 'card';
    card.innerHTML = `
      <div class="brand">${LOGO_ANT}<span class="wordmark-s">Underfoot</span></div>
      <div class="species">${t(`site_${this.game.sim.site}`)}</div>
      <div class="cname" id="cname"></div>
      <div class="specimen">${t('colonyNo', { n: String(this.game.sim.seed).padStart(4, '0') })}</div>
      <div class="pop"><b id="pop">0</b><span>${t('workers')}</span></div>
      <div class="grid">
        <div><span class="eyebrow">${t('majors')}</span><b id="maj">0</b></div>
        <div><span class="eyebrow">${t('brood')}</span><b id="brood">0</b></div>
        <div><span class="eyebrow">${t('seeds')}</span><b id="food">0</b><small id="fooddays"></small></div>
      </div>`;
    this.spark = document.createElement('canvas');
    this.spark.width = 440;
    this.spark.height = 76;
    card.appendChild(this.spark);
    card.appendChild(h('div', 'sparkkey', `<span><i class="k-pop"></i>${t('sparkWorkers')}</span><span><i class="k-food"></i>${t('sparkSeeds')}</span>`));
    card.appendChild(h('div', 'clock', `<span id="skyico"></span><span id="day"></span><span id="time"></span>`));
    card.appendChild(h('div', 'clock sub', `<span id="year"></span><span id="sky"></span>`));
    const legend = h('div', 'legend');
    for (const [kind, key] of [['queen', 'legendQueen'], ['nursery', 'legendNursery'], ['granary', 'legendGranary'], ['rest', 'legendRest']] as const) {
      const c = ZONE_TINT[kind]!;
      legend.appendChild(h('span', '', `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>${t(key)}`));
    }
    card.appendChild(legend);
    const notes = h('div', 'notes', `<div class="notes-head"><span class="eyebrow">${ICON.journal}${t('fieldNotes')}</span><button class="collapse" id="notes-all">${this.notesOpen ? t('notesLess') : t('notesAll')}</button></div><ol id="notes"></ol>`);
    notes.classList.toggle('open', this.notesOpen);
    card.appendChild(notes);
    (notes.querySelector('#notes-all') as HTMLElement).onclick = () => {
      this.notesOpen = !this.notesOpen;
      notes.classList.toggle('open', this.notesOpen);
      (notes.querySelector('#notes-all') as HTMLElement).textContent = this.notesOpen ? t('notesLess') : t('notesAll');
      this.renderNotes();
    };
    // Journal lines with a place on them take the camera there.
    (notes.querySelector('#notes') as HTMLElement).onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-loc]') as HTMLElement | null;
      if (!b) return;
      const [x, y] = b.dataset.loc!.split(',').map(Number);
      this.lookAt(x!, y!);
    };
    r.appendChild(card);

    // --- one-line strip for phones (the card is hidden there)
    r.appendChild(h('div', '', `${ICON.ant}<b id="s-pop">0</b><span id="s-brood"></span><span id="s-food"></span><span id="s-day"></span>`)).id = 'strip';

    // --- colony brain
    const brain = h('div', 'panel');
    brain.id = 'brain';
    brain.innerHTML = `<button class="collapse" id="collapse"></button><div class="title">${t('brainTitle')}</div>
      <div id="dormant">${t('brainDormant')}</div>
      <div class="body">
      <div class="hint" style="margin-top:4px">${t('brainIntro')}</div>
      <h3 class="eyebrow">${t('workPriorities')}</h3><div id="work"></div>
      <h3 class="eyebrow">${t('queen')}</h3>
      <div class="row"><label>${t('breeding')}</label><div class="seg" id="breed"></div></div>
      <div class="subline" id="broodtrend"></div>
      <div class="row slider"><label>${t('majorsLabel')}</label><input type="range" id="majors" min="0" max="35" step="1"><span id="majval"></span></div>
      <h3 class="eyebrow">${t('nest')}</h3>
      <div class="btns">
        <button class="btn" data-order="nursery">${t('order_nursery')}</button>
        <button class="btn" data-order="granary">${t('order_granary')}</button>
        <button class="btn" data-order="rest">${t('order_rest')}</button>
        <button class="btn" id="deeper">${t('digDeeper')}</button>
      </div>
      <div class="btns" style="margin-top:6px; grid-template-columns: 1fr;"><button class="btn" id="mark"></button></div>
      <div class="queue" id="queue"></div>
      <div class="hint">${t('planHint')}</div>
      <h3 class="eyebrow">${t('sandbox')}</h3>
      <div class="btns"><button class="btn" id="rain">${t('bringRain')}</button><button class="btn" id="storm">${t('storm')}</button></div>
      <div class="hint">${t('sandboxHint')}</div>
      </div>`;
    r.appendChild(brain);
    const work = brain.querySelector('#work')!;
    for (const wk of WORK) {
      const row = h('div', 'row', `<label>${ICON[wk]}${t('work_' + wk)}</label>`);
      row.id = `row-${wk}`;
      const seg = h('div', 'seg');
      for (let i = 0; i < 4; i++) {
        const b = h('button', '', t('prio' + i));
        b.onclick = () => {
          this.game.sim.colony.prio[wk] = i;
          this.syncBrain();
        };
        b.dataset.k = `${wk}:${i}`;
        seg.appendChild(b);
      }
      row.appendChild(seg);
      work.appendChild(row);
      const share = h('div', 'share', '<div class="track"><i></i></div><span></span>');
      share.id = `share-${wk}`;
      work.appendChild(share);
    }
    const breed = brain.querySelector('#breed')!;
    for (let i = 0; i < 3; i++) {
      const b = h('button', '', t('breed' + i));
      b.onclick = () => {
        this.game.sim.colony.breeding = i;
        this.syncBrain();
      };
      breed.appendChild(b);
    }
    const majors = brain.querySelector('#majors') as HTMLInputElement;
    majors.oninput = () => {
      this.game.sim.colony.majorShare = Number(majors.value) / 100;
      this.syncBrain();
    };
    brain.querySelectorAll<HTMLElement>('[data-order]').forEach((b) => {
      b.onclick = () => this.order(b.dataset.order as ChamberKind);
    });
    (brain.querySelector('#deeper') as HTMLElement).onclick = () => this.deeper();
    (brain.querySelector('#mark') as HTMLElement).onclick = () => {
      if (this.game.sim.phase === 'choose') {
        this.toast(t('markWait'));
        return;
      }
      this.markerMode = !this.markerMode;
      this.syncBrain();
    };
    (brain.querySelector('#queue') as HTMLElement).onclick = (e) => {
      const el = e.target as HTMLElement;
      const q = el.closest('[data-q]') as HTMLElement | null;
      const col = this.game.sim.colony;
      if (q) {
        col.orders.splice(Number(q.dataset.q), 1);
        this.syncBrain();
      } else if (el.closest('[data-m]')) {
        this.game.sim.nest.marker = null;
        this.toast(t('markerRemoved'));
        this.syncBrain();
      }
    };
    (brain.querySelector('#rain') as HTMLElement).onclick = () => this.game.sim.startRain(false);
    (brain.querySelector('#storm') as HTMLElement).onclick = () => this.game.sim.startRain(true);
    (brain.querySelector('#collapse') as HTMLElement).onclick = () => {
      brain.classList.toggle('collapsed');
      this.syncCollapse();
    };
    // Narrow screens start with the brain folded so the slice stays visible.
    if (innerWidth < 1500) brain.classList.add('collapsed');

    // --- the colony, read-only (watch mode): what it is doing, its brood, its rooms
    const colony = h('div', 'panel');
    colony.id = 'colony';
    const trow = (k: string, label: string): string =>
      `<div class="trow"><span class="tl">${ICON[k as keyof typeof ICON]}${label}</span><div class="track"><i id="ct-${k}"></i></div><b id="cn-${k}">0</b></div>`;
    colony.innerHTML = `<button class="collapse" id="ccollapse"></button><div class="title">${t('colonyTitle')}</div>
      <div id="cdormant">${t('colonyDormant')}</div>
      <div class="body">
      <div class="hint" style="margin-top:4px">${t('colonyIntro')}</div>
      <h3 class="eyebrow">${t('doingNow')}</h3>
      ${['dig', 'forage', 'nurse', 'clean'].map((k) => trow(k, t('work_' + k))).join('')}${trow('idle', t('work_idle'))}
      <h3 class="eyebrow">${t('brood')}</h3>
      <div class="broodrow"><span>${ICON.egg}<b id="cb-e">0</b> ${t('eggs')}</span><span>${ICON.larva}<b id="cb-l">0</b> ${t('larvae')}</span><span>${ICON.pupa}<b id="cb-p">0</b> ${t('pupae')}</span><span id="cb-t"></span><span id="cb-a"></span></div>
      <h3 class="eyebrow">${t('rooms')}</h3>
      <div id="crooms"></div>
      </div>`;
    r.appendChild(colony);
    (colony.querySelector('#ccollapse') as HTMLElement).onclick = () => {
      colony.classList.toggle('collapsed');
      this.syncCollapse();
    };
    (colony.querySelector('#crooms') as HTMLElement).onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-loc]') as HTMLElement | null;
      if (!b) return;
      const [x, y] = b.dataset.loc!.split(',').map(Number);
      this.lookAt(x!, y!);
    };
    if (innerWidth < 1200 || !roomy()) colony.classList.add('collapsed');

    // --- time bar
    const bar = h('div', 'panel');
    bar.id = 'bar';
    const speeds = h('div', 'seg');
    speeds.id = 'speeds';
    const pause = h('button', '', ICON.pause);
    pause.title = t('keySpeed');
    pause.onclick = () => {
      this.game.paused = !this.game.paused;
      this.syncBar();
    };
    speeds.appendChild(pause);
    SPEEDS.forEach((s, i) => {
      const b = h('button', '', `${s}×`);
      b.onclick = () => {
        this.game.setSpeed(i);
        this.syncBar();
      };
      speeds.appendChild(b);
    });
    bar.appendChild(speeds);
    const zoom = h('div', 'seg');
    const zin = h('button', '', ICON.zoomIn);
    const zout = h('button', '', ICON.zoomOut);
    const zfit = h('button', '', `${ICON.fit}<span class="lbl">${t('fit')}</span>`);
    zfit.title = t('titleFit');
    const manual = (): void => {
      if (this.game.director.active) this.game.director.stop();
    };
    zin.onclick = () => {
      manual();
      this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1.5);
    };
    zout.onclick = () => {
      manual();
      this.game.cam.zoomAt(this.game.cam.screenW / 2, this.game.cam.screenH / 2, 1 / 1.5);
    };
    zfit.onclick = () => {
      manual();
      this.game.selected = null;
      this.game.fitKnown();
    };
    zoom.append(zout, zin, zfit);
    bar.appendChild(zoom);
    // Views: the toggles that also have keys, so they can be found (and used on touch).
    const views = h('div', 'seg');
    views.id = 'views';
    const view = (id: string, icon: string, label: string, title: string, fn: () => void): void => {
      const b = h('button', '', label ? `${icon}<span class="lbl">${label}</span>` : icon);
      b.id = id;
      b.title = title;
      b.onclick = fn;
      views.appendChild(b);
    };
    view('watch', ICON.camera, t('watch'), t('titleWatch'), () => this.game.director.toggle());
    view('v-plan', ICON.plan, t('plan'), t('titlePlan'), () => this.togglePlan());
    view('v-trails', ICON.trails, t('trails'), t('titleTrails'), () => this.toggleTrails());
    view('v-hide', ICON.hide, t('hidePanels'), t('titleHide'), () => this.toggleCinema());
    view('help-btn', ICON.help, '', t('titleKeys'), () => {
      this.els.keys!.hidden = !this.els.keys!.hidden;
    });
    bar.appendChild(views);
    const perf = h('div', 'perf');
    perf.id = 'perf';
    bar.appendChild(perf);
    r.appendChild(bar);

    // --- inspector, prompt, toasts, tooltip, game over, keys, caption
    const insp = h('div', 'panel');
    insp.id = 'inspect';
    r.appendChild(insp);
    // What is under the pointer, always in the corner (soil, depth, damp, warmth).
    const here = h('div');
    here.id = 'here';
    r.appendChild(here);
    const prompt = h('div', 'panel');
    prompt.id = 'prompt';
    prompt.innerHTML = `<div class="eyebrow">${t('nuptialFlight')}</div><h2>${t('whereLand')}</h2><p>${t(coarse ? 'landHelpTouch' : 'landHelp')}</p>
      <div class="prompt-btns"><button class="btn ghost" id="prompt-back">${ICON.back}${t('back')}</button><button class="btn" id="anywhere">${t('letHerChoose')}</button></div>`;
    r.appendChild(prompt);
    (prompt.querySelector('#prompt-back') as HTMLElement).onclick = () => {
      this.modeChosen = false;
      this.applyPhase(this.game.sim.phase);
    };

    // --- title: the first question is how to be with the colony
    const title = h('div');
    title.id = 'title';
    const lang0 = getLang();
    title.innerHTML = `<div class="inner">
      <div class="logo">${LOGO_ANT}</div>
      <h1 class="wordmark">Underfoot</h1>
      <div class="tagline">${t('tagline')}</div>
      <div class="latin"><i>Messor structor</i><span>·</span>${t('scaleNote')}</div>
      <div class="modes">
        <button class="mode${this.mode === 'watch' ? ' last' : ''}" data-mode="watch">${ICON.eye}<h3>${t('modeWatch')}</h3><p>${t('modeWatchD')}</p></button>
        <button class="mode${this.mode === 'guide' ? ' last' : ''}" data-mode="guide">${ICON.brain}<h3>${t('modeGuide')}</h3><p>${t('modeGuideD')}</p></button>
      </div>
      <button class="btn on" id="resume" hidden></button>
      ${this.siteCard()}
      <div class="title-foot">
        <div class="seg" id="tlang"><button data-lang="en" class="${lang0 === 'en' ? 'on' : ''}">EN</button><button data-lang="tr" class="${lang0 === 'tr' ? 'on' : ''}">TR</button></div>
      </div></div>`;
    r.appendChild(title);
    title.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => {
      b.onclick = () => {
        // A saved colony would be replaced: ask first (a real second click).
        if (savedMeta()) {
          const now = performance.now();
          if (!this.replaceArmedAt || now - this.replaceArmedAt > 6000) {
            this.replaceArmedAt = now;
            this.toast(t('replaceSave'), 6000);
            return;
          }
          if (now - this.replaceArmedAt < CONFIRM_DELAY_MS) return;
        }
        this.setMode(b.dataset.mode as Mode, false);
        this.modeChosen = true;
        this.applyPhase(this.game.sim.phase);
        this.beginLanding();
      };
    });
    title.querySelectorAll<HTMLElement>('#tlang [data-lang]').forEach((b) => {
      b.onclick = () => {
        setLang(b.dataset.lang as Lang);
        this.rebuild();
      };
    });
    (title.querySelector('#newsite') as HTMLElement).onclick = () => {
      this.game.newWorld(Math.floor(Math.random() * 1e6), this.game.sim.site);
      this.rebuild();
    };
    title.querySelectorAll<HTMLElement>('[data-site-step]').forEach((b) => {
      b.onclick = () => {
        const k = SITE_IDS.indexOf(this.game.sim.site);
        const next = SITE_IDS[(k + Number(b.dataset.siteStep) + SITE_IDS.length) % SITE_IDS.length]!;
        this.game.newWorld(this.game.sim.seed, next);
        this.rebuild();
      };
    });
    const meta = savedMeta();
    const resume = title.querySelector('#resume') as HTMLButtonElement;
    if (meta) {
      resume.hidden = false;
      resume.textContent = t('continueColony', { d: meta.day, n: meta.adults });
      resume.onclick = async () => {
        resume.textContent = t('opening');
        if (await this.game.resume()) {
          this.modeChosen = true;
          this.applyPhase(this.game.sim.phase);
          this.toast(t('welcomeBack'));
        }
        else {
          resume.textContent = t('saveBroken');
          this.game.clearSave();
        }
      };
    }
    (prompt.querySelector('#anywhere') as HTMLElement).onclick = () => this.beginLanding();
    const toasts = h('div');
    toasts.id = 'toasts';
    r.appendChild(toasts);
    const tip = h('div');
    tip.id = 'tip';
    r.appendChild(tip);
    const over = h('div', 'panel');
    over.id = 'over';
    r.appendChild(over);
    // Season title card and the year's review.
    const season = h('div');
    season.id = 'season';
    r.appendChild(season);
    const review = h('div', 'panel');
    review.id = 'review';
    r.appendChild(review);
    // Captions and the skip button of the landing sequence and the founding montage.
    const cineline = h('div');
    cineline.id = 'cineline';
    r.appendChild(cineline);
    const cinedate = h('div');
    cinedate.id = 'cinedate';
    r.appendChild(cinedate);
    const skip = h('button', 'btn ghost', t('cineSkip'));
    skip.id = 'cineskip';
    skip.onclick = () => this.game.cine.skip();
    r.appendChild(skip);
    const keys = h('div', 'panel');
    keys.id = 'keys';
    keys.hidden = true;
    const lang = getLang();
    keys.innerHTML = `<div class="eyebrow">${t('keysTitle')}</div><dl>
      <dt>${t('keyDrag')}</dt><dd>${t('keyDragD')}</dd>
      <dt>${t('keyClick')}</dt><dd>${t('keyClickD')}</dd>
      <dt>${t('keySpeed')}</dt><dd>${t('keySpeedD')}</dd>
      <dt>C</dt><dd>${t('keyC')}</dd>
      <dt>P</dt><dd>${t('keyP')}</dd>
      <dt>T</dt><dd>${t('keyT')}</dd>
      <dt>H</dt><dd>${t('keyH')}</dd>
      <dt>F</dt><dd>${t('keyF')}</dd></dl>
      <div class="row langrow"><label>${t('modeLabel')}</label><div class="seg" id="modeseg">
        <button data-mode="watch" class="${this.mode === 'watch' ? 'on' : ''}">${t('modeWatch')}</button><button data-mode="guide" class="${this.mode === 'guide' ? 'on' : ''}">${t('modeGuide')}</button></div></div>
      <div class="row langrow"><label>${t('language')}</label><div class="seg" id="lang">
        <button data-lang="en" class="${lang === 'en' ? 'on' : ''}">English</button><button data-lang="tr" class="${lang === 'tr' ? 'on' : ''}">Türkçe</button></div></div>
      <button class="btn" id="new-colony">${t('newColony')}</button>`;
    r.appendChild(keys);
    keys.querySelectorAll<HTMLElement>('#modeseg [data-mode]').forEach((b) => {
      b.onclick = () => {
        this.setMode(b.dataset.mode as Mode, true);
        keys.querySelectorAll<HTMLElement>('#modeseg [data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    keys.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => {
      b.onclick = () => {
        setLang(b.dataset.lang as Lang);
        this.rebuild();
        this.els.keys!.hidden = false;
      };
    });
    // Starting over discards the colony: it takes a second, separate click.
    const fresh = keys.querySelector('#new-colony') as HTMLButtonElement;
    let armedAt = 0;
    fresh.onclick = () => {
      const now = performance.now();
      if (armedAt && now - armedAt > CONFIRM_DELAY_MS) {
        this.game.clearSave();
        location.reload();
        return;
      }
      if (armedAt) return;
      armedAt = now;
      fresh.textContent = t('newColonyConfirm');
      fresh.classList.add('danger');
      setTimeout(() => {
        armedAt = 0;
        fresh.textContent = t('newColony');
        fresh.classList.remove('danger');
      }, 4000);
    };
    const caption = h('div', '', `<div class="eyebrow">${t('watching')}</div><div class="line"></div>`);
    caption.id = 'caption';
    r.appendChild(caption);
    const exit = h('button', 'btn', t('showPanels'));
    exit.id = 'cinema-exit';
    exit.onclick = () => this.toggleCinema();
    r.appendChild(exit);
    // Winter rest: a quiet band while the months go by quickly.
    const winter = h('div', 'panel', `<span class="wico">❄</span><span>${t('winterSkip')}</span><button class="linkbtn" id="winter-btn"></button>`);
    winter.id = 'winter';
    r.appendChild(winter);
    (winter.querySelector('#winter-btn') as HTMLElement).onclick = () => {
      this.game.winterSkip = !this.game.winterSkip;
      this.syncWinter();
    };
    const scale = h('div', '', '<i></i><span></span>');
    scale.id = 'scale';
    r.appendChild(scale);

    for (const id of ['cinedate', 'cineline', 'cineskip', 'season', 'review', 'cname', 'title', 'colony', 'scale', 'skyico', 'year', 'winter', 'crooms', 'cb-e', 'cb-l', 'cb-p', 'cb-t', 'cb-a', 'pop', 'maj', 'brood', 'food', 'fooddays', 'day', 'sky', 'time', 'queue', 'perf', 'inspect', 'here', 'prompt', 'toasts', 'tip', 'over', 'brain', 'mark', 'notes', 'caption', 'watch', 'keys', 'broodtrend', 'majval', 's-pop', 's-brood', 's-food', 's-day', 'v-plan', 'v-trails']) {
      this.els[id] = r.querySelector(`#${id}`) as HTMLElement;
    }
    this.syncCollapse();
    this.syncBrain();
    this.syncBar();
    this.renderNotes();
    this.applyPhase(this.game.sim.phase);
  }

  /** The title's site card: where this is, which ant, and what is special about this map. */
  private siteCard(): string {
    const sim = this.game.sim;
    const id = sim.site;
    const sp = SITES[id].species;
    const species = t(sp === 'group' ? 'speciesGroup' : sp === 'muticus' ? 'speciesMuticus' : 'speciesStructor');
    const traits = sim.variant.traits
      .map((tr) => `<li class="${tr.sign > 0 ? 'pro' : tr.sign < 0 ? 'con' : 'neu'}"><b>${tr.sign > 0 ? '+' : tr.sign < 0 ? '−' : '·'}</b>${t(tr.key)}</li>`)
      .join('');
    return `<div class="sitecard">
      <button class="sitenav" data-site-step="-1" title="${t('prevSite')}">${ICON.back}</button>
      <div class="siteinfo">
        <div class="sitename">${t(`site_${id}`)}</div>
        <div class="sitedesc">${t(`site_${id}D`)}</div>
        <div class="sitesp"><i>${species}</i><span>·</span>${t('siteLabel', { n: String(sim.seed).padStart(4, '0') })}<button class="linkbtn" id="newsite">${ICON.dice}${t('newSite')}</button></div>
        ${traits ? `<ul class="traits">${traits}</ul>` : ''}
      </div>
      <button class="sitenav next" data-site-step="1" title="${t('nextSite')}">${ICON.back}</button>
    </div>`;
  }

  /** Rebuild every panel (after a language change), keeping the state. */
  private rebuild(): void {
    const tipShown = this.els.keys && !this.els.keys.hidden;
    const folded = this.els.brain?.classList.contains('collapsed');
    const cfolded = this.els.colony?.classList.contains('collapsed');
    this.root.innerHTML = '';
    this.els = {};
    this.queueSig = '';
    this.roomSig = '';
    this.skySig = '';
    this.build();
    this.els.brain!.classList.toggle('collapsed', !!folded);
    this.els.colony!.classList.toggle('collapsed', !!cfolded);
    this.syncCollapse();
    if (this.game.sim.phase === 'failed') this.showOver();
    if (tipShown) this.els.keys!.hidden = false;
  }

  private syncCollapse(): void {
    for (const [id, btn] of [['brain', '#collapse'], ['colony', '#ccollapse']] as const) {
      const panel = this.els[id] ?? (this.root.querySelector(`#${id}`) as HTMLElement | null);
      if (!panel) continue;
      (panel.querySelector(btn) as HTMLElement).textContent = panel.classList.contains('collapsed') ? t('show') : t('hide');
    }
  }

  /**
   * Watch leaves the colony to itself (any steering is cleared); Guide hands
   * the player the colony brain. Remembered for the next colony.
   */
  setMode(mode: Mode, announce: boolean): void {
    const changed = mode !== this.mode;
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // not remembered
    }
    if (mode === 'watch') {
      this.game.sim.colony.resetSettings();
      this.game.sim.nest.marker = null;
      this.markerMode = false;
    }
    this.root.classList.toggle('m-watch', mode === 'watch');
    this.root.classList.toggle('m-guide', mode === 'guide');
    this.syncBrain();
    if (announce && changed) this.toast(t(mode === 'watch' ? 'toWatch' : 'toGuide'));
  }

  /** Panel visibility that follows the phase (no journal side effects). */
  private applyPhase(phase: string): void {
    for (const p of ['choose', 'founding', 'growing', 'failed']) this.root.classList.toggle(`ph-${p}`, phase === p);
    const titled = phase === 'choose' && !this.modeChosen;
    this.root.classList.toggle('titled', titled);
    this.els.title!.style.display = titled ? 'flex' : 'none';
    // (No more picking the landing spot: she chooses it herself, in the landing sequence.)
    this.els.prompt!.style.display = 'none';
    this.root.classList.toggle('m-watch', this.mode === 'watch');
    this.root.classList.toggle('m-guide', this.mode === 'guide');
    // The brain only does something once there are workers to weigh it.
    this.els.brain!.classList.toggle('dormant', phase !== 'growing');
    this.els.colony!.classList.toggle('dormant', phase !== 'growing');
  }

  // ------------------------------------------------------------------ messages

  toast(html: string, ms = 5200): void {
    const box = this.els.toasts!;
    while (box.children.length >= 3) box.firstElementChild!.remove();
    const el = h('div', 'toast', html);
    el.style.animationDuration = `${ms / 1000}s`;
    box.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /** The journal and what it has already noted, for saving with the colony. */
  journalData(): unknown {
    return {
      entries: this.journal,
      milestone: this.milestone,
      chambers: [...this.notedChambers],
      restNoted: this.restNoted,
      firstStore: this.firstStore,
      firstMajor: this.firstMajor,
      drowned: this.drowned,
      larvae: this.larvaeLost,
      mode: this.mode,
    };
  }

  /** After loading a saved colony: put the journal back and resync the panels. */
  restore(data: unknown): void {
    const d = data as
      | { entries?: Entry[]; milestone?: number; chambers?: number[]; restNoted?: boolean; firstStore?: boolean; firstMajor?: boolean; drowned?: number; larvae?: number; mode?: Mode }
      | undefined;
    const col = this.game.sim.colony;
    this.journal = d?.entries ?? [];
    this.milestone = d?.milestone ?? 0;
    this.notedChambers = new Set(d?.chambers ?? []);
    this.restNoted = d?.restNoted ?? true;
    this.firstStore = d?.firstStore ?? false;
    this.firstMajor = d?.firstMajor ?? false;
    this.drowned = d?.drowned ?? col.deaths['brood drowned'] ?? 0;
    this.larvaeLost = d?.larvae ?? col.deaths['larva starved'] ?? 0;
    this.wingsNoted = true;
    // Saves from before the title screen were all steered colonies.
    this.mode = d?.mode ?? 'guide';
    this.modeChosen = true;
    this.lastPhase = this.game.sim.phase;
    this.applyPhase(this.lastPhase);
    this.renderNotes();
    this.syncBrain();
  }

  /**
   * Write a journal entry (and optionally pop it up). With `merge`, a repeat of
   * the last entry within two in-game hours updates it instead of adding a line.
   */
  note(key: string, vars?: Vars, opts: { toast?: boolean; loc?: { x: number; y: number }; merge?: boolean } = {}): void {
    const sim = this.game.sim;
    const last = this.journal[this.journal.length - 1];
    if (opts.merge && last && last.key === key && last.tick !== undefined && sim.tick - last.tick < HOUR * 2) {
      if (vars && typeof vars.n === 'number' && typeof last.vars?.n === 'number') vars = { ...vars, n: last.vars.n + vars.n };
      last.vars = vars;
    } else {
      const at = stampText(sim);
      this.journal.push({ at, tick: sim.tick, key, vars, loc: opts.loc });
      if (this.journal.length > 80) this.journal.shift();
    }
    this.renderNotes();
    if (opts.toast) this.toast(this.entryText({ at: '', key, vars }));
  }

  /** The last n journal lines as plain text (for tests and the play-test harness). */
  journalLines(n = 10): string[] {
    return this.journal.slice(-n).map((e) => `${e.at} ${this.entryText(e).replace(/<[^>]+>/g, '')}`);
  }

  private entryText(e: Entry): string {
    if (e.key) {
      const v = e.vars?.kind ? { ...e.vars, kind: t(String(e.vars.kind)) } : e.vars;
      const w = v?.work ? { ...v, work: t(String(v.work)) } : v;
      return t(e.key, w);
    }
    return e.html ?? '';
  }

  private renderNotes(): void {
    const list = this.els.notes;
    if (!list) return;
    const shown = this.notesOpen ? this.journal.slice().reverse() : this.journal.slice(-3).reverse();
    list.innerHTML =
      shown
        .map((n) => {
          const show = n.loc ? ` <button class="go" data-loc="${n.loc.x},${n.loc.y}">${t('notesShow')}</button>` : '';
          return `<li><time>${n.at}</time><span>${this.entryText(n)}${show}</span></li>`;
        })
        .join('') || `<li><time></time><span>${t('notesEmpty')}</span></li>`;
  }

  private lookAt(x: number, y: number): void {
    const g = this.game;
    if (g.director.active) g.director.stop();
    g.selected = null;
    g.cam.follow = null;
    g.cam.tzoom = Math.max(g.cam.tzoom, 5);
    g.cam.tx = x;
    g.cam.ty = y;
  }

  /** Brief red pulse on a work row, to point at the setting that is causing trouble. */
  private pulse(work: Work): void {
    const row = this.root.querySelector(`#row-${work}`);
    if (!row) return;
    // A folded brain would hide the flash: open it (phones keep their slice clear).
    const brain = this.els.brain!;
    if (brain.classList.contains('collapsed') && roomy()) {
      brain.classList.remove('collapsed');
      this.syncCollapse();
    }
    row.classList.remove('pulse');
    void (row as HTMLElement).offsetWidth;
    row.classList.add('pulse');
  }

  /** Seeds the colony eats in one in-game day (workers, plus the queen). */
  private dailyNeed(): number {
    const col = this.game.sim.colony;
    const meta = metabolism(col.nestTemp);
    return ((col.adults * DAY_TICKS) / TUNING.adultSeedTicks + (col.queen?.alive ? DAY_TICKS / TUNING.queenSeedTicks : 0)) * meta;
  }

  /** Things worth writing down, noticed by watching the colony's numbers. */
  private observe(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    if (sim.phase === 'failed') return;
    if (!this.wingsNoted && col.queen && !col.queen.wings) {
      this.wingsNoted = true;
      this.note('j_wings', undefined, { toast: true });
      setTimeout(() => this.toast(t('tipControls'), 9000), 2500);
      setTimeout(() => {
        if (this.game.speed === 1 && !this.game.paused && this.game.sim.phase === 'founding') this.toast(t('tipSpeed'), 8000);
      }, 14000);
    }
    const marks = [10, 25, 50, 100, 150, 200, 300, 500];
    while (this.milestone < marks.length && col.adults >= marks[this.milestone]!) {
      this.note('j_milestone', { n: marks[this.milestone]! }, { toast: marks[this.milestone]! >= 50 });
      this.milestone++;
    }
    for (const c of sim.nest.chambers) {
      if (!c.ready || this.notedChambers.has(c.id)) continue;
      this.notedChambers.add(c.id);
      // Rest chambers are routine: only the first one gets a line.
      if (c.kind === 'rest' && this.restNoted) continue;
      if (c.kind === 'rest') this.restNoted = true;
      this.note('j_chamberDone', { kind: `ch_${c.kind}`, d: depthCm(c, sim.world.ground) }, { toast: c.kind !== 'rest', loc: { x: c.cx, y: c.cy } });
    }
    if (!this.firstStore && sim.nest.chambers.some((c) => c.kind === 'granary' && c.seeds > 0)) {
      this.firstStore = true;
      const g = sim.nest.chambers.find((c) => c.kind === 'granary' && c.seeds > 0)!;
      this.note('j_firstStore', undefined, { toast: true, loc: { x: g.cx, y: g.cy } });
    }
    if (!this.firstMajor && col.majors > 0) {
      this.firstMajor = true;
      this.note('j_firstMajor', undefined, { toast: true });
    }
    const drowned = col.deaths['brood drowned'] ?? 0;
    if (drowned > this.drowned && sim.weather.rain < 0.15) {
      this.note('j_flood', { n: drowned - this.drowned }, { toast: true, merge: true });
      this.drowned = drowned;
    }
    const larvae = col.deaths['larva starved'] ?? 0;
    if (larvae > this.larvaeLost) {
      const off = col.prio.nurse === 0;
      this.note(off ? 'j_larvaeOff' : 'j_larvae', { n: larvae - this.larvaeLost }, { toast: true, merge: true });
      if (off) this.pulse('nurse');
      this.larvaeLost = larvae;
    }
    // Hunger: say why, and point at the setting when one is to blame.
    const offWork = col.prio.forage === 0 ? 'forage' : null;
    if (col.starving && this.starvedDay !== sim.day) {
      this.starvedDay = sim.day;
      if (offWork) {
        this.note('j_starvingOff', { work: `work_${offWork}` }, { toast: true });
        this.pulse(offWork);
      } else this.note('j_starving', undefined, { toast: true });
    } else if (!col.starving && col.adults >= 10 && this.lowFoodDay !== sim.day && this.starvedDay !== sim.day) {
      const days = (col.stored + col.reserve) / Math.max(1, this.dailyNeed());
      if (days < LOW_FOOD_DAYS) {
        this.lowFoodDay = sim.day;
        if (offWork) {
          this.note('j_lowFoodOff', { work: `work_${offWork}` }, { toast: true });
          this.pulse(offWork);
        } else this.note('j_lowFood', undefined, { toast: true });
      }
    }
  }

  // ------------------------------------------------------------------ actions

  /**
   * The colony begins: the nuptial swarm, and one queen coming down to a
   * spot she picks herself. The panels stay out of the way until she lands.
   */
  private beginLanding(): void {
    const game = this.game;
    this.root.classList.add('cine');
    game.cine.onCaption = (title, sub, line) => this.cineCaption(title, sub, line);
    game.cine.onEnd = () => this.cineEnded();
    game.cine.startLanding();
  }

  /** A sequence has finished: back to the game at a working speed. */
  private cineEnded(): void {
    const game = this.game;
    const montage = this.root.classList.contains('montage');
    this.root.classList.remove('cine');
    this.root.classList.remove('montage');
    this.markerMode = false;
    // Founding is slow at 1×: carry on at 4× (the player can slow down).
    game.setSpeed(2);
    this.syncBar();
    this.syncBrain();
    if (montage) setTimeout(() => this.cineCaption('', '', ''), 5000);
  }

  /** Titles and captions of the sequences (empty strings clear them). */
  private cineCaption(title: string, sub: string, line: string): void {
    if (title) {
      const el = this.els.season!;
      el.innerHTML = `<div class="s1">${title}</div><div class="s2">${sub}</div>`;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
      clearTimeout(this.seasonTimer);
      this.seasonTimer = window.setTimeout(() => el.classList.remove('on'), 4200);
    }
    const c = this.els.cineline!;
    c.innerHTML = line;
    c.classList.toggle('on', !!line);
  }

  /** Order a room: placed at once (and drawn) when there is room, otherwise queued. */
  private order(kind: ChamberKind): void {
    const sim = this.game.sim;
    const col = sim.colony;
    if (sim.phase !== 'growing') {
      this.toast(t('orderWait'));
      return;
    }
    if (col.orders.length >= 4) {
      this.toast(t('queueFull'));
      return;
    }
    const n0 = sim.nest.chambers.length;
    if (col.orders.length === 0 && sim.nest.placeChamber(kind)) {
      const c = sim.nest.chambers[n0]!;
      this.toast(t('orderPlanned', { kind: t(`ch_${kind}`), d: depthCm(c, sim.world.ground) }), 6500);
      this.game.renderer.planFlash = 9;
    } else {
      col.orders.push(kind);
      this.toast(t('orderQueued', { kind: t(`ch_${kind}`) }), 6500);
      this.game.renderer.planFlash = 6;
    }
    this.syncBrain();
  }

  /** One shaft extension at a time: the next waits until most of the last is dug. */
  private deeper(): void {
    const sim = this.game.sim;
    if (sim.phase !== 'growing') {
      this.toast(t('orderWait'));
      return;
    }
    const left = sim.nest.shaftPending();
    if (left > 0.25) {
      this.toast(t('deeperBusy', { p: Math.round(left * 100) }));
      return;
    }
    if (sim.nest.deepen()) {
      this.toast(t('deeperStarted'));
      this.game.renderer.planFlash = 8;
    } else this.toast(t('deeperNone'));
  }

  private togglePlan(): void {
    const r = this.game.renderer;
    r.planAlways = !r.planAlways;
    this.toast(t(r.planAlways ? 'planOn' : 'planOff'));
    this.syncBar();
  }

  private toggleTrails(): void {
    const r = this.game.renderer;
    r.trails = !r.trails;
    this.toast(t(r.trails ? 'trailsOn' : 'trailsOff'));
    this.syncBar();
  }

  /** Clean frame for screenshots and clips; the documentary caption stays. */
  private toggleCinema(): void {
    this.cinema = !this.cinema;
    this.root.classList.toggle('cinema', this.cinema);
  }

  // ------------------------------------------------------------------ syncing

  private syncBrain(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    this.root.querySelectorAll<HTMLElement>('#work .seg button').forEach((b) => {
      const [wk, i] = b.dataset.k!.split(':');
      b.classList.toggle('on', col.prio[wk as Work] === Number(i));
    });
    this.root.querySelectorAll<HTMLElement>('#breed button').forEach((b, i) => b.classList.toggle('on', col.breeding === i));
    const pct = Math.round(col.majorShare * 100);
    (this.root.querySelector('#majors') as HTMLInputElement).value = String(pct);
    this.els.majval!.textContent = t('majorsValue', { n: pct });
    this.els.mark!.classList.toggle('on', this.markerMode);
    this.els.mark!.textContent = this.markerMode ? t('marking') : t('markGrow');
    this.root.querySelectorAll<HTMLElement>('[data-order]').forEach((b) => b.classList.toggle('disabled', col.orders.length >= 4));
    // Queue and marker as chips, each with an × to cancel.
    const m = sim.nest.marker;
    const sig = `${col.orders.join(',')}|${m ? `${m.x},${m.y}` : ''}|${getLang()}`;
    if (sig !== this.queueSig) {
      this.queueSig = sig;
      let html = '';
      if (col.orders.length) {
        html += `<span class="qlabel">${t('queued')}</span>`;
        html += col.orders.map((o, i) => `<button class="chip" data-q="${i}" title="${t('cancel')}">${t(`ch_${o}`)} ×</button>`).join('');
      }
      if (m) {
        const d = num((m.y - sim.world.ground[m.x]!) / 10);
        html += `<button class="chip" data-m title="${t('removeMarker')}">${t('markerLine', { d })} ×</button>`;
      }
      this.els.queue!.innerHTML = html;
    }
  }

  private syncBar(): void {
    const btns = this.root.querySelectorAll<HTMLElement>('#speeds button');
    btns.forEach((b, i) => {
      if (i === 0) b.classList.toggle('on', this.game.paused);
      else b.classList.toggle('on', !this.game.paused && SPEEDS[i - 1] === this.game.speed);
    });
    this.els['v-plan']?.classList.toggle('on', this.game.renderer.planAlways);
    this.els['v-trails']?.classList.toggle('on', this.game.renderer.trails);
  }

  // ------------------------------------------------------------------ input

  private bindInput(canvas: HTMLCanvasElement): void {
    const game = this.game;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragDist = 0;
    let pinch0 = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (game.director.active) game.director.stop();
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDist = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, inside: true };
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch0 > 0) game.cam.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinch0);
        pinch0 = d;
        dragDist = 99;
        return;
      }
      dragDist += Math.abs(dx) + Math.abs(dy);
      if (dragDist > 5 && !game.cine.busy) {
        game.cam.pan(dx, dy);
        if (game.selected) game.selected = null;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e: PointerEvent): void => {
      const had = pointers.delete(e.pointerId);
      if (had && pointers.size === 0 && dragDist <= 5) this.click(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    canvas.addEventListener('pointerleave', () => (this.pointer.inside = false));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (game.director.active) game.director.stop();
        game.cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      // A sequence running: Space, Esc or Enter skip it.
      if ((game.cine.busy || game.cine.montage) && (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter')) {
        game.cine.skip();
        e.preventDefault();
        return;
      }
      if (e.key === ' ') {
        game.paused = !game.paused;
        this.syncBar();
        e.preventDefault();
      } else if (e.key >= '1' && e.key <= '5') {
        game.setSpeed(Number(e.key) - 1);
        this.syncBar();
      } else if (e.key === 'f' || e.key === 'F') {
        if (game.director.active) game.director.stop();
        game.selected = null;
        game.fitKnown();
      } else if (e.key === 't' || e.key === 'T') {
        this.toggleTrails();
      } else if (e.key === 'p' || e.key === 'P') {
        this.togglePlan();
      } else if (e.key === 'c' || e.key === 'C') {
        game.director.toggle();
      } else if (e.key === 'h' || e.key === 'H') {
        this.toggleCinema();
      } else if (e.key === '?' || e.key === '/') {
        this.els.keys!.hidden = !this.els.keys!.hidden;
      } else if (e.key === 'Escape') {
        this.els.keys!.hidden = true;
        game.selected = null;
        if (this.cinema) this.toggleCinema();
        this.markerMode = false;
        this.syncBrain();
      } else if (e.key === '+' || e.key === '=') {
        game.cam.zoomAt(game.cam.screenW / 2, game.cam.screenH / 2, 1.4);
      } else if (e.key === '-') {
        game.cam.zoomAt(game.cam.screenW / 2, game.cam.screenH / 2, 1 / 1.4);
      }
    });
  }

  private click(sx: number, sy: number): void {
    const game = this.game;
    const sim = game.sim;
    const p = game.cam.toWorld(sx, sy);
    if (sim.phase === 'choose' || game.cine.busy) return;
    if (this.markerMode) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const problem = sim.nest.markerProblem(x, y);
      // A bad spot keeps marking on, so the player can simply click again (Esc cancels).
      if (problem) {
        this.toast(t(`marker_${problem}`));
        return;
      }
      sim.nest.marker = { x, y };
      this.toast(t('markerSet'));
      game.renderer.planFlash = 8;
      this.markerMode = false;
      this.syncBrain();
      return;
    }
    let best: Ant | null = null;
    let bd = (8 / game.cam.zoom) ** 2 + 6;
    const col = sim.colony;
    const all = col.queen ? [col.queen, ...col.ants] : col.ants;
    for (const a of all) {
      if (!a.alive) continue;
      const d = (a.x - p.x) ** 2 + (a.y - 2 - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    game.selected = best;
    if (best) game.cam.tzoom = Math.max(game.cam.tzoom, 7);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    const game = this.game;
    const sim = game.sim;
    const col = sim.colony;
    const phase = sim.phase;
    if (phase !== this.lastPhase) {
      const was = this.lastPhase;
      this.lastPhase = phase;
      this.applyPhase(phase);
      if (phase === 'growing' && was === 'founding') {
        this.note('j_firstWorkers', undefined, { toast: true });
        // The moment to act (or to start watching): open the panel (except on phones) and point at the camera.
        if (roomy()) {
          this.els[this.mode === 'guide' ? 'brain' : 'colony']!.classList.remove('collapsed');
          this.syncCollapse();
        }
        setTimeout(() => this.toast(t(this.mode === 'guide' ? 'tipBrainAwake' : 'tipWatchAwake'), 9000), 1800);
        const w = this.els.watch!;
        w.classList.add('pulse');
        setTimeout(() => w.classList.remove('pulse'), 10000);
      }
      if (phase === 'failed') {
        this.note('j_died');
        this.game.clearSave();
        this.showOver();
      }
    }
    const dir = game.director;
    this.els.watch!.classList.toggle('on', dir.active);
    const cap = this.els.caption!;
    cap.style.display = dir.active && dir.caption ? 'block' : 'none';
    if (dir.active) (cap.querySelector('.line') as HTMLElement).innerHTML = dir.caption;
    while (sim.events.length) {
      const e = sim.events.shift()!;
      if (phase === 'failed') continue;
      // Passing weather is worth a glance, not a line in the journal (it rains most weeks).
      // Plugging the door is noted the first time only.
      const quiet = ['rain', 'rainStops', 'rainLonger', 'snow', 'snowStops'].includes(e.key) || (e.key === 'plugged' && this.pluggedNoted);
      if (e.key === 'plugged') this.pluggedNoted = true;
      if (quiet) this.toast(t(`ev_${e.key}`));
      else {
        const vars: Vars = {};
        if (e.n !== undefined) vars.n = e.n;
        if (e.m !== undefined) vars.m = e.m;
        if (e.kind) vars.kind = `ch_${e.kind}`;
        if (e.who) vars.who = t(`who_${e.who}`);
        if (e.what) vars.what = t(`what_${e.what}`);
        vars.queen = sim.names.queen;
        const loc = e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : undefined;
        if (e.key.startsWith('season_')) this.seasonCard(e.key.slice(7));
        if (e.key === 'sealedIn' && !sim.colony.hadWorkers) {
          this.root.classList.add('montage');
          game.cine.onCaption = (title, sub, line) => this.cineCaption(title, sub, line);
          game.cine.onEnd = () => this.cineEnded();
          game.cine.startMontage();
        }
        if (e.key === 'dormancy' && sim.colony.hadWorkers) this.yearReview();
        this.note(`ev_${e.key}`, vars, { toast: true, merge: !e.kind, loc });
        if (loc) dir.notice(loc.x, loc.y, t(`ev_${e.key}`, vars), e.key);
        // Big news gets a ring on the spot, so the eye finds it.
        if (loc && ['neighbourMetL', 'neighbourMetR', 'youngColony', 'youngColonyGone', 'war', 'raid', 'secondGate', 'raidYoung', 'warYoung'].includes(e.key)) game.renderer.mark(loc.x, loc.y);
      }
    }
    // The ant being followed died: show its life card for a moment.
    if (game.selected) this.followed = game.selected;
    else if (this.followed && !this.followed.alive) {
      this.lifeCard(this.followed);
      this.followed = null;
    } else this.followed = null;
    this.tooltip();
    this.readout();
    this.scaleBar();
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.25;

    const [e, l, p] = col.broodCounts();
    const days = (col.stored + col.reserve) / Math.max(1, this.dailyNeed());
    const foodText = days >= 10 ? t('foodDays', { n: '10+' }) : days >= 1 ? t('foodDays', { n: num(days) }) : t('foodHours', { n: Math.floor(days * 24) });
    this.els.pop!.textContent = String(col.adults);
    // The time-lapse shows the weeks going by.
    if (game.cine.montage) this.els.cinedate!.textContent = dateText(sim);
    if (sim.names.queen && !this.els.cname!.textContent) this.els.cname!.textContent = `${t('queenTitle', { name: sim.names.queen })} · ${t(sim.names.colony)}`;
    this.els.maj!.textContent = String(col.majors);
    this.els.brood!.textContent = String(e + l + p);
    this.els.brood!.title = t('broodTitle', { e, l, p });
    this.els.food!.textContent = String(col.stored);
    this.els.food!.classList.toggle('warn', col.starving);
    this.els.fooddays!.textContent = col.adults > 0 ? foodText : '';
    this.els.fooddays!.classList.toggle('warn', col.adults >= 10 && days < LOW_FOOD_DAYS);
    const night = sim.cal.daylight(sim.dayT, sim.doy) < 0.05;
    const sky = sim.weather.snowing && sim.weather.rain > 0.15 ? 'skySnow' : sim.weather.rain > 0.15 ? (sim.weather.storm ? 'skyStorm' : 'skyRain') : night ? 'skyNight' : 'skyClear';
    const mins = Math.floor(sim.dayT * 24 * 60);
    const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    this.els.day!.textContent = dateText(sim);
    this.els.sky!.textContent = `${t(sky)} · ${t('tempNow', { t: Math.round(sim.surfaceT) })}`;
    this.els.sky!.title = t('tempTitle', { s: Math.round(sim.surfaceT), n: Math.round(col.nestTemp) });
    this.els.year!.textContent = `${t(`season_${sim.season}`)} · ${t('yearN', { n: sim.cal.year(sim.simDays) })}`;
    if (sky !== this.skySig) {
      this.skySig = sky;
      this.els.skyico!.innerHTML = sky === 'skyStorm' ? ICON.storm : sky === 'skyRain' || sky === 'skySnow' ? ICON.rain : sky === 'skyNight' ? ICON.moon : ICON.sun;
    }
    this.els.time!.textContent = clock;
    this.els['s-pop']!.textContent = String(col.adults);
    this.els['s-brood']!.textContent = `${t('brood')} ${e + l + p}`;
    this.els['s-food']!.textContent = `${t('seeds')} ${col.stored}`;
    this.els['s-day']!.textContent = `${stampText(sim)}`;
    this.els.perf!.textContent = phase === 'choose' ? '' : t('perf', { n: num(game.tps / TICK_HZ) });
    // Who is doing what right now, beside each priority.
    const adults = Math.max(1, col.adults);
    const counts: Record<number, number> = {};
    for (const a of col.ants) counts[a.task] = (counts[a.task] ?? 0) + 1;
    for (const wk of WORK) {
      const n = counts[WORK_TASK[wk]] ?? 0;
      const pct = Math.round((n / adults) * 100);
      const share = this.root.querySelector(`#share-${wk}`) as HTMLElement;
      (share.querySelector('i') as HTMLElement).style.width = `${pct}%`;
      // No diggers because nothing is planned is not a fault: say so.
      const idle = wk === 'dig' && n === 0 && sim.nest.pendingCells === 0 && col.prio.dig > 0;
      (share.querySelector('span') as HTMLElement).textContent = col.adults > 0 ? (idle ? t('shareNoDig') : t('share', { n, p: pct })) : '';
    }
    // Brood trend over the last in-game hour, to show what Breeding is doing.
    const hist = col.history;
    const back = hist[Math.max(0, hist.length - 4)];
    const brood = e + l + p;
    const arrow = !back ? '' : brood > back.brood + 2 ? '▲' : brood < back.brood - 2 ? '▼' : '–';
    this.els.broodtrend!.textContent = col.adults > 0 ? t('broodTrend', { n: brood, arrow }) : '';
    this.syncBrain();
    this.syncWinter();
    if (this.mode === 'watch') this.syncColony(counts, e, l, p, arrow);
    this.drawSpark();
    if (performance.now() > this.lifeCardUntil) this.inspector();
    this.observe();
  }

  /** The read-only colony panel: who does what, the brood, and every room. */
  private syncColony(counts: Record<number, number>, e: number, l: number, p: number, arrow: string): void {
    const col = this.game.sim.colony;
    const adults = Math.max(1, col.adults);
    const tasks: [string, number][] = [['dig', Task.Dig], ['forage', Task.Forage], ['nurse', Task.Nurse], ['clean', Task.Clean], ['idle', Task.Idle]];
    for (const [k, task] of tasks) {
      const n = counts[task] ?? 0;
      (this.root.querySelector(`#ct-${k}`) as HTMLElement).style.width = `${Math.round((n / adults) * 100)}%`;
      (this.root.querySelector(`#cn-${k}`) as HTMLElement).textContent = String(n);
    }
    this.els['cb-e']!.textContent = String(e);
    this.els['cb-l']!.textContent = String(l);
    this.els['cb-p']!.textContent = String(p);
    this.els['cb-t']!.textContent = arrow;
    const al = col.alates.length;
    this.els['cb-a']!.innerHTML = al ? `${ICON.queen}<b>${al}</b> ${t('alatesN', { n: '' }).trim()}` : '';
    // Rooms, top to bottom; rebuilt only when something in the list changes.
    const sim = this.game.sim;
    const w = sim.world;
    const rooms = sim.nest.chambers.slice().sort((a, b) => a.floorY - b.floorY);
    const rows = rooms.map((c) => {
      let status = '';
      if (!c.ready) status = t('roomDigging', { p: Math.min(99, Math.round((100 * c.dug) / Math.max(1, c.cells.length))) });
      else if (c.kind === 'granary' || c.kind === 'queen') status = c.seeds ? t('roomSeeds', { n: c.seeds }) : '';
      else if (c.kind === 'nursery') status = t('roomBrood', { n: col.brood.filter((b) => !b.carried && sim.nest.chamberAt(b.y * w.w + b.x) === c).length });
      const tint = ZONE_TINT[c.kind]!;
      return `<button class="roomrow${c.ready ? '' : ' dig'}" data-loc="${Math.round(c.cx)},${Math.round(c.cy)}"><i style="background:rgb(${tint[0]},${tint[1]},${tint[2]})"></i><span>${t(`ch_${c.kind}`)}</span><em>${depthCm(c, w.ground)} cm</em><small>${status}</small></button>`;
    });
    const html = rows.join('') || `<div class="hint">${t('roomsNone')}</div>`;
    if (html !== this.roomSig) {
      this.roomSig = html;
      this.els.crooms!.innerHTML = html;
    }
  }

  private syncWinter(): void {
    const sim = this.game.sim;
    const show = sim.dormant && sim.phase !== 'choose' && sim.phase !== 'failed';
    const el = this.els.winter!;
    el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    const label = t(this.game.winterSkip ? 'winterSkipStop' : 'winterSkipOn');
    const btn = el.querySelector('#winter-btn') as HTMLElement;
    if (btn.textContent !== label) btn.textContent = label;
  }

  /** A field scale bar: a round length in mm that fits the current zoom. */
  private scaleBar(): void {
    const z = this.game.cam.zoom;
    let mm = SCALE_STEPS[SCALE_STEPS.length - 1]!;
    for (const s of SCALE_STEPS) {
      if (s * z >= 56) {
        mm = s;
        break;
      }
    }
    const el = this.els.scale!;
    (el.firstElementChild as HTMLElement).style.width = `${Math.round(mm * z)}px`;
    const label = mm >= 10 ? `${mm / 10} cm` : `${mm} mm`;
    const span = el.lastElementChild as HTMLElement;
    if (span.textContent !== label) span.textContent = label;
  }

  private drawSpark(): void {
    const c = this.spark.getContext('2d')!;
    const W = this.spark.width;
    const H = this.spark.height;
    c.clearRect(0, 0, W, H);
    const hist = this.game.sim.colony.history;
    if (hist.length < 2) return;
    const n = Math.min(hist.length, 240);
    const pts = hist.slice(hist.length - n);
    let max = 10;
    for (const s of pts) max = Math.max(max, s.pop, s.food);
    const line = (key: 'pop' | 'food', color: string, width: number): void => {
      c.beginPath();
      pts.forEach((s, i) => {
        const x = (i / (n - 1)) * (W - 4) + 2;
        const y = H - 4 - (s[key] / max) * (H - 10);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };
    line('food', 'rgba(226,180,92,0.7)', 2);
    line('pop', 'rgba(239,230,214,0.9)', 3);
  }

  private inspector(): void {
    const a = this.game.selected;
    const el = this.els.inspect!;
    if (!a) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.classList.remove('lifecard');
    const days = num(a.age / DAY_TICKS);
    const caste = a.caste === 'queen' ? t('casteQueen') : a.caste === 'soldier' ? t('casteMajor') : a.caste === 'gyne' ? t('casteGyne') : a.caste === 'male' ? t('casteMale') : t('casteMinor');
    const ageText = a.caste === 'queen' ? `${t('weeksN', { n: days })} · ${t('decades')}` : t('ageValue', { d: days, p: Math.round(a.ageFrac * 100) });
    const doing = a.caste === 'queen' ? (a.phase < 2 ? t('queenDigging') : t('queenLaying')) : t(`task${a.task}`);
    el.innerHTML = `<div class="eyebrow">${t('following')}</div><div class="name">${a.name}</div>
      <dl><dt>${t('caste')}</dt><dd>${caste}</dd><dt>${t('age')}</dt><dd>${ageText}</dd>
      <dt>${t('doing')}</dt><dd>${doing}</dd>
      <dt>${t('carrying')}</dt><dd>${a.carryBrood ? t('carry4') : t(`carry${a.carry}`)}</dd>
      ${a.delivered ? `<dt>${t('harvest')}</dt><dd>${t('seedsN', { n: a.delivered })}</dd>` : ''}</dl>`;
  }

  /** A short obituary for the ant the player was following. */
  private lifeCard(a: Ant): void {
    const el = this.els.inspect!;
    const cause = a.deathCause === 'old age' ? 'old' : a.deathCause || 'old';
    const job = a.delivered ? t('lifeSeeds', { n: a.delivered }) : t('lifeNoSeeds');
    el.style.display = 'block';
    el.classList.add('lifecard');
    el.innerHTML = `<div class="eyebrow">${t('lifeEnd')}</div><div class="name">${t(`died_${cause}`, { name: a.name })}</div>
      <p>${t('lifeLine', { d: num(a.age / DAY_TICKS), job })}</p>`;
    this.lifeCardUntil = performance.now() + 7000;
  }

  private tooltip(): void {
    const tip = this.els.tip!;
    const game = this.game;
    if (!this.pointer.inside || this.cinema) {
      tip.style.display = 'none';
      return;
    }
    const p = game.cam.toWorld(this.pointer.x, this.pointer.y);
    const w = game.sim.world;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (!w.inside(x, y)) {
      tip.style.display = 'none';
      return;
    }
    const place = (): void => {
      tip.style.display = 'block';
      tip.style.left = `${Math.min(this.pointer.x + 14, innerWidth - 260)}px`;
      tip.style.top = `${this.pointer.y + 14}px`;
    };
    // An ant under the pointer: who she is and what she is doing.
    const ant = game.sim.phase === 'choose' ? null : this.antAt(p.x, p.y);
    if (ant) {
      tip.innerHTML = this.antTip(ant);
      place();
      return;
    }
    const c = game.sim.nest.chamberAt(y * w.w + x);
    if (!c || !c.ready) {
      // Out of the nest: who or what is this?
      const n = this.natureAt(x, y);
      if (!n) {
        tip.style.display = 'none';
        return;
      }
      tip.innerHTML = `<b>${t(`nm_${n.key}`)}</b>${n.state ? ` · ${t(`st_${n.state}`)}` : ''}<div class="fact">${t(`nf_${n.key}`)}</div>`;
      tip.style.display = 'block';
      tip.style.left = `${Math.min(this.pointer.x + 14, innerWidth - 260)}px`;
      tip.style.top = `${this.pointer.y + 14}px`;
      return;
    }
    let body = '';
    if (c.kind === 'granary' || c.kind === 'queen') body = t('seedsStored', { n: c.seeds });
    if (c.kind === 'nursery') {
      const n = game.sim.colony.brood.filter((b) => !b.carried && game.sim.nest.chamberAt(b.y * w.w + b.x) === c).length;
      body = t('broodSpots', { n, s: c.floor.length });
    }
    if (c.kind === 'rest') body = t('restBody');
    tip.innerHTML = `<b>${t(`ch_${c.kind}`)}</b> · ${t('cmDown', { d: depthCm(c, w.ground) })}<br>${body}<div class="fact">${t(`fact_${c.kind}`)}</div>`;
    tip.style.display = 'block';
    tip.style.left = `${Math.min(this.pointer.x + 14, innerWidth - 260)}px`;
    tip.style.top = `${this.pointer.y + 14}px`;
  }

  /**
   * A title card as the season turns: the name of the season, the year and
   * the colony, fading in and out over the scene like a chapter heading.
   */
  private seasonCard(season: string): void {
    const el = this.els.season!;
    const sim = this.game.sim;
    el.innerHTML = `<div class="s1">${t(`season_${season}`)}</div><div class="s2">${t('yearN', { n: sim.cal.year(sim.simDays) })}${sim.names.colony ? ` · ${t(sim.names.colony)}` : ''}</div>`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.seasonTimer);
    this.seasonTimer = window.setTimeout(() => el.classList.remove('on'), 4200);
  }

  private seasonTimer = 0;

  /** The year in review, as the colony goes into its winter rest. */
  private yearReview(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    const y = sim.closeYear();
    const lost = y.deaths.filter(([k]) => k !== 'brood drowned' && k !== 'larva starved');
    const lostN = lost.reduce((s, [, n]) => s + n, 0);
    const causes = lost.slice(0, 4).map(([k, n]) => t('rvCause', { n, what: t(`cause_${k.replace(/ /g, '_')}`) })).join(', ');
    const rows = [
      [t('rvWorkers'), t('rvWorkersV', { n: col.adults, p: y.peak })],
      [t('rvBorn'), String(y.born)],
      [t('rvLost'), lostN ? `${lostN} · ${causes}` : '0'],
      [t('rvSeeds'), String(col.stored + col.reserve)],
    ];
    if (y.wars || y.raids) rows.push([t('rvNeighbours'), t('rvNeighboursV', { w: y.wars, r: y.raids })]);
    if (y.flown) rows.push([t('rvFlown'), String(y.flown)]);
    const el = this.els.review!;
    el.innerHTML = `<div class="eyebrow">${t('yearN', { n: y.year })}${sim.names.colony ? ` · ${t(sim.names.colony)}` : ''}</div><h2>${t('rvTitle')}</h2>
      <dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
      <p>${t('rvRest', { queen: sim.names.queen || '' })}</p><button class="btn" id="rvok">${t('rvOk')}</button>`;
    el.style.display = 'block';
    const close = (): void => {
      el.style.display = 'none';
    };
    (el.querySelector('#rvok') as HTMLElement).onclick = close;
    // Watching on its own, the card steps aside by itself.
    if (this.mode === 'watch') setTimeout(close, 16000);
    this.note('j_yearReview', { y: y.year, n: col.adults, b: y.born, l: lostN });
  }

  /** The ant nearest the pointer (ours, a stranger in sight, or another young queen), if any is close. */
  private antAt(px: number, py: number): Ant | null {
    const game = this.game;
    const sim = game.sim;
    const col = sim.colony;
    const list: Ant[] = col.queen ? [col.queen, ...col.ants, ...col.alates] : [...col.ants, ...col.alates];
    for (const nb of sim.neighbours) for (const a of nb.ants) if (game.renderer.inSight(sim, a.x, a.y)) list.push(a);
    for (const q of sim.foreigners) if (q.phase < 2) list.push(q);
    let best: Ant | null = null;
    let bd = (8 / game.cam.zoom) ** 2 + 6;
    for (const a of list) {
      if (!a.alive || a.away > 0) continue;
      const d = (a.x - px) ** 2 + (a.y - 2 - py) ** 2;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** The hover card for an ant. */
  private antTip(a: Ant): string {
    const sim = this.game.sim;
    if (a.rival) {
      const nb = a.rivalOf;
      const whose = t(nb?.young ? 'tipYoungColony' : nb && nb.side < 0 ? 'tipNeighbourL' : 'tipNeighbourR');
      const doing = t(a.fight > 0 ? 'dc_boxing' : a.carry ? 'tipRivalCarry' : a.rstate === 3 ? 'tipRivalRaid' : a.rstate === 4 ? 'tipRivalWar' : a.rstate === 2 ? 'tipRivalBack' : 'tipRivalForage');
      return `<b>${t(a.caste === 'soldier' ? 'tipStrangerMajor' : 'tipStranger')}</b> · ${whose}<br>${doing}<div class="fact">${t(nb?.young ? 'tipYoungFact' : 'tipStrangerFact')}</div>`;
    }
    if (a.foreign) return `<b>${t('dc_gyne')}</b><div class="fact">${t('tipForeignQueen')}</div>`;
    const [head, ...rest] = this.game.director.describe(a).split(' · ');
    const name = a.caste === 'queen' ? t('queenTitle', { name: sim.names.queen }) : head;
    const body = rest;
    const temper = a.caste === 'queen' ? '' : (a.zeal ?? 0.75) < 0.4 ? ` · ${t('tipQuiet')}` : (a.zeal ?? 0.75) > 0.92 ? ` · ${t('tipTireless')}` : '';
    const age = a.caste === 'queen' ? '' : t('tipAge', { n: num(a.age / DAY_TICKS) }) + temper;
    return `<b>${name}</b>${body.length ? `<br>${body.join(' · ')}` : ''}${age ? `<br><span class="dim">${age}</span>` : ''}<div class="fact">${t('tipFollow')}</div>`;
  }

  /**
   * The corner readout, RimWorld-style: what the cell under the pointer is,
   * how deep, how damp and how warm, and what lives there. Where the colony
   * has not been yet, only that it is unexplored.
   */
  private readout(): void {
    const el = this.els.here!;
    const game = this.game;
    const sim = game.sim;
    const w = sim.world;
    const p = game.cam.toWorld(this.pointer.x, this.pointer.y);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (!this.pointer.inside || sim.phase === 'choose' || !w.inside(x, y)) {
      if (this.hereHtml) el.style.display = 'none';
      this.hereHtml = '';
      return;
    }
    const i = y * w.w + x;
    const g = w.ground[x]!;
    let title: string;
    const facts: string[] = [];
    if (sim.nest.founded && sim.fog.at(x, y, g) < 0.35) {
      title = t('hereUnknown');
      facts.push(t('hereUnknownSub'));
    } else {
      const m = w.mat[i]!;
      const n = this.natureAt(x, y);
      const under = w.bg[i] === 1;
      const ch = sim.nest.chamberAt(i);
      const self = !!n && (CELL_THINGS.has(n.key) || n.key.startsWith('seed_'));
      if (m === EMPTY && under) title = ch && ch.ready ? t(`ch_${ch.kind}`) : t('mt_tunnel');
      else if (m === EMPTY) title = n ? t(`nm_${n.key}`) : t('mt_air');
      else title = self ? t(`nm_${n!.key}`) : t(`mt_${matKey(m, w.tint[i]!)}`);
      const depth = y - g;
      if (under || m !== EMPTY) {
        facts.push(depth > 2 ? t('cmDown', { d: num(depth / 10) }) : t('hereSurface'));
        facts.push(t(`moist${Math.min(4, Math.floor(w.moist[i]! / 52))}`));
        facts.push(t('tempNow', { t: Math.round(depth > 2 ? sim.soilT(depth) : sim.surfaceT) }));
      } else {
        facts.push(t('hereAbove', { d: num(-depth / 10) }));
        facts.push(t('tempNow', { t: Math.round(sim.surfaceT) }));
      }
      if (n && !self && !(m === EMPTY && !under)) facts.push(t(`nm_${n.key}`));
    }
    const html = `<b>${title}</b><span>${facts.join(' · ')}</span>`;
    if (html !== this.hereHtml) {
      el.innerHTML = html;
      el.style.display = 'block';
      this.hereHtml = html;
    }
  }

  private hereHtml = '';

  /** The plant, animal or thing at a point of the slice, for the hover card. */
  private natureAt(x: number, y: number): { key: string; state?: string } | null {
    const sim = this.game.sim;
    const w = sim.world;
    for (const c of sim.critters.list) {
      if (c.kind === 'lark' && Math.abs(x - c.x) < 75 && y > c.y - 110 && y <= c.y + 2) return { key: 'lark' };
      if (c.kind === 'hopper' && Math.abs(x - c.x) < 14 && Math.abs(y - c.y + 4) < 8) return { key: 'hopper' };
      if (c.kind === 'beetle' && Math.abs(x - c.x) < 8 && Math.abs(y - c.y + 3) < 5) return { key: 'beetle' };
      if (c.kind === 'worm' && c.body.some((i) => Math.abs((i % w.w) - x) < 3 && Math.abs(((i / w.w) | 0) - y) < 3)) return { key: 'worm' };
      if (c.kind === 'antlion' && Math.abs(x - (c.px ?? c.x)) < (c.pr ?? 8) && y > c.y - (c.pr ?? 8) && y <= c.y + 2) return { key: 'antlion' };
      if ((c.kind === 'spider' || c.kind === 'phorid' || c.kind === 'woodlouse' || c.kind === 'cricket' || c.kind === 'beetlet') && Math.abs(x - c.x) < 4 && Math.abs(y - c.y + 1) < 4) return { key: c.kind };
    }
    const i = y * w.w + x;
    const pl = w.plant[i]!;
    const doy = sim.doy;
    if (pl) {
      const shrub = sim.eco.shrub;
      if (shrub && (pl === TWIG || pl === BERRY || shrub.leaves.some((g) => g.includes(i)) || shrub.buds.some((g) => g.includes(i)))) return { key: shrub.kind, state: pl === BERRY ? 'fruit' : pl === FLOWER ? 'flower' : undefined };
      const p = sim.plants.list.find((q) => q.parts.some((pt) => pt.i === i) || q.slots.includes(i));
      if (p) {
        const ripe = p.slots.some((s) => w.plant[s] === SEEDHEAD);
        return { key: p.kind, state: p.resting ? 'resting' : ripe ? 'ripe' : p.dry >= 2 ? 'straw' : !p.mature ? 'growing' : p.parts.some((pt) => pt.m === FLOWER && w.plant[pt.i] === FLOWER) && doy < 200 ? 'flower' : undefined };
      }
    }
    const m = w.mat[i]!;
    if (m === FRUIT) return { key: 'fruit' };
    if (m === PREY) return { key: w.tint[i] === 3 ? 'nymph' : w.tone[i]! < 150 ? 'deadBeetle' : w.tone[i]! < 220 ? 'deadHopper' : 'deadWorm' };
    if (m === STONE && w.tint[i] === 4) return { key: 'shard' };
    if (m === STONE && w.tint[i] === 5) return { key: 'bone' };
    if (m === LITTER && w.tint[i] === 2) return { key: 'leaf' };
    if (m === SEED && w.bg[i] === 0) return { key: `seed_${['grass', 'clover', 'purse', 'stipa', 'erodium'][Math.min(4, Math.floor(w.tone[i]! / 51.2))]}` };
    return null;
  }

  private showOver(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    const peak = Math.max(0, ...col.history.map((s) => s.pop));
    let cause = 'end_old';
    if (col.prio.forage === 0) cause = 'end_forageOff';
    else if (col.lastDeath === 'starvation') cause = 'end_hunger';
    else if (col.lastDeath === 'drowned') cause = 'end_flood';
    else if (col.prio.nurse === 0) cause = 'end_nurseOff';
    const el = this.els.over!;
    el.style.display = 'block';
    el.innerHTML = `<div class="eyebrow">${t('dateYear', { date: dateText(sim), y: sim.cal.year(sim.simDays) })}</div><h2>${t('overTitle')}</h2>
      <p>${t(cause)} ${t('overPeak', { n: peak })}</p>
      <button class="btn" id="again" style="padding:8px 16px">${t('foundNew')}</button>`;
    (el.querySelector('#again') as HTMLElement).onclick = () => location.reload();
  }
}
