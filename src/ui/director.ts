import type { Game } from '../main';
import type { Ant } from '../sim/ant';
import { Carry, Task } from '../sim/types';
import { t, num } from './i18n';

type Shot = 'queen' | 'forager' | 'digger' | 'hauler' | 'nurse' | 'major' | 'granary' | 'wide';

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
  private left = 0;
  private last: Shot | null = null;

  constructor(game: Game) {
    this.game = game;
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

  update(dt: number): void {
    if (!this.active) return;
    this.left -= dt;
    if (this.left <= 0 || (this.subject && !this.subject.alive)) this.cut();
    const cam = this.game.cam;
    if (this.subject) {
      cam.follow = { x: this.subject.x, y: this.subject.y - 2 };
      this.caption = this.describe(this.subject);
    } else if (this.point) {
      cam.follow = this.point;
    }
  }

  private cut(): void {
    const sim = this.game.sim;
    const col = sim.colony;
    const w = sim.world;
    const cam = this.game.cam;
    const under = (a: Ant): boolean => w.bg[a.y * w.w + a.x] === 1;
    const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
    const options: [Shot, number][] = [
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
      for (const [s, wgt] of options) if (s !== this.last) total += wgt;
      let r = Math.random() * total;
      let shot: Shot = 'wide';
      for (const [s, wgt] of options) {
        if (s === this.last) continue;
        r -= wgt;
        if (r <= 0) {
          shot = s;
          break;
        }
      }
      let subject: Ant | undefined;
      let point: { x: number; y: number } | null = null;
      let zoom = 8;
      switch (shot) {
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
          this.caption = t('dc_wide', { day: sim.day, n: col.adults, a: Math.round(sim.nest.openCells / 100) });
          break;
        }
      }
      if (!subject && !point) continue;
      this.last = shot;
      this.subject = subject ?? null;
      this.point = point;
      cam.tzoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, zoom));
      this.left = shot === 'wide' ? 8 : 10 + Math.random() * 6;
      return;
    }
    this.left = 3;
  }

  private describe(a: Ant): string {
    const sim = this.game.sim;
    const w = sim.world;
    const depth = (a.y - w.ground[a.x]!) / 10;
    const away = Math.abs(a.x - sim.nest.foundX) / 10;
    const where = depth > 0.3 ? t('dc_down', { d: num(depth) }) : t('dc_from', { d: num(away) });
    if (a.caste === 'queen') return a.phase < 2 ? t('dc_queenDig') : t('dc_queenLay', { where });
    const who = t(a.caste === 'soldier' ? 'dc_major' : a.task === Task.Forage ? 'dc_forager' : a.task === Task.Dig ? 'dc_digger' : a.task === Task.Nurse ? 'dc_nurse' : a.task === Task.Clean ? 'dc_cleaner' : 'dc_worker');
    const below = depth > 0.3;
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
      default:
        if (a.task === Task.Dig) doing = a.timer > 0 ? 'dc_digging' : 'dc_toDig';
        else if (a.task === Task.Forage) doing = below ? 'dc_out' : 'dc_search';
        else if (a.task === Task.Nurse) doing = 'dc_tending';
        else if (a.task === Task.Clean) doing = 'dc_tidy';
        else doing = a.timer > 0 ? 'dc_rest' : 'dc_move';
    }
    return `${who} ${a.name} · ${t(doing)} · ${where}`;
  }
}
