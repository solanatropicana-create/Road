/**
 * Errors the player never sees in a console: kept (the last few, across
 * sessions) so a problem report can carry them, and announced once per
 * session so the player knows to send one.
 */
export interface LoggedError {
  /** When (ms since epoch), and what. */
  t: number;
  msg: string;
  stack?: string;
}

const KEY = 'underfoot.errors';
const MAX = 20;
let log: LoggedError[] = [];
try {
  const s = localStorage.getItem(KEY);
  if (s) log = JSON.parse(s) as LoggedError[];
} catch {
  log = [];
}

export const VERSION = typeof __APP_VERSION__ === 'string' ? `${__APP_VERSION__} (${__BUILD_DATE__})` : 'dev';

function keep(e: LoggedError): void {
  // The same error every frame is one entry.
  const last = log[log.length - 1];
  if (last && last.msg === e.msg && e.t - last.t < 60000) return;
  log.push(e);
  if (log.length > MAX) log.splice(0, log.length - MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // keep in memory only
  }
}

/** Start listening; `first` is called on the first error of the session. */
export function installErrorLog(first: (msg: string) => void): void {
  let told = false;
  const note = (msg: string, stack?: string): void => {
    keep({ t: Date.now(), msg: msg.slice(0, 400), stack: stack?.slice(0, 2000) });
    if (!told) {
      told = true;
      first(msg);
    }
  };
  addEventListener('error', (e) => note(String(e.message || e.error), (e.error as Error | undefined)?.stack));
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | undefined;
    note(String(r?.message ?? r), r?.stack);
  });
}

export function errorLog(): readonly LoggedError[] {
  return log;
}
