/**
 * Where colonies are kept: one slot per colony, in IndexedDB (a save is well
 * over a megabyte, so localStorage holds one at most). Where IndexedDB can't
 * be opened (some private windows) it falls back to the single localStorage
 * save the game always had. A save from before slots is moved into a slot the
 * first time the game starts.
 *
 * The list of slots is cached so the title screen can read it at once.
 */
import { SAVE_KEY, META_KEY, type SaveMeta } from './save';

export interface SlotMeta extends SaveMeta {
  id: string;
  /** The colony's name key and its queen's name, for the list. */
  colony?: string;
  queen?: string;
}

const DB = 'underfoot';
const STORE = 'slots';

let db: IDBDatabase | null = null;
let cache: SlotMeta[] = [];
let ready = false;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

function sortCache(): void {
  cache.sort((a, b) => b.savedAt - a.savedAt);
}

export function newSlotId(): string {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Open the store, bring in an old single save, and read the list. Safe to call more than once. */
export async function initSlots(): Promise<void> {
  if (ready) return;
  ready = true;
  db = await open();
  if (!db) {
    // No IndexedDB: the one localStorage save is the only slot.
    try {
      const m = localStorage.getItem(META_KEY);
      if (m) cache = [{ id: 'local', ...(JSON.parse(m) as SaveMeta) }];
    } catch {
      cache = [];
    }
    return;
  }
  try {
    const old = localStorage.getItem(SAVE_KEY);
    const oldMeta = localStorage.getItem(META_KEY);
    if (old && oldMeta) {
      const meta = { id: newSlotId(), ...(JSON.parse(oldMeta) as SaveMeta) };
      await writeSlot(meta, old);
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(META_KEY);
    }
  } catch {
    // Storage unavailable or a broken old save: start from what IndexedDB has.
  }
  try {
    const all = (await req(db.transaction(STORE).objectStore(STORE).getAll())) as (SlotMeta & { blob?: string })[];
    cache = all.map(({ blob: _b, ...m }) => m);
    sortCache();
  } catch {
    cache = [];
  }
}

/** The colonies kept, newest first. */
export function listSlots(): SlotMeta[] {
  return cache;
}

export function latestSlot(): SlotMeta | null {
  return cache[0] ?? null;
}

export async function readSlot(id: string): Promise<string | null> {
  if (!db) {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }
  const r = (await req(db.transaction(STORE).objectStore(STORE).get(id))) as { blob?: string } | undefined;
  return r?.blob ?? null;
}

export async function writeSlot(meta: SlotMeta, blob: string): Promise<void> {
  if (!db) {
    localStorage.setItem(SAVE_KEY, blob);
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    cache = [{ ...meta, id: 'local' }];
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ ...meta, blob });
  await new Promise<void>((ok, fail) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
  });
  cache = cache.filter((m) => m.id !== meta.id);
  cache.push(meta);
  sortCache();
}

export async function removeSlot(id: string): Promise<void> {
  cache = cache.filter((m) => m.id !== id);
  if (!db) {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(META_KEY);
    } catch {
      // nothing stored
    }
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((ok) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ok();
  });
}

/** A colony as a file the player can keep or move to another machine. */
export interface SaveFile {
  format: 'underfoot-colony';
  v: 3;
  meta: SlotMeta;
  blob: string;
}

export async function exportSlot(id: string): Promise<SaveFile | null> {
  const meta = cache.find((m) => m.id === id);
  const blob = await readSlot(id);
  if (!meta || !blob) return null;
  return { format: 'underfoot-colony', v: 3, meta, blob };
}

/** Take in a colony file; returns its new slot, or null if the file isn't one. */
export async function importSlot(text: string): Promise<SlotMeta | null> {
  try {
    const f = JSON.parse(text) as Partial<SaveFile>;
    if (f.format !== 'underfoot-colony' || f.v !== 3 || !f.meta || typeof f.blob !== 'string') return null;
    const meta: SlotMeta = { ...f.meta, id: newSlotId() };
    await writeSlot(meta, f.blob);
    return meta;
  } catch {
    return null;
  }
}
