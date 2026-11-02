// Notification content lives here, in memory only. Nothing is saved to disk or logged.
export interface Note { id: string; appKey: string; app: string; color: string; initial: string; title: string; body: string; at: number }
export interface AppRow { key: string; name: string; color: string; enabled: boolean; seen: boolean }

export const MAX_ITEMS = 20;
const SOLO_MS = 5000;   // a lone notification stays this long in the pill
const QUEUED_MS = 3000; // ...and each one stays this long when more are waiting

/** The apps shown by default. The Electron side reports the real list (plus apps it has seen) via `seenApps`. */
export const DEFAULT_ROWS: AppRow[] = [
  { key: 'whatsapp', name: 'WhatsApp', color: '#25d366', enabled: true, seen: false },
  { key: 'discord', name: 'Discord', color: '#5865f2', enabled: true, seen: false },
  { key: 'gmail', name: 'Gmail', color: '#ea4335', enabled: true, seen: false },
  { key: 'mail', name: 'Mail', color: '#2d8cf0', enabled: true, seen: false },
  { key: 'telegram', name: 'Telegram', color: '#2aabee', enabled: true, seen: false },
  { key: 'slack', name: 'Slack', color: '#e01e5a', enabled: true, seen: false },
  { key: 'teams', name: 'Teams', color: '#6264a7', enabled: true, seen: false }
];

export const nstate = $state({
  items: [] as Note[],          // newest first, at most MAX_ITEMS
  current: null as Note | null, // what the pill is showing right now
  showUntil: 0,
  queued: 0,                    // how many are waiting behind `current`
  status: 'starting' as string, // from the Electron side: ok | missing | unsupported | error | starting
  reason: '',
  apps: DEFAULT_ROWS.map((r) => ({ ...r })) as AppRow[]
});

let queue: Note[] = [];
let timer = 0;

function arm(ms: number) {
  clearTimeout(timer);
  nstate.showUntil = Date.now() + ms;
  timer = window.setTimeout(finish, ms);
}
function showNext() {
  const n = queue.shift();
  nstate.queued = queue.length;
  if (!n) return;
  nstate.current = n;
  arm(queue.length ? QUEUED_MS : SOLO_MS);
}
function finish() {
  nstate.current = null; nstate.showUntil = 0;
  showNext();
}

/** A new notification arrived: list it, and queue it for the pill. */
export function push(n: Note) {
  if (nstate.items.some((x) => x.id === n.id)) return;
  nstate.items = [n, ...nstate.items].slice(0, MAX_ITEMS);
  queue.push(n);
  nstate.queued = queue.length;
  if (!nstate.current) showNext();
  else if (nstate.showUntil - Date.now() > QUEUED_MS) arm(QUEUED_MS); // others are waiting: don't hold the pill for 5 s
}

export function clearAll() {
  queue = []; nstate.queued = 0; nstate.items = [];
  clearTimeout(timer); nstate.current = null; nstate.showUntil = 0;
}

/** Dark text on light tiles (WhatsApp green), white on the rest. */
export function inkFor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#06210f' : '#fff';
}

export function isNote(d: unknown): d is Note & { type: 'notification' } {
  const x = d as Record<string, unknown> | null;
  return !!x && x.type === 'notification' && typeof x.id === 'string' && typeof x.title === 'string';
}
