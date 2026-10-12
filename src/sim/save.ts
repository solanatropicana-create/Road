import { Sim } from './sim';
import { Ant } from './ant';
import { Brood } from './brood';
import { Colony } from './colony';
import { Nest } from './nest';
import { Fields, FIELD_COUNT } from './fields';
import { Particles } from './particles';
import { World } from '../world/world';
import { Physics } from '../world/physics';
import { Moisture } from '../world/moisture';
import { Plants, Plant } from '../world/plants';
import { Rng } from '../util/rng';
import { Noise } from '../util/noise';
import { Calendar } from './calendar';
import { Ecology } from './ecology';
import { Critters } from './critters';
import { Neighbour } from './rivals';
import { Fog, FOG } from './fog';
import { Carcass, Carcasses } from './carcass';

/**
 * Saving a colony: the whole simulation object graph, written generically.
 * Objects keep their identity (an ant carrying a larva points at the same
 * Brood the colony lists), class instances get their prototype back, typed
 * arrays are stored as bytes. Big buffers that can be rebuilt (distance
 * fields, scratch space) are left out and rebuilt on load.
 */

const CLASSES: Record<string, { prototype: object }> = {
  Sim, Ant, Brood, Colony, Nest, Particles, World, Physics, Moisture, Plants, Plant, Rng, Noise, Calendar, Ecology, Critters, Neighbour, Fog, Carcass, Carcasses,
};

const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
};

// Look classes up by constructor, not by name: the production build renames classes.
const CLASS_NAME = new Map<unknown, string>(Object.entries(CLASSES).map(([k, c]) => [c, k]));
const TYPED_NAME = new Map<unknown, string>(Object.entries(TYPED).map(([k, c]) => [c, k]));

/** Properties not worth saving: rebuilt from the rest on load. */
const SKIP: Record<string, string[]> = {
  Sim: ['fields', 'src', 'events', 'flyers'],
  Physics: ['stamp'],
  Colony: ['occ'],
};

type Enc = number | string | boolean | null | { r: number } | { n: string } | { u: 1 };

function encodeGraph(root: object, bins: Uint8Array[]): { root: Enc; table: unknown[] } {
  const ids = new Map<object, number>();
  const table: unknown[] = [];
  const enc = (v: unknown): Enc | undefined => {
    if (v === null) return null;
    switch (typeof v) {
      case 'number':
        return Number.isFinite(v) ? v : { n: String(v) };
      case 'string':
      case 'boolean':
        return v;
      case 'undefined':
        return { u: 1 };
      case 'function':
        return undefined;
    }
    const o = v as object;
    const seen = ids.get(o);
    if (seen !== undefined) return { r: seen };
    const id = table.length;
    ids.set(o, id);
    table.push(null);
    if (ArrayBuffer.isView(o)) {
      const name = TYPED_NAME.get(o.constructor)!;
      // Raw bytes go in a binary section after the JSON (no base64 inside).
      table[id] = { t: name, i: bins.length };
      bins.push(new Uint8Array(o.buffer, o.byteOffset, o.byteLength));
    } else if (Array.isArray(o)) {
      table[id] = { a: o.map((x) => enc(x) ?? null) };
    } else if (o instanceof Map) {
      table[id] = { m: [...o.entries()].map(([k, x]) => [enc(k), enc(x)]) };
    } else if (o instanceof Set) {
      table[id] = { s: [...o].map((x) => enc(x)) };
    } else {
      const name = CLASS_NAME.get(o.constructor) ?? '';
      const skip = SKIP[name] ?? [];
      const p: Record<string, Enc> = {};
      for (const k of Object.keys(o)) {
        if (skip.includes(k)) continue;
        const e = enc((o as Record<string, unknown>)[k]);
        if (e !== undefined) p[k] = e;
      }
      table[id] = { c: name, p };
    }
    return { r: id };
  };
  return { root: enc(root)!, table };
}

