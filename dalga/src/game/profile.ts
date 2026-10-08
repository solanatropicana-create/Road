import { loadoutLevel, type Loadout } from '../data/balance';
import { cannonUpgradeCost, MAX_CANNON_LEVEL, type CannonKind } from '../data/cannons';
import { MAX_SHIP_UPGRADE, SHIP_BY_ID, shipUpgradeCost, type ShipDef, type UpgradeStat } from '../data/ships';
import { type CannonItem, type SaveData, writeSave } from './save';

export type CrateId = 'tahta' | 'demir' | 'altin';

export interface CrateDef {
  id: CrateId;
  name: string;
  desc: string;
  gold: number;
  gems: number;
  kinds: [CannonKind, number][];
  levels: [number, number];
}

export const CRATES: CrateDef[] = [
  {
    id: 'tahta', name: 'Tahta Sandık', desc: 'Basit toplar', gold: 250, gems: 0,
    kinds: [['top', 0.5], ['karronat', 0.2], ['zincir', 0.2], ['uzun', 0.1]], levels: [1, 2],
  },
  {
    id: 'demir', name: 'Demir Sandık', desc: 'Havan şansı', gold: 2200, gems: 0,
    kinds: [['top', 0.25], ['uzun', 0.2], ['karronat', 0.2], ['zincir', 0.15], ['havan', 0.2]], levels: [2, 4],
  },
  {
    id: 'altin', name: 'Altın Sandık', desc: 'Zıpkın ve yüksek seviye', gold: 0, gems: 40,
    kinds: [['uzun', 0.2], ['karronat', 0.2], ['havan', 0.25], ['zipkin', 0.25], ['zincir', 0.1]], levels: [4, 6],
  },
];

export class Profile {
  constructor(public s: SaveData) {}

  save() {
    writeSave(this.s);
  }

  get def(): ShipDef {
    return SHIP_BY_ID[this.s.ship];
  }

  /** How far the player has pushed: scales crate contents and prices. */
  get progress(): number {
    return Math.max(0, this.s.ports.length - 1);
  }

  cannon(id: number | null): CannonItem | null {
    if (id === null) return null;
    return this.s.cannons.find((c) => c.id === id) ?? null;
  }

  loadout(shipId = this.s.ship): Loadout {
    const ss = this.s.ships[shipId];
    return {
      shipId,
      upgrades: ss.up,
      guns: ss.slots.map((id) => {
        const c = this.cannon(id);
        return c ? { kind: c.kind, level: c.level } : null;
      }),
      hpMul: 1,
    };
  }

  level(shipId = this.s.ship): number {
    return loadoutLevel(this.loadout(shipId));
  }

  /** Where a cannon is mounted, if anywhere. */
  mountedOn(id: number): { ship: string; slot: number } | null {
    for (const [ship, ss] of Object.entries(this.s.ships)) {
      const i = ss.slots.indexOf(id);
      if (i >= 0) return { ship, slot: i };
    }
    return null;
  }

  equip(slot: number, id: number | null) {
    const ss = this.s.ships[this.s.ship];
    if (id !== null) {
      const at = this.mountedOn(id);
      if (at) this.s.ships[at.ship].slots[at.slot] = null;
    }
    ss.slots[slot] = id;
    this.save();
  }

  addCannon(kind: CannonKind, level: number): CannonItem {
    const c = { id: this.s.nextCannonId++, kind, level };
    this.s.cannons.push(c);
    return c;
  }

  /** Two identical cannons fuse into one of the next level. */
  canMerge(a: CannonItem, b: CannonItem) {
    return a.id !== b.id && a.kind === b.kind && a.level === b.level && a.level < MAX_CANNON_LEVEL;
  }

  merge(a: CannonItem, b: CannonItem): boolean {
    if (!this.canMerge(a, b)) return false;
    // Keep whichever is mounted so the slot stays filled.
    let keep = a, drop = b;
    if (!this.mountedOn(a.id) && this.mountedOn(b.id)) { keep = b; drop = a; }
    const at = this.mountedOn(drop.id);
    if (at) this.s.ships[at.ship].slots[at.slot] = null;
    this.s.cannons = this.s.cannons.filter((c) => c.id !== drop.id);
    keep.level++;
    this.save();
    return true;
  }

