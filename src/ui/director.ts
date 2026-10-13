import type { Game } from '../main';
import type { Ant } from '../sim/ant';
import type { Critter } from '../sim/critters';
import { Carry, Task } from '../sim/types';
import { t, num } from './i18n';
import { TICK_HZ } from '../config';
import { SOLID } from '../world/mat';
import { dateText } from './ui';

type Shot = 'queen' | 'forager' | 'digger' | 'hauler' | 'nurse' | 'major' | 'granary' | 'wide' | 'rescue' | 'shoring' | 'lasius' | 'critter' | 'mouth' | 'tree';

/**
 * Documentary camera: cuts between subjects every few seconds and glides
 * slowly after them, with a field-note caption. Any manual camera input
 * hands control back to the player.
 */
export class Director {
  active = false;
  caption = '';
  private game: Game;
  private subject: Ant | null = null;
  private point: { x: number; y: number } | null = null;
  /** A critter followed through a shot (a garden ant in a scuffle). */
  private critter: Critter | null = null;
  private left = 0;
  private last: Shot | null = null;
  /** Something just happened somewhere: the next cut goes there. */
  private story: { x: number; y: number; caption: string; zoom: number } | null = null;
  /** Seconds the current shot has run. */
  private ran = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /** The ant the camera is on (marked on screen, so the caption has a face). */
  get focus(): Ant | null {
    return this.active ? this.subject : null;
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    if (this.game.sim.phase === 'choose') return;
    this.active = true;
    this.game.selected = null;
    this.game.cam.ease = 2.2;
    this.left = 0;
  }

  stop(): void {
    this.active = false;
    this.subject = null;
    this.point = null;
    this.caption = '';
    this.game.cam.ease = 12;
    this.game.cam.follow = null;
  }

  /**
   * A moment worth filming (a spider bites, a battle breaks
   * out): the camera cuts to it with the field note as the caption.
   */
  notice(x: number, y: number, caption: string, key: string): void {
    if (!this.active) return;
    const close = ['spider', 'phorid', 'cPosture', 'antlion', 'dyingAlone', 'ritualFight', 'foundressKilled', 'grooming', 'preyIn', 'foundNymph', 'dryingSeeds', 'neighbourMetL', 'neighbourMetR', 'youngColony', 'teamCarry', 'cutUp', 'recruitHeavy', 'tugOfWar', 'lasiusFight', 'lasiusKill', 'lasiusCaught', 'buriedOut', 'guestWoodlouse', 'guestCricket', 'guestBeetle', 'parasitoidKills', 'foundBone', 'foundSeeds'];
    const wide = ['war', 'raid', 'flight', 'moleBreach', 'moleNest', 'queenKilledMole', 'toad', 'toadBack', 'lizard', 'leafFall', 'otherQueens', 'wormsUp', 'youngColonyGone', 'secondGate', 'raidYoung', 'warYoung'];
    // A room's roof: close enough to see the cracks and the fall, wide enough for the room.
    const room = ['caveIn', 'caveInDead', 'roofCracks', 'seepage', 'shoring'];
    const zoom = close.includes(key) ? 11 : wide.includes(key) ? 3.4 : room.includes(key) ? 7.5 : 6;
    this.story = { x, y, caption, zoom };
    // Big moments play out at normal speed, however fast the film was running.
    const drama = ['caveIn', 'caveInDead', 'lasiusFight', 'lasiusKill', 'war', 'raid', 'toad', 'lizard', 'moleBreach', 'moleNest', 'flight', 'tugOfWar', 'spider', 'raidYoung', 'warYoung', 'queenKilledMole'];
    if (drama.includes(key)) this.game.slowMo();
    // Don't cut away from a shot that has barely started, unless it's big news.
    if (this.ran > 2.5 || wide.includes(key) || key === 'caveIn' || key === 'caveInDead') this.left = 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.left -= dt;
    this.ran += dt;
    if (this.left <= 0 || (this.subject && !this.subject.alive)) this.cut();
    const cam = this.game.cam;
    // A slow push in through each shot, as a camera operator would.
    if ((this.subject || this.critter) && this.last !== 'wide') cam.tzoom = Math.min(cam.maxZoom, cam.tzoom * (1 + dt * 0.015));
    if (this.subject) {
      cam.follow = { x: this.subject.x, y: this.subject.y - 2 };
      this.caption = this.describe(this.subject);
    } else if (this.critter) {
      const c = this.critter;
      if (!this.game.sim.critters.list.includes(c)) this.critter = null;
      else cam.follow = { x: c.x, y: c.y - 2 };
    } else if (this.point) {
      cam.follow = this.point;
    }
  }

