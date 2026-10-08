import type { CannonKind } from '../data/cannons';
import { SHIPS, type ShipUpgrades } from '../data/ships';

export interface CannonItem {
  id: number;
  kind: CannonKind;
  level: number;
}

export interface ShipSave {
  owned: boolean;
  up: ShipUpgrades;
  /** Cannon item id per slot. */
  slots: (number | null)[];
}

export interface SaveData {
  v: 1;
  gold: number;
  gems: number;
  ship: string;
  ships: Record<string, ShipSave>;
  cannons: CannonItem[];
  nextCannonId: number;
  ports: string[];
  lastPort: string;
  bosses: Record<string, number>;
  stats: { sunk: number; bossKills: number; deaths: number; earned: number };
  tutorial: boolean;
  sound: boolean;
  quality?: 'high' | 'low';
  freeCrateAt?: number;
}

const KEY = 'dalga-save-v1';

export function freshSave(): SaveData {
  const ships: Record<string, ShipSave> = {};
  for (const s of SHIPS) ships[s.id] = { owned: s.id === 'sandal', up: { hp: 0, speed: 0, hold: 0 }, slots: s.slots.map(() => null) };
  const save: SaveData = {
    v: 1, gold: 150, gems: 10, ship: 'sandal', ships,
    cannons: [
      { id: 1, kind: 'top', level: 1 },
      { id: 2, kind: 'top', level: 1 },
    ],
    nextCannonId: 3,
    ports: ['liman'],
    lastPort: 'liman',
    bosses: {},
    stats: { sunk: 0, bossKills: 0, deaths: 0, earned: 0 },
    tutorial: true,
    sound: true,
  };
  save.ships.sandal.slots = [1, 2];
  return save;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as SaveData;
      if (s.v === 1) {
        // Ships added after the save was written.
        for (const def of SHIPS) {
          if (!s.ships[def.id]) s.ships[def.id] = { owned: false, up: { hp: 0, speed: 0, hold: 0 }, slots: def.slots.map(() => null) };
        }
        return s;
      }
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
  return freshSave();
}

export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
