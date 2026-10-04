import * as planck from 'planck';
import { CHAR_MAP, DIR_VEC, TILE_DEFS, type Dir, type TileDef, type TileKind } from './defs';
import type { Blueprint } from './blueprints';

export interface ShipInput {
  /** -1..1, +1 = forward */
  thrust: number;
  /** -1..1, +1 = right */
  strafe: number;
  /** -1..1, +1 = clockwise */
  turn: number;
  /** Flight assist requested (needs a working stabilizer). */
  assist: boolean;
  aim: { x: number; y: number };
  fireCannon: boolean;
  fireLaser: boolean;
}

export const emptyInput = (): ShipInput => ({
  thrust: 0,
  strafe: 0,
  turn: 0,
  assist: true,
  aim: { x: 0, y: 0 },
  fireCannon: false,
  fireLaser: false,
});

export interface Tile {
  x: number;
  y: number;
  def: TileDef;
  hp: number;
  dir: Dir;
  powered: boolean;
  /** 0..1 visual heat from recent damage/laser. */
  heat: number;
  /** 0..1 last thruster throttle (visual + physics). */
  throttle: number;
  /** Turret angle relative to ship (radians, 0 = ship forward). */
  turret: number;
  cooldown: number;
  /** Turret line of fire is blocked by own hull this tick. */
  blocked: boolean;
  firing: boolean;
  fixture: planck.Fixture | null;
  /** Component id in the power network. */
  net: number;
}

export interface FixtureData {
  ship: Ship;
  tile: Tile;
}

export const key = (x: number, y: number): number => (x + 512) * 1024 + (y + 512);

let nextShipId = 1;

export class Ship {
  readonly id = nextShipId++;
  name: string;
  /** -1 = inert debris */
  team: number;
  /** Team the material originally belonged to (for colours). */
  origin: number;
  body: planck.Body;
  tiles = new Map<number, Tile>();
  input: ShipInput = emptyInput();
  /** Set when tiles change: triggers split check + power solve + redraw. */
  structureDirty = true;
  powerDirty = true;
  /** Bumped whenever the visual needs a rebuild. */
  visualVersion = 0;
  /** Seconds since this body became debris (for cleanup). */
  age = 0;
  /** Flight state (for HUD/visuals). */
  assistActive = false;
  powerSupply = 0;
  powerDemand = 0;
  gyroOut = 0;
  /** Tile count at spawn, for structure %. */
  initialTiles = 0;
  blueprintId = '';
  /** Ship has a live bridge connected to power: it can be controlled. */
  controllable = false;
  bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor(world: planck.World, name: string, team: number, pos: planck.Vec2Value, angle: number) {
    this.name = name;
    this.team = team;
    this.origin = team;
    this.body = world.createBody({
      type: 'dynamic',
      position: planck.Vec2(pos.x, pos.y),
      angle,
      linearDamping: 0,
      angularDamping: 0,
    });
    this.body.setSleepingAllowed(false);
    this.body.setUserData(this);
  }

  static fromBlueprint(world: planck.World, bp: Blueprint, team: number, pos: planck.Vec2Value, angle: number): Ship {
    const ship = new Ship(world, bp.name, team, pos, angle);
    ship.blueprintId = bp.id;
    const h = bp.rows.length;
    const w = Math.max(...bp.rows.map((r) => r.length));
    const ox = Math.floor(w / 2);
    const oy = Math.floor(h / 2);
    bp.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const m = CHAR_MAP[ch];
        if (!m) return;
        ship.addTile(x - ox, y - oy, m.kind, m.dir ?? 0);
      });
    });
    ship.initialTiles = ship.tiles.size;
    ship.recomputeBounds();
    return ship;
  }

  addTile(x: number, y: number, kind: TileKind, dir: Dir, hp?: number): Tile {
    const def = TILE_DEFS[kind];
    const tile: Tile = {
      x,
      y,
      def,
      hp: hp ?? def.hp,
      dir,
      powered: false,
      heat: 0,
      throttle: 0,
      turret: 0,
      cooldown: 0,
      blocked: false,
      firing: false,
      fixture: null,
      net: -1,
    };
    this.attachFixture(tile);
    this.tiles.set(key(x, y), tile);
    this.structureDirty = true;
    this.powerDirty = true;
    return tile;
  }

  attachFixture(tile: Tile): void {
    const shape = planck.Box(0.5, 0.5, planck.Vec2(tile.x, tile.y), 0);
    tile.fixture = this.body.createFixture(shape, {
      density: tile.def.mass,
      friction: 0.4,
      restitution: 0.15,
      userData: { ship: this, tile } satisfies FixtureData,
    });
  }

  /** Move an existing tile object into this ship (used when splitting). */
  adoptTile(tile: Tile): void {
    this.attachFixture(tile);
    this.tiles.set(key(tile.x, tile.y), tile);
    this.structureDirty = true;
    this.powerDirty = true;
  }

  removeTile(tile: Tile): void {
    if (tile.fixture) {
      this.body.destroyFixture(tile.fixture);
      tile.fixture = null;
    }
    this.tiles.delete(key(tile.x, tile.y));
    this.structureDirty = true;
    this.powerDirty = true;
    this.visualVersion++;
  }

  tileAt(x: number, y: number): Tile | undefined {
    return this.tiles.get(key(x, y));
  }

  recomputeBounds(): void {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const t of this.tiles.values()) {
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    this.bounds = { minX, maxX, minY, maxY };
  }

  /** World position of a tile centre. */
  tileWorld(t: Tile): planck.Vec2 {
    return this.body.getWorldPoint(planck.Vec2(t.x, t.y));
  }

  /** Exhaust direction of a thruster in local space (force is the opposite). */
  static exhaust(t: Tile): { x: number; y: number } {
    return DIR_VEC[t.dir]!;
  }

  count(kind: TileKind, poweredOnly = false): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.def.kind === kind && (!poweredOnly || t.powered)) n++;
    return n;
  }

  get isDebris(): boolean {
    return this.team < 0;
  }

  get structure(): number {
    return this.initialTiles > 0 ? this.tiles.size / this.initialTiles : 0;
  }
}