  private cut(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    const w = sim.world;
    const cam = this.game.cam;
    this.ran = 0;
    if (this.story) {
      const s = this.story;
      this.story = null;
      this.subject = null;
      this.critter = null;
      this.point = { x: s.x, y: s.y };
      this.caption = s.caption;
      cam.tzoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, s.zoom));
      this.left = 9;
      this.last = null;
      return;
    }
    const under = (a: Ant): boolean => w.bg[a.y * w.w + a.x] === 1;
    const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
    // What is going on now weighs most: a rescue under way, a roof being shored, a scuffle at the tree.
    const g = sim.ground;
    const fights = sim.critters.list.filter((c) => c.kind === 'lasius' && (c.state === 1 || c.state === 4));
    const options: [Shot, number][] = [
      ['rescue', sim.nest.rescuing && g.buried.length ? 30 : 0],
      ['lasius', fights.length ? 12 : 0],
      // (A roof only just cracking is not much to see; one near giving way, or shorers at work, is.)
      ['shoring', col.ants.some((a) => a.shoring) ? 2 : sim.nest.chambers.some((c) => c.ready && (g.strain[c.id] ?? 0) >= 0.35) ? 1.2 : 0],
      ['critter', 1.5],
      ['mouth', 1],
      ['tree', sim.tree && sim.critters.count('lasius') > 0 ? 0.8 : 0],
      ['forager', 3],
      ['digger', 2],
      ['hauler', 1.5],
      ['nurse', 1.5],
      ['queen', 1],
      ['major', 1],
      ['granary', 1],
      ['wide', 1],
    ];
    for (let tries = 0; tries < 12; tries++) {
      let total = 0;
      for (const [s, wgt] of options) if (s !== this.last || s === 'rescue') total += wgt;
      let r = Math.random() * total;
      let shot: Shot = 'wide';
      for (const [s, wgt] of options) {
        if ((s === this.last && s !== 'rescue') || wgt <= 0) continue;
        r -= wgt;
        if (r <= 0) {
          shot = s;
          break;
        }
      }
      let subject: Ant | undefined;
      let point: { x: number; y: number } | null = null;
      let critter: Critter | null = null;
      let zoom = 8;
      switch (shot) {
        case 'rescue': {
          // Over the fall, where they dig: the buried one nearest the middle of it.
          const b = g.buried[Math.floor(Math.random() * g.buried.length)];
          if (b) {
            point = { x: b.x, y: b.y - 3 };
            zoom = 9;
            const n = g.buried.length;
            this.caption = t('dc_rescue', { n, m: col.ants.filter((a) => a.task === Task.Dig && Math.abs(a.x - b.x) < 14 && Math.abs(a.y - b.y) < 12).length });
          }
          break;
        }
        case 'lasius': {
          critter = fights[Math.floor(Math.random() * fights.length)] ?? null;
          zoom = 12;
          if (critter) this.caption = t(critter.state === 4 ? 'dc_lasiusDrag' : 'dc_lasiusFight');
          break;
        }
        case 'critter': {
          // Whoever else lives here: a spider by the trail, a beetle, a worm, a guest in the stores.
          const kinds = ['spider', 'beetle', 'hopper', 'worm', 'woodlouse', 'cricket', 'beetlet', 'antlion', 'centipede', 'molecricket', 'lizard', 'toad', 'lasius'];
          const seen = sim.critters.list.filter((c) => kinds.includes(c.kind) && sim.fog.at(Math.round(c.x), c.y, w.ground[Math.max(0, Math.min(w.w - 1, Math.round(c.x)))]!) > 0.5);
          critter = seen[Math.floor(Math.random() * seen.length)] ?? null;
          if (critter) {
            zoom = critter.kind === 'toad' || critter.kind === 'lizard' || critter.kind === 'mole' ? 5 : critter.kind === 'worm' || critter.kind === 'centipede' || critter.kind === 'hopper' ? 7 : 10;
            this.caption = t(`nm_${critter.kind}`);
          }
          break;
        }
        case 'mouth': {
          const e = sim.nest.entrances[Math.floor(Math.random() * sim.nest.entrances.length)];
          if (e !== undefined) {
            point = { x: e % w.w, y: ((e / w.w) | 0) - 8 };
            zoom = 6;
            const out = col.ants.filter((a) => a.away === 0 && !under(a)).length;
            this.caption = t('dc_mouth', { n: out });
          }
          break;
        }
        case 'tree': {
          const tr = sim.tree!;
          const side = tr.x < w.w / 2 ? -1 : 1;
          const fx = tr.x - side * tr.r;
          point = { x: fx - side * 25, y: w.ground[Math.max(0, Math.min(w.w - 1, Math.round(fx)))]! - 28 };
          zoom = 6;
          this.caption = t('dc_tree');
          break;
        }
        case 'shoring': {
          subject = pick(col.ants.filter((a) => a.shoring));
          if (!subject) {
            const c = sim.nest.chambers.find((r) => r.ready && (g.strain[r.id] ?? 0) >= 0.15);
            if (c) {
              point = { x: c.cx, y: c.floorY - c.h };
              this.caption = t('dc_cracking', { kind: t(`ch_${c.kind}`), p: Math.round(Math.min(1, g.strain[c.id]!) * 100) });
            }
          }
          zoom = 10;
          break;
        }
        case 'forager':
          subject = pick(col.ants.filter((a) => a.task === Task.Forage && !under(a) && a.carry === Carry.Seed)) ??
            pick(col.ants.filter((a) => a.task === Task.Forage && !under(a)));
          zoom = 8;
          break;
        case 'digger':
          subject = pick(col.ants.filter((a) => a.task === Task.Dig && under(a) && a.carry === Carry.None && a.timer > 0));
          zoom = 9;
          break;
        case 'hauler':
          subject = pick(col.ants.filter((a) => a.carry === Carry.Soil && under(a)));
          zoom = 8;
          break;
        case 'nurse':
          subject = pick(col.ants.filter((a) => a.task === Task.Nurse && under(a)));
          zoom = 10;
          break;
        case 'queen':
          subject = col.queen && col.queen.alive ? col.queen : undefined;
          zoom = 10;
          break;
        case 'major':
          subject = pick(col.ants.filter((a) => a.caste === 'soldier'));
          zoom = 9;
          break;
        case 'granary': {
          const g = sim.nest.chambers.filter((c) => c.kind === 'granary' && c.ready && c.seeds > 8).sort((a, b) => b.seeds - a.seeds)[0];
          if (g) {
            point = { x: g.cx, y: g.floorY - 3 };
            zoom = 11;
            this.caption = t('dc_granary', { n: g.seeds, d: num((g.floorY - w.ground[Math.round(g.cx)]!) / 10) });
          }
          break;
        }
        case 'wide': {
          const cs = sim.nest.chambers;
          let x = sim.nest.foundX;
          let y = w.ground[x]! + 30;
          if (cs.length) {
            x = cs.reduce((s, c) => s + c.cx, 0) / cs.length;
            y = cs.reduce((s, c) => s + c.cy, 0) / cs.length - 10;
          }
          point = { x, y };
          zoom = cam.fitZoom() * 1.7;
          this.caption = t('dc_wide', { day: dateText(sim), n: col.adults, a: Math.round(sim.nest.openCells / 100) });
          break;
        }
      }
      if (!subject && !point && !critter) continue;
      this.last = shot;
      this.subject = subject ?? null;
      this.point = point;
      this.critter = critter;
      cam.tzoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, zoom));
      this.left = shot === 'wide' ? 8 : shot === 'rescue' || shot === 'lasius' ? 9 : 10 + Math.random() * 6;
      return;
    }
    this.left = 3;
  }

  /** One line on what an ant is doing and where (the caption, and the hover card). */
  describe(a: Ant): string {
    const sim = this.game.sim;
    const w = sim.world;
    const depth = (a.y - w.ground[a.x]!) / 10;
    const away = Math.abs(a.x - sim.nest.foundX) / 10;
    const where = depth > 0.3 ? t('dc_down', { d: num(depth) }) : t('dc_from', { d: num(away) });
    if (a.caste === 'queen') return a.phase < 2 ? t('dc_queenDig') : t('dc_queenLay', { where });
    if (a.caste === 'gyne' || a.caste === 'male') return `${t(a.caste === 'gyne' ? 'dc_gyne' : 'dc_male')} ${a.name} · ${t(this.game.sim.flight ? 'dc_flying' : 'dc_waiting')} · ${where}`;
    const who = t(a.caste === 'soldier' ? 'dc_major' : a.task === Task.Forage ? 'dc_forager' : a.task === Task.Dig ? 'dc_digger' : a.task === Task.Nurse ? 'dc_nurse' : a.task === Task.Clean ? 'dc_cleaner' : 'dc_worker');
    const below = depth > 0.3;
    if (a.away > 0) return `${who} ${a.name} · ${t('dc_away')}`;
    if (a.paralysed) return `${who} ${a.name} · ${t('dc_paralysed')}`;
    if (a.underFall && SOLID[w.mat[a.y * w.w + a.x]!]) return `${who} ${a.name} · ${t('dc_buried')}`;
    if (a.shoring) return `${who} ${a.name} · ${t('dc_shoring')}`;
    if (a.cpose > 0) return `${who} ${a.name} · ${t('dc_cpose')}`;
    if (a.fight > 0) return `${who} ${a.name} · ${t('dc_boxing')}`;
    if (a.sick > 0.6) return `${who} ${a.name} · ${t('dc_sick')}`;
    if (a.haul) return `${who} ${a.name} · ${a.haul.carriers.length > 1 ? t('dc_hauling', { n: a.haul.carriers.length - 1 }) : t('dc_haulingAlone')}`;
    if (a.recruiting) return `${who} ${a.name} · ${t('dc_recruiting')}`;
    if (a.bound && a.carry === Carry.None) return `${who} ${a.name} · ${t('dc_bound')}`;
    if (a.alarm > TICK_HZ * 4 && a.carry === Carry.None) return `${who} ${a.name} · ${t(sim.trouble() ? 'dc_alarm' : 'dc_agitated')}`;
    let doing: string;
    switch (a.carry) {
      case Carry.Seed: doing = below ? 'dc_seedGranary' : 'dc_seedHome'; break;
      case Carry.Soil: doing = 'dc_soil'; break;
      case Carry.Refuse: doing = 'dc_refuse'; break;
      case Carry.Egg: doing = 'dc_egg'; break;
      case Carry.Larva: doing = 'dc_larva'; break;
      case Carry.Pupa: doing = 'dc_pupa'; break;
      case Carry.Corpse: doing = 'dc_corpse'; break;
      case Carry.Fruit: doing = 'dc_fruit'; break;
      case Carry.Prey: doing = 'dc_prey'; break;
      default:
        if (a.task === Task.Dig) doing = a.timer > 0 ? 'dc_digging' : 'dc_toDig';
        else if (a.task === Task.Forage) doing = a.waiting ? 'dc_waitGate' : below ? 'dc_out' : 'dc_search';
        else if (a.task === Task.Nurse) doing = 'dc_tending';
        else if (a.task === Task.Clean) doing = 'dc_tidy';
        else doing = a.timer > 0 ? 'dc_rest' : 'dc_move';
    }
    return `${who} ${a.name} · ${t(doing)} · ${where}`;
  }
}
