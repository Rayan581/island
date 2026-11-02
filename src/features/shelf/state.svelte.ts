export interface ShelfItem { path: string; name: string; dir: boolean; size: number | null; icon: string }
export interface ShelfPayload { items: ShelfItem[]; max?: number; added?: number; duplicates?: number; missing?: number; full?: number }

/** Module-level state shared by index.ts (drag listeners, badge) and the Shelf tab. */
export const shelf = $state({
  items: [] as ShelfItem[],
  max: 24,
  /** A file drag is hovering over the island right now. */
  dragging: false,
  /** Short result message ("Added 2 files"), cleared after a few seconds. */
  flash: '',
  loaded: false
});

let flashTimer = 0;
export function setFlash(msg: string) {
  shelf.flash = msg;
  clearTimeout(flashTimer);
  if (msg) flashTimer = window.setTimeout(() => (shelf.flash = ''), 3200);
}

/** Applies the Electron side's answer and summarises what an add did. */
export function applyPayload(p: ShelfPayload | null | undefined, announce = false) {
  if (!p || !Array.isArray(p.items)) return;
  shelf.items = p.items;
  if (typeof p.max === 'number') shelf.max = p.max;
  shelf.loaded = true;
  if (!announce) return;
  const parts: string[] = [];
  if (p.added) parts.push(`Added ${p.added}`);
  if (p.duplicates) parts.push(p.added ? `${p.duplicates} already there` : 'Already on the shelf');
  if (p.full) parts.push(`${p.full} didn't fit (max ${shelf.max})`);
  if (p.missing) parts.push(`${p.missing} couldn't be read`);
  if (parts.length) setFlash(parts.join(' · '));
}

export function formatSize(n: number | null): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
