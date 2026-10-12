/**
 * Asset sheet (development only): every animal, ant and object the game
 * draws, alone on a plain ground, at three zooms side by side. Open
 * /sheet.html on the dev server; scripts/sheet.mjs screenshots it.
 * `?only=spider,hopper` limits the rows, `?zooms=4,8,16` sets the columns.
 */
import { World } from '../world/world';
import { LOAM } from '../world/mat';
import { Ant } from '../sim/ant';
import { Brood, Corpse } from '../sim/brood';
import { Carcass } from '../sim/carcass';
import type { Critter, CritterKind } from '../sim/critters';
import { Carry, Task } from '../sim/types';
import { AntPainter } from '../render/antdraw';
import { drawCritters, drawCarcasses } from '../render/critterdraw';
import { TUNING } from '../config';

const W = 1200;
const H = 120;
const GROUND = 60;
/** Left half of the little world is open ground under the sky, right half is inside the nest. */
const SPLIT = 600;

const world = new World(W, H);
for (let x = 0; x < W; x++) {
  world.ground[x] = GROUND;
  for (let y = 0; y < H; y++) {
    const i = y * W + x;
    const under = x >= SPLIT;
    // Underground: a tunnel 30 mm high with soil above and below.
    const solid = y >= GROUND || (under && y < GROUND - 30);
    world.mat[i] = solid ? LOAM : 0;
    world.bg[i] = under || y >= GROUND ? 1 : 0;
  }
}

type Draw = (ctx: CanvasRenderingContext2D, z: number, view: View) => void;
interface View { x0: number; y0: number; x1: number; y1: number }
interface Subject { id: string; label: string; x: number; y: number; under: boolean; draw: Draw; ants?: Ant[] }

const light = (): [number, number, number] => [1, 1, 1];
const painter = new AntPainter(world);
const subjects: Subject[] = [];
let slotSurface = 20;
let slotUnder = SPLIT + 20;
const place = (under: boolean): number => {
  if (under) return (slotUnder += 40) - 40;
  return (slotSurface += 40) - 40;
};

function ant(id: string, label: string, caste: Ant['caste'], under: boolean, setup: (a: Ant) => void = () => {}): void {
  const x = place(under);
  const a = new Ant(caste, x, GROUND - 1, 1e9, 0.5);
  a.task = Task.Forage;
  setup(a);
  subjects.push({ id, label, x, y: GROUND - 3, under, ants: [a], draw: (ctx, z, view) => painter.draw(ctx, [a], z, light, view, null) });
}

/** h: roughly how tall the animal stands, mm (the cell centres on it). */
function critter(id: string, label: string, kind: CritterKind, under: boolean, h: number, extra: Partial<Critter> = {}, dy = 0): void {
  const x = place(under);
  const c: Critter = { kind, x, y: GROUND - 1 + dy, vx: 0, vy: 0, dir: 1, t: 40, state: 0, timer: 0, life: 1000, peck: 0, air: false, body: [], tone: 160, ...extra };
  subjects.push({ id, label, x: x + 0.5, y: GROUND - h / 2 + dy, under, draw: (ctx, _z, view) => { c.t += 1; drawCritters(ctx, [c], world, light, view); } });
}

// ---- ants
ant('worker', 'Minor worker (7 mm)', 'worker', false);
ant('worker-seed', 'Worker carrying a seed', 'worker', false, (a) => { a.carry = Carry.Seed; a.carryTone = 120; });
ant('worker-soil', 'Worker carrying soil', 'worker', true, (a) => { a.carry = Carry.Soil; a.carryTone = 90; a.task = Task.Dig; });
ant('worker-larva', 'Nurse carrying a larva', 'worker', true, (a) => { a.carry = Carry.Larva; a.task = Task.Nurse; });
ant('worker-egg', 'Nurse carrying an egg', 'worker', true, (a) => { a.carry = Carry.Egg; a.task = Task.Nurse; });
ant('worker-pupa', 'Nurse carrying a pupa', 'worker', true, (a) => { a.carry = Carry.Pupa; a.task = Task.Nurse; });
ant('worker-corpse', 'Cleaner carrying a dead nestmate', 'worker', true, (a) => { a.carry = Carry.Corpse; a.task = Task.Clean; });
ant('worker-husk', 'Cleaner carrying a husk', 'worker', false, (a) => { a.carry = Carry.Refuse; a.carryTone = 140; a.task = Task.Clean; });
ant('worker-prey', 'Forager carrying a piece of insect', 'worker', false, (a) => { a.carry = Carry.Prey; a.carryTone = 90; });
ant('worker-fruit', 'Forager carrying a sloe', 'worker', false, (a) => { a.carry = Carry.Fruit; a.carryTone = 60; });
ant('major', 'Major (9 mm)', 'soldier', false);
ant('queen', 'Queen (13 mm)', 'queen', true, (a) => { a.task = Task.Idle; });
ant('gyne', 'Winged young queen', 'gyne', false, (a) => { a.wings = true; });
ant('male', 'Winged male', 'male', false, (a) => { a.wings = true; });
ant('rival', 'Neighbour worker', 'worker', false, (a) => { a.rival = true; });
ant('cpose', 'Worker in the "C" pose (phorid)', 'worker', false, (a) => { a.cpose = 1; });

