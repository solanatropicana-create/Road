import { Rng } from '../core/rng';
import { cannonDps, CannonKind } from './cannons';
import { SHIP_BY_ID, ShipDef, ShipUpgrades, shipStats } from './ships';
import type { Faction } from './world';

export interface Loadout {
  shipId: string;
  upgrades: ShipUpgrades;
  /** One entry per slot; null = empty slot. */
  guns: ({ kind: CannonKind; level: number } | null)[];
  hpMul: number;
}

export function powerOf(def: ShipDef, up: ShipUpgrades, guns: Loadout['guns'], hpMul = 1): number {
  let dps = 0;
  for (const g of guns) if (g) dps += cannonDps(g.kind, g.level);
  const hp = (shipStats(def, up).hp * hpMul) / (1 - def.armor);
  return dps + hp / 12;
}

export function levelFromPower(p: number): number {
  return Math.max(1, Math.round(1 + 4.6 * Math.log2(Math.max(p, 1) / 14)));
}

export function loadoutLevel(l: Loadout): number {
  return levelFromPower(powerOf(SHIP_BY_ID[l.shipId], l.upgrades, l.guns, l.hpMul));
}

const NO_UP = { hp: 0, speed: 0, hold: 0 };

/** Level of a ship with every slot holding a level-1 gun: its "natural" floor. */
const naturalLevel: Record<string, number> = {};
for (const id of Object.keys(SHIP_BY_ID)) {
  const def = SHIP_BY_ID[id];
  naturalLevel[id] = loadoutLevel({ shipId: id, upgrades: NO_UP, guns: def.slots.map(() => ({ kind: 'top' as CannonKind, level: 1 })), hpMul: 1 });
}

function shipForLevel(level: number, faction: Faction, rng: Rng): string {
  let ids = Object.keys(SHIP_BY_ID).filter((id) => id !== 'hayalet' && naturalLevel[id] <= level + 1);
  if (faction === 'ghost') ids = ['firkateyn', 'hayalet'].filter((id) => naturalLevel[id] <= level + 1);
  if (!ids.length) return faction === 'ghost' ? 'firkateyn' : 'sandal';
  // The three biggest hulls that fit, biggest most likely.
  ids.sort((a, b) => SHIP_BY_ID[b].tier - SHIP_BY_ID[a].tier);
  const top = ids.slice(0, 3);
  const r = rng.next();
  return r < 0.5 ? top[0] : r < 0.8 || top.length < 3 ? top[Math.min(1, top.length - 1)] : top[2];
}

const KIND_POOL: Record<Faction, CannonKind[]> = {
  player: ['top'],
  pirate: ['top', 'top', 'karronat', 'zincir', 'zipkin'],
  navy: ['top', 'uzun', 'uzun', 'top'],
  merchant: ['top', 'uzun'],
  ghost: ['top', 'karronat', 'havan', 'zincir'],
};

/** Builds an AI loadout whose computed level lands as close as possible to the target. */
export function enemyLoadout(target: number, faction: Faction, rng: Rng, shipId?: string, hpMul = 1): Loadout {
  const id = shipId ?? shipForLevel(target, faction, rng);
  const def = SHIP_BY_ID[id];
  const kinds = def.slots.map((s) => (s.turret ? ('havan' as CannonKind) : rng.pick(KIND_POOL[faction])));
  // Fill order: broadside pairs first, then chasers.
  const order = def.slots.map((_, i) => i).sort((a, b) => Math.abs(def.slots[b].z) - Math.abs(def.slots[a].z));
  const maxFill = faction === 'merchant' ? Math.max(1, Math.ceil(def.slots.length / 2)) : def.slots.length;
  let best: Loadout | null = null;
  let bestErr = Infinity;
  for (let fill = 1; fill <= maxFill; fill++) {
    const active = new Set(order.slice(0, fill));
    for (let gl = 1; gl <= 10; gl++) {
      for (let ul = 0; ul <= 10; ul += 2) {
        const up = { hp: ul, speed: Math.floor(ul / 2), hold: 0 };
        const guns = kinds.map((k, i) => (active.has(i) ? { kind: k, level: gl } : null));
        const l: Loadout = { shipId: id, upgrades: up, guns, hpMul };
        // Prefer full decks and modest upgrades among equal fits.
        const err = Math.abs(loadoutLevel(l) - target) + (maxFill - fill) * 0.02 + ul * 0.005;
        if (err < bestErr) { bestErr = err; best = l; }
      }
    }
  }
  return best!;
}

export function bountyFor(level: number, faction: Faction): number {
  const mul = { player: 1, pirate: 1, navy: 1.2, merchant: 2.2, ghost: 1.5 }[faction];
  return Math.round((90 * Math.pow(1.22, level - 1) * mul) / 5) * 5;
}
