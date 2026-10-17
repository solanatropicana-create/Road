/** Small display preferences, remembered in localStorage (and forgotten quietly where it is unavailable). */
const KEY = 'underfoot.prefs';

export interface Prefs {
  /** Interface scale: 0.9, 1, 1.15 or 1.3. */
  uiScale: number;
  /** Shake the view when a roof comes down nearby. */
  shake: boolean;
}

const prefs: Prefs = { uiScale: 1, shake: true };
try {
  const s = localStorage.getItem(KEY);
  if (s) Object.assign(prefs, JSON.parse(s) as Partial<Prefs>);
} catch {
  // defaults
}

export function getPrefs(): Readonly<Prefs> {
  return prefs;
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  prefs[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // this session only
  }
}
