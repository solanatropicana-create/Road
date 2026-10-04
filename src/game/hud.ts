import type { Ship } from '../sim/ship';
import type { TileKind } from '../sim/defs';

const TRACK: { kind: TileKind; label: string }[] = [
  { kind: 'reactor', label: 'Reaktör' },
  { kind: 'gyro', label: 'Jiroskop' },
  { kind: 'stabilizer', label: 'Stabilizör' },
  { kind: 'thruster', label: 'Ana itici' },
  { kind: 'rcs', label: 'Manevra' },
  { kind: 'cannon', label: 'Top' },
  { kind: 'laser', label: 'Lazer' },
];

export interface ShipSnapshot {
  initial: Partial<Record<TileKind, number>>;
}

export function snapshot(ship: Ship): ShipSnapshot {
  const initial: Partial<Record<TileKind, number>> = {};
  for (const t of ship.tiles.values()) initial[t.def.kind] = (initial[t.def.kind] ?? 0) + 1;
  return { initial };
}

/** Renders a ship status card into an element. */
export function renderCard(el: HTMLElement, ship: Ship, snap: ShipSnapshot, title: string): void {
  const struct = Math.round(ship.structure * 100);
  const supply = ship.powerSupply;
  const demand = ship.powerDemand;
  const powerPct = demand > 0 ? Math.min(100, Math.round((supply / demand) * 100)) : 100;
  let fa: string;
  let faCls: string;
  const stab = ship.count('stabilizer', true);
  if (!ship.controllable) {
    fa = 'KONTROL YOK';
    faCls = 'bad';
  } else if (stab === 0) {
    fa = 'ASİSTAN ARIZALI';
    faCls = 'bad';
  } else if (ship.assistActive) {
    fa = 'ASİSTAN AÇIK';
    faCls = 'ok';
  } else {
    fa = 'DRİFT MODU';
    faCls = 'warn';
  }
  const rows = TRACK.filter((r) => (snap.initial[r.kind] ?? 0) > 0)
    .map((r) => {
      const total = snap.initial[r.kind] ?? 0;
      const alive = ship.count(r.kind);
      const on = ship.count(r.kind, true);
      const cls = on === total ? 'ok' : on === 0 ? 'bad' : 'warn';
      const pips = Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : i < alive ? 'dark' : 'gone'}"></i>`).join('');
      return `<div class="sys ${cls}"><span>${r.label}</span><b>${pips}</b></div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="card-head"><span class="tag">${title}</span><strong>${ship.name}</strong></div>
    <div class="meter"><span>Yapı</span><div class="bar"><i style="width:${struct}%"></i></div><em>${struct}%</em></div>
    <div class="meter power"><span>Güç</span><div class="bar"><i style="width:${powerPct}%"></i></div><em>${supply.toFixed(0)}/${demand.toFixed(1)}</em></div>
    <div class="fa ${faCls}">${fa}</div>
    <div class="systems">${rows}</div>`;
}
