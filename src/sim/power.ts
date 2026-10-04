import { DIR_VEC } from './defs';
import type { Ship, Tile } from './ship';

/**
 * Power network: conducting tiles (conduits + modules) form connected
 * components. Each component pools its reactors' output and serves demands in
 * priority order. A module that gets cut off from every reactor goes dark.
 */
export function solvePower(ship: Ship): void {
  let comp = 0;
  for (const t of ship.tiles.values()) t.net = -1;
  let totalSupply = 0;
  let totalDemand = 0;

  for (const start of ship.tiles.values()) {
    if (!start.def.conducts || start.net >= 0) continue;
    const members: Tile[] = [];
    const stack = [start];
    start.net = comp;
    while (stack.length) {
      const t = stack.pop()!;
      members.push(t);
      for (const d of DIR_VEC) {
        const n = ship.tileAt(t.x + d.x, t.y + d.y);
        if (n && n.def.conducts && n.net < 0) {
          n.net = comp;
          stack.push(n);
        }
      }
    }

    let supply = 0;
    for (const m of members) if (m.def.power > 0) supply += m.def.power;
    totalSupply += supply;
    // Serve consumers by priority, then by position for determinism.
    const consumers = members
      .filter((m) => m.def.power < 0)
      .sort((a, b) => a.def.priority - b.def.priority || a.y - b.y || a.x - b.x);
    let left = supply;
    for (const c of consumers) {
      const need = -c.def.power;
      totalDemand += need;
      if (left + 1e-6 >= need) {
        c.powered = true;
        left -= need;
      } else {
        c.powered = false;
      }
    }
    for (const m of members) {
      if (m.def.power > 0) m.powered = true;
      else if (m.def.power === 0) m.powered = supply > 0;
    }
    comp++;
  }
  for (const t of ship.tiles.values()) if (!t.def.conducts) t.powered = false;

  ship.powerSupply = totalSupply;
  ship.powerDemand = totalDemand;
  ship.powerDirty = false;
  ship.visualVersion++;

  let ctrl = false;
  for (const t of ship.tiles.values()) if (t.def.kind === 'bridge' && t.powered) ctrl = true;
  ship.controllable = ctrl;
}