  /** Merges every possible pair, lowest levels first. Returns how many merges happened. */
  autoMerge(): number {
    let n = 0;
    for (;;) {
      const sorted = [...this.s.cannons].sort((x, y) => x.level - y.level);
      let done = false;
      for (let i = 0; i < sorted.length && !done; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          if (this.canMerge(sorted[i], sorted[j])) {
            this.merge(sorted[i], sorted[j]);
            n++;
            done = true;
            break;
          }
        }
      }
      if (!done) break;
    }
    return n;
  }

  upgradeCannonCost(c: CannonItem) {
    return cannonUpgradeCost(c.level);
  }

  upgradeCannon(c: CannonItem): boolean {
    if (c.level >= MAX_CANNON_LEVEL) return false;
    const cost = this.upgradeCannonCost(c);
    if (this.s.gold < cost) return false;
    this.s.gold -= cost;
    c.level++;
    this.save();
    return true;
  }

  sellValue(c: CannonItem) {
    return Math.round((cannonUpgradeCost(c.level) * 0.35) / 10) * 10;
  }

  sell(c: CannonItem) {
    const at = this.mountedOn(c.id);
    if (at) this.s.ships[at.ship].slots[at.slot] = null;
    this.s.gold += this.sellValue(c);
    this.s.cannons = this.s.cannons.filter((x) => x.id !== c.id);
    this.save();
  }

  shipUpgradeCost(stat: UpgradeStat) {
    return shipUpgradeCost(this.def, stat, this.s.ships[this.s.ship].up[stat]);
  }

  upgradeShip(stat: UpgradeStat): boolean {
    const up = this.s.ships[this.s.ship].up;
    if (up[stat] >= MAX_SHIP_UPGRADE) return false;
    const cost = this.shipUpgradeCost(stat);
    if (this.s.gold < cost) return false;
    this.s.gold -= cost;
    up[stat]++;
    this.save();
    return true;
  }

  buyShip(id: string): boolean {
    const def = SHIP_BY_ID[id];
    const ss = this.s.ships[id];
    if (ss.owned) return false;
    if (this.s.gold < def.priceGold || this.s.gems < def.priceGems) return false;
    this.s.gold -= def.priceGold;
    this.s.gems -= def.priceGems;
    ss.owned = true;
    // Move over as many guns as fit from the current ship, best first.
    const old = this.s.ships[this.s.ship];
    const items = old.slots
      .map((cid) => this.cannon(cid))
      .filter((c): c is CannonItem => !!c)
      .sort((a, b) => b.level - a.level);
    old.slots = old.slots.map(() => null);
    ss.slots = def.slots.map((_, i) => items[i]?.id ?? null);
    this.s.ship = id;
    this.save();
    return true;
  }

  selectShip(id: string): boolean {
    if (!this.s.ships[id].owned) return false;
    this.s.ship = id;
    this.save();
    return true;
  }

  crateCost(c: CrateDef) {
    const m = 1 + this.progress * 1.4;
    return { gold: Math.round((c.gold * m) / 10) * 10, gems: Math.round(c.gems * (1 + this.progress * 0.5)) };
  }

  openCrate(c: CrateDef): CannonItem | null {
    const cost = this.crateCost(c);
    if (this.s.gold < cost.gold || this.s.gems < cost.gems) return null;
    this.s.gold -= cost.gold;
    this.s.gems -= cost.gems;
    const item = this.rollCrate(c);
    this.save();
    return item;
  }

  rollCrate(c: CrateDef): CannonItem {
    let r = Math.random();
    let kind: CannonKind = c.kinds[0][0];
    for (const [k, w] of c.kinds) {
      if (r < w) { kind = k; break; }
      r -= w;
    }
    const lvl = Math.min(MAX_CANNON_LEVEL, c.levels[0] + Math.floor(Math.random() * (c.levels[1] - c.levels[0] + 1)) + this.progress);
    return this.addCannon(kind, lvl);
  }

  /** Auto-fills empty slots with the best free cannons. */
  autoEquip() {
    const ss = this.s.ships[this.s.ship];
    const free = this.s.cannons.filter((c) => !this.mountedOn(c.id)).sort((a, b) => b.level - a.level);
    ss.slots = ss.slots.map((id) => {
      if (id !== null) return id;
      const c = free.shift();
      return c ? c.id : null;
    });
    this.save();
  }
}