// ---- brood and the dead
{
  const x = place(true);
  const list: Brood[] = [];
  const mk = (dx: number, stage: 0 | 1 | 2, fed = 0, major = false): void => {
    const b = new Brood(x + dx, GROUND - 1);
    b.stage = stage;
    b.fed = fed;
    b.major = major;
    b.age = stage === 2 ? TUNING.pupaTicks * 0.7 : 10;
    list.push(b);
  };
  mk(-12, 0); mk(-10, 0); mk(-7, 1, 0); mk(-3, 1, 2); mk(2, 1, 4, true); mk(7, 2); mk(12, 2, 0, true);
  subjects.push({ id: 'brood', label: 'Eggs, larvae, pupae (major last)', x, y: GROUND - 2, under: true, draw: (ctx, z, view) => painter.drawBrood(ctx, list, z, light, view, TUNING.pupaTicks) });
}
{
  const x = place(true);
  const list: Corpse[] = [{ x: x - 6, y: GROUND - 1, carried: false }, { x: x + 6, y: GROUND - 1, carried: false, kind: 'fungus' }];
  subjects.push({ id: 'corpse', label: 'Dead worker, dead of fungus', x, y: GROUND - 2, under: true, draw: (ctx, z, view) => painter.drawCorpses(ctx, list, z, light, view) });
}

// ---- animals
critter('hopper', 'Grasshopper (25 mm)', 'hopper', false, 9);
critter('beetle', 'Harpalus ground beetle (13 mm)', 'beetle', false, 5);
critter('spider', 'Zodarion spider (4 mm)', 'spider', false, 3, { tone: 200 });
critter('spider-walk', 'Zodarion, walking', 'spider', false, 3, { tone: 200, state: 2 });
critter('phorid', 'Phorid fly (2 mm)', 'phorid', false, 2, { air: true }, -6);
critter('antlion', 'Antlion larva', 'antlion', false, 4, { px: 0, pr: 8 } as Partial<Critter>);
critter('woodlouse', 'Blind woodlouse (nest guest)', 'woodlouse', true, 1.5);
critter('cricket', 'Ant cricket (nest guest)', 'cricket', true, 1.6);
critter('beetlet', 'Attaephilus beetle (nest guest)', 'beetlet', true, 1);
{
  // An earthworm through the soil below the open ground.
  const x = place(false);
  const body: number[] = [];
  for (let k = 0; k < 60; k++) body.push((GROUND + 12 + Math.round(Math.sin(k / 9) * 4)) * W + x + 25 - k);
  critter('worm', 'Earthworm (in the soil)', 'worm', false, 4, { body, x: x + 25, y: GROUND + 12 });
  subjects[subjects.length - 1]!.x = x;
  subjects[subjects.length - 1]!.y = GROUND + 10;
}
for (const kind of ['hopper', 'beetle', 'worm'] as const) {
  const x = place(false);
  const c = new Carcass(kind, x, GROUND - 1, 120, 1);
  subjects.push({ id: `carcass-${kind}`, label: `Dead ${kind}`, x, y: GROUND - 3, under: false, draw: (ctx, _z, view) => drawCarcasses(ctx, [c], light, view) });
}

// ---- the sheet
const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const zooms = (params.get('zooms') ?? '3,7,14').split(',').map(Number);
const rows = subjects.filter((s) => !only || only.includes(s.id));
const CELL_W = 300;
const CELL_H = 170;
const LABEL_W = 230;
const dpr = 1;
const canvas = document.createElement('canvas');
canvas.width = (LABEL_W + CELL_W * zooms.length) * dpr;
canvas.height = rows.length * CELL_H * dpr;
document.body.appendChild(canvas);
document.body.style.cssText = 'margin:0;background:#1a1410;';
const ctx = canvas.getContext('2d')!;

// Let the painter settle every ant's pose (it eases toward the sim's).
const allAnts = rows.flatMap((s) => s.ants ?? []);
for (let k = 0; k < 40; k++) painter.update(allAnts, 1 / 30, 1);

function frame(): void {
  painter.update(allAnts, 1 / 60, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  rows.forEach((s, r) => {
    const y0 = r * CELL_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e8dcc4';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(s.label, 12, y0 + 28);
    ctx.fillStyle = '#a89878';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(s.id, 12, y0 + 48);
    zooms.forEach((z, c) => {
      const cx = LABEL_W + c * CELL_W;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx + 4, y0 + 4, CELL_W - 8, CELL_H - 8);
      ctx.clip();
      // Plain backdrop: sky over soil, or a tunnel in the soil.
      const ox = cx + CELL_W / 2 - s.x * z;
      const oy = y0 + CELL_H / 2 - s.y * z;
      const gy = oy + GROUND * z;
      if (s.under) {
        ctx.fillStyle = '#3a2618';
        ctx.fillRect(cx, y0, CELL_W, CELL_H);
        ctx.fillStyle = '#5a3c26';
        ctx.fillRect(cx, oy + (GROUND - 30) * z, CELL_W, 30 * z);
      } else {
        const g = ctx.createLinearGradient(0, y0, 0, gy);
        g.addColorStop(0, '#9fb6c4');
        g.addColorStop(1, '#d8d2bc');
        ctx.fillStyle = g;
        ctx.fillRect(cx, y0, CELL_W, CELL_H);
        ctx.fillStyle = '#4a3322';
        ctx.fillRect(cx, gy, CELL_W, CELL_H);
      }
      const view = { x0: s.x - CELL_W / z, y0: s.y - CELL_H / z, x1: s.x + CELL_W / z, y1: s.y + CELL_H / z };
      ctx.setTransform(z * dpr, 0, 0, z * dpr, ox * dpr, oy * dpr);
      s.draw(ctx, z, view);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(`${z} px/mm`, cx + 10, y0 + CELL_H - 12);
      // A 5 mm scale bar.
      ctx.fillRect(cx + CELL_W - 14 - 5 * z, y0 + CELL_H - 16, 5 * z, 2);
    });
  });
  requestAnimationFrame(frame);
}
frame();
(window as unknown as { sheetReady: boolean }).sheetReady = true;