function decodeGraph(data: { root: Enc; table: unknown[] }, bins: Uint8Array[]): unknown {
  const out: unknown[] = new Array(data.table.length);
  const raw = data.table as Record<string, unknown>[];
  // First pass: allocate every object so references can be wired in any order.
  raw.forEach((t, id) => {
    if ('t' in t) {
      const bytes = bins[t.i as number]!;
      const Ctor = TYPED[t.t as string]!;
      out[id] = new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } else if ('a' in t) out[id] = [];
    else if ('m' in t) out[id] = new Map();
    else if ('s' in t) out[id] = new Set();
    else {
      const proto = CLASSES[t.c as string]?.prototype ?? Object.prototype;
      out[id] = Object.create(proto);
    }
  });
  const dec = (e: Enc): unknown => {
    if (e === null || typeof e !== 'object') return e;
    if ('r' in e) return out[e.r];
    if ('n' in e) return Number(e.n);
    return undefined;
  };
  raw.forEach((t, id) => {
    const o = out[id];
    if ('a' in t) for (const x of t.a as Enc[]) (o as unknown[]).push(dec(x));
    else if ('m' in t) for (const [k, x] of t.m as [Enc, Enc][]) (o as Map<unknown, unknown>).set(dec(k), dec(x));
    else if ('s' in t) for (const x of t.s as Enc[]) (o as Set<unknown>).add(dec(x));
    else if ('p' in t) for (const [k, x] of Object.entries(t.p as Record<string, Enc>)) (o as Record<string, unknown>)[k] = dec(x);
  });
  return dec(data.root);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function gzip(parts: BlobPart[]): Promise<Uint8Array> {
  const stream = new Blob(parts).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// v3: sites, seasons and the year's ecology. Older saves are not compatible and are ignored.
export const SAVE_KEY = 'underfoot.save3';
export const META_KEY = 'underfoot.meta3';

/** The saved colony's summary, if there is one (storage may be unavailable). */
export function savedMeta(): SaveMeta | null {
  try {
    const m = localStorage.getItem(META_KEY);
    return m ? (JSON.parse(m) as SaveMeta) : null;
  } catch {
    return null;
  }
}

export interface SaveMeta {
  seed: number;
  day: number;
  adults: number;
  savedAt: number;
}

/** Everything needed to bring a colony back, compressed and base64'd for storage. */
export async function saveSim(sim: Sim, extra: unknown = null): Promise<{ meta: SaveMeta; blob: string }> {
  // Layout: [4-byte JSON length][JSON][byte length + bytes of each typed array], gzipped.
  const bins: Uint8Array[] = [];
  const graph = encodeGraph(sim, bins);
  const json = new TextEncoder().encode(JSON.stringify({ v: 3, graph, statics: { ant: Ant.nextId, brood: Brood.nextId }, extra }));
  const parts: BlobPart[] = [new Uint32Array([json.length]), json];
  for (const b of bins) parts.push(new Uint32Array([b.length]), b as BlobPart);
  const blob = bytesToB64(await gzip(parts));
  return { meta: { seed: sim.seed, day: sim.day, adults: sim.colony.adults, savedAt: Date.now() }, blob };
}

/** Saves from before the fog and the list of neighbours: fill them in from what they had. */
function upgrade(sim: Sim): void {
  const o = sim as unknown as { fog?: Fog; neighbours?: Neighbour[]; neighbour?: Neighbour | null };
  const w = sim.world;
  if (!o.fog) {
    // What the old growing view showed counts as known.
    const fog = new Fog(w.w, w.h);
    const v = sim.view;
    for (let gy = 0; gy < fog.gh; gy++) {
      for (let gx = 0; gx < fog.gw; gx++) {
        const x = gx * FOG;
        if (x >= v.x0 && x < v.x1 && gy * FOG < v.y1) fog.seen[gy * fog.gw + gx] = 255;
      }
    }
    for (let gx = 0; gx < fog.gw; gx++) if (gx * FOG >= v.x0 && gx * FOG < v.x1) fog.sky[gx] = 255;
    Object.assign(fog.box, { x0: v.x0, x1: v.x1, y1: v.y1 });
    o.fog = fog;
  }
  // Saves from before alarm, temperament, the gate queue, the second gate and the searcher's heading.
  const ants = [...sim.colony.ants, ...sim.colony.alates, ...(o.neighbours ?? (o.neighbour ? [o.neighbour] : [])).flatMap((nb) => nb.ants)];
  for (const a of ants) {
    const x = a as unknown as { alarm?: number; zeal?: number; sent?: boolean; waiting?: boolean; lastDX?: number };
    if (x.alarm === undefined) x.alarm = 0;
    if (x.lastDX === undefined) x.lastDX = 0;
    if (x.sent === undefined) x.sent = false;
    if (x.waiting === undefined) x.waiting = false;
    if (x.zeal === undefined) x.zeal = a.id % 4 === 0 ? 0.25 : 0.75;
  }
  const col = sim.colony as unknown as { scoutChance?: number; returns?: number; harvestLeft?: number; harvestRight?: number };
  col.scoutChance ??= 0.002;
  col.returns ??= 0;
  col.harvestLeft ??= 0;
  col.harvestRight ??= 0;
  const nest = sim.nest as unknown as { gateX?: number; gateShaft?: number[] };
  if (nest.gateX === undefined) {
    nest.gateX = -1;
    nest.gateShaft = [];
  }
  const oc = sim as unknown as { carcasses?: Carcasses };
  oc.carcasses ??= new Carcasses();
  if (!o.neighbours) {
    const list = o.neighbour ? [o.neighbour] : [];
    for (const nb of list) {
      Object.assign(nb, { homeX: 0, queen: null, arriveWeek: 0, reach: 650, found: true, dead: false, lastWeek: -1 });
      for (const a of nb.ants) a.rivalOf = nb;
    }
    o.neighbours = list;
    delete o.neighbour;
  }
}

export async function loadSim(blob: string): Promise<{ sim: Sim; extra: unknown }> {
  const raw = await gunzip(b64ToBytes(blob));
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const jlen = view.getUint32(0, true);
  const json = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + jlen)));
  if (json.v !== 3) throw new Error(`unknown save version ${json.v}`);
  const bins: Uint8Array[] = [];
  for (let off = 4 + jlen; off < raw.length; ) {
    const n = view.getUint32(off, true);
    bins.push(raw.slice(off + 4, off + 4 + n));
    off += 4 + n;
  }
  const sim = decodeGraph(json.graph, bins) as Sim;
  Ant.nextId = json.statics.ant;
  Brood.nextId = json.statics.brood;
  // Rebuild what was left out.
  const w = sim.world;
  const s = sim as unknown as { fields: Fields; src: Int32Array; events: string[]; flyers: unknown[] };
  s.fields = new Fields(w);
  s.src = new Int32Array(w.size);
  s.events = [];
  s.flyers = [];
  (sim.physics as unknown as { stamp: Uint8Array }).stamp = new Uint8Array(w.size);
  (sim.colony as unknown as { occ: Int32Array | null }).occ = null;
  upgrade(sim);
  for (let f = 0; f < FIELD_COUNT; f++) (sim as unknown as { buildField(f: number): void }).buildField(f);
  w.dirtyAll = true;
  return { sim, extra: json.extra };
}
